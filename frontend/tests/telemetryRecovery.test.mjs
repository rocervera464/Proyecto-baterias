import test from 'node:test';
import assert from 'node:assert/strict';
import { readTelemetryCsv, getDefaultImportOptions, convertTelemetryCsv, recoverTelemetry } from '../src/utils/parseTelemetryCsv.ts';

const recover = text => {
  const data = readTelemetryCsv(text);
  return recoverTelemetry(data, getDefaultImportOptions(data));
};

test('complete telemetry is unchanged and does not receive simulation warnings', () => {
  const data = readTelemetryCsv('time_s,voltage_v,current_a,temperature_c\n0,4.1,-1,25\n60,4,-1,26');
  const options = getDefaultImportOptions(data);
  assert.deepEqual(recoverTelemetry(data, options), { samples: convertTelemetryCsv(data, options), warnings: [] });
});

test('missing columns produce disclosed synthetic signals', () => {
  const result = recover('voltage_v\n4.1\n4');
  assert.deepEqual(result.samples.map(s => s.time_s), [0, 1]);
  assert.equal(result.samples[0].current_a, -1);
  assert.equal(result.samples[0].temperature_c, 25);
  assert.match(result.warnings[0], /ESCENARIO SIMULADO/);
});

test('interpolation preserves measurements and does not mutate the source', () => {
  const data = readTelemetryCsv('time_s,voltage_v,current_a,temperature_c\n0,4.2,-1,25\n30,,-1,\n60,4,-1,27');
  const original = structuredClone(data);
  const result = recoverTelemetry(data, getDefaultImportOptions(data));
  assert.ok(Math.abs(result.samples[1].voltage_v - 4.1) < 1e-10);
  assert.equal(result.samples[1].temperature_c, 26);
  assert.deepEqual(data, original);
});

test('invalid measurements and fully synthetic batteries are rejected', () => {
  assert.throws(() => recover('time_s,voltage_v\n0,NaN\n1,4'), /número válido/);
  assert.throws(() => recover('time_s,temperature_c\n0,25\n1,26'), /señal eléctrica/);
});

test('selected cycles are recovered independently', () => {
  const data = readTelemetryCsv('cycle,time_s,voltage_v\n1,0,4.2\n1,60,4\n2,0,3.8\n2,60,3.6');
  const result = recoverTelemetry(data, { ...getDefaultImportOptions(data), segmentId: 'segment-1' });
  assert.deepEqual(result.samples.map(s => s.voltage_v), [3.8, 3.6]);
});

test('simulation respects declared scaling', () => {
  const data = readTelemetryCsv('time_s,current_ma\n0,-1000\n60,-1000');
  const result = recoverTelemetry(data, { ...getDefaultImportOptions(data), seriesCells: 10 });
  assert.equal(result.samples[0].voltage_v, 4.2);
  assert.equal(result.samples[0].current_a, -1);
});
