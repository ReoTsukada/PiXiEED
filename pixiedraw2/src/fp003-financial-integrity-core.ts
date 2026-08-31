/**
 * FP-003 isolated financial integrity core.
 *
 * This module is a pure, server-boundary adapter. It derives money,
 * allocations, and ledger projections from an authority resolver. Caller
 * supplied amount, currency, recipient, rate, and entry fields are never
 * accepted as financial authority. Durable Event/Inbox/Outbox behavior is
 * intentionally outside this module and remains FP-004 scope.
 */

import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  canonicalJson,
  hashCanonical,
  resolveAuthorizationProofV1,
  type AuthorizationProofExpectation,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
  type Brand,
  type ContentHash,
} from "./wp160-contracts.ts";
import {
  asDirectWorkLedgerEntryId,
  asDirectWorkPaymentEventId,
  createDirectWorkLedgerEntry,
  createDirectWorkLedgerEntryFromServerCanonical,
  type DirectWorkLedgerEntry,
  type DirectWorkPayment,
  type DirectWorkPaymentEvent,
  type DirectWorkPaymentEventId,
  type DirectWorkRequestId,
  type Money,
  type ServerCanonicalRecordReference,
  validateMoney,
} from "./wp220-direct-work-core.ts";
import {
  asPaymentEventId,
  asRoyaltyLedgerEntryId,
  materializePurchaseRights,
  reconcilePurchaseEvents,
  type EntitlementId,
  type LicenseSnapshot,
  type MarketProductId,
  type MarketProductProjection,
  type MarketPurchaseId,
  type MarketResult,
  type PurchaseEvent,
  type PurchaseRecord,
  type RoyaltyLedgerEntry,
} from "./wp210-market-rights-core.ts";

export const FP003_FINANCIAL_SCHEMA_VERSION = "FINANCIAL_INTEGRITY_V1" as const;
export const FP003_FINANCIAL_RESOURCE_TYPE = "FINANCIAL_ALLOCATION" as const;
export const FP003_FINANCIAL_ACTION = "finance.royalty.allocate" as const;
export const FP003_FINANCIAL_CAPABILITY = "finance.royalty.allocate" as const;

export type FinancialSourceKind = "MARKET_PURCHASE" | "DIRECT_WORK_PAYMENT";
export type FinancialSettlementState = "PAID" | "REFUNDED";
export type FinancialProviderEventId = Brand<string, "FinancialProviderEventId">;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const BPS_DENOMINATOR = 10_000n;
export const MAX_CANONICAL_MONEY_MINOR = Number.MAX_SAFE_INTEGER;
const MAX_CANONICAL_MONEY_MINOR_BIGINT = BigInt(MAX_CANONICAL_MONEY_MINOR);

export function asFinancialProviderEventId(value: string): FinancialProviderEventId {
  if (!SAFE_ID.test(value)) throw new Error("FinancialProviderEventId must be a stable identifier.");
  return value as FinancialProviderEventId;
}

export type FinancialDiagnosticCode =
  | "INVALID_ID"
  | "INVALID_HASH"
  | "PERMISSION_DENIED"
  | "FINANCIAL_AUTHORITY_REQUIRED"
  | "FINANCIAL_AUTHORITY_MISMATCH"
  | "CALLER_FINANCIAL_INPUT_REJECTED"
  | "MONEY_INVALID"
  | "CURRENCY_UNSUPPORTED"
  | "CURRENCY_MISMATCH"
  | "MONEY_OVERFLOW"
  | "FEE_SCHEDULE_INVALID"
  | "ROYALTY_ALLOCATION_INVALID"
  | "PROVIDER_EVENT_INVALID"
  | "PURCHASE_BINDING_MISMATCH"
  | "PAYMENT_BINDING_MISMATCH"
  | "LICENSE_BINDING_MISMATCH"
  | "LEDGER_INVALID"
  | "LEGACY_ADAPTER_ONLY"
  | "COLLABORATIVE_SNAPSHOT_INVALID"
  | "COLLABORATIVE_OVERRIDE_REJECTED"
  | "DUPLICATE_PRODUCT"
  | "DEDUCTION_INVALID"
  | "CONTRIBUTOR_ALLOCATION_INVALID";

export interface FinancialDiagnostic {
  readonly code: FinancialDiagnosticCode;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly message: string;
  readonly path?: string;
  readonly recoverable: boolean;
}

export type FinancialResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly FinancialDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly FinancialDiagnostic[] };

function error(code: FinancialDiagnosticCode, message: string, path?: string): FinancialDiagnostic {
  return { code, severity: "ERROR", message, ...(path === undefined ? {} : { path }), recoverable: false };
}

function info(code: FinancialDiagnosticCode, message: string): FinancialDiagnostic {
  return { code, severity: "INFO", message, recoverable: true };
}

function failure<T>(diagnostics: readonly FinancialDiagnostic[]): FinancialResult<T> {
  return { ok: false, diagnostics };
}

function success<T>(value: T, diagnostics: readonly FinancialDiagnostic[] = []): FinancialResult<T> {
  return { ok: true, value, diagnostics };
}

function validHash(value: string): boolean { return SHA256.test(value); }
function validId(value: string): boolean { return SAFE_ID.test(value); }
function validBps(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 && value <= 10_000; }

