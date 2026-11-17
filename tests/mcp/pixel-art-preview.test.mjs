import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { renderPixelArtPreviews } from '../../js/mcp/pixel-art-preview.mjs';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function decodePng(image) {
  const png = Buffer.from(image.data, 'base64');
  assert.deepEqual(png.subarray(0, 8), SIGNATURE);
  const chunks = [];
  let cursor = 8;
  while (cursor < png.length) {
    const length = png.readUInt32BE(cursor);
    const type = png.toString('ascii', cursor + 4, cursor + 8);
    const data = png.subarray(cursor + 8, cursor + 8 + length);
    const expected = png.readUInt32BE(cursor + 8 + length);
    assert.equal(crc32(png.subarray(cursor + 4, cursor + 8 + length)), expected, `${type} CRC`);
    chunks.push({ type, data });
    cursor += length + 12;
  }
  assert.equal(cursor, png.length);
  assert.deepEqual(chunks.map(({ type }) => type), ['IHDR', 'IDAT', 'IEND']);
  const header = chunks[0].data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  assert.equal(header[8], 8);
  assert.equal(header[9], 6);
  const scanlines = inflateSync(Buffer.concat(chunks.filter(({ type }) => type === 'IDAT').map(({ data }) => data)));
  const stride = width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const source = y * (stride + 1);
    assert.equal(scanlines[source], 0, 'PNG rows use filter 0');
    rgba.set(scanlines.subarray(source + 1, source + 1 + stride), y * stride);
  }
  assert.equal(width, image.width);
  assert.equal(height, image.height);
  return { width, height, rgba };
}

function pixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [...image.rgba.subarray(offset, offset + 4)];
}

test('emits a valid transparent native PNG with exact input RGBA and descriptive metrics', async () => {
  const result = await renderPixelArtPreviews({ width: 3, height: 2, palette: ['#112233', '#AABBCC'], rows: ['0.1', '.10'] });
  assert.deepEqual(result.images.map(({ kind, mimeType }) => ({ kind, mimeType })), [
    { kind: 'native', mimeType: 'image/png' },
    { kind: 'review', mimeType: 'image/png' }
  ]);
  const native = decodePng(result.images[0]);
  assert.deepEqual([native.width, native.height], [3, 2]);
  assert.deepEqual([...native.rgba], [17, 34, 51, 255, 0, 0, 0, 0, 170, 187, 204, 255, 0, 0, 0, 0, 170, 187, 204, 255, 17, 34, 51, 255]);
  assert.deepEqual(result.metrics, {
    width: 3, height: 2, paletteEntries: 2, usedColors: 2, opaquePixels: 4, transparentPixels: 2,
    bounds: { x: 0, y: 0, width: 3, height: 2 }
  });
  assert.deepEqual(result.review.backgrounds, ['#F7F2E6', '#899790', '#24263D']);
  assert.equal(result.review.scale, 8);
  assert.match(result.review.grayscaleMethod, /299\*R.*587\*G.*114\*B/);
});

test('composites transparency on each background and replicates nearest-neighbor zoom pixels', async () => {
  const result = await renderPixelArtPreviews({ width: 2, height: 2, palette: ['#FF0000', '#0000FF'], rows: ['0.', '10'] });
  const review = decodePng(result.images[1]);
  assert.equal(review.width, 320);
  const padding = 8;
  const titleHeight = 12;
  const scale = 8;
  const cellWidth = Math.max(96, 2 * scale + padding * 2);
  const cellHeight = 2 * scale + 2 + padding * 2;
  const cellX = padding;
  const cellY = titleHeight + padding;
  const nativeX = cellX + Math.floor((cellWidth - 2) / 2);
  const nativeY = cellY + padding;
  const zoomX = cellX + Math.floor((cellWidth - 2 * scale) / 2);
  const zoomY = nativeY + 2 + padding;
  assert.deepEqual(pixel(review, cellX + 1, cellY + 1), [247, 242, 230, 255]);
  assert.deepEqual(pixel(review, nativeX, nativeY), [255, 0, 0, 255]);
  assert.deepEqual(pixel(review, nativeX + 1, nativeY), [247, 242, 230, 255]);
  assert.deepEqual(pixel(review, zoomX, zoomY), [255, 0, 0, 255]);
  for (let y = 0; y < scale; y += 1) {
    for (let x = 0; x < scale; x += 1) assert.deepEqual(pixel(review, zoomX + x, zoomY + y), [255, 0, 0, 255]);
  }
  const bottomCellY = titleHeight + padding + cellHeight + padding;
  const grayscaleNativeY = bottomCellY + padding;
  const grayscaleNativeX = cellX + Math.floor((cellWidth - 2) / 2);
  assert.deepEqual(pixel(review, grayscaleNativeX, grayscaleNativeY), [76, 76, 76, 255]);
  assert.deepEqual(pixel(review, grayscaleNativeX + 1, grayscaleNativeY), [247, 242, 230, 255]);
});

