import json
import runpy
import shutil
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from app.services.feature_engineering import FUTURE_FEATURES, MODEL_FEATURES, extract_features
from app.schemas.telemetry import TelemetryRequest
from app.services.model_service import ModelService, get_model_service

training = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/train_precision_soh_v2.py"))


def test_exact_targets_do_not_jump_gaps_or_batteries():
    frame = pd.DataFrame([{"battery_id": b, "cycle": c, "soh": value} for b in ["A", "B"]
                          for c, value in [(1, 80), (6, 81), (11, 75)]])
    table = training["future_table"](frame)
    first = table[(table.cycle == 1) & (table.horizon_cycles == 5)]
    assert set(first.target) == {81}
    assert set(first.degradation_raw) == {-1}
    assert set(first.degradation) == {0}  # no invented .01 loss
    assert len(table[(table.cycle == 1) & (table.horizon_cycles == 10)]) == 2
    assert not (table.horizon_cycles == 20).any()


def test_model_feature_contract_and_cached_loading(real_payload):
    service = get_model_service()
    assert service is get_model_service()
    assert service.features == MODEL_FEATURES and len(service.features) == 29
    assert service.future_features == FUTURE_FEATURES and len(service.future_features) == 30
    assert service.future_model is not None
    features, _ = extract_features(TelemetryRequest(**real_payload))
    features["Re_prev"] = None
    inputs = service.prepare_input(dict(reversed(list(features.items()))))
    assert list(inputs) == MODEL_FEATURES
    assert np.isnan(inputs.Re_prev.iloc[0])


def test_real_future_artifact_is_monotonic_over_horizons(real_payload):
    service = get_model_service()
    features, _ = extract_features(TelemetryRequest(**real_payload))
    inputs = service.prepare_input(features)
    grid = pd.concat([inputs.assign(horizon_cycles=h) for h in [5, 10, 20, 30]], ignore_index=True)
    grid[service.masked_features] = np.nan
    losses = service.future_model.predict(grid[FUTURE_FEATURES])
    assert np.isfinite(losses).all()
    if service.manifest["future"]["monotonic"]:
        assert (np.diff(losses) >= -1e-6).all()


def test_artifact_hash_mismatch_prevents_loading(tmp_path):
    service = get_model_service()
    for name in ["features.json", "future_features.json", "manifest.json", "metadata.json", "validation_metrics.json",
                 service.manifest["current"]["file"], service.manifest["future"]["file"]]:
        shutil.copy2(service.model_dir / name, tmp_path / name)
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    manifest["artifact_sha256"]["features.json"] = "0" * 64
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(RuntimeError, match="integridad"):
        ModelService(tmp_path)


def test_features_after_300_seconds_cannot_leak(real_payload):
    request = TelemetryRequest(**real_payload)
    before = extract_features(request)[0]
    real_payload["discharge_samples"].append(dict(time_s=1000, voltage_v=1, current_a=-100, temperature_c=100))
    assert extract_features(TelemetryRequest(**real_payload))[0] == before


def test_training_history_cannot_use_charge_or_eis_after_the_discharge(monkeypatch):
    from scripts import prepare_nasa_training as preparation
    data = SimpleNamespace(Time=np.array([0., 300., 900.]), Voltage_measured=np.array([4., 3.8, 1.]),
                           Current_measured=np.array([-1., -1., -20.]),
                           Temperature_measured=np.array([4., 5., 100.]), Capacity=1.5)
    discharge = SimpleNamespace(type="discharge", data=data, ambient_temperature=4.)
    impedance = SimpleNamespace(type="impedance", data=SimpleNamespace(Re=.2, Rct=.3))
    charge = SimpleNamespace(type="charge", data=SimpleNamespace(Time=[0., 900.], Temperature_measured=[4., 12.]))
    monkeypatch.setattr(preparation, "load_battery_mat", lambda path: SimpleNamespace(cycle=[discharge, impedance, charge, discharge]))
    result = preparation.extract_battery_features("B0046.mat")
    assert pd.isna(result.iloc[0].Re_prev) and pd.isna(result.iloc[0].charge_temp_max_prev)
    assert result.iloc[1].Re_prev == .2 and result.iloc[1].charge_temp_max_prev == 12.
    assert result.iloc[0].voltage_min == 3.8
    assert result.iloc[0].temperature_max == 5.


def test_training_matrices_exclude_targets_capacity_and_duration():
    data = pd.DataFrame([{**dict.fromkeys(MODEL_FEATURES, 1.), "horizon_cycles": 5,
                          "capacity": 99., "soh": 100., "target": 98., "degradation": 2.,
                          "charge_duration_prev": 5000.}])
    inputs = training["matrix"](data, True, "without_both")
    assert list(inputs) == FUTURE_FEATURES
    assert inputs.cycle.isna().all() and inputs.cutoff_voltage.isna().all()


def fake_service(losses, horizons=None):
    class Constant:
        def predict(self, frame):
            return np.array([80.] * len(frame))

    class Loss:
        def predict(self, frame):
            return np.array(losses)

    service = ModelService.__new__(ModelService)
    service.features = MODEL_FEATURES
    service.future_features = FUTURE_FEATURES
    service.models = {0: Constant()}
    service.future_model = Loss()
    service.is_degradation = True
    service.production_horizons = horizons if horizons is not None else [5, 10]
    service.research_horizons = [20, 30]
    service.masked_features = []
    return service


def test_only_production_horizons_execute_and_zero_loss_is_preserved():
    service = fake_service([0., 3.])
    assert service.predict_all(dict.fromkeys(MODEL_FEATURES)) == {0: 80., 5: 80., 10: 77.}
    service.production_horizons = []
    assert service.predict_all(dict.fromkeys(MODEL_FEATURES)) == {0: 80.}


def test_physical_bounds_without_artificial_decrements():
    service = fake_service([-2., 100.])
    assert service.predict_all(dict.fromkeys(MODEL_FEATURES)) == {0: 80., 5: 80., 10: 0.}


def test_large_incoherence_is_rejected_not_flattened():
    with pytest.raises(RuntimeError, match="Incoherencia"):
        fake_service([4., 1.]).predict_all(dict.fromkeys(MODEL_FEATURES))


def test_nonfinite_model_outputs_are_rejected():
    with pytest.raises(RuntimeError, match="no finitos"):
        fake_service([1., np.nan]).predict_all(dict.fromkeys(MODEL_FEATURES))


def test_contract_rejects_reordered_future_features(tmp_path):
    source = get_model_service()
    for name in ["features.json", "manifest.json", "metadata.json"]:
        (tmp_path / name).write_bytes((source.model_dir / name).read_bytes())
    (tmp_path / "future_features.json").write_text(json.dumps(list(reversed(FUTURE_FEATURES))))
    with pytest.raises(RuntimeError, match="30 features"):
        ModelService(tmp_path)
