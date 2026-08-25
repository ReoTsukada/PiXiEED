/** In-memory sequencer, broadcast transport, and ordered consumer. */

import {
  committedOperationFingerprint,
  createPixyncDraft,
  operationFingerprint,
  revisionReferences,
  validatePixyncCommitted,
  validatePixyncDraft,
  writerGuard,
} from "./core.ts";
import {
  type PixyncAggregate,
  type PixyncAggregateAdapter,
  type PixyncApplyContext,
  type PixyncCommittedOperation,
  PixyncError,
  type PixyncJsonObject,
  type PixyncOperationDraft,
  type PixyncOperationResult,
  type PixyncProjectSnapshot,
} from "./contracts.ts";

const AGGREGATES: readonly PixyncAggregate[] = ["draw", "audio", "game"];
type Receiver = (operation: PixyncCommittedOperation) => Promise<void>;

function emptyRevisions(): Record<PixyncAggregate, number> {
  return { draw: 0, audio: 0, game: 0 };
}

function adapterMap(
  adapters: readonly PixyncAggregateAdapter[],
): Map<PixyncAggregate, PixyncAggregateAdapter> {
  const result = new Map<PixyncAggregate, PixyncAggregateAdapter>();
  for (const adapter of adapters) {
    if (result.has(adapter.aggregate)) {
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Each aggregate needs one adapter.",
        "adapter.aggregate",
      );
    }
    result.set(adapter.aggregate, adapter);
  }
  for (const aggregate of AGGREGATES) {
    if (!result.has(aggregate)) {
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Draw, Audio, and Game adapters are all required.",
        "adapters",
      );
    }
  }
  return result;
}

export class PixyncInMemoryTransport {
  readonly #log: PixyncCommittedOperation[] = [];
  readonly #receivers = new Map<string, Receiver>();

  broadcast(operation: PixyncCommittedOperation): void {
    this.#log.push(operation);
  }

