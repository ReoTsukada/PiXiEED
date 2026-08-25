import {
  EditorCore,
  ReferenceRenderer,
  createProject,
  sha256Hex,
  canonicalJson,
  type CommandResult,
  type DirtyRegion,
  type EditorCommand,
  type ProjectState,
  type RendererResult,
  type RasterMemoryMetrics,
  type TileSize,
} from "./draw2-core.ts";

export const REFERENCE_SAMPLE_COUNT = 40;

export interface BenchmarkEnvironment {
  readonly deviceClass: string;
  readonly actualDevice: string;
  readonly browser: "CHROMIUM" | "SAFARI" | "FIREFOX" | "OTHER";
  readonly browserVersion: string;
  readonly os: string;
  readonly buildVersion: string;
  readonly condition: "COLD" | "WARM";
  readonly surface: "NODE_RUNTIME" | "ACTUAL_BROWSER" | "DESKTOP_SIMULATED_MOBILE_FIXTURE";
}

export interface LongTaskSnapshot {
  readonly available: boolean;
  readonly count: number;
  readonly totalMs: number;
  readonly maxMs: number;
  readonly note?: string;
}

export interface Distribution {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly sampleCount: number;
}

export interface ReferencePresent {
  (state: ProjectState, assetId: string, regions: readonly DirtyRegion[]): Promise<void> | void;
}

export interface ReferenceBenchmarkOptions {
  readonly environment: BenchmarkEnvironment;
  readonly iterations?: number;
  readonly present?: ReferencePresent;
  readonly longTasks?: LongTaskSnapshot;
}

export interface SinglePixelTrace {
  readonly commandValidationCount: number;
  readonly commandCommitCount: number;
  readonly touchedTileCount: number;
  readonly cowSplitCount: number;
  readonly copiedBytes: number;
  readonly dirtyTileCount: number;
  readonly dirtyRegionArea: number;
  readonly affectedLayerCount: number;
  readonly affectedFrameCount: number;
  readonly rendererPreparationArea: number;
  readonly presentArea: number;
  readonly canonicalRasterAllocationDelta: number;
  readonly fullRasterCloneCount: number;
  readonly fullTimelineRebuildCount: number;
  readonly wholeProjectSerializationCount: number;
}

export interface MemorySnapshot {
  readonly logicalRasterBytes: number;
  readonly allocatedTileBytes: number;
  readonly sharedTileBytes: number;
  readonly tileCount: number;
  readonly implicitTransparentTileCount: number;
  readonly cowSplitCount: number;
  readonly copiedBytes: number;
}

export interface SinglePixelRecord {
  readonly benchmarkId: string;
  readonly projectFixture: string;
  readonly environment: BenchmarkEnvironment;
  readonly iterations: number;
  readonly inputToVisibleMs: Distribution;
  readonly commandValidationMs: Distribution;
  readonly commandCommitMs: Distribution;
  readonly trace: SinglePixelTrace;
  readonly memory: {
    readonly before: MemorySnapshot;
    readonly after: MemorySnapshot;
    readonly deltaAllocatedTileBytes: number;
    readonly componentCategories: {
      readonly logicalRasterBytes: number;
      readonly canonicalRasterBytes: number;
      readonly tileMetadataBytes: number | null;
      readonly sharedCOWBytes: number;
      readonly cowSplitBytes: number;
      readonly rendererCacheBytes: number;
      readonly journalBytes: number;
      readonly workerTransferBytes: number;
      readonly temporaryOperationBytes: number;
      readonly opfsCacheBytes: number;
    };
  };
  readonly longTasks: LongTaskSnapshot;
  readonly status: "UNTESTED";
  readonly statusReason: string;
}

export interface CowRecord {
  readonly benchmarkId: string;
  readonly projectFixture: string;
  readonly tileSize: TileSize;
  readonly sourceGoldenHash: string;
  readonly duplicateGoldenHash: string;
  readonly sourceUnchanged: boolean;
  readonly duplicateChanged: boolean;
  readonly sharedBytesBeforeEdit: number;
  readonly sharedBytesAfterEdit: number;
  readonly cowSplitCount: number;
  readonly copiedBytes: number;
  readonly expectedCopiedBytes: number;
  readonly status: "UNTESTED";
  readonly statusReason: string;
}

