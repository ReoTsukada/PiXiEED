import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { encodeOutput } from '../../js/creation/output-encoders.mjs';

const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const out = new Uint8Array(data.length + 12); new DataView(out.buffer).setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8); new DataView(out.buffer).setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4))); return out;
}
function pngFixture(width, height, rgba) {
  const ihdr = new Uint8Array(13); const view = new DataView(ihdr.buffer); view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6;
  const scan = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) scan.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(scan)), pngChunk('IEND', new Uint8Array())]);
}
function concat(parts) { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; }
function frame(data, delayMs) { return { width: 2, height: 2, data: Uint8ClampedArray.from(data), ...(delayMs === undefined ? {} : { delayMs }) }; }
const checkerA = frame([255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255], 40);
const checkerB = frame([0, 0, 0, 0, 255, 255, 0, 255, 255, 0, 255, 255, 0, 0, 0, 0], 170);
const raster = async (value, mime) => new Blob([pngFixture(value.width, value.height, value.data)], { type: mime === 'image/jpeg' ? 'image/jpeg' : 'image/png' });

test('static PNG output retains the requested MIME and valid PNG signature', async () => {
  const blob = await encodeOutput({ format: 'png', frames: [checkerA] }, { encodeRaster: raster });
  assert.equal(blob.type, 'image/png'); assert.deepEqual(new Uint8Array(await blob.arrayBuffer()).subarray(0, 8), signature);
});

test('JPEG composites alpha over the explicit background and rejects canvas PNG fallback', async () => {
  let received;
  const encoder = async (value, mime, quality) => { received = { value, mime, quality }; return new Blob([Uint8Array.of(0xff, 0xd8, 1, 0xff, 0xd9)], { type: mime }); };
  const blob = await encodeOutput({ format: 'jpeg', frames: [checkerA], background: '#204060', quality: 0.65 }, { encodeRaster: encoder });
  assert.equal(blob.type, 'image/jpeg'); assert.equal(received.mime, 'image/jpeg');
  assert.equal(received.quality, 0.65);
  assert.deepEqual([...received.value.data.slice(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...received.value.data.slice(4, 8)], [32, 64, 96, 255]);
  await assert.rejects(encodeOutput({ format: 'jpeg', frames: [checkerA], quality: 1.1 }, { encodeRaster: encoder }), /50〜100%/);
  await assert.rejects(encodeOutput({ format: 'jpeg', frames: [checkerA] }, { encodeRaster: async () => new Blob([pngFixture(2, 2, checkerA.data)], { type: 'image/png' }) }), /代替出力/);
});

test('SVG is vector geometry with exact opaque and fractional-alpha pixel runs', async () => {
  const blob = await encodeOutput({ format: 'svg', frames: [checkerA] }); const xml = await blob.text();
  assert.equal(blob.type, 'image/svg+xml');
  assert.match(xml, /<rect x="0" y="0" width="1" height="1" fill="#ff0000"\/>/);
  assert.match(xml, /fill="#00ff00" fill-opacity="0\.501961"/);
  assert.doesNotMatch(xml, /data:image\/png|<image/);
});

test('SVG rejects an oversized vector before building an unbounded output', async () => {
  const width = 4096; const height = 240; const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4; const value = x % 2 ? 255 : 0;
    data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
  }
  await assert.rejects(encodeOutput({ format: 'svg', frames: [{ width, height, data }] }), /32MBを超えます/);
});

