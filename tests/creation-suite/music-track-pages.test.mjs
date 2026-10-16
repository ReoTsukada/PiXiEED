import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnimationFrame, createAnimation, ensureAnimationMusicLayer, getAnimationCelDocument,
  moveAnimationFrame, removeAnimationFrame, setAnimationFrameDuration, setAnimationPalette, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs';
import { AUDIO_PIXEL_TICKS, collectAudioEvents, createAudioSong, getAudioColorInstrument } from '../../js/creation/audio-core.mjs';
import { addDrawMusicPage, createDrawMusicTrackState, getDrawMusicPageDocument,
  changeDrawMusicColor, moveDrawMusicPage, projectDrawMusic, removeDrawMusicPage,
  selectDrawMusicPage, writeDrawMusicProject } from '../../js/creation/draw-music-core.mjs';
import { createPxdProject, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { projectLegacySharedAudioImage, readPxdAudioLink, readPxdAudioState, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { putPxdSharedImage, readPxdSharedImage } from '../../js/creation/pxd-project.mjs';

const GREEN = '#49643c';
const GREEN_ID = 'rgba-49643cff';

function paint(animation, frameId, layerId, entries) {
  const cel = getAnimationCelDocument(animation, frameId, layerId);
  cel.pixels = Uint8Array.from(cel.pixels, value => value + 1);
  for (const [x, y, color = 0] of entries) cel.pixels[y * animation.width + x] = color + 1;
  return writeAnimationCel(animation, frameId, layerId, cel);
}

function artWithMusicLayer() {
  return ensureAnimationMusicLayer(createAnimation({ width: 16, height: 1, palette: [GREEN] }));
}

test('one art frame and multiple independent music pages share only the role music cel', async () => {
  let art = artWithMusicLayer();
  const artLayer = art.layers.find(layer => layer.role !== 'music');
  art = paint(art, art.frames[0].id, artLayer.id, [[3, 0]]);
  const originalArtImage = { width: 16, height: 1, rgba: new Uint8Array(64) };
  originalArtImage.rgba.set([73, 100, 60, 255], 4 * 3);
  let project = await putPxdSharedImage(createPxdProject(), originalArtImage);
  const state = await createDrawMusicTrackState(project, art);
  assert.equal(state.musicTrackMode, true);
  assert.equal(state.musicAnimation.frames.length, 1);
  assert.equal(collectAudioEvents(state.song).length, 0, 'ordinary artwork pixels do not generate notes');

  const expandedArt = addAnimationFrame(art, { sourceFrameId: art.frames[0].id, durationMs: 37 });
  const artUpdated = projectDrawMusic(state, expandedArt);
  assert.equal(artUpdated.musicAnimation.frames.length, 1);
  assert.deepEqual(artUpdated.song, state.song, 'art frame insertion leaves the music timeline unchanged');
  assert.deepEqual(artUpdated.link, state.link);

  const withSecondPage = addDrawMusicPage(artUpdated, { durationMs: 83, copy: false });
  assert.equal(withSecondPage.musicAnimation.frames.length, 2);
  assert.equal(collectAudioEvents(withSecondPage.song).length, 0);
  const secondId = withSecondPage.musicAnimation.frames[1].id;
  const selected = selectDrawMusicPage(withSecondPage, secondId);
  const musicDoc = getDrawMusicPageDocument(selected);
  assert.equal(musicDoc.pixels[0], -1);
  const paintedMusicPage = paint(selected.musicAnimation, secondId, selected.musicAnimation.layers[0].id, [[0, 0]]);
  const imageForArtRole = getAnimationCelDocument(expandedArt, expandedArt.frames[0].id, selected.musicLayerId);
  imageForArtRole.pixels = Uint8Array.from(getAnimationCelDocument(paintedMusicPage, secondId, paintedMusicPage.layers[0].id).pixels, value => value + 1);
  const artWithMirroredMusicPage = writeAnimationCel(expandedArt, expandedArt.frames[0].id, selected.musicLayerId, imageForArtRole);
  const projected = projectDrawMusic(selected, artWithMirroredMusicPage);
  assert.equal(projected.musicAnimation.frames.length, 2);
  assert.deepEqual(collectAudioEvents(projected.song).map(({ startTick }) => startTick), [1920]);
  assert.deepEqual(state.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes)), [], 'page edit does not mutate the earlier history snapshot');
  const movedPages = moveDrawMusicPage(projected, secondId, 0);
  assert.deepEqual(collectAudioEvents(movedPages.song).map(({ startTick }) => startTick), [0]);
  const deletedPage = removeDrawMusicPage(movedPages, artUpdated.musicAnimation.frames[0].id);
  assert.equal(deletedPage.musicAnimation.frames.length, 1);
  assert.deepEqual(collectAudioEvents(deletedPage.song).map(({ startTick }) => startTick), [0]);

  const fpsEdited = setAnimationFrameDuration(artWithMirroredMusicPage, artWithMirroredMusicPage.frames[0].id, 21);
  const afterFps = projectDrawMusic(projected, fpsEdited);
  assert.deepEqual(afterFps.song, projected.song);
  assert.deepEqual(afterFps.link, projected.link);
  assert.equal(afterFps.animation, fpsEdited);

  const reorderedArt = moveAnimationFrame(fpsEdited, fpsEdited.frames[1].id, 0);
  const afterReorder = projectDrawMusic(afterFps, reorderedArt);
  assert.deepEqual(afterReorder.song, afterFps.song);
  const removedArt = removeAnimationFrame(reorderedArt, reorderedArt.frames[1].id);
  const afterDelete = projectDrawMusic(afterReorder, removedArt);
  assert.deepEqual(afterDelete.song, afterReorder.song, 'art frame deletion does not delete a music page');
  assert.deepEqual(afterDelete.link, afterReorder.link);
  const saved = await writeDrawMusicProject(project, afterDelete);
  const savedMain = await readPxdSharedImage(saved);
  assert.deepEqual(savedMain.rgba, originalArtImage.rgba, 'music saves do not replace the canonical main artwork');
  assert.equal(readPxdAudioLink(saved).musicTrack.pageId, secondId);
  assert.equal((await readPxdAnimation(saved, 'audio')).frames.length, 2);
  assert.deepEqual(readPxdAudioState(saved), afterReorder.song);
});

