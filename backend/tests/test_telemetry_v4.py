import io
import json
import math
from copy import deepcopy
from pathlib import Path
from shutil import copytree

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from scipy.io import savemat

from app.main import app
from app.services.feature_engineering import extract_telemetry_features, clean_telemetry, TELEMETRY_ALL_FEATURES
from app.services.model_service import get_telemetry_model_services, TelemetryModelService

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def signals(real_payload):
    return real_payload["discharge_samples"]


def test_minimum_input_runs_real_models_without_context(signals):
    response = client.post("/api/v1/predict", json={"discharge_samples": signals})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["model_family"] == "XGBoost telemetry v4"
    assert result["current_cycle"] is None
    assert result["telemetry"]["samples_used"] == len(signals)
    assert result["telemetry"]["window_seconds"] == 300
    assert math.isfinite(result["current_soh_percent"]) and 0 <= result["current_soh_percent"] <= 120
    service = get_telemetry_model_services()[0]
    features, _ = extract_telemetry_features(signals)
    assert result["current_soh_percent"] == service.predict(features)[0]
    assert result["production_horizons"] == service.production_horizons
    assert result["research_horizons"] == service.research_horizons
    assert [item["horizon_cycles"] for item in result["future_predictions"]] == result["forecast_horizons"] == [5, 10, 20, 30]
    assert "precisión limitada" in result["forecast_note"]
    previous = result["current_soh_percent"]
    for future in result["future_predictions"]:
        assert future["validation_status"] == ("production" if future["horizon_cycles"] in service.production_horizons else "research")
        assert future["target_cycle"] is None
        assert 0 <= future["predicted_soh_percent"] <= previous
        previous = future["predicted_soh_percent"]


def test_experiment_context_cannot_change_model_inputs_or_prediction(signals):
    minimal = client.post("/api/v1/predict", json={"discharge_samples": signals}).json()
    contextual = client.post("/api/v1/predict", json={"discharge_samples": signals, "cycle": 999,
        "ambient_temperature_c": 1000, "cutoff_voltage_v": 4500, "previous_eis": {"re_ohm": 99},
        "previous_charge": {"temperature_start_c": 999}, "capacity": .01, "future_soh": 1}).json()
    assert minimal["current_soh_percent"] == contextual["current_soh_percent"]
    assert [item["predicted_soh_percent"] for item in minimal["future_predictions"]] == [item["predicted_soh_percent"] for item in contextual["future_predictions"]]
    assert contextual["current_cycle"] == 999  # label only, never a model feature


def test_feature_function_ignores_later_data_targets_and_input_order(signals):
    expected, _ = extract_telemetry_features(signals)
    extra = {"time_s": 600, "voltage_v": float("nan"), "current_a": float("inf"), "temperature_c": -999}
    actual, _ = extract_telemetry_features(list(reversed(signals)) + [extra])
    assert actual == expected
    assert set(actual) == set(TELEMETRY_ALL_FEATURES)
    assert not set(actual) & {"cycle", "capacity", "q_ref", "ambient_temperature", "cutoff_voltage", "soh", "future_soh"}


def test_cleaning_removes_only_identical_duplicates_and_isolated_invalid_rows(signals):
    duplicated = deepcopy(signals) + [deepcopy(signals[0])]
    _, quality = clean_telemetry(duplicated)
    assert quality["duplicate_rows_removed"] == 1
    conflicted = deepcopy(duplicated); conflicted[-1]["voltage_v"] += .1
    with pytest.raises(ValueError, match="mismo tiempo"): clean_telemetry(conflicted)
    bad = deepcopy(signals); bad[10]["temperature_c"] = float("nan")
    _, quality = clean_telemetry(bad)
    assert quality["invalid_rows_removed"] == 1
    bad[11]["temperature_c"] = float("nan")
    with pytest.raises(ValueError, match="bloque|demasiadas"): clean_telemetry(bad)


@pytest.mark.parametrize("count", [2, 3])
def test_insufficient_measurements_never_reach_prediction(signals, count):
    response = client.post("/api/v1/predict", json={"discharge_samples": signals[:count]})
    assert response.status_code == 422
    assert "suficientes muestras" in response.json()["detail"]


