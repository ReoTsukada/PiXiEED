import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_BAR_TICKS, AUDIO_INSTRUMENTS, AUDIO_TRACK_INSTRUMENTS, AUDIO_PIXEL_COLUMNS, AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, AUDIO_PPQ, AUDIO_STEP_TICKS,
  collectAudioEvents, createAudioPlayer, createAudioSong, midiFrequency, normalizeAudioPixelSong,
  setAudioPixel, setAudioPixelPalette, setAudioTempo, toggleAudioStep, validateAudioSong
} from '../../js/creation/audio-core.mjs';
import { createLocalDraftStore, createMemoryDraftAdapter } from '../../js/creation/local-drafts.mjs';
import { AUDIO_INSTRUMENT_GROUPS } from '../../js/creation/audio-timbres.mjs';

test('new song uses integer PPQ ticks, four instruments, and one bounded clip per track', () => {
  const song = createAudioSong({ songId: 'song-fixture' });
  assert.equal(song.ticksPerQuarter, 480);
  assert.equal(song.loopTicks, AUDIO_BAR_TICKS);
  assert.equal(song.tracks.length, 4);
  assert.deepEqual(song.tracks.map((track) => track.instrument), AUDIO_TRACK_INSTRUMENTS.map(({ id }) => id));
  assert.ok(AUDIO_INSTRUMENTS.length >= 30, 'the light instrument shelf covers the old iAUDIO families');
  assert.deepEqual(AUDIO_INSTRUMENT_GROUPS.flatMap((group) => group.instruments.map((instrument) => instrument.id)), AUDIO_INSTRUMENTS.map((instrument) => instrument.id), 'every instrument appears once in the grouped picker');
  for (const track of song.tracks) assert.deepEqual(track.clips.map(({ startTick, lengthTicks }) => [startTick, lengthTicks]), [[0, 1920]]);
});

test('step note add/remove roundtrips in integer Tick and preserves source song', () => {
  const original = createAudioSong({ songId: 'song-fixture' });
  const trackId = original.tracks[0].trackId;
  const edited = toggleAudioStep(original, { trackId, pitch: 52, startTick: AUDIO_STEP_TICKS, noteId: 'note-1' });
  assert.equal(collectAudioEvents(edited)[0].startTick, 240);
  assert.equal(collectAudioEvents(edited)[0].durationTicks, AUDIO_STEP_TICKS);
  assert.equal(collectAudioEvents(original).length, 0);
  const removed = toggleAudioStep(edited, { trackId, pitch: 52, startTick: AUDIO_STEP_TICKS, noteId: 'unused-id' });
  assert.equal(collectAudioEvents(removed).length, 0);
});

test('pixel canvas keeps one instrument note per cell across sixteen columns and pitches', () => {
  const original = createAudioSong({ songId: 'pixel-song' });
  assert.equal(AUDIO_PIXEL_COLUMNS, 16); assert.equal(AUDIO_PIXEL_PITCHES.length, 16); assert.equal(AUDIO_PIXEL_TICKS, 120);
  assert.ok([48, 50, 52, 55, 57].every((pitch) => AUDIO_PIXEL_PITCHES.includes(pitch)), 'older five-note songs remain inside the editable pitch set');
  let edited = setAudioPixel(original, { trackId: 'track-square', pitch: 67, startTick: 120, noteId: 'pixel-1', active: true });
  edited = setAudioPixel(edited, { trackId: 'track-triangle', pitch: 67, startTick: 120, noteId: 'pixel-2', active: true });
  const notes = collectAudioEvents(edited);
  assert.deepEqual(notes.map(({ instrument, startTick, durationTicks }) => [instrument, startTick, durationTicks]), [['triangle', 120, 120]]);
  assert.equal(collectAudioEvents(original).length, 0);
  edited = setAudioPixel(edited, { trackId: 'track-square', pitch: 67, startTick: 120, active: false });
  assert.equal(collectAudioEvents(edited).length, 0, 'eraser clears the cell regardless of selected instrument');
  edited = setAudioPixel(edited, { trackId: 'track-square', pitch: 67, startTick: 120, noteId: 'pixel-3', active: true });
  edited = setAudioPixel(edited, { trackId: 'track-triangle', pitch: 69, startTick: 120, noteId: 'pixel-4', active: true });
  assert.equal(collectAudioEvents(edited).length, 2, 'different pitches may sound together');
  assert.throws(() => setAudioPixel(edited, { trackId: 'track-square', pitch: 67, startTick: 60, active: true }), /16分音符/);
});

