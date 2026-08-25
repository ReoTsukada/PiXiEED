/**
 * WP-160 shared contracts.
 *
 * This module is deliberately independent of the Draw2 editor, DOM, Canvas,
 * network clients, storage adapters, and package materialization code. It is
 * the small common vocabulary shared by the isolated Runtime and Build paths.
 */

export type Brand<T, Name extends string> = T & { readonly __wp160Brand: Name };

export type GameProjectId = Brand<string, "GameProjectId">;
export type GamePreviewId = Brand<string, "GamePreviewId">;
export type PackageId = Brand<string, "PackageId">;
export type AssetId = Brand<string, "AssetId">;
export type AssetRevisionId = Brand<string, "AssetRevisionId">;
export type BuildArtifactId = Brand<string, "BuildArtifactId">;
export type DependencySnapshotHash = Brand<string, "DependencySnapshotHash">;
export type ContentHash = Brand<string, "ContentHash">;

export type AssetReferenceMode = "LIVE" | "PINNED" | "REVIEW" | "FORKED";
export type BuildTarget = "PIXIEED_NATIVE_WEB_RUNTIME" | "GENERIC_WEB_PACKAGE";
export type BuildConfigurationVersion = Brand<string, "BuildConfigurationVersion">;

/**
 * TypeScript view of the canonical core-shell AuthorizationProofV1 JSON contract.
 * This is a schema binding, not a second authorization system. Server adapters remain the
 * authority; these helpers only enforce the same shape, scope, allow decision, and expiry at
 * this framework-free boundary.
 */
export const AUTHORIZATION_PROOF_SCHEMA_VERSION = 1 as const;
export const AUTHORIZATION_PROOF_TYPE = "AUTHORIZATION_PROOF" as const;
export const AUTHORIZATION_PROOF_SOURCE = "server" as const;
export const AUTHORIZATION_PROOF_POLICY_VERSION = "authorization-policy-v1" as const;
export const AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
export type AuthorizationDecision = "allow" | "deny" | "unknown";

export interface AuthorizationProofV1 {
  readonly schemaVersion: 1;
  readonly proofType: "AUTHORIZATION_PROOF";
  readonly source: "server";
  readonly decision: AuthorizationDecision;
  readonly authorityId: string;
  readonly proofId: string;
  readonly principalId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
  readonly tenantId: string | null;
  readonly correlationId: string | null;
  readonly policyVersion: string;
  readonly grantId: string | null;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface AuthorizationProofExpectation {
  readonly principalId?: string | null;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly action?: string;
  readonly capability?: string;
  readonly tenantId?: string | null;
  readonly correlationId?: string | null;
  readonly policyVersion?: string;
}

export type AuthorizationProofResolver = (input: {
  readonly callerProof: AuthorizationProofV1;
  readonly expected: AuthorizationProofExpectation;
}) => AuthorizationProofV1;

const AUTHORIZATION_PROOF_KEYS = new Set([
  "schemaVersion", "proofType", "source", "decision", "authorityId", "proofId", "principalId",
  "resourceType", "resourceId", "action", "capability", "tenantId", "correlationId", "policyVersion",
  "grantId", "issuedAt", "expiresAt",
]);

function authorizationText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}

function authorizationNullableText(value: unknown): value is string | null {
  return value === null || authorizationText(value);
}

