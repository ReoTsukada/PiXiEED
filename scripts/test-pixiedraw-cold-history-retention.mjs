import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../pixiedraw/assets/js/modules/cold-history-store-utils.js', import.meta.url),
  'utf8'
);
const context = {
  console,
  structuredClone: globalThis.structuredClone,
  window: { indexedDB: null, PiXiEEDrawModules: {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'cold-history-store-utils.js' });

const createStore = context.window.PiXiEEDrawModules.coldHistoryStoreUtils.createColdHistoryStoreUtils;
const store = createStore({ indexedDBApi: null, chunkSize: 4, maxEntriesPerDirection: 10 });

for (let index = 0; index < 18; index += 1) {
  await store.push('project-a', 'past', [{ index }]);
}
assert.deepEqual(
  JSON.parse(JSON.stringify(await store.getStatus('project-a'))),
  { projectId: 'project-a', pastCount: 10, futureCount: 0 },
  'cold history must retain only its configured bounded tail'
);

const latestChunk = await store.popLatest('project-a', 'past');
assert.deepEqual(latestChunk.map(entry => entry.index), [16, 17], 'latest retained chunk must be readable');
assert.equal((await store.getStatus('project-a')).pastCount, 8);

await store.push('project-a', 'future', [{ index: 99 }]);
assert.deepEqual(
  JSON.parse(JSON.stringify(await store.getStatus('project-a'))),
  { projectId: 'project-a', pastCount: 8, futureCount: 1 },
  'past and future cold history must remain independent'
);
assert.equal(await store.clearDirection('project-a', 'future'), true);
assert.equal((await store.getStatus('project-a')).futureCount, 0);
await store.push('project-a', 'past', [{ index: 200 }]);
assert.equal(await store.resetProject('project-a'), true);
await store.push('project-a', 'past', [{ index: 201 }]);
assert.equal(
  (await store.getStatus('project-a')).pastCount,
  1,
  'a session reset must allow the same project to collect new cold history'
);
assert.equal(await store.removeProject('project-a'), true);
assert.deepEqual(
  JSON.parse(JSON.stringify(await store.getStatus('project-a'))),
  { projectId: 'project-a', pastCount: 0, futureCount: 0 },
  'project removal must clear the complete cold-history record'
);
const lateWriteStatus = await store.push('project-a', 'past', [{ index: 1000 }]);
assert.deepEqual(
  JSON.parse(JSON.stringify(lateWriteStatus)),
  { projectId: 'project-a', pastCount: 0, futureCount: 0 },
  'a late cold-history write must be rejected after project removal'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(await store.getStatus('project-a'))),
  { projectId: 'project-a', pastCount: 0, futureCount: 0 },
  'a rejected late cold-history write must not resurrect the project'
);

console.log('PiXiEEDraw cold history retention checks passed');
