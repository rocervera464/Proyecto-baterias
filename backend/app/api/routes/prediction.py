from fastapi import (
    APIRouter,
    HTTPException,
)

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


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/v1",
    tags=["prediction"],
)


# ============================================================
# PREDICCIÓN
# ============================================================

@router.post(
    "/predict",
    response_model=PredictionResponse,
)
def predict_battery_health(
    request: TelemetryRequest,
):
    """
    Flujo de predicción:

    1. Recibe la telemetría.
    2. Genera las 29 features.
    3. Carga los modelos XGBoost.
    4. Predice el SoH actual.
    5. Predice el SoH futuro.
    6. Devuelve los resultados.
    """


    # ========================================================
    # 1. FEATURE ENGINEERING
    # ========================================================

    try:
        features, _ = extract_features(
            request
        )

    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error


    # ========================================================
    # 2. CARGAR MODELOS XGBOOST
    # ========================================================

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


    # ========================================================
    # 3. EJECUTAR PREDICCIONES
    # ========================================================

    try:
        predictions = (
            model_service.predict_all(
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


    # ========================================================
    # 4. CONSTRUIR PREDICCIONES FUTURAS
    # ========================================================

    future_predictions: list[
        FuturePrediction
    ] = []


    for horizon in [
        5,
        10,
        20,
        30,
    ]:

        future_predictions.append(
            FuturePrediction(
                horizon_cycles=
                    horizon,

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


    # ========================================================
    # 5. RESPUESTA
    # ========================================================

    return PredictionResponse(
        status=
            "success",

        model_family=
            "XGBoost",

        current_cycle=
            request.cycle,

        current_soh_percent=(
            predictions[0]
        ),

        future_predictions=
            future_predictions,
    )