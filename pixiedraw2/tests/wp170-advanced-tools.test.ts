import { EditorCore, createProject } from "../src/draw2-core.ts";
import { commitAdvancedOperation, commitAdvancedOperation as commitAdvanced, readEditorTarget } from "../src/wp170-advanced-editor-adapter.ts";
import {
  DITHER_PRESETS,
  addGuide,
  addPaletteColor,
  assertStableAssetIds,
  cancelToolSession,
  commitToolSession,
  computeOverlayInvalidation,
  defaultOverlayState,
  overlayProjectionHash,
  planDither,
  planMirror,
  planPaletteRemap,
  planPatternBrushStroke,
  planStamp,
  prepareMarketPackage,
  validateAdvancedPalette,
  validateAnimationTags,
  validateGameAssetMetadata,
  validateReferenceImage,
  validateSlice,
  validateTileMap,
  type AdvancedResult,
  type CanonicalPixelTarget,
  type PatternSource,
} from "../src/wp170-advanced-tools-core.ts";
import { asAssetId, asAssetRevisionId, asPackageId, asSha256, type DependencyLockEntry } from "../src/wp160-contracts.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function must<T>(result: AdvancedResult<T>, message = "Expected an advanced result to succeed"): T {
  if (!result.ok) throw new Error(`${message}: ${result.diagnostics.map((item) => item.code).join(",")}`);
  return result.value;
}
function fails(result: AdvancedResult<unknown>, code: string): void {
  assert(!result.ok, `Expected ${code} to fail.`);
  assert(result.diagnostics.some((item) => item.code === code), `Expected diagnostic ${code}, got ${result.diagnostics.map((item) => item.code).join(",")}.`);
}

function target(width = 16, height = 16): { readonly target: CanonicalPixelTarget; readonly pixels: Uint8Array } {
  const pixels = new Uint8Array(width * height);
  return {
    pixels,
    target: { assetId: "wp170:test:asset", width, height, tileSize: 4, palette: [0, 0xffffffff, 0xff0000ff, 0x00ff00ff], readPixel: (x, y) => pixels[y * width + x] ?? 0 },
  };
}

const pattern: PatternSource = { width: 2, height: 2, pixels: [1, 0, 0, 1], palette: [0, 0xffffffff, 0xff0000ff], transparentIndex: 0 };

