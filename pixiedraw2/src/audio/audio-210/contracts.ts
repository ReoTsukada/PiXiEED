/**
 * AUDIO-210 host-neutral event binding and preview contracts.
 *
 * This package consumes AUDIO-200 canonical metadata only.  It never owns raw
 * audio bytes and deliberately has no DOM, AudioContext, storage, filesystem,
 * network, production-route, Market, or PiXYNC dependency.
 */

import type {
  AudioAssetId,
  AudioAssetKind,
  AudioContentHash,
  AudioProject,
  AudioProjectId,
  AudioReferenceMode,
  AudioRevision,
  AudioRevisionId,
  AudioSourceBlobLocator,
} from "../audio-200/index.ts";

export const AUDIO210_SCHEMA_VERSION = "AUDIO-210_V1" as const;
export const AUDIO210_PREVIEW_SCHEMA_VERSION = "AUDIO-210_PREVIEW_V1" as const;
export const AUDIO210_PLAYBACK_SCHEMA_VERSION = "AUDIO-210_PLAYBACK_V1" as const;
export const AUDIO210_EXPORT_SCHEMA_VERSION = "AUDIO-210_EXPORT_V1" as const;

export type Audio210Brand<Name extends string> = string & { readonly __audio210Brand: Name };
export type AudioEventId = Audio210Brand<"AudioEventId">;
export type AudioPreviewId = Audio210Brand<"AudioPreviewId">;
export type AudioGraphHash = AudioContentHash;

export type AudioEventKind = "BGM" | "SFX" | "VOICE";
export type AudioEventTrigger = "PROJECT_START" | "PROJECT_STOP" | "FRAME_ENTER" | "NOTE_ON" | "CUSTOM";
export type AudioBindingMode = Extract<AudioReferenceMode, "LIVE" | "PINNED">;
export type AudioPreviewStatus = "ACTIVE" | "CANCELLED" | "COMMITTED";
export type AudioPlaybackBoundary = "START" | "LOOP_BOUNDARY" | "STOPPED";

export interface AudioEventIdentity {
  readonly eventId: AudioEventId;
  readonly eventKey: string;
  readonly projectId: AudioProjectId;
}

export interface AudioEventBinding {
  readonly schemaVersion: typeof AUDIO210_SCHEMA_VERSION;
  readonly identity: AudioEventIdentity;
  readonly projectRevision: number;
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly revisionNumber: number;
  readonly contentHash: AudioContentHash;
  readonly assetKind: AudioAssetKind;
  readonly eventKind: AudioEventKind;
  readonly trigger: AudioEventTrigger;
  readonly referenceMode: AudioBindingMode;
  readonly gainMilliDb: number;
  readonly loop: boolean;
  readonly startOffsetUs: number;
  readonly bindingHash: AudioContentHash;
}

export interface AudioEventGraph {
  readonly schemaVersion: typeof AUDIO210_SCHEMA_VERSION;
  readonly projectId: AudioProjectId;
  readonly projectRevision: number;
  readonly graphRevision: number;
  readonly stateHash: AudioGraphHash;
  readonly bindings: readonly AudioEventBinding[];
}

export interface AudioEventBindingInput {
  readonly eventKey: string;
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly eventKind: AudioEventKind;
  readonly trigger: AudioEventTrigger;
  readonly referenceMode: AudioBindingMode;
  readonly gainMilliDb?: number;
  readonly loop?: boolean;
  readonly startOffsetUs?: number;
}

/** Untrusted claims may be supplied by a bridge, but are never authority. */
export interface AudioEventCallerClaims {
  readonly eventId?: string;
  readonly projectId?: string;
  readonly assetId?: string;
  readonly revisionId?: string;
  readonly contentHash?: string;
}

export interface AudioPreviewState {
  readonly schemaVersion: typeof AUDIO210_PREVIEW_SCHEMA_VERSION;
  readonly mode: "PREVIEW";
  readonly previewId: AudioPreviewId;
  readonly projectId: AudioProjectId;
  readonly baseProjectRevision: number;
  readonly baseGraphHash: AudioGraphHash;
  readonly status: AudioPreviewStatus;
  readonly draftBindings: readonly AudioEventBinding[];
  readonly previewHash: AudioGraphHash;
}

export interface AudioPreviewCommit {
  readonly preview: AudioPreviewState;
  readonly graph: AudioEventGraph;
  readonly currentProjectRevision: number;
  readonly currentGraphHash: AudioGraphHash;
}

export interface AudioPlaybackRequest {
  readonly eventId: AudioEventId;
  readonly currentPlayback?: {
    readonly isPlaying: boolean;
    readonly revisionId: AudioRevisionId;
    readonly loop: boolean;
  };
  readonly boundaryReached?: boolean;
}

export interface AudioPlaybackPlan {
  readonly schemaVersion: typeof AUDIO210_PLAYBACK_SCHEMA_VERSION;
  readonly projectId: AudioProjectId;
  readonly eventId: AudioEventId;
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly revisionNumber: number;
  readonly contentHash: AudioContentHash;
  readonly referenceMode: AudioBindingMode;
  readonly gainMilliDb: number;
  readonly loop: boolean;
  readonly startOffsetUs: number;
  readonly safeBoundary: AudioPlaybackBoundary;
  readonly deferred: boolean;
}

