/**
 * GAME-300 Game Project Core.
 *
 * This package is a pure canonical model. It intentionally has no DOM, network,
 * filesystem, storage, editor, runtime, or registry dependency.
 */

type Brand<T, Name extends string> = T & { readonly __game300Brand: Name };

export type ProjectId = Brand<string, "ProjectId">;
export type OwnerId = Brand<string, "OwnerId">;
export type SceneId = Brand<string, "SceneId">;
export type EntityId = Brand<string, "EntityId">;
export type ComponentId = Brand<string, "ComponentId">;
export type PrefabId = Brand<string, "PrefabId">;
export type BehaviorId = Brand<string, "BehaviorId">;
export type RevisionId = Brand<string, "RevisionId">;
export type DependencyId = Brand<string, "DependencyId">;
export type AssetId = Brand<string, "AssetId">;
export type AssetRevisionId = Brand<string, "AssetRevisionId">;
export type Sha256 = Brand<string, "Sha256">;

export const GAME_PROJECT_SCHEMA_VERSION = 1 as const;
export const BEHAVIOR_IR_VERSION = 1 as const;

export type DiagnosticCode =
  | "UNKNOWN_SCHEMA"
  | "DUPLICATE_ID"
  | "DEPENDENCY_CYCLE"
  | "INVALID_COMPONENT"
  | "CALLER_OWNER_MISMATCH"
  | "CALLER_REVISION_MISMATCH"
  | "PROJECT_ID_MISMATCH"
  | "MISSING_REFERENCE"
  | "INVALID_REFERENCE"
  | "INVALID_REVISION"
  | "INVALID_PROJECT";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly path: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface CallerContext {
  readonly projectId: ProjectId;
  readonly ownerId: OwnerId;
  readonly revisionId: RevisionId;
}

export type AssetKind = "DRAW" | "AUDIO";
export type AssetReferenceMode = "PINNED" | "LIVE";

export interface AssetRevisionReference {
  readonly kind: AssetKind;
  readonly assetId: AssetId;
  readonly revisionId: AssetRevisionId;
  readonly ownerId: OwnerId;
  readonly contentHash: Sha256;
  readonly mode: AssetReferenceMode;
}

