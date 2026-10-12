from fastapi import APIRouter, HTTPException

from app.schemas.prediction import (
    FuturePrediction,
    PredictionResponse,
)

from app.schemas.telemetry import (
    TelemetryRequest,
)

from app.services.feature_engineering import (
    extract_features,
)

from app.services.model_service import (
    get_model_service,
)


router = APIRouter(
    prefix="/api/v1",
    tags=["prediction"],
)


@router.post(
    "/predict",
    response_model=PredictionResponse,
)
def predict_battery_health(
    request: TelemetryRequest,
):
    """
    Recibe telemetría, genera las 29 features
    y ejecuta los modelos XGBoost.
    """

    # ======================================================
    # FEATURE ENGINEERING
    # ======================================================

    try:
        features, _ = extract_features(
            request
        )

    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error


    # ======================================================
    # CARGAR MODELOS
    # ======================================================

    try:
        model_service = (
            get_model_service()
        )

    except (
        FileNotFoundError,
        RuntimeError,
    ) as error:
        raise HTTPException(
            status_code=503,
            detail=(
                "Los modelos predictivos "
                "no están disponibles: "
                f"{error}"
            ),
        ) from error


    # ======================================================
    # REALIZAR PREDICCIONES
    # ======================================================

    try:
        predictions = (
            model_service
            .predict_all(
                features
            )
        )

    except (
        ValueError,
        RuntimeError,
    ) as error:
        raise HTTPException(
            status_code=500,
            detail=(
                "No fue posible realizar "
                "la predicción: "
                f"{error}"
            ),
        ) from error


    # ======================================================
    # CONSTRUIR RESPUESTA FUTURA
    # ======================================================

    future_predictions = []

    for horizon in [
        5,
        10,
        20,
        30,
    ]:

        future_predictions.append(
            FuturePrediction(
                horizon_cycles=horizon,

                target_cycle=(
                    request.cycle
                    + horizon
                ),

                predicted_soh_percent=(
                    predictions[
                        horizon
                    ]
                ),

                experimental=(
                    horizon >= 20
                ),
            )
        )


    return PredictionResponse(
        status="success",

        model_family="XGBoost",

        current_cycle=request.cycle,

        current_soh_percent=(
            predictions[0]
        ),

        future_predictions=(
            future_predictions
        ),
    )