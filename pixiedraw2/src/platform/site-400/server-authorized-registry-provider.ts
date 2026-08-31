/**
 * SITE-400 server-authorized Registry Provider.
 *
 * This module is intentionally host-neutral and server-only.  It accepts
 * identifiers and session references, derives a branded server authority
 * context, reads the canonical Registry, and exposes only a validated
 * REGISTERED_ASSET identity.  It never accepts caller-provided owner,
 * status, trusted, allowed, or provider values.
 */

import {
  createAssetRegistryBridge,
  isRegisteredAssetIdentity,
  REGISTERED_ASSET_STATUS,
  type RegisteredAssetIdentity,
  type RegistryBridgeProvider,
  type RegistryBridgeProviderResolveRequest,
  type RegistryBridgeResolveContext,
  type RegistryBridgeResult,
} from "../../draw2-asset-registry-bridge.ts";
import type {
  CanonicalRecordEnvelopeV2,
  CanonicalRegistryAdapter,
} from "../../server/authority-contracts.ts";
import {
  consumeServerAuthorityRequestContext,
  deriveServerAuthorityRequestContext,
  type AuthPrincipalProvider,
  type TenantMembershipResolver,
} from "../../server/internal/authenticated-context.ts";

export const SITE400_RESOURCE_TYPE = "REGISTERED_ASSET" as const;
export const SITE400_RECORD_SCHEMA_VERSION = 1 as const;
export const SITE400_PROVIDER_SOURCE = "SITE400_SERVER_COMPOSITION_ROOT" as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const CANONICAL_RECORD_REF_SCHEMA_VERSION = "CANONICAL_RECORD_REF_V2";

export interface Site400ResolveRequestV1 {
  readonly requestId: string;
  readonly sessionReference: string;
  readonly correlationId: string;
  readonly assetId: string;
  readonly projectId: string;
  readonly requestedTenantId?: string;
}

/** The canonical Registry record contains identity and metadata only. */
export interface Site400RegisteredAssetRecordV1 {
  readonly schemaVersion: typeof SITE400_RECORD_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly identity: RegisteredAssetIdentity;
}

export interface Site400ResolvedAssetV1 {
  readonly identity: RegisteredAssetIdentity;
  readonly tenantId: string;
  readonly registryRevision: string;
  readonly resolvedBy: typeof SITE400_PROVIDER_SOURCE;
}

export type Site400ResolveErrorCode =
  | "INVALID_REQUEST"
  | "AUTHORITY_DENIED"
  | "AUTHORITY_CONTEXT_STALE"
  | "UNKNOWN_ASSET"
  | "PROJECT_MISMATCH"
  | "OWNER_MISMATCH"
  | "TENANT_MISMATCH"
  | "CANONICAL_RECORD_INVALID"
  | "PROVIDER_UNAVAILABLE"
  | "REGISTRY_BRIDGE_REJECTED";

export interface Site400ResolveFailure {
  readonly ok: false;
  readonly code: Site400ResolveErrorCode;
  readonly message: string;
}

export type Site400ResolveResult =
  | { readonly ok: true; readonly value: Site400ResolvedAssetV1 }
  | Site400ResolveFailure;

type Site400RegistryReader = Pick<
  CanonicalRegistryAdapter,
  "membershipRegistry" | "getCurrent"
>;

export interface Site400ServerCompositionDependencies {
  readonly registry: Site400RegistryReader;
  readonly authProvider: AuthPrincipalProvider;
  readonly tenantResolver: TenantMembershipResolver;
}

