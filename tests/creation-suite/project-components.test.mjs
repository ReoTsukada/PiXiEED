import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, getPxdJson, setPxdBytes } from '../../js/creation/pxd-codec.mjs';
import { putPxdDrawDocument, readPxdSharedImage } from '../../js/creation/pxd-project.mjs';
import { createDrawDocument, documentRgba, strokePixels } from '../../js/creation/draw-core.mjs';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import { audioSongImage, prepareSharedAudioImageImport, readPxdAudioState, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { confirmDifferenceCandidates, detectDifferenceCandidates } from '../../js/creation/spot-difference-core.mjs';
import { confirmHiddenObjectTargets, createHiddenObjectDraft } from '../../js/creation/hidden-object-core.mjs';
import { createJigsawLayout, createJigsawWorkspace } from '../../js/creation/jigsaw-workspace.mjs';
import { createMemoryDraftAdapter, createLocalDraftStore } from '../../js/creation/local-drafts.mjs';
import { hasProjectComponent, putProjectComponentImage, replaceProjectComponentImage } from '../../js/creation/project-components.mjs';
import { readPxdPuzzle, writePxdPuzzle } from '../../js/creation/pxd-puzzles.mjs';

const sourceRef = (id) => ({ draftId: `draft-${id}`, assetId: `asset-${id}`, revisionId: `revision-${id}`, contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' });
function painted(color, x = 2, y = 3) {
  const doc = createDrawDocument(16); const index = doc.palette.push(color) - 1;
  strokePixels(doc, { x, y }, { x, y }, index); return doc;
}
function copyBytes(project, path) {
  const entry = project.entries.find((item) => item.path === path);
  return entry ? new Uint8Array(entry.bytes) : null;
}
function entriesExcept(project, excluded) {
  return new Map(project.entries.filter(({ path }) => !excluded(path)).map(({ path, bytes }) => [path, new Uint8Array(bytes)]));
}
async function fixture() {
  const main = painted('#e75445'); const main2 = painted('#4c82c3', 8, 8);
  let project = await putPxdDrawDocument(createPxdProject({ projectId: 'components-project', revisionId: 'components-r1' }), main, 'main');
  project = setPxdBytes(project, 'future/opaque.bin', new Uint8Array([8, 0, 7, 6]));

  const song = createAudioSong({ songId: 'component-song' });
  const audioPlan = prepareSharedAudioImageImport(song, audioSongImage(song));
  project = await writePxdAudioState(project, audioPlan.song, { image: audioPlan.image, link: audioPlan.link });

  const hiddenSource = sourceRef('hidden');
  let hidden = createHiddenObjectDraft({ gameId: 'component-hidden', source: hiddenSource, width: 16, height: 16, targets: [{ id: 'target-one', name: '赤い点', pixels: [50] }] });
  hidden = confirmHiddenObjectTargets(hidden);
  project = await writePxdPuzzle(project, { tool: 'hidden_object', document: hidden, sourceDrawDocuments: { hidden: main } });

  const before = main; const after = structuredClone(main); after.palette.push('#4c82c3'); strokePixels(after, { x: 9, y: 9 }, { x: 9, y: 9 }, after.palette.length - 1);
  const detected = detectDifferenceCandidates(before, after);
  const spot = confirmDifferenceCandidates({ schemaVersion: 1, gameId: 'component-spot', width: 16, height: 16,
    before: { ...sourceRef('before'), draftId: 'spot-source', assetId: 'spot-asset' },
    after: { ...sourceRef('after'), draftId: 'spot-source', assetId: 'spot-asset' },
    candidates: detected.candidates, confirmed: false, publication: 'draft', published: false });
  project = await writePxdPuzzle(project, { tool: 'spot_difference', document: spot, sourceDrawDocuments: { 'spot-before': before, 'spot-after': after } });

  const layout = createJigsawLayout({ width: 16, height: 16, pieceSize: 8, seed: 'components-jigsaw' });
  const jigsaw = createJigsawWorkspace({ gameId: 'component-jigsaw', source: sourceRef('jigsaw'), layout, seed: 'components-jigsaw' });
  jigsaw.groups[0] = { ...jigsaw.groups[0], x: 44, y: 55, inTray: false };
  project = await writePxdPuzzle(project, { tool: 'jigsaw', document: jigsaw, sourceDrawDocuments: { 'jigsaw-main': main } });
  return { project, main, main2, hidden, spot, jigsaw, song };
}

test('main edits preserve the audio image and song plus all puzzle images and answers', async () => {
  const { project, main2, song } = await fixture();
  const preserved = entriesExcept(project, (path) => path.startsWith('images/main/') || path === 'draw/state.json');
  const audioImage = copyBytes(project, 'images/audio/pixels.rgba');
  const audioState = copyBytes(project, 'audio/state.json');
  const puzzlePaths = ['puzzles/hidden_object.json', 'puzzles/spot_difference.json', 'puzzles/jigsaw.json'];
  const puzzleDocs = Object.fromEntries(puzzlePaths.map((path) => [path, getPxdJson(project, path)]));
  assert.deepEqual(readPxdAudioState(project), song);

  const edited = await putProjectComponentImage(project, 'draw', { width: 16, height: 16, rgba: documentRgba(main2) });
  assert.deepEqual((await readPxdSharedImage(edited)).rgba, documentRgba(main2));
  assert.deepEqual(copyBytes(edited, 'images/audio/pixels.rgba'), audioImage);
  assert.deepEqual(copyBytes(edited, 'audio/state.json'), audioState);
  for (const path of puzzlePaths) assert.deepEqual(getPxdJson(edited, path), puzzleDocs[path]);
  assert.deepEqual(entriesExcept(edited, (path) => path.startsWith('images/main/') || path === 'draw/state.json'), preserved);
});

test('audio role edits preserve main and every puzzle image and definition', async () => {
  const { project, main, main2, song } = await fixture();
  const mainBytes = copyBytes(project, 'images/main/pixels.rgba');
  const mainDraw = copyBytes(project, 'draw/state.json');
  const spotBefore = copyBytes(project, 'images/spot-before/pixels.rgba');
  const spotAfter = copyBytes(project, 'images/spot-after/pixels.rgba');
  const hiddenPixels = copyBytes(project, 'images/hidden/pixels.rgba');
  const jigsawPixels = copyBytes(project, 'images/jigsaw-main/pixels.rgba');
  const audioPixels = copyBytes(project, 'images/audio/pixels.rgba');
  const audioState = copyBytes(project, 'audio/state.json'); const audioLink = copyBytes(project, 'audio/link.json');
  const puzzleJson = ['puzzles/hidden_object.json', 'puzzles/spot_difference.json', 'puzzles/jigsaw.json'].map((path) => getPxdJson(project, path));

  const edited = await putProjectComponentImage(project, 'audio', { width: 16, height: 16, rgba: documentRgba(main2) });
  assert.deepEqual(copyBytes(edited, 'images/main/pixels.rgba'), mainBytes);
  assert.deepEqual(copyBytes(edited, 'draw/state.json'), mainDraw);
  assert.deepEqual(copyBytes(edited, 'images/spot-before/pixels.rgba'), spotBefore);
  assert.deepEqual(copyBytes(edited, 'images/spot-after/pixels.rgba'), spotAfter);
  assert.deepEqual(copyBytes(edited, 'images/hidden/pixels.rgba'), hiddenPixels);
  assert.deepEqual(copyBytes(edited, 'images/jigsaw-main/pixels.rgba'), jigsawPixels);
  ['puzzles/hidden_object.json', 'puzzles/spot_difference.json', 'puzzles/jigsaw.json'].forEach((path, index) => assert.deepEqual(getPxdJson(edited, path), puzzleJson[index]));
  assert.notDeepEqual(copyBytes(edited, 'images/audio/pixels.rgba'), audioPixels);
  assert.deepEqual(copyBytes(edited, 'audio/state.json'), audioState);
  assert.deepEqual(copyBytes(edited, 'audio/link.json'), audioLink);
  assert.deepEqual(readPxdAudioState(edited), song);
  assert.deepEqual((await readPxdSharedImage(edited)).rgba, documentRgba(main));
});

test('replaceProjectComponentImage rebuilds only the selected puzzle and retains every other entry', async () => {
  const { project, main2, hidden, spot, jigsaw } = await fixture();
  assert.equal(hasProjectComponent(project, 'hidden_object'), true);
  const retained = entriesExcept(project, (path) => path.startsWith('images/hidden/') || path === 'puzzles/hidden_object.json');
  const memory = createMemoryDraftAdapter(); const store = createLocalDraftStore(memory, { idFactory: (() => { let id = 0; return () => `component-import-${++id}`; })() });
  const replaced = await replaceProjectComponentImage(project, 'hidden_object', { width: 16, height: 16, rgba: documentRgba(main2) }, { store });

  assert.deepEqual(entriesExcept(replaced, (path) => path.startsWith('images/hidden/') || path === 'puzzles/hidden_object.json'), retained);
  assert.notDeepEqual(copyBytes(replaced, 'images/hidden/pixels.rgba'), copyBytes(project, 'images/hidden/pixels.rgba'));
  const updatedHidden = await readPxdPuzzle(replaced, 'hidden_object');
  assert.equal(updatedHidden.document.confirmed, false); assert.deepEqual(updatedHidden.document.targets, []);
  assert.deepEqual(documentRgba(updatedHidden.images.hidden.drawDocument), documentRgba(main2));
  assert.deepEqual(getPxdJson(replaced, 'puzzles/spot_difference.json'), getPxdJson(project, 'puzzles/spot_difference.json'));
  assert.deepEqual(getPxdJson(replaced, 'puzzles/jigsaw.json'), getPxdJson(project, 'puzzles/jigsaw.json'));
  assert.deepEqual((await readPxdPuzzle(project, 'hidden_object')).document.targets, hidden.targets);
  assert.deepEqual(getPxdJson(replaced, 'puzzles/spot_difference.json').document, spot);
  assert.deepEqual(getPxdJson(replaced, 'puzzles/jigsaw.json').document, jigsaw);
  const reference = updatedHidden.document.source;
  const savedDraft = await memory.get(reference.draftId);
  assert.ok(savedDraft?.revisions.some((revision) => revision.revisionId === reference.revisionId), 'replacement source was created in the supplied memory draft store');
});
