import pytest

from app.services.model_service import reconcile_predictions


def test_screenshot_forecast_is_anchored_to_current_health():
    raw = {0: 76.35, 5: 78.50, 10: 77.22, 20: 77.34, 30: 75.83}
    result = reconcile_predictions(raw)
    assert result == pytest.approx({0: 76.35, 5: 76.35, 10: 76.35, 20: 76.35, 30: 75.83})
    assert raw[5] == 78.50


def test_crossing_horizons_are_pooled_without_reordering_cycles():
    result = reconcile_predictions({30: 70, 0: 90, 10: 80, 5: 85, 20: 82})
    assert result == pytest.approx({0: 90, 5: 85, 10: 81, 20: 81, 30: 70})


def test_all_future_increases_produce_a_plateau_without_inventing_degradation():
    raw = {0: 59.06, 5: 61.56, 10: 59.52, 20: 59.95, 30: 63.52}
    assert reconcile_predictions(raw) == pytest.approx(dict.fromkeys(raw, 59.06))
    assert raw[30] == 63.52


@pytest.mark.parametrize('raw', [
    {0: 95, 5: 90, 10: 85, 20: 80, 30: 75},
    {0: 80, 5: 80, 10: 80, 20: 80, 30: 80},
])
def test_consistent_forecasts_are_preserved(raw):
    assert reconcile_predictions(raw) == raw


@pytest.mark.parametrize('raw', [
    {0: 120, 5: 110, 10: -2, 20: -5, 30: -10},
    {0: -1, 5: 20, 10: 10, 20: 5, 30: 0},
])
def test_forecasts_stay_in_physical_range(raw):
    values = list(reconcile_predictions(raw).values())
    assert all(0 <= value <= 100 for value in values)
    assert values == sorted(values, reverse=True)


@pytest.mark.parametrize('value', [float('nan'), float('inf'), -float('inf')])
def test_invalid_predictions_are_rejected(value):
    with pytest.raises(ValueError):
        reconcile_predictions({0: 80, 5: value})
