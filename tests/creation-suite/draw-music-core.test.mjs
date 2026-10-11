import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, getAnimationCelDocument, addAnimationFrame, addAnimationLayer, moveAnimationFrame, removeAnimationFrame, serializeAnimationPool, setAnimationPalette, writeAnimationCel, composeAnimationFrame } from '../../js/creation/animation-core.mjs';
import { AUDIO_ANIMATION_LINK_VERSION, createAudioAnimationLink, getAudioAnimationCellPitch, audioAnimationCellTiming, audioAnimationSequenceColumn, validateAudioAnimationBinding } from '../../js/creation/audio-animation.mjs';
import { AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, createAudioSong, setAudioColorInstrument, setAudioPixel, collectAudioEvents } from '../../js/creation/audio-core.mjs';
import { createPxdProject, getPxdJson, setPxdBytes, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { audioCellLink, audioSongImage, prepareSharedAudioImageImport, projectLegacySharedAudioImage, readPxdAudioLink, readPxdAudioState, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { putPxdSharedImage, readPxdImage, readPxdSharedImage } from '../../js/creation/pxd-project.mjs';
import { readPxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { changeDrawMusicColor, changeDrawMusicTempo, createDrawMusicState, describeDrawMusicProjection, projectDrawMusic, writeDrawMusicProject } from '../../js/creation/draw-music-core.mjs';
import { documentRgba } from '../../js/creation/draw-core.mjs';

const GREEN = '#49643c';
const BLUE = '#4c82c3';
const RED = '#e75445';
const GREEN_ID = 'rgba-49643cff';
const BLUE_ID = 'rgba-4c82c3ff';
const RED_ID = 'rgba-e75445ff';

test('replacing artwork does not treat unrelated palette entries as recolored sound assignments', () => {
  const original = artwork({ palette: [GREEN], pixels: [[0, 0, 0]] });
  const state = changeDrawMusicColor(createDrawMusicState(null, original), { colorId: GREEN_ID, slotId: 'square', instrument: 'triangle' });
  const replacement = artwork({ palette: ['#123456', '#654321'], pixels: [[0, 0, 0]] });
  const next = projectDrawMusic(state, replacement);
  assert.equal(next.link.colorToSlot['rgba-123456ff'], null);
  assert.equal(next.link.colorToSlot['rgba-654321ff'], null);
  assert.equal(collectAudioEvents(next.song).length, 0);
});

test('music projection preview reports actual Draw dimensions, pitch range and timing', () => {
  const animation = artwork({ width: 24, height: 12, palette: [GREEN], pixels: [[0, 0, 0]] });
  const state = createDrawMusicState(null, animation);
  assert.match(describeDrawMusicProjection(state), /24×12px・1コマ・横1ドット＝16分音符/);
  assert.match(describeDrawMusicProjection(state), /音高/);
});

function paint(animation, frameId, layerId, indices) {
  const cel = getAnimationCelDocument(animation, frameId, layerId);
  cel.pixels = Uint8Array.from(cel.pixels, (value) => value + 1);
  for (const [x, y, color] of indices) cel.pixels[y * animation.width + x] = color + 1;
  return writeAnimationCel(animation, frameId, layerId, cel);
}

function artwork({ palette = [GREEN, BLUE], pixels = [[0, 0, 0], [1, 0, 1]], width = 2, height = 1 } = {}) {
  let animation = createAnimation({ width, height, palette });
  animation = paint(animation, animation.frames[0].id, animation.layers[0].id, pixels);
  return animation;
}

function emptyImage(width = 1, height = 1) { return { width, height, rgba: new Uint8Array(width * height * 4) }; }

test('existing static Audio song and linked image remain byte-equivalent until Draw timeline changes', async () => {
  let song = createAudioSong({ songId: 'kept-song', tempo: 137 });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'original-note' });
  song.futureField = { retain: true };
  const image = emptyImage(); image.rgba.set([73, 100, 60, 255]);
  const plan = prepareSharedAudioImageImport(song, image, { colorToSlot: { [GREEN_ID]: 'square' } });
  let project = setPxdJson(createPxdProject(), 'future/state.json', { retained: 42 });
  project = setPxdBytes(project, 'future/opaque.bin', new Uint8Array([7, 8, 9]));
  project = await writePxdAudioState(project, plan.song, { image: plan.image, link: plan.link });
  const before = readPxdAudioState(project);
  const beforeEvents = collectAudioEvents(before);
  const animation = artwork();
  const state = createDrawMusicState(project, animation);
  assert.equal(projectDrawMusic(state, animation), state);
  const saved = await writeDrawMusicProject(project, state);
  assert.deepEqual(readPxdAudioState(saved), before);
  assert.deepEqual(collectAudioEvents(readPxdAudioState(saved)), beforeEvents);
  assert.deepEqual(getPxdJson(saved, 'future/state.json'), { retained: 42 });
  assert.deepEqual([...saved.entries.find(({ path }) => path === 'future/opaque.bin').bytes], [7, 8, 9]);
});

test('Draw edits replace only linked image notes and preserve manual notes, tempo, and color instruments', async () => {
  let song = createAudioSong({ songId: 'linked-song', tempo: 143 });
  song = setAudioPixel(song, { trackId: 'track-noise', pitch: 60, startTick: 0, noteId: 'manual-note' });
  const image = emptyImage(); image.rgba.set([73, 100, 60, 255]);
  const plan = prepareSharedAudioImageImport(song, image, { rowPitchMap: [60], colorToSlot: { [GREEN_ID]: 'square' } });
  const project = await writePxdAudioState(createPxdProject(), plan.song, { image: plan.image, link: plan.link });
  const originalSong = readPxdAudioState(project);
  const animation = artwork({ palette: [GREEN, BLUE] });
  const state = createDrawMusicState(project, animation);
  const edited = paint(animation, animation.frames[0].id, animation.layers[0].id, [[1, 0, -1]]);
  const projected = projectDrawMusic(state, edited);
  assert.equal(projected.song.tempo, 143);
  assert.equal(projected.link.rulesVersion, AUDIO_ANIMATION_LINK_VERSION);
  const notes = projected.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes));
  assert.ok(notes.some(({ noteId }) => noteId === 'manual-note'));
  assert.ok(notes.some(({ sourceCell, colorId, pitch }) => sourceCell?.kind === 'audio-animation' && colorId === GREEN_ID && pitch === 60));
  assert.ok(!notes.some(({ sourceCell }) => sourceCell?.kind === undefined && Number.isInteger(sourceCell?.x)));
  assert.deepEqual(notes.filter((note) => note.sourceCell?.kind !== 'audio-animation' && note.noteId !== 'manual-note'),
    originalSong.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes)).filter((note) => !note.sourceCell && note.noteId !== 'manual-note'));
});

