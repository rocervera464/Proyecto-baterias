import Papa from "papaparse";
import type { TelemetrySample } from "../types/telemetry";

export const TELEMETRY_FIELDS = ["time_s", "voltage_v", "current_a", "temperature_c"] as const;
export type TelemetryField = typeof TELEMETRY_FIELDS[number];
export type ColumnMapping = Record<TelemetryField, string>;
export interface CsvData {
  fields: string[];
  rows: Record<string, string>[];
}
export interface ImportOptions {
  mapping: ColumnMapping;
  timeUnit: "s" | "ms" | "min" | "h" | "datetime";
  voltageUnit: "V" | "mV";
  currentUnit: "A" | "mA";
  temperatureUnit: "C" | "F" | "K";
  relativeTime: boolean;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

const aliases: Record<TelemetryField, string[]> = {
  time_s: ["time", "time_s", "time_ms", "time_min", "time_h", "tiempo", "tiempo_s", "tiempo_ms", "tiempo_min", "elapsed_time", "timestamp", "datetime", "fecha_hora", "seconds", "segundos"],
  voltage_v: ["voltage", "voltage_v", "voltage_mv", "voltage_measured", "voltaje", "voltaje_v", "voltaje_mv", "tension", "tension_v", "battery_voltage", "voltaje_bateria"],
  current_a: ["current", "current_a", "current_ma", "current_measured", "corriente", "corriente_a", "corriente_ma", "battery_current", "corriente_bateria"],
  temperature_c: ["temperature", "temperature_c", "temperature_f", "temperature_k", "temperature_measured", "temperatura", "temperatura_c", "temperatura_f", "temperatura_k", "temp", "temp_c", "temp_f", "temp_k", "battery_temperature"],
};

export function readTelemetryCsv(text: string): CsvData {
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  if (result.errors.length) {
    throw new Error(`No fue posible leer el CSV: ${result.errors[0].message}`);
  }
  if (result.meta.renamedHeaders && Object.keys(result.meta.renamedHeaders).length) {
    throw new Error("Hay columnas con nombres repetidos. Usa nombres distintos para asignarlas.");
  }
  if (result.data.length < 2) {
    throw new Error("El archivo debe contener encabezados y al menos dos muestras.");
  }
  return { fields: result.meta.fields ?? [], rows: result.data };
}

export function detectImportOptions(fields: string[]): ImportOptions {
  const mapping = Object.fromEntries(TELEMETRY_FIELDS.map((key) => {
    const matches = fields.filter((field) => aliases[key].some((alias) => normalize(alias) === normalize(field)));
    return [key, matches.length === 1 ? matches[0] : ""];
  })) as ColumnMapping;
  const time = normalize(mapping.time_s);
  const temperature = normalize(mapping.temperature_c);
  return {
    mapping,
    timeUnit: ["timestamp", "datetime", "fechahora"].includes(time) ? "datetime"
      : time.endsWith("ms") ? "ms" : time.endsWith("min") ? "min" : time.endsWith("h") ? "h" : "s",
    voltageUnit: normalize(mapping.voltage_v).endsWith("mv") ? "mV" : "V",
    currentUnit: normalize(mapping.current_a).endsWith("ma") ? "mA" : "A",
    temperatureUnit: temperature.endsWith("f") ? "F" : temperature.endsWith("k") ? "K" : "C",
    relativeTime: true,
  };
}

function numberValue(raw: string | undefined, row: number, field: string): number {
  const text = (raw ?? "").trim().replace(/\u2212/g, "-");
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    throw new Error(`Fila ${row}: la columna ?${field}? necesita un n?mero v?lido; no se admiten valores vac?os.`);
  }
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value)) throw new Error(`Fila ${row}: ?${field}? no es un n?mero finito.`);
  return value;
}

export function convertTelemetryCsv(data: CsvData, options: ImportOptions): TelemetrySample[] {
  const { mapping } = options;
  for (const field of TELEMETRY_FIELDS) {
    if (!mapping[field] || !data.fields.includes(mapping[field])) {
      throw new Error("Asigna las columnas de tiempo, voltaje, corriente y temperatura para poder predecir.");
    }
  }
  if (new Set(Object.values(mapping)).size !== TELEMETRY_FIELDS.length) {
    throw new Error("Cada medici?n debe usar una columna diferente.");
  }
  const samples = data.rows.map((row, index) => {
    const line = index + 2;
    let time: number;
    if (options.timeUnit === "datetime") {
      const raw = (row[mapping.time_s] ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(raw)) {
        throw new Error(`Fila ${line}: usa fecha y hora ISO (por ejemplo, 2026-10-12T10:00:00Z).`);
      }
      time = Date.parse(raw) / 1000;
      if (!Number.isFinite(time)) throw new Error(`Fila ${line}: fecha y hora inv?lida.`);
    } else {
      time = numberValue(row[mapping.time_s], line, mapping.time_s);
      if (time < 0) throw new Error(`Fila ${line}: el tiempo no puede ser negativo.`);
      time *= { s: 1, ms: 0.001, min: 60, h: 3600 }[options.timeUnit];
    }
    const voltage = numberValue(row[mapping.voltage_v], line, mapping.voltage_v) / (options.voltageUnit === "mV" ? 1000 : 1);
    const current = numberValue(row[mapping.current_a], line, mapping.current_a) / (options.currentUnit === "mA" ? 1000 : 1);
    let temperature = numberValue(row[mapping.temperature_c], line, mapping.temperature_c);
    if (options.temperatureUnit === "F") temperature = (temperature - 32) * 5 / 9;
    if (options.temperatureUnit === "K") temperature -= 273.15;
    if (voltage <= 0) throw new Error(`Fila ${line}: el voltaje debe ser mayor que cero.`);
    if (![time, voltage, current, temperature].every(Number.isFinite)) {
      throw new Error(`Fila ${line}: valor fuera del rango num?rico admitido.`);
    }
    return { time_s: time, voltage_v: voltage, current_a: current, temperature_c: temperature };
  }).sort((a, b) => a.time_s - b.time_s);
  if (samples.length < 2) throw new Error("Se necesitan al menos dos muestras.");
  if (options.relativeTime || options.timeUnit === "datetime") {
    const start = samples[0].time_s;
    for (const sample of samples) sample.time_s -= start;
  }
  if (new Set(samples.filter((sample) => sample.time_s <= 300).map((sample) => sample.time_s)).size < 2) {
    throw new Error("Se necesitan mediciones en al menos dos instantes distintos durante los primeros 300 segundos de la descarga.");
  }
  return samples;
}

export async function parseTelemetryCsv(file: File): Promise<TelemetrySample[]> {
  const data = readTelemetryCsv(await file.text());
  return convertTelemetryCsv(data, detectImportOptions(data.fields));
}