function sameMoney(left: Money, right: Money): boolean {
  return left.amountMinor === right.amountMinor
    && left.currency === right.currency
    && left.roundingPolicyVersion === right.roundingPolicyVersion;
}

function mapMarketDiagnostics(result: MarketResult<unknown>): readonly FinancialDiagnostic[] {
  return result.diagnostics.map((diagnostic) => ({
    code: diagnostic.code === "PERMISSION_DENIED" ? "PERMISSION_DENIED" : "FINANCIAL_AUTHORITY_MISMATCH",
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
    recoverable: diagnostic.recoverable,
  }));
}

/** Provider identity only. Monetary values are deliberately absent. */
export interface VerifiedProviderEventV1 {
  readonly schemaVersion: typeof FP003_FINANCIAL_SCHEMA_VERSION;
  readonly eventId: FinancialProviderEventId;
  readonly payloadFingerprint: ContentHash;
  readonly sourceKind: FinancialSourceKind;
  readonly sourceId: string;
  readonly eventType: FinancialSettlementState;
  readonly environment: "TEST" | "LIVE";
}

export interface RoyaltyRecipientAuthorityV1 {
  readonly recipientAccountId: string;
  readonly allocationBps: number;
}

export interface FeeScheduleAuthorityV1 {
  readonly feeScheduleId: string;
  readonly feeScheduleVersion: string;
  readonly platformFeeBps: number;
  readonly royaltyRecipients: readonly RoyaltyRecipientAuthorityV1[];
}

/** Server-owned resolution. This is not a client payload or a durable event. */
export interface FinancialAuthorityResolutionV1 {
  readonly schemaVersion: typeof FP003_FINANCIAL_SCHEMA_VERSION;
  readonly sourceKind: FinancialSourceKind;
  readonly sourceId: string;
  readonly productId?: MarketProductId;
  readonly purchaseId?: MarketPurchaseId;
  readonly requestId?: DirectWorkRequestId;
  readonly paymentId?: string;
  readonly providerEventId: FinancialProviderEventId;
  readonly payloadFingerprint: ContentHash;
  readonly environment: "TEST" | "LIVE";
  readonly settlementState: FinancialSettlementState;
  readonly gross: Money;
  readonly feeSchedule: FeeScheduleAuthorityV1;
}

export interface FinancialAuthorityResolverInput {
  readonly serverProof: AuthorizationProofV1;
  readonly expected: AuthorizationProofExpectation;
  readonly providerEvent: VerifiedProviderEventV1;
}

/** Must be backed by the server-owned authority boundary; never a UI callback. */
export type FinancialAuthorityResolver = (input: FinancialAuthorityResolverInput) => FinancialAuthorityResolutionV1;

/** Fields used only to prove that an outer caller cannot choose finance state. */
export interface UntrustedFinancialInput {
  readonly amountMinor?: number;
  readonly currency?: string;
  readonly recipientAccountId?: string;
  readonly royaltyRateBps?: number;
  readonly entryType?: string;
  readonly direction?: string;
}

export interface FinancialAuthorityInput {
  readonly providerEvent: VerifiedProviderEventV1;
  /** Resolved by the server from the canonical source record; never derived from callerProof. */
  readonly canonicalPrincipalId: string | null;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
  readonly authorityResolver: FinancialAuthorityResolver;
  readonly callerFinancialInput?: UntrustedFinancialInput;
}

export interface CanonicalRoyaltyAllocationV1 {
  readonly recipientAccountId: string;
  readonly allocationBps: number;
  readonly amount: Money;
  readonly gross: Money;
  readonly royaltyTotal: Money;
  readonly platformFee: Money;
  readonly feeScheduleId: string;
  readonly feeScheduleVersion: string;
}

export interface ResolvedFinancialAuthority {
  readonly proof: AuthorizationProofV1;
  readonly authority: FinancialAuthorityResolutionV1;
  readonly allocations: readonly CanonicalRoyaltyAllocationV1[];
}

function rejectCallerFinancialInput(input: FinancialAuthorityInput): FinancialResult<true> {
  if (input.callerFinancialInput !== undefined && Object.keys(input.callerFinancialInput).length > 0) {
    return failure([error("CALLER_FINANCIAL_INPUT_REJECTED", "Amount, currency, recipient, royalty rate, entry type, and direction must be derived by the server financial authority.", "callerFinancialInput")]);
  }
  return success(true);
}

function validateProviderEvent(event: VerifiedProviderEventV1): readonly FinancialDiagnostic[] {
  const diagnostics: FinancialDiagnostic[] = [];
  if (event.schemaVersion !== FP003_FINANCIAL_SCHEMA_VERSION || !validId(event.eventId) || !validId(event.sourceId)) diagnostics.push(error("PROVIDER_EVENT_INVALID", "Provider Event identity and schema version are invalid.", "providerEvent"));
  if (!validHash(event.payloadFingerprint)) diagnostics.push(error("INVALID_HASH", "Provider Event payload fingerprint must be a SHA-256 hash.", "providerEvent.payloadFingerprint"));
  return diagnostics;
}

