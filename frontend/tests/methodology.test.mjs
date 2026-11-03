import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { featureGroups } from '../src/data/methodologyFeatures.ts';
import { predictionSteps, trainingSteps } from '../src/data/methodologyData.ts';
import { getMethodologyResults } from '../src/utils/methodologyResults.ts';

test('feature explorer documents both telemetry-only v4 contracts without context', () => {
  const documented = featureGroups.flatMap(group => group.features.map(([name]) => name));
  for (const family of ['nasa_cold_1a', 'nasa_room_2a']) {
    const actual = JSON.parse(readFileSync(new URL(`../../backend/model_artifacts_v4/${family}/features.json`, import.meta.url), 'utf8'));
    assert.ok(actual.every(name => documented.includes(name)));
    assert.ok(actual.length >= 21);
  }
  assert.equal(new Set(documented).size, 30);
  assert.ok(!documented.some(name => ['cycle', 'capacity', 'ambient_temperature', 'cutoff_voltage', 'Re_prev'].includes(name)));
});

test('both journeys have six complete stages and evaluation does not invent metrics', () => {
  for (const steps of [predictionSteps, trainingSteps]) {
    assert.equal(steps.length, 6);
    for (const step of steps) {
      for (const key of ['short', 'title', 'description', 'technical', 'evidence', 'evidenceTitle', 'visual']) assert.ok(step[key].length > 0);
      assert.ok(step.points.length >= 3);
    }
  }
  assert.match(trainingSteps[4].evidence, /particiones por batería/);
  assert.equal(predictionSteps[4].visual, 'results');
});

test('methodology uses live values without mutation, reordering input or mixing demo values', () => {
  const live = Object.freeze({
    current_soh_percent: 76.35, raw_current_soh_percent: 76.35,
    future_predictions: Object.freeze([
      Object.freeze({ horizon_cycles: 30, predicted_soh_percent: 75.83, raw_predicted_soh_percent: 75.83 }),
      Object.freeze({ horizon_cycles: 5, predicted_soh_percent: 76.35, raw_predicted_soh_percent: 78.5 }),
    ]),
  });
  const result = getMethodologyResults(live);
  assert.deepEqual(result.map(p => p.h), [0, 5, 30]);
  assert.deepEqual(result.map(p => p.value), [76.35, 76.35, 75.83]);
  assert.equal(live.future_predictions[0].horizon_cycles, 30);
  assert.equal(getMethodologyResults(null)[0].value, 88);
});
