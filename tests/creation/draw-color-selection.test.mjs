import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDrawColorMask, drawSelectionMask, drawSelectionMaskBounds, captureDrawSelection, clearDrawSelection, projectDrawSelection } from '../../js/creation/draw-selection-operations.mjs';
import { normalizeDrawInputSettings, serializeDrawInputSettings } from '../../js/creation/draw-input-settings.mjs';

test('same-color mask spans disconnected equivalent palette entries and snapshots membership', () => {
  const doc = { schemaVersion: 1, width: 5, height: 2, palette: ['#ff0000', '#FF0000FF', '#0000ff'], pixels: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2] };
  const selected = selectDrawColorMask(doc, { x: 2, y: 0 });
  assert.deepEqual([...selected.mask], [1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
  assert.deepEqual({ x: selected.x, y: selected.y, width: selected.width, height: selected.height }, { x: 0, y: 0, width: 5, height: 2 });
  doc.pixels.fill(2);
  assert.deepEqual([...selected.mask], [1, 0, 1, 0, 1, 0, 1, 0, 1, 0], 'later cel edits do not recompute selection');
});

test('clicking transparency selects every empty cell and palette slot zero remains opaque', () => {
  const doc = { schemaVersion: 1, width: 3, height: 2, palette: ['#ffffff', '#00000000'], pixels: [-1, 0, 1, 0, -1, 0] };
  assert.deepEqual([...selectDrawColorMask(doc, { x: 0, y: 0 }).mask], [1, 0, 1, 0, 1, 0]);
  assert.deepEqual([...selectDrawColorMask(doc, { x: 1, y: 0 }).mask], [0, 1, 0, 1, 0, 1]);
  const empty = { ...doc, pixels: Array(6).fill(-1) };
  assert.deepEqual([...selectDrawColorMask(empty, { x: 2, y: 1 }).mask], Array(6).fill(1));
  assert.equal(selectDrawColorMask(doc, { x: -1, y: 0 }), null);
});

test('mask operations preserve holes and transparent-only copy/cut are no-ops', () => {
  const doc = { schemaVersion: 1, width: 3, height: 2, palette: ['#ff0000'], pixels: [0, -1, 0, -1, -1, -1] };
  const selected = selectDrawColorMask(doc, { x: 0, y: 0 });
  const full = drawSelectionMask(selected, doc.width, doc.height);
  assert.deepEqual({ ...drawSelectionMaskBounds(full, doc.width, doc.height) }, { x: 0, y: 0, width: 3, height: 1 });
  const clip = captureDrawSelection(doc, selected, { mask: full });
  const cleared = clearDrawSelection(doc, clip, selected);
  assert.deepEqual(cleared.pixels, [-1, -1, -1, -1, -1, -1]);
  const transparentDoc = { ...doc, pixels: Array(6).fill(-1) };
  const transparent = selectDrawColorMask(transparentDoc, { x: 1, y: 1 });
  assert.equal(captureDrawSelection(transparentDoc, transparent, { mask: transparent.mask }), null);
  assert.throws(() => projectDrawSelection(doc, null, {}));
});

test('left and right same-color modes persist independently and default old settings to rectangle', () => {
  const palette = ['#000000', '#ffffff'];
  const old = normalizeDrawInputSettings(null, palette);
  assert.equal(old.bindings.left.selectMode, undefined);
  const state = normalizeDrawInputSettings({ version: 1, bindings: { left: { tool: 'select', color: 0, selectMode: 'color' }, right: { tool: 'select', color: 1, selectMode: 'rectangle' } } }, palette);
  const restored = normalizeDrawInputSettings(serializeDrawInputSettings(state, palette), palette);
  assert.equal(restored.bindings.left.selectMode, 'color');
  assert.equal(restored.bindings.right.selectMode, 'rectangle');
});