function validateAuthority(event: VerifiedProviderEventV1, authority: FinancialAuthorityResolutionV1): readonly FinancialDiagnostic[] {
  const diagnostics: FinancialDiagnostic[] = [];
  if (authority.schemaVersion !== FP003_FINANCIAL_SCHEMA_VERSION) diagnostics.push(error("FINANCIAL_AUTHORITY_MISMATCH", "Financial authority schema version is not supported.", "authority.schemaVersion"));
  if (authority.sourceKind !== event.sourceKind || authority.sourceId !== event.sourceId) diagnostics.push(error("FINANCIAL_AUTHORITY_MISMATCH", "Financial authority is bound to a different source.", "authority.sourceId"));
  if (authority.providerEventId !== event.eventId || authority.payloadFingerprint !== event.payloadFingerprint || authority.environment !== event.environment || authority.settlementState !== event.eventType) diagnostics.push(error("PROVIDER_EVENT_INVALID", "Financial authority does not match the verified Provider Event identity.", "authority.providerEventId"));
  const money = validateMoney(authority.gross);
  if (!money.ok) diagnostics.push(error("MONEY_INVALID", "Financial authority gross amount is not canonical Money.", "authority.gross"));
  const { feeSchedule } = authority;
  if (!validId(feeSchedule.feeScheduleId) || feeSchedule.feeScheduleVersion.length === 0 || !validBps(feeSchedule.platformFeeBps)) diagnostics.push(error("FEE_SCHEDULE_INVALID", "Fee Schedule identity and platform fee are invalid.", "authority.feeSchedule"));
  if (feeSchedule.royaltyRecipients.length === 0) diagnostics.push(error("ROYALTY_ALLOCATION_INVALID", "At least one server-resolved royalty recipient is required.", "authority.feeSchedule.royaltyRecipients"));
  const seenRecipients = new Set<string>();
  let royaltyBps = 0;
  for (const recipient of feeSchedule.royaltyRecipients) {
    if (!validId(recipient.recipientAccountId) || !validBps(recipient.allocationBps) || recipient.allocationBps === 0 || seenRecipients.has(recipient.recipientAccountId)) diagnostics.push(error("ROYALTY_ALLOCATION_INVALID", "Royalty recipient identity and allocation must be unique, stable, and positive.", "authority.feeSchedule.royaltyRecipients"));
    seenRecipients.add(recipient.recipientAccountId);
    royaltyBps += recipient.allocationBps;
  }
  if (royaltyBps === 0 || royaltyBps + feeSchedule.platformFeeBps > 10_000) diagnostics.push(error("FEE_SCHEDULE_INVALID", "Platform and royalty allocations cannot exceed the canonical basis-point denominator.", "authority.feeSchedule"));
  if (authority.sourceKind === "MARKET_PURCHASE" && (authority.productId === undefined || authority.purchaseId === undefined || authority.paymentId !== undefined || authority.requestId !== undefined)) diagnostics.push(error("PURCHASE_BINDING_MISMATCH", "Market authority must bind Product and Purchase only.", "authority"));
  if (authority.sourceKind === "DIRECT_WORK_PAYMENT" && (authority.requestId === undefined || authority.paymentId === undefined || authority.productId !== undefined || authority.purchaseId !== undefined)) diagnostics.push(error("PAYMENT_BINDING_MISMATCH", "Direct Work authority must bind Request and Payment only.", "authority"));
  return diagnostics;
}

function allocateMinorUnits(grossMinor: number, recipients: readonly RoyaltyRecipientAuthorityV1[]): readonly number[] {
  const gross = BigInt(grossMinor);
  const exact = recipients.map((recipient) => gross * BigInt(recipient.allocationBps));
  const floors = exact.map((value) => value / BPS_DENOMINATOR);
  const total = exact.reduce((sum, value) => sum + value, 0n) / BPS_DENOMINATOR;
  let remainder = Number(total - floors.reduce((sum, value) => sum + value, 0n));
  const order = recipients.map((recipient, index) => ({ index, remainder: exact[index]! % BPS_DENOMINATOR, accountId: recipient.recipientAccountId }))
    .sort((left, right) => Number(right.remainder - left.remainder) || left.accountId.localeCompare(right.accountId));
  const amounts = floors.map((value) => Number(value));
  for (const item of order) {
    if (remainder <= 0) break;
    amounts[item.index] = amounts[item.index]! + 1;
    remainder -= 1;
  }
  return amounts;
}

function deriveAllocations(authority: FinancialAuthorityResolutionV1): readonly CanonicalRoyaltyAllocationV1[] {
  const recipients = [...authority.feeSchedule.royaltyRecipients].sort((left, right) => left.recipientAccountId.localeCompare(right.recipientAccountId));
  const amounts = allocateMinorUnits(authority.gross.amountMinor, recipients);
  const royaltyTotalMinor = amounts.reduce((sum, amount) => sum + amount, 0);
  const platformFeeMinor = Number((BigInt(authority.gross.amountMinor) * BigInt(authority.feeSchedule.platformFeeBps)) / BPS_DENOMINATOR);
  const royaltyTotal: Money = { ...authority.gross, amountMinor: royaltyTotalMinor };
  const platformFee: Money = { ...authority.gross, amountMinor: platformFeeMinor };
  return recipients.map((recipient, index) => ({
    recipientAccountId: recipient.recipientAccountId,
    allocationBps: recipient.allocationBps,
    amount: { ...authority.gross, amountMinor: amounts[index]! },
    gross: authority.gross,
    royaltyTotal,
    platformFee,
    feeScheduleId: authority.feeSchedule.feeScheduleId,
    feeScheduleVersion: authority.feeSchedule.feeScheduleVersion,
  }));
}

