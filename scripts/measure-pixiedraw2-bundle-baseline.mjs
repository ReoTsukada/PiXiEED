import { readFileSync, statSync } from "node:fs";
import { gzipSync, brotliCompressSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const path = (relative) => new URL(relative, root);
const bytes = (relative) => readFileSync(path(relative));
const size = (relative) => statSync(path(relative)).size;
const compressions = (buffer) => ({ gzipBytes: gzipSync(buffer, { level: 9 }).byteLength, brotliBytes: brotliCompressSync(buffer).byteLength });
const editorSource = ["pixiedraw2/src/draw2-core.ts", "pixiedraw2/src/draw2-entry.ts"];
const editorRaw = bytes("pixiedraw2/dist/draw2-entry.js");
const editorMin = bytes("pixiedraw2/dist/draw2-entry.min.js");
const css = bytes("pixiedraw2/assets/draw2-shell.css");

console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP110_REFERENCE_BUNDLE_BASELINE",
  measuredAt: new Date().toISOString(),
  status: "MEASURED_LOCAL_BUILD",
  build: {
    command: "deno bundle --platform browser src/draw2-entry.ts",
    minifiedCommand: "deno bundle --platform browser --minify src/draw2-entry.ts",
    sourceMapExcluded: true,
    sourceMapIncluded: false,
  },
  source: {
    files: editorSource.map((file) => ({ file, bytes: size(file) })),
    totalBytes: editorSource.reduce((total, file) => total + size(file), 0),
  },
  initialEditorEntry: {
    file: "pixiedraw2/dist/draw2-entry.js",
    rawBytes: editorRaw.byteLength,
    minifiedBytes: editorMin.byteLength,
    rawCompressed: compressions(editorRaw),
    minifiedCompressed: compressions(editorMin),
  },
  css: { file: "pixiedraw2/assets/draw2-shell.css", rawBytes: css.byteLength, compressed: compressions(css) },
  initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
  lazyChunks: [],
  notes: [
    "22.31KB was the previous WP-100 bundle definition; after Reference dirty-region instrumentation the current raw editor bundle is recorded separately.",
    "The benchmark entry is an isolated measurement page and is not part of the editor initial bundle.",
    "No arbitrary byte budget or performance PASS is inferred from these byte counts.",
  ],
}, null, 2));
