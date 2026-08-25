import {
  CORE120_CLASSIFICATIONS,
  type Core120AcceptanceEvidence,
  type Core120AdapterClass,
  type Core120Classification,
  type Core120ConvergenceObservation,
  type Core120ConvergenceResult,
  type Core120EvidenceIntegrityInput,
  type Core120GateResult,
  type Core120HandoffInput,
  type Core120Hashes,
  type Core120Issue,
  type Core120NonintrusionInput,
  type Core120PredecessorEvidence,
} from "./contracts.ts";

const EMPTY_COUNTS: Record<Core120Classification, number> = {
  IMPLEMENTED_ISOLATED: 0,
  PRODUCTION_EQUIVALENT: 0,
  PRODUCTION_INTEGRATED: 0,
  UNTESTED: 0,
};

const EMPTY_ADAPTER_COUNTS: Record<Core120AdapterClass, number> = {
  IN_MEMORY: 0,
  PRODUCTION_EQUIVALENT: 0,
  PRODUCTION_INTEGRATED: 0,
  UNTESTED: 0,
};

const BLOCKING_REVIEW_STATUSES = new Set([
  "BLOCKED",
  "REJECTED",
  "NO_GO",
]);

function acceptedReview(status: string | null): boolean {
  return status === "APPROVED" ||
    status === "INDEPENDENT_REVIEW_PASS" ||
    status === "INDEPENDENT_TERRA_REVIEW_PASS" ||
    status === "APPROVED_WITH_EXTERNAL_BLOCKERS";
}

