import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMATION_NORMAL_SCHEMA_VERSION, NORMAL_MAP_PALETTE, NORMAL_MAP_SWATCHES,
  addAnimationFrame, composeAnimationFrame, createAnimation, createAnimationHistory,
  createAnimationFromSerialized, ensureAnimationNormalLayer, getAnimationCelDocument,
  getAnimationLayerPalette, getAnimationUsedColorIndices, removeAnimationLayer,
  resizeAnimation, setAnimationPalette, setLayerProperties, writeAnimationCel
} from '../../js/creation/animation-core.mjs';
import { createPxdProject, getPxdJson } from '../../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';

const doc = (width, height, pixels, palette) => ({ width, height, pixels, palette });

test('normal layer gets an isolated fixed palette and art palette changes do not alter it', () => {
  let animation = createAnimation({ width: 2, height: 1, palette: ['#123456'] });
  const artLayerId = animation.layers[0].id;
  animation = writeAnimationCel(animation, animation.frames[0].id, artLayerId, doc(2, 1, [1, 0]));
  animation = ensureAnimationNormalLayer(animation);
  const normal = animation.layers.find((layer) => layer.role === 'normal');
  assert.equal(animation.schemaVersion, ANIMATION_NORMAL_SCHEMA_VERSION);
  assert.equal(animation.normalEncoding, 'tangent-rgb8-17swatch-v1');
  assert.equal(NORMAL_MAP_PALETTE.length, 17);
  assert.deepEqual(NORMAL_MAP_SWATCHES.map(({ color }) => color), NORMAL_MAP_PALETTE);
  assert.deepEqual(getAnimationLayerPalette(animation, normal.id), NORMAL_MAP_PALETTE);
  animation = writeAnimationCel(animation, animation.frames[0].id, normal.id, doc(2, 1, [17, 1]));
  assert.deepEqual(getAnimationCelDocument(animation, animation.frames[0].id, normal.id).pixels, [16, 0]);
  assert.deepEqual(getAnimationUsedColorIndices(animation), new Set([-1, 0]));
  const beforeNormal = getAnimationCelDocument(animation, animation.frames[0].id, normal.id);
  animation = setAnimationPalette(animation, ['#abcdef']);
  assert.deepEqual(getAnimationLayerPalette(animation, normal.id), NORMAL_MAP_PALETTE);
  assert.deepEqual(getAnimationCelDocument(animation, animation.frames[0].id, normal.id), beforeNormal);
});

test('normal cels are excluded from ordinary frame composition and stay opaque role metadata', () => {
  let animation = ensureAnimationNormalLayer(createAnimation({ width: 1, height: 1, palette: ['#123456'] }));
  const [art, normal] = animation.layers;
  animation = writeAnimationCel(animation, animation.frames[0].id, art.id, doc(1, 1, [1]));
  animation = writeAnimationCel(animation, animation.frames[0].id, normal.id, doc(1, 1, [17]));
  assert.deepEqual(composeAnimationFrame(animation, animation.frames[0].id).pixels, [0]);
  assert.throws(() => setLayerProperties(animation, normal.id, { role: 'paint' }), /役割/);
  assert.throws(() => setLayerProperties(animation, normal.id, { opacity: 0.5 }), /不透明度/);
  assert.throws(() => removeAnimationLayer(animation, art.id), /通常レイヤー/);
  const withoutNormal = removeAnimationLayer(animation, normal.id);
  assert.deepEqual(composeAnimationFrame(withoutNormal, animation.frames[0].id).pixels, [0]);
});

test('normal cels copy across frames, resize, and immutable undo history', () => {
  let animation = ensureAnimationNormalLayer(createAnimation({ width: 2, height: 1, palette: ['#123456'] }));
  const normal = animation.layers.find((layer) => layer.role === 'normal');
  animation = writeAnimationCel(animation, animation.frames[0].id, normal.id, doc(2, 1, [2, 17]));
  const copied = addAnimationFrame(animation, { copy: true });
  assert.deepEqual(getAnimationCelDocument(copied, copied.frames[1].id, normal.id).pixels, [1, 16]);
  const resized = resizeAnimation(copied, 3, 1);
  assert.deepEqual(getAnimationCelDocument(resized, resized.frames[1].id, normal.id).pixels, [1, 16, -1]);
  const history = createAnimationHistory(animation);
  history.commit(copied);
  assert.equal(history.undo(), true);
  assert.deepEqual(getAnimationCelDocument(history.current, animation.frames[0].id, normal.id).pixels, [1, 16]);
  assert.equal(history.redo(), true);
  assert.equal(history.current.frames.length, 2);
});

test('schema 5 PXD roundtrip preserves independent normal indices and rejects invalid roles or indices', async () => {
  let animation = ensureAnimationNormalLayer(createAnimation({ width: 2, height: 1, palette: ['#123456'] }));
  const normal = animation.layers.find((layer) => layer.role === 'normal');
  animation = writeAnimationCel(animation, animation.frames[0].id, normal.id, doc(2, 1, [17, 3]));
  const project = await writePxdAnimation(createPxdProject(), animation);
  assert.equal(getPxdJson(project, 'animations/main/state.json').normalEncoding, 'tangent-rgb8-17swatch-v1');
  const restored = await readPxdAnimation(project);
  assert.deepEqual(getAnimationCelDocument(restored, restored.frames[0].id, normal.id).pixels, [16, 2]);
  assert.throws(() => writeAnimationCel(animation, animation.frames[0].id, normal.id, doc(2, 1, [18, 0])), /色番号/);
  const oldSchemaMeta = { ...animation, schemaVersion: 3, normalEncoding: undefined };
  assert.throws(() => createAnimationFromSerialized(oldSchemaMeta, []), error => error.code === 'PXD_ANIMATION_VERSION');
});
