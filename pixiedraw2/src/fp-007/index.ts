/**
 * FP-007 cross-track integration boundary.
 *
 * This module composes the three isolated reference tracks without turning
 * any of them into a production authority.  It deliberately keeps
 * analyzer/fixture evidence separate from qualification of the current
 * repository.  A passing fixture therefore cannot hide floating dependencies,
 * a dirty worktree, or an unqualified browser build.
 */

import {
  type CanonicalBuildManifest,
  canonicalJson,
  isSha256,
  normalizeRepoRelativePath,
  sha256Hex,
} from "./build-manifest.ts";
import type { ArtifactManifest } from "./artifact-manifest.ts";
import type { CleanRoomAudit } from "./clean-room-policy.ts";
import type {
  AuditStatus,
  DependencyFinding,
  DependencyInventory,
  DependencyProjectInventory,
} from "./dependency-inventory.ts";
import {
  type SourceDistProvenanceChain,
  verifyProvenanceChain,
} from "./source-dist-provenance.ts";
import {
  schemaIdentity,
  type SchemaIdentityInput,
  SchemaRegistry,
  serializeSchemaRecord,
} from "./schema-registry.ts";
import type { RepeatQualification } from "./repeat-build-record.ts";
import {
  computeServerNonIntrusionReceiptDigest,
  type Fp007ServerNonIntrusionProof,
  isServerNonIntrusionReceipt,
  type ServerNonIntrusionReceipt,
  verifyServerNonIntrusionProof,
} from "./server-non-intrusion-authority.ts";

export const FP007_INTEGRATION_DOCUMENT =
  "PIXIEED-FP007-INTEGRATION-EVIDENCE-001" as const;
export const FP007_INTEGRATION_SCHEMA_VERSION = "1.0.0" as const;
export const FP007_CONTEXT_SHA256 =
  "1456bdd0593538d1f454f3f20c494ba9151914ced8bee1619f16ca7b5b1da200" as const;

export type Fp007AcceptanceId =
  | "FP007-SCHEMA-001"
  | "FP007-DEP-001"
  | "FP007-BUILD-001"
  | "FP007-DIST-001"
  | "FP007-PROVENANCE-001";

export type Fp007Status = AuditStatus;
export type Fp007EvidenceLevel =
  | "ISOLATED_REFERENCE"
  | "REAL_REPOSITORY"
  | "UNTESTED";

export type Fp007CommandQualification = "EXECUTED" | "NOT_EXECUTED";

export const FP007_CURRENT_SYSTEM_IMPACT_COMMAND =
  "fp007-current-system-impact-verifier-v1" as const;

export const FP007_CURRENT_SYSTEM_IMPACT_SCOPE = [
  "CURRENT_ROUTES",
  "CURRENT_PIXIEEDRAW",
  "PXD",
  "PIXISYNC",
  "MARKET",
] as const;

export type Fp007CurrentSystemImpactScope =
  typeof FP007_CURRENT_SYSTEM_IMPACT_SCOPE[number];
export type Fp007CurrentSystemImpactStatus =
  | "UNCHANGED"
  | "UNTESTED"
  | "BLOCKED"
  | "FAIL";

export type Fp007CurrentSystemImpactReceipt = ServerNonIntrusionReceipt;
export type { Fp007ServerNonIntrusionProof };

export interface Fp007CommandEvidence {
  readonly command: string;
  readonly scope: Fp007EvidenceLevel;
  readonly qualification: Fp007CommandQualification;
  readonly exitCode: number | null;
  readonly testCount: number | null;
  readonly resultDigest: string | null;
  readonly artifactDigest: string | null;
  readonly status: Fp007Status;
}

export interface Fp007QualificationEvidence {
  readonly status: Fp007Status;
  readonly evidenceLevel: Fp007EvidenceLevel;
  readonly reason: string;
  readonly commandIdentity: string | null;
}

export interface Fp007BaselineEvidence {
  readonly manifestPath: "docs/inventory/baseline-failure-identity-wp080.json";
  readonly verifierCommand:
    "node scripts/test-baseline-failure-identity-wp080.mjs";
  readonly fullSuiteManifestPath: "docs/inventory/baseline-suite-wp000.json";
  readonly fullSuiteVerifierCommand:
    "node scripts/test-baseline-suite-wp000.mjs";
  readonly expectedFailureCount: 14;
  readonly fullSuiteExpectedTotal: 77;
  readonly fullSuiteExpectedPassCount: 63;
  readonly fullSuiteExpectedFailureCount: 14;
  readonly identityFields: readonly ["test", "target", "signature"];
  readonly identityDigest: string;
  readonly identityCount: number;
  readonly signatureDigest: string;
  readonly priorEvidence:
    | "MATCHED_14_NOT_REEXECUTED"
    | "MATCHED_14_REEXECUTED";
  readonly verificationStatus: "UNTESTED" | "PASS";
  readonly newFailureIdentities: "UNTESTED" | "ZERO";
  readonly fullSuiteVerificationStatus: "UNTESTED" | "PASS";
  readonly fullSuiteNewFailureIdentities: "UNTESTED" | "ZERO";
}

export interface Fp007IntegrationDiagnostic {
  readonly code: string;
  readonly status: "FAIL" | "BLOCKED";
  readonly subject: string;
  readonly detail: string;
}

export interface Fp007AnalyzerEvidence {
  /** Result of analyzing the supplied target, not merely process exit status. */
  readonly status: Fp007Status;
  readonly execution: "PASS";
  readonly findingCount: number;
  readonly note: string;
}

export interface Fp007AcceptanceEvidence {
  readonly id: Fp007AcceptanceId;
  readonly analyzer: Fp007AnalyzerEvidence;
  readonly isolatedFixture: Fp007QualificationEvidence;
  readonly realRepoQualification: Fp007QualificationEvidence;
  readonly status: Fp007Status;
}

export interface Fp007RepeatBuildEvidence {
  readonly status: Fp007Status;
  readonly evidenceLevel: Fp007EvidenceLevel;
  readonly scope: RepeatQualification["scope"];
  readonly comparison: RepeatQualification["comparison"]["status"];
  readonly reason: string;
}

export interface Fp007DependencyDigests {
  readonly dependencyGraphHash: string;
  readonly lockfileHash: string;
  readonly toolchainHash: string;
}

