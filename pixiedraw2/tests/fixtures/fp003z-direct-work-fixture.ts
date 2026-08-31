import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  asSha256,
  type ContentHash,
  type AuthorizationProofV1,
} from "../../src/wp160-contracts.ts";
import {
  acceptDirectWorkQuote,
  applyDirectWorkPaymentEvent,
  asDirectWorkAcceptanceId,
  asDirectWorkAgreementId,
  asDirectWorkDeliveryId,
  asDirectWorkMilestoneId,
  asDirectWorkPaymentEventId,
  asDirectWorkPaymentId,
  asDirectWorkQuoteId,
  asDirectWorkRequestId,
  createDirectWorkAgreement,
  createDirectWorkMilestone,
  createDirectWorkPayment,
  createDirectWorkQuote,
  createDirectWorkRequest,
  decideDirectWorkRights,
  recordDirectWorkAcceptance,
  signDirectWorkAgreement,
  submitDirectWorkDelivery,
  transitionDirectWorkMilestone,
  transitionDirectWorkRequest,
  type DirectWorkPaymentEvent,
} from "../../src/wp220-direct-work-core.ts";
import {
  asFinancialProviderEventId,
  type FinancialAuthorityResolutionV1,
  type VerifiedProviderEventV1,
} from "../../src/fp003-financial-integrity-core.ts";
import type { SeedDirectWorkChain } from "./in-memory-authoritative-registry.ts";
import type { ServerTenantContextV1 } from "../../src/server/authority-contracts.ts";

