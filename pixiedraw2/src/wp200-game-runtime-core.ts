/**
 * WP-200 Game Project / PiXiRuntime Core Bridge.
 *
 * This module is intentionally independent from DOM, Canvas, network clients, storage,
 * Market, PiXYNC, and Editor UI. It reuses the WP-160 Runtime vocabulary instead of
 * introducing a second identity, revision, dependency, or diagnostic system.
 */

import {
  type AssetId,
  type AssetReferenceMode,
  type AssetRevisionId,
  type ContentHash,
  type DependencyLockEntry,
  type DependencySnapshot,
  type GameProjectId,
  type RuntimeCapabilityProfile,
  type RuntimeDiagnostic,
  type RuntimeVersionContract,
  asGameProjectId,
  asPackageId,
  asSha256,
  canonicalJson,
  hashCanonical,
} from "./wp160-contracts.ts";
import {
  type InputBinding,
  type InputEvent,
  type InputActionMap,
  type RuntimeAssetResolver,
  type RuntimePreviewSession,
  createDependencySnapshot,
  createRuntimePreview,
  loadRuntimeAssets,
  safeHotReload,
  serializeRuntimeState,
  stepRuntime,
  type PreviewStepResult,
} from "./wp160-game-runtime-core.ts";
import {
  resolveGameRuntimePerformanceProfile,
  type GameRuntimePerformanceProfile,
  type GameRuntimePerformanceProfileId,
} from "./game/game-350/runtime-performance.ts";

export type GameProjectRevisionId = string;
export type GameSceneId = string;
export type GameEntityId = string;
export type GameComponentId = string;
export type GameActionId = string;
export type GameBehaviorId = string;
export type GameSaveSchemaVersion = 1;

export type GameAssetKind = "DRAW" | "AUDIO";
export type GameComponentType = "TRANSFORM" | "SPRITE" | "ANIMATION" | "AUDIO_SOURCE" | "CAMERA" | "COLLIDER" | "CONTROL" | "SAVEABLE";
export type GameBehaviorTrigger = "ACTION";
export type GameBehaviorOperation = "SET_VALUE" | "ADD_VALUE";
export type GameReferenceMode = AssetReferenceMode;

export interface GameAssetReference {
  readonly kind: GameAssetKind;
  readonly assetId: AssetId;
  readonly revisionId: AssetRevisionId;
  readonly contentHash: ContentHash;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly mode: GameReferenceMode;
  readonly provenance: "DRAW2" | "PIXIAUDIO";
}

