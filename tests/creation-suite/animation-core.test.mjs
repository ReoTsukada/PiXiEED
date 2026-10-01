import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnimationFrame, addAnimationLayer, composeAnimationFrame, createAnimation, createAnimationFromDraw,
  createAnimationHistory, estimateRetainedAnimationBytes, getAnimationCelDocument, getAnimationUsedColorIndices, moveAnimationFrame, moveAnimationLayer, removeAnimationFrame,
  removeAnimationLayer, resizeAnimation, setAnimationFrameDuration, setAnimationPalette, setLayerProperties,
  validateAnimation, writeAnimationCel
} from '../../js/creation/animation-core.mjs';

test('legacy draw converts without changing pixels and cel reads return isolated legacy documents', () => {
  const source = { schemaVersion: 1, width: 2, height: 2, palette: ['#112233'], pixels: [-1, 0, 0, -1] };
  const animation = createAnimationFromDraw(source);
  assert.deepEqual(composeAnimationFrame(animation, animation.frames[0].id), source);
  const copy = getAnimationCelDocument(animation, animation.frames[0].id, animation.layers[0].id);
  copy.pixels[0] = 0;
  assert.deepEqual(getAnimationCelDocument(animation, animation.frames[0].id, animation.layers[0].id), source);
});

test('legacy half-transparent palette is refused instead of silently dropping alpha', () => {
  const legacy = { schemaVersion: 1, width: 1, height: 1, palette: ['#12345680'], pixels: [0] };
  assert.throws(() => createAnimationFromDraw(legacy), (error) => error instanceof RangeError && /半透明/.test(error.message));
  assert.deepEqual(legacy.palette, ['#12345680']);
  assert.deepEqual(legacy.pixels, [0]);
});

test('cloned/duplicated cels share copy-on-write bytes and edits never mutate their source', () => {
  let first = createAnimation({ width: 40, height: 32, palette: ['#123456', '#abcdef'] });
  const frameId = first.frames[0].id; const layerId = first.layers[0].id;
  const pixels = new Array(40 * 32).fill(1);
  first = writeAnimationCel(first, frameId, layerId, { width: 40, height: 32, pixels });
  const twin = addAnimationFrame(first, { sourceFrameId: frameId });
  const changed = writeAnimationCel(twin, twin.frames[1].id, layerId, { width: 40, height: 32, pixels: pixels.map((value, index) => index === 0 ? 2 : value) });
  assert.equal(getAnimationCelDocument(first, frameId, layerId).pixels[0], 0);
  assert.equal(getAnimationCelDocument(changed, twin.frames[1].id, layerId).pixels[0], 1);
  assert.equal(getAnimationCelDocument(changed, twin.frames[1].id, layerId).pixels[1], 0);
  assert.ok(validateAnimation(changed));
});

test('layers compose in order with visibility, locking metadata and explicit layer filters', () => {
  let animation = createAnimation({ width: 1, height: 1, palette: ['#111111', '#eeeeee'] });
  const frameId = animation.frames[0].id; const bottom = animation.layers[0].id;
  animation = writeAnimationCel(animation, frameId, bottom, { width: 1, height: 1, pixels: [1] });
  animation = addAnimationLayer(animation, { name: 'Top' }); const top = animation.layers[1].id;
  animation = writeAnimationCel(animation, frameId, top, { width: 1, height: 1, pixels: [2] });
  assert.equal(composeAnimationFrame(animation, frameId).pixels[0], 1);
  assert.equal(composeAnimationFrame(animation, frameId, { layerIds: [bottom] }).pixels[0], 0);
  animation = setLayerProperties(animation, top, { visible: false, locked: true });
  assert.equal(composeAnimationFrame(animation, frameId).pixels[0], 0);
  assert.equal(animation.layers[1].locked, true);
});

test('timeline and canvas operations preserve identity and reject invalid capacity atomically', () => {
  let animation = createAnimation({ width: 4, height: 4 });
  const frameId = animation.frames[0].id; const layerId = animation.layers[0].id;
  animation = setAnimationFrameDuration(animation, frameId, 240);
  animation = addAnimationFrame(animation); animation = moveAnimationFrame(animation, animation.frames[1].id, 0);
  animation = addAnimationLayer(animation); animation = moveAnimationLayer(animation, animation.layers[1].id, 0);
  assert.equal(animation.frames[0].durationMs, 240);
  assert.equal(animation.layers[0].name, 'Layer 2');
  animation = resizeAnimation(animation, 2, 2);
  assert.equal(animation.width, 2);
  const oneFrame = removeAnimationFrame(animation, frameId);
  assert.throws(() => removeAnimationFrame(oneFrame, oneFrame.frames[0].id), /最後のコマ/);
  const oneLayer = removeAnimationLayer(oneFrame, layerId);
  assert.throws(() => removeAnimationLayer(oneLayer, oneLayer.layers[0].id), /最後のレイヤー/);
  assert.equal(animation.frames.length, 2);
});

