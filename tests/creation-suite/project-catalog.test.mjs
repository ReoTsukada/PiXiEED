import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { createAudioSong, setAudioPixel } from '../../js/creation/audio-core.mjs';
import { putPxdImage, readPxdImage } from '../../js/creation/pxd-project.mjs';
import { createMemoryPxdAdapter, createPxdStore } from '../../js/creation/pxd-store.mjs';
import { forkProject, sanitizeProjectTitle, summarizeProject } from '../../js/creation/project-catalog.mjs';

function sequence(prefix = 'saved') { let index = 0; return () => `${prefix}-${++index}`; }

function image(width, height, rgba) { return { width, height, rgba: Uint8Array.from(rgba) }; }

test('project titles remove control characters and cap visible names at sixty code points', () => {
  assert.equal(sanitizeProjectTitle('  はじめ\u0000\u202e作品  '), 'はじめ作品');
  assert.equal(Array.from(sanitizeProjectTitle('絵'.repeat(80))).length, 60);
  assert.equal(sanitizeProjectTitle(' \n\t '), '無題の作品');
});

test('summary uses the primary original image and emits a nearest-sampled RGB thumbnail without a DOM', async () => {
  const rgba = Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 0, 0, 0, 255, 255
  ]);
  let project = createPxdProject({ projectId: 'summary-project', revisionId: 'summary-r0', manifest: { title: '  星\u0007の絵 ', createdAt: 1234, lastMode: 'draw' } });
  project = await putPxdImage(project, image(2, 2, rgba), 'main');
  const summary = await summarizeProject(project);
  assert.equal(summary.name, '星の絵');
  assert.equal(summary.createdAt, 1234);
  assert.equal(summary.lastMode, 'draw');
  assert.equal(summary.width, 2);
  assert.equal(summary.height, 2);
  assert.equal(summary.hasDrawing, true);
  assert.equal(summary.hasAudio, false);
  assert.deepEqual(summary.thumbnail, { width: 2, height: 2, rgb: new Uint8Array([255, 0, 0, 0, 255, 0, 255, 255, 255, 0, 0, 255]) });
  assert.ok(summary.thumbnail.rgb instanceof Uint8Array);
});

test('fork deep-copies images, audio, unknown entries, opaque payloads and manifest without mutating source', async () => {
  let source = createPxdProject({
    projectId: 'fork-source', revisionId: 'fork-r0',
    manifest: { title: '元の作品', createdAt: 100, lastMode: 'audio', importedFrom: { projectId: 'outside-source' }, futureManifest: { keep: true } },
    entries: [{ path: 'future/opaque-state.bin', vendor: 'future-tool', bytes: new Uint8Array([4, 5, 6]) }],
    opaquePayloads: [{ bytes: new Uint8Array([90, 91, 92]) }]
  });
  source = await putPxdImage(source, image(2, 1, [255, 0, 0, 255, 0, 0, 255, 255]), 'main');
  const song = setAudioPixel(createAudioSong({ songId: 'fork-song', title: 'ひみつの曲' }), { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'fork-note' });
  source = setPxdJson(source, 'audio/state.json', song);
  const original = structuredClone(source);
  const fork = forkProject(source, { projectId: 'fork-copy', revisionId: 'fork-copy-r0', title: '複製した作品', now: 500 });

  assert.equal(fork.projectId, 'fork-copy');
  assert.equal(fork.revisionId, 'fork-copy-r0');
  assert.deepEqual(fork.manifest, { ...source.manifest, title: '複製した作品', createdAt: 500 });
  assert.deepEqual(getPxdJson(fork, 'audio/state.json'), song);
  assert.deepEqual((await readPxdImage(fork)).rgba, (await readPxdImage(source)).rgba);
  assert.deepEqual(fork.entries.find((entry) => entry.path === 'future/opaque-state.bin'), source.entries.find((entry) => entry.path === 'future/opaque-state.bin'));
  assert.deepEqual(fork.opaquePayloads, source.opaquePayloads);

  fork.entries.find((entry) => entry.path === 'future/opaque-state.bin').bytes[0] = 0;
  fork.opaquePayloads[0].bytes[0] = 0;
  assert.deepEqual(source, original);
});

