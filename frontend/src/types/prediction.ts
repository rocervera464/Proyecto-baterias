export interface FuturePrediction {
  horizon_cycles: number;

  target_cycle: number;

  predicted_soh_percent: number;

  raw_predicted_soh_percent?: number;

  adjusted?: boolean;

  experimental: boolean;
}


export interface PredictionResponse {
  status: string;

  model_family: string;

  forecast_method?: string;

  raw_current_soh_percent?: number;

  current_cycle: number;

  current_soh_percent: number;

  future_predictions: FuturePrediction[];
}