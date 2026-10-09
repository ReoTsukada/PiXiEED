import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedPreviewDimensions, createBoundedRasterPreview, fitOutputFrames, importOutputFiles, resolveRasterPreviewDimensions } from '../../js/creation/output-import.mjs';

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

test('bounded preview dimensions keep extreme portrait and landscape images inside edge and pixel caps', () => {
  for (const [width, height] of [[8192, 1024], [1024, 8192], [4096, 4096]]) {
    const result = boundedPreviewDimensions(width, height, { maxEdge: 1024, maxPixels: 500_000 });
    assert.ok(result.width <= 1024 && result.height <= 1024);
    assert.ok(result.width * result.height <= 500_000);
    assert.ok(Math.abs(result.width / result.height - width / height) <= 1 / Math.max(result.width, result.height));
  }
});

test('preview dimensions fall back through item, current, and record metadata when item metadata is empty', () => {
  assert.deepEqual(resolveRasterPreviewDimensions({
    itemMetadata: {}, currentMetadata: {}, recordMetadata: { width: 4000, height: 3000, previewOnly: true }
  }), { width: 4000, height: 3000 });
  assert.deepEqual(resolveRasterPreviewDimensions({
    itemMetadata: {}, currentMetadata: { outputWidth: 1000, outputHeight: 750 }, recordMetadata: { width: 4000, height: 3000 }
  }), { width: 1000, height: 750 });
  assert.deepEqual(resolveRasterPreviewDimensions({
    itemMetadata: { width: 8, height: 8 }, currentMetadata: { width: 16, height: 16 }, recordMetadata: { width: 4000, height: 3000 }, sourceMatches: false
  }), { width: 16, height: 16 });
});

test('downsample preview requests decoder resize and allocates only a bounded canvas', async () => {
  const calls = []; let bitmapClosed = false; let canvas;
  const sourceBlob = new Blob(['original source bytes'], { type: 'image/png' });
  const preview = await createBoundedRasterPreview(sourceBlob, {
    width: 4096, height: 2048, maxEdge: 1024, maxPixels: 500_000,
    createImageBitmapImpl: async (blob, options) => {
      assert.equal(blob, sourceBlob);
      calls.push(options);
      return { width: options.resizeWidth, height: options.resizeHeight, close() { bitmapClosed = true; } };
    },
    documentRef: { createElement() {
      canvas = { width: 0, height: 0, getContext() { return { drawImage(bitmap, x, y, width, height) { calls.push([bitmap.width, bitmap.height, x, y, width, height]); } }; }, toBlob(callback, mime) { callback(new Blob(['preview'], { type: mime })); } };
      return canvas;
    } }
  });
  assert.equal(preview.type, 'image/png');
  assert.deepEqual(calls[0], { resizeWidth: 1000, resizeHeight: 500, resizeQuality: 'high' });
  assert.deepEqual(calls[1], [1000, 500, 0, 0, 1000, 500]);
  assert.equal(bitmapClosed, true);
  assert.deepEqual([canvas.width, canvas.height], [1, 1]);
  assert.equal(await sourceBlob.text(), 'original source bytes');
});

test('preview decoder/allocation failures remain explicit and reject unsafe bitmap dimensions', async () => {
  await assert.rejects(createBoundedRasterPreview(new Blob(['x']), { width: 10, height: 10, createImageBitmapImpl: null }), /縮小プレビュー/);
  await assert.rejects(createBoundedRasterPreview(new Blob(['x']), {
    width: 4096, height: 4096, maxEdge: 512, maxPixels: 300_000,
    createImageBitmapImpl: async () => ({ width: 4096, height: 4096, close() {} }),
    documentRef: canvasDocument()
  }), /安全なサイズ/);
});

function pngHeader(width = 1, height = 1, { animatedFrames = null, totalPlays = 1 } = {}) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const chunk = (name, data) => {
    const result = new Uint8Array(data.length + 12); new DataView(result.buffer).setUint32(0, data.length);
    [...name].forEach((char, index) => { result[index + 4] = char.charCodeAt(0); }); result.set(data, 8); return result;
  };
  const ihdr = new Uint8Array(13); const view = new DataView(ihdr.buffer); view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array(signature), chunk('IHDR', ihdr)];
  if (animatedFrames !== null) { const actl = new Uint8Array(8); const actlView = new DataView(actl.buffer); actlView.setUint32(0, animatedFrames); actlView.setUint32(4, totalPlays); parts.push(chunk('acTL', actl)); }
  parts.push(chunk('IDAT', new Uint8Array([0])), chunk('IEND', new Uint8Array()));
  const output = new Uint8Array(parts.reduce((sum, item) => sum + item.length, 0)); let offset = 0;
  for (const item of parts) { output.set(item, offset); offset += item.length; } return output;
}

