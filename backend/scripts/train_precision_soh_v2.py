"""Reproducible nested battery holdouts for a single accumulated-loss model.

No outer battery is used for tuning or early stopping. Targets join exact
cycle+h within a battery. Saved predictions always score the ORIGINAL SoH
labels, not the nonnegative trend target used to fit the degradation model.
"""
import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import ParameterSampler
from xgboost import XGBRegressor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.feature_engineering import MODEL_FEATURES
from app.services.model_service import reconcile_predictions
from scripts.compare_training import CANDIDATES, horizon_dataset, prepare_dataset

HORIZONS = [5, 10, 20, 30]
FUTURE_FEATURES = [*MODEL_FEATURES, "horizon_cycles"]
ABLATIONS = {"all": [], "without_cycle": ["cycle"],
             "without_cutoff": ["cutoff_voltage"], "without_both": ["cycle", "cutoff_voltage"]}
SEED = 42


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def metrics(real, predicted):
    real, predicted = np.asarray(real), np.asarray(predicted)
    return {"n": len(real), "mae": float(mean_absolute_error(real, predicted)),
            "rmse": float(np.sqrt(mean_squared_error(real, predicted))),
            "r2": float(r2_score(real, predicted)) if len(real) > 1 and np.ptp(real) > 1e-12 else None,
            "mean_error": float(np.mean(predicted - real)),
            "median_absolute_error": float(np.median(np.abs(real - predicted)))}


def future_table(frame):
    parts = []
    for horizon in HORIZONS:
        part = horizon_dataset(frame, horizon)
        part["horizon_cycles"] = horizon
        part["degradation_raw"] = part.soh - part.target
        part["degradation"] = part.degradation_raw.clip(lower=0)
        parts.append(part)
    return pd.concat(parts, ignore_index=True)


def matrix(frame, future=False, ablation="all"):
    # Preserve the 29/30-column contract even for ablation exports: deliberately
    # masked columns stay missing in both training and serving.
    result = frame[FUTURE_FEATURES if future else MODEL_FEATURES].copy()
    if future:
        result[ABLATIONS[ablation]] = np.nan
    return result


def model(config, monotonic=False, early=False):
    return XGBRegressor(**config, objective="reg:squarederror", random_state=SEED,
                        n_jobs=1, tree_method="hist", eval_metric="mae",
                        **({"monotone_constraints": {"horizon_cycles": 1}} if monotonic else {}),
                        **({"early_stopping_rounds": 30} if early else {}))


def current_config(metadata):
    if metadata.get("refinement", {}).get("model_configs", {}).get("0"):
        return metadata["refinement"]["model_configs"]["0"]
    name = metadata.get("candidate_evaluation", {}).get("decisions", {}).get("0", {}).get("configuration", "original_configuration")
    return CANDIDATES[name]


def legacy_predictions(train, test, metadata):
    outputs = {}
    for horizon in [0, *HORIZONS]:
        data = horizon_dataset(train, horizon)
        config = metadata.get("refinement", {}).get("model_configs", {}).get(str(horizon))
        if config is None:
            name = metadata.get("candidate_evaluation", {}).get("decisions", {}).get(str(horizon), {}).get("configuration", "original_configuration")
            config = CANDIDATES[name]
        delta = metadata.get("forecast_target_modes", {}).get(str(horizon)) == "delta_from_current"
        fitted = model(config)
        fitted.fit(data[MODEL_FEATURES], data.target - data.soh if delta else data.target)
        outputs[horizon] = fitted.predict(test[MODEL_FEATURES]).astype(float)
        if delta:
            outputs[horizon] += outputs[0]
    return outputs


def violation_rate(frame):
    wide = frame.pivot(index=["battery_id", "current_cycle"], columns="horizon", values="predicted_future_soh")
    columns = sorted(h for h in wide.columns if h > 0)
    violations, comparisons = 0, 0
    for left, right in zip(columns, columns[1:]):
        pair = wide[[left, right]].dropna()
        violations += int((pair[right] > pair[left] + 1e-6).sum())
        comparisons += len(pair)
    return {"monotonic_violation_rate": violations / comparisons if comparisons else 0.,
            "violations": violations, "comparisons": comparisons}