test('old layered songs become one note per cell when opened without discarding adjacent long-note cells', () => {
  const song = createAudioSong();
  const oldSong = {
    ...song,
    tracks: song.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, notes: track.instrument === 'square'
      ? [{ noteId: 'long-square', pitch: 60, startTick: 0, durationTicks: 360, velocity: 96 }]
      : track.instrument === 'triangle'
        ? [{ noteId: 'old-triangle', pitch: 60, startTick: 120, durationTicks: 120, velocity: 96 }]
        : [] })) }))
  };
  const normalized = normalizeAudioPixelSong(oldSong);
  assert.equal(collectAudioEvents(oldSong).length, 2, 'source draft remains unchanged');
  assert.deepEqual(collectAudioEvents(normalized).map(({ instrument, startTick, durationTicks }) => [instrument, startTick, durationTicks]), [
    ['square', 0, 120], ['square', 120, 120], ['square', 240, 120]
  ]);
  assert.equal(normalizeAudioPixelSong(normalized), normalized, 'normalization is stable on a clean song');
});

test('a lone sustained note becomes one sounding note per visible cell with its original velocity', () => {
  const song = createAudioSong();
  const oldSong = {
    ...song,
    tracks: song.tracks.map((track) => track.instrument === 'square'
      ? { ...track, clips: track.clips.map((clip) => ({ ...clip, notes: [{ noteId: 'long-note', pitch: 60, startTick: 0, durationTicks: 480, velocity: 72 }] })) }
      : track)
  };
  const normalized = normalizeAudioPixelSong(oldSong);
  assert.deepEqual(collectAudioEvents(normalized).map(({ startTick, durationTicks, velocity }) => [startTick, durationTicks, velocity]), [
    [0, 120, 72], [120, 120, 72], [240, 120, 72], [360, 120, 72]
  ]);
  assert.equal(normalizeAudioPixelSong(normalized), normalized);
  assert.equal(collectAudioEvents(oldSong).length, 1, 'source draft remains unchanged');
});

test('normalizing a legacy clip with off-grid boundaries preserves its partial edge without throwing', () => {
  const song = createAudioSong();
  const legacy = {
    ...song,
    tracks: song.tracks.map((track) => track.instrument === 'square' ? {
      ...track,
      clips: [{ clipId: 'off-grid-clip', startTick: 60, lengthTicks: AUDIO_BAR_TICKS - 60, notes: [{ noteId: 'edge-note', pitch: 60, startTick: 60, durationTicks: 180, velocity: 80 }] }]
    } : track)
  };
  const normalized = normalizeAudioPixelSong(legacy);
  assert.deepEqual(collectAudioEvents(normalized).map(({ startTick, durationTicks }) => [startTick, durationTicks]), [[60, 60], [120, 120]]);
  assert.deepEqual(collectAudioEvents(legacy).map(({ startTick, durationTicks }) => [startTick, durationTicks]), [[60, 180]], 'the source draft remains unchanged');
});

test('the visible color palette determines playback instrument and recolors existing cells', () => {
  const first = setAudioPixel(createAudioSong(), { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'colored-note' });
  const recolored = setAudioPixelPalette(first, { slotId: 'square', color: '#d05670', instrument: 'noise' });
  assert.equal(recolored.pixelPalette[0].color, '#d05670');
  assert.equal(collectAudioEvents(recolored)[0].instrument, 'noise');
  assert.equal(collectAudioEvents(first)[0].instrument, 'square', 'previous version is unchanged');
  assert.equal(recolored.tracks[0].clips[0].notes[0].noteId, 'colored-note', 'remapping does not move the note');
  assert.throws(() => setAudioPixelPalette(recolored, { slotId: 'square', color: recolored.pixelPalette[1].color }), /色と音色/);
  assert.throws(() => setAudioPixelPalette(recolored, { slotId: 'square', instrument: 'unknown' }), /色と音色/);
  const legacy = { ...first, pixelPalette: undefined };
  assert.equal(collectAudioEvents(legacy)[0].instrument, 'square', 'old saved songs use the default mapping');
});

