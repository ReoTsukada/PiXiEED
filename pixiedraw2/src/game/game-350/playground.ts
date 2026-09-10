import {
  createDefaultGamePlaygroundWorldMap,
  createGamePlaygroundWorldIndex,
  cloneGamePlaygroundWorldMap,
  isValidGamePlaygroundWorldMap,
  type GamePlaygroundWorldBounds,
  type GamePlaygroundWorldMap,
} from "./world.ts";
import { isValidGameUiNode, normalizeGameUiNode, type GameUiNode } from "./visual-maker-model.ts";
import { isDpcmSampleReference, type DpcmSampleReference } from "../../audio/audio-240/dpcm.ts";

export {
  createDefaultGamePlaygroundWorldMap,
  cloneGamePlaygroundWorldMap,
  gamePlaygroundWorldCellAt,
  gamePlaygroundWorldChunkAt,
  gamePlaygroundWorldChunkKey,
  gamePlaygroundWorldCellsInViewport,
  gamePlaygroundWorldResidentChunkKeys,
  gamePlaygroundWorldSolidAt,
  worldCellCoordinateInChunk,
  worldChunkCoordinate,
  type GamePlaygroundWorldBounds,
  type GamePlaygroundWorldCell,
  type GamePlaygroundWorldCellWithPosition,
  type GamePlaygroundWorldChunk,
  type GamePlaygroundWorldMap,
  type GamePlaygroundWorldViewport,
} from "./world.ts";
import {
  legacyRangeToAudioAsset,
  type GameAudioAsset,
  type GameAudioBinding,
  type GameAudioLegacyEntry,
} from "./game-audio.ts";

/**
 * Beginner iGAME playground contract.
 *
 * The playground is deliberately smaller than the legacy Game authoring
 * model. It stores only references to Draw selections and Audio Tick ranges;
 * source pixels, samples, graphs, and engine-specific objects stay owned by
 * their source modules.
 */

export const GAME_PLAYGROUND_SCHEMA_VERSION = 3 as const;
export const GAME_PLAYGROUND_LEGACY_SCHEMA_VERSION = 1 as const;
export const GAME_PLAYGROUND_V2_SCHEMA_VERSION = 2 as const;

/**
 * The public Playground has one authoring system.  The older movement values
 * remain readable so saved experiments can still be opened and reviewed, but
 * no public control should ask an author to choose one of them up front.
 */
export type GamePlaygroundMode =
  | "UNIFIED"
  | "SIDE_SCROLL"
  | "RPG_4"
  | "RPG_8";
export type GamePlaygroundAssetLayout =
  | "FULL_CANVAS"
  | "MANUAL"
  | "GRID_32"
  | "FRAME_SEQUENCE"
  | "GRID_FRAME_SEQUENCE";
export type GamePlaygroundAudioRole = "BGM" | "SE" | "JUMP";
export type GamePlaygroundReferenceMode = "LIVE" | "PINNED";
export type GamePlaygroundLayer =
  | "BACKGROUND"
  | "WORLD"
  | "ACTOR"
  | "FOREGROUND"
  | "UI";
export type GamePlaygroundPlacementKind = "WORLD" | "SPRITE";
export type GamePlaygroundAudioEvent =
  | "BACKGROUND_MUSIC"
  | "PLAYER_MOVE"
  | "PLAYER_JUMP"
  | "PLAYER_LAND"
  | "PLAYER_ATTACK"
  | "TILE_STEP"
  | "OBJECT_INTERACT";

export interface GamePlaygroundRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GamePlaygroundSourceFrame {
  readonly sourceFrameId: string;
  /** Draw layers composing this frame; IDs only, never raster payloads. */
  readonly layerIds?: readonly string[];
  readonly rect: GamePlaygroundRect;
  readonly durationMs?: number;
}

/** Metadata-only iDRAW source. The optional frame list is still a reference. */
export interface GamePlaygroundDrawReference {
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly label: string;
  readonly mode: GamePlaygroundReferenceMode;
  readonly projectId?: string;
  readonly assetDefinitionId?: string;
  /** Optional explicit Market license identity; never inferred from price or tags. */
  readonly licenseId?: string;
  /** Rights copied from the authoritative license snapshot. */
  readonly rights?: readonly string[];
  readonly sourceKind?: "PROJECT" | "MARKET";
  readonly layout: GamePlaygroundAssetLayout;
  readonly sourceFrameId?: string;
  readonly region?: GamePlaygroundRect;
  readonly sourceFrames?: readonly GamePlaygroundSourceFrame[];
  /** Optional per-reference layer visibility override, IDs only. */
  readonly hiddenLayerIds?: readonly string[];
  readonly hiddenLayerIdsByFrame?: Readonly<Record<string, readonly string[]>>;
}

/** Infer the most useful iGAME import layout from iDRAW metadata. */
export function inferGamePlaygroundAssetLayout(input: {
  readonly animationFrameCount?: number;
  readonly region?: GamePlaygroundRect | null;
}): GamePlaygroundAssetLayout {
  const hasFrames = Number.isSafeInteger(input.animationFrameCount) &&
    (input.animationFrameCount ?? 0) > 1;
  const hasGridRegion = input.region !== undefined && input.region !== null &&
    input.region.width >= 32 && input.region.height >= 32;
  if (hasFrames && hasGridRegion) return "GRID_FRAME_SEQUENCE";
  if (hasFrames) return "FRAME_SEQUENCE";
  if (hasGridRegion) return "GRID_32";
  return "FULL_CANVAS";
}

export interface GameAssetDefaults {
  readonly movable: boolean;
  readonly collision: boolean;
  readonly gravity: boolean;
}

/** Reusable source entry. It never owns a Scene position. */
export interface GameAssetEntry {
  readonly assetId: string;
  readonly name: string;
  readonly source: GamePlaygroundDrawReference;
  readonly defaults: GameAssetDefaults;
}

export interface GamePlacementTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
}

export interface GamePlacementOverrides {
  readonly movable?: boolean;
  readonly collision?: boolean;
  readonly gravity?: boolean;
}

/** Canonical Scene instance. Transform, depth and behavior belong here. */
export interface GamePlacement {
  readonly placementId: string;
  readonly assetId: string;
  readonly transform: GamePlacementTransform;
  readonly layer: GamePlaygroundLayer;
  readonly depth: number;
  readonly visible: boolean;
  readonly overrides?: GamePlacementOverrides;
  readonly snapToGrid: false;
}

/**
 * A free 2D placement. Coordinates are continuous Playground units, not
 * cells; snapToGrid is deliberately a literal false so a future editor
 * cannot silently reintroduce grid snapping into this surface.
 */
export interface GamePlaygroundPlacement {
  readonly id: string;
  readonly label: string;
  readonly kind: GamePlaygroundPlacementKind;
  readonly reference: GamePlaygroundDrawReference;
  readonly layer: GamePlaygroundLayer;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly visible: boolean;
  readonly snapToGrid: false;
  /** Simple beginner-facing runtime switches. Omitted means the default. */
  readonly movable?: boolean;
  readonly collision?: boolean;
  readonly gravity?: boolean;
  /** v2 canonical fields. Legacy aliases above are a non-persisted projection. */
  readonly placementId?: string;
  readonly assetId?: string;
  readonly transform?: GamePlacementTransform;
  readonly overrides?: GamePlacementOverrides;
}

/** A user-selected iAUDIO span. Ticks are the only time authority here. */
export interface GamePlaygroundAudioRange {
  readonly assignmentId: string;
  readonly role: GamePlaygroundAudioRole;
  readonly projectId: string;
  readonly label: string;
  readonly startTick: number;
  readonly durationTick: number;
  readonly mode: GamePlaygroundReferenceMode;
  /** New event-first assignment. Missing means legacy role-based data. */
  readonly event?: GamePlaygroundAudioEvent;
  /** Optional target placement for object-specific interactions. */
  readonly targetPlacementId?: string;
  readonly trackId?: string;
  readonly clipId?: string;
  readonly assetId?: string;
  readonly revisionId?: string;
  readonly contentHash?: string;
}

export interface GamePlaygroundConfig {
  readonly schemaVersion: typeof GAME_PLAYGROUND_SCHEMA_VERSION;
  readonly mode: GamePlaygroundMode;
  readonly world?: GamePlaygroundDrawReference;
  /** Sparse 2D world data; empty space is represented by no chunk at all. */
  readonly worldMap?: GamePlaygroundWorldMap;
  readonly player?: GamePlaygroundDrawReference;
  /** Reusable sources. New records always write this array. */
  readonly assets: readonly GameAssetEntry[];
  /** Scene instances. New records always write canonical v2 placements. */
  readonly placements: readonly GamePlaygroundPlacement[];
  /** Reusable UI controls placed over the game view. */
  readonly uiNodes?: readonly GameUiNode[];
  readonly gameElements?: readonly GamePlaygroundElement[];
  readonly audioAssets: readonly GameAudioAsset[];
  readonly audioBindings: readonly GameAudioBinding[];
  /** Reusable DPCM slice references; source PCM remains owned by iAUDIO. */
  readonly dpcmSamples?: readonly DpcmSampleReference[];
  readonly legacyAudio: readonly GameAudioLegacyEntry[];
  /** Compatibility projection. It is defined as non-enumerable by the normalizer. */
  readonly audio: readonly GamePlaygroundAudioRange[];
}

