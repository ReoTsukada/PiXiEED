import {
  appendJournalCommand,
  asAssetId,
  asAssetRevisionId,
  asBehaviorId,
  asComponentId,
  asDependencyId,
  asEntityId,
  asOwnerId,
  asPrefabId,
  asProjectId,
  asRevisionId,
  asSceneId,
  asSha256,
  behaviorHash,
  compileGraphBehavior,
  compileNoCodeBehavior,
  compileScriptBehavior,
  createCheckpoint,
  createGameProject,
  createJournal,
  redoJournal,
  restoreCheckpoint,
  undoJournal,
  validateGameProject,
  type BehaviorRule,
  type CallerContext,
  type GameProjectDraft,
} from "../../src/game/game-300/core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertCode(value: unknown, code: string): void {
  assert(Array.isArray(value), "expected diagnostics");
  assert(value.some((item) => item.code === code), `expected diagnostic ${code}`);
}

const OWNER = asOwnerId("owner-game-300");
const PROJECT = asProjectId("project-game-300");
const REVISION_1 = asRevisionId("revision-game-300-1");
const REVISION_2 = asRevisionId("revision-game-300-2");
const DRAW_HASH = asSha256("a".repeat(64));
const AUDIO_HASH = asSha256("b".repeat(64));
const DRAW = { kind: "DRAW" as const, assetId: asAssetId("draw/player"), revisionId: asAssetRevisionId("draw/player-1"), ownerId: OWNER, contentHash: DRAW_HASH, mode: "PINNED" as const };
const AUDIO = { kind: "AUDIO" as const, assetId: asAssetId("audio/jump"), revisionId: asAssetRevisionId("audio/jump-1"), ownerId: OWNER, contentHash: AUDIO_HASH, mode: "PINNED" as const };

const RULE: BehaviorRule = {
  ruleId: "jump-rule",
  enabled: true,
  trigger: { type: "ACTION", actionId: "jump" },
  conditions: [{ kind: "ALWAYS" }],
  actions: [{ kind: "SET_VARIABLE", targetId: "score", value: 1 }],
};

function caller(revisionId: typeof REVISION_1 | typeof REVISION_2 = REVISION_1): CallerContext {
  return { projectId: PROJECT, ownerId: OWNER, revisionId };
}

