import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, decodePxd, encodePxd, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { createMemoryPxdAdapter, createPxdStore } from '../../js/creation/pxd-store.mjs';
import { createProjectSession } from '../../js/creation/project-session.mjs';
import { rebaseProjectEdits } from '../../js/creation/project-rebase.mjs';
import { createDrawDocument, documentRgba, strokePixels } from '../../js/creation/draw-core.mjs';
import { putPxdDrawDocument, readPxdImage } from '../../js/creation/pxd-project.mjs';
import { createAudioSong, setAudioTempo } from '../../js/creation/audio-core.mjs';
import { prepareSharedAudioImageImport, readPxdAudioLink, readPxdAudioState, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { replaceProjectComponentImage } from '../../js/creation/project-components.mjs';

async function setup() {
  let seq = 0;
  const store = createPxdStore({ adapter: createMemoryPxdAdapter(), idFactory: () => `refresh-r${++seq}` });
  const draw = createDrawDocument(16); strokePixels(draw, { x: 1, y: 1 }, { x: 1, y: 1 }, 2);
  let initial = await putPxdDrawDocument(createPxdProject({ projectId: 'refresh-project', revisionId: 'start' }), draw, 'main');
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'refresh-song' }), { width: 16, height: 16, rgba: documentRgba(draw) });
  initial = await writePxdAudioState(initial, plan.song, { image: plan.image, link: plan.link });
  initial = setPxdJson(initial, 'future/unknown.json', { keep: 7 });
  initial = await store.save(initial, { expectedRevisionId: null });
  let model = { song: plan.song, image: plan.image, link: plan.link };
  const session = createProjectSession({ store,
    capture: (base) => writePxdAudioState(base, model.song, { image: model.image, link: model.link }),
    async apply(project) { model = { song: readPxdAudioState(project), image: await readPxdImage(project, 'audio'), link: readPxdAudioLink(project) }; }
  });
  await session.initialize(initial, { persisted: true, apply: true });
  return { store, session, initial, draw, get model() { return model; } };
}

test('PXD serialization descriptors do not count as entry edits during a rebase', async () => {
  const base = createPxdProject({ projectId: 'descriptor-project', revisionId: 'r0', entries: [
    { path: 'audio/state.bin', kind: 'audio', bytes: new TextEncoder().encode('base') }
  ] });
  const local = createPxdProject({ projectId: base.projectId, revisionId: base.revisionId, entries: [
    { path: 'audio/state.bin', kind: 'audio', bytes: new TextEncoder().encode('local') }
  ] });
  const latest = await decodePxd(await encodePxd(base));
  assert.equal(typeof latest.entries[0].offset, 'number');
  assert.equal(typeof latest.entries[0].length, 'number');
  assert.match(latest.entries[0].sha256, /^[a-f0-9]{64}$/);

  const result = rebaseProjectEdits(base, local, latest);
  assert.deepEqual(result.entries[0].bytes, new TextEncoder().encode('local'));
  assert.equal(result.entries[0].kind, 'audio');

  const metadataConflict = structuredClone(latest);
  metadataConflict.entries[0].kind = 'remote-audio';
  assert.throws(() => rebaseProjectEdits(base, local, metadataConflict), { code: 'PXD_STORE_CONFLICT' });
});

test('returning to old music then updating its source uses newest drawing, preserving tempo and project', async () => {
  const env = await setup();
  env.model.song = setAudioTempo(env.model.song, 90); env.session.markDirty();
  const changedDraw = structuredClone(env.draw);
  strokePixels(changedDraw, { x: 8, y: 5 }, { x: 8, y: 5 }, 2);
  const drawHead = await env.store.save(await putPxdDrawDocument(env.initial, changedDraw, 'main'), { expectedRevisionId: env.initial.revisionId });
  await env.session.refreshLatest(rebaseProjectEdits);
  assert.equal(env.session.persistedProject.revisionId, drawHead.revisionId);
  assert.equal(env.model.song.tempo, 90);
  const updated = await env.session.save();
  const originalMain = await readPxdImage(updated, 'main');
  const replacement = await replaceProjectComponentImage(updated, 'audio', originalMain);
  await env.session.replace(replacement, { apply: true });
  const final = await env.session.save();
  assert.equal(final.projectId, env.initial.projectId);
  assert.equal(readPxdAudioState(final).tempo, 90);
  assert.deepEqual((await readPxdImage(final, 'audio')).rgba, documentRgba(changedDraw));
  assert.deepEqual((await readPxdImage(final, 'main')).rgba, documentRgba(changedDraw));
  assert.deepEqual(getPxdJson(final, 'future/unknown.json'), { keep: 7 });
  assert.deepEqual((await readPxdImage(await env.store.load(env.initial.projectId, env.initial.revisionId), 'main')).rgba, documentRgba(env.draw));
});

test('competing music edits refuse refresh and leave current song and latest stored song intact', async () => {
  const env = await setup();
  env.model.song = setAudioTempo(env.model.song, 90); env.session.markDirty();
  const remoteSong = setAudioTempo(readPxdAudioState(env.initial), 140);
  const remote = await env.store.save(await writePxdAudioState(env.initial, remoteSong, { image: env.model.image, link: env.model.link }), { expectedRevisionId: env.initial.revisionId });
  await assert.rejects(env.session.refreshLatest(rebaseProjectEdits), { code: 'PXD_STORE_CONFLICT' });
  assert.equal(env.model.song.tempo, 90);
  assert.equal(env.session.persistedProject.revisionId, env.initial.revisionId);
  assert.equal(readPxdAudioState(await env.store.load(env.initial.projectId)).tempo, 140);
  assert.equal((await env.store.load(env.initial.projectId)).revisionId, remote.revisionId);
});

test('source refresh cannot recreate a deleted project', async () => {
  const env = await setup();
  await env.store.deleteProject(env.initial.projectId, { expectedRevisionId: env.initial.revisionId });
  await assert.rejects(env.session.refreshLatest(rebaseProjectEdits), { code: 'PXD_PROJECT_UNAVAILABLE' });
  assert.equal(await env.store.load(env.initial.projectId), null);
  assert.equal(env.session.currentProject.revisionId, env.initial.revisionId);
});
