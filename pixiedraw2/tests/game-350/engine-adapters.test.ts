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
  type GameProjectDraft,
} from "../../src/game/game-300/core.ts";
import { createBuildPlan, type BuildPlanRequest } from "../../src/game/game-330/core.ts";
import { createGame350EngineAdapterPackage } from "../../src/game/game-350/engine-adapters.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const owner = asOwnerId("engine-adapter-owner");
const projectId = asProjectId("engine-adapter-project");
const revisionId = asRevisionId("engine-adapter-revision-1");
const caller: CallerContext = { projectId, ownerId: owner, revisionId };
const drawHash = asSha256("a".repeat(64));
const audioHash = asSha256("b".repeat(64));

async function fixture() {
  const draft: GameProjectDraft = {
    schemaVersion: 1,
    projectId,
    ownerId: owner,
    name: "Engine Adapter Fixture",
    revision: { revisionId, projectId, ownerId: owner, sequence: 1 },
    scenes: [{
      sceneId: asSceneId("scene-main"),
      name: "Main",
      rootEntityIds: [asEntityId("hero")],
      entities: [{
        entityId: asEntityId("hero"),
        name: "Hero",
        components: [
          { type: "TRANSFORM", componentId: asComponentId("transform"), x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          { type: "SPRITE", componentId: asComponentId("sprite"), asset: { kind: "DRAW", assetId: asAssetId("draw-hero"), revisionId: asAssetRevisionId("draw-revision-1"), ownerId: owner, contentHash: drawHash, mode: "PINNED" }, visible: true },
          { type: "AUDIO_SOURCE", componentId: asComponentId("audio"), asset: { kind: "AUDIO", assetId: asAssetId("audio-bgm"), revisionId: asAssetRevisionId("audio-revision-1"), ownerId: owner, contentHash: audioHash, mode: "PINNED" }, loop: true, volume: 1 },
        ],
      }],
    }],
    prefabs: [],
    dependencies: [],
    behaviors: [],
  };
  const project = await createGameProject(draft, caller);
  const request: BuildPlanRequest = {
    target: "UNITY",
    profile: "DETERMINISTIC",
    language: "C_SHARP",
    module: "pixieed-game",
    capabilities: ["INPUT", "DRAW", "AUDIO", "SAVE_STATE"],
    dependencyLocks: [],
    assetLocks: [
      { assetId: "draw-hero", revisionId: "draw-revision-1", kind: "DRAW", contentHash: drawHash, mode: "PINNED" },
      { assetId: "audio-bgm", revisionId: "audio-revision-1", kind: "AUDIO", contentHash: audioHash, mode: "PINNED" },
    ],
    licenses: [],
  };
  return { project, request };
}

Deno.test("GAME350-ENGINE-001 emits deterministic Unity, Godot, and Unreal hand-off packages", async () => {
  const { project, request } = await fixture();
  for (const [target, language] of [["UNITY", "C_SHARP"], ["GODOT", "GDSCRIPT"], ["UNREAL", "CPP"]] as const) {
    const plan = (await createBuildPlan(project, caller, { ...request, target, language })).value;
    assert(plan !== undefined, `${target} BuildPlan must be valid`);
    const one = await createGame350EngineAdapterPackage(project, plan, caller);
    const two = await createGame350EngineAdapterPackage(project, plan, caller);
    assert(one.ok && two.ok && one.value !== undefined && two.value !== undefined, `${target} adapter package must be valid`);
    const packaged = one.value;
    const repeated = two.value;
    assert(packaged.packageHash === repeated.packageHash, `${target} package hash must be deterministic`);
    assert(packaged.handoffSchemaVersion === "ENGINE_HANDOFF_V2", `${target} must declare the V2 hand-off contract`);
    assert(packaged.entries.some((entry) => entry.path === "pixieed/build-plan.json"), `${target} must carry the full BuildPlan`);
    assert(packaged.entries.some((entry) => entry.path === "pixieed/timeline.json"), `${target} must carry the canonical timeline`);
    assert(packaged.entries.some((entry) => entry.path === "pixieed/build-manifest.json"), `${target} must carry the hand-off manifest`);
    assert(packaged.entries.some((entry) => entry.path === "pixieed/game-project.json"), `${target} must carry canonical GameProject`);
    assert(packaged.entries.some((entry) => entry.path.includes("asset-references.json")), `${target} must carry locked asset references`);
    assert(packaged.editorSurfaces.length === 5, `${target} must map all five editor rails`);
    const entry = (path: string) => packaged.entries.find((candidate) => candidate.path === path)?.content ?? "";
    const projectDocument = JSON.parse(entry("pixieed/game-project.json"));
    const timelineDocument = JSON.parse(entry("pixieed/timeline.json"));
    const referencesDocument = JSON.parse(entry("pixieed/asset-references.json"));
    assert(projectDocument.projectId === String(project.projectId), `${target} project hand-off must preserve Project identity`);
    assert(timelineDocument.nativeMapping[target] !== undefined, `${target} timeline must declare its native mapping`);
    assert(referencesDocument.some((reference: { kind?: string; mode?: string }) => reference.kind === "DRAW" && reference.mode === "PINNED"), `${target} must carry the locked Draw reference`);
    assert(referencesDocument.some((reference: { kind?: string; mode?: string }) => reference.kind === "AUDIO" && reference.mode === "PINNED"), `${target} must carry the locked Audio reference`);
    if (target === "UNITY") {
      assert(entry("Packages/manifest.json").includes("com.unity.timeline"), "Unity starter must enable Timeline");
      assert(entry("ProjectSettings/ProjectVersion.txt").includes("m_EditorVersion:"), "Unity starter must declare an editor version");
      assert(entry("Assets/Scenes/Main.unity").startsWith("%YAML 1.1"), "Unity starter must emit a Unity scene document");
      assert(entry("Assets/PiXiEED/Generated/PiXiEEDGameProject.cs").includes("MonoBehaviour"), "Unity starter must emit a runtime loader");
    }
    if (target === "GODOT") {
      assert(entry("project.godot").includes("config_version=5"), "Godot starter must target the Godot 4 project format");
      assert(entry("project.godot").includes("run/main_scene=\"res://scenes/main.tscn\""), "Godot starter must bind its main scene");
      assert(entry("scenes/main.tscn").includes("[gd_scene"), "Godot starter must emit a scene resource");
      assert(entry("scripts/pixieed_game.gd").includes("extends Node"), "Godot starter must emit a runtime loader");
    }
    if (target === "UNREAL") {
      const unrealProject = JSON.parse(entry("PiXiEED.uproject"));
      assert(unrealProject.Modules?.some((module: { Name?: string }) => module.Name === "PiXiEED"), "Unreal starter must declare the PiXiEED module");
      assert(entry("Source/PiXiEED/PiXiEED.Build.cs").includes("ModuleRules"), "Unreal starter must include a module Build.cs");
      assert(entry("Source/PiXiEED/PiXiEEDGameMode.h").includes("AGameModeBase"), "Unreal starter must emit a game mode");
    }
  }
});

Deno.test("GAME350-ENGINE-002 rejects LIVE references before native packaging", async () => {
  const { project, request } = await fixture();
  const liveProject = JSON.parse(JSON.stringify(project));
  liveProject.scenes[0].entities[0].components[1].asset.mode = "LIVE";
  const livePlan = (await createBuildPlan(liveProject, caller, request)).value;
  assert(livePlan !== undefined, "the engine adapter must receive a canonical plan before applying its stricter package boundary");
  const result = await createGame350EngineAdapterPackage(liveProject, livePlan, caller);
  assert(!result.ok && result.diagnostics.some((item) => item.path === "project.scenes"), "native packaging must reject LIVE references");
});
