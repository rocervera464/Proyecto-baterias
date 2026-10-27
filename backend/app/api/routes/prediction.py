from fastapi import (
    APIRouter,
    HTTPException,
)
from app.services.compatibility import assess_compatibility
from app.services.model_registry import select_model_service

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
    reconcile_predictions,
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
            select_model_service(features)
        )

    except (
        OSError,
        RuntimeError,
        ValueError,
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

    compatibility = assess_compatibility(request, features, model_service.model_dir)
    if request.analysis_mode == "strict" and not compatibility["can_estimate_in_strict_mode"]:
        raise HTTPException(status_code=422, detail={
            "message": "No hay un modelo compatible con la información proporcionada en modo estricto. Revisa los datos o activa explícitamente el análisis exploratorio.",
            "compatibility": compatibility,
        })
    try:
        raw_predictions = (
            model_service.predict_raw_all(
                features
            )
        )

        predictions = reconcile_predictions(raw_predictions)

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

                raw_predicted_soh_percent=raw_predictions[horizon],
                adjusted=abs(predictions[horizon] - raw_predictions[horizon]) > 1e-9,

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

        raw_current_soh_percent=raw_predictions[0],
        forecast_method="anchored_isotonic",
        compatibility=compatibility,

        future_predictions=
            future_predictions,
    )