test('blank frame insertion preserves timeline identity and frame capacity stops at 128', () => {
  let animation = createAnimation({ width: 1, height: 1, palette: ['#123456'] });
  const originalId = animation.frames[0].id; const layerId = animation.layers[0].id;
  animation = writeAnimationCel(animation, originalId, layerId, { width: 1, height: 1, pixels: [1] });
  animation = addAnimationFrame(animation, { copy: false });
  assert.equal(animation.frames[1].durationMs, animation.frames[0].durationMs);
  assert.equal(getAnimationCelDocument(animation, animation.frames[1].id, layerId).pixels[0], -1);
  while (animation.frames.length < 128) animation = addAnimationFrame(animation, { copy: false });
  assert.throws(() => addAnimationFrame(animation), /128/);
  assert.equal(animation.frames[0].id, originalId);
});

test('palette edits retain index mapping and refuse removing a used color', () => {
  const animation = createAnimationFromDraw({ schemaVersion: 1, width: 1, height: 1, palette: ['#112233', '#445566'], pixels: [1] });
  assert.throws(() => setAnimationPalette(animation, ['#112233']), /使用中/);
  const recolored = setAnimationPalette(animation, ['#ffffff', '#000000']);
  assert.equal(getAnimationCelDocument(recolored, recolored.frames[0].id, recolored.layers[0].id).palette[1], '#000000');
});

test('used colors are counted across the whole timeline while allowing the active cel to be excluded', () => {
  const palette = Array.from({ length: 32 }, (_, index) => `#${(index + 1).toString(16).padStart(2, '0')}3344`);
  let animation = createAnimation({ width: 16, height: 1, palette }); const layerId = animation.layers[0].id;
  const firstFrame = animation.frames[0].id;
  animation = writeAnimationCel(animation, firstFrame, layerId, { width: 16, height: 1, pixels: Array.from({ length: 16 }, (_, index) => index + 1) });
  animation = addAnimationFrame(animation, { copy: false }); const secondFrame = animation.frames[1].id;
  animation = writeAnimationCel(animation, secondFrame, layerId, { width: 16, height: 1, pixels: Array.from({ length: 16 }, (_, index) => index + 17) });
  assert.equal(getAnimationUsedColorIndices(animation).size, 32);
  assert.deepEqual([...getAnimationUsedColorIndices(animation, { excludeFrameId: firstFrame, excludeLayerId: layerId })].sort((a, b) => a - b), Array.from({ length: 16 }, (_, index) => index + 16));
  assert.deepEqual([...getAnimationUsedColorIndices(animation, { excludeFrameId: secondFrame, excludeLayerId: layerId })].sort((a, b) => a - b), Array.from({ length: 16 }, (_, index) => index));
  animation = addAnimationLayer(animation);
  assert.equal(getAnimationUsedColorIndices(animation).has(-1), true);
  assert.throws(() => getAnimationUsedColorIndices(animation, { excludeFrameId: firstFrame }), /両方指定/);
});

test('bounded undo retains immutable snapshots and restores frame and pixel edits', () => {
  const initial = createAnimation({ width: 1, height: 1, palette: ['#112233'] });
  const history = createAnimationHistory(initial, { maxBytes: 100000, maxEntries: 4 });
  const next = writeAnimationCel(initial, initial.frames[0].id, initial.layers[0].id, { width: 1, height: 1, pixels: [1] });
  history.commit(next);
  assert.equal(history.canUndo, true);
  history.undo(); assert.equal(history.current, initial);
  history.redo(); assert.equal(getAnimationCelDocument(history.current, initial.frames[0].id, initial.layers[0].id).pixels[0], 0);
  const added = addAnimationFrame(history.current); history.commit(added); history.reset(initial);
  assert.equal(history.canUndo, false);
});

test('undo budget counts only bytes retained in addition to a large current animation', () => {
  const size = 256; let animation = createAnimation({ width: size, height: size, palette: Array.from({ length: 32 }, (_, index) => `#${(index + 1).toString(16).padStart(2, '0')}3344`) });
  const layerId = animation.layers[0].id;
  for (let frameIndex = 0; frameIndex < 80; frameIndex += 1) {
    if (frameIndex) animation = addAnimationFrame(animation, { copy: false });
    const frameId = animation.frames.at(-1).id; let seed = frameIndex + 1; const pixels = new Uint8Array(size * size);
    for (let index = 0; index < pixels.length; index += 1) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels[index] = (seed >>> 0) % 32 + 1; }
    animation = writeAnimationCel(animation, frameId, layerId, { width: size, height: size, pixels });
  }
  const currentBytes = estimateRetainedAnimationBytes([animation]);
  const undoBudget = 32 * 1024;
  assert.ok(currentBytes > undoBudget, `fixture is ${currentBytes} bytes`);
  const history = createAnimationHistory(animation, { maxBytes: undoBudget, maxEntries: 4 });
  const frameId = animation.frames.at(-1).id; const prior = getAnimationCelDocument(animation, frameId, layerId).pixels.map((value) => value + 1);
  prior[0] = prior[0] === 32 ? 1 : prior[0] + 1;
  const next = writeAnimationCel(animation, frameId, layerId, { width: size, height: size, pixels: prior });
  history.commit(next);
  assert.equal(history.canUndo, true);
  assert.equal(history.undo(), true);
  assert.equal(history.current, animation);
});
