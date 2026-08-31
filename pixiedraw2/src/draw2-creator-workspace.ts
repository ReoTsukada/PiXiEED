export const CREATOR_WORKSPACE_MODES = [
  "DRAW",
  "ANIMATE",
  "ASSET",
  "GAME",
  "AUDIO",
  "EXPORT",
] as const;

export type CreatorWorkspaceMode = typeof CREATOR_WORKSPACE_MODES[number];

export type AssetSourceKind =
  | "LAYER_GROUP"
  | "SELECTED_LAYERS"
  | "VISIBLE_COMPOSITE"
  | "ANIMATION_RANGE";

export type CreatorAssetKind =
  | "CHARACTER"
  | "OBJECT"
  | "TILE"
  | "BACKGROUND"
  | "EFFECT";

export type AssetPivot = "CENTER" | "FEET" | "CUSTOM";

export type AssetLayerSelection =
  | { readonly kind: "CURRENT_LAYER"; readonly layerId: string }
  | { readonly kind: "SELECTED_LAYERS"; readonly layerIds: readonly string[] }
  | { readonly kind: "LAYER_GROUP"; readonly groupId: string }
  | { readonly kind: "VISIBLE_LAYERS" };

export type AssetFrameSelection =
  | { readonly kind: "CURRENT_FRAME"; readonly frameId: string }
  | { readonly kind: "RANGE"; readonly startFrameId: string; readonly endFrameId: string }
  | { readonly kind: "TAG"; readonly tagId: string }
  | { readonly kind: "EXPLICIT"; readonly frameIds: readonly string[] };

export type AssetRegionSelection =
  | { readonly kind: "FULL_CANVAS" }
  | { readonly kind: "MANUAL"; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly kind: "GRID"; readonly cellSize: 16 | 32; readonly x: number; readonly y: number; readonly columns: number; readonly rows: number }
  | { readonly kind: "CUSTOM_GRID"; readonly cellWidth: number; readonly cellHeight: number; readonly x: number; readonly y: number; readonly columns: number; readonly rows: number };

export type AssetAnimationName =
  | "IDLE"
  | "IDLE_UP"
  | "IDLE_DOWN"
  | "IDLE_LEFT"
  | "IDLE_RIGHT"
  | "WALK_UP"
  | "WALK_DOWN"
  | "WALK_LEFT"
  | "WALK_RIGHT"
  | "ATTACK"
  | "ATTACK_UP"
  | "ATTACK_DOWN"
  | "ATTACK_LEFT"
  | "ATTACK_RIGHT"
  | "CUSTOM"
  /** Backwards-compatible escape hatch for user-defined animation names. */
  | (string & {});
export type AssetDirectionName =
  | "UP"
  | "DOWN"
  | "LEFT"
  | "RIGHT"
  | "UP_LEFT"
  | "UP_RIGHT"
  | "DOWN_LEFT"
  | "DOWN_RIGHT"
  | (string & {});
export type AssetLoopMode = "LOOP" | "ONCE" | "PING_PONG";

/**
 * One animation frame keeps a live reference to the Draw document.
 * The raster itself is never copied into an Asset definition.
 */
export interface AssetAnimationFrameReference {
  readonly sourceFrameId: string;
  readonly layerIds: readonly string[];
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly durationMs?: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
}

export interface AssetAnimationClip {
  readonly name: AssetAnimationName;
  readonly customName?: string;
  /** Optional hierarchy label. Legacy clips derive this from `name`. */
  readonly motionName?: string;
  /** Optional direction slot. Legacy clips derive this from the name suffix. */
  readonly direction?: AssetDirectionName;
  readonly frameIds: readonly string[];
  readonly loopMode: AssetLoopMode;
  readonly fps?: number;
  /** A live source reference used for mirrored directions; no bitmap is copied. */
  readonly sourceReference?: string;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  /** Per-frame live references into the source Draw document. */
  readonly sourceFrames?: readonly AssetAnimationFrameReference[];
  /** Optional per-frame durations. When omitted, `fps` is used. */
  readonly frameDurationsMs?: readonly number[];
}

export type AssetPivotDefinition =
  | { readonly kind: "CENTER" }
  | { readonly kind: "FEET" }
  | { readonly kind: "CUSTOM"; readonly x: number; readonly y: number };

