import {
  asAssetId,
  asAssetRevisionId,
  asGameProjectId,
  asPackageId,
  asSha256,
  type DependencyLockEntry,
  type RuntimeCapabilityProfile,
} from "../src/wp160-contracts.ts";
import {
  createGameDependencySnapshot,
  createGameProjectRevision,
  createGameRuntimePreview,
  loadGameRuntimeAssets,
  loadGameRuntimeSceneAssets,
  restoreGameRuntimeSaveState,
  safeGameHotReload,
  serializeGameRuntimeSaveState,
  stepGameRuntime,
  gameAssetRequestsForScene,
  type GameProjectRevisionInput,
  type GameRuntimeFeatureFlags,
} from "../src/wp200-game-runtime-core.ts";
import {
  artifactManifestIsImmutable,
  attachVerifiedGameArtifact,
  canExecuteGameArtifact,
  createArtifactIdentity,
  createGameBuildRecord,
  recoverGameBuild,
  transitionGameBuild,
  validateGameBuildRequest,
  type GameBuildRequest,
} from "../src/wp200-game-build-pipeline.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const HASH_DRAW = asSha256("a".repeat(64));
const HASH_AUDIO = asSha256("b".repeat(64));
const HASH_PACKAGE = asSha256("c".repeat(64));
const capabilities: RuntimeCapabilityProfile = {
  pointer: true,
  touch: true,
  keyboard: true,
  mouse: true,
  gamepad: true,
  screenWidth: 1280,
  screenHeight: 900,
  devicePixelRatio: 1,
  audio: true,
  graphics: "CANVAS2D",
  webGpuBenefitMeasured: false,
  reducedMotion: false,
};
const enabledFlags: GameRuntimeFeatureFlags = {
  "game-core-read": true,
  "game-core-write": true,
  "runtime-preview": true,
  "runtime-execution": true,
  "game-build": true,
};

function dependencyEntry(assetId: string, revisionId: string, hash: typeof HASH_DRAW, mimeType: string, mode: DependencyLockEntry["mode"] = "PINNED"): DependencyLockEntry {
  return { assetId: asAssetId(assetId), revisionId: asAssetRevisionId(revisionId), contentHash: hash, byteLength: 128, mimeType, mode, required: true };
}

