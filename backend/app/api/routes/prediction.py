from fastapi import APIRouter, HTTPException
import logging

from app.schemas.prediction import FuturePrediction, PredictionResponse
from app.schemas.telemetry import TelemetryRequest
from app.services.compatibility import assess_compatibility, compatibility_rejection_message
from app.services.feature_engineering import extract_features
from app.services.model_registry import select_model_service
from app.services.telemetry_identity import normalize_request

router = APIRouter(prefix="/api/v1", tags=["prediction"])
logger = logging.getLogger("app.prediction")


@router.post("/predict", response_model=PredictionResponse)
def predict_battery_health(request: TelemetryRequest):
    try:
        request, normalization, reference = normalize_request(request)
        features, _ = extract_features(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    try:
        service = select_model_service(features)
    except (OSError, RuntimeError, ValueError) as error:
        raise HTTPException(status_code=503, detail=f"Los modelos predictivos no están disponibles: {error}") from error

    compatibility = assess_compatibility(request, features, service.model_dir)
    # Older clients may send exploratory, but cannot bypass production checks.
    if not compatibility["can_estimate_in_strict_mode"]:
        message = compatibility_rejection_message(compatibility)
        logger.warning("prediction_rejected code=incompatible_telemetry cycle=%s model=%s reason=%s",
                       request.cycle, compatibility["model_id"], message)
        raise HTTPException(status_code=422, detail={
            "code": "incompatible_telemetry",
            "message": message,
            "compatibility": compatibility,
        })
    try:
        predictions = service.predict_all(features)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=500, detail=f"No fue posible realizar la predicción: {error}") from error

    return PredictionResponse(
        status="success", model_family=service.metadata.get("model_family", "XGBoost"),
        current_cycle=request.cycle, current_soh_percent=predictions[0],
        forecast_method="accumulated_degradation" if service.is_degradation else "current_only",
        compatibility=compatibility, production_horizons=service.production_horizons,
        future_predictions=[FuturePrediction(horizon_cycles=h, target_cycle=request.cycle + h,
                                             predicted_soh_percent=predictions[h]) for h in service.production_horizons],
        input_normalization=normalization, telemetry_reference=reference,
    )
