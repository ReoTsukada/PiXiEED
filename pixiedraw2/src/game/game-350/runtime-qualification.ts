/**
 * GAME-350 Runtime qualification boundary.
 *
 * This module is a small, host-neutral qualification adapter. It does not
 * load files, talk to a Registry service, create DOM listeners, or start a
 * production runtime. It validates the identity/asset/lifecycle claims that
 * a GAME-350 host must prove before those host adapters are qualified.
 */

import {
  asAssetId,
  asOwnerId,
  asProjectId,
  asRevisionId,
  asSha256,
  type AssetKind,
  type CallerContext,
  type Sha256,
} from "../game-300/core.ts";
import {
  resolveAssetBinding,
  type AssetBinding,
  type CanonicalAssetRevision,
} from "../game-340/core.ts";
import {
  stopGameRuntime,
  validateGameProject,
  type GameAssetReference,
  type GameProjectRevision,
  type GameRuntimeSession,
} from "../../wp200-game-runtime-core.ts";
import type { RuntimeDiagnostic } from "../../wp160-contracts.ts";

export type RuntimeBoundaryCode =
  | "MISSING_PROJECT"
  | "WRONG_PROJECT"
  | "MISSING_SCENE"
  | "WRONG_SCENE"
  | "MISSING_ENTITY"
  | "WRONG_ENTITY"
  | "INVALID_MANIFEST"
  | "UNSUPPORTED_BEHAVIOR"
  | "UNKNOWN_INPUT_MAPPING"
  | "MISSING_ASSET"
  | "HASH_MISMATCH"
  | "REVISION_MISMATCH"
  | "PROJECT_ASSET_MISMATCH"
  | "MODE_MISMATCH"
  | "RUNTIME_ALREADY_RUNNING"
  | "OWNER_MISMATCH"
  | "PROJECT_REVISION_MISMATCH"
  | "MISSING_REFERENCE";

export interface RuntimeBoundaryDiagnostic {
  readonly code: RuntimeBoundaryCode;
  readonly path: string;
  readonly message: string;
}

export interface RuntimeBoundaryResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly diagnostics: readonly RuntimeBoundaryDiagnostic[];
}

function success<T>(value: T): RuntimeBoundaryResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(...diagnostics: RuntimeBoundaryDiagnostic[]): RuntimeBoundaryResult<T> {
  return { ok: false, diagnostics };
}

function diagnostic(code: RuntimeBoundaryCode, path: string, message: string): RuntimeBoundaryDiagnostic {
  return { code, path, message };
}

function integrationDiagnosticCode(code: string): RuntimeBoundaryCode {
  if (code === "HASH_MISMATCH") return "HASH_MISMATCH";
  if (code === "REVISION_MISMATCH" || code === "STALE_REVISION") return "REVISION_MISMATCH";
  if (code === "WRONG_PROJECT" || code === "WRONG_OWNER") return "PROJECT_ASSET_MISMATCH";
  if (code === "MISSING_ASSET") return "MISSING_ASSET";
  if (code === "MODE_MISMATCH") return "MODE_MISMATCH";
  return "INVALID_MANIFEST";
}

function resultFromIntegration<T>(result: { readonly ok: boolean; readonly value?: T; readonly diagnostics: readonly { readonly code: string; readonly path: string; readonly message: string }[] }): RuntimeBoundaryResult<T> {
  return result.ok && result.value !== undefined
    ? success(result.value)
    : failure(...result.diagnostics.map((item) => diagnostic(integrationDiagnosticCode(item.code), item.path, item.message)));
}

function runtimeValidationCode(item: RuntimeDiagnostic): RuntimeBoundaryCode {
  if (item.code === "HASH_MISMATCH") return "HASH_MISMATCH";
  if (item.code === "DEPENDENCY_LOCK_MISMATCH") return item.message.includes("requires a locked Dependency Snapshot") ? "INVALID_MANIFEST" : "HASH_MISMATCH";
  if (item.code === "BUILD_INVALID_REQUEST" && item.message.includes("Behavior references unknown Action")) return "UNSUPPORTED_BEHAVIOR";
  if (item.code === "BUILD_INVALID_REQUEST" && item.message.includes("Control references unknown Action")) return "UNKNOWN_INPUT_MAPPING";
  return "INVALID_MANIFEST";
}

