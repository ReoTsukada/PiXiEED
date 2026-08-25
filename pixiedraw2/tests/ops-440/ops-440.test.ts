import { strict as assert } from "node:assert";
import {
  createOps440ServerComposition,
  type Ops440ServerCompositionOptions,
  type Ops440ServerPolicyDecision,
  type Ops440ServerResourceResolution,
} from "../../src/platform/ops-440/composition.ts";
import { asFp004EventId } from "../../src/fp-004/contracts.ts";
import {
  asSha256,
  AUTHORIZATION_PROOF_POLICY_VERSION,
} from "../../src/wp160-contracts.ts";
import {
  createServerAuthPrincipalProvider,
  type ServerAuthRequestV1,
} from "../../src/server/internal/authenticated-context.ts";

const tenantId = "tenant-ops440";
const principalId = "principal-ops440";
const membershipId = `membership:${principalId}:${tenantId}`;
const revision = "membership-rev-1";
const issuedAt = new Date(Date.now() - 2_000).toISOString();
const expiresAt = new Date(Date.now() + 120_000).toISOString();
const payloadHash = "a".repeat(64);

function proof(expected: Record<string, unknown>) {
  return {
    schemaVersion: 1 as const,
    proofType: "AUTHORIZATION_PROOF" as const,
    source: "server" as const,
    decision: "allow" as const,
    authorityId: "ops440-test-authority",
    proofId: `proof:${String(expected.resourceType)}:${
      String(expected.resourceId)
    }`,
    principalId,
    resourceType: String(expected.resourceType),
    resourceId: String(expected.resourceId),
    action: String(expected.action),
    capability: String(expected.capability),
    tenantId,
    correlationId: String(expected.correlationId ?? "ops440-correlation"),
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant:ops440",
    issuedAt,
    expiresAt,
  };
}