export function resolveFinancialAuthority(input: FinancialAuthorityInput): FinancialResult<ResolvedFinancialAuthority> {
  const callerInput = rejectCallerFinancialInput(input);
  if (!callerInput.ok) return callerInput;
  const providerDiagnostics = validateProviderEvent(input.providerEvent);
  if (providerDiagnostics.some((diagnostic) => diagnostic.severity === "ERROR")) return failure(providerDiagnostics);
  const expected: AuthorizationProofExpectation = {
    principalId: input.canonicalPrincipalId,
    resourceType: FP003_FINANCIAL_RESOURCE_TYPE,
    resourceId: input.providerEvent.sourceId,
    action: FP003_FINANCIAL_ACTION,
    capability: FP003_FINANCIAL_CAPABILITY,
    tenantId: input.authorizationProof?.tenantId ?? null,
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
  };
  let proof: AuthorizationProofV1;
  let authority: FinancialAuthorityResolutionV1;
  try {
    proof = resolveAuthorizationProofV1(input.authorizationProof, expected, input.authorizationProofResolver as AuthorizationProofResolver);
    authority = input.authorityResolver({ serverProof: proof, expected, providerEvent: input.providerEvent });
  } catch {
    return failure([error("PERMISSION_DENIED", "Financial allocation requires a server AuthorizationProofV1 and server-owned financial authority resolver.", "authorizationProof")]);
  }
  const authorityDiagnostics = validateAuthority(input.providerEvent, authority);
  if (authorityDiagnostics.some((diagnostic) => diagnostic.severity === "ERROR")) return failure(authorityDiagnostics);
  return success({ proof, authority, allocations: deriveAllocations(authority) }, [info("FINANCIAL_AUTHORITY_REQUIRED", "Money and royalty allocations were derived from the server-owned authority resolution.")]);
}

export interface CanonicalMarketRoyaltyLedgerEntry extends RoyaltyLedgerEntry {
  readonly allocationBps: number;
  readonly grossAmount: Money;
  readonly feeScheduleId: string;
  readonly feeScheduleVersion: string;
  readonly immutableHash: ContentHash;
}

export interface MarketFinancialSettlement {
  readonly purchase: PurchaseRecord;
  readonly entitlement?: { readonly entitlementId: EntitlementId };
  readonly license: LicenseSnapshot;
  readonly allocations: readonly CanonicalRoyaltyAllocationV1[];
  readonly ledgerEntries: readonly CanonicalMarketRoyaltyLedgerEntry[];
}

