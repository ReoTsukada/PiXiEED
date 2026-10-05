import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audioSongPixels, collectAudioEvents, createAudioSong, setAudioColorInstrument, setAudioPixel, setAudioPixelPalette,
  validateAudioSong
} from '../../js/creation/audio-core.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { addAnimationFrame, createAnimation, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { prepareAudioAnimationImport } from '../../js/creation/audio-animation.mjs';
import { readPxdAudioState, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';

const RED = 'rgba-ff0000ff';
const BLUE = 'rgba-0000ffff';

function coloredNotes(song, colors) {
  let next = song;
  colors.forEach((colorId, index) => {
    next = setAudioPixel(next, { trackId: 'track-square', pitch: 60, startTick: index * 120, noteId: `color-note-${index}` });
  });
  return {
    ...next,
    tracks: next.tracks.map((track) => track.instrument === 'square' ? {
      ...track,
      clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note, index) => ({ ...note, colorId: colors[index] })) }))
    } : track)
  };
}

test('same slot colors can use distinct sounds, while equal presets across slots still work', () => {
  let song = setAudioPixelPalette(createAudioSong(), { slotId: 'square', instrument: 'piano' });
  song = setAudioPixelPalette(song, { slotId: 'triangle', instrument: 'piano' });
  song = coloredNotes(song, [RED, BLUE]);
  song = {
    ...song,
    tracks: song.tracks.map((track) => track.instrument === 'triangle' ? {
      ...track,
      clips: track.clips.map((clip) => ({ ...clip, notes: [{ noteId: 'other-slot-note', pitch: 62, startTick: 0, durationTicks: 120, velocity: 96, colorId: 'rgba-00ff00ff' }] }))
    } : track)
  };
  const imagePixels = audioSongPixels(song);

  const changed = setAudioColorInstrument(song, { colorId: RED, instrument: 'flute' });
  const events = collectAudioEvents(changed);
  assert.deepEqual(events.map(({ instrument, pitch, startTick }) => [instrument, pitch, startTick]), [
    ['flute', 60, 0], ['piano', 62, 0], ['piano', 60, 120]
  ]);
  assert.equal(collectAudioEvents(song)[0].instrument, 'piano', 'the source song stays unchanged');
  assert.equal(changed.tracks[0].clips[0].notes[0].colorId, RED, 'note color identity is retained');
  assert.deepEqual(audioSongPixels(changed), imagePixels, 'sound overrides do not alter image pixels');
});

test('missing and removed overrides fall back to the current palette sound and legacy track ID', () => {
  let song = coloredNotes(createAudioSong(), [RED]);
  assert.equal(collectAudioEvents(song)[0].instrument, 'square');
  song = setAudioPixelPalette(song, { slotId: 'square', instrument: 'clarinet' });
  assert.equal(collectAudioEvents(song)[0].instrument, 'clarinet');
  song = setAudioColorInstrument(song, { colorId: RED, instrument: 'violin' });
  assert.equal(collectAudioEvents(song)[0].instrument, 'violin');
  song = setAudioColorInstrument(song, { colorId: RED, instrument: null });
  assert.deepEqual(song.colorInstruments, {});
  assert.equal(collectAudioEvents(song)[0].instrument, 'clarinet');

  const legacy = { ...song, pixelPalette: undefined, colorInstruments: undefined };
  assert.equal(collectAudioEvents(legacy)[0].instrument, 'square');
});

test('invalid color override maps are rejected and an explicit empty map is accepted', () => {
  const song = createAudioSong();
  assert.deepEqual(validateAudioSong({ ...song, colorInstruments: {} }).colorInstruments, {});
  for (const colorInstruments of [
    [], new Map(), Object.assign(Object.create({ inherited: 'piano' }), { [RED]: 'piano' }),
    { 'RGBA-ff0000ff': 'piano' }, { 'rgba-ff000000': 'piano' }, { [RED]: 'missing-sound' }
  ]) assert.throws(() => validateAudioSong({ ...song, colorInstruments }), /音色設定/);
  const tooMany = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`rgba-${index.toString(16).padStart(6, '0')}ff`, 'piano']));
  assert.throws(() => validateAudioSong({ ...song, colorInstruments: tooMany }), /音色設定/);
  assert.throws(() => setAudioColorInstrument(song, { colorId: RED, instrument: 'unknown' }), /音色設定/);
});

test('adjacent notes with different resolved instruments never merge; mixed drums stay distinct', () => {
  let song = coloredNotes(createAudioSong(), [RED, BLUE]);
  song = setAudioColorInstrument(song, { colorId: RED, instrument: 'piano' });
  song = setAudioColorInstrument(song, { colorId: BLUE, instrument: 'flute' });
  song = {
    ...song,
    tracks: song.tracks.map((track) => track.instrument === 'square' ? {
      ...track, clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note) => note.startTick === 0 ? { ...note, durationTicks: 240 } : note) }))
    } : track)
  };
  assert.deepEqual(collectAudioEvents(song, { joinAdjacent: true }).map(({ instrument, startTick, durationTicks }) => [instrument, startTick, durationTicks]), [
    ['piano', 0, 240], ['flute', 120, 120]
  ]);

  let mixed = createAudioSong();
  mixed = setAudioPixelPalette(mixed, { slotId: 'square', instrument: 'piano' });
  mixed = setAudioPixel(mixed, { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'melody' });
  mixed = setAudioPixel(mixed, { trackId: 'track-square', pitch: 60, startTick: 120, noteId: 'drum' });
  mixed = {
    ...mixed,
    tracks: mixed.tracks.map((track) => track.instrument === 'square' ? {
      ...track,
      clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note, index) => ({ ...note, colorId: index ? BLUE : RED })) }))
    } : track)
  };
  mixed = setAudioColorInstrument(mixed, { colorId: BLUE, instrument: 'drum-kick' });
  assert.deepEqual(collectAudioEvents(mixed, { joinAdjacent: true }).map(({ instrument, startTick }) => [instrument, startTick]), [
    ['piano', 0], ['drum-kick', 120]
  ]);
});

test('color overrides survive PXD song save/load and animation projection refresh', async () => {
  let song = setAudioColorInstrument(createAudioSong(), { colorId: RED, instrument: 'violin' });
  const project = await writePxdAudioState(createPxdProject({ projectId: 'color-sound', revisionId: 'color-sound-r1' }), song);
  assert.equal(readPxdAudioState(project).colorInstruments[RED], 'violin');

  let animation = createAnimation({ width: 16, height: 1, palette: ['#ff0000'] });
  const frameId = animation.frames[0].id;
  const document = { schemaVersion: 1, width: 16, height: 1, palette: ['#ff0000'], pixels: [1, ...Array(15).fill(0)] };
  animation = writeAnimationCel(animation, frameId, animation.layers[0].id, document);
  const projection = prepareAudioAnimationImport(song, animation, { colorToSlot: { [RED]: 'square' } });
  assert.equal(projection.song.colorInstruments[RED], 'violin');
  assert.equal(collectAudioEvents(projection.song)[0].instrument, 'violin');
  const animatedProject = await writePxdAudioState(createPxdProject({ projectId: 'color-animation', revisionId: 'color-animation-r1' }), projection.song, {
    link: projection.link, animation
  });
  assert.equal(readPxdAudioState(animatedProject).colorInstruments[RED], 'violin');
});