async function projectFixture(overrides: Partial<GameProjectRevisionInput> = {}) {
  const entries = [
    dependencyEntry("draw/player", "draw-rev-1", HASH_DRAW, "image/png"),
    dependencyEntry("audio/theme", "audio-rev-1", HASH_AUDIO, "audio/ogg"),
  ];
  const dependencies = await createGameDependencySnapshot("game-package", "1.0.0", entries);
  const input: GameProjectRevisionInput = {
    schemaVersion: 1,
    projectId: asGameProjectId("game-project"),
    revisionId: "game-rev-1",
    packageId: asPackageId("game-package"),
    packageVersion: "1.0.0",
    name: "Fixture Game",
    scenes: [{
      sceneId: "scene-main",
      name: "Main",
      rootEntityIds: ["entity-player"],
      entities: [{
        entityId: "entity-player",
        name: "Player",
        components: [
          { type: "TRANSFORM", componentId: "component-transform", x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          { type: "SPRITE", componentId: "component-sprite", asset: { kind: "DRAW", assetId: asAssetId("draw/player"), revisionId: asAssetRevisionId("draw-rev-1"), contentHash: HASH_DRAW, byteLength: 128, mimeType: "image/png", mode: "PINNED", provenance: "DRAW2" }, visible: true },
          { type: "AUDIO_SOURCE", componentId: "component-audio", asset: { kind: "AUDIO", assetId: asAssetId("audio/theme"), revisionId: asAssetRevisionId("audio-rev-1"), contentHash: HASH_AUDIO, byteLength: 128, mimeType: "audio/ogg", mode: "PINNED", provenance: "PIXIAUDIO" }, loop: true, volume: 0.5 },
          { type: "CONTROL", componentId: "component-control", actionId: "action-jump" },
        ],
      }],
    }],
    inputMap: { actions: [{ actionId: "action-jump", label: "Jump", bindings: [{ action: "jump", source: "KEYBOARD", code: "Space" }, { action: "jump", source: "TOUCH", code: "primary" }] }] },
    behaviors: [{ behaviorId: "behavior-jump", version: 1, rules: [{ trigger: "ACTION", actionId: "action-jump", operations: [{ operation: "ADD_VALUE", key: "score", value: 1 }] }] }],
    dependencies,
    buildProfile: { target: "PIXIEED_NATIVE_WEB_RUNTIME", runtimeVersion: "0.2.0", capabilityProfile: "desktop", optimization: "RELEASE" },
    ...overrides,
  };
  return createGameProjectRevision(input);
}

async function previewFixture(project?: Awaited<ReturnType<typeof projectFixture>>) {
  const resolvedProject = project ?? await projectFixture();
  return createGameRuntimePreview({
    project: resolvedProject,
    previewId: "preview-game-wp200",
    runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.2.0", supportedManifestVersion: 1 },
    supportedRuntimeVersion: "0.2.0",
    capabilities,
    flags: enabledFlags,
    killSwitch: false,
  });
}

function buildRequest(project: Awaited<ReturnType<typeof projectFixture>>, flags: GameRuntimeFeatureFlags = enabledFlags): GameBuildRequest {
  return {
    requestId: "game-build-wp200",
    project,
    packageHash: HASH_PACKAGE,
    configuration: { version: "1.0.0" as GameBuildRequest["configuration"]["version"], optimization: "RELEASE", compression: "BROTLI", capabilityProfile: "desktop", toolchainVersion: "wp200-fixture" },
    runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.2.0", supportedManifestVersion: 1 },
    flags,
    killSwitch: false,
  };
}

Deno.test("WP-200 creates deterministic Game Project revisions with Draw/Audio references", async () => {
  const first = await projectFixture();
  const second = await projectFixture();
  assert(first.snapshotHash === second.snapshotHash, "same Game Project input must hash deterministically");
  assert(first.scenes[0]?.entities[0]?.components.some((component) => component.type === "SPRITE"), "Draw reference must be part of the Game Project");
  assert(first.scenes[0]?.entities[0]?.components.some((component) => component.type === "AUDIO_SOURCE"), "Audio reference must be part of the Game Project");
});

Deno.test("WP-200 Runtime Preview is flag-gated, maps controls, and keeps runtime save state separate", async () => {
  const project = await projectFixture();
  const session = await previewFixture(project);
  assert(session.recovery === "VALID" && session.runtime.running, "explicit preview flag should allow isolated Runtime Preview");
  assert(session.performanceProfile.profileId === "2D_BROWSER", "Runtime Preview must retain the selected 2D performance guardrail");
  const stepped = stepGameRuntime(session, 16, [{ source: "KEYBOARD", code: "Space", phase: "DOWN" }]);
  assert(stepped.actions[0] === "jump" && stepped.session.runtimeValues.score === 1, "semantic input must execute the bounded behavior");
  const loaded = await loadGameRuntimeAssets(session, { resolve: async (request) => request.assetId === asAssetId("draw/player")
    ? { assetId: asAssetId("draw/player"), revisionId: asAssetRevisionId("draw-rev-1"), contentHash: HASH_DRAW, byteLength: 128, mimeType: "image/png" }
    : { assetId: asAssetId("audio/theme"), revisionId: asAssetRevisionId("audio-rev-1"), contentHash: HASH_AUDIO, byteLength: 128, mimeType: "audio/ogg" } });
  assert(Object.keys(loaded.runtime.loadedAssets).length === 2, "locked Draw and Audio references must resolve lazily through the Runtime boundary");
  const save = await serializeGameRuntimeSaveState(stepped.session);
  const restored = await restoreGameRuntimeSaveState({ ...stepped.session, runtimeValues: {} }, save);
  assert(restored.restored && restored.session.runtimeValues.score === 1, "Runtime save state must restore without mutating Project state");
  const blocked = await previewFixture(project);
  const off = await createGameRuntimePreview({ ...({ project, previewId: "preview-off", runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.2.0", supportedManifestVersion: 1 }, supportedRuntimeVersion: "0.2.0", capabilities, flags: {}, killSwitch: false }) });
  assert(!off.runtime.running && off.diagnostics.some((item) => item.code === "UNSUPPORTED_CAPABILITY"), "unknown/off preview flag must fail closed");
  assert(blocked.runtime.projectRevisionId === "game-rev-1", "preview must retain the source revision reference");
});

Deno.test("WP-200 resolves only the selected Scene and does not request an already loaded asset twice", async () => {
  const baseProject = await projectFixture();
  const project = await projectFixture({
    scenes: [
      ...baseProject.scenes,
      { sceneId: "scene-empty", name: "Empty", rootEntityIds: [], entities: [] },
    ],
  });
  assert(gameAssetRequestsForScene(project, "scene-empty").length === 0, "an empty Scene must not pull references from another Scene");
  assert(gameAssetRequestsForScene(project, "scene-main").length === 2, "the selected Scene must expose only its own Draw/Audio references");
  const session = await previewFixture(project);
  const resolveCount = { value: 0 };
  const resolver = {
    resolve: async (request: { readonly assetId: string }) => {
      resolveCount.value += 1;
      return request.assetId === asAssetId("draw/player")
        ? { assetId: asAssetId("draw/player"), revisionId: asAssetRevisionId("draw-rev-1"), contentHash: HASH_DRAW, byteLength: 128, mimeType: "image/png" }
        : { assetId: asAssetId("audio/theme"), revisionId: asAssetRevisionId("audio-rev-1"), contentHash: HASH_AUDIO, byteLength: 128, mimeType: "audio/ogg" };
    },
  };
  const empty = await loadGameRuntimeSceneAssets(session, "scene-empty", resolver);
  assert(resolveCount.value === 0 && Object.keys(empty.runtime.loadedAssets).length === 0, "loading an empty Scene must remain lazy");
  const loaded = await loadGameRuntimeSceneAssets(session, "scene-main", resolver);
  const loadedAgain = await loadGameRuntimeSceneAssets(loaded, "scene-main", resolver);
  assert(Number(resolveCount.value) === 2 && Object.keys(loadedAgain.runtime.loadedAssets).length === 2, "the second load must reuse the locked asset payloads");
});

Deno.test("WP-200 hot reload accepts compatible revisions and recovers from PINNED incompatibility", async () => {
  const session = await previewFixture();
  const compatibleProject = await projectFixture({ revisionId: "game-rev-2" });
  const compatible = safeGameHotReload(session, compatibleProject);
  assert(compatible.accepted && compatible.session.runtime.projectRevisionId === "game-rev-2", "compatible revision update must preserve the Runtime session");
  const incompatibleBase = await projectFixture();
  const incompatibleProject = await projectFixture({
    revisionId: "game-rev-3",
    dependencies: await createGameDependencySnapshot("game-package", "1.0.0", [dependencyEntry("draw/player", "draw-rev-2", HASH_DRAW, "image/png"), dependencyEntry("audio/theme", "audio-rev-1", HASH_AUDIO, "audio/ogg")]),
    scenes: incompatibleBase.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => ({ ...entity, components: entity.components.map((component) => component.type === "SPRITE" ? { ...component, asset: { ...component.asset, revisionId: asAssetRevisionId("draw-rev-2") } } : component) })) })),
  });
  const incompatible = safeGameHotReload(session, incompatibleProject);
  assert(!incompatible.accepted && incompatible.session.recovery === "RECOVERED", "changed PINNED dependency must reject and recover to the previous valid session");
});

Deno.test("WP-200 Build Plan includes deterministic project/package/runtime provenance and verified artifact", async () => {
  const project = await projectFixture();
  const request = buildRequest(project);
  assert(validateGameBuildRequest(request).length === 0, "valid locked project should pass the isolated Build boundary");
  const first = await createGameBuildRecord(request);
  const second = await createGameBuildRecord(request);
  assert(first.lifecycle === "PLANNED" && first.plan?.cacheKey === second.plan?.cacheKey, "identical locked Build inputs must produce the same plan/cache key");
  const verifying = transitionGameBuild(transitionGameBuild(transitionGameBuild(first, "VALIDATING"), "BUILDING"), "VERIFYING");
  const artifact = createArtifactIdentity({ buildArtifactId: "game-artifact-wp200", sourcePackageId: project.packageId, sourcePackageVersion: project.packageVersion, dependencySnapshotHash: project.dependencies.snapshotHash, buildTarget: project.buildProfile.target, buildConfigurationVersion: request.configuration.version, runtimeVersion: request.runtime.runtimeVersion, artifactHash: HASH_PACKAGE, byteLength: 2048, verificationState: "VERIFIED", createdAt: "2026-08-09T00:00:00.000Z", buildProvenance: "wp200-fixture" });
  const ready = attachVerifiedGameArtifact(verifying, artifact, { assetsResolved: true, revisionsLocked: true, hashesVerified: true, compatibilityVerified: true, permissionsVerified: true, integrityVerified: true, runtimeSmokeVerified: true });
  assert(ready.lifecycle === "READY" && ready.artifact !== undefined && canExecuteGameArtifact(ready.artifact), "only verified artifact provenance may be executable");
  assert(artifactManifestIsImmutable(ready.artifact, { ...ready.artifact }), "Runtime Artifact manifest must be immutable");
});

Deno.test("WP-200 rejects LIVE Build references, unsafe inputs, and keeps default flags fail-closed", async () => {
  const baseProject = await projectFixture();
  const liveProject = await projectFixture({
    dependencies: await createGameDependencySnapshot("game-package", "1.0.0", [dependencyEntry("draw/player", "draw-rev-1", HASH_DRAW, "image/png", "LIVE"), dependencyEntry("audio/theme", "audio-rev-1", HASH_AUDIO, "audio/ogg")]),
    scenes: baseProject.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => ({ ...entity, components: entity.components.map((component) => component.type === "SPRITE" ? { ...component, asset: { ...component.asset, mode: "LIVE" as const } } : component) })) })),
  });
  const request = buildRequest(liveProject, { ...enabledFlags, "game-build": false });
  const diagnostics = validateGameBuildRequest({ ...request, security: { archivePaths: ["../secret"], externalUrls: ["https://outside.invalid"], activeContentMimeTypes: ["application/javascript"], authorized: false } });
  assert(diagnostics.some((item) => item.code === "UNSUPPORTED_CAPABILITY"), "default-off Build must be unavailable");
  assert(diagnostics.some((item) => item.code === "BUILD_INVALID_REQUEST"), "LIVE dependency must be rejected for Build");
  assert(diagnostics.some((item) => item.code === "SECURITY_POLICY_REJECTED"), "unsafe Build inputs must be rejected");
  const failed = await createGameBuildRecord(request);
  const recovered = recoverGameBuild(failed);
  assert(recovered.recovered && recovered.retryAllowed && recovered.record.lifecycle === "FAILED", "failed Build must remain recoverable without promotion");
  let cycleRejected = false;
  try {
    await projectFixture({ scenes: [{ sceneId: "scene-main", name: "Cycle", rootEntityIds: ["entity-player"], entities: [{ entityId: "entity-player", name: "Cycle", parentEntityId: "entity-player", components: [] }] }] });
  } catch { cycleRejected = true; }
  assert(cycleRejected, "Entity parent cycle must be rejected before Build");
});