export interface SparseRecord {
  readonly benchmarkId: string;
  readonly canvas: string;
  readonly tileSize: TileSize;
  readonly sparse: MemorySnapshot;
  readonly tileDense: MemorySnapshot;
  readonly logicalCanvasBytes: number;
  readonly status: "UNTESTED";
  readonly statusReason: string;
}

export interface TileWorkloadRecord {
  readonly workload: "single-pixel" | "short-stroke" | "long-stroke" | "duplicate-cow" | "fill" | "composite";
  readonly tileSize: TileSize;
  readonly status: "MEASURED_REFERENCE" | "UNTESTED";
  readonly reason?: string;
  readonly iterations: number;
  readonly latencyMs?: Distribution;
  readonly touchedTileCount?: Distribution;
  readonly copiedBytes?: Distribution;
  readonly allocatedTileBytes?: Distribution;
  readonly allocationCount?: Distribution;
  readonly metadataOverheadBytes?: number | null;
}

export interface DeterminismRecord {
  readonly benchmarkId: string;
  readonly commandCount: number;
  readonly canonicalPixelHashA: string;
  readonly canonicalPixelHashB: string;
  readonly structureHashA: string;
  readonly structureHashB: string;
  readonly commandResultHashA: string;
  readonly commandResultHashB: string;
  readonly dirtyResultHashA: string;
  readonly dirtyResultHashB: string;
  readonly matched: boolean;
  readonly status: "MEASURED_REFERENCE";
}

export interface ReferenceBenchmarkOutput {
  readonly schemaVersion: 1;
  readonly benchmarkId: "WP110_REFERENCE_PERFORMANCE_CHECKPOINT";
  readonly measuredAt: string;
  readonly environment: BenchmarkEnvironment;
  readonly samplePolicy: {
    readonly minimumFormalP95Samples: number;
    readonly usedSamples: number;
    readonly p95GateEvaluated: false;
  };
  readonly scope: {
    readonly canonicalCore: string;
    readonly activeEditingPath: string;
    readonly heavyTasks: "SEPARATE_BUDGET";
    readonly layerFrameCoverage: "CORE_SLICE_ONLY";
  };
  readonly singlePixel: readonly SinglePixelRecord[];
  readonly cow: readonly CowRecord[];
  readonly sparse: readonly SparseRecord[];
  readonly determinism: DeterminismRecord;
  readonly tileComparison: readonly TileWorkloadRecord[];
  readonly technology: {
    readonly tileSize: "DECISION_PENDING";
    readonly renderer: "DECISION_PENDING";
    readonly workerTopology: "DECISION_PENDING";
    readonly offscreenCanvas: "UNTESTED_CANDIDATE";
    readonly webgpu: "UNTESTED_OPTIONAL_CANDIDATE";
    readonly wasm: "UNTESTED_CANDIDATE";
    readonly sharedArrayBuffer: "UNTESTED_OPTIONAL_CANDIDATE";
  };
  readonly notes: readonly string[];
}

function distribution(values: readonly number[]): Distribution {
  if (values.length < 1) throw new Error("A benchmark distribution requires one sample.");
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return {
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted[sorted.length - 1] ?? 0,
    sampleCount: values.length,
  };
}

function memorySnapshot(metrics: RasterMemoryMetrics): MemorySnapshot {
  return { ...metrics };
}

function setPixelCommand(state: ProjectState, sequence: number, x: number, y: number, colorIndex = 1): EditorCommand {
  return {
    commandId: `wp110-command-${state.projectId}-${sequence}`,
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "wp110-benchmark-actor",
    clientId: "wp110-benchmark-client",
    clientSequence: sequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: sequence,
    payload: { x, y, colorIndex },
  };
}

function strokeCommand(state: ProjectState, sequence: number, points: readonly { x: number; y: number }[]): EditorCommand {
  return {
    commandId: `wp110-stroke-${state.projectId}-${sequence}`,
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "wp110-benchmark-actor",
    clientId: "wp110-benchmark-client",
    clientSequence: sequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: sequence,
    payload: { points, colorIndex: 1 },
  };
}

function ensureSuccess(result: Awaited<ReturnType<EditorCore["execute"]>>): Extract<typeof result, { ok: true }> {
  if (!result.ok) throw new Error(result.diagnostics.map((item) => item.code).join(","));
  return result;
}

