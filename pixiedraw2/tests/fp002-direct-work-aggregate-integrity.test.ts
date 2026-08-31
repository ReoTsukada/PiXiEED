import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  asSha256,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
} from "../src/wp160-contracts.ts";
import {
  acceptDirectWorkQuote,
  asDirectWorkAcceptanceId,
  asDirectWorkAgreementId,
  asDirectWorkDeliveryId,
  asDirectWorkMilestoneId,
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
  type DirectWorkAcceptance,
  type DirectWorkAgreement,
  type DirectWorkDelivery,
  type DirectWorkMilestone,
  type DirectWorkQuote,
  type DirectWorkRequest,
} from "../src/wp220-direct-work-core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const HASH_SCOPE_A = asSha256("a".repeat(64));
const HASH_SCOPE_B = asSha256("b".repeat(64));
const HASH_TERMS_A = asSha256("c".repeat(64));
const HASH_TERMS_B = asSha256("d".repeat(64));
const HASH_TERMS_REPLACED = asSha256("e".repeat(64));
const HASH_DELIVERABLE_A = asSha256("f".repeat(64));
const HASH_DELIVERABLE_B = asSha256("1".repeat(64));
const HASH_LICENSE = asSha256("2".repeat(64));
const MONEY = { amountMinor: 1000, currency: "JPY", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" as const };
const AUTH_ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
const AUTH_EXPIRES_AT = new Date(Date.now() + 4 * 60_000).toISOString();

function proof(overrides: Partial<AuthorizationProofV1> = {}): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "caller-authority",
    proofId: "caller-proof",
    principalId: "requester-a",
    resourceType: "DIRECT_WORK_REQUEST",
    resourceId: "request-a",
    action: "direct-work.request.create",
    capability: "direct-work.request.create",
    tenantId: "tenant-1",
    correlationId: "fp002-correlation",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant-fp002",
    issuedAt: AUTH_ISSUED_AT,
    expiresAt: AUTH_EXPIRES_AT,
    ...overrides,
  };
}

const serverResolver: AuthorizationProofResolver = ({ expected }) => proof({
  authorityId: "server-authority",
  proofId: "server-proof",
  principalId: expected.principalId ?? null,
  resourceType: expected.resourceType ?? "DIRECT_WORK_REQUEST",
  resourceId: expected.resourceId ?? "resource",
  action: expected.action ?? "direct-work.operation",
  capability: expected.capability ?? "direct-work.operation",
  tenantId: expected.tenantId ?? "tenant-1",
  correlationId: expected.correlationId ?? "fp002-server-correlation",
  policyVersion: expected.policyVersion ?? AUTHORIZATION_PROOF_POLICY_VERSION,
});

interface WorkFixture {
  readonly request: DirectWorkRequest;
  readonly submitted: DirectWorkRequest;
  readonly quote: DirectWorkQuote;
  readonly agreement: DirectWorkAgreement;
  readonly milestone: DirectWorkMilestone;
  readonly awaitingDelivery: DirectWorkMilestone;
  readonly delivery: DirectWorkDelivery;
  readonly acceptance: DirectWorkAcceptance;
}

