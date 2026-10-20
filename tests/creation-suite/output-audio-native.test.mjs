import test from 'node:test';
import assert from 'node:assert/strict';
import { listAudioOutputFormats } from '../../js/creation/output-audio-capabilities.mjs';
import { encodeNativeAudio } from '../../js/creation/output-audio-encode.mjs';

const SIGNATURES = {
  m4a: [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20],
  webm: [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81],
  ogg: [0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0]
};

function createHarness({ signature = SIGNATURES.webm, durationMs = 5, recorderMime = null, resumePending = false } = {}) {
  const tracks = []; const nodes = []; const recorders = []; const contexts = [];
  class Track {
    constructor() { this.kind = 'audio'; this.readyState = 'live'; this.enabled = true; this.stopped = false; tracks.push(this); }
    stop() { this.stopped = true; this.readyState = 'ended'; }
  }
  class Stream {
    constructor(items) { this.items = [...items]; }
    getTracks() { return this.items; }
    getAudioTracks() { return this.items.filter((item) => item.kind === 'audio'); }
  }
  class Context {
    constructor() { this.state = 'running'; this.closed = false; contexts.push(this); }
    resume() { return resumePending ? new Promise(() => {}) : Promise.resolve(); }
    createBuffer(channelCount, length, sampleRate) {
      const data = Array.from({ length: channelCount }, () => new Float32Array(length));
      this.audioBuffer = { channelCount, length, sampleRate, duration: length / sampleRate, data,
        copyToChannel(channel, index, offset = 0) { data[index].set(channel, offset); } };
      return this.audioBuffer;
    }
    createMediaStreamDestination() { this.destination = { channelCount: 2, channelCountMode: 'max', channelInterpretation: 'speakers', stream: new Stream([new Track()]) }; return this.destination; }
    createBufferSource() {
      const node = {
        connected: null,
        connect(destination) { this.connected = destination; },
        disconnect() { this.disconnected = true; },
        start() { this.timer = setTimeout(() => this.onended?.(), this.buffer ? this.buffer.duration * 1000 : durationMs); },
        stop() { clearTimeout(this.timer); this.stopped = true; }
      };
      nodes.push(node); return node;
    }
    async close() { this.closed = true; this.state = 'closed'; }
  }
  class Recorder {
    static isTypeSupported(mimeType) { return ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].includes(mimeType); }
    constructor(stream, options) { this.stream = stream; this.mimeType = recorderMime ?? options.mimeType; this.options = options; this.state = 'inactive'; this.listeners = new Map(); recorders.push(this); }
    addEventListener(type, listener) { const listeners = this.listeners.get(type) || new Set(); listeners.add(listener); this.listeners.set(type, listeners); }
    emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
    start() { this.state = 'recording'; queueMicrotask(() => this.emit('start')); }
    stop() {
      if (this.state !== 'recording') return;
      this.state = 'inactive';
      queueMicrotask(() => {
        this.emit('dataavailable', { data: new Blob([Uint8Array.from(signature)], { type: this.mimeType }) });
        this.emit('stop');
      });
    }
  }
  return { tracks, nodes, recorders, contexts, Context, Recorder, Stream };
}

function source(seconds = 0.005) {
  const channel = new Float32Array(Math.round(seconds * 8000));
  for (let index = 0; index < channel.length; index += 1) channel[index] = index / Math.max(1, channel.length);
  return { sampleRate: 8000, channels: [channel] };
}

test('audio output format listing keeps WAV available and marks native/unsupported formats truthfully', () => {
  class PartialRecorder { static isTypeSupported(value) { return value === 'audio/webm;codecs=opus'; } }
  const formats = listAudioOutputFormats({ MediaRecorderImpl: PartialRecorder });
  assert.deepEqual(formats.map(({ value, available }) => [value, available]), [
    ['wav', true], ['m4a', false], ['webm', true], ['ogg', false], ['mp3', false], ['flac', false]
  ]);
  assert.match(formats.find(({ value }) => value === 'mp3').reason, /エンコーダー/);
  assert.equal(listAudioOutputFormats({ MediaRecorderImpl: null }).find(({ value }) => value === 'wav').available, true);
});

test('native WebM output records only to a destination track, verifies container and releases resources', async () => {
  const harness = createHarness(); const progress = []; const input = source(); const original = new Float32Array(input.channels[0]);
  const result = await encodeNativeAudio(input, {
    formatChoice: 'webm', MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream,
    onProgress: (value) => progress.push(value)
  });
  assert.equal(result.extension, 'webm'); assert.equal(result.mimeType, 'audio/webm;codecs=opus');
  assert.equal(result.seconds, 0.125); assert.equal(result.sourceSeconds, 0.005); assert.equal(result.paddingSeconds, 0.12);
  assert.equal(result.blob.type, result.mimeType);
  assert.equal(harness.contexts[0].audioBuffer.length, 1000);
  assert.equal(harness.contexts[0].audioBuffer.data[0][0], 0);
  assert.deepEqual(harness.contexts[0].audioBuffer.data[0].slice(320, 360), original);
  assert.deepEqual(harness.contexts[0].audioBuffer.data[0].slice(360), new Float32Array(640));
  assert.deepEqual(input.channels[0], original, 'padding does not mutate the imported source');
  assert.equal(harness.nodes[0].connected, harness.contexts[0].destination, 'audio is connected only to the recorder destination');
  assert.equal(harness.contexts[0].destination.channelCount, 1, 'mono sources remain mono at the recording destination');
  assert.equal(harness.contexts[0].destination.channelCountMode, 'explicit');
  assert.equal(harness.contexts[0].destination.channelInterpretation, 'discrete');
  assert.deepEqual(harness.recorders[0].stream.getTracks().map(({ kind }) => kind), ['audio']);
  assert.ok(progress.length > 0, 'progress is reported while recorder is active');
  assert.ok(harness.nodes[0].disconnected); assert.ok(harness.nodes[0].stopped);
  assert.ok(harness.tracks.every((track) => track.stopped)); assert.ok(harness.contexts[0].closed);
});