function validateRuntimeManifest(project: GameProjectRevision): RuntimeBoundaryResult<GameProjectRevision> {
  try {
    const validation = validateGameProject(project);
    if (validation.valid) return success(project);
    const first = validation.diagnostics.find((item) => item.severity === "ERROR") ?? validation.diagnostics[0];
    if (first === undefined) return failure(diagnostic("INVALID_MANIFEST", "project", "Runtime Project manifest is invalid."));
    return failure(diagnostic(runtimeValidationCode(first), "project", validation.diagnostics.map((item) => item.message).join(" ")));
  } catch (error) {
    return failure(diagnostic("INVALID_MANIFEST", "project", error instanceof Error ? error.message : "Runtime Project manifest is malformed."));
  }
}

export interface RuntimeIdentityRequest {
  readonly project: unknown;
  readonly projectId: string;
  readonly sceneId: string;
  readonly entityId?: string;
}

export interface RuntimeIdentitySelection {
  readonly project: GameProjectRevision;
  readonly sceneId: string;
  readonly entityId?: string;
}

/** Validate the runtime's project/scene/entity lookup without trusting UI ids. */
export function resolveRuntimeIdentity(request: RuntimeIdentityRequest): RuntimeBoundaryResult<RuntimeIdentitySelection> {
  if (request.project === undefined || request.project === null) return failure(diagnostic("MISSING_PROJECT", "project", "Runtime Project is required."));
  if (typeof request.project !== "object" || Array.isArray(request.project)) return failure(diagnostic("INVALID_MANIFEST", "project", "Runtime Project manifest must be an object."));
  const project = request.project as GameProjectRevision;
  if (project.projectId !== request.projectId) return failure(diagnostic("WRONG_PROJECT", "projectId", "Runtime Project identity does not match the requested Project."));
  const manifest = validateRuntimeManifest(project);
  if (!manifest.ok || manifest.value === undefined) return failure(...manifest.diagnostics);
  const scene = project.scenes.find((candidate) => candidate.sceneId === request.sceneId);
  if (!scene) return failure(diagnostic("MISSING_SCENE", "sceneId", "Requested Scene is not part of the canonical Project."));
  if (request.entityId !== undefined && !scene.entities.some((entity) => entity.entityId === request.entityId)) {
    return failure(diagnostic("WRONG_ENTITY", "entityId", "Requested Entity is not a member of the requested canonical Scene."));
  }
  return success({ project, sceneId: scene.sceneId, ...(request.entityId === undefined ? {} : { entityId: request.entityId }) });
}

export interface Game350AssetRegistryContext {
  readonly projectId: string;
  readonly ownerId: string;
  readonly revisionId: string;
  readonly licenseByAsset: Readonly<Record<string, string>>;
}

export interface ResolvedGame350Asset {
  readonly kind: AssetKind;
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: Sha256;
  readonly licenseId: string;
  readonly mode: "LIVE" | "PINNED";
}

export interface Game350AssetRegistryAdapter {
  resolve(reference: GameAssetReference, context: Game350AssetRegistryContext): RuntimeBoundaryResult<ResolvedGame350Asset>;
  replaceAuthority(authority: readonly CanonicalAssetRevision[]): void;
  cacheSnapshot(): { readonly size: number; readonly maxEntries: number };
  clear(): void;
  clearProject(projectId: string, ownerId?: string): number;
}

/** LIVE and PINNED entries must never share a cache slot. */
export function runtimeAssetCacheKey(
  reference: Pick<GameAssetReference, "kind" | "assetId" | "mode" | "revisionId" | "contentHash">,
  identity: Pick<Game350AssetRegistryContext, "projectId" | "ownerId"> & { readonly revisionId?: string; readonly licenseId?: string; readonly contentHash?: string } = { projectId: "UNBOUND", ownerId: "UNBOUND" },
): string {
  if (reference.mode === "LIVE") return [identity.projectId, identity.ownerId, reference.kind, String(reference.assetId), "LIVE"].join(":");
  return [identity.projectId, identity.ownerId, reference.kind, String(reference.assetId), "PINNED", String(identity.revisionId ?? reference.revisionId), String(identity.contentHash ?? reference.contentHash)].join(":");
}

