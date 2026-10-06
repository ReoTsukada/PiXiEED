import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { createLocalDraftStore, createMemoryDraftAdapter } from '../../js/creation/local-drafts.mjs';
import {
  createDrawDocument, createDrawHistory, documentRgba, encodePng, finishDrawStroke, floodFill, resizeDrawDocument, strokePixels, validateDrawDocument
} from '../../js/creation/draw-core.mjs';
import { cameraHandoffImage, createImportedDrawDocument, decodeCameraHandoff, readDrawImageDimensions } from '../../js/creation/draw-import.mjs';

function readU32(bytes, offset) { return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0; }
function readPng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8; let width; let height; const idat = [];
  while (offset < bytes.length) {
    const length = readU32(bytes, offset); const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)); const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = readU32(data, 0); height = readU32(data, 4); assert.equal(data[8], 8); assert.equal(data[9], 6); }
    if (type === 'IDAT') idat.push(data);
    offset += length + 12; if (type === 'IEND') break;
  }
  const compressed = Buffer.concat(idat.map((chunk) => Buffer.from(chunk))); const raw = inflateSync(compressed);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) { assert.equal(raw[y * (width * 4 + 1)], 0); rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4); }
  return { width, height, rgba };
}
function decodeRgbPngFixture(bytes) {
  let offset = 8; let width; let height; let channels; const compressed = [];
  while (offset < bytes.length) {
    const length = readU32(bytes, offset); const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)); const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = readU32(data, 0); height = readU32(data, 4); assert.equal(data[8], 8); assert.equal(data[9], 2); channels = 3; }
    if (type === 'IDAT') compressed.push(data);
    offset += length + 12; if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(compressed.map((part) => Buffer.from(part)))); const stride = width * channels; const rgb = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1); const filter = raw[rawOffset]; const row = y * stride; const previous = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rawOffset + 1 + x]; const left = x >= channels ? rgb[row + x - channels] : 0; const up = y > 0 ? rgb[previous + x] : 0; const upperLeft = y > 0 && x >= channels ? rgb[previous + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) { const p = left + up - upperLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upperLeft); predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft; }
      else assert.equal(filter, 0);
      rgb[row + x] = (value + predictor) & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) { data[target] = rgb[source]; data[target + 1] = rgb[source + 1]; data[target + 2] = rgb[source + 2]; data[target + 3] = 255; }
  return { width, height, data };
}

test('new 16x16 document is transparent and line drawing bridges pointer gaps', () => {
  const document = createDrawDocument();
  assert.equal(document.pixels.length, 256); assert.ok(document.pixels.every((pixel) => pixel === -1));
  const changed = strokePixels(document, { x: 1, y: 2 }, { x: 6, y: 2 }, 2);
  assert.deepEqual(changed, [33, 34, 35, 36, 37, 38]);
  assert.deepEqual(document.pixels.slice(32, 40), [-1, 2, 2, 2, 2, 2, 2, -1]);
  strokePixels(document, { x: -1, y: 15 }, { x: 0, y: 15 }, 1); assert.equal(document.pixels[240], 1);
  const before = [...document.pixels]; strokePixels(document, { x: 15, y: 15 }, { x: 1000000, y: 15 }, 3); assert.deepEqual(document.pixels, before);
});

test('size conversion uses nearest-neighbour pixels and keeps transparent cells', () => {
  const source = createDrawDocument(16); source.pixels[0] = 2; source.pixels[255] = 3;
  const doubled = resizeDrawDocument(source, 32);
  assert.equal(doubled.pixels[0], 2); assert.equal(doubled.pixels[1], 2); assert.equal(doubled.pixels[32], 2); assert.equal(doubled.pixels[33], 2);
  assert.equal(doubled.pixels.at(-1), 3); assert.equal(doubled.pixels[15], -1);
  const reduced = resizeDrawDocument(doubled, 16);
  assert.deepEqual(reduced.pixels, source.pixels); assert.equal(source.width, 16);
  assert.throws(() => resizeDrawDocument(source, 24), /16\/32\/64\/128\/256\/512/);
});

