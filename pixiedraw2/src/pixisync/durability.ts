/**
 * PIXISYNC-DRAW2-120 isolated durability reference adapter.
 *
 * This is an explicit restartable snapshot boundary, not a production store.
 * It owns no network, IndexedDB, Supabase, or product composition root.
 */

import {
  committedOperationFingerprint,
  operationFingerprint,
  validatePixisyncCommitted,
  validatePixisyncDraft,
} from "./core.ts";
import { canonicalJson, sha256Hex } from "../wp160-contracts.ts";
import type {
  PixisyncCommittedOperation,
  PixisyncOperationDraft,
} from "./contracts.ts";
import { PixisyncError } from "./contracts.ts";

export const PIXISYNC_DURABLE_SNAPSHOT_SCHEMA =
  "PIXSYNC_DRAW2_DURABLE_SNAPSHOT_V1" as const;

export type PixisyncOutboxState =
  | "PENDING"
  | "LEASED"
  | "DISPATCHED"
  | "DLQ";
export type PixisyncInboxState =
  | "ACCEPTED"
  | "LEASED"
  | "COMPLETED"
  | "RETRYABLE"
  | "DLQ"
  | "CONFLICT";

export interface PixisyncLease {
  readonly owner: string;
  readonly token: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly attempt: number;
}

export interface PixisyncVaultDraft {
  readonly envelope: PixisyncOperationDraft;
  readonly fingerprint: string;
}

export interface PixisyncVaultCommitted {
  readonly envelope: PixisyncCommittedOperation;
  readonly fingerprint: string;
}

export interface PixisyncOutboxRecord {
  readonly operationId: string;
  readonly projectId: string;
  readonly envelope: PixisyncOperationDraft;
  readonly fingerprint: string;
  readonly state: PixisyncOutboxState;
  readonly attempt: number;
  readonly nextAttemptAt: string;
  readonly lease?: PixisyncLease;
  readonly confirmedRevision?: number;
}

export interface PixisyncApplyReceipt {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly projectRevision: number;
}

export interface PixisyncInboxRecord {
  readonly operationId: string;
  readonly projectId: string;
  readonly envelope: PixisyncCommittedOperation;
  readonly fingerprint: string;
  readonly state: PixisyncInboxState;
  readonly attempt: number;
  readonly nextAttemptAt: string;
  readonly lease?: PixisyncLease;
  readonly receipt?: PixisyncApplyReceipt;
}

export interface PixisyncDurableSnapshot {
  readonly schemaVersion: typeof PIXISYNC_DURABLE_SNAPSHOT_SCHEMA;
  readonly projectId: string;
  readonly revision: number;
  readonly confirmedProjectRevision: number;
  readonly snapshotHash: string;
  readonly vault: {
    readonly draft: readonly PixisyncVaultDraft[];
    readonly committed: readonly PixisyncVaultCommitted[];
  };
  readonly outbox: readonly PixisyncOutboxRecord[];
  readonly inbox: readonly PixisyncInboxRecord[];
  readonly appliedOperationFingerprints: readonly PixisyncApplyReceipt[];
  readonly retrySchedule: readonly PixisyncRetrySchedule[];
}

export interface PixisyncRetrySchedule {
  readonly recordId: string;
  readonly kind: "outbox" | "inbox";
  readonly attempt: number;
  readonly nextAttemptAt: string;
}

export interface PixisyncIncomingIdentity {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly projectRevision: number;
}

export interface PixisyncSnapshotPersistencePort {
  load():
    | PixisyncDurableSnapshot
    | undefined
    | Promise<
      PixisyncDurableSnapshot | undefined
    >;
  atomicReplace(
    snapshot: PixisyncDurableSnapshot,
  ): void | Promise<void>;
  compareAndSwap?(
    snapshot: PixisyncDurableSnapshot,
    expectedSnapshotHash: string | null,
  ): void | Promise<void>;
}

export type SnapshotPersistencePort = PixisyncSnapshotPersistencePort;

export interface PixisyncDurabilityCapability {
  readonly processDurable: false;
  readonly productionReady: false;
  readonly indexedDb: "UNTESTED";
  readonly file: "UNTESTED";
}

export const PIXISYNC_DURABILITY_CAPABILITY: PixisyncDurabilityCapability =
  Object.freeze({
    processDurable: false,
    productionReady: false,
    indexedDb: "UNTESTED",
    file: "UNTESTED",
  });

export type PixisyncDurabilityCrashPoint =
  | "BEFORE_COMMIT"
  | "AFTER_STAGE_BEFORE_PERSIST"
  | "AFTER_PERSIST_BEFORE_RESPONSE"
  | "AFTER_APPLY_BEFORE_ACK";

export type PixisyncDurabilityFaultInjector = (
  point: PixisyncDurabilityCrashPoint,
) => void;

