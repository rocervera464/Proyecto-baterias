"""Bounded, deterministic adapters for telemetry. No target or inferred metadata inputs."""
import csv
import io
import json
import logging
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.io as sio

from app.services.file_import import MAX_BYTES, MAX_ROWS, MAX_COLUMNS

logger = logging.getLogger("app.telemetry")
SIGNALS = ("time_s", "voltage_v", "current_a", "temperature_c")
ALIASES = {
    "time_s": ["time", "time_s", "timestamp", "timestamp_sec", "seconds", "second", "sec", "t", "t_s", "elapsed_time", "elapsed_time_s", "Time [s]", "tiempo", "tiempo_s", "time_ms", "timestamp_ms", "tiempo_ms", "time_min", "elapsed_time_min", "time_h"],
    "voltage_v": ["voltage", "voltage_v", "volt", "volts", "v", "battery_voltage", "Voltage_measured", "Battery Voltage [V]", "voltaje", "voltaje_v", "voltage_mv", "voltaje_mv", "battery_voltage_mv"],
    "current_a": ["current", "current_a", "amps", "amp", "a", "i", "discharge_current", "Current_measured", "Current [A]", "corriente", "corriente_a", "current_ma", "corriente_ma"],
    "temperature_c": ["temperature", "temperature_c", "temp", "temp_c", "celsius", "Temperature_measured", "Temperature [C]", "cell_temperature", "temperatura", "temperatura_c", "temperature_f", "temp_f", "temperature_k", "temp_k"],
}


def normalized(value):
    return re.sub(r"[^a-z0-9]", "", "".join(char for char in unicodedata.normalize("NFD", str(value).lower()) if not unicodedata.combining(char)))


def detect_columns(columns):
    mapping = {}
    for signal, names in ALIASES.items():
        matches = [str(column) for column in columns if normalized(column) in {normalized(name) for name in names}]
        if len(matches) > 1:
            raise ValueError(f"Columnas ambiguas para {signal}: {', '.join(matches)}. Conserva una sola columna de esa variable.")
        if matches:
            mapping[signal] = matches[0]
    return mapping


def json_records(payload, depth=0):
    if isinstance(payload, list): return payload
    if not isinstance(payload, dict) or depth >= 2:
        raise ValueError("El JSON debe contener una lista de mediciones reconocida.")
    candidates = [payload[key] for key in ["discharge_samples", "telemetry", "data", "samples", "measurements", "rows"] if isinstance(payload.get(key), (list, dict))]
    if len(candidates) != 1: raise ValueError("El JSON debe contener una sola lista de mediciones reconocida.")
    return json_records(candidates[0], depth + 1)


def declared_context(frame, include_cycle=True):
    """Optional labels restrict scope but never become model features."""
    result = {}
    aliases = {"measurement_level": {"measurementlevel", "nivelmedicion", "batterylevel"},
               "chemistry": {"chemistry", "batterychemistry", "quimica"}, "cycle": {"cycle", "cyclenumber", "cycleindex", "ciclo", "numerociclo"}}
    for key, names in aliases.items():
        if key == "cycle" and not include_cycle: continue
        columns = [name for name in frame if normalized(name) in names]
        if len(columns) != 1: continue
        strings = frame[columns[0]].dropna().astype(str).str.strip()
        values = strings[strings.ne("")].unique()
        if len(values) != 1: continue
        value = normalized(values[0])
        if key == "cycle":
            try:
                number = float(values[0])
                if np.isfinite(number) and number >= 1 and number.is_integer(): result[key] = int(number)
            except ValueError: pass
        elif key == "measurement_level":
            levels = {"cell": "cell", "celda": "cell", "singlecell": "cell", "module": "module", "modulo": "module", "pack": "pack", "paquete": "pack"}
            if value in levels: result[key] = levels[value]
        else:
            chemistries = {"liion": "li-ion", "lithiumion": "li-ion", "ionlitio": "li-ion", "lfp": "LFP", "lifepo4": "LFP", "leadacid": "lead-acid", "plomoacido": "lead-acid", "unknown": "unknown", "desconocida": "unknown", "na": "unknown", "nan": "unknown", "null": "unknown"}
            result[key] = chemistries.get(value, "other")
    return result