function buildFixture(suffix: "a" | "b"): WorkFixture {
  const requestId = asDirectWorkRequestId(`fp002-request-${suffix}`);
  const requesterAccountId = `requester-${suffix}`;
  const creatorAccountId = `creator-${suffix}`;
  const scopeHash = suffix === "a" ? HASH_SCOPE_A : HASH_SCOPE_B;
  const termsHash = suffix === "a" ? HASH_TERMS_A : HASH_TERMS_B;
  const deliverableHash = suffix === "a" ? HASH_DELIVERABLE_A : HASH_DELIVERABLE_B;
  const request = createDirectWorkRequest({
    requestId,
    requesterAccountId,
    creatorAccountId,
    scopeHash,
    createdAt: "2099-08-09T00:00:00.000Z",
    recordVersion: 1,
    authorizationProof: proof({ principalId: requesterAccountId, resourceType: "DIRECT_WORK_REQUEST", resourceId: requestId, action: "direct-work.request.create", capability: "direct-work.request.create" }),
    authorizationProofResolver: serverResolver,
  });
  assert(request.ok, `Request ${suffix} must be valid`);
  const submitted = transitionDirectWorkRequest(request.value, "SUBMIT");
  assert(submitted.ok, `Request ${suffix} must be submitted`);
  const quote = createDirectWorkQuote({
    quoteId: asDirectWorkQuoteId(`fp002-quote-${suffix}`),
    request: submitted.value,
    creatorAccountId,
    lines: [{ lineId: `fp002-line-${suffix}`, deliverableHash, amount: MONEY }],
    termsHash,
    royaltyRuleVersion: "direct-work-royalty-v1",
    authorizationProof: proof({ principalId: creatorAccountId, resourceType: "DIRECT_WORK_REQUEST", resourceId: requestId, action: "direct-work.quote.create", capability: "direct-work.quote.create" }),
    authorizationProofResolver: serverResolver,
  });
  assert(quote.ok, `Quote ${suffix} must be valid`);
  const acceptedQuote = acceptDirectWorkQuote(quote.value, requesterAccountId);
  assert(acceptedQuote.ok, `Quote ${suffix} must be accepted by its requester`);
  const agreement = createDirectWorkAgreement({ agreementId: asDirectWorkAgreementId(`fp002-agreement-${suffix}`), request: submitted.value, quote: acceptedQuote.value, termsHash });
  assert(agreement.ok, `Agreement ${suffix} must be valid`);
  const requesterSigned = signDirectWorkAgreement(agreement.value, requesterAccountId, "REQUESTER");
  assert(requesterSigned.ok, `Requester signature ${suffix} must be valid`);
  const creatorSigned = signDirectWorkAgreement(requesterSigned.value, creatorAccountId, "CREATOR");
  assert(creatorSigned.ok, `Creator signature ${suffix} must be valid`);
  const milestone = createDirectWorkMilestone({ milestoneId: asDirectWorkMilestoneId(`fp002-milestone-${suffix}`), agreement: creatorSigned.value, sequence: 1, deliverableHash, amount: MONEY });
  assert(milestone.ok, `Milestone ${suffix} must be valid`);
  const started = transitionDirectWorkMilestone(milestone.value, "START");
  assert(started.ok, `Milestone ${suffix} must start`);
  const delivery = submitDirectWorkDelivery({ deliveryId: asDirectWorkDeliveryId(`fp002-delivery-${suffix}`), milestone: started.value, revisionHash: deliverableHash });
  assert(delivery.ok, `Delivery ${suffix} must be valid`);
  const awaitingDelivery = transitionDirectWorkMilestone(started.value, "DELIVERY_SUBMITTED");
  assert(awaitingDelivery.ok, `Milestone ${suffix} must await acceptance`);
  const accepted = recordDirectWorkAcceptance({ acceptanceId: asDirectWorkAcceptanceId(`fp002-acceptance-${suffix}`), request: submitted.value, milestone: awaitingDelivery.value, delivery: delivery.value, actorAccountId: requesterAccountId, decision: "ACCEPTED" });
  assert(accepted.ok, `Acceptance ${suffix} must be valid`);
  return { request: request.value, submitted: submitted.value, quote: acceptedQuote.value, agreement: creatorSigned.value, milestone: milestone.value, awaitingDelivery: awaitingDelivery.value, delivery: delivery.value, acceptance: accepted.value.acceptance };
}

Deno.test("FP-002 valid Direct Work graph stays Request-rooted through Acceptance and Rights", () => {
  const fixture = buildFixture("a");
  const payment = createDirectWorkPayment({ paymentId: asDirectWorkPaymentId("fp002-payment-a"), request: fixture.submitted, agreement: fixture.agreement, quote: fixture.quote, provider: "OPAQUE_PROVIDER", environment: "TEST" });
  assert(payment.ok, "Payment must remain valid when all Request-rooted references match");
  assert(payment.value.aggregateIdentity.aggregateId === fixture.request.requestId, "Payment must retain the Request aggregate root");
  const rights = decideDirectWorkRights({ rightsDecisionId: "fp002-rights-a" as never, request: fixture.submitted, acceptance: fixture.acceptance, licenseSnapshotHash: HASH_LICENSE, rights: ["PERSONAL_USE", "COMMERCIAL_USE"], decidedByAccountId: "requester-a", status: "GRANTED" });
  assert(rights.ok, "Rights must remain bound to the accepted graph");
  assert(rights.value.aggregateIdentity.aggregateId === fixture.request.requestId, "Rights must retain the Request aggregate root");
  assert(rights.value.aggregateIdentity.deliveryId === fixture.delivery.deliveryId, "Rights must retain the accepted Delivery identity");
});

Deno.test("FP-002 rejects cross-record Request, Quote, Agreement, Milestone, Delivery, and Acceptance joins", () => {
  const a = buildFixture("a");
  const b = buildFixture("b");

  const quoteIntoOtherRequest = createDirectWorkAgreement({ agreementId: "fp002-cross-quote" as never, request: a.submitted, quote: b.quote, termsHash: HASH_TERMS_B });
  assert(!quoteIntoOtherRequest.ok && quoteIntoOtherRequest.diagnostics.some((item) => item.code === "AGGREGATE_IDENTITY_MISMATCH"), "A Quote from another Request must be rejected");

  const agreementIntoOtherRequest = createDirectWorkMilestone({ milestoneId: "fp002-cross-agreement" as never, agreement: b.agreement, sequence: 1, deliverableHash: HASH_DELIVERABLE_B, amount: MONEY });
  assert(agreementIntoOtherRequest.ok, "The independent Agreement fixture itself remains valid");
  const crossAcceptance = recordDirectWorkAcceptance({ acceptanceId: "fp002-cross-acceptance" as never, request: a.submitted, milestone: a.awaitingDelivery, delivery: b.delivery, actorAccountId: "requester-a", decision: "ACCEPTED" });
  assert(!crossAcceptance.ok && crossAcceptance.diagnostics.some((item) => item.code === "AGGREGATE_IDENTITY_MISMATCH" || item.code === "STALE_PARENT"), "A Delivery from another Milestone/Request must be rejected");

  const mutatedMilestone = { ...a.awaitingDelivery, agreementId: b.agreement.agreementId };
  const forgedDelivery = submitDirectWorkDelivery({ deliveryId: "fp002-forged-delivery" as never, milestone: mutatedMilestone, revisionHash: HASH_DELIVERABLE_A });
  assert(!forgedDelivery.ok && forgedDelivery.diagnostics.some((item) => item.code === "RECORD_INTEGRITY_VIOLATION"), "A caller-created or modified Milestone must not be accepted as authority");
});

