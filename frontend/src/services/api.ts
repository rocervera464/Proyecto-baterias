import { validatePrediction } from "../utils/validatePrediction";
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
    let detail = "El servicio no pudo completar la predicción.";
    try {
      const parsed: { detail?: unknown } = JSON.parse(errorBody);
      if (typeof parsed.detail === "string") detail = parsed.detail;
      else if (Array.isArray(parsed.detail)) {
        detail = parsed.detail.map((item: { loc?: (string | number)[]; msg?: string }) => `${item.loc?.filter((part) => part !== "body").join(" · ") ?? "Datos"}: ${item.msg ?? "valor inválido"}`).join(". ");
      }
    } catch { /* Una respuesta no JSON conserva el mensaje general. */ }
    throw new Error(`Error del servicio (${response.status}). ${detail}`);
  }


  let result: unknown;
  try { result = await response.json(); }
  catch { throw new Error("El servicio devolvió una respuesta que no se pudo interpretar. Tus mediciones se conservan; vuelve a intentar el análisis."); }
  return validatePrediction(result, telemetry.cycle);
}
