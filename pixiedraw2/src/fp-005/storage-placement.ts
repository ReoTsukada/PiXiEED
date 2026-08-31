/** FP-005 storage placement and quota boundary. */
import { FP005_ERROR_CODES, type Fp005ErrorCode } from "./error-codes.ts";
import {
  FP005_INPUT_LIMITS,
  FP005_STORAGE_POLICY,
  validateStorageInput,
  validateStorageLocator,
} from "./policies.ts";
import {
  FP005_SCHEMA_VERSION,
  fp005Failure,
  fp005Success,
  type Fp005Result,
  type Fp005StorageClass,
  type Fp005StorageInput,
  type Fp005StorageLocator,
  type Fp005StoragePlacement,
} from "./contracts.ts";
import { getFp005ServerPolicyComposition } from "./server-policy-composition.ts";

const STORAGE_CLASSES = new Set<Fp005StorageClass>([
  "ACTIVE_STATE",
  "JOURNAL_METADATA",
  "LARGE_BLOB",
  "AUTHORITY_METADATA",
  "IMMUTABLE_BLOB",
]);
const STORAGE_PLACEMENTS = new Set<Fp005StoragePlacement>([
  "MEMORY",
  "INDEXED_DB",
  "OPFS",
  "DATABASE",
  "OBJECT_STORAGE",
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const INPUT_KEYS = new Set([
  "schemaVersion",
  "storageClass",
  "locator",
  "tenantId",
  "resourceType",
  "resourceId",
  "contentHash",
  "byteLength",
  "mimeType",
  "durable",
]);
const LOCATOR_KEYS = new Set([
  "placement",
  "path",
  "contentHash",
  "byteLength",
  "mimeType",
  "tenantId",
  "resourceType",
  "resourceId",
]);
const RAW_FIELD_NAMES = new Set([
  "blob",
  "rawblob",
  "rawbytes",
  "bytes",
  "bytearray",
  "arraybuffer",
  "binary",
  "body",
  "data",
  "payload",
  "content",
]);

export interface Fp005StoragePlacementDecision {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly storageClass: Fp005StorageClass;
  readonly expectedPlacement: Fp005StoragePlacement;
  readonly placement: Fp005StoragePlacement;
  readonly durable: boolean;
  readonly locator?: Fp005StorageLocator;
  readonly rawBlobAccepted: false;
}

export interface Fp005StorageQuotaInput {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly quotaBytes: number;
  readonly usedBytes: number;
  readonly incomingBytes: number;
}

export interface Fp005StorageQuotaResolveRequest {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestedBytes: number;
  readonly expectedQuotaRevision?: string;
}

export interface Fp005ServerQuotaSnapshot {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly quotaBytes: number;
  readonly currentUsageBytes: number;
  readonly quotaRevision: string;
}

export interface Fp005StorageQuotaOptions {
  readonly policyComposition?: unknown;
}

export interface Fp005StorageQuotaDecision {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly quotaBytes: number;
  readonly usedBytes: number;
  readonly incomingBytes: number;
  readonly remainingBytes: number;
  readonly action: "ALLOW";
}

function fail<T>(
  code: Fp005ErrorCode,
  message: string,
  path?: string,
): Fp005Result<T> {
  return fp005Failure(code, message, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasRawBlob(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  if (value === null || typeof value !== "object") return false;
  if (Object.prototype.toString.call(value) === "[object Blob]" || Object.prototype.toString.call(value) === "[object File]") return true;
  if (seen.has(value)) return false;
  if (depth > 8) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasRawBlob(item, seen, depth + 1));
  for (const [key, item] of Object.entries(value)) {
    if (RAW_FIELD_NAMES.has(key.toLowerCase())) return true;
    if (hasRawBlob(item, seen, depth + 1)) return true;
  }
  return false;
}

function sameMime(left: unknown, right: unknown): boolean {
  if (left === undefined && right === undefined) return true;
  if (typeof left !== "string" || typeof right !== "string") return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function validRevision(value: unknown): value is string {
  return isSafeId(value);
}

function validNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function resolveQuotaSnapshot(
  policyComposition: unknown,
  request: Fp005StorageQuotaResolveRequest,
): Fp005Result<Fp005ServerQuotaSnapshot> {
  const policy = getFp005ServerPolicyComposition(policyComposition);
  if (policy === undefined) {
    return fail(FP005_ERROR_CODES.AUTHORIZATION_REQUIRED, "Current server-owned quota resolution is required.");
  }

  let snapshot: unknown;
  try {
    snapshot = policy.resolveQuota(request);
  } catch {
    return fail(FP005_ERROR_CODES.AUTHORIZATION_REQUIRED, "Current server-owned quota resolution failed.");
  }
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return fail(FP005_ERROR_CODES.AUTHORIZATION_REQUIRED, "Current server-owned quota resolution is invalid.");
  }

  const value = snapshot as Partial<Fp005ServerQuotaSnapshot> & { readonly usedBytes?: unknown };
  const currentUsageBytes = value.currentUsageBytes ?? value.usedBytes;
  if (
    value.schemaVersion !== FP005_SCHEMA_VERSION ||
    value.tenantId !== request.tenantId ||
    value.resourceType !== request.resourceType ||
    value.resourceId !== request.resourceId ||
    !validNonNegativeSafeInteger(value.quotaBytes) ||
    !validNonNegativeSafeInteger(currentUsageBytes) ||
    !validRevision(value.quotaRevision)
  ) {
    return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Current quota snapshot is stale or outside the requested scope.");
  }
  if (request.expectedQuotaRevision !== undefined && request.expectedQuotaRevision !== value.quotaRevision) {
    return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Quota revision is stale.");
  }
  return fp005Success({
    schemaVersion: FP005_SCHEMA_VERSION,
    tenantId: value.tenantId,
    resourceType: value.resourceType,
    resourceId: value.resourceId,
    quotaBytes: value.quotaBytes,
    currentUsageBytes,
    quotaRevision: value.quotaRevision,
  });
}

function validatePlacementInput(value: unknown): Fp005Result<Fp005StorageInput> {
  if (!isRecord(value)) return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "Storage input is invalid.");
  if (value.schemaVersion !== FP005_SCHEMA_VERSION) return fail(FP005_ERROR_CODES.SCHEMA_UNSUPPORTED, "Storage policy version is unsupported.", "schemaVersion");
  if (!hasOnlyKeys(value, INPUT_KEYS)) return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "Storage input contains an unsupported field.");
  if (hasRawBlob(value)) return fail(FP005_ERROR_CODES.RAW_BLOB_REJECTED, "Raw bytes are not accepted by the storage metadata boundary.");
  if (!STORAGE_CLASSES.has(value.storageClass as Fp005StorageClass)) return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "Storage class is not canonical.", "storageClass");
  const validated = validateStorageInput(value);
  if (!validated.ok) return validated;
  return validated;
}

