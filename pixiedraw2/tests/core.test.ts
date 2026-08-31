import {
  EditorCore,
  FallbackRenderer,
  InMemoryLocalJournal,
  IndexedTileRaster,
  LocalAutosaveCoordinator,
  ReferenceRenderer,
  SampledInstrumentation,
  canonicalJson,
  createIndexedRasterStampSource,
  createRasterSelectionMask,
  createProject,
  interpolatePixelPath,
  type PixelPoint,
  sha256Hex,
  type EditorCommand,
  type RendererAdapter,
} from "../src/draw2-core.ts";
import {
  applyCompactSelectionTransform,
  assessClipboardPalette,
  commitTransform,
  createClipboardPasteSession,
  createClipboardPayload,
  createRectangleSelectionSnapshot,
  createTransformSession,
  cutClipboard,
  LocalUndoRedoHistory,
  pasteClipboard,
  previewClipboardPaste,
  previewTransform,
  type ClipboardPayload,
  type SelectionPixel,
  type SelectionSnapshot,
  type SelectionTransformWireCommand,
  type TransformDescriptor,
} from "../src/draw2-selection.ts";
import {
  calculateTimelineWindow,
  createTimelineSession,
  editCelPixel,
  executeTimelineCommand,
  InMemoryStructuralJournal,
  InMemoryStructuralSync,
  measureTimelineMemory,
  resolveOnionSkinNeighborhood,
  resolvePlaybackProjection,
  setTimelineSessionActiveFrame,
  toStructuralSyncEnvelope,
  type TimelineCommand,
} from "../src/draw2-timeline.ts";
import { exportPng, exportPxd, importPxdPackage } from "../src/draw2-export.ts";

function setPixel(projectId: string, assetId: string, sequence: number, overrides: Partial<EditorCommand> = {}): EditorCommand {
  return {
    commandId: `command-${sequence}`,
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId,
    assetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: sequence,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: sequence,
    payload: { x: sequence, y: 0, colorIndex: 1 },
    ...overrides,
  } as EditorCommand;
}

function structuralCommand(state: Parameters<typeof executeTimelineCommand>[0], commandType: TimelineCommand["commandType"], payload: unknown, sequence: number, commandId = `structure-${sequence}`): TimelineCommand {
  return {
    commandId,
    commandType,
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "timeline-test-actor",
    clientId: "timeline-test-client",
    clientSequence: sequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: sequence,
    payload,
  } as TimelineCommand;
}

Deno.test("raster content marker follows transparent edits and shared clones", () => {
  const raster = IndexedTileRaster.empty(8, 8, 32);
  if (raster.hasNonTransparentPixel()) {
    throw new Error("empty raster must not report drawing");
  }
  raster.setPixel("asset-marker", 2, 3, 1);
  if (!raster.hasNonTransparentPixel()) {
    throw new Error("drawn raster must report drawing");
  }
  const clone = raster.sharedClone();
  raster.setPixel("asset-marker", 2, 3, 0);
  if (raster.hasNonTransparentPixel() || !clone.hasNonTransparentPixel()) {
    throw new Error("transparent edits must update only the edited raster");
  }
});

Deno.test("exports deterministic PNG and versioned PXD with round-trip and corruption rejection", async () => {
  const initial = createProject({ projectId: "project-wp140-export", name: "WP-140 Export", width: 8, height: 8, tileSize: 32 });
  const result = await new EditorCore(initial).execute({
    commandId: "wp140-stroke-1",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "wp140-test-actor",
    clientId: "wp140-test-client",
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: { points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }], colorIndex: 2 },
  });
  if (!result.ok) throw new Error("export fixture command failed");
  const pngA = await exportPng(result.state);
  const pngB = await exportPng(result.state);
  if (canonicalJson(pngA) !== canonicalJson(pngB) || pngA.bytes[0] !== 137 || pngA.bytes[1] !== 80 || pngA.width !== 8 || pngA.height !== 8) throw new Error("PNG output is not deterministic or has an invalid signature");

  const pxdA = await exportPxd(result.state);
  const pxdB = await exportPxd(result.state);
  if (canonicalJson(pxdA.manifest) !== canonicalJson(pxdB.manifest) || pxdA.packageHash !== pxdB.packageHash || pxdA.bytes.length !== pxdB.bytes.length) throw new Error("PXD output is not deterministic");
  if (pxdA.manifest.schemaVersion !== 1 || pxdA.manifest.archiveVersion !== 1 || pxdA.manifest.assets[0]?.path !== "objects/asset-0000.raster") throw new Error("PXD v1 manifest contract is incomplete");

  const imported = await importPxdPackage(pxdA.bytes, { expectedPackageHash: pxdA.packageHash });
  const originalPixels = result.state.assets[result.state.activeAssetId]?.raster.toUint8Array();
  const importedPixels = imported.state.assets[imported.state.activeAssetId]?.raster.toUint8Array();
  if (imported.state.projectId !== result.state.projectId || imported.state.name !== result.state.name || imported.state.assets[imported.state.activeAssetId]?.width !== 8 || canonicalJson(originalPixels) !== canonicalJson(importedPixels)) throw new Error("PXD import round-trip changed project identity or pixels");
  if (await sha256Hex(originalPixels) !== await sha256Hex(importedPixels)) throw new Error("PXD import round-trip changed the canonical indexed raster hash");

  const corrupted = pxdA.bytes.slice();
  corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xff;
  try {
    await importPxdPackage(corrupted);
    throw new Error("corrupted PXD was accepted");
  } catch (cause) {
    if (!(cause instanceof Error) || (cause as Error & { code?: string }).code !== "PXD_ASSET_HASH_MISMATCH") throw cause;
  }
});

Deno.test("creates an isolated indexed sparse project", () => {
  const state = createProject({ projectId: "project-1", width: 128, height: 128, tileSize: 32 });
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("asset missing");
  if (asset.palette[0] !== 0) throw new Error("transparent palette entry missing");
  if (asset.raster.memoryMetrics().tileCount !== 0) throw new Error("empty sparse raster allocated tiles");
  if (asset.raster.getPixel(127, 127) !== 0) throw new Error("missing tiles must read as transparent");
});

Deno.test("runs a deterministic command through dirty tile and reference renderer", async () => {
  const state = createProject({ projectId: "project-1", width: 128, height: 128, tileSize: 32 });
  const assetId = state.activeAssetId;
  const instrumentation = new SampledInstrumentation(1, () => 0);
  const first = await new EditorCore(state, { instrumentation }).execute(setPixel(state.projectId, assetId, 1));
  if (!first.ok) throw new Error(first.diagnostics.map((item) => item.code).join(","));
  if (state.assets[assetId]?.raster.getPixel(1, 0) !== 0) throw new Error("input state was mutated");
  if (first.state.assets[assetId]?.raster.getPixel(1, 0) !== 1) throw new Error("pixel was not applied");
  if (first.result.dirtyTiles.length !== 1 || first.result.dirtyRegions[0]?.width !== 1) throw new Error("dirty invalidation was not bounded");
  if (first.result.operation.operationType !== "raster.setPixel") throw new Error("operation type missing");
  if (canonicalJson(first.result.operation).includes("Blob")) throw new Error("operation contains a Blob");

  const secondState = createProject({ projectId: "project-1", width: 128, height: 128, tileSize: 32 });
  const second = await new EditorCore(secondState).execute(setPixel(secondState.projectId, secondState.activeAssetId, 1));
  if (!second.ok) throw new Error("same command did not execute");
  if (first.result.operation.operationId !== second.result.operation.operationId) throw new Error("operation ID is not deterministic");

  const renderedA = await new ReferenceRenderer().render({ state: first.state, assetId, dirtyTiles: first.result.dirtyTiles });
  const renderedB = await new ReferenceRenderer().render({ state: second.state, assetId: secondState.activeAssetId, dirtyTiles: second.result.dirtyTiles });
  if (renderedA.canonicalPixelHash !== renderedB.canonicalPixelHash) throw new Error("reference backend result diverged");
});

Deno.test("keeps active dirty rendering bounded and reserves full read for Golden", async () => {
  const state = createProject({ projectId: "project-512", width: 512, height: 512, tileSize: 32 });
  const result = await new EditorCore(state).execute(setPixel(state.projectId, state.activeAssetId, 1, {
    payload: { x: 1, y: 1, colorIndex: 1 },
  }));
  if (!result.ok) throw new Error("bounded render command failed");
  const renderer = new ReferenceRenderer();
  const dirty = await renderer.render({
    state: result.state,
    assetId: state.activeAssetId,
    dirtyTiles: result.result.dirtyTiles,
    dirtyRegions: result.result.dirtyRegions,
    mode: "DIRTY_REGIONS",
  });
  if (dirty.fullRefresh || dirty.preparationPixelCount !== 1 || dirty.presentPixelCount !== 1) throw new Error("dirty renderer escaped the one-pixel region");
  if (dirty.canonicalPixelHash !== undefined || dirty.hashScope !== "NOT_COMPUTED") throw new Error("dirty renderer performed a Golden full hash");
  const memory = result.result.memory;
  if (memory.logicalRasterBytes !== 512 * 512 || memory.allocatedTileBytes !== 32 * 32 || memory.implicitTransparentTileCount !== 255) throw new Error("sparse allocation metrics are incorrect");
  const golden = await renderer.render({ state: result.state, assetId: state.activeAssetId, dirtyTiles: [], mode: "FULL_REFRESH_GOLDEN" });
  if (!golden.fullRefresh || golden.preparationPixelCount !== 512 * 512 || golden.hashScope !== "FULL_RASTER" || golden.canonicalPixelHash === undefined) throw new Error("Golden renderer did not perform the explicit full reference read");
});

