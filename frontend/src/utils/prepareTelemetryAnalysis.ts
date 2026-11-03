import { mergeIdentifiedParameters } from "./batteryParameters.ts";
import type { TelemetryIdentification, TelemetryRequest, TelemetrySample } from "../types/telemetry";

export async function identifyBatteryData(
  samples: TelemetrySample[],
  declared: Record<string, string>,
  identify: (samples: TelemetrySample[]) => Promise<TelemetryIdentification>,
) {
  let identity: TelemetryIdentification | null = null;
  let lookupFailed = false;
  try { identity = await identify(samples); }
  catch { lookupFailed = true; }
  return {
    parameters: identity ? mergeIdentifiedParameters(declared, identity) : { ...declared },
    samples: identity?.matched ? identity.discharge_samples : samples,
    identity, lookupFailed,
  };
}

export function buildTelemetryRequest(parameters: Record<string, string>, samples: TelemetrySample[]): TelemetryRequest {
  const required = ["cycle", "ambient", "cutoff", "level", "chemistry"];
  if (required.some(key => !parameters[key]?.trim() || parameters[key] === "unknown")) {
    throw new Error("Completa los datos del ensayo que no se pudieron identificar y vuelve a pulsar «Analizar batería».");
  }
  const cycle = Number(parameters.cycle), ambient = Number(parameters.ambient), cutoff = Number(parameters.cutoff);
  if (!Number.isInteger(cycle) || cycle < 1 || !Number.isFinite(ambient) || !Number.isFinite(cutoff) || cutoff <= 0) {
    throw new Error("Revisa el ciclo, la temperatura ambiente y el voltaje de corte: deben ser números válidos.");
  }
  if (!["cell", "module", "pack"].includes(parameters.level) || !["li-ion", "LFP", "lead-acid", "other"].includes(parameters.chemistry)) {
    throw new Error("Selecciona un nivel de medición y una química válidos.");
  }
  const optional = (key: string) => {
    if (!parameters[key]?.trim()) return null;
    const value = Number(parameters[key]);
    if (!Number.isFinite(value)) throw new Error("Los datos opcionales del ensayo deben ser números finitos.");
    return value;
  };
  const request: TelemetryRequest = {
    cycle, ambient_temperature_c: ambient, cutoff_voltage_v: cutoff,
    measurement_level: parameters.level as TelemetryRequest["measurement_level"],
    chemistry: parameters.chemistry as TelemetryRequest["chemistry"],
    analysis_mode: "strict", discharge_samples: samples,
  };
  if (parameters.re || parameters.rct) request.previous_eis = { re_ohm: optional("re"), rct_ohm: optional("rct") };
  if (parameters.chargeStart || parameters.chargeMax || parameters.chargeDelta) {
    request.previous_charge = { temperature_start_c: optional("chargeStart"), temperature_max_c: optional("chargeMax"), temperature_delta_c: optional("chargeDelta") };
  }
  return request;
}
