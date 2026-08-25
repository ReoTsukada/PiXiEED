import {
  bindCanonicalTenantMembership,
  createServerAuthorityRequestContext,
  createServerAuthPrincipalProvider,
} from "../../src/server/internal/authenticated-context.ts";
import { createCore100Root } from "../../src/core/core-100/composition-root.ts";
import { createCore100ServerContext } from "../../src/core/core-100/authority-boundary.ts";
import type {
  Core100Command,
  Core100ConsumerId,
  Core100ConsumerResult,
  Core100Dependencies,
  Core100Operation,
} from "../../src/core/core-100/contracts.ts";
import type { ContentHash } from "../../src/wp160-contracts.ts";
import type {
  Fp004CanonicalEvent,
  Fp004CommitResult,
  Fp004EventDraft,
  Fp004OutboxRecord,
  Fp004Result,
} from "../../src/fp-004/contracts.ts";
import type {
  Fp004CompletionResult,
  Fp004Delivery,
  Fp004InboxAcceptance,
  Fp004LeasedOutbox,
} from "../../src/fp-004/inbox-outbox-lease.ts";

const HASH = "a".repeat(64) as ContentHash;
const now = Date.now();
const iso = (offset: number) => new Date(now + offset).toISOString();

function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
  }
}
function failure<T = never>(message = "fixture failure"): Fp004Result<T> {
  return {
    ok: false,
    diagnostics: [{ code: "TRANSACTION_ABORTED", message, recoverable: false }],
  };
}

const event = (eventId = "event-1"): Fp004EventDraft => ({
  schemaVersion: "DURABLE_EVENT_V1" as const,
  eventId: eventId as never,
  eventKind: "DOMAIN_FACT" as const,
  aggregate: {
    tenantId: "tenant-1",
    aggregateType: "draw",
    aggregateId: "asset-1",
    aggregateVersion: 1,
    resourceType: "draw",
    resourceId: "asset-1",
  },
  payloadHash: HASH,
  resultHash: HASH,
  correlationId: "correlation-1",
  producerType: "draw2",
});

const command = (
  operation: Core100Command["operation"] = "COMMIT",
  extra: Record<string, unknown> = {},
): Core100Command => ({
  schemaVersion: "CORE-100_V1",
  schema: { name: "core-100.command", exactVersion: "1", digest: HASH },
  operation,
  tenantId: "tenant-1",
  resourceType: "draw",
  resourceId: "asset-1",
  action: "draw.commit",
  capability: "draw.commit",
  idempotencyKey: "idempotency-1",
  requestHash: HASH,
  event: event(),
  stateReference: {
    resourceType: "draw",
    resourceId: "asset-1",
    expectedRevision: "revision-1",
    nextRevision: "revision-2",
    stateHash: HASH,
  },
  ...extra,
});

const proof = (
  action: string,
  capability: string,
  principalId = "user-1",
  baseNow = now,
  lifetimeMs = 60_000,
) => ({
  schemaVersion: 1 as const,
  proofType: "AUTHORIZATION_PROOF" as const,
  source: "server" as const,
  decision: "allow" as const,
  authorityId: "server-authority",
  proofId: `proof-${action}`,
  principalId,
  resourceType: "draw",
  resourceId: "asset-1",
  action,
  capability,
  tenantId: "tenant-1",
  correlationId: "correlation-1",
  policyVersion: "authorization-policy-v1",
  grantId: "grant-1",
  issuedAt: new Date(baseNow - 1000).toISOString(),
  expiresAt: new Date(baseNow + lifetimeMs).toISOString(),
});