Deno.test("keeps COW frame copies independent by Golden hash", async () => {
  const initial = createProject({ projectId: "project-cow", width: 128, height: 128, tileSize: 32 });
  const first = await new EditorCore(initial).execute(setPixel(initial.projectId, initial.activeAssetId, 1, {
    payload: { x: 4, y: 4, colorIndex: 1 },
  }));
  if (!first.ok) throw new Error("initial COW command failed");
  const frameA = first.state;
  const hashA = await sha256Hex(frameA.assets[frameA.activeAssetId]?.raster.toUint8Array());
  const second = await new EditorCore(frameA).execute(setPixel(frameA.projectId, frameA.activeAssetId, 2, {
    payload: { x: 5, y: 4, colorIndex: 2 },
  }));
  if (!second.ok) throw new Error("COW duplicate command failed");
  const frameB = second.state;
  const hashBAfterEdit = await sha256Hex(frameB.assets[frameB.activeAssetId]?.raster.toUint8Array());
  const hashAAfterEdit = await sha256Hex(frameA.assets[frameA.activeAssetId]?.raster.toUint8Array());
  if (hashAAfterEdit !== hashA || hashBAfterEdit === hashA) throw new Error("COW alias mutation changed the source Golden hash");
  if (frameA.assets[frameA.activeAssetId]?.raster.getPixel(5, 4) !== 0 || frameB.assets[frameB.activeAssetId]?.raster.getPixel(5, 4) !== 2) throw new Error("COW source/duplicate pixels are not independent");
});

Deno.test("splits only the affected shared tile on a duplicate edit", async () => {
  const initial = createProject({ projectId: "project-1", width: 128, height: 128, tileSize: 32 });
  const first = await new EditorCore(initial).execute(setPixel(initial.projectId, initial.activeAssetId, 1));
  if (!first.ok) throw new Error("first command failed");
  const second = await new EditorCore(first.state).execute(setPixel(first.state.projectId, first.state.activeAssetId, 2, {
    payload: { x: 2, y: 0, colorIndex: 2 },
  }));
  if (!second.ok) throw new Error("second command failed");
  if (second.result.cowSplitCount !== 1) throw new Error(`expected one COW split, got ${second.result.cowSplitCount}`);
  if (second.result.copiedBytes !== 32 * 32) throw new Error("COW copied more or less than one Tile");
  if (second.result.dirtyTiles.length !== 1) throw new Error("duplicate edit dirtied more than one Tile");
});

Deno.test("rejects invalid and duplicate commands atomically", async () => {
  const state = createProject({ projectId: "project-1", width: 8, height: 8, tileSize: 32 });
  const core = new EditorCore(state);
  const invalid = await core.execute(setPixel(state.projectId, state.activeAssetId, 1, { payload: { x: 99, y: 0, colorIndex: 1 } }));
  if (invalid.ok || invalid.state !== state) throw new Error("invalid command mutated state");
  if (!invalid.diagnostics.some((item) => item.code === "RASTER_X_OUT_OF_BOUNDS")) throw new Error("missing bounds diagnostic");

  const valid = await core.execute(setPixel(state.projectId, state.activeAssetId, 1, { payload: { x: 1, y: 0, colorIndex: 1 } }));
  if (!valid.ok) throw new Error("valid command failed");
  const duplicate = await new EditorCore(valid.state).execute(setPixel(state.projectId, state.activeAssetId, 1, { payload: { x: 2, y: 0, colorIndex: 1 } }));
  if (duplicate.ok || !duplicate.diagnostics.some((item) => item.code === "COMMAND_DUPLICATE")) throw new Error("duplicate command was accepted");
});

Deno.test("keeps autosave local-first and checkpoints after a bounded journal interval", async () => {
  const state = createProject({ projectId: "project-1", width: 64, height: 64, tileSize: 32 });
  const journal = new InMemoryLocalJournal();
  const autosave = new LocalAutosaveCoordinator(journal, 2);
  const core = new EditorCore(state);
  const first = await core.execute(setPixel(state.projectId, state.activeAssetId, 1, { payload: { x: 1, y: 1, colorIndex: 1 } }));
  if (!first.ok) throw new Error("first autosave command failed");
  await autosave.record(first.state, first.result);
  const second = await new EditorCore(first.state).execute(setPixel(first.state.projectId, first.state.activeAssetId, 2, { payload: { x: 2, y: 1, colorIndex: 2 } }));
  if (!second.ok) throw new Error("second autosave command failed");
  await autosave.record(second.state, second.result);
  if (journal.operations.length !== 2 || journal.dirtyTileWrites.length !== 2 || journal.checkpoints.length !== 1) throw new Error("journal/checkpoint boundary is incorrect");
  if (journal.operations.some((operation) => canonicalJson(operation).includes("Uint8Array"))) throw new Error("Blob/raster data leaked into operation journal");
});

Deno.test("supports pen, eraser, bounded fill, and palette definition without pixel remap", async () => {
  const state = createProject({ projectId: "project-wp110-tools", width: 8, height: 8, tileSize: 32 });
  const core = new EditorCore(state);
  const stroke = await core.execute({
    commandId: "stroke-1",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 1,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 1,
    payload: { points: [{ x: 1, y: 1 }, { x: 2, y: 1 }], colorIndex: 1 },
  });
  if (!stroke.ok) throw new Error("pen stroke failed");
  if (stroke.state.assets[state.activeAssetId]?.raster.getPixel(1, 1) !== 1 || stroke.state.assets[state.activeAssetId]?.raster.getPixel(2, 1) !== 1) throw new Error("pen pixels missing");
  const erased = await new EditorCore(stroke.state).execute({
    commandId: "stroke-2",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 2,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 2,
    payload: { points: [{ x: 1, y: 1 }], colorIndex: 0 },
  });
  if (!erased.ok || erased.state.assets[state.activeAssetId]?.raster.getPixel(1, 1) !== 0) throw new Error("eraser did not restore transparent index");
  const filled = await new EditorCore(erased.state).execute({
    commandId: "fill-1",
    commandType: "raster.fill",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 3,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 3,
    payload: { seedX: 0, seedY: 0, colorIndex: 2, maxCells: 64 },
  });
  if (!filled.ok || filled.result.operation.operationType !== "raster.fill") throw new Error("bounded fill failed");
  if (filled.state.assets[state.activeAssetId]?.raster.getPixel(7, 7) !== 2) throw new Error("fill did not reach the bounded raster");
  if (filled.result.dirtyRegions[0]?.width !== 8 || filled.result.dirtyRegions[0]?.height !== 8) throw new Error("fill dirty region is under-reported");
  const palette = await new EditorCore(filled.state).execute({
    commandId: "palette-1",
    commandType: "palette.setColor",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 4,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 4,
    payload: { paletteIndex: 2, color: 0xffff00ff },
  });
  if (!palette.ok || palette.state.assets[state.activeAssetId]?.raster.getPixel(7, 7) !== 2 || palette.state.assets[state.activeAssetId]?.palette[2] !== 0xffff00ff) throw new Error("palette definition changed canonical indexes");
  if (palette.result.dirtyTiles.length !== 0 || palette.result.dirtyRegions[0]?.width !== 8) throw new Error("palette invalidation rewrote or under-reported the raster");
  const appended = await new EditorCore(palette.state).execute({
    commandId: "palette-append-1",
    commandType: "palette.appendColor",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 5,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 5,
    payload: { color: 0xff123456 },
  });
  if (!appended.ok || appended.state.assets[state.activeAssetId]?.palette[4] !== 0xff123456 || appended.state.assets[state.activeAssetId]?.raster.getPixel(7, 7) !== 2) throw new Error("palette append did not preserve indexed raster state");
  if (appended.result.dirtyTiles.length !== 0 || appended.result.operation.operationType !== "palette.appendColor") throw new Error("palette append emitted raster work or the wrong operation type");
  const batched = await new EditorCore(appended.state).execute({
    commandId: "palette-append-batch-1",
    commandType: "palette.appendColors",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 6,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 6,
    payload: {
      colors: [0xff123456, 0xffabcdef, 0xffabcdef, 0xffff00ff],
    },
  });
  const batchPayload = batched.ok
    ? batched.result.operation.payload as {
      readonly colors?: readonly number[];
      readonly skippedColorCount?: number;
    }
    : undefined;
  if (
    !batched.ok ||
    batched.state.assets[state.activeAssetId]?.palette.length !== 6 ||
    batched.state.assets[state.activeAssetId]?.palette[5] !== 0xffabcdef ||
    batchPayload?.colors?.length !== 1 ||
    batchPayload?.skippedColorCount !== 3 ||
    batched.result.dirtyTiles.length !== 0 ||
    batched.result.operation.operationType !== "palette.appendColors"
  ) throw new Error("palette batch append did not deduplicate or preserve indexed raster state");
  const duplicate = await new EditorCore(batched.state).execute({
    commandId: "palette-append-duplicate-1",
    commandType: "palette.appendColor",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 7,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 7,
    payload: { color: 0xffabcdef },
  });
  if (!duplicate.ok || !duplicate.result.noOp || duplicate.state !== batched.state) throw new Error("duplicate palette append was not a no-op");
});

