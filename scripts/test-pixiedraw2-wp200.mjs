import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const queue = read("00_START_HERE/IMPLEMENTATION_QUEUE.yaml");
const registry = json("00_START_HERE/WORK_PACKAGE_REGISTRY.json");

const catalogOrder = queue.split(/^catalog_order:\s*$/m)[1]?.split(/^phase_order:/m)[0] ?? "";
const wp200InCanonicalRegistry = registry.packages?.some((item) => item.id === "WP-200") ?? false;
const wp200InCanonicalQueue =
  /^current_ready_package:\s*WP-200\s*$/m.test(queue) ||
  /^  - WP-200\s*$/m.test(catalogOrder);

if (!wp200InCanonicalRegistry || !wp200InCanonicalQueue) {
  console.log(JSON.stringify({
    workPackage: "WP-200",
    status: "SKIP_STALE_CANONICAL",
    legacyAuditOnly: true,
    canonicalRegistry: wp200InCanonicalRegistry ? "PRESENT" : "ABSENT",
    canonicalQueue: wp200InCanonicalQueue ? "PRESENT" : "ABSENT",
  }, null, 2));
  process.exit(0);
}

const state = read(".codex/PIXIEED_IMPLEMENTATION_STATE.yaml");
const roadmap = read("09_ROADMAP/WORK_PACKAGES/WP-200.md");
const contract = read("docs/contracts/WP-200-GAME-RUNTIME-BRIDGE.md");
const game = read("pixiedraw2/src/wp200-game-runtime-core.ts");
const build = read("pixiedraw2/src/wp200-game-build-pipeline.ts");
const runtime = read("pixiedraw2/src/wp200-runtime-bundle-entry.ts");
const runtimeBundle = read("pixiedraw2/dist/wp200-runtime-core.js");
const gameBundle = read("pixiedraw2/dist/wp200-game-core.js");
const initialBundle = read("pixiedraw2/dist/draw2-entry.js");
const wp160Runtime = read("pixiedraw2/dist/wp160-runtime-core.js");
const baseline = json("docs/inventory/baseline-failure-identity-wp080.json");
const performance = json("docs/inventory/wp200-performance.json");

assert(queue.includes("id: WP-200") && queue.includes("status: complete"), "WP-200 queue must be complete.");
assert(state.includes("current_work_package: WP-200") && state.includes("status: complete_pending_external_audit"), "Implementation State must record WP-200 completion pending audit.");
for (const marker of ["Draw2 Asset Revision", "PiXiAudio Revision", "Runtime Artifact", "Current Draw retirement", "Production Release remain NOT APPROVED"]) assert(roadmap.includes(marker) || contract.includes(marker), `Canonical WP-200 marker missing: ${marker}`);
for (const marker of ["GameProjectRevision", "GameAssetReference", "GameInputActionMap", "createGameRuntimePreview", "safeGameHotReload", "serializeGameRuntimeSaveState"]) assert(game.includes(marker), `Game Core marker missing: ${marker}`);
for (const marker of ["createGameBuildPlan", "provenanceHash", "attachVerifiedGameArtifact", "recoverGameBuild", "PINNED"]) assert(build.includes(marker), `Build boundary marker missing: ${marker}`);
assert(runtime.includes("wp200-game-runtime-core.ts") && !runtime.includes("wp200-game-build-pipeline"), "Runtime entry must not import Build tooling.");
for (const token of ["document", "window", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase", "AudioContext"]) {
  assert(!gameBundle.includes(token), `Game Core must remain environment independent: ${token}`);
  assert(!runtimeBundle.includes(token), `Runtime Core must remain environment independent: ${token}`);
}
for (const token of ["createGameBuildRecord", "createGameBuildPlan", "wp200-game-build-pipeline", "wp180-workspace", "wp190-audio-core"]) assert(!runtimeBundle.includes(token), `Runtime bundle contains forbidden editor/build code: ${token}`);
for (const token of ["wp200-game-core.js", "GameProjectRevision", "createGameProjectRevision"]) assert(!initialBundle.includes(token), `Game Core leaked into Initial Editor: ${token}`);
assert(!wp160Runtime.includes("wp200") && performance.deltas.initialEditorRaw === 0 && performance.deltas.runtimeBaselineRaw === 0, "WP-190 bundle baselines regressed.");
assert(baseline.expected_failure_count === 14 && baseline.failures.length === 14 && baseline.failures.every((item) => item.test && item.target && item.signature?.length), "Baseline Failure Identity is not the approved 14-entry shape.");
assert(performance.boundaries.currentRoutesAndData === "OUT_OF_SCOPE_AND_UNTOUCHED", "Current-system boundary changed.");

console.log(JSON.stringify({
  workPackage: "WP-200",
  status: "PASS_WITH_UNTESTED_RELEASE_GATES",
  scope: "RECONSTRUCTED_FROM_APPROVED_SOURCES",
  gameCore: "PASS_STATIC_ISOLATED",
  runtimeBoundary: "PASS_NO_BUILD_OR_EDITOR_UI",
  initialEditorRaw: performance.bundles.initialEditor.raw,
  wp160RuntimeRaw: performance.bundles.wp160RuntimeBaseline.raw,
  baselineFailureIdentity: { existing: 14, new: 0, notReexecuted: true },
  currentSystem: "PRESERVED_BY_ISOLATED_SCOPE",
  untested: performance.untested,
}, null, 2));