def select_segment(frame, segment=None):
    cycle = next((name for name in frame.columns if normalized(name) in {"cycle", "cyclenumber", "cycleindex", "ciclo", "numerociclo"}), None)
    battery = next((name for name in frame.columns if normalized(name) in {"batteryid", "battery", "bateria"}), None)
    mode = next((name for name in frame.columns if normalized(name) in {"operatingmode", "mode", "type", "tipo"}), None)
    if mode:
        discharge = frame[mode].astype(str).str.lower().str.strip().isin(["discharge", "descarga", "discharging"])
        if discharge.any(): frame = frame[discharge].copy()
    keys = [name for name in [battery, cycle] if name]
    groups = list(frame.groupby(keys, sort=False, dropna=False)) if keys else [(None, frame)]
    mapping = detect_columns(frame.columns)
    # Reset detection is used only for source-order blocks, never absolute cycle inference.
    segments = []
    for key, group in groups:
        times = pd.to_numeric(group[mapping["time_s"]], errors="coerce") if "time_s" in mapping else pd.Series(dtype=float)
        reset = (times.eq(0) & times.shift().gt(0) & times.shift(-1).gt(0)).cumsum() if len(times) else pd.Series(0, index=group.index)
        for _, block in group.groupby(reset, sort=False):
            segments.append((key, block))
    if not segments: raise ValueError("No se encontraron muestras de descarga en el archivo.")
    index = 0 if segment is None else int(segment)
    if index < 0 or index >= len(segments): raise ValueError("El tramo seleccionado no existe.")
    return segments[index][1], [{"id": str(i), "label": str(key) if key is not None else f"Descarga {i + 1}", "samples": len(block)} for i, (key, block) in enumerate(segments)], str(index)


def matlab_tables(content):
    try: data = sio.loadmat(io.BytesIO(content), squeeze_me=True, struct_as_record=False)
    except NotImplementedError as error: raise ValueError("El MAT HDF5 no está soportado. Usa un MAT estándar o exporta una tabla de telemetría.") from error
    tables = {}
    for name, value in data.items():
        if name.startswith("__"): continue
        if hasattr(value, "cycle"):
            records, cycle = [], 0
            for operation in np.atleast_1d(value.cycle):
                if str(operation.type).lower().strip() != "discharge": continue
                cycle += 1
                arrays = [np.asarray(getattr(operation.data, field, []), dtype=float).ravel() for field in ["Time", "Voltage_measured", "Current_measured", "Temperature_measured"]]
                if len({len(array) for array in arrays}) != 1: raise ValueError("El MAT contiene señales con longitudes diferentes.")
                for row in zip(*arrays):
                    if 0 <= row[0] <= 300: records.append({**dict(zip(SIGNALS, map(float, row))), "cycle": cycle, "battery_id": name, "operating_mode": "discharge"})
                if len(records) > MAX_ROWS: raise ValueError("El MAT supera 100 000 muestras de ventanas de descarga.")
            if records: tables[name] = pd.DataFrame(records)
        elif hasattr(value, "_fieldnames"):
            vectors = {field: np.atleast_1d(getattr(value, field)).ravel() for field in value._fieldnames if isinstance(getattr(value, field), np.ndarray)}
            if len(vectors) >= 4 and len({len(v) for v in vectors.values()}) == 1: tables[name] = pd.DataFrame(vectors)
    if not tables:
        vectors = {name: np.atleast_1d(value).ravel() for name, value in data.items() if not name.startswith("__") and isinstance(value, np.ndarray) and (value.ndim == 1 or value.ndim == 2 and 1 in value.shape)}
        if len(vectors) >= 4 and len({len(v) for v in vectors.values()}) == 1: tables["telemetry"] = pd.DataFrame(vectors)
    if not tables: raise ValueError("El formato MAT no contiene una estructura de telemetría compatible.")
    return tables


