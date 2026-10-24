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

import {
  STATIC_IMAGE_FREE_LONG_EDGE, STATIC_IMAGE_MAX_EDGE, STATIC_IMAGE_MAX_PIXELS,
  resolveStaticImageLongEdge, staticImageOutputGeometry
} from '../../js/creation/static-output-policy.mjs';

test('production static export defaults to the full safe cap without an entitlement', () => {
  assert.equal(STATIC_IMAGE_FREE_LONG_EDGE, 4096);
  assert.equal(STATIC_IMAGE_MAX_EDGE, 4096);
  assert.equal(STATIC_IMAGE_MAX_PIXELS, 16 * 1024 * 1024);
  assert.equal(resolveStaticImageLongEdge(), 4096);
  assert.equal(resolveStaticImageLongEdge({ entitled: false }), 4096);
  assert.equal(resolveStaticImageLongEdge({ policyEnabled: false, legacyLongEdge: 2048 }), 2048,
    'explicit technical legacy target remains honored');
  assert.deepEqual(staticImageOutputGeometry(16, 16), { width: 4096, height: 4096, scale: 256 });
  assert.deepEqual(staticImageOutputGeometry(5000, 1000), { width: 5000, height: 1000, scale: 1 },
    'existing larger images are not reduced');
  assert.deepEqual(staticImageOutputGeometry(4000, 4000), { width: 4000, height: 4000, scale: 1 },
    'the 16 MiB pixel budget still prevents an oversized enlargement');
});