test('palette order and duplicate colors keep RGBA mappings; unique same-index edits inherit mapping and instrument', () => {
  const animation = artwork({ palette: [GREEN, BLUE], pixels: [[0, 0, 0]] });
  let state = createDrawMusicState(null, animation);
  state = changeDrawMusicColor(state, { colorId: GREEN_ID, slotId: 'noise', instrument: 'sawtooth' });
  let reordered = setAnimationPalette(animation, [BLUE, GREEN]);
  reordered = paint(reordered, animation.frames[0].id, animation.layers[0].id, [[0, 0, 1]]);
  const reorderedState = projectDrawMusic(state, reordered);
  assert.equal(reorderedState.link.colorToSlot[GREEN_ID], 'noise');
  assert.equal(reorderedState.link.colorToSlot[BLUE_ID], 'triangle');

  const edited = setAnimationPalette(animation, ['#123456', BLUE]);
  const editedState = projectDrawMusic(state, edited);
  assert.equal(editedState.link.colorToSlot['rgba-123456ff'], 'noise');
  assert.equal(editedState.song.colorInstruments['rgba-123456ff'], 'sawtooth');

  const duplicate = setAnimationPalette(animation, [BLUE, BLUE]);
  const duplicateState = projectDrawMusic(state, duplicate);
  assert.equal(duplicateState.link.colorToSlot[BLUE_ID], 'triangle', 'existing exact-RGBA assignment wins over index inheritance');
  assert.equal(Object.keys(duplicateState.link.colorToSlot).filter((id) => id === BLUE_ID).length, 1);
});

