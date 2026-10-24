from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.services.file_import import MAX_BYTES, import_file

router = APIRouter(prefix="/api/v1/telemetry", tags=["telemetry"])


@router.post("/import")
async def import_telemetry_file(request: Request, filename: str, sheet: str | None = None):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "El archivo supera 40 MB. Selecciona un tramo menor.")
    try:
        return await run_in_threadpool(import_file, bytes(data), filename, sheet)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except ImportError as error:
        raise HTTPException(503, "Falta un lector de archivos. Instala las dependencias de backend/requirements.txt.") from error
    except Exception as error:
        raise HTTPException(422, "No se pudo leer el archivo. Comprueba su formato real, las cabeceras y si está cifrado o dañado.") from error
