import { asSha256, sha256 } from "../../src/game/game-300/core.ts";
import {
  createStudioOperationalObservation,
  createStudioRollbackPlan,
  evaluateStudioOperationalSafety,
} from "../../src/studio/operational-safety.ts";
import {
  createStudioPublishOperationPlan,
  createStudioReleaseApproval,
  createStudioRollbackOperationPlan,
  executeApprovedStudioReleaseOperation,
  type StudioReleaseOperationPlan,
} from "../../src/studio/release-operation.ts";
import {
  STUDIO_READINESS_CHECK_IDS,
  type StudioReadinessReport,
} from "../../src/studio/release-readiness.ts";

const PACKAGE_HASH = asSha256("a".repeat(64));
const RESTORE_HASH = asSha256("b".repeat(64));

function publishIntent() {
  return {
    kind: "STUDIO_PUBLISH_INTENT" as const,
    packageId: "studio:release",
    packageVersion: "1.0.0",
    projectRevisionId: "project:r1",
    packageHash: PACKAGE_HASH,
    requestedBy: "owner:local",
    explicit: true as const,
    note: "External distribution requires a separate approved operation." as const,
  };
}

async function readinessReport(
  target: "STAGING" | "BETA" | "PRODUCTION" = "BETA",
): Promise<StudioReadinessReport> {
  const environment: "STAGING" | "PRODUCTION" = target === "PRODUCTION" ? "PRODUCTION" : "STAGING";
  const decision: "READY_FOR_STAGING" | "READY_FOR_BETA" | "READY_FOR_PRODUCTION" = target === "STAGING"
    ? "READY_FOR_STAGING"
    : target === "BETA"
    ? "READY_FOR_BETA"
    : "READY_FOR_PRODUCTION";
  const checks = STUDIO_READINESS_CHECK_IDS.map((checkId) => ({
    checkId,
    environment,
    status: "PASS" as const,
    evidenceKind: "LIVE_OBSERVATION" as const,
    ...(checkId === "COLLABORATION_2_TO_3" ? { participants: 2 } : {}),
  }));
  const base = {
    schemaVersion: 2 as const,
    decision,
    target,
    packageId: "studio:release",
    packageVersion: "1.0.0",
    projectRevisionId: "project:r1",
    packageHash: PACKAGE_HASH,
    checks,
    untested: [],
  } satisfies Omit<StudioReadinessReport, "evidenceHash">;
  return { ...base, evidenceHash: await sha256(base) };
}

async function approval(operationHash: string, expiresAt = "2026-08-28T01:00:00.000Z") {
  const result = await createStudioReleaseApproval({
    schemaVersion: 1,
    kind: "STUDIO_RELEASE_APPROVAL",
    approvalId: "approval:release-1",
    operationHash: asSha256(operationHash),
    approvedBy: "owner:local",
    approvedAt: "2026-08-28T00:00:00.000Z",
    expiresAt,
    explicit: true,
  });
  if (!result.ok || result.value === undefined) throw new Error(JSON.stringify(result));
  return result.value;
}

Deno.test("STUDIO-050 requires a valid readiness report and creates target-specific plans", async () => {
  const report = await readinessReport("BETA");
  const planned = await createStudioPublishOperationPlan({
    operationId: "operation:beta-1",
    target: "BETA",
    publishIntent: publishIntent(),
    readinessReport: report,
  });
  if (!planned.ok || planned.value === undefined) throw new Error(JSON.stringify(planned));
  if (planned.value.action !== "PROMOTE_BETA" || planned.value.automaticRollback !== false) {
    throw new Error("Beta plan must be explicit and non-automatic.");
  }

  const mismatched = await createStudioPublishOperationPlan({
    operationId: "operation:production-1",
    target: "PRODUCTION",
    publishIntent: publishIntent(),
    readinessReport: report,
  });
  if (
    mismatched.ok ||
    !mismatched.diagnostics.some((item) => item.code === "INVALID_READINESS")
  ) {
    throw new Error("A Beta report must not create a Production operation.");
  }
});