function typedFile(name, bytes, type) {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}

function jpegHeader(width, height) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff,
    width >> 8, width & 0xff, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9]);
}

test('static PNG above the editing cap enters preview-only without invoking a decoder', async () => {
  let decoderCalled = false;
  const file = typedFile('large.png', pngHeader(4096, 2048), 'image/png');
  const result = await importOutputFiles([file], { createImageBitmapImpl: () => { decoderCalled = true; } });
  assert.deepEqual(result.frames, []);
  assert.equal(result.previewOnly.file, file);
  assert.deepEqual([result.previewOnly.width, result.previewOnly.height], [4096, 2048]);
  assert.equal(decoderCalled, false);
});

test('static JPEG preview-only preflight scans bounded header and retains the original Blob', async () => {
  let decoderCalled = false;
  const file = typedFile('photo.jpg', jpegHeader(4000, 3000), 'image/jpeg');
  const result = await importOutputFiles([file], { createImageBitmapImpl: () => { decoderCalled = true; } });
  assert.equal(result.previewOnly.file, file);
  assert.equal(result.previewOnly.mime, 'image/jpeg');
  assert.deepEqual([result.previewOnly.width, result.previewOnly.height], [4000, 3000]);
  assert.equal(decoderCalled, false);
});

test('preview-only preflight rejects animated PNG, over-limit dimensions, and oversized compressed files before decode', async () => {
  const deps = { createImageBitmapImpl: () => { throw new Error('decoder must not run'); } };
  await assert.rejects(importOutputFiles([typedFile('motion.png', pngHeader(4096, 2048, { animatedFrames: 2 }), 'image/png')], deps), /アニメーションPNG/);
  await assert.rejects(importOutputFiles([typedFile('too-wide.png', pngHeader(4097, 2048), 'image/png')], deps), /各辺4096px/);
  await assert.rejects(importOutputFiles([typedFile('too-many-pixels.png', pngHeader(4000, 4001), 'image/png')], deps), /1,600万画素/);
  const huge = {
    name: 'compressed.png', type: 'image/png', size: 32 * 1024 * 1024 + 1,
    slice(start, end) { return new Blob([pngHeader(4096, 2048).slice(start, end)]); },
    async arrayBuffer() { throw new Error('full compressed source must not be read'); }
  };
  await assert.rejects(importOutputFiles([huge], deps), /圧縮ファイル32MiB/);
});