class Search:
    def __init__(self, configs, incumbent):
        self.configs, self.incumbent = configs, incumbent
        self.cache = {}

    def current(self, train, config):
        key = ("current", tuple(train.battery_id.unique()), json.dumps(config, sort_keys=True))
        if key not in self.cache:
            fitted = model(config)
            fitted.fit(matrix(train), train.soh)
            self.cache[key] = fitted
        return self.cache[key]

    def select_current(self, frame):
        scores = []
        for config in [self.incumbent, *self.configs]:
            errors = []
            for battery in sorted(frame.battery_id.unique()):
                train, valid = frame[frame.battery_id != battery], frame[frame.battery_id == battery]
                fitted = model(config, early=True)
                fitted.fit(matrix(train), train.soh, eval_set=[(matrix(valid), valid.soh)], verbose=False)
                errors.append({**metrics(valid.soh, fitted.predict(matrix(valid))), "trees": fitted.best_iteration + 1})
            scores.append({"config": {**config, "n_estimators": int(np.median([e["trees"] for e in errors]))},
                           "mae": float(np.mean([e["mae"] for e in errors])),
                           "rmse": float(np.mean([e["rmse"] for e in errors]))})
        return min(scores, key=lambda s: (s["mae"], s["rmse"])), scores

    def select_future(self, frame, current_spec):
        scores = []
        for ablation in ABLATIONS:
            for monotonic in [False, True]:
                for config in self.configs:
                    folds = []
                    for battery in sorted(frame.battery_id.unique()):
                        train, valid = frame[frame.battery_id != battery], frame[frame.battery_id == battery]
                        train_future, valid_future = future_table(train), future_table(valid)
                        fitted = model(config, monotonic, early=True)
                        fitted.fit(matrix(train_future, True, ablation), train_future.degradation,
                                   eval_set=[(matrix(valid_future, True, ablation), valid_future.degradation)], verbose=False)
                        current = np.clip(self.current(train, current_spec).predict(matrix(valid_future)), 0, 100)
                        predicted = np.clip(current - np.maximum(0, fitted.predict(matrix(valid_future, True, ablation))), 0, current)
                        rows = pd.DataFrame({"battery_id": valid_future.battery_id, "current_cycle": valid_future.cycle,
                                             "horizon": valid_future.horizon_cycles, "predicted_future_soh": predicted})
                        per_horizon = [metrics(valid_future.loc[valid_future.horizon_cycles == h, "target"],
                                               predicted[valid_future.horizon_cycles.to_numpy() == h]) for h in HORIZONS]
                        folds.append({"mae": float(np.mean([m["mae"] for m in per_horizon])),
                                      "rmse": float(np.mean([m["rmse"] for m in per_horizon])),
                                      "bias": float(np.mean(predicted - valid_future.target)),
                                      "trees": fitted.best_iteration + 1, **violation_rate(rows)})
                    scores.append({"ablation": ablation, "monotonic": monotonic,
                                   "config": {**config, "n_estimators": int(np.median([f["trees"] for f in folds]))},
                                   "mae": float(np.mean([f["mae"] for f in folds])),
                                   "mae_se": float(np.std([f["mae"] for f in folds], ddof=1) / np.sqrt(len(folds))),
                                   "rmse": float(np.mean([f["rmse"] for f in folds])),
                                   "worst_battery_mae": max(f["mae"] for f in folds),
                                   "absolute_bias": float(np.mean([abs(f["bias"]) for f in folds])),
                                   "violation_rate": float(np.mean([f["monotonic_violation_rate"] for f in folds]))})
        best = min(scores, key=lambda s: s["mae"])
        # Data-driven one-standard-error set: prefer coherence and stability
        # only among configurations indistinguishable at this inner precision.
        eligible = [s for s in scores if s["mae"] <= best["mae"] + best["mae_se"]]
        chosen = min(eligible, key=lambda s: (s["violation_rate"], s["worst_battery_mae"], s["rmse"], s["absolute_bias"], s["mae"]))
        return chosen, scores


