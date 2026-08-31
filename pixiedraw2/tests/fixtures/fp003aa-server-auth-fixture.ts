import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofV1,
} from "../../src/wp160-contracts.ts";
import type { ServerAuthorityHandler } from "../../src/server/server-authority-handler.ts";
import { createTestServerAuthorityComposition } from "./fp003aa-test-composition.ts";
import {
  bindCanonicalTenantMembership,
  createServerAuthorityRequestContext,
  createServerAuthPrincipalProvider,
  type ServerAuthRequestV1,
  type ServerAuthVerificationAdapter,
  type ServerTenantMembershipCandidateV1,
  type TenantMembershipResolver,
  type VerifiedServerAuthSessionV1,
} from "../../src/server/internal/authenticated-context.ts";
import type {
  CanonicalRegistryAdapter,
  ServerTenantContextV1,
} from "../../src/server/authority-contracts.ts";
import { InMemoryTenantMembershipRegistry } from "./in-memory-authoritative-registry.ts";

const FIXTURE_ISSUED_AT = new Date(Date.now() - 30_000).toISOString();
const FIXTURE_EXPIRES_AT = new Date(Date.now() + 4 * 60_000).toISOString();

function proofFor(
  input: {
    readonly principalId: string;
    readonly authSessionId: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
  },
): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "fp003aa-test-auth-adapter",
    proofId: `proof:${input.authSessionId}`,
    principalId: input.principalId,
    resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
    resourceId: input.authSessionId,
    action: "server.authority.context.create",
    capability: "server.authority.context.create",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: `grant:${input.authSessionId}`,
    tenantId: null,
    correlationId: `auth-correlation:${input.authSessionId}`,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  };
}

function contextFor(
  tenantId: string,
  principalId: string,
): ServerTenantContextV1 {
  return {
    schemaVersion: "SERVER_TENANT_CONTEXT_V1",
    tenantId,
    principalId,
    source: "SERVER_REGISTRY",
  };
}

class FixtureAuthVerificationAdapter implements ServerAuthVerificationAdapter {
  private readonly sessions = new Map<
    string,
    VerifiedServerAuthSessionV1
  >();

  constructor(
    private readonly onSessionRegistered: (
      principalId: string,
      memberships: readonly ServerTenantMembershipCandidateV1[],
    ) => void,
  ) {}

  register(input: {
    readonly sessionReference: string;
    readonly principalId: string;
    readonly tenantIds: readonly string[];
    readonly issuedAt?: string;
    readonly expiresAt?: string;
  }): void {
    const issuedAt = input.issuedAt ?? FIXTURE_ISSUED_AT;
    const expiresAt = input.expiresAt ?? FIXTURE_EXPIRES_AT;
    const tenantMemberships: readonly ServerTenantMembershipCandidateV1[] =
      input.tenantIds.map((tenantId) => ({
        membershipId: `membership:${input.principalId}:${tenantId}`,
        principalId: input.principalId,
        tenantId,
        membershipRevision: `membership:${input.principalId}:${tenantId}:v1`,
        status: "ACTIVE" as const,
      }));
    const verified: VerifiedServerAuthSessionV1 = {
      principalId: input.principalId,
      authSessionId: `auth-session:${input.sessionReference}`,
      assurance: "SESSION_VERIFIED",
      tenantMemberships,
      authorizationProof: proofFor({
        principalId: input.principalId,
        authSessionId: `auth-session:${input.sessionReference}`,
        issuedAt: FIXTURE_ISSUED_AT,
        expiresAt: FIXTURE_EXPIRES_AT,
      }),
      issuedAt,
      expiresAt,
      correlationId: `auth-correlation:${input.sessionReference}`,
    };
    this.sessions.set(
      input.sessionReference,
      verified,
    );
    this.onSessionRegistered(input.principalId, tenantMemberships);
  }

  async verify(request: ServerAuthRequestV1) {
    return this.sessions.get(request.sessionReference) ?? null;
  }
}

class FixtureTenantResolver implements TenantMembershipResolver {
  constructor(
    private readonly registry: CanonicalRegistryAdapter,
    readonly membershipRegistry: InMemoryTenantMembershipRegistry,
  ) {}

  registerMemberships(
    principalId: string,
    memberships: readonly ServerTenantMembershipCandidateV1[],
  ): void {
    void principalId;
    for (const membership of memberships) {
      this.membershipRegistry.upsert(membership);
    }
  }

  setMembershipStatus(
    principalId: string,
    membershipId: string,
    status: ServerTenantMembershipCandidateV1["status"],
  ): void {
    this.membershipRegistry.setStatus(principalId, membershipId, status);
  }

