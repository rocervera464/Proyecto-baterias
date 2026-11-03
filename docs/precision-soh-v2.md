# SoH v2: degradación acumulada y validación por batería

Este cambio sustituye la reconciliación isotónica de cinco predictores por un
modelo de SoH actual y un único modelo de degradación acumulada. El frontend
presenta los valores de la API sin corregirlos. Una tendencia descendente no
es una demostración de precisión; la autorización de horizontes es independiente
del éxito técnico al cargar los modelos.

## Datos y referencias

Se reconstruyeron las 277 descargas válidas de B0045–B0048 desde los cuatro MAT
locales en `data/raw/nasa_45_48`. La tabla reconstruida coincide numéricamente
con `data/processed/B0045_B0048_clean_SoH.csv`, incluidos los faltantes.
Los datos originales y las tablas procesadas permanecen fuera de Git.

SoH = capacidad / mediana de las primeras cinco capacidades válidas × 100.
Esta definición relativa depende de la calibración inicial de cada celda;
no equivale a porcentaje de capacidad nominal de cualquier batería EV.
En esta cohorte la definición produce referencias superiores a 100 %: no se
recortan ni se sustituyen al evaluar. Los límites físicos del servicio pueden
por ello introducir error sistemático frente a la referencia experimental.
Los ciclos iniciales usados para definir esa referencia no representan una
evaluación prospectiva anterior a disponer de dicha calibración.

Las 29 entradas usan solo contexto declarado, señales de los primeros 300 s
y el EIS/carga anteriores a la descarga. Se excluyen capacidad, duración total,
cantidad total de muestras, q_ref, SoH y etiquetas futuras. El horizonte es la
entrada número 30. Las ablaciones mantienen el contrato de 30 columnas y
enmascaran con NaN las entradas excluidas durante entrenamiento e inferencia.

El target futuro se une por batería y ciclo exacto `cycle + horizon`, nunca
por desplazamiento de filas a través de huecos. El target de entrenamiento es
`max(0, real_current_soh - real_future_soh)`, sin pérdida mínima inventada.
MAE, RMSE, R² y residuos se calculan contra las etiquetas SoH originales,
incluidas las recuperaciones aparentes; no contra etiquetas alisadas.

## Selección y evaluación

El script `backend/scripts/train_precision_soh_v2.py` realiza:

1. Cuatro particiones externas Leave-One-Battery-Out.
2. Selección interna por batería de seis configuraciones aleatorias con semilla
   42, en un espacio explícito de ocho hiperparámetros. El modelo actual
   compara además su configuración histórica.
3. Early stopping con paciencia de 30 árboles exclusivamente en validación
   interna. El ajuste sobre las tres baterías externas de entrenamiento usa
   la mediana de las mejores cantidades de árboles internas; no observa
   etiquetas de la batería externa de prueba.
4. Comparación futura de todas las entradas, sin ciclo, sin voltaje de corte
   y sin ambos, con y sin restricción creciente sobre `horizon_cycles`.
5. Selección entre configuraciones dentro de un error estándar del mejor MAE
   interno. Dentro de ese conjunto se priorizan violaciones, peor MAE por
   batería, RMSE, sesgo absoluto y MAE, en ese orden. La tolerancia proviene
   de la variabilidad observada entre baterías, no de puntos porcentuales
   elegidos para aprobar un modelo.
6. Comparación externa con persistencia y degradación media por horizonte,
   calculada solo con baterías de entrenamiento. Ambas se anclan al mismo
   SoH actual estimado que utiliza el modelo nuevo: se evalúa el error de la
   cadena completa, no se entrega SoH actual real a las referencias.
7. Comparación con los cinco modelos históricos, reajustados en las baterías
   de entrenamiento de cada fold con sus configuraciones registradas, sin
   reconciliación. No se puntúan pesos históricos entrenados con la batería
   de prueba como si fueran predicciones externas.

Se exportan resultados externos para las ocho variantes de ablación/restricción,
además del procedimiento de selección anidada. El informe incluye métricas
por horizonte y batería, sesgo, mediana del error absoluto, importancias y
violaciones. R² solo se calcula cuando hay suficientes valores distintos.

El modelo actual solo se reemplaza si la comparación externa mejora MAE y
RMSE en cada batería. En caso contrario se conserva exactamente su archivo.

## Puerta de producción

