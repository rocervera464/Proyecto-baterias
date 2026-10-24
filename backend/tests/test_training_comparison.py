import runpy
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.services.feature_engineering import MODEL_FEATURES

comparison = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/compare_training.py"))
prepare_dataset = comparison["prepare_dataset"]
horizon_dataset = comparison["horizon_dataset"]


def dataset():
    rows = []
    for i in range(4):
        for cycle in [1, 2, 6, 7]:
            rows.append({**{feature: np.nan for feature in MODEL_FEATURES},
                         "battery_id": f"B{i}", "cycle": cycle, "soh": 100 - cycle - i})
    return pd.DataFrame(rows)


def test_horizon_labels_use_exact_cycle_and_same_battery():
    frame = prepare_dataset(dataset())
    future = horizon_dataset(frame, 5)
    assert set(future.cycle) == {1, 2}
    for row in future.itertuples():
        reference = frame[(frame.battery_id == row.battery_id) & (frame.cycle == row.cycle + 5)]
        assert row.target == reference.soh.iloc[0]
    assert horizon_dataset(frame, 3).empty


def test_duplicate_cycle_and_missing_reference_are_rejected():
    frame = dataset()
    with pytest.raises(ValueError, match="Duplicate"):
        prepare_dataset(pd.concat([frame, frame.iloc[:1]]))
    frame.loc[0, "soh"] = np.nan
    with pytest.raises(ValueError, match="Missing cycle or SoH"):
        prepare_dataset(frame)


def test_insufficient_groups_and_invalid_cycles_are_rejected():
    frame = dataset()
    with pytest.raises(ValueError, match="four batteries"):
        prepare_dataset(frame[frame.battery_id != "B3"])
    frame["cycle"] = frame["cycle"].astype(float)
    frame.loc[0, "cycle"] = 1.5
    with pytest.raises(ValueError, match="positive integer"):
        prepare_dataset(frame)
