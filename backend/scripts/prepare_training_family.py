"""Prepare the additional documented NASA room-temperature, 2 A family."""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from prepare_nasa_training import CUTOFF_MAP, extract_battery_features


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    # Source archive README: four cells, discharge 2 A, corresponding cutoffs.
    CUTOFF_MAP.update({"B0005": 2.7, "B0006": 2.5, "B0007": 2.2, "B0018": 2.5})
    frame = pd.concat([extract_battery_features(str(args.source / f"{bid}.mat"))
                       for bid in ["B0005", "B0006", "B0007", "B0018"]], ignore_index=True)
    frame = frame[np.isfinite(frame.capacity) & (frame.capacity > 0)].copy()
    reference = frame.sort_values(["battery_id", "cycle"]).groupby("battery_id").head(5).groupby("battery_id").capacity.median()
    frame["q_ref"] = frame.battery_id.map(reference)
    frame["soh"] = frame.capacity / frame.q_ref * 100
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.output, index=False)
    print("Rows:", len(frame), "Batteries:", frame.battery_id.nunique())


if __name__ == "__main__":
    main()
