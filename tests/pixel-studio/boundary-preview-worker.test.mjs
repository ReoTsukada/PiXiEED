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

test('first preview is immediate, source sampled, and an eligible unchanged mask avoids repeat inference', async () => {
  const env = await startWorker('nonblocking');
  assert.match(env.ai.url, /segmentation-worker\.mjs$/);
  assert.equal(FakeWorker.instances.length, 1, 'the face detector is never started');

  await env.self.dispatch({ requestId: 1, session: 10, size: 64, paletteEpoch: 3, frame: frame() });
  const first = resultFor(env.posted, 1).result;
  assert.equal(first.aiStatus, 'processing');
  assert.equal(first.segmented, false);
  assert.deepEqual(Array.from(first.data.slice(0, 4)), [75, 106, 139, 255]);
  assert.equal(first.faceStatus, 'disabled');
  assert.equal(first.faceCount, 0);
  assert.equal(first.inference.objectJobs, 1);
  assert.equal(first.inference.faceJobs, 0);
  assert.equal(env.ai.jobs.length, 1, 'render is posted before AI completes');
  assert.notEqual(env.ai.jobs[0].frame.data.buffer, first.data.buffer);

  env.ai.complete(env.ai.jobs[0]);
  await env.self.dispatch({ requestId: 2, session: 10, size: 64, paletteEpoch: 3, frame: frame(48, 36, [80, 111, 144]) });
  const updated = resultFor(env.posted, 2).result;
  assert.equal(updated.aiStatus, 'ready');
  assert.equal(updated.segmented, true);
  assert.deepEqual(Array.from(updated.data.slice(0, 4)), [80, 111, 144, 255], 'the mask never freezes source RGB');
  assert.equal(updated.inference.objectJobs, 1, 'a still-valid mask is reused without new inference');
  assert.equal(env.ai.jobs.length, 1);

  await env.self.dispatch({ requestId: 3, session: 10, size: 64, paletteEpoch: 3, frame: frame(48, 36, [89, 120, 153]) });
  const changed = resultFor(env.posted, 3).result;
  assert.equal(changed.maskInvalidation, 'changed-region');
  assert.equal(changed.segmented, false);
  assert.deepEqual(Array.from(changed.data.slice(0, 4)), [89, 120, 153, 255]);
  assert.equal(env.ai.jobs.length, 2, 'a materially changed frame requests a fresh mask');
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
  assert.deepEqual(Array.from(black.data.slice(0, 4)), [0, 0, 0, 255], 'an epoch change does not re-arm startup placeholder handling');
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
  assert.deepEqual(Array.from(resultFor(env.posted, 4).result.data.slice(0, 4)), [95, 115, 135, 255]);
  assert.equal(env.ai.jobs[2].frame.data[0], 95, 'retry uses the newest source frame');
  assert.equal(env.ai.cancellations.some((item) => item.session === 1), true);
});

test('worker failure falls back to source-sampled output and explicit cancel clears session state', async () => {
  const env = await startWorker('fallback-cancel');
  await env.self.dispatch({ requestId: 1, session: 9, frame: frame(32, 24, [12, 34, 56]) });
  env.ai.fail('simulated failure');
  await env.self.dispatch({ requestId: 2, session: 9, frame: frame(32, 24, [22, 44, 66]) });
  const fallback = resultFor(env.posted, 2).result;
  assert.equal(fallback.aiStatus, 'unavailable');
  assert.match(fallback.aiFailureReason, /simulated failure/);
  assert.deepEqual(Array.from(fallback.data.slice(0, 4)), [22, 44, 66, 255]);
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
