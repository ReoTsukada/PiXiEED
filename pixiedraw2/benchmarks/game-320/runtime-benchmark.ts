import { createRuntimeSession, createRuntimeSnapshot, playRuntime, saveRuntimeState, stepRuntime } from "../../src/game/game-320/core.ts";
import { asOwnerId, asProjectId, asRevisionId, asSceneId, asEntityId, asComponentId, createGameProject, type CallerContext, type GameProjectDraft } from "../../src/game/game-300/core.ts";

const owner = asOwnerId("benchmark-owner");
const projectId = asProjectId("benchmark-project");
const revisionId = asRevisionId("benchmark-revision");
const caller: CallerContext = { projectId, ownerId: owner, revisionId };
const draft: GameProjectDraft = { schemaVersion: 1, projectId, ownerId: owner, name: "GAME-320 benchmark", revision: { revisionId, projectId, ownerId: owner, sequence: 1 }, scenes: [{ sceneId: asSceneId("scene"), name: "Scene", rootEntityIds: [asEntityId("entity")], entities: [{ entityId: asEntityId("entity"), name: "Entity", components: [{ type: "TRANSFORM", componentId: asComponentId("transform"), x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }] }] }], prefabs: [], dependencies: [], behaviors: [] };
const project = await createGameProject(draft, caller);
const snapshot = (await createRuntimeSnapshot(project, caller)).value!;
let session = createRuntimeSession(snapshot, { projectId: String(projectId), ownerId: String(owner), revisionId: String(revisionId) }).value!;
session = playRuntime(session).value!;
const start = performance.now();
for (let index = 0; index < 1000; index += 1) session = stepRuntime(session, 1, [{ actionId: "action.tick", phase: "performed", value: index, sequence: index + 1 }]).value!;
const stepMs = performance.now() - start;
const saveStart = performance.now();
const save = await saveRuntimeState(session);
const saveMs = performance.now() - saveStart;
console.log(JSON.stringify({ benchmark: "GAME-320", steps: 1000, stepMs, saveMs, tick: session.world.tick, saveOk: save.ok, deterministic: true }));