test('erasing one cell inside an image seed or old long note preserves the other 16th-note cells', () => {
  const song = createAudioSong();
  const seeded = {
    ...song,
    tracks: song.tracks.map((track) => track.trackId === 'track-square'
      ? { ...track, clips: track.clips.map((clip) => ({ ...clip, notes: [{ noteId: 'image-seed-note', pitch: 60, startTick: 0, durationTicks: 480, velocity: 92 }] })) }
      : track)
  };
  const erased = setAudioPixel(seeded, { trackId: 'track-square', pitch: 60, startTick: 120, noteId: 'split-request', active: false });
  const events = erased.tracks.find((track) => track.trackId === 'track-square').clips[0].notes;
  assert.deepEqual(events.map(({ startTick, durationTicks }) => [startTick, durationTicks]), [[0, 120], [240, 240]]);
  assert.equal(new Set(events.map(({ noteId }) => noteId)).size, 2);
  assert.equal(collectAudioEvents(erased).reduce((total, note) => total + note.durationTicks, 0), 360);
});

test('tempo is bounded to 60–180 BPM and changing it does not move Tick positions', () => {
  let song = createAudioSong();
  song = toggleAudioStep(song, { trackId: song.tracks[0].trackId, pitch: 48, startTick: 1680, noteId: 'late' });
  const changed = setAudioTempo(song, 173);
  assert.equal(changed.tempo, 173);
  assert.equal(collectAudioEvents(changed)[0].startTick, 1680);
  assert.throws(() => setAudioTempo(song, 181), /60〜180/);
  assert.throws(() => setAudioTempo(song, 90.5), /60〜180/);
});

test('clip contract permits adjacent ranges and simultaneous ranges on different tracks but rejects overlap', () => {
  const song = createAudioSong({ loopTicks: AUDIO_BAR_TICKS * 2 });
  const [first, second] = song.tracks;
  const adjacent = {
    ...song,
    tracks: song.tracks.map((track) => track.trackId === first.trackId ? {
      ...track,
      clips: [
        { clipId: 'clip-a', startTick: 0, lengthTicks: AUDIO_BAR_TICKS, notes: [] },
        { clipId: 'clip-b', startTick: AUDIO_BAR_TICKS, lengthTicks: AUDIO_BAR_TICKS, notes: [] }
      ]
    } : track)
  };
  assert.equal(validateAudioSong(adjacent), adjacent);
  const simultaneous = { ...adjacent, tracks: adjacent.tracks.map((track) => track.trackId === second.trackId ? { ...track, clips: [{ clipId: 'clip-other', startTick: 0, lengthTicks: AUDIO_BAR_TICKS, notes: [] }] } : track) };
  assert.equal(validateAudioSong(simultaneous), simultaneous);
  const overlapping = { ...adjacent, tracks: adjacent.tracks.map((track) => track.trackId === first.trackId ? { ...track, clips: [track.clips[0], { ...track.clips[1], startTick: AUDIO_BAR_TICKS - 1 }] } : track) };
  assert.throws(() => validateAudioSong(overlapping), /クリップの配置/);
});

