/**
 * STUDIO-040 operational safety boundary.
 *
 * This module evaluates an already captured runtime observation. It does not
 * collect telemetry, change a feature flag, execute a rollback, or call a
 * provider. Missing or unhealthy observations remain a HOLD/ROLLBACK result so
 * a local contract cannot be mistaken for production monitoring evidence.
 */

import { canonicalJson, type Sha256, sha256 } from "../game/game-300/core.ts";
import type {
  GameRuntimePerformanceEvaluation,
  GameRuntimePerformanceProfileId,
} from "../game/game-350/runtime-performance.ts";

export const STUDIO_OPERATIONAL_SAFETY_SCHEMA_VERSION = 1 as const;

export type StudioOperationalEnvironment = "STAGING" | "PRODUCTION";
export type StudioOperationalDecision =
  | "ALLOW"
  | "HOLD"
  | "ROLLBACK_REQUIRED";

export type StudioOperationalAlertCode =
  | "PERFORMANCE_INCOMPLETE"
  | "PERFORMANCE_OVER_BUDGET"
  | "RUNTIME_ERRORS"
  | "REALTIME_FAILURES"
  | "STORAGE_FAILURES"
  | "MONITORING_ALERTS"
  | "RATE_LIMIT_EXCEEDED";

export interface StudioOperationalMonitoringSample {
  readonly errorCount: number;
  readonly realtimeFailureCount: number;
  readonly storageFailureCount: number;
  readonly alertCount: number;
}

export interface StudioOperationalRateLimitSample {
  readonly windowMs: number;
  readonly maxOperations: number;
  readonly observedOperations: number;
}

export interface StudioOperationalObservation {
  readonly schemaVersion: typeof STUDIO_OPERATIONAL_SAFETY_SCHEMA_VERSION;
  readonly environment: StudioOperationalEnvironment;
  readonly packageHash: Sha256;
  readonly sourceIdentity: string;
  readonly capturedAt: string;
  readonly performance: GameRuntimePerformanceEvaluation;
  readonly monitoring: StudioOperationalMonitoringSample;
  readonly rateLimit: StudioOperationalRateLimitSample;
  readonly observationHash: Sha256;
}

export interface StudioRollbackPlan {
  readonly schemaVersion: typeof STUDIO_OPERATIONAL_SAFETY_SCHEMA_VERSION;
  readonly kind: "STUDIO_ROLLBACK_PLAN";
  readonly environment: StudioOperationalEnvironment;
  readonly currentPackageHash: Sha256;
  readonly restorePackageHash: Sha256;
  readonly restoreRevisionId: string;
  readonly reason: string;
  readonly execution: "APPROVED_EXTERNAL_OPERATION_REQUIRED";
  readonly dataPlane: "UNCHANGED";
  readonly planHash: Sha256;
}

export interface StudioOperationalAlert {
  readonly code: StudioOperationalAlertCode;
  readonly path: string;
  readonly message: string;
}

export interface StudioOperationalEvaluation {
  readonly schemaVersion: typeof STUDIO_OPERATIONAL_SAFETY_SCHEMA_VERSION;
  readonly decision: StudioOperationalDecision;
  readonly packageHash: Sha256;
  readonly observationHash: Sha256;
  readonly alerts: readonly StudioOperationalAlert[];
  readonly rollbackPlan?: StudioRollbackPlan;
  readonly evaluationHash: Sha256;
}

export type StudioOperationalDiagnosticCode =
  | "UNSUPPORTED_SCHEMA"
  | "INVALID_ENVIRONMENT"
  | "INVALID_HASH"
  | "INVALID_SOURCE"
  | "INVALID_CAPTURE_TIME"
  | "INVALID_PERFORMANCE"
  | "INVALID_MONITORING"
  | "INVALID_RATE_LIMIT"
  | "HASH_MISMATCH"
  | "IDENTITY_MISMATCH"
  | "INVALID_ROLLBACK_PLAN"
  | "ROLLBACK_IDENTITY_MISMATCH";

export interface StudioOperationalDiagnostic {
  readonly code: StudioOperationalDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export interface StudioOperationalResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly diagnostics: readonly StudioOperationalDiagnostic[];
}

const PERFORMANCE_PROFILE_IDS: readonly GameRuntimePerformanceProfileId[] = [
  "2D_BROWSER",
  "2D_MOBILE",
];