export function addGamePlaygroundDpcmSample(
  config: GamePlaygroundConfig,
  sample: DpcmSampleReference,
): GamePlaygroundConfig {
  if (!isDpcmSampleReference(sample)) return config;
  const samples = (config.dpcmSamples ?? []).filter((candidate) => candidate.sampleId !== sample.sampleId);
  return { ...config, dpcmSamples: [...samples, { ...sample }] };
}

export function removeGamePlaygroundDpcmSample(
  config: GamePlaygroundConfig,
  sampleId: string,
): GamePlaygroundConfig {
  const id = sampleId.trim();
  return {
    ...config,
    dpcmSamples: (config.dpcmSamples ?? []).filter((sample) => sample.sampleId !== id),
    audioAssets: config.audioAssets.map((asset) => asset.dpcm?.sampleId === id
      ? (({ dpcm: _dpcm, ...withoutDpcm }) => withoutDpcm)(asset)
      : asset),
  };
}

export interface GamePlaygroundElement {
  readonly id: string;
  readonly kind: "ITEM" | "SKILL" | "CURRENCY" | "STATUS" | "TIMER";
  readonly label: string;
  readonly value: number;
  readonly effect?: string;
  /** Optional stable element id affected by this item's effect. */
  readonly effectTargetId?: string;
}

export interface GamePlaygroundQuarantineEntry {
  readonly path: string;
  readonly reason: string;
}

export interface GamePlaygroundMigrationResult {
  readonly config: GamePlaygroundConfig;
  readonly quarantined: readonly GamePlaygroundQuarantineEntry[];
  readonly migrated: boolean;
}

const PLAYGROUND_MODES: readonly GamePlaygroundMode[] = [
  "UNIFIED",
  "SIDE_SCROLL",
  "RPG_4",
  "RPG_8",
];
const PLAYGROUND_LAYOUTS: readonly GamePlaygroundAssetLayout[] = [
  "FULL_CANVAS",
  "MANUAL",
  "GRID_32",
  "FRAME_SEQUENCE",
  "GRID_FRAME_SEQUENCE",
];
const PLAYGROUND_AUDIO_ROLES: readonly GamePlaygroundAudioRole[] = [
  "BGM",
  "SE",
  "JUMP",
];
const REFERENCE_MODES: readonly GamePlaygroundReferenceMode[] = [
  "LIVE",
  "PINNED",
];
const PLAYGROUND_LAYERS: readonly GamePlaygroundLayer[] = [
  "BACKGROUND",
  "WORLD",
  "ACTOR",
  "FOREGROUND",
  "UI",
];
const PLAYGROUND_PLACEMENT_KINDS: readonly GamePlaygroundPlacementKind[] = [
  "WORLD",
  "SPRITE",
];
const PLAYGROUND_AUDIO_EVENTS: readonly GamePlaygroundAudioEvent[] = [
  "BACKGROUND_MUSIC",
  "PLAYER_MOVE",
  "PLAYER_JUMP",
  "PLAYER_LAND",
  "PLAYER_ATTACK",
  "TILE_STEP",
  "OBJECT_INTERACT",
];
const GAME_AUDIO_TARGET_KEYS = {
  SCENE_BGM: new Set(["kind", "sceneId"]),
  OBJECT_TRIGGER: new Set(["kind", "placementId", "trigger"]),
  ANIMATION_MARKER: new Set(["kind", "clipId", "phase", "frameIndex"]),
  TILE_STEP: new Set(["kind", "assetId", "tileTag"]),
  EVENT: new Set(["kind", "eventId"]),
} as const;
const GAME_AUDIO_SOURCE_KEYS = new Set(["projectId", "projectRevision", "projectStateHash", "trackIds", "startTick", "durationTick", "renderMode", "mode"]);
const GAME_AUDIO_DEFAULT_KEYS = new Set(["gainMilliDb", "loop", "retrigger"]);
const GAME_AUDIO_ASSET_KEYS = new Set(["audioAssetId", "name", "kind", "source", "dpcm", "defaults"]);
const DPCM_REFERENCE_KEYS = new Set(["sampleId", "sourceRevisionId", "startFrame", "frameCount", "rateHz", "loop"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validFiniteNumber(value: unknown, minimum = -Infinity): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "pixels",
  "pixeldata",
  "audiodata",
  "blob",
  "sourcebytes",
  "base64",
  "imagedata",
  "wavdata",
]);

const GAME_PLAYGROUND_RECT_KEYS = new Set(["x", "y", "width", "height"]);
const GAME_PLAYGROUND_SOURCE_FRAME_KEYS = new Set([
  "sourceFrameId",
  "layerIds",
  "rect",
  "durationMs",
]);
const GAME_PLAYGROUND_DRAW_REFERENCE_KEYS = new Set([
  "assetId",
  "revisionId",
  "contentHash",
  "label",
  "mode",
  "projectId",
  "assetDefinitionId",
  "licenseId",
  "rights",
  "sourceKind",
  "layout",
  "sourceFrameId",
  "region",
  "sourceFrames",
  "hiddenLayerIds",
  "hiddenLayerIdsByFrame",
]);

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function containsForbiddenPayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenPayload);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_PAYLOAD_KEYS.has(key.toLocaleLowerCase()) ||
    containsForbiddenPayload(nested)
  );
}

function validRect(value: unknown): value is GamePlaygroundRect {
  if (!isRecord(value)) return false;
  if (containsForbiddenPayload(value)) return false;
  if (!hasOnlyKeys(value, GAME_PLAYGROUND_RECT_KEYS)) return false;
  return validFiniteNumber(value.x) && validFiniteNumber(value.y) &&
    validFiniteNumber(value.width, 0) && validFiniteNumber(value.height, 0) &&
    value.width > 0 && value.height > 0;
}

function validSourceFrame(value: unknown): value is GamePlaygroundSourceFrame {
  if (!isRecord(value) || typeof value.sourceFrameId !== "string" ||
    value.sourceFrameId.trim().length === 0) return false;
  if (containsForbiddenPayload(value)) return false;
  if (!hasOnlyKeys(value, GAME_PLAYGROUND_SOURCE_FRAME_KEYS)) return false;
  return validRect(value.rect) &&
    (value.layerIds === undefined || (Array.isArray(value.layerIds) && value.layerIds.every((id) => typeof id === "string" && id.trim().length > 0))) &&
    (value.durationMs === undefined || validFiniteNumber(value.durationMs, 0));
}

function validPlacement(value: unknown): value is GamePlaygroundPlacement {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id.trim().length > 0 &&
    typeof value.label === "string" && value.label.trim().length > 0 &&
    PLAYGROUND_PLACEMENT_KINDS.includes(
      value.kind as GamePlaygroundPlacementKind,
    ) && validDrawReference(value.reference) &&
    PLAYGROUND_LAYERS.includes(value.layer as GamePlaygroundLayer) &&
    validFiniteNumber(value.depth) && validFiniteNumber(value.x) &&
    validFiniteNumber(value.y) && validFiniteNumber(value.scale, 0) &&
    value.scale > 0 && validFiniteNumber(value.rotation) &&
    typeof value.visible === "boolean" && value.snapToGrid === false &&
    (value.movable === undefined || typeof value.movable === "boolean") &&
    (value.collision === undefined || typeof value.collision === "boolean") &&
    (value.gravity === undefined || typeof value.gravity === "boolean");
}

function validAssetDefaults(value: unknown): value is GameAssetDefaults {
  if (!isRecord(value) || containsForbiddenPayload(value)) return false;
  return typeof value.movable === "boolean" &&
    typeof value.collision === "boolean" && typeof value.gravity === "boolean";
}

function validAsset(value: unknown): value is GameAssetEntry {
  if (!isRecord(value) || containsForbiddenPayload(value)) return false;
  return typeof value.assetId === "string" && value.assetId.trim().length > 0 &&
    typeof value.name === "string" && value.name.trim().length > 0 &&
    validDrawReference(value.source) && validAssetDefaults(value.defaults);
}

