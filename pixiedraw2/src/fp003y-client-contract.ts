/**
 * FP-003Y shared/client contract only.
 *
 * This module intentionally contains no Provider, Registry, credential, or
 * financial-authority implementation import. It is safe for Browser bundles.
 */

export const FP003Y_SCHEMA_VERSION = "FP003Y_SERVER_AUTHORITY_REVISION_CHAIN_V1" as const;
export const FP003Z_SCHEMA_VERSION = "FP003Z_SERVER_AUTHORITY_ROOT_V1" as const;
export const FP003Y_CLIENT_CONTRACT = "ID_AND_EXPECTED_REVISION_ONLY" as const;

export type Fp003YDiagnosticCode =
  | "SERVER_AUTHORITY_UNAVAILABLE"
  | "SERVER_PROVIDER_SUBSTITUTION_REJECTED"
  | "STALE_AGGREGATE"
  | "STALE_PARENT"
  | "STALE_PAYMENT"
  | "MONEY_OVERFLOW"
  | "INVALID_DEDUCTION"
  | "CURRENCY_MISMATCH"
  | "CANONICAL_RECORD_INVALID";

export interface Fp003ZCommandReferenceV1 {
  readonly schemaVersion: typeof FP003Z_SCHEMA_VERSION;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly expectedRevision: string;
}

/** Legacy shape retained only for decoding old client messages; it is never an authority. */
export interface Fp003YReferenceV1 {
  readonly schemaVersion: typeof FP003Y_SCHEMA_VERSION;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly revision: string;
  readonly canonicalHash: string;
  readonly origin: "SERVER_REGISTRY";
}

export interface Fp003YCommandEnvelopeV1<T extends object = Record<string, unknown>> {
  readonly commandId: string;
  readonly intent: string;
  readonly reference: Fp003ZCommandReferenceV1;
  readonly claimedIdentity?: string;
  readonly input: T;
}

export type Fp003YClientResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: Fp003YDiagnosticCode; readonly message: string };
