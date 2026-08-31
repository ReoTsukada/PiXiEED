/**
 * WP-210 isolated Market/Rights/Commerce projection.
 *
 * This module reuses the WP-160 typed ID/hash/canonical JSON vocabulary. It
 * accepts references and synthetic records only; it has no UI, persistence,
 * transport, provider client, or production mutation boundary.
 */

import {
  asPackageId,
  asSha256,
  canonicalJson,
  hashCanonical,
  AUTHORIZATION_PROOF_POLICY_VERSION,
  resolveAuthorizationProofV1,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
  type Brand,
  type ContentHash,
  type PackageId,
} from "./wp160-contracts.ts";

export type MarketProductId = Brand<string, "MarketProductId">;
export type LegacyProductId = Brand<string, "LegacyProductId">;
export type MarketOrderId = Brand<string, "MarketOrderId">;
export type MarketPurchaseId = Brand<string, "MarketPurchaseId">;
export type PaymentEventId = Brand<string, "PaymentEventId">;
export type EntitlementId = Brand<string, "EntitlementId">;
export type LicenseSnapshotId = Brand<string, "LicenseSnapshotId">;
export type RoyaltyLedgerEntryId = Brand<string, "RoyaltyLedgerEntryId">;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_CURRENCY = /^[A-Z]{3}$/;
const SAFE_PATH = /^\/(?!\/|.*(?:javascript:|data:|vbscript:))[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*$/i;

function brandedId<Name extends string>(value: string, label: Name): Brand<string, Name> {
  if (!SAFE_ID.test(value)) throw new Error(`${label} must be a stable identifier.`);
  return value as Brand<string, Name>;
}

export function asMarketProductId(value: string): MarketProductId { return brandedId(value, "MarketProductId"); }
export function asLegacyProductId(value: string): LegacyProductId { return brandedId(value, "LegacyProductId"); }
export function asMarketOrderId(value: string): MarketOrderId { return brandedId(value, "MarketOrderId"); }
export function asMarketPurchaseId(value: string): MarketPurchaseId { return brandedId(value, "MarketPurchaseId"); }
export function asPaymentEventId(value: string): PaymentEventId { return brandedId(value, "PaymentEventId"); }
export function asEntitlementId(value: string): EntitlementId { return brandedId(value, "EntitlementId"); }
export function asLicenseSnapshotId(value: string): LicenseSnapshotId { return brandedId(value, "LicenseSnapshotId"); }
export function asRoyaltyLedgerEntryId(value: string): RoyaltyLedgerEntryId { return brandedId(value, "RoyaltyLedgerEntryId"); }

export type MarketClassification = "MATERIAL" | "COMPLETED_WORK";
export type PublicationMethod = "EXHIBITION" | "FREE" | "PAID" | "LIMITED";
export type MarketProductStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "ARCHIVED" | "QUARANTINED";
export type LicenseRight = "PERSONAL_USE" | "COMMERCIAL_USE" | "DERIVATIVE" | "EMBEDDING" | "RESALE";
export type ReferenceMode = "PINNED";

export type MarketDiagnosticCode =
  | "INVALID_ID"
  | "INVALID_HASH"
  | "INVALID_CLASSIFICATION"
  | "INVALID_PRICE"
  | "UNSAFE_URL"
  | "PACKAGE_REFERENCE_REQUIRED"
  | "PACKAGE_REFERENCE_NOT_PINNED"
  | "RAW_CONTENT_REJECTED"
  | "RIGHTS_REQUIRED"
  | "LEGACY_MAPPING_CONFLICT"
  | "LEGACY_ID_REUSE"
  | "MISSING_LOCK"
  | "INVALID_TRANSITION"
  | "DUPLICATE_EVENT_CONFLICT"
  | "ENTITLEMENT_NOT_ELIGIBLE"
  | "LEDGER_INVALID"
  | "LEGACY_ADAPTER_ONLY"
  | "PROVIDER_INPUT_REJECTED"
  | "FEATURE_DISABLED"
  | "KILL_SWITCH_ACTIVE"
  | "UNKNOWN_FLAG"
  | "ROLLBACK_PRECONDITION_FAILED"
  | "PERMISSION_DENIED"
  | "UNSAFE_AUDIT_DATA";
  

export type DiagnosticSeverity = "INFO" | "WARNING" | "ERROR";

export interface MarketDiagnostic {
  readonly code: MarketDiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  readonly recoverable: boolean;
}

export type MarketResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly MarketDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly MarketDiagnostic[] };

