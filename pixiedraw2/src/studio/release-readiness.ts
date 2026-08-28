/**
 * STUDIO-030 Beta / Production readiness boundary.
 *
 * Readiness is evidence-driven. This module never probes a provider, deploys
 * an artifact, changes feature flags, or sends notifications. Missing or
 * isolated-fixture evidence remains visible as UNTESTED instead of becoming a
 * release pass.
 */

import { canonicalJson, type Sha256, sha256 } from "../game/game-300/core.ts";
import {
  type StudioReleaseCandidate,
  verifyStudioReleaseCandidate,
} from "./package-publish.ts";

export const STUDIO_READINESS_SCHEMA_VERSION = 2 as const;

export type StudioReadinessCheckId =
  | "STAGING_DEPLOYMENT"
  | "COLLABORATION_2_TO_3"
  | "RECONNECT_RECOVERY"
  | "DEVICE_BROWSER_MATRIX"
  | "PERFORMANCE_BUDGET"
  | "MONITORING_ALERTS"
  | "ROLLBACK"
  | "NATIVE_SHELL";

export type StudioReadinessEnvironment = "STAGING" | "PRODUCTION";
export type StudioReadinessStatus = "PASS" | "UNTESTED" | "FAIL" | "BLOCKED";
export type StudioReadinessEvidenceKind =
  | "LIVE_OBSERVATION"
  | "ISOLATED_FIXTURE";
export type StudioReadinessTarget = "STAGING" | "BETA" | "PRODUCTION";
export type StudioReadinessDecision =
  | "READY_FOR_STAGING"
  | "READY_FOR_BETA"
  | "READY_FOR_PRODUCTION"
  | "NOT_READY"
  | "BLOCKED";

export const STUDIO_READINESS_CHECK_IDS: readonly StudioReadinessCheckId[] = [
  "STAGING_DEPLOYMENT",
  "COLLABORATION_2_TO_3",
  "RECONNECT_RECOVERY",
  "DEVICE_BROWSER_MATRIX",
  "PERFORMANCE_BUDGET",
  "MONITORING_ALERTS",
  "ROLLBACK",
  "NATIVE_SHELL",
] as const;

export interface StudioReadinessEvidence {
  readonly schemaVersion: typeof STUDIO_READINESS_SCHEMA_VERSION;
  readonly checkId: StudioReadinessCheckId;
  readonly environment: StudioReadinessEnvironment;
  readonly status: StudioReadinessStatus;
  readonly evidenceKind: StudioReadinessEvidenceKind;
  readonly packageHash: Sha256;
  readonly sourceIdentity: string;
  readonly capturedAt: string;
  readonly summary: string;
  readonly participants?: number;
  readonly evidenceHash: Sha256;
}

export interface StudioReadinessGateInput {
  readonly candidate: StudioReleaseCandidate;
  readonly target: StudioReadinessTarget;
  readonly evidence: readonly StudioReadinessEvidence[];
}

export interface StudioReadinessCheckResult {
  readonly checkId: StudioReadinessCheckId;
  readonly environment: StudioReadinessEnvironment;
  readonly status: StudioReadinessStatus;
  readonly evidenceKind: StudioReadinessEvidenceKind;
  readonly participants?: number;
}

export interface StudioReadinessReport {
  readonly schemaVersion: typeof STUDIO_READINESS_SCHEMA_VERSION;
  readonly decision: StudioReadinessDecision;
  readonly target: StudioReadinessTarget;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly projectRevisionId: string;
  readonly packageHash: Sha256;
  readonly checks: readonly StudioReadinessCheckResult[];
  readonly untested: readonly StudioReadinessCheckId[];
  readonly evidenceHash: Sha256;
}

