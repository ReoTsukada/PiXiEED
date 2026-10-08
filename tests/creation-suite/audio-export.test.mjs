import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readPixelPngMetadata } from '../../js/pixel-png-metadata.mjs';
import { audioImageExportSize } from '../../js/creation/audio-export.mjs';
import { AUDIO_INSTRUMENTS, AUDIO_MAX_LOOP_TICKS, AUDIO_PPQ, AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, createAudioSong, setAudioPixel } from '../../js/creation/audio-core.mjs';
import { audioExportLoops, encodeImportedAudioWav, encodeWav, exportAudioImage, renderAudioWav } from '../../js/creation/audio-export.mjs';

function fakeOfflineContextClass() {
  const starts = []; const scheduledStops = [];
  class Param { setValueAtTime(value) { this.value = value; } linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
  class Node {
    constructor() { this.frequency = new Param(); this.detune = new Param(); this.gain = new Param(); }
    connect() {}
    disconnect() {}
    setPeriodicWave() {}
    start(when) { starts.push({ when, frequency: this.frequency.value }); }
    stop(when) { scheduledStops.push(when); }
  }
  return class FakeOfflineContext {
    static starts = starts;
    static scheduledStops = scheduledStops;
    constructor(numberOfChannels, length, sampleRate) {
      this.numberOfChannels = numberOfChannels; this.length = length; this.sampleRate = sampleRate; this.destination = {};
      this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      this.channels[0][10] = 0.4;
    }
    createGain() { return new Node(); }
    createOscillator() { return new Node(); }
    createPeriodicWave() { return {}; }
    async startRendering() { return { numberOfChannels: this.numberOfChannels, length: this.length, sampleRate: this.sampleRate, getChannelData: (channel) => this.channels[channel] }; }
  };
}

function pngFixture(width, height) {
  const chunk = (type, data) => {
    const bytes = Buffer.alloc(data.length + 12); bytes.writeUInt32BE(data.length); bytes.write(type, 4); bytes.set(data, 8);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(4, bytes.length - 4)) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4); return bytes;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))], { type: 'image/png' });
}

test('PNG uses an integer enlargement while preserving rectangular music dimensions', () => {
  assert.deepEqual(audioImageExportSize(16, 16), { width: 2048, height: 2048, scale: 128 });
  assert.deepEqual(audioImageExportSize(32, 16), { width: 2048, height: 1024, scale: 64 });
  assert.deepEqual(audioImageExportSize(64, 16), { width: 2048, height: 512, scale: 32 });
  assert.deepEqual(audioImageExportSize(48, 16), { width: 2016, height: 672, scale: 42 });
});

test('invalid or unbounded export dimensions fail before allocating a canvas', () => {
  for (const args of [[0, 16], [-1, 16], [1.5, 16], [16, 16, Infinity], [16, 16, 9000]]) assert.throws(() => audioImageExportSize(...args), RangeError);
});

test('PXD working-image RGBA reaches the export canvas and integer scaling disables smoothing', async () => {
  const canvases = [];
  const document = { createElement() {
    const canvas = { width: 0, height: 0, toBlob(callback) { callback(pngFixture(this.width, this.height)); } };
    const context = { imageSmoothingEnabled: true, createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; }, putImageData(data) { this.imageData = data; }, drawImage(source) { this.source = source; } };
    canvas.getContext = () => context; canvas.context = context; canvases.push(canvas); return canvas;
  } };
  const image = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  image.rgba.set([7, 8, 9, 0], 0); image.rgba.set([12, 34, 56, 127], 4);
  const result = await exportAudioImage(createAudioSong({ songId: 'export-pxd' }), { document, image });
  assert.equal(result.blob.type, 'image/png');
  assert.deepEqual([...canvases[0].context.imageData.data.slice(0, 8)], [7, 8, 9, 0, 12, 34, 56, 127]);
  assert.equal(canvases[1].context.source, canvases[0]);
  assert.equal(canvases[1].context.imageSmoothingEnabled, false);
  assert.equal(result.width, 2048); assert.equal(result.height, 2048);
  assert.deepEqual(readPixelPngMetadata(new Uint8Array(await result.blob.arrayBuffer())), { version: 1, width: 16, height: 16, scale: 128 });
  assert.equal(canvases[0].width, 1); assert.equal(canvases[1].height, 1);
});

