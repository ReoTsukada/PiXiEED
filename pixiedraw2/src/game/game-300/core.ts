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
export const GAME_RUNTIME_PROFILE_SCHEMA_VERSION = 1 as const;
export const GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION = 1 as const;

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
  | "INVALID_RUNTIME_PROFILE"
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

export interface GameCamera2DFollowSettings {
  readonly enabled: boolean;
  /** Game Entity/Editor Track id; it is intentionally not a raw object reference. */
  readonly targetId?: string;
  /** Seconds of follow damping. 0 means immediate follow. */
  readonly smoothing: number;
  readonly deadZoneX: number;
  readonly deadZoneY: number;
  readonly lookAheadX: number;
  readonly lookAheadY: number;
}

export interface GameCamera2DShakeSettings {
  /** Trigger this shake when the runtime reports a damage event. */
  readonly onDamage: boolean;
  readonly strength: number;
  readonly durationMs: number;
  readonly frequency: number;
}

/** Portable 2D camera settings shared by the editor and future runtimes. */
export interface GameCamera2DSettings {
  readonly schemaVersion: typeof GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION;
  readonly pixelPerfect: boolean;
  readonly referenceWidth: number;
  readonly referenceHeight: number;
  readonly pixelsPerUnit: number;
  readonly follow: GameCamera2DFollowSettings;
  readonly shake: GameCamera2DShakeSettings;
}

function stableCameraReference(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

/** Validate the optional camera extension without depending on GAME-350. */
export function isValidGameCamera2DSettings(
  value: unknown,
): value is GameCamera2DSettings {
  if (!isRecord(value)) return false;
  const follow = value.follow;
  const shake = value.shake;
  if (!isRecord(follow) || !isRecord(shake)) return false;
  return value.schemaVersion === GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION &&
    typeof value.pixelPerfect === "boolean" &&
    Number.isSafeInteger(value.referenceWidth) &&
    Number(value.referenceWidth) >= 1 && Number(value.referenceWidth) <= 8192 &&
    Number.isSafeInteger(value.referenceHeight) &&
    Number(value.referenceHeight) >= 1 && Number(value.referenceHeight) <= 8192 &&
    Number.isSafeInteger(value.pixelsPerUnit) &&
    Number(value.pixelsPerUnit) >= 1 && Number(value.pixelsPerUnit) <= 1024 &&
    typeof follow.enabled === "boolean" &&
    (follow.targetId === undefined || stableCameraReference(follow.targetId)) &&
    typeof follow.smoothing === "number" &&
    Number.isFinite(follow.smoothing) && follow.smoothing >= 0 &&
    follow.smoothing <= 2 &&
    ["deadZoneX", "deadZoneY"].every((key) =>
      typeof follow[key] === "number" && Number.isFinite(follow[key]) &&
      follow[key] >= 0 && follow[key] <= 64
    ) &&
    ["lookAheadX", "lookAheadY"].every((key) =>
      typeof follow[key] === "number" && Number.isFinite(follow[key]) &&
      follow[key] >= -64 && follow[key] <= 64
    ) &&
    typeof shake.onDamage === "boolean" &&
    typeof shake.strength === "number" && Number.isFinite(shake.strength) &&
    shake.strength >= 0 && shake.strength <= 64 &&
    typeof shake.durationMs === "number" &&
    Number.isSafeInteger(shake.durationMs) && shake.durationMs >= 0 &&
    shake.durationMs <= 10000 &&
    typeof shake.frequency === "number" && Number.isFinite(shake.frequency) &&
    shake.frequency >= 1 && shake.frequency <= 120;
}

const GAME_SCENE_RULES_KEYS = new Set([
  "schemaVersion",
  "runtimeFamily",
  "gravity",
  "horizontalMove",
  "verticalMove",
  "jump",
  "floorCollision",
  "cameraFollow",
  "mobileControls",
]);
const GAME_EVENT_CARD_KEYS = new Set([
  "eventId",
  "label",
  "enabled",
  "who",
  "condition",
  "sourceTrackId",
  "targetTrackId",
  "action",
  "message",
  "amount",
  "audioTrackId",
]);

export function isValidGameSceneRules(value: unknown): value is GameSceneRules {
  if (!isRecord(value)) return false;
  return Object.keys(value).every((key) => GAME_SCENE_RULES_KEYS.has(key)) &&
    value.schemaVersion === GAME_SCENE_RULES_SCHEMA_VERSION &&
    [
      "RPG_GRID",
      "ACTION_PLATFORM",
      "SCROLL_SIDE",
      "DODGE_ARENA",
      "FREE",
    ].includes(
      String(value.runtimeFamily),
    ) &&
    ["NONE", "WEAK", "STANDARD", "STRONG"].includes(String(value.gravity)) &&
    [
      "horizontalMove",
      "verticalMove",
      "jump",
      "floorCollision",
      "cameraFollow",
      "mobileControls",
    ].every((key) => typeof value[key] === "boolean");
}

export function isValidGameEventCard(value: unknown): value is GameEventCard {
  if (!isRecord(value)) return false;
  const validReference = (candidate: unknown): boolean =>
    candidate === undefined ||
    (typeof candidate === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(candidate));
  const validText = (candidate: unknown, max = 240): boolean =>
    candidate === undefined ||
    (typeof candidate === "string" && candidate.length <= max);
  return Object.keys(value).every((key) => GAME_EVENT_CARD_KEYS.has(key)) &&
    typeof value.eventId === "string" &&
    GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.eventId) &&
    typeof value.label === "string" && value.label.trim().length > 0 &&
    value.label.length <= 128 &&
    typeof value.enabled === "boolean" &&
    ["PLAYER", "TOUCHED_OBJECT", "ANYONE"].includes(String(value.who)) &&
    ["START", "ENTER_RANGE", "TOUCH", "TAP", "INTERACT", "REACH_GOAL"].includes(
      String(value.condition),
    ) &&
    validReference(value.sourceTrackId) && validReference(value.targetTrackId) &&
    [
      "SHOW_DIALOGUE",
      "DAMAGE",
      "SHAKE_CAMERA",
      "PLAY_AUDIO",
      "COMPLETE_SCENE",
      "SET_VARIABLE",
    ].includes(String(value.action)) &&
    validText(value.message) && validReference(value.audioTrackId) &&
    (value.amount === undefined ||
      (typeof value.amount === "number" && Number.isFinite(value.amount) &&
        value.amount >= 0 && value.amount <= 999999));
}

export interface CameraComponent {
  readonly type: "CAMERA";
  readonly componentId: ComponentId;
  readonly active: boolean;
  readonly zoom: number;
  /** Optional for legacy projects; present on new Game editor objects. */
  readonly camera2D?: GameCamera2DSettings;
}

/**
 * Beginner-facing Scene contract.  The editor presents these rules as a
 * template/runtime choice; engine-specific components remain internal.
 */
export const GAME_SCENE_RULES_SCHEMA_VERSION = 1 as const;
export type GameRuntimeFamily =
  | "RPG_GRID"
  | "ACTION_PLATFORM"
  | "SCROLL_SIDE"
  | "DODGE_ARENA"
  | "FREE";
export type GameSceneGravityPreset = "NONE" | "WEAK" | "STANDARD" | "STRONG";

export interface GameSceneRules {
  readonly schemaVersion: typeof GAME_SCENE_RULES_SCHEMA_VERSION;
  readonly runtimeFamily: GameRuntimeFamily;
  readonly gravity: GameSceneGravityPreset;
  readonly horizontalMove: boolean;
  readonly verticalMove: boolean;
  readonly jump: boolean;
  readonly floorCollision: boolean;
  readonly cameraFollow: boolean;
  readonly mobileControls: boolean;
}