export interface AssetProtection {
  readonly locked: boolean;
  readonly sourceReadOnly: boolean;
  readonly referencePolicy: "LIVE" | "PINNED" | "REVIEW" | "FORKED";
}

export interface AssetDefinitionMetadata {
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
}

export interface AssetDefinitionDraftInput {
  readonly sourceProjectId: string;
  readonly sourceCanvasId: string;
  readonly sourceKind: AssetSourceKind;
  readonly sourceLayerIds: readonly string[];
  readonly frameStart: number;
  readonly frameEnd: number;
  readonly layerSelection?: AssetLayerSelection;
  readonly frameSelection?: AssetFrameSelection;
  readonly region?: AssetRegionSelection;
  readonly animationMapping?: readonly AssetAnimationClip[];
  readonly assetKind: CreatorAssetKind;
  readonly pivot: AssetPivot;
  readonly pivotDefinition?: AssetPivotDefinition;
  readonly protection?: AssetProtection;
  readonly metadata?: Partial<AssetDefinitionMetadata>;
  readonly dependencyIds?: readonly string[];
}

export interface AssetDefinitionDraft {
  readonly schemaVersion: 1;
  readonly sourceProjectId: string;
  readonly sourceCanvasId: string;
  readonly sourceKind: AssetSourceKind;
  readonly sourceLayerIds: readonly string[];
  readonly frameStart: number;
  readonly frameEnd: number;
  readonly layerSelection: AssetLayerSelection;
  readonly frameSelection: AssetFrameSelection;
  readonly region: AssetRegionSelection;
  readonly animationMapping: readonly AssetAnimationClip[];
  readonly assetKind: CreatorAssetKind;
  readonly pivot: AssetPivot;
  readonly pivotDefinition: AssetPivotDefinition;
  readonly protection: AssetProtection;
  readonly metadata: AssetDefinitionMetadata;
  readonly dependencyIds: readonly string[];
  readonly persistence: "LOCAL_DRAFT";
}

export interface ValidatedAssetDefinition extends Omit<AssetDefinitionDraft, "persistence"> {
  readonly persistence: "VALIDATED_DEFINITION";
}

export interface RegisteredAssetDefinition extends Omit<AssetDefinitionDraft, "persistence"> {
  readonly persistence: "REGISTERED_ASSET";
  readonly assetId: string;
  readonly revisionId: string;
}

export type AnyAssetDefinition = AssetDefinitionDraft | ValidatedAssetDefinition | RegisteredAssetDefinition;

export type AssetDefinitionResult =
  | { readonly ok: true; readonly value: AssetDefinitionDraft }
  | { readonly ok: false; readonly code: "INVALID_ASSET_DRAFT"; readonly message: string };

export type AssetDefinitionValidationResult =
  | { readonly ok: true; readonly value: ValidatedAssetDefinition }
  | { readonly ok: false; readonly code: "INVALID_ASSET_DEFINITION"; readonly message: string };

export interface AssetDirtyRegion {
  readonly sourceProjectId: string;
  readonly sourceCanvasId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AssetDefinitionBinding {
  readonly definitionId: string;
  readonly definition: AnyAssetDefinition;
}

export interface CreatorWorkspaceState {
  readonly schemaVersion: 1;
  readonly activeMode: CreatorWorkspaceMode;
  readonly assetDraft?: AssetDefinitionDraft;
}

export function createCreatorWorkspaceState(): CreatorWorkspaceState {
  return { schemaVersion: 1, activeMode: "DRAW" };
}

export function isCreatorWorkspaceMode(value: string): value is CreatorWorkspaceMode {
  return (CREATOR_WORKSPACE_MODES as readonly string[]).includes(value);
}

export function transitionCreatorWorkspaceMode(
  state: CreatorWorkspaceState,
  mode: CreatorWorkspaceMode,
): CreatorWorkspaceState {
  return { ...state, activeMode: mode };
}

function isAssetSourceKind(value: string): value is AssetSourceKind {
  return ["LAYER_GROUP", "SELECTED_LAYERS", "VISIBLE_COMPOSITE", "ANIMATION_RANGE"].includes(value);
}

function isCreatorAssetKind(value: string): value is CreatorAssetKind {
  return ["CHARACTER", "OBJECT", "TILE", "BACKGROUND", "EFFECT"].includes(value);
}

function isAssetAnimationName(value: string): value is AssetAnimationName {
  return value.trim().length > 0 && value.length <= 128;
}

function isAssetPivot(value: string): value is AssetPivot {
  return ["CENTER", "FEET", "CUSTOM"].includes(value);
}

function normalizeReferences(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))].sort();
}

