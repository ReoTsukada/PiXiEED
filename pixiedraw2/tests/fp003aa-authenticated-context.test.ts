import { strict as assert } from "node:assert";
import { createFp003ZTestService } from "./fixtures/fp003z-test-composition.ts";
import { buildFp003ZDirectWorkChain } from "./fixtures/fp003z-direct-work-fixture.ts";
import { InMemoryAuthoritativeRegistry } from "./fixtures/in-memory-authoritative-registry.ts";
import { createTestServerAuthorityComposition } from "./fixtures/fp003aa-test-composition.ts";
import {
  contextForSeed,
  createFp003AaServerAuthFixture,
  requestFor,
} from "./fixtures/fp003aa-server-auth-fixture.ts";
import {
  consumeServerAuthorityRequestContext,
  isAuthenticatedServerPrincipal,
  isServerAuthorityRequestContext,
} from "../src/server/internal/authenticated-context.ts";
import type { CanonicalRegistryAdapter } from "../src/server/authority-contracts.ts";

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

async function seeded(suffix: string, tenantId = "tenant-aa") {
  const seed = await buildFp003ZDirectWorkChain({
    suffix,
    tenantId,
    eventNamespace: suffix,
  });
  const registry = new InMemoryAuthoritativeRegistry();
  await registry.seedDirectWorkChain(seed);
  return {
    seed,
    registry,
    service: createFp003ZTestService(registry),
    command: commandFor(seed),
  };
}

Deno.test("FP-003AA authenticated Server Handler reaches Composition Service", async () => {
  const { seed, registry, command } = await seeded("handler-e2e");
  const fixture = createFp003AaServerAuthFixture({ registry });
  fixture.authAdapter.register({
    sessionReference: "session-valid",
    principalId: seed.tenantContext.principalId!,
    tenantIds: [seed.tenantContext.tenantId],
  });
  const request = requestFor({
    requestId: seed.request.requestId,
    sessionReference: "session-valid",
    requestedTenantId: seed.tenantContext.tenantId,
  });

  const validation = await fixture.handler.validateCurrentDirectWorkChain(
    request,
    command,
  );
  assert.equal(validation.ok, true);
  const settlement = await fixture.handler.materializeDirectWorkSettlement(
    request,
    command,
  );
  assert.equal(settlement.ok, true);
  if (settlement.ok) {
    assert.equal(
      settlement.value.ledgerEntry.paymentId,
      seed.payment.paymentId,
    );
  }
});

Deno.test("FP-003AA rejects a caller-created shape-valid Context", async () => {
  const { seed, service, command } = await seeded("forged-context");
  const raw = {
    schemaVersion: "SERVER_AUTHORITY_REQUEST_CONTEXT_V1",
    source: "SERVER_COMPOSITION_ROOT",
    tenantContext: {
      schemaVersion: "SERVER_TENANT_CONTEXT_V1",
      tenantId: seed.tenantContext.tenantId,
      principalId: seed.tenantContext.principalId,
      source: "SERVER_REGISTRY",
    },
    principalId: seed.tenantContext.principalId,
    authSessionId: "attacker-session",
    requestId: seed.request.requestId,
    resourceType: "DIRECT_WORK_REQUEST",
    resourceId: seed.request.requestId,
    correlationId: "attacker-correlation",
    issuedAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  } as never;
  const result = await service.validateCurrentDirectWorkChain(command, raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "SERVER_CONTEXT_INVALID");
});

Deno.test("FP-003AA rejects fake sessions, unauthorized Tenant, and wrong same-ID resource", async () => {
  const a = await seeded("same-id", "tenant-a");
  const b = await seeded("same-id", "tenant-b");
  await a.registry.seedDirectWorkChain(b.seed);
  const fixture = createFp003AaServerAuthFixture({ registry: a.registry });
  fixture.authAdapter.register({
    sessionReference: "session-a",
    principalId: a.seed.tenantContext.principalId!,
    tenantIds: ["tenant-a"],
  });

  const fakeSession = await fixture.handler.validateCurrentDirectWorkChain(
    requestFor({
      requestId: a.seed.request.requestId,
      sessionReference: "fake-session",
      requestedTenantId: "tenant-a",
    }),
    a.command,
  );
  assert.equal(fakeSession.ok, false);
  const unauthorizedTenant = await fixture.handler
    .validateCurrentDirectWorkChain(
      requestFor({
        requestId: a.seed.request.requestId,
        sessionReference: "session-a",
        requestedTenantId: "tenant-b",
      }),
      a.command,
    );
  assert.equal(unauthorizedTenant.ok, false);
  const wrongTenantResource = await fixture.handler
    .validateCurrentDirectWorkChain(
      requestFor({
        requestId: b.seed.request.requestId,
        sessionReference: "session-a",
        requestedTenantId: "tenant-b",
      }),
      b.command,
    );
  assert.equal(wrongTenantResource.ok, false);
});

