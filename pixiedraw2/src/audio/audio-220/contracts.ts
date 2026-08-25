import type {
  AudioContentHash,
  AudioProjectId,
  AudioRevisionId,
  AudioSourceBlobLocator,
} from "../audio-200/contracts.ts";
import type { AudioEventGraph } from "../audio-210/contracts.ts";

export const AUDIO220_SCHEMA_VERSION = "AUDIO-220_V1" as const;
export const AUDIO220_ARCHIVE_VERSION = "AUDIO-220_ARCHIVE_V1" as const;

export type Audio220PackageId = string & { readonly __audio220PackageId: true };
export type Audio220PackageHash = AudioContentHash;
export type Audio220DiagnosticCode =
  | "AUDIO220_INVALID_INPUT"
  | "AUDIO220_UNSUPPORTED_SCHEMA"
  | "AUDIO220_UNSUPPORTED_LICENSE"
  | "AUDIO220_AMBIGUOUS_LICENSE"
  | "AUDIO220_MISSING_DEPENDENCY"
  | "AUDIO220_DUPLICATE_DEPENDENCY"
  | "AUDIO220_DEPENDENCY_CYCLE"
  | "AUDIO220_UNLOCKED_REVISION"
  | "AUDIO220_HASH_MISMATCH"
  | "AUDIO220_MANIFEST_TAMPERED"
  | "AUDIO220_PATH_TRAVERSAL"
  | "AUDIO220_RAW_PAYLOAD_REJECTED"
  | "AUDIO220_INVALID_EXPORT"
  | "AUDIO220_OFFLINE"
  | "AUDIO220_CANCELLED";

export interface Audio220Diagnostic {
  readonly code: Audio220DiagnosticCode;
  readonly message: string;
  readonly path?: string;
  readonly recoverable: boolean;
}

export type Audio220Result<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Audio220Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Audio220Diagnostic[] };

export type Audio220Materialization = "THIN" | "PORTABLE";
export type Audio220DependencyKind = "AUDIO_SOURCE" | "AUDIO_RENDERED";
export type Audio220LicenseKind = "CC0" | "CC_BY" | "CC_BY_SA" | "PROPRIETARY";

export interface Audio220LicenseSnapshot {
  readonly snapshotId: string;
  readonly licenseId: string;
  readonly kind: Audio220LicenseKind;
  readonly version: string;
  readonly subjectId: string;
  readonly holderId: string;
  readonly attributionRequired: boolean;
  readonly derivativeAllowed: boolean;
  readonly commercialUseAllowed: boolean;
  readonly sourceUri: string;
  readonly snapshotHash: AudioContentHash;
}

export interface Audio220ProvenanceSnapshot {
  readonly origin: "CREATED" | "IMPORTED" | "DERIVED";
  readonly creatorId: string;
  readonly sourceRevisionId: AudioRevisionId;
  readonly sourceHash: AudioContentHash;
  readonly derivedFromRevisionId?: AudioRevisionId;
  readonly snapshotHash: AudioContentHash;
}

export interface Audio220DependencyLockEntry {
  readonly dependencyId: string;
  readonly kind: Audio220DependencyKind;
  readonly projectId: AudioProjectId;
  readonly assetId: string;
  readonly revisionId: AudioRevisionId;
  readonly revisionNumber: number;
  readonly contentHash: AudioContentHash;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly locator: AudioSourceBlobLocator;
  readonly renderedLocator?: AudioSourceBlobLocator;
  readonly licenseSnapshotHash: AudioContentHash;
  readonly provenanceSnapshotHash: AudioContentHash;
  readonly dependsOn: readonly string[];
  readonly mode: "PINNED";
}

export interface Audio220PackageManifest {
  readonly schemaVersion: typeof AUDIO220_SCHEMA_VERSION;
  readonly archiveVersion: typeof AUDIO220_ARCHIVE_VERSION;
  readonly packageId: Audio220PackageId;
  readonly projectId: AudioProjectId;
  readonly materialization: Audio220Materialization;
  readonly audioRevisionId: AudioRevisionId;
  readonly graphHash: AudioContentHash;
  readonly dependencyLockHash: AudioContentHash;
  readonly licenseSnapshotHashes: readonly AudioContentHash[];
  readonly provenanceSnapshotHashes: readonly AudioContentHash[];
  readonly licenseSnapshots: readonly Audio220LicenseSnapshot[];
  readonly provenanceSnapshots: readonly Audio220ProvenanceSnapshot[];
  readonly dependencies: readonly Audio220DependencyLockEntry[];
  readonly manifestHash: Audio220PackageHash;
}

export interface Audio220PackageEnvelope {
  readonly schemaVersion: typeof AUDIO220_SCHEMA_VERSION;
  readonly manifest: Audio220PackageManifest;
  readonly packageHash: Audio220PackageHash;
}

export interface Audio220Authority {
  readonly resolveLicense: (revisionId: AudioRevisionId) => Audio220LicenseSnapshot | null;
  readonly resolveProvenance: (revisionId: AudioRevisionId) => Audio220ProvenanceSnapshot | null;
}

export interface Audio220CallerClaims {
  readonly packageId?: string;
  readonly projectId?: string;
  readonly revisionId?: string;
  readonly contentHash?: string;
  readonly licenseId?: string;
  readonly locator?: string;
}

export function audio220Ok<T>(value: T, diagnostics: readonly Audio220Diagnostic[] = []): Audio220Result<T> {
  return { ok: true, value, diagnostics };
}

export function audio220Fail<T>(code: Audio220DiagnosticCode, message: string, path?: string): Audio220Result<T> {
  return { ok: false, diagnostics: [{ code, message, ...(path === undefined ? {} : { path }), recoverable: false }] };
}

export function asAudio220PackageId(value: string): Audio220PackageId {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(value)) throw new Error("Invalid AUDIO-220 package id.");
  return value as Audio220PackageId;
}