def record_rows(test, outputs, procedure):
    result = []
    for horizon in [0, *HORIZONS]:
        labels = horizon_dataset(test, horizon)
        lookup = dict(zip(test.cycle, outputs[horizon]))
        for row in labels.itertuples():
            predicted = float(lookup[row.cycle])
            result.append({"procedure": procedure, "battery_id": row.battery_id, "current_cycle": int(row.cycle),
                           "horizon": horizon, "real_future_soh": float(row.target), "predicted_future_soh": predicted,
                           "absolute_error": abs(predicted - row.target)})
    return result


def summarize_predictions(rows):
    frame = pd.DataFrame(rows)
    result = {}
    for procedure, part in frame.groupby("procedure"):
        by_battery = [{"battery_id": str(battery), "horizon": int(horizon), **metrics(group.real_future_soh, group.predicted_future_soh)}
                      for (battery, horizon), group in part.groupby(["battery_id", "horizon"])]
        horizons = []
        for horizon, group in part.groupby("horizon"):
            folds = [r for r in by_battery if r["horizon"] == horizon]
            horizons.append({"horizon": int(horizon), **metrics(group.real_future_soh, group.predicted_future_soh),
                             "macro_mae": float(np.mean([r["mae"] for r in folds])),
                             "macro_rmse": float(np.mean([r["rmse"] for r in folds])),
                             "worst_battery_mae": max(r["mae"] for r in folds)})
        result[procedure] = {"horizons": horizons, "by_battery": by_battery, **violation_rate(part)}
    return result


