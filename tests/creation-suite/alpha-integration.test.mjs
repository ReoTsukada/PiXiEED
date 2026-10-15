import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnimation, addAnimationLayer, writeAnimationCel, setLayerProperties,
  composeAnimationFrame, composeAnimationFrameRgba, animationNeedsRgba,
  estimateRetainedAnimationBytes
} from '../../js/creation/animation-core.mjs?rev=20261015-alpha-opacity-1';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { captureDrawSelection } from '../../js/creation/draw-selection-operations.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { putPxdSharedImage, readPxdSharedImage } from '../../js/creation/pxd-project.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';

function putCel(animation, layerId, pixels, width = animation.width, height = animation.height) {
  return writeAnimationCel(animation, animation.frames[0].id, layerId, { width, height, pixels });
}

test('RGBA source-over applies palette alpha and layer opacity at each visible layer', () => {
  let animation = createAnimation({ width: 1, height: 1, palette: ['#ff000080', '#0000ff80'] });
  const bottom = animation.layers[0].id;
  animation = putCel(animation, bottom, Uint8Array.of(1));
  animation = addAnimationLayer(animation, { name: 'top' });
  const top = animation.layers[1].id;
  animation = putCel(animation, top, Uint8Array.of(2));
  animation = setLayerProperties(animation, top, { opacity: 0.5 });
  assert.equal(animationNeedsRgba(animation), true);
  const isolated = composeAnimationFrameRgba(animation, animation.frames[0].id, { layerIds: [top] });
  assert.deepEqual([...isolated.rgba], [0, 0, 255, 64]); // round(128 × .5)
  const combined = composeAnimationFrameRgba(animation, animation.frames[0].id);
  assert.deepEqual([...combined.rgba], [153, 0, 102, 160]);
});

test('isolated alpha-243 RGBA is exact and opaque indexed display bytes remain unchanged', () => {
  let alpha = createAnimation({ width: 1, height: 1, palette: ['#1234abf3'] });
  alpha = putCel(alpha, alpha.layers[0].id, Uint8Array.of(1));
  assert.deepEqual([...composeAnimationFrameRgba(alpha, alpha.frames[0].id).rgba], [0x12, 0x34, 0xab, 243]);

  let opaque = createAnimation({ width: 3, height: 1, palette: ['#102030', '#abcdef', '#224466'] });
  const lower = opaque.layers[0].id;
  opaque = putCel(opaque, lower, Uint8Array.of(1, 2, 3));
  opaque = addAnimationLayer(opaque);
  opaque = putCel(opaque, opaque.layers[1].id, Uint8Array.of(0, 3, 0));
  const indexed = composeAnimationFrame(opaque, opaque.frames[0].id);
  const rgba = composeAnimationFrameRgba(opaque, opaque.frames[0].id).rgba;
  for (let i = 0; i < indexed.pixels.length; i += 1) {
    const hex = opaque.palette[indexed.pixels[i]];
    const expected = [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16), 255];
    assert.deepEqual([...rgba.slice(i * 4, i * 4 + 4)], expected);
  }
});

test('dirty RGBA recomposition matches a full render into a reusable target', () => {
  let animation = createAnimation({ width: 4, height: 1, palette: ['#ff000080', '#00ff0080', '#0000ffff'] });
  const lower = animation.layers[0].id;
  animation = putCel(animation, lower, Uint8Array.of(1, 1, 1, 1));
  animation = addAnimationLayer(animation);
  const upper = animation.layers[1].id;
  animation = putCel(animation, upper, Uint8Array.of(0, 2, 0, 0));
  const frameId = animation.frames[0].id;
  const target = composeAnimationFrameRgba(animation, frameId).rgba;
  animation = putCel(animation, upper, Uint8Array.of(0, 0, 0, 3));
  composeAnimationFrameRgba(animation, frameId, { target, changed: [1, 3] });
  assert.deepEqual([...target], [...composeAnimationFrameRgba(animation, frameId).rgba]);
});

test('selection copy preserves RGBA alpha through session undo/redo and PXD timeline save/reopen', async () => {
  const source = { schemaVersion: 1, width: 2, height: 1, palette: ['#e08040f3', '#2060a080'], pixels: [0, 1] };
  const session = createDrawAnimationSession(source);
  const doc = session.document();
  const clip = captureDrawSelection(doc, { x: 0, y: 0, width: 2, height: 1 });
  assert.deepEqual(clip.palette, ['#e08040f3', '#2060a080']);

  const opacityState = setLayerProperties(session.animation, session.layerId, { opacity: 0.5 });
  session.apply(opacityState);
  const changed = session.document(); changed.pixels[0] = 1; session.commitDocument(changed);
  assert.equal(session.canUndo, true);
  session.undo();
  assert.equal(session.document().pixels[0], 0);
  assert.equal(session.animation.layers[0].opacity, 0.5);
  session.redo();
  assert.equal(session.document().pixels[0], 1);
  const project = await writePxdAnimation(createPxdProject(), session.animation, { posterFrameId: session.frameId });
  const reopened = await readPxdAnimation(project);
  assert.equal(reopened.schemaVersion, 2);
  assert.deepEqual(reopened.palette, session.animation.palette);
  assert.equal(reopened.layers[0].opacity, 0.5);
  assert.deepEqual([...reopened.frames].map((frame) => frame.id), [...session.animation.frames].map((frame) => frame.id));
  assert.deepEqual([...composeAnimationFrameRgba(reopened, reopened.frames[0].id).rgba], [...composeAnimationFrameRgba(session.animation, session.frameId).rgba]);
});

test('shared RGBA poster route saves and reopens more than 128 derived colors', async () => {
  const rgba = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i += 1) {
    rgba.set([i & 255, i >> 4, (i * 73) & 255, 255], i * 4);
  }
  const project = await putPxdSharedImage(createPxdProject(), { width: 16, height: 16, rgba });
  const entry = project.entries.find(({ path }) => path === 'images/main/pixels.rgba');
  const metadata = project.entries.find(({ path }) => path === 'images/main/meta.json');
  assert.ok(entry);
  assert.ok(metadata);
  const reopened = await readPxdSharedImage(project);
  assert.equal(reopened.colorCount, 256);
  assert.deepEqual([...reopened.rgba], [...rgba]);
});

// Keep the imported estimator live as a guard that history accounting remains callable from this surface.
test('retained timeline estimate accepts immutable animation snapshots', () => {
  const animation = createAnimation({ width: 1, height: 1, palette: ['#ffffff'] });
  assert.ok(estimateRetainedAnimationBytes([animation]) > 0);
});