export interface Fp007FindingSummary {
  readonly total: number;
  readonly byStatus: Readonly<Record<Fp007Status, number>>;
  readonly byCode: Readonly<Record<string, number>>;
  readonly identityHash: string;
  readonly releaseBlocking: readonly {
    readonly code: string;
    readonly status: "FAIL" | "BLOCKED";
    readonly subject: string;
  }[];
}

export interface Fp007IntegrationEvidence {
  readonly documentId: typeof FP007_INTEGRATION_DOCUMENT;
  readonly schemaVersion: typeof FP007_INTEGRATION_SCHEMA_VERSION;
  readonly package: "FP-007";
  readonly contextSha256: typeof FP007_CONTEXT_SHA256;
  readonly evidenceScope: "CROSS_TRACK_COORDINATOR_INTEGRATION";
  readonly status: "PASS" | "BLOCKED" | "FAIL" | "UNTESTED";
  readonly acceptances: readonly Fp007AcceptanceEvidence[];
  readonly chain: {
    readonly schemaRegistryDigest: string;
    readonly dependencyGraphHash: string;
    readonly lockfileHash: string;
    readonly toolchainHash: string;
    readonly allowlistedEnvironmentHash: string;
    readonly buildManifestHash: string;
    readonly artifactManifestHash: string;
    readonly mappingRootHash: string;
    readonly provenanceHash: string;
  };
  readonly commands: readonly Fp007CommandEvidence[];
  readonly totalTestCount: number;
  readonly sources: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly artifacts: readonly {
    readonly path: string;
    readonly role: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly compression: string;
  }[];
  readonly repeatBuild: Fp007RepeatBuildEvidence;
  readonly findings: Fp007FindingSummary;
  readonly baseline: Fp007BaselineEvidence;
  readonly reviewStatus: "PENDING_INDEPENDENT_REVIEW";
  readonly currentSystemImpact: {
    readonly currentRoutes: Fp007CurrentSystemImpactStatus;
    readonly currentPixiEEDraw: Fp007CurrentSystemImpactStatus;
    readonly pxd: Fp007CurrentSystemImpactStatus;
    readonly pixiSync: Fp007CurrentSystemImpactStatus;
    readonly market: Fp007CurrentSystemImpactStatus;
    readonly productionData: "NOT_ACCESSED";
    readonly productionAction: "NONE";
  };
  readonly independentReviewQuestions: readonly string[];
}

export type Fp007IntegrationResult<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly Fp007IntegrationDiagnostic[];
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly Fp007IntegrationDiagnostic[];
  };

export interface Fp007IntegrationInput {
  readonly contextSha256: string;
  readonly schemaRegistry: SchemaRegistry;
  readonly callerSchema: unknown;
  readonly expectedSchemaIdentity: SchemaIdentityInput;
  readonly dependencyInventory: DependencyInventory;
  readonly cleanRoom: CleanRoomAudit;
  readonly buildManifest: CanonicalBuildManifest;
  readonly buildManifestHash: string;
  readonly artifactManifest: ArtifactManifest;
  readonly artifactManifestHash: string;
  readonly provenance: SourceDistProvenanceChain;
  readonly repeatBuild: RepeatQualification;
  readonly isolatedFixtureStatuses: Readonly<
    Record<Fp007AcceptanceId, Fp007QualificationEvidence>
  >;
  readonly realRepoQualification: Readonly<
    Record<Fp007AcceptanceId, Fp007QualificationEvidence>
  >;
  readonly commands: readonly Fp007CommandEvidence[];
  readonly baseline: Fp007BaselineEvidence;
  readonly currentSystemImpactReceipt?: Fp007CurrentSystemImpactReceipt;
  readonly currentSystemImpactProof?: Fp007ServerNonIntrusionProof;
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function diagnostic(
  code: string,
  status: "FAIL" | "BLOCKED",
  subject: string,
  detail: string,
): Fp007IntegrationDiagnostic {
  return { code, status, subject, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function statusPriority(status: Fp007Status): number {
  if (status === "FAIL") return 5;
  if (status === "BLOCKED") return 4;
  if (status === "UNKNOWN") return 3;
  if (status === "UNTESTED") return 2;
  return 1;
}

function worstStatus(statuses: readonly Fp007Status[]): Fp007Status {
  return [...statuses].sort((left, right) =>
    statusPriority(right) - statusPriority(left)
  )[0] ?? "UNTESTED";
}

function finalAcceptanceStatus(
  analyzer: Fp007Status,
  isolated: Fp007Status,
  realRepo: Fp007Status,
): Fp007Status {
  return worstStatus([analyzer, isolated, realRepo]);
}

function hasUnsafeEvidenceText(value: string): boolean {
  return /(?:\/Users\/|\/home\/|\/private\/|[A-Za-z]:[\\/]|eyJ[A-Za-z0-9_-]{8,}\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|-----BEGIN [A-Z0-9 ]+-----|(?:authorization|password|secret|token)\s*[:=])/iu
    .test(value);
}

function validateSafeText(
  value: string,
  subject: string,
  diagnostics: Fp007IntegrationDiagnostic[],
): void {
  if (hasUnsafeEvidenceText(value)) {
    diagnostics.push(diagnostic(
      "UNSAFE_EVIDENCE_TEXT",
      "FAIL",
      subject,
      "Evidence text contains an absolute path, secret-shaped value, JWT, or personal address.",
    ));
  }
}

function validateQualification(
  value: Fp007QualificationEvidence | undefined,
  subject: string,
  diagnostics: Fp007IntegrationDiagnostic[],
  allowIsolatedReference: boolean,
  requireCommandIdentity = true,
): Fp007QualificationEvidence {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        "QUALIFICATION_MISSING",
        "BLOCKED",
        subject,
        "Qualification status must be explicitly supplied.",
      ),
    );
    return {
      status: "UNTESTED",
      evidenceLevel: "UNTESTED",
      reason: "Qualification evidence was not supplied.",
      commandIdentity: null,
    };
  }
  const status = value.status;
  const evidenceLevel = value.evidenceLevel;
  const reason = value.reason;
  const commandIdentity = value.commandIdentity;
  if (
    !(["PASS", "FAIL", "BLOCKED", "UNKNOWN", "UNTESTED"] as readonly unknown[])
      .includes(status)
  ) {
    diagnostics.push(
      diagnostic(
        "QUALIFICATION_STATUS_INVALID",
        "FAIL",
        subject,
        "Qualification status is not recognized.",
      ),
    );
  }
  if (
    !([
      "ISOLATED_REFERENCE",
      "REAL_REPOSITORY",
      "UNTESTED",
    ] as readonly unknown[]).includes(evidenceLevel)
  ) {
    diagnostics.push(
      diagnostic(
        "QUALIFICATION_LEVEL_INVALID",
        "FAIL",
        subject,
        "Qualification evidence level is not recognized.",
      ),
    );
  }
  if (
    requireCommandIdentity && status === "PASS" &&
    (evidenceLevel === "UNTESTED" ||
      (!allowIsolatedReference && evidenceLevel !== "REAL_REPOSITORY"))
  ) {
    diagnostics.push(diagnostic(
      "QUALIFICATION_OVERCLAIM",
      "FAIL",
      subject,
      allowIsolatedReference
        ? "PASS requires explicit isolated-reference or real-repository evidence."
        : "PASS requires explicit real-repository evidence.",
    ));
  }
  if (
    requireCommandIdentity && status === "PASS" &&
    (typeof commandIdentity !== "string" || commandIdentity.trim().length === 0)
  ) {
    diagnostics.push(diagnostic(
      "QUALIFICATION_COMMAND_MISSING",
      "FAIL",
      subject,
      "PASS qualification requires an executed command identity.",
    ));
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    diagnostics.push(
      diagnostic(
        "QUALIFICATION_REASON_MISSING",
        "BLOCKED",
        subject,
        "Qualification evidence needs a safe reason.",
      ),
    );
  } else {
    validateSafeText(reason, `${subject}.reason`, diagnostics);
  }
  return {
    status:
      (["PASS", "FAIL", "BLOCKED", "UNKNOWN", "UNTESTED"] as readonly unknown[])
          .includes(status)
        ? status as Fp007Status
        : "UNTESTED",
    evidenceLevel: evidenceLevel === "ISOLATED_REFERENCE" ||
        evidenceLevel === "REAL_REPOSITORY"
      ? evidenceLevel
      : "UNTESTED",
    reason: typeof reason === "string"
      ? reason.trim()
      : "Qualification evidence was invalid.",
    commandIdentity: typeof commandIdentity === "string" &&
        commandIdentity.trim().length > 0
      ? commandIdentity.trim()
      : null,
  };
}

