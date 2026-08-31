import { strict as assert } from "node:assert";
import {
  compactPixelPath,
  createIndexedRasterStampSource,
  createRasterSelectionMask,
  createProject,
  type EditorCommand,
  EditorCore,
  type ProjectState,
} from "../../src/draw2-core.ts";
import {
  applyCompactSelectionTransform,
  commitTransform,
  createTransformSession,
  type SelectionSnapshot,
  type SelectionTransformWireCommand,
} from "../../src/draw2-selection.ts";
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
  PIXYNC_DRAW2_MAX_PAYLOAD_KEYS,
  validatePixyncDraft,
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

async function executeLongStroke(
  initial: ProjectState,
  options: {
    readonly brushSize?: number;
    readonly brushShape?: "square" | "circle";
    readonly pattern?: "solid" | "checker" | "dots" | "bayer-2x2";
  } = {},
) {
  const command: EditorCommand = {
    commandId: "draw-stroke-220",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: {
      points: [{ x: 2, y: 128 }, { x: 253, y: 128 }],
      colorIndex: 3,
      ...options,
    },
  };
  const result = await new EditorCore(initial).execute(command);
  assert.equal(result.ok, true, JSON.stringify(result));
  return { command, result };
}

async function executeFullCanvasShape(initial: ProjectState) {
  const command: EditorCommand = {
    commandId: "draw-shape-220",
    commandType: "raster.shapeCommit",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: {
      tool: "rect-fill",
      from: { x: 0, y: 0 },
      to: { x: 255, y: 255 },
      colorIndex: 3,
      brushSize: 1,
      brushShape: "square",
      pattern: "solid",
    },
  };
  const result = await new EditorCore(initial).execute(command);
  assert.equal(result.ok, true, JSON.stringify(result));
  return { command, result };
}

async function executeFullCanvasGradientFill(initial: ProjectState) {
  const command: EditorCommand = {
    commandId: "draw-gradient-fill-220",
    commandType: "raster.fill",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: {
      seedX: 0,
      seedY: 0,
      colorIndex: 3,
      maxCells: 256 * 256,
      gradientToX: 255,
      gradientToY: 255,
    },
  };
  const result = await new EditorCore(initial).execute(command);
  assert.equal(result.ok, true, JSON.stringify(result));
  return { command, result };
}

async function executeRectangleClipFill(initial: ProjectState) {
  const command: EditorCommand = {
    commandId: "draw-rectangle-clip-fill-220",
    commandType: "raster.fill",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: {
      seedX: 32,
      seedY: 48,
      colorIndex: 3,
      maxCells: 256 * 256,
      clip: { x: 16, y: 32, width: 224, height: 192 },
    },
  };
  const result = await new EditorCore(initial).execute(command);
  assert.equal(result.ok, true, JSON.stringify(result));
  return { command, result };
}

async function executeDenseStroke(initial: ProjectState) {
  const rawPoints = Array.from({ length: 512 }, (_, index) => {
    const row = Math.floor(index / 256);
    const column = index % 256;
    return {
      x: row % 2 === 0 ? column : 255 - column,
      y: row,
    };
  });
  const command: EditorCommand = {
    commandId: "draw-dense-stroke-220",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: {
      points: compactPixelPath(rawPoints, PIXYNC_DRAW2_MAX_PAYLOAD_KEYS),
      colorIndex: 3,
    },
  };
  assert.equal(command.payload.points.length, PIXYNC_DRAW2_MAX_PAYLOAD_KEYS);
  const result = await new EditorCore(initial).execute(command);
  assert.equal(result.ok, true, JSON.stringify(result));
  return { command, result };
}

