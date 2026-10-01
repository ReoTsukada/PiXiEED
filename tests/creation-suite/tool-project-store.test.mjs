import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { createMemoryPxdAdapter, createPxdStore } from '../../js/creation/pxd-store.mjs';
import { createToolProjectStore } from '../../js/creation/tool-project-store.mjs';

const revisions = (prefix) => { let index = 0; return () => `${prefix}-${++index}`; };
function sourceProject(projectId, manifest = {}) {
  return createPxdProject({ projectId, revisionId: `${projectId}-initial`, manifest: { title: projectId, ...manifest },
    entries: [{ path: 'future/payload.bin', bytes: new Uint8Array([2, 4, 8, 16]) }], opaquePayloads: [{ bytes: new Uint8Array([9, 7, 5]) }] });
}

test('Draw and Audio wrappers list, delete, and restore only their own projects', async () => {
  const adapter = createMemoryPxdAdapter();
  const draw = createToolProjectStore('draw', { adapter, idFactory: revisions('draw-rev') });
  const audio = createToolProjectStore('audio', { adapter, idFactory: revisions('audio-rev') });
  const drawProject = await draw.save(sourceProject('tool-draw'), { expectedRevisionId: null });
  const audioProject = await audio.save(sourceProject('tool-audio'), { expectedRevisionId: null });
  assert.deepEqual(drawProject.manifest.toolProject, { tool: 'draw', schemaVersion: 1 });
  assert.deepEqual(audioProject.manifest.toolProject, { tool: 'audio', schemaVersion: 1 });
  assert.deepEqual((await draw.listProjects()).projects.map(({ projectId }) => projectId), ['tool-draw']);
  assert.deepEqual((await audio.listProjects()).projects.map(({ projectId }) => projectId), ['tool-audio']);

  await draw.deleteProject('tool-draw', { expectedRevisionId: drawProject.revisionId });
  assert.deepEqual((await draw.listProjects()).projects, []);
  assert.deepEqual((await draw.listProjects({ includeDeleted: true })).projects.map(({ projectId }) => projectId), ['tool-draw']);
  const restored = await draw.restoreProject('tool-draw', { expectedRevisionId: drawProject.revisionId });
  assert.equal((await draw.load('tool-draw')).revisionId, restored.revisionId);
  assert.equal((await audio.load('tool-audio')).revisionId, audioProject.revisionId);
  assert.deepEqual((await audio.listProjects()).projects.map(({ projectId }) => projectId), ['tool-audio']);
});

test('foreign and untagged projects cannot be loaded, saved, deleted, or restored through the wrapper', async () => {
  const adapter = createMemoryPxdAdapter(); const raw = createPxdStore({ adapter, idFactory: revisions('raw') });
  const draw = createToolProjectStore('draw', { adapter, idFactory: revisions('draw') });
  const foreign = await raw.save(sourceProject('foreign', { toolProject: { tool: 'audio', schemaVersion: 1 } }), { expectedRevisionId: null });
  const legacy = await raw.save(sourceProject('legacy-unmarked'), { expectedRevisionId: null });
  const foreignBefore = await adapter.read('foreign');
  await assert.rejects(() => draw.load('foreign'), { code: 'PXD_TOOL_PROJECT_FOREIGN' });
  await assert.rejects(() => draw.save(foreign, { expectedRevisionId: foreign.revisionId }), { code: 'PXD_TOOL_PROJECT_FOREIGN' });
  const disguisedForeign = { ...foreign, manifest: { ...foreign.manifest, toolProject: { tool: 'draw', schemaVersion: 1 } } };
  await assert.rejects(() => draw.save(disguisedForeign, { expectedRevisionId: foreign.revisionId }), { code: 'PXD_TOOL_PROJECT_FOREIGN' });
  assert.deepEqual(await adapter.read('foreign'), foreignBefore);
  await assert.rejects(() => draw.deleteProject('foreign', { expectedRevisionId: foreign.revisionId }), { code: 'PXD_TOOL_PROJECT_FOREIGN' });
  await assert.rejects(() => draw.load('legacy-unmarked'), { code: 'PXD_TOOL_PROJECT_UNTAGGED' });
  assert.deepEqual((await draw.listProjects()).projects, []);
  assert.deepEqual(new Set((await draw.listImportSources()).projects.map(({ projectId }) => projectId)), new Set(['foreign', 'legacy-unmarked']));
  assert.equal((await draw.loadImportSource('legacy-unmarked')).revisionId, legacy.revisionId);
  assert.equal((await raw.load('legacy-unmarked')).revisionId, legacy.revisionId);
  assert.deepEqual(await adapter.read('foreign'), foreignBefore);

  await raw.deleteProject('foreign', { expectedRevisionId: foreign.revisionId });
  await assert.rejects(() => draw.restoreProject('foreign', { expectedRevisionId: foreign.revisionId }), { code: 'PXD_TOOL_PROJECT_FOREIGN' });
  const foreignAfter = (await adapter.listLatest()).find(({ projectId }) => projectId === 'foreign');
  assert.equal(foreignAfter.revisionId, foreignBefore.revisionId);
  assert.deepEqual(foreignAfter.bytes, foreignBefore.bytes);
  assert.equal(Number.isFinite(foreignAfter.deletedAt), true);
});

