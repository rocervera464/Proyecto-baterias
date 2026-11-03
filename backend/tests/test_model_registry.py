import json
from types import SimpleNamespace

from app.services import model_registry
from app.schemas.telemetry import TelemetryRequest


def test_family_selection_uses_measured_features_not_requested_health(tmp_path, monkeypatch):
    cold = tmp_path / "cold"
    room = tmp_path / "room"
    for path, low, high in [(cold, 4, 4), (room, 24, 24)]:
        path.mkdir()
        (path / "domain_profile.json").write_text(json.dumps({"ranges": {"ambient_temperature": {"min": low, "max": high}}}))
    original = SimpleNamespace(model_dir=cold)
    additional = SimpleNamespace(model_dir=room)
    registry = tmp_path / "registry.json"
    registry.write_text(json.dumps({"families": [{"enabled": True, "directory": "room"}]}))
    monkeypatch.setattr(model_registry, "REGISTRY", registry)
    monkeypatch.setattr(model_registry, "get_model_service", lambda: original)
    monkeypatch.setattr(model_registry, "load_family", lambda directory: additional)
    assert model_registry.select_model_service({"ambient_temperature": 4}) is original
    assert model_registry.select_model_service({"ambient_temperature": 24}) is additional


def test_selection_checks_sampling_compatibility_before_choosing_nearest_family(tmp_path, monkeypatch):
    services = []
    for name, minimum in [("dense", 21), ("sparse", 2)]:
        directory = tmp_path / name
        directory.mkdir()
        (directory / "domain_profile.json").write_text(json.dumps({
            "ranges": {"ambient_temperature": {"min": 24, "max": 24}}, "minimum_window_samples": minimum,
        }))
        (directory / "metadata.json").write_text('{}')
        services.append(SimpleNamespace(model_dir=directory))
    monkeypatch.setattr(model_registry, "get_registered_services", lambda: services)
    request = TelemetryRequest(cycle=30, ambient_temperature_c=24, cutoff_voltage_v=2.2,
        measurement_level="cell", chemistry="li-ion", discharge_samples=[
            {"time_s": 0, "voltage_v": 4.2, "current_a": -.01, "temperature_c": 24},
            {"time_s": 300, "voltage_v": 3.8, "current_a": -2, "temperature_c": 26},
        ])
    assert model_registry.select_model_service({"ambient_temperature": 24}, request) is services[1]
