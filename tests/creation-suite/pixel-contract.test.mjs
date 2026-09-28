import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSPARENT, PixelContractError, toBytes, canvasRgba, toPaletteIndices, paletteIndicesToJson, toMask, toPixelIndices, toSamples,
  toEditingDocument, toSavedDocument, createPixelFrame, dotAtPoint, describeWorkingCopy, toSourceDot,
  colorIdOf, colorIdOfHex, instrumentForColor, checkReadLimits, createLatestGate, createResourceBag
} from '../../js/creation/pixel-contract.mjs';
import { createDrawDocument, validateDrawDocument, documentRgba } from '../../js/creation/draw-core.mjs';
import { hashCanonical } from '../../js/creation/asset-contract.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { putPxdImage, readPxdImage } from '../../js/creation/pxd-project.mjs';

/** A saved drawing as older versions wrote it: transparent -1, a few colours, plain arrays. */
function legacyDrawing() {
  const document = createDrawDocument(16);
  document.pixels[0] = 2; document.pixels[17] = 15; document.pixels[255] = 0;
  return document;
}

test('a plain Uint8Array turns transparent -1 into 255; the contract refuses instead', () => {
  assert.equal(Uint8Array.from([-1])[0], 255, 'the failure mode this guards against');
  assert.equal(Uint8Array.from([300])[0], 44);
  assert.throws(() => toBytes([-1]), PixelContractError);
  assert.throws(() => toBytes([256]), PixelContractError);
  assert.throws(() => toBytes([1.5]), PixelContractError);
  assert.deepEqual([...toBytes([0, 128, 255])], [0, 128, 255]);
});

test('palette indices keep transparent as -1 in an Int16Array and reject out-of-range values', () => {
  const indices = toPaletteIndices([TRANSPARENT, 0, 15], 16);
  assert.ok(indices instanceof Int16Array);
  assert.deepEqual([...indices], [-1, 0, 15]);
  assert.throws(() => toPaletteIndices([16], 16), /範囲外/);
  assert.throws(() => toPaletteIndices([-2], 16), /範囲外/);
  assert.throws(() => toPaletteIndices([0.5], 16), /範囲外/);
  assert.deepEqual(paletteIndicesToJson(indices), [-1, 0, 15]);
});

test('an older drawing survives editing form and back: same validation, same content hash', async () => {
  const saved = legacyDrawing();
  const editing = toEditingDocument(saved);
  assert.ok(editing.pixels instanceof Int16Array);
  assert.throws(() => validateDrawDocument(editing), 'validation expects the saved form, so typed arrays must not reach it');
  const back = toSavedDocument(editing);
  validateDrawDocument(back);
  assert.deepEqual(back, saved);
  assert.equal(await hashCanonical(back), await hashCanonical(saved));
  assert.deepEqual(documentRgba(back), documentRgba(saved));
});

test('masks, pixel positions and samples are checked before becoming typed arrays', () => {
  assert.deepEqual([...toMask([0, 1, true, false], 4)], [0, 1, 1, 0]);
  assert.throws(() => toMask([0, 2, 0, 0], 4), PixelContractError);
  assert.throws(() => toMask([0, 1], 4), PixelContractError);
  const positions = toPixelIndices([0, 17, 255], 256);
  assert.ok(positions instanceof Uint32Array);
  assert.throws(() => toPixelIndices([256], 256), /画像の外/);
  assert.throws(() => toPixelIndices([-1], 256), /画像の外/);
  assert.throws(() => toPixelIndices([3, 3], 256), /重複/);
  assert.ok(toSamples([0, 0.5, -1]) instanceof Float32Array);
  assert.throws(() => toSamples([2]), PixelContractError);
});

test('RGBA reaches a canvas as a clamped view over the same bytes', () => {
  const rgba = new Uint8Array(2 * 1 * 4).fill(7);
  const view = canvasRgba(rgba, 2, 1);
  assert.ok(view instanceof Uint8ClampedArray);
  assert.equal(view.buffer, rgba.buffer);
  assert.throws(() => canvasRgba(rgba, 3, 1), PixelContractError);
});