Deno.test("WP-170 Pattern/Stamp/Mirror/Dither are deterministic and preview-safe", () => {
  const { target: pixelTarget, pixels } = target();
  const sparse = must(planPatternBrushStroke(pixelTarget, [{ x: 1, y: 1 }, { x: 10, y: 10 }], pattern, { anchorX: 0, anchorY: 0, repeat: "REPEAT_XY", transparent: "SKIP", clipping: "CLIP" }));
  const dense = must(planPatternBrushStroke(pixelTarget, Array.from({ length: 10 }, (_, index) => ({ x: index + 1, y: index + 1 })), pattern, { anchorX: 0, anchorY: 0, repeat: "REPEAT_XY", transparent: "SKIP", clipping: "CLIP" }));
  assert(JSON.stringify(sparse.writes) === JSON.stringify(dense.writes), "Pattern result changed with pointer sample frequency.");
  const repeatedOrigin = must(planPatternBrushStroke(pixelTarget, [{ x: 0, y: 0 }, { x: 1, y: 1 }], pattern, { anchorX: 0, anchorY: 0, repeat: "REPEAT_XY", transparent: "SKIP", clipping: "CLIP" }));
  const singleOrigin = must(planPatternBrushStroke(pixelTarget, [{ x: 0, y: 0 }], pattern, { anchorX: 0, anchorY: 0, repeat: "REPEAT_XY", transparent: "SKIP", clipping: "CLIP" }));
  assert(JSON.stringify(repeatedOrigin.writes) === JSON.stringify(singleOrigin.writes), "Repeated Pattern origins must be generated once without changing output.");
  assert(sparse.transportClass === "ACTIVE_SYNC" && sparse.undoBoundary === "ATOMIC", "Pattern commit boundary is not canonical/atomic.");
  assert(sparse.dirtyTiles.length < 16, "Pattern operation scanned the whole target.");
  fails(planPatternBrushStroke(pixelTarget, [{ x: 0, y: 0 }], { ...pattern, pixels: [4, 0, 0, 1] }, { anchorX: 0, anchorY: 0, repeat: "SINGLE", transparent: "SKIP", clipping: "CLIP" }), "PATTERN_INDEX_INVALID");
  fails(planPatternBrushStroke(pixelTarget, [{ x: 0, y: 0 }], pattern, { anchorX: 1, anchorY: 1, repeat: "SINGLE", transparent: "SKIP", clipping: "REJECT" }), "WRITE_OUT_OF_BOUNDS");

  const stampPlan = must(planStamp(pixelTarget, pattern, { x: 3, y: 3, scale: 2, transparent: "SKIP", paletteCompatibility: "EXACT", clipping: "CLIP" }));
  assert(stampPlan.session.preview.previewOnly && stampPlan.session.preview.writes.length > 0, "Stamp preview was not created.");
  assert(pixels.every((value) => value === 0), "Stamp preview mutated the canonical pixel target.");
  assert(cancelToolSession(stampPlan.session).status === "CANCELLED", "Stamp cancellation did not close the session.");
  const committedStamp = must(commitToolSession(stampPlan.session, stampPlan.commit));
  assert(!committedStamp.previewOnly && committedStamp.undoBoundary === "ATOMIC", "Stamp commit is not atomic.");
  fails(planStamp(pixelTarget, pattern, { x: 15, y: 15, scale: 1, transparent: "SKIP", paletteCompatibility: "EXACT", clipping: "REJECT" }), "WRITE_OUT_OF_BOUNDS");
  fails(commitToolSession(cancelToolSession(stampPlan.session), stampPlan.commit), "TOOL_SESSION_NOT_PREVIEW");

  const mirror = must(planMirror(pixelTarget, [{ x: 2, y: 4, colorIndex: 1 }, { x: 2, y: 4, colorIndex: 1 }], { horizontal: true, vertical: true, axisX2: 5, axisY2: 5, clipping: "CLIP" }));
  assert(mirror.writes.length === 1 && mirror.writes[0]?.x === 3 && mirror.writes[0]?.y === 1, "Mirror did not deduplicate half-pixel axis writes.");
  fails(planMirror(pixelTarget, [], { horizontal: false, vertical: false, clipping: "CLIP" }), "MIRROR_AXIS_MISSING");

  const ditherOptions = { region: { x: 0, y: 0, width: 8, height: 8 }, fromIndex: 0, toIndex: 1, amount: 128, preset: DITHER_PRESETS.BAYER_2X2, clipping: "CLIP" as const };
  const firstDither = must(planDither(pixelTarget, ditherOptions));
  const secondDither = must(planDither(pixelTarget, ditherOptions));
  assert(firstDither.operationId === secondDither.operationId && firstDither.writes.length === secondDither.writes.length, "Dither is not deterministic.");
  const previewDither = must(planDither(pixelTarget, ditherOptions, true));
  assert(previewDither.previewOnly && previewDither.transportClass === "LOCAL_ONLY", "Dither preview crossed the shared operation boundary.");
  fails(planDither(pixelTarget, { ...ditherOptions, cancelRequested: () => true }), "DITHER_CANCELLED");
});

