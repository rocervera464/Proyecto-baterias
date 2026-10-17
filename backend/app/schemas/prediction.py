from pydantic import BaseModel


class FuturePrediction(BaseModel):
    horizon_cycles: int

    target_cycle: int

    predicted_soh_percent: float

    raw_predicted_soh_percent: float | None = None

    adjusted: bool = False

    experimental: bool = False


class PredictionResponse(BaseModel):
    status: str

    model_family: str

    current_cycle: int

    raw_current_soh_percent: float | None = None

    forecast_method: str = "anchored_isotonic"

    current_soh_percent: float

    future_predictions: list[
        FuturePrediction
    ]