function validateQualificationCommandBinding(
  qualification: Fp007QualificationEvidence,
  subject: string,
  commands: readonly Fp007CommandEvidence[],
  diagnostics: Fp007IntegrationDiagnostic[],
): void {
  if (qualification.status !== "PASS") return;
  const command = qualification.commandIdentity === null
    ? undefined
    : commands.find((item) => item.command === qualification.commandIdentity);
  if (
    command === undefined || command.status !== "PASS" ||
    command.qualification !== "EXECUTED" || command.exitCode !== 0 ||
    command.scope !== qualification.evidenceLevel
  ) {
    diagnostics.push(diagnostic(
      "QUALIFICATION_COMMAND_MISMATCH",
      "FAIL",
      subject,
      "PASS qualification is not bound to a matching executed command evidence record.",
    ));
  }
}

function canonicalProjectPayload(
  project: DependencyProjectInventory,
): Record<string, unknown> {
  return {
    projectPath: project.projectPath,
    manifestPath: project.manifestPath,
    lockfilePath: project.lockfilePath,
    lockfilePresent: project.lockfilePresent,
    lockfileHash: project.lockfileHash,
    manifestDependencies: [...project.manifestDependencies].sort((
      left,
      right,
    ) =>
      compareStable(
        `${left.group}:${left.name}`,
        `${right.group}:${right.name}`,
      )
    ),
    resolvedDependencies: [...project.resolvedDependencies].sort((
      left,
      right,
    ) =>
      compareStable(
        `${left.scope}:${left.name}:${left.version}`,
        `${right.scope}:${right.name}:${right.version}`,
      )
    ),
    toolchain: Object.fromEntries(
      Object.entries(project.toolchain).sort(([left], [right]) =>
        compareStable(left, right)
      ),
    ),
  };
}

export async function computeSchemaRegistryDigest(
  registry: SchemaRegistry,
): Promise<string> {
  const records = registry.list().map(serializeSchemaRecord);
  return sha256Hex(canonicalJson({
    documentId: "PIXIEED-FP007-SCHEMA-REGISTRY-DIGEST-001",
    schemaContractVersion: 1,
    records,
  }));
}

export async function computeDependencyDigests(
  inventory: DependencyInventory,
): Promise<Fp007DependencyDigests> {
  const projects = [...inventory.projects]
    .sort((left, right) => compareStable(left.manifestPath, right.manifestPath))
    .map(canonicalProjectPayload);
  const graphPayload = {
    documentId: inventory.documentId,
    schemaVersion: inventory.schemaVersion,
    repository: inventory.repository,
    mode: inventory.mode,
    projects,
  };
  const lockPayload = {
    documentId: "PIXIEED-FP007-LOCKFILE-DIGEST-001",
    projects: projects.map((project) => ({
      projectPath: project.projectPath,
      lockfilePath: project.lockfilePath,
      lockfilePresent: project.lockfilePresent,
      lockfileHash: project.lockfileHash,
    })),
  };
  const toolchainPayload = {
    documentId: "PIXIEED-FP007-TOOLCHAIN-DIGEST-001",
    projects: projects.map((project) => ({
      projectPath: project.projectPath,
      toolchain: project.toolchain,
    })),
  };
  return {
    dependencyGraphHash: await sha256Hex(canonicalJson(graphPayload)),
    lockfileHash: await sha256Hex(canonicalJson(lockPayload)),
    toolchainHash: await sha256Hex(canonicalJson(toolchainPayload)),
  };
}

function findingsForSummary(
  dependency: readonly DependencyFinding[],
  cleanRoom: CleanRoomAudit,
  diagnostics: readonly Fp007IntegrationDiagnostic[],
): readonly {
  readonly code: string;
  readonly status: Fp007Status;
  readonly subject: string;
}[] {
  return [
    ...dependency.map((item) => ({
      code: item.code,
      status: item.status,
      subject: item.subject,
    })),
    ...cleanRoom.findings.map((item) => ({
      code: item.code,
      status: item.status,
      subject: item.subject,
    })),
    ...diagnostics.map((item) => ({
      code: item.code,
      status: item.status,
      subject: item.subject,
    })),
  ].sort((left, right) =>
    compareStable(
      `${left.code}:${left.status}:${left.subject}`,
      `${right.code}:${right.status}:${right.subject}`,
    )
  );
}

