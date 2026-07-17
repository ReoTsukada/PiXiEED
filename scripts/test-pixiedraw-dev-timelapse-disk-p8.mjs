import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const storeUrl = new URL('../PiXiEEDrawDEV/assets/js/modules/timelapse-chunk-store-utils.js', import.meta.url);
const storeSource = fs.readFileSync(storeUrl, 'utf8');
const window = { PiXiEEDrawModules: {}, indexedDB: null };
vm.runInContext(storeSource, vm.createContext({ window, Map, Promise, Object, Array, String, Number, Math, Date, structuredClone }), {
  filename: storeUrl.pathname,
});

const store = window.PiXiEEDrawModules.timelapseChunkStoreUtils.createTimelapseChunkStoreUtils({
  indexedDBApi: null,
  maxSnapshotsPerCanvas: 4,
});
const frame = id => ({ width: 1, height: 1, pixels: [id, 0, 0, 255] });
await store.appendSnapshots('project-1', 'canvas-1', [frame(1), frame(2), frame(3), frame(4), frame(5)]);
const stored = await store.readProject('project-1');
assert.ok(stored.byCanvas['canvas-1'].length <= 4);
assert.equal(stored.byCanvas['canvas-1'][0].pixels[0], 1, 'the first recorded state must survive thinning');
assert.equal(stored.byCanvas['canvas-1'].at(-1).pixels[0], 5, 'the latest recorded state must survive thinning');
assert.equal(await store.removeProject('project-1'), true);
assert.deepEqual(Object.keys((await store.readProject('project-1')).byCanvas), []);

const appSource = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/app.js', import.meta.url), 'utf8');
const timelapseSource = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/modules/timelapse-session-utils.js', import.meta.url), 'utf8');
const autosaveSource = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js', import.meta.url), 'utf8');
const exportSource = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/modules/export-rendering.js', import.meta.url), 'utf8');

assert.match(appSource, /createTimelapseChunkStoreUtils/);
assert.match(appSource, /async function buildProjectSessionPayloadWithPersistedTimelapse/);
assert.match(appSource, /timelapseChunkStore\?\.removeProject/);
assert.match(timelapseSource, /archiveTimelapseSnapshots\(canvasId, archiveFrames\)\.then/);
assert.match(timelapseSource, /const persistedByCanvas = await loadPersistedTimelapseSnapshots\(\)/);
assert.match(timelapseSource, /clearPersistedTimelapseSnapshots\(\)/);
assert.doesNotMatch(autosaveSource, /requireComplete: true/);
assert.match(exportSource, /await buildProjectSessionPayloadWithPersistedTimelapse\(\{\s*requireComplete: true/);

console.log('PiXiEEDrawDEV P8 disk-backed timelapse checks passed.');
