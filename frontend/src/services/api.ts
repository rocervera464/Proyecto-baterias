import { validatePrediction } from "../utils/validatePrediction";
import type { Compatibility } from "../types/prediction";
import type { CsvData } from "../utils/parseTelemetryCsv";

export class CompatibilityError extends Error {
  report: Compatibility;
  constructor(message: string, report: Compatibility) { super(message); this.report = report; this.name = "CompatibilityError"; }
}

export async function importTelemetryFile(file: File, sheet?: string): Promise<CsvData & { sheets: string[]; selected_sheet: string | null; warnings: string[] }> {
  const query = new URLSearchParams({ filename: file.name });
  if (sheet) query.set("sheet", sheet);
  const response = await fetch(`${API_BASE_URL}/api/v1/telemetry/import?${query}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo importar el archivo.");
  return data;
}
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
      if (parsed.detail && typeof parsed.detail === "object" && "compatibility" in parsed.detail) {
        const rejection = parsed.detail as { message: string; compatibility: Compatibility };
        throw new CompatibilityError(rejection.message, rejection.compatibility);
      }
      if (typeof parsed.detail === "string") detail = parsed.detail;
      else if (Array.isArray(parsed.detail)) {
        detail = parsed.detail.map((item: { loc?: (string | number)[]; msg?: string }) => `${item.loc?.filter((part) => part !== "body").join(" · ") ?? "Datos"}: ${item.msg ?? "valor inválido"}`).join(". ");
      }
    } catch (error) { if (error instanceof CompatibilityError) throw error; }
    throw new Error(`Error del servicio (${response.status}). ${detail}`);
  }


  let result: unknown;
  try { result = await response.json(); }
  catch { throw new Error("El servicio devolvió una respuesta que no se pudo interpretar. Tus mediciones se conservan; vuelve a intentar el análisis."); }
  return validatePrediction(result, telemetry.cycle);
}
