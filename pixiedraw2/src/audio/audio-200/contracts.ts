/**
 * AUDIO-200 isolated reference contracts.
 *
 * This module is intentionally DOM-, AudioContext-, Network-, Supabase-,
 * PiXYNC-, Market-, PXD-, and production-independent.  Source bytes may
 * appear only at the verifier boundary in metadata-authority.ts; canonical
 * project/revision records contain metadata and locators, never bytes.
 */

import { canonicalJson, type ContentHash } from "../../wp160-contracts.ts";

export const AUDIO200_SCHEMA_VERSION = "AUDIO-200_V1" as const;
export const AUDIO200_JOURNAL_SCHEMA_VERSION = "AUDIO-200_JOURNAL_V1" as const;
export const AUDIO200_CHECKPOINT_SCHEMA_VERSION =
  "AUDIO-200_CHECKPOINT_V1" as const;
export const AUDIO200_METADATA_AUTHORITY =
  "AUDIO-200_CANONICAL_METADATA_V1" as const;
export const AUDIO200_UI_SCHEMA_VERSION = "AUDIO-200_UI_BOUNDARY_V1" as const;
export const AUDIO200_ASSET_SCHEMA_VERSION = "AUDIO-200_ASSET_V1" as const;
export const AUDIO200_WAVEFORM_SCHEMA_VERSION =
  "AUDIO-200_WAVEFORM_V1" as const;

export type Audio200Brand<Name extends string> = string & {
  readonly __audio200Brand: Name;
};

export type AudioProjectId = Audio200Brand<"AudioProjectId">;
export type AudioAssetId = Audio200Brand<"AudioAssetId">;
export type AudioRevisionId = Audio200Brand<"AudioRevisionId">;
export type AudioTrackId = Audio200Brand<"AudioTrackId">;
export type AudioClipId = Audio200Brand<"AudioClipId">;
export type AudioNoteId = Audio200Brand<"AudioNoteId">;
export type AudioAutomationId = Audio200Brand<"AudioAutomationId">;
export type AudioMixerId = Audio200Brand<"AudioMixerId">;
export type AudioMixerChannelId = Audio200Brand<"AudioMixerChannelId">;
export type AudioMixerSendId = Audio200Brand<"AudioMixerSendId">;
export type AudioEffectId = Audio200Brand<"AudioEffectId">;
export type SourceBlobId = Audio200Brand<"SourceBlobId">;
export type AudioCommandId = Audio200Brand<"AudioCommandId">;
export type AudioJournalEntryId = Audio200Brand<"AudioJournalEntryId">;
export type AudioCheckpointId = Audio200Brand<"AudioCheckpointId">;

export type AudioContentHash = ContentHash;
export type AudioCodec =
  | "WAV_PCM"
  | "WAV_IEEE_FLOAT"
  | "OGG_VORBIS"
  | "MP3"
  | "FLAC"
  | "MIDI"
  | "UNKNOWN";

export const AUDIO200_SUPPORTED_CODECS: readonly AudioCodec[] = [
  "WAV_PCM",
  "WAV_IEEE_FLOAT",
] as const;

export type AudioSourcePlacement =
  | "MEMORY_PREVIEW"
  | "OPFS"
  | "OBJECT_STORAGE";

export type AudioAssetKind = "CLIP" | "SONG";
export type AudioTrackKind = "AUDIO" | "INSTRUMENT" | "BUS" | "RETURN";
/** Lightweight drum-kit profiles used by the frame-oriented Drum Roll. */
export type AudioDrumKitId = "BASIC" | "ARCADE" | "SOFT";
export const AUDIO_DRUM_KIT_IDS: readonly AudioDrumKitId[] = [
  "BASIC",
  "ARCADE",
  "SOFT",
] as const;
export function isAudioDrumKitId(value: unknown): value is AudioDrumKitId {
  return typeof value === "string" &&
    (AUDIO_DRUM_KIT_IDS as readonly string[]).includes(value);
}