export interface TransformComponent {
  readonly type: "TRANSFORM";
  readonly componentId: ComponentId;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface SpriteComponent {
  readonly type: "SPRITE";
  readonly componentId: ComponentId;
  readonly asset: AssetRevisionReference & { readonly kind: "DRAW" };
  readonly visible: boolean;
}

export interface AudioSourceComponent {
  readonly type: "AUDIO_SOURCE";
  readonly componentId: ComponentId;
  readonly asset: AssetRevisionReference & { readonly kind: "AUDIO" };
  readonly loop: boolean;
  readonly volume: number;
}

export interface BehaviorComponent {
  readonly type: "BEHAVIOR";
  readonly componentId: ComponentId;
  readonly behaviorId: BehaviorId;
}

export interface CameraComponent {
  readonly type: "CAMERA";
  readonly componentId: ComponentId;
  readonly active: boolean;
  readonly zoom: number;
}

export type Component = TransformComponent | SpriteComponent | AudioSourceComponent | BehaviorComponent | CameraComponent;

export interface Entity {
  readonly entityId: EntityId;
  readonly name: string;
  readonly parentEntityId?: EntityId;
  readonly prefabId?: PrefabId;
  readonly components: readonly Component[];
}

export interface Scene {
  readonly sceneId: SceneId;
  readonly name: string;
  readonly rootEntityIds: readonly EntityId[];
  readonly entities: readonly Entity[];
}

export interface Prefab {
  readonly prefabId: PrefabId;
  readonly name: string;
  readonly rootEntityId: EntityId;
  readonly entityIds: readonly EntityId[];
  readonly componentIds: readonly ComponentId[];
}

export interface Dependency {
  readonly dependencyId: DependencyId;
  readonly kind: "ASSET" | "PROJECT" | "PACKAGE";
  readonly ownerId: OwnerId;
  readonly ownerRevisionId: RevisionId;
  readonly targetId: string;
  readonly targetRevisionId: string;
  readonly dependsOn: readonly DependencyId[];
}

export interface Revision {
  readonly revisionId: RevisionId;
  readonly projectId: ProjectId;
  readonly ownerId: OwnerId;
  readonly sequence: number;
  readonly parentRevisionId?: RevisionId;
  readonly snapshotHash: Sha256;
}

export interface BehaviorTrigger {
  readonly type: "ACTION" | "TAP" | "COLLISION" | "TIMER" | "CUSTOM";
  readonly actionId?: string;
  readonly value?: string;
}

export interface BehaviorCondition {
  readonly kind: "ALWAYS" | "VARIABLE_EQUALS" | "HAS_COMPONENT";
  readonly key?: string;
  readonly value?: string | number | boolean;
}

export interface BehaviorAction {
  readonly kind: "SET_VARIABLE" | "SET_COMPONENT_PROPERTY" | "PLAY_AUDIO" | "SPAWN_ENTITY";
  readonly targetId: string;
  readonly property?: string;
  readonly value?: string | number | boolean;
}

export interface BehaviorRule {
  readonly ruleId: string;
  readonly enabled: boolean;
  readonly trigger: BehaviorTrigger;
  readonly conditions: readonly BehaviorCondition[];
  readonly actions: readonly BehaviorAction[];
}

export interface BehaviorIR {
  readonly behaviorId: BehaviorId;
  readonly version: 1;
  readonly ownership: "CANONICAL_IR";
  readonly rules: readonly BehaviorRule[];
}

/** Canonical editor timeline; it is intentionally not a Scene projection. */
export interface GameTimelineTrack {
  readonly trackId: string;
  readonly label: string;
  readonly kind: string;
  readonly activeFrames: readonly number[];
}

export interface GameEditorTimeline {
  readonly frameCount: number;
  readonly tracks: readonly GameTimelineTrack[];
}

export interface GameProject {
  readonly schemaVersion: 1;
  readonly projectId: ProjectId;
  readonly ownerId: OwnerId;
  readonly name: string;
  readonly revision: Revision;
  readonly scenes: readonly Scene[];
  readonly prefabs: readonly Prefab[];
  readonly dependencies: readonly Dependency[];
  readonly behaviors: readonly BehaviorIR[];
  readonly editorTimeline?: GameEditorTimeline;
}

export type GameProjectDraft = Omit<GameProject, "revision"> & {
  readonly revision: Omit<Revision, "snapshotHash">;
};

export interface ValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface NoCodeBehaviorSource {
  readonly behaviorId: BehaviorId;
  readonly rules: readonly BehaviorRule[];
}

export interface GraphBehaviorSource {
  readonly behaviorId: BehaviorId;
  readonly nodes: readonly { readonly nodeId: string; readonly kind: "RULE"; readonly rule: BehaviorRule }[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
}

export interface ScriptBehaviorSource {
  readonly behaviorId: BehaviorId;
  readonly language: "typescript";
  readonly sourceText: string;
  /** Explicit bounded semantics; arbitrary code is never evaluated or reverse-converted. */
  readonly rules: readonly BehaviorRule[];
}

export interface JournalCommand {
  readonly commandId: string;
  readonly sequence: number;
  readonly beforeHash: Sha256;
  readonly afterHash: Sha256;
  readonly before: GameProject;
  readonly after: GameProject;
}

export interface Checkpoint {
  readonly checkpointId: string;
  readonly sequence: number;
  readonly project: GameProject;
}

export interface JournalState {
  readonly current: GameProject;
  readonly sequence: number;
  readonly past: readonly JournalCommand[];
  readonly future: readonly JournalCommand[];
  readonly checkpoints: readonly Checkpoint[];
}

export function asId<T extends string>(value: string, label: T): Brand<string, T> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) throw new Error(`${label} must be a stable identifier.`);
  return value as Brand<string, T>;
}