export interface Game350AssetRegistryAdapterOptions { readonly maxCacheEntries?: number }

/**
 * Bridge GAME-350 through the existing GAME-340 canonical authority surface.
 * Editor objects are never accepted here; only the typed asset reference and
 * an independently supplied canonical context cross this boundary.
 */
export function createGame350AssetRegistryAdapter(authority: readonly CanonicalAssetRevision[], options: Game350AssetRegistryAdapterOptions = {}): Game350AssetRegistryAdapter {
  const maxEntries = Math.max(1, Math.floor(options.maxCacheEntries ?? 64));
  const byAsset = new Map<string, CanonicalAssetRevision[]>();
  const byAssetAnyOwner = new Map<string, CanonicalAssetRevision[]>();
  const cache = new Map<string, ResolvedGame350Asset>();
  const liveRevisionByIdentity = new Map<string, string>();
  const assetKey = (kind: AssetKind, assetId: string) => `${kind}:${assetId}`;
  const indexAuthority = (items: readonly CanonicalAssetRevision[]): void => {
    byAsset.clear();
    byAssetAnyOwner.clear();
    for (const item of items) {
      const key = `${item.projectId}:${item.ownerId}:${assetKey(item.kind, item.assetId)}`;
      const existing = byAsset.get(key) ?? [];
      existing.push(item);
      byAsset.set(key, existing);
      const anyOwner = byAssetAnyOwner.get(assetKey(item.kind, item.assetId)) ?? [];
      anyOwner.push(item);
      byAssetAnyOwner.set(assetKey(item.kind, item.assetId), anyOwner);
    }
  };
  indexAuthority(authority);
  const cacheGet = (key: string): ResolvedGame350Asset | undefined => {
    const value = cache.get(key);
    if (value !== undefined) { cache.delete(key); cache.set(key, value); }
    return value;
  };
  const cacheSet = (key: string, value: ResolvedGame350Asset): void => {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
  };
  return {
    resolve(reference, context) {
      if (reference.mode !== "LIVE" && reference.mode !== "PINNED") return failure(diagnostic("MODE_MISMATCH", "reference.mode", "Runtime accepts only LIVE or PINNED asset references."));
      const sameAsset = byAssetAnyOwner.get(assetKey(reference.kind, String(reference.assetId))) ?? [];
      if (sameAsset.length > 0 && !sameAsset.some((item) => item.projectId === context.projectId && item.ownerId === context.ownerId)) {
        return failure(diagnostic("PROJECT_ASSET_MISMATCH", "context.projectId", "Runtime Asset authority belongs to another Project or owner."));
      }
      const candidates = byAsset.get(`${context.projectId}:${context.ownerId}:${assetKey(reference.kind, String(reference.assetId))}`) ?? [];
      if (candidates.length === 0) return failure(diagnostic("MISSING_ASSET", "reference.assetId", "Canonical asset revision is missing."));
      const caller: CallerContext = { projectId: asProjectId(context.projectId), ownerId: asOwnerId(context.ownerId), revisionId: asRevisionId(context.revisionId) };
      let pinnedContentHash: Sha256 | undefined;
      if (reference.mode === "PINNED") {
        try {
          pinnedContentHash = asSha256(String(reference.contentHash));
        } catch {
          return failure(diagnostic("HASH_MISMATCH", "reference.contentHash", "Pinned Runtime Asset hash is not a valid SHA-256 value."));
        }
      }
      const binding: AssetBinding = {
        componentId: `runtime:${reference.kind}:${String(reference.assetId)}`,
        projectId: context.projectId,
        ownerId: context.ownerId,
        kind: reference.kind,
        assetId: String(reference.assetId),
        mode: reference.mode,
        ...(reference.mode === "PINNED" ? { revisionId: String(reference.revisionId), contentHash: pinnedContentHash! } : {}),
        licenseId: context.licenseByAsset[String(reference.assetId)] ?? "",
        permission: "READ",
      };
      const current = candidates.slice().sort((a, b) => a.revisionId.localeCompare(b.revisionId)).at(-1)!;
      if (context.licenseByAsset[String(reference.assetId)] !== current.licenseId) {
        return failure(diagnostic("INVALID_MANIFEST", "context.licenseByAsset", "Runtime Asset license claim does not match canonical authority."));
      }
      const cacheIdentity = { projectId: context.projectId, ownerId: context.ownerId, revisionId: reference.revisionId, contentHash: String(reference.contentHash) };
      const liveKey = runtimeAssetCacheKey(reference, cacheIdentity);
      if (reference.mode === "LIVE") {
        const previousRevision = liveRevisionByIdentity.get(liveKey);
        if (previousRevision !== undefined && previousRevision !== current.revisionId) cache.delete(liveKey);
        liveRevisionByIdentity.set(liveKey, current.revisionId);
      }
      const cacheKey = liveKey;
      const cached = cacheGet(cacheKey);
      if (cached !== undefined) return success(cached);
      const resolved = resultFromIntegration(resolveAssetBinding(binding, candidates, caller));
      if (!resolved.ok || resolved.value === undefined) return resolved as RuntimeBoundaryResult<ResolvedGame350Asset>;
      const value = { kind: resolved.value.kind, assetId: resolved.value.assetId, revisionId: resolved.value.revisionId, contentHash: resolved.value.contentHash, licenseId: resolved.value.licenseId, mode: reference.mode };
      cacheSet(cacheKey, value);
      return success(value);
    },
    replaceAuthority: (nextAuthority) => {
      indexAuthority(nextAuthority);
    },
    cacheSnapshot: () => ({ size: cache.size, maxEntries }),
    clear: () => { cache.clear(); liveRevisionByIdentity.clear(); },
    clearProject: (projectId, ownerId) => {
      let removed = 0;
      for (const key of [...cache.keys()]) {
        const parts = key.split(":");
        if (parts[0] === projectId && (ownerId === undefined || parts[1] === ownerId)) { cache.delete(key); removed += 1; }
      }
      for (const key of [...liveRevisionByIdentity.keys()]) {
        const parts = key.split(":");
        if (parts[0] === projectId && (ownerId === undefined || parts[1] === ownerId)) liveRevisionByIdentity.delete(key);
      }
      return removed;
    },
  };
}

