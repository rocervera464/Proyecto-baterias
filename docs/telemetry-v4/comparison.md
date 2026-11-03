# XGBoost telemetry v4: measured validation

Nested Leave-One-Battery-Out; 300 s production window. Four cells per protocol, evaluated separately. No independent external vehicle or pack validation.

Capacity creates targets only. The reference is the median of the first five valid capacities per cell; it never enters a predictor. Repeated folds and the earlier project studies mean these cells are not a new independent test set.

## nasa_cold_1a

Selected feature set: A (21 inputs). Production horizons: []. Research: [5, 10, 20, 30].

| Procedure | Horizon | Macro MAE (pp) | Macro RMSE (pp) | Pooled R² | N |
|---|---:|---:|---:|---:|---:|
| selected | 0 | 4.3612 | 5.3892 | 0.5347 | 277 |
| selected | 5 | 4.5869 | 5.5885 | 0.3310 | 246 |
| selected | 10 | 4.4611 | 5.5541 | 0.1605 | 230 |
| selected | 20 | 4.6624 | 5.4529 | -0.3705 | 197 |
| selected | 30 | 4.3952 | 5.3267 | -0.7266 | 157 |
| mean_baseline | 0 | 6.9422 | 8.7335 | -0.0678 | 277 |
| persistence | 5 | 4.5865 | 5.4051 | 0.3168 | 246 |
| persistence | 10 | 5.3534 | 6.2452 | -0.1621 | 230 |
| persistence | 20 | 7.4385 | 8.2595 | -2.4727 | 197 |
| persistence | 30 | 9.7634 | 10.6452 | -6.2668 | 157 |
| historical_mean | 5 | 4.1547 | 4.9760 | 0.4466 | 246 |
| historical_mean | 10 | 4.2991 | 5.1664 | 0.2351 | 230 |
| historical_mean | 20 | 4.3281 | 5.2988 | -0.4359 | 197 |
| historical_mean | 30 | 4.8586 | 5.9314 | -1.3129 | 157 |
| historical_linear | 5 | 4.1524 | 4.9721 | 0.4471 | 246 |
| historical_linear | 10 | 4.2986 | 5.1696 | 0.2339 | 230 |
| historical_linear | 20 | 4.3341 | 5.3040 | -0.4381 | 197 |
| historical_linear | 30 | 4.8483 | 5.9220 | -1.3063 | 157 |
| future_training_mean | 5 | 5.9333 | 7.2248 | -0.1291 | 246 |
| future_training_mean | 10 | 5.3133 | 6.4944 | -0.1762 | 230 |
| future_training_mean | 20 | 4.3198 | 5.1735 | -0.2993 | 197 |
| future_training_mean | 30 | 3.9966 | 4.6078 | -0.4163 | 157 |
| oracle_persistence | 5 | 3.1035 | 4.1008 | 0.6340 | 246 |
| oracle_persistence | 10 | 4.3045 | 5.6468 | 0.1202 | 230 |
| oracle_persistence | 20 | 7.3557 | 8.7759 | -2.5632 | 197 |
| oracle_persistence | 30 | 10.0877 | 12.0358 | -7.6045 | 157 |
| legacy_context | 0 | 2.9708 | 3.7395 | 0.8003 | 277 |
| legacy_future_research | 5 | 3.3710 | 4.0609 | 0.6109 | 246 |
| legacy_future_research | 10 | 3.1746 | 3.8588 | 0.5526 | 230 |
| legacy_future_research | 20 | 3.1383 | 3.9569 | 0.2126 | 197 |
| legacy_future_research | 30 | 3.4900 | 4.0568 | -0.0188 | 157 |

Current hyperparameters:
```json
{
  "n_estimators": 72,
  "learning_rate": 0.05,
  "max_depth": 2,
  "min_child_weight": 3,
  "subsample": 1.0,
  "colsample_bytree": 1.0,
  "reg_alpha": 0.01,
  "reg_lambda": 2.0,
  "gamma": 0.01
}
```
Future hyperparameters:
```json
{
  "n_estimators": 94,
  "learning_rate": 0.025,
  "max_depth": 3,
  "min_child_weight": 8,
  "subsample": 0.8,
  "colsample_bytree": 0.85,
  "reg_alpha": 0.1,
  "reg_lambda": 10.0,
  "gamma": 0.05
}
```

