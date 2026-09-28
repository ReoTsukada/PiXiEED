import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, getPxdJson } from '../../js/creation/pxd-codec.mjs';
import { mergePxdJson, putPxdDrawDocument, putPxdImage } from '../../js/creation/pxd-project.mjs';
import { createMemoryDraftAdapter, createLocalDraftStore } from '../../js/creation/local-drafts.mjs';
import { createDrawDocument, documentRgba, strokePixels } from '../../js/creation/draw-core.mjs';
import { confirmDifferenceCandidates, detectDifferenceCandidates } from '../../js/creation/spot-difference-core.mjs?rev=20260927-spot-difference-1';
import { confirmHiddenObjectTargets, createHiddenObjectDraft, resolveLocalDrawRevision as resolveHiddenRevision } from '../../js/creation/hidden-object-core.mjs?rev=20260928-short-hitboxes-1';
import { resolveLocalDrawRevision as resolveSpotRevision } from '../../js/creation/spot-difference-core.mjs?rev=20260927-spot-difference-1';
import { createJigsawLayout, createJigsawWorkspace } from '../../js/creation/jigsaw-workspace.mjs?rev=20260928-jigsaw-workspace-1';
import { createPxdPuzzleFromMain, materializePxdPuzzle, readPxdPuzzle, writePxdPuzzle } from '../../js/creation/pxd-puzzles.mjs';

const hash = (char) => char.repeat(64);
function sourceRef(revisionId, contentHash) { return { draftId: 'source-draft', assetId: 'source-asset', revisionId, contentHash, hashScheme: 'sha256-canonical-v1' }; }
function drawDocument(color = '#e75445') {
  const document = createDrawDocument(16);
  const colorIndex = document.palette.push(color) - 1;
  for (let y = 1; y < 5; y += 1) for (let x = 1; x < 5; x += 1) strokePixels(document, { x, y }, { x, y }, colorIndex);
  return document;
}
function fixtureSpot(confirmed = true) {
  const before = drawDocument('#e75445'); const after = structuredClone(before);
  after.palette.push('#4c82c3'); strokePixels(after, { x: 10, y: 10 }, { x: 11, y: 11 }, after.palette.length - 1);
  const detected = detectDifferenceCandidates(before, after);
  const draft = { schemaVersion: 1, gameId: 'spot-old', width: 16, height: 16, before: sourceRef('rev-before', hash('a')), after: sourceRef('rev-after', hash('b')), candidates: detected.candidates, confirmed: false, publication: 'draft', published: false };
  return { before, after, document: confirmed ? confirmDifferenceCandidates(draft) : draft };
}
function fixtureHidden(confirmed = true) {
  const source = sourceRef('rev-main', hash('c'));
  const draft = createHiddenObjectDraft({ gameId: 'hidden-old', source, width: 16, height: 16, targets: [{ id: 'target-001', name: '赤い四角', pixels: [17, 18, 19, 20, 33, 34, 35, 36, 49, 50, 51, 52, 65, 66, 67, 68] }] });
  return { source: drawDocument(), document: confirmed ? confirmHiddenObjectTargets(draft) : draft };
}
function fixtureJigsaw() {
  const document = drawDocument(); const source = sourceRef('rev-jigsaw', hash('d'));
  const layout = createJigsawLayout({ width: 16, height: 16, pieceSize: 8, seed: 'portable-jigsaw' });
  const game = createJigsawWorkspace({ gameId: 'jigsaw-old', source, layout, seed: 'portable-jigsaw' });
  game.groups[0] = { ...game.groups[0], rotation: 3 };
  return { document, game };
}
const storeFor = () => createLocalDraftStore(createMemoryDraftAdapter(), { idFactory: (() => { let index = 0; return () => `local-${++index}`; })() });