test('sound export: the loop repeats to about 8 seconds and the WAV header matches the samples', () => {
  const song = createAudioSong({ songId: 'wav', tempo: 120 });
  assert.equal(audioExportLoops(song), 4);
  assert.equal(audioExportLoops({ ...song, tempo: 30 }), 1);
  const left = new Float32Array([0, 1, -1]); const right = new Float32Array([0.5, 0, 0]);
  const wav = encodeWav({ numberOfChannels: 2, sampleRate: 44100, length: 3, getChannelData: (c) => (c ? right : left) });
  const view = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF'); assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
  assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(24, true), 44100); assert.equal(view.getUint32(40, true), 12);
  assert.equal(wav.length, 44 + 12); assert.equal(view.getInt16(44 + 4, true), 32767); assert.equal(view.getInt16(44 + 8, true), -32768);
});

test('WAV scheduler runs lookahead timers so late notes sound in a single full loop and release is retained', async () => {
  const song = setAudioPixel(createAudioSong({ songId: 'wav-late', tempo: 120 }), {
    trackId: 'track-square', pitch: 60, startTick: 1440, noteId: 'wav-late-note'
  });
  const originalNotes = structuredClone(song.tracks.map((track) => track.clips.map((clip) => clip.notes)));
  const OfflineContext = fakeOfflineContextClass();
  const result = await renderAudioWav(song, { loops: 1, sampleRate: 8000, OfflineContext });
  const expectedOnset = 0.035 + 1440 * 60 / song.tempo / 480;
  assert.ok(OfflineContext.starts.some(({ when }) => Math.abs(when - expectedOnset) < 0.001), 'the note beyond the initial one-second lookahead is scheduled');
  assert.ok(OfflineContext.scheduledStops.some((time) => time > expectedOnset + 0.25), 'the note release is scheduled after its gate');
  assert.equal(OfflineContext.starts.some(({ when }) => when >= expectedOnset + 2), false, 'one-loop export does not begin another cycle');
  assert.equal(result.loops, 1);
  assert.deepEqual(song.tracks.map((track) => track.clips.map((clip) => clip.notes)), originalNotes, 'export leaves source notes untouched');
});