test('legacy compressed song and linked image open unchanged into one music page and save as a page link', async () => {
  const width = 32;
  const song = createAudioSong({ songId: 'old-page-song', tempo: 137 });
  const image = { width, height: 1, rgba: new Uint8Array(width * 4) };
  image.rgba.set([73, 100, 60, 255], (width - 8) * 4);
  const oldLink = { rulesVersion: 'shared-canvas-v1', imageRole: 'audio', width, height: 1,
    ticksPerCell: 60, rowPitchMap: [60], colorToSlot: { [GREEN_ID]: 'square' }, futureLinkField: { retained: true } };
  const legacy = projectLegacySharedAudioImage(song, image, oldLink);
  const originalSong = { ...legacy.song, futureSongField: { retained: true } };
  let project = await writePxdAudioState(createPxdProject(), originalSong, { image: legacy.image, link: legacy.link });
  const unrelatedAudioAnimation = createAnimation({ width, height: 1, palette: ['#0000ff'] });
  project = await writePxdAnimation(project, unrelatedAudioAnimation, { role: 'audio' });
  project = setPxdJson(project, 'future/audio-note.json', { keep: true });
  const art = ensureAnimationMusicLayer(createAnimation({ width, height: 1, palette: [GREEN] }));
  const state = await createDrawMusicTrackState(project, art);
  assert.equal(state.projected, false, 'opening a legacy track does not reproject it');
  assert.deepEqual(state.song, originalSong);
  assert.deepEqual(collectAudioEvents(state.song), collectAudioEvents(originalSong));
  assert.equal(state.musicAnimation.frames.length, 1);

  const originalEvent = collectAudioEvents(state.song)[0];
  const voiced = changeDrawMusicColor(state, { colorId: GREEN_ID, slotId: 'square', instrument: 'triangle' });
  const changedEvent = collectAudioEvents(voiced.song)[0];
  assert.equal(changedEvent.startTick, originalEvent.startTick);
  assert.equal(changedEvent.durationTicks, originalEvent.durationTicks);
  assert.equal(changedEvent.instrument, 'triangle', 'voice edits retain compressed tick placement');

  const saved = await writeDrawMusicProject(project, state);
  assert.deepEqual(readPxdAudioState(saved), originalSong);
  assert.equal(readPxdAudioLink(saved).musicTrack.pageId, state.musicPageId);
  assert.deepEqual(readPxdAudioLink(saved).futureLinkField, { retained: true });
  assert.deepEqual(getPxdJson(saved, 'future/audio-note.json'), { keep: true });
  assert.equal((await readPxdAnimation(saved, 'audio')).frames[0].id, state.musicPageId);
  assert.deepEqual((await readPxdAnimation(saved, 'audio-source')).palette, unrelatedAudioAnimation.palette,
    'a pre-existing independent audio animation is archived rather than overwritten');
  assert.deepEqual((await readPxdAnimation(project, 'audio')).palette, unrelatedAudioAnimation.palette,
    'the source archive remains immutable');
});

