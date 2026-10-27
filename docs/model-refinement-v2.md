# Refinamiento de modelos — 26 de octubre de 2026

Se revisaron las dos familias activas y las 913 descargas etiquetadas disponibles de ocho baterías. Se instalaron únicamente nuevos modelos de +5 y +10 ciclos para la familia a temperatura ambiente. El estimador de salud actual, los pesos de +20/+30 y la familia a 4 °C se conservan.

## Cambio instalado

La versión `room_short_delta_v2` aprende el cambio de SoH entre el ciclo actual y el futuro para +5/+10. En inferencia se suma ese cambio a la estimación actual, antes del ajuste isotónico existente. No se resta un porcentaje fijo ni se impone una caída artificial. Las 29 entradas y el contrato de la API se mantienen.

`forecast_target_modes` identifica expresamente qué archivos predicen cambios y cuáles predicen SoH absoluto. Los modelos antiguos, sin esa propiedad, siguen funcionando como antes. Las salidas originales de la API continúan representando SoH, después de sumar el cambio y antes de reconciliar.

## Evidencia piloto de la versión instalada

Errores en puntos porcentuales de SoH; medias por batería después de reconciliar. Cada comparación usa la misma partición y el mismo posprocesamiento para base y candidato.

| Evaluación | Horizonte | MAE anterior | MAE nuevo | RMSE anterior | RMSE nuevo |
|---|---:|---:|---:|---:|---:|
| Batería excluida del entrenamiento | +5 | 2,9521 | 2,9096 | 3,6586 | 3,6269 |
| Batería excluida del entrenamiento | +10 | 3,1050 | 3,0468 | 3,8023 | 3,7136 |
| Mitad final de los ciclos | +5 | 3,5513 | 3,4233 | 4,0249 | 3,9322 |
| Mitad final de los ciclos | +10 | 3,8984 | 3,7103 | 4,3831 | 4,2084 |

La estimación actual no cambia. +20/+30 pueden cambiar ligeramente por el ajuste conjunto, aunque sus pesos sean idénticos. No se afirma que cada medición individual mejore.

La selección inicial comparó cinco paquetes mediante validación anidada por batería. También se reservó la mitad final de los ciclos; los objetivos t+h de entrenamiento se construyeron exclusivamente en la mitad inicial, sin cruzar el corte temporal. Los ejemplos sintéticos de la interfaz no se usaron para entrenar ni evaluar precisión.

La primera comparación motivó una segunda variante fija que cambia solo horizontes cortos. Esa variante reutiliza los mismos conjuntos de evaluación: los resultados son evidencia exploratoria de desarrollo, **no una validación externa independiente ni un test intacto después de seleccionar el diseño**.

## Criterios y candidatos descartados

Para aceptar un paquete se exige mejorar MAE y RMSE medios al menos 0,01 puntos en ambas evaluaciones; ningún horizonte puede empeorar más de 0,1 puntos y ninguna combinación batería/horizonte puede aumentar su MAE más de 0,5 puntos.

- La búsqueda anidada completa a 4 °C se descartó por regresiones temporales en +20/+30.
- La búsqueda completa a temperatura ambiente se descartó por regresiones entre baterías y en la estimación actual temporal.
- La variante corta a 4 °C se descartó por regresiones de más de 0,5 puntos en B0045.
- La variante corta a temperatura ambiente superó los criterios y es la única instalada.

Informes completos, con hashes de datos/pesos, errores por batería, particiones y predicciones de evaluación:

- `model-refinement-cold-v2.json` y `.csv`.
- `model-refinement-room-v2.json` y `.csv`.
- `model-refinement-cold-short-v2.json` y `.csv`.
- `model-refinement-room-short-v2.json` y `.csv` — versión aceptada.

## Alcance

Los datos observados llegan hasta los ciclos 72 y 168 según la familia. Esta mejora no valida el ciclo 800, otras químicas, paquetes ni señales simuladas. Tampoco convierte una proyección plana en evidencia de ausencia de degradación. Los horizontes +20/+30 siguen siendo experimentales.

## Reproducción y reversión

Desde la raíz, con las tablas reales locales en `data/processed/`:

```powershell
.\backend\.venv\Scripts\python.exe backend/scripts/improve_models.py data/processed/nasa_room_2a.csv backend/model_families/nasa_room_2a_v1 --output docs/otra-comparacion.json
.\backend\.venv\Scripts\python.exe backend/scripts/improve_models.py data/processed/nasa_room_2a.csv backend/model_families/nasa_room_2a_v1 --fixed-package delta_short --output docs/otra-comparacion-corta.json
.\backend\.venv\Scripts\python.exe backend/scripts/export_model_refinement.py data/processed/nasa_room_2a.csv backend/model_families/nasa_room_2a_v1 docs/otra-comparacion-corta.json backend/model_candidates/otra-version
```

El exportador rechaza informes no aprobados, hashes distintos o directorios de salida existentes. Verifica la carga y predicciones finitas antes de devolver el candidato.

La familia previa permanece intacta en `backend/model_families/nasa_room_2a_v1`. La nueva está en `backend/model_families/nasa_room_2a_short_v2`; el registro activa una sola. Para revertir, cambia su directorio en `backend/model_registry.json` al anterior. También se guardó una copia del registro en `backend/model_backups/before_room_short_delta_v2/`. Reinicia el backend después de actualizar código/modelos para asegurar que no se conserve una instancia anterior en memoria.
