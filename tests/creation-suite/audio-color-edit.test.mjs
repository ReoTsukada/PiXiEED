import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnimationFrame, composeAnimationFrame, createAnimation, getAnimationCelDocument, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { AUDIO_PIXEL_TICKS, createAudioSong, setAudioColorInstrument, setAudioPixel } from '../../js/creation/audio-core.mjs';
import { prepareAudioAnimationImport, validateAudioAnimationBinding } from '../../js/creation/audio-animation.mjs?rev=20261001-audio-animation-1';
import { createPxdProject, decodePxd, encodePxd, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { readPxdImage } from '../../js/creation/pxd-project.mjs';
import { preparePxdAudioImageImport, prepareSharedAudioImageImport, readPxdAudioLink, readPxdAudioState, validatePxdAudioBinding, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs?rev=20261001-free-tools-1';
import { audioHexToHsl, audioHslToHex, replaceAudioSourceColor } from '../../js/creation/audio-color-edit.mjs';

const OLD_ID = 'rgba-11223380';
const TARGET_ID = 'rgba-abcdef80';
const noteList = (song) => song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes.map((note) => ({ trackId: track.trackId, instrument: track.instrument, note }))));
function imageWithTwoColors() {
  return { width: 2, height: 1, rgba: new Uint8Array([0x11, 0x22, 0x33, 0x80, 0x44, 0x55, 0x66, 0x80]) };
}
function addManualNote(song, { trackId = 'track-triangle', pitch = 60, startTick = AUDIO_PIXEL_TICKS * 3, colorId = OLD_ID } = {}) {
  const withNote = setAudioPixel(song, { trackId, pitch, startTick, noteId: `manual-${song.songId}`, velocity: 73 });
  return { ...withNote, tracks: withNote.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note) => note.noteId === `manual-${song.songId}` ? { ...note, colorId } : note) }))
  })) };
}

test('Audio HSL controls round trip representative saturated and neutral colors', () => {
  for (const color of ['#ff0000', '#34a9d3', '#ffffff', '#000000', '#777777']) {
    const { h, s, l } = audioHexToHsl(color);
    const roundTrip = audioHslToHex(h, s, l);
    for (const offset of [1, 3, 5]) assert.ok(Math.abs(Number.parseInt(roundTrip.slice(offset, offset + 2), 16) - Number.parseInt(color.slice(offset, offset + 2), 16)) <= 3);
  }
});

test('shared image recolor preserves alpha, generated notes, unrelated manual notes, and PXD roundtrip', async () => {
  const image = imageWithTwoColors();
  const song = addManualNote(createAudioSong({ songId: 'shared-color-edit' }));
  const plan = prepareSharedAudioImageImport(song, image, { rowPitchMap: [64], colorToSlot: { [OLD_ID]: 'square', 'rgba-44556680': 'triangle' } });
  const sourceNotes = noteList(plan.song).filter(({ note }) => note.sourceCell);
  const manualBefore = noteList(plan.song).find(({ note }) => note.noteId === `manual-${song.songId}`).note;
  const result = replaceAudioSourceColor({ image: plan.image, link: plan.link, song: plan.song, colorId: OLD_ID, hex: '#abcdef' });

  assert.deepEqual([...result.image.rgba], [0xab, 0xcd, 0xef, 0x80, 0x44, 0x55, 0x66, 0x80]);
  assert.deepEqual([...image.rgba], [0x11, 0x22, 0x33, 0x80, 0x44, 0x55, 0x66, 0x80]);
  assert.equal(result.link.colorToSlot[TARGET_ID], 'square');
  assert.equal(Object.hasOwn(result.link.colorToSlot, OLD_ID), false);
  assert.deepEqual(noteList(result.song).filter(({ note }) => note.sourceCell).map(({ trackId, note }) => ({ trackId, note })), sourceNotes.map(({ trackId, note }) => ({ trackId, note: { ...note, colorId: note.colorId === OLD_ID ? TARGET_ID : note.colorId } })));
  assert.deepEqual(noteList(result.song).find(({ note }) => note.noteId === `manual-${song.songId}`).note, manualBefore);
  validatePxdAudioBinding(result.song, result.image, result.link);

  const written = await writePxdAudioState(createPxdProject({ projectId: 'shared-color-project' }), result.song, { image: result.image, link: result.link });
  const project = await decodePxd(await encodePxd(written));
  const savedSong = readPxdAudioState(project); const savedImage = await readPxdImage(project, 'audio'); const savedLink = readPxdAudioLink(project);
  validatePxdAudioBinding(savedSong, savedImage, savedLink);
  assert.deepEqual(savedImage.rgba, result.image.rgba);
  assert.deepEqual(noteList(savedSong).find(({ note }) => note.noteId === manualBefore.noteId).note, manualBefore);
});

