import { brotliCompressSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const absolute = (relative) => path.join(root, relative);
const read = (relative) => readFileSync(absolute(relative));
const text = (relative) => read(relative).toString("utf8");
const compression = (value) => ({ gzip: gzipSync(value, { level: 9 }).byteLength, brotli: brotliCompressSync(value).byteLength });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const measured = (relative, minifiedRelative) => {
  const raw = read(relative);
  const minified = minifiedRelative === undefined ? raw : read(minifiedRelative);
  const rawCompression = compression(raw);
  const minCompression = compression(minified);
  return { file: relative, raw: raw.byteLength, minified: minified.byteLength, gzip: rawCompression.gzip, brotli: rawCompression.brotli, minifiedGzip: minCompression.gzip, minifiedBrotli: minCompression.brotli, sha256: digest(raw) };
};
const minifyCss = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").trim();
const cssRaw = read("pixiedraw2/assets/draw2-shell.css");
const cssMin = Buffer.from(minifyCss(cssRaw.toString("utf8")), "utf8");
const initial = text("pixiedraw2/dist/draw2-entry.js");
const workspace = text("pixiedraw2/dist/wp180-workspace.js");
const integration = text("pixiedraw2/dist/wp190-integration-ui.js");
const audio = text("pixiedraw2/dist/wp190-audio-core.js");
const runtime = text("pixiedraw2/dist/wp160-runtime-core.js");
const advanced = text("pixiedraw2/dist/wp170-advanced-tools.js");
const forbiddenInitial = ["wp190-audio-core.js", "function createAudioRevision(", "AudioRevisionInput"];
const forbiddenRuntime = ["wp190-audio", "audio-core", "AudioRevision", "draw2Workspace"];
for (const token of forbiddenInitial) if (initial.includes(token)) throw new Error(`Audio leaked into Initial Editor: ${token}`);
for (const token of forbiddenRuntime) if (runtime.includes(token)) throw new Error(`WP-160 Runtime regression: ${token}`);
for (const token of ["document", "window", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase", "AudioContext"]) if (audio.includes(token)) throw new Error(`Audio Core boundary violation: ${token}`);
if (!workspace.includes("wp190-audio-core.js") || !workspace.includes("wp190-integration-ui.js")) throw new Error("WP-190 lazy boundaries are missing.");
if (!initial.includes("wp180-workspace.js") || !initial.includes("wp170-advanced-tools.js")) throw new Error("Existing lazy boundaries are missing.");

const result = {
  schemaVersion: 1,
  workPackage: "WP-190",
  status: "MEASURED_LOCAL_BUILD_WITH_UNTESTED_RELEASE_GATES",
  measurementDefinition: {
    baseline: "WP-180 same command and compression definition",
    sourceMaps: "excluded",
    initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
    startupLazyRequests: ["pixiedraw2/dist/wp180-workspace.js"],
    onDemandLazyRequests: ["pixiedraw2/dist/wp190-audio-core.js", "pixiedraw2/dist/wp190-integration-ui.js", "pixiedraw2/dist/wp160-runtime-core.js", "pixiedraw2/dist/wp170-advanced-tools.js", "pixiedraw2/dist/draw2-legacy-compat.js"],
  },
  wp180Baseline: { initialEditorRaw: 158807, workspaceLazyRaw: 18816, cssRaw: 24768, runtimeRaw: 12649 },
  bundles: {
    initialEditor: measured("pixiedraw2/dist/draw2-entry.js", "pixiedraw2/dist/draw2-entry.min.js"),
    workspaceStartupLazy: measured("pixiedraw2/dist/wp180-workspace.js", "pixiedraw2/dist/wp180-workspace.min.js"),
    audioOnDemandLazy: measured("pixiedraw2/dist/wp190-audio-core.js", "pixiedraw2/dist/wp190-audio-core.min.js"),
    integrationOnDemandLazy: measured("pixiedraw2/dist/wp190-integration-ui.js"),
    css: { raw: cssRaw.byteLength, minified: cssMin.byteLength, gzip: compression(cssRaw).gzip, brotli: compression(cssRaw).brotli, minifiedGzip: compression(cssMin).gzip, minifiedBrotli: compression(cssMin).brotli },
    advancedCore: measured("pixiedraw2/dist/wp170-advanced-tools.js"),
    advancedAdapter: measured("pixiedraw2/dist/wp170-advanced-editor-adapter.js"),
    runtime: measured("pixiedraw2/dist/wp160-runtime-core.js"),
  },
  deltas: {
    initialEditorRaw: statSync(absolute("pixiedraw2/dist/draw2-entry.js")).size - 158807,
    workspaceLazyRaw: statSync(absolute("pixiedraw2/dist/wp180-workspace.js")).size - 18816,
  },
  boundaries: {
    audioOutsideInitial: "PASS_STATIC_BOUNDARY",
    audioOutsideRuntime: "PASS_STATIC_BOUNDARY",
    workspaceAdvancedRuntimeBoundaries: "PRESERVED_STATIC",
    currentRoutesAndData: "OUT_OF_SCOPE_AND_UNTOUCHED",
  },
  metricScopes: {
    audioPlanning: "COMMAND_ONLY",
    hotPath: "WORKSPACE_UI_UPDATE",
    populatedFixture: "INPUT_TO_VISIBLE_REFERENCE",
    fullCompositor: "INPUT_TO_VISIBLE_FULL_COMPOSITOR / PARTIAL",
  },
  untested: ["physical mobile", "physical stylus", "real screen reader", "Safari", "Firefox", "30-minute memory", "full compositor input-to-visible", "production performance", "real Legacy/user data"],
};
console.log(JSON.stringify(result, null, 2));
