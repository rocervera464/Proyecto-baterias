from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Literal


class TelemetryModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)


class DischargeSample(TelemetryModel):
    time_s: float = Field(ge=0)
    voltage_v: float = Field(gt=0)
    current_a: float
    temperature_c: float


class PreviousEIS(TelemetryModel):
    re_ohm: float | None = None
    rct_ohm: float | None = None


class PreviousCharge(TelemetryModel):
    temperature_start_c: float | None = None
    temperature_max_c: float | None = None
    temperature_delta_c: float | None = None


class TelemetryUnits(TelemetryModel):
    time: Literal["s", "ms", "min", "h"] = "s"
    voltage: Literal["V", "mV"] = "V"
    current: Literal["A", "mA"] = "A"
    temperature: Literal["C", "F", "K"] = "C"
    resistance: Literal["ohm", "mohm"] = "ohm"


class TelemetryRequest(TelemetryModel):
    units: TelemetryUnits = Field(default_factory=TelemetryUnits)
    source_units: TelemetryUnits | None = Field(default=None, exclude=True)
    measurement_level: Literal["unknown", "cell", "module", "pack"] = "unknown"
    chemistry: Literal["unknown", "li-ion", "LFP", "lead-acid", "other"] = "unknown"
    analysis_mode: Literal["strict", "exploratory"] = "exploratory"
    cycle: int = Field(ge=1)
    ambient_temperature_c: float
    cutoff_voltage_v: float = Field(gt=0)
    discharge_samples: list[DischargeSample] = Field(min_length=2)
    previous_eis: PreviousEIS | None = None
    previous_charge: PreviousCharge | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_declared_units(cls, data):
        # Canonical physical units are the units used to train the models.
        # Never infer units from magnitude or clip genuine out-of-domain data.
        if not isinstance(data, dict) or not data.get("units"):
            return data
        units = TelemetryUnits.model_validate(data["units"])
        time_factor = {"s": 1, "ms": .001, "min": 60, "h": 3600}[units.time]
        voltage_factor = .001 if units.voltage == "mV" else 1
        current_factor = .001 if units.current == "mA" else 1
        resistance_factor = .001 if units.resistance == "mohm" else 1

        def numeric(value):
            try:
                return float(value)
            except (TypeError, ValueError, OverflowError) as error:
                raise ValueError("La conversión de unidades requiere valores numéricos válidos.") from error

        def scale(value, factor):
            return None if value is None else numeric(value) * factor

        def temperature(value, delta=False):
            if value is None:
                return None
            value = numeric(value)
            if units.temperature == "F":
                return (value if delta else value - 32) * 5 / 9
            return value - 273.15 if units.temperature == "K" and not delta else value

        result = dict(data)
        samples = data.get("discharge_samples", [])
        if not isinstance(samples, list) or any(not isinstance(sample, dict) for sample in samples):
            raise ValueError("Las mediciones deben ser una lista de objetos con valores numéricos.")
        for key in ("previous_eis", "previous_charge"):
            if data.get(key) is not None and not isinstance(data[key], dict):
                raise ValueError("Los datos previos deben ser objetos con valores numéricos.")
        result["discharge_samples"] = [
            {**sample,
             "time_s": scale(sample.get("time_s"), time_factor),
             "voltage_v": scale(sample.get("voltage_v"), voltage_factor),
             "current_a": scale(sample.get("current_a"), current_factor),
             "temperature_c": temperature(sample.get("temperature_c"))}
            for sample in samples
        ]
        if "ambient_temperature_c" in data:
            result["ambient_temperature_c"] = temperature(data["ambient_temperature_c"])
        if "cutoff_voltage_v" in data:
            result["cutoff_voltage_v"] = scale(data["cutoff_voltage_v"], voltage_factor)
        if data.get("previous_eis") is not None:
            result["previous_eis"] = {key: scale(value, resistance_factor)
                                      for key, value in data["previous_eis"].items()}
        if data.get("previous_charge") is not None:
            result["previous_charge"] = {key: temperature(value, delta=key == "temperature_delta_c")
                                         for key, value in data["previous_charge"].items()}
        # A dumped/revalidated request must not convert the same values twice.
        result["source_units"] = units
        result["units"] = TelemetryUnits()
        return result