function draft(revisionId: typeof REVISION_1 | typeof REVISION_2 = REVISION_1): GameProjectDraft {
  const behavior = compileNoCodeBehavior({ behaviorId: asBehaviorId("behavior-jump"), rules: [RULE] });
  return {
    schemaVersion: 1,
    projectId: PROJECT,
    ownerId: OWNER,
    name: revisionId === REVISION_1 ? "GAME-300 Fixture" : "GAME-300 Fixture v2",
    revision: revisionId === REVISION_2
      ? { revisionId, projectId: PROJECT, ownerId: OWNER, sequence: 2, parentRevisionId: REVISION_1 }
      : { revisionId, projectId: PROJECT, ownerId: OWNER, sequence: 1 },
    scenes: [{
      sceneId: asSceneId("scene-main"),
      name: "Main",
      rootEntityIds: [asEntityId("entity-player")],
      entities: [{
        entityId: asEntityId("entity-player"),
        name: "Player",
        components: [
          { type: "TRANSFORM", componentId: asComponentId("component-transform"), x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          { type: "SPRITE", componentId: asComponentId("component-sprite"), asset: DRAW, visible: true },
          { type: "AUDIO_SOURCE", componentId: asComponentId("component-audio"), asset: AUDIO, loop: false, volume: 0.75 },
          { type: "BEHAVIOR", componentId: asComponentId("component-behavior"), behaviorId: behavior.behaviorId },
        ],
      }],
    }],
    prefabs: [{ prefabId: asPrefabId("prefab-player"), name: "Player", rootEntityId: asEntityId("entity-player"), entityIds: [asEntityId("entity-player")], componentIds: [asComponentId("component-transform")] }],
    dependencies: [
      { dependencyId: asDependencyId("dependency-draw"), kind: "ASSET", ownerId: OWNER, ownerRevisionId: revisionId, targetId: String(DRAW.assetId), targetRevisionId: String(DRAW.revisionId), dependsOn: [] },
      { dependencyId: asDependencyId("dependency-audio"), kind: "ASSET", ownerId: OWNER, ownerRevisionId: revisionId, targetId: String(AUDIO.assetId), targetRevisionId: String(AUDIO.revisionId), dependsOn: [] },
    ],
    behaviors: [behavior],
  };
}

async function makeProject(revisionId: typeof REVISION_1 | typeof REVISION_2 = REVISION_1) {
  return createGameProject(draft(revisionId), caller(revisionId));
}

Deno.test("GAME300-SCOPE-001 canonical project and Asset Revision references are deterministic", async () => {
  const first = await makeProject();
  const second = await makeProject();
  assert(first.revision.snapshotHash === second.revision.snapshotHash, "identical project content must hash identically");
  const sprite = first.scenes[0]!.entities[0]!.components.find((component) => component.type === "SPRITE");
  const audio = first.scenes[0]!.entities[0]!.components.find((component) => component.type === "AUDIO_SOURCE");
  assert(sprite?.asset.revisionId === DRAW.revisionId && sprite.asset.kind === "DRAW", "Draw must be pinned by Asset ID and Revision");
  assert(audio?.asset.revisionId === AUDIO.revisionId && audio.asset.kind === "AUDIO", "Audio must be pinned by Asset ID and Revision");
  assert(validateGameProject(first, caller()).valid, "valid project must pass its caller boundary");
});

Deno.test("GAME300-SCOPE-001 No-code, Graph, and Script compile to one Behavior IR", async () => {
  const behaviorId = asBehaviorId("behavior-jump");
  const noCode = compileNoCodeBehavior({ behaviorId, rules: [RULE] });
  const graph = compileGraphBehavior({ behaviorId, nodes: [{ nodeId: "node-rule", kind: "RULE", rule: RULE }], edges: [] });
  const script = compileScriptBehavior({ behaviorId, language: "typescript", sourceText: "when jump then score += 1", rules: [RULE] });
  const hashes = await Promise.all([behaviorHash(noCode), behaviorHash(graph), behaviorHash(script)]);
  assert(hashes[0] === hashes[1] && hashes[1] === hashes[2], "all authoring projections must hash to the same IR");
  assert(noCode.ownership === "CANONICAL_IR" && noCode.version === 1, "IR ownership/version must be explicit");
});

Deno.test("GAME300-SCOPE-001 journal supports command, undo, redo, checkpoint, and restore", async () => {
  const first = await makeProject();
  const second = await makeProject(REVISION_2);
  const initial = createJournal(first, caller());
  const edited = await appendJournalCommand(initial, second, caller(REVISION_2), "command-rename");
  assert(edited.past.length === 1 && edited.future.length === 0, "append must record one command and clear redo");
  assert(undoJournal(edited).current.revision.revisionId === REVISION_1, "undo must restore the previous revision");
  assert(redoJournal(undoJournal(edited)).current.revision.revisionId === REVISION_2, "redo must restore the command result");
  const checkpointed = createCheckpoint(edited, "checkpoint-good");
  const changedAgain = await appendJournalCommand(checkpointed, first, caller(), "command-revert");
  const restored = restoreCheckpoint(changedAgain, "checkpoint-good");
  assert(restored.current.revision.revisionId === REVISION_2 && restored.future.length === 0, "checkpoint restore must fail closed to the saved project");
});

Deno.test("GAME300-SCOPE-001 fail-closed rejects duplicate IDs, dependency cycles, unknown schema, invalid components, and caller mismatches", async () => {
  const project = await makeProject();
  const duplicate = validateGameProject({ ...project, scenes: [...project.scenes, project.scenes[0]] }, caller());
  assertCode(duplicate.diagnostics, "DUPLICATE_ID");

  const cyclic = { ...project, dependencies: project.dependencies.map((dependency, index) => ({ ...dependency, dependsOn: [project.dependencies[index === 0 ? 1 : 0]!.dependencyId] })) };
  assertCode(validateGameProject(cyclic, caller()).diagnostics, "DEPENDENCY_CYCLE");

  assertCode(validateGameProject({ ...project, schemaVersion: 999 }, caller()).diagnostics, "UNKNOWN_SCHEMA");
  const invalidComponent = { ...project, scenes: [{ ...project.scenes[0]!, entities: [{ ...project.scenes[0]!.entities[0]!, components: [{ type: "UNKNOWN", componentId: "component-unknown" }] as never[] }] }] };
  assertCode(validateGameProject(invalidComponent, caller()).diagnostics, "INVALID_COMPONENT");
  assertCode(validateGameProject(project, { ...caller(), ownerId: asOwnerId("other-owner") }).diagnostics, "CALLER_OWNER_MISMATCH");
  assertCode(validateGameProject(project, { ...caller(), revisionId: REVISION_2 }).diagnostics, "CALLER_REVISION_MISMATCH");
});