test('transparent and unknown colors stay silent while explicit mapping and tempo helpers are reversible state changes', () => {
  const animation = artwork({ palette: [RED, BLUE], pixels: [[0, 0, 0]] });
  let state = createDrawMusicState(null, animation);
  assert.equal(state.link.colorToSlot[RED_ID], null);
  assert.equal(collectAudioEvents(state.song).length, 0);
  state = changeDrawMusicColor(state, { colorId: RED_ID, slotId: 'square', instrument: 'triangle' });
  assert.equal(state.link.colorToSlot[RED_ID], 'square');
  assert.equal(state.song.colorInstruments[RED_ID], 'triangle');
  assert.ok(collectAudioEvents(state.song).some(({ instrument }) => instrument === 'triangle'));
  const cleared = changeDrawMusicColor(state, { colorId: RED_ID, slotId: null, instrument: null });
  assert.equal(cleared.link.colorToSlot[RED_ID], null);
  assert.equal(cleared.song.colorInstruments?.[RED_ID], undefined);
  assert.equal(collectAudioEvents(cleared.song).length, 0);
  const tempo = changeDrawMusicTempo(state, 151);
  assert.equal(tempo.song.tempo, 151);
  assert.equal(state.song.tempo, 120);
  assert.throws(() => changeDrawMusicColor(state, { colorId: RED_ID, slotId: 'invalid' }), /音色スロット/);
});

test('frame, layer, pitch-map, and undo changes preserve RGBA mappings across history snapshots', () => {
  let animation = artwork({ width: 1, height: 1, palette: [GREEN], pixels: [[0, 0, 0]] });
  const frameA = animation.frames[0].id; const layer = animation.layers[0].id;
  const state = createDrawMusicState(null, animation);
  const customLink = createAudioAnimationLink(state.song, animation, {
    rowPitchMap: [48], frameRowPitchMaps: { [frameA]: [60] },
    frameCellPitchMaps: { [frameA]: { '0:0': 72 } }, colorToSlot: state.link.colorToSlot
  });
  const mapped = { ...state, link: customLink };
  animation = addAnimationFrame(animation, { sourceFrameId: frameA });
  const frameB = animation.frames[1].id;
  animation = paint(animation, frameB, layer, [[0, 0, 0]]);
  const after = projectDrawMusic(mapped, animation);
  assert.equal(getAudioAnimationCellPitch(after.link, frameA, 0, 0), 72);
  assert.equal(getAudioAnimationCellPitch(after.link, frameB, 0, 0), 48, 'new frames use the row fallback');
  const afterMapping = changeDrawMusicColor(after, { colorId: GREEN_ID, slotId: 'square' });
  const undone = projectDrawMusic(afterMapping, mapped.animation);
  assert.equal(undone.link.colorToSlot[GREEN_ID], 'square');
  assert.equal(undone.link.frameRowPitchMaps[frameA][0], 60);
  assert.deepEqual(undone.link.frameCellPitchMaps[frameA], { '0:0': 72 });
  assert.equal(undone.link.frameRowPitchMaps[frameB], undefined);
});

test('shared tile references affect signatures even when their serialized bytes are null', () => {
  let animation = artwork({ width: 1, height: 1, palette: [GREEN, BLUE], pixels: [[0, 0, 0]] });
  const frameA = animation.frames[0].id; const layer = animation.layers[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: frameA });
  const frameB = animation.frames[1].id;
  animation = paint(animation, frameB, layer, [[0, 0, 1]]);
  animation = addAnimationFrame(animation, { sourceFrameId: frameA });
  const frameC = animation.frames[2].id;
  const baseline = createDrawMusicState(null, animation);
  const changed = paint(animation, frameC, layer, [[0, 0, 1]]);
  assert.equal(serializeAnimationPool(changed).at(-1).bytes, null);
  assert.notEqual(projectDrawMusic(baseline, changed), baseline, 'a changed pooled tile reference must invalidate the cache');
});

