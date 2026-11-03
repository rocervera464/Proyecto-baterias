from copy import deepcopy
import csv
from pathlib import Path

from fastapi.testclient import TestClient

# Historical contract remains available under /legacy. V4 is tested separately.
from app.legacy import legacy_app as app


def test_22_degree_input_reports_context_and_signal_deviations_without_changing_measurements():
    payload = {"cycle": 30, "ambient_temperature_c": 22, "cutoff_voltage_v": 2.2,
        "measurement_level": "cell", "chemistry": "li-ion", "discharge_samples": [
            {"time_s": 0, "voltage_v": 4.18, "current_a": -1.02, "temperature_c": 24.5},
            {"time_s": 150, "voltage_v": 3.9, "current_a": -1, "temperature_c": 25.5},
            {"time_s": 300, "voltage_v": 3.7, "current_a": -1, "temperature_c": 26.5},
        ]}
    original = deepcopy(payload)
    client = TestClient(app)
    check = client.post("/api/v1/telemetry/compatibility", json=payload)
    assert check.status_code == 200
    report = check.json()
    assert not report["can_estimate_in_strict_mode"]
    assert "22" in report["message"] and "24" in report["message"]
    assert "Temperatura ambiente" in report["message"] and "corriente" in report["message"]
    assert report["input_normalization"] == []
    direct = client.post("/api/v1/predict", json=payload)
    assert direct.status_code == 422
    assert direct.json()["detail"]["message"] == report["message"]
    assert payload == original
    # Changing the ambient field alone cannot fix incompatible measured current.
    payload["ambient_temperature_c"] = 24
    still_outside = client.post("/api/v1/telemetry/compatibility", json=payload).json()
    assert not still_outside["can_estimate_in_strict_mode"]
    assert "corriente" in still_outside["message"]


def test_verified_input_passes_preflight_with_the_same_model_as_prediction(real_payload):
    client = TestClient(app)
    report = client.post("/api/v1/telemetry/compatibility", json=real_payload).json()
    assert report["can_estimate_in_strict_mode"]
    assert report["message"] is None
    predicted = client.post("/api/v1/predict", json=real_payload)
    assert predicted.status_code == 200
    assert predicted.json()["compatibility"]["model_id"] == report["model_id"]


def test_reported_advanced_degradation_csv_is_readable_but_not_supported_by_available_models():
    path = Path(__file__).parent / "fixtures/bateria_degradacion_avanzada_prueba.csv"
    with path.open(encoding="utf-8-sig", newline="") as file:
        samples = [{key: float(value) for key, value in row.items()} for row in csv.DictReader(file)]
    assert len(samples) == 301
    payload = {"cycle": 30, "ambient_temperature_c": 22, "cutoff_voltage_v": 2.2,
        "measurement_level": "cell", "chemistry": "li-ion", "discharge_samples": samples}
    original = deepcopy(payload)
    client = TestClient(app)
    identity = client.post("/api/v1/telemetry/identify", json={"discharge_samples": samples})
    assert identity.status_code == 200
    assert identity.json()["matched"] is False
    assert identity.json()["discharge_samples"] == samples
    preflight = client.post("/api/v1/telemetry/compatibility", json=payload)
    assert preflight.status_code == 200
    report = preflight.json()
    assert report["status"] == "out_of_range"
    assert report["can_estimate_in_strict_mode"] is False
    assert report["input_normalization"] == []
    assert all(name in report["message"] for name in ["22", "voltaje", "corriente", "temperatura medida"])
    assert report["model_id"] == "nasa_room_2a"
    direct = client.post("/api/v1/predict", json=payload)
    assert direct.status_code == 422
    assert "current_soh_percent" not in direct.json()
    assert payload == original
