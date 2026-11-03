"""Route measured inputs to registered, evaluated families, never by desired SoH."""
import json
from functools import lru_cache
from pathlib import Path

from app.services.model_service import BACKEND_DIR, ModelService, get_model_service
from app.services.compatibility import assess_compatibility

REGISTRY = BACKEND_DIR / "model_registry.json"


@lru_cache
def load_family(directory: str):
    path = (BACKEND_DIR / directory).resolve()
    if BACKEND_DIR.resolve() not in path.parents:
        raise RuntimeError("Ruta de modelos fuera del backend.")
    return ModelService(path)


def domain_distance(service, features):
    path = service.model_dir / "domain_profile.json"
    if not path.exists():
        return float("inf")
    ranges = json.loads(path.read_text(encoding="utf-8"))["ranges"]
    distance = 0.0
    for name, limits in ranges.items():
        value = features.get(name)
        low, high = limits.get("min"), limits.get("max")
        if value is None or low is None or high is None:
            continue
        span = max(abs(high - low), abs(low) * .01, .01)
        distance += max(low - value, value - high, 0) / span
    return distance


def get_registered_services():
    services = [get_model_service()]
    if REGISTRY.exists():
        for entry in json.loads(REGISTRY.read_text(encoding="utf-8")).get("families", []):
            if entry.get("enabled"):
                services.append(load_family(entry["directory"]))
    return services


def select_model_service(features, request=None):
    services = get_registered_services()
    if request is not None:
        compatible = [service for service in services
                      if assess_compatibility(request, features, service.model_dir)["can_estimate_in_strict_mode"]]
        if compatible:
            return min(compatible, key=lambda service: domain_distance(service, features))
    return min(services, key=lambda service: domain_distance(service, features))
