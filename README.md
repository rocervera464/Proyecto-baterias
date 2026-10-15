# Proyecto de Predicción de Baterías EV

Plataforma web para estimar el Estado de Salud (SoH) y la evolución futura de baterías a partir de datos de telemetría.

## Objetivo

Integrar un modelo predictivo XGBoost dentro de una aplicación web que permita procesar datos de telemetría de baterías y generar predicciones sobre su estado de salud.

## Ejecutar en Windows

Desde la carpeta `backend`, usa el iniciador del proyecto:

```powershell
.\start.ps1
```

También funciona desde la raíz con `.\backend\start.ps1`. Selecciona automáticamente el Python del entorno virtual y el módulo ASGI correcto, y activa la recarga de los archivos de `backend/app`.

Si prefieres ejecutar Uvicorn directamente desde `backend`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

El módulo es `app.main` y la instancia se llama `app`: se separan con **un solo** `:`. La opción `--reload` utiliza **dos guiones**. `app:main:app`, `app:main` y `-reload` no son los comandos correctos. Antes de iniciar, detén con Ctrl+C cualquier instancia anterior que use el puerto 8000.

Desde la raíz `Proyecto-baterias`, ejecuta sin activar el entorno virtual:

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
```

Abre http://127.0.0.1:8000/docs para probar la API y
`POST /telemetry/features`. El estado del servicio está en `/health`.

Si deseas activar el entorno desde la raíz:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\backend\.venv\Scripts\Activate.ps1
```

Para ejecutar las pruebas desde la raíz:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest -q
```

## Estructura

El proyecto está dividido en:

- `frontend/`: interfaz web.
- `backend/`: API y lógica de negocio.
- `backend/model_artifacts/`: modelos predictivos y metadatos.
- `data/`: archivos pequeños de ejemplo.
- `docs/`: documentación técnica.

## Modelo predictivo

Durante la fase experimental se compararon:

- XGBoost
- GRU
- Gaussian Process Regression

XGBoost presentó el mejor rendimiento global en la cohorte piloto y será utilizado inicialmente como modelo principal del sistema.

## Importaci?n de telemetr?a CSV

El frontend admite archivos con encabezados, separados por coma, punto y coma o tabulaci?n. Reconoce nombres comunes en espa?ol e ingl?s (por ejemplo, `tiempo`, `voltaje`, `corriente`, `temperatura`, o los nombres originales `time_s`, `voltage_v`, `current_a`, `temperature_c`). Si los encabezados son diferentes o ambiguos, se pueden asignar manualmente en el formulario. Las columnas adicionales se ignoran.

Selecciona las unidades del archivo: segundos, milisegundos, minutos, horas o fecha y hora ISO; V/mV; A/mA; y ?C/?F/K. Se admiten decimales con coma cuando el separador permite distinguirlos. Las fechas se convierten en segundos desde la primera medici?n. Para tiempos num?ricos, desmarca la opci?n de contar desde la primera muestra si el archivo ya contiene el tiempo transcurrido desde el inicio de la descarga.

Cada archivo debe corresponder a una bater?a y un ciclo de descarga. Completa el ciclo, temperatura ambiente y voltaje de corte en el formulario. Se requieren tiempo, voltaje, corriente y temperatura, con al menos dos instantes distintos dentro de los primeros 300 segundos. Los valores faltantes o inv?lidos se se?alan; no se reemplazan por cero.

Aceptar distintos formatos no ampl?a el alcance del modelo: los modelos actuales se entrenaron con las bater?as NASA B0045?B0048 y una ventana de descarga de 300 segundos. Los archivos que solo contienen SoC, capacidad o SoH no proporcionan las se?ales necesarias para estos modelos.

Pruebas del importador (Node.js 24):

```powershell
npm --prefix frontend test
```
