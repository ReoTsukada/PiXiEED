import {
  deepStrictEqual,
  equal,
  notEqual,
  ok,
  throws,
} from "node:assert/strict";
import {
  asPackageId,
  asSha256,
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofExpectation,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
} from "../../src/wp160-contracts.ts";
import {
  asEntitlementId,
  asLicenseSnapshotId,
  asMarketOrderId,
  asMarketProductId,
  asMarketPurchaseId,
  asPaymentEventId,
  createProductProjection,
  createPurchaseRecord,
  type LockedPackageReference,
  type MarketProductProjection,
  type PurchaseEvent,
  type PurchaseRecord,
} from "../../src/wp210-market-rights-core.ts";
import {
  asCollaborativeWorkId,
  asContributorSnapshotId,
  asFinancialProviderEventId,
  asProductRevisionId,
  type CollaborativeRevenueAuthorityV1,
  CONTRIBUTOR_SNAPSHOT_SCHEMA_VERSION,
  createContributorSnapshot,
  createProductFingerprint,
  type FinancialAuthorityResolutionV1,
  FP003_FINANCIAL_ACTION,
  FP003_FINANCIAL_CAPABILITY,
  FP003_FINANCIAL_RESOURCE_TYPE,
  FP003_FINANCIAL_SCHEMA_VERSION,
  type ProductFingerprintV1,
  type VerifiedProviderEventV1,
} from "../../src/fp003-financial-integrity-core.ts";
import {
  auditSafeMarket410Result,
  createInMemoryMarket410Registry,
  DEFAULT_MARKET410_FEATURE_FLAGS,
  InMemoryMarket410Registry,
  MARKET410_CONTRIBUTOR_SNAPSHOT_CONFLICT_ERROR,
  type Market410CollaborativeRecord,
  Market410Composition,
  market410FeatureEnabled,
  type Market410ProductRecord,
  type Market410ProviderRecord,
  type Market410PurchaseRecord,
  type Market410RegistrySeed,
  type Market410SettlementRequest,
} from "../../src/platform/market-410/composition.ts";

const HASH_A = asSha256("a".repeat(64));
const HASH_B = asSha256("b".repeat(64));
const HASH_C = asSha256("c".repeat(64));
const HASH_D = asSha256("d".repeat(64));
const TENANT = "tenant:market410";
const CREATOR = "creator:market410";
const BUYER = "buyer:market410";
const PRODUCT_ID = asMarketProductId("product:market410");
const PURCHASE_ID = asMarketPurchaseId("purchase:market410");
const PACKAGE_ID = asPackageId("package:market410");
const LICENSE_ID = asLicenseSnapshotId("license:market410");
const PAID_EVENT_ID = asFinancialProviderEventId(
  "provider-event:market410:paid",
);

function proof(
  expected: AuthorizationProofExpectation,
  overrides: Partial<AuthorizationProofV1> = {},
): AuthorizationProofV1 {
  const now = Date.now();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "market410-test-caller",
    proofId: `proof:market410:${expected.resourceId ?? "resource"}`,
    principalId: expected.principalId ?? BUYER,
    resourceType: expected.resourceType ?? FP003_FINANCIAL_RESOURCE_TYPE,
    resourceId: expected.resourceId ?? String(PURCHASE_ID),
    action: expected.action ?? FP003_FINANCIAL_ACTION,
    capability: expected.capability ?? FP003_FINANCIAL_CAPABILITY,
    tenantId: expected.tenantId ?? TENANT,
    correlationId: null,
    policyVersion: expected.policyVersion ?? AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant:market410:test",
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 30 * 60 * 1_000).toISOString(),
    ...overrides,
  };
}

const proofResolver: AuthorizationProofResolver = ({ expected }) =>
  proof(expected);

const lockedPackage: LockedPackageReference = {
  packageId: PACKAGE_ID,
  packageVersion: "1.0.0",
  manifestHash: HASH_A,
  dependencySnapshotHash: HASH_B,
  contentHash: HASH_C,
  licenseSnapshotId: LICENSE_ID,
  licenseSnapshotHash: HASH_D,
  mode: "PINNED",
};