test('Spot PXD round-trip materialises two exact revisions in one fresh local Draw draft', async () => {
  const { before, after, document } = fixtureSpot();
  let project = await writePxdPuzzle(null, { tool: 'spot_difference', document, sourceDrawDocuments: { 'spot-before': before, 'spot-after': after } });
  project = mergePxdJson(project, 'puzzles/spot_difference.json', { futurePuzzleField: { keep: true } });
  project = mergePxdJson(project, 'parts/unknown.json', { audio: { notes: [1, 2], custom: 'untouched' } });
  const untouchedBytes = new Uint8Array(project.entries.find((entry) => entry.path === 'parts/unknown.json').bytes);
  const loaded = await readPxdPuzzle(project, 'spot_difference');
  const result = await materializePxdPuzzle(loaded, { tool: 'spot_difference', store: storeFor() });
  assert.equal(result.document.confirmed, true);
  assert.equal(result.document.before.draftId, result.document.after.draftId);
  assert.notEqual(result.document.before.revisionId, result.document.after.revisionId);
  assert.deepEqual(documentRgba(result.bindings.before.drawDocument), documentRgba(before));
  assert.deepEqual(documentRgba(result.bindings.after.drawDocument), documentRgba(after));
  assert.deepEqual(getPxdJson(project, 'puzzles/spot_difference.json').futurePuzzleField, { keep: true });
  assert.deepEqual(project.entries.find((entry) => entry.path === 'parts/unknown.json').bytes, untouchedBytes);
  const savedAgain = await writePxdPuzzle(project, {
    tool: 'spot_difference', document: result.document,
    sourceDrawDocuments: { 'spot-before': result.bindings.before.drawDocument, 'spot-after': result.bindings.after.drawDocument },
    portableOriginalRefs: result.portableOriginalRefs, sourceChanged: false
  });
  const reopenedAgain = await readPxdPuzzle(savedAgain, 'spot_difference');
  assert.deepEqual(reopenedAgain.portableOriginalRefs, loaded.portableOriginalRefs, 'portable source history survives export after fresh local bindings');
  assert.equal(reopenedAgain.document.before.draftId, result.document.before.draftId, 'current local bindings are separate from original refs');
});

test('Hidden PXD round-trip preserves targets and confirmed hit boxes in a fresh strict source revision', async () => {
  const { source, document } = fixtureHidden();
  const project = await writePxdPuzzle(null, { tool: 'hidden_object', document, sourceDrawDocuments: { hidden: source } });
  const loaded = await readPxdPuzzle(project, 'hidden_object');
  const result = await materializePxdPuzzle(loaded, { tool: 'hidden_object', store: storeFor() });
  assert.equal(result.document.confirmed, true);
  assert.deepEqual(result.document.targets, document.targets);
  assert.deepEqual(result.document.hitBoxes, document.hitBoxes);
  assert.notEqual(result.document.source.draftId, document.source.draftId);
});

test('Jigsaw PXD round-trip preserves group poses and public sources remain reference-only', async () => {
  const { document: sourceDraw, game } = fixtureJigsaw();
  const project = await writePxdPuzzle(null, { tool: 'jigsaw', document: game, sourceDrawDocuments: { 'jigsaw-main': sourceDraw } });
  const result = await materializePxdPuzzle(await readPxdPuzzle(project, 'jigsaw'), { tool: 'jigsaw', store: storeFor() });
  assert.deepEqual(result.document.groups.map(({ groupId, rotation, x, y, inTray }) => ({ groupId, rotation, x, y, inTray })), game.groups.map(({ groupId, rotation, x, y, inTray }) => ({ groupId, rotation, x, y, inTray })));
  assert.notEqual(result.document.gameId, game.gameId, 'import must not overwrite a same-ID local game');

  const publicSource = { type: 'public', postId: 'map:fixture', title: '公開作品', url: 'https://kyyiuakrqomzlikfaire.supabase.co/storage/v1/object/public/post-public/fixture/original.png', fingerprint: hash('e'), width: 16, height: 16 };
  const publicGame = createJigsawWorkspace({ gameId: 'public-jigsaw', source: publicSource, layout: createJigsawLayout({ width: 16, height: 16, pieceSize: 8, seed: 'public' }) });
  const publicProject = await writePxdPuzzle(null, { tool: 'jigsaw', document: publicGame });
  assert.equal(publicProject.entries.some((entry) => entry.path.startsWith('images/jigsaw-main/')), false);
  const publicResult = await materializePxdPuzzle(await readPxdPuzzle(publicProject, 'jigsaw'), { tool: 'jigsaw', store: storeFor(), verifyPublicSource: async (source) => assert.equal(source.postId, 'map:fixture') });
  assert.equal(publicResult.document.source.postId, 'map:fixture');
  assert.equal(Object.hasOwn(publicResult.document.source, 'dataUrl'), false);
});