function validateLocatorShape(locator: unknown): Fp005Result<Fp005StorageLocator> {
  if (!isRecord(locator) || !hasOnlyKeys(locator, LOCATOR_KEYS)) return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Storage locator contains an unsupported field.");
  if (!STORAGE_PLACEMENTS.has(locator.placement as Fp005StoragePlacement)) return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "Storage locator placement is not canonical.", "locator.placement");
  return validateStorageLocator(locator);
}

/** Classify a metadata record before any provider adapter is allowed to act. */
export function classifyStoragePlacement(value: unknown): Fp005Result<Fp005StoragePlacementDecision> {
  const input = validatePlacementInput(value);
  if (!input.ok) return input;
  const storageClass = input.value.storageClass;
  const expectedPlacement = FP005_STORAGE_POLICY.placementByClass[storageClass];
  if (input.value.durable && storageClass === "ACTIVE_STATE") return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "Memory active state cannot be marked durable.", "durable");
  if (!input.value.durable && (storageClass === "JOURNAL_METADATA" || storageClass === "AUTHORITY_METADATA" || storageClass === "IMMUTABLE_BLOB")) return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "This storage class requires a durable placement.", "durable");

  let locator: Fp005StorageLocator | undefined;
  if (input.value.locator !== undefined) {
    const validatedLocator = validateLocatorShape(input.value.locator);
    if (!validatedLocator.ok) return validatedLocator;
    locator = validatedLocator.value;
    if (locator.placement !== expectedPlacement) return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "Storage locator is not the canonical placement for this class.", "locator.placement");
    if (locator.tenantId !== input.value.tenantId || locator.resourceType !== input.value.resourceType || locator.resourceId !== input.value.resourceId) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Storage locator is outside the requested tenant and resource scope.");
    if (input.value.contentHash !== undefined && input.value.contentHash !== locator.contentHash) return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Content hash metadata does not match the locator.", "contentHash");
    if (input.value.byteLength !== undefined && input.value.byteLength !== locator.byteLength) return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Byte length metadata does not match the locator.", "byteLength");
    if (input.value.mimeType !== undefined && !sameMime(input.value.mimeType, locator.mimeType)) return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "MIME metadata does not match the locator.", "mimeType");
  } else if (storageClass !== "ACTIVE_STATE") {
    return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Durable storage requires a typed locator.", "locator");
  }

  return fp005Success({
    schemaVersion: FP005_SCHEMA_VERSION,
    storageClass,
    expectedPlacement,
    placement: locator?.placement ?? expectedPlacement,
    durable: input.value.durable,
    ...(locator === undefined ? {} : { locator }),
    rawBlobAccepted: false,
  });
}

