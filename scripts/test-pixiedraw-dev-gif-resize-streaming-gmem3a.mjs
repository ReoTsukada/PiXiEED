import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const decoderPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/image-import-decode-utils.js');

class TestImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

const context = {
  console: { warn() {} },
  ImageData: TestImageData,
  Uint8ClampedArray,
  window: { PiXiEEDrawModules: {} },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(decoderPath, 'utf8'), context, { filename: decoderPath });

const utils = context.window.PiXiEEDrawModules.imageImportDecodeUtils.createImageImportDecodeUtils({
  DEFAULT_IMPORT_FRAME_DURATION: 100,
  IMPORT_INTEGER_SCALE_SAMPLE_GRID: 4,
  MAX_IMPORTED_PALETTE_COLORS: 256,
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  createImageImportError: message => new Error(message),
  getImageImportCheckFrameIndexes: () => [],
  getGreatestCommonDivisor: (left, right) => right ? Math.abs(left) : Math.abs(right),
  quantizeRgbaColorEntriesWithMapping: () => [],
  normalizeColorValue: value => value,
  getPaletteColorKey: () => '',
  findNearestPaletteColorIndexByRgba: () => 0,
  resolveTransparentStoragePaletteIndex: () => 0,
  isGifFile: () => false,
  GifReader: null,
});
context.utils = utils;

const result = vm.runInContext(`(() => {
  const sourceFrames = [
    {
      duration: 70,
      disposal: 1,
      imageData: new ImageData(new Uint8ClampedArray([
        1, 2, 3, 255, 4, 5, 6, 255,
        7, 8, 9, 255, 10, 11, 12, 255,
      ]), 2, 2),
    },
    {
      duration: 120,
      disposal: 2,
      imageData: new ImageData(new Uint8ClampedArray([
        13, 14, 15, 255, 16, 17, 18, 255,
        19, 20, 21, 255, 22, 23, 24, 255,
      ]), 2, 2),
    },
  ];
  const sourceBuffers = sourceFrames.map(frame => frame.imageData.data.buffer);
  const resizedFrames = utils.resizeImportFrames(sourceFrames, 1, 1);
  const failingFrames = [{
    imageData: new ImageData(new Uint8ClampedArray([1, 2, 3, 255]), 2, 2),
  }];
  let resizeFailed = false;
  try {
    utils.resizeImportFrames(failingFrames, 1, 1);
  } catch (_error) {
    resizeFailed = true;
  }
  return {
    sourceFramesCleared: sourceFrames.every(frame => frame === null),
    frameCount: resizedFrames.length,
    durations: resizedFrames.map(frame => frame.duration),
    disposals: resizedFrames.map(frame => frame.disposal),
    dimensions: resizedFrames.map(frame => [frame.imageData.width, frame.imageData.height]),
    firstPixels: resizedFrames.map(frame => [...frame.imageData.data.slice(0, 4)]),
    buffersIndependent: resizedFrames.every((frame, index) => frame.imageData.data.buffer !== sourceBuffers[index]),
    resizeFailed,
    failingFramesCleared: failingFrames.every(frame => frame === null),
  };
})()`, context);

assert.equal(result.sourceFramesCleared, true, 'processed source frames must not retain ImageData');
assert.equal(result.frameCount, 2);
assert.deepEqual([...result.durations], [70, 120]);
assert.deepEqual([...result.disposals], [1, 2]);
assert.deepEqual(JSON.parse(JSON.stringify(result.dimensions)), [[1, 1], [1, 1]]);
assert.deepEqual(JSON.parse(JSON.stringify(result.firstPixels)), [[1, 2, 3, 255], [13, 14, 15, 255]]);
assert.equal(result.buffersIndependent, true, 'resized RGBA must not share a source buffer when dimensions change');
assert.equal(result.resizeFailed, true, 'invalid resize data must still reject the import');
assert.equal(result.failingFramesCleared, true, 'failed resize frames must release their source references');

console.log('G-MEM-3A streaming GIF resize checks passed.');
