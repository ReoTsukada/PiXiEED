import test from 'node:test';
import assert from 'node:assert/strict';
import { audioVideoFrameSize, chooseAudioVideoMimeType, renderAudioVideo } from '../../js/creation/audio-video.mjs';
import { createAudioSong, setAudioPixel } from '../../js/creation/audio-core.mjs';

test('video frame sizing preserves the source aspect ratio and stays bounded', () => {
  assert.deepEqual(audioVideoFrameSize(16, 16), { width: 1024, height: 1024, scale: 64 });
  assert.deepEqual(audioVideoFrameSize(128, 16), { width: 1024, height: 128, scale: 8 });
  assert.deepEqual(audioVideoFrameSize(128, 16, { longEdge: 512, maxEdge: 1024 }), { width: 512, height: 64, scale: 4 });
  assert.throws(() => audioVideoFrameSize(0, 16), /サイズ/);
});

test('video format prefers a supported MP4 encoder and falls back to WebM', () => {
  class Mp4Recorder { static isTypeSupported(type) { return type.startsWith('video/mp4'); } }
  class WebmRecorder { static isTypeSupported(type) { return type === 'video/webm;codecs=vp8,opus'; } }
  assert.deepEqual(chooseAudioVideoMimeType(Mp4Recorder), { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' });
  assert.deepEqual(chooseAudioVideoMimeType(WebmRecorder), { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' });
  assert.equal(chooseAudioVideoMimeType(class Unsupported { static isTypeSupported() { return false; } }), null);
});

function makeHarness({ failRecorder = false } = {}) {
  const timers = []; const intervals = []; const audioTracks = []; const videoTracks = []; const contexts = [];
  const draws = []; const listeners = new Map(); let recorderInstance; let observedDestination; let mediaDestination;
  class Track { constructor(kind) { this.kind = kind; this.stopped = false; } stop() { this.stopped = true; } }
  class FakeCanvas {
    constructor() { this.width = 0; this.height = 0; this.context = {
      imageSmoothingEnabled: true,
      createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData(data) { draws.push(['pixels', [...data.data]]); },
      fillRect(...args) { draws.push(['fill', ...args]); },
      drawImage(...args) { draws.push(['image', ...args]); }
    }; }
    getContext() { return this.context; }
    captureStream() { const track = new Track('video'); videoTracks.push(track); return { getTracks: () => [track], getVideoTracks: () => [track] }; }
  }
  const documentRef = {
    visibilityState: 'visible', createElement: () => new FakeCanvas(),
    addEventListener(type, callback) { listeners.set(type, callback); }, removeEventListener(type) { listeners.delete(type); }
  };
  class FakeAudioContext {
    constructor() { this.state = 'running'; this.destination = { original: true }; this.currentTime = 0; this.closed = false; contexts.push(this); }
    createMediaStreamDestination() { const track = new Track('audio'); audioTracks.push(track); mediaDestination = { stream: { getTracks: () => [track], getAudioTracks: () => [track] } }; return mediaDestination; }
    createGain() { return { gain: { value: 1 }, connect(destination) { this.destination = destination; } }; }
    async resume() {}
    async close() { this.closed = true; this.state = 'closed'; }
  }
  class FakeMediaStream { constructor(tracks) { this.tracks = tracks; } getTracks() { return this.tracks; } }
  class FakeRecorder {
    static isTypeSupported(type) { return type.startsWith('video/webm'); }
    constructor(stream, options) { this.stream = stream; this.mimeType = options.mimeType; this.state = 'inactive'; this.listeners = new Map(); recorderInstance = this; }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    start() { if (failRecorder) throw new Error('recorder failed'); this.state = 'recording'; }
    stop() { if (this.state !== 'recording') return; this.state = 'inactive'; this.listeners.get('dataavailable')?.({ data: new Blob(['video'], { type: this.mimeType }) }); this.listeners.get('stop')?.(); }
  }
  const playerFactory = ({ audioContextFactory, schedule }) => {
    const routed = audioContextFactory(); observedDestination = routed.destination;
    return {
      async play() { await routed.resume(); schedule(() => assert.fail('must not start a second loop'), 2000); return true; },
      stop() {}, async dispose() { await routed.close(); }
    };
  };
  const dependencies = {
    MediaRecorderImpl: FakeRecorder, AudioContextImpl: FakeAudioContext, MediaStreamImpl: FakeMediaStream,
    documentRef, playerFactory,
    setTimeoutImpl(callback, delay) { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeoutImpl(timer) { if (timer) timer.cleared = true; },
    setIntervalImpl(callback, delay) { const timer = { callback, delay, cleared: false }; intervals.push(timer); return timer; },
    clearIntervalImpl(timer) { if (timer) timer.cleared = true; }
  };
  return { dependencies, timers, intervals, audioTracks, videoTracks, contexts, draws, listeners, get recorder() { return recorderInstance; }, get observedDestination() { return observedDestination; }, get mediaDestination() { return mediaDestination; } };
}

function fixture() {
  const song = setAudioPixel(createAudioSong({ tempo: 120 }), { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'video-note' });
  const image = { width: 16, height: 16, rgba: new Uint8ClampedArray(16 * 16 * 4).fill(37) };
  return { song, image };
}

test('records exactly one loop to a routed audio track and releases every recording resource', async () => {
  const harness = makeHarness(); const { song, image } = fixture();
  const pending = renderAudioVideo(song, image, harness.dependencies);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.observedDestination.destination, harness.mediaDestination, 'synth output is routed to the recording destination');
  assert.equal(harness.recorder.stream.tracks.length, 2, 'the recording has one video and one audio track');
  assert.equal(harness.recorder.state, 'recording');
  assert.deepEqual(harness.draws.find(([kind]) => kind === 'pixels')[1].slice(0, 4), [37, 37, 37, 37], 'the source RGBA image is retained');
  const loopDelay = song.loopTicks * 60 / song.tempo / 480 * 1000;
  harness.timers.find(({ delay, cleared }) => !cleared && delay === loopDelay + 40).callback();
  const tail = harness.timers.find(({ delay, cleared }) => !cleared && delay > 80 && delay < 1000);
  tail.callback();
  const result = await pending;
  assert.equal(result.extension, 'webm'); assert.equal(result.seconds, 2); assert.equal(result.blob.size, 5);
  assert.ok(harness.audioTracks.every((track) => track.stopped)); assert.ok(harness.videoTracks.every((track) => track.stopped));
  assert.ok(harness.contexts.every((context) => context.closed)); assert.equal(harness.intervals.every(({ cleared }) => cleared), true);
  assert.equal(harness.listeners.size, 0);
});

test('abort rejects promptly, stops recorder, tracks, and audio context', async () => {
  const harness = makeHarness(); const { song, image } = fixture(); const controller = new AbortController();
  const pending = renderAudioVideo(song, image, { ...harness.dependencies, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve)); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(harness.recorder.state, 'inactive'); assert.ok(harness.audioTracks[0].stopped); assert.ok(harness.videoTracks[0].stopped);
  assert.ok(harness.contexts[0].closed); assert.ok(harness.timers.every(({ cleared }) => cleared));
});

test('recorder startup errors clean up streams and audio resources', async () => {
  const harness = makeHarness({ failRecorder: true }); const { song, image } = fixture();
  await assert.rejects(renderAudioVideo(song, image, harness.dependencies), /recorder failed/);
  assert.ok(harness.audioTracks[0].stopped); assert.ok(harness.videoTracks[0].stopped); assert.ok(harness.contexts[0].closed);
});
