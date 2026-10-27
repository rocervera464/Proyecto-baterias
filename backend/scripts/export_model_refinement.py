"""Export only an accepted, checksum-matched short-horizon candidate.

Creates a new directory. Activation and a backup remain separate operations.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import pandas as pd
from xgboost import XGBRegressor

from improve_models import HORIZONS, acceptance, horizon_dataset, prepare_dataset, specification
from app.services.model_service import ModelService


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("model_dir", type=Path)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    if not acceptance(report)["accepted"] or not report["acceptance"]["accepted"] or report["final_package"] != "delta_short":
        raise ValueError("The candidate did not pass the acceptance criteria")
    if hashlib.sha256(args.dataset.read_bytes()).hexdigest() != report["dataset_sha256"]:
        raise ValueError("Dataset checksum mismatch")
    for filename, expected in report["baseline_artifacts"].items():
        if hashlib.sha256((args.model_dir / filename).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Baseline artifact changed: {filename}")
    if args.output.exists():
        raise ValueError("Use a new output directory")
    frame = prepare_dataset(pd.read_csv(args.dataset))
    source = ModelService(args.model_dir)
    shutil.copytree(args.model_dir, args.output)
    modes, configs = {}, {}
    for info in source.manifest.values():
        horizon = info["horizon"]
        config, delta = specification("delta_short", horizon, source.metadata)
        modes[str(horizon)] = "delta_from_current" if delta else "absolute"
        configs[str(horizon)] = config
        if horizon not in (5, 10):
            continue
        data = horizon_dataset(frame, horizon)
        model = XGBRegressor(**config, objective="reg:squarederror", random_state=42, n_jobs=1)
        model.fit(data[source.features], data.target - data.soh)
        model.get_booster().set_attr(prediction_target="soh_delta", anchor_horizon="0")
        model.save_model(args.output / info["file"])
    metadata = source.metadata.copy()
    metadata["previous_evaluation"] = metadata.pop("evaluation", None)
    metadata["evaluation"] = {"accepted": True, "dataset_sha256": report["dataset_sha256"],
                              "scope": report["scope"], "report": args.report.as_posix(),
                              "macro_average": report["battery_holdout"]["macro_average"]}
    metadata.update({"model_version": "room_short_delta_v2", "forecast_target_modes": modes,
                     "refinement": {"model_configs": configs, "dataset_sha256": report["dataset_sha256"],
                                    "report": args.report.as_posix(), "accepted": True,
                                    "scope": report["scope"], "battery_holdout": report["battery_holdout"]["macro_average"],
                                    "temporal_holdout": report["temporal_holdout"]["macro_average"]}})
    (args.output / "metadata.json").write_text(json.dumps(metadata, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    coverage_path = args.output / "reference_coverage.json"
    coverage = json.loads(coverage_path.read_text(encoding="utf-8"))
    predictions = pd.read_csv(args.report.with_suffix(".csv"))
    predictions = predictions[(predictions.procedure == "nested_selected") & (predictions.split == "battery_holdout")]
    bands = []
    for horizon in HORIZONS:
        for lower in range(0, 100, 10):
            group = predictions[(predictions.horizon == horizon) & (predictions.target >= lower) & (predictions.target < lower + 10)]
            bands.append({"horizon": horizon, "lower": lower, "upper": lower + 10, "n": len(group),
                          "batteries": int(group.battery.nunique()),
                          "mae": float((group.target - group.predicted).abs().mean()) if len(group) else None})
    coverage.update({"target_bands": bands, "evaluation_report": args.report.as_posix(), "evaluation_scope": report["scope"]})
    coverage_path.write_text(json.dumps(coverage, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    candidate = ModelService(args.output)
    for row in frame.iloc[::20].itertuples(index=False):
        result = candidate.predict_all({name: None if pd.isna(getattr(row, name)) else getattr(row, name) for name in source.features})
        if set(result) != set(HORIZONS):
            raise RuntimeError("Exported candidate is incomplete")
    print(f"Validated candidate: {args.output}")


if __name__ == "__main__":
    main()
