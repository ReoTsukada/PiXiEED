import { buildArtifact, createBuildPlan, type BuildPlanRequest } from "../../src/game/game-330/core.ts";
import { asOwnerId, asProjectId, asRevisionId, asSceneId, createGameProject, type CallerContext, type GameProjectDraft } from "../../src/game/game-300/core.ts";

const owner = asOwnerId("bench-owner-game-330");
const projectId = asProjectId("bench-project-game-330");
const revisionId = asRevisionId("bench-revision-game-330-1");
const caller: CallerContext = { ownerId: owner, projectId, revisionId };
const emptyProject: GameProjectDraft = { schemaVersion: 1, projectId, ownerId: owner, name: "benchmark", revision: { revisionId, projectId, ownerId: owner, sequence: 1 }, scenes: [{ sceneId: asSceneId("scene-main"), name: "Main", rootEntityIds: [], entities: [] }], prefabs: [], dependencies: [], behaviors: [] };
const project = await createGameProject(emptyProject, caller);
const request: BuildPlanRequest = { target: "WEB", profile: "DETERMINISTIC", language: "TYPESCRIPT", module: "bench", capabilities: ["DRAW"], dependencyLocks: [], assetLocks: [], licenses: [] };
const plan = (await createBuildPlan(project, caller, request)).value!;
const entries = Array.from({ length: 32 }, (_, index) => ({ path: `assets/${index.toString().padStart(2, "0")}.txt`, content: `asset-${index}` }));

Deno.bench("GAME330 deterministic artifact materialization (32 entries)", async () => {
  const result = await buildArtifact(plan, entries, { ownerId: String(owner), projectId: String(projectId), revisionId: String(revisionId) });
  if (!result.ok) throw new Error("benchmark fixture unexpectedly failed");
});
