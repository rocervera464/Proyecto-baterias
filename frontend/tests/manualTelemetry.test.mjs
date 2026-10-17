import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManualTelemetry, parseManualPaste, manualImportOptions } from '../src/utils/manualTelemetry.ts';
import { readTelemetryCsv, convertTelemetryCsv } from '../src/utils/parseTelemetryCsv.ts';
import { validatePrediction } from '../src/utils/validatePrediction.ts';

const rows = [
  { time_s: '300', voltage_v: '3,80', current_a: '-1', temperature_c: '29' },
  { time_s: '0', voltage_v: '4,10', current_a: '-1,01', temperature_c: '25' },
];
test('manual and CSV paths produce identical samples without changing input rows', () => {
  const original = structuredClone(rows);
  const csv = 'time_s,voltage_v,current_a,temperature_c\n300,3.80,-1,29\n0,4.10,-1.01,25';
  assert.deepEqual(validateManualTelemetry(rows).samples, convertTelemetryCsv(readTelemetryCsv(csv), manualImportOptions));
  assert.deepEqual(rows, original);
});
test('minimum is two distinct instants within 0–300, not six rows or full coverage', () => {
  const two = rows.map((row, i) => ({ ...row, time_s: String(i * 60) }));
  assert.equal(validateManualTelemetry(two).error, null);
  assert.ok(validateManualTelemetry(two).warnings.some(message => message.includes('No se alcanza')));
  assert.ok(validateManualTelemetry([two[0]]).error);
  assert.ok(validateManualTelemetry(two.map(row => ({ ...row, time_s: '0' }))).error);
  assert.ok(validateManualTelemetry(two.map((row, i) => ({ ...row, time_s: String(301 + i) }))).error);
});
test('all rows must be finite and complete, including rows outside the window', () => {
  for (const [field, value] of [['time_s', '-1'], ['voltage_v', '0'], ['current_a', 'Infinity'], ['temperature_c', ''], ['voltage_v', 'NaN']]) {
    const invalid = [...rows, { ...rows[0], time_s: '400', [field]: value }];
    const result = validateManualTelemetry(invalid);
    assert.ok(result.error);
    assert.equal(result.samples.length, 0);
    assert.ok(result.errors[`2-${field}`]);
  }
});
test('repeated instants follow CSV rules and issue a warning without silent deduplication', () => {
  const result = validateManualTelemetry([...rows, rows[0]]);
  assert.equal(result.samples.length, 3);
  assert.ok(result.warnings.some(message => message.includes('repetidos')));
});
test('paste supports Excel tabs and decimal commas, headers and semicolon CSV', () => {
  assert.equal(parseManualPaste('0\t4,1\t-1\t25\n60\t4,0\t-1\t26')[0].voltage_v, '4,1');
  assert.equal(parseManualPaste('time_s;voltage_v;current_a;temperature_c\n0;4,1;-1;25\n60;4,0;-1;26').length, 2);
  assert.throws(() => parseManualPaste('0\t4,1\t25\n60\t4,0\t26'), /cuatro columnas/);
});
test('API response validation rejects missing horizons and invalid values', () => {
  const valid = { status: 'success', model_family: 'XGBoost', current_cycle: 25, current_soh_percent: 90,
    future_predictions: [5, 10, 20, 30].map(h => ({ horizon_cycles: h, target_cycle: 25 + h, predicted_soh_percent: 88, experimental: h >= 20 })) };
  assert.equal(validatePrediction(valid, 25), valid);
  assert.throws(() => validatePrediction({ ...valid, future_predictions: [] }, 25), /incompleta/);
  assert.throws(() => validatePrediction({ ...valid, current_soh_percent: Infinity }, 25), /inválidos/);
  assert.throws(() => validatePrediction(valid, 26), /incompleta/);
});
