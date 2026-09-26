import test from 'node:test';
import assert from 'node:assert/strict';

class FakeWorker {
  static current = null;
  static instances = [];
  listeners = new Map();
  jobs = [];
  cancellations = [];
  active = null;

  constructor(url) {
    this.url = String(url);
    FakeWorker.current = this;
    FakeWorker.instances.push(this);
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  postMessage(message, transfer = []) {
    if (message.type === 'cancel') { this.cancellations.push(message); return; }
    assert.equal(message.type, 'segment');
    const job = structuredClone(message, { transfer });
    this.jobs.push(job);
    if (this.active) {
      this.emit({ type: 'segmentation-result', session: job.session, jobId: job.jobId,
        cancelled: true, busy: true, blockedByJobId: this.active.jobId });
      return;
    }
    this.active = job;
  }

  emit(message, transfer = []) {
    const data = structuredClone(message, { transfer });
    for (const listener of this.listeners.get('message') ?? []) listener({ data });
  }

  complete(job = this.active, { labels = new Uint32Array(12 * 9).fill(7), instanceCount = 1 } = {}) {
    assert.ok(job);
    if (this.active?.jobId === job.jobId) this.active = null;
    const replyFrame = { width: job.frame.width, height: job.frame.height,
      data: new Uint8ClampedArray(job.frame.data) };
    this.emit({ type: 'segmentation-result', jobId: job.jobId, session: job.session,
      frame: replyFrame, capturedAt: job.capturedAt, labels,
      labelWidth: labels.length ? 12 : 0, labelHeight: labels.length ? 9 : 0,
      model: 'fixture', instanceCount, trackingMatches: 0, aiProcessingMs: 7 },
    [replyFrame.data.buffer, labels.buffer]);
  }

  idle(session, jobId) {
    if (this.active?.jobId === jobId) this.active = null;
    this.emit({ type: 'segmentation-idle', session, jobId });
  }

  reject(job = this.active, error = 'inference failed') {
    assert.ok(job);
    if (this.active?.jobId === job.jobId) this.active = null;
    this.emit({ type: 'segmentation-result', jobId: job.jobId, session: job.session, error });
  }

  fail(message = 'fixture worker failure') {
    for (const listener of this.listeners.get('error') ?? []) listener({ message });
  }
}

function environment() {
  const listeners = new Map();
  const posted = [];
  const self = {
    location: { href: 'http://localhost/js/pixel-studio/boundary-preview-worker.mjs' },
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    postMessage(message, transfer = []) { posted.push(structuredClone(message, { transfer })); },
    async dispatch(message) {
      const copy = message.frame
        ? structuredClone(message, { transfer: [message.frame.data.buffer] })
        : structuredClone(message);
      for (const listener of listeners.get('message') ?? []) listener({ data: copy });
    }
  };
  return { self, posted };
}

function frame(width = 48, height = 36, rgb = [75, 106, 139]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < data.length; p += 4) {
    data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2]; data[p + 3] = 255;
  }
  return { width, height, data };
}

function resultFor(posted, requestId) {
  return posted.findLast((item) => item.requestId === requestId);
}

async function startWorker(label) {
  const env = environment();
  FakeWorker.current = null;
  FakeWorker.instances = [];
  globalThis.self = env.self;
  globalThis.Worker = FakeWorker;
  await import(new URL(`../../js/pixel-studio/boundary-preview-worker.mjs?${label}=${Date.now()}-${Math.random()}`, import.meta.url));
  return { ...env, ai: FakeWorker.current };
}

