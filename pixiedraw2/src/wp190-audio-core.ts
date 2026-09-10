/**
 * WP-190 PiXiAudio Core Bridge.
 *
 * This contract is deliberately independent from DOM, Canvas, AudioContext,
 * Network, Supabase, IndexedDB, OPFS, Object Storage, Market, and Runtime.
 * Audio bytes remain outside the Core; only immutable Revision metadata and
 * authorized storage locators cross the adapter boundary.
 */

import { asSha256, type ContentHash } from "./wp160-contracts.ts";

export const WP190_SCHEMA_VERSION = 1 as const;

type AudioBrand<Name extends string> = string & { readonly __wp190AudioBrand: Name };
export type AudioProjectId = AudioBrand<"AudioProjectId">;
export type AudioAssetId = AudioBrand<"AudioAssetId">;
export type AudioRevisionId = AudioBrand<"AudioRevisionId">;
export type AudioTrackId = AudioBrand<"AudioTrackId">;
export type AudioEventId = AudioBrand<"AudioEventId">;
export type AudioOperationId = AudioBrand<"AudioOperationId">;
export type AudioLicenseSnapshotId = AudioBrand<"AudioLicenseSnapshotId">;
export type AudioPackageId = AudioBrand<"AudioPackageId">;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const RAW_AUDIO_KEYS = new Set(["bytes", "data", "base64", "arrayBuffer", "pcm", "samples", "blob"]);

function brandedId<Name extends string>(value: string, label: string): AudioBrand<Name> {
  if (!SAFE_ID.test(value.trim())) throw new Error(`${label} must be a stable non-empty identifier.`);
  return value as AudioBrand<Name>;
}

export function asAudioProjectId(value: string): AudioProjectId { return brandedId<"AudioProjectId">(value, "AudioProjectId"); }
export function asAudioAssetId(value: string): AudioAssetId { return brandedId<"AudioAssetId">(value, "AudioAssetId"); }
export function asAudioRevisionId(value: string): AudioRevisionId { return brandedId<"AudioRevisionId">(value, "AudioRevisionId"); }
export function asAudioTrackId(value: string): AudioTrackId { return brandedId<"AudioTrackId">(value, "AudioTrackId"); }
export function asAudioEventId(value: string): AudioEventId { return brandedId<"AudioEventId">(value, "AudioEventId"); }
export function asAudioOperationId(value: string): AudioOperationId { return brandedId<"AudioOperationId">(value, "AudioOperationId"); }
export function asAudioLicenseSnapshotId(value: string): AudioLicenseSnapshotId { return brandedId<"AudioLicenseSnapshotId">(value, "AudioLicenseSnapshotId"); }
export function asAudioPackageId(value: string): AudioPackageId { return brandedId<"AudioPackageId">(value, "AudioPackageId"); }

export type AudioKind = "CLIP" | "SONG";
export type AudioFormat = "WAV" | "OGG" | "MP3" | "FLAC" | "MIDI" | "AAC" | "WMA" | "AIFF" | "UNKNOWN";
export type AudioTrackKind = "BGM" | "SFX" | "VOICE";
export type AudioReferenceMode = "LIVE" | "PINNED" | "REVIEW" | "FORKED";
export type AudioStoragePlacement = "MEMORY_PREVIEW" | "OPFS" | "OBJECT_STORAGE";
export type AudioTransportClass = "LOCAL_ONLY" | "PLATFORM_EVENT" | "ASYNC_ON_DEMAND";
export type AudioUse = "PREVIEW" | "EXPORT" | "RUNTIME" | "MARKET_PREPARATION";
export type AudioTrigger = "SCENE_START" | "SCENE_STOP" | "GAME_EVENT" | "TIMELINE_BEAT";
export type AudioExportFormat = "WAV" | "OGG";

export const SUPPORTED_SOURCE_FORMATS: readonly AudioFormat[] = ["WAV", "OGG", "MP3", "FLAC", "MIDI"];
export const SUPPORTED_EXPORT_FORMATS: readonly AudioExportFormat[] = ["WAV", "OGG"];