test('dimension or exact palette mismatch fails closed before changing the source project', async () => {
  const art = artWithMusicLayer();
  const image = { width: 17, height: 1, rgba: new Uint8Array(68) };
  const link = { rulesVersion: 'shared-canvas-v1', imageRole: 'audio', width: 17, height: 1,
    rowPitchMap: [60], colorToSlot: { [GREEN_ID]: 'square' } };
  const project = await writePxdAudioState(createPxdProject(), createAudioSong(), { image, link });
  await assert.rejects(createDrawMusicTrackState(project, art), error => error.code === 'DRAW_MUSIC_PAGE_CANVAS_MISMATCH');
  assert.equal(readPxdAudioState(project).songId, 'song-local-1');

  const wrongPaletteArt = ensureAnimationMusicLayer(createAnimation({ width: 16, height: 1, palette: ['#0000ff'] }));
  const matchingSizeImage = { width: 16, height: 1, rgba: new Uint8Array(64) };
  matchingSizeImage.rgba.set([73, 100, 60, 255]);
  const matchingSizeLink = { ...link, width: 16 };
  const wrongPalettePlan = projectLegacySharedAudioImage(createAudioSong(), matchingSizeImage, matchingSizeLink);
  const wrongPaletteProject = await writePxdAudioState(createPxdProject(), wrongPalettePlan.song, { image: wrongPalettePlan.image, link: wrongPalettePlan.link });
  await assert.rejects(createDrawMusicTrackState(wrongPaletteProject, wrongPaletteArt), error => error.code === 'DRAW_MUSIC_PAGE_COLOR_MISMATCH');
});

test('shared palette reorder, new colors and center resize synchronize every music page without changing unrelated settings', async () => {
  let art = artWithMusicLayer();
  const state0 = await createDrawMusicTrackState(null, art);
  const page0 = state0.musicPageId;
  let state = addDrawMusicPage(state0, { durationMs: 83, copy: false });
  const page1 = state.musicAnimation.frames[1].id;
  state = selectDrawMusicPage(state, page1);
  let musicAnimation = paint(state.musicAnimation, page1, state.musicAnimation.layers[0].id, [[2, 0]]);
  const mirrored = getAnimationCelDocument(state.animation, state.animation.frames[0].id, state.musicLayerId);
  mirrored.pixels = Uint8Array.from(getAnimationCelDocument(musicAnimation, page1, musicAnimation.layers[0].id).pixels, value => value + 1);
  art = writeAnimationCel(state.animation, state.animation.frames[0].id, state.musicLayerId, mirrored);
  state = projectDrawMusic(state, art);
  const beforeSong = structuredClone(state.song);
  const beforeLink = structuredClone(state.link);

  const appendedPlan = planSharedProjectSettings(state.animation, { palette: [GREEN, '#0000ff'] });
  state = projectDrawMusic(state, appendedPlan.animation);
  assert.deepEqual(state.song, beforeSong, 'adding an unused color does not invent notes');
  assert.equal(state.link.colorToSlot['rgba-0000ffff'], null, 'a new camera color starts unassigned');
  assert.deepEqual(state.link.colorToSlot[GREEN_ID], beforeLink.colorToSlot[GREEN_ID]);

  const reorderedPlan = planSharedProjectSettings(state.animation, { palette: ['#0000ff', GREEN] });
  state = projectDrawMusic(state, reorderedPlan.animation);
  assert.deepEqual(state.song, beforeSong, 'palette order changes do not revoice or retime notes');
  assert.deepEqual(state.link.colorToSlot[GREEN_ID], beforeLink.colorToSlot[GREEN_ID]);
  assert.equal(getDrawMusicPageDocument(state, page1).pixels[2], 1, 'the same RGBA remains at the music cell after reorder');
  assert.equal(getDrawMusicPageDocument(state, page0).pixels[2], -1, 'inactive pages are remapped too and remain independent');

  const resizedPlan = planSharedProjectSettings(state.animation, { width: 18, height: 3 });
  const resized = projectDrawMusic(state, resizedPlan.animation);
  assert.equal(resized.musicAnimation.width, 18);
  assert.equal(resized.musicAnimation.height, 3);
  assert.deepEqual(resized.musicAnimation.frames.map(({ id, durationMs }) => [id, durationMs]),
    state.musicAnimation.frames.map(({ id, durationMs }) => [id, durationMs]), 'resize preserves music-page identity and timing');
  assert.equal(getDrawMusicPageDocument(resized, page1).pixels[1 * 18 + 3], 1, 'all pages use the same center offset');
  assert.deepEqual(getDrawMusicPageDocument(resized, page0).pixels, new Array(18 * 3).fill(-1));
});

