/**
 * WORK-420 isolated trusted-event adapter.
 *
 * The adapter composes the existing FP-004 in-memory reference boundaries. It
 * accepts only a server-issued provider ingress capability and bounded event
 * references/hashes. It is intentionally not a durable store, Provider SDK,
 * payment adapter, or production event implementation.
 */

import type {
  AuthorizationProofV1,
  ContentHash,
} from "../../wp160-contracts.ts";
import {
  type Fp004AdapterOptions,
  type Fp004DurableSnapshot,
  type Fp004FaultInjector,
  type Fp004ReplayResult,
  Fp004RestartableInMemoryAdapter,
} from "../../fp-004/durable-transaction.ts";
import type {
  Fp004CommitRequest,
  Fp004CommitResult,
  Fp004ConsumerOutcome,
  Fp004Diagnostic,
  Fp004Lease,
  Fp004ProviderIdentity,
  Fp004RecordId,
  Fp004ReplayRequest,
  Fp004Result,
} from "../../fp-004/contracts.ts";
import {
  createFp004ServerProviderIngress,
  type Fp004CompletionResult,
  type Fp004InboxAcceptance,
  Fp004InboxOutboxLeaseAdapter,
  type Fp004LeasedOutbox,
  type Fp004LeasePersistence,
  type Fp004LeaseSnapshot,
  type Fp004OutboxEnqueueResult,
  type Fp004ProviderInboxResolution,
  type Fp004ProviderIngress,
  InMemoryFp004LeasePersistence,
} from "../../fp-004/inbox-outbox-lease.ts";
import {
  WORK420_EVENT_ADAPTER_CAPABILITY,
  WORK420_EVENT_ADAPTER_SCHEMA_VERSION,
  type Work420EventAdapterCapability,
} from "./contracts.ts";

export interface Work420TrustedEventInput {
  readonly authorizationProof: AuthorizationProofV1;
  readonly expectedAuthorization: Fp004CommitRequest["expectedAuthorization"];
  readonly idempotency: Fp004CommitRequest["idempotency"];
  readonly event: Fp004CommitRequest["event"];
  readonly stateReference: Fp004CommitRequest["stateReference"];
}

export interface Work420ProviderIngressBinding {
  readonly principalId: string;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly resolve: (
    rawProviderPayload: unknown,
  ) => Fp004ProviderInboxResolution;
}

export interface Work420TrustedEventAdapterOptions {
  readonly clock?: () => Date;
  readonly maxAttempts?: number;
  readonly faultInjector?: Fp004FaultInjector;
  readonly authorizationRevalidator: NonNullable<
    Fp004AdapterOptions["authorizationRevalidator"]
  >;
  readonly providerIngress: Work420ProviderIngressBinding;
  readonly leasePersistence?: Fp004LeasePersistence;
}

export interface Work420EventAdapterSnapshot {
  readonly schemaVersion: typeof WORK420_EVENT_ADAPTER_SCHEMA_VERSION;
  readonly capability: Work420EventAdapterCapability;
  readonly transactions: Fp004DurableSnapshot;
  readonly leases: Fp004LeaseSnapshot;
}

function malformed<T>(message: string): Fp004Result<T> {
  return {
    ok: false,
    diagnostics: [{
      code: "MALFORMED_SUCCESS",
      message,
      recoverable: false,
    }],
  };
}

/**
 * WORK-420's event surface is a bounded adapter around FP-004. The adapter
 * does not create a second Authorization or Money authority model.
 */
export class Work420TrustedEventAdapter {
  readonly schemaVersion = WORK420_EVENT_ADAPTER_SCHEMA_VERSION;
  readonly capability = WORK420_EVENT_ADAPTER_CAPABILITY;
  readonly transactions: Fp004RestartableInMemoryAdapter;
  readonly leases: Fp004InboxOutboxLeaseAdapter;
  readonly #providerIngress: Fp004ProviderIngress;