function info(code: MarketDiagnosticCode, message: string, metadata?: Readonly<Record<string, string | number | boolean>>): MarketDiagnostic {
  return { code, severity: "INFO", message, ...(metadata === undefined ? {} : { metadata }), recoverable: true };
}

function warning(code: MarketDiagnosticCode, message: string, path?: string): MarketDiagnostic {
  return { code, severity: "WARNING", message, ...(path === undefined ? {} : { path }), recoverable: true };
}

function error(code: MarketDiagnosticCode, message: string, path?: string): MarketDiagnostic {
  return { code, severity: "ERROR", message, ...(path === undefined ? {} : { path }), recoverable: false };
}

function failure<T>(diagnostics: readonly MarketDiagnostic[]): MarketResult<T> {
  return { ok: false, diagnostics };
}

function success<T>(value: T, diagnostics: readonly MarketDiagnostic[] = []): MarketResult<T> {
  return { ok: true, value, diagnostics };
}

function validHash(value: string): boolean { return SHA256.test(value); }
function validCurrency(value: string): boolean { return SAFE_CURRENCY.test(value); }
function validAccountReference(value: string): boolean { return SAFE_ID.test(value); }
function validPath(value: string): boolean { return SAFE_PATH.test(value); }
function isIntegerAmount(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }

export interface LockedPackageReference {
  readonly packageId: PackageId;
  readonly packageVersion: string;
  readonly manifestHash: ContentHash;
  readonly dependencySnapshotHash: ContentHash;
  readonly contentHash: ContentHash;
  readonly licenseSnapshotId: LicenseSnapshotId;
  readonly licenseSnapshotHash: ContentHash;
  readonly mode: ReferenceMode;
}

