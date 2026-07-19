import assert from 'node:assert/strict';
import { crc32 as nodeCrc32 } from 'node:zlib';

globalThis.window = globalThis;

class FakeCanvasContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.imageSmoothingEnabled = false;
    this.fillStyle = '';
  }
  createImageData(width, height) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }
  putImageData(imageData) {
    this.canvas.lastImageData = imageData;
  }
  drawImage() {}
  fillRect() {}
}

class FakeCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.context = new FakeCanvasContext(this);
  }
  getContext() { return this.context; }
  toBlob(callback, type) {
    callback(new Blob([`fake-png:${this.width}x${this.height}`], { type: type || 'image/png' }));
  }
}

globalThis.document = {
  createElement(tagName) {
    if (tagName === 'canvas') return new FakeCanvas();
    return {
      hidden: false,
      click() {},
      remove() {},
    };
  },
  body: { appendChild() {} },
};

await import('../pixiedraw/assets/js/modules/color-codec-utils.js');
await import('./market-purchase-delivery.js');

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const codec = window.PiXiEEDrawModules.colorCodecUtils.createColorCodecUtils({
  clamp,
  MAX_IMPORTED_PALETTE_COLORS: 256,
});
const redFrame = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]);
const blueFrame = new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255]);
const gifBytes = codec.buildGifFromPixels([redFrame, blueFrame], [100, 120], 2, 1);
const gifBlob = new Blob([gifBytes], { type: 'image/gif' });
const delivery = window.PiXiEEDMarketDelivery;

const frameTasks = await delivery.buildGifFramePngTasks(gifBlob, 'animation.gif');
assert.deepEqual(frameTasks.map((task) => task.filename), [
  'animation-frames/frame-0001.png',
  'animation-frames/frame-0002.png',
  'animation-frames/frames.json',
]);

const spriteTasks = await delivery.buildGifSpriteMapTasks(gifBlob, 'animation.gif');
assert.deepEqual(spriteTasks.map((task) => task.filename), [
  'animation-spritemap.png',
  'animation-colormap.png',
  'animation-colormap.json',
]);
const colorMap = JSON.parse(await spriteTasks[2].blob.text());
assert.equal(colorMap.frameCount, 2);
assert.equal(colorMap.columns, 2);
assert.equal(colorMap.rows, 1);
assert.equal(colorMap.colorCount, 2);

const zipProgress = [];
const largeTask = { filename: 'large.bin', blob: new Blob([new Uint8Array(2 * 1024 * 1024 + 32)]) };
const zipBlob = await delivery.buildZipBlob([...frameTasks, ...spriteTasks, largeTask], (progress) => zipProgress.push(progress));
const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
const zipView = new DataView(zipBytes.buffer);
assert.equal(zipView.getUint32(0, true), 0x04034B50);
assert.equal(zipView.getUint32(14, true), nodeCrc32(new Uint8Array(await frameTasks[0].blob.arrayBuffer())));
assert.equal(zipView.getUint32(zipBytes.length - 22, true), 0x06054B50);
assert.equal(zipView.getUint16(zipBytes.length - 14, true), 7);
assert.ok(zipProgress.some((progress) => progress.phase === 'checksum'));
assert.ok(zipProgress.some((progress) => (
  progress.filename === 'large.bin'
  && progress.phase === 'checksum'
  && progress.processedBytes >= largeTask.blob.size
)));
assert.equal(zipProgress.at(-1).phase, 'finalize');

console.log('market purchase GIF export checks passed');
