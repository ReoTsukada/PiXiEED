/**
 * FP-005 integration facade.
 *
 * This is the only cross-track entry point. It accepts versioned, plain-data
 * requests and returns bounded metadata or a fail-closed diagnostic. Provider
 * access, browser state, and production policy are intentionally outside this
 * isolated reference boundary.
 */
import {
  FP005_SCHEMA_VERSION,
  fp005Failure,
  fp005Success,
  type Fp005Diagnostic,
  type Fp005Result,
  type Fp005RetentionDecision,
  type Fp005StorageLocator,
  type Fp005TelemetryEvent,
} from "./contracts.ts";
import { FP005_ERROR_CODES, type Fp005ErrorCode } from "./error-codes.ts";
import { validateArchive, type Fp005ArchiveSummary } from "./archive-validation.ts";
import { validateContent, type Fp005ContentSummary } from "./content-validation.ts";
import {
  validateJsonInput,
  type Fp005JsonSummary,
} from "./input-limits.ts";
import {
  validateNormalizedRelativePath,
  type NormalizedRelativePath,
} from "./path-validation.ts";
import {
  validateStorageLocator as validateCanonicalStorageLocator,
} from "./locator-validation.ts";
import {
  classifyStoragePlacement,
  checkStorageQuota,
  type Fp005StoragePlacementDecision,
  type Fp005StorageQuotaDecision,
} from "./storage-placement.ts";
import {
  validateStorageScope,
  type Fp005StorageScopeBinding,
  type Fp005StorageScopeOptions,
} from "./storage-scope.ts";
import { decideStorageRetention } from "./retention-decision.ts";
import { sanitizeTelemetry, serializeTelemetry } from "./telemetry.ts";

export const FP005_FACADE_VERSION = "FP005_FACADE_V1" as const;
export const FP005_FACADE_MODE = "ISOLATED_REFERENCE" as const;

export const FP005_ACCEPTANCE_IDS = Object.freeze([
  "FP005-PII-001",
  "FP005-STORAGE-001",
  "FP005-INPUT-001",
  "FP005-PATH-001",
  "FP005-TELEMETRY-001",
] as const);

export type Fp005AcceptanceId = typeof FP005_ACCEPTANCE_IDS[number];
export type Fp005BoundaryKind = "STORAGE" | "INPUT" | "MATERIALIZE" | "TELEMETRY" | "RETENTION";

export interface Fp005StorageBoundaryRequest {
  readonly kind: "STORAGE";
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly storage: unknown;
  readonly locator: unknown;
  readonly authorizationProof: unknown;
  readonly authority?: "LOCAL" | "SERVER";
  readonly principalId?: string | null;
  readonly action?: string;
  readonly capability?: string;
  /** Optional caller-observed revision; the server composition must match it. */
  readonly quotaRevision?: string;
}

export interface Fp005InputBoundaryRequest {
  readonly kind: "INPUT";
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly json?: unknown;
  readonly content?: unknown;
  readonly archive?: unknown;
  readonly path?: unknown;
  readonly pathAuthority?: "LOCAL" | "SERVER";
}

export interface Fp005MaterializationBoundaryRequest extends Omit<Fp005StorageBoundaryRequest, "kind"> {
  readonly kind: "MATERIALIZE";
  readonly json?: unknown;
  readonly content?: unknown;
  readonly archive?: unknown;
  readonly path?: unknown;
  readonly pathAuthority?: "LOCAL" | "SERVER";
}

export interface Fp005TelemetryBoundaryRequest {
  readonly kind: "TELEMETRY";
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly telemetry: unknown;
}

export interface Fp005RetentionBoundaryRequest {
  readonly kind: "RETENTION";
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceId: string;
  readonly resourceType?: string;
  readonly assetRevision?: string;
  readonly category: "QUEUE" | "CHECKPOINT" | "CACHE" | "AUTHORITY" | "PURCHASED";
}

export type Fp005BoundaryRequest =
  | Fp005StorageBoundaryRequest
  | Fp005InputBoundaryRequest
  | Fp005MaterializationBoundaryRequest
  | Fp005TelemetryBoundaryRequest
  | Fp005RetentionBoundaryRequest;

export interface Fp005StorageBoundaryResult {
  readonly kind: "STORAGE";
  readonly facadeVersion: typeof FP005_FACADE_VERSION;
  readonly placement: Fp005StoragePlacementDecision;
  readonly scope: Fp005StorageScopeBinding;
  readonly quota: Fp005StorageQuotaDecision;
}

export interface Fp005InputBoundaryResult {
  readonly kind: "INPUT" | "MATERIALIZE";
  readonly facadeVersion: typeof FP005_FACADE_VERSION;
  readonly json?: Fp005JsonSummary;
  readonly content?: Fp005ContentSummary;
  readonly archive?: Fp005ArchiveSummary;
  readonly path?: NormalizedRelativePath;
  readonly placement?: Fp005StoragePlacementDecision;
  readonly scope?: Fp005StorageScopeBinding;
  readonly quota?: Fp005StorageQuotaDecision;
}

