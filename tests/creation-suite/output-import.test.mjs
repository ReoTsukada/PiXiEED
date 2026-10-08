import test from 'node:test';
import assert from 'node:assert/strict';
import { fitOutputFrames, importOutputFiles } from '../../js/creation/output-import.mjs';

function localFile(name, bytes) {
  const blob = new Blob([bytes]);
  Object.defineProperties(blob, { name: { value: name }, size: { value: blob.size, configurable: true } });
  return blob;
}

function canvasDocument() {
  return {
    createElement() {
      const canvas = { width: 0, height: 0 };
      const context = {
        imageSmoothingEnabled: true,
        drawImage() {},
        getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4).fill(128) }; }
      };
      canvas.getContext = () => context;
      return canvas;
    }
  };
}

function pngHeader() { return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); }
function gifFile(frameCount = 2, loopCount = 3) {
  const bytes = [...new TextEncoder().encode('GIF89a'), 1, 0, 1, 0, 0, 0, 0];
  if (loopCount !== null) bytes.push(0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, loopCount & 0xff, loopCount >>> 8, 0);
  for (let index = 0; index < frameCount; index += 1) bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0);
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

test('local static images keep pixel data and fit mixed dimensions with transparent padding', async () => {
  const result = await importOutputFiles([
    localFile('wide.png', pngHeader()), localFile('tall.png', pngHeader())
  ], {
    documentRef: canvasDocument(),
    createImageBitmapImpl: async (file) => file.name === 'wide.png'
      ? { width: 2, height: 1, close() {} }
      : { width: 1, height: 2, close() {} }
  });
  assert.equal(result.frames.length, 2);
  assert.deepEqual([result.frames[0].width, result.frames[0].height], [2, 2]);
  assert.deepEqual([result.frames[1].width, result.frames[1].height], [2, 2]);
  assert.equal(result.frames[0].name, 'wide.png');
  assert.equal(result.frames[0].delayMs, 500);
  assert.equal(result.frames[0].data.length, 16);
  assert.equal(result.audio, null);
});

test('later image batches can be normalized into one bounded frame sequence', () => {
  const makeFrame = (width, height, name) => ({ width, height, data: new Uint8Array(width * height * 4).fill(255), delayMs: 500, name });
  const frames = fitOutputFrames([makeFrame(2, 1, 'wide'), makeFrame(1, 2, 'tall')]);
  assert.equal(frames.length, 2);
  assert.deepEqual([frames[0].width, frames[0].height], [2, 2]);
  assert.deepEqual([frames[1].width, frames[1].height], [2, 2]);
  assert.equal(frames[1].name, 'tall');
  assert.throws(() => fitOutputFrames(Array.from({ length: 601 }, () => makeFrame(1, 1, 'too many'))), /600コマ/);
});

test('animated GIF import decodes every frame, retains timing and reads its loop setting', async () => {
  const closed = []; const decodedIndexes = [];
  class FakeImageDecoder {
    static isTypeSupported(type) { return type === 'image/gif'; }
    constructor({ type }) {
      assert.equal(type, 'image/gif');
      this.tracks = { ready: Promise.resolve(), selectedTrack: { animated: true, frameCount: 2 } };
    }
    async decode({ frameIndex }) {
      decodedIndexes.push(frameIndex);
      return { image: { displayWidth: 2, displayHeight: 1, duration: (frameIndex + 1) * 100_000, close() { closed.push(frameIndex); } } };
    }
    close() { closed.push('decoder'); }
  }
  const result = await importOutputFiles([localFile('walk.gif', gifFile())], {
    ImageDecoderImpl: FakeImageDecoder, documentRef: canvasDocument(), createImageBitmapImpl: () => { throw new Error('animated fallback must not run'); }
  });
  assert.deepEqual(decodedIndexes, [0, 1]);
  assert.deepEqual(result.frames.map((frame) => frame.delayMs), [100, 200]);
  assert.equal(result.loopCount, 3);
  assert.deepEqual(closed, [0, 1, 'decoder']);
});

test('animated input fails clearly when complete-frame decoding is unavailable', async () => {
  let usedStaticDecoder = false;
  class UnsupportedDecoder { static isTypeSupported() { return false; } }
  await assert.rejects(importOutputFiles([localFile('walk.gif', gifFile())], {
    ImageDecoderImpl: UnsupportedDecoder, documentRef: canvasDocument(), createImageBitmapImpl: async () => { usedStaticDecoder = true; return { width: 1, height: 1, close() {} }; }
  }), /全コマ/);
  assert.equal(usedStaticDecoder, false);
});

