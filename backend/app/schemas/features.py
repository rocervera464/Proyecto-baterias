from pydantic import BaseModel


class FeatureExtractionResponse(
    BaseModel
):
    status: str

    cycle: int

    window_seconds: int

    samples_received: int

    samples_used: int

    features: dict[
        str,
        float | None,
    ]