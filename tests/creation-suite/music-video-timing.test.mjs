import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicVideoTimingPlan, sampleMusicVideoFrame } from '../../js/creation/music-video-timing.mjs';

const plan = (overrides = {}) => createMusicVideoTimingPlan({
  loopTicks: 4_800, tempo: 120, frames: [{ id: 'still', durationMs: 200 }], ...overrides
});

test('a 5-second song loops a 200ms image 25 times and ends without wrapping at the endpoint', () => {
  const timing = plan();
  assert.equal(timing.musicDurationMs, 5_000);
  assert.equal(timing.visualDurationMs, 200);
  assert.equal(sampleMusicVideoFrame(timing, 0).frameId, 'still');
  assert.equal(sampleMusicVideoFrame(timing, 4_999).ended, false);
  assert.equal(sampleMusicVideoFrame(timing, 4_999).frameIndex, 0);
  assert.deepEqual(sampleMusicVideoFrame(timing, 5_000), {
    ended: true, frameIndex: null, frameId: null, musicTimeMs: 5_000, visualTimeMs: null
  });
});

test('variable frame durations select half-open intervals and repeat on the visual cycle', () => {
  const timing = plan({ frames: [
    { id: 'quick', durationMs: 100 }, { id: 'slow', durationMs: 400 }
  ] });
  assert.equal(timing.visualDurationMs, 500);
  assert.equal(sampleMusicVideoFrame(timing, 99).frameId, 'quick');
  assert.equal(sampleMusicVideoFrame(timing, 100).frameId, 'slow');
  assert.equal(sampleMusicVideoFrame(timing, 499).frameId, 'slow');
  assert.equal(sampleMusicVideoFrame(timing, 500).frameId, 'quick');
  assert.equal(sampleMusicVideoFrame(timing, 600).frameId, 'slow');
});

test('a static image is selected for the full music duration', () => {
  const timing = plan({ loopTicks: 3_840, tempo: 90, frames: [{ durationMs: 1 }] });
  assert.equal(sampleMusicVideoFrame(timing, timing.musicDurationMs - 0.001).frameIndex, 0);
  assert.equal(sampleMusicVideoFrame(timing, timing.musicDurationMs).ended, true);
});

test('BPM changes music duration but not the frame cadence; frame FPS changes do not change music duration', () => {
  const original = plan({ frames: [{ id: 'a', durationMs: 100 }, { id: 'b', durationMs: 250 }] });
  const fasterBpm = plan({ tempo: 150, frames: original.frames });
  assert.notEqual(fasterBpm.musicDurationMs, original.musicDurationMs);
  assert.deepEqual(fasterBpm.frames, original.frames);
  assert.equal(fasterBpm.visualDurationMs, original.visualDurationMs);

  const fasterVisual = plan({ frames: [{ id: 'a', durationMs: 50 }, { id: 'b', durationMs: 125 }] });
  assert.notEqual(fasterVisual.visualDurationMs, original.visualDurationMs);
  assert.equal(fasterVisual.musicDurationMs, original.musicDurationMs);
});

test('timing bounds and invalid sampling times fail clearly', () => {
  assert.throws(() => plan({ loops: 0 }), /再生回数/);
  assert.throws(() => plan({ ticksPerQuarter: 96 }), /PPQ/);
  assert.throws(() => plan({ frames: [] }), /フレーム/);
  assert.throws(() => sampleMusicVideoFrame(plan(), -1), /時刻/);
});

test('the plan accepts the fractional frame durations used by custom Draw FPS', () => {
  const plan = createMusicVideoTimingPlan({ loopTicks: 1920, tempo: 120,
    frames: [{ id: 'one', durationMs: 1000 / 30 }, { id: 'two', durationMs: 1000 / 30 }] });
  assert.equal(plan.musicDurationMs, 2000);
  assert.equal(plan.frames[0].durationMs, 1000 / 30);
  assert.equal(sampleMusicVideoFrame(plan, 34).frameId, 'two');
  assert.throws(() => createMusicVideoTimingPlan({ loopTicks: 1920, tempo: 1000, frames: plan.frames }), /BPM/);
});
