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
  timeUnit: "s" | "ms" | "min" | "h" | "d" | "clock" | "datetime";
  voltageUnit: "V" | "mV";
  currentUnit: "A" | "mA";
  temperatureUnit: "C" | "F" | "K";
  relativeTime: boolean;
  segmentId?: string;
  seriesCells?: number;
  parallelStrings?: number;
  invertCurrent?: boolean;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

const aliases: Record<TelemetryField, string[]> = {
  time_s: ["time", "time_s", "time_ms", "time_min", "time_h", "tiempo", "tiempo_s", "tiempo_ms", "tiempo_min", "elapsed_time", "timestamp", "datetime", "fecha_hora", "seconds", "segundos"],
  voltage_v: ["voltage", "voltage_v", "voltage_mv", "voltage_measured", "voltaje", "voltaje_v", "voltaje_mv", "tension", "tension_v", "battery_voltage", "voltaje_bateria", "pack_voltage_v", "pack_voltage_mv", "pack_voltage", "battery_voltage_v", "cell_voltage_v", "cell_voltage_mv", "voltage_avg_v", "voltage_mean_v", "tension_bateria_v"],
  current_a: ["current", "current_a", "current_ma", "current_measured", "corriente", "corriente_a", "corriente_ma", "battery_current", "corriente_bateria", "pack_current_a", "pack_current_ma", "pack_current", "battery_current_a", "cell_current_a", "discharge_current_a", "load_current_a"],
  temperature_c: ["temperature", "temperature_c", "temperature_f", "temperature_k", "temperature_measured", "temperatura", "temperatura_c", "temperatura_f", "temperatura_k", "temp", "temp_c", "temp_f", "temp_k", "battery_temperature", "temp_avg_c", "temp_mean_c", "temperature_avg_c", "temperature_mean_c", "pack_temperature_c", "cell_temperature_c", "battery_temperature_c", "temp_avg_f", "temp_avg_k"],
};

export function readTelemetryCsv(text: string): CsvData {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (cleaned.startsWith("[") || cleaned.startsWith("{")) {
    let parsed: unknown;
    try { parsed = JSON.parse(cleaned); } catch { throw new Error("El archivo JSON no tiene una estructura válida."); }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const object = parsed as Record<string, unknown>;
      parsed = object.samples ?? object.discharge_samples ?? object.telemetry ?? object.data ?? object.rows;
    }
    if (!Array.isArray(parsed) || parsed.length < 2 || parsed.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw new Error("El JSON debe contener una lista de al menos dos mediciones, directamente o dentro de samples, discharge_samples, telemetry, data o rows.");
    }
    const fields = [...new Set(parsed.flatMap((row) => Object.keys(row)))];
    return { fields, rows: parsed.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] == null ? "" : String(row[field])]))) };
  }
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