function issue(
  code: string,
  subject: string,
  detail: string,
  blocking = true,
): Core120Issue {
  return { code, blocking, subject, detail };
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function addIssue(
  issues: Core120Issue[],
  code: string,
  subject: string,
  detail: string,
  blocking = true,
): void {
  issues.push(issue(code, subject, detail, blocking));
}

function missingHashNames(hashes: Core120Hashes): string[] {
  return ["sourceHash", "contractHash", "schemaHash", "buildHash"].filter(
    (key) => !isNonEmpty(hashes[key as keyof Core120Hashes]),
  );
}

/** Validate the predecessor rows without interpreting their product behavior. */
export function inspectPredecessor(
  predecessor: Core120PredecessorEvidence,
  requiredAcceptanceIds: readonly string[],
): readonly Core120Issue[] {
  const issues: Core120Issue[] = [];
  if (
    BLOCKING_REVIEW_STATUSES.has(predecessor.status) &&
    !acceptedReview(predecessor.overallReviewStatus)
  ) {
    addIssue(
      issues,
      "PREDECESSOR_STATUS_BLOCKED",
      predecessor.packageId,
      `status=${predecessor.status}`,
    );
  }
  if (!isNonEmpty(predecessor.overallReviewer)) {
    addIssue(
      issues,
      "PREDECESSOR_REVIEWER_MISSING",
      predecessor.packageId,
      "independent reviewer is absent",
    );
  }
  if (!acceptedReview(predecessor.overallReviewStatus)) {
    addIssue(
      issues,
      "PREDECESSOR_REVIEW_NOT_ACCEPTED",
      predecessor.packageId,
      `reviewStatus=${predecessor.overallReviewStatus ?? "MISSING"}`,
    );
  }
  if (
    predecessor.status === "BLOCKED" &&
    predecessor.overallReviewStatus === "APPROVED_WITH_EXTERNAL_BLOCKERS"
  ) {
    addIssue(
      issues,
      "PREDECESSOR_EXTERNAL_BLOCKERS",
      predecessor.packageId,
      "bounded implementation is reviewed, but external qualification remains UNTESTED",
      false,
    );
  }
  const rows = new Map(predecessor.acceptanceRows.map((row) => [row.id, row]));
  for (const acceptanceId of requiredAcceptanceIds) {
    const row = rows.get(acceptanceId);
    if (!row) {
      addIssue(
        issues,
        "ACCEPTANCE_ROW_MISSING",
        `${predecessor.packageId}:${acceptanceId}`,
        "source-traceable acceptance row is absent",
      );
      continue;
    }
    const rowUntested = row.status.includes("UNTESTED") ||
      row.classification === "UNTESTED";
    if (rowUntested) {
      addIssue(
        issues,
        "ACCEPTANCE_UNTESTED",
        `${predecessor.packageId}:${acceptanceId}`,
        "acceptance remains explicitly UNTESTED",
        false,
      );
      continue;
    }
    if (
      !row.source.length || !row.contract.length || !row.schema.length ||
      !row.build.length
    ) {
      addIssue(
        issues,
        "ACCEPTANCE_TRACE_MISSING",
        `${predecessor.packageId}:${acceptanceId}`,
        "source/contract/schema/build trace is incomplete",
      );
    }
    if (row.exitCode !== 0) {
      addIssue(
        issues,
        "ACCEPTANCE_EXIT_CODE_INVALID",
        `${predecessor.packageId}:${acceptanceId}`,
        `exitCode=${row.exitCode === null ? "MISSING" : row.exitCode}`,
      );
    }
    if (!isNonEmpty(row.reviewer) || row.reviewer === "PENDING") {
      addIssue(
        issues,
        "ACCEPTANCE_REVIEWER_INVALID",
        `${predecessor.packageId}:${acceptanceId}`,
        `reviewer=${row.reviewer ?? "MISSING"}`,
      );
    }
    const missingHashes = missingHashNames(row.hashes);
    if (missingHashes.length) {
      addIssue(
        issues,
        "ACCEPTANCE_HASH_MISSING",
        `${predecessor.packageId}:${acceptanceId}`,
        missingHashes.join(","),
      );
    }
  }
  const missingOverallHashes = missingHashNames(predecessor.currentHashes);
  if (missingOverallHashes.length) {
    addIssue(
      issues,
      "PREDECESSOR_HASH_MISSING",
      predecessor.packageId,
      missingOverallHashes.join(","),
    );
  }
  return issues;
}

export function evaluateGate(input: {
  readonly predecessors: readonly Core120PredecessorEvidence[];
  readonly requiredAcceptanceIds: Readonly<Record<string, readonly string[]>>;
  readonly contextMatches: boolean;
  readonly convergence: Core120ConvergenceResult;
  readonly nonintrusion: readonly Core120Issue[];
}): Core120GateResult {
  const issues: Core120Issue[] = [];
  const counts = { ...EMPTY_COUNTS };
  for (const predecessor of input.predecessors) {
    for (const row of predecessor.acceptanceRows) {
      counts[row.classification] += 1;
    }
    issues.push(
      ...inspectPredecessor(
        predecessor,
        input.requiredAcceptanceIds[predecessor.packageId] ?? [],
      ),
    );
  }
  if (!input.contextMatches) {
    addIssue(
      issues,
      "CONTEXT_STALE_OR_MIXED",
      "CORE-120 context",
      "generated Context/manifest does not match the files tested",
    );
  }
  issues.push(...input.convergence.issues);
  issues.push(...input.nonintrusion);
  return {
    decision: issues.some((item) => item.blocking) ? "NO_GO" : "PASS",
    issues,
    predecessorRows: input.predecessors,
    classificationCounts: counts,
  };
}

function sumSideEffects(
  counts: Readonly<Record<string, number>>,
): number {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

/** Compare only stable identity material; timestamps and adapter text are excluded. */
export function compareConvergence(
  observations: readonly Core120ConvergenceObservation[],
): Core120ConvergenceResult {
  const issues: Core120Issue[] = [];
  const first = observations[0];
  // The same canonical Event observed by multiple Cores is expected.  A
  // duplicate is an extra occurrence within a Core's own observation.
  const duplicateEventCount = observations.reduce(
    (total, item) => total + Math.max(0, item.eventCount - 1),
    0,
  );
  const replaySideEffectCount = observations.reduce(
    (total, item) => total + item.replaySideEffects,
    0,
  );
  const failureCount =
    observations.filter((item) => item.tuple.resultKind !== "SUCCESS").length;
  const sideEffectTotal = observations.reduce(
    (total, item) => total + sumSideEffects(item.sideEffectCounts),
    0,
  );
  if (!first || observations.length < 2) {
    addIssue(
      issues,
      "CONVERGENCE_OBSERVATION_MISSING",
      "cross-core",
      "at least two core observations are required",
    );
  }
  for (const item of observations.slice(1)) {
    for (
      const key of [
        "identity",
        "revision",
        "packageId",
        "eventId",
        "resultKind",
        "resultHash",
      ] as const
    ) {
      if (first && item.tuple[key] !== first.tuple[key]) {
        addIssue(
          issues,
          "CROSS_CORE_IDENTITY_MISMATCH",
          `${item.core}.${key}`,
          `${item.tuple[key]} != ${first.tuple[key]}`,
        );
      }
    }
    for (const key of ["contractHash", "schemaHash", "buildHash"] as const) {
      if (first && item[key] !== first[key]) {
        addIssue(
          issues,
          "SHARED_HASH_MISMATCH",
          `${item.core}.${key}`,
          `${item[key]} != ${first[key]}`,
        );
      }
    }
  }
  if (duplicateEventCount > 0) {
    addIssue(
      issues,
      "DUPLICATE_EVENT_ID",
      "eventId",
      `duplicateEventCount=${duplicateEventCount}`,
    );
  }
  if (replaySideEffectCount > 0) {
    addIssue(
      issues,
      "REPLAY_SIDE_EFFECT",
      "replay",
      `replaySideEffectCount=${replaySideEffectCount}`,
    );
  }
  if (sideEffectTotal > 0) {
    addIssue(
      issues,
      "SIDE_EFFECT_COUNT_NONZERO",
      "external side effects",
      `sideEffectTotal=${sideEffectTotal}`,
    );
  }
  for (const item of observations) {
    if (item.authorityOwner !== "CORE") {
      addIssue(
        issues,
        "AUTHORITY_SPLIT",
        item.core,
        `authorityOwner=${item.authorityOwner}`,
      );
    }
    if (item.malformedSuccess) {
      addIssue(
        issues,
        "MALFORMED_SUCCESS_ACCEPTED",
        item.core,
        "malformed-success fixture was treated as a success",
      );
    }
    if (item.privatePayloadLeaked) {
      addIssue(
        issues,
        "PRIVACY_LEAK",
        item.core,
        "private payload was present in a diagnostic/result",
      );
    }
  }
  return {
    pass: issues.length === 0,
    issues,
    duplicateEventCount,
    replaySideEffectCount,
    failureCount,
    sideEffectTotal,
  };
}

export function evaluateNonintrusion(
  input: Core120NonintrusionInput,
): readonly Core120Issue[] {
  const issues: Core120Issue[] = [];
  const allowed = [
    "pixiedraw2/src/core/core-120/",
    "pixiedraw2/tests/core-120/",
    "pixiedraw2/benchmarks/core-120/",
    "docs/contracts/CORE-120-",
    "docs/inventory/core-120-",
    "docs/decisions/ADR-",
  ];
  const forbiddenChanged = input.changedPaths.filter((path) =>
    !allowed.some((prefix) => path.startsWith(prefix))
  );
  if (forbiddenChanged.length) {
    addIssue(
      issues,
      "WRITE_SCOPE_VIOLATION",
      "changedPaths",
      forbiddenChanged.join(","),
    );
  }
  if (input.accessedProviders.length) {
    addIssue(
      issues,
      "PRODUCTION_PROVIDER_ACCESSED",
      "providers",
      input.accessedProviders.join(","),
    );
  }
  if (input.importedProductionPaths.length) {
    addIssue(
      issues,
      "PRODUCTION_IMPORT_DETECTED",
      "imports",
      input.importedProductionPaths.join(","),
    );
  }
  if (input.claimedProductionPass) {
    addIssue(
      issues,
      "ISOLATED_EVIDENCE_OVERCLAIM",
      "classification",
      "isolated or synthetic evidence was claimed as production PASS",
    );
  }
  if (input.classifications.includes("PRODUCTION_INTEGRATED")) {
    addIssue(
      issues,
      "PRODUCTION_INTEGRATED_FORBIDDEN",
      "classification",
      "CORE-120 must not execute a production-integrated adapter",
    );
  }
  return issues;
}

/** Reject circular evidence and isolated claims that attempt to become production proof. */
export function evaluateEvidenceIntegrity(
  input: Core120EvidenceIntegrityInput,
): readonly Core120Issue[] {
  const issues: Core120Issue[] = [];
  if (input.inputPaths.includes(input.evidencePath)) {
    addIssue(
      issues,
      "EVIDENCE_SELF_REFERENCE",
      input.evidencePath,
      "the report cannot certify itself as an input",
    );
  }
  if (input.artifactPaths.includes(input.evidencePath)) {
    addIssue(
      issues,
      "EVIDENCE_ARTIFACT_SELF_REFERENCE",
      input.evidencePath,
      "the report cannot use its own digest as predecessor evidence",
    );
  }
  if (
    input.claimedProductionPass ||
    input.claimedClassification === "PRODUCTION_INTEGRATED"
  ) {
    addIssue(
      issues,
      "EVIDENCE_CLASSIFICATION_OVERCLAIM",
      input.evidencePath,
      "CORE-120 has no production-integrated execution authority",
    );
  }
  return issues;
}

export function validateHandoff(
  input: Core120HandoffInput,
): readonly Core120Issue[] {
  const issues: Core120Issue[] = [];
  if (!isNonEmpty(input.checkpointHash)) {
    addIssue(
      issues,
      "CHECKPOINT_HASH_MISSING",
      "handoff",
      "checkpoint hash is required",
    );
  }
  if (!isNonEmpty(input.rollbackRoute)) {
    addIssue(
      issues,
      "ROLLBACK_ROUTE_MISSING",
      "handoff",
      "rollback route is required",
    );
  }
  if (!isNonEmpty(input.stopFlag)) {
    addIssue(issues, "STOP_FLAG_MISSING", "handoff", "stop flag is required");
  }
  if (input.nextPackage !== "FP-006") {
    addIssue(issues, "HANDOFF_TARGET_INVALID", "handoff", input.nextPackage);
  }
  if (input.autoStartNext) {
    addIssue(
      issues,
      "AUTO_START_NEXT_FORBIDDEN",
      "handoff",
      "autoStartNext=true",
    );
  }
  if (!input.ownerAuthorizationRequired) {
    addIssue(
      issues,
      "OWNER_AUTHORIZATION_MISSING",
      "handoff",
      "next phase requires explicit Owner authorization",
    );
  }
  return issues;
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${
    Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")
  }}`;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const normalized = new Uint8Array(bytes.byteLength);
  normalized.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", normalized.buffer);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function countClassifications(
  rows: readonly Core120AcceptanceEvidence[],
): Readonly<Record<Core120Classification, number>> {
  const counts = { ...EMPTY_COUNTS };
  for (const row of rows) counts[row.classification] += 1;
  return counts;
}

export function countAdapterClasses(
  rows: readonly Core120AcceptanceEvidence[],
): Readonly<Record<Core120AdapterClass, number>> {
  const counts = { ...EMPTY_ADAPTER_COUNTS };
  for (const row of rows) counts[row.adapterClass] += 1;
  return counts;
}