test('repeated palette recolors prune stale overrides but preserve manual-note color overrides', () => {
  let animation = artwork({ width: 1, height: 1, palette: [GREEN], pixels: [[0, 0, 0]] });
  let state = createDrawMusicState(null, animation);
  state = changeDrawMusicColor(state, { colorId: GREEN_ID, slotId: 'square', instrument: 'sawtooth' });
  let song = setAudioColorInstrument(state.song, { colorId: RED_ID, instrument: 'triangle' });
  song = { ...song, tracks: song.tracks.map((track) => track.trackId === 'track-square'
    ? { ...track, clips: track.clips.map((clip, index) => index === 0 ? { ...clip, notes: [...clip.notes,
      { noteId: 'manual-colored', pitch: 55, startTick: 0, durationTicks: AUDIO_PIXEL_TICKS, velocity: 80, colorId: RED_ID }
    ] } : clip) } : track) };
  state = { ...state, song };
  for (let index = 0; index < 36; index += 1) {
    const nextColor = `#${(0x110000 + index * 0x0101).toString(16).padStart(6, '0')}`;
    const previousId = colorIdForTest(animation.palette[0]);
    animation = setAnimationPalette(animation, [nextColor]);
    state = projectDrawMusic(state, animation);
    const nextId = colorIdForTest(nextColor);
    assert.equal(state.song.colorInstruments[nextId], 'sawtooth');
    assert.ok(Object.keys(state.song.colorInstruments).length <= 2);
    assert.equal(state.link.colorToSlot[nextId], 'square');
    assert.ok(Object.hasOwn(state.link.colorToSlot, previousId), 'historical slot mapping remains available for undo snapshots');
  }
  const events = collectAudioEvents(state.song);
  assert.ok(events.some((event) => event.pitch === 55 && event.instrument === 'triangle'), 'manual note keeps its explicit sound');
});

test('standalone Audio PXD state survives a shadow image open/save and old editor cells are removed on Draw edits', async () => {
  let song = createAudioSong({ songId: 'legacy-standalone' });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: AUDIO_PIXEL_PITCHES[5], startTick: 3 * AUDIO_PIXEL_TICKS,
    noteId: 'note-123e4567-e89b-42d3-a456-426614174000-3-5' });
  song = setAudioColorInstrument(song, { colorId: RED_ID, instrument: 'triangle' });
  song = { ...song, tracks: song.tracks.map((track) => track.trackId === 'track-noise'
    ? { ...track, clips: track.clips.map((clip, index) => index === 0 ? { ...clip, notes: [...clip.notes,
      { noteId: 'manual-note-4-6', pitch: AUDIO_PIXEL_PITCHES[6], startTick: 4 * AUDIO_PIXEL_TICKS, durationTicks: AUDIO_PIXEL_TICKS, velocity: 80, colorId: RED_ID }
    ] } : clip) } : track) };
  const original = setPxdJson(createPxdProject(), 'audio/state.json', song);
  const shadow = await writePxdAudioState(original, song, { image: audioSongImage(song), link: audioCellLink(song) });
  let animation = artwork({ width: 16, height: AUDIO_PIXEL_PITCHES.length, palette: [GREEN], pixels: [] });
  const originalEvents = collectAudioEvents(readPxdAudioState(original));
  const state = createDrawMusicState(shadow, animation, { legacySongOnly: true });
  assert.deepEqual(collectAudioEvents(state.song), originalEvents, 'opening the shadow projection must not replay-import or rewrite the legacy song');
  const savedUntouched = await writeDrawMusicProject(original, state);
  assert.deepEqual(readPxdAudioState(savedUntouched), song);
  assert.equal(readPxdAudioLink(savedUntouched), null);
  assert.equal(savedUntouched.entries.some(({ path }) => path.startsWith('images/audio/')), false);

  animation = setAnimationPalette(animation, [BLUE]);
  const projected = projectDrawMusic(state, animation);
  const notes = projected.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes));
  assert.ok(!notes.some(({ noteId }) => noteId === 'note-123e4567-e89b-42d3-a456-426614174000-3-5'), 'old UI-generated cell note is replaced');
  assert.ok(notes.some(({ noteId }) => noteId === 'manual-note-4-6'), 'ordinary manually named note remains');
  assert.ok(collectAudioEvents(projected.song).some((event) => event.pitch === AUDIO_PIXEL_PITCHES[6] && event.instrument === 'triangle'),
    'an unlinked manual note retains its unknown-RGBA sound override');
});

function colorIdForTest(color) { return `rgba-${color.slice(1).padEnd(8, 'f').toLowerCase()}`; }