test('preview-only images cannot be mixed with other selections', async () => {
  const large = typedFile('large.png', pngHeader(4096, 2048), 'image/png');
  const small = typedFile('small.png', pngHeader(), 'image/png');
  let decoderCalled = false;
  await assert.rejects(importOutputFiles([large, small], {
    createImageBitmapImpl: async () => { decoderCalled = true; return { width: 1, height: 1, close() {} }; },
    documentRef: canvasDocument()
  }), /1ファイルずつ/);
  assert.equal(decoderCalled, false);
});
function gifFile(frameCount = 2, repeats = 3, width = 1, height = 1) {
  const bytes = [...new TextEncoder().encode('GIF89a'), width & 0xff, width >>> 8, height & 0xff, height >>> 8, 0, 0, 0];
  if (repeats !== null) bytes.push(0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, repeats & 0xff, repeats >>> 8, 0);
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

test('video import keeps only a locally decoded, bounded MP4/WebM Blob and reads an actual poster frame', async () => {
  const file = new Blob(['local-video'], { type: 'video/webm' });
  Object.defineProperty(file, 'name', { value: 'clip.webm' });
  const revoked = []; const urls = [];
  class FakeVideo {
    constructor() { this.listeners = new Map(); this.readyState = 0; this.videoWidth = 320; this.videoHeight = 180; this.duration = 2.5; }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    removeEventListener(type) { this.listeners.delete(type); }
    emit(type) { this.listeners.get(type)?.(); }
    load() { this.readyState = 1; this.emit('loadedmetadata'); }
    set currentTime(value) { this.time = value; this.readyState = 2; this.emit('seeked'); }
    pause() {}
    removeAttribute() {}
  }
  const result = await importOutputFiles([file], {
    documentRef: { createElement: (tag) => tag === 'video' ? new FakeVideo() : canvasDocument().createElement(tag) },
    URLImpl: { createObjectURL(blob) { urls.push(blob); return 'blob:local-only'; }, revokeObjectURL(url) { revoked.push(url); } }
  });
  assert.equal(result.video.mime, 'video/webm'); assert.equal(result.video.durationSeconds, 2.5);
  assert.equal(result.video.blob, file); assert.equal(result.video.poster.data.length, 320 * 180 * 4);
  assert.equal(urls[0], file); assert.deepEqual(revoked, ['blob:local-only']);
});

test('video import rejects unsupported types, oversize files, and durations over two minutes', async () => {
  const fakeDeps = { documentRef: { createElement: () => ({}) }, URLImpl: { createObjectURL: () => 'blob:x', revokeObjectURL() {} } };
  const wrong = new Blob(['not video'], { type: 'video/quicktime' }); Object.defineProperty(wrong, 'name', { value: 'clip.mov' });
  await assert.rejects(importOutputFiles([wrong], fakeDeps), /対応していない形式/);
  const large = new Blob([new Uint8Array(64 * 1024 * 1024 + 1)], { type: 'video/mp4' }); Object.defineProperty(large, 'name', { value: 'large.mp4' });
  await assert.rejects(importOutputFiles([large], fakeDeps), /64MB/);
  const tooLong = new Blob(['local-video'], { type: 'video/mp4' }); Object.defineProperty(tooLong, 'name', { value: 'long.mp4' });
  class LongVideo {
    constructor() { this.listeners = new Map(); this.readyState = 0; this.videoWidth = 1; this.videoHeight = 1; this.duration = 120.1; }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    removeEventListener(type) { this.listeners.delete(type); }
    load() { this.readyState = 1; this.listeners.get('loadedmetadata')?.(); }
    pause() {} removeAttribute() {}
  }
  await assert.rejects(importOutputFiles([tooLong], { ...fakeDeps, documentRef: { createElement: () => new LongVideo() } }), /120秒/);
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

test('animated GIF import normalizes Netscape repeat extensions to total plays', async () => {
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
  assert.equal(result.totalPlays, 4);
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
  assert.equal(result.totalPlays, 1);
  assert.equal(decoderCreated, false);
  assert.equal(bitmapClosed, true);
});

test('animated WebP retains ANIM total-play count and decodes every frame', async () => {
  const bytes = new Uint8Array(92);
  const text = (offset, value) => [...value].forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0); });
  const u32le = (offset, value) => { bytes[offset] = value; bytes[offset + 1] = value >> 8; bytes[offset + 2] = value >> 16; bytes[offset + 3] = value >> 24; };
  text(0, 'RIFF'); u32le(4, bytes.length - 8); text(8, 'WEBP');
  text(12, 'VP8X'); u32le(16, 10); bytes[20] = 0x02; bytes[24] = 0; bytes[27] = 0; bytes[30] = 0;
  text(30, 'ANIM'); u32le(34, 6); bytes[42] = 4;
  text(44, 'ANMF'); u32le(48, 16); text(68, 'ANMF'); u32le(72, 16);
  const indexes = [];
  class FakeImageDecoder {
    static isTypeSupported(type) { return type === 'image/webp'; }
    constructor({ type }) { assert.equal(type, 'image/webp'); this.tracks = { ready: Promise.resolve(), selectedTrack: { animated: true, frameCount: 2 } }; }
    async decode({ frameIndex }) { indexes.push(frameIndex); return { image: { displayWidth: 1, displayHeight: 1, duration: 100_000, close() {} } }; }
    close() {}
  }
  const result = await importOutputFiles([localFile('loop.webp', bytes)], { ImageDecoderImpl: FakeImageDecoder, documentRef: canvasDocument() });
  assert.deepEqual(indexes, [0, 1]);
  assert.equal(result.totalPlays, 4);
  for (const totalPlays of [0, 1, 2]) {
    const variant = bytes.slice(); variant[42] = totalPlays; variant[43] = 0;
    const imported = await importOutputFiles([localFile('loop.webp', variant)], { ImageDecoderImpl: FakeImageDecoder, documentRef: canvasDocument() });
    assert.equal(imported.totalPlays, totalPlays);
  }
});

