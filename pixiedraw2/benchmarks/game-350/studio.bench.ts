import { asOwnerId, asProjectId, asRevisionId, asSceneId, asEntityId, createGameProject, type CallerContext, type GameProject } from "../../src/game/game-300/core.ts";
import { createGameStudioWorkspace, creationGuide } from "../../src/game/game-350/studio.ts";

const caller: CallerContext = { projectId: asProjectId("studio-bench"), ownerId: asOwnerId("studio-owner"), revisionId: asRevisionId("studio-rev-1") };
const project: GameProject = await createGameProject({
  schemaVersion: 1,
  projectId: caller.projectId,
  ownerId: caller.ownerId,
  name: "Studio Benchmark",
  revision: { revisionId: caller.revisionId, projectId: caller.projectId, ownerId: caller.ownerId, sequence: 1 },
  scenes: [{ sceneId: asSceneId("scene-main"), name: "Main", rootEntityIds: [asEntityId("hero")], entities: [{ entityId: asEntityId("hero"), name: "Hero", components: [] }] }],
  prefabs: [], dependencies: [], behaviors: [],
}, caller);

const iterations = 1000;
const started = performance.now();
let created = 0;
for (let index = 0; index < iterations; index += 1) if (createGameStudioWorkspace(project, caller, index % 2 === 0 ? "DESKTOP" : "MOBILE").ok) created += 1;
const elapsed = performance.now() - started;
console.log(JSON.stringify({ package: "GAME-350", benchmark: "studio projection", iterations, created, guideSteps: creationGuide().length, totalMs: Number(elapsed.toFixed(3)), averageMs: Number((elapsed / iterations).toFixed(6)), deterministic: created === iterations }));

Deno.bench("GAME-350 Studio projection", () => {
  const result = createGameStudioWorkspace(project, caller, "DESKTOP");
  if (!result.ok) throw new Error("studio fixture must create");
});
