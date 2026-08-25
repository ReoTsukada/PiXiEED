import {
  compareConvergence,
  countAdapterClasses,
  countClassifications,
  evaluateEvidenceIntegrity,
  evaluateGate,
  evaluateNonintrusion,
  stableJson,
  validateHandoff,
} from "../../src/core/core-120/index.ts";
import type {
  Core120AcceptanceEvidence,
  Core120ConvergenceObservation,
  Core120PredecessorEvidence,
} from "../../src/core/core-120/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hasCode(
  result: { readonly issues: readonly { readonly code: string }[] },
  code: string,
): boolean {
  return result.issues.some((item) => item.code === code);
}

const baseObservation = (core: string): Core120ConvergenceObservation => ({
  core,
  tuple: {
    identity: "tenant:t1/project:p1/asset:a1",
    revision: "r7",
    packageId: "pkg:p1",
    eventId: "event:e1",
    resultKind: "SUCCESS",
    resultHash: "result-h1",
  },
  authorityOwner: "CORE",
  contractHash: "contract-h1",
  schemaHash: "schema-h1",
  buildHash: "build-h1",
  eventCount: 1,
  sideEffectCounts: { provider: 0, finance: 0, notification: 0, search: 0 },
  malformedSuccess: false,
  privatePayloadLeaked: false,
  replaySideEffects: 0,
});

function validAcceptance(id: string): Core120AcceptanceEvidence {
  return {
    id,
    status: "PASS_ISOLATED_REFERENCE",
    source: ["src.ts"],
    contract: ["contract.md"],
    schema: ["schema.ts"],
    build: ["benchmark.ts"],
    exitCode: 0,
    reviewer: "TERRA_HIGH",
    hashes: {
      sourceHash: "source-h1",
      contractHash: "contract-h1",
      schemaHash: "schema-h1",
      buildHash: "build-h1",
    },
    classification: "IMPLEMENTED_ISOLATED",
    adapterClass: "IN_MEMORY",
    findingIdentity: null,
  };
}

function validPredecessor(): Core120PredecessorEvidence {
  const rows = [validAcceptance("P-001")];
  return {
    packageId: "P",
    evidencePath: "evidence.json",
    status: "ACCEPTED",
    overallReviewer: "TERRA_HIGH",
    overallReviewStatus: "APPROVED",
    evidenceHash: "evidence-h1",
    currentHashes: {
      sourceHash: "source-h1",
      contractHash: "contract-h1",
      schemaHash: "schema-h1",
      buildHash: "build-h1",
    },
    acceptanceRows: rows,
    residualUntested: [],
    adapterCounts: countAdapterClasses(rows),
  };
}

Deno.test("CORE-120 stable identity material is deterministic", async () => {
  const left = stableJson({ z: 1, a: { y: 2, x: 3 } });
  const right = stableJson({ a: { x: 3, y: 2 }, z: 1 });
  assert(
    left === right,
    "key order must not alter canonical identity material",
  );
});

Deno.test("CORE-120 compares identity, revision, package, event, and result", () => {
  const keys = [
    "identity",
    "revision",
    "packageId",
    "eventId",
    "resultKind",
    "resultHash",
  ] as const;
  for (const key of keys) {
    const left = baseObservation("CORE-100");
    const right = baseObservation("CORE-110");
    const tuple = {
      ...right.tuple,
      [key]: key === "resultKind" ? "FAILURE" : `${key}-different`,
    };
    const result = compareConvergence([left, { ...right, tuple }]);
    assert(
      hasCode(result, "CROSS_CORE_IDENTITY_MISMATCH"),
      `${key} mismatch must block`,
    );
  }
});

