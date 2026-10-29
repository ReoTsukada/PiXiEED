import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, addAnimationFrame, writeAnimationCel, composeAnimationFrame, composeAnimationFrameRgba, animationNeedsRgba, setLayerProperties } from '../../js/creation/animation-core.mjs';
import { createAnimationFrameCache, createFrameBatcher, createStrokePaintScheduler, updateOnionImageData } from '../../js/creation/draw-render-optimization.mjs';

function imageData(width, height) { const data = new Uint8ClampedArray(width * height * 4); return { width, height, data, rgba: data }; }
function referenceOnion(display, previous, next) {
  const data = new Uint8ClampedArray(display.width * display.height * 4);
  for (let index = 0; index < display.width * display.height; index++) {
    const offset = index * 4;
    if (display.rgba ? display.rgba[offset + 3] > 0 : display.pixels[index] >= 0) continue;
    const hasPrevious = previous?.rgba[offset + 3] > 0, hasNext = next?.rgba[offset + 3] > 0;
    if (!hasPrevious && !hasNext) continue;
    data.set(hasPrevious ? [255, 100, 110, 95] : [85, 185, 255, 95], offset);
  }
  return data;
}

test('full onion render matches previous compositing for indexed and RGBA display pixels', () => {
  const width = 4, height = 2;
  const previous = imageData(width, height), next = imageData(width, height);
  for (const index of [0, 1, 5, 7]) previous.data[index * 4 + 3] = 255;
  for (const index of [1, 2, 4, 6]) next.data[index * 4 + 3] = 255;
  const displays = [
    { width, height, pixels: Int16Array.from([-1, -1, 0, -1, -1, -1, -1, -1]) },
    { width, height, rgba: new Uint8ClampedArray(width * height * 4) }
  ];
  displays[1].rgba[2 * 4 + 3] = 1;
  for (const display of displays) {
    const target = imageData(width, height);
    const dirty = updateOnionImageData(target, display, previous, next);
    assert.deepEqual(target.data, referenceOnion(display, previous, next));
    assert.deepEqual(dirty, { x: 0, y: 0, width, height });
  }
});

test('incremental onion updates clear old guides and reveal new guides exactly', () => {
  const width = 4, height = 2, display = { width, height, pixels: new Int16Array(width * height).fill(-1) };
  const previous = imageData(width, height), next = imageData(width, height);
  for (const index of [1, 5, 6]) previous.data[index * 4 + 3] = 255;
  for (const index of [2, 5, 7]) next.data[index * 4 + 3] = 255;
  const target = imageData(width, height);
  updateOnionImageData(target, display, previous, next);
  assert.deepEqual(target.data, referenceOnion(display, previous, next));

  for (const index of [1, 3, 6]) display.pixels[index] = 0;
  const dirty = updateOnionImageData(target, display, previous, next, [1, 3, 6]);
  assert.deepEqual(dirty, { x: 1, y: 0, width: 3, height: 2 });
  assert.deepEqual(target.data, referenceOnion(display, previous, next));

  display.pixels[1] = -1; display.pixels[3] = -1; display.pixels[6] = -1;
  previous.data[3 * 4 + 3] = 255;
  updateOnionImageData(target, display, previous, next, [1, 3, 6]);
  assert.deepEqual(target.data, referenceOnion(display, previous, next));
  assert.deepEqual(updateOnionImageData(target, display, previous, next, []), null);
});

test('frame cache keys immutable animation identity and frame, and obeys entry and byte limits', () => {
  const cache = createAnimationFrameCache({ maxEntries: 2, maxBytes: 20 });
  const a = {}, b = {}, a1 = { marker: 'a1' }, a2 = { marker: 'a2' }, b1 = { marker: 'b1' };
  cache.set(a, 'frame-1', a1, 8); cache.set(a, 'frame-2', a2, 8);
  assert.equal(cache.get(a, 'frame-1'), a1, 'a hit refreshes LRU position');
  cache.set(b, 'frame-1', b1, 8);
  assert.equal(cache.get(a, 'frame-2'), undefined);
  assert.equal(cache.get(a, 'frame-1'), a1);
  assert.equal(cache.get(b, 'frame-1'), b1, 'same frame id on another snapshot is distinct');
  const tooLarge = {};
  assert.equal(cache.set(a, 'too-large', tooLarge, 21), tooLarge);
  assert.equal(cache.get(a, 'too-large'), undefined);
  assert.deepEqual(cache.snapshot(), { entries: 2, retainedBytes: 16 });
  cache.clear(); assert.deepEqual(cache.snapshot(), { entries: 0, retainedBytes: 0 });
});

