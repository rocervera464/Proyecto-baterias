import type { PredictionResponse } from "../types/prediction";

export function validatePrediction(value: unknown, cycle: number): PredictionResponse {
  const fail = () => { throw new Error("La respuesta del modelo está incompleta o contiene valores inválidos. Tus mediciones se conservan; vuelve a intentar el análisis."); };
  if (!value || typeof value !== "object") return fail();
  const data = value as PredictionResponse;
  if (data.compatibility && (!Array.isArray(data.compatibility.reasons) || !Array.isArray(data.compatibility.quality_warnings) || !Array.isArray(data.compatibility.feature_deviations) || typeof data.compatibility.can_estimate_in_strict_mode !== "boolean")) return fail();
  if (data.status !== "success" || typeof data.model_family !== "string" || data.current_cycle !== cycle || !Number.isFinite(data.current_soh_percent) || !Array.isArray(data.future_predictions) || data.future_predictions.length !== 4) return fail();
  const horizons = new Set<number>();
  for (const item of data.future_predictions) {
    if (!item || ![5, 10, 20, 30].includes(item.horizon_cycles) || horizons.has(item.horizon_cycles) || item.target_cycle !== cycle + item.horizon_cycles || !Number.isFinite(item.predicted_soh_percent) || typeof item.experimental !== "boolean") return fail();
    horizons.add(item.horizon_cycles);
  }
  return data;
}