export type StudioReadinessDiagnosticCode =
  | "UNSUPPORTED_SCHEMA"
  | "INVALID_CHECK_ID"
  | "INVALID_STATUS"
  | "INVALID_ENVIRONMENT"
  | "INVALID_EVIDENCE_KIND"
  | "MISSING_CHECK"
  | "DUPLICATE_CHECK"
  | "IDENTITY_MISMATCH"
  | "HASH_MISMATCH"
  | "INVALID_CAPTURE_TIME"
  | "INVALID_SOURCE"
  | "INVALID_PARTICIPANT_COUNT"
  | "SYNTHETIC_EVIDENCE"
  | "FAILED_CHECK"
  | "BLOCKED_CHECK"
  | "ENVIRONMENT_MISMATCH"
  | "INVALID_CLAIM";

export interface StudioReadinessDiagnostic {
  readonly code: StudioReadinessDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export interface StudioReadinessResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly diagnostics: readonly StudioReadinessDiagnostic[];
}

const CHECK_IDS = STUDIO_READINESS_CHECK_IDS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCheckId(value: unknown): value is StudioReadinessCheckId {
  return typeof value === "string" &&
    (CHECK_IDS as readonly string[]).includes(value);
}

function isStatus(value: unknown): value is StudioReadinessStatus {
  return value === "PASS" || value === "UNTESTED" || value === "FAIL" ||
    value === "BLOCKED";
}

function isEnvironment(value: unknown): value is StudioReadinessEnvironment {
  return value === "STAGING" || value === "PRODUCTION";
}

function isEvidenceKind(value: unknown): value is StudioReadinessEvidenceKind {
  return value === "LIVE_OBSERVATION" || value === "ISOLATED_FIXTURE";
}

function isTarget(value: unknown): value is StudioReadinessTarget {
  return value === "STAGING" || value === "BETA" || value === "PRODUCTION";
}

function diagnostic(
  code: StudioReadinessDiagnosticCode,
  path: string,
  message: string,
): StudioReadinessDiagnostic {
  return { code, path, message };
}

function failure<T>(
  ...diagnostics: StudioReadinessDiagnostic[]
): StudioReadinessResult<T> {
  return { ok: false, diagnostics };
}

