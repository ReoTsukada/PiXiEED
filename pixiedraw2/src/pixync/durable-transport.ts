/**
 * PIXYNC-DRAW2-200 internal durable transport coordinator.
 *
 * The coordinator owns sequencing between the existing 120 journal, the
 * internal 190 transport adapter, and the 100 OrderKeeper. It is intentionally
 * not part of the public pixync index and accepts no provider constructor.
 */

import {
  committedOperationFingerprint,
  operationFingerprint,
  validatePixyncCommitted,
  validatePixyncDraft,
} from "./core.ts";
import type {
  PixyncCommittedOperation,
  PixyncOperationDraft,
} from "./contracts.ts";
import {
  type PixyncAuthoritativeAck,
  PixyncDurableJournal,
  type PixyncOutboxLeaseResult,
} from "./durability.ts";
import { PixyncOrderKeeper } from "./in-memory.ts";
import {
  type PixyncAuthoritativeOperationEvent,
  type PixyncTransportAck,
  PixyncTransportAdapter,
  type PixyncTransportConnectInput,
  type PixyncTransportStatus,
} from "./transport.ts";

export class PixyncDurableTransportError extends Error {
  readonly code: "NO_LEASE" | "INVALID_STATE" | "REMOTE_EVENT_INVALID";

  constructor(
    code: PixyncDurableTransportError["code"],
    message: string,
  ) {
    super(message);
    this.name = "PixyncDurableTransportError";
    this.code = code;
  }
}

export interface PixyncDurableTransportConnectInput {
  readonly projectId: string;
  readonly clientId: string;
  readonly sessionGeneration: number;
  readonly onBroadcastHint?: () => void;
  readonly onCatchUpError?: (error: unknown) => void;
  readonly onStatus?: (status: PixyncTransportStatus) => void;
}

export interface PixyncDurableTransportCoordinatorOptions {
  readonly journal: PixyncDurableJournal;
  readonly transport: PixyncTransportAdapter;
  readonly orderKeeper: PixyncOrderKeeper;
  readonly workerId: string;
  readonly now?: () => Date;
}

export class PixyncDurableTransportCoordinator {
  readonly #journal: PixyncDurableJournal;
  readonly #transport: PixyncTransportAdapter;
  readonly #orderKeeper: PixyncOrderKeeper;
  readonly #workerId: string;
  readonly #now: () => Date;
  #tail: Promise<void> = Promise.resolve();
  #hintCatchUp: Promise<void> | undefined;
  #hintCatchUpPending = false;
  #onCatchUpError: ((error: unknown) => void) | undefined;

  constructor(options: PixyncDurableTransportCoordinatorOptions) {
    if (options.workerId.length === 0) {
      throw new PixyncDurableTransportError(
        "INVALID_STATE",
        "A durable transport worker ID is required.",
      );
    }
    if (
      options.orderKeeper.snapshot().projectId !==
        options.journal.snapshot().projectId
    ) {
      throw new PixyncDurableTransportError(
        "INVALID_STATE",
        "Journal and OrderKeeper must be bound to the same project.",
      );
    }
    this.#journal = options.journal;
    this.#transport = options.transport;
    this.#orderKeeper = options.orderKeeper;
    this.#workerId = options.workerId;
    this.#now = options.now ?? (() => new Date());
  }

  get journal(): PixyncDurableJournal {
    return this.#journal;
  }

  get transport(): PixyncTransportAdapter {
    return this.#transport;
  }

  get orderKeeper(): PixyncOrderKeeper {
    return this.#orderKeeper;
  }

  async connect(input: PixyncDurableTransportConnectInput): Promise<void> {
    this.#onCatchUpError = input.onCatchUpError;
    const transportInput: PixyncTransportConnectInput = {
      projectId: input.projectId,
      clientId: input.clientId,
      sessionGeneration: input.sessionGeneration,
      ...(input.onStatus === undefined ? {} : { onStatus: input.onStatus }),
      onOperation: (event) => this.receiveRemote(event),
      onBroadcastHint: () => {
        input.onBroadcastHint?.();
        this.#requestHintCatchUp();
      },
    };
    await this.#transport.connect(transportInput);
  }

  async submit(draft: PixyncOperationDraft): Promise<PixyncTransportAck> {
    return this.#serial(() => this.#submit(draft));
  }

  async receiveRemote(
    event: PixyncAuthoritativeOperationEvent,
  ): Promise<void> {
    return this.#serial(() => this.#receiveRemote(event));
  }