export interface PixisyncDurabilityOptions {
  readonly leaseMs?: number;
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
  readonly now?: () => Date;
  readonly faultInjector?: PixisyncDurabilityFaultInjector;
  readonly crashInjector?: PixisyncDurabilityFaultInjector;
}

export class PixisyncDurabilityCrashError extends Error {
  readonly crashPoint: PixisyncDurabilityCrashPoint;

  constructor(point: PixisyncDurabilityCrashPoint) {
    super(`PiXiSYNC durability crash injected at ${point}.`);
    this.name = "PixisyncDurabilityCrashError";
    this.crashPoint = point;
  }
}

export class PixisyncDurabilityError extends Error {
  readonly code:
    | "IDEMPOTENCY_CONFLICT"
    | "PROJECT_MISMATCH"
    | "LEASE_STALE"
    | "INVALID_STATE"
    | "REVISION_CONFLICT"
    | "INBOX_CONFLICT";

  constructor(
    code: PixisyncDurabilityError["code"],
    message: string,
  ) {
    super(message);
    this.name = "PixisyncDurabilityError";
    this.code = code;
  }
}

export interface PixisyncOutboxLeaseResult extends PixisyncOutboxRecord {
  readonly record: PixisyncOutboxRecord;
  readonly lease: PixisyncLease;
}

export interface PixisyncInboxLeaseResult extends PixisyncInboxRecord {
  readonly record: PixisyncInboxRecord;
  readonly lease: PixisyncLease;
}

export interface PixisyncDurabilityMutationResult<T> {
  readonly record: T;
  readonly duplicate?: boolean;
  readonly conflict?: boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nowIso(now: Date): string {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Invalid durability clock.");
  }
  return now.toISOString();
}

function leaseLive(lease: PixisyncLease, now: Date): boolean {
  return Date.parse(lease.expiresAt) > now.getTime();
}

function withoutLease<T extends { readonly lease?: PixisyncLease }>(
  record: T,
): Omit<T, "lease"> {
  const { lease: _lease, ...rest } = record;
  return rest;
}

function emptySnapshot(projectId: string): PixisyncDurableSnapshot {
  return {
    schemaVersion: PIXISYNC_DURABLE_SNAPSHOT_SCHEMA,
    projectId,
    revision: 0,
    confirmedProjectRevision: 0,
    snapshotHash: "",
    vault: { draft: [], committed: [] },
    outbox: [],
    inbox: [],
    appliedOperationFingerprints: [],
    retrySchedule: [],
  };
}

function snapshotBody(snapshot: PixisyncDurableSnapshot): Omit<
  PixisyncDurableSnapshot,
  "snapshotHash"
> {
  const { snapshotHash: _snapshotHash, ...body } = snapshot;
  return body;
}

async function sealSnapshot(
  snapshot: PixisyncDurableSnapshot,
): Promise<PixisyncDurableSnapshot> {
  const body = snapshotBody(snapshot);
  return { ...clone(body), snapshotHash: await sha256Hex(canonicalJson(body)) };
}

function assertBoundedSnapshot(snapshot: PixisyncDurableSnapshot): void {
  const serialized = JSON.stringify(snapshot);
  if (serialized.length > 512 * 1024) {
    throw new Error("PiXiSYNC durable snapshot exceeds its JSON bound.");
  }
  const visit = (value: unknown, depth: number): void => {
    if (depth > 32) throw new Error("PiXiSYNC durable snapshot is too deep.");
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replaceAll("_", "");
      if (
        normalized.includes("rawbytes") || normalized.includes("blob") ||
        normalized.includes("pointer") || normalized.includes("preview")
      ) {
        throw new Error("PiXiSYNC durable snapshot contains a raw field.");
      }
      visit(child, depth + 1);
    }
  };
  visit(snapshot, 0);
}

function sameLease(left: PixisyncLease | undefined, token: string): boolean {
  return left !== undefined && left.token === token;
}

function findByOperationId(
  snapshot: PixisyncDurableSnapshot,
  operationId: string,
): { fingerprint: string; kind: string } | undefined {
  const draft = snapshot.vault.draft.find((item) =>
    item.envelope.operationId === operationId
  );
  if (draft !== undefined) {
    return { fingerprint: draft.fingerprint, kind: "draft" };
  }
  const committed = snapshot.vault.committed.find((item) =>
    item.envelope.operationId === operationId
  );
  if (committed !== undefined) {
    return { fingerprint: committed.fingerprint, kind: "committed" };
  }
  const outbox = snapshot.outbox.find((item) =>
    item.operationId === operationId
  );
  if (outbox !== undefined) {
    return { fingerprint: outbox.fingerprint, kind: "outbox" };
  }
  const inbox = snapshot.inbox.find((item) => item.operationId === operationId);
  if (inbox !== undefined) {
    return { fingerprint: inbox.fingerprint, kind: "inbox" };
  }
  return undefined;
}