test('first preview is immediate and quantized; valid masks reuse recognition without holding frame colors', async () => {
  const env = await startWorker('nonblocking');
  assert.match(env.ai.url, /segmentation-worker\.mjs$/);
  assert.equal(FakeWorker.instances.length, 1, 'the face detector is never started');

  await env.self.dispatch({ requestId: 1, session: 10, size: 64, paletteEpoch: 3, frame: frame(48, 36, [218, 218, 218]) });
  const first = resultFor(env.posted, 1).result;
  assert.equal(first.aiStatus, 'processing');
  assert.equal(first.segmented, false);
  assert.deepEqual(Array.from(first.data.slice(0, 4)), [192, 192, 192, 255]);
  assert.equal(first.stats.globalToneLevels, 4);
  assert.ok(first.palette.length <= 24);
  assert.equal(first.faceStatus, 'disabled');
  assert.equal(first.faceCount, 0);
  assert.equal(first.inference.objectJobs, 1);
  assert.equal(first.inference.faceJobs, 0);
  assert.equal(env.ai.jobs.length, 1, 'render is posted before AI completes');
  assert.notEqual(env.ai.jobs[0].frame.data.buffer, first.data.buffer);

  env.ai.complete(env.ai.jobs[0]);
  await env.self.dispatch({ requestId: 2, session: 10, size: 64, paletteEpoch: 3, frame: frame(48, 36, [223, 223, 223]) });
  const updated = resultFor(env.posted, 2).result;
  assert.equal(updated.aiStatus, 'ready');
  assert.equal(updated.segmented, true);
  assert.deepEqual(Array.from(updated.data.slice(0, 4)), [240, 240, 240, 255], 'the mask never freezes source RGB');
  assert.equal(updated.inference.objectJobs, 1, 'a still-valid mask is reused without new inference');
  assert.equal(env.ai.jobs.length, 1);

  await env.self.dispatch({ requestId: 3, session: 10, size: 64, paletteEpoch: 3, frame: frame(48, 36, [232, 232, 232]) });
  const changed = resultFor(env.posted, 3).result;
  assert.equal(changed.maskInvalidation, 'changed-region');
  assert.equal(changed.segmented, false);
  assert.deepEqual(Array.from(changed.data.slice(0, 4)), [240, 240, 240, 255]);
  assert.equal(env.ai.jobs.length, 2, 'a materially changed frame requests a fresh mask');
});

test('recognition flattens background specks without touching foreground detail', async () => {
  const env = await startWorker('background-only');
  const source = () => {
    const image = frame(48, 36, [150, 150, 150]);
    image.data.set([45, 45, 45, 255], (5 * 48 + 5) * 4);
    image.data.set([210, 210, 210, 255], (15 * 48 + 20) * 4);
    return image;
  };
  await env.self.dispatch({ requestId: 1, session: 14, size: 64, paletteEpoch: 2, frame: source() });
  const before = resultFor(env.posted, 1).result;
  assert.equal(before.stats.backgroundFlattenedCells, 0);
  assert.deepEqual(Array.from(before.data.slice((5 * 48 + 5) * 4, (5 * 48 + 5) * 4 + 3)), [24, 24, 24]);

  const owners = new Uint32Array(12 * 9);
  for (let y = 3; y <= 5; y++) for (let x = 4; x <= 7; x++) owners[y * 12 + x] = 7;
  env.ai.complete(env.ai.jobs[0], { labels: owners });
  await env.self.dispatch({ requestId: 2, session: 14, size: 64, paletteEpoch: 2, frame: source() });
  const after = resultFor(env.posted, 2).result;
  assert.equal(after.aiStatus, 'ready');
  assert.ok(after.stats.backgroundFlattenedCells >= 1);
  assert.deepEqual(Array.from(after.data.slice((5 * 48 + 5) * 4, (5 * 48 + 5) * 4 + 3)), [144, 144, 144]);
  assert.deepEqual(Array.from(after.data.slice((15 * 48 + 20) * 4, (15 * 48 + 20) * 4 + 3)),
    Array.from(before.data.slice((15 * 48 + 20) * 4, (15 * 48 + 20) * 4 + 3)),
    'foreground colors do not change when background recognition arrives');
});

test('placeholder black waits only before first valid input; valid black is rendered and epoch drops masks', async () => {
  const env = await startWorker('black-epoch');
  await env.self.dispatch({ requestId: 1, session: 4, paletteEpoch: 1, frame: frame(8, 8, [0, 0, 0]) });
  assert.equal(resultFor(env.posted, 1).pending, true);
  assert.equal(env.ai.jobs.length, 0);

  await env.self.dispatch({ requestId: 2, session: 4, paletteEpoch: 1, frame: frame(8, 8, [20, 30, 40]) });
  env.ai.complete(env.ai.jobs[0], { labels: new Uint32Array(12 * 9).fill(2) });
  await env.self.dispatch({ requestId: 3, session: 4, paletteEpoch: 2, frame: frame(8, 8, [0, 0, 0]) });
  const black = resultFor(env.posted, 3).result;
  assert.equal(black.segmented, false, 'epoch refresh invalidates the old mask');
  assert.deepEqual(Array.from(black.data.slice(0, 4)), [24, 24, 24, 255], 'an epoch change does not re-arm startup placeholder handling');
  assert.equal(env.ai.jobs.length, 2);
});

