import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioColorMixPlan } from '../../js/creation/audio-color-mix.mjs';

const voice = (color, onsetTick = 0, endTick = 120, groupGain = 1) => ({ event: { colorId: color, sourceCell: { x: 0, y: 0 }, groupGain }, onsetTick, endTick });
const valueAt = (curve, tick) => curve.filter(point => point.tick <= tick).at(-1)?.gain || 0;
const sumAt = (curves, tick) => curves.reduce((sum, curve) => sum + (curve ? valueAt(curve, tick) : 0), 0);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('a one-note color receives the same budget as a color with 200 notes', () => {
  const notes = [voice('red'), ...Array.from({ length: 200 }, () => voice('blue'))];
  const plan = createAudioColorMixPlan(notes);
  near(valueAt(plan[0], 0), .5);
  near(plan.slice(1).reduce((sum, curve) => sum + valueAt(curve, 0), 0), .5);
  near(sumAt(plan, 0), 1);
});

test('one color and sixteen colors have the same total amplitude budget', () => {
  for (const count of [1, 4, 16, 32]) {
    const plan = createAudioColorMixPlan(Array.from({ length: count }, (_, index) => voice(`color-${index}`)));
    near(sumAt(plan, 0), 1);
    plan.forEach(curve => near(valueAt(curve, 0), 1 / count));
  }
});

test('a singleton and a two-endpoint run divide their color budget by group weight', () => {
  const plan = createAudioColorMixPlan([voice('blue', 0, 120, 1), voice('blue', 0, 120, .5), voice('blue', 0, 120, .5)]);
  near(valueAt(plan[0], 0), .5);
  near(valueAt(plan[1], 0), .25);
  near(valueAt(plan[2], 0), .25);
  near(sumAt(plan, 0), 1);
});

test('held notes rebalance when another color enters and its release finishes', () => {
  const plan = createAudioColorMixPlan([voice('red', 0, 480), voice('blue', 120, 300)]);
  assert.deepEqual(plan[0], [{ tick: 0, gain: 1 }, { tick: 120, gain: .5 }, { tick: 300, gain: 1 }, { tick: 480, gain: 0 }]);
  for (const tick of [0, 120, 240, 300, 479]) near(sumAt(plan, tick), 1);
  near(sumAt(plan, 480), 0);
});

test('another run of the same color rebalances its held notes without affecting other colors', () => {
  const plan = createAudioColorMixPlan([voice('blue', 0, 480), voice('red', 0, 480), voice('blue', 120, 240)]);
  near(valueAt(plan[0], 120), .25);
  near(valueAt(plan[1], 120), .5);
  near(valueAt(plan[2], 120), .25);
  near(valueAt(plan[0], 240), .5);
  near(sumAt(plan, 120), 1);
  near(sumAt(plan, 240), 1);
});

test('a color handoff at the same tick keeps sustained colors balanced', () => {
  const plan = createAudioColorMixPlan([voice('red', 0, 480), voice('blue', 0, 120), voice('green', 120, 480)]);
  assert.deepEqual(plan[0], [{ tick: 0, gain: .5 }, { tick: 480, gain: 0 }]);
  near(valueAt(plan[2], 120), .5);
  near(sumAt(plan, 120), 1);
});

test('manual notes are left to the existing mixer and source events are not mutated', () => {
  const manual = { event: { colorId: 'manual' }, onsetTick: 0, endTick: 120 };
  const notes = [manual, voice('red')];
  const before = structuredClone(notes);
  const plan = createAudioColorMixPlan(notes);
  assert.equal(plan[0], null);
  assert.deepEqual(notes, before);
  near(valueAt(plan[1], 0), 1);
});

test('empty input and invalid sounding intervals are handled explicitly', () => {
  assert.deepEqual(createAudioColorMixPlan([]), []);
  assert.throws(() => createAudioColorMixPlan([voice('red', 120, 120)]), RangeError);
  assert.throws(() => createAudioColorMixPlan([voice('red', 0, 120, 0)]), RangeError);
});


test('the real player keeps both blue edges audible and rebalances them around a one-note red color', async () => {
  const { createAudioPlayer, createAudioSong } = await import('../../js/creation/audio-core.mjs');
  const cells = [];
  for (let x = 0; x < 8; x += 1) for (let y = 1; y <= 3; y += 1) cells.push({ x, y, colorId: 'blue' });
  for (let x = 2; x < 4; x += 1) cells.push({ x, y: 5, colorId: 'red' });
  const base = createAudioSong({ songId: 'real-color-budget' });
  const song = { ...base, tracks: base.tracks.map(track => track.trackId === 'track-square' ? { ...track, clips: track.clips.map(clip => ({ ...clip, notes: cells.map((cell, i) => ({ noteId: `cell-${i}`, startTick: cell.x * 120, durationTicks: 120, pitch: 96 - cell.y * 4, velocity: 96, colorId: cell.colorId, sourceCell: { x: cell.x, y: cell.y } })) })) } : track) };
  const before = structuredClone(song);
  const gains = []; const oscillators = [];
  class Param { constructor() { this.events = []; } setValueAtTime(value, at) { this.events.push({ kind: 'set', value, at }); } linearRampToValueAtTime(value, at) { this.events.push({ kind: 'ramp', value, at }); } }
  class Node { constructor() { this.gain = new Param(); this.frequency = new Param(); } connect() {} disconnect() {} start() {} stop() {} setPeriodicWave() {} }
  const context = { currentTime: 0, sampleRate: 8000, destination: {}, resume: async () => {}, close: async () => {}, createPeriodicWave: () => ({}), createGain() { const n = new Node(); gains.push(n); return n; }, createOscillator() { const n = new Node(); oscillators.push(n); return n; } };
  const player = createAudioPlayer({ audioContextFactory: () => context, schedule: () => 1, cancel() {} });
  try {
    await player.play(song);
    assert.equal(oscillators.length, 3, 'two sustained blue endpoints and the red singleton are all played');
    const mixNodes = gains.filter(node => node.gain.events[0]?.value === .5);
    assert.equal(mixNodes.length, 3);
    const blueMix = mixNodes.filter(node => node.gain.events.some(e => e.value === .25));
    assert.equal(blueMix.length, 2);
    for (const node of blueMix) {
      const enterRamp = node.gain.events.find(e => e.kind === 'ramp' && e.value === .25);
      near(enterRamp.at, .035 + .25 + .02);
      assert.ok(node.gain.events.some(e => e.kind === 'ramp' && e.value === .5 && e.at > enterRamp.at), 'the held blue endpoints recover after red release');
    }
    const envelopes = gains.filter(node => node.gain.events[0]?.value === 0 && node.gain.events.length === 5);
    assert.equal(envelopes.length, 3);
    envelopes.forEach(node => near(node.gain.events[1].value, .18 * 96 / 127));
    assert.deepEqual(song, before);
  } finally { player.stop(); await player.dispose(); }
});