export interface Site400ServerComposition {
  readonly resolveRegisteredAsset: (
    request: Site400ResolveRequestV1,
  ) => Promise<Site400ResolveResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function failure(
  code: Site400ResolveErrorCode,
  message: string,
): Site400ResolveFailure {
  return { ok: false, code, message };
}

function validateRequest(value: unknown): value is Site400ResolveRequestV1 {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "requestId",
    "sessionReference",
    "correlationId",
    "assetId",
    "projectId",
    "requestedTenantId",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  return isSafeId(value.requestId) &&
    isSafeId(value.sessionReference) &&
    isSafeId(value.correlationId) &&
    isSafeId(value.assetId) &&
    isSafeId(value.projectId) &&
    (value.requestedTenantId === undefined ||
      isSafeId(value.requestedTenantId));
}

function validateCanonicalRecord(
  value: unknown,
  tenantId: string,
  assetId: string,
): value is Site400RegisteredAssetRecordV1 {
  if (!isRecord(value)) return false;
  const keys = ["schemaVersion", "tenantId", "identity"];
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) return false;
  if (
    value.schemaVersion !== SITE400_RECORD_SCHEMA_VERSION ||
    value.tenantId !== tenantId ||
    !isRegisteredAssetIdentity(value.identity)
  ) return false;
  return value.identity.status === REGISTERED_ASSET_STATUS &&
    value.identity.assetId === assetId;
}

function validateCanonicalEnvelope(
  value: unknown,
  tenantId: string,
  assetId: string,
): value is CanonicalRecordEnvelopeV2<Site400RegisteredAssetRecordV1> {
  if (!isRecord(value) || !isRecord(value.ref)) return false;
  const ref = value.ref;
  if (
    ref.schemaVersion !== CANONICAL_RECORD_REF_SCHEMA_VERSION ||
    ref.resourceType !== SITE400_RESOURCE_TYPE ||
    ref.resourceId !== assetId ||
    ref.tenantId !== tenantId ||
    ref.origin !== "SERVER_REGISTRY" ||
    !isSafeId(ref.revision) ||
    !isSha256(ref.canonicalHash)
  ) return false;
  return validateCanonicalRecord(value.record, tenantId, assetId);
}

function createResolveProvider(
  identity: RegisteredAssetIdentity,
): RegistryBridgeProvider {
  return Object.freeze({
    register() {
      return {
        ok: false as const,
        code: "REGISTER_NOT_SUPPORTED",
        message: "SITE-400のResolve経路からAsset登録は実行できません。",
      };
    },
    resolve(request: RegistryBridgeProviderResolveRequest) {
      if (
        request.assetId !== identity.assetId ||
        request.projectId !== identity.projectId ||
        request.sourcePxdId !== identity.sourcePxdId ||
        request.definitionId !== identity.definitionId ||
        request.ownerId !== identity.ownerId ||
        request.referenceMode !== identity.referenceMode
      ) {
        return {
          ok: false as const,
          code: "SERVER_CONTEXT_MISMATCH",
          message: "Server Registry identityとResolve contextが一致しません。",
        };
      }
      if (
        identity.referenceMode === "PINNED" &&
        (request.sourceRevisionId !== identity.sourceRevisionId ||
          request.definitionDigest !== identity.definitionDigest)
      ) {
        return {
          ok: false as const,
          code: "PINNED_CONTEXT_MISMATCH",
          message: "PINNED AssetのRevision／Digestが一致しません。",
        };
      }
      return { ok: true as const, identity };
    },
  });
}

function bridgeContextFor(
  identity: RegisteredAssetIdentity,
): RegistryBridgeResolveContext {
  return {
    projectId: identity.projectId,
    sourcePxdId: identity.sourcePxdId,
    definitionId: identity.definitionId,
    ownerId: identity.ownerId,
    referenceMode: identity.referenceMode,
    ...(identity.referenceMode === "PINNED"
      ? {
        sourceRevisionId: identity.sourceRevisionId,
        definitionDigest: identity.definitionDigest,
      }
      : { definitionDigest: identity.definitionDigest }),
  };
}