test('shared image merges colors only when their sound mapping is the same, including silence', () => {
  const image = imageWithTwoColors();
  const sameSlot = prepareSharedAudioImageImport(createAudioSong({ songId: 'merge-same-slot' }), image, {
    rowPitchMap: [64], colorToSlot: { [OLD_ID]: 'square', 'rgba-44556680': 'square' }
  });
  const merged = replaceAudioSourceColor({ image: sameSlot.image, link: sameSlot.link, song: sameSlot.song, colorId: OLD_ID, hex: '#445566' });
  assert.equal(merged.link.colorToSlot['rgba-44556680'], 'square');
  assert.equal(Object.hasOwn(merged.link.colorToSlot, OLD_ID), false);
  validatePxdAudioBinding(merged.song, merged.image, merged.link);

  const silent = prepareSharedAudioImageImport(createAudioSong({ songId: 'merge-silent' }), image, {
    rowPitchMap: [64], colorToSlot: { [OLD_ID]: null, 'rgba-44556680': null }
  });
  const silentMerge = replaceAudioSourceColor({ image: silent.image, link: silent.link, song: silent.song, colorId: OLD_ID, hex: '#445566' });
  assert.equal(silentMerge.link.colorToSlot['rgba-44556680'], null);
  assert.equal(noteList(silentMerge.song).some(({ note }) => note.sourceCell), false);
  validatePxdAudioBinding(silentMerge.song, silentMerge.image, silentMerge.link);
});

test('shared image rejects collisions with a different slot without changing the source', () => {
  const image = imageWithTwoColors();
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'collision-color' }), image, {
    rowPitchMap: [64], colorToSlot: { [OLD_ID]: 'square', 'rgba-44556680': 'triangle' }
  });
  const original = new Uint8Array(plan.image.rgba);
  assert.throws(() => replaceAudioSourceColor({ image: plan.image, link: plan.link, song: plan.song, colorId: OLD_ID, hex: '#445566' }), /別の音に割り当て済み/);
  assert.deepEqual(plan.image.rgba, original);
  validatePxdAudioBinding(plan.song, plan.image, plan.link);
});

test('unused declared palette colors can be recolored without changing pixels or notes and still roundtrip', async () => {
  const image = { width: 1, height: 1, rgba: new Uint8Array([0x44, 0x55, 0x66, 255]) };
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'unused-color-edit' }), image, {
    rowPitchMap: [64], colorToSlot: { 'rgba-445566ff': 'square', [OLD_ID]: 'triangle' }
  });
  const notesBefore = noteList(plan.song);
  const pixelsBefore = new Uint8Array(plan.image.rgba);
  const result = replaceAudioSourceColor({ image: plan.image, link: plan.link, song: plan.song, colorId: OLD_ID, hex: '#abcdef' });

  assert.equal(result.image, plan.image);
  assert.deepEqual(result.image.rgba, pixelsBefore);
  assert.deepEqual(noteList(result.song), notesBefore);
  assert.equal(result.link.colorToSlot[TARGET_ID], 'triangle');
  assert.equal(Object.hasOwn(result.link.colorToSlot, OLD_ID), false);
  validatePxdAudioBinding(result.song, result.image, result.link);

  const written = await writePxdAudioState(createPxdProject({ projectId: 'unused-color-project' }), result.song, { image: result.image, link: result.link });
  const project = await decodePxd(await encodePxd(written));
  const savedImage = await readPxdImage(project, 'audio');
  const savedLink = readPxdAudioLink(project);
  validatePxdAudioBinding(readPxdAudioState(project), savedImage, savedLink);
  assert.deepEqual(savedImage.rgba, pixelsBefore);
  assert.equal(savedLink.colorToSlot[TARGET_ID], 'triangle');
});

