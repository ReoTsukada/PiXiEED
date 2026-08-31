import {
  asAssetId,
  asAssetRevisionId,
  asGameProjectId,
  asPackageId,
  asSha256 as asRuntimeHash,
  type ContentHash,
} from "../../src/wp160-contracts.ts";
import { createDependencySnapshot, type RuntimeAssetPayload } from "../../src/wp160-game-runtime-core.ts";
import { asSha256 as asGameHash } from "../../src/game/game-300/core.ts";
import {
  createGameProjectRevision,
  createGameRuntimePreview,
  loadGameRuntimeAssets,
  type GameAssetReference,
  type GameProjectRevision,
  type GameRuntimeSession,
} from "../../src/wp200-game-runtime-core.ts";
import {
  createGame350AssetRegistryAdapter,
  createRuntimeLifecycleController,
  createGame350RuntimeSnapshot,
  prepareGame350Composition,
  resolveRuntimeIdentity,
  runtimeAssetCacheKey,
  type ResolvedGame350Asset,
} from "../../src/game/game-350/runtime-qualification.ts";
import type { CanonicalAssetRevision } from "../../src/game/game-340/core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const DRAW_HASH = asRuntimeHash("a".repeat(64));
const AUDIO_HASH = asRuntimeHash("b".repeat(64));
const WRONG_HASH = asRuntimeHash("c".repeat(64));
const projectId = asGameProjectId("game-project");
const packageId = asPackageId("game-package");
const drawId = asAssetId("draw/player");
const audioId = asAssetId("audio/theme");
const drawRevision = asAssetRevisionId("draw-rev-1");
const audioRevision = asAssetRevisionId("audio-rev-1");

const drawReference: GameAssetReference = {
  kind: "DRAW",
  assetId: drawId,
  revisionId: drawRevision,
  contentHash: DRAW_HASH,
  byteLength: 128,
  mimeType: "image/png",
  mode: "PINNED",
  provenance: "DRAW2",
};

const audioReference: GameAssetReference = {
  kind: "AUDIO",
  assetId: audioId,
  revisionId: audioRevision,
  contentHash: AUDIO_HASH,
  byteLength: 256,
  mimeType: "audio/ogg",
  mode: "PINNED",
  provenance: "PIXIAUDIO",
};

const authority: readonly CanonicalAssetRevision[] = [
  { projectId: String(projectId), ownerId: "game-owner", kind: "DRAW", assetId: String(drawId), revisionId: String(drawRevision), contentHash: asGameHash(String(DRAW_HASH)), licenseId: "license-draw", permission: "READ", reviewStatus: "APPROVED" },
  { projectId: String(projectId), ownerId: "game-owner", kind: "AUDIO", assetId: String(audioId), revisionId: String(audioRevision), contentHash: asGameHash(String(AUDIO_HASH)), licenseId: "license-audio", permission: "READ", reviewStatus: "APPROVED" },
];

interface QualificationFixture {
  readonly project: GameProjectRevision;
  readonly draw: GameAssetReference;
  readonly audio: GameAssetReference;
}

async function fixture(): Promise<QualificationFixture> {
  const dependencies = await createDependencySnapshot(packageId, "1.0.0", [
    { assetId: drawId, revisionId: drawRevision, contentHash: DRAW_HASH, byteLength: 128, mimeType: "image/png", mode: "PINNED", required: true },
    { assetId: audioId, revisionId: audioRevision, contentHash: AUDIO_HASH, byteLength: 256, mimeType: "audio/ogg", mode: "PINNED", required: true },
  ], true);
  const project = await createGameProjectRevision({
    schemaVersion: 1,
    projectId,
    revisionId: "game-rev-1",
    packageId,
    packageVersion: "1.0.0",
    name: "GAME-350 Fixture",
    scenes: [{
      sceneId: "scene-main",
      name: "Main",
      rootEntityIds: ["player"],
      entities: [{
        entityId: "player",
        name: "Player",
        components: [
          { type: "SPRITE", componentId: "player-sprite", asset: drawReference, visible: true },
          { type: "AUDIO_SOURCE", componentId: "theme-source", asset: audioReference, loop: true, volume: 1 },
        ],
      }],
    }],
    inputMap: { actions: [{ actionId: "jump", label: "Jump", bindings: [{ action: "jump", source: "KEYBOARD", code: "Space" }] }] },
    behaviors: [],
    dependencies,
    buildProfile: { target: "PIXIEED_NATIVE_WEB_RUNTIME", runtimeVersion: "1.0.0", capabilityProfile: "browser", optimization: "DEBUG" },
  });
  return { project, draw: drawReference, audio: audioReference };
}