test('WAV scheduler renders every requested loop including late top and bottom notes, then leaves the final release tail', async () => {
  let song = createAudioSong({ songId: 'wav-multi', tempo: 120 });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 60, startTick: 1440, noteId: 'wav-late-note' });
  for (const [row, pitch] of AUDIO_PIXEL_PITCHES.entries()) {
    song = setAudioPixel(song, { trackId: 'track-square', pitch, startTick: 1800, noteId: `wav-run-${row}` });
  }
  song = {
    ...song,
    tracks: song.tracks.map((track) => track.trackId !== 'track-square' ? track : {
      ...track,
      clips: track.clips.map((clip) => ({
        ...clip,
        notes: clip.notes.map((note) => note.startTick === 1800
          ? { ...note, sourceCell: { kind: 'audio-image', x: 15, y: AUDIO_PIXEL_PITCHES.indexOf(note.pitch) } }
          : note)
      }))
    })
  };
  const originalNotes = structuredClone(song.tracks.map((track) => track.clips.map((clip) => clip.notes)));
  const OfflineContext = fakeOfflineContextClass();
  const result = await renderAudioWav(song, { loops: 2, sampleRate: 8000, OfflineContext });
  const tickSeconds = 60 / song.tempo / AUDIO_PPQ;
  for (const tick of [1440, 1800]) {
    const onset = 0.035 + tick * tickSeconds;
    assert.ok(OfflineContext.starts.some(({ when }) => Math.abs(when - onset) < 0.001), `loop one schedules tick ${tick}`);
    assert.equal(OfflineContext.starts.filter(({ when }) => Math.abs(when - (onset + 2)) < 0.001).length, tick === 1800 ? 2 : 1, `loop two schedules the source run at tick ${tick}`);
  }
  const finalEndpointOnset = 0.035 + 1800 * tickSeconds + 2;
  const endpointVoices = OfflineContext.starts.filter(({ when }) => Math.abs(when - finalEndpointOnset) < 0.001);
  assert.equal(endpointVoices.length, 2, 'a thick shared-image run plays only its upper and lower endpoint');
  const endpointPitches = endpointVoices.map(({ frequency }) => Math.round(69 + 12 * Math.log2(frequency / 440))).sort((a, b) => a - b);
  assert.deepEqual(endpointPitches, [48, 84]);
  const thirdLoopLateOnset = 0.035 + 1440 * tickSeconds + 4;
  assert.equal(OfflineContext.starts.some(({ when }) => Math.abs(when - thirdLoopLateOnset) < 0.001), false, 'no third loop is started');
  const finalEndpointSoundEnd = 0.035 + 1800 * tickSeconds + 2 + AUDIO_PIXEL_TICKS * tickSeconds + AUDIO_INSTRUMENTS.find(({ id }) => id === 'square').release + 0.005;
  assert.ok(OfflineContext.scheduledStops.some((time) => Math.abs(time - finalEndpointSoundEnd) < 0.002), 'the second-loop endpoint release is scheduled through its tail');
  assert.equal(result.loops, 2);
  assert.ok(result.seconds > 4, 'the rendered file includes the release tail');
  assert.deepEqual(song.tracks.map((track) => track.clips.map((clip) => clip.notes)), originalNotes, 'multi-loop export leaves source notes untouched');
  const wav = new Uint8Array(await result.blob.arrayBuffer());
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.ok(new DataView(wav.buffer).getInt16(84, true) > 20000, 'peak normalization is retained');
});

test('long WAV requests are rejected before allocating an OfflineAudioContext', async () => {
  const song = setAudioPixel(createAudioSong({ loopTicks: AUDIO_MAX_LOOP_TICKS }), {
    trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'long-export-note'
  });
  let allocations = 0;
  class OfflineContext { constructor() { allocations += 1; throw new Error('should be admitted before allocation'); } }
  await assert.rejects(renderAudioWav(song, { loops: 1, OfflineContext }), /120秒以内/);
  assert.equal(allocations, 0);
});

test('WAV encoding enforces its byte cap before allocating the output buffer', () => {
  assert.throws(() => encodeWav({ numberOfChannels: 2, sampleRate: 44100, length: 20_000_000, getChannelData() { throw new Error('must not read'); } }), /64MBまで/);
});

test('imported WAV conversion yields progress, writes PCM safely, and observes cancellation', async () => {
  const channel = new Float32Array(2050); channel[1] = 0.5; channel[2] = -1;
  const progress = []; let yields = 0;
  const blob = await encodeImportedAudioWav({ channels: [channel], sampleRate: 8000 }, { chunkFrames: 1024, onProgress: (value) => progress.push(value), yieldTask: async () => { yields += 1; } });
  const bytes = new Uint8Array(await blob.arrayBuffer()); const view = new DataView(bytes.buffer);
  assert.equal(blob.type, 'audio/wav'); assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
  assert.equal(view.getUint32(40, true), channel.length * 2); assert.equal(view.getInt16(46, true), 16383); assert.equal(view.getInt16(48, true), -32768);
  assert.equal(progress.length, 3); assert.equal(progress.at(-1), 1); assert.equal(yields, 2);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(encodeImportedAudioWav({ channels: [new Float32Array([0])], sampleRate: 8000 }, { signal: controller.signal }), { name: 'AbortError' });
});
