import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawDocument, documentRgba, strokePixels } from '../../js/creation/draw-core.mjs';
import { createPxdProject, getPxdJson, setPxdBytes, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { mergePxdJson, putPxdDrawDocument, readPxdDrawDocument, readPxdImage } from '../../js/creation/pxd-project.mjs';
import { readPxdAudioLink } from '../../js/creation/pxd-audio-link.mjs';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import { detachPxdAudioImage, prepareSharedAudioImageImport, readPxdAudioState, writePxdAudioState, writePxdDrawDocument } from '../../js/creation/pxd-draw-audio.mjs';
import { createHiddenObjectDraft } from '../../js/creation/hidden-object-core.mjs';
import { freezePxdPuzzleImages, writePxdPuzzle } from '../../js/creation/pxd-puzzles.mjs';
import { freezeProjectComponents } from '../../js/creation/project-components.mjs';

function painted() {
  const document = createDrawDocument(16);
  strokePixels(document, { x: 2, y: 3 }, { x: 2, y: 3 }, 2);
  return document;
}
const originalRef = { draftId: 'startup-draft', assetId: 'startup-asset', revisionId: 'startup-revision', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };
async function legacyPuzzle() {
  const document = painted();
  const hidden = createHiddenObjectDraft({ gameId: 'startup-hidden', source: originalRef, width: 16, height: 16, targets: [{ id: 'one', name: '赤い点', pixels: [50] }] });
  let project = await putPxdDrawDocument(createPxdProject(), document);
  project = await writePxdPuzzle(project, { tool: 'hidden_object', document: hidden, sourceDrawDocuments: { hidden: document } });
  project = mergePxdJson(project, 'puzzles/hidden_object.json', { imageRoles: { hidden: 'main' }, futurePuzzleField: { preserve: [1, 2] } });
  return { project, document };
}

test('lightweight audio metadata owns nested values and preserves unknown fields without modifying source bytes', () => {
  const link = { rulesVersion: 'future-link', imageRole: 'main', colorToSlot: { red: 'square' }, future: { values: [null, { keep: true }] } };
  const project = setPxdJson(createPxdProject(), 'audio/link.json', link), before = structuredClone(project);
  const first = readPxdAudioLink(project); first.colorToSlot.red = 'triangle'; first.future.values[1].keep = false;
  assert.deepEqual(readPxdAudioLink(project), link); assert.deepEqual(project, before);
  for (const value of [null, [], 'future', 12]) assert.deepEqual(readPxdAudioLink(setPxdJson(createPxdProject(), 'audio/link.json', value)), value);
  assert.equal(readPxdAudioLink(createPxdProject()), null); assert.equal(readPxdAudioLink(null), null);
});

test('audio metadata rejects malformed JSON and invalid UTF-8 without modifying preserved bytes', () => {
  for (const bytes of [new TextEncoder().encode('{'), new Uint8Array([0xff, 0xfe])]) {
    const project = setPxdBytes(createPxdProject(), 'audio/link.json', bytes), before = structuredClone(project);
    assert.throws(() => readPxdAudioLink(project), { code: 'PXD_JSON_ENTRY_INVALID' }); assert.deepEqual(project, before);
  }
});

test('direct Draw persistence retains unknown JSON and opaque entries like the previous wrapper', async () => {
  const document = painted();
  let project = await writePxdDrawDocument(createPxdProject(), document);
  project = mergePxdJson(project, 'draw/state.json', { futureDrawField: { keep: [1, 'x'] } });
  project = mergePxdJson(project, 'images/main/meta.json', { futureImageField: { keep: true } });
  project = setPxdBytes(project, 'future/opaque.bin', new Uint8Array([0, 255, 3]));
  const changed = structuredClone(document); changed.pixels[51] = 4;
  const direct = await putPxdDrawDocument(project, changed), previous = await writePxdDrawDocument(project, changed);
  assert.deepEqual(direct, previous); assert.deepEqual(documentRgba(await readPxdDrawDocument(direct)), documentRgba(changed));
  assert.deepEqual(getPxdJson(direct, 'draw/state.json').futureDrawField, { keep: [1, 'x'] });
  assert.deepEqual(getPxdJson(direct, 'images/main/meta.json').futureImageField, { keep: true });
  assert.deepEqual(direct.entries.find(entry => entry.path === 'future/opaque.bin').bytes, new Uint8Array([0, 255, 3]));
});

test('conditional component freezing still detaches both legacy puzzle and main-linked audio before Draw replaces pixels', async () => {
  let { project, document } = await legacyPuzzle();
  const image = { width: 16, height: 16, rgba: documentRgba(document) };
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'startup-song' }), image, { imageRole: 'main' });
  project = await writePxdAudioState(project, plan.song, { image, link: plan.link });
  project = mergePxdJson(project, 'audio/link.json', { futureLinkField: { preserve: true } });
  project = setPxdBytes(project, 'future/opaque.bin', new Uint8Array([9, 0, 8]));
  const before = structuredClone(project);
  const eager = await detachPxdAudioImage(await freezePxdPuzzleImages(project));
  const frozen = await freezeProjectComponents(project);
  assert.deepEqual(frozen, eager); assert.deepEqual(project, before);
  assert.equal(getPxdJson(frozen, 'puzzles/hidden_object.json').imageRoles.hidden, 'hidden');
  assert.equal(readPxdAudioLink(frozen).imageRole, 'audio'); assert.deepEqual(readPxdAudioState(frozen), plan.song);
  assert.deepEqual(getPxdJson(frozen, 'puzzles/hidden_object.json').futurePuzzleField, { preserve: [1, 2] });
  assert.deepEqual(readPxdAudioLink(frozen).futureLinkField, { preserve: true });
  const changed = structuredClone(document); changed.pixels[50] = 4;
  const saved = await putPxdDrawDocument(frozen, changed);
  for (const role of ['hidden', 'audio']) assert.deepEqual((await readPxdImage(saved, role)).rgba, image.rgba);
  assert.deepEqual((await readPxdImage(saved, 'main')).rgba, documentRgba(changed));
});

test('conditional puzzle freezing retains resolver recovery and fails closed when original reference cannot be restored', async () => {
  const { project, document } = await legacyPuzzle();
  const changed = structuredClone(document); changed.pixels[50] = 4;
  const legacy = await putPxdDrawDocument(project, changed), before = structuredClone(legacy);
  await assert.rejects(freezeProjectComponents(legacy, { resolveSourceImage: async () => null }), /原画|保存時/);
  assert.deepEqual(legacy, before);
  let count = 0;
  const recovered = await freezeProjectComponents(legacy, { resolveSourceImage: async reference => {
    count++; assert.deepEqual(reference, originalRef); return { width: 16, height: 16, rgba: documentRgba(document) };
  } });
  assert.equal(count, 1); assert.deepEqual((await readPxdImage(recovered, 'hidden')).rgba, documentRgba(document));
  assert.deepEqual((await readPxdImage(recovered, 'main')).rgba, documentRgba(changed)); assert.deepEqual(legacy, before);
});

test('component freezing preserves an orphan valid audio link and rejects an orphan malformed audio link', async () => {
  const valid = setPxdJson(await putPxdDrawDocument(createPxdProject(), painted()), 'audio/link.json', { futureLinkField: { keep: true } });
  assert.equal(await freezeProjectComponents(valid), valid);
  const malformed = setPxdBytes(valid, 'audio/link.json', new TextEncoder().encode('{')), before = structuredClone(malformed);
  await assert.rejects(freezeProjectComponents(malformed), { code: 'PXD_JSON_ENTRY_INVALID' }); assert.deepEqual(malformed, before);
});
