import test from 'node:test';
import assert from 'node:assert/strict';
import { createMiniatureProcessor, miniatureSigma, miniatureWorkSize } from '../../js/pixel-lens/miniature.mjs';

function stripes(width = 96, height = 96) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(x % 2 ? [230, 80, 35, 255] : [25, 170, 220, 255], (y * width + x) * 4);
  return { width, height, data };
}
test('OFF is the original frame, ON preserves its source and the center band', () => {
  const apply = createMiniatureProcessor(), source = stripes(), original = source.data.slice();
  assert.equal(apply(source), source);
  const on = apply(source, true);
  assert.notEqual(on.data, source.data); assert.deepEqual(source.data, original);
  assert.deepEqual(on.data.subarray(39 * 96 * 4, 57 * 96 * 4), original.subarray(39 * 96 * 4, 57 * 96 * 4));
  assert.notDeepEqual(on.data.subarray(0, 96 * 4), original.subarray(0, 96 * 4));
  assert.equal(on.width, source.width); assert.equal(on.height, source.height);
  assert.equal(apply(source, false), source);
});
test('blur transitions are symmetric and rise smoothly towards the top and bottom', () => {
  const height = 100;
  assert.equal(miniatureSigma(49, height), 0); assert.equal(miniatureSigma(40, height), 0);
  for (let y = 0; y < height; y++) assert.ok(Math.abs(miniatureSigma(y, height) - miniatureSigma(height - 1 - y, height)) < 1e-12);
  assert.ok(Math.abs(miniatureSigma(0, height) - 0.6) < 0.0001);
  assert.ok(miniatureSigma(20, height) > miniatureSigma(30, height));
  assert.ok(miniatureSigma(30, height) > miniatureSigma(39, height));
});
test('source processing is bounded independently of the selected output dot count', () => {
  assert.deepEqual(miniatureWorkSize(1920, 1080), { width: 512, height: 288 });
  assert.deepEqual(miniatureWorkSize(480, 480), { width: 480, height: 480 });
  assert.deepEqual(miniatureWorkSize(270, 480), { width: 270, height: 480 });
  assert.equal(miniatureSigma(7, 16), 0);
});
test('flat colour and edge pixels do not acquire dark borders or new tone boosts', () => {
  const apply = createMiniatureProcessor();
  for (const [width, height] of [[1, 256], [256, 1], [16, 16], [144, 256], [256, 144]]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set([121, 184, 68, 255], i);
    assert.deepEqual(apply({ width, height, data }, true).data, data);
  }
});
test('repeated toggles, resizing and new images never accumulate blur or mutate a published frame', () => {
  const apply = createMiniatureProcessor(), first = stripes();
  const once = apply(first, true), preserved = once.data.slice();
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(apply(first, true).data, preserved);
    assert.equal(apply(first, false), first);
    apply(stripes(144, 256), true);
    apply(stripes(16, 16), true);
  }
  assert.deepEqual(once.data, preserved);
  const changed = stripes(); changed.data.fill(255);
  assert.deepEqual(apply(changed, true).data, changed.data);
});
test('opaque camera alpha is preserved and malformed frames fail explicitly when enabled', () => {
  const apply = createMiniatureProcessor(), source = stripes(128, 96), result = apply(source, true);
  for (let i = 3; i < result.data.length; i += 4) assert.equal(result.data[i], 255);
  assert.throws(() => apply({ width: 2, height: 2, data: new Uint8Array(3) }, true), /Invalid camera frame/);
});