test('explicit import forks IDs, mode/editor state and payload bytes without changing source', async () => {
  const adapter = createMemoryPxdAdapter(); const raw = createPxdStore({ adapter, idFactory: revisions('raw') });
  const draw = createToolProjectStore('draw', { adapter, idFactory: revisions('draw') });
  const source = await raw.save(sourceProject('import-source', {
    lastMode: 'audio', editorState: { draw: { zoom: 3 }, audio: { cursor: 20 }, hidden_object: { target: 'foreign' } },
    toolProject: { tool: 'audio', schemaVersion: 1 }
  }), { expectedRevisionId: null });
  const originalBytes = new Uint8Array(source.entries.find(({ path }) => path === 'future/payload.bin').bytes);
  const copy = draw.cloneAsToolProject(source, { projectId: 'copy-draw', revisionId: 'copy-initial', now: 1234 });
  assert.notEqual(copy.projectId, source.projectId);
  assert.notEqual(copy.revisionId, source.revisionId);
  assert.deepEqual(copy.manifest.toolProject, { tool: 'draw', schemaVersion: 1 });
  assert.equal(copy.manifest.lastMode, 'draw');
  assert.deepEqual(copy.manifest.editorState, { draw: { zoom: 3 } });
  const savedCopy = await draw.save(copy, { expectedRevisionId: null });
  assert.equal((await draw.load(savedCopy.projectId)).revisionId, savedCopy.revisionId);
  assert.deepEqual(source.entries.find(({ path }) => path === 'future/payload.bin').bytes, originalBytes);
  assert.deepEqual((await raw.load(source.projectId)).entries.find(({ path }) => path === 'future/payload.bin').bytes, originalBytes);
  assert.deepEqual(savedCopy.entries.find(({ path }) => path === 'future/payload.bin').bytes, originalBytes);
  assert.deepEqual(savedCopy.opaquePayloads[0].bytes, source.opaquePayloads[0].bytes);
});

test('untagged legacy data remains raw-readable and is not adopted by an ordinary wrapper save', async () => {
  const adapter = createMemoryPxdAdapter(); const raw = createPxdStore({ adapter, idFactory: revisions('raw') });
  const draw = createToolProjectStore('draw', { adapter, idFactory: revisions('draw') });
  const legacy = await raw.save(sourceProject('legacy-copy-source'), { expectedRevisionId: null });
  const rawBefore = await adapter.read('legacy-copy-source');
  await assert.rejects(() => draw.save(legacy, { expectedRevisionId: null }), { code: 'PXD_TOOL_PROJECT_UNTAGGED' });
  assert.deepEqual(await adapter.read('legacy-copy-source'), rawBefore);
  assert.equal((await draw.loadImportSource('legacy-copy-source')).revisionId, legacy.revisionId);
});
