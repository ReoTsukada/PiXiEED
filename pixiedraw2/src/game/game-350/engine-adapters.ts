/**
 * GAME-350 target adapter packages.
 *
 * The browser editor remains engine-neutral. This module materializes a small,
 * deterministic hand-off package for Unity, Godot, or Unreal without copying
 * Draw/Audio source bytes or pretending that a native compiler was executed.
 * The package contains the canonical GameProject, the locked BuildPlan, and a
 * target-specific loader/import surface that a native project can consume.
 */

import {
  canonicalJson,
  validateGameProject,
  type CallerContext,
  type GameProject,
  type Scene,
  type Sha256,
} from "../game-300/core.ts";
import {
  validateBuildPlan,
  type BuildDiagnostic,
  type BuildLanguage,
  type BuildPlan,
  type BuildResult,
  type BuildTarget,
  type PackageEntry,
} from "../game-330/core.ts";
import { sha256 } from "../game-300/core.ts";

export const ENGINE_HANDOFF_SCHEMA_VERSION = "ENGINE_HANDOFF_V2" as const;
export const GAME350_ENGINE_ADAPTER_SCHEMA_VERSION = 2 as const;

export type EngineAdapterId =
  | "UNITY_TEXT_IMPORT_V2"
  | "GODOT_GDSCRIPT_IMPORT_V2"
  | "UNREAL_DATA_IMPORT_V2";

export type EngineAdapterLanguage = BuildLanguage;

export interface EngineAdapterPackage {
  readonly schemaVersion: typeof GAME350_ENGINE_ADAPTER_SCHEMA_VERSION;
  readonly handoffSchemaVersion: typeof ENGINE_HANDOFF_SCHEMA_VERSION;
  readonly target: Extract<BuildTarget, "UNITY" | "GODOT" | "UNREAL">;
  readonly adapterId: EngineAdapterId;
  readonly sourceLanguage: BuildLanguage;
  readonly adapterLanguage: EngineAdapterLanguage;
  readonly planHash: Sha256;
  readonly projectHash: Sha256;
  readonly packageHash: Sha256;
  readonly buildPlanPath: "pixieed/build-plan.json";
  readonly buildManifestPath: "pixieed/build-manifest.json";
  readonly timelinePath: "pixieed/timeline.json";
  readonly entries: readonly PackageEntry[];
  readonly editorSurfaces: readonly {
    readonly rail: "ACTION" | "HIERARCHY" | "VIEWPORT" | "INSPECTOR" | "TIMELINE";
    readonly targetSurface: string;
  }[];
  readonly limitations: readonly string[];
}

function success<T>(value: T): BuildResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(...diagnostics: BuildDiagnostic[]): BuildResult<T> {
  return { ok: false, diagnostics };
}

function diagnostic(
  path: string,
  message: string,
  recoverable = true,
): BuildDiagnostic {
  return {
    code: "INVALID_PACKAGE",
    path,
    message,
    recoverable,
  };
}

function safeFilePart(value: string): string {
  const result = value.replace(/[^A-Za-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "");
  return result || "item";
}

function jsonEntry(path: string, value: unknown): PackageEntry {
  return { path, content: `${canonicalJson(value)}\n` };
}

function projectPayload(project: GameProject): Record<string, unknown> {
  return {
    schemaVersion: project.schemaVersion,
    projectId: String(project.projectId),
    ownerId: String(project.ownerId),
    name: project.name,
    revision: project.revision,
    scenes: project.scenes,
    prefabs: project.prefabs,
    dependencies: project.dependencies,
    behaviors: project.behaviors,
    editorTimeline: project.editorTimeline ?? null,
  };
}

function referencePayload(project: GameProject): readonly Record<string, unknown>[] {
  const references = new Map<string, Record<string, unknown>>();
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (component.type !== "SPRITE" && component.type !== "AUDIO_SOURCE") continue;
        const asset = component.asset;
        const key = `${asset.kind}:${String(asset.assetId)}:${String(asset.revisionId)}`;
        references.set(key, {
          kind: asset.kind,
          assetId: String(asset.assetId),
          revisionId: String(asset.revisionId),
          contentHash: String(asset.contentHash),
          mode: asset.mode,
          ownerId: String(asset.ownerId),
        });
      }
    }
  }
  return [...references.values()].sort((left, right) =>
    `${String(left.kind)}:${String(left.assetId)}:${String(left.revisionId)}`.localeCompare(
      `${String(right.kind)}:${String(right.assetId)}:${String(right.revisionId)}`,
    )
  );
}

