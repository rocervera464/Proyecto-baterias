from statistics import mean, pstdev
import numpy as np

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

FUTURE_FEATURES = [*MODEL_FEATURES, "horizon_cycles"]


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


# V4: the sole telemetry-only implementation, shared by fitting and serving.
TELEMETRY_BASE_FEATURES = [f"{signal}_{stat}" for signal in ("voltage", "current", "temperature")
                           for stat in ("start", "mean", "std", "min", "max", "end", "delta")]
TELEMETRY_SLOPES = [f"{signal}_slope" for signal in ("voltage", "current", "temperature")]
TELEMETRY_AUCS = [f"{signal}_auc" for signal in ("voltage", "current", "temperature")]
TELEMETRY_FEATURE_SETS = {
    "A": TELEMETRY_BASE_FEATURES,
    "B": TELEMETRY_BASE_FEATURES + TELEMETRY_SLOPES,
    "C": TELEMETRY_BASE_FEATURES + TELEMETRY_SLOPES + TELEMETRY_AUCS,
    "D": TELEMETRY_BASE_FEATURES + TELEMETRY_SLOPES + [
        "voltage_half_delta", "temperature_half_delta", "power_mean", "power_std", "power_delta", "energy_proxy"],
}
TELEMETRY_ALL_FEATURES = list(dict.fromkeys(name for names in TELEMETRY_FEATURE_SETS.values() for name in names))


def clean_telemetry(samples, window_seconds=300, minimum_samples=4):
    """Reject ambiguous repetitions; discard isolated invalid rows, never fill signals."""
    rows, invalid_positions, eligible = [], [], 0
    for index, sample in enumerate(samples):
        try:
            time = float(sample["time_s"] if isinstance(sample, dict) else sample.time_s)
            if np.isfinite(time) and time > window_seconds:
                continue
        except (ValueError, TypeError, KeyError, AttributeError):
            pass
        eligible += 1
        try:
            row = [float(sample[name] if isinstance(sample, dict) else getattr(sample, name))
                   for name in ("time_s", "voltage_v", "current_a", "temperature_c")]
            if not np.isfinite(row).all() or row[0] < 0 or row[1] <= 0:
                raise ValueError("Invalid measurement")
            rows.append(row)
        except (ValueError, TypeError, KeyError, AttributeError):
            invalid_positions.append(index)
    if invalid_positions and (len(invalid_positions) / max(eligible, 1) > .05
                              or any(b == a + 1 for a, b in zip(invalid_positions, invalid_positions[1:]))):
        raise ValueError("El archivo contiene demasiadas filas inválidas o un bloque de mediciones ausentes. No se inventan señales para completarlo.")
    values = np.asarray(rows, dtype=float).reshape(-1, 4)
    values = values[np.argsort(values[:, 0], kind="stable")]
    unique = []
    duplicates = 0
    for row in values:
        if unique and row[0] == unique[-1][0]:
            if not np.array_equal(row, unique[-1]):
                raise ValueError("Hay mediciones diferentes con el mismo tiempo. Selecciona una sola descarga o corrige los registros repetidos.")
            duplicates += 1
        else:
            unique.append(row)
    values = np.asarray(unique, dtype=float).reshape(-1, 4)
    window = values[(values[:, 0] >= 0) & (values[:, 0] <= window_seconds)]
    if len(window) < minimum_samples:
        raise ValueError(f"La telemetría no contiene suficientes muestras dentro de la ventana analizada para realizar una predicción confiable: {len(window)} disponibles; se requieren {minimum_samples}.")
    if np.ptp(window[:, 0]) <= 0:
        raise ValueError("Se necesitan marcas de tiempo distintas.")
    return window, {"samples_detected": len(samples), "samples_valid": len(values), "samples_used": len(window),
                    "invalid_rows_removed": len(invalid_positions), "duplicate_rows_removed": duplicates,
                    "window_seconds": window_seconds, "available_seconds": float(np.ptp(window[:, 0])),
                    "maximum_gap_seconds": float(np.diff(window[:, 0]).max()),
                    "variables_detected": ["time_s", "voltage_v", "current_a", "temperature_c"]}


def extract_telemetry_features(samples, window_seconds=300, minimum_samples=4):
    values, report = clean_telemetry(samples, window_seconds, minimum_samples)
    t = values[:, 0]
    duration = np.ptp(t)
    centered = t - t.mean()
    result = {}
    for column, signal in enumerate(("voltage", "current", "temperature"), 1):
        x = values[:, column]
        result.update(summarize_signal(x.tolist(), signal))
        result[f"{signal}_slope"] = float(np.dot(centered, x - x.mean()) / np.dot(centered, centered))
        result[f"{signal}_auc"] = float(np.trapezoid(x, t))
        first, second = x[t <= t[0] + duration / 2], x[t > t[0] + duration / 2]
        result[f"{signal}_half_delta"] = float(second.mean() - first.mean()) if len(second) else 0.
    power = values[:, 1] * values[:, 2]
    result.update(power_mean=float(power.mean()), power_std=float(power.std()),
                  power_delta=float(power[-1] - power[0]), energy_proxy=float(np.trapezoid(power, t)))
    return {name: result[name] for name in TELEMETRY_ALL_FEATURES}, report
