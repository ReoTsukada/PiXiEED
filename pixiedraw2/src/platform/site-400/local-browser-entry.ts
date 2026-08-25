/**
 * Browser-only SITE-400 local fixture entry.
 *
 * This file is built as a lazy chunk consumed by the isolated Core Shell
 * route.  It is not a Production Auth/DB/Storage adapter and contains no
 * artifact bytes; it exists solely to prove the local App Shell → lazy entry
 * → server composition → tenant → REGISTERED_ASSET reference path.
 */

import {
  asSha256,
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofV1,
} from "../../wp160-contracts.ts";
import {
  createServerAuthPrincipalProvider,
  type ServerAuthVerificationAdapter,
  type ServerTenantMembershipCandidateV1,
  type TenantMembershipResolver,
  type VerifiedServerAuthSessionV1,
} from "../../server/internal/authenticated-context.ts";
import type {
  CanonicalTenantMembershipRegistryV1,
  CanonicalRecordEnvelopeV2,
  ServerTenantContextV1,
} from "../../server/authority-contracts.ts";
import {
  createSite400LazyEntry,
} from "./lazy-entry.ts";
import {
  createSite400ServerComposition,
  type Site400RegisteredAssetRecordV1,
  type Site400ResolveRequestV1,
} from "./server-authorized-registry-provider.ts";
import { mountSite400LocalRoute } from "./local-route.ts";
import type { Site400LocalRouteHost } from "./local-route.ts";

const TENANT_ID = "tenant:site400-local";
const PRINCIPAL_ID = "principal:site400-local";
const PROJECT_ID = "project:site400-local";
const SESSION_REFERENCE = "session:site400-local";
const ASSET_ID = "asset:site400-local-hero";
const SOURCE_PXD_ID = "pxd:site400-local";
const DEFINITION_ID = "definition:site400-local";
const DIGEST = "b".repeat(64);

const membership: ServerTenantMembershipCandidateV1 = Object.freeze({
  membershipId: `membership:${PRINCIPAL_ID}:${TENANT_ID}`,
  principalId: PRINCIPAL_ID,
  tenantId: TENANT_ID,
  membershipRevision: "membership:site400-local:v1",
  status: "ACTIVE",
});

const tenantContext: ServerTenantContextV1 = Object.freeze({
  schemaVersion: "SERVER_TENANT_CONTEXT_V1",
  tenantId: TENANT_ID,
  principalId: PRINCIPAL_ID,
  source: "SERVER_REGISTRY",
});

const record: Site400RegisteredAssetRecordV1 = Object.freeze({
  schemaVersion: 1,
  tenantId: TENANT_ID,
  identity: Object.freeze({
    schemaVersion: 1,
    status: "REGISTERED_ASSET",
    assetId: ASSET_ID,
    projectId: PROJECT_ID,
    sourcePxdId: SOURCE_PXD_ID,
    definitionId: DEFINITION_ID,
    ownerId: PRINCIPAL_ID,
    sourceRevisionId: "revision:site400-local:v1",
    definitionDigest: DIGEST,
    referenceMode: "LIVE",
  }),
});

function proof(): AuthorizationProofV1 {
  const issuedAt = new Date(Date.now() - 30_000).toISOString();
  const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "site400-local-server-fixture",
    proofId: `proof:${SESSION_REFERENCE}`,
    principalId: PRINCIPAL_ID,
    resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
    resourceId: `auth-session:${SESSION_REFERENCE}`,
    action: "server.authority.context.create",
    capability: "server.authority.context.create",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: `grant:${SESSION_REFERENCE}`,
    tenantId: null,
    correlationId: `auth-correlation:${SESSION_REFERENCE}`,
    issuedAt,
    expiresAt,
  };
}

class LocalMembershipRegistry implements CanonicalTenantMembershipRegistryV1 {
  async getCurrent(input: {
    readonly principalId: string;
    readonly membershipId: string;
    readonly tenantId: string;
  }): Promise<ServerTenantMembershipCandidateV1 | null> {
    if (
      input.principalId !== membership.principalId ||
      input.membershipId !== membership.membershipId ||
      input.tenantId !== membership.tenantId
    ) return null;
    return membership;
  }
}

class LocalAuthAdapter implements ServerAuthVerificationAdapter {
  async verify(input: {
    readonly sessionReference: string;
  }): Promise<VerifiedServerAuthSessionV1 | null> {
    if (input.sessionReference !== SESSION_REFERENCE) return null;
    const issuedAt = new Date(Date.now() - 30_000).toISOString();
    const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();
    return Object.freeze({
      principalId: PRINCIPAL_ID,
      authSessionId: `auth-session:${SESSION_REFERENCE}`,
      assurance: "SESSION_VERIFIED" as const,
      tenantMemberships: Object.freeze([membership]),
      authorizationProof: proof(),
      issuedAt,
      expiresAt,
      correlationId: `auth-correlation:${SESSION_REFERENCE}`,
    });
  }
}

function envelope(): CanonicalRecordEnvelopeV2<Site400RegisteredAssetRecordV1> {
  return Object.freeze({
    ref: Object.freeze({
      schemaVersion: "CANONICAL_RECORD_REF_V2" as const,
      resourceType: "REGISTERED_ASSET",
      resourceId: ASSET_ID,
      tenantId: TENANT_ID,
      revision: "registered-asset:site400-local:v1",
      canonicalHash: asSha256("c".repeat(64)),
      origin: "SERVER_REGISTRY" as const,
    }),
    record,
  });
}

function createLocalComposition() {
  const membershipRegistry = new LocalMembershipRegistry();
  const registry = {
    membershipRegistry,
    async getCurrent<T>(
      context: ServerTenantContextV1,
      resourceType: string,
      resourceId: string,
    ): Promise<CanonicalRecordEnvelopeV2<T> | null> {
      if (
        context.tenantId !== TENANT_ID ||
        resourceType !== "REGISTERED_ASSET" ||
        resourceId !== ASSET_ID
      ) return null;
      return envelope() as CanonicalRecordEnvelopeV2<T>;
    },
  };
  const tenantResolver: TenantMembershipResolver = {
    membershipRegistry,
    async resolve(input) {
      if (
        input.resourceType !== "REGISTERED_ASSET" ||
        input.resourceId !== ASSET_ID ||
        input.principal.principalId !== PRINCIPAL_ID ||
        (input.requestedTenantId !== undefined &&
          input.requestedTenantId !== TENANT_ID)
      ) return null;
      return membership;
    },
  };
  return createSite400ServerComposition({
    registry,
    authProvider: createServerAuthPrincipalProvider(new LocalAuthAdapter()),
    tenantResolver,
  });
}

export interface Site400BrowserEntryOptions {
  readonly host: Site400LocalRouteHost;
  readonly featureFlag?: "on" | "off" | "unknown";
}

export function mountSite400BrowserEntry(
  options: Site400BrowserEntryOptions,
) {
  const composition = createLocalComposition();
  const request: Site400ResolveRequestV1 = Object.freeze({
    requestId: "http:site400-local:1",
    sessionReference: SESSION_REFERENCE,
    correlationId: "correlation:site400-local:1",
    assetId: ASSET_ID,
    projectId: PROJECT_ID,
    requestedTenantId: TENANT_ID,
  });
  return mountSite400LocalRoute({
    host: options.host,
    featureFlag: options.featureFlag ?? "on",
    lazyEntry: createSite400LazyEntry(),
    request,
    resolveRegisteredAsset: composition.resolveRegisteredAsset,
  });
}