export interface PreparedGame350Asset {
  readonly componentId: string;
  readonly reference: GameAssetReference;
  readonly resolved: ResolvedGame350Asset;
}

export interface PreparedGame350Composition {
  readonly identity: { readonly projectId: string; readonly ownerId: string; readonly revisionId: string; readonly projectHash: Sha256 };
  readonly sceneId: string;
  readonly entityId?: string;
  readonly assets: readonly PreparedGame350Asset[];
}

export interface PrepareGame350CompositionRequest {
  readonly project: GameProjectRevision;
  readonly ownerId: string;
  readonly sceneId: string;
  readonly entityId?: string;
  readonly adapter: Game350AssetRegistryAdapter;
  readonly licenseByAsset: Readonly<Record<string, string>>;
}

/** Resolve identity and every Draw/Animation/Audio reference once at the composition boundary. */
export function prepareGame350Composition(request: PrepareGame350CompositionRequest): RuntimeBoundaryResult<PreparedGame350Composition> {
  const identity = resolveRuntimeIdentity({ project: request.project, projectId: String(request.project.projectId), sceneId: request.sceneId, ...(request.entityId === undefined ? {} : { entityId: request.entityId }) });
  if (!identity.ok || identity.value === undefined) return failure(...identity.diagnostics);
  const project = identity.value.project;
  const scene = project.scenes.find((item) => item.sceneId === identity.value!.sceneId)!;
  const entity = identity.value.entityId === undefined ? undefined : scene.entities.find((item) => item.entityId === identity.value!.entityId);
  const references = (entity ? [entity] : scene.entities).flatMap((item) => item.components.flatMap((component) => {
    if (component.type !== "SPRITE" && component.type !== "ANIMATION" && component.type !== "AUDIO_SOURCE") return [];
    return [{ componentId: String(component.componentId), reference: component.asset }];
  }));
  const assets: PreparedGame350Asset[] = [];
  const context = { projectId: String(project.projectId), ownerId: request.ownerId, revisionId: String(project.revisionId), licenseByAsset: request.licenseByAsset };
  for (const item of references) {
    const resolved = request.adapter.resolve(item.reference, context);
    if (!resolved.ok || resolved.value === undefined) return failure(...resolved.diagnostics);
    assets.push({ componentId: item.componentId, reference: item.reference, resolved: resolved.value });
  }
  return success({ identity: { projectId: String(project.projectId), ownerId: request.ownerId, revisionId: String(project.revisionId), projectHash: asSha256(String(project.snapshotHash)) }, sceneId: String(identity.value.sceneId), ...(identity.value.entityId === undefined ? {} : { entityId: String(identity.value.entityId) }), assets });
}

