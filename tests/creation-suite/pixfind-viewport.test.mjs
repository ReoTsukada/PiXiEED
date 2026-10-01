import test from 'node:test';
import assert from 'node:assert/strict';
import { clampPixfindViewport, mapPixfindPoint, pinchPixfindViewport, pixfindViewportGeometry, pixfindWheelZoomFactor, zoomPixfindViewport } from '../../js/creation/pixfind-viewport.mjs';

test('both panels share image scale and source point mapping at every zoom', () => {
  const viewport = { zoom: 2.5, x: 18, y: -7 };
  const a = pixfindViewportGeometry({ width: 100, height: 80, areaWidth: 400, areaHeight: 300, baseScale: 2, viewport });
  const b = pixfindViewportGeometry({ width: 100, height: 80, areaWidth: 400, areaHeight: 300, baseScale: 2, viewport });
  assert.deepEqual(a, b);
  assert.deepEqual(mapPixfindPoint(200, 150, { left: 0, top: 0 }, a), { x: 46.4, y: 41.4 });
});

test('zoom keeps the source point under the cursor fixed and clamps to supported range', () => {
  const before = { zoom: 1.5, x: 14, y: -9 };
  const anchor = { x: 230, y: 100 }; const center = { x: 200, y: 150 }; const scale = 2;
  const after = zoomPixfindViewport(before, 2, anchor.x, anchor.y, center.x, center.y, scale);
  const original = { x: (anchor.x - center.x - before.x) / (scale * before.zoom), y: (anchor.y - center.y - before.y) / (scale * before.zoom) };
  const next = { x: center.x + after.x + original.x * scale * after.zoom, y: center.y + after.y + original.y * scale * after.zoom };
  assert.ok(Math.abs(next.x - anchor.x) < 1e-9);
  assert.ok(Math.abs(next.y - anchor.y) < 1e-9);
  assert.equal(zoomPixfindViewport(before, 100, anchor.x, anchor.y, center.x, center.y, scale).zoom, 8);
  assert.equal(zoomPixfindViewport(before, 0.001, anchor.x, anchor.y, center.x, center.y, scale).zoom, 1);
});

test('zoom preserves actual source coordinates through repeated cursor anchored steps', () => {
  const fit = { width: 128, height: 96, areaWidth: 420, areaHeight: 310, baseScale: 2 };
  let viewport = { zoom: 1, x: 0, y: 0 };
  const pointer = { x: 73, y: 251 };
  const point = () => mapPixfindPoint(pointer.x, pointer.y, { left: 0, top: 0 }, pixfindViewportGeometry({ ...fit, viewport }));
  for (const factor of [1.25, 1.4, 1.2, 0.85]) {
    const before = point();
    viewport = zoomPixfindViewport(viewport, factor, pointer.x, pointer.y, fit.areaWidth / 2, fit.areaHeight / 2, fit.baseScale);
    const after = point();
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
  }
});

test('wheel zoom normalizes wheel units and caps each event to a gradual step', () => {
  assert.ok(pixfindWheelZoomFactor(-1e6, 0, 500) <= 1.2);
  assert.ok(pixfindWheelZoomFactor(1e6, 0, 500) >= 1 / 1.2);
  assert.ok(pixfindWheelZoomFactor(-120, 1, 500) <= 1.2);
  assert.ok(pixfindWheelZoomFactor(-1, 2, 500) > 1);
  assert.ok(pixfindWheelZoomFactor(1, 2, 500) < 1);
});

test('pan remains bounded and returns to centered fit when the full image fits', () => {
  assert.deepEqual(clampPixfindViewport({ zoom: 1, x: 500, y: -500 }, 100, 80, 2, [{ width: 400, height: 300 }]), { zoom: 1, x: 0, y: 0 });
  const bounded = clampPixfindViewport({ zoom: 3, x: 10000, y: -10000 }, 100, 80, 2, [{ width: 400, height: 300 }], 32);
  assert.ok(bounded.x <= 468 && bounded.x >= -468);
  assert.ok(bounded.y <= 358 && bounded.y >= -358);
});

