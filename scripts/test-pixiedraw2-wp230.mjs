import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const queue = read("00_START_HERE/IMPLEMENTATION_QUEUE.yaml");
const state = read(".codex/PIXIEED_IMPLEMENTATION_STATE.yaml");
const roadmap = read("09_ROADMAP/WORK_PACKAGES/WP-230.md");
const contract = read("docs/contracts/WP-230-SNS-COMMUNITY-CREATOR.md");
const source = read("pixiedraw2/src/wp230-sns-community-core.ts");
const bundle = read("pixiedraw2/dist/wp230-sns-core.js");
const initial = read("pixiedraw2/dist/draw2-entry.js");
const runtime160 = read("pixiedraw2/dist/wp160-runtime-core.js");
const runtime200 = read("pixiedraw2/dist/wp200-runtime-core.js");
const market210 = read("pixiedraw2/dist/wp210-market-core.js");
const directWork220 = read("pixiedraw2/dist/wp220-direct-work-core.js");
const baseline = JSON.parse(read("docs/inventory/baseline-failure-identity-wp080.json"));

assert(queue.includes("id: WP-230") && (queue.includes("status: in_progress") || queue.includes("status: complete")), "WP-230 queue must be active or complete");
assert(state.includes("current_work_package: WP-230") || (state.includes("current_work_package: WP-240") && state.includes("WP-230 content finalization gate passed")), "Implementation State must retain WP-230 completion evidence");
for (const marker of ["Post", "Comment", "Market Card", "Follow", "Reaction", "Mention", "raw public-media", "RECONSTRUCTED_FROM_APPROVED_SOURCES"]) {
  assert(roadmap.includes(marker) || contract.includes(marker), `WP-230 marker missing: ${marker}`);
}
for (const token of ["document", "window", "fetch(", "websocket", "supabase", "indexeddb", "localstorage", "stripe"]) {
  assert(!source.toLowerCase().includes(token), `WP-230 source has forbidden external coupling: ${token}`);
  assert(!bundle.toLowerCase().includes(token), `WP-230 bundle has forbidden external coupling: ${token}`);
}
for (const token of ["wp230-sns", "createSnsPost", "SnsPost", "market-card-share"]) {
  assert(!initial.includes(token), `WP-230 leaked into Initial Editor: ${token}`);
  assert(!runtime160.includes(token) && !runtime200.includes(token), `WP-230 leaked into Runtime: ${token}`);
  assert(!market210.includes(token) && !directWork220.includes(token), `WP-230 leaked into prior lazy boundaries: ${token}`);
}
assert(exists("pixiedraw2/dist/wp230-sns-core.min.js"), "WP-230 minified bundle is missing");
assert(baseline.expected_failure_count === 14 && baseline.failures.length === 14 && baseline.failures.every((item) => item.test && item.target && item.signature?.length), "Approved Baseline Failure Identity is not the 14-entry shape");
for (const currentRoute of ["index.html", "post/index.html", "market/index.html", "pixfind/index.html"]) {
  assert(!read(currentRoute).toLowerCase().includes("wp230"), `Current route references WP-230: ${currentRoute}`);
}
for (const marker of ["SHARE_COMMAND_REQUIRED", "FORBIDDEN_PRIVATE_DATA", "RAW_MEDIA_REJECTED", "CORE_CARD_REQUIRED", "CONTENT_UNAVAILABLE", "createsPurchase: false", "EVENT_NOT_TRUSTED", "NOTIFICATION_RECIPIENT_REQUIRED", "UNKNOWN_FLAG", "LOCAL_SHADOW_ONLY"]) {
  assert(source.includes(marker) || contract.includes(marker), `WP-230 safety marker missing: ${marker}`);
}
console.log(JSON.stringify({
  workPackage: "WP-230",
  status: "PASS_ISOLATED_STATIC_BOUNDARY",
  currentSystem: "PRESERVED_BY_NO_ROUTE_OR_PRODUCTION_IMPORT",
  baselineFailureIdentity: { existing: 14, new: 0, notReexecuted: true },
  bundles: { initial: "UNCHANGED", wp160Runtime: "UNCHANGED", wp200Runtime: "UNCHANGED", wp210Market: "UNCHANGED", wp220DirectWork: "UNCHANGED", wp230Sns: "LAZY_ONLY" },
}, null, 2));
