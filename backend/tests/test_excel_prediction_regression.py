import json
import logging
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.file_import import import_file

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def excel_request():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node required to exercise the actual frontend file converter")
    path = ROOT / "data/samples/B0045_ciclo30_con_contexto.xlsx"
    table = import_file(path.read_bytes(), path.name)
    script = """
import fs from 'node:fs';
import {getDefaultImportOptions,convertTelemetryCsv} from './frontend/src/utils/parseTelemetryCsv.ts';
import {detectBatteryParameters} from './frontend/src/utils/batteryParameters.ts';
const table=JSON.parse(fs.readFileSync(0,'utf8'));
const options=getDefaultImportOptions(table);
const p=detectBatteryParameters(table,options);
console.log(JSON.stringify({cycle:Number(p.cycle),ambient_temperature_c:Number(p.ambient),
cutoff_voltage_v:Number(p.cutoff),measurement_level:p.level,chemistry:p.chemistry,
discharge_samples:convertTelemetryCsv(table,options)}));
"""
    result = subprocess.run([node, "--input-type=module", "-e", script], input=json.dumps(table),
                            cwd=ROOT, capture_output=True, text=True, check=True, timeout=30)
    return json.loads(result.stdout)


def test_verified_workbook_is_detected_and_predicted(excel_request):
    assert len(excel_request["discharge_samples"]) == 22
    assert excel_request["cycle"] == 30
    assert excel_request["ambient_temperature_c"] == 4
    assert excel_request["cutoff_voltage_v"] == 2
    assert excel_request["measurement_level"] == "cell"
    assert excel_request["chemistry"] == "li-ion"
    response = TestClient(app).post("/api/v1/predict", json=excel_request)
    assert response.status_code == 200, response.text
    assert response.json()["current_cycle"] == 30
    assert 0 <= response.json()["current_soh_percent"] <= 100


def test_wrong_ambient_returns_a_specific_reason_and_logs_it(excel_request, caplog):
    excel_request["ambient_temperature_c"] = 25
    excel_request["normalize_inputs"] = False  # strict opt-out keeps the original diagnostic path
    with caplog.at_level(logging.WARNING, logger="app.prediction"):
        response = TestClient(app).post("/api/v1/predict", json=excel_request)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "incompatible_telemetry"
    assert "Temperatura ambiente" in detail["message"]
    assert "25" in detail["message"]
    assert "incompatible_telemetry" in caplog.text
    assert "reason=" in caplog.text
    assert "discharge_samples" not in caplog.text


def test_missing_request_fields_are_logged_without_dumping_signals(excel_request, caplog):
    excel_request.pop("cycle")
    with caplog.at_level(logging.WARNING, logger="app.prediction"):
        response = TestClient(app).post("/api/v1/predict", json=excel_request)
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert "code=invalid_request" in caplog.text
    assert "body.cycle" in caplog.text
    assert "voltage_v" not in caplog.text