export const asProjectId = (value: string): ProjectId => asId(value, "ProjectId");
export const asOwnerId = (value: string): OwnerId => asId(value, "OwnerId");
export const asSceneId = (value: string): SceneId => asId(value, "SceneId");
export const asEntityId = (value: string): EntityId => asId(value, "EntityId");
export const asComponentId = (value: string): ComponentId => asId(value, "ComponentId");
export const asPrefabId = (value: string): PrefabId => asId(value, "PrefabId");
export const asBehaviorId = (value: string): BehaviorId => asId(value, "BehaviorId");
export const asRevisionId = (value: string): RevisionId => asId(value, "RevisionId");
export const asDependencyId = (value: string): DependencyId => asId(value, "DependencyId");
export const asAssetId = (value: string): AssetId => asId(value, "AssetId");
export const asAssetRevisionId = (value: string): AssetRevisionId => asId(value, "AssetRevisionId");
export const asSha256 = (value: string): Sha256 => {
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error("Sha256 must be lowercase hexadecimal SHA-256.");
  return value as Sha256;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(code: DiagnosticCode, path: string, message: string): Diagnostic {
  return { code, path, message, recoverable: true };
}

function duplicateDiagnostics(values: readonly string[], path: string): Diagnostic[] {
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const value of values) {
    if (seen.has(value)) diagnostics.push(diagnostic("DUPLICATE_ID", path, `Duplicate id: ${value}`));
    seen.add(value);
  }
  return diagnostics;
}

function validateCaller(project: Pick<GameProject, "projectId" | "ownerId" | "revision">, caller: CallerContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (project.projectId !== caller.projectId || project.revision.projectId !== caller.projectId) diagnostics.push(diagnostic("PROJECT_ID_MISMATCH", "projectId", "Caller project identity does not match the project revision."));
  if (project.ownerId !== caller.ownerId || project.revision.ownerId !== caller.ownerId) diagnostics.push(diagnostic("CALLER_OWNER_MISMATCH", "ownerId", "Caller owner is not the project/revision owner."));
  if (project.revision.revisionId !== caller.revisionId) diagnostics.push(diagnostic("CALLER_REVISION_MISMATCH", "revision.revisionId", "Caller revision is not the current project revision."));
  return diagnostics;
}

function validateAssetReference(reference: unknown, path: string, ownerId: OwnerId, diagnostics: Diagnostic[]): void {
  if (!isRecord(reference) || !["DRAW", "AUDIO"].includes(String(reference.kind))) {
    diagnostics.push(diagnostic("INVALID_REFERENCE", path, "Asset reference must declare DRAW or AUDIO."));
    return;
  }
  if (reference.ownerId !== ownerId) diagnostics.push(diagnostic("INVALID_REFERENCE", `${path}.ownerId`, "Asset owner must match the Game Project owner."));
  for (const key of ["assetId", "revisionId", "ownerId", "contentHash", "mode"]) if (typeof reference[key] !== "string") diagnostics.push(diagnostic("INVALID_REFERENCE", `${path}.${key}`, "Asset revision reference field is invalid."));
  if (typeof reference.contentHash === "string" && !/^[a-f0-9]{64}$/u.test(reference.contentHash)) diagnostics.push(diagnostic("INVALID_REFERENCE", `${path}.contentHash`, "Asset content hash must be lowercase SHA-256."));
}