test('invalid, duplicate, out-of-range, or empty note ranges are rejected', () => {
  const song = createAudioSong();
  const withNote = toggleAudioStep(song, { trackId: song.tracks[0].trackId, pitch: 48, startTick: 0, noteId: 'note-1' });
  const clip = withNote.tracks[0].clips[0];
  assert.throws(() => validateAudioSong({ ...withNote, tracks: withNote.tracks.map((track, index) => index === 0 ? { ...track, clips: [{ ...clip, notes: [{ ...clip.notes[0], durationTicks: 0 }] }] } : track) }), /ノートのTick/);
  assert.throws(() => toggleAudioStep(song, { trackId: song.tracks[0].trackId, pitch: 49, startTick: 0, noteId: 'bad' }), /8分音符/);
  assert.throws(() => toggleAudioStep(song, { trackId: song.tracks[0].trackId, pitch: 48, startTick: -240, noteId: 'bad' }), /8分音符/);
  const duplicateInstrument = { ...song, tracks: song.tracks.map((track, index) => index === 1 ? { ...track, instrument: song.tracks[0].instrument } : track) };
  assert.throws(() => validateAudioSong(duplicateInstrument), /各1トラック/);
});

test('song saves and resumes as a local immutable draft revision', async () => {
  let sequence = 0;
  const store = createLocalDraftStore(createMemoryDraftAdapter(), { idFactory: () => `revision-${++sequence}` });
  const song = setAudioPixelPalette(toggleAudioStep(createAudioSong({ songId: 'song-draft-1' }), { trackId: 'track-square', pitch: 55, startTick: 480, noteId: 'note-save' }), { slotId: 'square', color: '#d05670', instrument: 'noise' });
  const first = await store.save({ draftId: 'song-draft-1', kind: 'song', ownerId: 'local-owner', document: song, source: { type: 'hand_composed', assetId: null, revisionId: null } });
  const reopened = await store.load('song-draft-1');
  assert.equal(first.asset.kind, 'song');
  assert.equal(reopened.asset.assetId, first.asset.assetId);
  assert.equal(reopened.documentHash, first.documentHash);
  assert.deepEqual(reopened.document, song);
  assert.equal(collectAudioEvents(reopened.document)[0].startTick, 480);
  assert.equal(collectAudioEvents(reopened.document)[0].instrument, 'noise');
  assert.equal(reopened.document.pixelPalette[0].color, '#d05670');
});

test('palette-selected modeled timbres survive save and resolve to distinct synthesis profiles', async () => {
  const { getAudioInstrument } = await import('../../js/creation/audio-timbres.mjs');
  let song = setAudioPixelPalette(createAudioSong({ songId: 'timbre-draft' }), { slotId: 'square', instrument: 'electric-piano' });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'timbre-note' });
  const store = createLocalDraftStore(createMemoryDraftAdapter());
  const saved = await store.save({ draftId: song.songId, kind: 'song', ownerId: 'local-owner', document: song, source: { type: 'hand_composed', assetId: null, revisionId: null } });
  const reopened = await store.load(song.songId);
  assert.equal(reopened.document.pixelPalette[0].instrument, 'electric-piano');
  assert.equal(collectAudioEvents(reopened.document)[0].instrument, 'electric-piano');
  assert.equal(validateAudioSong(reopened.document), reopened.document);
  assert.equal(getAudioInstrument('piano').waveform, 'sine');
  assert.equal(getAudioInstrument('electric-piano').partials[0].waveform, 'pulse');
  assert.equal(getAudioInstrument('organ').sustain > getAudioInstrument('piano').sustain, true);
  assert.equal(getAudioInstrument('marimba').partials[0].ratio, 3.9);
  assert.equal(getAudioInstrument('gb-pulse-1').duty, 0.25);
  assert.equal(getAudioInstrument('nes-noise').waveform, 'noise');
});