/** Host-neutral, serializable voice settings edited by the Audio Inspector. */
export type AudioSynthWaveform =
  | "pulse"
  | "triangle"
  | "sawtooth"
  | "sine"
  | "noise";
export type AudioSynthFilterType = "lowpass" | "highpass" | "bandpass";
export type AudioSynthNoiseColor = "white" | "pink";

/**
 * A custom preset stores only bounded scalar controls.  The modeled voice
 * keeps its instrument-specific partials, while these controls provide a
 * lightweight and deterministic way to shape the sound.
 */
export interface AudioSynthPreset {
  readonly presetId: string;
  readonly instrumentId: string;
  readonly name: string;
  readonly baseVoiceId: string;
  readonly waveform: AudioSynthWaveform;
  readonly dutyCycle: number;
  readonly attackMs: number;
  readonly decayMs: number;
  readonly sustain: number;
  readonly releaseMs: number;
  readonly filterType: AudioSynthFilterType;
  readonly filterFrequencyHz: number;
  readonly filterQ: number;
  readonly noiseColor: AudioSynthNoiseColor;
  readonly transientLevel: number;
  readonly transientMs: number;
  readonly pitchStartRatio: number;
  readonly pitchSweepMs: number;
  readonly vibratoDepthCents: number;
  readonly vibratoRateHz: number;
}
export type AudioReferenceMode = "LIVE" | "PINNED" | "REVIEW" | "FORKED";
export type AudioEffectKind =
  | "GAIN"
  | "EQ"
  | "COMPRESSOR"
  | "REVERB"
  | "DELAY"
  | "CUSTOM";
export type AudioAutomationTargetKind =
  | "TRACK_GAIN"
  | "TRACK_PAN"
  | "MIXER_CHANNEL_GAIN"
  | "MIXER_CHANNEL_PAN"
  | "CLIP_GAIN"
  | "FILTER_CUTOFF"
  | "SYNTH_PARAMETER"
  | "EFFECT_PARAMETER";
export type AudioCommandType =
  | "TRACK_ADD"
  | "TRACK_REMOVE"
  | "REVISION_ATTACH"
  | "CLIP_ADD"
  | "CLIP_UPDATE"
  | "CLIP_SPLIT"
  | "CLIP_REMOVE"
  | "NOTE_REMOVE"
  | "NOTE_UPSERT"
  | "AUTOMATION_UPSERT"
  | "AUTOMATION_REMOVE"
  | "MIXER_REPLACE"
  | "EFFECT_UPSERT"
  | "EFFECT_CHAIN_REPLACE"
  | "MASTER_REPLACE"
  | "DRUM_KIT_SET"
  | "SYNTH_PRESET_REPLACE"
  | "SYNTH_PRESET_REMOVE"
  | "TEMPO_SET"
  | "MARKER_UPSERT"
  | "MARKER_REMOVE"
  | "RECORDING_COMMIT"
  | "BOUNCE_COMMIT"
  | "FREEZE_COMMIT"
  | "FREEZE_UNFREEZE"
  | "FREEZE_REACTIVATE"
  | "TIMELINE_BAR_CLEAR";

export type AudioTick = number & { readonly __audio200Tick: true };

export interface AudioTimebase {
  readonly kind: "PPQ";
  readonly ticksPerQuarter: number;
}

export interface AudioTempo {
  /** Fixed-point beats per minute.  120000 means exactly 120 BPM. */
  readonly milliBpm: number;
}

export interface AudioTimeRange {
  readonly startTick: AudioTick;
  readonly durationTick: AudioTick;
}

export interface AudioSourceBlobLocatorInput {
  readonly placement: AudioSourcePlacement;
  readonly namespace: "audio";
  readonly relativePath: string;
}

export interface AudioSourceBlobLocator extends AudioSourceBlobLocatorInput {
  readonly contentHash: AudioContentHash;
  readonly byteLength: number;
}

export interface AudioSourceMetadata {
  readonly codec: AudioCodec;
  readonly mimeType: "audio/wav";
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth: 8 | 16 | 24 | 32;
  readonly sampleFrames: number;
  /** Integer microseconds derived from sampleFrames/sampleRateHz. */
  readonly durationUs: number;
  readonly byteLength: number;
  readonly contentHash: AudioContentHash;
}

