"""Warm shared assets and expose actionable readiness without running training."""
from app.services.model_registry import get_registered_services
from app.services.telemetry_identity import CATALOG, load_catalog


def check_runtime():
    errors, warnings, models = [], [], []
    try:
        for service in get_registered_services():
            models.append({"id": service.metadata.get("model_id", service.model_dir.name),
                           "version": service.metadata.get("model_version", "legacy"),
                           "current_features": len(service.features),
                           "production_horizons": service.production_horizons})
    except (OSError, RuntimeError, ValueError, KeyError, TypeError) as error:
        errors.append(f"No se pudieron cargar los modelos: {error}")
    catalog = {"available": False, "references": 0}
    try:
        references = load_catalog()
        catalog = {"available": CATALOG.is_file(), "references": sum(len(records) for records in references.values())}
        if not catalog["available"]:
            warnings.append("Falta el catálogo de identificación automática; se requieren los datos declarados del ensayo.")
    except (OSError, RuntimeError, ValueError, KeyError, TypeError) as error:
        errors.append(f"No se pudo cargar el catálogo de telemetría: {error}")
    return {"status": "ready" if not errors else "unavailable", "models": models,
            "telemetry_catalog": catalog, "warnings": warnings, "errors": errors}