function validateComponent(component: unknown, path: string, ownerId: OwnerId, knownBehaviorIds: ReadonlySet<string>, diagnostics: Diagnostic[]): void {
  if (!isRecord(component) || typeof component.type !== "string" || typeof component.componentId !== "string") {
    diagnostics.push(diagnostic("INVALID_COMPONENT", path, "Component shape or type is unsupported."));
    return;
  }
  if (!["TRANSFORM", "SPRITE", "AUDIO_SOURCE", "BEHAVIOR", "CAMERA"].includes(component.type)) {
    diagnostics.push(diagnostic("INVALID_COMPONENT", path, `Unknown component type: ${component.type}`));
    return;
  }
  if (typeof component.componentId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.componentId)) diagnostics.push(diagnostic("INVALID_COMPONENT", `${path}.componentId`, "Component id is invalid."));
  if (component.type === "TRANSFORM" && !["x", "y", "rotation", "scaleX", "scaleY"].every((key) => typeof component[key] === "number" && Number.isFinite(component[key]))) diagnostics.push(diagnostic("INVALID_COMPONENT", path, "Transform component contains a non-finite value."));
  if (component.type === "SPRITE") validateAssetReference(component.asset, `${path}.asset`, ownerId, diagnostics);
  if (component.type === "AUDIO_SOURCE") {
    validateAssetReference(component.asset, `${path}.asset`, ownerId, diagnostics);
    if (!isRecord(component.asset) || component.asset.kind !== "AUDIO") diagnostics.push(diagnostic("INVALID_COMPONENT", `${path}.asset`, "Audio Source requires an AUDIO asset revision."));
    if (typeof component.volume !== "number" || !Number.isFinite(component.volume) || component.volume < 0 || component.volume > 1) diagnostics.push(diagnostic("INVALID_COMPONENT", `${path}.volume`, "Audio volume must be between 0 and 1."));
  }
  if (component.type === "BEHAVIOR" && (typeof component.behaviorId !== "string" || !knownBehaviorIds.has(component.behaviorId))) diagnostics.push(diagnostic("MISSING_REFERENCE", `${path}.behaviorId`, "Behavior component references an unknown behavior."));
  if (component.type === "CAMERA" && (typeof component.zoom !== "number" || !Number.isFinite(component.zoom) || component.zoom <= 0)) diagnostics.push(diagnostic("INVALID_COMPONENT", `${path}.zoom`, "Camera zoom must be a positive finite number."));
}

