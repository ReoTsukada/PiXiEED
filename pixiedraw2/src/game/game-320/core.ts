/**
 * GAME-320 isolated Runtime Preview and Save State.
 *
 * This module owns an immutable Runtime world only. It deliberately has no
 * DOM, network, filesystem, storage, editor, production, or Registry seam.
 */

import {
  canonicalJson,
  sha256,
  validateGameProject,
  type AssetRevisionReference,
  type CallerContext,
  type Component,
  type GameProject,
  type Sha256,
} from "../game-300/core.ts";

export const GAME_RUNTIME_SCHEMA_VERSION = 1 as const;
export const GAME_SAVE_STATE_SCHEMA_VERSION = 1 as const;

export type RuntimeMode = "preview" | "playing" | "paused" | "stopped";
export type RuntimeActionPhase = "started" | "performed" | "held" | "repeated" | "released" | "canceled";

export type RuntimeDiagnosticCode =
  | "INVALID_PROJECT"
  | "INVALID_SNAPSHOT"
  | "INVALID_SAVE_STATE"
  | "UNKNOWN_SCHEMA"
  | "PROJECT_REVISION_MISMATCH"
  | "ASSET_REVISION_MISMATCH"
  | "PROJECT_ID_MISMATCH"
  | "OWNER_MISMATCH"
  | "CALLER_CLAIM_MISMATCH"
  | "UNKNOWN_COMPONENT"
  | "UNKNOWN_ENTITY"
  | "UNKNOWN_SCENE"
  | "INVALID_ACTION"
  | "NON_DETERMINISTIC_INPUT"
  | "INVALID_TICK"
  | "UNSUPPORTED_MIGRATION"
  | "CHECKPOINT_NOT_FOUND"
  | "RUNTIME_NOT_ACTIVE";

export interface RuntimeDiagnostic {
  readonly code: RuntimeDiagnosticCode;
  readonly path: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface RuntimeResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly diagnostics: readonly RuntimeDiagnostic[];
}

export interface RuntimeCallerClaim {
  readonly projectId: string;
  readonly ownerId: string;
  readonly revisionId: string;
}

export interface AssetRevisionLock {
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: Sha256;
  readonly kind: AssetRevisionReference["kind"];
}

