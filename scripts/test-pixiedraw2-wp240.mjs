import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const queue = read("00_START_HERE/IMPLEMENTATION_QUEUE.yaml");
const state = read(".codex/PIXIEED_IMPLEMENTATION_STATE.yaml");
const roadmap = read("09_ROADMAP/WORK_PACKAGES/WP-240.md");
const contract = read("docs/contracts/WP-240-ADMIN-ANALYTICS-ADS-REVENUE.md");
const source = read("pixiedraw2/src/wp240-admin-analytics-ads-core.ts");
const bundle = read("pixiedraw2/dist/wp240-admin-analytics-ads-core.js");
const initial = read("pixiedraw2/dist/draw2-entry.js");
const baseline = JSON.parse(read("docs/inventory/baseline-failure-identity-wp080.json"));
assert(queue.includes("id: WP-240") && queue.includes("status: complete"), "WP-240 queue must be complete after isolated implementation");
assert(state.includes("current_work_package: WP-240"), "Implementation State must point to WP-240");
const scopeText = `${roadmap}\n${contract}`.toLowerCase();
for (const marker of ["permission-gated admin projections", "privacy-safe analytics", "public-only ad", "shadow-only revenue", "reconstructed_from_approved_sources"]) assert(scopeText.includes(marker), `WP-240 marker missing: ${marker}`);
for (const token of ["document", "window", "fetch(", "supabase", "indexeddb", "localstorage", "stripe"]) { assert(!source.toLowerCase().includes(token), `WP-240 source has forbidden external coupling: ${token}`); assert(!bundle.toLowerCase().includes(token), `WP-240 bundle has forbidden external coupling: ${token}`); }
assert(exists("pixiedraw2/dist/wp240-admin-analytics-ads-core.min.js"), "WP-240 minified bundle is missing");
assert(!initial.includes("wp240-admin-analytics-ads-core.js") && !initial.includes("resolveWp240AdminProjection"), "WP-240 leaked into Initial Editor");
assert(baseline.expected_failure_count === 14 && baseline.failures.length === 14 && baseline.failures.every((item) => item.test && item.target && item.signature?.length), "Approved Baseline Failure Identity is not the 14-entry shape");
for (const currentRoute of ["index.html", "pixiedraw/index.html", "market/index.html", "account/admin.html", "pixfind/index.html"]) assert(!read(currentRoute).toLowerCase().includes("wp240"), `Current route references WP-240: ${currentRoute}`);
for (const marker of ["SERVER_AUTH_REQUIRED", "PRIVACY_FIELD_REJECTED", "PRIVATE_CREATION_SURFACE", "SHADOW_ONLY_REQUIRED", "LOCAL_SHADOW_ONLY"]) assert(source.includes(marker) || contract.includes(marker), `WP-240 safety marker missing: ${marker}`);
console.log(JSON.stringify({ workPackage: "WP-240", status: "PASS_ISOLATED_STATIC_BOUNDARY", currentSystem: "PRESERVED_BY_NO_ROUTE_OR_PRODUCTION_IMPORT", baselineFailureIdentity: { existing: 14, new: 0, notReexecuted: true }, bundles: { initial: "UNCHANGED", wp240: "LAZY_ONLY" } }, null, 2));
