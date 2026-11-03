import { getImportMetadata, getTelemetrySegments, parseContextNumber } from "./parseTelemetryCsv.ts";
import type { CsvData, ImportOptions } from "./parseTelemetryCsv";
import type { TelemetryIdentification } from "../types/telemetry";

const aliases = {
  cutoff: ["cutoff_voltage_v", "cutoff_voltage", "voltaje_corte", "voltaje_corte_v", "cutoff_voltage_mv", "voltaje_corte_mv", "discharge_cutoff_voltage"],
  level: ["measurement_level", "nivel_medicion", "nivel", "battery_level"],
  chemistry: ["chemistry", "quimica", "quimica_bateria", "battery_chemistry", "tipo_quimica"],
  re: ["re_ohm", "Re_prev", "resistencia_ohmica", "re_mohm"],
  rct: ["rct_ohm", "Rct_prev", "rct_mohm"],
  chargeStart: ["charge_temp_start_prev", "temperature_start_c"],
  chargeMax: ["charge_temp_max_prev", "temperature_max_c"],
  chargeDelta: ["charge_temp_delta_prev", "temperature_delta_c"],
};
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function detectBatteryParameters(data: CsvData, options: ImportOptions): Record<string, string> {
  const rows = getTelemetrySegments(data, options).find(segment => segment.id === options.segmentId)?.rows ?? data.rows;
  const metadata = getImportMetadata(data, options);
  const result: Record<string, string> = {};
  if (metadata.cycle !== undefined) result.cycle = String(metadata.cycle);
  if (metadata.ambient !== undefined) result.ambient = String(metadata.ambient);
  for (const [key, names] of Object.entries(aliases)) {
    const columns = data.fields.filter(field => names.some(name => normalize(name) === normalize(field)));
    if (columns.length !== 1) continue;
    const values = [...new Set(rows.map(row => (row[columns[0]] ?? "").trim()).filter(Boolean))];
    if (values.length !== 1) continue;
    const value = values[0];
    if (key === "level") {
      const levels: Record<string, string> = { cell: "cell", celda: "cell", singlecell: "cell", module: "module", modulo: "module", pack: "pack", batterypack: "pack", paquete: "pack" };
      if (levels[normalize(value)]) result[key] = levels[normalize(value)];
    } else if (key === "chemistry") {
      const chemistries: Record<string, string> = { liion: "li-ion", lithiumion: "li-ion", ionlitio: "li-ion", ionesdelitio: "li-ion", litioion: "li-ion", lfp: "LFP", lifepo4: "LFP", leadacid: "lead-acid", plomoacido: "lead-acid", other: "other", otra: "other" };
      if (chemistries[normalize(value)]) result[key] = chemistries[normalize(value)];
    } else {
      const kind = key === "cutoff" ? "voltage" : key === "re" || key === "rct" ? "resistance" : key === "chargeDelta" ? "temperature_delta" : "temperature";
      const number = parseContextNumber(value, columns[0], kind);
      if (number !== undefined && (key !== "cutoff" || number > 0)) result[key] = String(number);
    }
  }
  return result;
}

export function mergeIdentifiedParameters(declared: Record<string, string>, identity: TelemetryIdentification): Record<string, string> {
  const result = { ...declared };
  if (!identity.matched || !identity.reference) return result;
  const keys = { cycle: "cycle", ambient_temperature_c: "ambient", cutoff_voltage_v: "cutoff",
    measurement_level: "level", chemistry: "chemistry" } as const;
  for (const [source, target] of Object.entries(keys)) {
    const value = identity.context[source as keyof typeof keys];
    if (value !== undefined) result[target] = String(value);
  }
  return result;
}
