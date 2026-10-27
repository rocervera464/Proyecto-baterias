import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.isotonic import IsotonicRegression

from app.services.feature_engineering import (
    MODEL_FEATURES,
)


def reconcile_predictions(predictions: dict[int, float]) -> dict[int, float]:
    """Least-squares non-increasing forecast, anchored to current SoH.

    Equal horizon weights: validation errors are unavailable. Preserve raw
    outputs separately; this constraint is not an accuracy calibration.
    """
    if not predictions or 0 not in predictions:
        raise ValueError("Falta la estimación del SoH actual.")
    if not all(np.isfinite(value) for value in predictions.values()):
        raise ValueError("Las predicciones deben ser finitas.")
    current = float(np.clip(predictions[0], 0.0, 100.0))
    horizons = sorted(h for h in predictions if h != 0)
    if not horizons or current == 0:
        return {0: current, **{h: 0.0 for h in horizons}}
    values = IsotonicRegression(
        increasing=False, y_min=0.0, y_max=current,
    ).fit_transform(horizons, [predictions[h] for h in horizons])
    return {0: current, **dict(zip(horizons, map(float, values)))}


# ============================================================
# RUTAS
# ============================================================

# Este archivo está en:
#
# backend/app/services/model_service.py
#
# parents[2] nos lleva hasta:
#
# backend/
BACKEND_DIR = (
    Path(__file__)
    .resolve()
    .parents[2]
)

MODEL_DIR = (
    BACKEND_DIR
    /
    "model_artifacts"
)


# ============================================================
# SERVICIO DE MODELOS XGBOOST
# ============================================================

