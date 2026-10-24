import json
from pathlib import Path

from app.schemas.telemetry import TelemetryRequest


def assess_compatibility(request: TelemetryRequest, features: dict, model_dir: Path) -> dict:
    reasons = []
    deviations = []
    unknowns = []
    if request.measurement_level in {"module", "pack"}:
        reasons.append("El modelo disponible se entrenó con celdas, no con módulos o paquetes. Dividir voltaje/corriente no demuestra equivalencia.")
    elif request.measurement_level == "unknown":
        unknowns.append("No se ha identificado si las mediciones son de una celda o de un conjunto.")
    if request.chemistry not in {"unknown", "li-ion"}:
        reasons.append("La química declarada no corresponde al dominio documentado de estos modelos de celdas de ion-litio.")
    elif request.chemistry == "unknown":
        unknowns.append("La química no está identificada; no se puede confirmar la compatibilidad.")
    profile_path = model_dir / "domain_profile.json"
    if profile_path.exists():
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        for name, limits in profile.get("ranges", {}).items():
            value = features.get(name)
            low, high = limits.get("min"), limits.get("max")
            if value is not None and low is not None and high is not None:
                tolerance = max(1e-6, abs(high - low) * 1e-6)
                if value < low - tolerance or value > high + tolerance:
                    deviations.append({"feature": name, "value": value, "observed_min": low, "observed_max": high})
    else:
        unknowns.append("El modelo no incluye un perfil de rangos de entrenamiento verificable.")
    if deviations:
        reasons.append(f"{len(deviations)} variables quedan fuera de los rangos observados en entrenamiento.")
    if request.measurement_level in {"module", "pack"} or request.chemistry not in {"unknown", "li-ion"}:
        status = "incompatible"
    elif deviations:
        status = "out_of_range"
    elif unknowns:
        status = "unverified"
    else:
        status = "within_observed_ranges"
    window = [sample for sample in request.discharge_samples if sample.time_s <= 300]
    quality = []
    if request.source_units and request.source_units != request.units:
        quality.append("Se convirtieron las unidades declaradas a segundos, voltios, amperios, grados Celsius y ohmios antes de evaluar el modelo. No se recortaron las mediciones a los rangos de entrenamiento.")
    if request.previous_eis and (
        (request.previous_eis.re_ohm is not None and not 0 < request.previous_eis.re_ohm < 1)
        or (request.previous_eis.rct_ohm is not None and not 0 < request.previous_eis.rct_ohm < 2)
    ):
        quality.append("Se omitieron valores EIS fuera del filtro utilizado en entrenamiento (0 < Re < 1 Ω; 0 < Rct < 2 Ω); se trataron como datos ausentes.")
    if len({sample.time_s for sample in window}) < len(window):
        quality.append("Hay tiempos repetidos: cada fila se conserva en las estadísticas.")
    if window and max(sample.time_s for sample in window) < 300:
        quality.append("La ventana no llega al segundo 300; se usan las muestras disponibles, sin garantía de representatividad.")
    if any(sample.current_a > 0 for sample in window):
        quality.append("Hay corriente positiva; confirma la convención de descarga antes de interpretar el resultado.")
    coverage_path = model_dir / "reference_coverage.json"
    coverage = json.loads(coverage_path.read_text(encoding="utf-8")) if coverage_path.exists() else None
    metadata = json.loads((model_dir / "metadata.json").read_text(encoding="utf-8"))
    return {"status": status, "model_id": metadata.get("model_id", "nasa_cells_45_48"), "model_description": metadata.get("model_description", "Celdas NASA B0045-B0048, descarga de 1 A a 4 °C"), "can_estimate_in_strict_mode": status == "within_observed_ranges",
            "reasons": reasons + unknowns, "feature_deviations": deviations, "quality_warnings": quality,
            "reference_coverage": coverage,
            "limitation": "Estar dentro de rangos individuales no prueba pertenencia al dominio conjunto ni garantiza precisión. No hay un modelo validado para cualquier batería o para todo el intervalo 0–100 %."}
