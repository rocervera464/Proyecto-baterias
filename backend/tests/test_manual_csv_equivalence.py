"""Exercise the actual frontend converter then the real backend pipeline."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.telemetry import TelemetryRequest
from app.services.feature_engineering import extract_features


def test_manual_csv_equivalence_through_real_features_and_predictions():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node required to exercise frontend telemetry converter")
    root = Path(__file__).resolve().parents[2]
    script = """
import { validateManualTelemetry, manualImportOptions } from './frontend/src/utils/manualTelemetry.ts';
import { convertTelemetryCsv, readTelemetryCsv } from './frontend/src/utils/parseTelemetryCsv.ts';
const csv = 'time_s,voltage_v,current_a,temperature_c\\n0,4.1,-1.01,25\\n60,4.0,-1,26\\n300,3.8,-1,29';
const data = readTelemetryCsv(csv);
console.log(JSON.stringify({manual:validateManualTelemetry(data.rows).samples,csv:convertTelemetryCsv(data,manualImportOptions)}));
"""
    result = subprocess.run([node, "--input-type=module", "-e", script], cwd=root, capture_output=True, text=True, check=True, timeout=30)
    sources = json.loads(result.stdout)
    common = {"cycle": 25, "ambient_temperature_c": 4, "cutoff_voltage_v": 2.2,
              "previous_eis": {"re_ohm": None, "rct_ohm": 0.15},
              "previous_charge": {"temperature_start_c": 25, "temperature_max_c": None, "temperature_delta_c": 4}}
    manual = {**common, "discharge_samples": sources["manual"]}
    csv = {**common, "discharge_samples": sources["csv"]}
    assert manual == csv
    manual_features, manual_count = extract_features(TelemetryRequest(**manual))
    csv_features, csv_count = extract_features(TelemetryRequest(**csv))
    assert manual_features == csv_features
    assert len(manual_features) == 29 and manual_count == csv_count == 3
    client = TestClient(app)
    manual_result = client.post("/api/v1/predict", json=manual)
    csv_result = client.post("/api/v1/predict", json=csv)
    assert manual_result.status_code == csv_result.status_code == 200
    assert manual_result.json() == csv_result.json()