test('cached frame pixels stay exact and edits or undo snapshots cannot reuse stale pixels', () => {
  const cache = createAnimationFrameCache({ maxEntries: 8, maxBytes: 4096 });
  let animation = createAnimation({ width: 2, height: 1, palette: ['#000000', '#ffffff'] });
  const layerId = animation.layers[0].id, frameId = animation.frames[0].id;
  animation = writeAnimationCel(animation, frameId, layerId, { width: 2, height: 1, pixels: [1, 0] });
  animation = addAnimationFrame(animation, { sourceFrameId: frameId, copy: false });
  const cachedRender = (snapshot, id) => {
    const key = `display:${id}`;
    const hit = cache.get(snapshot, key);
    if (hit !== undefined) return hit;
    const rendered = composeAnimationFrame(snapshot, id);
    return cache.set(snapshot, key, rendered, rendered.pixels.length * 8);
  };
  const first = cachedRender(animation, frameId);
  assert.deepEqual(Array.from(first.pixels), Array.from(composeAnimationFrame(animation, frameId).pixels));
  assert.equal(cachedRender(animation, frameId), first);

  const next = writeAnimationCel(animation, frameId, layerId, { width: 2, height: 1, pixels: [0, 2] });
  const edited = cachedRender(next, frameId);
  assert.deepEqual(Array.from(edited.pixels), Array.from(composeAnimationFrame(next, frameId).pixels));
  assert.notEqual(edited, first);
  assert.deepEqual(Array.from(cachedRender(animation, frameId).pixels), Array.from(first.pixels), 'undo to the old immutable snapshot restores its exact cached image');
});

test('playback frame reuse separates frame, alpha, layer and artwork snapshots', () => {
  const cache = createAnimationFrameCache({ maxEntries: 8, maxBytes: 4096 });
  let renders = 0;
  const render = (snapshot, frameId) => {
    const key = `display:${frameId}`, hit = cache.get(snapshot, key);
    if (hit !== undefined) return hit;
    renders++;
    const image = animationNeedsRgba(snapshot)
      ? composeAnimationFrameRgba(snapshot, frameId)
      : composeAnimationFrame(snapshot, frameId);
    return cache.set(snapshot, key, image, image.rgba?.byteLength ?? image.pixels.length * 8);
  };
  let animation = createAnimation({ width: 2, height: 1, palette: ['#ffffff'] });
  const layerId = animation.layers[0].id, firstFrame = animation.frames[0].id;
  animation = writeAnimationCel(animation, firstFrame, layerId, { width: 2, height: 1, pixels: [1, 0] });
  animation = addAnimationFrame(animation, { sourceFrameId: firstFrame, copy: false });
  const secondFrame = animation.frames[1].id;
  animation = writeAnimationCel(animation, secondFrame, layerId, { width: 2, height: 1, pixels: [0, 1] });

  const originalFirst = render(animation, firstFrame), originalSecond = render(animation, secondFrame);
  for (let loop = 0; loop < 4; loop++) for (const frameId of [firstFrame, secondFrame]) render(animation, frameId);
  assert.equal(renders, 2, 'repeated playback loops reuse each immutable frame');
  assert.notEqual(originalFirst, originalSecond, 'frame identity is part of the key');

  const faded = setLayerProperties(animation, layerId, { opacity: 0.5 });
  const fadedFirst = render(faded, firstFrame);
  assert.notEqual(fadedFirst, originalFirst, 'opacity edits create an independent cache identity');
  assert.deepEqual([...fadedFirst.rgba.slice(0, 4)], [255, 255, 255, 128]);

  const edited = writeAnimationCel(animation, firstFrame, layerId, { width: 2, height: 1, pixels: [0, 1] });
  const editedFirst = render(edited, firstFrame);
  assert.deepEqual(Array.from(editedFirst.pixels), Array.from(composeAnimationFrame(edited, firstFrame).pixels));
  assert.deepEqual(Array.from(render(animation, firstFrame).pixels), Array.from(originalFirst.pixels), 'undo restores the exact older snapshot');
  assert.deepEqual(cache.snapshot(), { entries: 4, retainedBytes: 56 });
});

