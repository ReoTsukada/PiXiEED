import test from 'node:test';
import assert from 'node:assert/strict';

class FakeSegmentationWorker {
  static current = null;
  static faceCurrent = null;
  listeners = new Map();
  jobs = [];
  cancellations = [];
  transferredViews = [];

  constructor(url) {
    this.url = String(url);
    this.kind = this.url.endsWith('/face-worker.mjs') ? 'face' : 'segmentation';
    if (this.kind === 'face') FakeSegmentationWorker.faceCurrent = this;
    else FakeSegmentationWorker.current = this;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message, transfer = []) {
    if (message.type === 'cancel') {
      this.cancellations.push(message);
      return;
    }
    if (this.kind === 'face') {
      assert.equal(message.type, 'detect-face');
      this.transferredViews.push(message.frame.data);
      this.jobs.push(structuredClone(message, { transfer }));
      return;
    }
    assert.equal(message.type, 'segment');
    // Match browser transfer semantics: preview worker no longer owns this buffer.
    this.transferredViews.push(message.frame.data);
    const transferred = structuredClone(message, { transfer });
    this.jobs.push(transferred);
  }

  emit(message, transfer = []) {
    const data = structuredClone(message, { transfer });
    for (const listener of this.listeners.get('message') ?? []) listener({ data });
  }
}