Deno.test("FP-003AA rejects expired and future-issued Principal sessions", async () => {
  const { seed, registry, command } = await seeded("lifetime");
  const fixture = createFp003AaServerAuthFixture({ registry });
  fixture.authAdapter.register({
    sessionReference: "expired",
    principalId: seed.tenantContext.principalId!,
    tenantIds: [seed.tenantContext.tenantId],
    issuedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });
  fixture.authAdapter.register({
    sessionReference: "future",
    principalId: seed.tenantContext.principalId!,
    tenantIds: [seed.tenantContext.tenantId],
    issuedAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 11 * 60_000).toISOString(),
  });
  const expired = await fixture.handler.validateCurrentDirectWorkChain(
    requestFor({
      requestId: seed.request.requestId,
      sessionReference: "expired",
      requestedTenantId: seed.tenantContext.tenantId,
    }),
    command,
  );
  const future = await fixture.handler.validateCurrentDirectWorkChain(
    requestFor({
      requestId: seed.request.requestId,
      sessionReference: "future",
      requestedTenantId: seed.tenantContext.tenantId,
    }),
    command,
  );
  assert.equal(expired.ok, false);
  assert.equal(future.ok, false);
});

Deno.test("FP-003AA rejects a revoked current Tenant membership", async () => {
  const { seed, registry, command } = await seeded("revoked-membership");
  const fixture = createFp003AaServerAuthFixture({ registry });
  const principalId = seed.tenantContext.principalId!;
  const membershipId =
    `membership:${principalId}:${seed.tenantContext.tenantId}`;
  fixture.authAdapter.register({
    sessionReference: "session-revoked",
    principalId,
    tenantIds: [seed.tenantContext.tenantId],
  });
  fixture.tenantResolver.setMembershipStatus(
    principalId,
    membershipId,
    "REVOKED",
  );
  const result = await fixture.handler.validateCurrentDirectWorkChain(
    requestFor({
      requestId: seed.request.requestId,
      sessionReference: "session-revoked",
      requestedTenantId: seed.tenantContext.tenantId,
    }),
    command,
  );
  assert.equal(result.ok, false);
});

Deno.test("FP-003AA fails closed for malformed or throwing Auth Providers", async () => {
  const { seed, registry, command } = await seeded("malformed-provider");
  const request = requestFor({
    requestId: seed.request.requestId,
    sessionReference: "malformed",
    requestedTenantId: seed.tenantContext.tenantId,
  });
  const resolver = {
    membershipRegistry: {
      async getCurrent() {
        return null;
      },
    },
    resolve: async () => null,
  };
  const malformed = createTestServerAuthorityComposition({
    registry,
    authProvider: {
      async authenticate() {
        return undefined as never;
      },
    },
    tenantResolver: resolver,
  });
  assert.equal("service" in malformed, false);
  const malformedResult = await malformed.handler
    .validateCurrentDirectWorkChain(request, command);
  assert.equal(malformedResult.ok, false);
  const throwing = createTestServerAuthorityComposition({
    registry,
    authProvider: {
      async authenticate() {
        throw new Error("provider unavailable");
      },
    },
    tenantResolver: resolver,
  });
  const throwingResult = await throwing.handler
    .validateCurrentDirectWorkChain(request, command);
  assert.equal(throwingResult.ok, false);
});

Deno.test("FP-003AA consumes Context once and rejects replay/clone", async () => {
  const { seed, service, command } = await seeded("replay");
  const context = await contextForSeed(seed);
  const first = await service.validateCurrentDirectWorkChain(command, context);
  const replay = await service.validateCurrentDirectWorkChain(command, context);
  const clone = await service.validateCurrentDirectWorkChain(
    command,
    structuredClone(context) as never,
  );
  assert.equal(first.ok, true);
  assert.equal(replay.ok, false);
  assert.equal(clone.ok, false);
});

