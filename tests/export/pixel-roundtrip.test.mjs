import test from 'node:test';
import assert from 'node:assert/strict';
import { readPixelPngMetadata, withPixelPngMetadata } from '../../js/pixel-png-metadata.mjs';
import { normalizePixelFile, normalizePixels, readPixelImageDimensions } from '../../js/pixel-scale.mjs';

const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function crc32(bytes) { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function u32(value) { return Uint8Array.from([value >>> 24, value >>> 16, value >>> 8, value]); }
function chunk(type, data = new Uint8Array()) {
  const typeBytes = Uint8Array.from([...type].map((character) => character.charCodeAt(0)));
  const body = new Uint8Array(typeBytes.length + data.length); body.set(typeBytes); body.set(data, 4);
  return concat(u32(data.length), body, u32(crc32(body)));
}
function concat(...parts) { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; }
function png(width, height, extras = []) {
  const ihdr = new Uint8Array(13); ihdr.set(u32(width), 0); ihdr.set(u32(height), 4); ihdr[8] = 8; ihdr[9] = 6;
  return concat(signature, chunk('IHDR', ihdr), ...extras, chunk('IDAT', Uint8Array.of(1, 2, 3)), chunk('IEND'));
}
function rgba(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(colorAt(x, y), (y * width + x) * 4);
  return { width, height, data };
}
function enlarge(source, scale) {
  return rgba(source.width * scale, source.height * scale, (x, y) => source.data.slice(((Math.floor(y / scale) * source.width + Math.floor(x / scale)) * 4), ((Math.floor(y / scale) * source.width + Math.floor(x / scale)) * 4) + 4));
}

test('PNG metadata round trips, validates dimensions and replaces duplicate PiXiEED chunks', async () => {
  const oldClaim = chunk('tEXt', new TextEncoder().encode('PiXiEED-pixels\0{"version":1,"width":16,"height":12,"scale":2}'));
  const original = new Blob([png(32, 24, [chunk('tEXt', new TextEncoder().encode('other\0keep')), oldClaim, oldClaim])], { type: 'image/png' });
  assert.equal(readPixelPngMetadata(new Uint8Array(await original.arrayBuffer())), null, 'ambiguous duplicate claims fail closed');
  const once = await withPixelPngMetadata(original, { width: 16, height: 12, scale: 2 });
  assert.deepEqual(readPixelPngMetadata(new Uint8Array(await once.arrayBuffer())), { version: 1, width: 16, height: 12, scale: 2 });
  const twice = await withPixelPngMetadata(once, { width: 8, height: 6, scale: 4 });
  const bytes = new Uint8Array(await twice.arrayBuffer());
  assert.deepEqual(readPixelPngMetadata(bytes), { version: 1, width: 8, height: 6, scale: 4 });
  assert.equal(new TextDecoder().decode(bytes).split('PiXiEED-pixels').length - 1, 1);
  assert.match(new TextDecoder().decode(bytes), /other\\u0000keep|other/);
  await assert.rejects(() => withPixelPngMetadata(original, { width: 16, height: 12, scale: 3 }), RangeError);
});

test('reader rejects bad PNG signatures, chunk bounds and metadata CRC', () => {
  const valid = png(2, 2); const badSignature = valid.slice(); badSignature[0] = 0;
  assert.equal(readPixelPngMetadata(badSignature), null);
  const badLength = valid.slice(); badLength[8] = 0x7f;
  assert.equal(readPixelPngMetadata(badLength), null);
  const withText = png(4, 4, [chunk('tEXt', new TextEncoder().encode('PiXiEED-pixels\0{"version":1,"width":2,"height":2,"scale":2}'))]);
  const textChunkOffset = 8 + 25; const badCrc = withText.slice(); const textLength = new TextEncoder().encode('PiXiEED-pixels\0{"version":1,"width":2,"height":2,"scale":2}').length;
  badCrc[textChunkOffset + 8 + textLength] ^= 1;
  assert.equal(readPixelPngMetadata(badCrc), null);
});

test('metadata preserves repeated and flat art at its exact logical dimensions', () => {
  const repeated16 = rgba(16, 16, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? [240, 20, 10, 255] : [10, 20, 240, 255]);
  const enlarged = enlarge(repeated16, 128);
  const recovered = normalizePixels(enlarged, { metadata: { version: 1, width: 16, height: 16, scale: 128 } });
  assert.equal(recovered.width, 16); assert.equal(recovered.height, 16); assert.equal(recovered.scale, 128);
  assert.deepEqual([...recovered.data], [...repeated16.data]);
  const flat = rgba(64, 64, () => [99, 111, 123, 255]);
  const exact = normalizePixels(flat, { metadata: { version: 1, width: 16, height: 16, scale: 4 } });
  assert.equal(exact.width, 16); assert.equal(exact.height, 16);
  assert.equal(normalizePixels(flat).width, 8, 'unmarked flat pixels retain the conservative heuristic');
});

test('exact homogeneity preserves partial alpha and ignores RGB under fully transparent pixels', () => {
  const logical = rgba(3, 2, (x, y) => x === 0 ? [8 + x, 55 + y, 99, 0] : [x * 20, y * 30, 40, 128]);
  const big = enlarge(logical, 2);
  for (let i = 0; i < big.data.length; i += 4) if (big.data[i + 3] === 0) big.data[i] = (i / 4) % 255;
  const result = normalizePixels(big, { metadata: { version: 1, width: 3, height: 2, scale: 2 } });
  const expected = logical.data.slice();
  for (let y = 0; y < 2; y += 1) { const from = (y * 2 * big.width) * 4; expected.set(big.data.slice(from, from + 4), y * logical.width * 4); }
  assert.equal(result.width, 3); assert.equal(result.height, 2); assert.deepEqual([...result.data], [...expected]);
  assert.deepEqual([...result.data.slice(4, 8)], [20, 0, 40, 128]);
});

test('a false metadata claim leaves all pixels intact and suppresses heuristic inference', () => {
  const logical = rgba(8, 8, (x, y) => (x + y) % 2 ? [255, 0, 0, 255] : [0, 0, 0, 255]);
  const big = enlarge(logical, 2); big.data[0] = 1;
  const result = normalizePixels(big, { metadata: { version: 1, width: 8, height: 8, scale: 2 }, inferScale: true });
  assert.equal(result.width, 16); assert.equal(result.height, 16); assert.equal(result.scale, 1);
  assert.deepEqual(result.data, big.data);
});

test('unmarked non-grid images remain unchanged', () => {
  const photo = rgba(12, 8, (x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 71) % 256, (x * y) % 256, 255]);
  const result = normalizePixels(photo);
  assert.equal(result.scale, 1); assert.equal(result.width, 12); assert.equal(result.height, 8);
});

