import type {
  PredictionResponse,
} from "../types/prediction";

import type {
  TelemetryRequest,
} from "../types/telemetry";


const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  "http://127.0.0.1:8000";


export async function predictBattery(
  telemetry: TelemetryRequest,
): Promise<PredictionResponse> {

  const response = await fetch(
    `${API_BASE_URL}/api/v1/predict`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(
        telemetry,
      ),
    },
  );


  if (!response.ok) {

    const errorBody = await response.text();

    throw new Error(
      `Prediction API error ${response.status}: ${errorBody}`,
    );
  }


  return response.json();
}