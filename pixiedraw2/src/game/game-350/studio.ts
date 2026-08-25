/**
 * GAME-350 Game Studio projection contract.
 *
 * The Studio owns presentation state and command intents only. It does not
 * mutate a Project, resolve authority, access a host, or execute user code.
 * Canonical Project changes continue through GAME-300 Core/Journal and the
 * server-side revision boundary.
 */

import {
  canonicalJson,
  compileGraphBehavior,
  compileNoCodeBehavior,
  compileScriptBehavior,
  sha256,
  validateGameProject,
  type BehaviorIR,
  type BehaviorId,
  type CallerContext,
  type GameProject,
  type GraphBehaviorSource,
  type NoCodeBehaviorSource,
  type ScriptBehaviorSource,
  type SceneId,
  type EntityId,
  type RevisionId,
  type Sha256,
} from "../game-300/core.ts";

export const GAME_STUDIO_SCHEMA_VERSION = 1 as const;

export type StudioMode = "SIMPLE" | "DETAIL" | "CODE";
export type StudioPanel = "SCENE" | "ENTITY" | "INSPECTOR" | "EVENT_SHEET" | "GRAPH" | "CODE" | "INPUT" | "PREVIEW" | "BUILD";
export type StudioProfile = "DESKTOP" | "TABLET" | "MOBILE";

export interface StudioDiagnostic {
  readonly code: "INVALID_PROJECT" | "CALLER_MISMATCH" | "PROJECT_MISMATCH" | "OWNER_MISMATCH" | "REVISION_MISMATCH" | "MISSING_SCENE" | "MISSING_ENTITY" | "INVALID_BEHAVIOR" | "UNSUPPORTED_PANEL";
  readonly path: string;
  readonly message: string;
}

export interface StudioResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly diagnostics: readonly StudioDiagnostic[];
}

export interface StudioLocalState {
  readonly selectedTab: StudioPanel;
  readonly panelZoom: number;
  readonly timelineScroll: number;
  readonly mobileSheet: StudioPanel | undefined;
}

export interface GameStudioWorkspaceState {
  readonly schemaVersion: typeof GAME_STUDIO_SCHEMA_VERSION;
  readonly projectId: GameProject["projectId"];
  readonly ownerId: GameProject["ownerId"];
  readonly revisionId: RevisionId;
  readonly profile: StudioProfile;
  readonly mode: StudioMode;
  readonly activePanel: StudioPanel;
  readonly selectedSceneId: SceneId | undefined;
  readonly selectedEntityId: EntityId | undefined;
  readonly selectedBehaviorId: BehaviorId | undefined;
  /** Local presentation state is deliberately not Project/PiXYNC state. */
  readonly local: StudioLocalState;
}

export interface CreationGuideStep {
  readonly id: "PROJECT" | "SCENE" | "ENTITY" | "BEHAVIOR" | "PREVIEW" | "BUILD";
  readonly commandId: string;
  readonly label: string;
  readonly panel: StudioPanel;
}

export interface BehaviorEditIntent {
  readonly schemaVersion: typeof GAME_STUDIO_SCHEMA_VERSION;
  readonly commandId: string;
  readonly projectId: GameProject["projectId"];
  readonly baseRevisionId: RevisionId;
  readonly behaviorId: BehaviorId;
  readonly sourceMode: StudioMode;
  readonly behavior: BehaviorIR;
  readonly sourceHash: Sha256;
}

export type BehaviorSource = NoCodeBehaviorSource | GraphBehaviorSource | ScriptBehaviorSource;

function success<T>(value: T): StudioResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(...diagnostics: StudioDiagnostic[]): StudioResult<T> {
  return { ok: false, diagnostics };
}

function diagnostic(code: StudioDiagnostic["code"], path: string, message: string): StudioDiagnostic {
  return { code, path, message };
}

function profileSupportsPanel(profile: StudioProfile, panel: StudioPanel): boolean {
  // Mobile uses the same Core but presents complex panels as a sheet. Nothing
  // is removed from the Project model merely because the profile is mobile.
  void profile;
  void panel;
  return true;
}

