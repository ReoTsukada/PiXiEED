import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as animationCore from '../../js/creation/animation-core.mjs';
import * as rewardPolicy from '../../js/creation/site-reward-draw-policy.mjs';
import {
  createAnimation, writeAnimationCel, getAnimationCelDocument, setAnimationPalette,
  setLayerProperties, addAnimationFrame, moveAnimationFrame,
  getAnimationDrawRewardBonusColors, setAnimationDrawRewardBonusColors
} from '../../js/creation/animation-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { writePxdAnimation, readPxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { documentRgba, encodePng } from '../../js/creation/draw-core.mjs';
import { prepareCameraTarget, planCameraReplacement } from '../../js/creation/draw-camera-core.mjs';
import { prepareSharedCanvasImage } from '../../js/creation/shared-image.mjs';
import { imageToDrawDocument } from '../../js/creation/pxd-project.mjs';
import { mountDrawMusicModel } from '../../js/creation/draw-music-model.mjs';
import { createDrawMusicTrackState, projectDrawMusic } from '../../js/creation/draw-music-core.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs';

const palette = Array.from({ length: 64 }, (_, index) => `#${(index + 1).toString(16).padStart(6, '0')}ff`);
const protectedColors = palette.slice(32);
function imported64Timeline() {
  const rgba = Uint8Array.from({ length: 64 * 4 }, (_, i) => i % 4 === 3 ? 255 : i % 4 === 0 ? Math.floor(i / 4) : 100);
  const timeline = createDrawAnimationSession(imageToDrawDocument({ width: 16, height: 4, rgba }), { musicLayer: true }).animation;
  setAnimationDrawRewardBonusColors(timeline, timeline.palette.slice(32).map(color => color.length === 7 ? `${color}ff` : color));
  return timeline;
}

for (const enabled of [true, false]) test(`fresh 64-color image import rebinds blank music and preserves expired free edits (policy ${enabled})`, async () => {
  const original = animationCore.ensureAnimationMusicLayer(createAnimation({ width: 16, height: 16, palette: ['#000000', '#ffffff'] }));
  let current = original, entitled = true, validator, listener;
  const cleanups = [];
  const draw = {
    getTimeline: () => current,
    subscribe(fn) { listener = fn; return () => {}; },
    async attachProjectHooks(hooks) { await hooks.onOpen(createPxdProject(), current); return () => {}; },
    async applyMusicPage(doc, options) {
      current = writeAnimationCel(current, current.frames[0].id, current.layers.find(layer => layer.role === 'music').id,
        { ...doc, pixels: Uint8Array.from(doc.pixels, value => value + 1) });
      options.prepareTimeline(current); listener?.();
    },
    setMusicTimelineValidator(fn) { validator = fn; return () => {}; },
    snapshotTimeline: () => ({ animation: current }),
    restoreTimelineSnapshot(snapshot) { current = snapshot.animation; listener?.(); },
    setMusicReadOnly(reason) { this.readOnlyReason = reason; }
  };
  const model = await mountDrawMusicModel({ draw, scope: { add(fn) { cleanups.push(fn); } },
    rewardPolicy: { isEnabled: () => enabled, hasReward: () => entitled, require: () => false } });
  const baseline = current;
  const imported = imported64Timeline();
  assert.notEqual(imported.layers[0].id, baseline.layers[0].id);
  assert.equal(validator({ before: current, after: imported, rewardActive: true }), true);
  entitled = false; // The captured lease still covers the exact import candidate.
  current = imported; listener();
  assert.equal(draw.readOnlyReason, '');
  assert.equal(model.getState().musicLayerId, imported.layers[0].id);
  assert.equal(model.getState().link.musicTrack.layerId, imported.layers[0].id);
  assert.equal(model.getState().musicAnimation.schemaVersion, 3);
  const beforeSong = model.getState().song;
  const nextPalette = [...current.palette]; nextPalette[0] = '#fedcba';
  const remapped = planSharedProjectSettings(current, { palette: nextPalette }).animation;
  assert.equal(validator({ before: current, after: remapped, rewardActive: false }), true);
  current = remapped; listener();
  assert.equal(current.palette[0], '#fedcba');
  assert.deepEqual(model.getState().song, beforeSong);
  assert.equal(validator({ before: current, after: imported, rewardActive: false }), true);
  current = imported; listener();
  assert.equal(model.getState().musicLayerId, imported.layers[0].id);
  entitled = true;
  assert.equal(validator({ before: current, after: baseline, rewardActive: true }), true);
  current = baseline; listener();
  assert.equal(model.getState().musicLayerId, baseline.layers[0].id);
  assert.equal(validator({ before: current, after: imported, rewardActive: true }), true);
  current = imported; listener();
  assert.equal(model.getState().musicLayerId, imported.layers[0].id);
  for (const cleanup of cleanups) cleanup();
});