function success<T>(value: T): StudioOperationalResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(
  ...diagnostics: StudioOperationalDiagnostic[]
): StudioOperationalResult<T> {
  return { ok: false, diagnostics };
}

function diagnostic(
  code: StudioOperationalDiagnosticCode,
  path: string,
  message: string,
): StudioOperationalDiagnostic {
  return { code, path, message };
}

function isEnvironment(value: unknown): value is StudioOperationalEnvironment {
  return value === "STAGING" || value === "PRODUCTION";
}

function validHash(value: unknown): value is Sha256 {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function stable(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return nonNegativeInteger(value) && value > 0;
}

function observationHashInput(
  observation: Omit<StudioOperationalObservation, "observationHash">,
): unknown {
  return {
    schemaVersion: observation.schemaVersion,
    environment: observation.environment,
    packageHash: observation.packageHash,
    sourceIdentity: observation.sourceIdentity,
    capturedAt: observation.capturedAt,
    performance: observation.performance,
    monitoring: observation.monitoring,
    rateLimit: observation.rateLimit,
  };
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

function evaluationHashInput(
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

/** Create a tamper-evident observation; this performs no collection. */
export async function createStudioOperationalObservation(
  observation: Omit<StudioOperationalObservation, "observationHash">,
): Promise<StudioOperationalObservation> {
  return {
    ...observation,
    observationHash: await sha256(observationHashInput(observation)),
  };
}

/** Create a rollback description; execution remains an approved external operation. */
export async function createStudioRollbackPlan(
  plan: Omit<StudioRollbackPlan, "planHash">,
): Promise<StudioOperationalResult<StudioRollbackPlan>> {
  const diagnostics: StudioOperationalDiagnostic[] = [];
  if (!isEnvironment(plan.environment)) {
    diagnostics.push(
      diagnostic(
        "INVALID_ENVIRONMENT",
        "environment",
        "Rollback environment is unsupported.",
      ),
    );
  }
  if (!validHash(plan.currentPackageHash)) {
    diagnostics.push(
      diagnostic(
        "INVALID_HASH",
        "currentPackageHash",
        "Current Package hash must be a SHA-256 value.",
      ),
    );
  }
  if (!validHash(plan.restorePackageHash)) {
    diagnostics.push(
      diagnostic(
        "INVALID_HASH",
        "restorePackageHash",
        "Restore Package hash must be a SHA-256 value.",
      ),
    );
  }
  if (plan.currentPackageHash === plan.restorePackageHash) {
    diagnostics.push(
      diagnostic(
        "INVALID_ROLLBACK_PLAN",
        "restorePackageHash",
        "Rollback must target a different Package hash.",
      ),
    );
  }
  if (!stable(plan.restoreRevisionId)) {
    diagnostics.push(
      diagnostic(
        "INVALID_ROLLBACK_PLAN",
        "restoreRevisionId",
        "Restore Revision identity must be stable.",
      ),
    );
  }
  if (
    typeof plan.reason !== "string" || plan.reason.length < 1 ||
    plan.reason.length > 240
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_ROLLBACK_PLAN",
        "reason",
        "Rollback reason must contain 1 to 240 characters.",
      ),
    );
  }
  if (plan.kind !== "STUDIO_ROLLBACK_PLAN") {
    diagnostics.push(
      diagnostic(
        "INVALID_ROLLBACK_PLAN",
        "kind",
        "Rollback kind is unsupported.",
      ),
    );
  }
  if (plan.execution !== "APPROVED_EXTERNAL_OPERATION_REQUIRED") {
    diagnostics.push(
      diagnostic(
        "INVALID_ROLLBACK_PLAN",
        "execution",
        "Rollback execution must remain an approved external operation.",
      ),
    );
  }
  if (plan.dataPlane !== "UNCHANGED") {
    diagnostics.push(
      diagnostic(
        "INVALID_ROLLBACK_PLAN",
        "dataPlane",
        "Rollback must preserve the data plane.",
      ),
    );
  }
  if (diagnostics.length > 0) return failure(...diagnostics);
  return success({
    ...plan,
    planHash: await sha256(rollbackPlanHashInput(plan)),
  });
}

async function validateRollbackPlan(
  plan: StudioRollbackPlan,
): Promise<readonly StudioOperationalDiagnostic[]> {
  const created = await createStudioRollbackPlan(
    Object.fromEntries(
      Object.entries(plan).filter(([key]) => key !== "planHash"),
    ) as Omit<StudioRollbackPlan, "planHash">,
  );
  if (!created.ok || created.value === undefined) return created.diagnostics;
  return created.value.planHash === plan.planHash
    ? []
    : [
      diagnostic(
        "HASH_MISMATCH",
        "rollbackPlan.planHash",
        "Rollback plan hash does not match its canonical contents.",
      ),
    ];
}

async function validateObservation(
  observation: StudioOperationalObservation,
): Promise<readonly StudioOperationalDiagnostic[]> {
  const diagnostics: StudioOperationalDiagnostic[] = [];
  if (observation.schemaVersion !== STUDIO_OPERATIONAL_SAFETY_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        "UNSUPPORTED_SCHEMA",
        "observation.schemaVersion",
        "Operational observation schema is unsupported.",
      ),
    );
  }
  if (!isEnvironment(observation.environment)) {
    diagnostics.push(
      diagnostic(
        "INVALID_ENVIRONMENT",
        "observation.environment",
        "Operational observation environment is unsupported.",
      ),
    );
  }
  if (!validHash(observation.packageHash)) {
    diagnostics.push(
      diagnostic(
        "INVALID_HASH",
        "observation.packageHash",
        "Operational observation Package hash must be a SHA-256 value.",
      ),
    );
  }
  if (!validHash(observation.observationHash)) {
    diagnostics.push(
      diagnostic(
        "INVALID_HASH",
        "observation.observationHash",
        "Operational observation hash must be a SHA-256 value.",
      ),
    );
  }
  if (!stable(observation.sourceIdentity)) {
    diagnostics.push(
      diagnostic(
        "INVALID_SOURCE",
        "observation.sourceIdentity",
        "Operational observation source identity must be stable.",
      ),
    );
  }
  if (!Number.isFinite(Date.parse(observation.capturedAt))) {
    diagnostics.push(
      diagnostic(
        "INVALID_CAPTURE_TIME",
        "observation.capturedAt",
        "Operational observation capture time is invalid.",
      ),
    );
  }
  const performance = observation.performance;
  if (
    performance === null || typeof performance !== "object" ||
    !PERFORMANCE_PROFILE_IDS.includes(performance.profileId) ||
    (performance.status !== "WITHIN_BUDGET" &&
      performance.status !== "OVER_BUDGET" &&
      performance.status !== "INCOMPLETE") ||
    !Array.isArray(performance.missingMetrics) ||
    !Array.isArray(performance.violations)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PERFORMANCE",
        "observation.performance",
        "Operational observation performance evaluation is invalid.",
      ),
    );
  }
  const monitoring = observation.monitoring;
  if (
    monitoring === null || typeof monitoring !== "object" ||
    !nonNegativeInteger(monitoring.errorCount) ||
    !nonNegativeInteger(monitoring.realtimeFailureCount) ||
    !nonNegativeInteger(monitoring.storageFailureCount) ||
    !nonNegativeInteger(monitoring.alertCount)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_MONITORING",
        "observation.monitoring",
        "Operational monitoring counters must be non-negative safe integers.",
      ),
    );
  }
  const rateLimit = observation.rateLimit;
  if (
    rateLimit === null || typeof rateLimit !== "object" ||
    !positiveInteger(rateLimit.windowMs) ||
    !positiveInteger(rateLimit.maxOperations) ||
    !nonNegativeInteger(rateLimit.observedOperations)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_RATE_LIMIT",
        "observation.rateLimit",
        "Rate-limit values must use positive windows/limits and a non-negative observation count.",
      ),
    );
  }
  if (diagnostics.length > 0) return diagnostics;
  const { observationHash, ...base } = observation;
  if (observationHash !== await sha256(observationHashInput(base))) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "observation.observationHash",
        "Operational observation hash does not match its canonical contents.",
      ),
    );
  }
  return diagnostics;
}