async function serverContext(
  action = "draw.commit",
  capability = "draw.commit",
  clockOffset = 0,
  lifetimeMs = 60_000,
) {
  const contextNow = Date.now() + clockOffset;
  const principalProof = {
    ...proof(
      "server.authority.context.create",
      "server.authority.context.create",
      "user-1",
      contextNow,
      lifetimeMs,
    ),
    resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
    resourceId: "session-1",
    tenantId: null,
    correlationId: "correlation-1",
  };
  const provider = createServerAuthPrincipalProvider({
    verify: async () => ({
      principalId: "user-1",
      authSessionId: "session-1",
      assurance: "SESSION_VERIFIED" as const,
      tenantMemberships: [{
        membershipId: "membership-1",
        principalId: "user-1",
        tenantId: "tenant-1",
        membershipRevision: "membership-r1",
        status: "ACTIVE" as const,
      }],
      authorizationProof: principalProof,
      issuedAt: new Date(contextNow - 1000).toISOString(),
      expiresAt: new Date(contextNow + lifetimeMs).toISOString(),
      correlationId: "correlation-1",
    }),
  });
  const principal = await provider.authenticate({
    requestId: "request-1",
    resourceType: "draw",
    resourceId: "asset-1",
    sessionReference: "session-1",
    correlationId: "correlation-1",
  });
  assert(principal);
  const membership = bindCanonicalTenantMembership({
    principal,
    membership: principal.tenantMemberships[0]!,
  });
  const actionProof = proof(
    action,
    capability,
    "user-1",
    contextNow,
    lifetimeMs,
  );
  const authorityContext = createServerAuthorityRequestContext({
    principal,
    membership,
    authorizationProof: actionProof,
    request: {
      requestId: "request-1",
      resourceType: "draw",
      resourceId: "asset-1",
      correlationId: "correlation-1",
    },
  });
  return createCore100ServerContext({
    authorityContext,
    action,
    capability,
    now: contextNow,
  });
}

const canonicalEvent = (eventId = "event-1"): Fp004CanonicalEvent => ({
  ...event(eventId),
  transactionId: "transaction-1" as never,
  committedAt: iso(1000),
});

const inboxResolution = () => ({
  principalId: "user-1",
  tenantId: "tenant-1",
  resourceType: "draw",
  resourceId: "asset-1",
  canonicalEventId: "event-1" as never,
  providerIdentity: {
    providerName: "fixture-provider",
    providerEventId: "provider-event-1",
    payloadHash: HASH,
    eventType: "payment.completed",
    providerSchemaVersion: "1",
  },
});

const validInboxAcceptance = (): Fp004InboxAcceptance => ({
  inbox: {
    inboxId: "inbox:event-1" as never,
    providerIdentity: inboxResolution().providerIdentity,
    tenantId: "tenant-1",
    resourceType: "draw",
    resourceId: "asset-1",
    state: "ACCEPTED",
    canonicalEventId: "event-1" as never,
    attemptCount: 0,
  },
  duplicate: false,
  acknowledgement: "PENDING_LEASE",
});

const validLeasedOutbox = (
  eventId = "event-1",
): Fp004LeasedOutbox => ({
  record: {
    outboxId: `outbox:${eventId}` as never,
    eventId: eventId as never,
    aggregate: event(eventId).aggregate,
    state: "LEASED",
    attemptCount: 1,
    nextAttemptAt: iso(1000),
  },
  lease: {
    ownerId: "owner-1",
    fencingToken: "fence-1" as never,
    acquiredAt: iso(0),
    expiresAt: iso(60_000),
    attempt: 1,
  },
});

const validDelivery = (): Fp004Delivery => ({
  outcome: "SUCCESS",
  resultHash: HASH,
});

const validCompletion = (
  record: Fp004OutboxRecord,
): Fp004CompletionResult => ({
  record,
  outcome: "SUCCESS",
  acknowledged: true,
  sideEffectAllowed: false,
  duplicate: false,
});

const validConsumerResult = (
  consumerId: Core100ConsumerId,
  idempotency: Core100ConsumerResult["idempotency"],
): Core100ConsumerResult => ({
  consumerId,
  projectionRevision: `${consumerId.toLowerCase()}:projection:v1`,
  projectionHash: HASH,
  idempotency,
});

