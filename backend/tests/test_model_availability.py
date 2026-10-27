import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.routes import prediction, telemetry


@pytest.mark.parametrize(
    "route,module",
    [("/api/v1/predict", prediction), ("/api/v1/telemetry/compatibility", telemetry)],
)
@pytest.mark.parametrize("error", [FileNotFoundError("modelo ausente"), ValueError("JSON inválido"), RuntimeError("modelo inválido")])
def test_unavailable_models_return_service_unavailable(monkeypatch, route, module, error):
    def unavailable(features):
        raise error

    monkeypatch.setattr(module, "select_model_service", unavailable)
    payload = {
        "cycle": 1,
        "ambient_temperature_c": 4,
        "cutoff_voltage_v": 2.2,
        "discharge_samples": [
            {"time_s": 0, "voltage_v": 4.1, "current_a": -1, "temperature_c": 4},
            {"time_s": 300, "voltage_v": 3.8, "current_a": -1, "temperature_c": 5},
        ],
    }
    response = TestClient(app).post(route, json=payload)
    assert response.status_code == 503
    assert "no están disponibles" in response.json()["detail"]
