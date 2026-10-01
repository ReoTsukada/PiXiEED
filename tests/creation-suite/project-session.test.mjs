import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryPxdAdapter, createPxdStore } from '../../js/creation/pxd-store.mjs';
import { createPxdProject, setPxdBytes } from '../../js/creation/pxd-codec.mjs';
import { createProjectSession } from '../../js/creation/project-session.mjs';
import { createDrawDocument, documentRgba } from '../../js/creation/draw-core.mjs';
import { createAudioSong, setAudioPixelPalette, setAudioTempo } from '../../js/creation/audio-core.mjs';
import { audioSongImage, preparePxdAudioImageImport, readPxdAudioLink, readPxdAudioState, writePxdAudioState, readPxdDrawDocument, writePxdDrawDocument } from '../../js/creation/pxd-draw-audio.mjs';
import { putPxdSharedImage, readPxdImage, readPxdSharedImage } from '../../js/creation/pxd-project.mjs';
import { forkProject } from '../../js/creation/project-catalog.mjs';

function project(id, text = 'a', opaque = [9, 8]) {
  return createPxdProject({ projectId: id, revisionId: `revision-${id}`, manifest: { title: id, createdAt: 1 }, entries: [{ path: 'data.bin', bytes: new Uint8Array([text.charCodeAt(0)]) }], opaquePayloads: [{ bytes: new Uint8Array(opaque) }] });
}
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(overrides = {}) {
  const store = createPxdStore({ adapter: createMemoryPxdAdapter(), idFactory: (id) => `revision-${id}-${Math.random().toString(36).slice(2, 8)}` });
  let model;
  const session = createProjectSession({ store, capture: async (snapshot) => snapshot, apply: async (next) => { model = next; }, ...overrides });
  return { session, store, get model() { return model; } };
}

test('serial saves use the latest CAS revision and a stale A completion cannot replace active B', async () => {
  const gate = deferred(); const savedIds = [];
  const base = setup({ capture(snapshot) { if (snapshot.projectId === 'A' && savedIds.length === 0) return gate.promise; return snapshot; }, blank: () => project('B'), onChange() {} });
  const saveImpl = base.store.save.bind(base.store);
  base.store.save = async (...args) => { const result = await saveImpl(...args); savedIds.push(result.projectId); return result; };
  await base.session.initialize(project('A'));
  const oldSave = base.session.save();
  base.session.reset();
  const newSave = base.session.save();
  gate.resolve(project('A', 'b'));
  await assert.rejects(oldSave, { code: 'PROJECT_SESSION_STALE' });
  await newSave;
  assert.deepEqual(savedIds, ['B']); assert.equal(base.session.currentProject.projectId, 'B');
});

test('edits during async capture remain dirty after the captured version saves', async () => {
  const gate = deferred(); const env = setup({ capture: () => gate.promise });
  await env.session.initialize(project('edit'));
  const saving = env.session.save(); env.session.markDirty(); gate.resolve(project('edit', 'b'));
  await saving; assert.equal(env.session.dirty, true);
});

test('a captured candidate with another project id is refused before CAS', async () => {
  let writes = 0; const env = setup({ capture: () => project('other') });
  const originalSave = env.store.save.bind(env.store); env.store.save = (...args) => { writes += 1; return originalSave(...args); };
  await env.session.initialize(project('bound'));
  await assert.rejects(env.session.save(), { code: 'PROJECT_SESSION_ID_MISMATCH' }); assert.equal(writes, 0);
});

test('a CAS conflict keeps both the current project and persisted head unchanged', async () => {
  const env = setup(); const store = env.store;
  const initial = project('conflict'); const first = await store.save(initial);
  await env.session.initialize(first, { persisted: true });
  env.session.currentProject.entries[0].bytes[0] = 98; env.session.markDirty();
  const competing = await store.save({ ...first, entries: [{ ...first.entries[0], bytes: new Uint8Array([99]) }] }, { expectedRevisionId: first.revisionId });
  await assert.rejects(env.session.save(), { code: 'PXD_STORE_CONFLICT' });
  assert.equal(env.session.currentProject.entries[0].bytes[0], 98); assert.equal(env.session.persistedProject.revisionId, first.revisionId);
  assert.equal((await store.load('conflict')).revisionId, competing.revisionId);
});

test('failed apply leaves the previously adopted identity in place', async () => {
  let fail = false; const env = setup({ apply: async (next) => { if (fail) throw new Error('apply failed'); } });
  await env.session.initialize(project('kept')); fail = true;
  await assert.rejects(env.session.adopt(project('rejected'))); assert.equal(env.session.currentProject.projectId, 'kept');
});

