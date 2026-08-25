/**
 * FP-005 server-only policy composition.
 *
 * This is deliberately an opaque capability: its state lives in a WeakMap and
 * is issued only around a genuine FP-003AA request context.  JSON, spread,
 * clones, and proxies therefore cannot become a policy composition.
 */
import type { AuthorizationProofResolver } from "../wp160-contracts.ts";
import {
  isServerAuthorityRequestContext,
  type CanonicalTenantMembershipRegistryV1,
  type ServerAuthorityRequestContextV1,
} from "../server/internal/authenticated-context.ts";
import type {
  Fp005ServerQuotaSnapshot,
  Fp005StorageQuotaResolveRequest,
} from "./storage-placement.ts";
import type {
  Fp005RetentionResolveRequest,
  Fp005ServerRetentionSnapshot,
} from "./retention-decision.ts";

export interface Fp005ServerPolicyCompositionInput {
  readonly authorityContext: ServerAuthorityRequestContextV1;
  readonly membershipRegistry: CanonicalTenantMembershipRegistryV1;
  readonly authorizationProofResolver: AuthorizationProofResolver;
  readonly resolveQuota: (request: Fp005StorageQuotaResolveRequest) => Fp005ServerQuotaSnapshot;
  readonly resolveRetention: (request: Fp005RetentionResolveRequest) => Fp005ServerRetentionSnapshot;
}

/** Opaque server capability. Do not serialize, spread, or accept it from Browser input. */
export interface Fp005ServerPolicyComposition {
  readonly kind: "FP005_SERVER_POLICY_COMPOSITION";
}

interface CompositionState extends Fp005ServerPolicyCompositionInput {}

const compositions = new WeakMap<object, CompositionState>();

export function createFp005ServerPolicyComposition(
  input: Fp005ServerPolicyCompositionInput,
): Fp005ServerPolicyComposition {
  if (!isServerAuthorityRequestContext(input.authorityContext) ||
    typeof input.authorizationProofResolver !== "function" ||
    typeof input.resolveQuota !== "function" ||
    typeof input.resolveRetention !== "function" ||
    input.membershipRegistry === null || typeof input.membershipRegistry !== "object" ||
    typeof input.membershipRegistry.getCurrent !== "function") {
    throw new TypeError("FP005_SERVER_POLICY_COMPOSITION_REQUIRES_SEALED_SERVER_CONTEXT");
  }
  const composition = Object.freeze({ kind: "FP005_SERVER_POLICY_COMPOSITION" as const });
  compositions.set(composition, Object.freeze({ ...input }));
  return composition;
}

/** Internal guard used by FP-005 gates; a structural lookalike always fails. */
export function getFp005ServerPolicyComposition(
  value: unknown,
): CompositionState | undefined {
  if (value === null || typeof value !== "object") return undefined;
  return compositions.get(value);
}