export interface GameTransformComponent {
  readonly type: "TRANSFORM";
  readonly componentId: GameComponentId;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface GameSpriteComponent {
  readonly type: "SPRITE";
  readonly componentId: GameComponentId;
  readonly asset: GameAssetReference;
  readonly visible: boolean;
}

export interface GameAnimationComponent {
  readonly type: "ANIMATION";
  readonly componentId: GameComponentId;
  readonly asset: GameAssetReference;
  readonly clipId: string;
  readonly loop: boolean;
}

export interface GameAudioSourceComponent {
  readonly type: "AUDIO_SOURCE";
  readonly componentId: GameComponentId;
  readonly asset: GameAssetReference;
  readonly loop: boolean;
  readonly volume: number;
}

export interface GameCameraComponent {
  readonly type: "CAMERA";
  readonly componentId: GameComponentId;
  readonly active: boolean;
  readonly zoom: number;
}

export interface GameColliderComponent {
  readonly type: "COLLIDER";
  readonly componentId: GameComponentId;
  readonly width: number;
  readonly height: number;
  readonly sensor: boolean;
}

export interface GameControlComponent {
  readonly type: "CONTROL";
  readonly componentId: GameComponentId;
  readonly actionId: GameActionId;
}

export interface GameSaveableComponent {
  readonly type: "SAVEABLE";
  readonly componentId: GameComponentId;
  readonly keys: readonly string[];
}

export type GameComponent =
  | GameTransformComponent
  | GameSpriteComponent
  | GameAnimationComponent
  | GameAudioSourceComponent
  | GameCameraComponent
  | GameColliderComponent
  | GameControlComponent
  | GameSaveableComponent;

export interface GameEntity {
  readonly entityId: GameEntityId;
  readonly name: string;
  readonly parentEntityId?: GameEntityId;
  readonly components: readonly GameComponent[];
}

export interface GameScene {
  readonly sceneId: GameSceneId;
  readonly name: string;
  readonly rootEntityIds: readonly GameEntityId[];
  readonly entities: readonly GameEntity[];
}

export interface GameInputAction {
  readonly actionId: GameActionId;
  readonly label: string;
  readonly bindings: readonly InputBinding[];
}

export interface GameInputActionMap {
  readonly actions: readonly GameInputAction[];
}

export interface GameBehaviorRule {
  readonly trigger: GameBehaviorTrigger;
  readonly actionId: GameActionId;
  readonly operations: readonly GameBehaviorOperationRecord[];
}

export interface GameBehaviorOperationRecord {
  readonly operation: GameBehaviorOperation;
  readonly key: string;
  readonly value: number | string | boolean;
}

export interface GameBehaviorIR {
  readonly behaviorId: GameBehaviorId;
  readonly version: 1;
  readonly rules: readonly GameBehaviorRule[];
}

export interface GameBuildProfile {
  readonly target: "PIXIEED_NATIVE_WEB_RUNTIME" | "GENERIC_WEB_PACKAGE";
  readonly runtimeVersion: string;
  readonly capabilityProfile: string;
  readonly optimization: "DEBUG" | "RELEASE";
}

export interface GameProjectRevision {
  readonly schemaVersion: 1;
  readonly projectId: GameProjectId;
  readonly revisionId: GameProjectRevisionId;
  readonly packageId: ReturnType<typeof asPackageId>;
  readonly packageVersion: string;
  readonly name: string;
  readonly scenes: readonly GameScene[];
  readonly inputMap: GameInputActionMap;
  readonly behaviors: readonly GameBehaviorIR[];
  readonly dependencies: DependencySnapshot;
  readonly buildProfile: GameBuildProfile;
  readonly snapshotHash: ContentHash;
}

export interface GameProjectRevisionInput extends Omit<GameProjectRevision, "snapshotHash"> {
  readonly snapshotHash?: never;
}

export interface GameValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly RuntimeDiagnostic[];
}

export type GameRuntimeFeature = "game-core-read" | "game-core-write" | "runtime-preview" | "runtime-execution";

export interface GameRuntimeFeatureFlags {
  readonly [key: string]: boolean | undefined;
}

export interface GameRuntimeSession {
  readonly project: GameProjectRevision;
  readonly runtime: RuntimePreviewSession;
  readonly performanceProfile: GameRuntimePerformanceProfile;
  readonly sceneId: GameSceneId;
  readonly runtimeValues: Readonly<Record<string, number | string | boolean>>;
  readonly recovery: "VALID" | "RECOVERED" | "BLOCKED";
  readonly diagnostics: readonly RuntimeDiagnostic[];
}

export interface CreateGameRuntimeOptions {
  readonly project: GameProjectRevision;
  readonly previewId: string;
  readonly runtime: RuntimeVersionContract;
  readonly supportedRuntimeVersion: string;
  readonly capabilities: RuntimeCapabilityProfile;
  readonly flags: GameRuntimeFeatureFlags;
  readonly killSwitch: boolean;
  readonly performanceProfileId?: GameRuntimePerformanceProfileId;
  readonly inputMap?: InputActionMap;
  readonly renderer?: "CANVAS2D" | "WEBGPU" | "NONE";
}

export interface GameStepResult {
  readonly session: GameRuntimeSession;
  readonly actions: readonly string[];
  readonly presentationChanged: boolean;
}

export interface GameHotReloadResult {
  readonly accepted: boolean;
  readonly session: GameRuntimeSession;
  readonly diagnostics: readonly RuntimeDiagnostic[];
}

export interface GameRuntimeSaveState {
  readonly schemaVersion: GameSaveSchemaVersion;
  readonly projectId: GameProjectId;
  readonly projectRevisionId: GameProjectRevisionId;
  readonly sceneId: GameSceneId;
  readonly tick: number;
  readonly values: Readonly<Record<string, number | string | boolean>>;
  readonly checksum: ContentHash;
}

