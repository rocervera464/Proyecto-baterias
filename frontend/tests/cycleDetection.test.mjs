import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readTelemetryCsv, getDefaultImportOptions, getTelemetrySegments, getImportMetadata, convertTelemetryCsv } from '../src/utils/parseTelemetryCsv.ts';
import { detectBatteryParameters } from '../src/utils/batteryParameters.ts';

test('recognizes cycle counter aliases and selects the real cycle for each discharge', () => {
  for (const column of ['Cycle_Count', 'Cycle ID', 'Discharge_Cycle', 'Discharge Cycle Number', 'Número de ciclo', 'Ciclo de descarga', 'Cycle_Index']) {
    const data = readTelemetryCsv(`${column},time_s,voltage_v,current_a,temperature_c\n45,0,4,-1,25\n45,300,3.9,-1,26\n72,0,3.8,-1,27\n72,300,3.7,-1,28`);
    const options = getDefaultImportOptions(data);
    const segments = getTelemetrySegments(data, options);
    assert.equal(segments.length, 2);
    assert.equal(detectBatteryParameters(data, options).cycle, '45');
    const next = { ...options, segmentId: segments[1].id };
    assert.equal(detectBatteryParameters(data, next).cycle, '72');
    assert.equal(convertTelemetryCsv(data, next)[0].voltage_v, 3.8);
  }
});

test('the real sample file identifies discharge cycle 168 rather than defaulting to one', () => {
  const data = readTelemetryCsv(readFileSync(new URL('../../data/samples/telemetria_real_B0006_ciclo_168.csv', import.meta.url), 'utf8'));
  assert.equal(detectBatteryParameters(data, getDefaultImportOptions(data)).cycle, '168');
});

test('an explicitly mapped custom cycle column drives both segmentation and metadata', () => {
  const data = readTelemetryCsv('contador_ensayo,time_s,voltage_v,current_a,temperature_c\nCiclo 12,0,4,-1,25\n12.0,300,3.9,-1,26\nCiclo 22,0,3.8,-1,27\n22,300,3.7,-1,28');
  const options = { ...getDefaultImportOptions(data), cycleColumn: 'contador_ensayo' };
  const segments = getTelemetrySegments(data, options);
  assert.equal(segments.length, 2);
  assert.equal(getImportMetadata(data, { ...options, segmentId: segments[0].id }).cycle, 12);
  assert.equal(getImportMetadata(data, { ...options, segmentId: segments[1].id }).cycle, 22);
});

test('conflicting cycle columns require a selection instead of taking the first header', () => {
  const data = readTelemetryCsv('cycle,cycle_count,time_s,voltage_v,current_a,temperature_c\n4,80,0,4,-1,25\n4,80,300,3.9,-1,26');
  const options = getDefaultImportOptions(data);
  assert.equal(detectBatteryParameters(data, options).cycle, undefined);
  assert.throws(() => convertTelemetryCsv(data, options), /varias columnas de ciclo/);
  assert.equal(detectBatteryParameters(data, { ...options, cycleColumn: 'cycle_count' }).cycle, '80');
});

test('time resets separate recordings without inventing absolute cycle numbers', () => {
  const data = readTelemetryCsv('time_s,voltage_v,current_a,temperature_c\n0,4,-1,25\n300,3.9,-1,26\n0,3.8,-1,27\n300,3.7,-1,28');
  const options = getDefaultImportOptions(data);
  const segments = getTelemetrySegments(data, options);
  assert.equal(segments.length, 2);
  assert.equal(segments[1].timeReset, true);
  assert.equal(detectBatteryParameters(data, options).cycle, undefined);
  assert.equal(convertTelemetryCsv(data, options).length, 2);
  assert.equal(convertTelemetryCsv(data, { ...options, segmentId: segments[1].id })[0].voltage_v, 3.8);
  assert.match(getImportMetadata(data, options).warnings.join(' '), /número absoluto/);
});

test('zero, fractional and invalid counters are not silently incremented or replaced', () => {
  for (const cycle of ['0', '-1', '2.5', 'unknown']) {
    const data = readTelemetryCsv(`cycle_count,time_s,voltage_v,current_a,temperature_c\n${cycle},0,4,-1,25\n${cycle},300,3.9,-1,26`);
    assert.equal(detectBatteryParameters(data, getDefaultImportOptions(data)).cycle, undefined);
  }
});

test('cycle counters remain separated by battery identity', () => {
  const data = readTelemetryCsv('battery_id,cycle_count,time_s,voltage_v,current_a,temperature_c\nA,8,0,4,-1,25\nB,8,0,3.8,-1,27\nA,8,300,3.9,-1,26\nB,8,300,3.7,-1,28');
  const options = getDefaultImportOptions(data);
  const segments = getTelemetrySegments(data, options);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments.map(segment => segment.battery), ['A', 'B']);
  assert.equal(convertTelemetryCsv(data, { ...options, segmentId: segments[1].id })[0].voltage_v, 3.8);
});

test('a late zero in unsorted readings does not invent another discharge', () => {
  const data = readTelemetryCsv('time_s,voltage_v,current_a,temperature_c\n60,3.9,-1,26\n300,3.8,-1,27\n0,4,-1,25');
  const options = getDefaultImportOptions(data);
  assert.equal(getTelemetrySegments(data, options).length, 1);
  assert.equal(convertTelemetryCsv(data, options).length, 3);
  assert.equal(convertTelemetryCsv(data, options)[0].voltage_v, 4);
  assert.throws(() => convertTelemetryCsv(data, { ...options, cycleColumn: 'missing' }), /columna de ciclo/);
});
