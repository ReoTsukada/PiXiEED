import { readFileSync, statSync } from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const path = (relative) => new URL(relative, root);
const bytes = (relative) => readFileSync(path(relative));
const size = (relative) => statSync(path(relative)).size;
const compressions = (buffer) => ({ gzipBytes: gzipSync(buffer, { level: 9 }).byteLength, brotliBytes: brotliCompressSync(buffer).byteLength });
const sourceFiles = ["pixiedraw2/src/draw2-core.ts", "pixiedraw2/src/draw2-selection.ts", "pixiedraw2/src/draw2-timeline.ts", "pixiedraw2/src/draw2-entry.ts"];
const raw = bytes("pixiedraw2/dist/draw2-entry.js");
const minified = bytes("pixiedraw2/dist/draw2-entry.min.js");
const css = bytes("pixiedraw2/assets/draw2-shell.css");

console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP130_DRAW2_TIMELINE_STRUCTURE_BUNDLE",
  measuredAt: new Date().toISOString(),
  status: "MEASURED_LOCAL_BUILD",
  build: {
    command: "deno bundle --platform browser pixiedraw2/src/draw2-entry.ts -o pixiedraw2/dist/draw2-entry.js",
    minifiedCommand: "deno bundle --platform browser --minify pixiedraw2/src/draw2-entry.ts -o pixiedraw2/dist/draw2-entry.min.js",
    sourceMapExcluded: true,
    sourceMapIncluded: false,
  },
  source: { files: sourceFiles.map((file) => ({ file, bytes: size(file) })), totalBytes: sourceFiles.reduce((total, file) => total + size(file), 0) },
  initialEditorEntry: { file: "pixiedraw2/dist/draw2-entry.js", rawBytes: raw.byteLength, minifiedBytes: minified.byteLength, rawCompressed: compressions(raw), minifiedCompressed: compressions(minified) },
  css: { file: "pixiedraw2/assets/draw2-shell.css", rawBytes: css.byteLength, compressed: compressions(css) },
  initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
  lazyChunks: [],
  notes: [
    "This isolated WP-130 entry includes only the Draw2 Reference Core, Selection slice, and Timeline structure slice; Audio, Game, Market, and production routes are not imported.",
    "This is a local build measurement, not an arbitrary byte budget or device performance PASS.",
  ],
}, null, 2));
