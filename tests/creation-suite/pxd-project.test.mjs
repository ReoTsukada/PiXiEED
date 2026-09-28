import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, getPxdJson, setPxdJson, setPxdBytes, decodePxd, encodePxd } from '../../js/creation/pxd-codec.mjs';
import { createDrawDocument, documentRgba } from '../../js/creation/draw-core.mjs';
import { putPxdImage, readPxdImage, imageToDrawDocument, putPxdDrawDocument, readPxdDrawDocument, mergePxdJson, pxdToolUrl } from '../../js/creation/pxd-project.mjs';

test('PXD logical image preserves RGBA including hidden RGB, alpha and stable colour IDs across palette order', async () => {
  const image = { width: 16, height: 16, rgba: new Uint8Array(1024) }; image.rgba.set([9, 11, 30, 0, 100, 90, 80, 127, 1, 2, 3, 255]);
  const project = await putPxdImage(createPxdProject(), image);
  const roundTrip = await decodePxd(await encodePxd(project)); const read = await readPxdImage(roundTrip);
  assert.deepEqual(read.rgba, image.rgba); assert.ok(read.colorIds.includes('rgba-090b1e00'));
  const draw = imageToDrawDocument(read); assert.deepEqual(documentRgba(draw), image.rgba);
  const next = await putPxdDrawDocument(roundTrip, draw); assert.deepEqual(documentRgba(await readPxdDrawDocument(next)), image.rgba);
});
test('large non-square and colourful originals survive PXD without being silently adapted to Draw', async () => {
  const image = { width: 30, height: 16, rgba: Uint8Array.from({ length: 30 * 16 * 4 }, (_, i) => i % 256) };
  const project = await putPxdImage(createPxdProject(), image);
  assert.throws(() => imageToDrawDocument(image), /対応サイズ外/);
  assert.deepEqual((await readPxdImage(await decodePxd(await encodePxd(project)))).rgba, image.rgba);
  const colours = { width: 16, height: 16, rgba: new Uint8Array(1024) };
  for (let i = 0; i < 256; i++) colours.rgba.set([i, 80, 90, 255], i * 4);
  assert.throws(() => imageToDrawDocument(colours), /128色/);
  const retained = await putPxdImage(project, colours, 'full-colour'); assert.deepEqual((await readPxdImage(retained, 'full-colour')).rgba, colours.rgba);
});
test('editing known JSON keeps unknown fields of stable-ID items without resurrecting deleted notes', () => {
  let project = setPxdJson(createPxdProject(), 'audio/state.json', { future: { flag: true }, tracks: [{ trackId: 't1', futureVoice: 42, clips: [{ clipId: 'c1', clipUnknown: 5, notes: [{ noteId: 'n1', pitch: 60, futureArticulation: 6 }, { noteId: 'n2', pitch: 62 }] }] }] });
  project = mergePxdJson(project, 'audio/state.json', { tracks: [{ trackId: 't1', clips: [{ clipId: 'c1', notes: [{ noteId: 'n1', pitch: 64 }] }] }] });
  const state = getPxdJson(project, 'audio/state.json'); assert.equal(state.future.flag, true); assert.equal(state.tracks[0].futureVoice, 42); assert.equal(state.tracks[0].clips[0].clipUnknown, 5); assert.deepEqual(state.tracks[0].clips[0].notes, [{ noteId: 'n1', pitch: 64, futureArticulation: 6 }]);
});
test('changing a puzzle image removes its confirmation, while unrelated bytes and original remain intact', async () => {
  const original = createDrawDocument(); original.pixels[0] = 2;
  let project = await putPxdDrawDocument(createPxdProject(), original, 'spot-after'); project = setPxdJson(project, 'puzzles/spot_difference.json', { confirmed: true, publication: 'draft', published: false, future: 9 });
  project = setPxdBytes(project, 'future/unknown.bin', new Uint8Array([7, 8, 9])); const before = structuredClone(project);
  const changed = structuredClone(original); changed.pixels[1] = 3;
  const edited = await putPxdDrawDocument(project, changed, 'spot-after');
  assert.equal(getPxdJson(edited, 'puzzles/spot_difference.json').confirmed, false); assert.equal(getPxdJson(edited, 'puzzles/spot_difference.json').future, 9);
  assert.deepEqual(edited.entries.find((entry) => entry.path === 'future/unknown.bin').bytes, new Uint8Array([7, 8, 9]));
  assert.deepEqual(project, before); assert.deepEqual(documentRgba(await readPxdDrawDocument(project, 'spot-after')), documentRgba(original));
});
test('PXD navigation uses a fixed revision and never publishes or grants a pass', () => {
  const project = createPxdProject({ projectId: 'own-project', revisionId: 'fixed-revision' });
  assert.equal(pxdToolUrl('draw', project, 'audio'), '/draw/?pxd=own-project&pxdRevision=fixed-revision&pxdImage=audio');
  assert.throws(() => pxdToolUrl('https://example.com', project));
  assert.throws(() => pxdToolUrl('draw', project, '../hidden'));
});