async function executeFullCanvasTileStamp(initial: ProjectState) {
  const assetId = initial.activeAssetId;
  const seedWrites = Array.from({ length: 16 * 16 }, (_, index) => {
    const x = index % 16;
    const y = Math.floor(index / 16);
    return { x, y, colorIndex: (x + y) % 2 === 0 ? 3 : 0 };
  });
  const seed = await new EditorCore(initial).execute({
    commandId: "draw-tile-seed-220",
    commandType: "raster.writeSet",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: { writes: seedWrites },
  });
  assert.equal(seed.ok, true, JSON.stringify(seed));
  if (!seed.ok) throw new Error("Tile seed failed.");
  const sourceAsset = seed.state.assets[assetId];
  assert.ok(sourceAsset);
  const command: EditorCommand = {
    commandId: "draw-tile-stamp-220",
    commandType: "raster.tileStamp",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 2,
    baseStructureEpoch: seed.state.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: {
      sourceAssetId: assetId,
      sourceAssetRevision: sourceAsset.revision,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 16,
      sourceHeight: 16,
      originX: 0,
      originY: 0,
      scale: 16,
    },
  };
  const result = await new EditorCore(seed.state).execute(command);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("Tile stamp failed.");
  return { seed: seed.state, command, result };
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
    submit: async (
      draft: PixyncOperationDraft,
    ): Promise<PixyncTransportAck> => {
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
      const result = input.operation.operationType === "selection.transformCommit"
        ? await applyCompactSelectionTransform(
          this.state,
          command as unknown as SelectionTransformWireCommand,
        )
        : await new EditorCore(this.state).execute(command);
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

Deno.test("PIXYNC-DRAW2-220 keeps a full-width simple stroke within the sync payload bound", async () => {
  const initial = createProject({
    projectId: PROJECT,
    width: 256,
    height: 256,
  });
  const local = await executeLongStroke(initial);
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.result.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result.result,
    local.result.state,
    initial.structureEpoch,
  );
  const commandPayload = submitted[0]?.payload.command;
  assert.ok(
    commandPayload !== null &&
      typeof commandPayload === "object" &&
      !Array.isArray(commandPayload),
  );
  const payload = commandPayload as unknown as {
    readonly operationType?: unknown;
    readonly payload?: {
      readonly points?: readonly unknown[];
    };
  };
  assert.equal(payload.operationType, "raster.strokeCommit");
  assert.equal(payload.payload?.points?.length, 2);
  await validatePixyncDraft(submitted[0]!);

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
  assert.equal(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(128, 128),
    3,
  );
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.result.state, local.result.state.activeAssetId),
  );
});

Deno.test("PIXYNC-DRAW2-220 keeps a full-width thick stroke compact", async () => {
  const initial = createProject({
    projectId: PROJECT,
    width: 256,
    height: 256,
  });
  const local = await executeLongStroke(initial, {
    brushSize: 16,
    brushShape: "circle",
    pattern: "checker",
  });
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.result.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result.result,
    local.result.state,
    initial.structureEpoch,
  );
  const commandPayload = submitted[0]?.payload.command as {
    readonly payload?: {
      readonly points?: readonly unknown[];
      readonly brushSize?: unknown;
      readonly brushShape?: unknown;
      readonly pattern?: unknown;
    };
  };
  assert.equal(commandPayload.payload?.points?.length, 2);
  assert.equal(commandPayload.payload?.brushSize, 16);
  assert.equal(commandPayload.payload?.brushShape, "circle");
  assert.equal(commandPayload.payload?.pattern, "checker");
  await validatePixyncDraft(submitted[0]!);

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
  assert.equal(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(128, 128),
    3,
  );
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.result.state, local.result.state.activeAssetId),
  );
});

Deno.test("PIXYNC-DRAW2-220 bounds dense coalesced stroke samples before transport", async () => {
  const initial = createProject({
    projectId: PROJECT,
    width: 256,
    height: 256,
  });
  const local = await executeDenseStroke(initial);
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.result.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result.result,
    local.result.state,
    initial.structureEpoch,
  );
  const commandPayload = submitted[0]?.payload.command as {
    readonly payload?: { readonly points?: readonly unknown[] };
  };
  assert.equal(
    commandPayload.payload?.points?.length,
    PIXYNC_DRAW2_MAX_PAYLOAD_KEYS,
  );
  await validatePixyncDraft(submitted[0]!);

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
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.result.state, local.result.state.activeAssetId),
  );
});

