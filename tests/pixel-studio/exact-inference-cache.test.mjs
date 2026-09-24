import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaskCache } from '../../js/pixel-studio/mask-cache.mjs';
import { createFaceCache } from '../../js/pixel-studio/face-cache.mjs';

function frame(width = 20, height = 16, color = [80, 100, 120]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function labels() { return new Uint32Array(5 * 4).fill(3); }
const face = [[{ x: 0.3, y: 0.25 }, { x: 0.55, y: 0.25 }, { x: 0.42, y: 0.6 }]];

test('opt-in mask reuse extends only exact RGB frames beyond the TTL', () => {
  const cache = createMaskCache({ maxAgeMs: 10, reuseExactFrame: true });
  const source = frame();
  const labelMap = labels();
  cache.store({ frame: source, labels: labelMap, width: 5, height: 4, session: 4, jobId: 7, capturedAt: 100 });

  const exact = cache.get({ frame: frame(), session: 4, now: 1000 });
  assert.equal(exact.reason, 'valid');
  assert.equal(exact.exactFrame, true);
  assert.equal(exact.ageMs, 900, 'inference age remains measured from the original capture');
  assert.deepEqual(exact.mask.labels, labelMap);

  const changed = frame();
  changed.data[0] += 1;
  const oneLevelDifference = cache.get({ frame: changed, session: 4, now: 1001 });
  assert.equal(oneLevelDifference.reason, 'expired', 'one RGB channel change does not extend TTL');
});

test('near mask matches remain bounded by the original capture time', () => {
  const cache = createMaskCache({ maxAgeMs: 10, reuseExactFrame: true });
  cache.store({ frame: frame(), labels: labels(), width: 5, height: 4, session: 4, jobId: 8, capturedAt: 100 });

  const near = frame();
  near.data[0] += 1;
  const withinTtl = cache.get({ frame: near, session: 4, now: 108 });
  assert.equal(withinTtl.reason, 'valid');
  assert.equal(withinTtl.exactFrame, false);

  const expiredCache = createMaskCache({ maxAgeMs: 10, reuseExactFrame: true });
  expiredCache.store({ frame: frame(), labels: labels(), width: 5, height: 4, session: 4, jobId: 8, capturedAt: 100 });
  assert.equal(expiredCache.get({ frame: near, session: 4, now: 111 }).reason, 'expired');
});

test('negative mask outcomes are reusable only for exact RGB and matching session/geometry', () => {
  const cache = createMaskCache({ maxAgeMs: 10, reuseExactFrame: true });
  cache.storeEmpty({ frame: frame(), session: 'still', jobId: 9, capturedAt: 100 });
  const exact = cache.get({ frame: frame(), session: 'still', now: 1000 });
  assert.equal(exact.reason, 'no-instances');
  assert.equal(exact.exactFrame, true);
  assert.equal(exact.mask, null);

  const changed = frame();
  changed.data[0] += 1;
  const near = cache.get({ frame: changed, session: 'still', now: 1001 });
  assert.notEqual(near.reason, 'no-instances');

  const wrongSession = createMaskCache({ maxAgeMs: 10, reuseExactFrame: true });
  wrongSession.storeEmpty({ frame: frame(), session: 'still', jobId: 10, capturedAt: 100 });
  assert.equal(wrongSession.get({ frame: frame(), session: 'new', now: 1000 }).reason, 'session');
  assert.equal(wrongSession.get({ frame: frame(19), session: 'still', now: 1000 }).reason, 'empty');
});

test('opt-in face reuse matches every RGB pixel, including outside cached face ROIs', () => {
  const cache = createFaceCache({ maxAgeMs: 10, reuseExactFrame: true });
  cache.store({ frame: frame(), landmarks: face, session: 2, capturedAt: 100 });
  const exact = cache.get({ frame: frame(), session: 2, now: 1000 });
  assert.equal(exact.status, 'ready');
  assert.equal(exact.exactFrame, true);
  assert.equal(exact.ageMs, 900, 'landmark age remains anchored to the original detection');

  const changedOutsideRoi = frame();
  const outside = (15 * changedOutsideRoi.width + 19) * 4;
  changedOutsideRoi.data[outside] += 1;
  const nearCache = createFaceCache({ maxAgeMs: 10, reuseExactFrame: true });
  nearCache.store({ frame: frame(), landmarks: face, session: 2, capturedAt: 100 });
  const near = nearCache.get({ frame: changedOutsideRoi, session: 2, now: 101 });
  assert.equal(near.status, 'ready', 'existing ROI reuse remains intact');
  assert.notEqual(near.exactFrame, true, 'an ROI-external RGB change is not treated as an exact frame');

  const expiredCache = createFaceCache({ maxAgeMs: 10, reuseExactFrame: true });
  expiredCache.store({ frame: frame(), landmarks: face, session: 2, capturedAt: 100 });
  const changedInside = frame();
  changedInside.data[0] += 1;
  assert.equal(expiredCache.get({ frame: changedInside, session: 2, now: 111 }).status, 'expired');
});

test('negative face results also reuse exact frames only', () => {
  const cache = createFaceCache({ maxAgeMs: 10, reuseExactFrame: true });
  cache.store({ frame: frame(), landmarks: [], session: 3, capturedAt: 100 });
  const exact = cache.get({ frame: frame(), session: 3, now: 1000 });
  assert.equal(exact.status, 'empty');
  assert.equal(exact.exactFrame, true);

  const changed = frame();
  changed.data[0] += 1;
  const result = cache.get({ frame: changed, session: 3, now: 101 });
  assert.equal(result.status, 'empty', 'the tolerant empty result may remain visible briefly');
  assert.notEqual(result.exactFrame, true);

  const boundaryCache = createFaceCache({ maxAgeMs: 10, reuseExactFrame: true });
  boundaryCache.store({ frame: frame(), landmarks: face, session: 'face', capturedAt: 100 });
  assert.equal(boundaryCache.get({ frame: frame(), session: 'other', now: 1000 }).status, 'session');
  boundaryCache.store({ frame: frame(), landmarks: face, session: 'face', capturedAt: 100 });
  assert.equal(boundaryCache.get({ frame: frame(19), session: 'face', now: 1000 }).status, 'geometry');
});
