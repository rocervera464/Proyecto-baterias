import type { PredictionResponse } from "../types/prediction";

const demo = [88, 87.6, 87.1, 86.3, 85.5];
export function getMethodologyResults(prediction: PredictionResponse | null) {
  return [0, 5, 10, 20, 30].map((h, i) => {
    const future = prediction?.future_predictions.find((item) => item.horizon_cycles === h);
    return {
      h,
      value: prediction ? (h === 0 ? prediction.current_soh_percent : future?.predicted_soh_percent) : demo[i],
      raw: prediction ? (h === 0 ? prediction.raw_current_soh_percent : future?.raw_predicted_soh_percent) : undefined,
    };
  });
}