test('silent songs do not create an audio context and stop disconnects every sounding node', async () => {
  let contextCreations = 0;
  const silentPlayer = createAudioPlayer({ audioContextFactory: () => { contextCreations += 1; throw new Error('should not create'); } });
  assert.equal(await silentPlayer.play(createAudioSong()), false);
  assert.equal(contextCreations, 0);

  const nodes = []; const timers = [];
  class FakeParam { setValueAtTime() {} linearRampToValueAtTime() {} }
  class FakeNode {
    constructor() { this.disconnected = false; this.stopped = false; this.frequency = new FakeParam(); this.gain = new FakeParam(); }
    connect() {}
    disconnect() { this.disconnected = true; }
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  let closeCount = 0;
  const context = {
    currentTime: 0, sampleRate: 44100, destination: {},
    resume: async () => {},
    close: async () => { closeCount += 1; },
    createOscillator() { const node = new FakeNode(); nodes.push(node); return node; },
    createGain() { const node = new FakeNode(); nodes.push(node); return node; }
  };
  const song = toggleAudioStep(createAudioSong(), { trackId: 'track-square', pitch: 48, startTick: 0, noteId: 'note-play' });
  const player = createAudioPlayer({ audioContextFactory: () => { contextCreations += 1; return context; }, schedule: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; }, cancel: (timer) => { timer.cancelled = true; } });
  const playPromise = player.play(song);
  assert.equal(contextCreations, 1, 'AudioContext is constructed synchronously from the play action');
  assert.equal(await playPromise, true);
  assert.equal(player.isPlaying, true);
  assert.equal(nodes.some((node) => node.started), true);
  assert.equal(timers[0].delay, 2000);
  player.stop();
  assert.equal(player.isPlaying, false);
  assert.equal(nodes.every((node) => node.disconnected), true);
  assert.equal(nodes.find((node) => node.started).stopped, true);
  assert.equal(timers[0].cancelled, true);
  assert.equal(closeCount, 0, 'stop keeps the reusable AudioContext alive');
  assert.equal(await player.play(song), true);
  assert.equal(contextCreations, 1, 'a second play reuses the same AudioContext');
  player.stop();
  await player.dispose();
  await player.dispose();
  assert.equal(closeCount, 1, 'dispose closes the reused AudioContext exactly once');
});

test('pass expiry lets the started audio loop and its release tail finish, then stops before another loop', async () => {
  const timers = []; const nodes = [];
  class Param { setValueAtTime() {} linearRampToValueAtTime() {} }
  class Node {
    constructor() { this.frequency = new Param(); this.gain = new Param(); }
    connect() {}
    disconnect() { this.disconnected = true; }
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  const context = {
    currentTime: 0, sampleRate: 8000, destination: {}, resume: async () => {}, close: async () => {},
    createOscillator() { const node = new Node(); nodes.push(node); return node; },
    createGain() { const node = new Node(); nodes.push(node); return node; }
  };
  const song = setAudioPixel(createAudioSong(), { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'expiry-note' });
  const player = createAudioPlayer({ audioContextFactory: () => context, schedule: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; }, cancel(timer) { timer.cancelled = true; } });
  await player.play(song);
  assert.equal(player.stopAfterCurrentLoop(), true);
  assert.equal(player.isPlaying, true);
  timers[0].callback();
  assert.equal(player.isPlaying, true);
  assert.ok(timers[1].delay > 0, 'the last note release tail is allowed to finish');
  timers[1].callback();
  assert.equal(player.isPlaying, false);
  assert.ok(nodes.every((node) => node.disconnected));
  await player.dispose();
});

test('audio context is closed when resume fails', async () => {
  let closeCount = 0;
  const player = createAudioPlayer({ audioContextFactory: () => ({
    currentTime: 0,
    resume: async () => { throw new Error('blocked'); },
    close: async () => { closeCount += 1; }
  }) });
  const song = toggleAudioStep(createAudioSong(), { trackId: 'track-square', pitch: 48, startTick: 0, noteId: 'note-fail' });
  await assert.rejects(player.play(song), /blocked/);
  assert.equal(player.isPlaying, false);
  assert.equal(closeCount, 1);
});

