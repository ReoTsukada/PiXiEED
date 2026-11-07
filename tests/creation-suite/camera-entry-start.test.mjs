import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const camera = await readFile(new URL('../../js/creation/creation-camera.mjs', import.meta.url), 'utf8');
const engine = await readFile(new URL('../../js/pixel-lens/app.mjs', import.meta.url), 'utf8');
const entry = engine.slice(engine.indexOf('function startCameraFromWorkspaceEntry()'), engine.indexOf('function resumeCameraIfVisible()'));

function fixture(overrides = {}) {
  const calls = [], messages = [];
  const context = {
    isActive: () => true, document: { hidden: false }, audioCameraInvalid: false,
    outputReturnPending: false, state: { mode: 'idle', result: null },
    importedSource: null, pendingCameraRequest: null, cameraStartNeedsRetry: false,
    startCamera: options => calls.push(options), say: message => messages.push(message),
    ...overrides
  };
  runInNewContext(entry, context);
  return { start: () => context.startCameraFromWorkspaceEntry(), calls, messages };
}

test('shared camera entry arms one start only after the current entry is ready', () => {
  assert.doesNotMatch(camera, /getToolStartRoute/);
  assert.match(camera, /if \(epoch !== enterEpoch \|\| !isCurrent\(\)\) return;[\s\S]*startOnEntryResume = true;/);
  assert.match(camera, /suspend\(\) \{ enterEpoch\+\+; startOnEntryResume = false;/);
  assert.match(camera, /if \(startOnEntryResume\) \{\s*startOnEntryResume = false;\s*instance.startCameraFromWorkspaceEntry\?\.\(\);/);
});

test('idle active entry starts without stealing focus', () => {
  const f = fixture();
  assert.equal(f.start(), true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].focus, false);
});

test('reentry resumes idle camera even when it retains its last live preview frame', () => {
  const f = fixture({ state: { mode: 'idle', result: { data: new Uint8ClampedArray(4) } } });
  assert.equal(f.start(), true);
  assert.equal(f.calls.length, 1);
});

test('reentry after a startup failure waits for explicit retry rather than prompting again', () => {
  const f = fixture({ cameraStartNeedsRetry: true });
  assert.equal(f.start(), false);
  assert.equal(f.start(), false);
  assert.equal(f.calls.length, 0);
  assert.match(engine, /if \(audioCameraInvalid \|\| !isActive\(\)\) return;\s*cameraStartNeedsRetry = false;/);
  assert.match(engine, /if \(error\?\.name === 'NotAllowedError' \|\| error\?\.name === 'SecurityError'\) cameraStartNeedsRetry = true;\s*if \(token !== cameraSequence\) return;\s*cameraStartNeedsRetry = true;\s*closeCamera/);
});

test('entry never starts over retained content, a live preview, or inactive UI', () => {
  for (const overrides of [
    { state: { mode: 'captured', result: {} } },
    { importedSource: {} }, { state: { mode: 'live' } }, { state: { mode: 'loading' } },
    { isActive: () => false }, { document: { hidden: true } },
    { audioCameraInvalid: true }, { outputReturnPending: true }
  ]) {
    const f = fixture(overrides);
    assert.equal(f.start(), false);
    assert.equal(f.calls.length, 0);
  }
});

test('reentry while an old permission request is pending does not stack a request', () => {
  const f = fixture({ pendingCameraRequest: Promise.resolve() });
  assert.equal(f.start(), false);
  assert.equal(f.calls.length, 0);
  assert.match(f.messages[0], /許可確認.*再試行/);
});
