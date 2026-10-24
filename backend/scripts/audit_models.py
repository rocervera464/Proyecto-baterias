"""Reproducible structural/sensitivity audit; never trains or replaces models.

Run from the repository root:
    backend/.venv/Scripts/python.exe backend/scripts/audit_models.py
"""
import argparse
import csv
import hashlib
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from app.schemas.telemetry import TelemetryRequest  # noqa: E402
from app.services.feature_engineering import extract_features  # noqa: E402
from app.services.model_service import ModelService, reconcile_predictions  # noqa: E402


def inspect_artifact(path: Path, expected_features: list[str]) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    learner = payload["learner"]
    trees = learner["gradient_booster"]["model"]["trees"]
    cycle_thresholds = []
    nodes = 0
    for tree in trees:
        nodes += len(tree["left_children"])
        for left, feature, threshold in zip(tree["left_children"], tree["split_indices"], tree["split_conditions"]):
            if left != -1 and feature == expected_features.index("cycle"):
                cycle_thresholds.append(float(threshold))
    return {
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "feature_order_matches": learner["feature_names"] == expected_features,
        "trees": len(trees), "nodes": nodes,
        "objective": learner["objective"]["name"],
        "cycle_split_threshold_min": min(cycle_thresholds, default=None),
        "cycle_split_threshold_max": max(cycle_thresholds, default=None),
        "threshold_caveat": "Split thresholds are not training coverage bounds or validated operating limits.",
    }


def audit_sample(service: ModelService, path: Path) -> dict:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    first = rows[0]
    request = TelemetryRequest(
        cycle=int(first["cycle"]),
        ambient_temperature_c=float(first["ambient_temperature_c"]),
        cutoff_voltage_v=float(first["cutoff_voltage_v"]),
        discharge_samples=[{key: float(row[key]) for key in ("time_s", "voltage_v", "current_a", "temperature_c")} for row in rows],
    )
    features, count = extract_features(request)
    raw = service.predict_raw_all(features)
    cycles = [1, 25, 50, 100, 180, 400, 1000]
    sweep = {cycle: service.predict_raw_all({**features, "cycle": float(cycle)}) for cycle in cycles}
    increases = {
        horizon: [{"from_cycle": before, "to_cycle": after, "increase_pp": sweep[after][horizon] - sweep[before][horizon]}
                  for before, after in zip(cycles, cycles[1:]) if sweep[after][horizon] > sweep[before][horizon] + 1e-6]
        for horizon in sorted(raw)
    }
    return {
        "file": str(path.relative_to(ROOT)), "origin": first.get("data_origin", "unknown"),
        "cycle": request.cycle, "samples_in_window": count,
        "raw_soh_percent": raw, "reconciled_soh_percent": reconcile_predictions(raw),
        "fixed_signal_cycle_sensitivity": sweep, "increases_with_cycle": increases,
        "caveat": "Synthetic diagnostic without measured capacity/SoH labels. Fixed-signal sweeps are not aging trajectories or accuracy tests.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "docs" / "five-model-audit.json")
    args = parser.parse_args()
    service = ModelService()
    report = {
        "purpose": "Structural and sensitivity diagnosis, not accuracy validation or model improvement.",
        "training_rows_declared": service.metadata["training_rows"],
        "models": {str(info["horizon"]): inspect_artifact(service.model_dir / info["file"], service.features) for info in service.manifest.values()},
        "samples": [audit_sample(service, ROOT / "data/samples/telemetria_bateria_muy_degradada.csv")],
        "accuracy_metrics": None,
        "accuracy_metrics_reason": "No labeled training/validation/test dataset available in this checkout.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Audit saved: {args.output}")
    for horizon, model in report["models"].items():
        print(f"h={horizon}: trees={model['trees']}, cycle split max={model['cycle_split_threshold_max']}")
    print("Synthetic case raw SoH:", report["samples"][0]["raw_soh_percent"])


if __name__ == "__main__":
    main()
