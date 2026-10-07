import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCameraPalette, cameraPixels, prepareCameraTarget, replaceCameraPixels } from '../../js/creation/draw-camera-core.mjs';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { addAnimationFrame, addAnimationLayer, getAnimationCelDocument } from '../../js/creation/animation-core.mjs';

const doc = { schemaVersion: 1, width: 4, height: 3, palette: ['#000000', '#ffffff', '#ff0000'], pixels: [0, 0, 0, 0, 0, -1, 2, 0, 0, 0, 0, 0] };

test('32-colour palette reserves remaining transparency and prioritizes colours in other cels', () => {
  const large = { ...doc, palette: Array.from({ length: 32 }, (_, i) => '#' + (i * 500003).toString(16).padStart(6, '0')) };
  const mask = new Uint8Array(12); mask[0] = 1;
  const limited = chooseCameraPalette(large, mask, [-1, 31, 30]);
  assert.equal(limited.length, 31); assert.deepEqual(limited.slice(0, 2), [31, 30]);
  assert.equal(chooseCameraPalette(large, null, []).length, 32);
  assert.equal(chooseCameraPalette(large, null, [-1]).length, 31);
});

test('camera target snapshots only selected cells and tight bounds without retaining the mask', () => {
  const mask = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  const target = prepareCameraTarget(doc, mask, [0, 2]);
  mask.fill(1);
  assert.deepEqual(target.bounds, { x: 1, y: 1, width: 2, height: 2 });
  assert.deepEqual([...target.cells], [5, 10]);
  assert.deepEqual(target.allowedIndices, [0, 2]);
  assert.notEqual(target.document, doc);
  assert.notEqual(target.document.pixels, doc.pixels);
});

test('camera quantization stays in allowed existing opaque slots, including for transparent source input', () => {
  const result = cameraPixels(Uint8Array.from([255, 0, 0, 255, 240, 240, 240, 255, 10, 10, 10, 0]), doc.palette, [0, 2]);
  assert.deepEqual([...result], [2, 2, 0]);
  assert.throws(() => cameraPixels(new Uint8Array(4), ['#00000000'], [0]));
});

test('replacement clones document and changes selected transparent cells while preserving mask holes', () => {
  const mask = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  const target = prepareCameraTarget(doc, mask, [0, 2]);
  const result = replaceCameraPixels(doc, target, Int16Array.from([2, 0]));
  assert.notEqual(result, doc);
  assert.notEqual(result.pixels, doc.pixels);
  assert.equal(result.pixels[5], 2); // selected transparent cell becomes opaque
  assert.equal(result.pixels[10], 0);
  assert.equal(result.pixels[6], 2); // selection hole inside bounds stays unchanged
  assert.deepEqual(doc.pixels, [0, 0, 0, 0, 0, -1, 2, 0, 0, 0, 0, 0]);
});

test('empty selection and invalid replacement cannot be applied', () => {
  assert.throws(() => prepareCameraTarget(doc, new Uint8Array(doc.pixels.length), [0]));
  const target = prepareCameraTarget(doc, null, [0]);
  assert.throws(() => replaceCameraPixels(doc, target, new Int16Array(target.cells.length - 1)));
  assert.throws(() => replaceCameraPixels(doc, target, new Int16Array(target.cells.length).fill(2)));
});

test('rotated mask cells use tight pixel bounds and retain every outside pixel and hole', () => {
  const source = { schemaVersion: 1, width: 16, height: 16, palette: [...doc.palette], pixels: Array(256).fill(0) };
  const transform = createDrawSelectionTransform(source, { x: 4, y: 4, width: 6, height: 3 });
  transform.setAngle(30);
  const mask = transform.mask(16, 16), target = prepareCameraTarget(source, mask, [1]);
  const result = replaceCameraPixels(source, target, new Int16Array(target.cells.length).fill(1));
  assert.ok(target.cells.length < target.bounds.width * target.bounds.height);
  for (let i = 0; i < 256; i++) assert.equal(result.pixels[i], mask[i] ? 1 : source.pixels[i]);
  assert.deepEqual(source.pixels, Array(256).fill(0));
});

test('capture is one animation history step and preserves palette and every other frame/layer', () => {
  const session = createDrawAnimationSession(doc);
  session.apply(addAnimationFrame(session.animation));
  session.apply(addAnimationLayer(session.animation));
  const before = session.animation, active = session.document();
  const target = prepareCameraTarget(active, null, [2]);
  session.prepareDocument(replaceCameraPixels(active, target, new Int16Array(target.cells.length).fill(2)))();
  assert.deepEqual(session.animation.palette, before.palette);
  for (const frame of before.frames) for (const layer of before.layers) {
    if (frame.id === session.frameId && layer.id === session.layerId) continue;
    assert.deepEqual(getAnimationCelDocument(session.animation, frame.id, layer.id), getAnimationCelDocument(before, frame.id, layer.id));
  }
  const captured = session.document();
  assert.deepEqual(session.undo(), active);
  assert.deepEqual(session.redo(), captured);
});
