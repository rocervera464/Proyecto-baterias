import assert from 'node:assert/strict';
import test from 'node:test';
import { getForecastIncreases } from '../src/utils/forecastConsistency.ts';

const response = (current, values) => ({ current_soh_percent: current, future_predictions: values.map(([horizon_cycles, predicted_soh_percent]) => ({ horizon_cycles, predicted_soh_percent })) });

test('detects increases against current health and between future horizons without changing predictions', () => {
  const data = response(76.35, [[5, 78.5], [10, 77.22], [20, 77.34], [30, 75.83]]);
  const before = structuredClone(data);
  const increases = getForecastIncreases(data);
  assert.deepEqual(increases.map((item) => [item.fromHorizon, item.toHorizon]), [[0, 5], [10, 20]]);
  assert.ok(Math.abs(increases[0].increase - 2.15) < 1e-8);
  assert.deepEqual(data, before);
});

test('flat and decreasing forecasts have no increase warning', () => {
  assert.deepEqual(getForecastIncreases(response(90, [[5, 90], [10, 88], [20, 85], [30, 80]])), []);
});

test('uses horizon order and compares available finite results', () => {
  assert.deepEqual(getForecastIncreases(response(NaN, [[30, 82], [5, 80], [10, Infinity], [20, 79]])).map((item) => [item.fromHorizon, item.toHorizon]), [[20, 30]]);
});