Deno.test("FP-003AA rejects concurrent double-consume before membership lookup", async () => {
  const { seed, registry } = await seeded("concurrent-consume");
  const context = await contextForSeed(seed);
  let calls = 0;
  let release!: () => void;
  let entered!: () => void;
  const lookupEntered = new Promise<void>((resolve) => entered = resolve);
  const lookupRelease = new Promise<void>((resolve) => release = resolve);
  const membershipRegistry = {
    async getCurrent(
      input: Parameters<typeof registry.membershipRegistry.getCurrent>[0],
    ) {
      calls += 1;
      entered();
      await lookupRelease;
      return registry.membershipRegistry.getCurrent(input);
    },
  };
  const first = consumeServerAuthorityRequestContext(context, {
    resourceType: "DIRECT_WORK_REQUEST",
    resourceId: seed.request.requestId,
    membershipRegistry,
  });
  await lookupEntered;
  const second = await consumeServerAuthorityRequestContext(context, {
    resourceType: "DIRECT_WORK_REQUEST",
    resourceId: seed.request.requestId,
    membershipRegistry,
  });
  release();
  assert.equal(await first, true);
  assert.equal(second, false);
  assert.equal(calls, 1);
});

Deno.test("FP-003AA concurrent Settlement consumes one Context and materializes one Ledger", async () => {
  const { seed, registry, command } = await seeded(
    "concurrent-settlement",
  );
  const context = await contextForSeed(seed);
  let ledgerCalls = 0;
  const gatedRegistry = new Proxy(registry, {
    get(target, property, receiver) {
      if (property === "materializeLedger") {
        return async (
          input: Parameters<CanonicalRegistryAdapter["materializeLedger"]>[0],
        ) => {
          ledgerCalls += 1;
          return target.materializeLedger(input);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as CanonicalRegistryAdapter;
  const gatedService = createFp003ZTestService(gatedRegistry);
  const results = await Promise.all([
    gatedService.materializeDirectWorkSettlement(command, context),
    gatedService.materializeDirectWorkSettlement(command, context),
  ]);
  assert.deepEqual(results.map((result) => result.ok), [true, false]);
  assert.equal(ledgerCalls, 1);
});

Deno.test("FP-003AA rejects Membership revocation between Chain load and Ledger", async () => {
  const { seed, registry, command } = await seeded("revocation-before-ledger");
  const context = await contextForSeed(seed);
  const principalId = seed.tenantContext.principalId!;
  const membershipId =
    `membership:${principalId}:${seed.tenantContext.tenantId}`;
  const revokingRegistry = new Proxy(registry, {
    get(target, property, receiver) {
      if (property === "getCurrentDirectWorkChain") {
        return async (
          input: Parameters<
            CanonicalRegistryAdapter["getCurrentDirectWorkChain"]
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
  }) as CanonicalRegistryAdapter;
  const result = await createFp003ZTestService(revokingRegistry)
    .materializeDirectWorkSettlement(command, context);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "STALE_MEMBERSHIP");
});

Deno.test("FP-003AA fails closed for malformed Ledger success responses", async () => {
  for (const malformed of [undefined, null, {}, { ok: true }] as const) {
    const { seed, registry, command } = await seeded(
      `malformed-ledger-${malformed === null ? "null" : typeof malformed}`,
    );
    const context = await contextForSeed(seed);
    const malformedRegistry = new Proxy(registry, {
      get(target, property, receiver) {
        if (property === "materializeLedger") {
          return async () => malformed as never;
        }
        return Reflect.get(target, property, receiver);
      },
    }) as CanonicalRegistryAdapter;
    const result = await createFp003ZTestService(malformedRegistry)
      .materializeDirectWorkSettlement(command, context);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "REGISTRY_INVALID_RESPONSE");
  }
});

Deno.test("FP-003AA rejects a Context after current Membership revocation", async () => {
  const { seed, registry, service, command } = await seeded(
    "revocation-after-issue",
  );
  const context = await contextForSeed(seed);
  registry.membershipRegistry.setStatus(
    seed.tenantContext.principalId!,
    `membership:${seed.tenantContext.principalId}:${seed.tenantContext.tenantId}`,
    "REVOKED",
  );
  const result = await service.validateCurrentDirectWorkChain(command, context);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "SERVER_CONTEXT_INVALID");
});

Deno.test("FP-003AA rejects non-finite lifetime clocks", async () => {
  const { seed, registry } = await seeded("finite-clock");
  const context = await contextForSeed(seed);
  assert.equal(isServerAuthorityRequestContext(context, Number.NaN), false);
  assert.equal(
    isServerAuthorityRequestContext(context, Number.POSITIVE_INFINITY),
    false,
  );
  const fixture = createFp003AaServerAuthFixture({ registry });
  fixture.authAdapter.register({
    sessionReference: "finite-clock-session",
    principalId: seed.tenantContext.principalId!,
    tenantIds: [seed.tenantContext.tenantId],
  });
  const principal = await fixture.authProvider.authenticate(
    requestFor({
      requestId: seed.request.requestId,
      sessionReference: "finite-clock-session",
      requestedTenantId: seed.tenantContext.tenantId,
    }),
  );
  assert.notEqual(principal, null);
  assert.equal(isAuthenticatedServerPrincipal(principal, Number.NaN), false);
  assert.equal(
    isAuthenticatedServerPrincipal(principal, Number.NEGATIVE_INFINITY),
    false,
  );
});

Deno.test("FP-003AA normalizes Registry exceptions and malformed responses to DENY", async () => {
  const { seed, registry, command } = await seeded("registry-failure");
  const throwingRegistry = new Proxy(registry, {
    get(target, property, receiver) {
      if (property === "getCurrentDirectWorkChain") {
        return async () => {
          throw new Error("registry unavailable");
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as CanonicalRegistryAdapter;
  const throwingResult = await createFp003ZTestService(throwingRegistry)
    .validateCurrentDirectWorkChain(command, await contextForSeed(seed));
  assert.equal(throwingResult.ok, false);
  if (!throwingResult.ok) {
    assert.equal(throwingResult.code, "REGISTRY_UNAVAILABLE");
  }

  const malformedRegistry = new Proxy(registry, {
    get(target, property, receiver) {
      if (property === "getCurrentDirectWorkChain") {
        return async () => ({}) as never;
      }
      return Reflect.get(target, property, receiver);
    },
  }) as CanonicalRegistryAdapter;
  const malformedResult = await createFp003ZTestService(malformedRegistry)
    .validateCurrentDirectWorkChain(command, await contextForSeed(seed));
  assert.equal(malformedResult.ok, false);
  if (!malformedResult.ok) {
    assert.equal(malformedResult.code, "REGISTRY_INVALID_RESPONSE");
  }
});

Deno.test("FP-003AA Release Composition Root exposes only the fixed Handler", async () => {
  const root = await import("../src/server/authority-composition-root.ts");
  assert.deepEqual(Object.keys(root), ["fp003zHandler"]);
  assert.equal("createServerAuthorityCompositionRoot" in root, false);
  assert.equal("createServerAuthorityHandler" in root, false);
  assert.equal("composeAuthorityService" in root, false);
});

Deno.test("FP-003AA correlation is trace-only and does not grant Tenant authority", async () => {
  const { seed, registry, command } = await seeded("correlation");
  const fixture = createFp003AaServerAuthFixture({ registry });
  fixture.authAdapter.register({
    sessionReference: "session-correlation",
    principalId: seed.tenantContext.principalId!,
    tenantIds: [seed.tenantContext.tenantId],
  });
  const result = await fixture.handler.validateCurrentDirectWorkChain(
    requestFor({
      requestId: seed.request.requestId,
      sessionReference: "session-correlation",
      requestedTenantId: seed.tenantContext.tenantId,
      correlationId: "caller-chosen-correlation",
    }),
    command,
  );
  assert.equal(result.ok, true);
});

Deno.test("FP-003AA Browser entries cannot import the server Context factory", async () => {
  for (
    const entry of [
      "wp230-sns-bundle-entry.ts",
      "wp240-bundle-entry.ts",
      "wp250-bundle-entry.ts",
      "draw2-entry.ts",
    ]
  ) {
    const source = await Deno.readTextFile(
      new URL(`../src/${entry}`, import.meta.url),
    );
    assert.equal(
      /authenticated-context|server-authority-handler|ServerAuthorityRequestContext/
        .test(source),
      false,
      entry,
    );
  }
});
