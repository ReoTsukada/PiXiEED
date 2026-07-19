import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const helperPath = new URL('../PiXiEEDrawDEV/assets/js/modules/gif-import-inspection-utils.js', import.meta.url);
const decodePath = new URL('../PiXiEEDrawDEV/assets/js/modules/image-import-decode-utils.js', import.meta.url);
const colorCodecPath = new URL('../PiXiEEDrawDEV/assets/js/modules/color-codec-utils.js', import.meta.url);
const importPath = new URL('../PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js', import.meta.url);
const codecPath = new URL('../PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js', import.meta.url);

class ImageDataFixture {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

const context = {
  Uint8Array,
  Uint8ClampedArray,
  ArrayBuffer,
  TextEncoder,
  crypto: globalThis.crypto,
  ImageData: ImageDataFixture,
  window: { PiXiEEDrawModules: {} },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, { filename: 'gif-import-inspection-utils.js' });
const { inspectGifImportMemoryMetrics } = context.window.PiXiEEDrawModules.gifImportInspectionUtils.createGifImportInspectionUtils();
vm.runInContext(fs.readFileSync(colorCodecPath, 'utf8'), context, { filename: 'color-codec-utils.js' });
vm.runInContext(fs.readFileSync(decodePath, 'utf8'), context, { filename: 'image-import-decode-utils.js' });
const { GifWriter, GifReader } = context.window.PiXiEEDrawModules.colorCodecUtils.createColorCodecUtils({ clamp: (value, min, max) => Math.min(max, Math.max(min, value)) });
const { decodeGifWithReader } = context.window.PiXiEEDrawModules.imageImportDecodeUtils.createImageImportDecodeUtils({
  DEFAULT_IMPORT_FRAME_DURATION: 100,
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  createImageImportError: message => new Error(message),
  GifReader,
});

const rgba = values => new Uint8ClampedArray(values);
const opaque = rgba([255, 0, 0, 255, 0, 255, 0, 255]);
const transparent = rgba([0, 0, 0, 0, 0, 0, 255, 255]);
const changed = rgba([255, 0, 0, 255, 255, 255, 0, 255]);
const fixture = ({ frames, loopCount = null, originalGifBytes = 0 }) => ({
  width: 2,
  height: 1,
  loopCount,
  originalGifBytes,
  frames: frames.map(frame => ({
    duration: frame.duration,
    disposal: frame.disposal,
    imageData: { width: 2, height: 1, data: frame.pixels },
  })),
});

const staticGifFixture = fixture({ frames: [{ pixels: opaque, duration: 100, disposal: 0 }], originalGifBytes: 32 });
const staticMetrics = await inspectGifImportMemoryMetrics(staticGifFixture);
assert.equal(staticMetrics.frameCount, 1);
assert.equal(staticMetrics.bitmapCount, 1);
assert.equal(staticMetrics.uniqueBitmapCount, 1);
assert.equal(staticMetrics.totalTypedBytes, 8);
assert.equal(staticMetrics.dedupePotentialBytes, 0);
assert.equal(staticMetrics.frames[0].durationMs, 100);
assert.equal(staticMetrics.frames[0].disposalMethod, 0);

function buildGifFixture({ loop, frames }) {
  const output = new Uint8Array(2048);
  const writer = new GifWriter(output, 2, 1, { palette: [0x000000, 0xff0000, 0x00ff00, 0x0000ff], ...(loop === undefined ? {} : { loop }) });
  frames.forEach(frame => writer.addFrame(0, 0, 2, 1, new Uint8Array(frame.indices), {
    delay: frame.delay,
    disposal: frame.disposal,
  }));
  return output.slice(0, writer.end());
}

const staticGifBytes = buildGifFixture({ loop: undefined, frames: [{ indices: [1, 2], delay: 0, disposal: 0 }] });
const staticReader = new GifReader(staticGifBytes);
const decodedStatic = decodeGifWithReader(staticGifBytes);
assert.equal(staticReader.numFrames(), 1);
assert.equal(staticReader.loopCount(), null);
assert.equal(decodedStatic.frames[0].duration, 100, 'zero GIF delay uses the existing default duration');

const animatedGifBytes = buildGifFixture({
  loop: 0,
  frames: [
    { indices: [1, 2], delay: 2, disposal: 0 },
    { indices: [1, 2], delay: 4, disposal: 2 },
    { indices: [2, 1], delay: 7, disposal: 3 },
  ],
});
const animatedReader = new GifReader(animatedGifBytes);
const decodedAnimated = decodeGifWithReader(animatedGifBytes);
assert.equal(animatedReader.loopCount(), 0);
assert.deepEqual(Array.from({ length: animatedReader.numFrames() }, (_, index) => animatedReader.frameInfo(index).disposal), [0, 2, 3]);
assert.deepEqual(Array.from(decodedAnimated.frames, frame => frame.duration), [20, 40, 70]);

const upscaledOutput = new Uint8Array(4096);
const upscaledWriter = new GifWriter(upscaledOutput, 4, 2, {
  palette: [0x000000, 0xff0000, 0x00ff00, 0x0000ff],
  loop: 0,
});
upscaledWriter.addFrame(0, 0, 4, 2, new Uint8Array([
  1, 1, 2, 2,
  1, 1, 2, 2,
]), { delay: 8, disposal: 0 });
upscaledWriter.addFrame(0, 0, 4, 2, new Uint8Array([
  2, 2, 3, 3,
  2, 2, 3, 3,
]), { delay: 14, disposal: 0 });
const upscaledGifBytes = upscaledOutput.slice(0, upscaledWriter.end());
const decodedUpscaled = decodeGifWithReader(upscaledGifBytes);
assert.equal(decodedUpscaled.sourceWidth, 4);
assert.equal(decodedUpscaled.sourceHeight, 2);
assert.equal(decodedUpscaled.width, 2);
assert.equal(decodedUpscaled.height, 1);
assert.equal(decodedUpscaled.integerScaleFactor, 2);
assert.equal(decodedUpscaled.frames.length, 2, 'spatial optimization must preserve every GIF frame');
assert.deepEqual(Array.from(decodedUpscaled.frames, frame => frame.duration), [80, 140]);
assert.deepEqual(Array.from(decodedUpscaled.frames[0].imageData.data), [255, 0, 0, 255, 0, 255, 0, 255]);

const mixedScaleOutput = new Uint8Array(8192);
const mixedScaleWriter = new GifWriter(mixedScaleOutput, 8, 4, {
  palette: [0x000000, 0xff0000, 0x00ff00, 0x0000ff],
  loop: 0,
});
mixedScaleWriter.addFrame(0, 0, 8, 4, new Uint8Array([
  1, 1, 1, 1, 2, 2, 2, 2,
  1, 1, 1, 1, 2, 2, 2, 2,
  1, 1, 1, 1, 2, 2, 2, 2,
  1, 1, 1, 1, 2, 2, 2, 2,
]), { delay: 10, disposal: 0 });
mixedScaleWriter.addFrame(0, 0, 8, 4, new Uint8Array([
  1, 1, 2, 2, 3, 3, 2, 2,
  1, 1, 2, 2, 3, 3, 2, 2,
  2, 2, 3, 3, 1, 1, 3, 3,
  2, 2, 3, 3, 1, 1, 3, 3,
]), { delay: 10, disposal: 0 });
const mixedScaleGifBytes = mixedScaleOutput.slice(0, mixedScaleWriter.end());
const decodedMixedScale = decodeGifWithReader(mixedScaleGifBytes);
assert.equal(decodedMixedScale.integerScaleFactor, 2, '8x and 4x-style frames use only their exact common scale');
assert.equal(decodedMixedScale.width, 4);
assert.equal(decodedMixedScale.height, 2);

const inconsistentScaleOutput = new Uint8Array(8192);
const inconsistentScaleWriter = new GifWriter(inconsistentScaleOutput, 8, 4, {
  palette: [0x000000, 0xff0000, 0x00ff00, 0x0000ff],
  loop: 0,
});
inconsistentScaleWriter.addFrame(0, 0, 8, 4, new Uint8Array([
  1, 1, 1, 1, 2, 2, 2, 2,
  1, 1, 1, 1, 2, 2, 2, 2,
  1, 1, 1, 1, 2, 2, 2, 2,
  1, 1, 1, 1, 2, 2, 2, 2,
]), { delay: 10, disposal: 0 });
inconsistentScaleWriter.addFrame(0, 0, 8, 4, new Uint8Array([
  1, 2, 1, 2, 1, 2, 1, 2,
  2, 1, 2, 1, 2, 1, 2, 1,
  1, 2, 1, 2, 1, 2, 1, 2,
  2, 1, 2, 1, 2, 1, 2, 1,
]), { delay: 10, disposal: 0 });
const inconsistentScaleGifBytes = inconsistentScaleOutput.slice(0, inconsistentScaleWriter.end());
const decodedInconsistentScale = decodeGifWithReader(inconsistentScaleGifBytes);
assert.equal(decodedInconsistentScale.integerScaleFactor, 1, 'one native-pixel frame disables unsafe spatial optimization');
assert.equal(decodedInconsistentScale.width, 8);
assert.equal(decodedInconsistentScale.height, 4);

const manyFrameOutput = new Uint8Array(65536);
const manyFrameWriter = new GifWriter(manyFrameOutput, 4, 2, {
  palette: [0x000000, 0xff0000, 0x00ff00, 0x0000ff],
  loop: 0,
});
for (let frameIndex = 0; frameIndex < 204; frameIndex += 1) {
  manyFrameWriter.addFrame(0, 0, 4, 2, new Uint8Array(frameIndex % 2 === 0 ? [
    1, 1, 2, 2,
    1, 1, 2, 2,
  ] : [
    2, 2, 3, 3,
    2, 2, 3, 3,
  ]), { delay: 10, disposal: 0 });
}
const manyFrameGifBytes = manyFrameOutput.slice(0, manyFrameWriter.end());
const decodedManyFrames = decodeGifWithReader(manyFrameGifBytes);
assert.equal(decodedManyFrames.integerScaleFactor, 2);
assert.equal(decodedManyFrames.frames.length, 204, '204 source frames must remain 204 optimized frames');
assert.equal(decodedManyFrames.frames.every(frame => frame.imageData.width === 2 && frame.imageData.height === 1), true);

const animatedDuplicateFixture = fixture({
  loopCount: 0,
  frames: [
    { pixels: opaque, duration: 20, disposal: 1 },
    { pixels: opaque, duration: 40, disposal: 2 },
    { pixels: changed, duration: 70, disposal: 3 },
  ],
});
const duplicateMetrics = await inspectGifImportMemoryMetrics(animatedDuplicateFixture);
assert.equal(duplicateMetrics.loopCount, 0, 'zero is the infinite-loop GIF representation');
assert.equal(duplicateMetrics.bitmapCount, 3);
assert.equal(duplicateMetrics.uniqueBitmapCount, 2);
assert.equal(duplicateMetrics.duplicateBitmapCount, 1);
assert.equal(duplicateMetrics.dedupePotentialBytes, 8);
assert.equal(duplicateMetrics.frames[1].sharesBitmapWithPrevious, true);
assert.deepEqual(Array.from(duplicateMetrics.frames, frame => frame.disposalMethod), [1, 2, 3]);

const transparentMetrics = await inspectGifImportMemoryMetrics(fixture({
  loopCount: null,
  frames: [{ pixels: transparent, duration: 120, disposal: 2 }],
}));
assert.equal(transparentMetrics.loopCount, null, 'missing loop extension stays distinct from infinite looping');
assert.equal(transparent[3], 0, 'transparent fixture remains transparent');
assert.equal(transparentMetrics.frames[0].typedByteLength, 8);
assert.equal(transparentMetrics.frames[0].transparent, true);

const before = Array.from(opaque);
await inspectGifImportMemoryMetrics(staticGifFixture);
assert.deepEqual(Array.from(opaque), before, 'inspection must not mutate input pixels');

const packagedFixture = {
  project: {
    document: {
      canvases: [{
        width: 2,
        height: 1,
        frames: [{ duration: 90, layers: [{ direct: opaque, importSourceDirect: opaque }] }],
      }],
    },
  },
};
const packagedMetrics = await inspectGifImportMemoryMetrics(packagedFixture);
assert.equal(packagedMetrics.bitmapCount, 2, 'runtime imported GIF owns direct and import-source buffers separately');
assert.equal(packagedMetrics.uniqueBitmapCount, 1);
assert.equal(packagedMetrics.dedupePotentialBytes, 8);

const decodeSource = fs.readFileSync(decodePath, 'utf8');
const importSource = fs.readFileSync(importPath, 'utf8');
const codecSource = fs.readFileSync(codecPath, 'utf8');
assert.match(decodeSource, /previousFrameInfo\.disposal === 2/);
assert.match(decodeSource, /previousFrameInfo\.disposal === 3/);
assert.match(decodeSource, /duration:.*delayHundredths \* 10/s);
assert.match(decodeSource, /loopCount: typeof reader\.loopCount/);
assert.match(importSource, /sourceKind: kind === 'gif' \? 'import-gif' : 'import-image'/);
assert.doesNotMatch(importSource, /kind === 'gif'[\s\S]{0,500}normalizeExternalProjectToCanonicalV2/);
assert.match(codecSource, /bitmapTasksByHash/);
assert.match(codecSource, /sha256Hex\(buildBitmapHashSourceBytes/);

console.log('Canonical V2 E4-A GIF audit checks passed');
