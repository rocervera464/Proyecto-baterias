from fastapi import APIRouter, HTTPException

from app.schemas.features import FeatureExtractionResponse
from app.schemas.telemetry import TelemetryRequest
from app.services.feature_engineering import WINDOW_SECONDS, extract_features


router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.post("/features", response_model=FeatureExtractionResponse)
def telemetry_features(request: TelemetryRequest):
    try:
        features, samples_used = extract_features(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return FeatureExtractionResponse(
        status="ok",
        cycle=request.cycle,
        window_seconds=WINDOW_SECONDS,
        samples_received=len(request.discharge_samples),
        samples_used=samples_used,
        features=features,
    )
