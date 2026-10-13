from fastapi import APIRouter, HTTPException

from app.schemas.features import FeatureExtractionResponse
from app.schemas.telemetry import TelemetryRequest
from app.services.feature_engineering import (
    WINDOW_SECONDS,
    extract_features,
)


router = APIRouter(
    prefix="/api/v1/telemetry",
    tags=["telemetry"],
)


@router.post(
    "/validate",
    response_model=FeatureExtractionResponse,
)
def validate_telemetry(
    request: TelemetryRequest,
):
    """
    Valida la telemetría recibida y genera
    las 29 variables utilizadas por XGBoost.
    """

    try:
        features, samples_used = extract_features(
            request
        )

    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    return FeatureExtractionResponse(
        status="valid",
        cycle=request.cycle,
        window_seconds=WINDOW_SECONDS,
        samples_received=len(
            request.discharge_samples
        ),
        samples_used=samples_used,
        features=features,
    )