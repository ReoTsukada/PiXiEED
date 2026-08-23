/** In-memory sequencer, broadcast transport, and ordered consumer. */

import {
  committedOperationFingerprint,
  createPixisyncDraft,
  operationFingerprint,
  revisionReferences,
  validatePixisyncCommitted,
  validatePixisyncDraft,
  writerGuard,
} from "./core.ts";
import {
  type PixisyncAggregate,
  type PixisyncAggregateAdapter,
  type PixisyncApplyContext,
  type PixisyncCommittedOperation,
  PixisyncError,
  type PixisyncJsonObject,
  type PixisyncOperationDraft,
  type PixisyncOperationResult,
  type PixisyncProjectSnapshot,
} from "./contracts.ts";

const AGGREGATES: readonly PixisyncAggregate[] = ["draw", "audio", "game"];
type Receiver = (operation: PixisyncCommittedOperation) => Promise<void>;

function emptyRevisions(): Record<PixisyncAggregate, number> {
  return { draw: 0, audio: 0, game: 0 };
}

function adapterMap(
  adapters: readonly PixisyncAggregateAdapter[],
): Map<PixisyncAggregate, PixisyncAggregateAdapter> {
  const result = new Map<PixisyncAggregate, PixisyncAggregateAdapter>();
  for (const adapter of adapters) {
    if (result.has(adapter.aggregate)) {
      throw new PixisyncError(
        "INVALID_ENVELOPE",
        "Each aggregate needs one adapter.",
        "adapter.aggregate",
      );
    }
    result.set(adapter.aggregate, adapter);
  }
  for (const aggregate of AGGREGATES) {
    if (!result.has(aggregate)) {
      throw new PixisyncError(
        "INVALID_ENVELOPE",
        "Draw, Audio, and Game adapters are all required.",
        "adapters",
      );
    }
  }
  return result;
}

export class PixisyncInMemoryTransport {
  readonly #log: PixisyncCommittedOperation[] = [];
  readonly #receivers = new Map<string, Receiver>();

  broadcast(operation: PixisyncCommittedOperation): void {
    this.#log.push(operation);
  }

  connect(clientId: string, receiver: Receiver): () => void {
    if (this.#receivers.has(clientId)) {
      throw new PixisyncError(
        "IDEMPOTENCY_CONFLICT",
        "Client is already connected.",
        "clientId",
      );
    }
    this.#receivers.set(clientId, receiver);
    return () => this.#receivers.delete(clientId);
  }

  operationsSince(
    projectRevision: number,
  ): readonly PixisyncCommittedOperation[] {
    return this.#log.filter((operation) =>
      operation.projectRevision > projectRevision
    );
  }

  async deliver(
    clientId: string,
    operations: readonly PixisyncCommittedOperation[],
  ): Promise<void> {
    const receiver = this.#receivers.get(clientId);
    if (!receiver) {
      throw new PixisyncError(
        "INVALID_ENVELOPE",
        "Client is not connected.",
        "clientId",
      );
    }
    for (const operation of operations) await receiver(operation);
  }

  async reconnectCatchUp(
    clientId: string,
    projectRevision: number,
  ): Promise<void> {
    await this.deliver(clientId, this.operationsSince(projectRevision));
  }
}

export class PixisyncInMemorySequencer {
  readonly #projectId: string;
  readonly #adapters: Map<PixisyncAggregate, PixisyncAggregateAdapter>;
  readonly #transport: PixisyncInMemoryTransport;
  readonly #now: () => Date;
  readonly #operations: PixisyncCommittedOperation[] = [];
  readonly #byId = new Map<string, PixisyncCommittedOperation>();
  #projectRevision = 0;
  #aggregateRevisions = emptyRevisions();

  constructor(options: {
    readonly projectId: string;
    readonly adapters: readonly PixisyncAggregateAdapter[];
    readonly transport?: PixisyncInMemoryTransport;
    readonly now?: () => Date;
  }) {
    this.#projectId = options.projectId;
    this.#adapters = adapterMap(options.adapters);
    this.#transport = options.transport ?? new PixisyncInMemoryTransport();
    this.#now = options.now ?? (() => new Date("2026-01-01T00:00:00.000Z"));
  }

  get transport(): PixisyncInMemoryTransport {
    return this.#transport;
  }

