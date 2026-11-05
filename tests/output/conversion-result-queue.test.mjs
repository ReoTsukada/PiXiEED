import test from 'node:test';
import assert from 'node:assert/strict';
import { createResultPreviewQueue } from '../../js/creation/conversion-result-queue.mjs';

function fakeTimers() {
  let nextId = 0;
  const jobs = new Map();
  return {
    jobs,
    setTimeout(callback, delay) {
      const id = ++nextId;
      jobs.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { jobs.delete(id); },
    fire(id = jobs.keys().next().value) {
      const job = jobs.get(id);
      if (!job) return false;
      jobs.delete(id);
      job.callback();
      return true;
    }
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('debounces a key and does not restart or republish an identical request', async () => {
  const timers = fakeTimers(), calls = [], states = [];
  const queue = createResultPreviewQueue({
    timers,
    render: async (payload) => { calls.push(payload); return { payload }; },
    onState: (state) => states.push(state.state)
  });
  queue.request({ key: 'a', payload: 1 });
  queue.request({ key: 'a', payload: 1 });
  assert.equal(timers.jobs.size, 1);
  assert.deepEqual(states, ['queued']);
  timers.fire();
  await tick();
  assert.deepEqual(calls, [1]);
  assert.deepEqual(states, ['queued', 'rendering', 'ready']);
  queue.request({ key: 'a', payload: 1 });
  assert.deepEqual(states, ['queued', 'rendering', 'ready']);
  assert.deepEqual(queue.snapshot, { key: 'a', state: 'ready', result: { payload: 1 }, resultKey: 'a', error: null });
});

test('new keys abort old work and stale success or failure cannot publish', async () => {
  const timers = fakeTimers(), jobs = [], states = [];
  const queue = createResultPreviewQueue({ timers, onState: (s) => states.push(`${s.key}:${s.state}`), render: (payload, { signal }) => {
    const job = deferred();
    jobs.push({ ...job, payload, signal });
    return job.promise;
  } });
  queue.request({ key: 'old', payload: 'old' });
  timers.fire();
  assert.equal(jobs.length, 1);
  queue.request({ key: 'new', payload: 'new' });
  assert.equal(jobs[0].signal.aborted, true);
  timers.fire();
  queue.request({ key: 'latest', payload: 'latest' });
  timers.fire();
  jobs[0].resolve({ stale: true });
  jobs[1].reject(new Error('stale failure'));
  await tick();
  assert.equal(queue.snapshot.key, 'latest');
  assert.equal(queue.snapshot.state, 'rendering');
  assert.deepEqual(states, ['old:queued', 'old:rendering', 'new:queued', 'new:rendering', 'latest:queued', 'latest:rendering']);
  jobs[2].resolve({ latest: true });
  await tick();
  assert.equal(queue.snapshot.state, 'ready');
  assert.equal(queue.snapshot.resultKey, 'latest');
});

test('failure retains prior output and marks it stale by resultKey', async () => {
  const timers = fakeTimers();
  let fail = false;
  const queue = createResultPreviewQueue({ timers, render: async (payload) => {
    if (fail) throw new Error('render failed');
    return { payload };
  } });
  queue.request({ key: 'first', payload: 'first' });
  timers.fire();
  await tick();
  fail = true;
  queue.request({ key: 'second', payload: 'second' });
  timers.fire();
  await tick();
  assert.equal(queue.snapshot.state, 'error');
  assert.equal(queue.snapshot.error.message, 'render failed');
  assert.deepEqual(queue.snapshot.result, { payload: 'first' });
  assert.equal(queue.snapshot.resultKey, 'first');
});

test('manual refresh forces one run; unsupported refresh and source-less requests do not render', async () => {
  const timers = fakeTimers(), rendered = [];
  const queue = createResultPreviewQueue({ timers, render: async (payload) => {
    rendered.push(payload);
    return { payload };
  } });
  queue.request({ key: 'manual', automatic: false, payload: 1 });
  assert.equal(queue.snapshot.state, 'manual');
  assert.equal(queue.refresh(), true);
  await tick();
  assert.deepEqual(rendered, [1]);
  queue.request({ key: 'unsupported', supported: false, payload: 2 });
  assert.equal(queue.snapshot.state, 'manual');
  assert.equal(queue.refresh(), false);
  queue.request({ key: 'absent', hasSource: false, payload: 3 });
  assert.equal(queue.snapshot.state, 'empty');
  assert.equal(queue.refresh(), false);
  assert.deepEqual(rendered, [1]);
});

test('pause cancels queued and active work; refresh resumes with a fresh render', async () => {
  const timers = fakeTimers(), jobs = [];
  const queue = createResultPreviewQueue({ timers, render: (payload, { signal }) => {
    const job = deferred();
    jobs.push({ ...job, signal, payload });
    return job.promise;
  } });
  queue.request({ key: 'queued' });
  queue.pause();
  assert.equal(timers.jobs.size, 0);
  assert.equal(queue.snapshot.state, 'paused');
  queue.request({ key: 'active' });
  timers.fire();
  queue.pause();
  assert.equal(jobs[0].signal.aborted, true);
  jobs[0].resolve('ignored');
  await tick();
  assert.equal(queue.snapshot.state, 'paused');
  assert.equal(queue.refresh(), true);
  assert.equal(queue.snapshot.state, 'rendering');
  jobs[1].resolve('fresh');
  await tick();
  assert.equal(queue.snapshot.result, 'fresh');
});

test('destroy aborts work and suppresses all later state callbacks', async () => {
  const timers = fakeTimers(), states = [], job = deferred();
  let signal;
  const queue = createResultPreviewQueue({ timers, onState: (state) => states.push(state.state), render: (_payload, options) => {
    signal = options.signal;
    return job.promise;
  } });
  queue.request({ key: 'a' });
  timers.fire();
  queue.destroy();
  assert.equal(signal.aborted, true);
  const count = states.length;
  job.resolve('late');
  await tick();
  queue.request({ key: 'b' });
  queue.pause();
  assert.equal(states.length, count);
  assert.equal(queue.snapshot.state, 'rendering');
});
