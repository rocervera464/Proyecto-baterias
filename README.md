# Proyecto de Predicción de Baterías EV

Plataforma web para estimar el Estado de Salud (SoH) y la evolución futura de baterías a partir de datos de telemetría.

## Objetivo

Integrar un modelo predictivo XGBoost dentro de una aplicación web que permita procesar datos de telemetría de baterías y generar predicciones sobre su estado de salud.

## Ejecutar en Windows

La instalación reproducible utiliza **Python 3.12**. Para preparar el entorno por primera vez, desde la raíz del proyecto:

```powershell
.\backend\setup.ps1
```

El script crea `backend/.venv` si falta, instala las versiones de `requirements.txt` y comprueba dependencias y modelos. Puedes indicar el ejecutable con `-Python 'C:\ruta\python.exe'`.

Desde la carpeta `backend`, usa el iniciador del proyecto:

```powershell
.\start.ps1
```

También funciona desde la raíz con `.\backend\start.ps1`, sin activar el entorno virtual. Usa rutas absolutas, verifica los modelos y el catálogo de telemetría antes del arranque y activa la recarga del código y los artefactos. Para ejecutar sin recarga, añade `-NoReload`.

Para diagnosticar la instalación sin abrir un servidor:

```powershell
.\backend\start.ps1 -Check
```

Si el puerto 8000 está ocupado, el iniciador lo indica sin detener otros procesos. Puedes usar `-Port 8001`; en ese caso configura `VITE_API_URL=http://127.0.0.1:8001` en `frontend/.env` y reinicia Vite.

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
`POST /api/v1/predict`. `/health` indica que el servidor responde y `/health/ready` comprueba que los modelos y referencias están disponibles. El arranque se detiene con un mensaje de diagnóstico si faltan modelos obligatorios.

En desarrollo se aceptan los orígenes `localhost` y `127.0.0.1`, incluido el puerto alternativo que seleccione Vite. Para otros orígenes, copia `backend/.env.example` a `backend/.env` y configura `BATTERY_CORS_ORIGINS`. `BATTERY_ALLOW_LOCAL_ORIGINS=false` restringe CORS a la lista explícita. Reinicia el backend después de cambiar la configuración.

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

La arquitectura y validación actuales se documentan en
[SoH v2](docs/precision-soh-v2.md). La API ejecuta únicamente los horizontes
habilitados en el manifiesto, que pueden ser ninguno. El ciclo se recupera de los datos declarados o de una referencia verificada; si no se identifica, se debe declarar;
no se supone ciclo 1 y no se entregan predicciones fuera del dominio compatible.
Los informes anteriores se conservan como evidencia histórica, no como métricas
de la arquitectura v2.

Durante la fase experimental se compararon:

- XGBoost
- GRU
- Gaussian Process Regression

XGBoost presentó el mejor rendimiento global en la cohorte piloto y será utilizado inicialmente como modelo principal del sistema.

## Importación de telemetría CSV

El frontend admite archivos con encabezados, separados por coma, punto y coma o tabulación. Reconoce nombres comunes en español e inglés (por ejemplo, `tiempo`, `voltaje`, `corriente`, `temperatura`, o los nombres originales `time_s`, `voltage_v`, `current_a`, `temperature_c`). Si los encabezados son diferentes o ambiguos, se pueden asignar manualmente en el formulario. Las columnas adicionales se ignoran.

Selecciona las unidades del archivo: segundos, milisegundos, minutos, horas o fecha y hora ISO; V/mV; A/mA; y °C/°F/K. Se admiten decimales con coma cuando el separador permite distinguirlos. Las fechas se convierten en segundos desde la primera medición. Para tiempos numéricos, desmarca la opción de contar desde la primera muestra si el archivo ya contiene el tiempo transcurrido desde el inicio de la descarga.

Selecciona la descarga si el archivo contiene varias y pulsa **Analizar batería**. En ese momento aparece «Datos de la batería» y se identifican ciclo, temperatura ambiente, voltaje de corte, nivel y química a partir de los metadatos declarados o de una coincidencia verificada con el catálogo NASA. Si se identifican todos, la predicción continúa en ese mismo intento. Si faltan datos, completa los campos indicados y vuelve a analizar. La identificación también se inicia con el botón final del ingreso manual, incluidas las tablas pegadas. Se requieren tiempo, voltaje, corriente y temperatura, con al menos dos instantes distintos dentro de los primeros 300 segundos. Los valores faltantes o inválidos se señalan; no se reemplazan por cero. El voltaje de corte no se obtiene del último voltaje medido ni del rango del modelo.

Aceptar distintos formatos no amplía el alcance del modelo: los modelos actuales se entrenaron con las baterías NASA B0045–B0048 y una ventana de descarga de 300 segundos. Los archivos que solo contienen SoC, capacidad o SoH no proporcionan las señales necesarias para estos modelos.

Pruebas del importador (Node.js 24):

```powershell
npm --prefix frontend test
```
