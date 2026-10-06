import test from 'node:test';
import assert from 'node:assert/strict';
import { translateSelectionFrame } from '../../js/creation/draw-selection-geometry.mjs';

const frame = { x: 3, y: 4, width: 4, height: 3, angle: 0, pivot: { x: 5, y: 5.5 } };
test('selection translation snaps total displacement to original pixel cells in both directions', () => {
  for (const [dx, dy, x, y] of [[.49, -.49, 3, 4], [.51, -.51, 4, 3], [1.25, -1.25, 4, 3], [2.75, -2.75, 6, 1]]) {
    const next = translateSelectionFrame(frame, dx, dy);
    assert.equal(next.x, x); assert.equal(next.y, y);
    assert.deepEqual(next.pivot, { x: 5 + x - 3, y: 5.5 + y - 4 });
    assert.equal(next.width, 4); assert.equal(next.height, 3); assert.equal(next.angle, 0);
  }
});
test('many samples use the gesture checkpoint and return without cumulative rounding or grab-offset jumps', () => {
  const original = structuredClone(frame);
  for (const delta of [.1, .2, .4, .6, .8, 1.1, 1.25, .4, 0]) {
    const next = translateSelectionFrame(frame, delta, -delta);
    assert.equal(next.x, frame.x + Math.round(delta));
    assert.equal(next.y, frame.y + Math.round(-delta));
  }
  assert.deepEqual(frame, original);
  assert.deepEqual(translateSelectionFrame(frame, 0, 0).pivot, original.pivot);
});
test('translation retains fractional rotated origin, free angle and pivot offset', () => {
  const rotated = { ...frame, x: 3.125, y: 4.375, angle: 37.25, pivot: { x: 2.75, y: 8.625 } };
  const next = translateSelectionFrame(rotated, 1.25, -.75);
  assert.equal(next.x, 4.125); assert.equal(next.y, 3.375);
  assert.equal(next.angle, rotated.angle); assert.deepEqual(next.pivot, { x: 3.75, y: 7.625 });
});
test('screen scale and DPR do not change original-pixel translation and numerical noise at half pixels is stable', () => {
  for (const scale of [3.125, 9.375, 16.2, 23.0625]) for (const dpr of [1, 2, 3]) {
    const screenDelta = 1.25 * scale * dpr;
    assert.equal(translateSelectionFrame(frame, screenDelta / (scale * dpr), 0).x, 4);
  }
  assert.equal(translateSelectionFrame(frame, .5 - 1e-12, 0).x, 4);
});
