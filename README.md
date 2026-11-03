# Batería: XGBoost de telemetría v4

La aplicación estima la capacidad relativa (SoH) usando exclusivamente tiempo, voltaje, corriente y temperatura de los primeros 300 segundos de descarga. No exige ciclo, temperatura ambiente, voltaje de corte, EIS, carga anterior ni capacidad real.

## Ejecutar en Windows

Entorno verificado: Python 3.12 y Node.js 24. Desde la raíz:

```powershell
.\backend\setup.ps1
.\backend\start.ps1 -Check
.\backend\start.ps1
```

En otra terminal:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
```

Abre la URL que imprima Vite. El backend escucha en http://127.0.0.1:8000 y su documentación en http://127.0.0.1:8000/docs. No es necesario activar el entorno virtual. `-NoReload` desactiva la recarga; `-Port 8001` cambia el puerto. Si lo cambias, establece `VITE_API_URL=http://127.0.0.1:8001` en `frontend/.env` y reinicia Vite.

`/health` indica disponibilidad HTTP; `/health/ready` verifica la carga de los dos conjuntos de artefactos v4. El arranque valida integridad, nombres/orden de features y contratos. `backend/.env.example` documenta CORS; los puertos locales de Vite se aceptan en desarrollo.

## Uso

1. Carga CSV, TSV, TXT, JSON, XLSX, XLS, Parquet o MAT, o pega las cuatro columnas en el ingreso manual.
2. Revisa formato, muestras, variables y ventana disponible. El lector selecciona automáticamente la hoja compatible; puedes cambiar hoja o descarga si existen varias.
3. Pulsa **Analizar y predecir**. Se comprueban calidad, cobertura y familia compatible; se muestran el SoH y las proyecciones de +5, +10, +20 y +30 ciclos, con una nota breve sobre su precisión limitada.

Las unidades canónicas son s, V, A y grados Celsius. Se reconocen unidades explícitas en columnas (ms, mV, mA, Fahrenheit, kelvin), nombres comunes en inglés/español y fechas ISO. Los datasets NASA usan descarga negativa. No se cambia el signo ni se adivinan unidades por magnitud de voltaje/corriente. El lector normaliza automáticamente las unidades declaradas. Las corrientes conservan el signo: no se infiere la convención de un equipo desconocido.

Se analiza una sola descarga. Filas invalidas aisladas solo se eliminan con una proporción <=5%; los bloques corruptos se rechazan. Duplicados idénticos se eliminan y tiempos con mediciones contradictorias se rechazan. No se interpolan huecos ni se inventan variables. El muestreo productivo debe respetar cantidades, cobertura y huecos observados: 21 muestras para la familia de 1 A o 17 para la de 2 A, con aproximadamente 286-300 segundos disponibles. Un CSV con tres filas no permite predecir.

## API

`POST /api/v1/predict` recibe como entrada mínima:

```json
{"discharge_samples":[{"time_s":0,"voltage_v":4.1,"current_a":-1,"temperature_c":5}]}
```

El objeto ilustra el esquema; una sola fila no alcanza el muestreo requerido. `cycle` puede declararse como etiqueta opcional; no entra al modelo. Nivel de medición y química declarados restringen el dominio, sin ser features. No se atribuye un ciclo absoluto a registros que no lo declaran.

`POST /api/v1/predict-file?filename=datos.csv` acepta el contenido binario del archivo en el cuerpo (Content-Type `application/octet-stream`). Parámetros opcionales: `sheet` y `segment`. No requiere multipart. Ejemplo:

```powershell
curl.exe --data-binary "@data/samples/pruebas_telemetria/B0045_ciclo_030_solo_senales.csv" -H "Content-Type: application/octet-stream" "http://127.0.0.1:8000/api/v1/predict-file?filename=datos.csv"
```

`POST /api/v1/telemetry/import` prepara una vista previa canonica para todos los formatos. `/api/v1/telemetry/compatibility` aplica el mismo modelo y validación que la predicción. `/api/v1/telemetry/validate` expone las features de señales calculadas por la implementacion compartida.

La respuesta incluye `current_soh_percent`, `telemetry`, `production_horizons` y `future_predictions`. Sin ciclo declarado, `current_cycle` y `target_cycle` son null; los horizontes se representan relativos al presente. Los porcentajes no se recalculan ni ajustan en React.

## Entrenamiento y evaluación reproducibles

Se necesitan los MAT originales locales, excluidos de Git:

- `data/raw/nasa_45_48/B0045.mat` a `B0048.mat`: 1 A, 4 grados Celsius, 277 descargas con capacidad positiva.
- `data/raw/nasa_room_2a/B0005.mat`, `B0006.mat`, `B0007.mat`, `B0018.mat`: 2 A, 24 grados Celsius, 636 descargas validas.

Se entrenan como familias separadas por protocolo. La capacidad solo crea targets: SoH = capacidad / mediana de las primeras cinco capacidades positivas y finitas de cada celda * 100.

```powershell
.\backend\.venv\Scripts\python.exe scripts/evaluate_models.py --retrain
```

Ese comando repite preparación, selección anidada, entrenamiento y exportacion. Para regenerar informes desde las predicciones fuera de muestra guardadas, sin reevaluar los modelos sobre sus propias filas de entrenamiento:

```powershell
.\backend\.venv\Scripts\python.exe scripts/evaluate_models.py
```

`--refresh-legacy` recalcula la comparación histórica mediante refits por batería. La generacion directa de candidatos esta en `backend/scripts/train_telemetry_v4.py`; `evaluate_models.py` finaliza los informes y controles de publicacion.

La validación es Leave-One-Battery-Out anidada. Features, hiperparametros y early stopping se seleccionan dentro del train de cada fold. No hay particiones aleatorias por filas. Se comparan conjuntos A/B/C/D y ventanas 60/120/180/300/600 s; producción conserva 300 s. Hay un XGBoost actual y un unico XGBoost de degradacion acumulada por familia, con variantes libres/monotonicas evaluadas.

## Evidencia y límites

| Familia | Features seleccionadas | MAE actual LOBO (pp) | RMSE actual LOBO (pp) | MAE baseline media |
|---|---:|---:|---:|---:|
| 1 A / 4 grados Celsius | 21, conjunto A | 4.3612 | 5.3892 | 6.9422 |
| 2 A / 24 grados Celsius | 30, conjunto D | 4.1898 | 5.0178 | 9.6129 |

Son promedios por batería, de la evaluación anidada del procedimiento; no una prueba externa independiente de los artefactos finales. La versión anterior con contexto obtiene menor MAE actual (2.9708 y 2.8468 pp). V4 reduce la información requerida; no se presenta como una mejora de precisión respecto del modelo con contexto.

**Las cuatro proyecciones están habilitadas por petición del usuario.** Se calculan con los modelos futuros entrenados y se identifican como estimaciones de precisión limitada. La evaluación sigue registrando `production_horizons=[]` y `research_horizons=[5,10,20,30]`: habilitarlas en la aplicación no las convierte en horizontes aprobados. `forecast_horizons` indica los que devuelve la API y cada salida incluye `validation_status`. Con `include_research_forecasts=false` se solicitan únicamente horizontes aprobados, sin cambiar el SoH actual (campo del JSON o query de `/predict-file`). Las métricas y los umbrales de validación se conservan.

Los modelos se evaluaron con celdas NASA, no con cualquier paquete EV. Estar dentro de rangos individuales no prueba equivalencia de química/protocolo. No se fuerzan valores fuera de dominio para obtener una salida. La referencia inicial permite SoH relativo por encima de 100%; la API limita las salidas al intervalo 0-120%. SoH no certifica seguridad ni calcula vida util restante; la segunda vida sigue siendo orientativa.

Informes completos, hiperparametros, sesgos, R2, ventanas, baselines e importancia de features: [comparación v4](docs/telemetry-v4/comparison.md), [método y límites](docs/telemetry-v4/README.md). Artefactos por familia: `backend/model_artifacts_v4/`.

## Compatibilidad histórica y pruebas

Los modelos/notebook anteriores permanecen intactos. La API contextual anterior se conserva bajo `/legacy` (por ejemplo `/legacy/api/v1/predict`). Sus pruebas siguen ejercitando ese contrato; las pruebas v4 verifican la ruta principal sin parámetros obligatorios.

```powershell
.\backend\.venv\Scripts\python.exe -m pytest -v
npm --prefix frontend test
npm --prefix frontend run build
```

Las pruebas incluyen todos los formatos, XLS BIFF8 real, aliases, fechas/unidades, filas corruptas, ausencia de variables, muestreo insuficiente, separacion de descargas, integridad de artefactos y ausencia de contexto en los inputs. No se ejecuta entrenamiento completo dentro de pytest.
