import assert from "node:assert/strict";
import { validateQualificationEvidence } from "./validate-qualification-evidence.mjs";

const valid = validateQualificationEvidence({
  evidenceVersion: "QUALIFICATION_EVIDENCE_V1",
  packageId: "TEST-001",
  contextSha256: "a".repeat(64),
  status: "PASS",
  noProductionClaims: true,
  acceptance: [{
    id: "TEST-ACCEPTANCE-001",
    status: "PASS",
    source: ["src/example.ts"],
    contract: ["docs/example.md"],
    schema: ["src/schema.ts"],
    build: ["bench/example.ts"],
    commands: [{ command: "node test.mjs", exitCode: 0 }],
    artifactHashes: ["b".repeat(64)],
    adapterClass: "IN_MEMORY",
    classification: "IMPLEMENTED_ISOLATED",
    reviewer: "independent-reviewer",
    findingIdentity: null,
  }],
});
assert.equal(valid.valid, true);
assert.equal(valid.qualificationReady, true);

const missingReviewer = validateQualificationEvidence({
  evidenceVersion: "QUALIFICATION_EVIDENCE_V1",
  packageId: "TEST-002",
  contextSha256: "a".repeat(64),
  status: "PASS",
  noProductionClaims: true,
  acceptance: [{
    id: "TEST-ACCEPTANCE-001",
    status: "PASS",
    source: ["src/example.ts"],
    contract: ["docs/example.md"],
    schema: ["src/schema.ts"],
    build: ["bench/example.ts"],
    commands: [{ command: "node test.mjs", exitCode: 0 }],
    artifactHashes: ["b".repeat(64)],
    adapterClass: "IN_MEMORY",
    classification: "IMPLEMENTED_ISOLATED",
    reviewer: null,
    findingIdentity: null,
  }],
});
assert.equal(missingReviewer.valid, false);
assert.equal(missingReviewer.qualificationReady, false);
assert.ok(missingReviewer.issues.some((item) => item.code === "ACCEPTANCE_REVIEWER_MISSING"));

console.log("Qualification Evidence V1 validator: PASS (valid and fail-closed fixtures)");
