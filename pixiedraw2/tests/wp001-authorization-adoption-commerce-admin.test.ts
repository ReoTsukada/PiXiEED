import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
  asPackageId,
  asSha256,
} from "../src/wp160-contracts.ts";
import {
  asMarketProductId,
  asMarketPurchaseId,
  asMarketOrderId,
  createProductProjection,
  createPurchaseRecord,
  createProviderCommand,
} from "../src/wp210-market-rights-core.ts";
import { asDirectWorkRequestId, createDirectWorkRequest } from "../src/wp220-direct-work-core.ts";
import { resolveWp240AdminProjection } from "../src/wp240-admin-analytics-ads-core.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

const ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
const EXPIRES_AT = new Date(Date.now() + 4 * 60_000).toISOString();

function proof(overrides: Partial<AuthorizationProofV1> = {}): AuthorizationProofV1 {
  return {
    schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow",
    authorityId: "caller-authority", proofId: "caller-proof", principalId: "user-owner",
    resourceType: "MARKET_PRODUCT", resourceId: "product-1", action: "market.product.project", capability: "market.product.project",
    tenantId: "tenant-1", correlationId: "correlation-fp001", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant-1", issuedAt: ISSUED_AT, expiresAt: EXPIRES_AT, ...overrides,
  };
}

const serverResolver: AuthorizationProofResolver = ({ expected }) => proof({
  authorityId: "server-authority", proofId: "server-proof", principalId: expected.principalId ?? null,
  resourceType: expected.resourceType ?? "MARKET_PRODUCT", resourceId: expected.resourceId ?? "resource-1",
  action: expected.action ?? "operation", capability: expected.capability ?? "operation",
  tenantId: expected.tenantId ?? "tenant-1", correlationId: expected.correlationId ?? "correlation-server",
  policyVersion: expected.policyVersion ?? AUTHORIZATION_PROOF_POLICY_VERSION,
  decision: expected.tenantId === undefined || expected.tenantId === "tenant-1" ? "allow" : "deny",
});

const packageReference = {
  packageId: asPackageId("package-1"), packageVersion: "1.0.0", manifestHash: asSha256("a".repeat(64)),
  dependencySnapshotHash: asSha256("b".repeat(64)), contentHash: asSha256("c".repeat(64)),
  licenseSnapshotId: "license-1" as never, licenseSnapshotHash: asSha256("d".repeat(64)), mode: "PINNED" as const,
};

Deno.test("FP-001 Market and Direct Work accept only bound AuthorizationProofV1", async () => {
  const product = createProductProjection({
    productId: asMarketProductId("product-1"), package: packageReference, classification: "MATERIAL", publication: "PAID",
    status: "DRAFT", ownerAccountId: "user-owner", price: { amountMinor: 100, currency: "JPY" }, rights: ["PERSONAL_USE"],
    authorizationProof: proof(), authorizationProofResolver: serverResolver,
  });
  assert(product.ok);

  const purchase = createPurchaseRecord({
    purchaseId: asMarketPurchaseId("purchase-1"), productId: asMarketProductId("product-1"), orderId: asMarketOrderId("order-1"),
    buyerAccountId: "user-buyer", package: packageReference, amount: { amountMinor: 100, currency: "JPY" }, provider: "CURRENT_SERVER",
    authorizationProof: proof({ principalId: "user-buyer", resourceType: "MARKET_PURCHASE", resourceId: "purchase-1", action: "market.purchase.create", capability: "market.purchase.create" }),
    authorizationProofResolver: serverResolver,
  });
  assert(purchase.ok);

  const request = createDirectWorkRequest({
    requestId: asDirectWorkRequestId("request-1"), requesterAccountId: "user-buyer", creatorAccountId: "creator-1",
    scopeHash: asSha256("e".repeat(64)), createdAt: ISSUED_AT, recordVersion: 1,
    authorizationProof: proof({ principalId: "user-buyer", resourceType: "DIRECT_WORK_REQUEST", resourceId: "request-1", action: "direct-work.request.create", capability: "direct-work.request.create" }),
    authorizationProofResolver: serverResolver,
  });
  assert(request.ok);

  const forged = createProductProjection({
    productId: asMarketProductId("product-1"), package: packageReference, classification: "MATERIAL", publication: "PAID",
    status: "DRAFT", ownerAccountId: "user-owner", price: { amountMinor: 100, currency: "JPY" }, rights: ["PERSONAL_USE"],
    authorizationProof: proof({ resourceId: "product-other" }), authorizationProofResolver: serverResolver,
  });
  assert(!forged.ok);
});

Deno.test("FP-001 Commerce provider and Admin projection reject expiry, policy, and capability reuse", async () => {
  const flags = { "market-core-write": true, "market-reconcile": true };
  const validProvider = await createProviderCommand({
    action: "CREATE_CHECKOUT", provider: "CURRENT_SERVER", correlationId: "correlation-provider-1", intentId: "intent-1", idempotencyKey: "idempotency-1",
    authorizationProof: proof({ principalId: null, resourceType: "COMMERCE_PROVIDER_COMMAND", resourceId: "intent-1", action: "commerce.provider.command", capability: "commerce.provider.command", correlationId: "correlation-provider-1" }),
    authorizationProofResolver: serverResolver,
  }, flags, false);
  assert(validProvider.ok);

  const expiredProvider = await createProviderCommand({
    action: "CREATE_CHECKOUT", provider: "CURRENT_SERVER", correlationId: "correlation-provider-2", intentId: "intent-2", idempotencyKey: "idempotency-2",
    authorizationProof: proof({ principalId: null, resourceType: "COMMERCE_PROVIDER_COMMAND", resourceId: "intent-2", action: "commerce.provider.command", capability: "commerce.provider.command", correlationId: "correlation-provider-2", issuedAt: "2000-01-01T00:00:00.000Z", expiresAt: "2000-01-01T00:05:00.000Z" }),
    authorizationProofResolver: serverResolver,
  }, flags, false);
  assert(!expiredProvider.ok);

  const unknownPolicyProvider = await createProviderCommand({
    action: "CREATE_CHECKOUT", provider: "CURRENT_SERVER", correlationId: "correlation-provider-3", intentId: "intent-3", idempotencyKey: "idempotency-3",
    authorizationProof: proof({ principalId: null, resourceType: "COMMERCE_PROVIDER_COMMAND", resourceId: "intent-3", action: "commerce.provider.command", capability: "commerce.provider.command", correlationId: "correlation-provider-3", policyVersion: "unknown-policy-v99" }),
    authorizationProofResolver: serverResolver,
  }, flags, false);
  assert(!unknownPolicyProvider.ok);

  const admin = resolveWp240AdminProjection({
    projectionId: "projection-1", kind: "CONTENT_HEALTH", scopeReference: "site-1", requiredCapability: "ADMIN_PROJECTION_READ",
    authorizationProof: proof({ principalId: "admin-1", resourceType: "ADMIN_PROJECTION", resourceId: "projection-1", action: "admin.projection.read", capability: "ADMIN_PROJECTION_READ" }),
    authorizationProofResolver: serverResolver,
  });
  assert(admin.ok);

  const reusedCapability = resolveWp240AdminProjection({
    projectionId: "projection-1", kind: "CONTENT_HEALTH", scopeReference: "site-1", requiredCapability: "ADMIN_PROJECTION_READ",
    authorizationProof: proof({ principalId: "admin-1", resourceType: "ADMIN_PROJECTION", resourceId: "projection-1", action: "admin.projection.read", capability: "ANALYTICS_READ" }),
    authorizationProofResolver: serverResolver,
  });
  assert(!reusedCapability.ok);
});