export interface AudioSourceBlobReference {
  readonly blobId: SourceBlobId;
  readonly locator: AudioSourceBlobLocator;
  readonly metadata: AudioSourceMetadata;
}

export interface AudioWaveformPeak {
  readonly min: number;
  readonly max: number;
}

export interface AudioWaveformPeakLevel {
  readonly level: number;
  readonly bucketSize: number;
  readonly peaks: readonly AudioWaveformPeak[];
}

/** A bounded, metadata-derived projection; it contains no PCM/audio bytes. */
export interface AudioWaveformCache {
  readonly schemaVersion: typeof AUDIO200_WAVEFORM_SCHEMA_VERSION;
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly sourceHash: AudioContentHash;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly sampleFrames: number;
  readonly levels: readonly AudioWaveformPeakLevel[];
}

export interface AudioRevision {
  readonly schemaVersion: typeof AUDIO200_SCHEMA_VERSION;
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly revisionNumber: number;
  readonly kind: AudioAssetKind;
  readonly referenceMode: AudioReferenceMode;
  readonly source: AudioSourceBlobReference;
  readonly metadataAuthority: typeof AUDIO200_METADATA_AUTHORITY;
  readonly createdAt: string;
  readonly verified: true;
}

/** Metadata-only catalog entry. Raw source bytes never cross this boundary. */
export interface AudioAssetRecord {
  readonly schemaVersion: typeof AUDIO200_ASSET_SCHEMA_VERSION;
  readonly assetId: AudioAssetId;
  readonly sourceName: string;
  readonly kind: AudioAssetKind;
  readonly revisionIds: readonly AudioRevisionId[];
  readonly latestRevisionId: AudioRevisionId;
  readonly createdAt: string;
}

export interface AudioAssetCatalog {
  readonly schemaVersion: typeof AUDIO200_ASSET_SCHEMA_VERSION;
  readonly assets: readonly AudioAssetRecord[];
}

export interface AudioMixerChannel {
  readonly channelId: AudioMixerChannelId;
  readonly trackId: AudioTrackId;
  /** Fixed-point stereo balance: -1000 is left, 0 is center, +1000 is right. */
  readonly panMilli: number;
  readonly gainMilliDb: number;
  readonly muted: boolean;
  readonly solo: boolean;
  /** Optional Bus/Return destination. Omitted means the Master bus. */
  readonly outputTrackId?: AudioTrackId;
}

/** Canonical auxiliary routing edge. Amount is fixed-point dB. */
export interface AudioMixerSend {
  readonly sendId: AudioMixerSendId;
  readonly sourceTrackId: AudioTrackId;
  readonly destinationTrackId: AudioTrackId;
  readonly amountMilliDb: number;
  readonly preFader: boolean;
}

export interface AudioMixer {
  readonly mixerId: AudioMixerId;
  readonly channels: readonly AudioMixerChannel[];
  readonly masterGainMilliDb: number;
  /** Optional for backward-compatible AUDIO-200 projects. */
  readonly sends?: readonly AudioMixerSend[];
}

export interface AudioEffectParameter {
  readonly name: string;
  readonly value: number;
}

export interface AudioEffect {
  readonly effectId: AudioEffectId;
  readonly kind: AudioEffectKind;
  readonly enabled: boolean;
  readonly parameters: readonly AudioEffectParameter[];
}

/** Atomic Effect record upsert + ordered Track chain replacement. */
export interface AudioEffectChainPayload {
  readonly trackId: AudioTrackId;
  readonly effects: readonly AudioEffect[];
}

/** Canonical Master processing state; meter samples are runtime-only. */
export interface AudioMasterState {
  readonly gainMilliDb: number;
  readonly limiterEnabled: boolean;
  readonly limiterCeilingMilliDb: number;
  readonly bypass: boolean;
  /** Effect IDs are resolved from the shared canonical Effect table. */
  readonly effectIds: readonly AudioEffectId[];
}

