import assert from 'node:assert/strict';
import test from 'node:test';
import { getSohClassification, secondLifeClassifications } from '../src/data/batterySecondLifeData.ts';

test('requested results and exact boundaries have the expected second life classification', () => {
  const cases = [
    [100, 'Excelente'], [95, 'Excelente'], [90, 'Excelente'],
    [89.999, 'Buen estado'], [85, 'Buen estado'], [80, 'Buen estado'],
    [79.999, 'Candidato a segunda vida'], [76.35, 'Candidato a segunda vida'], [70, 'Candidato a segunda vida'],
    [69.999, 'Degradación alta'], [65, 'Degradación alta'], [60, 'Degradación alta'],
    [59.999, 'Evaluación especializada'], [55, 'Evaluación especializada'], [0, 'Evaluación especializada'],
  ];
  for (const [soh, label] of cases) assert.equal(getSohClassification(soh)?.label, label);
});

test('invalid and nonnumeric SoH values never receive applications', () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity, -0.01, 100.01, '76.35', '', true, {}, []]) {
    assert.equal(getSohClassification(value), null);
  }
});

test('second life uses are selected per range and recovery is prioritized below 60 percent', () => {
  assert.ok(getSohClassification(76.35).applications.some((application) => application.id === 'solar'));
  assert.ok(!getSohClassification(76.35).applications.some((application) => application.id === 'mobility'));
  assert.ok(getSohClassification(55).applications.some((application) => application.id === 'recycling'));
  assert.ok(getSohClassification(55).applications.every((application) => ['Recuperación y reciclaje', 'Investigación y diagnóstico'].includes(application.category)));
});

test('every application has its own complete content and stable unique identifier within a range', () => {
  for (const range of secondLifeClassifications) {
    assert.equal(new Set(range.applications.map((application) => application.id)).size, range.applications.length);
    assert.equal(new Set(range.applications.map((application) => application.sohConsideration)).size, range.applications.length);
    for (const application of range.applications) {
      for (const key of ['title', 'summary', 'operation', 'sohConsideration', 'requirements', 'limitations']) assert.ok(application[key].trim().length > 0);
      assert.ok(application.scenarios.length >= 2);
    }
  }
});
