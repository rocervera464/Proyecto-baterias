from pydantic import BaseModel


class FuturePrediction(BaseModel):
    horizon_cycles: int

    target_cycle: int

    predicted_soh_percent: float

    experimental: bool = False


class PredictionResponse(BaseModel):
    status: str

    model_family: str

    current_cycle: int

    current_soh_percent: float

    future_predictions: list[
        FuturePrediction
    ]