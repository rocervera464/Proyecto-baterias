# Entrega del sistema de telemetría v4

Implementado en `feature/xgboost-prediction-v4`. No se hizo merge a main.

El flujo principal acepta un archivo, muestra sus cuatro señales y ejecuta XGBoost sin solicitar parámetros del ensayo. El lector de archivos y el cálculo de características se comparten con la API y el entrenamiento. La API contextual anterior queda disponible bajo `/legacy`; los pesos y notebooks históricos se conservaron.

## Modelos seleccionados

Se entrenaron realmente dos familias separadas con los ocho MAT originales disponibles. No se mezclaron los protocolos de 1 A / 4 °C y 2 A / 24 °C. La definición del target es capacidad / mediana de las primeras cinco capacidades válidas de cada celda × 100. La capacidad y esa referencia nunca entran al predictor.

| Familia | Descargas válidas | Ventana | Características | Modelo actual | Modelo de degradación |
|---|---:|---:|---|---|---|
| NASA 1 A | 277 | 300 s | A: 21 estadísticas | 72 árboles, profundidad 2, LR 0,05 | 94 árboles, profundidad 3, LR 0,025, monotónico |
| NASA 2 A | 636 | 300 s | D: 30 derivadas de señales | 165 árboles, profundidad 2, LR 0,05 | 40 árboles, profundidad 2, LR 0,05, monotónico |

Las 21 características son inicio, media, desviación estándar poblacional, mínimo, máximo, final y cambio final−inicio para voltaje, corriente y temperatura. D agrega tres pendientes, cambios entre mitades de voltaje/temperatura, media/desviación/cambio de potencia y una integral de potencia. El modelo futuro añade solamente `horizon_cycles`.

Se compararon A/B/C/D, tres configuraciones nuevas, variantes futuras libres/monotónicas y ventanas 60/120/180/300/600 s. Producción conserva 300 s. Las tablas de ventanas son experimentales y no se usaron para elegir una ventana retrospectivamente sobre el test. Todos los hiperparámetros, importancias, conjuntos y selecciones internas están en [comparison.md](comparison.md) y los `metadata.json`/`selection_audit.json` de cada familia.

## Antes y después: error de SoH actual

MAE/RMSE en puntos porcentuales, promediados por batería; R² agrupado. LOBO anidado para v4. La arquitectura histórica se reajustó usando solo las baterías de entrenamiento de cada fold, con sus entradas y targets originales.

| Procedimiento | 1 A: MAE / RMSE | 2 A: MAE / RMSE |
|---|---:|---:|
| Anterior, con contexto adicional | 2,9708 / 3,7395 | 2,8468 / 3,4571 |
| V4, solo cuatro señales | 4,3612 / 5,3892 | 4,1898 / 5,0178 |
| Media del entrenamiento | 6,9422 / 8,7335 | 9,6129 / 11,1815 |

R² actual v4: 0,5347 para 1 A y 0,7533 para 2 A. V4 supera el baseline de media y simplifica la entrada, pero pierde precisión frente al modelo contextual anterior. No se presenta como una mejora de precisión.

## Futuro: proyecciones habilitadas y validación

| Horizonte | 1 A: MAE / RMSE | 2 A: MAE / RMSE |
|---|---:|---:|
| +5 | 4,5869 / 5,5885 | 4,3101 / 5,1884 |
| +10 | 4,4611 / 5,5541 | 4,3841 / 5,2447 |
| +20 | 4,6624 / 5,4529 | 4,5452 / 5,4054 |
| +30 | 4,3952 / 5,3267 | 4,7277 / 5,6819 |

En ambas familias: `production_horizons=[]`; `research_horizons=[5,10,20,30]`. Hay un único XGBoost de pérdida acumulada por familia, entrenado y exportado. Los modelos producen coherencia monotónica, pero no mejoran todos los baselines según los controles de publicación. Por petición posterior del usuario, las cuatro proyecciones están habilitadas en tarjetas y gráfica con una nota de precisión limitada. La API distingue `forecast_horizons` de los horizontes aprobados y marca cada salida con `validation_status`. Se puede pedir únicamente resultados aprobados mediante `include_research_forecasts=false`. No se fabrican pérdidas ni se cambian métricas o valores en React.

Baselines: persistencia del SoH estimado, pérdida histórica media por horizonte, pérdida lineal y media futura del entrenamiento. Se distingue la persistencia del SoH real como oráculo, no desplegable. [comparison.md](comparison.md) contiene cada comparación, R², tamaño muestral y motivos de exclusión; [validation_metrics.json](validation_metrics.json) incluye sesgo, error mediano y desglose por batería. Las predicciones retenidas están en [validation_predictions.csv](validation_predictions.csv).