Deno.test("keeps mirrored broad strokes and shapes in one bounded canonical command", async () => {
  const initial = createProject({
    projectId: "project-mirror-bounded",
    width: 256,
    height: 256,
    tileSize: 32,
  });
  const mirror = {
    axes: ["x"] as const,
    guide: {
      x: 127.5,
      y: 127.5,
      diagonalDown: 0,
      diagonalUp: 0,
    },
  };
  const stroke = await new EditorCore(initial).execute({
    commandId: "mirror-stroke-1",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "mirror-actor",
    clientId: "mirror-client",
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: {
      points: [{ x: 32, y: 24 }, { x: 95, y: 24 }],
      colorIndex: 2,
      mirror,
    },
  });
  if (!stroke.ok) throw new Error("mirrored broad Stroke failed");
  const strokeAsset = stroke.state.assets[stroke.state.activeAssetId];
  if (
    strokeAsset?.raster.getPixel(32, 24) !== 2 ||
    strokeAsset.raster.getPixel(95, 24) !== 2 ||
    strokeAsset.raster.getPixel(160, 24) !== 2 ||
    strokeAsset.raster.getPixel(223, 24) !== 2
  ) throw new Error("mirrored Stroke did not preserve both reflected spans");
  if (stroke.result.operation.payload &&
    JSON.stringify(stroke.result.operation.payload).length >= 2_000) {
    throw new Error("mirrored Stroke expanded into an oversized operation payload");
  }

  const shape = await new EditorCore(stroke.state).execute({
    commandId: "mirror-shape-2",
    commandType: "raster.shapeCommit",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "mirror-actor",
    clientId: "mirror-client",
    clientSequence: 2,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 2,
    payload: {
      tool: "rect-fill",
      from: { x: 16, y: 64 },
      to: { x: 63, y: 95 },
      colorIndex: 3,
      brushSize: 1,
      brushShape: "square",
      pattern: "solid",
      mirror,
    },
  });
  if (!shape.ok) throw new Error("mirrored broad shape failed");
  const shapeAsset = shape.state.assets[shape.state.activeAssetId];
  if (
    shapeAsset?.raster.getPixel(16, 64) !== 3 ||
    shapeAsset.raster.getPixel(63, 95) !== 3 ||
    shapeAsset.raster.getPixel(192, 64) !== 3 ||
    shapeAsset.raster.getPixel(239, 95) !== 3
  ) throw new Error("mirrored shape did not preserve both reflected regions");
});

Deno.test("keeps rectangle-clipped broad raster commands bounded", async () => {
  const initial = createProject({
    projectId: "project-rectangle-clip-bounded",
    width: 256,
    height: 256,
    tileSize: 32,
  });
  const core = new EditorCore(initial);
  const fillClip = { x: 48, y: 48, width: 160, height: 16 };
  const filled = await core.execute({
    commandId: "rectangle-clip-fill-1",
    commandType: "raster.fill",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "rectangle-clip-actor",
    clientId: "rectangle-clip-client",
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: {
      seedX: 50,
      seedY: 50,
      colorIndex: 1,
      maxCells: 1_048_576,
      clip: fillClip,
    },
  });
  if (!filled.ok) throw new Error("rectangle-clipped fill failed");
  const filledAsset = filled.state.assets[initial.activeAssetId];
  if (
    filledAsset?.raster.getPixel(48, 48) !== 1 ||
    filledAsset.raster.getPixel(207, 63) !== 1 ||
    filledAsset.raster.getPixel(47, 50) !== 0 ||
    filledAsset.raster.getPixel(208, 50) !== 0 ||
    filledAsset.raster.getPixel(50, 64) !== 0
  ) throw new Error("rectangle-clipped fill escaped its selection bounds");
  if (
    JSON.stringify(filled.result.operation.payload).length >= 1_000
  ) throw new Error("rectangle-clipped fill expanded into a pixel write-set");

  const strokeClip = { x: 48, y: 96, width: 160, height: 1 };
  const stroked = await core.execute({
    commandId: "rectangle-clip-stroke-2",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "rectangle-clip-actor",
    clientId: "rectangle-clip-client",
    clientSequence: 2,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 2,
    payload: {
      points: [{ x: 0, y: 96 }, { x: 255, y: 96 }],
      colorIndex: 2,
      clip: strokeClip,
    },
  });
  if (!stroked.ok) throw new Error("rectangle-clipped stroke failed");
  const strokedAsset = stroked.state.assets[initial.activeAssetId];
  if (
    strokedAsset?.raster.getPixel(48, 96) !== 2 ||
    strokedAsset.raster.getPixel(207, 96) !== 2 ||
    strokedAsset.raster.getPixel(47, 96) !== 0 ||
    strokedAsset.raster.getPixel(208, 96) !== 0
  ) throw new Error("rectangle-clipped stroke escaped its selection bounds");

  const shapeClip = { x: 48, y: 64, width: 160, height: 128 };
  const shaped = await core.execute({
    commandId: "rectangle-clip-shape-3",
    commandType: "raster.shapeCommit",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "rectangle-clip-actor",
    clientId: "rectangle-clip-client",
    clientSequence: 3,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 3,
    payload: {
      tool: "rect-fill",
      from: { x: 0, y: 64 },
      to: { x: 255, y: 191 },
      colorIndex: 3,
      brushSize: 1,
      brushShape: "square",
      pattern: "solid",
      clip: shapeClip,
    },
  });
  if (!shaped.ok) throw new Error("rectangle-clipped shape failed");
  const shapedAsset = shaped.state.assets[initial.activeAssetId];
  if (
    shapedAsset?.raster.getPixel(48, 64) !== 3 ||
    shapedAsset.raster.getPixel(207, 191) !== 3 ||
    shapedAsset.raster.getPixel(47, 64) !== 0 ||
    shapedAsset.raster.getPixel(208, 191) !== 0 ||
    shapedAsset.raster.getPixel(48, 192) !== 0
  ) throw new Error("rectangle-clipped shape escaped its selection bounds");
  if (
    JSON.stringify(shaped.result.operation.payload).length >= 1_000
  ) throw new Error("rectangle-clipped shape expanded into a pixel write-set");

  const rejected = await core.execute({
    commandId: "rectangle-clip-invalid-4",
    commandType: "raster.fill",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "rectangle-clip-actor",
    clientId: "rectangle-clip-client",
    clientSequence: 4,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 4,
    payload: {
      seedX: 47,
      seedY: 50,
      colorIndex: 4,
      maxCells: 1_048_576,
      clip: fillClip,
    },
  });
  if (
    rejected.ok ||
    !rejected.diagnostics.some((item) => item.code === "FILL_SEED_OUTSIDE_CLIP")
  ) throw new Error("fill accepted a seed outside its rectangle clip");
});

Deno.test("keeps non-rectangular selection raster commands compact and bounded", async () => {
  const initial = createProject({
    projectId: "project-selection-mask-raster",
    width: 64,
    height: 64,
    tileSize: 32,
  });
  const selected: PixelPoint[] = [];
  for (let y = 8; y < 56; y += 1) {
    for (let x = 8; x < 56; x += 1) {
      const dx = x - 31.5;
      const dy = y - 31.5;
      if ((dx * dx) / (24 * 24) + (dy * dy) / (24 * 24) <= 1) {
        selected.push({ x, y });
      }
    }
  }
  const selectionMask = createRasterSelectionMask(selected);
  if (selectionMask === undefined) throw new Error("selection mask was empty");
  if (
    selectionMask.selectedCount !== selected.length ||
    selectionMask.data.length >= 10_000 ||
    Array.isArray(selectionMask.data)
  ) throw new Error("non-rectangular selection mask was not compact");

  let state = initial;
  const execute = async (command: EditorCommand) => {
    const result = await new EditorCore(state).execute(command);
    if (!result.ok) {
      throw new Error(
        `selection mask command failed: ${result.diagnostics.map((item) => item.code).join(",")}`,
      );
    }
    state = result.state;
    return result;
  };
  const base = {
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "selection-mask-actor",
    clientId: "selection-mask-client",
    baseStructureEpoch: initial.structureEpoch,
  } as const;
  const filled = await execute({
    ...base,
    commandId: "selection-mask-fill",
    commandType: "raster.fill",
    schemaVersion: 1,
    clientSequence: 1,
    createdAtMonotonicMs: 1,
    payload: {
      seedX: 32,
      seedY: 32,
      colorIndex: 1,
      maxCells: 4_096,
      selectionMask,
    },
  });
  const filledAsset = state.assets[initial.activeAssetId];
  if (
    filledAsset?.raster.getPixel(32, 32) !== 1 ||
    filledAsset.raster.getPixel(7, 32) !== 0 ||
    filledAsset.raster.getPixel(32, 7) !== 0
  ) throw new Error("masked fill escaped the non-rectangular selection");
  if ((filled.result.operation.payload as Record<string, unknown>).writes !== undefined) {
    throw new Error("masked fill expanded into a write-set");
  }

  const stroked = await execute({
    ...base,
    commandId: "selection-mask-stroke",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    clientSequence: 2,
    createdAtMonotonicMs: 2,
    payload: {
      points: [{ x: 0, y: 32 }, { x: 63, y: 32 }],
      colorIndex: 2,
      selectionMask,
    },
  });
  const strokedAsset = state.assets[initial.activeAssetId];
  if (
    strokedAsset?.raster.getPixel(0, 32) !== 0 ||
    strokedAsset.raster.getPixel(7, 32) !== 0 ||
    strokedAsset.raster.getPixel(32, 32) !== 2 ||
    strokedAsset.raster.getPixel(56, 32) !== 0
  ) throw new Error("masked stroke escaped the non-rectangular selection");
  if ((stroked.result.operation.payload as Record<string, unknown>).writes !== undefined) {
    throw new Error("masked stroke expanded into a write-set");
  }

  const shaped = await execute({
    ...base,
    commandId: "selection-mask-shape",
    commandType: "raster.shapeCommit",
    schemaVersion: 1,
    clientSequence: 3,
    createdAtMonotonicMs: 3,
    payload: {
      tool: "rect-fill",
      from: { x: 0, y: 0 },
      to: { x: 63, y: 63 },
      colorIndex: 3,
      brushSize: 1,
      brushShape: "square",
      pattern: "solid",
      selectionMask,
    },
  });
  const shapedAsset = state.assets[initial.activeAssetId];
  if (
    shapedAsset?.raster.getPixel(32, 32) !== 3 ||
    shapedAsset.raster.getPixel(7, 32) !== 0 ||
    shapedAsset.raster.getPixel(0, 0) !== 0
  ) throw new Error("masked shape escaped the non-rectangular selection");
  if ((shaped.result.operation.payload as Record<string, unknown>).writes !== undefined) {
    throw new Error("masked shape expanded into a write-set");
  }

  const stamped = await execute({
    ...base,
    commandId: "selection-mask-tile",
    commandType: "raster.tileStamp",
    schemaVersion: 1,
    clientSequence: 4,
    createdAtMonotonicMs: 4,
    payload: {
      pattern: "checker",
      colorIndex: 1,
      originX: 31,
      originY: 31,
      scale: 1,
      selectionMask,
    },
  });
  const stampedAsset = state.assets[initial.activeAssetId];
  if (
    stampedAsset?.raster.getPixel(0, 0) !== 0 ||
    stampedAsset.raster.getPixel(32, 32) !== 1 ||
    (stamped.result.operation.payload as Record<string, unknown>).writes !== undefined
  ) throw new Error(`masked tile stamp was not bounded or compact: ${JSON.stringify({
    outside: stampedAsset?.raster.getPixel(0, 0),
    center: stampedAsset?.raster.getPixel(32, 32),
    payload: stamped.result.operation.payload,
  })}`);

  const rejected = await new EditorCore(state).execute({
    ...base,
    commandId: "selection-mask-seed-outside",
    commandType: "raster.fill",
    schemaVersion: 1,
    clientSequence: 5,
    createdAtMonotonicMs: 5,
    payload: {
      seedX: 0,
      seedY: 0,
      colorIndex: 1,
      maxCells: 4_096,
      selectionMask,
    },
  });
  if (
    rejected.ok ||
    !rejected.diagnostics.some((item) =>
      item.code === "FILL_SEED_OUTSIDE_SELECTION_MASK"
    )
  ) throw new Error("masked fill accepted an outside seed");
});

