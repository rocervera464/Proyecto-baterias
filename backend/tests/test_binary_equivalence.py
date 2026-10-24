import io
import json
import shutil
import subprocess
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.telemetry import TelemetryRequest
from app.services.feature_engineering import extract_features
from app.services.file_import import import_file


def test_excel_parquet_csv_have_identical_features_and_predictions():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node required for actual frontend conversion")
    frame = pd.DataFrame({"time_s": [0, 60, 300], "voltage_v": [4.1, 4., 3.8], "current_a": [-1.01, -1., -1.], "temperature_c": [4.2, 4.6, 5.2]})
    excel, parquet = io.BytesIO(), io.BytesIO()
    frame.to_excel(excel, index=False)
    frame.to_parquet(parquet, index=False)
    sources = [import_file(excel.getvalue(), "data.xlsx"), import_file(parquet.getvalue(), "data.parquet")]
    script = """
import fs from 'node:fs';
import { convertTelemetryCsv, getDefaultImportOptions, readTelemetryCsv } from './frontend/src/utils/parseTelemetryCsv.ts';
const input = JSON.parse(fs.readFileSync(0,'utf8'));
const tables = [...input.tables, readTelemetryCsv(input.csv)];
const samples = tables.map(table => convertTelemetryCsv(table, getDefaultImportOptions(table)));
console.log(JSON.stringify(samples));
"""
    result = subprocess.run([node, "--input-type=module", "-e", script], input=json.dumps({"tables": sources, "csv": frame.to_csv(index=False)}), cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, timeout=30, check=True)
    samples = json.loads(result.stdout)
    assert samples[0] == samples[1] == samples[2]
    payloads = [{"cycle": 25, "ambient_temperature_c": 4, "cutoff_voltage_v": 2.2, "discharge_samples": rows} for rows in samples]
    features = [extract_features(TelemetryRequest(**payload))[0] for payload in payloads]
    assert features[0] == features[1] == features[2]
    client = TestClient(app)
    responses = [client.post("/api/v1/predict", json=payload) for payload in payloads]
    assert all(response.status_code == 200 for response in responses)
    assert responses[0].json() == responses[1].json() == responses[2].json()