  snapshot(): PixisyncProjectSnapshot {
    return {
      projectId: this.#projectId,
      projectRevision: this.#projectRevision,
      aggregateRevisions: { ...this.#aggregateRevisions },
      operationIds: this.#operations.map((operation) => operation.operationId),
    };
  }

  log(): readonly PixisyncCommittedOperation[] {
    return [...this.#operations];
  }

  async commit(
    draft: PixisyncOperationDraft,
  ): Promise<PixisyncOperationResult> {
    await validatePixisyncDraft(draft);
    if (draft.projectId !== this.#projectId) {
      throw new PixisyncError(
        "PROJECT_MISMATCH",
        "Operation belongs to another project.",
        "projectId",
      );
    }
    const existing = this.#byId.get(draft.operationId);
    if (existing) {
      const currentFingerprint = await operationFingerprint(existing);
      const incomingFingerprint = await operationFingerprint(draft);
      if (currentFingerprint !== incomingFingerprint) {
        throw new PixisyncError(
          "IDEMPOTENCY_CONFLICT",
          "Operation ID was reused with a different payload or identity.",
          "operationId",
        );
      }
      return { operation: existing, duplicate: true };
    }
    if (draft.baseProjectRevision > this.#projectRevision) {
      throw new PixisyncError(
        "SEQUENCER_NOT_CONTIGUOUS",
        "baseProjectRevision is ahead of the sequencer.",
        "baseProjectRevision",
      );
    }
    const currentAggregateRevision = this.#aggregateRevisions[draft.aggregate];
    if (
      draft.aggregateRevision !== 0 &&
      draft.aggregateRevision !== currentAggregateRevision + 1
    ) {
      throw new PixisyncError(
        "AGGREGATE_REVISION_STALE",
        "aggregateRevision is not the next canonical revision.",
        "aggregateRevision",
      );
    }
    for (const reference of revisionReferences(draft.payload)) {
      if (reference.projectRevision > this.#projectRevision) {
        throw new PixisyncError(
          "SEQUENCER_NOT_CONTIGUOUS",
          "Cross-domain reference points to a future revision.",
          "payload.revisionRef.projectRevision",
        );
      }
      const referenced = this.#byId.get(reference.operationId);
      if (
        !referenced ||
        referenced.projectRevision !== reference.projectRevision ||
        referenced.aggregateRevision !== reference.aggregateRevision ||
        referenced.aggregate !== reference.aggregate
      ) {
        throw new PixisyncError(
          "INVALID_ENVELOPE",
          "Cross-domain reference is not bound to a committed operation.",
          "payload.revisionRef",
        );
      }
    }
    this.#assertCompensation(draft);
    const operation: PixisyncCommittedOperation = {
      ...draft,
      aggregateRevision: currentAggregateRevision + 1,
      projectRevision: this.#projectRevision + 1,
      committedAt: this.#now().toISOString(),
    };
    const adapter = this.#adapters.get(operation.aggregate)!;
    const context: PixisyncApplyContext = {
      source: "sequencer",
      projectRevision: operation.projectRevision,
      aggregateRevision: operation.aggregateRevision,
    };
    try {
      await adapter.apply(operation, context);
    } catch {
      throw new PixisyncError(
        "AGGREGATE_APPLY_FAILED",
        "Aggregate apply failed; project revision was not advanced.",
        "aggregate",
      );
    }
    this.#projectRevision = operation.projectRevision;
    this.#aggregateRevisions = {
      ...this.#aggregateRevisions,
      [operation.aggregate]: operation.aggregateRevision,
    };
    this.#operations.push(operation);
    this.#byId.set(operation.operationId, operation);
    this.#transport.broadcast(operation);
    return { operation, duplicate: false };
  }

  #assertCompensation(draft: PixisyncOperationDraft): void {
    if (!draft.compensation) return;
    const target = this.#byId.get(draft.compensation.targetOperationId);
    if (!target || target.aggregate !== draft.aggregate) {
      throw new PixisyncError(
        "COMPENSATION_GUARD_STALE",
        "Compensation target is missing or belongs to another aggregate.",
        "compensation.targetOperationId",
      );
    }
    if (
      draft.compensation.expectedAggregateRevision !== undefined &&
      draft.compensation.expectedAggregateRevision !==
        this.#aggregateRevisions[draft.aggregate]
    ) {
      throw new PixisyncError(
        "COMPENSATION_GUARD_STALE",
        "Compensation expectedAggregateRevision is stale.",
        "compensation.expectedAggregateRevision",
      );
    }
    if (
      draft.compensation.writerGuard !== undefined &&
      draft.compensation.writerGuard !== writerGuard(target)
    ) {
      throw new PixisyncError(
        "COMPENSATION_GUARD_STALE",
        "Compensation writer guard is stale.",
        "compensation.writerGuard",
      );
    }
  }
}

