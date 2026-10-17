# Revisión y comparación de los cinco modelos

## Actualización: datos recibidos y modelos instalados

El usuario proporcionó `4. BatteryAgingARC_45_46_47_48.zip`. Se extrajeron únicamente los cuatro `.mat` y su README, sin ejecutar archivos del ZIP. Los hashes se registran en `docs/training-data-provenance.json`. Datos originales y tablas procesadas están ignorados por Git.

`backend/scripts/prepare_nasa_training.py` reproduce las definiciones auditadas del notebook. Se obtuvieron 70/69/69/69 filas válidas (277 en total), coincidiendo con el artefacto. Las características no históricas de la primera descarga de las cuatro celdas coinciden con el backend a tolerancia 1e-10. Las celdas llegan al ciclo 72 y tienen SoH observado aproximado de 68,57–122,23 %. El README especifica 4 °C y descarga de 1 A. Esto no respalda precisión al 40 % de salud, a cientos de ciclos o en paquetes externos.

Se ejecutó `compare_training.py`: LeaveOneGroupOut externo y selección interna por batería entre tres configuraciones predefinidas. Se usó MAE macro para elegir parámetros, con RMSE y R² registrados. El conjunto evaluado nunca interviene en la selección interna. La construcción de objetivos conserva el ciclo exacto t+h y evita cruces de baterías o saltos por filas.

### Resultados crudos: comparación recalculada

| Horizonte | MAE base | MAE selección anidada | RMSE base | RMSE selección |
|---|---:|---:|---:|---:|
| Actual | 2,8413 | 2,9615 | 3,3515 | 3,5159 |
| +5 | 3,5207 | 3,4592 | 4,0699 | 4,0654 |
| +10 | 3,4142 | 3,1915 | 3,9035 | 3,6956 |
| +20 | 4,3136 | 4,0205 | 4,6810 | 4,5410 |
| +30 | 3,9123 | 3,8964 | 4,2268 | 4,2289 |

Los valores base corresponden a reentrenar la configuración original dentro de cada fold, no a evaluar el modelo de producción entrenado con todas las baterías sobre sus propios datos. Difieren modestamente de los outputs históricos; no se mezclan ambas tablas. El entrenamiento de esta comparación fija `n_jobs=1` y semilla 42.

Se aceptaron candidatos solo al mejorar tanto MAE como RMSE macro y sin aumentar el MAE de ninguna batería más de 0,5 puntos. Después se seleccionó la configuración final mediante validación por batería en el conjunto completo y se ajustó con todas las filas disponibles del horizonte. Configuración final de +5: regularizada con restricción decreciente de ciclo; +10/+20: regularizada de profundidad 2. Se conservaron los archivos originales del actual y +30 byte por byte porque sus candidatos no superaron los criterios.

### Comprobación con reconciliación isotónica

`evaluate_reconciled.py` genera predicciones para cada batería excluida del entrenamiento, reutiliza las selecciones internas guardadas y evalúa el paquete aceptado después del posprocesamiento existente. Incluye los cinco horizontes aunque no haya etiqueta futura para todos los ciclos; únicamente puntúa objetivos observados.

| Horizonte | MAE base ajustado | MAE paquete ajustado | RMSE base ajustado | RMSE paquete ajustado |
|---|---:|---:|---:|---:|
| Actual | 2,9708 | 2,9708 | 3,7395 | 3,7395 |
| +5 | 3,1684 | 3,0439 | 3,6451 | 3,5462 |
| +10 | 3,2127 | 3,0650 | 3,7091 | 3,5678 |
| +20 | 3,8785 | 3,6596 | 4,2808 | 4,1523 |
| +30 | 3,8196 | 3,8111 | 4,1252 | 4,1152 |

Los errores están en puntos porcentuales de SoH; son medias macro por batería. Aunque el modelo +30 no cambia, su resultado ajustado puede cambiar por la reconciliación conjunta. B0047 presenta pequeñas regresiones de MAE ajustado, hasta 0,1216 puntos; no todas las baterías mejoran. La decisión de aceptar el paquete usa estas mismas comparaciones, por lo que estos resultados son evidencia piloto exploratoria, no un nuevo test independiente. No hay validación externa ni temporal hacia adelante. +20/+30 mantienen su condición experimental; los R² crudos largos siguen siendo negativos en promedio.

### Instalación y reversión

Se instalaron únicamente los modelos +5/+10/+20 en `backend/model_artifacts/`, junto con metadatos de versión/evaluación y un perfil de rangos observados. El perfil es documentación de dominio: no añade filtrado automático a la API. No se modificaron las 29 entradas ni el contrato de respuesta. Copia íntegra anterior: `backend/model_backups/before_nasa_nested_v1/`. Candidatos: `backend/model_candidates/nasa_nested_v1/`. Ambas carpetas están ignoradas por Git.

