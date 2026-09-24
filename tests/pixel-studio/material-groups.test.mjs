import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothMaterialLight } from '../../js/pixel-studio/material-groups.mjs';

test('protected cells retain raw light and are excluded from neighboring smoothing', () => {
  const rgb = new Uint8Array(3 * 3 * 3).fill(100);
  const center = (1 * 3 + 1) * 3;
  rgb.set([110, 110, 110], center);
  const materials = new Uint32Array(9).fill(7);
  const protectedCells = new Uint8Array(9);
  protectedCells[4] = 1;

  const smoothed = smoothMaterialLight(rgb, materials, 3, 3, protectedCells);
  assert.equal(smoothed[4], 110, 'the protected feature keeps its unsmoothed tone');
  assert.equal(smoothed[1], 100, 'nearby cells do not absorb light from the protected feature');
  assert.equal(smoothed[0], 100);
});

test('preserves the legacy call shape and rejects malformed masks', () => {
  const rgb = new Uint8Array(12).fill(80);
  const materials = new Float64Array(4).fill(1);
  assert.deepEqual([...smoothMaterialLight(rgb, materials, 2, 2)], [80, 80, 80, 80]);
  assert.throws(() => smoothMaterialLight(rgb, materials, 2, 2, new Uint8Array(1)), /protectedCells/);
  assert.throws(() => smoothMaterialLight(rgb, materials, 2, 2, new Uint8Array([0, 0, 0, 3])), /must be 0 or 1/);
});
