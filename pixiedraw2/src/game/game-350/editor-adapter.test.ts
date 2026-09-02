import {
  asAssetId,
  asAssetRevisionId,
  asComponentId,
  asEntityId,
  asOwnerId,
  asProjectId,
  asRevisionId,
  asSceneId,
  asSha256,
  createGameProject,
  type CallerContext,
  type Component,
  type GameProject,
} from "../game-300/core.ts";
import {
  applyGame350EditorCommand,
  createGame350EditorSnapshot,
  prepareGame350BuildPlan,
  projectGame350BuildPlanRequest,
  selectGame350EditorTarget,
  type Game350EditorSnapshot,
} from "./editor-adapter.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const hash = asSha256("a".repeat(64));
const caller: CallerContext = {
  projectId: asProjectId("game350-adapter-project"),
  ownerId: asOwnerId("game350-adapter-owner"),
  revisionId: asRevisionId("game350-adapter-rev-1"),
};

const drawAsset = {
  kind: "DRAW" as const,
  assetId: asAssetId("hero-draw"),
  revisionId: asAssetRevisionId("hero-draw-rev-1"),
  ownerId: caller.ownerId,
  contentHash: hash,
  mode: "PINNED" as const,
};

const audioAsset = {
  kind: "AUDIO" as const,
  assetId: asAssetId("hero-audio"),
  revisionId: asAssetRevisionId("hero-audio-rev-1"),
  ownerId: caller.ownerId,
  contentHash: asSha256("b".repeat(64)),
  mode: "PINNED" as const,
};

async function projectFixture(): Promise<GameProject> {
  return createGameProject({
    schemaVersion: 1,
    projectId: caller.projectId,
    ownerId: caller.ownerId,
    name: "GAME-350 adapter fixture",
    revision: { revisionId: caller.revisionId, projectId: caller.projectId, ownerId: caller.ownerId, sequence: 1 },
    scenes: [{ sceneId: asSceneId("scene-main"), name: "Main", rootEntityIds: [], entities: [] }],
    prefabs: [],
    dependencies: [],
    behaviors: [],
  }, caller);
}

function asDraft(project: GameProject) {
  const { snapshotHash: _snapshotHash, ...revision } = project.revision;
  return { ...project, revision };
}

async function snapshotFixture(): Promise<Game350EditorSnapshot> {
  const project = await projectFixture();
  const result = await createGame350EditorSnapshot(asDraft(project), caller);
  assert(result.ok && result.value !== undefined, "snapshot fixture should be created");
  return result.value;
}

function addEntityCommand(baseRevisionId: string, nextRevisionId: string) {
  return {
    type: "ADD_ENTITY" as const,
    commandId: "game350-add-hero",
    baseRevisionId: asRevisionId(baseRevisionId),
    nextRevisionId: asRevisionId(nextRevisionId),
    sceneId: asSceneId("scene-main"),
    entityId: asEntityId("hero"),
    name: "Hero",
  };
}

Deno.test("GAME350-EDITOR-001 creates a local snapshot without runtime state", async () => {
  const snapshot = await snapshotFixture();
  assert(snapshot.activeRail === "VIEWPORT", "new editor should open on the viewport rail");
  assert(snapshot.selection.sceneId === asSceneId("scene-main"), "new editor should select the first scene");
  assert(!("runtime" in snapshot), "editor snapshot must not contain runtime save state");
});

