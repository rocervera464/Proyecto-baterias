# Proyecto de Predicción de Baterías EV

Plataforma web para estimar el Estado de Salud (SoH) y la evolución futura de baterías a partir de datos de telemetría.

## Objetivo

Integrar un modelo predictivo XGBoost dentro de una aplicación web que permita procesar datos de telemetría de baterías y generar predicciones sobre su estado de salud.

## Ejecutar en Windows

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
