"""Backend-local configuration, independent of the shell's working directory."""
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
LOCAL_ORIGIN_PATTERN = r"https?://(?:localhost|127\.0\.0\.1)(?::\d+)?"


@dataclass(frozen=True)
class Settings:
    cors_origins: tuple[str, ...]
    allow_local_origins: bool


def get_settings():
    load_dotenv(BACKEND_DIR / ".env", override=False)
    origins = tuple(origin.strip().rstrip("/") for origin in os.getenv(
        "BATTERY_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip())
    for origin in origins:
        parsed = urlsplit(origin)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise ValueError("BATTERY_CORS_ORIGINS debe contener orígenes HTTP/HTTPS separados por comas, sin rutas ni credenciales.")
        _ = parsed.port  # validate an explicitly configured port
    flag = os.getenv("BATTERY_ALLOW_LOCAL_ORIGINS", "true").strip().lower()
    if flag not in {"true", "false", "1", "0", "yes", "no"}:
        raise ValueError("BATTERY_ALLOW_LOCAL_ORIGINS debe ser true o false.")
    return Settings(origins, flag in {"true", "1", "yes"})
