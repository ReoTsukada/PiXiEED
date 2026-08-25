import { strict as assert } from "node:assert";
import {
  createAdminAuditCommand,
  createAdminProjectionCommand,
  createModerationCommand,
  createSnsPostCommand,
} from "../src/fp003z-browser-command-contract.ts";
import type { DirectWorkAuthorityCommand } from "../src/server/authority-composition-internal.ts";
import type {
  CanonicalRegistryAdapter,
  CurrentDirectWorkChain,
  ServerAuthorityRequestContextV1,
} from "../src/server/authority-contracts.ts";
import { createFp003ZTestService } from "./fixtures/fp003z-test-composition.ts";
import { buildFp003ZDirectWorkChain } from "./fixtures/fp003z-direct-work-fixture.ts";
import { InMemoryAuthoritativeRegistry } from "./fixtures/in-memory-authoritative-registry.ts";
import { contextForSeed } from "./fixtures/fp003aa-server-auth-fixture.ts";

function commandFor(
  seed: Awaited<ReturnType<typeof buildFp003ZDirectWorkChain>>,
): DirectWorkAuthorityCommand {
  return {
    requestId: seed.request.requestId,
    requestRevision: "request:v2",
    quoteId: seed.quote.quoteId,
    quoteRevision: "quote:v2",
    agreementId: seed.agreement.agreementId,
    agreementRevision: "agreement:v3",
    milestoneId: seed.milestone.milestoneId,
    milestoneRevision: "milestone:v4",
    deliveryId: seed.delivery.deliveryId,
    deliveryRevision: "delivery:v2",
    acceptanceId: seed.acceptance.acceptanceId,
    acceptanceRevision: "acceptance:v1",
    rightsDecisionId: seed.rights.rightsDecisionId,
    rightsRevision: "rights:v1",
    paymentId: seed.payment.paymentId,
    paymentRevision: "payment:v3",
    sourceEventId: seed.sourceEvent.eventId,
    providerEventId: seed.providerEvent.eventId,
  };
}

class MixedTenantRegistry implements CanonicalRegistryAdapter {
  constructor(
    private readonly inner: InMemoryAuthoritativeRegistry,
    private readonly otherContext: ServerAuthorityRequestContextV1,
  ) {}
  get membershipRegistry() {
    return this.inner.membershipRegistry;
  }
  resolveTenantContext(
    input: Parameters<CanonicalRegistryAdapter["resolveTenantContext"]>[0],
  ) {
    return this.inner.resolveTenantContext(input);
  }
  getCurrent<T>(...args: Parameters<CanonicalRegistryAdapter["getCurrent"]>) {
    return this.inner.getCurrent<T>(...args);
  }
  resolvePrincipal(
    input: Parameters<CanonicalRegistryAdapter["resolvePrincipal"]>[0],
  ) {
    return this.inner.resolvePrincipal(input);
  }
  async getCurrentDirectWorkChain(
    input: Parameters<CanonicalRegistryAdapter["getCurrentDirectWorkChain"]>[0],
  ): Promise<CurrentDirectWorkChain | null> {
    const current = await this.inner.getCurrentDirectWorkChain(input);
    const foreign = await this.inner.getCurrentDirectWorkChain({
      ...input,
      tenantContext: this.otherContext.tenantContext,
    });
    return current === null || foreign === null
      ? null
      : { ...current, quote: structuredClone(foreign.quote) };
  }
  getCurrentMarketSettlement(
    input: Parameters<
      CanonicalRegistryAdapter["getCurrentMarketSettlement"]
    >[0],
  ) {
    return this.inner.getCurrentMarketSettlement(input);
  }
  getCollaborativeRevenueAuthority(
    input: Parameters<
      CanonicalRegistryAdapter["getCollaborativeRevenueAuthority"]
    >[0],
  ) {
    return this.inner.getCollaborativeRevenueAuthority(input);
  }
  materializeLedger(
    command: Parameters<CanonicalRegistryAdapter["materializeLedger"]>[0],
  ) {
    return this.inner.materializeLedger(command);
  }
}