def test_declared_value_units_are_converted_once_and_unknown_units_rejected(signals):
    frame = pd.DataFrame(signals).rename(columns={"voltage_v": "Voltage [mV]"})
    # Explicit units in a value take precedence over a column unit, without a
    # second conversion. A reader must never silently discard an unknown unit.
    frame["Voltage [mV]"] = [f"{sample['voltage_v']} V" for sample in signals]
    response = client.post("/api/v1/predict-file?filename=values.csv", content=frame.to_csv(index=False).encode())
    baseline = client.post("/api/v1/predict", json={"discharge_samples": signals})
    assert response.status_code == 200, response.text
    assert response.json()["current_soh_percent"] == baseline.json()["current_soh_percent"]
    frame.loc[0, "Voltage [mV]"] = "4.1 foo"
    response = client.post("/api/v1/predict-file?filename=values.csv", content=frame.to_csv(index=False).encode())
    assert response.status_code == 422
    assert "Unidad no soportada" in response.json()["detail"]


def test_missing_signal_nonfinite_or_pack_inputs_are_rejected(signals):
    missing = deepcopy(signals); missing[0].pop("temperature_c")
    assert client.post("/api/v1/predict", json={"discharge_samples": missing}).status_code == 422
    raw = json.dumps({"discharge_samples": [{**sample, "temperature_c": float("nan")} for sample in signals]})
    invalid = client.post("/api/v1/predict", content=raw, headers={"Content-Type": "application/json"})
    assert invalid.status_code == 422
    assert "NaN" not in invalid.text
    for context in ({"measurement_level": "pack"}, {"chemistry": "LFP"}):
        response = client.post("/api/v1/predict", json={"discharge_samples": signals, **context})
        assert response.status_code == 422


@pytest.mark.parametrize("suffix,separator,spanish,envelope", [
    ("csv", ",", False, None), ("csv", ",", False, "extra"), ("tsv", "\t", True, None),
    ("txt", ";", True, None), ("json", None, False, None), ("json", None, False, "telemetry"), ("json", None, False, "data"),
])
def test_text_and_json_formats_reach_identical_real_prediction(signals, suffix, separator, spanish, envelope):
    frame = pd.DataFrame(signals)
    if spanish: frame = frame.rename(columns=dict(zip(frame.columns, ["Tiempo [s]", "Voltaje (V)", "Corriente [A]", "Temperatura °C"])))
    if envelope == "extra": frame["capacity"] = .01; frame["soc"] = 1
    if suffix == "json":
        records = frame.to_dict("records"); content = json.dumps({envelope: records} if envelope else records).encode()
    else: content = frame.to_csv(index=False, sep=separator).encode()
    response = client.post(f"/api/v1/predict-file?filename=test.{suffix}", content=content)
    assert response.status_code == 200, response.text
    baseline = client.post("/api/v1/predict", json={"discharge_samples": signals}).json()
    assert response.json()["current_soh_percent"] == baseline["current_soh_percent"]


@pytest.mark.parametrize("kind", ["xlsx", "parquet", "mat", "nasa_mat"])
def test_binary_formats_use_the_shared_prediction_pipeline(signals, kind):
    frame, stream = pd.DataFrame(signals), io.BytesIO()
    if kind == "xlsx":
        with pd.ExcelWriter(stream, engine="openpyxl") as writer:
            pd.DataFrame({"note": ["ignore"]}).to_excel(writer, sheet_name="Notes", index=False)
            pd.DataFrame().to_excel(writer, sheet_name="Empty", index=False)
            frame.to_excel(writer, sheet_name="telemetry", index=False)
    elif kind == "parquet": frame.to_parquet(stream, index=False)
    elif kind == "mat": savemat(stream, {name: frame[name].to_numpy() for name in frame})
    else:
        data = dict(zip(["Time", "Voltage_measured", "Current_measured", "Temperature_measured"], [frame[name].to_numpy() for name in frame]))
        data["Capacity"] = .01  # ignored input label
        savemat(stream, {"B0046": {"cycle": np.array([{"type": "discharge", "data": data}], dtype=object)}})
    suffix = "mat" if kind == "nasa_mat" else kind
    response = client.post(f"/api/v1/predict-file?filename=sample.{suffix}", content=stream.getvalue())
    assert response.status_code == 200, response.text
    assert response.json()["current_soh_percent"] == client.post("/api/v1/predict", json={"discharge_samples": signals}).json()["current_soh_percent"]
    if kind == "xlsx": assert response.json()["telemetry"]["selected_sheet"] == "telemetry"


