import test from "node:test";
import assert from "node:assert/strict";

import {
  CommandEngine,
  MemoryJournal,
  createCheckpoint,
  setPixelHandler,
  validateCheckpoint,
  verifyJournal,
} from "../dist/index.js";

function makeState() {
  return {
    schemaVersion: 1,
    projectId: "project-1",
    structureEpoch: 1,
    assets: {
      "asset-1": {
        id: "asset-1",
        revision: 0,
        width: 2,
        height: 2,
        palette: [0x00000000, 0xffffffff],
        pixels: new Uint8Array([0, 0, 0, 0]),
      },
    },
    appliedCommandIds: [],
    lastClientSequenceByClient: {},
  };
}

function makeCommand(overrides = {}) {
  return {
    commandId: "command-1",
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: "project-1",
    assetId: "asset-1",
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 1,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 10,
    payload: {
      x: 1,
      y: 0,
      colorIndex: 1,
    },
    ...overrides,
  };
}

function makeEngine() {
  const engine = new CommandEngine();
  engine.register(setPixelHandler);
  return engine;
}

test("applies a valid command without mutating the input state", async () => {
  const original = makeState();
  const result = await makeEngine().execute(original, makeCommand());

  assert.equal(result.ok, true);
  assert.equal(original.assets["asset-1"].pixels[1], 0);
  assert.equal(result.state.assets["asset-1"].pixels[1], 1);
  assert.equal(result.state.assets["asset-1"].revision, 1);
  assert.equal(result.result.dirtyRegions.length, 1);
  assert.equal(result.result.inverse?.payload.colorIndex, 0);
});

test("rejects invalid commands atomically", async () => {
  const original = makeState();
  const command = makeCommand({
    payload: { x: 99, y: 0, colorIndex: 1 },
  });
  const result = await makeEngine().execute(original, command);

  assert.equal(result.ok, false);
  assert.strictEqual(result.state, original);
  assert.equal(original.assets["asset-1"].revision, 0);
  assert.equal(original.assets["asset-1"].pixels[0], 0);
});

test("rejects duplicate command IDs", async () => {
  const first = await makeEngine().execute(makeState(), makeCommand());
  assert.equal(first.ok, true);

  const duplicate = await makeEngine().execute(
    first.state,
    makeCommand({ clientSequence: 2 })
  );

  assert.equal(duplicate.ok, false);
  assert.ok(
    duplicate.diagnostics.some((item) => item.code === "COMMAND_DUPLICATE")
  );
});

test("creates deterministic operation IDs", async () => {
  const stateA = makeState();
  const stateB = makeState();
  const command = makeCommand();

  const resultA = await makeEngine().execute(stateA, command);
  const resultB = await makeEngine().execute(stateB, command);

  assert.equal(resultA.ok, true);
  assert.equal(resultB.ok, true);
  assert.equal(
    resultA.result.operation.operationId,
    resultB.result.operation.operationId
  );
});

test("journal detects tampering", async () => {
  const execution = await makeEngine().execute(makeState(), makeCommand());
  assert.equal(execution.ok, true);

  const journal = new MemoryJournal();
  await journal.append(execution.result.operation);
  assert.deepEqual(await verifyJournal(journal.records), { ok: true });

  const tampered = structuredClone(journal.records);
  tampered[0].operation.payload.colorIndex = 0;
  const verification = await verifyJournal(tampered);
  assert.equal(verification.ok, false);
});

test("checkpoint validates state integrity", async () => {
  const execution = await makeEngine().execute(makeState(), makeCommand());
  assert.equal(execution.ok, true);

  const checkpoint = await createCheckpoint(
    execution.state,
    1,
    execution.result.operation.operationId
  );
  assert.deepEqual(await validateCheckpoint(checkpoint), { ok: true });

  checkpoint.state.assets["asset-1"].pixels[0] = 1;
  const verification = await validateCheckpoint(checkpoint);
  assert.equal(verification.ok, false);
});