function validCanonicalPlacement(value: unknown): value is GamePlacement {
  if (!isRecord(value) || containsForbiddenPayload(value)) return false;
  const transform = value.transform;
  const overrides = value.overrides;
  return typeof value.placementId === "string" && value.placementId.trim().length > 0 &&
    typeof value.assetId === "string" && value.assetId.trim().length > 0 &&
    isRecord(transform) && validFiniteNumber(transform.x) &&
    validFiniteNumber(transform.y) && validFiniteNumber(transform.scale, 0) &&
    transform.scale > 0 && validFiniteNumber(transform.rotation) &&
    PLAYGROUND_LAYERS.includes(value.layer as GamePlaygroundLayer) &&
    validFiniteNumber(value.depth) && typeof value.visible === "boolean" &&
    value.snapToGrid === false &&
    (overrides === undefined || (
      isRecord(overrides) &&
      (overrides.movable === undefined || typeof overrides.movable === "boolean") &&
      (overrides.collision === undefined || typeof overrides.collision === "boolean") &&
      (overrides.gravity === undefined || typeof overrides.gravity === "boolean")
    ));
}

function validDrawReference(value: unknown): value is GamePlaygroundDrawReference {
  if (!isRecord(value)) return false;
  if (containsForbiddenPayload(value)) return false;
  if (!hasOnlyKeys(value, GAME_PLAYGROUND_DRAW_REFERENCE_KEYS)) return false;
  if (
    typeof value.assetId !== "string" || value.assetId.trim().length === 0 ||
    typeof value.revisionId !== "string" || value.revisionId.trim().length === 0 ||
    typeof value.contentHash !== "string" || value.contentHash.trim().length === 0 ||
    typeof value.label !== "string" || value.label.trim().length === 0 ||
    !REFERENCE_MODES.includes(value.mode as GamePlaygroundReferenceMode) ||
    !PLAYGROUND_LAYOUTS.includes(value.layout as GamePlaygroundAssetLayout)
  ) return false;
  if (value.projectId !== undefined && typeof value.projectId !== "string") return false;
  if (
    value.assetDefinitionId !== undefined &&
    (typeof value.assetDefinitionId !== "string" || value.assetDefinitionId.trim().length === 0)
  ) return false;
  if (
    value.licenseId !== undefined &&
    (typeof value.licenseId !== "string" || value.licenseId.trim().length === 0)
  ) return false;
  if (
    value.rights !== undefined &&
    (!Array.isArray(value.rights) || value.rights.length === 0 ||
      value.rights.some((right) => typeof right !== "string" || right.trim().length === 0) ||
      new Set(value.rights).size !== value.rights.length)
  ) return false;
  if (
    value.sourceKind !== undefined &&
    value.sourceKind !== "PROJECT" && value.sourceKind !== "MARKET"
  ) return false;
  if (value.sourceFrameId !== undefined && typeof value.sourceFrameId !== "string") return false;
  if (value.region !== undefined && !validRect(value.region)) return false;
  if (value.hiddenLayerIds !== undefined && (!Array.isArray(value.hiddenLayerIds) || value.hiddenLayerIds.some((id) => typeof id !== "string" || id.trim().length === 0))) return false;
  if (value.hiddenLayerIdsByFrame !== undefined && (!isRecord(value.hiddenLayerIdsByFrame) || Object.values(value.hiddenLayerIdsByFrame).some((ids) => !Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.trim().length === 0)))) return false;
  if (value.sourceFrames !== undefined &&
    (!Array.isArray(value.sourceFrames) || value.sourceFrames.length === 0 ||
      value.sourceFrames.some((frame) => !validSourceFrame(frame)))) return false;
  if (value.sourceKind === "MARKET" && (
    value.mode !== "PINNED" ||
    !/^[a-f0-9]{64}$/iu.test(value.contentHash) ||
    typeof value.licenseId !== "string" || value.licenseId.trim().length === 0 ||
    !Array.isArray(value.rights) || value.rights.length === 0 ||
    typeof value.sourceFrameId !== "string" || value.sourceFrameId.trim().length === 0 ||
    !Array.isArray(value.sourceFrames) || value.sourceFrames.length === 0
  )) return false;
  return true;
}

