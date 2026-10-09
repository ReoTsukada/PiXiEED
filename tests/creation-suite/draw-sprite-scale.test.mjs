import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMATION_PIXEL_BUDGET, addAnimationFrame, addAnimationLayer, createAnimation, getAnimationCelDocument,
  resizeAnimation, setAnimationFrameDuration, setLayerProperties, writeAnimationCel,
} from '../../js/creation/animation-core.mjs';
import { estimateRetainedAnimationBytes } from '../../js/creation/animation-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { createPxdProject, decodePxd, encodePxd } from '../../js/creation/pxd-codec.mjs';
import { DRAW_ANIMATION_HISTORY_MAX_BYTES } from '../../js/creation/draw-animation-history.mjs';
import { planSpriteScale, scaleSpriteAnimation, DRAW_SPRITE_SCALE_MEMORY_MAX_BYTES } from '../../js/creation/draw-sprite-scale.mjs';

function multiCelFixture() {
  let animation = createAnimation({ width: 17, height: 15, palette: ['#112233', '#abcdef'] });
  animation = addAnimationLayer(animation, { name: 'Hidden locked', visible: false, locked: true });
  animation = addAnimationFrame(animation, { copy: false, durationMs: 1000 / 24 });
  animation = setAnimationFrameDuration(animation, animation.frames[0].id, 1000 / 12);
  for (let frame = 0; frame < animation.frames.length; frame += 1) for (let layer = 0; layer < animation.layers.length; layer += 1) {
    const pixels = new Uint8Array(17 * 15);
    pixels[(1 + frame) * 17 + 2 + layer] = 1 + (frame + layer) % 2;
    pixels[7 * 17 + 8] = layer ? 2 : 0;
    pixels[14 * 17 + 16] = frame ? 0 : 2;
    animation = writeAnimationCel(animation, animation.frames[frame].id, animation.layers[layer].id, { width: 17, height: 15, pixels });
  }
  return animation;
}

const celPixels = (animation, frame, layer) => getAnimationCelDocument(animation, animation.frames[frame].id, animation.layers[layer].id).pixels;

test('100% and rounded same-size scales are exact identity no-ops', () => {
  const animation = multiCelFixture();
  const exact = planSpriteScale(animation, 100);
  assert.deepEqual({ width: exact.width, height: exact.height, percent: exact.percent, changed: exact.changed, allowed: exact.allowed }, { width: 17, height: 15, percent: 100, changed: false, allowed: true });
  assert.equal(scaleSpriteAnimation(animation, 100), animation);
  const tiny = createAnimation({ width: 1, height: 1 });
  assert.equal(scaleSpriteAnimation(tiny, 99), tiny);
  assert.equal(planSpriteScale(tiny, 99).reasonCode, 'SPRITE_SCALE_NOOP');
});

test('scale percentages round dimensions, enforce a one-pixel minimum, and report raw dimension limits', () => {
  const source = createAnimation({ width: 3, height: 5 });
  const quarter = planSpriteScale(source, 25);
  assert.deepEqual([quarter.width, quarter.height, quarter.allowed], [1, 1, true]);
  const half = planSpriteScale(source, 50);
  assert.deepEqual([half.width, half.height], [2, 3]);
  const tooLarge = planSpriteScale(createAnimation({ width: 256, height: 32 }), 200);
  assert.equal(tooLarge.allowed, false);
  assert.deepEqual([tooLarge.width, tooLarge.height, tooLarge.reasonCode], [512, 64, 'SPRITE_SCALE_DIMENSION_LIMIT']);
  assert.throws(() => scaleSpriteAnimation(createAnimation({ width: 256, height: 32 }), 200), { code: 'SPRITE_SCALE_DIMENSION_LIMIT' });
  assert.equal(planSpriteScale(source, 0).reasonCode, 'SPRITE_SCALE_PERCENT_INVALID');
  assert.equal(planSpriteScale(source, Infinity).allowed, false);
});