async function summarizeFindings(
  dependency: readonly DependencyFinding[],
  cleanRoom: CleanRoomAudit,
  diagnostics: readonly Fp007IntegrationDiagnostic[],
): Promise<Fp007FindingSummary> {
  const identities = findingsForSummary(dependency, cleanRoom, diagnostics);
  const byStatus: Record<Fp007Status, number> = {
    PASS: 0,
    FAIL: 0,
    BLOCKED: 0,
    UNKNOWN: 0,
    UNTESTED: 0,
  };
  const byCode: Record<string, number> = {};
  for (const item of identities) {
    byStatus[item.status] += 1;
    byCode[item.code] = (byCode[item.code] ?? 0) + 1;
  }
  const releaseBlocking = identities
    .filter((
      item,
    ): item is typeof item & { readonly status: "FAIL" | "BLOCKED" } =>
      item.status === "FAIL" || item.status === "BLOCKED"
    )
    .map((item) => ({
      code: item.code,
      status: item.status,
      subject: item.subject,
    }));
  return {
    total: identities.length,
    byStatus: Object.fromEntries(
      Object.entries(byStatus).sort(([left], [right]) =>
        compareStable(left, right)
      ),
    ) as Readonly<Record<Fp007Status, number>>,
    byCode: Object.fromEntries(
      Object.entries(byCode).sort(([left], [right]) =>
        compareStable(left, right)
      ),
    ),
    identityHash: await sha256Hex(canonicalJson(identities)),
    releaseBlocking,
  };
}

function validateCommandEvidence(
  commands: readonly Fp007CommandEvidence[],
  diagnostics: Fp007IntegrationDiagnostic[],
): readonly Fp007CommandEvidence[] {
  const normalized = [...commands].map((item, index) => {
    if (
      !(item.status === "PASS" || item.status === "FAIL" ||
        item.status === "BLOCKED" || item.status === "UNKNOWN" ||
        item.status === "UNTESTED")
    ) {
      diagnostics.push(diagnostic(
        "COMMAND_STATUS_INVALID",
        "FAIL",
        `commands[${index}].status`,
        "Command status is not recognized.",
      ));
    }
    if (typeof item.command !== "string" || item.command.trim().length === 0) {
      diagnostics.push(
        diagnostic(
          "COMMAND_INVALID",
          "FAIL",
          `commands[${index}]`,
          "Command identity is required.",
        ),
      );
    } else {validateSafeText(
        item.command,
        `commands[${index}].command`,
        diagnostics,
      );}
    if (
      !("ISOLATED_REFERENCE" === item.scope ||
        "REAL_REPOSITORY" === item.scope || "UNTESTED" === item.scope)
    ) {
      diagnostics.push(diagnostic(
        "COMMAND_SCOPE_INVALID",
        "FAIL",
        `commands[${index}].scope`,
        "Command scope must be isolated, real-repository, or untested.",
      ));
    }
    if (
      !(item.qualification === "EXECUTED" ||
        item.qualification === "NOT_EXECUTED")
    ) {
      diagnostics.push(diagnostic(
        "COMMAND_QUALIFICATION_INVALID",
        "FAIL",
        `commands[${index}].qualification`,
        "Command qualification must state whether execution occurred.",
      ));
    }
    if (
      item.exitCode !== null &&
      (!Number.isSafeInteger(item.exitCode) || item.exitCode < 0)
    ) {
      diagnostics.push(
        diagnostic(
          "COMMAND_EXIT_INVALID",
          "FAIL",
          `commands[${index}].exitCode`,
          "Exit code must be a non-negative integer or null for untested evidence.",
        ),
      );
    }
    if (
      item.testCount !== null &&
      (!Number.isSafeInteger(item.testCount) || item.testCount < 0)
    ) {
      diagnostics.push(
        diagnostic(
          "COMMAND_TEST_COUNT_INVALID",
          "FAIL",
          `commands[${index}].testCount`,
          "Test count must be a non-negative integer or null.",
        ),
      );
    }
    if (item.resultDigest !== null && !isSha256(item.resultDigest)) {
      diagnostics.push(diagnostic(
        "COMMAND_RESULT_DIGEST_INVALID",
        "FAIL",
        `commands[${index}].resultDigest`,
        "Command result evidence must be a SHA-256 digest or null when not executed.",
      ));
    }
    if (item.artifactDigest !== null && !isSha256(item.artifactDigest)) {
      diagnostics.push(diagnostic(
        "COMMAND_ARTIFACT_DIGEST_INVALID",
        "FAIL",
        `commands[${index}].artifactDigest`,
        "Command artifact evidence must be a SHA-256 digest or null when not executed.",
      ));
    }
    const executed = item.qualification === "EXECUTED";
    const passEvidence = item.status === "PASS" &&
      item.scope !== "UNTESTED" && executed && item.exitCode === 0 &&
      item.testCount !== null && isSha256(item.resultDigest) &&
      isSha256(item.artifactDigest);
    if (item.status === "PASS" && !passEvidence) {
      diagnostics.push(diagnostic(
        "COMMAND_EVIDENCE_INCONSISTENT",
        "FAIL",
        `commands[${index}]`,
        "PASS requires executed scoped evidence, exitCode 0, test count, result digest, and artifact digest.",
      ));
    }
    if (
      item.status === "FAIL" &&
      (!executed || item.scope === "UNTESTED" || item.exitCode === null ||
        item.exitCode === 0)
    ) {
      diagnostics.push(diagnostic(
        "COMMAND_EVIDENCE_INCONSISTENT",
        "FAIL",
        `commands[${index}]`,
        "FAIL command evidence must describe an executed scoped command with a non-zero exit code.",
      ));
    }
    if (
      (item.status === "BLOCKED" || item.status === "UNKNOWN" ||
        item.status === "UNTESTED") &&
      (item.scope !== "UNTESTED" || item.qualification !== "NOT_EXECUTED" ||
        item.exitCode !== null || item.testCount !== null ||
        item.resultDigest !== null || item.artifactDigest !== null)
    ) {
      diagnostics.push(diagnostic(
        "COMMAND_EVIDENCE_INCONSISTENT",
        "FAIL",
        `commands[${index}]`,
        "Non-executed command evidence must be explicitly untested with null execution claims.",
      ));
    }
    return {
      command: typeof item.command === "string" ? item.command.trim() : "",
      scope: item.scope,
      qualification: item.qualification,
      exitCode: item.exitCode,
      testCount: item.testCount,
      resultDigest: item.resultDigest,
      artifactDigest: item.artifactDigest,
      status: item.status,
    };
  });
  return normalized.sort((left, right) =>
    compareStable(left.command, right.command)
  );
}

