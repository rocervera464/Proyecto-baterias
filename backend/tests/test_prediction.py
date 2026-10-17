import math

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


PAYLOAD = {
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
            "time_s": 200,
            "voltage_v": 3.85,
            "current_a": -0.99,
            "temperature_c": 4.9,
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


def test_prediction_endpoint():
    response = client.post(
        "/api/v1/predict",
        json=PAYLOAD,
    )

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "success"

    assert (
        data["model_family"]
        == "XGBoost"
    )

    assert data["current_cycle"] == 25

    assert math.isfinite(
        data[
            "current_soh_percent"
        ]
    )

    assert len(
        data[
            "future_predictions"
        ]
    ) == 4


def test_prediction_horizons():
    response = client.post(
        "/api/v1/predict",
        json=PAYLOAD,
    )

    assert response.status_code == 200

    data = response.json()

    predictions = data[
        "future_predictions"
    ]

    horizons = [
        prediction[
            "horizon_cycles"
        ]
        for prediction
        in predictions
    ]

    assert horizons == [
        5,
        10,
        20,
        30,
    ]

    for prediction in predictions:

        assert math.isfinite(
            prediction[
                "predicted_soh_percent"
            ]
        )

        assert (
            prediction[
                "target_cycle"
            ]
            ==
            25
            +
            prediction[
                "horizon_cycles"
            ]
        )

def test_long_horizons_are_experimental():
    response = client.post(
        "/api/v1/predict",
        json=PAYLOAD,
    )

    predictions = (
        response.json()[
            "future_predictions"
        ]
    )

    by_horizon = {
        prediction[
            "horizon_cycles"
        ]:
        prediction
        for prediction
        in predictions
    }

    assert (
        by_horizon[5][
            "experimental"
        ]
        is False
    )

    assert (
        by_horizon[10][
            "experimental"
        ]
        is False
    )

    assert (
        by_horizon[20][
            "experimental"
        ]
        is True
    )

    assert (
        by_horizon[30][
            "experimental"
        ]
        is True
    )

def test_api_returns_consistent_forecast_and_raw_outputs():
    response = client.post('/api/v1/predict', json=PAYLOAD)
    assert response.status_code == 200
    data = response.json()
    assert data['forecast_method'] == 'anchored_isotonic'
    assert math.isfinite(data['raw_current_soh_percent'])
    previous = data['current_soh_percent']
    for item in data['future_predictions']:
        value = item['predicted_soh_percent']
        assert 0 <= value <= previous <= 100
        assert math.isfinite(item['raw_predicted_soh_percent'])
        assert item['adjusted'] == (abs(value - item['raw_predicted_soh_percent']) > 1e-9)
        previous = value
