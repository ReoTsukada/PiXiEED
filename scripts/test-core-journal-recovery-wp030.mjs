import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('../core-shell/assets/core-journal-recovery-utils.js', import.meta.url));
const source = await readFile(modulePath, 'utf8');
const appWindow = {};
const load = new Function('window', `${source}\nreturn window.PiXiEEDrawModules.coreJournalRecoveryUtils;`);
const api = load(appWindow);

function makeState() {
  return {
    schemaVersion: 1,
    projectId: 'project-wp030',
    structureEpoch: 1,
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

function operation(id, colorIndex) {
  return {
    operationId: id,
    operationType: 'raster.setPixel',
    schemaVersion: 1,
    projectId: 'project-wp030',
    assetId: 'asset-1',
    actorId: 'actor-1',
    clientId: 'client-1',
    clientSequence: Number(id.slice(-1)),
    structureEpoch: 1,
    payload: { x: 0, y: 0, colorIndex, previousColorIndex: 0 },
  };
}

const journal = api.createCoreJournalRecovery();
const first = await journal.append(operation('op-1', 1));
const second = await journal.append(operation('op-2', 2));
assert.equal((await journal.verify()).ok, true);
assert.equal(first.sequence, 1);
assert.equal(second.previousRecordHash, first.recordHash);

const checkpointState = makeState();
checkpointState.assets['asset-1'].pixels[0] = 1;
const checkpoint = await journal.createCheckpoint(checkpointState, 1, 'op-1');
assert.equal((await journal.validateCheckpoint(checkpoint)).ok, true);

const applyOperation = (state, current) => {
  const asset = state.assets[current.assetId];
  const { x, y, colorIndex } = current.payload;
  if (!asset || x < 0 || y < 0 || x >= asset.width || y >= asset.height || colorIndex < 0 || colorIndex >= asset.palette.length) {
    throw new Error('invalid raster operation');
  }
  asset.pixels[y * asset.width + x] = colorIndex;
  asset.revision += 1;
};

const recovered = await journal.recover(checkpoint, journal.snapshot(), applyOperation);
assert.equal(recovered.ok, true);
assert.equal(recovered.state.assets['asset-1'].pixels[0], 2);

const tampered = journal.snapshot();
tampered[0].operation.payload.colorIndex = 99;
assert.equal((await journal.verify(tampered)).error.code, 'JOURNAL_RECORD_HASH_MISMATCH');

const gap = journal.snapshot();
gap[1].sequence = 3;
assert.equal((await journal.verify(gap)).error.code, 'JOURNAL_SEQUENCE_GAP');

const duplicate = journal.snapshot();
duplicate[1].operation.operationId = duplicate[0].operation.operationId;
assert.equal((await journal.verify(duplicate)).error.code, 'JOURNAL_DUPLICATE_OPERATION');

const unsupported = structuredClone(checkpoint);
unsupported.checkpointVersion = 2;
assert.equal((await journal.validateCheckpoint(unsupported)).error.code, 'CHECKPOINT_VERSION_UNSUPPORTED');

const invalidDimensions = structuredClone(checkpoint);
invalidDimensions.state.assets['asset-1'].width = 0;
assert.equal((await journal.validateCheckpoint(invalidDimensions)).error.code, 'CHECKPOINT_WIDTH_INVALID');

const failedRecovery = await journal.recover(checkpoint, journal.snapshot(), (state) => {
  state.assets['asset-1'].pixels[0] = 99;
  throw new Error('simulated apply failure');
});
assert.equal(failedRecovery.ok, false);
assert.equal(failedRecovery.error.code, 'RECOVERY_APPLY_FAILED');
assert.equal(checkpoint.state.assets['asset-1'].pixels[0], 1, 'failed recovery must not mutate checkpoint state');

assert.doesNotMatch(source, /\b(indexedDB|fetch|XMLHttpRequest|Date|Math\.random)\b/, 'integrity adapter must not own storage/network/time/random');
console.log('WP-030 Core Journal/Checkpoint/Recovery tests passed: chain, corruption, checkpoint, recovery, atomic failure boundary');
