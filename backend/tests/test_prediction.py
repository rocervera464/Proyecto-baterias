from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

# Historical contract remains available under /legacy. V4 is tested separately.
from app.legacy import legacy_app as app
from app.services.feature_engineering import extract_features
from app.schemas.telemetry import TelemetryRequest
from app.services.model_registry import select_model_service

client = TestClient(app)


def test_prediction_matches_service_without_frontend_or_isotonic_correction(real_payload):
    response = client.post("/api/v1/predict", json=real_payload)
    assert response.status_code == 200, response.text
    data = response.json()
    features, _ = extract_features(TelemetryRequest(**real_payload))
    service = select_model_service(features)
    expected = service.predict_all(features)
    assert data["status"] == "success"
    assert data["current_cycle"] == real_payload["cycle"]
    assert data["current_soh_percent"] == expected[0]
    assert data["production_horizons"] == service.production_horizons
    assert [item["horizon_cycles"] for item in data["future_predictions"]] == service.production_horizons
    previous = data["current_soh_percent"]
    for item in data["future_predictions"]:
        assert item["target_cycle"] == real_payload["cycle"] + item["horizon_cycles"]
        assert item["predicted_soh_percent"] == expected[item["horizon_cycles"]]
        assert 0 <= item["predicted_soh_percent"] <= previous <= 100
        assert not {"experimental", "adjusted", "raw_predicted_soh_percent"} & set(item)
        assert item["horizon_cycles"] not in service.research_horizons
        previous = item["predicted_soh_percent"]
    assert "raw_current_soh_percent" not in data


def test_missing_optional_history_is_supported_without_inventing_it(real_payload):
    real_payload.pop("previous_eis")
    real_payload.pop("previous_charge")
    response = client.post("/api/v1/predict", json=real_payload)
    assert response.status_code == 200, response.text
    assert 0 <= response.json()["current_soh_percent"] <= 100


@pytest.mark.parametrize("cycle", [None, "", 0, -1, 1.5])
def test_cycle_must_be_positive_integer(real_payload, cycle):
    payload = deepcopy(real_payload)
    payload["cycle"] = cycle
    assert client.post("/api/v1/predict", json=payload).status_code == 422


def test_missing_cycle_does_not_default_to_one(real_payload):
    real_payload.pop("cycle")
    assert client.post("/api/v1/predict", json=real_payload).status_code == 422


def test_sparse_sampling_is_not_treated_as_validated(real_payload):
    real_payload["discharge_samples"] = [real_payload["discharge_samples"][0], real_payload["discharge_samples"][-1]]
    response = client.post("/api/v1/predict", json=real_payload)
    assert response.status_code == 422
    reasons = response.json()["detail"]["compatibility"]["reasons"]
    assert any("21" in reason and "muestreo" in reason for reason in reasons)
