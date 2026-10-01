import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, getPxdJson, setPxdBytes, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { imageToDrawDocument, putPxdImage, putPxdSharedImage, readPxdImage, readPxdSharedImage } from '../../js/creation/pxd-project.mjs';
import { createAudioSong, setAudioPixel } from '../../js/creation/audio-core.mjs';
import {
  assignPxdAudioColor, audioCellLink, audioSongImage, pxdImageToAudioDocument, preparePxdAudioImageImport, prepareSharedAudioImageImport, readPxdAudioState,
  readPxdDrawDocument, resizePxdAudioWorkingImage, setSharedAudioCell, synchronizeLinkedAudioImage, validatePxdAudioBinding, writePxdAudioState, writePxdDrawDocument
} from '../../js/creation/pxd-draw-audio.mjs';

function fixtureDocument() {
  return { schemaVersion: 1, width: 16, height: 16, palette: ['#00000000', '#e75445', '#4c82c3'], pixels: Array(256).fill(0) };
}

function imageFromDocument(document) {
  const rgba = new Uint8Array(document.width * document.height * 4);
  for (let index = 0; index < document.pixels.length; index += 1) {
    const value = document.pixels[index];
    if (value < 0) continue;
    const color = document.palette[value];
    const bytes = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
    bytes.push(color.length === 9 ? parseInt(color.slice(7, 9), 16) : 255); rgba.set(bytes, index * 4);
  }
  return { width: document.width, height: document.height, rgba };
}

test('Draw PXD writes exact pixels while retaining unrelated Audio, unknown JSON fields, and opaque entries', async () => {
  let project = createPxdProject({ projectId: 'pxd-project-draw', revisionId: 'pxd-revision-draw' });
  const original = fixtureDocument(); original.palette = ['#01020304', '#e75445']; original.pixels[0] = 0; original.pixels[1] = 1;
  const audio = { schemaVersion: 1, songId: 'song-one', tempo: 120, mystery: { future: 1 } };
  project = setPxdJson(project, 'audio/state.json', audio);
  project = setPxdBytes(project, 'future/opaque.bin', new Uint8Array([9, 8, 7]));
  project = await writePxdDrawDocument(project, original);
  const reopened = await readPxdDrawDocument(project);
  assert.deepEqual(reopened, { ...original, palette: ['#01020304', '#e75445ff'] });
  assert.deepEqual(getPxdJson(project, 'audio/state.json'), audio);
  assert.deepEqual([...project.entries.find((entry) => entry.path === 'future/opaque.bin').bytes], [9, 8, 7]);
  assert.deepEqual((await readPxdImage(project)).rgba, imageFromDocument(original).rgba);
});

test('Draw projection preserves supported rectangular RGBA and rejects over-128-color images without mutation', async () => {
  let project = createPxdProject({ projectId: 'pxd-project-reject', revisionId: 'pxd-revision-reject' });
  const rectangular = { width: 32, height: 16, rgba: new Uint8Array(32 * 16 * 4) }; rectangular.rgba.set([2, 7, 9, 0], 0);
  project = await putPxdImage(project, rectangular);
  const before = project.entries.map((entry) => [entry.path, [...entry.bytes]]);
  const document = await readPxdDrawDocument(project);
  assert.equal(document.width, 32); assert.equal(document.height, 16);
  assert.deepEqual((await readPxdImage(project)).rgba, rectangular.rgba);
  assert.deepEqual(project.entries.map((entry) => [entry.path, [...entry.bytes]]), before);
  const rectangularAudio = { width: 24, height: 18, rgba: new Uint8Array(24 * 18 * 4) };
  const exactRectangle = imageToDrawDocument(rectangularAudio);
  assert.equal(exactRectangle.width, 24); assert.equal(exactRectangle.height, 18);
  const many = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  for (let index = 0; index < 129; index += 1) many.rgba.set([index, (index * 17) & 255, (index * 29) & 255, 255], index * 4);
  assert.throws(() => imageToDrawDocument(many), /128色/);
  assert.deepEqual(project.entries.map((entry) => [entry.path, [...entry.bytes]]), before);
});