test('own Jigsaw file stores one exact RGBA image and rebuilds the existing file-source contract', async () => {
  const image = { width: 17, height: 16, rgba: new Uint8Array(17 * 16 * 4) };
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) image.rgba.set([pixel % 256, 90, 120, 255], pixel * 4);
  const source = { type: 'file', dataUrl: `data:image/png;base64,${'A'.repeat(80)}`, fingerprint: hash('e'), width: 17, height: 16 };
  const game = createJigsawWorkspace({ gameId: 'file-jigsaw', source, layout: createJigsawLayout({ width: 17, height: 16, pieceSize: 8, seed: 'file' }) });
  const project = await writePxdPuzzle(null, { tool: 'jigsaw', document: game, sourceImages: { 'jigsaw-main': image } });
  const savedGame = getPxdJson(project, 'puzzles/jigsaw.json');
  assert.equal(Object.hasOwn(savedGame.document.source, 'dataUrl'), false, 'PXD keeps only one canonical pixel image');
  assert.equal(project.entries.filter((entry) => entry.path === 'images/jigsaw-main/pixels.rgba').length, 1);
  const loaded = await readPxdPuzzle(project, 'jigsaw');
  const result = await materializePxdPuzzle(loaded, {
    tool: 'jigsaw', store: storeFor(),
    encodeJigsawFileImage: async (pixels) => {
      assert.deepEqual(pixels.rgba, image.rgba, 'the encoder receives the exact stored RGBA bytes');
      return { dataUrl: 'data:image/png;base64,AA==', fingerprint: hash('f'), width: pixels.width, height: pixels.height };
    }
  });
  assert.equal(result.document.source.type, 'file');
  assert.equal(result.document.source.width, 17);
  assert.equal(result.document.source.height, 16);
  assert.equal(result.document.source.fingerprint, hash('f'));
});

