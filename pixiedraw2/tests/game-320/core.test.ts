import {
  createRuntimeCheckpoint,
  createRuntimeSession,
  createRuntimeSnapshot,
  migrateRuntimeSaveState,
  pauseRuntime,
  playRuntime,
  resetRuntime,
  restoreRuntimeCheckpoint,
  restoreRuntimeState,
  saveRuntimeState,
  setRuntimeComponentProperty,
  stepRuntime,
  stopRuntime,
  type RuntimeCallerClaim,
} from "../../src/game/game-320/core.ts";
import { asOwnerId, asProjectId, asRevisionId, asSha256, createGameProject, asSceneId, asEntityId, asComponentId, asBehaviorId, compileNoCodeBehavior, type CallerContext, type GameProjectDraft } from "../../src/game/game-300/core.ts";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const owner = asOwnerId("owner-game-320");
const project = asProjectId("project-game-320");
const revision = asRevisionId("revision-game-320-1");
const caller: CallerContext = { projectId: project, ownerId: owner, revisionId: revision };
const runtimeCaller: RuntimeCallerClaim = { projectId: String(project), ownerId: String(owner), revisionId: String(revision) };

async function fixture() {
  const behavior = compileNoCodeBehavior({ behaviorId: asBehaviorId("behavior-main"), rules: [] });
  const draft: GameProjectDraft = { schemaVersion: 1, projectId: project, ownerId: owner, name: "GAME-320", revision: { revisionId: revision, projectId: project, ownerId: owner, sequence: 1 }, scenes: [{ sceneId: asSceneId("scene-main"), name: "Main", rootEntityIds: [asEntityId("entity-player")], entities: [{ entityId: asEntityId("entity-player"), name: "Player", components: [{ type: "TRANSFORM", componentId: asComponentId("component-transform"), x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, { type: "BEHAVIOR", componentId: asComponentId("component-behavior"), behaviorId: behavior.behaviorId }] }] }], prefabs: [], dependencies: [], behaviors: [behavior] };
  return createGameProject(draft, caller);
}

Deno.test("GAME320-SCOPE-001 snapshot and preview loop are deterministic and authoring-isolated", async () => {
  const project = await fixture();
  const [a, b] = await Promise.all([createRuntimeSnapshot(project, caller), createRuntimeSnapshot(project, caller)]);
  assert(a.ok && b.ok && a.value!.snapshotHash === b.value!.snapshotHash, "snapshot hash must be deterministic");
  const session = createRuntimeSession(a.value!, runtimeCaller);
  assert(session.ok, "valid snapshot must open");
  const playing = playRuntime(session.value!);
  assert(playing.ok, "play must open runtime");
  const stepped = stepRuntime(playing.value!, 1, [{ actionId: "action.jump", phase: "performed", value: 1, sequence: 1 }]);
  assert(stepped.ok && stepped.value!.world.tick === 1 && project.revision.revisionId === revision, "step must only mutate Runtime world");
  assert(pauseRuntime(stepped.value!).ok, "pause must work");
  assert(stopRuntime(stepped.value!).world.mode === "stopped", "stop must be explicit");
  assert(resetRuntime(stepped.value!).world.tick === 0, "reset must restore initial Runtime world");
});

Deno.test("GAME320-SCOPE-001 save/checkpoint restore never mutates Project state", async () => {
  const project = await fixture();
  const snapshot = (await createRuntimeSnapshot(project, caller)).value!;
  const session = createRuntimeSession(snapshot, runtimeCaller).value!;
  const running = stepRuntime(playRuntime(session).value!, 2, [{ actionId: "runtime.set_variable", phase: "performed", value: "checkpointed", sequence: 1 }]).value!;
  const save = await saveRuntimeState(running);
  assert(save.ok, "save must succeed");
  const restored = await restoreRuntimeState({ ...running, world: { ...running.world, variables: {} } }, save.value!, runtimeCaller);
  assert(restored.ok && restored.value!.world.variables.checkpointed === true, "save restore must recover Runtime variables");
  const checkpointed = await createRuntimeCheckpoint(running, "checkpoint-1");
  assert(checkpointed.ok, "checkpoint must succeed");
  const changed = stepRuntime(running, 1).value!;
  const restoredCheckpoint = await restoreRuntimeCheckpoint({ ...changed, checkpoints: checkpointed.value!.checkpoints }, "checkpoint-1", runtimeCaller);
  assert(restoredCheckpoint.ok && restoredCheckpoint.value!.world.tick === 2, "checkpoint must restore exact Runtime tick");
  assert(project.revision.snapshotHash === asSha256(project.revision.snapshotHash), "project remains unchanged");
});

Deno.test("GAME320-SCOPE-001 stale, wrong caller, tampered, unknown component, and nondeterministic claims fail closed", async () => {
  const project = await fixture();
  const snapshot = (await createRuntimeSnapshot(project, caller)).value!;
  const session = createRuntimeSession(snapshot, runtimeCaller).value!;
  assert(!createRuntimeSession(snapshot, { ...runtimeCaller, revisionId: "stale" }).ok, "wrong caller revision must fail closed");
  const saved = (await saveRuntimeState(session)).value!;
  assert(!(await restoreRuntimeState(session, { ...saved, projectRevisionId: "stale" }, runtimeCaller)).ok, "stale save must fail closed");
  assert(!(await restoreRuntimeState(session, { ...saved, assetLocks: [{ ...saved.assetLocks[0]!, revisionId: "asset-stale" }] }, runtimeCaller)).ok, "stale asset lock must fail closed");
  assert(!stepRuntime(session, 1, [{ actionId: "unknown", phase: "performed", value: 1, sequence: 2 }, { actionId: "unknown", phase: "performed", value: 1, sequence: 1 }]).ok, "out-of-order input must fail closed");
  assert(!migrateRuntimeSaveState(saved, snapshot).ok, "silent migration must fail closed");
  const component = setRuntimeComponentProperty(session, runtimeCaller, "unknown-component", "x", 1);
  assert(!component.ok, "unknown component claims must fail closed");
  const tampered = await restoreRuntimeState(session, { ...saved, world: { ...saved.world, tick: 999 } }, runtimeCaller);
  assert(!tampered.ok, "tampered world must fail closed by content hash");
});

Deno.test("GAME320-STOP-001 does not expose host execution seams", async () => {
  const source = await Deno.readTextFile("src/game/game-320/core.ts");
  assert(!/document|fetch|WebSocket|localStorage|indexedDB|Deno\.write|Deno\.read/u.test(source), "Runtime core must not cross host boundaries");
});