test('1000% nearest scaling expands colored and transparent pixels across every small cel', () => {
  let source = createAnimation({ width: 2, height: 1, palette: ['#010203', '#aabbcc'] });
  source = addAnimationLayer(source, { name: 'Hidden', visible: false, locked: true });
  source = addAnimationFrame(source, { copy: false, durationMs: 1000 / 24 });
  const patterns = [[1, 0], [0, 2], [2, 1], [1, 2]];
  for (let frame = 0; frame < source.frames.length; frame += 1) for (let layer = 0; layer < source.layers.length; layer += 1) {
    source = writeAnimationCel(source, source.frames[frame].id, source.layers[layer].id, { width: 2, height: 1, pixels: Uint8Array.from(patterns[frame * 2 + layer]) });
  }
  const scaled = scaleSpriteAnimation(source, 1000);
  assert.deepEqual([scaled.width, scaled.height], [20, 10]);
  assert.deepEqual(scaled.frames, source.frames); assert.deepEqual(scaled.layers, source.layers);
  for (let frame = 0; frame < source.frames.length; frame += 1) for (let layer = 0; layer < source.layers.length; layer += 1) {
    const from = celPixels(source, frame, layer), to = celPixels(scaled, frame, layer);
    for (let x = 0; x < 2; x += 1) for (let y = 0; y < 1; y += 1) for (let dy = 0; dy < 10; dy += 1) for (let dx = 0; dx < 10; dx += 1) {
      assert.equal(to[(y * 10 + dy) * scaled.width + x * 10 + dx], from[y * 2 + x]);
    }
  }
});

test('nearest scale copies exact k×k pixel blocks across every frame and layer with metadata intact', () => {
  const before = multiCelFixture();
  const scaled = scaleSpriteAnimation(before, 200);
  assert.deepEqual([scaled.width, scaled.height], [34, 30]);
  assert.deepEqual(scaled.frames, before.frames);
  assert.deepEqual(scaled.layers, before.layers);
  assert.deepEqual(scaled.palette, before.palette);
  for (let frame = 0; frame < before.frames.length; frame += 1) for (let layer = 0; layer < before.layers.length; layer += 1) {
    const source = celPixels(before, frame, layer), target = celPixels(scaled, frame, layer);
    for (let y = 0; y < before.height; y += 1) for (let x = 0; x < before.width; x += 1) {
      const color = source[y * before.width + x];
      for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) assert.equal(target[(y * 2 + dy) * scaled.width + x * 2 + dx], color);
    }
  }
  assert.equal(scaled.frames[0].durationMs, 1000 / 12);
  assert.equal(scaled.frames[1].durationMs, 1000 / 24);
  assert.deepEqual(scaled.layers[1], { id: before.layers[1].id, name: 'Hidden locked', visible: false, locked: true });
});

test('non-integer scale preserves fractional frame timing and PXD round trips every cel', async () => {
  const before = multiCelFixture();
  const scaled = scaleSpriteAnimation(before, 150);
  assert.deepEqual([scaled.width, scaled.height], [26, 23]);
  const restored = await readPxdAnimation(await decodePxd(await encodePxd(await writePxdAnimation(createPxdProject(), scaled))));
  assert.deepEqual([restored.width, restored.height], [26, 23]);
  assert.deepEqual(restored.frames, scaled.frames);
  assert.deepEqual(restored.layers, scaled.layers);
  assert.deepEqual(restored.palette, scaled.palette);
  for (let frame = 0; frame < scaled.frames.length; frame += 1) for (let layer = 0; layer < scaled.layers.length; layer += 1) {
    assert.deepEqual(celPixels(restored, frame, layer), celPixels(scaled, frame, layer));
  }
});

test('scale budget counts blank cels across frames and layers before any allocation', () => {
  let animation = createAnimation({ width: 16, height: 16 });
  for (let i = 1; i < 128; i += 1) animation = addAnimationFrame(animation, { copy: false });
  for (let i = 1; i < 8; i += 1) animation = addAnimationLayer(animation);
  const plan = planSpriteScale(animation, 1600);
  assert.equal(plan.width, 256); assert.equal(plan.height, 256);
  assert.equal(plan.targetLogicalPixels, 256 * 256 * 128 * 8);
  assert.ok(plan.targetLogicalPixels > ANIMATION_PIXEL_BUDGET);
  assert.equal(plan.allowed, false);
  assert.equal(plan.reasonCode, 'SPRITE_SCALE_PIXEL_BUDGET');
  assert.throws(() => scaleSpriteAnimation(animation, 1600), { code: 'SPRITE_SCALE_PIXEL_BUDGET' });
});