export interface AudioDecodeRequest {
  readonly projectId: AudioProjectId;
  readonly eventId: AudioEventId;
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly contentHash: AudioContentHash;
  readonly byteLength: number;
  readonly codec: AudioRevision["source"]["metadata"]["codec"];
  readonly mimeType: AudioRevision["source"]["metadata"]["mimeType"];
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly durationUs: number;
  readonly locator: AudioSourceBlobLocator;
}

export type AudioDecodeAdapterResult =
  | {
      readonly status: "DECODED";
      readonly codec: AudioDecodeRequest["codec"];
      readonly sampleRateHz: number;
      readonly channels: 1 | 2;
      readonly durationUs: number;
      readonly byteLength: number;
      readonly contentHash: AudioContentHash;
    }
  | { readonly status: "UNSUPPORTED"; readonly reason: string }
  | { readonly status: "OFFLINE"; readonly reason: string }
  | { readonly status: "FAILED"; readonly reason: string };

export interface AudioDecodeAdapter {
  readonly decode: (request: AudioDecodeRequest) => Promise<AudioDecodeAdapterResult>;
}

export type AudioPlaybackAdapterResult =
  | { readonly status: "STARTED" }
  | { readonly status: "DEFERRED" }
  | { readonly status: "FAILED"; readonly reason: string };

export interface AudioPlaybackAdapter {
  readonly play: (plan: AudioPlaybackPlan) => Promise<AudioPlaybackAdapterResult>;
}

export interface AudioExportPlan {
  readonly schemaVersion: typeof AUDIO210_EXPORT_SCHEMA_VERSION;
  readonly projectId: AudioProjectId;
  readonly graphRevision: number;
  readonly dependencyHashes: readonly AudioContentHash[];
  readonly bindings: readonly AudioEventBinding[];
  readonly exportHash: AudioGraphHash;
}

export type AudioExportAdapterResult =
  | {
      readonly status: "EXPORTED";
      readonly locator: string;
      readonly contentHash: AudioContentHash;
      readonly byteLength: number;
      readonly mimeType: string;
    }
  | { readonly status: "OFFLINE"; readonly reason: string }
  | { readonly status: "FAILED"; readonly reason: string };

export interface AudioExportAdapter {
  readonly encode: (plan: AudioExportPlan) => Promise<AudioExportAdapterResult>;
}

export type Audio210DiagnosticCode =
  | "AUDIO210_INVALID_INPUT"
  | "AUDIO210_GRAPH_INVALID"
  | "AUDIO210_WRONG_PROJECT"
  | "AUDIO210_ASSET_REVISION_MISMATCH"
  | "AUDIO210_REVISION_NOT_FOUND"
  | "AUDIO210_EVENT_NOT_FOUND"
  | "AUDIO210_EVENT_IDENTITY_MISMATCH"
  | "AUDIO210_DUPLICATE_EVENT"
  | "AUDIO210_STALE_PROJECT_REVISION"
  | "AUDIO210_STALE_PREVIEW"
  | "AUDIO210_PREVIEW_CANCELLED"
  | "AUDIO210_PREVIEW_COMMITTED"
  | "AUDIO210_UNSUPPORTED_CODEC"
  | "AUDIO210_DECODE_FAILED"
  | "AUDIO210_OFFLINE"
  | "AUDIO210_RAW_PAYLOAD_REJECTED"
  | "AUDIO210_ADAPTER_INVALID"
  | "AUDIO210_PLAYBACK_UNSAFE"
  | "AUDIO210_EXPORT_REQUIRES_PINNED"
  | "AUDIO210_EXPORT_FAILED";

export interface Audio210Diagnostic {
  readonly code: Audio210DiagnosticCode;
  readonly message: string;
  readonly path?: string;
  readonly recoverable: boolean;
}

export type Audio210Result<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Audio210Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Audio210Diagnostic[] };

export function audio210Ok<T>(value: T, diagnostics: readonly Audio210Diagnostic[] = []): Audio210Result<T> {
  return { ok: true, value, diagnostics };
}

export function audio210Fail<T>(
  code: Audio210DiagnosticCode,
  message: string,
  path?: string,
  recoverable = false,
): Audio210Result<T> {
  return {
    ok: false,
    diagnostics: [{ code, message, ...(path === undefined ? {} : { path }), recoverable }],
  };
}

export function audio210Diagnostic(
  code: Audio210DiagnosticCode,
  message: string,
  path?: string,
  recoverable = false,
): Audio210Diagnostic {
  return { code, message, ...(path === undefined ? {} : { path }), recoverable };
}

export function asAudioEventId(value: string): AudioEventId {
  return value as AudioEventId;
}

export function asAudioPreviewId(value: string): AudioPreviewId {
  return value as AudioPreviewId;
}