def test_explicit_units_and_date_time_normalize_before_features(signals):
    frame = pd.DataFrame(signals)
    frame["time_ms"] = frame.pop("time_s") * 1000
    frame["voltage_mv"] = frame.pop("voltage_v") * 1000
    frame["current_ma"] = frame.pop("current_a") * 1000
    frame["temperature_f"] = frame.pop("temperature_c") * 9 / 5 + 32
    response = client.post("/api/v1/predict-file?filename=units.csv", content=frame.to_csv(index=False).encode())
    assert response.status_code == 200, response.text
    assert response.json()["current_soh_percent"] == client.post("/api/v1/predict", json={"discharge_samples": signals}).json()["current_soh_percent"]
    frame = pd.DataFrame(signals)
    frame["timestamp"] = (pd.Timestamp("2025-01-01", tz="UTC") + pd.to_timedelta(frame.pop("time_s"), unit="s")).astype(str)
    assert client.post("/api/v1/predict-file?filename=dates.csv", content=frame.to_csv(index=False).encode()).status_code == 200


def test_multiple_cycles_are_never_concatenated(signals):
    first = pd.DataFrame(signals).assign(cycle=1, battery_id="test")
    second = pd.DataFrame(signals).assign(cycle=2, battery_id="test")
    content = pd.concat([first, second]).to_csv(index=False).encode()
    preview = client.post("/api/v1/telemetry/import?filename=cycles.csv", content=content)
    assert preview.status_code == 200, preview.text
    assert len(preview.json()["segments"]) == 2
    assert len(preview.json()["rows"]) == len(signals)
    other = client.post("/api/v1/predict-file?filename=cycles.csv&segment=1", content=content)
    assert other.status_code == 200
    assert other.json()["telemetry"]["selected_segment"] == "1"


def test_real_biff_xls_file_reaches_the_same_prediction(signals):
    # Saved BIFF8 fixture generated with xlwt 1.3.0 from B0046_cycle25.json;
    # running tests only needs the production xlrd reader, not the writer.
    content = (Path(__file__).parent / "fixtures/B0046_cycle25.xls").read_bytes()
    response = client.post("/api/v1/predict-file?filename=telemetry.xls", content=content)
    assert response.status_code == 200, response.text
    assert response.json()["current_soh_percent"] == client.post("/api/v1/predict", json={"discharge_samples": signals}).json()["current_soh_percent"]


@pytest.mark.parametrize("missing", ["time_s", "voltage_v", "current_a", "temperature_c"])
def test_importer_explains_missing_columns(signals, missing):
    content = pd.DataFrame(signals).drop(columns=[missing]).to_csv(index=False).encode()
    response = client.post("/api/v1/predict-file?filename=missing.csv", content=content)
    assert response.status_code == 422
    assert "columna" in response.json()["detail"]


def test_importer_explains_ambiguity_corruption_and_unsupported_formats(signals):
    frame = pd.DataFrame(signals); frame["voltage"] = frame.voltage_v
    response = client.post("/api/v1/predict-file?filename=ambiguous.csv", content=frame.to_csv(index=False).encode())
    assert response.status_code == 422 and "ambiguas" in response.json()["detail"]
    for name, content in [("bad.xlsx", b"broken"), ("bad.json", b"{broken"), ("file.exe", b"x"), ("file.mat", b"broken")]:
        response = client.post(f"/api/v1/predict-file?filename={name}", content=content)
        assert response.status_code == 422 and isinstance(response.json()["detail"], str)


def test_only_production_horizons_are_executed(signals, monkeypatch):
    features, _ = extract_telemetry_features(signals)
    for service in get_telemetry_model_services():
        calls = []
        def predict(frame):
            calls.append(frame.horizon_cycles.tolist())
            return np.arange(len(frame), dtype=float)
        monkeypatch.setattr(service.future_model, "predict", predict)
        service.predict(features)
        assert calls == ([service.production_horizons] if service.production_horizons else [])


@pytest.mark.parametrize("file", ["features.json", "xgboost_soh_degradation.json"])
def test_artifact_integrity_rejects_modified_files(tmp_path, file):
    directory = tmp_path / "model"
    copytree(get_telemetry_model_services()[0].model_dir, directory)
    (directory / file).write_text('["capacity"]' if file == "features.json" else "corrupt", encoding="utf-8")
    with pytest.raises(RuntimeError): TelemetryModelService(directory)