function buildPlanPayload(plan: BuildPlan): Record<string, unknown> {
  return {
    schemaVersion: plan.schemaVersion,
    projectId: plan.projectId,
    ownerId: plan.ownerId,
    projectRevisionId: plan.projectRevisionId,
    projectHash: plan.projectHash,
    behaviorIrHash: plan.behaviorIrHash,
    target: plan.target,
    profile: plan.profile,
    language: plan.language,
    module: plan.module,
    capabilities: plan.capabilities,
    dependencyLocks: plan.dependencyLocks,
    assetLocks: plan.assetLocks,
    licenses: plan.licenses,
    planHash: plan.planHash,
  };
}

function timelinePayload(project: GameProject): Record<string, unknown> {
  const timeline = project.editorTimeline;
  return {
    schemaVersion: "PXD_GAME_TIMELINE_V1",
    frameCount: timeline?.frameCount ?? 0,
    tracks: (timeline?.tracks ?? []).map((track) => ({
      trackId: String(track.trackId),
      label: track.label,
      kind: track.kind,
      activeFrames: [...track.activeFrames],
    })),
    source: "PiXiEEDstudio/iGAME",
    nativeMapping: {
      UNITY: "AnimationClip/Timeline",
      GODOT: "AnimationPlayer/AnimationLibrary",
      UNREAL: "LevelSequence/Sequencer",
    },
  };
}

function handoffManifestPayload(
  target: EngineAdapterPackage["target"],
  plan: BuildPlan,
  project: GameProject,
  adapterId: EngineAdapterId,
): Record<string, unknown> {
  return {
    schemaVersion: ENGINE_HANDOFF_SCHEMA_VERSION,
    adapterId,
    target,
    projectId: String(project.projectId),
    projectRevisionId: String(plan.projectRevisionId),
    projectHash: plan.projectHash,
    planHash: plan.planHash,
    language: plan.language,
    editorSurfaces: targetMetadata(target).editorSurfaces,
    assetPolicy: "PINNED_REFERENCE_ONLY",
    timelinePolicy: "CANONICAL_TIMELINE_PAYLOAD",
    nativeQualification: "UNTESTED",
  };
}

function scenePayload(scene: Scene): Record<string, unknown> {
  return {
    sceneId: String(scene.sceneId),
    name: scene.name,
    rootEntityIds: scene.rootEntityIds.map(String),
    entities: scene.entities,
  };
}

function unityRuntime(): string {
  return `using UnityEngine;
using System.IO;

namespace PiXiEED.Generated {
    /// Reads the engine-neutral PiXiEED project document at runtime.
    /// Asset bytes remain external and are resolved by the host project.
    public sealed class PiXiEEDGameProject : MonoBehaviour {
        [SerializeField] private TextAsset projectDocument;

        public string ProjectJson => projectDocument == null ? string.Empty : projectDocument.text;

        private void Awake() {
            if (projectDocument == null) {
                Debug.LogWarning("PiXiEED project document is not assigned.");
            }
        }
    }
}
`;
}

function unityProjectVersion(): string {
  return "m_EditorVersion: 2022.3.0f1\nm_EditorVersionWithRevision: 2022.3.0f1 (000000000000)\n";
}