async function measureSinglePixel(options: ReferenceBenchmarkOptions, width: number, height: number, fixture: string): Promise<SinglePixelRecord> {
  const iterations = options.iterations ?? REFERENCE_SAMPLE_COUNT;
  const inputToVisible: number[] = [];
  const validation: number[] = [];
  const commit: number[] = [];
  let representative: { result: CommandResult; renderer: RendererResult; before: MemorySnapshot; after: MemorySnapshot } | undefined;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const state = createProject({ projectId: `wp110-${fixture}-${iteration}`, width, height, tileSize: 32 });
    const before = memorySnapshot(state.assets[state.activeAssetId]?.raster.memoryMetrics() ?? {
      logicalRasterBytes: width * height,
      allocatedTileBytes: 0,
      sharedTileBytes: 0,
      tileCount: 0,
      implicitTransparentTileCount: 0,
      cowSplitCount: 0,
      copiedBytes: 0,
    });
    const instrumentation = new (class {
      readonly points: Array<{ name: string; durationMs: number }> = [];
      record(point: { name: string; durationMs: number }): void { this.points.push(point); }
    })();
    const core = new EditorCore(state, { instrumentation });
    const x = iteration % Math.max(1, Math.min(width, 32));
    const y = Math.floor(iteration / Math.max(1, Math.min(width, 32))) % Math.max(1, Math.min(height, 32));
    const command = setPixelCommand(state, 1, x, y);
    const started = performance.now();
    const executed = ensureSuccess(await core.execute(command));
    const rendered = await new ReferenceRenderer().render({
      state: executed.state,
      assetId: state.activeAssetId,
      dirtyTiles: executed.result.dirtyTiles,
      dirtyRegions: executed.result.dirtyRegions,
      mode: "DIRTY_REGIONS",
    });
    if (options.present !== undefined) await options.present(executed.state, state.activeAssetId, executed.result.dirtyRegions);
    inputToVisible.push(performance.now() - started);
    validation.push(instrumentation.points.find((point) => point.name === "command.validate")?.durationMs ?? 0);
    commit.push(instrumentation.points.find((point) => point.name === "command.commit")?.durationMs ?? 0);
    const after = memorySnapshot(executed.result.memory);
    representative ??= { result: executed.result, renderer: rendered, before, after };
  }
  if (representative === undefined) throw new Error("Single pixel benchmark did not produce a sample.");
  const { result, renderer, before, after } = representative;
  const recordEnvironment: BenchmarkEnvironment = height === 256
    ? { ...options.environment, deviceClass: "desktop-simulated-mobile-fixture", surface: "DESKTOP_SIMULATED_MOBILE_FIXTURE" }
    : options.environment;
  const dirtyRegionArea = result.dirtyRegions.reduce((total, region) => total + region.width * region.height, 0);
  return {
    benchmarkId: `WP110_REFERENCE_SINGLE_PIXEL_${width}X${height}`,
    projectFixture: fixture,
    environment: recordEnvironment,
    iterations,
    inputToVisibleMs: distribution(inputToVisible),
    commandValidationMs: distribution(validation),
    commandCommitMs: distribution(commit),
    trace: {
      commandValidationCount: result.trace.commandValidationCount,
      commandCommitCount: result.trace.commandCommitCount,
      touchedTileCount: result.dirtyTiles.length,
      cowSplitCount: result.cowSplitCount,
      copiedBytes: result.copiedBytes,
      dirtyTileCount: result.dirtyTiles.length,
      dirtyRegionArea,
      affectedLayerCount: result.trace.affectedLayerCount,
      affectedFrameCount: result.trace.affectedFrameCount,
      rendererPreparationArea: renderer.preparationPixelCount,
      presentArea: renderer.presentPixelCount,
      canonicalRasterAllocationDelta: after.allocatedTileBytes - before.allocatedTileBytes,
      fullRasterCloneCount: result.trace.fullRasterCloneCount,
      fullTimelineRebuildCount: result.trace.fullTimelineRebuildCount,
      wholeProjectSerializationCount: result.trace.wholeProjectSerializationCount,
    },
    memory: {
      before,
      after,
      deltaAllocatedTileBytes: after.allocatedTileBytes - before.allocatedTileBytes,
      componentCategories: {
        logicalRasterBytes: after.logicalRasterBytes,
        canonicalRasterBytes: after.allocatedTileBytes,
        tileMetadataBytes: null,
        sharedCOWBytes: after.sharedTileBytes,
        cowSplitBytes: result.copiedBytes,
        rendererCacheBytes: 0,
        journalBytes: 0,
        workerTransferBytes: 0,
        temporaryOperationBytes: new TextEncoder().encode(canonicalJson(result.operation)).byteLength,
        opfsCacheBytes: 0,
      },
    },
    longTasks: options.longTasks ?? { available: false, count: 0, totalMs: 0, maxMs: 0, note: "Long Task observer not supplied." },
    status: "UNTESTED",
    statusReason: "Reference measurements are recorded, but formal p95/device gates are not evaluated by this checkpoint.",
  };
}