test('import copies a transparent image without distortion and preserves exact RGBA palette colors', () => {
  const image = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 12, 34, 56, 0]) };
  const result = createImportedDrawDocument(image, 16); const document = result.document;
  assert.equal(result.copiedWidth, 16); assert.equal(result.copiedHeight, 8); assert.equal(result.colorCount, 1);
  assert.equal(document.pixels[4 * 16], 0); assert.equal(document.pixels[4 * 16 + 7], 0); assert.equal(document.pixels[4 * 16 + 8], -1); assert.equal(document.pixels[0], -1);
  assert.deepEqual([...documentRgba(document).slice((4 * 16) * 4, (4 * 16) * 4 + 4)], [255, 0, 0, 255]);
});

test('an all-transparent PNG becomes a blank transparent copy', () => {
  const image = { width: 2, height: 2, data: new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 1, 2, 3, 0]) };
  const result = createImportedDrawDocument(image, 16);
  assert.equal(result.quantized, false); assert.equal(result.colorCount, 0); assert.ok(result.document.pixels.every((pixel) => pixel === -1));
});

test('high-colour quantization is deterministic, retains broad surfaces, transparency and input bytes', () => {
  const width = 256; const height = 16; const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4; data[offset] = x < 128 ? 80 + x : 24; data[offset + 1] = 32; data[offset + 2] = x < 128 ? 20 : 70 + x - 128; data[offset + 3] = 255;
  }
  for (let y = 0; y < height; y += 1) { const offset = y * width * 4; data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0; }
  const original = new Uint8ClampedArray(data);
  const first = createImportedDrawDocument({ width, height, data }, 256); const second = createImportedDrawDocument({ width, height, data }, 256);
  assert.equal(first.quantized, true); assert.ok(first.colorCount <= 128); assert.deepEqual(first.document, second.document); assert.deepEqual(data, original);
  const row = Math.floor((256 - 16) / 2) + 8; const redCell = first.document.pixels[row * 256 + 64]; const blueCell = first.document.pixels[row * 256 + 192];
  const red = first.document.palette[redCell]; const blue = first.document.palette[blueCell];
  assert.ok(Number.parseInt(red.slice(1, 3), 16) > Number.parseInt(red.slice(5, 7), 16));
  assert.ok(Number.parseInt(blue.slice(5, 7), 16) > Number.parseInt(blue.slice(1, 3), 16));
  for (let y = 0; y < 16; y += 1) assert.equal(first.document.pixels[(row - 8 + y) * 256], -1);
  assert.throws(() => createImportedDrawDocument({ width: 0, height: 1, data }, 16), /画素データ/);
});

test('NASA astronaut PNG imports through a deterministic 128-colour palette', async () => {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(new URL('../../assets/pixel-studio/samples/astronaut.png', import.meta.url));
  const image = decodeRgbPngFixture(bytes); const original = new Uint8ClampedArray(image.data);
  const imported = createImportedDrawDocument(image, 512);
  assert.equal(imported.quantized, true); assert.equal(imported.document.width, 512); assert.ok(imported.colorCount <= 128);
  assert.deepEqual(image.data, original); assert.ok(imported.document.pixels.every((pixel) => pixel >= 0));
  const usedColors = new Set(imported.document.pixels); assert.ok(usedColors.size <= 128);
});

test('images with up to 128 exact colors are preserved byte for byte', () => {
  const data = new Uint8ClampedArray(128 * 4);
  for (let index = 0; index < 128; index += 1) { data[index * 4] = index; data[index * 4 + 1] = 20; data[index * 4 + 2] = 40; data[index * 4 + 3] = 255; }
  const image = { width: 128, height: 1, data }; const imported = createImportedDrawDocument(image, 512);
  assert.equal(imported.quantized, false); assert.equal(imported.colorCount, 128);
  assert.deepEqual([...documentRgba(imported.document).slice((254 * 512 + 4) * 4, (254 * 512 + 4) * 4 + 4)], [1, 20, 40, 255]);
});

test('invalid image dimensions are rejected before import', () => {
  const data = new Uint8ClampedArray(129 * 4);
  assert.throws(() => createImportedDrawDocument({ width: 0, height: 1, data }, 16), /画素データ/);
});