function unityPackagesManifest(): string {
  return `${JSON.stringify({
    dependencies: {
      "com.unity.timeline": "1.7.6",
      "com.unity.ugui": "1.0.0",
    },
  }, null, 2)}\n`;
}

function unityScene(): string {
  return `%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!1 &1000\nGameObject:\n  m_ObjectHideFlags: 0\n  m_Name: PiXiEEDGame\n  m_IsActive: 1\n`;
}

function godotProject(): string {
  return `; PiXiEED generated hand-off. Open the project in Godot 4.x.
; Native import and asset assignment remain explicit host-project steps.
config_version=5

[application]
config/name="PiXiEED Game"
run/main_scene="res://scenes/main.tscn"

[display]
window/size/viewport_width=320
window/size/viewport_height=180

[rendering]
renderer/rendering_method="gl_compatibility"
textures/default_filters/use_nearest_mipmap_filter=false
textures/canvas_textures/default_texture_filter=0
`;
}

function godotScene(): string {
  return `[gd_scene load_steps=2 format=3]

[ext_resource path="res://scripts/pixieed_game.gd" type="Script" id="1"]

[node name="PiXiEEDGame" type="Node"]
script = ExtResource("1")
`;
}

function godotRuntime(): string {
  return `extends Node

@export_file("*.json") var project_document := "res://pixieed/game-project.json"

func _ready() -> void:
    if not FileAccess.file_exists(project_document):
        push_warning("PiXiEED project document is missing: %s" % project_document)
        return
    var file := FileAccess.open(project_document, FileAccess.READ)
    var parsed = JSON.parse_string(file.get_as_text())
    if parsed == null:
        push_error("PiXiEED project document is not valid JSON")
        return
    print("PiXiEED Game loaded: ", parsed.get("name", "Unnamed"))
`;
}

function unrealConfig(): string {
  return `[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/PiXiEED/Generated/PiXiEEDMap

[/Script/Engine.Engine]
+ActiveGameNameRedirects=(OldGameName="/Script/EmptyProject",NewGameName="/Script/PiXiEED")
`;
}

function unrealHeader(): string {
  return `#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "PiXiEEDGameMode.generated.h"

UCLASS()
class PIXIEED_API APiXiEEDGameMode : public AGameModeBase {
    GENERATED_BODY()
};
`;
}

function unrealSource(): string {
  return `#include "PiXiEEDGameMode.h"

// The canonical PiXiEED document is imported as project data by the host.
`;
}

function unrealProject(): string {
  return `${JSON.stringify({
    FileVersion: 3,
    EngineAssociation: "5.3",
    Modules: [{ Name: "PiXiEED", Type: "Runtime", LoadingPhase: "Default" }],
    Plugins: [],
  }, null, 2)}\n`;
}

function unrealBuildCs(): string {
  return `using UnrealBuildTool;\n\npublic class PiXiEED : ModuleRules\n{\n    public PiXiEED(ReadOnlyTargetRules Target) : base(Target)\n    {\n        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;\n        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine" });\n    }\n}\n`;
}

function unrealTargetCs(editor = false): string {
  const suffix = editor ? "Editor" : "";
  const type = editor ? "TargetType.Editor" : "TargetType.Game";
  return `using UnrealBuildTool;\n\npublic class PiXiEED${suffix}Target : TargetRules\n{\n    public PiXiEED${suffix}Target(TargetInfo Target) : base(Target)\n    {\n        Type = ${type};\n        DefaultBuildSettings = BuildSettingsVersion.V5;\n        ExtraModuleNames.Add("PiXiEED");\n    }\n}\n`;
}

