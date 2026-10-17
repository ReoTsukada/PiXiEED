import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { outputExportEventParams } from '../../js/creation/output-handoff.mjs';

test('output export events use each saved item type and omit filename, ID, and metadata', () => {
  const selected = [
    { id: 'private-png-id', extension: 'PNG', filename: 'private-drawing.png', metadata: { prompt: 'private' } },
    { id: 'private-wav-id', extension: 'wav', filename: 'private-song.wav', metadata: { projectName: 'private' } }
  ];
  const queued = [];
  const trackSiteEvent = (name, params) => { queued.push({ name, params }); };
  const trackDispatchedBatch = (items, started) => {
    for (const item of items.slice(0, started)) trackSiteEvent('file_export', outputExportEventParams(item));
  };

  trackDispatchedBatch(selected, 2);

  assert.deepEqual(queued, [
    { name: 'file_export', params: { file_type: 'png', method: 'downloaded', export_status: 'download_started' } },
    { name: 'file_export', params: { file_type: 'wav', method: 'downloaded', export_status: 'download_started' } }
  ]);
  trackDispatchedBatch(selected, 0);
  assert.equal(queued.length, 2, 'a zero-item dispatch emits no export event');
});

test('output-page sends the clicked item and only batch items whose download dispatch returned', () => {
  const source = readFileSync(new URL('../../js/creation/output-page.mjs', import.meta.url), 'utf8');
  assert.match(source, /save\.addEventListener\('click',[\s\S]*?trackSave\(item\)/);
  assert.match(source, /for \(const item of batch\.selected\.slice\(0, started\)\) trackSave\(item\)/);
  assert.match(source, /trackSave\(activeItem\)/);
  assert.match(source, /started > 1\s*\?/);
  assert.match(source, /for \(const item of batch\.selected\.slice\(0, started\)\) trackSave\(item\)/);
  assert.doesNotMatch(source, /trackSave\('download'\)|method:\s*'download'/);
});
