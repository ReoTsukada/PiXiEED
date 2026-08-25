import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

for (const relativePath of [
  "pixiedraw2/deno.json",
  "pixiedraw2/index.html",
  "pixiedraw2/src/draw2-core.ts",
  "pixiedraw2/src/draw2-entry.ts",
  "pixiedraw2/tests/core.test.ts",
  "pixiedraw2/fixtures/wp100-benchmark-status.json",
  "docs/inventory/wp100-draw2-vertical-slice-boundary.json",
  "pixiedraw2/dist/draw2-entry.js",
  "docs/contracts/WP-100-PIXEEDRAW2-VERTICAL-SLICE.md",
]) assert.ok(exists(relativePath), `WP-100 artifact missing: ${relativePath}`);

const core = read("pixiedraw2/src/draw2-core.ts");
for (const forbidden of ["document.", "window.", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase"]) {
  assert.equal(core.includes(forbidden), false, `Canonical Core imports runtime boundary: ${forbidden}`);
}
for (const required of ["Uint8Array", "sharedClone", "cowSplit", "DirtyTile", "RendererAdapter", "LOCAL_ONLY", "JournalSink", "InMemoryProjectRepository"]) {
  assert.ok(core.includes(required), `Canonical Core contract missing: ${required}`);
}

const html = read("pixiedraw2/index.html");
assert.match(html, /noindex,nofollow/);
assert.match(html, /data-pixieed-entry="draw2-isolated"/);
assert.match(html, /Feature Flag OFF/);
assert.match(html, /dist\/draw2-entry\.js/);

const benchmark = JSON.parse(read("pixiedraw2/fixtures/wp100-benchmark-status.json"));
assert.equal(benchmark.status, "UNTESTED");
assert.equal(benchmark.decision, "DECISION_PENDING");
assert.equal(benchmark.measurements.length, 0);
for (const [guardrail, value] of Object.entries(benchmark.guardrails)) assert.equal(value, false, `${guardrail} must remain false`);
assert.ok(benchmark.activeEditingLongTaskScope.includes("drawing"));
assert.ok(benchmark.heavyTaskSeparateBudget.includes("import"));

const inventory = JSON.parse(read("docs/inventory/wp100-draw2-vertical-slice-boundary.json"));
assert.equal(inventory.status, "COMPLETE_ISOLATED_VERTICAL_SLICE");
assert.equal(inventory.benchmark_status, "UNTESTED");
assert.equal(inventory.technology_decision, "DECISION_PENDING");
assert.equal(inventory.boundaries.production_connections, false);
assert.deepEqual(inventory.baseline_failure_identity, { existing_match: "14/14", new_failure_identities: 0 });

const context = read(".codex/context/WP-100.md");
assert.match(context, /^# PiXiEED targeted context — WP-100/m);
for (const reference of [
  "08_IMPLEMENTATION/TECH_STACK.md",
  "05_PERFORMANCE/PERFORMANCE_BUDGETS.md",
  "05_PERFORMANCE/DRAW2_HIGH_PERFORMANCE_IMPLEMENTATION_CONTRACT.md",
  "02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md",
  "02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md",
]) assert.ok(context.includes(reference), `WP-100 Context missing: ${reference}`);

const state = read(".codex/PIXIEED_IMPLEMENTATION_STATE.yaml");
assert.match(state, /completed_work_packages:.*WP-100/);
assert.match(state, /current_work_package:\s*WP-\d+/);
assert.match(state, /WP-099.*approved|WP-099.*承認/i);
assert.match(state, /UNTESTED/);
assert.match(state, /next_work_package:\s*WP-\d+/);

const deno = spawnSync("deno", ["check", "--no-remote", "pixiedraw2/src/draw2-core.ts", "pixiedraw2/src/draw2-entry.ts", "pixiedraw2/tests/core.test.ts"], { cwd: root, encoding: "utf8" });
assert.equal(deno.status, 0, deno.stderr);
console.log("WP-100 Draw2 vertical slice contract passed: core isolated, benchmark UNTESTED, Context validated");
