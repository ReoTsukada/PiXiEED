import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOutputVideo } from '../../js/creation/output-video.mjs';
import { renderAudioVideo } from '../../js/creation/audio-video.mjs';
import { createAudioSong } from '../../js/creation/audio-core.mjs';

globalThis.ImageData ||= class ImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };

const webmHeader = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);

function recorderMocks(canvasLog) {
  const track = { kind: 'video', readyState: 'live', enabled: true, stop() { this.readyState = 'ended'; } };
  class Stream { constructor(tracks) { this.tracks = tracks; } getTracks() { return this.tracks; } getVideoTracks() { return this.tracks.filter(item => item.kind === 'video'); } getAudioTracks() { return this.tracks.filter(item => item.kind === 'audio'); } }
  class Recorder {
    static isTypeSupported(type) { return type.startsWith('video/webm'); }
    constructor(stream, options) { this.stream = stream; this.mimeType = options.mimeType; this.state = 'inactive'; this.listeners = {}; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, event = {}) { for (const callback of this.listeners[name] || []) callback(event); }
    start() { this.state = 'recording'; this.emit('start'); }
    stop() { if (this.state !== 'recording') return; this.state = 'inactive'; this.emit('dataavailable', { data: new Blob([webmHeader]) }); this.emit('stop'); }
  }
  const documentRef = {
    visibilityState: 'visible', addEventListener() {}, removeEventListener() {},
    createElement(name) {
      const canvas = { tagName: name, width: 0, height: 0, captureStream: () => { canvas.initialSize = [canvas.width, canvas.height]; return { getTracks: () => [track], getVideoTracks: () => [track] }; } };
      canvas.getContext = () => ({ imageSmoothingEnabled: true, fillRect() {}, putImageData() {}, drawImage(...args) { canvasLog.draws.push({ destination: canvas, args }); }, createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; } });
      canvasLog.canvases.push(canvas);
      return canvas;
    }
  };
  return { MediaRecorderImpl: Recorder, MediaStreamImpl: Stream, documentRef };
}

function timerMocks() {
  const timers = []; const cleared = new Set();
  return { timers, cleared, setTimeoutImpl(callback) { timers.push(callback); return timers.length; }, clearTimeoutImpl(id) { cleared.add(id); },
    requestFrame() { return 1; }, cancelFrame() {} };
}

test('renderOutputVideo records original pixels once at the exact explicit size and preserves defaults', async () => {
  for (const outputSize of [{ width: 64, height: 32 }, null]) {
    const log = { canvases: [], draws: [] };
    const mocks = recorderMocks(log); const clocks = timerMocks();
    let verified = null;
    const pending = renderOutputVideo([{ width: 32, height: 16, delayMs: 100, data: new Uint8Array(32 * 16 * 4) }], {
      mimeChoice: { extension: 'webm', mimeType: 'video/webm' }, outputSize, verifyVideoSize: async (_blob, expected) => { verified = expected; return expected; },
      ...mocks, ...clocks, now: () => 0, requestFrame: () => 1
    });
    await new Promise(resolve => setImmediate(resolve));
    clocks.timers.at(-1)();
    const result = await pending;
    const outputCanvas = log.canvases[0];
    if (outputSize) {
      assert.deepEqual(outputCanvas.initialSize, [64, 32]);
      assert.deepEqual(verified, outputSize);
      assert.deepEqual([result.width, result.height], [64, 32]);
    } else {
      assert.deepEqual([result.width, result.height], [1024, 512]);
      assert.deepEqual(outputCanvas.initialSize, [1024, 512], 'default sizing remains automatic for frame timelines');
    }
    const destinationDraws = log.draws.filter(entry => entry.destination === outputCanvas);
    assert.equal(destinationDraws.length, 1, 'original source canvas is drawn once onto the output canvas');
    assert.deepEqual(destinationDraws[0].args.slice(1), [0, 0, result.width, result.height]);
  }
});

