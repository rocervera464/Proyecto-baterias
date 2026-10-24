from statistics import mean, pstdev

from app.schemas.telemetry import TelemetryRequest


# ============================================================
# CONFIGURACIÓN
# ============================================================

# El modelo XGBoost fue entrenado utilizando únicamente
# los primeros 300 segundos de cada descarga.
WINDOW_SECONDS = 300


# ============================================================
# LISTA EXACTA DE FEATURES DEL MODELO
# ============================================================

# IMPORTANTE:
# El orden de estas variables debe ser exactamente el mismo
# que se utilizó durante el entrenamiento de XGBoost.
#
# No modificar el orden sin volver a entrenar o verificar
# explícitamente el modelo.

MODEL_FEATURES = [
    "cycle",
    "ambient_temperature",
    "cutoff_voltage",

    # Voltaje
    "voltage_start",
    "voltage_mean",
    "voltage_std",
    "voltage_min",
    "voltage_max",
    "voltage_end",
    "voltage_delta",

    # Corriente
    "current_start",
    "current_mean",
    "current_std",
    "current_min",
    "current_max",
    "current_end",
    "current_delta",

    # Temperatura
    "temperature_start",
    "temperature_mean",
    "temperature_std",
    "temperature_min",
    "temperature_max",
    "temperature_end",
    "temperature_delta",

    # EIS previo
    "Re_prev",
    "Rct_prev",

    # Información térmica de la carga previa
    "charge_temp_start_prev",
    "charge_temp_max_prev",
    "charge_temp_delta_prev",
]


# ============================================================
# RESUMEN DE UNA SEÑAL
# ============================================================

def summarize_signal(
    values: list[float],
    prefix: str,
) -> dict[str, float]:
    """
    Convierte una señal temporal en características
    estadísticas utilizadas por el modelo XGBoost.

    Por ejemplo, para voltage genera:

    voltage_start
    voltage_mean
    voltage_std
    voltage_min
    voltage_max
    voltage_end
    voltage_delta

    Parameters
    ----------
    values:
        Lista de valores de la señal.

    prefix:
        Nombre que se utilizará como prefijo:
        voltage, current o temperature.

    Returns
    -------
    dict[str, float]
        Diccionario con las características calculadas.
    """

    if not values:
        raise ValueError(
            f"No hay valores disponibles para {prefix}."
        )

    return {
        f"{prefix}_start": values[0],

        f"{prefix}_mean": mean(
            values
        ),

        # pstdev utiliza desviación estándar poblacional.
        # Esto equivale a np.std(..., ddof=0),
        # utilizado durante el entrenamiento.
        f"{prefix}_std": pstdev(
            values
        ),

        f"{prefix}_min": min(
            values
        ),

        f"{prefix}_max": max(
            values
        ),

        f"{prefix}_end": values[-1],

        f"{prefix}_delta": (
            values[-1]
            -
            values[0]
        ),
    }


# ============================================================
# EXTRACCIÓN COMPLETA DE FEATURES
# ============================================================