def production_decisions(summary, rows):
    decisions = {}
    frame = pd.DataFrame(rows)
    for horizon in HORIZONS:
        reasons = []
        selected = [r for r in summary["selected"]["by_battery"] if r["horizon"] == horizon]
        if len(selected) != 4 or any(r["n"] < 2 or r["r2"] is None for r in selected):
            reasons.append("Insufficient battery-level reference support")
        for baseline in ["persistence", "historical_mean", "legacy_raw", "legacy_served"]:
            other = {r["battery_id"]: r for r in summary[baseline]["by_battery"] if r["horizon"] == horizon}
            if any(any(r[m] >= other[r["battery_id"]][m] for m in ["mae", "rmse"]) for r in selected):
                reasons.append(f"Does not improve MAE AND RMSE on every battery versus {baseline}")
        predicted = frame[(frame.procedure == "selected") & (frame.horizon <= horizon)]
        if violation_rate(predicted)["violations"]:
            reasons.append("Temporal incoherence in the evaluated prefix")
        decisions[str(horizon)] = {"production": not reasons, "reasons": reasons}
    return decisions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("incumbent", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--candidates", type=int, default=6)
    args = parser.parse_args()
    frame = prepare_dataset(pd.read_csv(args.dataset))
    if set(frame.battery_id) != {"B0045", "B0046", "B0047", "B0048"}:
        raise ValueError("This production evaluation requires the four pilot batteries B0045–B0048")
    args.output.mkdir(parents=True, exist_ok=True)
    metadata = json.loads((args.incumbent / "metadata.json").read_text(encoding="utf-8"))
    incumbent = current_config(metadata)
    space = {"n_estimators": [300, 500, 700, 900], "learning_rate": [.01, .02, .03, .05],
             "max_depth": [2, 3, 4, 5], "min_child_weight": [1, 3, 5, 8],
             "subsample": [.7, .8, .9, 1.], "colsample_bytree": [.7, .8, .9, 1.],
             "reg_alpha": [0., .01, .05, .1], "reg_lambda": [.5, 1., 1.5, 2., 5.]}
    configs = list(ParameterSampler(space, n_iter=args.candidates, random_state=SEED))
    search = Search(configs, incumbent)
    rows, selections = [], []
    folds = []
    for battery in sorted(frame.battery_id.unique()):
        print(f"Outer battery {battery}: current-model search", flush=True)
        train, test = frame[frame.battery_id != battery], frame[frame.battery_id == battery]
        current_choice, current_scores = search.select_current(train)
        old_current = np.clip(search.current(train, incumbent).predict(matrix(test)), 0, 100)
        new_current = np.clip(search.current(train, current_choice["config"]).predict(matrix(test)), 0, 100)
        folds.append((battery, train, test, current_choice, old_current, new_current))
        for label, predicted in [("current_incumbent", old_current), ("current_optimized", new_current)]:
            rows.extend(record_rows(test, {h: predicted for h in [0, *HORIZONS]}, label)[:len(test)])
        selections.append({"test_battery": battery, "current": current_choice, "current_search": current_scores})
    # No changes to the incumbent current estimator unless both macro metrics
    # and every battery improve in the outer comparison.
    current_summary = summarize_predictions(rows)
    old_scores = current_summary["current_incumbent"]["by_battery"]
    new_scores = current_summary["current_optimized"]["by_battery"]
    optimize_current = all(n[m] < o[m] for n, o in zip(new_scores, old_scores) for m in ["mae", "rmse"])
    rows = []
    for index, (battery, train, test, current_choice, old_current, new_current) in enumerate(folds):
        print(f"Outer battery {battery}: future search, 4 ablations x 2 constraints", flush=True)
        current_spec = current_choice["config"] if optimize_current else incumbent
        chosen, scores = search.select_future(train, current_spec)
        selections[index].update({"future": chosen, "future_search": scores})
        current = new_current if optimize_current else old_current
        training = future_table(train)
        fitted = model(chosen["config"], chosen["monotonic"])
        fitted.fit(matrix(training, True, chosen["ablation"]), training.degradation)
        outputs = {0: current}
        for horizon in HORIZONS:
            inputs = test.assign(horizon_cycles=horizon)
            degradation = np.maximum(0, fitted.predict(matrix(inputs, True, chosen["ablation"])))
            outputs[horizon] = np.clip(current - degradation, 0, current)
        rows.extend(record_rows(test, outputs, "selected"))
        for ablation in ABLATIONS:
            for monotonic in [False, True]:
                variant = min((s for s in scores if s["ablation"] == ablation and s["monotonic"] == monotonic), key=lambda s: (s["mae"], s["rmse"]))
                variant_model = model(variant["config"], monotonic)
                variant_model.fit(matrix(training, True, ablation), training.degradation)
                variant_outputs = {0: current}
                for h in HORIZONS:
                    loss = np.maximum(0, variant_model.predict(matrix(test.assign(horizon_cycles=h), True, ablation)))
                    variant_outputs[h] = np.clip(current - loss, 0, current)
                rows.extend(record_rows(test, variant_outputs, f"ablation_{ablation}_{'monotonic' if monotonic else 'free'}"))
        legacy = legacy_predictions(train, test, metadata)
        rows.extend(record_rows(test, legacy, "legacy_raw"))
        served = np.array([list(reconcile_predictions({h: float(legacy[h][i]) for h in [0, *HORIZONS]}).values()) for i in range(len(test))])
        rows.extend(record_rows(test, {h: served[:, i] for i, h in enumerate([0, *HORIZONS])}, "legacy_served"))
        rows.extend(record_rows(test, {h: current for h in [0, *HORIZONS]}, "persistence"))
        means = training.groupby("horizon_cycles").degradation.mean()
        rows.extend(record_rows(test, {0: current, **{h: np.clip(current - means[h], 0, current) for h in HORIZONS}}, "historical_mean"))
        dump(args.output / "progress.json", {"completed_outer_folds": index + 1, "selections": selections[:index + 1]})
    summary = summarize_predictions(rows)
    decisions = production_decisions(summary, rows)
    print("Full-cohort grouped search for final refit", flush=True)
    final_current, final_current_scores = search.select_current(frame)
    current_spec = final_current["config"] if optimize_current else incumbent
    chosen, final_scores = search.select_future(frame, current_spec)
    fitted = model(chosen["config"], chosen["monotonic"])
    training = future_table(frame)
    fitted.fit(matrix(training, True, chosen["ablation"]), training.degradation)
    fitted.get_booster().set_attr(prediction_target="soh_degradation", feature_contract="future_features.json")
    future_name = "xgboost_soh_degradation_monotonic.json" if chosen["monotonic"] else "xgboost_soh_degradation.json"
    fitted.save_model(args.output / future_name)
    if optimize_current:
        search.current(frame, current_spec).save_model(args.output / "xgboost_soh_current.json")
    else:
        shutil.copy2(args.incumbent / "xgboost_soh_current.json", args.output / "xgboost_soh_current.json")
    production = [h for h in HORIZONS if decisions[str(h)]["production"]]
    if not chosen["monotonic"]:
        # Unconstrained fits must pass a full-cohort grid check as well.
        grid = np.column_stack([fitted.predict(matrix(frame.assign(horizon_cycles=h), True, chosen["ablation"])) for h in HORIZONS])
        if (np.diff(np.maximum(0, grid), axis=1) < -1e-6).any():
            production = []
    manifest = {"schema_version": 2, "current": {"file": "xgboost_soh_current.json", "horizon": 0},
                "future": {"file": future_name, "target": "soh_degradation", "monotonic": chosen["monotonic"],
                           "masked_features": ABLATIONS[chosen["ablation"]]},
                "production_horizons": production, "research_horizons": [h for h in HORIZONS if h not in production]}
    report = {"protocol": "Nested Leave-One-Battery-Out; inner group validation and early stopping only; outer labels never used to tune hyperparameters.",
              "selection_rule": "One inner MAE standard error set; lowest violation rate, worst-battery MAE, RMSE, absolute bias, MAE. No absolute pp cutoffs.",
              "promotion_rule": "Strictly improve MAE AND RMSE versus both baselines AND legacy raw AND legacy served on EVERY battery; four supported folds; zero temporal violations. Pilot gate, not EV-wide certification.",
              "scope": "Previously studied four-cell cohort; no untouched external EV validation; cycle rows are correlated, not independent samples.",
              "dataset_sha256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
              "current_replaced": optimize_current, "current_comparison": current_summary,
              "summary": summary, "production_decisions": decisions, "selections": selections,
              "final_selection": chosen, "final_search": final_scores, "final_current_search": final_current_scores,
              "production_horizons": production,
              "feature_importance_gain": dict(zip(FUTURE_FEATURES, map(float, fitted.feature_importances_))),
              "target_recoveries": {"n": int((training.degradation_raw < 0).sum()), "total": len(training)},
              "hyperparameter_space": space, "sampled_configs": configs, "seed": SEED}
    dump(args.output / "manifest.json", manifest)
    dump(args.output / "features.json", MODEL_FEATURES)
    dump(args.output / "future_features.json", FUTURE_FEATURES)
    dump(args.output / "validation_metrics.json", report)
    pd.DataFrame(rows).to_csv(args.output / "validation_predictions.csv", index=False)
    dump(args.output / "metadata.json", {"model_family": "XGBoost SoH v2", "model_version": "precision_soh_v2",
         "trained_at_utc": datetime.now(timezone.utc).isoformat(), "training_batteries": sorted(frame.battery_id.unique()),
         "features": MODEL_FEATURES, "future_features": FUTURE_FEATURES, "window_seconds": 300,
         "soh_definition": metadata["soh_definition"], "future_target": "max(0, current real SoH - real SoH at exact cycle+h)",
         "current_hyperparameters": current_spec, "future_selection": chosen, "xgboost_version": xgboost.__version__,
         "horizons_evaluated": HORIZONS, "production_horizons": production, "validation_method": report["protocol"],
         "validation_summary": summary["selected"], "current_replaced": optimize_current,
         "training_rows": len(frame), "future_training_rows": len(training),
         "validation_metrics_file": "validation_metrics.json", "dataset_sha256": report["dataset_sha256"],
         "model_description": metadata.get("model_description", "Celdas NASA B0045-B0048, 4 °C, 1 A"),
         "model_id": metadata.get("model_id", "nasa_cells_45_48")})
    for name in ["domain_profile.json", "reference_coverage.json"]:
        if (args.incumbent / name).exists():
            shutil.copy2(args.incumbent / name, args.output / name)
    print(json.dumps({"production_horizons": production, "selected": chosen,
                      "current_replaced": optimize_current, "report": str(args.output / "validation_metrics.json")}), flush=True)


if __name__ == "__main__":
    main()