const productInput = {
  productId: PRODUCT_ID,
  package: lockedPackage,
  classification: "MATERIAL" as const,
  publication: "PAID" as const,
  status: "PUBLISHED" as const,
  ownerAccountId: CREATOR,
  legacyUrl: "/market/items/market410",
  price: { amountMinor: 100, currency: "JPY" },
  rights: ["PERSONAL_USE", "COMMERCIAL_USE"] as const,
};

const productResult = createProductProjection({
  ...productInput,
  authorizationProof: proof({
    principalId: CREATOR,
    resourceType: "MARKET_PRODUCT",
    resourceId: PRODUCT_ID,
    action: "market.product.project",
    capability: "market.product.project",
    tenantId: TENANT,
  }),
  authorizationProofResolver: proofResolver,
});
if (!productResult.ok) {
  throw new Error("MARKET-410 Product fixture is invalid.");
}
const product: MarketProductProjection = productResult.value;

const purchaseResult = createPurchaseRecord({
  purchaseId: PURCHASE_ID,
  productId: PRODUCT_ID,
  orderId: asMarketOrderId("order:market410"),
  buyerAccountId: BUYER,
  package: lockedPackage,
  amount: { amountMinor: 100, currency: "JPY" },
  provider: "SYNTHETIC",
  authorizationProof: proof({
    principalId: BUYER,
    resourceType: "MARKET_PURCHASE",
    resourceId: PURCHASE_ID,
    action: "market.purchase.create",
    capability: "market.purchase.create",
    tenantId: TENANT,
  }),
  authorizationProofResolver: proofResolver,
});
if (!purchaseResult.ok) {
  throw new Error("MARKET-410 Purchase fixture is invalid.");
}
const purchase: PurchaseRecord = purchaseResult.value;

const paidProviderEvent: VerifiedProviderEventV1 = {
  schemaVersion: FP003_FINANCIAL_SCHEMA_VERSION,
  eventId: PAID_EVENT_ID,
  payloadFingerprint: HASH_A,
  sourceKind: "MARKET_PURCHASE",
  sourceId: PURCHASE_ID,
  eventType: "PAID",
  environment: "TEST",
};

const paidAuthority: FinancialAuthorityResolutionV1 = {
  schemaVersion: FP003_FINANCIAL_SCHEMA_VERSION,
  sourceKind: "MARKET_PURCHASE",
  sourceId: PURCHASE_ID,
  productId: PRODUCT_ID,
  purchaseId: PURCHASE_ID,
  providerEventId: PAID_EVENT_ID,
  payloadFingerprint: HASH_A,
  environment: "TEST",
  settlementState: "PAID",
  gross: {
    amountMinor: 100,
    currency: "JPY",
    roundingPolicyVersion: "MINOR_UNIT_REJECT_V1",
  },
  feeSchedule: {
    feeScheduleId: "fee-schedule:market410:v1",
    feeScheduleVersion: "1",
    platformFeeBps: 1_000,
    royaltyRecipients: [{ recipientAccountId: CREATOR, allocationBps: 8_000 }],
  },
};

const checkoutEvent: PurchaseEvent = {
  eventId: asPaymentEventId("checkout-event:market410"),
  purchaseId: PURCHASE_ID,
  sequence: 1,
  type: "CHECKOUT_BOUND",
  payloadFingerprint: HASH_B,
  source: "CURRENT_WEBHOOK_FIXTURE",
};

const paidPurchaseEvent: PurchaseEvent = {
  eventId: asPaymentEventId(PAID_EVENT_ID),
  purchaseId: PURCHASE_ID,
  sequence: 2,
  type: "PAID",
  payloadFingerprint: HASH_A,
  source: "CURRENT_WEBHOOK_FIXTURE",
};

const rights = {
  entitlementId: asEntitlementId("entitlement:market410"),
  productId: PRODUCT_ID,
  package: lockedPackage,
  licenseSnapshotId: LICENSE_ID,
  licenseSnapshotHash: HASH_D,
  rights: product.rights,
} as const;

const productRecord: Market410ProductRecord = {
  productRevision: "product-revision:1",
  packageRevision: "package-revision:1",
  tenantId: TENANT,
  environment: "TEST",
  permission: "ALLOW",
  product,
};

