import type { PredictionResponse } from "../types/prediction";

export function validatePrediction(value: unknown, cycle: number): PredictionResponse {
  const fail = () => { throw new Error("La respuesta del modelo está incompleta o contiene valores inválidos. Tus mediciones se conservan; vuelve a intentar el análisis."); };
  if (!value || typeof value !== "object") return fail();
  const data = value as PredictionResponse;
  if (data.compatibility && (!Array.isArray(data.compatibility.reasons) || !Array.isArray(data.compatibility.quality_warnings) || !Array.isArray(data.compatibility.feature_deviations) || typeof data.compatibility.can_estimate_in_strict_mode !== "boolean")) return fail();
  if (data.compatibility && !data.compatibility.can_estimate_in_strict_mode) return fail();
  if (data.status !== "success" || typeof data.model_family !== "string" || data.current_cycle !== cycle || !Number.isFinite(data.current_soh_percent) || data.current_soh_percent < 0 || data.current_soh_percent > 100 || !Array.isArray(data.future_predictions) || !Array.isArray(data.production_horizons)) return fail();
  if (data.production_horizons.length !== new Set(data.production_horizons).size || data.future_predictions.length !== data.production_horizons.length || data.production_horizons.some((h, i) => !Number.isInteger(h) || h <= 0 || (i > 0 && h <= data.production_horizons![i - 1]))) return fail();
  const horizons = new Set<number>();
  let previous = data.current_soh_percent;
  for (const [index, item] of data.future_predictions.entries()) {
    if (!item || item.horizon_cycles !== data.production_horizons[index] || horizons.has(item.horizon_cycles) || item.target_cycle !== cycle + item.horizon_cycles || !Number.isFinite(item.predicted_soh_percent) || item.predicted_soh_percent < 0 || item.predicted_soh_percent > 100 || item.predicted_soh_percent > previous + 1e-6 || item.experimental === true) return fail();
    previous = item.predicted_soh_percent;
    horizons.add(item.horizon_cycles);
  }
  return data;
}