test('Audio maps only the four most common exact source colors; remaining colors stay visible and silent', () => {
  const original = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  const colors = [[3, 4, 5, 255], [8, 9, 10, 255], [11, 12, 13, 255], [14, 15, 16, 255], [20, 21, 22, 255], [8, 9, 10, 0]];
  for (let index = 0; index < original.width * original.height; index += 1) original.rgba.set(colors[index < 5 ? index : 0], index * 4);
  const before = new Uint8Array(original.rgba);
  const song = createAudioSong({ songId: 'song-image' });
  const result = preparePxdAudioImageImport(song, original);
  assert.equal(result.song.songId, song.songId);
  assert.equal(result.image.width, 16); assert.equal(result.image.height, 16);
  assert.equal(result.link.rulesVersion, 'pixel-cell-v1');
  assert.deepEqual(result.image.rgba.slice(0, 4), Uint8Array.from(colors[0]));
  assert.equal(Object.values(result.link.colorToSlot).filter(Boolean).length, 4);
  assert.equal(result.link.colorToSlot['rgba-141516ff'], null);
  assert.equal(result.link.colorToSlot['rgba-08090a00'], undefined);
  const fifth = assignPxdAudioColor(result.song, result.image, result.link, 'rgba-141516ff', 'noise');
  assert.equal(fifth.link.colorToSlot['rgba-141516ff'], 'noise');
  assert.ok(fifth.song.tracks.find((track) => track.instrument === 'noise').clips[0].notes.some((note) => note.colorId === 'rgba-141516ff'));
  assert.deepEqual(original.rgba, before);
});

test('photo colors appear by area in music, while existing instrument choices remain unchanged', () => {
  const image = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  image.rgba.set([230, 40, 60, 255], 0);
  for (let pixel = 1; pixel < 256; pixel += 1) image.rgba.set([20, 100, 180, 255], pixel * 4);
  const song = createAudioSong({ songId: 'photo-colors' });
  const [firstSlot, secondSlot] = song.pixelPalette.map(({ slotId }) => slotId);
  const fresh = prepareSharedAudioImageImport(song, image);
  assert.deepEqual(Object.keys(fresh.link.colorToSlot), ['rgba-1464b4ff', 'rgba-e6283cff']);
  assert.equal(fresh.link.colorToSlot['rgba-1464b4ff'], firstSlot);
  assert.equal(fresh.link.colorToSlot['rgba-e6283cff'], secondSlot);
  const painted = setSharedAudioCell(fresh.song, image, fresh.link, { x: 0, y: 0, slotId: firstSlot });
  assert.deepEqual([...painted.image.rgba.slice(0, 4)], [20, 100, 180, 255]);
  const retained = prepareSharedAudioImageImport(song, image, { colorToSlot: { 'rgba-e6283cff': firstSlot, 'rgba-1464b4ff': null } });
  assert.deepEqual(Object.keys(retained.link.colorToSlot), ['rgba-1464b4ff', 'rgba-e6283cff']);
  assert.equal(retained.link.colorToSlot['rgba-1464b4ff'], null);
  assert.equal(retained.link.colorToSlot['rgba-e6283cff'], firstSlot);
});

test('Audio keeps original palette colors through nearest-fit working-image conversion and mapping records geometry', () => {
  const original = { width: 32, height: 32, rgba: new Uint8Array(32 * 32 * 4) };
  for (let index = 0; index < 32 * 32; index += 1) original.rgba.set(index % 2 ? [1, 2, 3, 255] : [9, 8, 7, 255], index * 4);
  const result = preparePxdAudioImageImport(createAudioSong({ songId: 'song-fit' }), original);
  assert.deepEqual(result.link.sourceMapping, { sourceWidth: 32, sourceHeight: 32, copiedWidth: 16, copiedHeight: 16, x: 0, y: 0, rule: 'nearest-fit-v1' });
  assert.deepEqual([...result.image.rgba.subarray(0, 4)], [...original.rgba.subarray(4, 8)]);
  assert.equal(result.image.width, 16); assert.equal(result.image.height, 16);
});

