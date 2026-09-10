import type { GamePlaygroundConfig, GamePlaygroundAudioRange, GamePlaygroundReferenceMode } from "./playground.ts";
import type { AudioCaptureDraft } from "./audio-capture-session.ts";
import { isDpcmSampleReference, type DpcmSampleReference } from "../../audio/audio-240/dpcm.ts";

export type GameAudioAssetKind = "BGM" | "SE" | "VOICE";
export interface GameAudioSourceReference {
  readonly projectId: string;
  readonly projectRevision: number;
  readonly projectStateHash: string;
  readonly trackIds: readonly string[];
  readonly startTick: number;
  readonly durationTick: number;
  readonly renderMode: "POST_MIX";
  readonly mode: GamePlaygroundReferenceMode;
}
export interface GameAudioAsset {
  readonly audioAssetId: string;
  readonly name: string;
  readonly kind: GameAudioAssetKind;
  readonly source: GameAudioSourceReference;
  /** Optional Famicom DPCM slice reference; PCM bytes remain owned by iAUDIO. */
  readonly dpcm?: DpcmSampleReference;
  readonly defaults: { readonly gainMilliDb: number; readonly loop: boolean; readonly retrigger: "RESTART" | "IGNORE" | "OVERLAP" };
}

/** Attach a validated DPCM slice without mutating the existing Game asset. */
export function attachDpcmReferenceToGameAudioAsset(
  asset: GameAudioAsset,
  reference: DpcmSampleReference,
): GameAudioAsset | undefined {
  return isDpcmSampleReference(reference) ? { ...asset, dpcm: { ...reference } } : undefined;
}

/** Build an event-ready Game asset from an iAUDIO capture and a DPCM slice. */
export function gameAudioAssetWithDpcmFromCaptureDraft(
  draft: AudioCaptureDraft,
  reference: DpcmSampleReference,
): GameAudioAsset | undefined {
  return attachDpcmReferenceToGameAudioAsset(gameAudioAssetFromCaptureDraft(draft), reference);
}
export type GameAudioTarget =
  | { readonly kind: "SCENE_BGM"; readonly sceneId: string }
  | { readonly kind: "OBJECT_TRIGGER"; readonly placementId: string; readonly trigger: "JUMP" | "LAND" | "MOVE" | "ATTACK" | "INTERACT" }
  | { readonly kind: "ANIMATION_MARKER"; readonly clipId: string; readonly phase: "START" | "FRAME" | "LOOP" | "END"; readonly frameIndex?: number }
  | { readonly kind: "TILE_STEP"; readonly assetId: string; readonly tileTag?: string }
  | { readonly kind: "EVENT"; readonly eventId: string };
export interface GameAudioBinding {
  readonly bindingId: string;
  readonly audioAssetId: string;
  readonly target: GameAudioTarget;
  readonly priority: number;
}

export type GameRuntimeMotion = "IDLE" | "WALK" | "JUMP" | "LAND" | "ATTACK";

/** Convert one runtime motion into the canonical object-audio trigger. */
export function gameAudioTargetForMotion(input: {
  readonly placementId: string;
  readonly motion: GameRuntimeMotion;
}): GameAudioTarget | undefined {
  const trigger = input.motion === "JUMP"
    ? "JUMP"
    : input.motion === "LAND"
    ? "LAND"
    : input.motion === "ATTACK"
    ? "ATTACK"
    : input.motion === "WALK"
    ? "MOVE"
    : undefined;
  return trigger === undefined
    ? undefined
    : { kind: "OBJECT_TRIGGER", placementId: input.placementId, trigger };
}

