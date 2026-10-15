import test from 'node:test';
import assert from 'node:assert/strict';
import * as legacyCore from '../../js/creation/animation-core-v20261012.mjs';
import * as alphaImplementation from '../../js/creation/animation-core-v20261015-alpha.mjs';
import {
  addAnimationLayer, animationNeedsRgba, composeAnimationFrame, composeAnimationFrameRgba,
  createAnimation, createAnimationFromDraw, getAnimationCelDocument, serializeAnimationPool,
  setAnimationPalette, setLayerProperties, validateAnimation, writeAnimationCel,
} from '../../js/creation/animation-core.mjs';
import { createPxdProject, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';

const doc = (pixels, palette) => ({ width: 2, height: 1, pixels, ...(palette ? { palette } : {}) });

test('RGBA palette and shared layer opacity composite source-over and preserve indexed cel data', () => {
  let animation = createAnimation({ width: 2, height: 1, palette: ['#ff0000f3', '#0000ff80'] });
  const bottom = animation.layers[0].id;
  animation = writeAnimationCel(animation, animation.frames[0].id, bottom, doc([1, 2]));
  animation = addAnimationLayer(animation, { name: 'Top' });
  const top = animation.layers[1].id;
  animation = setLayerProperties(animation, top, { opacity: 0.5 });
  animation = writeAnimationCel(animation, animation.frames[0].id, top, doc([2, 0]));

  assert.equal(animation.schemaVersion, 2);
  assert.equal(animationNeedsRgba(animation), true);
  assert.throws(() => composeAnimationFrame(animation, animation.frames[0].id), /RGBA/);
  assert.deepEqual(getAnimationCelDocument(animation, animation.frames[0].id, bottom).pixels, [0, 1]);
  assert.deepEqual([...composeAnimationFrameRgba(animation, animation.frames[0].id).rgba.slice(0, 4)], [189, 0, 66, 246]);

  const target = new Uint8ClampedArray(8).fill(17);
  const dirty = composeAnimationFrameRgba(animation, animation.frames[0].id, { target, changed: [1] });
  assert.deepEqual([...dirty.rgba.slice(0, 4)], [17, 17, 17, 17]);
  assert.deepEqual([...dirty.rgba.slice(4)], [0, 0, 255, 128]);
  const preview = composeAnimationFrameRgba(animation, animation.frames[0].id, { override: { layerId: top, document: doc([-1, 1], ['#ff0000f3', '#00ff0080']) } });
  assert.deepEqual([...preview.rgba.slice(4)], [0, 255, 0, 160]);
});

test('schema 2 PXD roundtrip retains zero-alpha swatches, layer opacity and strict schema 1', async () => {
  let animation = createAnimation({ width: 2, height: 1, palette: ['#12ab3400', '#abcdeff3'] });
  animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, doc([1, 2]));
  animation = setLayerProperties(animation, animation.layers[0].id, { opacity: 0.75 });
  const project = await writePxdAnimation(createPxdProject(), animation);
  const stateEntry = project.entries.find(({ path }) => path === 'animations/main/state.json');
  const state = JSON.parse(new TextDecoder().decode(stateEntry.bytes));
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.paletteEncoding, 'rgba8');
  assert.equal(state.compositing, 'source-over-srgb8-v1');
  const restored = await readPxdAnimation(project);
  assert.equal(restored.palette[0], '#12ab3400');
  assert.equal(restored.layers[0].opacity, 0.75);
  assert.deepEqual(getAnimationCelDocument(restored, restored.frames[0].id, restored.layers[0].id).pixels, [0, 1]);

  const opaque = createAnimation({ width: 1, height: 1, palette: ['#abcdef'] });
  const opaqueProject = await writePxdAnimation(createPxdProject(), opaque);
  assert.equal(JSON.parse(new TextDecoder().decode(opaqueProject.entries.find(({ path }) => path.endsWith('state.json')).bytes)).schemaVersion, 1);
  const opaqueState = JSON.parse(new TextDecoder().decode(opaqueProject.entries.find(({ path }) => path.endsWith('state.json')).bytes));
  const malformedLegacy = setPxdJson(opaqueProject, 'animations/main/state.json', { ...opaqueState, palette: ['#abcdef80'] });
  await assert.rejects(readPxdAnimation(malformedLegacy), { code: 'PXD_ANIMATION_VERSION' });
  const unknownPrior = setPxdJson(opaqueProject, 'animations/main/state.json', { ...opaqueState, schemaVersion: 91 });
  await assert.rejects(writePxdAnimation(unknownPrior, createAnimation({ width: 1, height: 1, palette: ['#12345680'] })), { code: 'PXD_ANIMATION_VERSION' });
  assert.equal(JSON.parse(new TextDecoder().decode(unknownPrior.entries.find(({ path }) => path.endsWith('state.json')).bytes)).schemaVersion, 91);
});

