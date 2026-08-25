/**
 * Server-owned PLATFORM-450 contracts.
 *
 * These types are deliberately separate from the caller-facing contract
 * surface. They describe the trusted composition closure and predecessor
 * state resolved by a server adapter; they are not route or Provider APIs.
 */

import type {
  Platform450Command,
  Platform450Flag,
  Platform450Flow,
} from "./contracts.ts";

export type Platform450Authority = Readonly<{
  readonly principalId: string;
  readonly tenantId: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
  readonly policyVersion: string;
  readonly currentRevision: string;
  readonly providerIdentity: string;
}>;

export type Platform450Capability = Readonly<{
  readonly flow: Platform450Flow;
  readonly capability: string;
}>;

export type Platform450DependencyPackage =
  | "SITE-400"
  | "MARKET-410"
  | "WORK-420"
  | "SOCIAL-430"
  | "OPS-440";

export type Platform450DependencyEntry = Readonly<{
  readonly packageId: Platform450DependencyPackage;
  readonly contractPaths: readonly string[];
  readonly evidencePaths: readonly string[];
  readonly contractSha256: readonly string[];
  readonly evidenceSha256: readonly string[];
}>;

export type Platform450DependencyManifest =
  readonly Platform450DependencyEntry[];

export type Platform450CanonicalFlowState = Readonly<{
  readonly flow: Platform450Flow;
  readonly resourceReference: string;
  readonly references: readonly string[];
  readonly invariants: readonly string[];
  readonly publicOnly: boolean;
  readonly moderationRequired: boolean;
  readonly boundedSearch: boolean;
  readonly boundedNotification: boolean;
  readonly synthetic: boolean;
  readonly socialSeparated: boolean;
  readonly marketSeparated: boolean;
  readonly paymentMutation: boolean;
  readonly rightsMutation: boolean;
  readonly assetReference?: string;
  readonly packageReference?: string;
  readonly revisionReference?: string;
  readonly privateAds: boolean;
  readonly sdkAccess: boolean;
  readonly analyticsScalars: readonly string[];
  readonly revenueMode: "NONE" | "SHADOW_ONLY";
}>;

export type Platform450PackageState = Readonly<{
  readonly revision: string;
  readonly dependencyManifest: Platform450DependencyManifest;
  readonly canonicalFlowState: Platform450CanonicalFlowState;
}>;

export type Platform450AuthorityResolver = (
  command: Platform450Command,
) => Platform450Authority | PromiseLike<Platform450Authority>;

export type Platform450PackageStateResolver = (
  request: Readonly<{
    readonly flow: Platform450Flow;
    readonly resourceReference: string;
  }>,
) => Platform450PackageState | PromiseLike<Platform450PackageState>;

export type Platform450EventIdentity = Readonly<{
  readonly eventId: string;
  readonly commandId: string;
  readonly aggregateReference: string;
  readonly fingerprint: string;
  readonly providerIdentity: string;
  readonly sequence: number;
}>;

export type Platform450ProjectionResult = Readonly<{
  readonly ok: boolean;
  readonly sideEffects: number;
}>;

export type Platform450ConsumerApplyInput = Readonly<{
  readonly consumerId: string;
  readonly event: Platform450EventIdentity;
  readonly replay: boolean;
}>;

export type Platform450ConsumerAdapter = Readonly<{
  readonly apply: (
    input: Platform450ConsumerApplyInput,
  ) => Platform450ProjectionResult | PromiseLike<Platform450ProjectionResult>;
}>;

export type Platform450CompositionOptions = Readonly<{
  readonly authorityResolver: Platform450AuthorityResolver;
  readonly packageStateResolver: Platform450PackageStateResolver;
  readonly consumerAdapter: Platform450ConsumerAdapter;
  readonly flags: Readonly<Record<string, Platform450Flag>>;
  readonly killSwitch: boolean;
  readonly now?: () => number;
}>;

export type Platform450ConsumerShadow = Readonly<{
  readonly consumerId: string;
  readonly aggregateReference: string;
  readonly headSequence: number;
  readonly lastEventId?: string;
  readonly lastFingerprint?: string;
  readonly retryCount: number;
  readonly dlq: boolean;
}>;
