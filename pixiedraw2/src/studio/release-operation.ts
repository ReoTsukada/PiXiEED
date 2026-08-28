/**
 * STUDIO-050 external release-operation boundary.
 *
 * Package creation, readiness evaluation, deployment, promotion, and rollback
 * are deliberately separate concerns. This module creates a tamper-evident
 * operation plan and requires an explicit, time-bounded approval before an
 * injected external executor can be called. The module itself has no network,
 * Storage, feature-flag, deployment, or rollback provider.
 */

import { canonicalJson, type Sha256, sha256 } from "../game/game-300/core.ts";
import type {
  StudioOperationalEnvironment,
  StudioOperationalEvaluation,
  StudioRollbackPlan,
} from "./operational-safety.ts";
import type { StudioPublishIntent } from "./package-publish.ts";
import {
  STUDIO_READINESS_CHECK_IDS,
  type StudioReadinessCheckId,
  type StudioReadinessReport,
  type StudioReadinessTarget,
} from "./release-readiness.ts";

export const STUDIO_RELEASE_OPERATION_SCHEMA_VERSION = 1 as const;

export type StudioForwardReleaseAction =
  | "DEPLOY_STAGING"
  | "PROMOTE_BETA"
  | "PUBLISH_PRODUCTION";
export type StudioReleaseOperationAction =
  | StudioForwardReleaseAction
  | "ROLLBACK";

interface StudioReleaseOperationBase {
  readonly schemaVersion: typeof STUDIO_RELEASE_OPERATION_SCHEMA_VERSION;
  readonly kind: "STUDIO_RELEASE_OPERATION_PLAN";
  readonly operationId: string;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly projectRevisionId: string;
  readonly execution: "INJECTED_EXTERNAL_EXECUTOR_ONLY";
  readonly explicitApprovalRequired: true;
  readonly automaticRollback: false;
  readonly planHash: Sha256;
}

export interface StudioPublishOperationPlan
  extends StudioReleaseOperationBase {
  readonly action: StudioForwardReleaseAction;
  readonly target: StudioReadinessTarget;
  readonly packageHash: Sha256;
  readonly publishIntent: StudioPublishIntent;
  readonly readinessReport: StudioReadinessReport;
}

export interface StudioRollbackOperationPlan
  extends StudioReleaseOperationBase {
  readonly action: "ROLLBACK";
  readonly environment: StudioOperationalEnvironment;
  readonly currentPackageHash: Sha256;
  readonly restorePackageHash: Sha256;
  readonly restoreRevisionId: string;
  readonly rollbackPlan: StudioRollbackPlan;
  readonly operationalEvaluation: StudioOperationalEvaluation;
}

export type StudioReleaseOperationPlan =
  | StudioPublishOperationPlan
  | StudioRollbackOperationPlan;

export interface StudioReleaseApproval {
  readonly schemaVersion: typeof STUDIO_RELEASE_OPERATION_SCHEMA_VERSION;
  readonly kind: "STUDIO_RELEASE_APPROVAL";
  readonly approvalId: string;
  readonly operationHash: Sha256;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly explicit: true;
  readonly approvalHash: Sha256;
}

interface StudioForwardExternalOperationRequest {
  readonly action: StudioForwardReleaseAction;
  readonly target: StudioReadinessTarget;
  readonly operationId: string;
  readonly operationHash: Sha256;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly projectRevisionId: string;
  readonly packageHash: Sha256;
  readonly approvalId: string;
  readonly idempotencyKey: string;
  readonly payload: "METADATA_ONLY";
}

interface StudioRollbackExternalOperationRequest {
  readonly action: "ROLLBACK";
  readonly environment: StudioOperationalEnvironment;
  readonly operationId: string;
  readonly operationHash: Sha256;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly projectRevisionId: string;
  readonly currentPackageHash: Sha256;
  readonly restorePackageHash: Sha256;
  readonly restoreRevisionId: string;
  readonly approvalId: string;
  readonly idempotencyKey: string;
  readonly payload: "METADATA_ONLY";
}

export type StudioExternalOperationRequest =
  | StudioForwardExternalOperationRequest
  | StudioRollbackExternalOperationRequest;

export interface StudioExternalOperationResult {
  readonly externalOperationId: string;
  readonly status: "SUCCEEDED" | "FAILED";
  readonly summary: string;
}

export interface StudioExternalOperationExecutor {
  /** The host owns the actual provider call and must honor idempotencyKey. */
  readonly execute: (
    request: StudioExternalOperationRequest,
  ) => Promise<StudioExternalOperationResult>;
}

