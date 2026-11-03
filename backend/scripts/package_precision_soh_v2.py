"""Complete the historical comparison, verify and install evaluated artifacts.

Use the immutable pre-v2 snapshot as incumbent. This command does not retrain
or select v2 hyperparameters and never relaxes the production gate.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

from train_precision_soh_v2 import (HORIZONS, dump, future_table, legacy_predictions, prepare_dataset,
                                    production_decisions, record_rows, summarize_predictions)
from app.services.model_service import ModelService, reconcile_predictions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("incumbent", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("reports", type=Path)
    args = parser.parse_args()
    report = json.loads((args.candidate / "validation_metrics.json").read_text(encoding="utf-8"))
    if report["dataset_sha256"] != hashlib.sha256(args.dataset.read_bytes()).hexdigest():
        raise ValueError("Dataset hash differs from the evaluated dataset")
    frame = prepare_dataset(pd.read_csv(args.dataset))
    rows = pd.read_csv(args.candidate / "validation_predictions.csv")
    if "legacy_served" not in set(rows.procedure):
        metadata = json.loads((args.incumbent / "metadata.json").read_text(encoding="utf-8"))
        extras = []
        for battery in sorted(frame.battery_id.unique()):
            print(f"Historical served comparison: {battery}", flush=True)
            train, test = frame[frame.battery_id != battery], frame[frame.battery_id == battery]
            raw = legacy_predictions(train, test, metadata)
            served = np.array([list(reconcile_predictions({h: float(raw[h][i]) for h in [0, *HORIZONS]}).values()) for i in range(len(test))])
            extras.extend(record_rows(test, {h: served[:, i] for i, h in enumerate([0, *HORIZONS])}, "legacy_served"))
        rows = pd.concat([rows, pd.DataFrame(extras)], ignore_index=True)
    report["summary"] = summarize_predictions(rows.to_dict("records"))
    report["violation_definition"] = "Adjacent available future horizons only (5->10,10->20,20->30); anchor bounds checked separately during serving."
    report["production_decisions"] = production_decisions(report["summary"], rows.to_dict("records"))
    report["promotion_rule"] = "Strict improvement in MAE AND RMSE versus persistence, historical mean, legacy raw AND legacy served on EVERY battery; four evaluable folds and zero future temporal violations. Pilot scope only."
    manifest = json.loads((args.candidate / "manifest.json").read_text(encoding="utf-8"))
    # Tightening the historical comparison can only remove previously approved
    # horizons. It cannot bypass the final unconstrained-grid check.
    horizons = [h for h in manifest["production_horizons"] if report["production_decisions"][str(h)]["production"]]
    manifest.update(production_horizons=horizons, research_horizons=[h for h in HORIZONS if h not in horizons])
    report["production_horizons"] = horizons
    metadata = json.loads((args.candidate / "metadata.json").read_text(encoding="utf-8"))
    metadata["production_horizons"] = horizons
    metadata["validation_summary"] = report["summary"]["selected"]
    metadata["current_replaced"] = report["current_replaced"]
    metadata["training_rows"] = len(frame)
    metadata["future_training_rows"] = len(future_table(frame))
    source_table = pd.read_csv(args.dataset)
    minimum_samples = int(source_table[["voltage_n_samples", "current_n_samples", "temperature_n_samples"]].min().min())
    domain = json.loads((args.candidate / "domain_profile.json").read_text(encoding="utf-8"))
    domain["minimum_window_samples"] = minimum_samples
    domain["sampling_requirement_source"] = "Minimum observed first-300s sample count in the source cohort; not an input to XGBoost."
    dump(args.candidate / "domain_profile.json", domain)
    report["reference_label_audit"] = {"n_above_100": int((frame.soh > 100).sum()), "n": len(frame),
                                       "minimum": float(frame.soh.min()), "maximum": float(frame.soh.max()),
                                       "evaluation_labels_clipped": False}
    names = [manifest["current"]["file"], manifest["future"]["file"], "features.json", "future_features.json"]
    manifest["artifact_sha256"] = {name: hashlib.sha256((args.candidate / name).read_bytes()).hexdigest() for name in names}
    dump(args.candidate / "manifest.json", manifest)
    dump(args.candidate / "metadata.json", metadata)
    dump(args.candidate / "validation_metrics.json", report)
    rows.to_csv(args.candidate / "validation_predictions.csv", index=False)
    service = ModelService(args.candidate)
    # Validate the exact serving path for all real feature rows before install.
    for _, row in frame.iterrows():
        service.predict_all({name: (None if pd.isna(row[name]) else float(row[name])) for name in service.features})
    if not report["current_replaced"]:
        assert (args.candidate / names[0]).read_bytes() == (args.incumbent / names[0]).read_bytes()
    args.destination.mkdir(parents=True, exist_ok=True)
    for name in [*names, "manifest.json", "metadata.json", "validation_metrics.json", "domain_profile.json", "reference_coverage.json"]:
        shutil.copy2(args.candidate / name, args.destination / name)
    args.reports.mkdir(parents=True, exist_ok=True)
    for name in ["validation_metrics.json", "validation_predictions.csv"]:
        shutil.copy2(args.candidate / name, args.reports / name)
    lines = ["# Evaluación SoH v2", "", "Resultados externos por horizonte. MAE/RMSE en puntos de SoH; R² agregado. Los pesos históricos se reajustaron sin la batería de prueba.", "",
             "| Horizonte | n | MAE anterior bruto | MAE anterior servido | MAE v2 | RMSE anterior servido | RMSE v2 | R² anterior servido | R² v2 |",
             "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    lookup = {key: {m["horizon"]: m for m in report["summary"][key]["horizons"]} for key in ["legacy_raw", "legacy_served", "selected"]}
    for h in [0, *HORIZONS]:
        raw, old, new = [lookup[key][h] for key in lookup]
        lines.append(f"| {h} | {new['n']} | {raw['mae']:.4f} | {old['mae']:.4f} | {new['mae']:.4f} | {old['rmse']:.4f} | {new['rmse']:.4f} | {old['r2']:.4f} | {new['r2']:.4f} |")
    lines += ["", "## Por batería", "", "| Batería | Horizonte | MAE anterior servido | MAE v2 | RMSE anterior servido | RMSE v2 |", "|---|---:|---:|---:|---:|---:|"]
    old = {(r["battery_id"], r["horizon"]): r for r in report["summary"]["legacy_served"]["by_battery"]}
    for row in report["summary"]["selected"]["by_battery"]:
        previous = old[(row["battery_id"], row["horizon"])]
        lines.append(f"| {row['battery_id']} | {row['horizon']} | {previous['mae']:.4f} | {row['mae']:.4f} | {previous['rmse']:.4f} | {row['rmse']:.4f} |")
    lines += ["", "## Decisión", "", f"Horizontes de producción: {horizons}. Modelo actual reemplazado: {report['current_replaced']}.",
              "", f"Selección final: `{json.dumps(report['final_selection'], ensure_ascii=False)}`.", "",
              "El informe JSON contiene los ocho procedimientos de ablación/restricción, baselines, importancias, residuos, cantidades de muestras y todos los motivos de no promoción. Esta cohorte piloto no demuestra precisión en cualquier batería EV."]
    lines.append(f"\nReferencias reales superiores a 100 %: {report['reference_label_audit']['n_above_100']} / {len(frame)}. Etiquetas de evaluación sin recortar; los límites físicos se aplican solo a las predicciones.")
    for key in ["legacy_raw", "legacy_served", "selected"]:
        lines.append(f"\nViolaciones futuras {key}: {report['summary'][key]['violations']} / {report['summary'][key]['comparisons']}.")
    lines += ["", "## Ablaciones y restricción", "", "Promedios macro por batería y horizonte. Cada variante selecciona sus hiperparámetros dentro de cada fold externo.", "",
              "| Variante | MAE macro | RMSE macro | Violaciones futuras |", "|---|---:|---:|---:|"]
    for key, values in report["summary"].items():
        if key.startswith("ablation_"):
            future = [r for r in values["horizons"] if r["horizon"] > 0]
            lines.append(f"| {key} | {np.mean([r['macro_mae'] for r in future]):.4f} | {np.mean([r['macro_rmse'] for r in future]):.4f} | {values['violations']} |")
    lines += ["", "## Variables y límites", "",
              "El voltaje de corte identifica el protocolo de cada batería de esta cohorte: B0045=2.0 V, B0046=2.2 V, B0047=2.5 V y B0048=2.7 V. Las ablaciones evalúan este riesgo, no demuestran causalidad.",
              "", "Importancias gain del ajuste final (no explicaciones causales ni métricas de precisión):"]
    for name, importance in sorted(report["feature_importance_gain"].items(), key=lambda item: -item[1])[:8]:
        lines.append(f"- {name}: {importance:.5f}")
    lines += ["", f"Variables enmascaradas en el modelo final: {manifest['future']['masked_features']}. Importancia de cutoff_voltage: {report['feature_importance_gain']['cutoff_voltage']:.5f}.",
              "", "La tabla v2 corresponde al procedimiento de selección anidada; no puntúa los pesos finales contra sus propias filas de entrenamiento. El ajuste final usa toda la cohorte tras esa evaluación.",
              "", "## Comparación del modelo actual", "", "| Batería | MAE conservado | MAE candidato | RMSE conservado | RMSE candidato |", "|---|---:|---:|---:|---:|"]
    incumbent_current = {r['battery_id']: r for r in report['current_comparison']['current_incumbent']['by_battery']}
    for row in report['current_comparison']['current_optimized']['by_battery']:
        previous = incumbent_current[row['battery_id']]
        lines.append(f"| {row['battery_id']} | {previous['mae']:.4f} | {row['mae']:.4f} | {previous['rmse']:.4f} | {row['rmse']:.4f} |")
    (args.reports / "comparison.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    # Only current and approved-horizon metrics appear in the explanatory UI.
    evaluation = [{"family": "NASA B0045-B0048 / v2", "horizon": r["horizon"], "mae": r["macro_mae"], "rmse": r["macro_rmse"]}
                  for r in report["summary"]["selected"]["horizons"] if r["horizon"] == 0 or r["horizon"] in horizons]
    ui = Path(__file__).resolve().parents[2] / "frontend/src/data/modelEvaluation.ts"
    ui.write_text("// Generated from docs/precision-soh-v2/validation_metrics.json; held-out folds only.\nexport const modelEvaluation = " + json.dumps(evaluation, indent=2) + ";\n", encoding="utf-8")
    print(json.dumps({"production_horizons": horizons, "current_replaced": report["current_replaced"], "final_selection": report["final_selection"]}), flush=True)


if __name__ == "__main__":
    main()