test('session and output size changes reject late masks; busy retry waits for matching idle', async () => {
  const env = await startWorker('session-size-busy');
  await env.self.dispatch({ requestId: 1, session: 1, size: 64, paletteEpoch: 1, frame: frame(96, 64) });
  const oldJob = env.ai.jobs[0];
  await env.self.dispatch({ requestId: 2, session: 2, size: 128, paletteEpoch: 1, frame: frame(96, 64, [90, 110, 130]) });
  const switched = resultFor(env.posted, 2).result;
  assert.equal(switched.width, 96);
  assert.equal(switched.height, 64);
  assert.equal(switched.inference.waitingForIdle, true);
  assert.equal(env.ai.jobs.length, 2, 'the second request is refused while the old inference is active');

  env.ai.complete(oldJob);
  env.ai.idle(1, oldJob.jobId);
  env.ai.idle(2, oldJob.jobId + 100);
  await env.self.dispatch({ requestId: 3, session: 2, size: 128, paletteEpoch: 1, frame: frame(96, 64, [90, 110, 130]) });
  assert.equal(resultFor(env.posted, 3).result.inference.waitingForIdle, true, 'wrong-session and wrong-job idle events do not open the gate');
  env.ai.idle(2, oldJob.jobId);
  const latest = frame(96, 64, [95, 115, 135]);
  await env.self.dispatch({ requestId: 4, session: 2, size: 128, paletteEpoch: 1, frame: latest });
  assert.equal(env.ai.jobs.length, 3);
  assert.equal(resultFor(env.posted, 4).result.stats.globalToneLevels, 4);
  assert.equal(resultFor(env.posted, 4).result.data[3], 255);
  assert.equal(env.ai.jobs[2].frame.data[0], 95, 'retry uses the newest source frame');
  assert.equal(env.ai.cancellations.some((item) => item.session === 1), true);
});

test('worker failure retains four-tone output and explicit cancel clears session state', async () => {
  const env = await startWorker('fallback-cancel');
  await env.self.dispatch({ requestId: 1, session: 9, frame: frame(32, 24, [12, 34, 56]) });
  env.ai.fail('simulated failure');
  await env.self.dispatch({ requestId: 2, session: 9, frame: frame(32, 24, [22, 44, 66]) });
  const fallback = resultFor(env.posted, 2).result;
  assert.equal(fallback.aiStatus, 'unavailable');
  assert.match(fallback.aiFailureReason, /simulated failure/);
  assert.deepEqual(Array.from(fallback.data.slice(0, 4)), [24, 24, 24, 255]);
  assert.equal(fallback.inference.faceJobs, 0);

  await env.self.dispatch({ type: 'cancel', session: 9, requestId: 3 });
  assert.equal(resultFor(env.posted, 3).cancelled, true);
  assert.equal(env.ai.cancellations.some((item) => item.session === 9), true);
});

test('a recoverable inference error retries after the next camera session', async () => {
  const env = await startWorker('retry-session');
  await env.self.dispatch({ requestId: 1, session: 1, frame: frame() });
  env.ai.reject(env.ai.jobs[0], 'temporary model error');
  await env.self.dispatch({ requestId: 2, session: 1, frame: frame(48, 36, [80, 110, 140]) });
  assert.equal(resultFor(env.posted, 2).result.aiStatus, 'unavailable');
  assert.equal(env.ai.jobs.length, 1, 'do not retry continuously within a failing session');

  await env.self.dispatch({ requestId: 3, session: 2, frame: frame(48, 36, [85, 115, 145]) });
  assert.equal(resultFor(env.posted, 3).result.aiStatus, 'processing');
  assert.equal(env.ai.jobs.length, 2, 'the next session can recover and request a fresh mask');
});


