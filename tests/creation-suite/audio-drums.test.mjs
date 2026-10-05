import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_PIXEL_TICKS, collectAudioEvents, createAudioPlayer, createAudioSong, setAudioPixel, setAudioPixelPalette } from '../../js/creation/audio-core.mjs?rev=20261005-audio-drums-1';

function drumSong({ square = 'drum-kick', triangle = 'drum-kick' } = {}) {
  let song = createAudioSong({ tempo: 120 });
  song = setAudioPixelPalette(song, { slotId: 'square', instrument: square });
  song = setAudioPixelPalette(song, { slotId: 'triangle', instrument: triangle });
  return song;
}

function pixel(song, slot, pitch, startTick, velocity, noteId) {
  return setAudioPixel(song, { trackId: `track-${slot}`, pitch, startTick, velocity, noteId });
}

test('one drum color and column make one fixed-pitch hit at the strongest row velocity', () => {
  let song = drumSong();
  song = pixel(song, 'square', 84, 0, 48, 'low-row');
  song = pixel(song, 'square', 48, 0, 112, 'high-row');
  const stored = song.tracks[0].clips[0].notes;
  const raw = collectAudioEvents(song);
  const hits = collectAudioEvents(song, { joinAdjacent: true, outlineRuns: true });

  assert.equal(raw.length, 2, 'the editable song still stores both row notes');
  assert.equal(hits.length, 1);
  assert.deepEqual([hits[0].pitch, hits[0].velocity, hits[0].startTick], [60, 112, 0]);
  assert.equal(hits[0].sourceCell, undefined);
  assert.equal(song.tracks[0].clips[0].notes, stored, 'playback projection never mutates saved notes');
});

test('different drum colors coexist and same-color manual notes at one time deduplicate', () => {
  let song = drumSong({ square: 'drum-kick', triangle: 'drum-snare' });
  song = pixel(song, 'square', 84, 0, 80, 'kick');
  song = pixel(song, 'square', 81, 0, 100, 'duplicate-kick');
  song = pixel(song, 'triangle', 84, 0, 90, 'snare');
  const hits = collectAudioEvents(song, { joinAdjacent: true, outlineRuns: true });
  assert.equal(hits.length, 2);
  assert.deepEqual(new Set(hits.map(({ instrument }) => instrument)), new Set(['drum-kick', 'drum-snare']));
  assert.deepEqual(hits.map(({ velocity }) => velocity).sort((a, b) => a - b), [90, 100]);
});

test('adjacent manual drum pixels retrigger; a merged source-cell run expands to columns', () => {
  let song = drumSong();
  song = pixel(song, 'square', 60, 0, 90, 'manual-0');
  song = pixel(song, 'square', 60, AUDIO_PIXEL_TICKS, 90, 'manual-1');
  let hits = collectAudioEvents(song, { joinAdjacent: true, outlineRuns: true });
  assert.deepEqual(hits.map(({ startTick, durationTicks }) => [startTick, durationTicks]), [[0, AUDIO_PIXEL_TICKS], [AUDIO_PIXEL_TICKS, AUDIO_PIXEL_TICKS]]);

  song = drumSong();
  song = pixel(song, 'square', 72, 0, 88, 'merged-image');
  song = { ...song, tracks: song.tracks.map((track) => track.trackId === 'track-square' ? {
    ...track, clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note) => ({ ...note, durationTicks: AUDIO_PIXEL_TICKS * 2, sourceCell: { kind: 'audio-image', x: 4, y: 2 } })) }))
  } : track) };
  const before = song.tracks[0].clips[0].notes[0];
  hits = collectAudioEvents(song, { joinAdjacent: true, outlineRuns: true });
  assert.deepEqual(hits.map(({ startTick, sourceCell }) => [startTick, sourceCell.x, sourceCell.y]), [[0, 4, 0], [AUDIO_PIXEL_TICKS, 5, 0]]);
  assert.equal(song.tracks[0].clips[0].notes[0], before);
  assert.equal(song.tracks[0].clips[0].notes[0].durationTicks, AUDIO_PIXEL_TICKS * 2);

  song = drumSong();
  song = pixel(song, 'square', 72, 0, 88, 'legacy-long-cell');
  song = { ...song, tracks: song.tracks.map((track) => track.trackId === 'track-square' ? {
    ...track, clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note) => ({ ...note, durationTicks: AUDIO_PIXEL_TICKS * 2, sourceCell: { x: 4, y: 2 } })) }))
  } : track) };
  hits = collectAudioEvents(song, { joinAdjacent: true, outlineRuns: true });
  assert.deepEqual(hits.map(({ startTick, durationTicks }) => [startTick, durationTicks]), [[0, AUDIO_PIXEL_TICKS * 2]], 'untyped legacy source cells remain one hit');
});