Deno.test("STUDIO-050 executes only after approval and sends metadata-only input", async () => {
  const planned = await createStudioPublishOperationPlan({
    operationId: "operation:stage-1",
    target: "STAGING",
    publishIntent: publishIntent(),
    readinessReport: await readinessReport("STAGING"),
  });
  if (!planned.ok || planned.value === undefined) throw new Error(JSON.stringify(planned));
  const approved = await approval(planned.value.planHash);
  let calls = 0;
  const result = await executeApprovedStudioReleaseOperation({
    plan: planned.value,
    approval: approved,
    now: () => "2026-08-28T00:30:00.000Z",
    executor: {
      execute: async (request) => {
        calls += 1;
        if (request.payload !== "METADATA_ONLY" || "bytes" in request || "pixels" in request) {
          throw new Error("External request must not contain raw payloads.");
        }
        if (request.action !== "DEPLOY_STAGING" || request.idempotencyKey !== "operation:stage-1") {
          throw new Error("External request identity is incorrect.");
        }
        return {
          externalOperationId: "provider:deploy-1",
          status: "SUCCEEDED" as const,
          summary: "Staging deployment verified.",
        };
      },
    },
  });
  if (!result.ok || result.value?.status !== "SUCCEEDED" || calls !== 1) {
    throw new Error(JSON.stringify(result));
  }

  const tampered = {
    ...planned.value,
    packageVersion: "9.9.9",
  } as StudioReleaseOperationPlan;
  const rejected = await executeApprovedStudioReleaseOperation({
    plan: tampered,
    approval: approved,
    now: () => "2026-08-28T00:30:00.000Z",
    executor: {
      execute: async () => {
        calls += 1;
        return {
          externalOperationId: "provider:should-not-run",
          status: "SUCCEEDED" as const,
          summary: "unexpected",
        };
      },
    },
  });
  if (rejected.ok || calls !== 1 || !rejected.diagnostics.some((item) => item.code === "HASH_MISMATCH")) {
    throw new Error("Tampered plans must be rejected before the executor call.");
  }
});

Deno.test("STUDIO-050 rejects expired approval and does not auto-rollback provider failures", async () => {
  const planned = await createStudioPublishOperationPlan({
    operationId: "operation:stage-expired",
    target: "STAGING",
    publishIntent: publishIntent(),
    readinessReport: await readinessReport("STAGING"),
  });
  if (!planned.ok || planned.value === undefined) throw new Error(JSON.stringify(planned));
  const expired = await approval(planned.value.planHash, "2026-08-28T00:10:00.000Z");
  let calls = 0;
  const expiredResult = await executeApprovedStudioReleaseOperation({
    plan: planned.value,
    approval: expired,
    now: () => "2026-08-28T00:30:00.000Z",
    executor: { execute: async () => {
      calls += 1;
      return { externalOperationId: "provider:never", status: "SUCCEEDED" as const, summary: "unexpected" };
    } },
  });
  if (expiredResult.ok || calls !== 0 || !expiredResult.diagnostics.some((item) => item.code === "EXPIRED_APPROVAL")) {
    throw new Error("Expired approval must stop before the external executor.");
  }

  const failedApproval = await approval(planned.value.planHash);
  const failed = await executeApprovedStudioReleaseOperation({
    plan: planned.value,
    approval: failedApproval,
    now: () => "2026-08-28T00:30:00.000Z",
    executor: { execute: async () => ({
      externalOperationId: "provider:failed",
      status: "FAILED" as const,
      summary: "Provider rejected deployment.",
    }) },
  });
  if (failed.ok || failed.value?.status !== "FAILED" || failed.value.automaticRollback !== false || !failed.diagnostics.some((item) => item.code === "EXTERNAL_OPERATION_FAILED")) {
    throw new Error("Provider failure must be reported without an implicit rollback.");
  }
});

Deno.test("STUDIO-050 preserves one idempotency key across an approved retry", async () => {
  const planned = await createStudioPublishOperationPlan({
    operationId: "operation:retry-1",
    target: "STAGING",
    publishIntent: publishIntent(),
    readinessReport: await readinessReport("STAGING"),
  });
  if (!planned.ok || planned.value === undefined) throw new Error(JSON.stringify(planned));
  const approved = await approval(planned.value.planHash);
  const seenKeys = new Set<string>();
  let executorCalls = 0;
  let providerCalls = 0;
  const executor = {
    execute: async (request: { readonly idempotencyKey: string }) => {
      executorCalls += 1;
      if (!seenKeys.has(request.idempotencyKey)) {
        seenKeys.add(request.idempotencyKey);
        providerCalls += 1;
      }
      return {
        externalOperationId: "provider:retry-1",
        status: "SUCCEEDED" as const,
        summary: "Provider replay was idempotent.",
      };
    },
  };
  const first = await executeApprovedStudioReleaseOperation({
    plan: planned.value,
    approval: approved,
    now: () => "2026-08-28T00:30:00.000Z",
    executor,
  });
  const second = await executeApprovedStudioReleaseOperation({
    plan: planned.value,
    approval: approved,
    now: () => "2026-08-28T00:31:00.000Z",
    executor,
  });
  if (
    !first.ok || !second.ok || first.value?.externalOperationId !== second.value?.externalOperationId ||
    executorCalls !== 2 || providerCalls !== 1
  ) {
    throw new Error(JSON.stringify({ first, second, executorCalls, providerCalls }));
  }
});

