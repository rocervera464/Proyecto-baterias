import test from 'node:test';
import assert from 'node:assert/strict';
import { predictBattery, importTelemetryFile } from '../src/services/api.ts';
import { validatePrediction } from '../src/utils/validatePrediction.ts';

const summary = { samples_detected: 22, samples_valid: 22, samples_used: 22, window_seconds: 300,
  variables_detected: ['time_s','voltage_v','current_a','temperature_c'], available_seconds: 290 };
const result = () => ({ status: 'success', model_family: 'XGBoost telemetry v4', model_id: 'nasa_cold_1a',
  current_cycle: null, current_soh_percent: 101.123456789, production_horizons: [], future_predictions: [], telemetry: summary });

test('telemetry-only results need no invented cycle and preserve values above the initial reference', () => {
  const response = result();
  const before = structuredClone(response);
  assert.equal(validatePrediction(response), response);
  assert.deepEqual(response, before);
  const future = { ...response, production_horizons: [5], future_predictions: [{ horizon_cycles: 5, target_cycle: null, predicted_soh_percent: 99.987654321 }] };
  assert.equal(validatePrediction(future), future);
});

test('v4 rejects fabricated cycles, missing telemetry counts and unapproved future outputs', () => {
  for (const value of [{ ...result(), current_cycle: 1 }, { ...result(), telemetry: undefined },
    { ...result(), current_soh_percent: 121 }, { ...result(), telemetry: { ...summary, samples_used: 3 } },
    { ...result(), future_predictions: [{ horizon_cycles: 30, target_cycle: null, predicted_soh_percent: 80 }] }]) {
    assert.throws(() => validatePrediction(value));
  }
});

test('enabled research horizons preserve real values and disclose their validation status', () => {
  const horizons = [5, 10, 20, 30];
  const response = { ...result(), research_horizons: horizons, forecast_horizons: horizons,
    forecast_note: 'Estimaciones con precisión limitada.',
    future_predictions: horizons.map((h, i) => ({ horizon_cycles: h, target_cycle: null,
      predicted_soh_percent: 98.7654321 - i, validation_status: 'research' })) };
  const before = structuredClone(response);
  assert.equal(validatePrediction(response), response);
  assert.deepEqual(response, before);
  for (const invalid of [
    { ...response, research_horizons: [] },
    { ...response, forecast_horizons: [5, 10] },
    { ...response, production_horizons: [5] },
    { ...response, future_predictions: response.future_predictions.map(item => ({ ...item, validation_status: 'production' })) },
  ]) assert.throws(() => validatePrediction(invalid));
});

test('minimal request reaches preflight and the model without injecting technical parameters', async t => {
  const calls = [];
  const report = { status: 'within_observed_ranges', can_estimate_in_strict_mode: true, reasons: [], quality_warnings: [], feature_deviations: [], limitation: 'Pilot validation' };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Response.json(url.endsWith('/compatibility') ? report : result());
  });
  const payload = { discharge_samples: [{ time_s: 0, voltage_v: 4, current_a: -1, temperature_c: 5 }] };
  assert.deepEqual(await predictBattery(payload), result());
  assert.deepEqual(calls.map(call => call.body), [payload, payload]);
});

test('all formats use the file parser and preserve sheet and discharge selection', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json({ fields: [], rows: [], sheets: [], warnings: [], selected_sheet: null });
  });
  const file = new File(['time_s,voltage_v,current_a,temperature_c'], 'test.csv');
  await importTelemetryFile(file, 'data', '1');
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('filename'), 'test.csv');
  assert.equal(url.searchParams.get('sheet'), 'data');
  assert.equal(url.searchParams.get('segment'), '1');
  assert.equal(calls[0].options.body, file);
});
