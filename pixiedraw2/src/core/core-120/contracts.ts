/**
 * CORE-120 is an evidence gate.  It observes predecessor evidence and never
 * becomes an authority, provider, storage, money, or event implementation.
 */

export const CORE120_ACCEPTANCE_IDS = [
  "CORE120-GATE-001",
  "CORE120-CONVERGENCE-001",
  "CORE120-NONINTRUSION-001",
  "CORE120-HANDOFF-001",
] as const;

export type Core120AcceptanceId = typeof CORE120_ACCEPTANCE_IDS[number];

export const CORE120_CLASSIFICATIONS = [
  "IMPLEMENTED_ISOLATED",
  "PRODUCTION_EQUIVALENT",
  "PRODUCTION_INTEGRATED",
  "UNTESTED",
] as const;

export type Core120Classification = typeof CORE120_CLASSIFICATIONS[number];

/** Adapter class and evidence classification are intentionally distinct. */
export const CORE120_ADAPTER_CLASSES = [
  "IN_MEMORY",
  "PRODUCTION_EQUIVALENT",
  "PRODUCTION_INTEGRATED",
  "UNTESTED",
] as const;

export type Core120AdapterClass = typeof CORE120_ADAPTER_CLASSES[number];

export type Core120Decision = "PASS" | "NO_GO";

export interface Core120Hashes {
  readonly sourceHash?: string;
  readonly contractHash?: string;
  readonly schemaHash?: string;
  readonly buildHash?: string;
}

export interface Core120AcceptanceEvidence {
  readonly id: string;
  readonly status: string;
  readonly source: readonly string[];
  readonly contract: readonly string[];
  readonly schema: readonly string[];
  readonly build: readonly string[];
  readonly exitCode: number | null;
  readonly reviewer: string | null;
  readonly hashes: Core120Hashes;
  readonly classification: Core120Classification;
  readonly adapterClass: Core120AdapterClass;
  readonly findingIdentity: string | null;
}

export interface Core120PredecessorEvidence {
  readonly packageId: string;
  readonly evidencePath: string;
  readonly status: string;
  readonly overallReviewer: string | null;
  readonly overallReviewStatus: string | null;
  readonly evidenceHash: string | null;
  readonly currentHashes: Core120Hashes;
  readonly acceptanceRows: readonly Core120AcceptanceEvidence[];
  readonly residualUntested: readonly string[];
  readonly adapterCounts: Readonly<Record<Core120AdapterClass, number>>;
}

export interface Core120Issue {
  readonly code: string;
  readonly blocking: boolean;
  readonly subject: string;
  readonly detail: string;
}

export interface Core120GateResult {
  readonly decision: Core120Decision;
  readonly issues: readonly Core120Issue[];
  readonly predecessorRows: readonly Core120PredecessorEvidence[];
  readonly classificationCounts: Readonly<
    Record<Core120Classification, number>
  >;
}

export interface Core120IdentityTuple {
  readonly identity: string;
  readonly revision: string;
  readonly packageId: string;
  readonly eventId: string;
  readonly resultKind: string;
  readonly resultHash: string;
}

export interface Core120ConvergenceObservation {
  readonly core: string;
  readonly tuple: Core120IdentityTuple;
  readonly authorityOwner: string;
  readonly contractHash: string;
  readonly schemaHash: string;
  readonly buildHash: string;
  readonly eventCount: number;
  readonly sideEffectCounts: Readonly<Record<string, number>>;
  readonly malformedSuccess: boolean;
  readonly privatePayloadLeaked: boolean;
  readonly replaySideEffects: number;
}

export interface Core120EvidenceIntegrityInput {
  readonly evidencePath: string;
  readonly inputPaths: readonly string[];
  readonly artifactPaths: readonly string[];
  readonly claimedClassification: Core120Classification;
  readonly claimedProductionPass: boolean;
}

export interface Core120ConvergenceResult {
  readonly pass: boolean;
  readonly issues: readonly Core120Issue[];
  readonly duplicateEventCount: number;
  readonly replaySideEffectCount: number;
  readonly failureCount: number;
  readonly sideEffectTotal: number;
}

export interface Core120NonintrusionInput {
  readonly changedPaths: readonly string[];
  readonly accessedProviders: readonly string[];
  readonly importedProductionPaths: readonly string[];
  readonly claimedProductionPass: boolean;
  readonly classifications: readonly Core120Classification[];
}

export interface Core120HandoffInput {
  readonly checkpointHash: string;
  readonly rollbackRoute: string;
  readonly stopFlag: string;
  readonly nextPackage: string;
  readonly autoStartNext: boolean;
  readonly ownerAuthorizationRequired: boolean;
}
