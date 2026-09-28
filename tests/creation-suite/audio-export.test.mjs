import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readPixelPngMetadata } from '../../js/pixel-png-metadata.mjs';
import { audioImageExportSize } from '../../js/creation/audio-export.mjs';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import { audioExportLoops, encodeWav, exportAudioImage } from '../../js/creation/audio-export.mjs';

function pngFixture(width, height) {
  const chunk = (type, data) => {
    const bytes = Buffer.alloc(data.length + 12); bytes.writeUInt32BE(data.length); bytes.write(type, 4); bytes.set(data, 8);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(4, bytes.length - 4)) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4); return bytes;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))], { type: 'image/png' });
}

test('PNG uses an integer enlargement while preserving rectangular music dimensions', () => {
  assert.deepEqual(audioImageExportSize(16, 16), { width: 2048, height: 2048, scale: 128 });
  assert.deepEqual(audioImageExportSize(32, 16), { width: 2048, height: 1024, scale: 64 });
  assert.deepEqual(audioImageExportSize(64, 16), { width: 2048, height: 512, scale: 32 });
  assert.deepEqual(audioImageExportSize(48, 16), { width: 2016, height: 672, scale: 42 });
});

test('invalid or unbounded export dimensions fail before allocating a canvas', () => {
  for (const args of [[0, 16], [-1, 16], [1.5, 16], [16, 16, Infinity], [16, 16, 9000]]) assert.throws(() => audioImageExportSize(...args), RangeError);
});

test('PXD working-image RGBA reaches the export canvas and integer scaling disables smoothing', async () => {
  const canvases = [];
  const document = { createElement() {
    const canvas = { width: 0, height: 0, toBlob(callback) { callback(pngFixture(this.width, this.height)); } };
    const context = { imageSmoothingEnabled: true, createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; }, putImageData(data) { this.imageData = data; }, drawImage(source) { this.source = source; } };
    canvas.getContext = () => context; canvas.context = context; canvases.push(canvas); return canvas;
  } };
  const image = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  image.rgba.set([7, 8, 9, 0], 0); image.rgba.set([12, 34, 56, 127], 4);
  const result = await exportAudioImage(createAudioSong({ songId: 'export-pxd' }), { document, image });
  assert.equal(result.blob.type, 'image/png');
  assert.deepEqual([...canvases[0].context.imageData.data.slice(0, 8)], [7, 8, 9, 0, 12, 34, 56, 127]);
  assert.equal(canvases[1].context.source, canvases[0]);
  assert.equal(canvases[1].context.imageSmoothingEnabled, false);
  assert.equal(result.width, 2048); assert.equal(result.height, 2048);
  assert.deepEqual(readPixelPngMetadata(new Uint8Array(await result.blob.arrayBuffer())), { version: 1, width: 16, height: 16, scale: 128 });
  assert.equal(canvases[0].width, 1); assert.equal(canvases[1].height, 1);
});

test('sound export: the loop repeats to about 8 seconds and the WAV header matches the samples', () => {
  const song = createAudioSong({ songId: 'wav', tempo: 120 });
  assert.equal(audioExportLoops(song), 4);
  assert.equal(audioExportLoops({ ...song, tempo: 30 }), 1);
  const left = new Float32Array([0, 1, -1]); const right = new Float32Array([0.5, 0, 0]);
  const wav = encodeWav({ numberOfChannels: 2, sampleRate: 44100, length: 3, getChannelData: (c) => (c ? right : left) });
  const view = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF'); assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
  assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(24, true), 44100); assert.equal(view.getUint32(40, true), 12);
  assert.equal(wav.length, 44 + 12); assert.equal(view.getInt16(44 + 4, true), 32767); assert.equal(view.getInt16(44 + 8, true), -32768);
});