test('frame batcher collapses repaint requests without dropping synchronous input updates', () => {
  let nextId = 0; const pending = new Map(); let renders = 0; const samples = [];
  const batcher = createFrameBatcher({
    requestFrame(callback) { const id = ++nextId; pending.set(id, callback); return id; },
    cancelFrame(id) { pending.delete(id); },
    callback() { renders++; }
  });
  for (const sample of [1, 2, 3, 4, 5]) { samples.push(sample); batcher.schedule(); }
  assert.deepEqual(samples, [1, 2, 3, 4, 5]);
  assert.equal(pending.size, 1);
  const [id, callback] = pending.entries().next().value; pending.delete(id); callback();
  assert.equal(renders, 1);

  batcher.schedule(); const queuedId = [...pending.keys()][0]; batcher.cancel();
  assert.equal(pending.has(queuedId), false);
  batcher.schedule(); batcher.dispose(); batcher.schedule();
  assert.equal(pending.size, 0);
});

test('stroke rendering coalesces changed pixels without losing the last sample', () => {
  let id = 0;
  const jobs = new Map(), painted = [];
  const scheduler = createStrokePaintScheduler({
    requestFrame(callback) { const next = ++id; jobs.set(next, callback); return next; },
    cancelFrame(key) { jobs.delete(key); },
    paint(indices) { painted.push(indices); },
  });
  scheduler.queue([2, 3, 4]);
  scheduler.queue([4, 5, 6]);
  scheduler.queue(Uint32Array.from([6, 7]));
  assert.equal(jobs.size, 1, 'one frame is requested for all coalesced pointer samples');
  const [key, callback] = jobs.entries().next().value;
  jobs.delete(key);
  callback();
  assert.deepEqual(painted, [[2, 3, 4, 5, 6, 7]], 'every changed pixel reaches the one paint');
  scheduler.queue([9, 10]);
  scheduler.flush();
  assert.deepEqual(painted.at(-1), [9, 10], 'synchronous flush keeps final dirty pixels');
  assert.equal(jobs.size, 0, 'flush cancels the scheduled frame');
  scheduler.queue([11, 12]);
  scheduler.cancel();
  assert.equal(jobs.size, 0, 'cancelled input cannot repaint an old stroke');
  scheduler.dispose();
  assert.equal(scheduler.queue([13]), false);
  assert.equal(jobs.size, 0);
});

test('large strokes fall back to one full repaint without retaining unlimited pixel sets', () => {
  const callbacks = new Map(), calls = [];
  let id = 0;
  const painter = createStrokePaintScheduler({
    requestFrame(callback) { const next = ++id; callbacks.set(next, callback); return next; },
    cancelFrame(key) { callbacks.delete(key); },
    paint(changed) { calls.push(changed); },
    maxDirtyPixels: 3,
  });
  painter.queue([0, 1, 2]);
  painter.queue([3, 4, 5]);
  assert.equal(callbacks.size, 1);
  const [key, callback] = callbacks.entries().next().value;
  callbacks.delete(key);
  callback();
  assert.deepEqual(calls, [null], 'full paint includes all pixels when the dirty set is too large');
  painter.queue([7, 8]); painter.flush();
  assert.deepEqual(calls.at(-1), [7, 8]);
  assert.equal(painter.queue([]), false);
  assert.throws(() => painter.queue('text'), /Dirty stroke pixels/);
  painter.dispose();
});
