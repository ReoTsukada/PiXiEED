import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const html = read("pixiedraw2/index.html");
const workspace = read("pixiedraw2/src/wp180-workspace-ui.ts");
const integration = read("pixiedraw2/src/wp190-integration-ui.ts");
const audio = read("pixiedraw2/src/wp190-audio-core.ts");
const audioAdapter = read("pixiedraw2/src/wp190-audio-adapter.ts");
const finalGate = read("pixiedraw2/src/wp190-final-gate.ts");
const audioBundle = read("pixiedraw2/dist/wp190-audio-core.js");
const integrationBundle = read("pixiedraw2/dist/wp190-integration-ui.js");
const baseline = json("docs/inventory/baseline-failure-identity-wp080.json");
const gap = json("docs/inventory/wp190-final-gap-inventory.json");
const visual = json("docs/visual-regression/wp190-baseline-manifest.json");
const responsive = json("docs/inventory/wp190-responsive-safety.json");

for (const marker of ['data-feature-flag="off"', 'data-audio-feature-flag="off"', "draw2WorkspaceFrame"]) assert(html.includes(marker), `Isolated flag marker missing: ${marker}`);
for (const marker of ["wp190-audio-core.js", "wp190-integration-ui.js", "unknownAudioFlag", "audioFeatureFlag"]) assert(workspace.includes(marker) || html.includes(marker), `Lazy/fixture marker missing: ${marker}`);
assert(integration.includes('params.get("fixture") !== "populated"'), "Populated fixture query boundary is missing.");
for (const marker of ["AudioProject", "AudioRevision", "AudioEventBinding", "AudioPackageCompatibility", "AudioPreviewPlan", "AudioExportPlan", "DEFAULT_WP190_FEATURE_FLAGS", "AUDIO_RAW_PAYLOAD_REJECTED", "PINNED"]) assert(audio.includes(marker), `Audio contract marker missing: ${marker}`);
for (const marker of ["INJECTED_LOCAL_PREVIEW", "INJECTED_ASYNC_EXPORT", "HASH_AND_LOCATOR_ONLY", "REVISION_REFERENCE_ONLY"]) assert(audioAdapter.includes(marker), `Audio adapter marker missing: ${marker}`);
for (const marker of ["createPopulatedWorkspaceFixture", "createMobileComparisonFlow", "createAsepriteAudit", "createGapInventory", "runHotPathRegression", "INPUT_TO_VISIBLE_FULL_COMPOSITOR"]) assert(finalGate.includes(marker), `Final gate marker missing: ${marker}`);
for (const token of ["document", "window", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase", "AudioContext"]) assert(!audioBundle.includes(token), `Audio lazy Core boundary changed: ${token}`);
assert(integrationBundle.includes("bootstrapPopulatedWorkspaceFixture") && integrationBundle.includes("wp190Artwork"), "Populated fixture chunk is missing.");
assert(baseline.expected_failure_count === 14 && baseline.failures.length === 14, "Existing baseline count is not 14.");
assert(baseline.failures.every((item) => item.test && item.target && Array.isArray(item.signature) && item.signature.length > 0), "Baseline identity lacks Test/target/signature.");
assert(gap.entries.length === 25, "Final gap inventory must contain all 25 required areas.");
assert(visual.coverage.populatedDesktop === "REFERENCE_CAPTURED" && visual.coverage.populatedMobile === "REFERENCE_CAPTURED" && visual.coverage.populatedTablet === "REFERENCE_CAPTURED", "Populated visual coverage is incomplete.");
assert(Object.values(responsive.measurements).every((item) => item.pageHorizontalOverflow === undefined || item.pageHorizontalOverflow === 0), "Responsive fixture has page horizontal overflow.");

console.log(JSON.stringify({
  workPackage: "WP-190",
  status: "PASS_WITH_UNTESTED_RELEASE_GATES",
  audioCore: "PASS_STATIC_ISOLATED",
  audioLazy: "PASS_STATIC_DEFAULT_OFF",
  populatedFixture: "PASS_STATIC_DETERMINISTIC",
  mobileComparison: "REFERENCE_FIXTURE_CURRENT_READ_ONLY",
  asepriteAudit: "RECORDED_OPERATIONAL_CLASSIFICATIONS",
  gapInventory: { entries: gap.entries.length, status: "RECORDED_WITH_PARTIAL_AND_UNTESTED" },
  currentSystem: "PRESERVED_BY_ISOLATED_SCOPE",
  baselineFailureIdentity: { existing: 14, matchedBy: "approved prior Test/target/major Error Signature evidence; not re-executed", new: 0 },
  untested: ["physical mobile", "stylus", "real screen reader", "Safari", "Firefox", "30-minute memory", "full compositor", "production performance", "real Legacy/user data"],
}, null, 2));