function projectIdentityDiagnostics(state: GameStudioWorkspaceState, project: GameProject): StudioDiagnostic[] {
  const diagnostics: StudioDiagnostic[] = [];
  if (project.projectId !== state.projectId || project.revision.projectId !== state.projectId) {
    diagnostics.push(diagnostic("PROJECT_MISMATCH", "project.projectId", "The selected Project is not the Project bound to this Studio state."));
  }
  if (project.ownerId !== state.ownerId || project.revision.ownerId !== state.ownerId) {
    diagnostics.push(diagnostic("OWNER_MISMATCH", "project.ownerId", "The selected Project owner is not the owner bound to this Studio state."));
  }
  if (project.revision.revisionId !== state.revisionId) {
    diagnostics.push(diagnostic("REVISION_MISMATCH", "project.revision.revisionId", "The selected Project revision is not the revision bound to this Studio state."));
  }
  return diagnostics;
}

function canonicalProjectForState(state: GameStudioWorkspaceState, project: GameProject): StudioDiagnostic[] {
  const identity = projectIdentityDiagnostics(state, project);
  if (identity.length > 0) return identity;
  const validation = validateGameProject(project);
  return validation.valid ? [] : [diagnostic("INVALID_PROJECT", "project", validation.diagnostics.map((item) => item.code).join(", "))];
}

function firstScene(project: GameProject): SceneId | undefined {
  return project.scenes[0]?.sceneId;
}

function selectedEntity(project: GameProject, sceneId: SceneId | undefined): EntityId | undefined {
  if (sceneId === undefined) return undefined;
  return project.scenes.find((scene) => scene.sceneId === sceneId)?.entities[0]?.entityId;
}

export function createGameStudioWorkspace(
  project: GameProject,
  caller: CallerContext,
  profile: StudioProfile,
): StudioResult<GameStudioWorkspaceState> {
  const validation = validateGameProject(project, caller);
  if (!validation.valid) return failure(diagnostic("INVALID_PROJECT", "project", validation.diagnostics.map((item) => item.code).join(", ")));
  const sceneId = firstScene(project);
  const entityId = selectedEntity(project, sceneId);
  return success({
    schemaVersion: GAME_STUDIO_SCHEMA_VERSION,
    projectId: project.projectId,
    ownerId: project.ownerId,
    revisionId: project.revision.revisionId,
    profile,
    mode: "SIMPLE",
    activePanel: "SCENE",
    selectedSceneId: sceneId,
    selectedEntityId: entityId,
    selectedBehaviorId: undefined,
    local: { selectedTab: "SCENE", panelZoom: 1, timelineScroll: 0, mobileSheet: undefined },
  });
}

export function selectScene(state: GameStudioWorkspaceState, project: GameProject, sceneId: SceneId): StudioResult<GameStudioWorkspaceState> {
  const identity = canonicalProjectForState(state, project);
  if (identity.length > 0) return failure(...identity);
  const scene = project.scenes.find((item) => item.sceneId === sceneId);
  if (scene === undefined) return failure(diagnostic("MISSING_SCENE", "sceneId", `Scene ${sceneId} is not part of the Project.`));
  return success({ ...state, selectedSceneId: sceneId, selectedEntityId: scene.entities[0]?.entityId, selectedBehaviorId: undefined, activePanel: "SCENE", local: { ...state.local, selectedTab: "SCENE", mobileSheet: state.profile === "MOBILE" ? "SCENE" : undefined } });
}