test('unmarked exact 2x blocks use the bounded inference fallback', () => {
  const logical = rgba(8, 8, (x, y) => (x + y) % 2 ? [255, 10, 0, 255] : [0, 10, 255, 255]);
  const result = normalizePixels(enlarge(logical, 2));
  assert.equal(result.scale, 2); assert.equal(result.width, 8); assert.equal(result.height, 8);
  assert.deepEqual([...result.data], [...logical.data]);
});

test('PNG, WebP and JPEG headers yield dimensions before decoding', () => {
  const p = png(123, 45); assert.deepEqual(readPixelImageDimensions(p.slice(0, 32), 'image/png'), { width: 123, height: 45 });
  const webp = new Uint8Array(30); webp.set([...Buffer.from('RIFF')], 0); webp.set([...Buffer.from('WEBP')], 8); webp.set([...Buffer.from('VP8X')], 12); webp[24] = 9; webp[27] = 19;
  assert.deepEqual(readPixelImageDimensions(webp, 'image/webp'), { width: 10, height: 20 });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 0, 45, 0, 123, 1]);
  assert.deepEqual(readPixelImageDimensions(jpeg, 'image/jpeg'), { width: 123, height: 45 });
});

test('oversized files and raster headers are rejected before bitmap decoding', async () => {
  let decodeCalls = 0;
  const decoder = async () => { decodeCalls += 1; throw new Error('must not decode'); };
  const canvasDocument = { createElement: () => ({ getContext: () => null }) };
  const oversized = { size: 10 * 1024 * 1024 + 1, type: 'image/png', slice() { throw new Error('header must not read'); } };
  await assert.rejects(() => normalizePixelFile(oversized, { createImageBitmapImpl: decoder, documentRef: canvasDocument }), RangeError);
  const header = png(4097, 2).slice(0, 24);
  const tooWide = { size: 24, type: 'image/png', slice() { return new Blob([header]); }, async arrayBuffer() { throw new Error('full bytes must not read'); } };
  await assert.rejects(() => normalizePixelFile(tooWide, { createImageBitmapImpl: decoder, documentRef: canvasDocument }), RangeError);
  assert.equal(decodeCalls, 0);
});

