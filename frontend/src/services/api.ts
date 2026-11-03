import { validatePrediction } from "../utils/validatePrediction.ts";
import type { Compatibility } from "../types/prediction";
import type { CsvData } from "../utils/parseTelemetryCsv";
import type { TelemetryIdentification, TelemetrySample } from "../types/telemetry";

export class CompatibilityError extends Error {
  report: Compatibility;
  constructor(message: string, report: Compatibility) { super(message); this.report = report; this.name = "CompatibilityError"; }
}

export async function importTelemetryFile(file: File, sheet?: string, segment?: string): Promise<CsvData & { sheets: string[]; selected_sheet: string | null; warnings: string[]; segments?: { id: string; label: string; samples: number }[]; selected_segment?: string; telemetry?: { samples_detected: number; declared_context?: Partial<Pick<TelemetryRequest, "cycle" | "measurement_level" | "chemistry">> } }> {
  const query = new URLSearchParams({ filename: file.name });
  if (sheet) query.set("sheet", sheet);
  if (segment !== undefined) query.set("segment", segment);
  const response = await fetch(`${API_BASE_URL}/api/v1/telemetry/import?${query}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo importar el archivo.");
  return data;
}

export async function identifyTelemetry(samples: TelemetrySample[]): Promise<TelemetryIdentification> {
  const response = await fetch(`${API_BASE_URL}/api/v1/telemetry/identify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ discharge_samples: samples }),
  });
  if (!response.ok) throw new Error("No se pudo identificar el registro de referencia.");
  return response.json() as Promise<TelemetryIdentification>;
}
import type {
  PredictionResponse,
} from "../types/prediction";

import type {
  TelemetryRequest,
} from "../types/telemetry";


const API_BASE_URL =
  import.meta.env?.VITE_API_URL ??
  "http://127.0.0.1:8000";

export async function checkTelemetryCompatibility(telemetry: TelemetryRequest): Promise<Compatibility> {
  const response = await fetch(`${API_BASE_URL}/api/v1/telemetry/compatibility`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(telemetry),
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error("No se pudo interpretar la comprobación de compatibilidad del servicio. Tus mediciones se conservan."); }
  if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "No se pudo comprobar la compatibilidad de la telemetría.");
  const statuses = ["within_observed_ranges", "out_of_range", "unverified", "incompatible"];
  if (!data || !statuses.includes(data.status) || typeof data.can_estimate_in_strict_mode !== "boolean"
    || data.can_estimate_in_strict_mode !== (data.status === "within_observed_ranges")
    || !Array.isArray(data.reasons) || !Array.isArray(data.quality_warnings) || !Array.isArray(data.feature_deviations)
    || typeof data.limitation !== "string") {
    throw new Error("El servicio devolvió una comprobación de compatibilidad inválida. Tus mediciones se conservan.");
  }
  return data as Compatibility;
}


export async function predictBattery(
  telemetry: TelemetryRequest,
): Promise<PredictionResponse> {

  // A readable file can still be outside every available model's domain.
  // Check it before issuing a prediction request that is known to be rejected.
  const compatibility = await checkTelemetryCompatibility(telemetry);
  if (!compatibility.can_estimate_in_strict_mode) {
    throw new CompatibilityError(compatibility.message ?? compatibility.reasons[0] ?? "No hay un modelo compatible con estas mediciones.", compatibility);
  }

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
