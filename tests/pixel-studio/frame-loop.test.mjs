import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from '../../js/pixel-studio/frame-loop.mjs';

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
async function withTimeout(promise, ms, message) {
  let timer;
  try {
    await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]);
  } finally { clearTimeout(timer); }
}
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('serially processes latest frames without building a queue', async () => {
  let captured = 0;
  let active = 0;
  let peak = 0;
  const firstWork = deferred();
  const firstStarted = deferred();
  const secondPublished = deferred();
  const loop = createFrameLoop({
    intervalMs: 100, minDelayMs: 100,
    captureFrame: async () => ({ id: ++captured }),
    processFrame: async (frame) => {
      active++; peak = Math.max(peak, active);
      if (frame.id === 1) { firstStarted.resolve(); await firstWork.promise; }
      active--;
      return frame.id;
    },
    publishFrame: (id) => { if (id === 2) secondPublished.resolve(); }
  });
  loop.start();
  await firstStarted.promise;
  await tick(20);
  assert.equal(captured, 1, 'the loop must not capture or queue another frame during work');
  firstWork.resolve();
  await withTimeout(secondPublished.promise, 1000, 'second frame did not run');
  loop.stop();
  await tick(20);
  assert.equal(peak, 1);
  assert.equal(captured, 2);
});

test('stop prevents stale publish; restart waits for old work before the next capture', async () => {
  const first = deferred();
  let captures = 0;
  let active = 0;
  let peak = 0;
  const published = [];
  const loop = createFrameLoop({
    intervalMs: 100, minDelayMs: 100,
    captureFrame: async () => ({ id: ++captures }),
    processFrame: async (frame) => {
      active++; peak = Math.max(peak, active);
      if (frame.id === 1) await first.promise;
      active--;
      return frame.id;
    },
    publishFrame: (id) => published.push(id)
  });
  loop.start();
  await tick(0);
  loop.stop();
  loop.start();
  await tick(15);
  assert.equal(captures, 1, 'restart must not create a second in-flight job');
  first.resolve();
  await tick(25);
  loop.stop();
  await tick(10);
  assert.equal(peak, 1);
  assert.ok(!published.includes(1), 'stopped generation must not publish its result');
});

test('processing failure is reported and later frames continue', async () => {
  let captured = 0;
  const errors = [];
  const published = [];
  const loop = createFrameLoop({
    intervalMs: 100, minDelayMs: 100,
    captureFrame: async () => ({ id: ++captured }),
    processFrame: async (frame) => {
      if (frame.id === 1) throw new Error('temporary');
      return frame.id;
    },
    publishFrame: (value) => published.push(value),
    onError: (error) => errors.push(error.message)
  });
  loop.start();
  await tick(235);
  loop.stop();
  await tick(10);
  assert.deepEqual(errors, ['temporary']);
  assert.ok(published.includes(2));
});

test('stop during capture suppresses stale processing and publishing', async () => {
  const framePromise = deferred();
  let processCount = 0;
  let publishCount = 0;
  const loop = createFrameLoop({
    captureFrame: () => framePromise.promise,
    processFrame: async () => { processCount++; return {}; },
    publishFrame: () => { publishCount++; }
  });
  loop.start();
  await tick(0);
  loop.stop();
  framePromise.resolve({ id: 1 });
  await tick(10);
  assert.equal(processCount, 0);
  assert.equal(publishCount, 0);
});
