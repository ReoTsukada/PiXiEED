import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const read = async (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");
const exportCore = await read("pixiedraw2/src/draw2-export.ts");
const entry = await read("pixiedraw2/src/draw2-entry.ts");
const html = await read("pixiedraw2/index.html");
const contract = await read("docs/contracts/WP-140-PNG-PXD-EXPORT.md");
const aseprite = await read("docs/contracts/DRAW2-ASEPRITE-UX-REFERENCE.md");
const adr = await read("docs/decisions/ADR-20260808-DRAW2-ASEPRITE-UX-BASELINE.md");
const schema = JSON.parse(await read("16_IMPLEMENTATION_STARTER/reference-core/schemas/pxd-manifest-v1.schema.json"));

for (const forbidden of ["document", "window", "HTMLCanvasElement", "fetch(", "WebSocket", "indexedDB", "localStorage", "BroadcastChannel", "supabase"]) {
  assert.equal(exportCore.includes(forbidden), false, `Export Core must not depend on ${forbidden}`);
}
for (const required of [
  "encodePngRgba", "exportPng", "exportPxd", "importPxdPackage", "PXD_SCHEMA_VERSION", "PXD_ARCHIVE_VERSION",
  "canonicalManifestHash", "PXD_PACKAGE_HASH_MISMATCH", "PXD_MANIFEST_HASH_MISMATCH", "PXD_ASSET_HASH_MISMATCH",
  "PXD_TRAILING_BYTES", "objects/asset-", "Uint8Array",
]) assert.match(exportCore, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing export contract ${required}`);
for (const required of ["draw2ExportPng", "draw2ExportPxd", "draw2ImportPxd", "downloadBytes", "importPxdPackage", "local mode"]) {
  assert.match(entry + html, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `missing local export UI ${required}`);
}
assert.match(html, /data-pixieed-entry="draw2-isolated"/);
assert.match(html, /data-feature-flag="off"/);
assert.match(contract, /deterministic RGBA8 PNG/);
assert.match(contract, /Versioned PXD/);
assert.match(contract, /not rewrite the current `pixiedraw\//);
assert.match(aseprite, /Selection/);
assert.match(aseprite, /Layer × Frame/);
assert.match(adr, /runtime or build dependency/);
assert.equal(schema.properties.archiveVersion.const, 1);
assert.equal(schema.properties.packageKind.const, "PROJECT_PACKAGE");
assert.equal(schema.properties.canonicalManifestHash.pattern, "^[0-9a-f]{64}$");

const deno = spawn("deno", ["task", "--config", "pixiedraw2/deno.json", "test"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
deno.stdout.on("data", (chunk) => { stdout += chunk; });
deno.stderr.on("data", (chunk) => { stderr += chunk; });
const exitCode = await new Promise((resolve) => deno.on("close", resolve));
assert.equal(exitCode, 0, `${stdout}\n${stderr}`);
assert.match(stdout, /18 passed/);

console.log("WP-140 deterministic PNG/PXD export, import, corruption, schema, Aseprite baseline, and isolation checks passed");