test('reset invalidates a pending capture and binds the fresh blank identity immediately', async () => {
  const gate = deferred(); const env = setup({ capture: () => gate.promise, blank: () => project('blank') });
  await env.session.initialize(project('old'));
  const saving = env.session.save(); const fresh = env.session.reset(); gate.resolve(project('old', 'b'));
  await assert.rejects(saving, { code: 'PROJECT_SESSION_STALE' });
  assert.equal(env.session.currentProject, fresh); assert.equal(env.session.currentProject.projectId, 'blank');
});

test('capture snapshots and save results own their entry and opaque byte arrays', async () => {
  let captured; const env = setup({ capture: (snapshot) => { captured = snapshot; return snapshot; } }); const source = project('clone');
  await env.session.initialize(source); source.entries[0].bytes[0] = 120; source.opaquePayloads[0].bytes[0] = 120;
  const result = await env.session.save();
  assert.equal(captured.entries[0].bytes[0], 97); assert.equal(captured.opaquePayloads[0].bytes[0], 9);
  captured.entries[0].bytes[0] = 122; captured.opaquePayloads[0].bytes[0] = 122;
  assert.equal(result.entries[0].bytes[0], 97); assert.equal(result.opaquePayloads[0].bytes[0], 9);
  assert.notEqual(result.entries[0].bytes, env.session.persistedProject.entries[0].bytes);
});

test('unchanged persisted content skips a revision write while opaque changes are content changes', async () => {
  const env = setup(); const initial = await env.store.save(project('same'));
  await env.session.initialize(initial, { persisted: true });
  let writes = 0; const originalSave = env.store.save.bind(env.store); env.store.save = (...args) => { writes += 1; return originalSave(...args); };
  env.session.currentProject.manifest.updatedAt = 12345;
  await env.session.save(); assert.equal(writes, 0);
  env.session.currentProject.opaquePayloads[0].bytes[0] = 7; env.session.markDirty();
  await env.session.save(); assert.equal(writes, 1);
});

test('persisted getter and a rejected capture remain safe while waiting behind a queued save', async () => {
  const gate = deferred(); let count = 0;
  const env = setup({ capture(snapshot) { count += 1; return count === 1 ? gate.promise : Promise.reject(new Error('capture failed')); } });
  await env.session.initialize(project('queued'));
  const first = env.session.save(); const second = env.session.save();
  assert.equal(env.session.persisted, false);
  gate.resolve(project('queued', 'b'));
  await first; await assert.rejects(second, /capture failed/);
  assert.equal(env.session.persisted, true);
});

test('unchanged content still detects a newer tab head and preserves the open copy', async () => {
  const env = setup(); const original = await env.store.save(project('cross-tab'));
  await env.session.initialize(original, { persisted: true });
  const sessionBytes = new Uint8Array(env.session.currentProject.entries[0].bytes);
  await env.store.save({ ...original, entries: [{ ...original.entries[0], bytes: new Uint8Array([120]) }] }, { expectedRevisionId: original.revisionId });
  let sessionWrites = 0; const realSave = env.store.save.bind(env.store);
  env.store.save = (...args) => { sessionWrites += 1; return realSave(...args); };
  await assert.rejects(env.session.save(), { code: 'PXD_STORE_CONFLICT', message: /別のタブで更新されています/ });
  assert.equal(sessionWrites, 0); assert.deepEqual(env.session.currentProject.entries[0].bytes, sessionBytes);
  assert.equal(env.session.persistedProject.revisionId, original.revisionId);
});

test('a deleted unchanged session refuses to save and cannot silently fork when opening another project', async () => {
  const env = setup(); const original = await env.store.save(project('deleted-session'));
  await env.session.initialize(original, { persisted: true });
  await env.store.deleteProject(original.projectId, { expectedRevisionId: original.revisionId });
  await assert.rejects(env.session.save(), { code: 'PXD_PROJECT_UNAVAILABLE' });
  assert.equal(await env.store.load(original.projectId), null);
  assert.equal(env.session.currentProject.projectId, original.projectId);
  assert.equal((await env.store.listProjects()).projects.length, 0);
});

