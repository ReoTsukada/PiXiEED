import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAudioEvents, createAudioPlayer, createAudioSong, midiFrequency, AUDIO_PIXEL_TICKS } from '../../js/creation/audio-core.mjs';

const baseSong = createAudioSong({ songId: 'audio-run-projection' });

function songWithCells(cells) {
  const notes = cells.map((cell, index) => ({
    noteId: `cell-${index}`,
    pitch: cell.pitch ?? 96 - (cell.y ?? 0) * 4,
    startTick: cell.startTick ?? (cell.x ?? 0) * AUDIO_PIXEL_TICKS,
    durationTicks: cell.durationTicks ?? AUDIO_PIXEL_TICKS,
    velocity: cell.velocity ?? 96,
    ...(cell.colorId ? { colorId: cell.colorId } : {}),
    ...(cell.sourceCell === null ? {} : { sourceCell: cell.sourceCell ?? { x: cell.x ?? 0, y: cell.y ?? 0 } })
  }));
  return {
    ...baseSong,
    tracks: baseSong.tracks.map((track) => track.trackId === 'track-square'
      ? { ...track, clips: track.clips.map((clip) => ({ ...clip, notes })) }
      : track)
  };
}

function outline(song, joinAdjacent = false) {
  return collectAudioEvents(song, { outlineRuns: true, joinAdjacent });
}

test('single, two, three, and long same-color runs keep only their vertical endpoints', () => {
  const cells = [
    { x: 0, y: 0 },
    { x: 1, y: 0 }, { x: 1, y: 1 },
    { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 },
    ...Array.from({ length: 8 }, (_, offset) => ({ x: 3, y: offset }))
  ];
  const projected = outline(songWithCells(cells));
  assert.deepEqual(projected.map(({ startTick, sourceCell, pitch, groupGain }) => [startTick, sourceCell.y, pitch, groupGain]), [
    [0, 0, 96, 1],
    [AUDIO_PIXEL_TICKS, 1, 92, 0.5], [AUDIO_PIXEL_TICKS, 0, 96, 0.5],
    [2 * AUDIO_PIXEL_TICKS, 2, 88, 0.5], [2 * AUDIO_PIXEL_TICKS, 0, 96, 0.5],
    [3 * AUDIO_PIXEL_TICKS, 7, 68, 0.5], [3 * AUDIO_PIXEL_TICKS, 0, 96, 0.5]
  ]);
});

test('blank rows and different colors split runs even when colors select the same instrument', () => {
  const song = songWithCells([
    { x: 0, y: 0, colorId: 'red' }, { x: 0, y: 1, colorId: 'red' },
    { x: 0, y: 3, colorId: 'red' },
    { x: 0, y: 4, colorId: 'blue' }, { x: 0, y: 5, colorId: 'blue' }
  ]);
  const projected = outline(song);
  assert.deepEqual(projected.map(({ colorId, sourceCell, groupGain }) => [colorId, sourceCell.y, groupGain]), [
    ['blue', 5, 0.5], ['blue', 4, 0.5], ['red', 3, 1], ['red', 1, 0.5], ['red', 0, 0.5]
  ]);
  assert.deepEqual(projected.map(({ instrument }) => instrument), Array(5).fill('square'));
});

test('equal endpoint pitches collapse within one run, while separate runs remain separate', () => {
  const song = songWithCells([
    { x: 0, y: 0, pitch: 70 }, { x: 0, y: 1, pitch: 70 },
    { x: 0, y: 3, pitch: 70 }, { x: 0, y: 4, pitch: 70 }
  ]);
  const projected = outline(song);
  assert.deepEqual(projected.map(({ sourceCell, pitch, groupGain }) => [sourceCell.y, pitch, groupGain]), [
    [0, 70, 1], [3, 70, 1]
  ]);
});

test('projection leaves manual notes and the stored song untouched', () => {
  const song = songWithCells([
    { x: 0, y: 0, pitch: 90 }, { x: 0, y: 1, pitch: 80 },
    { pitch: 55, startTick: 240, sourceCell: null }
  ]);
  const before = structuredClone(song);
  const raw = collectAudioEvents(song);
  assert.equal(raw.length, 3, 'raw collection still exposes every stored note');
  assert.equal(Object.hasOwn(raw[0], 'sourceCell'), false, 'the default result shape remains unchanged');
  const projected = outline(song);
  assert.deepEqual(projected.filter((event) => event.pitch === 55).map(({ pitch, startTick, durationTicks, groupGain }) => [pitch, startTick, durationTicks, groupGain]), [[55, 240, AUDIO_PIXEL_TICKS, undefined]]);
  assert.deepEqual(song, before);
});

