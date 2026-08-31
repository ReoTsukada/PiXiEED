/**
 * FP-003AA server-internal authenticated context boundary.
 *
 * Browser commands contain identifiers and user input only.  This module is
 * intentionally outside every Browser entry.  Runtime brands make an object
 * copied or fabricated by a caller ineligible for the authority service even
 * when its enumerable fields look correct.
 */

import {
  type AuthorizationProofV1,
  requireAuthorizationProofV1,
} from "../../wp160-contracts.ts";

export const AUTHENTICATED_SERVER_PRINCIPAL_SCHEMA_VERSION =
  "AUTHENTICATED_SERVER_PRINCIPAL_V1" as const;
export const SERVER_TENANT_CONTEXT_SCHEMA_VERSION =
  "SERVER_TENANT_CONTEXT_V1" as const;
export const SERVER_AUTHORITY_REQUEST_CONTEXT_SCHEMA_VERSION =
  "SERVER_AUTHORITY_REQUEST_CONTEXT_V1" as const;
export const SERVER_AUTHORITY_CONTEXT_SOURCE =
  "SERVER_COMPOSITION_ROOT" as const;

export const AUTHENTICATED_PRINCIPAL_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const AUTHENTICATED_PRINCIPAL_MAX_LIFETIME_MS = 15 * 60 * 1000;
export const SERVER_AUTHORITY_CONTEXT_MAX_LIFETIME_MS = 5 * 60 * 1000;

export interface ServerAuthRequestV1 {
  readonly requestId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly sessionReference: string;
  readonly correlationId: string;
  readonly requestedTenantId?: string;
}

export interface ServerTenantMembershipCandidateV1 {
  readonly membershipId: string;
  readonly principalId: string;
  readonly tenantId: string;
  readonly membershipRevision: string;
  readonly status: "ACTIVE" | "SUSPENDED" | "REVOKED";
}

export interface AuthenticatedServerPrincipalV1 {
  readonly schemaVersion: typeof AUTHENTICATED_SERVER_PRINCIPAL_SCHEMA_VERSION;
  readonly principalId: string;
  readonly authSessionId: string;
  readonly authenticationSource: "SERVER_AUTH_ADAPTER";
  readonly assurance: "SESSION_VERIFIED" | "JWT_VERIFIED";
  readonly tenantMemberships: readonly ServerTenantMembershipCandidateV1[];
  readonly authorizationProof: AuthorizationProofV1;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId: string;
}

export interface ServerTenantContextV1 {
  readonly schemaVersion: typeof SERVER_TENANT_CONTEXT_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly principalId: string | null;
  readonly source: "SERVER_REGISTRY";
}

export interface ServerTenantMembershipV1
  extends ServerTenantMembershipCandidateV1 {
  readonly principalId: string;
  readonly status: "ACTIVE";
}

