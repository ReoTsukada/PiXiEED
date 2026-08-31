import { AUTHORIZATION_PROOF_POLICY_VERSION, asSha256, type AuthorizationProofV1 } from "../src/wp160-contracts.ts";
import {
  acceptDirectWorkQuote,
  asDirectWorkAgreementId,
  asDirectWorkContentHash,
  asDirectWorkPaymentEventId,
  asDirectWorkPaymentId,
  asDirectWorkQuoteId,
  asDirectWorkRequestId,
  createDirectWorkAgreement,
  createDirectWorkPayment,
  createDirectWorkQuote,
  createDirectWorkRequest,
  reconcileDirectWorkPayment,
  signDirectWorkAgreement,
  transitionDirectWorkRequest,
  type DirectWorkPayment,
  type DirectWorkPaymentEvent,
} from "../src/wp220-direct-work-core.ts";

const HASH_SCOPE = asSha256("a".repeat(64));
const HASH_TERMS = asSha256("b".repeat(64));
const HASH_DELIVERABLE = asSha256("c".repeat(64));
const HASH_EVENT = asSha256("d".repeat(64));
const MONEY = { amountMinor: 1000, currency: "JPY", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" as const };
const TENANT_ID = "tenant-wp220-benchmark";
const ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
const EXPIRES_AT = new Date(Date.now() + 60_000).toISOString();
function proof(principalId: string, resourceId: string, action: string): AuthorizationProofV1 {
  return { schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "wp220-benchmark", proofId: `proof:${resourceId}:${principalId}`, principalId, resourceType: "DIRECT_WORK_REQUEST", resourceId, action, capability: action, tenantId: TENANT_ID, correlationId: "wp220-benchmark", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION, grantId: "grant:wp220-benchmark", issuedAt: ISSUED_AT, expiresAt: EXPIRES_AT };
}
const resolveProof = ({ expected }: { readonly expected: { readonly principalId?: string | null; readonly resourceId?: string; readonly action?: string } }): AuthorizationProofV1 => proof(expected.principalId ?? "benchmark-requester", expected.resourceId ?? "benchmark-request", expected.action ?? "direct-work.operation");

const requestCreated = createDirectWorkRequest({ requestId: asDirectWorkRequestId("benchmark-request"), requesterAccountId: "benchmark-requester", creatorAccountId: "benchmark-creator", scopeHash: HASH_SCOPE, createdAt: "2026-08-09T00:00:00.000Z", recordVersion: 1, authorizationProof: proof("benchmark-requester", "benchmark-request", "direct-work.request.create"), authorizationProofResolver: resolveProof });
if (!requestCreated.ok) throw new Error("Benchmark Request fixture invalid.");
const submitted = transitionDirectWorkRequest(requestCreated.value, "SUBMIT");
if (!submitted.ok) throw new Error("Benchmark Request submission invalid.");
const quoteCreated = createDirectWorkQuote({ quoteId: asDirectWorkQuoteId("benchmark-quote"), request: submitted.value, creatorAccountId: "benchmark-creator", lines: [{ lineId: "benchmark-line", deliverableHash: HASH_DELIVERABLE, amount: MONEY }], termsHash: HASH_TERMS, royaltyRuleVersion: "direct-work-v1", authorizationProof: proof("benchmark-creator", "benchmark-request", "direct-work.quote.create"), authorizationProofResolver: resolveProof });
if (!quoteCreated.ok) throw new Error("Benchmark Quote fixture invalid.");
const quoteAccepted = acceptDirectWorkQuote(quoteCreated.value, "benchmark-requester");
if (!quoteAccepted.ok) throw new Error("Benchmark Quote acceptance invalid.");
const agreementCreated = createDirectWorkAgreement({ agreementId: asDirectWorkAgreementId("benchmark-agreement"), request: submitted.value, quote: quoteAccepted.value, termsHash: HASH_TERMS });
if (!agreementCreated.ok) throw new Error("Benchmark Agreement fixture invalid.");
const requesterSigned = signDirectWorkAgreement(agreementCreated.value, "benchmark-requester", "REQUESTER");
if (!requesterSigned.ok) throw new Error("Benchmark requester signature invalid.");
const agreement = signDirectWorkAgreement(requesterSigned.value, "benchmark-creator", "CREATOR");
if (!agreement.ok) throw new Error("Benchmark creator signature invalid.");

function event(payment: DirectWorkPayment, type: DirectWorkPaymentEvent["type"], sequence: number, eventId: string): DirectWorkPaymentEvent {
  return { eventId: asDirectWorkPaymentEventId(eventId), paymentId: payment.paymentId, requestId: payment.requestId, sequence, type, fingerprint: HASH_EVENT, accountId: payment.requesterAccountId, quoteSnapshotHash: payment.quoteSnapshotHash, environment: payment.environment };
}

const iterations = 10000;
const started = performance.now();
let successful = 0;
for (let index = 0; index < iterations; index += 1) {
  const payment = createDirectWorkPayment({ paymentId: asDirectWorkPaymentId(`benchmark-payment-${index}`), request: submitted.value, agreement: agreement.value, quote: quoteAccepted.value, provider: "OPAQUE_PROVIDER", environment: "TEST" });
  if (!payment.ok) throw new Error("Benchmark Payment fixture invalid.");
  const reconciled = reconcileDirectWorkPayment(payment.value, [event(payment.value, "PAID", 2, `benchmark-paid-${index}`), event(payment.value, "AUTHORIZED", 1, `benchmark-authorized-${index}`)]);
  if (!reconciled.ok || reconciled.value.status !== "PAID") throw new Error("Benchmark Payment reconciliation failed.");
  successful += 1;
}
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({ schemaVersion: 1, benchmarkId: "WP220_DIRECT_WORK_PAYMENT_SYNTHETIC", status: "MEASURED_LOCAL_SYNTHETIC", iterations, successful, elapsedMs: Number(elapsedMs.toFixed(3)), operationsPerSecond: Number((iterations / Math.max(elapsedMs / 1000, Number.EPSILON)).toFixed(2)), notes: ["Pure Request/Quote/Agreement/Payment state projection; no provider, database, Storage, Notification, Market, or production data was accessed.", "This is not a real checkout, webhook, device, memory, or production performance PASS." ] }, null, 2));