async function measureDeterminism(): Promise<DeterminismRecord> {
  const stateA = createProject({ projectId: "wp110-determinism", width: 128, height: 128, tileSize: 32 });
  const stateB = createProject({ projectId: "wp110-determinism", width: 128, height: 128, tileSize: 32 });
  const coreA = new EditorCore(stateA);
  const coreB = new EditorCore(stateB);
  const commands = [
    setPixelCommand(stateA, 1, 1, 1, 1),
    setPixelCommand(stateA, 2, 2, 1, 2),
    strokeCommand(stateA, 3, [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }]),
  ];
  const resultsA: unknown[] = [];
  const resultsB: unknown[] = [];
  for (const command of commands) {
    let commandB: EditorCommand;
    if (command.commandType === "raster.setPixel") commandB = { ...command, payload: { ...command.payload } };
    else if (command.commandType === "raster.strokeCommit") commandB = { ...command, payload: { ...command.payload, points: [...command.payload.points] } };
    else throw new Error("Determinism fixture contains an unsupported command.");
    const resultA = ensureSuccess(await coreA.execute(command));
    const resultB = ensureSuccess(await coreB.execute(commandB));
    resultsA.push({ operation: resultA.result.operation, memory: resultA.result.memory, trace: resultA.result.trace });
    resultsB.push({ operation: resultB.result.operation, memory: resultB.result.memory, trace: resultB.result.trace });
  }
  const assetA = coreA.state.assets[coreA.state.activeAssetId];
  const assetB = coreB.state.assets[coreB.state.activeAssetId];
  if (assetA === undefined || assetB === undefined) throw new Error("Determinism asset missing.");
  const canonicalPixelHashA = await sha256Hex(assetA.raster.toUint8Array());
  const canonicalPixelHashB = await sha256Hex(assetB.raster.toUint8Array());
  const structureA = { schemaVersion: coreA.state.schemaVersion, structureEpoch: coreA.state.structureEpoch, assetId: assetA.id, revision: assetA.revision, palette: assetA.palette };
  const structureB = { schemaVersion: coreB.state.schemaVersion, structureEpoch: coreB.state.structureEpoch, assetId: assetB.id, revision: assetB.revision, palette: assetB.palette };
  const commandResultHashA = await sha256Hex(resultsA);
  const commandResultHashB = await sha256Hex(resultsB);
  const dirtyResultHashA = await sha256Hex(resultsA.map((entry) => (entry as { trace: unknown }).trace));
  const dirtyResultHashB = await sha256Hex(resultsB.map((entry) => (entry as { trace: unknown }).trace));
  const structureHashA = await sha256Hex(structureA);
  const structureHashB = await sha256Hex(structureB);
  return {
    benchmarkId: "WP110_REFERENCE_DETERMINISM",
    commandCount: commands.length,
    canonicalPixelHashA,
    canonicalPixelHashB,
    structureHashA,
    structureHashB,
    commandResultHashA,
    commandResultHashB,
    dirtyResultHashA,
    dirtyResultHashB,
    matched: canonicalPixelHashA === canonicalPixelHashB && structureHashA === structureHashB && commandResultHashA === commandResultHashB && dirtyResultHashA === dirtyResultHashB,
    status: "MEASURED_REFERENCE",
  };
}