Deno.test("FP-002 freezes accepted Quote terms and rejects terms replacement after approval", () => {
  const a = buildFixture("a");
  const replacedTerms = createDirectWorkAgreement({ agreementId: "fp002-replaced-terms" as never, request: a.submitted, quote: a.quote, termsHash: HASH_TERMS_REPLACED });
  assert(!replacedTerms.ok && replacedTerms.diagnostics.some((item) => item.code === "QUOTE_TERMS_MISMATCH"), "Agreement terms cannot replace the accepted Quote terms");

  const forgedAcceptedQuote = { ...a.quote, termsHash: HASH_TERMS_REPLACED, acceptedTermsHash: HASH_TERMS_REPLACED };
  const forgedAgreement = createDirectWorkAgreement({ agreementId: "fp002-forged-quote" as never, request: a.submitted, quote: forgedAcceptedQuote, termsHash: HASH_TERMS_REPLACED });
  assert(!forgedAgreement.ok && forgedAgreement.diagnostics.some((item) => item.code === "RECORD_INTEGRITY_VIOLATION"), "A copied Quote object must not bypass the internal record seal");
});

Deno.test("FP-002 rejects cross-record Rights and Payment references", () => {
  const a = buildFixture("a");
  const b = buildFixture("b");
  const rights = decideDirectWorkRights({ rightsDecisionId: "fp002-cross-rights" as never, request: a.submitted, acceptance: b.acceptance, licenseSnapshotHash: HASH_LICENSE, rights: ["COMMERCIAL_USE"], decidedByAccountId: "requester-a", status: "GRANTED" });
  assert(!rights.ok && rights.diagnostics.some((item) => item.code === "AGGREGATE_IDENTITY_MISMATCH"), "Rights must not accept another Request Acceptance");

  const payment = createDirectWorkPayment({ paymentId: asDirectWorkPaymentId("fp002-cross-payment"), request: a.submitted, agreement: a.agreement, quote: b.quote, provider: "OPAQUE_PROVIDER", environment: "TEST" });
  assert(!payment.ok && payment.diagnostics.some((item) => item.code === "PAYMENT_QUOTE_MISMATCH"), "Payment must not attach another Request Quote");

  const paymentFromOtherAgreement = createDirectWorkPayment({ paymentId: asDirectWorkPaymentId("fp002-cross-payment-agreement"), request: a.submitted, agreement: b.agreement, quote: a.quote, provider: "OPAQUE_PROVIDER", environment: "TEST" });
  assert(!paymentFromOtherAgreement.ok && paymentFromOtherAgreement.diagnostics.some((item) => item.code === "PAYMENT_QUOTE_MISMATCH"), "Payment must not attach another Request Agreement");
});

Deno.test("FP-002 rejects a stale Request revision when creating a Quote", () => {
  const fixture = buildFixture("a");
  const current = transitionDirectWorkRequest(fixture.submitted, "QUOTE_ISSUED");
  assert(current.ok && current.value.status === "QUOTED", "The canonical Request must advance before the stale command attack");
  const staleQuote = createDirectWorkQuote({
    quoteId: asDirectWorkQuoteId("fp002-stale-quote"),
    request: fixture.submitted,
    creatorAccountId: "creator-a",
    lines: [{ lineId: "fp002-stale-line", deliverableHash: HASH_DELIVERABLE_A, amount: MONEY }],
    termsHash: HASH_TERMS_A,
    royaltyRuleVersion: "direct-work-royalty-v1",
    authorizationProof: proof({ principalId: "creator-a", resourceType: "DIRECT_WORK_REQUEST", resourceId: fixture.submitted.requestId, action: "direct-work.quote.create", capability: "direct-work.quote.create" }),
    authorizationProofResolver: serverResolver,
  });
  assert(!staleQuote.ok && staleQuote.diagnostics.some((item) => item.code === "STALE_AGGREGATE"), "A stale Request revision must fail closed");
});
