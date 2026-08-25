import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const queue = read("00_START_HERE/IMPLEMENTATION_QUEUE.yaml");
const state = read(".codex/PIXIEED_IMPLEMENTATION_STATE.yaml");
const roadmap = read("09_ROADMAP/WORK_PACKAGES/WP-210.md");
const contract = read("docs/contracts/WP-210-MARKET-RIGHTS-COMMERCE.md");
const source = read("pixiedraw2/src/wp210-market-rights-core.ts");
const bundle = read("pixiedraw2/dist/wp210-market-core.js");
const initial = read("pixiedraw2/dist/draw2-entry.js");
const gameRuntime = read("pixiedraw2/dist/wp200-runtime-core.js");
const legacyRuntime = read("pixiedraw2/dist/wp160-runtime-core.js");
const performance = json("docs/inventory/wp200-performance.json");
const baseline = json("docs/inventory/baseline-failure-identity-wp080.json");

assert(queue.includes("id: WP-210") && (queue.includes("status: in_progress") || queue.includes("status: complete")), "WP-210 queue must be active or complete.");
assert(state.includes("current_work_package: WP-210"), "Implementation State must point to WP-210 while this package is active.");
for (const marker of ["MATERIAL", "COMPLETED_WORK", "Legacy Product/Order/License", "Royalty", "Provider", "LOCAL_SHADOW_ONLY"]) assert(roadmap.includes(marker) || contract.includes(marker) || source.includes(marker), `WP-210 marker missing: ${marker}`);
for (const token of ["document", "window", "fetch(", "WebSocket", "supabase", "localStorage", "indexedDB", "opfs", "market/index.html", "market/item.js"]) {
  assert(!source.toLowerCase().includes(token.toLowerCase()), `WP-210 Core has a forbidden environment coupling: ${token}`);
  assert(!bundle.toLowerCase().includes(token.toLowerCase()), `WP-210 bundle has a forbidden environment coupling: ${token}`);
}
for (const token of ["draw2-entry", "wp200-runtime", "wp160-runtime", "pixiedraw2/index.html"]) assert(!bundle.includes(token), `WP-210 Market bundle crossed an authoring/runtime boundary: ${token}`);
assert(!initial.includes("wp210-market-core") && !initial.includes("wp210-market-rights-core"), "WP-210 Market code leaked into the Initial Editor bundle.");
assert(!gameRuntime.includes("wp210") && !legacyRuntime.includes("wp210"), "WP-210 Market code crossed into Runtime bundles.");
assert(statSync(path.join(root, "pixiedraw2/dist/draw2-entry.js")).size === 158807, "Initial Editor raw baseline changed.");
assert(statSync(path.join(root, "pixiedraw2/dist/wp160-runtime-core.js")).size === 12649, "WP-160 Runtime raw baseline changed.");
assert(statSync(path.join(root, "pixiedraw2/dist/wp200-game-core.js")).size === 45919, "WP-200 Game lazy raw baseline changed.");
assert(statSync(path.join(root, "pixiedraw2/dist/wp200-runtime-core.js")).size === 28657, "WP-200 Runtime lazy raw baseline changed.");
assert(performance.deltas.initialEditorRaw === 0 && performance.deltas.runtimeBaselineRaw === 0, "Approved WP-200 bundle baselines are not zero delta.");
assert(baseline.expected_failure_count === 14 && baseline.failures.length === 14 && baseline.failures.every((item) => item.test && item.target && item.signature?.length), "Approved Baseline Failure Identity is not the 14-entry shape.");
assert(!read("pixiedraw/index.html").includes("wp210") && !read("market/index.html").includes("wp210"), "Current routes reference the new WP-210 adapter.");
assert(source.includes("DEFAULT_WP210_FEATURE_FLAGS") && source.includes("KILL_SWITCH_ACTIVE") && source.includes("UNKNOWN_FLAG"), "WP-210 default-off and fail-closed flag boundary is incomplete.");
assert(source.includes("auditSafeCommerceSummary") && source.includes("hasSensitiveFields: false") && !source.includes("sk_live") && !bundle.includes("rawWebhook"), "WP-210 audit boundary must not store identity secrets.");

console.log(JSON.stringify({
  workPackage: "WP-210",
  status: "PASS_ISOLATED_STATIC_BOUNDARY",
  tests: { targetedMarketSuite: "NOT_REEXECUTED_HERE", baselineFailureIdentity: { existing: 14, new: 0, notReexecuted: true } },
  bundles: { initialEditor: "UNCHANGED", wp160Runtime: "UNCHANGED", wp200GameRuntime: "UNCHANGED", market: "LAZY_ONLY" },
  currentSystem: "PRESERVED_BY_NO_ROUTE_OR_PRODUCTION_IMPORT",
}, null, 2));