function validateDependencyCycles(dependencies: readonly Dependency[], diagnostics: Diagnostic[]): void {
  const byId = new Map<string, Dependency>(dependencies.map((dependency) => [String(dependency.dependencyId), dependency]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string): void => {
    if (visiting.has(id)) {
      diagnostics.push(diagnostic("DEPENDENCY_CYCLE", path, `Dependency cycle includes ${id}.`));
      return;
    }
    if (visited.has(id)) return;
    const dependency = byId.get(id);
    if (!dependency) {
      diagnostics.push(diagnostic("MISSING_REFERENCE", path, `Dependency ${id} is missing.`));
      return;
    }
    visiting.add(id);
    for (const target of dependency.dependsOn) visit(target, `${path}.dependsOn`);
    visiting.delete(id);
    visited.add(id);
  };
  for (const dependency of dependencies) visit(dependency.dependencyId, "dependencies");
}

export function validateGameProject(value: unknown, caller?: CallerContext): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) return { valid: false, diagnostics: [diagnostic("INVALID_PROJECT", "project", "Game Project must be an object.")] };
  if (value.schemaVersion !== GAME_PROJECT_SCHEMA_VERSION) diagnostics.push(diagnostic("UNKNOWN_SCHEMA", "schemaVersion", "Unsupported Game Project schema version."));
  if (typeof value.projectId !== "string" || typeof value.ownerId !== "string" || typeof value.name !== "string" || !isRecord(value.revision)) return { valid: false, diagnostics: [...diagnostics, diagnostic("INVALID_PROJECT", "project", "Required Game Project identity is missing.")] };
  const project = value as unknown as GameProject;
  if (caller) diagnostics.push(...validateCaller(project, caller));
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.projectId) || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.ownerId)) diagnostics.push(diagnostic("INVALID_PROJECT", "projectId/ownerId", "Project and owner ids must be stable identifiers."));
  if (!project.name.trim()) diagnostics.push(diagnostic("INVALID_PROJECT", "name", "Project name is required."));
  if (project.revision.projectId !== project.projectId || project.revision.ownerId !== project.ownerId || !Number.isSafeInteger(project.revision.sequence) || project.revision.sequence < 1) diagnostics.push(diagnostic("INVALID_REVISION", "revision", "Revision is not bound to the project owner or sequence."));
  if (!Array.isArray(project.scenes) || !Array.isArray(project.prefabs) || !Array.isArray(project.dependencies) || !Array.isArray(project.behaviors)) return { valid: false, diagnostics: [...diagnostics, diagnostic("INVALID_PROJECT", "project", "Project collections are invalid.")] };

  diagnostics.push(...duplicateDiagnostics(project.scenes.map((scene) => String(scene.sceneId)), "scenes.sceneId"));
  diagnostics.push(...duplicateDiagnostics(project.prefabs.map((prefab) => String(prefab.prefabId)), "prefabs.prefabId"));
  diagnostics.push(...duplicateDiagnostics(project.dependencies.map((dependency) => String(dependency.dependencyId)), "dependencies.dependencyId"));
  diagnostics.push(...duplicateDiagnostics(project.behaviors.map((behavior) => String(behavior.behaviorId)), "behaviors.behaviorId"));
  const behaviorIds = new Set(project.behaviors.map((behavior) => String(behavior.behaviorId)));
  const allEntityIds: string[] = [];
  const allComponentIds: string[] = [];
  for (const [sceneIndex, scene] of project.scenes.entries()) {
    if (!isRecord(scene) || typeof scene.sceneId !== "string" || !Array.isArray(scene.entities) || !Array.isArray(scene.rootEntityIds)) {
      diagnostics.push(diagnostic("INVALID_PROJECT", `scenes[${sceneIndex}]`, "Scene shape is invalid."));
      continue;
    }
    const sceneEntityIds = new Set(scene.entities.map((entity) => String(entity.entityId)));
    for (const rootId of scene.rootEntityIds) if (!sceneEntityIds.has(String(rootId))) diagnostics.push(diagnostic("MISSING_REFERENCE", `scenes[${sceneIndex}].rootEntityIds`, `Root Entity ${String(rootId)} is missing.`));
    diagnostics.push(...duplicateDiagnostics(scene.entities.map((entity) => String(entity.entityId)), `scenes[${sceneIndex}].entities.entityId`));
    for (const [entityIndex, entity] of scene.entities.entries()) {
      if (!isRecord(entity) || typeof entity.entityId !== "string" || !Array.isArray(entity.components)) {
        diagnostics.push(diagnostic("INVALID_PROJECT", `scenes[${sceneIndex}].entities[${entityIndex}]`, "Entity shape is invalid."));
        continue;
      }
      allEntityIds.push(entity.entityId);
      if (entity.parentEntityId !== undefined && !sceneEntityIds.has(String(entity.parentEntityId))) diagnostics.push(diagnostic("MISSING_REFERENCE", `scenes[${sceneIndex}].entities[${entityIndex}].parentEntityId`, "Parent Entity is missing."));
      diagnostics.push(...duplicateDiagnostics(entity.components.map((component) => String(isRecord(component) ? component.componentId : "<invalid>")), `scenes[${sceneIndex}].entities[${entityIndex}].components.componentId`));
      for (const [componentIndex, component] of entity.components.entries()) {
        if (isRecord(component) && typeof component.componentId === "string") allComponentIds.push(component.componentId);
        validateComponent(component, `scenes[${sceneIndex}].entities[${entityIndex}].components[${componentIndex}]`, project.ownerId, behaviorIds, diagnostics);
      }
    }
    for (const entity of scene.entities) {
      const seen = new Set<string>();
      let parentId = entity.parentEntityId;
      while (parentId !== undefined) {
        if (seen.has(String(parentId)) || parentId === entity.entityId) {
          diagnostics.push(diagnostic("DEPENDENCY_CYCLE", `scenes[${sceneIndex}].entities`, `Entity parent cycle includes ${String(entity.entityId)}.`));
          break;
        }
        seen.add(String(parentId));
        parentId = scene.entities.find((candidate) => candidate.entityId === parentId)?.parentEntityId;
      }
    }
  }
  diagnostics.push(...duplicateDiagnostics(allEntityIds, "project.entities.entityId"));
  diagnostics.push(...duplicateDiagnostics(allComponentIds, "project.components.componentId"));
  for (const dependency of project.dependencies) {
    if (!isRecord(dependency) || typeof dependency.dependencyId !== "string" || !Array.isArray(dependency.dependsOn)) diagnostics.push(diagnostic("INVALID_PROJECT", "dependencies", "Dependency shape is invalid."));
    else if (dependency.ownerId !== project.ownerId || dependency.ownerRevisionId !== project.revision.revisionId) diagnostics.push(diagnostic("INVALID_REFERENCE", `dependencies.${dependency.dependencyId}`, "Dependency owner/revision is not the current project revision."));
  }
  validateDependencyCycles(project.dependencies, diagnostics);
  for (const behavior of project.behaviors) {
    if (behavior.version !== BEHAVIOR_IR_VERSION || behavior.ownership !== "CANONICAL_IR" || !Array.isArray(behavior.rules)) diagnostics.push(diagnostic("UNKNOWN_SCHEMA", `behaviors.${String(behavior.behaviorId)}`, "Behavior IR schema is unsupported."));
  }
  if (project.editorTimeline !== undefined) {
    const timeline = project.editorTimeline;
    if (!Number.isSafeInteger(timeline.frameCount) || timeline.frameCount < 1) diagnostics.push(diagnostic("INVALID_PROJECT", "editorTimeline.frameCount", "Editor timeline frame count must be a positive integer."));
    if (!Array.isArray(timeline.tracks)) diagnostics.push(diagnostic("INVALID_PROJECT", "editorTimeline.tracks", "Editor timeline tracks must be an array."));
    else {
      diagnostics.push(...duplicateDiagnostics(timeline.tracks.map((track) => track.trackId), "editorTimeline.tracks.trackId"));
      for (const [index, track] of timeline.tracks.entries()) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(track.trackId) || track.label.trim().length === 0 || track.kind.trim().length === 0) diagnostics.push(diagnostic("INVALID_PROJECT", `editorTimeline.tracks[${index}]`, "Editor timeline track identity is invalid."));
        if (!Array.isArray(track.activeFrames) || track.activeFrames.some((frame: number) => !Number.isSafeInteger(frame) || frame < 0 || frame >= timeline.frameCount)) diagnostics.push(diagnostic("INVALID_PROJECT", `editorTimeline.tracks[${index}].activeFrames`, "Editor timeline frames must be in range."));
        else if (new Set(track.activeFrames).size !== track.activeFrames.length) diagnostics.push(diagnostic("DUPLICATE_ID", `editorTimeline.tracks[${index}].activeFrames`, "Editor timeline frames must be unique."));
      }
    }
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function sortById<T extends Record<string, unknown>>(items: readonly T[], key: keyof T): T[] {
  return [...items].sort((left, right) => String(left[key]).localeCompare(String(right[key]), "en", { numeric: false }));
}

