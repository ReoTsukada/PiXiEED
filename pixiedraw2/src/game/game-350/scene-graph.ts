/**
 * GAME-350 immutable Scene/Hierarchy operations.
 *
 * GAME-300 remains the canonical Scene shape.  GAME-350 only adds the
 * authoring-side Active flag as an optional field, so legacy Scenes remain
 * valid and can be edited without a migration.
 */

import type {
  Component,
  Entity,
  EntityId,
  Prefab,
  Scene,
  SceneId,
} from "../game-300/core.ts";

export type Game350Entity = Omit<Entity, "components"> & {
  readonly active?: boolean;
  readonly components: readonly Component[];
};

export type Game350Scene = Omit<Scene, "entities"> & {
  readonly entities: readonly Game350Entity[];
};

export interface SceneHierarchyDiagnostic {
  readonly code:
    | "DUPLICATE_ID"
    | "DUPLICATE_COMPONENT_ID"
    | "MISSING_PARENT"
    | "CYCLE"
    | "INVALID_ROOT"
    | "MISSING_ROOT"
    | "FOREIGN_TARGET"
    | "PREFAB_DESIGN_GATE";
  readonly path: string;
  readonly message: string;
}

export interface SceneHierarchyValidation {
  readonly valid: boolean;
  readonly diagnostics: readonly SceneHierarchyDiagnostic[];
}

export interface SceneHierarchyNode {
  readonly entity: Game350Entity;
  readonly depth: number;
  readonly children: readonly SceneHierarchyNode[];
}

export interface SceneGraphResult {
  readonly ok: boolean;
  readonly value?: Game350Scene;
  /** Alias for callers that use the domain term instead of value. */
  readonly scene?: Game350Scene;
  readonly changed: boolean;
  readonly diagnostics: readonly SceneHierarchyDiagnostic[];
}

export interface DuplicateEntityOptions {
  readonly entityId?: EntityId;
  readonly componentIdFor?: (
    original: Component,
    index: number,
  ) => Component["componentId"];
  readonly includeDescendants?: boolean;
}

export const GAME350_PREFAB_DESIGN_GATE = "PREFAB_DESIGN_GATE" as const;

function diagnostic(
  code: SceneHierarchyDiagnostic["code"],
  path: string,
  message: string,
): SceneHierarchyDiagnostic {
  return { code, path, message };
}

function asGame350Scene(scene: Scene): Game350Scene {
  return scene as Game350Scene;
}

function entityMap(scene: Game350Scene): Map<string, Game350Entity> {
  return new Map(scene.entities.map((entity) => [String(entity.entityId), entity]));
}

function componentIds(scene: Game350Scene): string[] {
  return scene.entities.flatMap((entity) =>
    entity.components.map((component) => String(component.componentId))
  );
}

function duplicateDiagnostics(
  values: readonly string[],
  code: SceneHierarchyDiagnostic["code"],
  path: string,
): SceneHierarchyDiagnostic[] {
  const seen = new Set<string>();
  const diagnostics: SceneHierarchyDiagnostic[] = [];
  for (const value of values) {
    if (seen.has(value)) diagnostics.push(diagnostic(code, path, `Duplicate id: ${value}`));
    seen.add(value);
  }
  return diagnostics;
}