test('animation frame provenance keeps distinct source frames while collapsing each frame column', () => {
  let song = drumSong();
  song = pixel(song, 'square', 84, 0, 70, 'frame-a-row-a');
  song = pixel(song, 'square', 48, 0, 96, 'frame-a-row-b');
  song = pixel(song, 'square', 72, 0, 80, 'frame-b');
  song = { ...song, tracks: song.tracks.map((track) => track.trackId === 'track-square' ? {
    ...track, clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note, index) => ({ ...note, sourceCell: index < 2
      ? { kind: 'audio-animation', frameId: 'frame-a', frameIndex: 0, x: 2, localX: 2, y: index }
      : { kind: 'audio-animation', frameId: 'frame-b', frameIndex: 1, x: 2, localX: 2, y: 9 } })) }))
  } : track) };
  const hits = collectAudioEvents(song, { joinAdjacent: true, outlineRuns: true });
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map(({ sourceCell, velocity }) => [sourceCell.frameId, sourceCell.y, velocity]), [['frame-a', 0, 96], ['frame-b', 0, 80]]);
});

class Param {
  constructor() { this.value = 0; this.events = []; }
  setValueAtTime(value, at) { this.value = value; this.events.push(['set', value, at]); }
  linearRampToValueAtTime(value, at) { this.events.push(['linear', value, at]); }
  exponentialRampToValueAtTime(value, at) { this.events.push(['exponential', value, at]); }
  cancelScheduledValues(at) { this.events.push(['cancel', at]); }
}
class Node {
  constructor(type) { this.type = type; this.frequency = new Param(); this.detune = new Param(); this.gain = new Param(); this.Q = new Param(); this.stops = []; }
  connect() {}
  disconnect() {}
  start(at) { this.startedAt = at; }
  stop(at) { this.stops.push(at); }
  setPeriodicWave(wave) { this.wave = wave; }
}
function fakeContext() {
  const nodes = [];
  return { nodes, context: {
    currentTime: 0, sampleRate: 44100, destination: {}, resume: async () => {}, close: async () => {},
    createOscillator() { const node = new Node('oscillator'); nodes.push(node); return node; },
    createGain() { const node = new Node('gain'); nodes.push(node); return node; },
    createBiquadFilter() { const node = new Node('filter'); nodes.push(node); return node; },
    createDynamicsCompressor() { const node = new Node('compressor'); nodes.push(node); return node; },
    createPeriodicWave(real, imag) { return { real, imag }; },
    createBuffer(_channels, length) { return { duration: length / 44100, length, getChannelData: () => new Float32Array(length) }; },
    createBufferSource() { const node = new Node('buffer'); nodes.push(node); return node; }
  } };
}

test('drum pitch is preset-fixed, one-shot duration ignores note gate, and hats choke at the next hit', async () => {
  const fake = fakeContext();
  let song = drumSong();
  song = pixel(song, 'square', 48, 0, 92, 'kick-low-row');
  song = pixel(song, 'square', 84, AUDIO_PIXEL_TICKS, 92, 'kick-high-row');
  const player = createAudioPlayer({ audioContextFactory: () => fake.context, schedule: () => 1, cancel() {} });
  await player.play(song);
  const fundamentals = fake.nodes.filter((node) => node.frequency.events.some(([, value]) => Math.abs(value - 52) < 1e-9));
  assert.equal(fundamentals.length, 2, 'both octaves resolve to the kit kick fundamental');
  const kickStops = fundamentals.map((node) => node.stops.at(-1));
  assert.ok(fundamentals.every((node) => Math.abs(node.stops.at(-1) - (node.startedAt + 0.42)) < 1e-6));
  player.stop();

  const hats = fakeContext();
  song = drumSong({ square: 'drum-hat-open', triangle: 'drum-hat-closed' });
  song = setAudioPixelPalette(song, { slotId: 'sawtooth', instrument: 'drum-hat-closed' });
  song = pixel(song, 'square', 84, 0, 90, 'open-hat');
  song = pixel(song, 'triangle', 48, 0, 90, 'same-time-closed-hat');
  song = pixel(song, 'sawtooth', 48, AUDIO_PIXEL_TICKS * 2, 90, 'later-closed-hat');
  const hatPlayer = createAudioPlayer({ audioContextFactory: () => hats.context, schedule: () => 1, cancel() {} });
  await hatPlayer.play(song);
  const sameOnsetHatNoise = hats.nodes.filter((node) => node.type === 'buffer' && node.startedAt === 0.035);
  assert.equal(sameOnsetHatNoise.length, 2, 'different-color hats at the same onset coexist');
  const laterOnset = 0.035 + 0.25;
  assert.ok(sameOnsetHatNoise.some((node) => node.stops.some((at) => Math.abs(at - (laterOnset + 0.008)) < 1e-6)), 'the sustained same-onset open hat is smoothly choked by the next onset');
  assert.ok(sameOnsetHatNoise.every((node) => node.stops.some((at) => Math.abs(at - (0.035 + 0.11)) < 1e-6) || node.stops.some((at) => Math.abs(at - (laterOnset + 0.008)) < 1e-6)), 'short hats may finish naturally before the later choke');
  const laterHatNoise = hats.nodes.find((node) => node.type === 'buffer' && Math.abs(node.startedAt - laterOnset) < 1e-9);
  assert.ok(laterHatNoise, 'the later hat starts normally after choking the previous group');
  await hatPlayer.dispose();
});
