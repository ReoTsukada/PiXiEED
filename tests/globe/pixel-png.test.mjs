import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePixelPngRgba, inspectPixelPng, verifyPixelPngClaim, verifyStoredPixelPngClaim } from '../../supabase/functions/_shared/pixel-png.mjs';

const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function u32(value) { return Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]); }
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, body) {
  const data = Uint8Array.from(body); const type = new TextEncoder().encode(name);
  return Buffer.concat([u32(data.length), type, data, u32(crc32(Buffer.concat([type, data])))]);
}
function png(width, height, pixelAt, { colorType = 6, filter = 0 } = {}) {
  const channels = colorType === 6 ? 4 : 3;
  const header = Uint8Array.from([...u32(width), ...u32(height), 8, colorType, 0, 0, 0]);
  const rows = []; let previous = new Uint8Array(width * channels);
  for (let y = 0; y < height; y += 1) {
    const full = new Uint8Array(width * channels);
    for (let x = 0; x < width; x += 1) full.set(pixelAt(x, y).slice(0, channels), x * channels);
    const encoded = new Uint8Array(full.length + 1); encoded[0] = filter;
    for (let i = 0; i < full.length; i += 1) {
      const left = i >= channels ? full[i - channels] : 0; const up = previous[i];
      const upperLeft = i >= channels ? previous[i - channels] : 0;
      const p = left + up - upperLeft;
      const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upperLeft) ? left : Math.abs(p - up) <= Math.abs(p - upperLeft) ? up : upperLeft;
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth : 0;
      encoded[i + 1] = (full[i] - predictor + 256) & 255;
    }
    rows.push(encoded); previous = full;
  }
  return Uint8Array.from(Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', [])]));
}

test('server counts the decompressed PNG colours and accepts matching claims', async () => {
  const bytes = png(8, 8, (x) => x < 4 ? [20, 50, 80, 255] : [210, 100, 30, 255]);
  assert.deepEqual(await inspectPixelPng(bytes), { width: 8, height: 8, colorCount: 2 });
  assert.deepEqual(await verifyPixelPngClaim(bytes, { mimeType: 'image/png', size: bytes.length, width: 8, height: 8, colorCount: 2 }), { width: 8, height: 8, colorCount: 2 });
  const withRgba = await verifyPixelPngClaim(bytes, { mimeType: 'image/png', size: bytes.length, width: 8, height: 8, colorCount: 2 }, { includeRgba: true });
  assert.equal(withRgba.rgba.length, 8 * 8 * 4);
  assert.deepEqual(Array.from(withRgba.rgba.slice(0, 4)), [20, 50, 80, 255]);
});

test('all five PNG row filters and RGB without alpha have the same visible count', async () => {
  for (let filter = 0; filter <= 4; filter += 1) {
    const bytes = png(8, 8, (x, y) => x + y < 7 ? [11, 42, 120] : [218, 95, 32], { colorType: 2, filter });
    assert.equal((await inspectPixelPng(bytes)).colorCount, 2);
  }
});

test('RGBA decoder returns actual RGB and RGBA samples for all five filters', async () => {
  for (let filter = 0; filter <= 4; filter += 1) {
    const pixels = (x, y) => x === 0 && y === 0 ? [14, 28, 42, 0] : [200, 150, 100, 128];
    const rgba = await decodePixelPngRgba(png(8, 8, pixels, { colorType: 6, filter }));
    assert.deepEqual({ width: rgba.width, height: rgba.height, colorCount: rgba.colorCount }, { width: 8, height: 8, colorCount: 2 });
    assert.deepEqual(Array.from(rgba.rgba.slice(0, 8)), [14, 28, 42, 0, 200, 150, 100, 128]);

    const rgb = await decodePixelPngRgba(png(8, 8, pixels, { colorType: 2, filter }));
    assert.deepEqual(Array.from(rgb.rgba.slice(0, 8)), [14, 28, 42, 255, 200, 150, 100, 255]);
  }
});

test('RGBA decoder rejects oversized and corrupt PNG bytes while existing APIs stay compatible', async () => {
  const bytes = png(8, 8, () => [3, 6, 9, 255]);
  const tooLarge = new Uint8Array(512 * 1024 + 1);
  await assert.rejects(decodePixelPngRgba(tooLarge), { code: 'image_size_invalid' });
  const corrupt = bytes.slice(); corrupt[44] ^= 1;
  await assert.rejects(decodePixelPngRgba(corrupt), { code: 'image_decode_invalid' });
  assert.deepEqual(await inspectPixelPng(bytes), { width: 8, height: 8, colorCount: 1 });
  assert.deepEqual(await verifyPixelPngClaim(bytes, { mimeType: 'image/png', size: bytes.length, width: 8, height: 8, colorCount: 1 }), { width: 8, height: 8, colorCount: 1 });
});

