import json
import hashlib
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.isotonic import IsotonicRegression

from app.services.feature_engineering import (
    MODEL_FEATURES,
    FUTURE_FEATURES,
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

        self.production_horizons = self.manifest.get("production_horizons", [])
        self.research_horizons = self.manifest.get("research_horizons", [5, 10, 20, 30])
        for horizons in [self.production_horizons, self.research_horizons]:
            if not isinstance(horizons, list) or any(type(h) is not int or h not in {5, 10, 20, 30} for h in horizons) or horizons != sorted(set(horizons)):
                raise RuntimeError("Contrato de horizontes inválido.")
        if set(self.production_horizons) & set(self.research_horizons):
            raise RuntimeError("Horizontes de producción y de investigación superpuestos.")
        self.is_degradation = self.manifest.get("schema_version") == 2
        self.future_model = None
        if self.is_degradation:
            if self.manifest.get("current", {}).get("horizon") != 0 or set(self.production_horizons + self.research_horizons) != {5, 10, 20, 30}:
                raise RuntimeError("El manifiesto v2 no define los horizontes esperados.")
            self._validate_features()
            self.future_features = self._load_json("future_features.json")
            if self.future_features != FUTURE_FEATURES:
                raise RuntimeError("Contrato futuro: se requieren las 30 features en el orden exacto.")
            self.models = {0: self._load_contracted_model(self.manifest["current"]["file"], self.features)}
            future = self.manifest["future"]
            self.masked_features = future.get("masked_features", [])
            if not isinstance(self.masked_features, list) or any(name not in {"cycle", "cutoff_voltage"} for name in self.masked_features):
                raise RuntimeError("Máscara de ablación inválida.")
            self.future_model = self._load_contracted_model(future["file"], self.future_features)
            if future.get("target") != "soh_degradation" or self.future_model.get_booster().attr("prediction_target") != "soh_degradation":
                raise RuntimeError("El objetivo futuro no coincide con el contrato de degradación.")
            validation = self._load_json("validation_metrics.json")
            if validation.get("production_horizons") != self.production_horizons or self.metadata.get("production_horizons") != self.production_horizons:
                raise RuntimeError("El manifiesto no coincide con la evaluación de producción.")
            if any(not validation.get("production_decisions", {}).get(str(h), {}).get("production") for h in self.production_horizons):
                raise RuntimeError("Un horizonte no tiene evidencia de aprobación.")
            for name, expected in self.manifest.get("artifact_sha256", {}).items():
                path = (self.model_dir / name).resolve()
                if path.parent != self.model_dir.resolve() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                    raise RuntimeError("La integridad de los artefactos no coincide con el manifiesto.")
            # No legacy independent forecasts participate in serving.
            self.target_modes = {}
            return

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

    def _load_contracted_model(self, filename, columns):
        path = (self.model_dir / filename).resolve()
        if path.parent != self.model_dir.resolve():
            raise RuntimeError("Ruta del modelo fuera de su directorio.")
        fitted = XGBRegressor(n_jobs=1)
        fitted.load_model(path)
        if fitted.get_booster().feature_names != columns or fitted.n_features_in_ != len(columns):
            raise RuntimeError("Las columnas del artefacto no coinciden con el contrato de features.")
        return fitted


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

            if not isinstance(model_info, dict) or "horizon" not in model_info:
                continue

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

            model = XGBRegressor(n_jobs=1)

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
        """Only approved horizons; no isotonic repair or minimum invented loss.

        Legacy artifacts remain usable for current SoH and offline comparison.
        They cannot silently expose their independent research forecasts.
        """
        inputs = self.prepare_input(features)
        raw_current = float(self.models[0].predict(inputs)[0])
        if not np.isfinite(raw_current):
            raise RuntimeError("El modelo actual produjo un valor no finito.")
        current = float(np.clip(raw_current, 0, 100))
        outputs = {0: current}
        if not self.production_horizons:
            return outputs
        if not self.is_degradation or self.future_model is None:
            raise RuntimeError("No hay un modelo de degradación validado para producción.")
        rows = pd.concat([inputs.assign(horizon_cycles=h) for h in self.production_horizons], ignore_index=True)
        rows[self.masked_features] = np.nan
        losses = self.future_model.predict(rows[self.future_features]).astype(float)
        if not np.isfinite(losses).all():
            raise RuntimeError("El modelo futuro produjo valores no finitos.")
        previous = current
        for horizon, loss in zip(self.production_horizons, losses):
            future = float(np.clip(current - max(0., loss), 0., current))
            if future > previous + 1e-6:
                raise RuntimeError("Incoherencia temporal del modelo: no se corrige una proyección inválida.")
            outputs[horizon] = min(previous, future)  # numerical tolerance only
            previous = outputs[horizon]
        return outputs


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