Deno.test("PIXYNC-DRAW2-220 keeps a full-canvas tile stamp compact", async () => {
  const initial = createProject({
    projectId: PROJECT,
    width: 256,
    height: 256,
  });
  const local = await executeFullCanvasTileStamp(initial);
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.result.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result.result,
    local.result.state,
    initial.structureEpoch,
  );
  const commandPayload = submitted[0]?.payload.command as {
    readonly operationType?: unknown;
    readonly payload?: {
      readonly sourceAssetId?: unknown;
      readonly sourceAssetRevision?: unknown;
      readonly scale?: unknown;
      readonly writes?: unknown;
      readonly stampedCellCount?: unknown;
    };
  };
  assert.equal(commandPayload.operationType, "raster.tileStamp");
  assert.equal(commandPayload.payload?.sourceAssetId, PROJECT + ":draw:main");
  assert.equal(commandPayload.payload?.sourceAssetRevision, 1);
  assert.equal(commandPayload.payload?.scale, 16);
  assert.equal(commandPayload.payload?.writes, undefined);
  assert.equal(commandPayload.payload?.stampedCellCount, 32_768);
  assert.ok(JSON.stringify(commandPayload).length < 1_000);
  await validatePixyncDraft(submitted[0]!);

  const target = statePort(local.seed);
  const targetBridge = new PixyncDrawProductBridge({
    transport: transport([]),
    state: target,
  });
  await targetBridge.adapter.apply(ack.operation, {
    source: "remote",
    projectRevision: 1,
    aggregateRevision: 1,
  });
  assert.equal(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(128, 128),
    3,
  );
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.result.state, local.result.state.activeAssetId),
  );

  const stale = await new EditorCore(local.seed).execute({
    ...local.command,
    commandId: "draw-tile-stamp-220-stale",
    payload: {
      ...local.command.payload,
      sourceAssetRevision: 0,
    },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.diagnostics[0]?.code, "TILE_SOURCE_REVISION_STALE");
});

Deno.test("PIXYNC-DRAW2-220 transports saved selection stamps as bounded inline sources", async () => {
  const initial = createProject({
    projectId: PROJECT,
    width: 256,
    height: 256,
  });
  const sourceAsset = initial.assets[initial.activeAssetId];
  assert.ok(sourceAsset);
  const cells = Array.from({ length: 16 * 16 }, (_, index) => ({
    x: index % 16,
    y: Math.floor(index / 16),
    colorIndex: (index + Math.floor(index / 16)) % 2 === 0 ? 1 : 2,
  }));
  const inlineSource = createIndexedRasterStampSource({
    width: 16,
    height: 16,
    palette: sourceAsset.palette,
    cells,
  });
  const command: EditorCommand = {
    commandId: "draw-inline-selection-stamp-220",
    commandType: "raster.tileStamp",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: {
      inlineSource,
      originX: 48,
      originY: 64,
      scale: 1,
    },
  };
  const local = await new EditorCore(initial).execute(command);
  assert.equal(local.ok, true, JSON.stringify(local));
  if (!local.ok) throw new Error("inline selection stamp command failed");
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result,
    local.state,
    initial.structureEpoch,
  );
  const commandPayload = submitted[0]?.payload.command as {
    readonly operationType?: unknown;
    readonly payload?: {
      readonly inlineSource?: unknown;
      readonly writes?: unknown;
      readonly stampedCellCount?: unknown;
    };
  };
  assert.equal(commandPayload.operationType, "raster.tileStamp");
  assert.ok(commandPayload.payload?.inlineSource);
  assert.equal(commandPayload.payload?.writes, undefined);
  assert.equal(commandPayload.payload?.stampedCellCount, 256);
  assert.ok(JSON.stringify(commandPayload).length < 16_384);
  await validatePixyncDraft(submitted[0]!);

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
  assert.equal(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(48, 64),
    1,
  );
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.state, local.state.activeAssetId),
  );
});

