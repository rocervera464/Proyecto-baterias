"""Compare direct and change-in-SoH models without scoring training rows.

Nested battery holdouts select a complete five-model package. A separate,
purged last-half-of-cycles check measures temporal behavior. These are pilot
comparisons on existing data, not an untouched external validation.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor

from compare_training import CANDIDATES, MODEL_FEATURES, horizon_dataset, prepare_dataset
from app.services.model_service import ModelService

HORIZONS = (0, 5, 10, 20, 30)
SMOOTH = {**CANDIDATES["regularized"], "max_depth": 1, "min_child_weight": 5}
PACKAGES = ("baseline", "regularized", "delta_regularized", "delta_baseline", "delta_smooth")


def baseline_config(metadata, horizon):
    refined = metadata.get("refinement", {}).get("model_configs", {})
    if str(horizon) in refined:
        return refined[str(horizon)]
    decisions = metadata.get("decisions", metadata.get("candidate_evaluation", {}).get("decisions", {}))
    return CANDIDATES[decisions[str(horizon)]["configuration"]]


def specification(package, horizon, metadata):
    if package == "delta_short":
        return (SMOOTH, True) if horizon in (5, 10) else (baseline_config(metadata, horizon), metadata.get("forecast_target_modes", {}).get(str(horizon)) == "delta_from_current")
    if package == "baseline" or (horizon == 0 and package in {"delta_baseline", "delta_smooth"}):
        return baseline_config(metadata, horizon), metadata.get("forecast_target_modes", {}).get(str(horizon)) == "delta_from_current"
    return (SMOOTH if package == "delta_smooth" and horizon else CANDIDATES["regularized"]), horizon > 0 and package.startswith("delta_")


class Experiment:
    def __init__(self, metadata):
        self.metadata = metadata
        self.cache = {}

    def predict(self, train, test, package):
        outputs = {}
        for horizon in HORIZONS:
            config, delta = specification(package, horizon, self.metadata)
            data = horizon_dataset(train, horizon)
            if data.empty:
                raise ValueError(f"No training targets for horizon {horizon}")
            key = (tuple(zip(train.battery_id, train.cycle)), horizon, json.dumps(config, sort_keys=True), delta)
            if key not in self.cache:
                model = XGBRegressor(**config, objective="reg:squarederror", random_state=42, n_jobs=1)
                target = data.target - data.soh if delta else data.target
                model.fit(data[MODEL_FEATURES], target)
                self.cache[key] = model
            values = self.cache[key].predict(test[MODEL_FEATURES]).astype(float)
            outputs[horizon] = values + outputs[0] if delta else values
        return outputs

    def select(self, frame):
        scores = {}
        for package in PACKAGES:
            folds = []
            for battery in sorted(frame.battery_id.unique()):
                train = frame[frame.battery_id != battery]
                test = frame[frame.battery_id == battery]
                records = scored_rows(test, test, self.predict(train, test, package))
                folds.extend(metrics(pd.DataFrame(records), package))
            scores[package] = float(np.mean([fold["mae"] for fold in folds]))
            print(f"  {package}: inner MAE {scores[package]:.4f}", flush=True)
        return min(scores, key=scores.get), scores


def reconcile_batch(outputs):
    """Equal-weight PAVA, equivalent to production isotonic reconciliation.

    A small four-value implementation avoids sklearn estimator setup for each
    row of the repeated validation runs. Equivalence is tested separately.
    """
    raw = np.column_stack([outputs[h] for h in HORIZONS]).astype(float)
    if not np.isfinite(raw).all():
        raise ValueError("Nonfinite model outputs")
    result = np.empty_like(raw)
    result[:, 0] = np.clip(raw[:, 0], 0, 100)
    for index, values in enumerate(raw[:, 1:]):
        blocks = []
        for value in values:
            blocks.append([float(value), 1])
            while len(blocks) >= 2 and blocks[-2][0] / blocks[-2][1] < blocks[-1][0] / blocks[-1][1]:
                total, count = blocks.pop()
                blocks[-1][0] += total
                blocks[-1][1] += count
        result[index, 1:] = np.clip([total / count for total, count in blocks for _ in range(count)], 0, result[index, 0])
    return result


def scored_rows(test, reference, outputs):
    labels = reference.set_index(["battery_id", "cycle"]).soh.to_dict()
    rows = []
    reconciled = reconcile_batch(outputs)
    for i, sample in enumerate(test.itertuples()):
        raw = {h: float(outputs[h][i]) for h in HORIZONS}
        for column, horizon in enumerate(HORIZONS):
            target = labels.get((sample.battery_id, sample.cycle + horizon))
            if target is not None:
                rows.append({"battery": sample.battery_id, "cycle": int(sample.cycle), "horizon": horizon,
                             "target": target, "raw": raw[horizon], "predicted": float(reconciled[i, column])})
    return rows


def metrics(rows, procedure):
    result = []
    for (battery, horizon), group in rows.groupby(["battery", "horizon"]):
        result.append({"procedure": procedure, "battery": battery, "horizon": int(horizon), "n": len(group),
                       "mae": float(mean_absolute_error(group.target, group.predicted)),
                       "rmse": float(np.sqrt(mean_squared_error(group.target, group.predicted)))})
    return result


def summarize(folds):
    return pd.DataFrame(folds).groupby(["procedure", "horizon"])[["mae", "rmse"]].mean().reset_index().to_dict("records")


def temporal_split(frame):
    early, late, cutoffs = [], [], {}
    for battery, group in frame.groupby("battery_id"):
        group = group.sort_values("cycle")
        cutoff = int(group.iloc[int(len(group) * .5)].cycle)
        cutoffs[battery] = cutoff
        early.append(group[group.cycle < cutoff])
        late.append(group[group.cycle >= cutoff])
    return pd.concat(early), pd.concat(late), cutoffs


def compare(frame, service, fixed_package=None):
    experiment = Experiment(service.metadata)
    folds, selections, predictions = [], [], []
    for battery in sorted(frame.battery_id.unique()):
        print(f"Nested battery holdout: {battery}", flush=True)
        train, test = frame[frame.battery_id != battery], frame[frame.battery_id == battery]
        selected, scores = (fixed_package, {}) if fixed_package else experiment.select(train)
        selections.append({"battery": battery, "selected": selected, "inner_mae": scores})
        for procedure, package in [("baseline", "baseline"), ("nested_selected", selected)]:
            rows = scored_rows(test, test, experiment.predict(train, test, package))
            folds.extend(metrics(pd.DataFrame(rows), procedure))
            predictions.extend({**row, "procedure": procedure, "split": "battery_holdout"} for row in rows)
    print("Purged temporal check: last half of each battery", flush=True)
    # Targets are constructed inside the early table, so t+h never reaches test.
    train, test, cutoffs = temporal_split(frame)
    selected, scores = (fixed_package, {}) if fixed_package else experiment.select(train)
    temporal = []
    for procedure, package in [("baseline", "baseline"), ("nested_selected", selected)]:
        rows = scored_rows(test, frame, experiment.predict(train, test, package))
        temporal.extend(metrics(pd.DataFrame(rows), procedure))
        predictions.extend({**row, "procedure": procedure, "split": "temporal_holdout"} for row in rows)
    final, full_scores = (fixed_package, {}) if fixed_package else experiment.select(frame)
    return {"battery_holdout": {"folds": folds, "macro_average": summarize(folds), "selections": selections},
            "temporal_holdout": {"folds": temporal, "macro_average": summarize(temporal), "cutoff_cycles": cutoffs,
                                 "selected": selected, "inner_mae": scores},
            "final_package": final, "final_selection_mae": full_scores}, predictions


def acceptance(report):
    reasons = []
    for split in ("battery_holdout", "temporal_holdout"):
        summary = report[split]["macro_average"]
        for metric in ("mae", "rmse"):
            baseline = np.mean([r[metric] for r in summary if r["procedure"] == "baseline"])
            selected = np.mean([r[metric] for r in summary if r["procedure"] == "nested_selected"])
            if selected >= baseline - .01:
                reasons.append(f"{split}: mean {metric} did not improve by 0.01 pp")
        for horizon in HORIZONS:
            base = next(r for r in summary if r["procedure"] == "baseline" and r["horizon"] == horizon)
            chosen = next(r for r in summary if r["procedure"] == "nested_selected" and r["horizon"] == horizon)
            if any(chosen[m] > base[m] + .1 for m in ("mae", "rmse")):
                reasons.append(f"{split}: horizon {horizon} regresses by more than 0.1 pp")
        baseline_folds = {(f["battery"], f["horizon"]): f for f in report[split]["folds"] if f["procedure"] == "baseline"}
        for fold in report[split]["folds"]:
            if fold["procedure"] == "nested_selected" and fold["mae"] > baseline_folds[(fold["battery"], fold["horizon"])]["mae"] + .5:
                reasons.append(f"{split}: {fold['battery']} horizon {fold['horizon']} MAE regresses by more than 0.5 pp")
    if report["final_package"] == "baseline":
        reasons.append("Final inner validation retains baseline")
    return {"accepted": not reasons, "reasons": reasons}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("model_dir", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--fixed-package", choices=["delta_short"], help="Exploratory follow-up: preserve current and long-horizon models")
    args = parser.parse_args()
    frame = prepare_dataset(pd.read_csv(args.dataset))
    service = ModelService(args.model_dir)
    report, predictions = compare(frame, service, args.fixed_package)
    report.update({"dataset_sha256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
                   "baseline_artifacts": {info["file"]: hashlib.sha256((args.model_dir / info["file"]).read_bytes()).hexdigest() for info in service.manifest.values()},
                   "packages": ["baseline", args.fixed_package] if args.fixed_package else list(PACKAGES),
                   "scope": ("Exploratory fixed short-horizon follow-up motivated by the first comparison; same held-out datasets reused, not a new independent test. " if args.fixed_package else "Nested package selection inside each battery holdout. ") + "Pilot battery holdouts and purged temporal holdout on previously studied datasets. Not independent external validation. All scores include production reconciliation; baseline configurations refit only on training batteries/cycles.",
                   "acceptance": acceptance(report)})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    pd.DataFrame(predictions).to_csv(args.output.with_suffix(".csv"), index=False)
    print(json.dumps({"final_package": report["final_package"], "acceptance": report["acceptance"], "battery": report["battery_holdout"]["macro_average"], "temporal": report["temporal_holdout"]["macro_average"]}, indent=2), flush=True)


if __name__ == "__main__":
    main()