test('upgrading schema 1 backs up original state and sparse pool exactly once and retains unknown entries', async () => {
  let legacy = createAnimation({ width: 1, height: 1, palette: ['#123456'] });
  legacy = writeAnimationCel(legacy, legacy.frames[0].id, legacy.layers[0].id, { width: 1, height: 1, pixels: [1] });
  let project = await writePxdAnimation(createPxdProject({ entries: [{ path: 'future/data.bin', bytes: new Uint8Array([7, 8, 9]) }] }), legacy);
  const originalState = project.entries.find(({ path }) => path === 'animations/main/state.json').bytes;
  const originalPool = project.entries.find(({ path }) => path === 'animations/main/cels.bin').bytes;
  const upgraded = createAnimation({ width: 1, height: 1, palette: ['#123456f3'] });
  project = await writePxdAnimation(project, upgraded);
  assert.deepEqual(project.entries.find(({ path }) => path === 'animations/legacy/alpha-upgrade-main-v1/state.json').bytes, originalState);
  assert.deepEqual(project.entries.find(({ path }) => path === 'animations/legacy/alpha-upgrade-main-v1/cels.bin').bytes, originalPool);
  assert.deepEqual(project.entries.find(({ path }) => path === 'future/data.bin').bytes, new Uint8Array([7, 8, 9]));

  const refreshed = await writePxdAnimation(project, setLayerProperties(upgraded, upgraded.layers[0].id, { visible: false }));
  assert.equal(refreshed.entries.filter(({ path }) => path === 'animations/legacy/alpha-upgrade-main-v1/state.json').length, 1);
  assert.deepEqual(refreshed.entries.find(({ path }) => path === 'animations/legacy/alpha-upgrade-main-v1/state.json').bytes, originalState);
});

test('a schema 1 undo snapshot saves into an existing schema 2 project without mutating the snapshot', async () => {
  let undoSnapshot = createAnimation({ width: 2, height: 1, palette: ['#123456'] });
  undoSnapshot = writeAnimationCel(undoSnapshot, undoSnapshot.frames[0].id, undoSnapshot.layers[0].id, doc([1, 0]));
  const beforeCel = getAnimationCelDocument(undoSnapshot, undoSnapshot.frames[0].id, undoSnapshot.layers[0].id);
  const beforePool = serializeAnimationPool(undoSnapshot);
  const alphaCurrent = setAnimationPalette(undoSnapshot, ['#12345680']);
  const schema2Project = await writePxdAnimation(createPxdProject(), alphaCurrent);

  const afterUndoSave = await writePxdAnimation(schema2Project, undoSnapshot);
  assert.equal(undoSnapshot.schemaVersion, 1);
  assert.equal(validateAnimation(undoSnapshot), undoSnapshot);
  assert.deepEqual(getAnimationCelDocument(undoSnapshot, undoSnapshot.frames[0].id, undoSnapshot.layers[0].id), beforeCel);
  assert.deepEqual(serializeAnimationPool(undoSnapshot), beforePool);
  assert.deepEqual(
    afterUndoSave.entries.find(({ path }) => path === 'animations/main/cels.bin').bytes,
    schema2Project.entries.find(({ path }) => path === 'animations/main/cels.bin').bytes,
  );

  const savedState = JSON.parse(new TextDecoder().decode(afterUndoSave.entries.find(({ path }) => path === 'animations/main/state.json').bytes));
  assert.equal(savedState.schemaVersion, 2);
  assert.equal(savedState.pixelEncoding, 'palette-index8');
  assert.equal(savedState.paletteEncoding, 'rgba8');
  assert.equal(savedState.compositing, 'source-over-srgb8-v1');
  const restored = await readPxdAnimation(afterUndoSave);
  assert.equal(restored.schemaVersion, 2);
  assert.equal(restored.palette[0], '#123456');
  assert.deepEqual(getAnimationCelDocument(restored, restored.frames[0].id, restored.layers[0].id).pixels, beforeCel.pixels);
});

