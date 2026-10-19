import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_severe_csv_can_be_explored_without_masking_domain_deviations():
    """Exercise the user's file through the actual browser CSV adapter and API."""
    node = shutil.which("node")
    if not node:
        pytest.skip("Node required for actual frontend CSV conversion")
    root = Path(__file__).resolve().parents[2]
    script = """
import fs from 'node:fs';
import { readTelemetryCsv, getDefaultImportOptions, convertTelemetryCsv } from './frontend/src/utils/parseTelemetryCsv.ts';
const table = readTelemetryCsv(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify(convertTelemetryCsv(table, getDefaultImportOptions(table))));
"""
    csv = (root / "data/samples/voltscope_bateria_degradacion_severa.csv").read_text(encoding="utf-8-sig")
    converted = subprocess.run([node, "--input-type=module", "-e", script], input=csv,
                               cwd=root, text=True, capture_output=True, timeout=30, check=True)
    samples = json.loads(converted.stdout)
    assert len(samples) == 301
    assert samples[-1] == dict(time_s=300, voltage_v=2.9034, current_a=-1.5126, temperature_c=38.307)
    # These are the UI defaults, not context inferred from the filename or signals.
    request = dict(cycle=1, ambient_temperature_c=4, cutoff_voltage_v=2.2,
                   measurement_level="unknown", chemistry="unknown",
                   analysis_mode="strict", discharge_samples=samples)
    client = TestClient(app)
    strict = client.post("/api/v1/predict", json=request)
    assert strict.status_code == 422
    report = strict.json()["detail"]["compatibility"]
    assert report["feature_deviations"]
    assert not report["can_estimate_in_strict_mode"]
    exploratory = client.post("/api/v1/predict", json={**request, "analysis_mode": "exploratory"})
    assert exploratory.status_code == 200
    result = exploratory.json()
    assert result["compatibility"] == report
    values = [result["current_soh_percent"], *[item["predicted_soh_percent"] for item in result["future_predictions"]]]
    assert len(values) == 5
    assert all(0 <= value <= 100 for value in values)
    assert all(first >= second for first, second in zip(values, values[1:]))
