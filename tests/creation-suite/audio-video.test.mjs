import test from 'node:test';
import assert from 'node:assert/strict';
import { audioVideoFrameSize, chooseAudioVideoMimeType, renderAudioVideo } from '../../js/creation/audio-video.mjs';
import { AUDIO_MAX_LOOP_TICKS, createAudioPlayer, createAudioSong, setAudioPixel, setAudioPixelPalette } from '../../js/creation/audio-core.mjs';
import { getAudioInstrument } from '../../js/creation/audio-timbres.mjs';

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

function makeHarness({ failRecorder = false, playerFactory } = {}) {
  const timers = []; const intervals = []; const audioTracks = []; const videoTracks = []; const contexts = []; const sources = [];
  let now = 0;
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
    constructor() { this.state = 'running'; this.destination = { original: true }; this.closed = false; contexts.push(this); }
    get currentTime() { return now / 1000; }
    createMediaStreamDestination() { const track = new Track('audio'); audioTracks.push(track); mediaDestination = { stream: { getTracks: () => [track], getAudioTracks: () => [track] } }; return mediaDestination; }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect(destination) { this.destination = destination; }, disconnect() {} }; }
    createOscillator() { const source = { frequency: { setValueAtTime() {} }, detune: { setValueAtTime() {} }, connect() {}, disconnect() {}, start: (at) => { sources.push(at); }, stop() {} }; return source; }
    createBiquadFilter() { return { frequency: { value: 0 }, Q: { value: 0 }, connect() {}, disconnect() {} }; }
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
  const fakePlayerFactory = ({ audioContextFactory, schedule }) => {
    const routed = audioContextFactory(); observedDestination = routed.destination;
    return {
      async play() { await routed.resume(); schedule(() => { this.schedulerCallbackRan = true; }, 25); return true; },
      stopAfterCurrentLoop() { this.stopAfterLoopRequested = true; return true; },
      stop() {}, async dispose() { await routed.close(); }
    };
  };
  const dependencies = {
    MediaRecorderImpl: FakeRecorder, AudioContextImpl: FakeAudioContext, MediaStreamImpl: FakeMediaStream,
    documentRef, playerFactory: playerFactory || fakePlayerFactory,
    setTimeoutImpl(callback, delay) { const timer = { callback, delay, due: now + delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeoutImpl(timer) { if (timer) timer.cleared = true; },
    setIntervalImpl(callback, delay) { const timer = { callback, delay, cleared: false }; intervals.push(timer); return timer; },
    clearIntervalImpl(timer) { if (timer) timer.cleared = true; }
  };
  function runNextTimer(before = Infinity) {
    const timer = timers.filter((candidate) => !candidate.cleared && candidate.due <= before).sort((a, b) => a.due - b.due)[0];
    if (!timer) return null;
    timer.cleared = true; now = timer.due; timer.callback(); return timer;
  }
  return { dependencies, timers, intervals, audioTracks, videoTracks, contexts, draws, listeners, sources, runNextTimer, get now() { return now; }, get recorder() { return recorderInstance; }, get observedDestination() { return observedDestination; }, get mediaDestination() { return mediaDestination; } };
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
  const completion = harness.timers.find(({ delay, cleared }) => !cleared && delay > 2000 && delay < 2500);
  assert.ok(completion, 'recording completion is scheduled independently after the song and release tail');
  harness.runNextTimer(completion.due - 1);
  assert.equal(harness.recorder.state, 'recording', 'the player lookahead callback does not finish recording');
  assert.ok(harness.timers.some(({ delay, cleared }) => delay === 25 && cleared), 'a scheduled audio-player callback actually ran');
  assert.equal(harness.recorder.state, 'recording', 'the song remains recorded until its independent completion deadline');
  while (harness.runNextTimer(completion.due - 1)) {}
  assert.equal(harness.recorder.state, 'recording');
  harness.runNextTimer(completion.due);
  const result = await pending;
  assert.equal(result.extension, 'webm'); assert.equal(result.seconds, 2); assert.equal(result.blob.size, 5);
  assert.ok(harness.audioTracks.every((track) => track.stopped)); assert.ok(harness.videoTracks.every((track) => track.stopped));
  assert.ok(harness.contexts.every((context) => context.closed)); assert.equal(harness.intervals.every(({ cleared }) => cleared), true);
  assert.equal(harness.timers.every(({ cleared }) => cleared), true);
  assert.equal(harness.listeners.size, 0);
});

