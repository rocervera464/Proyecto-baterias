import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyBatteryData, buildTelemetryRequest } from '../src/utils/prepareTelemetryAnalysis.ts';

const samples = [{ time_s: 0, voltage_v: 4.1, current_a: -1, temperature_c: 4 },
  { time_s: 300, voltage_v: 3.8, current_a: -1, temperature_c: 5 }];
const context = { cycle: 30, ambient_temperature_c: 4, cutoff_voltage_v: 2, measurement_level: 'cell', chemistry: 'li-ion' };
const declared = { cycle: '30', ambient: '4', cutoff: '2', level: 'cell', chemistry: 'li-ion' };
const unmatched = { matched: false, reference: null, context: {}, discharge_samples: samples, adjustments: [] };

test('the first analysis builds its request from newly identified fields without previous form state', async () => {
  const result = await identifyBatteryData(samples, {}, async () => ({ ...unmatched, matched: true,
    reference: { battery_id: 'B0045', cycle: 30, source_sha256: 'a'.repeat(64) }, context }));
  assert.deepEqual(buildTelemetryRequest(result.parameters, result.samples), { ...context, analysis_mode: 'strict', discharge_samples: samples });
});

test('declared metadata is enough to continue when a reference cannot be identified', async () => {
  const result = await identifyBatteryData(samples, declared, async () => unmatched);
  assert.equal(result.lookupFailed, false);
  assert.equal(buildTelemetryRequest(result.parameters, result.samples).cycle, 30);
});

test('missing fields pause prediction and can be completed for the next analysis', async () => {
  const result = await identifyBatteryData(samples, {}, async () => unmatched);
  assert.deepEqual(result.parameters, {});
  assert.throws(() => buildTelemetryRequest(result.parameters, result.samples), /Completa los datos del ensayo/);
  const next = await identifyBatteryData(samples, declared, async () => unmatched);
  assert.equal(buildTelemetryRequest(next.parameters, next.samples).cutoff_voltage_v, 2);
});

test('a failed lookup preserves declared data and does not invent missing metadata', async () => {
  const fail = async () => { throw new Error('offline'); };
  const known = await identifyBatteryData(samples, declared, fail);
  assert.equal(known.lookupFailed, true);
  assert.equal(buildTelemetryRequest(known.parameters, known.samples).ambient_temperature_c, 4);
  const unknown = await identifyBatteryData(samples, {}, fail);
  assert.throws(() => buildTelemetryRequest(unknown.parameters, unknown.samples));
});

test('verified unit corrections reach the prediction and preserve original inputs', async () => {
  const original = structuredClone(samples);
  const scaled = samples.map(sample => ({ ...sample, voltage_v: sample.voltage_v * 1000 }));
  const result = await identifyBatteryData(scaled, {}, async () => ({ ...unmatched, matched: true,
    reference: { battery_id: 'B0045', cycle: 30, source_sha256: 'a'.repeat(64) }, context, discharge_samples: samples }));
  assert.equal(buildTelemetryRequest(result.parameters, result.samples).discharge_samples[0].voltage_v, 4.1);
  assert.deepEqual(samples, original);
  assert.equal(scaled[0].voltage_v, 4100);
});

test('invalid general and optional data cannot bypass form validation', () => {
  for (const parameters of [{ ...declared, cycle: '0' }, { ...declared, ambient: 'NaN' },
    { ...declared, cutoff: '0' }, { ...declared, level: 'unknown' }, { ...declared, chemistry: 'invalid' },
    { ...declared, re: 'Infinity' }]) {
    assert.throws(() => buildTelemetryRequest(parameters, samples));
  }
  const request = buildTelemetryRequest({ ...declared, re: '.1', chargeDelta: '0' }, samples);
  assert.deepEqual(request.previous_eis, { re_ohm: .1, rct_ohm: null });
  assert.equal(request.previous_charge.temperature_delta_c, 0);
});