/** Validate one complete Scene, including roots, parents, cycles and IDs. */
export function validateSceneHierarchy(scene: Scene): SceneHierarchyValidation {
  const candidate = asGame350Scene(scene);
  const diagnostics: SceneHierarchyDiagnostic[] = [];
  const ids = candidate.entities.map((entity) => String(entity.entityId));
  const byId = entityMap(candidate);
  diagnostics.push(...duplicateDiagnostics(ids, "DUPLICATE_ID", "entities.entityId"));
  diagnostics.push(...duplicateDiagnostics(componentIds(candidate), "DUPLICATE_COMPONENT_ID", "entities.components.componentId"));

  const roots = candidate.rootEntityIds.map(String);
  diagnostics.push(...duplicateDiagnostics(roots, "INVALID_ROOT", "rootEntityIds"));
  for (const rootId of roots) {
    const root = byId.get(rootId);
    if (root === undefined) {
      diagnostics.push(diagnostic("MISSING_ROOT", "rootEntityIds", `Root Entity ${rootId} is missing.`));
    } else if (root.parentEntityId !== undefined) {
      diagnostics.push(diagnostic("INVALID_ROOT", `rootEntityIds.${rootId}`, "A root Entity cannot have a parent."));
    }
  }
  for (const entity of candidate.entities) {
    if (entity.active !== undefined && typeof entity.active !== "boolean") {
      diagnostics.push(diagnostic("INVALID_ROOT", `entities.${String(entity.entityId)}.active`, "Entity active must be boolean."));
    }
    if (entity.prefabId !== undefined) {
      diagnostics.push(diagnostic("PREFAB_DESIGN_GATE", `entities.${String(entity.entityId)}.prefabId`, "Prefab operations are unavailable until the ownership design gate is closed."));
    }
    if (entity.parentEntityId !== undefined && !byId.has(String(entity.parentEntityId))) {
      diagnostics.push(diagnostic("MISSING_PARENT", `entities.${String(entity.entityId)}.parentEntityId`, "Parent Entity must belong to this Scene."));
    }
    const seen = new Set<string>([String(entity.entityId)]);
    let parentId = entity.parentEntityId;
    while (parentId !== undefined) {
      const key = String(parentId);
      if (seen.has(key)) {
        diagnostics.push(diagnostic("CYCLE", "entities", `Entity parent cycle includes ${String(entity.entityId)}.`));
        break;
      }
      seen.add(key);
      parentId = byId.get(key)?.parentEntityId;
    }
  }
  const rootSet = new Set(roots);
  for (const entity of candidate.entities) {
    const id = String(entity.entityId);
    if (entity.parentEntityId === undefined && !rootSet.has(id)) {
      diagnostics.push(diagnostic("MISSING_ROOT", `entities.${id}`, "A parentless Entity must occur in rootEntityIds."));
    }
    if (entity.parentEntityId !== undefined && rootSet.has(id)) {
      diagnostics.push(diagnostic("INVALID_ROOT", `entities.${id}`, "A child Entity cannot occur in rootEntityIds."));
    }
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function requireValid(scene: Game350Scene): void {
  const checked = validateSceneHierarchy(scene);
  if (!checked.valid) throw new Error(checked.diagnostics.map((item) => `${item.code}:${item.path}`).join("; "));
}

/** Build a deterministic tree in root/entity array order without mutating the Scene. */
export function buildSceneHierarchy(scene: Scene): readonly SceneHierarchyNode[] {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const byId = entityMap(candidate);
  const children = new Map<string, Game350Entity[]>();
  for (const entity of candidate.entities) {
    const parent = entity.parentEntityId === undefined ? "" : String(entity.parentEntityId);
    const list = children.get(parent) ?? [];
    list.push(entity);
    children.set(parent, list);
  }
  const visit = (entity: Game350Entity, depth: number): SceneHierarchyNode => ({
    entity,
    depth,
    children: (children.get(String(entity.entityId)) ?? []).map((child) => visit(child, depth + 1)),
  });
  return candidate.rootEntityIds.map((id) => byId.get(String(id))!).map((entity) => visit(entity, 0));
}

export function flattenSceneHierarchy(scene: Scene): readonly SceneHierarchyNode[] {
  const result: SceneHierarchyNode[] = [];
  const visit = (node: SceneHierarchyNode): void => {
    result.push(node);
    node.children.forEach(visit);
  };
  buildSceneHierarchy(scene).forEach(visit);
  return result;
}

function result(scene: Game350Scene, changed: boolean): SceneGraphResult {
  return { ok: true, value: scene, scene, changed, diagnostics: [] };
}

function failure(...diagnostics: SceneHierarchyDiagnostic[]): SceneGraphResult {
  return { ok: false, changed: false, diagnostics };
}

function targetId(value: EntityId | { readonly sceneId: SceneId; readonly entityId: EntityId }): string {
  return typeof value === "object" ? String(value.entityId) : String(value);
}

function targetDiagnostics(
  scene: Game350Scene,
  value: EntityId | { readonly sceneId: SceneId; readonly entityId: EntityId },
  path: string,
): SceneHierarchyDiagnostic[] {
  if (typeof value === "object" && String(value.sceneId) !== String(scene.sceneId)) {
    return [diagnostic("FOREIGN_TARGET", path, "Target Entity belongs to another Scene.")];
  }
  if (!entityMap(scene).has(targetId(value))) {
    return [diagnostic("MISSING_PARENT", path, "Target Entity is not in this Scene.")];
  }
  return [];
}

export function renameEntity(scene: Scene, entityId: EntityId, name: string): SceneGraphResult {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const entity = entityMap(candidate).get(String(entityId));
  if (entity === undefined) return failure(diagnostic("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  const trimmed = name.trim();
  if (trimmed.length === 0) return failure(diagnostic("INVALID_ROOT", "name", "Entity name is required."));
  if (trimmed === entity.name) return result(candidate, false);
  const next = { ...candidate, entities: candidate.entities.map((item) => item.entityId === entityId ? { ...item, name: trimmed } : item) };
  return result(next, true);
}

export function reparentEntity(
  scene: Scene,
  entityId: EntityId,
  parentEntityId?: EntityId | { readonly sceneId: SceneId; readonly entityId: EntityId },
): SceneGraphResult {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const byId = entityMap(candidate);
  const entity = byId.get(String(entityId));
  if (entity === undefined) return failure(diagnostic("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  if (parentEntityId !== undefined) {
    const targetIssues = targetDiagnostics(candidate, parentEntityId, "parentEntityId");
    if (targetIssues.length > 0) return failure(...targetIssues);
    const nextParent = targetId(parentEntityId);
    let current: string | undefined = nextParent;
    while (current !== undefined) {
      if (current === String(entityId)) return failure(diagnostic("CYCLE", "parentEntityId", "Reparenting would create a cycle."));
      current = byId.get(current)?.parentEntityId === undefined ? undefined : String(byId.get(current)?.parentEntityId);
    }
  }
  const oldParent = entity.parentEntityId === undefined ? undefined : String(entity.parentEntityId);
  const nextParent = parentEntityId === undefined ? undefined : targetId(parentEntityId) as EntityId;
  if (oldParent === (nextParent === undefined ? undefined : String(nextParent))) return result(candidate, false);
  const nextEntities = candidate.entities.map((item) => {
    if (item.entityId !== entityId) return item;
    return nextParent === undefined ? (() => { const { parentEntityId: _ignored, ...withoutParent } = item; return withoutParent; })() : { ...item, parentEntityId: nextParent };
  });
  const nextRoots = nextParent === undefined
    ? [...candidate.rootEntityIds, entityId]
    : candidate.rootEntityIds.filter((id) => id !== entityId);
  return result({ ...candidate, entities: nextEntities, rootEntityIds: nextRoots }, true);
}

export function setEntityActive(scene: Scene, entityId: EntityId, active: boolean): SceneGraphResult {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const entity = entityMap(candidate).get(String(entityId));
  if (entity === undefined) return failure(diagnostic("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  if (typeof active !== "boolean") return failure(diagnostic("INVALID_ROOT", "active", "Entity active must be boolean."));
  if ((entity.active ?? true) === active && (active || entity.active !== undefined)) return result(candidate, false);
  return result({ ...candidate, entities: candidate.entities.map((item) => item.entityId === entityId ? { ...item, active } : item) }, true);
}

function descendantsOf(scene: Game350Scene, entityId: EntityId): Set<string> {
  const resultIds = new Set<string>([String(entityId)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entity of scene.entities) {
      if (entity.parentEntityId !== undefined && resultIds.has(String(entity.parentEntityId)) && !resultIds.has(String(entity.entityId))) {
        resultIds.add(String(entity.entityId));
        changed = true;
      }
    }
  }
  return resultIds;
}

export function deleteEntity(scene: Scene, entityId: EntityId): SceneGraphResult {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  if (!entityMap(candidate).has(String(entityId))) return failure(diagnostic("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  const deleted = descendantsOf(candidate, entityId);
  return result({
    ...candidate,
    rootEntityIds: candidate.rootEntityIds.filter((id) => !deleted.has(String(id))),
    entities: candidate.entities.filter((entity) => !deleted.has(String(entity.entityId))),
  }, true);
}

function copyEntity(entity: Game350Entity, entityId: EntityId, componentIdFor: DuplicateEntityOptions["componentIdFor"]): Game350Entity {
  return {
    ...entity,
    entityId,
    ...(entity.parentEntityId === undefined ? {} : { parentEntityId: entity.parentEntityId }),
    components: entity.components.map((component, index) => ({
      ...component,
      componentId: componentIdFor?.(component, index) ?? `${String(component.componentId)}:copy` as Component["componentId"],
    })),
  };
}

/** Duplicate an Entity subtree with new Entity/Component IDs; no Prefab semantics are introduced. */
export function duplicateEntity(
  scene: Scene,
  entityId: EntityId,
  options: DuplicateEntityOptions = {},
): SceneGraphResult {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const source = entityMap(candidate).get(String(entityId));
  if (source === undefined) return failure(diagnostic("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  const ids = descendantsOf(candidate, entityId);
  const ordered = candidate.entities.filter((entity) => ids.has(String(entity.entityId)));
  const includeDescendants = options.includeDescendants ?? true;
  const copyIds = includeDescendants ? ids : new Set([String(entityId)]);
  const copyEntities = ordered.filter((entity) => copyIds.has(String(entity.entityId)));
  const existingEntityIds = new Set(candidate.entities.map((entity) => String(entity.entityId)));
  const requestedRootId = options.entityId;
  let newRootId = requestedRootId ?? `${String(entityId)}:copy` as EntityId;
  let generatedRootAttempt = 1;
  const mappedEntityId = (entity: Game350Entity, rootId: EntityId): EntityId => {
    const suffix = String(entity.entityId).startsWith(`${String(entityId)}:`)
      ? String(entity.entityId).slice(String(entityId).length + 1)
      : String(entity.entityId);
    return entity.entityId === entityId
      ? rootId
      : `${String(rootId)}:${suffix}` as EntityId;
  };
  while (true) {
    const projectedIds = copyEntities.map((entity) => String(mappedEntityId(entity, newRootId)));
    const hasDuplicate = new Set(projectedIds).size !== projectedIds.length;
    const hasCollision = projectedIds.some((id) => existingEntityIds.has(id));
    if (!hasDuplicate && !hasCollision) break;
    if (requestedRootId !== undefined) {
      return failure(diagnostic("DUPLICATE_ID", "entityId", `Entity ${String(newRootId)} already exists.`));
    }
    generatedRootAttempt += 1;
    newRootId = `${String(entityId)}:copy${generatedRootAttempt}` as EntityId;
  }
  const newIds = new Map<string, EntityId>();
  for (const entity of copyEntities) {
    const nextId = mappedEntityId(entity, newRootId);
    newIds.set(String(entity.entityId), nextId);
  }
  const usedComponentIds = new Set(componentIds(candidate));
  const generatedComponentIds = new Set<string>();
  const componentIdFor = options.componentIdFor ?? ((component: Component): Component["componentId"] => {
    const base = `${String(component.componentId)}:copy`;
    let candidateId = base;
    let suffix = 2;
    while (usedComponentIds.has(candidateId) || generatedComponentIds.has(candidateId)) {
      candidateId = `${base}:${suffix}`;
      suffix += 1;
    }
    generatedComponentIds.add(candidateId);
    return candidateId as Component["componentId"];
  });
  const copies = copyEntities.map((entity) => {
    const mappedParent = entity.entityId === entityId
      ? entity.parentEntityId
      : newIds.get(String(entity.parentEntityId));
    const copied = copyEntity(entity, newIds.get(String(entity.entityId))!, componentIdFor);
    return mappedParent === undefined ? (() => { const { parentEntityId: _ignored, ...root } = copied; return root; })() : { ...copied, parentEntityId: mappedParent };
  });
  const rootIndex = candidate.rootEntityIds.findIndex((id) => id === entityId);
  const nextRoots = source.parentEntityId === undefined
    ? rootIndex < 0
      ? [...candidate.rootEntityIds, newRootId]
      : [...candidate.rootEntityIds.slice(0, rootIndex + 1), newRootId, ...candidate.rootEntityIds.slice(rootIndex + 1)]
    : [...candidate.rootEntityIds];
  const nextScene = { ...candidate, rootEntityIds: nextRoots, entities: [...candidate.entities, ...copies] };
  const checked = validateSceneHierarchy(nextScene);
  if (!checked.valid) return failure(...checked.diagnostics);
  return result(nextScene, true);
}

/** Explicit fail-closed boundary for the deferred Prefab design. */
export function rejectPrefabOperation(operation = "operation"): never {
  throw new Error(`${GAME350_PREFAB_DESIGN_GATE}:${operation}`);
}

export function validateScenePrefabReferences(
  scene: Scene,
  prefabs: readonly Prefab[],
): SceneHierarchyValidation {
  const base = validateSceneHierarchy(scene);
  const known = new Set(prefabs.map((prefab) => String(prefab.prefabId)));
  const diagnostics = [...base.diagnostics];
  for (const entity of scene.entities) {
    if (entity.prefabId !== undefined && !known.has(String(entity.prefabId))) {
      diagnostics.push(diagnostic("PREFAB_DESIGN_GATE", `entities.${String(entity.entityId)}.prefabId`, "Prefab reference is not closed by the current Scene contract."));
    }
  }
  return { valid: diagnostics.length === 0, diagnostics };
}