function diagnosticCode(result: { readonly diagnostics: readonly { readonly code: string }[] }): string | undefined {
  return result.diagnostics[0]?.code;
}

function capabilities() {
  return { pointer: true, touch: true, keyboard: true, mouse: true, gamepad: false, screenWidth: 1280, screenHeight: 900, devicePixelRatio: 1, audio: true, graphics: "CANVAS2D" as const, webGpuBenefitMeasured: false, reducedMotion: false };
}

async function runtimeSession(project: GameProjectRevision): Promise<GameRuntimeSession> {
  return createGameRuntimePreview({
    project,
    previewId: "preview-game-350",
    runtime: { runtimeId: "pixieed-runtime", runtimeVersion: "1.0.0", supportedManifestVersion: 1 },
    supportedRuntimeVersion: "1.0.0",
    capabilities: capabilities(),
    flags: { "game-core-read": true, "runtime-preview": true, "runtime-execution": true },
    killSwitch: false,
    renderer: "CANVAS2D",
  });
}

function payload(reference: GameAssetReference, hash: ContentHash = reference.contentHash): RuntimeAssetPayload {
  return { assetId: reference.assetId, revisionId: reference.revisionId, contentHash: hash, byteLength: reference.byteLength, mimeType: reference.mimeType };
}

Deno.test("GAME350-RUNTIME-IDENTITY rejects missing, foreign, stale, malformed, and unmapped claims", async () => {
  const { project } = await fixture();
  assert(diagnosticCode(resolveRuntimeIdentity({ project: null, projectId: String(projectId), sceneId: "scene-main" })) === "MISSING_PROJECT", "missing project must fail closed");
  assert(diagnosticCode(resolveRuntimeIdentity({ project, projectId: "foreign-project", sceneId: "scene-main" })) === "WRONG_PROJECT", "foreign project must fail closed");
  assert(diagnosticCode(resolveRuntimeIdentity({ project, projectId: String(projectId), sceneId: "missing-scene" })) === "MISSING_SCENE", "missing scene must fail closed");
  assert(diagnosticCode(resolveRuntimeIdentity({ project, projectId: String(projectId), sceneId: "scene-main", entityId: "foreign-entity" })) === "WRONG_ENTITY", "foreign entity must fail closed");
  const malformed = { ...project, dependencies: { ...project.dependencies, locked: false } } as GameProjectRevision;
  assert(diagnosticCode(resolveRuntimeIdentity({ project: malformed, projectId: String(projectId), sceneId: "scene-main" })) === "INVALID_MANIFEST", "unlocked manifest must fail closed");
  const unsupportedBehavior = { ...project, behaviors: [{ behaviorId: "behavior-1", version: 1 as const, rules: [{ trigger: "ACTION" as const, actionId: "missing-action", operations: [] }] }] } as GameProjectRevision;
  assert(diagnosticCode(resolveRuntimeIdentity({ project: unsupportedBehavior, projectId: String(projectId), sceneId: "scene-main" })) === "UNSUPPORTED_BEHAVIOR", "unknown behavior action must fail closed");
  const unknownInput = { ...project, scenes: [{ ...project.scenes[0]!, entities: [{ ...project.scenes[0]!.entities[0]!, components: [{ type: "CONTROL" as const, componentId: "player-control", actionId: "missing-action" }] }] }] } as GameProjectRevision;
  assert(diagnosticCode(resolveRuntimeIdentity({ project: unknownInput, projectId: String(projectId), sceneId: "scene-main" })) === "UNKNOWN_INPUT_MAPPING", "unknown input mapping must fail closed");
  const valid = resolveRuntimeIdentity({ project, projectId: String(projectId), sceneId: "scene-main", entityId: "player" });
  assert(valid.ok, "canonical identity must resolve");
});

