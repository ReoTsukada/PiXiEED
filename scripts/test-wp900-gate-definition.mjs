import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const readText = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const matrix = readJson("docs/inventory/wp900-release-acceptance-matrix.json");
const matrixSchema = readJson("docs/inventory/wp900-release-acceptance-matrix-v1.schema.json");
const aggregate = readJson("docs/inventory/wp900-aggregated-release-gaps.json");
const queue = readText("00_START_HERE/IMPLEMENTATION_QUEUE.yaml");
const roadmap = readText("09_ROADMAP/WORK_PACKAGES/WP-900.md");
const prompt = readText("CODEX_TASK_PROMPTS/WP-900.md");
const contextMap = readJson("00_START_HERE/WORK_PACKAGE_CONTEXT_MAP.json");
const requiredGates = ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9"];
const allowedStatuses = new Set(["COMPLETE", "PARTIAL", "UNTESTED", "DECISION_PENDING", "UNKNOWN", "BLOCKED"]);
const allowedPriorities = new Set(["P0_BLOCKER", "P1_REQUIRED", "P2_POST_LAUNCH", "OPTIONAL_OPTIMIZATION"]);
assert(exists("docs/inventory/wp900-release-acceptance-matrix-v1.schema.json"), "WP-900 matrix schema is missing");
assert(matrixSchema.$id === "https://pixieed.invalid/schema/wp900-release-acceptance-matrix-v1.json", "WP-900 matrix schema identity is invalid");
assert(matrixSchema.title === "PiXiEED WP-900 Release Acceptance Matrix v1", "WP-900 matrix schema title is invalid");
for (const requiredProperty of ["schemaVersion", "workPackage", "definitionStatus", "releaseDecision", "gates", "acceptanceItems", "bundleBaselines", "sourceGapInventory", "prohibitedActions", "ownerApprovalBoundary"]) {
  assert(matrixSchema.required.includes(requiredProperty), `WP-900 matrix schema required property is missing: ${requiredProperty}`);
}
assert(matrix.schemaVersion === 1 && matrix.workPackage === "WP-900", "WP-900 matrix identity is invalid");
assert(matrix.definitionStatus === "DEFINED_NOT_EXECUTED" && matrix.releaseDecision === "NOT_READY", "Definition phase must not claim readiness");
assert(matrix.gates.length === 10 && matrix.gates.map((gate) => gate.id).join(",") === requiredGates.join(","), "WP-900 must define exactly G0 through G9");
assert(matrix.acceptanceItems.length > 0, "WP-900 acceptance items are missing");
for (const item of matrix.acceptanceItems) {
  assert(requiredGates.includes(item.gate), `Unknown gate: ${item.id}`);
  assert(allowedStatuses.has(item.currentStatus), `Invalid status: ${item.id}`);
  assert(allowedPriorities.has(item.priority), `Invalid priority: ${item.id}`);
  assert(item.sourceRefs.length > 0 && item.requiredEvidence.length > 0, `Evidence definition missing: ${item.id}`);
}
assert(aggregate.status === "AGGREGATED_EXISTING_GAPS_NOT_REVALIDATED" && aggregate.statusPreservation === "SOURCE_STATUS_UNCHANGED", "Gap aggregate must preserve source status without execution");
assert(aggregate.sourceInventoryCount > 0 && aggregate.sourceStatusReferenceCount > 0, "Gap aggregate is empty");
assert(matrix.sourceGapInventory.sourceInventoryCount === aggregate.sourceInventoryCount, "Matrix source inventory count is stale");
assert(matrix.sourceGapInventory.sourceStatusReferenceCount === aggregate.sourceStatusReferenceCount, "Matrix source status reference count is stale");
assert(contextMap.work_packages["WP-900"], "WP-900 Context Map entry is missing");
assert(queue.includes("id: WP-900") && queue.includes("title: PiXiEED Staged Release Readiness Gate"), "WP-900 Queue definition is not canonical");
for (const dependency of ["WP-150", "WP-160", "WP-170", "WP-180", "WP-190", "WP-200", "WP-210", "WP-220", "WP-230", "WP-240", "WP-250"]) assert(queue.includes(dependency), `WP-900 dependency missing: ${dependency}`);
for (const marker of ["not a Production", "G0", "G9", "Production migration", "Owner"]) assert(roadmap.includes(marker), `WP-900 roadmap marker missing: ${marker}`);
for (const marker of ["not an implementation", "UNTESTED", "Production migration", "READY_FOR_LIMITED_ROLLOUT"]) assert(prompt.includes(marker), `WP-900 prompt marker missing: ${marker}`);
assert(!matrix.prohibitedActions.includes("production validation"), "WP-900 must allow future separately authorized validation, not Production action");
console.log(JSON.stringify({ workPackage: "WP-900", status: "PASS_CANONICAL_GATE_DEFINITION_ONLY", gates: matrix.gates.length, acceptanceItems: matrix.acceptanceItems.length, sourceInventoryCount: aggregate.sourceInventoryCount, sourceStatusReferenceCount: aggregate.sourceStatusReferenceCount, releaseDecision: matrix.releaseDecision, productionActionsExecuted: false }, null, 2));