test('renderOutputVideo abort during explicit-size verification rejects without returning a ready result', async () => {
  const log = { canvases: [], draws: [] }; const mocks = recorderMocks(log); const clocks = timerMocks();
  const controller = new AbortController(); let verificationSignal;
  const pending = renderOutputVideo([{ width: 32, height: 16, delayMs: 100, data: new Uint8Array(32 * 16 * 4) }], {
    mimeChoice: { extension: 'webm', mimeType: 'video/webm' }, outputSize: { width: 64, height: 32 }, signal: controller.signal,
    verifyVideoSize: (_blob, _expected, { signal }) => new Promise((_resolve, reject) => {
      verificationSignal = signal; signal.addEventListener('abort', () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error); });
    }), ...mocks, ...clocks, now: () => 0, requestFrame: () => 1
  });
  await new Promise(resolve => setImmediate(resolve));
  clocks.timers.at(-1)();
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(verificationSignal.aborted, true);
});

test('renderOutputVideo keeps a video source natural size when outputSize is omitted', async () => {
  const log = { canvases: [], draws: [] }; const mocks = recorderMocks(log); const clocks = timerMocks();
  const videoSource = { videoWidth: 32, videoHeight: 16, duration: 1, currentTime: 0, playbackRate: 1, loop: false,
    play: () => Promise.resolve(), pause() {} };
  const pending = renderOutputVideo([], { videoSource, mimeChoice: { extension: 'webm', mimeType: 'video/webm' },
    ...mocks, ...clocks, now: () => 0, requestFrame: () => 1 });
  await new Promise(resolve => setImmediate(resolve));
  clocks.timers.at(-1)();
  const result = await pending;
  assert.deepEqual([result.width, result.height], [32, 16]);
  assert.deepEqual(log.canvases[0].initialSize, [32, 16]);
});

test('renderAudioVideo uses explicit output size without altering image or music timing', async () => {
  const log = { canvases: [], draws: [] }; const mocks = recorderMocks(log); const clocks = timerMocks();
  const image = { width: 32, height: 16, rgba: new Uint8Array(32 * 16 * 4) };
  const song = createAudioSong({ songId: 'video-test', title: 'Video test', tempo: 120 });
  let verified = null;
  const pending = renderAudioVideo(song, image, { includeAudio: false, totalPlays: 2, frameDurationsMs: [200], outputSize: { width: 64, height: 32 },
    verifyVideoSize: async (_blob, expected) => { verified = expected; return expected; }, ...mocks, ...clocks,
    frameImages: [image], playerFactory: () => { throw new Error('audio player must not be created'); }, nowImpl: () => 0,
    setIntervalImpl: () => 1, clearIntervalImpl() {} });
  await new Promise(resolve => setImmediate(resolve));
  clocks.timers.at(-1)();
  const result = await pending;
  assert.deepEqual(verified, { width: 64, height: 32 });
  assert.deepEqual([result.width, result.height, result.totalPlays, result.hasAudio], [64, 32, 2, false]);
  assert.deepEqual(log.canvases[1].initialSize, [64, 32]);
});

for (const kind of ['timeline', 'song']) {
  test(`${kind} recording watchdog ends before the separate encoded-size check`, async () => {
    const log = { canvases: [], draws: [] }; const mocks = recorderMocks(log); const clocks = timerMocks();
    let releaseVerification; let verificationSignal; let completed = false;
    const verifyVideoSize = (_blob, expected, { signal }) => {
      verificationSignal = signal;
      assert.ok(clocks.cleared.has(1), 'recording watchdog is cleared before metadata probe starts');
      return new Promise(resolve => { releaseVerification = () => resolve(expected); });
    };
    const options = { ...mocks, ...clocks, outputSize: { width: 64, height: 32 }, verifyVideoSize };
    const pending = kind === 'timeline'
      ? renderOutputVideo([{ width: 32, height: 16, delayMs: 100, data: new Uint8Array(32 * 16 * 4) }], { ...options, mimeChoice: { extension: 'webm', mimeType: 'video/webm' }, now: () => 0 })
      : renderAudioVideo(createAudioSong({ songId: 'probe', title: 'Probe', tempo: 120 }), { width: 32, height: 16, rgba: new Uint8Array(32 * 16 * 4) }, {
        ...options, includeAudio: false, frameDurationsMs: [200], nowImpl: () => 0, setIntervalImpl: () => 1, clearIntervalImpl() {}
      });
    void pending.then(() => { completed = true; }, () => {});
    await new Promise(resolve => setImmediate(resolve)); clocks.timers.at(-1)();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false, 'not ready until independent verification completes');
    assert.equal(verificationSignal.aborted, false);
    releaseVerification();
    assert.equal((await pending).width, 64);
    assert.equal(verificationSignal.aborted, true, 'probe is released by renderer cleanup');
  });
}