function success<T>(value: T): StudioReadinessResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function stable(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function validHash(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function evidenceHashInput(
  evidence: Omit<StudioReadinessEvidence, "evidenceHash">,
): unknown {
  return {
    schemaVersion: evidence.schemaVersion,
    checkId: evidence.checkId,
    environment: evidence.environment,
    status: evidence.status,
    evidenceKind: evidence.evidenceKind,
    packageHash: evidence.packageHash,
    sourceIdentity: evidence.sourceIdentity,
    capturedAt: evidence.capturedAt,
    summary: evidence.summary,
    ...(evidence.participants === undefined
      ? {}
      : { participants: evidence.participants }),
  };
}

/** Create a tamper-evident readiness record; it performs no external check. */
export async function createStudioReadinessEvidence(
  evidence: Omit<StudioReadinessEvidence, "evidenceHash">,
): Promise<StudioReadinessEvidence> {
  return {
    ...evidence,
    evidenceHash: await sha256(evidenceHashInput(evidence)),
  };
}

async function validateEvidenceHash(
  evidence: StudioReadinessEvidence,
): Promise<boolean> {
  try {
    const { evidenceHash, ...base } = evidence;
    return evidenceHash === await sha256(evidenceHashInput(base));
  } catch {
    return false;
  }
}

function expectedEnvironment(
  target: StudioReadinessTarget,
): StudioReadinessEnvironment | undefined {
  if (target === "STAGING" || target === "BETA") return "STAGING";
  if (target === "PRODUCTION") return "PRODUCTION";
  return undefined;
}

function checkResults(
  evidence: readonly StudioReadinessEvidence[],
): readonly StudioReadinessCheckResult[] {
  return CHECK_IDS.map((checkId) => {
    const item = evidence.find((candidate) => candidate.checkId === checkId)!;
    return {
      checkId,
      environment: item.environment,
      status: item.status,
      evidenceKind: item.evidenceKind,
      ...(item.participants === undefined
        ? {}
        : { participants: item.participants }),
    };
  });
}

/**
 * Evaluate the requested release target. BETA requires all eight checks in
 * STAGING; PRODUCTION requires the same eight checks in PRODUCTION. STAGING
 * only authorizes the staging deployment itself and keeps later checks visible.
 */
export async function evaluateStudioReadiness(
  input: StudioReadinessGateInput,
): Promise<StudioReadinessResult<StudioReadinessReport>> {
  if (!isTarget(input.target)) {
    return failure(
      diagnostic(
        "INVALID_CLAIM",
        "target",
        "Readiness target is unsupported.",
      ),
    );
  }
  if (!Array.isArray(input.evidence)) {
    return failure(
      diagnostic(
        "INVALID_CLAIM",
        "evidence",
        "Readiness evidence must be an array.",
      ),
    );
  }
  let candidate: Awaited<ReturnType<typeof verifyStudioReleaseCandidate>>;
  try {
    candidate = await verifyStudioReleaseCandidate(input.candidate);
  } catch {
    return failure(
      diagnostic(
        "HASH_MISMATCH",
        "candidate.manifest",
        "Studio Release Candidate verification failed.",
      ),
    );
  }
  if (!candidate.ok) {
    return failure(
      diagnostic(
        "HASH_MISMATCH",
        "candidate.manifest",
        "Studio Release Candidate verification failed.",
      ),
    );
  }
  const diagnostics: StudioReadinessDiagnostic[] = [];
  const byId = new Map<StudioReadinessCheckId, StudioReadinessEvidence>();
  for (const [index, item] of input.evidence.entries()) {
    const path = `evidence[${index}]`;
    if (!isRecord(item)) {
      diagnostics.push(
        diagnostic(
          "INVALID_CLAIM",
          path,
          "Readiness evidence must be an object.",
        ),
      );
      continue;
    }
    const checkId = item.checkId;
    const status = item.status;
    const environment = item.environment;
    const evidenceKind = item.evidenceKind;
    if (!isCheckId(checkId)) {
      diagnostics.push(
        diagnostic(
          "INVALID_CHECK_ID",
          `${path}.checkId`,
          "Readiness evidence contains an unknown check.",
        ),
      );
    }
    if (!isStatus(status)) {
      diagnostics.push(
        diagnostic(
          "INVALID_STATUS",
          `${path}.status`,
          "Readiness evidence contains an unknown status.",
        ),
      );
    }
    if (!isEnvironment(environment)) {
      diagnostics.push(
        diagnostic(
          "INVALID_ENVIRONMENT",
          `${path}.environment`,
          "Readiness evidence contains an unknown environment.",
        ),
      );
    }
    if (!isEvidenceKind(evidenceKind)) {
      diagnostics.push(
        diagnostic(
          "INVALID_EVIDENCE_KIND",
          `${path}.evidenceKind`,
          "Readiness evidence must declare whether it came from a live observation or an isolated fixture.",
        ),
      );
    }
    if (!isCheckId(checkId) || !isStatus(status)) continue;
    const evidence = item as unknown as StudioReadinessEvidence;
    if (item.schemaVersion !== STUDIO_READINESS_SCHEMA_VERSION) {
      diagnostics.push(
        diagnostic(
          "UNSUPPORTED_SCHEMA",
          `${path}.schemaVersion`,
          "Readiness evidence schema is unsupported.",
        ),
      );
    }
    if (byId.has(checkId)) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_CHECK",
          `${path}.checkId`,
          "Each readiness check must occur exactly once.",
        ),
      );
    }
    byId.set(checkId, evidence);
    if (item.packageHash !== input.candidate.manifest.packageHash) {
      diagnostics.push(
        diagnostic(
          "IDENTITY_MISMATCH",
          `${path}.packageHash`,
          "Evidence belongs to another Studio Package.",
        ),
      );
    }
    if (typeof item.evidenceHash !== "string" || !validHash(item.evidenceHash)) {
      diagnostics.push(
        diagnostic(
          "HASH_MISMATCH",
          `${path}.evidenceHash`,
          "Evidence hash is malformed.",
        ),
      );
    } else if (!(await validateEvidenceHash(evidence))) {
      diagnostics.push(
        diagnostic(
          "HASH_MISMATCH",
          `${path}.evidenceHash`,
          "Evidence hash does not match its canonical contents.",
        ),
      );
    }
    if (
      typeof item.sourceIdentity !== "string" ||
      !stable(item.sourceIdentity)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_SOURCE",
          `${path}.sourceIdentity`,
          "Evidence source identity must be stable.",
        ),
      );
    }
    if (
      typeof item.capturedAt !== "string" ||
      !Number.isFinite(Date.parse(item.capturedAt))
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_CAPTURE_TIME",
          `${path}.capturedAt`,
          "Evidence capture time is invalid.",
        ),
      );
    }
    const participants = item.participants;
    if (
      checkId === "COLLABORATION_2_TO_3" &&
      status === "PASS" &&
      (typeof participants !== "number" ||
        !Number.isSafeInteger(participants) || participants < 2 ||
        participants > 3)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_PARTICIPANT_COUNT",
          `${path}.participants`,
          "Collaboration evidence must cover two or three participants.",
        ),
      );
    }
    if (status === "PASS" && evidenceKind === "ISOLATED_FIXTURE") {
      diagnostics.push(
        diagnostic(
          "SYNTHETIC_EVIDENCE",
          `${path}.evidenceKind`,
          "An isolated fixture cannot be used as a staging or production readiness pass.",
        ),
      );
    }
    const expected = expectedEnvironment(input.target);
    if (
      expected !== undefined && environment !== expected &&
      (status === "PASS" || status === "FAIL" || status === "BLOCKED")
    ) {
      diagnostics.push(
        diagnostic(
          "ENVIRONMENT_MISMATCH",
          `${path}.environment`,
          `This check must be recorded in ${expected}.`,
        ),
      );
    }
  }
  for (const checkId of CHECK_IDS) {
    if (!byId.has(checkId)) {
      diagnostics.push(
        diagnostic(
          "MISSING_CHECK",
          `evidence.${checkId}`,
          "A required Beta/Production check is missing.",
        ),
      );
    }
  }
  if (diagnostics.length > 0) return failure(...diagnostics);

  const results = checkResults(input.evidence);
  const untested = results
    .filter((item) => item.status === "UNTESTED")
    .map((item) => item.checkId);
  const failed = results.some((item) => item.status === "FAIL");
  const blocked = results.some((item) => item.status === "BLOCKED");
  const stagingDeployment = results.find((item) =>
    item.checkId === "STAGING_DEPLOYMENT"
  )!;
  const allPass = results.every((item) => item.status === "PASS");
  let decision: StudioReadinessDecision = "NOT_READY";
  if (blocked) decision = "BLOCKED";
  else if (failed) decision = "NOT_READY";
  else if (input.target === "STAGING" && stagingDeployment.status === "PASS") {
    decision = "READY_FOR_STAGING";
  } else if (input.target === "BETA" && allPass) {
    decision = "READY_FOR_BETA";
  } else if (input.target === "PRODUCTION" && allPass) {
    decision = "READY_FOR_PRODUCTION";
  }
  const reportBase = {
    schemaVersion: STUDIO_READINESS_SCHEMA_VERSION,
    decision,
    target: input.target,
    packageId: input.candidate.manifest.packageId,
    packageVersion: input.candidate.manifest.packageVersion,
    projectRevisionId: input.candidate.manifest.projectRevisionId,
    packageHash: input.candidate.manifest.packageHash,
    checks: results,
    untested,
  };
  return success({
    ...reportBase,
    evidenceHash: await sha256(reportBase),
  });
}

export function canonicalStudioReadinessJson(value: unknown): string {
  return canonicalJson(value);
}