test('source image edits invalidate Spot confirmation and Hidden answer, while wrong dimensions fail closed', async () => {
  const spot = fixtureSpot();
  const changedAfter = structuredClone(spot.after); changedAfter.palette.push('#f2b84b'); strokePixels(changedAfter, { x: 8, y: 8 }, { x: 8, y: 8 }, changedAfter.palette.length - 1);
  const spotProject = await writePxdPuzzle(null, { tool: 'spot_difference', document: spot.document, sourceDrawDocuments: { 'spot-before': spot.before, 'spot-after': spot.after } });
  const editedSpot = await writePxdPuzzle(spotProject, { tool: 'spot_difference', document: spot.document, sourceDrawDocuments: { 'spot-before': spot.before, 'spot-after': changedAfter } });
  const spotResult = await materializePxdPuzzle(await readPxdPuzzle(editedSpot, 'spot_difference'), { tool: 'spot_difference', store: storeFor() });
  assert.equal(spotResult.document.confirmed, false);
  assert.ok(spotResult.document.candidates.some((candidate) => candidate.pixels.includes(8 * 16 + 8)));

  const hidden = fixtureHidden();
  const hiddenProject = await writePxdPuzzle(null, { tool: 'hidden_object', document: hidden.document, sourceDrawDocuments: { hidden: hidden.source } });
  const editedMain = structuredClone(hidden.source); editedMain.palette.push('#f2b84b'); strokePixels(editedMain, { x: 12, y: 12 }, { x: 12, y: 12 }, editedMain.palette.length - 1);
  const editedHidden = await writePxdPuzzle(hiddenProject, { tool: 'hidden_object', document: hidden.document, sourceDrawDocuments: { hidden: editedMain } });
  const hiddenResult = await materializePxdPuzzle(await readPxdPuzzle(editedHidden, 'hidden_object'), { tool: 'hidden_object', store: storeFor() });
  assert.equal(hiddenResult.document.confirmed, false);
  assert.equal(hiddenResult.document.hitBoxes, null);
  assert.deepEqual(hiddenResult.document.targets, hidden.document.targets);

  const wrongSize = structuredClone(spot.after); wrongSize.width = 32; wrongSize.height = 32; wrongSize.pixels = Array(1024).fill(-1);
  const invalid = await writePxdPuzzle(spotProject, { tool: 'spot_difference', document: spot.document, sourceDrawDocuments: { 'spot-before': spot.before, 'spot-after': wrongSize } });
  const invalidRead = await readPxdPuzzle(invalid, 'spot_difference');
  let writes = 0;
  await assert.rejects(() => materializePxdPuzzle(invalidRead, { tool: 'spot_difference', store: { save: async () => { writes += 1; } } }), /サイズ/);
  assert.equal(writes, 0, 'invalid dimensions are rejected before local draft writes');
});

test('PXD public Jigsaw must not import unless current publication is revalidated', async () => {
  const source = { type: 'public', postId: 'map:fixture', title: '公開作品', url: 'https://kyyiuakrqomzlikfaire.supabase.co/storage/v1/object/public/post-public/fixture/original.png', fingerprint: hash('f'), width: 16, height: 16 };
  const game = createJigsawWorkspace({ gameId: 'public-jigsaw-2', source, layout: createJigsawLayout({ width: 16, height: 16, pieceSize: 8, seed: 'public-2' }) });
  const project = await writePxdPuzzle(null, { tool: 'jigsaw', document: game });
  const loaded = await readPxdPuzzle(project, 'jigsaw');
  await assert.rejects(() => materializePxdPuzzle(loaded, { tool: 'jigsaw', store: storeFor(), verifyPublicSource: async () => { throw new Error('公開が終了しています'); } }), /公開が終了/);
  await assert.rejects(() => materializePxdPuzzle(loaded, { tool: 'jigsaw', store: storeFor() }), /権限を引き継ぎません/);
});

test('a Draw-only PXD starts fresh unconfirmed Jigsaw, Spot, and Hidden components without replacing other entries', async () => {
  const main = drawDocument();
  let project = await putPxdDrawDocument(createPxdProject(), main, 'main');
  project = mergePxdJson(project, 'parts/audio.json', { notes: [{ noteId: 'n1', pitch: 60 }] });
  const audioBytes = new Uint8Array(project.entries.find((entry) => entry.path === 'parts/audio.json').bytes);
  const store = storeFor();

  const jigsaw = await createPxdPuzzleFromMain(project, { tool: 'jigsaw', store });
  assert.equal(jigsaw.document.groups.length, 25);
  assert.equal(jigsaw.document.groups[0].inTray, true);
  assert.equal(jigsaw.document.groups[0].rotation >= 0, true);
  const spot = await createPxdPuzzleFromMain(project, { tool: 'spot_difference', store });
  assert.deepEqual(spot.document.candidates, []);
  assert.equal(spot.document.confirmed, false);
  assert.equal(spot.bindings.before.draftId, spot.bindings.after.draftId);
  assert.notEqual(spot.bindings.before.revision.revisionId, spot.bindings.after.revision.revisionId);
  const hidden = await createPxdPuzzleFromMain(project, { tool: 'hidden_object', store });
  assert.deepEqual(hidden.document.targets, []);
  assert.equal(hidden.document.confirmed, false);
  assert.deepEqual(project.entries.find((entry) => entry.path === 'parts/audio.json').bytes, audioBytes);
});

