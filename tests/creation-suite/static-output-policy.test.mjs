import test from 'node:test';
import assert from 'node:assert/strict';
import { exportScale, enlargedCanvas, EXPORT_MAX_PIXELS } from '../../js/pixel-export.mjs';

test('direct drawing PNG scaling follows the active static image target and keeps integer dots', () => {
  assert.equal(exportScale(16, 16, 2048), 128);
  assert.equal(exportScale(16, 16, 4096), 256);
  assert.equal(exportScale(3000, 1000, 2048), 1, 'already-large originals are never downsized');
});

test('drawing PNG encoder applies nearest-neighbour scaling and enforces the shared pixel budget', () => {
  const previousImageData = globalThis.ImageData;
  globalThis.ImageData = class ImageDataMock {
    constructor(data, width, height) { Object.assign(this, { data, width, height }); }
  };
  try {
    const canvases = [];
    const documentRef = { createElement() {
      const context = { imageSmoothingEnabled: true, putImageData(image) { this.image = image; }, drawImage(source) { this.source = source; }, fillRect() {} };
      const canvas = { width: 0, height: 0, getContext: () => context, context };
      canvases.push(canvas); return canvas;
    } };
    const canvas = enlargedCanvas({ width: 16, height: 16, data: new Uint8Array(16 * 16 * 4) }, { scale: 256, documentRef });
    assert.deepEqual([canvas.width, canvas.height], [4096, 4096]);
    assert.equal(canvas.context.imageSmoothingEnabled, false);
    assert.equal(canvases[0].context.image.width, 16);
    assert.equal(canvases[1].context.source, canvases[0]);
    assert.equal(4096 * 4096, EXPORT_MAX_PIXELS);
    assert.throws(() => enlargedCanvas({ width: 16, height: 16, data: new Uint8Array(16 * 16 * 4) }, { scale: 257, documentRef }), RangeError);
  } finally {
    if (previousImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = previousImageData;
  }
});