export interface AudioMasterPayload {
  readonly master: AudioMasterState;
  /** Optional atomic upsert for the Master FX chain records. */
  readonly effects?: readonly AudioEffect[];
}

export interface AudioTrack {
  readonly trackId: AudioTrackId;
  readonly kind: AudioTrackKind;
  readonly name: string;
  readonly clipIds: readonly AudioClipId[];
  readonly noteIds: readonly AudioNoteId[];
  readonly automationIds: readonly AudioAutomationId[];
  readonly effectIds: readonly AudioEffectId[];
  readonly mixerChannelId: AudioMixerChannelId;
  readonly muted: boolean;
  readonly solo: boolean;
}

export interface AudioClip {
  readonly clipId: AudioClipId;
  readonly trackId: AudioTrackId;
  readonly revisionId: AudioRevisionId;
  readonly timeline: AudioTimeRange;
  readonly sourceOffsetUs: number;
  readonly gainMilliDb: number;
  readonly fadeInTick: AudioTick;
  readonly fadeOutTick: AudioTick;
  readonly loop: boolean;
  /** Optional non-destructive playback speed. 1 is the original speed. */
  readonly playbackRate?: number;
}

/** One atomic recording commit: revision, Asset catalog binding, and Clip. */
export interface AudioRecordingCommitPayload {
  readonly revision: AudioRevision;
  readonly clip: AudioClip;
  readonly sourceName: string;
}

export type AudioFreezeStatus = "ACTIVE" | "INACTIVE" | "STALE";

/** Metadata-only pointer to a non-destructive Track Freeze artifact. */
export interface AudioFreezeState {
  readonly trackId: AudioTrackId;
  readonly frozenRevisionId: AudioRevisionId;
  readonly frozenClipId: AudioClipId;
  /** Hash of the source Track/Clip/Note/Mixer inputs used to render it. */
  readonly sourceStateHash: AudioContentHash;
  readonly sourceProjectRevision: number;
  readonly status: AudioFreezeStatus;
  readonly createdAt: string;
}

export interface AudioFreezeCommitPayload {
  readonly freeze: AudioFreezeState;
  readonly revision: AudioRevision;
  readonly clip: AudioClip;
  readonly sourceName: string;
}

export interface AudioBounceCommitPayload {
  readonly revision: AudioRevision;
  readonly clip: AudioClip;
  readonly sourceName: string;
}

/**
 * One non-destructive split transaction.  The source Clip is replaced by two
 * Clips which continue to reference the same immutable Revision.  Keeping the
 * pair in one payload makes the edit a single Journal entry and prevents a
 * half-applied split during recovery.
 */
export interface AudioClipSplitPayload {
  readonly sourceClipId: AudioClipId;
  readonly leftClip: AudioClip;
  readonly rightClip: AudioClip;
}

/**
 * Removes timeline content whose start lies inside one selected musical bar.
 * The timebase itself is intentionally preserved; this is a non-ripple edit
 * so Draw frame timing and later Audio content keep their absolute positions.
 */
export interface AudioTimelineBarClearPayload {
  readonly startTick: AudioTick;
  readonly durationTick: AudioTick;
}

export interface AudioNote {
  readonly noteId: AudioNoteId;
  readonly trackId: AudioTrackId;
  readonly pitchMidi: number;
  readonly timeline: AudioTimeRange;
  readonly velocityMilli: number;
}

export interface AudioAutomationPoint {
  readonly tick: AudioTick;
  readonly value: number;
}

export interface AudioAutomation {
  readonly automationId: AudioAutomationId;
  readonly target: {
    readonly kind: AudioAutomationTargetKind;
    readonly targetId: string;
    readonly parameterName?: string;
  };
  readonly points: readonly AudioAutomationPoint[];
}

export interface AudioMarker {
  readonly markerId: string;
  readonly frameId: string;
  readonly tick: AudioTick;
  readonly label: string;
}

