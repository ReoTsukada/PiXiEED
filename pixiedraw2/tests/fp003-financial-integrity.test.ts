import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict";
import {
  FP003_FINANCIAL_ACTION,
  FP003_FINANCIAL_CAPABILITY,
  FP003_FINANCIAL_RESOURCE_TYPE,
  FP003_FINANCIAL_SCHEMA_VERSION,
  asFinancialProviderEventId,
  asCollaborativeWorkId,
  asContributorSnapshotId,
  asProductRevisionId,
  createContributorSnapshot,
  createProductFingerprint,
  deriveCollaborativeRevenueAllocation,
  guardDuplicateProductFingerprint,
  materializeDirectWorkFinancialSettlement,
  materializeMarketFinancialSettlement,
  resolveFinancialAuthority,
  type FinancialAuthorityResolutionV1,
  type FinancialAuthorityResolver,
  type CollaborativeRevenueAuthorityV1,
  type ProductFingerprintV1,
  type VerifiedProviderEventV1,
} from "../src/fp003-financial-integrity-core.ts";
import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  asPackageId,
  asSha256,
  requireAuthorizationProofV1,
  type AuthorizationProofExpectation,
  type AuthorizationProofV1,
  type ContentHash,
} from "../src/wp160-contracts.ts";
import {
  asDirectWorkLedgerEntryId,
  asDirectWorkAgreementId,
  asDirectWorkPaymentEventId,
  asDirectWorkPaymentId,
  asDirectWorkQuoteId,
  asDirectWorkRequestId,
  acceptDirectWorkQuote,
  applyDirectWorkPaymentEvent,
  createDirectWorkAgreement,
  createDirectWorkLedgerEntry,
  createDirectWorkPayment,
  createDirectWorkQuote,
  createDirectWorkRequest,
  signDirectWorkAgreement,
  transitionDirectWorkRequest,
  type DirectWorkPayment,
  type DirectWorkPaymentEvent,
} from "../src/wp220-direct-work-core.ts";
import {
  asEntitlementId,
  asMarketProductId,
  asMarketPurchaseId,
  asMarketOrderId,
  asLicenseSnapshotId,
  asPaymentEventId,
  type LockedPackageReference,
  type MarketProductProjection,
  type PurchaseEvent,
  type PurchaseRecord,
} from "../src/wp210-market-rights-core.ts";

const HASH = asSha256("a".repeat(64));
const MONEY = { currency: "USD" as const, roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" as const };
const AUTH_ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
const AUTH_EXPIRES_AT = new Date(Date.now() + 4 * 60_000).toISOString();

function proofFor(resourceId: string, principalId = "finance-server"): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "authority-finance-test",
    proofId: `proof:${resourceId}`,
    principalId,
    resourceType: FP003_FINANCIAL_RESOURCE_TYPE,
    resourceId,
    action: FP003_FINANCIAL_ACTION,
    capability: FP003_FINANCIAL_CAPABILITY,
    tenantId: null,
    correlationId: null,
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant-finance-test",
    issuedAt: AUTH_ISSUED_AT,
    expiresAt: AUTH_EXPIRES_AT,
  };
}

function authorizationResolver(): (input: { readonly callerProof: AuthorizationProofV1; readonly expected: AuthorizationProofExpectation }) => AuthorizationProofV1 {
  return ({ expected }) => proofFor(String(expected.resourceId), "finance-server");
}

function workAuthorizationResolver(input: { readonly expected: AuthorizationProofExpectation }): AuthorizationProofV1 {
  return {
    ...proofFor(String(input.expected.resourceId), input.expected.principalId ?? "server-authority"),
    resourceType: input.expected.resourceType ?? "DIRECT_WORK_REQUEST",
    action: input.expected.action ?? "direct-work.operation",
    capability: input.expected.capability ?? "direct-work.operation",
  };
}

function packageReference(): LockedPackageReference {
  return {
    packageId: asPackageId("package:market-1"),
    packageVersion: "1.0.0",
    manifestHash: HASH,
    dependencySnapshotHash: HASH,
    contentHash: HASH,
    licenseSnapshotId: asLicenseSnapshotId("license:market-1"),
    licenseSnapshotHash: HASH,
    mode: "PINNED",
  };
}

