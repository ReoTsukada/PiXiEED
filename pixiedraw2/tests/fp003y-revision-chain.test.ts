import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  asSha256,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
} from "../src/wp160-contracts.ts";
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
  createDirectWorkLedgerEntry,
  createDirectWorkLedgerEntryFromServerCanonical,
  createDirectWorkMilestone,
  createDirectWorkPayment,
  createDirectWorkQuote,
  createDirectWorkRequest,
  recordDirectWorkAcceptance,
  signDirectWorkAgreement,
  submitDirectWorkDelivery,
  transitionDirectWorkMilestone,
  transitionDirectWorkRequest,
  type DirectWorkAgreement,
  type DirectWorkDelivery,
  type DirectWorkMilestone,
  type DirectWorkQuote,
  type DirectWorkRequest,
} from "../src/wp220-direct-work-core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const HASH_SCOPE = asSha256("a".repeat(64));
const HASH_TERMS = asSha256("b".repeat(64));
const HASH_DELIVERABLE = asSha256("c".repeat(64));
const HASH_EVENT = asSha256("d".repeat(64));
const MONEY = { amountMinor: 1000, currency: "JPY", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" as const };
const issuedAt = new Date(Date.now() - 60_000).toISOString();
const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();

function proof(overrides: Partial<AuthorizationProofV1> = {}): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "fp003y-server",
    proofId: "fp003y-proof",
    principalId: "requester-fp003y",
    resourceType: "DIRECT_WORK_REQUEST",
    resourceId: "fp003y-request",
    action: "direct-work.request.create",
    capability: "direct-work.request.create",
    tenantId: "tenant-fp003y",
    correlationId: "correlation-fp003y",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant-fp003y",
    issuedAt,
    expiresAt,
    ...overrides,
  };
}

const serverResolver: AuthorizationProofResolver = ({ expected }) => proof({
  principalId: expected.principalId ?? null,
  resourceType: expected.resourceType ?? "DIRECT_WORK_REQUEST",
  resourceId: expected.resourceId ?? "resource",
  action: expected.action ?? "direct-work.operation",
  capability: expected.capability ?? "direct-work.operation",
  tenantId: expected.tenantId ?? "tenant-fp003y",
  correlationId: expected.correlationId ?? "correlation-fp003y",
  policyVersion: expected.policyVersion ?? AUTHORIZATION_PROOF_POLICY_VERSION,
});

interface Fixture {
  readonly request: DirectWorkRequest;
  readonly submitted: DirectWorkRequest;
  readonly issuedQuote: DirectWorkQuote;
  readonly quote: DirectWorkQuote;
  readonly pendingAgreement: DirectWorkAgreement;
  readonly agreement: DirectWorkAgreement;
  readonly plannedMilestone: DirectWorkMilestone;
  readonly startedMilestone: DirectWorkMilestone;
  readonly delivery: DirectWorkDelivery;
}