export interface AudioProject {
  readonly schemaVersion: typeof AUDIO200_SCHEMA_VERSION;
  readonly projectId: AudioProjectId;
  readonly name: string;
  readonly createdAt: string;
  readonly projectRevision: number;
  readonly stateHash: AudioContentHash;
  readonly tempo: AudioTempo;
  readonly timebase: AudioTimebase;
  /** Optional for projects created before the Drum Roll kit selector. */
  readonly drumKitId?: AudioDrumKitId;
  /** Optional for projects created before the Audio voice editor. */
  readonly synthPresets?: readonly AudioSynthPreset[];
  readonly revisions: readonly AudioRevision[];
  readonly tracks: readonly AudioTrack[];
  readonly clips: readonly AudioClip[];
  readonly notes: readonly AudioNote[];
  readonly automations: readonly AudioAutomation[];
  readonly mixer: AudioMixer;
  readonly effects: readonly AudioEffect[];
  readonly markers: readonly AudioMarker[];
  /** Optional for projects created before Phase 3-D. */
  readonly master?: AudioMasterState;
  /** Optional for backwards-compatible AUDIO-200 projects before Phase 2-E. */
  readonly freezeStates?: readonly AudioFreezeState[];
}

export type AudioCommandPayload =
  | { readonly track: AudioTrack }
  | { readonly trackId: AudioTrackId }
  | { readonly revision: AudioRevision }
  | { readonly clip: AudioClip }
  | { readonly clipSplit: AudioClipSplitPayload }
  | { readonly timelineBar: AudioTimelineBarClearPayload }
  | { readonly clipId: AudioClipId }
  | { readonly noteId: AudioNoteId }
  | { readonly note: AudioNote }
  | { readonly automation: AudioAutomation }
  | { readonly automationId: AudioAutomationId }
  | { readonly mixer: AudioMixer }
  | { readonly effect: AudioEffect }
  | { readonly effectChain: AudioEffectChainPayload }
  | { readonly master: AudioMasterPayload }
  | { readonly drumKitId: AudioDrumKitId }
  | { readonly synthPreset: AudioSynthPreset }
  | { readonly synthPresetId: string }
  | { readonly tempo: AudioTempo }
  | { readonly marker: AudioMarker }
  | { readonly markerId: string }
  | { readonly recording: AudioRecordingCommitPayload }
  | { readonly bounce: AudioBounceCommitPayload }
  | { readonly freeze: AudioFreezeCommitPayload }
  | { readonly freezeTrackId: AudioTrackId }
  | {
    readonly freezeTrackId: AudioTrackId;
    readonly freezeSourceStateHash: AudioContentHash;
  };

export interface AudioCommand {
  readonly schemaVersion: typeof AUDIO200_SCHEMA_VERSION;
  readonly commandId: AudioCommandId;
  readonly idempotencyKey: string;
  readonly projectId: AudioProjectId;
  readonly baseProjectRevision: number;
  readonly type: AudioCommandType;
  readonly payload: AudioCommandPayload;
  readonly issuedAt: string;
}

export type AudioJournalEntryKind = "COMMAND" | "UNDO" | "REDO";

export interface AudioJournalEntry {
  readonly schemaVersion: typeof AUDIO200_JOURNAL_SCHEMA_VERSION;
  readonly entryId: AudioJournalEntryId;
  readonly sequence: number;
  readonly kind: AudioJournalEntryKind;
  readonly commandId: AudioCommandId;
  readonly command: AudioCommand;
  readonly beforeState: AudioProject;
  readonly afterState: AudioProject;
  readonly previousEntryHash: AudioContentHash | null;
  readonly entryHash: AudioContentHash;
}

export interface AudioCheckpoint {
  readonly schemaVersion: typeof AUDIO200_CHECKPOINT_SCHEMA_VERSION;
  readonly checkpointId: AudioCheckpointId;
  readonly projectId: AudioProjectId;
  readonly projectRevision: number;
  readonly stateHash: AudioContentHash;
  readonly journalHeadHash: AudioContentHash | null;
  readonly journalSequence: number;
  readonly state: AudioProject;
  readonly createdAt: string;
}