test('shared unique recolors inherit the assigned voice, undo reprojects it, and ambiguous or new colors stay silent', async () => {
  const editedColor = '#6b7d56';
  const editedId = 'rgba-6b7d56ff';
  const blueId = 'rgba-0000ffff';
  let art = artWithMusicLayer();
  let state = await createDrawMusicTrackState(null, art);
  const roleLayer = state.animation.layers.find(layer => layer.role === 'music');
  art = paint(state.animation, state.animation.frames[0].id, roleLayer.id, [[0, 0]]);
  state = projectDrawMusic(state, art);
  state = changeDrawMusicColor(state, { colorId: GREEN_ID, slotId: 'square', instrument: 'triangle' });
  assert.equal(collectAudioEvents(state.song)[0]?.instrument, 'triangle');

  const previousSnapshot = { song: structuredClone(state.song), link: structuredClone(state.link), musicAnimation: state.musicAnimation };
  const recoloredPlan = planSharedProjectSettings(state.animation, { palette: [editedColor] });
  const recolored = projectDrawMusic(state, recoloredPlan.animation);
  assert.deepEqual(state.song, previousSnapshot.song, 'projection does not mutate the previous song snapshot');
  assert.deepEqual(state.link, previousSnapshot.link, 'projection does not mutate the previous mapping snapshot');
  assert.equal(state.musicAnimation, previousSnapshot.musicAnimation, 'projection does not mutate the previous music timeline');
  assert.equal(recolored.link.colorToSlot[editedId], 'square', 'a unique same-index recolor carries its mapped slot');
  assert.equal(getAudioColorInstrument(recolored.song, editedId, recolored.link.colorToSlot[editedId]), 'triangle',
    'the color-specific instrument override follows a unique recolor');
  assert.equal(collectAudioEvents(recolored.song)[0]?.instrument, 'triangle');

  const undone = projectDrawMusic(recolored, state.animation);
  assert.equal(undone.link.colorToSlot[GREEN_ID], 'square');
  assert.equal(getAudioColorInstrument(undone.song, GREEN_ID, undone.link.colorToSlot[GREEN_ID]), 'triangle',
    'undoing the palette edit restores the prior color mapping and voice');
  assert.equal(collectAudioEvents(undone.song)[0]?.instrument, 'triangle');

  const expandedPlan = planSharedProjectSettings(recolored.animation, { palette: [editedColor, '#0000ff'] });
  const expanded = projectDrawMusic(recolored, expandedPlan.animation);
  assert.equal(expanded.link.colorToSlot[blueId], null, 'a newly added color stays silent until explicitly assigned');
  assert.equal(collectAudioEvents(expanded.song)[0]?.instrument, 'triangle');

  let duplicate = await createDrawMusicTrackState(null,
    ensureAnimationMusicLayer(createAnimation({ width: 16, height: 1, palette: [GREEN, GREEN] })));
  const duplicateRole = duplicate.animation.layers.find(layer => layer.role === 'music');
  duplicate = projectDrawMusic(duplicate, paint(duplicate.animation, duplicate.animation.frames[0].id, duplicateRole.id, [[0, 0]]));
  duplicate = changeDrawMusicColor(duplicate, { colorId: GREEN_ID, slotId: 'square', instrument: 'triangle' });
  const ambiguousPlan = planSharedProjectSettings(duplicate.animation, { palette: [editedColor, GREEN] });
  const ambiguous = projectDrawMusic(duplicate, ambiguousPlan.animation);
  assert.equal(ambiguous.link.colorToSlot[editedId], null, 'a duplicate source color is ambiguous and does not transfer its slot');
  assert.equal(ambiguous.link.colorToSlot[GREEN_ID], 'square');
  assert.equal(collectAudioEvents(ambiguous.song)[0]?.instrument, 'triangle');
  const transparentAnimation = setAnimationPalette(ambiguous.animation, ['#6b7d5600', GREEN]);
  const transparent = projectDrawMusic(ambiguous, transparentAnimation);
  assert.equal(transparent.link.colorToSlot['rgba-6b7d5600'], null, 'transparent colors do not inherit an audible slot');
  const transparentRole = transparent.animation.layers.find(layer => layer.role === 'music');
  const artWithTransparentMusicPixel = paint(transparent.animation, transparent.animation.frames[0].id, transparentRole.id, [[1, 0, 0]]);
  const transparentPixel = projectDrawMusic(transparent, artWithTransparentMusicPixel);
  assert.equal(collectAudioEvents(transparentPixel.song).some(event => event.startTick === AUDIO_PIXEL_TICKS), false,
    'a fully transparent music pixel does not produce a note');
});

