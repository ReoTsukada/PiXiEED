import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceCache } from '../../js/pixel-studio/face-cache.mjs';

function frame(width = 80, height = 60, value = 90) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([value, value, value, 255], i);
  return { width, height, data };
}

const face = [[{ x: 0.3, y: 0.25, z: 0 }, { x: 0.55, y: 0.25 }, { x: 0.42, y: 0.6 }]];

test('reuses cloned landmarks only for the same frame content and session', () => {
  const source = frame();
  const landmarks = structuredClone(face);
  const cache = createFaceCache();
  cache.store({ frame: source, landmarks, session: 4, capturedAt: 100 });
  landmarks[0][0].x = 0.9;
  source.data.fill(0);
  const result = cache.get({ frame: frame(), session: 4, now: 250 });
  assert.equal(result.status, 'ready');
  assert.equal(result.ageMs, 150);
  assert.equal(result.landmarks[0][0].x, 0.3);
  result.landmarks[0][0].x = 0;
  assert.equal(cache.get({ frame: frame(), session: 4, now: 300 }).landmarks[0][0].x, 0.3);
});

test('tolerates small pixel noise and unrelated movement outside face ROIs', () => {
  const original = frame();
  const cache = createFaceCache();
  cache.store({ frame: original, landmarks: face, session: 1, capturedAt: 10 });
  const current = frame();
  const roiPixel = (Math.floor(0.4 * current.height) * current.width + Math.floor(0.4 * current.width)) * 4;
  current.data.set([99, 99, 99, 255], roiPixel); // Noise below the per-channel threshold.
  for (let y = 45; y < 60; y++) for (let x = 0; x < 80; x++) {
    current.data.set([220, 30, 30, 255], (y * 80 + x) * 4);
  }
  assert.equal(cache.get({ frame: current, session: 1, now: 30 }).status, 'ready');
});

test('invalidates when pixels around the face change substantially', () => {
  const original = frame();
  const cache = createFaceCache();
  cache.store({ frame: original, landmarks: face, session: 2, capturedAt: 10 });
  const moved = frame();
  for (let y = 12; y < 42; y++) for (let x = 18; x < 48; x++) {
    moved.data.set([210, 25, 25, 255], (y * moved.width + x) * 4);
  }
  const result = cache.get({ frame: moved, session: 2, now: 40 });
  assert.deepEqual(result, { landmarks: [], status: 'changed', ageMs: 30 });
  assert.equal(cache.get({ frame: moved, session: 2, now: 41 }).status, 'changed', 'changed cache is discarded');
});

test('returns explicit empty status for a stable no-face frame', () => {
  const current = frame();
  const cache = createFaceCache();
  cache.store({ frame: current, landmarks: [], session: 'camera', capturedAt: 0 });
  const result = cache.get({ frame: frame(), session: 'camera', now: 200 });
  assert.deepEqual(result, { landmarks: [], status: 'empty', ageMs: 200 });
});

test('accepts a slightly off-frame face, clips its ROI, and drops a fully off-frame face', () => {
  const current = frame();
  const cache = createFaceCache();
  const partial = [[{ x: -0.03, y: 0.2 }, { x: 0.2, y: 0.25 }, { x: 0.1, y: 0.6 }]];
  cache.store({ frame: current, landmarks: partial, session: 1, capturedAt: 0 });
  assert.equal(cache.get({ frame: frame(), session: 1, now: 1 }).status, 'ready');

  cache.store({ frame: current, landmarks: [[{ x: -0.5, y: 0.2 }, { x: -0.4, y: 0.4 }]], session: 1, capturedAt: 0 });
  const result = cache.get({ frame: frame(), session: 1, now: 1 });
  assert.equal(result.status, 'empty');
  assert.deepEqual(result.landmarks, []);
});

test('checks age from capturedAt and reports session and geometry mismatches', () => {
  const cache = createFaceCache({ maxAgeMs: 1200 });
  cache.store({ frame: frame(), landmarks: face, session: 'a', capturedAt: 1000 });
  assert.equal(cache.get({ frame: frame(), session: 'a', now: 2201 }).status, 'expired');

  cache.store({ frame: frame(), landmarks: face, session: 'a', capturedAt: 1000 });
  assert.equal(cache.get({ frame: frame(), session: 'b', now: 1100 }).status, 'session');
  cache.store({ frame: frame(), landmarks: face, session: 'a', capturedAt: 1000 });
  assert.equal(cache.get({ frame: frame(81), session: 'a', now: 1100 }).status, 'geometry');
});

test('reset clears entries and malformed frames or landmark coordinates are rejected', () => {
  const cache = createFaceCache();
  cache.store({ frame: frame(), landmarks: face, session: 1, capturedAt: 0 });
  cache.reset();
  assert.equal(cache.get({ frame: frame(), session: 1, now: 1 }).status, 'changed');
  assert.throws(() => cache.store({ frame: frame(), landmarks: [[{ x: NaN, y: 0.5 }]], session: 1 }), /finite coordinates/);
  assert.throws(() => cache.store({ frame: frame(), landmarks: [[{ x: 2.1, y: 0.5 }]], session: 1 }), /\[-1, 2\]/);
  assert.throws(() => cache.store({ frame: { width: 80, height: 60, data: new Uint8Array(4) }, landmarks: [], session: 1 }), /RGBA/);
});