  connect(clientId: string, receiver: Receiver): () => void {
    if (this.#receivers.has(clientId)) {
      throw new PixyncError(
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
  ): readonly PixyncCommittedOperation[] {
    return this.#log.filter((operation) =>
      operation.projectRevision > projectRevision
    );
  }

  async deliver(
    clientId: string,
    operations: readonly PixyncCommittedOperation[],
  ): Promise<void> {
    const receiver = this.#receivers.get(clientId);
    if (!receiver) {
      throw new PixyncError(
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

export class PixyncInMemorySequencer {
  readonly #projectId: string;
  readonly #adapters: Map<PixyncAggregate, PixyncAggregateAdapter>;
  readonly #transport: PixyncInMemoryTransport;
  readonly #now: () => Date;
  readonly #operations: PixyncCommittedOperation[] = [];
  readonly #byId = new Map<string, PixyncCommittedOperation>();
  #projectRevision = 0;
  #aggregateRevisions = emptyRevisions();

  constructor(options: {
    readonly projectId: string;
    readonly adapters: readonly PixyncAggregateAdapter[];
    readonly transport?: PixyncInMemoryTransport;
    readonly now?: () => Date;
  }) {
    this.#projectId = options.projectId;
    this.#adapters = adapterMap(options.adapters);
    this.#transport = options.transport ?? new PixyncInMemoryTransport();
    this.#now = options.now ?? (() => new Date("2026-01-01T00:00:00.000Z"));
  }

  get transport(): PixyncInMemoryTransport {
    return this.#transport;
  }

  snapshot(): PixyncProjectSnapshot {
    return {
      projectId: this.#projectId,
      projectRevision: this.#projectRevision,
      aggregateRevisions: { ...this.#aggregateRevisions },
      operationIds: this.#operations.map((operation) => operation.operationId),
    };
  }

  log(): readonly PixyncCommittedOperation[] {
    return [...this.#operations];
  }

  async commit(
    draft: PixyncOperationDraft,
  ): Promise<PixyncOperationResult> {
    await validatePixyncDraft(draft);
    if (draft.projectId !== this.#projectId) {
      throw new PixyncError(
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
        throw new PixyncError(
          "IDEMPOTENCY_CONFLICT",
          "Operation ID was reused with a different payload or identity.",
          "operationId",
        );
      }
      return { operation: existing, duplicate: true };
    }
    if (draft.baseProjectRevision > this.#projectRevision) {
      throw new PixyncError(
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
      throw new PixyncError(
        "AGGREGATE_REVISION_STALE",
        "aggregateRevision is not the next canonical revision.",
        "aggregateRevision",
      );
    }
    for (const reference of revisionReferences(draft.payload)) {
      if (reference.projectRevision > this.#projectRevision) {
        throw new PixyncError(
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
        throw new PixyncError(
          "INVALID_ENVELOPE",
          "Cross-domain reference is not bound to a committed operation.",
          "payload.revisionRef",
        );
      }
    }
    this.#assertCompensation(draft);
    const operation: PixyncCommittedOperation = {
      ...draft,
      aggregateRevision: currentAggregateRevision + 1,
      projectRevision: this.#projectRevision + 1,
      committedAt: this.#now().toISOString(),
    };
    const adapter = this.#adapters.get(operation.aggregate)!;
    const context: PixyncApplyContext = {
      source: "sequencer",
      projectRevision: operation.projectRevision,
      aggregateRevision: operation.aggregateRevision,
    };
    try {
      await adapter.apply(operation, context);
    } catch {
      throw new PixyncError(
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

  #assertCompensation(draft: PixyncOperationDraft): void {
    if (!draft.compensation) return;
    const target = this.#byId.get(draft.compensation.targetOperationId);
    if (!target || target.aggregate !== draft.aggregate) {
      throw new PixyncError(
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
      throw new PixyncError(
        "COMPENSATION_GUARD_STALE",
        "Compensation expectedAggregateRevision is stale.",
        "compensation.expectedAggregateRevision",
      );
    }
    if (
      draft.compensation.writerGuard !== undefined &&
      draft.compensation.writerGuard !== writerGuard(target)
    ) {
      throw new PixyncError(
        "COMPENSATION_GUARD_STALE",
        "Compensation writer guard is stale.",
        "compensation.writerGuard",
      );
    }
  }
}

export type PixyncReceiveOutcome = "applied" | "duplicate" | "gap-held";

export interface PixyncOrderKeeperAppliedOperation {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly projectRevision: number;
  readonly aggregate: PixyncAggregate;
  readonly aggregateRevision: number;
}

export interface PixyncOrderKeeperInitialState {
  readonly projectId: string;
  readonly projectRevision: number;
  readonly aggregateRevisions: Readonly<Record<PixyncAggregate, number>>;
  readonly appliedOperations: readonly PixyncOrderKeeperAppliedOperation[];
}

export class PixyncOrderKeeper {
  readonly #projectId: string;
  readonly #adapters: Map<PixyncAggregate, PixyncAggregateAdapter>;
  readonly #pending = new Map<number, PixyncCommittedOperation>();
  readonly #applied = new Map<string, string>();
  #projectRevision = 0;
  #aggregateRevisions = emptyRevisions();

  constructor(
    options: {
      readonly projectId: string;
      readonly adapters: readonly PixyncAggregateAdapter[];
      readonly initialState?: PixyncOrderKeeperInitialState;
    },
  ) {
    this.#projectId = options.projectId;
    this.#adapters = adapterMap(options.adapters);
    const initialState = options.initialState;
    if (initialState !== undefined) {
      if (initialState.projectId !== options.projectId) {
        throw new PixyncError(
          "PROJECT_MISMATCH",
          "OrderKeeper initial state belongs to another project.",
          "initialState.projectId",
        );
      }
      if (
        !Number.isSafeInteger(initialState.projectRevision) ||
        initialState.projectRevision < 0
      ) {
        throw new PixyncError(
          "INVALID_ENVELOPE",
          "OrderKeeper initial project revision is invalid.",
          "initialState.projectRevision",
        );
      }
      this.#projectRevision = initialState.projectRevision;
      for (const aggregate of AGGREGATES) {
        const revision = initialState.aggregateRevisions[aggregate];
        if (!Number.isSafeInteger(revision) || revision < 0) {
          throw new PixyncError(
            "INVALID_ENVELOPE",
            "OrderKeeper initial aggregate revision is invalid.",
            `initialState.aggregateRevisions.${aggregate}`,
          );
        }
        this.#aggregateRevisions[aggregate] = revision;
      }
      const byRevision = new Set<number>();
      const byId = new Set<string>();
      for (const applied of initialState.appliedOperations) {
        if (
          byId.has(applied.operationId) ||
          byRevision.has(applied.projectRevision) ||
          typeof applied.fingerprint !== "string" ||
          !/^[a-f0-9]{64}$/u.test(applied.fingerprint) ||
          !Number.isSafeInteger(applied.projectRevision) ||
          applied.projectRevision <= 0 ||
          applied.projectRevision > this.#projectRevision ||
          !Number.isSafeInteger(applied.aggregateRevision) ||
          applied.aggregateRevision <= 0
        ) {
          throw new PixyncError(
            "INVALID_ENVELOPE",
            "OrderKeeper initial operation receipt is invalid or duplicated.",
            "initialState.appliedOperations",
          );
        }
        byId.add(applied.operationId);
        byRevision.add(applied.projectRevision);
        this.#applied.set(applied.operationId, applied.fingerprint);
      }
      if (byRevision.size !== this.#projectRevision) {
        throw new PixyncError(
          "SEQUENCER_NOT_CONTIGUOUS",
          "OrderKeeper initial receipts do not form a complete revision prefix.",
          "initialState.appliedOperations",
        );
      }
    }
  }

  snapshot(): PixyncProjectSnapshot {
    return {
      projectId: this.#projectId,
      projectRevision: this.#projectRevision,
      aggregateRevisions: { ...this.#aggregateRevisions },
      operationIds: [...this.#applied.keys()],
    };
  }

  async receive(
    operation: PixyncCommittedOperation,
  ): Promise<PixyncReceiveOutcome> {
    await validatePixyncCommitted(operation);
    if (operation.projectId !== this.#projectId) {
      throw new PixyncError(
        "PROJECT_MISMATCH",
        "Operation belongs to another project.",
        "projectId",
      );
    }
    const fingerprint = await committedOperationFingerprint(operation);
    const appliedFingerprint = this.#applied.get(operation.operationId);
    if (appliedFingerprint) {
      if (appliedFingerprint !== fingerprint) {
        throw new PixyncError(
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
        throw new PixyncError(
          "IDEMPOTENCY_CONFLICT",
          "Held operation revision has a different payload.",
          "projectRevision",
        );
      }
      if (operation.projectRevision === this.#projectRevision + 1) {
        await this.#drain();
        return "applied";
      }
      return "duplicate";
    }
    if (operation.projectRevision <= this.#projectRevision) {
      throw new PixyncError(
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
    operations: readonly PixyncCommittedOperation[],
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
        throw new PixyncError(
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
        throw new PixyncError(
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
  input: Omit<PixyncOperationDraft, "payloadHash" | "schemaVersion">,
): Promise<PixyncOperationDraft> {
  return createPixyncDraft(input);
}

export type { PixyncJsonObject };
