import { strict as assert } from "node:assert";
import { createDirectWorkLedgerEntryFromServerCanonical } from "../src/wp220-direct-work-core.ts";
import type { DirectWorkAuthorityCommand } from "../src/server/authority-composition-internal.ts";
import type {
  CanonicalRegistryAdapter,
  CurrentDirectWorkChain,
  SecureLedgerCommand,
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

type ChainTamper = (chain: CurrentDirectWorkChain) => CurrentDirectWorkChain;

class TamperedRegistry implements CanonicalRegistryAdapter {
  constructor(
    private readonly inner: InMemoryAuthoritativeRegistry,
    private readonly tamper: ChainTamper,
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
  ) {
    const chain = await this.inner.getCurrentDirectWorkChain(input);
    return chain === null ? null : this.tamper(structuredClone(chain));
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
  materializeLedger(command: SecureLedgerCommand) {
    return this.inner.materializeLedger(command);
  }
}

async function seeded(
  mode: string,
): Promise<
  {
    readonly seed: Awaited<ReturnType<typeof buildFp003ZDirectWorkChain>>;
    readonly registry: InMemoryAuthoritativeRegistry;
    readonly command: DirectWorkAuthorityCommand;
  }
> {
  const seed = await buildFp003ZDirectWorkChain(mode);
  const registry = new InMemoryAuthoritativeRegistry();
  await registry.seedDirectWorkChain(seed);
  return { seed, registry, command: commandFor(seed) };
}

Deno.test("FP-003Z ATTACK-02 rejects fake SERVER_REGISTRY reference", async () => {
  const { seed } = await seeded("attack-02");
  const result = await createDirectWorkLedgerEntryFromServerCanonical({
    payment: seed.payment,
    sourceEvent: seed.sourceEvent,
    ledgerEntryId: "fake-reference-ledger" as never,
    canonicalPaymentReference: {
      resourceType: "DIRECT_WORK_PAYMENT",
      resourceId: seed.payment.paymentId,
      revision: "payment:v999",
      canonicalHash: "a".repeat(64) as never,
      origin: "SERVER_REGISTRY",
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostics[0]?.code, "LEDGER_INVALID");
});

Deno.test("FP-003Z ATTACK-03/04/05 reject forged revision, hash, and old Payment", async () => {
  const { seed, registry, command } = await seeded("attack-03-05");
  const service = createFp003ZTestService(registry);
  const forgedRevision = await service.validateCurrentDirectWorkChain({
    ...command,
    quoteRevision: "quote:forged-current",
  }, await contextForSeed(seed));
  assert.equal(forgedRevision.ok, false);
  if (!forgedRevision.ok) assert.equal(forgedRevision.code, "STALE_RECORD");

  const hashRegistry = new TamperedRegistry(
    registry,
    (chain) => ({
      ...chain,
      request: {
        ...chain.request,
        record: {
          ...chain.request.record,
          recordVersion: chain.request.record.recordVersion + 1,
        },
      },
    }),
  );
  const hashResult = await createFp003ZTestService(hashRegistry)
    .validateCurrentDirectWorkChain(command, await contextForSeed(seed));
  assert.equal(hashResult.ok, false);
  if (!hashResult.ok) {
    assert.equal(hashResult.code, "CANONICAL_RECORD_HASH_MISMATCH");
  }

  const oldPayment = await registry.materializeLedger({
    tenantContext: seed.tenantContext,
    membershipId:
      `membership:${seed.tenantContext.principalId}:${seed.tenantContext.tenantId}`,
    membershipRevision:
      `membership:${seed.tenantContext.principalId}:${seed.tenantContext.tenantId}:v1`,
    paymentId: seed.payment.paymentId,
    expectedRevision: "payment:v1",
    sourceEventId: seed.sourceEvent.eventId,
    ledgerEntryId: "old-payment-ledger",
  });
  assert.equal(oldPayment.ok, false);
  if (!oldPayment.ok) assert.equal(oldPayment.code, "STALE_PAYMENT");
});

Deno.test("FP-003Z ATTACK-06..13 reject every stale Direct Work stage", async () => {
  const { seed, registry, command } = await seeded("attack-stale-chain");
  const service = createFp003ZTestService(registry);
  const stages = [
    "requestRevision",
    "quoteRevision",
    "agreementRevision",
    "milestoneRevision",
    "deliveryRevision",
    "acceptanceRevision",
    "rightsRevision",
    "paymentRevision",
  ] as const;
  for (const field of stages) {
    const result = await service.validateCurrentDirectWorkChain({
      ...command,
      [field]: `${command[field]}:old`,
    }, await contextForSeed(seed));
    assert.equal(result.ok, false, `${field} must be rejected`);
    if (!result.ok) assert.equal(result.code, "STALE_RECORD", field);
  }
});

Deno.test("FP-003Z ATTACK-14/15/16 reject authority injection and use Registry records", async () => {
  const { seed, registry, command } = await seeded(
    "attack-authority-injection",
  );
  const originRegistry = new TamperedRegistry(
    registry,
    (chain) => ({
      ...chain,
      request: {
        ...chain.request,
        ref: { ...chain.request.ref, origin: "CLIENT" as never },
      },
    }),
  );
  const originResult = await createFp003ZTestService(originRegistry)
    .validateCurrentDirectWorkChain(command, await contextForSeed(seed));
  assert.equal(originResult.ok, false);
  if (!originResult.ok) {
    assert.equal(originResult.code, "CANONICAL_RECORD_INVALID");
  }

  const providerRegistry = new TamperedRegistry(
    registry,
    (chain) => ({
      ...chain,
      providerEvent: {
        ...chain.providerEvent,
        eventId: "attacker-provider-event" as never,
      },
    }),
  );
  const providerResult = await createFp003ZTestService(providerRegistry)
    .materializeDirectWorkSettlement(command, await contextForSeed(seed));
  assert.equal(providerResult.ok, false);
  if (!providerResult.ok) {
    assert.equal(providerResult.code, "PROVIDER_EVENT_INVALID");
  }

  const fakeCommand = {
    productRevisionId: "missing-product-revision",
    contributorSnapshot: { contributorId: "attacker" },
    licenseSemanticHash: "a".repeat(64),
  } as never;
  const fakeAuthorityResult = await createFp003ZTestService(registry)
    .deriveCollaborativeRevenue(fakeCommand);
  assert.equal(fakeAuthorityResult.ok, false);
  if (!fakeAuthorityResult.ok) {
    assert.equal(fakeAuthorityResult.code, "COMMAND_SCHEMA_INVALID");
  }

  void seed;
});

Deno.test("FP-003Z ATTACK-17/18 keep Server Authority out of Browser bundles and stale dist", async () => {
  const { seed, registry, command } = await seeded("attack-boundary");
  const tamperedAuthorityRegistry = new TamperedRegistry(
    registry,
    (chain) => ({
      ...chain,
      financial: {
        ...chain.financial,
        authority: {
          ...chain.financial.authority,
          paymentId: "attacker-payment" as never,
        },
      },
    }),
  );
  const result = await createFp003ZTestService(tamperedAuthorityRegistry)
    .materializeDirectWorkSettlement(command, await contextForSeed(seed));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "PAYMENT_BINDING_MISMATCH");
  // Static Browser/build boundary and stale-dist inventory are run by the paired audit script.
});
