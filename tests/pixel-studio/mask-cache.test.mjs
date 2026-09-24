import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaskCache } from '../../js/pixel-studio/mask-cache.mjs';

function frame(width = 48, height = 36, color = [32, 64, 96]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function labels(width = 12, height = 9) {
  return { width, height, labels: new Uint32Array(width * height).fill(7) };
}

function seeded(cache, source = frame(), session = 4, now = 100) {
  const map = labels();
  cache.store({ frame: source, ...map, session, jobId: 11, now, model: 'test-model', instanceCount: 1, aiProcessingMs: 25 });
  return map;
}

test('a same-scene, same-session frame can reuse its fresh low-resolution labels', () => {
  const cache = createMaskCache();
  const source = frame();
  const map = seeded(cache, source);
  const result = cache.get({ frame: frame(), session: 4, now: 400 });

  assert.equal(result.reason, 'valid');
  assert.deepEqual(result.mask, map);
  assert.equal(result.coverage, 1);
  assert.equal(result.ageMs, 300);
  assert.equal(result.aiProcessingMs, 25);
});

test('a localized RGB change invalidates the mask instead of reusing stale object ownership', () => {
  const cache = createMaskCache();
  seeded(cache);
  const moved = frame();
  for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) {
    const p = (y * moved.width + x) * 4;
    moved.data[p] = 240;
    moved.data[p + 1] = 220;
    moved.data[p + 2] = 200;
  }

  const result = cache.get({ frame: moved, session: 4, now: 250 });
  assert.equal(result.mask, null);
  assert.equal(result.reason, 'changed-region');
  assert.equal(cache.get({ frame: moved, session: 4, now: 251 }).reason, 'empty');
});

test('a one-pixel high-contrast boundary shift is detected at the output-grid scale', () => {
  const cache = createMaskCache();
  const reference = frame(640, 360);
  for (let y = 0; y < reference.height; y++) {
    const p = (y * reference.width + 99) * 4;
    reference.data[p] = 255; reference.data[p + 1] = 255; reference.data[p + 2] = 255;
  }
  seeded(cache, reference);
  const shifted = frame(640, 360);
  for (let y = 0; y < shifted.height; y++) {
    const p = (y * shifted.width + 100) * 4;
    shifted.data[p] = 255; shifted.data[p + 1] = 255; shifted.data[p + 2] = 255;
  }
  const result = cache.get({ frame: shifted, session: 4, now: 120 });
  assert.equal(result.mask, null);
  assert.equal(result.reason, 'changed-region');
});

test('a 16-level one-pixel line shift inside the same averaged grid cell rejects the stale mask', () => {
  const cache = createMaskCache();
  const width = 640, height = 360;
  const reference = frame(width, height, [100, 100, 100]);
  for (let y = 0; y < height; y++) reference.data[(y * width + 101) * 4] = 116;
  const map = labels(80, 45);
  cache.store({ frame: reference, ...map, session: 4, jobId: 22, now: 100 });

  const shifted = frame(width, height, [100, 100, 100]);
  for (let y = 0; y < height; y++) shifted.data[(y * width + 102) * 4] = 116;
  const result = cache.get({ frame: shifted, session: 4, now: 200 });

  assert.equal(result.mask, null);
  assert.equal(result.reason, 'changed-region');
  assert.equal(result.sourceChangedPixels, height * 2, 'both the old and new thin-line positions are counted');
});

test('per-channel plus or minus two noise remains reusable and cache operations do not mutate inputs', () => {
  const cache = createMaskCache();
  const source = frame(48, 36, [80, 120, 160]);
  const originalSource = new Uint8ClampedArray(source.data);
  const map = labels();
  const originalLabels = new Uint32Array(map.labels);
  cache.store({ frame: source, ...map, session: 4, jobId: 23, now: 100 });
  const noisy = frame(48, 36, [80, 120, 160]);
  for (let y = 0; y < noisy.height; y++) for (let x = 0; x < noisy.width; x++) {
    const p = (y * noisy.width + x) * 4;
    noisy.data[p] += (x % 3 - 1) * 2;
    noisy.data[p + 1] += (y % 3 - 1) * 2;
    noisy.data[p + 2] += ((x + y) % 3 - 1) * 2;
  }
  const originalNoisy = new Uint8ClampedArray(noisy.data);

  const result = cache.get({ frame: noisy, session: 4, now: 200 });

  assert.equal(result.reason, 'valid');
  assert.ok(result.mask);
  assert.deepEqual(source.data, originalSource);
  assert.deepEqual(noisy.data, originalNoisy);
  assert.deepEqual(map.labels, originalLabels);
});

test('a scene cut, geometry change, or expired mask is discarded', () => {
  const cache = createMaskCache({ maxAgeMs: 500 });
  seeded(cache);
  const cut = cache.get({ frame: frame(48, 36, [220, 210, 200]), session: 4, now: 200 });
  assert.equal(cut.mask, null);
  assert.equal(cut.reason, 'scene-change');

  seeded(cache);
  const geometry = cache.get({ frame: frame(24, 18), session: 4, now: 200 });
  assert.equal(geometry.reason, 'geometry');

  seeded(cache);
  const expired = cache.get({ frame: frame(), session: 4, now: 601 });
  assert.equal(expired.reason, 'expired');

  const referenceTimed = createMaskCache({ maxAgeMs: 15000 });
  const source = frame();
  const map = labels();
  referenceTimed.store({ frame: source, ...map, session: 3, jobId: 12, capturedAt: 1000, now: 6000 });
  assert.equal(referenceTimed.get({ frame: frame(), session: 3, now: 15999 }).reason, 'valid');
  assert.equal(referenceTimed.get({ frame: frame(), session: 3, now: 16001 }).reason, 'expired');
});

test('session mismatch and explicit reset prevent old-session mask reuse', () => {
  const cache = createMaskCache();
  seeded(cache);
  assert.equal(cache.get({ frame: frame(), session: 5, now: 110 }).reason, 'session');
  seeded(cache);
  cache.reset();
  assert.equal(cache.get({ frame: frame(), session: 4, now: 110 }).reason, 'empty');
});

test('malformed frame or mask data is rejected', () => {
  const cache = createMaskCache();
  assert.throws(() => cache.store({ frame: frame(), labels: new Uint16Array(4), width: 2, height: 2, session: 1 }), TypeError);
  assert.throws(() => cache.get({ frame: { width: 1, height: 1, data: new Uint8Array(3) }, session: 1 }), TypeError);
});
