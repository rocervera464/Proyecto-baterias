import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.feature_engineering import MODEL_FEATURES


client = TestClient(app)


def payload():
    return {
        "cycle": 1,
        "ambient_temperature_c": 25,
        "cutoff_voltage_v": 2.7,
        "discharge_samples": [
            {"time_s": t, "voltage_v": v, "current_a": -2, "temperature_c": 25}
            for t, v in [(300, 3.8), (0, 4.2), (301, 3.7)]
        ],
    }


def test_features_sort_samples_and_exclude_after_window():
    response = client.post("/telemetry/features", json=payload())
    assert response.status_code == 200
    result = response.json()
    assert result["samples_received"] == 3
    assert result["samples_used"] == 2
    features = result["features"]
    assert list(features) == MODEL_FEATURES
    assert features["voltage_start"] == 4.2
    assert features["voltage_end"] == 3.8
    assert features["voltage_mean"] == 4.0
    assert features["voltage_std"] == pytest.approx(0.2)
    assert features["Re_prev"] is None


def test_insufficient_samples_in_window_returns_validation_error():
    data = payload()
    data["discharge_samples"] = data["discharge_samples"][::2]
    response = client.post("/telemetry/features", json=data)
    assert response.status_code == 422


@pytest.mark.parametrize("invalid_time", [-1, "NaN", "Infinity"])
def test_invalid_sample_time_returns_validation_error(invalid_time):
    data = payload()
    data["discharge_samples"][0]["time_s"] = invalid_time
    assert client.post("/telemetry/features", json=data).status_code == 422
from fastapi.testclient import (
    TestClient,
)

from app.main import app


client = TestClient(
    app
)


VALID_PAYLOAD = {
    "cycle": 25,

    "ambient_temperature_c": 4.0,

    "cutoff_voltage_v": 2.2,

    "discharge_samples": [
        {
            "time_s": 0,
            "voltage_v": 4.10,
            "current_a": -1.01,
            "temperature_c": 4.2,
        },
        {
            "time_s": 100,
            "voltage_v": 3.95,
            "current_a": -1.00,
            "temperature_c": 4.6,
        },
        {
            "time_s": 300,
            "voltage_v": 3.78,
            "current_a": -1.00,
            "temperature_c": 5.2,
        },
    ],

    "previous_eis": {
        "re_ohm": 0.085,
        "rct_ohm": 0.15,
    },

    "previous_charge": {
        "temperature_start_c": 4.1,
        "temperature_max_c": 5.4,
        "temperature_delta_c": 1.3,
    },
}

def test_reject_invalid_cycle():
    payload = (
        VALID_PAYLOAD.copy()
    )

    payload[
        "cycle"
    ] = 0

    response = client.post(
        "/api/v1/telemetry/validate",
        json=payload,
    )

    assert (
        response.status_code
        == 422
    )

    def test_reject_insufficient_samples():
        payload = {
        "cycle": 25,

        "ambient_temperature_c":
            4.0,

        "cutoff_voltage_v":
            2.2,

        "discharge_samples": [
            {
                "time_s": 0,
                "voltage_v": 4.1,
                "current_a": -1.0,
                "temperature_c": 4.2,
            },
            {
                "time_s": 400,
                "voltage_v": 3.7,
                "current_a": -1.0,
                "temperature_c": 5.5,
            },
        ],
    }

    response = client.post(
        "/api/v1/telemetry/validate",
        json=payload,
    )

    assert (
        response.status_code
        == 422
    )