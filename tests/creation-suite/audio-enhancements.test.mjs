import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_BAR_TICKS, AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, audioPixelColumns, audioSongPixels,
  createAudioPlayer, createAudioSong, resizeAudioCanvas, setAudioPixel, validateAudioSong
} from '../../js/creation/audio-core.mjs';
import { AUDIO_EXTRA_INSTRUMENT_IDS, AUDIO_INSTRUMENT_GROUPS, getAudioInstrument } from '../../js/creation/audio-timbres.mjs';
import { importAudioImage } from '../../js/creation/audio-image.mjs';

test('canvas resize preserves old Tick notes, extends into a new region, and refuses destructive shrink', () => {
  let song = createAudioSong({ loopTicks: AUDIO_BAR_TICKS * 2 });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 60, startTick: 31 * AUDIO_PIXEL_TICKS, noteId: 'late-old' });
  assert.equal(audioPixelColumns(song), 32);
  assert.throws(() => resizeAudioCanvas(song, 16), /末尾の音符/);
  const longer = resizeAudioCanvas(song, 64);
  assert.equal(longer.loopTicks, 64 * AUDIO_PIXEL_TICKS);
  assert.equal(longer.tracks[0].clips[0].lengthTicks, longer.loopTicks);
  const extended = setAudioPixel(longer, { trackId: 'track-triangle', pitch: 60, startTick: 50 * AUDIO_PIXEL_TICKS, noteId: 'new-region' });
  assert.equal(validateAudioSong(extended), extended);
  assert.deepEqual(extended.tracks[0].clips[0].notes.map(({ noteId, startTick }) => [noteId, startTick]), [['late-old', 31 * AUDIO_PIXEL_TICKS]]);
  assert.throws(() => resizeAudioCanvas(song, 20), /16\/32\/64\/128列/);
});

test('legacy songs keep the sixteen-column default and canvas projection contains no UI fields', () => {
  const song = { ...createAudioSong(), pixelPalette: undefined };
  assert.equal(audioPixelColumns(song), 16);
  const projected = audioSongPixels(song);
  assert.deepEqual(Object.keys(projected), ['width', 'height', 'palette', 'pixels']);
  assert.deepEqual([projected.width, projected.height, projected.pixels.length], [16, AUDIO_PIXEL_PITCHES.length, 256]);
  assert.ok(projected.pixels.every((pixel) => pixel === -1));
});

function imageDocument(width, height, palette, pixels) {
  return { schemaVersion: 1, width, height, palette, pixels };
}

test('PNG projection samples historical off-grid notes at the same cell starts as the editor', () => {
  const song = createAudioSong();
  song.tracks[0].clips[0].notes = [
    { noteId: 'partial', pitch: 84, startTick: 15, durationTicks: 100, velocity: 80 },
    { noteId: 'offset', pitch: 84, startTick: 130, durationTicks: 130, velocity: 80 }
  ];
  song.tracks[1].clips[0].notes = [{ noteId: 'behind', pitch: 84, startTick: 240, durationTicks: 120, velocity: 80 }];
  assert.deepEqual(audioSongPixels(song).pixels.slice(0, 4), [-1, -1, 0, -1]);
});

test('rectangular Draw image maps occupied cells by nearest sampling to a 16 by 16 pitch canvas', () => {
  const width = 32; const height = 16; const pixels = Array(width * height).fill(-1);
  for (let y = 0; y < height; y += 1) for (let x = 16; x < width; x += 1) pixels[y * width + x] = 0;
  const image = imageDocument(width, height, ['#e75445'], pixels);
  const imported = importAudioImage(createAudioSong(), image);
  const canvas = audioSongPixels(imported);
  assert.deepEqual([canvas.width, canvas.height], [16, 16]);
  assert.equal(canvas.pixels[0], -1); assert.equal(canvas.pixels[8], 0); assert.equal(canvas.pixels[15], 0);
  const notes = imported.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes));
  assert.equal(notes.length, 8 * 16);
  assert.ok(notes.some((note) => note.pitch === AUDIO_PIXEL_PITCHES[0] && note.startTick === 8 * AUDIO_PIXEL_TICKS && note.durationTicks === AUDIO_PIXEL_TICKS));
  assert.equal(new Set(imported.pixelPalette.map(({ color }) => color.toLowerCase())).size, 4);
});