test('flood fill changes only the connected region and respects bounds', () => {
  const document = createDrawDocument(); strokePixels(document, { x: 8, y: 0 }, { x: 8, y: 15 }, 1);
  const filled = floodFill(document, 0, 0, 3);
  assert.equal(filled.length, 128); assert.equal(document.pixels[0], 3); assert.equal(document.pixels[248], 1); assert.equal(document.pixels[15], -1); assert.deepEqual(floodFill(document, -1, 0, 2), []);
});

test('undo and redo apply only changed pixel patches and one stroke is one step', () => {
  const document = createDrawDocument(); const history = createDrawHistory(document);
  const start = [...document.pixels]; strokePixels(document, { x: 1, y: 1 }, { x: 4, y: 1 }, 2); strokePixels(document, { x: 4, y: 1 }, { x: 4, y: 4 }, 2);
  assert.equal(finishDrawStroke(document, history, start), true); assert.equal(document.pixels.filter((pixel) => pixel === 2).length, 7);
  assert.equal(history.undo(), true); assert.ok(document.pixels.every((pixel) => pixel === -1)); assert.equal(history.canUndo, false);
  assert.equal(history.redo(), true); assert.equal(document.pixels.filter((pixel) => pixel === 2).length, 7);
});

test('512px undo retains a bounded typed patch rather than a document snapshot', () => {
  const document = createDrawDocument(512); const history = createDrawHistory(document);
  const changed = { ...document, pixels: [...document.pixels] }; strokePixels(changed, { x: 511, y: 511 }, { x: 511, y: 511 }, 2);
  history.commit(changed);
  assert.equal(history.retainedBytes, 8); assert.equal(history.undo(), true); assert.equal(document.pixels.at(-1), -1);
  const fill = { ...document, pixels: [...document.pixels] }; fill.pixels.fill(0); history.commit(fill);
  assert.ok(history.retainedBytes <= 4 * 1024 * 1024); assert.equal(history.undo(), true); assert.ok(document.pixels.every((pixel) => pixel === -1));
});

test('PNG encoding preserves exact imported RGBA pixels at 16 and 512px', () => {
  const document = createDrawDocument(); document.palette = ['#ff000080', '#abcdef']; document.pixels[0] = 0; document.pixels[255] = 1;
  const decoded = readPng(encodePng(document));
  assert.equal(decoded.width, 16); assert.equal(decoded.height, 16);
  assert.deepEqual([...decoded.rgba.slice(0, 4)], [255, 0, 0, 128]); assert.deepEqual([...decoded.rgba.slice(4, 8)], [0, 0, 0, 0]); assert.deepEqual([...decoded.rgba.slice(-4)], [171, 205, 239, 255]);
  const large = createDrawDocument(512); large.pixels[0] = 2; large.pixels[large.pixels.length - 1] = 5;
  const largePng = readPng(encodePng(large)); assert.equal(largePng.width, 512); assert.equal(largePng.height, 512);
  assert.deepEqual([...largePng.rgba.slice(0, 4)], [231, 84, 69, 255]); assert.deepEqual([...largePng.rgba.slice(-4)], [109, 155, 104, 255]);
});

test('save, resume and camera-derived copy retain provenance without changing the source revision', async () => {
  let nextId = 0; const store = createLocalDraftStore(createMemoryDraftAdapter(), { idFactory: () => `revision-${++nextId}` });
  const original = createDrawDocument(16); original.pixels[0] = 2;
  const sourceRevision = await store.save({ draftId: 'source-draft', kind: 'pixel_art', document: original, source: { type: 'hand_drawn', assetId: null, revisionId: null } });
  const image = { width: 1, height: 1, data: new Uint8ClampedArray([20, 40, 60, 255]) };
  const cameraPixels = createImportedDrawDocument(image, 512).document;
  await store.save({ draftId: 'camera-copy-draft', kind: 'pixel_art', document: cameraPixels, source: { type: 'pixel_camera', assetId: null, revisionId: null, capturedAt: 123 } });
  const resumed = await store.load('camera-copy-draft'); const untouched = await store.load('source-draft');
  assert.equal(resumed.document.width, 512); assert.equal(resumed.asset.source.type, 'pixel_camera'); assert.deepEqual(resumed.document, cameraPixels);
  assert.equal(untouched.revisionId, sourceRevision.revisionId); assert.equal(untouched.document.width, 16); assert.equal(untouched.document.pixels[0], 2);
});

