/**
 * Game Runtime performance guardrails.
 *
 * These profiles are policy budgets for deciding when a measurement is safe to
 * ship, not production benchmark results. A missing measurement is reported as
 * incomplete so a local or synthetic check cannot be mistaken for acceptance.
 */

export const GAME_RUNTIME_PERFORMANCE_SCHEMA_VERSION = 1 as const;

export type GameRuntimePerformanceProfileId = "2D_BROWSER" | "2D_MOBILE";

export interface GameRuntimePerformanceBudget {
  readonly startupMs: number;
  readonly sceneLoadMs: number;
  readonly firstFrameMs: number;
  readonly steadyFrameMs: number;
  readonly memoryBytes: number;
  readonly assetBytes: number;
  readonly decodedBytes: number;
  readonly maxLongTasks: number;
}

export interface GameRuntimePerformanceProfile {
  readonly schemaVersion: typeof GAME_RUNTIME_PERFORMANCE_SCHEMA_VERSION;
  readonly profileId: GameRuntimePerformanceProfileId;
  readonly label: string;
  readonly budget: GameRuntimePerformanceBudget;
}

export const GAME_RUNTIME_PERFORMANCE_PROFILES: Readonly<Record<GameRuntimePerformanceProfileId, GameRuntimePerformanceProfile>> = Object.freeze({
  "2D_BROWSER": Object.freeze({
    schemaVersion: GAME_RUNTIME_PERFORMANCE_SCHEMA_VERSION,
    profileId: "2D_BROWSER",
    label: "2D Browser",
    budget: Object.freeze({
      startupMs: 1200,
      sceneLoadMs: 800,
      firstFrameMs: 500,
      steadyFrameMs: 16.67,
      memoryBytes: 256 * 1024 * 1024,
      assetBytes: 32 * 1024 * 1024,
      decodedBytes: 96 * 1024 * 1024,
      maxLongTasks: 2,
    }),
  }),
  "2D_MOBILE": Object.freeze({
    schemaVersion: GAME_RUNTIME_PERFORMANCE_SCHEMA_VERSION,
    profileId: "2D_MOBILE",
    label: "2D Mobile",
    budget: Object.freeze({
      startupMs: 1800,
      sceneLoadMs: 1200,
      firstFrameMs: 800,
      steadyFrameMs: 20,
      memoryBytes: 128 * 1024 * 1024,
      assetBytes: 12 * 1024 * 1024,
      decodedBytes: 48 * 1024 * 1024,
      maxLongTasks: 1,
    }),
  }),
});

export interface ResolveGameRuntimePerformanceProfileOptions {
  readonly screenWidth: number;
  readonly touch: boolean;
  readonly requestedProfileId?: GameRuntimePerformanceProfileId;
}

export function resolveGameRuntimePerformanceProfile(options: ResolveGameRuntimePerformanceProfileOptions): GameRuntimePerformanceProfile {
  if (options.requestedProfileId !== undefined) return GAME_RUNTIME_PERFORMANCE_PROFILES[options.requestedProfileId];
  return options.screenWidth < 768 || (options.touch && options.screenWidth < 900)
    ? GAME_RUNTIME_PERFORMANCE_PROFILES["2D_MOBILE"]
    : GAME_RUNTIME_PERFORMANCE_PROFILES["2D_BROWSER"];
}

export interface GameRuntimePerformanceSample {
  readonly startupMs?: number;
  readonly sceneLoadMs?: number;
  readonly firstFrameMs?: number;
  readonly steadyFrameMs?: number;
  readonly memoryBytes?: number;
  readonly assetBytes?: number;
  readonly decodedBytes?: number;
  readonly longTaskCount?: number;
}

export type GameRuntimePerformanceMetric = keyof GameRuntimePerformanceBudget;

export interface GameRuntimePerformanceViolation {
  readonly metric: GameRuntimePerformanceMetric;
  readonly actual: number;
  readonly budget: number;
}

export type GameRuntimePerformanceStatus = "WITHIN_BUDGET" | "OVER_BUDGET" | "INCOMPLETE";

export interface GameRuntimePerformanceEvaluation {
  readonly profileId: GameRuntimePerformanceProfileId;
  readonly status: GameRuntimePerformanceStatus;
  readonly missingMetrics: readonly GameRuntimePerformanceMetric[];
  readonly violations: readonly GameRuntimePerformanceViolation[];
}

const PERFORMANCE_METRICS: readonly GameRuntimePerformanceMetric[] = [
  "startupMs",
  "sceneLoadMs",
  "firstFrameMs",
  "steadyFrameMs",
  "memoryBytes",
  "assetBytes",
  "decodedBytes",
  "maxLongTasks",
];

export function evaluateGameRuntimePerformance(
  profile: GameRuntimePerformanceProfile,
  sample: GameRuntimePerformanceSample,
): GameRuntimePerformanceEvaluation {
  const missingMetrics: GameRuntimePerformanceMetric[] = [];
  const violations: GameRuntimePerformanceViolation[] = [];
  for (const metric of PERFORMANCE_METRICS) {
    const sampleMetric = metric === "maxLongTasks" ? sample.longTaskCount : sample[metric];
    if (sampleMetric === undefined) {
      missingMetrics.push(metric);
      continue;
    }
    const budget = profile.budget[metric];
    if (!Number.isFinite(sampleMetric) || sampleMetric < 0 || sampleMetric > budget) {
      violations.push({ metric, actual: sampleMetric, budget });
    }
  }
  const status: GameRuntimePerformanceStatus = violations.length > 0
    ? "OVER_BUDGET"
    : missingMetrics.length > 0
      ? "INCOMPLETE"
      : "WITHIN_BUDGET";
  return { profileId: profile.profileId, status, missingMetrics, violations };
}

export function sumLoadedRuntimeAssetBytes(assets: Readonly<Record<string, { readonly byteLength: number }>>): number {
  return Object.values(assets).reduce((total, asset) => total + (Number.isSafeInteger(asset.byteLength) && asset.byteLength >= 0 ? asset.byteLength : 0), 0);
}
