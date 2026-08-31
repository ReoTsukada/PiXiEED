/**
 * FP-005 storage locator boundary.
 *
 * The Registry wire shape remains `{ provider, bucket, objectKey }`. The
 * FP-005 metadata locator remains `{ placement, path, contentHash, byteLength,
 * ... }`; both shapes are validated here without contacting a provider.
 */
import { FP005_ERROR_CODES } from "./error-codes.ts";
import {
  fp005Failure,
  fp005Success,
  type Fp005Result,
  type Fp005StorageLocator,
} from "./contracts.ts";
import { FP005_INPUT_LIMITS, FP005_PATH_POLICY } from "./policies.ts";
import {
  validateNormalizedRelativePath,
  type NormalizedRelativePath,
  type RelativePathPolicy,
} from "./path-validation.ts";

export type RegistryStorageProvider = "opfs" | "object-storage";
export type StorageAuthority = "LOCAL" | "SERVER";

/** Explicit compatibility boundary between the Registry wire and FP-005. */
export const FP005_STORAGE_LOCATOR_V1_VERSION = "FP005_STORAGE_LOCATOR_V1" as const;
export const FP005_LOCATOR_COMPATIBILITY_ADAPTER_VERSION = "FP005_LOCATOR_COMPATIBILITY_ADAPTER_V1" as const;

/** Existing Asset/Package Registry storageLocator wire shape. */
export interface RegistryStorageLocator {
  readonly provider: RegistryStorageProvider;
  readonly bucket: string | null;
  readonly objectKey: NormalizedRelativePath;
}

/**
 * Lossless, versioned locator record used by the compatibility adapter.
 *
 * The legacy fields remain present alongside the FP-005 metadata and binding.
 * This prevents either direction from silently dropping authority or integrity
 * fields while keeping the legacy wire input unchanged.
 */
export interface StorageLocatorV1 extends Fp005StorageLocator {
  readonly schemaVersion: typeof FP005_STORAGE_LOCATOR_V1_VERSION;
  readonly provider: RegistryStorageProvider;
  readonly bucket: string | null;
  readonly objectKey: NormalizedRelativePath;
}

export interface RegistryStorageLocatorToFp005V1Options {
  readonly contentHash: Fp005StorageLocator["contentHash"];
  readonly byteLength: number;
  readonly mimeType?: string;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly expectedBinding?: LocatorBinding;
}

export interface LocatorBinding {
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
}

export const FP005_REGISTRY_LOCATOR_LIMITS = Object.freeze({
  maxBucketBytes: 128,
  maxObjectKeyBytes: 512,
});

const SAFE_BINDING_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/iu;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const ACTIVE_MIME = /^(?:application\/(?:javascript|java-archive|x-httpd-php|wasm)|image\/svg\+xml|text\/(?:html|javascript|x-shellscript))$/iu;
const ALLOWED_REGISTRY_KEYS = new Set(["provider", "bucket", "objectKey"]);
const ALLOWED_FP005_KEYS = new Set([
  "placement", "path", "contentHash", "byteLength", "mimeType", "tenantId", "resourceType", "resourceId",
]);
const ALLOWED_STORAGE_LOCATOR_V1_KEYS = new Set([
  ...ALLOWED_FP005_KEYS,
  "schemaVersion", "provider", "bucket", "objectKey",
]);
const ALLOWED_REGISTRY_TO_FP005_OPTIONS = new Set([
  "contentHash", "byteLength", "mimeType", "tenantId", "resourceType", "resourceId", "expectedBinding",
]);

function invalidLocator<T = never>(message = "Storage locator is invalid."): Fp005Result<T> {
  return fp005Failure(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, message, "locator");
}