test('legacy pixel-cell-v1 recolor updates only generated image-note metadata and still saves', async () => {
  const source = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  for (let offset = 0; offset < source.rgba.length; offset += 4) source.rgba.set([0x11, 0x22, 0x33, 255], offset);
  const plan = preparePxdAudioImageImport(createAudioSong({ songId: 'legacy-color-edit' }), source);
  const oldId = 'rgba-112233ff';
  const result = replaceAudioSourceColor({ image: plan.image, link: plan.link, song: plan.song, colorId: oldId, hex: '#abcdef' });
  assert.ok(noteList(result.song).every(({ note }) => note.colorId === 'rgba-abcdefff'));
  validatePxdAudioBinding(result.song, result.image, result.link);
  const written = await writePxdAudioState(createPxdProject({ projectId: 'legacy-color-project' }), result.song, { image: result.image, link: result.link });
  const project = await decodePxd(await encodePxd(written));
  validatePxdAudioBinding(readPxdAudioState(project), await readPxdImage(project, 'audio'), readPxdAudioLink(project));
});

test('animation recolor preserves every frame cel, manual notes, mapping, and PXD roundtrip', async () => {
  const oldHex = '#112233'; const oldId = 'rgba-112233ff'; const nextId = 'rgba-abcdefff';
  let animation = createAnimation({ width: 2, height: 1, palette: [oldHex, '#445566'] });
  const layerId = animation.layers[0].id; const firstId = animation.frames[0].id;
  animation = writeAnimationCel(animation, firstId, layerId, { width: 2, height: 1, pixels: [1, 0] });
  animation = addAnimationFrame(animation, { sourceFrameId: firstId });
  const secondId = animation.frames[1].id;
  animation = writeAnimationCel(animation, secondId, layerId, { width: 2, height: 1, pixels: [0, 1] });
  const beforeCels = animation.frames.map(({ id }) => getAnimationCelDocument(animation, id, layerId).pixels);
  const base = addManualNote(createAudioSong({ songId: 'animation-color-edit' }), { pitch: 60, startTick: AUDIO_PIXEL_TICKS * 7, colorId: oldId });
  const plan = prepareAudioAnimationImport(base, animation, { rowPitchMap: [64], colorToSlot: { [oldId]: 'square', 'rgba-445566ff': null } });
  const manualBefore = noteList(plan.song).find(({ note }) => note.noteId === `manual-${base.songId}`).note;
  const result = replaceAudioSourceColor({ animation: plan.animation, link: plan.link, song: plan.song, colorId: oldId, hex: '#abcdef' });

  assert.deepEqual(result.animation.palette, ['#abcdef', '#445566']);
  assert.deepEqual(result.animation.frames.map(({ id }) => getAnimationCelDocument(result.animation, id, layerId).pixels), beforeCels);
  assert.deepEqual(result.animation.frames.map(({ id }) => composeAnimationFrame(result.animation, id).pixels), beforeCels);
  assert.equal(result.link.colorToSlot[nextId], 'square');
  assert.equal(Object.hasOwn(result.link.colorToSlot, oldId), false);
  assert.deepEqual(noteList(result.song).filter(({ note }) => note.sourceCell?.kind === 'audio-animation').map(({ note }) => note.colorId), Array(noteList(plan.song).filter(({ note }) => note.sourceCell?.kind === 'audio-animation').length).fill(nextId));
  assert.deepEqual(noteList(result.song).find(({ note }) => note.noteId === manualBefore.noteId).note, manualBefore);
  validateAudioAnimationBinding(result.song, result.animation, result.link);

  let project = await writePxdAudioState(createPxdProject({ projectId: 'animation-color-project' }), result.song, { link: result.link, animation: result.animation });
  project = await writePxdAnimation(project, result.animation, { role: 'audio', posterFrameId: firstId });
  project = await decodePxd(await encodePxd(project));
  const savedAnimation = await readPxdAnimation(project, 'audio');
  validateAudioAnimationBinding(readPxdAudioState(project), savedAnimation, readPxdAudioLink(project));
  assert.deepEqual(savedAnimation.palette, ['#abcdef', '#445566']);
  assert.deepEqual(savedAnimation.frames.map(({ id }) => getAnimationCelDocument(savedAnimation, id, layerId).pixels), beforeCels);
  assert.deepEqual(getPxdJson(project, 'audio/link.json').colorToSlot[nextId], 'square');
});