function validateLease(lease: PixisyncLease | undefined): void {
  if (lease === undefined) return;
  if (
    typeof lease.owner !== "string" || lease.owner.length === 0 ||
    typeof lease.token !== "string" || lease.token.length === 0 ||
    !validDate(lease.acquiredAt) || !validDate(lease.expiresAt) ||
    !validPositive(lease.attempt)
  ) throw new Error("Invalid PiXiSYNC lease in restart snapshot.");
}

/** Validates envelopes, fingerprints, identities, states, and lease records. */
export async function validatePixisyncDurableSnapshot(
  snapshot: PixisyncDurableSnapshot,
  projectId?: string,
): Promise<void> {
  if (
    snapshot === null || typeof snapshot !== "object" ||
    snapshot.schemaVersion !== PIXISYNC_DURABLE_SNAPSHOT_SCHEMA ||
    typeof snapshot.projectId !== "string" ||
    (projectId !== undefined && snapshot.projectId !== projectId) ||
    !validNonNegative(snapshot.revision) ||
    !validNonNegative(snapshot.confirmedProjectRevision) ||
    snapshot.confirmedProjectRevision !== snapshot.revision ||
    typeof snapshot.snapshotHash !== "string" ||
    !Array.isArray(snapshot.vault?.draft) ||
    !Array.isArray(snapshot.vault?.committed) ||
    !Array.isArray(snapshot.outbox) || !Array.isArray(snapshot.inbox) ||
    !Array.isArray(snapshot.appliedOperationFingerprints) ||
    !Array.isArray(snapshot.retrySchedule)
  ) throw new Error("PiXiSYNC durable snapshot is malformed.");
  assertBoundedSnapshot(snapshot);
  const expectedSnapshotHash = await sha256Hex(
    canonicalJson(snapshotBody(snapshot)),
  );
  if (snapshot.snapshotHash !== expectedSnapshotHash) {
    throw new Error("PiXiSYNC durable snapshot hash mismatch.");
  }

  const operationIds = new Set<string>();
  for (const item of snapshot.vault.draft) {
    await validatePixisyncDraft(item.envelope);
    if (item.envelope.projectId !== snapshot.projectId) {
      throw new Error("PiXiSYNC draft project mismatch.");
    }
    if (await operationFingerprint(item.envelope) !== item.fingerprint) {
      throw new Error("PiXiSYNC draft fingerprint mismatch.");
    }
    operationIds.add(item.envelope.operationId);
  }
  for (const item of snapshot.vault.committed) {
    await validatePixisyncCommitted(item.envelope);
    if (item.envelope.projectId !== snapshot.projectId) {
      throw new Error("PiXiSYNC committed project mismatch.");
    }
    if (
      await committedOperationFingerprint(item.envelope) !== item.fingerprint
    ) {
      throw new Error("PiXiSYNC committed fingerprint mismatch.");
    }
    operationIds.add(item.envelope.operationId);
  }
  for (const item of snapshot.outbox) {
    await validatePixisyncDraft(item.envelope);
    if (
      item.operationId !== item.envelope.operationId ||
      item.projectId !== snapshot.projectId ||
      await operationFingerprint(item.envelope) !== item.fingerprint ||
      !["PENDING", "LEASED", "DISPATCHED", "DLQ"].includes(item.state) ||
      !validNonNegative(item.attempt) || !validDate(item.nextAttemptAt)
    ) throw new Error("PiXiSYNC Outbox restart record is malformed.");
    validateLease(item.lease);
    if (
      item.confirmedRevision !== undefined &&
      !validPositive(item.confirmedRevision)
    ) {
      throw new Error("PiXiSYNC Outbox confirmed revision is malformed.");
    }
    operationIds.add(item.operationId);
  }
  const revisions = new Map<number, string>();
  for (const item of snapshot.inbox) {
    await validatePixisyncCommitted(item.envelope);
    if (
      item.operationId !== item.envelope.operationId ||
      item.projectId !== snapshot.projectId ||
      await committedOperationFingerprint(item.envelope) !== item.fingerprint ||
      !["ACCEPTED", "LEASED", "COMPLETED", "RETRYABLE", "DLQ", "CONFLICT"]
        .includes(item.state) ||
      !validNonNegative(item.attempt) || !validDate(item.nextAttemptAt)
    ) throw new Error("PiXiSYNC Inbox restart record is malformed.");
    validateLease(item.lease);
    if (
      item.receipt !== undefined && (
        item.receipt.operationId !== item.operationId ||
        item.receipt.fingerprint !== item.fingerprint ||
        item.receipt.projectRevision !== item.envelope.projectRevision
      )
    ) throw new Error("PiXiSYNC Inbox apply receipt is malformed.");
    const prior = revisions.get(item.envelope.projectRevision);
    if (
      prior !== undefined && prior !== item.operationId &&
      item.state !== "CONFLICT"
    ) {
      throw new Error("PiXiSYNC snapshot has two identities at one revision.");
    }
    revisions.set(item.envelope.projectRevision, item.operationId);
    operationIds.add(item.operationId);
  }
  for (const item of snapshot.appliedOperationFingerprints) {
    if (
      typeof item.operationId !== "string" ||
      typeof item.fingerprint !== "string" ||
      !validPositive(item.projectRevision)
    ) throw new Error("PiXiSYNC applied operation fingerprint is malformed.");
  }
  for (const item of snapshot.retrySchedule) {
    if (
      typeof item.recordId !== "string" ||
      (item.kind !== "outbox" && item.kind !== "inbox") ||
      !validNonNegative(item.attempt) || !validDate(item.nextAttemptAt)
    ) throw new Error("PiXiSYNC retry schedule is malformed.");
  }
  if (
    snapshot.revision < Math.max(
      0,
      ...snapshot.vault.committed.map((x) => x.envelope.projectRevision),
    )
  ) {
    throw new Error("PiXiSYNC snapshot revision regressed.");
  }
}

