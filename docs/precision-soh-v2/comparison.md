# Evaluación SoH v2

Resultados externos por horizonte. MAE/RMSE en puntos de SoH; R² agregado. Los pesos históricos se reajustaron sin la batería de prueba.

| Horizonte | n | MAE anterior bruto | MAE anterior servido | MAE v2 | RMSE anterior servido | RMSE v2 | R² anterior servido | R² v2 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 277 | 2.8412 | 2.9706 | 2.9706 | 3.8152 | 3.8152 | 0.8003 | 0.8003 |
| 5 | 246 | 3.2832 | 2.9140 | 3.0631 | 3.5347 | 3.9869 | 0.7341 | 0.6617 |
| 10 | 230 | 3.1981 | 3.0488 | 3.1028 | 3.6982 | 4.1471 | 0.6281 | 0.5323 |
| 20 | 197 | 4.0580 | 3.6907 | 3.1775 | 4.2939 | 4.4172 | 0.1579 | 0.1088 |
| 30 | 157 | 3.9151 | 3.8134 | 3.5684 | 4.2825 | 4.5287 | -0.0781 | -0.2057 |

## Por batería

| Batería | Horizonte | MAE anterior servido | MAE v2 | RMSE anterior servido | RMSE v2 |
|---|---:|---:|---:|---:|---:|
| B0045 | 0 | 2.9137 | 2.9137 | 4.1520 | 4.1520 |
| B0045 | 5 | 2.2087 | 2.1398 | 2.7818 | 2.6882 |
| B0045 | 10 | 2.3154 | 2.1586 | 2.8310 | 2.7105 |
| B0045 | 20 | 2.9814 | 2.4312 | 3.3744 | 3.0748 |
| B0045 | 30 | 3.9806 | 3.6088 | 4.3101 | 4.2298 |
| B0046 | 0 | 1.5509 | 1.5509 | 2.5740 | 2.5740 |
| B0046 | 5 | 2.0590 | 3.0091 | 2.3615 | 4.2117 |
| B0046 | 10 | 1.9253 | 3.3498 | 2.2564 | 4.7276 |
| B0046 | 20 | 2.4343 | 3.3490 | 2.9846 | 5.1918 |
| B0046 | 30 | 1.8627 | 2.4224 | 2.1813 | 4.1506 |
| B0047 | 0 | 4.0987 | 4.0987 | 4.5826 | 4.5826 |
| B0047 | 5 | 3.5840 | 2.4751 | 4.1878 | 3.0963 |
| B0047 | 10 | 3.7959 | 2.3932 | 4.3782 | 2.9646 |
| B0047 | 20 | 5.0399 | 2.1412 | 5.4593 | 2.6923 |
| B0047 | 30 | 4.3974 | 3.2044 | 4.6462 | 3.7854 |
| B0048 | 0 | 3.3200 | 3.3200 | 3.6497 | 3.6497 |
| B0048 | 5 | 3.8272 | 4.6586 | 4.3910 | 5.4143 |
| B0048 | 10 | 4.1843 | 4.5426 | 4.7573 | 5.5365 |
| B0048 | 20 | 4.3218 | 4.8039 | 4.8780 | 5.8816 |
| B0048 | 30 | 5.0087 | 5.0367 | 5.3319 | 5.7145 |

## Decisión

Horizontes de producción: []. Modelo actual reemplazado: False.

Selección final: `{"ablation": "without_cycle", "monotonic": true, "config": {"subsample": 0.9, "reg_lambda": 1.0, "reg_alpha": 0.0, "n_estimators": 52, "min_child_weight": 8, "max_depth": 4, "learning_rate": 0.03, "colsample_bytree": 0.9}, "mae": 3.0792130237352895, "mae_se": 0.46576938200552004, "rmse": 3.823979318451806, "worst_battery_mae": 4.456349092818256, "absolute_bias": 1.8289636243217997, "violation_rate": 0.0}`.

El informe JSON contiene los ocho procedimientos de ablación/restricción, baselines, importancias, residuos, cantidades de muestras y todos los motivos de no promoción. Esta cohorte piloto no demuestra precisión en cualquier batería EV.

Referencias reales superiores a 100 %: 8 / 277. Etiquetas de evaluación sin recortar; los límites físicos se aplican solo a las predicciones.

Violaciones futuras legacy_raw: 132 / 563.

Violaciones futuras legacy_served: 0 / 563.

Violaciones futuras selected: 0 / 563.

## Ablaciones y restricción

Promedios macro por batería y horizonte. Cada variante selecciona sus hiperparámetros dentro de cada fold externo.

| Variante | MAE macro | RMSE macro | Violaciones futuras |
|---|---:|---:|---:|
| ablation_all_free | 3.3299 | 4.1608 | 45 |
| ablation_all_monotonic | 3.2378 | 4.0861 | 0 |
| ablation_without_both_free | 3.3363 | 4.0970 | 47 |
| ablation_without_both_monotonic | 3.2628 | 4.0316 | 0 |
| ablation_without_cutoff_free | 3.2949 | 4.0848 | 47 |
| ablation_without_cutoff_monotonic | 3.1737 | 3.9652 | 0 |
| ablation_without_cycle_free | 3.3267 | 4.0728 | 47 |
| ablation_without_cycle_monotonic | 3.2452 | 3.9996 | 0 |

## Variables y límites

El voltaje de corte identifica el protocolo de cada batería de esta cohorte: B0045=2.0 V, B0046=2.2 V, B0047=2.5 V y B0048=2.7 V. Las ablaciones evalúan este riesgo, no demuestran causalidad.

Importancias gain del ajuste final (no explicaciones causales ni métricas de precisión):
- current_std: 0.19233
- voltage_start: 0.17042
- voltage_max: 0.13744
- horizon_cycles: 0.06512
- temperature_start: 0.05838
- temperature_delta: 0.04808
- charge_temp_start_prev: 0.04592
- current_min: 0.03751

Variables enmascaradas en el modelo final: ['cycle']. Importancia de cutoff_voltage: 0.01956.

La tabla v2 corresponde al procedimiento de selección anidada; no puntúa los pesos finales contra sus propias filas de entrenamiento. El ajuste final usa toda la cohorte tras esa evaluación.

## Comparación del modelo actual

| Batería | MAE conservado | MAE candidato | RMSE conservado | RMSE candidato |
|---|---:|---:|---:|---:|
| B0045 | 2.9137 | 3.3236 | 4.1520 | 4.7887 |
| B0046 | 1.5509 | 1.4878 | 2.5740 | 2.4654 |
| B0047 | 4.0987 | 3.0784 | 4.5826 | 3.5278 |
| B0048 | 3.3200 | 3.0369 | 3.6497 | 3.5332 |
