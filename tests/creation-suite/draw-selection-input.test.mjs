import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionInputOperation, selectionGestureKind, combineDrawInputSelection, combineDrawLassoSelection } from '../../js/creation/draw-selection-input.mjs';
import { drawSelectionMask } from '../../js/creation/draw-selection-operations.mjs';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';

test('selection modifiers preserve Alt and use primary subtraction and Shift addition', () => {
  assert.equal(selectionInputOperation({}), 'replace');
  assert.equal(selectionInputOperation({ shiftKey: true }), 'add');
  assert.equal(selectionInputOperation({ altKey: true }), 'replace');
  assert.equal(selectionInputOperation({ ctrlKey: true, shiftKey: true }), 'subtract');
  assert.equal(selectionInputOperation({ metaKey: true }), 'subtract');
  const base = { x: 1, y: 1, width: 2, height: 2 }, range = { x: 2, y: 2, width: 2, height: 2 };
  const added = combineDrawInputSelection(base, range, 'add', 5, 5);
  const mask = drawSelectionMask(added, 5, 5);
  assert.equal(mask.reduce((a, b) => a + b), 7);
  assert.equal(mask[1 * 5 + 3], 0, 'bounding rectangle holes stay unselected');
  const removed = combineDrawInputSelection(added, range, 'subtract', 5, 5);
  assert.equal(drawSelectionMask(removed, 5, 5).reduce((a, b) => a + b), 3);
  assert.equal(drawSelectionMask(base, 5, 5).reduce((a, b) => a + b), 4, 'base is detached');
});
test('empty subtraction clears membership; adding without a base selects incoming cells', () => {
  const range = { x: 0, y: 0, width: 2, height: 2 };
  assert.equal(combineDrawInputSelection(range, range, 'subtract', 4, 4), null);
  assert.equal(combineDrawInputSelection(null, range, 'subtract', 4, 4), null);
  assert.deepEqual(drawSelectionMask(combineDrawInputSelection(null, range, 'add', 4, 4), 4, 4), drawSelectionMask(range, 4, 4));
  assert.equal(combineDrawInputSelection(range, range, 'replace', 4, 4), range);
});

test('lasso remains the gesture mode for additive drags and Alt keeps the established alternate behavior', () => {
  assert.equal(selectionGestureKind({ selectionMode: 'lasso', operation: 'add' }), 'lasso');
  assert.equal(selectionGestureKind({ selectionMode: 'lasso', operation: 'add', handle: 'move' }), 'standard');
  assert.equal(selectionGestureKind({ selectionMode: 'lasso', operation: 'add', altKey: true }), 'modify');
  assert.equal(selectionGestureKind({ selectionMode: 'rectangle', operation: 'add' }), 'modify');
});

test('lasso union after a pending transform uses the transformed pixel mask, not its frame bounds', () => {
  const document = { schemaVersion: 1, width: 6, height: 4, palette: ['#000000ff'], pixels: new Array(24).fill(-1) };
  document.pixels[1 * 6 + 1] = document.pixels[2 * 6 + 3] = 0;
  const originalMask = new Uint8Array(24); originalMask[1 * 6 + 1] = originalMask[2 * 6 + 3] = 1;
  const original = { x: 1, y: 1, width: 3, height: 2, mask: originalMask };
  const pending = createDrawSelectionTransform(document, original, { mask: originalMask });
  pending.update({ x: 2, y: 0 });
  const transformedMask = pending.mask(document.width, document.height);
  const transformedBase = { ...pending.rect, mask: transformedMask };
  const result = combineDrawLassoSelection(transformedBase,
    [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], 'add', document.width, document.height);
  const resultMask = drawSelectionMask(result, document.width, document.height);
  const addedCells = new Set([0, 1, 6, 7]);
  assert.deepEqual([...resultMask], [...transformedMask].map((value, index) => Number(Boolean(value || addedCells.has(index)))));
  assert.equal(resultMask[1 * 6 + 2], 0, 'a hole in the transformed frame stays outside the selection');
  assert.equal(document.pixels[1 * 6 + 1], 0, 'the pending transform is detached until it is committed');
});
