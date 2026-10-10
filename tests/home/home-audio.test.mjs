import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeAudio } from '../../js/home-audio.mjs';

function fakeContext({ resume = null } = {}) {
  const calls = { resume: 0, suspend: 0, values: [] };
  const ctx = {
    state: 'suspended', currentTime: 0, destination: {}, onstatechange: null,
    createGain() {
      return { gain: {
        value: 1,
        cancelScheduledValues() {},
        setValueAtTime(value) { calls.values.push(value); this.value = value; },
      }, connect() {} };
    },
    async resume() {
      calls.resume++;
      if (resume) await resume();
      this.state = 'running'; this.onstatechange?.();
    },
    async suspend() { calls.suspend++; this.state = 'suspended'; this.onstatechange?.(); },
  };
  return { ctx, calls };
}

test('audio stays lazy until a drawing gesture or explicit resume; stop before activation latches', async () => {
  const f = fakeContext(); let created = 0;
  const audio = createHomeAudio({ createContext: () => { created++; return f.ctx; } });
  assert.equal(audio.state, 'waiting'); assert.equal(created, 0);
  audio.stop();
  assert.equal(audio.state, 'stopped'); assert.equal(created, 0);
  assert.equal(await audio.activateFromGesture(), false); assert.equal(created, 0);
  assert.equal(await audio.resumeByControl(), true);
  assert.equal(created, 1); assert.equal(audio.state, 'playing'); assert.equal(audio.canPlay(), true);
  audio.stop();
  assert.equal(audio.state, 'stopped'); assert.equal(audio.canPlay(), false);
  assert.equal(f.calls.values.at(-1), 0);
});

test('hiding immediately mutes and suspends; showing waits for another drawing gesture', async () => {
  const f = fakeContext(); const audio = createHomeAudio({ createContext: () => f.ctx });
  assert.equal(await audio.activateFromGesture(), true);
  assert.equal(audio.state, 'playing');
  audio.setVisible(false);
  assert.equal(f.calls.values.at(-1), 0); assert.equal(audio.canPlay(), false);
  await Promise.resolve();
  audio.setVisible(true);
  assert.equal(audio.state, 'standby'); assert.equal(f.calls.resume, 1);
  assert.equal(await audio.activateFromGesture(), true);
  assert.equal(audio.state, 'playing'); assert.equal(f.calls.resume, 2);
});

test('an in-flight resume cannot revive playback after stop', async () => {
  let finishResume;
  const f = fakeContext({ resume: () => new Promise((resolve) => { finishResume = resolve; }) });
  const audio = createHomeAudio({ createContext: () => f.ctx });
  const pending = audio.activateFromGesture();
  audio.stop(); finishResume();
  assert.equal(await pending, false);
  assert.equal(audio.state, 'stopped'); assert.equal(audio.canPlay(), false);
  assert.equal(f.calls.values.at(-1), 0);
  assert.ok(f.calls.suspend >= 1);
});

test('repeated gestures and hide/show races keep the newest deliberate activation', async () => {
  const gates = [];
  const f = fakeContext({ resume: () => new Promise((resolve) => gates.push(resolve)) });
  const audio = createHomeAudio({ createContext: () => f.ctx });
  const first = audio.activateFromGesture();
  const second = audio.activateFromGesture();
  gates[0](); await first;
  gates[1](); assert.equal(await second, true);
  assert.equal(audio.state, 'playing'); assert.equal(audio.canPlay(), true);

  audio.setVisible(false); audio.setVisible(true);
  assert.equal(audio.state, 'standby'); assert.equal(audio.canPlay(), false);
  const third = audio.activateFromGesture(); gates[2]();
  assert.equal(await third, true); assert.equal(audio.state, 'playing');
});

test('failed context creation or resume reports unavailable and does not report playback', async () => {
  const unavailable = createHomeAudio({ createContext: () => { throw new Error('blocked'); } });
  assert.equal(await unavailable.activateFromGesture(), false);
  assert.equal(unavailable.state, 'unavailable'); assert.equal(unavailable.canPlay(), false);

  const f = fakeContext({ resume: () => Promise.reject(new Error('blocked')) });
  const audio = createHomeAudio({ createContext: () => f.ctx });
  assert.equal(await audio.activateFromGesture(), false);
  assert.equal(audio.state, 'unavailable'); assert.equal(audio.canPlay(), false);
  assert.equal(f.calls.values.at(-1), 0);
});
