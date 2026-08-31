import { FP005_ERROR_CODES, type Fp005ErrorCode } from "./error-codes.ts";
import {
  FP005_SCHEMA_VERSION,
  fp005Failure,
  fp005Success,
  type Fp005AccessContext,
  type Fp005Diagnostic,
  type Fp005InputLimits,
  type Fp005PathInput,
  type Fp005PathResult,
  type Fp005RedactionPolicy,
  type Fp005Result,
  type Fp005RetentionDecision,
  type Fp005StorageInput,
  type Fp005StorageLocator,
  type Fp005TelemetryEvent,
  type PathPolicyV1,
  type StoragePolicyV1,
  type TelemetryPolicyV1,
  type RetentionPolicyV1,
} from "./contracts.ts";

export const FP005_INPUT_LIMITS: Fp005InputLimits = Object.freeze({
  schemaVersion: FP005_SCHEMA_VERSION, maxEnvelopeBytes: 262144, maxJsonDepth: 16,
  maxCollectionItems: 10000, maxStringBytes: 65536, maxPathBytes: 1024,
  maxPathSegments: 32, maxBlobBytes: 536870912, maxArchiveEntries: 100000,
  maxExpandedArchiveBytes: 2147483648, maxCompressionRatio: 100,
});
export const FP005_REDACTION_POLICY: Fp005RedactionPolicy = Object.freeze({
  schemaVersion: FP005_SCHEMA_VERSION,
  forbiddenFields: ["authorization", "cookie", "jwt", "token", "secret", "password", "email", "phone", "address", "payment", "card", "body", "project", "media", "raw", "bytes", "pixels", "audio", "commission", "private"],
  maxDiagnosticBytes: 1024,
});
export const FP005_STORAGE_POLICY: StoragePolicyV1 = Object.freeze({
  schemaVersion: FP005_SCHEMA_VERSION,
  placementByClass: { ACTIVE_STATE: "MEMORY", JOURNAL_METADATA: "INDEXED_DB", LARGE_BLOB: "OPFS", AUTHORITY_METADATA: "DATABASE", IMMUTABLE_BLOB: "OBJECT_STORAGE" } as const,
  callerPathAllowed: false,
});
export const FP005_PATH_POLICY: PathPolicyV1 = Object.freeze({ schemaVersion: FP005_SCHEMA_VERSION, maxPathBytes: FP005_INPUT_LIMITS.maxPathBytes, maxPathSegments: FP005_INPUT_LIMITS.maxPathSegments, relativeOnly: true });
export const FP005_TELEMETRY_POLICY: TelemetryPolicyV1 = Object.freeze({ schemaVersion: FP005_SCHEMA_VERSION, allowlisted: true, maxEventNameBytes: 256 });
export const FP005_RETENTION_POLICY: RetentionPolicyV1 = Object.freeze({ schemaVersion: FP005_SCHEMA_VERSION, protectedCategories: ["AUTHORITY", "PURCHASED"] as const });

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const HASH = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f\\]/;
const ACTIVE_MIME = /^(text\/html|image\/svg\+xml|application\/javascript|text\/javascript|application\/x-httpd-php)$/i;

function fail<T>(code: Fp005ErrorCode, message: string, path?: string): Fp005Result<T> {
  return fp005Failure(code, message, path);
}
function id(value: unknown): value is string { return typeof value === "string" && SAFE_ID.test(value); }

export function validatePath(input: unknown, limits: Fp005InputLimits = FP005_INPUT_LIMITS): Fp005Result<Fp005PathResult> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail(FP005_ERROR_CODES.PATH_INVALID, "Path input is invalid.");
  const value = input as Partial<Fp005PathInput>;
  if (value.authority !== "LOCAL" && value.authority !== "SERVER" || typeof value.path !== "string") return fail(FP005_ERROR_CODES.PATH_INVALID, "Path authority or value is invalid.");
  if (value.path.length === 0 || new TextEncoder().encode(value.path).byteLength > limits.maxPathBytes || value.path.startsWith("/") || CONTROL.test(value.path) || /%2f|%5c|%2e/i.test(value.path)) return fail(FP005_ERROR_CODES.PATH_INVALID, "Path is not a bounded relative path.", "path");
  const segments = value.path.split("/");
  if (segments.length > limits.maxPathSegments || segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return fail(FP005_ERROR_CODES.PATH_INVALID, "Path contains an invalid segment.", "path");
  const normalizedPath = segments.join("/");
  return fp005Success({ normalizedPath, segments });
}

export function validateStorageLocator(value: unknown): Fp005Result<Fp005StorageLocator> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Storage locator is invalid.");
  const locator = value as Partial<Fp005StorageLocator>;
  const byteLength = locator.byteLength;
  if (!["MEMORY", "INDEXED_DB", "OPFS", "DATABASE", "OBJECT_STORAGE"].includes(locator.placement as string) || !id(locator.tenantId) || !id(locator.resourceType) || !id(locator.resourceId) || typeof locator.path !== "string" || !HASH.test(locator.contentHash ?? "") || !Number.isSafeInteger(byteLength) || byteLength === undefined || byteLength < 0) return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Storage locator is invalid.");
  const path = validatePath({ path: locator.path, authority: locator.placement === "OBJECT_STORAGE" ? "SERVER" : "LOCAL" });
  if (!path.ok) return path;
  if (locator.mimeType !== undefined && (typeof locator.mimeType !== "string" || ACTIVE_MIME.test(locator.mimeType))) return fail(FP005_ERROR_CODES.ACTIVE_CONTENT_REJECTED, "Active content is not accepted.", "mimeType");
  return fp005Success({ ...locator, path: path.value.normalizedPath } as Fp005StorageLocator);
}