test('PXD stores the unchanged main image alongside the exact Audio working image and validates its color map', async () => {
  const source = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  for (let index = 0; index < 256; index += 1) source.rgba.set(index % 3 ? [25, 80, 140, 255] : [220, 42, 61, 255], index * 4);
  const plan = preparePxdAudioImageImport(createAudioSong({ songId: 'song-pxd-roundtrip' }), source);
  let project = await putPxdImage(createPxdProject({ projectId: 'project-pxd-roundtrip', revisionId: 'revision-pxd-roundtrip' }), source, 'main');
  project = await writePxdAudioState(project, plan.song, { image: plan.image, link: plan.link });
  assert.deepEqual((await readPxdImage(project, 'main')).rgba, source.rgba);
  assert.deepEqual((await readPxdImage(project, 'audio')).rgba, plan.image.rgba);
  validatePxdAudioBinding(readPxdAudioState(project), await readPxdImage(project, 'audio'), getPxdJson(project, 'audio/link.json'));
});

test('Audio canvas resize keeps exact pixels, mapping choices, silent colors, and left anchored notes', () => {
  const image = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  image.rgba.set([1, 2, 3, 255], 0); image.rgba.set([4, 5, 6, 255], 4);
  const link = { rulesVersion: 'pixel-cell-v1', imageRole: 'audio', width: 16, height: 16, colorToSlot: { 'rgba-010203ff': 'triangle', 'rgba-040506ff': null }, sourceMapping: { rule: 'nearest-fit-v1', sourceWidth: 32, sourceHeight: 32, copiedWidth: 16, copiedHeight: 16, x: 0, y: 0 } };
  const resized = resizePxdAudioWorkingImage(image, link, 32);
  assert.equal(resized.image.width, 32); assert.deepEqual([...resized.image.rgba.slice(0, 8)], [...image.rgba.slice(0, 8)]);
  assert.deepEqual([...resized.image.rgba.slice(16 * 4, 16 * 4 + 4)], [0, 0, 0, 0]);
  assert.deepEqual(resized.link.colorToSlot, link.colorToSlot);
  assert.deepEqual(resized.link.sourceMapping, { ...link.sourceMapping, canvasWidth: 32, canvasHeight: 16, resizeRule: 'left-anchor-v1' });
});

test('linked Draw edits update only the changed cell and retain unrelated note and unknown fields', async () => {
  const initial = createAudioSong({ songId: 'song-link' });
  let song = setAudioPixel(initial, { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'changed-cell' });
  song = setAudioPixel(song, { trackId: 'track-triangle', pitch: 81, startTick: 360, noteId: 'untouched-cell' });
  const targetClip = song.tracks.find((track) => track.trackId === 'track-triangle').clips[0];
  targetClip.notes.find((note) => note.noteId === 'untouched-cell').futureNoteField = { keep: true };
  song.futureAudioField = ['preserve'];
  let project = await writePxdAudioState(createPxdProject({ projectId: 'pxd-project-link', revisionId: 'pxd-revision-link' }), song);
  const image = await readPxdImage(project, 'audio');
  const document = imageToDrawDocument(image);
  const triangleColor = song.pixelPalette.find((slot) => slot.slotId === 'triangle').color;
  const triangleIndex = document.palette.indexOf(`${triangleColor}ff`);
  assert.ok(triangleIndex >= 0);
  document.pixels[0] = triangleIndex;
  project = await synchronizeLinkedAudioImage(project, document, 'audio');
  project = await writePxdDrawDocument(project, document, 'audio');
  const changed = readPxdAudioState(project);
  const square = changed.tracks.find((track) => track.trackId === 'track-square');
  const triangle = changed.tracks.find((track) => track.trackId === 'track-triangle');
  assert.equal(square.clips[0].notes.some((note) => note.pitch === 84 && note.startTick === 0), false);
  assert.equal(triangle.clips[0].notes.some((note) => note.pitch === 84 && note.startTick === 0 && note.durationTicks === 120), true);
  assert.deepEqual(triangle.clips[0].notes.find((note) => note.noteId === 'untouched-cell'), { noteId: 'untouched-cell', pitch: 81, startTick: 360, durationTicks: 120, velocity: 96, futureNoteField: { keep: true }, colorId: 'rgba-4c82c3ff' });
  assert.deepEqual(changed.futureAudioField, ['preserve']);
});

