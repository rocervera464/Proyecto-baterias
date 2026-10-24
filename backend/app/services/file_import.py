"""File adapters produce a common table; feature computation stays downstream."""
import io
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.io as sio

MAX_ROWS = 100_000
MAX_COLUMNS = 200
MAX_BYTES = 40 * 1024 * 1024


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if isinstance(value, (list, dict, np.ndarray)):
        raise ValueError("Hay columnas anidadas. Selecciona o exporta una tabla plana de mediciones.")
    if pd.isna(value):
        return ""
    return str(value)


def table(frame):
    if len(frame) > MAX_ROWS or len(frame.columns) > MAX_COLUMNS:
        raise ValueError("La tabla supera el límite de 100 000 filas o 200 columnas. Selecciona un tramo menor.")
    fields = [str(column).strip() for column in frame.columns]
    if len(set(fields)) != len(fields) or any(not field for field in fields):
        raise ValueError("Hay encabezados vacíos o repetidos. Corrígelos antes de importar.")
    if len(frame) < 2:
        raise ValueError("Se requieren al menos dos filas de mediciones.")
    return {"fields": fields, "rows": [dict(zip(fields, map(cell_text, values))) for values in frame.itertuples(index=False, name=None)]}


def mat_tables(content):
    try:
        payload = sio.loadmat(io.BytesIO(content), squeeze_me=True, struct_as_record=False)
    except NotImplementedError as error:
        raise ValueError("Este MAT usa un formato HDF5 no soportado. Exporta sus señales como CSV, Excel o Parquet.") from error
    results = {}
    for name, value in payload.items():
        if name.startswith("__"):
            continue
        if hasattr(value, "cycle"):
            rows = []
            cycle_number = 0
            history = {"re_ohm": np.nan, "rct_ohm": np.nan, "charge_temp_start_prev": np.nan,
                       "charge_temp_max_prev": np.nan, "charge_temp_delta_prev": np.nan}
            for operation in np.atleast_1d(value.cycle):
                kind = str(operation.type).strip().lower()
                if kind == "impedance":
                    for source, target in [("Re", "re_ohm"), ("Rct", "rct_ohm")]:
                        array = np.asarray(getattr(operation.data, source, []), dtype=float).ravel()
                        history[target] = float(array[0]) if array.size == 1 and np.isfinite(array[0]) else np.nan
                if kind == "charge":
                    temperatures = np.asarray(getattr(operation.data, "Temperature_measured", []), dtype=float).ravel()
                    temperatures = temperatures[np.isfinite(temperatures)]
                    history.update(charge_temp_start_prev=float(temperatures[0]) if temperatures.size else np.nan,
                                   charge_temp_max_prev=float(temperatures.max()) if temperatures.size else np.nan,
                                   charge_temp_delta_prev=float(temperatures[-1] - temperatures[0]) if temperatures.size else np.nan)
                if kind != "discharge":
                    continue
                cycle_number += 1
                data = operation.data
                arrays = [np.asarray(getattr(data, key, []), dtype=float).ravel()
                          for key in ["Time", "Voltage_measured", "Current_measured", "Temperature_measured"]]
                if len({len(array) for array in arrays}) != 1 or not len(arrays[0]):
                    raise ValueError(f"{name}, ciclo {cycle_number}: señales ausentes o de longitudes distintas.")
                for t, voltage, current, temperature in zip(*arrays):
                    rows.append({**history, "time_s": t, "voltage_v": voltage, "current_a": current, "temperature_c": temperature,
                                 "battery_id": name, "cycle": cycle_number, "operating_mode": "discharge",
                                 "ambient_temperature_c": float(operation.ambient_temperature), "measurement_level": "cell",
                                 "cutoff_voltage_v": {"B0045": 2.0, "B0046": 2.2, "B0047": 2.5, "B0048": 2.7}.get(name, np.nan)})
                    if len(rows) > MAX_ROWS:
                        raise ValueError("El MAT supera 100 000 muestras. Exporta los ciclos que deseas analizar en una tabla menor.")
            if rows:
                results[name] = pd.DataFrame(rows)
    if not results:
        vectors = {name: np.atleast_1d(value).ravel() for name, value in payload.items()
                   if not name.startswith("__") and isinstance(value, np.ndarray) and np.issubdtype(value.dtype, np.number) and (value.ndim == 1 or value.ndim == 2 and 1 in value.shape)}
        if len(vectors) < 4 or len({len(value) for value in vectors.values()}) != 1:
            raise ValueError("MAT no reconocido. Se admiten ciclos NASA o vectores numéricos del mismo tamaño con nombres de columnas; exporta otras estructuras a CSV.")
        results["Señales"] = pd.DataFrame(vectors)
    return results


def import_file(content: bytes, filename: str, sheet: str | None = None):
    if not content or len(content) > MAX_BYTES:
        raise ValueError("Archivo vacío o mayor que 40 MB.")
    suffix = Path(filename).suffix.lower()
    warnings = []
    if suffix in {".xlsx", ".xls"}:
        engine = "xlrd" if suffix == ".xls" else "openpyxl"
        book = pd.ExcelFile(io.BytesIO(content), engine=engine)
        names = book.sheet_names
        if sheet is None and len(names) > 1:
            return {"fields": [], "rows": [], "sheets": names, "selected_sheet": None, "warnings": ["Selecciona una hoja para evitar mezclar tablas."]}
        selected = sheet or names[0]
        if selected not in names:
            raise ValueError("La hoja seleccionada no existe.")
        # Read the header ourselves to reject duplicates rather than silently rename them.
        frame = pd.read_excel(book, sheet_name=selected, header=None, dtype=object, nrows=MAX_ROWS + 2)
        if frame.empty:
            raise ValueError("La hoja está vacía.")
        frame.columns = [cell_text(value) for value in frame.iloc[0]]
        frame = frame.iloc[1:]
    elif suffix == ".parquet":
        import pyarrow.parquet as pq
        parquet = pq.ParquetFile(io.BytesIO(content))
        if parquet.metadata.num_rows > MAX_ROWS:
            raise ValueError("El Parquet supera 100 000 filas; selecciona un tramo menor.")
        frame = parquet.read().to_pandas()
        names, selected = [], None
    elif suffix == ".mat":
        tables = mat_tables(content)
        names = list(tables)
        if sheet is None and len(names) > 1:
            return {"fields": [], "rows": [], "sheets": names, "selected_sheet": None, "warnings": ["Selecciona la batería o tabla MAT."]}
        selected = sheet or names[0]
        if selected not in tables:
            raise ValueError("La tabla MAT seleccionada no existe.")
        frame = tables[selected]
        warnings.append("MAT adaptado como tabla; selecciona el ciclo de descarga y confirma el voltaje de corte y los datos opcionales del ensayo.")
    else:
        raise ValueError("Formato no soportado. Usa CSV, TSV, TXT, JSON, XLSX, XLS, MAT o Parquet; cambiar la extensión no convierte un archivo.")
    return {**table(frame), "sheets": names, "selected_sheet": selected, "warnings": warnings}
