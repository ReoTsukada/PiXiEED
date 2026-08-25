import { strict as assert } from "node:assert";
import {
  asPackageId,
  asSha256,
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofV1,
} from "../src/wp160-contracts.ts";
import {
  asCollaborativeWorkId,
  asContributorSnapshotId,
  asProductRevisionId,
  type CollaborativeRevenueAuthorityV1,
  createContributorSnapshot,
  createProductFingerprint,
} from "../src/fp003-financial-integrity-core.ts";
import { asMarketProductId } from "../src/wp210-market-rights-core.ts";
import { createFp003ZTestService } from "./fixtures/fp003z-test-composition.ts";
import { InMemoryAuthoritativeRegistry } from "./fixtures/in-memory-authoritative-registry.ts";

const HASH = asSha256("a".repeat(64));
const issuedAt = new Date(Date.now() - 60_000).toISOString();
const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();

function proof(
  principalId: string,
  resourceType: string,
  resourceId: string,
  action: string,
): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "fp003z-test-authority",
    proofId: `proof:${resourceId}:${principalId}`,
    principalId,
    resourceType,
    resourceId,
    action,
    capability: action,
    tenantId: "tenant-fp003z",
    correlationId: "fp003z-test",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant:fp003z",
    issuedAt,
    expiresAt,
  };
}

async function collaborativeAuthority(): Promise<
  CollaborativeRevenueAuthorityV1
> {
  const snapshot = await createContributorSnapshot({
    snapshotId: asContributorSnapshotId("snapshot:fp003z"),
    collaborativeWorkId: asCollaborativeWorkId("work:fp003z"),
    contributors: [{ contributorId: "creator:a", allocationOrder: 0 }, {
      contributorId: "creator:b",
      allocationOrder: 1,
    }],
  });
  assert.equal(snapshot.ok, true);
  const fingerprint = await createProductFingerprint({
    collaborativeWorkId: asCollaborativeWorkId("work:fp003z"),
    includedAssetRevisionSet: ["revision:draw"],
    deliveryFormat: "PACKAGE",
    saleType: "COMPLETED_WORK",
    licenseSnapshotId: "license:fp003z",
    licenseSemanticHash: HASH,
    sourceIncluded: true,
  });
  assert.equal(fingerprint.ok, true);
  return {
    schemaVersion: "COLLABORATIVE_COMMERCE_V1",
    collaborativeWorkId: asCollaborativeWorkId("work:fp003z"),
    productId: asMarketProductId("product:fp003z"),
    productRevisionId: asProductRevisionId("product-revision:fp003z"),
    productLeadId: "creator:a",
    contributorSnapshot: snapshot.value,
    canonicalContributorSnapshotHash: snapshot.value.snapshotHash,
    productFingerprint: fingerprint.value,
    gross: {
      amountMinor: 100,
      currency: "JPY",
      roundingPolicyVersion: "MINOR_UNIT_REJECT_V1",
    },
    deductions: [],
  };
}

Deno.test("FP-003Z rejects attacker Principal before Product authority is constructed", async () => {
  const registry = new InMemoryAuthoritativeRegistry();
  const productId = asMarketProductId("product:fp003z-owner");
  registry.setPrincipal("MARKET_PRODUCT", productId, {
    canonicalPrincipalId: "owner:canonical",
    tenantContext: {
      schemaVersion: "SERVER_TENANT_CONTEXT_V1",
      tenantId: "tenant-fp003z",
      principalId: "owner:canonical",
      source: "SERVER_REGISTRY",
    },
    proof: proof(
      "owner:canonical",
      "MARKET_PRODUCT",
      productId,
      "market.product.project",
    ),
  });
  const service = createFp003ZTestService(registry);
  const packageReference = {
    packageId: asPackageId("package:fp003z"),
    packageVersion: "1",
    manifestHash: HASH,
    dependencySnapshotHash: HASH,
    contentHash: HASH,
    licenseSnapshotId: "license:fp003z" as never,
    licenseSnapshotHash: HASH,
    mode: "PINNED" as const,
  };
  const rejected = await service.projectProduct({
    productId,
    package: packageReference,
    classification: "MATERIAL",
    publication: "PAID",
    status: "DRAFT",
    ownerAccountId: "owner:canonical",
    price: { amountMinor: 1, currency: "JPY" },
    rights: ["PERSONAL_USE"],
    authorizationProof: proof(
      "attacker",
      "MARKET_PRODUCT",
      productId,
      "market.product.project",
    ),
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.diagnostics[0]?.code, "PERMISSION_DENIED");
  }
  const accepted = await service.projectProduct({
    productId,
    package: packageReference,
    classification: "MATERIAL",
    publication: "PAID",
    status: "DRAFT",
    ownerAccountId: "owner:canonical",
    price: { amountMinor: 1, currency: "JPY" },
    rights: ["PERSONAL_USE"],
    authorizationProof: proof(
      "owner:canonical",
      "MARKET_PRODUCT",
      productId,
      "market.product.project",
    ),
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.ownerAccountId, "owner:canonical");
});

Deno.test("FP-003Z resolves Contributor Snapshot only from the Registry", async () => {
  const registry = new InMemoryAuthoritativeRegistry();
  const authority = await collaborativeAuthority();
  registry.setCollaborativeAuthority(authority);
  const service = createFp003ZTestService(registry);
  const result = await service.deriveCollaborativeRevenue({
    productRevisionId: authority.productRevisionId,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.length, 2);
  assert.equal(result.value[0]?.productLeadId, "creator:a");
});
