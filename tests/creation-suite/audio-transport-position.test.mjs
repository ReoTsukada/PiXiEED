import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUDIO_PIXEL_TICKS, createAudioPlayer, createAudioSong, setAudioPixel } from '../../js/creation/audio-core.mjs?rev=20260928-audio-transport-position-1';

test('currentTick follows the scheduled AudioContext cycle, waits for onset, wraps, and stops cleanly', async () => {
  const timers = [];
  const context = {
    currentTime: 12,
    destination: {},
    resume: async () => {},
    close: async () => {},
    createOscillator() {
      return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} };
    },
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
  };
  const player = createAudioPlayer({
    audioContextFactory: () => context,
    schedule(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer; },
    cancel(timer) { timer.cancelled = true; }
  });
  const song = setAudioPixel(createAudioSong({ tempo: 120 }), { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'position-note' });

  assert.equal(player.currentTick, null, 'no audio cycle exists before playback');
  await player.play(song);
  assert.equal(player.currentTick, null, 'the 35ms scheduling lead is not reported as audible time');
  context.currentTime = 12.035;
  assert.equal(player.currentTick, 0);
  context.currentTime = 12.035 + 7 * 60 / 120 / 480;
  assert.equal(player.currentTick, 7);
  context.currentTime = 14.1;
  assert.equal(player.currentTick, song.loopTicks - 1, 'position is clamped to the current scheduled loop');

  timers[0].callback();
  assert.equal(player.currentTick, null, 'next cycle lead-in is not attributed to the previous cycle');
  context.currentTime += 0.035;
  assert.equal(player.currentTick, 0);
  player.stop();
  assert.equal(player.currentTick, null);
  await player.dispose();
  assert.equal(AUDIO_PIXEL_TICKS, 120);
});

test('animation playback frame changes repaint only the view and use playback latency', () => {
  const page = readFileSync(new URL('../../js/creation/audio-page.mjs', import.meta.url), 'utf8');
  const functionBody = (name, nextName) => {
    const start = page.indexOf(`function ${name}(`);
    const end = page.indexOf(`function ${nextName}(`, start + 1);
    assert.ok(start >= 0 && end > start, `${name} source is present`);
    return page.slice(start, end);
  };
  const startPlayhead = functionBody('startPlayhead', 'stopPlayhead');
  const stopPlayhead = functionBody('stopPlayhead', 'showPlaybackFrame');
  const viewUpdate = functionBody('showPlaybackFrame', 'renderSong');
  for (const body of [startPlayhead, stopPlayhead]) {
    assert.match(body, /showPlaybackFrame\(/);
    assert.doesNotMatch(body, /renderSong\(|renderGrid\(|markDirty\(/);
  }
  assert.match(viewUpdate, /composedAnimationImage\(frameId\)/);
  assert.match(viewUpdate, /paintPixelCanvas\(\)/);
  assert.match(viewUpdate, /updateCanvasLabel\(\)/);
  assert.match(viewUpdate, /animationControls\?\.refresh\(\)/);
  assert.doesNotMatch(viewUpdate, /renderSong\(|renderGrid\(|markDirty\(/);
  assert.match(page, /new AudioContextConstructor\(\{\s*latencyHint:\s*'playback'\s*\}\)/);
});