function validateBaselineEvidence(
  baseline: Fp007BaselineEvidence,
  diagnostics: Fp007IntegrationDiagnostic[],
): void {
  if (
    baseline.expectedFailureCount !== 14 || baseline.identityCount !== 14 ||
    baseline.fullSuiteExpectedTotal !== 77 ||
    baseline.fullSuiteExpectedPassCount !== 63 ||
    baseline.fullSuiteExpectedFailureCount !== 14 ||
    baseline.identityFields.join(",") !== "test,target,signature" ||
    !isSha256(baseline.identityDigest) || !isSha256(baseline.signatureDigest) ||
    baseline.verificationStatus === "PASS" &&
      (baseline.newFailureIdentities !== "ZERO" ||
        baseline.priorEvidence !== "MATCHED_14_REEXECUTED") ||
    baseline.fullSuiteVerificationStatus === "PASS" &&
      baseline.fullSuiteNewFailureIdentities !== "ZERO"
  ) {
    diagnostics.push(diagnostic(
      "BASELINE_EVIDENCE_INCOMPLETE",
      "FAIL",
      "baseline",
      "Baseline evidence must retain the 14-identity count and both identity/signature digests.",
    ));
  }
}

function validateArtifactSafety(
  artifacts: ArtifactManifest,
  diagnostics: Fp007IntegrationDiagnostic[],
): void {
  for (const [index, artifact] of artifacts.artifacts.entries()) {
    if (normalizeRepoRelativePath(artifact.path) === null) {
      diagnostics.push(
        diagnostic(
          "ARTIFACT_PATH_INVALID",
          "FAIL",
          `artifacts[${index}].path`,
          "Artifact path is not repository-relative.",
        ),
      );
    }
    if (!isSha256(artifact.sha256)) {
      diagnostics.push(
        diagnostic(
          "ARTIFACT_HASH_INVALID",
          "FAIL",
          `artifacts[${index}].sha256`,
          "Artifact hash is not a lowercase SHA-256 value.",
        ),
      );
    }
  }
}

function qualificationFor(
  map: Readonly<Record<Fp007AcceptanceId, Fp007QualificationEvidence>>,
  id: Fp007AcceptanceId,
  diagnostics: Fp007IntegrationDiagnostic[],
  label: string,
  allowIsolatedReference: boolean,
): Fp007QualificationEvidence {
  return validateQualification(
    map[id],
    `${label}.${id}`,
    diagnostics,
    allowIsolatedReference,
  );
}

function validateRepeatBuild(
  value: RepeatQualification,
  diagnostics: Fp007IntegrationDiagnostic[],
): Fp007RepeatBuildEvidence {
  const qualification = validateQualification(
    {
      status: value.status,
      evidenceLevel: value.evidenceLevel,
      reason: value.reason,
      commandIdentity: null,
    },
    "repeatBuild",
    diagnostics,
    true,
    false,
  );
  const scopes: readonly RepeatQualification["scope"][] = [
    "ISOLATED_FIXTURE",
    "REAL_CLEAN_CHECKOUT",
    "REAL_DIRTY_WORKTREE",
    "UNKNOWN",
  ];
  if (!scopes.includes(value.scope)) {
    diagnostics.push(
      diagnostic(
        "REPEAT_BUILD_SCOPE_INVALID",
        "FAIL",
        "repeatBuild.scope",
        "Repeat-build scope is not recognized.",
      ),
    );
  }
  if (value.status === "PASS" && value.comparison.status !== "PASS") {
    diagnostics.push(
      diagnostic(
        "REPEAT_BUILD_INVALID",
        "FAIL",
        "repeatBuild.comparison",
        "A PASS repeat-build qualification must have a PASS comparison.",
      ),
    );
  }
  return {
    status: qualification.status,
    evidenceLevel: qualification.evidenceLevel,
    scope: scopes.includes(value.scope) ? value.scope : "UNKNOWN",
    comparison: value.comparison.status,
    reason: qualification.reason,
  };
}

export async function computeCurrentSystemImpactReceiptDigest(
  receipt: Fp007CurrentSystemImpactReceipt,
): Promise<string> {
  // Diagnostic digest only. This public helper never grants UNCHANGED.
  return computeServerNonIntrusionReceiptDigest(receipt);
}

function untestedCurrentSystemImpact(): Fp007IntegrationEvidence[
  "currentSystemImpact"
] {
  return {
    currentRoutes: "UNTESTED",
    currentPixiEEDraw: "UNTESTED",
    pxd: "UNTESTED",
    pixiSync: "UNTESTED",
    market: "UNTESTED",
    productionData: "NOT_ACCESSED",
    productionAction: "NONE",
  };
}

async function deriveCurrentSystemImpact(
  receipt: Fp007CurrentSystemImpactReceipt | undefined,
  proof: Fp007ServerNonIntrusionProof | undefined,
  diagnostics: Fp007IntegrationDiagnostic[],
): Promise<Fp007IntegrationEvidence["currentSystemImpact"]> {
  if (receipt === undefined) return untestedCurrentSystemImpact();

  if (
    !isServerNonIntrusionReceipt(receipt) ||
    receipt.resultDigest !== await computeCurrentSystemImpactReceiptDigest(
        receipt,
      )
  ) {
    diagnostics.push(diagnostic(
      "CURRENT_SYSTEM_IMPACT_RECEIPT_INVALID",
      "BLOCKED",
      "currentSystemImpactReceipt",
      "The receipt is not an eligible server-composed clean execution record.",
    ));
  }

  if (proof === undefined) {
    diagnostics.push(diagnostic(
      "CURRENT_SYSTEM_IMPACT_PROOF_REQUIRED",
      "BLOCKED",
      "currentSystemImpactProof",
      "A server-only opaque proof is required; a public receipt digest is not authority.",
    ));
  }

  if (
    proof === undefined ||
    !(await verifyServerNonIntrusionProof(proof, receipt))
  ) {
    diagnostics.push(diagnostic(
      "CURRENT_SYSTEM_IMPACT_PROOF_INVALID",
      "BLOCKED",
      "currentSystemImpactProof",
      "Only a module-private server composition proof bound to an eligible clean receipt may produce UNCHANGED.",
    ));
    return untestedCurrentSystemImpact();
  }

  return {
    currentRoutes: "UNCHANGED",
    currentPixiEEDraw: "UNCHANGED",
    pxd: "UNCHANGED",
    pixiSync: "UNCHANGED",
    market: "UNCHANGED",
    productionData: "NOT_ACCESSED",
    productionAction: "NONE",
  };
}