test('transparent image pixels remain empty and import preserves tempo, loop size, and slot instruments', () => {
  const song = createAudioSong({ tempo: 137, loopTicks: AUDIO_BAR_TICKS * 2 });
  const pixels = Array(32 * 16).fill(0);
  const imported = importAudioImage(song, imageDocument(32, 16, ['#aabbcc00'], pixels));
  assert.equal(imported.tempo, song.tempo); assert.equal(imported.loopTicks, song.loopTicks);
  assert.deepEqual(imported.pixelPalette.map(({ slotId, instrument }) => [slotId, instrument]), song.pixelPalette.map(({ slotId, instrument }) => [slotId, instrument]));
  assert.equal(imported.tracks.reduce((count, track) => count + track.clips.reduce((sum, clip) => sum + clip.notes.length, 0), 0), 0);
  assert.equal(new Set(imported.pixelPalette.map(({ color }) => color.toLowerCase())).size, 4);
});

function fakeAudioContext({ resume = async () => {} } = {}) {
  const nodes = [];
  class Param { setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
  class Node {
    constructor() { this.frequency = new Param(); this.detune = new Param(); this.gain = new Param(); this.Q = new Param(); nodes.push(this); }
    connect() {} disconnect() { this.disconnected = true; }
    start() { this.started = true; } stop() { this.stopped = true; } setPeriodicWave() {}
  }
  return {
    nodes,
    context: {
      currentTime: 0, sampleRate: 8000, destination: {}, resume, close: async () => {},
      createOscillator: () => new Node(), createGain: () => new Node(), createBiquadFilter: () => new Node(),
      createPeriodicWave: () => ({}), createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }, createBufferSource: () => new Node()
    }
  };
}

test('preview reuses one context, does not start transport, and stop disconnects bounded preview nodes', async () => {
  const fake = fakeAudioContext(); let contexts = 0; let timers = 0;
  const player = createAudioPlayer({ audioContextFactory: () => { contexts += 1; return fake.context; }, schedule: () => { timers += 1; return 1; }, cancel() {} });
  assert.equal(await player.preview({ instrument: 'synth-bell', pitch: 72 }), true);
  const firstNodes = [...fake.nodes];
  assert.equal(player.isPlaying, false); assert.equal(player.isStarting, false); assert.equal(timers, 0);
  assert.equal(await player.preview({ instrument: 'synth-bell', pitch: 72 }), true);
  assert.ok(firstNodes.every((node) => node.stopped && node.disconnected), 'a drag preview stops and detaches the previous voice');
  assert.equal(contexts, 1);
  await player.dispose();
  assert.ok(fake.nodes.every((node) => node.disconnected));
});

test('preview leaves an already-running transport state and loop timer untouched', async () => {
  const fake = fakeAudioContext(); const timers = [];
  const player = createAudioPlayer({ audioContextFactory: () => fake.context, schedule: (callback) => { const timer = { callback }; timers.push(timer); return timer; }, cancel() {} });
  const song = setAudioPixel(createAudioSong(), { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'transport-note' });
  assert.equal(await player.play(song), true);
  assert.equal(player.isPlaying, true); assert.equal(timers.length, 1);
  assert.equal(await player.preview({ instrument: 'woodblock', pitch: 60 }), true);
  assert.equal(player.isPlaying, true); assert.equal(timers.length, 1);
  player.stop(); await player.dispose();
});

test('stop and dispose cancel preview while awaiting AudioContext resume without creating nodes', async () => {
  let resume; let closeCount = 0;
  const context = { currentTime: 0, resume: () => new Promise((resolve) => { resume = resolve; }), close: async () => { closeCount += 1; } };
  const player = createAudioPlayer({ audioContextFactory: () => context });
  const pending = player.preview({ instrument: 'square', pitch: 60 });
  player.stop(); resume();
  assert.equal(await pending, false);
  assert.equal(closeCount, 0); assert.equal(player.isPlaying, false);
  await player.dispose(); assert.equal(closeCount, 1);
});

test('the added lightweight preset shelf has eight distinct selectable, grouped voices', () => {
  assert.equal(AUDIO_EXTRA_INSTRUMENT_IDS.length, 8);
  assert.equal(new Set(AUDIO_EXTRA_INSTRUMENT_IDS).size, 8);
  for (const id of AUDIO_EXTRA_INSTRUMENT_IDS) assert.ok(getAudioInstrument(id), id);
  const grouped = AUDIO_INSTRUMENT_GROUPS.flatMap(({ instruments }) => instruments.map(({ id }) => id));
  for (const id of AUDIO_EXTRA_INSTRUMENT_IDS) assert.equal(grouped.filter((item) => item === id).length, 1, `${id} appears once`);
});
