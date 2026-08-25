import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('../pixiedraw/assets/js/modules/core-command-engine-utils.js', import.meta.url));
const source = await readFile(modulePath, 'utf8');
const appWindow = {};
const load = new Function('window', `${source}\nreturn window.PiXiEEDrawModules.coreCommandEngineUtils;`);
const api = load(appWindow);

function makeState() {
  return {
    schemaVersion: 1,
    projectId: 'project-wp020',
    structureEpoch: 3,
    assets: {
      'asset-1': {
        id: 'asset-1',
        revision: 0,
        width: 2,
        height: 2,
        palette: [0, 1, 2],
        pixels: new Uint8Array([0, 0, 0, 0]),
      },
    },
    appliedCommandIds: [],
    lastClientSequenceByClient: {},
  };
}

function makeCommand(overrides = {}) {
  return {
    commandId: 'cmd-1',
    commandType: 'raster.setPixel',
    schemaVersion: 1,
    projectId: 'project-wp020',
    assetId: 'asset-1',
    actorId: 'actor-1',
    clientId: 'client-1',
    clientSequence: 1,
    baseStructureEpoch: 3,
    createdAtMonotonicMs: 10,
    payload: { x: 1, y: 0, colorIndex: 2 },
    ...overrides,
  };
}

const engine = api.createCoreCommandEngine({ handlers: [api.createRasterSetPixelHandler()] });
const before = makeState();
const first = await engine.execute(before, makeCommand());
assert.equal(first.ok, true);
assert.equal(before.assets['asset-1'].pixels[1], 0, 'input state must not mutate');
assert.equal(first.state.assets['asset-1'].pixels[1], 2);
assert.deepEqual(first.result.dirtyRegions, [{ assetId: 'asset-1', x: 1, y: 0, width: 1, height: 1 }]);
assert.match(first.result.operation.operationId, /^op_[0-9a-f]{64}$/);
assert.doesNotMatch(source, /\b(document|fetch|XMLHttpRequest|Date|Math\.random)\b/, 'command path must not depend on DOM/network/wall-clock/randomness');

const inverseState = api.applyRasterOperation(first.state, first.result.inverse);
assert.equal(inverseState.assets['asset-1'].pixels[1], 0, 'inverse must restore pixel');

for (const [label, command, code] of [
  ['duplicate', makeCommand({ clientSequence: 2 }), 'COMMAND_DUPLICATE'],
  ['sequence gap', makeCommand({ commandId: 'cmd-2', clientSequence: 3 }), 'COMMAND_CLIENT_SEQUENCE_GAP'],
  ['epoch mismatch', makeCommand({ commandId: 'cmd-3', clientSequence: 1, baseStructureEpoch: 4 }), 'COMMAND_STRUCTURE_EPOCH_MISMATCH'],
  ['out of bounds', makeCommand({ commandId: 'cmd-4', clientSequence: 1, payload: { x: 2, y: 0, colorIndex: 1 } }), 'RASTER_X_OUT_OF_BOUNDS'],
]) {
  const result = await engine.execute(label === 'duplicate' ? first.state : before, command);
  assert.equal(result.ok, false, `${label} must be rejected`);
  assert.ok(result.diagnostics.some(item => item.code === code), `${label} diagnostic`);
}

const sameA = await api.createCoreCommandEngine({ handlers: [api.createRasterSetPixelHandler()] }).execute(makeState(), makeCommand());
const sameB = await api.createCoreCommandEngine({ handlers: [api.createRasterSetPixelHandler()] }).execute(makeState(), makeCommand());
assert.equal(sameA.result.operation.operationId, sameB.result.operation.operationId, 'operation ID must be deterministic');

const unchangedAfterFailure = makeState();
const failed = await engine.execute(unchangedAfterFailure, makeCommand({ commandId: 'cmd-invalid', payload: { x: 99, y: 0, colorIndex: 1 } }));
assert.equal(failed.ok, false);
assert.deepEqual(unchangedAfterFailure.assets['asset-1'].pixels, new Uint8Array([0, 0, 0, 0]), 'failed command must not partially mutate input');

console.log('WP-020 Core Command Engine tests passed: atomic apply, validation failures, inverse, deterministic operation ID');