def extract_features(
    request: TelemetryRequest,
) -> tuple[
    dict[str, float | None],
    int,
]:
    """
    Convierte la telemetría recibida por la API
    en las 29 variables utilizadas por XGBoost.

    El procedimiento intenta reproducir el mismo
    feature engineering utilizado durante el
    entrenamiento del modelo.

    Pasos:
    1. Ordenar muestras por tiempo.
    2. Conservar únicamente los primeros 300 segundos.
    3. Separar voltaje, corriente y temperatura.
    4. Calcular estadísticas de cada señal.
    5. Añadir ciclo y condiciones experimentales.
    6. Añadir EIS previo, si existe.
    7. Añadir datos de carga previa, si existen.
    8. Verificar que estén presentes las 29 features.

    Returns
    -------
    tuple
        (
            diccionario_de_features,
            numero_de_muestras_utilizadas
        )
    """

    # ========================================================
    # 1. ORDENAR MUESTRAS CRONOLÓGICAMENTE
    # ========================================================

    samples = sorted(
        request.discharge_samples,
        key=lambda sample: sample.time_s,
    )


    # ========================================================
    # 2. UTILIZAR SOLO LOS PRIMEROS 300 SEGUNDOS
    # ========================================================

    window_samples = [
        sample
        for sample in samples
        if sample.time_s <= WINDOW_SECONDS
    ]


    # Necesitamos al menos dos mediciones para poder
    # representar una evolución de la señal.
    if len(window_samples) < 2 or len({sample.time_s for sample in window_samples}) < 2:
        raise ValueError(
            "Se necesitan al menos dos muestras en instantes distintos "
            "dentro de los primeros 300 segundos."
        )


    # ========================================================
    # 3. EXTRAER SEÑALES
    # ========================================================

    voltage = [
        sample.voltage_v
        for sample in window_samples
    ]

    current = [
        sample.current_a
        for sample in window_samples
    ]

    temperature = [
        sample.temperature_c
        for sample in window_samples
    ]


    # ========================================================
    # 4. VARIABLES GENERALES
    # ========================================================

    features: dict[
        str,
        float | None,
    ] = {
        "cycle": float(
            request.cycle
        ),

        "ambient_temperature":
            request.ambient_temperature_c,

        "cutoff_voltage":
            request.cutoff_voltage_v,
    }


    # ========================================================
    # 5. FEATURES DE VOLTAJE
    # ========================================================

    features.update(
        summarize_signal(
            voltage,
            "voltage",
        )
    )


    # ========================================================
    # 6. FEATURES DE CORRIENTE
    # ========================================================

    features.update(
        summarize_signal(
            current,
            "current",
        )
    )


    # ========================================================
    # 7. FEATURES DE TEMPERATURA
    # ========================================================

    features.update(
        summarize_signal(
            temperature,
            "temperature",
        )
    )


    # ========================================================
    # 8. EIS PREVIO
    # ========================================================

    if request.previous_eis is not None:

        re_value = (
            request
            .previous_eis
            .re_ohm
        )

        rct_value = (
            request
            .previous_eis
            .rct_ohm
        )

        # Durante el procesamiento del dataset NASA
        # utilizamos filtros amplios para evitar resultados
        # físicamente absurdos de los ajustes EIS.
        #
        # Si están fuera del rango utilizado en entrenamiento,
        # se convierten en None. XGBoost puede trabajar
        # posteriormente con estos valores faltantes.

        if (
            re_value is not None
            and
            not (
                0 < re_value < 1
            )
        ):
            re_value = None

        if (
            rct_value is not None
            and
            not (
                0 < rct_value < 2
            )
        ):
            rct_value = None

        features[
            "Re_prev"
        ] = re_value

        features[
            "Rct_prev"
        ] = rct_value

    else:

        features[
            "Re_prev"
        ] = None

        features[
            "Rct_prev"
        ] = None


    # ========================================================
    # 9. INFORMACIÓN DE LA CARGA PREVIA
    # ========================================================

    if request.previous_charge is not None:

        features[
            "charge_temp_start_prev"
        ] = (
            request
            .previous_charge
            .temperature_start_c
        )

        features[
            "charge_temp_max_prev"
        ] = (
            request
            .previous_charge
            .temperature_max_c
        )

        features[
            "charge_temp_delta_prev"
        ] = (
            request
            .previous_charge
            .temperature_delta_c
        )

    else:

        features[
            "charge_temp_start_prev"
        ] = None

        features[
            "charge_temp_max_prev"
        ] = None

        features[
            "charge_temp_delta_prev"
        ] = None


    # ========================================================
    # 10. VERIFICAR QUE ESTÉN LAS 29 VARIABLES
    # ========================================================

    missing_features = [
        feature
        for feature in MODEL_FEATURES
        if feature not in features
    ]

    if missing_features:
        raise RuntimeError(
            "Faltan features requeridas "
            "por el modelo: "
            f"{missing_features}"
        )


    # ========================================================
    # 11. REORDENAR EXACTAMENTE COMO EL MODELO
    # ========================================================

    ordered_features = {
        feature: features[
            feature
        ]
        for feature in MODEL_FEATURES
    }


    # ========================================================
    # 12. RETORNAR RESULTADOS
    # ========================================================

    return (
        ordered_features,
        len(window_samples),
    )