export interface RuntimeComponentSnapshot {
  readonly componentId: string;
  readonly entityId: string;
  readonly type: Component["type"];
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

export interface RuntimeProjectSnapshot {
  readonly schemaVersion: typeof GAME_RUNTIME_SCHEMA_VERSION;
  readonly projectId: string;
  readonly ownerId: string;
  readonly projectRevisionId: string;
  readonly projectHash: Sha256;
  readonly sceneIds: readonly string[];
  readonly initialSceneId: string;
  readonly assetLocks: readonly AssetRevisionLock[];
  readonly components: readonly RuntimeComponentSnapshot[];
  readonly snapshotHash: Sha256;
}

export interface RuntimeAction {
  readonly actionId: string;
  readonly phase: RuntimeActionPhase;
  readonly value: string | boolean | number | { readonly x: number; readonly y: number };
  readonly sequence: number;
}

export interface RuntimeEntityState {
  readonly entityId: string;
  readonly components: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>;
}

export interface RuntimeWorldState {
  readonly mode: RuntimeMode;
  readonly tick: number;
  readonly frame: number;
  readonly sceneId: string;
  readonly entities: Readonly<Record<string, RuntimeEntityState>>;
  readonly variables: Readonly<Record<string, string | number | boolean>>;
  readonly lastInputSequence: number;
}

export interface RuntimeSaveState {
  readonly schemaVersion: typeof GAME_SAVE_STATE_SCHEMA_VERSION;
  readonly runtimeSchemaVersion: typeof GAME_RUNTIME_SCHEMA_VERSION;
  readonly projectId: string;
  readonly ownerId: string;
  readonly projectRevisionId: string;
  readonly projectHash: Sha256;
  readonly assetLocks: readonly AssetRevisionLock[];
  readonly world: RuntimeWorldState;
  readonly stateHash: Sha256;
}

export interface RuntimeCheckpoint {
  readonly checkpointId: string;
  readonly saveState: RuntimeSaveState;
}

export interface RuntimeSession {
  readonly snapshot: RuntimeProjectSnapshot;
  readonly world: RuntimeWorldState;
  readonly checkpoints: readonly RuntimeCheckpoint[];
}

function diagnostic(code: RuntimeDiagnosticCode, path: string, message: string, recoverable = true): RuntimeDiagnostic {
  return { code, path, message, recoverable };
}

function success<T>(value: T): RuntimeResult<T> { return { ok: true, value, diagnostics: [] }; }
function failure<T>(...diagnostics: RuntimeDiagnostic[]): RuntimeResult<T> { return { ok: false, diagnostics }; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function stableId(value: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value); }
function scalar(value: unknown): value is string | number | boolean { return typeof value === "string" || typeof value === "boolean" || finite(value); }
function cloneWorld(value: RuntimeWorldState): RuntimeWorldState { return JSON.parse(JSON.stringify(value)) as RuntimeWorldState; }

function componentProperties(component: Component): Readonly<Record<string, string | number | boolean>> {
  switch (component.type) {
    case "TRANSFORM": return { x: component.x, y: component.y, rotation: component.rotation, scaleX: component.scaleX, scaleY: component.scaleY };
    case "SPRITE": return {
      assetId: String(component.asset.assetId), assetRevisionId: String(component.asset.revisionId),
      assetContentHash: String(component.asset.contentHash), visible: component.visible,
    };
    case "AUDIO_SOURCE": return {
      assetId: String(component.asset.assetId), assetRevisionId: String(component.asset.revisionId),
      assetContentHash: String(component.asset.contentHash), loop: component.loop, volume: component.volume,
    };
    case "BEHAVIOR": return { behaviorId: String(component.behaviorId) };
    case "CAMERA": return { active: component.active, zoom: component.zoom };
    case "TILEMAP": return { mapId: component.mapId, tileSize: component.tileSize, collisionEnabled: component.collisionEnabled };
    case "COLLIDER": return {
      shape: component.shape, width: component.width, height: component.height, radius: component.radius,
      isTrigger: component.isTrigger, layer: component.layer, enabled: component.enabled,
    };
    case "RIGIDBODY": return {
      bodyType: component.bodyType, mass: component.mass, gravityScale: component.gravityScale,
      fixedRotation: component.fixedRotation, enabled: component.enabled,
    };
    case "CHARACTER_CONTROLLER": return {
      moveSpeed: component.moveSpeed, stepHeight: component.stepHeight, fixedStep: component.fixedStep, enabled: component.enabled,
    };
  }
}

const componentPropertyTypes: Readonly<Record<Component["type"], Readonly<Record<string, "string" | "number" | "boolean">>>> = {
  TRANSFORM: { x: "number", y: "number", rotation: "number", scaleX: "number", scaleY: "number" },
  SPRITE: { assetId: "string", assetRevisionId: "string", assetContentHash: "string", visible: "boolean" },
  AUDIO_SOURCE: { assetId: "string", assetRevisionId: "string", assetContentHash: "string", loop: "boolean", volume: "number" },
  BEHAVIOR: { behaviorId: "string" },
  CAMERA: { active: "boolean", zoom: "number" },
  TILEMAP: { mapId: "string", tileSize: "number", collisionEnabled: "boolean" },
  COLLIDER: { shape: "string", width: "number", height: "number", radius: "number", isTrigger: "boolean", layer: "string", enabled: "boolean" },
  RIGIDBODY: { bodyType: "string", mass: "number", gravityScale: "number", fixedRotation: "boolean", enabled: "boolean" },
  CHARACTER_CONTROLLER: { moveSpeed: "number", stepHeight: "number", fixedStep: "number", enabled: "boolean" },
};

function collectAssets(project: GameProject): AssetRevisionLock[] {
  const locks = new Map<string, AssetRevisionLock>();
  for (const scene of project.scenes) for (const entity of scene.entities) for (const component of entity.components) {
    if (component.type !== "SPRITE" && component.type !== "AUDIO_SOURCE") continue;
    const asset = component.asset;
    const key = `${asset.kind}:${String(asset.assetId)}:${String(asset.revisionId)}`;
    locks.set(key, { assetId: String(asset.assetId), revisionId: String(asset.revisionId), contentHash: asset.contentHash, kind: asset.kind });
  }
  return [...locks.values()].sort((a, b) => `${a.kind}:${a.assetId}:${a.revisionId}`.localeCompare(`${b.kind}:${b.assetId}:${b.revisionId}`));
}

function collectComponents(project: GameProject): RuntimeComponentSnapshot[] {
  return project.scenes.flatMap((scene) => scene.entities.flatMap((entity) => entity.components.map((component) => ({
    componentId: String(component.componentId), entityId: String(entity.entityId), type: component.type, properties: componentProperties(component),
  })))).sort((a, b) => a.componentId.localeCompare(b.componentId));
}

function initialWorld(snapshot: RuntimeProjectSnapshot): RuntimeWorldState {
  const entities: Record<string, RuntimeEntityState> = {};
  for (const component of snapshot.components) {
    const entity = entities[component.entityId] ?? { entityId: component.entityId, components: {} };
    entities[component.entityId] = { ...entity, components: { ...entity.components, [component.componentId]: { ...component.properties } } };
  }
  return { mode: "preview", tick: 0, frame: 0, sceneId: snapshot.initialSceneId, entities, variables: {}, lastInputSequence: 0 };
}

function claimDiagnostics(snapshot: RuntimeProjectSnapshot, caller: RuntimeCallerClaim): RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];
  if (caller.projectId !== snapshot.projectId) diagnostics.push(diagnostic("PROJECT_ID_MISMATCH", "caller.projectId", "Caller project claim does not match the runtime snapshot."));
  if (caller.ownerId !== snapshot.ownerId) diagnostics.push(diagnostic("OWNER_MISMATCH", "caller.ownerId", "Caller owner claim does not match the runtime snapshot."));
  if (caller.revisionId !== snapshot.projectRevisionId) diagnostics.push(diagnostic("CALLER_CLAIM_MISMATCH", "caller.revisionId", "Caller revision claim does not match the locked project revision."));
  return diagnostics;
}