test('store lists one latest metadata record per project and keeps clone history and content independent', async () => {
  const adapter = createMemoryPxdAdapter();
  const store = createPxdStore({ adapter, idFactory: sequence() });
  let original = createPxdProject({
    projectId: 'catalog-original', revisionId: 'source-r0', manifest: { title: '原作', createdAt: 10, lastMode: 'audio' },
    entries: [{ path: 'future/opaque.bin', bytes: new Uint8Array([1, 2, 3]) }],
    opaquePayloads: [{ bytes: new Uint8Array([9, 8, 7]) }]
  });
  original = await putPxdImage(original, image(1, 1, [3, 4, 5, 255]), 'main');
  original = setPxdJson(original, 'audio/state.json', setAudioPixel(createAudioSong({ songId: 'catalog-song' }), { trackId: 'track-square', pitch: 60, startTick: 0, noteId: 'catalog-note' }));
  const first = await store.save(original, { expectedRevisionId: null });
  const clone = await store.save(forkProject(first, { projectId: 'catalog-clone', revisionId: 'clone-r0', title: '複製', now: 20 }), { expectedRevisionId: null });

  const edited = await putPxdImage(first, image(1, 1, [200, 201, 202, 255]), 'main');
  const latestOriginal = await store.save(edited, { expectedRevisionId: first.revisionId });
  const originalIds = await adapter.listRevisionIds('catalog-original');
  assert.deepEqual(originalIds, ['saved-1', 'saved-3']);
  assert.deepEqual(await adapter.listRevisionIds('catalog-clone'), ['saved-2']);

  const record = await adapter.read('catalog-original');
  const cloneRecord = await adapter.read('catalog-clone');
  assert.ok(Number.isFinite(record.updatedAt));
  assert.equal(record.summary.name, '原作');
  assert.equal(record.summary.hasAudio, true);
  const listing = await store.listProjects();
  assert.deepEqual(listing.errors, []);
  const expectedOrder = [
    { projectId: 'catalog-original', updatedAt: record.updatedAt },
    { projectId: 'catalog-clone', updatedAt: cloneRecord.updatedAt }
  ].sort((left, right) => right.updatedAt - left.updatedAt || left.projectId.localeCompare(right.projectId));
  assert.deepEqual(listing.projects.map((item) => item.projectId), expectedOrder.map((item) => item.projectId));
  const listedOriginal = listing.projects.find((item) => item.projectId === 'catalog-original');
  const listedClone = listing.projects.find((item) => item.projectId === 'catalog-clone');
  assert.equal(listedOriginal.revisionId, latestOriginal.revisionId);
  assert.equal(listedOriginal.summary.thumbnail.width, 1);
  assert.deepEqual(listedOriginal.summary.thumbnail.rgb, new Uint8Array([200, 201, 202]));
  assert.equal(listedClone.revisionId, clone.revisionId);
  assert.deepEqual((await readPxdImage(await store.load('catalog-clone'))).rgba, new Uint8Array([3, 4, 5, 255]));
  assert.deepEqual(getPxdJson(await store.load('catalog-clone'), 'audio/state.json').tracks[0].clips[0].notes[0].noteId, 'catalog-note');
  assert.deepEqual(await adapter.listRevisionIds('catalog-original'), originalIds);
});

test('failed CAS writes leave the catalog on the last committed project set', async () => {
  const adapter = createMemoryPxdAdapter({ failWrites: true });
  const store = createPxdStore({ adapter, idFactory: sequence('failed') });
  const input = createPxdProject({ projectId: 'failed-project', revisionId: 'failed-r0', manifest: { title: '未保存' } });
  await assert.rejects(store.save(input, { expectedRevisionId: null }), { code: 'PXD_STORE_WRITE_FAILED' });
  assert.deepEqual(await store.listProjects(), { projects: [], errors: [] });
});

test('legacy records without summary are decoded for fallback and corrupt records do not hide healthy projects', async () => {
  const backing = createMemoryPxdAdapter();
  const legacyAdapter = {
    read: (...args) => backing.read(...args),
    compareAndSwap: (projectId, expected, record) => backing.compareAndSwap(projectId, expected, { revisionId: record.revisionId, bytes: record.bytes }),
    listLatest: (...args) => backing.listLatest(...args)
  };
  const store = createPxdStore({ adapter: legacyAdapter, idFactory: sequence('legacy-save') });
  let old = createPxdProject({ projectId: 'legacy-good', revisionId: 'legacy-r0', manifest: { title: '昔の作品', createdAt: 50, lastMode: 'draw' } });
  old = await putPxdImage(old, image(1, 1, [1, 2, 3, 255]));
  await store.save(old, { expectedRevisionId: null });
  const newer = createPxdProject({ projectId: 'corrupt-item', revisionId: 'corrupt-r0', manifest: { title: '壊れた作品' } });
  await backing.compareAndSwap(newer.projectId, null, { revisionId: newer.revisionId, bytes: new Uint8Array([1, 2, 3]) });

  const listing = await store.listProjects();
  assert.deepEqual(listing.projects.map((item) => item.projectId), ['legacy-good']);
  assert.equal(listing.projects[0].summary.name, '昔の作品');
  assert.equal(listing.projects[0].summary.width, 1);
  assert.deepEqual(listing.errors, [{ projectId: 'corrupt-item', revisionId: 'corrupt-r0', code: 'PXD_MAGIC_INVALID' }]);
});
