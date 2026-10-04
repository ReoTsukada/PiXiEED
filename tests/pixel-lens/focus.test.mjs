import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraFocusController, mapPreviewPointToCameraFocus, pointFocusPlan } from '../../js/pixel-lens/focus.mjs';

const rect = { left: 10, top: 20, width: 400, height: 300 };

test('preview coordinates map through the output center crop into camera coordinates', () => {
  const center = mapPreviewPointToCameraFocus({ clientX: 210, clientY: 170, rect, videoWidth: 1920, videoHeight: 1080, frameWidth: 4, frameHeight: 3 });
  const left = mapPreviewPointToCameraFocus({ clientX: 10, clientY: 170, rect, videoWidth: 1920, videoHeight: 1080, frameWidth: 4, frameHeight: 3 });
  assert.deepEqual(center, { x: 0.5, y: 0.5 });
  assert.equal(left.x, 0.125);
  assert.equal(left.y, 0.5);
});

test('preview coordinates include digital zoom and front-camera mirroring', () => {
  const args = { rect, videoWidth: 1920, videoHeight: 1080, frameWidth: 4, frameHeight: 3, digitalZoom: 2 };
  const normalLeft = mapPreviewPointToCameraFocus({ ...args, clientX: 10, clientY: 170 });
  const mirroredLeft = mapPreviewPointToCameraFocus({ ...args, clientX: 10, clientY: 170, facing: 'user' });
  assert.equal(normalLeft.x, 0.3125);
  assert.equal(mirroredLeft.x, 0.6875);
  assert.equal(normalLeft.y, 0.5);
});

test('preview coordinates reject outside or invalid display geometry', () => {
  assert.equal(mapPreviewPointToCameraFocus({ clientX: 9, clientY: 20, rect, videoWidth: 1920, videoHeight: 1080, frameWidth: 4, frameHeight: 3 }), null);
  assert.equal(mapPreviewPointToCameraFocus({ clientX: 10, clientY: 20, rect: { ...rect, width: 0 }, videoWidth: 1920, videoHeight: 1080, frameWidth: 4, frameHeight: 3 }), null);
});

function makeTrack({ modes = ['single-shot', 'continuous'], constraints = { advanced: [{ zoom: 2 }] }, reject = false } = {}) {
  const calls = [];
  return {
    calls, readyState: 'live',
    getCapabilities: () => ({ focusMode: modes }),
    getSettings: () => ({ pointsOfInterest: [{ x: 0.5, y: 0.5 }] }),
    getConstraints: () => constraints,
    applyConstraints: async (value) => { calls.push(value); if (reject) throw new Error('unsupported'); }
  };
}

test('focus plan prefers single-shot and falls back to continuous', () => {
  assert.deepEqual(pointFocusPlan(makeTrack(), {}), { supported: true, mode: 'single-shot' });
  assert.deepEqual(pointFocusPlan(makeTrack({ modes: ['continuous'] }), {}), { supported: true, mode: 'continuous' });
  assert.deepEqual(pointFocusPlan(makeTrack(), { pointsOfInterest: false }), { supported: true, mode: 'single-shot' });
  const noPointSupport = makeTrack();
  noPointSupport.getSettings = () => ({ focusMode: 'continuous' });
  assert.deepEqual(pointFocusPlan(noPointSupport, {}), { supported: false, reason: 'unsupported' });
});

test('focus request preserves existing camera constraints and reports only a request', async () => {
  const track = makeTrack();
  const controller = createCameraFocusController();
  const point = { x: 0.2, y: 0.7 };
  const result = await controller.request(track, point);
  assert.deepEqual(result, { status: 'requested', mode: 'single-shot', point });
  assert.deepEqual(track.calls[0], { advanced: [{ zoom: 2 }], focusMode: 'single-shot', pointsOfInterest: [point] });
});

test('focus reports unsupported or rejected requests without claiming success', async () => {
  const controller = createCameraFocusController();
  const unsupported = makeTrack({ modes: [] });
  assert.equal((await controller.request(unsupported, { x: 0.2, y: 0.7 })).status, 'unsupported');
  assert.equal(unsupported.calls.length, 0);
  const rejected = makeTrack({ reject: true });
  assert.deepEqual(await controller.request(rejected, { x: 0.2, y: 0.7 }), { status: 'failed', reason: 'apply-rejected' });
});

test('focus request becomes stale if the camera changes or request is canceled while applying', async () => {
  const controller = createCameraFocusController();
  let resolveApply;
  const track = makeTrack();
  track.applyConstraints = () => new Promise((resolve) => { resolveApply = resolve; });
  let current = true;
  const pending = controller.request(track, { x: 0.4, y: 0.6 }, { isCurrent: () => current });
  current = false;
  resolveApply();
  assert.equal((await pending).status, 'stale');
  current = true;
  track.applyConstraints = () => new Promise((resolve) => { resolveApply = resolve; });
  const canceled = controller.request(track, { x: 0.4, y: 0.6 }, { isCurrent: () => current });
  controller.cancel();
  resolveApply();
  assert.equal((await canceled).status, 'stale');
});
