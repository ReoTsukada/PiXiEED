/** Lazy Game authoring/build entry. No DOM, current route, Market, or production adapter. */
export {
  artifactManifestIsImmutable,
  attachVerifiedGameArtifact,
  canExecuteGameArtifact,
  createArtifactIdentity,
  createGameBuildPlan,
  createGameBuildRecord,
  createGameRuntimeArtifactManifest,
  recoverGameBuild,
  transitionGameBuild,
  validateGameBuildRequest,
} from "./wp200-game-build-pipeline.ts";
export {
  createGameDependencySnapshot,
  createGameProjectRevision,
  createGameRuntimePreview,
  gameAssetRequests,
  gameAssetRequestsForScene,
  gameInputActionMapToRuntime,
  gameRuntimeStateFingerprint,
  isGameAssetReference,
  loadGameRuntimeAssets,
  loadGameRuntimeSceneAssets,
  restoreGameRuntimeSaveState,
  safeGameHotReload,
  serializeGameRuntimeSaveState,
  stepGameRuntime,
  stopGameRuntime,
  validateGameProject,
} from "./wp200-game-runtime-core.ts";
export type * from "./wp200-game-runtime-core.ts";
export type * from "./wp200-game-build-pipeline.ts";
export {
  evaluateGameRuntimePerformance,
  GAME_RUNTIME_PERFORMANCE_PROFILES,
  resolveGameRuntimePerformanceProfile,
  sumLoadedRuntimeAssetBytes,
} from "./game/game-350/runtime-performance.ts";
export type * from "./game/game-350/runtime-performance.ts";
export {
  admitIGameExternalBuild,
  createIGamePlayerManifest,
  createIGamePlayerSession,
  IGAME_EXTERNAL_BUILD_TARGETS,
  igameExternalBuildResourceId,
  isIGameExternalBuildTarget,
  resolveIGamePlayerAccess,
} from "./game/game-350/igame-player-contract.ts";
export type * from "./game/game-350/igame-player-contract.ts";
export {
  completeIGameBrandSplash,
  createIGameRuntimeLaunchConfig,
  createIGameRuntimeLaunchState,
  isIGamePlayerRuntimeSource,
  PIXIEED_BRAND_SPLASH_DURATION_MS,
  startIGameRuntime,
  stopIGameRuntime,
} from "./game/game-350/runtime-launch.ts";
export type * from "./game/game-350/runtime-launch.ts";
export {
  buildSceneHierarchy,
  deleteEntity,
  duplicateEntity,
  flattenSceneHierarchy,
  GAME350_PREFAB_DESIGN_GATE,
  rejectPrefabOperation,
  renameEntity,
  reparentEntity,
  setEntityActive,
  validateSceneHierarchy,
  validateScenePrefabReferences,
} from "./game/game-350/scene-graph.ts";
export type * from "./game/game-350/scene-graph.ts";
export {
  advancePhysics2D,
  colliderAABB,
  createPhysics2DWorld,
  DEFAULT_PHYSICS_2D_SETTINGS,
  GAME350_PHYSICS_LAYER_BITS,
  normalizePhysics2DSettings,
  stepPhysics2D,
  validatePhysics2DSettings,
} from "./game/game-350/physics-2d.ts";
export type * from "./game/game-350/physics-2d.ts";
export {
  createGame351Physics2DScene,
  createGame351Physics2DWorld,
  stepGame351Physics2D,
} from "./game/game-350/playable-slice.ts";
export type {
  Game351Physics2DInput,
  Game351Physics2DSceneOptions,
} from "./game/game-350/playable-slice.ts";
export {
  clearGameTilemapCell,
  createDefaultRpgTilemapDocument,
  createGameTilemapDocument,
  GAME350_TILEMAP_MAX_CELLS,
  GAME350_TILEMAP_MAX_HEIGHT,
  GAME350_TILEMAP_MAX_WIDTH,
  gameTilemapCellAt,
  paintGameTilemapCell,
  setGameTilemapCell,
  solidGameTilemapCells,
  triggerGameTilemapCells,
  validateGameTilemapDocument,
} from "./game/game-350/tilemap-authoring.ts";
export type * from "./game/game-350/tilemap-authoring.ts";
export {
  applyGameTemplate,
  gameTemplateCategoryLabel,
  gameTemplateKindLabel,
  getGameTemplate,
  getGameTemplates,
  removeGameTemplateInstance,
  validateGameTemplateDefinition,
  validateGameTemplateValues,
} from "./game/game-350/template-registry.ts";
export type * from "./game/game-350/template-registry.ts";
export {
  behaviorFromGameEventCard,
  defaultGameEventCardsForRuntimeFamily,
  GAME_EVENT_ACTION_OPTIONS,
  GAME_EVENT_CONDITION_OPTIONS,
  GAME_EVENT_WHO_OPTIONS,
  GAME_RUNTIME_FAMILY_LABELS,
  GAME_SCENE_GRAVITY_OPTIONS,
  GAME_SCENE_RULE_LABELS,
  GAME_SCENE_RULE_PRESETS,
  normalizeGameSceneRules,
  physics2DSettingsForSceneRules,
  sceneRulesForCreationMode,
  sceneRulesForRuntimeFamily,
  sceneRulesSummary,
} from "./game/game-350/authoring-model.ts";
export type * from "./game/game-350/authoring-model.ts";
export {
  clearGameGenreDialogue,
  createGameGenreRuntime,
  playGameGenre,
  restartGameGenre,
  stepGameGenre,
  stopGameGenre,
  triggerGameGenreCameraShake,
} from "./game/game-350/genre-runtime.ts";
export type * from "./game/game-350/genre-runtime.ts";
