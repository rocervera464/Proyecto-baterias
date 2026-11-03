"""Export fingerprints and measured context; never capacities or SoH targets."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import scipy.io as sio

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.telemetry_identity import CATALOG, fingerprint

CUTOFFS = {"B0045": 2., "B0046": 2.2, "B0047": 2.5, "B0048": 2.7,
           "B0005": 2.7, "B0006": 2.5, "B0007": 2.2, "B0018": 2.5}


def main():
    root = Path(__file__).resolve().parents[2]
    entries, sources = {}, {}
    for battery_id, cutoff in CUTOFFS.items():
        cohort = "nasa_45_48" if battery_id in {"B0045", "B0046", "B0047", "B0048"} else "nasa_room_2a"
        path = root / "data/raw" / cohort / f"{battery_id}.mat"
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        sources[battery_id] = {"file": str(path.relative_to(root)).replace("\\", "/"), "sha256": digest}
        battery = sio.loadmat(path, squeeze_me=True, struct_as_record=False)[battery_id]
        cycle = 0
        for operation in np.atleast_1d(battery.cycle):
            if str(operation.type).strip().lower() != "discharge":
                continue
            cycle += 1
            data = operation.data
            arrays = [np.asarray(getattr(data, name), dtype=float).ravel() for name in
                      ["Time", "Voltage_measured", "Current_measured", "Temperature_measured"]]
            if len({len(array) for array in arrays}) != 1:
                continue
            values = np.column_stack(arrays)
            key = fingerprint(values)
            ambient = float(operation.ambient_temperature)
            if key is None or not np.isfinite(ambient):
                continue
            entries.setdefault(key, []).append({"battery_id": battery_id, "cycle": cycle,
                "ambient_temperature_c": ambient, "cutoff_voltage_v": cutoff, "measurement_level": "cell",
                "chemistry": "li-ion", "source_sha256": digest})
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    CATALOG.write_text(json.dumps({"schema_version": 1, "rounding_decimals": 8,
        "window_seconds": 300, "sources": sources, "fingerprints": entries}, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"References: {sum(map(len, entries.values()))}; unique windows: {len(entries)}")


if __name__ == "__main__":
    main()
