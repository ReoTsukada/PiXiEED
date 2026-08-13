/** Offline, sanitized npm-audit artifact boundary for FP-007. */

import {
  canonicalize,
  NPM_AUDIT_COMMAND_IDENTITY,
  NPM_AUDIT_SCOPE_IDS,
  type NpmAuditReceiptV1,
  type NpmAuditScopeId,
  sha256Hex,
  validateNpmAuditReceipt,
} from "./dependency-inventory.ts";
import { normalizeRepoRelativePath } from "./build-manifest.ts";

export const FP007_NPM_AUDIT_ARTIFACT_DOCUMENT =
  "PIXIEED-FP007-NPM-AUDIT-RECEIPTS-001" as const;
export const FP007_NPM_AUDIT_ARTIFACT_SCHEMA_VERSION = "1.0.0" as const;

export type NpmAuditExitClassification =
  | "ZERO_COUNTS"
  | "NONZERO_COUNTS"
  | "PROCESS_FAILURE"
  | "NETWORK_FAILURE"
  | "PARSE_FAILURE";

export type NpmAuditFailureCode =
  | "PROCESS_FAILED"
  | "NETWORK_FAILED"
  | "MALFORMED_JSON"
  | "UNSANITIZED_INPUT";

export interface NpmAuditExecutionMetadata {
  readonly commandIdentity: typeof NPM_AUDIT_COMMAND_IDENTITY;
  readonly exitClassification: NpmAuditExitClassification;
  readonly evidenceId: string;
}

export interface NpmAuditArtifactEntry {
  readonly scopeId: NpmAuditScopeId;
  readonly execution: NpmAuditExecutionMetadata;
  readonly receipt?: NpmAuditReceiptV1;
  readonly failureCode?: NpmAuditFailureCode;
}

export interface NpmAuditReceiptArtifactV1 {
  readonly documentId: typeof FP007_NPM_AUDIT_ARTIFACT_DOCUMENT;
  readonly schemaVersion: typeof FP007_NPM_AUDIT_ARTIFACT_SCHEMA_VERSION;
  readonly scopes: readonly NpmAuditArtifactEntry[];
  readonly artifactDigest: string;
}

export interface NpmAuditArtifactDiagnostic {
  readonly code: string;
  readonly detail: string;
}

export interface NpmAuditArtifactLoadResult {
  readonly artifact?: NpmAuditReceiptArtifactV1;
  readonly receipts: Readonly<Partial<Record<NpmAuditScopeId, unknown>>>;
  readonly diagnostics: readonly NpmAuditArtifactDiagnostic[];
  /** Artifact evidence never qualifies overall FP-007. */
  readonly overallStatus: "BLOCKED";
}

export interface NpmAuditRunnerInput {
  readonly scopeId: NpmAuditScopeId;
  readonly lockfilePath: string;
  readonly lockfileSha256: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly evidenceId: string;
  readonly executionFailure?: "NETWORK_FAILURE";
}

export type NpmAuditRunnerResult =
  | { readonly receipt: NpmAuditReceiptV1; readonly blocked: boolean }
  | { readonly failureCode: NpmAuditArtifactEntry["failureCode"] };

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SECRET_LIKE =
  /(?:bearer\s+[A-Za-z0-9._-]{12,}|(?:api[_-]?key|secret|password|token)\s*[:=]|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN)/iu;
const EXIT_CLASSIFICATIONS = new Set<NpmAuditExitClassification>([
  "ZERO_COUNTS",
  "NONZERO_COUNTS",
  "PROCESS_FAILURE",
  "NETWORK_FAILURE",
  "PARSE_FAILURE",
]);
const FAILURE_CODES = new Set<NpmAuditFailureCode>([
  "PROCESS_FAILED",
  "NETWORK_FAILED",
  "MALFORMED_JSON",
  "UNSANITIZED_INPUT",
]);
const FAILURE_CLASSIFICATION: Readonly<
  Record<NpmAuditFailureCode, NpmAuditExitClassification>