test('clamping does not pull a lower-left anchored zoom toward the corner while the image still fits', () => {
  const area = { width: 650, height: 650 };
  const before = { zoom: 1, x: 0, y: 0 };
  const anchor = { x: 82, y: 560 };
  const sourceBefore = mapPixfindPoint(anchor.x, anchor.y, { left: 0, top: 0 }, pixfindViewportGeometry({ width: 128, height: 128, areaWidth: area.width, areaHeight: area.height, baseScale: 4, viewport: before }));
  const zoomed = zoomPixfindViewport(before, 1.1, anchor.x, anchor.y, area.width / 2, area.height / 2, 4);
  assert.ok(128 * 4 * zoomed.zoom < area.width && 128 * 4 * zoomed.zoom < area.height);
  const oldClamp = { ...zoomed, x: 0, y: 0 };
  const oldSource = mapPixfindPoint(anchor.x, anchor.y, { left: 0, top: 0 }, pixfindViewportGeometry({ width: 128, height: 128, areaWidth: area.width, areaHeight: area.height, baseScale: 4, viewport: oldClamp }));
  assert.ok(oldSource.x > sourceBefore.x && oldSource.y < sourceBefore.y, 'zeroing both axes makes the image visibly shift left and down');
  const after = clampPixfindViewport(zoomed, 128, 128, 4, [area]);
  const sourceAfter = mapPixfindPoint(anchor.x, anchor.y, { left: 0, top: 0 }, pixfindViewportGeometry({ width: 128, height: 128, areaWidth: area.width, areaHeight: area.height, baseScale: 4, viewport: after }));
  assert.ok(Math.abs(sourceAfter.x - sourceBefore.x) < 1e-9);
  assert.ok(Math.abs(sourceAfter.y - sourceBefore.y) < 1e-9);
});

test('pinch moves the viewed source point with the fingers while changing zoom', () => {
  const before = { zoom: 1.5, x: 14, y: -9 };
  const start = { x: 230, y: 100 }; const end = { x: 260, y: 120 };
  const after = pinchPixfindViewport(before, 2, start.x, start.y, end.x, end.y, 200, 150, 2);
  const source = { x: (start.x - 200 - before.x) / (2 * before.zoom), y: (start.y - 150 - before.y) / (2 * before.zoom) };
  assert.equal(200 + after.x + source.x * 2 * after.zoom, end.x);
  assert.equal(150 + after.y + source.y * 2 * after.zoom, end.y);
  const moved = pinchPixfindViewport(before, 1, start.x, start.y, end.x, end.y, 200, 150, 2);
  assert.equal(moved.x, before.x + 30);
  assert.equal(moved.y, before.y + 20);
});

test('pinch anchor stays under the moving midpoint in source pixels over repeated gestures', () => {
  const fit = { width: 160, height: 120, areaWidth: 420, areaHeight: 310, baseScale: 1.5 };
  let viewport = { zoom: 1.3, x: 17, y: -11 };
  const start = { x: 100, y: 75 }; const center = { x: 210, y: 155 };
  const beforeGeometry = () => pixfindViewportGeometry({ ...fit, viewport });
  const initial = mapPixfindPoint(start.x, start.y, { left: 0, top: 0 }, beforeGeometry());
  for (const [factor, end] of [[1.8, { x: 120, y: 94 }], [0.72, { x: 108, y: 111 }]]) {
    const currentGeometry = beforeGeometry();
    const source = mapPixfindPoint(start.x, start.y, { left: 0, top: 0 }, currentGeometry);
    viewport = pinchPixfindViewport(viewport, factor, start.x, start.y, end.x, end.y, center.x, center.y, fit.baseScale);
    const result = mapPixfindPoint(end.x, end.y, { left: 0, top: 0 }, beforeGeometry());
    assert.ok(Math.abs(result.x - source.x) < 1e-9);
    assert.ok(Math.abs(result.y - source.y) < 1e-9);
  }
  assert.notDeepEqual(mapPixfindPoint(start.x, start.y, { left: 0, top: 0 }, beforeGeometry()), initial);
});