export type AudioSourceAvailability =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "NOT_CHECKED";

export interface AudioRecoveryResult {
  readonly project: AudioProject;
  readonly sourceAvailability: Readonly<
    Record<string, AudioSourceAvailability>
  >;
  readonly diagnostics: readonly Audio200Diagnostic[];
  readonly replayedEntries: number;
}

export type Audio200DiagnosticCode =
  | "AUDIO_INVALID_ID"
  | "AUDIO_INVALID_PROJECT"
  | "AUDIO_INVALID_TRACK"
  | "AUDIO_INVALID_CLIP"
  | "AUDIO_INVALID_NOTE"
  | "AUDIO_INVALID_AUTOMATION"
  | "AUDIO_INVALID_MIXER"
  | "AUDIO_INVALID_EFFECT"
  | "AUDIO_INVALID_REVISION"
  | "AUDIO_INVALID_ASSET"
  | "AUDIO_INVALID_WAVEFORM"
  | "AUDIO_INVALID_SOURCE"
  | "AUDIO_EMPTY_RECORDING"
  | "AUDIO_INVALID_NUMBER"
  | "AUDIO_OVERFLOW"
  | "AUDIO_METADATA_MISMATCH"
  | "AUDIO_RAW_BLOB_MODIFIED"
  | "AUDIO_RAW_PAYLOAD_REJECTED"
  | "AUDIO_SOURCE_UNAVAILABLE"
  | "AUDIO_PATH_TRAVERSAL"
  | "AUDIO_UNSUPPORTED_SCHEMA"
  | "AUDIO_UNSUPPORTED_CODEC"
  | "AUDIO_DUPLICATE_ID"
  | "AUDIO_DUPLICATE_COMMAND"
  | "AUDIO_IDEMPOTENCY_CONFLICT"
  | "AUDIO_STALE_PROJECT_REVISION"
  | "AUDIO_REVISION_NOT_FOUND"
  | "AUDIO_COMMAND_INVALID"
  | "AUDIO_JOURNAL_INVALID"
  | "AUDIO_CHECKPOINT_INVALID"
  | "AUDIO_NO_UNDO"
  | "AUDIO_NO_REDO"
  | "AUDIO_UI_INVALID"
  | "AUDIO_LAZY_BOUNDARY_INVALID"
  | "AUDIO_RENDER_INVALID"
  | "AUDIO_RENDER_CANCELLED"
  | "AUDIO_RENDER_OUTPUT_LIMIT"
  | "AUDIO_FREEZE_INVALID"
  | "AUDIO_FREEZE_STALE"
  | "AUDIO_FREEZE_CANCELLED"
  | "AUDIO_BOUNCE_INVALID"
  | "AUDIO_HOST_BOUNDARY_INVALID";

export interface Audio200Diagnostic {
  readonly code: Audio200DiagnosticCode;
  readonly message: string;
  readonly path?: string;
  readonly recoverable: boolean;
}

export type Audio200Result<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly Audio200Diagnostic[];
  }
  | { readonly ok: false; readonly diagnostics: readonly Audio200Diagnostic[] };

export function audioOk<T>(
  value: T,
  diagnostics: readonly Audio200Diagnostic[] = [],
): Audio200Result<T> {
  return { ok: true, value, diagnostics };
}

export function audioFail<T>(
  code: Audio200DiagnosticCode,
  message: string,
  path?: string,
  recoverable = false,
): Audio200Result<T> {
  const diagnostic: Audio200Diagnostic = {
    code,
    message,
    ...(path === undefined ? {} : { path }),
    recoverable,
  };
  return { ok: false, diagnostics: [diagnostic] };
}

