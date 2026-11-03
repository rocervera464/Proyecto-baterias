export interface TelemetrySample {
  time_s: number;
  voltage_v: number;
  current_a: number;
  temperature_c: number;
}


export interface PreviousEIS {
  re_ohm?: number | null;
  rct_ohm?: number | null;
}


export interface PreviousCharge {
  temperature_start_c?: number | null;
  temperature_max_c?: number | null;
  temperature_delta_c?: number | null;
}


export interface TelemetryRequest {
  normalize_inputs?: boolean;
  measurement_level?: "unknown" | "cell" | "module" | "pack";
  chemistry?: "unknown" | "li-ion" | "LFP" | "lead-acid" | "other";
  analysis_mode?: "strict" | "exploratory";
  cycle: number;

  ambient_temperature_c: number;

  cutoff_voltage_v: number;

  discharge_samples: TelemetrySample[];

  previous_eis?: PreviousEIS | null;

  previous_charge?: PreviousCharge | null;
}

export interface InputNormalization {
  field: string;
  original_value?: string | number;
  normalized_value?: string | number;
  basis: "verified_reference";
  operation: string;
  factor?: number;
  source_unit?: string;
  target_unit?: string;
}

export interface TelemetryIdentification {
  matched: boolean;
  reference: { battery_id: string; cycle: number; source_sha256: string } | null;
  context: Partial<Pick<TelemetryRequest, "cycle" | "ambient_temperature_c" | "cutoff_voltage_v" | "measurement_level" | "chemistry">>;
  discharge_samples: TelemetrySample[];
  adjustments: InputNormalization[];
}