test('GIF missing extension means one play, raw repeats map to total plays, and APNG/WebP play counts are total', async () => {
  class FakeImageDecoder {
    static isTypeSupported() { return true; }
    constructor({ type }) { this.tracks = { ready: Promise.resolve(), selectedTrack: { animated: true, frameCount: 2 } }; this.type = type; }
    async decode() { return { image: { displayWidth: 1, displayHeight: 1, duration: 100_000, close() {} } }; }
    close() {}
  }
  for (const [repeatField, expected] of [[null, 1], [0, 0], [1, 2], [3, 4]]) {
    const result = await importOutputFiles([localFile('loop.gif', gifFile(2, repeatField))], { ImageDecoderImpl: FakeImageDecoder, documentRef: canvasDocument() });
    assert.equal(result.totalPlays, expected);
  }
  const apng = await importOutputFiles([localFile('loop.png', pngHeader(1, 1, { animatedFrames: 2, totalPlays: 2 }))], { ImageDecoderImpl: FakeImageDecoder, documentRef: canvasDocument() });
  assert.equal(apng.totalPlays, 2);
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

test('oversized PNG dimensions and animation aggregate are rejected before decoder creation', async () => {
  let decoderCreated = false;
  class Decoder { static isTypeSupported() { return true; } constructor() { decoderCreated = true; } }
  await assert.rejects(importOutputFiles([localFile('huge.png', pngHeader(4097, 1))], {
    ImageDecoderImpl: Decoder, createImageBitmapImpl: async () => { decoderCreated = true; return { width: 1, height: 1, close() {} }; }
  }), /ヘッダー情報/);
  await assert.rejects(importOutputFiles([localFile('huge-animation.png', pngHeader(2000, 2000, { animatedFrames: 3 }))], {
    ImageDecoderImpl: Decoder, createImageBitmapImpl: async () => { decoderCreated = true; return { width: 1, height: 1, close() {} }; }
  }), /展開サイズ/);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 1, 0x10, 1, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9]);
  await assert.rejects(importOutputFiles([localFile('wide.jpg', jpeg)], {
    ImageDecoderImpl: Decoder, createImageBitmapImpl: async () => { decoderCreated = true; return { width: 1, height: 1, close() {} }; }
  }), /ヘッダー情報/);
  await assert.rejects(importOutputFiles([localFile('wide.gif', gifFile(1, null, 4097, 1))], {
    ImageDecoderImpl: Decoder, createImageBitmapImpl: async () => { decoderCreated = true; return { width: 1, height: 1, close() {} }; }
  }), /ヘッダー情報/);
  const webp = new Uint8Array(30); webp.set(new TextEncoder().encode('RIFF'), 0); new DataView(webp.buffer).setUint32(4, 22, true); webp.set(new TextEncoder().encode('WEBPVP8X'), 8); new DataView(webp.buffer).setUint32(16, 10, true); webp[25] = 0x10;
  await assert.rejects(importOutputFiles([localFile('wide.webp', webp)], {
    ImageDecoderImpl: Decoder, createImageBitmapImpl: async () => { decoderCreated = true; return { width: 1, height: 1, close() {} }; }
  }), /ヘッダー情報/);
  assert.equal(decoderCreated, false);
});

test('known WAV duration is bounded before decodeAudioData starts', async () => {
  const durationSeconds = 121; const dataBytes = durationSeconds * 48_000;
  const bytes = new Uint8Array(44 + dataBytes); const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF'), 0); view.setUint32(4, bytes.length - 8, true); bytes.set(new TextEncoder().encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 48_000, true); view.setUint32(28, 48_000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  bytes.set(new TextEncoder().encode('data'), 36); view.setUint32(40, dataBytes, true);
  let decoded = false;
  await assert.rejects(importOutputFiles([localFile('long.wav', bytes)], {
    AudioContextImpl: class { async decodeAudioData() { decoded = true; throw new Error('decode should not run'); } async close() {} }
  }), /120秒/);
  assert.equal(decoded, false);
});

test('MP3 frame headers estimate duration before decodeAudioData starts', async () => {
  const frameLength = 104; const frameCount = 4601; const bytes = new Uint8Array(frameLength * frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) bytes.set([0xff, 0xfb, 0x10, 0x64], frame * frameLength);
  let decoded = false;
  await assert.rejects(importOutputFiles([localFile('long.mp3', bytes)], {
    AudioContextImpl: class { async decodeAudioData() { decoded = true; throw new Error('decode should not run'); } async close() {} }
  }), /120秒/);
  assert.equal(decoded, false);
});

test('unknown encoded audio is capped before its full bytes are read', async () => {
  const unknown = localFile('unknown.audio', new Uint8Array(32));
  Object.defineProperty(unknown, 'size', { value: 4 * 1024 * 1024 + 1 });
  let fullRead = false; let decoded = false;
  unknown.arrayBuffer = async () => { fullRead = true; throw new Error('full unknown audio read'); };
  await assert.rejects(importOutputFiles([unknown], {
    AudioContextImpl: class { async decodeAudioData() { decoded = true; throw new Error('decode should not run'); } async close() {} }
  }), /4MB/);
  assert.equal(fullRead, false); assert.equal(decoded, false);
});
