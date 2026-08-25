import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const read = async (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");
const core = await read("pixiedraw2/src/draw2-core.ts");
const entry = await read("pixiedraw2/src/draw2-entry.ts");
const html = await read("pixiedraw2/index.html");
const checkpoint = await read("docs/contracts/WP-110-REFERENCE-PERFORMANCE-CHECKPOINT.md");

for (const token of ["raster.fill", "palette.setColor", "FILL_CANCELLED", "FILL_PIXEL_LIMIT_EXCEEDED", "FallbackRenderer", "readRegion", "EditorExecuteOptions"]) {
  assert.match(core, new RegExp(token.replace(/[.]/g, "\\.")), `Core contract missing ${token}`);
}
for (const forbidden of ["document", "HTMLCanvasElement", "fetch(", "WebSocket", "indexedDB", "BroadcastChannel"]) {
  assert.equal(core.includes(forbidden), false, `Canonical Core must not depend on ${forbidden}`);
}
assert.match(entry, /getContext\("2d", \{ alpha: true \}\)/);
assert.match(entry, /tool === "eraser" \? 0 : selectedColor/);
assert.match(entry, /tool === "fill"/);
assert.equal(entry.includes("fetch("), false, "Pointer path must not send samples to a network API");
assert.match(html, /data-feature-flag="off"/);
assert.match(html, /meta name="robots" content="noindex,nofollow"/);
assert.match(checkpoint, /status: MEASURED_REFERENCE_UNTESTED/);
assert.match(checkpoint, /Tile\n\s*size, Renderer, Worker topology, OffscreenCanvas, WebGPU, Wasm, and SharedArrayBuffer remain/);

const deno = spawn("deno", ["task", "--config", "pixiedraw2/deno.json", "test"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
deno.stdout.on("data", (chunk) => { stdout += chunk; });
deno.stderr.on("data", (chunk) => { stderr += chunk; });
const exitCode = await new Promise((resolve) => deno.on("close", resolve));
assert.equal(exitCode, 0, `${stdout}\n${stderr}`);
assert.match(stdout, /18 passed/);

console.log("WP-110 Core contract/failure-fixture/static-boundary checks passed");