function canonicalProjectPayload(project: GameProject | GameProjectDraft): unknown {
  const revision = { ...project.revision } as Record<string, unknown>;
  delete revision.snapshotHash;
  return {
    schemaVersion: project.schemaVersion,
    projectId: project.projectId,
    ownerId: project.ownerId,
    name: project.name,
    revision,
    scenes: sortById(project.scenes as unknown as Record<string, unknown>[], "sceneId").map((scene) => ({ ...scene, entities: sortById(scene.entities as Record<string, unknown>[], "entityId").map((entity) => ({ ...entity, components: sortById(entity.components as Record<string, unknown>[], "componentId") })) })),
    prefabs: sortById(project.prefabs as unknown as Record<string, unknown>[], "prefabId"),
    dependencies: sortById(project.dependencies as unknown as Record<string, unknown>[], "dependencyId").map((dependency) => ({ ...dependency, dependsOn: [...(dependency.dependsOn as string[])].sort() })),
    behaviors: sortById(project.behaviors as unknown as Record<string, unknown>[], "behaviorId").map((behavior) => ({ ...behavior, rules: sortById(behavior.rules as Record<string, unknown>[], "ruleId") })),
    ...(project.editorTimeline === undefined ? {} : {
      editorTimeline: {
        frameCount: project.editorTimeline.frameCount,
        tracks: sortById(project.editorTimeline.tracks as unknown as Record<string, unknown>[], "trackId").map((track) => ({
          ...track,
          activeFrames: [...(track.activeFrames as number[])].sort((left, right) => left - right),
        })),
      },
    }),
  };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw new Error("Unsupported canonical value.");
}