test('camera handoff requires a recent valid image and is read without consuming the source', () => {
  const now = 1_000_000_000_000; let readCount = 0;
  const storage = { getItem(key) { readCount += 1; assert.equal(key, 'PiXiEED:camera-handoff:v1'); return JSON.stringify({ dataUrl: 'data:image/png;base64,aGVsbG8=', createdAt: now }); } };
  const handoff = cameraHandoffImage(storage, now);
  assert.equal(handoff.file.type, 'image/png'); assert.equal(handoff.createdAt, now); assert.equal(readCount, 1);
  assert.equal(decodeCameraHandoff(JSON.stringify({ dataUrl: 'data:image/webp;base64,aGVsbG8=', createdAt: now }), now).file.type, 'image/webp');
  const stale = { getItem: () => JSON.stringify({ dataUrl: 'data:image/png;base64,aGVsbG8=', createdAt: 1 }) };
  assert.equal(cameraHandoffImage(stale, now), null);
  assert.equal(cameraHandoffImage({ getItem: () => '{bad json' }, now), null);
});

test('image import dimension preflight rejects malformed headers and detects PNG/WebP before decoding', () => {
  const png = new Uint8Array(24); png.set([137, 80, 78, 71, 13, 10, 26, 10]); png.set([73, 72, 68, 82], 12); new DataView(png.buffer).setUint32(16, 512); new DataView(png.buffer).setUint32(20, 512);
  assert.deepEqual(readDrawImageDimensions(png, 'image/png'), { width: 512, height: 512 });
  const webp = new Uint8Array(30); webp.set([82, 73, 70, 70], 0); webp.set([87, 69, 66, 80], 8); webp.set([86, 80, 56, 88], 12); webp[24] = 255; webp[25] = 1; webp[27] = 127; webp[28] = 1;
  assert.deepEqual(readDrawImageDimensions(webp, 'image/webp'), { width: 512, height: 384 });
  assert.equal(readDrawImageDimensions(new Uint8Array(32), 'image/png'), null);
  assert.equal(readDrawImageDimensions(new Uint8Array(32), 'image/jpeg'), null);
});

