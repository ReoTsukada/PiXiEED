import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { DRAW_HANDOFF_KEY, decodePngHandoff, encodeDrawPng, serializeDrawHandoff, validateDrawPixels } from '../../js/creation/draw-handoff.mjs';
import { openHandoffComposer, pendingHandoff } from '../../js/globe/post-handoff.mjs';

const now = Date.now();
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const base64 = Buffer.from(png).toString('base64');
const handoffJson = (source = 'draw', createdAt = now, data = base64) => JSON.stringify({ source, revisionId: 'revision-1', createdAt, dataUrl: `data:image/png;base64,${data}` });

test('Draw handoff rejects blank art and counts transparent as a real RGBA color', () => {
  const doc = createDrawDocument(16);
  assert.throws(() => validateDrawPixels(doc), /何か描いて/);
  doc.pixels[0] = 0;
  assert.equal(validateDrawPixels(doc), 2);
  doc.palette = Array.from({ length: 128 }, (_, index) => `#${index.toString(16).padStart(2, '0')}0000`);
  doc.pixels.fill(-1); doc.pixels.splice(0, 128, ...Array.from({ length: 128 }, (_, index) => index));
  assert.throws(() => validateDrawPixels(doc), /128色/);
  doc.palette[0] = '#ff000000';
  doc.pixels.fill(-1); doc.pixels[0] = 0;
  assert.throws(() => validateDrawPixels(doc), /何か描いて/);
});

test('browser PNG encoder uses compressed canvas output and enforces the byte limit', async () => {
  const doc = createDrawDocument(16); doc.pixels[0] = 2;
  const canvasFactory = (blob) => ({ width: 0, height: 0, getContext: () => ({ createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData() {} }), toBlob: (callback) => callback(blob) });
  const valid = new Blob([png], { type: 'image/png' });
  assert.equal(await encodeDrawPng(doc, () => canvasFactory(valid)), valid);
  await assert.rejects(encodeDrawPng(doc, () => canvasFactory(new Blob([new Uint8Array(512 * 1024 + 1)], { type: 'image/png' }))), /512KB/);
  await assert.rejects(encodeDrawPng(doc, () => canvasFactory(new Blob(['not png'], { type: 'image/png' }))), /PNGの形式/);
});

test('PNG handoff validates source, age, size and signature before creating an image File', () => {
  assert.equal(decodePngHandoff(handoffJson('draw', now - 600_001), 'draw', now), null);
  assert.equal(decodePngHandoff(handoffJson('draw', now + 1), 'draw', now), null);
  assert.equal(decodePngHandoff(handoffJson('pixel-camera'), 'draw', now), null);
  assert.equal(decodePngHandoff(handoffJson('draw', now, Buffer.from('not png').toString('base64')), 'draw', now), null);
  assert.equal(decodePngHandoff(handoffJson('draw', now, 'A'.repeat(700_000)), 'draw', now), null);
  const decoded = decodePngHandoff(handoffJson(), 'draw', now);
  assert.equal(decoded.file.type, 'image/png'); assert.equal(decoded.revisionId, 'revision-1');
});

function makeStorage(entries) {
  return { entries: new Map(Object.entries(entries)), getItem(key) { return this.entries.get(key) ?? null; }, setItem(key, value) { this.entries.set(key, value); }, removeItem(key) { this.entries.delete(key); } };
}

test('embedded globe consumes only its matching Draw handoff and preserves embed query', async () => {
  const sessionStorage = makeStorage({ [DRAW_HANDOFF_KEY]: handoffJson() });
  const localStorage = makeStorage({ 'PiXiEED:camera-handoff:v1': handoffJson('pixel-camera') });
  const url = new URL('https://pixieed.jp/?embed=1&from=draw&other=keep');
  const history = { replaceState(_state, _title, next) { this.next = next; } };
  const parent = { location: { href: url.href, origin: url.origin }, history, sessionStorage, localStorage };
  const frame = { location: parent.location, parent };
  const handoff = pendingHandoff(frame);
  assert.equal(handoff.source, 'draw');
  let opened;
  assert.equal(openHandoffComposer(handoff, { openComposer(options) { opened = options; } }), true);
  assert.equal(opened.file.name, 'drawing.png'); assert.equal(opened.file.type, 'image/png'); assert.equal(opened.postKind, 'pixel_art'); assert.equal(opened.keepScale, true); assert.equal(opened.useCurrentLocation, false);
  assert.equal(sessionStorage.entries.has(DRAW_HANDOFF_KEY), false);
  assert.equal(localStorage.entries.has('PiXiEED:camera-handoff:v1'), true);
  assert.equal(history.next, '/?embed=1&other=keep');
  assert.equal(pendingHandoff(frame), null);
});

test('unrelated visits do not open or consume stale camera or Draw handoffs', () => {
  const sessionStorage = makeStorage({ [DRAW_HANDOFF_KEY]: handoffJson() });
  const localStorage = makeStorage({ 'PiXiEED:camera-handoff:v1': handoffJson('pixel-camera') });
  const url = new URL('https://pixieed.jp/?embed=1'); const parent = { location: { href: url.href, origin: url.origin }, sessionStorage, localStorage };
  assert.equal(pendingHandoff({ location: parent.location, parent }), null);
  assert.equal(sessionStorage.entries.has(DRAW_HANDOFF_KEY), true);
  assert.equal(localStorage.entries.has('PiXiEED:camera-handoff:v1'), true);
});

test('camera handoff opens as pixel_camera only on its matching URL and leaves Draw data intact', () => {
  const sessionStorage = makeStorage({ [DRAW_HANDOFF_KEY]: handoffJson() });
  const localStorage = makeStorage({ 'PiXiEED:camera-handoff:v1': JSON.stringify({ createdAt: now, dataUrl: `data:image/png;base64,${base64}` }) });
  const url = new URL('https://pixieed.jp/?embed=1&from=pixel-camera');
  const parent = { location: { href: url.href, origin: url.origin }, history: { replaceState(_s, _t, value) { this.next = value; } }, sessionStorage, localStorage };
  const handoff = pendingHandoff({ location: parent.location, parent }); let opened;
  assert.equal(handoff.source, 'pixel-camera');
  assert.equal(openHandoffComposer(handoff, { openComposer(options) { opened = options; } }), true);
  assert.equal(opened.postKind, 'pixel_camera'); assert.equal(opened.file.name, 'pixel-camera.png'); assert.equal(opened.useCurrentLocation, true);
  assert.equal(sessionStorage.entries.has(DRAW_HANDOFF_KEY), true);
  assert.equal(localStorage.entries.has('PiXiEED:camera-handoff:v1'), false);
  assert.equal(parent.history.next, '/?embed=1');
});

test('Draw handoff serialization carries the exact saved revision identity', async () => {
  const serialized = await serializeDrawHandoff(new Blob([png], { type: 'image/png' }), 'saved-revision', now);
  const decoded = decodePngHandoff(serialized, 'draw', now);
  assert.equal(decoded.revisionId, 'saved-revision');
});
