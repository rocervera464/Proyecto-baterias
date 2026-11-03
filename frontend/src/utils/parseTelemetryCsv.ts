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
  cycleColumn?: string;
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
    let metadata: Record<string, unknown> = {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const object = parsed as Record<string, unknown>;
      const rootMetadata = Object.fromEntries(Object.entries(object).filter(([, value]) => typeof value === "string" || typeof value === "number"));
      for (const name of ["metadata", "context", "parameters", "battery", "previous_eis", "previous_charge"]) {
        const container = object[name];
        if (!container || typeof container !== "object" || Array.isArray(container)) continue;
        for (const [key, value] of Object.entries(container)) {
          if (typeof value !== "string" && typeof value !== "number") continue;
          if (metadata[key] !== undefined && metadata[key] !== value && rootMetadata[key] === undefined) throw new Error(`El JSON declara valores contradictorios para ${key}. Revisa sus metadatos.`);
          metadata[key] = value;
        }
      }
      metadata = { ...metadata, ...rootMetadata };
      parsed = object.samples ?? object.discharge_samples ?? object.telemetry ?? object.data ?? object.rows;
    }
    if (!Array.isArray(parsed) || parsed.length < 2 || parsed.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw new Error("El JSON debe contener una lista de al menos dos mediciones, directamente o dentro de samples, discharge_samples, telemetry, data o rows.");
    }
    parsed = parsed.map(row => ({ ...metadata, ...row }));
    const fields = [...new Set((parsed as Record<string, unknown>[]).flatMap((row) => Object.keys(row)))];
    return { fields, rows: (parsed as Record<string, unknown>[]).map((row) => Object.fromEntries(fields.map((field) => [field, row[field] == null ? "" : String(row[field])]))) };
  }
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const parseErrors = result.errors.filter(error => error.code !== "UndetectableDelimiter");
  if (parseErrors.length) {
    throw new Error(`No fue posible leer el CSV: ${parseErrors[0].message}`);
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
  cycle: ["charge_cycles", "cycle", "cycle_index", "cycle_number", "cycle_count", "cycle_counter", "cycle_id", "cycle_no", "cycle_num", "discharge_cycle", "discharge_cycles", "discharge_cycle_index", "discharge_cycle_number", "ciclo", "ciclos", "ciclo_actual", "numero_ciclo", "numero_de_ciclo", "n_ciclo", "ciclo_descarga", "ciclo_de_descarga", "contador_ciclos"],
  mode: ["operating_mode", "mode", "estado_operacion", "modo", "step_type", "operation", "phase"],
  ambient: ["ambient_temp_c", "ambient_temperature_c", "ambient_temperature", "temperatura_ambiente_c", "temperatura_ambiente", "ambient_temp_f", "ambient_temperature_f", "temperatura_ambiente_f", "ambient_temp_k", "ambient_temperature_k", "temperatura_ambiente_k"],
};