function snapshotDiagnostics(snapshot: RuntimeProjectSnapshot): RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];
  if (snapshot.schemaVersion !== GAME_RUNTIME_SCHEMA_VERSION) diagnostics.push(diagnostic("UNKNOWN_SCHEMA", "schemaVersion", "Runtime snapshot schema is unsupported."));
  if (!stableId(snapshot.projectId) || !stableId(snapshot.ownerId) || !stableId(snapshot.projectRevisionId)) diagnostics.push(diagnostic("INVALID_SNAPSHOT", "identity", "Runtime snapshot identity is invalid."));
  if (!stableId(snapshot.initialSceneId) || !snapshot.sceneIds.includes(snapshot.initialSceneId)) diagnostics.push(diagnostic("UNKNOWN_SCENE", "initialSceneId", "Initial scene is not declared by the snapshot."));
  const componentIds = new Set<string>();
  for (const component of snapshot.components) {
    if (!stableId(component.componentId) || !stableId(component.entityId) || componentIds.has(component.componentId)) diagnostics.push(diagnostic("INVALID_SNAPSHOT", "components", "Component ids must be unique stable identifiers."));
    componentIds.add(component.componentId);
    const expected = componentPropertyTypes[component.type];
    if (!expected) diagnostics.push(diagnostic("UNKNOWN_COMPONENT", `components.${component.componentId}.type`, "Runtime snapshot contains an unknown component type."));
    if (!isRecord(component.properties)) {
      diagnostics.push(diagnostic("INVALID_SNAPSHOT", `components.${component.componentId}.properties`, "Runtime component properties must be an object."));
      continue;
    }
    for (const [key, value] of Object.entries(component.properties)) {
      if (!scalar(value)) diagnostics.push(diagnostic("INVALID_SNAPSHOT", `components.${component.componentId}.${key}`, "Component properties must be deterministic scalar values."));
      if (!expected?.[key] || typeof value !== expected[key] || (typeof value === "number" && !finite(value))) diagnostics.push(diagnostic("INVALID_SNAPSHOT", `components.${component.componentId}.${key}`, "Component property has an unknown key or invalid value type."));
    }
    if (expected && Object.keys(component.properties).length !== Object.keys(expected).length) diagnostics.push(diagnostic("INVALID_SNAPSHOT", `components.${component.componentId}.properties`, "Runtime component properties must be complete."));
  }
  return diagnostics;
}

