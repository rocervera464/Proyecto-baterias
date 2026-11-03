import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeIdentifiedParameters } from '../src/utils/batteryParameters.ts';
import { validatePrediction } from '../src/utils/validatePrediction.ts';

const reference = { battery_id: 'B0045', cycle: 30, source_sha256: 'a'.repeat(64) };

test('verified source fills all five form fields without inventing missing history', () => {
  const declared = Object.freeze({ ambient: '25', re: '0.1' });
  const merged = mergeIdentifiedParameters(declared, { matched: true, reference,
    context: { cycle: 30, ambient_temperature_c: 4, cutoff_voltage_v: 2, measurement_level: 'cell', chemistry: 'li-ion' } });
  assert.deepEqual(merged, { ambient: '4', re: '0.1', cycle: '30', cutoff: '2', level: 'cell', chemistry: 'li-ion' });
  assert.deepEqual(declared, { ambient: '25', re: '0.1' });
});

test('unknown signals preserve declared values and do not default to cycle one', () => {
  assert.deepEqual(mergeIdentifiedParameters({ ambient: '25' }, { matched: false, reference: null, context: {} }), { ambient: '25' });
});

test('a restored cycle requires a matching source and adjustment audit', () => {
  const data = { status: 'success', model_family: 'XGBoost SoH v2', current_cycle: 30, current_soh_percent: 81.64468383789062,
    production_horizons: [], future_predictions: [], telemetry_reference: reference,
    input_normalization: [{ field: 'cycle', original_value: 999, normalized_value: 30, basis: 'verified_reference', operation: 'restore_source_context' }] };
  assert.equal(validatePrediction(data, 999), data);
  assert.throws(() => validatePrediction({ ...data, input_normalization: [] }, 999));
  assert.throws(() => validatePrediction({ ...data, telemetry_reference: null }, 999));
  assert.throws(() => validatePrediction({ ...data, telemetry_reference: { ...reference, cycle: 1 } }, 999));
});
