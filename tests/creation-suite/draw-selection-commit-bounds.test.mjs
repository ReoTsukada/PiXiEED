import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';
import { drawSelectionMask, drawSelectionMaskBounds } from '../../js/creation/draw-selection-operations.mjs';

const bounds = { x: 4, y: 4, width: 4, height: 3 };
function source() {
  const document = { schemaVersion: 1, width: 16, height: 16, palette: ['#ff0000'], pixels: Array(256).fill(-1) };
  document.pixels[5 * 16 + 5] = 0;
  return document;
}
function captureCommit(transform) {
  const document = transform.project().document, mask = transform.mask(document.width, document.height);
  return { document, bounds: { ...drawSelectionMaskBounds(mask, document.width, document.height), mask } };
}
const rect = ({ x, y, width, height }) => ({ x, y, width, height });

test('fractional movement commits selected cells without adding a geometric empty border', () => {
  for (const [dx, dy, x, y] of [[.25, .25, 4, 4], [.6, .6, 5, 5], [1.75, -1.25, 6, 3]]) {
    const transform = createDrawSelectionTransform(source(), bounds);
    transform.update({ x: bounds.x + dx, y: bounds.y + dy });
    const committed = captureCommit(transform);
    assert.deepEqual(rect(committed.bounds), { x, y, width: 4, height: 3 });
    assert.equal(committed.bounds.mask.reduce((a, b) => a + b, 0), 12, 'transparent selected padding stays in the mask');
    assert.equal(committed.document.pixels[(y + 1) * 16 + x + 1], 0);
    assert.equal(committed.document.pixels.filter(v => v >= 0).length, 1);
  }
});

test('repeated fractional no-op commits preserve the rectangle, mask and exact pixels', () => {
  let document = source(), selection = { ...bounds, mask: drawSelectionMask(bounds, 16, 16) };
  const original = structuredClone(document), mask = selection.mask;
  for (let i = 0; i < 12; i++) {
    const transform = createDrawSelectionTransform(document, selection, { mask: selection.mask });
    transform.update({ x: selection.x + .25, y: selection.y + .25 });
    ({ document, bounds: selection } = captureCommit(transform));
    assert.deepEqual(rect(selection), bounds);
    assert.deepEqual(selection.mask, mask);
    assert.deepEqual(document, original);
  }
});

test('rotation has a real raster bounding change, then repeated untransformed commits stay stable', () => {
  let document = source();
  const rotated = createDrawSelectionTransform(document, bounds);
  rotated.setAngle(37); rotated.resize({ width: 7, height: 5 });
  let selection;
  ({ document, bounds: selection } = captureCommit(rotated));
  assert.ok(selection.width > bounds.width || selection.height > bounds.height);
  const first = structuredClone({ document, selection });
  for (let i = 0; i < 6; i++) {
    const next = createDrawSelectionTransform(document, selection, { mask: selection.mask });
    ({ document, bounds: selection } = captureCommit(next));
    assert.deepEqual({ document, selection }, first);
  }
});

test('quarter-turn raster bounds retain swapped dimensions with a mixed-parity pivot', () => {
  const document = source(), selection = { x: 4, y: 4, width: 3, height: 2 };
  const transform = createDrawSelectionTransform(document, selection);
  transform.rotate(1);
  const committed = captureCommit(transform);
  assert.equal(committed.bounds.width, 2); assert.equal(committed.bounds.height, 3);
  assert.equal(committed.bounds.mask.reduce((a, b) => a + b, 0), 6);
});

test('canvas clipping trims selected cells and empty masks have no bounding rectangle', () => {
  const transform = createDrawSelectionTransform(source(), bounds);
  transform.update({ x: -1.25, y: 4.25 });
  const committed = captureCommit(transform);
  assert.deepEqual(rect(committed.bounds), { x: 0, y: 4, width: 3, height: 3 });
  assert.equal(drawSelectionMaskBounds(new Uint8Array(256), 16, 16), null);
});