function marketFixture(): {
  product: MarketProductProjection;
  purchase: PurchaseRecord;
  paymentEvent: PurchaseEvent;
  providerEvent: VerifiedProviderEventV1;
  authority: FinancialAuthorityResolutionV1;
} {
  const productId = asMarketProductId("product:1");
  const purchaseId = asMarketPurchaseId("purchase:1");
  const eventId = asPaymentEventId("provider-event:1");
  const lockedPackage = packageReference();
  const product: MarketProductProjection = {
    productId,
    package: lockedPackage,
    classification: "MATERIAL",
    publication: "PAID",
    status: "PUBLISHED",
    ownerAccountId: "creator:one",
    price: { amountMinor: 10_000, currency: "USD" },
    rights: ["PERSONAL_USE"],
    source: "CORE_PROJECTION",
  };
  const purchase: PurchaseRecord = {
    purchaseId,
    productId,
    orderId: asMarketOrderId("order:1"),
    buyerAccountId: "buyer:one",
    package: lockedPackage,
    amount: { amountMinor: 10_000, currency: "USD" },
    provider: "SYNTHETIC",
    lifecycle: "CHECKOUT_BOUND",
    appliedEvents: [],
  };
  const paymentEvent: PurchaseEvent = {
    eventId,
    purchaseId,
    sequence: 1,
    type: "PAID",
    payloadFingerprint: HASH,
    source: "CURRENT_WEBHOOK_FIXTURE",
  };
  const providerEvent: VerifiedProviderEventV1 = {
    schemaVersion: FP003_FINANCIAL_SCHEMA_VERSION,
    eventId: asFinancialProviderEventId(eventId),
    payloadFingerprint: HASH,
    sourceKind: "MARKET_PURCHASE",
    sourceId: purchaseId,
    eventType: "PAID",
    environment: "TEST",
  };
  const authority: FinancialAuthorityResolutionV1 = {
    schemaVersion: FP003_FINANCIAL_SCHEMA_VERSION,
    sourceKind: "MARKET_PURCHASE",
    sourceId: purchaseId,
    productId,
    purchaseId,
    providerEventId: providerEvent.eventId,
    payloadFingerprint: HASH,
    environment: "TEST",
    settlementState: "PAID",
    gross: { amountMinor: 10_000, ...MONEY },
    feeSchedule: {
      feeScheduleId: "fees:market:v1",
      feeScheduleVersion: "1",
      platformFeeBps: 1_000,
      royaltyRecipients: [
        { recipientAccountId: "creator:one", allocationBps: 5_000 },
        { recipientAccountId: "creator:two", allocationBps: 2_500 },
      ],
    },
  };
  return { product, purchase, paymentEvent, providerEvent, authority };
}

function marketInput(fixture = marketFixture(), authority = fixture.authority) {
  const authorityResolver: FinancialAuthorityResolver = () => authority;
  return {
    product: fixture.product,
    purchase: fixture.purchase,
    paymentEvents: [fixture.paymentEvent],
    entitlementId: asEntitlementId("entitlement:1"),
    providerEvent: fixture.providerEvent,
    canonicalPrincipalId: "finance-server",
    authorizationProof: proofFor(fixture.purchase.purchaseId),
    authorizationProofResolver: authorizationResolver(),
    authorityResolver,
  };
}

