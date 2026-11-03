from pydantic import BaseModel, ConfigDict, Field
from typing import Literal


class FuturePrediction(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    horizon_cycles: int = Field(gt=0)
    target_cycle: int = Field(ge=1)
    predicted_soh_percent: float = Field(ge=0, le=100)


class PredictionResponse(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    compatibility: dict = Field(default_factory=dict)
    status: str
    model_family: str
    current_cycle: int
    forecast_method: str = "accumulated_degradation"
    current_soh_percent: float = Field(ge=0, le=100)
    production_horizons: list[int] = Field(default_factory=list)
    future_predictions: list[FuturePrediction]
    input_normalization: list[dict] = Field(default_factory=list)
    telemetry_reference: dict | None = None


class TelemetryFuturePrediction(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    horizon_cycles: int = Field(gt=0)
    target_cycle: int | None = None
    predicted_soh_percent: float = Field(ge=0, le=120)
    validation_status: Literal["production", "research"]


class TelemetryPredictionResponse(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    status: str = "success"
    model_family: str = "XGBoost telemetry v4"
    model_id: str
    current_cycle: int | None = None
    forecast_method: str = "accumulated_degradation"
    current_soh_percent: float = Field(ge=0, le=120)
    production_horizons: list[int]
    research_horizons: list[int]
    forecast_horizons: list[int]
    forecast_note: str | None = None
    future_predictions: list[TelemetryFuturePrediction]
    telemetry: dict
    compatibility: dict
    input_normalization: list[dict] = Field(default_factory=list)
    telemetry_reference: dict | None = None
