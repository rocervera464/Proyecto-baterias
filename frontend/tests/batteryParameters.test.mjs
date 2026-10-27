import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBatteryParameters } from '../src/utils/batteryParameters.ts';
import { readTelemetryCsv, getDefaultImportOptions, getTelemetrySegments } from '../src/utils/parseTelemetryCsv.ts';

test('detects declared parameters in Spanish with decimal commas and preserves unknowns', () => {
  const data = readTelemetryCsv('tiempo;voltaje;ciclo;temperatura_ambiente_c;voltaje_corte;quimica;nivel\n0;4;8;24;2,7;LFP;paquete\n300;3;8;24;2,7;LFP;paquete');
  assert.deepEqual(detectBatteryParameters(data, getDefaultImportOptions(data)), { cycle: '8', ambient: '24', cutoff: '2.7', chemistry: 'LFP', level: 'pack' });
});

test('uses the selected cycle and does not choose between conflicting cutoff values', () => {
  const data = readTelemetryCsv('time_s,voltage_v,cycle,cutoff_voltage_v\n0,4,1,2.2\n300,3,1,2.2\n0,4,2,2.5\n300,3,2,2.7');
  const options = getDefaultImportOptions(data);
  assert.equal(detectBatteryParameters(data, options).cutoff, '2.2');
  const detected = detectBatteryParameters(data, { ...options, segmentId: getTelemetrySegments(data)[1].id });
  assert.equal(detected.cycle, '2');
  assert.equal(detected.cutoff, undefined);
});

test('retains top-level JSON metadata when reading measurement envelopes', () => {
  const data = readTelemetryCsv(JSON.stringify({ cycle: 12, ambient_temperature_c: 23, cutoff_voltage_v: 2.5, discharge_samples: [{ time_s: 0, voltage_v: 4 }, { time_s: 300, voltage_v: 3 }] }));
  assert.deepEqual(detectBatteryParameters(data, getDefaultImportOptions(data)), { cycle: '12', ambient: '23', cutoff: '2.5' });
});
