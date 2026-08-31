import type {
  Core100Dependencies,
  Core100ServerContext,
} from "../core-100/contracts.ts";
import type { Core100Root } from "../core-100/composition-root.ts";
import type {
  Fp004CrashPoint,
  Fp004DurableSnapshot,
  Fp004RestartableInMemoryAdapter,
} from "../../fp-004/durable-transaction.ts";
import type {
  Fp004InboxOutboxLeaseAdapter,
  Fp004LeaseSnapshot,
} from "../../fp-004/inbox-outbox-lease.ts";
import type {
  Core100Command,
  Core100ExecutionResult,
  Core100Result,
} from "../core-100/contracts.ts";

export type Core110AdapterClass =
  | "IN_MEMORY"
  | "PRODUCTION_EQUIVALENT"
  | "UNTESTED";

export const CORE110_ADAPTER_CLASSES: readonly Core110AdapterClass[] = [
  "IN_MEMORY",
  "PRODUCTION_EQUIVALENT",
  "UNTESTED",
] as const;

export const CORE110_SCHEMA_VERSION = "CORE-110_V1" as const;
export const CORE110_ACCEPTANCE_IDS = [
  "CORE110-SCOPE-001",
  "CORE110-EVIDENCE-001",
  "CORE110-STOP-001",
] as const;

export type Core110FailureId =
  | "AUTHORIZATION_REVOKED_BETWEEN_ACCEPT_COMMIT"
  | "MALFORMED_PROVIDER_SUCCESS"
  | "UNKNOWN_PROVIDER_STATUS"
  | "PROVIDER_IDENTITY_HASH_MISMATCH"
  | "DUPLICATE_PROVIDER_DELIVERY"
  | "IDEMPOTENCY_CONFLICT"
  | "AGGREGATE_GAP"
  | "AGGREGATE_STALE"
  | "AGGREGATE_SAME_VERSION_CONFLICT"
  | "LEASE_THEFT"
  | "LEASE_EXPIRY"
  | "CRASH_BEFORE_TRANSACTION"
  | "CRASH_AFTER_STATE_WRITE"
  | "CRASH_AFTER_EVENT_OUTBOX_WRITE"
  | "CRASH_AFTER_COMMIT_BEFORE_RESPONSE"
  | "OUTBOX_PAUSE"
  | "OUTBOX_RETRY_EXHAUSTION"
  | "OUTBOX_POISON"
  | "OUTBOX_DLQ_REPLAY"
  | "SCHEMA_POLICY_MISMATCH"
  | "UNSUPPORTED_CAPABILITY"
  | "CROSS_TENANT_LOCATOR"
  | "PRIVATE_PAYLOAD_LEAK";

export type Core110InjectionPoint =
  | "BEFORE_TRANSACTION"
  | "AFTER_STATE_WRITE"
  | "AFTER_EVENT_OUTBOX_WRITE"
  | "AFTER_COMMIT_BEFORE_RESPONSE"
  | "ACCEPT_BEFORE_COMMIT"
  | "OUTBOX_BEFORE_SEND"
  | "OUTBOX_AFTER_SEND"
  | "REPLAY_BEFORE_PROJECT";

export interface Core110ProviderResponseControl {
  readonly kind:
    | "VALID"
    | "MALFORMED_SUCCESS"
    | "UNKNOWN_STATUS"
    | "IDENTITY_HASH_MISMATCH";
}

export interface Core110FailureInjectionControls {
  readonly crashPoint: Fp004CrashPoint | undefined;
  readonly providerResponse: Core110ProviderResponseControl | undefined;
  readonly pauseOutbox: boolean;
  readonly poisonOutbox: boolean;
  readonly retryableOutboxFailure: boolean;
  readonly authorizationRevoked: boolean;
  readonly schemaMismatch: boolean;
  readonly privacyMismatch: boolean;
  readonly unsupportedCapabilities: readonly string[];
  trigger(point: Core110InjectionPoint): void;
  count(point: Core110InjectionPoint): number;
  configure(
    values: Partial<{
      crashPoint: Fp004CrashPoint | undefined;
      providerResponse: Core110ProviderResponseControl | undefined;
      pauseOutbox: boolean;
      poisonOutbox: boolean;
      retryableOutboxFailure: boolean;
      authorizationRevoked: boolean;
      schemaMismatch: boolean;
      privacyMismatch: boolean;
      unsupportedCapabilities: readonly string[];
    }>,
  ): void;
  reset(): void;
}

export interface Core110SideEffectCounts {
  readonly provider: number;
  readonly finance: number;
  readonly notification: number;
  readonly search: number;
  readonly externalTotal: number;
}

export interface Core110SideEffectSpy {
  readonly counts: Core110SideEffectCounts;
  record(kind: keyof Omit<Core110SideEffectCounts, "externalTotal">): void;
  snapshot(): Core110SideEffectCounts;
  reset(): void;
}

export interface Core110FixtureSnapshot {
  readonly durable: Fp004DurableSnapshot;
  readonly lease: Fp004LeaseSnapshot;
}

export interface Core110Fixture {
  readonly adapterId: string;
  readonly adapterClass: Core110AdapterClass;
  readonly deliberatelyFailing: boolean;
  readonly productionEquivalentShape: boolean;
  readonly schemaVersion: string;
  readonly policyVersion: string;
  readonly controls: Core110FailureInjectionControls;
  readonly spies: Core110SideEffectSpy;
  readonly root: Core100Root;
  readonly context: Core100ServerContext;
  readonly durable: Fp004RestartableInMemoryAdapter;
  readonly lease: Fp004InboxOutboxLeaseAdapter;
  readonly dependencies: Core100Dependencies;
  snapshot(): Core110FixtureSnapshot;
  restart(): Promise<Core110Fixture>;
  execute(
    command: Core100Command,
  ): Promise<Core100Result<Core100ExecutionResult>>;
}

export interface Core110ResultIdentity {
  readonly ok: boolean;
  readonly resultKind: string;
  readonly resultHash: string;
  readonly identityMaterial: string;
  readonly diagnosticCodes: readonly string[];
}

export interface Core110Comparison {
  readonly equal: boolean;
  readonly left: Core110ResultIdentity;
  readonly right: Core110ResultIdentity;
  readonly differingPaths: readonly string[];
}

export interface Core110EvidenceRow {
  readonly acceptanceId: typeof CORE110_ACCEPTANCE_IDS[number];
  readonly fixtureId: string;
  readonly adapterId: string;
  readonly adapterClass: Core110AdapterClass;
  readonly failureId: Core110FailureId;
  readonly command: string;
  readonly exitCode: number;
  readonly resultHash: string;
  readonly sideEffectCounts: Core110SideEffectCounts;
  readonly restartTranscript: readonly string[];
  readonly result: "PASS" | "FAIL" | "UNTESTED";
  readonly expected: string;
  readonly actual: string;
  readonly reviewer: "PENDING" | "APPROVED" | "REJECTED";
}

export interface Core110EvidenceDocument {
  readonly evidenceVersion: typeof CORE110_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly commands: readonly string[];
  readonly rows: readonly Core110EvidenceRow[];
  readonly baselineIdentity: string;
  readonly resultHash: string;
  readonly sideEffectCounts: Core110SideEffectCounts;
  readonly restartTranscript: readonly string[];
  readonly independentReview:
    | "PENDING"
    | {
        readonly status: "APPROVED" | "REJECTED";
        readonly reviewer: string;
        readonly reviewerId: string;
        readonly summary: string;
      };
  readonly untested: readonly string[];
}
