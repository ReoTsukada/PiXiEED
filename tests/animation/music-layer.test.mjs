import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnimationFrame, addAnimationLayer, composeAnimationFrame, createAnimation,
  createAnimationHistory, ensureAnimationMusicLayer, getAnimationCelDocument,
  getAnimationUsedColorIndices,
  moveAnimationFrame, moveAnimationLayer, removeAnimationFrame, removeAnimationLayer,
  resizeAnimation, serializeAnimationPool, setLayerProperties, writeAnimationCel,
} from '../../js/creation/animation-core.mjs';
import { createPxdProject, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';

const cel = (animation, frameId, layerId, pixels) => writeAnimationCel(animation, frameId, layerId, {
  width: animation.width, height: animation.height, pixels,
});

test('music layer stores one shared cel through frame creation, reorder and first-frame removal', () => {
  let animation = ensureAnimationMusicLayer(createAnimation({ width: 2, height: 1 }));
  const [music, normal] = animation.layers;
  const first = animation.frames[0].id;
  animation = cel(animation, first, music.id, [1, 0]);
  animation = cel(animation, first, normal.id, [0, 1]);
  animation = addAnimationFrame(animation, { sourceFrameId: first, copy: false });
  const second = animation.frames[1].id;
  assert.deepEqual(getAnimationCelDocument(animation, second, music.id).pixels, [0, -1]);
  animation = cel(animation, second, music.id, [0, 0]);
  assert.deepEqual(animation.frames.map(({ id }) => getAnimationCelDocument(animation, id, music.id).pixels), [[-1, -1], [-1, -1]]);
  animation = cel(animation, second, music.id, [1, 0]);
  assert.deepEqual(animation.frames.map(({ id }) => getAnimationCelDocument(animation, id, music.id).pixels), [[0, -1], [0, -1]]);
  animation = moveAnimationFrame(animation, second, 0);
  assert.deepEqual(getAnimationCelDocument(animation, animation.frames[0].id, music.id).pixels, [0, -1]);
  animation = removeAnimationFrame(animation, second);
  assert.equal(animation.frames.length, 1);
  assert.deepEqual(getAnimationCelDocument(animation, animation.frames[0].id, music.id).pixels, [0, -1]);
  assert.deepEqual(getAnimationCelDocument(animation, animation.frames[0].id, normal.id).pixels, [-1, 0]);
});

test('music layer is bottom, singleton, protected from delete/move/role mutation, and permits eight normal layers', () => {
  let animation = ensureAnimationMusicLayer(createAnimation({ width: 1, height: 1 }));
  const music = animation.layers[0];
  assert.equal(ensureAnimationMusicLayer(animation), animation);
  assert.equal(music.visible, false);
  assert.equal(music.locked, false);
  assert.throws(() => removeAnimationLayer(animation, music.id), /音楽レイヤー/);
  assert.throws(() => moveAnimationLayer(animation, music.id, 1), /音楽レイヤー/);
  assert.throws(() => moveAnimationLayer(animation, animation.layers[1].id, 0), /音楽レイヤー/);
  assert.throws(() => setLayerProperties(animation, music.id, { role: 'paint' }), /役割/);
  assert.throws(() => setLayerProperties(animation, animation.layers[1].id, { role: 'music' }), /役割/);
  animation = setLayerProperties(animation, music.id, { name: 'BGM' });
  assert.equal(animation.layers[0].role, 'music');
  for (let index = 1; index < 8; index += 1) animation = addAnimationLayer(animation);
  assert.equal(animation.layers.length, 9);
  assert.throws(() => addAnimationLayer(animation), /通常レイヤーは8枚/);
  assert.throws(() => removeAnimationLayer(animation, music.id), /音楽レイヤー/);
});

test('music is opt-out from product composition; its cel survives resize and immutable undo/redo', () => {
  let animation = ensureAnimationMusicLayer(createAnimation({ width: 2, height: 1 }));
  const music = animation.layers[0].id;
  const first = animation.frames[0].id;
  animation = cel(animation, first, music, [1, 0]);
  assert.deepEqual(composeAnimationFrame(animation, first).pixels, [-1, -1]);
  animation = setLayerProperties(animation, music, { visible: true });
  assert.deepEqual(composeAnimationFrame(animation, first, { excludeMusic: false }).pixels, [0, -1]);
  assert.deepEqual(composeAnimationFrame(animation, first, { excludeMusic: true }).pixels, [-1, -1]);
  const history = createAnimationHistory(animation);
  const changed = cel(animation, first, music, [0, 1]);
  history.commit(changed);
  assert.deepEqual(getAnimationCelDocument(history.current, first, music).pixels, [-1, 0]);
  history.undo();
  assert.deepEqual(getAnimationCelDocument(history.current, first, music).pixels, [0, -1]);
  history.redo();
  assert.deepEqual(getAnimationCelDocument(history.current, first, music).pixels, [-1, 0]);
  const resized = resizeAnimation(history.current, 3, 1);
  assert.deepEqual(getAnimationCelDocument(resized, first, music).pixels, [-1, 0, -1]);
  assert.deepEqual(resized.layers[0], history.current.layers[0]);
});

test('PXD roundtrip persists one canonical shared music cel; duplicate or noncanonical cels fail closed', async () => {
  let animation = ensureAnimationMusicLayer(createAnimation({ width: 2, height: 1 }));
  const music = animation.layers[0].id;
  const first = animation.frames[0].id;
  animation = cel(animation, first, music, [1, 0]);
  animation = addAnimationFrame(animation, { copy: false });
  const project = await writePxdAnimation(createPxdProject(), animation);
  const restored = await readPxdAnimation(project);
  assert.equal(restored.layers[0].role, 'music');
  assert.deepEqual(restored.frames.map(({ id }) => getAnimationCelDocument(restored, id, music).pixels), [[0, -1], [0, -1]]);
  const state = getPxdJson(project, 'animations/main/state.json');
  const ambiguous = setPxdJson(project, 'animations/main/state.json', {
    ...state,
    cels: [...state.cels, { frameId: animation.frames[1].id, layerId: music, tiles: [] }],
  });
  await assert.rejects(() => readPxdAnimation(ambiguous), /共有コマ保存が曖昧/);
});

test('resize keeps one shared music cel; a later-frame paint, color exclusion, serialization and PXD reload stay canonical', async () => {
  let animation = ensureAnimationMusicLayer(createAnimation({ width: 2, height: 1, palette: ['#123456', '#abcdef'] }));
  const music = animation.layers[0].id;
  const first = animation.frames[0].id;
  animation = cel(animation, first, music, [1, 0]);
  animation = addAnimationFrame(animation, { sourceFrameId: first, copy: false });
  const second = animation.frames[1].id;
  animation = resizeAnimation(animation, 3, 1);
  animation = cel(animation, second, music, [0, 2, 0]);
  assert.deepEqual(getAnimationCelDocument(animation, first, music).pixels, [-1, 1, -1]);
  assert.deepEqual(getAnimationCelDocument(animation, second, music).pixels, [-1, 1, -1]);
  assert.equal(getAnimationUsedColorIndices(animation).has(1), true);
  assert.equal(getAnimationUsedColorIndices(animation, { excludeFrameId: second, excludeLayerId: music }).has(1), false);
  assert.deepEqual(serializeAnimationPool(animation).filter(({ layerId }) => layerId === music).map(({ frameId }) => frameId), [first]);
  const restored = await readPxdAnimation(await writePxdAnimation(createPxdProject(), animation));
  assert.deepEqual(getAnimationCelDocument(restored, restored.frames[0].id, music).pixels, [-1, 1, -1]);
  assert.deepEqual(getAnimationCelDocument(restored, restored.frames[1].id, music).pixels, [-1, 1, -1]);
});