Un horizonte debe mejorar estrictamente MAE y RMSE frente a ambas referencias
y la arquitectura histórica tanto bruta como servida en **cada** batería, disponer de cuatro folds con
referencias evaluables y no producir violaciones en el prefijo temporal
evaluado. La comparación con todas las baterías evita esconder un fold malo
tras un promedio. No se usa un umbral absoluto de error elegido a posteriori.
Una selección final sin restricción también debe pasar la comprobación de
coherencia en la cuadrícula de entrenamiento.

Estos criterios son una puerta conservadora de un piloto, no un criterio
universal de precisión aceptable para operación EV. La cohorte tiene cuatro
celdas y ha sido estudiada previamente. Las filas correlacionadas de ciclos
no son cientos de baterías independientes; seleccionar una versión después
de comparar estos resultados tampoco constituye una nueva prueba externa.
Falta validación de una cohorte independiente y de nuevas condiciones de uso.

El manifiesto distingue `production_horizons` de `research_horizons`. Si ninguno
supera la puerta, la respuesta ofrece únicamente SoH actual y un arreglo futuro
vacío. La familia adicional de temperatura ambiente conserva su modelo actual;
sus predictores futuros históricos no han pasado esta evaluación v2 y quedan
excluidos del servicio de producción.

## Inferencia y contrato

El servicio carga una vez con caché, verifica nombres y orden de las 29/30
columnas, convierte None a NaN y ejecuta únicamente horizontes autorizados.
SoH futuro = clip(SoH actual − max(0, degradación), 0, SoH actual).
Un incremento entre horizontes mayor que 1e-6 puntos genera un error; solo
se absorben diferencias dentro de esa tolerancia numérica. No se usa isotónica.
Las funciones antiguas de reconciliación quedan para reproducir auditorías
históricas y no participan en `/predict`.

`POST /api/v1/predict` conserva los nombres de los campos básicos y añade
`production_horizons`. No devuelve `experimental`, `adjusted` ni salidas raw.
Los clientes deben admitir cero, uno o varios horizontes. El antiguo indicador
`analysis_mode=exploratory` se acepta como entrada heredada, pero nunca omite
la comprobación de compatibilidad.

El formulario exige ciclo entero positivo sin valor por defecto. Ambiente y
voltaje de corte también se declaran o detectan, no se suponen. Se conserva la
importación de CSV/TSV/TXT/JSON/XLSX/XLS/Parquet/MAT y la conversión de unidades;
la interfaz principal exige señales completas. La gráfica une puntos de la
API por segmentos lineales y permite mostrar solo el estado actual.

## Reproducción

Desde la raíz, usando Python del entorno local:

```powershell
.\backend\.venv\Scripts\python.exe backend/scripts/prepare_nasa_training.py data/raw/nasa_45_48 data/processed/precision_soh_v2_verified.csv
.\backend\.venv\Scripts\python.exe backend/scripts/train_precision_soh_v2.py data/processed/precision_soh_v2_verified.csv backend/model_families/nasa_cold_legacy_v1 backend/model_candidates/precision_soh_v2 --candidates 6
.\backend\.venv\Scripts\python.exe backend/scripts/package_precision_soh_v2.py data/processed/precision_soh_v2_verified.csv backend/model_families/nasa_cold_legacy_v1 backend/model_candidates/precision_soh_v2 backend/model_artifacts docs/precision-soh-v2
.\backend\.venv\Scripts\python.exe -m pytest -v
npm --prefix frontend test
npm --prefix frontend run build
```

El paquete histórico nasa_cold_legacy_v1 se conserva en Git sin registrarlo para producción.
El argumento de referencia debe apuntar al paquete histórico conservado antes
de instalar v2, no a los nuevos artefactos. No se vuelve a elegir una referencia
usando resultados de entrenamiento. XGBoost y las dependencias se fijan en
`backend/requirements.txt`.

Informes completos: `docs/precision-soh-v2/validation_metrics.json` y
`validation_predictions.csv`. El CSV identifica procedimiento, batería,
ciclo, horizonte, SoH real, SoH estimado y error absoluto. Los artefactos
operativos quedan en `backend/model_artifacts`; su manifiesto determina qué
predicciones pueden servirse.

Referencias de implementación:
[restricciones monotónicas de XGBoost](https://xgboost.readthedocs.io/en/stable/tutorials/monotonic.html)
y [validación por grupos de scikit-learn](https://scikit-learn.org/stable/modules/cross_validation.html).