test('audio-only PXD selects its existing image role as the primary local puzzle source', async () => {
  const project = await putPxdDrawDocument(createPxdProject(), drawDocument(), 'audio');
  const hidden = await createPxdPuzzleFromMain(project, { tool: 'hidden_object', store: storeFor() });
  assert.equal(hidden.document.source.draftId, hidden.bindings.source.draftId);
  assert.equal(hidden.document.width, 16);
  assert.equal(hidden.document.confirmed, false);
  assert.equal(project.entries.some((entry) => entry.path === 'puzzles/hidden_object.json'), false, 'opening a tool does not mutate the imported project');
});

test('32x16 audio image materialises into strict rectangular Spot and Hidden source revisions', async () => {
  const width = 32; const height = 16; const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) rgba.set(index % 5 === 0 ? [231, 84, 69, 255] : [38, 50, 56, 255], index * 4);
  const project = await putPxdImage(createPxdProject(), { width, height, rgba }, 'audio');

  const spotAdapter = createMemoryDraftAdapter();
  const spotStore = createLocalDraftStore(spotAdapter, { idFactory: (() => { let index = 0; return () => `rect-spot-${++index}`; })() });
  const spotDraft = await createPxdPuzzleFromMain(project, { tool: 'spot_difference', store: spotStore });
  assert.equal(spotDraft.document.width, width);
  assert.equal(spotDraft.document.height, height);
  const spotProject = await writePxdPuzzle(project, {
    tool: 'spot_difference', document: spotDraft.document,
    sourceDrawDocuments: { 'spot-before': spotDraft.bindings.before.drawDocument, 'spot-after': spotDraft.bindings.after.drawDocument },
    portableOriginalRefs: spotDraft.portableOriginalRefs
  });
  const spotRoundTrip = await materializePxdPuzzle(await readPxdPuzzle(spotProject, 'spot_difference'), { tool: 'spot_difference', store: spotStore });
  const spotFixed = await resolveSpotRevision(spotAdapter, spotRoundTrip.document.before.draftId, spotRoundTrip.document.before.revisionId);
  assert.equal(spotFixed.document.width, width);
  assert.equal(spotFixed.document.height, height);
  assert.deepEqual(documentRgba(spotRoundTrip.bindings.before.drawDocument), rgba);

  const hiddenAdapter = createMemoryDraftAdapter();
  const hiddenStore = createLocalDraftStore(hiddenAdapter, { idFactory: (() => { let index = 0; return () => `rect-hidden-${++index}`; })() });
  const hiddenDraft = await createPxdPuzzleFromMain(project, { tool: 'hidden_object', store: hiddenStore });
  assert.equal(hiddenDraft.document.width, width);
  assert.equal(hiddenDraft.document.height, height);
  const hiddenProject = await writePxdPuzzle(project, { tool: 'hidden_object', document: hiddenDraft.document, sourceDrawDocuments: { hidden: hiddenDraft.bindings.source.drawDocument }, portableOriginalRefs: hiddenDraft.portableOriginalRefs });
  const hiddenRoundTrip = await materializePxdPuzzle(await readPxdPuzzle(hiddenProject, 'hidden_object'), { tool: 'hidden_object', store: hiddenStore });
  const hiddenFixed = await resolveHiddenRevision(hiddenAdapter, hiddenRoundTrip.document.source.draftId, hiddenRoundTrip.document.source.revisionId);
  assert.equal(hiddenFixed.document.width, width);
  assert.equal(hiddenFixed.document.height, height);
  assert.deepEqual(documentRgba(hiddenRoundTrip.bindings.source.drawDocument), rgba);
});
