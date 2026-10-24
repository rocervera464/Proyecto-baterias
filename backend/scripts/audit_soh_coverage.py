"""Audit measured reference coverage in NASA MAT archives without training.

Uses the existing capacity / median(first 5 positive finite capacities) definition.
Duplicate MAT files are counted once by SHA256; no zero/missing labels invented.
"""
import argparse
import hashlib
import io
import json
import zipfile
from pathlib import Path

import numpy as np
import scipy.io as sio


def scalar(value):
    try:
        array = np.asarray(value, dtype=float).squeeze()
        return float(array) if array.size == 1 else np.nan
    except (ValueError, TypeError):
        return np.nan


def inspect_battery(payload: bytes, battery_id: str):
    battery = sio.loadmat(io.BytesIO(payload), squeeze_me=True, struct_as_record=False)[battery_id]
    discharges = []
    for event in np.atleast_1d(battery.cycle):
        kind = event.type.decode() if isinstance(event.type, bytes) else str(event.type)
        if kind.strip().lower() != "discharge":
            continue
        data = event.data
        capacity = scalar(getattr(data, "Capacity", np.nan))
        arrays = [np.asarray(getattr(data, field, []), dtype=float).ravel()
                  for field in ["Time", "Voltage_measured", "Current_measured", "Temperature_measured"]]
        count = min(map(len, arrays))
        joined = np.array([array[:count] for array in arrays])
        valid = np.isfinite(joined).all(axis=0) & (joined[0] >= 0) & (joined[0] <= 300) & (joined[1] > 0)
        usable = np.unique(joined[0][valid]).size >= 2
        discharges.append({"cycle": len(discharges) + 1, "capacity_ah": capacity, "usable_window": bool(usable)})
    positive = [row for row in discharges if np.isfinite(row["capacity_ah"]) and row["capacity_ah"] > 0]
    if len(positive) < 5:
        return {"battery_id": battery_id, "error": "Fewer than 5 valid reference capacities"}, []
    reference = float(np.median([row["capacity_ah"] for row in positive[:5]]))
    labels = [{**row, "soh": row["capacity_ah"] / reference * 100} for row in positive]
    usable_labels = [row for row in labels if row["usable_window"]]
    return {
        "battery_id": battery_id, "discharges": len(discharges), "reference_ah": reference,
        "excluded_missing_or_nonpositive_capacity": len(discharges) - len(positive),
        "usable_label_count": len(usable_labels),
        "usable_soh_min": min((r["soh"] for r in usable_labels), default=None),
        "usable_soh_max": max((r["soh"] for r in usable_labels), default=None),
        "below_50_usable": [r for r in usable_labels if r["soh"] < 50],
    }, usable_labels


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    seen = {}
    batteries = []
    duplicates = []
    labels = []
    for archive in sorted(args.archives.glob("*.zip")):
        with zipfile.ZipFile(archive) as z:
            for name in z.namelist():
                if not name.lower().endswith(".mat"):
                    continue
                payload = z.read(name)
                checksum = hashlib.sha256(payload).hexdigest()
                if checksum in seen:
                    duplicates.append({"archive": archive.name, "file": name, "same_as": seen[checksum]})
                    continue
                key = f"{archive.name}/{name}"
                seen[checksum] = key
                report, values = inspect_battery(payload, Path(name).stem)
                report.update(archive=archive.name, file=name, sha256=checksum)
                batteries.append(report)
                labels.extend(values)
                print(report["battery_id"], "min SoH:", report.get("usable_soh_min"), "rows:", len(values), flush=True)
    bins = []
    for lower in range(0, 100, 10):
        count = sum(lower <= r["soh"] < lower + 10 or lower == 90 and r["soh"] == 100 for r in labels)
        bins.append({"from_inclusive": lower, "to": lower + 10, "upper_inclusive": lower == 90, "count": count})
    result = {
        "definition": "capacity / median(first 5 positive finite capacities per battery) * 100",
        "caveat": "Coverage audit only: valid window does not establish trustworthy capacity measurement, compatible protocol or accuracy. Low-capacity anomalies need quality review.",
        "batteries": batteries, "duplicate_files_not_counted": duplicates, "bins": bins,
        "above_100_count": sum(r["soh"] > 100 for r in labels),
        "minimum_usable_soh": min((r["soh"] for r in labels), default=None),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print("Range counts:", bins)


if __name__ == "__main__":
    main()
