# Importación adaptable, compatibilidad y familias de modelos

## Qué se implementó

- Entrada común para CSV/TSV/TXT/JSON, Excel XLSX/XLS, Parquet y MAT. Los formatos textuales siguen procesándose con Papa Parse; los binarios se envían a `/api/v1/telemetry/import` y vuelven como tabla de campos y filas.
- Selección explícita de hoja o tabla/batería cuando existe más de una. Después se reutilizan los controles de columnas, unidades, signo, origen temporal y ciclo/tramo existentes. No se mezclan baterías ni ciclos para inferir.
- Las fechas Excel reconocidas por el lector se entregan como ISO; las duraciones HH:MM:SS y los días/fracciones de día pueden convertirse a segundos. No se adivina que un número decimal sea una fecha: el usuario confirma la unidad.
- Los MAT NASA conservan ciclos de descarga y datos opcionales del EIS/carga anterior. El cambio térmico de carga es final menos inicial. Los voltajes de corte de B0045–B0048 proceden del README; para otras baterías se deben confirmar manualmente.
- Identificación compartida de celda/módulo/paquete y familia química. Se añade `analysis_mode`, `measurement_level` y `chemistry` sin cambiar las 29 características.
- Modo estricto por defecto en la interfaz. La API mantiene `exploratory` como valor predeterminado para clientes anteriores que no envíen el campo. El estricto devuelve 422 sin inferir cuando no hay compatibilidad; el exploratorio devuelve estimaciones con un informe visible y sin asignar usos de segunda vida si la compatibilidad no está confirmada.
- Perfil por familia con desviaciones respecto a mínimos/máximos observados, advertencias de datos y cobertura real de referencia. Estar dentro de cada intervalo individual **no** valida la distribución conjunta ni implica exactitud o seguridad.

## Formatos y límites

Los lectores reciben contenido, no rutas del servidor. Límite: 40 MB por archivo y 100 000 filas por tabla, 200 columnas. No se ejecutan macros, notebooks ni código proporcionado en archivos. No se evalúan fórmulas de Excel; si no tienen valor almacenado, el campo requiere corrección. Los encabezados vacíos o repetidos se rechazan, sin renombrado silencioso.

MAT admite ciclos NASA o vectores numéricos de igual longitud; no cualquier estructura arbitraria. MAT HDF5 no está soportado por este adaptador: requiere exportación a tabla. Otros formatos, archivos cifrados, señales ausentes y tablas anidadas generan mensajes de corrección, no mediciones sintéticas. XLS tiene lector instalado, pero no se dispuso de un archivo XLS real para verificar ese formato extremo a extremo.

Las dependencias `openpyxl`, `xlrd` y `pyarrow` quedaron instaladas en el entorno del proyecto y fijadas en `backend/requirements.txt`.

## Dos familias activas

1. `backend/model_artifacts`: NASA B0045–B0048, 277 descargas válidas, condiciones documentadas de 4 °C y 1 A. Los pesos existentes permanecen intactos.
2. `backend/model_families/nasa_room_2a_v1`: NASA B0005/B0006/B0007/B0018, 636 descargas válidas, temperatura ambiente y 2 A. Se preparó con `prepare_training_family.py`, conservando la definición de SoH y las 29 variables. Referencias aproximadamente entre 57,31 % y 101,15 %.

`backend/model_registry.json` registra la familia adicional. El enrutador compara las entradas medidas con los perfiles de cada familia mediante distancia normalizada a intervalos observados. Es una regla determinista basada en los datos disponibles, no un selector que reciba el SoH deseado. Si todas las familias están fuera de rango, la selección no oculta ese hecho: el informe lo indica y el modo estricto se abstiene. El enrutador no tiene validación externa conjunta.

## Evaluación de la nueva familia

Se ejecutó comparación LeaveOneGroupOut anidada: la batería externa no participa en la selección interna de parámetros. Para decidir si registrar la familia, se comparó el procedimiento seleccionado con el modelo anterior aplicado a esas baterías, que no estaban en su entrenamiento. Las tablas siguientes corresponden a salidas con reconciliación isotónica, medias macro por batería, en puntos de SoH.

| Horizonte | MAE modelo anterior fuera de dominio | MAE nueva familia | RMSE anterior | RMSE nueva familia |
|---|---:|---:|---:|---:|
| Actual | 6,0117 | 2,9517 | 6,9580 | 3,5191 |
| +5 | 6,8525 | 3,0692 | 8,3344 | 3,7230 |
| +10 | 7,0330 | 3,1367 | 8,5498 | 3,7383 |
| +20 | 6,9704 | 3,9947 | 8,5137 | 4,6096 |
| +30 | 6,9715 | 4,2655 | 8,5637 | 4,9807 |

Se exigió mejorar MAE y RMSE en los cinco horizontes para registrar la familia. La aceptación usa estas mismas comparaciones, por lo que es evidencia piloto y no un test externo independiente adicional. La selección final vuelve a usar validación por batería en todos los datos de esa familia y después ajusta los cinco modelos finales. +20/+30 conservan etiqueta experimental.

Los errores y recuentos por intervalo de SoH, batería y horizonte están en `docs/new-family-evaluation.json`; las predicciones excluyendo cada batería están en `docs/new-family-predictions.csv`. Los rangos sin datos se indican con n=0 y MAE=null. No se interpretan como error cero. La comparación cruda y las selecciones internas están en `docs/room-2a-training-comparison.json`.

## Lo que no se puede afirmar

No se ha validado un predictor universal de 0–100 % para cualquier química o paquete. Los seis ZIP inspeccionados incluyen referencias bajas con anomalías reconocidas o sin cobertura suficiente por rango; no se usaron para forzar etiquetas de salud. La detección de datos fuera de mínimos/máximos es una comprobación básica, no un detector perfecto de novedades. No se generan intervalos de confianza ni RUL.

Para extender por debajo de los rangos disponibles o a nuevas baterías, faltan ensayos completos y etiquetados comparables, evaluación por rango y batería y validación externa/temporal. La arquitectura ya permite registrar otras familias después de esas verificaciones.

## Pruebas y ejemplo

- Build TypeScript/Vite correcto; 37 pruebas frontend y 38 backend aprobadas.
- Pruebas de equivalencia manual/CSV y Excel/Parquet/CSV: mismas muestras, mismas 29 características y mismas cinco predicciones.
- Pruebas de Excel con varias hojas, encabezados repetidos, MAT de vectores y ciclos NASA con historial, Parquet, archivos inválidos, modo estricto/exploratorio, entradas fuera de rango, voltaje no positivo, un único instante y selección por familia.
- Pruebas de duraciones HH:MM:SS y fracciones de día, además de las existentes de importación y segunda vida.
- Solicitud real con B0006, ciclo 168: modo estricto aceptado, familia `nasa_room_2a`, SoH aproximadamente 58,80 %. CSV exportado en `data/samples/telemetria_real_B0006_ciclo_168.csv`. Es un registro presente en el entrenamiento final, útil para comprobar el flujo, no un test independiente de precisión. Su capacidad de referencia ronda el 57,31 % relativo.
- Sin navegador automatizable: quedan pendientes interacción visual, hojas/ciclos/unidades, mensajes de abstención, móvil y accesibilidad con lector de pantalla. No se declara auditoría WCAG completa.

Reinicia el backend para cargar las rutas nuevas y utiliza el entorno con las dependencias actualizadas. La familia inicial y el contrato de campos anteriores se conservan; las respuestas incorporan `compatibility`.
