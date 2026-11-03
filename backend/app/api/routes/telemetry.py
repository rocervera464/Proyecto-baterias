from fastapi import APIRouter, HTTPException

from app.schemas.features import FeatureExtractionResponse
from app.schemas.telemetry import TelemetryRequest, TelemetryIdentificationRequest
from app.services.telemetry_identity import identify_samples, normalize_request
from app.services.feature_engineering import (
    WINDOW_SECONDS,
    extract_features,
)
from app.services.compatibility import assess_compatibility, compatibility_rejection_message
from app.services.model_registry import select_model_service


router = APIRouter(
    prefix="/api/v1/telemetry",
    tags=["telemetry"],
)

legacy_router = APIRouter(tags=["telemetry"])


@router.post("/identify")
def identify_telemetry(request: TelemetryIdentificationRequest):
    return identify_samples(request.discharge_samples)


@router.post("/compatibility")
def check_compatibility(request: TelemetryRequest):
    try:
        request, normalization, reference = normalize_request(request)
        features, _ = extract_features(request)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    try:
        model_service = select_model_service(features, request)
        report = assess_compatibility(request, features, model_service.model_dir)
        return {**report, "message": None if report["can_estimate_in_strict_mode"] else compatibility_rejection_message(report),
                "input_normalization": normalization, "telemetry_reference": reference}
    except (OSError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=503,
            detail=f"Los modelos predictivos no están disponibles: {error}",
        ) from error


@legacy_router.post(
    "/telemetry/features",
    response_model=FeatureExtractionResponse,
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
        request, normalization, reference = normalize_request(request)
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
        input_normalization=normalization,
        telemetry_reference=reference,
    )