function diagnostic(
  code: RuntimeDiagnostic["code"],
  message: string,
  recoverable: boolean,
  severity: RuntimeDiagnostic["severity"] = "ERROR",
): RuntimeDiagnostic {
  return { code, severity, message, recoverable };
}

function safeText(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) throw new Error(`${label} must be a stable identifier.`);
}

function finiteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function referenceKey(reference: GameAssetReference): string {
  return `${reference.kind}:${reference.assetId}:${reference.revisionId}:${reference.contentHash}`;
}

function collectReferencesFromScenes(scenes: readonly GameScene[]): readonly GameAssetReference[] {
  const references: GameAssetReference[] = [];
  for (const scene of scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") references.push(component.asset);
      }
    }
  }
  return references.sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
}

function collectReferences(project: Omit<GameProjectRevision, "snapshotHash">): readonly GameAssetReference[] {
  return collectReferencesFromScenes(project.scenes);
}

function dependencyMatchesReference(reference: GameAssetReference, dependencies: DependencySnapshot): boolean {
  return dependencies.entries.some((entry) => entry.assetId === reference.assetId && entry.revisionId === reference.revisionId && entry.contentHash === reference.contentHash && entry.byteLength === reference.byteLength && entry.mimeType === reference.mimeType && entry.mode === reference.mode);
}

function validateReference(reference: GameAssetReference, diagnostics: RuntimeDiagnostic[]): void {
  if (!(["DRAW", "AUDIO"] as readonly string[]).includes(reference.kind)) diagnostics.push(diagnostic("PACKAGE_INVALID", "Game Asset reference kind is unsupported.", false));
  if (reference.provenance !== (reference.kind === "DRAW" ? "DRAW2" : "PIXIAUDIO")) diagnostics.push(diagnostic("PACKAGE_INVALID", "Game Asset reference provenance does not match its kind.", false));
  if (!Number.isSafeInteger(reference.byteLength) || reference.byteLength < 0) diagnostics.push(diagnostic("PACKAGE_INVALID", "Game Asset reference byteLength is invalid.", false));
  if (!reference.mimeType || reference.mimeType.includes("/") === false) diagnostics.push(diagnostic("PACKAGE_INVALID", "Game Asset reference MIME type is invalid.", false));
  if (reference.mode === "LIVE" && reference.kind === "AUDIO") diagnostics.push(diagnostic("PACKAGE_INVALID", "Audio LIVE references are preview-only and must not enter a locked Build.", true, "WARNING"));
}

