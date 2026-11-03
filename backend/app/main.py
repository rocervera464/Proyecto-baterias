from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
import logging
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from app.core.settings import get_settings, LOCAL_ORIGIN_PATTERN
from app.services.runtime_status import check_runtime
from app.api.routes.file_import import router as import_router

from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.prediction import (
    router as prediction_router,
)

from app.api.routes.telemetry import (
    legacy_router as legacy_telemetry_router,
    router as telemetry_router,
)


@asynccontextmanager
async def lifespan(application: FastAPI):
    runtime = await run_in_threadpool(check_runtime)
    if runtime["errors"]:
        raise RuntimeError("No se pudo iniciar el backend. " + " ".join(runtime["errors"]) + " Ejecuta backend/start.ps1 -Check para diagnosticar.")
    for warning in runtime["warnings"]:
        logging.getLogger("app.runtime").warning(warning)
    yield


settings = get_settings()
app = FastAPI(
    lifespan=lifespan,
    title="Battery Prediction API",

    description=(
        "API para estimar el Estado de Salud "
        "(SoH) y la evolución futura "
        "de baterías EV."
    ),

    version="0.1.0",
)


@app.exception_handler(RequestValidationError)
async def log_prediction_validation_failure(request: Request, error: RequestValidationError):
    if request.url.path == "/api/v1/predict":
        fields = "; ".join(f"{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in error.errors())
        logging.getLogger("app.prediction").warning("prediction_rejected code=invalid_request fields=%s", fields)
    return await request_validation_exception_handler(request, error)


# ============================================================
# ROUTERS
# ============================================================

app.include_router(
    telemetry_router
)
app.include_router(legacy_telemetry_router)
app.include_router(import_router)

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


@app.get("/health/ready")
def readiness_check():
    runtime = check_runtime()
    return JSONResponse(runtime, status_code=200 if runtime["status"] == "ready" else 503)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_origin_regex=LOCAL_ORIGIN_PATTERN if settings.allow_local_origins else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
