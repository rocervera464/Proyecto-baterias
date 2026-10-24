"""Evaluate and register an additional family only after beating the old family.

Requires the original nested comparison. Evaluates all five outputs jointly after
reconciliation, by held-out battery and target-SoH bands. Never fabricates labels.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor

from compare_training import CANDIDATES, MODEL_FEATURES, fit_predict, horizon_dataset, prepare_dataset, select_inner
from app.services.model_service import BACKEND_DIR, ModelService, reconcile_predictions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("comparison", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    comparison = json.loads(args.comparison.read_text())
    checksum = hashlib.sha256(args.dataset.read_bytes()).hexdigest()
    if checksum != comparison["dataset_sha256"]:
        raise ValueError("Dataset/comparison hash mismatch")
    frame = prepare_dataset(pd.read_csv(args.dataset))
    old = ModelService()
    # These batteries must be independent of the old family's training data.
    if set(frame.battery_id) & set(old.metadata["training_batteries"]):
        raise ValueError("New family test batteries overlap the old model's training data")
    records = []
    for battery in sorted(frame.battery_id.unique()):
        print("Held-out battery:", battery, flush=True)
        test = frame[frame.battery_id == battery]
        baseline = {h: model.predict(test[MODEL_FEATURES]) for h, model in old.models.items()}
        new = {}
        for h in [0, 5, 10, 20, 30]:
            dataset = horizon_dataset(frame, h)
            train = dataset[dataset.battery_id != battery]
            selected = next(f["selected"] for f in comparison["horizons"][str(h)]["folds"]
                            if f["procedure"] == "nested_selected" and f["test_battery"] == battery)
            new[h] = fit_predict(train, test, selected)
        targets = test.set_index("cycle").soh.to_dict()
        for source, outputs in [("old_family_external", baseline), ("new_family_nested", new)]:
            for i, row in enumerate(test.itertuples()):
                raw = {h: float(values[i]) for h, values in outputs.items()}
                adjusted = reconcile_predictions(raw)
                for h in raw:
                    target = targets.get(row.cycle + h)
                    if target is not None:
                        records.append(dict(source=source, battery=battery, cycle=int(row.cycle), horizon=h,
                                            target=target, raw=raw[h], predicted=adjusted[h]))
    predictions = pd.DataFrame(records)
    folds = []
    for (source, battery, horizon), group in predictions.groupby(["source", "battery", "horizon"]):
        folds.append(dict(source=source, battery=battery, horizon=int(horizon), n=len(group),
                          mae=float(mean_absolute_error(group.target, group.predicted)),
                          rmse=float(np.sqrt(mean_squared_error(group.target, group.predicted)))))
    summary = pd.DataFrame(folds).groupby(["source", "horizon"])[["mae", "rmse"]].mean().reset_index().to_dict("records")
    accepted = all(
        next(r[metric] for r in summary if r["source"] == "new_family_nested" and r["horizon"] == h)
        < next(r[metric] for r in summary if r["source"] == "old_family_external" and r["horizon"] == h)
        for h in [0, 5, 10, 20, 30] for metric in ["mae", "rmse"])
    bands = []
    for h in [0, 5, 10, 20, 30]:
        for lower in range(0, 100, 10):
            group = predictions[(predictions.source == "new_family_nested") & (predictions.horizon == h)
                                & (predictions.target >= lower) & (predictions.target < lower + 10)]
            bands.append(dict(horizon=h, lower=lower, upper=lower + 10, n=len(group),
                              mae=float(mean_absolute_error(group.target, group.predicted)) if len(group) else None,
                              batteries=int(group.battery.nunique())))
    report = {"accepted": accepted, "dataset_sha256": checksum, "macro_average": summary, "folds": folds, "target_bands": bands,
              "scope": "Pilot nested out-of-battery evaluation, acceptance selected on these comparisons. No untouched external test or full 0-100% coverage."}
    (BACKEND_DIR.parent / "docs" / "new-family-evaluation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    predictions.to_csv(BACKEND_DIR.parent / "docs" / "new-family-predictions.csv", index=False)
    print("Accepted:", accepted, json.dumps(summary, indent=2), flush=True)
    if not accepted:
        return
    if args.output.exists():
        raise ValueError("Use a new output directory")
    args.output.mkdir(parents=True)
    manifest = old.manifest
    decisions = {}
    for info in manifest.values():
        h = info["horizon"]
        dataset = horizon_dataset(frame, h)
        selected = select_inner(dataset)
        print("Final fit:", h, selected, flush=True)
        model = XGBRegressor(**CANDIDATES[selected], objective="reg:squarederror", random_state=42, n_jobs=1)
        model.fit(dataset[MODEL_FEATURES], dataset.target)
        model.save_model(args.output / info["file"])
        decisions[str(h)] = {"configuration": selected, "rows": len(dataset)}
    def save(name, value):
        (args.output / name).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    save("features.json", MODEL_FEATURES)
    save("manifest.json", manifest)
    save("metadata.json", {"model_family": "XGBoost", "model_id": "nasa_room_2a", "model_description": "Celdas NASA, descarga de 2 A a temperatura ambiente",
                           "training_batteries": sorted(frame.battery_id.unique()), "number_of_features": 29,
                           "window_seconds": 300, "soh_definition": old.metadata["soh_definition"],
                           "training_rows": {h: value["rows"] for h, value in decisions.items()},
                           "decisions": decisions, "evaluation": report, "notes": {"plus_20": "experimental", "plus_30": "experimental"}})
    ranges = {}
    for feature in MODEL_FEATURES:
        values = frame[feature].dropna()
        ranges[feature] = {"min": float(values.min()) if len(values) else None, "max": float(values.max()) if len(values) else None}
    save("domain_profile.json", {"ranges": ranges})
    save("reference_coverage.json", {"min": float(frame.soh.min()), "max": float(frame.soh.max()), "rows": len(frame), "target_bands": bands})
    # Verify every exported model is loadable before activating the registry entry.
    ModelService(args.output)
    relative = str(args.output.resolve().relative_to(BACKEND_DIR.resolve())).replace("\\", "/")
    registry_path = BACKEND_DIR / "model_registry.json"
    registry = json.loads(registry_path.read_text()) if registry_path.exists() else {"families": []}
    registry["families"].append({"id": "nasa_room_2a", "directory": relative, "enabled": True})
    registry_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    print("Registered family:", relative)


if __name__ == "__main__":
    main()