function makeHarness(input: {
  readonly flags?: Record<string, boolean>;
  readonly resourceTenantId?: string;
  readonly decisionRevision?: string;
  readonly policy?: Partial<Ops440ServerPolicyDecision>;
  readonly eventVersionOffset?: number;
} = {}) {
  let currentMembership: {
    membershipId: string;
    principalId: string;
    tenantId: string;
    membershipRevision: string;
    status: "ACTIVE" | "REVOKED";
  } = {
    membershipId,
    principalId,
    tenantId,
    membershipRevision: revision,
    status: "ACTIVE" as const,
  };
  const membershipRegistry = {
    async getCurrent() {
      return currentMembership;
    },
  };
  const realAuthProvider = {
    async verify(request: ServerAuthRequestV1) {
      return {
        principalId,
        authSessionId: "auth-session-ops440",
        assurance: "SESSION_VERIFIED" as const,
        tenantMemberships: [currentMembership],
        authorizationProof: proof({
          resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
          resourceId: "auth-session-ops440",
          action: "server.authority.context.create",
          capability: "server.authority.context.create",
          correlationId: request.correlationId,
        }),
        issuedAt,
        expiresAt,
        correlationId: request.correlationId,
      };
    },
  };
  const options: Ops440ServerCompositionOptions = {
    authProvider: createServerAuthPrincipalProvider(realAuthProvider),
    tenantResolver: {
      membershipRegistry,
      async resolve() {
        return currentMembership;
      },
    },
    authorizationProofResolver: ({ expected }) =>
      proof(expected as Record<string, unknown>),
    resourceResolver: async ({ operation, command }) => {
      const inputCommand = command as unknown as Record<string, any>;
      const id = operation === "ADMIN_PROJECTION"
        ? inputCommand.projectionId
        : operation === "ANALYTICS_EVENT"
        ? inputCommand.eventId
        : operation === "AD_INTENT"
        ? inputCommand.slotId
        : operation === "MODERATION_REFERENCE"
        ? inputCommand.moderationId
        : operation === "REVENUE_SHADOW"
        ? inputCommand.projectionId
        : inputCommand.event.eventId;
      return {
        tenantId: input.resourceTenantId ?? tenantId,
        resourceType: operation,
        resourceId: id,
        revision: input.decisionRevision ?? "resource-rev-1",
        status: "ACTIVE",
      } satisfies Ops440ServerResourceResolution;
    },
    policyResolver: async () => ({
      serverResolved: true,
      featureAllowed: true,
      decisionRevision: input.decisionRevision ?? "resource-rev-1",
      region: "ALLOWED",
      agePolicy: "ALLOWED",
      adConsent: "GRANTED",
      analyticsConsent: "GRANTED",
      providerEligibility: "ALLOWED",
      viewportProximity: true,
      slotReserved: true,
      offline: false,
      consentRevoked: false,
      killSwitch: false,
      ...input.policy,
    }),
    eventResolver: ({ command, resource }) => ({
      principalId,
      providerIdentity: {
        providerName: command.event.providerName,
        providerEventId: command.event.providerEventId,
        payloadHash: asSha256(command.event.payloadHash),
        eventType: command.event.eventType,
        providerSchemaVersion: command.event.providerSchemaVersion,
      },
      tenantId: resource.tenantId,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      canonicalEventId: asFp004EventId(command.event.eventId),
      aggregateId: command.event.aggregateId,
      aggregateVersion: command.event.aggregateVersion +
        (input.eventVersionOffset ?? 0),
    }),
    revenueResolver: async ({ command }) => ({
      currency: "JPY",
      expectedMinorUnits: 100,
      observedMinorUnits: 101,
      revenueLines: [{
        scopeType: "PROJECT",
        scopeId: command.scopeId,
        stream: "ADS",
        amountMinorUnits: 100,
        adStage: "GROSS_ESTIMATED",
      }],
      costLines: [{
        scopeType: "PROJECT",
        scopeId: command.scopeId,
        stream: "MODERATION",
        amountMinorUnits: 20,
      }],
    }),
    flags: {
      "admin-read": true,
      "analytics-read": true,
      "ads-read": true,
      "moderation-read": true,
      "revenue-shadow-read": true,
      "event-inbox": true,
      ...input.flags,
    },
  };
  return {
    composition: createOps440ServerComposition(options),
    revokeMembership() {
      currentMembership = { ...currentMembership, status: "REVOKED" };
    },
  };
}

function eventCommand(
  version: number,
  providerEventId = `provider-event-${version}`,
  outcome?: "SUCCESS" | "RETRYABLE_FAILURE" | "POISON",
) {
  return {
    kind: "EVENT_INGEST" as const,
    surface: "PUBLIC_SOCIAL" as const,
    ...(outcome === undefined ? {} : { outcome }),
    event: {
      eventId: `event:${version}`,
      eventType: "social.post.created",
      aggregateId: "post:ops440",
      aggregateVersion: version,
      payloadHash,
      providerName: "synthetic-provider",
      providerEventId,
      providerSchemaVersion: "v1",
    },
  };
}

Deno.test("OPS440-SCOPE-001: server-composed Admin/Analytics/Ads/Moderation/Revenue paths are isolated", async () => {
  const { composition } = makeHarness();
  const admin = await composition.execute({
    kind: "ADMIN_PROJECTION",
    projectionId: "projection:1",
    scopeReference: "scope:1",
  });
  assert.equal(admin.ok, true, JSON.stringify(admin));
  const analytics = await composition.execute({
    kind: "ANALYTICS_EVENT",
    eventId: "event:analytics",
    eventName: "public.feed.view",
    surface: "PUBLIC_FEED",
    properties: { durationMs: 12, viewport: "wide" },
  });
  assert.equal(analytics.ok, true);
  const ad = await composition.execute({
    kind: "AD_INTENT",
    surface: "PUBLIC_FEED",
    slotId: "slot:1",
  });
  assert.equal(ad.ok, true);
  if (ad.ok && ad.value.kind === "AD_INTENT") {
    assert.equal(ad.value.intent, "LAZY_PUBLIC_ADAPTER");
  }
  const moderation = await composition.execute({
    kind: "MODERATION_REFERENCE",
    moderationId: "moderation:1",
    targetType: "POST",
    targetReference: "post:1",
    action: "REPORT",
    reasonCode: "SPAM",
  });
  assert.equal(moderation.ok, true, JSON.stringify(moderation));
  const revenue = await composition.execute({
    kind: "REVENUE_SHADOW",
    projectionId: "revenue:1",
    scopeId: "project:1",
  });
  assert.equal(revenue.ok, true);
  if (revenue.ok && revenue.value.kind === "REVENUE_SHADOW") {
    assert.equal(revenue.value.shadowOnly, true);
    assert.equal(revenue.value.ledgerMutation, false);
    assert.equal(revenue.value.payoutMutation, false);
  }
});

