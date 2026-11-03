import test from 'node:test';
import assert from 'node:assert/strict';
import { predictBattery, CompatibilityError } from '../src/services/api.ts';

const input = () => ({ cycle: 30, ambient_temperature_c: 22, cutoff_voltage_v: 2.2,
  measurement_level: 'cell', chemistry: 'li-ion', discharge_samples: [
    { time_s: 0, voltage_v: 4.18, current_a: -1.02, temperature_c: 24.5 },
    { time_s: 300, voltage_v: 3.7, current_a: -1, temperature_c: 26.5 },
  ] });
const report = (allowed = false) => ({ status: allowed ? 'within_observed_ranges' : 'out_of_range',
  model_id: 'nasa_room_2a', can_estimate_in_strict_mode: allowed,
  message: allowed ? null : 'Temperatura ambiente: 22 °C. También quedan fuera de rango señales de corriente.',
  reasons: [], quality_warnings: [], feature_deviations: [], limitation: 'Rangos observados en entrenamiento.' });

test('incompatible CSV measurements are checked once without posting a rejected prediction or changing inputs', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, payload: JSON.parse(options.body) });
    return Response.json(report());
  });
  const telemetry = input();
  const before = structuredClone(telemetry);
  await assert.rejects(predictBattery(telemetry), error => error instanceof CompatibilityError && /22.*corriente/.test(error.message));
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/telemetry/compatibility'));
  assert.deepEqual(calls[0].payload, before);
  assert.deepEqual(telemetry, before);
});

test('compatible telemetry reaches the model and preserves its exact prediction', async t => {
  const calls = [];
  const prediction = { status: 'success', model_family: 'XGBoost', current_cycle: 30,
    current_soh_percent: 81.64468383789062, production_horizons: [], future_predictions: [] };
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    return Response.json(url.endsWith('/compatibility') ? report(true) : prediction);
  });
  assert.deepEqual(await predictBattery(input()), prediction);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith('/api/v1/predict'));
});

test('a broken compatibility service never triggers a prediction', async t => {
  for (const response of [Response.json({ detail: 'Modelos no disponibles' }, { status: 503 }),
    new Response('Bad gateway', { status: 502 }), Response.json(null), Response.json({ ...report(), can_estimate_in_strict_mode: true })]) {
    const calls = [];
    const mocked = t.mock.method(globalThis, 'fetch', async url => { calls.push(url); return response; });
    await assert.rejects(predictBattery(input()), error => !(error instanceof CompatibilityError));
    assert.equal(calls.length, 1);
    mocked.mock.restore();
  }
});