La revisión posterior endureció la publicación con R² positivo y ventaja frente a media futura. Solo retiró horizontes; no cambió pesos ni relajó umbrales. Está documentada como revisión posterior, no como regla fijada antes de observar resultados.

## Integración y comprobaciones

- Importación CSV, TSV, TXT, JSON, XLSX, XLS BIFF8, Parquet y MAT estándar/NASA. Unidades declaradas, aliases deterministas, hojas/descargas seleccionables y ausencia de concatenación entre baterías.
- La API JSON requiere solo cuatro señales. `/api/v1/predict-file` recibe el archivo como cuerpo binario y `filename` en la query; no exige multipart.
- Vista previa con archivo, formato, muestras, ventana y variables; análisis animado; tarjetas predeterminadas y gráfica lineal. Sin formulario de parámetros ni consulta de identidad obligatoria.
- 145 pruebas backend: 109 de regresión/contrato histórico y 36 de v4. El entrenamiento y la evaluación de precisión son comandos separados de pytest.
- 81 pruebas frontend; compilación de producción y ESLint correctos. Vite avisa del tamaño del bundle, sin impedir el build.
- `pip check` y `backend/start.ps1 -Check` correctos. Los dos modelos actuales y sus artefactos se cargan con integridad verificada.
- Prueba de navegador contra FastAPI real: carga, predicción con cuatro señales, resultado intacto, ausencia de ciclo inventado, cuatro proyecciones con su estado de validación, borrado, error por temperatura ausente, equivalencia manual/archivo y anchura móvil de 390 px. El tiempo de presentación se aceleró solo en el arnés de QA.
- Los siete CSV del kit se comprobaron por `/api/v1/predict-file` con HTTP 200. B0045 ciclo 30 entrega 78,6406478881836 % tanto con metadatos como solo con señales. Es una comprobación funcional sobre datos relacionados con el entrenamiento, no una medida independiente de precisión.

## Reproducir

