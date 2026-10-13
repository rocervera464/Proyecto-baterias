import assert from 'node:assert/strict';
import test from 'node:test';
import { readTelemetryCsv, detectImportOptions, convertTelemetryCsv } from '../src/utils/parseTelemetryCsv.ts';

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
  assert.throws(() => convertTelemetryCsv(data, options), /Asigna/);
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