const metadataAliases = {
  battery: ["vehicle_id", "battery_id", "pack_id", "device_id", "id_bateria", "bateria", "vehiculo"],
  cycle: ["charge_cycles", "cycle", "cycle_index", "cycle_number", "ciclo", "ciclos", "ciclo_actual"],
  mode: ["operating_mode", "mode", "estado_operacion", "modo", "step_type", "operation", "phase"],
  ambient: ["ambient_temp_c", "ambient_temperature_c", "ambient_temperature", "temperatura_ambiente_c"],
};
function metadataField(data: CsvData, kind: keyof typeof metadataAliases): string | undefined {
  return data.fields.find((field) => metadataAliases[kind].some((alias) => normalize(alias) === normalize(field)));
}
export interface TelemetrySegment {
  id: string;
  label: string;
  mode: string;
  rows: CsvData["rows"];
}
function isDischarge(mode: string): boolean {
  return ["driving", "discharge", "discharging", "descarga", "conduccion", "drive"].includes(normalize(mode));
}
export function getTelemetrySegments(data: CsvData): TelemetrySegment[] {
  const battery = metadataField(data, "battery");
  const cycle = metadataField(data, "cycle");
  const mode = metadataField(data, "mode");
  const groups = new Map<string, CsvData["rows"]>();
  for (const row of data.rows) {
    const key = JSON.stringify([battery ? row[battery] : "", cycle ? row[cycle] : ""]);
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  const segments: TelemetrySegment[] = [];
  for (const rows of groups.values()) {
    let segment: TelemetrySegment | undefined;
    for (const row of rows) {
      const rowMode = mode ? row[mode] : "";
      if (!segment || segment.mode !== rowMode) {
        const label = [battery && row[battery], cycle && `Ciclo ${row[cycle]}`, rowMode, `Tramo ${segments.length + 1}`].filter(Boolean).join(" · ");
        segment = { id: `segment-${segments.length}`, label, mode: rowMode, rows: [] };
        segments.push(segment);
      }
      segment.rows.push(row);
    }
  }
  return segments;
}
export function getDefaultImportOptions(data: CsvData): ImportOptions {
  const segments = getTelemetrySegments(data);
  const selected = segments.find((segment) => isDischarge(segment.mode)) ?? segments[0];
  const options = detectImportOptions(data.fields);
  const firstTime = selected?.rows[0]?.[options.mapping.time_s]?.trim();
  if (firstTime && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(firstTime)) options.timeUnit = "datetime";
  if (firstTime && /^\d+:\d{2}:\d{2}(?:[.,]\d+)?$/.test(firstTime)) options.timeUnit = "clock";
  if (options.timeUnit === "datetime" && firstTime && /^\d+(?:\.\d+)?$/.test(firstTime)) {
    options.timeUnit = firstTime.split(".")[0].length === 13 ? "ms" : "s";
  }
  return { ...options, segmentId: selected?.id, seriesCells: 1, parallelStrings: 1, invertCurrent: false };
}
export function getImportMetadata(data: CsvData, options: ImportOptions): { cycle?: number; ambient?: number; warnings: string[] } {
  const segment = getTelemetrySegments(data).find((segment) => segment.id === options.segmentId);
  const rows = segment?.rows ?? data.rows;
  const uniqueNumber = (kind: "cycle" | "ambient") => {
    const field = metadataField(data, kind);
    if (!field) return undefined;
    const values = [...new Set(rows.map((row) => row[field]?.trim()).filter(Boolean))];
    if (values.length !== 1) return undefined;
    const value = Number(values[0].replace(",", "."));
    return Number.isFinite(value) ? value : undefined;
  };
  const warnings: string[] = [];
  if (normalize(options.mapping.voltage_v).includes("pack") || normalize(options.mapping.current_a).includes("pack")) {
    warnings.push("Se detectaron medidas de un paquete. Las familias disponibles se entrenaron con celdas NASA. Sin validación propia del paquete, el resultado es exploratorio; importar el archivo no valida su aplicabilidad.");
  }
  if (segment?.mode && !isDischarge(segment.mode)) warnings.push(`El tramo seleccionado está marcado como ${segment.mode}. El modelo espera telemetría de descarga.`);
  if (data.fields.some((field) => ["soh", "sohpct", "sohpercent", "soc", "socpct"].includes(normalize(field)))) warnings.push("Las columnas SoH y SoC del archivo no se usan como entrada ni sustituyen la predicción del modelo.");
  const cycle = uniqueNumber("cycle");
  return { cycle: cycle !== undefined && Number.isInteger(cycle) && cycle >= 1 ? cycle : undefined, ambient: uniqueNumber("ambient"), warnings };
}

export function numberValue(raw: string | undefined, row: number, field: string): number {
  const text = (raw ?? "").trim().replace(/\u2212/g, "-");
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    throw new Error(`Fila ${row}: la columna «${field}» necesita un número válido; no se admiten valores vacíos.`);
  }
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value)) throw new Error(`Fila ${row}: «${field}» no es un número finito.`);
  return value;
}