const purchaseRecord: Market410PurchaseRecord = {
  purchaseRevision: "purchase-revision:1",
  packageRevision: "package-revision:1",
  tenantId: TENANT,
  environment: "TEST",
  permission: "ALLOW",
  buyerPrincipalId: BUYER,
  purchase,
  rights,
  ledger: {
    purchaseId: PURCHASE_ID,
    recipientAccountIds: [CREATOR],
  },
};

const providerRecord: Market410ProviderRecord = {
  tenantId: TENANT,
  environment: "TEST",
  productRevision: productRecord.productRevision,
  packageRevision: productRecord.packageRevision,
  providerEvent: paidProviderEvent,
  authority: paidAuthority,
};

function baseSeed(
  extra: Partial<Market410RegistrySeed> = {},
): Market410RegistrySeed {
  return {
    products: extra.products ?? [productRecord],
    purchases: extra.purchases ?? [purchaseRecord],
    providers: extra.providers ?? [providerRecord],
    collaborative: extra.collaborative ?? [],
  };
}

function settlementProof(
  overrides: Partial<AuthorizationProofV1> = {},
): AuthorizationProofV1 {
  return proof(
    {
      principalId: BUYER,
      resourceType: FP003_FINANCIAL_RESOURCE_TYPE,
      resourceId: PURCHASE_ID,
      action: FP003_FINANCIAL_ACTION,
      capability: FP003_FINANCIAL_CAPABILITY,
      tenantId: TENANT,
      policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    },
    overrides,
  );
}

function settlementRequest(
  overrides: Partial<Market410SettlementRequest> = {},
): Market410SettlementRequest {
  return {
    productId: PRODUCT_ID,
    productRevision: productRecord.productRevision,
    packageRevision: productRecord.packageRevision,
    purchaseId: PURCHASE_ID,
    purchaseRevision: purchaseRecord.purchaseRevision,
    providerEvent: paidProviderEvent,
    purchaseEvents: [checkoutEvent, paidPurchaseEvent],
    authorizationProof: settlementProof(),
    ...overrides,
  };
}

function composition(
  seed: Market410RegistrySeed = baseSeed(),
  options: {
    readonly flags?: Record<string, boolean | undefined>;
    readonly killSwitch?: boolean;
  } = {
    flags: {
      ...DEFAULT_MARKET410_FEATURE_FLAGS,
      "market-410-settlement": true,
      "market-410-collaboration": true,
    },
  },
): Market410Composition {
  return new Market410Composition(
    createInMemoryMarket410Registry(seed),
    options,
  );
}

Deno.test("MARKET410-SCOPE-001 composes server Product/Package/price/fee authority and causal rights", async () => {
  const market = composition();
  const held = await market.settle(
    settlementRequest({ purchaseEvents: [paidPurchaseEvent] }),
  );
  ok(held.ok);
  equal(held.value.status, "HELD_OUT_OF_ORDER");
  equal(
    "settlement" in held.value ? held.value.settlement : undefined,
    undefined,
  );

  const applied = await market.settle(settlementRequest());
  ok(applied.ok);
  equal(applied.value.status, "APPLIED");
  ok(applied.value.settlement?.entitlement !== undefined);
  equal(applied.value.settlement?.license.status, "ACTIVE");
  equal(applied.value.settlement?.purchase.lifecycle, "PAID");
  equal(applied.value.settlement?.ledgerEntries[0]?.amountMinor, 80);
  equal(applied.value.settlement?.ledgerEntries[0]?.currency, "JPY");
  deepStrictEqual(applied.value.settlement?.causalOrder, [
    "PRODUCT",
    "PACKAGE_LOCK",
    "PURCHASE",
    "CHECKOUT_BOUND",
    "PAID",
    "ENTITLEMENT",
    "LICENSE",
    "LEDGER",
  ]);
});

