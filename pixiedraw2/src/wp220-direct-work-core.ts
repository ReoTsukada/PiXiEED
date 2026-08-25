/**
 * WP-220 isolated Direct Work Request and Billing Core.
 *
 * The module is a deterministic local/shadow contract. It reuses WP-160
 * typed IDs, hashes, and canonical JSON. It does not contain a browser,
 * persistence, route, provider, Market, or production mutation adapter.
 */

import {
  asSha256,
  canonicalJson,
  hashCanonical,
  AUTHORIZATION_PROOF_POLICY_VERSION,
  resolveAuthorizationProofV1,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
  type Brand,
  type ContentHash,
} from "./wp160-contracts.ts";

export type DirectWorkRequestId = Brand<string, "DirectWorkRequestId">;
export type DirectWorkQuoteId = Brand<string, "DirectWorkQuoteId">;
export type DirectWorkAgreementId = Brand<string, "DirectWorkAgreementId">;
export type DirectWorkMilestoneId = Brand<string, "DirectWorkMilestoneId">;
export type DirectWorkDeliveryId = Brand<string, "DirectWorkDeliveryId">;
export type DirectWorkAcceptanceId = Brand<string, "DirectWorkAcceptanceId">;
export type DirectWorkRightsDecisionId = Brand<string, "DirectWorkRightsDecisionId">;
export type DirectWorkPaymentId = Brand<string, "DirectWorkPaymentId">;
export type DirectWorkPaymentEventId = Brand<string, "DirectWorkPaymentEventId">;
export type DirectWorkLedgerEntryId = Brand<string, "DirectWorkLedgerEntryId">;

export const DIRECT_WORK_GRAPH_VERSION = "DIRECT_WORK_GRAPH_V1" as const;
/**
 * Legacy core-only records may predate Tenant binding.  This sentinel is an
 * adapter namespace, never a Server Registry Tenant and never accepted by
 * the FP-003Z server Composition Root as authenticated context.
 */
export const LEGACY_COMPATIBILITY_TENANT_ID = "legacy-compatibility" as const;
export type DirectWorkGraphVersion = typeof DIRECT_WORK_GRAPH_VERSION;

/**
 * The only aggregate identity used by Direct Work. Every child record copies
 * the root Request identity and adds its own parent-chain identifiers. This
 * is a local/shadow integrity contract; it is not a payment or event proof.
 */
export interface DirectWorkAggregateIdentity {
  readonly graphVersion: DirectWorkGraphVersion;
  /** Resolved Server Tenant namespace; never selected by a Browser command. */
  readonly tenantId: string;
  readonly aggregateId: DirectWorkRequestId;
  readonly requestId: DirectWorkRequestId;
  readonly quoteId?: DirectWorkQuoteId;
  readonly agreementId?: DirectWorkAgreementId;
  readonly milestoneId?: DirectWorkMilestoneId;
  readonly deliveryId?: DirectWorkDeliveryId;
  readonly acceptanceId?: DirectWorkAcceptanceId;
  readonly rightsDecisionId?: DirectWorkRightsDecisionId;
  readonly paymentId?: DirectWorkPaymentId;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const FORBIDDEN_PRIVATE_KEYS = [
  "body", "rawBody", "requestBody", "projectContent", "privateContent", "jwt", "secret",
  "email", "phone", "paymentCard", "generalDmThreadId", "marketProductId", "entitlementScope",
] as const;

function brandedId<Name extends string>(value: string, label: Name): Brand<string, Name> {
  if (!SAFE_ID.test(value)) throw new Error(`${label} must be a stable identifier.`);
  return value as Brand<string, Name>;
}

export function asDirectWorkRequestId(value: string): DirectWorkRequestId { return brandedId(value, "DirectWorkRequestId"); }
export function asDirectWorkQuoteId(value: string): DirectWorkQuoteId { return brandedId(value, "DirectWorkQuoteId"); }
export function asDirectWorkAgreementId(value: string): DirectWorkAgreementId { return brandedId(value, "DirectWorkAgreementId"); }
export function asDirectWorkMilestoneId(value: string): DirectWorkMilestoneId { return brandedId(value, "DirectWorkMilestoneId"); }
export function asDirectWorkDeliveryId(value: string): DirectWorkDeliveryId { return brandedId(value, "DirectWorkDeliveryId"); }
export function asDirectWorkAcceptanceId(value: string): DirectWorkAcceptanceId { return brandedId(value, "DirectWorkAcceptanceId"); }
export function asDirectWorkRightsDecisionId(value: string): DirectWorkRightsDecisionId { return brandedId(value, "DirectWorkRightsDecisionId"); }
export function asDirectWorkPaymentId(value: string): DirectWorkPaymentId { return brandedId(value, "DirectWorkPaymentId"); }
export function asDirectWorkPaymentEventId(value: string): DirectWorkPaymentEventId { return brandedId(value, "DirectWorkPaymentEventId"); }
export function asDirectWorkLedgerEntryId(value: string): DirectWorkLedgerEntryId { return brandedId(value, "DirectWorkLedgerEntryId"); }

export type WorkDiagnosticCode =
  | "INVALID_ID"
  | "INVALID_HASH"
  | "INVALID_STATE_TRANSITION"
  | "PERMISSION_DENIED"
  | "DM_SEPARATION_VIOLATION"
  | "MARKET_SEPARATION_VIOLATION"
  | "PRIVATE_DATA_REJECTED"
  | "QUOTE_NOT_SERVER_RESOLVED"
  | "MONEY_INVALID"
  | "CURRENCY_UNSUPPORTED"
  | "CURRENCY_MISMATCH"
  | "MONEY_OVERFLOW"
  | "QUOTE_NOT_ACCEPTABLE"
  | "STALE_AGGREGATE"
  | "STALE_PARENT"
  | "STALE_PAYMENT"
  | "AGGREGATE_IDENTITY_MISMATCH"
  | "RECORD_INTEGRITY_VIOLATION"
  | "QUOTE_TERMS_MISMATCH"
  | "AGREEMENT_NOT_ACTIVE"
  | "MILESTONE_NOT_READY"
  | "DELIVERY_NOT_ACCEPTABLE"
  | "RIGHTS_DECISION_REQUIRED"
  | "PAYMENT_EVENT_CONFLICT"
  | "PAYMENT_EVENT_DUPLICATE"
  | "PAYMENT_EVENT_UNKNOWN"
  | "PAYMENT_ACCOUNT_MISMATCH"
  | "PAYMENT_ENVIRONMENT_MISMATCH"
  | "PAYMENT_QUOTE_MISMATCH"
  | "LEDGER_IMMUTABILITY_VIOLATION"
  | "LEDGER_INVALID"
  | "FEATURE_DISABLED"
  | "UNKNOWN_FLAG"
  | "KILL_SWITCH_ACTIVE"
  | "ROLLBACK_PRECONDITION_FAILED";


export type WorkDiagnosticSeverity = "INFO" | "WARNING" | "ERROR";

export interface WorkDiagnostic {
  readonly code: WorkDiagnosticCode;
  readonly severity: WorkDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  readonly recoverable: boolean;
}

export type WorkResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly WorkDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly WorkDiagnostic[] };

function info(code: WorkDiagnosticCode, message: string, metadata?: Readonly<Record<string, string | number | boolean>>): WorkDiagnostic {
  return { code, severity: "INFO", message, ...(metadata === undefined ? {} : { metadata }), recoverable: true };
}

function warning(code: WorkDiagnosticCode, message: string, path?: string): WorkDiagnostic {
  return { code, severity: "WARNING", message, ...(path === undefined ? {} : { path }), recoverable: true };
}

function error(code: WorkDiagnosticCode, message: string, path?: string): WorkDiagnostic {
  return { code, severity: "ERROR", message, ...(path === undefined ? {} : { path }), recoverable: false };
}

function failure<T>(diagnostics: readonly WorkDiagnostic[]): WorkResult<T> { return { ok: false, diagnostics }; }
function success<T>(value: T, diagnostics: readonly WorkDiagnostic[] = []): WorkResult<T> { return { ok: true, value, diagnostics }; }
function validId(value: string): boolean { return SAFE_ID.test(value); }
function validHash(value: string): boolean { return SHA256.test(value); }
function validAmount(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 && value <= SAFE_INTEGER; }
function forbiddenKeys(value: object): readonly string[] { return Object.keys(value).filter((key) => FORBIDDEN_PRIVATE_KEYS.includes(key as typeof FORBIDDEN_PRIVATE_KEYS[number])); }
function hasErrors(diagnostics: readonly WorkDiagnostic[]): boolean { return diagnostics.some((item) => item.severity === "ERROR"); }

type DirectWorkRecordKind = "REQUEST" | "QUOTE" | "AGREEMENT" | "MILESTONE" | "DELIVERY" | "ACCEPTANCE" | "RIGHTS" | "PAYMENT";
const RECORD_SEALS = new WeakMap<object, { readonly kind: DirectWorkRecordKind; readonly snapshot: string }>();
const CURRENT_REQUESTS = new Map<string, { readonly recordVersion: number; readonly status: WorkRequestStatus }>();
const CURRENT_RECORD_HEADS = new Map<string, { readonly kind: DirectWorkRecordKind; readonly recordVersion: number }>();

function recordHeadKey(kind: DirectWorkRecordKind, id: string): string { return `${kind}:${id}`; }

function registerCurrentRecord(kind: DirectWorkRecordKind, id: string, recordVersion: number): void {
  CURRENT_RECORD_HEADS.set(recordHeadKey(kind, id), { kind, recordVersion });
}

