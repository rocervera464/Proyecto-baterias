import importlib
import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.services import runtime_status

main = importlib.import_module("app.main")
BACKEND = Path(__file__).resolve().parents[1]


def test_startup_loads_models_and_readiness_reports_available_assets():
    with TestClient(main.app) as client:
        response = client.get("/health/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert len(data["models"]) == 2
        assert all(model["current_features"] > 0 for model in data["models"])
        assert data["telemetry_catalog"]["references"] == 924
        assert data["errors"] == []


def test_missing_model_blocks_startup_and_readiness(monkeypatch):
    def missing_models():
        raise FileNotFoundError("modelo de prueba ausente")

    monkeypatch.setattr(runtime_status, "get_registered_services", missing_models)
    client = TestClient(main.app)
    assert client.get("/health").status_code == 200
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert "modelo de prueba ausente" in response.json()["errors"][0]
    with pytest.raises(RuntimeError, match="modelo de prueba ausente"):
        with client:
            pass


def test_optional_catalog_does_not_disable_declared_telemetry(monkeypatch, tmp_path):
    monkeypatch.setattr(runtime_status, "CATALOG", tmp_path / "absent.json")
    monkeypatch.setattr(runtime_status, "load_catalog", lambda: {})
    data = runtime_status.check_runtime()
    assert data["status"] == "ready"
    assert not data["telemetry_catalog"]["available"]
    assert len(data["warnings"]) == 1


@pytest.mark.parametrize("origin", ["http://localhost:5174", "http://127.0.0.1:5175"])
def test_local_frontend_ports_can_call_api(origin):
    response = TestClient(main.app).options("/api/v1/predict", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize("origin", ["http://localhost.example.com:5173", "https://example.com"])
def test_cors_does_not_allow_unconfigured_external_origins(origin):
    response = TestClient(main.app).options("/api/v1/predict", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_explicit_cors_configuration(monkeypatch):
    monkeypatch.setenv("BATTERY_CORS_ORIGINS", "https://battery.example.com/, http://localhost:5180")
    monkeypatch.setenv("BATTERY_ALLOW_LOCAL_ORIGINS", "false")
    settings = get_settings()
    assert settings.cors_origins == ("https://battery.example.com", "http://localhost:5180")
    assert not settings.allow_local_origins


@pytest.mark.parametrize("origin", ["*", "https://example.com/path", "https://user:password@example.com", "file:///example", "http://localhost:bad"])
def test_invalid_cors_configuration_is_actionable(monkeypatch, origin):
    monkeypatch.setenv("BATTERY_CORS_ORIGINS", origin)
    with pytest.raises(ValueError):
        get_settings()


def test_diagnostic_runs_outside_project_directory(tmp_path):
    process = subprocess.run([sys.executable, str(BACKEND / "scripts/check_backend.py"), "--json"],
                             cwd=tmp_path, capture_output=True, text=True, timeout=30)
    assert process.returncode == 0, process.stderr
    report = json.loads(process.stdout)
    assert report["status"] == "ready"
    assert report["runtime"]["telemetry_catalog"]["references"] == 924