Deno.test("PIXYNC-DRAW2-220 keeps a full-canvas filled shape compact", async () => {
  const initial = createProject({
    projectId: PROJECT,
    width: 256,
    height: 256,
  });
  const local = await executeFullCanvasShape(initial);
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.result.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result.result,
    local.result.state,
    initial.structureEpoch,
  );
  const commandPayload = submitted[0]?.payload.command;
  assert.ok(
    commandPayload !== null &&
      typeof commandPayload === "object" &&
      !Array.isArray(commandPayload),
  );
  const payload = commandPayload as unknown as {
    readonly operationType?: unknown;
    readonly payload?: {
      readonly tool?: unknown;
      readonly from?: unknown;
      readonly to?: unknown;
      readonly writes?: unknown;
    };
  };
  assert.equal(payload.operationType, "raster.shapeCommit");
  assert.equal(payload.payload?.tool, "rect-fill");
  assert.deepEqual(payload.payload?.from, { x: 0, y: 0 });
  assert.deepEqual(payload.payload?.to, { x: 255, y: 255 });
  assert.equal(payload.payload?.writes, undefined);
  assert.ok(JSON.stringify(commandPayload).length < 1_000);
  await validatePixyncDraft(submitted[0]!);

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
  assert.equal(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(128, 128),
    3,
  );
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.result.state, local.result.state.activeAssetId),
  );
  const shapeCommand = local.command as Extract<
    EditorCommand,
    { readonly commandType: "raster.shapeCommit" }
  >;
  const rejected = await new EditorCore(initial).execute({
    ...shapeCommand,
    commandId: "draw-shape-220-out-of-bounds",
    payload: {
      ...shapeCommand.payload,
      from: { x: -1, y: 0 },
    },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.diagnostics[0]?.code, "SHAPE_POINT_OUT_OF_BOUNDS");
});

Deno.test("PIXYNC-DRAW2-220 keeps a full-canvas gradient fill compact", async () => {
  const initial = createProject({
    projectId: PROJECT,
    width: 256,
    height: 256,
  });
  const local = await executeFullCanvasGradientFill(initial);
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.result.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result.result,
    local.result.state,
    initial.structureEpoch,
  );
  const commandPayload = submitted[0]?.payload.command as {
    readonly operationType?: unknown;
    readonly payload?: {
      readonly gradientToX?: unknown;
      readonly gradientToY?: unknown;
      readonly writes?: unknown;
    };
  };
  assert.equal(commandPayload.operationType, "raster.fill");
  assert.equal(commandPayload.payload?.gradientToX, 255);
  assert.equal(commandPayload.payload?.gradientToY, 255);
  assert.equal(commandPayload.payload?.writes, undefined);
  assert.ok(JSON.stringify(commandPayload).length < 1_000);
  await validatePixyncDraft(submitted[0]!);

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
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.result.state, local.result.state.activeAssetId),
  );
});

Deno.test("PIXYNC-DRAW2-220 carries rectangle selection clips through the Draw adapter", async () => {
  const initial = createProject({
    projectId: PROJECT,
    width: 256,
    height: 256,
  });
  const local = await executeRectangleClipFill(initial);
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.result.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result.result,
    local.result.state,
    initial.structureEpoch,
  );
  const commandPayload = submitted[0]?.payload.command as {
    readonly operationType?: unknown;
    readonly payload?: {
      readonly clip?: unknown;
      readonly writes?: unknown;
    };
  };
  assert.equal(commandPayload.operationType, "raster.fill");
  assert.deepEqual(commandPayload.payload?.clip, {
    x: 16,
    y: 32,
    width: 224,
    height: 192,
  });
  assert.equal(commandPayload.payload?.writes, undefined);
  assert.ok(JSON.stringify(commandPayload).length < 1_000);
  await validatePixyncDraft(submitted[0]!);

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
  assert.equal(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(16, 32),
    3,
  );
  assert.equal(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(15, 32),
    0,
  );
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.result.state, local.result.state.activeAssetId),
  );
});

