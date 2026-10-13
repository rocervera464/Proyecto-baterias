from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.prediction import (
    router as prediction_router,
)

from app.api.routes.telemetry import (
    legacy_router as legacy_telemetry_router,
    router as telemetry_router,
)


app = FastAPI(
    title="Battery Prediction API",

    description=(
        "API para estimar el Estado de Salud "
        "(SoH) y la evolución futura "
        "de baterías EV."
    ),

    version="0.1.0",
)


# ============================================================
# ROUTERS
# ============================================================

app.include_router(
    telemetry_router
)
app.include_router(legacy_telemetry_router)

app.include_router(
    prediction_router
)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {
        "message": "Battery Prediction API",
        "status": "running",
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "battery-prediction-api",
        "version": "0.1.0",
    }

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