test('a new color painted in Draw stays exact but silent until the author assigns it', async () => {
  let song = createAudioSong({ songId: 'song-new-color' });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'old-cell' });
  let project = await writePxdAudioState(createPxdProject({ projectId: 'project-new-color', revisionId: 'revision-new-color' }), song);
  const document = imageToDrawDocument(await readPxdImage(project, 'audio'));
  document.palette.push('#112233'); document.pixels[5] = document.palette.length - 1;
  project = await synchronizeLinkedAudioImage(project, document, 'audio');
  const link = getPxdJson(project, 'audio/link.json'); const image = await readPxdImage(project, 'audio');
  assert.equal(link.colorToSlot['rgba-112233ff'], null);
  assert.deepEqual([...image.rgba.slice(20, 24)], [17, 34, 51, 255]);
  assert.equal(readPxdAudioState(project).tracks.some((track) => track.clips.some((clip) => clip.notes.some((note) => note.startTick === 600))), false);
  const mapped = assignPxdAudioColor(readPxdAudioState(project), image, link, 'rgba-112233ff', 'triangle');
  assert.equal(mapped.link.colorToSlot['rgba-112233ff'], 'triangle');
  assert.ok(mapped.song.tracks.find((track) => track.instrument === 'triangle').clips[0].notes.some((note) => note.colorId === 'rgba-112233ff'));
});

test('linked editing rejects sustained legacy notes without normalizing or changing any PXD bytes', async () => {
  let song = createAudioSong({ songId: 'song-legacy' });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'legacy-note' });
  song.tracks[0].clips[0].notes[0].durationTicks = 240;
  let project = createPxdProject({ projectId: 'pxd-project-legacy', revisionId: 'pxd-revision-legacy' });
  project = setPxdJson(project, 'audio/state.json', song);
  project = await putPxdImage(project, audioSongImage(song), 'audio');
  project = setPxdJson(project, 'audio/link.json', audioCellLink(song));
  const image = await readPxdImage(project, 'audio'); const document = imageToDrawDocument(image); document.pixels[1] = document.pixels[0];
  const before = project.entries.map((entry) => [entry.path, [...entry.bytes]]);
  await assert.rejects(synchronizeLinkedAudioImage(project, document, 'audio'), /対応しない音符/);
  assert.deepEqual(project.entries.map((entry) => [entry.path, [...entry.bytes]]), before);
  assert.deepEqual(readPxdAudioState(project).tracks[0].clips[0].notes[0].durationTicks, 240);
});

test('shared Audio stores an exact independent audio image and keeps distinct source cells when rows share pitch', async () => {
  const image = { width: 20, height: 18, rgba: new Uint8Array(20 * 18 * 4) };
  image.rgba.set([231, 84, 69, 255], (4 * image.width + 2) * 4);
  image.rgba.set([231, 84, 69, 255], (12 * image.width + 2) * 4);
  const rowPitchMap = Array(image.height).fill(60);
  const colorToSlot = { 'rgba-e75445ff': 'triangle' };
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'song-shared-main' }), image, { rowPitchMap, colorToSlot });
  const sounding = plan.song.tracks.find((track) => track.instrument === 'triangle').clips[0].notes;
  assert.deepEqual(sounding.map((note) => note.sourceCell), [{ x: 2, y: 4 }, { x: 2, y: 12 }]);
  assert.equal(sounding[0].pitch, sounding[1].pitch);
  assert.equal(sounding[0].startTick, sounding[1].startTick);
  assert.equal(plan.link.imageRole, 'audio');
  assert.equal(plan.link.width, image.width); assert.equal(plan.link.height, image.height);
  assert.deepEqual(plan.link.rowPitchMap, rowPitchMap);

  let project = await putPxdSharedImage(createPxdProject({ projectId: 'project-shared-audio', revisionId: 'revision-shared-audio' }), image);
  project = await writePxdAudioState(project, plan.song, { image, link: plan.link });
  const savedImage = await readPxdSharedImage(project);
  assert.equal(savedImage.width, 20); assert.equal(savedImage.height, 18);
  assert.deepEqual(savedImage.rgba, image.rgba);
  assert.deepEqual((await readPxdImage(project, 'audio')).rgba, image.rgba);
  assert.deepEqual(getPxdJson(project, 'audio/link.json').rowPitchMap, rowPitchMap);
  assert.deepEqual(readPxdAudioState(project).tracks.find((track) => track.instrument === 'triangle').clips[0].notes.map((note) => note.sourceCell), [{ x: 2, y: 4 }, { x: 2, y: 12 }]);
});