def test_training_reports_prove_grouped_validation_and_no_context_inputs():
    for service in get_telemetry_model_services():
        directory = service.model_dir
        audit = json.loads((directory / "leakage_audit.json").read_text())
        assert audit["forbidden_inputs_present"] == []
        assert audit["outer_test_used_for_tuning"] is False
        assert audit["random_row_split"] is False
        selections = json.loads((directory / "selection_audit.json").read_text())
        assert len(selections) == 4
        for fold in selections:
            assert fold["test_battery"] not in fold["train_batteries"]
            for candidate in fold["current_candidates"] + fold["future_candidates"]:
                for inner in candidate["folds"]:
                    assert fold["test_battery"] not in inner["train_batteries"]
                    assert inner["validation_battery"] not in inner["train_batteries"]
                    assert fold["test_battery"] != inner["validation_battery"]
        assert service.current_model.n_features_in_ == len(service.features)
        assert service.future_model.n_features_in_ == len(service.features) + 1


def test_nested_json_is_bounded_and_numeric_timestamps_are_normalized(signals):
    records = pd.DataFrame(signals)
    records["timestamp_ms"] = 1_735_689_600_000 + records.pop("time_s") * 1000
    payload = {"data": {"telemetry": records.to_dict("records")}}
    response = client.post("/api/v1/predict-file?filename=measurements.json", content=json.dumps(payload).encode())
    assert response.status_code == 200, response.text
    baseline = client.post("/api/v1/predict", json={"discharge_samples": signals}).json()
    assert response.json()["current_soh_percent"] == baseline["current_soh_percent"]


def test_future_model_is_monotonic_without_mislabeling_research_as_validated(signals):
    features, _ = extract_telemetry_features(signals)
    for service in get_telemetry_model_services():
        frame = pd.DataFrame([{**{name: features[name] for name in service.features}, "horizon_cycles": h} for h in [5, 10, 20, 30]], columns=service.future_features)
        degradation = service.future_model.predict(frame)
        if service.manifest["future_monotonic"]: assert (np.diff(degradation) >= -1e-6).all()
        validation = json.loads((service.model_dir / "validation_metrics.json").read_text())
        for metric in validation["summary"]["selected"]["horizons"]:
            if metric["horizon"] and metric["r2"] <= 0:
                assert metric["horizon"] not in service.production_horizons


def test_research_forecasts_can_be_disabled_without_changing_current_estimate(signals):
    enabled = client.post("/api/v1/predict", json={"discharge_samples": signals}).json()
    response = client.post("/api/v1/predict", json={"discharge_samples": signals, "include_research_forecasts": False})
    assert response.status_code == 200
    strict = response.json()
    assert strict["forecast_horizons"] == strict["production_horizons"] == []
    assert strict["future_predictions"] == [] and strict["forecast_note"] is None
    assert strict["current_soh_percent"] == enabled["current_soh_percent"]
    content = pd.DataFrame(signals).to_csv(index=False).encode()
    file_result = client.post("/api/v1/predict-file?filename=signals.csv&include_research_forecasts=false", content=content).json()
    assert file_result["future_predictions"] == []
    assert file_result["current_soh_percent"] == strict["current_soh_percent"]


def test_explicit_file_pack_context_is_preserved_as_scope_metadata(signals):
    content = pd.DataFrame(signals).assign(measurement_level="pack", cycle=30).to_csv(index=False).encode()
    preview = client.post("/api/v1/telemetry/import?filename=pack.csv", content=content)
    assert preview.status_code == 200
    assert preview.json()["telemetry"]["declared_context"] == {"measurement_level": "pack", "cycle": 30}
    response = client.post("/api/v1/predict-file?filename=pack.csv", content=content)
    assert response.status_code == 422
    assert "dominio" in response.json()["detail"]["message"]


def test_empty_optional_context_does_not_require_user_input(signals):
    content = pd.DataFrame(signals).assign(chemistry="", measurement_level="", cycle="").to_csv(index=False).encode()
    response = client.post("/api/v1/predict-file?filename=optional.csv", content=content)
    assert response.status_code == 200, response.text
    assert response.json()["current_cycle"] is None
