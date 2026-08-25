import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const read = async (relativePath, encoding = "utf8") => fs.readFile(path.join(root, relativePath), encoding);
const text = async (relativePath) => read(relativePath, "utf8");
const queue = await text("00_START_HERE/IMPLEMENTATION_QUEUE.yaml");
const map = JSON.parse(await text("00_START_HERE/WORK_PACKAGE_CONTEXT_MAP.json"));
const state = await text(".codex/PIXIEED_IMPLEMENTATION_STATE.yaml");
const context = await text(".codex/context/WP-150.md");
const contract = await text("docs/contracts/WP-150-LEGACY-PXD-COMPATIBILITY.md");
const adr = await text("docs/decisions/ADR-20260808-WP150-LEGACY-PXD-ENTRY-GATE.md");
const inventory = JSON.parse(await text("docs/inventory/wp150-legacy-pxd-compatibility.json"));
const legacy = await text("pixiedraw2/src/draw2-legacy-compat.ts");
const entry = await text("pixiedraw2/src/draw2-entry.ts");
const mainBundle = await text("pixiedraw2/dist/draw2-entry.js");
const lazyBundle = await text("pixiedraw2/dist/draw2-legacy-compat.js");

assert.match(queue, /id: WP-140\s+title: PNG and PXD export\s+status: complete/s);
assert.match(queue, /id: WP-150\s+title: Legacy PiXiEEDraw import and compatibility gate\s+status: complete/s);
assert.deepEqual(map.work_packages["WP-150"].slice(-7), [
  "pixiedraw2/deno.json",
  "pixiedraw2/index.html",
  "docs/contracts/WP-150-LEGACY-PXD-COMPATIBILITY.md",
  "docs/decisions/ADR-20260808-WP150-LEGACY-PXD-ENTRY-GATE.md",
  "docs/inventory/wp150-legacy-pxd-compatibility.json",
  "scripts/test-pixiedraw2-wp150.mjs",
  "scripts/measure-pixiedraw2-wp150-bundle.mjs",
]);
assert.match(state, /current_work_package: WP-150/);
assert.match(state, /status: complete/);
assert.match(state, /next_work_package: WP-160/);
assert.match(context, /# PiXiEED targeted context — WP-150/);
assert.match(contract, /PXD 00/);
assert.match(contract, /Read-only source pipeline/);
assert.match(adr, /Entry Gate/);
for (const [key, value] of Object.entries(inventory.entryGate)) assert.equal(value, "PASS", `Entry Gate ${key} is not PASS`);

for (const forbidden of ["fetch(", "WebSocket", "indexedDB", "localStorage", "BroadcastChannel", "supabase", "draw2-export"]) {
  assert.equal(legacy.includes(forbidden), false, `Legacy adapter must not depend on ${forbidden}`);
}
for (const required of [
  "DRAW2_PXD_V1_MAGIC", "LEGACY_PXD_FORMAT_VERSION", "LEGACY_PXD_ADAPTER_ID", "inspectPxd", "importLegacyPxd",
  "LEGACY_PATH_UNSAFE", "LEGACY_ACTIVE_CONTENT_REJECTED", "LEGACY_DECOMPRESSOR_REQUIRED", "LEGACY_BITMAP_HASH_MISMATCH",
  "originalBytesRetained", "PRESERVE_IN_ORIGINAL_AND_REVIEW", "SUPPORTED_WITH_ADAPTER", "REVIEW_REQUIRED",
]) assert.match(legacy, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")), `missing Legacy contract ${required}`);
assert.match(entry, /new URL\("draw2-legacy-compat\.js", import\.meta\.url\)/);
assert.equal(mainBundle.includes("LEGACY_ZIP_EOCD_MISSING"), false, "Legacy parser implementation leaked into initial bundle");
assert.match(lazyBundle, /LEGACY_ZIP_EOCD_MISSING/);

const deno = spawn("deno", ["task", "--config", "pixiedraw2/deno.json", "test:legacy"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
deno.stdout.on("data", (chunk) => { stdout += chunk; });
deno.stderr.on("data", (chunk) => { stderr += chunk; });
const exitCode = await new Promise((resolve) => deno.on("close", resolve));
assert.equal(exitCode, 0, `${stdout}\n${stderr}`);
assert.match(stdout, /7 passed/);

console.log("WP-150 Compatibility Entry Gate, Legacy read-only adapter, security fixtures, and lazy boundary passed");