Deno.test("PIXYNC-DRAW2-220 carries non-rectangular selection masks compactly", async () => {
  const initial = createProject({
    projectId: PROJECT,
    width: 256,
    height: 256,
  });
  const selected = [] as { x: number; y: number }[];
  for (let y = 16; y < 240; y += 1) {
    for (let x = 16; x < 240; x += 1) {
      const dx = x - 127.5;
      const dy = y - 127.5;
      if ((dx * dx) / (112 * 112) + (dy * dy) / (112 * 112) <= 1) {
        selected.push({ x, y });
      }
    }
  }
  const selectionMask = createRasterSelectionMask(selected);
  assert.ok(selectionMask);
  assert.ok(selectionMask.data.length < 16_000);
  const command: EditorCommand = {
    commandId: "draw-non-rect-selection-stroke-220",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: {
      points: [{ x: 0, y: 128 }, { x: 255, y: 128 }],
      colorIndex: 3,
      selectionMask,
    },
  };
  const local = await new EditorCore(initial).execute(command);
  assert.equal(local.ok, true, JSON.stringify(local));
  if (!local.ok) throw new Error("Non-rectangular selection stroke failed.");
  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result,
    local.state,
    initial.structureEpoch,
  );
  const commandPayload = submitted[0]?.payload.command as {
    readonly operationType?: unknown;
    readonly payload?: {
      readonly selectionMask?: { readonly data?: unknown };
      readonly writes?: unknown;
    };
  };
  assert.equal(commandPayload.operationType, "raster.strokeCommit");
  assert.equal(typeof commandPayload.payload?.selectionMask?.data, "string");
  assert.equal(commandPayload.payload?.writes, undefined);
  assert.ok(JSON.stringify(commandPayload).length < 8_000);
  await validatePixyncDraft(submitted[0]!);

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
  assert.equal(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(0, 128),
    0,
  );
  assert.equal(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(128, 128),
    3,
  );
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.state, local.state.activeAssetId),
  );
});

