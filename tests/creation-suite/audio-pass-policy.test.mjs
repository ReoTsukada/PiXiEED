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

test('free 16-column work remains editable when no pass is active', () => {
  const policy = evaluateAudioPassPolicy(createAudioSong(), { extraInstrumentIds: extraIds });
  assert.deepEqual([policy.wideCanvas, policy.usesExtraInstrument, policy.premiumContent, policy.locked], [false, false, false, false]);
});