  constructor(options: Work420TrustedEventAdapterOptions) {
    const transactionOptions: Fp004AdapterOptions = {
      ...(options.clock === undefined ? {} : { clock: options.clock }),
      ...(options.maxAttempts === undefined
        ? {}
        : { maxAttempts: options.maxAttempts }),
      ...(options.faultInjector === undefined
        ? {}
        : { faultInjector: options.faultInjector }),
      authorizationRevalidator: options.authorizationRevalidator,
    };
    this.transactions = new Fp004RestartableInMemoryAdapter({
      ...transactionOptions,
    });
    const leaseOptions = {
      ...(options.clock === undefined ? {} : { now: options.clock }),
      ...(options.maxAttempts === undefined
        ? {}
        : { policy: { maxAttempts: options.maxAttempts } }),
    };
    this.leases = new Fp004InboxOutboxLeaseAdapter(
      options.leasePersistence ?? new InMemoryFp004LeasePersistence(),
      leaseOptions,
    );
    this.#providerIngress = createFp004ServerProviderIngress(
      options.providerIngress,
    );
  }

  async commitDomainEvent(
    input: Work420TrustedEventInput,
  ): Promise<Fp004Result<Fp004CommitResult>> {
    try {
      const result = await this.transactions.commit(input);
      if (result === null || typeof result !== "object" || !("ok" in result)) {
        return malformed("WORK-420 event commit returned a malformed result.");
      }
      if (!result.ok) return result;
      if (
        result.value === null ||
        typeof result.value !== "object" ||
        result.value.event.eventId !== input.event.eventId ||
        result.value.event.resultHash !== input.stateReference.stateHash
      ) return malformed("WORK-420 event commit returned an unbound success.");
      return result;
    } catch {
      return malformed(
        "WORK-420 event commit failed closed at the adapter boundary.",
      );
    }
  }

  acceptProvider(
    rawProviderPayload: unknown,
  ): Fp004Result<Fp004InboxAcceptance> {
    try {
      return this.leases.acceptProviderEvent(
        this.#providerIngress,
        rawProviderPayload,
      );
    } catch {
      return malformed("WORK-420 Provider ingress failed closed.");
    }
  }

  enqueueOutbox(
    event: NonNullable<ReturnType<Fp004RestartableInMemoryAdapter["getEvent"]>>,
  ): Fp004Result<Fp004OutboxEnqueueResult> {
    try {
      return this.leases.enqueueOutbox(event);
    } catch {
      return malformed("WORK-420 Outbox enqueue failed closed.");
    }
  }

  leaseOutbox(
    ownerId: string,
    now?: Date,
    outboxId?: Fp004RecordId,
  ): Fp004Result<Fp004LeasedOutbox> {
    try {
      return this.leases.leaseOutbox(
        ownerId,
        now,
        outboxId === undefined ? {} : { outboxId },
      );
    } catch {
      return malformed("WORK-420 Outbox lease failed closed.");
    }
  }

  completeOutbox(
    ownerId: string,
    lease: Fp004Lease,
    delivery: unknown,
    now?: Date,
    outboxId?: Fp004RecordId,
  ): Fp004Result<Fp004CompletionResult> {
    try {
      return this.leases.completeOutbox(
        ownerId,
        lease.fencingToken,
        delivery,
        now,
        outboxId,
      );
    } catch {
      return malformed("WORK-420 Outbox completion failed closed.");
    }
  }

  leaseInbox(
    ownerId: string,
    now?: Date,
    inboxId?: Fp004RecordId,
  ) {
    try {
      return this.leases.leaseInbox(
        ownerId,
        now,
        inboxId === undefined ? {} : { inboxId },
      );
    } catch {
      return malformed("WORK-420 Inbox lease failed closed.");
    }
  }

  acknowledgeInbox(
    ownerId: string,
    lease: Fp004Lease,
    delivery: unknown,
    now?: Date,
    inboxId?: Fp004RecordId,
  ): Fp004Result<Fp004CompletionResult> {
    try {
      return this.leases.acknowledgeInbox(
        ownerId,
        lease.fencingToken,
        delivery,
        now,
        inboxId,
      );
    } catch {
      return malformed("WORK-420 Inbox acknowledgement failed closed.");
    }
  }

  replay(
    request: Fp004ReplayRequest,
    sourceCursor?: string,
  ): Fp004Result<Fp004ReplayResult> {
    try {
      return this.transactions.replay(request, sourceCursor);
    } catch {
      return malformed("WORK-420 replay failed closed.");
    }
  }

  snapshot(): Work420EventAdapterSnapshot {
    return Object.freeze({
      schemaVersion: WORK420_EVENT_ADAPTER_SCHEMA_VERSION,
      capability: this.capability,
      transactions: this.transactions.snapshot(),
      leases: this.leases.snapshot(),
    });
  }
}

export type {
  ContentHash,
  Fp004CompletionResult,
  Fp004ConsumerOutcome,
  Fp004Diagnostic,
  Fp004InboxAcceptance,
  Fp004Lease,
  Fp004LeasePersistence,
  Fp004LeaseSnapshot,
  Fp004ProviderIdentity,
  Fp004Result,
};
