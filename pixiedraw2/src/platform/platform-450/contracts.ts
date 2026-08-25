/**
 * Public, authority-free PLATFORM-450 data contracts.
 *
 * Server wiring and trusted predecessor state are intentionally kept in
 * `server-contracts.ts`. This module exposes only the caller/result boundary.
 */

export type Platform450Flow =
  | "PUBLIC_WORK_SOCIAL"
  | "MARKET_PURCHASE_CHAIN"
  | "DIRECT_WORK_CHAIN"
  | "TOOL_ASSET_RUNTIME"
  | "OPS_PROJECTION";

export type Platform450Stage =
  | "VALIDATED"
  | "AUTHORIZED"
  | "COMMITTED"
  | "EVENT_RECORDED"
  | "OUTBOX_READY"
  | "INBOX_APPLIED";

export type Platform450Flag = "ON" | "OFF" | "UNKNOWN";

/** The only caller command shape accepted by the public boundary. */
export type Platform450Command = Readonly<{
  readonly commandId: string;
  readonly flow: Platform450Flow;
  readonly resourceReference: string;
  readonly requestedAction: string;
}>;

export type Platform450Status =
  | "APPLIED"
  | "IDEMPOTENT"
  | "CONFLICT"
  | "REJECTED"
  | "PROJECTION_FAILED";

export type Platform450CommitStatus = "COMMITTED" | "NOT_COMMITTED";
export type Platform450ProjectionStatus =
  | "NOT_ATTEMPTED"
  | "APPLIED"
  | "FAILED";

/** A result carries bounded references and state facts, never private data. */
export type Platform450Result = Readonly<{
  readonly commandId: string;
  readonly fingerprint: string;
  readonly stage: Platform450Stage;
  readonly status: Platform450Status;
  readonly commit: Platform450CommitStatus;
  readonly eventRecorded: boolean;
  readonly outboxReady: boolean;
  readonly inboxApplied: boolean;
  readonly projection: Platform450ProjectionStatus;
  readonly flowState?: Readonly<{
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
  readonly eventId?: string;
  readonly diagnostics: readonly string[];
}>;

export type Platform450ConsumerStatus =
  | "APPLIED"
  | "DUPLICATE"
  | "STALE"
  | "PENDING_GAP"
  | "RETRY"
  | "DLQ"
  | "REJECTED";

export type Platform450ConsumeInput = Readonly<{
  readonly consumerId: string;
  readonly eventId: string;
  readonly aggregateReference: string;
  readonly sequence: number;
  readonly fingerprint: string;
  readonly providerIdentity: string;
  readonly retry?: number;
  readonly replay?: boolean;
}>;

export type Platform450ConsumerResult = Readonly<{
  readonly consumerId: string;
  readonly eventId: string;
  readonly status: Platform450ConsumerStatus;
  readonly sideEffects: number;
  readonly retryCount: number;
  readonly diagnostics: readonly string[];
}>;

export type Platform450Snapshot = Readonly<{
  readonly snapshotVersion: 1;
  readonly snapshotId: string;
  readonly sourceRevision: string;
  readonly sourceHash: string;
  readonly projectionShadow: readonly string[];
  readonly flagShadow: readonly Readonly<[string, Platform450Flag]>[];
  readonly consumerShadow: readonly Readonly<{
    readonly consumerId: string;
    readonly aggregateReference: string;
    readonly headSequence: number;
    readonly lastEventId?: string;
    readonly lastFingerprint?: string;
    readonly retryCount: number;
    readonly dlq: boolean;
  }>[];
  readonly snapshotHash: string;
}>;

export type Platform450RollbackResult = Readonly<{
  readonly snapshotId: string;
  readonly restored: boolean;
  readonly compensated: false;
  readonly acceptedIdentityCount: number;
  readonly diagnostics: readonly string[];
}>;

export type Platform450Composition = Readonly<{
  readonly execute: (command: unknown) => Promise<Platform450Result>;
  readonly consume: (
    input: Platform450ConsumeInput,
  ) => Promise<Platform450ConsumerResult>;
  readonly snapshot: (snapshotId: string) => Promise<Platform450Snapshot>;
  readonly rollback: (
    snapshot: Platform450Snapshot | string,
  ) => Promise<Platform450RollbackResult>;
  readonly acceptedIdentities: () => readonly string[];
}>;