export type PixisyncReceiveOutcome = "applied" | "duplicate" | "gap-held";

export class PixisyncOrderKeeper {
  readonly #projectId: string;
  readonly #adapters: Map<PixisyncAggregate, PixisyncAggregateAdapter>;
  readonly #pending = new Map<number, PixisyncCommittedOperation>();
  readonly #applied = new Map<string, string>();
  #projectRevision = 0;
  #aggregateRevisions = emptyRevisions();

  constructor(
    options: {
      readonly projectId: string;
      readonly adapters: readonly PixisyncAggregateAdapter[];
    },
  ) {
    this.#projectId = options.projectId;
    this.#adapters = adapterMap(options.adapters);
  }

  snapshot(): PixisyncProjectSnapshot {
    return {
      projectId: this.#projectId,
      projectRevision: this.#projectRevision,
      aggregateRevisions: { ...this.#aggregateRevisions },
      operationIds: [...this.#applied.keys()],
    };
  }

  async receive(
    operation: PixisyncCommittedOperation,
  ): Promise<PixisyncReceiveOutcome> {
    await validatePixisyncCommitted(operation);
    if (operation.projectId !== this.#projectId) {
      throw new PixisyncError(
        "PROJECT_MISMATCH",
        "Operation belongs to another project.",
        "projectId",
      );
    }
    const fingerprint = await committedOperationFingerprint(operation);
    const appliedFingerprint = this.#applied.get(operation.operationId);
    if (appliedFingerprint) {
      if (appliedFingerprint !== fingerprint) {
        throw new PixisyncError(
          "IDEMPOTENCY_CONFLICT",
          "Applied operation ID has a different payload.",
          "operationId",
        );
      }
      return "duplicate";
    }
    const held = this.#pending.get(operation.projectRevision);
    if (held) {
      if (await committedOperationFingerprint(held) !== fingerprint) {
        throw new PixisyncError(
          "IDEMPOTENCY_CONFLICT",
          "Held operation revision has a different payload.",
          "projectRevision",
        );
      }
      return "duplicate";
    }
    if (operation.projectRevision <= this.#projectRevision) {
      throw new PixisyncError(
        "SEQUENCER_NOT_CONTIGUOUS",
        "Unknown old project revision cannot be applied.",
        "projectRevision",
      );
    }
    this.#pending.set(operation.projectRevision, operation);
    if (operation.projectRevision > this.#projectRevision + 1) {
      return "gap-held";
    }
    await this.#drain();
    return "applied";
  }

  async catchUp(
    operations: readonly PixisyncCommittedOperation[],
  ): Promise<void> {
    for (
      const operation of [...operations].sort((left, right) =>
        left.projectRevision - right.projectRevision
      )
    ) await this.receive(operation);
  }

  async #drain(): Promise<void> {
    while (this.#pending.has(this.#projectRevision + 1)) {
      const operation = this.#pending.get(this.#projectRevision + 1)!;
      const expectedAggregateRevision =
        this.#aggregateRevisions[operation.aggregate] + 1;
      if (operation.aggregateRevision !== expectedAggregateRevision) {
        throw new PixisyncError(
          "AGGREGATE_REVISION_STALE",
          "Aggregate revision is not contiguous.",
          "aggregateRevision",
        );
      }
      const adapter = this.#adapters.get(operation.aggregate)!;
      try {
        await adapter.apply(operation, {
          source: "remote",
          projectRevision: operation.projectRevision,
          aggregateRevision: operation.aggregateRevision,
        });
      } catch {
        throw new PixisyncError(
          "AGGREGATE_APPLY_FAILED",
          "Remote aggregate apply failed; order keeper did not advance.",
          "aggregate",
        );
      }
      this.#pending.delete(operation.projectRevision);
      this.#applied.set(
        operation.operationId,
        await committedOperationFingerprint(operation),
      );
      this.#projectRevision = operation.projectRevision;
      this.#aggregateRevisions = {
        ...this.#aggregateRevisions,
        [operation.aggregate]: operation.aggregateRevision,
      };
    }
  }
}

export async function makeDraft(
  input: Omit<PixisyncOperationDraft, "payloadHash" | "schemaVersion">,
): Promise<PixisyncOperationDraft> {
  return createPixisyncDraft(input);
}

export type { PixisyncJsonObject };