Deno.test("CORE-120 accepts one canonical event observed consistently by each Core", () => {
  const result = compareConvergence([
    baseObservation("CORE-100"),
    baseObservation("CORE-110"),
  ]);
  assert(result.pass, "matching observations must converge");
  assert(
    result.duplicateEventCount === 0,
    "one event per Core is not a duplicate",
  );
  assert(
    result.failureCount === 0,
    "success observations must have no failures",
  );
  assert(result.sideEffectTotal === 0, "convergence must have no side effects");
});

Deno.test("CORE-120 attack matrix blocks duplicates, replay, failures, and side effects", () => {
  const duplicate = compareConvergence([
    { ...baseObservation("CORE-100"), eventCount: 2 },
    baseObservation("CORE-110"),
  ]);
  assert(
    hasCode(duplicate, "DUPLICATE_EVENT_ID"),
    "duplicate event must be observed",
  );

  const replay = compareConvergence([
    baseObservation("CORE-100"),
    {
      ...baseObservation("CORE-110"),
      tuple: { ...baseObservation("CORE-110").tuple, eventId: "event:e2" },
      replaySideEffects: 1,
    },
  ]);
  assert(
    hasCode(replay, "REPLAY_SIDE_EFFECT"),
    "replay side effects must block",
  );

  const failed = compareConvergence([
    {
      ...baseObservation("CORE-100"),
      tuple: {
        ...baseObservation("CORE-100").tuple,
        resultKind: "FAILURE",
        resultHash: "result-f1",
      },
    },
    {
      ...baseObservation("CORE-110"),
      tuple: {
        ...baseObservation("CORE-110").tuple,
        eventId: "event:e2",
        resultKind: "FAILURE",
        resultHash: "result-f1",
      },
    },
  ]);
  assert(failed.failureCount === 2, "failure count must be deterministic");

  const sideEffect = compareConvergence([
    baseObservation("CORE-100"),
    {
      ...baseObservation("CORE-110"),
      tuple: { ...baseObservation("CORE-110").tuple, eventId: "event:e2" },
      sideEffectCounts: { provider: 1 },
    },
  ]);
  assert(
    hasCode(sideEffect, "SIDE_EFFECT_COUNT_NONZERO"),
    "side effects must block",
  );
});

Deno.test("CORE-120 attack matrix blocks malformed success, authority split, and privacy leak", () => {
  const result = compareConvergence([
    baseObservation("CORE-100"),
    {
      ...baseObservation("CORE-110"),
      tuple: { ...baseObservation("CORE-110").tuple, eventId: "event:e2" },
      authorityOwner: "CALLER",
      malformedSuccess: true,
      privatePayloadLeaked: true,
    },
  ]);
  assert(hasCode(result, "AUTHORITY_SPLIT"), "caller authority must block");
  assert(
    hasCode(result, "MALFORMED_SUCCESS_ACCEPTED"),
    "malformed success must block",
  );
  assert(hasCode(result, "PRIVACY_LEAK"), "private payload leak must block");
});

Deno.test("CORE-120 keeps classifications separate and blocks production intrusion", () => {
  const rows = [
    validAcceptance("P-001"),
    {
      ...validAcceptance("P-002"),
      classification: "PRODUCTION_EQUIVALENT" as const,
      adapterClass: "PRODUCTION_EQUIVALENT" as const,
    },
    {
      ...validAcceptance("P-003"),
      classification: "UNTESTED" as const,
      adapterClass: "UNTESTED" as const,
      status: "UNTESTED",
    },
  ];
  const counts = countClassifications(rows);
  assert(
    counts.IMPLEMENTED_ISOLATED === 1,
    "isolated count must remain separate",
  );
  assert(
    counts.PRODUCTION_EQUIVALENT === 1,
    "production-equivalent count must remain separate",
  );
  assert(counts.UNTESTED === 1, "untested count must remain separate");
  const adapterCounts = countAdapterClasses(rows);
  assert(
    adapterCounts.IN_MEMORY === 1,
    "in-memory adapter count must remain separate",
  );
  assert(
    adapterCounts.PRODUCTION_EQUIVALENT === 1,
    "production-equivalent adapter count must remain separate",
  );
  assert(
    adapterCounts.UNTESTED === 1,
    "untested adapter count must remain separate",
  );
  const issues = evaluateNonintrusion({
    changedPaths: ["pixiedraw2/src/core/core-120/gate.ts"],
    accessedProviders: [],
    importedProductionPaths: [],
    claimedProductionPass: false,
    classifications: [
      "IMPLEMENTED_ISOLATED",
      "PRODUCTION_EQUIVALENT",
      "UNTESTED",
    ],
  });
  assert(
    !issues.some((item) => item.blocking),
    "isolated-only execution should be nonintrusive",
  );
  const attack = evaluateNonintrusion({
    changedPaths: ["pixiedraw/assets/js/app.js"],
    accessedProviders: ["supabase", "Storage"],
    importedProductionPaths: ["pixiedraw/", "supabase/"],
    claimedProductionPass: true,
    classifications: ["PRODUCTION_INTEGRATED"],
  });
  assert(
    attack.length >= 5,
    "production intrusion attack matrix must be visible",
  );
});