function normalizeOrderedReferences(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeAnimationFrameReferences(
  values: readonly AssetAnimationFrameReference[] | undefined,
): AssetAnimationFrameReference[] | undefined {
  if (values === undefined) return undefined;
  return values.map((frame) => ({
    sourceFrameId: frame.sourceFrameId.trim(),
    layerIds: normalizeReferences(frame.layerIds),
    rect: {
      x: Math.round(frame.rect.x),
      y: Math.round(frame.rect.y),
      width: Math.round(frame.rect.width),
      height: Math.round(frame.rect.height),
    },
    ...(frame.durationMs === undefined
      ? {}
      : { durationMs: Math.round(frame.durationMs) }),
    ...(frame.flipX === undefined ? {} : { flipX: frame.flipX }),
    ...(frame.flipY === undefined ? {} : { flipY: frame.flipY }),
  }));
}

function normalizeMetadata(metadata: Partial<AssetDefinitionMetadata> | undefined, assetKind: CreatorAssetKind): AssetDefinitionMetadata {
  return {
    name: (metadata?.name ?? `${assetKind.toLowerCase()}-draft`).trim(),
    description: (metadata?.description ?? "").trim(),
    tags: normalizeReferences(metadata?.tags),
  };
}

function normalizeLayerSelection(input: AssetDefinitionDraftInput, sourceLayerIds: readonly string[]): AssetLayerSelection {
  const selection = input.layerSelection;
  if (selection?.kind === "CURRENT_LAYER") return { kind: "CURRENT_LAYER", layerId: selection.layerId.trim() };
  if (selection?.kind === "SELECTED_LAYERS") return { kind: "SELECTED_LAYERS", layerIds: normalizeReferences(selection.layerIds) };
  if (selection?.kind === "LAYER_GROUP") return { kind: "LAYER_GROUP", groupId: selection.groupId.trim() };
  if (selection?.kind === "VISIBLE_LAYERS") return { kind: "VISIBLE_LAYERS" };
  if (input.sourceKind === "LAYER_GROUP" && sourceLayerIds[0] !== undefined) {
    return { kind: "LAYER_GROUP", groupId: sourceLayerIds[0] };
  }
  if (input.sourceKind === "VISIBLE_COMPOSITE") return { kind: "VISIBLE_LAYERS" };
  return { kind: "SELECTED_LAYERS", layerIds: sourceLayerIds };
}

function normalizeFrameSelection(selection: AssetFrameSelection | undefined): AssetFrameSelection | undefined {
  if (selection === undefined) return undefined;
  if (selection.kind === "CURRENT_FRAME") return { kind: "CURRENT_FRAME", frameId: selection.frameId.trim() };
  if (selection.kind === "RANGE") return { kind: "RANGE", startFrameId: selection.startFrameId.trim(), endFrameId: selection.endFrameId.trim() };
  if (selection.kind === "TAG") return { kind: "TAG", tagId: selection.tagId.trim() };
  return { kind: "EXPLICIT", frameIds: normalizeReferences(selection.frameIds) };
}

function normalizeAnimationMapping(mapping: readonly AssetAnimationClip[]): AssetAnimationClip[] {
  return mapping.map((clip) => {
    const sourceFrames = normalizeAnimationFrameReferences(clip.sourceFrames);
    const frameIds = sourceFrames === undefined
      ? normalizeOrderedReferences(clip.frameIds)
      : clip.frameIds.map((frameId) => frameId.trim()).filter((frameId) =>
        frameId.length > 0
      );
    return {
      name: clip.name,
      ...(clip.customName === undefined ? {} : { customName: clip.customName.trim() }),
      ...(clip.motionName === undefined ? {} : { motionName: clip.motionName.trim() }),
      ...(clip.direction === undefined ? {} : { direction: clip.direction.trim() as AssetDirectionName }),
      frameIds,
      loopMode: clip.loopMode,
      ...(clip.fps === undefined ? {} : { fps: clip.fps }),
      ...(clip.sourceReference === undefined ? {} : { sourceReference: clip.sourceReference.trim() }),
      ...(clip.flipX === undefined ? {} : { flipX: clip.flipX }),
      ...(clip.flipY === undefined ? {} : { flipY: clip.flipY }),
      ...(sourceFrames === undefined ? {} : { sourceFrames }),
      ...(clip.frameDurationsMs === undefined
        ? {}
        : { frameDurationsMs: clip.frameDurationsMs.map((duration) => Math.round(duration)) }),
    };
  });
}

const LEGACY_DIRECTION_SUFFIXES = [
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "UP_LEFT",
  "UP_RIGHT",
  "DOWN_LEFT",
  "DOWN_RIGHT",
] as const;

/** Returns the Motion label used by the hierarchical Asset editor. */
export function assetAnimationMotionName(clip: Pick<AssetAnimationClip, "name" | "customName" | "motionName">): string {
  const explicit = clip.motionName?.trim();
  if (explicit !== undefined && explicit.length > 0) return explicit;
  const custom = clip.customName?.trim();
  if (clip.name === "CUSTOM" && custom !== undefined && custom.length > 0) return custom;
  const separator = clip.name.lastIndexOf("_");
  const suffix = separator > 0 ? clip.name.slice(separator + 1) : "";
  return LEGACY_DIRECTION_SUFFIXES.includes(suffix as typeof LEGACY_DIRECTION_SUFFIXES[number])
    ? clip.name.slice(0, separator)
    : clip.name;
}

/** Returns a legacy-compatible Direction label, or undefined for a directionless clip. */
export function assetAnimationDirectionName(clip: Pick<AssetAnimationClip, "name" | "direction">): AssetDirectionName | undefined {
  const explicit = clip.direction?.trim();
  if (explicit !== undefined && explicit.length > 0) return explicit;
  const separator = clip.name.lastIndexOf("_");
  const suffix = separator > 0 ? clip.name.slice(separator + 1) : "";
  return LEGACY_DIRECTION_SUFFIXES.includes(suffix as typeof LEGACY_DIRECTION_SUFFIXES[number])
    ? suffix as AssetDirectionName
    : undefined;
}

/** Stable key for one Motion + Direction slot. */
export function assetAnimationClipKey(clip: Pick<AssetAnimationClip, "name" | "customName" | "motionName" | "direction">): string {
  return `${assetAnimationMotionName(clip)}::${assetAnimationDirectionName(clip) ?? "DEFAULT"}`;
}

function normalizePivotDefinition(input: AssetDefinitionDraftInput): AssetPivotDefinition {
  if (input.pivotDefinition !== undefined) return input.pivotDefinition;
  if (input.pivot === "CUSTOM") return { kind: "CUSTOM", x: 0, y: 0 };
  return { kind: input.pivot };
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isFiniteInteger(value: number): boolean {
  return Number.isSafeInteger(value);
}

function isValidLayerSelection(selection: AssetLayerSelection): boolean {
  if (selection.kind === "CURRENT_LAYER") return selection.layerId.trim().length > 0;
  if (selection.kind === "LAYER_GROUP") return selection.groupId.trim().length > 0;
  if (selection.kind === "SELECTED_LAYERS") return normalizeReferences(selection.layerIds).length > 0;
  return selection.kind === "VISIBLE_LAYERS";
}

function isValidFrameSelection(selection: AssetFrameSelection): boolean {
  if (selection.kind === "CURRENT_FRAME") return selection.frameId.trim().length > 0;
  if (selection.kind === "RANGE") return selection.startFrameId.trim().length > 0 && selection.endFrameId.trim().length > 0;
  if (selection.kind === "TAG") return selection.tagId.trim().length > 0;
  return selection.frameIds.length > 0 && normalizeReferences(selection.frameIds).length === selection.frameIds.length;
}

function isValidRegionSelection(region: AssetRegionSelection): boolean {
  if (region.kind === "FULL_CANVAS") return true;
  if (![region.x, region.y].every(isFiniteInteger) || region.x < 0 || region.y < 0) return false;
  if (region.kind === "MANUAL") return isPositiveInteger(region.width) && isPositiveInteger(region.height);
  if (region.kind === "GRID") return (region.cellSize === 16 || region.cellSize === 32) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
  return isPositiveInteger(region.cellWidth) && isPositiveInteger(region.cellHeight) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
}

function isValidAnimationMapping(mapping: readonly AssetAnimationClip[]): boolean {
  const seenKeys = new Set<string>();
  return mapping.every((clip) => {
    const motionName = assetAnimationMotionName(clip).trim();
    const direction = assetAnimationDirectionName(clip);
    const key = assetAnimationClipKey(clip);
    const hasSourceFrames = clip.sourceFrames !== undefined;
    const normalizedFrameIds = clip.frameIds
      .map((frameId) => frameId.trim())
      .filter((frameId) => frameId.length > 0);
    if (
      !isAssetAnimationName(clip.name) ||
      motionName.length === 0 ||
      seenKeys.has(key) ||
      clip.frameIds.length === 0 ||
      normalizedFrameIds.length !== clip.frameIds.length ||
      (!hasSourceFrames &&
        normalizeOrderedReferences(clip.frameIds).length !==
          clip.frameIds.length)
    ) return false;
    seenKeys.add(key);
    if (clip.name === "CUSTOM" && (clip.customName ?? "").trim().length === 0) return false;
    if (clip.motionName !== undefined && clip.motionName.trim().length === 0) return false;
    if (direction !== undefined && direction.trim().length === 0) return false;
    if (clip.sourceReference !== undefined && clip.sourceReference.trim().length === 0) return false;
    if (clip.flipX !== undefined && typeof clip.flipX !== "boolean") return false;
    if (clip.flipY !== undefined && typeof clip.flipY !== "boolean") return false;
    if (clip.sourceFrames !== undefined && (
      clip.sourceFrames.length !== clip.frameIds.length
      || clip.sourceFrames.some((frame) =>
        frame.sourceFrameId.trim().length === 0
        || normalizeReferences(frame.layerIds).length === 0
        || !Number.isSafeInteger(frame.rect.x)
        || !Number.isSafeInteger(frame.rect.y)
        || frame.rect.x < 0
        || frame.rect.y < 0
        || !isPositiveInteger(frame.rect.width)
        || !isPositiveInteger(frame.rect.height)
        || (frame.durationMs !== undefined && (!Number.isFinite(frame.durationMs) || frame.durationMs <= 0))
        || (frame.flipX !== undefined && typeof frame.flipX !== "boolean")
        || (frame.flipY !== undefined && typeof frame.flipY !== "boolean")
      )
    )) return false;
    if (clip.frameDurationsMs !== undefined && (
      clip.frameDurationsMs.length !== clip.frameIds.length
      || clip.frameDurationsMs.some((duration) => !Number.isFinite(duration) || duration <= 0)
    )) return false;
    return ["LOOP", "ONCE", "PING_PONG"].includes(clip.loopMode)
      && (clip.fps === undefined || (Number.isFinite(clip.fps) && clip.fps > 0));
  });
}

function isValidPivotDefinition(pivot: AssetPivotDefinition): boolean {
  return pivot.kind !== "CUSTOM" || [pivot.x, pivot.y].every(Number.isFinite);
}

function isValidProtection(protection: AssetProtection): boolean {
  return typeof protection.locked === "boolean"
    && protection.sourceReadOnly === true
    && ["LIVE", "PINNED", "REVIEW", "FORKED"].includes(protection.referencePolicy);
}

function isValidDefinition(definition: AssetDefinitionDraft): boolean {
  const validFrames = isPositiveInteger(definition.frameStart) && isPositiveInteger(definition.frameEnd)
    && definition.frameEnd >= definition.frameStart;
  return definition.sourceProjectId.length > 0
    && definition.sourceProjectId === definition.sourceProjectId.trim()
    && definition.sourceCanvasId.length > 0
    && definition.sourceCanvasId === definition.sourceCanvasId.trim()
    && validFrames
    && isAssetSourceKind(definition.sourceKind)
    && isCreatorAssetKind(definition.assetKind)
    && isAssetPivot(definition.pivot)
    && isValidLayerSelection(definition.layerSelection)
    && isValidFrameSelection(definition.frameSelection)
    && isValidRegionSelection(definition.region)
    && isValidAnimationMapping(definition.animationMapping)
    && isValidPivotDefinition(definition.pivotDefinition)
    && isValidProtection(definition.protection)
    && definition.metadata.name.length > 0;
}

export function createAssetDefinitionDraft(input: AssetDefinitionDraftInput): AssetDefinitionResult {
  const sourceProjectId = input.sourceProjectId.trim();
  const sourceCanvasId = input.sourceCanvasId.trim();
  const sourceLayerIds = normalizeReferences(input.sourceLayerIds);
  const dependencyIds = normalizeReferences(input.dependencyIds);
  const layerSelection = normalizeLayerSelection(input, sourceLayerIds);
  const frameSelection = normalizeFrameSelection(input.frameSelection);
  const region = input.region ?? { kind: "FULL_CANVAS" };
  const animationMapping = normalizeAnimationMapping(input.animationMapping ?? []);
  const pivotDefinition = normalizePivotDefinition(input);
  const protection = input.protection ?? { locked: false, sourceReadOnly: true, referencePolicy: "LIVE" as const };
  const metadata = normalizeMetadata(input.metadata, input.assetKind);
  const validFrames = Number.isInteger(input.frameStart) && Number.isInteger(input.frameEnd)
    && input.frameStart > 0 && input.frameEnd >= input.frameStart;
  if (
    sourceProjectId.length === 0
    || sourceCanvasId.length === 0
    || !isAssetSourceKind(input.sourceKind)
    || !isCreatorAssetKind(input.assetKind)
    || !isAssetPivot(input.pivot)
    || !validFrames
    || frameSelection === undefined
    || !isValidLayerSelection(layerSelection)
    || !isValidFrameSelection(frameSelection)
    || !isValidRegionSelection(region)
    || !isValidAnimationMapping(animationMapping)
    || !isValidPivotDefinition(pivotDefinition)
    || !isValidProtection(protection)
    || metadata.name.length === 0
  ) {
    return {
      ok: false,
      code: "INVALID_ASSET_DRAFT",
      message: "Project、Source、Type、Pivot、Frame範囲を確認してください。",
    };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      sourceProjectId,
      sourceCanvasId,
      sourceKind: input.sourceKind,
      sourceLayerIds,
      frameStart: input.frameStart,
      frameEnd: input.frameEnd,
      layerSelection,
      frameSelection,
      region,
      animationMapping,
      assetKind: input.assetKind,
      pivot: input.pivot,
      pivotDefinition,
      protection,
      metadata,
      dependencyIds,
      persistence: "LOCAL_DRAFT",
    },
  };
}

export function validateAssetDefinitionDraft(draft: AssetDefinitionDraft): AssetDefinitionValidationResult {
  if (draft.persistence !== "LOCAL_DRAFT" || !isValidDefinition(draft)) {
    return {
      ok: false,
      code: "INVALID_ASSET_DEFINITION",
      message: "Asset定義の参照、範囲、メタデータ、保護設定を確認してください。",
    };
  }
  return { ok: true, value: { ...draft, persistence: "VALIDATED_DEFINITION" } };
}

export function canCrossToolConsumeAsset(definition: AnyAssetDefinition): definition is RegisteredAssetDefinition {
  return definition.persistence === "REGISTERED_ASSET"
    && definition.assetId.trim().length > 0
    && definition.revisionId.trim().length > 0;
}

function regionBounds(region: AssetRegionSelection): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined {
  if (region.kind === "FULL_CANVAS") return undefined;
  if (region.kind === "MANUAL") return region;
  if (region.kind === "GRID") return { x: region.x, y: region.y, width: region.cellSize * region.columns, height: region.cellSize * region.rows };
  return { x: region.x, y: region.y, width: region.cellWidth * region.columns, height: region.cellHeight * region.rows };
}

function intersects(a: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, b: AssetDirtyRegion): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function findAffectedAssetDefinitions(
  bindings: readonly AssetDefinitionBinding[],
  dirtyRegion: AssetDirtyRegion,
): string[] {
  if (dirtyRegion.width <= 0 || dirtyRegion.height <= 0) return [];
  return bindings
    .filter(({ definition }) => definition.sourceProjectId === dirtyRegion.sourceProjectId && definition.sourceCanvasId === dirtyRegion.sourceCanvasId)
    .filter(({ definition }) => {
      const bounds = regionBounds(definition.region);
      return bounds === undefined || intersects(bounds, dirtyRegion);
    })
    .map(({ definitionId }) => definitionId)
    .sort();
}