export interface StudioReleaseOperationReceipt {
  readonly schemaVersion: typeof STUDIO_RELEASE_OPERATION_SCHEMA_VERSION;
  readonly kind: "STUDIO_RELEASE_OPERATION_RECEIPT";
  readonly operationId: string;
  readonly operationHash: Sha256;
  readonly action: StudioReleaseOperationAction;
  readonly scope: StudioReadinessTarget | StudioOperationalEnvironment;
  readonly packageHash: Sha256;
  readonly approvalId: string;
  readonly externalOperationId: string;
  readonly status: "SUCCEEDED" | "FAILED";
  readonly automaticRollback: false;
  readonly executedAt: string;
  readonly summary: string;
  readonly receiptHash: Sha256;
}

export type StudioReleaseOperationDiagnosticCode =
  | "INVALID_SCHEMA"
  | "INVALID_IDENTITY"
  | "INVALID_HASH"
  | "INVALID_DATE"
  | "INVALID_APPROVAL"
  | "INVALID_READINESS"
  | "INVALID_OPERATION"
  | "IDENTITY_MISMATCH"
  | "HASH_MISMATCH"
  | "EXPIRED_APPROVAL"
  | "EXECUTOR_FAILED"
  | "EXTERNAL_OPERATION_FAILED";

export interface StudioReleaseOperationDiagnostic {
  readonly code: StudioReleaseOperationDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export interface StudioReleaseOperationResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly diagnostics: readonly StudioReleaseOperationDiagnostic[];
}

function success<T>(value: T): StudioReleaseOperationResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(
  ...diagnostics: StudioReleaseOperationDiagnostic[]
): StudioReleaseOperationResult<T> {
  return { ok: false, diagnostics };
}

function diagnostic(
  code: StudioReleaseOperationDiagnosticCode,
  path: string,
  message: string,
): StudioReleaseOperationDiagnostic {
  return { code, path, message };
}

