/**
 * GAME-350 canonical editor adapter.
 *
 * This module is the narrow, host-neutral seam between a Game Studio UI and
 * GAME-300/330/340. It owns editor intent and selection only. It does not own
 * runtime save state, resolve a Registry, mutate Draw/Audio, or access a host.
 */

import {
  asAssetId,
  asAssetRevisionId,
  asComponentId,
  asEntityId,
  asProjectId,
  asRevisionId,
  asSceneId,
  asSha256,
  createGameProject,
  validateGameProject,
  type AssetRevisionReference,
  type CallerContext,
  type Component,
  type Entity,
  type GameProject,
  type GameProjectDraft,
  type Revision,
  type Scene,
  type Sha256,
} from "../game-300/core.ts";
import {
  createBuildPlan,
  type BuildPlan,
  type BuildPlanRequest,
} from "../game-330/core.ts";

export const GAME350_EDITOR_SCHEMA_VERSION = 1 as const;

/** The five editor zones are presentation coordinates, not Project state. */
export type Game350EditorRail = "ACTION" | "HIERARCHY" | "VIEWPORT" | "INSPECTOR" | "TIMELINE";

export interface Game350EditorSelection {
  readonly sceneId?: Scene["sceneId"];
  readonly entityId?: Entity["entityId"];
  readonly componentId?: Component["componentId"];
}

export interface Game350EditorSnapshot {
  readonly schemaVersion: typeof GAME350_EDITOR_SCHEMA_VERSION;
  readonly project: GameProject;
  readonly activeRail: Game350EditorRail;
  /** Selection is local editor state; it is not runtime save state or a Project mutation. */
  readonly selection: Game350EditorSelection;
}

export type Game350EditorDiagnosticCode =
  | "INVALID_COMMAND"
  | "INVALID_SNAPSHOT"
  | "CALLER_MISMATCH"
  | "STALE_COMMAND"
  | "MISSING_SCENE"
  | "MISSING_ENTITY"
  | "MISSING_COMPONENT"
  | "DUPLICATE_ID"
  | "INVALID_NAME"
  | "INVALID_COMPONENT"
  | "INVALID_ASSET_REFERENCE"
  | "ASSET_KIND_MISMATCH"
  | "LIVE_BUILD_REFERENCE"
  | "BUILD_INVALID";

export interface Game350EditorDiagnostic {
  readonly code: Game350EditorDiagnosticCode;
  readonly path: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface Game350EditorResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly diagnostics: readonly Game350EditorDiagnostic[];
}

interface Game350EditorCommandBase {
  readonly commandId: string;
  readonly baseRevisionId: GameProject["revision"]["revisionId"];
  readonly nextRevisionId: GameProject["revision"]["revisionId"];
}

export interface AddSceneCommand extends Game350EditorCommandBase {
  readonly type: "ADD_SCENE";
  readonly sceneId: Scene["sceneId"];
  readonly name: string;
}

export interface AddEntityCommand extends Game350EditorCommandBase {
  readonly type: "ADD_ENTITY";
  readonly sceneId: Scene["sceneId"];
  readonly entityId: Entity["entityId"];
  readonly name: string;
  readonly parentEntityId?: Entity["entityId"];
}

export interface AddComponentCommand extends Game350EditorCommandBase {
  readonly type: "ADD_COMPONENT";
  readonly sceneId: Scene["sceneId"];
  readonly entityId: Entity["entityId"];
  readonly component: Component;
}

export interface BindAssetCommand extends Game350EditorCommandBase {
  readonly type: "BIND_ASSET";
  /** Binds a Draw/Audio reference; it never carries source bytes or edits. */
  readonly sceneId: Scene["sceneId"];
  readonly entityId: Entity["entityId"];
  readonly componentId: Component["componentId"];
  readonly asset: AssetRevisionReference;
}

export type Game350EditorCommand = AddSceneCommand | AddEntityCommand | AddComponentCommand | BindAssetCommand;