function directFixture(): {
  payment: DirectWorkPayment;
  sourceEvent: DirectWorkPaymentEvent;
  providerEvent: VerifiedProviderEventV1;
  authority: FinancialAuthorityResolutionV1;
} {
  const requestId = asDirectWorkRequestId("request:1");
  const paymentId = asDirectWorkPaymentId("payment:1");
  const eventId = asDirectWorkPaymentEventId("provider-event:direct-1");
  const quoteSnapshotHash = HASH;
  const requestResult = createDirectWorkRequest({
    requestId,
    requesterAccountId: "buyer:one",
    creatorAccountId: "creator:one",
    scopeHash: HASH,
    createdAt: AUTH_ISSUED_AT,
    recordVersion: 1,
    authorizationProof: workAuthorizationResolver({ expected: { principalId: "buyer:one", resourceType: "DIRECT_WORK_REQUEST", resourceId: requestId, action: "direct-work.request.create", capability: "direct-work.request.create" } }),
    authorizationProofResolver: workAuthorizationResolver,
  });
  if (!requestResult.ok) throw new Error("Direct Work request fixture must be canonical.");
  const submittedResult = transitionDirectWorkRequest(requestResult.value, "SUBMIT");
  if (!submittedResult.ok) throw new Error("Direct Work request fixture must be submitted.");
  const quoteResult = createDirectWorkQuote({
    quoteId: asDirectWorkQuoteId("quote:1"),
    request: submittedResult.value,
    creatorAccountId: "creator:one",
    lines: [{ lineId: "line:direct:1", deliverableHash: HASH, amount: { amountMinor: 2_500, ...MONEY } }],
    termsHash: HASH,
    royaltyRuleVersion: "direct-work-v1",
    authorizationProof: workAuthorizationResolver({ expected: { principalId: "creator:one", resourceType: "DIRECT_WORK_REQUEST", resourceId: requestId, action: "direct-work.quote.create", capability: "direct-work.quote.create" } }),
    authorizationProofResolver: workAuthorizationResolver,
  });
  if (!quoteResult.ok) throw new Error("Direct Work quote fixture must be canonical.");
  const acceptedQuote = acceptDirectWorkQuote(quoteResult.value, "buyer:one");
  if (!acceptedQuote.ok) throw new Error("Direct Work quote fixture must be accepted.");
  const agreementResult = createDirectWorkAgreement({ agreementId: asDirectWorkAgreementId("agreement:1"), request: submittedResult.value, quote: acceptedQuote.value, termsHash: HASH });
  if (!agreementResult.ok) throw new Error("Direct Work agreement fixture must be canonical.");
  const requesterSigned = signDirectWorkAgreement(agreementResult.value, "buyer:one", "REQUESTER");
  if (!requesterSigned.ok) throw new Error("Direct Work requester signature fixture must be canonical.");
  const agreement = signDirectWorkAgreement(requesterSigned.value, "creator:one", "CREATOR");
  if (!agreement.ok) throw new Error("Direct Work creator signature fixture must be canonical.");
  const paymentResult = createDirectWorkPayment({ paymentId, request: submittedResult.value, agreement: agreement.value, quote: acceptedQuote.value, provider: "CURRENT_SERVER", environment: "TEST" });
  if (!paymentResult.ok) throw new Error("Direct Work payment fixture must be canonical.");
  const authorized = applyDirectWorkPaymentEvent(paymentResult.value, {
    eventId: asDirectWorkPaymentEventId("provider-event:direct-authorized"),
    paymentId,
    requestId,
    sequence: 1,
    type: "AUTHORIZED",
    fingerprint: HASH,
    accountId: "buyer:one",
    quoteSnapshotHash: HASH,
    environment: "TEST",
  });
  if (!authorized.ok) throw new Error("Direct Work authorization fixture must be canonical.");
  const payment = applyDirectWorkPaymentEvent(authorized.value, {
    eventId,
    paymentId,
    requestId,
    sequence: 2,
    type: "PAID",
    fingerprint: HASH,
    accountId: "buyer:one",
    quoteSnapshotHash: HASH,
    environment: "TEST",
  });
  if (!payment.ok) throw new Error("Direct Work paid fixture must be canonical.");
  const sourceEvent: DirectWorkPaymentEvent = {
    eventId,
    paymentId,
    requestId,
    sequence: 2,
    type: "PAID",
    fingerprint: HASH,
    accountId: "buyer:one",
    quoteSnapshotHash,
    environment: "TEST",
  };
  const providerEvent: VerifiedProviderEventV1 = {
    schemaVersion: FP003_FINANCIAL_SCHEMA_VERSION,
    eventId: asFinancialProviderEventId(eventId),
    payloadFingerprint: HASH,
    sourceKind: "DIRECT_WORK_PAYMENT",
    sourceId: paymentId,
    eventType: "PAID",
    environment: "TEST",
  };
  const authority: FinancialAuthorityResolutionV1 = {
    schemaVersion: FP003_FINANCIAL_SCHEMA_VERSION,
    sourceKind: "DIRECT_WORK_PAYMENT",
    sourceId: paymentId,
    requestId,
    paymentId,
    providerEventId: providerEvent.eventId,
    payloadFingerprint: HASH,
    environment: "TEST",
    settlementState: "PAID",
    gross: { amountMinor: 2_500, ...MONEY },
    feeSchedule: {
      feeScheduleId: "fees:direct-work:v1",
      feeScheduleVersion: "1",
      platformFeeBps: 500,
      royaltyRecipients: [{ recipientAccountId: "creator:one", allocationBps: 8_000 }],
    },
  };
  return { payment: payment.value, sourceEvent, providerEvent, authority };
}

