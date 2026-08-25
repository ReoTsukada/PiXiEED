/** Lazy Game authoring/build entry. No DOM, current route, Market, or production adapter. */
export {
  createGameBuildPlan,
  createGameBuildRecord,
  createGameRuntimeArtifactManifest,
  attachVerifiedGameArtifact,
  transitionGameBuild,
  recoverGameBuild,
  canExecuteGameArtifact,
  artifactManifestIsImmutable,
  validateGameBuildRequest,
  createArtifactIdentity,
} from "./wp200-game-build-pipeline.ts";
export {
  createGameProjectRevision,
  validateGameProject,
  createGameRuntimePreview,
  loadGameRuntimeAssets,
  stepGameRuntime,
  stopGameRuntime,
  safeGameHotReload,
  serializeGameRuntimeSaveState,
  restoreGameRuntimeSaveState,
  gameAssetRequests,
  gameInputActionMapToRuntime,
  createGameDependencySnapshot,
  gameRuntimeStateFingerprint,
  isGameAssetReference,
} from "./wp200-game-runtime-core.ts";
export type * from "./wp200-game-runtime-core.ts";
export type * from "./wp200-game-build-pipeline.ts";
