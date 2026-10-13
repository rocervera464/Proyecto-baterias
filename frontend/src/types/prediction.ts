export interface FuturePrediction {
  horizon_cycles: number;

  target_cycle: number;

  predicted_soh_percent: number;

  experimental: boolean;
}


export interface PredictionResponse {
  status: string;

  model_family: string;

  current_cycle: number;

  current_soh_percent: number;

  future_predictions: FuturePrediction[];
}