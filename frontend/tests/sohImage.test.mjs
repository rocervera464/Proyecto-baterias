import assert from 'node:assert/strict';
import test from 'node:test';
import { getSohImage } from '../src/utils/sohImage.ts';

test('image selection at exact boundaries and immediately below them', () => {
  for (const [value, number] of [
    [100, 1], [90, 1], [89.999, 2], [80, 2], [79.999, 3],
    [70, 3], [69.999, 4], [60, 4], [59.999, 5], [40, 5], [39.999, 6], [0, 6],
  ]) {
    const image = getSohImage(value);
    assert.ok(image.src.includes(`soh_${number}_`));
    assert.ok(image.alt.length > 20);
  }
});

test('invalid input receives no image without throwing', () => {
  for (const value of ['90', 'texto', null, undefined, {}, NaN, Infinity, -1, 101]) {
    assert.equal(getSohImage(value), null);
  }
});