Deno.test("FP-003Z Finalization Browser commands never accept or emit authority objects", () => {
  const sns = createSnsPostCommand({
    commandId: "cmd-sns",
    postId: "post-1",
    shareCommandId: "share-1",
    resourceId: "asset-1",
    expectedRevision: "post:v1",
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "safe",
    references: [],
    authorizationProofResolver: (() => "fake") as never,
    authorizationProof: { decision: "allow" } as never,
  } as never);
  assert.equal(sns.ok, true);
  if (sns.ok) {
    assert.equal(Object.hasOwn(sns.value, "authorizationProof"), false);
    assert.equal(Object.hasOwn(sns.value, "authorizationProofResolver"), false);
    assert.equal(Object.hasOwn(sns.value.input, "authorizationProof"), false);
  }
  const projection = createAdminProjectionCommand({
    commandId: "cmd-admin",
    projectionId: "projection-1",
    scopeReference: "scope-1",
    expectedRevision: "projection:v1",
    kind: "CONTENT_HEALTH",
    requestedCapability: "ADMIN.READ",
    serverAuthorizationResolved: true,
  } as never);
  assert.equal(projection.ok, true);
  const audit = createAdminAuditCommand({
    commandId: "cmd-audit",
    auditId: "audit-1",
    targetReference: "post-1",
    expectedRevision: "audit:v1",
    operation: "REVIEW",
    reasonCode: "POLICY",
    serverResolvedActor: "attacker",
  } as never);
  assert.equal(audit.ok, true);
  const moderation = createModerationCommand({
    commandId: "cmd-mod",
    caseId: "case-1",
    targetReference: "post-1",
    expectedRevision: "case:v1",
    action: "REVIEW",
    reasonCode: "POLICY",
    evidenceReferences: [],
    trustedProducer: true,
  } as never);
  assert.equal(moderation.ok, true);
  for (const result of [projection, audit, moderation]) {
    if (result.ok) {
      assert.equal(
        Object.keys(result.value).some((key) =>
          /authority|proof|serverresolved|trusted/i.test(key)
        ),
        false,
      );
    }
  }
});

Deno.test("FP-003Z Finalization runtime Browser artifacts expose commands only", async () => {
  const bundles = await Promise.all([
    import(new URL("../dist/wp230-sns-core.js", import.meta.url).href),
    import(
      new URL("../dist/wp240-admin-analytics-ads-core.js", import.meta.url).href
    ),
    import(
      new URL("../dist/wp250-policy-economics-core.js", import.meta.url).href
    ),
  ]);
  for (const bundle of bundles) {
    assert.equal("createSnsPost" in bundle, false);
    assert.equal("resolveWp240AdminProjection" in bundle, false);
    assert.equal("createWp250AdminAuditReference" in bundle, false);
    assert.equal(
      Object.keys(bundle).some((key) =>
        /authorization|authority|serverresolved|trustedproducer/i.test(key)
      ),
      false,
    );
  }
  const sns = bundles[0]!;
  const result = sns.createSnsPostCommand({
    commandId: "runtime-command",
    postId: "runtime-post",
    shareCommandId: "runtime-share",
    resourceId: "runtime-asset",
    expectedRevision: "post:v1",
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "runtime",
    references: [],
    authorizationProofResolver: (() => "fake") as never,
  } as never);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      Object.hasOwn(result.value.input, "authorizationProofResolver"),
      false,
    );
  }
});

Deno.test("FP-003Z Finalization tenant namespace rejects same-ID mixed records and cross-tenant Ledger", async () => {
  const tenantA = await buildFp003ZDirectWorkChain({
    suffix: "same-id",
    tenantId: "tenant-a",
    eventNamespace: "a",
  });
  const tenantB = await buildFp003ZDirectWorkChain({
    suffix: "same-id",
    tenantId: "tenant-b",
    eventNamespace: "b",
  });
  const registry = new InMemoryAuthoritativeRegistry();
  await registry.seedDirectWorkChain(tenantA);
  await registry.seedDirectWorkChain(tenantB);
  const service = createFp003ZTestService(registry);
  const commandA = commandFor(tenantA);
  const commandB = commandFor(tenantB);
  const contextA = await contextForSeed(tenantA);
  const contextB = await contextForSeed(tenantB);
  assert.equal(
    (await service.validateCurrentDirectWorkChain(commandA, contextA)).ok,
    true,
  );
  assert.equal(
    (await service.validateCurrentDirectWorkChain(commandB, contextB)).ok,
    true,
  );
  const crossA = await service.validateCurrentDirectWorkChain(
    commandA,
    await contextForSeed(tenantB),
  );
  const crossB = await service.validateCurrentDirectWorkChain(
    commandB,
    await contextForSeed(tenantA),
  );
  assert.equal(crossA.ok, false);
  assert.equal(crossB.ok, false);
  if (!crossA.ok) assert.equal(crossA.code, "STALE_RECORD");
  if (!crossB.ok) assert.equal(crossB.code, "STALE_RECORD");

  const forgedSource = await contextForSeed(tenantA);
  const forgedTenant = await service.validateCurrentDirectWorkChain(commandA, {
    ...forgedSource,
    tenantContext: { ...forgedSource.tenantContext, tenantId: "tenant-forged" },
  } as never);
  assert.equal(forgedTenant.ok, false);
  const mixed = await createFp003ZTestService(
    new MixedTenantRegistry(registry, await contextForSeed(tenantA)),
  ).validateCurrentDirectWorkChain(commandB, await contextForSeed(tenantB));
  assert.equal(mixed.ok, false);
  if (!mixed.ok) assert.equal(mixed.code, "STALE_RECORD");

  const crossLedgerA = await service.materializeDirectWorkSettlement(
    commandA,
    await contextForSeed(tenantB),
  );
  const crossLedgerB = await service.materializeDirectWorkSettlement(
    commandB,
    await contextForSeed(tenantA),
  );
  assert.equal(crossLedgerA.ok, false);
  assert.equal(crossLedgerB.ok, false);
});
