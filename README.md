# Proyecto de Predicción de Baterías EV

Plataforma web para estimar el Estado de Salud (SoH) y la evolución futura de baterías a partir de datos de telemetría.

## Objetivo

Integrar un modelo predictivo XGBoost dentro de una aplicación web que permita procesar datos de telemetría de baterías y generar predicciones sobre su estado de salud.

## Arquitectura

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