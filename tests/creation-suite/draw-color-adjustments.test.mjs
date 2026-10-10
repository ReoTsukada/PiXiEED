import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustDrawColorAnimation, adjustDrawColorDocument } from '../../js/creation/draw-color-adjustments.mjs';
import { addAnimationFrame, addAnimationLayer, createAnimation, getAnimationCelDocument, setLayerProperties, writeAnimationCel } from '../../js/creation/animation-core.mjs';

const settings = { brightness: 25, contrast: 0, saturation: 100, curve: [0, 64, 128, 192, 255] };
const document = { schemaVersion: 1, width: 4, height: 1, palette: ['#202020', '#808080', '#e0e0e0'], pixels: [0, 1, -1, 2] };

test('adds adjusted colors without changing existing palette entries or unrelated indexed pixels', async () => {
  const mask = Uint8Array.from([1, 0, 1, 1]);
  const result = await adjustDrawColorDocument(document, settings, { selectionMask: mask });
  assert.notEqual(result, document);
  assert.deepEqual(result.palette.slice(0, document.palette.length), document.palette);
  assert.ok(result.palette.length > document.palette.length);
  assert.equal(result.pixels[1], document.pixels[1], 'outside selection keeps its index');
  assert.equal(result.pixels[2], -1, 'transparent stays transparent');
  assert.notEqual(result.pixels[0], document.pixels[0]);
  assert.deepEqual(document.palette, ['#202020', '#808080', '#e0e0e0'], 'the source/shared palette is detached and untouched');
});

test('no-op returns the exact source and does not add palette entries', async () => {
  const result = await adjustDrawColorDocument(document, {});
  assert.equal(result, document);
});

test('full palette blocks exact additions and nearest mode is explicit', async () => {
  const palette = Array.from({ length: 128 }, (_, index) => `#${index.toString(16).padStart(2, '0')}0000`);
  const full = { ...document, palette, pixels: [0, 1, -1, 2] };
  await assert.rejects(adjustDrawColorDocument(full, settings), error => error.code === 'DRAW_COLOR_PALETTE_FULL');
  const approximated = await adjustDrawColorDocument(full, { ...settings, paletteMode: 'nearest' });
  assert.equal(approximated.palette.length, 128);
  assert.equal(approximated.pixels[2], -1);
});

test('cancelled long preview rejects without mutating its input', async () => {
  const large = { ...document, width: 100, height: 100, pixels: Array(10_000).fill(0) };
  let yields = 0;
  await assert.rejects(adjustDrawColorDocument(large, settings, {
    yieldEvery: 50,
    isCancelled: () => yields > 1,
    onProgress: () => { yields += 1; },
  }), error => error.name === 'AbortError');
  assert.ok(large.pixels.every(index => index === 0));
  assert.deepEqual(large.palette, document.palette);
});

test('invalid selection and invalid indices fail before producing a document', async () => {
  await assert.rejects(adjustDrawColorDocument(document, settings, { selectionMask: new Uint8Array(3) }), /selection mask/i);
  await assert.rejects(adjustDrawColorDocument({ ...document, pixels: [0, 9, -1, 2] }, settings), /palette index/i);
});

test('partial alpha is preserved in exact and nearest modes', async () => {
  const alphaDoc = { ...document, palette: ['#20202040', '#808080c0', '#e0e0e0ff'] };
  const result = await adjustDrawColorDocument(alphaDoc, settings);
  assert.equal(result.palette[result.pixels[0]].slice(7), '40');
  assert.equal(result.palette[result.pixels[1]].slice(7), 'c0');
  const nearest = await adjustDrawColorDocument(alphaDoc, { ...settings, paletteMode: 'nearest' });
  assert.deepEqual(nearest.palette, alphaDoc.palette);
  for (let index = 0; index < alphaDoc.pixels.length; index += 1) {
    if (nearest.pixels[index] >= 0) assert.equal(nearest.palette[nearest.pixels[index]].slice(7), alphaDoc.palette[alphaDoc.pixels[index]].slice(7));
  }
});

test('whole-artwork adjustment changes the shared palette across frames and layers in one immutable result', () => {
  let animation = createAnimation({ width: 2, height: 1, palette: ['#202020', '#e0e0e0'] });
  const frame0 = animation.frames[0].id; const layer0 = animation.layers[0].id;
  animation = writeAnimationCel(animation, frame0, layer0, { width: 2, height: 1, pixels: [1, 2] });
  animation = addAnimationFrame(animation, { copy: false }); const frame1 = animation.frames[1].id;
  animation = addAnimationLayer(animation); const layer1 = animation.layers[1].id;
  animation = writeAnimationCel(animation, frame1, layer1, { width: 2, height: 1, pixels: [2, 1] });
  const result = adjustDrawColorAnimation(animation, settings);
  assert.notEqual(result, animation);
  assert.deepEqual(getAnimationCelDocument(result, frame0, layer0).pixels, [0, 1]);
  assert.deepEqual(getAnimationCelDocument(result, frame1, layer1).pixels, [1, 0]);
  assert.notDeepEqual(result.palette, animation.palette);
  assert.deepEqual(animation.palette, ['#202020', '#e0e0e0']);
  const locked = setLayerProperties(animation, layer1, { locked: true });
  assert.throws(() => adjustDrawColorAnimation(locked, settings), error => error.code === 'DRAW_COLOR_LOCKED_LAYER');
});