function denied<T = never>(message = "Storage locator is outside the requested tenant/resource scope."): Fp005Result<T> {
  return fp005Failure(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, message, "locator");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateBucket(value: unknown): Fp005Result<string | null> {
  if (value === undefined || value === null) return fp005Success(null);
  if (typeof value !== "string" || value.length === 0 || value.length > FP005_REGISTRY_LOCATOR_LIMITS.maxBucketBytes) return invalidLocator("Storage bucket is invalid.");
  if (CONTROL_CHARACTERS.test(value) || value.includes("/") || value.includes("\\") || value !== value.normalize("NFC")) return invalidLocator("Storage bucket is invalid.");
  if (boundedUtf8Bytes(value) > FP005_REGISTRY_LOCATOR_LIMITS.maxBucketBytes) return invalidLocator("Storage bucket is invalid.");
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,126}[a-z0-9])?$/u.test(value)) return invalidLocator("Storage bucket is invalid.");
  return fp005Success(value);
}

function registryPathPolicy(): RelativePathPolicy {
  return {
    maxPathBytes: Math.min(FP005_PATH_POLICY.maxPathBytes, FP005_REGISTRY_LOCATOR_LIMITS.maxObjectKeyBytes),
    maxPathSegments: FP005_PATH_POLICY.maxPathSegments,
  };
}

/** Validate the existing Registry `{ provider, bucket, objectKey }` locator. */
export function validateRegistryStorageLocator(value: unknown): Fp005Result<RegistryStorageLocator> {
  if (!isRecord(value) || !hasOnlyKeys(value, ALLOWED_REGISTRY_KEYS)) return invalidLocator();
  if (value.provider !== "opfs" && value.provider !== "object-storage") return invalidLocator("Storage provider is unsupported.");
  const bucket = validateBucket(value.bucket);
  if (!bucket.ok) return bucket;
  if (value.provider === "object-storage" && bucket.value === null) return invalidLocator("Object Storage requires a bucket.");
  if (value.provider === "opfs" && bucket.value !== null) return invalidLocator("OPFS cannot carry an Object Storage bucket.");
  if (typeof value.objectKey !== "string") return invalidLocator("Storage objectKey is required.");
  const objectKey = validateNormalizedRelativePath(value.objectKey, registryPathPolicy());
  if (!objectKey.ok) return invalidLocator("Storage objectKey is not a safe relative path.");
  return fp005Success(Object.freeze({
    provider: value.provider,
    bucket: bucket.value,
    objectKey: objectKey.value,
  }));
}

export const validateProviderStorageLocator = validateRegistryStorageLocator;
export const validateRegistryLocator = validateRegistryStorageLocator;

export function storageAuthorityForProvider(provider: RegistryStorageProvider): StorageAuthority {
  return provider === "opfs" ? "LOCAL" : "SERVER";
}

export function storageAuthorityForPlacement(placement: Fp005StorageLocator["placement"]): StorageAuthority {
  return placement === "MEMORY" || placement === "INDEXED_DB" || placement === "OPFS" ? "LOCAL" : "SERVER";
}

export function validateLocatorBinding(value: unknown): Fp005Result<LocatorBinding> {
  if (!isRecord(value)) return denied("Tenant/resource binding is required.");
  if (!SAFE_BINDING_ID.test(String(value.tenantId ?? "")) || !SAFE_BINDING_ID.test(String(value.resourceType ?? "")) || !SAFE_BINDING_ID.test(String(value.resourceId ?? ""))) return denied("Tenant/resource binding is invalid.");
  return fp005Success({
    tenantId: value.tenantId as string,
    resourceType: value.resourceType as string,
    resourceId: value.resourceId as string,
  });
}

function validateMimeType(value: unknown): Fp005Result<string | undefined> {
  if (value === undefined) return fp005Success(undefined);
  if (typeof value !== "string" || value.length === 0 || boundedUtf8Bytes(value) > 128 || CONTROL_CHARACTERS.test(value) || !MIME.test(value)) return invalidLocator("Storage MIME type is invalid.");
  if (ACTIVE_MIME.test(value)) return fp005Failure(FP005_ERROR_CODES.ACTIVE_CONTENT_REJECTED, "Active content is not accepted.", "mimeType");
  return fp005Success(value.toLowerCase());
}