export function isAuthorizationProofV1(value: unknown, expected: AuthorizationProofExpectation = {}): value is AuthorizationProofV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proof = value as Record<string, unknown>;
  if (Object.keys(proof).some((key) => !AUTHORIZATION_PROOF_KEYS.has(key))) return false;
  if (proof.schemaVersion !== AUTHORIZATION_PROOF_SCHEMA_VERSION || proof.proofType !== AUTHORIZATION_PROOF_TYPE || proof.source !== AUTHORIZATION_PROOF_SOURCE) return false;
  if (!(["allow", "deny", "unknown"] as const).includes(proof.decision as AuthorizationDecision)) return false;
  if (!["authorityId", "proofId", "resourceType", "resourceId", "action", "capability", "policyVersion", "issuedAt", "expiresAt"].every((key) => authorizationText(proof[key]))) return false;
  if (!authorizationNullableText(proof.principalId) || !authorizationNullableText(proof.tenantId) || !authorizationNullableText(proof.correlationId) || !authorizationNullableText(proof.grantId)) return false;
  const issuedAt = Date.parse(proof.issuedAt as string);
  const expiresAt = Date.parse(proof.expiresAt as string);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) return false;
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== undefined && proof[key] !== expectedValue) return false;
  }
  return true;
}

export function requireAuthorizationProofV1(value: unknown, expected: AuthorizationProofExpectation = {}): AuthorizationProofV1 {
  if (!isAuthorizationProofV1(value, expected)) throw new Error("AuthorizationProofV1 is invalid or not bound to the requested scope.");
  const proof = value as AuthorizationProofV1;
  if (proof.decision !== "allow") throw new Error("AuthorizationProofV1 did not grant the requested capability.");
  const now = Date.now();
  const issuedAt = Date.parse(proof.issuedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (issuedAt > now + AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS) throw new Error("AuthorizationProofV1 was issued in the future.");
  if (expiresAt <= now) throw new Error("AuthorizationProofV1 has expired.");
  if (expiresAt - issuedAt > AUTHORIZATION_PROOF_MAX_LIFETIME_MS) throw new Error("AuthorizationProofV1 lifetime exceeds policy.");
  return proof;
}

/** Resolve caller context through a server-owned adapter; the caller object is never returned as authority. */
export function resolveAuthorizationProofV1(
  callerProof: unknown,
  expected: AuthorizationProofExpectation,
  resolver: AuthorizationProofResolver,
): AuthorizationProofV1 {
  if (typeof resolver !== "function") throw new Error("A server-owned AuthorizationProof resolver is required.");
  const caller = requireAuthorizationProofV1(callerProof, expected);
  return requireAuthorizationProofV1(resolver({ callerProof: caller, expected }), expected);
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function brandedId<T extends string>(value: string, label: string): Brand<string, T> {
  if (!SAFE_ID.test(value)) throw new Error(`${label} must be a non-empty stable identifier.`);
  return value as Brand<string, T>;
}

export function asGameProjectId(value: string): GameProjectId { return brandedId<"GameProjectId">(value, "GameProjectId"); }
export function asGamePreviewId(value: string): GamePreviewId { return brandedId<"GamePreviewId">(value, "GamePreviewId"); }
export function asPackageId(value: string): PackageId { return brandedId<"PackageId">(value, "PackageId"); }
export function asAssetId(value: string): AssetId { return brandedId<"AssetId">(value, "AssetId"); }
export function asAssetRevisionId(value: string): AssetRevisionId { return brandedId<"AssetRevisionId">(value, "AssetRevisionId"); }
export function asBuildArtifactId(value: string): BuildArtifactId { return brandedId<"BuildArtifactId">(value, "BuildArtifactId"); }

export function asSha256(value: string, label = "Hash"): ContentHash {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
  return value as ContentHash;
}

export function asDependencySnapshotHash(value: string): DependencySnapshotHash {
  if (!SHA256.test(value)) throw new Error("DependencySnapshotHash must be a lowercase SHA-256 hash.");
  return value as DependencySnapshotHash;
}

export interface DependencyLockEntry {
  readonly assetId: AssetId;
  readonly revisionId: AssetRevisionId;
  readonly contentHash: ContentHash;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly mode: AssetReferenceMode;
  readonly required: boolean;
}

export interface DependencySnapshot {
  readonly packageId: PackageId;
  readonly packageVersion: string;
  readonly entries: readonly DependencyLockEntry[];
  readonly snapshotHash: DependencySnapshotHash;
  readonly locked: boolean;
}

export type RuntimeDiagnosticCode =
  | "MISSING_REQUIRED_ASSET"
  | "OPTIONAL_ASSET_MISSING"
  | "UNSUPPORTED_RUNTIME_VERSION"
  | "UNSUPPORTED_CAPABILITY"
  | "HASH_MISMATCH"
  | "PACKAGE_INVALID"
  | "ASSET_QUARANTINED"
  | "LOAD_FAILED"
  | "AUDIO_UNAVAILABLE"
  | "RENDERER_UNAVAILABLE"
  | "DEPENDENCY_LOCK_MISMATCH"
  | "HOT_RELOAD_REJECTED"
  | "SCRIPT_CAPABILITY_DENIED"
  | "BUILD_NOT_READY"
  | "BUILD_CANCELLED"
  | "BUILD_INVALID_REQUEST"
  | "SECURITY_POLICY_REJECTED";

export type DiagnosticSeverity = "INFO" | "WARNING" | "ERROR";

export interface RuntimeDiagnostic {
  readonly code: RuntimeDiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly assetId?: AssetId;
  readonly packageId?: PackageId;
  readonly recoverable: boolean;
}

export type FeatureFlagName =
  | "game-core-read"
  | "game-core-write"
  | "runtime-preview"
  | "runtime-execution"
  | "game-build"
  | "game-build-cache"
  | "game-publish";

export type FeatureFlags = Readonly<Record<FeatureFlagName, boolean>>;

export const DEFAULT_WP160_FEATURE_FLAGS: FeatureFlags = Object.freeze({
  "game-core-read": false,
  "game-core-write": false,
  "runtime-preview": false,
  "runtime-execution": false,
  "game-build": false,
  "game-build-cache": false,
  "game-publish": false,
});

/** Unknown flags remain disabled; the kill switch always wins over an enabled flag. */
export function canExecuteRuntime(flags: Readonly<Record<string, boolean | undefined>>, killSwitch: boolean): boolean {
  return killSwitch !== true && flags["runtime-execution"] === true;
}

export interface RuntimeCapabilityProfile {
  readonly pointer: boolean;
  readonly touch: boolean;
  readonly keyboard: boolean;
  readonly mouse: boolean;
  readonly gamepad: boolean;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly devicePixelRatio: number;
  readonly audio: boolean;
  readonly graphics: "CANVAS2D" | "WEBGPU" | "NONE";
  readonly webGpuBenefitMeasured: boolean;
  readonly reducedMotion: boolean;
}

export interface RuntimeVersionContract {
  readonly runtimeId: string;
  readonly runtimeVersion: string;
  readonly supportedManifestVersion: number;
}

export interface BuildConfiguration {
  readonly version: BuildConfigurationVersion;
  readonly optimization: "DEBUG" | "RELEASE";
  readonly compression: "NONE" | "GZIP" | "BROTLI";
  readonly capabilityProfile: string;
  readonly toolchainVersion: string;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

function jsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not accept non-finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => jsonValue(item));
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = jsonValue(item);
    }
    return result;
  }
  throw new Error("Canonical JSON accepts only JSON-compatible values.");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(jsonValue(value));
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashCanonical(value: unknown): Promise<ContentHash> {
  return asSha256(await sha256Hex(canonicalJson(value)), "ContentHash");
}

export function sortDependencyEntries(entries: readonly DependencyLockEntry[]): readonly DependencyLockEntry[] {
  return [...entries].sort((left, right) => left.assetId.localeCompare(right.assetId) || left.revisionId.localeCompare(right.revisionId));
}

export async function calculateDependencySnapshotHash(
  packageId: PackageId,
  packageVersion: string,
  entries: readonly DependencyLockEntry[],
): Promise<DependencySnapshotHash> {
  const canonicalEntries = sortDependencyEntries(entries);
  return asDependencySnapshotHash(await sha256Hex(canonicalJson({ packageId, packageVersion, entries: canonicalEntries })));
}
