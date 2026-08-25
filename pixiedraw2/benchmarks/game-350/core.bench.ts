import { createCompletionEvidenceRecord, evaluateCompletionGate, type CanonicalGateIdentity, type CompletionEvidenceRecord } from "../../src/game/game-350/core.ts";
import { asSha256 } from "../../src/game/game-300/core.ts";

const identity: CanonicalGateIdentity = { projectId: "project-bench-350", ownerId: "owner-bench-350", revisionId: "revision-bench-350-1", projectHash: asSha256("b".repeat(64)) };
const inputs = [["PROJECT", "GAME-300"], ["INPUT", "GAME-310"], ["RUNTIME", "GAME-320"], ["BUILD", "GAME-330"], ["CROSS_TOOL", "GAME-340"]] as const;
const evidence: CompletionEvidenceRecord[] = await Promise.all(inputs.map(([domain, packageId]) => createCompletionEvidenceRecord({
  schemaVersion: 1, packageId, domain, status: "QUALIFIED_PASS", identity, acceptanceIds: [`${packageId.replace("-", "")}-EVIDENCE-001`], sourceIdentity: `${packageId.toLowerCase()}-bench-v1`, capturedAt: "2026-08-13T00:00:00.000Z", untested: [], payload: { domain, benchmark: true },
})));

const iterations = 100;
const started = performance.now();
let ready = 0;
for (let index = 0; index < iterations; index += 1) if ((await evaluateCompletionGate({ canonical: identity, evidence })).value?.decision === "READY") ready += 1;
const elapsed = performance.now() - started;
console.log(JSON.stringify({ package: "GAME-350", benchmark: "completion gate aggregation", iterations, ready, totalMs: Number(elapsed.toFixed(3)), averageMs: Number((elapsed / iterations).toFixed(6)), deterministic: ready === iterations }));

Deno.bench("GAME-350 deterministic completion gate aggregation", async () => {
  const result = await evaluateCompletionGate({ canonical: identity, evidence });
  if (!result.ok || result.value?.decision !== "READY") throw new Error("benchmark fixture must remain READY");
});