Deno.test("GAME350-EDITOR-002 applies Scene, Entity, Component, and asset-binding commands immutably", async () => {
  const initial = await snapshotFixture();
  const sceneAdded = await applyGame350EditorCommand(initial, caller, {
    type: "ADD_SCENE", commandId: "game350-add-scene", baseRevisionId: caller.revisionId, nextRevisionId: asRevisionId("game350-rev-2"), sceneId: asSceneId("scene-settings"), name: "Settings",
  });
  assert(sceneAdded.ok && sceneAdded.value !== undefined, "scene command should succeed");
  const entityAdded = await applyGame350EditorCommand(sceneAdded.value, { ...caller, revisionId: asRevisionId("game350-rev-2") }, addEntityCommand("game350-rev-2", "game350-rev-3"));
  assert(entityAdded.ok && entityAdded.value !== undefined, "entity command should succeed");
  const component: Component = { type: "SPRITE", componentId: asComponentId("hero-sprite"), asset: drawAsset, visible: true };
  const componentAdded = await applyGame350EditorCommand(entityAdded.value, { ...caller, revisionId: asRevisionId("game350-rev-3") }, {
    type: "ADD_COMPONENT", commandId: "game350-add-sprite", baseRevisionId: asRevisionId("game350-rev-3"), nextRevisionId: asRevisionId("game350-rev-4"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"), component,
  });
  assert(componentAdded.ok && componentAdded.value !== undefined, "component command should succeed");
  const rebound = await applyGame350EditorCommand(componentAdded.value, { ...caller, revisionId: asRevisionId("game350-rev-4") }, {
    type: "BIND_ASSET", commandId: "game350-bind-sprite", baseRevisionId: asRevisionId("game350-rev-4"), nextRevisionId: asRevisionId("game350-rev-5"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"), componentId: asComponentId("hero-sprite"), asset: drawAsset,
  });
  assert(rebound.ok && rebound.value !== undefined, "asset binding command should succeed");
  assert(initial.project.scenes[0]?.entities.length === 0, "input snapshot must remain unchanged");
  assert(rebound.value.project.revision.sequence === 5, "each canonical command should advance the revision sequence");
  assert(rebound.value.selection.componentId === asComponentId("hero-sprite"), "binding should select the changed component");
});

Deno.test("GAME350-EDITOR-006 updates and removes Components immutably", async () => {
  const initial = await snapshotFixture();
  const entityAdded = await applyGame350EditorCommand(initial, caller, addEntityCommand(String(caller.revisionId), "game350-rev-2b"));
  assert(entityAdded.ok && entityAdded.value !== undefined, "entity command should succeed");
  const spriteComponent: Component = { type: "SPRITE", componentId: asComponentId("hero-sprite"), asset: drawAsset, visible: true };
  const componentAdded = await applyGame350EditorCommand(entityAdded.value, { ...caller, revisionId: asRevisionId("game350-rev-2b") }, {
    type: "ADD_COMPONENT", commandId: "game350-add-sprite-b", baseRevisionId: asRevisionId("game350-rev-2b"), nextRevisionId: asRevisionId("game350-rev-3b"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"), component: spriteComponent,
  });
  assert(componentAdded.ok && componentAdded.value !== undefined, "component command should succeed");
  const beforeUpdate = componentAdded.value.project.scenes[0]?.entities[0]?.components[0];
  assert(beforeUpdate !== undefined && beforeUpdate.type === "SPRITE" && beforeUpdate.visible === true, "fixture sprite should start visible");

  const updated = await applyGame350EditorCommand(componentAdded.value, { ...caller, revisionId: asRevisionId("game350-rev-3b") }, {
    type: "UPDATE_COMPONENT", commandId: "game350-update-sprite", baseRevisionId: asRevisionId("game350-rev-3b"), nextRevisionId: asRevisionId("game350-rev-4b"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"),
    component: { type: "SPRITE", componentId: asComponentId("hero-sprite"), asset: drawAsset, visible: false },
  });
  assert(updated.ok && updated.value !== undefined, "update command should succeed");
  const afterUpdate = updated.value.project.scenes[0]?.entities[0]?.components[0];
  assert(afterUpdate !== undefined && afterUpdate.type === "SPRITE" && afterUpdate.visible === false, "update should replace the Component fields");
  assert(beforeUpdate.visible === true, "input snapshot must remain unchanged by update");

  const typeMismatch = await applyGame350EditorCommand(updated.value, { ...caller, revisionId: asRevisionId("game350-rev-4b") }, {
    type: "UPDATE_COMPONENT", commandId: "game350-update-sprite-bad-type", baseRevisionId: asRevisionId("game350-rev-4b"), nextRevisionId: asRevisionId("game350-rev-4c"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"),
    component: { type: "AUDIO_SOURCE", componentId: asComponentId("hero-sprite"), asset: audioAsset, loop: false, volume: 1 },
  });
  assert(!typeMismatch.ok, "update must reject a Component type change");

  const removed = await applyGame350EditorCommand(updated.value, { ...caller, revisionId: asRevisionId("game350-rev-4b") }, {
    type: "REMOVE_COMPONENT", commandId: "game350-remove-sprite", baseRevisionId: asRevisionId("game350-rev-4b"), nextRevisionId: asRevisionId("game350-rev-5b"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"), componentId: asComponentId("hero-sprite"),
  });
  assert(removed.ok && removed.value !== undefined, "remove command should succeed");
  assert(removed.value.project.scenes[0]?.entities[0]?.components.length === 0, "remove should drop the Component from the Entity");
  assert(updated.value.project.scenes[0]?.entities[0]?.components.length === 1, "input snapshot must remain unchanged by remove");

  const missing = await applyGame350EditorCommand(removed.value, { ...caller, revisionId: asRevisionId("game350-rev-5b") }, {
    type: "REMOVE_COMPONENT", commandId: "game350-remove-again", baseRevisionId: asRevisionId("game350-rev-5b"), nextRevisionId: asRevisionId("game350-rev-6b"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"), componentId: asComponentId("hero-sprite"),
  });
  assert(!missing.ok, "removing an already-removed Component should fail");
});

Deno.test("GAME350-EDITOR-003 rejects stale commands, foreign assets, and wrong component kinds", async () => {
  const initial = await snapshotFixture();
  const stale = await applyGame350EditorCommand(initial, caller, addEntityCommand("old-revision", "game350-rev-2"));
  assert(!stale.ok && stale.diagnostics.some((item) => item.code === "STALE_COMMAND"), "stale command must fail closed");
  const entityAdded = await applyGame350EditorCommand(initial, caller, addEntityCommand("game350-adapter-rev-1", "game350-rev-2"));
  assert(entityAdded.ok && entityAdded.value !== undefined, "entity fixture should succeed");
  const foreign: typeof drawAsset = { ...drawAsset, ownerId: asOwnerId("foreign-owner") };
  const wrongComponent = await applyGame350EditorCommand(entityAdded.value, { ...caller, revisionId: asRevisionId("game350-rev-2") }, {
    type: "ADD_COMPONENT", commandId: "game350-add-sprite", baseRevisionId: asRevisionId("game350-rev-2"), nextRevisionId: asRevisionId("game350-rev-3"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"), component: { type: "SPRITE", componentId: asComponentId("hero-sprite"), asset: drawAsset, visible: true },
  });
  assert(wrongComponent.ok && wrongComponent.value !== undefined, "component fixture should succeed");
  const foreignResult = await applyGame350EditorCommand(wrongComponent.value, { ...caller, revisionId: asRevisionId("game350-rev-3") }, {
    type: "BIND_ASSET", commandId: "game350-bind-foreign", baseRevisionId: asRevisionId("game350-rev-3"), nextRevisionId: asRevisionId("game350-rev-4"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"), componentId: asComponentId("hero-sprite"), asset: foreign,
  });
  assert(!foreignResult.ok && foreignResult.diagnostics.some((item) => item.code === "INVALID_ASSET_REFERENCE"), "foreign asset owner must fail closed");
  const wrongKind = await applyGame350EditorCommand(wrongComponent.value, { ...caller, revisionId: asRevisionId("game350-rev-3") }, {
    type: "BIND_ASSET", commandId: "game350-bind-audio", baseRevisionId: asRevisionId("game350-rev-3"), nextRevisionId: asRevisionId("game350-rev-4"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"), componentId: asComponentId("hero-sprite"), asset: audioAsset,
  });
  assert(!wrongKind.ok && wrongKind.diagnostics.some((item) => item.code === "ASSET_KIND_MISMATCH"), "Sprite must reject AUDIO assets");
});

Deno.test("GAME350-EDITOR-004 selection is local and cannot cross the canonical Scene boundary", async () => {
  const snapshot = await snapshotFixture();
  const invalid = selectGame350EditorTarget(snapshot, caller, { sceneId: asSceneId("missing-scene") });
  assert(!invalid.ok && invalid.diagnostics.some((item) => item.code === "MISSING_SCENE"), "foreign Scene selection must fail closed");
  const valid = selectGame350EditorTarget(snapshot, caller, { sceneId: asSceneId("scene-main") });
  assert(valid.ok && valid.value !== undefined, "canonical Scene selection should succeed");
  assert(valid.value.project.revision.revisionId === snapshot.project.revision.revisionId, "selection must not create a Project revision");
});

Deno.test("GAME350-EDITOR-005 projects only PINNED Draw/Audio references into GAME-330", async () => {
  const initial = await snapshotFixture();
  const entityAdded = await applyGame350EditorCommand(initial, caller, addEntityCommand("game350-adapter-rev-1", "game350-rev-2"));
  assert(entityAdded.ok && entityAdded.value !== undefined, "entity fixture should succeed");
  const componentAdded = await applyGame350EditorCommand(entityAdded.value, { ...caller, revisionId: asRevisionId("game350-rev-2") }, {
    type: "ADD_COMPONENT", commandId: "game350-add-sprite", baseRevisionId: asRevisionId("game350-rev-2"), nextRevisionId: asRevisionId("game350-rev-3"), sceneId: asSceneId("scene-main"), entityId: asEntityId("hero"), component: { type: "SPRITE", componentId: asComponentId("hero-sprite"), asset: drawAsset, visible: true },
  });
  assert(componentAdded.ok && componentAdded.value !== undefined, "component fixture should succeed");
  const input = { target: "WEB" as const, profile: "DEBUG" as const, language: "TYPESCRIPT" as const, module: "game350-web", capabilities: ["DRAW"] as const, dependencyLocks: [], licenses: [] };
  const projection = projectGame350BuildPlanRequest(componentAdded.value, { ...caller, revisionId: asRevisionId("game350-rev-3") }, input);
  assert(projection.ok && projection.value !== undefined, "pinned reference should project");
  assert(projection.value.assetLocks.length === 1 && projection.value.assetLocks[0]?.mode === "PINNED", "projection must use the existing pinned lock type");
  const plan = await prepareGame350BuildPlan(componentAdded.value, { ...caller, revisionId: asRevisionId("game350-rev-3") }, input);
  assert(plan.ok && plan.value !== undefined, "existing GAME-330 build validation should accept the projection");
  const liveBase = asDraft(componentAdded.value.project);
  const liveProject = await createGameProject({
    ...liveBase,
    revision: { ...liveBase.revision, revisionId: asRevisionId("game350-live-rev") },
    scenes: componentAdded.value.project.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => ({ ...entity, components: entity.components.map((item): Component => item.type === "SPRITE" ? { ...item, asset: { ...item.asset, mode: "LIVE" as const } } : item) })) })),
  }, { ...caller, revisionId: asRevisionId("game350-live-rev") });
  const liveSnapshot = { ...componentAdded.value, project: liveProject };
  const live = projectGame350BuildPlanRequest(liveSnapshot, { ...caller, revisionId: asRevisionId("game350-live-rev") }, input);
  assert(!live.ok && live.diagnostics.some((item) => item.code === "LIVE_BUILD_REFERENCE"), "LIVE reference must be preview-only and rejected by build projection");
});