export type AudioDiagnosticCode =
  | "AUDIO_ID_INVALID"
  | "AUDIO_PROJECT_INVALID"
  | "AUDIO_REVISION_INVALID"
  | "AUDIO_TRACK_INVALID"
  | "AUDIO_BINDING_INVALID"
  | "AUDIO_FORMAT_UNSUPPORTED"
  | "AUDIO_MIME_MISMATCH"
  | "AUDIO_HASH_INVALID"
  | "AUDIO_STORAGE_INVALID"
  | "AUDIO_RAW_PAYLOAD_REJECTED"
  | "AUDIO_REVISION_NOT_FOUND"
  | "AUDIO_DUPLICATE_ID"
  | "AUDIO_LICENSE_MISSING"
  | "AUDIO_LICENSE_USE_DENIED"
  | "AUDIO_DEPENDENCY_MISSING"
  | "AUDIO_DEPENDENCY_HASH_MISMATCH"
  | "AUDIO_DEPENDENCY_NOT_PINNED"
  | "AUDIO_PACKAGE_INVALID"
  | "AUDIO_FEATURE_FLAG_OFF"
  | "AUDIO_EVENT_INVALID"
  | "AUDIO_OPERATION_DUPLICATE"
  | "AUDIO_OPERATION_PAYLOAD_INVALID"
  | "AUDIO_CANCELLED"
  | "AUDIO_EXPORT_UNSUPPORTED";

export interface AudioDiagnostic {
  readonly code: AudioDiagnosticCode;
  readonly severity: "ERROR" | "WARNING";
  readonly message: string;
  readonly path?: string;
  readonly recoverable: boolean;
}

export type AudioResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly AudioDiagnostic[] };

function ok<T>(value: T): AudioResult<T> { return { ok: true, value }; }
function fail<T>(code: AudioDiagnosticCode, message: string, path?: string, recoverable = false): AudioResult<T> {
  return { ok: false, diagnostics: [{ code, severity: "ERROR", message, ...(path === undefined ? {} : { path }), recoverable }] };
}

function diagnostic(code: AudioDiagnosticCode, message: string, path?: string, recoverable = false): AudioDiagnostic {
  return { code, severity: "ERROR", message, ...(path === undefined ? {} : { path }), recoverable };
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Audio canonical data requires finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new Error("Audio canonical data contains an unsupported value.");
}

