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

test('normalizes declared context units and recognizes common chemistry names', () => {
  const data = readTelemetryCsv('time_s,voltage_v,cycle,ambient_temperature_f,cutoff_voltage_mv,measurement_level,battery_chemistry,re_mohm\n0,4,30,39.2,2000,single cell,Lithium-ion,100\n300,3.8,30,39.2,2000,single cell,Lithium-ion,100');
  const detected = detectBatteryParameters(data, getDefaultImportOptions(data));
  assert.ok(Math.abs(Number(detected.ambient) - 4) < 1e-10);
  assert.equal(detected.cutoff, '2');
  assert.equal(detected.re, '0.1');
  assert.equal(detected.level, 'cell');
  assert.equal(detected.chemistry, 'li-ion');
});

test('explicit value units convert without guessing from numerical magnitude', () => {
  const data = readTelemetryCsv('time_s;voltage_v;ambient_temperature;cutoff_voltage;chemistry\n0;4;277.15 K;2000 mV;Ion litio\n300;3.8;277.15 K;2000 mV;Ion litio');
  const detected = detectBatteryParameters(data, getDefaultImportOptions(data));
  assert.ok(Math.abs(Number(detected.ambient) - 4) < 1e-10);
  assert.equal(detected.cutoff, '2');
  assert.equal(detected.chemistry, 'li-ion');
  const plain = readTelemetryCsv('time_s,voltage_v,cutoff_voltage\n0,4,2000\n300,3.8,2000');
  assert.equal(detectBatteryParameters(plain, getDefaultImportOptions(plain)).cutoff, '2000');
});

test('reads metadata and previous history inside JSON envelopes', () => {
  const data = readTelemetryCsv(JSON.stringify({ metadata: { cycle: 72, ambient_temperature_c: 4, cutoff_voltage_v: 2 },
    battery: { chemistry: 'li-ion', measurement_level: 'cell' }, previous_eis: { re_ohm: .1, rct_ohm: .2 },
    discharge_samples: [{ time_s: 0, voltage_v: 4 }, { time_s: 300, voltage_v: 3.8 }] }));
  assert.deepEqual(detectBatteryParameters(data, getDefaultImportOptions(data)), { cycle: '72', ambient: '4', cutoff: '2', chemistry: 'li-ion', level: 'cell', re: '0.1', rct: '0.2' });
  assert.throws(() => readTelemetryCsv(JSON.stringify({ metadata: { cycle: 4 }, context: { cycle: 9 }, samples: [{ time_s: 0 }, { time_s: 300 }] })), /contradictorios/);
});
