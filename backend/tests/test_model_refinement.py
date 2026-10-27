import runpy
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.services.feature_engineering import MODEL_FEATURES
from app.services.model_service import reconcile_predictions


@pytest.fixture
def experiment(monkeypatch):
    scripts = Path(__file__).resolve().parents[1] / "scripts"
    monkeypatch.syspath_prepend(str(scripts))
    return runpy.run_path(str(scripts / "improve_models.py"))


def frame():
    return pd.DataFrame([
        {**dict.fromkeys(MODEL_FEATURES, 0.), "battery_id": battery, "cycle": cycle, "soh": 100 - cycle}
        for battery in ["A", "B", "C", "D"] for cycle in range(1, 51)
    ])


def test_temporal_targets_never_cross_the_test_boundary(experiment):
    early, late, cutoffs = experiment["temporal_split"](frame())
    for horizon in experiment["HORIZONS"]:
        targets = experiment["horizon_dataset"](early, horizon)
        assert all(row.cycle + horizon < cutoffs[row.battery_id] for row in targets.itertuples())
    assert all(row.cycle >= cutoffs[row.battery_id] for row in late.itertuples())
    assert set(zip(early.battery_id, early.cycle)).isdisjoint(zip(late.battery_id, late.cycle))


def test_batch_reconciliation_matches_production_including_crossings_and_bounds(experiment):
    random = np.random.default_rng(42).uniform(-10, 120, size=(200, 5))
    outputs = {h: random[:, i] for i, h in enumerate(experiment["HORIZONS"])}
    result = experiment["reconcile_batch"](outputs)
    for i, row in enumerate(random):
        expected = reconcile_predictions(dict(zip(experiment["HORIZONS"], row)))
        assert result[i] == pytest.approx(list(expected.values()), abs=1e-10)


def test_delta_targets_are_learned_then_added_to_current_prediction(experiment, monkeypatch):
    seen_targets = []

    class ConstantRegressor:
        def __init__(self, **kwargs):
            pass

        def fit(self, features, targets):
            assert list(features.columns) == MODEL_FEATURES
            self.value = float(np.mean(targets))
            seen_targets.append(np.asarray(targets))

        def predict(self, features):
            return np.full(len(features), self.value)

    globals_ = experiment["Experiment"].predict.__globals__
    monkeypatch.setitem(globals_, "XGBRegressor", ConstantRegressor)
    metadata = {"decisions": {str(h): {"configuration": "original_configuration"} for h in experiment["HORIZONS"]}}
    outputs = experiment["Experiment"](metadata).predict(frame(), frame().iloc[:2], "delta_baseline")
    for horizon, target in zip(experiment["HORIZONS"][1:], seen_targets[1:]):
        assert np.all(target == -horizon)
        assert outputs[horizon] == pytest.approx(outputs[0] - horizon)


def test_short_candidate_preserves_current_and_long_horizon_specifications(experiment):
    metadata = {"decisions": {str(h): {"configuration": "original_configuration"} for h in experiment["HORIZONS"]}}
    for horizon in experiment["HORIZONS"]:
        config, delta = experiment["specification"]("delta_short", horizon, metadata)
        assert delta == (horizon in (5, 10))
        if not delta:
            assert config == experiment["baseline_config"](metadata, horizon)
