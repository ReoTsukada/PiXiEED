import { asSha256 } from "../../src/game/game-300/core.ts";
import { evaluateStudioOperationalSafety } from "../../src/studio/operational-safety.ts";
import {
  beginStudioRuntimeObservation,
  createStudioBrowserRuntimeObservationHost,
} from "../../src/studio/runtime-observation.ts";

const PACKAGE_HASH = asSha256("a".repeat(64));

function browserProfile() {
  return {
    schemaVersion: 1 as const,
    profileId: "2D_BROWSER" as const,
    label: "2D Browser",
    budget: {
      startupMs: 1_200,
      sceneLoadMs: 800,
      firstFrameMs: 500,
      steadyFrameMs: 16.67,
      memoryBytes: 256 * 1024 * 1024,
      assetBytes: 32 * 1024 * 1024,
      decodedBytes: 96 * 1024 * 1024,
      maxLongTasks: 2,
    },
  };
}

Deno.test("STUDIO-040 collects complete browser-like runtime evidence", async () => {
  let now = 0;
  const host = {
    now: () => now,
    memoryBytes: () => 4 * 1024 * 1024,
    longTaskCount: () => 0,
  };
  const session = beginStudioRuntimeObservation({
    environment: "STAGING",
    packageHash: PACKAGE_HASH,
    sourceIdentity: "observed:staging:runtime-040",
    capturedAt: "2026-08-28T00:00:00.000Z",
    profile: browserProfile(),
    host,
    rateLimit: { windowMs: 1_000, maxOperations: 120 },
  });

  now = 100;
  session.markStartupReady();
  now = 180;
  session.markSceneReady();
  now = 190;
  session.markFirstFrame();
  session.recordSteadyFrame(8);
  session.recordSteadyFrame(12);
  session.recordAsset({ assetId: "sprite:player", byteLength: 100, decodedBytes: 200 });
  session.recordAsset({ assetId: "audio:theme", byteLength: 300, decodedBytes: 500 });
  session.markAssetsMeasured();
  session.recordOperation(4);

  const observation = await session.finish();
  if (observation.performance.status !== "WITHIN_BUDGET") {
    throw new Error(JSON.stringify(observation.performance));
  }
  if (observation.performance.missingMetrics.length !== 0) {
    throw new Error("The complete observation must contain every performance metric.");
  }
  const evaluation = await evaluateStudioOperationalSafety({
    observation,
    expectedPackageHash: PACKAGE_HASH,
  });
  if (!evaluation.ok || evaluation.value?.decision !== "ALLOW") {
    throw new Error(JSON.stringify(evaluation));
  }
  if (
    observation.monitoring.errorCount !== 0 ||
    observation.rateLimit.observedOperations !== 4
  ) {
    throw new Error("Runtime counters must stay bounded and exact.");
  }
  if (await session.finish() !== observation) {
    throw new Error("finish must be idempotent for one capture session.");
  }
});

Deno.test("STUDIO-040 keeps missing host measurements incomplete and records failures", async () => {
  let now = 0;
  const session = beginStudioRuntimeObservation({
    environment: "STAGING",
    packageHash: PACKAGE_HASH,
    sourceIdentity: "observed:staging:runtime-040-incomplete",
    capturedAt: "2026-08-28T00:00:00.000Z",
    profile: browserProfile(),
    host: { now: () => now },
    rateLimit: { windowMs: 1_000, maxOperations: 1 },
  });
  now = 10;
  session.markStartupReady();
  session.recordSteadyFrame(20);
  session.recordRuntimeError();
  session.recordRealtimeFailure(2);
  session.recordStorageFailure();
  session.recordMonitoringAlert();
  session.recordOperation(2);
  const observation = await session.finish();
  if (observation.performance.status !== "OVER_BUDGET") {
    throw new Error("A measured frame over budget must be visible.");
  }
  const result = await evaluateStudioOperationalSafety({
    observation,
    expectedPackageHash: PACKAGE_HASH,
  });
  if (!result.ok || result.value?.decision !== "HOLD") {
    throw new Error(JSON.stringify(result));
  }
  if (result.value.alerts.length !== 6) {
    throw new Error(`Expected six safety alerts, got ${result.value.alerts.length}.`);
  }
});

Deno.test("STUDIO-040 browser adapter reads memory and Long Task counters", () => {
  const source = {
    performance: {
      now: () => 42,
      memory: { usedJSHeapSize: 1234 },
    },
    getLongTaskCount: () => 2,
  };
  const host = createStudioBrowserRuntimeObservationHost(source);
  if (host.now() !== 42 || host.memoryBytes?.() !== 1234 || host.longTaskCount?.() !== 2) {
    throw new Error("Browser performance values must be forwarded without mutation.");
  }
});