test('dots, display scale and output size stay separate; taps map to dots', () => {
  const frame = createPixelFrame({ width: 64, height: 64, displayScale: 5.25, outputScale: 32 });
  assert.deepEqual(frame.dots, { width: 64, height: 64 });
  assert.deepEqual(frame.output, { width: 2048, height: 2048 });
  const rect = { left: 10, top: 20, width: 336, height: 336 };
  assert.deepEqual(dotAtPoint(frame.dots, rect, 10, 20), { x: 0, y: 0, index: 0 });
  assert.deepEqual(dotAtPoint(frame.dots, rect, 10 + 335.9, 20 + 335.9), { x: 63, y: 63, index: 4095 });
  assert.equal(dotAtPoint(frame.dots, rect, 9, 20), null);
  const wide = dotAtPoint({ width: 32, height: 16 }, { left: 0, top: 0, width: 320, height: 160 }, 319, 159);
  assert.deepEqual(wide, { x: 31, y: 15, index: 15 * 32 + 31 });
  assert.throws(() => createPixelFrame({ width: 64, height: 64, outputScale: 1.5 }), PixelContractError);
});

test('a working copy records how it was made and maps back to the original', () => {
  const copy = describeWorkingCopy({ source: { width: 128, height: 64 }, copy: { width: 32, height: 16 }, purpose: 'audio-reduce', transform: { kind: 'nearest' } });
  assert.equal(copy.purpose, 'audio-reduce');
  assert.deepEqual(toSourceDot(copy, 0, 0), { x: 2, y: 2, index: 2 * 128 + 2 });
  assert.deepEqual(toSourceDot(copy, 31, 15), { x: 126, y: 62, index: 62 * 128 + 126 });
});

test('colour IDs match PXD image metadata, and sounds follow colours not palette order', async () => {
  const image = { width: 2, height: 1, rgba: new Uint8Array([231, 84, 69, 255, 0, 0, 0, 0]) };
  const project = await putPxdImage(createPxdProject(), image);
  const read = await readPxdImage(project, 'main');
  assert.deepEqual(read.colorIds, [colorIdOf(231, 84, 69, 255), colorIdOf(0, 0, 0, 0)]);
  assert.equal(colorIdOfHex('#E75445'), 'rgba-e75445ff');
  const assignments = { [colorIdOfHex('#e75445')]: 'square', [colorIdOfHex('#4c82c3')]: 'triangle' };
  const palette = ['#e75445', '#4c82c3', '#6d9b68'];
  const before = palette.map((colour) => instrumentForColor(assignments, colour));
  const reordered = [palette[2], palette[0], palette[1]].map((colour) => instrumentForColor(assignments, colour));
  assert.deepEqual(before, ['square', 'triangle', null]);
  assert.deepEqual(reordered, [null, 'square', 'triangle'], 'reordering the palette keeps each colour\'s sound; the unassigned colour is silent');
});

test('read limits are shared checks with numbers per use', () => {
  assert.deepEqual(checkReadLimits('post', { bytes: 100, width: 64, height: 64, colors: 16 }), []);
  assert.deepEqual(checkReadLimits('post', { width: 4, height: 64 }).map((p) => p.code), ['min-size']);
  assert.deepEqual(checkReadLimits('edit', { width: 2048, height: 2048 }).map((p) => p.code), ['pixels']);
  assert.deepEqual(checkReadLimits('jigsaw', { width: 2048, height: 2048 }), [], 'jigsaw allows bigger images than editing');
  assert.throws(() => checkReadLimits('unknown', {}), PixelContractError);
});

test('an older async result cannot overwrite a newer one', async () => {
  const gate = createLatestGate(); const applied = [];
  const load = async (value, delay) => { const ticket = gate.begin(); await new Promise((r) => setTimeout(r, delay)); if (gate.isCurrent(ticket)) applied.push(value); };
  await Promise.all([load('old', 20), load('new', 1)]);
  assert.deepEqual(applied, ['new']);
});

test('resources are released once, all together', () => {
  const bag = createResourceBag(); const log = [];
  bag.add(() => log.push('callback'));
  bag.add({ terminate: () => log.push('worker') });
  bag.add({ close: () => log.push('bitmap') });
  bag.add({ close: () => { throw new Error('already closed'); } });
  bag.releaseAll(); bag.releaseAll();
  assert.deepEqual(log.sort(), ['bitmap', 'callback', 'worker']);
  assert.equal(bag.size, 0);
});