test('Audio sync reprojects changed audio pixels and leaves new colors silent until mapped', async () => {
  const image = { width: 24, height: 12, rgba: new Uint8Array(24 * 12 * 4) };
  image.rgba.set([76, 130, 195, 255], (3 * image.width + 5) * 4);
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'song-shared-sync' }), image, {
    rowPitchMap: Array.from({ length: image.height }, (_, y) => 84 - y * 2), colorToSlot: { 'rgba-4c82c3ff': 'square' }
  });
  let project = await putPxdSharedImage(createPxdProject({ projectId: 'project-shared-sync', revisionId: 'revision-shared-sync' }), image);
  project = await writePxdAudioState(project, plan.song, { image, link: plan.link });
  const after = { ...image, rgba: new Uint8Array(image.rgba) };
  after.rgba.set([17, 34, 51, 255], (3 * image.width + 5) * 4);
  project = await synchronizeLinkedAudioImage(project, after, 'audio');
  const song = readPxdAudioState(project); const link = getPxdJson(project, 'audio/link.json');
  assert.equal(link.imageRole, 'audio'); assert.equal(link.colorToSlot['rgba-112233ff'], null);
  assert.equal(song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes)).some((note) => note.sourceCell?.x === 5 && note.sourceCell?.y === 3), false);
  assert.deepEqual((await readPxdSharedImage(project)).rgba, image.rgba);
  assert.deepEqual((await readPxdImage(project, 'audio')).rgba, after.rgba);
  const mapped = assignPxdAudioColor(song, after, link, 'rgba-112233ff', 'triangle');
  assert.ok(mapped.song.tracks.find((track) => track.instrument === 'triangle').clips[0].notes.some((note) => note.sourceCell?.x === 5 && note.sourceCell?.y === 3));
});

test('Audio sync updates audio link dimensions and remaps notes after an audio canvas resize', async () => {
  const before = { width: 20, height: 18, rgba: new Uint8Array(20 * 18 * 4) };
  before.rgba.set([76, 130, 195, 255], (3 * before.width + 5) * 4);
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'song-shared-resize' }), before, {
    rowPitchMap: Array.from({ length: before.height }, (_, y) => 84 - y * 2), colorToSlot: { 'rgba-4c82c3ff': 'square' }
  });
  let project = await putPxdSharedImage(createPxdProject({ projectId: 'project-shared-resize', revisionId: 'revision-shared-resize' }), before);
  project = await writePxdAudioState(project, plan.song, { image: before, link: plan.link });
  const after = { width: 16, height: 9, rgba: new Uint8Array(16 * 9 * 4) };
  after.rgba.set([76, 130, 195, 255], (2 * after.width + 4) * 4);
  project = await synchronizeLinkedAudioImage(project, after, 'audio');
  const link = getPxdJson(project, 'audio/link.json'); const song = readPxdAudioState(project);
  assert.deepEqual([link.width, link.height, link.rowPitchMap.length], [16, 9, 9]);
  assert.deepEqual(link.colorToSlot, { 'rgba-4c82c3ff': 'square' });
  assert.ok(song.tracks.find((track) => track.instrument === 'square').clips[0].notes.some((note) => note.sourceCell?.x === 4 && note.sourceCell?.y === 2));
  const audio = await readPxdImage(project, 'audio');
  assert.deepEqual([audio.width, audio.height], [16, 9]); assert.deepEqual(audio.rgba, after.rgba);
  assert.deepEqual([...(await readPxdSharedImage(project)).rgba], [...before.rgba]);
});