function stable(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function validHash(value: unknown): value is Sha256 {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function forwardActionFor(target: StudioReadinessTarget): StudioForwardReleaseAction {
  if (target === "STAGING") return "DEPLOY_STAGING";
  if (target === "BETA") return "PROMOTE_BETA";
  return "PUBLISH_PRODUCTION";
}

function expectedDecision(target: StudioReadinessTarget): string {
  if (target === "STAGING") return "READY_FOR_STAGING";
  if (target === "BETA") return "READY_FOR_BETA";
  return "READY_FOR_PRODUCTION";
}

function isReadinessTarget(value: unknown): value is StudioReadinessTarget {
  return value === "STAGING" || value === "BETA" || value === "PRODUCTION";
}

function isForwardAction(value: unknown): value is StudioForwardReleaseAction {
  return value === "DEPLOY_STAGING" || value === "PROMOTE_BETA" ||
    value === "PUBLISH_PRODUCTION";
}

function isReadinessCheckId(value: unknown): value is StudioReadinessCheckId {
  return (STUDIO_READINESS_CHECK_IDS as readonly string[]).includes(
    value as string,
  );
}

function readinessReportHashInput(
  report: StudioReadinessReport,
): Omit<StudioReadinessReport, "evidenceHash"> {
  const { evidenceHash: _ignored, ...base } = report;
  void _ignored;
  return base;
}

function expectedUntested(
  checks: readonly unknown[],
): readonly StudioReadinessCheckId[] {
  return checks.flatMap((check) => {
    if (
      check === null || typeof check !== "object" ||
      (check as Record<string, unknown>).status !== "UNTESTED" ||
      !isReadinessCheckId((check as Record<string, unknown>).checkId)
    ) return [];
    return [(check as Record<string, unknown>).checkId as StudioReadinessCheckId];
  });
}

function sameIds(
  left: readonly StudioReadinessCheckId[],
  right: readonly StudioReadinessCheckId[],
): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

async function validateReadinessReport(
  report: StudioReadinessReport,
  target: StudioReadinessTarget,
  packageHash: Sha256,
): Promise<readonly StudioReleaseOperationDiagnostic[]> {
  const diagnostics: StudioReleaseOperationDiagnostic[] = [];
  if (report === null || typeof report !== "object") {
    return [
      diagnostic("INVALID_READINESS", "readinessReport", "Readiness report must be an object."),
    ];
  }
  if (!isReadinessTarget(target)) {
    return [
      diagnostic("INVALID_READINESS", "readinessReport.target", "Readiness report target is unsupported."),
    ];
  }
  if (report.schemaVersion !== 2) {
    diagnostics.push(
      diagnostic("INVALID_SCHEMA", "readinessReport.schemaVersion", "Readiness report schema is unsupported."),
    );
  }
  if (!stable(report.packageId) || !stable(report.packageVersion) || !stable(report.projectRevisionId)) {
    diagnostics.push(
      diagnostic("INVALID_IDENTITY", "readinessReport", "Readiness report identities must be stable."),
    );
  }
  if (!validHash(report.packageHash) || report.packageHash !== packageHash) {
    diagnostics.push(
      diagnostic("IDENTITY_MISMATCH", "readinessReport.packageHash", "Readiness report must belong to the operation Package."),
    );
  }
  if (report.target !== target || report.decision !== expectedDecision(target)) {
    diagnostics.push(
      diagnostic("INVALID_READINESS", "readinessReport.decision", "Readiness report is not ready for the requested target."),
    );
  }
  if (!Array.isArray(report.checks) || report.checks.length !== STUDIO_READINESS_CHECK_IDS.length) {
    diagnostics.push(
      diagnostic("INVALID_READINESS", "readinessReport.checks", "Readiness report must contain every required check exactly once."),
    );
  }
  const checks: readonly unknown[] = Array.isArray(report.checks)
    ? report.checks
    : [];
  const ids = checks.map((check) =>
    check !== null && typeof check === "object"
      ? (check as Record<string, unknown>).checkId
      : undefined
  );
  if (
    ids.length !== STUDIO_READINESS_CHECK_IDS.length ||
    STUDIO_READINESS_CHECK_IDS.some((id, index) => ids[index] !== id) ||
    new Set(ids).size !== STUDIO_READINESS_CHECK_IDS.length
  ) {
    diagnostics.push(
      diagnostic("INVALID_READINESS", "readinessReport.checks", "Readiness checks must use the canonical order and IDs."),
    );
  }
  const expectedEnvironment = target === "PRODUCTION" ? "PRODUCTION" : "STAGING";
  for (const [index, check] of checks.entries()) {
    if (check === null || typeof check !== "object") {
      diagnostics.push(
        diagnostic("INVALID_READINESS", `readinessReport.checks[${index}]`, "Readiness check must be an object."),
      );
      continue;
    }
    const checkRecord = check as Record<string, unknown>;
    if (
      checkRecord.environment !== expectedEnvironment ||
      !(["PASS", "UNTESTED", "FAIL", "BLOCKED"] as readonly string[]).includes(checkRecord.status as string) ||
      !(["LIVE_OBSERVATION", "ISOLATED_FIXTURE"] as readonly string[]).includes(checkRecord.evidenceKind as string)
    ) {
      diagnostics.push(
        diagnostic("INVALID_READINESS", `readinessReport.checks[${index}]`, "Readiness check contains an unsupported environment, status, or evidence kind."),
      );
    }
  }
  if (target === "STAGING") {
    const staging = checks.find((check) =>
      check !== null && typeof check === "object" &&
      (check as Record<string, unknown>).checkId === "STAGING_DEPLOYMENT"
    ) as Record<string, unknown> | undefined;
    if (staging?.status !== "PASS" || staging.evidenceKind !== "LIVE_OBSERVATION") {
      diagnostics.push(
        diagnostic("INVALID_READINESS", "readinessReport.checks.STAGING_DEPLOYMENT", "Staging deployment must have live PASS evidence."),
      );
    }
  } else if (checks.some((check) => {
    if (check === null || typeof check !== "object") return true;
    const record = check as Record<string, unknown>;
    return record.status !== "PASS" || record.evidenceKind !== "LIVE_OBSERVATION";
  })) {
    diagnostics.push(
      diagnostic("INVALID_READINESS", "readinessReport.checks", "Beta and Production operations require live PASS evidence for every check."),
    );
  }
  if (
    !Array.isArray(report.untested) ||
    !sameIds(report.untested, expectedUntested(checks))
  ) {
    diagnostics.push(
      diagnostic("INVALID_READINESS", "readinessReport.untested", "Readiness report UNTESTED entries do not match its checks."),
    );
  }
  if (!validHash(report.evidenceHash)) {
    diagnostics.push(
      diagnostic("INVALID_HASH", "readinessReport.evidenceHash", "Readiness report hash is malformed."),
    );
  } else if (report.evidenceHash !== await sha256(readinessReportHashInput(report))) {
    diagnostics.push(
      diagnostic("HASH_MISMATCH", "readinessReport.evidenceHash", "Readiness report hash does not match its contents."),
    );
  }
  return diagnostics;
}

function validatePublishIntent(
  intent: StudioPublishIntent,
): readonly StudioReleaseOperationDiagnostic[] {
  const diagnostics: StudioReleaseOperationDiagnostic[] = [];
  if (intent === null || typeof intent !== "object") {
    return [
      diagnostic("INVALID_OPERATION", "publishIntent", "Publish Intent must be an object."),
    ];
  }
  if (intent.kind !== "STUDIO_PUBLISH_INTENT" || intent.explicit !== true) {
    diagnostics.push(
      diagnostic("INVALID_OPERATION", "publishIntent", "Only an explicit Studio Publish Intent can enter an operation plan."),
    );
  }
  if (!stable(intent.packageId) || !stable(intent.packageVersion) || !stable(intent.projectRevisionId) || !stable(intent.requestedBy)) {
    diagnostics.push(
      diagnostic("INVALID_IDENTITY", "publishIntent", "Publish Intent identities must be stable."),
    );
  }
  if (!validHash(intent.packageHash)) {
    diagnostics.push(
      diagnostic("INVALID_HASH", "publishIntent.packageHash", "Publish Intent Package hash is malformed."),
    );
  }
  if (intent.note !== "External distribution requires a separate approved operation.") {
    diagnostics.push(
      diagnostic("INVALID_OPERATION", "publishIntent.note", "Publish Intent must retain its external approval boundary."),
    );
  }
  return diagnostics;
}

function publishPlanHashInput(
  plan: Omit<StudioPublishOperationPlan, "planHash">,
): unknown {
  return { ...plan };
}

function rollbackPlanHashInput(
  plan: Omit<StudioRollbackPlan, "planHash">,
): unknown {
  return {
    schemaVersion: plan.schemaVersion,
    kind: plan.kind,
    environment: plan.environment,
    currentPackageHash: plan.currentPackageHash,
    restorePackageHash: plan.restorePackageHash,
    restoreRevisionId: plan.restoreRevisionId,
    reason: plan.reason,
    execution: plan.execution,
    dataPlane: plan.dataPlane,
  };
}

function operationalEvaluationHashInput(
  evaluation: Omit<StudioOperationalEvaluation, "evaluationHash">,
): unknown {
  return {
    schemaVersion: evaluation.schemaVersion,
    decision: evaluation.decision,
    packageHash: evaluation.packageHash,
    observationHash: evaluation.observationHash,
    alerts: evaluation.alerts,
    ...(evaluation.rollbackPlan === undefined
      ? {}
      : { rollbackPlan: evaluation.rollbackPlan }),
  };
}

async function validateRollbackInputs(
  rollbackPlan: StudioRollbackPlan,
  evaluation: StudioOperationalEvaluation,
  packageHash: Sha256,
): Promise<readonly StudioReleaseOperationDiagnostic[]> {
  const diagnostics: StudioReleaseOperationDiagnostic[] = [];
  if (
    rollbackPlan === null || typeof rollbackPlan !== "object" ||
    evaluation === null || typeof evaluation !== "object"
  ) {
    return [
      diagnostic("INVALID_OPERATION", "rollback", "Rollback plan and evaluation must be objects."),
    ];
  }
  if (evaluation.decision !== "ROLLBACK_REQUIRED") {
    diagnostics.push(
      diagnostic("INVALID_OPERATION", "operationalEvaluation.decision", "Rollback operation requires ROLLBACK_REQUIRED."),
    );
  }
  if (!validHash(evaluation.evaluationHash) || !validHash(evaluation.observationHash)) {
    diagnostics.push(
      diagnostic("INVALID_HASH", "operationalEvaluation", "Operational evaluation hashes are malformed."),
    );
  } else {
    const { evaluationHash: _ignored, ...base } = evaluation;
    void _ignored;
    if (evaluation.evaluationHash !== await sha256(operationalEvaluationHashInput(base))) {
      diagnostics.push(
        diagnostic("HASH_MISMATCH", "operationalEvaluation.evaluationHash", "Operational evaluation hash does not match its contents."),
      );
    }
  }
  if (evaluation.packageHash !== packageHash || rollbackPlan.currentPackageHash !== packageHash) {
    diagnostics.push(
      diagnostic("IDENTITY_MISMATCH", "rollbackPlan.currentPackageHash", "Rollback must start from the observed Package hash."),
    );
  }
  if (evaluation.rollbackPlan === undefined || canonicalJson(evaluation.rollbackPlan) !== canonicalJson(rollbackPlan)) {
    diagnostics.push(
      diagnostic("IDENTITY_MISMATCH", "operationalEvaluation.rollbackPlan", "Rollback plan must be the one evaluated by Operational Safety."),
    );
  }
  if (
    rollbackPlan.schemaVersion !== 1 ||
    rollbackPlan.kind !== "STUDIO_ROLLBACK_PLAN" ||
    rollbackPlan.environment !== "STAGING" && rollbackPlan.environment !== "PRODUCTION" ||
    !validHash(rollbackPlan.currentPackageHash) ||
    !validHash(rollbackPlan.restorePackageHash) ||
    rollbackPlan.currentPackageHash === rollbackPlan.restorePackageHash ||
    !stable(rollbackPlan.restoreRevisionId) ||
    rollbackPlan.execution !== "APPROVED_EXTERNAL_OPERATION_REQUIRED" ||
    rollbackPlan.dataPlane !== "UNCHANGED"
  ) {
    diagnostics.push(
      diagnostic("INVALID_OPERATION", "rollbackPlan", "Rollback plan is not an approved, data-preserving plan."),
    );
  } else {
    const { planHash: _ignored, ...base } = rollbackPlan;
    void _ignored;
    if (!validHash(rollbackPlan.planHash) || rollbackPlan.planHash !== await sha256(rollbackPlanHashInput(base))) {
      diagnostics.push(
        diagnostic("HASH_MISMATCH", "rollbackPlan.planHash", "Rollback plan hash does not match its contents."),
      );
    }
  }
  return diagnostics;
}

/** Create a forward release plan without contacting an external provider. */
export async function createStudioPublishOperationPlan(input: {
  readonly operationId: string;
  readonly target: StudioReadinessTarget;
  readonly publishIntent: StudioPublishIntent;
  readonly readinessReport: StudioReadinessReport;
}): Promise<StudioReleaseOperationResult<StudioPublishOperationPlan>> {
  const diagnostics: StudioReleaseOperationDiagnostic[] = [
    ...validatePublishIntent(input.publishIntent),
    ...await validateReadinessReport(
      input.readinessReport,
      input.target,
      input.publishIntent.packageHash,
    ),
  ];
  if (!isReadinessTarget(input.target)) {
    diagnostics.push(
      diagnostic("INVALID_OPERATION", "target", "Release operation target is unsupported."),
    );
  }
  if (!stable(input.operationId)) {
    diagnostics.push(
      diagnostic("INVALID_IDENTITY", "operationId", "Operation ID must be stable."),
    );
  }
  if (input.readinessReport.packageId !== input.publishIntent.packageId || input.readinessReport.packageVersion !== input.publishIntent.packageVersion || input.readinessReport.projectRevisionId !== input.publishIntent.projectRevisionId) {
    diagnostics.push(
      diagnostic("IDENTITY_MISMATCH", "readinessReport", "Readiness report and Publish Intent must share Package identity."),
    );
  }
  if (diagnostics.length > 0) return failure(...diagnostics);
  const base = {
    schemaVersion: STUDIO_RELEASE_OPERATION_SCHEMA_VERSION,
    kind: "STUDIO_RELEASE_OPERATION_PLAN" as const,
    operationId: input.operationId,
    action: forwardActionFor(input.target),
    target: input.target,
    packageId: input.publishIntent.packageId,
    packageVersion: input.publishIntent.packageVersion,
    projectRevisionId: input.publishIntent.projectRevisionId,
    packageHash: input.publishIntent.packageHash,
    publishIntent: input.publishIntent,
    readinessReport: input.readinessReport,
    execution: "INJECTED_EXTERNAL_EXECUTOR_ONLY" as const,
    explicitApprovalRequired: true as const,
    automaticRollback: false as const,
  } satisfies Omit<StudioPublishOperationPlan, "planHash">;
  return success({ ...base, planHash: await sha256(publishPlanHashInput(base)) });
}

/** Create a rollback plan only after Operational Safety requested rollback. */
export async function createStudioRollbackOperationPlan(input: {
  readonly operationId: string;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly projectRevisionId: string;
  readonly rollbackPlan: StudioRollbackPlan;
  readonly operationalEvaluation: StudioOperationalEvaluation;
}): Promise<StudioReleaseOperationResult<StudioRollbackOperationPlan>> {
  const diagnostics = [
    ...await validateRollbackInputs(
      input.rollbackPlan,
      input.operationalEvaluation,
      input.rollbackPlan.currentPackageHash,
    ),
  ];
  if (!stable(input.operationId) || !stable(input.packageId) || !stable(input.packageVersion) || !stable(input.projectRevisionId)) {
    diagnostics.push(
      diagnostic("INVALID_IDENTITY", "operation", "Rollback operation identities must be stable."),
    );
  }
  if (diagnostics.length > 0) return failure(...diagnostics);
  const base = {
    schemaVersion: STUDIO_RELEASE_OPERATION_SCHEMA_VERSION,
    kind: "STUDIO_RELEASE_OPERATION_PLAN" as const,
    operationId: input.operationId,
    action: "ROLLBACK" as const,
    environment: input.rollbackPlan.environment,
    packageId: input.packageId,
    packageVersion: input.packageVersion,
    projectRevisionId: input.projectRevisionId,
    currentPackageHash: input.rollbackPlan.currentPackageHash,
    restorePackageHash: input.rollbackPlan.restorePackageHash,
    restoreRevisionId: input.rollbackPlan.restoreRevisionId,
    rollbackPlan: input.rollbackPlan,
    operationalEvaluation: input.operationalEvaluation,
    execution: "INJECTED_EXTERNAL_EXECUTOR_ONLY" as const,
    explicitApprovalRequired: true as const,
    automaticRollback: false as const,
  } satisfies Omit<StudioRollbackOperationPlan, "planHash">;
  return success({ ...base, planHash: await sha256(base) });
}

async function validateOperationPlan(
  plan: StudioReleaseOperationPlan,
): Promise<readonly StudioReleaseOperationDiagnostic[]> {
  const diagnostics: StudioReleaseOperationDiagnostic[] = [];
  if (plan.schemaVersion !== STUDIO_RELEASE_OPERATION_SCHEMA_VERSION || plan.kind !== "STUDIO_RELEASE_OPERATION_PLAN") {
    diagnostics.push(
      diagnostic("INVALID_SCHEMA", "plan", "Release operation plan schema is unsupported."),
    );
  }
  if (!stable(plan.operationId) || !stable(plan.packageId) || !stable(plan.packageVersion) || !stable(plan.projectRevisionId)) {
    diagnostics.push(
      diagnostic("INVALID_IDENTITY", "plan", "Release operation plan identities must be stable."),
    );
  }
  if (plan.execution !== "INJECTED_EXTERNAL_EXECUTOR_ONLY" || plan.explicitApprovalRequired !== true || plan.automaticRollback !== false) {
    diagnostics.push(
      diagnostic("INVALID_OPERATION", "plan.execution", "External execution and automatic rollback must remain explicit."),
    );
  }
  if (!validHash(plan.planHash)) {
    diagnostics.push(
      diagnostic("INVALID_HASH", "plan.planHash", "Release operation plan hash is malformed."),
    );
  }
  if (plan.action === "ROLLBACK") {
    diagnostics.push(...await validateRollbackInputs(plan.rollbackPlan, plan.operationalEvaluation, plan.currentPackageHash));
    if (plan.packageId.length === 0 || plan.packageVersion.length === 0 || plan.projectRevisionId.length === 0) {
      diagnostics.push(
        diagnostic("INVALID_IDENTITY", "plan", "Rollback operation identity is incomplete."),
      );
    }
    const { planHash: _ignored, ...base } = plan;
    void _ignored;
    if (validHash(plan.planHash) && plan.planHash !== await sha256(base)) {
      diagnostics.push(
        diagnostic("HASH_MISMATCH", "plan.planHash", "Rollback operation plan hash does not match its contents."),
      );
    }
  } else {
    if (!validHash(plan.packageHash)) {
      diagnostics.push(
        diagnostic("INVALID_HASH", "plan.packageHash", "Publish operation Package hash is malformed."),
      );
    }
    diagnostics.push(...validatePublishIntent(plan.publishIntent));
    diagnostics.push(...await validateReadinessReport(plan.readinessReport, plan.target, plan.packageHash));
    if (plan.publishIntent.packageHash !== plan.packageHash || plan.publishIntent.packageId !== plan.packageId || plan.publishIntent.packageVersion !== plan.packageVersion || plan.publishIntent.projectRevisionId !== plan.projectRevisionId) {
      diagnostics.push(
        diagnostic("IDENTITY_MISMATCH", "plan", "Publish operation identity is inconsistent."),
      );
    }
    if (plan.action !== forwardActionFor(plan.target)) {
      diagnostics.push(
        diagnostic("INVALID_OPERATION", "plan.action", "Publish action does not match its readiness target."),
      );
    }
    const { planHash: _ignored, ...base } = plan;
    void _ignored;
    if (validHash(plan.planHash) && plan.planHash !== await sha256(publishPlanHashInput(base))) {
      diagnostics.push(
        diagnostic("HASH_MISMATCH", "plan.planHash", "Publish operation plan hash does not match its contents."),
      );
    }
  }
  return diagnostics;
}

function approvalHashInput(
  approval: Omit<StudioReleaseApproval, "approvalHash">,
): unknown {
  return { ...approval };
}

/** Create a time-bounded approval; this does not execute the operation. */
export async function createStudioReleaseApproval(
  approval: Omit<StudioReleaseApproval, "approvalHash">,
): Promise<StudioReleaseOperationResult<StudioReleaseApproval>> {
  const diagnostics: StudioReleaseOperationDiagnostic[] = [];
  if (approval.schemaVersion !== STUDIO_RELEASE_OPERATION_SCHEMA_VERSION || approval.kind !== "STUDIO_RELEASE_APPROVAL" || approval.explicit !== true) {
    diagnostics.push(
      diagnostic("INVALID_APPROVAL", "approval", "Approval must be explicit and use the supported schema."),
    );
  }
  if (!stable(approval.approvalId) || !stable(approval.approvedBy)) {
    diagnostics.push(
      diagnostic("INVALID_IDENTITY", "approval", "Approval identities must be stable."),
    );
  }
  if (!validHash(approval.operationHash)) {
    diagnostics.push(
      diagnostic("INVALID_HASH", "approval.operationHash", "Approval operation hash is malformed."),
    );
  }
  if (!validDate(approval.approvedAt) || !validDate(approval.expiresAt) || Date.parse(approval.expiresAt) <= Date.parse(approval.approvedAt)) {
    diagnostics.push(
      diagnostic("INVALID_DATE", "approval", "Approval must have a valid expiry after its approval time."),
    );
  }
  if (diagnostics.length > 0) return failure(...diagnostics);
  return success({ ...approval, approvalHash: await sha256(approvalHashInput(approval)) });
}

async function validateApproval(
  approval: StudioReleaseApproval,
  planHash: unknown,
  now: string,
): Promise<readonly StudioReleaseOperationDiagnostic[]> {
  const diagnostics: StudioReleaseOperationDiagnostic[] = [];
  if (approval === null || typeof approval !== "object") {
    return [
      diagnostic("INVALID_APPROVAL", "approval", "Approval must be an object."),
    ];
  }
  if (approval.schemaVersion !== STUDIO_RELEASE_OPERATION_SCHEMA_VERSION || approval.kind !== "STUDIO_RELEASE_APPROVAL" || approval.explicit !== true) {
    diagnostics.push(
      diagnostic("INVALID_APPROVAL", "approval", "Approval is not an explicit Studio approval."),
    );
  }
  if (approval.operationHash !== planHash) {
    diagnostics.push(
      diagnostic("IDENTITY_MISMATCH", "approval.operationHash", "Approval belongs to another operation plan."),
    );
  }
  if (!validHash(approval.approvalHash) || approval.approvalHash !== await sha256(approvalHashInput({
    schemaVersion: approval.schemaVersion,
    kind: approval.kind,
    approvalId: approval.approvalId,
    operationHash: approval.operationHash,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    expiresAt: approval.expiresAt,
    explicit: approval.explicit,
  }))) {
    diagnostics.push(
      diagnostic("HASH_MISMATCH", "approval.approvalHash", "Approval hash does not match its contents."),
    );
  }
  if (!validDate(now) || !validDate(approval.approvedAt) || !validDate(approval.expiresAt)) {
    diagnostics.push(
      diagnostic("INVALID_DATE", "approval", "Approval timestamps are invalid."),
    );
  } else if (Date.parse(now) < Date.parse(approval.approvedAt)) {
    diagnostics.push(
      diagnostic("INVALID_DATE", "approval.approvedAt", "Operation cannot execute before approval time."),
    );
  } else if (Date.parse(now) >= Date.parse(approval.expiresAt)) {
    diagnostics.push(
      diagnostic("EXPIRED_APPROVAL", "approval.expiresAt", "Approval has expired."),
    );
  }
  return diagnostics;
}

function requestFor(
  plan: StudioReleaseOperationPlan,
  approval: StudioReleaseApproval,
): StudioExternalOperationRequest {
  if (plan.action === "ROLLBACK") {
    return {
      action: "ROLLBACK",
      environment: plan.environment,
      operationId: plan.operationId,
      operationHash: plan.planHash,
      packageId: plan.packageId,
      packageVersion: plan.packageVersion,
      projectRevisionId: plan.projectRevisionId,
      currentPackageHash: plan.currentPackageHash,
      restorePackageHash: plan.restorePackageHash,
      restoreRevisionId: plan.restoreRevisionId,
      approvalId: approval.approvalId,
      idempotencyKey: plan.operationId,
      payload: "METADATA_ONLY",
    };
  }
  return {
    action: plan.action,
    target: plan.target,
    operationId: plan.operationId,
    operationHash: plan.planHash,
    packageId: plan.packageId,
    packageVersion: plan.packageVersion,
    projectRevisionId: plan.projectRevisionId,
    packageHash: plan.packageHash,
    approvalId: approval.approvalId,
    idempotencyKey: plan.operationId,
    payload: "METADATA_ONLY",
  };
}

function scopeFor(
  plan: StudioReleaseOperationPlan,
): StudioReadinessTarget | StudioOperationalEnvironment {
  return plan.action === "ROLLBACK" ? plan.environment : plan.target;
}

function receiptHashInput(
  receipt: Omit<StudioReleaseOperationReceipt, "receiptHash">,
): unknown {
  return { ...receipt };
}

/**
 * Execute only after plan and approval validation. The executor is injected by
 * the host, receives metadata only, and owns provider idempotency. A provider
 * failure never triggers an implicit rollback call.
 */
export async function executeApprovedStudioReleaseOperation(input: {
  readonly plan: StudioReleaseOperationPlan;
  readonly approval: StudioReleaseApproval;
  readonly executor: StudioExternalOperationExecutor;
  readonly now?: () => string;
}): Promise<StudioReleaseOperationResult<StudioReleaseOperationReceipt>> {
  let now: string;
  try {
    now = input.now?.() ?? new Date().toISOString();
  } catch {
    return failure(
      diagnostic("INVALID_DATE", "now", "Execution clock failed; the external operation was not attempted."),
    );
  }
  let planDiagnostics: readonly StudioReleaseOperationDiagnostic[];
  let approvalDiagnostics: readonly StudioReleaseOperationDiagnostic[];
  try {
    planDiagnostics = await validateOperationPlan(input.plan);
    approvalDiagnostics = await validateApproval(
      input.approval,
      input.plan?.planHash,
      now,
    );
  } catch {
    return failure(
      diagnostic("INVALID_OPERATION", "plan", "Release operation validation failed closed."),
    );
  }
  const diagnostics = [...planDiagnostics, ...approvalDiagnostics];
  if (diagnostics.length > 0) return failure(...diagnostics);
  let result: StudioExternalOperationResult;
  try {
    result = await input.executor.execute(requestFor(input.plan, input.approval));
  } catch {
    return failure(
      diagnostic("EXECUTOR_FAILED", "executor", "External release executor failed before returning a receipt."),
    );
  }
  if (
    result === null || typeof result !== "object" ||
    !stable(result.externalOperationId) ||
    (result.status !== "SUCCEEDED" && result.status !== "FAILED") ||
    typeof result.summary !== "string" ||
    result.summary.length < 1 ||
    result.summary.length > 240
  ) {
    return failure(
      diagnostic("EXECUTOR_FAILED", "executor.result", "External executor returned an invalid, non-auditable result."),
    );
  }
  const receiptBase = {
    schemaVersion: STUDIO_RELEASE_OPERATION_SCHEMA_VERSION,
    kind: "STUDIO_RELEASE_OPERATION_RECEIPT" as const,
    operationId: input.plan.operationId,
    operationHash: input.plan.planHash,
    action: input.plan.action,
    scope: scopeFor(input.plan),
    packageHash: input.plan.action === "ROLLBACK"
      ? input.plan.currentPackageHash
      : input.plan.packageHash,
    approvalId: input.approval.approvalId,
    externalOperationId: result.externalOperationId,
    status: result.status,
    automaticRollback: false as const,
    executedAt: now,
    summary: result.summary,
  } satisfies Omit<StudioReleaseOperationReceipt, "receiptHash">;
  const receipt: StudioReleaseOperationReceipt = {
    ...receiptBase,
    receiptHash: await sha256(receiptHashInput(receiptBase)),
  };
  if (result.status === "FAILED") {
    return {
      ok: false,
      value: receipt,
      diagnostics: [
        diagnostic("EXTERNAL_OPERATION_FAILED", "executor.result.status", "External operation failed; no automatic rollback was attempted."),
      ],
    };
  }
  return success(receipt);
}

export function canonicalStudioReleaseOperationJson(value: unknown): string {
  return canonicalJson(value);
}
