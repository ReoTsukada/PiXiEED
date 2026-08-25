/** FP-005 tenant/resource/locator binding and AuthorizationProof recheck. */
import { FP005_ERROR_CODES, type Fp005ErrorCode } from "./error-codes.ts";
import {
  FP005_SCHEMA_VERSION,
  fp005Failure,
  fp005Success,
  type Fp005Result,
  type Fp005StorageLocator,
} from "./contracts.ts";
import { validateStorageLocator } from "./policies.ts";
import {
  requireAuthorizationProofV1,
  resolveAuthorizationProofV1,
  type AuthorizationProofExpectation,
  type AuthorizationProofV1,
} from "../wp160-contracts.ts";
import {
  consumeServerAuthorityRequestContext,
} from "../server/internal/authenticated-context.ts";
import { getFp005ServerPolicyComposition } from "./server-policy-composition.ts";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
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

export type Fp005StorageAuthority = "LOCAL" | "SERVER";

export interface Fp005StorageScopeRequest {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly authorizationProof: unknown;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly locator: unknown;
  readonly authority?: Fp005StorageAuthority;
  readonly principalId?: string | null;
  readonly action?: string;
  readonly capability?: string;
}

export interface Fp005StorageScopeOptions {
  /** Opaque capability issued only by the server composition root. */
  readonly policyComposition?: unknown;
}

export interface Fp005StorageScopeBinding {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly authorizationProof: AuthorizationProofV1;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly locator: Fp005StorageLocator;
  readonly authority: Fp005StorageAuthority;
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

function authorityFor(placement: Fp005StorageLocator["placement"]): Fp005StorageAuthority {
  return placement === "DATABASE" || placement === "OBJECT_STORAGE" ? "SERVER" : "LOCAL";
}

function expectedProof(
  request: Fp005StorageScopeRequest,
): AuthorizationProofExpectation {
  return {
    ...(request.principalId === undefined ? {} : { principalId: request.principalId }),
    tenantId: request.tenantId,
    resourceType: request.resourceType,
    resourceId: request.resourceId,
    ...(request.action === undefined ? {} : { action: request.action }),
    ...(request.capability === undefined ? {} : { capability: request.capability }),
  };
}

function validateRequestShape(value: unknown): Fp005Result<Fp005StorageScopeRequest> {
  if (!isRecord(value)) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Storage scope is invalid.");
  if (value.schemaVersion !== FP005_SCHEMA_VERSION) return fail(FP005_ERROR_CODES.SCHEMA_UNSUPPORTED, "Storage scope policy version is unsupported.", "schemaVersion");
  if (!isSafeId(value.tenantId) || !isSafeId(value.resourceType) || !isSafeId(value.resourceId)) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Storage scope is invalid.");
  if (value.authority !== undefined && value.authority !== "LOCAL" && value.authority !== "SERVER") return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Storage authority is invalid.", "authority");
  return fp005Success(value as unknown as Fp005StorageScopeRequest);
}

function validateLocator(locator: unknown): Fp005Result<Fp005StorageLocator> {
  if (!isRecord(locator) || Object.keys(locator).some((key) => !LOCATOR_KEYS.has(key))) return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Storage locator is invalid.");
  return validateStorageLocator(locator);
}

function validateProof(
  request: Fp005StorageScopeRequest,
  options: Fp005StorageScopeOptions,
): Fp005Result<AuthorizationProofV1> {
  if (request.authorizationProof === undefined || request.authorizationProof === null) return fail(FP005_ERROR_CODES.AUTHORIZATION_REQUIRED, "A current AuthorizationProofV1 is required.");
  const policy = getFp005ServerPolicyComposition(options.policyComposition);
  if (policy === undefined) return fail(FP005_ERROR_CODES.AUTHORIZATION_REQUIRED, "A sealed FP-005 server policy composition is required.");
  const sealed = policy.authorityContext;
  const expected = expectedProof(request);
  const context = sealed as { readonly principalId: string; readonly tenantContext: { readonly tenantId: string }; readonly resourceType: string; readonly resourceId: string };
  if (context.principalId !== request.principalId || context.tenantContext.tenantId !== request.tenantId || context.resourceType !== request.resourceType || context.resourceId !== request.resourceId) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Current server context is outside the requested storage scope.");
  try {
    const proof = resolveAuthorizationProofV1(request.authorizationProof, expected, policy.authorizationProofResolver);
    return fp005Success(requireAuthorizationProofV1(proof, expected));
  } catch {
    return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Current authorization does not grant this storage scope.");
  }
}

/** Re-resolve and validate authority immediately before a storage provider action. */
export function validateStorageScope(
  value: unknown,
  options: Fp005StorageScopeOptions = {},
): Fp005Result<Fp005StorageScopeBinding> {
  const request = validateRequestShape(value);
  if (!request.ok) return request;
  const locator = validateLocator(request.value.locator);
  if (!locator.ok) return locator;
  if (locator.value.tenantId !== request.value.tenantId || locator.value.resourceType !== request.value.resourceType || locator.value.resourceId !== request.value.resourceId) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Storage locator is outside the requested tenant and resource scope.");
  const authority = authorityFor(locator.value.placement);
  if (request.value.authority !== undefined && request.value.authority !== authority) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Storage locator authority does not match its placement.");
  const proof = validateProof(request.value, options);
  if (!proof.ok) return proof;
  return fp005Success({
    schemaVersion: FP005_SCHEMA_VERSION,
    authorizationProof: proof.value,
    tenantId: request.value.tenantId,
    resourceType: request.value.resourceType,
    resourceId: request.value.resourceId,
    locator: locator.value,
    authority,
  });
}

/** Compatibility-shaped recheck for callers that already have an access context. */
export function recheckStorageScope(
  context: unknown,
  locator: unknown,
  options: Fp005StorageScopeOptions = {},
): Promise<Fp005Result<Fp005StorageScopeBinding>> {
  if (!isRecord(context) || !isRecord(locator)) return Promise.resolve(fail(FP005_ERROR_CODES.AUTHORIZATION_REQUIRED, "Current storage authorization context is required."));
  const policy = getFp005ServerPolicyComposition(options.policyComposition);
  if (policy === undefined) return Promise.resolve(fail(FP005_ERROR_CODES.AUTHORIZATION_REQUIRED, "A sealed server policy composition is required."));
  const request = {
    schemaVersion: FP005_SCHEMA_VERSION,
    authorizationProof: context.authorizationProof,
    tenantId: context.tenantId,
    resourceType: context.resourceType,
    resourceId: context.resourceId,
    locator,
    ...(context.authority === undefined ? {} : { authority: context.authority }),
    ...(context.principalId === undefined ? {} : { principalId: context.principalId }),
    ...(context.action === undefined ? {} : { action: context.action }),
    ...(context.capability === undefined ? {} : { capability: context.capability }),
  };
  const checked = validateStorageScope(request, {
    policyComposition: options.policyComposition,
  });
  if (!checked.ok) return Promise.resolve(checked);
  return consumeServerAuthorityRequestContext(policy.authorityContext, {
    resourceType: typeof request.resourceType === "string" ? request.resourceType : "",
    resourceId: typeof request.resourceId === "string" ? request.resourceId : "",
    membershipRegistry: policy.membershipRegistry,
  }).then((current) => current ? checked : fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Current server membership is stale or revoked."));
}

export const recheckStorageAccess = recheckStorageScope;
export const validateTenantResourceBinding = validateStorageScope;
export const bindStorageLocator = validateStorageScope;