test('a pending audio start can be canceled without scheduling a note', async () => {
  let resume;
  let scheduled = 0;
  const states = [];
  const context = {
    currentTime: 0,
    resume: () => new Promise((resolve) => { resume = resolve; }),
    close: async () => {},
    createOscillator() { scheduled += 1; throw new Error('canceled playback scheduled a note'); }
  };
  const song = toggleAudioStep(createAudioSong(), { trackId: 'track-square', pitch: 48, startTick: 0, noteId: 'note-cancel' });
  const player = createAudioPlayer({ audioContextFactory: () => context, onStateChange: (playing, starting) => states.push({ playing, starting }) });
  const pending = player.play(song);
  assert.equal(player.isStarting, true);
  assert.equal(player.isPlaying, false);
  player.stop();
  assert.equal(player.isStarting, false);
  resume();
  assert.equal(await pending, false);
  assert.equal(player.isPlaying, false);
  assert.equal(scheduled, 0);
  assert.deepEqual(states.at(-1), { playing: false, starting: false });
  await player.dispose();
});

test('a canceled audio start ignores a later context rejection', async () => {
  let rejectResume;
  let closeCount = 0;
  const context = {
    resume: () => new Promise((resolve, reject) => { rejectResume = reject; }),
    close: async () => { closeCount += 1; }
  };
  const song = toggleAudioStep(createAudioSong(), { trackId: 'track-square', pitch: 48, startTick: 0, noteId: 'note-stale' });
  const player = createAudioPlayer({ audioContextFactory: () => context });
  const pending = player.play(song);
  player.stop();
  rejectResume(new Error('context closed after cancellation'));
  assert.equal(await pending, false);
  assert.equal(player.isPlaying, false);
  assert.equal(player.isStarting, false);
  assert.equal(closeCount, 0, 'stale error must not dispose a later active context');
  await player.dispose();
});

test('frequency conversion is stable and bounded to MIDI pitch range', () => {
  assert.equal(midiFrequency(69), 440);
  assert.throws(() => midiFrequency(128), /0–127/);
});

test('Pulse 25 layer uses a periodic waveform and short chip-style envelope', async () => {
  const automation = []; const voices = [];
  class Param { setValueAtTime(value, at) { automation.push(['set', value, at]); } linearRampToValueAtTime(value, at) { automation.push(['ramp', value, at]); } }
  class Node { constructor() { this.frequency = new Param(); this.gain = new Param(); } connect() {} disconnect() {} start() {} stop() {} setPeriodicWave(wave) { this.wave = wave; } }
  const context = {
    currentTime: 0, sampleRate: 44100, destination: {}, resume: async () => {}, close: async () => {},
    createPeriodicWave(real, imag) { assert.equal(real.length, 33); assert.equal(imag.length, 33); const wave = { real, imag }; voices.push(wave); return wave; },
    createOscillator() { const node = new Node(); voices.push(node); return node; }, createGain() { return new Node(); }
  };
  const song = setAudioPixel(createAudioSong(), { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'pulse-note', active: true });
  const player = createAudioPlayer({ audioContextFactory: () => context, schedule: () => 1, cancel() {} });
  await player.play(song);
  const oscillator = voices.find((voice) => voice instanceof Node);
  assert.ok(oscillator.wave); assert.ok(automation.some(([kind, , at]) => kind === 'ramp' && Math.abs(at - 0.037) < 1e-9));
  assert.ok(automation.some(([kind, , at]) => kind === 'ramp' && at > 0.06), 'release tail extends beyond the 16th-note gate');
  await player.dispose();
});