export function parseContextNumber(raw: string, field: string, kind: "temperature" | "temperature_delta" | "voltage" | "resistance"): number | undefined {
  const match = raw.trim().replace(/\u2212/g, "-").match(/^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*([a-zA-Z°Ωω\s]*)$/i);
  if (!match) return undefined;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  const explicit = normalize(match[2].replace(/[Ωω]/g, "ohm"));
  const name = normalize(field);
  if (kind === "temperature" || kind === "temperature_delta") {
    if (explicit && !["c", "f", "k", "degc", "degf"].includes(explicit)) return undefined;
    const unit = explicit || (name.endsWith("f") ? "f" : name.endsWith("k") ? "k" : "c");
    if (unit === "f" || unit === "degf") return (kind === "temperature_delta" ? value : value - 32) * 5 / 9;
    return unit === "k" && kind !== "temperature_delta" ? value - 273.15 : value;
  }
  if (kind === "voltage") {
    if (explicit && !["v", "mv"].includes(explicit)) return undefined;
    return (explicit || (name.endsWith("mv") ? "mv" : "v")) === "mv" ? value / 1000 : value;
  }
  if (explicit && !["ohm", "mohm"].includes(explicit)) return undefined;
  return (explicit || (name.endsWith("mohm") ? "mohm" : "ohm")) === "mohm" ? value / 1000 : value;
}
export function getCycleColumns(data: CsvData): string[] {
  return data.fields.filter(field => metadataAliases.cycle.some(alias => normalize(alias) === normalize(field)));
}
function metadataField(data: CsvData, kind: keyof typeof metadataAliases, options?: Pick<ImportOptions, "cycleColumn">): string | undefined {
  if (kind === "cycle" && options?.cycleColumn) return data.fields.includes(options.cycleColumn) ? options.cycleColumn : undefined;
  const fields = data.fields.filter(field => metadataAliases[kind].some(alias => normalize(alias) === normalize(field)));
  return fields.length === 1 ? fields[0] : undefined;
}
export function parseCycleNumber(raw: string | undefined): number | undefined {
  const text = (raw ?? "").trim().replace(/^(?:cycle|ciclo)(?:[ _-]*(?:number|index|de descarga|descarga))?\s*[:#_-]?\s*/i, "");
  if (!/^[+]?\d+(?:[.,]0+)?$/.test(text)) return undefined;
  const value = Number(text.replace(",", "."));
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}
export interface TelemetrySegment {
  id: string;
  label: string;
  mode: string;
  rows: CsvData["rows"];
  cycle?: number;
  battery?: string;
  timeReset?: boolean;
}
export function isDischarge(mode: string): boolean {
  return ["driving", "discharge", "discharging", "descarga", "conduccion", "drive"].includes(normalize(mode));
}
export function getTelemetrySegments(data: CsvData, options?: Pick<ImportOptions, "cycleColumn" | "mapping">): TelemetrySegment[] {
  const battery = metadataField(data, "battery");
  const cycle = metadataField(data, "cycle", options);
  const mode = metadataField(data, "mode");
  const time = options?.mapping.time_s || detectImportOptions(data.fields).mapping.time_s;
  const elapsed = (row: CsvData["rows"][number] | undefined): number | undefined => {
    const raw = time ? row?.[time]?.trim().replace(",", ".") : undefined;
    if (!raw || !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const groups = new Map<string, CsvData["rows"]>();
  for (const row of data.rows) {
    const key = JSON.stringify([battery ? row[battery] : "", cycle ? parseCycleNumber(row[cycle]) ?? row[cycle] : ""]);
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  const segments: TelemetrySegment[] = [];
  for (const rows of groups.values()) {
    let segment: TelemetrySegment | undefined;
    let previousTime: number | undefined;
    let increasing = false;
    for (const [index, row] of rows.entries()) {
      const rowMode = mode ? row[mode] : "";
      const currentTime = elapsed(row);
      const nextTime = elapsed(rows[index + 1]);
      // A fresh zero followed by another reading after an increasing recording
      // that began at zero is evidence of a restart, not an absolute cycle ID.
      // An isolated zero in unsorted rows is left for normal chronological sorting.
      const timeReset = !!segment && elapsed(segment.rows[0]) === 0 && increasing && currentTime === 0 && previousTime !== undefined && previousTime > 0 && nextTime !== undefined && nextTime > 0;
      if (!segment || segment.mode !== rowMode || timeReset) {
        const label = [battery && row[battery], cycle && `Ciclo ${parseCycleNumber(row[cycle]) ?? row[cycle]}`, rowMode, `Tramo ${segments.length + 1}`].filter(Boolean).join(" · ");
        segment = { id: `segment-${segments.length}`, label, mode: rowMode, rows: [],
          cycle: cycle ? parseCycleNumber(row[cycle]) : undefined, battery: battery ? row[battery] : undefined, timeReset };
        segments.push(segment);
        increasing = false;
        previousTime = undefined;
      }
      segment.rows.push(row);
      increasing = currentTime !== undefined && previousTime !== undefined && currentTime > previousTime;
      previousTime = currentTime;
    }
  }
  return segments;
}
export function getDefaultImportOptions(data: CsvData): ImportOptions {
  const options = detectImportOptions(data.fields);
  const columns = getCycleColumns(data);
  if (columns.length === 1) options.cycleColumn = columns[0];
  const segments = getTelemetrySegments(data, options);
  const selected = segments.find((segment) => isDischarge(segment.mode)) ?? segments[0];
  const firstTime = selected?.rows[0]?.[options.mapping.time_s]?.trim();
  if (firstTime && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(firstTime)) options.timeUnit = "datetime";
  if (firstTime && /^\d+:\d{2}:\d{2}(?:[.,]\d+)?$/.test(firstTime)) options.timeUnit = "clock";
  if (options.timeUnit === "datetime" && firstTime && /^\d+(?:\.\d+)?$/.test(firstTime)) {
    options.timeUnit = firstTime.split(".")[0].length === 13 ? "ms" : "s";
  }
  return { ...options, segmentId: selected?.id, seriesCells: 1, parallelStrings: 1, invertCurrent: false };
}
export function getImportMetadata(data: CsvData, options: ImportOptions): { cycle?: number; ambient?: number; warnings: string[] } {
  const segments = getTelemetrySegments(data, options);
  const segment = segments.find((segment) => segment.id === options.segmentId);
  const rows = segment?.rows ?? data.rows;
  const uniqueNumber = (kind: "cycle" | "ambient") => {
    const field = metadataField(data, kind, options);
    if (!field) return undefined;
    const values = rows.map(row => row[field]?.trim()).filter(Boolean).map(value => kind === "cycle" ? parseCycleNumber(value) : parseContextNumber(value, field, "temperature"));
    if (!values.length || values.some(value => value === undefined || !Number.isFinite(value)) || new Set(values).size !== 1) return undefined;
    return values[0];
  };
  const warnings: string[] = [];
  if (getCycleColumns(data).length > 1 && !options.cycleColumn) warnings.push("Hay varias columnas de ciclo. Selecciona la que corresponde al contador de ciclos de descarga.");
  const cycleField = metadataField(data, "cycle", options);
  if (!cycleField) warnings.push("El archivo no declara un número de ciclo identificable. Introduce el ciclo registrado; las señales por sí solas no determinan el contador absoluto.");
  else if (uniqueNumber("cycle") === undefined) warnings.push("El ciclo del tramo no es un entero positivo único. Revisa la columna seleccionada y declara el ciclo registrado.");
  if (segments.some(item => item.timeReset)) warnings.push("Se separaron tramos por reinicios del tiempo. Su orden dentro del archivo no equivale al número absoluto de ciclo.");
  if (normalize(options.mapping.voltage_v).includes("pack") || normalize(options.mapping.current_a).includes("pack")) {
    warnings.push("Se detectaron medidas de un paquete. Las familias disponibles se entrenaron con celdas NASA. Sin validación propia del paquete, no se entrega una predicción; importar el archivo no valida su aplicabilidad.");
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
  if (options.cycleColumn && !data.fields.includes(options.cycleColumn)) throw new Error("La columna de ciclo seleccionada no existe en este archivo.");
  const { mapping } = options;
  for (const field of TELEMETRY_FIELDS) {
    if (!mapping[field] || !data.fields.includes(mapping[field])) {
      throw new Error(`Falta asignar la columna ${field}. Selecciona la columna correspondiente para poder analizar.`);
    }
  }
  if (new Set(Object.values(mapping)).size !== TELEMETRY_FIELDS.length) {
    throw new Error("Cada medición debe usar una columna diferente.");
  }
  if (getCycleColumns(data).length > 1 && !options.cycleColumn) throw new Error("Hay varias columnas de ciclo. Selecciona la columna de ciclo antes de analizar.");
  const segments = getTelemetrySegments(data, options);
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

export function recoverTelemetry(data: CsvData, options: ImportOptions): { samples: TelemetrySample[]; warnings: string[] } {
  const selected = getTelemetrySegments(data, options).find(segment => segment.id === options.segmentId);
  const rows = (selected?.rows ?? data.rows).map(row => ({ ...row }));
  const fields = [...data.fields];
  const adapted = { ...options, mapping: { ...options.mapping } };
  const warnings: string[] = [];
  if (![options.mapping.voltage_v, options.mapping.current_a].some(column => column && rows.some(row => row[column]?.trim()))) throw new Error("Se necesita al menos una señal eléctrica medida (voltaje o corriente). No se genera una batería enteramente ficticia.");
  for (const field of TELEMETRY_FIELDS) {
    let column = adapted.mapping[field];
    if (!column) {
      if (fields.filter(candidate => aliases[field].some(alias => normalize(alias) === normalize(candidate))).length > 1) throw new Error(`Hay columnas ambiguas para ${field}. Selecciona la columna correspondiente antes de analizar.`);
      column = `__simulated_${field}`;
      fields.push(column);
      adapted.mapping[field] = column;
      if (field === "time_s") adapted.timeUnit = "s";
      if (field === "voltage_v") adapted.voltageUnit = "V";
      if (field === "current_a") adapted.currentUnit = "A";
      if (field === "temperature_c") adapted.temperatureUnit = "C";
    }
    const values = rows.map((row, index) => {
      const raw = row[column]?.trim();
      if (!raw) return null;
      // Reject malformed measurements; only genuinely absent cells are recovered.
      if (field === "time_s" && ["datetime", "clock"].includes(adapted.timeUnit)) return index;
      return numberValue(raw, index + 2, column);
    });
    const known = values.flatMap((value, index) => value === null ? [] : [index]);
    const missing = values.filter(value => value === null).length;
    if (!missing) continue;
    if (field === "time_s" && known.length && ["datetime", "clock"].includes(adapted.timeUnit)) throw new Error("Faltan marcas de tiempo: completa las fechas o exporta tiempo numérico para interpolarlo.");
    let previous: number | undefined;
    let cursor = 0;
    for (let index = 0; index < rows.length; index++) {
      if (values[index] !== null) { previous = index; continue; }
      while (cursor < known.length && known[cursor] < index) cursor++;
      const next = known[cursor];
      let value: number;
      if (previous !== undefined && next !== undefined) {
        value = values[previous]! + (values[next]! - values[previous]!) * (index - previous) / (next - previous);
      } else if (known.length) {
        value = values[previous ?? next]!;
        if (field === "time_s") {
          const left = previous === undefined ? known[0] : known[Math.max(0, known.length - 2)];
          const right = previous === undefined ? known[Math.min(1, known.length - 1)] : known[known.length - 1];
          const slope = right === left ? 1 : (values[right]! - values[left]!) / (right - left);
          value = values[left]! + (index - left) * slope;
        }
      } else {
        value = field === "time_s" ? index : field === "voltage_v" ? (4.2 - 1.2 * index / Math.max(1, rows.length - 1)) * (options.seriesCells ?? 1)
          : field === "current_a" ? (options.invertCurrent ? 1 : -1) * (options.parallelStrings ?? 1) : 25;
      }
      rows[index][column] = String(value);
    }
    warnings.push(known.length
      ? `${field}: ${missing} datos ausentes interpolados por posición de fila; extremos ${field === "time_s" ? "extrapolados con el intervalo observado (o 1 unidad si solo hay un instante)" : "completados con el valor medido más cercano"}.`
      : `${field}: señal simulada (${field === "time_s" ? "intervalo supuesto de 1 segundo" : field === "voltage_v" ? "descenso supuesto de 4,2 a 3 V por celda" : field === "current_a" ? "descarga supuesta de 1 A por rama" : "temperatura supuesta de 25 °C"}).`);
  }
  if (warnings.length) warnings.unshift("ESCENARIO SIMULADO: contiene datos reconstruidos o supuestos. El SoH resultante no es una medición de la salud real de la batería.");
  return { samples: convertTelemetryCsv({ fields, rows }, { ...adapted, segmentId: undefined }), warnings };
}

export async function parseTelemetryCsv(file: File): Promise<TelemetrySample[]> {
  const data = readTelemetryCsv(await file.text());
  return convertTelemetryCsv(data, getDefaultImportOptions(data));
}