/** Convert a selected project range to seconds relative to its source clip. */
export function gameAudioRelativeStartSeconds(input: {
  readonly rangeStartTick: number;
  readonly clipStartTick: number;
  readonly ticksPerQuarter: number;
  readonly bpm: number;
}): number {
  if (!Number.isFinite(input.ticksPerQuarter) || input.ticksPerQuarter <= 0 || !Number.isFinite(input.bpm) || input.bpm <= 0) return 0;
  return Math.max(0, input.rangeStartTick - input.clipStartTick) / input.ticksPerQuarter * 60 / input.bpm;
}
export interface GameAudioLegacyEntry {
  readonly legacyId: string;
  readonly reason: string;
  readonly projectId?: string;
  readonly trackId?: string;
  readonly clipId?: string;
  readonly startTick?: number;
  readonly durationTick?: number;
  readonly label?: string;
}
export type GameAudioCommitResult = "CREATED" | "UPDATED" | "REUSED" | "BOUND" | "UNCHANGED" | "SOURCE_CHANGED" | "REJECTED";
export interface GameAudioCommitInput {
  readonly config: GamePlaygroundConfig;
  readonly asset?: GameAudioAsset;
  readonly target?: GameAudioTarget;
  readonly expectedProjectRevision: number;
  readonly expectedProjectStateHash: string;
  readonly currentProjectRevision: number;
  readonly currentProjectStateHash: string;
  readonly commitId: string;
}
export interface GameAudioCommitOutput {
  readonly result: GameAudioCommitResult;
  readonly config: GamePlaygroundConfig;
  readonly audioAssetId?: string;
  readonly saveCount: 0 | 1;
}

/** Build the Game-owned metadata pointer for one validated iAUDIO selection. */
export function gameAudioAssetFromCaptureDraft(
  draft: AudioCaptureDraft,
): GameAudioAsset {
  const source: GameAudioSourceReference = {
    projectId: draft.projectId,
    projectRevision: draft.projectRevision,
    projectStateHash: draft.projectStateHash,
    trackIds: [...draft.trackIds],
    startTick: draft.startTick,
    durationTick: draft.durationTick,
    renderMode: "POST_MIX",
    mode: draft.mode,
  };
  return {
    audioAssetId: gameAudioAssetIdForSource(source),
    name: draft.label,
    kind: draft.kind,
    source,
    defaults: {
      gainMilliDb: 0,
      loop: draft.kind === "BGM",
      retrigger: draft.kind === "BGM" ? "RESTART" : "OVERLAP",
    },
  };
}

function targetAcceptsAudioKind(
  target: GameAudioTarget,
  kind: GameAudioAssetKind,
): boolean {
  return target.kind === "SCENE_BGM" ? kind === "BGM" : kind !== "BGM";
}

function stableSemanticKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSemanticKey).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSemanticKey(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalTrackIds(trackIds: readonly string[]): string[] {
  return [...new Set(trackIds)].sort();
}

const sourceKey = (source: GameAudioSourceReference): string => stableSemanticKey({
  projectId: source.projectId,
  projectRevision: source.projectRevision,
  projectStateHash: source.projectStateHash,
  trackIds: canonicalTrackIds(source.trackIds),
  startTick: source.startTick,
  durationTick: source.durationTick,
  renderMode: source.renderMode,
  mode: source.mode,
});

const targetKey = (target: GameAudioTarget): string => stableSemanticKey(target);

const AUDIO_TARGET_KINDS = new Set([
  "SCENE_BGM",
  "OBJECT_TRIGGER",
  "ANIMATION_MARKER",
  "TILE_STEP",
  "EVENT",
]);
const AUDIO_TARGET_KEYS = {
  SCENE_BGM: new Set(["kind", "sceneId"]),
  OBJECT_TRIGGER: new Set(["kind", "placementId", "trigger"]),
  ANIMATION_MARKER: new Set(["kind", "clipId", "phase", "frameIndex"]),
  TILE_STEP: new Set(["kind", "assetId", "tileTag"]),
  EVENT: new Set(["kind", "eventId"]),
} as const;
const AUDIO_ASSET_KEYS = new Set(["audioAssetId", "name", "kind", "source", "dpcm", "defaults"]);
const AUDIO_SOURCE_KEYS = new Set(["projectId", "projectRevision", "projectStateHash", "trackIds", "startTick", "durationTick", "renderMode", "mode"]);
const AUDIO_DEFAULT_KEYS = new Set(["gainMilliDb", "loop", "retrigger"]);
const DPCM_KEYS = new Set(["sampleId", "sourceRevisionId", "startFrame", "frameCount", "rateHz", "loop"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isValidDpcmReference(value: unknown): value is DpcmSampleReference {
  return isRecord(value) && hasOnlyKeys(value, DPCM_KEYS) && isDpcmSampleReference(value);
}

function isValidGameAudioTarget(value: unknown): value is GameAudioTarget {
  if (!isRecord(value) || typeof value.kind !== "string" || !AUDIO_TARGET_KINDS.has(value.kind)) return false;
  if (!hasOnlyKeys(value, AUDIO_TARGET_KEYS[value.kind as keyof typeof AUDIO_TARGET_KEYS])) return false;
  switch (value.kind) {
    case "SCENE_BGM": return typeof value.sceneId === "string" && value.sceneId.trim().length > 0;
    case "OBJECT_TRIGGER": return typeof value.placementId === "string" && value.placementId.trim().length > 0 && ["JUMP", "LAND", "MOVE", "ATTACK", "INTERACT"].includes(value.trigger as string);
    case "ANIMATION_MARKER": return typeof value.clipId === "string" && value.clipId.trim().length > 0 && ["START", "FRAME", "LOOP", "END"].includes(value.phase as string) && (value.frameIndex === undefined || (typeof value.frameIndex === "number" && Number.isSafeInteger(value.frameIndex) && value.frameIndex >= 0));
    case "TILE_STEP": return typeof value.assetId === "string" && value.assetId.trim().length > 0 && (value.tileTag === undefined || typeof value.tileTag === "string");
    case "EVENT": return typeof value.eventId === "string" && value.eventId.trim().length > 0;
  }
  return false;
}

function isValidGameAudioAsset(value: unknown): value is GameAudioAsset {
  if (!isRecord(value) || !hasOnlyKeys(value, AUDIO_ASSET_KEYS)) return false;
  const source = value.source;
  const defaults = value.defaults;
  const projectRevision = isRecord(source) ? source.projectRevision : undefined;
  const startTick = isRecord(source) ? source.startTick : undefined;
  const durationTick = isRecord(source) ? source.durationTick : undefined;
  return typeof value.audioAssetId === "string" && value.audioAssetId.trim().length > 0 &&
    typeof value.name === "string" && value.name.trim().length > 0 &&
    ["BGM", "SE", "VOICE"].includes(value.kind as string) &&
    isRecord(source) && hasOnlyKeys(source, AUDIO_SOURCE_KEYS) &&
    typeof source.projectId === "string" && source.projectId.trim().length > 0 &&
    typeof projectRevision === "number" && Number.isSafeInteger(projectRevision) && projectRevision >= 0 &&
    typeof source.projectStateHash === "string" && source.projectStateHash.trim().length > 0 &&
    Array.isArray(source.trackIds) && source.trackIds.length <= 32 && source.trackIds.every((id) => typeof id === "string") &&
    typeof startTick === "number" && Number.isSafeInteger(startTick) && startTick >= 0 &&
    typeof durationTick === "number" && Number.isSafeInteger(durationTick) && durationTick > 0 &&
    source.renderMode === "POST_MIX" && ["LIVE", "PINNED"].includes(source.mode as string) &&
    isRecord(defaults) && hasOnlyKeys(defaults, AUDIO_DEFAULT_KEYS) &&
    typeof defaults.gainMilliDb === "number" && Number.isFinite(defaults.gainMilliDb) &&
    typeof defaults.loop === "boolean" && ["RESTART", "IGNORE", "OVERLAP"].includes(defaults.retrigger as string) &&
    (value.dpcm === undefined || isValidDpcmReference(value.dpcm));
}

function cloneGameAudioAsset(asset: GameAudioAsset): GameAudioAsset {
  return {
    ...asset,
    source: { ...asset.source, trackIds: [...asset.source.trackIds] },
    ...(asset.dpcm === undefined ? {} : { dpcm: { ...asset.dpcm } }),
    defaults: { ...asset.defaults },
  };
}

function cloneGameAudioBinding(binding: GameAudioBinding): GameAudioBinding {
  return { ...binding, target: { ...binding.target } };
}

function withCanonicalAudioCollections(
  config: GamePlaygroundConfig,
  audioAssets: readonly GameAudioAsset[] = config.audioAssets ?? [],
  audioBindings: readonly GameAudioBinding[] = config.audioBindings ?? [],
  compatibilityAudio?: readonly GamePlaygroundAudioRange[],
): GamePlaygroundConfig {
  const copied = {
    ...config,
    audioAssets: audioAssets.map(cloneGameAudioAsset),
    audioBindings: audioBindings.map(cloneGameAudioBinding),
    ...(config.dpcmSamples === undefined ? {} : { dpcmSamples: config.dpcmSamples.map((sample) => ({ ...sample })) }),
  } as GamePlaygroundConfig;
  const legacyAudio = compatibilityAudio === undefined ? Object.getOwnPropertyDescriptor(config, "audio") : undefined;
  if (compatibilityAudio !== undefined) {
    Object.defineProperty(copied, "audio", {
      configurable: true,
      enumerable: false,
      get: () => compatibilityAudio.map((range) => ({ ...range })),
    });
  } else if (legacyAudio !== undefined) Object.defineProperty(copied, "audio", legacyAudio);
  return copied;
}

export function audioAssetSourceEquals(a: GameAudioSourceReference, b: GameAudioSourceReference): boolean { return sourceKey(a) === sourceKey(b); }
export function gameAudioTargetEquals(a: GameAudioTarget, b: GameAudioTarget): boolean { return targetKey(a) === targetKey(b); }
export function gameAudioAssetEquals(a: GameAudioAsset, b: GameAudioAsset): boolean {
  return a.kind === b.kind && audioAssetSourceEquals(a.source, b.source) &&
    a.name === b.name &&
    stableSemanticKey(a.defaults) === stableSemanticKey(b.defaults) &&
    stableSemanticKey(a.dpcm ?? null) === stableSemanticKey(b.dpcm ?? null);
}

function gameAudioAssetContentEquals(a: GameAudioAsset, b: GameAudioAsset): boolean {
  return a.kind === b.kind && audioAssetSourceEquals(a.source, b.source) &&
    stableSemanticKey(a.dpcm ?? null) === stableSemanticKey(b.dpcm ?? null);
}
export function gameAudioAssetIdForSource(source: GameAudioSourceReference): string {
  let hash = 2166136261;
  for (const char of sourceKey(source)) { hash ^= char.codePointAt(0) ?? 0; hash = Math.imul(hash, 16777619); }
  return `game-audio:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function commitGameAudioTransaction(input: GameAudioCommitInput): GameAudioCommitOutput {
  if (input.asset === undefined || !isValidGameAudioAsset(input.asset) || (input.target !== undefined && !isValidGameAudioTarget(input.target))) return { result: "REJECTED", config: withCanonicalAudioCollections(input.config), saveCount: 0 };
  if (input.commitId.trim().length === 0 || input.expectedProjectRevision !== input.currentProjectRevision || input.expectedProjectStateHash !== input.currentProjectStateHash) return { result: "SOURCE_CHANGED", config: withCanonicalAudioCollections(input.config), saveCount: 0 };
  const assetInput = input.asset;
  if (input.target !== undefined && !targetAcceptsAudioKind(input.target, assetInput.kind)) return { result: "REJECTED", config: withCanonicalAudioCollections(input.config), saveCount: 0 };
  const assets = [...(input.config.audioAssets ?? [])];
  const bindings = [...(input.config.audioBindings ?? [])];
  const requestedAssetId = assetInput.audioAssetId || gameAudioAssetIdForSource(assetInput.source);
  const sameId = assets.find((item) => item.audioAssetId === requestedAssetId);
  const collidingKind = sameId !== undefined && sameId.kind !== assetInput.kind;
  const duplicate = sameId === undefined && !collidingKind
    ? assets.find((item) => gameAudioAssetContentEquals(item, assetInput))
    : undefined;
  const audioAssetId = duplicate?.audioAssetId ?? (collidingKind ? `${requestedAssetId}:${assetInput.kind.toLowerCase()}` : requestedAssetId);
  const existing = sameId !== undefined && !collidingKind
    ? sameId
    : assets.find((item) => item.audioAssetId === audioAssetId);
  const nextAsset = duplicate ?? { ...cloneGameAudioAsset(assetInput), audioAssetId };
  let nextAssets = assets;
  let result: GameAudioCommitResult = existing === undefined ? "CREATED" : "REUSED";
  let assetChanged = false;
  let bindingChanged = false;
  if (existing === undefined) {
    nextAssets = [...assets, nextAsset];
    assetChanged = true;
  } else if (!gameAudioAssetEquals(existing, assetInput)) {
    nextAssets = assets.map((item) => item.audioAssetId === audioAssetId
      ? { ...cloneGameAudioAsset(assetInput), audioAssetId }
      : item);
    result = "UPDATED";
    assetChanged = true;
  }
  if (input.target !== undefined) {
    const targetBindings = bindings.filter((binding) => gameAudioTargetEquals(binding.target, input.target!));
    const same = targetBindings.length === 1 && targetBindings[0]?.audioAssetId === audioAssetId;
    if (!same || targetBindings.length !== 1) {
      const replacement: GameAudioBinding = {
        bindingId: targetBindings[0]?.bindingId ?? `binding:${audioAssetId}:${bindings.length + 1}`,
        audioAssetId,
        target: { ...input.target },
        priority: targetBindings[0]?.priority ?? 0,
      };
      let inserted = false;
      const nextBindings: GameAudioBinding[] = [];
      for (const binding of bindings) {
        if (!gameAudioTargetEquals(binding.target, input.target!)) {
          nextBindings.push(binding);
        } else if (!inserted) {
          nextBindings.push(replacement);
          inserted = true;
        }
      }
      if (!inserted) nextBindings.push(replacement);
      bindings.splice(0, bindings.length, ...nextBindings);
      bindingChanged = true;
    } else if (!assetChanged) {
      result = "UNCHANGED";
    }
  }
  const changed = assetChanged || bindingChanged;
  return { result, audioAssetId, config: withCanonicalAudioCollections(input.config, nextAssets, bindings), saveCount: changed ? 1 : 0 };
}

function legacyRangeTarget(range: GamePlaygroundAudioRange): GameAudioTarget {
  const event = range.event ?? (range.role === "BGM" ? "BACKGROUND_MUSIC" : range.role === "JUMP" ? "PLAYER_JUMP" : "PLAYER_MOVE");
  return event === "BACKGROUND_MUSIC"
    ? { kind: "SCENE_BGM", sceneId: "scene:main" }
    : event === "TILE_STEP"
    ? { kind: "TILE_STEP", assetId: range.targetPlacementId ?? "world" }
    : { kind: "OBJECT_TRIGGER", placementId: range.targetPlacementId ?? "player", trigger: event === "PLAYER_JUMP" ? "JUMP" : event === "PLAYER_LAND" ? "LAND" : event === "PLAYER_ATTACK" ? "ATTACK" : event === "PLAYER_MOVE" ? "MOVE" : "INTERACT" };
}

/** Remove the single target slot without removing its reusable asset library. */
export function clearGameAudioTarget(
  config: GamePlaygroundConfig,
  target: GameAudioTarget,
): GamePlaygroundConfig {
  if (!isValidGameAudioTarget(target)) return withCanonicalAudioCollections(config);
  const bindings = (config.audioBindings ?? []).filter((binding) => !gameAudioTargetEquals(binding.target, target));
  const compatibilityAudio = (config.audio ?? []).filter((range) => !gameAudioTargetEquals(legacyRangeTarget(range), target));
  return withCanonicalAudioCollections(config, config.audioAssets ?? [], bindings, compatibilityAudio);
}

export function legacyRangeToAudioAsset(range: GamePlaygroundAudioRange): GameAudioAsset {
  const kind: GameAudioAssetKind = range.role === "BGM" ? "BGM" : range.role === "JUMP" ? "SE" : "SE";
  const source: GameAudioSourceReference = { projectId: range.projectId, projectRevision: 0, projectStateHash: range.contentHash ?? range.revisionId ?? "legacy", trackIds: range.trackId === undefined ? [] : [range.trackId], startTick: range.startTick, durationTick: range.durationTick, renderMode: "POST_MIX", mode: range.mode };
  return { audioAssetId: gameAudioAssetIdForSource(source), name: range.label, kind, source, defaults: { gainMilliDb: 0, loop: kind === "BGM", retrigger: kind === "BGM" ? "RESTART" : "OVERLAP" } };
}
