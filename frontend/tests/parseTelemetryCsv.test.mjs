import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readTelemetryCsv, detectImportOptions, convertTelemetryCsv, getDefaultImportOptions, getTelemetrySegments, getImportMetadata } from '../src/utils/parseTelemetryCsv.ts';

test('clock durations and Excel fractional days preserve the selected temporal units', () => {
  const data = readTelemetryCsv('time_s,voltage_v,current_a,temperature_c\n00:00:00,4.1,-1,25\n00:05:00,3.8,-1,26');
  assert.equal(getDefaultImportOptions(data).timeUnit, 'clock');
  assert.equal(convertTelemetryCsv(data, getDefaultImportOptions(data))[1].time_s, 300);
  const days = readTelemetryCsv('time_s,voltage_v,current_a,temperature_c\n0,4.1,-1,25\n0.003472222222222222,3.8,-1,26');
  assert.equal(convertTelemetryCsv(days, { ...getDefaultImportOptions(days), timeUnit: 'd' })[1].time_s, 300);
  const invalid = readTelemetryCsv('time_s,voltage_v,current_a,temperature_c\n00:00:00,4.1,-1,25\n00:65:00,3.8,-1,26');
  assert.throws(() => convertTelemetryCsv(invalid, getDefaultImportOptions(invalid)), /menores que 60/);
});

function parse(text) {
  const data = readTelemetryCsv(text);
  return convertTelemetryCsv(data, detectImportOptions(data.fields));
}

test('Spanish headers, semicolon delimiter, decimal comma and extra columns', () => {
  const samples = parse('Tiempo (s);Voltaje (V);Corriente (A);Temperatura (C);SoC\n0;4,2;-2;25;90\n300;3,8;-2;26;80');
  assert.equal(samples[0].voltage_v, 4.2);
  assert.equal(samples[1].time_s, 300);
});

test('unit conversion and elapsed time from numeric origin', () => {
  const samples = parse('time_ms,voltage_mv,current_ma,temperature_f\n100000,4200,-2000,77\n400000,3800,-2000,86');
  assert.deepEqual(samples[0], { time_s: 0, voltage_v: 4.2, current_a: -2, temperature_c: 25 });
  assert.equal(samples[1].time_s, 300);
  assert.equal(samples[1].temperature_c, 30);
});

test('ISO timestamps sorted before calculating elapsed time', () => {
  const samples = parse('timestamp,voltage,current,temperature\n2026-10-12T10:05:00Z,3.8,-2,26\n2026-10-12T10:00:00Z,4.2,-2,25');
  assert.equal(samples[0].voltage_v, 4.2);
  assert.equal(samples[1].time_s, 300);
});

test('custom mapping for unknown column names with tabs', () => {
  const data = readTelemetryCsv('clock\tpotential\tamps\theat\n0\t4.2\t-2\t25\n300\t3.8\t-2\t26');
  const options = detectImportOptions(data.fields);
  assert.throws(() => convertTelemetryCsv(data, options), /Falta asignar la columna time_s/);
  options.mapping = { time_s: 'clock', voltage_v: 'potential', current_a: 'amps', temperature_c: 'heat' };
  assert.equal(convertTelemetryCsv(data, options).length, 2);
});

test('empty, nonfinite, negative time and nonpositive voltage rejected', () => {
  for (const row of ['0,4.2,,25', '0,4.2,Infinity,25', '-1,4.2,-2,25', '0,0,-2,25']) {
    assert.throws(() => parse(`time_s,voltage_v,current_a,temperature_c\n${row}\n300,3.8,-2,26`));
  }
});

test('retain elapsed origin and reject insufficient window samples', () => {
  const data = readTelemetryCsv('time_s,voltage_v,current_a,temperature_c\n500,4.2,-2,25\n600,3.8,-2,26');
  const options = detectImportOptions(data.fields);
  options.relativeTime = false;
  assert.throws(() => convertTelemetryCsv(data, options), /300 segundos/);
  options.relativeTime = true;
  assert.equal(convertTelemetryCsv(data, options)[0].time_s, 0);
});

test('ambiguous columns require selection and duplicate mapping is rejected', () => {
  const data = readTelemetryCsv('time,voltage,voltaje,current,temperature\n0,4.2,4.2,-2,25\n300,3.8,3.8,-2,26');
  const options = detectImportOptions(data.fields);
  assert.equal(options.mapping.voltage_v, '');
  options.mapping.voltage_v = 'current';
  assert.throws(() => convertTelemetryCsv(data, options), /diferente/);
});

test('malformed CSV and repeated timestamps rejected', () => {
  assert.throws(() => readTelemetryCsv('time,voltage,current,temperature\n0,4.2,-2,25,extra\n300,3.8,-2,26'));
  assert.throws(() => parse('time,voltage,current,temperature\n0,4.2,-2,25\n0,3.8,-2,26'), /instantes distintos/);
});

