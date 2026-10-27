import test from 'node:test';
import assert from 'node:assert/strict';
import { getManualStepIssue } from '../src/utils/manualWizard.ts';
import { emptyManualRow, validateManualTelemetry } from '../src/utils/manualTelemetry.ts';

test('progressive entry accepts a complete current step without fabricating later signals', () => {
  const rows = [emptyManualRow(), emptyManualRow()];
  assert.ok(getManualStepIssue(rows, 0));
  rows[0].time_s = '0'; rows[1].time_s = '60';
  assert.equal(getManualStepIssue(rows, 0), null);
  assert.ok(getManualStepIssue(rows, 1));
  assert.equal(validateManualTelemetry(rows).samples.length, 0);
  assert.equal(rows[0].voltage_v, '');
  rows[0].voltage_v = '4,1'; rows[1].voltage_v = '4';
  assert.equal(getManualStepIssue(rows, 1), null);
  assert.ok(getManualStepIssue(rows, 2));
});

test('time step requires distinct in-window readings, including after rows are removed', () => {
  const row = time_s => ({ ...emptyManualRow(), time_s });
  assert.ok(getManualStepIssue([row('0')], 0));
  assert.ok(getManualStepIssue([row('60'), row('60')], 0));
  assert.ok(getManualStepIssue([row('0'), row('301')], 0));
  assert.ok(getManualStepIssue([row('-1'), row('60')], 0));
  assert.equal(getManualStepIssue([row('0'), row('300')], 0), null);
});

test('the completed journey keeps real values and rejects invalid readings in each signal', () => {
  const rows = [
    { time_s: '0', voltage_v: '4,1', current_a: '-1', temperature_c: '25' },
    { time_s: '60', voltage_v: '4', current_a: '-1,01', temperature_c: '26' },
  ];
  for (let step = 0; step < 4; step++) assert.equal(getManualStepIssue(rows, step), null);
  assert.equal(validateManualTelemetry(rows).samples[1].current_a, -1.01);
  for (const [field, invalid, step] of [['voltage_v', '0', 1], ['current_a', 'NaN', 2], ['temperature_c', '', 3]]) {
    const changed = structuredClone(rows); changed[0][field] = invalid;
    assert.ok(getManualStepIssue(changed, step));
    assert.equal(validateManualTelemetry(changed).samples.length, 0);
  }
});