test('draw page exposes local copies (no camera copy: camera shots are not edited here) and no publish call', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../draw/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="draw-size"/); assert.match(html, /id="draw-import-local"/); assert.doesNotMatch(html, /id="draw-import-camera"/); assert.match(html, /id="draw-copy-last"/);
  const page = await readFile(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');
  assert.match(page, /drawAdapter = createIndexedDbDraftAdapter\(\); store = createLocalDraftStore\(drawAdapter\)/); assert.match(page, /store\.save\(/); assert.match(page, /store\.load\(/);
  assert.match(page, /resizeAnimation/); assert.doesNotMatch(page, /cameraHandoffImage/); assert.doesNotMatch(page, /fetch\(|supabase|create-post/i);
  assert.throws(() => validateDrawDocument({ schemaVersion: 2 }), /1〜512/);
});

test('draw workspace prioritizes the canvas and supports touch zoom gestures accessibly', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../draw/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../css/creation-draw.css', import.meta.url), 'utf8');
  const page = await readFile(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');
  assert.match(html, /class="draw-board\b[^"]*" aria-label="描画エリア。2本指で拡大・移動できます。"/);
  assert.match(html, /id="draw-zoom-label"/);
  assert.match(css, /grid-template-rows:auto auto minmax\(0,1fr\) auto/);
  assert.match(css, /height:100dvh/);
  assert.match(page, /activePointers\.size >= 2/);
  assert.match(page, /Math\.min\(ZOOM_MAX, pinchStart\.zoom \* distance/); assert.match(page, /const ZOOM_MAX = 8;/);
  assert.match(page, /translate\(\$\{panX\}px, \$\{panY\}px\) scale\(\$\{zoom\}\)/);
});

test('かんたんドット: 16 fixed colours, up to 64px, and anything larger or more colourful is fitted without touching the original', async () => {
  const core = await import('../../js/creation/draw-core.mjs');
  assert.equal(core.DRAW_PALETTE.length, 16); assert.deepEqual([...core.DRAW_PALETTE_ORDER].sort((a, b) => a - b), [...Array(16).keys()]);
  assert.deepEqual([...core.SIMPLE_DRAW_SIZES], [16, 32, 64]);
  assert.equal(core.createDrawDocument(16).palette.length, 16);
  // an older 7-colour save keeps the same colours in the same slots
  const old = core.createDrawDocument(16); old.palette = old.palette.slice(0, 7); old.pixels[3] = 6;
  const fittedOld = core.toSimpleDrawDocument(old); assert.equal(fittedOld.document.pixels[3], 6); assert.equal(fittedOld.recolored, false); assert.equal(old.palette.length, 7, 'the original is untouched');
  // a 128px drawing with more than 16 colours becomes 64px in the 16 colours; translucent colours become transparent
  const many = ['#ff0000', '#00ff0040', ...Array.from({ length: 18 }, (_, i) => `#${(i * 13).toString(16).padStart(2, '0')}8844`)];
  const big = core.createDrawDocument(128); big.palette = many; big.pixels.fill(0); for (const i of [0, 1, 128, 129]) big.pixels[i] = 1;
  const fitted = core.toSimpleDrawDocument(big);
  assert.deepEqual([fitted.document.width, fitted.document.height, fitted.resized, fitted.recolored], [64, 64, true, true]);
  assert.equal(fitted.document.palette.length, 16); assert.equal(fitted.document.pixels[0], -1); assert.equal(fitted.document.pixels[1], 2, 'pure red maps to the palette red');
  assert.equal(big.width, 128, 'the original is untouched');
  // a picture with its own few colours (e.g. linked to a song) keeps them exactly
  const song = core.createDrawDocument(32); song.palette = ['#14283c', '#506478', '#8ca0b4']; song.pixels[5] = 2;
  const kept = core.toSimpleDrawDocument(song); assert.deepEqual(kept.document.palette, song.palette); assert.equal(kept.recolored, false); assert.equal(kept.changed, false); assert.equal(kept.document.pixels[5], 2);
  const page = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8'));
  assert.match(page, /\[16, 32, 64, 128, 256\]\.forEach/); assert.doesNotMatch(page, /fitToSimple\(/);
});

test('かんたんドット: a colour change is one undo step and undo reports only what changed', async () => {
  const { readFile } = await import('node:fs/promises');
  const document = createDrawDocument(); const history = createDrawHistory(document);
  const drawn = [...document.pixels]; drawn[0] = 2; assert.equal(history.commit({ ...document, pixels: drawn }), true);
  const before = [...document.palette];
  const palette = [...document.palette]; palette[2] = '#46b1e7';
  assert.equal(history.commit({ ...document, pixels: [...document.pixels], palette }), true);
  assert.equal(document.palette[2], '#46b1e7');
  assert.equal(history.undo(), true); assert.deepEqual(document.palette, before); assert.equal(history.lastStep.paletteChanged, true);
  assert.equal(history.redo(), true); assert.equal(document.palette[2], '#46b1e7');
  assert.equal(history.undo(), true); assert.equal(history.undo(), true);
  assert.equal(history.lastStep.paletteChanged, false); assert.deepEqual([...history.lastStep.indices], [0]); assert.equal(document.pixels[0], -1);
  const page = await readFile(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');
  const html = await readFile(new URL('../../draw/index.html', import.meta.url), 'utf8');
  assert.match(page, /mountColorPanel/); assert.match(html, /color-panel\.css/);
  assert.doesNotMatch(html, /id="draw-color-editor"/);
  assert.match(page, /function zoomAt\(/); assert.match(page, /fingers >= 3\) redo\(\); else undo\(\)/);
});
