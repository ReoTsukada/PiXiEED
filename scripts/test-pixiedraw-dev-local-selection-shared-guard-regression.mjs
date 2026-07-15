import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(
  fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/shared-project-op-utils.js'), 'utf8'),
  { filename: 'shared-project-op-utils.js' }
);

let resolverCalled = false;
const scope = {
  sharedProjectInFlightStroke: { command: 'stale' },
  isSharedProjectCollaborativeMode: () => false,
  resolveSharedProjectDrawCommandTarget: () => {
    resolverCalled = true;
    throw new Error('local selection must not resolve a shared target');
  },
};
const utils = window.PiXiEEDrawModules.sharedProjectOpUtils.createSharedProjectOpUtils(scope);

assert.doesNotThrow(() => {
  assert.equal(utils.captureSharedProjectRegionCommand({ x0: 0, y0: 0, x1: 1, y1: 1 }), false);
});
assert.equal(resolverCalled, false, 'local selection confirmation bypasses shared capture');
assert.equal(scope.sharedProjectInFlightStroke, null, 'stale shared capture state is cleared');

const app = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/app.js'), 'utf8');
assert.match(
  app,
  /function captureSharedProjectRegionCommand\(\.\.\.args\) \{\s*if \(!SHARED_PROJECTS_ENABLED\) \{\s*return false;/,
  'the disabled shared feature is blocked at the local editor boundary'
);
assert.match(
  app,
  /function resolveSharedProjectDrawCommandTarget\(\.\.\.args\) \{\s*return sharedProjectDrawApplyUtilsModule\.resolveSharedProjectDrawCommandTarget/,
  'future shared mode keeps the draw-target dependency connected'
);

console.log('PiXiEEDraw DEV local selection shared-guard regression checks passed.');