function createWorkerEnvironment() {
  const listeners = new Map();
  const posted = [];
  const self = {
    location: { href: 'http://localhost/js/pixel-studio/preview-worker.mjs' },
    addEventListener(type, listener) {
      const entries = listeners.get(type) ?? [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    postMessage(message, transfer = []) {
      posted.push(structuredClone(message, { transfer }));
    },
    async dispatch(message) {
      const copy = message.frame
        ? structuredClone(message, { transfer: [message.frame.data.buffer] })
        : structuredClone(message);
      for (const listener of listeners.get('message') ?? []) listener({ data: copy });
    }
  };
  return { self, posted };
}

function sourceFrame(width = 48, height = 36, rgb = [80, 100, 120]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function outputFor(posted, requestId) {
  return posted.findLast((message) => message.requestId === requestId && message.result);
}

function completeJob(worker, job, { labels = true, error = null } = {}) {
  if (error) {
    worker.emit({ type: 'segmentation-result', jobId: job.jobId, session: job.session, error });
    return;
  }
  const labelWidth = 12, labelHeight = 9;
  const ownerLabels = labels ? new Uint32Array(labelWidth * labelHeight).fill(5) : null;
  const frame = job.frame;
  const transfer = [frame.data.buffer];
  if (ownerLabels) transfer.push(ownerLabels.buffer);
  worker.emit({ type: 'segmentation-result', jobId: job.jobId, session: job.session,
    frame, capturedAt: job.capturedAt, labels: ownerLabels,
    labelWidth: labels ? labelWidth : 0, labelHeight: labels ? labelHeight : 0,
    model: 'fixture', instanceCount: labels ? 1 : 0, trackingMatches: 0,
    aiProcessingMs: 4500, resourceOrigins: ['http://localhost'] }, transfer);
}

function completeFaceJob(worker, job, { landmarks = faceLandmarks(), error = null } = {}) {
  const message = error
    ? { type: 'face-result', jobId: job.jobId, session: job.session, error }
    : { type: 'face-result', jobId: job.jobId, session: job.session,
      capturedAt: job.capturedAt, frame: job.frame, landmarks, processingMs: 12 };
  worker.emit(message, message.frame ? [message.frame.data.buffer] : []);
}

function faceLandmarks(x = 0.5, y = 0.5) {
  const points = Array.from({ length: 468 }, () => ({ x, y, z: 0 }));
  points[234] = { x: 0.3, y, z: 0 };
  points[454] = { x: 0.7, y, z: 0 };
  return [points];
}

function detailFrame(moved = false) {
  const frame = sourceFrame(48, 36, [100, 100, 100]);
  const left = moved ? 27 : 22;
  for (let y = 15; y <= 21; y++) for (let x = left; x <= left + 6; x++) {
    const offset = (y * frame.width + x) * 4;
    frame.data[offset] = frame.data[offset + 1] = frame.data[offset + 2] = 120;
  }
  return frame;
}

test('preview returns immediately, refreshes valid masks, and isolates session and failure outcomes', async () => {
  const environment = createWorkerEnvironment();
  globalThis.self = environment.self;
  globalThis.Worker = FakeSegmentationWorker;
  const moduleUrl = new URL(`../../js/pixel-studio/preview-worker.mjs?test=${Date.now()}`, import.meta.url);
  await import(moduleUrl.href);
  const aiWorker = FakeSegmentationWorker.current;
  assert.match(aiWorker.url, /segmentation-worker\.mjs$/);

  // First preview is posted before any synthetic AI result can arrive.
  await environment.self.dispatch({ requestId: 1, session: 10, frame: sourceFrame(), diagnostics: true });
  const first = outputFor(environment.posted, 1);
  assert.equal(first.result.aiStatus, 'processing');
  assert.equal(first.result.stats.quality, 'unsegmented');
  assert.equal(aiWorker.jobs.length, 1);
  assert.equal(aiWorker.jobs[0].session, 10);
  assert.equal(aiWorker.jobs[0].frame.data.length, 48 * 36 * 4);
  assert.notEqual(aiWorker.jobs[0].frame.data.buffer, first.result.data.buffer);
  assert.equal(aiWorker.transferredViews[0].byteLength, 0, 'AI ownership transfer must not reuse the source buffer in preview');
  assert.equal(aiWorker.jobs[0].diagnostics, true);

  // No queue: while inference is active, the next ordinary frame still renders.
  await environment.self.dispatch({ requestId: 2, session: 10, frame: sourceFrame() });
  assert.equal(outputFor(environment.posted, 2).result.aiStatus, 'processing');
  assert.equal(aiWorker.jobs.length, 1);

  completeJob(aiWorker, aiWorker.jobs[0]);
  // A fresh, slightly changed frame uses the valid mask while refreshing it.
  await environment.self.dispatch({ requestId: 3, session: 10, frame: sourceFrame(48, 36, [81, 100, 120]) });
  const masked = outputFor(environment.posted, 3);
  assert.equal(masked.result.aiStatus, 'ready');
  assert.equal(masked.result.stats.quality, 'segmented');
  assert.equal(masked.result.maskAgeMs >= 0, true);
  assert.equal(masked.result.maskCoverage, 1);
  assert.equal(aiWorker.jobs.length, 2);

  // An explicit session cancellation drops both cache and the in-flight result.
  await environment.self.dispatch({ type: 'cancel', session: 10 });
  assert.equal(aiWorker.cancellations.some((item) => item.session === 10), true);
  await environment.self.dispatch({ requestId: 4, session: 11, frame: sourceFrame() });
  assert.equal(outputFor(environment.posted, 4).result.aiStatus, 'processing');
  assert.equal(aiWorker.jobs.length, 3);
  const newSessionJob = aiWorker.jobs[2];

  // Late completion from the old session cannot populate the new session's cache.
  completeJob(aiWorker, aiWorker.jobs[1]);
  await environment.self.dispatch({ requestId: 5, session: 11, frame: sourceFrame() });
  assert.equal(outputFor(environment.posted, 5).result.aiStatus, 'processing');
  assert.equal(outputFor(environment.posted, 5).result.stats.quality, 'unsegmented');
  assert.equal(aiWorker.jobs.length, 3);

  completeJob(aiWorker, newSessionJob, { error: 'fixture inference failure' });
  await environment.self.dispatch({ requestId: 6, session: 11, frame: sourceFrame() });
  const failed = outputFor(environment.posted, 6);
  assert.equal(failed.result.aiStatus, 'unavailable');
  assert.match(failed.result.aiFailureReason, /fixture inference failure/);
  assert.equal(failed.result.stats.quality, 'unsegmented');
  assert.equal(aiWorker.jobs.length, 3, 'AI failure is not retried during the same camera session');

  await environment.self.dispatch({ requestId: 7, session: 12, frame: sourceFrame() });
  assert.equal(outputFor(environment.posted, 7).result.aiStatus, 'processing');
  assert.equal(aiWorker.jobs.length, 4, 'a new camera session retries AI initialization');
});

test('preview renders each supported output size and rejects invalid size before changing session state', async () => {
  const environment = createWorkerEnvironment();
  globalThis.self = environment.self;
  globalThis.Worker = FakeSegmentationWorker;
  const moduleUrl = new URL(`../../js/pixel-studio/preview-worker.mjs?size-test=${Date.now()}`, import.meta.url);
  await import(moduleUrl.href);
  const aiWorker = FakeSegmentationWorker.current;
  const frame = sourceFrame(600, 400);
  const expected = new Map([[64, [64, 43]], [128, [128, 85]], [256, [256, 171]], [512, [512, 341]]]);

  for (const [index, size] of [64, 128, 256, 512].entries()) {
    await environment.self.dispatch({ requestId: 100 + index, session: 30, frame: sourceFrame(600, 400), size });
    const result = outputFor(environment.posted, 100 + index).result;
    assert.deepEqual([result.width, result.height], expected.get(size));
    assert.equal(result.stats.temporalHeldCells, 0, 'changing output dimensions clears prior temporal renderer state');
  }

  const cancelsBefore = aiWorker.cancellations.length;
  await environment.self.dispatch({ requestId: 110, session: 31, frame, size: 100 });
  assert.match(environment.posted.findLast((message) => message.requestId === 110).error, /size must be one of/);
  assert.equal(aiWorker.cancellations.length, cancelsBefore, 'invalid size does not cancel the current session');
  await environment.self.dispatch({ requestId: 111, session: 30, frame: sourceFrame(600, 400), size: 512 });
  assert.deepEqual([outputFor(environment.posted, 111).result.width, outputFor(environment.posted, 111).result.height], [512, 341]);
});

test('an exact all-zero video placeholder waits without locking or scheduling AI, then accepts the first usable frame', async () => {
  const environment = createWorkerEnvironment();
  globalThis.self = environment.self;
  globalThis.Worker = FakeSegmentationWorker;
  const moduleUrl = new URL(`../../js/pixel-studio/preview-worker.mjs?zero-placeholder=${Date.now()}`, import.meta.url);
  await import(moduleUrl.href);
  const aiWorker = FakeSegmentationWorker.current;
  const faceWorker = FakeSegmentationWorker.faceCurrent;

  await environment.self.dispatch({ requestId: 180, session: 35, paletteEpoch: 4, frame: sourceFrame(32, 24, [0, 0, 0]) });
  const placeholder = environment.posted.findLast((message) => message.requestId === 180);
  assert.equal(placeholder.pending, true);
  assert.equal(placeholder.cancelled, true, 'existing request clients treat a pending placeholder as a non-error no-frame result');
  assert.equal(placeholder.result, undefined);
  assert.equal(aiWorker.jobs.length, 0);
  assert.equal(faceWorker.jobs.length, 0);

  await environment.self.dispatch({ requestId: 181, session: 35, paletteEpoch: 4, frame: sourceFrame(32, 24, [1, 0, 0]) });
  const usable = outputFor(environment.posted, 181);
  assert.ok(usable?.result, 'the first nonzero RGB frame is rendered');
  assert.equal(aiWorker.jobs.length, 1, 'AI starts only after usable image data arrives');
  assert.equal(faceWorker.jobs.length, 1);
});

test('all-zero frames are still rendered after the session palette has locked', async () => {
  const environment = createWorkerEnvironment();
  globalThis.self = environment.self;
  globalThis.Worker = FakeSegmentationWorker;
  const moduleUrl = new URL(`../../js/pixel-studio/preview-worker.mjs?locked-black=${Date.now()}`, import.meta.url);
  await import(moduleUrl.href);

  const colored = sourceFrame(32, 24, [28, 20, 14]);
  for (let y = 0; y < colored.height; y++) for (let x = 16; x < colored.width; x++) {
    const p = (y * colored.width + x) * 4;
    colored.data[p] = 220; colored.data[p + 1] = 172; colored.data[p + 2] = 84;
  }
  await environment.self.dispatch({ requestId: 182, session: 36, paletteEpoch: 5, frame: colored });
  const first = outputFor(environment.posted, 182);
  assert.ok(first?.result);
  assert.equal(first.result.stats.paletteLocked, true);
  assert.equal(first.result.stats.paletteRevision, 1);

  await environment.self.dispatch({ requestId: 183, session: 36, paletteEpoch: 5, frame: sourceFrame(32, 24, [0, 0, 0]) });
  const black = outputFor(environment.posted, 183);
  assert.ok(black?.result, 'a real fade-to-black must not be left pending');
  assert.equal(black.result.stats.paletteLocked, true);
  assert.equal(black.result.stats.paletteRevision, 1, 'rendering black does not relock the palette');
  const colors = new Set();
  for (let p = 0; p < black.result.data.length; p += 4) colors.add(`${black.result.data[p]},${black.result.data[p + 1]},${black.result.data[p + 2]}`);
  assert.equal(colors.size, 1, 'the current black frame replaces the previous two-color image without a ghost');
});

test('rejecting a late changed-region mask does not reset unsegmented material history', async () => {
  async function run({ completeLateMask }) {
    const environment = createWorkerEnvironment();
    globalThis.self = environment.self;
    globalThis.Worker = FakeSegmentationWorker;
    const moduleUrl = new URL(`../../js/pixel-studio/preview-worker.mjs?late-mask-history=${completeLateMask}-${Date.now()}-${Math.random()}`, import.meta.url);
    await import(moduleUrl.href);
    const aiWorker = FakeSegmentationWorker.current;
    const base = sourceFrame(48, 36, [60, 60, 114]);
    const boundaryShift = sourceFrame(48, 36, [58, 58, 116]);

    await environment.self.dispatch({ requestId: 240, session: 71, paletteEpoch: 9, frame: base });
    await environment.self.dispatch({ requestId: 241, session: 71, paletteEpoch: 9, frame: boundaryShift });
    const aiJob = aiWorker.jobs[0];
    if (completeLateMask) completeJob(aiWorker, aiJob);

    // The local changed pixel is enough to reject the stale mask's source snapshot,
    // but too small to constitute a renderer scene cut.
    const current = sourceFrame(48, 36, [58, 58, 116]);
    const p = (17 * current.width + 23) * 4;
    current.data[p] = 96;
    current.data[p + 1] = 96;
    current.data[p + 2] = 150;
    await environment.self.dispatch({ requestId: 242, session: 71, paletteEpoch: 9, frame: current, diagnostics: true });
    return outputFor(environment.posted, 242).result;
  }

  const uninterrupted = await run({ completeLateMask: false });
  const staleMaskRejected = await run({ completeLateMask: true });
  assert.ok(uninterrupted.stats.materialHeldCells > 0, 'the control frame must use anchored material history');
  assert.equal(staleMaskRejected.maskInvalidation, 'changed-region');
  assert.equal(staleMaskRejected.stats.paletteRevision, uninterrupted.stats.paletteRevision);
  assert.equal(staleMaskRejected.stats.sceneCut, false);
  assert.deepEqual(staleMaskRejected.data, uninterrupted.data,
    'a rejected mask that was never used must not rebase the renderer and alter its held material/tone output');
});

test('face landmarks protect preview details and cached landmarks expire when the face region moves', async () => {
  const environment = createWorkerEnvironment();
  globalThis.self = environment.self;
  globalThis.Worker = FakeSegmentationWorker;
  const moduleUrl = new URL(`../../js/pixel-studio/preview-worker.mjs?face-cache=${Date.now()}`, import.meta.url);
  await import(moduleUrl.href);
  const faceWorker = FakeSegmentationWorker.faceCurrent;
  assert.match(faceWorker.url, /face-worker\.mjs$/);

  await environment.self.dispatch({ requestId: 201, session: 41, frame: detailFrame() });
  const initial = outputFor(environment.posted, 201);
  assert.ok(initial?.result, 'ordinary preview is available before face inference completes');
  assert.equal(initial.result.faceStatus, 'changed', 'the first frame has no face cache yet');
  assert.equal(faceWorker.jobs.length, 1);
  assert.equal(faceWorker.jobs[0].type, 'detect-face');
  completeFaceJob(faceWorker, faceWorker.jobs[0]);

  await environment.self.dispatch({ requestId: 202, session: 41, frame: detailFrame() });
  const protectedResult = outputFor(environment.posted, 202).result;
  assert.equal(protectedResult.faceStatus, 'ready');
  assert.equal(protectedResult.faceCount, 1);
  assert.ok(protectedResult.stats.protectedDetailCells > 0);
  assert.equal(protectedResult.maskInvalidation, 'empty', 'face landmarks are cached separately from segmentation masks');

  await environment.self.dispatch({ requestId: 203, session: 41, frame: detailFrame(true) });
  const moved = outputFor(environment.posted, 203).result;
  assert.equal(moved.faceCount, 0, 'changed pixels in the cached face ROI clear stale landmarks');
  assert.equal(moved.faceStatus, 'changed');
  assert.ok(moved.data instanceof Uint8ClampedArray, 'face cache invalidation does not interrupt rendering');
});

test('late face inference from an old session cannot populate the current face cache', async () => {
  const environment = createWorkerEnvironment();
  globalThis.self = environment.self;
  globalThis.Worker = FakeSegmentationWorker;
  const moduleUrl = new URL(`../../js/pixel-studio/preview-worker.mjs?face-session=${Date.now()}`, import.meta.url);
  await import(moduleUrl.href);
  const faceWorker = FakeSegmentationWorker.faceCurrent;

  await environment.self.dispatch({ requestId: 211, session: 51, frame: sourceFrame() });
  const oldJob = faceWorker.jobs[0];
  await environment.self.dispatch({ requestId: 212, session: 52, frame: sourceFrame() });
  const currentJob = faceWorker.jobs[1];
  assert.ok(faceWorker.cancellations.some((item) => item.session === 51));

  completeFaceJob(faceWorker, oldJob);
  await environment.self.dispatch({ requestId: 213, session: 52, frame: sourceFrame() });
  assert.equal(outputFor(environment.posted, 213).result.faceCount, 0);
  assert.equal(faceWorker.jobs.length, 2, 'the late result does not replace the current in-flight job');

  completeFaceJob(faceWorker, currentJob);
  await environment.self.dispatch({ requestId: 214, session: 52, frame: sourceFrame() });
  assert.equal(outputFor(environment.posted, 214).result.faceCount, 1);
  assert.equal(outputFor(environment.posted, 214).result.faceStatus, 'ready');
});

test('face inference failure leaves the regular preview available and retries on a new session', async () => {
  const environment = createWorkerEnvironment();
  globalThis.self = environment.self;
  globalThis.Worker = FakeSegmentationWorker;
  const moduleUrl = new URL(`../../js/pixel-studio/preview-worker.mjs?face-failure=${Date.now()}`, import.meta.url);
  await import(moduleUrl.href);
  const faceWorker = FakeSegmentationWorker.faceCurrent;

  await environment.self.dispatch({ requestId: 221, session: 61, frame: sourceFrame() });
  completeFaceJob(faceWorker, faceWorker.jobs[0], { error: 'fixture face inference failure' });
  await environment.self.dispatch({ requestId: 222, session: 61, frame: sourceFrame() });
  const failed = outputFor(environment.posted, 222).result;
  assert.equal(failed.faceStatus, 'unavailable');
  assert.match(failed.faceFailure, /fixture face inference failure/);
  assert.ok(failed.data instanceof Uint8ClampedArray, 'face inference failure does not block the pixel preview');

  await environment.self.dispatch({ requestId: 223, session: 62, frame: sourceFrame() });
  assert.equal(faceWorker.jobs.length, 2, 'a new session starts another face inference attempt');
  assert.equal(outputFor(environment.posted, 223).result.faceFailure, null);
});


test('eight-level default and comparison modes keep the same AI cache and validate before mutation', async () => {
  const environment = createWorkerEnvironment();
  globalThis.self = environment.self;
  globalThis.Worker = FakeSegmentationWorker;
  await import(new URL(`../../js/pixel-studio/preview-worker.mjs?global-modes=${Date.now()}`, import.meta.url));
  const aiWorker = FakeSegmentationWorker.current;
  await environment.self.dispatch({ requestId: 301, session: 81, paletteEpoch: 1, frame: sourceFrame() });
  const initial = outputFor(environment.posted, 301).result;
  assert.equal(initial.stats.globalToneLevels, 8);
  assert.equal(initial.stats.dither, 'selective-canvas-2x2');
  completeJob(aiWorker, aiWorker.jobs[0]);
  for (const [i, toneLevels, dither] of [[2, 4, 'none'], [3, 8, 'none'], [4, 8, 'ordered'], [5, 4, 'ordered']]) {
    await environment.self.dispatch({ requestId: 300 + i, session: 81, paletteEpoch: i, toneLevels, dither, frame: sourceFrame() });
    const result = outputFor(environment.posted, 300 + i).result;
    assert.equal(result.stats.globalToneLevels, toneLevels);
    assert.equal(result.stats.dither, dither === 'none' ? 'none' : 'selective-canvas-2x2');
    assert.equal(result.aiStatus, 'ready', 'tone comparisons retain already computed recognition');
    assert.ok(result.stats.maxPaletteGrayError <= 1);
  }
  const before = aiWorker.cancellations.length;
  await environment.self.dispatch({ requestId: 306, session: 82, toneLevels: 5, frame: sourceFrame() });
  assert.match(environment.posted.findLast(m => m.requestId === 306).error, /toneLevels/);
  assert.equal(aiWorker.cancellations.length, before);
  await environment.self.dispatch({ requestId: 307, session: 82, paletteEpoch: 99, toneLevels: 8,
    frame: { ...sourceFrame(), width: 1 } });
  assert.match(environment.posted.findLast(m => m.requestId === 307).error, /frame/);
  assert.equal(aiWorker.cancellations.length, before, 'malformed pixels do not replace the session or its AI cache');
  await environment.self.dispatch({ requestId: 308, session: 81, paletteEpoch: 5, toneLevels: 4, frame: sourceFrame() });
  assert.equal(outputFor(environment.posted, 308).result.aiStatus, 'ready');
  assert.deepEqual(outputFor(environment.posted, 308).result.palette, outputFor(environment.posted, 305).result.palette);
});


test('positive and negative exact-frame inference is reused while changed pixels schedule fresh work', async (t) => {
  let now = 10000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(performance, 'now', () => now);
  for (const hasObjects of [true, false]) {
    const environment = createWorkerEnvironment();
    globalThis.self = environment.self; globalThis.Worker = FakeSegmentationWorker;
    await import(new URL(`../../js/pixel-studio/preview-worker.mjs?exact=${hasObjects}`, import.meta.url));
    const ai = FakeSegmentationWorker.current, face = FakeSegmentationWorker.faceCurrent;
    await environment.self.dispatch({ requestId: 1, session: 8, frame: sourceFrame() });
    completeJob(ai, ai.jobs[0], { labels: hasObjects });
    completeFaceJob(face, face.jobs[0], { landmarks: hasObjects ? faceLandmarks() : [] });
    for (let id = 2; id <= 7; id++) {
      now += 20000;
      await environment.self.dispatch({ requestId: id, session: 8, frame: sourceFrame() });
      const result = outputFor(environment.posted, id).result;
      assert.equal(result.aiStatus, hasObjects ? 'ready' : 'no-instances');
      assert.equal(result.inference.objectReused, true);
      assert.equal(result.inference.faceReused, true);
      assert.equal(result.inference.objectJobs, 1);
      assert.equal(result.inference.faceJobs, 1);
    }
    const changed = sourceFrame(); changed.data[0]++;
    now += 1000;
    await environment.self.dispatch({ requestId: 8, session: 8, frame: changed });
    const updated = outputFor(environment.posted, 8).result;
    assert.equal(updated.inference.objectReused, false);
    assert.equal(updated.inference.faceReused, false);
    assert.equal(ai.jobs.length, 2);
    assert.equal(face.jobs.length, 2);
  }
});

test('busy inference waits for the matching idle event and keeps current preview history', async () => {
  const environment = createWorkerEnvironment();
  globalThis.self = environment.self; globalThis.Worker = FakeSegmentationWorker;
  await import(new URL('../../js/pixel-studio/preview-worker.mjs?busy-gate', import.meta.url));
  const ai = FakeSegmentationWorker.current;
  await environment.self.dispatch({ requestId: 1, session: 1, frame: sourceFrame() });
  const old = ai.jobs[0];
  await environment.self.dispatch({ requestId: 2, session: 2, frame: sourceFrame() });
  const refused = ai.jobs[1];
  ai.emit({ type: 'segmentation-result', session: 2, jobId: refused.jobId,
    cancelled: true, busy: true, blockedByJobId: old.jobId });
  await environment.self.dispatch({ requestId: 3, session: 2, frame: sourceFrame() });
  const waiting = outputFor(environment.posted, 3).result;
  assert.equal(ai.jobs.length, 2);
  assert.equal(waiting.inference.waitingForIdle, true);
  assert.ok(waiting.stats.materialHeldCells > 0, 'busy must not reset the current material history');
  ai.emit({ type: 'segmentation-idle', session: 1, jobId: old.jobId });
  ai.emit({ type: 'segmentation-idle', session: 2, jobId: old.jobId + 100 });
  await environment.self.dispatch({ requestId: 4, session: 2, frame: sourceFrame() });
  assert.equal(ai.jobs.length, 2, 'wrong session or released job must not unlock the gate');
  ai.emit({ type: 'segmentation-idle', session: 2, jobId: old.jobId });
  const latest = sourceFrame(48, 36, [90, 110, 130]);
  await environment.self.dispatch({ requestId: 5, session: 2, frame: latest });
  assert.equal(ai.jobs.length, 3);
  assert.equal(ai.jobs[2].frame.data[0], 90, 'idle sends the current frame, not a queued older frame');
  assert.equal(outputFor(environment.posted, 5).result.inference.waitingForIdle, false);
});