class ModelService:
    """
    Carga y administra los modelos XGBoost
    utilizados por la aplicación.

    Se encarga de:

    1. Leer features.json.
    2. Leer manifest.json.
    3. Leer metadata.json.
    4. Verificar compatibilidad de features.
    5. Cargar los cinco modelos.
    6. Preparar los datos para XGBoost.
    7. Ejecutar todas las predicciones.
    """

    def __init__(
        self,
        model_dir: Path = MODEL_DIR,
    ):
        self.model_dir = model_dir

        self.features = self._load_json(
            "features.json"
        )

        self.manifest = self._load_json(
            "manifest.json"
        )

        self.metadata = self._load_json(
            "metadata.json"
        )

        self.target_modes = self.metadata.get("forecast_target_modes", {})
        if not isinstance(self.target_modes, dict) or any(
            key not in {"0", "5", "10", "20", "30"}
            or mode not in {"absolute", "delta_from_current"}
            or (key == "0" and mode != "absolute")
            for key, mode in self.target_modes.items()
        ):
            raise RuntimeError("Los objetivos de los modelos no son compatibles.")

        self._validate_features()

        self.models = (
            self._load_models()
        )


    # ========================================================
    # CARGA DE JSON
    # ========================================================

    def _load_json(
        self,
        filename: str,
    ):
        path = (
            self.model_dir
            /
            filename
        )

        if not path.exists():
            raise FileNotFoundError(
                f"No se encontró el archivo "
                f"requerido: {path}"
            )

        with open(
            path,
            "r",
            encoding="utf-8",
        ) as file:

            return json.load(
                file
            )


    # ========================================================
    # VALIDAR FEATURES
    # ========================================================

    def _validate_features(
        self,
    ):
        """
        Comprueba que las features exportadas
        desde Colab sean exactamente iguales
        a las que genera el backend.
        """

        if not isinstance(
            self.features,
            list,
        ):
            raise RuntimeError(
                "features.json debe contener "
                "una lista."
            )

        if len(
            self.features
        ) != 29:
            raise RuntimeError(
                "El modelo debería utilizar "
                "29 features, pero features.json "
                f"contiene {len(self.features)}."
            )

        if (
            self.features
            != MODEL_FEATURES
        ):
            raise RuntimeError(
                "Las features del modelo no "
                "coinciden exactamente con las "
                "features generadas por el backend."
            )


    # ========================================================
    # CARGAR MODELOS
    # ========================================================

    def _load_models(
        self,
    ) -> dict[int, XGBRegressor]:
        """
        Carga todos los modelos definidos
        en manifest.json.

        El diccionario final utiliza como llave
        el horizonte:

        0  -> SoH actual
        5  -> +5 ciclos
        10 -> +10 ciclos
        20 -> +20 ciclos
        30 -> +30 ciclos
        """

        models: dict[
            int,
            XGBRegressor,
        ] = {}

        for model_info in (
            self.manifest.values()
        ):

            horizon = int(
                model_info[
                    "horizon"
                ]
            )

            filename = (
                model_info[
                    "file"
                ]
            )

            model_path = (
                self.model_dir
                /
                filename
            )

            if not model_path.exists():
                raise FileNotFoundError(
                    "No se encontró el modelo: "
                    f"{model_path}"
                )

            model = XGBRegressor()

            model.load_model(
                str(
                    model_path
                )
            )

            declared_delta = model.get_booster().attr("prediction_target") == "soh_delta"
            expected_delta = self.target_modes.get(str(horizon), "absolute") == "delta_from_current"
            if declared_delta != expected_delta:
                raise RuntimeError(f"El objetivo del modelo del horizonte {horizon} no coincide con sus metadatos.")

            models[
                horizon
            ] = model


        expected_horizons = {
            0,
            5,
            10,
            20,
            30,
        }

        if (
            set(models.keys())
            != expected_horizons
        ):
            raise RuntimeError(
                "Los horizontes cargados no "
                "coinciden con los esperados. "
                f"Encontrados: {sorted(models.keys())}"
            )

        return models


    # ========================================================
    # PREPARAR FEATURES
    # ========================================================

    def prepare_input(
        self,
        features: dict[
            str,
            float | None,
        ],
    ) -> pd.DataFrame:
        """
        Convierte el diccionario generado por
        feature_engineering.py en un DataFrame
        compatible con XGBoost.
        """

        missing_features = [
            feature
            for feature in self.features
            if feature not in features
        ]

        if missing_features:
            raise ValueError(
                "Faltan variables requeridas "
                "para la predicción: "
                f"{missing_features}"
            )


        row = {}

        for feature in self.features:

            value = features[
                feature
            ]

            if value is None:
                row[
                    feature
                ] = np.nan

            else:
                row[
                    feature
                ] = float(
                    value
                )


        dataframe = pd.DataFrame(
            [
                row
            ],
            columns=
                self.features,
        )

        return dataframe


    # ========================================================
    # PREDICCIÓN
    # ========================================================

    def predict_raw_all(
        self,
        features: dict[
            str,
            float | None,
        ],
    ) -> dict[int, float]:
        """
        Ejecuta los cinco modelos y devuelve:

        {
            0: SoH actual,
            5: SoH +5,
            10: SoH +10,
            20: SoH +20,
            30: SoH +30
        }
        """

        X = self.prepare_input(
            features
        )

        predictions: dict[
            int,
            float,
        ] = {}


        for horizon, model in sorted(
            self.models.items()
        ):

            prediction = model.predict(
                X
            )

            value = float(
                prediction[0]
            )

            if self.target_modes.get(str(horizon), "absolute") == "delta_from_current":
                value += predictions[0]

            if not np.isfinite(
                value
            ):
                raise RuntimeError(
                    "El modelo produjo una "
                    "predicción no válida para "
                    f"el horizonte {horizon}."
                )

            predictions[
                horizon
            ] = value


        return predictions


    def predict_all(self, features: dict[str, float | None]) -> dict[int, float]:
        """Return bounded forecasts consistent with cumulative degradation."""
        return reconcile_predictions(self.predict_raw_all(features))


# ============================================================
# SINGLETON / CACHE
# ============================================================

@lru_cache
def get_model_service() -> ModelService:
    """
    Carga los modelos una sola vez.

    Las siguientes solicitudes reutilizan los
    mismos modelos en memoria.
    """

    return ModelService()
