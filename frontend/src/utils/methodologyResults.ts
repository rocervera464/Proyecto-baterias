import type { PredictionResponse } from "../types/prediction";

const demo = [88, 87.6, 87.1, 86.3, 85.5];
export function getMethodologyResults(prediction: PredictionResponse | null) {
  return (prediction ? [0, ...prediction.future_predictions.map(item => item.horizon_cycles).sort((a, b) => a - b)] : [0, 5, 10, 20, 30]).map((h, i) => {
    const future = prediction?.future_predictions.find((item) => item.horizon_cycles === h);
    return {
      h,
      value: prediction ? (h === 0 ? prediction.current_soh_percent : future?.predicted_soh_percent) : demo[i],
    };
  });
}