test('APNG builds CRC-valid chunks, ordered sequence numbers, per-frame delays, and loop count', async () => {
  const outputs = [checkerA, checkerB];
  const blob = await encodeOutput({ format: 'apng', frames: outputs, totalPlays: 4 }, { encodeRaster: async (value, mime) => new Blob([pngFixture(value.width, value.height, value.data)], { type: mime }) });
  const bytes = new Uint8Array(await blob.arrayBuffer()); assert.equal(blob.type, 'image/apng'); assert.deepEqual(bytes.subarray(0, 8), signature);
  let offset = 8; const names = []; const seq = []; const delays = []; let loops = null;
  while (offset < bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)); const end = offset + 8 + length;
    assert.equal(crc32(bytes.subarray(offset + 4, end)), new DataView(bytes.buffer, bytes.byteOffset + end, 4).getUint32(0), `${name} CRC`);
    const body = bytes.subarray(offset + 8, end); names.push(name);
    if (name === 'acTL') loops = new DataView(body.buffer, body.byteOffset + 4, 4).getUint32(0);
    if (name === 'fcTL') {
      seq.push(new DataView(body.buffer, body.byteOffset, 4).getUint32(0));
      delays.push([new DataView(body.buffer, body.byteOffset + 20, 2).getUint16(0), new DataView(body.buffer, body.byteOffset + 22, 2).getUint16(0)]);
      assert.equal(body[24], 0); assert.equal(body[25], 0);
    }
    if (name === 'fdAT') seq.push(new DataView(body.buffer, body.byteOffset, 4).getUint32(0));
    offset = end + 4; if (name === 'IEND') break;
  }
  assert.equal(loops, 4); assert.deepEqual(seq, [0, 1, 2]); assert.deepEqual(delays, [[40, 1000], [170, 1000]]);
  assert.deepEqual(names.filter((name) => name === 'fcTL').length, 2); assert.deepEqual(names.filter((name) => name === 'fdAT').length, 1);
});

test('APNG rejects incompatible frame PNG headers and does not invent a conversion', async () => {
  let count = 0;
  const encodeRaster = async (value, mime) => {
    count += 1; const png = pngFixture(value.width, value.height, value.data);
    if (count === 2) { const changed = png.slice(); changed[8 + 8 + 9] = 2; new DataView(changed.buffer).setUint32(8 + 8 + 13, crc32(changed.subarray(12, 8 + 8 + 13))); return new Blob([changed], { type: mime }); }
    return new Blob([png], { type: mime });
  };
  await assert.rejects(encodeOutput({ format: 'apng', frames: [checkerA, checkerB] }, { encodeRaster }), /色形式が一致/);
});

test('GIF converts normalized total plays into Netscape repeats and omits the loop extension for one play', async () => {
  for (const [totalPlays, encodedRepeats] of [[0, 0], [1, null], [2, 1], [4, 3]]) {
    const progress = [];
    const blob = await encodeOutput({ format: 'gif', frames: [checkerA, checkerB], totalPlays }, { onProgress: (value) => progress.push(value) }); const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.deepEqual(progress, [0.45, 0.9, 0.95, 1]);
    assert.equal(blob.type, 'image/gif'); assert.equal(String.fromCharCode(...bytes.subarray(0, 6)), 'GIF89a');
    const app = [...bytes].findIndex((byte, index) => byte === 0x21 && bytes[index + 1] === 0xff && bytes[index + 2] === 0x0b);
    if (encodedRepeats === null) assert.equal(app, -1);
    else { assert.ok(app > 0); assert.equal(bytes[app + 16] | (bytes[app + 17] << 8), encodedRepeats); }
    const delays = [];
    for (let index = 0; index < bytes.length - 7; index += 1) if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 4) delays.push((bytes[index + 4] | (bytes[index + 5] << 8)) * 10);
    assert.deepEqual(delays, [40, 170]);
  }
});

test('APNG total-play values encode one pass, repeated passes, and infinite playback directly', async () => {
  for (const totalPlays of [0, 1, 2]) {
    const blob = await encodeOutput({ format: 'apng', frames: [checkerA, checkerB], totalPlays }, { encodeRaster: raster });
    const bytes = new Uint8Array(await blob.arrayBuffer()); let offset = 8; let actual = null;
    while (offset + 12 <= bytes.length) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
      if (String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'acTL') actual = new DataView(bytes.buffer, bytes.byteOffset + offset + 12, 4).getUint32(0);
      offset += length + 12;
    }
    assert.equal(actual, totalPlays);
  }
});

test('format, pixel, frame, delay, and animation memory limits fail safely', async () => {
  await assert.rejects(encodeOutput({ format: 'webp', frames: [checkerA] }), /形式/);
  await assert.rejects(encodeOutput({ format: 'png', frames: [{ width: 1, height: 1, data: new Uint8Array(3) }] }), /不正/);
  await assert.rejects(encodeOutput({ format: 'apng', frames: [{ ...checkerA, delayMs: 0 }] }, { encodeRaster: raster }), /表示時間/);
  await assert.rejects(encodeOutput({ format: 'apng', frames: Array.from({ length: 600 }, () => ({ width: 4096, height: 4096, data: new Uint8Array(0) })) }, { encodeRaster: raster }), /RGBAデータ|大きすぎ/);
});
