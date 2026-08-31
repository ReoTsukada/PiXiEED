import {
  asAssetId, asAssetRevisionId, asBehaviorId, asComponentId, asDependencyId, asEntityId, asOwnerId,
  asPrefabId, asProjectId, asRevisionId, asSceneId, asSha256, compileNoCodeBehavior, createGameProject,
  type GameProjectDraft,
} from "../../src/game/game-300/core.ts";

const owner = asOwnerId("benchmark-owner");
const projectId = asProjectId("benchmark-project");
const revisionId = asRevisionId("benchmark-revision-1");
const behavior = compileNoCodeBehavior({ behaviorId: asBehaviorId("behavior-bench"), rules: [{ ruleId: "rule", enabled: true, trigger: { type: "ACTION", actionId: "start" }, conditions: [{ kind: "ALWAYS" }], actions: [{ kind: "SET_VARIABLE", targetId: "started", value: true }] }] });
const draft: GameProjectDraft = {
  schemaVersion: 1, projectId, ownerId: owner, name: "GAME-300 benchmark",
  revision: { revisionId, projectId, ownerId: owner, sequence: 1 },
  scenes: [{ sceneId: asSceneId("scene"), name: "Scene", rootEntityIds: [asEntityId("entity")], entities: [{ entityId: asEntityId("entity"), name: "Entity", components: [{ type: "TRANSFORM", componentId: asComponentId("transform"), x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, { type: "SPRITE", componentId: asComponentId("sprite"), asset: { kind: "DRAW", assetId: asAssetId("draw/bench"), revisionId: asAssetRevisionId("draw/bench-1"), ownerId: owner, contentHash: asSha256("a".repeat(64)), mode: "PINNED" }, visible: true }] }] }],
  prefabs: [{ prefabId: asPrefabId("prefab"), name: "Prefab", rootEntityId: asEntityId("entity"), entityIds: [asEntityId("entity")], componentIds: [asComponentId("transform")] }],
  dependencies: [{ dependencyId: asDependencyId("dep"), kind: "ASSET", ownerId: owner, ownerRevisionId: revisionId, targetId: "draw/bench", targetRevisionId: "draw/bench-1", dependsOn: [] }],
  behaviors: [behavior],
};

const iterations = 100;
const start = performance.now();
let lastHash = "";
for (let index = 0; index < iterations; index += 1) lastHash = (await createGameProject(draft, { projectId, ownerId: owner, revisionId })).revision.snapshotHash;
const durationMs = Number((performance.now() - start).toFixed(3));
console.log(JSON.stringify({ workPackage: "GAME-300", status: "MEASURED_LOCAL_SYNTHETIC", iterations, totalMs: durationMs, averageMs: Number((durationMs / iterations).toFixed(4)), deterministicHash: lastHash }));

