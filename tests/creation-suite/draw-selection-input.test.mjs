import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionInputOperation, combineDrawInputSelection } from '../../js/creation/draw-selection-input.mjs';
import { drawSelectionMask } from '../../js/creation/draw-selection-operations.mjs';

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