test('single-frame GIF imports as a still image without requiring the animation decoder', async () => {
  let decoderCreated = false; let bitmapClosed = false;
  const result = await importOutputFiles([localFile('still.gif', gifFile(1, null))], {
    ImageDecoderImpl: class { static isTypeSupported() { decoderCreated = true; return true; } },
    documentRef: canvasDocument(),
    createImageBitmapImpl: async () => ({ width: 1, height: 1, close() { bitmapClosed = true; } })
  });
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].delayMs, 500);
  assert.equal(result.loopCount, 0);
  assert.equal(decoderCreated, false);
  assert.equal(bitmapClosed, true);
});

test('animated WebP reads ANIM loop count and decodes every frame with ImageDecoder', async () => {
  const bytes = new Uint8Array(44);
  const text = (offset, value) => [...value].forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0); });
  const u32le = (offset, value) => { bytes[offset] = value; bytes[offset + 1] = value >> 8; bytes[offset + 2] = value >> 16; bytes[offset + 3] = value >> 24; };
  text(0, 'RIFF'); u32le(4, bytes.length - 8); text(8, 'WEBP');
  text(12, 'VP8X'); u32le(16, 10); bytes[20] = 0x02;
  text(30, 'ANIM'); u32le(34, 6); bytes[42] = 4;
  const indexes = [];
  class FakeImageDecoder {
    static isTypeSupported(type) { return type === 'image/webp'; }
    constructor({ type }) { assert.equal(type, 'image/webp'); this.tracks = { ready: Promise.resolve(), selectedTrack: { animated: true, frameCount: 2 } }; }
    async decode({ frameIndex }) { indexes.push(frameIndex); return { image: { displayWidth: 1, displayHeight: 1, duration: 100_000, close() {} } }; }
    close() {}
  }
  const result = await importOutputFiles([localFile('loop.webp', bytes)], { ImageDecoderImpl: FakeImageDecoder, documentRef: canvasDocument() });
  assert.deepEqual(indexes, [0, 1]);
  assert.equal(result.loopCount, 4);
});

test('decoded audio is stored as PCM channels and the decode context is released', async () => {
  let closed = 0;
  class FakeAudioContext {
    async decodeAudioData() {
      return { duration: 0.5, length: 4, numberOfChannels: 1, sampleRate: 8000, getChannelData: () => new Float32Array([0, 0.5, -0.5, 0]) };
    }
    async close() { closed += 1; }
  }
  const result = await importOutputFiles([localFile('voice.bin', new TextEncoder().encode('local audio bytes'))], { AudioContextImpl: FakeAudioContext });
  assert.equal(result.frames.length, 0);
  assert.equal(result.audio.durationSeconds, 0.5);
  assert.equal(result.audio.sampleRate, 8000);
  assert.deepEqual([...result.audio.channels[0]], [0, 0.5, -0.5, 0]);
  assert.equal(closed, 1);
});

test('input limits and unsupported files fail before any media state is returned', async () => {
  const tooMany = Array.from({ length: 9 }, (_, index) => localFile(`${index}.png`, pngHeader()));
  await assert.rejects(importOutputFiles(tooMany), /8ファイル/);
  await assert.rejects(importOutputFiles([localFile('active.svg', new TextEncoder().encode('<svg><script>bad()</script></svg>'))], {
    AudioContextImpl: class { async decodeAudioData() { throw new Error('not audio'); } async close() {} }
  }), /not audio/);
});

test('oversized image is rejected before its complete bytes or a decoder are read', async () => {
  const oversized = localFile('large.png', pngHeader());
  Object.defineProperty(oversized, 'size', { value: 64 * 1024 * 1024 + 1 });
  let completeBytesRead = false; let imageDecoderCalled = false;
  oversized.arrayBuffer = async () => { completeBytesRead = true; throw new Error('full image read before size check'); };
  await assert.rejects(importOutputFiles([oversized], {
    ImageDecoderImpl: class { constructor() { imageDecoderCalled = true; } },
    createImageBitmapImpl: async () => { imageDecoderCalled = true; return { width: 1, height: 1, close() {} }; }
  }), /64MB/);
  assert.equal(completeBytesRead, false);
  assert.equal(imageDecoderCalled, false);
});
