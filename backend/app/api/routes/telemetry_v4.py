"""The production API: only early telemetry is required."""
import logging

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.schemas.telemetry import TelemetryOnlyRequest
from app.schemas.prediction import TelemetryPredictionResponse
from app.services.feature_engineering import clean_telemetry, extract_telemetry_features
from app.services.file_import import MAX_BYTES
from app.services.telemetry_parser import parse_file, SIGNALS
from app.services.model_service import select_telemetry_model
from app.api.routes.telemetry import identify_telemetry

router = APIRouter(tags=["telemetry-v4"])
logger = logging.getLogger("app.prediction")


def assessment(request):
    try:
        return select_telemetry_model(request.discharge_samples, request.measurement_level, request.chemistry)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except (OSError, RuntimeError, KeyError) as error:
        raise HTTPException(503, f"Los modelos de telemetría no están disponibles: {error}") from error


@router.post("/api/v1/predict", response_model=TelemetryPredictionResponse)
def predict_telemetry(request: TelemetryOnlyRequest):
    service, features, telemetry, compatibility = assessment(request)
    if not compatibility["can_estimate_in_strict_mode"]:
        raise HTTPException(422, {"code": "incompatible_telemetry", "message": compatibility["message"], "compatibility": compatibility, "telemetry": telemetry})
    try: current, future = service.predict(features, include_research_forecasts=request.include_research_forecasts)
    except (RuntimeError, ValueError) as error: raise HTTPException(500, f"No fue posible realizar la predicción: {error}") from error
    for item in future:
        item["target_cycle"] = request.cycle + item["horizon_cycles"] if request.cycle is not None else None
    forecast_horizons = [item["horizon_cycles"] for item in future]
    research_enabled = any(item["validation_status"] == "research" for item in future)
    logger.info("prediction_completed model=%s samples=%s window=300 horizons=%s research_enabled=%s", service.metadata["cohort"], telemetry["samples_used"], forecast_horizons, research_enabled)
    return dict(status="success", model_family="XGBoost telemetry v4", model_id=service.metadata["cohort"],
                current_cycle=request.cycle, current_soh_percent=current, future_predictions=future,
                production_horizons=service.production_horizons, research_horizons=service.research_horizons,
                forecast_horizons=forecast_horizons,
                forecast_note="Estimaciones de referencia con precisión limitada; no superaron todos los criterios de validación." if research_enabled else None,
                telemetry=telemetry, compatibility=compatibility)


@router.post("/api/v1/telemetry/compatibility")
def compatibility(request: TelemetryOnlyRequest):
    _, _, telemetry, report = assessment(request)
    return {**report, "telemetry": telemetry}


@router.post("/api/v1/telemetry/validate")
@router.post("/telemetry/features")
def validate(request: TelemetryOnlyRequest):
    try: features, telemetry = extract_telemetry_features(request.discharge_samples)
    except ValueError as error: raise HTTPException(422, str(error)) from error
    return {"status": "valid", "window_seconds": 300, "samples_received": telemetry["samples_detected"],
            "samples_used": telemetry["samples_used"], "features": features, "telemetry": telemetry}


async def receive_file(request):
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_BYTES: raise HTTPException(413, "El archivo supera 40 MB.")
    return bytes(content)


def parsed(content, filename, sheet, segment):
    try:
        samples, source = parse_file(content, filename, sheet, segment)
        values, telemetry = clean_telemetry(samples)
        logger.info("telemetry_valid samples_detected=%s samples_used=%s invalid_removed=%s duplicate_removed=%s window=300", telemetry["samples_detected"], telemetry["samples_used"], telemetry["invalid_rows_removed"], telemetry["duplicate_rows_removed"])
        canonical = [dict(zip(SIGNALS, map(float, row))) for row in values]
        return canonical, {**source, **telemetry}
    except (ValueError, UnicodeError, KeyError) as error:
        message = "El archivo JSON no contiene una estructura válida." if type(error).__name__ == "JSONDecodeError" else str(error)
        raise HTTPException(422, message) from error
    except ImportError as error: raise HTTPException(503, "Falta un lector de archivos. Instala backend/requirements.txt.") from error
    except Exception as error: raise HTTPException(422, "No se pudo leer el archivo. Comprueba su formato, encabezados y contenido.") from error


@router.post("/api/v1/telemetry/import")
async def preview_file(request: Request, filename: str, sheet: str | None = None, segment: str | None = None):
    samples, telemetry = await run_in_threadpool(parsed, await receive_file(request), filename, sheet, segment)
    return {"fields": list(SIGNALS), "rows": [{key: str(value) for key, value in row.items()} for row in samples],
            "sheets": telemetry["sheets"], "selected_sheet": telemetry["selected_sheet"], "warnings": [],
            "segments": telemetry["segments"], "selected_segment": telemetry["selected_segment"], "telemetry": telemetry}


@router.post("/api/v1/predict-file", response_model=TelemetryPredictionResponse)
async def predict_file(request: Request, filename: str, sheet: str | None = None, segment: str | None = None, include_research_forecasts: bool = True):
    samples, source = await run_in_threadpool(parsed, await receive_file(request), filename, sheet, segment)
    result = await run_in_threadpool(predict_telemetry, TelemetryOnlyRequest(discharge_samples=samples, include_research_forecasts=include_research_forecasts, **source["declared_context"]))
    result["telemetry"].update(source)
    return result


# Optional historical identity is kept for clients; it is never a model dependency.
router.add_api_route("/api/v1/telemetry/identify", identify_telemetry, methods=["POST"])
