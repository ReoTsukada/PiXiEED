import {
  asBehaviorId,
  asEntityId,
  asOwnerId,
  asProjectId,
  asRevisionId,
  asSceneId,
  asSha256,
  createGameProject,
  type CallerContext,
  type GameProject,
} from "../../src/game/game-300/core.ts";
import {
  createBehaviorEditIntent,
  createGameStudioWorkspace,
  creationGuide,
  selectScene,
  selectEntity,
  setStudioMode,
  type GameStudioWorkspaceState,
} from "../../src/game/game-350/studio.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const caller: CallerContext = { projectId: asProjectId("studio-project"), ownerId: asOwnerId("studio-owner"), revisionId: asRevisionId("studio-rev-1") };

async function fixture(): Promise<GameProject> {
  return createGameProject({
    schemaVersion: 1,
    projectId: caller.projectId,
    ownerId: caller.ownerId,
    name: "Studio Fixture",
    revision: { revisionId: caller.revisionId, projectId: caller.projectId, ownerId: caller.ownerId, sequence: 1 },
    scenes: [{ sceneId: asSceneId("scene-main"), name: "Main", rootEntityIds: [asEntityId("hero")], entities: [{ entityId: asEntityId("hero"), name: "Hero", components: [] }] }],
    prefabs: [],
    dependencies: [],
    behaviors: [],
  }, caller);
}

async function identityFixture(projectId: string, ownerId: string, revisionId: string): Promise<GameProject> {
  const project = { projectId: asProjectId(projectId), ownerId: asOwnerId(ownerId), revisionId: asRevisionId(revisionId) };
  return createGameProject({
    schemaVersion: 1,
    projectId: project.projectId,
    ownerId: project.ownerId,
    name: projectId,
    revision: { revisionId: project.revisionId, projectId: project.projectId, ownerId: project.ownerId, sequence: 1 },
    scenes: [{ sceneId: asSceneId(`${projectId}-scene`), name: "Main", rootEntityIds: [asEntityId(`${projectId}-entity`)], entities: [{ entityId: asEntityId(`${projectId}-entity`), name: "Entity", components: [] }] }],
    prefabs: [],
    dependencies: [],
    behaviors: [],
  }, { projectId: project.projectId, ownerId: project.ownerId, revisionId: project.revisionId });
}

Deno.test("GAME350-STUDIO-001 creates one profile projection without changing Project identity", async () => {
  const project = await fixture();
  const result = createGameStudioWorkspace(project, caller, "MOBILE");
  assert(result.ok && result.value !== undefined, "workspace should be created");
  assert(result.value.projectId === project.projectId && result.value.revisionId === project.revision.revisionId, "workspace must bind current identity");
  assert(result.value.local.mobileSheet === undefined, "mobile sheet must not open before an explicit action");
});

Deno.test("GAME350-STUDIO-002 mode switching preserves selection and routes to the matching panel", async () => {
  const project = await fixture();
  const created = createGameStudioWorkspace(project, caller, "DESKTOP");
  assert(created.ok && created.value !== undefined, "workspace should be created");
  const selected = selectEntity(created.value, project, asSceneId("scene-main"), asEntityId("hero"));
  assert(selected.ok && selected.value !== undefined, "entity should be selected");
  const code = setStudioMode(selected.value, "CODE");
  assert(code.selectedEntityId === asEntityId("hero") && code.activePanel === "CODE", "mode switch must preserve entity selection");
});

Deno.test("GAME350-STUDIO-003 emits a bounded No-code behavior intent through canonical Behavior IR", async () => {
  const project = await fixture();
  const created = createGameStudioWorkspace(project, caller, "MOBILE");
  assert(created.ok && created.value !== undefined, "workspace should be created");
  const intent = await createBehaviorEditIntent(created.value, caller, { behaviorId: asBehaviorId("hero-behavior"), rules: [{ ruleId: "tap-jump", enabled: true, trigger: { type: "TAP", value: "jump" }, conditions: [{ kind: "ALWAYS" }], actions: [{ kind: "SET_VARIABLE", targetId: "hero", property: "jumping", value: true }] }] }, "studio-behavior-1");
  assert(intent.ok && intent.value !== undefined, "behavior intent should be created");
  assert(intent.value.sourceMode === "SIMPLE" && intent.value.behavior.ownership === "CANONICAL_IR", "intent must compile to canonical IR");
});

