import { numberValue, TELEMETRY_FIELDS } from "./parseTelemetryCsv.ts";
import { validateManualTelemetry } from "./manualTelemetry.ts";
import type { ManualRow } from "./manualTelemetry.ts";

export function getManualStepIssue(rows: ManualRow[], step: number): string | null {
  if (step < 0 || step > 3) return null;
  if (rows.length < 2) return "Agrega al menos dos mediciones de la misma descarga.";
  const field = TELEMETRY_FIELDS[step];
  const validation = validateManualTelemetry(rows);
  if (rows.some((_, index) => validation.errors[`${index}-${field}`])) return "Completa este dato en cada medición con un número válido.";
  if (step === 0) {
    const times = rows.map((row, index) => numberValue(row.time_s, index + 1, "time_s"));
    if (new Set(times.filter(time => time <= 300)).size < 2) return "Necesitas al menos dos tiempos distintos entre 0 y 300 segundos.";
  }
  return null;
}