export function createSite400ServerComposition(
  dependencies: Site400ServerCompositionDependencies,
): Site400ServerComposition {
  if (
    dependencies === null ||
    typeof dependencies !== "object" ||
    dependencies.registry === null ||
    dependencies.authProvider === null ||
    dependencies.tenantResolver === null
  ) throw new Error("SITE400_SERVER_COMPOSITION_DEPENDENCIES_REQUIRED");

  // Providers are captured here, at the Server Composition Root.  No public
  // request method accepts a provider, authority object, or trust flag.
  const authProvider = dependencies.authProvider;
  const tenantResolver = dependencies.tenantResolver;
  const registry = dependencies.registry;

  return Object.freeze({
    async resolveRegisteredAsset(
      requestInput: Site400ResolveRequestV1,
    ): Promise<Site400ResolveResult> {
      if (!validateRequest(requestInput)) {
        return failure("INVALID_REQUEST", "SITE-400 Resolve requestが不正です。");
      }
      const request = requestInput;
      const authorityContext = await deriveServerAuthorityRequestContext({
        authProvider,
        tenantResolver,
        request: {
          requestId: request.requestId,
          resourceType: SITE400_RESOURCE_TYPE,
          resourceId: request.assetId,
          sessionReference: request.sessionReference,
          correlationId: request.correlationId,
          ...(request.requestedTenantId === undefined
            ? {}
            : { requestedTenantId: request.requestedTenantId }),
        },
      });
      if (authorityContext === null) {
        return failure("AUTHORITY_DENIED", "認証済みServer Authorityを取得できません。");
      }
      const consumed = await consumeServerAuthorityRequestContext(
        authorityContext,
        {
          resourceType: SITE400_RESOURCE_TYPE,
          resourceId: request.assetId,
          membershipRegistry: registry.membershipRegistry,
        },
      );
      if (!consumed) {
        return failure(
          "AUTHORITY_CONTEXT_STALE",
          "MembershipまたはServer Authority Contextが有効ではありません。",
        );
      }

      let envelope: CanonicalRecordEnvelopeV2<Site400RegisteredAssetRecordV1> | null;
      try {
        envelope = await registry.getCurrent<Site400RegisteredAssetRecordV1>(
          authorityContext.tenantContext,
          SITE400_RESOURCE_TYPE,
          request.assetId,
        );
      } catch {
        return failure("PROVIDER_UNAVAILABLE", "Canonical Registry Providerを利用できません。");
      }
      if (envelope === null) {
        return failure("UNKNOWN_ASSET", "REGISTERED_ASSETがCanonical Registryに存在しません。");
      }
      if (!validateCanonicalEnvelope(
        envelope,
        authorityContext.tenantContext.tenantId,
        request.assetId,
      )) {
        return failure("CANONICAL_RECORD_INVALID", "Canonical Registry recordが不正です。");
      }
      const identity = envelope.record.identity;
      if (identity.ownerId !== authorityContext.principalId) {
        return failure("OWNER_MISMATCH", "Asset ownerがServer Principalと一致しません。");
      }
      if (identity.projectId !== request.projectId) {
        return failure("PROJECT_MISMATCH", "Asset ProjectがResolve requestと一致しません。");
      }
      if (envelope.ref.tenantId !== authorityContext.tenantContext.tenantId) {
        return failure("TENANT_MISMATCH", "Asset TenantがServer Tenantと一致しません。");
      }

      const bridge = createAssetRegistryBridge(createResolveProvider(identity));
      const resolved: RegistryBridgeResult<RegisteredAssetIdentity> =
        await bridge.resolve(identity.assetId, bridgeContextFor(identity));
      if (!resolved.ok) {
        return failure("REGISTRY_BRIDGE_REJECTED", resolved.message);
      }
      return {
        ok: true,
        value: {
          identity: resolved.value,
          tenantId: authorityContext.tenantContext.tenantId,
          registryRevision: envelope.ref.revision,
          resolvedBy: SITE400_PROVIDER_SOURCE,
        },
      };
    },
  });
}