Deno.test("GAME350-RUNTIME-ADAPTER binds Draw and Audio through the canonical GAME-340 authority", async () => {
  const { draw, audio } = await fixture();
  const adapter = createGame350AssetRegistryAdapter(authority);
  const context = { projectId: String(projectId), ownerId: "game-owner", revisionId: "game-rev-1", licenseByAsset: { [String(draw.assetId)]: "license-draw", [String(audio.assetId)]: "license-audio" } };
  const live = adapter.resolve({ ...draw, mode: "LIVE", revisionId: asAssetRevisionId("caller-stale"), contentHash: WRONG_HASH }, context);
  assert(live.ok && live.value?.revisionId === String(drawRevision), "LIVE must resolve the canonical current revision");
  const pinned = adapter.resolve(draw, context);
  assert(pinned.ok && pinned.value?.mode === "PINNED", "PINNED Draw must resolve");
  const audioResult = adapter.resolve(audio, context);
  assert(audioResult.ok && audioResult.value?.kind === "AUDIO", "Audio must use the same adapter boundary");
  const stale = adapter.resolve({ ...draw, revisionId: asAssetRevisionId("stale-revision") }, context);
  assert(diagnosticCode(stale) === "REVISION_MISMATCH", "stale PINNED revision must fail closed");
  const wrongHash = adapter.resolve({ ...draw, contentHash: WRONG_HASH }, context);
  assert(diagnosticCode(wrongHash) === "HASH_MISMATCH", "wrong PINNED hash must fail closed");
  const missingAudio = adapter.resolve(audio, { ...context, licenseByAsset: {} });
  assert(diagnosticCode(missingAudio) === "INVALID_MANIFEST", "caller cannot supply an unregistered license");
  const foreignProject = adapter.resolve(draw, { ...context, projectId: "foreign-project" });
  assert(diagnosticCode(foreignProject) === "PROJECT_ASSET_MISMATCH", "foreign Project context must fail closed");
  assert(runtimeAssetCacheKey(draw) !== runtimeAssetCacheKey({ ...draw, mode: "LIVE" }), "LIVE and PINNED cache keys must not collide");
});

Deno.test("GAME350-RUNTIME-PREPARED resolves Draw/Animation/Audio once and snapshots never resolve", async () => {
  const { project, draw, audio } = await fixture();
  const projectWithAnimation = {
    ...project,
    scenes: [{
      ...project.scenes[0]!,
      entities: [{
        ...project.scenes[0]!.entities[0]!,
        components: [...project.scenes[0]!.entities[0]!.components, { type: "ANIMATION" as const, componentId: "player-animation", asset: draw, clipId: "idle", loop: true }],
      }],
    }],
  };
  let resolveCalls = 0;
  const base = createGame350AssetRegistryAdapter(authority);
  const adapter = { ...base, resolve(reference: GameAssetReference, context: Parameters<typeof base.resolve>[1]) { resolveCalls += 1; return base.resolve(reference, context); } };
  const prepared = prepareGame350Composition({ project: projectWithAnimation, ownerId: "game-owner", sceneId: "scene-main", entityId: "player", adapter, licenseByAsset: { [String(draw.assetId)]: "license-draw", [String(audio.assetId)]: "license-audio" } });
  assert(prepared.ok && prepared.value?.assets.length === 3, "composition must resolve Sprite, Animation, and Audio references");
  assert(resolveCalls === 3, "composition boundary must call adapter once per reference");
  const snapshot = createGame350RuntimeSnapshot(prepared.value!);
  assert(snapshot.resolvedAssetCount === 3 && resolveCalls === 3, "runtime snapshot must use prepared assets without Registry resolution");
  createGame350RuntimeSnapshot(prepared.value!, 1);
  assert(resolveCalls === 3, "repeated runtime snapshots must not resolve assets");
});

Deno.test("GAME350-RUNTIME-CACHE is bounded, identity-scoped, and cleanable", async () => {
  const { draw } = await fixture();
  const adapter = createGame350AssetRegistryAdapter(authority, { maxCacheEntries: 1 });
  const context = { projectId: String(projectId), ownerId: "game-owner", revisionId: "game-rev-1", licenseByAsset: { [String(draw.assetId)]: "license-draw" } };
  assert(adapter.resolve(draw, context).ok, "first cache entry should resolve");
  assert(adapter.cacheSnapshot().size === 1, "cache should contain one entry");
  const live = adapter.resolve({ ...draw, mode: "LIVE" }, context);
  assert(live.ok && adapter.cacheSnapshot().size === 1, "LIVE must use a distinct bounded slot and evict the oldest entry");
  assert(adapter.clearProject(String(projectId), "game-owner") === 1 && adapter.cacheSnapshot().size === 0, "project cleanup must clear scoped entries");
  adapter.resolve(draw, context);
  adapter.clear();
  assert(adapter.cacheSnapshot().size === 0, "clear must remove all entries");
});

