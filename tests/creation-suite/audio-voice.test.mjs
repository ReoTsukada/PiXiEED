import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_INSTRUMENTS } from '../../js/creation/audio-timbres.mjs?voice-test=20261005';
import { midiFrequency } from '../../js/creation/audio-core.mjs?voice-test=20261005';
import { scheduleAudioVoice } from '../../js/creation/audio-voice.mjs?voice-test=20261005';

function audioContext(sampleRate = 48000) {
  const nodes = []; const waves = [];
  class Param {
    constructor() { this.value = 0; this.events = []; }
    setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
    linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['ramp', value, time]); }
    exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(['exponential', value, time]); }
  }
  class Node {
    constructor(kind) { this.kind = kind; this.frequency = new Param(); this.detune = new Param(); this.gain = new Param(); this.Q = new Param(); this.connections = []; nodes.push(this); }
    connect(node) { this.connections.push(node); }
    disconnect() { this.connections = []; }
    start(time) { this.started = time; }
    stop(time) { this.stopped = time; }
    setPeriodicWave(wave) { this.wave = wave; }
  }
  return {
    sampleRate, destination: new Node('destination'), nodes, waves,
    createGain: () => new Node('gain'), createOscillator: () => new Node('oscillator'),
    createBufferSource: () => new Node('buffer'), createBiquadFilter: () => new Node('filter'),
    createBuffer(channels, length, rate) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { length, duration: length / rate, getChannelData: (index) => data[index] }; },
    createPeriodicWave(real, imag) { const wave = { real, imag }; waves.push(wave); return wave; }
  };
}

test('every preset schedules bounded voices at low/high pitches and short/long gates', () => {
  for (const profile of AUDIO_INSTRUMENTS) for (const pitch of [36, 96]) for (const duration of [0.012, 0.75]) {
    const context = audioContext(); const onset = 2; const releaseEnd = onset + (profile.drum?.duration || duration + profile.release); const gateEnd = profile.drum ? releaseEnd - profile.release : onset + duration;
    const voice = scheduleAudioVoice(context, profile, { frequency: midiFrequency(pitch), velocity: 100, onset, gateEnd, releaseEnd, peak: 0.14 });
    assert.ok(voice.sources.length > 0, `${profile.id} has a source`);
    assert.ok(voice.sources.length <= 8, `${profile.id} source count ${voice.sources.length}`);
    for (const source of voice.sources) {
      assert.ok(source.started >= onset, `${profile.id} starts at or after onset`);
      assert.ok(source.stopped >= releaseEnd, `${profile.id} sustains through release`);
      if (source.kind === 'oscillator' && source.frequency.events.some(([method, , time]) => method === 'set' && time === onset)) {
        const baseSet = source.frequency.events.find(([method, , time]) => method === 'set' && time === onset);
        assert.ok(baseSet[1] < context.sampleRate / 2);
      }
    }
    const gainEvents = voice.gain.gain.events;
    assert.equal(gainEvents[0][2], onset);
    assert.ok(gainEvents.some(([, , time]) => Math.abs(time - gateEnd) < 1e-9));
    assert.equal(gainEvents.at(-1)[2], releaseEnd);
    for (let index = 1; index < gainEvents.length; index += 1) assert.ok(gainEvents[index][2] >= gainEvents[index - 1][2], `${profile.id} envelope time order`);
  }
});

test('noise loops use a full-gate buffer and pitched fundamentals remain exact', () => {
  const context = audioContext(8000);
  const noise = AUDIO_INSTRUMENTS.filter(({ waveform }) => waveform === 'noise');
  for (const profile of noise) {
    const voice = scheduleAudioVoice(context, profile, { frequency: midiFrequency(60), onset: 1, gateEnd: 2, releaseEnd: 2.2 });
    const source = voice.sources[0];
    assert.equal(source.loop, true);
    assert.ok(source.loopEnd > source.loopStart);
    assert.equal(source.stopped, profile.drum ? 1 + profile.drum.duration : 2.205);
  }
  const pitched = scheduleAudioVoice(context, AUDIO_INSTRUMENTS.find(({ id }) => id === 'triangle'), { frequency: midiFrequency(36), onset: 1, gateEnd: 2, releaseEnd: 2.1 });
  assert.equal(pitched.sources[0].frequency.events.find(([method, , time]) => method === 'set' && time === 1)[1], midiFrequency(36));
});

test('high partials above Nyquist are omitted and custom harmonics share one periodic source', () => {
  const context = audioContext(8000);
  const high = scheduleAudioVoice(context, { waveform: 'sine', attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1, partials: [{ waveform: 'sine', ratio: 8, gain: 0.2 }] }, { frequency: midiFrequency(96), onset: 0, gateEnd: 1, releaseEnd: 1.1 });
  assert.equal(high.sources.length, 1);
  const custom = scheduleAudioVoice(context, { waveform: 'custom', harmonics: [{ ratio: 3, gain: -0.2 }, { ratio: 5, gain: 0.1 }], attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 }, { frequency: midiFrequency(48), onset: 0, gateEnd: 1, releaseEnd: 1.1 });
  assert.equal(custom.sources.length, 1);
  assert.ok(custom.sources[0].wave);
});

