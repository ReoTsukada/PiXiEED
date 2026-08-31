import {
  asEntitlementId,
  asLegacyProductId,
  asMarketOrderId,
  asMarketProductId,
  asMarketPurchaseId,
  asPaymentEventId,
  asRoyaltyLedgerEntryId,
  asLicenseSnapshotId,
  asMarketContentHash,
  createLegacyCompatibilityAdapter,
  createProductProjection,
  createProviderCommand,
  createPurchaseRecord,
  createRollbackPlan,
  applyRollbackPlan,
  DEFAULT_WP210_FEATURE_FLAGS,
  materializePurchaseRights,
  marketFeatureEnabled,
  reconcileCommerce,
  reconcilePurchaseEvents,
  tombstoneSourcePreservesPurchase,
  validateRoyaltyLedgerEntry,
  type CommerceSnapshot,
  type LockedPackageReference,
  type MarketProductProjection,
  type PurchaseEvent,
  type PurchaseRecord,
  type RoyaltyLedgerEntry,
} from "../src/wp210-market-rights-core.ts";
import { AUTHORIZATION_PROOF_POLICY_VERSION, asPackageId, asSha256, type AuthorizationProofV1 } from "../src/wp160-contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const HASH_A = asSha256("a".repeat(64));
const HASH_B = asSha256("b".repeat(64));
const HASH_C = asSha256("c".repeat(64));
const HASH_D = asSha256("d".repeat(64));
const LICENSE_ID = asLicenseSnapshotId("license-synthetic-1");
const issuedAt = new Date(Date.now() - 60_000).toISOString();
const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();

function productProof(productId: string, principalId: string): AuthorizationProofV1 {
  return { schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "wp210-test", proofId: `proof:${productId}`, principalId, resourceType: "MARKET_PRODUCT", resourceId: productId, action: "market.product.project", capability: "market.product.project", tenantId: null, correlationId: "wp210-test", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION, grantId: "grant:wp210-test", issuedAt, expiresAt };
}

function purchaseProof(purchaseId: string, principalId: string): AuthorizationProofV1 {
  return { ...productProof(purchaseId, principalId), proofId: `proof:purchase:${purchaseId}`, resourceType: "MARKET_PURCHASE", resourceId: purchaseId, action: "market.purchase.create", capability: "market.purchase.create" };
}

function providerProof(intentId: string): AuthorizationProofV1 {
  return { ...productProof(intentId, "buyer-1"), proofId: `proof:provider:${intentId}`, principalId: "buyer-1", resourceType: "COMMERCE_PROVIDER_COMMAND", resourceId: intentId, action: "commerce.provider.command", capability: "commerce.provider.command", correlationId: "correlation-1" };
}

function authorizedProduct<T extends { readonly productId: string; readonly ownerAccountId: string }>(input: T): T & { readonly authorizationProof: AuthorizationProofV1; readonly authorizationProofResolver: (context: { readonly expected: { readonly principalId?: string | null; readonly resourceType?: string; readonly resourceId?: string; readonly action?: string; readonly capability?: string; readonly tenantId?: string | null; readonly policyVersion?: string } }) => AuthorizationProofV1 } {
  return { ...input, authorizationProof: productProof(input.productId, input.ownerAccountId), authorizationProofResolver: ({ expected }) => productProof(expected.resourceId ?? input.productId, expected.principalId ?? input.ownerAccountId) };
}

const lockedPackage: LockedPackageReference = {
  packageId: asPackageId("package-material-1"),
  packageVersion: "1.0.0",
  manifestHash: HASH_A,
  dependencySnapshotHash: HASH_B,
  contentHash: HASH_C,
  licenseSnapshotId: LICENSE_ID,
  licenseSnapshotHash: HASH_D,
  mode: "PINNED",
};

const productInput = {
  productId: asMarketProductId("product-material-1"),
  package: lockedPackage,
  classification: "MATERIAL" as const,
  publication: "PAID" as const,
  status: "PUBLISHED" as const,
  ownerAccountId: "creator-1",
  legacyUrl: "/market/items/product-material-1",
  price: { amountMinor: 100, currency: "JPY" },
  rights: ["PERSONAL_USE", "EMBEDDING"] as const,
};