test('wrong versions, mismatched image modes, and duplicate animation colors fail before mutation', () => {
  const image = imageWithTwoColors();
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'version-check' }), image, { rowPitchMap: [64], colorToSlot: { [OLD_ID]: 'square', 'rgba-44556680': 'square' } });
  assert.throws(() => replaceAudioSourceColor({ image, link: { ...plan.link, rulesVersion: 'future-version' }, song: plan.song, colorId: OLD_ID, hex: '#abcdef' }), /形式/);
  assert.throws(() => replaceAudioSourceColor({ image, link: { ...plan.link, imageRole: 'main' }, song: plan.song, colorId: OLD_ID, hex: '#abcdef' }), /共有元画像/);
  assert.throws(() => replaceAudioSourceColor({ image, animation: {}, link: plan.link, song: plan.song, colorId: OLD_ID, hex: '#abcdef' }), /アニメーション形式/);
  let animation = createAnimation({ width: 2, height: 1, palette: ['#112233', '#abcdef'] });
  const animated = prepareAudioAnimationImport(createAudioSong(), animation, { rowPitchMap: [64], colorToSlot: { 'rgba-112233ff': 'square' } });
  assert.throws(() => replaceAudioSourceColor({ animation: animated.animation, link: { ...animated.link, colorToSlot: { ...animated.link.colorToSlot, 'rgba-abcdefff': 'square' } }, song: animated.song, colorId: 'rgba-112233ff', hex: '#abcdef' }), /すでに同じ色/);
  validateAudioAnimationBinding(animated.song, animated.animation, animated.link);
});


test('color sound follows recoloring and repeated PXD writes replace owned maps, preserving unknown fields', async () => {
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'override-recolor' }), imageWithTwoColors(), {
    rowPitchMap: [64], colorToSlot: { [OLD_ID]: 'square', 'rgba-44556680': 'square' }
  });
  const song = setAudioColorInstrument(plan.song, { colorId: OLD_ID, instrument: 'organ' });
  let project = await writePxdAudioState(createPxdProject({ projectId: 'override-recolor-project' }), song, { image: plan.image, link: plan.link });
  project = setPxdJson(project, 'audio/state.json', { ...getPxdJson(project, 'audio/state.json'), futureField: { retained: true } });
  project = setPxdJson(project, 'audio/link.json', { ...getPxdJson(project, 'audio/link.json'), futureField: { retained: true } });
  const changed = replaceAudioSourceColor({ ...plan, song, colorId: OLD_ID, hex: '#abcdef' });
  assert.deepEqual(changed.song.colorInstruments, { [TARGET_ID]: 'organ' });
  project = await writePxdAudioState(project, changed.song, { image: changed.image, link: changed.link });
  project = await decodePxd(await encodePxd(project));
  assert.deepEqual(readPxdAudioState(project).colorInstruments, { [TARGET_ID]: 'organ' });
  assert.equal(Object.hasOwn(readPxdAudioLink(project).colorToSlot, OLD_ID), false);
  assert.deepEqual(getPxdJson(project, 'audio/state.json').futureField, { retained: true });
  assert.deepEqual(getPxdJson(project, 'audio/link.json').futureField, { retained: true });
  const cleared = setAudioColorInstrument(changed.song, { colorId: TARGET_ID, instrument: null });
  project = await writePxdAudioState(project, cleared, { image: changed.image, link: changed.link });
  assert.deepEqual(readPxdAudioState(project).colorInstruments, {});
  const legacy = { ...cleared }; delete legacy.colorInstruments;
  project = await writePxdAudioState(project, legacy, { image: changed.image, link: changed.link });
  assert.equal(Object.hasOwn(readPxdAudioState(project), 'colorInstruments'), false);
});