test('selected piano and organ timbres schedule their own partials, filters, and envelopes', async () => {
  const oscillatorRecords = []; const filterRecords = []; const gainRecords = []; const automationRecords = [];
  class Param {
    constructor(kind) { this.kind = kind; this.value = 0; this.events = []; }
    record(value, at) { if (this.kind === 'gain') { this.events.push([value, at]); automationRecords.push([value, at]); } }
    setValueAtTime(value, at) { this.record(value, at); }
    linearRampToValueAtTime(value, at) { this.record(value, at); }
    exponentialRampToValueAtTime(value, at) { this.record(value, at); }
  }
  class Node {
    constructor(type) { this.type = type; this.frequency = new Param('frequency'); this.detune = new Param('detune'); this.gain = new Param('gain'); this.Q = new Param('q'); }
    connect() {}
    disconnect() {}
    start() { this.started = true; }
    stop() { this.stopped = true; }
    setPeriodicWave(wave) { this.wave = wave; }
  }
  const context = {
    currentTime: 0, sampleRate: 8000, destination: {}, resume: async () => {}, close: async () => {},
    createPeriodicWave(real) { return { real }; },
    createOscillator() { const node = new Node('oscillator'); oscillatorRecords.push(node); return node; },
    createGain() { const node = new Node('gain'); gainRecords.push(node); return node; },
    createBiquadFilter() { const node = new Node('filter'); filterRecords.push(node); return node; },
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; },
    createBufferSource() { return new Node('noise'); }
  };
  let song = createAudioSong({ songId: 'profile-playback' });
  song = setAudioPixelPalette(song, { slotId: 'square', instrument: 'piano' });
  song = setAudioPixelPalette(song, { slotId: 'triangle', instrument: 'organ' });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'piano-note' });
  song = setAudioPixel(song, { trackId: 'track-triangle', pitch: 64, startTick: 0, noteId: 'organ-note' });
  const player = createAudioPlayer({ audioContextFactory: () => context, schedule: () => 1, cancel() {} });
  await player.play(song);
  assert.ok(oscillatorRecords.some((node) => node.type === 'sine'), 'piano fundamental is synthesized as sine');
  assert.ok(oscillatorRecords.some((node) => node.type === 'triangle'), 'piano upper partial is synthesized separately');
  assert.ok(oscillatorRecords.some((node) => node.wave), 'organ pulse harmonics use a modeled duty-cycle waveform');
  assert.ok(filterRecords.some((node) => node.type === 'lowpass' && node.frequency.value === 5800));
  assert.ok(filterRecords.some((node) => node.type === 'lowpass' && node.frequency.value === 5500));
  assert.ok(automationRecords.some(([, at]) => Math.abs(at - 0.58) < 1e-9), 'piano release follows the 125 ms cell and its natural tail');
  const envelopes = gainRecords.map((node) => node.gain.events).filter((events) => events.length === 5);
  assert.ok(envelopes.length >= 2 && envelopes.every((events) => events.every((event, index) => index === 0 || event[1] >= events[index - 1][1])), 'each decay ends before its release is scheduled');
  await player.dispose();
});

test('dense chords lower per-note peaks while isolated notes retain their level', async () => {
  class Param { constructor() { this.events = []; this.value = 0; } setValueAtTime(value, at) { this.events.push([value, at]); } linearRampToValueAtTime(value, at) { this.events.push([value, at]); } }
  class Node { constructor() { this.frequency = new Param(); this.detune = new Param(); this.gain = new Param(); this.Q = new Param(); } connect() {} disconnect() {} start() {} stop() {} setPeriodicWave() {} }
  async function renderedPeak(count) {
    const gains = [];
    const context = { currentTime: 0, sampleRate: 8000, destination: {}, resume: async () => {}, close: async () => {}, createPeriodicWave: () => ({}), createOscillator: () => new Node(), createGain() { const node = new Node(); gains.push(node); return node; }, createBiquadFilter: () => new Node() };
    let song = setAudioPixelPalette(createAudioSong(), { slotId: 'square', instrument: 'organ' });
    for (let index = 0; index < count; index += 1) song = setAudioPixel(song, { trackId: 'track-square', pitch: AUDIO_PIXEL_PITCHES[index], startTick: 0, noteId: `chord-${index}` });
    const player = createAudioPlayer({ audioContextFactory: () => context, schedule: () => 1, cancel() {} });
    await player.play(song);
    const notePeaks = gains.map(({ gain }) => gain.events).filter((events) => events.length === 5).map((events) => events[1][0]);
    await player.dispose();
    return notePeaks;
  }
  const solo = await renderedPeak(1); const chord = await renderedPeak(16);
  assert.equal(solo.length, 1); assert.equal(chord.length, 16);
  assert.ok(Math.abs(solo[0] - 0.18 * 96 / 127) < 1e-9, 'single-note level remains unchanged');
  assert.ok(chord.every((peak) => Math.abs(peak - solo[0] / 4) < 1e-9), 'sixteen overlapping notes receive square-root gain compensation');
});