/** Restartable in-memory persistence used by isolated tests only. */
export class PixisyncInMemorySnapshotPersistence
  implements PixisyncSnapshotPersistencePort {
  #snapshot: PixisyncDurableSnapshot | undefined;

  constructor(snapshot?: PixisyncDurableSnapshot) {
    this.#snapshot = snapshot === undefined ? undefined : clone(snapshot);
  }

  load(): PixisyncDurableSnapshot | undefined {
    return this.#snapshot === undefined ? undefined : clone(this.#snapshot);
  }

  atomicReplace(snapshot: PixisyncDurableSnapshot): void {
    this.#snapshot = clone(snapshot);
  }

  snapshot(): PixisyncDurableSnapshot | undefined {
    return this.load();
  }
}

export class PixisyncDurableJournal {
  readonly capability = PIXISYNC_DURABILITY_CAPABILITY;
  readonly #projectId: string;
  readonly #persistence: PixisyncSnapshotPersistencePort;
  readonly #leaseMs: number;
  readonly #maxAttempts: number;
  readonly #retryDelayMs: number;
  readonly #now: () => Date;
  readonly #faultInjectors: readonly PixisyncDurabilityFaultInjector[];
  #state: PixisyncDurableSnapshot;

  private constructor(
    projectId: string,
    persistence: PixisyncSnapshotPersistencePort,
    options: PixisyncDurabilityOptions,
    state: PixisyncDurableSnapshot,
  ) {
    this.#projectId = projectId;
    this.#persistence = persistence;
    this.#leaseMs = options.leaseMs ?? 30_000;
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#retryDelayMs = options.retryDelayMs ?? 100;
    this.#now = options.now ?? (() => new Date());
    this.#faultInjectors = [options.faultInjector, options.crashInjector]
      .filter(
        (item): item is PixisyncDurabilityFaultInjector => item !== undefined,
      );
    this.#state = clone(state);
  }