test('shared canvas setting writes the same project ID with CAS and keeps the prior revision readable', async () => {
  let sequence = 0;
  const store = createPxdStore({ adapter: createMemoryPxdAdapter(), idFactory: (id) => `canvas-revision-${id}-${++sequence}` });
  let model;
  const session = createProjectSession({ store,
    capture: (base) => writePxdDrawDocument(base, model, 'main'),
    async apply(project) { model = await readPxdDrawDocument(project, 'main'); }
  });
  const draw = createDrawDocument(16); draw.pixels.fill(2);
  let initial = await writePxdDrawDocument(createPxdProject({ projectId: 'canvas-setting', revisionId: 'canvas-source', manifest: { title: 'Canvas', createdAt: 1 } }), draw, 'main');
  initial = await store.save(initial, { expectedRevisionId: null });
  const oldRevision = initial.revisionId;
  await session.initialize(initial, { persisted: true, apply: true });
  const resized = await putPxdSharedImage(initial, { width: 32, height: 16, rgba: new Uint8Array(32 * 16 * 4).map((_, index) => index % 4 === 3 ? 255 : index % 4 === 0 ? 231 : index % 4 === 1 ? 84 : 69) });
  await session.replace(resized, { apply: true });
  const updated = await session.save();
  const oldHead = await store.load('canvas-setting', oldRevision);
  const currentHead = await store.load('canvas-setting');
  assert.equal(updated.projectId, 'canvas-setting'); assert.notEqual(updated.revisionId, oldRevision);
  assert.equal((await readPxdSharedImage(oldHead)).width, 16);
  assert.equal((await readPxdSharedImage(currentHead)).width, 32);
  assert.deepEqual(currentHead.entries.filter(({ path }) => path.endsWith('/pixels.rgba')).map(({ path }) => path), ['images/main/pixels.rgba']);
  assert.equal(session.persistedProject.revisionId, currentHead.revisionId);
});

test('shared canvas edit reports a stale-tab CAS conflict without replacing the edited canvas or saved head', async () => {
  const store = createPxdStore({ adapter: createMemoryPxdAdapter(), idFactory: (() => { let n = 0; return (id) => `canvas-conflict-${id}-${++n}`; })() });
  let model;
  const session = createProjectSession({ store, capture: (base) => writePxdDrawDocument(base, model, 'main'), async apply(project) { model = await readPxdDrawDocument(project, 'main'); } });
  const doc = createDrawDocument(16); doc.pixels.fill(2);
  const base = await store.save(await writePxdDrawDocument(createPxdProject({ projectId: 'canvas-conflict', revisionId: 'source' }), doc, 'main'), { expectedRevisionId: null });
  await session.initialize(base, { persisted: true, apply: true });
  const rgba = new Uint8Array(32 * 16 * 4); for (let i = 0; i < rgba.length; i += 4) rgba.set([231, 84, 69, 255], i);
  const edited = await putPxdSharedImage(base, { width: 32, height: 16, rgba });
  await session.replace(edited, { apply: true });
  const competing = await store.save({ ...base, manifest: { ...base.manifest, title: '別タブの作品名' } }, { expectedRevisionId: base.revisionId });
  await assert.rejects(session.save(), { code: 'PXD_STORE_CONFLICT' });
  assert.equal(session.currentProject.projectId, 'canvas-conflict');
  assert.equal((await readPxdSharedImage(session.currentProject)).width, 32);
  assert.equal(session.persistedProject.revisionId, base.revisionId);
  assert.equal((await store.load('canvas-conflict')).revisionId, competing.revisionId);
});

