import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_BAR_TICKS, AUDIO_PIXEL_TICKS, createAudioSong, resizeAudioCanvas, setAudioPixel, setAudioPixelPalette } from '../../js/creation/audio-core.mjs';
import { evaluateAudioPassPolicy } from '../../js/creation/audio-pass-policy.mjs';

const extraIds = ['synth-bell', 'warm-pad'];

test('expired wide canvases stay locked without changing their original extent', () => {
  const song = resizeAudioCanvas(createAudioSong({ loopTicks: AUDIO_BAR_TICKS * 2 }), 32);
  assert.equal(evaluateAudioPassPolicy(song, { extraInstrumentIds: extraIds }).locked, true);
  assert.equal(evaluateAudioPassPolicy(song, { passActive: true, extraInstrumentIds: extraIds }).locked, false);
  assert.equal(song.loopTicks / AUDIO_PIXEL_TICKS, 32);
});

test('only notes that actually use an extra instrument trigger the expired lock', () => {
  const emptyPalette = setAudioPixelPalette(createAudioSong(), { slotId: 'square', instrument: 'synth-bell' });
  assert.equal(evaluateAudioPassPolicy(emptyPalette, { extraInstrumentIds: extraIds }).locked, false);
  const playingExtra = setAudioPixel(emptyPalette, { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'extra-note' });
  const policy = evaluateAudioPassPolicy(playingExtra, { extraInstrumentIds: extraIds });
  assert.equal(policy.usesExtraInstrument, true); assert.equal(policy.locked, true);
  assert.equal(evaluateAudioPassPolicy(playingExtra, { passActive: true, extraInstrumentIds: extraIds }).locked, false);
});

test('formerly free presets require an active pass without replacing stored notes', () => {
  const pianoPalette = setAudioPixelPalette(createAudioSong(), { slotId: 'square', instrument: 'piano' });
  const pianoSong = setAudioPixel(pianoPalette, { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'piano-note' });
  assert.equal(evaluateAudioPassPolicy(pianoSong).locked, true);
  assert.equal(evaluateAudioPassPolicy(pianoSong, { extraInstrumentPassActive: true }).locked, false);
  assert.equal(pianoSong.pixelPalette[0].instrument, 'piano');
  assert.equal(pianoSong.tracks[0].clips[0].notes[0].noteId, 'piano-note');
});

test('free 16-column work remains editable when no pass is active', () => {
  const policy = evaluateAudioPassPolicy(createAudioSong(), { extraInstrumentIds: extraIds });
  assert.deepEqual([policy.wideCanvas, policy.usesExtraInstrument, policy.premiumContent, policy.locked], [false, false, false, false]);
});

test('shared canvas policy keeps a free 64px image unlocked even when its audio loop is wide', () => {
  const song = resizeAudioCanvas(createAudioSong(), 32);
  const image = { width: 64, height: 64, rgba: new Uint8Array(64 * 64 * 4) };
  const policy = evaluateAudioPassPolicy(song, { extraInstrumentIds: extraIds, sharedImage: image });
  assert.equal(policy.wideCanvas, true);
  assert.equal(policy.premiumContent, false);
  assert.equal(policy.locked, false);
});

test('shared dimensions and exact color count require a pass, while the same shape opens with pass active', () => {
  const image = { width: 192, height: 128, rgba: new Uint8Array(192 * 128 * 4) };
  for (let i = 0; i < 17; i += 1) image.rgba.set([i, i + 1, i + 2, 255], i * 4);
  const song = createAudioSong();
  const locked = evaluateAudioPassPolicy(song, { sharedImage: image });
  const active = evaluateAudioPassPolicy(song, { sharedImage: image, passActive: true });
  assert.deepEqual([locked.premiumContent, locked.locked], [true, true]);
  assert.deepEqual([active.premiumContent, active.locked], [true, false]);
});