Deno.test("keeps saved selection stamps as compact inline tile operations", async () => {
  const initial = createProject({
    projectId: "project-inline-stamp",
    width: 256,
    height: 256,
    tileSize: 32,
  });
  const asset = initial.assets[initial.activeAssetId];
  if (asset === undefined) throw new Error("inline stamp asset is missing");
  const cells: { x: number; y: number; colorIndex: number }[] = [];
  for (let y = 0; y < 256; y += 1) {
    cells.push({ x: 0, y, colorIndex: y % 2 === 0 ? 1 : 2 });
    cells.push({ x: 1, y, colorIndex: y % 2 === 0 ? 1 : 2 });
  }
  const inlineSource = createIndexedRasterStampSource({
    width: 2,
    height: 256,
    palette: asset.palette,
    cells,
  });
  const payload = {
    inlineSource,
    originX: 32,
    originY: 0,
    scale: 1,
  } as const;
  const serialized = JSON.stringify(payload);
  if (
    serialized.length >= 16_384 ||
    serialized.includes("writes") ||
    serialized.includes("pixels") ||
    Array.isArray((inlineSource as unknown as Record<string, unknown>).palette)
  ) {
    throw new Error("selection stamp expanded into an unbounded wire payload");
  }
  const command: EditorCommand = {
    commandId: "inline-stamp-1",
    commandType: "raster.tileStamp",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "inline-stamp-actor",
    clientId: "inline-stamp-client",
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 1,
    payload,
  };
  const local = await new EditorCore(initial).execute(command);
  if (!local.ok) {
    throw new Error(
      `inline stamp failed: ${local.diagnostics.map((item) => item.code).join(",")}`,
    );
  }
  const resultAsset = local.state.assets[initial.activeAssetId];
  if (
    resultAsset?.raster.getPixel(32, 0) !== 1 ||
    resultAsset.raster.getPixel(33, 0) !== 1 ||
    resultAsset.raster.getPixel(32, 1) !== 2 ||
    resultAsset.raster.getPixel(33, 1) !== 2 ||
    resultAsset.raster.getPixel(34, 0) !== 0
  ) {
    throw new Error("inline selection stamp did not reproduce its indexed runs");
  }
  const operationPayload = local.result.operation.payload as Record<string, unknown>;
  if (
    operationPayload.writes !== undefined ||
    operationPayload.inlineSource === undefined ||
    operationPayload.stampedCellCount !== 512
  ) {
    throw new Error("inline selection stamp operation was not canonical and compact");
  }
  const remote = await new EditorCore(initial).execute(command);
  if (!remote.ok) throw new Error("inline stamp did not replay on a peer");
  if (
    canonicalJson(local.state.assets[initial.activeAssetId]?.raster.toUint8Array()) !==
      canonicalJson(remote.state.assets[initial.activeAssetId]?.raster.toUint8Array())
  ) {
    throw new Error("inline selection stamp diverged between peers");
  }
  const malformed = await new EditorCore(initial).execute({
    ...command,
    commandId: "inline-stamp-malformed",
    payload: {
      ...payload,
      inlineSource: { ...inlineSource, data: "!!!!" },
    },
  });
  if (
    malformed.ok ||
    malformed.state !== initial ||
    !malformed.diagnostics.some((item) => item.code === "RASTER_STAMP_SOURCE_INVALID")
  ) {
    throw new Error("malformed inline stamp crossed the commit boundary");
  }
});

Deno.test("keeps fill cancellation, malformed commands, and renderer fallback fail-closed", async () => {
  const state = createProject({ projectId: "project-wp110-failures", width: 8, height: 8, tileSize: 32 });
  const fill = {
    commandId: "fill-cancelled",
    commandType: "raster.fill" as const,
    schemaVersion: 1 as const,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 1,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 1,
    payload: { seedX: 0, seedY: 0, colorIndex: 1, maxCells: 64 },
  };
  const cancelled = await new EditorCore(state).execute(fill, { cancelRequested: () => true });
  if (cancelled.ok || !cancelled.diagnostics.some((item) => item.code === "FILL_CANCELLED") || cancelled.state !== state) throw new Error("cancelled fill crossed the commit boundary");
  const limited = await new EditorCore(state).execute({ ...fill, commandId: "fill-limited", payload: { ...fill.payload, maxCells: 1 } });
  if (limited.ok || !limited.diagnostics.some((item) => item.code === "FILL_PIXEL_LIMIT_EXCEEDED")) throw new Error("fill boundary did not fail closed");
  const malformed = await new EditorCore(state).execute({ ...fill, commandId: "fill-malformed", payload: { ...fill.payload, seedX: 99 } });
  if (malformed.ok || !malformed.diagnostics.some((item) => item.code === "FILL_SEED_X_OUT_OF_BOUNDS")) throw new Error("fill boundary diagnostic missing");
  const primary: RendererAdapter = { backendId: "unsupported-test-backend", render: async () => { throw new Error("backend unavailable"); } };
  const fallback = await new FallbackRenderer(primary, new ReferenceRenderer()).render({ state, assetId: state.activeAssetId, dirtyTiles: [], mode: "FULL_REFRESH_GOLDEN" });
  if (!fallback.fallbackUsed || !fallback.backendId.includes("reference-indexed")) throw new Error("renderer fallback did not activate safely");
});

Deno.test("keeps canonical transparency and Golden projection stable after erasing", async () => {
  const initial = createProject({ projectId: "project-transparency", width: 8, height: 8, tileSize: 32 });
  const pen = await new EditorCore(initial).execute({
    commandId: "transparency-pen",
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 1,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 1,
    payload: { x: 3, y: 3, colorIndex: 1 },
  });
  if (!pen.ok) throw new Error("transparency pen command failed");
  const erased = await new EditorCore(pen.state).execute({
    commandId: "transparency-eraser",
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 2,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: 2,
    payload: { x: 3, y: 3, colorIndex: 0 },
  });
  if (!erased.ok) throw new Error("transparency eraser command failed");
  const asset = erased.state.assets[erased.state.activeAssetId];
  if (asset?.raster.getPixel(3, 3) !== 0 || asset.palette[0] !== 0) throw new Error("eraser did not restore canonical transparent index 0");

  const renderer = new ReferenceRenderer();
  const dirty = await renderer.render({
    state: erased.state,
    assetId: erased.state.activeAssetId,
    dirtyTiles: erased.result.dirtyTiles,
    dirtyRegions: erased.result.dirtyRegions,
    mode: "DIRTY_REGIONS",
  });
  if (dirty.preparationPixelCount !== 1 || dirty.presentPixelCount !== 1 || dirty.hashScope !== "NOT_COMPUTED") {
    throw new Error("transparent erase did not stay on the bounded dirty projection path");
  }

  const empty = createProject({ projectId: "project-transparency-empty", width: 8, height: 8, tileSize: 32 });
  const emptyGolden = await renderer.render({ state: empty, assetId: empty.activeAssetId, dirtyTiles: [], mode: "FULL_REFRESH_GOLDEN" });
  const erasedGolden = await renderer.render({ state: erased.state, assetId: erased.state.activeAssetId, dirtyTiles: [], mode: "FULL_REFRESH_GOLDEN" });
  if (emptyGolden.canonicalPixelHash !== erasedGolden.canonicalPixelHash) throw new Error("erased projection differs from the empty canonical Golden hash");
});