function buildFixture(suffix: string): Fixture {
  const requestId = asDirectWorkRequestId(`fp003y-request-${suffix}`);
  const requester = `requester-fp003y-${suffix}`;
  const creator = `creator-fp003y-${suffix}`;
  const request = createDirectWorkRequest({
    requestId,
    requesterAccountId: requester,
    creatorAccountId: creator,
    scopeHash: HASH_SCOPE,
    createdAt: "2099-08-10T00:00:00.000Z",
    recordVersion: 1,
    authorizationProof: proof({ principalId: requester, resourceType: "DIRECT_WORK_REQUEST", resourceId: requestId, action: "direct-work.request.create", capability: "direct-work.request.create" }),
    authorizationProofResolver: serverResolver,
  });
  assert(request.ok, "Request must be valid");
  const submitted = transitionDirectWorkRequest(request.value, "SUBMIT");
  assert(submitted.ok, "Request must be submitted");
  const issuedQuote = createDirectWorkQuote({
    quoteId: asDirectWorkQuoteId(`fp003y-quote-${suffix}`),
    request: submitted.value,
    creatorAccountId: creator,
    lines: [{ lineId: `fp003y-line-${suffix}`, deliverableHash: HASH_DELIVERABLE, amount: MONEY }],
    termsHash: HASH_TERMS,
    royaltyRuleVersion: "direct-work-royalty-v1",
    authorizationProof: proof({ principalId: creator, resourceType: "DIRECT_WORK_REQUEST", resourceId: requestId, action: "direct-work.quote.create", capability: "direct-work.quote.create" }),
    authorizationProofResolver: serverResolver,
  });
  assert(issuedQuote.ok, "Issued Quote must be valid");
  const quote = acceptDirectWorkQuote(issuedQuote.value, requester);
  assert(quote.ok, "Quote must be accepted");
  const pendingAgreement = createDirectWorkAgreement({ agreementId: asDirectWorkAgreementId(`fp003y-agreement-${suffix}`), request: submitted.value, quote: quote.value, termsHash: HASH_TERMS });
  assert(pendingAgreement.ok, "Pending Agreement must be valid");
  const requesterSigned = signDirectWorkAgreement(pendingAgreement.value, requester, "REQUESTER");
  assert(requesterSigned.ok, "Requester signature must be valid");
  const agreement = signDirectWorkAgreement(requesterSigned.value, creator, "CREATOR");
  assert(agreement.ok, "Creator signature must be valid");
  const plannedMilestone = createDirectWorkMilestone({ milestoneId: asDirectWorkMilestoneId(`fp003y-milestone-${suffix}`), agreement: agreement.value, sequence: 1, deliverableHash: HASH_DELIVERABLE, amount: MONEY });
  assert(plannedMilestone.ok, "Planned Milestone must be valid");
  const startedMilestone = transitionDirectWorkMilestone(plannedMilestone.value, "START");
  assert(startedMilestone.ok, "Milestone must start");
  const delivery = submitDirectWorkDelivery({ deliveryId: asDirectWorkDeliveryId(`fp003y-delivery-${suffix}`), milestone: startedMilestone.value, revisionHash: HASH_DELIVERABLE });
  assert(delivery.ok, "Delivery must be valid");
  return { request: request.value, submitted: submitted.value, issuedQuote: issuedQuote.value, quote: quote.value, pendingAgreement: pendingAgreement.value, agreement: agreement.value, plannedMilestone: plannedMilestone.value, startedMilestone: startedMilestone.value, delivery: delivery.value };
}

function hasCode(result: { readonly diagnostics: readonly { readonly code: string }[] }, ...codes: readonly string[]): boolean {
  return result.diagnostics.some((diagnostic) => codes.includes(diagnostic.code));
}

Deno.test("FP-003Y rejects stale Request, Quote, Agreement, and Milestone parents", () => {
  const requestFixture = buildFixture("request-parent");
  const staleRequest = transitionDirectWorkRequest(requestFixture.submitted, "QUOTE_ISSUED");
  assert(staleRequest.ok, "Request head must advance for stale-parent attack");
  const staleRequestQuote = createDirectWorkQuote({
    quoteId: asDirectWorkQuoteId("fp003y-stale-request-quote"),
    request: requestFixture.submitted,
    creatorAccountId: "creator-fp003y-request-parent",
    lines: [{ lineId: "fp003y-stale-request-line", deliverableHash: HASH_DELIVERABLE, amount: MONEY }],
    termsHash: HASH_TERMS,
    royaltyRuleVersion: "direct-work-royalty-v1",
    authorizationProof: proof({ principalId: "creator-fp003y-request-parent", resourceType: "DIRECT_WORK_REQUEST", resourceId: requestFixture.submitted.requestId, action: "direct-work.quote.create", capability: "direct-work.quote.create" }),
    authorizationProofResolver: serverResolver,
  });
  assert(!staleRequestQuote.ok && hasCode(staleRequestQuote, "STALE_AGGREGATE"), "Stale Request must not create a Quote");

  const quoteFixture = buildFixture("quote-parent");
  const staleQuote = createDirectWorkAgreement({ agreementId: "fp003y-stale-quote-agreement" as never, request: quoteFixture.submitted, quote: quoteFixture.issuedQuote, termsHash: HASH_TERMS });
  assert(!staleQuote.ok && hasCode(staleQuote, "STALE_PARENT"), "Issued Quote revision must not create an Agreement after acceptance");
  const agreementFixture = buildFixture("agreement-parent");
  const staleAgreement = createDirectWorkMilestone({ milestoneId: "fp003y-stale-agreement-milestone" as never, agreement: agreementFixture.pendingAgreement, sequence: 1, deliverableHash: HASH_DELIVERABLE, amount: MONEY });
  assert(!staleAgreement.ok && hasCode(staleAgreement, "STALE_PARENT"), "Pending Agreement revision must not create a Milestone after signing");
  const milestoneFixture = buildFixture("milestone-parent");
  const staleMilestone = submitDirectWorkDelivery({ deliveryId: "fp003y-stale-milestone-delivery" as never, milestone: milestoneFixture.plannedMilestone, revisionHash: HASH_DELIVERABLE });
  assert(!staleMilestone.ok && hasCode(staleMilestone, "STALE_PARENT"), "Planned Milestone revision must not create a Delivery after start");
});