test('same-slot colors with different effective sounds cannot be merged by recoloring', () => {
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'different-voices-collision' }), imageWithTwoColors(), {
    rowPitchMap: [64], colorToSlot: { [OLD_ID]: 'square', 'rgba-44556680': 'square' }
  });
  const song = setAudioColorInstrument(plan.song, { colorId: OLD_ID, instrument: 'organ' });
  const before = structuredClone({ song, link: plan.link, image: plan.image });
  assert.throws(() => replaceAudioSourceColor({ ...plan, song, colorId: OLD_ID, hex: '#445566' }), /別の音に割り当て済み/);
  assert.deepEqual({ song, link: plan.link, image: plan.image }, before);
});

test('recolor retains original color sound for unrelated manually tagged notes', () => {
  const plan = prepareSharedAudioImageImport(addManualNote(createAudioSong({ songId: 'manual-override' })), imageWithTwoColors(), {
    rowPitchMap: [64], colorToSlot: { [OLD_ID]: 'square', 'rgba-44556680': 'triangle' }
  });
  const song = setAudioColorInstrument(plan.song, { colorId: OLD_ID, instrument: 'organ' });
  const result = replaceAudioSourceColor({ ...plan, song, colorId: OLD_ID, hex: '#abcdef' });
  assert.deepEqual(result.song.colorInstruments, { [OLD_ID]: 'organ', [TARGET_ID]: 'organ' });
  assert.equal(noteList(result.song).find(({ note }) => note.noteId === 'manual-manual-override').note.colorId, OLD_ID);
});

test('animation recolor moves the independent color sound through repeated saves', async () => {
  const oldId = 'rgba-112233ff'; const nextId = 'rgba-abcdefff';
  let animation = createAnimation({ width: 2, height: 1, palette: ['#112233', '#445566'] });
  animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, { width: 2, height: 1, pixels: [1, 2] });
  const plan = prepareAudioAnimationImport(createAudioSong({ songId: 'animation-override-recolor' }), animation, {
    rowPitchMap: [64], colorToSlot: { [oldId]: 'square', 'rgba-445566ff': 'square' }
  });
  const song = setAudioColorInstrument(plan.song, { colorId: oldId, instrument: 'organ' });
  let project = await writePxdAudioState(createPxdProject({ projectId: 'animation-override-recolor-project' }), song, { animation: plan.animation, link: plan.link });
  const result = replaceAudioSourceColor({ ...plan, song, colorId: oldId, hex: '#abcdef' });
  project = await writePxdAudioState(project, result.song, { animation: result.animation, link: result.link });
  project = await decodePxd(await encodePxd(project));
  assert.deepEqual(readPxdAudioState(project).colorInstruments, { [nextId]: 'organ' });
  assert.equal(Object.hasOwn(readPxdAudioLink(project).colorToSlot, oldId), false);
  validateAudioAnimationBinding(readPxdAudioState(project), result.animation, readPxdAudioLink(project));
});