Deno.test("keeps fast Pointer Stroke paths continuous, local, and atomically undoable", async () => {
  const fixtures: readonly (readonly PixelPoint[])[] = [
    [{ x: 2, y: 2 }, { x: 30, y: 2 }],
    [{ x: 2, y: 2 }, { x: 2, y: 30 }],
    [{ x: 2, y: 2 }, { x: 30, y: 30 }],
    [{ x: 4, y: 2 }, { x: 8, y: 30 }],
    [{ x: 30, y: 30 }, { x: 2, y: 30 }],
    [{ x: 0, y: 0 }, { x: 63, y: 0 }],
    [{ x: 5, y: 5 }, { x: 5, y: 5 }],
  ];
  for (const fixture of fixtures) {
    const path = interpolatePixelPath(fixture);
    if (path[0]?.x !== fixture[0]?.x || path[0]?.y !== fixture[0]?.y || path.at(-1)?.x !== fixture.at(-1)?.x || path.at(-1)?.y !== fixture.at(-1)?.y) throw new Error("Stroke interpolation changed an endpoint");
    for (let index = 1; index < path.length; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      if (previous === undefined || current === undefined || Math.abs(current.x - previous.x) > 1 || Math.abs(current.y - previous.y) > 1) throw new Error("Stroke interpolation left a pixel gap");
    }
  }

  let state = createProject({ projectId: "project-wp130-stroke", width: 64, height: 64, tileSize: 32 });
  const history = new LocalUndoRedoHistory(state);
  const stroke = async (points: readonly PixelPoint[], colorIndex: number, sequence: number): Promise<Awaited<ReturnType<EditorCore["execute"]>>> => new EditorCore(state).execute({ commandId: `stroke-continuity-${sequence}`, commandType: "raster.strokeCommit", schemaVersion: 1, projectId: state.projectId, assetId: state.activeAssetId, actorId: "stroke-test", clientId: "stroke-test", clientSequence: sequence, baseStructureEpoch: state.structureEpoch, createdAtMonotonicMs: sequence, payload: { points, colorIndex } });
  const beforeDraw = state;
  const drawn = await stroke([{ x: 2, y: 2 }, { x: 30, y: 2 }], 1, 1);
  if (!drawn.ok) throw new Error("fast horizontal Stroke failed");
  state = drawn.state;
  history.record(beforeDraw, state, drawn.result.operation.operationId, drawn.result.operation.operationType);
  for (let x = 2; x <= 30; x += 1) if (state.assets[state.activeAssetId]?.raster.getPixel(x, 2) !== 1) throw new Error(`horizontal Stroke gap at ${x},2`);
  if (drawn.result.strokeMetrics?.inputPointCount !== 2 || drawn.result.strokeMetrics.interpolatedPixelCount !== 29 || drawn.result.strokeMetrics.touchedTileCount !== 1 || drawn.result.strokeMetrics.dirtyTileCount !== 1 || drawn.result.strokeMetrics.dirtyRegionCount !== 1 || drawn.result.strokeMetrics.unrelatedFrameCount !== 0 || drawn.result.strokeMetrics.unrelatedLayerCount !== 0) throw new Error("Stroke locality metrics are incorrect");

  const beforeErase = state;
  const erased = await stroke([{ x: 30, y: 2 }, { x: 2, y: 2 }], 0, 2);
  if (!erased.ok) throw new Error("continuous Eraser Stroke failed");
  state = erased.state;
  history.record(beforeErase, state, erased.result.operation.operationId, erased.result.operation.operationType);
  for (let x = 2; x <= 30; x += 1) if (state.assets[state.activeAssetId]?.raster.getPixel(x, 2) !== 0) throw new Error(`eraser Stroke left pixel at ${x},2`);
  if (history.undoDepth !== 2) throw new Error("Pointer Stroke samples created more than one Undo entry per Stroke");
  const undoErase = history.undo();
  const undoDraw = history.undo();
  if (undoErase?.state.assets[state.activeAssetId]?.raster.getPixel(15, 2) !== 1 || undoDraw?.state.assets[state.activeAssetId]?.raster.getPixel(15, 2) !== 0) throw new Error("Stroke Undo was not atomic");
});

Deno.test("keeps Selection Preview outside Canonical Raster and separates invalidation domains", async () => {
  const initial = createProject({ projectId: "project-wp120-preview", width: 64, height: 64, tileSize: 32 });
  const painted = await new EditorCore(initial).execute(setPixel(initial.projectId, initial.activeAssetId, 1, { payload: { x: 2, y: 2, colorIndex: 1 } }));
  if (!painted.ok) throw new Error("selection preview fixture paint failed");
  const selection = createRectangleSelectionSnapshot(painted.state, { x: 2, y: 2, width: 2, height: 2 }, "selection-preview", 1);
  if (selection.scope.layerId !== painted.state.activeLayerId || selection.scope.frameId !== painted.state.activeFrameId || selection.scope.celId !== painted.state.activeCelId) throw new Error("selection scope is not tied to a stable active layer/frame/cel");
  const transform: TransformDescriptor = { operation: "MOVE", dx: 8, dy: 0, factor: 1, interpolationPolicy: "NEAREST_NEIGHBOR", outOfBoundsPolicy: "CLIP" };
  const session = createTransformSession(selection, transform, "transform-preview");
  const beforeHash = await sha256Hex(painted.state.assets[painted.state.activeAssetId]?.raster.toUint8Array());
  const preview = previewTransform(selection, session);
  const afterHash = await sha256Hex(painted.state.assets[painted.state.activeAssetId]?.raster.toUint8Array());
  if (beforeHash !== afterHash || preview.canonicalDirtyTiles.length !== 0 || preview.canonicalDirtyRegions.length !== 0 || preview.metricScope !== "PREVIEW_ONLY") throw new Error("Transform Preview mutated Canonical Raster or reported canonical invalidation");
  const cancelled = await commitTransform(painted.state, {
    commandType: "selection.transformCommit",
    commandId: "transform-cancel",
    schemaVersion: 1,
    projectId: painted.state.projectId,
    assetId: painted.state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 1,
    baseStructureEpoch: painted.state.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: { selection, session: createTransformSession(selection, { ...transform, dx: -99, outOfBoundsPolicy: "CANCEL" }, "transform-cancel-session") },
  });
  if (cancelled.ok || !cancelled.diagnostics.some((item) => item.code === "TRANSFORM_OUT_OF_BOUNDS")) throw new Error("out-of-bounds CANCEL did not fail closed");
});

Deno.test("commits deterministic transforms with affected-tile COW only", async () => {
  const initial = createProject({ projectId: "project-wp120-transform", width: 64, height: 64, tileSize: 32 });
  const first = await new EditorCore(initial).execute(setPixel(initial.projectId, initial.activeAssetId, 1, { payload: { x: 2, y: 2, colorIndex: 1 } }));
  if (!first.ok) throw new Error("transform source fixture failed");
  const second = await new EditorCore(first.state).execute(setPixel(first.state.projectId, first.state.activeAssetId, 2, { payload: { x: 40, y: 2, colorIndex: 2 } }));
  if (!second.ok) throw new Error("transform destination COW fixture failed");
  const selection = createRectangleSelectionSnapshot(second.state, { x: 2, y: 2, width: 2, height: 2 }, "selection-transform", 1);
  const session = createTransformSession(selection, { operation: "MOVE", dx: 32, dy: 0, factor: 1, interpolationPolicy: "NEAREST_NEIGHBOR", outOfBoundsPolicy: "CLIP" }, "transform-commit");
  const command = {
    commandType: "selection.transformCommit" as const,
    commandId: "transform-commit",
    schemaVersion: 1 as const,
    projectId: second.state.projectId,
    assetId: second.state.activeAssetId,
    actorId: "actor-1",
    clientId: "client-1",
    clientSequence: 1,
    baseStructureEpoch: second.state.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: { selection, session },
  };
  const originalHash = await sha256Hex(second.state.assets[second.state.activeAssetId]?.raster.toUint8Array());
  const a = await commitTransform(second.state, command);
  const b = await commitTransform(second.state, command);
  if (!a.ok || !b.ok) throw new Error("deterministic transform commit failed");
  if (a.result.operation.operationType !== "selection.transformCommit" || a.result.dirtyTiles.length !== 2 || a.result.cowSplitCount !== 2 || a.result.copiedBytes !== 2 * 32 * 32) throw new Error(`transform locality metrics are wrong: ${JSON.stringify({ dirtyTiles: a.result.dirtyTiles.length, cow: a.result.cowSplitCount, copied: a.result.copiedBytes })}`);
  if (await sha256Hex(a.state.assets[a.state.activeAssetId]?.raster.toUint8Array()) !== await sha256Hex(b.state.assets[b.state.activeAssetId]?.raster.toUint8Array())) throw new Error("same transform command diverged");
  if (await sha256Hex(second.state.assets[second.state.activeAssetId]?.raster.toUint8Array()) !== originalHash) throw new Error("transform mutated source state during commit preparation");
  if (a.state.assets[a.state.activeAssetId]?.raster.getPixel(34, 2) !== 1 || a.state.assets[a.state.activeAssetId]?.raster.getPixel(2, 2) !== 0) throw new Error("move transform pixels are incorrect");
  const stale = await commitTransform(a.state, command);
  if (stale.ok || !stale.diagnostics.some((item) => item.code === "STALE_SELECTION_RASTER")) throw new Error("stale transform commit was accepted");
});

