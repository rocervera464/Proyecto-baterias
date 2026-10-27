import json
import hashlib
from pathlib import Path

import numpy as np
import pytest

from app.services.model_service import ModelService
from app.services.feature_engineering import MODEL_FEATURES


def test_delta_models_are_anchored_to_raw_current_before_reconciliation(monkeypatch):
    class ConstantModel:
        def __init__(self, value):
            self.value = value

        def predict(self, frame):
            return np.array([self.value])

    service = ModelService.__new__(ModelService)
    service.models = {0: ConstantModel(80), 5: ConstantModel(-2), 10: ConstantModel(-4),
                      20: ConstantModel(75), 30: ConstantModel(72)}
    service.target_modes = {"5": "delta_from_current", "10": "delta_from_current"}
    monkeypatch.setattr(service, "prepare_input", lambda features: features)
    assert service.predict_raw_all({}) == {0: 80, 5: 78, 10: 76, 20: 75, 30: 72}
    assert service.predict_all({}) == {0: 80, 5: 78, 10: 76, 20: 75, 30: 72}


@pytest.mark.parametrize("modes", [{"0": "delta_from_current"}, {"5": "unknown"}, {"99": "absolute"}, []])
def test_invalid_target_modes_fail_before_loading_weights(tmp_path, modes):
    for filename, content in {"features.json": [], "manifest.json": {}, "metadata.json": {"forecast_target_modes": modes}}.items():
        (tmp_path / filename).write_text(json.dumps(content), encoding="utf-8")
    with pytest.raises(RuntimeError, match="objetivos"):
        ModelService(tmp_path)


def test_exported_room_models_preserve_unchanged_weights_and_apply_deltas():
    backend = Path(__file__).resolve().parents[1]
    previous = ModelService(backend / "model_families/nasa_room_2a_v1")
    candidate = ModelService(backend / "model_families/nasa_room_2a_short_v2")
    features = {**dict.fromkeys(MODEL_FEATURES), "cycle": 25., "ambient_temperature": 24., "cutoff_voltage": 2.5}
    raw = candidate.predict_raw_all(features)
    current = previous.predict_raw_all(features)[0]
    assert raw[0] == current
    for info in previous.manifest.values():
        horizon, filename = info["horizon"], info["file"]
        if horizon in (0, 20, 30):
            assert hashlib.sha256((previous.model_dir / filename).read_bytes()).digest() == hashlib.sha256((candidate.model_dir / filename).read_bytes()).digest()
        else:
            delta = float(candidate.models[horizon].predict(candidate.prepare_input(features))[0])
            assert raw[horizon] == pytest.approx(current + delta)


def test_signed_delta_artifact_cannot_be_loaded_as_absolute_soh(monkeypatch):
    directory = Path(__file__).resolve().parents[1] / "model_families/nasa_room_2a_short_v2"
    payloads = {"features.json": MODEL_FEATURES, "manifest.json": {"plus_5": {"horizon": 5, "file": "xgboost_soh_plus_5.json"}}, "metadata.json": {}}
    monkeypatch.setattr(ModelService, "_load_json", lambda self, filename: payloads[filename])
    with pytest.raises(RuntimeError, match="no coincide"):
        ModelService(directory)