test('same-row endpoints sustain across three adjacent columns when run gain stays stable', () => {
  const cells = [];
  for (let x = 0; x < 3; x += 1) for (let y = 1; y <= 3; y += 1) cells.push({ x, y });
  const joined = outline(songWithCells(cells), true);
  assert.deepEqual(joined.map(({ sourceCell, pitch, startTick, durationTicks, groupGain }) => [sourceCell.y, pitch, startTick, durationTicks, groupGain]), [
    [3, 84, 0, 3 * AUDIO_PIXEL_TICKS, 0.5],
    [1, 92, 0, 3 * AUDIO_PIXEL_TICKS, 0.5]
  ]);
});

test('height, endpoint, or run-gain changes split horizontal sustains cleanly', () => {
  const cells = [
    { x: 0, y: 1 }, { x: 0, y: 2 },
    { x: 1, y: 1 }, { x: 1, y: 2 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 }, { x: 4, y: 2 }
  ];
  const joined = outline(songWithCells(cells), true);
  assert.deepEqual(joined.map(({ sourceCell, pitch, startTick, durationTicks, groupGain }) => [sourceCell.y, pitch, startTick, durationTicks, groupGain]), [
    [2, 88, 0, 2 * AUDIO_PIXEL_TICKS, 0.5],
    [1, 92, 0, 2 * AUDIO_PIXEL_TICKS, 0.5],
    [1, 92, 2 * AUDIO_PIXEL_TICKS, 2 * AUDIO_PIXEL_TICKS, 1],
    [2, 88, 4 * AUDIO_PIXEL_TICKS, AUDIO_PIXEL_TICKS, 0.5],
    [1, 92, 4 * AUDIO_PIXEL_TICKS, AUDIO_PIXEL_TICKS, 0.5]
  ]);
});

test('animation frame identity splits vertical runs while adjacent sequence cells may sustain across frames', () => {
  const animationCell = (x, localX, frameId, frameIndex, y = 0) => ({
    kind: 'audio-animation', x, localX, frameId, frameIndex, y
  });
  const song = songWithCells([
    { x: 0, pitch: 72, startTick: 0, sourceCell: animationCell(0, 0, 'frame-a', 0) },
    { x: 1, pitch: 72, startTick: AUDIO_PIXEL_TICKS, sourceCell: animationCell(1, 1, 'frame-a', 0) },
    { x: 2, pitch: 72, startTick: 2 * AUDIO_PIXEL_TICKS, sourceCell: animationCell(2, 0, 'frame-b', 1) }
  ]);
  assert.deepEqual(outline(song, true).map(({ startTick, durationTicks, sourceCell }) => [startTick, durationTicks, sourceCell.frameId]), [
    [0, 3 * AUDIO_PIXEL_TICKS, 'frame-b']
  ]);
});

test('player schedules endpoint pitches and applies each endpoint group gain', async () => {
  const oscillators = []; const gains = [];
  class Param {
    constructor() { this.value = 0; this.events = []; }
    setValueAtTime(value, at) { this.events.push(['set', value, at]); }
    linearRampToValueAtTime(value, at) { this.events.push(['ramp', value, at]); }
  }
  class Node {
    constructor(kind) { this.kind = kind; this.frequency = new Param(); this.gain = new Param(); }
    connect() {}
    disconnect() {}
    start() {}
    stop() {}
    setPeriodicWave() {}
  }
  const context = {
    currentTime: 0, sampleRate: 8000, destination: {}, resume: async () => {}, close: async () => {}, createPeriodicWave: () => ({}),
    createOscillator() { const node = new Node('oscillator'); oscillators.push(node); return node; },
    createGain() { const node = new Node('gain'); gains.push(node); return node; }
  };
  const song = songWithCells([{ x: 0, y: 0, pitch: 84 }, { x: 0, y: 1, pitch: 72 }, { x: 0, y: 2, pitch: 60 }]);
  const player = createAudioPlayer({ audioContextFactory: () => context, schedule: () => 1, cancel() {} });
  await player.play(song);
  assert.deepEqual(oscillators.map(({ frequency }) => frequency.events[0][1]).sort((a, b) => a - b), [midiFrequency(60), midiFrequency(84)]);
  const envelopes = gains.map(({ gain }) => gain.events).filter((events) => events.length >= 5 && events[0]?.[1] === 0 && events.at(-1)?.[1] === 0);
  assert.equal(envelopes.length, 2, 'the middle source row does not create a third sound');
  assert.ok(envelopes.every((events) => Math.abs(events[1][1] - 0.18 * 96 / 127) < 1e-9), 'the color mix node, not global overlap scaling, distributes source-backed amplitude');
  const mixLevels = gains.map(({ gain }) => gain.events).filter((events) => events[0]?.[1] === 0.5 && events.at(-1)?.[1] === 0);
  assert.equal(mixLevels.length, 2);
  assert.ok(mixLevels.every((events) => events[0][0] === 'set' && events.at(-1)[0] === 'ramp'), 'both distinct endpoints receive half of the color budget');
  player.stop(); await player.dispose();
});
