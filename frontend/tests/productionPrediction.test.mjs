import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrediction } from '../src/utils/validatePrediction.ts';

const response = () => ({ status: 'success', model_family: 'XGBoost SoH v2', current_cycle: 25,
  current_soh_percent: 80, production_horizons: [5], future_predictions: [
    { horizon_cycles: 5, target_cycle: 30, predicted_soh_percent: 78.123456789 },
  ] });

test('preserves exact API predictions without mutation or rounding', () => {
  const value = response();
  const before = structuredClone(value);
  assert.equal(validatePrediction(value, 25), value);
  assert.deepEqual(value, before);
});

test('accepts current-only and variable-length production forecasts', () => {
  const value = response();
  value.production_horizons = [];
  value.future_predictions = [];
  assert.equal(validatePrediction(value, 25), value);
});

test('rejects research, mismatched cycles, nonphysical or incoherent forecasts without repairing', () => {
  for (const mutate of [v => v.production_horizons = [], v => v.future_predictions[0].target_cycle = 6,
    v => v.future_predictions[0].predicted_soh_percent = 81, v => v.future_predictions[0].predicted_soh_percent = -1,
    v => v.future_predictions[0].experimental = true, v => v.current_cycle = 1]) {
    const value = response();
    mutate(value);
    const before = structuredClone(value);
    assert.throws(() => validatePrediction(value, 25));
    assert.deepEqual(value, before);
  }
});
