"""Train real telemetry-only models with nested, battery-grouped selection.

Outer held-out batteries never tune features, hyperparameters or early stopping.
Production stays at 300 s; other windows are explicitly experimental reports.
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.io as sio
import sklearn
import xgboost
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, median_absolute_error, r2_score
from xgboost import XGBRegressor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.feature_engineering import TELEMETRY_FEATURE_SETS, TELEMETRY_ALL_FEATURES, MODEL_FEATURES, extract_telemetry_features
from scripts.prepare_nasa_training import extract_battery_features, CUTOFF_MAP
from scripts.train_precision_soh_v2 import current_config

ROOT = Path(__file__).resolve().parents[2]
HORIZONS = [5, 10, 20, 30]
WINDOWS = [60, 120, 180, 300, 600]
COHORTS = {"nasa_cold_1a": ("nasa_45_48", ["B0045", "B0046", "B0047", "B0048"]),
           "nasa_room_2a": ("nasa_room_2a", ["B0005", "B0006", "B0007", "B0018"])}
CONFIGS = [
    dict(n_estimators=350, learning_rate=.035, max_depth=2, min_child_weight=5, subsample=.85, colsample_bytree=.9, reg_alpha=.05, reg_lambda=5., gamma=0.),
    dict(n_estimators=450, learning_rate=.025, max_depth=3, min_child_weight=8, subsample=.8, colsample_bytree=.85, reg_alpha=.1, reg_lambda=10., gamma=.05),
    dict(n_estimators=300, learning_rate=.05, max_depth=2, min_child_weight=3, subsample=1., colsample_bytree=1., reg_alpha=.01, reg_lambda=2., gamma=.01),
]


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def metrics(y, prediction):
    y, prediction = np.asarray(y), np.asarray(prediction)
    return dict(n_samples=len(y), mae=float(mean_absolute_error(y, prediction)),
                rmse=float(np.sqrt(mean_squared_error(y, prediction))), r2=float(r2_score(y, prediction)) if len(y) > 1 and np.ptp(y) > 1e-10 else None,
                median_absolute_error=float(median_absolute_error(y, prediction)), mean_error=float(np.mean(prediction - y)))


def model(config, monotonic=False, early=False):
    return XGBRegressor(**config, objective="reg:squarederror", random_state=42, n_jobs=1,
        tree_method="hist", eval_metric="mae", **({"monotone_constraints": {"horizon_cycles": 1}} if monotonic else {}),
        **({"early_stopping_rounds": 25} if early else {}))


def prepare(cohort):
    directory, batteries = COHORTS[cohort]
    records, audit, legacy = [], [], []
    CUTOFF_MAP.update({"B0005": 2.7, "B0006": 2.5, "B0007": 2.2, "B0018": 2.5})
    for battery in batteries:
        source = ROOT / "data/raw" / directory / f"{battery}.mat"
        if not source.is_file():
            raise FileNotFoundError(f"Falta el dataset original: {source}")
        raw = sio.loadmat(source, squeeze_me=True, struct_as_record=False)[battery]
        operations = [op for op in np.atleast_1d(raw.cycle) if str(op.type).strip().lower() == "discharge"]
        capacities = [float(np.asarray(op.data.Capacity).ravel()[0]) for op in operations]
        valid = [value for value in capacities if np.isfinite(value) and value > 0]
        if len(valid) < 5:
            raise ValueError(f"{battery}: menos de cinco capacidades válidas")
        reference = float(np.median(valid[:5]))
        ambient, currents, counts, rejected = [], [], [], []
        for cycle, (op, capacity) in enumerate(zip(operations, capacities), 1):
            if not np.isfinite(capacity) or capacity <= 0:
                rejected.append({"cycle": cycle, "reason": "invalid_capacity_target"}); continue
            arrays = [np.asarray(getattr(op.data, name), dtype=float).ravel() for name in
                      ["Time", "Voltage_measured", "Current_measured", "Temperature_measured"]]
            if len({len(x) for x in arrays}) != 1:
                rejected.append({"cycle": cycle, "reason": "unequal_signal_lengths"}); continue
            values = np.column_stack(arrays)
            values = values[values[:, 0] <= max(WINDOWS)]
            samples = [dict(zip(("time_s", "voltage_v", "current_a", "temperature_c"), map(float, row))) for row in values]
            try:
                for window in WINDOWS:
                    features, quality = extract_telemetry_features(samples, window, minimum_samples=2)
                    records.append(dict(battery_id=battery, cycle=cycle, capacity=capacity, q_ref=reference,
                                        soh=capacity / reference * 100, window=window, n_samples=quality["samples_used"],
                                        duration=quality["available_seconds"], max_gap=quality["maximum_gap_seconds"], **features))
            except ValueError as error:
                rejected.append({"cycle": cycle, "reason": str(error)})
            ambient.append(float(op.ambient_temperature))
            currents.append(float(np.median(arrays[2][(arrays[0] >= 0) & (arrays[0] <= 300)])))
            counts.append(int(np.sum((arrays[0] >= 0) & (arrays[0] <= 300))))
        historical = extract_battery_features(str(source))
        historical["soh"] = historical.capacity / reference * 100
        legacy.append(historical)
        audit.append(dict(battery_id=battery, source=str(source.relative_to(ROOT)).replace("\\", "/"), sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
            discharge_cycles=len(operations), valid_capacity_cycles=len(valid), reference_capacity=reference,
            ambient_temperatures=sorted(set(ambient)), discharge_current_median=float(np.median(currents)),
            cutoff_voltage=CUTOFF_MAP[battery], samples_300s_min=min(counts), samples_300s_max=max(counts), rejected=rejected))
    return pd.DataFrame(records), pd.concat(legacy, ignore_index=True), audit


def future_table(frame):
    parts = []
    for horizon in HORIZONS:
        labels = frame[["battery_id", "cycle", "soh"]].rename(columns={"soh": "future_soh"}).copy()
        labels["cycle"] -= horizon
        part = frame.merge(labels, on=["battery_id", "cycle"], validate="one_to_one")
        part["horizon_cycles"] = horizon
        part["degradation_raw"] = part.soh - part.future_soh
        part["degradation"] = part.degradation_raw.clip(lower=0)
        parts.append(part)
    return pd.concat(parts, ignore_index=True)


def legacy_holdout(legacy, battery, cycles, metadata, manifest):
    train = legacy[(legacy.battery_id != battery) & np.isfinite(legacy.soh) & (legacy.soh > 0)].copy()
    test = legacy[legacy.battery_id == battery].set_index("cycle", drop=False).loc[cycles]
    config = metadata.get("current_hyperparameters") or current_config(metadata)
    current_model = model(config)
    current_model.fit(train[MODEL_FEATURES], train.soh)
    current = np.clip(current_model.predict(test[MODEL_FEATURES]), 0, 100)
    forecasts = {}
    if manifest.get("schema_version") == 2:
        future = future_table(train)
        specification = metadata["future_selection"]
        columns = MODEL_FEATURES + ["horizon_cycles"]
        x = future[columns].copy()
        masked = {"without_cycle": ["cycle"], "without_cutoff": ["cutoff_voltage"], "without_both": ["cycle", "cutoff_voltage"]}.get(specification["ablation"], [])
        x[masked] = np.nan
        fitted = model(specification["config"], specification["monotonic"])
        fitted.fit(x, future.degradation)
        for horizon in HORIZONS:
            inputs = test[MODEL_FEATURES].copy(); inputs["horizon_cycles"] = horizon; inputs[masked] = np.nan
            forecasts[horizon] = np.clip(current - np.maximum(0, fitted.predict(inputs[columns])), 0, current)
    else:
        shifted_base = train[["battery_id", "cycle", "soh"]].rename(columns={"soh": "future_soh"})
        for horizon in HORIZONS:
            shifted = shifted_base.copy(); shifted["cycle"] -= horizon
            future = train.merge(shifted, on=["battery_id", "cycle"], validate="one_to_one")
            delta = metadata.get("forecast_target_modes", {}).get(str(horizon)) == "delta_from_current"
            target = future.future_soh - future.soh if delta else future.future_soh
            fitted = model(metadata.get("refinement", {}).get("model_configs", {}).get(str(horizon), config))
            fitted.fit(future[MODEL_FEATURES], target)
            forecasts[horizon] = np.clip(fitted.predict(test[MODEL_FEATURES]) + (current if delta else 0), 0, 100)
    return current, forecasts


class Search:
    def __init__(self, frame):
        self.frame = frame
        self.current_cache = {}
        self.fit_cache = {}

    def current(self, batteries):
        key = tuple(sorted(batteries))
        if key in self.current_cache:
            return self.current_cache[key]
        frame = self.frame[self.frame.battery_id.isin(key)]
        scores = []
        for feature_set, columns in TELEMETRY_FEATURE_SETS.items():
            for config in CONFIGS:
                folds = []
                for battery in key:
                    train, valid = frame[frame.battery_id != battery], frame[frame.battery_id == battery]
                    fitted = model(config, early=True)
                    fitted.fit(train[columns], train.soh, eval_set=[(valid[columns], valid.soh)], verbose=False)
                    folds.append({"validation_battery": battery, "train_batteries": sorted(train.battery_id.unique()), **metrics(valid.soh, fitted.predict(valid[columns])), "trees": int(fitted.best_iteration + 1)})
                scores.append(dict(feature_set=feature_set, config={**config, "n_estimators": int(np.median([fold["trees"] for fold in folds]))},
                                   mae=float(np.mean([fold["mae"] for fold in folds])), rmse=float(np.mean([fold["rmse"] for fold in folds])), folds=folds))
        choice = min(scores, key=lambda score: (score["mae"], score["rmse"], len(TELEMETRY_FEATURE_SETS[score["feature_set"]])))
        self.current_cache[key] = (choice, scores)
        return choice, scores

    def fit_current(self, batteries, spec=None):
        key = tuple(sorted(batteries))
        spec = spec or self.current(key)[0]
        cache_key = (key, json.dumps(spec["config"], sort_keys=True), spec["feature_set"])
        if cache_key not in self.fit_cache:
            train = self.frame[self.frame.battery_id.isin(key)]
            fitted = model(spec["config"])
            fitted.fit(train[TELEMETRY_FEATURE_SETS[spec["feature_set"]]], train.soh)
            self.fit_cache[cache_key] = fitted
        return self.fit_cache[cache_key]

    def future(self, batteries, columns):
        frame = self.frame[self.frame.battery_id.isin(batteries)]
        scores = []
        for monotonic in (False, True):
            for config in CONFIGS:
                folds = []
                for battery in sorted(batteries):
                    train, valid = frame[frame.battery_id != battery], frame[frame.battery_id == battery]
                    tf, vf = future_table(train), future_table(valid)
                    fitted = model(config, monotonic, early=True)
                    fitted.fit(tf[columns + ["horizon_cycles"]], tf.degradation,
                               eval_set=[(vf[columns + ["horizon_cycles"]], vf.degradation)], verbose=False)
                    current_spec = self.current(train.battery_id.unique())[0]
                    current = np.clip(self.fit_current(train.battery_id.unique(), current_spec).predict(vf[TELEMETRY_FEATURE_SETS[current_spec["feature_set"]]]), 0, 120)
                    prediction = np.clip(current - np.maximum(0, fitted.predict(vf[columns + ["horizon_cycles"]])), 0, current)
                    folds.append({"validation_battery": battery, "train_batteries": sorted(train.battery_id.unique()), **metrics(vf.future_soh, prediction), "trees": int(fitted.best_iteration + 1)})
                scores.append(dict(monotonic=monotonic, config={**config, "n_estimators": int(np.median([fold["trees"] for fold in folds]))},
                                   mae=float(np.mean([fold["mae"] for fold in folds])), rmse=float(np.mean([fold["rmse"] for fold in folds])), folds=folds))
        best = min(scores, key=lambda score: (score["mae"], score["rmse"]))
        eligible = [score for score in scores if score["mae"] <= best["mae"] * 1.01]
        return min(eligible, key=lambda score: (not score["monotonic"], score["rmse"], score["mae"])), scores


def summarize(frame):
    result = {}
    for procedure, part in frame.groupby("procedure"):
        folds = [{"battery_id": str(battery), "horizon": int(horizon), **metrics(group.real, group.predicted)}
                 for (battery, horizon), group in part.groupby(["battery_id", "horizon"])]
        summaries = []
        for horizon, group in part.groupby("horizon"):
            by_battery = [fold for fold in folds if fold["horizon"] == horizon]
            summaries.append({"horizon": int(horizon), **metrics(group.real, group.predicted),
                              "macro_mae": float(np.mean([fold["mae"] for fold in by_battery])),
                              "macro_rmse": float(np.mean([fold["rmse"] for fold in by_battery]))})
        selected = part[part.horizon > 0].pivot(index=["battery_id", "cycle"], columns="horizon", values="predicted").sort_index(axis=1)
        comparisons = np.diff(selected.to_numpy(), axis=1)
        finite = np.isfinite(comparisons)
        result[str(procedure)] = dict(horizons=summaries, by_battery=folds,
            monotonic_violation_rate=float(np.sum(comparisons[finite] > 1e-6) / np.sum(finite)) if np.sum(finite) else 0.)
    return result


def train_cohort(cohort, output):
    output.mkdir(parents=True, exist_ok=True)
    all_windows, legacy, audit = prepare(cohort)
    dump(output / "dataset_audit.json", {"protocols_pooled": False, "cohort": cohort, "batteries": audit})
    frame = all_windows[all_windows.window == 300].copy()
    search = Search(frame)
    batteries = sorted(frame.battery_id.unique())
    records, selections, window_scores = [], [], []
    old_directory = ROOT / "backend" / ("model_artifacts" if cohort == "nasa_cold_1a" else "model_families/nasa_room_2a_short_v2")
    old_metadata = json.loads((old_directory / "metadata.json").read_text(encoding="utf-8"))
    old_manifest = json.loads((old_directory / "manifest.json").read_text(encoding="utf-8"))
    for battery in batteries:
        print(f"{cohort}: outer holdout {battery}", flush=True)
        train, test = frame[frame.battery_id != battery], frame[frame.battery_id == battery]
        choice, candidates = search.current(train.battery_id.unique())
        columns = TELEMETRY_FEATURE_SETS[choice["feature_set"]]
        fitted = search.fit_current(train.battery_id.unique(), choice)
        current = np.clip(fitted.predict(test[columns]).astype(float), 0, 120)
        future_choice, future_candidates = search.future(train.battery_id.unique(), columns)
        train_future = future_table(train)
        future = model(future_choice["config"], future_choice["monotonic"])
        future.fit(train_future[columns + ["horizon_cycles"]], train_future.degradation)
        old_prediction, old_forecasts = legacy_holdout(legacy, battery, test.cycle, old_metadata, old_manifest)
        selections.append(dict(test_battery=battery, train_batteries=sorted(train.battery_id.unique()),
            selected_current=choice, current_candidates=candidates, selected_future=future_choice, future_candidates=future_candidates,
            train_current_metrics=metrics(train.soh, fitted.predict(train[columns])), validation_current_metrics=metrics(test.soh, current)))
        labels = future_table(test)
        current_lookup = dict(zip(test.cycle, current))
        linear = LinearRegression().fit(train_future[["horizon_cycles"]], train_future.degradation)
        for row, predicted, old in zip(test.itertuples(), current, old_prediction):
            for procedure, value in [("selected", predicted), ("mean_baseline", train.soh.mean()), ("legacy_context", old)]:
                records.append(dict(procedure=procedure, battery_id=battery, cycle=int(row.cycle), horizon=0, current_soh_real=float(row.soh), real=float(row.soh), predicted=float(value)))
        for horizon in HORIZONS:
            part = labels[labels.horizon_cycles == horizon].copy()
            base = np.array([current_lookup[cycle] for cycle in part.cycle])
            loss = np.maximum(0, future.predict(part[columns + ["horizon_cycles"]]))
            outputs = {"selected": np.clip(base - loss, 0, base), "persistence": base,
                "historical_mean": np.clip(base - train_future.loc[train_future.horizon_cycles == horizon, "degradation"].mean(), 0, base),
                "historical_linear": np.clip(base - np.maximum(0, linear.predict(part[["horizon_cycles"]])), 0, base),
                "future_training_mean": np.full(len(part), train_future.loc[train_future.horizon_cycles == horizon, "future_soh"].mean()),
                "oracle_persistence": part.soh.to_numpy()}
            # Honest legacy comparison: refit the historical independent forecast configuration only on training batteries.
            lookup = dict(zip(test.cycle, old_forecasts[horizon]))
            outputs["legacy_future_research"] = np.array([lookup[cycle] for cycle in part.cycle])
            for procedure, predictions in outputs.items():
                for row, predicted in zip(part.itertuples(), predictions):
                    records.append(dict(procedure=procedure, battery_id=battery, cycle=int(row.cycle), horizon=horizon,
                                        current_soh_real=float(row.soh), real=float(row.future_soh), predicted=float(predicted)))
        for window in WINDOWS:
            experiment = all_windows[all_windows.window == window]
            tr, te = experiment[experiment.battery_id != battery], experiment[experiment.battery_id == battery]
            window_model = model(choice["config"]); window_model.fit(tr[columns], tr.soh)
            window_scores.append(dict(battery_id=battery, window_seconds=window, minimum_samples=int(te.n_samples.min()),
                                      **metrics(te.soh, np.clip(window_model.predict(te[columns]), 0, 120))))
        dump(output / "selection_audit.json", selections)
        print(f"{battery}: current MAE={metrics(test.soh, current)['mae']:.3f}, features={choice['feature_set']}", flush=True)
    predictions = pd.DataFrame(records)
    summary = summarize(predictions)
    current_score = next(item for item in summary["selected"]["horizons"] if item["horizon"] == 0)
    current_baseline = summary["mean_baseline"]["horizons"][0]
    current_approved = current_score["macro_mae"] < current_baseline["macro_mae"] and current_score["macro_rmse"] < current_baseline["macro_rmse"]
    production = []
    decisions = {}
    for horizon in HORIZONS:
        score = next(item for item in summary["selected"]["horizons"] if item["horizon"] == horizon)
        reasons = []
        if not current_approved: reasons.append("Current SoH does not improve the training-mean baseline")
        if score["r2"] is None or score["r2"] <= 0: reasons.append("Held-out pooled R2 is not positive")
        folds = [item for item in summary["selected"]["by_battery"] if item["horizon"] == horizon]
        if len(folds) < 4 or any(item["n_samples"] < 10 for item in folds): reasons.append("Insufficient battery-level samples")
        for baseline in ("persistence", "historical_mean", "historical_linear", "future_training_mean"):
            reference = next(item for item in summary[baseline]["horizons"] if item["horizon"] == horizon)
            if score["macro_mae"] >= reference["macro_mae"] * .98: reasons.append(f"Does not improve macro MAE by 2% versus {baseline}")
        wins = sum(item["mae"] < next(other["mae"] for other in summary["persistence"]["by_battery"] if other["horizon"] == horizon and other["battery_id"] == item["battery_id"]) for item in folds)
        if wins < 3: reasons.append("Does not improve persistence on at least three batteries")
        if summary["selected"]["monotonic_violation_rate"] > 0: reasons.append("Held-out forecasts include temporal reversals")
        decisions[str(horizon)] = {"production": not reasons, "reasons": reasons}
        if not reasons: production.append(horizon)
    final_current, final_candidates = search.current(batteries)
    columns = TELEMETRY_FEATURE_SETS[final_current["feature_set"]]
    final_future, final_future_candidates = search.future(batteries, columns)
    if not final_future["monotonic"]:
        production = []
        for decision in decisions.values(): decision["production"] = False; decision["reasons"].append("Final unconstrained future model remains research-only")
    current_model = search.fit_current(batteries, final_current)
    future_data = future_table(frame)
    future_model = model(final_future["config"], final_future["monotonic"])
    future_model.fit(future_data[columns + ["horizon_cycles"]], future_data.degradation)
    current_model.get_booster().set_attr(prediction_target="soh_percent", feature_contract="telemetry_only_v4")
    future_model.get_booster().set_attr(prediction_target="soh_degradation", feature_contract="telemetry_only_v4")
    current_model.save_model(output / "xgboost_soh_current.json")
    future_model.save_model(output / "xgboost_soh_degradation.json")
    dump(output / "features.json", columns)
    dump(output / "future_features.json", columns + ["horizon_cycles"])
    pd.DataFrame({"feature": columns, "importance": current_model.feature_importances_}).sort_values("importance", ascending=False).to_csv(output / "feature_importance.csv", index=False)
    pd.DataFrame({"feature": columns + ["horizon_cycles"], "importance": future_model.feature_importances_}).sort_values("importance", ascending=False).to_csv(output / "future_feature_importance.csv", index=False)
    predictions["absolute_error"] = abs(predictions.predicted - predictions.real)
    predictions.rename(columns={"real": "future_soh_real", "predicted": "future_soh_pred"}).to_csv(output / "validation_predictions.csv", index=False)
    dump(output / "window_comparison.json", {"production_window_seconds": 300, "method": "Outer battery holdouts; 300s-selected training-only feature/config per outer fold; exploratory comparison, no window selection on test.", "folds": window_scores})
    research = [horizon for horizon in HORIZONS if horizon not in production]
    dump(output / "validation_metrics.json", {"method": "Nested Leave-One-Battery-Out", "summary": summary, "production_horizons": production,
         "current_production": {"approved": current_approved, "rule": "Held-out macro MAE and RMSE both improve the training-mean baseline"},
         "research_horizons": research, "production_decisions": decisions,
         "thresholds_fixed_before_fitting": {"macro_mae_improvement_percent": 2, "minimum_battery_wins": 3, "minimum_fold_samples": 10, "maximum_monotonic_violation_rate": 0}})
    dump(output / "metadata.json", {"trained_at": datetime.now(timezone.utc).isoformat(), "model_family": "XGBoost telemetry v4", "model_version": "4.0", "model_id": cohort, "cohort": cohort,
         "batteries": batteries, "soh_definition": "capacity / median(first 5 valid capacities per battery) * 100",
         "window_seconds": 300, "feature_set": final_current["feature_set"], "features": columns,
         "current_config": final_current["config"], "future_config": final_future["config"], "future_monotonic": final_future["monotonic"],
         "xgboost_version": xgboost.__version__, "sklearn_version": sklearn.__version__, "production_horizons": production,
         "final_current_search": final_candidates, "final_future_search": final_future_candidates,
         "evaluation_limitation": "Four cells per protocol. Nested held-out evaluation of the procedure, not an independent external validation. Legacy configuration previously studied on these batteries."})
    # Quantitative support bounds derive from the complete final fitting cohort, never from user input.
    dump(output / "domain_profile.json", {"minimum_window_samples": int(frame.n_samples.min()), "minimum_available_seconds": float(frame.duration.min()),
         "maximum_gap_seconds": float(frame.max_gap.max()),
         "ranges": {column: {"min": float(frame[column].min()), "max": float(frame[column].max())} for column in TELEMETRY_ALL_FEATURES},
         "routing_features": ["current_mean", "temperature_start"], "measurement_level": "cell", "chemistry": "li-ion"})
    dump(output / "leakage_audit.json", {"inputs": columns, "forbidden_inputs_present": sorted(set(columns) & {"capacity", "soh", "cycle", "ambient_temperature", "cutoff_voltage", "q_ref", "future_soh", "degradation"}),
         "outer_test_used_for_tuning": False, "random_row_split": False, "early_stopping": "Inner battery holdouts only", "window_end_seconds": 300,
         "target_reference": "First five valid capacities; label-only; never passed as predictor", "future_join": "exact battery_id and cycle+h; no cross-battery joins", "protocols_pooled": False})
    files = ["xgboost_soh_current.json", "xgboost_soh_degradation.json", "features.json", "future_features.json", "domain_profile.json", "validation_metrics.json"]
    dump(output / "manifest.json", {"version": "4.0", "model_family": "XGBoost", "input_type": "telemetry_only", "window_seconds": 300,
         "current_approved": current_approved,
         "production_horizons": production, "research_horizons": research, "future_monotonic": final_future["monotonic"],
         "artifact_sha256": {name: hashlib.sha256((output / name).read_bytes()).hexdigest() for name in files}})
    print(f"{cohort}: finished; production_horizons={production}; feature_set={final_current['feature_set']}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "backend/model_artifacts_v4")
    parser.add_argument("--cohort", choices=list(COHORTS))
    args = parser.parse_args()
    for cohort in ([args.cohort] if args.cohort else COHORTS):
        train_cohort(cohort, args.output / cohort)


if __name__ == "__main__":
    main()