export function validateStorageInput(value: unknown): Fp005Result<Fp005StorageInput> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "Storage input is invalid.");
  const input = value as Partial<Fp005StorageInput>;
  if (input.schemaVersion !== FP005_SCHEMA_VERSION || !id(input.tenantId) || !id(input.resourceType) || !id(input.resourceId) || typeof input.durable !== "boolean") return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "Storage input is invalid.");
  if (input.durable && input.storageClass === "ACTIVE_STATE") return fail(FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID, "Active state cannot be treated as durable.");
  if (input.locator !== undefined) { const locator = validateStorageLocator(input.locator); if (!locator.ok) return locator; if (locator.value.tenantId !== input.tenantId || locator.value.resourceId !== input.resourceId) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Storage locator is outside the requested scope."); }
  if (input.byteLength !== undefined && (!Number.isSafeInteger(input.byteLength) || input.byteLength < 0 || input.byteLength > FP005_INPUT_LIMITS.maxBlobBytes)) return fail(FP005_ERROR_CODES.INPUT_TOO_LARGE, "Blob exceeds the fixed FP-005 limit.", "byteLength");
  return fp005Success(input as Fp005StorageInput);
}

export function validateInput(value: unknown, limits: Fp005InputLimits = FP005_INPUT_LIMITS): Fp005Result<unknown> {
  const seen = new Set<object>();
  const walk = (item: unknown, depth: number): boolean => {
    if (depth > limits.maxJsonDepth) return false;
    if (typeof item === "string") return new TextEncoder().encode(item).byteLength <= limits.maxStringBytes;
    if (item === null || typeof item !== "object") return typeof item !== "number" || Number.isFinite(item);
    if (seen.has(item)) return false; seen.add(item);
    if (Array.isArray(item)) return item.length <= limits.maxCollectionItems && item.every((child) => walk(child, depth + 1));
    const entries = Object.entries(item as Record<string, unknown>);
    return entries.length <= limits.maxCollectionItems && entries.every(([key, child]) => key.length <= limits.maxStringBytes && walk(child, depth + 1));
  };
  if (!walk(value, 0)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Input exceeds a bounded FP-005 limit.");
  return fp005Success(value);
}

export function redactDiagnostic(input: unknown, policy: Fp005RedactionPolicy = FP005_REDACTION_POLICY): Fp005Result<unknown> {
  if (input === null || typeof input !== "object") return fp005Success(input);
  const isBinary = (value: object): boolean => {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
    return typeof Blob !== "undefined" && value instanceof Blob;
  };
  const allowedObjectKey = (key: string): boolean => new Set(["nested", "details", "metadata", "context", "diagnostic", "error", "attributes"]).has(key.toLowerCase());
  const redact = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.slice(0, 100).map(redact);
    if (value === null || typeof value !== "object") return typeof value === "string" && value.length > 256 ? "[REDACTED]" : value;
    if (isBinary(value)) return "[REDACTED]";
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const forbidden = policy.forbiddenFields.some((field) => key.toLowerCase().includes(field));
      output[key] = forbidden || (typeof item === "object" && item !== null && !allowedObjectKey(key)) ? "[REDACTED]" : redact(item);
    }
    return output;
  };
  return fp005Success(redact(input));
}

export function validateTelemetry(value: unknown): Fp005Result<Fp005TelemetryEvent> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail(FP005_ERROR_CODES.TELEMETRY_INVALID, "Telemetry event is invalid.");
  const event = value as Partial<Fp005TelemetryEvent>;
  if (event.schemaVersion !== FP005_SCHEMA_VERSION || !id(event.eventName) || !["OK", "ERROR", "DROPPED"].includes(event.result as string) || (event.errorCode !== undefined && !Object.values(FP005_ERROR_CODES).includes(event.errorCode))) return fail(FP005_ERROR_CODES.TELEMETRY_INVALID, "Telemetry event is not allowlisted.");
  return fp005Success(event as Fp005TelemetryEvent);
}

export function recheckAccess(context: unknown, locator: Fp005StorageLocator): Fp005Result<Fp005StorageLocator> {
  void context;
  void locator;
  return fail(FP005_ERROR_CODES.AUTHORIZATION_REQUIRED, "Boolean or caller trust recheck is retired; use the server-bound storage recheck.");
}

export function decideRetention(tenantId: string, resourceId: string, category: Fp005RetentionDecision["category"]): Fp005Result<Fp005RetentionDecision> {
  if (!id(tenantId) || !id(resourceId)) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Retention scope is invalid.");
  const protectedBytes = category === "AUTHORITY" || category === "PURCHASED";
  return fp005Success({ schemaVersion: FP005_SCHEMA_VERSION, tenantId, resourceId, category, protectedBytes, action: protectedBytes ? "RETAIN" : "DELETE" });
}

export const isValidPath = validatePath;
export const validateLocator = validateStorageLocator;
export const redact = redactDiagnostic;
