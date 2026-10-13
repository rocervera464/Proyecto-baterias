from pydantic import BaseModel, ConfigDict, Field


class TelemetryModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)


class DischargeSample(TelemetryModel):
    time_s: float = Field(ge=0)
    voltage_v: float
    current_a: float
    temperature_c: float


class PreviousEIS(TelemetryModel):
    re_ohm: float | None = None
    rct_ohm: float | None = None


class PreviousCharge(TelemetryModel):
    temperature_start_c: float | None = None
    temperature_max_c: float | None = None
    temperature_delta_c: float | None = None


class TelemetryRequest(TelemetryModel):
    cycle: int = Field(ge=1)
    ambient_temperature_c: float
    cutoff_voltage_v: float = Field(gt=0)
    discharge_samples: list[DischargeSample] = Field(min_length=2)
    previous_eis: PreviousEIS | None = None
    previous_charge: PreviousCharge | None = None
