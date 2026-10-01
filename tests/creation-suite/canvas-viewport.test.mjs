import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zoomCanvasViewportAt } from '../../js/creation/canvas-viewport.mjs';
import { wheelZoomFactor } from '../../js/creation/viewport-wheel.mjs';

test('pinch keeps the image point under the starting midpoint under the moving midpoint', () => {
  const before = { scale: 1.5, panX: 14, panY: -9 };
  const start = { x: 230, y: 100 }; const end = { x: 260, y: 120 }; const center = { x: 200, y: 150 };
  const source = { x: (start.x - center.x - before.panX) / before.scale, y: (start.y - center.y - before.panY) / before.scale };
  const after = zoomCanvasViewportAt(before, 2, start.x, start.y, end.x, end.y, center.x, center.y);
  assert.equal(center.x + after.panX + source.x * after.scale, end.x);
  assert.equal(center.y + after.panY + source.y * after.scale, end.y);
  assert.equal(after.scale, 3);
});

test('pinch midpoint movement pans at unchanged scale and zoom remains bounded', () => {
  const before = { scale: 1.5, panX: 14, panY: -9 };
  assert.deepEqual(zoomCanvasViewportAt(before, 1, 230, 100, 260, 120, 200, 150), { scale: 1.5, panX: 44, panY: 11 });
  assert.equal(zoomCanvasViewportAt(before, 100, 230, 100, 230, 100, 200, 150).scale, 4);
  assert.equal(zoomCanvasViewportAt(before, 0.001, 230, 100, 230, 100, 200, 150).scale, 1);
});

test('wheel zoom uses the shared normalized 1.2x event limit', () => {
  assert.ok(wheelZoomFactor(-1e6, 0, 500) <= 1.2);
  assert.ok(wheelZoomFactor(1e6, 0, 500) >= 1 / 1.2);
  assert.ok(wheelZoomFactor(-120, 1, 500) > 1);
  assert.ok(wheelZoomFactor(-1, 2, 500) > 1);
  assert.ok(wheelZoomFactor(1, 2, 500) < 1);
});

test('Spot and Hidden editors use anchored wheel and pinch transforms while preserving stroke rollback', () => {
  const spot = readFileSync(new URL('../../js/creation/spot-difference-page.mjs', import.meta.url), 'utf8');
  const hidden = readFileSync(new URL('../../js/creation/hidden-object-page.mjs', import.meta.url), 'utf8');
  for (const [source, cancel] of [[spot, 'cancelTouchEdit()'], [hidden, 'cancelTouchStroke()']]) {
    assert.match(source, /canvas\.addEventListener\('wheel'/);
    assert.match(source, /wheelZoomFactor\(event\.deltaY, event\.deltaMode/);
    assert.match(source, /zoomCanvasViewportAt\(pinchStart, distance \/ pinchStart\.distance, pinchStart\.centerX/);
    assert.ok(source.includes(cancel), `two-finger transition still calls ${cancel}`);
  }
});