const validCommitResult = (): Fp004CommitResult => ({
  transactionId: "transaction-1" as never,
  event: {
    ...event(),
    transactionId: "transaction-1" as never,
    committedAt: iso(1000),
  },
  outbox: {
    outboxId: "outbox-1" as never,
    eventId: "event-1" as never,
    aggregate: event().aggregate,
    state: "PENDING",
    attemptCount: 0,
    nextAttemptAt: iso(1000),
  },
  idempotency: {
    idempotencyId: "idempotency-record-1" as never,
    scope: "CORE-100",
    key: "idempotency-1",
    requestHash: HASH,
    resultHash: HASH,
    eventId: "event-1" as never,
    transactionId: "transaction-1" as never,
  },
  duplicate: false,
});

const dependencies = (
  overrides: Partial<Core100Dependencies> = {},
): Core100Dependencies => ({
  durable: {
    adapterId: "fixture",
    capabilities: ["COMMIT", "FINANCE", "NOTIFICATION", "SEARCH"],
    commit: async () => failure(),
  },
  inboxOutbox: {
    adapterId: "fixture",
    capabilities: [
      "COMMIT",
      "INBOX_ACCEPT",
      "OUTBOX_DISPATCH",
      "FINANCE",
      "NOTIFICATION",
      "SEARCH",
    ],
    acceptInbox: async () => failure(),
    leaseOutbox: async () => failure(),
    completeOutbox: async () => failure(),
  },
  membershipRegistry: {
    getCurrent: async ({ principalId, membershipId, tenantId }) => ({
      principalId,
      membershipId,
      tenantId,
      membershipRevision: "membership-r1",
      status: "ACTIVE" as const,
    }),
  },
  privacyStorage: {
    policy: {} as never,
    validate: () => ({ ok: true, value: undefined, diagnostics: [] }),
  },
  schemaBuild: { schemaRegistry: {} as never, resolve: () => ({}) as never },
  transport: null,
  finance: { consumerId: "FINANCE", consume: async () => failure() },
  notification: { consumerId: "NOTIFICATION", consume: async () => failure() },
  search: { consumerId: "SEARCH", consume: async () => failure() },
  ...overrides,
});

Deno.test("CORE-100 defaults OFF, unknown and extra flags fail closed", async () => {
  const off = await createCore100Root(dependencies()).execute(
    {} as never,
    {} as never,
  );
  assertEquals(off.ok, false);
  if (!off.ok) assertEquals(off.diagnostics[0]!.code, "FEATURE_DISABLED");
  const unknown = await createCore100Root(dependencies(), {}).execute(
    {} as never,
    {} as never,
  );
  assertEquals(unknown.ok, false);
  if (!unknown.ok) assertEquals(unknown.diagnostics[0]!.code, "UNKNOWN_FEATURE");
  const extra = await createCore100Root(dependencies(), {
    "core-100": true,
    unknown: true,
  }).execute({} as never, {} as never);
  assertEquals(extra.ok, false);
  if (!extra.ok) assertEquals(extra.diagnostics[0]!.code, "UNKNOWN_FEATURE");
});

Deno.test("CORE-100 rejects invalid command before adapters", async () => {
  let calls = 0;
  const root = createCore100Root(
    dependencies({
      durable: {
        ...dependencies().durable,
        commit: async () => {
          calls++;
          return failure();
        },
      },
    }),
    { "core-100": true },
  );
  const result = await root.execute(
    {} as never,
    { operation: "COMMIT" } as never,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.diagnostics[0]!.code, "INPUT_INVALID");
  assertEquals(calls, 0);
});

Deno.test("CORE-100 rejects copied, JSON and caller-injected authority", async () => {
  const root = createCore100Root(dependencies(), { "core-100": true });
  const real = await serverContext();
  const copied = { ...real };
  const json = JSON.parse(JSON.stringify(real));
  for (const fake of [{ trusted: true }, copied, json, new Proxy(real, {})]) {
    const result = await root.execute(fake as never, command());
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.diagnostics[0]!.code, "AUTHORITY_DENIED");
    }
  }
  let rebindRejected = false;
  try {
    createCore100ServerContext({
      authorityContext: real.authorityContext,
      action: "draw.commit",
      capability: "draw.commit",
      authorizationProof: proof("draw.commit", "draw.commit"),
    } as never);
  } catch {
    rebindRejected = true;
  }
  assert(rebindRejected, "caller proof cannot re-mint a CORE-100 context");
});