export interface Fp005TelemetryBoundaryResult {
  readonly kind: "TELEMETRY";
  readonly facadeVersion: typeof FP005_FACADE_VERSION;
  readonly event: Fp005TelemetryEvent;
  readonly serialized: string;
}

export interface Fp005RetentionBoundaryResult {
  readonly kind: "RETENTION";
  readonly facadeVersion: typeof FP005_FACADE_VERSION;
  readonly decision: Fp005RetentionDecision;
}

export type Fp005BoundaryResult =
  | Fp005StorageBoundaryResult
  | Fp005InputBoundaryResult
  | Fp005TelemetryBoundaryResult
  | Fp005RetentionBoundaryResult;

export interface Fp005FacadeDescriptor {
  readonly facadeVersion: typeof FP005_FACADE_VERSION;
  readonly policySchemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly mode: typeof FP005_FACADE_MODE;
  readonly acceptanceIds: readonly Fp005AcceptanceId[];
}

export const FP005_FACADE: Fp005FacadeDescriptor = Object.freeze({
  facadeVersion: FP005_FACADE_VERSION,
  policySchemaVersion: FP005_SCHEMA_VERSION,
  mode: FP005_FACADE_MODE,
  acceptanceIds: FP005_ACCEPTANCE_IDS,
});