test('forged dimensions, byte size, or colour count cannot be admitted', async () => {
  const bytes = png(8, 8, () => [18, 20, 24, 255]);
  const claim = { mimeType: 'image/png', size: bytes.length, width: 8, height: 8, colorCount: 1 };
  for (const [change, code] of [[{ width: 9 }, 'image_pixels_invalid'], [{ size: bytes.length - 1 }, 'image_size_invalid'], [{ colorCount: 2 }, 'image_colors_invalid'], [{ mimeType: 'image/webp' }, 'image_type_invalid']]) {
    await assert.rejects(verifyPixelPngClaim(bytes, { ...claim, ...change }), { code });
  }
});

test('more than 128 actual colours are rejected even when the claim says 128', async () => {
  const bytes = png(16, 16, (x, y) => [x * 13, y * 13, (x + y) * 5, 255]);
  await assert.rejects(verifyPixelPngClaim(bytes, { mimeType: 'image/png', size: bytes.length, width: 16, height: 16, colorCount: 128 }), { code: 'image_colors_invalid' });
});

test('corrupt CRC, unsupported palette PNG, and truncated bytes fail closed', async () => {
  const bytes = png(8, 8, () => [3, 6, 9, 255]);
  const corrupt = bytes.slice(); corrupt[44] ^= 1;
  await assert.rejects(inspectPixelPng(corrupt), { code: 'image_decode_invalid' });
  await assert.rejects(inspectPixelPng(bytes.slice(0, -3)), { code: 'image_decode_invalid' });
  const palette = png(8, 8, () => [0, 0, 0, 255], { colorType: 3 });
  await assert.rejects(inspectPixelPng(palette), { code: 'image_decode_invalid' });
});

test('CRC-valid PNG with an invalid chunk name is rejected before admission', async () => {
  const bytes = png(8, 8, () => [20, 30, 40, 255]);
  const beforeIdat = 8 + 25;
  const malformed = Uint8Array.from(Buffer.concat([bytes.subarray(0, beforeIdat), chunk('a1CD', [1]), bytes.subarray(beforeIdat)]));
  await assert.rejects(inspectPixelPng(malformed), { code: 'image_decode_invalid' });
  const reservedBit = Uint8Array.from(Buffer.concat([bytes.subarray(0, beforeIdat), chunk('abce', [1]), bytes.subarray(beforeIdat)]));
  await assert.rejects(inspectPixelPng(reservedBit), { code: 'image_decode_invalid' });
});


test('any rectangular grid from 1 through 256px preserves its actual dimensions', async () => {
  for (const [width, height] of [[1, 1], [256, 1], [1, 256], [256, 64], [64, 256], [255, 17], [256, 256]]) {
    const bytes = png(width, height, () => [20, 50, 80, 255]);
    const claim = { mimeType: 'image/png', size: bytes.length, width, height, colorCount: 1 };
    assert.deepEqual(await verifyPixelPngClaim(bytes, claim), { width, height, colorCount: 1 });
  }
});

test('the 256px longest-side limit rejects either axis without imposing an aspect ratio', async () => {
  for (const [width, height] of [[257, 1], [1, 257], [0, 16], [16, 0]]) {
    const bytes = png(width, height, () => [20, 50, 80, 255]);
    await assert.rejects(verifyPixelPngClaim(bytes, { mimeType: 'image/png', size: bytes.length, width, height, colorCount: 1 }), { code: 'image_pixels_invalid' });
  }
});


test('historical 512px images can still be decoded for moderation while new uploads are limited to 256px', async () => {
  const bytes = png(512, 8, () => [20, 50, 80, 255]);
  const decoded = await decodePixelPngRgba(bytes);
  assert.equal(decoded.width, 512);
  assert.equal(decoded.height, 8);
  await assert.rejects(verifyPixelPngClaim(bytes, { mimeType: 'image/png', size: bytes.length, width: 512, height: 8, colorCount: 1 }), { code: 'image_pixels_invalid' });
});

test('stored 512px claims retain actual sample, size and color validation', async () => {
  const bytes = png(512, 16, () => [20, 50, 80, 255]);
  const claim = { mimeType: 'image/png', size: bytes.length, width: 512, height: 16, colorCount: 1 };
  assert.deepEqual(await verifyStoredPixelPngClaim(bytes, claim), { width: 512, height: 16, colorCount: 1 });
  assert.equal((await verifyStoredPixelPngClaim(bytes, claim, { includeRgba: true })).rgba.length, 512 * 16 * 4);
  await assert.rejects(verifyPixelPngClaim(bytes, claim), { code: 'image_pixels_invalid' });
  for (const [change, code] of [[{ width: 256 }, 'image_pixels_invalid'], [{ size: bytes.length - 1 }, 'image_size_invalid'], [{ colorCount: 2 }, 'image_colors_invalid']]) {
    await assert.rejects(verifyStoredPixelPngClaim(bytes, { ...claim, ...change }), { code });
  }
  const manyColors = png(512, 16, (x) => [x % 256, 1, 2, 255]);
  await assert.rejects(verifyStoredPixelPngClaim(manyColors, { ...claim, size: manyColors.length, colorCount: 128 }), { code: 'image_colors_invalid' });
});
