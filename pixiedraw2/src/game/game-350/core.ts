/**
 * GAME-350 isolated completion gate.
 *
 * This is a value-only aggregator. It does not load evidence, run a build,
 * access a browser/device, or write to any host boundary. Callers provide
 * canonical, already-materialized evidence records and their claimed hash.
 */

import { asSha256, canonicalJson, sha256, type Sha256 } from "../game-300/core.ts";

export const GAME_COMPLETION_SCHEMA_VERSION = 1 as const;

export type EvidenceDomain = "PROJECT" | "INPUT" | "RUNTIME" | "BUILD" | "CROSS_TOOL";
export type EvidenceStatus =
  | "PASS"
  | "PASS_STATIC"
  | "PASS_STATIC_TARGETED"
  | "ISOLATED_REFERENCE_PASS"
  | "QUALIFIED_PASS"
  | "UNTESTED"
  | "PARTIAL"
  | "BLOCKED"
  | "UNKNOWN";
export type GateDecision = "READY" | "NOT_READY" | "BLOCKED";

export interface CanonicalGateIdentity {
  readonly projectId: string;
  readonly ownerId: string;
  readonly revisionId: string;
  readonly projectHash: Sha256;
}

export interface CompletionEvidenceRecord {
  readonly schemaVersion: typeof GAME_COMPLETION_SCHEMA_VERSION;
  readonly packageId: `GAME-${300 | 310 | 320 | 330 | 340}`;
  readonly domain: EvidenceDomain;
  readonly status: EvidenceStatus;
  readonly identity: CanonicalGateIdentity;
  readonly acceptanceIds: readonly string[];
  readonly sourceIdentity: string;
  readonly capturedAt: string;
  readonly untested: readonly string[];
  /** Hash of the record with evidenceHash omitted. Caller claims are checked. */
  readonly evidenceHash: Sha256;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface CompletionGateInput {
  readonly canonical: CanonicalGateIdentity;
  readonly evidence: readonly CompletionEvidenceRecord[];
}

export type GateDiagnosticCode =
  | "UNSUPPORTED_SCHEMA"
  | "MISSING_EVIDENCE"
  | "DUPLICATE_DOMAIN"
  | "UNEXPECTED_PACKAGE"
  | "DOMAIN_PACKAGE_MISMATCH"
  | "IDENTITY_MISMATCH"
  | "STALE_EVIDENCE"
  | "INVALID_CAPTURE_TIME"
  | "HASH_MISMATCH"
  | "CONTRADICTORY_EVIDENCE"
  | "MISSING_ACCEPTANCE"
  | "UNQUALIFIED_EVIDENCE";

export interface GateDiagnostic {
  readonly code: GateDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export interface DomainDecision {
  readonly domain: EvidenceDomain;
  readonly packageId: CompletionEvidenceRecord["packageId"];
  readonly status: EvidenceStatus;
  readonly qualified: boolean;
  readonly untested: readonly string[];
}

export interface CompletionGateReport {
  readonly schemaVersion: typeof GAME_COMPLETION_SCHEMA_VERSION;
  readonly decision: GateDecision;
  readonly identity: CanonicalGateIdentity;
  readonly evidenceHash: Sha256;
  readonly domains: readonly DomainDecision[];
  readonly diagnostics: readonly GateDiagnostic[];
  readonly untested: readonly string[];
}

export interface GateResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly diagnostics: readonly GateDiagnostic[];
}

const DOMAIN_PACKAGES: Readonly<Record<EvidenceDomain, CompletionEvidenceRecord["packageId"]>> = {
  PROJECT: "GAME-300",
  INPUT: "GAME-310",
  RUNTIME: "GAME-320",
  BUILD: "GAME-330",
  CROSS_TOOL: "GAME-340",
};
const DOMAINS: readonly EvidenceDomain[] = ["PROJECT", "INPUT", "RUNTIME", "BUILD", "CROSS_TOOL"];
const PASS_STATUSES = new Set<EvidenceStatus>(["PASS", "QUALIFIED_PASS"]);
const ACCEPTANCE_BY_PACKAGE: Readonly<Record<CompletionEvidenceRecord["packageId"], string>> = {
  "GAME-300": "GAME300-EVIDENCE-001",
  "GAME-310": "GAME310-EVIDENCE-001",
  "GAME-320": "GAME320-EVIDENCE-001",
  "GAME-330": "GAME330-EVIDENCE-001",
  "GAME-340": "GAME340-EVIDENCE-001",
};

function diagnostic(code: GateDiagnosticCode, path: string, message: string): GateDiagnostic {
  return { code, path, message };
}

function failure<T>(...diagnostics: GateDiagnostic[]): GateResult<T> {
  return { ok: false, diagnostics };
}

function success<T>(value: T): GateResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function stable(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function validHash(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function recordHashInput(record: Omit<CompletionEvidenceRecord, "evidenceHash">): unknown {
  return {
    schemaVersion: record.schemaVersion,
    packageId: record.packageId,
    domain: record.domain,
    status: record.status,
    identity: record.identity,
    acceptanceIds: [...record.acceptanceIds].sort(),
    sourceIdentity: record.sourceIdentity,
    capturedAt: record.capturedAt,
    untested: [...record.untested].sort(),
    payload: record.payload,
  };
}

/** Create a record without trusting a caller-supplied evidence hash. */
export async function createCompletionEvidenceRecord(
  record: Omit<CompletionEvidenceRecord, "evidenceHash">,
): Promise<CompletionEvidenceRecord> {
  return { ...record, evidenceHash: await sha256(recordHashInput(record)) };
}

async function validateRecordHash(record: CompletionEvidenceRecord): Promise<boolean> {
  return record.evidenceHash === await sha256(recordHashInput(record));
}

function identityDiagnostics(record: CompletionEvidenceRecord, canonical: CanonicalGateIdentity): GateDiagnostic[] {
  const result: GateDiagnostic[] = [];
  for (const key of ["projectId", "ownerId", "revisionId", "projectHash"] as const) {
    if (record.identity[key] !== canonical[key]) {
      result.push(diagnostic("IDENTITY_MISMATCH", `evidence.${record.domain}.identity.${key}`, `Evidence identity ${key} does not match the canonical project.`));
    }
  }
  return result;
}

function captureTimeValid(value: string): boolean {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}

/**
 * Aggregate all five predecessor contracts into a deterministic final gate.
 * Integrity failures are BLOCKED; incomplete qualification is NOT_READY.
 */
export async function evaluateCompletionGate(input: CompletionGateInput): Promise<GateResult<CompletionGateReport>> {
  const diagnostics: GateDiagnostic[] = [];
  const byDomain = new Map<EvidenceDomain, CompletionEvidenceRecord>();
  for (const [index, record] of input.evidence.entries()) {
    const path = `evidence[${index}]`;
    if (record.schemaVersion !== GAME_COMPLETION_SCHEMA_VERSION) diagnostics.push(diagnostic("UNSUPPORTED_SCHEMA", `${path}.schemaVersion`, "Evidence schema is unsupported."));
    if (DOMAIN_PACKAGES[record.domain] !== record.packageId) diagnostics.push(diagnostic("DOMAIN_PACKAGE_MISMATCH", `${path}.packageId`, "Evidence package does not own this canonical domain."));
    if (byDomain.has(record.domain)) diagnostics.push(diagnostic("DUPLICATE_DOMAIN", `${path}.domain`, "Each canonical evidence domain must occur exactly once."));
    byDomain.set(record.domain, record);
    diagnostics.push(...identityDiagnostics(record, input.canonical));
    if (!validHash(record.identity.projectHash)) diagnostics.push(diagnostic("HASH_MISMATCH", `${path}.identity.projectHash`, "Project hash is not a SHA-256 claim."));
    if (!stable(record.sourceIdentity)) diagnostics.push(diagnostic("STALE_EVIDENCE", `${path}.sourceIdentity`, "Source identity must be stable."));
    if (!captureTimeValid(record.capturedAt)) diagnostics.push(diagnostic("INVALID_CAPTURE_TIME", `${path}.capturedAt`, "Evidence capture time is invalid."));
    if (!record.acceptanceIds.includes(ACCEPTANCE_BY_PACKAGE[record.packageId])) diagnostics.push(diagnostic("MISSING_ACCEPTANCE", `${path}.acceptanceIds`, "Required evidence acceptance ID is missing."));
    if (!(await validateRecordHash(record))) diagnostics.push(diagnostic("HASH_MISMATCH", `${path}.evidenceHash`, "Evidence hash does not match its canonical contents."));
  }
  for (const domain of DOMAINS) if (!byDomain.has(domain)) diagnostics.push(diagnostic("MISSING_EVIDENCE", `evidence.${domain}`, "A required canonical evidence domain is missing."));
  for (const record of input.evidence) {
    if (record.status === "BLOCKED" || record.status === "UNKNOWN") diagnostics.push(diagnostic("CONTRADICTORY_EVIDENCE", `evidence.${record.domain}.status`, "Blocked or unknown predecessor evidence cannot qualify the gate."));
  }
  if (diagnostics.length) return failure(...diagnostics);

  const domains = DOMAINS.map((domain) => {
    const record = byDomain.get(domain)!;
    const qualified = record.status === "QUALIFIED_PASS" && record.untested.length === 0;
    return { domain, packageId: record.packageId, status: record.status, qualified, untested: [...record.untested].sort() };
  });
  const untested = [...new Set(domains.flatMap((item) => item.untested))].sort();
  const qualified = domains.every((item) => item.qualified);
  const reportBase = { schemaVersion: GAME_COMPLETION_SCHEMA_VERSION, identity: input.canonical, domains, diagnostics: [], untested };
  return success({ ...reportBase, decision: qualified ? "READY" : "NOT_READY", evidenceHash: await sha256(reportBase) });
}

export function canonicalCompletionJson(value: unknown): string {
  return canonicalJson(value);
}

export function asCompletionSha256(value: string): Sha256 {
  return asSha256(value);
}