const STORAGE_KEYS = new Set([
  "kind", "schemaVersion", "tenantId", "resourceType", "resourceId", "storage", "locator",
  "authorizationProof", "authority", "principalId", "action", "capability", "quotaRevision",
]);
const INPUT_KEYS = new Set(["kind", "schemaVersion", "json", "content", "archive", "path", "pathAuthority"]);
const MATERIALIZE_KEYS = new Set([
  ...STORAGE_KEYS,
  "json", "content", "archive", "path", "pathAuthority",
]);
const TELEMETRY_KEYS = new Set(["kind", "schemaVersion", "telemetry"]);
const RETENTION_KEYS = new Set(["kind", "schemaVersion", "tenantId", "resourceId", "resourceType", "assetRevision", "category"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function fail<T>(code: Fp005ErrorCode, message: string, path?: string): Fp005Result<T> {
  return fp005Failure(code, message, path);
}

function pass<T>(value: T): Fp005Result<T> {
  return fp005Success(value);
}

function firstFailure<T>(...results: readonly Fp005Result<unknown>[]): Fp005Result<T> | undefined {
  return results.find((result): result is Fp005Result<never> => !result.ok) as Fp005Result<T> | undefined;
}

function sameLocator(left: Fp005StorageLocator, right: Fp005StorageLocator): boolean {
  return left.placement === right.placement
    && left.path === right.path
    && left.contentHash === right.contentHash
    && left.byteLength === right.byteLength
    && left.mimeType === right.mimeType
    && left.tenantId === right.tenantId
    && left.resourceType === right.resourceType
    && left.resourceId === right.resourceId;
}

function validateStorageBoundary(
  input: Record<string, unknown>,
  options: Fp005StorageScopeOptions,
): Fp005Result<Fp005StorageBoundaryResult> {
  const locator = validateCanonicalStorageLocator(input.locator, {
    tenantId: input.tenantId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });
  if (!locator.ok) return locator;

  const placement = classifyStoragePlacement(input.storage);
  if (!placement.ok) return placement;
  if (placement.value.locator === undefined || !sameLocator(placement.value.locator, locator.value)) {
    return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Storage placement and locator are not the same canonical record.", "locator");
  }

  const scope = validateStorageScope({
    schemaVersion: FP005_SCHEMA_VERSION,
    authorizationProof: input.authorizationProof,
    tenantId: input.tenantId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    locator: locator.value,
    ...(input.authority === undefined ? {} : { authority: input.authority }),
    ...(input.principalId === undefined ? {} : { principalId: input.principalId }),
    ...(input.action === undefined ? {} : { action: input.action }),
    ...(input.capability === undefined ? {} : { capability: input.capability }),
  }, options);
  if (!scope.ok) return scope;
  const quota = checkStorageQuota({
    schemaVersion: FP005_SCHEMA_VERSION,
    tenantId: input.tenantId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    incomingBytes: locator.value.byteLength,
    ...(input.quotaRevision === undefined ? {} : { quotaRevision: input.quotaRevision }),
  }, options);
  if (!quota.ok) return quota;
  return pass({
    kind: "STORAGE",
    facadeVersion: FP005_FACADE_VERSION,
    placement: placement.value,
    scope: scope.value,
    quota: quota.value,
  });
}

function validateInputFields(
  input: Record<string, unknown>,
): Fp005Result<Omit<Fp005InputBoundaryResult, "kind" | "facadeVersion" | "placement" | "scope">> {
  const hasInput = ["json", "content", "archive", "path"].some((key) => hasOwn(input, key));
  if (!hasInput) return fail(FP005_ERROR_CODES.INPUT_INVALID, "At least one bounded input is required.");

  const json = hasOwn(input, "json") ? validateJsonInput(input.json) : undefined;
  if (json !== undefined && !json.ok) return json;
  const content = hasOwn(input, "content") ? validateContent(input.content) : undefined;
  if (content !== undefined && !content.ok) return content;
  const archive = hasOwn(input, "archive") ? validateArchive(input.archive) : undefined;
  if (archive !== undefined && !archive.ok) return archive;
  const path = hasOwn(input, "path")
    ? validateNormalizedRelativePath({ path: input.path, authority: input.pathAuthority ?? "LOCAL" })
    : undefined;
  if (path !== undefined && !path.ok) return path;

  return pass({
    ...(json === undefined ? {} : { json: json.value }),
    ...(content === undefined ? {} : { content: content.value }),
    ...(archive === undefined ? {} : { archive: archive.value }),
    ...(path === undefined ? {} : { path: path.value }),
  });
}

function validateInputBoundary(input: Record<string, unknown>): Fp005Result<Fp005InputBoundaryResult> {
  const result = validateInputFields(input);
  if (!result.ok) return result;
  return pass({ kind: "INPUT", facadeVersion: FP005_FACADE_VERSION, ...result.value });
}

function validateMaterializationBoundary(
  input: Record<string, unknown>,
  options: Fp005StorageScopeOptions,
): Fp005Result<Fp005InputBoundaryResult> {
  const inputResult = validateInputFields(input);
  if (!inputResult.ok) return inputResult;
  const storage = validateStorageBoundary(input, options);
  if (!storage.ok) return storage;
  return pass({
    kind: "MATERIALIZE",
    facadeVersion: FP005_FACADE_VERSION,
    ...inputResult.value,
    placement: storage.value.placement,
    scope: storage.value.scope,
    quota: storage.value.quota,
  });
}

function validateTelemetryBoundary(input: Record<string, unknown>): Fp005Result<Fp005TelemetryBoundaryResult> {
  const event = sanitizeTelemetry(input.telemetry);
  if (!event.ok) return event;
  const serialized = serializeTelemetry(input.telemetry);
  if (!serialized.ok) return serialized;
  return pass({ kind: "TELEMETRY", facadeVersion: FP005_FACADE_VERSION, event: event.value, serialized: serialized.value });
}

function validateRetentionBoundary(
  input: Record<string, unknown>,
  options: Fp005StorageScopeOptions,
): Fp005Result<Fp005RetentionBoundaryResult> {
  const decision = decideStorageRetention({
    schemaVersion: FP005_SCHEMA_VERSION,
    tenantId: input.tenantId,
    resourceId: input.resourceId,
    ...(input.resourceType === undefined ? {} : { resourceType: input.resourceType }),
    ...(input.assetRevision === undefined ? {} : { assetRevision: input.assetRevision }),
    category: input.category,
  }, options);
  if (!decision.ok) return decision;
  return pass({ kind: "RETENTION", facadeVersion: FP005_FACADE_VERSION, decision: decision.value });
}

/**
 * Validate a cross-track request. The caller cannot provide an `ok`, `allow`,
 * `trusted`, placement decision, or diagnostic as authority; those values are
 * derived only by the canonical Track implementations above.
 */
export function validateFp005Boundary(
  input: unknown,
  options: Fp005StorageScopeOptions = {},
): Fp005Result<Fp005BoundaryResult> {
  if (!isPlainRecord(input)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "FP-005 boundary request is invalid.");
  if (input.schemaVersion !== FP005_SCHEMA_VERSION) return fail(FP005_ERROR_CODES.SCHEMA_UNSUPPORTED, "FP-005 schema version is unsupported.", "schemaVersion");
  if (typeof input.kind !== "string") return fail(FP005_ERROR_CODES.INPUT_INVALID, "FP-005 boundary kind is required.", "kind");

  switch (input.kind as Fp005BoundaryKind) {
    case "STORAGE":
      if (!hasOnlyKeys(input, STORAGE_KEYS)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Storage boundary contains an unsupported field.");
      return validateStorageBoundary(input, options);
    case "INPUT":
      if (!hasOnlyKeys(input, INPUT_KEYS)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Input boundary contains an unsupported field.");
      return validateInputBoundary(input);
    case "MATERIALIZE":
      if (!hasOnlyKeys(input, MATERIALIZE_KEYS)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Materialization boundary contains an unsupported field.");
      return validateMaterializationBoundary(input, options);
    case "TELEMETRY":
      if (!hasOnlyKeys(input, TELEMETRY_KEYS)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Telemetry boundary contains an unsupported field.");
      return validateTelemetryBoundary(input);
    case "RETENTION":
      if (!hasOnlyKeys(input, RETENTION_KEYS)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Retention boundary contains an unsupported field.");
      return validateRetentionBoundary(input, options);
    default:
      return fail(FP005_ERROR_CODES.INPUT_INVALID, "FP-005 boundary kind is unsupported.", "kind");
  }
}

export const validateBoundary = validateFp005Boundary;
export const fp005Facade = FP005_FACADE;
export type Fp005DiagnosticView = Fp005Diagnostic;
