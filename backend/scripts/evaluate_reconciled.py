"""Evaluate the accepted selection procedure including production reconciliation.

Each battery is held out of training and parameter selection. Uses saved inner
selections from the nested report; labels are only used after predicting.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error

from compare_training import fit_predict, horizon_dataset, prepare_dataset
from app.services.model_service import reconcile_predictions


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("dataset", type=Path)
    p.add_argument("comparison", type=Path)
    p.add_argument("candidates", type=Path)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    comparison = json.loads(args.comparison.read_text())
    if hashlib.sha256(args.dataset.read_bytes()).hexdigest() != comparison["dataset_sha256"]:
        raise ValueError("Dataset hash mismatch")
    decisions = json.loads((args.candidates / "metadata.json").read_text())["candidate_evaluation"]["decisions"]
    frame = prepare_dataset(pd.read_csv(args.dataset))
    rows = []
    for battery in sorted(frame.battery_id.unique()):
        print("Evaluating reconciled outputs for", battery, flush=True)
        test = frame[frame.battery_id == battery]
        outputs = {name: {} for name in ["baseline", "candidate_procedure"]}
        for h in [0, 5, 10, 20, 30]:
            data = horizon_dataset(frame, h)
            train = data[data.battery_id != battery]
            selected = next(f["selected"] for f in comparison["horizons"][str(h)]["folds"]
                            if f["procedure"] == "nested_selected" and f["test_battery"] == battery)
            if not decisions[str(h)]["changed"]:
                selected = "original_configuration"
            baseline = fit_predict(train, test, "original_configuration")
            outputs["baseline"][h] = baseline
            outputs["candidate_procedure"][h] = baseline if selected == "original_configuration" else fit_predict(train, test, selected)
        labels = test.set_index("cycle").soh.to_dict()
        for name, predictions in outputs.items():
            for index, sample in enumerate(test.itertuples()):
                raw = {h: float(values[index]) for h, values in predictions.items()}
                reconciled = reconcile_predictions(raw)
                for h in raw:
                    target = labels.get(sample.cycle + h)
                    if target is not None:
                        rows.append(dict(procedure=name, battery=battery, cycle=int(sample.cycle), horizon=h,
                                         target=target, raw=raw[h], reconciled=reconciled[h]))
    result = pd.DataFrame(rows)
    folds = []
    for (procedure, battery, horizon), group in result.groupby(["procedure", "battery", "horizon"]):
        folds.append(dict(procedure=procedure, battery=battery, horizon=int(horizon), n=len(group),
                          mae=float(mean_absolute_error(group.target, group.reconciled)),
                          rmse=float(np.sqrt(mean_squared_error(group.target, group.reconciled)))))
    summary = pd.DataFrame(folds).groupby(["procedure", "horizon"])[["mae", "rmse"]].mean().reset_index().to_dict("records")
    report = {"scope": "Pilot out-of-battery estimates for the nested-selected package, including current isotonic correction. Not external/temporal validation.",
              "dataset_sha256": comparison["dataset_sha256"], "folds": folds, "macro_average": summary}
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    result.to_csv(args.output.with_suffix(".csv"), index=False)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
