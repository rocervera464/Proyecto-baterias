"""Train separately packaged candidates after a completed nested comparison.

Never writes model_artifacts. A candidate only replaces a baseline configuration
when both outer macro MAE/RMSE improve and no battery's MAE grows by >0.5 pp.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import pandas as pd
from xgboost import XGBRegressor

from compare_training import BASE, CANDIDATES, MODEL_FEATURES, horizon_dataset, prepare_dataset, select_inner


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("comparison", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1] / "model_artifacts"
    destination = args.output.resolve()
    if destination == source.resolve() or destination.exists():
        raise ValueError("Use a new candidate directory, never production artifacts")
    report = json.loads(args.comparison.read_text(encoding="utf-8"))
    if hashlib.sha256(args.dataset.read_bytes()).hexdigest() != report["dataset_sha256"]:
        raise ValueError("Dataset does not match evaluation")
    frame = prepare_dataset(pd.read_csv(args.dataset))
    manifest = json.loads((source / "manifest.json").read_text())
    metadata = json.loads((source / "metadata.json").read_text())
    destination.mkdir(parents=True)
    decisions = {}
    for info in manifest.values():
        h = info["horizon"]
        print(f"Preparing candidate horizon {h}...", flush=True)
        evaluation = report["horizons"][str(h)]
        baseline = {f["test_battery"]: f["mae"] for f in evaluation["folds"] if f["procedure"] == "baseline"}
        acceptable = evaluation["lower_mae_and_rmse"] and all(
            f["mae"] <= baseline[f["test_battery"]] + 0.5
            for f in evaluation["folds"] if f["procedure"] == "nested_selected")
        data = horizon_dataset(frame, h)
        selected = select_inner(data) if acceptable else "original_configuration"
        if selected == "original_configuration":
            shutil.copy2(source / info["file"], destination / info["file"])
        else:
            model = XGBRegressor(**CANDIDATES[selected], objective="reg:squarederror", random_state=42, n_jobs=1)
            model.fit(data[MODEL_FEATURES], data.target)
            model.save_model(destination / info["file"])
        decisions[str(h)] = {"nested_comparison_accepted": acceptable, "configuration": selected,
                             "changed": selected != "original_configuration"}
    for filename in ["features.json", "manifest.json"]:
        shutil.copy2(source / filename, destination / filename)
    metadata["candidate_evaluation"] = {"protocol": report["protocol"], "dataset_sha256": report["dataset_sha256"], "decisions": decisions,
                                        "scope": "Pilot nested cross-validation only, not an independent external validation."}
    (destination / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (destination / "comparison.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(decisions, indent=2))
    print("Candidate directory:", destination)


if __name__ == "__main__":
    main()