function placementForProvider(provider: RegistryStorageProvider): Fp005StorageLocator["placement"] {
  return provider === "opfs" ? "OPFS" : "OBJECT_STORAGE";
}

function providerForPlacement(
  placement: Fp005StorageLocator["placement"],
): RegistryStorageProvider | undefined {
  if (placement === "OPFS") return "opfs";
  if (placement === "OBJECT_STORAGE") return "object-storage";
  return undefined;
}

function makeStorageLocatorV1(
  registry: RegistryStorageLocator,
  locator: Fp005StorageLocator,
): StorageLocatorV1 {
  return Object.freeze({
    schemaVersion: FP005_STORAGE_LOCATOR_V1_VERSION,
    provider: registry.provider,
    bucket: registry.bucket,
    objectKey: registry.objectKey,
    placement: locator.placement,
    path: locator.path,
    contentHash: locator.contentHash,
    byteLength: locator.byteLength,
    ...(locator.mimeType === undefined ? {} : { mimeType: locator.mimeType }),
    tenantId: locator.tenantId,
    resourceType: locator.resourceType,
    resourceId: locator.resourceId,
  });
}

/** Validate the FP-005 metadata locator and optionally bind all scope fields. */
export function validateStorageLocator(
  value: unknown,
  expectedBinding?: unknown,
): Fp005Result<Fp005StorageLocator> {
  if (!isRecord(value) || !hasOnlyKeys(value, ALLOWED_FP005_KEYS)) return invalidLocator();
  if (!["MEMORY", "INDEXED_DB", "OPFS", "DATABASE", "OBJECT_STORAGE"].includes(value.placement as string)) return invalidLocator();
  if (typeof value.path !== "string" || typeof value.contentHash !== "string" || !SHA256.test(value.contentHash)) return invalidLocator();
  if (!Number.isSafeInteger(value.byteLength) || (value.byteLength as number) < 0 || (value.byteLength as number) > FP005_INPUT_LIMITS.maxBlobBytes) return invalidLocator("Storage byteLength exceeds the fixed limit.");

  const path = validateNormalizedRelativePath(value.path);
  if (!path.ok) return invalidLocator("Storage path is not a safe relative path.");
  const mimeType = validateMimeType(value.mimeType);
  if (!mimeType.ok) return mimeType;
  const binding = validateLocatorBinding({
    tenantId: value.tenantId,
    resourceType: value.resourceType,
    resourceId: value.resourceId,
  });
  if (!binding.ok) return binding;
  if (expectedBinding !== undefined) {
    const expected = validateLocatorBinding(expectedBinding);
    if (!expected.ok) return expected;
    if (binding.value.tenantId !== expected.value.tenantId || binding.value.resourceType !== expected.value.resourceType || binding.value.resourceId !== expected.value.resourceId) return denied();
  }

  return fp005Success({
    placement: value.placement as Fp005StorageLocator["placement"],
    path: path.value,
    contentHash: value.contentHash as Fp005StorageLocator["contentHash"],
    byteLength: value.byteLength as number,
    ...(mimeType.value === undefined ? {} : { mimeType: mimeType.value }),
    tenantId: binding.value.tenantId,
    resourceType: binding.value.resourceType,
    resourceId: binding.value.resourceId,
  });
}