```powershell
.\backend\start.ps1 -Check
.\backend\.venv\Scripts\python.exe scripts/evaluate_models.py
.\backend\.venv\Scripts\python.exe -m pytest -v
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Para repetir todo el entrenamiento desde los MAT locales: añadir `--retrain` al evaluador. `--refresh-legacy` repite la comparación histórica. Los MAT no se incluyen en Git; se registran rutas y hashes de origen. Las versiones y semillas están registradas en los artefactos.

## Limitaciones y siguiente trabajo

Solo hay cuatro celdas por protocolo; ya se habían estudiado en el proyecto. La evaluación anidada corresponde al procedimiento, no a una cohorte externa independiente del artefacto final ajustado con todas las filas. No valida paquetes EV, otros protocolos ni todo el intervalo de salud.

La API rechaza señales ausentes, muestreo insuficiente, huecos excesivos y datos fuera del dominio observado; no los recorta para conseguir una predicción. El ciclo absoluto no se deduce de cuatro señales y queda `null` si el archivo no lo declara. SoH no acredita seguridad ni vida útil restante.

El siguiente paso es incorporar y reservar baterías compatibles independientes, reevaluar precisión por protocolo y volver a comparar los modelos futuros con baselines antes de habilitar horizontes. El análisis metodológico completo está en [README.md](README.md).

## Inventario de archivos

La lista siguiente distingue archivos modificados y nuevos respecto de la rama de origen. Los artefactos incluyen modelos reales, features, perfiles, manifiestos con SHA-256, metadatos, auditorías, métricas, predicciones retenidas e importancias. No incluye cachés, entornos virtuales, dist ni MAT originales.

<!-- file-inventory -->

### Modificados

- `README.md`
- `backend/app/main.py`
- `backend/app/schemas/prediction.py`
- `backend/app/schemas/telemetry.py`
- `backend/app/services/feature_engineering.py`
- `backend/app/services/model_service.py`
- `backend/app/services/runtime_status.py`
- `backend/start.ps1`
- `backend/tests/test_binary_equivalence.py`
- `backend/tests/test_compatibility.py`
- `backend/tests/test_compatibility_preflight.py`
- `backend/tests/test_excel_prediction_regression.py`
- `backend/tests/test_file_import.py`
- `backend/tests/test_manual_csv_equivalence.py`
- `backend/tests/test_model_availability.py`
- `backend/tests/test_prediction.py`
- `backend/tests/test_severe_telemetry_recovery.py`
- `backend/tests/test_telemetry.py`
- `backend/tests/test_telemetry_identity.py`
- `docs/telemetry-normalization.md`
- `frontend/src/components/BatteryHealthCard.tsx`
- `frontend/src/components/ManualTelemetryWizard.tsx`
- `frontend/src/components/PredictionChart.tsx`
- `frontend/src/components/PredictionProgress.tsx`
- `frontend/src/components/TelemetryFileInsight.tsx`
- `frontend/src/components/TelemetryForm.tsx`
- `frontend/src/components/TelemetryInformationGuide.tsx`
- `frontend/src/components/methodology/MethodologyVisuals.tsx`
- `frontend/src/components/telemetryWorkspace.css`
- `frontend/src/data/methodologyData.ts`
- `frontend/src/data/methodologyFeatures.ts`
- `frontend/src/data/modelEvaluation.ts`
- `frontend/src/pages/PredictionPage.tsx`
- `frontend/src/services/api.ts`
- `frontend/src/types/prediction.ts`
- `frontend/src/types/telemetry.ts`
- `frontend/src/utils/manualTelemetry.ts`
- `frontend/src/utils/validatePrediction.ts`
- `frontend/tests/methodology.test.mjs`

### Nuevos

- `backend/app/api/routes/telemetry_v4.py`
- `backend/app/legacy.py`
- `backend/app/services/telemetry_parser.py`
- `backend/model_artifacts_v4/nasa_cold_1a/dataset_audit.json`
- `backend/model_artifacts_v4/nasa_cold_1a/domain_profile.json`
- `backend/model_artifacts_v4/nasa_cold_1a/feature_importance.csv`
- `backend/model_artifacts_v4/nasa_cold_1a/features.json`
- `backend/model_artifacts_v4/nasa_cold_1a/future_feature_importance.csv`
- `backend/model_artifacts_v4/nasa_cold_1a/future_features.json`
- `backend/model_artifacts_v4/nasa_cold_1a/leakage_audit.json`
- `backend/model_artifacts_v4/nasa_cold_1a/manifest.json`
- `backend/model_artifacts_v4/nasa_cold_1a/metadata.json`
- `backend/model_artifacts_v4/nasa_cold_1a/selection_audit.json`
- `backend/model_artifacts_v4/nasa_cold_1a/validation_metrics.json`
- `backend/model_artifacts_v4/nasa_cold_1a/validation_predictions.csv`
- `backend/model_artifacts_v4/nasa_cold_1a/window_comparison.json`
- `backend/model_artifacts_v4/nasa_cold_1a/xgboost_soh_current.json`
- `backend/model_artifacts_v4/nasa_cold_1a/xgboost_soh_degradation.json`
- `backend/model_artifacts_v4/nasa_room_2a/dataset_audit.json`
- `backend/model_artifacts_v4/nasa_room_2a/domain_profile.json`
- `backend/model_artifacts_v4/nasa_room_2a/feature_importance.csv`
- `backend/model_artifacts_v4/nasa_room_2a/features.json`
- `backend/model_artifacts_v4/nasa_room_2a/future_feature_importance.csv`
- `backend/model_artifacts_v4/nasa_room_2a/future_features.json`
- `backend/model_artifacts_v4/nasa_room_2a/leakage_audit.json`
- `backend/model_artifacts_v4/nasa_room_2a/manifest.json`
- `backend/model_artifacts_v4/nasa_room_2a/metadata.json`
- `backend/model_artifacts_v4/nasa_room_2a/selection_audit.json`
- `backend/model_artifacts_v4/nasa_room_2a/validation_metrics.json`
- `backend/model_artifacts_v4/nasa_room_2a/validation_predictions.csv`
- `backend/model_artifacts_v4/nasa_room_2a/window_comparison.json`
- `backend/model_artifacts_v4/nasa_room_2a/xgboost_soh_current.json`
- `backend/model_artifacts_v4/nasa_room_2a/xgboost_soh_degradation.json`
- `backend/scripts/evaluate_models.py`
- `backend/scripts/train_telemetry_v4.py`
- `backend/tests/fixtures/B0046_cycle25.xls`
- `backend/tests/test_telemetry_v4.py`
- `data/samples/pruebas_telemetria/B0005_ciclo_030.csv`
- `data/samples/pruebas_telemetria/B0006_ciclo_168.csv`
- `data/samples/pruebas_telemetria/B0045_ciclo_030.csv`
- `data/samples/pruebas_telemetria/B0045_ciclo_030_solo_senales.csv`
- `data/samples/pruebas_telemetria/B0046_ciclo_025.csv`
- `data/samples/pruebas_telemetria/B0047_ciclo_040.csv`
- `data/samples/pruebas_telemetria/B0048_ciclo_050.csv`
- `data/samples/pruebas_telemetria/LEEME.md`
- `data/samples/pruebas_telemetria/procedencia.json`
- `data/samples/telemetrias_para_pruebas.zip`
- `docs/telemetry-v4/DELIVERY.md`
- `docs/telemetry-v4/README.md`
- `docs/telemetry-v4/comparison.md`
- `docs/telemetry-v4/validation_metrics.json`
- `docs/telemetry-v4/validation_predictions.csv`
- `frontend/tests/telemetryV4.test.mjs`
- `scripts/evaluate_models.py`