Deno.test("WP-170 overlays and indexed palette preserve raster identity", () => {
  const { target: pixelTarget, pixels } = target();
  const beforeRaster = pixels.join(",");
  const beforeOverlay = defaultOverlayState();
  const toggled = { ...beforeOverlay, grid: { ...beforeOverlay.grid, enabled: true } };
  assert(computeOverlayInvalidation(beforeOverlay, toggled).join(",") === "GRID", "Grid toggle invalidated a raster domain.");
  assert(pixels.join(",") === beforeRaster, "Overlay changed canonical raster bytes.");
  assert(overlayProjectionHash(beforeOverlay) !== overlayProjectionHash(toggled), "Grid projection hash did not change.");
  const guided = must(addGuide(beforeOverlay, { guideId: "guide-1", orientation: "HORIZONTAL", position: 4, visible: true, shared: false }));
  fails(addGuide(guided, { guideId: "guide-1", orientation: "VERTICAL", position: 4, visible: true, shared: false }), "GUIDE_DUPLICATE");
  fails(addGuide(beforeOverlay, { guideId: "guide-bad", orientation: "VERTICAL", position: Number.NaN, visible: true, shared: false }), "GUIDE_POSITION_INVALID");
  fails(validateReferenceImage({ referenceId: "ref-1", assetId: asAssetId("asset-1"), revisionId: asAssetRevisionId("revision-1"), x: 0, y: 0, scale: 1, opacity: 0.5, visible: true, locked: true, scope: "LOCAL", externalUrl: "https://example.invalid/ref.png" }), "REFERENCE_EXTERNAL_URL_FORBIDDEN");

  const palette = { version: 1 as const, colors: [0, 0xffffffff, 0xff0000ff] };
  must(validateAdvancedPalette(palette));
  const remapped = must(planPaletteRemap(pixelTarget, palette, [0, 2, 1]));
  assert(remapped.palette.colors[1] === palette.colors[2] && remapped.operation.undoBoundary === "ATOMIC", "Indexed palette reorder did not create an atomic remap.");
  fails(validateAdvancedPalette({ version: 1, colors: [0, ...Array.from({ length: 256 }, () => 0xffffffff)] }), "PALETTE_OVERFLOW");
  fails(validateAdvancedPalette({ version: 1, colors: [0xffffffff] }), "TRANSPARENT_INDEX_PROTECTED");
  fails(addPaletteColor({ version: 1, colors: [0, 1, 2] }, -1), "PALETTE_COLOR_INVALID");
});

Deno.test("WP-170 tags, slices, tiles, metadata, and package preparation fail closed", async () => {
  const frames = [{ frameId: "frame-1" }, { frameId: "frame-2" }];
  const tags = must(validateAnimationTags([{ tagId: "tag-idle", name: "Idle", startFrameId: "frame-1", endFrameId: "frame-2", order: 0, direction: "FORWARD" }], frames));
  assert(tags.length === 1, "Animation tag was not retained by stable identity.");
  fails(validateAnimationTags([{ tagId: "tag-bad", name: "Broken", startFrameId: "deleted", endFrameId: "frame-2", order: 0, direction: "FORWARD" }], frames), "ANIMATION_TAG_FRAME_MISSING");
  fails(validateSlice({ sliceId: "slice-bad", name: "Bad", rect: { x: 15, y: 15, width: 4, height: 4 }, pivot: { x: 0, y: 0 } }, { width: 16, height: 16 }, new Set(frames.map((frame) => frame.frameId))), "SLICE_BOUNDS_INVALID");

  const tile = { tileAssetId: "tile-a", revisionId: "revision-a", width: 16, height: 16, contentHash: "a".repeat(64), dependsOnTileAssetIds: [] };
  const map = { mapId: "map-1", width: 8, height: 8, referenceMode: "LIVE" as const, placements: [{ placementId: "placement-1", tileAssetId: "tile-a", mapX: 1, mapY: 1, layerId: "ground", transform: "NONE" as const }] };
  must(validateTileMap(map, [tile]));
  fails(validateTileMap({ ...map, placements: [{ placementId: "placement-1", tileAssetId: "missing", mapX: 1, mapY: 1, layerId: "ground", transform: "NONE" }] }, [tile]), "TILE_ASSET_MISSING");
  fails(validateTileMap(map, [{ ...tile, dependsOnTileAssetIds: ["tile-b"] }, { ...tile, tileAssetId: "tile-b", dependsOnTileAssetIds: ["tile-a"] }]), "TILE_DEPENDENCY_CYCLE");
  fails(validateGameAssetMetadata({ assetRole: "SPRITE", pivot: { x: 0, y: 0 }, collisionHint: "NONE", animationTagIds: [], sliceIds: [], playbackDefaults: { fps: 12, loop: true }, secret: "must-review" }), "GAME_METADATA_UNKNOWN_FIELD");
  must(validateGameAssetMetadata({ assetRole: "SPRITE", pivot: { x: 0, y: 0 }, collisionHint: "NONE", animationTagIds: [tags[0]?.tagId ?? ""], sliceIds: [], playbackDefaults: { fps: 12, loop: true } }));

  const ids = must(assertStableAssetIds("asset-1", "revision-1", "package-1"));
  const dependency: DependencyLockEntry = { assetId: ids.assetId, revisionId: ids.revisionId, contentHash: asSha256("a".repeat(64)), byteLength: 16, mimeType: "application/octet-stream", mode: "PINNED", required: true };
  const prepared = must(await prepareMarketPackage({ packageId: ids.packageId, packageVersion: "1.0.0", packageKind: "FINISHED_PRODUCT", saleKind: "FINISHED_PRODUCT", dependencies: [{ ...dependency, authorized: true, quarantined: false }], previewCandidates: ["preview-1"], compatibility: ["draw2-v1"], metadata: { role: "game" } }));
  assert(prepared.publishState === "PREPARATION_ONLY" && prepared.saleKind === "FINISHED_PRODUCT", "Package preparation crossed into Market publish.");
  fails(await prepareMarketPackage({ packageId: asPackageId("package-2"), packageVersion: "1.0.0", packageKind: "DRAW_ASSET", saleKind: "MATERIAL", dependencies: [{ ...dependency, authorized: false, quarantined: false }], previewCandidates: [], compatibility: [], metadata: {} }), "PACKAGE_UNAUTHORIZED_DEPENDENCY");
  fails(await prepareMarketPackage({ packageId: asPackageId("package-3"), packageVersion: "1.0.0", packageKind: "DRAW_ASSET", saleKind: "MATERIAL", dependencies: [{ ...dependency, authorized: true, quarantined: false }], previewCandidates: [], compatibility: [], metadata: {}, price: "never" }), "PACKAGE_FINANCIAL_OR_PUBLISH_FIELD");
});