Deno.test("CORE-100 rejects expired and mis-bound authority before adapters", async () => {
  let calls = 0;
  const root = createCore100Root(
    dependencies({
      durable: {
        ...dependencies().durable,
        commit: async () => {
          calls++;
          return failure();
        },
      },
    }),
    { "core-100": true },
  );
  const misBound = await root.execute(
    await serverContext(),
    command("COMMIT", {
      action: "draw.export",
      capability: "draw.export",
    }),
  );
  assertEquals(misBound.ok, false);
  if (!misBound.ok) {
    assertEquals(misBound.diagnostics[0]!.code, "AUTHORITY_DENIED");
  }
  assertEquals(calls, 0);

  const expiring = await serverContext("draw.commit", "draw.commit", 0, 1000);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const expired = await root.execute(expiring, command());
  assertEquals(expired.ok, false);
  if (!expired.ok) {
    assertEquals(expired.diagnostics[0]!.code, "AUTHORITY_DENIED");
  }
  assertEquals(calls, 0);
});

Deno.test("CORE-100 rechecks canonical membership before any adapter", async () => {
  let calls = 0;
  const root = createCore100Root(
    dependencies({
      durable: {
        ...dependencies().durable,
        commit: async () => {
          calls++;
          return failure();
        },
      },
      membershipRegistry: {
        getCurrent: async () => ({
          principalId: "user-1",
          membershipId: "membership-1",
          tenantId: "tenant-1",
          membershipRevision: "membership-revoked",
          status: "REVOKED" as const,
        }),
      },
    }),
    { "core-100": true },
  );
  const result = await root.execute(await serverContext(), command());
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.diagnostics[0]!.code, "AUTHORITY_DENIED");
  assertEquals(calls, 0);
});

Deno.test("CORE-100 handles valid commit and malformed success without throwing", async () => {
  const root = createCore100Root(
    dependencies({
      durable: {
        ...dependencies().durable,
        commit: async () => ({
          ok: true,
          value: validCommitResult(),
          diagnostics: [],
        }),
      },
    }),
    { "core-100": true },
  );
  const context = await serverContext();
  const successResult = await root.execute(context, command());
  assertEquals(successResult.ok, true);
  let malformed = await createCore100Root(
    dependencies({
      durable: {
        ...dependencies().durable,
        commit: async () => ({
          ok: true,
          value: { transactionId: "only-one-field" },
          diagnostics: [],
        } as never),
      },
    }),
    { "core-100": true },
  ).execute(context, command());
  assertEquals(malformed.ok, false);
  if (!malformed.ok) {
    assertEquals(malformed.diagnostics[0]!.code, "MALFORMED_SUCCESS");
  }
  const nested = Object.create(null);
  Object.defineProperty(nested, "transactionId", {
    get() {
      throw new Error("nested getter");
    },
  });
  const nestedResult = await createCore100Root(
    dependencies({
      durable: {
        ...dependencies().durable,
        commit: async () => ({
          ok: true,
          value: nested,
          diagnostics: [],
        } as never),
      },
    }),
    { "core-100": true },
  ).execute(context, command());
  assertEquals(nestedResult.ok, false);
  if (!nestedResult.ok) {
    assertEquals(nestedResult.diagnostics[0]!.code, "MALFORMED_SUCCESS");
  }
});

