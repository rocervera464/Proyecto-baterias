# Método y límites de XGBoost telemetry v4

La ruta principal funciona con cuatro señales: tiempo, voltaje, corriente y temperatura. Ciclo, ambiente, corte, EIS, carga previa y capacidad **no son features**. No se sustituyeron por constantes ni por identificaciones del catálogo. Un ciclo declarado puede aparecer como etiqueta; la química y el nivel declarados solo restringen el dominio.

## Datos y preparación

Los originales están en `data/raw/nasa_45_48/` y `data/raw/nasa_room_2a/`. Son ocho MAT NASA disponibles localmente. Se preservan sin modificaciones y se registran sus SHA-256 en `dataset_audit.json` de cada familia.

| Protocolo | Baterías | Descargas con capacidad positiva | Muestreo productivo mínimo |
|---|---|---:|---:|
| 1 A, ambiente 4 °C | B0045, B0046, B0047, B0048 | 277 | 21 |
| 2 A, ambiente 24 °C | B0005, B0006, B0007, B0018 | 636 | 17 |

Los protocolos se entrenan por separado. El segundo amplía los protocolos soportados mediante otra familia, sin mezclar indiscriminadamente sus filas con la cohorte fría. El informe por batería registra corriente observada, ambiente, corte, ciclos, capacidad de referencia y rechazos. Las once capacidades no positivas/no finitas de la cohorte fría se excluyen como targets inválidos; no se eliminan capacidades positivas para mejorar métricas.

SoH = capacidad del ciclo / mediana de las primeras cinco capacidades positivas y finitas de la misma batería × 100. La referencia crea etiquetas, incluida la evaluación; no se calcula desde el archivo de un usuario ni entra al modelo. Por esa definición pueden aparecer valores alrededor o por encima de 100 %.

El notebook original se conserva en `data/source_notebooks/original_training.ipynb`. Los artefactos anteriores permanecen en `backend/model_artifacts/` y `backend/model_families/`. No se crearon ni se atribuyeron pesos nuevos a GRU/GPR.

## Una implementación de características

`backend/app/services/feature_engineering.py` contiene `clean_telemetry` y `extract_telemetry_features`, utilizadas tanto por entrenamiento como por FastAPI. El código contextual anterior queda para la API histórica.

Se ordenan muestras y se aplica exclusivamente `0 <= time_s <= 300`. La limpieza no toma decisiones a partir de valores posteriores a esa ventana. Se eliminan duplicados idénticos; muestras contradictorias con el mismo tiempo se rechazan. Solo se descartan filas inválidas aisladas cuando representan como máximo 5 % de las filas elegibles. No hay interpolación ni señales simuladas. Se verifican cantidad, cobertura y separación máxima entre muestras con el perfil de la cohorte final.

Los 21 inputs base son siete estadísticas de voltaje, corriente y temperatura: inicio, media, desviación poblacional, mínimo, máximo, final y cambio final–inicial.

| Conjunto | Contenido |
|---|---|
| A | 21 estadísticas |
| B | A + tres pendientes por mínimos cuadrados sobre el tiempo real |
| C | B + tres integrales trapezoidales de las señales observadas |
| D | B + diferencias entre mitades de voltaje/temperatura, media/desviación/cambio de potencia e integral de potencia |

Potencia = voltaje × corriente. Las mitades se refieren al tramo observado dentro de la ventana; las integrales terminan en la última muestra disponible, sin extrapolar a 300 s. La energía es un proxy con signo, no capacidad medida. No se agregaron todas las variables propuestas: rango, CV y tasas basadas en deltas duplican en gran medida estadísticas ya disponibles y no forman parte de este conjunto controlado.

La selección final fue A para 1 A (21 inputs) y D para 2 A (30). Los contratos futuros añaden únicamente `horizon_cycles`: 22 y 31 inputs respectivamente. Las tablas de selección por conjunto y las importancias están en los informes y artefactos.

## Entrenamiento y evaluación

