import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../js/creation/output-page.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function captureOutputEncoderContext(');
const end = source.indexOf('function isStaticOutputFormat(', start);
assert.ok(start >= 0 && end > start);
const encoderSource = source.slice(start, end).replace(/await import\((['"])(.*?)\1\)/g, 'await Promise.resolve(__modules["$2"])');

function harness(overrides = {}) {
  const calls = [];
  const frame = (delayMs) => ({ width: 2, height: 1, data: new Uint8Array(8), delayMs });
  const context = {
    generationProgress: { value: 0 }, DOMException,
    mediaSettings: { playbackRate: 2, totalPlays: 3, musicTotalPlays: 4 },
    stillFrameSelect: { value: '1' },
    pngBackgroundMode: { value: 'transparent' }, pngBackgroundColor: { value: '#123456' },
    gifBackgroundMode: { value: 'color' }, gifBackgroundColor: { value: '#abcdef' },
    jpegQuality: { value: '73' },
    $: () => ({ value: '#fedcba' }),
    selectedMusicSource: () => null, audioBufferSource: () => null,
    chooseAudioVideoMimeType: () => ({ extension: 'webm', mimeType: 'video/webm' }),
    getOutputTiming: (frames, options) => { calls.push(['timing', options]); return { frameDelaysMs: frames.map(f => {
      const scaled = Math.round(f.delayMs / options.playbackRate);
      return options.format === 'gif' ? Math.max(20, Math.round(scaled / 10) * 10) : Math.max(1, scaled);
    }) }; },
    encodeOutput: async (options, dependencies) => { calls.push(['raster', options, dependencies]); dependencies.onProgress(0.8); return new Blob(['gif'], { type: 'image/gif' }); },
    canvasRaster: () => {}, isStaticOutputFormat: value => ['png','jpeg','webp','svg'].includes(value),
    isAnimatedOutputFormat: value => ['gif','apng'].includes(value),
    listAudioOutputFormats: () => [{ value: 'ogg', available: true }],
    outputMime: value => ({ webm: 'video/webm', mp4: 'video/mp4', wav: 'audio/wav', ogg: 'audio/ogg' })[value],
    validateVideoOutputSize: size => size ? { width: size.width, height: size.height } : null,
    renderSongAudioSource: async (song, plays, signal) => ({ song, plays, signal }),
    __modules: {}, calls,
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(`${encoderSource}\nglobalThis.captureOutputEncoderContext = captureOutputEncoderContext; globalThis.createOutputBlob = createOutputBlob;`, context);
  return { context, calls, frame };
}

function controller() { return new AbortController(); }
function readonlyContext(source, format, extra = {}) {
  return { source, format, dimensions: { width: 8, height: 4 }, frames: source.mediaSource?.frames || [], playbackRate: 2,
    totalPlays: 3, selectedFrame: 1, jpegBackground: '#fedcba', pngBackground: 'transparent', gifBackground: '#abcdef',
    quality: 0.73, selectedMusic: null, importedAudio: null, mimeChoice: { extension: 'webm', mimeType: 'video/webm' },
    musicTotalPlays: 4, onProgress: () => {}, ...extra };
}

test('captured raster path preserves GIF/APNG frame timing, playback rate, loop settings, and still selection', async () => {
  for (const format of ['gif', 'apng']) {
    const { context, calls, frame } = harness();
    const frames = [frame(120), frame(240)];
    const result = await context.createOutputBlob(readonlyContext({ kind: 'rgba-frames', mediaSource: { frames } }, format), controller());
    const timing = calls.find(call => call[0] === 'timing')[1];
    const encoded = calls.find(call => call[0] === 'raster')[1];
    assert.equal(timing.format, format); assert.equal(timing.playbackRate, 2);
    assert.deepEqual(encoded.frames.map(item => item.delayMs), [60, 120]);
    assert.equal(encoded.totalPlays, 3);
    assert.equal(result.blob.type, 'image/gif');
    assert.equal(context.generationProgress.value, 0);
  }
  const { context, calls, frame } = harness();
  await context.createOutputBlob(readonlyContext({ kind: 'rgba-frames', mediaSource: { frames: [frame(100), frame(100)] } }, 'png'), controller());
  const staticOptions = calls.find(call => call[0] === 'raster')[1];
  assert.equal(staticOptions.frames.length, 1);
  assert.equal(staticOptions.frames[0].delayMs, 50);
  assert.equal(staticOptions.background, '#fedcba');
  assert.equal(staticOptions.quality, 0.73);
});

test('captured audio branches return real encoder blobs and pass abort/progress hooks without touching page progress in preview mode', async () => {
  for (const format of ['wav', 'ogg']) {
    const { context, calls } = harness();
    const audio = { kind: 'audio-buffer', channels: [new Float32Array(20)], sampleRate: 22050, durationSeconds: 2 };
    context.__modules['./audio-export.mjs?rev=20261024-free-tools-1'] = { encodeImportedAudioWav: async (src, opts) => { calls.push(['wav', src, opts]); opts.onProgress(0.9); return new Blob(['wav'], { type: 'audio/wav' }); } };
    context.__modules['./output-audio-encode.mjs?rev=20261024-free-tools-1'] = { encodeNativeAudio: async (src, opts) => { calls.push(['native', src, opts]); opts.onProgress(0.9); return { blob: new Blob(['ogg'], { type: 'audio/ogg' }), seconds: 2, sourceSeconds: 2, paddingSeconds: 0.12 }; } };
    context.listAudioOutputFormats = () => [{ value: 'ogg', available: true }];
    const ac = controller();
    const result = await context.createOutputBlob(readonlyContext(audio, format), ac);
    assert.equal(result.blob.size > 0, true);
    assert.equal(calls[0][1], audio);
    assert.equal(calls[0][2].signal, ac.signal);
    assert.equal(typeof calls[0][2].onProgress, 'function');
  }
});

test('captured video path uses the snapshotted music source, repeat count, speed, and MIME choice', async () => {
  const observed = [];
  const { context } = harness({
    renderSongAudioSource: async (selected, plays) => ({ selected, plays }),
    __modules: { './output-video.mjs?rev=20261105-video-size-1': { renderOutputVideo: async (frames, options) => {
      observed.push({ frames, options });
      options.onProgress(0.9);
      return { blob: new Blob(['webm'], { type: 'video/webm' }), extension: 'webm', hasAudio: true, seconds: 1, width: 2, height: 1 };
    } } },
  });
  const song = { id: 'music-1', song: { sampleRate: 44100 } };
  const frames = [{ width: 2, height: 1, data: new Uint8Array(8), delayMs: 120 }];
  const result = await context.createOutputBlob(readonlyContext({ kind: 'rgba-frames', mediaSource: { frames } }, 'webm', { selectedMusic: song, importedAudio: null }), controller());
  assert.equal(result.blob.type, 'video/webm');
  assert.equal(observed[0].options.playbackRate, 2);
  assert.deepEqual(observed[0].options.mimeChoice, { extension: 'webm', mimeType: 'video/webm' });
  assert.equal(observed[0].options.audioSource.plays, 4);
  assert.equal(observed[0].options.audioTotalPlays, undefined);
  assert.equal(context.generationProgress.value, 0);
});

test('captured native video audio parameters and cancellation are honored', async () => {
  const observed = [];
  const { context } = harness({
    __modules: { './output-video.mjs?rev=20261105-video-size-1': { renderOutputVideo: async (_frames, options) => {
      observed.push(options); return { blob: new Blob(['webm'], { type: 'video/webm' }), extension: 'webm', hasAudio: true, seconds: 1, width: 2, height: 1 };
    } } },
  });
  const imported = { kind: 'audio-buffer', channels: [new Float32Array(10)] };
  await context.createOutputBlob(readonlyContext({ kind: 'rgba-frames', mediaSource: { frames: [{ width: 2, height: 1, data: new Uint8Array(8) }] } }, 'webm', { importedAudio: imported }), controller());
  assert.equal(observed[0].audioSource, imported);
  assert.equal(observed[0].audioTotalPlays, 4);
  context.__modules['./audio-export.mjs?rev=20261024-free-tools-1'] = { encodeImportedAudioWav: async () => new Blob(['wav']) };
  const ac = controller(); ac.abort();
  await assert.rejects(context.createOutputBlob(readonlyContext({ kind: 'audio-buffer', channels: [], sampleRate: 1 }, 'wav'), ac), { name: 'AbortError' });
});

test('audio-video song and buffer renderers both receive the captured explicit output size', async () => {
  for (const [selectedMusic, modulePath, rendererName] of [
    [{ song: { sampleRate: 44100 } }, './audio-video.mjs?rev=20261105-video-size-1', 'renderAudioVideo'],
    [{ kind: 'audio-buffer', channels: [new Float32Array(10)], sampleRate: 10 }, './output-video.mjs?rev=20261105-video-size-1', 'renderOutputVideo'],
  ]) {
    let receivedSize;
    const { context } = harness({ __modules: { [modulePath]: { [rendererName]: async (...args) => {
      receivedSize = rendererName === 'renderAudioVideo' ? args[2].outputSize : args[1].outputSize;
      return { blob: new Blob(['webm'], { type: 'video/webm' }), extension: 'webm', hasAudio: true, seconds: 1, width: 64, height: 64 };
    } } } });
    const image = { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4) };
    const audioVideo = readonlyContext({ kind: 'audio-video', image }, 'webm', { dimensions: { width: 64, height: 64 }, selectedMusic });
    await context.createOutputBlob(audioVideo, controller());
    assert.equal(receivedSize.width, 64); assert.equal(receivedSize.height, 64);
  }
});

test('encoder capture freezes controls and source selection before asynchronous encoding, with an isolated progress callback', async () => {
  const chosenMusic = { id: 'music-captured', song: { sampleRate: 44100 } };
  const frame = { width: 2, height: 1, data: new Uint8Array(8), delayMs: 200 };
  const { context, calls } = harness({ selectedMusicSource: () => chosenMusic });
  const source = { id: 'images-1', kind: 'rgba-frames', mediaSource: { frames: [frame], totalPlays: 6 } };
  const captured = context.captureOutputEncoderContext(source, 'gif', { width: 12, height: 6 }, { onProgress: () => {} });
  context.mediaSettings.playbackRate = 0.5;
  context.mediaSettings.totalPlays = 99;
  context.gifBackgroundColor.value = '#000000';
  const result = await context.createOutputBlob(captured, controller());
  const encoded = calls.find(call => call[0] === 'raster')[1];
  assert.equal(encoded.totalPlays, 3);
  assert.equal(encoded.gifBackground, '#abcdef');
  assert.equal(captured.playbackRate, 2);
  assert.equal(captured.selectedMusic, chosenMusic);
  assert.equal(captured.dimensions.width, 12); assert.equal(captured.dimensions.height, 6);
  assert.equal(context.generationProgress.value, 0);
  assert.equal(result.blob.size > 0, true);
});

function previewWrapperHarness(overrides = {}) {
  const context = harness(overrides).context;
  const previewStart = source.indexOf('  async previewOutput({ signal, pendingFps = false, pendingSize = false } = {}) {');
  const previewEnd = source.indexOf('\n  getMaterialState:', previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  let method = source.slice(previewStart, previewEnd).replace(/^  async previewOutput\(\{ signal, pendingFps = false, pendingSize = false \} = \{\}\) \{/, 'globalThis.previewOutput = async ({ signal, pendingFps = false, pendingSize = false } = {}) => {');
  method = method.replace(/\n  \},\s*$/, '\n};');
  Object.assign(context, {
    AbortController, DOMException, resizeRgbaNearest: (frame, width, height) => { const data = new Uint8ClampedArray(width * height * 4); for (let i = 0; i < data.length; i += 4) data.set(frame.data.subarray(0,4), i); return { width, height, data }; }, fpsInput: { value: '30' }, outputFpsToDelayMs: (fps, options) => { const delay = 1000 / fps; if (!Number.isFinite(fps) || delay < options.minDelayMs || delay > options.maxDelayMs) throw new RangeError('invalid FPS'); return delay; },
    outputLayout: { conversionActions: { previewCapability: () => ({ supported: true, format: context.formatSelect.value }) } },
    formatSelect: { value: 'gif' }, activeSource: null, activeItem: null,
    record: { source: 'user', metadata: {} }, sourceFrames: source => source?.mediaSource?.frames || [],
    rasterProfile: null, widthInput: { value: '8' }, heightInput: { value: '4' }, stillFrameSelect: { value: '0' }, jpegQuality: { value: '73' },
    pngBackgroundMode: { value: 'transparent' }, pngBackgroundColor: { value: '#123456' },
    gifBackgroundMode: { value: 'color' }, gifBackgroundColor: { value: '#abcdef' }, filename: { value: 'draft' },
    outputBaseName: value => value.replace(/\.[^.]+$/, ''), isAutoDrawingFilename: () => false,
    sanitizeOutputFilename: (_name, ext) => `draft.${ext}`, resolveOutputFilename: ({ extension }) => `draft.${extension}`,
    dimensionsRequiredForFormat: (format, source) => ['rgba-frames', 'legacy-image', 'audio-video'].includes(source?.kind),
    validateOutputDimensions: ({ width, height }) => {
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 16_777_216) throw new RangeError('invalid dimensions');
      return { width, height };
    },
    outputSourceOriginalSize: (_id, frames) => frames[0] || { width: 1, height: 1 },
    validateVideoOutputSize: (size, { mimeType } = {}) => {
      if (!size) return null;
      if (size.width < 1 || size.height < 1 || size.width > 4096 || size.height > 4096 || size.width * size.height > 16_777_216
          || (mimeType === 'video/mp4' && (size.width % 2 || size.height % 2))) throw new RangeError('invalid video size');
      return { width: size.width, height: size.height };
    },
    isStaticOutputFormat: value => ['png','jpeg','webp','svg'].includes(value), isIntegerStaticImageEnlargement: () => true,
    MAX_IMAGE_EDGE: 4096, MAX_IMAGE_PIXELS: 16_777_216,
    pageDisposed: false, readonlyOutputPreviewEpoch: 0,
    runReadonlyPreview: async (snapshot, encode, signal) => {
      if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
      const result = await encode(snapshot);
      if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
      return { blob: result, filename: snapshot.filename, format: snapshot.format };
    },
    persistMediaSources: () => { throw new Error('persistent media write attempted'); },
    updateOutputRecord: () => { throw new Error('output record write attempted'); },
    setCurrentBlob: () => { throw new Error('current blob updated'); },
    linkClick: () => { throw new Error('download link clicked'); },
    ...overrides,
  });
  vm.runInContext(method, context);
  return context;
}

test('actual readonly preview wrapper runs GIF/APNG, WAV, and video factories without save-side mutations', async () => {
  for (const [format, kind, modulePath, exportName] of [
    ['gif', 'rgba-frames', null, null], ['apng', 'rgba-frames', null, null],
    ['wav', 'audio-buffer', './audio-export.mjs?rev=20261024-free-tools-1', 'encodeImportedAudioWav'],
    ['webm', 'rgba-frames', './output-video.mjs?rev=20261105-video-size-1', 'renderOutputVideo'],
  ]) {
    const calls = [];
    const { context, frame } = harness({
      __modules: modulePath ? { [modulePath]: { [exportName]: async (...args) => {
        calls.push(args);
        if (exportName === 'renderOutputVideo') return { blob: new Blob(['webm'], { type: 'video/webm' }), extension: 'webm', hasAudio: false, seconds: 1, width: 2, height: 1 };
        return new Blob(['wav'], { type: 'audio/wav' });
      } } } : {},
      encodeOutput: async (options, deps) => { calls.push([options]); deps.onProgress(0.9); return new Blob([format], { type: format === 'gif' ? 'image/gif' : 'image/apng' }); },
      listAudioOutputFormats: () => [{ value: 'ogg', available: true }],
      outputMime: value => ({ webm: 'video/webm', wav: 'audio/wav' })[value],
    });
    const selectedSource = kind === 'audio-buffer'
      ? { id: `source-${format}`, kind, channels: [new Float32Array(4)], sampleRate: 22050, durationSeconds: 1 }
      : { id: `source-${format}`, kind, mediaSource: { frames: [frame(120), frame(240)] } };
    const wrapper = previewWrapperHarness({
      encodeOutput: context.encodeOutput, __modules: context.__modules,
      listAudioOutputFormats: context.listAudioOutputFormats, outputMime: context.outputMime,
    });
    wrapper.activeSource = selectedSource; wrapper.activeItem = { id: `item-${format}`, sourceId: selectedSource.id, filename: `draft.${format}`, extension: format, metadata: {} };
    wrapper.formatSelect.value = format;
    if (format === 'webm') wrapper.selectedMusicSource = () => null;
    const outcome = await wrapper.previewOutput();
    assert.equal(outcome.blob.size > 0, true, `${format} should preview actual bytes`);
    assert.equal(outcome.filename, `draft.${format}`);
    assert.ok(calls.length > 0, `${format} encoder must run before preview returns`);
    assert.equal(wrapper.generationProgress.value, 0);
  }
});

test('actual readonly preview wrapper discards stale and cancelled encoder results', async () => {
  const selectedSource = { id: 'stale-source', kind: 'rgba-frames', mediaSource: { frames: [{ width: 2, height: 1, data: new Uint8Array(8), delayMs: 100 }] } };
  let release;
  const wrapper = previewWrapperHarness({ encodeOutput: () => new Promise(resolve => { release = resolve; }) });
  wrapper.activeSource = selectedSource; wrapper.activeItem = { id: 'stale-item', sourceId: selectedSource.id, filename: 'draft.gif', extension: 'gif', metadata: {} };
  wrapper.formatSelect.value = 'gif';
  const pending = wrapper.previewOutput();
  for (let tries = 0; !release && tries < 20; tries += 1) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(typeof release, 'function', 'encoder should have started');
  wrapper.activeSource = { ...selectedSource, id: 'new-source' };
  release(new Blob(['stale'], { type: 'image/gif' }));
  await assert.rejects(pending, { name: 'AbortError' });

  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  let started = false;
  const preCancelled = previewWrapperHarness({ encodeOutput: () => { started = true; return new Blob(['unexpected']); } });
  preCancelled.activeSource = selectedSource; preCancelled.activeItem = { id: 'pre-cancel-item', sourceId: selectedSource.id, filename: 'draft.gif', extension: 'gif', metadata: {} };
  preCancelled.formatSelect.value = 'gif';
  await assert.rejects(preCancelled.previewOutput({ signal: alreadyAborted.signal }), { name: 'AbortError' });
  assert.equal(started, false);

  const abortController = new AbortController();
  let finish;
  const cancelled = previewWrapperHarness({ encodeOutput: () => new Promise(resolve => { finish = resolve; }) });
  cancelled.activeSource = selectedSource; cancelled.activeItem = { id: 'cancel-item', sourceId: selectedSource.id, filename: 'draft.gif', extension: 'gif', metadata: {} };
  cancelled.formatSelect.value = 'gif';
  const cancelledPending = cancelled.previewOutput({ signal: abortController.signal });
  for (let tries = 0; !finish && tries < 20; tries += 1) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(typeof finish, 'function', 'encoder should have started');
  abortController.abort(); finish(new Blob(['cancelled'], { type: 'image/gif' }));
  await assert.rejects(cancelledPending, { name: 'AbortError' });
});

test('actual output capability covers native audio, legacy file, video, and heavy animation formats', async () => {
  const { readonlyPreviewBounds } = await import('../../js/creation/conversion-readonly-preview.mjs');
  const methodStart = source.indexOf('  previewCapability: () => {');
  const methodEnd = source.indexOf('\n  async previewOutput', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const context = {
    formatSelect: { value: 'wav' }, stillFrameSelect: { value: '0' }, widthInput: { value: '100' }, heightInput: { value: '100' },
    activeSource: null, activeItem: null, record: { metadata: {} }, sourceSelect: { value: '' }, rasterProfile: null,
    sourceFrames: source => source?.mediaSource?.frames || [], sourceFormats: source => source.formats || [],
    validateOutputDimensions: () => {}, outputSourceOriginalSize: (_id, frames) => frames[0] || { width: 1, height: 1 },
    validateVideoOutputSize: size => size ? { width: size.width, height: size.height } : null,
    isStaticOutputFormat: value => ['png','jpeg','webp','svg'].includes(value), isIntegerStaticImageEnlargement: () => true,
    readonlyPreviewBounds, MAX_IMAGE_EDGE: 4096, MAX_IMAGE_PIXELS: 16_777_216,
    isRewardedOutputFormat: () => false, isRewardedStaticImageSize: () => false, outputRewardEnabled: () => false,
    selectedMusicSource: () => null,
  };
  vm.createContext(context);
  const objectMethod = source.slice(methodStart, methodEnd).replace(/,$/, '');
  vm.runInContext(`globalThis.capability = ({${objectMethod}}).previewCapability;`, context);
  const select = (activeSource, format) => {
    context.activeSource = activeSource; context.activeItem = { id: 'item', sourceId: activeSource.id, metadata: {} };
    context.sourceSelect.value = activeSource.id; context.formatSelect.value = format;
    return context.capability();
  };
  assert.equal(select({ id: 'audio', kind: 'audio-buffer', formats: [['wav']] }, 'wav').supported, true);
  context.activeItem.sourceId = 'previous-image';
  assert.equal(context.capability().supported, true, 'audio preview follows the selected native audio source');
  assert.equal(select({ id: 'legacy', kind: 'legacy-file', extension: 'qoi', formats: [['qoi']] }, 'qoi').supported, true);
  assert.equal(select({ id: 'video', kind: 'video-source', formats: [['webm']] }, 'webm').supported, true);
  const av = { id: 'av', kind: 'audio-video', image: { width: 2, height: 2 }, formats: [['webm']] };
  assert.equal(select(av, 'webm').supported, false);
  context.selectedMusicSource = () => ({ kind: 'audio-buffer' });
  assert.equal(select(av, 'webm').supported, true);
  const frames = Array.from({ length: 2 }, () => ({ width: 1500, height: 1500, data: new Uint8Array(1500 * 1500 * 4), delayMs: 100 }));
  context.widthInput.value = '1500'; context.heightInput.value = '1500';
  const heavy = select({ id: 'animated', kind: 'rgba-frames', mediaSource: { frames }, formats: [['gif']] }, 'gif');
  assert.equal(heavy.supported, true);
  assert.equal(heavy.automatic, false);
});

test('video-source preview load failure releases its temporary URL and media element', async () => {
  let revoked = ''; let cleanup = { paused: false, cleared: false }; let renders = 0;
  const listeners = new Map();
  const video = {
    readyState: 0, src: '', muted: false, defaultMuted: false, playsInline: false, preload: '',
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    load() { if (this.src) queueMicrotask(() => listeners.get('error')?.()); },
    pause() { cleanup.paused = true; },
    removeAttribute(name) { if (name === 'src') { this.src = ''; cleanup.cleared = true; } },
  };
  const modules = { './output-video.mjs?rev=20261105-video-size-1': { renderOutputVideo: async () => { renders += 1; throw new Error('should not render'); } } };
  const wrapper = previewWrapperHarness({
    URL: { createObjectURL: () => 'blob:preview-temp', revokeObjectURL: url => { revoked = url; } },
    document: { createElement: () => video }, __modules: modules,
  });
  const sourceVideo = { id: 'video-source', kind: 'video-source', blob: new Blob(['source']) };
  wrapper.activeSource = sourceVideo;
  wrapper.activeItem = { id: 'video-item', sourceId: sourceVideo.id, filename: 'clip.webm', extension: 'webm', metadata: {} };
  wrapper.formatSelect.value = 'webm';
  await assert.rejects(wrapper.previewOutput(), /動画の映像コマを読み込めませんでした/);
  assert.equal(revoked, 'blob:preview-temp');
  assert.equal(cleanup.paused, true);
  assert.equal(cleanup.cleared, true);
  assert.equal(renders, 0);
});

test('pending FPS preview applies the native GIF timing to copied frames without persisting settings', async () => {
  const sourceFrames = [
    { width: 2, height: 1, data: new Uint8Array(8), delayMs: 125 },
    { width: 2, height: 1, data: new Uint8Array(8), delayMs: 725 },
  ];
  let encodedOptions; let persistCalls = 0;
  const wrapper = previewWrapperHarness({
    encodeOutput: async options => { encodedOptions = options; return new Blob(['gif'], { type: 'image/gif' }); },
    persistMediaSources: () => { persistCalls += 1; throw new Error('preview must not persist'); },
  });
  const sourceImages = { id: 'fps-source', kind: 'rgba-frames', mediaSource: { frames: sourceFrames, totalPlays: 2 } };
  wrapper.activeSource = sourceImages;
  wrapper.activeItem = { id: 'fps-item', sourceId: sourceImages.id, filename: 'draft.gif', extension: 'gif', metadata: {} };
  wrapper.formatSelect.value = 'gif'; wrapper.mediaSettings.playbackRate = 2;
  wrapper.fpsInput.value = '30';
  await wrapper.previewOutput({ pendingFps: true });
  assert.deepEqual(Array.from(encodedOptions.frames, frame => frame.delayMs), [30, 30]);
  assert.equal(wrapper.generationProgress.value, 0);
  assert.deepEqual(sourceFrames.map(frame => frame.delayMs), [125, 725]);
  assert.equal(persistCalls, 0);
});

test('invalid pending FPS rejects before invoking the preview encoder', async () => {
  let encoderCalls = 0;
  const wrapper = previewWrapperHarness({ encodeOutput: async () => { encoderCalls += 1; return new Blob(['gif']); } });
  const sourceImages = { id: 'fps-invalid', kind: 'rgba-frames', mediaSource: { frames: [
    { width: 2, height: 1, data: new Uint8Array(8), delayMs: 100 }, { width: 2, height: 1, data: new Uint8Array(8), delayMs: 100 },
  ] } };
  wrapper.activeSource = sourceImages;
  wrapper.activeItem = { id: 'fps-invalid-item', sourceId: sourceImages.id, filename: 'draft.gif', extension: 'gif', metadata: {} };
  wrapper.formatSelect.value = 'gif'; wrapper.fpsInput.value = '100';
  let added=0,removed=0;const signal={aborted:false,addEventListener:()=>added++,removeEventListener:()=>removed++};
  await assert.rejects(wrapper.previewOutput({ pendingFps: true,signal }), /invalid FPS/);
  assert.equal(encoderCalls, 0);assert.equal(added,1);assert.equal(removed,1,'invalid pending settings remove the external abort listener');
});

test('pending size video preview matches native Save dimensions and frame pixels while composing pending FPS', async () => {
  const sourceFrame = { width: 32, height: 32, delayMs: 250, data: Uint8Array.from({ length: 32 * 32 * 4 }, (_, index) => index % 251) };
  let renderedFrames; let wrapperOptions; let persistCalls = 0;
  const wrapper = previewWrapperHarness({
    persistMediaSources: () => { persistCalls += 1; throw new Error('preview must not persist'); },
    __modules: { './output-video.mjs?rev=20261105-video-size-1': { renderOutputVideo: async (frames, options) => {
      renderedFrames = frames; wrapperOptions = options;
      return { blob: new Blob(['webm'], { type: 'video/webm' }), extension: 'webm', hasAudio: false, seconds: 1, width: options.outputSize.width, height: options.outputSize.height };
    } } },
  });
  wrapper.activeSource = { id: 'resize-video', kind: 'rgba-frames', mediaSource: { frames: [sourceFrame, { ...sourceFrame, data: sourceFrame.data.slice() }] } };
  wrapper.activeItem = { id: 'resize-item', sourceId: 'resize-video', filename: 'draft.webm', extension: 'webm', metadata: {} };
  wrapper.formatSelect.value = 'webm'; wrapper.widthInput.value = '64'; wrapper.heightInput.value = '64';
  wrapper.fpsInput.value = '30'; wrapper.mediaSettings.playbackRate = 2;
  const preview=await wrapper.previewOutput({ pendingSize: true, pendingFps: true });
  assert.equal(preview.outputInfo.width, 64); assert.equal(preview.outputInfo.height, 64);
  assert.equal(preview.notice, undefined, 'specified dimensions are applied rather than replaced by an ignored-size warning');
  assert.equal(renderedFrames[0].width, 32); assert.equal(renderedFrames[0].height, 32);
  assert.equal(wrapperOptions.outputSize.width, 64); assert.equal(wrapperOptions.outputSize.height, 64);
  assert.equal(renderedFrames[0].data.length, 32 * 32 * 4);
  assert.equal(renderedFrames[0].delayMs, 1000 / 30);
  assert.equal(sourceFrame.width, 32); assert.equal(sourceFrame.data.length, 32 * 32 * 4); assert.equal(sourceFrame.delayMs, 250);
  assert.equal(wrapper.generationProgress.value, 0); assert.equal(persistCalls, 0);
});

test('pending-size GIF/APNG previews pass dimensions to native raster encoding without changing source frames', async () => {
  for (const format of ['gif', 'apng']) {
    let encodedOptions;
    const sourceFrame = { width: 2, height: 2, delayMs: 100, data: Uint8Array.from({ length: 16 }, (_, index) => index) };
    const wrapper = previewWrapperHarness({ encodeOutput: async options => { encodedOptions = options; return new Blob([format], { type: format === 'gif' ? 'image/gif' : 'image/apng' }); } });
    const sourceImages = { id: `size-${format}`, kind: 'rgba-frames', mediaSource: { frames: [sourceFrame, { ...sourceFrame, data: sourceFrame.data.slice() }] } };
    wrapper.activeSource = sourceImages;
    wrapper.activeItem = { id: `size-item-${format}`, sourceId: sourceImages.id, filename: `draft.${format}`, extension: format, metadata: {} };
    wrapper.formatSelect.value = format; wrapper.widthInput.value = '3'; wrapper.heightInput.value = '3';
    await wrapper.previewOutput({ pendingSize: true });
    assert.equal(encodedOptions.width, 3); assert.equal(encodedOptions.height, 3);
    assert.equal(encodedOptions.frames[0].width, 2); assert.equal(encodedOptions.frames[0].height, 2);
    assert.deepEqual(Array.from(encodedOptions.frames[0].data), Array.from(sourceFrame.data));
    assert.equal(sourceFrame.width, 2); assert.equal(sourceFrame.height, 2);
  }
});

test('video capability rejects oversized and odd MP4 dimensions using native bounds', async () => {
  const { validateVideoOutputSize } = await import('../../js/creation/video-output-size.mjs');
  const { context } = harness();
  const methodStart = source.indexOf('  previewCapability: () => {');
  const methodEnd = source.indexOf('\n  async previewOutput', methodStart);
  const capabilityContext = {
    formatSelect: { value: 'webm' }, stillFrameSelect: { value: '0' }, widthInput: { value: '5000' }, heightInput: { value: '32' },
    activeSource: { id: 'wide-video', kind: 'rgba-frames', mediaSource: { frames: [{ width: 32, height: 32 }] } },
    activeItem: { id: 'item', sourceId: 'wide-video', metadata: {} }, record: { metadata: {} }, sourceSelect: { value: 'wide-video' }, rasterProfile: null,
    sourceFrames: source => source.mediaSource.frames, sourceFormats: () => [['webm']], outputSourceOriginalSize: () => ({ width: 32, height: 32 }),
    validateOutputDimensions: ({ width }) => { if (width > 4096) throw new RangeError('too wide'); }, isStaticOutputFormat: () => false,
    validateVideoOutputSize: (size, { mimeType } = {}) => {
      if (!size || size.width > 4096 || size.height > 4096 || size.width * size.height > 16_777_216 || (mimeType === 'video/mp4' && (size.width % 2 || size.height % 2))) throw new RangeError('invalid video size');
      return size;
    }, chooseAudioVideoMimeType: () => ({ extension: 'webm', mimeType: 'video/webm' }),
    isIntegerStaticImageEnlargement: () => true, readonlyPreviewBounds: () => ({ automatic: false }), MAX_IMAGE_EDGE: 4096, MAX_IMAGE_PIXELS: 16_777_216,
    selectedMusicSource: () => null, isRewardedOutputFormat: () => false, isRewardedStaticImageSize: () => false, outputRewardEnabled: () => false,
  };
  vm.createContext(capabilityContext);
  capabilityContext.validateVideoOutputSize = validateVideoOutputSize;
  capabilityContext.chooseAudioVideoMimeType = () => ({ extension: 'mp4', mimeType: 'video/mp4' });
  const objectMethod = source.slice(methodStart, methodEnd).replace(/,$/, '');
  vm.runInContext(`globalThis.capability = ({${objectMethod}}).previewCapability;`, capabilityContext);
  assert.equal(capabilityContext.capability().supported, false);
  capabilityContext.widthInput.value = '64'; capabilityContext.heightInput.value = '63';
  capabilityContext.formatSelect.value = 'mp4';
  capabilityContext.sourceFormats = () => [['mp4']];
  const oddMp4 = capabilityContext.capability();
  assert.equal(oddMp4.supported, false);
  assert.match(oddMp4.reason, /偶数/);
});

test('shared video encoder receives native default, scaled, and unlocked dimensions exactly', async () => {
  const { validateVideoOutputSize } = await import('../../js/creation/video-output-size.mjs');
  for (const [width, height] of [[32, 32], [64, 64], [48, 64]]) {
    let renderedSize;
    const wrapper = previewWrapperHarness({
      validateVideoOutputSize,
      __modules: { './output-video.mjs?rev=20261105-video-size-1': { renderOutputVideo: async (_frames, options) => {
        renderedSize = options.outputSize;
        return { blob: new Blob(['webm'], { type: 'video/webm' }), extension: 'webm', hasAudio: false, seconds: 1, width, height };
      } } },
    });
    const originalFrame = { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4), delayMs: 100 };
    wrapper.activeSource = { id: `dims-${width}-${height}`, kind: 'rgba-frames', mediaSource: { frames: [originalFrame] } };
    wrapper.activeItem = { id: 'dims-item', sourceId: wrapper.activeSource.id, filename: 'draft.webm', extension: 'webm', metadata: {} };
    wrapper.formatSelect.value = 'webm'; wrapper.widthInput.value = String(width); wrapper.heightInput.value = String(height);
    await wrapper.previewOutput();
    assert.deepEqual({ width: renderedSize.width, height: renderedSize.height }, { width, height });
    assert.equal(originalFrame.width, 32); assert.equal(originalFrame.data.length, 32 * 32 * 4);
  }
});

test('odd MP4 preview dimensions are rejected before invoking the video renderer', async () => {
  const { validateVideoOutputSize } = await import('../../js/creation/video-output-size.mjs');
  let rendererCalls = 0;
  const wrapper = previewWrapperHarness({
    validateVideoOutputSize,
    chooseAudioVideoMimeType: () => ({ extension: 'mp4', mimeType: 'video/mp4' }),
    __modules: { './output-video.mjs?rev=20261105-video-size-1': { renderOutputVideo: async () => { rendererCalls += 1; throw new Error('must reject first'); } } },
  });
  wrapper.activeSource = { id: 'odd-mp4', kind: 'rgba-frames', mediaSource: { frames: [{ width: 32, height: 32, data: new Uint8Array(4096), delayMs: 100 }] } };
  wrapper.activeItem = { id: 'odd-mp4-item', sourceId: wrapper.activeSource.id, filename: 'draft.mp4', extension: 'mp4', metadata: {} };
  wrapper.formatSelect.value = 'mp4'; wrapper.widthInput.value = '63'; wrapper.heightInput.value = '64';
  await assert.rejects(wrapper.previewOutput(), /偶数/);
  assert.equal(rendererCalls, 0);
});
