import test from 'node:test';
import assert from 'node:assert/strict';
import { combineDrawInputSelection, lassoDrawSelection } from '../../js/creation/draw-selection-input.mjs';
import { drawSelectionMask } from '../../js/creation/draw-selection-operations.mjs';

test('lasso rasterizes a closed polygon at pixel centers and keeps transparent cells selected', () => {
  const selected = lassoDrawSelection([{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 3, y: 5 }], 6, 6);
  assert.deepEqual({ x: selected.x, y: selected.y, width: selected.width, height: selected.height }, { x: 1, y: 1, width: 4, height: 3 });
  const mask = drawSelectionMask(selected, 6, 6);
  assert.equal(mask[1 * 6 + 2], 1);
  assert.equal(mask[3 * 6 + 3], 1);
  assert.equal(mask[4 * 6 + 1], 0);
  assert.equal(mask[1 * 6 + 5], 0);
});

test('lasso clips at canvas edges and combines arbitrary pixel membership for add/subtract', () => {
  const base = lassoDrawSelection([{ x: -2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: -2, y: 4 }], 5, 5);
  assert.deepEqual({ x: base.x, y: base.y, width: base.width, height: base.height }, { x: 0, y: 0, width: 3, height: 4 });
  const triangle = lassoDrawSelection([{ x: 2, y: 1 }, { x: 5, y: 1 }, { x: 2, y: 4 }], 5, 5);
  const union = combineDrawInputSelection(base, triangle, 'add', 5, 5);
  const difference = combineDrawInputSelection(union, triangle, 'subtract', 5, 5);
  assert.equal(drawSelectionMask(difference, 5, 5).reduce((sum, value) => sum + value, 0), 9);
  assert.equal(drawSelectionMask(union, 5, 5).reduce((sum, value) => sum + value, 0) > 12, true);
  assert.equal(lassoDrawSelection([{ x: 0, y: 0 }, { x: 1, y: 1 }], 5, 5), null);
});
