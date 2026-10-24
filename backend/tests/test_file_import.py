import io

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient
from scipy.io import savemat

from app.main import app

client = TestClient(app)


def example():
    return pd.DataFrame({"time_s": [0, 300], "voltage_v": [4.1, 3.8], "current_a": [-1, -1], "temperature_c": [4, 5]})


def test_xlsx_requires_explicit_sheet_selection_and_preserves_values():
    stream = io.BytesIO()
    with pd.ExcelWriter(stream, engine="openpyxl") as writer:
        example().to_excel(writer, sheet_name="Descarga", index=False)
        example().to_excel(writer, sheet_name="Otra", index=False)
    response = client.post("/api/v1/telemetry/import?filename=example.xlsx", content=stream.getvalue())
    assert response.status_code == 200
    assert response.json()["sheets"] == ["Descarga", "Otra"]
    assert response.json()["rows"] == []
    response = client.post("/api/v1/telemetry/import?filename=example.xlsx&sheet=Descarga", content=stream.getvalue())
    assert response.status_code == 200
    assert response.json()["rows"][1]["time_s"] == "300"


def test_parquet_and_mat_vectors_reach_same_common_table():
    stream = io.BytesIO()
    example().to_parquet(stream, index=False)
    parquet = client.post("/api/v1/telemetry/import?filename=example.parquet", content=stream.getvalue())
    assert parquet.status_code == 200
    stream = io.BytesIO()
    savemat(stream, {column: example()[column].to_numpy(dtype=float) for column in example()})
    mat = client.post("/api/v1/telemetry/import?filename=example.mat", content=stream.getvalue())
    assert mat.status_code == 200
    for a, b in zip(mat.json()["rows"], parquet.json()["rows"]):
        assert {k: float(v) for k, v in a.items()} == {k: float(v) for k, v in b.items()}


def test_bad_or_unsupported_files_return_actionable_error():
    assert client.post("/api/v1/telemetry/import?filename=x.xlsx", content=b"not an excel file").status_code == 422
    assert client.post("/api/v1/telemetry/import?filename=x.exe", content=b"abc").status_code == 422
    assert client.post("/api/v1/telemetry/import?filename=x.mat", content=b"").status_code == 422


def test_workbook_duplicate_headers_are_not_silently_renamed():
    stream = io.BytesIO()
    frame = pd.DataFrame([[0, 4.1, -1, 4], [300, 3.8, -1, 5]], columns=["time_s", "voltage_v", "current_a", "voltage_v"])
    frame.to_excel(stream, index=False)
    response = client.post("/api/v1/telemetry/import?filename=x.xlsx", content=stream.getvalue())
    assert response.status_code == 422
    assert "repetidos" in response.json()["detail"]


def test_nasa_mat_adapter_preserves_cycle_numbers_and_history():
    stream = io.BytesIO()
    discharge = {"type": "discharge", "ambient_temperature": 4., "data": {"Time": np.array([0., 300.]), "Voltage_measured": np.array([4.1, 3.8]), "Current_measured": np.array([-1., -1.]), "Temperature_measured": np.array([4., 5.])}}
    charge = {"type": "charge", "ambient_temperature": 4., "data": {"Temperature_measured": np.array([4., 7., 6.])}}
    savemat(stream, {"B0045": {"cycle": np.array([charge, discharge, discharge], dtype=object)}})
    response = client.post("/api/v1/telemetry/import?filename=B0045.mat", content=stream.getvalue())
    assert response.status_code == 200, response.text
    rows = response.json()["rows"]
    assert [row["cycle"] for row in rows] == ["1", "1", "2", "2"]
    assert rows[0]["charge_temp_delta_prev"] == "2.0"
    assert rows[0]["cutoff_voltage_v"] == "2.0"
