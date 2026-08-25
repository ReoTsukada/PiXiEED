import { brotliCompressSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const absolute = (relative) => path.join(root, relative);
const read = (relative) => readFileSync(absolute(relative));
const text = (relative) => read(relative).toString("utf8");
const bytes = (value) => value.byteLength;
const compressions = (value) => ({ gzip: gzipSync(value, { level: 9 }).byteLength, brotli: brotliCompressSync(value).byteLength });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const measured = (relative, minifiedRelative) => {
  const raw = read(relative);
  const minified = minifiedRelative === undefined ? raw : read(minifiedRelative);
  return {
    file: relative,
    raw: bytes(raw),
    minified: bytes(minified),
    gzip: compressions(raw).gzip,
    brotli: compressions(raw).brotli,
    minifiedGzip: compressions(minified).gzip,
    minifiedBrotli: compressions(minified).brotli,
    sha256: digest(raw),
  };
};
const minifyCss = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").trim();
const css = Buffer.from(minifyCss(text("pixiedraw2/assets/draw2-shell.css")), "utf8");
const html = text("pixiedraw2/index.html");
const initial = text("pixiedraw2/dist/draw2-entry.js");
const workspace = text("pixiedraw2/dist/wp180-workspace.js");
const runtime = read("pixiedraw2/dist/wp160-runtime-core.js");
const advanced = text("pixiedraw2/dist/wp170-advanced-tools.js");
const adapter = text("pixiedraw2/dist/wp170-advanced-editor-adapter.js");
const forbiddenWorkspace = ["draw2-core.ts", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase", "market/"];
const forbiddenAdvanced = ["document", "window", "CanvasRenderingContext2D", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase", "market/"];
const initialAdvancedLeak = ["function planPatternBrushStroke(", "function planStamp(", "const DITHER_PRESETS", "function validateTileMap("]
  .filter((token) => initial.includes(token));
for (const token of forbiddenWorkspace) if (workspace.includes(token)) throw new Error(`Workspace boundary violation: ${token}`);
for (const token of forbiddenAdvanced) if (advanced.includes(token)) throw new Error(`Advanced boundary violation: ${token}`);
for (const token of ["draw2Workspace", "wp180-workspace-ui", "WorkspaceState"]) if (runtime.toString("utf8").includes(token)) throw new Error(`Runtime regression: ${token}`);
if (initialAdvancedLeak.length > 0) throw new Error(`Advanced implementation leaked into initial bundle: ${initialAdvancedLeak.join(", ")}`);
if (!initial.includes("wp180-workspace.js") || !initial.includes("wp170-advanced-tools.js")) throw new Error("Lazy loader boundary is missing.");
if (!html.includes('data-feature-flag="off"') || !html.includes("draw2WorkspaceFrame")) throw new Error("Isolated default-off workspace marker is missing.");

const result = {
  schemaVersion: 1,
  workPackage: "WP-180",
  status: "MEASURED_LOCAL_BUILD",
  measurementDefinition: {
    minifiedCss: "computed from the same CSS source; no production CSS artifact is replaced",
    sourceMaps: "excluded",
    initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
    startupLazyRequests: ["pixiedraw2/dist/wp180-workspace.js"],
    onDemandLazyRequests: ["pixiedraw2/dist/wp160-runtime-core.js", "pixiedraw2/dist/wp170-advanced-tools.js", "pixiedraw2/dist/draw2-legacy-compat.js"],
  },
  wp170Baseline: { initialRaw: 158269, advancedRaw: 31086, adapterRaw: 1490 },
  bundles: {
    initialEditor: measured("pixiedraw2/dist/draw2-entry.js", "pixiedraw2/dist/draw2-entry.min.js"),
    workspaceStartupLazy: measured("pixiedraw2/dist/wp180-workspace.js", "pixiedraw2/dist/wp180-workspace.min.js"),
    css: { raw: bytes(read("pixiedraw2/assets/draw2-shell.css")), minified: bytes(css), gzip: compressions(read("pixiedraw2/assets/draw2-shell.css")).gzip, brotli: compressions(read("pixiedraw2/assets/draw2-shell.css")).brotli, minifiedGzip: compressions(css).gzip, minifiedBrotli: compressions(css).brotli },
    advancedCore: measured("pixiedraw2/dist/wp170-advanced-tools.js"),
    advancedAdapter: measured("pixiedraw2/dist/wp170-advanced-editor-adapter.js"),
    runtime: measured("pixiedraw2/dist/wp160-runtime-core.js"),
  },
  deltas: { initialRaw: statSync(absolute("pixiedraw2/dist/draw2-entry.js")).size - 158269 },
  boundaries: {
    workspaceDoesNotImportEditorCore: "PASS_STATIC_BOUNDARY",
    advancedRemainsLazy: "PASS_STATIC_BOUNDARY",
    runtimeDoesNotContainWorkspace: "PASS_STATIC_BOUNDARY",
    sourceMapsExcluded: true,
    marketAndProductionRoutes: "OUT_OF_SCOPE_AND_UNTOUCHED",
  },
  measurements: {
    virtualization: "MEASURED_LOCAL_SYNTHETIC",
    hotPath: "MEASURED_LOCAL_SYNTHETIC",
    compositorInputToVisible: "UNTESTED",
    physicalMobile: "UNTESTED",
    stylus: "UNTESTED",
    thirtyMinuteMemory: "UNTESTED",
    productionPerformance: "UNTESTED",
  },
};
console.log(JSON.stringify(result, null, 2));