export type Game350BuildProjectionInput = Omit<BuildPlanRequest, "assetLocks">;

function success<T>(value: T): Game350EditorResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(...diagnostics: Game350EditorDiagnostic[]): Game350EditorResult<T> {
  return { ok: false, diagnostics };
}

function diagnostic(code: Game350EditorDiagnosticCode, path: string, message: string, recoverable = true): Game350EditorDiagnostic {
  return { code, path, message, recoverable };
}

function stable(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function validHash(value: unknown): value is Sha256 {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function assetReferenceDiagnostics(asset: AssetRevisionReference, ownerId: GameProject["ownerId"], path: string): Game350EditorDiagnostic[] {
  const diagnostics: Game350EditorDiagnostic[] = [];
  if (asset.ownerId !== ownerId) diagnostics.push(diagnostic("INVALID_ASSET_REFERENCE", `${path}.ownerId`, "Asset owner must match the canonical Project owner."));
  if (asset.mode !== "LIVE" && asset.mode !== "PINNED") diagnostics.push(diagnostic("INVALID_ASSET_REFERENCE", `${path}.mode`, "Asset reference mode must be LIVE or PINNED."));
  if (!stable(String(asset.assetId)) || !stable(String(asset.revisionId))) diagnostics.push(diagnostic("INVALID_ASSET_REFERENCE", path, "Asset id and revision id must be stable identifiers."));
  if (!validHash(asset.contentHash)) diagnostics.push(diagnostic("INVALID_ASSET_REFERENCE", `${path}.contentHash`, "Asset content hash must be lowercase SHA-256."));
  try {
    asAssetId(String(asset.assetId));
    asAssetRevisionId(String(asset.revisionId));
    asSha256(String(asset.contentHash));
  } catch (error) {
    diagnostics.push(diagnostic("INVALID_ASSET_REFERENCE", path, error instanceof Error ? error.message : "Asset reference is invalid."));
  }
  return diagnostics;
}

function rail(value: unknown): value is Game350EditorRail {
  return value === "ACTION" || value === "HIERARCHY" || value === "VIEWPORT" || value === "INSPECTOR" || value === "TIMELINE";
}

function callerDiagnostics(project: GameProject, caller: CallerContext): Game350EditorDiagnostic[] {
  const result: Game350EditorDiagnostic[] = [];
  if (project.projectId !== caller.projectId || project.revision.projectId !== caller.projectId) {
    result.push(diagnostic("CALLER_MISMATCH", "caller.projectId", "Caller Project does not match the canonical Project."));
  }
  if (project.ownerId !== caller.ownerId || project.revision.ownerId !== caller.ownerId) {
    result.push(diagnostic("CALLER_MISMATCH", "caller.ownerId", "Caller owner does not match the canonical Project."));
  }
  if (project.revision.revisionId !== caller.revisionId) {
    result.push(diagnostic("CALLER_MISMATCH", "caller.revisionId", "Caller revision is stale or belongs to another Project."));
  }
  return result;
}

function selectionDiagnostics(snapshot: Game350EditorSnapshot): Game350EditorDiagnostic[] {
  const { project, selection } = snapshot;
  if (selection.entityId !== undefined && selection.sceneId === undefined) {
    return [diagnostic("INVALID_SNAPSHOT", "selection.entityId", "An Entity selection requires a Scene selection.")];
  }
  if (selection.componentId !== undefined && selection.entityId === undefined) {
    return [diagnostic("INVALID_SNAPSHOT", "selection.componentId", "A Component selection requires an Entity selection.")];
  }
  if (selection.sceneId === undefined) return [];
  const scene = project.scenes.find((item) => item.sceneId === selection.sceneId);
  if (scene === undefined) return [diagnostic("MISSING_SCENE", "selection.sceneId", `Scene ${String(selection.sceneId)} is not in the Project.`)];
  if (selection.entityId === undefined) return [];
  const entity = scene.entities.find((item) => item.entityId === selection.entityId);
  if (entity === undefined) return [diagnostic("MISSING_ENTITY", "selection.entityId", `Entity ${String(selection.entityId)} is not in the selected Scene.`)];
  if (selection.componentId !== undefined && !entity.components.some((item) => item.componentId === selection.componentId)) {
    return [diagnostic("MISSING_COMPONENT", "selection.componentId", `Component ${String(selection.componentId)} is not in the selected Entity.`)];
  }
  return [];
}

function coreProjectDiagnostics(project: GameProject, caller: CallerContext): Game350EditorDiagnostic[] {
  const validation = validateGameProject(project, caller);
  const diagnostics = validation.diagnostics.map((item) => diagnostic(
    item.code === "CALLER_OWNER_MISMATCH" || item.code === "CALLER_REVISION_MISMATCH" || item.code === "PROJECT_ID_MISMATCH" ? "CALLER_MISMATCH" : "INVALID_SNAPSHOT",
    item.path,
    item.message,
  ));
  for (const asset of referencedAssets(project)) diagnostics.push(...assetReferenceDiagnostics(asset, project.ownerId, `asset.${String(asset.assetId)}`));
  return diagnostics;
}

export function validateGame350EditorSnapshot(snapshot: Game350EditorSnapshot, caller: CallerContext): Game350EditorResult<Game350EditorSnapshot> {
  if (snapshot.schemaVersion !== GAME350_EDITOR_SCHEMA_VERSION) return failure(diagnostic("INVALID_SNAPSHOT", "schemaVersion", "Unsupported GAME-350 editor snapshot schema."));
  if (!rail(snapshot.activeRail)) return failure(diagnostic("INVALID_SNAPSHOT", "activeRail", "Editor rail is not supported."));
  const diagnostics = [...callerDiagnostics(snapshot.project, caller), ...coreProjectDiagnostics(snapshot.project, caller), ...selectionDiagnostics(snapshot)];
  return diagnostics.length > 0 ? failure(...diagnostics) : success(snapshot);
}

function defaultSelection(project: GameProject): Game350EditorSelection {
  const scene = project.scenes[0];
  const entity = scene?.entities[0];
  const component = entity?.components[0];
  return {
    ...(scene === undefined ? {} : { sceneId: scene.sceneId }),
    ...(entity === undefined ? {} : { entityId: entity.entityId }),
    ...(component === undefined ? {} : { componentId: component.componentId }),
  };
}

/** Create the editor projection from the existing GAME-300 Project factory. */
export async function createGame350EditorSnapshot(
  draft: GameProjectDraft,
  caller: CallerContext,
  activeRail: Game350EditorRail = "VIEWPORT",
): Promise<Game350EditorResult<Game350EditorSnapshot>> {
  if (!rail(activeRail)) return failure(diagnostic("INVALID_SNAPSHOT", "activeRail", "Editor rail is not supported."));
  try {
    const project = await createGameProject(draft, caller);
    return success({ schemaVersion: GAME350_EDITOR_SCHEMA_VERSION, project, activeRail, selection: defaultSelection(project) });
  } catch (error) {
    return failure(diagnostic("INVALID_SNAPSHOT", "project", error instanceof Error ? error.message : "Game Project could not be created."));
  }
}

export function selectGame350EditorTarget(
  snapshot: Game350EditorSnapshot,
  caller: CallerContext,
  selection: Game350EditorSelection,
): Game350EditorResult<Game350EditorSnapshot> {
  const checked = validateGame350EditorSnapshot(snapshot, caller);
  if (!checked.ok) return checked;
  const next = { ...snapshot, selection };
  const selectionIssues = selectionDiagnostics(next);
  return selectionIssues.length > 0 ? failure(...selectionIssues) : success(next);
}

function commandDiagnostics(snapshot: Game350EditorSnapshot, command: Game350EditorCommand): Game350EditorDiagnostic[] {
  const result: Game350EditorDiagnostic[] = [];
  if (!stable(command.commandId)) result.push(diagnostic("INVALID_COMMAND", "commandId", "Command id must be a stable identifier."));
  if (!stable(String(command.baseRevisionId)) || !stable(String(command.nextRevisionId))) result.push(diagnostic("INVALID_COMMAND", "revision", "Command revisions must be stable identifiers."));
  if (String(command.baseRevisionId) !== String(snapshot.project.revision.revisionId)) result.push(diagnostic("STALE_COMMAND", "baseRevisionId", "Command base revision is not the current Project revision."));
  if (String(command.nextRevisionId) === String(command.baseRevisionId)) result.push(diagnostic("INVALID_COMMAND", "nextRevisionId", "A mutating command must create a new revision."));
  return result;
}

function collectionHasEntity(project: GameProject, entityId: string): boolean {
  return project.scenes.some((scene) => scene.entities.some((entity) => String(entity.entityId) === entityId));
}

function collectionHasComponent(project: GameProject, componentId: string): boolean {
  return project.scenes.some((scene) => scene.entities.some((entity) => entity.components.some((component) => String(component.componentId) === componentId)));
}

function projectWithRevision(project: GameProject, nextRevisionId: GameProject["revision"]["revisionId"], changes: Omit<GameProject, "revision">): GameProjectDraft {
  const revision: Omit<Revision, "snapshotHash"> = {
    revisionId: nextRevisionId,
    projectId: project.projectId,
    ownerId: project.ownerId,
    sequence: project.revision.sequence + 1,
    parentRevisionId: project.revision.revisionId,
  };
  return { ...changes, revision };
}

async function commitProject(
  snapshot: Game350EditorSnapshot,
  caller: CallerContext,
  command: Game350EditorCommand,
  changes: Omit<GameProject, "revision">,
  selection: Game350EditorSelection,
): Promise<Game350EditorResult<Game350EditorSnapshot>> {
  try {
    const nextRevisionId = asRevisionId(String(command.nextRevisionId));
    const nextProject = await createGameProject(projectWithRevision(snapshot.project, nextRevisionId, changes), {
      projectId: asProjectId(String(snapshot.project.projectId)),
      ownerId: caller.ownerId,
      revisionId: nextRevisionId,
    });
    const nextSnapshot: Game350EditorSnapshot = { ...snapshot, project: nextProject, selection };
    const checked = validateGame350EditorSnapshot(nextSnapshot, { ...caller, revisionId: nextRevisionId });
    return checked.ok ? checked : failure(...checked.diagnostics);
  } catch (error) {
    return failure(diagnostic("INVALID_SNAPSHOT", "project", error instanceof Error ? error.message : "Command could not produce a valid Project."));
  }
}

/** Apply one canonical editor command without mutating the input snapshot. */
export async function applyGame350EditorCommand(
  snapshot: Game350EditorSnapshot,
  caller: CallerContext,
  command: Game350EditorCommand,
): Promise<Game350EditorResult<Game350EditorSnapshot>> {
  const checked = validateGame350EditorSnapshot(snapshot, caller);
  if (!checked.ok) return checked;
  const commandIssues = commandDiagnostics(snapshot, command);
  if (commandIssues.length > 0) return failure(...commandIssues);
  const project = snapshot.project;

  if (command.type === "ADD_SCENE") {
    if (!stable(String(command.sceneId))) return failure(diagnostic("INVALID_COMMAND", "sceneId", "Scene id must be stable."));
    if (project.scenes.some((scene) => scene.sceneId === command.sceneId)) return failure(diagnostic("DUPLICATE_ID", "sceneId", `Scene ${String(command.sceneId)} already exists.`));
    if (!command.name.trim()) return failure(diagnostic("INVALID_NAME", "name", "Scene name is required."));
    const scene: Scene = { sceneId: asSceneId(String(command.sceneId)), name: command.name.trim(), rootEntityIds: [], entities: [] };
    return commitProject(snapshot, caller, command, { ...project, scenes: [...project.scenes, scene] }, { sceneId: scene.sceneId });
  }

  const scene = project.scenes.find((item) => item.sceneId === command.sceneId);
  if (scene === undefined) return failure(diagnostic("MISSING_SCENE", "sceneId", `Scene ${String(command.sceneId)} is not in the Project.`));

  if (command.type === "ADD_ENTITY") {
    if (!stable(String(command.entityId))) return failure(diagnostic("INVALID_COMMAND", "entityId", "Entity id must be stable."));
    if (collectionHasEntity(project, String(command.entityId))) return failure(diagnostic("DUPLICATE_ID", "entityId", `Entity ${String(command.entityId)} already exists.`));
    if (!command.name.trim()) return failure(diagnostic("INVALID_NAME", "name", "Entity name is required."));
    if (command.parentEntityId !== undefined && !scene.entities.some((entity) => entity.entityId === command.parentEntityId)) return failure(diagnostic("MISSING_ENTITY", "parentEntityId", "Parent Entity must belong to the selected Scene."));
    const entity: Entity = { entityId: asEntityId(String(command.entityId)), name: command.name.trim(), components: [], ...(command.parentEntityId === undefined ? {} : { parentEntityId: command.parentEntityId }) };
    const nextScene = { ...scene, entities: [...scene.entities, entity], rootEntityIds: command.parentEntityId === undefined ? [...scene.rootEntityIds, entity.entityId] : scene.rootEntityIds };
    return commitProject(snapshot, caller, command, { ...project, scenes: project.scenes.map((item) => item.sceneId === scene.sceneId ? nextScene : item) }, { sceneId: scene.sceneId, entityId: entity.entityId });
  }

  const entity = scene.entities.find((item) => item.entityId === command.entityId);
  if (entity === undefined) return failure(diagnostic("MISSING_ENTITY", "entityId", `Entity ${String(command.entityId)} is not in Scene ${String(scene.sceneId)}.`));

  if (command.type === "ADD_COMPONENT") {
    if (!stable(String(command.component.componentId))) return failure(diagnostic("INVALID_COMPONENT", "component.componentId", "Component id must be stable."));
    if (collectionHasComponent(project, String(command.component.componentId))) return failure(diagnostic("DUPLICATE_ID", "component.componentId", `Component ${String(command.component.componentId)} already exists.`));
    if (command.component.type === "SPRITE" || command.component.type === "AUDIO_SOURCE") {
      const assetIssues = assetReferenceDiagnostics(command.component.asset, project.ownerId, "component.asset");
      if (assetIssues.length > 0) return failure(...assetIssues);
    }
    const nextScene = { ...scene, entities: scene.entities.map((item) => item.entityId === entity.entityId ? { ...item, components: [...item.components, command.component] } : item) };
    return commitProject(snapshot, caller, command, { ...project, scenes: project.scenes.map((item) => item.sceneId === scene.sceneId ? nextScene : item) }, { sceneId: scene.sceneId, entityId: entity.entityId, componentId: command.component.componentId });
  }

  const component = entity.components.find((item) => item.componentId === command.componentId);
  if (component === undefined) return failure(diagnostic("MISSING_COMPONENT", "componentId", `Component ${String(command.componentId)} is not in Entity ${String(entity.entityId)}.`));
  if (component.type !== "SPRITE" && component.type !== "AUDIO_SOURCE") return failure(diagnostic("ASSET_KIND_MISMATCH", "component.type", "Only Draw Sprite and Audio Source components accept asset bindings."));
  if (component.type === "SPRITE" && command.asset.kind !== "DRAW") return failure(diagnostic("ASSET_KIND_MISMATCH", "asset.kind", "Sprite components require a DRAW asset."));
  if (component.type === "AUDIO_SOURCE" && command.asset.kind !== "AUDIO") return failure(diagnostic("ASSET_KIND_MISMATCH", "asset.kind", "Audio Source components require an AUDIO asset."));
  const assetIssues = assetReferenceDiagnostics(command.asset, project.ownerId, "asset");
  if (assetIssues.length > 0) return failure(...assetIssues);
  const nextComponent: Component = component.type === "SPRITE"
    ? { ...component, asset: command.asset as Extract<Component, { readonly type: "SPRITE" }>["asset"] }
    : { ...component, asset: command.asset as Extract<Component, { readonly type: "AUDIO_SOURCE" }>["asset"] };
  const nextScene = { ...scene, entities: scene.entities.map((item) => item.entityId === entity.entityId ? { ...item, components: item.components.map((itemComponent) => itemComponent.componentId === component.componentId ? nextComponent : itemComponent) } : item) };
  return commitProject(snapshot, caller, command, { ...project, scenes: project.scenes.map((item) => item.sceneId === scene.sceneId ? nextScene : item) }, { sceneId: scene.sceneId, entityId: entity.entityId, componentId: component.componentId });
}

function referencedAssets(project: GameProject): AssetRevisionReference[] {
  const byKey = new Map<string, AssetRevisionReference>();
  for (const scene of project.scenes) for (const entity of scene.entities) for (const component of entity.components) {
    if (component.type !== "SPRITE" && component.type !== "AUDIO_SOURCE") continue;
    const asset = component.asset;
    byKey.set(`${asset.kind}:${String(asset.assetId)}:${String(asset.revisionId)}:${String(asset.contentHash)}`, asset);
  }
  return [...byKey.values()].sort((left, right) => `${left.kind}:${String(left.assetId)}:${String(left.revisionId)}`.localeCompare(`${right.kind}:${String(right.assetId)}:${String(right.revisionId)}`));
}

/** Project editor references into the existing GAME-330 BuildPlanRequest contract. */
export function projectGame350BuildPlanRequest(
  snapshot: Game350EditorSnapshot,
  caller: CallerContext,
  input: Game350BuildProjectionInput,
): Game350EditorResult<BuildPlanRequest> {
  const checked = validateGame350EditorSnapshot(snapshot, caller);
  if (!checked.ok) return failure(...checked.diagnostics);
  const assetLocks: Array<BuildPlanRequest["assetLocks"][number]> = [];
  for (const asset of referencedAssets(snapshot.project)) {
    const assetIssues = assetReferenceDiagnostics(asset, snapshot.project.ownerId, `asset.${String(asset.assetId)}`);
    if (assetIssues.length > 0) return failure(...assetIssues);
    if (asset.mode !== "PINNED") return failure(diagnostic("LIVE_BUILD_REFERENCE", `asset.${String(asset.assetId)}`, "Build projection requires PINNED Draw/Audio references; LIVE is preview-only."));
    assetLocks.push({ assetId: String(asset.assetId), revisionId: String(asset.revisionId), kind: asset.kind, contentHash: asset.contentHash, mode: "PINNED" });
  }
  return success({ ...input, assetLocks });
}

/** Validate the projected request with the existing deterministic GAME-330 builder. */
export async function prepareGame350BuildPlan(
  snapshot: Game350EditorSnapshot,
  caller: CallerContext,
  input: Game350BuildProjectionInput,
): Promise<Game350EditorResult<BuildPlan>> {
  const projected = projectGame350BuildPlanRequest(snapshot, caller, input);
  if (!projected.ok || projected.value === undefined) return failure(...projected.diagnostics);
  const result = await createBuildPlan(snapshot.project, caller, projected.value);
  if (!result.ok || result.value === undefined) return failure(...result.diagnostics.map((item) => diagnostic("BUILD_INVALID", item.path, item.message)));
  return success(result.value);
}