Deno.test("GAME350-STUDIO-004 rejects stale caller identity before compiling a behavior", async () => {
  const project = await fixture();
  const created = createGameStudioWorkspace(project, caller, "DESKTOP");
  assert(created.ok && created.value !== undefined, "workspace should be created");
  const stale = { ...caller, revisionId: asRevisionId("studio-rev-stale") };
  const intent = await createBehaviorEditIntent(created.value, stale, { behaviorId: asBehaviorId("hero-behavior"), rules: [] }, "studio-behavior-stale");
  assert(!intent.ok && intent.diagnostics.some((item) => item.code === "CALLER_MISMATCH"), "stale caller must fail closed");
});

Deno.test("GAME350-STUDIO-005 creation guide is deterministic and exposes the short path", () => {
  const first = creationGuide();
  const second = creationGuide();
  assert(JSON.stringify(first) === JSON.stringify(second), "guide must be deterministic");
  assert(first.length === 6 && first[0]?.commandId === "game.project.create" && first.at(-1)?.commandId === "game.build.plan", "guide should cover project to build");
});

Deno.test("GAME350-IDENTITY-001 accepts Scene and Entity selection from the bound canonical Project", async () => {
  const project = await fixture();
  const created = createGameStudioWorkspace(project, caller, "DESKTOP");
  assert(created.ok && created.value !== undefined, "workspace should be created");
  const scene = selectScene(created.value, project, asSceneId("scene-main"));
  assert(scene.ok, "bound Scene must be accepted");
  const entity = selectEntity(created.value, project, asSceneId("scene-main"), asEntityId("hero"));
  assert(entity.ok, "bound Entity must be accepted");
});

Deno.test("GAME350-IDENTITY-002 rejects a foreign Project Scene before selection", async () => {
  const project = await fixture();
  const foreign = await identityFixture("foreign-project", "studio-owner", "foreign-revision");
  const created = createGameStudioWorkspace(project, caller, "DESKTOP");
  assert(created.ok && created.value !== undefined, "workspace should be created");
  const result = selectScene(created.value, foreign, asSceneId("foreign-project-scene"));
  assert(!result.ok && result.diagnostics.some((item) => item.code === "PROJECT_MISMATCH"), "foreign Scene must be rejected by Project identity binding");
});

Deno.test("GAME350-IDENTITY-003 rejects a foreign Entity even when the selected Scene is canonical", async () => {
  const project = await fixture();
  const created = createGameStudioWorkspace(project, caller, "DESKTOP");
  assert(created.ok && created.value !== undefined, "workspace should be created");
  const result = selectEntity(created.value, project, asSceneId("scene-main"), asEntityId("foreign-entity"));
  assert(!result.ok && result.diagnostics.some((item) => item.code === "MISSING_ENTITY"), "foreign Entity membership must be rejected");
});

Deno.test("GAME350-IDENTITY-004 rejects owner and revision substitution", async () => {
  const project = await fixture();
  const created = createGameStudioWorkspace(project, caller, "DESKTOP");
  assert(created.ok && created.value !== undefined, "workspace should be created");
  const foreignOwner = await identityFixture("studio-project", "foreign-owner", "studio-rev-1");
  const staleRevision = await identityFixture("studio-project", "studio-owner", "stale-revision");
  const ownerResult = selectScene(created.value, foreignOwner, asSceneId("studio-project-scene"));
  const revisionResult = selectScene(created.value, staleRevision, asSceneId("studio-project-scene"));
  assert(!ownerResult.ok && ownerResult.diagnostics.some((item) => item.code === "OWNER_MISMATCH"), "foreign owner must be rejected");
  assert(!revisionResult.ok && revisionResult.diagnostics.some((item) => item.code === "REVISION_MISMATCH"), "stale revision must be rejected");
});