function stableId(value: unknown): string {
  let hash = 2166136261;
  const text = canonical(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `wp190_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function hasRawAudioPayload(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasRawAudioPayload(item));
  const record = value as Record<string, unknown>;
  return Object.entries(record).some(([key, item]) => RAW_AUDIO_KEYS.has(key) || hasRawAudioPayload(item));
}

export interface AudioStorageLocator {
  readonly placement: AudioStoragePlacement;
  readonly path: string;
  readonly contentHash: ContentHash;
  readonly byteLength: number;
}

export interface AudioRevisionInput {
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly revisionNumber: number;
  readonly kind: AudioKind;
  readonly format: AudioFormat;
  readonly mimeType: string;
  readonly durationMs: number;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly byteLength: number;
  readonly contentHash: ContentHash;
  readonly storage: AudioStorageLocator;
  readonly createdAt: string;
}

export interface AudioRevision extends AudioRevisionInput {
  readonly schemaVersion: 1;
  readonly verified: true;
}

export interface AudioTrackInput {
  readonly trackId: AudioTrackId;
  readonly kind: AudioTrackKind;
  readonly name: string;
  readonly revisionId: AudioRevisionId;
  readonly gainDb: number;
  readonly muted: boolean;
  readonly loop: boolean;
}

export interface AudioTrack extends AudioTrackInput {}

export interface AudioProjectInput {
  readonly projectId: AudioProjectId;
  readonly name: string;
  readonly tempoBpm: number;
  readonly timeSignature: readonly [number, number];
  readonly tracks: readonly AudioTrackInput[];
  readonly createdAt: string;
}

export interface AudioProject extends AudioProjectInput {
  readonly schemaVersion: 1;
  readonly revisionIds: readonly AudioRevisionId[];
}

export interface AudioLicenseSnapshot {
  readonly snapshotId: AudioLicenseSnapshotId;
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly licenseKind: "OWNER" | "PURCHASED" | "PUBLIC" | "DERIVATIVE";
  readonly allowedUses: readonly AudioUse[];
  readonly sourceHash: ContentHash;
}

export interface AudioEventBindingInput {
  readonly eventId: AudioEventId;
  readonly trackId: AudioTrackId;
  readonly revisionId: AudioRevisionId;
  readonly trigger: AudioTrigger;
  readonly eventKey: string;
  readonly mode: AudioReferenceMode;
  readonly gainDb: number;
  readonly licenseSnapshotId?: AudioLicenseSnapshotId;
}

export interface AudioEventBinding extends AudioEventBindingInput {
  readonly projectId: AudioProjectId;
  readonly kind: AudioTrackKind;
}

export interface AudioDependencyEntry {
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly contentHash: ContentHash;
  readonly byteLength: number;
  readonly mode: AudioReferenceMode;
  readonly required: boolean;
  readonly license?: AudioLicenseSnapshot;
}

export interface AudioPackageCompatibilityRequest {
  readonly packageId: AudioPackageId;
  readonly packageVersion: string;
  readonly use: AudioUse;
  readonly dependencies: readonly AudioDependencyEntry[];
  readonly revisions: readonly AudioRevision[];
  readonly bindings: readonly AudioEventBinding[];
}

export interface AudioPackageCompatibility {
  readonly packageId: AudioPackageId;
  readonly packageVersion: string;
  readonly use: AudioUse;
  readonly compatible: boolean;
  readonly resolvedRevisionIds: readonly AudioRevisionId[];
  readonly dependencyLockHash: string;
  readonly diagnostics: readonly AudioDiagnostic[];
}

export type AudioFeatureFlagName = "audio-core-read" | "audio-core-write" | "audio-preview" | "audio-export" | "audio-sync" | "audio-publish";
export type AudioFeatureFlags = Readonly<Record<AudioFeatureFlagName, boolean>>;

export const DEFAULT_WP190_FEATURE_FLAGS: AudioFeatureFlags = Object.freeze({
  "audio-core-read": false,
  "audio-core-write": false,
  "audio-preview": false,
  "audio-export": false,
  "audio-sync": false,
  "audio-publish": false,
});

export function canUseAudioFeature(
  flags: Readonly<Record<string, boolean | undefined>>,
  feature: AudioFeatureFlagName,
  killSwitch = false,
): boolean {
  return killSwitch !== true && flags[feature] === true;
}

function sourceFormatValid(revision: AudioRevisionInput): AudioDiagnostic[] {
  const errors: AudioDiagnostic[] = [];
  if (!SUPPORTED_SOURCE_FORMATS.includes(revision.format)) errors.push(diagnostic("AUDIO_FORMAT_UNSUPPORTED", `Audio format ${revision.format} is not supported.`, "format"));
  if (!Number.isSafeInteger(revision.byteLength) || revision.byteLength < 1) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio byteLength must be a positive safe integer.", "byteLength"));
  if (!Number.isFinite(revision.durationMs) || revision.durationMs <= 0) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio durationMs must be positive.", "durationMs"));
  if (!Number.isSafeInteger(revision.sampleRateHz) || revision.sampleRateHz < 8_000 || revision.sampleRateHz > 384_000) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio sampleRateHz is outside the supported safe range.", "sampleRateHz"));
  if (revision.channels !== 1 && revision.channels !== 2) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio channels must be mono or stereo.", "channels"));
  if (!/^[a-z]+\/[a-z0-9.+-]+$/i.test(revision.mimeType)) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio MIME type is invalid.", "mimeType"));
  if (!/^[a-f0-9]{64}$/.test(revision.contentHash)) errors.push(diagnostic("AUDIO_HASH_INVALID", "Audio contentHash must be a lowercase SHA-256 hash.", "contentHash"));
  if (revision.storage.contentHash !== revision.contentHash || revision.storage.byteLength !== revision.byteLength) errors.push(diagnostic("AUDIO_STORAGE_INVALID", "Storage locator must repeat the verified content hash and byte length.", "storage"));
  if (!revision.storage.path || revision.storage.path.includes("..") || revision.storage.path.startsWith("/")) errors.push(diagnostic("AUDIO_STORAGE_INVALID", "Audio storage path must be a bounded relative locator.", "storage.path"));
  if (revision.format === "WAV" && revision.mimeType !== "audio/wav") errors.push(diagnostic("AUDIO_MIME_MISMATCH", "WAV revision requires audio/wav MIME type.", "mimeType"));
  if (revision.format === "OGG" && revision.mimeType !== "audio/ogg") errors.push(diagnostic("AUDIO_MIME_MISMATCH", "OGG revision requires audio/ogg MIME type.", "mimeType"));
  return errors;
}

export function createAudioRevision(input: AudioRevisionInput): AudioResult<AudioRevision> {
  if (hasRawAudioPayload(input)) return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Audio Core accepts metadata and locators, not raw Audio bytes.");
  const errors = sourceFormatValid(input);
  if (errors.length > 0) return { ok: false, diagnostics: errors };
  try { asSha256(input.contentHash, "Audio contentHash"); } catch (cause) { return fail("AUDIO_HASH_INVALID", cause instanceof Error ? cause.message : "Audio hash is invalid.", "contentHash"); }
  return ok({ ...input, schemaVersion: WP190_SCHEMA_VERSION, verified: true });
}

export function createAudioProject(input: AudioProjectInput, revisions: readonly AudioRevision[]): AudioResult<AudioProject> {
  if (hasRawAudioPayload(input)) return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Audio Project cannot contain raw Audio bytes.");
  if (!input.name.trim() || !Number.isFinite(input.tempoBpm) || input.tempoBpm <= 0 || input.tempoBpm > 999) return fail("AUDIO_PROJECT_INVALID", "Audio Project requires a valid name and tempo.");
  const revisionMap = new Map(revisions.map((revision) => [revision.revisionId, revision]));
  const trackIds = new Set<string>();
  const errors: AudioDiagnostic[] = [];
  for (const track of input.tracks) {
    if (trackIds.has(track.trackId)) errors.push(diagnostic("AUDIO_DUPLICATE_ID", "Audio track IDs must be unique.", "tracks"));
    trackIds.add(track.trackId);
    if (!track.name.trim() || !revisionMap.has(track.revisionId) || !Number.isFinite(track.gainDb)) errors.push(diagnostic("AUDIO_TRACK_INVALID", "Audio track name, revision, and gain are required.", "tracks"));
  }
  if (errors.length > 0) return { ok: false, diagnostics: errors };
  return ok({ ...input, schemaVersion: WP190_SCHEMA_VERSION, revisionIds: [...new Set(input.tracks.map((track) => track.revisionId))] });
}

export function bindAudioEvent(project: AudioProject, input: AudioEventBindingInput, revisions: readonly AudioRevision[], licenses: readonly AudioLicenseSnapshot[] = []): AudioResult<AudioEventBinding> {
  if (hasRawAudioPayload(input)) return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Audio event bindings cannot contain raw samples.");
  const track = project.tracks.find((candidate) => candidate.trackId === input.trackId);
  const revision = revisions.find((candidate) => candidate.revisionId === input.revisionId);
  if (track === undefined || revision === undefined || !project.revisionIds.includes(input.revisionId) || !input.eventKey.trim() || !Number.isFinite(input.gainDb)) return fail("AUDIO_BINDING_INVALID", "Binding must reference a Project track and verified Audio Revision.", "binding");
  if (input.mode === "PINNED" && !licenses.some((license) => license.revisionId === revision.revisionId && license.sourceHash === revision.contentHash)) return fail("AUDIO_LICENSE_MISSING", "PINNED Audio binding requires a matching License Snapshot.", "licenseSnapshotId");
  if (input.licenseSnapshotId !== undefined && !licenses.some((license) => license.snapshotId === input.licenseSnapshotId && license.revisionId === revision.revisionId)) return fail("AUDIO_LICENSE_MISSING", "Audio License Snapshot does not match the bound revision.", "licenseSnapshotId");
  return ok({ ...input, projectId: project.projectId, kind: track.kind });
}

function useRequiresPinned(use: AudioUse): boolean { return use === "EXPORT" || use === "RUNTIME" || use === "MARKET_PREPARATION"; }

export function validateAudioPackageCompatibility(request: AudioPackageCompatibilityRequest): AudioResult<AudioPackageCompatibility> {
  if (hasRawAudioPayload(request)) return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Package compatibility accepts references, not raw Audio bytes.");
  const diagnostics: AudioDiagnostic[] = [];
  const revisions = new Map(request.revisions.map((revision) => [revision.revisionId, revision]));
  const resolved: AudioRevisionId[] = [];
  for (const dependency of request.dependencies) {
    const revision = revisions.get(dependency.revisionId);
    if (revision === undefined) {
      if (dependency.required) diagnostics.push(diagnostic("AUDIO_DEPENDENCY_MISSING", "Required Audio Revision is missing from the compatibility input.", "dependencies"));
      continue;
    }
    if (revision.assetId !== dependency.assetId || revision.contentHash !== dependency.contentHash || revision.byteLength !== dependency.byteLength) diagnostics.push(diagnostic("AUDIO_DEPENDENCY_HASH_MISMATCH", "Audio dependency metadata does not match the verified Revision.", "dependencies"));
    if (useRequiresPinned(request.use) && dependency.mode !== "PINNED") diagnostics.push(diagnostic("AUDIO_DEPENDENCY_NOT_PINNED", `${request.use} requires PINNED Audio dependencies.`, "dependencies"));
    if (dependency.license === undefined) diagnostics.push(diagnostic("AUDIO_LICENSE_MISSING", "Audio dependency requires a License Snapshot.", "dependencies", true));
    else if (!dependency.license.allowedUses.includes(request.use) || dependency.license.sourceHash !== revision.contentHash) diagnostics.push(diagnostic("AUDIO_LICENSE_USE_DENIED", "Audio License Snapshot does not authorize this use or hash.", "dependencies.license"));
    if (!SUPPORTED_SOURCE_FORMATS.includes(revision.format)) diagnostics.push(diagnostic("AUDIO_FORMAT_UNSUPPORTED", "Package references an unsupported Audio source format.", "dependencies"));
    resolved.push(revision.revisionId);
  }
  for (const binding of request.bindings) if (!resolved.includes(binding.revisionId)) diagnostics.push(diagnostic("AUDIO_BINDING_INVALID", "Package binding references an unlocked Audio Revision.", "bindings"));
  const dependencyLockHash = stableId({ packageId: request.packageId, packageVersion: request.packageVersion, use: request.use, dependencies: request.dependencies.map((dependency) => ({ assetId: dependency.assetId, revisionId: dependency.revisionId, contentHash: dependency.contentHash, mode: dependency.mode })) });
  return ok({ packageId: request.packageId, packageVersion: request.packageVersion, use: request.use, compatible: diagnostics.length === 0, resolvedRevisionIds: [...new Set(resolved)], dependencyLockHash, diagnostics });
}

export interface AudioPreviewPlan {
  readonly planId: AudioOperationId;
  readonly projectId: AudioProjectId;
  readonly revisionIds: readonly AudioRevisionId[];
  readonly transportClass: "LOCAL_ONLY";
  readonly replaceAt: "SAFE_PLAYHEAD_BOUNDARY";
  readonly audioEventIds: readonly AudioEventId[];
}

export function planAudioPreview(project: AudioProject, bindings: readonly AudioEventBinding[], flags: Readonly<Record<string, boolean | undefined>>, killSwitch = false): AudioResult<AudioPreviewPlan> {
  if (!canUseAudioFeature(flags, "audio-preview", killSwitch)) return fail("AUDIO_FEATURE_FLAG_OFF", "Audio preview is unavailable while the feature flag is OFF.", "audio-preview", true);
  const projectBindings = bindings.filter((binding) => binding.projectId === project.projectId);
  if (projectBindings.length === 0) return fail("AUDIO_EVENT_INVALID", "Audio preview requires at least one Project event binding.", "bindings");
  const planId = asAudioOperationId(stableId({ type: "preview", projectId: project.projectId, events: projectBindings.map((binding) => binding.eventId).sort() }));
  return ok({ planId, projectId: project.projectId, revisionIds: [...new Set(projectBindings.map((binding) => binding.revisionId))], transportClass: "LOCAL_ONLY", replaceAt: "SAFE_PLAYHEAD_BOUNDARY", audioEventIds: projectBindings.map((binding) => binding.eventId) });
}

export interface AudioExportPlan {
  readonly planId: AudioOperationId;
  readonly projectId: AudioProjectId;
  readonly format: AudioExportFormat;
  readonly revisionIds: readonly AudioRevisionId[];
  readonly transportClass: "ASYNC_ON_DEMAND";
  readonly requiresPinnedDependencies: true;
}

export function planAudioExport(project: AudioProject, compatibility: AudioPackageCompatibility, format: AudioExportFormat, flags: Readonly<Record<string, boolean | undefined>>, killSwitch = false): AudioResult<AudioExportPlan> {
  if (!canUseAudioFeature(flags, "audio-export", killSwitch)) return fail("AUDIO_FEATURE_FLAG_OFF", "Audio export is unavailable while the feature flag is OFF.", "audio-export", true);
  if (!SUPPORTED_EXPORT_FORMATS.includes(format)) return fail("AUDIO_EXPORT_UNSUPPORTED", `Audio export format ${format} is unsupported.`, "format");
  if (!compatibility.compatible || compatibility.use !== "EXPORT") return fail("AUDIO_PACKAGE_INVALID", "Audio export requires a compatible EXPORT package result.", "compatibility");
  return ok({ planId: asAudioOperationId(stableId({ type: "export", projectId: project.projectId, format, revisions: compatibility.resolvedRevisionIds })), projectId: project.projectId, format, revisionIds: compatibility.resolvedRevisionIds, transportClass: "ASYNC_ON_DEMAND", requiresPinnedDependencies: true });
}

export type AudioOperationType = "revision.created" | "binding.updated" | "preview.requested" | "export.requested";

export interface AudioOperation {
  readonly operationId: AudioOperationId;
  readonly idempotencyKey: string;
  readonly schemaVersion: 1;
  readonly type: AudioOperationType;
  readonly projectId?: AudioProjectId;
  readonly revisionId?: AudioRevisionId;
  readonly transportClass: AudioTransportClass;
  readonly referencePayload: Readonly<Record<string, string | number | boolean>>;
}

export function createAudioOperation(input: Omit<AudioOperation, "operationId" | "schemaVersion">): AudioResult<AudioOperation> {
  if (hasRawAudioPayload(input) || !input.idempotencyKey.trim() || Object.keys(input.referencePayload).length === 0) return fail("AUDIO_OPERATION_PAYLOAD_INVALID", "Audio operations require an idempotency key and bounded reference payload.");
  const operationId = asAudioOperationId(stableId({ ...input, referencePayload: Object.fromEntries(Object.entries(input.referencePayload).sort(([left], [right]) => left.localeCompare(right))) }));
  return ok({ ...input, operationId, schemaVersion: WP190_SCHEMA_VERSION });
}

export function cancelAudioOperation(operationId: AudioOperationId): AudioResult<{ readonly operationId: AudioOperationId; readonly cancelled: true }> {
  return operationId.trim().length > 0 ? ok({ operationId, cancelled: true }) : fail("AUDIO_CANCELLED", "Audio operation ID is required to cancel an operation.");
}

export function validateAudioMetadata(value: unknown): AudioResult<true> {
  return hasRawAudioPayload(value) ? fail("AUDIO_RAW_PAYLOAD_REJECTED", "Audio metadata cannot contain bytes, samples, blobs, or base64 payloads.") : ok(true);
}