export type GameEventWho = "PLAYER" | "TOUCHED_OBJECT" | "ANYONE";
export type GameEventCondition =
  | "START"
  | "ENTER_RANGE"
  | "TOUCH"
  | "TAP"
  | "INTERACT"
  | "REACH_GOAL";
export type GameEventAction =
  | "SHOW_DIALOGUE"
  | "DAMAGE"
  | "SHAKE_CAMERA"
  | "PLAY_AUDIO"
  | "COMPLETE_SCENE"
  | "SET_VARIABLE";

/**
 * Small, serializable event card.  It is the public authoring shape; the
 * canonical BehaviorIR remains the runtime representation underneath.
 */
export interface GameEventCard {
  readonly eventId: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly who: GameEventWho;
  readonly condition: GameEventCondition;
  readonly sourceTrackId?: string;
  readonly targetTrackId?: string;
  readonly action: GameEventAction;
  readonly message?: string;
  readonly amount?: number;
  readonly audioTrackId?: string;
}

export type GameColliderShape = "BOX" | "CIRCLE" | "CAPSULE";
export type GameCollisionLayer =
  | "DEFAULT"
  | "WORLD"
  | "PLAYER"
  | "NPC"
  | "SENSOR"
  | "PROJECTILE";
export type GameRigidbodyBodyType = "STATIC" | "DYNAMIC" | "KINEMATIC";

export const GAME_TILEMAP_DOCUMENT_SCHEMA_VERSION = 1 as const;
export type GameTilemapCellCollision = "NONE" | "SOLID";

/** Sparse, Game-owned map data. It contains placement/collision only, never source pixels. */
export interface GameTilemapCell {
  readonly x: number;
  readonly y: number;
  readonly collision: GameTilemapCellCollision;
  readonly triggerId?: string;
}

export interface GameTilemapDocument {
  readonly schemaVersion: typeof GAME_TILEMAP_DOCUMENT_SCHEMA_VERSION;
  readonly mapId: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly cells: readonly GameTilemapCell[];
}

export interface TilemapComponent {
  readonly type: "TILEMAP";
  readonly componentId: ComponentId;
  readonly mapId: string;
  readonly tileSize: number;
  readonly collisionEnabled: boolean;
  /** Optional canonical map authoring document; absent for legacy records. */
  readonly document?: GameTilemapDocument;
}

export interface ColliderComponent {
  readonly type: "COLLIDER";
  readonly componentId: ComponentId;
  readonly shape: GameColliderShape;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly isTrigger: boolean;
  readonly layer: GameCollisionLayer;
  readonly enabled: boolean;
}

export interface RigidbodyComponent {
  readonly type: "RIGIDBODY";
  readonly componentId: ComponentId;
  readonly bodyType: GameRigidbodyBodyType;
  readonly mass: number;
  readonly gravityScale: number;
  readonly fixedRotation: boolean;
  readonly enabled: boolean;
}

export interface CharacterControllerComponent {
  readonly type: "CHARACTER_CONTROLLER";
  readonly componentId: ComponentId;
  readonly moveSpeed: number;
  readonly stepHeight: number;
  readonly fixedStep: number;
  readonly enabled: boolean;
}

/** Editor-side component configuration persisted with the canonical timeline. */
export type GameObjectRole =
  | "PLAYER"
  | "NPC"
  | "PROP"
  | "TRIGGER"
  | "TILEMAP"
  | "CAMERA"
  | "AUDIO"
  | "CUSTOM";

export type GameComponentState =
  | TransformComponent
  | {
    readonly type: "SPRITE";
    readonly componentId: ComponentId;
    readonly visible: boolean;
  }
  | {
    readonly type: "AUDIO_SOURCE";
    readonly componentId: ComponentId;
    readonly loop: boolean;
    readonly volume: number;
  }
  | TilemapComponent
  | ColliderComponent
  | RigidbodyComponent
  | CharacterControllerComponent
  | CameraComponent
  | {
    readonly type: "BEHAVIOR";
    readonly componentId: ComponentId;
    readonly enabled: boolean;
  };

/**
 * Game-owned template data. Templates are optional authoring helpers, not a
 * genre lock: a project can use any combination of them or none at all.
 * Values deliberately stay scalar so they remain portable across the local
 * editor, Canonical Project, and future engine adapters.
 */
export type GameTemplateCategory =
  | "CORE"
  | "RPG"
  | "ACTION"
  | "SHOOTING"
  | "RACING"
  | "RHYTHM";
export type GameTemplateTarget = "SCENE_OBJECT" | "GAME_DATA";
export type GameTemplateKind =
  | "CHARACTER"
  | "WEAPON"
  | "ARMOR"
  | "SKILL"
  | "STATUS"
  | "TILE"
  | "DAMAGE"
  | "UI";
export type GameTemplateValue = string | number | boolean;

export interface GameTemplateInstance {
  readonly instanceId: string;
  readonly templateId: string;
  readonly category: GameTemplateCategory;
  readonly kind: GameTemplateKind;
  readonly target: GameTemplateTarget;
  readonly label: string;
  readonly values: Readonly<Record<string, GameTemplateValue>>;
  /** Scene object created by a template, or an optional Game-side attachment. */
  readonly targetTrackId?: string;
}

export const GAME_TEMPLATE_CATEGORIES: readonly GameTemplateCategory[] = [
  "CORE",
  "RPG",
  "ACTION",
  "SHOOTING",
  "RACING",
  "RHYTHM",
];
export const GAME_TEMPLATE_KINDS: readonly GameTemplateKind[] = [
  "CHARACTER",
  "WEAPON",
  "ARMOR",
  "SKILL",
  "STATUS",
  "TILE",
  "DAMAGE",
  "UI",
];

export type Component =
  | TransformComponent
  | SpriteComponent
  | AudioSourceComponent
  | BehaviorComponent
  | CameraComponent
  | TilemapComponent
  | ColliderComponent
  | RigidbodyComponent
  | CharacterControllerComponent;

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

export type BehaviorCondition =
  | { readonly kind: "ALWAYS" | "NEVER" }
  | {
    readonly kind: "VARIABLE_EQUALS" | "VARIABLE_NOT_EQUALS";
    readonly key?: string;
    readonly value?: string | number | boolean;
  }
  | {
    readonly kind: "HAS_COMPONENT" | "NOT_HAS_COMPONENT";
    readonly key?: string;
  }
  | { readonly kind: "NOT"; readonly condition: BehaviorCondition };

export interface BehaviorAction {
  readonly kind:
    | "SET_VARIABLE"
    | "ADD_VARIABLE"
    | "SET_COMPONENT_PROPERTY"
    | "PLAY_AUDIO"
    | "SPAWN_ENTITY";
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
  readonly role?: GameObjectRole;
  readonly components?: readonly GameComponentState[];
  readonly tilemap?: GameTilemapDocument;
}

export type GameAnimationLoopMode = "LOOP" | "ONCE" | "PING_PONG";

/**
 * Game-owned animation assignment.  It points at an iDRAW definition and
 * clip, but deliberately contains no raster data or editable Draw metadata.
 */
export interface GameAnimationBinding {
  readonly bindingId: string;
  readonly trackId: string;
  readonly assetDefinitionId: string;
  readonly clipKey: string;
  readonly motionName: string;
  readonly direction?: string;
  readonly frameIds: readonly string[];
  readonly fps: number;
  readonly loopMode: GameAnimationLoopMode;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly mode: AssetReferenceMode;
  readonly sourceAssetId?: string;
  readonly sourceRevisionId?: string;
  readonly sourceContentHash?: string;
}

/** Canonical runtime-family selection; the executable module remains a GAME-350 boundary. */
export interface GameRuntimeProfileReference {
  readonly schemaVersion: typeof GAME_RUNTIME_PROFILE_SCHEMA_VERSION;
  readonly profileId: string;
}

