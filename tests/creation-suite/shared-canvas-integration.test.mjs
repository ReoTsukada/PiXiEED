import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryPxdAdapter, createPxdStore } from '../../js/creation/pxd-store.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { createDrawDocument, documentRgba, strokePixels } from '../../js/creation/draw-core.mjs';
import { createAudioSong, setAudioPixelPalette, setAudioTempo } from '../../js/creation/audio-core.mjs';
import { prepareSharedAudioImageImport, readPxdAudioLink, readPxdAudioState, validatePxdAudioBinding, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { putPxdDrawDocument, putPxdSharedImage, readPxdDrawDocument, readPxdImage, readPxdSharedImage } from '../../js/creation/pxd-project.mjs';
import { createHiddenObjectDraft } from '../../js/creation/hidden-object-core.mjs';
import { createJigsawLayout, createJigsawWorkspace } from '../../js/creation/jigsaw-workspace.mjs';
import { readPxdPuzzle, writePxdPuzzle } from '../../js/creation/pxd-puzzles.mjs';
import { createProjectSession } from '../../js/creation/project-session.mjs';

const sourceRef = (name) => ({ draftId: `${name}-draft`, assetId: `${name}-asset`, revisionId: `${name}-revision`, contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' });

test('each photo starts a separate project and its exact colors reach Draw and Music', async () => {
  const store = createPxdStore({ adapter: createMemoryPxdAdapter() });
  const firstImage = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  firstImage.rgba.fill(255);
  const first = await store.save(await putPxdSharedImage(createPxdProject({ projectId: 'photo-first', revisionId: 'photo-first-draft' }), firstImage), { expectedRevisionId: null });
  const secondImage = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) };
  secondImage.rgba.set([230, 40, 60, 255]);
  for (let pixel = 1; pixel < 256; pixel += 1) secondImage.rgba.set([20, 100, 180, 255], pixel * 4);
  const second = await store.save(await putPxdSharedImage(createPxdProject({ projectId: 'photo-second', revisionId: 'photo-second-draft' }), secondImage), { expectedRevisionId: null });
  assert.notEqual(first.projectId, second.projectId);
  assert.deepEqual((await readPxdSharedImage(await store.load(first.projectId))).rgba, firstImage.rgba);
  assert.deepEqual((await readPxdSharedImage(await store.load(second.projectId))).rgba, secondImage.rgba);
  const draw = await readPxdDrawDocument(second, 'main');
  assert.deepEqual(draw.palette, ['#e6283cff', '#1464b4ff']);
  const music = prepareSharedAudioImageImport(createAudioSong({ songId: 'photo-second-song' }), secondImage);
  assert.equal(Object.keys(music.link.colorToSlot)[0], 'rgba-1464b4ff');
});

test('one shared PXD image flows Draw → Music → Hidden/Jigsaw/Spot without image copies', async () => {
  let revision = 0;
  const store = createPxdStore({ adapter: createMemoryPxdAdapter(), idFactory: (id) => `integration-${id}-${++revision}` });
  const editor = { draw: null, song: null, audioImage: null, audioLink: null };
  const session = createProjectSession({ store,
    async capture(base) {
      const state = structuredClone(editor);
      let next = await putPxdDrawDocument(base, state.draw, 'main');
      if (state.song) next = await writePxdAudioState(next, state.song, { image: state.audioImage, link: state.audioLink });
      return next;
    },
    async apply(project) { editor.draw = await readPxdDrawDocument(project, 'main'); }
  });
  let project = createPxdProject({ projectId: 'shared-integration', revisionId: 'unpersisted', manifest: { title: 'Shared Integration', createdAt: 1 }, entries: [{ path: 'future/opaque.json', bytes: new TextEncoder().encode('{"keep":true}') }], opaquePayloads: [{ bytes: new Uint8Array([1, 9, 255]) }] });
  editor.draw = createDrawDocument(16); editor.draw.pixels.fill(2);
  await session.initialize(project, { persisted: false });
  await session.save();
  let head = await store.load('shared-integration');
  const originalRevision = head.revisionId;
  const originalRaw = new Uint8Array((await readPxdSharedImage(head)).rgba);

  // An explicit canvas-setting confirmation creates a new revision under the same ID.
  const targetPixels = new Uint8Array(32 * 16 * 4);
  for (let offset = 0; offset < targetPixels.length; offset += 4) targetPixels.set([231, 84, 69, 255], offset);
  project = await putPxdDrawDocument(head, editor.draw, 'main');
  project = await putPxdSharedImage(project, { width: 32, height: 16, rgba: targetPixels });
  await session.replace(project, { apply: true });
  await session.save();
  head = await store.load('shared-integration');
  assert.equal(head.projectId, 'shared-integration'); assert.notEqual(head.revisionId, originalRevision);
  assert.equal((await readPxdSharedImage(await store.load('shared-integration', originalRevision))).width, 16);
  assert.deepEqual((await readPxdSharedImage(head)).rgba, targetPixels);
  assert.deepEqual(head.entries.filter(({ path }) => path.endsWith('/pixels.rgba')).map(({ path }) => path), ['images/main/pixels.rgba']);

  // Music derives notes from the same main bytes; its link/state contain no image payload.
  const sharedImage = await readPxdSharedImage(head);
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'shared-song' }), sharedImage);
  editor.song = setAudioTempo(plan.song, 60);
  editor.song = setAudioPixelPalette(editor.song, { slotId: 'square', color: '#e75445', instrument: 'warm-pad' });
  editor.audioImage = sharedImage; editor.audioLink = plan.link;
  await session.save(); head = await store.load('shared-integration');
  const audioLink = readPxdAudioLink(head);
  assert.equal(audioLink.imageRole, 'main'); assert.equal(audioLink.rulesVersion, 'shared-canvas-v1');
  assert.equal(readPxdAudioState(head).tempo, 60);
  assert.equal(readPxdAudioState(head).pixelPalette.find(({ slotId }) => slotId === 'square').instrument, 'warm-pad');
  validatePxdAudioBinding(readPxdAudioState(head), await readPxdSharedImage(head), audioLink);
  assert.equal(head.entries.some(({ path }) => path.startsWith('images/audio/')), false);

  // Puzzle roles point at main; only Spot's intentional before snapshot is stored separately.
  const draw = await readPxdDrawDocument(head, 'main'); const ref = sourceRef('shared');
  const hiddenDocument = createHiddenObjectDraft({ gameId: 'shared-hidden', source: ref, width: 32, height: 16, targets: [] });
  head = await writePxdPuzzle(head, { tool: 'hidden_object', document: hiddenDocument, sourceDrawDocuments: { hidden: draw } });
  const layout = createJigsawLayout({ width: 32, height: 16, pieceSize: 'auto', seed: 'shared-jigsaw' });
  const jigsawDocument = createJigsawWorkspace({ gameId: 'shared-jigsaw', source: ref, layout, seed: 'shared-jigsaw' });
  head = await writePxdPuzzle(head, { tool: 'jigsaw', document: jigsawDocument, sourceDrawDocuments: { 'jigsaw-main': draw } });
  const before = structuredClone(draw); before.palette.push('#4c82c3'); strokePixels(before, { x: 0, y: 0 }, { x: 0, y: 0 }, before.palette.length - 1);
  const spotDocument = { schemaVersion: 1, gameId: 'shared-spot', width: 32, height: 16, before: ref, after: ref, candidates: [], confirmed: false, publication: 'draft', published: false };
  head = await writePxdPuzzle(head, { tool: 'spot_difference', document: spotDocument, sourceDrawDocuments: { 'spot-before': before, 'spot-after': draw } });
  const persisted = await store.save(head, { expectedRevisionId: (await store.load('shared-integration')).revisionId });
  await session.adopt(persisted, { persisted: true, apply: true });
  const reopened = await store.load('shared-integration'); const canonical = await readPxdSharedImage(reopened);
  assert.deepEqual(canonical.rgba, documentRgba(draw));
  for (const [tool, role] of [['hidden_object', 'hidden'], ['jigsaw', 'jigsaw-main'], ['spot_difference', 'spot-after']]) {
    const result = await readPxdPuzzle(reopened, tool);
    assert.deepEqual(result.images[role].rgba, canonical.rgba);
    assert.deepEqual(result.images[role].drawDocument && documentRgba(result.images[role].drawDocument), canonical.rgba);
  }
  assert.equal(reopened.entries.some(({ path }) => path.startsWith('images/hidden/')), false);
  assert.equal(reopened.entries.some(({ path }) => path.startsWith('images/jigsaw-main/')), false);
  assert.equal(reopened.entries.some(({ path }) => path.startsWith('images/spot-after/')), false);
  assert.equal(reopened.entries.some(({ path }) => path === 'images/spot-before/pixels.rgba'), true);
  assert.equal((await readPxdImage(reopened, 'main')).rgba.length, canonical.rgba.length);
  assert.deepEqual(reopened.entries.find(({ path }) => path === 'future/opaque.json').bytes, new TextEncoder().encode('{"keep":true}'));
  assert.deepEqual(reopened.opaquePayloads[0].bytes, new Uint8Array([1, 9, 255]));
  assert.deepEqual(originalRaw.length, 16 * 16 * 4);
});
