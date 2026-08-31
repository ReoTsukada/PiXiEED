import { asSha256 } from "../../src/game/game-300/core.ts";
import {
  createStudioOperationalObservation,
  createStudioRollbackPlan,
  evaluateStudioOperationalSafety,
  type StudioOperationalObservation,
} from "../../src/studio/operational-safety.ts";

const PACKAGE_HASH = asSha256("a".repeat(64));

function performance(
  status: "WITHIN_BUDGET" | "OVER_BUDGET" | "INCOMPLETE",
) {
  return {
    profileId: "2D_BROWSER" as const,
    status,
    missingMetrics: status === "INCOMPLETE" ? ["steadyFrameMs" as const] : [],
    violations: status === "OVER_BUDGET"
      ? [{ metric: "steadyFrameMs" as const, actual: 40, budget: 16.67 }]
      : [],
  };
}

async function observation(
  status: "WITHIN_BUDGET" | "OVER_BUDGET" | "INCOMPLETE" =
    "WITHIN_BUDGET",
  overrides: Partial<Omit<StudioOperationalObservation, "observationHash">> =
    {},
) {
  return await createStudioOperationalObservation({
    schemaVersion: 1,
    environment: "STAGING",
    packageHash: PACKAGE_HASH,
    sourceIdentity: "observed:staging:studio-040",
    capturedAt: "2026-08-28T00:00:00.000Z",
    performance: performance(status),
    monitoring: {
      errorCount: 0,
      realtimeFailureCount: 0,
      storageFailureCount: 0,
      alertCount: 0,
    },
    rateLimit: {
      windowMs: 1_000,
      maxOperations: 100,
      observedOperations: 40,
    },
    ...overrides,
  });
}

Deno.test("STUDIO-040 allows a complete healthy observation", async () => {
  const result = await evaluateStudioOperationalSafety({
    observation: await observation(),
    expectedPackageHash: PACKAGE_HASH,
  });
  if (!result.ok || result.value?.decision !== "ALLOW") {
    throw new Error(JSON.stringify(result));
  }
  if (result.value.alerts.length !== 0) {
    throw new Error("Healthy observation must not create operational alerts.");
  }
});

Deno.test("STUDIO-040 holds incomplete, unhealthy, and rate-limited observations", async () => {
  const unhealthy = await observation("INCOMPLETE", {
    monitoring: {
      errorCount: 1,
      realtimeFailureCount: 2,
      storageFailureCount: 1,
      alertCount: 1,
    },
    rateLimit: {
      windowMs: 1_000,
      maxOperations: 100,
      observedOperations: 101,
    },
  });
  const result = await evaluateStudioOperationalSafety({
    observation: unhealthy,
    expectedPackageHash: PACKAGE_HASH,
  });
  if (!result.ok || result.value?.decision !== "HOLD") {
    throw new Error(JSON.stringify(result));
  }
  const codes = result.value.alerts.map((item) => item.code).join(",");
  if (
    codes !==
      "PERFORMANCE_INCOMPLETE,RUNTIME_ERRORS,REALTIME_FAILURES,STORAGE_FAILURES,MONITORING_ALERTS,RATE_LIMIT_EXCEEDED"
  ) {
    throw new Error(`Unexpected operational alerts: ${codes}`);
  }
});

Deno.test("STUDIO-040 requires a valid rollback plan before rollback is requested", async () => {
  const unhealthy = await observation("OVER_BUDGET");
  const plan = await createStudioRollbackPlan({
    schemaVersion: 1,
    kind: "STUDIO_ROLLBACK_PLAN",
    environment: "STAGING",
    currentPackageHash: PACKAGE_HASH,
    restorePackageHash: asSha256("b".repeat(64)),
    restoreRevisionId: "revision:previous",
    reason: "Restore the last observed healthy revision.",
    execution: "APPROVED_EXTERNAL_OPERATION_REQUIRED",
    dataPlane: "UNCHANGED",
  });
  if (!plan.ok || plan.value === undefined) {
    throw new Error(JSON.stringify(plan));
  }
  const result = await evaluateStudioOperationalSafety({
    observation: unhealthy,
    expectedPackageHash: PACKAGE_HASH,
    rollbackPlan: plan.value,
  });
  if (!result.ok || result.value?.decision !== "ROLLBACK_REQUIRED") {
    throw new Error(JSON.stringify(result));
  }

  const tampered = { ...plan.value, reason: "changed after approval" };
  const tamperedResult = await evaluateStudioOperationalSafety({
    observation: unhealthy,
    expectedPackageHash: PACKAGE_HASH,
    rollbackPlan: tampered,
  });
  if (
    tamperedResult.ok ||
    !tamperedResult.diagnostics.some((item) => item.code === "HASH_MISMATCH")
  ) {
    throw new Error("Tampered rollback plans must fail closed.");
  }
});

Deno.test("STUDIO-040 rejects package identity and invalid rate-limit claims", async () => {
  const sample = await observation();
  const wrongPackage = await evaluateStudioOperationalSafety({
    observation: sample,
    expectedPackageHash: asSha256("c".repeat(64)),
  });
  if (
    wrongPackage.ok ||
    !wrongPackage.diagnostics.some((item) => item.code === "IDENTITY_MISMATCH")
  ) {
    throw new Error("Operational observations must be package-bound.");
  }

  const invalid = await observation("WITHIN_BUDGET", {
    rateLimit: {
      windowMs: 0,
      maxOperations: 100,
      observedOperations: 1,
    },
  });
  const invalidResult = await evaluateStudioOperationalSafety({
    observation: invalid,
    expectedPackageHash: PACKAGE_HASH,
  });
  if (
    invalidResult.ok ||
    !invalidResult.diagnostics.some((item) => item.code === "INVALID_RATE_LIMIT")
  ) {
    throw new Error("Invalid rate-limit claims must fail closed.");
  }
});