function currentRecordMatches(kind: DirectWorkRecordKind, id: string, recordVersion: number): boolean {
  const current = CURRENT_RECORD_HEADS.get(recordHeadKey(kind, id));
  return current?.kind === kind && current.recordVersion === recordVersion;
}

function staleParent(path: string): WorkDiagnostic {
  return error("STALE_PARENT", "The parent record is not the current canonical revision for this operation.", path);
}

function rootAggregateIdentity(requestId: DirectWorkRequestId, tenantId: string): DirectWorkAggregateIdentity {
  return { graphVersion: DIRECT_WORK_GRAPH_VERSION, tenantId, aggregateId: requestId, requestId };
}

function childAggregateIdentity(
  parent: DirectWorkAggregateIdentity,
  child: Partial<Omit<DirectWorkAggregateIdentity, "graphVersion" | "aggregateId" | "requestId">>,
): DirectWorkAggregateIdentity {
  return { ...parent, graphVersion: DIRECT_WORK_GRAPH_VERSION, aggregateId: parent.requestId, requestId: parent.requestId, ...child };
}

function sameAggregateIdentity(left: DirectWorkAggregateIdentity, right: DirectWorkAggregateIdentity): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function sameDirectWorkAggregateIdentity(left: DirectWorkAggregateIdentity, right: DirectWorkAggregateIdentity): boolean {
  return sameAggregateIdentity(left, right);
}

export function validateDirectWorkAggregateIdentity(value: DirectWorkAggregateIdentity, expected: DirectWorkAggregateIdentity): WorkResult<true> {
  if (value.graphVersion !== DIRECT_WORK_GRAPH_VERSION || !sameAggregateIdentity(value, expected)) return failure([aggregateMismatch("aggregateIdentity")]);
  return success(true);
}

function sealRecord<T extends object>(kind: DirectWorkRecordKind, value: T): T {
  const frozen = Object.freeze(value) as T;
  RECORD_SEALS.set(frozen, { kind, snapshot: canonicalJson(frozen) });
  return frozen;
}

function validSealedRecord(value: unknown, kind: DirectWorkRecordKind): boolean {
  if (typeof value !== "object" || value === null) return false;
  const seal = RECORD_SEALS.get(value);
  return seal?.kind === kind && seal.snapshot === canonicalJson(value);
}

/** Process-local integrity evidence only; canonical persistence remains a server adapter concern. */
export function isDirectWorkRecordSealed(value: unknown, kind: DirectWorkRecordKind): boolean {
  return validSealedRecord(value, kind);
}

function requestMatchesQuote(request: DirectWorkRequest, quote: DirectWorkQuote): boolean {
  return validSealedRecord(request, "REQUEST") && validSealedRecord(quote, "QUOTE")
    && sameAggregateIdentity(quote.aggregateIdentity, childAggregateIdentity(request.aggregateIdentity, { quoteId: quote.quoteId }))
    && quote.requestId === request.requestId
    && quote.requesterAccountId === request.requesterAccountId
    && quote.creatorAccountId === request.creatorAccountId
    && quote.scopeHash === request.scopeHash
    && quote.requestRecordVersion === request.recordVersion;
}

function aggregateMismatch(path: string): WorkDiagnostic {
  return error("AGGREGATE_IDENTITY_MISMATCH", "Direct Work records must belong to the same Request-rooted identity graph.", path);
}

function recordIntegrityFailure(kind: DirectWorkRecordKind, path: string): WorkDiagnostic {
  return error("RECORD_INTEGRITY_VIOLATION", `${kind} record was not created by the Direct Work Core or was modified after creation.`, path);
}

export type CurrencyCode = string;
export type RoundingPolicyVersion = "MINOR_UNIT_REJECT_V1" | "MINOR_UNIT_HALF_UP_V1";

export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly roundingPolicyVersion: RoundingPolicyVersion;
}

export interface CurrencyPolicy {
  readonly currency: CurrencyCode;
  readonly minorUnitDigits: number;
  readonly roundingPolicyVersion: RoundingPolicyVersion;
}

