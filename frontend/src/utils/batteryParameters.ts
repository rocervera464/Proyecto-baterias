import { getImportMetadata, getTelemetrySegments } from "./parseTelemetryCsv.ts";
import type { CsvData, ImportOptions } from "./parseTelemetryCsv";

const aliases = {
  cutoff: ["cutoff_voltage_v", "cutoff_voltage", "voltaje_corte", "voltaje_corte_v"],
  level: ["measurement_level", "nivel_medicion", "nivel"],
  chemistry: ["chemistry", "quimica", "quimica_bateria"],
  re: ["re_ohm", "Re_prev", "resistencia_ohmica"],
  rct: ["rct_ohm", "Rct_prev"],
  chargeStart: ["charge_temp_start_prev", "temperature_start_c"],
  chargeMax: ["charge_temp_max_prev", "temperature_max_c"],
  chargeDelta: ["charge_temp_delta_prev", "temperature_delta_c"],
};
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function detectBatteryParameters(data: CsvData, options: ImportOptions): Record<string, string> {
  const rows = getTelemetrySegments(data).find(segment => segment.id === options.segmentId)?.rows ?? data.rows;
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
      const levels: Record<string, string> = { cell: "cell", celda: "cell", module: "module", modulo: "module", pack: "pack", paquete: "pack" };
      if (levels[normalize(value)]) result[key] = levels[normalize(value)];
    } else if (key === "chemistry") {
      const chemistries: Record<string, string> = { liion: "li-ion", lfp: "LFP", leadacid: "lead-acid", plomoacido: "lead-acid", other: "other", otra: "other" };
      if (chemistries[normalize(value)]) result[key] = chemistries[normalize(value)];
    } else {
      const number = Number(value.replace(",", "."));
      if (Number.isFinite(number) && (key !== "cutoff" || number > 0)) result[key] = String(number);
    }
  }
  return result;
}