export interface GameEditorTimeline {
  readonly frameCount: number;
  readonly tracks: readonly GameTimelineTrack[];
  /** Selected beginner template family; absent in legacy projects. */
  readonly creationMode?:
    | "RPG_TEMPLATE"
    | "ACTION_2D"
    | "DODGE_2D"
    | "SCROLL_2D"
    | "BLANK";
  /** Scene-wide beginner rules; engine components are derived internally. */
  readonly sceneRules?: GameSceneRules;
  /** Beginner-facing event cards; canonical BehaviorIR is compiled beside them. */
  readonly eventCards?: readonly GameEventCard[];
  /** Optional Game-owned template instances; absent in legacy projects. */
  readonly templateInstances?: readonly GameTemplateInstance[];
  /** Optional Game-owned animation assignments; absent in legacy projects. */
  readonly animationBindings?: readonly GameAnimationBinding[];
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
  /** Optional for legacy projects; when present it is part of the Project hash. */
  readonly runtimeProfile?: GameRuntimeProfileReference;
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
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly kind: "RULE";
    readonly rule: BehaviorRule;
  }[];
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

export function asId<T extends string>(
  value: string,
  label: T,
): Brand<string, T> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) {
    throw new Error(`${label} must be a stable identifier.`);
  }
  return value as Brand<string, T>;
}

export const asProjectId = (value: string): ProjectId =>
  asId(value, "ProjectId");
export const asOwnerId = (value: string): OwnerId => asId(value, "OwnerId");
export const asSceneId = (value: string): SceneId => asId(value, "SceneId");
export const asEntityId = (value: string): EntityId => asId(value, "EntityId");
export const asComponentId = (value: string): ComponentId =>
  asId(value, "ComponentId");
export const asPrefabId = (value: string): PrefabId => asId(value, "PrefabId");
export const asBehaviorId = (value: string): BehaviorId =>
  asId(value, "BehaviorId");
export const asRevisionId = (value: string): RevisionId =>
  asId(value, "RevisionId");
export const asDependencyId = (value: string): DependencyId =>
  asId(value, "DependencyId");
export const asAssetId = (value: string): AssetId => asId(value, "AssetId");
export const asAssetRevisionId = (value: string): AssetRevisionId =>
  asId(value, "AssetRevisionId");
export const asSha256 = (value: string): Sha256 => {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("Sha256 must be lowercase hexadecimal SHA-256.");
  }
  return value as Sha256;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const GAME_TILEMAP_DOCUMENT_KEYS = new Set([
  "schemaVersion",
  "mapId",
  "width",
  "height",
  "tileSize",
  "cells",
]);
const GAME_TILEMAP_CELL_KEYS = new Set([
  "x",
  "y",
  "collision",
  "triggerId",
]);

