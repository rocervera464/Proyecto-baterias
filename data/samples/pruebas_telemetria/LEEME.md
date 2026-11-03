# Telemetría real para pruebas

Carga cualquiera de los siete CSV en el analizador. V4 necesita únicamente tiempo, voltaje, corriente y temperatura; no exige completar un formulario de contexto. Los metadatos adicionales de seis archivos se conservan como etiquetas de procedencia, sin entrar al modelo.

`B0045_ciclo_030_solo_senales.csv` contiene únicamente las cuatro señales y permite comprobar que la predicción funciona sin ciclo, ambiente ni voltaje de corte.

| Archivo | Ciclo | Ambiente | Corte | Muestras |
|---|---:|---:|---:|---:|
| B0045_ciclo_030.csv | 30 | 4 °C | 2 V | 22 |
| B0046_ciclo_025.csv | 25 | 4 °C | 2.2 V | 22 |
| B0047_ciclo_040.csv | 40 | 4 °C | 2.5 V | 22 |
| B0048_ciclo_050.csv | 50 | 4 °C | 2.7 V | 21 |
| B0005_ciclo_030.csv | 30 | 24 °C | 2.7 V | 17 |
| B0006_ciclo_168.csv | 168 | 24 °C | 2.5 V | 32 |

Las mediciones proceden de los MAT NASA locales del proyecto, sin generar señales ni modificar valores para encajar en un rango. Se exporta la ventana disponible entre 0 y 300 segundos con precisión numérica conservada. Unidades: segundos, V, A y °C. La corriente negativa corresponde a descarga. Son mediciones de celdas.

Cada archivo se comprobó contra `/api/v1/predict-file` v4 con resultado HTTP 200. Estas pruebas verifican importación y funcionamiento sobre datos relacionados con el entrenamiento; no constituyen una evaluación independiente de precisión. Se muestran las cuatro proyecciones con una nota de precisión limitada. Sus métricas y estado de investigación no se modifican por habilitarlas en la interfaz.

`procedencia.json` registra las fuentes y sus huellas SHA-256. No se incluyen capacidad, etiquetas de SoH ni objetivos futuros en los CSV.