test('isolated opaque cel composition remains exact RGBA and invalid opacity is atomic', () => {
  let animation = createAnimation({ width: 2, height: 2, palette: ['#123456', '#fedcba'] });
  animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, { width: 2, height: 2, pixels: [1, 0, 2, 1] });
  animation = addAnimationLayer(animation);
  animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[1].id, { width: 2, height: 2, pixels: [0, 2, 1, 0] });
  const indexed = composeAnimationFrame(animation, animation.frames[0].id);
  const rgba = composeAnimationFrameRgba(animation, animation.frames[0].id).rgba;
  const expected = indexed.pixels.flatMap((index) => index < 0 ? [0, 0, 0, 0] : index === 0 ? [18, 52, 86, 255] : [254, 220, 186, 255]);
  assert.deepEqual([...rgba], expected);
  assert.equal(animationNeedsRgba(animation), false);
  assert.throws(() => setLayerProperties(animation, animation.layers[0].id, { opacity: 1.01 }), /レイヤー情報/);
  assert.equal(animation.layers[0].opacity, undefined);

  const imported = createAnimationFromDraw({ schemaVersion: 1, width: 1, height: 1, palette: ['#123456f3'], pixels: [0] });
  assert.deepEqual([...composeAnimationFrameRgba(imported, imported.frames[0].id).rgba], [18, 52, 86, 243]);
});

test('alpha implementation has one facade singleton while the dated legacy core remains isolated', () => {
  const animation = createAnimation({ width: 1, height: 1, palette: ['#12345680'] });
  assert.equal(alphaImplementation.createAnimation, createAnimation);
  assert.equal(alphaImplementation.validateAnimation(animation), animation);
  assert.throws(() => legacyCore.validateAnimation(animation), /形式に対応していません/);
  assert.throws(() => legacyCore.cloneAnimation(animation), /形式に対応していません/);

  const opaqueNew = alphaImplementation.createAnimation({ width: 1, height: 1, palette: ['#123456'] });
  assert.throws(() => legacyCore.getAnimationCelDocument(opaqueNew, opaqueNew.frames[0].id, opaqueNew.layers[0].id), /内部状態を持ちません/);
  const legacy = legacyCore.createAnimation({ width: 1, height: 1, palette: ['#123456'] });
  assert.throws(() => alphaImplementation.getAnimationCelDocument(legacy, legacy.frames[0].id, legacy.layers[0].id), /内部状態を持ちません/);
  assert.throws(() => legacyCore.createAnimation({ width: 1, height: 1, palette: ['#12345680'] }), /パレット/);
});

test('schema 1 roundtrip preserves unknown encoding metadata', async () => {
  const base = createAnimation({ width: 1, height: 1, palette: ['#123456'] });
  const preserved = alphaImplementation.createAnimationFromSerialized({
    ...base,
    pixelEncoding: 'future-pixel-format',
    paletteEncoding: 'future-palette-format',
    compositing: 'future-compositor',
  }, []);
  const project = await writePxdAnimation(createPxdProject(), preserved);
  const state = JSON.parse(new TextDecoder().decode(project.entries.find(({ path }) => path === 'animations/main/state.json').bytes));
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.pixelEncoding, 'future-pixel-format');
  assert.equal(state.paletteEncoding, 'future-palette-format');
  assert.equal(state.compositing, 'future-compositor');
  const restored = await readPxdAnimation(project);
  assert.equal(restored.pixelEncoding, 'future-pixel-format');
  assert.equal(restored.paletteEncoding, 'future-palette-format');
  assert.equal(restored.compositing, 'future-compositor');
});