export function validateGameProject(project: GameProjectRevisionInput | GameProjectRevision): GameValidationResult {
  const diagnostics: RuntimeDiagnostic[] = [];
  if (project.schemaVersion !== 1) diagnostics.push(diagnostic("PACKAGE_INVALID", "Unknown Game Project schema version.", false));
  try { asGameProjectId(project.projectId); safeText(project.revisionId, "GameProjectRevisionId"); safeText(project.packageVersion, "PackageVersion"); }
  catch (error) { diagnostics.push(diagnostic("BUILD_INVALID_REQUEST", error instanceof Error ? error.message : "Game Project identity is invalid.", false)); }
  if (!project.name.trim()) diagnostics.push(diagnostic("BUILD_INVALID_REQUEST", "Game Project name is required.", false));
  if (project.scenes.length === 0) diagnostics.push(diagnostic("PACKAGE_INVALID", "Game Project requires at least one Scene.", false));
  if (!project.dependencies.locked) diagnostics.push(diagnostic("DEPENDENCY_LOCK_MISMATCH", "Game Project requires a locked Dependency Snapshot for Runtime/Build use.", false));
  const sceneIds = new Set<string>();
  const entityIds = new Set<string>();
  const componentIds = new Set<string>();
  const actionIds = new Set<string>();
  for (const action of project.inputMap.actions) {
    try { safeText(action.actionId, "GameActionId"); } catch (error) { diagnostics.push(diagnostic("BUILD_INVALID_REQUEST", error instanceof Error ? error.message : "Action ID is invalid.", false)); }
    if (actionIds.has(action.actionId)) diagnostics.push(diagnostic("PACKAGE_INVALID", `Duplicate Game Action ${action.actionId}.`, false));
    actionIds.add(action.actionId);
    if (!action.bindings.length) diagnostics.push(diagnostic("BUILD_INVALID_REQUEST", `Game Action ${action.actionId} has no binding.`, true, "WARNING"));
  }
  for (const scene of project.scenes) {
    try { safeText(scene.sceneId, "GameSceneId"); } catch (error) { diagnostics.push(diagnostic("PACKAGE_INVALID", error instanceof Error ? error.message : "Scene ID is invalid.", false)); }
    if (sceneIds.has(scene.sceneId)) diagnostics.push(diagnostic("PACKAGE_INVALID", `Duplicate Game Scene ${scene.sceneId}.`, false));
    sceneIds.add(scene.sceneId);
    const sceneEntityIds = new Set(scene.entities.map((entity) => entity.entityId));
    for (const rootId of scene.rootEntityIds) if (!sceneEntityIds.has(rootId)) diagnostics.push(diagnostic("MISSING_REQUIRED_ASSET", `Scene root Entity ${rootId} is missing.`, false));
    for (const entity of scene.entities) {
      try { safeText(entity.entityId, "GameEntityId"); } catch (error) { diagnostics.push(diagnostic("PACKAGE_INVALID", error instanceof Error ? error.message : "Entity ID is invalid.", false)); }
      if (entityIds.has(entity.entityId)) diagnostics.push(diagnostic("PACKAGE_INVALID", `Duplicate Game Entity ${entity.entityId}.`, false));
      entityIds.add(entity.entityId);
      if (entity.parentEntityId !== undefined && !sceneEntityIds.has(entity.parentEntityId)) diagnostics.push(diagnostic("PACKAGE_INVALID", `Entity parent ${entity.parentEntityId} is missing.`, false));
      for (const component of entity.components) {
        try { safeText(component.componentId, "GameComponentId"); } catch (error) { diagnostics.push(diagnostic("PACKAGE_INVALID", error instanceof Error ? error.message : "Component ID is invalid.", false)); }
        if (componentIds.has(component.componentId)) diagnostics.push(diagnostic("PACKAGE_INVALID", `Duplicate Game Component ${component.componentId}.`, false));
        componentIds.add(component.componentId);
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") {
          validateReference(component.asset, diagnostics);
          if (!dependencyMatchesReference(component.asset, project.dependencies)) diagnostics.push(diagnostic("DEPENDENCY_LOCK_MISMATCH", `Game Asset ${component.asset.assetId} is not present in the locked Dependency Snapshot.`, false));
        }
        if (component.type === "CONTROL" && !actionIds.has(component.actionId)) diagnostics.push(diagnostic("BUILD_INVALID_REQUEST", `Control references unknown Action ${component.actionId}.`, false));
        if (component.type === "AUDIO_SOURCE" && (component.volume < 0 || component.volume > 1)) diagnostics.push(diagnostic("BUILD_INVALID_REQUEST", `Audio volume for ${component.componentId} must be between 0 and 1.`, false));
      }
    }
    for (const entity of scene.entities) {
      const seenParents = new Set<string>();
      let parentId = entity.parentEntityId;
      while (parentId !== undefined) {
        if (seenParents.has(parentId) || parentId === entity.entityId) {
          diagnostics.push(diagnostic("PACKAGE_INVALID", `Entity parent cycle includes ${entity.entityId}.`, false));
          break;
        }
        seenParents.add(parentId);
        parentId = scene.entities.find((candidate) => candidate.entityId === parentId)?.parentEntityId;
      }
    }
  }
  for (const behavior of project.behaviors) {
    try { safeText(behavior.behaviorId, "GameBehaviorId"); } catch (error) { diagnostics.push(diagnostic("PACKAGE_INVALID", error instanceof Error ? error.message : "Behavior ID is invalid.", false)); }
    for (const rule of behavior.rules) {
      if (!actionIds.has(rule.actionId)) diagnostics.push(diagnostic("BUILD_INVALID_REQUEST", `Behavior references unknown Action ${rule.actionId}.`, false));
      for (const operation of rule.operations) if (!operation.key.trim()) diagnostics.push(diagnostic("BUILD_INVALID_REQUEST", "Behavior operation key is required.", false));
    }
  }
  for (const reference of collectReferences(project)) {
    if (reference.mode === "PINNED" && !dependencyMatchesReference(reference, project.dependencies)) diagnostics.push(diagnostic("DEPENDENCY_LOCK_MISMATCH", `Pinned Asset ${reference.assetId} is not locked.`, false));
  }
  return { valid: diagnostics.every((item) => item.severity !== "ERROR"), diagnostics };
}

