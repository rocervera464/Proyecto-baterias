"""Diagnose the installed backend without starting a server or changing files."""
import argparse
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def diagnose():
    report = {"status": "ready", "python": sys.version.split()[0], "executable": sys.executable,
              "dependencies": {}, "runtime": None, "errors": []}
    if sys.version_info < (3, 12):
        report["errors"].append("Las dependencias fijadas requieren Python 3.12 o superior; usa Python 3.12 para reproducir el entorno verificado.")
    for name in ["fastapi", "uvicorn", "pydantic", "numpy", "pandas", "scipy", "xgboost", "sklearn",
                 "openpyxl", "xlrd", "pyarrow", "watchfiles", "dotenv"]:
        try:
            module = importlib.import_module(name)
            report["dependencies"][name] = getattr(module, "__version__", "installed")
        except Exception as error:
            report["errors"].append(f"No se pudo importar {name}: {error}. Ejecuta backend/setup.ps1.")
    if not report["errors"]:
        try:
            from app.core.settings import get_settings
            from app.services.runtime_status import check_runtime
            get_settings()
            report["runtime"] = check_runtime()
            report["errors"].extend(report["runtime"]["errors"])
        except Exception as error:
            report["errors"].append(f"No se pudo verificar la configuración o los artefactos: {error}")
    if report["errors"]:
        report["status"] = "unavailable"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    report = diagnose()
    if args.json:
        print(json.dumps(report, indent=2))
    elif report["errors"]:
        for error in report["errors"]:
            print(f"ERROR: {error}", file=sys.stderr)
    elif not args.quiet:
        print(f"Python {report['python']}: {report['executable']}")
        print(f"Dependencias: {len(report['dependencies'])} verificadas.")
        runtime = report["runtime"]
        print(f"Modelos: {len(runtime['models'])} familias cargadas.")
        print(f"Telemetria: {runtime['telemetry_catalog']['references']} referencias.")
        for warning in runtime["warnings"]:
            print(f"AVISO: {warning}")
        print("Backend listo para iniciar.")
    return 0 if report["status"] == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
