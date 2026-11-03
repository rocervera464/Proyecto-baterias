"""Regenerate reports from saved outer-fold predictions; optionally repeat fitting.

Default evaluation NEVER scores final all-battery artifacts on their fitting data.
--retrain repeats the full nested training procedure from the original MAT files.
--refresh-legacy refits the exact historical architecture/configuration on outer trains.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from xgboost import XGBRegressor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.train_telemetry_v4 import ROOT, COHORTS, HORIZONS, dump, summarize, legacy_holdout, train_cohort
from scripts.prepare_nasa_training import extract_battery_features, CUTOFF_MAP


def finalize(directory, refresh_legacy=False):
    cohort = directory.name
    predictions = pd.read_csv(directory / "validation_predictions.csv").rename(columns={"future_soh_real": "real", "future_soh_pred": "predicted"})
    if refresh_legacy:
        print(f"Recomputing historical held-out predictions: {cohort}", flush=True)
        source_audit = json.loads((directory / "dataset_audit.json").read_text())
        CUTOFF_MAP.update({"B0005": 2.7, "B0006": 2.5, "B0007": 2.2, "B0018": 2.5})
        parts = []
        for record in source_audit["batteries"]:
            part = extract_battery_features(str(ROOT / record["source"]))
            part["soh"] = part.capacity / record["reference_capacity"] * 100
            parts.append(part)
        legacy = pd.concat(parts, ignore_index=True)
        frame = predictions[(predictions.procedure == "selected") & (predictions.horizon == 0)]
        old_dir = ROOT / "backend" / ("model_artifacts" if cohort == "nasa_cold_1a" else "model_families/nasa_room_2a_short_v2")
        metadata = json.loads((old_dir / "metadata.json").read_text())
        manifest = json.loads((old_dir / "manifest.json").read_text())
        records = []
        for battery in sorted(frame.battery_id.unique()):
            part = frame[frame.battery_id == battery]
            current, future = legacy_holdout(legacy, battery, part.cycle, metadata, manifest)
            for horizon in [0, *HORIZONS]:
                lookup = dict(zip(part.cycle, current if horizon == 0 else future[horizon]))
                labels = predictions[(predictions.procedure == "selected") & (predictions.battery_id == battery) & (predictions.horizon == horizon)]
                for row in labels.itertuples():
                    records.append(dict(procedure="legacy_context" if horizon == 0 else "legacy_future_research", battery_id=battery,
                        cycle=int(row.cycle), horizon=horizon, current_soh_real=row.current_soh_real, real=row.real, predicted=float(lookup[row.cycle])))
        predictions = pd.concat([predictions[~predictions.procedure.str.startswith("legacy_")], pd.DataFrame(records)], ignore_index=True)
        predictions["absolute_error"] = abs(predictions.real - predictions.predicted)
        predictions.rename(columns={"real": "future_soh_real", "predicted": "future_soh_pred"}).to_csv(directory / "validation_predictions.csv", index=False)
    # A direct future-mean baseline is learned only from the other batteries.
    selected_rows = predictions[predictions.procedure == "selected"]
    mean_records = []
    for battery in selected_rows.battery_id.unique():
        for horizon in HORIZONS:
            test = selected_rows[(selected_rows.battery_id == battery) & (selected_rows.horizon == horizon)]
            train = selected_rows[(selected_rows.battery_id != battery) & (selected_rows.horizon == horizon)]
            for row in test.itertuples():
                value = float(train.real.mean())
                mean_records.append(dict(procedure="future_training_mean", battery_id=battery, cycle=int(row.cycle), horizon=horizon,
                    current_soh_real=row.current_soh_real, real=row.real, predicted=value, absolute_error=abs(row.real - value)))
    predictions = pd.concat([predictions[predictions.procedure != "future_training_mean"], pd.DataFrame(mean_records)], ignore_index=True)
    predictions.rename(columns={"real": "future_soh_real", "predicted": "future_soh_pred"}).to_csv(directory / "validation_predictions.csv", index=False)
    report = json.loads((directory / "validation_metrics.json").read_text())
    report["summary"] = summarize(predictions)
    for horizon in HORIZONS:
        decision = report["production_decisions"][str(horizon)]
        decision["reasons"] = [reason for reason in decision["reasons"] if "R2" not in reason and "future_training_mean" not in reason]
        score = next(row for row in report["summary"]["selected"]["horizons"] if row["horizon"] == horizon)
        baseline = next(row for row in report["summary"]["future_training_mean"]["horizons"] if row["horizon"] == horizon)
        if score["r2"] is None or score["r2"] <= 0: decision["reasons"].append("Held-out pooled R2 is not positive")
        if score["macro_mae"] >= baseline["macro_mae"] * .98: decision["reasons"].append("Does not improve macro MAE by 2% versus future_training_mean")
        decision["production"] = not decision["reasons"]
    report["production_horizons"] = [h for h in HORIZONS if report["production_decisions"][str(h)]["production"]]
    report["research_horizons"] = [h for h in HORIZONS if h not in report["production_horizons"]]
    report["post_validation_review"] = {"minimum_future_r2": 0, "additional_baseline": "future_training_mean", "scope": "Stricter publication review after seeing held-out results. No model/configuration was retuned and no horizon is enabled by relaxing a threshold."}
    selected = next(item for item in report["summary"]["selected"]["horizons"] if item["horizon"] == 0)
    baseline = report["summary"]["mean_baseline"]["horizons"][0]
    report["current_production"] = {"approved": selected["macro_mae"] < baseline["macro_mae"] and selected["macro_rmse"] < baseline["macro_rmse"],
        "rule": "Held-out macro MAE and RMSE both improve the training-mean baseline", "model_macro_mae": selected["macro_mae"], "baseline_macro_mae": baseline["macro_mae"]}
    report["legacy_comparison"] = "Exact historical current configuration and future target/ablation are refit on each outer training set. Historical configurations were previously studied on these same cells; this is not independent external evidence. All unpublished legacy future outputs remain research comparisons."
    dump(directory / "validation_metrics.json", report)
    metadata = json.loads((directory / "metadata.json").read_text())
    metadata.update(model_version="4.0", model_id=cohort)
    metadata["production_horizons"] = report["production_horizons"]
    def enrich(specifications, batteries):
        for specification in specifications:
            for battery, fold in zip(sorted(batteries), specification.get("folds", [])):
                fold["validation_battery"] = battery
                fold["train_batteries"] = sorted(other for other in batteries if other != battery)
    enrich(metadata["final_current_search"], metadata["batteries"])
    enrich(metadata["final_future_search"], metadata["batteries"])
    dump(directory / "metadata.json", metadata)
    selections = json.loads((directory / "selection_audit.json").read_text())
    for fold in selections:
        for key in ("current_candidates", "future_candidates"):
            enrich(fold[key], fold["train_batteries"])
        enrich([fold["selected_current"], fold["selected_future"]], fold["train_batteries"])
    dump(directory / "selection_audit.json", selections)
    profile = json.loads((directory / "domain_profile.json").read_text())
    # The fitting pipeline exports this bound from its valid 300 s windows.
    # Report regeneration must also work without access to the original MATs.
    if not np.isfinite(profile.get("maximum_gap_seconds", float("nan"))):
        raise ValueError("El perfil no contiene el muestreo auditado. Regenera los artefactos con --retrain y los MAT originales.")
    # Annotate trained artifacts without changing weights, then verify their new checksums.
    for filename, target in [("xgboost_soh_current.json", "soh_percent"), ("xgboost_soh_degradation.json", "soh_degradation")]:
        fitted = XGBRegressor(n_jobs=1); fitted.load_model(directory / filename)
        fitted.get_booster().set_attr(prediction_target=target, feature_contract="telemetry_only_v4")
        fitted.save_model(directory / filename)
        if "degradation" in filename:
            names = fitted.get_booster().feature_names
            pd.DataFrame({"feature": names, "importance": fitted.feature_importances_}).sort_values("importance", ascending=False).to_csv(directory / "future_feature_importance.csv", index=False)
    manifest = json.loads((directory / "manifest.json").read_text())
    manifest["current_approved"] = report["current_production"]["approved"]
    manifest["production_horizons"] = report["production_horizons"]
    manifest["research_horizons"] = report["research_horizons"]
    manifest["artifact_sha256"] = {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in manifest["artifact_sha256"]}
    dump(directory / "manifest.json", manifest)
    return predictions, report, metadata


def write_report(output, results):
    lines = ["# XGBoost telemetry v4: measured validation", "", "Nested Leave-One-Battery-Out; 300 s production window. Four cells per protocol, evaluated separately. No independent external vehicle or pack validation.", "",
        "Capacity creates targets only. The reference is the median of the first five valid capacities per cell; it never enters a predictor. Repeated folds and the earlier project studies mean these cells are not a new independent test set.", ""]
    combined = []
    combined_metrics = {}
    for cohort, (predictions, report, metadata) in results.items():
        combined.append(predictions.assign(cohort=cohort))
        combined_metrics[cohort] = report
        lines += [f"## {cohort}", "", f"Selected feature set: {metadata['feature_set']} ({len(metadata['features'])} inputs). Production horizons: {report['production_horizons']}. Research: {report['research_horizons']}.", "",
                  "| Procedure | Horizon | Macro MAE (pp) | Macro RMSE (pp) | Pooled R² | N |", "|---|---:|---:|---:|---:|---:|"]
        for procedure in ["selected", "mean_baseline", "persistence", "historical_mean", "historical_linear", "future_training_mean", "oracle_persistence", "legacy_context", "legacy_future_research"]:
            for row in report["summary"].get(procedure, {}).get("horizons", []):
                lines.append(f"| {procedure} | {row['horizon']} | {row['macro_mae']:.4f} | {row['macro_rmse']:.4f} | {row['r2']:.4f} | {row['n_samples']} |")
        lines += ["", "Current hyperparameters:", "```json", json.dumps(metadata["current_config"], indent=2), "```", "Future hyperparameters:", "```json", json.dumps(metadata["future_config"], indent=2), "```", "",
                  f"Monotonic violation rate on outer held-out predictions: {report['summary']['selected']['monotonic_violation_rate']:.6f}. This is a coherence metric, not proof of accuracy.", "",
                  "### Feature-set selection (inner validation, not an external test)", "", "| Set | Best inner macro MAE | Best inner macro RMSE |", "|---|---:|---:|"]
        for feature_set in ["A", "B", "C", "D"]:
            chosen = min((row for row in metadata["final_current_search"] if row["feature_set"] == feature_set), key=lambda row: (row["mae"], row["rmse"]))
            lines.append(f"| {feature_set} | {chosen['mae']:.4f} | {chosen['rmse']:.4f} |")
        lines += ["", "### Generalization gap", "", "| Held-out battery | Fitting MAE | Held-out MAE |", "|---|---:|---:|"]
        selections = json.loads((ROOT / "backend/model_artifacts_v4" / cohort / "selection_audit.json").read_text())
        for fold in selections:
            lines.append(f"| {fold['test_battery']} | {fold['train_current_metrics']['mae']:.4f} | {fold['validation_current_metrics']['mae']:.4f} |")
        lines += ["",
                  "### Window comparison (exploratory)", "", "| Window seconds | Macro MAE | Macro RMSE | Minimum samples observed |", "|---:|---:|---:|---:|"]
        windows = json.loads((ROOT / "backend/model_artifacts_v4" / cohort / "window_comparison.json").read_text())
        for window in sorted(set(item["window_seconds"] for item in windows["folds"])):
            rows = [item for item in windows["folds"] if item["window_seconds"] == window]
            lines.append(f"| {window} | {np.mean([row['mae'] for row in rows]):.4f} | {np.mean([row['rmse'] for row in rows]):.4f} | {min(row['minimum_samples'] for row in rows)} |")
        lines += ["", "Window experiments reuse the 300 s training-only chosen configurations for each outer fold. They are exploratory comparisons; the production window remains 300 s. Final all-battery artifacts are not evaluated on their own fitting rows.", "",
                  "Horizon decisions:", "```json", json.dumps(report["production_decisions"], indent=2), "```", ""]
    output.mkdir(parents=True, exist_ok=True)
    dump(output / "validation_metrics.json", combined_metrics)
    pd.concat(combined, ignore_index=True).rename(columns={"real": "future_soh_real", "predicted": "future_soh_pred"}).to_csv(output / "validation_predictions.csv", index=False)
    (output / "comparison.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    evaluation = [{"family": cohort + " / v4", "horizon": row["horizon"], "mae": row["macro_mae"], "rmse": row["macro_rmse"]}
                  for cohort, (_, report, _) in results.items() for row in report["summary"]["selected"]["horizons"]
                  if row["horizon"] == 0 or row["horizon"] in report["production_horizons"]]
    (ROOT / "frontend/src/data/modelEvaluation.ts").write_text("// Generated from nested held-out v4 evaluation; no fitting scores.\nexport const modelEvaluation = " + json.dumps(evaluation, indent=2) + ";\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--retrain", action="store_true")
    parser.add_argument("--refresh-legacy", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/telemetry-v4")
    args = parser.parse_args()
    results = {}
    for cohort in COHORTS:
        directory = ROOT / "backend/model_artifacts_v4" / cohort
        if args.retrain: train_cohort(cohort, directory)
        results[cohort] = finalize(directory, args.refresh_legacy)
    write_report(args.output, results)
    print(f"Reports: {args.output}")


if __name__ == "__main__": main()