const productResult = createProductProjection(authorizedProduct(productInput));
assert(productResult.ok, "valid Material Product projection must pass");
const product: MarketProductProjection = productResult.value;

function event(type: PurchaseEvent["type"], sequence: number, id: string, fingerprint: typeof HASH_A = HASH_A): PurchaseEvent {
  return { eventId: asPaymentEventId(id), purchaseId: asMarketPurchaseId("purchase-synthetic-1"), sequence, type, payloadFingerprint: fingerprint, source: "CURRENT_WEBHOOK_FIXTURE" };
}

function purchaseFixture(): PurchaseRecord {
  const result = createPurchaseRecord({ purchaseId: asMarketPurchaseId("purchase-synthetic-1"), productId: product.productId, orderId: asMarketOrderId("order-synthetic-1"), buyerAccountId: "buyer-1", package: lockedPackage, amount: { amountMinor: 100, currency: "JPY" }, provider: "SYNTHETIC", authorizationProof: purchaseProof("purchase-synthetic-1", "buyer-1"), authorizationProofResolver: ({ expected }) => purchaseProof(expected.resourceId ?? "purchase-synthetic-1", expected.principalId ?? "buyer-1") });
  assert(result.ok, "synthetic purchase must pass");
  return result.value;
}

const royalty: RoyaltyLedgerEntry = { ledgerEntryId: asRoyaltyLedgerEntryId("royalty-synthetic-1"), purchaseId: asMarketPurchaseId("purchase-synthetic-1"), productId: product.productId, creatorAccountId: "creator-1", amountMinor: 80, currency: "JPY", status: "POSTED", sourceEventId: asPaymentEventId("payment-paid-1") };

Deno.test("WP-210 Product projection keeps Market classification separate from Package and rejects raw content", () => {
  assert(product.classification === "MATERIAL" && product.package.packageId === lockedPackage.packageId, "Material Product must reference the locked Package");
  const completed = createProductProjection(authorizedProduct({ ...productInput, productId: asMarketProductId("product-completed-1"), classification: "COMPLETED_WORK", packageKind: "FINISHED_PRODUCT" }));
  assert(completed.ok && completed.value.classification === "COMPLETED_WORK", "Completed Work must be a separate allowed classification");
  const rejected = createProductProjection(authorizedProduct({ ...productInput, rawContentBytes: 64 }));
  assert(!rejected.ok && rejected.diagnostics.some((item) => item.code === "RAW_CONTENT_REJECTED"), "raw bytes must not cross the Product projection");
  const unpinned = createProductProjection(authorizedProduct({ ...productInput, package: { ...lockedPackage, mode: "PINNED" as const, contentHash: asMarketContentHash("e".repeat(64)) } }));
  assert(unpinned.ok, "a changed content hash is valid when the new Package reference remains pinned");
});

Deno.test("WP-210 Legacy adapter preserves URL/IDs and quarantines mapping conflicts", async () => {
  const record = { legacyProductId: asLegacyProductId("legacy-product-1"), legacyUrl: "/market/item.html?id=legacy-product-1", legacyClassification: "finished" as const, package: lockedPackage, ownerAccountId: "creator-1", historicalPrice: { amountMinor: 100, currency: "JPY" }, orderIds: [asMarketOrderId("order-synthetic-1")], licenseSnapshotId: LICENSE_ID };
  const mapped = await createLegacyCompatibilityAdapter({ record, projectedProductId: asMarketProductId("product-legacy-projection-1"), authorizationProof: productProof("product-legacy-projection-1", "creator-1"), authorizationProofResolver: ({ expected }) => productProof(expected.resourceId ?? "product-legacy-projection-1", expected.principalId ?? "creator-1") });
  assert(mapped.ok && mapped.value.status === "MAPPED" && mapped.value.legacyUrl === record.legacyUrl, "Legacy URL and identity must be preserved");
  const conflict = await createLegacyCompatibilityAdapter({ record, projectedProductId: asMarketProductId("different-projection") , existing: [mapped.value], authorizationProof: productProof("different-projection", "creator-1"), authorizationProofResolver: ({ expected }) => productProof(expected.resourceId ?? "different-projection", expected.principalId ?? "creator-1") });
  assert(!conflict.ok && conflict.diagnostics.some((item) => item.code === "LEGACY_MAPPING_CONFLICT"), "conflicting mapping must fail closed");
});

