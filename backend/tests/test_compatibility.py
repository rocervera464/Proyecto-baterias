import json

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.telemetry import TelemetryRequest
from app.services.compatibility import assess_compatibility
from app.services.feature_engineering import extract_features


def payload(**overrides):
    return {"cycle": 25, "ambient_temperature_c": 4, "cutoff_voltage_v": 2.2,
            "discharge_samples": [{"time_s": 0, "voltage_v": 4.1, "current_a": -1, "temperature_c": 4}, {"time_s": 300, "voltage_v": 3.8, "current_a": -1, "temperature_c": 5}], **overrides}


def test_strict_unknown_and_pack_abstain_but_exploratory_remains_available():
    client = TestClient(app)
    for level in ["unknown", "pack"]:
        response = client.post("/api/v1/predict", json=payload(analysis_mode="strict", measurement_level=level))
        assert response.status_code == 422
        assert "compatibility" in response.json()["detail"]
    response = client.post("/api/v1/predict", json=payload(analysis_mode="exploratory", measurement_level="pack"))
    assert response.status_code == 200
    assert response.json()["compatibility"]["status"] == "incompatible"


def test_observed_range_status_does_not_claim_accuracy(tmp_path):
    request = TelemetryRequest(**payload(measurement_level="cell", chemistry="li-ion"))
    features, _ = extract_features(request)
    ranges = {key: {"min": value, "max": value} for key, value in features.items() if value is not None}
    (tmp_path / "domain_profile.json").write_text(json.dumps({"ranges": ranges}))
    (tmp_path / "metadata.json").write_text('{}')
    result = assess_compatibility(request, features, tmp_path)
    assert result["status"] == "within_observed_ranges"
    assert "no prueba" in result["limitation"]
    result = assess_compatibility(request, {**features, "cycle": 1000}, tmp_path)
    assert result["status"] == "out_of_range"


def test_api_rejects_nonpositive_voltage_and_single_instant():
    client = TestClient(app)
    invalid = payload()
    invalid["discharge_samples"][0]["voltage_v"] = 0
    assert client.post("/api/v1/predict", json=invalid).status_code == 422
    invalid = payload()
    invalid["discharge_samples"][1]["time_s"] = 0
    assert client.post("/api/v1/predict", json=invalid).status_code == 422