async function measureCow(tileSize: TileSize): Promise<CowRecord> {
  const initial = createProject({ projectId: `wp110-cow-${tileSize}`, width: 128, height: 128, tileSize });
  const first = ensureSuccess(await new EditorCore(initial).execute(setPixelCommand(initial, 1, 4, 4, 1)));
  const frameA = first.state;
  const sourceAsset = frameA.assets[frameA.activeAssetId];
  if (sourceAsset === undefined) throw new Error("COW source asset missing.");
  const sourceGoldenHash = await sha256Hex(sourceAsset.raster.toUint8Array());
  const sharedRaster = sourceAsset.raster.sharedClone();
  const sharedState: ProjectState = {
    ...frameA,
    assets: { ...frameA.assets, [frameA.activeAssetId]: { ...sourceAsset, raster: sharedRaster } },
  };
  const sharedBytesBeforeEdit = sharedRaster.memoryMetrics().sharedTileBytes;
  const second = ensureSuccess(await new EditorCore(sharedState).execute(setPixelCommand(sharedState, 2, 5, 4, 2)));
  const duplicateAsset = second.state.assets[second.state.activeAssetId];
  if (duplicateAsset === undefined) throw new Error("COW duplicate asset missing.");
  const duplicateGoldenHash = await sha256Hex(duplicateAsset.raster.toUint8Array());
  const sourceUnchanged = (await sha256Hex(sourceAsset.raster.toUint8Array())) === sourceGoldenHash && sourceAsset.raster.getPixel(5, 4) === 0;
  return {
    benchmarkId: `WP110_REFERENCE_COW_${tileSize}`,
    projectFixture: "FRAME_DUPLICATE_SYNTHETIC",
    tileSize,
    sourceGoldenHash,
    duplicateGoldenHash,
    sourceUnchanged,
    duplicateChanged: duplicateGoldenHash !== sourceGoldenHash && duplicateAsset.raster.getPixel(5, 4) === 2,
    sharedBytesBeforeEdit,
    sharedBytesAfterEdit: second.result.memory.sharedTileBytes,
    cowSplitCount: second.result.cowSplitCount,
    copiedBytes: second.result.copiedBytes,
    expectedCopiedBytes: tileSize * tileSize,
    status: "UNTESTED",
    statusReason: "COW correctness is measured; formal duplicate latency gate is not evaluated here.",
  };
}

async function measureSparse(tileSize: TileSize): Promise<SparseRecord> {
  const width = 1024;
  const height = 1024;
  const sparse = createProject({ projectId: `wp110-sparse-${tileSize}`, width, height, tileSize });
  const sparseResult = ensureSuccess(await new EditorCore(sparse).execute(setPixelCommand(sparse, 1, 1, 1)));
  const tileDense = createProject({ projectId: `wp110-dense-${tileSize}`, width, height, tileSize });
  const tileColumns = Math.ceil(width / tileSize);
  const tileRows = Math.ceil(height / tileSize);
  const denseCore = new EditorCore(tileDense);
  for (let tileY = 0; tileY < tileRows; tileY += 1) {
    for (let tileX = 0; tileX < tileColumns; tileX += 1) {
      const sequence = tileY * tileColumns + tileX + 1;
      ensureSuccess(await denseCore.execute(setPixelCommand(tileDense, sequence, tileX * tileSize, tileY * tileSize)));
    }
  }
  const sparseAsset = sparseResult.state.assets[sparseResult.state.activeAssetId];
  const denseAsset = denseCore.state.assets[denseCore.state.activeAssetId];
  if (sparseAsset === undefined || denseAsset === undefined) throw new Error("Sparse fixture asset missing.");
  return {
    benchmarkId: `WP110_REFERENCE_SPARSE_${tileSize}`,
    canvas: "1024x1024",
    tileSize,
    sparse: memorySnapshot(sparseAsset.raster.memoryMetrics()),
    tileDense: memorySnapshot(denseAsset.raster.memoryMetrics()),
    logicalCanvasBytes: width * height,
    status: "UNTESTED",
    statusReason: "Sparse allocation is measured; dense fixture is tile-dense (one pixel per tile), not a full pixel fill.",
  };
}

