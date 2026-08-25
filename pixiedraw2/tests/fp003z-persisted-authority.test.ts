import { strict as assert } from "node:assert";
import { createFp003ZTestService } from "./fixtures/fp003z-test-composition.ts";
import { buildFp003ZDirectWorkChain } from "./fixtures/fp003z-direct-work-fixture.ts";
import { InMemoryAuthoritativeRegistry } from "./fixtures/in-memory-authoritative-registry.ts";
import { contextForSeed } from "./fixtures/fp003aa-server-auth-fixture.ts";
import type { DirectWorkAuthorityCommand } from "../src/server/authority-composition-internal.ts";

function commandFor(seed: Awaited<ReturnType<typeof buildFp003ZDirectWorkChain>>): DirectWorkAuthorityCommand {
  return {
    requestId: seed.request.requestId, requestRevision: "request:v2",
    quoteId: seed.quote.quoteId, quoteRevision: "quote:v2",
    agreementId: seed.agreement.agreementId, agreementRevision: "agreement:v3",
    milestoneId: seed.milestone.milestoneId, milestoneRevision: "milestone:v4",
    deliveryId: seed.delivery.deliveryId, deliveryRevision: "delivery:v2",
    acceptanceId: seed.acceptance.acceptanceId, acceptanceRevision: "acceptance:v1",
    rightsDecisionId: seed.rights.rightsDecisionId, rightsRevision: "rights:v1",
    paymentId: seed.payment.paymentId, paymentRevision: "payment:v3",
    sourceEventId: seed.sourceEvent.eventId, providerEventId: seed.providerEvent.eventId,
  };
}

Deno.test("FP-003Z rejects stale persisted revisions at every Direct Work stage", async () => {
  const registry = new InMemoryAuthoritativeRegistry();
  const seed = await buildFp003ZDirectWorkChain("all-stages");
  await registry.seedDirectWorkChain(seed);
  const service = createFp003ZTestService(registry);
  const base = commandFor(seed);
  const valid = await service.validateCurrentDirectWorkChain(base, await contextForSeed(seed));
  assert.equal(valid.ok, true);
  for (const field of ["requestRevision", "quoteRevision", "agreementRevision", "milestoneRevision", "deliveryRevision", "acceptanceRevision", "rightsRevision", "paymentRevision"] as const) {
    const stale = await service.validateCurrentDirectWorkChain({ ...base, [field]: `${base[field]}:old` }, await contextForSeed(seed));
    assert.equal(stale.ok, false, `${field} must be rejected`);
    if (!stale.ok) assert.equal(stale.code, "STALE_RECORD");
  }
});

Deno.test("FP-003Z derives Ledger only from current Registry Payment ID", async () => {
  const registry = new InMemoryAuthoritativeRegistry();
  const seed = await buildFp003ZDirectWorkChain("ledger");
  await registry.seedDirectWorkChain(seed);
  const service = createFp003ZTestService(registry);
  const command = commandFor(seed);
  const result = await service.materializeDirectWorkSettlement(command, await contextForSeed(seed));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.ledgerEntry.paymentId, seed.payment.paymentId);
  const forgedRevision = await service.materializeDirectWorkSettlement({ ...command, paymentRevision: "payment:v999" }, await contextForSeed(seed));
  assert.equal(forgedRevision.ok, false);
  if (!forgedRevision.ok) assert.equal(forgedRevision.code, "STALE_RECORD");
});