function targetMetadata(target: EngineAdapterPackage["target"]): {
  readonly adapterId: EngineAdapterId;
  readonly editorSurfaces: EngineAdapterPackage["editorSurfaces"];
} {
  if (target === "UNITY") {
    return {
      adapterId: "UNITY_TEXT_IMPORT_V2",
      editorSurfaces: [
        { rail: "ACTION", targetSurface: "Toolbar / Play / Build" },
        { rail: "HIERARCHY", targetSurface: "Hierarchy" },
        { rail: "VIEWPORT", targetSurface: "Scene / Game View" },
        { rail: "INSPECTOR", targetSurface: "Inspector" },
        { rail: "TIMELINE", targetSurface: "Timeline" },
      ],
    };
  }
  if (target === "GODOT") {
    return {
      adapterId: "GODOT_GDSCRIPT_IMPORT_V2",
      editorSurfaces: [
        { rail: "ACTION", targetSurface: "Main Toolbar / Run / Export" },
        { rail: "HIERARCHY", targetSurface: "Scene dock" },
        { rail: "VIEWPORT", targetSurface: "2D / 3D Viewport" },
        { rail: "INSPECTOR", targetSurface: "Inspector dock" },
        { rail: "TIMELINE", targetSurface: "Animation bottom panel" },
      ],
    };
  }
  return {
    adapterId: "UNREAL_DATA_IMPORT_V2",
    editorSurfaces: [
      { rail: "ACTION", targetSurface: "Main Toolbar / Play / Package" },
      { rail: "HIERARCHY", targetSurface: "Outliner" },
      { rail: "VIEWPORT", targetSurface: "Viewport / PIE" },
      { rail: "INSPECTOR", targetSurface: "Details" },
      { rail: "TIMELINE", targetSurface: "Sequencer" },
    ],
  };
}

