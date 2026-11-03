"""Preserved historical API, mounted under /legacy by the production app."""
from fastapi import FastAPI
import logging
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from app.api.routes.prediction import router as prediction_router
from app.api.routes.telemetry import router as telemetry_router, legacy_router
from app.api.routes.file_import import router as file_router

legacy_app = FastAPI(title="Historical context-dependent API", version="2.0")
for router in (prediction_router, telemetry_router, legacy_router, file_router):
    legacy_app.include_router(router)


@legacy_app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    fields = "; ".join(f"{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in error.errors())
    logging.getLogger("app.prediction").warning("prediction_rejected code=invalid_request fields=%s", fields)
    return await request_validation_exception_handler(request, error)
