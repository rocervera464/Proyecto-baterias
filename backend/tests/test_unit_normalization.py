import pytest
from pydantic import ValidationError

from app.schemas.telemetry import TelemetryRequest
from app.services.feature_engineering import extract_features


def payload():
    return dict(cycle=168, ambient_temperature_c=24, cutoff_voltage_v=2.5,
                discharge_samples=[dict(time_s=0, voltage_v=4, current_a=-2, temperature_c=25),
                                   dict(time_s=300, voltage_v=3.6, current_a=-2, temperature_c=35)],
                previous_eis=dict(re_ohm=.1, rct_ohm=.2),
                previous_charge=dict(temperature_start_c=20, temperature_max_c=35, temperature_delta_c=10))


def test_declared_units_match_canonical_features_and_round_trip():
    canonical = TelemetryRequest(**payload())
    converted = payload()
    converted.update(units=dict(time="ms", voltage="mV", current="mA", temperature="F", resistance="mohm"),
                     ambient_temperature_c=75.2, cutoff_voltage_v=2500,
                     previous_eis=dict(re_ohm=100, rct_ohm=200),
                     previous_charge=dict(temperature_start_c=68, temperature_max_c=95, temperature_delta_c=18))
    converted["discharge_samples"] = [dict(time_s=0, voltage_v=4000, current_a=-2000, temperature_c=77),
                                      dict(time_s=300000, voltage_v=3600, current_a=-2000, temperature_c=95)]
    request = TelemetryRequest(**converted)
    assert extract_features(request)[0] == pytest.approx(extract_features(canonical)[0])
    assert TelemetryRequest.model_validate(request.model_dump()).model_dump() == request.model_dump()


def test_kelvin_and_real_extremes_are_not_clipped():
    data = payload()
    data.update(units=dict(temperature="K"), ambient_temperature_c=297.15,
                previous_charge=dict(temperature_start_c=293.15, temperature_max_c=308.15, temperature_delta_c=10))
    data["discharge_samples"][0]["temperature_c"] = 373.15
    request = TelemetryRequest(**data)
    assert request.discharge_samples[0].temperature_c == 100
    assert request.previous_charge.temperature_delta_c == 10
    assert request.ambient_temperature_c == pytest.approx(24)
    assert TelemetryRequest(**payload()).discharge_samples[0].voltage_v == 4


@pytest.mark.parametrize("units", [dict(voltage="kV"), dict(time="unknown")])
def test_unsupported_units_rejected(units):
    with pytest.raises(ValidationError):
        TelemetryRequest(**payload(), units=units)


def test_malformed_measurement_rejected():
    data = payload()
    data["discharge_samples"][0]["voltage_v"] = {}
    with pytest.raises(ValidationError):
        TelemetryRequest(**data, units=dict(voltage="mV"))