test('Audio paints and erases one shared source coordinate while preserving every other image pixel', () => {
  const image = { width: 32, height: 20, rgba: new Uint8Array(32 * 20 * 4) };
  image.rgba.set([76, 130, 195, 255], (8 * image.width + 4) * 4);
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'song-shared-cell' }), image, {
    rowPitchMap: Array(image.height).fill(60), colorToSlot: { 'rgba-4c82c3ff': 'square' }
  });
  const before = new Uint8Array(plan.image.rgba);
  const painted = setSharedAudioCell(plan.song, plan.image, plan.link, { x: 9, y: 12, slotId: 'triangle', active: true });
  assert.deepEqual([...painted.image.rgba.slice((12 * 32 + 9) * 4, (12 * 32 + 9) * 4 + 4)], [76, 130, 195, 255]);
  assert.deepEqual(painted.song.tracks.find((track) => track.instrument === 'triangle').clips[0].notes[0].sourceCell, { x: 9, y: 12 });
  const erased = setSharedAudioCell(painted.song, painted.image, painted.link, { x: 9, y: 12, slotId: 'triangle', active: false });
  assert.deepEqual([...erased.image.rgba.slice((12 * 32 + 9) * 4, (12 * 32 + 9) * 4 + 4)], [0, 0, 0, 0]);
  assert.equal(erased.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes)).some((note) => note.sourceCell?.x === 9 && note.sourceCell?.y === 12), false);
  assert.deepEqual(erased.image.rgba, before);
});

test('an unassigned shared-image color can paint a visible pixel without creating a note', async () => {
  const image = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  image.rgba.set([224, 91, 47, 255], 0);
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'silent-color' }), image, {
    colorToSlot: { 'rgba-e05b2fff': null }
  });
  const painted = setSharedAudioCell(plan.song, plan.image, plan.link, { x: 2, y: 3, slotId: null, colorId: 'rgba-e05b2fff' });
  assert.deepEqual([...painted.image.rgba.slice((3 * 16 + 2) * 4, (3 * 16 + 2) * 4 + 4)], [224, 91, 47, 255]);
  assert.equal(painted.link.colorToSlot['rgba-e05b2fff'], null);
  assert.equal(painted.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes)).some((note) => note.sourceCell?.x === 2 && note.sourceCell?.y === 3), false);
  assert.throws(() => setSharedAudioCell(painted.song, painted.image, painted.link, { x: 4, y: 3, slotId: 'square', colorId: 'rgba-e05b2fff' }), /描く色/);
  let project = await putPxdSharedImage(createPxdProject({ projectId: 'project-silent-color', revisionId: 'revision-silent-color' }), painted.image);
  project = await writePxdAudioState(project, painted.song, { image: painted.image, link: painted.link });
  assert.deepEqual((await readPxdSharedImage(project)).rgba, painted.image.rgba);
});

test('a newly added silent palette color remains available before it is painted', async () => {
  const image = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  const song = createAudioSong({ songId: 'unused-silent-color' });
  const added = prepareSharedAudioImageImport(song, image, { colorToSlot: { 'rgba-5e9ed2ff': null } });
  assert.equal(added.link.colorToSlot['rgba-5e9ed2ff'], null);
  let project = await putPxdSharedImage(createPxdProject({ projectId: 'project-unused-color', revisionId: 'revision-unused-color' }), image);
  project = await writePxdAudioState(project, added.song, { image, link: added.link });
  const reopened = prepareSharedAudioImageImport(readPxdAudioState(project), await readPxdSharedImage(project), { colorToSlot: getPxdJson(project, 'audio/link.json').colorToSlot });
  assert.equal(reopened.link.colorToSlot['rgba-5e9ed2ff'], null);
});