export async function sha256(value: unknown): Promise<Sha256> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return asSha256([...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
}

export async function createGameProject(draft: GameProjectDraft, caller: CallerContext): Promise<GameProject> {
  const validation = validateGameProject(draft, caller);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => `${item.code}:${item.path}`).join("; "));
  const snapshotHash = await sha256(canonicalProjectPayload(draft));
  return { ...draft, revision: { ...draft.revision, snapshotHash } };
}

function normalizeBehavior(behaviorId: BehaviorId, rules: readonly BehaviorRule[]): BehaviorIR {
  return {
    behaviorId,
    version: BEHAVIOR_IR_VERSION,
    ownership: "CANONICAL_IR",
    rules: sortById(rules.map((rule) => ({ ...rule, conditions: [...rule.conditions], actions: [...rule.actions] })) as Record<string, unknown>[], "ruleId") as unknown as readonly BehaviorRule[],
  };
}

export function compileNoCodeBehavior(source: NoCodeBehaviorSource): BehaviorIR {
  return normalizeBehavior(source.behaviorId, source.rules);
}

export function compileGraphBehavior(source: GraphBehaviorSource): BehaviorIR {
  const ordered = [...source.nodes].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  return normalizeBehavior(source.behaviorId, ordered.map((node) => node.rule));
}

export function compileScriptBehavior(source: ScriptBehaviorSource): BehaviorIR {
  if (source.language !== "typescript" || source.sourceText.trim().length === 0) throw new Error("Script source must declare bounded TypeScript semantics.");
  return normalizeBehavior(source.behaviorId, source.rules);
}

export async function behaviorHash(behavior: BehaviorIR): Promise<Sha256> {
  return sha256(behavior);
}

export function createJournal(initial: GameProject, caller: CallerContext): JournalState {
  const validation = validateGameProject(initial, caller);
  if (!validation.valid) throw new Error("Cannot journal an invalid project.");
  return { current: initial, sequence: 0, past: [], future: [], checkpoints: [] };
}

export async function appendJournalCommand(state: JournalState, next: GameProject, caller: CallerContext, commandId: string): Promise<JournalState> {
  const validation = validateGameProject(next, caller);
  if (!validation.valid) throw new Error("Cannot append an invalid project.");
  const [beforeHash, afterHash] = await Promise.all([sha256(canonicalProjectPayload(state.current)), sha256(canonicalProjectPayload(next))]);
  const command: JournalCommand = { commandId, sequence: state.sequence + 1, beforeHash, afterHash, before: state.current, after: next };
  return { ...state, current: next, sequence: command.sequence, past: [...state.past, command], future: [] };
}

export function undoJournal(state: JournalState): JournalState {
  const command = state.past.at(-1);
  if (!command) return state;
  return { ...state, current: command.before, past: state.past.slice(0, -1), future: [command, ...state.future] };
}

export function redoJournal(state: JournalState): JournalState {
  const command = state.future[0];
  if (!command) return state;
  return { ...state, current: command.after, past: [...state.past, command], future: state.future.slice(1) };
}

export function createCheckpoint(state: JournalState, checkpointId: string): JournalState {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(checkpointId)) throw new Error("Checkpoint id must be stable.");
  const checkpoint: Checkpoint = { checkpointId, sequence: state.sequence, project: state.current };
  return { ...state, checkpoints: [...state.checkpoints.filter((item) => item.checkpointId !== checkpointId), checkpoint] };
}

export function restoreCheckpoint(state: JournalState, checkpointId: string): JournalState {
  const checkpoint = state.checkpoints.find((item) => item.checkpointId === checkpointId);
  if (!checkpoint) throw new Error(`Checkpoint not found: ${checkpointId}`);
  return { ...state, current: checkpoint.project, sequence: checkpoint.sequence, past: [], future: [] };
}
