import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { findPxdOriginalBackup } from '../../js/creation/pxd-original-backup.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
test('original download selects imported bytes ahead of integration snapshots without changing archives', () => {
  const project = { entries: [
    { path: 'legacy/creation-original.pxd', bytes: new Uint8Array([1, 2]) },
    { path: 'legacy/import-source.pxd', bytes: new Uint8Array([4, 5, 6]) },
    { path: 'future/unknown.bin', bytes: new Uint8Array([7]) }
  ] };
  const before = project.entries.map(entry => digest(entry.bytes));
  const backup = findPxdOriginalBackup(project, { copyBytes: true });
  assert.equal(backup.path, 'legacy/import-source.pxd');
  assert.equal(digest(backup.bytes), before[1]);
  backup.bytes[0] = 0;
  assert.deepEqual(project.entries.map(entry => digest(entry.bytes)), before);
  project.entries.push({ path: 'legacy/original.pxd', bytes: new Uint8Array([8, 9]) });
  assert.equal(findPxdOriginalBackup(project).path, 'legacy/original.pxd');
});
test('snapshot fallback is labelled separately and missing or invalid archives stay unavailable', () => {
  const backup = findPxdOriginalBackup({ entries: [{ path: 'legacy/creation-original.pxd', bytes: new Uint8Array([1]) }] });
  assert.equal(backup.label, '統合前のPXDを保存');
  assert.equal(backup.filename, 'pixieed-before-integration.pxd');
  assert.equal(findPxdOriginalBackup({ entries: [{ path: 'legacy/original.pxd', bytes: [] }] }), null);
  assert.equal(findPxdOriginalBackup(null), null);
});