test('stereo input configures the recording destination for two discrete channels', async () => {
  const harness = createHarness();
  await encodeNativeAudio({ sampleRate: 8000, channels: [new Float32Array(40), new Float32Array(40)] }, {
    formatChoice: 'webm', MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream
  });
  assert.equal(harness.contexts[0].destination.channelCount, 2);
  assert.equal(harness.contexts[0].destination.channelCountMode, 'explicit');
});

test('native M4A and Ogg outputs verify their own container signatures', async () => {
  for (const formatChoice of ['m4a', 'ogg']) {
    const harness = createHarness({ signature: SIGNATURES[formatChoice] });
    const result = await encodeNativeAudio(source(), {
      formatChoice, MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream
    });
    assert.equal(result.extension, formatChoice);
    assert.equal(result.mimeType, formatChoice === 'm4a' ? 'audio/mp4;codecs=mp4a.40.2' : 'audio/ogg;codecs=opus');
    assert.ok(harness.tracks.every((track) => track.stopped)); assert.ok(harness.contexts[0].closed);
  }
});

test('native audio rejects a bad container signature and still cleans up', async () => {
  const harness = createHarness({ signature: [0, 1, 2, 3, 4, 5, 6, 7] });
  await assert.rejects(encodeNativeAudio(source(), {
    formatChoice: 'webm', MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream
  }), /識別情報が不正/);
  assert.ok(harness.tracks.every((track) => track.stopped)); assert.ok(harness.contexts[0].closed);
});

test('native audio rejects a recorder MIME mismatch before producing a file', async () => {
  const harness = createHarness({ recorderMime: 'audio/ogg;codecs=opus' });
  await assert.rejects(encodeNativeAudio(source(), {
    formatChoice: 'webm', MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream
  }), /選択した音声形式/);
  assert.equal(harness.recorders.length, 1); assert.equal(harness.recorders[0].state, 'inactive');
  assert.ok(harness.tracks.every((track) => track.stopped)); assert.ok(harness.contexts[0].closed);
});

test('abort stops a live native recording and closes every audio resource', async () => {
  const harness = createHarness({ durationMs: 500 }); const controller = new AbortController();
  const pending = encodeNativeAudio(source(0.5), {
    formatChoice: 'webm', signal: controller.signal,
    MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream
  });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(harness.recorders[0]); assert.ok(harness.nodes[0].stopped && harness.nodes[0].disconnected);
  assert.ok(harness.tracks.every((track) => track.stopped)); assert.ok(harness.contexts[0].closed);
});

test('abort interrupts a pending AudioContext resume and closes the context', async () => {
  const harness = createHarness({ resumePending: true }); const controller = new AbortController();
  const pending = encodeNativeAudio(source(), {
    formatChoice: 'webm', signal: controller.signal,
    MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream
  });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(harness.recorders.length, 0); assert.ok(harness.contexts[0].closed);
});

test('pending AudioContext resume times out and closes the context', async () => {
  const harness = createHarness({ resumePending: true });
  await assert.rejects(encodeNativeAudio(source(), {
    formatChoice: 'webm', resumeTimeoutMs: 5,
    MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream
  }), /準備が時間内に終わりませんでした/);
  assert.equal(harness.recorders.length, 0); assert.ok(harness.contexts[0].closed);
});

test('WAV delegates to the existing PCM encoder and preserves the source duration', async () => {
  const result = await encodeNativeAudio(source(), { formatChoice: 'wav', MediaRecorderImpl: null });
  assert.equal(result.extension, 'wav'); assert.equal(result.mimeType, 'audio/wav'); assert.equal(result.seconds, 0.005);
  assert.equal(result.sourceSeconds, 0.005); assert.equal(result.paddingSeconds, 0);
  assert.equal(result.blob.type, 'audio/wav');
  assert.equal(result.blob.size, 44 + 40 * 2, 'WAV output remains unpadded');
  const header = new Uint8Array(await result.blob.slice(0, 12).arrayBuffer());
  assert.equal(String.fromCharCode(...header.slice(0, 4)), 'RIFF'); assert.equal(String.fromCharCode(...header.slice(8, 12)), 'WAVE');
});

test('recording watchdog failure stops the recorder, source, tracks and context', async () => {
  const harness = createHarness();
  await assert.rejects(encodeNativeAudio(source(1), {
    formatChoice: 'webm', MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream,
    setTimeoutImpl: (callback, delay) => setTimeout(callback, delay > 10_000 ? 5 : delay)
  }), /作成が時間内に終わりませんでした/);
  assert.equal(harness.recorders[0].state, 'inactive');
  assert.ok(harness.nodes[0].stopped && harness.nodes[0].disconnected);
  assert.ok(harness.tracks.every((track) => track.stopped));
  assert.ok(harness.contexts[0].closed);
});

test('native encoder rejects over-limit and unsupported codec choices before opening audio devices', async () => {
  const harness = createHarness();
  await assert.rejects(encodeNativeAudio(source(120.1), {
    formatChoice: 'webm', MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream
  }), /2分・64MB/);
  await assert.rejects(encodeNativeAudio(source(), {
    formatChoice: 'mp3', MediaRecorderImpl: harness.Recorder, AudioContextImpl: harness.Context, MediaStreamImpl: harness.Stream
  }), /エンコーダー/);
  assert.equal(harness.contexts.length, 0); assert.equal(harness.recorders.length, 0);
});
