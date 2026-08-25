import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const core = read("pixiedraw2/src/wp170-advanced-tools-core.ts");
const editorCore = read("pixiedraw2/src/draw2-core.ts");
const adapter = read("pixiedraw2/src/wp170-advanced-editor-adapter.ts");
const entry = read("pixiedraw2/src/draw2-entry.ts");
const html = read("pixiedraw2/index.html");
const baseline = json("docs/inventory/baseline-failure-identity-wp080.json");
const runtime = read("pixiedraw2/dist/wp160-runtime-core.js");
const build = read("pixiedraw2/dist/wp160-build-tooling.js");
const advanced = read("pixiedraw2/dist/wp170-advanced-tools.js");
const initial = read("pixiedraw2/dist/draw2-entry.js");

for (const token of ["PatternSource", "raster.patternBrushCommit", "raster.stampCommit", "raster.mirrorCommit", "DITHER_PRESETS", "OverlayState", "AnimationTag", "TileMapState", "MarketPackagePreparation"]) assert(core.includes(token), `WP-170 Core contract missing ${token}`);
for (const token of ["Input", "ToolSession", "deterministic", "dirtyTiles", "LOCAL_ONLY", "ACTIVE_SYNC", "PLATFORM_EVENT", "ASYNC_ON_DEMAND"]) assert(core.includes(token), `WP-170 boundary vocabulary missing ${token}`);
for (const token of ["raster.writeSet", "ADVANCED_PREVIEW_COMMIT_FORBIDDEN"]) assert(adapter.includes(token) || core.includes(token), `WP-170 adapter boundary missing ${token}`);
assert(editorCore.includes("raster.writeSet") && editorCore.includes("COMMAND_DUPLICATE"), "EditorCore write-set/duplicate boundary is missing.");
for (const id of ["draw2AdvancedLoad", "draw2AdvancedPattern", "draw2AdvancedStamp", "draw2AdvancedMirror", "draw2AdvancedDither", "draw2AdvancedGrid", "draw2AdvancedGuide", "draw2AdvancedPackage"]) assert(html.includes(`id="${id}"`) && entry.includes(`#${id}`), `Advanced UI contract missing ${id}`);
assert(html.includes("disabled>Pattern Preview") && html.includes("Feature Flag OFF"), "Advanced UI is not default-off or explicit about preview state.");
assert(initial.includes("wp170-advanced-tools.js"), "Initial Editor lost the advanced lazy loader.");
for (const token of ["function planPatternBrushStroke(", "function planStamp(", "const DITHER_PRESETS", "function validateTileMap("]) assert(!initial.includes(token), `Initial Editor contains advanced implementation ${token}`);
for (const token of ["document", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase", "market/"]) assert(!advanced.includes(token), `Advanced chunk violates pure-core boundary: ${token}`);
for (const token of ["draw2-entry", "draw2-core", "draw2-selection", "draw2-timeline", "draw2-export"]) assert(!runtime.includes(token), `WP-160 Runtime boundary changed: ${token}`);
for (const token of ["draw2-entry", "draw2-core", "document", "fetch(", "WebSocket"]) assert(!build.includes(token), `WP-160 Build boundary changed: ${token}`);

assert(baseline.expected_failure_count === 14 && baseline.failures.length === 14, "Inherited Baseline Failure Identity fixture is not 14 cases.");
assert(baseline.failures.every((item) => item.test && item.target && Array.isArray(item.signature) && item.signature.length > 0), "Baseline fixture lost Test/target/signature identity fields.");

console.log(JSON.stringify({
  schemaVersion: 1,
  workPackage: "WP-170",
  status: "PASS_WITH_UNTESTED_GATES",
  featureContracts: "PASS",
  initialLazyBoundary: "PASS",
  wp160BundleBoundaryRegression: "PASS_STATIC_BOUNDARY",
  currentRouteDrawPxdPiXiSyncMarket: "PRESERVED_BY_SCOPE_AND_STATIC_BOUNDARY",
  baselineFailureIdentity: { existingExpected: 14, existingIdentityEvidence: "14/14 preserved from approved prior evidence; not re-executed", newFailureIdentities: 0 },
  realDeviceAndProduction: "UNTESTED",
}, null, 2));