Se utilizó `XGBRegressor(objective="reg:squarederror", random_state=42, tree_method="hist", n_jobs=1)`. Se compararon tres configuraciones nuevas, con profundidad 2/3, regularización y distintos parámetros de muestreo, aprendizaje, pesos mínimos y gamma. Las cantidades de árboles finales proceden de early stopping interno; no de la batería de test.

El procedimiento principal es LOBO anidado por protocolo:

1. Reservar una de las cuatro baterías como test externo del fold.
2. Comparar A/B/C/D y configuraciones mediante baterías internas retenidas, usando solo las otras tres.
3. Para la selección futura, ajustar los modelos actuales internos sin la batería de validación correspondiente; su búsqueda se vuelve a restringir a las baterías internas de entrenamiento.
4. Reajustar con el train externo y evaluar una sola vez ese fold externo.
5. Seleccionar los artefactos finales con validación por batería sobre la cohorte completa y ajustarlos con todas sus filas válidas.

Las métricas externas estiman el procedimiento de selección; no son una prueba independiente del artefacto final reajustado con todas las baterías. La cohorte ya se estudió en versiones anteriores del proyecto. No hay validación externa de vehículos o paquetes y no se afirma precisión uniforme de 0 a 100 %.

Se guardan MAE, RMSE, R², error absoluto mediano y error medio, por batería/horizonte y globales, además de promedios por batería. `selection_audit.json` registra separaciones internas/externas y error de ajuste frente a error retenido. `validation_predictions.csv` permite reconstruir los resultados por fila. La comparación de ventanas de 60/120/180/300/600 s es experimental: reutiliza la configuración elegida sin el test para 300 s. No se cambió automáticamente la ventana productiva a la que mejor puntuó en esa comparación reutilizada.

## Futuro y decisión de producción

Cada familia tiene un único modelo futuro entrenado para `max(0, SoH actual real − SoH futuro real)` en ciclos exactos `cycle+h`, dentro de la misma batería. Las recuperaciones aparentes se conservan en los targets reales de evaluación; solo la pérdida usada para ajustar se limita a cero.

Se compararon modelos con y sin monotonía en `horizon_cycles`. Se permite priorizar la variante monotónica solo cuando su MAE interno queda a como máximo 1 % del mejor. Ambas familias finales seleccionaron la variante monotónica. La inferencia aplica pérdida no negativa y `future = clip(current_pred − loss, 0, current_pred)`. No se aplican curvas inventadas, isotonicidad ni ajustes de proyecciones en React.

Baselines de evaluación:

- Media del SoH actual del train externo.
- Persistencia del SoH actual estimado, como baseline desplegable.
- Pérdida histórica media por horizonte, estimada solo con train.
- Regresión lineal de pérdida frente al horizonte, ajustada solo con train.
- Media del SoH futuro del train por horizonte.
- Persistencia del SoH actual real, marcada como referencia oráculo no disponible en inferencia.

El criterio inicial exigía mejora de MAE macro de al menos 2 % frente a persistencia/pérdida media/lineal, mejora sobre persistencia en al menos tres baterías, diez muestras por batería y coherencia temporal. La revisión posterior endureció la publicación: R² retenido positivo y mejora frente a la media futura del train. Esa revisión **solo retiró horizontes**, no reajustó árboles ni relajó criterios para habilitarlos. Está registrada como `post_validation_review`; no se presenta como un criterio fijado antes de observar los resultados.

**Resultado de validación de ambas familias:** `production_horizons=[]`, `research_horizons=[5,10,20,30]`. Los modelos futuros son reales y están exportados; las predicciones retenidas y sus métricas se conservan en CSV/JSON. La tasa de violación monotónica cero no bastó para aprobarlos. En particular, +30 frío mejora persistencia pero tiene R² negativo y no mejora la media futura simple.

