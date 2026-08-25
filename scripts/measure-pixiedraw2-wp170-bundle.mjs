import { brotliCompressSync, gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = (relative) => path.join(root, relative);
const buffer = (relative) => readFileSync(file(relative));
const size = (relative) => statSync(file(relative)).size;
const compressed = (value) => ({ gzipBytes: gzipSync(value, { level: 9 }).byteLength, brotliBytes: brotliCompressSync(value).byteLength });
const measured = (relative) => {
  const value = buffer(relative);
  return { file: relative, rawBytes: value.byteLength, compressed: compressed(value) };
};
const source = (relative) => readFileSync(file(relative), "utf8");
const initial = source("pixiedraw2/dist/draw2-entry.js");
const advanced = source("pixiedraw2/dist/wp170-advanced-tools.js");
const adapter = source("pixiedraw2/dist/wp170-advanced-editor-adapter.js");
const advancedForbidden = ["document", "window", "CanvasRenderingContext2D", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase", "market/"];
for (const token of advancedForbidden) if (advanced.includes(token)) throw new Error(`Advanced lazy chunk boundary violation: ${token}`);
for (const token of ["function planPatternBrushStroke(", "function planStamp(", "const DITHER_PRESETS", "function validateTileMap("]) if (initial.includes(token)) throw new Error(`Initial Editor bundle leaked WP-170 implementation: ${token}`);
if (!initial.includes("wp170-advanced-tools.js")) throw new Error("Initial Editor bundle lost the WP-170 lazy loader.");
if (adapter.includes("document") || adapter.includes("fetch(") || adapter.includes("WebSocket")) throw new Error("Editor Adapter contains a direct UI/network boundary.");

console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP170_ADVANCED_BUNDLE_BOUNDARIES",
  measuredAt: new Date().toISOString(),
  status: "MEASURED_LOCAL_BUILD",
  build: {
    initial: "deno bundle --platform browser src/draw2-entry.ts -o dist/draw2-entry.js",
    advanced: "deno bundle --platform browser src/wp170-advanced-bundle-entry.ts -o dist/wp170-advanced-tools.js",
    adapter: "deno bundle --platform browser src/wp170-advanced-editor-adapter.ts -o dist/wp170-advanced-editor-adapter.js",
    sourceMapExcluded: true,
  },
  initialEditorBundle: { ...measured("pixiedraw2/dist/draw2-entry.js"), minified: measured("pixiedraw2/dist/draw2-entry.min.js") },
  lazyBundles: {
    advancedCore: measured("pixiedraw2/dist/wp170-advanced-tools.js"),
    editorAdapter: measured("pixiedraw2/dist/wp170-advanced-editor-adapter.js"),
  },
  requests: {
    initial: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
    advancedCore: "pixiedraw2/dist/wp170-advanced-tools.js",
    editorAdapter: "pixiedraw2/dist/wp170-advanced-editor-adapter.js",
  },
  boundaries: {
    advancedDomCanvasNetworkStorageDependency: "PASS",
    initialAdvancedImplementationLeak: "PASS",
    adapterDirectUiNetworkDependency: "PASS",
  },
  notes: ["Local bundle measurement only; not a device startup, memory, GPU, or production performance PASS."],
}, null, 2));