function targetEntries(
  target: EngineAdapterPackage["target"],
  project: GameProject,
  plan: BuildPlan,
): PackageEntry[] {
  const metadata = targetMetadata(target);
  const entries: PackageEntry[] = [
    jsonEntry("pixieed/game-project.json", projectPayload(project)),
    jsonEntry("pixieed/asset-references.json", referencePayload(project)),
    jsonEntry("pixieed/build-plan.json", buildPlanPayload(plan)),
    jsonEntry("pixieed/timeline.json", timelinePayload(project)),
    jsonEntry("pixieed/build-manifest.json", handoffManifestPayload(target, plan, project, metadata.adapterId)),
    ...project.scenes.map((scene) =>
      jsonEntry(`pixieed/scenes/${safeFilePart(String(scene.sceneId))}.json`, scenePayload(scene))
    ),
  ];
  if (target === "UNITY") {
    entries.push(
      jsonEntry("Assets/PiXiEED/Generated/GameProject.json", projectPayload(project)),
      jsonEntry("Assets/PiXiEED/Generated/BuildPlan.json", buildPlanPayload(plan)),
      jsonEntry("Assets/PiXiEED/Generated/Timeline.json", timelinePayload(project)),
      { path: "Assets/PiXiEED/Generated/PiXiEEDGameProject.cs", content: unityRuntime() },
      { path: "Assets/Scenes/Main.unity", content: unityScene() },
      { path: "Packages/manifest.json", content: unityPackagesManifest() },
      { path: "ProjectSettings/ProjectVersion.txt", content: unityProjectVersion() },
      { path: "Assets/PiXiEED/Generated/README.md", content: "Assign GameProject.json to PiXiEEDGameProject.projectDocument, then resolve locked Draw/Audio references in the host project.\n" },
    );
  } else if (target === "GODOT") {
    entries.push(
      { path: "project.godot", content: godotProject() },
      { path: "scenes/main.tscn", content: godotScene() },
      { path: "scripts/pixieed_game.gd", content: godotRuntime() },
      { path: "README.md", content: "Open in Godot 4.x. Assign locked Draw/Audio references in the host project; the generated JSON remains the canonical hand-off.\n" },
    );
  } else {
    entries.push(
      { path: "Config/DefaultGame.ini", content: unrealConfig() },
      { path: "PiXiEED.uproject", content: unrealProject() },
      { path: "Source/PiXiEED/PiXiEED.Build.cs", content: unrealBuildCs() },
      { path: "Source/PiXiEED.Target.cs", content: unrealTargetCs() },
      { path: "Source/PiXiEEDEditor.Target.cs", content: unrealTargetCs(true) },
      { path: "Source/PiXiEED/PiXiEEDGameMode.h", content: unrealHeader() },
      { path: "Source/PiXiEED/PiXiEEDGameMode.cpp", content: unrealSource() },
      { path: "Content/PiXiEED/Generated/GameProject.json", content: `${canonicalJson(projectPayload(project))}\n` },
      { path: "Content/PiXiEED/Generated/BuildPlan.json", content: `${canonicalJson(buildPlanPayload(plan))}\n` },
      { path: "Content/PiXiEED/Generated/Timeline.json", content: `${canonicalJson(timelinePayload(project))}\n` },
      { path: "README.md", content: "Import the generated data into an Unreal project and bind locked Draw/Audio references through the host Content/Details/Sequencer workflow.\n" },
    );
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export async function createGame350EngineAdapterPackage(
  project: GameProject,
  plan: BuildPlan,
  caller: CallerContext,
): Promise<BuildResult<EngineAdapterPackage>> {
  const projectValidation = validateGameProject(project, caller);
  if (!projectValidation.valid) {
    return failure(diagnostic("project", "Canonical GameProject is invalid for engine packaging."));
  }
  if (plan.target !== "UNITY" && plan.target !== "GODOT" && plan.target !== "UNREAL") {
    return failure(diagnostic("plan.target", "The native target adapter accepts Unity, Godot, or Unreal only."));
  }
  const planValidation = await validateBuildPlan(plan, {
    projectId: String(caller.projectId),
    ownerId: String(caller.ownerId),
    revisionId: String(caller.revisionId),
  });
  if (!planValidation.ok) return failure(...planValidation.diagnostics);
  const references = referencePayload(project);
  if (references.some((reference) => reference.mode !== "PINNED")) {
    return failure(diagnostic("project.scenes", "Native engine packages require PINNED Draw/Audio references."));
  }
  const metadata = targetMetadata(plan.target);
  const entries = targetEntries(plan.target, project, plan);
  const packageHash = await sha256({
    schemaVersion: GAME350_ENGINE_ADAPTER_SCHEMA_VERSION,
    handoffSchemaVersion: ENGINE_HANDOFF_SCHEMA_VERSION,
    target: plan.target,
    adapterId: metadata.adapterId,
    sourceLanguage: plan.language,
    adapterLanguage: plan.target === "GODOT" ? "GDSCRIPT" : plan.target === "UNITY" ? "C_SHARP" : "CPP",
    planHash: plan.planHash,
    entries: await Promise.all(entries.map(async (entry) => ({ path: entry.path, contentHash: await sha256(entry.content) }))),
  });
  return success({
    schemaVersion: GAME350_ENGINE_ADAPTER_SCHEMA_VERSION,
    handoffSchemaVersion: ENGINE_HANDOFF_SCHEMA_VERSION,
    target: plan.target,
    adapterId: metadata.adapterId,
    sourceLanguage: plan.language,
    adapterLanguage: plan.target === "GODOT" ? "GDSCRIPT" : plan.target === "UNITY" ? "C_SHARP" : "CPP",
    planHash: plan.planHash,
    projectHash: project.revision.snapshotHash,
    packageHash,
    buildPlanPath: "pixieed/build-plan.json",
    buildManifestPath: "pixieed/build-manifest.json",
    timelinePath: "pixieed/timeline.json",
    entries,
    editorSurfaces: metadata.editorSurfaces,
    limitations: [
      "外部エンジンのコンパイル・インポート実行はこのブラウザ環境では行わない。",
      "Draw/Audioの原本バイト列は含めず、PXD/RegistryのPINNED参照だけを保持する。",
      "ネイティブ側の素材割当・入力・プラットフォーム設定は対象エンジンのプロジェクト内で確定する。",
    ],
  });
}
