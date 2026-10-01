import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, getPxdJson } from '../../js/creation/pxd-codec.mjs';
import { putPxdDrawDocument, putPxdImage, putPxdSharedImage, readPxdImage, readPxdSharedImage } from '../../js/creation/pxd-project.mjs';
import { createAudioSong, setAudioPixelPalette, setAudioTempo } from '../../js/creation/audio-core.mjs';
import { detachPxdAudioImage, prepareSharedAudioImageImport, readPxdAudioLink, readPxdAudioState, setSharedAudioCell, synchronizeLinkedAudioImage, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { imageToDrawDocument } from '../../js/creation/pxd-project.mjs';

function image() {
  const result = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  result.rgba.set([76, 130, 195, 255], 0);
  result.rgba.set([231, 84, 69, 255], 4);
  return result;
}

function notes(song) { return song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes)); }

test('music BPM and instrument edits persist only the audio component; music pixel edits keep main intact', async () => {
  const main = image();
  let project = await putPxdSharedImage(createPxdProject({ projectId: 'component-isolation' }), main);
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'component-song' }), main, {
    colorToSlot: { 'rgba-4c82c3ff': 'square', 'rgba-e75445ff': 'triangle' }
  });
  assert.equal(plan.link.imageRole, 'audio');
  project = await writePxdAudioState(project, plan.song, { image: plan.image, link: plan.link });
  const frozenMain = await readPxdSharedImage(project);
  const frozenAudio = await readPxdImage(project, 'audio');

  let song = setAudioTempo(readPxdAudioState(project), 90);
  song = setAudioPixelPalette(song, { slotId: 'square', instrument: 'warm-pad' });
  project = await writePxdAudioState(project, song, { image: frozenAudio, link: readPxdAudioLink(project) });
  assert.deepEqual((await readPxdSharedImage(project)).rgba, frozenMain.rgba);
  assert.deepEqual((await readPxdImage(project, 'audio')).rgba, frozenAudio.rgba);
  assert.equal(readPxdAudioState(project).tempo, 90);
  assert.equal(readPxdAudioState(project).pixelPalette.find(({ slotId }) => slotId === 'square').instrument, 'warm-pad');

  const editedMain = structuredClone(main); editedMain.rgba.set([17, 34, 51, 255], 8);
  const untouched = await synchronizeLinkedAudioImage(project, imageToDrawDocument(editedMain), 'main');
  assert.equal(untouched, project);
  project = await putPxdDrawDocument(untouched, imageToDrawDocument(editedMain), 'main');
  assert.deepEqual((await readPxdSharedImage(project)).rgba, editedMain.rgba);
  assert.deepEqual((await readPxdImage(project, 'audio')).rgba, frozenAudio.rgba);
  assert.equal(readPxdAudioState(project).tempo, 90);

  const audioLink = readPxdAudioLink(project);
  const painted = setSharedAudioCell(readPxdAudioState(project), frozenAudio, audioLink, { x: 3, y: 4, slotId: 'triangle' });
  project = await writePxdAudioState(project, painted.song, { image: painted.image, link: painted.link });
  assert.deepEqual((await readPxdSharedImage(project)).rgba, editedMain.rgba);
  assert.deepEqual((await readPxdImage(project, 'audio')).rgba, painted.image.rgba);
  assert.ok(notes(readPxdAudioState(project)).some((note) => note.sourceCell?.x === 3 && note.sourceCell?.y === 4));
});

test('editing main detaches a legacy main-linked song before Draw writes new pixels', async () => {
  const original = image(); const changed = structuredClone(original);
  changed.rgba.set([231, 84, 69, 255], (2 * changed.width + 5) * 4);
  let project = await putPxdSharedImage(createPxdProject({ projectId: 'legacy-main-link' }), original);
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'legacy-song' }), original, { imageRole: 'main' });
  project = await writePxdAudioState(project, plan.song, { image: original, link: plan.link });
  const beforeSong = readPxdAudioState(project);

  const detached = await synchronizeLinkedAudioImage(project, imageToDrawDocument(changed), 'main');
  assert.equal(readPxdAudioLink(detached).imageRole, 'audio');
  assert.deepEqual((await readPxdSharedImage(detached)).rgba, original.rgba);
  assert.deepEqual((await readPxdImage(detached, 'audio')).rgba, original.rgba);
  assert.deepEqual(readPxdAudioState(detached), beforeSong);

  const saved = await putPxdDrawDocument(detached, imageToDrawDocument(changed), 'main');
  assert.deepEqual((await readPxdSharedImage(saved)).rgba, changed.rgba);
  assert.deepEqual((await readPxdImage(saved, 'audio')).rgba, original.rgba);
  assert.deepEqual(readPxdAudioState(saved), beforeSong);
});

test('legacy detach refuses to replace a conflicting existing audio image', async () => {
  const main = image(); const other = structuredClone(main); other.rgba.set([231, 84, 69, 255], 8);
  let project = await putPxdSharedImage(createPxdProject({ projectId: 'conflicting-components' }), main);
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'conflict-song' }), main, { imageRole: 'main' });
  project = await writePxdAudioState(project, plan.song, { image: main, link: plan.link });
  project = await putPxdImage(project, other, 'audio');
  const before = project.entries.map(({ path, bytes }) => [path, [...bytes]]);
  await assert.rejects(detachPxdAudioImage(project), /既にあり/);
  assert.deepEqual(project.entries.map(({ path, bytes }) => [path, [...bytes]]), before);
  assert.equal(getPxdJson(project, 'audio/link.json').imageRole, 'main');
});
