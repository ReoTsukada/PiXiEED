/** FP-005 versioned privacy, storage, and input contracts. */
import type { AuthorizationProofV1, ContentHash } from "../wp160-contracts.ts";
import type { Fp005ErrorCode } from "./error-codes.ts";

export const FP005_SCHEMA_VERSION = "FP005_V1" as const;
export type Fp005SchemaVersion = typeof FP005_SCHEMA_VERSION;

export type Fp005Result<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Fp005Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Fp005Diagnostic[] };

export interface Fp005Diagnostic {
  readonly code: Fp005ErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly path?: string;
}

export function fp005Success<T>(value: T, diagnostics: readonly Fp005Diagnostic[] = []): Fp005Result<T> {
  return { ok: true, value, diagnostics };
}

export function fp005Failure<T = never>(code: Fp005ErrorCode, message: string, path?: string): Fp005Result<T> {
  return { ok: false, diagnostics: [{ code, message, recoverable: false, ...(path === undefined ? {} : { path }) }] };
}

export type Fp005StoragePlacement = "MEMORY" | "INDEXED_DB" | "OPFS" | "DATABASE" | "OBJECT_STORAGE";
export type Fp005StorageClass = "ACTIVE_STATE" | "JOURNAL_METADATA" | "LARGE_BLOB" | "AUTHORITY_METADATA" | "IMMUTABLE_BLOB";
export interface StoragePolicyV1 {
  readonly schemaVersion: Fp005SchemaVersion;
  readonly placementByClass: Readonly<Record<Fp005StorageClass, Fp005StoragePlacement>>;
  readonly callerPathAllowed: false;
}

/** Compatible with existing locator consumers: placement, path, hash, and byte length remain stable. */
export interface Fp005StorageLocator {
  readonly placement: Fp005StoragePlacement;
  readonly path: string;
  readonly contentHash: ContentHash;
  readonly byteLength: number;
  readonly mimeType?: string;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
}
export type StorageLocator = Fp005StorageLocator;

export interface Fp005StorageInput {
  readonly schemaVersion: Fp005SchemaVersion;
  readonly storageClass: Fp005StorageClass;
  readonly locator?: Fp005StorageLocator;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly contentHash?: ContentHash;
  readonly byteLength?: number;
  readonly mimeType?: string;
  readonly durable: boolean;
}

export interface Fp005InputLimits {
  readonly schemaVersion: Fp005SchemaVersion;
  readonly maxEnvelopeBytes: number;
  readonly maxJsonDepth: number;
  readonly maxCollectionItems: number;
  readonly maxStringBytes: number;
  readonly maxPathBytes: number;
  readonly maxPathSegments: number;
  readonly maxBlobBytes: number;
  readonly maxArchiveEntries: number;
  readonly maxExpandedArchiveBytes: number;
  readonly maxCompressionRatio: number;
}
export type InputLimitPolicyV1 = Fp005InputLimits;

export interface Fp005PathInput { readonly path: string; readonly authority: "LOCAL" | "SERVER"; }
export interface Fp005PathResult { readonly normalizedPath: string; readonly segments: readonly string[]; }
export interface PathPolicyV1 {
  readonly schemaVersion: Fp005SchemaVersion;
  readonly maxPathBytes: number;
  readonly maxPathSegments: number;
  readonly relativeOnly: true;
}

export interface Fp005RedactionPolicy {
  readonly schemaVersion: Fp005SchemaVersion;
  readonly forbiddenFields: readonly string[];
  readonly maxDiagnosticBytes: 1024;
}
export type RedactionPolicyV1 = Fp005RedactionPolicy;

export interface Fp005TelemetryEvent {
  readonly schemaVersion: Fp005SchemaVersion;
  readonly eventName: string;
  readonly operationId?: string;
  readonly feature?: string;
  readonly durationMs?: number;
  readonly result: "OK" | "ERROR" | "DROPPED";
  readonly errorCode?: Fp005ErrorCode;
}
export interface TelemetryPolicyV1 {
  readonly schemaVersion: Fp005SchemaVersion;
  readonly allowlisted: true;
  readonly maxEventNameBytes: number;
}

export interface Fp005RetentionDecision {
  readonly schemaVersion: Fp005SchemaVersion;
  readonly tenantId: string;
  readonly resourceId: string;
  readonly category: "QUEUE" | "CHECKPOINT" | "CACHE" | "AUTHORITY" | "PURCHASED";
  readonly action: "DELETE" | "RETAIN";
  readonly protectedBytes: boolean;
}
export interface RetentionPolicyV1 {
  readonly schemaVersion: Fp005SchemaVersion;
  readonly protectedCategories: readonly ("AUTHORITY" | "PURCHASED")[];
}

export interface Fp005AccessContext {
  readonly authorizationProof: AuthorizationProofV1;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
}