  static async open(
    projectId: string,
    persistence: PixisyncSnapshotPersistencePort,
    options: PixisyncDurabilityOptions = {},
  ): Promise<PixisyncDurableJournal> {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("PiXiSYNC journal projectId is required.");
    }
    if (
      options.leaseMs !== undefined &&
        (!validPositive(options.leaseMs) || options.leaseMs < 1) ||
      options.maxAttempts !== undefined &&
        (!validPositive(options.maxAttempts)) ||
      options.retryDelayMs !== undefined &&
        (!validNonNegative(options.retryDelayMs))
    ) throw new Error("PiXiSYNC durability options are invalid.");
    const loaded = await persistence.load();
    let state = loaded === undefined
      ? await sealSnapshot(emptySnapshot(projectId))
      : clone(loaded);
    await validatePixisyncDurableSnapshot(state, projectId);
    if (loaded === undefined) {
      try {
        if (persistence.compareAndSwap !== undefined) {
          await persistence.compareAndSwap(clone(state), null);
        } else {
          await persistence.atomicReplace(clone(state));
        }
      } catch (error) {
        if (
          persistence.compareAndSwap === undefined ||
          (error as { readonly code?: unknown })?.code !== "SNAPSHOT_CONFLICT"
        ) throw error;
        const concurrent = await persistence.load();
        if (concurrent === undefined) throw error;
        await validatePixisyncDurableSnapshot(concurrent, projectId);
        state = clone(concurrent);
      }
    }
    const journal = new PixisyncDurableJournal(
      projectId,
      persistence,
      options,
      state,
    );
    return journal;
  }

  snapshot(): PixisyncDurableSnapshot {
    return clone(this.#state);
  }

  async enqueue(
    draft: PixisyncOperationDraft,
  ): Promise<PixisyncDurabilityMutationResult<PixisyncOutboxRecord>> {
    await validatePixisyncDraft(draft);
    if (draft.projectId !== this.#projectId) {
      throw new PixisyncError(
        "PROJECT_MISMATCH",
        "Draft belongs to another project.",
      );
    }
    const fingerprint = await operationFingerprint(draft);
    const existing = findByOperationId(this.#state, draft.operationId);
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        throw new PixisyncDurabilityError(
          "IDEMPOTENCY_CONFLICT",
          "Operation ID is bound to a different fingerprint.",
        );
      }
      const record = this.#state.outbox.find((item) =>
        item.operationId === draft.operationId
      );
      if (record !== undefined) {
        return { record: clone(record), duplicate: true };
      }
      const committed = this.#state.vault.committed.find((item) =>
        item.envelope.operationId === draft.operationId
      );
      if (committed !== undefined) {
        const dispatched: PixisyncOutboxRecord = {
          operationId: draft.operationId,
          projectId: this.#projectId,
          envelope: clone(draft),
          fingerprint,
          state: "DISPATCHED",
          attempt: 0,
          nextAttemptAt: nowIso(this.#now()),
          confirmedRevision: committed.envelope.projectRevision,
        };
        return { record: dispatched, duplicate: true };
      }
    }
    const now = nowIso(this.#now());
    const record: PixisyncOutboxRecord = {
      operationId: draft.operationId,
      projectId: this.#projectId,
      envelope: clone(draft),
      fingerprint,
      state: "PENDING",
      attempt: 0,
      nextAttemptAt: now,
    };
    const next: PixisyncDurableSnapshot = {
      ...this.#state,
      vault: {
        draft: [...this.#state.vault.draft, {
          envelope: clone(draft),
          fingerprint,
        }],
        committed: [...this.#state.vault.committed],
      },
      outbox: [...this.#state.outbox, record],
    };
    await this.#commit(next);
    return { record: clone(record), duplicate: false };
  }

  async leaseOutbox(
    workerId: string,
    now: Date = this.#now(),
  ): Promise<PixisyncOutboxLeaseResult | undefined> {
    if (workerId.length === 0 || !Number.isFinite(now.getTime())) {
      throw new Error("Invalid Outbox lease request.");
    }
    let next = clone(this.#state);
    let changed = false;
    const reclaimed = next.outbox.map((record) => {
      if (
        record.state === "LEASED" && record.lease !== undefined &&
        !leaseLive(record.lease, now)
      ) {
        changed = true;
        if (record.attempt >= this.#maxAttempts) {
          return { ...withoutLease(record), state: "DLQ" as const };
        }
        return {
          ...withoutLease(record),
          state: "PENDING" as const,
          nextAttemptAt: nowIso(now),
        };
      }
      return record;
    });
    next = { ...next, outbox: reclaimed };
    const candidate = [...reclaimed]
      .filter((record) =>
        record.state === "PENDING" &&
        Date.parse(record.nextAttemptAt) <= now.getTime()
      )
      .sort((left, right) =>
        left.nextAttemptAt.localeCompare(right.nextAttemptAt)
      )[0];
    if (candidate === undefined) {
      if (changed) await this.#commit(next);
      return undefined;
    }
    if (candidate.attempt >= this.#maxAttempts) {
      const dlq = { ...withoutLease(candidate), state: "DLQ" as const };
      next = {
        ...next,
        outbox: next.outbox.map((item) =>
          item.operationId === candidate.operationId ? dlq : item
        ),
      };
      await this.#commit(next);
      return undefined;
    }
    const attempt = candidate.attempt + 1;
    const lease: PixisyncLease = {
      owner: workerId,
      token: `outbox:${candidate.operationId}:${attempt}`,
      acquiredAt: nowIso(now),
      expiresAt: new Date(now.getTime() + this.#leaseMs).toISOString(),
      attempt,
    };
    const updated: PixisyncOutboxRecord = {
      ...candidate,
      state: "LEASED",
      attempt,
      lease,
    };
    next = {
      ...next,
      outbox: next.outbox.map((item) =>
        item.operationId === candidate.operationId ? updated : item
      ),
    };
    await this.#commit(next);
    return { ...clone(updated), record: clone(updated), lease: clone(lease) };
  }

  async acknowledgeOutbox(
    operationId: string,
    fencingToken: string,
    confirmedRevision: number,
  ): Promise<PixisyncDurabilityMutationResult<PixisyncOutboxRecord>> {
    if (!validPositive(confirmedRevision)) {
      throw new Error("Confirmed project revision must be positive.");
    }
    const record = this.#state.outbox.find((item) =>
      item.operationId === operationId
    );
    if (record === undefined) throw new Error("Outbox record was not found.");
    if (record.state === "DISPATCHED") {
      if (
        record.lease?.token === fencingToken &&
        record.confirmedRevision === confirmedRevision
      ) {
        return { record: clone(record), duplicate: true };
      }
      throw new PixisyncDurabilityError("LEASE_STALE", "ACK token is stale.");
    }
    if (
      record.state !== "LEASED" || !sameLease(record.lease, fencingToken) ||
      !leaseLive(record.lease!, this.#now())
    ) {
      throw new PixisyncDurabilityError(
        "LEASE_STALE",
        "Only the current live Outbox lease may acknowledge.",
      );
    }
    const committed: PixisyncCommittedOperation = {
      ...clone(record.envelope),
      projectRevision: confirmedRevision,
      committedAt: nowIso(this.#now()),
    };
    await validatePixisyncCommitted(committed);
    const committedFingerprint = await committedOperationFingerprint(committed);
    const existingRevision = this.#state.vault.committed.find((item) =>
      item.envelope.projectRevision === confirmedRevision
    );
    const existingInboxRevision = this.#state.inbox.find((item) =>
      item.envelope.projectRevision === confirmedRevision &&
      item.operationId !== operationId
    );
    if (
      (existingRevision !== undefined &&
        existingRevision.envelope.operationId !== operationId) ||
      existingInboxRevision !== undefined
    ) {
      throw new PixisyncDurabilityError(
        "REVISION_CONFLICT",
        "Confirmed revision is bound to another operation.",
      );
    }
    const nextRecord: PixisyncOutboxRecord = {
      ...record,
      state: "DISPATCHED",
      confirmedRevision,
    };
    const next: PixisyncDurableSnapshot = {
      ...this.#state,
      revision: Math.max(this.#state.revision, confirmedRevision),
      vault: {
        draft: this.#state.vault.draft.filter((item) =>
          item.envelope.operationId !== operationId
        ),
        committed: existingRevision === undefined
          ? [...this.#state.vault.committed, {
            envelope: committed,
            fingerprint: committedFingerprint,
          }]
          : [...this.#state.vault.committed],
      },
      outbox: this.#state.outbox.map((item) =>
        item.operationId === operationId ? nextRecord : item
      ),
    };
    await this.#commit(next);
    return { record: clone(nextRecord), duplicate: false };
  }

  async failOutbox(
    operationId: string,
    fencingToken: string,
    retryable: boolean,
  ): Promise<PixisyncDurabilityMutationResult<PixisyncOutboxRecord>> {
    const record = this.#state.outbox.find((item) =>
      item.operationId === operationId
    );
    if (record === undefined) throw new Error("Outbox record was not found.");
    if (
      record.state !== "LEASED" || !sameLease(record.lease, fencingToken) ||
      !leaseLive(record.lease!, this.#now())
    ) {
      throw new PixisyncDurabilityError(
        "LEASE_STALE",
        "Stale Outbox lease cannot fail.",
      );
    }
    const terminal = !retryable || record.attempt >= this.#maxAttempts;
    const nextRecord: PixisyncOutboxRecord = terminal
      ? { ...withoutLease(record), state: "DLQ" }
      : {
        ...withoutLease(record),
        state: "PENDING",
        nextAttemptAt: new Date(
          this.#now().getTime() +
            this.#retryDelayMs * 2 ** Math.min(record.attempt, 8),
        ).toISOString(),
      };
    const next = {
      ...this.#state,
      outbox: this.#state.outbox.map((item) =>
        item.operationId === operationId ? nextRecord : item
      ),
    };
    await this.#commit(next);
    return { record: clone(nextRecord), duplicate: false };
  }

  async pruneConfirmed(): Promise<number> {
    const removable = this.#state.outbox.filter((record) =>
      record.state === "DISPATCHED" &&
      record.confirmedRevision !== undefined &&
      record.confirmedRevision <= this.#state.confirmedProjectRevision
    );
    if (removable.length === 0) return 0;
    const operationIds = new Set(removable.map((record) => record.operationId));
    await this.#commit({
      ...this.#state,
      outbox: this.#state.outbox.filter((record) =>
        !operationIds.has(record.operationId)
      ),
    });
    return removable.length;
  }

  async acceptIncoming(
    committed: PixisyncCommittedOperation,
    identity?: PixisyncIncomingIdentity,
  ): Promise<PixisyncDurabilityMutationResult<PixisyncInboxRecord>> {
    await validatePixisyncCommitted(committed);
    if (committed.projectId !== this.#projectId) {
      throw new PixisyncError(
        "PROJECT_MISMATCH",
        "Incoming operation belongs to another project.",
      );
    }
    const fingerprint = await committedOperationFingerprint(committed);
    if (
      identity !== undefined &&
      (identity.operationId !== committed.operationId ||
        identity.fingerprint !== fingerprint ||
        identity.projectRevision !== committed.projectRevision)
    ) {
      throw new PixisyncDurabilityError(
        "INBOX_CONFLICT",
        "Incoming provider identity is not bound to the committed operation.",
      );
    }
    const existing = this.#state.inbox.find((item) =>
      item.operationId === committed.operationId
    );
    if (existing !== undefined) {
      if (existing.fingerprint === fingerprint) {
        return { record: clone(existing), duplicate: true };
      }
      const conflict = {
        ...withoutLease(existing),
        state: "CONFLICT" as const,
      };
      const next = {
        ...this.#state,
        inbox: this.#state.inbox.map((item) =>
          item.operationId === committed.operationId ? conflict : item
        ),
      };
      await this.#commit(next);
      return { record: clone(conflict), conflict: true };
    }
    const sameRevision =
      this.#state.inbox.find((item) =>
        item.envelope.projectRevision === committed.projectRevision &&
        item.operationId !== committed.operationId
      ) ??
        this.#state.vault.committed.find((item) =>
          item.envelope.projectRevision === committed.projectRevision &&
          item.envelope.operationId !== committed.operationId
        );
    const record: PixisyncInboxRecord = {
      operationId: committed.operationId,
      projectId: this.#projectId,
      envelope: clone(committed),
      fingerprint,
      state: sameRevision === undefined ? "ACCEPTED" : "CONFLICT",
      attempt: 0,
      nextAttemptAt: nowIso(this.#now()),
    };
    const next: PixisyncDurableSnapshot = {
      ...this.#state,
      // Inbox acceptance is durable receipt of delivery, not canonical apply.
      revision: this.#state.revision,
      vault: {
        draft: [...this.#state.vault.draft],
        committed: [...this.#state.vault.committed],
      },
      inbox: [...this.#state.inbox, record],
    };
    await this.#commit(next);
    return {
      record: clone(record),
      conflict: sameRevision !== undefined,
      duplicate: false,
    };
  }

  async leaseInbox(
    workerId: string,
    now: Date = this.#now(),
  ): Promise<PixisyncInboxLeaseResult | undefined> {
    if (workerId.length === 0 || !Number.isFinite(now.getTime())) {
      throw new Error("Invalid Inbox lease request.");
    }
    let next = clone(this.#state);
    let changed = false;
    const reclaimed = next.inbox.map((record) => {
      if (
        record.state === "LEASED" && record.lease !== undefined &&
        !leaseLive(record.lease, now)
      ) {
        changed = true;
        if (record.attempt >= this.#maxAttempts) {
          return { ...withoutLease(record), state: "DLQ" as const };
        }
        return {
          ...withoutLease(record),
          state: "RETRYABLE" as const,
          nextAttemptAt: nowIso(now),
        };
      }
      return record;
    });
    next = { ...next, inbox: reclaimed };
    const candidate = [...reclaimed]
      .filter((record) =>
        (record.state === "ACCEPTED" || record.state === "RETRYABLE") &&
        Date.parse(record.nextAttemptAt) <= now.getTime()
      )
      .sort((left, right) =>
        left.envelope.projectRevision - right.envelope.projectRevision
      )[0];
    if (candidate === undefined) {
      if (changed) await this.#commit(next);
      return undefined;
    }
    if (candidate.attempt >= this.#maxAttempts) {
      const dlq = { ...withoutLease(candidate), state: "DLQ" as const };
      await this.#commit({
        ...next,
        inbox: next.inbox.map((item) =>
          item.operationId === candidate.operationId ? dlq : item
        ),
      });
      return undefined;
    }
    const attempt = candidate.attempt + 1;
    const lease: PixisyncLease = {
      owner: workerId,
      token: `inbox:${candidate.operationId}:${attempt}`,
      acquiredAt: nowIso(now),
      expiresAt: new Date(now.getTime() + this.#leaseMs).toISOString(),
      attempt,
    };
    const updated: PixisyncInboxRecord = {
      ...candidate,
      state: "LEASED",
      attempt,
      lease,
    };
    next = {
      ...next,
      inbox: next.inbox.map((item) =>
        item.operationId === candidate.operationId ? updated : item
      ),
    };
    await this.#commit(next);
    return { ...clone(updated), record: clone(updated), lease: clone(lease) };
  }

  async applyInbox(
    operationId: string,
    fencingToken: string,
    orderKeeper: {
      receive(operation: PixisyncCommittedOperation): Promise<string>;
    },
  ): Promise<string> {
    const record = this.#state.inbox.find((item) =>
      item.operationId === operationId
    );
    if (record === undefined) throw new Error("Inbox record was not found.");
    if (
      record.state !== "LEASED" || !sameLease(record.lease, fencingToken) ||
      !leaseLive(record.lease!, this.#now())
    ) {
      throw new PixisyncDurabilityError(
        "LEASE_STALE",
        "Only the current live Inbox lease may apply.",
      );
    }
    if (record.receipt !== undefined) {
      const completed = {
        ...withoutLease(record),
        state: "COMPLETED" as const,
      };
      await this.#commit({
        ...this.#state,
        inbox: this.#state.inbox.map((item) =>
          item.operationId === operationId ? completed : item
        ),
      });
      return "recovered";
    }
    let outcome: string;
    try {
      outcome = await orderKeeper.receive(record.envelope);
    } catch (error) {
      const terminal = record.attempt >= this.#maxAttempts;
      const failed = terminal
        ? { ...withoutLease(record), state: "DLQ" as const }
        : {
          ...withoutLease(record),
          state: "RETRYABLE" as const,
          nextAttemptAt: new Date(
            this.#now().getTime() +
              this.#retryDelayMs * 2 ** Math.min(record.attempt, 8),
          ).toISOString(),
        };
      await this.#commit({
        ...this.#state,
        inbox: this.#state.inbox.map((item) =>
          item.operationId === operationId ? failed : item
        ),
      });
      throw error;
    }
    if (outcome === "gap-held") {
      const held = {
        ...withoutLease(record),
        state: "RETRYABLE" as const,
        nextAttemptAt: nowIso(this.#now()),
      };
      await this.#commit({
        ...this.#state,
        inbox: this.#state.inbox.map((item) =>
          item.operationId === operationId ? held : item
        ),
      });
      return outcome;
    }
    const receipt: PixisyncApplyReceipt = {
      operationId,
      fingerprint: record.fingerprint,
      projectRevision: record.envelope.projectRevision,
    };
    const withReceipt: PixisyncInboxRecord = { ...record, receipt };
    // Receipt persistence is the restart recovery boundary after an adapter
    // has applied but before the final Inbox acknowledgement is published.
    await this.#commit({
      ...withReceiptState(this.#state, withReceipt),
      revision: Math.max(this.#state.revision, record.envelope.projectRevision),
    }, false);
    this.#inject("AFTER_APPLY_BEFORE_ACK");
    const completed = {
      ...withoutLease(withReceipt),
      state: "COMPLETED" as const,
    };
    await this.#commit({
      ...this.#state,
      inbox: this.#state.inbox.map((item) =>
        item.operationId === operationId ? completed : item
      ),
    });
    return outcome;
  }

  #inject(point: PixisyncDurabilityCrashPoint): void {
    for (const injector of this.#faultInjectors) injector(point);
  }

  async #commit(
    next: PixisyncDurableSnapshot,
    injectResponseCrash = true,
  ): Promise<void> {
    const staged = await sealSnapshot({
      ...clone(next),
      confirmedProjectRevision: next.revision,
      appliedOperationFingerprints: next.inbox.flatMap((record) =>
        record.receipt === undefined ? [] : [clone(record.receipt)]
      ),
      retrySchedule: [
        ...next.outbox.filter((record) => record.state === "PENDING").map((
          record,
        ) => ({
          recordId: record.operationId,
          kind: "outbox" as const,
          attempt: record.attempt,
          nextAttemptAt: record.nextAttemptAt,
        })),
        ...next.inbox.filter((record) => record.state === "RETRYABLE").map((
          record,
        ) => ({
          recordId: record.operationId,
          kind: "inbox" as const,
          attempt: record.attempt,
          nextAttemptAt: record.nextAttemptAt,
        })),
      ],
    });
    await validatePixisyncDurableSnapshot(staged, this.#projectId);
    this.#inject("BEFORE_COMMIT");
    this.#inject("AFTER_STAGE_BEFORE_PERSIST");
    if (this.#persistence.compareAndSwap !== undefined) {
      await this.#persistence.compareAndSwap(
        clone(staged),
        this.#state.snapshotHash,
      );
    } else {
      await this.#persistence.atomicReplace(clone(staged));
    }
    if (injectResponseCrash) this.#inject("AFTER_PERSIST_BEFORE_RESPONSE");
    // A response crash leaves this process on the old view; a restarted
    // journal loads the atomically replaced snapshot above.
    this.#state = clone(staged);
  }
}

function withReceiptState(
  snapshot: PixisyncDurableSnapshot,
  record: PixisyncInboxRecord,
): PixisyncDurableSnapshot {
  return {
    ...snapshot,
    inbox: snapshot.inbox.map((item) =>
      item.operationId === record.operationId ? record : item
    ),
  };
}
