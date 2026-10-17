"""Compare five-horizon candidates with nested leave-one-battery-out validation.

Input: B0045_B0048_clean_SoH.csv exported by the original Colab.
Outputs are candidates only; production artifacts are never overwritten.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import LeaveOneGroupOut
from xgboost import XGBRegressor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.feature_engineering import MODEL_FEATURES  # noqa: E402

BASE = dict(n_estimators=500, learning_rate=0.03, max_depth=4,
            min_child_weight=3, subsample=0.8, colsample_bytree=0.8,
            reg_alpha=0.0, reg_lambda=1.0)
CANDIDATES = {
    "original_configuration": BASE,
    "regularized": {**BASE, "max_depth": 2, "min_child_weight": 8, "reg_alpha": 0.1, "reg_lambda": 10.0},
    "regularized_cycle_constraint": {**BASE, "max_depth": 2, "min_child_weight": 5, "reg_alpha": 0.1,
                                    "reg_lambda": 5.0, "monotone_constraints": {"cycle": -1}},
}


def prepare_dataset(frame: pd.DataFrame) -> pd.DataFrame:
    required = ["battery_id", "soh", *MODEL_FEATURES]
    missing = sorted(set(required) - set(frame.columns))
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    result = frame[required].copy()
    if result.battery_id.isna().any() or result.battery_id.astype(str).str.strip().eq("").any():
        raise ValueError("Missing battery_id")
    for column in ["soh", *MODEL_FEATURES]:
        result[column] = pd.to_numeric(result[column], errors="raise")
    if np.isinf(result.select_dtypes(include="number").to_numpy()).any():
        raise ValueError("Infinite values are not allowed")
    if result[["soh", "cycle"]].isna().any().any():
        raise ValueError("Missing cycle or SoH reference")
    if (result.cycle < 1).any() or (result.cycle % 1 != 0).any():
        raise ValueError("Cycle must be a positive integer")
    if result.duplicated(["battery_id", "cycle"]).any():
        raise ValueError("Duplicate battery/cycle would multiply future labels")
    if result.battery_id.nunique() < 4:
        raise ValueError("At least four batteries required for this nested grouped comparison")
    return result.sort_values(["battery_id", "cycle"]).reset_index(drop=True)


def horizon_dataset(frame: pd.DataFrame, horizon: int) -> pd.DataFrame:
    """Exact t+h cycle within each battery; never shift rows across gaps."""
    targets = frame[["battery_id", "cycle", "soh"]].rename(columns={"soh": "target"}).copy()
    targets["cycle"] -= horizon
    return frame.merge(targets, on=["battery_id", "cycle"], validate="one_to_one").reset_index(drop=True)


def fit_predict(train: pd.DataFrame, test: pd.DataFrame, name: str) -> np.ndarray:
    model = XGBRegressor(**CANDIDATES[name], objective="reg:squarederror", random_state=42, n_jobs=1)
    model.fit(train[MODEL_FEATURES], train.target)
    return model.predict(test[MODEL_FEATURES])


def select_inner(train: pd.DataFrame) -> str:
    scores = {}
    for name in CANDIDATES:
        errors = []
        for train_idx, valid_idx in LeaveOneGroupOut().split(train, groups=train.battery_id):
            inner_train, valid = train.iloc[train_idx], train.iloc[valid_idx]
            errors.append(mean_absolute_error(valid.target, fit_predict(inner_train, valid, name)))
        scores[name] = float(np.mean(errors))
    return min(scores, key=scores.get)


def evaluate(frame: pd.DataFrame) -> dict:
    report = {}
    for horizon in [0, 5, 10, 20, 30]:
        print(f"Evaluating horizon {horizon}...", flush=True)
        dataset = horizon_dataset(frame, horizon)
        if dataset.battery_id.nunique() < 4:
            raise ValueError(f"Insufficient batteries at horizon {horizon}")
        folds = []
        for train_idx, test_idx in LeaveOneGroupOut().split(dataset, groups=dataset.battery_id):
            train, test = dataset.iloc[train_idx], dataset.iloc[test_idx]
            if len(test) < 2 or test.target.nunique() < 2:
                raise ValueError("Test fold needs at least two distinct reference values")
            selected = select_inner(train)
            for label, name in [("baseline", "original_configuration"), ("nested_selected", selected)]:
                prediction = fit_predict(train, test, name)
                folds.append(dict(procedure=label, selected=name, test_battery=str(test.battery_id.iloc[0]),
                                  n_train=len(train), n_test=len(test),
                                  mae=float(mean_absolute_error(test.target, prediction)),
                                  rmse=float(np.sqrt(mean_squared_error(test.target, prediction))),
                                  r2=float(r2_score(test.target, prediction))))
        summary = {label: {metric: float(np.mean([f[metric] for f in folds if f["procedure"] == label]))
                           for metric in ["mae", "rmse", "r2"]} for label in ["baseline", "nested_selected"]}
        report[str(horizon)] = {"folds": folds, "macro_average": summary,
            "lower_mae_and_rmse": all(summary["nested_selected"][m] < summary["baseline"][m] for m in ["mae", "rmse"])}
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = {
        "dataset_sha256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
        "protocol": "Nested leave-one-battery-out; inner macro MAE selects configuration; outer battery never used to select.",
        "scope": "Raw five-model outputs, before isotonic adjustment. No external-domain or temporal-forward validation.",
        "candidates": CANDIDATES,
        "horizons": evaluate(prepare_dataset(pd.read_csv(args.dataset))),
        "deployment": "No model exported or promoted. Evaluate per-battery regressions, temporal forecasts and reconciled outputs before production.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Comparison saved: {args.output}")


if __name__ == "__main__":
    main()