export async function createRuntimeSnapshot(project: GameProject, caller: CallerContext): Promise<RuntimeResult<RuntimeProjectSnapshot>> {
  const projectValidation = validateGameProject(project, caller);
  if (!projectValidation.valid) return failure(...projectValidation.diagnostics.map((item) => diagnostic("INVALID_PROJECT", item.path, item.message)));
  const base = {
    schemaVersion: GAME_RUNTIME_SCHEMA_VERSION,
    projectId: String(project.projectId), ownerId: String(project.ownerId), projectRevisionId: String(project.revision.revisionId),
    projectHash: project.revision.snapshotHash, sceneIds: project.scenes.map((scene) => String(scene.sceneId)).sort(),
    initialSceneId: String(project.scenes[0]!.sceneId), assetLocks: collectAssets(project), components: collectComponents(project),
  } satisfies Omit<RuntimeProjectSnapshot, "snapshotHash">;
  const snapshotHash = await sha256(base);
  return success({ ...base, snapshotHash });
}

export function createRuntimeSession(snapshot: RuntimeProjectSnapshot, caller: RuntimeCallerClaim): RuntimeResult<RuntimeSession> {
  const diagnostics = [...snapshotDiagnostics(snapshot), ...claimDiagnostics(snapshot, caller)];
  if (diagnostics.length > 0) return failure(...diagnostics);
  return success({ snapshot, world: initialWorld(snapshot), checkpoints: [] });
}

function withMode(session: RuntimeSession, mode: RuntimeMode): RuntimeSession { return { ...session, world: { ...session.world, mode } }; }
export function previewRuntime(session: RuntimeSession): RuntimeSession { return withMode(session, "preview"); }
export function playRuntime(session: RuntimeSession): RuntimeResult<RuntimeSession> { return session.world.mode === "stopped" ? failure(diagnostic("RUNTIME_NOT_ACTIVE", "world.mode", "Stopped runtime must be reset before play.")) : success(withMode(session, "playing")); }
export function pauseRuntime(session: RuntimeSession): RuntimeResult<RuntimeSession> { return session.world.mode === "playing" ? success(withMode(session, "paused")) : failure(diagnostic("RUNTIME_NOT_ACTIVE", "world.mode", "Only a playing runtime can pause.")); }
export function stopRuntime(session: RuntimeSession): RuntimeSession { return withMode(session, "stopped"); }
export function resetRuntime(session: RuntimeSession): RuntimeSession { return { ...session, world: initialWorld(session.snapshot), checkpoints: [] }; }