test('JPEG import accepts decoder-applied portrait orientation but rejects unrelated dimensions', async () => {
  const input = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 0, 45, 0, 123, 1])], { type: 'image/jpeg' });
  const portrait = rgba(45, 123, (x, y) => [x, y, 90, 255]);
  let closed = 0;
  const documentRef = { createElement: () => ({ getContext: () => ({
    drawImage() {}, getImageData: () => ({ data: portrait.data })
  }) }) };
  const createImageBitmapImpl = async () => ({ ...portrait, close() { closed += 1; } });
  const result = await normalizePixelFile(input, { createImageBitmapImpl, documentRef, inferScale: false });
  assert.equal(result.width, 45);
  assert.equal(result.height, 123);
  assert.deepEqual(result.data, portrait.data);
  assert.equal(result.file, input);
  assert.equal(closed, 1);
  await assert.rejects(() => normalizePixelFile(input, {
    documentRef, inferScale: false,
    createImageBitmapImpl: async () => ({ width: 46, height: 123, close() { closed += 1; } })
  }), /寸法/);
  assert.equal(closed, 2, 'invalid decoder result is released');
});

test('normalized flat PNG retains its logical dimensions through a second import', async () => {
  const flat = rgba(64, 64, () => [3, 4, 5, 255]);
  const encoded = png(64, 64);
  const input = await withPixelPngMetadata(new Blob([encoded], { type: 'image/png' }), { width: 16, height: 16, scale: 4 });
  let outputPixels = null;
  const documentRef = { createElement() {
    const canvas = { width: 1, height: 1, getContext() { return {
      drawImage(bitmap) { this.current = bitmap; },
      getImageData() { return { data: this.current.data }; },
      createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData(imageData) { canvas.image = { width: canvas.width, height: canvas.height, data: imageData.data }; }
    }; },
    toBlob(callback) { const blob = new Blob([png(canvas.width, canvas.height)], { type: 'image/png' }); outputPixels = canvas.image; callback(blob); } };
    return canvas;
  } };
  const createImageBitmapImpl = async (file) => ({ ...(file === input ? flat : outputPixels), close() {} });
  const first = await normalizePixelFile(input, { createImageBitmapImpl, documentRef });
  assert.equal(first.width, 16); assert.equal(first.height, 16);
  const second = await normalizePixelFile(first.file, { createImageBitmapImpl, documentRef });
  assert.equal(second.width, 16); assert.equal(second.height, 16); assert.equal(second.scale, 1);
  assert.deepEqual(readPixelPngMetadata(new Uint8Array(await first.file.arrayBuffer())), { version: 1, width: 16, height: 16, scale: 1 });
});
