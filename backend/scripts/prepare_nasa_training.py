"""Reproduce audited feature functions from the supplied original notebook.
Source: data/source_notebooks/original_training.ipynb, cells 10/15/23/24/27/29.
Only definitions were copied; no notebook shell, downloads, or arbitrary cells run.
"""
import argparse
import os
import numpy as np
import pandas as pd
import scipy.io as sio
from pathlib import Path

def load_battery_mat(file_path):
    """
    Carga una batería NASA desde un .mat y devuelve
    la estructura MATLAB principal.
    """
    battery_id = os.path.splitext(os.path.basename(file_path))[0]
    mat = sio.loadmat(file_path, squeeze_me=True, struct_as_record=False)
    if battery_id not in mat:
        raise KeyError(f'No existe la variable {battery_id} dentro de {file_path}')
    battery = mat[battery_id]
    while isinstance(battery, np.ndarray) and battery.size == 1:
        battery = battery.item()
    if not hasattr(battery, '_fieldnames'):
        raise TypeError(f'{battery_id} no se cargó como estructura MATLAB.')
    return battery

def normalize_cycle_type(value):
    if isinstance(value, bytes):
        value = value.decode('utf-8', errors='ignore')
    return str(value).strip().lower()

def safe_array(value):
    """Convierte un valor MATLAB en vector NumPy float."""
    try:
        return np.asarray(value, dtype=float).ravel()
    except Exception:
        return np.array([], dtype=float)

def safe_scalar(value):
    """Convierte un valor MATLAB escalar en float."""
    try:
        arr = np.asarray(value).squeeze()
        if arr.size == 1:
            return float(arr)
        return np.nan
    except Exception:
        return np.nan

def get_time_window(time, signal, max_seconds=300):
    """
    Conserva únicamente los valores válidos de una señal
    comprendidos entre el inicio y max_seconds.
    """
    time = safe_array(time)
    signal = safe_array(signal)
    n = min(len(time), len(signal))
    time = time[:n]
    signal = signal[:n]
    mask = np.isfinite(time) & np.isfinite(signal) & (time <= max_seconds)
    return (time[mask], signal[mask])

def summarize_window(time, signal, prefix, max_seconds=300):
    """
    Resume una señal temporal en características numéricas
    de longitud fija.
    """
    t, x = get_time_window(time, signal, max_seconds)
    if len(x) == 0:
        return {f'{prefix}_start': np.nan, f'{prefix}_mean': np.nan, f'{prefix}_std': np.nan, f'{prefix}_min': np.nan, f'{prefix}_max': np.nan, f'{prefix}_end': np.nan, f'{prefix}_delta': np.nan, f'{prefix}_n_samples': 0}
    return {f'{prefix}_start': x[0], f'{prefix}_mean': np.mean(x), f'{prefix}_std': np.std(x), f'{prefix}_min': np.min(x), f'{prefix}_max': np.max(x), f'{prefix}_end': x[-1], f'{prefix}_delta': x[-1] - x[0], f'{prefix}_n_samples': len(x)}

CUTOFF_MAP = {'B0045': 2.0, 'B0046': 2.2, 'B0047': 2.5, 'B0048': 2.7}

def extract_battery_features(file_path, window_seconds=300):
    battery_id = os.path.splitext(os.path.basename(file_path))[0]
    battery = load_battery_mat(file_path)
    cycles = np.atleast_1d(battery.cycle)
    rows = []
    discharge_number = 0
    last_eis = {'Re_prev': np.nan, 'Rct_prev': np.nan}
    last_charge = {'charge_duration_prev': np.nan, 'charge_temp_start_prev': np.nan, 'charge_temp_max_prev': np.nan, 'charge_temp_delta_prev': np.nan}
    for cycle in cycles:
        cycle_type = normalize_cycle_type(cycle.type)
        if cycle_type == 'impedance':
            Re = safe_scalar(cycle.data.Re)
            Rct = safe_scalar(cycle.data.Rct)
            if not (np.isfinite(Re) and 0 < Re < 1):
                Re = np.nan
            if not (np.isfinite(Rct) and 0 < Rct < 2):
                Rct = np.nan
            last_eis = {'Re_prev': Re, 'Rct_prev': Rct}
        elif cycle_type == 'charge':
            data = cycle.data
            charge_time = safe_array(data.Time)
            charge_temperature = safe_array(data.Temperature_measured)
            if len(charge_time) > 0:
                charge_duration = charge_time[-1] - charge_time[0]
            else:
                charge_duration = np.nan
            valid_temp = charge_temperature[np.isfinite(charge_temperature)]
            if len(valid_temp) > 0:
                charge_temp_start = valid_temp[0]
                charge_temp_max = np.max(valid_temp)
                charge_temp_delta = valid_temp[-1] - valid_temp[0]
            else:
                charge_temp_start = np.nan
                charge_temp_max = np.nan
                charge_temp_delta = np.nan
            last_charge = {'charge_duration_prev': charge_duration, 'charge_temp_start_prev': charge_temp_start, 'charge_temp_max_prev': charge_temp_max, 'charge_temp_delta_prev': charge_temp_delta}
        elif cycle_type == 'discharge':
            discharge_number += 1
            data = cycle.data
            time = safe_array(data.Time)
            voltage = safe_array(data.Voltage_measured)
            current = safe_array(data.Current_measured)
            temperature = safe_array(data.Temperature_measured)
            row = {'battery_id': battery_id, 'cycle': discharge_number, 'ambient_temperature': safe_scalar(cycle.ambient_temperature), 'cutoff_voltage': CUTOFF_MAP.get(battery_id, np.nan), 'capacity': safe_scalar(data.Capacity)}
            row.update(summarize_window(time, voltage, 'voltage', window_seconds))
            row.update(summarize_window(time, current, 'current', window_seconds))
            row.update(summarize_window(time, temperature, 'temperature', window_seconds))
            row.update(last_eis)
            row.update(last_charge)
            rows.append(row)
    return pd.DataFrame(rows)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    frames = [extract_battery_features(str(args.source / f"B00{i}.mat")) for i in [45,46,47,48]]
    frame = pd.concat(frames, ignore_index=True)
    frame = frame[np.isfinite(frame.capacity) & (frame.capacity > 0)].copy()
    reference = frame.sort_values(["battery_id", "cycle"]).groupby("battery_id").head(5).groupby("battery_id").capacity.median()
    frame["q_ref"] = frame.battery_id.map(reference)
    frame["soh"] = frame.capacity / frame.q_ref * 100
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.output, index=False)
    print(frame.groupby("battery_id").size().to_string())
    print("Rows:",len(frame),"Output:",args.output)

if __name__ == "__main__":
    main()