function validAudioRange(value: unknown): value is GamePlaygroundAudioRange {
  if (!isRecord(value)) return false;
  if (containsForbiddenPayload(value)) return false;
  if (
    typeof value.assignmentId !== "string" || value.assignmentId.trim().length === 0 ||
    !PLAYGROUND_AUDIO_ROLES.includes(value.role as GamePlaygroundAudioRole) ||
    typeof value.projectId !== "string" || value.projectId.trim().length === 0 ||
    typeof value.label !== "string" || value.label.trim().length === 0 ||
    typeof value.startTick !== "number" ||
    !Number.isSafeInteger(value.startTick) || value.startTick < 0 ||
    typeof value.durationTick !== "number" ||
    !Number.isSafeInteger(value.durationTick) || value.durationTick <= 0 ||
    !REFERENCE_MODES.includes(value.mode as GamePlaygroundReferenceMode)
  ) return false;
  if (
    value.event !== undefined &&
    !PLAYGROUND_AUDIO_EVENTS.includes(value.event as GamePlaygroundAudioEvent)
  ) return false;
  if (
    value.targetPlacementId !== undefined &&
    (typeof value.targetPlacementId !== "string" ||
      value.targetPlacementId.trim().length === 0)
  ) return false;
  for (const key of ["trackId", "clipId", "assetId", "revisionId", "contentHash"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") return false;
  }
  return true;
}

function validAudioAsset(value: unknown): value is GameAudioAsset {
  if (!isRecord(value) || containsForbiddenPayload(value)) return false;
  const source = value.source;
  const defaults = value.defaults;
  const projectRevision = isRecord(source) ? source.projectRevision : undefined;
  const startTick = isRecord(source) ? source.startTick : undefined;
  const durationTick = isRecord(source) ? source.durationTick : undefined;
  return typeof value.audioAssetId === "string" && value.audioAssetId.trim().length > 0 &&
    typeof value.name === "string" && value.name.trim().length > 0 &&
    (value.kind === "BGM" || value.kind === "SE" || value.kind === "VOICE") &&
    isRecord(source) && hasOnlyKeys(source, GAME_AUDIO_SOURCE_KEYS) && typeof source.projectId === "string" &&
    Number.isSafeInteger(projectRevision) && (projectRevision as number) >= 0 &&
    typeof source.projectStateHash === "string" && Array.isArray(source.trackIds) &&
    source.trackIds.length <= 32 && source.trackIds.every((id) => typeof id === "string") &&
    Number.isSafeInteger(startTick) && (startTick as number) >= 0 &&
    Number.isSafeInteger(durationTick) && (durationTick as number) > 0 &&
    source.renderMode === "POST_MIX" && REFERENCE_MODES.includes(source.mode as GamePlaygroundReferenceMode) &&
    isRecord(defaults) && hasOnlyKeys(defaults, GAME_AUDIO_DEFAULT_KEYS) && typeof defaults.gainMilliDb === "number" &&
    typeof defaults.loop === "boolean" &&
    ["RESTART", "IGNORE", "OVERLAP"].includes(defaults.retrigger as string) &&
    (value.dpcm === undefined || validDpcmSampleReference(value.dpcm));
}

function validDpcmSampleReference(value: unknown): value is DpcmSampleReference {
  return isRecord(value) && hasOnlyKeys(value, DPCM_REFERENCE_KEYS) && isDpcmSampleReference(value);
}

function validAudioTarget(value: unknown): value is GameAudioBinding["target"] {
  if (!isRecord(value) || typeof value.kind !== "string" || !(value.kind in GAME_AUDIO_TARGET_KEYS)) return false;
  if (!hasOnlyKeys(value, GAME_AUDIO_TARGET_KEYS[value.kind as keyof typeof GAME_AUDIO_TARGET_KEYS])) return false;
  switch (value.kind) {
    case "SCENE_BGM": return typeof value.sceneId === "string" && value.sceneId.trim().length > 0;
    case "OBJECT_TRIGGER": return typeof value.placementId === "string" && value.placementId.trim().length > 0 && ["JUMP", "LAND", "MOVE", "ATTACK", "INTERACT"].includes(value.trigger as string);
    case "ANIMATION_MARKER": return typeof value.clipId === "string" && value.clipId.trim().length > 0 && ["START", "FRAME", "LOOP", "END"].includes(value.phase as string) && (value.frameIndex === undefined || (typeof value.frameIndex === "number" && Number.isSafeInteger(value.frameIndex) && value.frameIndex >= 0));
    case "TILE_STEP": return typeof value.assetId === "string" && value.assetId.trim().length > 0 && (value.tileTag === undefined || typeof value.tileTag === "string");
    case "EVENT": return typeof value.eventId === "string" && value.eventId.trim().length > 0;
  }
  return false;
}

function validAudioBinding(value: unknown): value is GameAudioBinding {
  if (!isRecord(value) || containsForbiddenPayload(value)) return false;
  return typeof value.bindingId === "string" && value.bindingId.trim().length > 0 &&
    typeof value.audioAssetId === "string" && value.audioAssetId.trim().length > 0 &&
    validAudioTarget(value.target) &&
    typeof value.priority === "number" && Number.isFinite(value.priority);
}

export function isValidGamePlaygroundConfig(
  value: unknown,
): value is GamePlaygroundConfig {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== GAME_PLAYGROUND_SCHEMA_VERSION ||
    !PLAYGROUND_MODES.includes(value.mode as GamePlaygroundMode) ||
    (value.world !== undefined && !validDrawReference(value.world)) ||
    (value.worldMap !== undefined && !isValidGamePlaygroundWorldMap(value.worldMap)) ||
    (value.player !== undefined && !validDrawReference(value.player)) ||
    !Array.isArray(value.assets) ||
    new Set(value.assets.map((item) => isRecord(item) ? item.assetId : "")).size !==
      value.assets.length || value.assets.some((item) => !validAsset(item)) ||
    !Array.isArray(value.placements) ||
    new Set(value.placements.map((item) => isRecord(item)
      ? item.placementId ?? item.id
      : "")).size !== value.placements.length ||
    value.placements.some((item) => !validCanonicalPlacement(item)) ||
    (value.uiNodes !== undefined && (!Array.isArray(value.uiNodes) || value.uiNodes.some((item) => !isValidGameUiNode(item)))) ||
    (value.gameElements !== undefined && (!Array.isArray(value.gameElements) || value.gameElements.some((item) => !isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string" || !["ITEM", "SKILL", "CURRENCY", "STATUS", "TIMER"].includes(item.kind as string) || typeof item.value !== "number" || !Number.isFinite(item.value) || (item.effect !== undefined && typeof item.effect !== "string") || (item.effectTargetId !== undefined && (typeof item.effectTargetId !== "string" || item.effectTargetId.trim().length === 0))))) ||
    (value.dpcmSamples !== undefined && (!Array.isArray(value.dpcmSamples) || new Set(value.dpcmSamples.map((item) => isRecord(item) ? item.sampleId : "")).size !== value.dpcmSamples.length || value.dpcmSamples.some((item) => !validDpcmSampleReference(item)))) ||
    !Array.isArray(value.audioAssets) || value.audioAssets.some((item) => !validAudioAsset(item)) ||
    !Array.isArray(value.audioBindings) || value.audioBindings.some((item) => !validAudioBinding(item)) ||
    !Array.isArray(value.legacyAudio)
  ) return false;
  const assignments = Array.isArray(value.audio) ? value.audio as unknown[] : [];
  const assetIds = new Set(value.assets.map((item) =>
    (item as GameAssetEntry).assetId
  ));
  const audioAssetIds = new Set(value.audioAssets.map((item) =>
    (item as GameAudioAsset).audioAssetId
  ));
  return new Set(assignments.map((item) => isRecord(item) ? item.assignmentId : "")).size ===
      assignments.length && assignments.every(validAudioRange) &&
    new Set(value.audioBindings.map((item) => isRecord(item) ? item.bindingId : "")).size === value.audioBindings.length &&
    value.audioBindings.every((item) => audioAssetIds.has((item as GameAudioBinding).audioAssetId)) &&
    value.placements.every((item) => assetIds.has((item as GamePlacement).assetId));
}

function cloneRect(rect: GamePlaygroundRect): GamePlaygroundRect {
  return { ...rect };
}

function cloneDrawReference(
  reference: GamePlaygroundDrawReference,
): GamePlaygroundDrawReference {
  return {
    ...reference,
    ...(reference.rights === undefined ? {} : { rights: [...reference.rights] }),
    ...(reference.region === undefined ? {} : { region: cloneRect(reference.region) }),
    ...(reference.sourceFrames === undefined ? {} : {
      sourceFrames: reference.sourceFrames.map((frame) => ({
        ...frame,
        ...(frame.layerIds === undefined ? {} : { layerIds: [...frame.layerIds] }),
        rect: cloneRect(frame.rect),
      })),
    }),
    ...(reference.hiddenLayerIds === undefined ? {} : { hiddenLayerIds: [...reference.hiddenLayerIds] }),
    ...(reference.hiddenLayerIdsByFrame === undefined ? {} : { hiddenLayerIdsByFrame: Object.fromEntries(Object.entries(reference.hiddenLayerIdsByFrame).map(([id, layers]) => [id, [...layers]])) }),
  };
}

export function cloneGamePlaygroundConfig(
  config: GamePlaygroundConfig,
): GamePlaygroundConfig {
  const assets = config.assets.map((asset) => ({
    ...asset,
    source: cloneDrawReference(asset.source),
    defaults: { ...asset.defaults },
  }));
  const assetsById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const cloned = {
    schemaVersion: GAME_PLAYGROUND_SCHEMA_VERSION,
    mode: config.mode,
    ...(config.world === undefined ? {} : { world: cloneDrawReference(config.world) }),
    ...(config.worldMap === undefined
      ? {}
      : { worldMap: cloneGamePlaygroundWorldMap(config.worldMap) }),
    ...(config.player === undefined ? {} : { player: cloneDrawReference(config.player) }),
    assets,
    placements: config.placements.map((placement) => {
      const canonical = canonicalPlacementFor(placement);
      return projectGamePlacementToLegacy(
        cloneCanonicalPlacement(canonical),
        assetsById.get(canonical.assetId)?.source ?? placement.reference,
      );
    }),
    ...(config.uiNodes === undefined ? {} : { uiNodes: config.uiNodes.map((node) => ({ ...node, style: { ...node.style } })) }),
    ...(config.gameElements === undefined ? {} : { gameElements: config.gameElements.map((element) => ({ ...element })) }),
    audioAssets: (config.audioAssets ?? []).map((asset) => ({
      ...asset,
      source: { ...asset.source, trackIds: [...asset.source.trackIds] },
      ...(asset.dpcm === undefined ? {} : { dpcm: { ...asset.dpcm } }),
      defaults: { ...asset.defaults },
    })),
    audioBindings: (config.audioBindings ?? []).map((binding) => ({
      ...binding,
      target: { ...binding.target },
    })),
    legacyAudio: (config.legacyAudio ?? []).map((entry) => ({ ...entry })),
    ...(config.dpcmSamples === undefined ? {} : { dpcmSamples: config.dpcmSamples.map((sample) => ({ ...sample })) }),
  } as Omit<GamePlaygroundConfig, "audio">;
  return withLegacyAudioProjection(cloned, config.audio ?? []);
}

function withLegacyAudioProjection(
  config: Omit<GamePlaygroundConfig, "audio">,
  fallback: readonly GamePlaygroundAudioRange[] = [],
): GamePlaygroundConfig {
  const ranges = fallback.length > 0 ? fallback.map((range) => ({ ...range })) : [];
  const projected = { ...config } as GamePlaygroundConfig;
  Object.defineProperty(projected, "audio", {
    configurable: true,
    enumerable: false,
    get: () => ranges,
  });
  return projected;
}

function cloneCanonicalPlacement(placement: GamePlacement): GamePlacement {
  return {
    ...placement,
    transform: { ...placement.transform },
    ...(placement.overrides === undefined
      ? {}
      : { overrides: { ...placement.overrides } }),
  };
}

function canonicalPlacementFor(value: GamePlaygroundPlacement | GamePlacement): GamePlacement {
  const candidate = value as unknown as Record<string, unknown>;
  const transform = isRecord(candidate.transform) ? candidate.transform : undefined;
  const placementId = typeof candidate.placementId === "string"
    ? candidate.placementId
    : String(candidate.id ?? "");
  const assetId = typeof candidate.assetId === "string"
    ? candidate.assetId
    : isRecord(candidate.reference) && typeof candidate.reference.assetId === "string"
    ? candidate.reference.assetId
    : "";
  const x = validFiniteNumber(candidate.x)
    ? candidate.x
    : validFiniteNumber(transform?.x) ? transform.x : 0;
  const y = validFiniteNumber(candidate.y)
    ? candidate.y
    : validFiniteNumber(transform?.y) ? transform.y : 0;
  const scale = validFiniteNumber(candidate.scale, 0)
    ? candidate.scale
    : validFiniteNumber(transform?.scale, 0) ? transform.scale : 1;
  const rotation = validFiniteNumber(candidate.rotation)
    ? candidate.rotation
    : validFiniteNumber(transform?.rotation) ? transform.rotation : 0;
  const overrides = isRecord(candidate.overrides)
    ? {
      ...(typeof candidate.overrides.movable === "boolean"
        ? { movable: candidate.overrides.movable } : {}),
      ...(typeof candidate.overrides.collision === "boolean"
        ? { collision: candidate.overrides.collision } : {}),
      ...(typeof candidate.overrides.gravity === "boolean"
        ? { gravity: candidate.overrides.gravity } : {}),
    }
    : {
      ...(typeof candidate.movable === "boolean" ? { movable: candidate.movable } : {}),
      ...(typeof candidate.collision === "boolean" ? { collision: candidate.collision } : {}),
      ...(typeof candidate.gravity === "boolean" ? { gravity: candidate.gravity } : {}),
    };
  return {
    placementId,
    assetId,
    transform: { x, y, scale, rotation },
    layer: PLAYGROUND_LAYERS.includes(candidate.layer as GamePlaygroundLayer)
      ? candidate.layer as GamePlaygroundLayer
      : "ACTOR",
    depth: validFiniteNumber(candidate.depth) ? candidate.depth : 0,
    visible: typeof candidate.visible === "boolean" ? candidate.visible : true,
    snapToGrid: false,
    ...(Object.keys(overrides).length === 0 ? {} : { overrides }),
  };
}

function projectGamePlacementToLegacy(
  placement: GamePlacement,
  reference: GamePlaygroundDrawReference,
): GamePlaygroundPlacement {
  const projected = { ...placement } as GamePlaygroundPlacement;
  const aliases: Record<string, unknown> = {
    id: placement.placementId,
    label: reference.label,
    kind: "SPRITE",
    reference,
    x: placement.transform.x,
    y: placement.transform.y,
    scale: placement.transform.scale,
    rotation: placement.transform.rotation,
    ...(placement.overrides?.movable === undefined ? {} : { movable: placement.overrides.movable }),
    ...(placement.overrides?.collision === undefined ? {} : { collision: placement.overrides.collision }),
    ...(placement.overrides?.gravity === undefined ? {} : { gravity: placement.overrides.gravity }),
  };
  for (const [key, value] of Object.entries(aliases)) {
    Object.defineProperty(projected, key, {
      configurable: true,
      enumerable: false,
      get: () => value,
    });
  }
  return projected;
}

/** Normalize a placement at an authority boundary while retaining UI aliases. */
export function normalizeGamePlaygroundPlacement(
  value: GamePlaygroundPlacement | GamePlacement,
  source?: GamePlaygroundDrawReference,
): GamePlaygroundPlacement {
  const candidate = value as unknown as Record<string, unknown>;
  const reference = source ?? cloneReferenceSafely(candidate.reference);
  if (reference === undefined) throw new Error("Placement source is required.");
  const canonical = canonicalPlacementFor(value);
  if (!validCanonicalPlacement(canonical)) {
    throw new Error("Invalid playground placement.");
  }
  return projectGamePlacementToLegacy(canonical, reference);
}

export function createDefaultGamePlaygroundConfig(): GamePlaygroundConfig {
  return withLegacyAudioProjection({
    schemaVersion: GAME_PLAYGROUND_SCHEMA_VERSION,
    mode: "UNIFIED",
    worldMap: createDefaultGamePlaygroundWorldMap(),
    assets: [],
    placements: [],
    uiNodes: [],
    gameElements: [],
    audioAssets: [],
    audioBindings: [],
    legacyAudio: [],
  }, []);
}

function cloneReferenceSafely(value: unknown): GamePlaygroundDrawReference | undefined {
  if (!validDrawReference(value)) return undefined;
  return {
    assetId: value.assetId,
    revisionId: value.revisionId,
    contentHash: value.contentHash,
    label: value.label,
    mode: value.mode,
    ...(value.projectId === undefined ? {} : { projectId: value.projectId }),
    ...(value.assetDefinitionId === undefined ? {} : { assetDefinitionId: value.assetDefinitionId }),
    ...(value.licenseId === undefined ? {} : { licenseId: value.licenseId }),
    ...(value.rights === undefined ? {} : { rights: [...value.rights] }),
    ...(value.sourceKind === undefined ? {} : { sourceKind: value.sourceKind }),
    layout: value.layout,
    ...(value.sourceFrameId === undefined ? {} : { sourceFrameId: value.sourceFrameId }),
    ...(value.region === undefined ? {} : { region: cloneRect(value.region) }),
    ...(value.sourceFrames === undefined ? {} : {
      sourceFrames: value.sourceFrames.map((frame) => ({
        sourceFrameId: frame.sourceFrameId,
        ...(frame.layerIds === undefined ? {} : { layerIds: [...frame.layerIds] }),
        rect: cloneRect(frame.rect),
        ...(frame.durationMs === undefined ? {} : { durationMs: frame.durationMs }),
      })),
    }),
    ...(value.hiddenLayerIds === undefined ? {} : { hiddenLayerIds: [...value.hiddenLayerIds] }),
    ...(value.hiddenLayerIdsByFrame === undefined ? {} : { hiddenLayerIdsByFrame: Object.fromEntries(Object.entries(value.hiddenLayerIdsByFrame).map(([id, layers]) => [id, [...layers]])) }),
  };
}

function assetForReference(
  reference: GamePlaygroundDrawReference,
  defaults: GameAssetDefaults,
): GameAssetEntry {
  return {
    assetId: reference.assetId,
    name: reference.label,
    source: cloneReferenceSafely(reference) ?? reference,
    defaults: { ...defaults },
  };
}

function placementReference(value: unknown): GamePlaygroundDrawReference | undefined {
  if (!isRecord(value)) return undefined;
  return cloneReferenceSafely(value.reference);
}

/**
 * Convert old playground records without saving them. Invalid instances are
 * isolated so the surrounding Game record can remain usable.
 */
export function migrateGamePlaygroundConfig(value: unknown): GamePlaygroundMigrationResult {
  const source = isRecord(value) ? value : {};
  const quarantined: GamePlaygroundQuarantineEntry[] = [];
  const assets: GameAssetEntry[] = [];
  const assetIds = new Set<string>();
  const addAsset = (asset: GameAssetEntry): void => {
    if (assetIds.has(asset.assetId)) return;
    assets.push(asset);
    assetIds.add(asset.assetId);
  };
  if (Array.isArray(source.assets)) {
    for (const [index, raw] of source.assets.entries()) {
      if (!validAsset(raw)) {
        quarantined.push({ path: "assets[" + index + "]", reason: "invalid-or-payload" });
        continue;
      }
      addAsset({
        assetId: raw.assetId,
        name: raw.name,
        source: cloneReferenceSafely(raw.source) ?? raw.source,
        defaults: { ...raw.defaults },
      });
    }
  }
  const rawPlacements = Array.isArray(source.placements) ? source.placements : [];
  const placements: GamePlaygroundPlacement[] = [];
  const placementIds = new Set<string>();
  const addPlacement = (raw: unknown, path: string): void => {
    const reference = placementReference(raw);
    const candidate = isRecord(raw) ? raw : undefined;
    if (
      candidate !== undefined &&
      candidate.reference !== undefined &&
      reference === undefined
    ) {
      quarantined.push({
        path,
        reason: "invalid-or-payload-placement-reference",
      });
      return;
    }
    const assetId = candidate !== undefined && typeof candidate.assetId === "string"
      ? candidate.assetId
      : reference?.assetId;
    if (assetId !== undefined && reference !== undefined && !assetIds.has(assetId)) {
      addAsset(assetForReference(reference, {
        movable: candidate?.movable !== false,
        collision: candidate?.collision !== false,
        gravity: candidate?.gravity === true,
      }));
    }
    const canonical = candidate === undefined ? undefined : canonicalPlacementFor(
      candidate as unknown as GamePlaygroundPlacement,
    );
    if (canonical === undefined || !validCanonicalPlacement(canonical) ||
      !assetIds.has(canonical.assetId) || placementIds.has(canonical.placementId)) {
      quarantined.push({ path, reason: "invalid-or-unresolved-placement" });
      return;
    }
    placementIds.add(canonical.placementId);
    const sourceAsset = assets.find((asset) => asset.assetId === canonical.assetId);
    if (sourceAsset === undefined) {
      quarantined.push({ path, reason: "missing-asset" });
      return;
    }
    placements.push(projectGamePlacementToLegacy(canonical, sourceAsset.source));
  };
  rawPlacements.forEach((raw, index) => addPlacement(raw, "placements[" + index + "]"));
  for (const [key] of [["world"], ["player"]] as const) {
    const reference = cloneReferenceSafely(source[key]);
    if (reference === undefined || placements.some((placement) => placement.placementId === key)) continue;
    if (!assetIds.has(reference.assetId)) addAsset(assetForReference(reference, {
      movable: key === "player",
      collision: key === "player",
      gravity: false,
    }));
    const asset = assets.find((candidate) => candidate.assetId === reference.assetId);
    if (asset === undefined) continue;
    const canonical: GamePlacement = {
      placementId: key,
      assetId: asset.assetId,
      transform: { x: key === "world" ? 0 : 50, y: key === "world" ? 0 : 30, scale: 1, rotation: 0 },
      layer: key === "world" ? "WORLD" : "ACTOR",
      depth: key === "world" ? 0 : 10,
      visible: true,
      snapToGrid: false,
    };
    placements.push(projectGamePlacementToLegacy(canonical, asset.source));
    placementIds.add(key);
  }
  const legacyAudio: GameAudioLegacyEntry[] = Array.isArray(source.legacyAudio)
    ? source.legacyAudio.filter((entry): entry is GameAudioLegacyEntry => isRecord(entry) && typeof entry.legacyId === "string" && typeof entry.reason === "string").map((entry) => ({ ...entry }))
    : [];
  const audioAssets: GameAudioAsset[] = Array.isArray(source.audioAssets)
    ? source.audioAssets.filter(validAudioAsset).map((asset) => ({ ...asset, source: { ...asset.source, trackIds: [...asset.source.trackIds] }, ...(asset.dpcm === undefined ? {} : { dpcm: { ...asset.dpcm } }), defaults: { ...asset.defaults } }))
    : [];
  const audioBindings: GameAudioBinding[] = Array.isArray(source.audioBindings)
    ? source.audioBindings.filter(validAudioBinding).map((binding) => ({ ...binding, target: { ...binding.target } }))
    : [];
  const hasCanonicalAudioCollections = Array.isArray(source.audioAssets) || Array.isArray(source.audioBindings);
  const audioRanges: GamePlaygroundAudioRange[] = Array.isArray(source.audio)
    ? source.audio.flatMap((raw, index) => {
      if (!validAudioRange(raw)) {
        const candidate = isRecord(raw) ? raw : {};
        legacyAudio.push({
          legacyId: `legacy-audio:${index}`,
          reason: "invalid-or-payload",
          ...(typeof candidate.projectId === "string" ? { projectId: candidate.projectId } : {}),
          ...(typeof candidate.trackId === "string" ? { trackId: candidate.trackId } : {}),
          ...(typeof candidate.clipId === "string" ? { clipId: candidate.clipId } : {}),
          ...(typeof candidate.label === "string" ? { label: candidate.label } : {}),
        });
        quarantined.push({ path: "audio[" + index + "]", reason: "preserved-legacy" });
        return [];
      }
      const range = { ...raw };
      const asset = legacyRangeToAudioAsset(range);
      if (!hasCanonicalAudioCollections && !audioAssets.some((candidate) => candidate.audioAssetId === asset.audioAssetId)) audioAssets.push(asset);
      const event = range.event ?? gamePlaygroundAudioEventForRole(range.role);
      const target = event === "BACKGROUND_MUSIC"
        ? { kind: "SCENE_BGM", sceneId: "scene:main" } as const
        : { kind: "OBJECT_TRIGGER", placementId: range.targetPlacementId ?? "player", trigger: event === "PLAYER_JUMP" ? "JUMP" : event === "PLAYER_LAND" || event === "TILE_STEP" ? "LAND" : event === "PLAYER_ATTACK" ? "ATTACK" : event === "PLAYER_MOVE" ? "MOVE" : "INTERACT" } as const;
      const bindingId = `binding:${range.assignmentId}`;
      if (!hasCanonicalAudioCollections && !audioBindings.some((binding) => binding.bindingId === bindingId)) audioBindings.push({ bindingId, audioAssetId: asset.audioAssetId, target, priority: 0 });
      return [range];
    })
    : [];
  const worldMap = isValidGamePlaygroundWorldMap(source.worldMap)
    ? cloneGamePlaygroundWorldMap(source.worldMap)
    : createDefaultGamePlaygroundWorldMap();
  const uiNodes = Array.isArray(source.uiNodes)
    ? source.uiNodes.flatMap((node) => { const normalized = normalizeGameUiNode(node); return normalized === undefined ? [] : [{ ...normalized, style: { ...normalized.style } }]; })
    : [];
  const gameElements = Array.isArray(source.gameElements)
    ? source.gameElements.filter((item): item is GamePlaygroundElement => isRecord(item) && typeof item.id === "string" && typeof item.label === "string" && ["ITEM", "SKILL", "CURRENCY", "STATUS", "TIMER"].includes(item.kind as string) && typeof item.value === "number" && Number.isFinite(item.value) && (item.effect === undefined || typeof item.effect === "string") && (item.effectTargetId === undefined || (typeof item.effectTargetId === "string" && item.effectTargetId.trim().length > 0))).map((item) => ({ ...item }))
    : [];
  const worldReference = cloneReferenceSafely(source.world);
  const playerReference = cloneReferenceSafely(source.player);
  const configBase: Omit<GamePlaygroundConfig, "audio"> = {
    schemaVersion: GAME_PLAYGROUND_SCHEMA_VERSION,
    mode: "UNIFIED",
    ...(worldReference === undefined ? {} : { world: worldReference }),
    worldMap,
    ...(playerReference === undefined ? {} : { player: playerReference }),
    assets,
    placements,
    uiNodes,
    gameElements,
    audioAssets,
    audioBindings,
    ...(Array.isArray(source.dpcmSamples)
      ? { dpcmSamples: source.dpcmSamples.filter(validDpcmSampleReference).map((sample) => ({ ...sample })) }
      : {}),
    legacyAudio,
  };
  const config = withLegacyAudioProjection(configBase, audioRanges);
  return {
    config,
    quarantined,
    migrated: source.schemaVersion !== GAME_PLAYGROUND_SCHEMA_VERSION || quarantined.length > 0,
  };
}

/** Lightweight envelope check used by persistence before partial migration. */
export function isValidGamePlaygroundPersistenceInput(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const { assets: _assets, placements: _placements, audio: _audio, ...envelope } = value;
  if (containsForbiddenPayload(envelope)) return false;
  if (value.schemaVersion !== GAME_PLAYGROUND_SCHEMA_VERSION &&
    value.schemaVersion !== GAME_PLAYGROUND_V2_SCHEMA_VERSION &&
    value.schemaVersion !== GAME_PLAYGROUND_LEGACY_SCHEMA_VERSION) return false;
  if (value.mode !== undefined && !PLAYGROUND_MODES.includes(value.mode as GamePlaygroundMode)) return false;
  if (value.audio !== undefined && !Array.isArray(value.audio)) return false;
  if (value.audioAssets !== undefined && !Array.isArray(value.audioAssets)) return false;
  if (value.audioBindings !== undefined && !Array.isArray(value.audioBindings)) return false;
  if (value.legacyAudio !== undefined && !Array.isArray(value.legacyAudio)) return false;
  if (value.assets !== undefined && !Array.isArray(value.assets)) return false;
  if (value.placements !== undefined && !Array.isArray(value.placements)) return false;
  return true;
}

export function normalizeGamePlaygroundConfig(
  value?: Partial<GamePlaygroundConfig>,
): GamePlaygroundConfig {
  const normalized = migrateGamePlaygroundConfig(value).config;
  const ranges = normalized.audio.map((range) => ({
    ...range,
    ...(range.event === undefined
      ? { event: gamePlaygroundAudioEventForRole(range.role) }
      : {}),
  }));
  const base: Omit<GamePlaygroundConfig, "audio"> = {
    ...normalized,
    worldMap: normalized.worldMap ?? createDefaultGamePlaygroundWorldMap(),
    // The public authoring surface is one continuous Playground. Legacy
    // movement values are still accepted by the runtime API for tests and
    // old records, but reopening an editor never asks the author to choose a
    // global genre/movement mode.
    mode: "UNIFIED",
    audioAssets: normalized.audioAssets,
    audioBindings: normalized.audioBindings,
    legacyAudio: normalized.legacyAudio,
    uiNodes: normalized.uiNodes ?? [],
    gameElements: normalized.gameElements ?? [],
  };
  return withLegacyAudioProjection(base, ranges);
}

export function gamePlaygroundAudioEventForRole(
  role: GamePlaygroundAudioRole | undefined,
): GamePlaygroundAudioEvent {
  switch (role) {
    case "BGM":
      return "BACKGROUND_MUSIC";
    case "JUMP":
      return "PLAYER_JUMP";
    case "SE":
    default:
      return "PLAYER_MOVE";
  }
}

export function upsertGamePlaygroundAudioRange(
  config: GamePlaygroundConfig,
  range: GamePlaygroundAudioRange,
): GamePlaygroundConfig {
  if (!validAudioRange(range)) throw new Error("Invalid playground audio range.");
  const cloned = cloneGamePlaygroundConfig(config);
  const audio = [...(config.audio ?? []).filter((item) => item.assignmentId !== range.assignmentId), { ...range }];
  const asset = legacyRangeToAudioAsset(range);
  const audioAssets = [...cloned.audioAssets.filter((item) => item.audioAssetId !== asset.audioAssetId), asset];
  const event = range.event ?? gamePlaygroundAudioEventForRole(range.role);
  const target = event === "BACKGROUND_MUSIC"
    ? { kind: "SCENE_BGM", sceneId: "scene:main" } as const
    : event === "TILE_STEP"
    ? { kind: "TILE_STEP", assetId: range.targetPlacementId ?? "world" } as const
    : { kind: "OBJECT_TRIGGER", placementId: range.targetPlacementId ?? "player", trigger: event === "PLAYER_JUMP" ? "JUMP" : event === "PLAYER_LAND" ? "LAND" : event === "PLAYER_ATTACK" ? "ATTACK" : event === "PLAYER_MOVE" ? "MOVE" : "INTERACT" } as const;
  const audioBindings = [...cloned.audioBindings.filter((item) => item.bindingId !== `binding:${range.assignmentId}`), { bindingId: `binding:${range.assignmentId}`, audioAssetId: asset.audioAssetId, target, priority: 0 }];
  return withLegacyAudioProjection({ ...cloned, audioAssets, audioBindings }, audio);
}

export function removeGamePlaygroundAudioRange(
  config: GamePlaygroundConfig,
  assignmentId: string,
): GamePlaygroundConfig {
  const cloned = cloneGamePlaygroundConfig(config);
  return withLegacyAudioProjection({
    ...cloned,
    audioBindings: cloned.audioBindings.filter((item) => item.bindingId !== `binding:${assignmentId}`),
  }, (config.audio ?? []).filter((item) => item.assignmentId !== assignmentId));
}

export interface GamePlaygroundPoint {
  readonly x: number;
  readonly y: number;
}

export interface GamePlaygroundRuntimeActor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly movable?: boolean;
  readonly collision?: boolean;
  readonly gravity?: boolean;
}

export interface GamePlaygroundRuntimeState {
  readonly schemaVersion: typeof GAME_PLAYGROUND_SCHEMA_VERSION;
  readonly mode: GamePlaygroundMode;
  readonly tick: number;
  readonly playerId: string;
  readonly playerPosition: GamePlaygroundPoint;
  readonly velocity: GamePlaygroundPoint;
  readonly grounded: boolean;
  readonly facing: "LEFT" | "RIGHT" | "UP" | "DOWN" | "UP_LEFT" | "UP_RIGHT" | "DOWN_LEFT" | "DOWN_RIGHT";
  readonly motion: "IDLE" | "WALK" | "JUMP" | "LAND" | "ATTACK";
  /** Remaining ticks for a one-shot/cell-step animation; -1 means continuous. */
  readonly motionTicksRemaining: number;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly positions: Readonly<Record<string, GamePlaygroundPoint>>;
  readonly playerMovable: boolean;
  readonly playerCollision: boolean;
  readonly playerGravity: boolean;
  /** Edge-trigger latches keep held action keys from restarting one-shots. */
  readonly actionLatch?: Readonly<{ jump: boolean; attack: boolean }>;
}

export interface GamePlaygroundRuntimeInput {
  readonly left?: boolean;
  readonly right?: boolean;
  readonly up?: boolean;
  readonly down?: boolean;
  readonly jump?: boolean;
  /** One-shot action; it never also moves the player. */
  readonly attack?: boolean;
}

export interface GamePlaygroundRuntimeWorld {
  readonly width: number;
  readonly height: number;
  readonly solidCells: readonly GamePlaygroundPoint[];
  /** FINITE clamps movement; INFINITE allows coordinates beyond the editor extent. */
  readonly bounds?: GamePlaygroundWorldBounds;
  readonly chunkSize?: number;
  /** O(1)-style sparse lookup supplied by a chunk index. */
  readonly solidAt?: (x: number, y: number) => boolean;
}

/**
 * Build a disposable runtime view without flattening a sparse authored map.
 * The index is created once; movement and collision then query only keyed
 * chunks/cells regardless of the map's nominal width or height.
 */
export function createGamePlaygroundRuntimeWorld(
  map: GamePlaygroundWorldMap,
): GamePlaygroundRuntimeWorld {
  const index = createGamePlaygroundWorldIndex(map);
  return {
    width: map.width,
    height: map.height,
    bounds: map.bounds,
    chunkSize: map.chunkSize,
    solidCells: [],
    solidAt: index.solidAt,
  };
}

export interface CreateGamePlaygroundRuntimeInput {
  readonly mode: GamePlaygroundMode;
  readonly world: GamePlaygroundRuntimeWorld;
  readonly player: GamePlaygroundRuntimeActor;
  readonly actors?: readonly GamePlaygroundRuntimeActor[];
}

const PLAYGROUND_DT = 1 / 12;
const SIDE_SPEED = 4.2;
const SIDE_GRAVITY = 18;
const SIDE_JUMP_SPEED = 7.2;

/** Resolve a deterministic frame for one-shot or cell-step playback. */
export function gamePlaygroundAnimationFrameIndex(input: {
  readonly motion: "IDLE" | "WALK" | "JUMP" | "LAND" | "ATTACK";
  readonly frameCount: number;
  readonly tick: number;
  readonly motionTicksRemaining: number;
}): number {
  if (!Number.isFinite(input.frameCount) || input.frameCount <= 0) return 0;
  const count = Math.max(1, Math.floor(input.frameCount));
  if (input.motion === "IDLE") return 0;
  if (
    input.motion === "JUMP" || input.motion === "LAND" ||
    input.motion === "ATTACK" ||
    (input.motion === "WALK" && input.motionTicksRemaining >= 0)
  ) {
    const progress = Math.max(0, Math.min(3, 3 - Math.max(0, Math.floor(input.motionTicksRemaining))));
    return Math.max(0, Math.min(count - 1, Math.round(progress / 3 * (count - 1))));
  }
  return Math.max(0, Math.floor(input.tick)) % count;
}
const RPG_SPEED = 2.8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cellKey(x: number, y: number): string {
  return `${Math.floor(x)},${Math.floor(y)}`;
}

function solidSet(world: GamePlaygroundRuntimeWorld): ReadonlySet<string> {
  const source = world.solidCells as object;
  const cached = solidSetCache.get(source);
  if (cached !== undefined) return cached;
  const created = new Set(world.solidCells.map((cell) => cellKey(cell.x, cell.y)));
  solidSetCache.set(source, created);
  return created;
}

const solidSetCache = new WeakMap<object, ReadonlySet<string>>();

function isSolidAt(
  world: GamePlaygroundRuntimeWorld,
  cells: ReadonlySet<string> | undefined,
  x: number,
  y: number,
): boolean {
  return world.solidAt?.(x, y) ?? cells?.has(cellKey(x, y)) ?? false;
}

function finiteWorld(world: GamePlaygroundRuntimeWorld): boolean {
  return world.bounds !== "INFINITE";
}

function boundedCoordinate(
  value: number,
  minimum: number,
  maximum: number,
  world: GamePlaygroundRuntimeWorld,
): number {
  return finiteWorld(world) ? clamp(value, minimum, maximum) : value;
}

function cameraXFor(
  mode: GamePlaygroundMode,
  x: number,
  world: GamePlaygroundRuntimeWorld,
): number {
  if (mode !== "SIDE_SCROLL" && mode !== "UNIFIED") return 0;
  const next = x - 5;
  return finiteWorld(world)
    ? clamp(next, 0, Math.max(0, world.width - 10))
    : next;
}

function cameraYFor(
  mode: GamePlaygroundMode,
  y: number,
  worldHeight: number,
  world: GamePlaygroundRuntimeWorld,
): number {
  if (mode !== "UNIFIED") return 0;
  const next = y - 3;
  return finiteWorld(world)
    ? clamp(next, 0, Math.max(0, worldHeight - 6))
    : next;
}

export function createGamePlaygroundRuntime(
  input: CreateGamePlaygroundRuntimeInput,
): GamePlaygroundRuntimeState {
  const positions: Record<string, GamePlaygroundPoint> = {};
  for (const actor of input.actors ?? []) positions[actor.id] = { x: actor.x, y: actor.y };
  positions[input.player.id] = { x: input.player.x, y: input.player.y };
  const grounded = input.mode === "SIDE_SCROLL"
    ? input.player.y >= input.world.height - 2
    : true;
  const playerMovable = input.player.movable !== false;
  const playerCollision = input.player.collision !== false;
  const playerGravity = input.player.gravity ?? input.mode === "SIDE_SCROLL";
  return {
    schemaVersion: GAME_PLAYGROUND_SCHEMA_VERSION,
    mode: input.mode,
    tick: 0,
    playerId: input.player.id,
    playerPosition: { x: input.player.x, y: input.player.y },
    velocity: { x: 0, y: 0 },
    grounded,
    facing: "RIGHT",
    motion: "IDLE",
    motionTicksRemaining: 0,
    cameraX: cameraXFor(input.mode, input.player.x, input.world),
    cameraY: cameraYFor(input.mode, input.player.y, input.world.height, input.world),
    positions,
    playerMovable,
    playerCollision,
    playerGravity,
    actionLatch: { jump: false, attack: false },
  };
}

function nextFacing(
  mode: GamePlaygroundMode,
  input: GamePlaygroundRuntimeInput,
  previous: GamePlaygroundRuntimeState["facing"],
): GamePlaygroundRuntimeState["facing"] {
  if (mode === "SIDE_SCROLL") {
    if (input.left === true) return "LEFT";
    if (input.right === true) return "RIGHT";
    return previous;
  }
  const horizontal = (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0);
  const vertical = (input.down === true ? 1 : 0) - (input.up === true ? 1 : 0);
  if (horizontal !== 0 && vertical !== 0) {
    return vertical < 0
      ? horizontal < 0 ? "UP_LEFT" : "UP_RIGHT"
      : horizontal < 0 ? "DOWN_LEFT" : "DOWN_RIGHT";
  }
  if (horizontal > 0) return "RIGHT";
  if (horizontal < 0) return "LEFT";
  if (vertical > 0) return "DOWN";
  if (vertical < 0) return "UP";
  return previous;
}

export function stepGamePlaygroundRuntime(
  state: GamePlaygroundRuntimeState,
  input: GamePlaygroundRuntimeInput,
  world: GamePlaygroundRuntimeWorld,
): GamePlaygroundRuntimeState {
  const cells = world.solidAt === undefined ? solidSet(world) : undefined;
  const previous = state.playerPosition;
  let x = previous.x;
  let y = previous.y;
  let velocityX = 0;
  let velocityY = 0;
  let grounded = state.grounded;
  const facing = nextFacing(state.mode, input, state.facing);
  const actionLatch = {
    jump: input.jump === true,
    attack: input.attack === true,
  };
  const attackPressed = actionLatch.attack && state.actionLatch?.attack !== true;
  const jumpPressed = actionLatch.jump && state.actionLatch?.jump !== true;
  const discreteMovement = state.mode === "UNIFIED" ||
    state.mode === "RPG_4" || state.mode === "RPG_8";

  if (attackPressed) {
    return {
      ...state,
      tick: state.tick + 1,
      velocity: { x: 0, y: 0 },
      motion: "ATTACK",
      motionTicksRemaining: 3,
      facing,
      actionLatch,
    };
  }

  if (state.motion === "ATTACK" && state.motionTicksRemaining > 0) {
    return {
      ...state,
      tick: state.tick + 1,
      velocity: { x: 0, y: 0 },
      motionTicksRemaining: state.motionTicksRemaining - 1,
      actionLatch,
    };
  }

  if (discreteMovement && jumpPressed) {
    return {
      ...state,
      tick: state.tick + 1,
      velocity: { x: 0, y: 0 },
      motion: "JUMP",
      motionTicksRemaining: 3,
      facing,
      actionLatch,
    };
  }

  if (
    discreteMovement && state.motionTicksRemaining > 0 &&
    (state.motion === "WALK" || state.motion === "JUMP")
  ) {
    return {
      ...state,
      tick: state.tick + 1,
      velocity: { x: 0, y: 0 },
      motionTicksRemaining: state.motionTicksRemaining - 1,
      actionLatch,
    };
  }

  if (!state.playerMovable) {
    return {
      ...state,
      tick: state.tick + 1,
      velocity: { x: 0, y: 0 },
      motion: "IDLE",
      grounded: state.mode === "SIDE_SCROLL" ? state.grounded : true,
      facing,
      motionTicksRemaining: 0,
      actionLatch,
    };
  }

  const solidAt = (x: number, y: number): boolean =>
    state.playerCollision && isSolidAt(world, cells, x, y);

  if (state.mode === "SIDE_SCROLL") {
    const directionX = (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0);
    velocityX = directionX * SIDE_SPEED;
    velocityY = state.playerGravity
      ? state.velocity.y + SIDE_GRAVITY * PLAYGROUND_DT
      : 0;
    if (state.playerGravity && jumpPressed && state.grounded) {
      velocityY = -SIDE_JUMP_SPEED;
    }
    const wantedX = boundedCoordinate(
      x + velocityX * PLAYGROUND_DT,
      0.2,
      Math.max(0.2, world.width - 1.2),
      world,
    );
    if (!solidAt(wantedX, y)) x = wantedX;
    const wantedY = y + velocityY * PLAYGROUND_DT;
    grounded = false;
    if (!state.playerGravity) {
      y = boundedCoordinate(
        wantedY,
        0.2,
        Math.max(0.2, world.height - 0.2),
        world,
      );
      grounded = true;
    } else if (velocityY >= 0) {
      const landingY = world.solidAt === undefined
        ? state.playerCollision
        ? world.solidCells
          .filter((cell) => Math.abs(cell.x - x) <= 0.75 && cell.y >= y && cell.y <= wantedY + 0.8)
          .sort((left, right) => left.y - right.y)[0]
          ?.y
        : undefined
        : Array.from(
          { length: Math.max(0, Math.ceil(wantedY) - Math.floor(y) + 2) },
          (_, index) => Math.floor(y) + index,
        ).map((candidateY) =>
          solidAt(x, candidateY) ? candidateY : undefined
        ).find((candidateY): candidateY is number => candidateY !== undefined);
      if (landingY !== undefined) {
        y = landingY - 0.7;
        velocityY = 0;
        grounded = true;
      } else y = boundedCoordinate(wantedY, -1, world.height + 1, world);
    } else y = boundedCoordinate(wantedY, -1, world.height + 1, world);
  } else if (state.mode === "UNIFIED" || state.mode === "RPG_4" || state.mode === "RPG_8") {
    // Unified authoring uses a discrete RPG-like board: every simulation
    // Each simulation step advances one cell (including a diagonal cell).
    // Collision is checked atomically first, then falls back to one axis so
    // a corner cannot trap the player against a single solid tile.
    const directionX = (input.right === true ? 1 : 0) -
      (input.left === true ? 1 : 0);
    const directionY = (input.down === true ? 1 : 0) -
      (input.up === true ? 1 : 0);
    const cardinalDirectionY = state.mode === "RPG_4" && directionX !== 0
      ? 0
      : directionY;
    const originX = Math.round(x);
    const originY = Math.round(y);
    x = originX;
    y = originY;
    const wantedX = boundedCoordinate(
      originX + directionX,
      0,
      Math.max(0, world.width - 1),
      world,
    );
    const wantedY = boundedCoordinate(
      originY + cardinalDirectionY,
      0,
      Math.max(0, world.height - 1),
      world,
    );
    const diagonal = directionX !== 0 && cardinalDirectionY !== 0;
    if (state.mode !== "RPG_4" && diagonal && !solidAt(wantedX, wantedY)) {
      x = wantedX;
      y = wantedY;
    } else {
      if (directionX !== 0 && !solidAt(wantedX, originY)) x = wantedX;
      if (cardinalDirectionY !== 0 && !solidAt(x, wantedY)) y = wantedY;
    }
    velocityX = x - previous.x;
    velocityY = y - previous.y;
    grounded = true;
  } else {
    let directionX = (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0);
    let directionY = (input.down === true ? 1 : 0) - (input.up === true ? 1 : 0);
    if (state.mode === "RPG_4" && directionX !== 0 && directionY !== 0) directionY = 0;
    const length = Math.hypot(directionX, directionY) || 1;
    velocityX = directionX / length * RPG_SPEED;
    velocityY = directionY / length * RPG_SPEED;
    const wantedX = boundedCoordinate(
      x + velocityX * PLAYGROUND_DT,
      0.2,
      Math.max(0.2, world.width - 1.2),
      world,
    );
    if (!solidAt(wantedX, y)) x = wantedX;
    const wantedY = boundedCoordinate(
      y + velocityY * PLAYGROUND_DT,
      0.2,
      Math.max(0.2, world.height - 1.2),
      world,
    );
    if (!solidAt(x, wantedY)) y = wantedY;
    grounded = true;
  }

  const playerPosition = { x, y };
  const detectedMotion = !state.grounded && grounded
    ? "LAND"
    : state.mode === "SIDE_SCROLL" && !grounded
    ? "JUMP"
    : x !== previous.x || y !== previous.y
    ? "WALK"
    : "IDLE";
  const oneShotMotion = detectedMotion === "IDLE" &&
      state.motionTicksRemaining > 0 &&
      (state.motion === "JUMP" || state.motion === "LAND" || state.motion === "ATTACK");
  const motion = oneShotMotion ? state.motion : detectedMotion;
  const motionTicksRemaining = oneShotMotion
    ? state.motionTicksRemaining - 1
    : discreteMovement && motion === "WALK"
    ? 3
    : motion === "WALK"
    ? -1
    : motion === "JUMP" || motion === "LAND" || motion === "ATTACK"
    ? 3
    : 0;
  return {
    ...state,
    tick: state.tick + 1,
    playerPosition,
    velocity: { x: velocityX, y: velocityY },
    grounded,
    facing,
    motion,
    motionTicksRemaining,
    cameraX: cameraXFor(state.mode, x, world),
    cameraY: cameraYFor(state.mode, y, world.height, world),
    positions: { ...state.positions, [state.playerId]: playerPosition },
    actionLatch,
  };
}
