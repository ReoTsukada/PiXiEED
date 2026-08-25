import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const queue = read("00_START_HERE/IMPLEMENTATION_QUEUE.yaml");
const state = read(".codex/PIXIEED_IMPLEMENTATION_STATE.yaml");
const roadmap = read("09_ROADMAP/WORK_PACKAGES/WP-220.md");
const contract = read("docs/contracts/WP-220-DIRECT-WORK-BILLING.md");
const source = read("pixiedraw2/src/wp220-direct-work-core.ts");
const bundle = read("pixiedraw2/dist/wp220-direct-work-core.js");
const initial = read("pixiedraw2/dist/draw2-entry.js");
const runtime160 = read("pixiedraw2/dist/wp160-runtime-core.js");
const runtime200 = read("pixiedraw2/dist/wp200-runtime-core.js");
const market = read("pixiedraw2/dist/wp210-market-core.js");
const baseline = json("docs/inventory/baseline-failure-identity-wp080.json");
const marketPerformance = json("docs/inventory/wp210-performance.json");

assert(queue.includes("id: WP-220") && (queue.includes("status: in_progress") || queue.includes("status: complete")), "WP-220 queue must be active or complete.");
assert(state.includes("current_work_package: WP-220"), "Implementation State must point to WP-220.");
for (const marker of ["Request", "Quote", "Agreement", "Milestone", "Delivery", "Acceptance", "Rights", "append-only", "minor-unit"]) assert(roadmap.includes(marker) || contract.includes(marker) || source.includes(marker), `WP-220 marker missing: ${marker}`);
for (const token of ["document", "window", "fetch(", "WebSocket", "supabase", "localStorage", "indexedDB", "opfs", "market/index.html", "stripe"]) {
  assert(!source.toLowerCase().includes(token.toLowerCase()), `WP-220 Core has forbidden external coupling: ${token}`);
  assert(!bundle.toLowerCase().includes(token.toLowerCase()), `WP-220 bundle has forbidden external coupling: ${token}`);
}
for (const token of ["wp220-direct-work", "createDirectWorkPayment", "DirectWorkRequest"]) assert(!initial.includes(token), `WP-220 leaked into Initial Editor: ${token}`);
for (const token of ["wp220", "DirectWorkRequest"]) {
  assert(!runtime160.includes(token) && !runtime200.includes(token), `WP-220 leaked into Runtime: ${token}`);
  assert(!market.includes(token), `WP-220 leaked into WP-210 Market bundle: ${token}`);
}
assert(statSync(path.join(root, "pixiedraw2/dist/draw2-entry.js")).size === 158807, "Initial Editor baseline changed.");
assert(statSync(path.join(root, "pixiedraw2/dist/wp160-runtime-core.js")).size === 12649, "WP-160 Runtime baseline changed.");
assert(statSync(path.join(root, "pixiedraw2/dist/wp200-runtime-core.js")).size === 28657, "WP-200 Runtime baseline changed.");
assert(statSync(path.join(root, "pixiedraw2/dist/wp210-market-core.js")).size === 21271, "WP-210 Market lazy baseline changed.");
assert(marketPerformance.deltas.initialEditorRaw === 0 && marketPerformance.deltas.wp160RuntimeRaw === 0, "WP-210 approved baselines are not preserved.");
assert(baseline.expected_failure_count === 14 && baseline.failures.length === 14 && baseline.failures.every((item) => item.test && item.target && item.signature?.length), "Approved Baseline Failure Identity is not the 14-entry shape.");
assert(!read("pixiedraw/index.html").includes("wp220") && !read("market/index.html").includes("wp220"), "Current routes reference WP-220.");
for (const marker of ["DEFAULT_WP220_FEATURE_FLAGS", "UNKNOWN_FLAG", "KILL_SWITCH_ACTIVE", "PAYMENT_EVENT_CONFLICT", "createsMarketEntitlement: false", "LOCAL_SHADOW_ONLY"]) assert(source.includes(marker) || contract.includes(marker), `WP-220 safety marker missing: ${marker}`);

console.log(JSON.stringify({ workPackage: "WP-220", status: "PASS_ISOLATED_STATIC_BOUNDARY", currentSystem: "PRESERVED_BY_NO_ROUTE_OR_PRODUCTION_IMPORT", baselineFailureIdentity: { existing: 14, new: 0, notReexecuted: true }, bundles: { initial: "UNCHANGED", wp160Runtime: "UNCHANGED", wp200Runtime: "UNCHANGED", wp210Market: "UNCHANGED", wp220DirectWork: "LAZY_ONLY" } }, null, 2));