export function selectEntity(state: GameStudioWorkspaceState, project: GameProject, sceneId: SceneId, entityId: EntityId): StudioResult<GameStudioWorkspaceState> {
  const identity = canonicalProjectForState(state, project);
  if (identity.length > 0) return failure(...identity);
  const scene = project.scenes.find((item) => item.sceneId === sceneId);
  if (scene === undefined) return failure(diagnostic("MISSING_SCENE", "sceneId", `Scene ${sceneId} is not part of the Project.`));
  if (!scene.entities.some((item) => item.entityId === entityId)) return failure(diagnostic("MISSING_ENTITY", "entityId", `Entity ${entityId} is not part of Scene ${sceneId}.`));
  return success({ ...state, selectedSceneId: sceneId, selectedEntityId: entityId, activePanel: "INSPECTOR", local: { ...state.local, selectedTab: "INSPECTOR", mobileSheet: state.profile === "MOBILE" ? "INSPECTOR" : undefined } });
}

export function setStudioMode(state: GameStudioWorkspaceState, mode: StudioMode): GameStudioWorkspaceState {
  return { ...state, mode, activePanel: mode === "SIMPLE" ? "EVENT_SHEET" : mode === "DETAIL" ? "GRAPH" : "CODE", local: { ...state.local, selectedTab: mode === "SIMPLE" ? "EVENT_SHEET" : mode === "DETAIL" ? "GRAPH" : "CODE", mobileSheet: state.profile === "MOBILE" ? (mode === "SIMPLE" ? "EVENT_SHEET" : mode === "DETAIL" ? "GRAPH" : "CODE") : undefined } };
}

export function openStudioPanel(state: GameStudioWorkspaceState, panel: StudioPanel): StudioResult<GameStudioWorkspaceState> {
  if (!profileSupportsPanel(state.profile, panel)) return failure(diagnostic("UNSUPPORTED_PANEL", "panel", `${panel} is not available for ${state.profile}.`));
  return success({ ...state, activePanel: panel, local: { ...state.local, selectedTab: panel, mobileSheet: state.profile === "MOBILE" ? panel : undefined } });
}

export function creationGuide(): readonly CreationGuideStep[] {
  return [
    { id: "PROJECT", commandId: "game.project.create", label: "Create Project", panel: "SCENE" },
    { id: "SCENE", commandId: "game.scene.add", label: "Add Scene", panel: "SCENE" },
    { id: "ENTITY", commandId: "game.entity.add", label: "Add Entity", panel: "ENTITY" },
    { id: "BEHAVIOR", commandId: "game.behavior.add", label: "Add Behavior", panel: "EVENT_SHEET" },
    { id: "PREVIEW", commandId: "game.preview.start", label: "Preview", panel: "PREVIEW" },
    { id: "BUILD", commandId: "game.build.plan", label: "Prepare Build", panel: "BUILD" },
  ];
}

function compileSource(source: BehaviorSource): StudioResult<BehaviorIR> {
  try {
    if ("language" in source) return success(compileScriptBehavior(source));
    if ("nodes" in source) return success(compileGraphBehavior(source));
    return success(compileNoCodeBehavior(source));
  } catch (error) {
    return failure(diagnostic("INVALID_BEHAVIOR", "source", error instanceof Error ? error.message : "Behavior source is invalid."));
  }
}

export async function createBehaviorEditIntent(
  state: GameStudioWorkspaceState,
  caller: CallerContext,
  source: BehaviorSource,
  commandId: string,
): Promise<StudioResult<BehaviorEditIntent>> {
  if (caller.projectId !== state.projectId || caller.ownerId !== state.ownerId || caller.revisionId !== state.revisionId) return failure(diagnostic("CALLER_MISMATCH", "caller", "Studio command must use the current Project identity."));
  const compiled = compileSource(source);
  if (!compiled.ok || compiled.value === undefined) return failure(...compiled.diagnostics);
  const sourceHash = await sha256({ commandId, projectId: state.projectId, baseRevisionId: state.revisionId, source: JSON.parse(canonicalJson(source)) });
  const sourceMode: StudioMode = "language" in source ? "CODE" : "nodes" in source ? "DETAIL" : "SIMPLE";
  return success({ schemaVersion: GAME_STUDIO_SCHEMA_VERSION, commandId, projectId: state.projectId, baseRevisionId: state.revisionId, behaviorId: compiled.value.behaviorId, sourceMode, behavior: compiled.value, sourceHash });
}