export const DEFAULT_CURRENCY_POLICIES: Readonly<Record<string, CurrencyPolicy>> = Object.freeze({
  JPY: { currency: "JPY", minorUnitDigits: 0, roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" },
  USD: { currency: "USD", minorUnitDigits: 2, roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" },
  EUR: { currency: "EUR", minorUnitDigits: 2, roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" },
});

export function validateMoney(value: Money, policies: Readonly<Record<string, CurrencyPolicy>> = DEFAULT_CURRENCY_POLICIES): WorkResult<Money> {
  if (!validAmount(value.amountMinor) || !CURRENCY.test(value.currency)) return failure([error("MONEY_INVALID", "Money requires a safe integer minor-unit amount and ISO currency code.", "money")]);
  const policy = policies[value.currency];
  if (policy === undefined) return failure([error("CURRENCY_UNSUPPORTED", "Currency has no registered minor-unit policy.", "money.currency")]);
  if (policy.roundingPolicyVersion !== value.roundingPolicyVersion) return failure([error("MONEY_INVALID", "Money rounding policy does not match the registered Currency policy.", "money.roundingPolicyVersion")]);
  return success(value);
}

export function sumMoney(lines: readonly Money[], policies: Readonly<Record<string, CurrencyPolicy>> = DEFAULT_CURRENCY_POLICIES): WorkResult<Money> {
  if (lines.length === 0) return failure([error("MONEY_INVALID", "A Quote requires at least one money line.", "lines")]);
  const first = validateMoney(lines[0]!, policies);
  if (!first.ok) return first;
  let amountMinor = 0;
  for (const line of lines) {
    const valid = validateMoney(line, policies);
    if (!valid.ok) return valid;
    if (line.currency !== first.value.currency) return failure([error("CURRENCY_MISMATCH", "Quote lines must use one currency.", "lines.currency")]);
    if (amountMinor > SAFE_INTEGER - line.amountMinor) return failure([error("MONEY_OVERFLOW", "Quote total exceeds the safe integer range.", "lines.amountMinor")]);
    amountMinor += line.amountMinor;
  }
  return success({ amountMinor, currency: first.value.currency, roundingPolicyVersion: first.value.roundingPolicyVersion });
}

export type WorkRequestStatus = "DRAFT" | "SUBMITTED" | "QUOTED" | "AGREEMENT_PENDING" | "ACTIVE" | "DELIVERING" | "ACCEPTANCE_PENDING" | "COMPLETED" | "CANCELLED" | "DISPUTED" | "REJECTED";
export type WorkRequestEvent = "SUBMIT" | "QUOTE_ISSUED" | "AGREEMENT_PENDING" | "AGREEMENT_ACTIVE" | "DELIVERY_STARTED" | "ACCEPTANCE_PENDING" | "COMPLETE" | "CANCEL" | "DISPUTE" | "REJECT" | "RESOLVE";

export interface DirectWorkRequest {
  readonly requestId: DirectWorkRequestId;
  readonly aggregateIdentity: DirectWorkAggregateIdentity;
  readonly requesterAccountId: string;
  readonly creatorAccountId: string;
  readonly scopeHash: ContentHash;
  readonly createdAt: string;
  readonly recordVersion: number;
  readonly channel: "DIRECT_WORK";
  readonly generalDmAuthority: false;
  readonly marketProductAuthority: false;
  readonly status: WorkRequestStatus;
}

export interface DirectWorkRequestInput extends Omit<DirectWorkRequest, "aggregateIdentity" | "status" | "channel" | "generalDmAuthority" | "marketProductAuthority"> {
  readonly status?: never;
  readonly rawContentBytes?: number;
  readonly clientSelectedOwner?: string;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
}

export function createDirectWorkRequest(input: DirectWorkRequestInput): WorkResult<DirectWorkRequest> {
  const diagnostics: WorkDiagnostic[] = [];
  let resolvedProof: AuthorizationProofV1 | null = null;
  try {
    resolvedProof = resolveAuthorizationProofV1(input.authorizationProof, { principalId: input.requesterAccountId, resourceType: "DIRECT_WORK_REQUEST", resourceId: input.requestId, action: "direct-work.request.create", capability: "direct-work.request.create", tenantId: input.authorizationProof?.tenantId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    diagnostics.push(error("PERMISSION_DENIED", "Direct Work Request requires a server AuthorizationProofV1 bound to the Request.", "authorizationProof"));
  }
  if (forbiddenKeys(input).length > 0 || input.rawContentBytes !== undefined && input.rawContentBytes > 0) diagnostics.push(error("PRIVATE_DATA_REJECTED", "Direct Work Core accepts scope references, not private body or raw content.", "input"));
  if (input.clientSelectedOwner !== undefined) diagnostics.push(error("PERMISSION_DENIED", "Requester cannot select or override the canonical creator authority.", "clientSelectedOwner"));
  if (!validId(input.requestId) || !validId(input.requesterAccountId) || !validId(input.creatorAccountId)) diagnostics.push(error("INVALID_ID", "Request and account references must be stable identifiers.", "input"));
  if (!validHash(input.scopeHash)) diagnostics.push(error("INVALID_HASH", "Scope is represented by a verified hash reference.", "scopeHash"));
  if (!Number.isSafeInteger(input.recordVersion) || input.recordVersion < 1) diagnostics.push(error("INVALID_STATE_TRANSITION", "Request record version must be positive.", "recordVersion"));
  if (hasErrors(diagnostics)) return failure(diagnostics);
  const tenantId = resolvedProof?.tenantId ?? LEGACY_COMPATIBILITY_TENANT_ID;
  const request = sealRecord("REQUEST", { requestId: input.requestId, aggregateIdentity: rootAggregateIdentity(input.requestId, tenantId), requesterAccountId: input.requesterAccountId, creatorAccountId: input.creatorAccountId, scopeHash: input.scopeHash, createdAt: input.createdAt, recordVersion: input.recordVersion, channel: "DIRECT_WORK", generalDmAuthority: false, marketProductAuthority: false, status: "DRAFT" } as const);
  CURRENT_REQUESTS.set(request.requestId, { recordVersion: request.recordVersion, status: request.status });
  registerCurrentRecord("REQUEST", request.requestId, request.recordVersion);
  return success(request);
}

const REQUEST_TRANSITIONS: Readonly<Record<WorkRequestStatus, readonly WorkRequestEvent[]>> = {
  DRAFT: ["SUBMIT", "CANCEL", "REJECT"],
  SUBMITTED: ["QUOTE_ISSUED", "CANCEL", "REJECT", "DISPUTE"],
  QUOTED: ["AGREEMENT_PENDING", "CANCEL", "REJECT", "DISPUTE"],
  AGREEMENT_PENDING: ["AGREEMENT_ACTIVE", "CANCEL", "DISPUTE"],
  ACTIVE: ["DELIVERY_STARTED", "CANCEL", "DISPUTE"],
  DELIVERING: ["ACCEPTANCE_PENDING", "CANCEL", "DISPUTE"],
  ACCEPTANCE_PENDING: ["COMPLETE", "CANCEL", "DISPUTE"],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ["RESOLVE", "CANCEL"],
  REJECTED: [],
};

function nextRequestStatus(current: WorkRequestStatus, event: WorkRequestEvent): WorkRequestStatus {
  if (event === "SUBMIT") return "SUBMITTED";
  if (event === "QUOTE_ISSUED") return "QUOTED";
  if (event === "AGREEMENT_PENDING") return "AGREEMENT_PENDING";
  if (event === "AGREEMENT_ACTIVE") return "ACTIVE";
  if (event === "DELIVERY_STARTED") return "DELIVERING";
  if (event === "ACCEPTANCE_PENDING") return "ACCEPTANCE_PENDING";
  if (event === "COMPLETE") return "COMPLETED";
  if (event === "CANCEL") return "CANCELLED";
  if (event === "DISPUTE") return "DISPUTED";
  return "REJECTED";
}

export function transitionDirectWorkRequest(request: DirectWorkRequest, event: WorkRequestEvent): WorkResult<DirectWorkRequest> {
  if (!validSealedRecord(request, "REQUEST")) return failure([recordIntegrityFailure("REQUEST", "request")]);
  const current = CURRENT_REQUESTS.get(request.requestId);
  if (current === undefined || current.recordVersion !== request.recordVersion || current.status !== request.status) return failure([error("STALE_AGGREGATE", "Request revision is not the current canonical aggregate revision.", "request.recordVersion")]);
  if (!REQUEST_TRANSITIONS[request.status].includes(event)) return failure([error("INVALID_STATE_TRANSITION", "Request event is not valid for the current Direct Work status.", "event")]);
  const next = sealRecord("REQUEST", { ...request, recordVersion: request.recordVersion + 1, status: nextRequestStatus(request.status, event) });
  CURRENT_REQUESTS.set(next.requestId, { recordVersion: next.recordVersion, status: next.status });
  registerCurrentRecord("REQUEST", next.requestId, next.recordVersion);
  return success(next);
}

export interface QuoteLine {
  readonly lineId: string;
  readonly deliverableHash: ContentHash;
  readonly amount: Money;
}

export type QuoteStatus = "ISSUED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "WITHDRAWN";

export interface DirectWorkQuote {
  readonly quoteId: DirectWorkQuoteId;
  readonly aggregateIdentity: DirectWorkAggregateIdentity;
  readonly requestId: DirectWorkRequestId;
  readonly requesterAccountId: string;
  readonly creatorAccountId: string;
  readonly scopeHash: ContentHash;
  readonly requestRecordVersion: number;
  readonly quoteRecordVersion: number;
  readonly lines: readonly QuoteLine[];
  readonly total: Money;
  readonly termsHash: ContentHash;
  readonly royaltyRuleVersion: string;
  readonly status: QuoteStatus;
  readonly authorizationProof: AuthorizationProofV1;
  readonly acceptedTermsHash?: ContentHash;
  readonly acceptedByAccountId?: string;
}

export interface CreateQuoteInput {
  readonly quoteId: DirectWorkQuoteId;
  readonly request: DirectWorkRequest;
  readonly creatorAccountId: string;
  readonly lines: readonly QuoteLine[];
  readonly termsHash: ContentHash;
  readonly royaltyRuleVersion: string;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
  readonly clientAmountMinor?: number;
  readonly clientRoyaltyRate?: number;
  readonly clientPayoutAmountMinor?: number;
  readonly clientLicenseTerms?: string;
}

export function createDirectWorkQuote(input: CreateQuoteInput): WorkResult<DirectWorkQuote> {
  const diagnostics: WorkDiagnostic[] = [];
  let resolvedProof: AuthorizationProofV1 | null = null;
  if (!validSealedRecord(input.request, "REQUEST")) diagnostics.push(recordIntegrityFailure("REQUEST", "request"));
  const current = CURRENT_REQUESTS.get(input.request.requestId);
  if (current === undefined || current.recordVersion !== input.request.recordVersion || current.status !== input.request.status) diagnostics.push(error("STALE_AGGREGATE", "Quote creation requires the current canonical Request revision.", "request.recordVersion"));
  const expectedTenantId = input.request.aggregateIdentity.tenantId === LEGACY_COMPATIBILITY_TENANT_ID ? null : input.request.aggregateIdentity.tenantId;
  try {
    resolvedProof = resolveAuthorizationProofV1(input.authorizationProof, { principalId: input.creatorAccountId, resourceType: "DIRECT_WORK_REQUEST", resourceId: input.request.requestId, action: "direct-work.quote.create", capability: "direct-work.quote.create", tenantId: expectedTenantId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    diagnostics.push(error("PERMISSION_DENIED", "Direct Work Quote requires a server AuthorizationProofV1 bound to the Request and creator.", "authorizationProof"));
  }
  if (resolvedProof !== null && resolvedProof.tenantId !== expectedTenantId) diagnostics.push(error("PERMISSION_DENIED", "Quote authority must remain in the Request Tenant namespace.", "authorizationProof.tenantId"));
  if (input.request.status !== "SUBMITTED") diagnostics.push(error("QUOTE_NOT_ACCEPTABLE", "A Quote can only be issued from a submitted Request.", "request.status"));
  if (input.creatorAccountId !== input.request.creatorAccountId) diagnostics.push(error("PERMISSION_DENIED", "Only the canonical creator may issue the Quote.", "creatorAccountId"));
  if (forbiddenKeys(input).length > 0 || input.clientAmountMinor !== undefined || input.clientRoyaltyRate !== undefined || input.clientPayoutAmountMinor !== undefined || input.clientLicenseTerms !== undefined) diagnostics.push(error("QUOTE_NOT_SERVER_RESOLVED", "Client price, royalty, payout, or license terms are not authoritative.", "input"));
  if (!validId(input.quoteId) || !validId(input.creatorAccountId)) diagnostics.push(error("INVALID_ID", "Quote and creator references must be stable identifiers.", "input"));
  if (!validHash(input.termsHash)) diagnostics.push(error("INVALID_HASH", "Quote terms require a verified hash.", "termsHash"));
  for (const line of input.lines) if (!validId(line.lineId) || !validHash(line.deliverableHash)) diagnostics.push(error("INVALID_HASH", "Quote lines require stable IDs and deliverable references.", "lines"));
  const total = sumMoney(input.lines.map((line) => line.amount));
  if (!total.ok) diagnostics.push(...total.diagnostics);
  if (hasErrors(diagnostics) || !total.ok) return failure(diagnostics);
  const lines = Object.freeze(input.lines.map((line) => Object.freeze({ ...line, amount: Object.freeze({ ...line.amount }) })));
  const quote = sealRecord("QUOTE", { quoteId: input.quoteId, aggregateIdentity: childAggregateIdentity(input.request.aggregateIdentity, { quoteId: input.quoteId }), requestId: input.request.requestId, requesterAccountId: input.request.requesterAccountId, creatorAccountId: input.creatorAccountId, scopeHash: input.request.scopeHash, requestRecordVersion: input.request.recordVersion, quoteRecordVersion: 1, lines, total: Object.freeze({ ...total.value }), termsHash: input.termsHash, royaltyRuleVersion: input.royaltyRuleVersion, status: "ISSUED", authorizationProof: resolvedProof as AuthorizationProofV1 } as const);
  registerCurrentRecord("QUOTE", quote.quoteId, quote.quoteRecordVersion);
  return success(quote);
}

export function acceptDirectWorkQuote(quote: DirectWorkQuote, requesterAccountId: string): WorkResult<DirectWorkQuote> {
  if (!validSealedRecord(quote, "QUOTE")) return failure([recordIntegrityFailure("QUOTE", "quote")]);
  if (quote.status !== "ISSUED") return failure([error("QUOTE_NOT_ACCEPTABLE", "Only an issued Quote can be accepted.", "quote.status")]);
  if (!validId(requesterAccountId)) return failure([error("INVALID_ID", "Requester reference is not stable.", "requesterAccountId")]);
  if (requesterAccountId !== quote.requesterAccountId) return failure([error("PERMISSION_DENIED", "Only the Request-rooted requester can accept the Quote.", "requesterAccountId")]);
  if (!currentRecordMatches("QUOTE", quote.quoteId, quote.quoteRecordVersion)) return failure([staleParent("quote.quoteRecordVersion")]);
  const accepted = sealRecord("QUOTE", { ...quote, quoteRecordVersion: quote.quoteRecordVersion + 1, status: "ACCEPTED", acceptedTermsHash: quote.termsHash, acceptedByAccountId: requesterAccountId } as const);
  registerCurrentRecord("QUOTE", accepted.quoteId, accepted.quoteRecordVersion);
  return success(accepted);
}

export type AgreementStatus = "PENDING_SIGNATURE" | "ACTIVE" | "AMENDED" | "TERMINATED" | "CANCELLED";

export interface DirectWorkAgreement {
  readonly agreementId: DirectWorkAgreementId;
  readonly aggregateIdentity: DirectWorkAggregateIdentity;
  readonly requestId: DirectWorkRequestId;
  readonly quoteId: DirectWorkQuoteId;
  readonly agreementRecordVersion: number;
  readonly requesterAccountId: string;
  readonly creatorAccountId: string;
  readonly scopeHash: ContentHash;
  readonly requestRecordVersion: number;
  readonly quoteTermsHash: ContentHash;
  readonly quoteTotal: Money;
  readonly quoteRoyaltyRuleVersion: string;
  readonly termsHash: ContentHash;
  readonly requesterSigned: boolean;
  readonly creatorSigned: boolean;
  readonly status: AgreementStatus;
}

export function createDirectWorkAgreement(input: { readonly agreementId: DirectWorkAgreementId; readonly request: DirectWorkRequest; readonly quote: DirectWorkQuote; readonly termsHash: ContentHash }): WorkResult<DirectWorkAgreement> {
  if (!validSealedRecord(input.request, "REQUEST")) return failure([recordIntegrityFailure("REQUEST", "request")]);
  if (!validSealedRecord(input.quote, "QUOTE")) return failure([recordIntegrityFailure("QUOTE", "quote")]);
  const currentRequest = CURRENT_REQUESTS.get(input.request.requestId);
  if (currentRequest === undefined || currentRequest.recordVersion !== input.request.recordVersion || currentRequest.status !== input.request.status) return failure([error("STALE_AGGREGATE", "Agreement creation requires the current canonical Request revision.", "request.recordVersion")]);
  if (!currentRecordMatches("QUOTE", input.quote.quoteId, input.quote.quoteRecordVersion)) return failure([staleParent("quote.quoteRecordVersion")]);
  if (!validId(input.agreementId)) return failure([error("INVALID_ID", "Agreement reference must be a stable identifier.", "agreementId")]);
  if (input.quote.status !== "ACCEPTED" || !requestMatchesQuote(input.request, input.quote)) return failure([input.quote.status !== "ACCEPTED" ? error("QUOTE_NOT_ACCEPTABLE", "Agreement requires an accepted Quote for the same Request.", "quote") : aggregateMismatch("quote")]);
  if (!validHash(input.termsHash)) return failure([error("INVALID_HASH", "Agreement terms require a verified hash.", "termsHash")]);
  if (input.termsHash !== input.quote.termsHash || input.quote.acceptedTermsHash !== input.quote.termsHash) return failure([error("QUOTE_TERMS_MISMATCH", "Agreement terms must equal the accepted Quote terms snapshot.", "termsHash")]);
  const agreement = sealRecord("AGREEMENT", { agreementId: input.agreementId, aggregateIdentity: childAggregateIdentity(input.quote.aggregateIdentity, { agreementId: input.agreementId }), requestId: input.request.requestId, quoteId: input.quote.quoteId, requesterAccountId: input.request.requesterAccountId, creatorAccountId: input.request.creatorAccountId, scopeHash: input.request.scopeHash, requestRecordVersion: input.request.recordVersion, quoteRecordVersion: input.quote.quoteRecordVersion, agreementRecordVersion: 1, quoteTermsHash: input.quote.termsHash, quoteTotal: Object.freeze({ ...input.quote.total }), quoteRoyaltyRuleVersion: input.quote.royaltyRuleVersion, termsHash: input.termsHash, requesterSigned: false, creatorSigned: false, status: "PENDING_SIGNATURE" } as const);
  registerCurrentRecord("AGREEMENT", agreement.agreementId, agreement.agreementRecordVersion);
  return success(agreement);
}

export function signDirectWorkAgreement(agreement: DirectWorkAgreement, actorAccountId: string, role: "REQUESTER" | "CREATOR"): WorkResult<DirectWorkAgreement> {
  if (!validSealedRecord(agreement, "AGREEMENT")) return failure([recordIntegrityFailure("AGREEMENT", "agreement")]);
  if (!currentRecordMatches("AGREEMENT", agreement.agreementId, agreement.agreementRecordVersion)) return failure([staleParent("agreement.agreementRecordVersion")]);
  if (agreement.status !== "PENDING_SIGNATURE" && agreement.status !== "AMENDED") return failure([error("AGREEMENT_NOT_ACTIVE", "Agreement is not accepting signatures.", "agreement.status")]);
  if (role === "REQUESTER" && actorAccountId !== agreement.requesterAccountId) return failure([error("PERMISSION_DENIED", "Only the scoped requester can sign as requester.", "actorAccountId")]);
  if (role === "CREATOR" && actorAccountId !== agreement.creatorAccountId) return failure([error("PERMISSION_DENIED", "Only the scoped creator can sign as creator.", "actorAccountId")]);
  const requesterSigned = agreement.requesterSigned || role === "REQUESTER";
  const creatorSigned = agreement.creatorSigned || role === "CREATOR";
  const signed = sealRecord("AGREEMENT", { ...agreement, agreementRecordVersion: agreement.agreementRecordVersion + 1, requesterSigned, creatorSigned, status: requesterSigned && creatorSigned ? "ACTIVE" : agreement.status } as const);
  registerCurrentRecord("AGREEMENT", signed.agreementId, signed.agreementRecordVersion);
  return success(signed);
}

export type MilestoneStatus = "PLANNED" | "IN_PROGRESS" | "DELIVERY_PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "DISPUTED";

export interface DirectWorkMilestone {
  readonly milestoneId: DirectWorkMilestoneId;
  readonly aggregateIdentity: DirectWorkAggregateIdentity;
  readonly requestId: DirectWorkRequestId;
  readonly agreementId: DirectWorkAgreementId;
  readonly requestRecordVersion: number;
  readonly agreementRecordVersion: number;
  readonly milestoneRecordVersion: number;
  readonly sequence: number;
  readonly deliverableHash: ContentHash;
  readonly amount: Money;
  readonly status: MilestoneStatus;
}

export function createDirectWorkMilestone(input: { readonly milestoneId: DirectWorkMilestoneId; readonly agreement: DirectWorkAgreement; readonly sequence: number; readonly deliverableHash: ContentHash; readonly amount: Money }): WorkResult<DirectWorkMilestone> {
  if (!validSealedRecord(input.agreement, "AGREEMENT")) return failure([recordIntegrityFailure("AGREEMENT", "agreement")]);
  const currentRequest = CURRENT_REQUESTS.get(input.agreement.requestId);
  if (currentRequest === undefined || currentRequest.recordVersion !== input.agreement.requestRecordVersion) return failure([error("STALE_AGGREGATE", "Milestone creation requires the current canonical Request revision.", "agreement.requestRecordVersion")]);
  if (!currentRecordMatches("AGREEMENT", input.agreement.agreementId, input.agreement.agreementRecordVersion)) return failure([staleParent("agreement.agreementRecordVersion")]);
  const money = validateMoney(input.amount);
  if (input.agreement.status !== "ACTIVE") return failure([error("AGREEMENT_NOT_ACTIVE", "Milestones require an active Agreement.", "agreement.status")]);
  if (!money.ok) return money;
  if (!validId(input.milestoneId)) return failure([error("INVALID_ID", "Milestone reference must be a stable identifier.", "milestoneId")]);
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1 || !validHash(input.deliverableHash)) return failure([error("INVALID_HASH", "Milestone sequence and deliverable reference are invalid.", "milestone")]);
  const milestone = sealRecord("MILESTONE", { milestoneId: input.milestoneId, aggregateIdentity: childAggregateIdentity(input.agreement.aggregateIdentity, { milestoneId: input.milestoneId }), requestId: input.agreement.requestId, agreementId: input.agreement.agreementId, requestRecordVersion: input.agreement.requestRecordVersion, agreementRecordVersion: input.agreement.agreementRecordVersion, milestoneRecordVersion: 1, sequence: input.sequence, deliverableHash: input.deliverableHash, amount: Object.freeze({ ...input.amount }), status: "PLANNED" } as const);
  registerCurrentRecord("MILESTONE", milestone.milestoneId, milestone.milestoneRecordVersion);
  return success(milestone);
}

export type MilestoneEvent = "START" | "DELIVERY_SUBMITTED" | "ACCEPT" | "REJECT" | "CANCEL" | "DISPUTE";

export function transitionDirectWorkMilestone(milestone: DirectWorkMilestone, event: MilestoneEvent): WorkResult<DirectWorkMilestone> {
  if (!validSealedRecord(milestone, "MILESTONE")) return failure([recordIntegrityFailure("MILESTONE", "milestone")]);
  if (!currentRecordMatches("MILESTONE", milestone.milestoneId, milestone.milestoneRecordVersion)) return failure([staleParent("milestone.milestoneRecordVersion")]);
  const allowed: Readonly<Record<MilestoneStatus, readonly MilestoneEvent[]>> = { PLANNED: ["START", "CANCEL"], IN_PROGRESS: ["DELIVERY_SUBMITTED", "CANCEL", "DISPUTE"], DELIVERY_PENDING: ["ACCEPT", "REJECT", "DISPUTE"], ACCEPTED: [], REJECTED: ["START", "CANCEL"], CANCELLED: [], DISPUTED: ["START", "CANCEL" ] };
  if (!allowed[milestone.status].includes(event)) return failure([error("INVALID_STATE_TRANSITION", "Milestone event is not valid for the current status.", "milestone.event")]);
  const status: MilestoneStatus = event === "START" ? "IN_PROGRESS" : event === "DELIVERY_SUBMITTED" ? "DELIVERY_PENDING" : event === "ACCEPT" ? "ACCEPTED" : event === "REJECT" ? "REJECTED" : event === "CANCEL" ? "CANCELLED" : event === "DISPUTE" ? "DISPUTED" : milestone.status;
  const next = sealRecord("MILESTONE", { ...milestone, milestoneRecordVersion: milestone.milestoneRecordVersion + 1, status } as const);
  registerCurrentRecord("MILESTONE", next.milestoneId, next.milestoneRecordVersion);
  return success(next);
}

export type DeliveryStatus = "SUBMITTED" | "ACCEPTED" | "REJECTED" | "RECOVERY_REPLACED";

export interface DirectWorkDelivery {
  readonly deliveryId: DirectWorkDeliveryId;
  readonly aggregateIdentity: DirectWorkAggregateIdentity;
  readonly requestId: DirectWorkRequestId;
  readonly milestoneId: DirectWorkMilestoneId;
  readonly requestRecordVersion: number;
  readonly milestoneRecordVersion: number;
  readonly deliveryRecordVersion: number;
  readonly revisionHash: ContentHash;
  readonly packageReference?: string;
  readonly attempt: number;
  readonly previousDeliveryId?: DirectWorkDeliveryId;
  readonly status: DeliveryStatus;
}

export function submitDirectWorkDelivery(input: { readonly deliveryId: DirectWorkDeliveryId; readonly milestone: DirectWorkMilestone; readonly revisionHash: ContentHash; readonly packageReference?: string; readonly attempt?: number; readonly previousDeliveryId?: DirectWorkDeliveryId }): WorkResult<DirectWorkDelivery> {
  if (!validSealedRecord(input.milestone, "MILESTONE")) return failure([recordIntegrityFailure("MILESTONE", "milestone")]);
  const currentRequest = CURRENT_REQUESTS.get(input.milestone.requestId);
  if (currentRequest === undefined || currentRequest.recordVersion !== input.milestone.requestRecordVersion) return failure([error("STALE_AGGREGATE", "Delivery creation requires the current canonical Request revision.", "milestone.requestRecordVersion")]);
  if (!currentRecordMatches("MILESTONE", input.milestone.milestoneId, input.milestone.milestoneRecordVersion)) return failure([staleParent("milestone.milestoneRecordVersion")]);
  if (input.milestone.status !== "IN_PROGRESS" && input.milestone.status !== "REJECTED") return failure([error("DELIVERY_NOT_ACCEPTABLE", "Delivery requires an in-progress or recovery Milestone.", "milestone.status")]);
  if (!validId(input.deliveryId)) return failure([error("INVALID_ID", "Delivery reference must be a stable identifier.", "deliveryId")]);
  if (!validHash(input.revisionHash)) return failure([error("INVALID_HASH", "Delivery must reference a verified Revision or Package hash.", "revisionHash")]);
  const attempt = input.attempt ?? 1;
  if (!Number.isSafeInteger(attempt) || attempt < 1) return failure([error("DELIVERY_NOT_ACCEPTABLE", "Delivery attempt must be positive.", "attempt")]);
  if (input.previousDeliveryId === undefined && attempt > 1) return failure([error("DELIVERY_NOT_ACCEPTABLE", "Recovery Delivery must reference the previous Delivery.", "previousDeliveryId")]);
  const delivery = sealRecord("DELIVERY", { deliveryId: input.deliveryId, aggregateIdentity: childAggregateIdentity(input.milestone.aggregateIdentity, { deliveryId: input.deliveryId }), requestId: input.milestone.requestId, milestoneId: input.milestone.milestoneId, requestRecordVersion: input.milestone.requestRecordVersion, milestoneRecordVersion: input.milestone.milestoneRecordVersion, deliveryRecordVersion: 1, revisionHash: input.revisionHash, ...(input.packageReference === undefined ? {} : { packageReference: input.packageReference }), attempt, ...(input.previousDeliveryId === undefined ? {} : { previousDeliveryId: input.previousDeliveryId }), status: "SUBMITTED" } as const);
  registerCurrentRecord("DELIVERY", delivery.deliveryId, delivery.deliveryRecordVersion);
  return success(delivery);
}

export interface DirectWorkAcceptance {
  readonly acceptanceId: DirectWorkAcceptanceId;
  readonly aggregateIdentity: DirectWorkAggregateIdentity;
  readonly requestId: DirectWorkRequestId;
  readonly milestoneId: DirectWorkMilestoneId;
  readonly deliveryId: DirectWorkDeliveryId;
  readonly scopeHash: ContentHash;
  readonly requestRecordVersion: number;
  readonly milestoneRecordVersion: number;
  readonly deliveryRecordVersion: number;
  readonly acceptanceRecordVersion: number;
  readonly acceptedByAccountId: string;
  readonly decision: "ACCEPTED" | "REJECTED";
  readonly reasonHash?: ContentHash;
}

export function recordDirectWorkAcceptance(input: { readonly acceptanceId: DirectWorkAcceptanceId; readonly request: DirectWorkRequest; readonly milestone: DirectWorkMilestone; readonly delivery: DirectWorkDelivery; readonly actorAccountId: string; readonly decision: "ACCEPTED" | "REJECTED"; readonly reasonHash?: ContentHash }): WorkResult<{ readonly delivery: DirectWorkDelivery; readonly milestone: DirectWorkMilestone; readonly acceptance: DirectWorkAcceptance }> {
  if (!validSealedRecord(input.request, "REQUEST")) return failure([recordIntegrityFailure("REQUEST", "request")]);
  if (!validSealedRecord(input.milestone, "MILESTONE")) return failure([recordIntegrityFailure("MILESTONE", "milestone")]);
  if (!validSealedRecord(input.delivery, "DELIVERY")) return failure([recordIntegrityFailure("DELIVERY", "delivery")]);
  const currentRequest = CURRENT_REQUESTS.get(input.request.requestId);
  if (currentRequest === undefined || currentRequest.recordVersion !== input.request.recordVersion || currentRequest.status !== input.request.status) return failure([error("STALE_AGGREGATE", "Acceptance requires the current canonical Request revision.", "request.recordVersion")]);
  if (!currentRecordMatches("MILESTONE", input.milestone.milestoneId, input.milestone.milestoneRecordVersion)) return failure([staleParent("milestone.milestoneRecordVersion")]);
  if (!currentRecordMatches("DELIVERY", input.delivery.deliveryId, input.delivery.deliveryRecordVersion)) return failure([staleParent("delivery.deliveryRecordVersion")]);
  if (input.delivery.status !== "SUBMITTED") return failure([error("DELIVERY_NOT_ACCEPTABLE", "Only a submitted Delivery may receive an Acceptance decision.", "delivery.status")]);
  if (!validId(input.acceptanceId)) return failure([error("INVALID_ID", "Acceptance reference must be a stable identifier.", "acceptanceId")]);
  const expectedMilestoneIdentity: DirectWorkAggregateIdentity = { graphVersion: DIRECT_WORK_GRAPH_VERSION, tenantId: input.request.aggregateIdentity.tenantId, aggregateId: input.request.requestId, requestId: input.request.requestId, ...(input.milestone.aggregateIdentity.quoteId === undefined ? {} : { quoteId: input.milestone.aggregateIdentity.quoteId }), agreementId: input.milestone.agreementId, milestoneId: input.milestone.milestoneId };
  const expectedDeliveryIdentity: DirectWorkAggregateIdentity = { ...expectedMilestoneIdentity, deliveryId: input.delivery.deliveryId };
  if (!sameAggregateIdentity(input.milestone.aggregateIdentity, expectedMilestoneIdentity) || input.milestone.requestId !== input.request.requestId || !sameAggregateIdentity(input.delivery.aggregateIdentity, expectedDeliveryIdentity) || input.delivery.requestId !== input.request.requestId || input.delivery.milestoneId !== input.milestone.milestoneId) return failure([aggregateMismatch("milestone/delivery")]);
  if (input.actorAccountId !== input.request.requesterAccountId) return failure([error("PERMISSION_DENIED", "Only the scoped requester can accept or reject the Delivery.", "actorAccountId")]);
  if (input.decision === "REJECTED" && !validHash(input.reasonHash ?? "")) return failure([error("DELIVERY_NOT_ACCEPTABLE", "A rejected Delivery requires a reason hash.", "reasonHash")]);
  const nextDeliveryStatus: DeliveryStatus = input.decision === "ACCEPTED" ? "ACCEPTED" : "REJECTED";
  const nextMilestoneStatus: MilestoneStatus = input.decision === "ACCEPTED" ? "ACCEPTED" : "REJECTED";
  const nextMilestoneRecordVersion = input.milestone.milestoneRecordVersion + 1;
  const delivery = sealRecord("DELIVERY", { ...input.delivery, milestoneRecordVersion: nextMilestoneRecordVersion, deliveryRecordVersion: input.delivery.deliveryRecordVersion + 1, status: nextDeliveryStatus } as const);
  const milestone = sealRecord("MILESTONE", { ...input.milestone, milestoneRecordVersion: nextMilestoneRecordVersion, status: nextMilestoneStatus } as const);
  const acceptance = sealRecord("ACCEPTANCE", { acceptanceId: input.acceptanceId, aggregateIdentity: childAggregateIdentity(input.delivery.aggregateIdentity, { acceptanceId: input.acceptanceId }), requestId: input.request.requestId, milestoneId: input.milestone.milestoneId, deliveryId: input.delivery.deliveryId, scopeHash: input.request.scopeHash, requestRecordVersion: input.request.recordVersion, milestoneRecordVersion: nextMilestoneRecordVersion, deliveryRecordVersion: delivery.deliveryRecordVersion, acceptanceRecordVersion: 1, acceptedByAccountId: input.actorAccountId, decision: input.decision, ...(input.reasonHash === undefined ? {} : { reasonHash: input.reasonHash }) } as const);
  registerCurrentRecord("DELIVERY", delivery.deliveryId, delivery.deliveryRecordVersion);
  registerCurrentRecord("MILESTONE", milestone.milestoneId, milestone.milestoneRecordVersion);
  registerCurrentRecord("ACCEPTANCE", acceptance.acceptanceId, acceptance.acceptanceRecordVersion);
  return success({ delivery, milestone, acceptance });
}

export type RightsDecisionStatus = "PENDING" | "GRANTED" | "REJECTED";
export type DirectWorkLicenseRight = "PERSONAL_USE" | "COMMERCIAL_USE" | "DERIVATIVE" | "EMBEDDING" | "RESALE";

export interface DirectWorkRightsDecision {
  readonly rightsDecisionId: DirectWorkRightsDecisionId;
  readonly aggregateIdentity: DirectWorkAggregateIdentity;
  readonly requestId: DirectWorkRequestId;
  readonly acceptanceId: DirectWorkAcceptanceId;
  readonly milestoneId: DirectWorkMilestoneId;
  readonly deliveryId: DirectWorkDeliveryId;
  readonly scopeHash: ContentHash;
  readonly requestRecordVersion: number;
  readonly acceptanceRecordVersion: number;
  readonly rightsRecordVersion: number;
  readonly licenseSnapshotHash: ContentHash;
  readonly rights: readonly DirectWorkLicenseRight[];
  readonly decidedByAccountId: string;
  readonly status: RightsDecisionStatus;
  readonly createsMarketEntitlement: false;
}

export function decideDirectWorkRights(input: { readonly rightsDecisionId: DirectWorkRightsDecisionId; readonly request: DirectWorkRequest; readonly acceptance: DirectWorkAcceptance; readonly licenseSnapshotHash: ContentHash; readonly rights: readonly DirectWorkLicenseRight[]; readonly decidedByAccountId: string; readonly status: "GRANTED" | "REJECTED" }): WorkResult<DirectWorkRightsDecision> {
  if (!validSealedRecord(input.request, "REQUEST")) return failure([recordIntegrityFailure("REQUEST", "request")]);
  if (!validSealedRecord(input.acceptance, "ACCEPTANCE")) return failure([recordIntegrityFailure("ACCEPTANCE", "acceptance")]);
  const currentRequest = CURRENT_REQUESTS.get(input.request.requestId);
  if (currentRequest === undefined || currentRequest.recordVersion !== input.request.recordVersion || currentRequest.status !== input.request.status) return failure([error("STALE_AGGREGATE", "Rights require the current canonical Request revision.", "request.recordVersion")]);
  if (!currentRecordMatches("ACCEPTANCE", input.acceptance.acceptanceId, input.acceptance.acceptanceRecordVersion)) return failure([staleParent("acceptance.acceptanceRecordVersion")]);
  if (input.acceptance.decision !== "ACCEPTED") return failure([error("RIGHTS_DECISION_REQUIRED", "Rights can only be decided after explicit Acceptance.", "acceptance.decision")]);
  const expectedAcceptanceIdentity: DirectWorkAggregateIdentity = { graphVersion: DIRECT_WORK_GRAPH_VERSION, tenantId: input.request.aggregateIdentity.tenantId, aggregateId: input.request.requestId, requestId: input.request.requestId, ...(input.acceptance.aggregateIdentity.quoteId === undefined ? {} : { quoteId: input.acceptance.aggregateIdentity.quoteId }), ...(input.acceptance.aggregateIdentity.agreementId === undefined ? {} : { agreementId: input.acceptance.aggregateIdentity.agreementId }), milestoneId: input.acceptance.milestoneId, deliveryId: input.acceptance.deliveryId, acceptanceId: input.acceptance.acceptanceId };
  if (!sameAggregateIdentity(input.acceptance.aggregateIdentity, expectedAcceptanceIdentity) || input.acceptance.requestId !== input.request.requestId || input.acceptance.scopeHash !== input.request.scopeHash || input.acceptance.requestRecordVersion !== input.request.recordVersion) return failure([aggregateMismatch("acceptance")]);
  if (input.decidedByAccountId !== input.request.requesterAccountId && input.decidedByAccountId !== input.request.creatorAccountId) return failure([error("PERMISSION_DENIED", "Rights decision requires a scoped Direct Work party.", "decidedByAccountId")]);
  if (!validId(input.rightsDecisionId)) return failure([error("INVALID_ID", "Rights decision reference must be a stable identifier.", "rightsDecisionId")]);
  if (!validHash(input.licenseSnapshotHash) || input.rights.length === 0) return failure([error("RIGHTS_DECISION_REQUIRED", "Rights decision requires a License Snapshot hash and at least one right.", "rights")]);
  const rights = sealRecord("RIGHTS", { rightsDecisionId: input.rightsDecisionId, aggregateIdentity: childAggregateIdentity(input.acceptance.aggregateIdentity, { rightsDecisionId: input.rightsDecisionId }), requestId: input.request.requestId, acceptanceId: input.acceptance.acceptanceId, milestoneId: input.acceptance.milestoneId, deliveryId: input.acceptance.deliveryId, scopeHash: input.request.scopeHash, requestRecordVersion: input.request.recordVersion, acceptanceRecordVersion: input.acceptance.acceptanceRecordVersion, rightsRecordVersion: 1, licenseSnapshotHash: input.licenseSnapshotHash, rights: [...new Set(input.rights)].sort(), decidedByAccountId: input.decidedByAccountId, status: input.status, createsMarketEntitlement: false } as const);
  registerCurrentRecord("RIGHTS", rights.rightsDecisionId, rights.rightsRecordVersion);
  return success(rights);
}

export type DirectWorkPaymentStatus = "PENDING" | "AUTHORIZED" | "PAID" | "REFUNDED" | "DISPUTED" | "FAILED" | "CANCELLED";
export type DirectWorkPaymentEventType = "AUTHORIZED" | "PAID" | "REFUNDED" | "DISPUTED" | "FAILED" | "CANCELLED";

export interface DirectWorkPayment {
  readonly paymentId: DirectWorkPaymentId;
  readonly aggregateIdentity: DirectWorkAggregateIdentity;
  readonly requestId: DirectWorkRequestId;
  readonly agreementId: DirectWorkAgreementId;
  readonly quoteId: DirectWorkQuoteId;
  readonly requesterAccountId: string;
  readonly requestRecordVersion: number;
  readonly quoteRecordVersion: number;
  readonly agreementRecordVersion: number;
  readonly paymentRecordVersion: number;
  readonly amount: Money;
  readonly quoteSnapshotHash: ContentHash;
  readonly agreementTermsHash: ContentHash;
  readonly provider: "OPAQUE_PROVIDER" | "CURRENT_SERVER";
  readonly environment: "TEST" | "LIVE";
  readonly status: DirectWorkPaymentStatus;
  readonly appliedEvents: readonly { readonly eventId: DirectWorkPaymentEventId; readonly sequence: number; readonly type: DirectWorkPaymentEventType; readonly fingerprint: ContentHash }[];
  readonly createsMarketPurchase: false;
  readonly createsEntitlement: false;
}

export interface DirectWorkPaymentEvent {
  readonly eventId: DirectWorkPaymentEventId;
  readonly paymentId: DirectWorkPaymentId;
  readonly requestId: DirectWorkRequestId;
  readonly sequence: number;
  readonly type: DirectWorkPaymentEventType;
  readonly fingerprint: ContentHash;
  readonly accountId: string;
  readonly quoteSnapshotHash: ContentHash;
  readonly environment: "TEST" | "LIVE";
}

export function createDirectWorkPayment(input: { readonly paymentId: DirectWorkPaymentId; readonly request: DirectWorkRequest; readonly agreement: DirectWorkAgreement; readonly quote: DirectWorkQuote; readonly provider: DirectWorkPayment["provider"]; readonly environment: DirectWorkPayment["environment"]; readonly clientAmountMinor?: number; readonly clientRoyaltyRate?: number }): WorkResult<DirectWorkPayment> {
  if (!validSealedRecord(input.request, "REQUEST")) return failure([recordIntegrityFailure("REQUEST", "request")]);
  if (!validSealedRecord(input.agreement, "AGREEMENT")) return failure([recordIntegrityFailure("AGREEMENT", "agreement")]);
  if (!validSealedRecord(input.quote, "QUOTE")) return failure([recordIntegrityFailure("QUOTE", "quote")]);
  const currentRequest = CURRENT_REQUESTS.get(input.request.requestId);
  if (currentRequest === undefined || currentRequest.recordVersion !== input.request.recordVersion || currentRequest.status !== input.request.status) return failure([error("STALE_AGGREGATE", "Payment requires the current canonical Request revision.", "request.recordVersion")]);
  if (!currentRecordMatches("QUOTE", input.quote.quoteId, input.quote.quoteRecordVersion)) return failure([staleParent("quote.quoteRecordVersion")]);
  if (!currentRecordMatches("AGREEMENT", input.agreement.agreementId, input.agreement.agreementRecordVersion)) return failure([staleParent("agreement.agreementRecordVersion")]);
  if (input.agreement.status !== "ACTIVE" || input.quote.status !== "ACCEPTED") return failure([error("AGREEMENT_NOT_ACTIVE", "Payment requires an active Agreement and accepted Quote.", "agreement")]);
  if (!validId(input.paymentId)) return failure([error("INVALID_ID", "Payment reference must be a stable identifier.", "paymentId")]);
  if (!requestMatchesQuote(input.request, input.quote) || !sameAggregateIdentity(input.agreement.aggregateIdentity, childAggregateIdentity(input.quote.aggregateIdentity, { agreementId: input.agreement.agreementId })) || input.agreement.requestId !== input.request.requestId || input.agreement.quoteId !== input.quote.quoteId || input.agreement.termsHash !== input.quote.termsHash || input.agreement.quoteTermsHash !== input.quote.termsHash) return failure([error("PAYMENT_QUOTE_MISMATCH", "Payment references must belong to one Request-rooted Quote and Agreement graph.", "requestId")]);
  if (input.clientAmountMinor !== undefined || input.clientRoyaltyRate !== undefined || forbiddenKeys(input).length > 0) return failure([error("QUOTE_NOT_SERVER_RESOLVED", "Client money, royalty, payout, license, or entitlement input is not authoritative.", "input")]);
  const money = validateMoney(input.quote.total);
  if (!money.ok) return money;
  const payment = sealRecord("PAYMENT", { paymentId: input.paymentId, aggregateIdentity: childAggregateIdentity(input.agreement.aggregateIdentity, { paymentId: input.paymentId }), requestId: input.request.requestId, agreementId: input.agreement.agreementId, quoteId: input.quote.quoteId, requesterAccountId: input.request.requesterAccountId, requestRecordVersion: input.request.recordVersion, quoteRecordVersion: input.quote.quoteRecordVersion, agreementRecordVersion: input.agreement.agreementRecordVersion, paymentRecordVersion: 1, amount: Object.freeze({ ...input.quote.total }), quoteSnapshotHash: input.quote.termsHash, agreementTermsHash: input.agreement.termsHash, provider: input.provider, environment: input.environment, status: "PENDING", appliedEvents: Object.freeze([]), createsMarketPurchase: false, createsEntitlement: false } as const);
  registerCurrentRecord("PAYMENT", payment.paymentId, payment.paymentRecordVersion);
  return success(payment);
}

const PAYMENT_TRANSITIONS: Readonly<Record<DirectWorkPaymentStatus, readonly DirectWorkPaymentEventType[]>> = {
  PENDING: ["AUTHORIZED", "FAILED", "CANCELLED"],
  AUTHORIZED: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["REFUNDED", "DISPUTED"],
  REFUNDED: [],
  DISPUTED: ["REFUNDED"],
  FAILED: [],
  CANCELLED: [],
};

function nextPaymentStatus(event: DirectWorkPaymentEventType): DirectWorkPaymentStatus {
  if (event === "AUTHORIZED") return "AUTHORIZED";
  if (event === "PAID") return "PAID";
  if (event === "REFUNDED") return "REFUNDED";
  if (event === "DISPUTED") return "DISPUTED";
  if (event === "FAILED") return "FAILED";
  return "CANCELLED";
}

export function applyDirectWorkPaymentEvent(payment: DirectWorkPayment, event: DirectWorkPaymentEvent): WorkResult<DirectWorkPayment> {
  if (!validSealedRecord(payment, "PAYMENT")) return failure([recordIntegrityFailure("PAYMENT", "payment")]);
  if (!currentRecordMatches("PAYMENT", payment.paymentId, payment.paymentRecordVersion)) return failure([error("STALE_PAYMENT", "Payment Event requires the current canonical Payment revision.", "payment.paymentRecordVersion")]);
  if (event.paymentId !== payment.paymentId || event.requestId !== payment.requestId) return failure([error("PAYMENT_QUOTE_MISMATCH", "Payment Event targets a different Direct Work Payment or Request.", "event")]);
  if (event.accountId !== payment.requesterAccountId) return failure([error("PAYMENT_ACCOUNT_MISMATCH", "Payment Event account does not match the scoped requester.", "event.accountId")]);
  if (event.environment !== payment.environment) return failure([error("PAYMENT_ENVIRONMENT_MISMATCH", "Payment Event environment does not match the Payment record.", "event.environment")]);
  if (event.quoteSnapshotHash !== payment.quoteSnapshotHash) return failure([error("PAYMENT_QUOTE_MISMATCH", "Payment Event Quote snapshot does not match the canonical Quote.", "event.quoteSnapshotHash")]);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1 || !validHash(event.fingerprint)) return failure([error("PAYMENT_EVENT_UNKNOWN", "Payment Event identity is incomplete.", "event")]);
  const duplicate = payment.appliedEvents.find((item) => item.eventId === event.eventId);
  if (duplicate !== undefined) {
    if (duplicate.fingerprint !== event.fingerprint || duplicate.type !== event.type) return failure([error("PAYMENT_EVENT_CONFLICT", "The same Provider Event ID has a different fingerprint or type.", "event.eventId")]);
    return success(payment, [info("PAYMENT_EVENT_DUPLICATE", "Identical Payment Event is an idempotent no-op.", { doublePost: false })]);
  }
  if (!PAYMENT_TRANSITIONS[payment.status].includes(event.type)) return failure([error("INVALID_STATE_TRANSITION", "Payment Event is not valid for the current Direct Work Payment status.", "event.type")]);
  if (payment.appliedEvents.some((item) => item.sequence === event.sequence)) return failure([error("PAYMENT_EVENT_CONFLICT", "Two different Payment Events cannot share a sequence.", "event.sequence")]);
  const appliedEvents = Object.freeze([...payment.appliedEvents, { eventId: event.eventId, sequence: event.sequence, type: event.type, fingerprint: event.fingerprint }].sort((left, right) => left.sequence - right.sequence || left.eventId.localeCompare(right.eventId)));
  const next = sealRecord("PAYMENT", { ...payment, paymentRecordVersion: payment.paymentRecordVersion + 1, status: nextPaymentStatus(event.type), appliedEvents } as const);
  registerCurrentRecord("PAYMENT", next.paymentId, next.paymentRecordVersion);
  return success(next);
}

export function reconcileDirectWorkPayment(payment: DirectWorkPayment, events: readonly DirectWorkPaymentEvent[]): WorkResult<DirectWorkPayment> {
  let current = payment;
  const diagnostics: WorkDiagnostic[] = [];
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence || left.eventId.localeCompare(right.eventId))) {
    const result = applyDirectWorkPaymentEvent(current, event);
    if (!result.ok) return result;
    current = result.value;
    diagnostics.push(...result.diagnostics);
  }
  return success(current, diagnostics);
}

export type LedgerEntryType = "SALE" | "REVERSAL" | "ADJUSTMENT";
export type LedgerDirection = "CREDIT" | "DEBIT";

export interface DirectWorkLedgerEntry {
  readonly ledgerEntryId: DirectWorkLedgerEntryId;
  readonly requestId: DirectWorkRequestId;
  readonly paymentId: DirectWorkPaymentId;
  readonly sourceEventId: DirectWorkPaymentEventId;
  readonly entryType: LedgerEntryType;
  readonly direction: LedgerDirection;
  readonly amount: Money;
  readonly adjustsEntryId?: DirectWorkLedgerEntryId;
  readonly immutableHash: ContentHash;
}

export interface ServerCanonicalRecordReference {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly revision: string;
  readonly canonicalHash: ContentHash;
  readonly origin: "SERVER_REGISTRY";
}

type LedgerInput = { readonly ledgerEntryId: DirectWorkLedgerEntryId; readonly payment: DirectWorkPayment; readonly sourceEvent: DirectWorkPaymentEvent; readonly entryType?: LedgerEntryType; readonly direction?: LedgerDirection; readonly amount?: Money; readonly adjustsEntryId?: DirectWorkLedgerEntryId };

async function createDirectWorkLedgerEntryCore(input: LedgerInput, requireProcessSeal: boolean, requireLocalHead: boolean): Promise<WorkResult<DirectWorkLedgerEntry>> {
  if (requireProcessSeal && !validSealedRecord(input.payment, "PAYMENT")) return failure([recordIntegrityFailure("PAYMENT", "payment")]);
  if (requireLocalHead && !currentRecordMatches("PAYMENT", input.payment.paymentId, input.payment.paymentRecordVersion)) return failure([error("STALE_PAYMENT", "Ledger creation requires the current canonical Payment revision.", "payment.paymentRecordVersion")]);
  if (input.sourceEvent.paymentId !== input.payment.paymentId || input.sourceEvent.requestId !== input.payment.requestId) return failure([error("LEDGER_INVALID", "Ledger Event does not match the Direct Work Payment.", "sourceEvent")]);
  if (input.sourceEvent.type !== "PAID" && input.sourceEvent.type !== "REFUNDED") return failure([error("LEDGER_INVALID", "Only verified paid/refund events can create a primary Ledger entry.", "sourceEvent.type")]);
  if (input.payment.status !== (input.sourceEvent.type === "REFUNDED" ? "REFUNDED" : "PAID")) return failure([error("LEDGER_INVALID", "Ledger creation requires a Payment status derived from the verified Payment Event.", "payment.status")]);
  if (input.sourceEvent.accountId !== input.payment.requesterAccountId || input.sourceEvent.environment !== input.payment.environment || input.sourceEvent.quoteSnapshotHash !== input.payment.quoteSnapshotHash || !validHash(input.sourceEvent.fingerprint)) return failure([error("LEDGER_INVALID", "Ledger Event is not bound to the canonical Payment authority.", "sourceEvent")]);
  const appliedEvent = input.payment.appliedEvents.find((event) => event.eventId === input.sourceEvent.eventId);
  if (appliedEvent === undefined || appliedEvent.fingerprint !== input.sourceEvent.fingerprint || appliedEvent.type !== input.sourceEvent.type) return failure([error("LEDGER_INVALID", "Ledger creation requires the exact already-reconciled Payment Event.", "sourceEvent.eventId")]);
  const amount = input.payment.amount;
  const money = validateMoney(amount);
  if (!money.ok) return money;
  if (input.amount !== undefined && (input.amount.amountMinor !== amount.amountMinor || input.amount.currency !== amount.currency || input.amount.roundingPolicyVersion !== amount.roundingPolicyVersion)) return failure([error("LEDGER_INVALID", "Caller-supplied Ledger amount cannot differ from canonical Payment Money.", "amount")]);
  const entryType: LedgerEntryType = input.sourceEvent.type === "REFUNDED" ? "REVERSAL" : "SALE";
  const direction: LedgerDirection = input.sourceEvent.type === "REFUNDED" ? "DEBIT" : "CREDIT";
  if (input.entryType !== undefined && input.entryType !== entryType) return failure([error("LEDGER_INVALID", "Ledger entry type is derived from the verified Payment Event.", "entryType")]);
  if (input.direction !== undefined && input.direction !== direction) return failure([error("LEDGER_INVALID", "Ledger direction is derived from the verified Payment Event.", "direction")]);
  if (entryType !== "SALE" && input.adjustsEntryId === undefined) return failure([error("LEDGER_INVALID", "Adjustment and reversal entries must reference the original entry.", "adjustsEntryId")]);
  const value = { ledgerEntryId: input.ledgerEntryId, requestId: input.payment.requestId, paymentId: input.payment.paymentId, sourceEventId: input.sourceEvent.eventId, entryType, direction, amount, ...(input.adjustsEntryId === undefined ? {} : { adjustsEntryId: input.adjustsEntryId }) };
  return success({ ...value, immutableHash: await hashCanonical(value) });
}

export function createDirectWorkLedgerEntry(input: LedgerInput): Promise<WorkResult<DirectWorkLedgerEntry>> {
  return createDirectWorkLedgerEntryCore(input, true, true);
}

/**
 * Retired compatibility shape. A caller-created record reference is never a
 * Server Registry authority. The server ID-only Registry adapter is the only
 * supported rehydration path.
 */
export async function createDirectWorkLedgerEntryFromServerCanonical(input: LedgerInput & { readonly canonicalPaymentReference: ServerCanonicalRecordReference }): Promise<WorkResult<DirectWorkLedgerEntry>> {
  void input;
  return failure([error("LEDGER_INVALID", "Caller-created Server Registry references are retired; use the server ID-only Registry materializer.", "canonicalPaymentReference")]);
}

export function appendLedgerAdjustment(existing: DirectWorkLedgerEntry, input: { readonly ledgerEntryId: DirectWorkLedgerEntryId; readonly sourceEventId: DirectWorkPaymentEventId; readonly entryType: "REVERSAL" | "ADJUSTMENT"; readonly direction: LedgerDirection; readonly amount: Money }): Promise<WorkResult<DirectWorkLedgerEntry>> {
  return Promise.resolve(failure<DirectWorkLedgerEntry>([error("LEDGER_INVALID", "Caller-created Ledger adjustments are legacy-adapter-only; use a server-resolved FP-003 correction authority.", "input")]));
}

export function projectLedgerBalance(entries: readonly DirectWorkLedgerEntry[], currency: CurrencyCode): WorkResult<Money> {
  let amountMinor = 0;
  let policy: RoundingPolicyVersion = "MINOR_UNIT_REJECT_V1";
  for (const entry of entries) {
    if (entry.amount.currency !== currency) return failure([error("CURRENCY_MISMATCH", "Ledger balance cannot mix currencies.", "entries.amount.currency")]);
    const money = validateMoney(entry.amount);
    if (!money.ok) return money;
    policy = entry.amount.roundingPolicyVersion;
    const signed = entry.direction === "CREDIT" ? entry.amount.amountMinor : -entry.amount.amountMinor;
    if (signed > 0 && amountMinor > SAFE_INTEGER - signed || signed < 0 && amountMinor < -SAFE_INTEGER - signed) return failure([error("MONEY_OVERFLOW", "Ledger projection exceeds the safe integer range.", "entries.amountMinor")]);
    amountMinor += signed;
  }
  return success({ amountMinor: Math.max(0, amountMinor), currency, roundingPolicyVersion: policy });
}

export interface PayoutFailureProjection {
  readonly payoutId: string;
  readonly status: "FAILED";
  readonly doesNotMutatePayment: true;
  readonly doesNotMutateAcceptance: true;
  readonly doesNotMutateRights: true;
}

export function recordPayoutFailure(payoutId: string): WorkResult<PayoutFailureProjection> {
  if (!validId(payoutId)) return failure([error("INVALID_ID", "Payout reference is not stable.", "payoutId")]);
  return success({ payoutId, status: "FAILED", doesNotMutatePayment: true, doesNotMutateAcceptance: true, doesNotMutateRights: true });
}

export type DirectWorkFeatureFlag = "work-request-read" | "work-request-write" | "quote-create" | "agreement-sign" | "milestone-write" | "delivery-submit" | "payment-intent" | "rights-acceptance";
export type DirectWorkFeatureFlags = Readonly<Record<string, boolean | undefined>>;

export const DEFAULT_WP220_FEATURE_FLAGS: Readonly<Record<DirectWorkFeatureFlag, false>> = Object.freeze({
  "work-request-read": false,
  "work-request-write": false,
  "quote-create": false,
  "agreement-sign": false,
  "milestone-write": false,
  "delivery-submit": false,
  "payment-intent": false,
  "rights-acceptance": false,
});

export function directWorkFeatureEnabled(flags: DirectWorkFeatureFlags, flag: DirectWorkFeatureFlag, killSwitch: boolean): WorkResult<true> {
  if (killSwitch) return failure([error("KILL_SWITCH_ACTIVE", "WP-220 is disabled by the kill switch.")]);
  if (!(flag in DEFAULT_WP220_FEATURE_FLAGS)) return failure([error("UNKNOWN_FLAG", "Unknown Direct Work flag fails closed.", "flag")]);
  if (flags[flag] !== true) return failure([error("FEATURE_DISABLED", "Direct Work feature is disabled by default.", "flag")]);
  return success(true);
}

export interface DirectWorkRollbackPlan {
  readonly planId: string;
  readonly fromSnapshotHash: ContentHash;
  readonly restoreSnapshotHash: ContentHash;
  readonly restoreSnapshot: Readonly<Record<string, unknown>>;
  readonly execution: "LOCAL_SHADOW_ONLY";
}

export async function createDirectWorkRollbackPlan(current: Readonly<Record<string, unknown>>, restore: Readonly<Record<string, unknown>>): Promise<DirectWorkRollbackPlan> {
  const fromSnapshotHash = await hashCanonical(current);
  const restoreSnapshotHash = await hashCanonical(restore);
  return { planId: `wp220-rollback:${restoreSnapshotHash.slice(0, 16)}`, fromSnapshotHash, restoreSnapshotHash, restoreSnapshot: restore, execution: "LOCAL_SHADOW_ONLY" };
}

export function applyDirectWorkRollbackPlan(plan: DirectWorkRollbackPlan, currentSnapshotHash: ContentHash): WorkResult<Readonly<Record<string, unknown>>> {
  if (plan.fromSnapshotHash !== currentSnapshotHash) return failure([error("ROLLBACK_PRECONDITION_FAILED", "Rollback requires the last validated Direct Work snapshot.", "currentSnapshotHash")]);
  return success(plan.restoreSnapshot, [info("ROLLBACK_PRECONDITION_FAILED", "Shadow projection restored; no external mutation executed.", { externalMutation: false })]);
}

export function auditSafeDirectWorkSummary(value: { readonly request: DirectWorkRequest; readonly payment?: DirectWorkPayment; readonly ledgerCount: number }): Readonly<Record<string, string | number | boolean>> {
  return { domain: "DIRECT_WORK", requestStatus: value.request.status, paymentStatus: value.payment?.status ?? "NONE", ledgerCount: value.ledgerCount, isGeneralDm: false, createsMarketEntitlement: false, hasSensitiveFields: false };
}

export function canonicalDirectWork(value: unknown): string { return canonicalJson(value); }
export function asDirectWorkContentHash(value: string): ContentHash { return asSha256(value, "DirectWorkContentHash"); }