Deno.test("OPS440-SCOPE-001: private surfaces never create ad intent or SDK load", async () => {
  const { composition } = makeHarness();
  for (
    const surface of [
      "DRAW2_EDITOR",
      "GAME_EDITOR",
      "AUDIO_EDITOR",
      "STUDIO",
      "CHECKOUT",
      "ENTITLEMENT",
      "COMMISSION",
      "ACCOUNT_PRIVATE",
      "PROJECT_PRIVATE",
      "DIRECT_WORK",
      "PRIVATE_INBOX",
      "ADMIN",
    ] as const
  ) {
    const result = await composition.execute({
      kind: "AD_INTENT",
      surface,
      slotId: `slot:${surface}`,
    });
    assert.equal(result.ok, true);
    if (result.ok && result.value.kind === "AD_INTENT") {
      assert.equal(result.value.intent, "NONE");
      assert.equal(result.value.sdkLoad, "NONE");
      assert.equal(result.value.providerRequest, "NOT_REQUESTED");
    }
  }
});

Deno.test("OPS440-SCOPE-001: nested and sensitive analytics metadata are rejected", async () => {
  const { composition } = makeHarness();
  const nested = await composition.execute(
    {
      kind: "ANALYTICS_EVENT",
      eventId: "event:nested",
      eventName: "public.feed.view",
      surface: "PUBLIC_FEED",
      properties: { viewport: { width: 1 } },
    } as never,
  );
  assert.equal(nested.ok, false);
  if (!nested.ok) {
    assert.equal(nested.diagnostics[0]?.code, "PRIVACY_BOUNDARY_VIOLATION");
  }
  const secret = await composition.execute(
    {
      kind: "ANALYTICS_EVENT",
      eventId: "event:secret",
      eventName: "public.feed.view",
      surface: "PUBLIC_FEED",
      properties: { jwt: "secret" },
    } as never,
  );
  assert.equal(secret.ok, false);
  if (!secret.ok) {
    assert.equal(secret.diagnostics[0]?.code, "PRIVACY_BOUNDARY_VIOLATION");
  }
});

Deno.test("OPS440-STOP-001: caller authority/state/mutation injection and stale or cross-tenant resources fail closed", async () => {
  const { composition: normal } = makeHarness();
  const injected = await normal.execute(
    {
      kind: "ADMIN_PROJECTION",
      projectionId: "projection:inject",
      scopeReference: "scope:1",
      authorizationProof: {},
    } as never,
  );
  assert.equal(injected.ok, false);
  if (!injected.ok) {
    assert.equal(injected.diagnostics[0]?.code, "CALLER_INJECTION_REJECTED");
  }
  const { composition: crossTenant } = makeHarness({
    resourceTenantId: "tenant-other",
  });
  const cross = await crossTenant.execute({
    kind: "ADMIN_PROJECTION",
    projectionId: "projection:cross",
    scopeReference: "scope:1",
  });
  assert.equal(cross.ok, false);
  if (!cross.ok) {
    assert.equal(cross.diagnostics[0]?.code, "CANONICAL_IDENTITY_MISMATCH");
  }
  const { composition: stale } = makeHarness({
    decisionRevision: "resource-rev-stale",
  });
  const staleResult = await stale.execute({
    kind: "ADMIN_PROJECTION",
    projectionId: "projection:stale",
    scopeReference: "scope:1",
  });
  assert.equal(staleResult.ok, true, JSON.stringify(staleResult));
  const stalePolicy = makeHarness({
    policy: { decisionRevision: "policy-rev-stale" },
  });
  const rejected = await stalePolicy.composition.execute({
    kind: "ADMIN_PROJECTION",
    projectionId: "projection:stale-policy",
    scopeReference: "scope:1",
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.diagnostics[0]?.code, "STALE_SERVER_DECISION");
  }
});

