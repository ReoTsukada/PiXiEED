import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { rebaseProjectEdits } from '../../js/creation/project-rebase.mjs';

const bytes = (text) => new TextEncoder().encode(text);
function project({ revisionId = 'r0', manifest = {}, entries = [], opaque = [5, 6], extra = {} } = {}) {
  return createPxdProject({
    projectId: 'rebase-project', revisionId, manifest: { title: '作品', createdAt: 1, ...manifest },
    entries: entries.map(([path, text, metadata = {}]) => ({ path, ...metadata, bytes: bytes(text) })),
    opaquePayloads: opaque === null ? [] : [{ bytes: new Uint8Array(opaque) }],
    ...extra
  });
}
function entryText(value, path) { return new TextDecoder().decode(value.entries.find((entry) => entry.path === path).bytes); }

test('rebases local audio tempo onto a newer draw revision and preserves independent latest edits', () => {
  const base = project({ manifest: { lastMode: 'audio', editorState: { draw: { zoom: 1 }, audio: { cursor: 2 } }, untouched: { keep: true } }, entries: [
    ['draw/main.json', '{"pixel":1}'], ['audio/state.json', '{"tempo":100}'], ['future/blob.bin', 'opaque']
  ] });
  const local = project({ revisionId: 'r0', manifest: { lastMode: 'audio', editorState: { draw: { zoom: 1 }, audio: { cursor: 4 } }, untouched: { keep: true } }, entries: [
    ['draw/main.json', '{"pixel":1}'], ['audio/state.json', '{"tempo":130}'], ['future/blob.bin', 'opaque']
  ] });
  const latest = project({ revisionId: 'r1', manifest: { lastMode: 'draw', updatedAt: 20, editorState: { draw: { zoom: 2 }, audio: { cursor: 2 } }, untouched: { keep: true }, latestOnly: 'preserve' }, entries: [
    ['draw/main.json', '{"pixel":2}'], ['audio/state.json', '{"tempo":100}'], ['future/blob.bin', 'opaque'], ['future/new.bin', 'new']
  ] });

  const result = rebaseProjectEdits(base, local, latest);
  assert.equal(result.revisionId, 'r1');
  assert.equal(result.projectId, latest.projectId);
  assert.equal(entryText(result, 'draw/main.json'), '{"pixel":2}');
  assert.equal(entryText(result, 'audio/state.json'), '{"tempo":130}');
  assert.equal(entryText(result, 'future/new.bin'), 'new');
  assert.equal(result.manifest.editorState.draw.zoom, 2);
  assert.equal(result.manifest.editorState.audio.cursor, 4);
  assert.equal(result.manifest.lastMode, 'audio');
  assert.equal(result.manifest.updatedAt, 20);
  assert.equal(result.manifest.latestOnly, 'preserve');
});

test('same-entry divergent edits reject with conflict code and preserve the local source', () => {
  const base = project({ entries: [['audio/state.json', 'base']] });
  const local = project({ entries: [['audio/state.json', 'local']] });
  const latest = project({ revisionId: 'r1', entries: [['audio/state.json', 'latest']] });
  assert.throws(() => rebaseProjectEdits(base, local, latest), { code: 'PXD_STORE_CONFLICT', message: /今の編集内容は残っています/ });
  assert.equal(entryText(local, 'audio/state.json'), 'local');
});

test('entry deletions and additions merge by path', () => {
  const base = project({ entries: [['remove.bin', 'old'], ['keep.bin', 'same']] });
  const local = project({ entries: [['keep.bin', 'same'], ['local.bin', 'local']] });
  const latest = project({ revisionId: 'r1', entries: [['remove.bin', 'old'], ['keep.bin', 'same'], ['latest.bin', 'latest']] });
  const result = rebaseProjectEdits(base, local, latest);
  assert.deepEqual(result.entries.map(({ path }) => path), ['keep.bin', 'latest.bin', 'local.bin']);
});

test('concurrent delete versus edit rejects', () => {
  const base = project({ entries: [['same.bin', 'base']] });
  const local = project({ entries: [] });
  const latest = project({ revisionId: 'r1', entries: [['same.bin', 'latest']] });
  assert.throws(() => rebaseProjectEdits(base, local, latest), { code: 'PXD_STORE_CONFLICT' });
});

test('entry bytes and metadata both participate in exact change detection', () => {
  const base = project({ entries: [['same.bin', 'base', { role: 'source' }]] });
  const local = project({ entries: [['same.bin', 'local', { role: 'source' }]] });
  const latest = project({ revisionId: 'r1', entries: [['same.bin', 'base', { role: 'thumbnail' }]] });
  assert.throws(() => rebaseProjectEdits(base, local, latest), { code: 'PXD_STORE_CONFLICT' });
});

test('project identity must match across base, local, and latest', () => {
  const base = project(); const local = project();
  const latest = createPxdProject({ projectId: 'another-project', revisionId: 'r1' });
  assert.throws(() => rebaseProjectEdits(base, local, latest), { code: 'PXD_STORE_CONFLICT' });
});

test('unknown nested manifest fields merge recursively while arrays are atomic', () => {
  const base = project({ manifest: { future: { left: 1, right: 1 }, values: [1, 2] } });
  const local = project({ manifest: { future: { left: 2, right: 1 }, values: [1, 3] } });
  const latest = project({ revisionId: 'r1', manifest: { future: { left: 1, right: 2 }, values: [1, 2] } });
  const result = rebaseProjectEdits(base, local, latest);
  assert.deepEqual(result.manifest.future, { left: 2, right: 2 });
  assert.deepEqual(result.manifest.values, [1, 3]);

  const bothChanged = project({ revisionId: 'r2', manifest: { future: { left: 1, right: 2 }, values: [2] } });
  assert.throws(() => rebaseProjectEdits(base, local, bothChanged), { code: 'PXD_STORE_CONFLICT' });
});

test('opaque payload edits are preserved when one-sided and conflict when both sides diverge', () => {
  const base = project({ opaque: [1, 2] });
  const local = project({ opaque: [3, 4] });
  const latest = project({ revisionId: 'r1', opaque: [1, 2] });
  assert.deepEqual([...rebaseProjectEdits(base, local, latest).opaquePayloads[0].bytes], [3, 4]);
  assert.throws(() => rebaseProjectEdits(base, local, project({ revisionId: 'r2', opaque: [8] })), { code: 'PXD_STORE_CONFLICT' });
});

test('latest revision unknown project fields survive rebasing', () => {
  const base = project(); const local = project();
  const latest = { ...project({ revisionId: 'r1' }), futureProjectField: { keep: true } };
  assert.deepEqual(rebaseProjectEdits(base, local, latest).futureProjectField, { keep: true });
});
