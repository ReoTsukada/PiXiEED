import { isIntegerStaticImageEnlargement } from '../../js/creation/static-output-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOutputDimensions as validate } from '../../js/creation/output-input-constraints.mjs';

test('common formats use existing global dimension limits and return numeric geometry', () => {
  for (const format of ['png', 'jpeg', 'webp', 'svg', 'gif', 'apng', 'bmp', 'wav', 'mp4']) {
    assert.deepEqual(validateOutputDimensions({ width: '4096', height: '1024', format }), { width: 4096, height: 1024 });
  }
  assert.deepEqual(validateOutputDimensions({ width: 4000, height: 2000, format: 'gif' }), { width: 4000, height: 2000 });
});

test('GIF/APNG use aggregate frame budget including a single frame and the exact edge boundary', () => {
  for (const format of ['gif', 'apng']) {
    assert.throws(() => validateOutputDimensions({ width: 4096, height: 4096, format }), /全1コマ合計800万画素/);
    assert.throws(() => validateOutputDimensions({ width: 2048, height: 2048, format, frameCount: 2 }), /全2コマ合計800万画素/);
    assert.deepEqual(validateOutputDimensions({ width: 4000, height: 2000, format }), { width: 4000, height: 2000 });
  }
});

test('invalid numeric geometry keeps the existing dimension error', () => {
  for (const [width, height] of [[0, 10], [-1, 10], [1.5, 2], [NaN, 2], [Infinity, 2], [4097, 1], [4096, 4097]]) {
    assert.throws(() => validateOutputDimensions({ width, height, format: 'png' }), {
      name: 'RangeError', message: '出力サイズが上限を超えています。幅と高さを小さくしてください。',
    });
  }
  assert.throws(() => validateOutputDimensions({ width: 1024, height: 1024, format: 'png', maxPixels: 1_000_000 }), /出力サイズが上限を超えています/);
});

test('static integer enlargement uses the existing source-relative policy', () => {
  const originalSize = { width: 128, height: 64 };
  const before = { ...originalSize };
  assert.deepEqual(validateOutputDimensions({ width: 4096, height: 2048, format: 'png', requiresIntegerEnlargement: true, originalSize }), { width: 4096, height: 2048 });
  assert.throws(() => validateOutputDimensions({ width: 4096, height: 1024, format: 'png', requiresIntegerEnlargement: true, originalSize }), /縦横とも同じ整数倍/);
  assert.throws(() => validateOutputDimensions({ width: 129, height: 64, format: 'webp', requiresIntegerEnlargement: true, originalSize }), /縦横とも同じ整数倍/);
  assert.deepEqual(originalSize, before, 'validation does not alter the source dimensions');
  assert.deepEqual(validateOutputDimensions({ width: 129, height: 64, format: 'png', requiresIntegerEnlargement: false, originalSize }), { width: 129, height: 64 });
});

test('limits are configurable without implicit normalization or frame changes', () => {
  const request = { width: '3000', height: '2000', format: 'gif', frameCount: 1, maxEdge: 4096, maxPixels: 16 * 1024 * 1024 };
  const original = { ...request };
  assert.deepEqual(validateOutputDimensions(request), { width: 3000, height: 2000 });
  assert.deepEqual(request, original);
  assert.throws(() => validateOutputDimensions({ ...request, frameCount: 2 }), /全2コマ合計800万画素/);
});

function validateOutputDimensions(options) { return validate({ isIntegerEnlargement: isIntegerStaticImageEnlargement, ...options }); }