Deno.test("FP-003 derives deterministic Market royalty and License binding from server authority", async () => {
  const fixture = marketFixture();
  const result = await materializeMarketFinancialSettlement(marketInput(fixture));
  assert(result.ok);
  assertEquals(result.value.purchase.lifecycle, "PAID");
  assertEquals(result.value.ledgerEntries.map((entry) => entry.amountMinor), [5_000, 2_500]);
  assertEquals(result.value.ledgerEntries.map((entry) => entry.creatorAccountId), ["creator:one", "creator:two"]);
  assertEquals(result.value.license.productId, fixture.product.productId);
  assertEquals(result.value.entitlement?.entitlementId, "entitlement:1");
});

Deno.test("FP-003 derives Direct Work Ledger amount/type/direction from Payment Event", async () => {
  const fixture = directFixture();
  const result = await materializeDirectWorkFinancialSettlement({
    payment: fixture.payment,
    sourceEvent: fixture.sourceEvent,
    providerEvent: fixture.providerEvent,
    canonicalPrincipalId: "finance-server",
    authorizationProof: proofFor(fixture.payment.paymentId),
    authorizationProofResolver: authorizationResolver(),
    authorityResolver: () => fixture.authority,
  });
  assert(result.ok);
  assertEquals(result.value.ledgerEntry.entryType, "SALE");
  assertEquals(result.value.ledgerEntry.direction, "CREDIT");
  assertEquals(result.value.ledgerEntry.amount.amountMinor, 2_500);
  assertEquals(result.value.allocations[0]?.amount.amountMinor, 2_000);
});

Deno.test("FP-003 rejects fabricated or unsealed Direct Work Payment before Ledger projection", async () => {
  const fixture = directFixture();
  const fabricatedPayment = { ...fixture.payment };
  const result = await materializeDirectWorkFinancialSettlement({
    payment: fabricatedPayment,
    sourceEvent: fixture.sourceEvent,
    providerEvent: fixture.providerEvent,
    canonicalPrincipalId: "finance-server",
    authorizationProof: proofFor(fixture.payment.paymentId),
    authorizationProofResolver: authorizationResolver(),
    authorityResolver: () => fixture.authority,
  });
  assert(!result.ok);
  assertEquals(result.diagnostics[0]?.code, "LEDGER_INVALID");
});

Deno.test("FP-003 rejects every caller-controlled financial field", () => {
  const fixture = marketFixture();
  for (const callerFinancialInput of [
    { amountMinor: 1 },
    { currency: "JPY" },
    { recipientAccountId: "attacker" },
    { royaltyRateBps: 9_999 },
    { entryType: "ADJUSTMENT" },
    { direction: "DEBIT" },
  ]) {
    const result = resolveFinancialAuthority({ ...marketInput(fixture), callerFinancialInput });
    assert(!result.ok);
    assertEquals(result.diagnostics[0]?.code, "CALLER_FINANCIAL_INPUT_REJECTED");
  }
});

