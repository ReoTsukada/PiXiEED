import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceHistoryEntry, isWorkspaceRequested } from '../../js/tool-workspace-state.mjs';

test('workspace history entries preserve duplicate application values and the fragment', () => {
  const current = 'https://example.test/draw/?keep=one&keep=two&pxdRevision=rev-4#layer-2';
  const entry = createWorkspaceHistoryEntry(current, { from: 'project' }, true);
  const url = new URL(entry.url, current);
  assert.deepEqual(url.searchParams.getAll('keep'), ['one', 'two']);
  assert.equal(url.searchParams.get('pxdRevision'), 'rev-4');
  assert.deepEqual(url.searchParams.getAll('workspace'), ['1']);
  assert.equal(url.hash, '#layer-2');
  assert.deepEqual(entry.state, { from: 'project', pixieedWorkspace: true });
});

test('explanation history removes workspace markers without changing unrelated values', () => {
  const current = 'https://example.test/camera/?workspace=1&keep=a&workspace=1&keep=b#camera';
  const entry = createWorkspaceHistoryEntry(current, { pixieedWorkspace: true }, false);
  const url = new URL(entry.url, current);
  assert.deepEqual(url.searchParams.getAll('workspace'), []);
  assert.deepEqual(url.searchParams.getAll('keep'), ['a', 'b']);
  assert.equal(url.hash, '#camera');
  assert.equal(entry.state.pixieedWorkspace, false);
});

test('workspace intent accepts an explicit query or a marked history entry', () => {
  assert.equal(isWorkspaceRequested('https://example.test/draw/?workspace=1', null), true);
  assert.equal(isWorkspaceRequested('https://example.test/draw/?workspace=0', { pixieedWorkspace: true }), false);
  assert.equal(isWorkspaceRequested('https://example.test/draw/', { pixieedWorkspace: true }), true);
  assert.equal(isWorkspaceRequested('https://example.test/draw/', null), false);
});