Deno.test("MARKET410-SCOPE-001 ignores no caller financial authority and rejects every financial hint", async () => {
  for (
    const field of [
      { amountMinor: 1 },
      { currency: "USD" },
      { recipientAccountId: "attacker" },
      { royaltyRateBps: 10_000 },
      { entryType: "CREDIT" },
      { direction: "DEBIT" },
    ]
  ) {
    const result = await composition().settle(settlementRequest({
      callerFinancialInput: field,
    }));
    ok(!result.ok);
    equal(result.diagnostics[0]?.code, "CALLER_FINANCIAL_INPUT_REJECTED");
  }
});

Deno.test("MARKET410-SCOPE-001 binds AuthorizationProof, Product/Purchase locks, and ProviderEvent identity", async () => {
  const wrongTenant = await composition().settle(settlementRequest({
    authorizationProof: settlementProof({ tenantId: "tenant:attacker" }),
  }));
  ok(!wrongTenant.ok);
  equal(wrongTenant.diagnostics[0]?.code, "AUTHORIZATION_PROOF_MISMATCH");

  const wrongProvider = await composition().settle(settlementRequest({
    providerEvent: { ...paidProviderEvent, sourceId: "purchase:other" },
  }));
  ok(!wrongProvider.ok);
  equal(wrongProvider.diagnostics[0]?.code, "PROVIDER_EVENT_INVALID");

  const otherProduct: Market410ProductRecord = {
    ...productRecord,
    product: { ...product, productId: asMarketProductId("product:other") },
  };
  const crossRecord = await composition(
    baseSeed({ products: [productRecord, otherProduct] }),
  ).settle(
    settlementRequest({ productId: otherProduct.product.productId }),
  );
  ok(!crossRecord.ok);
  equal(crossRecord.diagnostics[0]?.code, "LOCK_MISMATCH");

  const staleRevision = await composition().settle(settlementRequest({
    productRevision: "product-revision:stale",
  }));
  ok(!staleRevision.ok);
  equal(staleRevision.diagnostics[0]?.code, "REGISTRY_REVISION_MISMATCH");
});

Deno.test("MARKET410-SCOPE-001 provider identity is idempotent, conflicting, and replay-safe", async () => {
  const market = composition();
  const first = await market.settle(settlementRequest());
  ok(first.ok);
  ok(first.value.settlement !== undefined);
  const replay = await market.settle(settlementRequest({ purchaseEvents: [] }));
  ok(replay.ok);
  equal(replay.value.status, "IDEMPOTENT_NOOP");
  equal(replay.value.changed, false);
  equal(replay.value.settlement?.ledgerEntries.length, 1);
  equal(
    replay.value.settlement?.entitlement?.entitlementId,
    rights.entitlementId,
  );
  equal(replay.value.settlement?.license.licenseSnapshotId, LICENSE_ID);

  const conflict = await market.settle(settlementRequest({
    providerEvent: { ...paidProviderEvent, payloadFingerprint: HASH_B },
  }));
  ok(!conflict.ok);
  equal(conflict.diagnostics[0]?.code, "PROVIDER_EVENT_CONFLICT");
});

Deno.test("MARKET410-SCOPE-001 quarantines a Provider Event ID after payload conflict", async () => {
  const market = composition();
  const applied = await market.settle(settlementRequest());
  ok(applied.ok);

  const conflict = await market.settle(settlementRequest({
    providerEvent: { ...paidProviderEvent, payloadFingerprint: HASH_B },
  }));
  ok(!conflict.ok);
  equal(conflict.diagnostics[0]?.code, "PROVIDER_EVENT_CONFLICT");

  const originalReplay = await market.settle(settlementRequest());
  ok(!originalReplay.ok);
  equal(originalReplay.diagnostics[0]?.code, "PROVIDER_EVENT_CONFLICT");
  equal(originalReplay.diagnostics[0]?.path, "providerEvent.eventId");
  equal(
    originalReplay.diagnostics[0]?.message,
    "The Provider Event ID is quarantined after a payload conflict; replay and settlement are forbidden.",
  );
});