Deno.test("WP-210 Purchase reconciliation is deterministic, idempotent, and does not entitle pending purchases", () => {
  const initial = purchaseFixture();
  const paid = reconcilePurchaseEvents(initial, [event("PAID", 2, "payment-paid-1"), event("CHECKOUT_BOUND", 1, "payment-bound-1")]);
  assert(paid.ok && paid.value.lifecycle === "PAID", "out-of-order input must be ordered by sequence");
  const duplicate = reconcilePurchaseEvents(paid.value, [event("PAID", 2, "payment-paid-1")]);
  assert(duplicate.ok && duplicate.value.lifecycle === "PAID" && duplicate.diagnostics.some((item) => item.metadata?.idempotent === true), "duplicate Payment Event must be an idempotent no-op");
  const pending = materializePurchaseRights(initial, product, asEntitlementId("entitlement-pending"));
  assert(pending.ok && pending.value.entitlement === undefined, "pending purchase must not create Entitlement");
  const invalid = reconcilePurchaseEvents(initial, [event("DELIVERED", 1, "payment-delivered-before-paid")]);
  assert(!invalid.ok && invalid.diagnostics.some((item) => item.code === "INVALID_TRANSITION"), "delivery before payment must fail closed");
  const conflict = reconcilePurchaseEvents(paid.value, [event("PAID", 2, "payment-paid-1", HASH_B)]);
  assert(!conflict.ok && conflict.diagnostics.some((item) => item.code === "DUPLICATE_EVENT_CONFLICT"), "same event ID with a different fingerprint must quarantine");
});

Deno.test("WP-210 Paid, reverse, restore, and tombstone paths preserve locked rights", () => {
  const initial = purchaseFixture();
  const paid = reconcilePurchaseEvents(initial, [event("CHECKOUT_BOUND", 1, "payment-bound-1"), event("PAID", 2, "payment-paid-1"), event("DELIVERED", 3, "payment-delivered-1")]);
  assert(paid.ok, "paid purchase fixture must reconcile");
  const active = materializePurchaseRights(paid.value, product, asEntitlementId("entitlement-paid"));
  assert(active.ok && active.value.entitlement?.status === "ACTIVE" && active.value.license.status === "ACTIVE", "paid purchase must produce active rights");
  const reversed = reconcilePurchaseEvents(paid.value, [event("REVERSED", 4, "payment-reversed-1")]);
  assert(reversed.ok && reversed.value.lifecycle === "REVERSED", "reverse must be explicit");
  const revoked = materializePurchaseRights(reversed.value, product, asEntitlementId("entitlement-paid"));
  assert(revoked.ok && revoked.value.entitlement?.status === "REVOKED", "reverse must revoke purchase entitlement");
  const restored = reconcilePurchaseEvents(reversed.value, [event("RESTORED", 5, "payment-restored-1")]);
  assert(restored.ok && restored.value.lifecycle === "RESTORED", "restore must be an explicit event");
  const snapshot: CommerceSnapshot = { product, purchase: paid.value, ...(active.value.entitlement === undefined ? {} : { entitlement: active.value.entitlement }), license: active.value.license, royalty };
  const tombstoned = tombstoneSourcePreservesPurchase(snapshot);
  assert(tombstoned.purchase.package.contentHash === snapshot.purchase.package.contentHash && tombstoned.license.status === "ACTIVE", "source tombstone must not invalidate purchased locked data");
});

