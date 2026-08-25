import { brotliCompressSync, gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";

const root = new URL("../", import.meta.url);
const filePath = (relative) => new URL(relative, root);
const bytes = (relative) => readFileSync(filePath(relative));
const size = (relative) => statSync(filePath(relative)).size;
const compressions = (buffer) => ({ gzipBytes: gzipSync(buffer, { level: 9 }).byteLength, brotliBytes: brotliCompressSync(buffer).byteLength });
const sources = [
  "pixiedraw2/src/draw2-core.ts",
  "pixiedraw2/src/draw2-selection.ts",
  "pixiedraw2/src/draw2-timeline.ts",
  "pixiedraw2/src/draw2-export.ts",
  "pixiedraw2/src/draw2-entry.ts",
];
const raw = bytes("pixiedraw2/dist/draw2-entry.js");
const minified = bytes("pixiedraw2/dist/draw2-entry.min.js");
const css = bytes("pixiedraw2/assets/draw2-shell.css");

console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP140_DRAW2_EXPORT_BUNDLE",
  measuredAt: new Date().toISOString(),
  status: "MEASURED_LOCAL_BUILD",
  build: {
    command: "deno bundle --platform browser pixiedraw2/src/draw2-entry.ts -o pixiedraw2/dist/draw2-entry.js",
    minifiedCommand: "deno bundle --platform browser --minify pixiedraw2/src/draw2-entry.ts -o pixiedraw2/dist/draw2-entry.min.js",
    sourceMapExcluded: true,
  },
  source: { files: sources.map((file) => ({ file, bytes: size(file) })), totalBytes: sources.reduce((total, file) => total + size(file), 0) },
  initialEditorEntry: { file: "pixiedraw2/dist/draw2-entry.js", rawBytes: raw.byteLength, minifiedBytes: minified.byteLength, rawCompressed: compressions(raw), minifiedCompressed: compressions(minified) },
  css: { file: "pixiedraw2/assets/draw2-shell.css", rawBytes: css.byteLength, compressed: compressions(css) },
  initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
  lazyChunks: [],
  featureBoundary: { audio: "not imported", game: "not imported", market: "not imported", currentRoutes: "not imported" },
  notes: ["Local build measurement only; not a device performance or product byte-budget PASS."],
}, null, 2));