test('changed Draw projection persists in audio role while retaining future JSON fields and unrelated PXD entries', async () => {
  const animation = artwork({ width: 1, height: 1, palette: [GREEN], pixels: [[0, 0, 0]] });
  const originalLink = createAudioAnimationLink(createAudioSong(), animation, { colorToSlot: { [GREEN_ID]: 'square' } });
  let project = await writePxdAudioState(createPxdProject(), createAudioSong(), { link: originalLink, animation });
  project = await import('../../js/creation/pxd-animation.mjs').then(({ writePxdAnimation }) => writePxdAnimation(project, animation, { role: 'audio' }));
  project = await import('../../js/creation/pxd-animation.mjs').then(({ writePxdAnimation }) => writePxdAnimation(project, animation, { role: 'main' }));
  project = setPxdJson(project, 'audio/link.json', { ...getPxdJson(project, 'audio/link.json'), futureLink: { keep: 1 } });
  project = setPxdJson(project, 'animations/audio/state.json', { ...getPxdJson(project, 'animations/audio/state.json'), futureAnimation: { keep: 2 } });
  project = setPxdBytes(project, 'future/opaque.bin', new Uint8Array([3, 1, 4]));
  const state = createDrawMusicState(project, animation);
  const changedAnimation = setAnimationPalette(animation, [BLUE]);
  const projected = projectDrawMusic(state, changedAnimation);
  const saved = await writeDrawMusicProject(project, projected);
  assert.equal(readPxdAudioLink(saved).futureLink.keep, 1);
  assert.equal(getPxdJson(saved, 'animations/audio/state.json').futureAnimation.keep, 2);
  assert.deepEqual([...saved.entries.find(({ path }) => path === 'future/opaque.bin').bytes], [3, 1, 4]);
  const restoredSong = readPxdAudioState(saved);
  const restoredAnimation = await readPxdAnimation(saved, 'audio');
  assert.equal(restoredAnimation.frames[0].id, animation.frames[0].id);
  assert.ok(restoredSong.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes)).some(({ sourceCell }) => sourceCell?.kind === 'audio-animation'));
});

test('saving a shared Draw projection to main preserves the prior independent audio image', async () => {
  const { project: original, animation, song } = await compressedFixture(32, 60);
  const oldAudioImage = await readPxdImage(original, 'audio');
  const edited = paint(animation, animation.frames[0].id, animation.layers[0].id, [[1, 0, 0]]);
  const doc = composeAnimationFrame(edited, edited.frames[0].id);
  const canonicalImage = { width: doc.width, height: doc.height, rgba: new Uint8Array(documentRgba({ ...doc, pixels: Array.from(doc.pixels) })) };
  const projectWithDrawSave = await putPxdSharedImage(original, canonicalImage);
  const state = projectDrawMusic(createDrawMusicState(original, animation), edited);
  const saved = await writeDrawMusicProject(projectWithDrawSave, state, { imageRole: 'main' });
  assert.equal(readPxdAudioLink(saved).imageRole, 'main');
  assert.deepEqual(await readPxdImage(saved, 'audio'), oldAudioImage, 'the independent audio image remains byte-equivalent');
  const restoredCanonicalImage = await readPxdSharedImage(saved);
  assert.equal(restoredCanonicalImage.width, canonicalImage.width);
  assert.equal(restoredCanonicalImage.height, canonicalImage.height);
  assert.deepEqual(restoredCanonicalImage.rgba, canonicalImage.rgba, 'the selected Draw image remains canonical');
  assert.equal(readPxdAudioState(saved).songId, song.songId);

  const inconsistent = await putPxdSharedImage(original, emptyImage(32, 1));
  await assert.rejects(writeDrawMusicProject(inconsistent, state, { imageRole: 'main' }), /選択した画像の役割と音楽の投影が一致しません/);
});

async function compressedFixture(width = 32, marker = 60) {
  let song = createAudioSong({ songId: 'compressed', tempo: 137 });
  song = setAudioPixel(song, { trackId: 'track-noise', pitch: 55, startTick: 0, noteId: 'manual-note' });
  song.futureAudio = { retained: true };
  const image = emptyImage(width, 1); image.rgba.set([73, 100, 60, 255], (width - 8) * 4);
  const link = { rulesVersion: 'shared-canvas-v1', imageRole: 'audio', width, height: 1,
    rowPitchMap: [60], colorToSlot: { [GREEN_ID]: 'square' }, futureLink: { retained: true } };
  if (marker !== null) link.ticksPerCell = marker;
  const plan = projectLegacySharedAudioImage(song, image, link);
  const note = plan.song.tracks[0].clips[0].notes.find(note => note.sourceCell);
  note.velocity = 47; note.futureNote = { retained: true };
  const project = await writePxdAudioState(createPxdProject(), plan.song, { image, link });
  const animation = artwork({ width, height: 1, palette: [GREEN], pixels: [[width - 8, 0, 0]] });
  return { project, animation, song: plan.song, note };
}

