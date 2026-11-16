import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawDocument, createDrawHistory } from '../../js/creation/draw-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { captureDrawSelection, clearDrawSelection, createDrawSelectionClipboard, getDrawSelectionOtherColors } from '../../js/creation/draw-selection-operations.mjs';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';
import { NORMAL_MAP_PALETTE, addAnimationFrame, ensureAnimationNormalLayer, getAnimationCelDocument, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { createPxdProject, decodePxd, encodePxd } from '../../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';

const size = 64, bounds = { x: 20, y: 20, width: 16, height: 12 };

function fixture(artColors) {
  const art = createDrawDocument(size);
  art.palette = Array.from({ length: artColors }, (_, index) => `#${(0x210000 + index * 0x301).toString(16).padStart(6, '0')}`);
  art.pixels = Array.from({ length: size * size }, (_, index) => index % 11 === 0 ? -1 : index % artColors);
  const session = createDrawAnimationSession(art), artId = session.layerId, frameId = session.frameId;
  let animation = ensureAnimationNormalLayer(session.animation);
  const normalId = animation.layers.find(layer => layer.role === 'normal').id;
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
    const local = y * bounds.width + x;
    if (local % 5) pixels[(bounds.y + y) * size + bounds.x + x] = local % 17 + 1;
  }
  pixels[2 * size + 2] = 17;
  animation = writeAnimationCel(animation, frameId, normalId, { width: size, height: size, pixels });
  animation = addAnimationFrame(animation, { sourceFrameId: frameId, copy: true });
  session.load(animation, { frameId, layerId: normalId });
  return { session, artId, normalId, frameId };
}

function translatedPixels(original, dy, mask = null) {
  const expected = [...original];
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
    const index = y * size + x;
    if ((!mask || mask[index]) && original[index] >= 0) expected[index] = -1;
  }
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
    const index = y * size + x;
    if ((!mask || mask[index]) && original[index] >= 0) expected[(y + dy) * size + x] = original[index];
  }
  return expected;
}

function assertOtherCelsUnchanged(before, after, frameId, normalId) {
  assert.deepEqual(after.palette, before.palette, 'ordinary artwork palette remains byte-for-byte unchanged');
  for (const frame of before.frames) for (const layer of before.layers) {
    if (frame.id === frameId && layer.id === normalId) continue;
    assert.deepEqual(getAnimationCelDocument(after, frame.id, layer.id), getAnimationCelDocument(before, frame.id, layer.id),
      `untouched cel ${frame.id}/${layer.id} retains all pixels and its palette`);
  }
}

function historyCommit(session, history, next) {
  const prepared = session.prepareDocument(next);
  assert.equal(history.commit(next), true);
  prepared();
}

for (const artColors of [25, 64]) test(`64x64 normal Cut→Paste→up 4px confirms over ${artColors}-color art and survives PXD, Undo and Redo`, async () => {
  const { session, normalId, frameId } = fixture(artColors);
  const before = session.animation, live = session.document(), original = structuredClone(live);
  assert.deepEqual(new Set(live.pixels.filter(value => value >= 0)), new Set(Array.from({ length: 17 }, (_, index) => index)));
  const history = createDrawHistory(live), clipboard = createDrawSelectionClipboard();
  const clip = captureDrawSelection(live, bounds); clip.normalMap = true; clipboard.set(clip);
  historyCommit(session, history, clearDrawSelection(live, clip, bounds));
  const cut = session.animation, cutPixels = [...session.document().pixels];
  assert.equal(cutPixels[2 * size + 2], 16, 'cut does not erase the normal marker outside the selection');
  const pasted = createDrawSelectionTransform(live, bounds, { clipboard: clipboard.read(), owner: { animation: cut, frameId, layerId: normalId } });
  pasted.update({ y: bounds.y - 4 });
  const preview = pasted.project({ enforceLimits: false }).document;
  const expected = translatedPixels(original.pixels, -4);
  assert.deepEqual(preview.pixels, expected);
  assert.deepEqual(live.pixels, cutPixels, 'floating preview never commits or clears additional source data');
  const otherColors = getDrawSelectionOtherColors(session.animation, { frameId, layerId: normalId });
  assert.deepEqual(otherColors, [], 'ordinary art indices cannot be looked up in the independent 17-color normal palette');
  const confirmed = pasted.project({ otherColors }).document;
  assert.deepEqual(confirmed, preview, 'a valid preview remains valid at confirmation');
  assert.deepEqual(confirmed.palette, NORMAL_MAP_PALETTE, 'pasting never appends artwork colors to normal directions');
  historyCommit(session, history, confirmed);
  const after = session.animation;
  assert.deepEqual(session.document().pixels, expected);
  assertOtherCelsUnchanged(before, after, frameId, normalId);

  const reopened = await readPxdAnimation(await decodePxd(await encodePxd(await writePxdAnimation(createPxdProject(), after))));
  assert.deepEqual(getAnimationCelDocument(reopened, frameId, normalId).pixels, expected);
  assert.deepEqual(getAnimationCelDocument(reopened, frameId, normalId).palette, NORMAL_MAP_PALETTE);
  assertOtherCelsUnchanged(before, reopened, frameId, normalId);
  assert.deepEqual(session.undo().pixels, cutPixels, 'first Undo removes Paste and restores the committed Cut');
  assert.deepEqual(session.undo().pixels, original.pixels, 'second Undo recovers every original normal pixel');
  assert.deepEqual(session.redo().pixels, cutPixels);
  assert.deepEqual(session.redo().pixels, expected);
  assert.equal(session.layerId, normalId);
  assertOtherCelsUnchanged(before, session.animation, frameId, normalId);
});

