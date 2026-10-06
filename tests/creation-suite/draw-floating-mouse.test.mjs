import test from 'node:test';
import assert from 'node:assert/strict';
import { clampDrawMousePosition, normalizeDrawMousePosition } from '../../js/creation/draw-virtual-cursor.mjs';

const area = { left: 8, right: 312, top: 64, bottom: 479 };
const size = { width: 184, height: 70 };
test('floating mouse stays inside header, navigation and side margins at every edge', () => {
  assert.deepEqual(clampDrawMousePosition({ x: -100, y: -100 }, area, size), { x: 8, y: 64 });
  assert.deepEqual(clampDrawMousePosition({ x: 1000, y: 1000 }, area, size), { x: 128, y: 409 });
  assert.deepEqual(clampDrawMousePosition({ x: 50, y: 200 }, area, size), { x: 50, y: 200 });
});
test('saved normalized placement recovers the same proportion after orientation changes', () => {
  const stored = normalizeDrawMousePosition({ x: 68, y: 236.5 }, area, size);
  assert.deepEqual(stored, { x: .5, y: .5 });
  const landscape = { left: 8, right: 560, top: 64, bottom: 230 };
  const point = { x: landscape.left + stored.x * (landscape.right - size.width - landscape.left),
    y: landscape.top + stored.y * (landscape.bottom - size.height - landscape.top) };
  assert.deepEqual(normalizeDrawMousePosition(point, landscape, size), stored);
});
test('a temporarily smaller available area has a finite recoverable placement', () => {
  const small = { left: 8, right: 100, top: 64, bottom: 100 };
  assert.deepEqual(clampDrawMousePosition({ x: 500, y: 500 }, small, size), { x: 8, y: 64 });
  assert.deepEqual(normalizeDrawMousePosition({ x: 500, y: 500 }, small, size), { x: 0, y: 0 });
});