function updateComponent(session: RuntimeSession, componentId: string, property: string, value: string | number | boolean): RuntimeResult<RuntimeSession> {
  const component = session.snapshot.components.find((item) => item.componentId === componentId);
  if (!component) return failure(diagnostic("UNKNOWN_COMPONENT", `component.${componentId}`, "Action targets an undeclared component."));
  if (!(property in component.properties)) return failure(diagnostic("UNKNOWN_COMPONENT", `component.${componentId}.${property}`, "Action targets an undeclared component property."));
  const entity = session.world.entities[component.entityId];
  if (!entity) return failure(diagnostic("UNKNOWN_ENTITY", `entity.${component.entityId}`, "Component entity is missing from runtime world."));
  const nextEntity = { ...entity, components: { ...entity.components, [componentId]: { ...entity.components[componentId], [property]: value } } };
  return success({ ...session, world: { ...session.world, entities: { ...session.world.entities, [component.entityId]: nextEntity } } });
}

export function stepRuntime(session: RuntimeSession, tickDelta: number, actions: readonly RuntimeAction[] = []): RuntimeResult<RuntimeSession> {
  if (!finite(tickDelta) || tickDelta <= 0 || !Number.isSafeInteger(tickDelta)) return failure(diagnostic("INVALID_TICK", "tickDelta", "Runtime tick must be a positive safe integer."));
  if (session.world.mode !== "playing" && session.world.mode !== "preview") return failure(diagnostic("RUNTIME_NOT_ACTIVE", "world.mode", "Runtime must be preview or playing to step."));
  let next = session;
  let lastSequence = session.world.lastInputSequence;
  for (const action of actions) {
    if (!stableId(action.actionId) || !Number.isSafeInteger(action.sequence) || action.sequence <= lastSequence || action.phase === "canceled") return failure(diagnostic("NON_DETERMINISTIC_INPUT", "actions", "Input sequence must be strictly increasing and non-canceled."));
    if (!scalar(action.value) && !(isRecord(action.value) && finite(action.value.x) && finite(action.value.y))) return failure(diagnostic("INVALID_ACTION", "actions.value", "Action value is not a deterministic scalar or axis."));
    lastSequence = action.sequence;
    if (action.actionId === "runtime.set_variable" && typeof action.value === "string") next = { ...next, world: { ...next.world, variables: { ...next.world.variables, [action.value]: true } } };
  }
  return success({ ...next, world: { ...next.world, tick: next.world.tick + tickDelta, frame: next.world.frame + 1, lastInputSequence: lastSequence } });
}

export function setRuntimeComponentProperty(session: RuntimeSession, caller: RuntimeCallerClaim, componentId: string, property: string, value: string | number | boolean): RuntimeResult<RuntimeSession> {
  const claim = claimDiagnostics(session.snapshot, caller);
  if (claim.length > 0) return failure(...claim);
  return updateComponent(session, componentId, property, value);
}

function savePayload(save: Omit<RuntimeSaveState, "stateHash">): unknown { return save; }

export async function saveRuntimeState(session: RuntimeSession): Promise<RuntimeResult<RuntimeSaveState>> {
  const base = { schemaVersion: GAME_SAVE_STATE_SCHEMA_VERSION, runtimeSchemaVersion: GAME_RUNTIME_SCHEMA_VERSION, projectId: session.snapshot.projectId, ownerId: session.snapshot.ownerId, projectRevisionId: session.snapshot.projectRevisionId, projectHash: session.snapshot.projectHash, assetLocks: session.snapshot.assetLocks, world: session.world } satisfies Omit<RuntimeSaveState, "stateHash">;
  return success({ ...base, stateHash: await sha256(savePayload(base)) });
}

export async function serializeRuntimeSaveState(state: RuntimeSaveState): Promise<string> { return canonicalJson(state); }

