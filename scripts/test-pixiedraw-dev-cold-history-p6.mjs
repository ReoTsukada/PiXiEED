import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const modulePath = new URL('../PiXiEEDrawDEV/assets/js/modules/cold-history-store-utils.js', import.meta.url);
const historyCorePath = new URL('../PiXiEEDrawDEV/assets/js/modules/history-core-workflow-utils.js', import.meta.url);
const source = fs.readFileSync(modulePath, 'utf8');
const historyCoreSource = fs.readFileSync(historyCorePath, 'utf8');
const window = { PiXiEEDrawModules: {}, indexedDB: null };
const context = vm.createContext({
  window,
  structuredClone,
  Date,
  Map,
  Promise,
  Object,
  Array,
  Number,
  String,
  Math,
});
vm.runInContext(source, context, { filename: modulePath.pathname });

const store = window.PiXiEEDrawModules.coldHistoryStoreUtils.createColdHistoryStoreUtils({
  indexedDBApi: null,
  chunkSize: 2,
  maxEntriesPerDirection: 4,
});

const entry = id => ({ type: 'pixelPatch', label: 'pen', id, changes: [{ index: id }] });

await store.push('project-1', 'past', [entry(1), entry(2), entry(3), entry(4)]);
assert.deepEqual(structuredClone(await store.getStatus('project-1')), {
  projectId: 'project-1',
  pastCount: 4,
  futureCount: 0,
});

assert.deepEqual(Array.from(await store.popLatest('project-1', 'past'), value => value.id), [3, 4]);
assert.deepEqual(Array.from(await store.popLatest('project-1', 'past'), value => value.id), [1, 2]);
assert.deepEqual(structuredClone(await store.popLatest('project-1', 'past')), []);

await store.push('project-1', 'future', [entry(7), entry(8), entry(9)]);
assert.deepEqual(Array.from(await store.popLatest('project-1', 'future'), value => value.id), [9]);
assert.deepEqual(Array.from(await store.popLatest('project-1', 'future'), value => value.id), [7, 8]);

await store.push('project-1', 'past', [entry(10), entry(11)]);
await store.clearDirection('project-1', 'past');
assert.equal((await store.getStatus('project-1')).pastCount, 0);

await store.push('project-1', 'past', [entry(20), entry(21), entry(22), entry(23), entry(24)]);
assert.ok((await store.getStatus('project-1')).pastCount <= 4, 'oldest full chunks must be pruned at the configured cap');
await store.clearDirection('project-1', 'past');

await store.push('project-1', 'past', [entry(12)]);
assert.equal(await store.removeProject('project-1'), true);
assert.deepEqual(structuredClone(await store.getStatus('project-1')), {
  projectId: 'project-1',
  pastCount: 0,
  futureCount: 0,
});

assert.match(source, /historyChunks/);
assert.match(source, /safeChunkSize/);
assert.match(source, /maxEntriesPerDirection/);
assert.match(historyCoreSource, /archiveEvictedHistoryEntry\('past', history\.past\.shift\(\)\)/);
assert.match(historyCoreSource, /hasColdHistoryEntries\('past'\)[\s\S]*requestColdHistoryRefill\('past'\)/);
assert.match(historyCoreSource, /hasColdHistoryEntries\('future'\)[\s\S]*requestColdHistoryRefill\('future'\)/);
assert.match(historyCoreSource, /recordTimelapseOperationLogEntry\(historyEntry, pendingLabel\)[\s\S]*archiveEvictedHistoryEntry/,
  'timelapse recording must happen before history eviction');

console.log('PiXiEEDrawDEV P6 cold history store tests passed.');