test('provided EV pack file imports its driving segment and real metadata without target leakage', () => {
  const data = readTelemetryCsv(readFileSync(new URL('../../data/samples/telemetria_pack_ejemplo.csv', import.meta.url), 'utf8'));
  const options = getDefaultImportOptions(data);
  const samples = convertTelemetryCsv(data, options);
  assert.equal(data.rows.length, 335);
  assert.equal(samples.length, 90);
  assert.equal(samples.filter((row) => row.time_s <= 300).length, 11);
  assert.deepEqual(samples[0], { time_s: 0, voltage_v: 389, current_a: 100.7, temperature_c: 32.4 });
  assert.equal(getImportMetadata(data, options).cycle, 412);
  assert.equal(getImportMetadata(data, options).ambient, 22);
  assert.equal(getTelemetrySegments(data).length, 6);
  assert.ok(getImportMetadata(data, options).warnings.some((warning) => /paquete/.test(warning)));
  const changed = { ...data, rows: data.rows.map((row) => ({ ...row, soh_pct: '10', soc_pct: '0' })) };
  assert.deepEqual(convertTelemetryCsv(changed, options), samples);
});

test('batteries, cycles and separate discharge sessions are never concatenated', () => {
  const data = readTelemetryCsv('vehicle_id,cycle,mode,time_s,voltage_v,current_a,temperature_c\nA,1,discharge,0,4,-1,25\nB,1,discharge,0,3,-1,25\nA,1,discharge,30,3.9,-1,26\nB,1,discharge,30,2.9,-1,26\nA,1,idle,60,4,0,25\nA,1,discharge,90,4,-1,25\nA,1,discharge,120,3.9,-1,26\nA,2,discharge,0,4,-1,25\nA,2,discharge,30,3.9,-1,26');
  const options = getDefaultImportOptions(data);
  assert.equal(convertTelemetryCsv(data, options).length, 2);
  assert.throws(() => convertTelemetryCsv(data, detectImportOptions(data.fields)), /Selecciona un tramo/);
  const idle = getTelemetrySegments(data).find((segment) => segment.mode === 'idle');
  assert.throws(() => convertTelemetryCsv(data, { ...options, segmentId: idle.id }), /carga o reposo/);
  assert.throws(() => convertTelemetryCsv(data, { ...options, segmentId: 'missing' }), /no est\u00e1 disponible/);
});

test('JSON arrays and known envelopes normalize exactly like CSV', () => {
  const rows = [{ time_s: 0, voltage_v: 4.2, current_a: -1, temperature_c: 25 }, { time_s: 300, voltage_v: 3.8, current_a: -1, temperature_c: 26 }];
  for (const value of [rows, { samples: rows }, { discharge_samples: rows }, { data: rows }]) {
    const data = readTelemetryCsv(JSON.stringify(value));
    assert.deepEqual(convertTelemetryCsv(data, getDefaultImportOptions(data)), rows);
  }
  assert.throws(() => readTelemetryCsv('{bad JSON'), /JSON/);
  assert.throws(() => readTelemetryCsv(JSON.stringify({ data: [1, 2] })), /mediciones/);
});

test('explicit pack scaling and polarity preserve regeneration and reject invalid divisors', () => {
  const data = readTelemetryCsv('time_s,pack_voltage_mv,pack_current_ma,temp_avg_f\n0,400000,20000,77\n300,380000,-10000,86');
  const options = { ...getDefaultImportOptions(data), seriesCells: 100, parallelStrings: 10, invertCurrent: true };
  assert.deepEqual(convertTelemetryCsv(data, options), [
    { time_s: 0, voltage_v: 4, current_a: -2, temperature_c: 25 },
    { time_s: 300, voltage_v: 3.8, current_a: 1, temperature_c: 30 },
  ]);
  for (const divisor of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => convertTelemetryCsv(data, { ...options, seriesCells: divisor }), /enteros/);
});

test('numeric Unix timestamps select seconds or milliseconds and preserve elapsed window', () => {
  for (const multiplier of [1, 1000]) {
    const data = readTelemetryCsv(`timestamp,voltage_v,current_a,temperature_c\n${1790834400 * multiplier},4,-1,25\n${1790834700 * multiplier},3.8,-1,26`);
    const options = getDefaultImportOptions(data);
    assert.equal(options.timeUnit, multiplier === 1 ? 's' : 'ms');
    assert.equal(convertTelemetryCsv(data, options)[1].time_s, 300);
  }
});

test('missing source signals and ambiguous aliases still need explicit mapping', () => {
  const data = readTelemetryCsv('time_s,soc_pct,soh_pct\n0,90,95\n300,80,94');
  assert.throws(() => convertTelemetryCsv(data, getDefaultImportOptions(data)), /voltage_v/);
  assert.equal(detectImportOptions(['time_s', 'pack_voltage_v', 'voltage_v', 'current_a', 'temp_avg_c']).mapping.voltage_v, '');
});