Deno.test("STUDIO-050 creates and executes a rollback operation only from ROLLBACK_REQUIRED", async () => {
  const observation = await createStudioOperationalObservation({
    schemaVersion: 1,
    environment: "STAGING",
    packageHash: PACKAGE_HASH,
    sourceIdentity: "observed:staging:release-operation",
    capturedAt: "2026-08-28T00:00:00.000Z",
    performance: {
      profileId: "2D_BROWSER",
      status: "OVER_BUDGET",
      missingMetrics: [],
      violations: [{ metric: "steadyFrameMs", actual: 40, budget: 16.67 }],
    },
    monitoring: { errorCount: 0, realtimeFailureCount: 0, storageFailureCount: 0, alertCount: 0 },
    rateLimit: { windowMs: 1_000, maxOperations: 100, observedOperations: 1 },
  });
  const rollback = await createStudioRollbackPlan({
    schemaVersion: 1,
    kind: "STUDIO_ROLLBACK_PLAN",
    environment: "STAGING",
    currentPackageHash: PACKAGE_HASH,
    restorePackageHash: RESTORE_HASH,
    restoreRevisionId: "project:r0",
    reason: "Restore the last healthy revision.",
    execution: "APPROVED_EXTERNAL_OPERATION_REQUIRED",
    dataPlane: "UNCHANGED",
  });
  if (!rollback.ok || rollback.value === undefined) throw new Error(JSON.stringify(rollback));
  const safety = await evaluateStudioOperationalSafety({
    observation,
    expectedPackageHash: PACKAGE_HASH,
    rollbackPlan: rollback.value,
  });
  if (!safety.ok || safety.value === undefined || safety.value.decision !== "ROLLBACK_REQUIRED") {
    throw new Error(JSON.stringify(safety));
  }
  const planned = await createStudioRollbackOperationPlan({
    operationId: "operation:rollback-1",
    packageId: "studio:release",
    packageVersion: "1.0.0",
    projectRevisionId: "project:r1",
    rollbackPlan: rollback.value,
    operationalEvaluation: safety.value,
  });
  if (!planned.ok || planned.value === undefined) throw new Error(JSON.stringify(planned));
  const approved = await approval(planned.value.planHash);
  let rollbackCalls = 0;
  const result = await executeApprovedStudioReleaseOperation({
    plan: planned.value,
    approval: approved,
    now: () => "2026-08-28T00:30:00.000Z",
    executor: { execute: async (request) => {
      rollbackCalls += 1;
      if (request.action !== "ROLLBACK" || request.restorePackageHash !== RESTORE_HASH || request.payload !== "METADATA_ONLY") {
        throw new Error("Rollback request identity is incorrect.");
      }
      return { externalOperationId: "provider:rollback-1", status: "SUCCEEDED" as const, summary: "Previous revision restored." };
    } },
  });
  if (!result.ok || result.value?.action !== "ROLLBACK" || rollbackCalls !== 1) {
    throw new Error(JSON.stringify(result));
  }
});

Deno.test("STUDIO-050 fails closed for malformed plans and executor receipts", async () => {
  let calls = 0;
  const malformed = await executeApprovedStudioReleaseOperation({
    plan: null as unknown as StudioReleaseOperationPlan,
    approval: null as never,
    executor: { execute: async () => {
      calls += 1;
      return { externalOperationId: "provider:unexpected", status: "SUCCEEDED" as const, summary: "unexpected" };
    } },
    now: () => "2026-08-28T00:30:00.000Z",
  });
  if (malformed.ok || calls !== 0 || !malformed.diagnostics.some((item) => item.code === "INVALID_OPERATION")) {
    throw new Error("Malformed operation input must fail closed before the executor.");
  }

  const planned = await createStudioPublishOperationPlan({
    operationId: "operation:invalid-receipt",
    target: "STAGING",
    publishIntent: publishIntent(),
    readinessReport: await readinessReport("STAGING"),
  });
  if (!planned.ok || planned.value === undefined) throw new Error(JSON.stringify(planned));
  const approved = await approval(planned.value.planHash);
  const invalidReceipt = await executeApprovedStudioReleaseOperation({
    plan: planned.value,
    approval: approved,
    now: () => "2026-08-28T00:30:00.000Z",
    executor: { execute: async () => null as never },
  });
  if (invalidReceipt.ok || !invalidReceipt.diagnostics.some((item) => item.code === "EXECUTOR_FAILED")) {
    throw new Error("Malformed executor receipts must fail closed.");
  }
});
