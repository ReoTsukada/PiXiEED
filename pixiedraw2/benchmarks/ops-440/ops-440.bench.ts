import {
  createOps440ServerComposition,
  type Ops440ServerCompositionOptions,
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

const tenantId = "tenant-ops440-benchmark";
const principalId = "principal-ops440-benchmark";
const membershipId = `membership:${principalId}:${tenantId}`;
const issuedAt = new Date(Date.now() - 2_000).toISOString();
const expiresAt = new Date(Date.now() + 120_000).toISOString();
const revision = "resource-rev-1";

function proof(expected: Record<string, unknown>) {
  return {
    schemaVersion: 1 as const,
    proofType: "AUTHORIZATION_PROOF" as const,
    source: "server" as const,
    decision: "allow" as const,
    authorityId: "ops440-benchmark-authority",
    proofId: `proof:${String(expected.resourceType)}:${
      String(expected.resourceId)
    }`,
    principalId,
    resourceType: String(expected.resourceType),
    resourceId: String(expected.resourceId),
    action: String(expected.action),
    capability: String(expected.capability),
    tenantId,
    correlationId: String(expected.correlationId),
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant:ops440-benchmark",
    issuedAt,
    expiresAt,
  };
}

const membership = {
  membershipId,
  principalId,
  tenantId,
  membershipRevision: "membership-rev-1",
  status: "ACTIVE" as const,
};
const authProvider = createServerAuthPrincipalProvider({
  async verify(request: ServerAuthRequestV1) {
    return {
      principalId,
      authSessionId: "auth-session-ops440-benchmark",
      assurance: "SESSION_VERIFIED" as const,
      tenantMemberships: [membership],
      authorizationProof: proof({
        resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
        resourceId: "auth-session-ops440-benchmark",
        action: "server.authority.context.create",
        capability: "server.authority.context.create",
        correlationId: request.correlationId,
      }),
      issuedAt,
      expiresAt,
      correlationId: request.correlationId,
    };
  },
});
const membershipRegistry = {
  async getCurrent() {
    return membership;
  },
};
const options: Ops440ServerCompositionOptions = {
  authProvider,
  tenantResolver: {
    membershipRegistry,
    async resolve() {
      return membership;
    },
  },
  authorizationProofResolver: ({ expected }) =>
    proof(expected as Record<string, unknown>),
  resourceResolver: async ({ operation, command }) => {
    const input = command as unknown as Record<string, any>;
    const resourceId = operation === "ANALYTICS_EVENT"
      ? input.eventId
      : input.slotId;
    return {
      tenantId,
      resourceType: operation,
      resourceId,
      revision,
      status: "ACTIVE",
    };
  },
  policyResolver: async () => ({
    serverResolved: true,
    featureAllowed: true,
    decisionRevision: revision,
    region: "ALLOWED" as const,
    agePolicy: "ALLOWED" as const,
    adConsent: "GRANTED" as const,
    analyticsConsent: "GRANTED" as const,
    providerEligibility: "ALLOWED" as const,
    viewportProximity: true,
    slotReserved: true,
    offline: false,
    consentRevoked: false,
    killSwitch: false,
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
    aggregateVersion: command.event.aggregateVersion,
  }),
  flags: {
    "admin-read": true,
    "analytics-read": true,
    "ads-read": true,
    "moderation-read": true,
    "revenue-shadow-read": true,
    "event-inbox": true,
  },
};

const iterations = 1_000;
const started = performance.now();
let successful = 0;
const composition = createOps440ServerComposition(options);
for (let index = 0; index < iterations; index += 1) {
  const result = await composition.execute({
    kind: "ANALYTICS_EVENT",
    eventId: `event:${index}`,
    eventName: "public.feed.view",
    surface: "PUBLIC_FEED",
    properties: { durationMs: index % 100, viewport: "wide" },
  });
  if (result.ok) successful += 1;
}
const elapsedMs = performance.now() - started;
console.log(JSON.stringify(
  {
    schemaVersion: 1,
    benchmarkId: "OPS440_SERVER_COMPOSITION_SYNTHETIC",
    status: "MEASURED_LOCAL_SYNTHETIC",
    iterations,
    successful,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operationsPerSecond: Number(
      (successful / Math.max(elapsedMs / 1000, 0.001)).toFixed(2),
    ),
    notes: [
      "Server-composed analytics projection with synthetic FP-003AA Auth/Tenant and WP240/WP250 contracts.",
      "No network, provider, route, database, storage, payment, production, browser, device, or real-user data was accessed.",
      "This is not a production semantic or performance PASS.",
    ],
  },
  null,
  2,
));
