import { brotliCompressSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const absolute = (relative) => path.join(root, relative);
const read = (relative) => readFileSync(absolute(relative));
const compression = (value) => ({ gzip: gzipSync(value, { level: 9 }).byteLength, brotli: brotliCompressSync(value).byteLength });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const measured = (relative, minifiedRelative) => {
  const raw = read(relative);
  const minified = minifiedRelative === undefined ? raw : read(minifiedRelative);
  const rawCompression = compression(raw);
  const minCompression = compression(minified);
  return { file: relative, raw: raw.byteLength, minified: minified.byteLength, gzip: rawCompression.gzip, brotli: rawCompression.brotli, minifiedGzip: minCompression.gzip, minifiedBrotli: minCompression.brotli, sha256: digest(raw) };
};

const initial = read("pixiedraw2/dist/draw2-entry.js").toString("utf8");
const workspace = read("pixiedraw2/dist/wp180-workspace.js").toString("utf8");
const audio = read("pixiedraw2/dist/wp190-audio-core.js").toString("utf8");
const game = read("pixiedraw2/dist/wp200-game-core.js").toString("utf8");
const runtime = read("pixiedraw2/dist/wp200-runtime-core.js").toString("utf8");
const legacyRuntime = read("pixiedraw2/dist/wp160-runtime-core.js").toString("utf8");
for (const token of ["wp200-game-core.js", "createGameProjectRevision", "GameProjectRevision"]) if (initial.includes(token)) throw new Error(`Game Core leaked into Initial Editor: ${token}`);
for (const token of ["document", "window", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase", "AudioContext"]) {
  if (game.includes(token)) throw new Error(`Game Core boundary violation: ${token}`);
  if (runtime.includes(token)) throw new Error(`Runtime boundary violation: ${token}`);
}
for (const token of ["createGameBuildRecord", "createGameBuildPlan", "wp200-game-build-pipeline", "wp180-workspace", "wp190-audio-core"]) if (runtime.includes(token)) throw new Error(`Runtime loaded authoring/build code: ${token}`);
if (legacyRuntime.includes("wp200") || legacyRuntime.includes("GameProjectRevision")) throw new Error("WP-160 Runtime was changed by WP-200");
if (!workspace.includes("wp190-audio-core.js") || !workspace.includes("wp190-integration-ui.js")) throw new Error("Existing lazy Workspace boundaries are missing.");

const result = {
  schemaVersion: 1,
  workPackage: "WP-200",
  status: "MEASURED_LOCAL_BUILD_WITH_UNTESTED_RELEASE_GATES",
  measurementDefinition: {
    baseline: "WP-190 same raw/minified/gzip/Brotli definition",
    sourceMaps: "excluded",
    initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
    startupLazyRequests: ["pixiedraw2/dist/wp180-workspace.js"],
    onDemandLazyRequests: ["pixiedraw2/dist/wp190-audio-core.js", "pixiedraw2/dist/wp190-integration-ui.js", "pixiedraw2/dist/wp200-game-core.js", "pixiedraw2/dist/wp200-runtime-core.js", "pixiedraw2/dist/wp160-runtime-core.js", "pixiedraw2/dist/wp170-advanced-tools.js"],
  },
  wp190Baseline: { initialEditorRaw: 158807, workspaceLazyRaw: 20295, audioLazyRaw: 15725, runtimeRaw: 12649 },
  bundles: {
    initialEditor: measured("pixiedraw2/dist/draw2-entry.js", "pixiedraw2/dist/draw2-entry.min.js"),
    workspaceStartupLazy: measured("pixiedraw2/dist/wp180-workspace.js", "pixiedraw2/dist/wp180-workspace.min.js"),
    audioOnDemandLazy: measured("pixiedraw2/dist/wp190-audio-core.js", "pixiedraw2/dist/wp190-audio-core.min.js"),
    gameOnDemandLazy: measured("pixiedraw2/dist/wp200-game-core.js", "pixiedraw2/dist/wp200-game-core.min.js"),
    runtimeOnDemandLazy: measured("pixiedraw2/dist/wp200-runtime-core.js", "pixiedraw2/dist/wp200-runtime-core.min.js"),
    wp160RuntimeBaseline: measured("pixiedraw2/dist/wp160-runtime-core.js"),
    advancedCore: measured("pixiedraw2/dist/wp170-advanced-tools.js"),
    advancedAdapter: measured("pixiedraw2/dist/wp170-advanced-editor-adapter.js"),
  },
  deltas: {
    initialEditorRaw: statSync(absolute("pixiedraw2/dist/draw2-entry.js")).size - 158807,
    workspaceLazyRaw: statSync(absolute("pixiedraw2/dist/wp180-workspace.js")).size - 20295,
    runtimeBaselineRaw: statSync(absolute("pixiedraw2/dist/wp160-runtime-core.js")).size - 12649,
  },
  boundaries: {
    gameOutsideInitial: "PASS_STATIC_BOUNDARY",
    gameOutsideDrawRuntimeBaseline: "PASS_STATIC_BOUNDARY",
    runtimeContainsNoGameBuildOrEditorUI: "PASS_STATIC_BOUNDARY",
    audioOutsideInitial: "PASS_INHERITED_STATIC_BOUNDARY",
    currentRoutesAndData: "OUT_OF_SCOPE_AND_UNTOUCHED",
  },
  metricScopes: {
    runtimeStep: "INPUT_TO_RUNTIME_STATE_REFERENCE",
    buildPlan: "LOCAL_DETERMINISTIC_PLAN_ONLY",
    fullCompositor: "INPUT_TO_VISIBLE_FULL_COMPOSITOR / UNTESTED",
  },
  untested: ["physical mobile", "physical stylus", "real screen reader", "Safari", "Firefox", "30-minute memory", "full compositor input-to-visible", "production performance", "real Legacy/user data"],
};
console.log(JSON.stringify(result, null, 2));