/** Validate the lossless versioned Registry/FP-005 compatibility record. */
export function validateStorageLocatorV1(
  value: unknown,
  expectedBinding?: unknown,
): Fp005Result<StorageLocatorV1> {
  if (!isRecord(value) || !hasOnlyKeys(value, ALLOWED_STORAGE_LOCATOR_V1_KEYS)) {
    return invalidLocator("A versioned FP-005 storage locator is required; lossy conversion is rejected.");
  }
  if (value.schemaVersion !== FP005_STORAGE_LOCATOR_V1_VERSION) {
    return invalidLocator("Storage locator compatibility version is unsupported.");
  }

  const registry = validateRegistryStorageLocator({
    provider: value.provider,
    bucket: value.bucket,
    objectKey: value.objectKey,
  });
  if (!registry.ok) return registry;

  const fp005 = validateStorageLocator({
    placement: value.placement,
    path: value.path,
    contentHash: value.contentHash,
    byteLength: value.byteLength,
    ...(value.mimeType === undefined ? {} : { mimeType: value.mimeType }),
    tenantId: value.tenantId,
    resourceType: value.resourceType,
    resourceId: value.resourceId,
  }, expectedBinding);
  if (!fp005.ok) return fp005;

  const provider = providerForPlacement(fp005.value.placement);
  if (provider === undefined) {
    return invalidLocator("The FP-005 placement has no compatible Registry provider; lossy conversion is rejected.");
  }
  if (registry.value.provider !== provider || registry.value.objectKey !== fp005.value.path) {
    return invalidLocator("Registry provider or objectKey does not match the FP-005 locator.");
  }
  if (provider === "opfs" && registry.value.bucket !== null) {
    return invalidLocator("OPFS cannot carry an Object Storage bucket.");
  }
  if (provider === "object-storage" && registry.value.bucket === null) {
    return invalidLocator("Object Storage requires a bucket.");
  }

  return fp005Success(makeStorageLocatorV1(registry.value, fp005.value));
}

/**
 * Adapt the unchanged Registry wire shape into a lossless FP-005 V1 record.
 * Hash/size and tenant/resource binding are explicit adapter inputs because
 * the legacy wire shape does not contain those new FP-005 fields.
 */
export function adaptRegistryStorageLocatorToFp005V1(
  value: unknown,
  options: unknown,
): Fp005Result<StorageLocatorV1> {
  const registry = validateRegistryStorageLocator(value);
  if (!registry.ok) return registry;
  if (!isRecord(options) || !hasOnlyKeys(options, ALLOWED_REGISTRY_TO_FP005_OPTIONS)) {
    return invalidLocator("FP-005 metadata and tenant/resource binding are required by the explicit adapter.");
  }

  const locator = validateStorageLocator({
    placement: placementForProvider(registry.value.provider),
    path: registry.value.objectKey,
    contentHash: options.contentHash,
    byteLength: options.byteLength,
    ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
    tenantId: options.tenantId,
    resourceType: options.resourceType,
    resourceId: options.resourceId,
  }, options.expectedBinding);
  if (!locator.ok) return locator;

  return validateStorageLocatorV1(makeStorageLocatorV1(registry.value, locator.value), options.expectedBinding);
}

/**
 * Adapt a versioned FP-005 V1 record back to the exact legacy wire shape.
 * A plain Fp005StorageLocator is intentionally rejected because converting it
 * would lose the provider/bucket identity and is therefore not lossless.
 */
export function adaptFp005V1StorageLocatorToRegistry(
  value: unknown,
  expectedBinding?: unknown,
): Fp005Result<RegistryStorageLocator> {
  const versioned = validateStorageLocatorV1(value, expectedBinding);
  if (!versioned.ok) return { ok: false, diagnostics: versioned.diagnostics };
  return fp005Success(Object.freeze({
    provider: versioned.value.provider,
    bucket: versioned.value.bucket,
    objectKey: versioned.value.objectKey,
  }));
}

export const adaptRegistryLocatorToStorageLocatorV1 = adaptRegistryStorageLocatorToFp005V1;
export const adaptStorageLocatorV1ToRegistryLocator = adaptFp005V1StorageLocatorToRegistry;
export const registryStorageLocatorToFp005StorageLocatorV1 = adaptRegistryStorageLocatorToFp005V1;
export const fp005StorageLocatorV1ToRegistryStorageLocator = adaptFp005V1StorageLocatorToRegistry;

export const validateBoundStorageLocator = validateStorageLocator;
export const validateLocator = validateStorageLocator;