Deno.test("OPS440-STOP-001: unknown/OFF/kill/offline/revoked-consent states fail closed", async () => {
  const off = await makeHarness({ flags: { "admin-read": false } }).composition
    .execute({
      kind: "ADMIN_PROJECTION",
      projectionId: "projection:off",
      scopeReference: "scope:1",
    });
  assert.equal(off.ok, false);
  if (!off.ok) assert.equal(off.diagnostics[0]?.code, "FEATURE_DISABLED");
  const offline = await makeHarness({ policy: { offline: true } }).composition
    .execute({
      kind: "AD_INTENT",
      surface: "PUBLIC_FEED",
      slotId: "slot:offline",
    });
  assert.equal(offline.ok, true);
  if (offline.ok && offline.value.kind === "AD_INTENT") {
    assert.equal(offline.value.sdkLoad, "NONE");
  }
  const revoked = await makeHarness({ policy: { consentRevoked: true } })
    .composition.execute({
      kind: "ANALYTICS_EVENT",
      eventId: "event:revoked",
      eventName: "public.feed.view",
      surface: "PUBLIC_FEED",
    });
  assert.equal(revoked.ok, false);
  if (!revoked.ok) {
    assert.equal(revoked.diagnostics[0]?.code, "CONSENT_REVOKED");
  }
  const killed = await makeHarness({ policy: { killSwitch: true } }).composition
    .execute({
      kind: "AD_INTENT",
      surface: "PUBLIC_FEED",
      slotId: "slot:killed",
    });
  assert.equal(killed.ok, true);
  if (killed.ok && killed.value.kind === "AD_INTENT") {
    assert.equal(killed.value.intent, "NONE");
  }
});

Deno.test("OPS440-EVIDENCE-001: duplicate, replay, out-of-order, retry, and DLQ have zero side effects", async () => {
  const { composition } = makeHarness();
  const first = await composition.execute(eventCommand(1));
  assert.equal(first.ok, true);
  const duplicate = await composition.execute(eventCommand(1));
  assert.equal(duplicate.ok, true);
  if (duplicate.ok && duplicate.value.kind === "EVENT_INGEST") {
    assert.equal(duplicate.value.duplicate, true);
    assert.equal(duplicate.value.sideEffectCount, 0);
  }
  const stale = await composition.execute(eventCommand(1, "provider-stale"));
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.diagnostics[0]?.code, "EVENT_OUT_OF_ORDER");
  const gap = await composition.execute(eventCommand(3, "provider-gap"));
  assert.equal(gap.ok, false);
  if (!gap.ok) assert.equal(gap.diagnostics[0]?.code, "EVENT_OUT_OF_ORDER");
  const poison = await composition.execute(
    eventCommand(2, "provider-poison", "POISON"),
  );
  assert.equal(poison.ok, true);
  if (poison.ok && poison.value.kind === "EVENT_INGEST") {
    assert.equal(poison.value.sideEffectCount, 0);
    assert.equal(poison.value.deadLetterCount, 1);
  }
  assert.equal(composition.snapshot().processedEventCount, 1);
});

Deno.test("OPS440-EVIDENCE-001: event resolver substitution is rejected before Inbox acceptance", async () => {
  const { composition } = makeHarness({ eventVersionOffset: 1 });
  const result = await composition.execute(eventCommand(1));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostics[0]?.code, "CANONICAL_IDENTITY_MISMATCH");
  }
  assert.equal(composition.snapshot().inboxCount, 0);
});