export async function createFp007IntegrationEvidence(
  input: Fp007IntegrationInput,
): Promise<Fp007IntegrationResult<Fp007IntegrationEvidence>> {
  const diagnostics: Fp007IntegrationDiagnostic[] = [];
  if (input.contextSha256 !== FP007_CONTEXT_SHA256) {
    diagnostics.push(
      diagnostic(
        "CONTEXT_SHA_MISMATCH",
        "BLOCKED",
        "contextSha256",
        "The supplied Context is not the registered FP-007 Context.",
      ),
    );
  }
  if (!isSha256(input.contextSha256)) {
    diagnostics.push(
      diagnostic(
        "CONTEXT_SHA_INVALID",
        "FAIL",
        "contextSha256",
        "Context SHA-256 is invalid.",
      ),
    );
  }
  const callerSchema = input.schemaRegistry.resolveCallerSchema(
    input.callerSchema,
    input.expectedSchemaIdentity,
  );
  if (!callerSchema.ok) {
    diagnostics.push(
      ...callerSchema.diagnostics.map((item) =>
        diagnostic(item.code, "FAIL", item.path ?? "schema", item.message)
      ),
    );
  }
  const schemaRegistryDigest = await computeSchemaRegistryDigest(
    input.schemaRegistry,
  );
  const dependencyDigests = await computeDependencyDigests(
    input.dependencyInventory,
  );
  const expectedBuildManifestHash = await sha256Hex(
    canonicalJson(input.buildManifest),
  );
  if (
    !isSha256(input.buildManifestHash) ||
    input.buildManifestHash !== expectedBuildManifestHash
  ) {
    diagnostics.push(
      diagnostic(
        "BUILD_MANIFEST_HASH_MISMATCH",
        "FAIL",
        "buildManifestHash",
        "Build manifest hash does not match its canonical body.",
      ),
    );
  }
  const expectedArtifactManifestHash = await sha256Hex(
    canonicalJson(input.artifactManifest),
  );
  if (
    !isSha256(input.artifactManifestHash) ||
    input.artifactManifestHash !== expectedArtifactManifestHash
  ) {
    diagnostics.push(
      diagnostic(
        "ARTIFACT_MANIFEST_HASH_MISMATCH",
        "FAIL",
        "artifactManifestHash",
        "Artifact manifest hash does not match its canonical body.",
      ),
    );
  }
  if (
    input.buildManifest.deterministicInputs.schemaRegistryDigest !==
      schemaRegistryDigest
  ) {
    diagnostics.push(
      diagnostic(
        "SCHEMA_REGISTRY_DIGEST_MISMATCH",
        "FAIL",
        "buildManifest.deterministicInputs.schemaRegistryDigest",
        "Build input is not bound to the supplied canonical schema registry.",
      ),
    );
  }
  if (
    input.buildManifest.deterministicInputs.dependencyGraphHash !==
      dependencyDigests.dependencyGraphHash
  ) {
    diagnostics.push(
      diagnostic(
        "DEPENDENCY_GRAPH_HASH_MISMATCH",
        "FAIL",
        "buildManifest.deterministicInputs.dependencyGraphHash",
        "Build input is not bound to the supplied dependency graph.",
      ),
    );
  }
  if (
    input.buildManifest.deterministicInputs.lockfileHash !==
      dependencyDigests.lockfileHash
  ) {
    diagnostics.push(
      diagnostic(
        "DEPENDENCY_LOCK_HASH_MISMATCH",
        "FAIL",
        "buildManifest.deterministicInputs.lockfileHash",
        "Build input is not bound to the supplied lockfile digest.",
      ),
    );
  }
  if (
    input.buildManifest.deterministicInputs.toolchainHash !==
      dependencyDigests.toolchainHash
  ) {
    diagnostics.push(
      diagnostic(
        "TOOLCHAIN_HASH_MISMATCH",
        "FAIL",
        "buildManifest.deterministicInputs.toolchainHash",
        "Build input is not bound to the supplied toolchain digest.",
      ),
    );
  }
  if (
    !isSha256(
      input.buildManifest.deterministicInputs.allowlistedEnvironmentHash,
    )
  ) {
    diagnostics.push(
      diagnostic(
        "ENVIRONMENT_HASH_INVALID",
        "FAIL",
        "buildManifest.deterministicInputs.allowlistedEnvironmentHash",
        "Allowlisted environment identity must be a SHA-256 digest.",
      ),
    );
  }
  if (input.provenance.buildManifestHash !== input.buildManifestHash) {
    diagnostics.push(
      diagnostic(
        "PROVENANCE_BUILD_LINK_MISMATCH",
        "FAIL",
        "provenance.buildManifestHash",
        "Provenance is linked to a different build manifest.",
      ),
    );
  }
  if (input.provenance.artifactManifestHash !== input.artifactManifestHash) {
    diagnostics.push(
      diagnostic(
        "PROVENANCE_ARTIFACT_LINK_MISMATCH",
        "FAIL",
        "provenance.artifactManifestHash",
        "Provenance is linked to a different artifact manifest.",
      ),
    );
  }
  if (
    input.provenance.deterministicInputs.allowlistedEnvironmentHash !==
      input.buildManifest.deterministicInputs.allowlistedEnvironmentHash
  ) {
    diagnostics.push(
      diagnostic(
        "ENVIRONMENT_HASH_MISMATCH",
        "FAIL",
        "provenance.deterministicInputs.allowlistedEnvironmentHash",
        "Provenance is linked to a different allowlisted environment identity.",
      ),
    );
  }
  if (
    canonicalJson(input.provenance.deterministicInputs) !==
      canonicalJson(input.buildManifest.deterministicInputs)
  ) {
    diagnostics.push(
      diagnostic(
        "PROVENANCE_INPUT_LINK_MISMATCH",
        "FAIL",
        "provenance.deterministicInputs",
        "Provenance deterministic inputs differ from the build manifest.",
      ),
    );
  }
  const provenanceVerification = await verifyProvenanceChain(
    input.provenance,
    {
      buildManifest: input.buildManifest,
      artifactManifest: input.artifactManifest,
    },
  );
  if (!provenanceVerification.ok) {
    diagnostics.push(
      ...provenanceVerification.diagnostics.map((item) =>
        diagnostic(item.code, "FAIL", item.path ?? "provenance", item.message)
      ),
    );
  }
  validateArtifactSafety(input.artifactManifest, diagnostics);
  const commands = validateCommandEvidence(input.commands, diagnostics);
  validateBaselineEvidence(input.baseline, diagnostics);
  const repeatBuild = validateRepeatBuild(input.repeatBuild, diagnostics);
  const isolatedStatuses = {} as Record<
    Fp007AcceptanceId,
    Fp007QualificationEvidence
  >;
  const realStatuses = {} as Record<
    Fp007AcceptanceId,
    Fp007QualificationEvidence
  >;
  const acceptanceIds: readonly Fp007AcceptanceId[] = [
    "FP007-SCHEMA-001",
    "FP007-DEP-001",
    "FP007-BUILD-001",
    "FP007-DIST-001",
    "FP007-PROVENANCE-001",
  ];
  for (const id of acceptanceIds) {
    isolatedStatuses[id] = qualificationFor(
      input.isolatedFixtureStatuses,
      id,
      diagnostics,
      "isolatedFixture",
      true,
    );
    realStatuses[id] = qualificationFor(
      input.realRepoQualification,
      id,
      diagnostics,
      "realRepoQualification",
      false,
    );
    validateQualificationCommandBinding(
      isolatedStatuses[id],
      `isolatedFixture.${id}`,
      commands,
      diagnostics,
    );
    validateQualificationCommandBinding(
      realStatuses[id],
      `realRepoQualification.${id}`,
      commands,
      diagnostics,
    );
  }
  const analyzer: Readonly<Record<Fp007AcceptanceId, Fp007AnalyzerEvidence>> = {
    "FP007-SCHEMA-001": {
      status: diagnostics.some((item) =>
          item.subject.startsWith("schema") ||
          item.subject === "contextSha256"
        )
        ? "FAIL"
        : "PASS",
      execution: "PASS",
      findingCount:
        diagnostics.filter((item) => item.subject.startsWith("schema")).length,
      note: "Canonical schema identity and registry digest were re-resolved.",
    },
    "FP007-DEP-001": {
      status: input.dependencyInventory.status,
      execution: "PASS",
      findingCount: input.dependencyInventory.findings.length,
      note:
        "Offline dependency analyzer completed; findings remain target findings.",
    },
    "FP007-BUILD-001": {
      status:
        diagnostics.some((item) =>
            item.code.includes("BUILD") || item.code.includes("DEPENDENCY") ||
            item.code.includes("TOOLCHAIN") || item.code.includes("ENVIRONMENT")
          )
          ? "FAIL"
          : "PASS",
      execution: "PASS",
      findingCount:
        diagnostics.filter((item) =>
          item.code.includes("BUILD") || item.code.includes("DEPENDENCY") ||
          item.code.includes("TOOLCHAIN") || item.code.includes("ENVIRONMENT")
        ).length,
      note: "Canonical manifest and deterministic input links were checked.",
    },
    "FP007-DIST-001": {
      status:
        diagnostics.some((item) =>
            item.code.includes("ARTIFACT") || item.code.includes("PROVENANCE")
          )
          ? "FAIL"
          : "PASS",
      execution: "PASS",
      findingCount:
        diagnostics.filter((item) =>
          item.code.includes("ARTIFACT") || item.code.includes("PROVENANCE")
        ).length,
      note:
        "Artifact topology and source-to-dist provenance links were checked.",
    },
    "FP007-PROVENANCE-001": {
      status:
        diagnostics.some((item) =>
            item.code.includes("PROVENANCE") || item.code.includes("CHAIN")
          )
          ? "FAIL"
          : "PASS",
      execution: "PASS",
      findingCount:
        diagnostics.filter((item) =>
          item.code.includes("PROVENANCE") || item.code.includes("CHAIN")
        ).length,
      note: "Provenance hash and deterministic input chain were checked.",
    },
  };
  const acceptances = acceptanceIds.map((id) => ({
    id,
    analyzer: analyzer[id],
    isolatedFixture: isolatedStatuses[id],
    realRepoQualification: realStatuses[id],
    status: finalAcceptanceStatus(
      analyzer[id].status,
      isolatedStatuses[id].status,
      realStatuses[id].status,
    ),
  }));
  const findings = await summarizeFindings(
    input.dependencyInventory.findings,
    input.cleanRoom,
    diagnostics,
  );
  const totalTestCount = commands.reduce(
    (total, item) => total + (item.testCount ?? 0),
    0,
  );
  const currentSystemImpact = await deriveCurrentSystemImpact(
    input.currentSystemImpactReceipt,
    input.currentSystemImpactProof,
    diagnostics,
  );
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const evidence: Fp007IntegrationEvidence = {
    documentId: FP007_INTEGRATION_DOCUMENT,
    schemaVersion: FP007_INTEGRATION_SCHEMA_VERSION,
    package: "FP-007",
    contextSha256: FP007_CONTEXT_SHA256,
    evidenceScope: "CROSS_TRACK_COORDINATOR_INTEGRATION",
    status:
      acceptances.some((item) =>
          item.status === "FAIL" || item.status === "BLOCKED"
        )
        ? "BLOCKED"
        : acceptances.some((item) =>
            item.status === "UNTESTED" || item.status === "UNKNOWN"
          )
        ? "UNTESTED"
        : "PASS",
    acceptances,
    chain: {
      schemaRegistryDigest,
      dependencyGraphHash: dependencyDigests.dependencyGraphHash,
      lockfileHash: dependencyDigests.lockfileHash,
      toolchainHash: dependencyDigests.toolchainHash,
      allowlistedEnvironmentHash:
        input.buildManifest.deterministicInputs.allowlistedEnvironmentHash,
      buildManifestHash: input.buildManifestHash,
      artifactManifestHash: input.artifactManifestHash,
      mappingRootHash: input.provenance.mappingRootHash,
      provenanceHash: input.provenance.provenanceHash,
    },
    commands,
    totalTestCount,
    sources: input.buildManifest.sourceFiles.map((source) => ({
      path: source.path,
      bytes: source.bytes,
      sha256: source.sha256,
    })),
    artifacts: input.artifactManifest.artifacts.map((artifact) => ({
      path: artifact.path,
      role: artifact.role,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      compression: artifact.compression,
    })),
    repeatBuild,
    findings,
    baseline: input.baseline,
    reviewStatus: "PENDING_INDEPENDENT_REVIEW",
    currentSystemImpact,
    independentReviewQuestions: [
      "Does the registry digest cover every canonical schema record and reject caller-forged or unknown identities?",
      "Are dependency, lockfile, toolchain, and environment digests computed from the same deterministic inputs used by the build manifest?",
      "Does a dirty worktree or existing stage-web-assets nondeterminism remain a release blocker rather than being hidden by the isolated fixture PASS?",
      "Are every entry and lazy artifact mapped exactly once without lazy-to-initial contamination?",
      "Does the evidence contain only repository-relative paths and sanitized identities, with no date, host, user, JWT, email, secret, or project content?",
      "Is the baseline verifier command and the test/target/signature fixture retained for a later independent 14-identity verification?",
    ],
  };
  const serialized = canonicalJson(evidence);
  validateSafeText(serialized, "evidence", diagnostics);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, value: evidence, diagnostics: [] };
}

