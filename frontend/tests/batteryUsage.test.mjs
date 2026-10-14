import assert from 'node:assert/strict';
import test from 'node:test';
import { getBatteryUsage } from '../src/utils/batteryUsage.ts';

test('each boundary belongs to the upper range without gaps or overlap', () => {
  const cases = [
    [100, 'Excelente'], [90, 'Excelente'], [89.999, 'Bueno'],
    [80, 'Bueno'], [79.999, 'Degradación moderada'],
    [70, 'Degradación moderada'], [69.999, 'Degradación alta'],
    [60, 'Degradación alta'], [59.999, 'Muy degradada'],
    [40, 'Muy degradada'], [39.999, 'Fin de vida práctico'],
    [0, 'Fin de vida práctico'],
  ];
  for (const [soh, state] of cases) assert.equal(getBatteryUsage(soh)?.state, state);
});

test('invalid predictions do not receive a usage recommendation', () => {
  for (const soh of [NaN, Infinity, -Infinity, -1, 100.01]) {
    assert.equal(getBatteryUsage(soh), null);
  }
});

test('moderately degraded battery lists second life and end of life prioritizes recycling', () => {
  assert.ok(getBatteryUsage(75).uses.includes('Segunda vida: almacenamiento solar'));
  assert.ok(getBatteryUsage(30).uses.includes('Priorizar reciclaje'));
});
