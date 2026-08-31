import {
  acceptDirectWorkQuote,
  applyDirectWorkPaymentEvent,
  applyDirectWorkRollbackPlan,
  appendLedgerAdjustment,
  asDirectWorkAcceptanceId,
  asDirectWorkAgreementId,
  asDirectWorkContentHash,
  asDirectWorkDeliveryId,
  asDirectWorkLedgerEntryId,
  asDirectWorkMilestoneId,
  asDirectWorkPaymentEventId,
  asDirectWorkPaymentId,
  asDirectWorkQuoteId,
  asDirectWorkRequestId,
  asDirectWorkRightsDecisionId,
  auditSafeDirectWorkSummary,
  createDirectWorkAgreement,
  createDirectWorkLedgerEntry,
  createDirectWorkMilestone,
  createDirectWorkPayment,
  createDirectWorkQuote,
  createDirectWorkRequest,
  createDirectWorkRollbackPlan,
  DEFAULT_CURRENCY_POLICIES,
  DEFAULT_WP220_FEATURE_FLAGS,
  decideDirectWorkRights,
  directWorkFeatureEnabled,
  projectLedgerBalance,
  recordDirectWorkAcceptance,
  recordPayoutFailure,
  reconcileDirectWorkPayment,
  signDirectWorkAgreement,
  submitDirectWorkDelivery,
  sumMoney,
  transitionDirectWorkMilestone,
  transitionDirectWorkRequest,
  type DirectWorkPaymentEvent,
  type DirectWorkPayment,
  type DirectWorkRequest,
  type DirectWorkQuote,
  type DirectWorkAgreement,
} from "../src/wp220-direct-work-core.ts";
import { AUTHORIZATION_PROOF_POLICY_VERSION, asSha256, type AuthorizationProofV1 } from "../src/wp160-contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const HASH_SCOPE = asSha256("a".repeat(64));
const HASH_TERMS = asSha256("b".repeat(64));
const HASH_DELIVERABLE = asSha256("c".repeat(64));
const HASH_EVENT_1 = asSha256("d".repeat(64));
const HASH_EVENT_2 = asSha256("e".repeat(64));
const MONEY = { amountMinor: 1000, currency: "JPY", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" as const };
const issuedAt = new Date(Date.now() - 60_000).toISOString();
const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();

function proof(principalId: string, resourceId: string, action: string): AuthorizationProofV1 {
  return { schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "wp220-test", proofId: `proof:${resourceId}:${principalId}`, principalId, resourceType: "DIRECT_WORK_REQUEST", resourceId, action, capability: action, tenantId: "tenant-wp220", correlationId: "wp220-test", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION, grantId: "grant:wp220-test", issuedAt, expiresAt };
}

const resolver = ({ expected }: { readonly expected: { readonly principalId?: string | null; readonly resourceId?: string; readonly action?: string; readonly capability?: string; readonly tenantId?: string | null; readonly policyVersion?: string } }): AuthorizationProofV1 => proof(expected.principalId ?? "requester-1", expected.resourceId ?? "request", expected.action ?? expected.capability ?? "direct-work.operation");

function requestFixture(): { request: DirectWorkRequest; submitted: DirectWorkRequest } {
  const created = createDirectWorkRequest({ requestId: asDirectWorkRequestId("work-request-1"), requesterAccountId: "requester-1", creatorAccountId: "creator-1", scopeHash: HASH_SCOPE, createdAt: "2026-08-09T00:00:00.000Z", recordVersion: 1, authorizationProof: proof("requester-1", "work-request-1", "direct-work.request.create"), authorizationProofResolver: resolver });
  assert(created.ok, "Direct Work Request fixture must be valid");
  const submitted = transitionDirectWorkRequest(created.value, "SUBMIT");
  assert(submitted.ok, "Request must be submit-able");
  return { request: created.value, submitted: submitted.value };
}

function quoteFixture(request: DirectWorkRequest): { quote: DirectWorkQuote; agreement: DirectWorkAgreement } {
  const quoted = createDirectWorkQuote({ quoteId: asDirectWorkQuoteId("work-quote-1"), request, creatorAccountId: "creator-1", lines: [{ lineId: "line-1", deliverableHash: HASH_DELIVERABLE, amount: MONEY }], termsHash: HASH_TERMS, royaltyRuleVersion: "direct-work-royalty-v1", authorizationProof: proof("creator-1", request.requestId, "direct-work.quote.create"), authorizationProofResolver: resolver });
  assert(quoted.ok, "server-resolved Quote fixture must be valid");
  const accepted = acceptDirectWorkQuote(quoted.value, "requester-1");
  assert(accepted.ok, "Requester must be able to accept the Quote");
  const created = createDirectWorkAgreement({ agreementId: asDirectWorkAgreementId("work-agreement-1"), request, quote: accepted.value, termsHash: HASH_TERMS });
  assert(created.ok, "Agreement fixture must be valid");
  const requesterSigned = signDirectWorkAgreement(created.value, "requester-1", "REQUESTER");
  assert(requesterSigned.ok, "Requester signature must be valid");
  const creatorSigned = signDirectWorkAgreement(requesterSigned.value, "creator-1", "CREATOR");
  assert(creatorSigned.ok && creatorSigned.value.status === "ACTIVE", "Both signatures must activate the Agreement");
  return { quote: accepted.value, agreement: creatorSigned.value };
}

function paymentEvent(payment: DirectWorkPayment, type: DirectWorkPaymentEvent["type"], sequence: number, eventId: string, fingerprint: typeof HASH_EVENT_1 = HASH_EVENT_1): DirectWorkPaymentEvent {
  return { eventId: asDirectWorkPaymentEventId(eventId), paymentId: payment.paymentId, requestId: payment.requestId, sequence, type, fingerprint, accountId: payment.requesterAccountId, quoteSnapshotHash: payment.quoteSnapshotHash, environment: payment.environment };
}

Deno.test("WP-220 Request/Quote/Agreement remains separate from DM and Market Product", () => {
  const { request, submitted } = requestFixture();
  assert(submitted.channel === "DIRECT_WORK" && !submitted.generalDmAuthority && !submitted.marketProductAuthority, "Direct Work must not become DM or Market authority");
  const quoted = createDirectWorkQuote({ quoteId: asDirectWorkQuoteId("work-quote-1"), request: submitted, creatorAccountId: "creator-1", lines: [{ lineId: "line-1", deliverableHash: HASH_DELIVERABLE, amount: MONEY }], termsHash: HASH_TERMS, royaltyRuleVersion: "direct-work-royalty-v1", authorizationProof: proof("creator-1", submitted.requestId, "direct-work.quote.create"), authorizationProofResolver: resolver });
  assert(quoted.ok, "submitted Request can receive a Quote");
  const clientOverride = createDirectWorkQuote({ ...({ quoteId: asDirectWorkQuoteId("work-quote-client"), request: submitted, creatorAccountId: "creator-1", lines: [{ lineId: "line-1", deliverableHash: HASH_DELIVERABLE, amount: MONEY }], termsHash: HASH_TERMS, royaltyRuleVersion: "direct-work-royalty-v1", serverResolved: true }), clientAmountMinor: 1 } as never);
  assert(!clientOverride.ok && clientOverride.diagnostics.some((item) => item.code === "QUOTE_NOT_SERVER_RESOLVED"), "client amount must never override canonical Quote");
  const dmContamination = createDirectWorkRequest({ requestId: asDirectWorkRequestId("work-request-dm"), requesterAccountId: "requester-1", creatorAccountId: "creator-1", scopeHash: HASH_SCOPE, createdAt: "2026-08-09T00:00:00.000Z", recordVersion: 1, generalDmThreadId: "dm-1" } as never);
  assert(!dmContamination.ok && dmContamination.diagnostics.some((item) => item.code === "PRIVATE_DATA_REJECTED"), "general DM reference must not enter the Direct Work Core");
  assert(request.status === "DRAFT", "Request fixture must remain immutable after derived transitions");
});

Deno.test("WP-220 Money uses integer minor units, currency policy, and deterministic totals", () => {
  const total = sumMoney([MONEY, { amountMinor: 250, currency: "JPY", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" }]);
  assert(total.ok && total.value.amountMinor === 1250 && total.value.currency === "JPY", "same-currency minor-unit lines must sum deterministically");
  const currencyMismatch = sumMoney([MONEY, { amountMinor: 1, currency: "USD", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" }]);
  assert(!currencyMismatch.ok && currencyMismatch.diagnostics.some((item) => item.code === "CURRENCY_MISMATCH"), "mixed currencies must fail closed");
  const unsupported = sumMoney([{ amountMinor: 1, currency: "XXX", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" }]);
  assert(!unsupported.ok && unsupported.diagnostics.some((item) => item.code === "CURRENCY_UNSUPPORTED"), "unsupported currency policy must fail closed");
  const fractional = sumMoney([{ amountMinor: 0.1, currency: "JPY", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" } as never]);
  assert(!fractional.ok && fractional.diagnostics.some((item) => item.code === "MONEY_INVALID"), "floating point money must fail closed");
  assert(DEFAULT_CURRENCY_POLICIES.JPY?.minorUnitDigits === 0, "JPY policy must be explicit");
});

Deno.test("WP-220 Milestone/Delivery/Acceptance/Recovery and explicit Rights decision are separate", () => {
  const { submitted } = requestFixture();
  const { quote, agreement } = quoteFixture(submitted);
  const milestone = createDirectWorkMilestone({ milestoneId: asDirectWorkMilestoneId("work-milestone-1"), agreement, sequence: 1, deliverableHash: HASH_DELIVERABLE, amount: MONEY });
  assert(milestone.ok, "Active Agreement must create a Milestone");
  const started = transitionDirectWorkMilestone(milestone.value, "START");
  assert(started.ok, "Milestone must start explicitly");
  const delivery = submitDirectWorkDelivery({ deliveryId: asDirectWorkDeliveryId("work-delivery-1"), milestone: started.value, revisionHash: HASH_DELIVERABLE, packageReference: "package-ref-1" });
  assert(delivery.ok, "Delivery must carry a verified reference");
  const awaiting = transitionDirectWorkMilestone(started.value, "DELIVERY_SUBMITTED");
  assert(awaiting.ok, "Delivery submission must move the Milestone to acceptance pending");
  const accepted = recordDirectWorkAcceptance({ acceptanceId: asDirectWorkAcceptanceId("work-acceptance-1"), request: submitted, milestone: awaiting.value, delivery: delivery.value, actorAccountId: "requester-1", decision: "ACCEPTED" });
  assert(accepted.ok && accepted.value.delivery.status === "ACCEPTED", "Requester Acceptance must be explicit");
  const rights = decideDirectWorkRights({ rightsDecisionId: asDirectWorkRightsDecisionId("work-rights-1"), request: submitted, acceptance: accepted.value.acceptance, licenseSnapshotHash: HASH_TERMS, rights: ["PERSONAL_USE", "COMMERCIAL_USE"], decidedByAccountId: "requester-1", status: "GRANTED" });
  assert(rights.ok && !rights.value.createsMarketEntitlement, "Rights decision must not create a Market Entitlement");
  const rejected = recordDirectWorkAcceptance({ acceptanceId: asDirectWorkAcceptanceId("work-acceptance-rejected"), request: submitted, milestone: awaiting.value, delivery: delivery.value, actorAccountId: "requester-1", decision: "REJECTED", reasonHash: HASH_EVENT_1 });
  assert(!rejected.ok && rejected.diagnostics.some((item) => item.code === "STALE_PARENT"), "An already accepted Delivery cannot be rejected through a stale object");
  assert(quote.total.amountMinor === MONEY.amountMinor, "Quote remains separate from Acceptance and Rights");
});

Deno.test("WP-220 Agreement permission and lifecycle failures fail closed", () => {
  const { submitted } = requestFixture();
  const { quote, agreement } = quoteFixture(submitted);
  const wrongSigner = signDirectWorkAgreement({ ...agreement, status: "PENDING_SIGNATURE", requesterSigned: false, creatorSigned: false }, "other-account", "REQUESTER");
  assert(!wrongSigner.ok && wrongSigner.diagnostics.some((item) => item.code === "RECORD_INTEGRITY_VIOLATION"), "mutated Agreement objects must be denied before signer authorization");
  const unacceptedQuote = createDirectWorkQuote({ quoteId: asDirectWorkQuoteId("work-quote-unaccepted"), request: submitted, creatorAccountId: "creator-1", lines: [{ lineId: "line-1", deliverableHash: HASH_DELIVERABLE, amount: MONEY }], termsHash: HASH_TERMS, royaltyRuleVersion: "direct-work-royalty-v1", authorizationProof: proof("creator-1", submitted.requestId, "direct-work.quote.create"), authorizationProofResolver: resolver });
  assert(unacceptedQuote.ok, "fixture Quote must exist");
  const invalidAgreement = createDirectWorkAgreement({ agreementId: asDirectWorkAgreementId("invalid-agreement"), request: submitted, quote: unacceptedQuote.value, termsHash: HASH_TERMS });
  assert(!invalidAgreement.ok && invalidAgreement.diagnostics.some((item) => item.code === "QUOTE_NOT_ACCEPTABLE"), "Agreement must require accepted Quote");
});

Deno.test("WP-220 Payment uses canonical Quote/Agreement and no Market Entitlement", async () => {
  const { submitted } = requestFixture();
  const { quote, agreement } = quoteFixture(submitted);
  const payment = createDirectWorkPayment({ paymentId: asDirectWorkPaymentId("work-payment-1"), request: submitted, agreement, quote, provider: "OPAQUE_PROVIDER", environment: "TEST" });
  assert(payment.ok && !payment.value.createsMarketPurchase && !payment.value.createsEntitlement, "Direct Work Payment must not create Market Purchase or Entitlement");
  const clientMoney = createDirectWorkPayment({ paymentId: asDirectWorkPaymentId("work-payment-client"), request: submitted, agreement, quote, provider: "OPAQUE_PROVIDER", environment: "TEST", clientAmountMinor: 1 });
  assert(!clientMoney.ok && clientMoney.diagnostics.some((item) => item.code === "QUOTE_NOT_SERVER_RESOLVED"), "client amount must not enter Payment");
  const paid = paymentEvent(payment.value, "PAID", 2, "work-payment-paid");
  const authorized = paymentEvent(payment.value, "AUTHORIZED", 1, "work-payment-authorized");
  const reconciled = reconcileDirectWorkPayment(payment.value, [paid, authorized]);
  assert(reconciled.ok && reconciled.value.status === "PAID", "out-of-order at-least-once events must reconcile by sequence");
  const duplicate = reconcileDirectWorkPayment(reconciled.value, [paid]);
  assert(duplicate.ok && duplicate.diagnostics.some((item) => item.code === "PAYMENT_EVENT_DUPLICATE"), "duplicate Payment Event must be a no-op");
  const conflict = reconcileDirectWorkPayment(reconciled.value, [{ ...paid, fingerprint: HASH_EVENT_2 }]);
  assert(!conflict.ok && conflict.diagnostics.some((item) => item.code === "PAYMENT_EVENT_CONFLICT"), "same Provider Event ID with changed fingerprint must fail closed");
  const wrongAccount = applyDirectWorkPaymentEvent(payment.value, { ...authorized, accountId: "other-account" });
  assert(!wrongAccount.ok && wrongAccount.diagnostics.some((item) => item.code === "STALE_PAYMENT" || item.code === "PAYMENT_ACCOUNT_MISMATCH"), "wrong account or stale payment event must not grant payment state");
  const wrongEnvironment = applyDirectWorkPaymentEvent(payment.value, { ...authorized, environment: "LIVE" });
  assert(!wrongEnvironment.ok && wrongEnvironment.diagnostics.some((item) => item.code === "STALE_PAYMENT" || item.code === "PAYMENT_ENVIRONMENT_MISMATCH"), "test/live confusion or stale Payment must fail closed");
  assert(quote.quoteId === payment.value.quoteId && agreement.agreementId === payment.value.agreementId, "Payment must retain canonical Quote/Agreement references");
});

Deno.test("WP-220 Ledger is append-only and payout failure does not rollback work state", async () => {
  const { submitted } = requestFixture();
  const { quote, agreement } = quoteFixture(submitted);
  const payment = createDirectWorkPayment({ paymentId: asDirectWorkPaymentId("work-payment-ledger"), request: submitted, agreement, quote, provider: "OPAQUE_PROVIDER", environment: "TEST" });
  assert(payment.ok, "Payment fixture must be valid");
  const authorizedEvent = paymentEvent(payment.value, "AUTHORIZED", 1, "work-ledger-authorized");
  const authorized = applyDirectWorkPaymentEvent(payment.value, authorizedEvent);
  assert(authorized.ok, "Authorized event must advance the Payment before Ledger derivation");
  const paid = paymentEvent(authorized.value, "PAID", 2, "work-ledger-paid");
  const paidPayment = applyDirectWorkPaymentEvent(authorized.value, paid);
  assert(paidPayment.ok, "Paid event must advance the Payment before Ledger derivation");
  const ledger = await createDirectWorkLedgerEntry({ ledgerEntryId: asDirectWorkLedgerEntryId("work-ledger-sale"), payment: paidPayment.value, sourceEvent: paid });
  assert(ledger.ok && ledger.value.entryType === "SALE" && ledger.value.direction === "CREDIT", "Paid event must append a Sale Ledger entry");
  const refund = paymentEvent(paidPayment.value, "REFUNDED", 3, "work-ledger-refund");
  const refundedPayment = applyDirectWorkPaymentEvent(paidPayment.value, refund);
  assert(refundedPayment.ok, "Refund event must advance the Payment before reversal Ledger derivation");
  const reversal = await createDirectWorkLedgerEntry({ ledgerEntryId: asDirectWorkLedgerEntryId("work-ledger-reversal"), payment: refundedPayment.value, sourceEvent: refund, adjustsEntryId: ledger.value.ledgerEntryId });
  assert(reversal.ok && reversal.value.entryType === "REVERSAL" && reversal.value.adjustsEntryId === ledger.value.ledgerEntryId, "Refund must append a reversal referencing the Sale");
  const adjustment = await appendLedgerAdjustment(ledger.value, { ledgerEntryId: asDirectWorkLedgerEntryId("work-ledger-adjustment"), sourceEventId: asDirectWorkPaymentEventId("work-ledger-adjustment-event"), entryType: "ADJUSTMENT", direction: "DEBIT", amount: { ...MONEY, amountMinor: 100 } });
  assert(!adjustment.ok && adjustment.diagnostics.some((item) => item.code === "LEDGER_INVALID"), "Caller-created Ledger adjustments must remain disabled");
  const balance = projectLedgerBalance([ledger.value, reversal.value], "JPY");
  assert(balance.ok && balance.value.amountMinor === 0, "Ledger balance must be recomputable from immutable entries");
  const payoutFailure = recordPayoutFailure("payout-failed-1");
  assert(payoutFailure.ok && payoutFailure.value.doesNotMutatePayment && payoutFailure.value.doesNotMutateRights, "Payout failure must not rollback Payment or Rights");
  assert(ledger.value.entryType === "SALE" && ledger.value.amount.amountMinor === 1000, "Old Ledger entry must remain unchanged");
});

Deno.test("WP-220 flags, rollback, and audit summary fail closed", async () => {
  const { request, submitted } = requestFixture();
  const off = directWorkFeatureEnabled(DEFAULT_WP220_FEATURE_FLAGS, "quote-create", false);
  assert(!off.ok && off.diagnostics.some((item) => item.code === "FEATURE_DISABLED"), "Direct Work flags must default OFF");
  const unknown = directWorkFeatureEnabled({ "unknown-work-flag": true }, "unknown-work-flag" as never, false);
  assert(!unknown.ok && unknown.diagnostics.some((item) => item.code === "UNKNOWN_FLAG"), "Unknown flags must fail closed");
  const kill = directWorkFeatureEnabled({ "quote-create": true }, "quote-create", true);
  assert(!kill.ok && kill.diagnostics.some((item) => item.code === "KILL_SWITCH_ACTIVE"), "Kill Switch must win");
  const plan = await createDirectWorkRollbackPlan({ request: submitted }, { request });
  const restored = applyDirectWorkRollbackPlan(plan, plan.fromSnapshotHash);
  assert(restored.ok, "Valid shadow rollback must restore the previous local projection");
  const blocked = applyDirectWorkRollbackPlan(plan, HASH_EVENT_1);
  assert(!blocked.ok && blocked.diagnostics.some((item) => item.code === "ROLLBACK_PRECONDITION_FAILED"), "Mismatched rollback snapshot must be blocked");
  const summary = auditSafeDirectWorkSummary({ request: submitted, ledgerCount: 0 });
  assert(summary.isGeneralDm === false && summary.createsMarketEntitlement === false && summary.hasSensitiveFields === false, "Audit summary must be privacy-safe and domain-separated");
});
