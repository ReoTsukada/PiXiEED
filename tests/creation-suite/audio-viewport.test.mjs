import test from 'node:test';
import assert from 'node:assert/strict';
import { audioViewportGeometry } from '../../js/creation/audio-viewport.mjs';

test('wide canvas cells stay square through fitting and zoom, with pan constrained to reachable dots', () => {
  const input = { width: 64, height: 16, hostWidth: 366, hostHeight: 400 };
  const fit = audioViewportGeometry(input);
  assert.equal(fit.width / 64, fit.height / 16);
  const large = audioViewportGeometry({ ...input, zoom: 8, x: 9000, y: -9000 });
  assert.equal(large.width / 64, large.height / 16);
  assert.equal(large.x, (large.width - input.hostWidth + 12) / 2);
  assert.equal(large.y, -(large.height - input.hostHeight + 12) / 2);
});

test('zoom clamps and fitting resets impossible panning when the whole image fits', () => {
  const result = audioViewportGeometry({ width: 16, height: 16, hostWidth: 350, hostHeight: 450, zoom: .1, x: 9000, y: -9000 });
  assert.equal(result.x, 0); assert.equal(result.y, 0); assert.equal(result.width, 336); assert.equal(result.height, 336);
});