> = {
  PROCESS_FAILED: "PROCESS_FAILURE",
  NETWORK_FAILED: "NETWORK_FAILURE",
  MALFORMED_JSON: "PARSE_FAILURE",
  UNSANITIZED_INPUT: "PARSE_FAILURE",
};

function diagnostic(code: string, detail: string): NpmAuditArtifactDiagnostic {
  return { code, detail };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeArtifactPath(path: string): string | null {
  return normalizeRepoRelativePath(path);
}

function artifactBody(
  artifact: Omit<NpmAuditReceiptArtifactV1, "artifactDigest">,
): string {
  return JSON.stringify(canonicalize(artifact));
}

export async function createNpmAuditReceiptArtifact(
  entries: readonly NpmAuditArtifactEntry[],
): Promise<NpmAuditReceiptArtifactV1> {
  const diagnostics: NpmAuditArtifactDiagnostic[] = [];
  const seenScopes = new Set<NpmAuditScopeId>();
  const canonicalEntries = entries.map((entry, index) =>
    validateAndCanonicalizeEntry(
      entry,
      `scopes[${index}]`,
      diagnostics,
      seenScopes,
    )
  );
  if (
    diagnostics.length > 0 || canonicalEntries.some((entry) => entry === null)
  ) {
    throw new Error(
      `Invalid npm audit artifact entry: ${
        diagnostics.map((item) => item.code).join(",")
      }`,
    );
  }
  const sorted = canonicalEntries.filter((
    entry,
  ): entry is NpmAuditArtifactEntry => entry !== null).sort((a, b) =>
    a.scopeId < b.scopeId ? -1 : a.scopeId > b.scopeId ? 1 : 0
  );
  const body = {
    documentId: FP007_NPM_AUDIT_ARTIFACT_DOCUMENT,
    schemaVersion: FP007_NPM_AUDIT_ARTIFACT_SCHEMA_VERSION,
    scopes: sorted,
  } as const;
  return { ...body, artifactDigest: await sha256Hex(artifactBody(body)) };
}

export function serializeNpmAuditReceiptArtifact(
  artifact: NpmAuditReceiptArtifactV1,
): string {
  return JSON.stringify(canonicalize(artifact));
}

function validateExecution(
  value: unknown,
  path: string,
  diagnostics: NpmAuditArtifactDiagnostic[],
): value is NpmAuditExecutionMetadata {
  if (!object(value)) {
    diagnostics.push(
      diagnostic("EXECUTION_METADATA_INVALID", `${path} must be an object.`),
    );
    return false;
  }
  if (
    !hasOnlyKeys(value, [
      "commandIdentity",
      "exitClassification",
      "evidenceId",
    ])
  ) {
    diagnostics.push(
      diagnostic("RAW_FIELD_PRESENT", `${path} contains an unbounded field.`),
    );
  }
  if (value.commandIdentity !== NPM_AUDIT_COMMAND_IDENTITY) {
    diagnostics.push(
      diagnostic(
        "COMMAND_IDENTITY_INVALID",
        `${path}.commandIdentity is not approved.`,
      ),
    );
  }
  if (
    typeof value.exitClassification !== "string" ||
    !EXIT_CLASSIFICATIONS.has(
      value.exitClassification as NpmAuditExitClassification,
    )
  ) {
    diagnostics.push(
      diagnostic(
        "EXIT_CLASSIFICATION_INVALID",
        `${path}.exitClassification is invalid.`,
      ),
    );
  }
  if (typeof value.evidenceId !== "string" || !SAFE_ID.test(value.evidenceId)) {
    diagnostics.push(
      diagnostic("EVIDENCE_ID_INVALID", `${path}.evidenceId is invalid.`),
    );
  }
  return Object.keys(value).every((key) =>
    [
      "commandIdentity",
      "exitClassification",
      "evidenceId",
    ].includes(key)
  ) && value.commandIdentity === NPM_AUDIT_COMMAND_IDENTITY &&
    typeof value.exitClassification === "string" &&
    EXIT_CLASSIFICATIONS.has(
      value.exitClassification as NpmAuditExitClassification,
    ) &&
    typeof value.evidenceId === "string" && SAFE_ID.test(value.evidenceId);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function failureCode(value: unknown): value is NpmAuditFailureCode {
  return typeof value === "string" &&
    FAILURE_CODES.has(value as NpmAuditFailureCode);
}

function validateAndCanonicalizeEntry(
  value: unknown,
  path: string,
  diagnostics: NpmAuditArtifactDiagnostic[],
  seenScopes?: Set<NpmAuditScopeId>,
): NpmAuditArtifactEntry | null {
  if (!object(value)) {
    diagnostics.push(diagnostic("ENTRY_INVALID", `${path} must be an object.`));
    return null;
  }
  if (!hasOnlyKeys(value, ["scopeId", "execution", "receipt", "failureCode"])) {
    diagnostics.push(
      diagnostic("RAW_FIELD_PRESENT", `${path} contains an unbounded field.`),
    );
  }
  if (!NPM_AUDIT_SCOPE_IDS.includes(value.scopeId as NpmAuditScopeId)) {
    diagnostics.push(
      diagnostic("SCOPE_INVALID", `${path}.scopeId is invalid.`),
    );
    return null;
  }
  const scopeId = value.scopeId as NpmAuditScopeId;
  if (seenScopes?.has(scopeId)) {
    diagnostics.push(
      diagnostic("DUPLICATE_SCOPE", `${path}.scopeId is duplicated.`),
    );
  }
  seenScopes?.add(scopeId);
  const executionValid = validateExecution(
    value.execution,
    `${path}.execution`,
    diagnostics,
  );
  const execution = executionValid
    ? value.execution as NpmAuditExecutionMetadata
    : null;
  const hasReceipt = Object.prototype.hasOwnProperty.call(value, "receipt");
  const hasFailure = Object.prototype.hasOwnProperty.call(value, "failureCode");
  if (hasReceipt && value.receipt === undefined) {
    diagnostics.push(
      diagnostic(
        "RECEIPT_INVALID",
        `${path}.receipt must be omitted or an object.`,
      ),
    );
  }
  if (hasFailure && !failureCode(value.failureCode)) {
    diagnostics.push(
      diagnostic(
        "FAILURE_CODE_INVALID",
        `${path}.failureCode is not allowlisted.`,
      ),
    );
  }
  if (hasReceipt && hasFailure) {
    diagnostics.push(
      diagnostic(
        "PARTIAL_ENTRY",
        `${path} cannot contain both receipt and failureCode.`,
      ),
    );
  }
  if (!hasReceipt && !hasFailure) {
    diagnostics.push(
      diagnostic(
        "FAILURE_METADATA_MISSING",
        `${path} needs a receipt or failureCode.`,
      ),
    );
  }

  let receipt: NpmAuditReceiptV1 | undefined;
  if (hasReceipt && value.receipt !== undefined) {
    const rawReceipt = value.receipt;
    const expectedHash =
      object(rawReceipt) && typeof rawReceipt.lockfileSha256 === "string"
        ? rawReceipt.lockfileSha256
        : "";
    const checked = validateNpmAuditReceipt(rawReceipt, expectedHash);
    if (!checked.valid) {
      diagnostics.push(
        diagnostic("RECEIPT_INVALID", `${path}.receipt is invalid.`),
      );
    } else if (!object(rawReceipt) || rawReceipt.scopeId !== scopeId) {
      diagnostics.push(
        diagnostic(
          "RECEIPT_SCOPE_MISMATCH",
          `${path}.receipt scope does not match entry.`,
        ),
      );
    } else {
      receipt = canonicalize(rawReceipt) as NpmAuditReceiptV1;
    }
    const total = object(rawReceipt) && object(rawReceipt.summary)
      ? rawReceipt.summary.knownVulnerabilitiesTotal
      : undefined;
    if (
      execution !== null &&
      (total === 0
        ? execution.exitClassification !== "ZERO_COUNTS"
        : total !== undefined &&
          execution.exitClassification !== "NONZERO_COUNTS")
    ) {
      diagnostics.push(
        diagnostic(
          "EXIT_RECEIPT_MISMATCH",
          `${path} receipt count and exit classification disagree.`,
        ),
      );
    }
  }
  if (
    hasFailure && failureCode(value.failureCode) && execution !== null &&
    execution.exitClassification !== FAILURE_CLASSIFICATION[value.failureCode]
  ) {
    diagnostics.push(
      diagnostic(
        "FAILURE_EXIT_MISMATCH",
        `${path} failureCode and exitClassification disagree.`,
      ),
    );
  }
  if (
    !executionValid ||
    diagnostics.some((item) =>
      item.code === "RAW_FIELD_PRESENT" && item.detail.startsWith(path)
    )
  ) {
    return null;
  }
  if (receipt !== undefined) {
    return {
      scopeId,
      execution: canonicalize(value.execution) as NpmAuditExecutionMetadata,
      receipt,
    };
  }
  if (hasFailure && failureCode(value.failureCode)) {
    return {
      scopeId,
      execution: canonicalize(value.execution) as NpmAuditExecutionMetadata,
      failureCode: value.failureCode,
    };
  }
  return null;
}

function validateArtifact(
  value: unknown,
): {
  artifact?: NpmAuditReceiptArtifactV1;
  diagnostics: NpmAuditArtifactDiagnostic[];
} {
  const diagnostics: NpmAuditArtifactDiagnostic[] = [];
  if (!object(value)) {
    return {
      diagnostics: [
        diagnostic("ARTIFACT_INVALID", "Artifact must be an object."),
      ],
    };
  }
  const topKeys = new Set([
    "documentId",
    "schemaVersion",
    "scopes",
    "artifactDigest",
  ]);
  if (Object.keys(value).some((key) => !topKeys.has(key))) {
    diagnostics.push(
      diagnostic(
        "RAW_FIELD_PRESENT",
        "Artifact contains an unbounded top-level field.",
      ),
    );
  }
  if (
    value.documentId !== FP007_NPM_AUDIT_ARTIFACT_DOCUMENT ||
    value.schemaVersion !== FP007_NPM_AUDIT_ARTIFACT_SCHEMA_VERSION
  ) {
    diagnostics.push(
      diagnostic(
        "ARTIFACT_VERSION_INVALID",
        "Only sanitized npm audit artifact V1 is accepted.",
      ),
    );
  }
  if (!Array.isArray(value.scopes)) {
    diagnostics.push(
      diagnostic("SCOPES_INVALID", "Artifact scopes must be an array."),
    );
    return { diagnostics };
  }
  const seen = new Set<string>();
  const canonicalEntries: NpmAuditArtifactEntry[] = [];
  for (const [index, raw] of value.scopes.entries()) {
    const canonicalEntry = validateAndCanonicalizeEntry(
      raw,
      `scopes[${index}]`,
      diagnostics,
    );
    if (canonicalEntry === null) continue;
    const scopeId = canonicalEntry.scopeId;
    if (seen.has(scopeId)) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_SCOPE",
          `Scope ${scopeId} occurs more than once.`,
        ),
      );
    }
    seen.add(scopeId);
    canonicalEntries.push(canonicalEntry);
  }
  if (
    typeof value.artifactDigest !== "string" ||
    !SHA256.test(value.artifactDigest)
  ) {
    diagnostics.push(
      diagnostic("ARTIFACT_DIGEST_INVALID", "artifactDigest must be SHA-256."),
    );
  }
  const body = {
    documentId: value.documentId,
    schemaVersion: value.schemaVersion,
    scopes: value.scopes,
  };
  if (
    typeof value.artifactDigest === "string" && value.artifactDigest !== "" &&
    SHA256.test(value.artifactDigest)
  ) {
    // Digest comparison is done by the async loader to keep this validator pure.
  }
  if (diagnostics.length > 0) return { diagnostics };
  return {
    artifact: {
      documentId: value.documentId as typeof FP007_NPM_AUDIT_ARTIFACT_DOCUMENT,
      schemaVersion: value
        .schemaVersion as typeof FP007_NPM_AUDIT_ARTIFACT_SCHEMA_VERSION,
      scopes: canonicalEntries,
      artifactDigest: value.artifactDigest as string,
    },
    diagnostics,
  };
}

