import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCameraPng, pngExportGeometry } from '../../js/pixel-studio/png-export.mjs';

test('scales common 64, 128, 256, and 512 frames by exact integer factors', () => {
  for (const longEdge of [64, 128, 256, 512]) {
    const scale = 2048 / longEdge;
    for (const [width, height] of [[longEdge, longEdge], [longEdge, longEdge / 2], [longEdge / 2, longEdge]]) {
      const result = pngExportGeometry(width, height);
      assert.deepEqual(result, { width: width * scale, height: height * scale, scale });
      assert.equal(result.width / result.height, width / height, 'portrait, landscape, and square aspect ratios are exact');
      assert.equal(Math.max(result.width, result.height), 2048);
    }
  }
});

test('uses floor integer scaling near the 2048 target and never shrinks a frame', () => {
  assert.deepEqual(pngExportGeometry(67, 43), { width: 2010, height: 1290, scale: 30 });
  assert.deepEqual(pngExportGeometry(1024, 512), { width: 2048, height: 1024, scale: 2 });
  assert.deepEqual(pngExportGeometry(2048, 1024), { width: 2048, height: 1024, scale: 1 });
  assert.deepEqual(pngExportGeometry(2049, 1000), { width: 2049, height: 1000, scale: 1 });
  assert.deepEqual(pngExportGeometry(8192, 2048), { width: 8192, height: 2048, scale: 1 });
});

test('rejects invalid or excessively large geometry', () => {
  for (const [width, height] of [[0, 10], [-1, 10], [10, 0], [1.5, 10], [NaN, 10], [Infinity, 10], ['64', 64]]) {
    assert.throws(() => pngExportGeometry(width, height), RangeError);
  }
  assert.throws(() => pngExportGeometry(8193, 1), RangeError, 'long source edges have a safe upper bound');
  assert.throws(() => pngExportGeometry(8192, 2049), RangeError, 'source pixel count is bounded');
});

test('validates frame RGBA before touching browser canvas APIs', async () => {
  await assert.rejects(() => encodeCameraPng(null), TypeError);
  await assert.rejects(() => encodeCameraPng({ width: 2, height: 2, data: new Uint8Array(16) }), TypeError);
  await assert.rejects(() => encodeCameraPng({ width: 2, height: 2, data: new Uint8ClampedArray(15) }), TypeError);
  await assert.rejects(() => encodeCameraPng({ width: 0, height: 2, data: new Uint8ClampedArray(0) }), RangeError);
  if (typeof document === 'undefined') {
    await assert.rejects(() => encodeCameraPng({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
      /PNGを準備できませんでした/);
  }
});