Monotonic violation rate on outer held-out predictions: 0.000000. This is a coherence metric, not proof of accuracy.

### Feature-set selection (inner validation, not an external test)

| Set | Best inner macro MAE | Best inner macro RMSE |
|---|---:|---:|
| A | 3.5685 | 4.7686 |
| B | 3.8017 | 5.0668 |
| C | 3.7364 | 4.9647 |
| D | 3.8017 | 4.8915 |

### Generalization gap

| Held-out battery | Fitting MAE | Held-out MAE |
|---|---:|---:|
| B0045 | 2.1942 | 6.1616 |
| B0046 | 1.0429 | 2.4676 |
| B0047 | 0.8584 | 5.5785 |
| B0048 | 1.1657 | 3.2369 |

### Window comparison (exploratory)

| Window seconds | Macro MAE | Macro RMSE | Minimum samples observed |
|---:|---:|---:|---:|
| 60 | 5.1424 | 5.9052 | 5 |
| 120 | 4.6456 | 5.5392 | 9 |
| 180 | 4.9350 | 5.9888 | 13 |
| 300 | 4.3612 | 5.3892 | 21 |
| 600 | 4.1912 | 5.2916 | 40 |

Window experiments reuse the 300 s training-only chosen configurations for each outer fold. They are exploratory comparisons; the production window remains 300 s. Final all-battery artifacts are not evaluated on their own fitting rows.

Horizon decisions:
```json
{
  "5": {
    "production": false,
    "reasons": [
      "Does not improve macro MAE by 2% versus persistence",
      "Does not improve macro MAE by 2% versus historical_mean",
      "Does not improve macro MAE by 2% versus historical_linear",
      "Does not improve persistence on at least three batteries"
    ]
  },
  "10": {
    "production": false,
    "reasons": [
      "Does not improve macro MAE by 2% versus historical_mean",
      "Does not improve macro MAE by 2% versus historical_linear"
    ]
  },
  "20": {
    "production": false,
    "reasons": [
      "Does not improve macro MAE by 2% versus historical_mean",
      "Does not improve macro MAE by 2% versus historical_linear",
      "Held-out pooled R2 is not positive",
      "Does not improve macro MAE by 2% versus future_training_mean"
    ]
  },
  "30": {
    "production": false,
    "reasons": [
      "Held-out pooled R2 is not positive",
      "Does not improve macro MAE by 2% versus future_training_mean"
    ]
  }
}
```

## nasa_room_2a

Selected feature set: D (30 inputs). Production horizons: []. Research: [5, 10, 20, 30].

| Procedure | Horizon | Macro MAE (pp) | Macro RMSE (pp) | Pooled R² | N |
|---|---:|---:|---:|---:|---:|
| selected | 0 | 4.1898 | 5.0178 | 0.7533 | 636 |
| selected | 5 | 4.3101 | 5.1884 | 0.7537 | 616 |
| selected | 10 | 4.3841 | 5.2447 | 0.7272 | 596 |
| selected | 20 | 4.5452 | 5.4054 | 0.6832 | 556 |
| selected | 30 | 4.7277 | 5.6819 | 0.5997 | 516 |
| mean_baseline | 0 | 9.6129 | 11.1815 | -0.1215 | 636 |
| persistence | 5 | 4.4666 | 5.3555 | 0.6913 | 616 |
| persistence | 10 | 4.9477 | 5.7930 | 0.6124 | 596 |
| persistence | 20 | 6.0718 | 7.0274 | 0.3795 | 556 |
| persistence | 30 | 7.6673 | 8.7031 | -0.0265 | 516 |
| historical_mean | 5 | 4.2644 | 5.1232 | 0.7427 | 616 |
| historical_mean | 10 | 4.3771 | 5.2313 | 0.7206 | 596 |
| historical_mean | 20 | 4.5833 | 5.4525 | 0.6684 | 556 |
| historical_mean | 30 | 4.6852 | 5.6701 | 0.5989 | 516 |
| historical_linear | 5 | 4.2662 | 5.1269 | 0.7410 | 616 |
| historical_linear | 10 | 4.3755 | 5.2294 | 0.7215 | 596 |
| historical_linear | 20 | 4.5813 | 5.4487 | 0.6714 | 556 |
| historical_linear | 30 | 4.6808 | 5.6721 | 0.5966 | 516 |
| future_training_mean | 5 | 9.3802 | 10.9692 | -0.1353 | 616 |
| future_training_mean | 10 | 9.1439 | 10.7518 | -0.1501 | 596 |
| future_training_mean | 20 | 8.6959 | 10.3406 | -0.1791 | 556 |
| future_training_mean | 30 | 8.1557 | 9.8235 | -0.2220 | 516 |
| oracle_persistence | 5 | 1.5738 | 1.8399 | 0.9694 | 616 |
| oracle_persistence | 10 | 2.3373 | 2.7362 | 0.9299 | 596 |
| oracle_persistence | 20 | 4.0978 | 4.6726 | 0.7797 | 556 |
| oracle_persistence | 30 | 6.1927 | 6.7617 | 0.4779 | 516 |
| legacy_context | 0 | 2.8468 | 3.4571 | 0.8877 | 636 |
| legacy_future_research | 5 | 2.9575 | 3.7374 | 0.8509 | 616 |
| legacy_future_research | 10 | 3.0221 | 3.7222 | 0.8430 | 596 |
| legacy_future_research | 20 | 3.8253 | 4.5261 | 0.7512 | 556 |
| legacy_future_research | 30 | 4.3658 | 4.9638 | 0.6540 | 516 |