Deno.test("MARKET410-SCOPE-001 feature flags default off, unknown off, and kill switch wins", async () => {
  const defaultOff = await new Market410Composition(
    createInMemoryMarket410Registry(baseSeed()),
  ).settle(settlementRequest());
  ok(!defaultOff.ok);
  equal(defaultOff.diagnostics[0]?.code, "FEATURE_DISABLED");

  const unknown = market410FeatureEnabled(
    { "market-410-future": true },
    "market-410-future",
    false,
  );
  ok(!unknown.ok);
  equal(unknown.diagnostics[0]?.code, "UNKNOWN_FLAG");

  const kill = market410FeatureEnabled(
    { ...DEFAULT_MARKET410_FEATURE_FLAGS, "market-410-settlement": true },
    "market-410-settlement",
    true,
  );
  ok(!kill.ok);
  equal(kill.diagnostics[0]?.code, "KILL_SWITCH_ACTIVE");
});

Deno.test("MARKET410-SCOPE-001 permission, tenant, and environment mismatch fail closed", async () => {
  const deniedPurchase: Market410PurchaseRecord = {
    ...purchaseRecord,
    permission: "DENY",
  };
  const denied = await composition(baseSeed({ purchases: [deniedPurchase] }))
    .settle(settlementRequest());
  ok(!denied.ok);
  equal(denied.diagnostics[0]?.code, "PERMISSION_DENIED");

  const wrongEnvironment = await composition().settle(settlementRequest({
    providerEvent: { ...paidProviderEvent, environment: "LIVE" },
  }));
  ok(!wrongEnvironment.ok);
  equal(wrongEnvironment.diagnostics[0]?.code, "ENVIRONMENT_MISMATCH");

  const wrongExpectedEnvironment = await composition().settle(
    settlementRequest({
      expectedEnvironment: "LIVE",
    }),
  );
  ok(!wrongExpectedEnvironment.ok);
  equal(wrongExpectedEnvironment.diagnostics[0]?.code, "ENVIRONMENT_MISMATCH");
});

async function collaborativeFixture(): Promise<{
  readonly authority: CollaborativeRevenueAuthorityV1;
  readonly record: Market410CollaborativeRecord;
  readonly fingerprint: ProductFingerprintV1;
}> {
  const snapshot = await createContributorSnapshot({
    snapshotId: asContributorSnapshotId("snapshot:market410:1"),
    collaborativeWorkId: asCollaborativeWorkId("work:market410"),
    contributors: [
      { contributorId: "contributor:a", allocationOrder: 0 },
      { contributorId: "contributor:b", allocationOrder: 1 },
      { contributorId: "contributor:c", allocationOrder: 2 },
    ],
  });
  ok(snapshot.ok);
  const fingerprint = await createProductFingerprint({
    collaborativeWorkId: snapshot.value.collaborativeWorkId,
    includedAssetRevisionSet: ["asset-revision:one"],
    deliveryFormat: "PXD",
    saleType: "PAID",
    licenseSnapshotId: "license:collaborative:alias",
    licenseSemanticHash: HASH_D,
    sourceIncluded: true,
  });
  ok(fingerprint.ok);
  const authority: CollaborativeRevenueAuthorityV1 = {
    schemaVersion: "COLLABORATIVE_COMMERCE_V1",
    collaborativeWorkId: snapshot.value.collaborativeWorkId,
    productId: PRODUCT_ID,
    productRevisionId: asProductRevisionId("product-revision:collab:1"),
    productLeadId: "contributor:a",
    contributorSnapshot: snapshot.value,
    canonicalContributorSnapshotHash: snapshot.value.snapshotHash,
    productFingerprint: fingerprint.value,
    gross: {
      amountMinor: 101,
      currency: "JPY",
      roundingPolicyVersion: "MINOR_UNIT_REJECT_V1",
    },
    deductions: [
      {
        deductionId: "deduction:provider",
        sourceId: "provider:market410",
        kind: "PAYMENT_PROVIDER_FEE",
        amount: {
          amountMinor: 1,
          currency: "JPY",
          roundingPolicyVersion: "MINOR_UNIT_REJECT_V1",
        },
      },
    ],
  };
  return {
    authority,
    fingerprint: fingerprint.value,
    record: {
      tenantId: TENANT,
      environment: "TEST",
      permission: "ALLOW",
      productRevision: "product-revision:collab:1",
      packageRevision: productRecord.packageRevision,
      authority,
      existingFingerprints: [],
    },
  };
}

