import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const adapterUtilsPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/project-storage-adapter-utils.js');
const v1AdapterPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/project-storage-v1-json-adapter.js');
const context = {
  Blob,
  TextDecoder,
  Uint8Array,
  console: { warn() {} },
  window: { PiXiEEDrawModules: {} },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(adapterUtilsPath, 'utf8'), context, { filename: adapterUtilsPath });
vm.runInContext(fs.readFileSync(v1AdapterPath, 'utf8'), context, { filename: v1AdapterPath });

const v1 = context.window.PiXiEEDrawModules.projectStorageV1JsonAdapter.createPixieeDrawV1JsonAdapter({
  PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
});
const v2 = {
  id: 'pixieedraw-v2-zip-experimental',
  canReadParsedValue() { return false; },
};
const registry = context.window.PiXiEEDrawModules.projectStorageAdapterUtils
  .createProjectStorageAdapterUtils()
  .createProjectStorageAdapterRegistry({
    adapters: [v1, v2],
    defaultAdapterId: v2.id,
  });

const result = registry.parseText(JSON.stringify({
  type: 'pixieedraw-project',
  document: { frames: [], palette: [] },
}));

assert.equal(result.adapterId, 'pixieedraw-v1-json');
assert.equal(result.parsed.type, 'pixieedraw-project');
console.log('PiXiEEDraw DEV project-storage text reader regression checks passed.');