export async function createGameProjectRevision(input: GameProjectRevisionInput): Promise<GameProjectRevision> {
  const validation = validateGameProject(input);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => item.message).join(" "));
  const canonical = { ...input, snapshotHash: undefined };
  const snapshotHash = await hashCanonical(canonical);
  return { ...input, snapshotHash };
}

export function gameInputActionMapToRuntime(inputMap: GameInputActionMap): InputActionMap {
  return { bindings: inputMap.actions.flatMap((action) => action.bindings).sort((left, right) => `${left.action}:${left.source}:${left.code}`.localeCompare(`${right.action}:${right.source}:${right.code}`)) };
}

function assetRequestsFromScenes(scenes: readonly GameScene[]): readonly { readonly assetId: AssetId; readonly required: boolean; readonly mode: AssetReferenceMode }[] {
  const unique = new Map<string, { readonly assetId: AssetId; readonly required: boolean; readonly mode: AssetReferenceMode }>();
  for (const reference of collectReferencesFromScenes(scenes)) unique.set(String(reference.assetId), { assetId: reference.assetId, required: true, mode: reference.mode });
  return [...unique.values()].sort((left, right) => left.assetId.localeCompare(right.assetId));
}

export function gameAssetRequests(project: GameProjectRevision): readonly { readonly assetId: AssetId; readonly required: boolean; readonly mode: AssetReferenceMode }[] {
  return assetRequestsFromScenes(project.scenes);
}

/** Resolve only the references needed by one Scene; other Scenes remain lazy. */
export function gameAssetRequestsForScene(project: GameProjectRevision, sceneId: GameSceneId): readonly { readonly assetId: AssetId; readonly required: boolean; readonly mode: AssetReferenceMode }[] {
  const scene = project.scenes.find((candidate) => candidate.sceneId === sceneId);
  return scene === undefined ? [] : assetRequestsFromScenes([scene]);
}

function featureEnabled(flags: GameRuntimeFeatureFlags, feature: GameRuntimeFeature, killSwitch: boolean): boolean {
  return killSwitch !== true && flags[feature] === true;
}

function appendFlagDiagnostic(diagnostics: RuntimeDiagnostic[], feature: GameRuntimeFeature): void {
  diagnostics.push(diagnostic("UNSUPPORTED_CAPABILITY", `Feature flag ${feature} is OFF; isolated Game/Runtime operation is unavailable.`, true, "WARNING"));
}

export async function createGameRuntimePreview(options: CreateGameRuntimeOptions): Promise<GameRuntimeSession> {
  const validation = validateGameProject(options.project);
  const diagnostics = [...validation.diagnostics];
  if (!featureEnabled(options.flags, "game-core-read", options.killSwitch)) appendFlagDiagnostic(diagnostics, "game-core-read");
  if (!featureEnabled(options.flags, "runtime-preview", options.killSwitch)) appendFlagDiagnostic(diagnostics, "runtime-preview");
  const runtimeBase = {
    previewId: options.previewId,
    projectId: options.project.projectId,
    projectRevisionId: options.project.revisionId,
    packageId: options.project.packageId,
    packageVersion: options.project.packageVersion,
    runtime: options.runtime,
    supportedRuntimeVersion: options.supportedRuntimeVersion,
    dependencies: options.project.dependencies,
    capabilities: options.capabilities,
    inputMap: options.inputMap ?? gameInputActionMapToRuntime(options.project.inputMap),
  };
  const runtime = options.renderer === undefined
    ? await createRuntimePreview(runtimeBase)
    : await createRuntimePreview({ ...runtimeBase, renderer: options.renderer });
  const allDiagnostics = [...diagnostics, ...runtime.diagnostics];
  const running = runtime.running && validation.valid && featureEnabled(options.flags, "game-core-read", options.killSwitch) && featureEnabled(options.flags, "runtime-preview", options.killSwitch);
  const performanceProfile = resolveGameRuntimePerformanceProfile(options.performanceProfileId === undefined
    ? { screenWidth: options.capabilities.screenWidth, touch: options.capabilities.touch }
    : { screenWidth: options.capabilities.screenWidth, touch: options.capabilities.touch, requestedProfileId: options.performanceProfileId });
  return {
    project: options.project,
    runtime: { ...runtime, running, diagnostics: allDiagnostics },
    performanceProfile,
    sceneId: options.project.scenes[0]?.sceneId ?? "",
    runtimeValues: {},
    recovery: validation.valid && running ? "VALID" : "BLOCKED",
    diagnostics: allDiagnostics,
  };
}