/** Alias used by adapters that treat placement validation as a gate. */
export const validateStoragePlacement = classifyStoragePlacement;
export const resolveStoragePlacement = classifyStoragePlacement;
export const validateStorageRecord = classifyStoragePlacement;

/** Quota is calculated from a current server snapshot; caller counters are claims only. */
export function checkStorageQuota(
  value: unknown,
  options: Fp005StorageQuotaOptions = {},
): Fp005Result<Fp005StorageQuotaDecision> {
  if (!isRecord(value)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Quota input is invalid.");
  if (value.schemaVersion !== FP005_SCHEMA_VERSION) return fail(FP005_ERROR_CODES.SCHEMA_UNSUPPORTED, "Quota policy version is unsupported.", "schemaVersion");
  const quota = value as Partial<Fp005StorageQuotaInput>;
  if (!isSafeId(quota.tenantId) || !isSafeId(quota.resourceType) || !isSafeId(quota.resourceId)) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Quota scope is invalid.");
  if (!validNonNegativeSafeInteger(quota.incomingBytes)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Requested bytes are invalid.", "incomingBytes");
  if ((quota.incomingBytes as number) > FP005_INPUT_LIMITS.maxBlobBytes) return fail(FP005_ERROR_CODES.INPUT_TOO_LARGE, "Incoming bytes exceed the fixed FP-005 blob limit.", "incomingBytes");

  const expectedQuotaRevision = (value as { readonly quotaRevision?: unknown }).quotaRevision;
  if (expectedQuotaRevision !== undefined && !validRevision(expectedQuotaRevision)) {
    return fail(FP005_ERROR_CODES.INPUT_INVALID, "Quota revision is invalid.", "quotaRevision");
  }
  const current = resolveQuotaSnapshot(options.policyComposition, {
    schemaVersion: FP005_SCHEMA_VERSION,
    tenantId: quota.tenantId,
    resourceType: quota.resourceType,
    resourceId: quota.resourceId,
    requestedBytes: quota.incomingBytes,
    ...(expectedQuotaRevision === undefined ? {} : { expectedQuotaRevision }),
  });
  if (!current.ok) return current;

  const usage = current.value.currentUsageBytes;
  const incoming = quota.incomingBytes as number;
  if (usage > Number.MAX_SAFE_INTEGER - incoming) return fail(FP005_ERROR_CODES.QUOTA_EXCEEDED, "Current usage plus requested bytes overflows the safe integer range.");
  const projectedUsage = usage + incoming;
  if (usage > current.value.quotaBytes || projectedUsage > current.value.quotaBytes) return fail(FP005_ERROR_CODES.QUOTA_EXCEEDED, "Storage quota would be exceeded before the write.");
  return fp005Success({
    schemaVersion: FP005_SCHEMA_VERSION,
    tenantId: current.value.tenantId,
    resourceType: current.value.resourceType,
    resourceId: current.value.resourceId,
    quotaBytes: current.value.quotaBytes,
    usedBytes: usage,
    incomingBytes: incoming,
    remainingBytes: current.value.quotaBytes - projectedUsage,
    action: "ALLOW",
  });
}

export const validateQuota = checkStorageQuota;
export const checkWriteQuota = checkStorageQuota;