export async function validateRuntimeSaveState(value: unknown, snapshot: RuntimeProjectSnapshot, caller: RuntimeCallerClaim): Promise<RuntimeResult<RuntimeSaveState>> {
  const diagnostics = [...snapshotDiagnostics(snapshot), ...claimDiagnostics(snapshot, caller)];
  if (!isRecord(value) || value.schemaVersion !== GAME_SAVE_STATE_SCHEMA_VERSION || value.runtimeSchemaVersion !== GAME_RUNTIME_SCHEMA_VERSION) diagnostics.push(diagnostic("UNKNOWN_SCHEMA", "schemaVersion", "Save State schema is unsupported."));
  if (!isRecord(value)) return failure(...diagnostics, diagnostic("INVALID_SAVE_STATE", "saveState", "Save State must be an object."));
  if (value.projectId !== snapshot.projectId) diagnostics.push(diagnostic("PROJECT_ID_MISMATCH", "projectId", "Save State project does not match the snapshot."));
  if (value.ownerId !== snapshot.ownerId) diagnostics.push(diagnostic("OWNER_MISMATCH", "ownerId", "Save State owner does not match the snapshot."));
  if (value.projectRevisionId !== snapshot.projectRevisionId) diagnostics.push(diagnostic("PROJECT_REVISION_MISMATCH", "projectRevisionId", "Save State revision is stale."));
  if (value.projectHash !== snapshot.projectHash) diagnostics.push(diagnostic("PROJECT_REVISION_MISMATCH", "projectHash", "Save State project hash is stale."));
  if (canonicalJson(value.assetLocks) !== canonicalJson(snapshot.assetLocks)) diagnostics.push(diagnostic("ASSET_REVISION_MISMATCH", "assetLocks", "Save State asset locks do not match the snapshot."));
  if (!isRecord(value.world) || !isRecord(value.world.entities) || !isRecord(value.world.variables)) diagnostics.push(diagnostic("INVALID_SAVE_STATE", "world", "World state shape is invalid."));
  if (diagnostics.length > 0) return failure(...diagnostics);
  const state = value as unknown as RuntimeSaveState;
  if (!state.stateHash) return failure(diagnostic("INVALID_SAVE_STATE", "stateHash", "Save State hash is required."));
  const { stateHash: _stateHash, ...withoutHash } = state;
  if (await sha256(withoutHash) !== state.stateHash) return failure(diagnostic("INVALID_SAVE_STATE", "stateHash", "Save State content hash does not match its contents."));
  return success(state);
}

export async function restoreRuntimeState(session: RuntimeSession, state: RuntimeSaveState, caller: RuntimeCallerClaim): Promise<RuntimeResult<RuntimeSession>> {
  const validation = await validateRuntimeSaveState(state, session.snapshot, caller);
  return validation.ok ? success({ ...session, world: cloneWorld(validation.value!.world) }) : failure(...validation.diagnostics);
}

export async function createRuntimeCheckpoint(session: RuntimeSession, checkpointId: string): Promise<RuntimeResult<RuntimeSession>> {
  if (!stableId(checkpointId)) return failure(diagnostic("INVALID_SAVE_STATE", "checkpointId", "Checkpoint id must be stable."));
  const saved = await saveRuntimeState(session);
  if (!saved.ok) return failure(...saved.diagnostics);
  return success({ ...session, checkpoints: [...session.checkpoints.filter((item) => item.checkpointId !== checkpointId), { checkpointId, saveState: saved.value! }] });
}

export async function restoreRuntimeCheckpoint(session: RuntimeSession, checkpointId: string, caller: RuntimeCallerClaim): Promise<RuntimeResult<RuntimeSession>> {
  const checkpoint = session.checkpoints.find((item) => item.checkpointId === checkpointId);
  if (!checkpoint) return failure(diagnostic("CHECKPOINT_NOT_FOUND", "checkpointId", "Runtime checkpoint was not found."));
  return restoreRuntimeState(session, checkpoint.saveState, caller);
}

export function migrateRuntimeSaveState(value: unknown, _snapshot: RuntimeProjectSnapshot): RuntimeResult<RuntimeSaveState> {
  return failure(diagnostic("UNSUPPORTED_MIGRATION", "schemaVersion", "GAME-320 does not silently migrate Save State; explicit migration belongs to a future contract."));
}