Deno.test("CORE-100 keeps consumer ownership separate", async () => {
  let calls = 0;
  const root = createCore100Root(
    dependencies({
      finance: {
        consumerId: "FINANCE",
        consume: async () => {
          calls++;
          return failure();
        },
      },
    }),
    { "core-100": true },
  );
  const context = await serverContext("finance.project", "finance.project");
  const result = await root.execute(
    context,
    command("FINANCE", {
      consumerId: "NOTIFICATION",
      action: "finance.project",
      capability: "finance.project",
    }),
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.diagnostics[0]!.code, "CONSUMER_MISMATCH");
  assertEquals(calls, 0);
});

Deno.test("CORE-100 accepts Inbox through the typed FP-004 boundary", async () => {
  let calls = 0;
  const root = createCore100Root(
    dependencies({
      inboxOutbox: {
        ...dependencies().inboxOutbox,
        acceptInbox: async (request) => {
          calls++;
          assertEquals(
            request.providerIdentity.providerEventId,
            "provider-event-1",
          );
          return { ok: true, value: validInboxAcceptance(), diagnostics: [] };
        },
      },
    }),
    { "core-100": true },
  );
  const result = await root.execute(
    await serverContext("inbox.accept", "inbox.accept"),
    command("INBOX_ACCEPT", {
      action: "inbox.accept",
      capability: "inbox.accept",
      inbox: inboxResolution(),
    }),
  );
  assertEquals(result.ok, true);
  assertEquals(calls, 1);
});

Deno.test("CORE-100 rejects malformed Inbox and Outbox before adapters", async () => {
  let inboxCalls = 0;
  let leaseCalls = 0;
  const root = createCore100Root(
    dependencies({
      inboxOutbox: {
        ...dependencies().inboxOutbox,
        acceptInbox: async () => {
          inboxCalls++;
          return failure();
        },
        leaseOutbox: async () => {
          leaseCalls++;
          return failure();
        },
      },
    }),
    { "core-100": true },
  );
  const malformedInbox = await root.execute(
    await serverContext("inbox.accept", "inbox.accept"),
    command("INBOX_ACCEPT", {
      action: "inbox.accept",
      capability: "inbox.accept",
      inbox: {},
    }),
  );
  assertEquals(malformedInbox.ok, false);
  if (!malformedInbox.ok) {
    assertEquals(malformedInbox.diagnostics[0]!.code, "INPUT_INVALID");
  }
  assertEquals(inboxCalls, 0);

  const malformedOutbox = await root.execute(
    await serverContext("outbox.dispatch", "outbox.dispatch"),
    command("OUTBOX_DISPATCH", {
      action: "outbox.dispatch",
      capability: "outbox.dispatch",
      outbox: { eventId: "event-1", ownerId: "owner-1" },
    }),
  );
  assertEquals(malformedOutbox.ok, false);
  if (!malformedOutbox.ok) {
    assertEquals(malformedOutbox.diagnostics[0]!.code, "INPUT_INVALID");
  }
  assertEquals(leaseCalls, 0);
});

Deno.test("CORE-100 accepts Outbox lease, transport, and completion in order", async () => {
  const calls: string[] = [];
  const leased = validLeasedOutbox();
  const root = createCore100Root(
    dependencies({
      inboxOutbox: {
        ...dependencies().inboxOutbox,
        leaseOutbox: async (request) => {
          calls.push(`lease:${request.ownerId}`);
          assertEquals(request.eventId, "event-1");
          return { ok: true, value: leased, diagnostics: [] };
        },
        completeOutbox: async (request) => {
          calls.push(`complete:${request.ownerId}`);
          assertEquals(request.fencingToken, "fence-1");
          assertEquals(request.delivery.outcome, "SUCCESS");
          return {
            ok: true,
            value: validCompletion(leased.record),
            diagnostics: [],
          };
        },
      },
      transport: {
        providerId: "fixture-provider",
        capabilities: ["OUTBOX_DISPATCH"],
        send: async (request) => {
          calls.push(`send:${request.ownerId}`);
          assertEquals(request.outboxId, "outbox:event-1");
          return { ok: true, value: validDelivery(), diagnostics: [] };
        },
      },
    }),
    { "core-100": true },
  );
  const result = await root.execute(
    await serverContext("outbox.dispatch", "outbox.dispatch"),
    command("OUTBOX_DISPATCH", {
      action: "outbox.dispatch",
      capability: "outbox.dispatch",
      outbox: {
        eventId: "event-1" as never,
        ownerId: "owner-1",
        idempotency: {
          scope: "CORE-100:OUTBOX_DISPATCH",
          key: "outbox-key-1",
          requestHash: HASH,
        },
      },
    }),
  );
  assertEquals(result.ok, true);
  assertEquals(calls.join(","), "lease:owner-1,send:owner-1,complete:owner-1");
});