/** Validate sparse map data before it enters a canonical Project or timeline. */
export function isValidGameTilemapDocument(
  value: unknown,
): value is GameTilemapDocument {
  if (!isRecord(value)) return false;
  const width = value.width;
  const height = value.height;
  const tileSize = value.tileSize;
  const cells = value.cells;
  if (
    Object.keys(value).some((key) => !GAME_TILEMAP_DOCUMENT_KEYS.has(key)) ||
    value.schemaVersion !== GAME_TILEMAP_DOCUMENT_SCHEMA_VERSION ||
    typeof value.mapId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.mapId) ||
    !Number.isSafeInteger(width) || typeof width !== "number" || width < 1 ||
    width > 256 ||
    !Number.isSafeInteger(height) || typeof height !== "number" || height < 1 ||
    height > 256 ||
    !Number.isSafeInteger(tileSize) || typeof tileSize !== "number" ||
    tileSize < 1 || tileSize > 4096 || !Array.isArray(cells) ||
    cells.length > width * height
  ) {
    return false;
  }
  const seen = new Set<string>();
  for (const rawCell of cells) {
    if (!isRecord(rawCell)) return false;
    const x = rawCell.x;
    const y = rawCell.y;
    const collision = rawCell.collision;
    const triggerId = rawCell.triggerId;
    if (
      Object.keys(rawCell).some((key) => !GAME_TILEMAP_CELL_KEYS.has(key)) ||
      !Number.isSafeInteger(x) || typeof x !== "number" || x < 0 ||
      x >= width ||
      !Number.isSafeInteger(y) || typeof y !== "number" || y < 0 ||
      y >= height ||
      (collision !== "NONE" && collision !== "SOLID") ||
      (triggerId !== undefined &&
        (typeof triggerId !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(triggerId))) ||
      (collision === "NONE" && triggerId === undefined)
    ) {
      return false;
    }
    const key = `${x},${y}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

const GAME_TEMPLATE_INSTANCE_KEYS = new Set([
  "instanceId",
  "templateId",
  "category",
  "kind",
  "target",
  "label",
  "values",
  "targetTrackId",
]);
const GAME_TEMPLATE_VALUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

/** Validate persisted Game-owned template data without loading a template catalog. */
export function isValidGameTemplateInstance(
  value: unknown,
): value is GameTemplateInstance {
  if (!isRecord(value)) return false;
  if (
    Object.keys(value).some((key) => !GAME_TEMPLATE_INSTANCE_KEYS.has(key)) ||
    typeof value.instanceId !== "string" ||
    !GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.instanceId) ||
    typeof value.templateId !== "string" ||
    !GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.templateId) ||
    !GAME_TEMPLATE_CATEGORIES.includes(
      value.category as GameTemplateCategory,
    ) ||
    !GAME_TEMPLATE_KINDS.includes(value.kind as GameTemplateKind) ||
    (value.target !== "SCENE_OBJECT" && value.target !== "GAME_DATA") ||
    typeof value.label !== "string" || value.label.trim().length === 0 ||
    !isRecord(value.values) ||
    (value.targetTrackId !== undefined &&
      (typeof value.targetTrackId !== "string" ||
        !GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.targetTrackId)))
  ) return false;
  if (value.target === "SCENE_OBJECT" && value.targetTrackId === undefined) {
    return false;
  }
  const templateValues = value.values;
  if (!isRecord(templateValues)) return false;
  return Object.keys(templateValues).every((key) => {
    if (!GAME_TEMPLATE_VALUE_KEY_PATTERN.test(key)) return false;
    const templateValue = templateValues[key];
    return (typeof templateValue === "string" ||
      typeof templateValue === "boolean" ||
      (typeof templateValue === "number" && Number.isFinite(templateValue)));
  });
}

const GAME_ANIMATION_BINDING_KEYS = new Set([
  "bindingId",
  "trackId",
  "assetDefinitionId",
  "clipKey",
  "motionName",
  "direction",
  "frameIds",
  "fps",
  "loopMode",
  "flipX",
  "flipY",
  "mode",
  "sourceAssetId",
  "sourceRevisionId",
  "sourceContentHash",
]);

/** Validate Game-side animation references without loading iDRAW. */
export function isValidGameAnimationBinding(
  value: unknown,
): value is GameAnimationBinding {
  if (!isRecord(value)) return false;
  const id = (candidate: unknown): candidate is string =>
    typeof candidate === "string" &&
    GAME_TEMPLATE_VALUE_KEY_PATTERN.test(candidate);
  const label = (candidate: unknown): candidate is string =>
    typeof candidate === "string" && candidate.trim().length > 0 &&
    candidate.length <= 128;
  return Object.keys(value).every((key) =>
    GAME_ANIMATION_BINDING_KEYS.has(key)
  ) &&
    id(value.bindingId) &&
    id(value.trackId) &&
    id(value.assetDefinitionId) &&
    label(value.clipKey) &&
    label(value.motionName) &&
    (value.direction === undefined || label(value.direction)) &&
    Array.isArray(value.frameIds) && value.frameIds.length > 0 &&
    value.frameIds.length <= 512 &&
    value.frameIds.every((frameId) => id(frameId)) &&
    typeof value.fps === "number" && Number.isFinite(value.fps) &&
    value.fps > 0 && value.fps <= 240 &&
    ["LOOP", "ONCE", "PING_PONG"].includes(String(value.loopMode)) &&
    typeof value.flipX === "boolean" && typeof value.flipY === "boolean" &&
    (value.mode === "LIVE" || value.mode === "PINNED") &&
    (value.sourceAssetId === undefined || id(value.sourceAssetId)) &&
    (value.sourceRevisionId === undefined || id(value.sourceRevisionId)) &&
    (value.sourceContentHash === undefined ||
      (typeof value.sourceContentHash === "string" &&
        /^[a-f0-9]{64}$/u.test(value.sourceContentHash)));
}

function diagnostic(
  code: DiagnosticCode,
  path: string,
  message: string,
): Diagnostic {
  return { code, path, message, recoverable: true };
}

function duplicateDiagnostics(
  values: readonly string[],
  path: string,
): Diagnostic[] {
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      diagnostics.push(
        diagnostic("DUPLICATE_ID", path, `Duplicate id: ${value}`),
      );
    }
    seen.add(value);
  }
  return diagnostics;
}

function validateCaller(
  project: Pick<GameProject, "projectId" | "ownerId" | "revision">,
  caller: CallerContext,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (
    project.projectId !== caller.projectId ||
    project.revision.projectId !== caller.projectId
  ) {
    diagnostics.push(
      diagnostic(
        "PROJECT_ID_MISMATCH",
        "projectId",
        "Caller project identity does not match the project revision.",
      ),
    );
  }
  if (
    project.ownerId !== caller.ownerId ||
    project.revision.ownerId !== caller.ownerId
  ) {
    diagnostics.push(
      diagnostic(
        "CALLER_OWNER_MISMATCH",
        "ownerId",
        "Caller owner is not the project/revision owner.",
      ),
    );
  }
  if (project.revision.revisionId !== caller.revisionId) {
    diagnostics.push(
      diagnostic(
        "CALLER_REVISION_MISMATCH",
        "revision.revisionId",
        "Caller revision is not the current project revision.",
      ),
    );
  }
  return diagnostics;
}

function validateAssetReference(
  reference: unknown,
  path: string,
  ownerId: OwnerId,
  diagnostics: Diagnostic[],
): void {
  if (
    !isRecord(reference) || !["DRAW", "AUDIO"].includes(String(reference.kind))
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_REFERENCE",
        path,
        "Asset reference must declare DRAW or AUDIO.",
      ),
    );
    return;
  }
  if (reference.ownerId !== ownerId) {
    diagnostics.push(
      diagnostic(
        "INVALID_REFERENCE",
        `${path}.ownerId`,
        "Asset owner must match the Game Project owner.",
      ),
    );
  }
  for (
    const key of ["assetId", "revisionId", "ownerId", "contentHash", "mode"]
  ) {
    if (typeof reference[key] !== "string") {
      diagnostics.push(
        diagnostic(
          "INVALID_REFERENCE",
          `${path}.${key}`,
          "Asset revision reference field is invalid.",
        ),
      );
    }
  }
  if (
    typeof reference.contentHash === "string" &&
    !/^[a-f0-9]{64}$/u.test(reference.contentHash)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_REFERENCE",
        `${path}.contentHash`,
        "Asset content hash must be lowercase SHA-256.",
      ),
    );
  }
}

function validateComponent(
  component: unknown,
  path: string,
  ownerId: OwnerId,
  knownBehaviorIds: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  if (
    !isRecord(component) || typeof component.type !== "string" ||
    typeof component.componentId !== "string"
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMPONENT",
        path,
        "Component shape or type is unsupported.",
      ),
    );
    return;
  }
  if (
    ![
      "TRANSFORM",
      "SPRITE",
      "AUDIO_SOURCE",
      "BEHAVIOR",
      "CAMERA",
      "TILEMAP",
      "COLLIDER",
      "RIGIDBODY",
      "CHARACTER_CONTROLLER",
    ].includes(component.type)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMPONENT",
        path,
        `Unknown component type: ${component.type}`,
      ),
    );
    return;
  }
  if (
    typeof component.componentId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.componentId)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMPONENT",
        `${path}.componentId`,
        "Component id is invalid.",
      ),
    );
  }
  if (
    component.type === "TRANSFORM" &&
    !["x", "y", "rotation", "scaleX", "scaleY"].every((key) =>
      typeof component[key] === "number" && Number.isFinite(component[key])
    )
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMPONENT",
        path,
        "Transform component contains a non-finite value.",
      ),
    );
  }
  if (component.type === "SPRITE") {
    validateAssetReference(
      component.asset,
      `${path}.asset`,
      ownerId,
      diagnostics,
    );
  }
  if (component.type === "AUDIO_SOURCE") {
    validateAssetReference(
      component.asset,
      `${path}.asset`,
      ownerId,
      diagnostics,
    );
    if (!isRecord(component.asset) || component.asset.kind !== "AUDIO") {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.asset`,
          "Audio Source requires an AUDIO asset revision.",
        ),
      );
    }
    if (
      typeof component.volume !== "number" ||
      !Number.isFinite(component.volume) || component.volume < 0 ||
      component.volume > 1
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.volume`,
          "Audio volume must be between 0 and 1.",
        ),
      );
    }
  }
  if (
    component.type === "BEHAVIOR" &&
    (typeof component.behaviorId !== "string" ||
      !knownBehaviorIds.has(component.behaviorId))
  ) {
    diagnostics.push(
      diagnostic(
        "MISSING_REFERENCE",
        `${path}.behaviorId`,
        "Behavior component references an unknown behavior.",
      ),
    );
  }
  if (
    component.type === "CAMERA" &&
    (typeof component.zoom !== "number" || !Number.isFinite(component.zoom) ||
      component.zoom <= 0)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMPONENT",
        `${path}.zoom`,
        "Camera zoom must be a positive finite number.",
      ),
    );
  }
  if (
    component.type === "CAMERA" && component.camera2D !== undefined &&
    !isValidGameCamera2DSettings(component.camera2D)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMPONENT",
        `${path}.camera2D`,
        "Camera 2D settings are invalid.",
      ),
    );
  }
  if (component.type === "TILEMAP") {
    if (
      typeof component.mapId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.mapId)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.mapId`,
          "Tilemap map id is invalid.",
        ),
      );
    }
    if (
      typeof component.tileSize !== "number" ||
      !Number.isSafeInteger(component.tileSize) || component.tileSize < 1
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.tileSize`,
          "Tilemap tile size must be a positive integer.",
        ),
      );
    }
    if (typeof component.collisionEnabled !== "boolean") {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.collisionEnabled`,
          "Tilemap collisionEnabled must be boolean.",
        ),
      );
    }
    if (
      component.document !== undefined &&
      !isValidGameTilemapDocument(component.document)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.document`,
          "Tilemap document is invalid.",
        ),
      );
    }
  }
  if (component.type === "COLLIDER") {
    if (!["BOX", "CIRCLE", "CAPSULE"].includes(component.shape as string)) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.shape`,
          "Collider shape is unsupported.",
        ),
      );
    }
    for (const key of ["width", "height", "radius"]) {
      if (
        typeof component[key] !== "number" ||
        !Number.isFinite(component[key]) || component[key] <= 0
      ) {
        diagnostics.push(
          diagnostic(
            "INVALID_COMPONENT",
            `${path}.${key}`,
            "Collider dimensions must be positive finite numbers.",
          ),
        );
      }
    }
    if (typeof component.isTrigger !== "boolean") {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.isTrigger`,
          "Collider isTrigger must be boolean.",
        ),
      );
    }
    if (
      !["DEFAULT", "WORLD", "PLAYER", "NPC", "SENSOR", "PROJECTILE"].includes(
        component.layer as string,
      )
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.layer`,
          "Collider layer is unsupported.",
        ),
      );
    }
    if (typeof component.enabled !== "boolean") {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.enabled`,
          "Collider enabled must be boolean.",
        ),
      );
    }
  }
  if (component.type === "RIGIDBODY") {
    if (
      !["STATIC", "DYNAMIC", "KINEMATIC"].includes(component.bodyType as string)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.bodyType`,
          "Rigidbody body type is unsupported.",
        ),
      );
    }
    if (
      typeof component.mass !== "number" || !Number.isFinite(component.mass) ||
      component.mass <= 0
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.mass`,
          "Rigidbody mass must be positive.",
        ),
      );
    }
    if (
      typeof component.gravityScale !== "number" ||
      !Number.isFinite(component.gravityScale)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.gravityScale`,
          "Rigidbody gravity scale must be finite.",
        ),
      );
    }
    if (
      typeof component.fixedRotation !== "boolean" ||
      typeof component.enabled !== "boolean"
    ) {
      diagnostics.push(
        diagnostic("INVALID_COMPONENT", path, "Rigidbody flags are invalid."),
      );
    }
  }
  if (component.type === "CHARACTER_CONTROLLER") {
    if (
      typeof component.moveSpeed !== "number" ||
      !Number.isFinite(component.moveSpeed) || component.moveSpeed <= 0
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.moveSpeed`,
          "Character Controller move speed must be positive.",
        ),
      );
    }
    if (
      typeof component.stepHeight !== "number" ||
      !Number.isFinite(component.stepHeight) || component.stepHeight < 0
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.stepHeight`,
          "Character Controller step height must be non-negative.",
        ),
      );
    }
    if (
      typeof component.fixedStep !== "number" ||
      !Number.isSafeInteger(component.fixedStep) || component.fixedStep < 1
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.fixedStep`,
          "Character Controller fixed step must be a positive integer.",
        ),
      );
    }
    if (typeof component.enabled !== "boolean") {
      diagnostics.push(
        diagnostic(
          "INVALID_COMPONENT",
          `${path}.enabled`,
          "Character Controller enabled must be boolean.",
        ),
      );
    }
  }
}

function validateGameComponentState(
  component: unknown,
  path: string,
  diagnostics: Diagnostic[],
): void {
  if (
    !isRecord(component) || typeof component.type !== "string" ||
    typeof component.componentId !== "string"
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        path,
        "Game editor component state is invalid.",
      ),
    );
    return;
  }
  if (
    ![
      "TRANSFORM",
      "SPRITE",
      "AUDIO_SOURCE",
      "BEHAVIOR",
      "CAMERA",
      "TILEMAP",
      "COLLIDER",
      "RIGIDBODY",
      "CHARACTER_CONTROLLER",
    ].includes(component.type)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        `${path}.type`,
        `Unknown Game editor component state: ${component.type}`,
      ),
    );
    return;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.componentId)) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        `${path}.componentId`,
        "Game editor component id is invalid.",
      ),
    );
  }
  if (
    component.type === "TRANSFORM" &&
    !["x", "y", "rotation", "scaleX", "scaleY"].every((key) =>
      typeof component[key] === "number" && Number.isFinite(component[key])
    )
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        path,
        "Game editor Transform state contains a non-finite value.",
      ),
    );
  }
  if (component.type === "SPRITE" && typeof component.visible !== "boolean") {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        path,
        "Game editor Sprite state requires visible.",
      ),
    );
  }
  if (component.type === "BEHAVIOR" && typeof component.enabled !== "boolean") {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        path,
        "Game editor Behavior state requires enabled.",
      ),
    );
  }
  if (
    component.type === "AUDIO_SOURCE" &&
    (typeof component.loop !== "boolean" ||
      typeof component.volume !== "number" ||
      !Number.isFinite(component.volume) || component.volume < 0 ||
      component.volume > 1)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        path,
        "Game editor Audio Source state is invalid.",
      ),
    );
  }
  if (
    component.type === "CAMERA" &&
    (typeof component.active !== "boolean" ||
      typeof component.zoom !== "number" || !Number.isFinite(component.zoom) ||
      component.zoom <= 0)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        path,
        "Game editor Camera state is invalid.",
      ),
    );
  }
  if (
    component.type === "CAMERA" && component.camera2D !== undefined &&
    !isValidGameCamera2DSettings(component.camera2D)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        `${path}.camera2D`,
        "Game editor Camera 2D settings are invalid.",
      ),
    );
  }
  if (
    component.type === "TILEMAP" &&
    (typeof component.mapId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.mapId) ||
      typeof component.tileSize !== "number" ||
      !Number.isSafeInteger(component.tileSize) || component.tileSize < 1 ||
      typeof component.collisionEnabled !== "boolean" ||
      (component.document !== undefined &&
        !isValidGameTilemapDocument(component.document)))
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        path,
        "Game editor Tilemap state is invalid.",
      ),
    );
  }
  if (component.type === "COLLIDER") {
    if (
      !["BOX", "CIRCLE", "CAPSULE"].includes(component.shape as string) ||
      ["width", "height", "radius"].some((key) =>
        typeof component[key] !== "number" ||
        !Number.isFinite(component[key]) || component[key] <= 0
      ) || typeof component.isTrigger !== "boolean" ||
      !["DEFAULT", "WORLD", "PLAYER", "NPC", "SENSOR", "PROJECTILE"].includes(
        component.layer as string,
      ) || typeof component.enabled !== "boolean"
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_PROJECT",
          path,
          "Game editor Collider state is invalid.",
        ),
      );
    }
  }
  if (
    component.type === "RIGIDBODY" &&
    (!["STATIC", "DYNAMIC", "KINEMATIC"].includes(
      component.bodyType as string,
    ) || typeof component.mass !== "number" ||
      !Number.isFinite(component.mass) || component.mass <= 0 ||
      typeof component.gravityScale !== "number" ||
      !Number.isFinite(component.gravityScale) ||
      typeof component.fixedRotation !== "boolean" ||
      typeof component.enabled !== "boolean")
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        path,
        "Game editor Rigidbody state is invalid.",
      ),
    );
  }
  if (
    component.type === "CHARACTER_CONTROLLER" &&
    (typeof component.moveSpeed !== "number" ||
      !Number.isFinite(component.moveSpeed) || component.moveSpeed <= 0 ||
      typeof component.stepHeight !== "number" ||
      !Number.isFinite(component.stepHeight) || component.stepHeight < 0 ||
      typeof component.fixedStep !== "number" ||
      !Number.isSafeInteger(component.fixedStep) || component.fixedStep < 1 ||
      typeof component.enabled !== "boolean")
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        path,
        "Game editor Character Controller state is invalid.",
      ),
    );
  }
}

function validateDependencyCycles(
  dependencies: readonly Dependency[],
  diagnostics: Diagnostic[],
): void {
  const byId = new Map<string, Dependency>(
    dependencies.map((
      dependency,
    ) => [String(dependency.dependencyId), dependency]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string): void => {
    if (visiting.has(id)) {
      diagnostics.push(
        diagnostic(
          "DEPENDENCY_CYCLE",
          path,
          `Dependency cycle includes ${id}.`,
        ),
      );
      return;
    }
    if (visited.has(id)) return;
    const dependency = byId.get(id);
    if (!dependency) {
      diagnostics.push(
        diagnostic("MISSING_REFERENCE", path, `Dependency ${id} is missing.`),
      );
      return;
    }
    visiting.add(id);
    for (const target of dependency.dependsOn) {
      visit(target, `${path}.dependsOn`);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const dependency of dependencies) {
    visit(dependency.dependencyId, "dependencies");
  }
}

export function validateGameProject(
  value: unknown,
  caller?: CallerContext,
): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [
        diagnostic(
          "INVALID_PROJECT",
          "project",
          "Game Project must be an object.",
        ),
      ],
    };
  }
  if (value.schemaVersion !== GAME_PROJECT_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        "UNKNOWN_SCHEMA",
        "schemaVersion",
        "Unsupported Game Project schema version.",
      ),
    );
  }
  if (
    typeof value.projectId !== "string" || typeof value.ownerId !== "string" ||
    typeof value.name !== "string" || !isRecord(value.revision)
  ) {
    return {
      valid: false,
      diagnostics: [
        ...diagnostics,
        diagnostic(
          "INVALID_PROJECT",
          "project",
          "Required Game Project identity is missing.",
        ),
      ],
    };
  }
  const project = value as unknown as GameProject;
  if (caller) diagnostics.push(...validateCaller(project, caller));
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.projectId) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.ownerId)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        "projectId/ownerId",
        "Project and owner ids must be stable identifiers.",
      ),
    );
  }
  if (!project.name.trim()) {
    diagnostics.push(
      diagnostic("INVALID_PROJECT", "name", "Project name is required."),
    );
  }
  if (
    project.revision.projectId !== project.projectId ||
    project.revision.ownerId !== project.ownerId ||
    !Number.isSafeInteger(project.revision.sequence) ||
    project.revision.sequence < 1
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_REVISION",
        "revision",
        "Revision is not bound to the project owner or sequence.",
      ),
    );
  }
  if (
    !Array.isArray(project.scenes) || !Array.isArray(project.prefabs) ||
    !Array.isArray(project.dependencies) || !Array.isArray(project.behaviors)
  ) {
    return {
      valid: false,
      diagnostics: [
        ...diagnostics,
        diagnostic(
          "INVALID_PROJECT",
          "project",
          "Project collections are invalid.",
        ),
      ],
    };
  }
  if (project.runtimeProfile !== undefined) {
    if (
      !isRecord(project.runtimeProfile) ||
      project.runtimeProfile.schemaVersion !==
        GAME_RUNTIME_PROFILE_SCHEMA_VERSION ||
      typeof project.runtimeProfile.profileId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(
        project.runtimeProfile.profileId,
      )
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_RUNTIME_PROFILE",
          "runtimeProfile",
          "Runtime profile reference is invalid.",
        ),
      );
    }
  }

  diagnostics.push(
    ...duplicateDiagnostics(
      project.scenes.map((scene) => String(scene.sceneId)),
      "scenes.sceneId",
    ),
  );
  diagnostics.push(
    ...duplicateDiagnostics(
      project.prefabs.map((prefab) => String(prefab.prefabId)),
      "prefabs.prefabId",
    ),
  );
  diagnostics.push(
    ...duplicateDiagnostics(
      project.dependencies.map((dependency) => String(dependency.dependencyId)),
      "dependencies.dependencyId",
    ),
  );
  diagnostics.push(
    ...duplicateDiagnostics(
      project.behaviors.map((behavior) => String(behavior.behaviorId)),
      "behaviors.behaviorId",
    ),
  );
  const behaviorIds = new Set(
    project.behaviors.map((behavior) => String(behavior.behaviorId)),
  );
  const allEntityIds: string[] = [];
  const allComponentIds: string[] = [];
  for (const [sceneIndex, scene] of project.scenes.entries()) {
    if (
      !isRecord(scene) || typeof scene.sceneId !== "string" ||
      !Array.isArray(scene.entities) || !Array.isArray(scene.rootEntityIds)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_PROJECT",
          `scenes[${sceneIndex}]`,
          "Scene shape is invalid.",
        ),
      );
      continue;
    }
    const sceneEntityIds = new Set(
      scene.entities.map((entity) => String(entity.entityId)),
    );
    for (const rootId of scene.rootEntityIds) {
      if (!sceneEntityIds.has(String(rootId))) {
        diagnostics.push(
          diagnostic(
            "MISSING_REFERENCE",
            `scenes[${sceneIndex}].rootEntityIds`,
            `Root Entity ${String(rootId)} is missing.`,
          ),
        );
      }
    }
    diagnostics.push(
      ...duplicateDiagnostics(
        scene.entities.map((entity) => String(entity.entityId)),
        `scenes[${sceneIndex}].entities.entityId`,
      ),
    );
    for (const [entityIndex, entity] of scene.entities.entries()) {
      if (
        !isRecord(entity) || typeof entity.entityId !== "string" ||
        !Array.isArray(entity.components)
      ) {
        diagnostics.push(
          diagnostic(
            "INVALID_PROJECT",
            `scenes[${sceneIndex}].entities[${entityIndex}]`,
            "Entity shape is invalid.",
          ),
        );
        continue;
      }
      allEntityIds.push(entity.entityId);
      if (
        entity.parentEntityId !== undefined &&
        !sceneEntityIds.has(String(entity.parentEntityId))
      ) {
        diagnostics.push(
          diagnostic(
            "MISSING_REFERENCE",
            `scenes[${sceneIndex}].entities[${entityIndex}].parentEntityId`,
            "Parent Entity is missing.",
          ),
        );
      }
      diagnostics.push(
        ...duplicateDiagnostics(
          entity.components.map((component) =>
            String(isRecord(component) ? component.componentId : "<invalid>")
          ),
          `scenes[${sceneIndex}].entities[${entityIndex}].components.componentId`,
        ),
      );
      for (const [componentIndex, component] of entity.components.entries()) {
        if (isRecord(component) && typeof component.componentId === "string") {
          allComponentIds.push(component.componentId);
        }
        validateComponent(
          component,
          `scenes[${sceneIndex}].entities[${entityIndex}].components[${componentIndex}]`,
          project.ownerId,
          behaviorIds,
          diagnostics,
        );
      }
    }
    for (const entity of scene.entities) {
      const seen = new Set<string>();
      let parentId = entity.parentEntityId;
      while (parentId !== undefined) {
        if (seen.has(String(parentId)) || parentId === entity.entityId) {
          diagnostics.push(
            diagnostic(
              "DEPENDENCY_CYCLE",
              `scenes[${sceneIndex}].entities`,
              `Entity parent cycle includes ${String(entity.entityId)}.`,
            ),
          );
          break;
        }
        seen.add(String(parentId));
        parentId = scene.entities.find((candidate) =>
          candidate.entityId === parentId
        )?.parentEntityId;
      }
    }
  }
  diagnostics.push(
    ...duplicateDiagnostics(allEntityIds, "project.entities.entityId"),
  );
  diagnostics.push(
    ...duplicateDiagnostics(allComponentIds, "project.components.componentId"),
  );
  for (const dependency of project.dependencies) {
    if (
      !isRecord(dependency) || typeof dependency.dependencyId !== "string" ||
      !Array.isArray(dependency.dependsOn)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_PROJECT",
          "dependencies",
          "Dependency shape is invalid.",
        ),
      );
    } else if (
      dependency.ownerId !== project.ownerId ||
      dependency.ownerRevisionId !== project.revision.revisionId
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_REFERENCE",
          `dependencies.${dependency.dependencyId}`,
          "Dependency owner/revision is not the current project revision.",
        ),
      );
    }
  }
  validateDependencyCycles(project.dependencies, diagnostics);
  for (const behavior of project.behaviors) {
    if (
      behavior.version !== BEHAVIOR_IR_VERSION ||
      behavior.ownership !== "CANONICAL_IR" || !Array.isArray(behavior.rules)
    ) {
      diagnostics.push(
        diagnostic(
          "UNKNOWN_SCHEMA",
          `behaviors.${String(behavior.behaviorId)}`,
          "Behavior IR schema is unsupported.",
        ),
      );
    }
  }
  if (project.editorTimeline !== undefined) {
    const timeline = project.editorTimeline;
    if (!Number.isSafeInteger(timeline.frameCount) || timeline.frameCount < 1) {
      diagnostics.push(
        diagnostic(
          "INVALID_PROJECT",
          "editorTimeline.frameCount",
          "Editor timeline frame count must be a positive integer.",
        ),
      );
    }
    if (!Array.isArray(timeline.tracks)) {
      diagnostics.push(
        diagnostic(
          "INVALID_PROJECT",
          "editorTimeline.tracks",
          "Editor timeline tracks must be an array.",
        ),
      );
    } else {
      diagnostics.push(
        ...duplicateDiagnostics(
          timeline.tracks.map((track) => track.trackId),
          "editorTimeline.tracks.trackId",
        ),
      );
      for (const [index, track] of timeline.tracks.entries()) {
        if (
          !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(track.trackId) ||
          track.label.trim().length === 0 || track.kind.trim().length === 0
        ) {
          diagnostics.push(
            diagnostic(
              "INVALID_PROJECT",
              `editorTimeline.tracks[${index}]`,
              "Editor timeline track identity is invalid.",
            ),
          );
        }
        if (
          !Array.isArray(track.activeFrames) ||
          track.activeFrames.some((frame: number) =>
            !Number.isSafeInteger(frame) || frame < 0 ||
            frame >= timeline.frameCount
          )
        ) {
          diagnostics.push(
            diagnostic(
              "INVALID_PROJECT",
              `editorTimeline.tracks[${index}].activeFrames`,
              "Editor timeline frames must be in range.",
            ),
          );
        } else if (
          new Set(track.activeFrames).size !== track.activeFrames.length
        ) {
          diagnostics.push(
            diagnostic(
              "DUPLICATE_ID",
              `editorTimeline.tracks[${index}].activeFrames`,
              "Editor timeline frames must be unique.",
            ),
          );
        }
        if (
          track.role !== undefined &&
          ![
            "PLAYER",
            "NPC",
            "PROP",
            "TRIGGER",
            "TILEMAP",
            "CAMERA",
            "AUDIO",
            "CUSTOM",
          ].includes(track.role)
        ) {
          diagnostics.push(
            diagnostic(
              "INVALID_PROJECT",
              `editorTimeline.tracks[${index}].role`,
              "Game object role is unsupported.",
            ),
          );
        }
        if (track.components !== undefined) {
          if (!Array.isArray(track.components)) {
            diagnostics.push(
              diagnostic(
                "INVALID_PROJECT",
                `editorTimeline.tracks[${index}].components`,
                "Game editor components must be an array.",
              ),
            );
          } else {
            diagnostics.push(
              ...duplicateDiagnostics(
                track.components.map((component: GameComponentState) =>
                  String(component.componentId)
                ),
                `editorTimeline.tracks[${index}].components.componentId`,
              ),
            );
            for (
              const [componentIndex, component] of track.components.entries()
            ) {
              validateGameComponentState(
                component,
                `editorTimeline.tracks[${index}].components[${componentIndex}]`,
                diagnostics,
              );
            }
          }
        }
        if (
          track.tilemap !== undefined &&
          !isValidGameTilemapDocument(track.tilemap)
        ) {
          diagnostics.push(
            diagnostic(
              "INVALID_PROJECT",
              `editorTimeline.tracks[${index}].tilemap`,
              "Editor tilemap document is invalid.",
            ),
          );
        }
      }
    }
    if (
      timeline.sceneRules !== undefined &&
      !isValidGameSceneRules(timeline.sceneRules)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_PROJECT",
          "editorTimeline.sceneRules",
          "Scene-wide Game rules are invalid.",
        ),
      );
    }
    if (
      timeline.creationMode !== undefined &&
      ![
        "RPG_TEMPLATE",
        "ACTION_2D",
        "DODGE_2D",
        "SCROLL_2D",
        "BLANK",
      ].includes(
        timeline.creationMode,
      )
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_PROJECT",
          "editorTimeline.creationMode",
          "Game creation mode is unsupported.",
        ),
      );
    }
    if (timeline.eventCards !== undefined) {
      if (
        !Array.isArray(timeline.eventCards) ||
        timeline.eventCards.some((card) => !isValidGameEventCard(card))
      ) {
        diagnostics.push(
          diagnostic(
            "INVALID_PROJECT",
            "editorTimeline.eventCards",
            "Game event cards are invalid.",
          ),
        );
      } else {
        diagnostics.push(
          ...duplicateDiagnostics(
            timeline.eventCards.map((card) => card.eventId),
            "editorTimeline.eventCards.eventId",
          ),
        );
        const trackIds = new Set(
          Array.isArray(timeline.tracks)
            ? timeline.tracks.map((track) => track.trackId)
            : [],
        );
        for (const [index, card] of timeline.eventCards.entries()) {
          for (const [key, trackId] of [
            ["sourceTrackId", card.sourceTrackId],
            ["targetTrackId", card.targetTrackId],
            ["audioTrackId", card.audioTrackId],
          ] as const) {
            if (trackId !== undefined && !trackIds.has(trackId)) {
              diagnostics.push(
                diagnostic(
                  "MISSING_REFERENCE",
                  `editorTimeline.eventCards[${index}].${key}`,
                  "Game event card track reference is missing.",
                ),
              );
            }
          }
        }
      }
    }
    if (timeline.templateInstances !== undefined) {
      if (
        !Array.isArray(timeline.templateInstances) ||
        timeline.templateInstances.some((instance) =>
          !isValidGameTemplateInstance(instance)
        )
      ) {
        diagnostics.push(
          diagnostic(
            "INVALID_PROJECT",
            "editorTimeline.templateInstances",
            "Game template instances are invalid.",
          ),
        );
      } else {
        diagnostics.push(
          ...duplicateDiagnostics(
            timeline.templateInstances.map((instance) => instance.instanceId),
            "editorTimeline.templateInstances.instanceId",
          ),
        );
        const trackIds = new Set(
          Array.isArray(timeline.tracks)
            ? timeline.tracks.map((track) => track.trackId)
            : [],
        );
        for (const [index, instance] of timeline.templateInstances.entries()) {
          if (
            instance.targetTrackId !== undefined &&
            !trackIds.has(instance.targetTrackId)
          ) {
            diagnostics.push(
              diagnostic(
                "MISSING_REFERENCE",
                `editorTimeline.templateInstances[${index}].targetTrackId`,
                "Game template target track is missing.",
              ),
            );
          }
        }
      }
    }
    if (timeline.animationBindings !== undefined) {
      if (
        !Array.isArray(timeline.animationBindings) ||
        timeline.animationBindings.some((binding) =>
          !isValidGameAnimationBinding(binding)
        )
      ) {
        diagnostics.push(
          diagnostic(
            "INVALID_PROJECT",
            "editorTimeline.animationBindings",
            "Game animation bindings are invalid.",
          ),
        );
      } else {
        diagnostics.push(
          ...duplicateDiagnostics(
            timeline.animationBindings.map((binding) => binding.bindingId),
            "editorTimeline.animationBindings.bindingId",
          ),
        );
        const trackIds = new Set(
          Array.isArray(timeline.tracks)
            ? timeline.tracks.map((track) => track.trackId)
            : [],
        );
        const keys = new Set<string>();
        for (const [index, binding] of timeline.animationBindings.entries()) {
          if (!trackIds.has(binding.trackId)) {
            diagnostics.push(
              diagnostic(
                "MISSING_REFERENCE",
                `editorTimeline.animationBindings[${index}].trackId`,
                "Game animation target track is missing.",
              ),
            );
          }
          const key =
            `${binding.trackId}\u0000${binding.assetDefinitionId}\u0000${binding.clipKey}`;
          if (keys.has(key)) {
            diagnostics.push(
              diagnostic(
                "DUPLICATE_ID",
                `editorTimeline.animationBindings[${index}]`,
                "A Game animation clip can only be assigned once per object.",
              ),
            );
          }
          keys.add(key);
        }
      }
    }
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function sortById<T extends Record<string, unknown>>(
  items: readonly T[],
  key: keyof T,
): T[] {
  return [...items].sort((left, right) =>
    String(left[key]).localeCompare(String(right[key]), "en", {
      numeric: false,
    })
  );
}

function canonicalProjectPayload(
  project: GameProject | GameProjectDraft,
): unknown {
  const revision = { ...project.revision } as Record<string, unknown>;
  delete revision.snapshotHash;
  return {
    schemaVersion: project.schemaVersion,
    projectId: project.projectId,
    ownerId: project.ownerId,
    name: project.name,
    revision,
    scenes: sortById(
      project.scenes as unknown as Record<string, unknown>[],
      "sceneId",
    ).map((scene) => ({
      ...scene,
      entities: sortById(
        scene.entities as Record<string, unknown>[],
        "entityId",
      ).map((entity) => ({
        ...entity,
        components: sortById(
          entity.components as Record<string, unknown>[],
          "componentId",
        ),
      })),
    })),
    prefabs: sortById(
      project.prefabs as unknown as Record<string, unknown>[],
      "prefabId",
    ),
    dependencies: sortById(
      project.dependencies as unknown as Record<string, unknown>[],
      "dependencyId",
    ).map((dependency) => ({
      ...dependency,
      dependsOn: [...(dependency.dependsOn as string[])].sort(),
    })),
    behaviors: sortById(
      project.behaviors as unknown as Record<string, unknown>[],
      "behaviorId",
    ).map((behavior) => ({
      ...behavior,
      rules: sortById(behavior.rules as Record<string, unknown>[], "ruleId"),
    })),
    ...(project.runtimeProfile === undefined
      ? {}
      : { runtimeProfile: project.runtimeProfile }),
    ...(project.editorTimeline === undefined ? {} : {
      editorTimeline: {
        frameCount: project.editorTimeline.frameCount,
        tracks: sortById(
          project.editorTimeline.tracks as unknown as Record<string, unknown>[],
          "trackId",
        ).map((track) => ({
          ...track,
          activeFrames: [...(track.activeFrames as number[])].sort((
            left,
            right,
          ) => left - right),
        })),
        ...(project.editorTimeline.creationMode === undefined ? {} : {
          creationMode: project.editorTimeline.creationMode,
        }),
        ...(project.editorTimeline.sceneRules === undefined ? {} : {
          sceneRules: project.editorTimeline.sceneRules,
        }),
        ...(project.editorTimeline.eventCards === undefined ? {} : {
          eventCards: sortById(
            project.editorTimeline.eventCards as unknown as Record<
              string,
              unknown
            >[],
            "eventId",
          ),
        }),
        ...(project.editorTimeline.templateInstances === undefined ? {} : {
          templateInstances: sortById(
            project.editorTimeline.templateInstances as unknown as Record<
              string,
              unknown
            >[],
            "instanceId",
          ),
        }),
        ...(project.editorTimeline.animationBindings === undefined ? {} : {
          animationBindings: sortById(
            project.editorTimeline.animationBindings as unknown as Record<
              string,
              unknown
            >[],
            "bindingId",
          ).map((binding) => ({
            ...binding,
            frameIds: [...(binding.frameIds as string[])],
          })),
        }),
      },
    }),
  };
}

export function canonicalJson(value: unknown): string {
  if (
    value === null || typeof value === "boolean" || typeof value === "number" ||
    typeof value === "string"
  ) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonicalJson(value[key])}`
      ).join(",")
    }}`;
  }
  throw new Error("Unsupported canonical value.");
}

export async function sha256(value: unknown): Promise<Sha256> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return asSha256(
    [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  );
}

export async function createGameProject(
  draft: GameProjectDraft,
  caller: CallerContext,
): Promise<GameProject> {
  const validation = validateGameProject(draft, caller);
  if (!validation.valid) {
    throw new Error(
      validation.diagnostics.map((item) => `${item.code}:${item.path}`).join(
        "; ",
      ),
    );
  }
  const snapshotHash = await sha256(canonicalProjectPayload(draft));
  return { ...draft, revision: { ...draft.revision, snapshotHash } };
}

function normalizeBehavior(
  behaviorId: BehaviorId,
  rules: readonly BehaviorRule[],
): BehaviorIR {
  return {
    behaviorId,
    version: BEHAVIOR_IR_VERSION,
    ownership: "CANONICAL_IR",
    rules: sortById(
      rules.map((rule) => ({
        ...rule,
        conditions: [...rule.conditions],
        actions: [...rule.actions],
      })) as Record<string, unknown>[],
      "ruleId",
    ) as unknown as readonly BehaviorRule[],
  };
}

export function compileNoCodeBehavior(
  source: NoCodeBehaviorSource,
): BehaviorIR {
  return normalizeBehavior(source.behaviorId, source.rules);
}

export function compileGraphBehavior(source: GraphBehaviorSource): BehaviorIR {
  const ordered = [...source.nodes].sort((left, right) =>
    left.nodeId.localeCompare(right.nodeId)
  );
  return normalizeBehavior(source.behaviorId, ordered.map((node) => node.rule));
}

export function compileScriptBehavior(
  source: ScriptBehaviorSource,
): BehaviorIR {
  if (
    source.language !== "typescript" || source.sourceText.trim().length === 0
  ) {
    throw new Error(
      "Script source must declare bounded TypeScript semantics.",
    );
  }
  return normalizeBehavior(source.behaviorId, source.rules);
}

export async function behaviorHash(behavior: BehaviorIR): Promise<Sha256> {
  return sha256(behavior);
}

export function createJournal(
  initial: GameProject,
  caller: CallerContext,
): JournalState {
  const validation = validateGameProject(initial, caller);
  if (!validation.valid) throw new Error("Cannot journal an invalid project.");
  return {
    current: initial,
    sequence: 0,
    past: [],
    future: [],
    checkpoints: [],
  };
}

export async function appendJournalCommand(
  state: JournalState,
  next: GameProject,
  caller: CallerContext,
  commandId: string,
): Promise<JournalState> {
  const validation = validateGameProject(next, caller);
  if (!validation.valid) throw new Error("Cannot append an invalid project.");
  const [beforeHash, afterHash] = await Promise.all([
    sha256(canonicalProjectPayload(state.current)),
    sha256(canonicalProjectPayload(next)),
  ]);
  const command: JournalCommand = {
    commandId,
    sequence: state.sequence + 1,
    beforeHash,
    afterHash,
    before: state.current,
    after: next,
  };
  return {
    ...state,
    current: next,
    sequence: command.sequence,
    past: [...state.past, command],
    future: [],
  };
}

export function undoJournal(state: JournalState): JournalState {
  const command = state.past.at(-1);
  if (!command) return state;
  return {
    ...state,
    current: command.before,
    past: state.past.slice(0, -1),
    future: [command, ...state.future],
  };
}

export function redoJournal(state: JournalState): JournalState {
  const command = state.future[0];
  if (!command) return state;
  return {
    ...state,
    current: command.after,
    past: [...state.past, command],
    future: state.future.slice(1),
  };
}

export function createCheckpoint(
  state: JournalState,
  checkpointId: string,
): JournalState {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(checkpointId)) {
    throw new Error("Checkpoint id must be stable.");
  }
  const checkpoint: Checkpoint = {
    checkpointId,
    sequence: state.sequence,
    project: state.current,
  };
  return {
    ...state,
    checkpoints: [
      ...state.checkpoints.filter((item) => item.checkpointId !== checkpointId),
      checkpoint,
    ],
  };
}

export function restoreCheckpoint(
  state: JournalState,
  checkpointId: string,
): JournalState {
  const checkpoint = state.checkpoints.find((item) =>
    item.checkpointId === checkpointId
  );
  if (!checkpoint) throw new Error(`Checkpoint not found: ${checkpointId}`);
  return {
    ...state,
    current: checkpoint.project,
    sequence: checkpoint.sequence,
    past: [],
    future: [],
  };
}
