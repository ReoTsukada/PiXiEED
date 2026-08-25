import { strict as assert } from "node:assert";
import {
  createProject,
  EditorCore,
  type EditorCommand,
  type ProjectState,
} from "../../src/draw2-core.ts";
import { drawRasterHash } from "../../src/pixync/adapters.ts";
import type {
  PixyncCommittedOperation,
  PixyncOperationDraft,
} from "../../src/pixync/contracts.ts";
import {
  PixyncDrawProductBridge,
  PixyncDrawProductBridgeError,
  type PixyncDrawProductStatePort,
} from "../../src/pixync/draw-product-bridge.ts";
import type {
  PixyncTransportAck,
  PixyncTransportBinding,
} from "../../src/pixync/transport.ts";
import {
  committedOperationFingerprint,
  operationFingerprint,
} from "../../src/pixync/core.ts";

const PROJECT = "pixync-draw2-220";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "client-220";
const binding: PixyncTransportBinding = {
  projectId: PROJECT,
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  actorId: ACTOR,
  clientId: CLIENT,
  role: "editor",
  sessionGeneration: 1,
};

async function execute(
  initial: ProjectState,
  commandId = "draw-command-220",
) {
  const command: EditorCommand = {
    commandId,
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: { x: 1, y: 1, colorIndex: 3 },
  };
  const result = await new EditorCore(initial).execute(command);
  assert.equal(result.ok, true, JSON.stringify(result));
  return { command, result };
}

function committed(draft: PixyncOperationDraft): PixyncCommittedOperation {
  return {
    ...draft,
    projectRevision: 1,
    aggregateRevision: 1,
    committedAt: "2026-08-23T00:00:00.000Z",
  };
}

function transport(submitted: PixyncOperationDraft[]) {
  return {
    binding,
    snapshot: () => ({
      projectId: PROJECT,
      projectRevision: 0,
      aggregateRevisions: { draw: 0, audio: 0, game: 0 },
    }),
    submit: async (draft: PixyncOperationDraft): Promise<PixyncTransportAck> => {
      submitted.push(draft);
      const operation = committed(draft);
      return {
        kind: "COMMITTED",
        operationId: draft.operationId,
        projectId: draft.projectId,
        projectRevision: 1,
        aggregateRevision: 1,
        submissionFingerprint: await operationFingerprint(draft),
        committedFingerprint: await committedOperationFingerprint(operation),
        operation,
      };
    },
  };
}

function statePort(
  initial: ProjectState,
  history = { undoDepth: 4, redoDepth: 2 },
): PixyncDrawProductStatePort & { state: ProjectState; applies: number } {
  return {
    preservesLocalHistory: true,
    state: initial,
    applies: 0,
    current() {
      return { state: this.state, ...history };
    },
    async applyRemote(input) {
      this.applies += 1;
      const command = {
        commandId: input.operation.commandId,
        commandType: input.operation.operationType,
        schemaVersion: 1,
        projectId: input.operation.projectId,
        assetId: input.operation.assetId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseStructureEpoch: input.baseStructureEpoch,
        createdAtMonotonicMs: 0,
        payload: input.operation.payload,
      } as EditorCommand;
      const result = await new EditorCore(this.state).execute(command);
      assert.equal(result.ok, true, JSON.stringify(result));
      this.state = result.state;
      return {
        operationId: input.operation.operationId,
        projectId: input.operation.projectId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseProjectRevision: input.baseProjectRevision,
        assetId: input.operation.assetId,
        baseStructureEpoch: input.baseStructureEpoch,
        structureEpoch: this.state.structureEpoch,
        rasterHash: await drawRasterHash(this.state, input.operation.assetId),
        localUndoDepth: history.undoDepth,
        localRedoDepth: history.redoDepth,
      };
    },
  };
}

Deno.test("PIXYNC-DRAW2-220 local raster commit submits exactly one authenticated draft", async () => {
  const initial = createProject({ projectId: PROJECT, width: 4, height: 4 });
  const local = await execute(initial);
  const submitted: PixyncOperationDraft[] = [];
  const bridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.result.state),
  });
  await bridge.submitLocal(
    local.result.result,
    local.result.state,
    initial.structureEpoch,
  );
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0]?.actorId, ACTOR);
  assert.equal(submitted[0]?.clientId, CLIENT);
  assert.equal(submitted[0]?.aggregate, "draw");
});

Deno.test("PIXYNC-DRAW2-220 self echo is verified without a second raster apply", async () => {
  const initial = createProject({ projectId: PROJECT, width: 4, height: 4 });
  const local = await execute(initial);
  const submitted: PixyncOperationDraft[] = [];
  const port = statePort(local.result.state);
  const bridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: port,
  });
  const ack = await bridge.submitLocal(
    local.result.result,
    local.result.state,
    initial.structureEpoch,
  );
  await bridge.adapter.apply(ack.operation, {
    source: "remote",
    projectRevision: 1,
    aggregateRevision: 1,
  });
  assert.equal(port.applies, 0);
  assert.equal(port.current().undoDepth, 4);
  assert.equal(port.current().redoDepth, 2);
});

Deno.test("PIXYNC-DRAW2-220 remote apply converges without changing local history", async () => {
  const initial = createProject({ projectId: PROJECT, width: 4, height: 4 });
  const source = await execute(initial);
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(source.result.state),
  });
  const ack = await sourceBridge.submitLocal(
    source.result.result,
    source.result.state,
    initial.structureEpoch,
  );
  const target = statePort(initial);
  const targetBridge = new PixyncDrawProductBridge({
    transport: transport([]),
    state: target,
  });
  await targetBridge.adapter.apply(ack.operation, {
    source: "remote",
    projectRevision: 1,
    aggregateRevision: 1,
  });
  assert.equal(target.applies, 1);
  assert.equal(target.current().undoDepth, 4);
  assert.equal(target.current().redoDepth, 2);
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(source.result.state, source.result.state.activeAssetId),
  );
});

Deno.test("PIXYNC-DRAW2-220 rejects substituted identity and unsupported operations", async () => {
  const initial = createProject({ projectId: PROJECT, width: 4, height: 4 });
  const local = await execute(initial);
  const bridge = new PixyncDrawProductBridge({
    transport: { ...transport([]), binding: { ...binding, actorId: "other" } },
    state: statePort(local.result.state),
  });
  await assert.rejects(
    () => bridge.submitLocal(local.result.result, local.result.state, initial.structureEpoch),
    (error) => error instanceof PixyncDrawProductBridgeError &&
      error.code === "IDENTITY_MISMATCH",
  );
  const unsupported = {
    ...local.result.result,
    operation: {
      ...local.result.result.operation,
      operationType: "clipboard.paste" as const,
    },
  };
  const normal = new PixyncDrawProductBridge({
    transport: transport([]),
    state: statePort(local.result.state),
  });
  await assert.rejects(
    () => normal.submitLocal(unsupported, local.result.state, initial.structureEpoch),
    (error) => error instanceof PixyncDrawProductBridgeError &&
      error.code === "OPERATION_UNSUPPORTED",
  );
});