test('uses the documented scale at 16px and 64px limits and handles non-square 1px art', async () => {
  const sixteen = await renderPixelArtPreviews({ width: 16, height: 9, palette: ['#123456'], rows: ['0'.repeat(16), ...Array(8).fill('.'.repeat(16))] });
  const thirtyTwo = await renderPixelArtPreviews({ width: 32, height: 32, palette: ['#123456'], rows: ['0'.repeat(32), ...Array(31).fill('.'.repeat(32))] });
  const max = await renderPixelArtPreviews({ width: 64, height: 64, palette: ['#123456'], rows: ['0'.repeat(64), ...Array(63).fill('.'.repeat(64))] });
  const one = await renderPixelArtPreviews({ width: 1, height: 1, palette: ['#ABCDEF'], rows: ['0'] });
  assert.equal(sixteen.review.scale, 8);
  assert.equal(decodePng(sixteen.images[1]).width, 464);
  assert.equal(thirtyTwo.review.scale, 6);
  assert.equal(decodePng(thirtyTwo.images[1]).width, 608);
  assert.equal(max.review.scale, 3);
  const maxReview = decodePng(max.images[1]);
  assert.deepEqual([maxReview.width, maxReview.height], [608, 580]);
  assert.equal(one.review.scale, 8);
  assert.deepEqual(one.metrics.bounds, { x: 0, y: 0, width: 1, height: 1 });
  const oneNative = decodePng(one.images[0]);
  assert.deepEqual(pixel(oneNative, 0, 0), [171, 205, 239, 255]);
  assert.ok(decodePng(one.images[1]).width < 800, 'small art uses a compact review sheet');
});

test('encodes irregular 64 by 64 art with 32 colors within a bounded response size', async () => {
  const symbols = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
  const palette = Array.from({ length: 32 }, (_, index) => `#${((index * 0x5bd1e9 + 0x123456) & 0xffffff).toString(16).padStart(6, '0')}`);
  let state = 0x6d2b79f5;
  const rows = Array.from({ length: 64 }, () => {
    let row = '';
    for (let x = 0; x < 64; x += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      row += symbols[(state >>> 0) % symbols.length];
    }
    return row;
  });
  const result = await renderPixelArtPreviews({ width: 64, height: 64, palette, rows });
  assert.equal(result.metrics.usedColors, 32);
  assert.equal(result.metrics.opaquePixels, 4096);
  const native = decodePng(result.images[0]);
  const review = decodePng(result.images[1]);
  assert.deepEqual([native.width, native.height], [64, 64]);
  assert.deepEqual([review.width, review.height], [608, 580]);
  assert.deepEqual(pixel(review, 8, 12 + 8 + 8 + 64 + 8), pixel(native, 0, 0));
  const payloadChars = result.images.reduce((total, image) => total + image.data.length, 0);
  assert.ok(payloadChars < 500_000, `combined base64 PNG response should remain below 500,000 chars (got ${payloadChars})`);
});

test('rejects all-transparent input through the shared contract', async () => {
  await assert.rejects(() => renderPixelArtPreviews({ width: 1, height: 1, palette: ['#000000'], rows: ['.'] }), /すべて透明/);
});