def read_table(content, filename, sheet=None):
    if not content or len(content) > MAX_BYTES: raise ValueError("Archivo vacío o mayor que 40 MB.")
    suffix = Path(filename).suffix.lower()
    sheets, selected = [], None
    if suffix in {".csv", ".tsv", ".txt"}:
        encoding = "utf-16" if content[:2] in {b"\xff\xfe", b"\xfe\xff"} else "utf-8-sig"
        text = content.decode(encoding)
        try: dialect = csv.Sniffer().sniff(text[:16384], delimiters=",;\t|")
        except csv.Error as error: raise ValueError("No se pudo determinar el separador del archivo de texto.") from error
        reader = csv.reader(io.StringIO(text), dialect=dialect)
        header = next(reader, [])
        rows = []
        for index, row in enumerate(reader):
            if index >= MAX_ROWS: raise ValueError("El archivo supera 100 000 filas.")
            if not row or not any(value.strip() for value in row): continue
            if len(row) != len(header): raise ValueError(f"Fila {index + 2}: número de columnas diferente al encabezado.")
            rows.append(row)
        frame = pd.DataFrame(rows, columns=header)
    elif suffix == ".json":
        payload = json.loads(content.decode("utf-8-sig"))
        payload = json_records(payload)
        if not isinstance(payload, list) or not payload or any(not isinstance(row, dict) for row in payload): raise ValueError("El JSON debe contener registros de telemetría en una lista.")
        frame = pd.DataFrame(payload)
    elif suffix in {".xlsx", ".xls"}:
        book = pd.ExcelFile(io.BytesIO(content), engine="openpyxl" if suffix == ".xlsx" else "xlrd")
        sheets = book.sheet_names
        if sheet is not None and sheet not in sheets: raise ValueError("La hoja seleccionada no existe.")
        if sheet is None:
            ranks = []
            for index, name in enumerate(sheets):
                preview = pd.read_excel(book, sheet_name=name, header=None, nrows=1)
                header = preview.iloc[0].tolist() if not preview.empty else []
                try: count = len(detect_columns(header))
                except ValueError: count = -1
                ranks.append((count, normalized(name) in {"telemetry", "data", "discharge", "measurements", "telemetria", "datos"}, -index, name))
            selected = max(ranks)[-1]
        else: selected = sheet
        raw = pd.read_excel(book, sheet_name=selected, header=None, dtype=object, nrows=MAX_ROWS + 2)
        if raw.empty: raise ValueError("La hoja seleccionada está vacía.")
        frame = raw.iloc[1:].copy(); frame.columns = raw.iloc[0].tolist()
    elif suffix == ".parquet":
        import pyarrow.parquet as pq
        source = pq.ParquetFile(io.BytesIO(content))
        if source.metadata.num_rows > MAX_ROWS: raise ValueError("El archivo supera 100 000 filas.")
        frame = source.read().to_pandas()
    elif suffix == ".mat":
        tables = matlab_tables(content); sheets = list(tables)
        selected = sheet or sheets[0]
        if selected not in tables: raise ValueError("La tabla MAT seleccionada no existe.")
        frame = tables[selected]
    else: raise ValueError("Formato no soportado. Usa CSV, TSV, TXT, JSON, XLSX, XLS, Parquet o MAT.")
    frame.columns = [str(column).strip() for column in frame.columns]
    if len(frame) > MAX_ROWS or len(frame.columns) > MAX_COLUMNS: raise ValueError("El archivo supera el límite de filas o columnas.")
    if len(set(frame.columns)) != len(frame.columns) or any(not name for name in frame.columns): raise ValueError("Hay encabezados vacíos o repetidos.")
    return frame, sheets, selected