Deno.test("WP-170 Editor adapter commits one write set and rejects preview/stale/duplicate commands", async () => {
  const project = createProject({ projectId: "wp170-adapter", width: 16, height: 16, tileSize: 32 });
  const core = new EditorCore(project);
  const editorTarget = readEditorTarget(project, project.activeAssetId);
  assert(editorTarget !== undefined, "Editor target adapter did not resolve the active asset.");
  const operation = must(planMirror(editorTarget, [{ x: 1, y: 1, colorIndex: 1 }, { x: 2, y: 2, colorIndex: 2 }], { horizontal: true, vertical: false, axisX2: 10, clipping: "CLIP" }));
  const context = { commandId: "wp170-command-1", projectId: project.projectId, assetId: project.activeAssetId, actorId: "wp170-actor", clientId: "wp170-client", clientSequence: 1, baseStructureEpoch: project.structureEpoch, createdAtMonotonicMs: 1 };
  const result = await commitAdvancedOperation(core, operation, context);
  assert(result.ok, "Advanced write set did not reach EditorCore.");
  assert(result.result.operation.operationType === "raster.writeSet" && result.state.appliedCommandIds.length === 1, "Advanced writes were not one atomic canonical operation.");
  const duplicate = await commitAdvanced(core, operation, context);
  assert(!duplicate.ok && duplicate.diagnostics.some((item) => item.code === "COMMAND_DUPLICATE"), "Duplicate advanced operation was accepted.");
  const stale = await commitAdvanced(core, operation, { ...context, commandId: "wp170-command-2", clientSequence: 2, baseStructureEpoch: 0 });
  assert(!stale.ok && stale.diagnostics.some((item) => item.code === "COMMAND_STRUCTURE_EPOCH_MISMATCH"), "Stale advanced command was accepted.");
  const preview = must(planStamp(editorTarget, pattern, { x: 1, y: 1, scale: 1, transparent: "SKIP", paletteCompatibility: "EXACT", clipping: "CLIP" }));
  const previewResult = await commitAdvanced(core, preview.session.preview, { ...context, commandId: "wp170-command-preview", clientSequence: 2 });
  assert(!previewResult.ok && previewResult.diagnostics.some((item) => item.code === "ADVANCED_PREVIEW_COMMIT_FORBIDDEN"), "Preview crossed the EditorCore commit boundary.");
});