test('real Draw and Audio project round trips stay isolated across A, B, reopen and catalog fork', async () => {
  let revision = 0;
  const store = createPxdStore({ adapter: createMemoryPxdAdapter(), idFactory: (id) => `revision-${id}-${++revision}` });
  const makeEditor = () => {
    const editor = { draw: null, song: null, image: null, link: null };
    const session = createProjectSession({ store,
      capture(base) {
        const frozen = structuredClone(editor);
        return (async () => {
          let next = base;
          if (frozen.draw) next = await writePxdDrawDocument(next, frozen.draw, 'main');
          if (frozen.song) next = await writePxdAudioState(next, frozen.song, { image: frozen.image, link: frozen.link });
          return next;
        })();
      },
      async apply(project) {
        editor.draw = await readPxdDrawDocument(project, 'main');
        editor.song = readPxdAudioState(project);
        editor.image = await readPxdImage(project, 'audio');
        editor.link = readPxdAudioLink(project);
      }
    });
    return { editor, session };
  };
  const initial = (id) => createPxdProject({ projectId: id, revisionId: `source-${id}`, manifest: { title: id, createdAt: 100 }, entries: [{ path: 'future/unknown.bin', bytes: new Uint8Array([4, 5, 6]) }], opaquePayloads: [{ bytes: new Uint8Array([0, 88, 255]) }] });
  const prepare = (draw, songId, tempo, color, instrument) => {
    const image = { width: draw.width, height: draw.height, rgba: documentRgba(draw) };
    const plan = preparePxdAudioImageImport(createAudioSong({ songId, tempo: 120 }), image);
    plan.song = setAudioTempo(plan.song, tempo);
    plan.song = setAudioPixelPalette(plan.song, { slotId: 'square', color, ...(instrument ? { instrument } : {}) });
    return plan;
  };

  const a = makeEditor(); await a.session.initialize(initial('integration-A'));
  a.editor.draw = createDrawDocument(16); a.editor.draw.pixels.fill(2);
  await a.session.save();
  let aImage = await readPxdImage(a.session.currentProject, 'main');
  const aPlan = prepare(a.editor.draw, 'song-A', 60, '#e75445', 'warm-pad');
  const aLink = structuredClone(aPlan.link);
  a.editor.song = aPlan.song; a.editor.image = aPlan.image; a.editor.link = aPlan.link;
  await a.session.save();
  const aHead = await store.load('integration-A');
  const aOriginalImage = await readPxdImage(aHead, 'main');
  const aAudioImage = await readPxdImage(aHead, 'audio');
  const aSong = readPxdAudioState(aHead);
  const aUnknown = new Uint8Array(aHead.entries.find(({ path }) => path === 'future/unknown.bin').bytes);
  const aOpaque = new Uint8Array(aHead.opaquePayloads[0].bytes);
  assert.equal(aImage.width, 16); assert.deepEqual(aOriginalImage.rgba, documentRgba(a.editor.draw));

  const b = makeEditor(); await b.session.initialize(initial('integration-B'));
  b.editor.draw = createDrawDocument(16); b.editor.draw.pixels.fill(15);
  await b.session.save();
  const bPlan = prepare(b.editor.draw, 'song-B', 180, '#27336b', null);
  b.editor.song = bPlan.song; b.editor.image = bPlan.image; b.editor.link = bPlan.link;
  await b.session.save();
  const bHead = await store.load('integration-B'); const bImage = await readPxdImage(bHead, 'main'); const bSong = readPxdAudioState(bHead);
  assert.deepEqual(bImage.rgba, documentRgba(b.editor.draw)); assert.equal(bSong.tempo, 180);

  const reopenedA = await store.load('integration-A'); await a.session.adopt(reopenedA, { persisted: true, apply: true });
  assert.deepEqual((await readPxdImage(a.session.currentProject, 'main')).rgba, aOriginalImage.rgba);
  assert.deepEqual(readPxdAudioState(a.session.currentProject), aSong);
  assert.deepEqual((await readPxdImage(a.session.currentProject, 'audio')).rgba, aAudioImage.rgba);
  assert.equal(readPxdAudioState(a.session.currentProject).tempo, 60);
  assert.equal(readPxdAudioState(a.session.currentProject).pixelPalette.find(({ slotId }) => slotId === 'square').instrument, 'warm-pad');
  assert.deepEqual(a.session.currentProject.entries.find(({ path }) => path === 'future/unknown.bin').bytes, aUnknown);
  assert.deepEqual(a.session.currentProject.opaquePayloads[0].bytes, aOpaque);

  const copyDraft = forkProject(a.session.currentProject, { projectId: 'integration-copy', revisionId: 'source-integration-copy', title: 'A copy', now: 500 });
  assert.notEqual(copyDraft.projectId, a.session.currentProject.projectId);
  const copyHead = await store.save(copyDraft, { expectedRevisionId: null });
  const copyDraw = await readPxdDrawDocument(copyHead, 'main'); copyDraw.palette.push('#00ee11'); copyDraw.pixels.fill(copyDraw.palette.length - 1);
  const changedCopy = await writePxdDrawDocument(copyHead, copyDraw, 'main');
  await store.save(changedCopy, { expectedRevisionId: copyHead.revisionId });
  const finalA = await store.load('integration-A'); const finalB = await store.load('integration-B'); const finalCopy = await store.load('integration-copy');
  assert.deepEqual((await readPxdImage(finalA, 'main')).rgba, aOriginalImage.rgba);
  assert.deepEqual(readPxdAudioState(finalA), aSong); assert.deepEqual(finalA.opaquePayloads[0].bytes, aOpaque);
  assert.deepEqual((await readPxdImage(finalB, 'main')).rgba, bImage.rgba); assert.equal(readPxdAudioState(finalB).tempo, 180);
  assert.notDeepEqual((await readPxdImage(finalCopy, 'main')).rgba, aOriginalImage.rgba);
  assert.deepEqual(audioSongImage(readPxdAudioState(finalA)).rgba, aAudioImage.rgba);
  assert.deepEqual(readPxdAudioLink(finalA), aLink);
});
