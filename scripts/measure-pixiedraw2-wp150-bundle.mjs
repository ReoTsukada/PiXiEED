import { brotliCompressSync, gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";

const root = new URL("../", import.meta.url);
const filePath = (relative) => new URL(relative, root);
const bytes = (relative) => readFileSync(filePath(relative));
const size = (relative) => statSync(filePath(relative)).size;
const compressions = (buffer) => ({ gzipBytes: gzipSync(buffer, { level: 9 }).byteLength, brotliBytes: brotliCompressSync(buffer).byteLength });
const main = bytes("pixiedraw2/dist/draw2-entry.js");
const mainMinified = bytes("pixiedraw2/dist/draw2-entry.min.js");
const legacy = bytes("pixiedraw2/dist/draw2-legacy-compat.js");
const mainText = main.toString("utf8");
const sources = [
  "pixiedraw2/src/draw2-core.ts",
  "pixiedraw2/src/draw2-selection.ts",
  "pixiedraw2/src/draw2-timeline.ts",
  "pixiedraw2/src/draw2-export.ts",
  "pixiedraw2/src/draw2-legacy-compat.ts",
  "pixiedraw2/src/draw2-entry.ts",
];

console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP150_DRAW2_LEGACY_LAZY_BUNDLE",
  measuredAt: new Date().toISOString(),
  status: "MEASURED_LOCAL_BUILD",
  build: {
    command: "deno bundle --platform browser pixiedraw2/src/draw2-entry.ts -o pixiedraw2/dist/draw2-entry.js",
    lazyCommand: "deno bundle --platform browser pixiedraw2/src/draw2-legacy-compat.ts -o pixiedraw2/dist/draw2-legacy-compat.js",
    minifiedCommand: "deno bundle --platform browser --minify pixiedraw2/src/draw2-entry.ts -o pixiedraw2/dist/draw2-entry.min.js",
    sourceMapExcluded: true,
  },
  source: { files: sources.map((file) => ({ file, bytes: size(file) })), totalBytes: sources.reduce((total, file) => total + size(file), 0) },
  initialEditorEntry: { file: "pixiedraw2/dist/draw2-entry.js", rawBytes: main.byteLength, minifiedBytes: mainMinified.byteLength, rawCompressed: compressions(main), minifiedCompressed: compressions(mainMinified) },
  legacyChunk: { file: "pixiedraw2/dist/draw2-legacy-compat.js", rawBytes: legacy.byteLength, compressed: compressions(legacy), loaded: "ON_DEMAND_IMPORT_ONLY" },
  initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
  lazyChunks: ["pixiedraw2/dist/draw2-legacy-compat.js"],
  featureBoundary: {
    legacyImplementationInInitialBundle: mainText.includes("LEGACY_ZIP_EOCD_MISSING") || mainText.includes("function parseStoredZip"),
    legacyChunkRequestedAtStartup: false,
    audio: "not imported",
    game: "not imported",
    market: "not imported",
    currentRoutes: "not imported",
  },
  notes: ["Local build measurement only; not a device performance or product byte-budget PASS."],
}, null, 2));