export function audioDiagnostic(
  code: Audio200DiagnosticCode,
  message: string,
  path?: string,
  recoverable = false,
): Audio200Diagnostic {
  return {
    code,
    message,
    ...(path === undefined ? {} : { path }),
    recoverable,
  };
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RAW_AUDIO_KEYS = new Set([
  "arrayBuffer",
  "base64",
  "blob",
  "bytes",
  "dataUrl",
  "pcm",
  "samples",
]);

function brandId<Name extends string>(
  value: string,
  label: string,
): Audio200Brand<Name> {
  if (typeof value !== "string" || !SAFE_ID.test(value.trim())) {
    throw new Error(`${label} must be a stable non-empty identifier.`);
  }
  return value as Audio200Brand<Name>;
}

export function asAudioProjectId(value: string): AudioProjectId {
  return brandId<"AudioProjectId">(value, "AudioProjectId");
}
export function asAudioAssetId(value: string): AudioAssetId {
  return brandId<"AudioAssetId">(value, "AudioAssetId");
}
export function asAudioRevisionId(value: string): AudioRevisionId {
  return brandId<"AudioRevisionId">(value, "AudioRevisionId");
}
export function asAudioTrackId(value: string): AudioTrackId {
  return brandId<"AudioTrackId">(value, "AudioTrackId");
}
export function asAudioClipId(value: string): AudioClipId {
  return brandId<"AudioClipId">(value, "AudioClipId");
}
export function asAudioNoteId(value: string): AudioNoteId {
  return brandId<"AudioNoteId">(value, "AudioNoteId");
}
export function asAudioAutomationId(value: string): AudioAutomationId {
  return brandId<"AudioAutomationId">(value, "AudioAutomationId");
}
export function asAudioMixerId(value: string): AudioMixerId {
  return brandId<"AudioMixerId">(value, "AudioMixerId");
}
export function asAudioMixerChannelId(value: string): AudioMixerChannelId {
  return brandId<"AudioMixerChannelId">(value, "AudioMixerChannelId");
}
export function asAudioMixerSendId(value: string): AudioMixerSendId {
  return brandId<"AudioMixerSendId">(value, "AudioMixerSendId");
}
export function asAudioEffectId(value: string): AudioEffectId {
  return brandId<"AudioEffectId">(value, "AudioEffectId");
}
export function asSourceBlobId(value: string): SourceBlobId {
  return brandId<"SourceBlobId">(value, "SourceBlobId");
}
export function asAudioCommandId(value: string): AudioCommandId {
  return brandId<"AudioCommandId">(value, "AudioCommandId");
}
export function asAudioJournalEntryId(value: string): AudioJournalEntryId {
  return brandId<"AudioJournalEntryId">(value, "AudioJournalEntryId");
}
export function asAudioCheckpointId(value: string): AudioCheckpointId {
  return brandId<"AudioCheckpointId">(value, "AudioCheckpointId");
}

export function asAudioContentHash(value: string): AudioContentHash {
  if (!SHA256.test(value)) {
    throw new Error("AudioContentHash must be a lowercase SHA-256 hash.");
  }
  return value as AudioContentHash;
}

export function asAudioTick(value: number): AudioTick {
  if (!Number.isSafeInteger(value) || value < 0 || value > 9_000_000_000) {
    throw new Error("AudioTick must be a bounded non-negative safe integer.");
  }
  return value as AudioTick;
}

export function hasRawAudioPayload(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return true;
  if (Array.isArray(value)) {
    return value.some((item) => hasRawAudioPayload(item));
  }
  if (typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) => RAW_AUDIO_KEYS.has(key) || hasRawAudioPayload(item),
  );
}

export function isFiniteSafeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    Number.isSafeInteger(value) === false;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function canonicalAudioMaterial(value: unknown): string {
  return canonicalJson(value);
}

export function sourcePathIsSafe(relativePath: string): boolean {
  if (
    !relativePath || relativePath.length > 512 || relativePath.includes("\\") ||
    relativePath.includes("\u0000")
  ) return false;
  if (
    relativePath.startsWith("/") || relativePath.startsWith("~") ||
    relativePath.includes("://")
  ) return false;
  const segments = relativePath.split("/");
  return segments.every((segment) =>
    segment.length > 0 && segment !== "." && segment !== ".."
  );
}

export function audioIdSet(values: readonly string[]): Set<string> {
  return new Set(values);
}