test('fresh image replacement cannot rebind and erase nonempty music pages', async () => {
  const art = animationCore.ensureAnimationMusicLayer(createAnimation({ width: 16, height: 16, palette: ['#000000'] }));
  let state = await createDrawMusicTrackState(null, art);
  const page = state.musicAnimation;
  const pixels = new Uint8Array(256); pixels[0] = 1;
  state = { ...state, musicAnimation: writeAnimationCel(page, page.frames[0].id, page.layers[0].id,
    { width: 16, height: 16, pixels }) };
  assert.throws(() => projectDrawMusic(state, imported64Timeline()), { code: 'DRAW_MUSIC_TRACK_BINDING_INVALID' });
  assert.equal(getAnimationCelDocument(state.musicAnimation, page.frames[0].id, page.layers[0].id).pixels[0], 0);
});

function fixture() {
  let animation = createAnimation({ width: 64, height: 1, palette });
  animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id,
    { width: 64, height: 1, pixels: Uint8Array.from({ length: 64 }, (_, index) => index + 1) });
  setAnimationDrawRewardBonusColors(animation, protectedColors);
  return animation;
}

function guardHarness(animation, { entitled = false, enabled = true } = {}) {
  const session = { animation, frameId: animation.frames[0].id, layerId: animation.layers[0].id };
  const context = {
    ...animationCore, ...rewardPolicy, indexedDocumentRgba: documentRgba,
    drawRewardPolicy: rewardPolicy.createSiteRewardDrawPolicy({ enabled: () => enabled, hasReward: () => entitled }),
    drawOperationLease: null, animationSession: session,
    documentData: getAnimationCelDocument(animation, session.frameId, session.layerId),
    selectedColor: 0, musicLayer: false, toast() {}
  };
  const source = readFileSync(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function drawRewardTarget('), source.indexOf('function captureDrawOperation(')), context);
  return context;
}

test('actual expired Draw guard allows free erase and Undo while still refusing formerly 33rd color edits', () => {
  const original = fixture();
  const doc = getAnimationCelDocument(original, original.frames[0].id, original.layers[0].id);
  doc.pixels[0] = -1;
  const erased = writeAnimationCel(original, original.frames[0].id, original.layers[0].id,
    { ...doc, pixels: Uint8Array.from(doc.pixels, index => index + 1) });
  assert.equal(guardHarness(original).guardDrawTransition(erased), true);
  assert.deepEqual(getAnimationDrawRewardBonusColors(erased), protectedColors);
  assert.equal(guardHarness(erased).guardDrawTransition(original, { mutation: 'history' }), true);
  doc.pixels[32] = -1;
  const erasedBonus = writeAnimationCel(erased, erased.frames[0].id, erased.layers[0].id,
    { ...doc, pixels: Uint8Array.from(doc.pixels, index => index + 1) });
  assert.equal(guardHarness(erased).guardDrawTransition(erasedBonus), false);
});

test('actual Draw guard denies a 33rd free color but accepts it with a captured reward or disabled policy', () => {
  let original = createAnimation({ width: 64, height: 1, palette });
  const pixels = Uint8Array.from({ length: 64 }, (_, index) => index < 32 ? index + 1 : 0);
  original = writeAnimationCel(original, original.frames[0].id, original.layers[0].id, { width: 64, height: 1, pixels });
  setAnimationDrawRewardBonusColors(original, []);
  pixels[32] = 33;
  const candidate = writeAnimationCel(original, original.frames[0].id, original.layers[0].id, { width: 64, height: 1, pixels });
  assert.equal(guardHarness(original).guardDrawTransition(candidate), false);
  assert.equal(guardHarness(original, { entitled: true }).guardDrawTransition(candidate), true);
  assert.equal(guardHarness(original, { enabled: false }).guardDrawTransition(candidate), true);
});

test('erasing a free color never promotes bonus colors through later metadata, palette, or frame edits', () => {
  const original = fixture();
  const doc = getAnimationCelDocument(original, original.frames[0].id, original.layers[0].id);
  doc.pixels[0] = -1;
  let edited = writeAnimationCel(original, original.frames[0].id, original.layers[0].id,
    { ...doc, pixels: Uint8Array.from(doc.pixels, index => index + 1) });
  assert.deepEqual(getAnimationDrawRewardBonusColors(edited), protectedColors);
  edited = setLayerProperties(edited, edited.layers[0].id, { name: 'Free edit' });
  assert.deepEqual(getAnimationDrawRewardBonusColors(edited), protectedColors);
  edited = setAnimationPalette(edited, ['#abcdef80', ...palette.slice(1)]);
  assert.deepEqual(getAnimationDrawRewardBonusColors(edited), protectedColors);
  edited = addAnimationFrame(edited, { copy: false });
  edited = moveAnimationFrame(edited, edited.frames[1].id, 0);
  assert.deepEqual(getAnimationDrawRewardBonusColors(edited), protectedColors);
  assert.deepEqual(getAnimationDrawRewardBonusColors(original), protectedColors);
});

test('PXD roundtrip preserves color ownership and latest attached ownership wins after reload', async () => {
  const original = fixture();
  let project = await writePxdAnimation(createPxdProject(), original);
  const reloaded = await readPxdAnimation(project);
  assert.deepEqual(getAnimationDrawRewardBonusColors(reloaded), protectedColors);
  const changedOwnership = palette.slice(31);
  setAnimationDrawRewardBonusColors(reloaded, changedOwnership);
  const copy = getAnimationDrawRewardBonusColors(reloaded); copy.pop();
  assert.deepEqual(getAnimationDrawRewardBonusColors(reloaded), changedOwnership, 'callers cannot mutate ownership through returned arrays');
  project = await writePxdAnimation(project, setLayerProperties(reloaded, reloaded.layers[0].id, { name: 'Reloaded' }));
  assert.deepEqual(getAnimationDrawRewardBonusColors(await readPxdAnimation(project)), changedOwnership);
});

test('free cel edits and animation Undo/Redo retain the bonus RGBA ownership', () => {
  const original = fixture();
  const doc = getAnimationCelDocument(original, original.frames[0].id, original.layers[0].id);
  const session = createDrawAnimationSession(doc);
  session.load(original);
  const changed = session.document(); changed.pixels[0] = -1;
  const prepared = session.prepareDocument(changed); prepared();
  assert.deepEqual(getAnimationDrawRewardBonusColors(session.animation), protectedColors);
  session.undo();
  assert.equal(session.document().pixels[0], 0);
  assert.deepEqual(getAnimationDrawRewardBonusColors(session.animation), protectedColors);
  session.redo();
  assert.equal(session.document().pixels[0], -1);
  assert.deepEqual(getAnimationDrawRewardBonusColors(session.animation), protectedColors);
});

test('same-palette camera replacement and direct PNG preparation preserve 64 RGBA colors exactly', () => {
  const doc = { schemaVersion: 1, width: 64, height: 1, palette, pixels: palette.map((_, index) => index) };
  const rgba = documentRgba(doc), target = prepareCameraTarget(doc);
  for (const paletteFixed of [false, true]) {
    const planned = planCameraReplacement(target, rgba, { paletteFixed });
    assert.deepEqual(planned.additions, []);
    assert.deepEqual(documentRgba(planned.document), rgba);
  }
  const prepared = prepareSharedCanvasImage({ width: 64, height: 1, rgba }, { passActive: true });
  assert.deepEqual(documentRgba(imageToDrawDocument(prepared.image)), rgba);
  const png = encodePng(doc), compressed = [];
  for (let offset = 8; offset < png.length;) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
    if (Buffer.from(png.subarray(offset + 4, offset + 8)).toString() === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const scanline = inflateSync(Buffer.concat(compressed));
  assert.equal(scanline[0], 0);
  assert.deepEqual(new Uint8Array(scanline.subarray(1)), rgba);
});