for (const [width, marker] of [[32, 60], [31, null], [32, 120]]) {
  test(`legacy ratio timing width ${width}, marker ${marker} survives Draw edits, sound changes and PXD round trips`, async () => {
    const { project, animation, song, note } = await compressedFixture(width, marker);
    const initial = createDrawMusicState(project, animation);
    assert.deepEqual(readPxdAudioState(await writeDrawMusicProject(project, initial)), song, 'untouched save is exact');
    const edited = paint(animation, animation.frames[0].id, animation.layers[0].id, [[1, 0, 0]]);
    const state = projectDrawMusic(initial, edited);
    assert.equal(state.song.loopTicks, song.loopTicks, 'no 120-tick loop expansion');
    assert.equal(state.song.tempo, 137);
    assert.equal(state.link.rulesVersion, 'shared-canvas-v1');
    const notes = state.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes));
    assert.deepEqual(notes.find(item => item.noteId === note.noteId), note, 'existing ID, velocity, timing and future fields stay exact');
    assert.deepEqual(notes.find(item => item.noteId === 'manual-note'), song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes)).find(item => item.noteId === 'manual-note'));
    const added = notes.find(item => item.sourceCell?.x === 1);
    assert.equal(added.startTick, Math.floor(song.loopTicks / width));
    assert.equal(added.durationTicks, Math.floor(2 * song.loopTicks / width) - added.startTick);
    const voiced = changeDrawMusicColor(state, { colorId: GREEN_ID, slotId: 'square', instrument: 'triangle' });
    assert.equal(voiced.song.loopTicks, song.loopTicks);
    assert.equal(collectAudioEvents(voiced.song).find(event => event.pitch === 60).instrument, 'triangle');
    const layered = addAnimationLayer(edited, { name: 'Retained second layer' });
    const afterLayer = projectDrawMusic(voiced, layered);
    const saved = await writeDrawMusicProject(project, afterLayer);
    assert.deepEqual(readPxdAudioState(saved), afterLayer.song);
    assert.deepEqual(readPxdAudioLink(saved), afterLayer.link);
    assert.equal(readPxdAudioLink(saved).futureLink.retained, true);
    const restored = await readPxdAnimation(saved, 'audio-legacy-editor');
    assert.equal(restored.layers.length, 2);
    const reopened = createDrawMusicState(saved, restored);
    assert.equal(projectDrawMusic(reopened, restored), reopened);
    assert.deepEqual(readPxdAudioState(await writeDrawMusicProject(saved, reopened)), afterLayer.song);
    const image = await readPxdImage(saved, 'audio');
    assert.equal(image.rgba[1 * 4 + 3], 255);
    assert.equal(initial.song.tracks[0].clips[0].notes.find(item => item.noteId === note.noteId).velocity, 47, 'undo snapshot not mutated');
  });
}

