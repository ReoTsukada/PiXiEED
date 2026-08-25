import {
  createCompletionEvidenceRecord,
  evaluateCompletionGate,
  type CanonicalGateIdentity,
  type CompletionEvidenceRecord,
  type EvidenceDomain,
} from "../../src/game/game-350/core.ts";
import { asSha256 } from "../../src/game/game-300/core.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const identity: CanonicalGateIdentity = { projectId: "project-game-350", ownerId: "owner-game-350", revisionId: "revision-game-350-1", projectHash: asSha256("a".repeat(64)) };
const domains: readonly [EvidenceDomain, CompletionEvidenceRecord["packageId"]][] = [["PROJECT", "GAME-300"], ["INPUT", "GAME-310"], ["RUNTIME", "GAME-320"], ["BUILD", "GAME-330"], ["CROSS_TOOL", "GAME-340"]];

async function fixture(status: CompletionEvidenceRecord["status"] = "QUALIFIED_PASS", untested: readonly string[] = []): Promise<CompletionEvidenceRecord[]> {
  return Promise.all(domains.map(([domain, packageId]) => createCompletionEvidenceRecord({
    schemaVersion: 1, packageId, domain, status, identity, acceptanceIds: [`${packageId.replace("-", "")} -EVIDENCE-001`.replace(" ", "")], sourceIdentity: `${packageId.toLowerCase()}-source-v1`, capturedAt: "2026-08-13T00:00:00.000Z", untested, payload: { domain, status, contract: `${packageId}/contract` },
  })));
}

Deno.test("GAME350-SCOPE-001 aggregates all canonical domains deterministically", async () => {
  const evidence = await fixture();
  const one = await evaluateCompletionGate({ canonical: identity, evidence });
  const two = await evaluateCompletionGate({ canonical: identity, evidence: [...evidence].reverse() });
  assert(one.ok && two.ok, "complete evidence must evaluate");
  assert(one.value!.decision === "READY", "qualified evidence should be ready");
  assert(one.value!.evidenceHash === two.value!.evidenceHash, "domain order must not change gate identity");
});

Deno.test("GAME350-EVIDENCE-001 preserves untested and static evidence as NOT_READY", async () => {
  const evidence = await fixture("PASS_STATIC_TARGETED", ["browser", "physical device", "native", "production"]);
  const result = await evaluateCompletionGate({ canonical: identity, evidence });
  assert(result.ok && result.value!.decision === "NOT_READY", "static evidence cannot become READY");
  assert(result.value!.untested.join("|") === "browser|native|physical device|production", "untested must be explicit and sorted");
});

Deno.test("GAME350-EVIDENCE-001 fails closed on missing, stale, contradictory, and hash-mismatched evidence", async () => {
  const evidence = await fixture();
  const missing = await evaluateCompletionGate({ canonical: identity, evidence: evidence.slice(0, 4) });
  assert(!missing.ok && missing.diagnostics.some((item) => item.code === "MISSING_EVIDENCE"), "missing domain must fail closed");
  const stale = await evaluateCompletionGate({ canonical: identity, evidence: evidence.map((item, index) => index === 0 ? { ...item, identity: { ...item.identity, revisionId: "stale-revision" } } : item) });
  assert(!stale.ok && stale.diagnostics.some((item) => item.code === "HASH_MISMATCH"), "stale tampering must invalidate evidence hash");
  const contradictory = await evaluateCompletionGate({ canonical: identity, evidence: evidence.map((item, index) => index === 1 ? { ...item, status: "BLOCKED" } : item) });
  assert(!contradictory.ok && contradictory.diagnostics.some((item) => item.code === "CONTRADICTORY_EVIDENCE"), "blocked predecessor must fail closed");
});

Deno.test("GAME350-STOP-001 gate and qualification modules have no host execution seams", async () => {
  const paths = [
    "src/game/game-350/core.ts",
    "src/game/game-350/studio.ts",
    "src/game/game-350/runtime-qualification.ts",
  ];
  for (const path of paths) {
    const source = await Deno.readTextFile(path);
    assert(!/document|fetch|WebSocket|localStorage|indexedDB|Deno\.(write|read|open)|window\./u.test(source), `${path} must remain host-neutral TypeScript`);
  }
});
