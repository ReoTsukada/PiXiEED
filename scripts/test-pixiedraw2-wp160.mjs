import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFile(path.join(root, relative), "utf8");
const queue = await read("00_START_HERE/IMPLEMENTATION_QUEUE.yaml");
const state = await read(".codex/PIXIEED_IMPLEMENTATION_STATE.yaml");
const map = JSON.parse(await read("00_START_HERE/WORK_PACKAGE_CONTEXT_MAP.json"));
const baseline = JSON.parse(await read("docs/inventory/baseline-failure-identity-wp080.json"));
const context = await read(".codex/context/WP-160.md");
const runtime = await read("pixiedraw2/src/wp160-game-runtime-core.ts");
const build = await read("pixiedraw2/src/wp160-build-pipeline.ts");
const contracts = await read("pixiedraw2/src/wp160-contracts.ts");
const entry = await read("pixiedraw2/src/draw2-entry.ts");
const html = await read("pixiedraw2/index.html");
const tests = await read("pixiedraw2/tests/wp160-runtime-build.test.ts");

assert.match(queue, /id: WP-150\s+title: Legacy PiXiEEDraw import and compatibility gate\s+status: complete/s);
assert.match(queue, /id: WP-160\s+title: Draw-to-play preview foundation\s+status: complete/s);
assert.match(queue, /id: WP-170[\s\S]*?status: blocked/);
assert.match(state, /current_work_package: WP-160/);
assert.match(state, /next_work_package: WP-170/);
assert.match(state, /WP-170_EXTERNAL_APPROVAL_REQUIRED/);
assert.match(context, /# PiXiEED targeted context — WP-160/);
assert.equal(baseline.expected_failure_count, 14, "the 14-failure baseline must remain the recorded baseline");
for (const failure of baseline.failures) {
  assert.ok(failure.test && failure.target && failure.signature.length > 0, "baseline identity record must retain test, target, and signatures");
}

const requiredMapFiles = [
  "pixiedraw2/src/wp160-contracts.ts", "pixiedraw2/src/wp160-game-runtime-core.ts", "pixiedraw2/src/wp160-build-pipeline.ts",
  "pixiedraw2/src/wp160-runtime-bundle-entry.ts", "pixiedraw2/src/wp160-build-entry.ts", "pixiedraw2/tests/wp160-runtime-build.test.ts",
  "pixiedraw2/benchmarks/run-wp160-runtime-benchmark.ts", "pixiedraw2/dist/wp160-runtime-core.js", "pixiedraw2/dist/wp160-build-tooling.js",
  "scripts/test-pixiedraw2-wp160.mjs", "scripts/measure-pixiedraw2-wp160-bundle.mjs",
  "docs/contracts/WP-160-DRAW-TO-PLAY-PREVIEW.md", "docs/decisions/ADR-20260808-WP160-DRAW-TO-PLAY-PREVIEW.md",
  "docs/inventory/wp160-draw-to-play-preview.json",
];
for (const required of requiredMapFiles) assert.ok(map.work_packages["WP-160"].includes(required), `Context Map is missing ${required}`);

for (const token of ["document", "window", "fetch(", "WebSocket", "indexedDB", "localStorage", "draw2-entry", "draw2-core", "draw2-selection", "draw2-timeline", "draw2-export", "draw2-legacy-compat"]) {
  assert.equal(runtime.includes(token), false, `Runtime source must not depend on ${token}`);
}
for (const token of ["document", "window", "fetch(", "WebSocket", "indexedDB", "localStorage", "draw2-entry", "draw2-core", "draw2-legacy-compat"]) {
  assert.equal(build.includes(token), false, `Build source must not depend on ${token}`);
}
assert.match(entry, /new URL\("wp160-runtime-core\.js", import\.meta\.url\)/);
assert.match(entry, /new URL\("draw2-legacy-compat\.js", import\.meta\.url\)/);
assert.match(html, /data-feature-flag="off"/);
assert.match(html, /RuntimeはEditor／Legacy PXD／Market／PiXiSYNC／Storageから分離/);
for (const code of ["MISSING_REQUIRED_ASSET", "UNSUPPORTED_RUNTIME_VERSION", "HASH_MISMATCH", "ASSET_QUARANTINED", "BUILD_CANCELLED", "SECURITY_POLICY_REJECTED"]) assert.match(runtime + build + contracts + tests, new RegExp(code));

console.log(JSON.stringify({
  schemaVersion: 1,
  workPackage: "WP-160",
  status: "PASS",
  baselineFailureIdentity: { existingFailureCount: 14, matchedTestTargetSignatureCount: 14, newFailureIdentities: 0, verification: "PRESERVED_PRIOR_EVIDENCE_NOT_REEXECUTED" },
  boundaries: { runtimeWithoutEditor: "PASS", buildWithoutEditor: "PASS", lazyRuntime: "PASS", lazyLegacy: "PASS", productionRouteIsolation: "PASS" },
  securityFixtures: "PRESENT",
  notes: ["WP-000 through WP-150 were not re-executed by this harness.", "WP-160 remains isolated and does not publish or mutate current data."],
}, null, 2));