Deno.test("GAME350-RUNTIME-CACHE invalidates LIVE on current revision change while PINNED stays strict", async () => {
  const { draw } = await fixture();
  const authorityWithRevision = [...authority];
  const adapter = createGame350AssetRegistryAdapter(authorityWithRevision);
  const context = { projectId: String(projectId), ownerId: "game-owner", revisionId: "game-rev-1", licenseByAsset: { [String(draw.assetId)]: "license-draw" } };
  const liveKey = runtimeAssetCacheKey({ ...draw, mode: "LIVE" }, { projectId: String(projectId), ownerId: "game-owner" });
  assert(liveKey === `${projectId}:game-owner:DRAW:${draw.assetId}:LIVE`, "LIVE key must be identity-only");
  assert(adapter.resolve({ ...draw, mode: "LIVE" }, context).ok, "initial LIVE must resolve");
  authorityWithRevision.push({ ...authorityWithRevision[0]!, revisionId: "draw-rev-2", contentHash: asGameHash("e".repeat(64)) });
  adapter.replaceAuthority(authorityWithRevision);
  const updated = adapter.resolve({ ...draw, mode: "LIVE" }, context);
  assert(updated.ok && updated.value?.revisionId === "draw-rev-2", "LIVE must resolve the new current revision after replacement");
  assert(adapter.cacheSnapshot().size === 1, "revision change must invalidate the old LIVE slot before caching the new result");
  assert(runtimeAssetCacheKey(draw) !== runtimeAssetCacheKey({ ...draw, revisionId: asAssetRevisionId("draw-rev-2"), contentHash: asRuntimeHash("e".repeat(64)) }), "PINNED revision/hash must remain part of its key");
});

Deno.test("GAME350-RUNTIME-FAILURE-001 rejects missing and mismatched Draw/Audio payloads", async () => {
  const { project, draw, audio } = await fixture();
  const valid = await runtimeSession(project);
  const loaded = await loadGameRuntimeAssets(valid, { resolve: async (request) => request.assetId === draw.assetId ? payload(draw) : payload(audio) });
  assert(loaded.runtime.running && Object.keys(loaded.runtime.loadedAssets).length === 2, "valid Draw/Audio payloads must load");
  const missing = await loadGameRuntimeAssets(await runtimeSession(project), { resolve: async (request) => request.assetId === draw.assetId ? payload(draw) : undefined });
  assert(!missing.runtime.running && missing.diagnostics.some((item) => item.code === "MISSING_REQUIRED_ASSET"), "missing required Audio must block Runtime");
  const mismatched = await loadGameRuntimeAssets(await runtimeSession(project), { resolve: async (request) => request.assetId === draw.assetId ? payload(draw, WRONG_HASH) : payload(audio) });
  assert(!mismatched.runtime.running && mismatched.diagnostics.some((item) => item.code === "HASH_MISMATCH"), "wrong Draw hash must block Runtime");
});

Deno.test("GAME350-RUNTIME-LIFECYCLE prevents duplicate instances and cleans up on stop/reload", async () => {
  const { project } = await fixture();
  const controller = createRuntimeLifecycleController();
  const session = await runtimeSession(project);
  const first = controller.start(session);
  assert(first.ok && first.value?.listenerCount === 1 && first.value.timerCount === 1 && first.value.animationLoopCount === 1, "first start must own one host resource set");
  const duplicate = controller.start(session);
  assert(!duplicate.ok && diagnosticCode(duplicate) === "RUNTIME_ALREADY_RUNNING", "second start must be rejected");
  const stopped = controller.stop();
  assert(!stopped.active && stopped.listenerCount === 0 && stopped.timerCount === 0 && stopped.animationLoopCount === 0, "stop must clean all host resources");
  const stoppedAgain = controller.stop();
  assert(!stoppedAgain.active && stoppedAgain.listenerCount === 0 && stoppedAgain.timerCount === 0 && stoppedAgain.animationLoopCount === 0, "stop twice must remain clean");
  const restarted = controller.start(session);
  assert(restarted.ok && restarted.value?.instanceCount === 2, "restart must create one new instance after cleanup");
  const reloaded = controller.reload(session);
  assert(reloaded.active && reloaded.instanceCount === 3 && reloaded.listenerCount === 1, "reload must replace rather than duplicate the active resource set");
  controller.stop();
  assert(controller.snapshot().instanceCount === 3 && !controller.snapshot().active, "final stop must be stable and deterministic");
});