  async catchUp(): Promise<void> {
    return this.#serial(async () => {
      const operations = await this.#transport.catchUp(
        this.#orderKeeper.snapshot().projectRevision,
      );
      for (const operation of operations) {
        await this.#acceptAndDrain(operation);
      }
    });
  }

  async settleBroadcastHints(): Promise<void> {
    await this.#hintCatchUp;
  }

  /** Reconciles ACKs and Inbox receipts left by a crashed coordinator. */
  async reconcile(): Promise<void> {
    return this.#serial(() => this.#reconcile());
  }

  async close(reason = "closed"): Promise<void> {
    this.#hintCatchUpPending = false;
    this.#onCatchUpError = undefined;
    return this.#serial(() => this.#transport.close(reason));
  }

  #requestHintCatchUp(): void {
    if (this.#hintCatchUp !== undefined) {
      this.#hintCatchUpPending = true;
      return;
    }
    const run = async (): Promise<void> => {
      do {
        this.#hintCatchUpPending = false;
        await this.catchUp();
      } while (this.#hintCatchUpPending);
    };
    const pending = run()
      .catch((error) => this.#onCatchUpError?.(error))
      .finally(() => {
        if (this.#hintCatchUp === pending) this.#hintCatchUp = undefined;
      });
    this.#hintCatchUp = pending;
  }

  async #submit(draft: PixyncOperationDraft): Promise<PixyncTransportAck> {
    await validatePixyncDraft(draft);
    await this.#drainOutbox();
    const beforeEnqueue = this.#journal.snapshot();
    const dispatched = beforeEnqueue.outbox.find((item) =>
      item.operationId === draft.operationId && item.state === "DISPATCHED"
    );
    const alreadyCommitted = beforeEnqueue.vault.committed.find((item) =>
      item.envelope.operationId === draft.operationId
    );
    if (dispatched !== undefined && alreadyCommitted !== undefined) {
      if (
        await operationFingerprint(alreadyCommitted.envelope) !==
          await operationFingerprint(draft)
      ) {
        throw new PixyncDurableTransportError(
          "INVALID_STATE",
          "The committed operation ID is bound to another submission.",
        );
      }
      await this.#acceptAndDrain(alreadyCommitted.envelope);
      return this.#duplicateAck(
        draft,
        alreadyCommitted.envelope,
        dispatched.fingerprint,
      );
    }
    const queued = await this.#journal.enqueue(draft);
    const existing = this.#journal.snapshot().outbox.find((item) =>
      item.operationId === draft.operationId
    );
    if (existing?.state === "DISPATCHED") {
      const committed = this.#journal.snapshot().vault.committed.find((item) =>
        item.envelope.operationId === draft.operationId
      )?.envelope;
      if (committed !== undefined) {
        await this.#acceptAndDrain(committed);
        return this.#duplicateAck(draft, committed, existing.fingerprint);
      }
    }
    const lease = await this.#journal.leaseOutbox(
      this.#workerId,
      this.#now(),
    );
    if (lease === undefined || lease.record.operationId !== draft.operationId) {
      if (queued.duplicate) {
        throw new PixyncDurableTransportError(
          "NO_LEASE",
          "The durable draft is leased by another live worker.",
        );
      }
      throw new PixyncDurableTransportError(
        "NO_LEASE",
        "The durable draft could not be leased before submit.",
      );
    }
    return this.#dispatchLease(lease);
  }

  async #dispatchLease(
    lease: PixyncOutboxLeaseResult,
  ): Promise<PixyncTransportAck> {
    let ack: PixyncTransportAck;
    try {
      ack = await this.#transport.submit(lease.record.envelope);
    } catch (error) {
      try {
        await this.#journal.failOutbox(
          lease.record.operationId,
          lease.lease.token,
          true,
        );
      } catch {
        // The original transport error remains authoritative; restart
        // reconciliation will inspect the durable lease state.
      }
      throw error;
    }
    await this.#journal.acknowledgeOutboxAuthoritative(
      lease.record.operationId,
      lease.lease.token,
      ack as PixyncAuthoritativeAck,
    );
    await this.#acceptAndDrain(ack.operation);
    return ack;
  }

  async #receiveRemote(
    event: PixyncAuthoritativeOperationEvent,
  ): Promise<void> {
    if (
      event === null || typeof event !== "object" ||
      event.origin !== "AUTHORITATIVE_TAIL" ||
      event.operation === null || typeof event.operation !== "object"
    ) {
      throw new PixyncDurableTransportError(
        "REMOTE_EVENT_INVALID",
        "Only an authoritative committed operation event may enter the Inbox.",
      );
    }
    await validatePixyncCommitted(event.operation);
    await this.#acceptAndDrain(event.operation);
  }

  async #acceptAndDrain(
    operation: PixyncCommittedOperation,
  ): Promise<void> {
    await this.#journal.acceptIncoming(operation, {
      operationId: operation.operationId,
      fingerprint: await committedOperationFingerprint(operation),
      projectRevision: operation.projectRevision,
    });
    await this.#drainInbox();
  }

  async #drainInbox(): Promise<void> {
    while (true) {
      const lease = await this.#journal.leaseInbox(
        this.#workerId,
        this.#now(),
      );
      if (lease === undefined) return;
      const outcome = await this.#journal.applyInbox(
        lease.record.operationId,
        lease.lease.token,
        this.#orderKeeper,
      );
      if (outcome === "gap-held") return;
    }
  }

  async #reconcile(): Promise<void> {
    await this.#drainOutbox();
    const snapshot = this.#journal.snapshot();
    for (const committed of snapshot.vault.committed) {
      await this.#acceptAndDrain(committed.envelope);
    }
    await this.#drainInbox();
  }

  async #drainOutbox(): Promise<void> {
    while (true) {
      const lease = await this.#journal.leaseOutbox(
        this.#workerId,
        this.#now(),
      );
      if (lease === undefined) return;
      await this.#dispatchLease(lease);
    }
  }

  async #serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async #duplicateAck(
    draft: PixyncOperationDraft,
    committed: PixyncCommittedOperation,
    submissionFingerprint: string,
  ): Promise<PixyncTransportAck> {
    return {
      kind: "DUPLICATE",
      operationId: draft.operationId,
      projectId: draft.projectId,
      projectRevision: committed.projectRevision,
      aggregateRevision: committed.aggregateRevision,
      submissionFingerprint,
      committedFingerprint: await committedOperationFingerprint(committed),
      operation: committed,
    };
  }
}
