from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
import logging
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from app.core.settings import get_settings, LOCAL_ORIGIN_PATTERN
from app.services.runtime_status import check_runtime
from app.api.routes.telemetry_v4 import router as telemetry_v4_router
from app.legacy import legacy_app

from fastapi.middleware.cors import CORSMiddleware



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
    # Do not echo raw telemetry or non-finite input values in JSON error bodies.
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]}
        for item in error.errors()
    ]})


# ============================================================
# ROUTERS
# ============================================================

app.include_router(telemetry_v4_router)
app.mount("/legacy", legacy_app)


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