Deno.test("CORE-100 separates valid Finance, Notification, and Search ownership", async () => {
  const seen: Array<[Core100ConsumerId, string]> = [];
  const root = createCore100Root(
    dependencies({
      finance: {
        consumerId: "FINANCE",
        consume: async (request) => {
          seen.push([request.consumerId, request.idempotency.scope]);
          return {
            ok: true,
            value: validConsumerResult("FINANCE", request.idempotency),
            diagnostics: [],
          };
        },
      },
      notification: {
        consumerId: "NOTIFICATION",
        consume: async (request) => {
          seen.push([request.consumerId, request.idempotency.scope]);
          return {
            ok: true,
            value: validConsumerResult("NOTIFICATION", request.idempotency),
            diagnostics: [],
          };
        },
      },
      search: {
        consumerId: "SEARCH",
        consume: async (request) => {
          seen.push([request.consumerId, request.idempotency.scope]);
          return {
            ok: true,
            value: validConsumerResult("SEARCH", request.idempotency),
            diagnostics: [],
          };
        },
      },
    }),
    { "core-100": true },
  );
  for (const consumerId of ["FINANCE", "NOTIFICATION", "SEARCH"] as const) {
    const result = await root.execute(
      await serverContext(
        `${consumerId.toLowerCase()}.project`,
        `${consumerId.toLowerCase()}.project`,
      ),
      command(consumerId, {
        event: canonicalEvent(),
        consumerId,
        action: `${consumerId.toLowerCase()}.project`,
        capability: `${consumerId.toLowerCase()}.project`,
        idempotencyKey: `${consumerId.toLowerCase()}-key`,
      }),
    );
    assertEquals(result.ok, true);
  }
  assertEquals(
    JSON.stringify(seen),
    JSON.stringify([
      ["FINANCE", "CORE-100:FINANCE"],
      ["NOTIFICATION", "CORE-100:NOTIFICATION"],
      ["SEARCH", "CORE-100:SEARCH"],
    ]),
  );
});

Deno.test("CORE-100 rejects mismatched consumer adapters at composition", () => {
  let rejected = false;
  try {
    createCore100Root(
      dependencies({
        finance: {
          consumerId: "NOTIFICATION",
          consume: async () => failure(),
        } as never,
      }),
    );
  } catch {
    rejected = true;
  }
  assert(rejected, "cross-wired consumer must be rejected at composition");
});

Deno.test("CORE-100 missing adapter is fail closed", async () => {
  const root = createCore100Root(
    dependencies({
      inboxOutbox: { ...dependencies().inboxOutbox, capabilities: ["COMMIT"] },
    }),
    { "core-100": true },
  );
  const result = await root.execute(
    await serverContext("inbox.accept", "inbox.accept"),
    command("INBOX_ACCEPT", {
      action: "inbox.accept",
      capability: "inbox.accept",
      inbox: {
        principalId: "user-1",
        tenantId: "tenant-1",
        resourceType: "draw",
        resourceId: "asset-1",
        canonicalEventId: "event-1" as never,
        providerIdentity: {
          providerName: "fixture-provider",
          providerEventId: "provider-event-1",
          payloadHash: HASH,
          eventType: "payment.completed",
          providerSchemaVersion: "1",
        },
      },
    }),
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.diagnostics[0]!.code, "ADAPTER_UNAVAILABLE");
  }
});