test('a direct unique palette edit keeps the same color index and voice on inactive music pages', async () => {
  const art = ensureAnimationMusicLayer(createAnimation({ width: 16, height: 1, palette: [GREEN, '#4a653d'] }));
  let state = await createDrawMusicTrackState(null, art);
  state = projectDrawMusic(state, paint(state.animation, state.animation.frames[0].id, state.musicLayerId, [[0, 0]]));
  state = changeDrawMusicColor(state, { colorId: GREEN_ID, slotId: 'square', instrument: 'electric-piano' });
  state = addDrawMusicPage(state);
  assert.equal(collectAudioEvents(state.song).length, 2);
  const previous = structuredClone(state);
  const recolored = projectDrawMusic(state, setAnimationPalette(state.animation, ['#ff0000', '#4a653d']));
  assert.deepEqual(state, previous, 'recolor preserves the previous history snapshot');
  for (const page of recolored.musicAnimation.frames) {
    assert.equal(getDrawMusicPageDocument(recolored, page.id).pixels[0], 0, 'every page retains its edited palette entry');
  }
  assert.deepEqual(collectAudioEvents(recolored.song).map(event => event.instrument), ['electric-piano', 'electric-piano']);
  assert.deepEqual(collectAudioEvents(recolored.song).map(event => [event.startTick, event.pitch]),
    collectAudioEvents(state.song).map(event => [event.startTick, event.pitch]));
});

test('a second save updates the managed music pages while preserving the one-time source archive', async () => {
  const width = 32;
  const image = { width, height: 1, rgba: new Uint8Array(width * 4) };
  image.rgba.set([73, 100, 60, 255], 4 * 6);
  const legacy = projectLegacySharedAudioImage(createAudioSong({ songId: 'repeat-save-song' }), image,
    { rulesVersion: 'shared-canvas-v1', imageRole: 'audio', width, height: 1, ticksPerCell: 60, rowPitchMap: [60], colorToSlot: { [GREEN_ID]: 'square' } });
  let project = await writePxdAudioState(createPxdProject(), legacy.song, { image: legacy.image, link: legacy.link });
  project = await writePxdAnimation(project, createAnimation({ width, height: 1, palette: ['#0000ff'] }), { role: 'audio' });
  const art = ensureAnimationMusicLayer(createAnimation({ width, height: 1, palette: [GREEN] }));
  const originalMusic = await createDrawMusicTrackState(project, art);
  const firstSave = await writeDrawMusicProject(project, originalMusic);
  const pageId = originalMusic.musicPageId;
  const page = paint(originalMusic.musicAnimation, pageId, originalMusic.musicAnimation.layers[0].id, [[1, 0]]);
  const second = projectDrawMusic(originalMusic, (() => {
    const doc = getAnimationCelDocument(art, art.frames[0].id, originalMusic.musicLayerId);
    doc.pixels = Uint8Array.from(getAnimationCelDocument(page, pageId, page.layers[0].id).pixels, value => value + 1);
    return writeAnimationCel(art, art.frames[0].id, originalMusic.musicLayerId, doc);
  })());
  const secondSave = await writeDrawMusicProject(firstSave, second);
  const savedPages = await readPxdAnimation(secondSave, 'audio');
  assert.deepEqual(savedPages.frames, second.musicAnimation.frames);
  assert.deepEqual(getAnimationCelDocument(savedPages, pageId, savedPages.layers[0].id).pixels,
    getAnimationCelDocument(second.musicAnimation, pageId, second.musicAnimation.layers[0].id).pixels);
  assert.deepEqual(await readPxdAnimation(secondSave, 'audio-source'), await readPxdAnimation(firstSave, 'audio-source'));
  const reopened = await createDrawMusicTrackState(secondSave, second.animation);
  assert.deepEqual(reopened.musicAnimation.frames, second.musicAnimation.frames);
  assert.deepEqual(getAnimationCelDocument(reopened.musicAnimation, pageId, reopened.musicAnimation.layers[0].id).pixels,
    getAnimationCelDocument(second.musicAnimation, pageId, second.musicAnimation.layers[0].id).pixels);
  assert.deepEqual(reopened.song, second.song);
});