  async resolve(
    input: Parameters<TenantMembershipResolver["resolve"]>[0],
  ): Promise<ServerTenantMembershipCandidateV1 | null> {
    const candidates = input.principal.tenantMemberships
      .map((membership) =>
        this.membershipRegistry.getCurrent({
          principalId: input.principal.principalId,
          membershipId: membership.membershipId,
          tenantId: membership.tenantId,
        })
      );
    const currentCandidates = (await Promise.all(candidates)).filter(
      (membership): membership is ServerTenantMembershipCandidateV1 =>
        membership !== null &&
        membership.status === "ACTIVE" &&
        (input.requestedTenantId === undefined ||
          membership.tenantId === input.requestedTenantId),
    );
    const matches: ServerTenantMembershipCandidateV1[] = [];
    for (const membership of currentCandidates) {
      const current = await this.registry.getCurrent(
        contextFor(membership.tenantId, input.principal.principalId),
        input.resourceType,
        input.resourceId,
      );
      if (current !== null) matches.push(membership);
    }
    return matches.length === 1 ? matches[0]! : null;
  }
}

export interface Fp003AaServerAuthFixture {
  readonly authAdapter: FixtureAuthVerificationAdapter;
  readonly authProvider: ReturnType<typeof createServerAuthPrincipalProvider>;
  readonly tenantResolver: FixtureTenantResolver;
  readonly handler: ServerAuthorityHandler;
}

export function createFp003AaServerAuthFixture(
  input: {
    readonly registry: CanonicalRegistryAdapter;
  },
): Fp003AaServerAuthFixture {
  const tenantResolver = new FixtureTenantResolver(
    input.registry,
    input.registry.membershipRegistry as InMemoryTenantMembershipRegistry,
  );
  const authAdapter = new FixtureAuthVerificationAdapter((
    principalId,
    memberships,
  ) => tenantResolver.registerMemberships(principalId, memberships));
  const authProvider = createServerAuthPrincipalProvider(authAdapter);
  const composition = createTestServerAuthorityComposition({
    registry: input.registry,
    authProvider,
    tenantResolver,
  });
  return {
    authAdapter,
    authProvider,
    tenantResolver,
    handler: composition.handler,
  };
}

export function requestFor(
  input: {
    readonly requestId: string;
    readonly sessionReference: string;
    readonly requestedTenantId?: string;
    readonly correlationId?: string;
  },
): ServerAuthRequestV1 {
  return {
    requestId: `http-request:${input.requestId}:${input.sessionReference}`,
    resourceType: "DIRECT_WORK_REQUEST",
    resourceId: input.requestId,
    sessionReference: input.sessionReference,
    correlationId: input.correlationId ??
      `correlation:${input.requestId}:${input.sessionReference}`,
    ...(input.requestedTenantId === undefined
      ? {}
      : { requestedTenantId: input.requestedTenantId }),
  };
}

export async function contextForSeed(seed: {
  readonly request: { readonly requestId: string };
  readonly tenantContext: {
    readonly tenantId: string;
    readonly principalId: string | null;
  };
}): Promise<ReturnType<typeof createServerAuthorityRequestContext>> {
  const principalId = seed.tenantContext.principalId ??
    `principal:${seed.tenantContext.tenantId}`;
  const authSessionId =
    `direct-work-test:${seed.request.requestId}:${seed.tenantContext.tenantId}`;
  const authProvider = createServerAuthPrincipalProvider({
    async verify() {
      return {
        principalId,
        authSessionId,
        assurance: "SESSION_VERIFIED" as const,
        tenantMemberships: [{
          membershipId:
            `membership:${principalId}:${seed.tenantContext.tenantId}`,
          principalId,
          tenantId: seed.tenantContext.tenantId,
          membershipRevision:
            `membership:${principalId}:${seed.tenantContext.tenantId}:v1`,
          status: "ACTIVE" as const,
        }],
        authorizationProof: proofFor({
          principalId,
          authSessionId,
          issuedAt: FIXTURE_ISSUED_AT,
          expiresAt: FIXTURE_EXPIRES_AT,
        }),
        issuedAt: FIXTURE_ISSUED_AT,
        expiresAt: FIXTURE_EXPIRES_AT,
        correlationId: `direct-work-correlation:${seed.request.requestId}`,
      };
    },
  });
  const principal = await authProvider.authenticate({
    requestId: `fixture:${seed.request.requestId}`,
    resourceType: "DIRECT_WORK_REQUEST",
    resourceId: seed.request.requestId,
    sessionReference: `fixture-session:${seed.request.requestId}`,
    correlationId: `direct-work-correlation:${seed.request.requestId}`,
  });
  if (principal === null) throw new Error("FIXTURE_PRINCIPAL_ISSUANCE_FAILED");
  const membership = bindCanonicalTenantMembership({
    principal,
    membership: principal.tenantMemberships[0]!,
  });
  return createServerAuthorityRequestContext({
    principal,
    membership,
    request: {
      requestId: seed.request.requestId,
      resourceType: "DIRECT_WORK_REQUEST",
      resourceId: seed.request.requestId,
      correlationId: principal.correlationId,
    },
  });
}