**Cambio solicitado después de la evaluación:** las cuatro proyecciones se muestran ahora de forma predeterminada como estimaciones de precisión limitada. La API devuelve `forecast_horizons` y `validation_status="research"` para distinguir disponibilidad de aprobación, sin alterar las métricas ni el manifiesto científico. `include_research_forecasts=false` permite conservar exclusivamente los horizontes aprobados, en el JSON de `/predict` o la query de `/predict-file`. El servicio de modelos también conserva su modo interno estricto por defecto; la ruta API solicita explícitamente las proyecciones adicionales. No se fabrican pérdidas ni se modifican los valores en React.

## Comparación honesta

| Modelo / procedimiento | MAE actual 1 A | MAE actual 2 A |
|---|---:|---:|
| Contextual anterior, reajustado por fold | 2,9708 | 2,8468 |
| V4 solo telemetría, selección anidada | 4,3612 | 4,1898 |
| Baseline de media del train | 6,9422 | 9,6129 |

V4 supera el baseline simple, pero **pierde precisión frente al modelo que dispone de contexto adicional**. Se probaron pendientes, AUC, potencia, mitades, regularización y ventanas antes de documentar esa limitación; no se volvió a exigir contexto al usuario. La comparación histórica respeta su configuración real, su ablation y su tipo de target; se excluyen los mismos targets no positivos. Los parámetros históricos se habían estudiado con estas celdas, de modo que tampoco son evidencia externa independiente.

## Contratos de aplicación

`TelemetryOnlyRequest` requiere únicamente las cuatro señales. La API principal es v4; el contrato previo permanece bajo `/legacy`. La información opcional de química/nivel declarada restringe el alcance, sin entrar al predictor. El contador local de descargas de un MAT no se presenta como un ciclo absoluto declarado.

El importador de producción sirve tanto a `/api/v1/telemetry/import` como a `/api/v1/predict-file`; acepta los ocho formatos, aliases deterministas, unidades declaradas y fechas ISO. Excel selecciona la hoja con más señales reconocidas, con preferencia por nombres comunes. No hay fuzzy matching agresivo. Hojas o descargas adicionales pueden seleccionarse por API o interfaz. No se concatenan baterías/ciclos. El XLS de las pruebas es BIFF8 real, generado desde las mediciones B0046 con xlwt; ejecutar las pruebas solo requiere xlrd.

Los artefactos verifican SHA-256, objetivos de los boosters, orden/nombres de columnas y decisiones de validación. Las dos familias se cargan una sola vez con `lru_cache`. El catálogo de identidad anterior no participa en la predicción v4. Los logs muestran formato, aliases, muestras, ventana, familia y finalización; nunca las filas completas.

El frontend conserva carga manual, vista previa, análisis animado, tarjetas, gráfica lineal y segunda vida orientativa. No solicita parámetros técnicos. Sin ciclo declarado usa horizontes relativos y `null` en las etiquetas de ciclo; no supone ciclo 1. No corrige numéricamente la respuesta. El SoH no certifica seguridad, carga disponible ni vida útil restante.

## Reproducibilidad

Desde la raíz, con los ocho MAT originales locales:

```powershell
.\backend\.venv\Scripts\python.exe scripts/evaluate_models.py --retrain
.\backend\.venv\Scripts\python.exe -m pytest -v
npm --prefix frontend test
npm --prefix frontend run build
```

Sin `--retrain`, el evaluador reconstruye informes desde predicciones fuera de muestra guardadas; no evalúa los modelos finales sobre sus propias filas de ajuste. `--refresh-legacy` repite los refits históricos. Las versiones de dependencias están fijadas en `backend/requirements.txt`; los metadatos registran versiones de XGBoost/sklearn, parámetros, fechas y fuentes.

Las tablas completas, incluyendo sesgo, error mediano, importancias, búsqueda de features, ventanas y baselines, están en [comparison.md](comparison.md), [validation_metrics.json](validation_metrics.json) y los archivos de `backend/model_artifacts_v4/`. El siguiente paso de precisión es incorporar y reservar baterías compatibles independientes; no publicar horizontes basándose solo en estas cuatro celdas por protocolo.
