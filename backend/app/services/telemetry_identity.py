"""Recover context and units only from a unique measured reference match.

No nearest-neighbour guessing, filename-based identity, SoH labels or clipping
to model ranges. Fingerprints cover all four signals in the model window.
"""
import hashlib
import itertools
import json
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.schemas.telemetry import DischargeSample, TelemetryRequest

CATALOG = Path(__file__).resolve().parents[2] / "reference_data/telemetry_context_catalog.json"
SIGNALS = ("time_s", "voltage_v", "current_a", "temperature_c")
CONTEXT_FIELDS = ("cycle", "ambient_temperature_c", "cutoff_voltage_v", "measurement_level", "chemistry")


def fingerprint(values):
    values = np.asarray(values, dtype=float)
    if values.ndim != 2 or values.shape[1] != 4 or not np.isfinite(values).all():
        return None
    values = values[np.argsort(values[:, 0], kind="stable")]
    values = values[(values[:, 0] >= 0) & (values[:, 0] <= 300)]
    if len(values) < 2 or len(np.unique(values[:, 0])) != len(values):
        return None
    values = np.round(values, 8)
    values[values == 0] = 0  # identical treatment of positive/negative zero
    encoded = json.dumps(values.tolist(), separators=(",", ":"), allow_nan=False).encode()
    return hashlib.sha256(encoded).hexdigest()


@lru_cache(maxsize=1)
def load_catalog():
    if not CATALOG.exists():
        return {}  # source recovery is optional; declared telemetry still works
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or data.get("rounding_decimals") != 8:
        raise RuntimeError("Catálogo de referencias de telemetría incompatible.")
    return data["fingerprints"]


def identify_samples(samples: list[DischargeSample]):
    original = np.array([[getattr(sample, field) for field in SIGNALS] for sample in samples], dtype=float)
    catalog = load_catalog()
    unmatched = {"matched": False, "reference": None, "context": {},
                 "discharge_samples": [sample.model_dump() for sample in samples], "adjustments": []}
    if not catalog:
        return unmatched
    direct = catalog.get(fingerprint(original), [])
    if len(direct) > 1:
        return unmatched
    if len(direct) == 1:
        matches = [(direct[0], original, [])]
    else:
        matches = []
        # Conversions are accepted ONLY when the whole window then matches a
        # measured source. Magnitude alone never chooses units or polarity.
        for time_factor, voltage_factor, current_factor, temperature_unit in itertools.product(
            [1., .001, 60., 3600.], [1., .001], [1., -1., .001, -.001], ["C", "F", "K"]
        ):
            if (time_factor, voltage_factor, current_factor, temperature_unit) == (1., 1., 1., "C"):
                continue
            values = original.copy()
            values[:, :3] *= [time_factor, voltage_factor, current_factor]
            if temperature_unit == "F":
                values[:, 3] = (values[:, 3] - 32) * 5 / 9
            elif temperature_unit == "K":
                values[:, 3] -= 273.15
            references = catalog.get(fingerprint(values), [])
            if len(references) > 1:
                return unmatched
            if len(references) == 1:
                adjustments = []
                for field, factor in zip(SIGNALS[:3], [time_factor, voltage_factor, current_factor]):
                    if factor != 1:
                        adjustments.append({"field": field, "factor": factor, "basis": "verified_reference", "operation": "unit_or_polarity_conversion"})
                if temperature_unit != "C":
                    adjustments.append({"field": "temperature_c", "source_unit": temperature_unit,
                                        "target_unit": "C", "basis": "verified_reference", "operation": "unit_conversion"})
                matches.append((references[0], values, adjustments))
        # Competing matches or conversions are not silently resolved.
        if len(matches) != 1:
            return unmatched
    reference, values, adjustments = matches[0]
    return {"matched": True, "reference": {"battery_id": reference["battery_id"], "cycle": reference["cycle"], "source_sha256": reference["source_sha256"]},
            "context": {key: reference[key] for key in CONTEXT_FIELDS},
            "discharge_samples": [dict(zip(SIGNALS, map(float, row))) for row in values], "adjustments": adjustments}


def normalize_request(request: TelemetryRequest):
    if not request.normalize_inputs:
        return request, [], None
    identity = identify_samples(request.discharge_samples)
    if not identity["matched"]:
        return request, [], None
    adjustments = list(identity["adjustments"])
    updates = {"discharge_samples": [DischargeSample.model_validate(sample) for sample in identity["discharge_samples"]]}
    for field, value in identity["context"].items():
        previous = getattr(request, field)
        if previous != value:
            updates[field] = value
            adjustments.append({"field": field, "original_value": previous, "normalized_value": value,
                                "basis": "verified_reference", "operation": "restore_source_context"})
    return request.model_copy(update=updates), adjustments, identity["reference"]
