import {
  EditorCore,
  createProject,
  sha256Hex,
  type EditorCommand,
  type ProjectState,
} from "../src/draw2-core.ts";
import {
  commitTransform,
  createRectangleSelectionSnapshot,
  createTransformSession,
  previewTransform,
  type TransformDescriptor,
} from "../src/draw2-selection.ts";

const transform: TransformDescriptor = {
  operation: "MOVE",
  dx: 32,
  dy: 0,
  factor: 1,
  interpolationPolicy: "NEAREST_NEIGHBOR",
  outOfBoundsPolicy: "CLIP",
};

function setPixelCommand(state: ProjectState, sequence: number, x: number, y: number, colorIndex: number): EditorCommand {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("Benchmark asset is missing.");
  return {
    commandId: `wp120-benchmark-${state.projectId}-${sequence}`,
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: "wp120-benchmark",
    clientId: "wp120-benchmark-client",
    clientSequence: sequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: sequence,
    payload: { x, y, colorIndex },
  };
}

async function fixture(size: number): Promise<ProjectState> {
  const initial = createProject({ projectId: `wp120-benchmark-${size}`, width: size, height: size, tileSize: 32 });
  const source = await new EditorCore(initial).execute(setPixelCommand(initial, 1, 8, 8, 1));
  if (!source.ok) throw new Error(`source fixture failed for ${size}`);
  const destination = await new EditorCore(source.state).execute(setPixelCommand(source.state, 2, 40, 8, 2));
  if (!destination.ok) throw new Error(`destination fixture failed for ${size}`);
  return destination.state;
}

const records = [];
for (const size of [256, 512, 1024]) {
  const state = await fixture(size);
  const selection = createRectangleSelectionSnapshot(state, { x: 8, y: 8, width: 16, height: 16 }, `benchmark-selection-${size}`, 1);
  const session = createTransformSession(selection, transform, `benchmark-transform-${size}`);
  const previewStarted = performance.now();
  const preview = previewTransform(selection, session);
  const previewMs = performance.now() - previewStarted;
  const command = {
    commandType: "selection.transformCommit" as const,
    commandId: `benchmark-transform-commit-${size}`,
    schemaVersion: 1 as const,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "wp120-benchmark",
    clientId: "wp120-benchmark-client",
    clientSequence: 3,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: 3,
    payload: { selection, session },
  };
  const beforeMetrics = state.assets[state.activeAssetId]?.raster.memoryMetrics();
  const beforeHash = await sha256Hex(state.assets[state.activeAssetId]?.raster.toUint8Array());
  const commitStarted = performance.now();
  const committed = await commitTransform(state, command);
  const commitMs = performance.now() - commitStarted;
  if (!committed.ok) throw new Error(`commit fixture failed for ${size}`);
  const afterAsset = committed.state.assets[committed.state.activeAssetId];
  if (afterAsset === undefined || beforeMetrics === undefined) throw new Error(`commit asset missing for ${size}`);
  records.push({
    size,
    selectionPixels: selection.pixels.length,
    previewPixels: preview.pixels.length,
    previewMs: Number(previewMs.toFixed(3)),
    commitMs: Number(commitMs.toFixed(3)),
    previewMetricScope: preview.metricScope,
    commitMetricScope: committed.result.metricScope,
    previewCanonicalDirtyTiles: preview.canonicalDirtyTiles.length,
    previewCanonicalDirtyRegions: preview.canonicalDirtyRegions.length,
    affectedTiles: committed.result.dirtyTiles.length,
    dirtyRegions: committed.result.dirtyRegions.length,
    copiedBytes: committed.result.copiedBytes,
    cowSplitCount: committed.result.cowSplitCount,
    allocatedTileBytesBefore: beforeMetrics.allocatedTileBytes,
    allocatedTileBytesAfter: afterAsset.raster.memoryMetrics().allocatedTileBytes,
    fullRasterCloneCount: committed.result.trace.fullRasterCloneCount,
    fullTimelineRebuildCount: committed.result.trace.fullTimelineRebuildCount,
    sourceHashUnchanged: beforeHash === await sha256Hex(state.assets[state.activeAssetId]?.raster.toUint8Array()),
    previewUnderLongTaskBudget: previewMs < 50,
  });
}

console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP120_SELECTION_TRANSFORM_SPARSE_FIXTURES",
  metricScopes: ["COMMAND_ONLY", "COMMAND_TO_DIRTY", "DIRTY_TO_PRESENT", "INPUT_TO_VISIBLE", "FULL_COMPOSITOR", "PREVIEW_ONLY"],
  status: "MEASURED_LOCAL_SYNTHETIC",
  records,
  notes: [
    "Fixtures are sparse 256, 512, and 1024 indexed rasters with a 16x16 selection and a 32px move.",
    "The benchmark checks affected-Tile COW and dirty locality; it does not claim real-device or full-compositor performance PASS.",
    "Full-raster hash is used only for source immutability verification, not the active preview or commit mutation path.",
  ],
}, null, 2));