export const FIXTURE_HASH_SCOPE = asSha256("a".repeat(64));
export const FIXTURE_HASH_TERMS = asSha256("b".repeat(64));
export const FIXTURE_HASH_DELIVERABLE = asSha256("c".repeat(64));
export const FIXTURE_HASH_EVENT = asSha256("d".repeat(64));
export const FIXTURE_MONEY = { amountMinor: 1_000, currency: "JPY", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" as const };

const issuedAt = new Date(Date.now() - 60_000).toISOString();
const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();

function proof(principalId: string, resourceId: string, action: string, resourceType = "DIRECT_WORK_REQUEST", tenantId = "tenant-fp003z"): AuthorizationProofV1 {
  return { schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "fp003z-fixture", proofId: `proof:${resourceId}:${principalId}`, principalId, resourceType, resourceId, action, capability: action, tenantId, correlationId: "fp003z-fixture", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION, grantId: "grant:fp003z-fixture", issuedAt, expiresAt };
}

interface Fp003ZDirectWorkFixtureOptions {
  readonly suffix?: string;
  readonly tenantId?: string;
  readonly eventHash?: ContentHash;
  readonly eventNamespace?: string;
}

function resolverFor(tenantId: string) {
  return ({ expected }: { readonly expected: { readonly principalId?: string | null; readonly resourceType?: string; readonly resourceId?: string; readonly action?: string; readonly capability?: string; readonly tenantId?: string | null; readonly policyVersion?: string } }): AuthorizationProofV1 => ({ ...proof(expected.principalId ?? "requester-fixture", expected.resourceId ?? "request-fixture", expected.action ?? expected.capability ?? "direct-work.operation", expected.resourceType ?? "DIRECT_WORK_REQUEST", tenantId), tenantId: expected.tenantId ?? tenantId });
}

function must<T extends { readonly ok: boolean }>(result: T): Extract<T, { readonly ok: true }> {
  if (!result.ok) throw new Error("Direct Work fixture construction failed.");
  return result as Extract<T, { readonly ok: true }>;
}

export async function buildFp003ZDirectWorkChain(options: string | Fp003ZDirectWorkFixtureOptions = "default"): Promise<SeedDirectWorkChain> {
  const suffix = typeof options === "string" ? options : options.suffix ?? "default";
  const tenantId = typeof options === "string" ? "tenant-fp003z" : options.tenantId ?? "tenant-fp003z";
  const eventHash = typeof options === "string" ? FIXTURE_HASH_EVENT : options.eventHash ?? FIXTURE_HASH_EVENT;
  const eventNamespace = typeof options === "string" ? "" : options.eventNamespace ?? "";
  const tenantContext: ServerTenantContextV1 = { schemaVersion: "SERVER_TENANT_CONTEXT_V1", tenantId, principalId: `requester-fp003z-${suffix}`, source: "SERVER_REGISTRY" };
  const resolver = resolverFor(tenantId);
  const requestId = asDirectWorkRequestId(`fp003z-request-${suffix}`);
  const requester = `requester-fp003z-${suffix}`;
  const creator = `creator-fp003z-${suffix}`;
  const request = must(createDirectWorkRequest({ requestId, requesterAccountId: requester, creatorAccountId: creator, scopeHash: FIXTURE_HASH_SCOPE, createdAt: "2026-08-10T00:00:00.000Z", recordVersion: 1, authorizationProof: proof(requester, requestId, "direct-work.request.create", "DIRECT_WORK_REQUEST", tenantId), authorizationProofResolver: resolver }));
  const submitted = must(transitionDirectWorkRequest(request.value, "SUBMIT"));
  const issuedQuote = must(createDirectWorkQuote({ quoteId: asDirectWorkQuoteId(`fp003z-quote-${suffix}`), request: submitted.value, creatorAccountId: creator, lines: [{ lineId: `fp003z-line-${suffix}`, deliverableHash: FIXTURE_HASH_DELIVERABLE, amount: FIXTURE_MONEY }], termsHash: FIXTURE_HASH_TERMS, royaltyRuleVersion: "direct-work-royalty-v1", authorizationProof: proof(creator, requestId, "direct-work.quote.create", "DIRECT_WORK_REQUEST", tenantId), authorizationProofResolver: resolver }));
  const acceptedQuote = must(acceptDirectWorkQuote(issuedQuote.value, requester));
  const pendingAgreement = must(createDirectWorkAgreement({ agreementId: asDirectWorkAgreementId(`fp003z-agreement-${suffix}`), request: submitted.value, quote: acceptedQuote.value, termsHash: FIXTURE_HASH_TERMS }));
  const requesterSigned = must(signDirectWorkAgreement(pendingAgreement.value, requester, "REQUESTER"));
  const agreement = must(signDirectWorkAgreement(requesterSigned.value, creator, "CREATOR"));
  const plannedMilestone = must(createDirectWorkMilestone({ milestoneId: asDirectWorkMilestoneId(`fp003z-milestone-${suffix}`), agreement: agreement.value, sequence: 1, deliverableHash: FIXTURE_HASH_DELIVERABLE, amount: FIXTURE_MONEY }));
  const startedMilestone = must(transitionDirectWorkMilestone(plannedMilestone.value, "START"));
  const delivery = must(submitDirectWorkDelivery({ deliveryId: asDirectWorkDeliveryId(`fp003z-delivery-${suffix}`), milestone: startedMilestone.value, revisionHash: FIXTURE_HASH_DELIVERABLE }));
  const awaitingAcceptance = must(transitionDirectWorkMilestone(startedMilestone.value, "DELIVERY_SUBMITTED"));
  const accepted = must(recordDirectWorkAcceptance({ acceptanceId: asDirectWorkAcceptanceId(`fp003z-acceptance-${suffix}`), request: submitted.value, milestone: awaitingAcceptance.value, delivery: delivery.value, actorAccountId: requester, decision: "ACCEPTED" }));
  const rights = must(decideDirectWorkRights({ rightsDecisionId: `fp003z-rights-${suffix}` as never, request: submitted.value, acceptance: accepted.value.acceptance, licenseSnapshotHash: FIXTURE_HASH_TERMS, rights: ["COMMERCIAL_USE"], decidedByAccountId: requester, status: "GRANTED" }));
  const payment = must(createDirectWorkPayment({ paymentId: asDirectWorkPaymentId(`fp003z-payment-${suffix}`), request: submitted.value, agreement: agreement.value, quote: acceptedQuote.value, provider: "CURRENT_SERVER", environment: "TEST" }));
  const providerEventId = asFinancialProviderEventId(`fp003z-provider-paid-${suffix}${eventNamespace === "" ? "" : `-${eventNamespace}`}`);
  const authorizedEvent: DirectWorkPaymentEvent = { eventId: asDirectWorkPaymentEventId(`fp003z-authorized-${suffix}${eventNamespace === "" ? "" : `-${eventNamespace}`}`), paymentId: payment.value.paymentId, requestId: payment.value.requestId, sequence: 1, type: "AUTHORIZED", fingerprint: eventHash, accountId: requester, quoteSnapshotHash: payment.value.quoteSnapshotHash, environment: "TEST" };
  const authorized = must(applyDirectWorkPaymentEvent(payment.value, authorizedEvent));
  const paidEvent: DirectWorkPaymentEvent = { eventId: asDirectWorkPaymentEventId(providerEventId), paymentId: authorized.value.paymentId, requestId: authorized.value.requestId, sequence: 2, type: "PAID", fingerprint: eventHash, accountId: requester, quoteSnapshotHash: authorized.value.quoteSnapshotHash, environment: "TEST" };
  const paid = must(applyDirectWorkPaymentEvent(authorized.value, paidEvent));
  const providerEvent: VerifiedProviderEventV1 = { schemaVersion: "FINANCIAL_INTEGRITY_V1", eventId: providerEventId, payloadFingerprint: eventHash, sourceKind: "DIRECT_WORK_PAYMENT", sourceId: paid.value.paymentId, eventType: "PAID", environment: "TEST" };
  const financialProof = proof(requester, paid.value.paymentId, "finance.royalty.allocate", "FINANCIAL_ALLOCATION", tenantId);
  const financialAuthority: FinancialAuthorityResolutionV1 = { schemaVersion: "FINANCIAL_INTEGRITY_V1", sourceKind: "DIRECT_WORK_PAYMENT", sourceId: paid.value.paymentId, requestId: paid.value.requestId, paymentId: paid.value.paymentId, providerEventId, payloadFingerprint: eventHash, environment: "TEST", settlementState: "PAID", gross: paid.value.amount, feeSchedule: { feeScheduleId: "fee:fp003z", feeScheduleVersion: "1", platformFeeBps: 1_000, royaltyRecipients: [{ recipientAccountId: creator, allocationBps: 9_000 }] } };
  return { tenantContext, request: submitted.value, quote: acceptedQuote.value, agreement: agreement.value, milestone: accepted.value.milestone, delivery: accepted.value.delivery, acceptance: accepted.value.acceptance, rights: rights.value, payment: paid.value, sourceEvent: paidEvent, providerEvent, financialProof: { ...financialProof, tenantId: tenantContext.tenantId }, financialAuthority, canonicalPrincipalId: requester };
}
