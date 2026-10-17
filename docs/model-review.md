# Corrección de coherencia de las proyecciones

El backend aplica ahora regresión isotónica decreciente a las cuatro salidas futuras, con límites entre cero y el SoH actual (acotado a 0–100 %). El SoH actual queda fijo como referencia; no se modifica para acomodar las proyecciones futuras. El ajuste minimiza la suma de errores cuadrados respecto de las salidas originales y permite mesetas, sin inventar una tasa de degradación. Se usan pesos iguales porque no existen métricas de validación suficientes para ponderar los horizontes.

La API conserva `raw_current_soh_percent` y `raw_predicted_soh_percent`, marca cada horizonte modificado con `adjusted` y declara `forecast_method: anchored_isotonic`. Las tarjetas y el gráfico utilizan las proyecciones ajustadas; las tarjetas muestran el valor original cuando cambia.

Para el ejemplo 76,35 → 78,50 → 77,22 → 77,34 → 75,83, el resultado es 76,35 → 76,35 → 76,35 → 76,35 → 75,83. Una meseta expresa la limitación de las estimaciones disponibles, no una garantía de ausencia de desgaste.

Este posprocesamiento garantiza coherencia dentro de una solicitud, no una mejora demostrada del MAE/RMSE ni monotonía entre solicitudes con telemetrías distintas. No se reentrenaron los modelos. Siguen siendo necesarios datos etiquetados, validación temporal por batería y evaluación de los horizontes experimentales para mejorar la precisión.

Pruebas: caso de la captura, cruces entre horizontes, conservación de curvas coherentes, límites físicos, rechazo de valores no finitos y contrato de la API con modelos reales.

## Revisión previa al ajuste (registro histórico)

La revisión que sigue describe el comportamiento anterior a esta corrección.

# Revisión de coherencia de las proyecciones

Se inspeccionaron `manifest.json`, `features.json`, `metadata.json`, los cinco modelos exportados y el flujo `extract_features` → `prepare_input` → `predict_all` → respuesta de la API.

- El servicio carga modelos distintos para SoH actual y +5, +10, +20 y +30 ciclos. El orden de las 29 características se comprueba antes de inferir.
- Todos los modelos reciben las características del ciclo actual. El horizonte se determina por el modelo elegido; `target_cycle` es la etiqueta del ciclo futuro. No hay un intercambio de modelos ni una suma de ciclos aplicada a las entradas que explique los aumentos.
- El servicio devuelve las predicciones sin ordenarlas, recortarlas ni aplicar una restricción conjunta de degradación. La interfaz conserva esos valores y avisa cuando un horizonte supera la estimación anterior.
- Los metadatos declaran entrenamiento con B0045–B0048, 277 filas para el modelo actual y 157 para +30. +20 y +30 figuran como experimentales por débil generalización a largo plazo. No se incluyen métricas completas de validación en los artefactos.
- El CSV de paquete del ejemplo está fuera del escenario de celdas utilizado en entrenamiento. Conservar sus unidades y enviarlo al modelo no valida esa transferencia. Su SoH preexistente tampoco se usa como objetivo o entrada.

`model-audit.json` contiene un diagnóstico reproducido sobre el primer tramo de conducción del archivo de ejemplo y un barrido del ciclo manteniendo las demás características fijas. Ese barrido es una prueba de sensibilidad, no una trayectoria real de envejecimiento ni una evaluación de precisión.

## Qué significa una subida

La tendencia esperada por envejecimiento es descendente, pero las salidas de regresores independientes pueden cruzarse. Una subida estimada no demuestra regeneración física ni confirma una mejora real del estado de salud. Un descenso estrictamente monótono tampoco demuestra precisión.

XGBoost permite [restricciones de monotonicidad por característica](https://xgboost.readthedocs.io/en/stable/tutorials/monotonic.html). Restringir `cycle` dentro de cada regresor no garantiza por sí solo el orden entre cinco regresores diferentes para una misma entrada.

Para mejorar la coherencia hay que revisar los datos y objetivos de entrenamiento, la separación de entrenamiento/validación por batería y orden temporal, y evaluar un diseño conjunto de horizontes o de degradación. Cualquier calibración posterior debe validarse y distinguirse de la salida original.

## Límite de esta revisión

No hay notebooks de entrenamiento ni datasets etiquetados completos en el workspace. Por ello no se pudieron auditar la partición de validación, fugas temporales, la construcción de etiquetas futuras, MAE/RMSE ni la precisión en otros paquetes. No se modificaron ni reentrenaron los modelos, ni se forzaron resultados decrecientes.