test('drum metadata fixes pitch and full duration, and pitch sweep shapes the fundamental', () => {
  const context = audioContext(48000);
  const profile = { id: 'drum-kick', waveform: 'sine', attack: 0.001, decay: 0.08, sustain: 0.1, release: 0.03, drum: { frequency: 61.7, duration: 0.22 }, pitchSweep: { fromRatio: 2.2, seconds: 0.035 } };
  const voice = scheduleAudioVoice(context, profile, { frequency: midiFrequency(48), onset: 1, gateEnd: 2, releaseEnd: 3 });
  const fundamental = voice.sources[0];
  assert.equal(fundamental.frequency.events[0][1], 61.7 * 2.2);
  assert.ok(fundamental.frequency.events.some(([method, value, time]) => ['ramp', 'exponential'].includes(method) && value === 61.7 && Math.abs(time - 1.035) < 1e-9));
  assert.equal(voice.gain.gain.events.some(([, , time]) => time === 1.19), true);
  assert.equal(fundamental.stopped, 1.22);
});

test('bounded transient bursts and onset-time hat choking do not move future attacks', () => {
  const context = audioContext();
  const clap = scheduleAudioVoice(context, { id: 'drum-clap', waveform: 'noise', attack: 0.001, decay: 0.09, sustain: 0.005, release: 0.045, drum: { frequency: 900, duration: 0.18 }, transient: { gain: 0.9, bursts: [0, 0.012, 0.024], duration: 0.016 } }, { frequency: 440, onset: 1, gateEnd: 1.1, releaseEnd: 1.15 });
  assert.equal(clap.sources.length, 4);
  assert.deepEqual(clap.sources.slice(1).map((source) => source.started), [1, 1.012, 1.024]);
  assert.equal(clap.sources[0].stopped, 1.18);

  const hat = scheduleAudioVoice(context, { id: 'drum-hat-open', waveform: 'noise', attack: 0.001, decay: 0.1, sustain: 0.1, release: 0.25, drum: { frequency: 7000, duration: 0.4, chokeGroup: 'hat' } }, { frequency: 440, onset: 2, gateEnd: 2.1, releaseEnd: 2.2 });
  assert.equal(hat.choke(2.1), true);
  assert.equal(hat.sources[0].stopped, 2.108, 'choke follows the scheduled hit instead of cutting at current time');
  assert.equal(hat.gain.gain.events.at(-1)[2], 2.4, 'choke leaves the original ADSR envelope untouched');
  assert.equal(hat.chokeGain.gain.events.at(-1)[2], 2.108, 'a separate final gain performs the choke fade');
  assert.equal(hat.choke(2.2), false, 'a later choke does not extend or replace the first stop');
});


test('truncated piano decay reaches the computed gate level without a jump and keeps all six modes', () => {
  const context = audioContext();
  const profile = AUDIO_INSTRUMENTS.find(({ id }) => id === 'piano');
  const voice = scheduleAudioVoice(context, profile, { frequency: midiFrequency(60), onset: 1, gateEnd: 1.125, releaseEnd: 1.545, peak: 0.14 });
  assert.equal(voice.sources.length, 8, 'fundamental, six modes, and strike');
  const events = voice.gain.gain.events;
  const gate = events.filter(([, , time]) => time === 1.125);
  assert.equal(gate.length, 2, 'decay ramp then release anchor');
  assert.ok(Math.abs(gate[0][1] - gate[1][1]) < 1e-12, 'gate introduces no amplitude discontinuity');
  const expected = 0.14 * profile.sustain ** ((0.125 - profile.attack) / profile.decay);
  assert.ok(Math.abs(gate[0][1] - expected) < 1e-12);
  assert.equal(gate[0][0], 'exponential');
  assert.equal(events.at(-1)[1], 0, 'release ends at exact silence');
});

test('noise excitation is reproducible across contexts and cutoffs respect low-rate Nyquist', () => {
  for (const id of ['noise', 'gb-noise', 'nes-noise']) {
    const profile = AUDIO_INSTRUMENTS.find((item) => item.id === id);
    const args = { frequency: midiFrequency(60), onset: 0, gateEnd: 1, releaseEnd: 1.1 };
    const first = scheduleAudioVoice(audioContext(8000), profile, args);
    const second = scheduleAudioVoice(audioContext(8000), profile, args);
    assert.deepEqual(first.sources[0].buffer.getChannelData(0), second.sources[0].buffer.getChannelData(0));
    if (first.filter) assert.ok(first.filter.frequency.events.every(([, value]) => value > 0 && value <= 3600));
  }
});
