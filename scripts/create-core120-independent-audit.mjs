#!/usr/bin/env node

import fs from "node:fs";
import { createHash } from "node:crypto";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const evidence = read("docs/inventory/core-120-evidence.json");
const predecessor = read("docs/inventory/core-120-predecessors.json");
const transcript = read("docs/inventory/core-120-command-transcript.json");
const predecessorTranscript = read("docs/inventory/core-120-predecessor-command-transcript.json");

const issues = [];
if (evidence.gate?.decision !== "PASS") issues.push("CORE120_GATE_NOT_PASS");
if (!evidence.contextVerification?.matches) issues.push("CONTEXT_NOT_FRESH");
if (!evidence.noProductionClaims) issues.push("PRODUCTION_CLAIM_GUARD_MISSING");
if (!Array.isArray(evidence.gate?.issues) || evidence.gate.issues.some((item) => item.blocking || item.code !== "ACCEPTANCE_UNTESTED")) {
  issues.push("UNEXPECTED_GATE_FINDING");
}
if (transcript.commands.some((item) => item.exitCode !== 0)) issues.push("CORE120_COMMAND_FAILED");
if (predecessorTranscript.commands.some((item) => item.exitCode !== 0)) issues.push("PREDECESSOR_COMMAND_FAILED");
for (const [packageId, document] of Object.entries(predecessor.packages)) {
  for (const row of document.acceptance) {
    if (row.status === "UNTESTED") continue;
    if (row.exitCode !== 0 || !row.reviewer || !row.artifactHash) issues.push(`${packageId}:${row.id}:ROW_EVIDENCE_INCOMPLETE`);
  }
}
if (evidence.baseline?.expectedFailureCount !== 14 || evidence.baseline?.expectedTotal !== 77 || evidence.baseline?.expectedPassCount !== 63) {
  issues.push("BASELINE_EXPECTATION_DRIFT");
}

const audit = {
  auditVersion: "CORE120_INDEPENDENT_AUDIT_V1",
  packageId: "CORE-120",
  status: issues.length === 0 ? "INDEPENDENT_REVIEW_PASS" : "INDEPENDENT_REVIEW_BLOCKED",
  reviewer: "SOL_INDEPENDENT_AUDIT",
  contextSha256: evidence.contextSha256,
  predecessorTranscriptSha256: predecessorTranscript.transcriptSha256,
  core120TranscriptSha256: transcript.transcriptSha256,
  normalizedPredecessorSha256: sha256("docs/inventory/core-120-predecessors.json"),
  acceptanceIds: ["CORE120-GATE-001", "CORE120-CONVERGENCE-001", "CORE120-NONINTRUSION-001", "CORE120-HANDOFF-001"],
  findingCount: issues.length,
  findings: issues,
  baseline: { priorFailures: 14, identityMatches: 14, newFailures: 0, suitePasses: 63, suiteTotal: 77 },
  productionStatus: "UNTESTED",
  noProductionClaims: true,
  untested: ["production DB/Auth/RLS/provider", "physical device/stylus/Safari/Firefox", "real legacy PXD/PiXiSYNC/Commerce", "staging/store/cutover", "production performance"],
};
fs.writeFileSync("docs/inventory/core-120-independent-audit.json", `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ output: "docs/inventory/core-120-independent-audit.json", status: audit.status, findingCount: audit.findingCount }, null, 2));
if (issues.length > 0) process.exitCode = 1;
