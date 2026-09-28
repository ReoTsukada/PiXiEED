import test from 'node:test';
import assert from 'node:assert/strict';
import { animatedCapturePlan, animatedGeometry, downsampleAnimatedFrame, encodeAnimatedGif } from '../../js/animated-export.mjs';

const frames = () => [0, 1].map((n) => ({ width: 2, height: 2, data: new Uint8ClampedArray([n * 255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255]) }));

test('integer enlargement fits the whole animation work budget', () => {
  assert.deepEqual(animatedGeometry(64, 32, 50), { width: 1024, height: 512, scale: 16 });
  const value = animatedGeometry(256, 256, 100);
  assert.deepEqual(value, { width: 768, height: 768, scale: 3 });
  assert.ok(value.width * value.height * 100 <= 80e6);
  for (const bad of [[0, 1, 1], [2.5, 2, 2], [1, 1, 601], [4096, 4096, 200]]) assert.throws(() => animatedGeometry(...bad), RangeError);
});

test('camera capture planning bounds retained RGBA pixels and downsamples only the GIF copy', () => {
  const plan = animatedCapturePlan(512, 512, { maxMs: 10000, fps: 20 });
  assert.equal(plan.maxFrames, 201);
  assert.ok(plan.width * plan.height * plan.maxFrames <= 8e6);
  assert.ok(plan.divisor > 1);
  const source = { width: 5, height: 3, data: new Uint8ClampedArray(Array.from({ length: 15 }, (_, index) => [index, 0, 0, 255]).flat()) };
  const smallPlan = animatedCapturePlan(5, 3, { maxMs: 1000, fps: 10, maxPixels: 80 });
  assert.deepEqual([smallPlan.width, smallPlan.height, smallPlan.divisor], [3, 2, 2]);
  const before = [...source.data];
  const reduced = downsampleAnimatedFrame(source, smallPlan);
  assert.deepEqual([reduced.width, reduced.height], [3, 2]);
  assert.deepEqual([...reduced.data.filter((_, index) => index % 4 === 0)], [6, 8, 9, 11, 13, 14]);
  assert.deepEqual([...source.data], before);
  assert.throws(() => animatedGeometry(512, 512, 40), RangeError, 'oversized retained frames fail before a worker is created');
});

test('worker export borrows source frames and terminates after output', async () => {
  const source = frames(); const before = source.map((f) => [...f.data]);
  let terminated = 0;
  const worker = { terminate() { terminated++; }, postMessage(message, transfer) { assert.equal(transfer, undefined); assert.equal(message.frames, source); queueMicrotask(() => this.onmessage({ data: { bytes: new Uint8Array([71, 73, 70]) } })); } };
  const result = await encodeAnimatedGif(source, { longEdge: 32, workerFactory: () => worker });
  assert.equal(result.width, 32); assert.deepEqual([...result.bytes], [71, 73, 70]);
  assert.equal(terminated, 1); assert.deepEqual(source.map((f) => [...f.data]), before);
});

test('abort stops a pending worker and stale output cannot complete the export', async () => {
  const controller = new AbortController(); let terminated = 0;
  const worker = { postMessage() {}, terminate() { terminated++; } };
  const pending = encodeAnimatedGif(frames(), { signal: controller.signal, workerFactory: () => worker });
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  worker.onmessage({ data: { bytes: new Uint8Array([1]) } });
  assert.equal(terminated, 1);
});

test('bad frames are rejected before spawning a worker', async () => {
  let spawned = false; const invalid = frames(); invalid[1].height = 3;
  await assert.rejects(encodeAnimatedGif(invalid, { workerFactory() { spawned = true; } }), RangeError);
  assert.equal(spawned, false);
});

test('small worker-free fallback produces an enlarged GIF without changing pixels', async () => {
  const source = frames(); const before = source.map((f) => [...f.data]);
  const result = await encodeAnimatedGif(source, { longEdge: 32, workerFactory: () => null });
  assert.equal(String.fromCharCode(...result.bytes.subarray(0, 6)), 'GIF89a');
  assert.equal(result.bytes[6] | result.bytes[7] << 8, result.width);
  assert.equal(result.width, 32); assert.deepEqual(source.map((f) => [...f.data]), before);
});

test('worker-free fallback caps work after integer enlargement', async () => {
  const source = Array.from({ length: 200 }, () => ({ width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) }));
  const result = await encodeAnimatedGif(source, { workerFactory: () => null });
  assert.ok(result.width * result.height * source.length <= 8e6);
  assert.ok(result.scale < 64, 'fallback does not expand every frame to the full 1024px target');
});

test('blocked workers never force an unbounded export on the main thread', async () => {
  const source = Array.from({ length: 40 }, () => ({ width: 512, height: 512, data: new Uint8Array(512 * 512 * 4) }));
  await assert.rejects(encodeAnimatedGif(source, { workerFactory() { throw new Error('blocked'); } }), RangeError);
});