test('every selectable timbre can schedule a short canvas note without invalid audio times', async () => {
  class Param {
    constructor() { this.value = 0; }
    setValueAtTime(value, at) { assert.ok(Number.isFinite(value) && Number.isFinite(at) && at >= 0); }
    linearRampToValueAtTime(value, at) { this.setValueAtTime(value, at); }
    exponentialRampToValueAtTime(value, at) { this.setValueAtTime(value, at); }
  }
  class Node {
    constructor() { this.frequency = new Param(); this.detune = new Param(); this.gain = new Param(); this.Q = new Param(); }
    connect() {} disconnect() {} start(at) { assert.ok(at >= 0); } stop(at) { assert.ok(at >= 0); } setPeriodicWave() {}
  }
  const context = {
    currentTime: 0, sampleRate: 8000, destination: {}, resume: async () => {}, close: async () => {},
    createPeriodicWave: () => ({}), createOscillator: () => new Node(), createGain: () => new Node(),
    createBiquadFilter: () => new Node(), createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => new Node()
  };
  for (const instrument of AUDIO_INSTRUMENTS) {
    let song = setAudioPixelPalette(createAudioSong(), { slotId: 'square', instrument: instrument.id });
    song = setAudioPixel(song, { trackId: 'track-square', pitch: 60, startTick: 0, noteId: `note-${instrument.id}` });
    const player = createAudioPlayer({ audioContextFactory: () => context, schedule: () => 1, cancel() {} });
    assert.equal(await player.play(song), true, instrument.id);
    await player.dispose();
  }
});

test('audio page exposes labeled editing, save/resume and central playback controls', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(new URL('../../audio/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../../js/creation/audio-page.mjs', import.meta.url), 'utf8');
  assert.match(page, /id="audio-play-toggle"/);
  assert.match(page, /aria-label="アプリナビゲーション"/);
  assert.match(page, /id="audio-save"/);
  assert.match(page, /id="audio-resume"/);
  assert.match(page, /id="audio-shelf"/); assert.match(page, /id="audio-from-camera"/);
  assert.match(page, /id="audio-pixel-canvas"[^>]*tabindex="0"/);
  assert.doesNotMatch(page, /audio-pixel-board/); assert.match(page, /共有画像のセルを音に割り当てる音楽キャンバス/);
  assert.equal((page.match(/<header class="site-header"/g) || []).length, 1);
  assert.doesNotMatch(page, /class="site-footer"/);
  assert.match(page, /class="[^"]*\baudio-more\b[^"]*"/); assert.match(page, /audio-tool-body/);
  assert.match(page, /id="audio-tool-pen"/); assert.match(page, /id="audio-tool-eraser"/); assert.match(page, /id="audio-playhead"/);
  assert.match(script, /LAST_DRAW_DRAFT_KEY/); assert.match(script, /cameraHandoffImage/);
  assert.match(script, /setAudioPixel/); assert.match(script, /pixelSurface\.paint/); assert.match(script, /pointermove/); assert.match(script, /lineCells/); assert.match(script, /ArrowRight/); assert.match(script, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(script, /prepareSharedAudioImageImport/); assert.match(script, /setSharedAudioCell/); assert.match(script, /readPxdSharedImage/);
  assert.doesNotMatch(script, /createElement\('button'\).*audio-pixel-cell/);
  assert.match(script, /hashCanonical\(revision\.document\)/); assert.doesNotMatch(script, /fetch\(|supabase|create-post/i);
  assert.match(script, /visibilitychange/);
  assert.match(script, /pagehide/);
  assert.match(script, /beforeunload/);
  assert.match(script, /player\.dispose\(\)/);
  assert.match(script, /mountProjectWorkspace as mountPxdTools/);
  assert.match(script, /const initialSharedImage = \{ width: 16, height: 16/);
  assert.match(script, /readPxdSharedImage/);
  assert.match(script, /await pxdBridge\.save\(\)/);
  assert.doesNotMatch(script, /localStorage\.setItem\(LAST_DRAFT_KEY, currentDraftId\)/);
});