Verificación: 27 pruebas backend aprobadas tras instalar, carga de los cinco modelos con 29 entradas, 277 predicciones finitas y resultados reconciliados dentro de 0–100 % y no crecientes. Los procesos de backend que ya tenían modelos en caché necesitan reiniciarse para cargar los archivos nuevos.

Informes completos: `docs/training-comparison.json`, `docs/reconciled-comparison.json` y `docs/reconciled-comparison.csv`. Los scripts permiten repetir el experimento con los archivos originales. La siguiente sección conserva el diagnóstico inicial anterior a recibir esos datos; su estado pendiente quedó resuelto en esta actualización.

## Diagnóstico inicial (histórico)

Se descargó el notebook original compartido por el usuario, conservado en `data/source_notebooks/original_training.ipynb`. Se leyó como JSON; no se ejecutaron automáticamente sus celdas. La fuente es https://colab.research.google.com/drive/1A9NijZSL18T2a9WFeayGroQ7hwdBKAnK.

## Hallazgos

Las celdas 57 y 64 utilizan LeaveOneGroupOut por batería. La construcción de etiquetas de la celda 62 hace una unión por batería y ciclo exacto t+h: no se encontró desplazamiento incorrecto entre baterías. Los cinco modelos se entrenan con una misma configuración fija, sin búsqueda de hiperparámetros en ese código.

Los siguientes valores son salidas guardadas de la celda 75, redondeadas a cuatro decimales; no se han reproducido con los datos originales en esta sesión. Son medias entre cuatro baterías, no métricas de conjuntos externos.

| Horizonte | MAE (puntos de SoH) | RMSE (puntos de SoH) | R² medio |
|---|---:|---:|---:|
| Actual | 2,7443 | 3,2317 | 0,8209 |
| +5 | 3,6517 | 4,1193 | 0,5276 |
| +10 | 3,5027 | 3,9448 | 0,3707 |
| +20 | 4,4150 | 4,7666 | −0,9939 |
| +30 | 4,0351 | 4,3565 | −1,9663 |

Los outputs originales se conservaron en `docs/original-notebook-metrics.json`. Esto actualiza la evidencia de revisiones anteriores, en las que el notebook no estaba disponible.

La auditoría local reproducible (`backend/scripts/audit_models.py`) encuentra 500 árboles por modelo. Los mayores umbrales de división de `cycle` son 71, 67, 62, 51 y 42. Esos umbrales **no** son los límites de cobertura del entrenamiento; explican por qué aumentar únicamente el ciclo más allá de todas las divisiones ya no diferencia esa entrada. No demuestran extrapolación de envejecimiento a 412 o 1000 ciclos.

El caso sintético deteriorado conserva SoH actual de 80,99 %. No tiene etiquetas medidas, por lo que ese caso revela una limitación de interpretación, sin permitir calcular un error real ni ajustar un objetivo arbitrario.

## Corrección implementada

La celda 29 calcula `charge_temp_delta_prev` como temperatura **final menos inicial**, mientras que la ayuda de la interfaz decía máxima menos inicial. Se corrigió la descripción del formulario. El backend mantiene los valores enviados y no cambió sus 29 características.

## Comparación preparada

`backend/scripts/compare_training.py` compara la configuración original y dos candidatos regularizados, uno con restricción decreciente sobre `cycle`. La selección usa validación interna por batería y la evaluación usa una batería externa a esa selección, mediante LeaveOneGroupOut anidado. Preserva las etiquetas por ciclo exacto, valida duplicados/referencias y no usa capacidad o SoH como entradas.

Ejemplo, cuando esté disponible el CSV exportado por el notebook:

```powershell
backend/.venv/Scripts/python.exe backend/scripts/compare_training.py RUTA/B0045_B0048_clean_SoH.csv --output docs/training-comparison.json
```

El script registra errores por batería/horizonte, medias macro, selección interna, configuración y hash del dataset. No exporta ni sustituye modelos: la comparación de errores y la decisión de entrenar los candidatos finales aún requieren los datos. Sus resultados evalúan salidas crudas; falta evaluar el ajuste isotónico y validación temporal con separación entre orígenes y objetivos antes de promover una versión.

Una restricción sobre ciclo no asegura el orden entre modelos independientes ni garantiza mejores errores. Cuatro baterías constituyen evidencia limitada: no valida paquetes de vehículos ni otras condiciones.

## Estado

No se cambiaron pesos ni archivos de producción. Falta el CSV procesado `B0045_B0048_clean_SoH.csv` o los cuatro `.mat` originales. Los ejemplos locales no sirven como datos etiquetados para mejorar precisión. No se declara una mejora de los cinco modelos sin ejecutar y revisar la comparación sobre los datos reales.