Deno.test("FP-003Y rejects stale Delivery, Acceptance, and Payment/Ledger parents", async () => {
  const fixture = buildFixture("children");
  const awaiting = transitionDirectWorkMilestone(fixture.startedMilestone, "DELIVERY_SUBMITTED");
  assert(awaiting.ok, "Milestone must enter acceptance state");
  const accepted = recordDirectWorkAcceptance({ acceptanceId: asDirectWorkAcceptanceId("fp003y-acceptance-children"), request: fixture.submitted, milestone: awaiting.value, delivery: fixture.delivery, actorAccountId: "requester-fp003y-children", decision: "ACCEPTED" });
  assert(accepted.ok, "Acceptance must be valid");
  const staleDeliveryAcceptance = recordDirectWorkAcceptance({ acceptanceId: asDirectWorkAcceptanceId("fp003y-acceptance-stale-delivery"), request: fixture.submitted, milestone: awaiting.value, delivery: fixture.delivery, actorAccountId: "requester-fp003y-children", decision: "ACCEPTED" });
  assert(!staleDeliveryAcceptance.ok && hasCode(staleDeliveryAcceptance, "STALE_PARENT"), "Old Delivery must not be accepted twice");
  const rightsFromForgedAcceptance = (await import("../src/wp220-direct-work-core.ts")).decideDirectWorkRights({ rightsDecisionId: "fp003y-rights-forged" as never, request: fixture.submitted, acceptance: { ...accepted.value.acceptance, acceptanceRecordVersion: 0 }, licenseSnapshotHash: HASH_EVENT, rights: ["COMMERCIAL_USE"], decidedByAccountId: "requester-fp003y-children", status: "GRANTED" });
  assert(!rightsFromForgedAcceptance.ok && hasCode(rightsFromForgedAcceptance, "RECORD_INTEGRITY_VIOLATION"), "Forged stale Acceptance must not reach Rights");
  const payment = createDirectWorkPayment({ paymentId: asDirectWorkPaymentId("fp003y-payment"), request: fixture.submitted, agreement: fixture.agreement, quote: fixture.quote, provider: "OPAQUE_PROVIDER", environment: "TEST" });
  assert(payment.ok, "Payment must be valid");
  const event = { eventId: asDirectWorkPaymentEventId("fp003y-event"), paymentId: payment.value.paymentId, requestId: payment.value.requestId, sequence: 1, type: "AUTHORIZED" as const, fingerprint: HASH_EVENT, accountId: payment.value.requesterAccountId, quoteSnapshotHash: payment.value.quoteSnapshotHash, environment: "TEST" as const };
  const nextPayment = applyDirectWorkPaymentEvent(payment.value, event);
  assert(nextPayment.ok, "Payment Event must advance the Payment head");
  const paidEvent = { ...event, eventId: asDirectWorkPaymentEventId("fp003y-paid-event"), sequence: 2, type: "PAID" as const };
  const paidPayment = applyDirectWorkPaymentEvent(nextPayment.value, paidEvent);
  assert(paidPayment.ok, "Paid Event must advance the Payment head");
  const staleLedger = await createDirectWorkLedgerEntry({ payment: payment.value, sourceEvent: paidEvent, ledgerEntryId: "fp003y-ledger-stale" as never });
  assert(!staleLedger.ok && hasCode(staleLedger, "STALE_PAYMENT"), "Old Payment must not create a Ledger entry");
  const rehydratedPayment = structuredClone(paidPayment.value);
  const callerReference = {
    resourceType: "DIRECT_WORK_PAYMENT",
    resourceId: rehydratedPayment.paymentId,
    revision: `payment:v${rehydratedPayment.paymentRecordVersion}`,
    canonicalHash: HASH_EVENT,
    origin: "SERVER_REGISTRY" as const,
  };
  const rehydratedLedger = await createDirectWorkLedgerEntryFromServerCanonical({ payment: rehydratedPayment, sourceEvent: paidEvent, ledgerEntryId: "fp003y-ledger-rehydrated" as never, canonicalPaymentReference: callerReference });
  assert(!rehydratedLedger.ok && hasCode(rehydratedLedger, "LEDGER_INVALID"), "A caller-created Server Registry reference must never create a Ledger entry");
  const forgedLedger = await createDirectWorkLedgerEntryFromServerCanonical({ payment: rehydratedPayment, sourceEvent: paidEvent, ledgerEntryId: "fp003y-ledger-forged" as never, canonicalPaymentReference: { ...callerReference, revision: "forged-current" } });
  assert(!forgedLedger.ok && hasCode(forgedLedger, "LEDGER_INVALID"), "A forged current revision must be rejected");
});