test('generated-song video records a finite selected play count at the unchanged tempo', async () => {
  let tick = 0; let stopRequests = 0;
  const playerFactory = () => ({
    get currentTick() { return tick; },
    async play() { return true; },
    stopAfterCurrentLoop() { stopRequests += 1; return true; },
    stop() {}, async dispose() {}
  });
  const harness = makeHarness({ playerFactory }); const { song, image } = fixture();
  const pending = renderAudioVideo(song, image, { ...harness.dependencies, totalPlays: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopRequests, 0, 'the first two musical loops are allowed to continue');
  const progress = harness.intervals[0].callback;
  tick = 100; progress(); tick = 0; progress();
  assert.equal(stopRequests, 0, 'one detected loop boundary leaves two plays remaining');
  tick = 100; progress(); tick = 0; progress();
  assert.equal(stopRequests, 1, 'the final requested musical loop is stopped at its end');
  const completion = harness.timers.find(({ delay, cleared }) => !cleared && delay > 6000 && delay < 7000);
  assert.ok(completion, 'the recorder is sized to three times the source song length');
  while (harness.runNextTimer(completion.due - 1)) {}
  harness.runNextTimer(completion.due);
  const result = await pending;
  assert.equal(result.seconds, 6);
  assert.equal(result.totalPlays, 3);
  assert.equal(result.hasAudio, true);
});

test('real player lookahead schedules late notes and one frame records through the full music loop and release tail', async () => {
  const harness = makeHarness({ playerFactory: createAudioPlayer });
  const { image } = fixture();
  let song = setAudioPixel(createAudioSong({ tempo: 120 }), { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'early-video-note' });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 84, startTick: 1200, noteId: 'late-video-note' });
  let resolved = false;
  const pending = renderAudioVideo(song, image, { ...harness.dependencies, frameImages: [image], frameTicks: 1 }).then((result) => { resolved = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.recorder.state, 'recording');
  const firstLookahead = harness.timers.find(({ delay, cleared }) => delay === 25 && !cleared);
  assert.ok(firstLookahead, 'the real player schedules its 25ms lookahead callback');
  harness.runNextTimer(firstLookahead.due);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.recorder.state, 'recording', 'lookahead callbacks cannot be mistaken for loop completion');
  assert.equal(resolved, false);

  const loopMs = song.loopTicks * 60 / song.tempo / 480 * 1000;
  const completion = harness.timers.filter(({ cleared }) => !cleared).find(({ delay }) => delay > loopMs && delay < loopMs + 1000);
  assert.ok(completion);
  assert.equal(completion.delay, Math.ceil(loopMs + 35 + Math.ceil(getAudioInstrument('square').release * 1000) + 80));
  while (harness.runNextTimer(completion.due - 1)) {}
  assert.ok(harness.sources.length >= 2, 'the late note was scheduled by the live player lookahead');
  assert.equal(harness.recorder.state, 'recording', 'single-frame output is held until the music loop and release tail end');
  assert.equal(resolved, false);
  harness.runNextTimer(completion.due);
  const result = await pending;
  assert.equal(result.seconds, 2, 'reported seconds remain the musical loop duration');
  assert.equal(harness.recorder.state, 'inactive');
  assert.ok(harness.timers.every(({ cleared }) => cleared));
});

test('multi-frame video holds its final frame through audio completion', async () => {
  const harness = makeHarness(); const { song, image } = fixture();
  const lastFrame = { width: image.width, height: image.height, rgba: new Uint8ClampedArray(image.rgba.length).fill(88) };
  const pending = renderAudioVideo(song, image, { ...harness.dependencies, frameImages: [image, lastFrame], frameTicks: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  const completion = harness.timers.find(({ delay, cleared }) => !cleared && delay > 2000 && delay < 2500);
  while (harness.runNextTimer(completion.due - 1)) {}
  harness.runNextTimer(completion.due);
  await pending;
  const finalPixels = harness.draws.filter(([kind]) => kind === 'pixels').at(-1)[1];
  assert.deepEqual(finalPixels.slice(0, 4), [88, 88, 88, 88]);
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

test('long video requests are rejected before creating media or canvas resources', async () => {
  const harness = makeHarness();
  const song = setAudioPixel(createAudioSong({ loopTicks: AUDIO_MAX_LOOP_TICKS }), {
    trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'long-video-note'
  });
  const image = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  await assert.rejects(renderAudioVideo(song, image, harness.dependencies), /120秒以内/);
  assert.equal(harness.contexts.length, 0);
  assert.equal(harness.recorder, undefined);
  assert.equal(harness.draws.length, 0);
});

test('generated-song play count respects the 120-second total recording bound', async () => {
  const harness = makeHarness();
  const song = setAudioPixel(createAudioSong({ loopTicks: AUDIO_MAX_LOOP_TICKS, tempo: 120 }), {
    trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'long-multi-play-note'
  });
  const image = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  await assert.rejects(renderAudioVideo(song, image, { ...harness.dependencies, totalPlays: 2 }), /合計120秒以内/);
  assert.equal(harness.contexts.length, 0);
  assert.equal(harness.recorder, undefined);
});

test('invalid animation video frames are rejected before recording resources are created', async () => {
  const harness = makeHarness(); const { song, image } = fixture();
  await assert.rejects(renderAudioVideo(song, image, { ...harness.dependencies, frameImages: [{ ...image, width: 1 }] }), /動画のコマ/);
  assert.equal(harness.contexts.length, 0); assert.equal(harness.draws.length, 0);
});


test('drum video retains the full crash one-shot after the loop boundary', async () => {
  const harness = makeHarness(); const { image } = fixture();
  let song = setAudioPixel(createAudioSong({ tempo: 120 }), { trackId: 'track-square', pitch: 84, startTick: 1800, noteId: 'final-crash' });
  song = setAudioPixelPalette(song, { slotId: 'square', instrument: 'drum-crash' });
  const original = structuredClone(song);
  const pending = renderAudioVideo(song, image, harness.dependencies);
  await new Promise((resolve) => setImmediate(resolve));
  const deadline = 35 + 2000 + Math.ceil(getAudioInstrument('drum-crash').drum.duration * 1000) + 80;
  const completion = harness.timers.find(({ delay, cleared }) => !cleared && delay === deadline);
  assert.ok(completion, 'recorder deadline includes the entire fixed drum duration');
  while (harness.runNextTimer(completion.due - 1)) {}
  assert.equal(harness.recorder.state, 'recording');
  harness.runNextTimer(completion.due);
  await pending;
  assert.deepEqual(song, original);
});