/** A small deterministic chain fixture used by the integration test only. */
export async function createFp007ReferenceChain(input: {
  readonly schemaRegistry: SchemaRegistry;
  readonly schemaIdentity: SchemaIdentityInput;
  readonly dependencyInventory: DependencyInventory;
  readonly allowlistedEnvironmentHash: string;
}): Promise<{
  readonly buildManifest: CanonicalBuildManifest;
  readonly buildManifestHash: string;
  readonly artifactManifest: ArtifactManifest;
  readonly artifactManifestHash: string;
  readonly provenance: SourceDistProvenanceChain;
  readonly repeatBuild: RepeatQualification;
}> {
  const { createArtifactManifest, createArtifactRecord } = await import(
    "./artifact-manifest.ts"
  );
  const { createBuildManifest } = await import("./build-manifest.ts");
  const { createProvenanceChain } = await import("./source-dist-provenance.ts");
  const { createRepeatBuildSnapshot, qualifyRepeatBuild } = await import(
    "./repeat-build-record.ts"
  );
  const schemaRegistryDigest = await computeSchemaRegistryDigest(
    input.schemaRegistry,
  );
  const dependencyDigests = await computeDependencyDigests(
    input.dependencyInventory,
  );
  const source = new TextEncoder().encode("export const pixel = 1;\n");
  const dist = new TextEncoder().encode("const pixel=1;\n");
  const sourceRecord = await createArtifactRecord({
    path: "src/main.ts",
    role: "SOURCE",
    compression: "NONE",
    content: source,
  });
  const distRecord = await createArtifactRecord({
    path: "dist/entry.js",
    role: "ENTRY",
    compression: "NONE",
    content: dist,
  });
  if (!sourceRecord.ok || !distRecord.ok) {
    throw new Error("FP-007 reference artifact fixture could not be created.");
  }
  const buildResult = await createBuildManifest({
    buildCommand: ["fixture-build", "src/main.ts", "dist/entry.js"],
    entries: ["dist/entry.js"],
    initialChunks: ["dist/entry.js"],
    lazyChunks: [],
    sourceMapPolicy: {
      mode: "EXCLUDED",
      mappingProof: "DIRECT_SOURCE_DIGEST_CHAIN",
      declaredMapPaths: [],
    },
    sourceFiles: [{
      path: "src/main.ts",
      bytes: source.byteLength,
      sha256: sourceRecord.value.sha256,
    }],
    declaredArtifacts: ["src/main.ts", "dist/entry.js"],
    schemaRegistryDigest,
    dependencyGraphHash: dependencyDigests.dependencyGraphHash,
    lockfileHash: dependencyDigests.lockfileHash,
    toolchainHash: dependencyDigests.toolchainHash,
    allowlistedEnvironmentHash: input.allowlistedEnvironmentHash,
  });
  if (!buildResult.ok) {
    throw new Error(
      "FP-007 reference build manifest fixture could not be created.",
    );
  }
  const artifactResult = await createArtifactManifest([
    sourceRecord.value,
    distRecord.value,
  ]);
  if (!artifactResult.ok) {
    throw new Error(
      "FP-007 reference artifact manifest fixture could not be created.",
    );
  }
  const mappingEvidenceHash = await sha256Hex(
    canonicalJson({
      source: "src/main.ts",
      dist: "dist/entry.js",
      mode: "DIRECT_SOURCE_DIGEST_CHAIN",
    }),
  );
  const provenanceResult = await createProvenanceChain({
    buildManifest: buildResult.value.manifest,
    buildManifestHash: buildResult.value.manifestHash,
    artifactManifest: artifactResult.value.manifest,
    artifactManifestHash: artifactResult.value.manifestHash,
    mappings: [{
      sourcePath: "src/main.ts",
      sourceSha256: sourceRecord.value.sha256,
      distPath: "dist/entry.js",
      distSha256: distRecord.value.sha256,
      proofMode: "DIRECT_SOURCE_DIGEST_CHAIN",
      sourceReferences: ["src/main.ts"],
      mappingEvidenceHash,
      mapPath: null,
      mapSha256: null,
    }],
  });
  if (!provenanceResult.ok) {
    throw new Error(
      "FP-007 reference provenance fixture could not be created.",
    );
  }
  const snapshotInput = {
    inputHash: buildResult.value.manifestHash,
    buildManifestHash: buildResult.value.manifestHash,
    manifestCanonicalJson: buildResult.value.canonicalJson,
    toolchainHash: buildResult.value.manifest.deterministicInputs.toolchainHash,
    artifactManifestHash: artifactResult.value.manifestHash,
    artifacts: artifactResult.value.manifest.artifacts.map((artifact) => ({
      path: artifact.path,
      bytes: artifact.bytes,
      size: artifact.size,
      sha256: artifact.sha256,
      compression: artifact.compression,
    })),
  } as const;
  const first = await createRepeatBuildSnapshot(snapshotInput);
  const second = await createRepeatBuildSnapshot(snapshotInput);
  return {
    buildManifest: buildResult.value.manifest,
    buildManifestHash: buildResult.value.manifestHash,
    artifactManifest: artifactResult.value.manifest,
    artifactManifestHash: artifactResult.value.manifestHash,
    provenance: provenanceResult.value,
    repeatBuild: qualifyRepeatBuild(first, second, "ISOLATED_FIXTURE"),
  };
}
