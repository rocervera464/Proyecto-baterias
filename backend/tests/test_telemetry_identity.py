from copy import deepcopy
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

# Historical contract remains available under /legacy. V4 is tested separately.
from app.legacy import legacy_app as app
from app.schemas.telemetry import DischargeSample, TelemetryRequest
from app.services import telemetry_identity

client = TestClient(app)


@pytest.fixture
def source_samples():
    path = Path(__file__).resolve().parents[2] / "data/samples/B0045_ciclo30_con_contexto.xlsx"
    frame = pd.read_excel(path)
    return frame[["time_s", "voltage_v", "current_a", "temperature_c"]].to_dict("records")


def test_identifies_signals_without_filename_or_context(source_samples):
    before = deepcopy(source_samples)
    response = client.post("/api/v1/telemetry/identify", json={"discharge_samples": source_samples})
    assert response.status_code == 200
    result = response.json()
    assert result["matched"] is True
    assert result["reference"]["battery_id"] == "B0045"
    assert result["context"] == {"cycle": 30, "ambient_temperature_c": 4., "cutoff_voltage_v": 2.,
                                  "measurement_level": "cell", "chemistry": "li-ion"}
    assert result["discharge_samples"] == source_samples == before
    payload = {**result["context"], "discharge_samples": result["discharge_samples"]}
    predicted = client.post("/api/v1/predict", json=payload)
    assert predicted.status_code == 200, predicted.text


def test_unit_and_context_repairs_match_canonical_prediction(source_samples):
    canonical = dict(cycle=30, ambient_temperature_c=4, cutoff_voltage_v=2,
                     measurement_level="cell", chemistry="li-ion", discharge_samples=source_samples)
    baseline = client.post("/api/v1/predict", json=canonical).json()
    wrong = deepcopy(canonical)
    wrong.update(cycle=999, ambient_temperature_c=25, cutoff_voltage_v=2200,
                 measurement_level="unknown", chemistry="unknown")
    for sample in wrong["discharge_samples"]:
        sample["time_s"] *= 1000
        sample["voltage_v"] *= 1000
        sample["current_a"] *= 1000
        sample["temperature_c"] = sample["temperature_c"] * 9 / 5 + 32
    before = deepcopy(wrong)
    response = client.post("/api/v1/predict", json=wrong)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["current_cycle"] == 30
    assert data["current_soh_percent"] == baseline["current_soh_percent"]
    assert data["production_horizons"] == baseline["production_horizons"]
    changes = {change["field"]: change for change in data["input_normalization"]}
    assert changes["ambient_temperature_c"]["original_value"] == 25
    assert changes["ambient_temperature_c"]["normalized_value"] == 4
    assert changes["voltage_v"]["factor"] == .001
    assert changes["temperature_c"]["source_unit"] == "F"
    assert wrong == before


def test_positive_discharge_polarity_is_repaired_only_for_verified_match(source_samples):
    samples = deepcopy(source_samples)
    for sample in samples:
        sample["current_a"] *= -1
    response = client.post("/api/v1/telemetry/identify", json={"discharge_samples": samples})
    assert response.json()["matched"] is True
    assert response.json()["discharge_samples"] == source_samples


def test_incorrect_cutoff_is_restored_from_telemetry_not_model_limits(source_samples):
    identified = client.post("/api/v1/telemetry/identify", json={"discharge_samples": source_samples}).json()
    assert identified["context"]["cutoff_voltage_v"] == 2
    response = client.post("/api/v1/predict", json={"cycle": 30, "ambient_temperature_c": 25,
        "cutoff_voltage_v": 4.6, "discharge_samples": source_samples})
    assert response.status_code == 200, response.text
    change = next(change for change in response.json()["input_normalization"] if change["field"] == "cutoff_voltage_v")
    assert change["original_value"] == 4.6
    assert change["normalized_value"] == 2
    assert change["basis"] == "verified_reference"


def test_real_out_of_domain_signal_is_never_clipped_into_training_range(source_samples):
    samples = deepcopy(source_samples)
    samples[2]["voltage_v"] = 20
    identified = client.post("/api/v1/telemetry/identify", json={"discharge_samples": samples}).json()
    assert identified["matched"] is False
    assert identified["context"] == {}
    assert identified["discharge_samples"] == samples
    rejected = client.post("/api/v1/predict", json={"cycle": 30, "ambient_temperature_c": 4,
        "cutoff_voltage_v": 2, "measurement_level": "cell", "chemistry": "li-ion", "discharge_samples": samples})
    assert rejected.status_code == 422


def test_ambiguous_reference_does_not_invent_context(monkeypatch, source_samples):
    key = telemetry_identity.fingerprint(np.array([[sample[name] for name in telemetry_identity.SIGNALS] for sample in source_samples]))
    monkeypatch.setattr(telemetry_identity, "load_catalog", lambda: {key: [{"cycle": 30}, {"cycle": 31}]})
    result = telemetry_identity.identify_samples([DischargeSample(**sample) for sample in source_samples])
    assert result["matched"] is False
    assert result["context"] == {}


def test_normalization_can_be_disabled_and_never_mutates_request(source_samples):
    request = TelemetryRequest(cycle=999, ambient_temperature_c=25, cutoff_voltage_v=2,
                               discharge_samples=source_samples, normalize_inputs=False)
    normalized, changes, reference = telemetry_identity.normalize_request(request)
    assert normalized is request
    assert changes == [] and reference is None
    assert normalized.cycle == 999


def test_features_compatibility_and_prediction_share_normalized_context(source_samples):
    payload = {"cycle": 999, "ambient_temperature_c": 25, "cutoff_voltage_v": 2200, "discharge_samples": source_samples}
    features = client.post("/api/v1/telemetry/validate", json=payload)
    compatibility = client.post("/api/v1/telemetry/compatibility", json=payload)
    predicted = client.post("/api/v1/predict", json=payload)
    assert features.status_code == compatibility.status_code == predicted.status_code == 200
    assert features.json()["features"]["ambient_temperature"] == 4
    assert features.json()["cycle"] == predicted.json()["current_cycle"] == 30
    assert compatibility.json()["input_normalization"] == predicted.json()["input_normalization"]


def test_catalog_contains_context_only_not_targets():
    data = json.loads(telemetry_identity.CATALOG.read_text(encoding="utf-8"))
    forbidden = {"soh", "capacity", "future_soh", "degradation", "target"}
    for records in data["fingerprints"].values():
        for record in records:
            assert not forbidden & set(record)
            assert set(record) == {"battery_id", *telemetry_identity.CONTEXT_FIELDS, "source_sha256"}
