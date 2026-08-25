import { brotliCompressSync, gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = (relative) => path.join(root, relative);
const bytes = (relative) => readFileSync(file(relative));
const size = (relative) => statSync(file(relative)).size;
const compression = (buffer) => ({ gzipBytes: gzipSync(buffer, { level: 9 }).byteLength, brotliBytes: brotliCompressSync(buffer).byteLength });
const measured = (relative) => {
  const buffer = bytes(relative);
  return { file: relative, rawBytes: buffer.byteLength, compressed: compression(buffer) };
};
const sourcePath = (relative) => file(relative);
const source = (relative) => readFileSync(sourcePath(relative), "utf8");
const main = source("pixiedraw2/dist/draw2-entry.js");
const runtime = source("pixiedraw2/dist/wp160-runtime-core.js");
const build = source("pixiedraw2/dist/wp160-build-tooling.js");
const forbiddenRuntime = ["draw2-entry", "draw2-core", "draw2-selection", "draw2-timeline", "draw2-export", "draw2-legacy-compat", "indexedDB", "localStorage", "document", "fetch(", "WebSocket", "supabase", "market/"];
const forbiddenBuild = ["draw2-entry", "draw2-core", "draw2-selection", "draw2-timeline", "draw2-export", "draw2-legacy-compat", "document", "fetch(", "WebSocket", "supabase", "market/"];
for (const token of forbiddenRuntime) if (runtime.includes(token)) throw new Error(`Runtime bundle boundary violation: ${token}`);
for (const token of forbiddenBuild) if (build.includes(token)) throw new Error(`Build bundle boundary violation: ${token}`);
if (!main.includes("wp160-runtime-core.js")) throw new Error("Editor bundle must retain a lazy Runtime loader boundary.");
if (main.includes("MISSING_REQUIRED_ASSET")) throw new Error("Runtime implementation leaked into the initial Editor bundle.");

console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP160_INDEPENDENT_BUNDLE_BOUNDARIES",
  measuredAt: new Date().toISOString(),
  status: "MEASURED_LOCAL_BUILD",
  build: {
    editor: "deno bundle --platform browser src/draw2-entry.ts -o dist/draw2-entry.js",
    runtime: "deno bundle --platform browser src/wp160-runtime-bundle-entry.ts -o dist/wp160-runtime-core.js",
    buildTooling: "deno bundle --platform browser src/wp160-build-entry.ts -o dist/wp160-build-tooling.js",
    sourceMapExcluded: true,
  },
  source: {
    runtimeBytes: size("pixiedraw2/src/wp160-game-runtime-core.ts") + size("pixiedraw2/src/wp160-contracts.ts"),
    buildToolingBytes: size("pixiedraw2/src/wp160-build-pipeline.ts") + size("pixiedraw2/src/wp160-contracts.ts"),
  },
  initialEditorBundle: { ...measured("pixiedraw2/dist/draw2-entry.js"), minified: measured("pixiedraw2/dist/draw2-entry.min.js") },
  runtimeBundle: measured("pixiedraw2/dist/wp160-runtime-core.js"),
  buildToolingBundle: measured("pixiedraw2/dist/wp160-build-tooling.js"),
  requests: {
    initial: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
    lazyRuntime: "pixiedraw2/dist/wp160-runtime-core.js",
    lazyLegacy: "pixiedraw2/dist/draw2-legacy-compat.js",
    buildTooling: "not loaded by Editor",
  },
  boundaries: {
    runtimeEditorDependency: "PASS",
    runtimeLegacyDependency: "PASS",
    runtimeStorageNetworkDependency: "PASS",
    buildEditorDependency: "PASS",
    initialRuntimeCodeLeak: "PASS",
  },
  notes: ["Local bundle measurement only; not a device, browser startup, memory, or production performance PASS."],
}, null, 2));