function applyBehaviorValues(project: GameProjectRevision, previous: Readonly<Record<string, number | string | boolean>>, actions: readonly string[]): Readonly<Record<string, number | string | boolean>> {
  const next = { ...previous };
  const active = new Set(actions);
  const activeActionIds = new Set(project.inputMap.actions.filter((action) => action.bindings.some((binding) => active.has(binding.action))).map((action) => action.actionId));
  for (const behavior of project.behaviors) {
    for (const rule of behavior.rules) {
      if (!activeActionIds.has(rule.actionId)) continue;
      for (const operation of rule.operations) {
        if (operation.operation === "SET_VALUE") next[operation.key] = operation.value;
        const currentValue = next[operation.key];
        if (operation.operation === "ADD_VALUE" && typeof operation.value === "number" && typeof currentValue === "number") next[operation.key] = currentValue + operation.value;
        if (operation.operation === "ADD_VALUE" && typeof operation.value === "number" && next[operation.key] === undefined) next[operation.key] = operation.value;
      }
    }
  }
  return next;
}

export function stepGameRuntime(session: GameRuntimeSession, deltaMs: number, input: readonly InputEvent[]): GameStepResult {
  const stepped: PreviewStepResult = stepRuntime(session.runtime, deltaMs, input);
  const runtimeValues = applyBehaviorValues(session.project, session.runtimeValues, stepped.actions);
  const nextRuntime: RuntimePreviewSession = { ...stepped.session, world: { ...stepped.session.world, values: runtimeValues } };
  return { session: { ...session, runtime: nextRuntime, runtimeValues, diagnostics: nextRuntime.diagnostics }, actions: stepped.actions, presentationChanged: stepped.presentationChanged };
}

export interface GameRuntimeAssetLoadOptions {
  readonly sceneId?: GameSceneId;
}

export async function loadGameRuntimeAssets(session: GameRuntimeSession, resolver: RuntimeAssetResolver, options: GameRuntimeAssetLoadOptions = {}): Promise<GameRuntimeSession> {
  const requests = options.sceneId === undefined ? gameAssetRequests(session.project) : gameAssetRequestsForScene(session.project, options.sceneId);
  const runtime = await loadRuntimeAssets(session.runtime, requests, resolver);
  const blocked = runtime.diagnostics.some((item) => !item.recoverable && ["MISSING_REQUIRED_ASSET", "HASH_MISMATCH", "ASSET_QUARANTINED"].includes(item.code));
  return { ...session, runtime: { ...runtime, running: runtime.running && !blocked }, recovery: blocked ? "BLOCKED" : session.recovery, diagnostics: runtime.diagnostics };
}

export async function loadGameRuntimeSceneAssets(session: GameRuntimeSession, sceneId: GameSceneId, resolver: RuntimeAssetResolver): Promise<GameRuntimeSession> {
  return loadGameRuntimeAssets(session, resolver, { sceneId });
}

export function stopGameRuntime(session: GameRuntimeSession): GameRuntimeSession {
  return { ...session, runtime: { ...session.runtime, running: false } };
}

