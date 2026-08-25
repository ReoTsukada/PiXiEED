#!/usr/bin/env -S deno run --no-remote

import { buildFp003ZDirectWorkChain } from "../pixiedraw2/tests/fixtures/fp003z-direct-work-fixture.ts";
import { InMemoryAuthoritativeRegistry } from "../pixiedraw2/tests/fixtures/in-memory-authoritative-registry.ts";
import {
  contextForSeed,
} from "../pixiedraw2/tests/fixtures/fp003aa-server-auth-fixture.ts";
import { createFp003ZTestService } from "../pixiedraw2/tests/fixtures/fp003z-test-composition.ts";
import {
  consumeServerAuthorityRequestContext,
} from "../pixiedraw2/src/server/internal/authenticated-context.ts";

function commandFor(
  seed: Awaited<ReturnType<typeof buildFp003ZDirectWorkChain>>,
) {
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

async function seeded(suffix: string) {
  const seed = await buildFp003ZDirectWorkChain({
    suffix,
    tenantId: "independent-audit",
    eventNamespace: suffix,
  });
  const registry = new InMemoryAuthoritativeRegistry();
  await registry.seedDirectWorkChain(seed);
  return { seed, registry, command: commandFor(seed) };
}

const consumeCase = await seeded("independent-consume");
const consumeContext = await contextForSeed(consumeCase.seed);
let releaseLookup!: () => void;
let enteredLookup!: () => void;
const lookupEntered = new Promise<void>((resolve) => enteredLookup = resolve);
const lookupRelease = new Promise<void>((resolve) => releaseLookup = resolve);
let membershipCalls = 0;
const gatedMembership = {
  async getCurrent(
    input: Parameters<
      typeof consumeCase.registry.membershipRegistry.getCurrent
    >[0],
  ) {
    membershipCalls += 1;
    enteredLookup();
    await lookupRelease;
    return consumeCase.registry.membershipRegistry.getCurrent(input);
  },
};
const firstConsume = consumeServerAuthorityRequestContext(consumeContext, {
  resourceType: "DIRECT_WORK_REQUEST",
  resourceId: consumeCase.seed.request.requestId,
  membershipRegistry: gatedMembership,
});
await lookupEntered;
const secondConsume = await consumeServerAuthorityRequestContext(
  consumeContext,
  {
    resourceType: "DIRECT_WORK_REQUEST",
    resourceId: consumeCase.seed.request.requestId,
    membershipRegistry: gatedMembership,
  },
);
releaseLookup();
const firstConsumeResult = await firstConsume;
if (
  firstConsumeResult !== true || secondConsume !== false ||
  membershipCalls !== 1
) {
  throw new Error("concurrent context consume was not single-use");
}

const concurrentCase = await seeded("independent-concurrent-settlement");
const concurrentContext = await contextForSeed(concurrentCase.seed);
let ledgerCalls = 0;
const concurrentRegistry = new Proxy(concurrentCase.registry, {
  get(target, property, receiver) {
    if (property === "materializeLedger") {
      return async (
        input: Parameters<
          InMemoryAuthoritativeRegistry["materializeLedger"]
        >[0],
      ) => {
        ledgerCalls += 1;
        return target.materializeLedger(input);
      };
    }
    return Reflect.get(target, property, receiver);
  },
});
const concurrentService = createFp003ZTestService(concurrentRegistry);
const concurrentResults = await Promise.all([
  concurrentService.materializeDirectWorkSettlement(
    concurrentCase.command,
    concurrentContext,
  ),
  concurrentService.materializeDirectWorkSettlement(
    concurrentCase.command,
    concurrentContext,
  ),
]);
if (
  concurrentResults.filter((result) => result.ok).length !== 1 ||
  ledgerCalls !== 1
) {
  throw new Error("concurrent settlement materialized more than one Ledger");
}

const revokeCase = await seeded("independent-revoke-before-ledger");
const revokeContext = await contextForSeed(revokeCase.seed);
const principalId = revokeCase.seed.tenantContext.principalId!;
const membershipId =
  `membership:${principalId}:${revokeCase.seed.tenantContext.tenantId}`;
const revokingRegistry = new Proxy(revokeCase.registry, {
  get(target, property, receiver) {
    if (property === "getCurrentDirectWorkChain") {
      return async (
        input: Parameters<
          InMemoryAuthoritativeRegistry["getCurrentDirectWorkChain"]
        >[0],
      ) => {
        const chain = await target.getCurrentDirectWorkChain(input);
        target.membershipRegistry.setStatus(
          principalId,
          membershipId,
          "REVOKED",
        );
        return chain;
      };
    }
    return Reflect.get(target, property, receiver);
  },
});
const revokeResult = await createFp003ZTestService(revokingRegistry)
  .materializeDirectWorkSettlement(revokeCase.command, revokeContext);
if (revokeResult.ok || revokeResult.code !== "STALE_MEMBERSHIP") {
  throw new Error("revoked Membership was accepted by Ledger settlement");
}

const malformedResults: Array<
  { readonly input: unknown; readonly code: string }
> = [];
for (const malformed of [undefined, null, {}, { ok: true }] as const) {
  const malformedCase = await seeded(
    `independent-malformed-${malformed === null ? "null" : typeof malformed}`,
  );
  const malformedContext = await contextForSeed(malformedCase.seed);
  const malformedRegistry = new Proxy(malformedCase.registry, {
    get(target, property, receiver) {
      if (property === "materializeLedger") {
        return async () => malformed;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const result = await createFp003ZTestService(malformedRegistry)
    .materializeDirectWorkSettlement(malformedCase.command, malformedContext);
  if (result.ok || result.code !== "REGISTRY_INVALID_RESPONSE") {
    throw new Error("malformed Ledger response was accepted");
  }
  malformedResults.push({ input: malformed, code: result.code });
}

console.log(JSON.stringify(
  {
    concurrentConsume: [firstConsumeResult, secondConsume],
    membershipCalls,
    concurrentSettlementOk: concurrentResults.map((result) => result.ok),
    ledgerCalls,
    revocationCode: revokeResult.code,
    malformedResults,
  },
  null,
  2,
));