export async function loadNpmAuditReceiptArtifact(
  root: string,
  relativePath: string,
): Promise<NpmAuditArtifactLoadResult> {
  const diagnostics: NpmAuditArtifactDiagnostic[] = [];
  const safePath = safeArtifactPath(relativePath);
  if (safePath === null) {
    return {
      receipts: {},
      diagnostics: [
        diagnostic(
          "ARTIFACT_PATH_INVALID",
          "Artifact path must be repository-relative without traversal.",
        ),
      ],
      overallStatus: "BLOCKED",
    };
  }
  let text: string;
  try {
    const rootPath = await Deno.realPath(root);
    const targetPath = await Deno.realPath(`${rootPath}/${safePath}`);
    if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}/`)) {
      throw new Error("outside repository");
    }
    text = await Deno.readTextFile(targetPath);
  } catch {
    return {
      receipts: {},
      diagnostics: [
        diagnostic(
          "ARTIFACT_READ_FAILED",
          "Artifact could not be read from the repository.",
        ),
      ],
      overallStatus: "BLOCKED",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      receipts: {},
      diagnostics: [
        diagnostic("ARTIFACT_JSON_INVALID", "Artifact JSON is malformed."),
      ],
      overallStatus: "BLOCKED",
    };
  }
  const checked = validateArtifact(parsed);
  diagnostics.push(...checked.diagnostics);
  if (checked.artifact !== undefined) {
    const body = {
      documentId: checked.artifact.documentId,
      schemaVersion: checked.artifact.schemaVersion,
      scopes: checked.artifact.scopes,
    };
    if (
      checked.artifact.artifactDigest !== await sha256Hex(artifactBody(body))
    ) {
      diagnostics.push(
        diagnostic(
          "ARTIFACT_DIGEST_MISMATCH",
          "Artifact digest does not match canonical content.",
        ),
      );
    }
  }
  const receipts: Partial<Record<NpmAuditScopeId, unknown>> = {};
  for (const scopeId of NPM_AUDIT_SCOPE_IDS) receipts[scopeId] = null;
  if (checked.artifact !== undefined && diagnostics.length === 0) {
    for (const entry of checked.artifact.scopes) {
      receipts[entry.scopeId] = entry.receipt ?? null;
    }
    for (const scopeId of NPM_AUDIT_SCOPE_IDS) {
      if (!checked.artifact.scopes.some((entry) => entry.scopeId === scopeId)) {
        diagnostics.push(
          diagnostic(
            "SCOPE_MISSING",
            `Scope ${scopeId} is not provided and remains BLOCKED.`,
          ),
        );
      }
    }
  }
  return {
    ...(checked.artifact === undefined ? {} : { artifact: checked.artifact }),
    receipts,
    diagnostics,
    overallStatus: "BLOCKED",
  };
}

export async function writeNpmAuditReceiptArtifact(
  root: string,
  relativePath: string,
  artifact: NpmAuditReceiptArtifactV1,
): Promise<void> {
  const safePath = safeArtifactPath(relativePath);
  if (safePath === null) {
    throw new Error("Artifact path must be repository-relative.");
  }
  if (!object(artifact)) throw new Error("Artifact must be an object.");
  const rootPath = await Deno.realPath(root);
  const rootStat = await Deno.lstat(root);
  if (rootStat.isSymlink || !rootStat.isDirectory) {
    throw new Error("Artifact root must be a real directory.");
  }
  const parts = safePath.split("/");
  let currentPath = rootPath;
  for (const [index, part] of parts.entries()) {
    currentPath = `${currentPath}/${part}`;
    try {
      const stat = await Deno.lstat(currentPath);
      if (stat.isSymlink) {
        throw new Error(
          index === parts.length - 1
            ? "Artifact target must not be a symlink."
            : "Artifact parent must not be a symlink.",
        );
      }
      if (index < parts.length - 1 && !stat.isDirectory) {
        throw new Error("Artifact parent must be a directory.");
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound && index < parts.length - 1) {
        throw new Error("Artifact parent must already exist.");
      }
      throw error;
    }
  }
  const targetPath = `${rootPath}/${safePath}`;
  // lstat checks above intentionally fail closed; a concurrent replacement can
  // still race Deno.writeTextFile, so callers must use an exclusive safe root.
  await Deno.writeTextFile(
    targetPath,
    `${serializeNpmAuditReceiptArtifact(artifact)}\n`,
  );
}

function auditCounts(
  parsed: unknown,
): {
  total: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
} | null {
  if (
    !object(parsed) || !object(parsed.metadata) ||
    !object(parsed.metadata.vulnerabilities)
  ) return null;
  const v = parsed.metadata.vulnerabilities;
  const values = [v.total, v.low, v.moderate, v.high, v.critical];
  if (
    !values.every((item) =>
      typeof item === "number" && Number.isSafeInteger(item) && item >= 0
    )
  ) return null;
  return {
    total: v.total as number,
    low: v.low as number,
    moderate: v.moderate as number,
    high: v.high as number,
    critical: v.critical as number,
  };
}

/** Future process adapter: parses supplied stdout only; it never starts npm or uses network. */
export function parseNpmAuditJsonInMemory(
  input: NpmAuditRunnerInput,
): NpmAuditRunnerResult {
  if (
    !object(input) ||
    !hasOnlyKeys(input, [
      "scopeId",
      "lockfilePath",
      "lockfileSha256",
      "exitCode",
      "stdout",
      "evidenceId",
      "executionFailure",
    ])
  ) {
    return { failureCode: "UNSANITIZED_INPUT" };
  }
  if (input.executionFailure === "NETWORK_FAILURE") {
    return { failureCode: "NETWORK_FAILED" };
  }
  if (input.exitCode === null || input.exitCode < 0) {
    return { failureCode: "PROCESS_FAILED" };
  }
  if (SECRET_LIKE.test(input.stdout)) {
    return { failureCode: "UNSANITIZED_INPUT" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.stdout) as unknown;
  } catch {
    return { failureCode: "MALFORMED_JSON" };
  }
  const counts = auditCounts(parsed);
  if (counts === null) return { failureCode: "MALFORMED_JSON" };
  const receipt: NpmAuditReceiptV1 = {
    schemaVersion: "1",
    scopeId: input.scopeId,
    packageManager: "npm",
    lockfilePath: input.lockfilePath,
    lockfileSha256: input.lockfileSha256,
    commandIdentity: NPM_AUDIT_COMMAND_IDENTITY,
    summary: {
      knownVulnerabilitiesTotal: counts.total,
      severityCounts: {
        low: counts.low,
        moderate: counts.moderate,
        high: counts.high,
        critical: counts.critical,
      },
    },
    evidenceId: input.evidenceId,
  };
  const validation = validateNpmAuditReceipt(
    receipt,
    input.lockfileSha256,
    input.lockfilePath,
  );
  if (!validation.valid) return { failureCode: "MALFORMED_JSON" };
  if (input.exitCode === 0 && counts.total === 0) {
    return { receipt, blocked: false };
  }
  return { receipt, blocked: true };
}