export interface ServerAuthorityRequestContextV1 {
  readonly schemaVersion:
    typeof SERVER_AUTHORITY_REQUEST_CONTEXT_SCHEMA_VERSION;
  readonly tenantContext: ServerTenantContextV1;
  readonly source: typeof SERVER_AUTHORITY_CONTEXT_SOURCE;
  readonly principalId: string;
  readonly membershipId: string;
  readonly membershipRevision: string;
  readonly authSessionId: string;
  readonly requestId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly correlationId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface AuthPrincipalProvider {
  authenticate(
    request: ServerAuthRequestV1,
  ): Promise<AuthenticatedServerPrincipalV1 | null>;
}

/** Result produced only after the server Auth Adapter verifies a session. */
export interface VerifiedServerAuthSessionV1 {
  readonly principalId: string;
  readonly authSessionId: string;
  readonly assurance: AuthenticatedServerPrincipalV1["assurance"];
  readonly tenantMemberships: readonly ServerTenantMembershipCandidateV1[];
  readonly authorizationProof: AuthorizationProofV1;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId: string;
}

export interface ServerAuthVerificationAdapter {
  verify(
    request: ServerAuthRequestV1,
  ): Promise<VerifiedServerAuthSessionV1 | null>;
}

export interface CanonicalTenantMembershipRegistryV1 {
  getCurrent(input: {
    readonly principalId: string;
    readonly membershipId: string;
    readonly tenantId: string;
  }): Promise<ServerTenantMembershipCandidateV1 | null>;
}

export interface TenantMembershipResolver {
  readonly membershipRegistry: CanonicalTenantMembershipRegistryV1;
  resolve(input: {
    readonly principal: AuthenticatedServerPrincipalV1;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly requestedTenantId?: string;
  }): Promise<ServerTenantMembershipCandidateV1 | null>;
}

const authenticatedPrincipalBrand = new WeakSet<object>();
const tenantMembershipBrand = new WeakMap<object, string>();
const authorityContextBrand = new WeakSet<object>();
const authorityContextBinding = new WeakMap<object, {
  readonly principalId: string;
  readonly tenantId: string;
  readonly membershipId: string;
  readonly membershipRevision: string;
}>();
const authorityContextAuthorizationProof = new WeakMap<
  object,
  AuthorizationProofV1
>();
const consumedAuthorityContexts = new WeakSet<object>();
const consumingAuthorityContexts = new WeakSet<object>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isText(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= maxLength;
}

function parseIso(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValidLifetime(
  issuedAt: string,
  expiresAt: string,
  now: number,
  maxLifetime: number,
): boolean {
  if (
    !Number.isFinite(now) || !Number.isFinite(maxLifetime) || maxLifetime < 0
  ) {
    return false;
  }
  const issued = parseIso(issuedAt);
  const expires = parseIso(expiresAt);
  if (issued === null || expires === null || expires <= issued) return false;
  if (issued > now + AUTHENTICATED_PRINCIPAL_ALLOWED_CLOCK_SKEW_MS) {
    return false;
  }
  if (expires <= now || expires - issued > maxLifetime) return false;
  return true;
}

function membershipShape(
  value: unknown,
): value is ServerTenantMembershipCandidateV1 {
  if (!isRecord(value)) return false;
  return isText(value.membershipId) &&
    isText(value.principalId) &&
    isText(value.tenantId) &&
    isText(value.membershipRevision) &&
    (value.status === "ACTIVE" || value.status === "SUSPENDED" ||
      value.status === "REVOKED");
}

function principalShape(
  value: unknown,
): value is AuthenticatedServerPrincipalV1 {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== AUTHENTICATED_SERVER_PRINCIPAL_SCHEMA_VERSION ||
    !isText(value.principalId) ||
    !isText(value.authSessionId) ||
    value.authenticationSource !== "SERVER_AUTH_ADAPTER" ||
    (value.assurance !== "SESSION_VERIFIED" &&
      value.assurance !== "JWT_VERIFIED") ||
    !isText(value.issuedAt, 64) ||
    !isText(value.expiresAt, 64) ||
    !isText(value.correlationId, 256) ||
    !Array.isArray(value.tenantMemberships) ||
    !value.tenantMemberships.every(membershipShape)
  ) return false;
  const tenantIds = value.tenantMemberships.map((membership) =>
    membership.tenantId
  );
  if (new Set(tenantIds).size !== tenantIds.length) return false;
  if (
    value.tenantMemberships.some((membership) =>
      membership.principalId !== value.principalId
    )
  ) return false;
  try {
    requireAuthorizationProofV1(value.authorizationProof, {
      principalId: value.principalId,
      resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
      resourceId: value.authSessionId,
      action: "server.authority.context.create",
      capability: "server.authority.context.create",
    });
  } catch {
    return false;
  }
  return true;
}

function issuePrincipal(input: {
  readonly principalId: string;
  readonly authSessionId: string;
  readonly authenticationSource:
    AuthenticatedServerPrincipalV1["authenticationSource"];
  readonly assurance: AuthenticatedServerPrincipalV1["assurance"];
  readonly tenantMemberships: readonly ServerTenantMembershipCandidateV1[];
  readonly authorizationProof: AuthorizationProofV1;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId: string;
}): AuthenticatedServerPrincipalV1 {
  const principal = Object.freeze({
    schemaVersion: AUTHENTICATED_SERVER_PRINCIPAL_SCHEMA_VERSION,
    principalId: input.principalId,
    authSessionId: input.authSessionId,
    authenticationSource: input.authenticationSource,
    assurance: input.assurance,
    tenantMemberships: Object.freeze(
      input.tenantMemberships.map((membership) =>
        Object.freeze({ ...membership })
      ),
    ),
    authorizationProof: Object.freeze({ ...input.authorizationProof }),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    correlationId: input.correlationId,
  });
  if (!principalShape(principal)) {
    throw new Error("AUTHENTICATED_PRINCIPAL_INVALID");
  }
  authenticatedPrincipalBrand.add(principal);
  return principal;
}

/**
 * Server Auth Adapter boundary. The adapter returns only after verification;
 * this module owns the source value and runtime principal brand.
 */
export function createServerAuthPrincipalProvider(
  adapter: ServerAuthVerificationAdapter,
): AuthPrincipalProvider {
  return Object.freeze({
    async authenticate(request: ServerAuthRequestV1) {
      let verified: VerifiedServerAuthSessionV1 | null;
      try {
        verified = await adapter.verify(request);
      } catch {
        return null;
      }
      if (verified === null) return null;
      try {
        return issuePrincipal({
          ...verified,
          authenticationSource: "SERVER_AUTH_ADAPTER",
        });
      } catch {
        return null;
      }
    },
  });
}

export function isAuthenticatedServerPrincipal(
  value: unknown,
  now = Date.now(),
): value is AuthenticatedServerPrincipalV1 {
  return isRecord(value) &&
    authenticatedPrincipalBrand.has(value) &&
    principalShape(value) &&
    hasValidLifetime(
      value.issuedAt,
      value.expiresAt,
      now,
      AUTHENTICATED_PRINCIPAL_MAX_LIFETIME_MS,
    );
}

export function bindCanonicalTenantMembership(input: {
  readonly principal: AuthenticatedServerPrincipalV1;
  readonly membership: ServerTenantMembershipCandidateV1;
}): ServerTenantMembershipV1 {
  if (!isAuthenticatedServerPrincipal(input.principal)) {
    throw new Error("AUTHENTICATED_PRINCIPAL_REQUIRED");
  }
  if (input.membership.status !== "ACTIVE") {
    throw new Error("TENANT_MEMBERSHIP_INACTIVE");
  }
  const canonical = input.principal.tenantMemberships.find((membership) =>
    membership.membershipId === input.membership.membershipId &&
    membership.principalId === input.membership.principalId &&
    membership.tenantId === input.membership.tenantId &&
    membership.status === "ACTIVE"
  );
  if (canonical === undefined) throw new Error("TENANT_MEMBERSHIP_DENIED");
  if (input.membership.principalId !== input.principal.principalId) {
    throw new Error("TENANT_MEMBERSHIP_PRINCIPAL_MISMATCH");
  }
  const bound = Object.freeze({
    membershipId: canonical.membershipId,
    tenantId: canonical.tenantId,
    principalId: input.principal.principalId,
    membershipRevision: canonical.membershipRevision,
    status: "ACTIVE" as const,
  });
  tenantMembershipBrand.set(bound, input.principal.principalId);
  return bound;
}

export function createServerAuthorityRequestContext(input: {
  readonly principal: AuthenticatedServerPrincipalV1;
  readonly membership: ServerTenantMembershipV1;
  /** A server-resolved action proof is bound privately to this context. */
  readonly authorizationProof?: AuthorizationProofV1;
  readonly request: Pick<
    ServerAuthRequestV1,
    "requestId" | "resourceType" | "resourceId" | "correlationId"
  >;
  readonly now?: number;
}): ServerAuthorityRequestContextV1 {
  const now = input.now ?? Date.now();
  if (!isAuthenticatedServerPrincipal(input.principal, now)) {
    throw new Error("AUTHENTICATED_PRINCIPAL_INVALID_OR_EXPIRED");
  }
  if (
    tenantMembershipBrand.get(input.membership) !==
      input.principal.principalId ||
    input.membership.principalId !== input.principal.principalId ||
    input.membership.status !== "ACTIVE" ||
    !isText(input.membership.membershipRevision)
  ) throw new Error("TENANT_MEMBERSHIP_NOT_BOUND");
  if (
    !isText(input.request.requestId) || !isText(input.request.resourceType) ||
    !isText(input.request.resourceId) || !isText(input.request.correlationId)
  ) throw new Error("SERVER_REQUEST_INVALID");
  let boundAuthorizationProof: AuthorizationProofV1 | null = null;
  if (input.authorizationProof !== undefined) {
    try {
      boundAuthorizationProof = Object.freeze({ ...input.authorizationProof });
      requireAuthorizationProofV1(boundAuthorizationProof, {
        principalId: input.principal.principalId,
        resourceType: input.request.resourceType,
        resourceId: input.request.resourceId,
        tenantId: input.membership.tenantId,
        correlationId: input.request.correlationId,
      });
    } catch {
      throw new Error("SERVER_AUTHORIZATION_PROOF_NOT_BOUND");
    }
  }
  const issuedAt = new Date(now).toISOString();
  const principalExpiry = parseIso(input.principal.expiresAt)!;
  const expiresAt = new Date(
    Math.min(principalExpiry, now + SERVER_AUTHORITY_CONTEXT_MAX_LIFETIME_MS),
  ).toISOString();
  const context = Object.freeze({
    schemaVersion: SERVER_AUTHORITY_REQUEST_CONTEXT_SCHEMA_VERSION,
    tenantContext: Object.freeze({
      schemaVersion: SERVER_TENANT_CONTEXT_SCHEMA_VERSION,
      tenantId: input.membership.tenantId,
      principalId: input.principal.principalId,
      source: "SERVER_REGISTRY" as const,
    }),
    source: SERVER_AUTHORITY_CONTEXT_SOURCE,
    principalId: input.principal.principalId,
    membershipId: input.membership.membershipId,
    membershipRevision: input.membership.membershipRevision,
    authSessionId: input.principal.authSessionId,
    requestId: input.request.requestId,
    resourceType: input.request.resourceType,
    resourceId: input.request.resourceId,
    correlationId: input.request.correlationId,
    issuedAt,
    expiresAt,
  });
  authorityContextBrand.add(context);
  authorityContextBinding.set(context, {
    principalId: input.principal.principalId,
    tenantId: input.membership.tenantId,
    membershipId: input.membership.membershipId,
    membershipRevision: input.membership.membershipRevision,
  });
  if (boundAuthorizationProof !== null) {
    authorityContextAuthorizationProof.set(context, boundAuthorizationProof);
  }
  return context;
}

/** Returns only the proof privately bound by the server context factory. */
export function getServerAuthorityRequestContextProof(
  value: unknown,
): AuthorizationProofV1 | null {
  if (value === null || typeof value !== "object") return null;
  return authorityContextAuthorizationProof.get(value) ?? null;
}

export function isServerAuthorityRequestContext(
  value: unknown,
  now = Date.now(),
): value is ServerAuthorityRequestContextV1 {
  if (!isRecord(value) || !authorityContextBrand.has(value)) return false;
  const context = value as unknown as ServerAuthorityRequestContextV1;
  const binding = authorityContextBinding.get(value);
  if (binding === undefined) return false;
  return context.schemaVersion ===
      SERVER_AUTHORITY_REQUEST_CONTEXT_SCHEMA_VERSION &&
    context.source === SERVER_AUTHORITY_CONTEXT_SOURCE &&
    isText(context.principalId) &&
    isText(context.membershipId) &&
    isText(context.authSessionId) &&
    isText(context.requestId) &&
    isText(context.resourceType) &&
    isText(context.resourceId) &&
    isText(context.correlationId) &&
    isText(context.issuedAt, 64) &&
    isText(context.expiresAt, 64) &&
    context.tenantContext.principalId === context.principalId &&
    binding.principalId === context.principalId &&
    binding.tenantId === context.tenantContext.tenantId &&
    binding.membershipId === context.membershipId &&
    isText(context.membershipRevision) &&
    binding.membershipRevision === context.membershipRevision &&
    context.tenantContext.source === "SERVER_REGISTRY" &&
    hasValidLifetime(
      context.issuedAt,
      context.expiresAt,
      now,
      SERVER_AUTHORITY_CONTEXT_MAX_LIFETIME_MS,
    );
}

export async function consumeServerAuthorityRequestContext(
  input: unknown,
  expected: {
    readonly resourceType: string;
    readonly resourceId: string;
    readonly membershipRegistry: CanonicalTenantMembershipRegistryV1;
  },
  now = Date.now(),
): Promise<boolean> {
  if (
    !isServerAuthorityRequestContext(input, now) ||
    consumedAuthorityContexts.has(input) ||
    consumingAuthorityContexts.has(input)
  ) return false;
  const context = input as ServerAuthorityRequestContextV1;
  if (
    context.resourceType !== expected.resourceType ||
    context.resourceId !== expected.resourceId
  ) return false;
  // Reserve the server-issued context before the first await.  A WeakSet
  // reservation closes the same-turn/concurrent double-consume window while
  // still allowing a retry if the authoritative membership lookup fails.
  consumingAuthorityContexts.add(input);
  try {
    const current = await expected.membershipRegistry.getCurrent({
      principalId: context.principalId,
      membershipId: context.membershipId,
      tenantId: context.tenantContext.tenantId,
    });
    let matches = false;
    try {
      matches = isRecord(current) &&
        current.status === "ACTIVE" &&
        current.principalId === context.principalId &&
        current.membershipId === context.membershipId &&
        current.tenantId === context.tenantContext.tenantId &&
        current.membershipRevision === context.membershipRevision;
    } catch {
      matches = false;
    }
    if (!matches) return false;
    consumedAuthorityContexts.add(input);
    return true;
  } catch {
    return false;
  } finally {
    consumingAuthorityContexts.delete(input);
  }
}

export async function deriveServerAuthorityRequestContext(input: {
  readonly authProvider: AuthPrincipalProvider;
  readonly tenantResolver: TenantMembershipResolver;
  readonly request: ServerAuthRequestV1;
}): Promise<ServerAuthorityRequestContextV1 | null> {
  let principal: AuthenticatedServerPrincipalV1 | null;
  try {
    principal = await input.authProvider.authenticate(input.request);
  } catch {
    return null;
  }
  // Only the real server auth adapter may create a request-scoped authority
  // context.
  if (
    !isRecord(principal) ||
    principal.authenticationSource !== "SERVER_AUTH_ADAPTER" ||
    !isAuthenticatedServerPrincipal(principal)
  ) return null;
  let candidate: ServerTenantMembershipCandidateV1 | null;
  try {
    candidate = await input.tenantResolver.resolve({
      principal,
      resourceType: input.request.resourceType,
      resourceId: input.request.resourceId,
      ...(input.request.requestedTenantId === undefined
        ? {}
        : { requestedTenantId: input.request.requestedTenantId }),
    });
  } catch {
    return null;
  }
  if (candidate === null) return null;
  let currentMembership: ServerTenantMembershipCandidateV1 | null;
  try {
    currentMembership = await input.tenantResolver.membershipRegistry
      .getCurrent({
        principalId: principal.principalId,
        membershipId: candidate.membershipId,
        tenantId: candidate.tenantId,
      });
  } catch {
    return null;
  }
  if (
    currentMembership === null ||
    currentMembership.status !== "ACTIVE" ||
    currentMembership.principalId !== principal.principalId ||
    currentMembership.membershipId !== candidate.membershipId ||
    currentMembership.tenantId !== candidate.tenantId ||
    currentMembership.membershipRevision !== candidate.membershipRevision
  ) return null;
  let membership: ServerTenantMembershipV1;
  try {
    membership = bindCanonicalTenantMembership({
      principal,
      membership: candidate,
    });
  } catch {
    return null;
  }
  try {
    return createServerAuthorityRequestContext({
      principal,
      membership,
      request: input.request,
    });
  } catch {
    return null;
  }
}