async function measureTileWorkload(workload: TileWorkloadRecord["workload"], tileSize: TileSize, iterations: number): Promise<TileWorkloadRecord> {
  if (workload === "fill" || workload === "composite") return { workload, tileSize, status: "UNTESTED", reason: "WP-110 feature is not implemented; fixture is reserved without a fabricated measurement.", iterations };
  const latency: number[] = [];
  const touchedTiles: number[] = [];
  const copiedBytes: number[] = [];
  const allocatedTileBytes: number[] = [];
  const allocationCount: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const state = createProject({ projectId: `wp110-tile-${workload}-${tileSize}-${iteration}`, width: 512, height: 512, tileSize });
    const core = new EditorCore(state);
    const started = performance.now();
    let executed: Extract<Awaited<ReturnType<EditorCore["execute"]>>, { ok: true }>;
    if (workload === "single-pixel") {
      executed = ensureSuccess(await core.execute(setPixelCommand(state, 1, 1, 1)));
    } else if (workload === "short-stroke") {
      executed = ensureSuccess(await core.execute(strokeCommand(state, 1, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }])));
    } else if (workload === "long-stroke") {
      executed = ensureSuccess(await core.execute(strokeCommand(state, 1, Array.from({ length: 256 }, (_, index) => ({ x: index, y: 10 })))));
    } else {
      const first = ensureSuccess(await core.execute(setPixelCommand(state, 1, 1, 1)));
      const duplicateCore = new EditorCore(first.state);
      executed = ensureSuccess(await duplicateCore.execute(setPixelCommand(first.state, 2, 2, 1, 2)));
    }
    const rendered = await new ReferenceRenderer().render({
      state: executed.state,
      assetId: state.activeAssetId,
      dirtyTiles: executed.result.dirtyTiles,
      dirtyRegions: executed.result.dirtyRegions,
      mode: "DIRTY_REGIONS",
    });
    latency.push(performance.now() - started);
    touchedTiles.push(executed.result.dirtyTiles.length);
    copiedBytes.push(executed.result.copiedBytes);
    allocatedTileBytes.push(executed.result.memory.allocatedTileBytes + rendered.preparationPixelCount * 0);
    allocationCount.push(executed.result.memory.tileCount);
  }
  return {
    workload,
    tileSize,
    status: "MEASURED_REFERENCE",
    iterations,
    latencyMs: distribution(latency),
    touchedTileCount: distribution(touchedTiles),
    copiedBytes: distribution(copiedBytes),
    allocatedTileBytes: distribution(allocatedTileBytes),
    allocationCount: distribution(allocationCount),
    metadataOverheadBytes: null,
  };
}

export async function runReferenceBenchmark(options: ReferenceBenchmarkOptions): Promise<ReferenceBenchmarkOutput> {
  const iterations = options.iterations ?? REFERENCE_SAMPLE_COUNT;
  const singlePixel = [
    await measureSinglePixel(options, 512, 512, "PROJECT_B_DESKTOP_REFERENCE_CORE_SLICE"),
    await measureSinglePixel(options, 256, 256, "PROJECT_A_MOBILE_REFERENCE_CORE_SLICE"),
  ];
  const cow = [await measureCow(32), await measureCow(64)];
  const sparse = [await measureSparse(32), await measureSparse(64)];
  const determinism = await measureDeterminism();
  const tileComparison: TileWorkloadRecord[] = [];
  for (const tileSize of [32, 64] as const) {
    for (const workload of ["single-pixel", "short-stroke", "long-stroke", "duplicate-cow", "fill", "composite"] as const) {
      tileComparison.push(await measureTileWorkload(workload, tileSize, Math.min(iterations, REFERENCE_SAMPLE_COUNT)));
    }
  }
  return {
    schemaVersion: 1,
    benchmarkId: "WP110_REFERENCE_PERFORMANCE_CHECKPOINT",
    measuredAt: new Date().toISOString(),
    environment: options.environment,
    samplePolicy: { minimumFormalP95Samples: 30, usedSamples: iterations, p95GateEvaluated: false },
    scope: {
      canonicalCore: "pixiedraw2/src/draw2-core.ts",
      activeEditingPath: "command → dirty Tile/Region → Reference dirty-region preparation → optional Canvas present",
      heavyTasks: "SEPARATE_BUDGET",
      layerFrameCoverage: "CORE_SLICE_ONLY",
    },
    singlePixel,
    cow,
    sparse,
    determinism,
    tileComparison,
    technology: {
      tileSize: "DECISION_PENDING",
      renderer: "DECISION_PENDING",
      workerTopology: "DECISION_PENDING",
      offscreenCanvas: "UNTESTED_CANDIDATE",
      webgpu: "UNTESTED_OPTIONAL_CANDIDATE",
      wasm: "UNTESTED_CANDIDATE",
      sharedArrayBuffer: "UNTESTED_OPTIONAL_CANDIDATE",
    },
    notes: [
      "Measurements are evidence for the isolated Reference Path, not a production performance PASS.",
      "The current Core slice has one raster asset and no 20-layer/120-frame compositor; layer/frame counts are reported as affected Core slice counts, not full-project coverage.",
      "Desktop-sized and mobile-sized browser fixtures must remain separate from actual device evidence.",
      "Full raster reads and Golden hashes are explicit verification paths; active dirty rendering uses readRegion only.",
      "No current Route, PiXiEEDraw, PXD, PiXYNC, Market, Project, Asset, Package, database, Storage, or production path is loaded.",
    ],
  };
}