test('masked normal movement and masked Cut/Paste preserve unselected normals with all 64 artwork colors in use', () => {
  for (const cutPaste of [false, true]) {
    const { session, normalId, frameId } = fixture(64), before = session.animation;
    const live = session.document(), original = structuredClone(live), mask = new Uint8Array(size * size);
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if ((x + y) % 3 !== 0) mask[y * size + x] = 1;
    }
    let transform;
    if (cutPaste) {
      const clip = captureDrawSelection(live, bounds, { mask }); clip.normalMap = true;
      session.commitDocument(clearDrawSelection(live, clip, bounds));
      transform = createDrawSelectionTransform(session.document(), bounds, { clipboard: clip });
    } else transform = createDrawSelectionTransform(live, bounds, { mask });
    transform.update({ y: bounds.y - 4 });
    const next = transform.project({ otherColors: getDrawSelectionOtherColors(session.animation, { frameId, layerId: normalId }) }).document;
    assert.deepEqual(next.pixels, translatedPixels(original.pixels, -4, mask));
    assert.deepEqual(next.palette, NORMAL_MAP_PALETTE);
    session.commitDocument(next);
    assertOtherCelsUnchanged(before, session.animation, frameId, normalId);
    if (cutPaste) session.undo();
    assert.deepEqual(session.undo().pixels, original.pixels);
  }
});

test('cancelled normal Paste retains the Cut and one Undo fully recovers it', () => {
  const { session, normalId, frameId } = fixture(64), original = session.document();
  const clip = captureDrawSelection(original, bounds); clip.normalMap = true;
  session.commitDocument(clearDrawSelection(original, clip, bounds));
  const cut = session.animation, pixels = [...session.document().pixels];
  const transform = createDrawSelectionTransform(session.document(), bounds, { clipboard: clip });
  transform.update({ y: bounds.y - 4 });
  transform.project({ otherColors: getDrawSelectionOtherColors(cut, { frameId, layerId: normalId }) });
  assert.equal(session.animation, cut, 'dropping the floating transaction does not mutate the committed timeline');
  assert.deepEqual(session.document().pixels, pixels);
  assert.deepEqual(session.undo().pixels, original.pixels);
});

test('ordinary selection budgets still include other art cels and exclude normal colors', () => {
  const { session, artId, frameId } = fixture(64), artPalette = [...session.animation.palette];
  const colors = getDrawSelectionOtherColors(session.animation, { frameId, layerId: artId });
  assert.deepEqual(new Set(colors), new Set(['#00000000', ...artPalette]));
  assert.ok(colors.every(color => typeof color === 'string'));
  const clip = captureDrawSelection({ schemaVersion: 1, width: 1, height: 1, palette: ['#00ffff'], pixels: [0] }, { x: 0, y: 0, width: 1, height: 1 });
  const paste = createDrawSelectionTransform(getAnimationCelDocument(session.animation, frameId, artId), { x: 0, y: 0, width: 1, height: 1 }, { clipboard: clip });
  assert.throws(() => paste.project({ otherColors: colors }), /64色/, 'normal isolation must not bypass the ordinary artwork color limit');
});