function collaborationProof(productRevisionId: string): AuthorizationProofV1 {
  return proof({
    principalId: "contributor:a",
    resourceType: "MARKET_COLLABORATIVE_PRODUCT",
    resourceId: productRevisionId,
    action: "market.collaborative.allocate",
    capability: "market.collaborative.allocate",
    tenantId: TENANT,
  });
}

Deno.test("MARKET410-SCOPE-001 locks the shared Contributor Snapshot and splits after deductions deterministically", async () => {
  const fixture = await collaborativeFixture();
  const market = composition(baseSeed({ collaborative: [fixture.record] }));
  const result = await market.allocateCollaborative({
    productRevisionId: fixture.authority.productRevisionId,
    packageRevision: fixture.record.packageRevision,
    authorizationProof: collaborationProof(
      String(fixture.authority.productRevisionId),
    ),
  });
  ok(result.ok);
  equal(result.value.status, "ALLOCATED");
  deepStrictEqual(
    result.value.allocations.map((entry) => entry.amount.amountMinor),
    [34, 33, 33],
  );
  deepStrictEqual(
    result.value.allocations.map((entry) => entry.contributorId),
    [
      "contributor:a",
      "contributor:b",
      "contributor:c",
    ],
  );
  equal(
    result.value.contributorSnapshotHash,
    fixture.authority.contributorSnapshot.snapshotHash,
  );
  equal(result.value.allocations[0]?.productLeadId, "contributor:a");
});

