import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_BAR_TICKS, AUDIO_PIXEL_TICKS, createAudioSong, resizeAudioCanvas, setAudioPixel, setAudioPixelPalette } from '../../js/creation/audio-core.mjs';
import { AUDIO_BASIC_INSTRUMENT_IDS, AUDIO_FREE_COLUMNS, AUDIO_REWARD_COLUMNS, canEditAudioColumn, getAudioRewardFeatures, getAudioRewardProtectedState, preservesAudioRewardContent } from '../../js/creation/audio-reward-policy.mjs';

test('audio reward configuration keeps four basic instruments and adjustable 16/128-column limits', () => {
  assert.deepEqual(AUDIO_BASIC_INSTRUMENT_IDS, ['square', 'triangle', 'sawtooth', 'noise']);
  assert.equal(AUDIO_FREE_COLUMNS, 16);
  assert.equal(AUDIO_REWARD_COLUMNS, 128);
  assert.equal(canEditAudioColumn(createAudioSong(), 15), true);
  assert.equal(canEditAudioColumn(createAudioSong(), 16), false);
  assert.equal(canEditAudioColumn(createAudioSong(), 16, { rewardActive: true }), true);
});

test('bonus-column notes and loops remain intact while basic-column notes can change', () => {
  let song = resizeAudioCanvas(createAudioSong({ loopTicks: AUDIO_BAR_TICKS * 4 }), AUDIO_REWARD_COLUMNS);
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'free-note' });
  song = setAudioPixel(song, { trackId: 'track-triangle', pitch: 81, startTick: 16 * AUDIO_PIXEL_TICKS, noteId: 'bonus-note' });
  const before = getAudioRewardProtectedState(song);
  const withAnotherFreeNote = setAudioPixel(song, { trackId: 'track-noise', pitch: 79, startTick: AUDIO_PIXEL_TICKS, noteId: 'free-note-2' });
  assert.equal(preservesAudioRewardContent(song, withAnotherFreeNote), true);
  const changedBonus = setAudioPixel(song, { trackId: 'track-triangle', pitch: 81, startTick: 16 * AUDIO_PIXEL_TICKS, active: false });
  assert.equal(preservesAudioRewardContent(song, changedBonus), false);
  assert.equal(getAudioRewardProtectedState(song), before);
  assert.equal(song.loopTicks / AUDIO_PIXEL_TICKS, AUDIO_REWARD_COLUMNS);
});

test('an empty extended loop is not protected audio content', () => {
  const sixteenColumns = resizeAudioCanvas(createAudioSong(), 16);
  const thirtyTwoColumns = resizeAudioCanvas(sixteenColumns, 32);
  assert.equal(preservesAudioRewardContent(sixteenColumns, thirtyTwoColumns), true,
    'empty loop duration can follow the free shared Draw canvas width');
  assert.equal(preservesAudioRewardContent(thirtyTwoColumns, sixteenColumns), true,
    'an empty extension can be removed without deleting bonus notes');
});

test('expired extra-instrument mappings and their notes are part of protected audio state', () => {
  let song = setAudioPixelPalette(createAudioSong(), { slotId: 'square', instrument: 'piano' });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'piano-note' });
  assert.deepEqual(getAudioRewardFeatures(song).additionalInstruments, ['piano']);
  const freeAddition = setAudioPixel(song, { trackId: 'track-noise', pitch: 60, startTick: 0, noteId: 'basic-note' });
  assert.equal(preservesAudioRewardContent(song, freeAddition), true);
  const deletedBonusNote = setAudioPixel(song, { trackId: 'track-square', pitch: 84, startTick: 0, active: false });
  assert.equal(preservesAudioRewardContent(song, deletedBonusNote), false);
  const changedMapping = setAudioPixelPalette(song, { slotId: 'square', instrument: 'square' });
  assert.equal(preservesAudioRewardContent(song, changedMapping), false);
});
