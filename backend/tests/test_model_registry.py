import json
from types import SimpleNamespace

from app.services import model_registry


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