export async function materializeMarketFinancialSettlement(input: FinancialAuthorityInput & {
  readonly product: MarketProductProjection;
  readonly purchase: PurchaseRecord;
  readonly paymentEvents: readonly PurchaseEvent[];
  readonly entitlementId: EntitlementId;
}): Promise<FinancialResult<MarketFinancialSettlement>> {
  const authorityResult = resolveFinancialAuthority(input);
  if (!authorityResult.ok) return authorityResult;
  const { authority, allocations } = authorityResult.value;
  if (authority.sourceKind !== "MARKET_PURCHASE" || authority.productId !== input.product.productId || authority.purchaseId !== input.purchase.purchaseId || input.purchase.productId !== input.product.productId) return failure([error("PURCHASE_BINDING_MISMATCH", "Product, Purchase, and Financial Authority must share one canonical Market identity.", "purchase")]);
  if (!sameMoney(authority.gross, { amountMinor: input.purchase.amount.amountMinor, currency: input.purchase.amount.currency, roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" })) return failure([error("PURCHASE_BINDING_MISMATCH", "Market Purchase amount must equal the server-resolved canonical gross amount.", "purchase.amount")]);
  const expectedEventType = authority.settlementState === "PAID" ? "PAID" : "REVERSED";
  const providerEventId = asPaymentEventId(authority.providerEventId);
  const matchingEvent = input.paymentEvents.find((event) => event.eventId === providerEventId && event.payloadFingerprint === authority.payloadFingerprint && event.type === expectedEventType);
  if (matchingEvent === undefined) return failure([error("PROVIDER_EVENT_INVALID", "Market Purchase does not contain the exact server-verified Provider Event identity.", "paymentEvents")]);
  const purchaseResult = reconcilePurchaseEvents(input.purchase, input.paymentEvents);
  if (!purchaseResult.ok) return failure(mapMarketDiagnostics(purchaseResult));
  const rightsResult = materializePurchaseRights(purchaseResult.value, input.product, input.entitlementId);
  if (!rightsResult.ok) return failure(mapMarketDiagnostics(rightsResult));
  const ledgerEntries: CanonicalMarketRoyaltyLedgerEntry[] = [];
  for (const [index, allocation] of allocations.entries()) {
    const ledgerValue = {
      ledgerEntryId: asRoyaltyLedgerEntryId(`${input.purchase.purchaseId}:royalty:${index}`),
      purchaseId: input.purchase.purchaseId,
      productId: input.product.productId,
      creatorAccountId: allocation.recipientAccountId,
      amountMinor: allocation.amount.amountMinor,
      currency: allocation.amount.currency,
      status: authority.settlementState === "PAID" ? "POSTED" as const : "REVERSED" as const,
      sourceEventId: providerEventId,
      allocationBps: allocation.allocationBps,
      grossAmount: allocation.gross,
      feeScheduleId: allocation.feeScheduleId,
      feeScheduleVersion: allocation.feeScheduleVersion,
    };
    ledgerEntries.push({ ...ledgerValue, immutableHash: await hashCanonical(ledgerValue) });
  }
  return success({
    purchase: purchaseResult.value,
    ...(rightsResult.value.entitlement === undefined ? {} : { entitlement: { entitlementId: rightsResult.value.entitlement.entitlementId } }),
    license: rightsResult.value.license,
    allocations,
    ledgerEntries,
  }, [...authorityResult.diagnostics, ...mapMarketDiagnostics(purchaseResult)]);
}

export interface DirectWorkFinancialSettlement {
  readonly payment: DirectWorkPayment;
  readonly allocations: readonly CanonicalRoyaltyAllocationV1[];
  readonly ledgerEntry: DirectWorkLedgerEntry;
}

export async function materializeDirectWorkFinancialSettlement(input: FinancialAuthorityInput & {
  readonly payment: DirectWorkPayment;
  readonly sourceEvent: DirectWorkPaymentEvent;
  readonly canonicalPaymentReference?: ServerCanonicalRecordReference;
}): Promise<FinancialResult<DirectWorkFinancialSettlement>> {
  const authorityResult = resolveFinancialAuthority(input);
  if (!authorityResult.ok) return authorityResult;
  const { authority, allocations } = authorityResult.value;
  if (authority.sourceKind !== "DIRECT_WORK_PAYMENT" || authority.paymentId !== input.payment.paymentId || authority.requestId !== input.payment.requestId || input.sourceEvent.paymentId !== input.payment.paymentId || input.sourceEvent.requestId !== input.payment.requestId) return failure([error("PAYMENT_BINDING_MISMATCH", "Request, Payment, Provider Event, and Financial Authority must share one Direct Work identity.", "payment")]);
  if (!sameMoney(authority.gross, input.payment.amount)) return failure([error("PAYMENT_BINDING_MISMATCH", "Direct Work Payment amount must equal the server-resolved canonical gross amount.", "payment.amount")]);
  const expectedEventType = authority.settlementState === "PAID" ? "PAID" : "REFUNDED";
  if (input.sourceEvent.eventId !== asDirectWorkPaymentEventId(authority.providerEventId) || input.sourceEvent.fingerprint !== authority.payloadFingerprint || input.sourceEvent.type !== expectedEventType) return failure([error("PROVIDER_EVENT_INVALID", "Direct Work Payment does not contain the exact server-verified Provider Event identity.", "sourceEvent")]);
  const ledgerResult = input.canonicalPaymentReference === undefined
    ? await createDirectWorkLedgerEntry({ payment: input.payment, sourceEvent: input.sourceEvent, ledgerEntryId: asDirectWorkLedgerEntryId(`${input.payment.paymentId}:ledger:${input.sourceEvent.eventId}`) })
    : await createDirectWorkLedgerEntryFromServerCanonical({ payment: input.payment, sourceEvent: input.sourceEvent, ledgerEntryId: asDirectWorkLedgerEntryId(`${input.payment.paymentId}:ledger:${input.sourceEvent.eventId}`), canonicalPaymentReference: input.canonicalPaymentReference });
  if (!ledgerResult.ok) return failure(ledgerResult.diagnostics.map((diagnostic) => ({ code: diagnostic.code === "LEDGER_INVALID" || diagnostic.code === "RECORD_INTEGRITY_VIOLATION" ? "LEDGER_INVALID" : "PAYMENT_BINDING_MISMATCH", severity: diagnostic.severity, message: diagnostic.message, ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }), recoverable: diagnostic.recoverable })));
  return success({ payment: input.payment, allocations, ledgerEntry: ledgerResult.value }, authorityResult.diagnostics);
}

export function canonicalFinancialAuthority(value: unknown): string {
  return canonicalJson(value);
}

export const COLLABORATIVE_COMMERCE_SCHEMA_VERSION = "COLLABORATIVE_COMMERCE_V1" as const;
export const CONTRIBUTOR_SNAPSHOT_SCHEMA_VERSION = "CONTRIBUTOR_SNAPSHOT_V1" as const;
export const EQUAL_AFTER_DEDUCTIONS_POLICY = "EQUAL_AFTER_DEDUCTIONS_V1" as const;

export type CollaborativeWorkId = Brand<string, "CollaborativeWorkId">;
export type ContributorSnapshotId = Brand<string, "ContributorSnapshotId">;
export type ProductRevisionId = Brand<string, "ProductRevisionId">;

export function asCollaborativeWorkId(value: string): CollaborativeWorkId {
  if (!validId(value)) throw new Error("CollaborativeWorkId must be a stable identifier.");
  return value as CollaborativeWorkId;
}

export function asContributorSnapshotId(value: string): ContributorSnapshotId {
  if (!validId(value)) throw new Error("ContributorSnapshotId must be a stable identifier.");
  return value as ContributorSnapshotId;
}

export function asProductRevisionId(value: string): ProductRevisionId {
  if (!validId(value)) throw new Error("ProductRevisionId must be a stable identifier.");
  return value as ProductRevisionId;
}

export interface ContributorSnapshotMemberV1 {
  readonly contributorId: string;
  readonly allocationOrder: number;
}

export interface ContributorSnapshotV1 {
  readonly schemaVersion: typeof CONTRIBUTOR_SNAPSHOT_SCHEMA_VERSION;
  readonly snapshotId: ContributorSnapshotId;
  readonly collaborativeWorkId: CollaborativeWorkId;
  readonly contributors: readonly ContributorSnapshotMemberV1[];
  readonly status: "LOCKED";
  readonly snapshotHash: ContentHash;
}

export async function createContributorSnapshot(input: {
  readonly snapshotId: ContributorSnapshotId;
  readonly collaborativeWorkId: CollaborativeWorkId;
  readonly contributors: readonly ContributorSnapshotMemberV1[];
}): Promise<FinancialResult<ContributorSnapshotV1>> {
  if (!validId(input.snapshotId) || !validId(input.collaborativeWorkId) || input.contributors.length === 0) return failure([error("COLLABORATIVE_SNAPSHOT_INVALID", "A Contributor Snapshot requires stable Work/Snapshot IDs and at least one Contributor.", "contributors")]);
  const seen = new Set<string>();
  for (const contributor of input.contributors) {
    if (!validId(contributor.contributorId) || !Number.isSafeInteger(contributor.allocationOrder) || contributor.allocationOrder < 0 || seen.has(contributor.contributorId)) return failure([error("COLLABORATIVE_SNAPSHOT_INVALID", "Contributor IDs must be unique stable references with a fixed allocation order.", "contributors")]);
    seen.add(contributor.contributorId);
  }
  const contributors = [...input.contributors].sort((left, right) => left.allocationOrder - right.allocationOrder || left.contributorId.localeCompare(right.contributorId));
  const snapshotValue = { schemaVersion: CONTRIBUTOR_SNAPSHOT_SCHEMA_VERSION, snapshotId: input.snapshotId, collaborativeWorkId: input.collaborativeWorkId, contributors, status: "LOCKED" as const };
  return success({ ...snapshotValue, snapshotHash: await hashCanonical(snapshotValue) });
}

export interface ProductFingerprintV1 {
  readonly schemaVersion: typeof COLLABORATIVE_COMMERCE_SCHEMA_VERSION;
  readonly collaborativeWorkId: CollaborativeWorkId;
  readonly includedAssetRevisionSet: readonly string[];
  readonly deliveryFormat: string;
  readonly saleType: string;
  readonly licenseSnapshotId: string;
  /** Canonical semantic License Snapshot hash; generated IDs alone are not duplicate authority. */
  readonly licenseSemanticHash: ContentHash;
  readonly sourceIncluded: boolean;
  readonly fingerprint: ContentHash;
}

export async function createProductFingerprint(input: Omit<ProductFingerprintV1, "schemaVersion" | "fingerprint">): Promise<FinancialResult<ProductFingerprintV1>> {
  const revisions = [...input.includedAssetRevisionSet].sort();
  if (!validId(input.collaborativeWorkId) || revisions.length === 0 || revisions.some((revision, index) => !validId(revision) || revisions.indexOf(revision) !== index) || !validId(input.deliveryFormat) || !validId(input.saleType) || !validId(input.licenseSnapshotId) || !validHash(input.licenseSemanticHash) || typeof input.sourceIncluded !== "boolean") return failure([error("COLLABORATIVE_SNAPSHOT_INVALID", "Product Fingerprint requires a Work, unique included Revision set, delivery format, sale type, semantic License Snapshot hash, and boolean source inclusion.", "productFingerprint")]);
  // Snapshot IDs are references; semantic License content, not generated IDs, is duplicate authority.
  const fingerprintValue = { schemaVersion: COLLABORATIVE_COMMERCE_SCHEMA_VERSION, collaborativeWorkId: input.collaborativeWorkId, includedAssetRevisionSet: revisions, deliveryFormat: input.deliveryFormat.normalize("NFC"), saleType: input.saleType.normalize("NFC"), licenseSemanticHash: input.licenseSemanticHash, sourceIncluded: input.sourceIncluded };
  return success({ ...fingerprintValue, licenseSnapshotId: input.licenseSnapshotId, fingerprint: await hashCanonical(fingerprintValue) });
}

export async function guardDuplicateProductFingerprint(candidate: ProductFingerprintV1, existing: readonly ProductFingerprintV1[]): Promise<FinancialResult<ProductFingerprintV1>> {
  const validation = await validateProductFingerprint(candidate, candidate.collaborativeWorkId);
  if (validation.some((diagnostic) => diagnostic.severity === "ERROR")) return failure(validation);
  for (const product of existing) {
    const existingValidation = await validateProductFingerprint(product, candidate.collaborativeWorkId);
    if (existingValidation.some((diagnostic) => diagnostic.severity === "ERROR")) return failure(existingValidation);
  }
  if (existing.some((product) => product.fingerprint === candidate.fingerprint)) return failure([error("DUPLICATE_PRODUCT", "An identical Product Fingerprint already exists for this sale shape.", "productFingerprint.fingerprint")]);
  return success(candidate);
}

export type CollaborativeDeductionKind = "PAYMENT_PROVIDER_FEE" | "PIXIEED_FEE" | "EXTERNAL_ASSET_FEE" | "PARENT_DERIVATIVE_ROYALTY" | "OTHER_CANONICAL";

const DEDUCTION_ORDER: readonly CollaborativeDeductionKind[] = ["PAYMENT_PROVIDER_FEE", "PIXIEED_FEE", "EXTERNAL_ASSET_FEE", "PARENT_DERIVATIVE_ROYALTY", "OTHER_CANONICAL"];

export interface CanonicalCollaborativeDeductionV1 {
  readonly deductionId: string;
  readonly sourceId: string;
  readonly kind: CollaborativeDeductionKind;
  readonly amount: Money;
}

export interface CollaborativeRevenueAuthorityV1 {
  readonly schemaVersion: typeof COLLABORATIVE_COMMERCE_SCHEMA_VERSION;
  readonly collaborativeWorkId: CollaborativeWorkId;
  readonly productId: MarketProductId;
  readonly productRevisionId: ProductRevisionId;
  readonly productLeadId: string;
  readonly contributorSnapshot: ContributorSnapshotV1;
  /** Resolved from the Collaborative Work Registry; identical across all Product revisions. */
  readonly canonicalContributorSnapshotHash: ContentHash;
  readonly productFingerprint: ProductFingerprintV1;
  readonly gross: Money;
  readonly deductions: readonly CanonicalCollaborativeDeductionV1[];
}

export interface CollaborativeRevenueInput {
  readonly authority: CollaborativeRevenueAuthorityV1;
  readonly callerOverrides?: Readonly<Record<string, unknown>>;
}

export interface ContributorRevenueAllocationV1 {
  readonly collaborativeWorkId: CollaborativeWorkId;
  readonly productId: MarketProductId;
  readonly productRevisionId: ProductRevisionId;
  readonly contributorSnapshotHash: ContentHash;
  readonly productLeadId: string;
  readonly contributorId: string;
  readonly allocationOrder: number;
  readonly policy: typeof EQUAL_AFTER_DEDUCTIONS_POLICY;
  readonly gross: Money;
  readonly deductionsTotal: Money;
  readonly netContributorPool: Money;
  readonly amount: Money;
}

function deductionRank(kind: CollaborativeDeductionKind): number {
  return DEDUCTION_ORDER.indexOf(kind);
}

function sameMoneyShape(left: Money, right: Money): boolean {
  return left.currency === right.currency && left.roundingPolicyVersion === right.roundingPolicyVersion;
}

async function validateContributorSnapshot(snapshot: ContributorSnapshotV1, expectedWorkId: CollaborativeWorkId): Promise<readonly FinancialDiagnostic[]> {
  const diagnostics: FinancialDiagnostic[] = [];
  if (snapshot.schemaVersion !== CONTRIBUTOR_SNAPSHOT_SCHEMA_VERSION || snapshot.status !== "LOCKED" || snapshot.collaborativeWorkId !== expectedWorkId || !validId(snapshot.snapshotId) || snapshot.contributors.length === 0 || !validHash(snapshot.snapshotHash)) diagnostics.push(error("COLLABORATIVE_SNAPSHOT_INVALID", "Contributor Snapshot must be a locked, hashed snapshot bound to the Collaborative Work.", "contributorSnapshot"));
  const seen = new Set<string>();
  for (const contributor of snapshot.contributors) {
    if (!validId(contributor.contributorId) || !Number.isSafeInteger(contributor.allocationOrder) || contributor.allocationOrder < 0 || seen.has(contributor.contributorId)) diagnostics.push(error("COLLABORATIVE_SNAPSHOT_INVALID", "Contributor Snapshot members must be unique stable IDs with fixed allocation order.", "contributorSnapshot.contributors"));
    seen.add(contributor.contributorId);
  }
  const canonical = { schemaVersion: CONTRIBUTOR_SNAPSHOT_SCHEMA_VERSION, snapshotId: snapshot.snapshotId, collaborativeWorkId: snapshot.collaborativeWorkId, contributors: [...snapshot.contributors].sort((left, right) => left.allocationOrder - right.allocationOrder || left.contributorId.localeCompare(right.contributorId)), status: "LOCKED" as const };
  if (validHash(snapshot.snapshotHash) && await hashCanonical(canonical) !== snapshot.snapshotHash) diagnostics.push(error("COLLABORATIVE_SNAPSHOT_INVALID", "Contributor Snapshot hash does not match its locked members.", "contributorSnapshot.snapshotHash"));
  return diagnostics;
}

async function validateProductFingerprint(fingerprint: ProductFingerprintV1, expectedWorkId: CollaborativeWorkId): Promise<readonly FinancialDiagnostic[]> {
  const diagnostics: FinancialDiagnostic[] = [];
  if (fingerprint.schemaVersion !== COLLABORATIVE_COMMERCE_SCHEMA_VERSION || fingerprint.collaborativeWorkId !== expectedWorkId || !validHash(fingerprint.fingerprint)) diagnostics.push(error("COLLABORATIVE_SNAPSHOT_INVALID", "Product Fingerprint is not a valid hashed Product shape bound to the Collaborative Work.", "productFingerprint"));
  const expected = await createProductFingerprint({ collaborativeWorkId: fingerprint.collaborativeWorkId, includedAssetRevisionSet: fingerprint.includedAssetRevisionSet, deliveryFormat: fingerprint.deliveryFormat, saleType: fingerprint.saleType, licenseSnapshotId: fingerprint.licenseSnapshotId, licenseSemanticHash: fingerprint.licenseSemanticHash, sourceIncluded: fingerprint.sourceIncluded });
  if (!expected.ok || expected.value.fingerprint !== fingerprint.fingerprint) diagnostics.push(error("COLLABORATIVE_SNAPSHOT_INVALID", "Product Fingerprint hash does not match its canonical fields.", "productFingerprint.fingerprint"));
  return diagnostics;
}

export async function deriveCollaborativeRevenueAllocation(input: CollaborativeRevenueInput): Promise<FinancialResult<readonly ContributorRevenueAllocationV1[]>> {
  if (input.callerOverrides !== undefined && Object.keys(input.callerOverrides).length > 0) return failure([error("COLLABORATIVE_OVERRIDE_REJECTED", "Product Lead, Contributor Snapshot, Product Fingerprint, and Revenue Allocation cannot be overridden by a caller.", "callerOverrides")]);
  const authority = input.authority;
  const diagnostics: FinancialDiagnostic[] = [];
  if (authority.schemaVersion !== COLLABORATIVE_COMMERCE_SCHEMA_VERSION || !validId(authority.collaborativeWorkId) || !validId(authority.productId) || !validId(authority.productRevisionId) || !validId(authority.productLeadId)) diagnostics.push(error("COLLABORATIVE_SNAPSHOT_INVALID", "Collaborative Revenue Authority identity is invalid.", "authority"));
  diagnostics.push(...await validateContributorSnapshot(authority.contributorSnapshot, authority.collaborativeWorkId));
  if (!validHash(authority.canonicalContributorSnapshotHash) || authority.canonicalContributorSnapshotHash !== authority.contributorSnapshot.snapshotHash) diagnostics.push(error("COLLABORATIVE_SNAPSHOT_INVALID", "Every Product revision must bind to the one canonical Contributor Snapshot of its Collaborative Work.", "authority.canonicalContributorSnapshotHash"));
  diagnostics.push(...await validateProductFingerprint(authority.productFingerprint, authority.collaborativeWorkId));
  const grossResult = validateMoney(authority.gross);
  if (!grossResult.ok) diagnostics.push(error("MONEY_INVALID", "Collaborative Revenue gross amount is not canonical Money.", "authority.gross"));
  const seenDeductions = new Set<string>();
  const deductions = [...authority.deductions].sort((left, right) => deductionRank(left.kind) - deductionRank(right.kind) || left.deductionId.localeCompare(right.deductionId));
  let deductionsMinor = 0n;
  for (const deduction of deductions) {
    const money = validateMoney(deduction.amount);
    if (!validId(deduction.deductionId) || !validId(deduction.sourceId) || !DEDUCTION_ORDER.includes(deduction.kind) || seenDeductions.has(deduction.deductionId) || !money.ok || (grossResult.ok && !sameMoneyShape(deduction.amount, grossResult.value))) diagnostics.push(error("DEDUCTION_INVALID", "Deductions must be unique, canonical, ordered by policy, and use the gross currency.", "authority.deductions"));
    seenDeductions.add(deduction.deductionId);
    if (money.ok) {
      const next = deductionsMinor + BigInt(deduction.amount.amountMinor);
      if (next > MAX_CANONICAL_MONEY_MINOR_BIGINT) diagnostics.push(error("MONEY_OVERFLOW", "Canonical deduction total exceeds the safe minor-unit range.", "authority.deductions"));
      else deductionsMinor = next;
    }
  }
  if (grossResult.ok && deductionsMinor > BigInt(grossResult.value.amountMinor)) diagnostics.push(error("DEDUCTION_INVALID", "Canonical deductions cannot exceed Gross Sale.", "authority.deductions"));
  if (diagnostics.some((diagnostic) => diagnostic.severity === "ERROR") || !grossResult.ok) return failure(diagnostics);
  const contributors = [...authority.contributorSnapshot.contributors].sort((left, right) => left.allocationOrder - right.allocationOrder || left.contributorId.localeCompare(right.contributorId));
  const deductionsMinorNumber = Number(deductionsMinor);
  const poolMinor = grossResult.value.amountMinor - deductionsMinorNumber;
  const base = Math.floor(poolMinor / contributors.length);
  const remainder = poolMinor % contributors.length;
  const deductionsTotal: Money = { ...grossResult.value, amountMinor: deductionsMinorNumber };
  const netContributorPool: Money = { ...grossResult.value, amountMinor: poolMinor };
  return success(contributors.map((contributor, index) => Object.freeze({
    collaborativeWorkId: authority.collaborativeWorkId,
    productId: authority.productId,
    productRevisionId: authority.productRevisionId,
    contributorSnapshotHash: authority.contributorSnapshot.snapshotHash,
    productLeadId: authority.productLeadId,
    contributorId: contributor.contributorId,
    allocationOrder: contributor.allocationOrder,
    policy: EQUAL_AFTER_DEDUCTIONS_POLICY,
    gross: grossResult.value,
    deductionsTotal,
    netContributorPool,
    amount: { ...grossResult.value, amountMinor: base + (index < remainder ? 1 : 0) },
  })), [info("FINANCIAL_AUTHORITY_REQUIRED", "Contributor Snapshot is locked and Net Contributor Pool is divided equally after canonical deductions.")]);
}
