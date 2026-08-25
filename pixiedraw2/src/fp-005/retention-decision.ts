/** FP-005 tenant-scoped retention decision boundary. */
import { FP005_ERROR_CODES, type Fp005ErrorCode } from "./error-codes.ts";
import {
  FP005_SCHEMA_VERSION,
  fp005Failure,
  fp005Success,
  type Fp005Result,
  type Fp005RetentionDecision,
} from "./contracts.ts";
import { decideRetention as decidePolicyRetention } from "./policies.ts";
import { getFp005ServerPolicyComposition } from "./server-policy-composition.ts";

const CATEGORIES = new Set<Fp005RetentionDecision["category"]>([
  "QUEUE",
  "CHECKPOINT",
  "CACHE",
  "AUTHORITY",
  "PURCHASED",
]);

function fail<T>(code: Fp005ErrorCode, message: string, path?: string): Fp005Result<T> {
  return fp005Failure(code, message, path);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(value);
}

function validCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function retained(
  tenantId: string,
  resourceId: string,
  category: Fp005RetentionDecision["category"],
): Fp005Result<Fp005RetentionDecision> {
  const result = decidePolicyRetention(tenantId, resourceId, category);
  if (!result.ok) return result;
  return fp005Success({ ...result.value, protectedBytes: true, action: "RETAIN" });
}

export interface Fp005RetentionInput {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceId: string;
  readonly category: Fp005RetentionDecision["category"];
  readonly resourceType?: string;
  readonly assetRevision?: string;
}

export interface Fp005RetentionResolveRequest {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceType?: string;
  readonly resourceId: string;
  readonly category: Fp005RetentionDecision["category"];
  readonly expectedAssetRevision?: string;
}

export interface Fp005ServerRetentionSnapshot {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceType?: string;
  readonly resourceId: string;
  readonly category: Fp005RetentionDecision["category"];
  readonly currentAssetRevision: string;
  readonly activeEntitlement: boolean;
  readonly activeLicense: boolean;
  readonly licenseStatus: "NONE" | "ACTIVE" | "REVOKED";
  readonly legalHold: boolean;
  readonly dependencyCount: number;
  readonly referenceCount: number;
}

export interface Fp005RetentionOptions {
  readonly policyComposition?: unknown;
}

function resolveRetentionSnapshot(
  policyComposition: unknown,
  request: Fp005RetentionResolveRequest,
): Fp005Result<Fp005ServerRetentionSnapshot> {
  const policy = getFp005ServerPolicyComposition(policyComposition);
  if (policy === undefined) return fail(FP005_ERROR_CODES.RETENTION_PROTECTED, "Current server-owned retention resolution is required.");

  let snapshot: unknown;
  try {
    snapshot = policy.resolveRetention(request);
  } catch {
    return fail(FP005_ERROR_CODES.RETENTION_PROTECTED, "Current server-owned retention resolution failed.");
  }
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return fail(FP005_ERROR_CODES.RETENTION_PROTECTED, "Current server-owned retention resolution is invalid.");
  }
  const value = snapshot as Partial<Fp005ServerRetentionSnapshot> & { readonly assetRevision?: unknown };
  const currentAssetRevision = value.currentAssetRevision ?? value.assetRevision;
  if (
    value.schemaVersion !== FP005_SCHEMA_VERSION ||
    value.tenantId !== request.tenantId ||
    (request.resourceType !== undefined && value.resourceType !== request.resourceType) ||
    value.resourceId !== request.resourceId ||
    value.category !== request.category ||
    !validId(currentAssetRevision) ||
    typeof value.activeEntitlement !== "boolean" ||
    typeof value.activeLicense !== "boolean" ||
    (value.licenseStatus !== "NONE" && value.licenseStatus !== "ACTIVE" && value.licenseStatus !== "REVOKED") ||
    typeof value.legalHold !== "boolean" ||
    !validCount(value.dependencyCount) ||
    !validCount(value.referenceCount)
  ) {
    return fail(FP005_ERROR_CODES.RETENTION_PROTECTED, "Current retention state is stale or outside the requested scope.");
  }
  if (request.expectedAssetRevision !== undefined && request.expectedAssetRevision !== currentAssetRevision) {
    return fail(FP005_ERROR_CODES.RETENTION_PROTECTED, "Asset revision is stale.");
  }
  return fp005Success({
    schemaVersion: FP005_SCHEMA_VERSION,
    tenantId: value.tenantId,
    ...(value.resourceType === undefined ? {} : { resourceType: value.resourceType }),
    resourceId: value.resourceId,
    category: value.category,
    currentAssetRevision,
    activeEntitlement: value.activeEntitlement,
    activeLicense: value.activeLicense,
    licenseStatus: value.licenseStatus,
    legalHold: value.legalHold,
    dependencyCount: value.dependencyCount,
    referenceCount: value.referenceCount,
  });
}

/** Decide cleanup from a current server snapshot; caller holds and references are claims only. */
export function decideStorageRetention(
  value: unknown,
  options: Fp005RetentionOptions = {},
): Fp005Result<Fp005RetentionDecision> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Retention input is invalid.");
  }
  const input = value as Partial<Fp005RetentionInput>;
  if (input.schemaVersion !== FP005_SCHEMA_VERSION) return fail(FP005_ERROR_CODES.SCHEMA_UNSUPPORTED, "Retention policy version is unsupported.", "schemaVersion");
  if (!CATEGORIES.has(input.category as Fp005RetentionDecision["category"])) return fail(FP005_ERROR_CODES.TENANT_SCOPE_DENIED, "Retention category is invalid.", "category");
  const tenantId = input.tenantId ?? "";
  const resourceId = input.resourceId ?? "";
  const category = input.category as Fp005RetentionDecision["category"];
  const base = decidePolicyRetention(tenantId, resourceId, category);
  if (!base.ok) return base;
  const policy = getFp005ServerPolicyComposition(options.policyComposition);
  if (policy === undefined) return fail(FP005_ERROR_CODES.RETENTION_PROTECTED, "A sealed server policy composition is required.");
  if (category === "AUTHORITY" || category === "PURCHASED") return base;

  const expectedAssetRevision = input.assetRevision;
  if (expectedAssetRevision !== undefined && !validId(expectedAssetRevision)) return retained(tenantId, resourceId, category);
  const current = resolveRetentionSnapshot(options.policyComposition, {
    schemaVersion: FP005_SCHEMA_VERSION,
    tenantId,
    ...(input.resourceType === undefined ? {} : { resourceType: input.resourceType }),
    resourceId,
    category,
    ...(expectedAssetRevision === undefined ? {} : { expectedAssetRevision }),
  });
  if (!current.ok) return retained(tenantId, resourceId, category);
  const state = current.value;
  const protectedByCurrentState = state.activeEntitlement || state.activeLicense ||
    state.licenseStatus !== "NONE" || state.legalHold ||
    state.dependencyCount > 0 || state.referenceCount > 0;
  return fp005Success({
    ...base.value,
    protectedBytes: protectedByCurrentState,
    action: protectedByCurrentState ? "RETAIN" : "DELETE",
  });
}

export const validateRetentionDecision = decideStorageRetention;
export const decideRetention = decideStorageRetention;
