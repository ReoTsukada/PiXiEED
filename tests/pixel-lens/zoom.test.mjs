import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomRange, splitZoom, zoomStops, formatZoom, swipeDirection } from '../../js/pixel-lens/zoom.mjs';

test('no optical zoom: everything is digital, 1x..8x', () => {
  const r = zoomRange(null); assert.equal(r.hardware, false); assert.equal(r.min, 1); assert.equal(r.max, 8);
  assert.deepEqual(splitZoom(3, r), { hardware: 1, digital: 3 });
  assert.deepEqual(zoomStops(r), [1, 2, 3, 5]);
});
test('optical zoom first, then crop; an ultra-wide lens adds a 0.5x stop', () => {
  const r = zoomRange({ zoom: { min: 0.5, max: 5 } });
  assert.deepEqual(splitZoom(4, r), { hardware: 4, digital: 1 });
  assert.deepEqual(splitZoom(8, r), { hardware: 5, digital: 1.6 });
  assert.equal(zoomStops(r)[0], 0.5);
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
