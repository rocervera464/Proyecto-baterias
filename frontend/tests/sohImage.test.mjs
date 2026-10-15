import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { getSohImage, getSohImages } from '../src/utils/sohImage.ts';

test('image selection at exact boundaries and immediately below them', () => {
  for (const [value, range] of [
    [100, '90-100'], [90, '90-100'], [89.999, '80-90'], [80, '80-90'], [79.999, '70-80'],
    [70, '70-80'], [69.999, '60-70'], [60, '60-70'], [59.999, 'under-60'], [40, 'under-60'], [0, 'under-60'],
  ]) {
    const image = getSohImage(value);
    assert.equal(image.src, `/images/soh-${range}.jpg`);
    assert.ok(existsSync(new URL(`../public${image.src}`, import.meta.url)));
    assert.deepEqual(getSohImages(value), [image]);
    assert.ok(image.alt.length > 20);
  }
});

test('invalid input receives no image without throwing', () => {
  for (const value of ['90', 'texto', null, undefined, {}, NaN, Infinity, -1, 101]) {
    assert.equal(getSohImage(value), null);
    assert.deepEqual(getSohImages(value), []);
  }
});