Deno.test("WP-210 Commerce reconciliation keeps royalty amount and subscription boundary unchanged", () => {
  const paid = reconcilePurchaseEvents(purchaseFixture(), [event("CHECKOUT_BOUND", 1, "payment-bound-1"), event("PAID", 2, "payment-paid-1")]);
  assert(paid.ok, "paid fixture must reconcile");
  const result = reconcileCommerce({ product, purchase: paid.value, paymentEvents: [], entitlementId: asEntitlementId("entitlement-commerce"), royalty });
  assert(!result.ok && result.diagnostics.some((item) => item.code === "LEGACY_ADAPTER_ONLY"), "caller-supplied legacy Commerce royalty must remain disabled");
  assert(validateRoyaltyLedgerEntry({ ...royalty, amountMinor: 80.5 }).ok === false, "floating point ledger amounts must be rejected");
});

Deno.test("WP-210 Provider boundary is opaque and default-off", async () => {
  const disabled = await createProviderCommand({ action: "CREATE_CHECKOUT", provider: "STRIPE", correlationId: "correlation-1", intentId: "intent-1", idempotencyKey: "idempotency-1", authorizationProof: providerProof("intent-1"), authorizationProofResolver: ({ expected }) => providerProof(expected.resourceId ?? "intent-1") }, DEFAULT_WP210_FEATURE_FLAGS, false);
  assert(!disabled.ok && disabled.diagnostics.some((item) => item.code === "FEATURE_DISABLED"), "Provider command must be disabled by default");
  const enabled = await createProviderCommand({ action: "CREATE_CHECKOUT", provider: "STRIPE", correlationId: "correlation-1", intentId: "intent-1", idempotencyKey: "idempotency-1", authorizationProof: providerProof("intent-1"), authorizationProofResolver: ({ expected }) => providerProof(expected.resourceId ?? "intent-1") }, { ...DEFAULT_WP210_FEATURE_FLAGS, "market-core-write": true }, false);
  assert(enabled.ok && enabled.value.execution === "EXTERNAL_AUTHORIZED_BOUNDARY_ONLY", "enabled Provider command remains opaque and non-executing");
  const kill = await createProviderCommand({ action: "CREATE_CHECKOUT", provider: "STRIPE", correlationId: "correlation-1", intentId: "intent-1", idempotencyKey: "idempotency-1", authorizationProof: providerProof("intent-1"), authorizationProofResolver: ({ expected }) => providerProof(expected.resourceId ?? "intent-1") }, { ...DEFAULT_WP210_FEATURE_FLAGS, "market-core-write": true }, true);
  assert(!kill.ok && kill.diagnostics.some((item) => item.code === "KILL_SWITCH_ACTIVE"), "kill switch must win");
  const unknown = marketFeatureEnabled({ "unknown-market-flag": true }, "unknown-market-flag" as never, false);
  assert(!unknown.ok && unknown.diagnostics.some((item) => item.code === "UNKNOWN_FLAG"), "unknown Market flags must fail closed");
});

Deno.test("WP-210 Rollback is shadow-only and checks the last validated snapshot", async () => {
  const paid = reconcilePurchaseEvents(purchaseFixture(), [event("CHECKOUT_BOUND", 1, "payment-bound-1"), event("PAID", 2, "payment-paid-1")]);
  assert(paid.ok, "paid fixture must reconcile");
  const active = materializePurchaseRights(paid.value, product, asEntitlementId("entitlement-rollback"));
  assert(active.ok && active.value.entitlement !== undefined, "rollback fixture must have entitlement");
  const current: CommerceSnapshot = { product, purchase: paid.value, entitlement: active.value.entitlement, license: active.value.license, royalty };
  const restore: CommerceSnapshot = { product, purchase: { ...current.purchase, lifecycle: "PENDING", appliedEvents: [] }, license: { ...current.license, status: "QUARANTINED" }, royalty };
  const plan = await createRollbackPlan(current, restore, "synthetic invalid transition");
  const applied = applyRollbackPlan(plan, plan.fromSnapshotHash);
  assert(applied.ok && applied.value.purchase.lifecycle === "PENDING", "valid rollback must restore the local shadow snapshot");
  const blocked = applyRollbackPlan(plan, HASH_A);
  assert(!blocked.ok, "rollback with a mismatched current hash must be blocked");
});