Current hyperparameters:
```json
{
  "n_estimators": 165,
  "learning_rate": 0.05,
  "max_depth": 2,
  "min_child_weight": 3,
  "subsample": 1.0,
  "colsample_bytree": 1.0,
  "reg_alpha": 0.01,
  "reg_lambda": 2.0,
  "gamma": 0.01
}
```
Future hyperparameters:
```json
{
  "n_estimators": 40,
  "learning_rate": 0.05,
  "max_depth": 2,
  "min_child_weight": 3,
  "subsample": 1.0,
  "colsample_bytree": 1.0,
  "reg_alpha": 0.01,
  "reg_lambda": 2.0,
  "gamma": 0.01
}
```

Monotonic violation rate on outer held-out predictions: 0.000000. This is a coherence metric, not proof of accuracy.

### Feature-set selection (inner validation, not an external test)

| Set | Best inner macro MAE | Best inner macro RMSE |
|---|---:|---:|
| A | 3.0459 | 3.7991 |
| B | 3.1408 | 3.8693 |
| C | 3.0366 | 3.7781 |
| D | 2.9338 | 3.6774 |

### Generalization gap

| Held-out battery | Fitting MAE | Held-out MAE |
|---|---:|---:|
| B0005 | 0.7951 | 2.2156 |
| B0006 | 0.5366 | 4.8235 |
| B0007 | 0.5908 | 6.9956 |
| B0018 | 0.3553 | 2.7243 |

### Window comparison (exploratory)

| Window seconds | Macro MAE | Macro RMSE | Minimum samples observed |
|---:|---:|---:|---:|
| 60 | 4.4284 | 5.3797 | 4 |
| 120 | 4.0298 | 4.8971 | 7 |
| 180 | 3.4984 | 4.1968 | 10 |
| 300 | 4.1898 | 5.0178 | 17 |
| 600 | 2.7680 | 3.3981 | 33 |

Window experiments reuse the 300 s training-only chosen configurations for each outer fold. They are exploratory comparisons; the production window remains 300 s. Final all-battery artifacts are not evaluated on their own fitting rows.

Horizon decisions:
```json
{
  "5": {
    "production": false,
    "reasons": [
      "Does not improve macro MAE by 2% versus historical_mean",
      "Does not improve macro MAE by 2% versus historical_linear",
      "Does not improve persistence on at least three batteries"
    ]
  },
  "10": {
    "production": false,
    "reasons": [
      "Does not improve macro MAE by 2% versus historical_mean",
      "Does not improve macro MAE by 2% versus historical_linear",
      "Does not improve persistence on at least three batteries"
    ]
  },
  "20": {
    "production": false,
    "reasons": [
      "Does not improve macro MAE by 2% versus historical_mean",
      "Does not improve macro MAE by 2% versus historical_linear"
    ]
  },
  "30": {
    "production": false,
    "reasons": [
      "Does not improve macro MAE by 2% versus historical_mean",
      "Does not improve macro MAE by 2% versus historical_linear"
    ]
  }
}
```