Deno.test("PIXYNC-DRAW2-220 carries selection transforms as bounded operations", async () => {
  const initial = createProject({ projectId: PROJECT, width: 64, height: 64 });
  const seeded = await new EditorCore(initial).execute({
    commandId: "draw-transform-seed-220",
    commandType: "raster.writeSet",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: initial.activeAssetId,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 0,
    payload: {
      writes: [
        { x: 20, y: 20, colorIndex: 3 },
        { x: 28, y: 24, colorIndex: 2 },
      ],
    },
  });
  assert.equal(seeded.ok, true, JSON.stringify(seeded));
  if (!seeded.ok) throw new Error("Transform seed failed.");
  const asset = seeded.state.assets[seeded.state.activeAssetId];
  assert.ok(asset);
  const points: { x: number; y: number }[] = [];
  for (let y = 12; y < 36; y += 1) {
    for (let x = 12; x < 36; x += 1) {
      const dx = (x - 23.5) / 12;
      const dy = (y - 23.5) / 12;
      if (dx * dx + dy * dy <= 1) points.push({ x, y });
    }
  }
  const selection: SelectionSnapshot = {
    selectionId: "draw-transform-ellipse-220",
    mask: {
      kind: "ellipse",
      regions: [{ x: 12, y: 12, width: 24, height: 24 }],
      selectionVersion: 1,
    },
    scope: {
      assetId: asset.id,
      layerId: seeded.state.activeLayerId,
      frameId: seeded.state.activeFrameId,
      celId: seeded.state.activeCelId,
    },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: seeded.state.structureEpoch,
    pixels: points.map((point) => ({
      ...point,
      colorIndex: asset.raster.getPixel(point.x, point.y),
    })),
  };
  const transform = {
    operation: "MOVE" as const,
    dx: 8,
    dy: 0,
    factor: 1,
    interpolationPolicy: "NEAREST_NEIGHBOR" as const,
    outOfBoundsPolicy: "CLIP" as const,
  };
  const local = await commitTransform(seeded.state, {
    commandType: "selection.transformCommit",
    commandId: "draw-transform-ellipse-commit-220",
    schemaVersion: 1,
    projectId: PROJECT,
    assetId: asset.id,
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: 2,
    baseStructureEpoch: seeded.state.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: {
      selection,
      session: createTransformSession(selection, transform, "draw-transform-ellipse-session-220"),
    },
  });
  assert.equal(local.ok, true, JSON.stringify(local));
  if (!local.ok) throw new Error("Transform commit failed.");
  const operationPayload = local.result.operation.payload as Record<string, unknown>;
  assert.equal("pixels" in operationPayload, false);
  assert.equal("writes" in operationPayload, false);
  assert.ok(JSON.stringify(operationPayload).length < 8_000);

  const submitted: PixyncOperationDraft[] = [];
  const sourceBridge = new PixyncDrawProductBridge({
    transport: transport(submitted),
    state: statePort(local.state),
  });
  const ack = await sourceBridge.submitLocal(
    local.result,
    local.state,
    seeded.state.structureEpoch,
  );
  await validatePixyncDraft(submitted[0]!);
  const commandPayload = submitted[0]?.payload.command as {
    readonly operationType?: unknown;
    readonly payload?: Record<string, unknown>;
  };
  assert.equal(commandPayload.operationType, "selection.transformCommit");
  assert.equal("pixels" in (commandPayload.payload ?? {}), false);
  assert.equal("writes" in (commandPayload.payload ?? {}), false);

  const target = statePort(seeded.state);
  const targetBridge = new PixyncDrawProductBridge({
    transport: transport([]),
    state: target,
  });
  await targetBridge.adapter.apply(ack.operation, {
    source: "remote",
    projectRevision: 1,
    aggregateRevision: 1,
  });
  assert.equal(
    await drawRasterHash(target.state, target.state.activeAssetId),
    await drawRasterHash(local.state, local.state.activeAssetId),
  );
  assert.equal(target.state.assets[target.state.activeAssetId]?.raster.getPixel(20, 20), 0);
  assert.equal(target.state.assets[target.state.activeAssetId]?.raster.getPixel(28, 20), 3);
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

Deno.test(
  "PIXYNC-DRAW2-220 delayed self echo remains valid after a later local raster command",
  async () => {
    const initial = createProject({ projectId: PROJECT, width: 4, height: 4 });
    const first = await execute(initial, "draw-command-220-first");
    const port = statePort(first.result.state);
    const secondCommand: EditorCommand = {
      ...first.command,
      commandId: "draw-command-220-second",
      clientSequence: 2,
      payload: { x: 2, y: 2, colorIndex: 2 },
    };
    const second = await new EditorCore(port.state).execute(secondCommand);
    assert.equal(second.ok, true, JSON.stringify(second));
    port.state = second.state;
    const bridge = new PixyncDrawProductBridge({
      transport: transport([]),
      state: port,
    });
    const ack = await bridge.submitLocal(
      first.result.result,
      first.result.state,
      initial.structureEpoch,
    );

    await bridge.adapter.apply(ack.operation, {
      source: "remote",
      projectRevision: 1,
      aggregateRevision: 1,
    });

    assert.equal(port.applies, 0);
    assert.equal(
      port.state.assets[port.state.activeAssetId]?.raster.getPixel(1, 1),
      3,
    );
    assert.equal(
      port.state.assets[port.state.activeAssetId]?.raster.getPixel(2, 2),
      2,
    );
  },
);

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
    await drawRasterHash(
      source.result.state,
      source.result.state.activeAssetId,
    ),
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
    () =>
      bridge.submitLocal(
        local.result.result,
        local.result.state,
        initial.structureEpoch,
      ),
    (error) =>
      error instanceof PixyncDrawProductBridgeError &&
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
    () =>
      normal.submitLocal(
        unsupported,
        local.result.state,
        initial.structureEpoch,
      ),
    (error) =>
      error instanceof PixyncDrawProductBridgeError &&
      error.code === "OPERATION_UNSUPPORTED",
  );
});
