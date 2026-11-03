export interface Compatibility {
  status: "within_observed_ranges" | "out_of_range" | "unverified" | "incompatible";
  model_id: string;
  model_description?: string;
  can_estimate_in_strict_mode: boolean;
  reasons: string[];
  quality_warnings: string[];
  feature_deviations: { feature: string; value: number; observed_min: number; observed_max: number }[];
  reference_coverage?: { min: number; max: number } | null;
  limitation: string;
}
export interface FuturePrediction {
  horizon_cycles: number;

  target_cycle: number;

  predicted_soh_percent: number;

  // Rejected by validation if an older server tries to expose research.
  experimental?: boolean;
}


export interface PredictionResponse {
  input_normalization?: import("./telemetry").InputNormalization[];
  telemetry_reference?: { battery_id: string; cycle: number; source_sha256: string } | null;
  production_horizons: number[];
  compatibility?: Compatibility;
  status: string;

  model_family: string;

  forecast_method?: string;

  current_cycle: number;

  current_soh_percent: number;

  future_predictions: FuturePrediction[];
}
