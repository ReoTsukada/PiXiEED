/**
 * Stable caller-facing SOCIAL-430 data contract entrypoint.
 *
 * This barrel intentionally exposes only data types and authority-free
 * projection helpers.  Server composition, resolver bindings, producer
 * proofs, and capability construction live behind the server-only entry and
 * are never re-exported from this module.  A caller can therefore not inject
 * an authority object, resolver, current state, or direct Event object through
 * the public contract surface.
 */

import type {
  Social430CardResolution,
  Social430CoreCard,
  Social430PermissionResult,
  Social430Post,
  Social430Result,
  Social430SearchEligibility,
  Social430ShareCommandInput,
} from "./composition.ts";

export {
  applySocial430RollbackPlan,
  asSocial430ContentHash,
  auditSafeSocial430Payload,
  canonicalSocial430,
  createSocial430RollbackPlan,
  DEFAULT_SOCIAL430_FEATURE_FLAGS,
  reconcileSocial430Follow,
  reconcileSocial430Post,
  reconcileSocial430Reaction,
  resolveSocial430PresentationState,
  SOCIAL430_SCHEMA_VERSION,
  social430FeatureEnabled,
  transitionSocial430Post,
} from "./composition.ts";

export type * from "./composition.ts";

/**
 * Shape of the handlers a server composition may hand to a route.  This is a
 * type-only contract: every callable accepts exactly one command/read input;
 * authority, resolver, current-state, and Event projection capabilities are
 * intentionally absent from the caller-facing signature.
 */
export interface Social430CallerHandlers {
  readonly createSocial430CoreCard: (
    input: Social430CoreCardCommandInput,
  ) => Social430Result<Social430CoreCard>;
  readonly createSocial430Post: (
    input: Social430ShareCommandInput,
  ) => Promise<Social430Result<Social430Post>>;
  readonly resolveSocial430Read: (
    input: Social430ReadCommandInput,
  ) => Social430PermissionResult;
  readonly resolveSocial430CoreCard: (
    input: Social430CardReadCommandInput,
  ) => Social430CardResolution;
  readonly resolveSocial430SearchEligibility: (
    input: Social430SearchCommandInput,
  ) => Social430SearchEligibility;
}

/** Public command/read inputs deliberately contain no resolver or state. */
export type Social430CoreCardCommandInput = Parameters<
  typeof import("./composition.ts").createSocial430CoreCard
>[0];
export type Social430ReadCommandInput = Parameters<
  typeof import("./composition.ts").resolveSocial430Read
>[0];
export type Social430CardReadCommandInput = Parameters<
  typeof import("./composition.ts").resolveSocial430CoreCard
>[0];
export type Social430SearchCommandInput = Parameters<
  typeof import("./composition.ts").resolveSocial430SearchEligibility
>[0];

export {
  SOCIAL430_SCHEMA_VERSION as SOCIAL430_CONTRACT_VERSION,
} from "./composition.ts";