export function convertTelemetryCsv(data: CsvData, options: ImportOptions): TelemetrySample[] {
  const { mapping } = options;
  for (const field of TELEMETRY_FIELDS) {
    if (!mapping[field] || !data.fields.includes(mapping[field])) {
      throw new Error(`Falta asignar la columna ${field}. Selecciona la columna correspondiente para poder analizar.`);
    }
  }
  if (new Set(Object.values(mapping)).size !== TELEMETRY_FIELDS.length) {
    throw new Error("Cada medición debe usar una columna diferente.");
  }
  const segments = getTelemetrySegments(data);
  const segment = options.segmentId ? segments.find((segment) => segment.id === options.segmentId) : undefined;
  if (options.segmentId && !segment) throw new Error("El tramo seleccionado ya no está disponible.");
  if (segment && ["charging", "charge", "carga", "idle", "rest", "reposo"].includes(normalize(segment.mode))) {
    throw new Error("El tramo seleccionado corresponde a carga o reposo. Selecciona un tramo de descarga o conducción para este modelo.");
  }
  if (!segment && segments.length > 1) throw new Error("El archivo contiene varias baterías, ciclos o estados. Selecciona un tramo para evitar mezclar mediciones.");
  const series = options.seriesCells ?? 1;
  const parallel = options.parallelStrings ?? 1;
  if (![series, parallel].every((value) => Number.isInteger(value) && value >= 1)) throw new Error("Las cantidades de celdas en serie y ramas en paralelo deben ser enteros mayores o iguales a 1.");
  const samples = (segment?.rows ?? data.rows).map((row, index) => {
    const line = index + 2;
    let time: number;
    if (options.timeUnit === "datetime") {
      const raw = (row[mapping.time_s] ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(raw)) {
        throw new Error(`Fila ${line}: usa fecha y hora ISO (por ejemplo, 2026-10-12T10:00:00Z).`);
      }
      time = Date.parse(raw) / 1000;
      if (!Number.isFinite(time)) throw new Error(`Fila ${line}: fecha y hora inválida.`);
    } else if (options.timeUnit === "clock") {
      const value = (row[mapping.time_s] ?? "").trim().match(/^(\d+):(\d{2}):(\d{2}(?:[.,]\d+)?)$/);
      if (!value || Number(value[2]) >= 60 || Number(value[3].replace(",", ".")) >= 60) throw new Error(`Fila ${line}: usa una duración HH:MM:SS válida, con minutos y segundos menores que 60.`);
      time = Number(value[1]) * 3600 + Number(value[2]) * 60 + Number(value[3].replace(",", "."));
    } else {
      time = numberValue(row[mapping.time_s], line, mapping.time_s);
      if (time < 0) throw new Error(`Fila ${line}: el tiempo no puede ser negativo.`);
      time *= { s: 1, ms: 0.001, min: 60, h: 3600, d: 86400 }[options.timeUnit];
    }
    const voltage = numberValue(row[mapping.voltage_v], line, mapping.voltage_v) / (options.voltageUnit === "mV" ? 1000 : 1) / series;
    const current = numberValue(row[mapping.current_a], line, mapping.current_a) / (options.currentUnit === "mA" ? 1000 : 1) / parallel * (options.invertCurrent ? -1 : 1);
    let temperature = numberValue(row[mapping.temperature_c], line, mapping.temperature_c);
    if (options.temperatureUnit === "F") temperature = (temperature - 32) * 5 / 9;
    if (options.temperatureUnit === "K") temperature -= 273.15;
    if (voltage <= 0) throw new Error(`Fila ${line}: el voltaje debe ser mayor que cero.`);
    if (![time, voltage, current, temperature].every(Number.isFinite)) {
      throw new Error(`Fila ${line}: valor fuera del rango numérico admitido.`);
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
  return convertTelemetryCsv(data, getDefaultImportOptions(data));
}