def canonical_samples(frame):
    mapping = detect_columns(frame.columns)
    labels = {"time_s": "tiempo", "voltage_v": "voltaje", "current_a": "corriente", "temperature_c": "temperatura"}
    for field in SIGNALS:
        if field not in mapping: raise ValueError(f"No se pudo identificar la columna de {labels[field]}.")
    samples = []
    time_column = mapping["time_s"]
    first = next((str(value) for value in frame[time_column] if pd.notna(value) and str(value).strip()), "")
    date_times = None
    if re.search(r"\d{4}-\d\d-\d\d", first):
        date_times = pd.to_datetime(frame[time_column], format="mixed", errors="coerce", utc=True)
        origin = date_times.min()
    elif normalized(time_column) in {"timestamp", "timestampms", "timestampsec"}:
        numeric = pd.to_numeric(frame[time_column], errors="coerce")
        if numeric.notna().all() and numeric.min() >= 1e9:
            unit = "ms" if normalized(time_column).endswith("ms") or numeric.min() >= 1e12 else "s"
            date_times = pd.to_datetime(numeric, unit=unit, errors="coerce", utc=True)
            if date_times.isna().any(): raise ValueError("Las marcas temporales no contienen fechas válidas.")
            origin = date_times.min()
    for index, row in frame.iterrows():
        result = {}
        for field in SIGNALS:
            column = mapping[field]; key = normalized(column)
            raw = row[column]
            if field == "time_s" and date_times is not None:
                value = float((date_times.loc[index] - origin).total_seconds())
            else:
                text = str(raw).strip().replace("−", "-").replace(",", ".")
                match = re.fullmatch(r"([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z°]*)", text)
                value = float(match[1]) if match else float("nan")
                unit = (match[2] if match else "").lower().replace("°", "")
                supported = {"time_s": {"s", "ms", "min", "h"}, "voltage_v": {"v", "mv"},
                             "current_a": {"a", "ma"}, "temperature_c": {"c", "f", "k"}}
                if unit and unit not in supported[field]:
                    raise ValueError(f"Unidad no soportada en {column}: {unit}.")
                if field == "time_s":
                    unit = unit or ("ms" if key.endswith("ms") else "min" if key.endswith("min") else "h" if key.endswith("h") else "s")
                    value *= {"ms": .001, "min": 60, "h": 3600, "s": 1}[unit]
                if field == "voltage_v" and (unit or ("mv" if key.endswith("mv") else "v")) == "mv": value *= .001
                if field == "current_a" and (unit or ("ma" if key.endswith("ma") else "a")) == "ma": value *= .001
                if field == "temperature_c":
                    unit = unit or ("f" if key.endswith("f") else "k" if key.endswith("k") else "c")
                    if unit == "f": value = (value - 32) * 5 / 9
                    elif unit == "k": value -= 273.15
            result[field] = value
        samples.append(result)
    return samples, mapping


def parse_file(content, filename, sheet=None, segment=None):
    logger.info("file_received filename=%r format=%s bytes=%s", Path(filename).name, Path(filename).suffix, len(content))
    frame, sheets, selected_sheet = read_table(content, filename, sheet)
    chosen, segments, selected_segment = select_segment(frame, segment)
    samples, mapping = canonical_samples(chosen)
    logger.info("telemetry_import format=%s aliases_applied=%s samples=%s selected_sheet=%s segment=%s", Path(filename).suffix, mapping, len(samples), selected_sheet, selected_segment)
    return samples, {"filename": Path(filename).name, "format": Path(filename).suffix.lstrip(".").upper(),
        "declared_context": declared_context(chosen, include_cycle=Path(filename).suffix.lower() != ".mat"),
        "aliases_applied": mapping, "sheets": sheets, "selected_sheet": selected_sheet,
        "segments": segments, "selected_segment": selected_segment}