Deno.test("CORE-120 rejects self-referential evidence and production overclaims", () => {
  const selfReference = evaluateEvidenceIntegrity({
    evidencePath: "docs/inventory/core-120-evidence.json",
    inputPaths: ["docs/inventory/core-120-evidence.json"],
    artifactPaths: [],
    claimedClassification: "IMPLEMENTED_ISOLATED",
    claimedProductionPass: false,
  });
  assert(
    hasCode({ issues: selfReference }, "EVIDENCE_SELF_REFERENCE"),
    "self-referential evidence must block",
  );
  const overclaim = evaluateEvidenceIntegrity({
    evidencePath: "docs/inventory/core-120-evidence.json",
    inputPaths: ["docs/inventory/fp-004-evidence.json"],
    artifactPaths: ["docs/inventory/core-120-evidence.json"],
    claimedClassification: "PRODUCTION_INTEGRATED",
    claimedProductionPass: true,
  });
  assert(
    hasCode({ issues: overclaim }, "EVIDENCE_ARTIFACT_SELF_REFERENCE") &&
      hasCode({ issues: overclaim }, "EVIDENCE_CLASSIFICATION_OVERCLAIM"),
    "self digest and production overclaim must block",
  );
});

Deno.test("CORE-120 records rollback, stop flag, and non-automatic FP-006 handoff", () => {
  const valid = validateHandoff({
    checkpointHash: "checkpoint-h1",
    rollbackRoute: "keep-current-path-as-fallback",
    stopFlag: "CORE120_STOP_AWAIT_OWNER",
    nextPackage: "FP-006",
    autoStartNext: false,
    ownerAuthorizationRequired: true,
  });
  assert(valid.length === 0, "valid handoff must not create an issue");
  const invalid = validateHandoff({
    checkpointHash: "",
    rollbackRoute: "",
    stopFlag: "",
    nextPackage: "FP-006",
    autoStartNext: true,
    ownerAuthorizationRequired: false,
  });
  assert(invalid.length === 5, "handoff safety controls must all be enforced");
});

Deno.test("CORE-120 gate is fail-closed for missing predecessor evidence", () => {
  const result = evaluateGate({
    predecessors: [validPredecessor()],
    requiredAcceptanceIds: { P: ["P-001", "P-MISSING"] },
    contextMatches: true,
    convergence: compareConvergence([baseObservation("CORE-100"), {
      ...baseObservation("CORE-110"),
      tuple: { ...baseObservation("CORE-110").tuple, eventId: "event:e2" },
    }]),
    nonintrusion: [],
  });
  assert(
    result.decision === "NO_GO",
    "missing acceptance evidence must produce NO_GO",
  );
  assert(
    hasCode(result, "ACCEPTANCE_ROW_MISSING"),
    "missing row identity must be named",
  );
});