test('memory preflight rejects the 32MiB logical edge once retained history and pool copies are counted', () => {
  let animation = createAnimation({ width: 16, height: 16 });
  for (let i = 1; i < 64; i += 1) animation = addAnimationFrame(animation, { copy: false });
  for (let i = 1; i < 8; i += 1) animation = addAnimationLayer(animation);
  const plan = planSpriteScale(animation, 1600);
  assert.equal(plan.targetLogicalPixels, ANIMATION_PIXEL_BUDGET);
  assert.equal(plan.targetPoolCopiesBytes, ANIMATION_PIXEL_BUDGET * 2);
  assert.equal(plan.existingHistoryBytes, DRAW_ANIMATION_HISTORY_MAX_BYTES);
  assert.ok(plan.estimatedPeakBytes > DRAW_SPRITE_SCALE_MEMORY_MAX_BYTES);
  assert.equal(plan.reasonCode, 'SPRITE_SCALE_MEMORY_LIMIT');
  assert.throws(() => scaleSpriteAnimation(animation, 1600), { code: 'SPRITE_SCALE_MEMORY_LIMIT' });
});

function historyHeavyFixture() {
  let animation = createAnimation({ width: 64, height: 64, palette: ['#000000', '#ffffff'] });
  for (let i = 1; i < 64; i += 1) animation = addAnimationFrame(animation, { copy: false });
  for (let i = 1; i < 8; i += 1) animation = addAnimationLayer(animation);
  let seed = 0x6d2b79f5;
  for (const frame of animation.frames) for (const layer of animation.layers) {
    const pixels = new Uint8Array(64 * 64);
    for (let i = 0; i < pixels.length; i += 1) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels[i] = seed & 1 ? 1 : 2; }
    animation = writeAnimationCel(animation, frame.id, layer.id, { width: 64, height: 64, pixels });
  }
  return animation;
}

test('history limits reject oversized source or actual resized pool atomically', () => {
  assert.equal(DRAW_ANIMATION_HISTORY_MAX_BYTES, 4 * 1024 * 1024);
  assert.equal(DRAW_SPRITE_SCALE_MEMORY_MAX_BYTES, 64 * 1024 * 1024);
  const source = historyHeavyFixture();
  const sourceBytes = estimateRetainedAnimationBytes([source]);
  assert.ok(sourceBytes < DRAW_ANIMATION_HISTORY_MAX_BYTES, `source fits undo bound: ${sourceBytes}`);
  const session = createDrawAnimationSession(celPixelsAsDocument(source));
  session.load(source, { frameId: source.frames[0].id, layerId: source.layers[0].id });
  const historyBefore = session.snapshot();
  assert.throws(() => scaleSpriteAnimation(source, 150), { code: 'SPRITE_SCALE_TARGET_HISTORY_LIMIT' });
  assert.equal(session.animation, source);
  const historyAfter = session.snapshot();
  assert.equal(historyAfter.timeline.current, historyBefore.timeline.current);
  assert.deepEqual(historyAfter.timeline.past, historyBefore.timeline.past);
  assert.deepEqual(historyAfter.timeline.future, historyBefore.timeline.future);

  const oversizedSource = resizeAnimation(source, 96, 96, { resample: 'nearest' });
  const oversizedBytes = estimateRetainedAnimationBytes([oversizedSource]);
  assert.ok(oversizedBytes > DRAW_ANIMATION_HISTORY_MAX_BYTES, `oversized source exceeds undo bound: ${oversizedBytes}`);
  assert.equal(planSpriteScale(oversizedSource, 110).reasonCode, 'SPRITE_SCALE_HISTORY_LIMIT');
  assert.throws(() => scaleSpriteAnimation(oversizedSource, 110), { code: 'SPRITE_SCALE_HISTORY_LIMIT' });
  assert.equal(session.animation, source);
  assert.equal(session.snapshot().timeline.current, historyBefore.timeline.current);
});

function celPixelsAsDocument(animation) {
  return getAnimationCelDocument(animation, animation.frames[0].id, animation.layers[0].id);
}

test('legacy padding resize remains a transparent top-left canvas extension', () => {
  const source = createAnimation({ width: 3, height: 2 });
  const padded = resizeAnimation(source, 6, 4);
  assert.deepEqual([padded.width, padded.height], [6, 4]);
  assert.deepEqual(getAnimationCelDocument(padded, padded.frames[0].id, padded.layers[0].id).pixels, Array(24).fill(-1));
});