export function safeGameHotReload(session: GameRuntimeSession, nextProject: GameProjectRevision): GameHotReloadResult {
  const validation = validateGameProject(nextProject);
  if (!validation.valid || nextProject.projectId !== session.project.projectId || nextProject.packageId !== session.project.packageId || nextProject.packageVersion !== session.project.packageVersion) {
    const diagnostics = [...validation.diagnostics, diagnostic("HOT_RELOAD_REJECTED", "Game Project identity, Package, or schema is incompatible with the active Runtime session.", true)];
    return { accepted: false, session: { ...session, recovery: "RECOVERED", diagnostics }, diagnostics };
  }
  const result = safeHotReload(session.runtime, nextProject.dependencies);
  if (!result.accepted) return { accepted: false, session: { ...session, diagnostics: [...session.diagnostics, ...result.diagnostics], recovery: "RECOVERED" }, diagnostics: result.diagnostics };
  const sceneExists = nextProject.scenes.some((scene) => scene.sceneId === session.sceneId);
  if (!sceneExists) {
    const diagnostics = [diagnostic("HOT_RELOAD_REJECTED", "The active Scene no longer exists in the incoming revision.", true)];
    return { accepted: false, session: { ...session, diagnostics: [...session.diagnostics, ...diagnostics], recovery: "RECOVERED" }, diagnostics };
  }
  return { accepted: true, session: { ...session, project: nextProject, runtime: { ...result.session, projectRevisionId: nextProject.revisionId }, recovery: "VALID", diagnostics: result.diagnostics }, diagnostics: result.diagnostics };
}

export async function serializeGameRuntimeSaveState(session: GameRuntimeSession): Promise<GameRuntimeSaveState> {
  const body = { schemaVersion: 1 as const, projectId: session.project.projectId, projectRevisionId: session.project.revisionId, sceneId: session.sceneId, tick: session.runtime.world.tick, values: session.runtimeValues };
  return { ...body, checksum: await hashCanonical(body) };
}

export async function restoreGameRuntimeSaveState(session: GameRuntimeSession, save: GameRuntimeSaveState): Promise<{ readonly session: GameRuntimeSession; readonly restored: boolean; readonly diagnostics: readonly RuntimeDiagnostic[] }> {
  const expected = await hashCanonical({ schemaVersion: save.schemaVersion, projectId: save.projectId, projectRevisionId: save.projectRevisionId, sceneId: save.sceneId, tick: save.tick, values: save.values });
  const diagnostics: RuntimeDiagnostic[] = [];
  if (save.schemaVersion !== 1 || save.checksum !== expected) diagnostics.push(diagnostic("LOAD_FAILED", "Runtime Save State schema or checksum is invalid.", true));
  if (save.projectId !== session.project.projectId || save.sceneId !== session.sceneId) diagnostics.push(diagnostic("LOAD_FAILED", "Runtime Save State belongs to another Game Project or Scene.", true));
  if (diagnostics.length) return { session: { ...session, recovery: "RECOVERED", diagnostics: [...session.diagnostics, ...diagnostics] }, restored: false, diagnostics };
  const runtime = { ...session.runtime, world: { ...session.runtime.world, tick: save.tick, values: save.values } };
  return { session: { ...session, runtime, runtimeValues: save.values, recovery: "VALID", diagnostics: runtime.diagnostics }, restored: true, diagnostics: [] };
}

export async function createGameDependencySnapshot(
  packageId: string,
  packageVersion: string,
  entries: readonly DependencyLockEntry[],
): Promise<DependencySnapshot> {
  return createDependencySnapshot(packageId, packageVersion, entries, true);
}

export function isGameAssetReference(value: unknown): value is GameAssetReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameAssetReference>;
  return (candidate.kind === "DRAW" || candidate.kind === "AUDIO") && typeof candidate.assetId === "string" && typeof candidate.revisionId === "string" && typeof candidate.contentHash === "string";
}

export async function gameRuntimeStateFingerprint(session: GameRuntimeSession): Promise<ContentHash> {
  return asSha256(await hashCanonical({ projectId: session.project.projectId, projectRevisionId: session.project.revisionId, runtime: serializeRuntimeState(session.runtime), sceneId: session.sceneId, values: session.runtimeValues }));
}