function alert(
  code: StudioOperationalAlertCode,
  path: string,
  message: string,
): StudioOperationalAlert {
  return { code, path, message };
}

/** Evaluate a captured observation; this never executes the resulting action. */
export async function evaluateStudioOperationalSafety(input: {
  readonly observation: StudioOperationalObservation;
  readonly expectedPackageHash: Sha256;
  readonly rollbackPlan?: StudioRollbackPlan;
}): Promise<StudioOperationalResult<StudioOperationalEvaluation>> {
  const diagnostics = [
    ...await validateObservation(input.observation),
  ];
  if (!validHash(input.expectedPackageHash)) {
    diagnostics.push(
      diagnostic(
        "INVALID_HASH",
        "expectedPackageHash",
        "Expected Package hash must be a SHA-256 value.",
      ),
    );
  } else if (input.observation.packageHash !== input.expectedPackageHash) {
    diagnostics.push(
      diagnostic(
        "IDENTITY_MISMATCH",
        "observation.packageHash",
        "Operational observation belongs to another Studio Package.",
      ),
    );
  }
  if (input.rollbackPlan !== undefined) {
    diagnostics.push(...await validateRollbackPlan(input.rollbackPlan));
    if (input.rollbackPlan.environment !== input.observation.environment) {
      diagnostics.push(
        diagnostic(
          "ROLLBACK_IDENTITY_MISMATCH",
          "rollbackPlan.environment",
          "Rollback plan environment must match the observation.",
        ),
      );
    }
    if (input.rollbackPlan.currentPackageHash !== input.observation.packageHash) {
      diagnostics.push(
        diagnostic(
          "ROLLBACK_IDENTITY_MISMATCH",
          "rollbackPlan.currentPackageHash",
          "Rollback plan must start from the observed Package hash.",
        ),
      );
    }
  }
  if (diagnostics.length > 0) return failure(...diagnostics);

  const observation = input.observation;
  const alerts: StudioOperationalAlert[] = [];
  if (observation.performance.status === "INCOMPLETE") {
    alerts.push(
      alert(
        "PERFORMANCE_INCOMPLETE",
        "observation.performance",
        "Runtime performance evidence is incomplete; release must be held.",
      ),
    );
  } else if (observation.performance.status === "OVER_BUDGET") {
    alerts.push(
      alert(
        "PERFORMANCE_OVER_BUDGET",
        "observation.performance",
        "Runtime performance exceeded its selected budget.",
      ),
    );
  }
  if (observation.monitoring.errorCount > 0) {
    alerts.push(
      alert(
        "RUNTIME_ERRORS",
        "observation.monitoring.errorCount",
        "Runtime errors were observed during the capture window.",
      ),
    );
  }
  if (observation.monitoring.realtimeFailureCount > 0) {
    alerts.push(
      alert(
        "REALTIME_FAILURES",
        "observation.monitoring.realtimeFailureCount",
        "Realtime failures were observed during the capture window.",
      ),
    );
  }
  if (observation.monitoring.storageFailureCount > 0) {
    alerts.push(
      alert(
        "STORAGE_FAILURES",
        "observation.monitoring.storageFailureCount",
        "Storage failures were observed during the capture window.",
      ),
    );
  }
  if (observation.monitoring.alertCount > 0) {
    alerts.push(
      alert(
        "MONITORING_ALERTS",
        "observation.monitoring.alertCount",
        "Monitoring raised one or more alerts during the capture window.",
      ),
    );
  }
  if (observation.rateLimit.observedOperations > observation.rateLimit.maxOperations) {
    alerts.push(
      alert(
        "RATE_LIMIT_EXCEEDED",
        "observation.rateLimit.observedOperations",
        "The observed operation count exceeded the configured rate limit.",
      ),
    );
  }
  const decision: StudioOperationalDecision = alerts.length === 0
    ? "ALLOW"
    : input.rollbackPlan === undefined
      ? "HOLD"
      : "ROLLBACK_REQUIRED";
  const evaluationBase = {
    schemaVersion: STUDIO_OPERATIONAL_SAFETY_SCHEMA_VERSION,
    decision,
    packageHash: observation.packageHash,
    observationHash: observation.observationHash,
    alerts,
    ...(input.rollbackPlan === undefined
      ? {}
      : { rollbackPlan: input.rollbackPlan }),
  };
  return success({
    ...evaluationBase,
    evaluationHash: await sha256(evaluationHashInput(evaluationBase)),
  });
}

export function canonicalStudioOperationalSafetyJson(value: unknown): string {
  return canonicalJson(value);
}
