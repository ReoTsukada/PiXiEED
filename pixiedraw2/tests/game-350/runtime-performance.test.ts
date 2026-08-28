import {
  GAME_RUNTIME_PERFORMANCE_PROFILES,
  evaluateGameRuntimePerformance,
  resolveGameRuntimePerformanceProfile,
  sumLoadedRuntimeAssetBytes,
} from "../../src/game/game-350/runtime-performance.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME-350 selects a mobile profile without changing the Runtime boundary", () => {
  assert(resolveGameRuntimePerformanceProfile({ screenWidth: 390, touch: true }).profileId === "2D_MOBILE", "touch devices must use the mobile 2D guardrail");
  assert(resolveGameRuntimePerformanceProfile({ screenWidth: 1280, touch: false }).profileId === "2D_BROWSER", "desktop browser must use the browser 2D guardrail");
  assert(resolveGameRuntimePerformanceProfile({ screenWidth: 390, touch: true, requestedProfileId: "2D_BROWSER" }).profileId === "2D_BROWSER", "an explicit profile must be honored for controlled testing");
});

Deno.test("GAME-350 reports incomplete measurements instead of treating them as a pass", () => {
  const result = evaluateGameRuntimePerformance(GAME_RUNTIME_PERFORMANCE_PROFILES["2D_BROWSER"], { startupMs: 600 });
  assert(result.status === "INCOMPLETE", "partial measurements must not be accepted as within budget");
  assert(result.missingMetrics.includes("memoryBytes") && result.missingMetrics.includes("decodedBytes"), "missing memory metrics must be visible to the caller");
});

Deno.test("GAME-350 identifies budget violations and sums loaded bytes", () => {
  const result = evaluateGameRuntimePerformance(GAME_RUNTIME_PERFORMANCE_PROFILES["2D_MOBILE"], {
    startupMs: 1900,
    sceneLoadMs: 100,
    firstFrameMs: 100,
    steadyFrameMs: 10,
    memoryBytes: 1024,
    assetBytes: 1024,
    decodedBytes: 1024,
    longTaskCount: 0,
  });
  assert(result.status === "OVER_BUDGET" && result.violations.some((item) => item.metric === "startupMs"), "startup overage must block the budget judgement");
  assert(sumLoadedRuntimeAssetBytes({ player: { byteLength: 128 }, theme: { byteLength: 256 } }) === 384, "loaded dependency bytes must be measurable without decoding the assets");
});
