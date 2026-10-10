import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawDocument } from '../js/creation/draw-core.mjs';
import { applyTextMaskToDocument, createDrawTextFontLoader, rasterizeTextMask } from '../js/creation/draw-text.mjs';

function documentOf(size) { const doc = createDrawDocument(); return { ...doc, width: size, height: size, pixels: Array(size * size).fill(-1) }; }

test('applies hard-edged text in one existing palette color without mutating its source', () => {
  const source = documentOf(4); const before = [...source.pixels]; const mask = new Uint8Array(16); mask[5] = 255; mask[6] = 127;
  const next = applyTextMaskToDocument(source, mask, { colorIndex: 3 });
  assert.notEqual(next, source); assert.equal(next.pixels[5], 3); assert.equal(next.pixels[6], -1);
  assert.deepEqual(source.pixels, before); assert.deepEqual(next.palette, source.palette);
});

test('preserves cells outside a selection mask and existing pixels outside the text mask', () => {
  const source = documentOf(3); source.pixels[0] = 2;
  const mask = new Uint8Array(9); mask.fill(255); const selection = new Uint8Array(9); selection[4] = 1;
  const next = applyTextMaskToDocument(source, mask, { colorIndex: 1, selectionMask: selection });
  assert.equal(next.pixels[0], 2); assert.equal(next.pixels[4], 1); assert.equal(next.pixels[8], -1);
  assert.equal(source.pixels[0], 2); assert.equal(source.pixels[4], -1);
});

test('does not create an undo-worthy document for a no-op mask', () => {
  const source = documentOf(2); const next = applyTextMaskToDocument(source, new Uint8Array(4), { colorIndex: 0 });
  assert.equal(next, source);
});

test('keeps the original alpha of the chosen palette entry', () => {
  const source = documentOf(2); source.palette[1] = '#33669980'; const mask = new Uint8Array(4); mask[2] = 255;
  const next = applyTextMaskToDocument(source, mask, { colorIndex: 1 });
  assert.equal(next.pixels[2], 1); assert.equal(next.palette[1], '#33669980'); assert.equal(source.pixels[2], -1);
});

test('rejects malformed masks and palette colors before creating a result', () => {
  const source = documentOf(2);
  assert.throws(() => applyTextMaskToDocument(source, new Uint8Array(3), { colorIndex: 0 }), /寸法/);
  assert.throws(() => applyTextMaskToDocument(source, new Uint8Array(4), { colorIndex: 16 }), /パレット/);
  assert.throws(() => applyTextMaskToDocument(source, new Uint8Array(4), { colorIndex: 0, selectionMask: new Uint8Array([1, 0, 2, 0]) }), /選択マスク/);
});

test('rasterizes Japanese through Canvas and returns cell alpha coverage', () => {
  const calls = []; const fakeDocument = { createElement: () => ({
    width: 0, height: 0, getContext: () => ({ clearRect() {}, set font(value) { calls.push(value); }, set textBaseline(value) { calls.push(value); }, set textAlign(value) { calls.push(value); }, set fillStyle(value) { calls.push(value); }, fillText(text, x, y) { calls.push([text, x, y]); }, getImageData() { return { data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 128]) }; } })
  }) };
  const mask = rasterizeTextMask({ text: '日本\n語', font: 'sans-serif', fontSize: 8, x: 1, y: 2, align: 'center', width: 2, height: 1, documentRef: fakeDocument });
  assert.deepEqual([...mask], [255, 128]); assert.ok(calls.includes('center'));
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === '日本' && call[1] === 1 && call[2] === 2));
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === '語' && call[1] === 1 && call[2] === 10));
});

test('quotes bundled multiword font families and keeps a Japanese generic fallback', () => {
  let assignedFont = '';
  const fakeDocument = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, set font(value) { assignedFont = value; }, set textBaseline(_) {}, set textAlign(_) {}, set fillStyle(_) {}, fillText() {}, getImageData() { return { data: new Uint8ClampedArray(4) }; } }) }) };
  rasterizeTextMask({ text: '日', font: 'PiXiEED DotGothic16', width: 1, height: 1, documentRef: fakeDocument });
  assert.equal(assignedFont, '8px "PiXiEED DotGothic16", sans-serif');
});

test('keeps bundled font requests lazy and uses system families without network loading', async () => {
  let constructions = 0;
  class FakeFace { constructor() { constructions += 1; } load() { throw new Error('must not load yet'); } }
  const loader = createDrawTextFontLoader({ FontFaceCtor: FakeFace, fontSet: { add() {} } });
  assert.equal(constructions, 0);
  assert.equal(await loader('sans'), 'sans-serif');
  assert.equal(constructions, 0);
});

test('falls back when the browser rejects a bundled font', async () => {
  let added = 0;
  class FakeFace { async load() { throw new Error('bad font'); } }
  const loader = createDrawTextFontLoader({ FontFaceCtor: FakeFace, fontSet: { add() { added += 1; } } });
  assert.equal(await loader('dotgothic'), 'sans-serif');
  assert.equal(added, 0);
});

test('falls back when FontFace or the document font set is unavailable', async () => {
  assert.equal(await createDrawTextFontLoader({ FontFaceCtor: null, fontSet: { add() {} } })('pressstart'), 'sans-serif');
  assert.equal(await createDrawTextFontLoader({ FontFaceCtor: class {}, fontSet: null })('pressstart'), 'sans-serif');
});

test('times out a stalled load and never adds the face if that request succeeds later', async () => {
  let finishLoad, started = false, added = 0;
  class FakeFace { load() { started = true; return new Promise((resolve) => { finishLoad = resolve; }); } }
  const loader = createDrawTextFontLoader({ FontFaceCtor: FakeFace, fontSet: { add() { added += 1; } }, timeoutMs: 5 });
  const loading = loader('pressstart');
  while (!started) await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  assert.equal(await loading, 'sans-serif');
  finishLoad(); await Promise.resolve(); await Promise.resolve();
  assert.equal(added, 0);
});