Deno.test("MARKET410-SCOPE-001 rejects conflicting Contributor Snapshots for one Collaborative Work at Registry construction", async () => {
  const fixture = await collaborativeFixture();
  const conflictingSnapshot = await createContributorSnapshot({
    snapshotId: asContributorSnapshotId("snapshot:market410:conflict"),
    collaborativeWorkId: fixture.authority.collaborativeWorkId,
    contributors: [
      { contributorId: "contributor:a", allocationOrder: 0 },
      { contributorId: "contributor:b", allocationOrder: 1 },
      { contributorId: "contributor:c", allocationOrder: 2 },
    ],
  });
  ok(conflictingSnapshot.ok);
  equal(
    conflictingSnapshot.value.snapshotHash ===
      fixture.authority.contributorSnapshot.snapshotHash,
    false,
  );

  const conflictingAuthority: CollaborativeRevenueAuthorityV1 = {
    ...fixture.authority,
    productRevisionId: asProductRevisionId("product-revision:collab:conflict"),
    contributorSnapshot: conflictingSnapshot.value,
    canonicalContributorSnapshotHash: conflictingSnapshot.value.snapshotHash,
  };
  const conflictingRecord: Market410CollaborativeRecord = {
    ...fixture.record,
    productRevision: "product-revision:collab:conflict",
    authority: conflictingAuthority,
  };

  throws(
    () =>
      createInMemoryMarket410Registry(
        baseSeed({
          collaborative: [fixture.record, conflictingRecord],
        }),
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === MARKET410_CONTRIBUTOR_SNAPSHOT_CONFLICT_ERROR,
  );
});

Deno.test("MARKET410-SCOPE-001 rejects Product Lead, Contributor Snapshot, and duplicate Product overrides", async () => {
  const fixture = await collaborativeFixture();
  const duplicate: Market410CollaborativeRecord = {
    ...fixture.record,
    existingFingerprints: [fixture.fingerprint],
  };
  const duplicateResult = await composition(
    baseSeed({ collaborative: [duplicate] }),
  ).allocateCollaborative({
    productRevisionId: fixture.authority.productRevisionId,
    packageRevision: duplicate.packageRevision,
    authorizationProof: collaborationProof(
      String(fixture.authority.productRevisionId),
    ),
  });
  ok(!duplicateResult.ok);
  equal(duplicateResult.diagnostics[0]?.code, "DUPLICATE_PRODUCT");

  const overrideResult = await composition(
    baseSeed({ collaborative: [fixture.record] }),
  ).allocateCollaborative({
    productRevisionId: fixture.authority.productRevisionId,
    packageRevision: fixture.record.packageRevision,
    authorizationProof: collaborationProof(
      String(fixture.authority.productRevisionId),
    ),
    callerOverrides: {
      productLeadId: "contributor:a",
      contributorSnapshot: "attacker-snapshot",
      allocationBps: 10_000,
    },
  });
  ok(!overrideResult.ok);
  equal(overrideResult.diagnostics[0]?.code, "COLLABORATIVE_OVERRIDE_REJECTED");
});

Deno.test("MARKET410-SCOPE-001 permits a different Product shape while preserving the same Work Snapshot", async () => {
  const fixture = await collaborativeFixture();
  const secondFingerprint = await createProductFingerprint({
    collaborativeWorkId: fixture.authority.collaborativeWorkId,
    includedAssetRevisionSet: ["asset-revision:two"],
    deliveryFormat: "ZIP",
    saleType: "PAID",
    licenseSnapshotId: "license:collaborative:other",
    licenseSemanticHash: HASH_D,
    sourceIncluded: false,
  });
  ok(secondFingerprint.ok);
  const secondAuthority: CollaborativeRevenueAuthorityV1 = {
    ...fixture.authority,
    productRevisionId: asProductRevisionId("product-revision:collab:2"),
    productFingerprint: secondFingerprint.value,
  };
  const second: Market410CollaborativeRecord = {
    ...fixture.record,
    productRevision: "product-revision:collab:2",
    authority: secondAuthority,
    existingFingerprints: [fixture.fingerprint],
  };
  const market = composition(
    baseSeed({ collaborative: [fixture.record, second] }),
  );
  const firstResult = await market.allocateCollaborative({
    productRevisionId: fixture.authority.productRevisionId,
    packageRevision: fixture.record.packageRevision,
    authorizationProof: collaborationProof(
      String(fixture.authority.productRevisionId),
    ),
  });
  ok(firstResult.ok);
  const result = await market.allocateCollaborative({
    productRevisionId: secondAuthority.productRevisionId,
    packageRevision: second.packageRevision,
    authorizationProof: collaborationProof(
      String(secondAuthority.productRevisionId),
    ),
  });
  ok(result.ok);
  equal(result.value.productFingerprint, secondFingerprint.value.fingerprint);
  equal(
    result.value.contributorSnapshotHash,
    fixture.authority.contributorSnapshot.snapshotHash,
  );
});

Deno.test("MARKET410-EVIDENCE-001 diagnostics and summaries contain no private payload material", async () => {
  const hostileFinancialInput = {
    amountMinor: 1,
    currency: "USD",
    recipientAccountId: "email@example.invalid",
    royaltyRateBps: 10_000,
    entryType: "JWT eyJhbGciOiJIUzI1NiJ9",
    direction: "project body: private source pixels",
    jwt: "eyJhbGciOiJIUzI1NiJ9.secret.signature",
    email: "email@example.invalid",
    paymentDetails: "4111111111111111",
    rawFile: new Uint8Array([1, 2, 3]),
  } as never;
  const result = await composition().settle(settlementRequest({
    callerFinancialInput: hostileFinancialInput,
  }));
  const safe = auditSafeMarket410Result(result);
  const serialized = JSON.stringify({ result, safe });
  for (
    const forbidden of [
      "email@example.invalid",
      "eyJhbGciOiJIUzI1NiJ9.secret.signature",
      "4111111111111111",
      "private source pixels",
      "rawFile",
      "Uint8Array",
    ]
  ) {
    equal(
      serialized.includes(forbidden),
      false,
      `diagnostics leaked ${forbidden}`,
    );
  }
  equal(safe.hasSensitiveFields, false);
  equal(safe.externalMutation, false);
});

Deno.test("MARKET410-STOP-001 is isolated, default-unloaded, and never produces a production mutation", async () => {
  const market = new Market410Composition(
    createInMemoryMarket410Registry(baseSeed()),
  );
  const result = await market.settle(settlementRequest());
  const safe = auditSafeMarket410Result(result);
  equal(safe.externalMutation, false);
  equal(safe.hasSensitiveFields, false);
  notEqual(InMemoryMarket410Registry, undefined);
  equal(DEFAULT_MARKET410_FEATURE_FLAGS["market-410-settlement"], false);
  ok(!result.ok);
  equal(result.diagnostics[0]?.code, "FEATURE_DISABLED");
});