export interface ProductPrice {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface MarketProductProjection {
  readonly productId: MarketProductId;
  readonly legacyProductId?: LegacyProductId;
  readonly package: LockedPackageReference;
  readonly classification: MarketClassification;
  readonly publication: PublicationMethod;
  readonly status: MarketProductStatus;
  readonly ownerAccountId: string;
  readonly legacyUrl?: string;
  readonly price: ProductPrice;
  readonly rights: readonly LicenseRight[];
  readonly source: "CORE_PROJECTION" | "LEGACY_PROJECTION";
}

export interface ProductProjectionInput {
  readonly productId: MarketProductId;
  readonly legacyProductId?: LegacyProductId;
  readonly package: LockedPackageReference;
  readonly classification: MarketClassification;
  readonly publication: PublicationMethod;
  readonly status: MarketProductStatus;
  readonly ownerAccountId: string;
  readonly legacyUrl?: string;
  readonly price: ProductPrice;
  readonly rights: readonly LicenseRight[];
  readonly source?: MarketProductProjection["source"];
  readonly rawContentBytes?: number;
  readonly packageKind?: string;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
}

function validatePackageReference(reference: LockedPackageReference): readonly MarketDiagnostic[] {
  const diagnostics: MarketDiagnostic[] = [];
  if (!SAFE_ID.test(reference.packageId) || reference.packageVersion.length === 0) diagnostics.push(error("PACKAGE_REFERENCE_REQUIRED", "Package identity and version are required.", "package"));
  if (reference.mode !== "PINNED") diagnostics.push(error("PACKAGE_REFERENCE_NOT_PINNED", "Published or purchased Market references must be PINNED.", "package.mode"));
  for (const [path, value] of [["package.manifestHash", reference.manifestHash], ["package.dependencySnapshotHash", reference.dependencySnapshotHash], ["package.contentHash", reference.contentHash], ["package.licenseSnapshotHash", reference.licenseSnapshotHash]] as const) {
    if (!validHash(value)) diagnostics.push(error("INVALID_HASH", "A locked Package reference must contain a SHA-256 hash.", path));
  }
  if (!SAFE_ID.test(reference.licenseSnapshotId)) diagnostics.push(error("RIGHTS_REQUIRED", "A License Snapshot reference is required.", "package.licenseSnapshotId"));
  return diagnostics;
}

export function createProductProjection(input: ProductProjectionInput): MarketResult<MarketProductProjection> {
  const diagnostics: MarketDiagnostic[] = [];
  try {
    resolveAuthorizationProofV1(input.authorizationProof, { principalId: input.ownerAccountId, resourceType: "MARKET_PRODUCT", resourceId: input.productId, action: "market.product.project", capability: "market.product.project", tenantId: input.authorizationProof?.tenantId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    diagnostics.push(error("PERMISSION_DENIED", "Market Product projection requires a server AuthorizationProofV1 bound to the Product.", "authorizationProof"));
  }
  if (!SAFE_ID.test(input.productId)) diagnostics.push(error("INVALID_ID", "Product ID is not stable.", "productId"));
  if (input.legacyProductId !== undefined && !SAFE_ID.test(input.legacyProductId)) diagnostics.push(error("INVALID_ID", "Legacy Product ID is not stable.", "legacyProductId"));
  if (!validAccountReference(input.ownerAccountId)) diagnostics.push(error("INVALID_ID", "Owner reference is not stable.", "ownerAccountId"));
  if (!(["MATERIAL", "COMPLETED_WORK"] as readonly string[]).includes(input.classification)) diagnostics.push(error("INVALID_CLASSIFICATION", "Market classification must be MATERIAL or COMPLETED_WORK.", "classification"));
  if (!isIntegerAmount(input.price.amountMinor) || !validCurrency(input.price.currency)) diagnostics.push(error("INVALID_PRICE", "Price must use a non-negative integer minor amount and ISO currency code.", "price"));
  if (input.legacyUrl !== undefined && !validPath(input.legacyUrl)) diagnostics.push(error("UNSAFE_URL", "Only a safe preserved site path may be projected.", "legacyUrl"));
  if (input.rawContentBytes !== undefined && input.rawContentBytes > 0) diagnostics.push(error("RAW_CONTENT_REJECTED", "Product projection accepts content references, not raw media bytes.", "rawContentBytes"));
  if (input.packageKind !== undefined && ["MATERIAL", "FINISHED_PRODUCT", "GAME", "PROJECT"].includes(input.packageKind)) diagnostics.push(warning("PACKAGE_REFERENCE_REQUIRED", "Package kind remains separate from Market classification."));
  diagnostics.push(...validatePackageReference(input.package));
  if (input.rights.length === 0) diagnostics.push(error("RIGHTS_REQUIRED", "At least one License right must be captured in the License Snapshot reference.", "rights"));
  if (diagnostics.some((item) => item.severity === "ERROR")) return failure(diagnostics);
  return success({
    productId: input.productId,
    ...(input.legacyProductId === undefined ? {} : { legacyProductId: input.legacyProductId }),
    package: input.package,
    classification: input.classification,
    publication: input.publication,
    status: input.status,
    ownerAccountId: input.ownerAccountId,
    ...(input.legacyUrl === undefined ? {} : { legacyUrl: input.legacyUrl }),
    price: input.price,
    rights: [...new Set(input.rights)].sort(),
    source: input.source ?? "CORE_PROJECTION",
  });
}

export interface LegacyProductRecord {
  readonly legacyProductId: LegacyProductId;
  readonly legacyUrl: string;
  readonly legacyClassification: "material" | "finished" | "completed_work";
  readonly package: LockedPackageReference;
  readonly ownerAccountId: string;
  readonly historicalPrice: ProductPrice;
  readonly orderIds: readonly MarketOrderId[];
  readonly licenseSnapshotId: LicenseSnapshotId;
}

export interface LegacyCompatibilityMapping {
  readonly legacyProductId: LegacyProductId;
  readonly projectedProductId: MarketProductId;
  readonly orderIds: readonly MarketOrderId[];
  readonly licenseSnapshotId: LicenseSnapshotId;
  readonly legacyUrl: string;
  readonly status: "MAPPED" | "QUARANTINED";
  readonly mappingHash: ContentHash;
}

export interface LegacyCompatibilityInput {
  readonly record: LegacyProductRecord;
  readonly projectedProductId: MarketProductId;
  readonly existing?: readonly LegacyCompatibilityMapping[];
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
}

function normalizeLegacyClassification(value: LegacyProductRecord["legacyClassification"]): MarketClassification {
  return value === "material" ? "MATERIAL" : "COMPLETED_WORK";
}

export async function createLegacyCompatibilityAdapter(input: LegacyCompatibilityInput): Promise<MarketResult<LegacyCompatibilityMapping>> {
  const existing = input.existing?.find((mapping) => mapping.legacyProductId === input.record.legacyProductId);
  if (existing !== undefined && (existing.projectedProductId !== input.projectedProductId || existing.licenseSnapshotId !== input.record.licenseSnapshotId)) return failure([error("LEGACY_MAPPING_CONFLICT", "Existing Legacy mapping conflicts with the requested target; quarantine is required.", "legacyProductId")]);
  if (!validPath(input.record.legacyUrl)) return failure([error("UNSAFE_URL", "Legacy public URL is not safe to preserve.", "legacyUrl")]);
  const projectionInput = {
    productId: input.projectedProductId,
    legacyProductId: input.record.legacyProductId,
    package: input.record.package,
    classification: normalizeLegacyClassification(input.record.legacyClassification),
    publication: input.record.historicalPrice.amountMinor === 0 ? "FREE" : "PAID",
    status: "PUBLISHED",
    ownerAccountId: input.record.ownerAccountId,
    legacyUrl: input.record.legacyUrl,
    price: input.record.historicalPrice,
    rights: ["PERSONAL_USE"],
    source: "LEGACY_PROJECTION",
  } satisfies ProductProjectionInput;
  const projection = input.authorizationProof === undefined
    ? createProductProjection(projectionInput)
    : input.authorizationProofResolver === undefined
      ? createProductProjection({ ...projectionInput, authorizationProof: input.authorizationProof })
      : createProductProjection({ ...projectionInput, authorizationProof: input.authorizationProof, authorizationProofResolver: input.authorizationProofResolver });
  if (!projection.ok) return projection;
  const mappingValue = {
    legacyProductId: input.record.legacyProductId,
    projectedProductId: input.projectedProductId,
    orderIds: [...input.record.orderIds].sort(),
    licenseSnapshotId: input.record.licenseSnapshotId,
    legacyUrl: input.record.legacyUrl,
    classification: projection.value.classification,
  };
  const mappingHash = await hashCanonical(mappingValue);
  return success({ ...mappingValue, mappingHash, status: "MAPPED" }, existing === undefined ? [] : [info("LEGACY_MAPPING_CONFLICT", "The existing identical Legacy mapping was reused idempotently.")]);
}

export type PurchaseLifecycle = "PENDING" | "CHECKOUT_BOUND" | "PAID" | "DELIVERABLE" | "DELIVERED" | "REVERSED" | "CANCELLED" | "DISPUTED" | "RESTORED" | "FAILED";
export type PurchaseEventType = "CHECKOUT_BOUND" | "PAID" | "DELIVERABLE" | "DELIVERED" | "REVERSED" | "CANCELLED" | "DISPUTED" | "RESTORED";
export type PaymentProvider = "CURRENT_SERVER" | "SYNTHETIC" | "STRIPE";

export interface PurchaseEvent {
  readonly eventId: PaymentEventId;
  readonly purchaseId: MarketPurchaseId;
  readonly sequence: number;
  readonly type: PurchaseEventType;
  readonly payloadFingerprint: ContentHash;
  readonly source: "CURRENT_RPC" | "CURRENT_WEBHOOK_FIXTURE" | "LEGACY_RECONCILIATION";
}

export interface AppliedPurchaseEvent {
  readonly eventId: PaymentEventId;
  readonly sequence: number;
  readonly type: PurchaseEventType;
  readonly payloadFingerprint: ContentHash;
}

export interface PurchaseRecord {
  readonly purchaseId: MarketPurchaseId;
  readonly productId: MarketProductId;
  readonly orderId: MarketOrderId;
  readonly buyerAccountId: string;
  readonly package: LockedPackageReference;
  readonly amount: ProductPrice;
  readonly provider: PaymentProvider;
  readonly lifecycle: PurchaseLifecycle;
  readonly appliedEvents: readonly AppliedPurchaseEvent[];
}

export interface PurchaseInput extends Omit<PurchaseRecord, "lifecycle" | "appliedEvents"> {
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
}

export function createPurchaseRecord(input: PurchaseInput): MarketResult<PurchaseRecord> {
  const diagnostics: MarketDiagnostic[] = [];
  try {
    resolveAuthorizationProofV1(input.authorizationProof, { principalId: input.buyerAccountId, resourceType: "MARKET_PURCHASE", resourceId: input.purchaseId, action: "market.purchase.create", capability: "market.purchase.create", tenantId: input.authorizationProof?.tenantId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    diagnostics.push(error("PERMISSION_DENIED", "Purchase creation requires a server AuthorizationProofV1 bound to the Purchase.", "authorizationProof"));
  }
  if (!SAFE_ID.test(input.purchaseId) || !SAFE_ID.test(input.orderId) || !SAFE_ID.test(input.productId)) diagnostics.push(error("INVALID_ID", "Purchase, Order, and Product IDs must be stable.", "purchase"));
  if (!validAccountReference(input.buyerAccountId)) diagnostics.push(error("INVALID_ID", "Buyer reference is not stable.", "buyerAccountId"));
  if (!isIntegerAmount(input.amount.amountMinor) || !validCurrency(input.amount.currency)) diagnostics.push(error("INVALID_PRICE", "Purchase amount must use integer minor units and ISO currency.", "amount"));
  diagnostics.push(...validatePackageReference(input.package));
  if (diagnostics.some((item) => item.severity === "ERROR")) return failure(diagnostics);
  const { authorizationProof: _authorizationProof, authorizationProofResolver: _authorizationProofResolver, ...purchase } = input;
  return success({ ...purchase, lifecycle: "PENDING", appliedEvents: [] });
}

const TRANSITIONS: Readonly<Record<PurchaseLifecycle, readonly PurchaseEventType[]>> = {
  PENDING: ["CHECKOUT_BOUND", "CANCELLED", "FAILED" as PurchaseEventType],
  CHECKOUT_BOUND: ["PAID", "CANCELLED", "FAILED" as PurchaseEventType],
  PAID: ["DELIVERABLE", "DELIVERED", "REVERSED", "DISPUTED"],
  DELIVERABLE: ["DELIVERED", "REVERSED", "DISPUTED"],
  DELIVERED: ["REVERSED", "DISPUTED"],
  REVERSED: ["RESTORED"],
  CANCELLED: [],
  DISPUTED: ["RESTORED", "REVERSED"],
  RESTORED: ["DELIVERABLE", "DELIVERED", "REVERSED", "DISPUTED"],
  FAILED: [],
};

function nextLifecycle(current: PurchaseLifecycle, event: PurchaseEventType): PurchaseLifecycle {
  if (event === "CHECKOUT_BOUND") return "CHECKOUT_BOUND";
  if (event === "PAID") return "PAID";
  if (event === "DELIVERABLE") return "DELIVERABLE";
  if (event === "DELIVERED") return "DELIVERED";
  if (event === "REVERSED") return "REVERSED";
  if (event === "CANCELLED") return "CANCELLED";
  if (event === "DISPUTED") return "DISPUTED";
  if (event === "RESTORED") return "RESTORED";
  return "FAILED";
}

export function applyPurchaseEvent(record: PurchaseRecord, event: PurchaseEvent): MarketResult<PurchaseRecord> {
  if (event.purchaseId !== record.purchaseId) return failure([error("INVALID_ID", "Payment event targets a different Purchase.", "event.purchaseId")]);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1 || !validHash(event.payloadFingerprint)) return failure([error("DUPLICATE_EVENT_CONFLICT", "Payment event identity is incomplete.", "event")]);
  const duplicate = record.appliedEvents.find((item) => item.eventId === event.eventId);
  if (duplicate !== undefined) {
    if (duplicate.payloadFingerprint !== event.payloadFingerprint || duplicate.type !== event.type) return failure([error("DUPLICATE_EVENT_CONFLICT", "The same Payment Event ID has a different fingerprint.", "event.eventId")]);
    return success(record, [info("DUPLICATE_EVENT_CONFLICT", "Identical Payment Event is an idempotent no-op.", { idempotent: true })]);
  }
  if (!TRANSITIONS[record.lifecycle].includes(event.type)) return failure([error("INVALID_TRANSITION", "Payment event is not valid for the current Purchase lifecycle.", "event.type")]);
  if (record.appliedEvents.some((item) => item.sequence === event.sequence)) return failure([error("INVALID_TRANSITION", "Two different Payment Events cannot share one sequence.", "event.sequence")]);
  const appliedEvents = [...record.appliedEvents, { eventId: event.eventId, sequence: event.sequence, type: event.type, payloadFingerprint: event.payloadFingerprint }].sort((left, right) => left.sequence - right.sequence || left.eventId.localeCompare(right.eventId));
  return success({ ...record, lifecycle: nextLifecycle(record.lifecycle, event.type), appliedEvents });
}

export function reconcilePurchaseEvents(record: PurchaseRecord, events: readonly PurchaseEvent[]): MarketResult<PurchaseRecord> {
  let current = record;
  const diagnostics: MarketDiagnostic[] = [];
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence || left.eventId.localeCompare(right.eventId));
  for (const event of ordered) {
    const result = applyPurchaseEvent(current, event);
    if (!result.ok) return result;
    current = result.value;
    diagnostics.push(...result.diagnostics);
  }
  return success(current, diagnostics);
}

export type EntitlementStatus = "ACTIVE" | "REVOKED" | "PENDING" | "QUARANTINED";
export type LicenseStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "QUARANTINED";

export interface EntitlementRecord {
  readonly entitlementId: EntitlementId;
  readonly purchaseId: MarketPurchaseId;
  readonly productId: MarketProductId;
  readonly buyerAccountId: string;
  readonly package: LockedPackageReference;
  readonly status: EntitlementStatus;
  readonly source: "PURCHASE";
}

export interface LicenseSnapshot {
  readonly licenseSnapshotId: LicenseSnapshotId;
  readonly productId: MarketProductId;
  readonly package: LockedPackageReference;
  readonly rights: readonly LicenseRight[];
  readonly status: LicenseStatus;
  readonly source: "PRODUCT" | "PURCHASE";
}

export function materializePurchaseRights(record: PurchaseRecord, product: MarketProductProjection, entitlementId: EntitlementId): MarketResult<{ readonly entitlement?: EntitlementRecord; readonly license: LicenseSnapshot }> {
  if (record.productId !== product.productId || record.package.contentHash !== product.package.contentHash) return failure([error("MISSING_LOCK", "Purchase and Product do not share the same locked package reference.", "package")]);
  const licenseStatus: LicenseStatus = record.lifecycle === "DISPUTED" ? "QUARANTINED" : (record.lifecycle === "REVERSED" || record.lifecycle === "CANCELLED" ? "REVOKED" : "ACTIVE");
  const license: LicenseSnapshot = { licenseSnapshotId: product.package.licenseSnapshotId, productId: product.productId, package: product.package, rights: product.rights, status: licenseStatus, source: "PURCHASE" };
  if (record.lifecycle === "PENDING" || record.lifecycle === "CHECKOUT_BOUND" || record.lifecycle === "FAILED") return success({ license: { ...license, status: "QUARANTINED" } }, [warning("ENTITLEMENT_NOT_ELIGIBLE", "Pending or failed Purchase does not create an Entitlement.", "purchase.lifecycle")]);
  const status: EntitlementStatus = record.lifecycle === "DISPUTED" ? "QUARANTINED" : (record.lifecycle === "REVERSED" || record.lifecycle === "CANCELLED" ? "REVOKED" : "ACTIVE");
  return success({ entitlement: { entitlementId, purchaseId: record.purchaseId, productId: record.productId, buyerAccountId: record.buyerAccountId, package: record.package, status, source: "PURCHASE" }, license });
}

export interface SubscriptionAccessProjection {
  readonly subscriptionId: string;
  readonly status: "ACTIVE" | "CANCELLED";
  readonly doesNotGrantPurchaseEntitlement: true;
}

export interface RoyaltyLedgerEntry {
  readonly ledgerEntryId: RoyaltyLedgerEntryId;
  readonly purchaseId: MarketPurchaseId;
  readonly productId: MarketProductId;
  readonly creatorAccountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: "PENDING" | "POSTED" | "REVERSED" | "PAID";
  readonly sourceEventId: PaymentEventId;
}

/** Structural validation only. This function never establishes financial authority. */
export function validateRoyaltyLedgerEntry(entry: RoyaltyLedgerEntry): MarketResult<RoyaltyLedgerEntry> {
  if (!SAFE_ID.test(entry.ledgerEntryId) || !SAFE_ID.test(entry.purchaseId) || !SAFE_ID.test(entry.productId) || !SAFE_ID.test(entry.sourceEventId)) return failure([error("LEDGER_INVALID", "Ledger identifiers are not stable.", "ledger")]);
  if (!validAccountReference(entry.creatorAccountId) || !isIntegerAmount(entry.amountMinor) || !validCurrency(entry.currency)) return failure([error("LEDGER_INVALID", "Ledger amount must remain an integer minor-unit value with an ISO currency.", "ledger")]);
  return success(entry);
}

export interface CommerceReconciliationInput {
  readonly product: MarketProductProjection;
  readonly purchase: PurchaseRecord;
  readonly paymentEvents: readonly PurchaseEvent[];
  readonly entitlementId: EntitlementId;
  readonly royalty: RoyaltyLedgerEntry;
}

export interface CommerceReconciliation {
  readonly product: MarketProductProjection;
  readonly purchase: PurchaseRecord;
  readonly entitlement?: EntitlementRecord;
  readonly license: LicenseSnapshot;
  readonly royalty: RoyaltyLedgerEntry;
  readonly delivery: "NOT_ENTITLED" | "SIGNED_URL_SERVER_BOUNDARY";
  readonly subscriptionIndependent: true;
  readonly sourceTombstoneSafe: true;
}

export function reconcileCommerce(input: CommerceReconciliationInput): MarketResult<CommerceReconciliation> {
  void input;
  return failure([error("LEGACY_ADAPTER_ONLY", "The legacy Commerce reconciliation shape accepts a caller-supplied royalty object and is disabled as a financial authority path. Use the FP-003 server-resolved financial materializer.", "royalty")]);
}

export type MarketFeatureFlag = "market-core-read" | "market-core-write" | "market-reconcile" | "market-publish" | "market-finance";
export type MarketFeatureFlags = Readonly<Record<string, boolean | undefined>>;

export const DEFAULT_WP210_FEATURE_FLAGS: Readonly<Record<MarketFeatureFlag, false>> = Object.freeze({
  "market-core-read": false,
  "market-core-write": false,
  "market-reconcile": false,
  "market-publish": false,
  "market-finance": false,
});

export function marketFeatureEnabled(flags: MarketFeatureFlags, flag: MarketFeatureFlag, killSwitch: boolean): MarketResult<true> {
  if (killSwitch) return failure([error("KILL_SWITCH_ACTIVE", "WP-210 is disabled by the kill switch.")]);
  if (!(flag in DEFAULT_WP210_FEATURE_FLAGS)) return failure([error("UNKNOWN_FLAG", "Unknown Market flag fails closed.", "flag")]);
  if (flags[flag] !== true) return failure([error("FEATURE_DISABLED", "Market feature is disabled by default.", "flag")]);
  return success(true);
}

export interface ProviderCommandInput {
  readonly action: "CREATE_CHECKOUT" | "CANCEL_CHECKOUT" | "REVERSE_PAYMENT" | "RESTORE_PURCHASE";
  readonly provider: "STRIPE" | "CURRENT_SERVER";
  readonly correlationId: string;
  readonly intentId: string;
  readonly idempotencyKey: string;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
}

export interface ProviderCommand {
  readonly action: ProviderCommandInput["action"];
  readonly provider: ProviderCommandInput["provider"];
  readonly correlationId: string;
  readonly intentId: string;
  readonly idempotencyKey: string;
  readonly commandHash: ContentHash;
  readonly execution: "EXTERNAL_AUTHORIZED_BOUNDARY_ONLY";
}

export async function createProviderCommand(input: ProviderCommandInput, flags: MarketFeatureFlags, killSwitch: boolean): Promise<MarketResult<ProviderCommand>> {
  const flag = input.action === "CREATE_CHECKOUT" || input.action === "CANCEL_CHECKOUT" ? "market-core-write" : "market-reconcile";
  const enabled = marketFeatureEnabled(flags, flag, killSwitch);
  if (!enabled.ok) return enabled;
  try {
    resolveAuthorizationProofV1(input.authorizationProof, { principalId: input.authorizationProof?.principalId ?? null, resourceType: "COMMERCE_PROVIDER_COMMAND", resourceId: input.intentId, action: "commerce.provider.command", capability: "commerce.provider.command", tenantId: input.authorizationProof?.tenantId ?? null, correlationId: input.correlationId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    return failure([error("PROVIDER_INPUT_REJECTED", "Provider commands require a server AuthorizationProofV1 bound to the Intent.", "authorizationProof")]);
  }
  const unknownKeys = Object.keys(input).filter((key) => ["secret", "token", "jwt", "email", "payload", "webhook", "checkoutSession"].includes(key));
  if (unknownKeys.length > 0) return failure([error("PROVIDER_INPUT_REJECTED", "Provider command cannot contain secret, identity, token, or raw payload fields.", "input")]);
  for (const value of [input.correlationId, input.intentId, input.idempotencyKey]) if (!validAccountReference(value)) return failure([error("PROVIDER_INPUT_REJECTED", "Provider command references must be opaque stable identifiers.", "input")]);
  const commandValue = { action: input.action, provider: input.provider, correlationId: input.correlationId, intentId: input.intentId, idempotencyKey: input.idempotencyKey };
  return success({ ...commandValue, commandHash: await hashCanonical(commandValue), execution: "EXTERNAL_AUTHORIZED_BOUNDARY_ONLY" });
}

export interface CommerceSnapshot {
  readonly product: MarketProductProjection;
  readonly purchase: PurchaseRecord;
  readonly entitlement?: EntitlementRecord;
  readonly license: LicenseSnapshot;
  readonly royalty: RoyaltyLedgerEntry;
}

export interface RollbackPlan {
  readonly planId: string;
  readonly fromSnapshotHash: ContentHash;
  readonly restoreSnapshotHash: ContentHash;
  readonly reason: string;
  readonly restoreSnapshot: CommerceSnapshot;
  readonly execution: "LOCAL_SHADOW_ONLY";
}

export async function createRollbackPlan(current: CommerceSnapshot, restore: CommerceSnapshot, reason: string): Promise<RollbackPlan> {
  const fromSnapshotHash = await hashCanonical(current);
  const restoreSnapshotHash = await hashCanonical(restore);
  return { planId: `wp210-rollback:${restoreSnapshotHash.slice(0, 16)}`, fromSnapshotHash, restoreSnapshotHash, reason: reason.slice(0, 160), restoreSnapshot: restore, execution: "LOCAL_SHADOW_ONLY" };
}

export function applyRollbackPlan(plan: RollbackPlan, currentSnapshotHash: ContentHash): MarketResult<CommerceSnapshot> {
  if (currentSnapshotHash !== plan.fromSnapshotHash) return failure([error("ROLLBACK_PRECONDITION_FAILED", "Rollback snapshot does not match the last validated projection.", "currentSnapshotHash")]);
  return success(plan.restoreSnapshot, [info("ROLLBACK_PRECONDITION_FAILED", "Local shadow projection restored; no external mutation was executed.", { externalMutation: false })]);
}

export function tombstoneSourcePreservesPurchase(snapshot: CommerceSnapshot): CommerceSnapshot {
  return { ...snapshot, product: { ...snapshot.product, status: "ARCHIVED" }, purchase: { ...snapshot.purchase, package: snapshot.purchase.package }, license: { ...snapshot.license, package: snapshot.license.package } };
}

export function auditSafeCommerceSummary(result: MarketResult<CommerceReconciliation>): Readonly<Record<string, string | number | boolean>> {
  if (!result.ok) return { ok: false, diagnosticCount: result.diagnostics.length, hasSensitiveFields: false };
  return { ok: true, lifecycle: result.value.purchase.lifecycle, entitlement: result.value.entitlement?.status ?? "NONE", delivery: result.value.delivery, hasSensitiveFields: false };
}

export function canonicalMarketProjection(value: MarketProductProjection): string {
  return canonicalJson(value);
}

export function asMarketContentHash(value: string): ContentHash { return asSha256(value, "MarketContentHash"); }
export { asPackageId };
