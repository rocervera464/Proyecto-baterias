from pydantic import BaseModel, Field


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
    input_normalization: list[dict] = Field(default_factory=list)
    telemetry_reference: dict | None = None