test('palette stays fixed across mask results, size changes and AI failure; tap and session reseed it', async () => {
  const env = await startWorker('palette-lifecycle');
  const red = [210, 130, 100], blue = [95, 160, 215];
  await env.self.dispatch({ requestId: 1, session: 3, size: 64, paletteEpoch: 5, frame: frame(96, 64, red) });
  const first = resultFor(env.posted, 1).result;
  assert.equal(first.stats.paletteLocked, true);
  env.ai.complete(env.ai.jobs[0]);
  await env.self.dispatch({ requestId: 2, session: 3, size: 128, paletteEpoch: 5, frame: frame(96, 64, blue) });
  const resized = resultFor(env.posted, 2).result;
  assert.deepEqual(resized.palette, first.palette);
  assert.equal(resized.stats.paletteRevision, first.stats.paletteRevision);
  env.ai.fail('fixture failure after seeding');
  await env.self.dispatch({ requestId: 3, session: 3, size: 128, paletteEpoch: 5, frame: frame(96, 64, blue) });
  const fallback = resultFor(env.posted, 3).result;
  assert.equal(fallback.aiStatus, 'unavailable');
  assert.deepEqual(fallback.palette, first.palette, 'AI failure must not rebuild a scene palette');
  await env.self.dispatch({ requestId: 4, session: 3, size: 128, paletteEpoch: 6, frame: frame(96, 64, blue) });
  const refreshed = resultFor(env.posted, 4).result;
  assert.notDeepEqual(refreshed.palette, first.palette, 'tap learns the new scene colors');
  assert.notEqual(refreshed.stats.paletteRevision, first.stats.paletteRevision);
  await env.self.dispatch({ requestId: 5, session: 4, size: 128, paletteEpoch: 6, frame: frame(96, 64, red) });
  assert.deepEqual(resultFor(env.posted, 5).result.palette, first.palette, 'new session learns its own colors');
});

test('PiXiEELENS renderer keeps photo-derived colors and one palette across recognition', async () => {
  const env = await startWorker('lens-source-colors');
  const colored = () => {
    const image = frame(48, 36, [214, 74, 52]);
    for (let y = 0; y < 36; y++) for (let x = 24; x < 48; x++) {
      image.data.set([43, 99, 195, 255], (y * 48 + x) * 4);
    }
    return image;
  };
  await env.self.dispatch({ requestId: 1, session: 30, size: 64, paletteEpoch: 1,
    renderMode: 'lens', aiEdges: true, frame: colored() });
  const first = resultFor(env.posted, 1).result;
  assert.equal(first.stats.shading, 'lens-source-palette');
  assert.ok(first.palette.length <= 24);
  assert.ok(first.data[(12 * 48 + 12) * 4] > first.data[(12 * 48 + 12) * 4 + 2]);
  assert.ok(first.data[(12 * 48 + 36) * 4 + 2] > first.data[(12 * 48 + 36) * 4]);
  assert.equal(first.sourceSimplified, undefined, 'live camera does not receive an extra diagnostic image');

  env.ai.complete(env.ai.jobs[0]);
  await env.self.dispatch({ requestId: 2, session: 30, size: 64, paletteEpoch: 1,
    renderMode: 'lens', aiEdges: true, frame: colored() });
  const second = resultFor(env.posted, 2).result;
  assert.equal(second.aiStatus, 'ready');
  assert.deepEqual(second.palette, first.palette);
  assert.equal(second.stats.paletteRevision, first.stats.paletteRevision);
});

test('PiXiEELENS default shrinks directly and does not start AI until requested', async () => {
  const env = await startWorker('lens-direct');
  const colored = frame(96, 64, [195, 98, 52]);
  for (let y = 0; y < 64; y++) for (let x = 48; x < 96; x++) {
    colored.data.set([52, 110, 203, 255], (y * 96 + x) * 4);
  }
  await env.self.dispatch({ requestId: 1, session: 51, size: 64, paletteEpoch: 1,
    renderMode: 'lens', lensSettings: { colorDepth: '16', dither: 'ordered', surfaceSimplify: 55 }, frame: colored });
  const first = resultFor(env.posted, 1).result;
  assert.equal(first.stats.sampling, 'lens-direct');
  assert.equal(first.stats.dither, 'ordered-bayer');
  assert.equal(first.aiStatus, 'disabled');
  assert.equal(env.ai.jobs.length, 0);
  assert.ok(first.palette.length <= 16);
  await env.self.dispatch({ type: 'cancel', session: 51, requestId: 2 });
  await env.self.dispatch({ requestId: 3, session: 52, size: 128, paletteEpoch: 1,
    renderMode: 'lens', lensSettings: { colorDepth: '16', dither: 'ordered', surfaceSimplify: 55 }, frame: frame(96, 64, [52, 110, 203]) });
  const resized = resultFor(env.posted, 3).result;
  assert.deepEqual(resized.palette, first.palette, 'framing restart retains the selected palette');
  await env.self.dispatch({ requestId: 4, session: 52, size: 128, paletteEpoch: 2,
    renderMode: 'lens', lensSettings: { colorDepth: '16' }, frame: frame(96, 64, [52, 110, 203]) });
  assert.notDeepEqual(resultFor(env.posted, 4).result.palette, first.palette, 'tap chooses current colours');
});