Deno.test("FP-003 rejects cross-record, Provider Event, Money, and Fee Schedule attacks", async () => {
  const fixture = marketFixture();
  const wrongProduct = { ...fixture.product, productId: asMarketProductId("product:other") };
  const crossRecord = await materializeMarketFinancialSettlement({ ...marketInput(fixture), product: wrongProduct });
  assert(!crossRecord.ok);
  assertEquals(crossRecord.diagnostics[0]?.code, "PURCHASE_BINDING_MISMATCH");

  const wrongEventAuthority = { ...fixture.authority, providerEventId: asFinancialProviderEventId("provider-event:other") };
  const wrongEvent = await materializeMarketFinancialSettlement(marketInput(fixture, wrongEventAuthority));
  assert(!wrongEvent.ok);
  assertEquals(wrongEvent.diagnostics[0]?.code, "PROVIDER_EVENT_INVALID");

  const wrongCurrency = await resolveFinancialAuthority({ ...marketInput(fixture), authorityResolver: () => ({ ...fixture.authority, gross: { amountMinor: 10_000, currency: "XXX", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" } }) });
  assert(!wrongCurrency.ok);
  assertEquals(wrongCurrency.diagnostics[0]?.code, "MONEY_INVALID");

  for (const amountMinor of [-1, Number.MAX_SAFE_INTEGER + 1]) {
    const wrongAmount = await resolveFinancialAuthority({ ...marketInput(fixture), authorityResolver: () => ({ ...fixture.authority, gross: { amountMinor, ...MONEY } }) });
    assert(!wrongAmount.ok);
    assertEquals(wrongAmount.diagnostics[0]?.code, "MONEY_INVALID");
  }

  const wrongBps = await resolveFinancialAuthority({ ...marketInput(fixture), authorityResolver: () => ({ ...fixture.authority, feeSchedule: { ...fixture.authority.feeSchedule, platformFeeBps: 9_000, royaltyRecipients: [{ recipientAccountId: "creator:one", allocationBps: 2_000 }] } }) });
  assert(!wrongBps.ok);
  assertEquals(wrongBps.diagnostics[0]?.code, "FEE_SCHEDULE_INVALID");
});

Deno.test("FP-003 rejects Direct Work Ledger entry overrides and unverified duplicate identity", async () => {
  const fixture = directFixture();
  const override = await createDirectWorkLedgerEntry({
    ledgerEntryId: asDirectWorkLedgerEntryId("ledger:override"),
    payment: fixture.payment,
    sourceEvent: fixture.sourceEvent,
    entryType: "ADJUSTMENT",
    direction: "DEBIT",
    amount: { amountMinor: 1, ...MONEY },
  });
  assert(!override.ok);
  assertEquals(override.diagnostics[0]?.code, "LEDGER_INVALID");

  const market = marketFixture();
  const duplicateResult = await materializeMarketFinancialSettlement({ ...marketInput(market), paymentEvents: [market.paymentEvent, market.paymentEvent] });
  assert(duplicateResult.ok);
  assertEquals(duplicateResult.value.ledgerEntries.length, 2);

  const mismatchedProof = await resolveFinancialAuthority({ ...marketInput(market), authorizationProof: proofFor("purchase:other") });
  assert(!mismatchedProof.ok);
  assertEquals(mismatchedProof.diagnostics[0]?.code, "PERMISSION_DENIED");
});

async function collaborativeFixture(): Promise<{ authority: CollaborativeRevenueAuthorityV1; fingerprint: ProductFingerprintV1 }> {
  const snapshot = await createContributorSnapshot({
    snapshotId: asContributorSnapshotId("snapshot:work-1:v1"),
    collaborativeWorkId: asCollaborativeWorkId("collaborative-work:1"),
    contributors: [
      { contributorId: "creator:a", allocationOrder: 0 },
      { contributorId: "creator:b", allocationOrder: 1 },
      { contributorId: "creator:c", allocationOrder: 2 },
      { contributorId: "creator:d", allocationOrder: 3 },
    ],
  });
  assert(snapshot.ok);
  const fingerprint = await createProductFingerprint({
    collaborativeWorkId: asCollaborativeWorkId("collaborative-work:1"),
    includedAssetRevisionSet: ["asset-revision:art", "asset-revision:audio"],
    deliveryFormat: "PACKAGE",
    saleType: "COMPLETED_WORK",
    licenseSnapshotId: "license:collaborative:1",
    licenseSemanticHash: HASH,
    sourceIncluded: true,
  });
  assert(fingerprint.ok);
  const authority: CollaborativeRevenueAuthorityV1 = {
    schemaVersion: "COLLABORATIVE_COMMERCE_V1",
    collaborativeWorkId: asCollaborativeWorkId("collaborative-work:1"),
    productId: asMarketProductId("product:collaborative:1"),
    productRevisionId: asProductRevisionId("product-revision:collaborative:1"),
    productLeadId: "creator:a",
    contributorSnapshot: snapshot.value,
    canonicalContributorSnapshotHash: snapshot.value.snapshotHash,
    productFingerprint: fingerprint.value,
    gross: { amountMinor: 101, ...MONEY },
    deductions: [
      { deductionId: "deduction:provider", sourceId: "provider:stripe", kind: "PAYMENT_PROVIDER_FEE", amount: { amountMinor: 10, ...MONEY } },
      { deductionId: "deduction:pixieed", sourceId: "pixieed:fee", kind: "PIXIEED_FEE", amount: { amountMinor: 15, ...MONEY } },
      { deductionId: "deduction:external", sourceId: "asset:external", kind: "EXTERNAL_ASSET_FEE", amount: { amountMinor: 5, ...MONEY } },
      { deductionId: "deduction:parent", sourceId: "product:parent", kind: "PARENT_DERIVATIVE_ROYALTY", amount: { amountMinor: 10, ...MONEY } },
    ],
  };
  return { authority, fingerprint: fingerprint.value };
}

Deno.test("FP-003 Collaborative Commerce locks the shared Snapshot and splits Net Pool equally", async () => {
  const fixture = await collaborativeFixture();
  const result = await deriveCollaborativeRevenueAllocation({ authority: fixture.authority });
  assert(result.ok);
  assertEquals(result.value.map((allocation) => allocation.contributorId), ["creator:a", "creator:b", "creator:c", "creator:d"]);
  assertEquals(result.value.map((allocation) => allocation.amount.amountMinor), [16, 15, 15, 15]);
  assertEquals(result.value[0]?.deductionsTotal.amountMinor, 40);
  assertEquals(result.value[0]?.netContributorPool.amountMinor, 61);
  assertEquals(result.value.every((allocation) => allocation.productLeadId === "creator:a" && allocation.policy === "EQUAL_AFTER_DEDUCTIONS_V1"), true);
});

Deno.test("FP-003 Collaborative Commerce rejects Lead/Contributor/Fingerprint overrides and duplicate Products", async () => {
  const fixture = await collaborativeFixture();
  for (const callerOverrides of [
    { productLeadId: "attacker" },
    { contributorSnapshot: ["creator:a"] },
    { revenueOwnerId: "attacker" },
    { productFingerprint: "different" },
  ]) {
    const result = await deriveCollaborativeRevenueAllocation({ authority: fixture.authority, callerOverrides });
    assert(!result.ok);
    assertEquals(result.diagnostics[0]?.code, "COLLABORATIVE_OVERRIDE_REJECTED");
  }
  const duplicate = await guardDuplicateProductFingerprint(fixture.fingerprint, [fixture.fingerprint]);
  assert(!duplicate.ok);
  assertEquals(duplicate.diagnostics[0]?.code, "DUPLICATE_PRODUCT");
  const differentProduct = await createProductFingerprint({
    collaborativeWorkId: fixture.fingerprint.collaborativeWorkId,
    includedAssetRevisionSet: fixture.fingerprint.includedAssetRevisionSet,
    deliveryFormat: "OST",
    saleType: fixture.fingerprint.saleType,
    licenseSnapshotId: fixture.fingerprint.licenseSnapshotId,
    licenseSemanticHash: fixture.fingerprint.licenseSemanticHash,
    sourceIncluded: fixture.fingerprint.sourceIncluded,
  });
  assert(differentProduct.ok);
  const allowed = await guardDuplicateProductFingerprint(differentProduct.value, [fixture.fingerprint]);
  assert(allowed.ok);
  const productB = await deriveCollaborativeRevenueAllocation({ authority: { ...fixture.authority, productId: asMarketProductId("product:collaborative:2"), productRevisionId: asProductRevisionId("product-revision:collaborative:2"), productFingerprint: differentProduct.value } });
  assert(productB.ok);
  assertEquals(productB.value[0]?.contributorSnapshotHash, fixture.authority.contributorSnapshot.snapshotHash);
  assertEquals(productB.value.map((allocation) => allocation.amount.amountMinor), [16, 15, 15, 15]);
});

Deno.test("FP-003 Collaborative Commerce keeps Lead changes allocation-neutral and rejects currency/deduction attacks", async () => {
  const fixture = await collaborativeFixture();
  const changedLead = await deriveCollaborativeRevenueAllocation({ authority: { ...fixture.authority, productLeadId: "creator:d" } });
  assert(changedLead.ok);
  const original = await deriveCollaborativeRevenueAllocation({ authority: fixture.authority });
  assert(original.ok);
  assertEquals(changedLead.value.map((allocation) => allocation.amount.amountMinor), original.value.map((allocation) => allocation.amount.amountMinor));

  const currencyAttack = await deriveCollaborativeRevenueAllocation({ authority: { ...fixture.authority, deductions: [{ ...fixture.authority.deductions[0]!, amount: { amountMinor: 1, currency: "JPY", roundingPolicyVersion: "MINOR_UNIT_REJECT_V1" } }] } });
  assert(!currencyAttack.ok);
  assertEquals(currencyAttack.diagnostics.some((diagnostic) => diagnostic.code === "DEDUCTION_INVALID"), true);

  const lateContributorSnapshot = await createContributorSnapshot({
    snapshotId: asContributorSnapshotId("snapshot:work-1:v2"),
    collaborativeWorkId: fixture.authority.collaborativeWorkId,
    contributors: [...fixture.authority.contributorSnapshot.contributors, { contributorId: "creator:e", allocationOrder: 4 }],
  });
  assert(lateContributorSnapshot.ok);
  const historicalAuthority = await deriveCollaborativeRevenueAllocation({ authority: { ...fixture.authority, contributorSnapshot: lateContributorSnapshot.value } });
  assert(!historicalAuthority.ok);
  assertEquals(historicalAuthority.diagnostics[0]?.code, "COLLABORATIVE_SNAPSHOT_INVALID");
  const historicalOverride = await deriveCollaborativeRevenueAllocation({ authority: fixture.authority, callerOverrides: { contributorSnapshot: lateContributorSnapshot.value } });
  assert(!historicalOverride.ok);
  assertEquals(historicalOverride.diagnostics[0]?.code, "COLLABORATIVE_OVERRIDE_REJECTED");
});

Deno.test("FP-003Y rejects checked deduction overflow instead of clamping or rounding", async () => {
  const fixture = await collaborativeFixture();
  const overflow = await deriveCollaborativeRevenueAllocation({
    authority: {
      ...fixture.authority,
      gross: { amountMinor: Number.MAX_SAFE_INTEGER, ...MONEY },
      deductions: [
        { deductionId: "deduction:overflow-a", sourceId: "source:overflow-a", kind: "PAYMENT_PROVIDER_FEE", amount: { amountMinor: Number.MAX_SAFE_INTEGER, ...MONEY } },
        { deductionId: "deduction:overflow-b", sourceId: "source:overflow-b", kind: "PIXIEED_FEE", amount: { amountMinor: 1, ...MONEY } },
      ],
    },
  });
  assert(!overflow.ok);
  assertEquals(overflow.diagnostics.some((diagnostic) => diagnostic.code === "MONEY_OVERFLOW"), true);
});

Deno.test("FP-003 normalizes Product Fingerprint attacks and rejects future-issued Proofs", async () => {
  const fixture = await collaborativeFixture();
  const reordered = await createProductFingerprint({
    collaborativeWorkId: fixture.fingerprint.collaborativeWorkId,
    includedAssetRevisionSet: [...fixture.fingerprint.includedAssetRevisionSet].reverse(),
    deliveryFormat: fixture.fingerprint.deliveryFormat,
    saleType: fixture.fingerprint.saleType,
    licenseSnapshotId: "license:collaborative:alias",
    licenseSemanticHash: fixture.fingerprint.licenseSemanticHash,
    sourceIncluded: fixture.fingerprint.sourceIncluded,
  });
  assert(reordered.ok);
  const duplicate = await guardDuplicateProductFingerprint(reordered.value, [fixture.fingerprint]);
  assert(!duplicate.ok && duplicate.diagnostics[0]?.code === "DUPLICATE_PRODUCT");

  const repeatedRevision = await createProductFingerprint({
    collaborativeWorkId: fixture.fingerprint.collaborativeWorkId,
    includedAssetRevisionSet: [...fixture.fingerprint.includedAssetRevisionSet, fixture.fingerprint.includedAssetRevisionSet[0]!],
    deliveryFormat: fixture.fingerprint.deliveryFormat,
    saleType: fixture.fingerprint.saleType,
    licenseSnapshotId: fixture.fingerprint.licenseSnapshotId,
    licenseSemanticHash: fixture.fingerprint.licenseSemanticHash,
    sourceIncluded: fixture.fingerprint.sourceIncluded,
  });
  assert(!repeatedRevision.ok);

  const invalidSourceFlag = await createProductFingerprint({ ...fixture.fingerprint, sourceIncluded: "true" as never });
  assert(!invalidSourceFlag.ok);

  let futureIssuedAccepted = false;
  try {
    requireAuthorizationProofV1({
      ...proofFor("future-proof"),
      issuedAt: "2099-08-10T00:00:00.000Z",
      expiresAt: "2099-08-10T00:05:00.000Z",
    });
    futureIssuedAccepted = true;
  } catch {
    futureIssuedAccepted = false;
  }
  assert(!futureIssuedAccepted, "A future-issued AuthorizationProof must be denied");
});
