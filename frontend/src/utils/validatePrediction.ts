import type { PredictionResponse } from "../types/prediction";

export function validatePrediction(value: unknown, cycle?: number | null): PredictionResponse {
  const fail = () => { throw new Error("La respuesta del modelo está incompleta o contiene valores inválidos. Tus mediciones se conservan; vuelve a intentar el análisis."); };
  if (!value || typeof value !== "object") return fail();
  const data = value as PredictionResponse;
  const telemetryOnly = data.model_family === "XGBoost telemetry v4";
  const upper = telemetryOnly ? 120 : 100;
  if (telemetryOnly && (!data.telemetry || data.telemetry.window_seconds !== 300 || !Number.isInteger(data.telemetry.samples_used) || data.telemetry.samples_used < 4 || !Array.isArray(data.telemetry.variables_detected))) return fail();
  if (data.input_normalization !== undefined && !Array.isArray(data.input_normalization)) return fail();
  const restoredCycle = data.input_normalization?.find(change => change?.field === "cycle"
    && change.basis === "verified_reference" && change.operation === "restore_source_context"
    && change.original_value === cycle && change.normalized_value === data.current_cycle);
  const effectiveCycle = restoredCycle && data.telemetry_reference?.cycle === data.current_cycle
    && /^[a-f0-9]{64}$/.test(data.telemetry_reference.source_sha256) ? data.current_cycle : cycle;
  if (data.compatibility && (!Array.isArray(data.compatibility.reasons) || !Array.isArray(data.compatibility.quality_warnings) || !Array.isArray(data.compatibility.feature_deviations) || typeof data.compatibility.can_estimate_in_strict_mode !== "boolean")) return fail();
  if (data.compatibility && !data.compatibility.can_estimate_in_strict_mode) return fail();
  if (!telemetryOnly && (effectiveCycle == null || data.current_cycle == null || !Number.isInteger(data.current_cycle) || data.current_cycle < 1 || data.current_cycle !== effectiveCycle)) return fail();
  if (telemetryOnly && ((data.current_cycle ?? null) !== (cycle ?? null) || (data.current_cycle != null && (!Number.isInteger(data.current_cycle) || data.current_cycle < 1)))) return fail();
  if (data.status !== "success" || typeof data.model_family !== "string" || !Number.isFinite(data.current_soh_percent) || data.current_soh_percent < 0 || data.current_soh_percent > upper || !Array.isArray(data.future_predictions) || !Array.isArray(data.production_horizons)) return fail();
  const orderedHorizons = (values: unknown): values is number[] => Array.isArray(values)
    && values.every((h, i) => Number.isInteger(h) && h > 0 && (i === 0 || h > values[i - 1]));
  if (!orderedHorizons(data.production_horizons)) return fail();
  const explicitForecasts = telemetryOnly && data.forecast_horizons !== undefined;
  let displayedHorizons = data.production_horizons;
  if (explicitForecasts) {
    if (!orderedHorizons(data.forecast_horizons) || !orderedHorizons(data.research_horizons)) return fail();
    const known = new Set([...data.production_horizons, ...data.research_horizons]);
    if ([...known].some(h => ![5, 10, 20, 30].includes(h))
      || data.research_horizons.some(h => data.production_horizons.includes(h))
      || data.forecast_horizons.some(h => !known.has(h))
      || data.production_horizons.some(h => !data.forecast_horizons!.includes(h))
      || (data.forecast_note != null && typeof data.forecast_note !== "string")) return fail();
    displayedHorizons = data.forecast_horizons;
  }
  if (data.future_predictions.length !== displayedHorizons.length) return fail();
  const horizons = new Set<number>();
  let previous = data.current_soh_percent;
  for (const [index, item] of data.future_predictions.entries()) {
    const target = effectiveCycle == null ? null : effectiveCycle + item.horizon_cycles;
    if (!item || item.horizon_cycles !== displayedHorizons[index] || horizons.has(item.horizon_cycles) || item.target_cycle !== target || !Number.isFinite(item.predicted_soh_percent) || item.predicted_soh_percent < 0 || item.predicted_soh_percent > upper || item.predicted_soh_percent > previous + 1e-6 || item.experimental === true) return fail();
    if (explicitForecasts && item.validation_status !== (data.production_horizons.includes(item.horizon_cycles) ? "production" : "research")) return fail();
    previous = item.predicted_soh_percent;
    horizons.add(item.horizon_cycles);
  }
  return data;
}
