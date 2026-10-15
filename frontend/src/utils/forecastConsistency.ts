import type { PredictionResponse } from "../types/prediction";

export function getForecastIncreases(prediction: PredictionResponse) {
  const points = [
    { horizon: 0, soh: prediction.current_soh_percent },
    ...prediction.future_predictions.map((item) => ({ horizon: item.horizon_cycles, soh: item.predicted_soh_percent })),
  ].filter((point) => Number.isFinite(point.soh)).sort((a, b) => a.horizon - b.horizon);
  return points.slice(1).flatMap((point, index) => {
    const previous = points[index];
    return point.soh > previous.soh + 1e-6
      ? [{ fromHorizon: previous.horizon, toHorizon: point.horizon, increase: point.soh - previous.soh }]
      : [];
  });
}
