import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOutputVideo } from '../../js/creation/output-video.mjs';

function createMediaHarness({ audio = false, duration = 0.04 } = {}) {
  const tracks = []; const recorders = [];
  class Track {
    constructor(kind) { this.kind = kind; this.readyState = 'live'; this.enabled = true; this.stopped = false; tracks.push(this); }
    stop() { this.readyState = 'ended'; this.stopped = true; }
  }
  class Stream {
    constructor(items) { this.items = [...items]; }
    getTracks() { return this.items; }
    getVideoTracks() { return this.items.filter((track) => track.kind === 'video'); }
    getAudioTracks() { return this.items.filter((track) => track.kind === 'audio'); }
  }
  class Recorder {
    constructor(stream, options) { this.stream = stream; this.mimeType = options.mimeType; this.state = 'inactive'; this.listeners = new Map(); recorders.push(this); }
    addEventListener(type, listener) { const set = this.listeners.get(type) || new Set(); set.add(listener); this.listeners.set(type, set); }
    emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
    start() { this.state = 'recording'; queueMicrotask(() => this.emit('start')); }
    stop() {
      if (this.state !== 'recording') return;
      this.state = 'inactive';
      queueMicrotask(() => { this.emit('dataavailable', { data: new Blob([Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3)], { type: this.mimeType }) }); this.emit('stop'); });
    }
  }
  class AudioContext {
    constructor() { this.state = 'running'; this.origin = performance.now(); this.closed = false; }
    get currentTime() { return (performance.now() - this.origin) / 1000; }
    async resume() {}
    createBuffer(channelCount, length, sampleRate) { return { channelCount, length, sampleRate, copyToChannel() {} }; }
    createMediaStreamDestination() { return { stream: new Stream([new Track('audio')]) }; }
    createBufferSource() {
      const node = { playbackRate: { value: 1 }, connect() {}, disconnect() {}, start: () => { node.timer = setTimeout(() => node.onended?.(), duration * 1000); }, stop: () => clearTimeout(node.timer) };
      return node;
    }
    async close() { this.state = 'closed'; this.closed = true; }
  }
  const documentRef = {
    visibilityState: 'visible',
    addEventListener() {}, removeEventListener() {},
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const context = { imageSmoothingEnabled: true, fillRect() {}, drawImage() {}, putImageData() {} };
      return { width: 0, height: 0, getContext: () => context, captureStream: () => new Stream([new Track('video')]) };
    }
  };
  const originalImageData = globalThis.ImageData;
  globalThis.ImageData = class ImageData { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
  return {
    tracks, recorders, Recorder, AudioContext, Stream, documentRef, restore() { globalThis.ImageData = originalImageData; },
    audioSource: audio ? { sampleRate: 8000, channels: [new Float32Array(Math.ceil(duration * 8000))] } : null
  };
}

function frame(delayMs = 40) { return { width: 1, height: 1, data: new Uint8Array([10, 20, 30, 255]), delayMs }; }

test('output video waits for MediaRecorder start and keeps the requested WebM container', async () => {
  const harness = createMediaHarness();
  try {
    const result = await renderOutputVideo([frame()], {
      mimeChoice: { mimeType: 'video/webm', extension: 'webm' }, MediaRecorderImpl: harness.Recorder,
      MediaStreamImpl: harness.Stream, documentRef: harness.documentRef, requestFrame: (callback) => setTimeout(() => callback(performance.now()), 12), cancelFrame: clearTimeout
    });
    assert.equal(result.extension, 'webm'); assert.equal(result.hasAudio, false); assert.equal(result.seconds, 0.04);
    assert.ok(harness.recorders[0].stream.getVideoTracks().length);
    assert.ok(harness.tracks.every((track) => track.stopped));
  } finally { harness.restore(); }
});

test('audio-composed video fixes tracks before recording and ends with the decoded audio', async () => {
  const harness = createMediaHarness({ audio: true, duration: 0.05 });
  try {
    const result = await renderOutputVideo([frame(100)], {
      audioSource: harness.audioSource, playbackRate: 1.25,
      mimeChoice: { mimeType: 'video/webm', extension: 'webm' }, MediaRecorderImpl: harness.Recorder,
      AudioContextImpl: harness.AudioContext, MediaStreamImpl: harness.Stream, documentRef: harness.documentRef,
      requestFrame: (callback) => setTimeout(() => callback(performance.now()), 12), cancelFrame: clearTimeout
    });
    assert.equal(result.hasAudio, true); assert.equal(result.seconds, 0.04);
    assert.ok(harness.recorders[0].stream.getAudioTracks().every((track) => track.readyState === 'ended'));
    assert.ok(harness.tracks.every((track) => track.stopped));
  } finally { harness.restore(); }
});

test('video cancellation rejects without returning partial chunks and releases tracks', async () => {
  const harness = createMediaHarness(); const controller = new AbortController();
  const rendering = renderOutputVideo([frame(4000)], {
    mimeChoice: { mimeType: 'video/webm', extension: 'webm' }, MediaRecorderImpl: harness.Recorder,
    MediaStreamImpl: harness.Stream, documentRef: harness.documentRef, signal: controller.signal,
    requestFrame: (callback) => setTimeout(() => callback(performance.now()), 12), cancelFrame: clearTimeout
  });
  setTimeout(() => controller.abort(), 20);
  try { await assert.rejects(rendering, { name: 'AbortError' }); }
  finally { harness.restore(); }
  assert.ok(harness.tracks.every((track) => track.stopped));
});