Deno.test("keeps non-rectangular selection transforms compact and rebases remote history", async () => {
  const initial = createProject({ projectId: "project-wp120-transform-wire", width: 48, height: 32, tileSize: 32 });
  const seeded = await new EditorCore(initial).execute({
    commandId: "transform-wire-seed",
    commandType: "raster.writeSet",
    schemaVersion: 1,
    projectId: initial.projectId,
    assetId: initial.activeAssetId,
    actorId: "seed-actor",
    clientId: "seed-client",
    clientSequence: 1,
    baseStructureEpoch: initial.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: {
      writes: [
        { x: 12, y: 12, colorIndex: 1 },
        { x: 24, y: 18, colorIndex: 2 },
      ],
    },
  });
  if (!seeded.ok) throw new Error("transform wire seed failed");
  const asset = seeded.state.assets[seeded.state.activeAssetId];
  if (asset === undefined) throw new Error("transform wire asset missing");
  const selectedPoints: { x: number; y: number }[] = [];
  for (let y = 8; y < 24; y += 1) {
    for (let x = 8; x < 32; x += 1) {
      const normalizedX = (x - 19.5) / 12;
      const normalizedY = (y - 15.5) / 8;
      if (normalizedX * normalizedX + normalizedY * normalizedY <= 1) {
        selectedPoints.push({ x, y });
      }
    }
  }
  const selection: SelectionSnapshot = {
    selectionId: "ellipse-transform-wire",
    mask: {
      kind: "ellipse",
      regions: [{ x: 8, y: 8, width: 24, height: 16 }],
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
    pixels: selectedPoints.map((point) => ({
      ...point,
      colorIndex: asset.raster.getPixel(point.x, point.y),
    })),
  };
  const transform: TransformDescriptor = {
    operation: "MOVE",
    dx: 8,
    dy: 0,
    factor: 1,
    interpolationPolicy: "NEAREST_NEIGHBOR",
    outOfBoundsPolicy: "CLIP",
  };
  const command = {
    commandType: "selection.transformCommit" as const,
    commandId: "ellipse-transform-wire-1",
    schemaVersion: 1 as const,
    projectId: seeded.state.projectId,
    assetId: asset.id,
    actorId: "transform-actor",
    clientId: "transform-client",
    clientSequence: 1,
    baseStructureEpoch: seeded.state.structureEpoch,
    createdAtMonotonicMs: 2,
    payload: { selection, session: createTransformSession(selection, transform, "ellipse-transform-wire-session") },
  };
  const local = await commitTransform(seeded.state, command);
  if (!local.ok) throw new Error(`compact transform commit failed: ${JSON.stringify(local.diagnostics)}`);
  const wirePayload = local.result.operation.payload as Record<string, unknown>;
  if ("pixels" in wirePayload || "writes" in wirePayload || typeof wirePayload.selectionMask !== "object") {
    throw new Error("selection transform operation leaked an unbounded raster array");
  }
  if (JSON.stringify(wirePayload).length >= 8_000) {
    throw new Error("selection transform wire payload exceeded the compact bound");
  }
  if (local.result.operation.actorId !== command.actorId || local.result.operation.clientId !== command.clientId || local.result.operation.clientSequence !== command.clientSequence) {
    throw new Error("selection transform operation identity was not preserved");
  }
  const wireCommand: SelectionTransformWireCommand = {
    commandType: "selection.transformCommit",
    commandId: local.result.operation.commandId,
    schemaVersion: 1,
    projectId: local.result.operation.projectId,
    assetId: local.result.operation.assetId,
    actorId: local.result.operation.actorId,
    clientId: local.result.operation.clientId,
    clientSequence: local.result.operation.clientSequence,
    baseStructureEpoch: seeded.state.structureEpoch,
    createdAtMonotonicMs: 2,
    payload: wirePayload as unknown as SelectionTransformWireCommand["payload"],
  };
  const remote = await applyCompactSelectionTransform(seeded.state, wireCommand);
  if (!remote.ok) throw new Error(`compact transform remote apply failed: ${JSON.stringify(remote.diagnostics)}`);
  if (await sha256Hex(remote.state.assets[remote.state.activeAssetId]?.raster.toUint8Array()) !== await sha256Hex(local.state.assets[local.state.activeAssetId]?.raster.toUint8Array())) {
    throw new Error("compact transform local and remote raster hashes diverged");
  }
  if (remote.state.assets[remote.state.activeAssetId]?.raster.getPixel(12, 12) !== 0 || remote.state.assets[remote.state.activeAssetId]?.raster.getPixel(20, 12) !== 1) {
    throw new Error("compact transform did not move the selected source color");
  }

  const localHistory = new LocalUndoRedoHistory(seeded.state);
  const localEdit = await new EditorCore(seeded.state).execute({
    commandId: "transform-wire-local-edit",
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: seeded.state.projectId,
    assetId: seeded.state.activeAssetId,
    actorId: "local-actor",
    clientId: "local-client",
    clientSequence: 1,
    baseStructureEpoch: seeded.state.structureEpoch,
    createdAtMonotonicMs: 3,
    payload: { x: 0, y: 0, colorIndex: 3 },
  });
  if (!localEdit.ok) throw new Error("transform wire local history edit failed");
  localHistory.record(seeded.state, localEdit.state, localEdit.result.operation.operationId, localEdit.result.operation.operationType);
  const appliedAfterLocal = await applyCompactSelectionTransform(localEdit.state, wireCommand);
  if (!appliedAfterLocal.ok) throw new Error("compact transform local history apply failed");
  await localHistory.rebaseRemoteSelectionTransformOperation(wireCommand, appliedAfterLocal.state);
  const undone = localHistory.undo();
  if (undone === undefined || undone.state.assets[undone.state.activeAssetId]?.raster.getPixel(0, 0) !== 0 || undone.state.assets[undone.state.activeAssetId]?.raster.getPixel(20, 12) !== 1) {
    throw new Error("selection transform rebase removed the remote edit or kept local edit during undo");
  }
  const redone = localHistory.redo();
  if (redone === undefined || redone.state.assets[redone.state.activeAssetId]?.raster.getPixel(0, 0) !== 3 || redone.state.assets[redone.state.activeAssetId]?.raster.getPixel(20, 12) !== 1) {
    throw new Error("selection transform rebase did not preserve local redo");
  }
  if (redone.state.lastClientSequenceByClient[wireCommand.clientId] !== wireCommand.clientSequence) {
    throw new Error("selection transform rebase changed the remote client sequence");
  }
});

Deno.test("supports PiXiEEDraw-style nearest scale and quarter-turn selection transforms", () => {
  const state = createProject({ projectId: "project-wp120-transform-shapes", width: 32, height: 32, tileSize: 32 });
  const selection = createRectangleSelectionSnapshot(state, { x: 8, y: 10, width: 4, height: 2 }, "selection-transform-shapes", 1);
  const base = { dx: 0, dy: 0, factor: 1, interpolationPolicy: "NEAREST_NEIGHBOR" as const, outOfBoundsPolicy: "CLIP" as const };

  const halfScale = createTransformSession(selection, { ...base, operation: "SCALE_NEAREST", factor: 0.5 }, "transform-half-scale");
  const halfPreview = previewTransform(selection, halfScale);
  if (halfScale.destinationBounds.width !== 2 || halfScale.destinationBounds.height !== 1 || halfPreview.pixels.length !== 2) throw new Error("Nearest-neighbor reduction did not preserve a centered 2x1 output.");

  const doubleScale = createTransformSession(selection, { ...base, operation: "SCALE_NEAREST", factor: 2 }, "transform-double-scale");
  const doublePreview = previewTransform(selection, doubleScale);
  if (doubleScale.destinationBounds.width !== 8 || doubleScale.destinationBounds.height !== 4 || doublePreview.pixels.length !== 32) throw new Error("Nearest-neighbor enlargement did not produce a dense 8x4 output.");

  const ccw = createTransformSession(selection, { ...base, operation: "ROTATE_90_CCW" }, "transform-ccw");
  if (ccw.destinationBounds.width !== 2 || ccw.destinationBounds.height !== 4) throw new Error("Counter-clockwise quarter-turn bounds are incorrect.");
  const halfTurn = createTransformSession(selection, { ...base, operation: "ROTATE_180" }, "transform-180");
  const halfTurnPreview = previewTransform(selection, halfTurn);
  const expectedCorner = halfTurnPreview.pixels.find((pixel) => pixel.x === 11 && pixel.y === 11);
  if (expectedCorner === undefined) throw new Error("180-degree selection transform did not map the opposite corner.");
});

Deno.test("keeps typed Clipboard bounded, palette-safe, and Undo/Redo atomic", async () => {
  const initial = createProject({ projectId: "project-wp120-clipboard", width: 32, height: 32, tileSize: 32 });
  const painted = await new EditorCore(initial).execute(setPixel(initial.projectId, initial.activeAssetId, 1, { payload: { x: 3, y: 3, colorIndex: 1 } }));
  if (!painted.ok) throw new Error("clipboard fixture paint failed");
  const selection = createRectangleSelectionSnapshot(painted.state, { x: 3, y: 3, width: 2, height: 2 }, "selection-clipboard", 1);
  const clipboard = createClipboardPayload(painted.state, selection, "draw2-internal-selection");
  if (clipboard.format !== "PIXIEEDRAW2_CLIPBOARD" || clipboard.pixels.length !== 4 || assessClipboardPalette(clipboard, painted.state.assets[painted.state.activeAssetId]?.palette ?? []).result !== "EXACT_PALETTE_MATCH") throw new Error("internal Clipboard contract is invalid");
  const cut = await cutClipboard(painted.state, { commandType: "clipboard.cut", commandId: "clipboard-cut", schemaVersion: 1, projectId: painted.state.projectId, assetId: painted.state.activeAssetId, actorId: "actor-1", clientId: "client-1", clientSequence: 1, baseStructureEpoch: painted.state.structureEpoch, createdAtMonotonicMs: 1, payload: { clipboard, selection } });
  if (!cut.ok || cut.state.assets[cut.state.activeAssetId]?.raster.getPixel(3, 3) !== 0) throw new Error("Cut did not clear the selected pixels atomically");
  const history = new LocalUndoRedoHistory(painted.state);
  if (!cut.ok) throw new Error("Cut result unavailable");
  history.record(painted.state, cut.state, cut.result.operation.operationId, cut.result.operation.operationType);
  const undone = history.undo();
  const redone = history.redo();
  if (undone === undefined || redone === undefined || undone.state.assets[undone.state.activeAssetId]?.raster.getPixel(3, 3) !== 1 || redone.state.assets[redone.state.activeAssetId]?.raster.getPixel(3, 3) !== 0 || history.undoDepth !== 1 || history.redoDepth !== 0) throw new Error("Undo/Redo did not restore the exact atomic Cut state");
  const pasteSession = createClipboardPasteSession(cut.state, clipboard, { operation: "MOVE", dx: 8, dy: 0, factor: 1, interpolationPolicy: "NEAREST_NEIGHBOR", outOfBoundsPolicy: "CLIP" }, "paste-placement");
  const pastePreview = previewClipboardPaste(cut.state, clipboard, pasteSession);
  if (pastePreview.pixels.length !== clipboard.pixels.length || pastePreview.pixels.some((pixel) => pixel.x < 11 || pixel.x > 12 || pixel.y < 3 || pixel.y > 4)) throw new Error("Paste placement preview did not project the clipboard pixels");
  const pasted = await pasteClipboard(cut.state, { commandType: "clipboard.paste", commandId: "clipboard-paste", schemaVersion: 1, projectId: cut.state.projectId, assetId: cut.state.activeAssetId, actorId: "actor-1", clientId: "client-1", clientSequence: 2, baseStructureEpoch: cut.state.structureEpoch, createdAtMonotonicMs: 2, payload: { clipboard, session: pasteSession } });
  if (!pasted.ok || pasted.state.assets[pasted.state.activeAssetId]?.raster.getPixel(11, 3) !== 1 || pasted.result.dirtyTiles.length !== 1) throw new Error("Paste placement did not commit a bounded destination region");
  const mismatched: ClipboardPayload = { ...clipboard, palette: [0, 0x12345678, 0xff0000ff, 0x0000ffff] };
  if (assessClipboardPalette(mismatched, painted.state.assets[painted.state.activeAssetId]?.palette ?? []).result === "EXACT_PALETTE_MATCH") throw new Error("palette mismatch was reported as exact");
  const rejected = await pasteClipboard(cut.state, { commandType: "clipboard.paste", commandId: "clipboard-bad", schemaVersion: 1, projectId: cut.state.projectId, assetId: cut.state.activeAssetId, actorId: "actor-1", clientId: "client-1", clientSequence: 3, baseStructureEpoch: cut.state.structureEpoch, createdAtMonotonicMs: 3, payload: { clipboard: mismatched, session: pasteSession } });
  if (rejected.ok || !rejected.diagnostics.some((item) => item.code === "CLIPBOARD_PALETTE_MISMATCH")) throw new Error("palette mismatch was silently converted");
  const malformed = await pasteClipboard(cut.state, { commandType: "clipboard.paste", commandId: "clipboard-malformed", schemaVersion: 1, projectId: cut.state.projectId, assetId: cut.state.activeAssetId, actorId: "actor-1", clientId: "client-1", clientSequence: 4, baseStructureEpoch: cut.state.structureEpoch, createdAtMonotonicMs: 4, payload: { clipboard: { ...clipboard, width: 99999 }, session: pasteSession } });
  if (malformed.ok || !malformed.diagnostics.some((item) => item.code === "CLIPBOARD_DIMENSIONS_INVALID")) throw new Error("malformed Clipboard dimensions were accepted");
  const duplicatedPixels: ClipboardPayload = { ...clipboard, pixels: [...clipboard.pixels, clipboard.pixels[0] as SelectionPixel] };
  const duplicatePayload = await pasteClipboard(cut.state, { commandType: "clipboard.paste", commandId: "clipboard-duplicate-pixel", schemaVersion: 1, projectId: cut.state.projectId, assetId: cut.state.activeAssetId, actorId: "actor-1", clientId: "client-1", clientSequence: 5, baseStructureEpoch: cut.state.structureEpoch, createdAtMonotonicMs: 5, payload: { clipboard: duplicatedPixels, session: pasteSession } });
  if (duplicatePayload.ok || !duplicatePayload.diagnostics.some((item) => item.code === "CLIPBOARD_PIXEL_DUPLICATE")) throw new Error("duplicate Clipboard pixels were accepted");
  const unsafeClipboard: ClipboardPayload = { ...clipboard, provenance: "javascript:alert(1)" };
  const unsafe = await pasteClipboard(cut.state, { commandType: "clipboard.paste", commandId: "clipboard-unsafe", schemaVersion: 1, projectId: cut.state.projectId, assetId: cut.state.activeAssetId, actorId: "actor-1", clientId: "client-1", clientSequence: 6, baseStructureEpoch: cut.state.structureEpoch, createdAtMonotonicMs: 6, payload: { clipboard: unsafeClipboard, session: pasteSession } });
  if (unsafe.ok || !unsafe.diagnostics.some((item) => item.code === "CLIPBOARD_PROVENANCE_UNTRUSTED")) throw new Error("unsafe Clipboard provenance was accepted");
  if (!pasted.ok) throw new Error("Paste result unavailable for duplicate command test");
  const duplicateCommand = await pasteClipboard(pasted.state, { commandType: "clipboard.paste", commandId: "clipboard-paste", schemaVersion: 1, projectId: pasted.state.projectId, assetId: pasted.state.activeAssetId, actorId: "actor-1", clientId: "client-1", clientSequence: 7, baseStructureEpoch: pasted.state.structureEpoch, createdAtMonotonicMs: 7, payload: { clipboard, session: pasteSession } });
  if (duplicateCommand.ok || !duplicateCommand.diagnostics.some((item) => item.code === "CLIPBOARD_DUPLICATE_COMMAND")) throw new Error("duplicate Clipboard command was accepted");
});

Deno.test("keeps Layer Track, Frame, and Cel identities separate through structural commands", async () => {
  const initial = createProject({ projectId: "project-wp130-structure", width: 64, height: 64, tileSize: 32 });
  const painted = await new EditorCore(initial).execute(setPixel(initial.projectId, initial.activeAssetId, 1, { payload: { x: 2, y: 2, colorIndex: 1 } }));
  if (!painted.ok) throw new Error("WP-130 source raster fixture failed");
  let state = painted.state;
  const layerTrackId = `${state.projectId}:layer:1`;
  const frameId = `${state.projectId}:frame:1`;
  const run = async (type: TimelineCommand["commandType"], payload: unknown, sequence: number, commandId?: string): Promise<void> => {
    const result = await executeTimelineCommand(state, structuralCommand(state, type, payload, sequence, commandId));
    if (!result.ok) throw new Error(`${type} failed: ${result.diagnostics.map((item) => item.code).join(",")}`);
    state = result.state;
    if (result.result.dirtyTiles.length !== 0 || result.result.trace.fullRasterCloneCount !== 0 || result.result.trace.fullTimelineRebuildCount !== 0) throw new Error(`${type} escaped structural locality`);
  };
  await run("timeline.addLayerTrack", { layerTrackId, name: "Effects" }, 1);
  await run("timeline.addFrame", { frameId, durationMs: 80 }, 2);
  const duplicateFrameId = `${state.projectId}:frame:duplicate`;
  const sourceFrameId = state.timeline.frameOrder[0];
  if (sourceFrameId === undefined) throw new Error("source frame missing");
  const beforeDuplicateMemory = measureTimelineMemory(state);
  await run("timeline.duplicateFrame", { sourceFrameId, frameId: duplicateFrameId }, 3);
  const duplicate = state.frames.find((item) => item.frameId === duplicateFrameId);
  if (duplicate === undefined || duplicate.frameId === sourceFrameId || state.timeline.frameOrder.length !== 3) throw new Error("Frame duplicate identity/order is invalid");
  if (measureTimelineMemory(state).allocatedRasterTileBytes !== beforeDuplicateMemory.allocatedRasterTileBytes) throw new Error("Frame duplicate allocated a new full Raster");
  const duplicatedCel = state.cels.find((item) => item.frameId === duplicateFrameId);
  if (duplicatedCel === undefined || duplicatedCel.celId === state.cels[0]?.celId || duplicatedCel.assetId !== state.cels[0]?.assetId || duplicatedCel.bindingMode !== "DUPLICATE_INDEPENDENT") throw new Error("Duplicate Frame did not preserve separate Cel identity with shared backing");
  const beforeVisibilityHash = await sha256Hex(state.assets[state.activeAssetId]?.raster.toUint8Array());
  await run("timeline.setLayerVisibility", { layerTrackId, visible: false }, 4);
  if (await sha256Hex(state.assets[state.activeAssetId]?.raster.toUint8Array()) !== beforeVisibilityHash) throw new Error("Layer visibility mutated Raster content");
  await run("timeline.setLayerBlendMode", { layerTrackId, blendMode: "MULTIPLY" }, 5);
  if (state.layers.find((item) => item.layerTrackId === layerTrackId)?.blendMode !== "MULTIPLY") throw new Error("Layer blend mode did not persist as structural metadata");
  await run("timeline.reorderFrame", { frameId: duplicateFrameId, targetIndex: 0 }, 6);
  if (state.timeline.frameOrder[0] !== duplicateFrameId || state.frames.find((item) => item.frameId === duplicateFrameId)?.frameId !== duplicateFrameId) throw new Error("Frame reorder changed Stable ID");
  const edited = editCelPixel(state, duplicatedCel.celId, 3, 2, 2);
  if (edited.rasterAssetId === duplicatedCel.assetId || edited.cowSplitCount !== 1 || edited.copiedBytes !== 32 * 32 || edited.state.assets[duplicatedCel.assetId ?? ""]?.raster.getPixel(3, 2) !== 0 || edited.state.assets[edited.rasterAssetId]?.raster.getPixel(3, 2) !== 2) throw new Error("Duplicate Cel edit did not fork and split only the affected Tile");
  const history = new LocalUndoRedoHistory(state);
  const beforeAdd = state;
  const undoFrameId = `${state.projectId}:frame:undo`;
  const addFrameCommand = structuralCommand(state, "timeline.addFrame", { frameId: undoFrameId }, 7, "structure-undo-add");
  const added = await executeTimelineCommand(state, addFrameCommand);
  if (!added.ok) throw new Error("Undo fixture add Frame failed");
  history.record(beforeAdd, added.state, added.result.operation.operationId, added.result.operation.operationType);
  const undone = history.undo();
  const redone = history.redo();
  if (undone === undefined || redone === undefined || undone.state.frames.some((item) => item.frameId === undoFrameId) || !redone.state.frames.some((item) => item.frameId === undoFrameId)) throw new Error("Structural Undo/Redo did not preserve exact Frame identity");
  const journal = new InMemoryStructuralJournal();
  await journal.append(added.result.operation);
  await journal.writeCheckpoint(added.state);
  const sync = new InMemoryStructuralSync();
  await sync.send(toStructuralSyncEnvelope(added.result.operation));
  if (journal.operations.length !== 1 || journal.checkpoints.length !== 1 || sync.envelopes[0]?.snapshotIncluded !== false || canonicalJson(added.result.operation).includes("Uint8Array")) throw new Error("Structural Journal/PiXYNC seam leaked a snapshot");
});

Deno.test("fails closed for malformed, stale, duplicate, and unsafe structural commands", async () => {
  let state = createProject({ projectId: "project-wp130-failures", width: 32, height: 32, tileSize: 32 });
  const initialFrameId = state.timeline.frameOrder[0];
  const initialLayerId = state.timeline.layerTrackOrder[0];
  const initialCelId = state.cels[0]?.celId;
  const initialAssetId = state.activeAssetId;
  if (initialFrameId === undefined || initialLayerId === undefined || initialCelId === undefined) throw new Error("failure fixture identity missing");
  const expectFailure = async (type: TimelineCommand["commandType"], payload: unknown, expected: string, sequence = 1, commandId = `failure-${expected}`): Promise<void> => {
    const result = await executeTimelineCommand(state, structuralCommand(state, type, payload, sequence, commandId));
    if (result.ok || !result.diagnostics.some((item) => item.code === expected)) throw new Error(`${expected} was not fail-closed: ${result.ok ? "accepted" : result.diagnostics.map((item) => item.code).join(",")}`);
  };
  await expectFailure("timeline.addFrame", { frameId: initialFrameId, durationMs: 100 }, "DUPLICATE_FRAME_ID");
  await expectFailure("timeline.setLayerVisibility", { layerTrackId: "project-wp130-failures:layer:unknown", visible: false }, "UNKNOWN_LAYER_TRACK");
  await expectFailure("timeline.changeFrameDuration", { frameId: initialFrameId, durationMs: 0 }, "FRAME_DURATION_INVALID");
  await expectFailure("timeline.removeFrame", { frameId: initialFrameId }, "REMOVE_LAST_FRAME_FORBIDDEN");
  await expectFailure("timeline.createCel", { celId: "project-wp130-failures:cel:unsafe-empty", frameId: initialFrameId, layerTrackId: initialLayerId, rasterAssetId: initialAssetId, bindingMode: "EMPTY" }, "EMPTY_CEL_HAS_RASTER");
  await expectFailure("timeline.createCel", { celId: "project-wp130-failures:cel:unknown-frame", frameId: "project-wp130-failures:frame:unknown", layerTrackId: initialLayerId }, "UNKNOWN_FRAME");
  await expectFailure("timeline.reorderFrame", { frameId: initialFrameId, targetIndex: 99 }, "STRUCTURE_ORDER_INVALID");

  const acceptedCommand = structuralCommand(state, "timeline.addFrame", { frameId: "project-wp130-failures:frame:accepted", durationMs: 100 }, 1, "failure-stale-source");
  const accepted = await executeTimelineCommand(state, acceptedCommand);
  if (!accepted.ok) throw new Error("accepted structural failure fixture command was rejected");
  state = accepted.state;
  const duplicate = await executeTimelineCommand(state, acceptedCommand);
  if (duplicate.ok || !duplicate.diagnostics.some((item) => item.code === "DUPLICATE_STRUCTURE_COMMAND") || !duplicate.diagnostics.some((item) => item.code === "STRUCTURE_CLIENT_SEQUENCE_GAP")) throw new Error("stale duplicate structural command was accepted");
  if (state.cels.some((item) => item.celId === "project-wp130-failures:cel:unsafe-empty" || item.celId === initialCelId && item.frameId === "project-wp130-failures:frame:unknown")) throw new Error("failed structural command mutated Cel state");
});

Deno.test("keeps Timeline virtualization, Onion Skin, Playback, and personal session state projected", async () => {
  let state = createProject({ projectId: "project-wp130-window", width: 32, height: 32, tileSize: 32 });
  for (let sequence = 1; sequence <= 999; sequence += 1) {
    const frameId = `${state.projectId}:frame:${sequence}`;
    const result = await executeTimelineCommand(state, structuralCommand(state, "timeline.addFrame", { frameId, durationMs: 100 }, sequence));
    if (!result.ok) throw new Error(`1000-frame fixture failed at ${sequence}: ${result.diagnostics.map((item) => item.code).join(",")}`);
    state = result.state;
  }
  if (state.frames.length !== 1000 || state.cels.length !== 1) throw new Error("1000-frame fixture materialized Empty Cels or lost Frames");
  const window = calculateTimelineWindow(state, { scrollTop: 0, scrollLeft: 48 * 500, viewportWidth: 480, viewportHeight: 380, overscan: 2 });
  if (window.frameIds.length >= state.frames.length || window.layerTrackIds.length !== 1 || window.totalWidth !== 1000 * 48) throw new Error("Timeline virtual window materialized all Frames");
  const memory = measureTimelineMemory(state, window.frameIds.length);
  if (memory.emptyCelCount !== 0 || memory.timelineProjectionWindowCount !== window.frameIds.length || memory.allocatedRasterTileBytes !== 0) throw new Error("1000-frame sparse metadata memory boundary is invalid");
  const activeFrameId = state.timeline.frameOrder[500];
  if (activeFrameId === undefined) throw new Error("active 1000-frame fixture Frame missing");
  const session = createTimelineSession(state);
  const changedSession = setTimelineSessionActiveFrame(state, session, activeFrameId);
  if (changedSession.activeFrameId !== activeFrameId || state.activeFrameId === activeFrameId) throw new Error("Active Frame session state mutated Canonical Project State");
  const onion = resolveOnionSkinNeighborhood(state, activeFrameId, { enabled: true, previousFrameCount: 2, nextFrameCount: 2, opacity: 0.5 });
  if (onion.references.length !== 4 || onion.canonicalMutation !== false || onion.dirtyDomain !== "ONION_SKIN_DIRTY") throw new Error("Onion Skin projection boundary is invalid");
  const beforeHash = await sha256Hex(state.assets[state.activeAssetId]?.raster.toUint8Array());
  const playbackAtStart = resolvePlaybackProjection(state, activeFrameId, 0);
  const playback = resolvePlaybackProjection(state, activeFrameId, 12_345);
  const afterHash = await sha256Hex(state.assets[state.activeAssetId]?.raster.toUint8Array());
  if (playbackAtStart.frameId !== activeFrameId || playback.canonicalMutation !== false || playback.requestFrameIds.length !== 1 || beforeHash !== afterHash) throw new Error("Playback mutated Canonical Raster or ignored the active Frame session");
});

Deno.test("does not promote raster or palette no-ops to canonical history", async () => {
  const state = createProject({ projectId: "core-no-op", width: 8, height: 8, tileSize: 32 });
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("no-op asset missing");
  const core = new EditorCore(state);
  const raster = await core.execute(setPixel(state.projectId, asset.id, 1, {
    payload: { x: 0, y: 0, colorIndex: 0 },
  }));
  if (!raster.ok || !raster.result.noOp || raster.state !== state || raster.state.appliedCommandIds.length !== 0) throw new Error("same-pixel raster command became canonical");
  const palette = await core.execute({
    ...setPixel(state.projectId, asset.id, 1),
    commandId: "palette-no-op",
    commandType: "palette.setColor",
    payload: { paletteIndex: 1, color: asset.palette[1] },
  } as EditorCommand);
  if (!palette.ok || !palette.result.noOp || palette.state !== state || palette.state.appliedCommandIds.length !== 0) throw new Error("same-color palette command became canonical");
});

Deno.test("rebases local undo snapshots without removing a later remote raster edit", async () => {
  const state = {
    ...createProject({ projectId: "history-rebase", width: 8, height: 8, tileSize: 32 }),
    lastClientSequenceByClient: { "remote-client": 4 },
  };
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("history rebase asset missing");
  const localCore = new EditorCore(state);
  const local = await localCore.execute(setPixel(state.projectId, asset.id, 1, {
    payload: { x: 0, y: 0, colorIndex: 1 },
  }));
  if (!local.ok) throw new Error("local history fixture failed");
  const history = new LocalUndoRedoHistory(state);
  history.record(state, local.state, local.result.operation.operationId, local.result.operation.operationType);
  const remote = setPixel(state.projectId, asset.id, 1, {
    commandId: "remote-raster-1",
    actorId: "remote-actor",
    clientId: "remote-client",
    clientSequence: 5,
    payload: { x: 1, y: 0, colorIndex: 2 },
  });
  const remoteResult = await new EditorCore(local.state).execute(remote);
  if (!remoteResult.ok) throw new Error("remote history fixture failed");
  await history.rebaseRemoteRasterOperation(remote, remoteResult.state);
  const undone = history.undo();
  if (undone === undefined) throw new Error("rebased local history disappeared");
  const undoneAsset = undone.state.assets[asset.id];
  if (undoneAsset?.raster.getPixel(0, 0) !== 0 || undoneAsset.raster.getPixel(1, 0) !== 2) {
    throw new Error("Undo removed a later remote raster edit");
  }
  const redone = history.redo();
  if (redone === undefined) throw new Error("rebased local redo disappeared");
  const redoneAsset = redone.state.assets[asset.id];
  if (redoneAsset?.raster.getPixel(0, 0) !== 1 || redoneAsset.raster.getPixel(1, 0) !== 2) {
    throw new Error("Redo failed to preserve the remote raster edit");
  }
  if (redone.state.lastClientSequenceByClient["remote-client"] !== 5) {
    throw new Error("Undo/Redo changed the remote client sequence");
  }
  const nextRemote = setPixel(state.projectId, asset.id, 6, {
    commandId: "remote-raster-2",
    actorId: "remote-actor",
    clientId: "remote-client",
    clientSequence: 6,
    payload: { x: 2, y: 0, colorIndex: 3 },
  });
  const nextRemoteResult = await new EditorCore(redone.state).execute(nextRemote);
  if (!nextRemoteResult.ok || nextRemoteResult.state.assets[asset.id]?.raster.getPixel(2, 0) !== 3) {
    throw new Error("The next remote raster operation was rejected after Undo/Redo");
  }
});
