import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraZoomController, getUserMediaWithZoomPreference } from '../../js/pixel-lens/zoom.mjs';

function mockTrack({ min = 1, max = 5, step = 1, zoom = 1, apply = null } = {}) {
  let currentZoom = zoom;
  const calls = [];
  return {
    calls,
    getCapabilities: () => ({ zoom: { min, max, step } }),
    getSettings: () => ({ zoom: currentZoom }),
    applyConstraints: async (constraints) => {
      const target = constraints.advanced[0].zoom;
      calls.push(target);
      await apply?.(target, (value) => { currentZoom = value; });
      if (!apply) currentZoom = target;
    },
    setZoom: (value) => { currentZoom = value; }
  };
}

test('applies camera zoom first and uses crop for the remainder up to 40x', async () => {
  const track = mockTrack({ max: 5 });
  const controller = createCameraZoomController();
  controller.attach(track);
  const result = controller.setZoom(40);
  await new Promise((resolve) => setImmediate(resolve));
  const snapshot = controller.snapshot();
  assert.equal(track.calls.at(-1), 5);
  assert.equal(snapshot.hardware, 5);
  assert.equal(snapshot.digital, 8);
  assert.equal(snapshot.total, 40);
  assert.equal(result.zoom, 40);
});

test('snapshot follows actual camera zoom before applyConstraints resolves without notifying recursively', async () => {
  let releaseApply;
  let notifications = 0;
  const track = mockTrack({ max: 5, apply: (target, setActual) => new Promise((resolve) => {
    releaseApply = () => { setActual(target); resolve(); };
  }) });
  const controller = createCameraZoomController({ onChange: () => { notifications++; } });
  controller.attach(track);
  controller.setZoom(40);
  const notifiedBeforeRead = notifications;
  track.setZoom(5);
  const observed = controller.snapshot();
  assert.equal(observed.hardware, 5);
  assert.equal(observed.digital, 8);
  assert.equal(observed.total, 40);
  assert.equal(notifications, notifiedBeforeRead);
  releaseApply();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.snapshot().total, 40);
});

test('rapid input serializes device updates and applies only the latest queued intent', async () => {
  let releaseFirst;
  const track = mockTrack({ max: 10, apply: async (target, setActual) => {
    if (track.calls.length === 1) await new Promise((resolve) => { releaseFirst = () => { setActual(target); resolve(); }; });
    else setActual(target);
  } });
  const controller = createCameraZoomController();
  controller.attach(track);
  controller.setZoom(2);
  controller.setZoom(20);
  controller.setZoom(12);
  assert.deepEqual(track.calls, [2]);
  releaseFirst();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(track.calls, [2, 10]);
  assert.equal(controller.snapshot().total, 12);
  assert.equal(controller.snapshot().digital, 1.2);
});

test('a stale result from a replaced camera cannot overwrite the new track', async () => {
  let releaseOld;
  const oldTrack = mockTrack({ max: 5, apply: async (target, setActual) => {
    await new Promise((resolve) => { releaseOld = () => { setActual(target); resolve(); }; });
  } });
  const newTrack = mockTrack({ max: 3 });
  const controller = createCameraZoomController();
  controller.attach(oldTrack);
  controller.setZoom(2);
  assert.deepEqual(oldTrack.calls, [2]);
  controller.attach(newTrack);
  controller.setZoom(40);
  await new Promise((resolve) => setImmediate(resolve));
  releaseOld();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const snapshot = controller.snapshot();
  assert.equal(snapshot.track, newTrack);
  assert.equal(snapshot.hardware, 3);
  assert.equal(snapshot.digital, 40 / 3);
  assert.equal(snapshot.total, 40);
});

test('ignored and rejected device zoom preserve the measured hardware value and fall back to crop once', async () => {
  for (const fail of ['ignored', 'reject']) {
    const track = mockTrack({ max: 5, zoom: 5, apply: async (_target, setActual) => {
      if (fail === 'reject') throw new Error('unsupported');
      setActual(5);
    } });
    const controller = createCameraZoomController();
    controller.attach(track);
    controller.setZoom(40);
    await new Promise((resolve) => setImmediate(resolve));
    const snapshot = controller.snapshot();
    assert.equal(snapshot.hardwareFailed, true);
    assert.equal(snapshot.hardware, 5);
    assert.equal(snapshot.digital, 8);
    assert.equal(snapshot.total, 40);
    assert.equal(track.calls.length, 1);
  }
});

test('invalid settings values leave a finite, bounded zoom snapshot', async () => {
  for (const badZoom of [0, -2, NaN, Infinity]) {
    const track = mockTrack({ max: 5, apply: async () => {} });
    track.getSettings = () => ({ zoom: badZoom });
    const controller = createCameraZoomController();
    controller.attach(track);
    controller.setZoom(40);
    await new Promise((resolve) => setImmediate(resolve));
    const snapshot = controller.snapshot();
    assert.equal(Number.isFinite(snapshot.hardware), true);
    assert.equal(Number.isFinite(snapshot.digital), true);
    assert.equal(Number.isFinite(snapshot.total), true);
    assert.equal(snapshot.total, 40);
    assert.equal(snapshot.hardware, 1);
    assert.equal(snapshot.hardwareFailed, true);
  }
});

test('startup settings above the 40x cap stay marked over-limit until hardware returns within range', async () => {
  let releaseFirst;
  const track = mockTrack({ max: 80, zoom: 50, apply: async (target, setActual) => {
    if (track.calls.length === 1) await new Promise((resolve) => { releaseFirst = () => { setActual(target); resolve(); }; });
    else setActual(target);
  } });
  const controller = createCameraZoomController();
  controller.attach(track);
  const initial = controller.snapshot();
  assert.equal(initial.requested, 1);
  assert.equal(initial.total, 50);
  assert.equal(initial.overLimit, true);
  controller.setZoom(40);
  releaseFirst();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const final = controller.snapshot();
  assert.equal(final.total, 40);
  assert.equal(final.overLimit, false);
});

test('camera zoom preference retries without zoom only for zoom-related failures or existing permission', async () => {
  const calls = [];
  const goodTrack = {};
  const getUserMedia = async (options) => {
    calls.push(options);
    if (calls.length === 1) { const error = new Error('zoom unsupported'); error.name = 'OverconstrainedError'; error.constraint = 'zoom'; throw error; }
    return goodTrack;
  };
  assert.equal(await getUserMediaWithZoomPreference(getUserMedia, { zoomSupported: true }), goodTrack);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].video.zoom, true);
  assert.equal('zoom' in calls[1].video, false);

  let permissionCalls = 0;
  await assert.rejects(getUserMediaWithZoomPreference(async () => {
    permissionCalls++;
    const error = new Error('camera denied'); error.name = 'NotAllowedError'; throw error;
  }, { zoomSupported: true, permissions: { query: async () => ({ state: 'prompt' }) } }), { name: 'NotAllowedError' });
  assert.equal(permissionCalls, 1);

  let grantedCalls = 0;
  await getUserMediaWithZoomPreference(async (options) => {
    grantedCalls++;
    if (grantedCalls === 1) { const error = new Error('zoom extension rejected'); error.name = 'NotAllowedError'; throw error; }
    assert.equal('zoom' in options.video, false);
    return goodTrack;
  }, { zoomSupported: true, permissions: { query: async () => ({ state: 'granted' }) } });
  assert.equal(grantedCalls, 2);
});
