import test from 'node:test';
import assert from 'node:assert/strict';
import { audioImageExportSize } from '../../js/creation/audio-export.mjs';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import { exportAudioImage } from '../../js/creation/audio-export.mjs';

test('PNG uses an integer enlargement while preserving rectangular music dimensions', () => {
  assert.deepEqual(audioImageExportSize(16, 16), { width: 1024, height: 1024, scale: 64 });
  assert.deepEqual(audioImageExportSize(32, 16), { width: 1024, height: 512, scale: 32 });
  assert.deepEqual(audioImageExportSize(64, 16), { width: 1024, height: 256, scale: 16 });
  assert.deepEqual(audioImageExportSize(48, 16), { width: 1008, height: 336, scale: 21 });
});

test('invalid or unbounded export dimensions fail before allocating a canvas', () => {
  for (const args of [[0, 16], [-1, 16], [1.5, 16], [16, 16, Infinity], [16, 16, 9000]]) assert.throws(() => audioImageExportSize(...args), RangeError);
});

test('PXD working-image RGBA reaches the export canvas and integer scaling disables smoothing', async () => {
  const canvases = [];
  const document = { createElement() {
    const canvas = { width: 0, height: 0, toBlob(callback, type) { callback(new Blob(['png-fixture'], { type })); } };
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
  assert.equal(canvases[1].width, 1024); assert.equal(canvases[1].height, 1024);
});
