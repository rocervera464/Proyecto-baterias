import Papa from "papaparse";
import { convertTelemetryCsv, numberValue, TELEMETRY_FIELDS } from "./parseTelemetryCsv.ts";
import type { CsvData, ImportOptions, TelemetryField } from "./parseTelemetryCsv.ts";
import type { TelemetrySample } from "../types/telemetry";

export type ManualRow = Record<TelemetryField, string>;
export const emptyManualRow = (): ManualRow => ({ time_s: "", voltage_v: "", current_a: "", temperature_c: "" });
export const manualImportOptions: ImportOptions = {
  mapping: { time_s: "time_s", voltage_v: "voltage_v", current_a: "current_a", temperature_c: "temperature_c" },
  timeUnit: "s", voltageUnit: "V", currentUnit: "A", temperatureUnit: "C", relativeTime: false,
};
export function manualCsvData(rows: ManualRow[]): CsvData {
  return { fields: [...TELEMETRY_FIELDS], rows: rows.map((row) => ({ ...row })) };
}
export function validateManualTelemetry(rows: ManualRow[]) {
  const errors: Record<string, string> = {};
  const preview: TelemetrySample[] = [];
  rows.forEach((row, index) => {
    const values: Partial<TelemetrySample> = {};
    for (const field of TELEMETRY_FIELDS) {
      try {
        const value = numberValue(row[field], index + 1, field);
        if (field === "time_s" && value < 0) throw new Error("El tiempo no puede ser negativo.");
        if (field === "voltage_v" && value <= 0) throw new Error("El voltaje debe ser mayor que cero.");
        values[field] = value;
      } catch (error) { errors[`${index}-${field}`] = error instanceof Error ? error.message : "Valor inválido."; }
    }
    if (TELEMETRY_FIELDS.every((field) => values[field] !== undefined)) preview.push(values as TelemetrySample);
  });
  preview.sort((a, b) => a.time_s - b.time_s);
  let samples: TelemetrySample[] = [];
  let error: string | null = null;
  try {
    if (Object.keys(errors).length) throw new Error("Completa o corrige los campos señalados; también puedes eliminar las filas que no utilices.");
    samples = convertTelemetryCsv(manualCsvData(rows), manualImportOptions);
  } catch (reason) { error = reason instanceof Error ? reason.message : "Revisa las mediciones."; }
  const warnings: string[] = [];
  if (preview.length && preview[0].time_s > 0) warnings.push("La primera medición no está en el segundo 0. El tiempo se conserva como tiempo desde el inicio de la descarga; no se desplaza ni se completa la señal.");
  if (preview.length && preview[preview.length - 1].time_s < 300) warnings.push("No se alcanza el segundo 300. El sistema puede aceptar las mediciones disponibles, pero no garantiza que representen la descarga adecuadamente.");
  if (new Set(preview.map((row) => row.time_s)).size < preview.length) warnings.push("Hay tiempos repetidos. Se conservan, como en el CSV, y cada fila cuenta en las estadísticas. Se requieren al menos dos instantes distintos dentro de la ventana.");
  if (preview.some((row) => row.current_a > 0)) warnings.push("Hay corriente positiva. Comprueba el signo: el entrenamiento usa descarga negativa. En modo manual se conserva el signo que ingresas.");
  if (preview.some((row) => row.time_s > 300)) warnings.push("Las mediciones posteriores al segundo 300 se muestran en la vista previa, pero quedan fuera de la predicción.");
  return { samples, preview, errors, error, warnings, inWindow: preview.filter((row) => row.time_s <= 300).length };
}

export function parseManualPaste(text: string): ManualRow[] {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: "greedy" });
  if (result.errors.length) throw new Error("No se pudo leer el bloque. Pega cuatro columnas separadas por tabulaciones, comas o punto y coma.");
  const records = result.data;
  if (records[0]?.every((value, index) => value.trim() === TELEMETRY_FIELDS[index])) records.shift();
  if (!records.length || records.some((record) => record.length !== 4)) throw new Error("Cada fila pegada debe tener cuatro columnas: tiempo, voltaje, corriente y temperatura.");
  return records.map((record) => Object.fromEntries(TELEMETRY_FIELDS.map((field, index) => [field, record[index].trim()])) as ManualRow);
}
