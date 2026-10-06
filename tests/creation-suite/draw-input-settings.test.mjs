import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDrawInputSettings, serializeDrawInputSettings, readDrawInputSettings } from '../../js/creation/draw-input-settings.mjs';
const palette = ['#111111', '#ffffff', '#ff0000', '#00ff00', '#0000ff'];
test('defaults and corrupt or unavailable preference storage keep valid independent bindings', () => {
  const initial = normalizeDrawInputSettings(null, palette);
  assert.deepEqual(initial.bindings, { left: { tool: 'pen', color: 2 }, right: { tool: 'pen', color: 4 } });
  assert.deepEqual(readDrawInputSettings({ getItem() { throw Error('blocked'); } }, palette), initial);
  assert.deepEqual(readDrawInputSettings({ getItem() { return '{bad'; } }, palette), initial);
  const corrupt = normalizeDrawInputSettings({ version: 1, bindings: { left: { tool: 'bad', color: 99 }, right: { tool: 'eraser', color: -1 } }, editedSide: 'bad', controlsSide: 'left' }, palette);
  assert.deepEqual(corrupt.bindings, { left: { tool: 'pen', color: 2 }, right: { tool: 'eraser', color: -1 } });
  assert.equal(corrupt.editedSide, 'left'); assert.equal(corrupt.controlsSide, 'left');
});
test('serialized assignments follow matching colors after palette reorder without modifying artwork', () => {
  const state = normalizeDrawInputSettings({ version: 1, bindings: { left: { tool: 'line', color: 2 }, right: { tool: 'pen', color: 4 } }, editedSide: 'right', controlsSide: 'left' }, palette);
  const reordered = [...palette].reverse(), before = [...reordered];
  const restored = normalizeDrawInputSettings(serializeDrawInputSettings(state, palette), reordered);
  assert.equal(restored.bindings.left.color, 2); assert.equal(restored.bindings.right.color, 0);
  assert.equal(restored.bindings.left.tool, 'line'); assert.equal(restored.editedSide, 'left', 'obsolete right edit-target preference migrates to direct left/right selection'); assert.equal(restored.controlsSide, 'left');
  assert.deepEqual(reordered, before);
  const tiny = normalizeDrawInputSettings(state, ['#000000']);
  assert.equal(tiny.bindings.left.color, 0); assert.equal(tiny.bindings.right.color, 0);
});