for (const [width, marker] of [[32, 60], [31, null], [32, 120]]) {
  test(`compressed music adds, reorders and deletes frames with original timing width ${width}`, async () => {
    const { project, animation, song, note } = await compressedFixture(width, marker);
    const state = createDrawMusicState(project, animation);
    const two = addAnimationFrame(animation, { sourceFrameId: animation.frames[0].id });
    const next = projectDrawMusic(state, two);
    assert.equal(next.song.loopTicks, 3840);
    assert.deepEqual(next.link.timing, { rulesVersion: 'loop-ratio-v1', ticksPerFrame: 1920, frameOffsets: [0, 1920] });
    const notes = next.song.tracks.flatMap(t => t.clips.flatMap(c => c.notes));
    const kept = notes.find(n => n.noteId === note.noteId);
    assert.equal(kept.startTick, note.startTick); assert.equal(kept.durationTicks, note.durationTicks);
    assert.equal(kept.velocity, 47); assert.deepEqual(kept.futureNote, note.futureNote);
    assert.equal(notes.find(n => n.sourceCell?.frameIndex === 1).startTick, 1920 + note.startTick);
    assert.ok(notes.some(n => n.noteId === 'manual-note'));
    validateAudioAnimationBinding(next.song, two, next.link);
    for (let x = 0; x < width; x++) {
      const cell = audioAnimationCellTiming(next.link, x, 1);
      assert.equal(audioAnimationSequenceColumn(next.link, cell.startTick), width + x);
      assert.equal(audioAnimationSequenceColumn(next.link, cell.startTick + cell.durationTicks - 1), width + x);
    }
    const saved = await writeDrawMusicProject(project, next);
    const restored = await readPxdAnimation(saved, 'audio');
    const reopened = createDrawMusicState(saved, restored);
    assert.deepEqual(readPxdAudioState(await writeDrawMusicProject(saved, reopened)), next.song);
    const edited = paint(restored, restored.frames[1].id, restored.layers[0].id, [[1, 0, 0]]);
    const editedState = projectDrawMusic(reopened, edited);
    assert.equal(editedState.song.loopTicks, 3840);
    assert.equal(editedState.link.timing.ticksPerFrame, 1920);
    const reordered = projectDrawMusic(editedState, moveAnimationFrame(edited, edited.frames[0].id, 1));
    const moved = reordered.song.tracks.flatMap(t => t.clips.flatMap(c => c.notes)).find(n => n.noteId === note.noteId);
    assert.equal(moved.startTick, 1920 + note.startTick); assert.equal(moved.velocity, 47);
    const removed = projectDrawMusic(reordered, removeAnimationFrame(reordered.animation, reordered.animation.frames[0].id));
    assert.deepEqual(removed.link.timing.frameOffsets, [0]);
    assert.equal(state.song.loopTicks, 1920, 'original Undo snapshot stays exact');
    assert.deepEqual(state.song, song);
    assert.equal(projectDrawMusic(state, animation), state);
    const corrupt = { ...next.link, timing: { ...next.link.timing, frameOffsets: [0, 3840] } };
    assert.throws(() => validateAudioAnimationBinding(next.song, two, corrupt), /時間オフセット/);
  });
}

test('standard shared cells and subsequent animation edits retain untouched note IDs, velocity and timing', async () => {
  const { project, animation, song, note } = await compressedFixture(16, 120);
  const state = createDrawMusicState(project, animation);
  const first = paint(animation, animation.frames[0].id, animation.layers[0].id, [[1, 0, 0]]);
  const projected = projectDrawMusic(state, first);
  assert.equal(projected.link.rulesVersion, AUDIO_ANIMATION_LINK_VERSION);
  const musical = item => { const { sourceCell, ...rest } = item; return rest; };
  let kept = projected.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes)).find(item => item.noteId === note.noteId);
  assert.deepEqual(musical(kept), musical(note));
  assert.equal(projected.song.loopTicks, song.loopTicks);
  const second = paint(first, first.frames[0].id, first.layers[0].id, [[2, 0, 0]]);
  const editedAgain = projectDrawMusic(projected, second);
  kept = editedAgain.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes)).find(item => item.noteId === note.noteId);
  assert.deepEqual(musical(kept), musical(note));
  const saved = await writeDrawMusicProject(project, editedAgain);
  assert.deepEqual(readPxdAudioState(saved), editedAgain.song);
});

test('old pixel-cell UI notes retain velocity and ID on an unrelated Draw edit', async () => {
  const noteId = 'note-123e4567-e89b-42d3-a456-426614174000-3-5';
  const song = setAudioPixel(createAudioSong(), { trackId:'track-square', pitch:AUDIO_PIXEL_PITCHES[5], startTick:360, noteId, velocity:53 });
  const project = await writePxdAudioState(createPxdProject(), song, { image:audioSongImage(song), link:audioCellLink(song) });
  const animation = artwork({ width:16, height:AUDIO_PIXEL_PITCHES.length, palette:[GREEN], pixels:[[3,5,0]] });
  const edited = paint(animation, animation.frames[0].id, animation.layers[0].id, [[1,5,0]]);
  const after = projectDrawMusic(createDrawMusicState(project, animation), edited);
  const note = after.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes)).find(note => note.noteId===noteId);
  assert.ok(note); assert.equal(note.velocity,53); assert.equal(note.startTick,360); assert.equal(note.durationTicks,120); assert.equal(note.pitch,AUDIO_PIXEL_PITCHES[5]);
});
