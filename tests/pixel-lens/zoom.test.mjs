import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomRange, splitZoom, zoomStops, formatZoom, swipeDirection } from '../../js/pixel-lens/zoom.mjs';

test('unsupported device zoom keeps the full 1x..40x crop range', () => {
  const r = zoomRange(null); assert.equal(r.hardware, false); assert.equal(r.min, 1); assert.equal(r.max, 40);
  assert.deepEqual(splitZoom(3, r), { hardware: 1, digital: 3 });
  assert.deepEqual(splitZoom(40, r), { hardware: 1, digital: 40 });
  assert.deepEqual(zoomStops(r), [1, 2, 5, 10, 20, 40]);
});
test('camera zoom is used first, then centered crop supplies the remaining magnification', () => {
  const r = zoomRange({ zoom: { min: 0.5, max: 5 } });
  assert.equal(r.min, 0.5);
  assert.deepEqual(splitZoom(4, r), { hardware: 4, digital: 1 });
  assert.deepEqual(splitZoom(8, r), { hardware: 5, digital: 1.6 });
  assert.equal(zoomStops(r)[0], 0.5);
  assert.deepEqual(splitZoom(40, r), { hardware: 5, digital: 8 });
  assert.equal(splitZoom(12, zoomRange({ zoom: { min: 1, max: 12, step: 1 } })).digital, 1);
});
test('step values are rounded down so crop remains at least 1x', () => {
  const r = zoomRange({ zoom: { min: 1, max: 5, step: 1 } });
  assert.deepEqual(splitZoom(2.6, r), { hardware: 2, digital: 1.3 });
  assert.deepEqual(splitZoom(40, r), { hardware: 5, digital: 8 });
});
test('invalid hardware capability values cannot create non-finite zoom ranges', () => {
  const r = zoomRange({ zoom: { min: 0, max: Infinity, step: -1 } });
  assert.equal(r.hardware, false);
  assert.deepEqual(splitZoom(Infinity, r), { hardware: 1, digital: 1 });
});
test('zoom labels', () => { assert.equal(formatZoom(1), '1×'); assert.equal(formatZoom(2.35), '2.4×'); assert.equal(formatZoom(0.5), '0.5×'); });
test('swipes: a quick, mostly straight flick picks a direction; small or diagonal moves do not', () => {
  assert.equal(swipeDirection(-120, 10, 200), 'left');
  assert.equal(swipeDirection(120, -20, 200), 'right');
  assert.equal(swipeDirection(5, -150, 250), 'up');
  assert.equal(swipeDirection(-10, 150, 250), 'down');
  assert.equal(swipeDirection(30, 5, 100), null);
  assert.equal(swipeDirection(100, 90, 200), null);
  assert.equal(swipeDirection(-200, 0, 1500), null);
});