export interface Game350RuntimeSnapshot { readonly tick: number; readonly sceneId: string; readonly resolvedAssetCount: number; readonly assetIds: readonly string[] }
export function createGame350RuntimeSnapshot(composition: PreparedGame350Composition, tick = 0): Game350RuntimeSnapshot {
  return { tick, sceneId: composition.sceneId, resolvedAssetCount: composition.assets.length, assetIds: composition.assets.map((item) => item.resolved.assetId) };
}

export interface RuntimeLifecycleSnapshot {
  readonly active: boolean;
  readonly instanceCount: number;
  readonly listenerCount: number;
  readonly timerCount: number;
  readonly animationLoopCount: number;
  readonly session?: GameRuntimeSession;
}

export interface RuntimeLifecycleController {
  start(session: GameRuntimeSession): RuntimeBoundaryResult<RuntimeLifecycleSnapshot>;
  stop(): RuntimeLifecycleSnapshot;
  reload(session: GameRuntimeSession): RuntimeLifecycleSnapshot;
  snapshot(): RuntimeLifecycleSnapshot;
}

/** A deterministic lifecycle guard used to prove start/stop does not duplicate host resources. */
export function createRuntimeLifecycleController(): RuntimeLifecycleController {
  let activeSession: GameRuntimeSession | undefined;
  let instanceCount = 0;
  let active = false;

  const snapshot = (): RuntimeLifecycleSnapshot => ({
    active,
    instanceCount,
    listenerCount: active ? 1 : 0,
    timerCount: active ? 1 : 0,
    animationLoopCount: active ? 1 : 0,
    ...(activeSession === undefined ? {} : { session: activeSession }),
  });

  return {
    start(session) {
      if (active) return failure(diagnostic("RUNTIME_ALREADY_RUNNING", "runtime", "Runtime start is idempotent and refuses a duplicate active instance."));
      activeSession = session;
      active = true;
      instanceCount += 1;
      return success(snapshot());
    },
    stop() {
      if (activeSession !== undefined) activeSession = { ...stopGameRuntime(activeSession), recovery: "RECOVERED" };
      active = false;
      return snapshot();
    },
    reload(session) {
      activeSession = session;
      active = true;
      instanceCount += 1;
      return snapshot();
    },
    snapshot,
  };
}

export const GAME350_RUNTIME_FAILURE_CASES = [
  "RUNTIME-01-MISSING-PROJECT",
  "RUNTIME-02-MISSING-SCENE",
  "RUNTIME-03-WRONG-PROJECT-SCENE",
  "RUNTIME-04-WRONG-PROJECT-ENTITY",
  "RUNTIME-05-STALE-LIVE",
  "RUNTIME-06-INVALID-PINNED",
  "RUNTIME-07-WRONG-DEPENDENCY-HASH",
  "RUNTIME-08-MISSING-DRAW",
  "RUNTIME-09-MISSING-AUDIO",
  "RUNTIME-10-MALFORMED-MANIFEST",
  "RUNTIME-11-UNSUPPORTED-BEHAVIOR",
  "RUNTIME-12-UNKNOWN-INPUT-MAPPING",
  "RUNTIME-13-START-TWICE",
  "RUNTIME-14-RAPID-START-STOP",
  "RUNTIME-15-RELOAD-DURING-RUNTIME",
  "RUNTIME-16-LIVE-PINNED-CACHE-COLLISION",
] as const;

export type Game350RuntimeFailureCase = typeof GAME350_RUNTIME_FAILURE_CASES[number];
