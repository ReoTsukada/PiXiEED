/** Runtime-only WP-200 entry. It must not import Game Editor, Build UI, Draw2, or Audio UI. */
export {
  createGameRuntimePreview,
  loadGameRuntimeAssets,
  loadGameRuntimeSceneAssets,
  stepGameRuntime,
  stopGameRuntime,
  safeGameHotReload,
  serializeGameRuntimeSaveState,
  restoreGameRuntimeSaveState,
  gameAssetRequests,
  gameAssetRequestsForScene,
  gameInputActionMapToRuntime,
  gameRuntimeStateFingerprint,
} from "./wp200-game-runtime-core.ts";
export {
  GAME_RUNTIME_PERFORMANCE_PROFILES,
  evaluateGameRuntimePerformance,
  resolveGameRuntimePerformanceProfile,
  sumLoadedRuntimeAssetBytes,
} from "./game/game-350/runtime-performance.ts";
export type {
  GameRuntimePerformanceBudget,
  GameRuntimePerformanceEvaluation,
  GameRuntimePerformanceMetric,
  GameRuntimePerformanceProfile,
  GameRuntimePerformanceProfileId,
  GameRuntimePerformanceSample,
  GameRuntimePerformanceStatus,
  GameRuntimePerformanceViolation,
  ResolveGameRuntimePerformanceProfileOptions,
} from "./game/game-350/runtime-performance.ts";
export type {
  CreateGameRuntimeOptions,
  GameAssetReference,
  GameInputActionMap,
  GameProjectRevision,
  GameProjectRevisionInput,
  GameRuntimeFeature,
  GameRuntimeFeatureFlags,
  GameRuntimeSaveState,
  GameRuntimeSession,
  GameStepResult,
  GameHotReloadResult,
} from "./wp200-game-runtime-core.ts";
