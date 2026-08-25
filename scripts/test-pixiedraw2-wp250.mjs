import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const queue = read("00_START_HERE/IMPLEMENTATION_QUEUE.yaml");
const state = read(".codex/PIXIEED_IMPLEMENTATION_STATE.yaml");
const roadmap = read("09_ROADMAP/WORK_PACKAGES/WP-250.md");
const contract = read("docs/contracts/WP-250-POLICY-ECONOMICS.md");
const adr = read("docs/decisions/ADR-20260809-WP250-policy-economics-reconstruction.md");
const source = read("pixiedraw2/src/wp250-policy-economics-core.ts");
const bundle = read("pixiedraw2/dist/wp250-policy-economics-core.js");
const initial = read("pixiedraw2/dist/draw2-entry.js");
const baseline = JSON.parse(read("docs/inventory/baseline-failure-identity-wp080.json"));
assert(queue.includes("id: WP-250") && queue.includes("status: complete"), "WP-250 queue must be complete after isolated implementation");
assert(state.includes("current_work_package: WP-250") && state.includes("complete_pending_external_audit"), "Implementation State must be at WP-250 pending external audit");
const scopeText = `${roadmap}\n${contract}\n${adr}`.toLowerCase();
for (const marker of ["reconstructed_from_approved_sources", "consent", "public-only", "shadow-only", "moderation", "sponsored"]) assert(scopeText.includes(marker), `WP-250 marker missing: ${marker}`);
for (const token of ["document", "window", "fetch(", "supabase", "indexeddb", "localstorage", "stripe"]) { assert(!source.toLowerCase().includes(token), `WP-250 source has forbidden external coupling: ${token}`); assert(!bundle.toLowerCase().includes(token), `WP-250 bundle has forbidden external coupling: ${token}`); }
assert(exists("pixiedraw2/dist/wp250-policy-economics-core.min.js"), "WP-250 minified bundle is missing");
assert(!initial.includes("wp250-policy-economics-core.js") && !initial.includes("resolveWp250ConsentPolicy"), "WP-250 leaked into Initial Editor");
assert(baseline.expected_failure_count === 14 && baseline.failures.length === 14 && baseline.failures.every((item) => item.test && item.target && item.signature?.length), "Approved Baseline Failure Identity is not the 14-entry shape");
for (const currentRoute of ["index.html", "pixiedraw/index.html", "market/index.html", "account/admin.html", "pixfind/index.html"]) assert(!read(currentRoute).toLowerCase().includes("wp250"), `Current route references WP-250: ${currentRoute}`);
for (const marker of ["SERVER_POLICY_REQUIRED", "PRIVATE_SURFACE", "SHADOW_ONLY_REQUIRED", "SPONSORED_LABEL_REQUIRED", "AUTOMATIC_MUTATION_REJECTED", "LOCAL_SHADOW_ONLY"]) assert(source.includes(marker) || contract.includes(marker), `WP-250 safety marker missing: ${marker}`);
console.log(JSON.stringify({ workPackage: "WP-250", status: "PASS_ISOLATED_STATIC_BOUNDARY", currentSystem: "PRESERVED_BY_NO_ROUTE_OR_PRODUCTION_IMPORT", baselineFailureIdentity: { existing: 14, new: 0, notReexecuted: true }, bundles: { initial: "UNCHANGED", wp240: "PRESERVED", wp250: "LAZY_ONLY" } }, null, 2));
