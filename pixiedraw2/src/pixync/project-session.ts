/**
 * Local-only Project Session boundary for Draw2 PiXYNC.
 *
 * A session binds the three canonical aggregates, while activeMode remains a
 * client-local projection. Durable operations use the existing sequencer and
 * order keeper. Presence is a separate, ephemeral channel and never enters
 * the operation log or a canonical snapshot.
 */

import { canonicalJson } from "../wp160-contracts.ts";
import { validatePixyncCommitted, validatePixyncDraft } from "./core.ts";
import {
  PixyncInMemorySequencer,
  PixyncInMemoryTransport,
  PixyncOrderKeeper,
  type PixyncReceiveOutcome,
} from "./in-memory.ts";
import {
  type PixyncAggregate,
  type PixyncAggregateAdapter,
  type PixyncCommittedOperation,
  PixyncError,
  type PixyncOperationDraft,
  type PixyncOperationResult,
  type PixyncProjectSnapshot,
} from "./contracts.ts";

const AGGREGATES: readonly PixyncAggregate[] = ["draw", "audio", "game"];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const MAX_META_TEXT = 160;
const MAX_OPERATION_BYTES = 32_768;
const DEFAULT_PRESENCE_TTL_MS = 30_000;

export type ProjectSessionMode = "iDRAW" | "iAUDIO" | "iGAME";

export type ProjectSessionRole = "owner" | "editor" | "viewer";

export type ProjectSessionCheckpointKind = "MANUAL" | "AUTOSAVE";

export type ProjectSessionStatus =
  | "LOCAL_OPTIMISTIC"
  | "PENDING"
  | "CONFIRMED"
  | "OFFLINE"
  | "RECOVERING"
  | "CONFLICT"
  | "ERROR";

export interface ProjectPresenceInput {
  readonly actorId: string;
  readonly clientId: string;
  readonly displayName: string;
  readonly mode: ProjectSessionMode;
  readonly selectionLabel: string;
}

export interface ProjectPresence extends ProjectPresenceInput {
  readonly updatedAt: string;
}

export interface ProjectSessionCheckpointInput {
  readonly checkpointId: string;
  readonly label: string;
  readonly kind: ProjectSessionCheckpointKind;
}

export interface ProjectSessionCheckpoint {
  readonly checkpointId: string;
  readonly projectId: string;
  readonly label: string;
  readonly kind: ProjectSessionCheckpointKind;
  readonly createdByActorId: string;
  readonly createdByClientId: string;
  readonly createdAt: string;
  readonly projectRevision: number;
  readonly aggregateRevisions: Readonly<Record<PixyncAggregate, number>>;
  readonly operationCount: number;
}

export type ProjectPresenceEvent =
  | { readonly kind: "upsert"; readonly presence: ProjectPresence }
  | {
    readonly kind: "remove";
    readonly clientId: string;
    readonly reason: "disconnect" | "expired";
  };

export type ProjectSessionCheckpointEvent = {
  readonly kind: "upsert";
  readonly checkpoint: ProjectSessionCheckpoint;
};

export interface ProjectSessionState {
  readonly projectId: string;
  readonly activeMode: ProjectSessionMode;
  readonly role: ProjectSessionRole;
  readonly status: ProjectSessionStatus;
  readonly projectRevision: number;
  readonly aggregateRevisions: Readonly<Record<PixyncAggregate, number>>;
  readonly pendingOperationIds: readonly string[];
  readonly presence: readonly ProjectPresence[];
  readonly checkpoints: readonly ProjectSessionCheckpoint[];
  readonly lastError:
    | { readonly code: string; readonly message: string }
    | undefined;
}

export interface ProjectSessionConnectInput {
  readonly projectId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly role?: ProjectSessionRole;
  readonly onOperation: (
    operation: PixyncCommittedOperation,
  ) => void | Promise<void>;
  readonly onPresence: (event: ProjectPresenceEvent) => void | Promise<void>;
  readonly onCheckpoint: (
    event: ProjectSessionCheckpointEvent,
  ) => void | Promise<void>;
}

export interface ProjectSessionBrokerConnection {
  readonly role: ProjectSessionRole;
  readonly initialPresence: readonly ProjectPresence[];
  readonly initialCheckpoints: readonly ProjectSessionCheckpoint[];
  submit(draft: PixyncOperationDraft): Promise<PixyncOperationResult>;
  fetchSince(
    projectRevision: number,
  ): Promise<readonly PixyncCommittedOperation[]>;
  latestProjectRevision(): number;
  publishPresence(input: ProjectPresenceInput): Promise<ProjectPresence>;
  createCheckpoint(
    input: ProjectSessionCheckpointInput,
  ): Promise<ProjectSessionCheckpoint>;
  listCheckpoints(): Promise<readonly ProjectSessionCheckpoint[]>;
  close(reason?: "disconnect"): Promise<void>;
}

export interface ProjectSessionBroker {
  connect(
    input: ProjectSessionConnectInput,
  ): Promise<ProjectSessionBrokerConnection>;
}

export interface ProjectSessionClientOptions {
  readonly broker: ProjectSessionBroker;
  readonly projectId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly displayName: string;
  readonly role?: ProjectSessionRole;
  readonly activeMode?: ProjectSessionMode;
  readonly adapters: readonly PixyncAggregateAdapter[];
}

export interface ProjectSessionClientConnectOptions {
  /** Local fixture seam for delivering a deliberately reordered tail. */
  readonly catchUp?: boolean;
}

function emptyRevisions(): Record<PixyncAggregate, number> {
  return { draw: 0, audio: 0, game: 0 };
}

function assertSafeId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new PixyncError(
      "INVALID_ENVELOPE",
      "A bounded stable identifier is required.",
      path,
    );
  }
}

function assertBoundedText(
  value: unknown,
  path: string,
  allowEmpty = false,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > MAX_META_TEXT ||
    (!allowEmpty && value.trim().length === 0)
  ) {
    throw new PixyncError(
      "INVALID_ENVELOPE",
      "Presence metadata must be short text.",
      path,
    );
  }
}

function assertMode(
  value: unknown,
  path: string,
): asserts value is ProjectSessionMode {
  if (value !== "iDRAW" && value !== "iAUDIO" && value !== "iGAME") {
    throw new PixyncError("INVALID_ENVELOPE", "Unknown session mode.", path);
  }
}

function assertRole(
  value: unknown,
  path: string,
): asserts value is ProjectSessionRole {
  if (value !== "owner" && value !== "editor" && value !== "viewer") {
    throw new PixyncError("INVALID_ENVELOPE", "Unknown session role.", path);
  }
}

function assertCheckpointKind(
  value: unknown,
  path: string,
): asserts value is ProjectSessionCheckpointKind {
  if (value !== "MANUAL" && value !== "AUTOSAVE") {
    throw new PixyncError(
      "INVALID_ENVELOPE",
      "Unknown checkpoint kind.",
      path,
    );
  }
}

function validateCheckpointInput(input: ProjectSessionCheckpointInput): void {
  if (input === null || typeof input !== "object") {
    throw new PixyncError(
      "INVALID_ENVELOPE",
      "Checkpoint must be a bounded metadata object.",
      "checkpoint",
    );
  }
  const value = input as unknown as Record<string, unknown>;
  assertExactKeys(
    value,
    ["checkpointId", "label", "kind"],
    "checkpoint",
  );
  assertSafeId(value.checkpointId, "checkpoint.checkpointId");
  assertBoundedText(value.label, "checkpoint.label");
  assertCheckpointKind(value.kind, "checkpoint.kind");
}

function validateCheckpoint(value: ProjectSessionCheckpoint): void {
  const record = value as unknown as Record<string, unknown>;
  assertExactKeys(
    record,
    [
      "checkpointId",
      "projectId",
      "label",
      "kind",
      "createdByActorId",
      "createdByClientId",
      "createdAt",
      "projectRevision",
      "aggregateRevisions",
      "operationCount",
    ],
    "checkpoint",
  );
  assertSafeId(record.checkpointId, "checkpoint.checkpointId");
  assertSafeId(record.projectId, "checkpoint.projectId");
  assertBoundedText(record.label, "checkpoint.label");
  assertCheckpointKind(record.kind, "checkpoint.kind");
  assertSafeId(record.createdByActorId, "checkpoint.createdByActorId");
  assertSafeId(record.createdByClientId, "checkpoint.createdByClientId");
  if (
    typeof record.createdAt !== "string" ||
    !Number.isFinite(Date.parse(record.createdAt))
  ) {
    throw new PixyncError(
      "INVALID_ENVELOPE",
      "Checkpoint createdAt must be an ISO timestamp.",
      "checkpoint.createdAt",
    );
  }
  if (
    !Number.isSafeInteger(record.projectRevision) ||
    (record.projectRevision as number) < 0 ||
    !Number.isSafeInteger(record.operationCount) ||
    (record.operationCount as number) < 0
  ) {
    throw new PixyncError(
      "INVALID_ENVELOPE",
      "Checkpoint revisions must be non-negative safe integers.",
      "checkpoint.projectRevision",
    );
  }
  const revisions = record.aggregateRevisions;
  if (revisions === null || typeof revisions !== "object") {
    throw new PixyncError(
      "INVALID_ENVELOPE",
      "Checkpoint aggregate revisions are required.",
      "checkpoint.aggregateRevisions",
    );
  }
  assertExactKeys(
    revisions as Record<string, unknown>,
    ["draw", "audio", "game"],
    "checkpoint.aggregateRevisions",
  );
  for (const aggregate of AGGREGATES) {
    const revision = (revisions as Record<string, unknown>)[aggregate];
    if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Checkpoint aggregate revision is invalid.",
        `checkpoint.aggregateRevisions.${aggregate}`,
      );
    }
  }
}

function sortCheckpoints(
  checkpoints: Iterable<ProjectSessionCheckpoint>,
): ProjectSessionCheckpoint[] {
  return [...checkpoints].sort((left, right) =>
    left.projectRevision - right.projectRevision ||
    left.checkpointId.localeCompare(right.checkpointId)
  );
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  const expected = new Set(keys);
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !expected.has(key))
  ) {
    throw new PixyncError(
      "PAYLOAD_FORBIDDEN",
      "Project Session metadata has an unsupported field.",
      path,
    );
  }
}

function validatePresenceInput(input: ProjectPresenceInput): void {
  if (input === null || typeof input !== "object") {
    throw new PixyncError(
      "INVALID_ENVELOPE",
      "Presence must be a bounded metadata object.",
      "presence",
    );
  }
  const value = input as unknown as Record<string, unknown>;
  assertExactKeys(
    value,
    ["actorId", "clientId", "displayName", "mode", "selectionLabel"],
    "presence",
  );
  assertSafeId(value.actorId, "presence.actorId");
  assertSafeId(value.clientId, "presence.clientId");
  assertBoundedText(value.displayName, "presence.displayName");
  assertMode(value.mode, "presence.mode");
  assertBoundedText(value.selectionLabel, "presence.selectionLabel", true);
}

function validatePresence(value: ProjectPresence): void {
  const record = value as unknown as Record<string, unknown>;
  assertExactKeys(
    record,
    [
      "actorId",
      "clientId",
      "displayName",
      "mode",
      "selectionLabel",
      "updatedAt",
    ],
    "presence",
  );
  assertSafeId(record.actorId, "presence.actorId");
  assertSafeId(record.clientId, "presence.clientId");
  assertBoundedText(record.displayName, "presence.displayName");
  assertMode(record.mode, "presence.mode");
  assertBoundedText(record.selectionLabel, "presence.selectionLabel", true);
  if (
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    throw new PixyncError(
      "INVALID_ENVELOPE",
      "Presence updatedAt must be an ISO timestamp.",
      "presence.updatedAt",
    );
  }
}

async function validateBoundedOperation(
  operation: PixyncOperationDraft | PixyncCommittedOperation,
): Promise<void> {
  if ("projectRevision" in operation) await validatePixyncCommitted(operation);
  else await validatePixyncDraft(operation);
  const bytes = new TextEncoder().encode(canonicalJson(operation)).byteLength;
  if (bytes > MAX_OPERATION_BYTES) {
    throw new PixyncError(
      "PAYLOAD_TOO_LARGE",
      "Project Session operation envelope exceeds the bounded limit.",
      "operation",
    );
  }
}

function errorDetails(
  error: unknown,
): { readonly code: string; readonly message: string } {
  if (error instanceof PixyncError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) return { code: "ERROR", message: error.message };
  return { code: "ERROR", message: "Project Session operation failed." };
}

function isConflictCode(code: string): boolean {
  return [
    "IDEMPOTENCY_CONFLICT",
    "PROJECT_MISMATCH",
    "AGGREGATE_REVISION_STALE",
    "SEQUENCER_NOT_CONTIGUOUS",
    "COMPENSATION_GUARD_STALE",
    "GAP_HELD",
  ].includes(code);
}

/** Local deterministic broker. It has no browser, network, or provider dependency. */
export class LocalProjectSessionBroker implements ProjectSessionBroker {
  readonly #projectId: string;
  readonly #sequencer: PixyncInMemorySequencer;
  readonly #transport: PixyncInMemoryTransport;
  readonly #now: () => Date;
  readonly #presenceTtlMs: number;
  readonly #connections = new Map<string, ProjectSessionConnectInput>();
  readonly #presence = new Map<string, ProjectPresence>();
  readonly #checkpoints = new Map<string, ProjectSessionCheckpoint>();
  #commitTail: Promise<void> = Promise.resolve();

  constructor(options: {
    readonly projectId: string;
    readonly adapters: readonly PixyncAggregateAdapter[];
    readonly sequencer?: PixyncInMemorySequencer;
    readonly transport?: PixyncInMemoryTransport;
    readonly now?: () => Date;
    readonly presenceTtlMs?: number;
  }) {
    assertSafeId(options.projectId, "projectId");
    this.#projectId = options.projectId;
    this.#now = options.now ?? (() => new Date("2026-01-01T00:00:00.000Z"));
    this.#presenceTtlMs = options.presenceTtlMs ?? DEFAULT_PRESENCE_TTL_MS;
    if (
      !Number.isSafeInteger(this.#presenceTtlMs) || this.#presenceTtlMs <= 0
    ) {
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Presence TTL must be a positive safe integer.",
        "presenceTtlMs",
      );
    }
    this.#sequencer = options.sequencer ?? new PixyncInMemorySequencer({
      projectId: options.projectId,
      adapters: options.adapters,
      ...(options.transport === undefined
        ? {}
        : { transport: options.transport }),
      now: this.#now,
    });
    this.#transport = this.#sequencer.transport;
    if (this.#sequencer.snapshot().projectId !== this.#projectId) {
      throw new PixyncError(
        "PROJECT_MISMATCH",
        "Sequencer belongs to another project.",
        "sequencer.projectId",
      );
    }
  }

  snapshot(): PixyncProjectSnapshot {
    return this.#sequencer.snapshot();
  }

  async connect(
    input: ProjectSessionConnectInput,
  ): Promise<ProjectSessionBrokerConnection> {
    assertSafeId(input.projectId, "projectId");
    assertSafeId(input.actorId, "actorId");
    assertSafeId(input.clientId, "clientId");
    const role = input.role ?? "editor";
    assertRole(role, "role");
    if (input.projectId !== this.#projectId) {
      throw new PixyncError(
        "PROJECT_MISMATCH",
        "Session belongs to another project.",
        "projectId",
      );
    }
    if (this.#connections.has(input.clientId)) {
      throw new PixyncError(
        "IDEMPOTENCY_CONFLICT",
        "Client is already connected to this Project Session.",
        "clientId",
      );
    }
    const initialPresence = [...this.#presence.values()].sort((left, right) =>
      left.clientId.localeCompare(right.clientId)
    );
    const initialCheckpoints = sortCheckpoints(this.#checkpoints.values());
    this.#connections.set(input.clientId, input);
    let closed = false;
    const unsubscribe = this.#transport.connect(
      input.clientId,
      async (operation) => {
        if (!closed) await input.onOperation(operation);
      },
    );
    const connection: ProjectSessionBrokerConnection = {
      role,
      initialPresence,
      initialCheckpoints,
      submit: (draft) => this.#submit(input, draft),
      fetchSince: async (projectRevision) => {
        if (closed) {
          throw new PixyncError(
            "INVALID_ENVELOPE",
            "Connection is closed.",
            "clientId",
          );
        }
        if (!Number.isSafeInteger(projectRevision) || projectRevision < 0) {
          throw new PixyncError(
            "INVALID_ENVELOPE",
            "Revision must be non-negative.",
            "projectRevision",
          );
        }
        return this.#transport.operationsSince(projectRevision);
      },
      latestProjectRevision: () => this.#sequencer.snapshot().projectRevision,
      publishPresence: async (presence) => {
        if (closed) {
          throw new PixyncError(
            "INVALID_ENVELOPE",
            "Connection is closed.",
            "clientId",
          );
        }
        validatePresenceInput(presence);
        if (
          presence.clientId !== input.clientId ||
          presence.actorId !== input.actorId
        ) {
          throw new PixyncError(
            "INVALID_ENVELOPE",
            "Presence identity is not bound to the connection.",
            "presence.clientId",
          );
        }
        const next: ProjectPresence = {
          ...presence,
          updatedAt: this.#now().toISOString(),
        };
        validatePresence(next);
        this.#presence.set(input.clientId, next);
        await this.#broadcastPresence({ kind: "upsert", presence: next });
        return next;
      },
      createCheckpoint: async (checkpointInput) => {
        if (closed) {
          throw new PixyncError(
            "INVALID_ENVELOPE",
            "Connection is closed.",
            "clientId",
          );
        }
        if (role === "viewer") {
          throw new PixyncError(
            "ROLE_FORBIDDEN",
            "Viewer sessions cannot create checkpoints.",
            "role",
          );
        }
        validateCheckpointInput(checkpointInput);
        const snapshot = this.#sequencer.snapshot();
        const next: ProjectSessionCheckpoint = {
          checkpointId: checkpointInput.checkpointId,
          projectId: this.#projectId,
          label: checkpointInput.label,
          kind: checkpointInput.kind,
          createdByActorId: input.actorId,
          createdByClientId: input.clientId,
          createdAt: this.#now().toISOString(),
          projectRevision: snapshot.projectRevision,
          aggregateRevisions: { ...snapshot.aggregateRevisions },
          operationCount: snapshot.operationIds.length,
        };
        validateCheckpoint(next);
        const existing = this.#checkpoints.get(next.checkpointId);
        if (existing !== undefined) {
          const sameIdentity = existing.projectId === next.projectId &&
            existing.label === next.label && existing.kind === next.kind &&
            existing.createdByActorId === next.createdByActorId &&
            existing.createdByClientId === next.createdByClientId;
          if (!sameIdentity) {
            throw new PixyncError(
              "IDEMPOTENCY_CONFLICT",
              "Checkpoint ID was reused with different metadata.",
              "checkpointId",
            );
          }
          return existing;
        }
        this.#checkpoints.set(next.checkpointId, next);
        await this.#broadcastCheckpoint({ kind: "upsert", checkpoint: next });
        return next;
      },
      listCheckpoints: async () => {
        if (closed) {
          throw new PixyncError(
            "INVALID_ENVELOPE",
            "Connection is closed.",
            "clientId",
          );
        }
        return sortCheckpoints(this.#checkpoints.values());
      },
      close: async () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        this.#connections.delete(input.clientId);
        if (this.#presence.delete(input.clientId)) {
          await this.#broadcastPresence({
            kind: "remove",
            clientId: input.clientId,
            reason: "disconnect",
          });
        }
      },
    };
    return connection;
  }

  /** Deterministic local fixture seam for reordered authoritative delivery. */
  async deliverTo(
    clientId: string,
    operations: readonly PixyncCommittedOperation[],
  ): Promise<void> {
    await this.#transport.deliver(clientId, operations);
  }

  async expirePresence(): Promise<readonly string[]> {
    const now = this.#now().getTime();
    const expired: string[] = [];
    for (const [clientId, presence] of this.#presence) {
      if (now - Date.parse(presence.updatedAt) >= this.#presenceTtlMs) {
        this.#presence.delete(clientId);
        expired.push(clientId);
        await this.#broadcastPresence({
          kind: "remove",
          clientId,
          reason: "expired",
        });
      }
    }
    return expired;
  }

  async #submit(
    connection: ProjectSessionConnectInput,
    draft: PixyncOperationDraft,
  ): Promise<PixyncOperationResult> {
    if (!this.#connections.has(connection.clientId)) {
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Connection is closed.",
        "clientId",
      );
    }
    if ((connection.role ?? "editor") === "viewer") {
      throw new PixyncError(
        "ROLE_FORBIDDEN",
        "Viewer sessions cannot submit Project Session operations.",
        "role",
      );
    }
    await validateBoundedOperation(draft);
    if (
      draft.projectId !== this.#projectId ||
      draft.projectId !== connection.projectId
    ) {
      throw new PixyncError(
        "PROJECT_MISMATCH",
        "Operation belongs to another project.",
        "projectId",
      );
    }
    if (
      draft.actorId !== connection.actorId ||
      draft.clientId !== connection.clientId
    ) {
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Operation identity is not bound to the connection.",
        "clientId",
      );
    }
    return this.#enqueue(async () => {
      const result = await this.#sequencer.commit(draft);
      await validateBoundedOperation(result.operation);
      await this.#broadcastOperation(result.operation);
      return result;
    });
  }

  async #broadcastOperation(
    operation: PixyncCommittedOperation,
  ): Promise<void> {
    const clientIds = [...this.#connections.keys()];
    for (const clientId of clientIds) {
      try {
        await this.#transport.deliver(clientId, [operation]);
      } catch {
        // A disconnected local receiver must not roll back an authoritative commit.
      }
    }
  }

  async #broadcastPresence(event: ProjectPresenceEvent): Promise<void> {
    const receivers = [...this.#connections.values()];
    for (const receiver of receivers) {
      try {
        await receiver.onPresence(event);
      } catch {
        // Presence is ephemeral and never blocks durable operation sequencing.
      }
    }
  }

  async #broadcastCheckpoint(
    event: ProjectSessionCheckpointEvent,
  ): Promise<void> {
    validateCheckpoint(event.checkpoint);
    const receivers = [...this.#connections.values()];
    for (const receiver of receivers) {
      try {
        await receiver.onCheckpoint(event);
      } catch {
        // A checkpoint is already authoritative in this local broker; a
        // receiver callback must not roll it back or block other clients.
      }
    }
  }

  #enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#commitTail.then(work, work);
    this.#commitTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export class ProjectSessionClient {
  readonly #broker: ProjectSessionBroker;
  readonly #projectId: string;
  readonly #actorId: string;
  readonly #clientId: string;
  readonly #displayName: string;
  readonly #role: ProjectSessionRole;
  readonly #keeper: PixyncOrderKeeper;
  readonly #presence = new Map<string, ProjectPresence>();
  readonly #checkpoints = new Map<string, ProjectSessionCheckpoint>();
  readonly #pending = new Set<string>();
  readonly #listeners = new Set<(state: ProjectSessionState) => void>();
  #activeMode: ProjectSessionMode;
  #status: ProjectSessionStatus = "OFFLINE";
  #lastError: ProjectSessionState["lastError"];
  #connection: ProjectSessionBrokerConnection | undefined;

  constructor(options: ProjectSessionClientOptions) {
    assertSafeId(options.projectId, "projectId");
    assertSafeId(options.actorId, "actorId");
    assertSafeId(options.clientId, "clientId");
    assertBoundedText(options.displayName, "displayName");
    const role = options.role ?? "editor";
    assertRole(role, "role");
    this.#broker = options.broker;
    this.#projectId = options.projectId;
    this.#actorId = options.actorId;
    this.#clientId = options.clientId;
    this.#displayName = options.displayName;
    this.#role = role;
    this.#activeMode = options.activeMode ?? "iDRAW";
    assertMode(this.#activeMode, "activeMode");
    this.#keeper = new PixyncOrderKeeper({
      projectId: options.projectId,
      adapters: options.adapters,
    });
  }

  state(): ProjectSessionState {
    const snapshot = this.#keeper.snapshot();
    return {
      projectId: this.#projectId,
      activeMode: this.#activeMode,
      role: this.#role,
      status: this.#status,
      projectRevision: snapshot.projectRevision,
      aggregateRevisions: { ...snapshot.aggregateRevisions },
      pendingOperationIds: [...this.#pending].sort(),
      presence: [...this.#presence.values()].sort((left, right) =>
        left.clientId.localeCompare(right.clientId)
      ),
      checkpoints: sortCheckpoints(this.#checkpoints.values()),
      lastError: this.#lastError,
    };
  }

  onState(listener: (state: ProjectSessionState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setActiveMode(mode: ProjectSessionMode): void {
    assertMode(mode, "activeMode");
    this.#activeMode = mode;
    this.#emit();
  }

  async connect(
    options: ProjectSessionClientConnectOptions = {},
  ): Promise<void> {
    if (this.#connection !== undefined) return;
    this.#setStatus("RECOVERING");
    try {
      const connection = await this.#broker.connect({
        projectId: this.#projectId,
        actorId: this.#actorId,
        clientId: this.#clientId,
        role: this.#role,
        onOperation: async (operation) => {
          await this.#receive(operation);
        },
        onPresence: (event) => this.#receivePresence(event),
        onCheckpoint: (event) => this.#receiveCheckpoint(event),
      });
      this.#connection = connection;
      this.#presence.clear();
      for (const presence of connection.initialPresence) {
        validatePresence(presence);
        this.#presence.set(presence.clientId, presence);
      }
      this.#checkpoints.clear();
      for (const checkpoint of connection.initialCheckpoints) {
        validateCheckpoint(checkpoint);
        this.#checkpoints.set(checkpoint.checkpointId, checkpoint);
      }
      if (options.catchUp !== false) await this.catchUp();
      else this.#setStatus("RECOVERING");
      this.#emit();
    } catch (error) {
      const connection = this.#connection;
      this.#connection = undefined;
      if (connection !== undefined) await connection.close("disconnect");
      this.#setError(error, "OFFLINE");
      throw error;
    }
  }

  async catchUp(): Promise<void> {
    const connection = this.#connection;
    if (connection === undefined) {
      this.#setStatus("OFFLINE");
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Project Session is offline.",
        "clientId",
      );
    }
    this.#setStatus("RECOVERING");
    try {
      const operations = await connection.fetchSince(
        this.#keeper.snapshot().projectRevision,
      );
      await this.#keeper.catchUp(operations);
      if (
        this.#keeper.snapshot().projectRevision ===
          connection.latestProjectRevision()
      ) {
        this.#setStatus("CONFIRMED");
        this.#lastError = undefined;
      } else {
        this.#setStatus("RECOVERING");
      }
      this.#emit();
    } catch (error) {
      this.#setError(error, "ERROR");
      throw error;
    }
  }

  async submit(draft: PixyncOperationDraft): Promise<PixyncOperationResult> {
    const connection = this.#connection;
    if (connection === undefined) {
      this.#setStatus("OFFLINE");
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Project Session is offline.",
        "clientId",
      );
    }
    if (draft.projectId !== this.#projectId) {
      this.#setError(
        new PixyncError(
          "PROJECT_MISMATCH",
          "Operation belongs to another project.",
          "projectId",
        ),
        "CONFLICT",
      );
      throw new PixyncError(
        "PROJECT_MISMATCH",
        "Operation belongs to another project.",
        "projectId",
      );
    }
    this.#pending.add(draft.operationId);
    this.#setStatus("LOCAL_OPTIMISTIC");
    this.#setStatus("PENDING");
    try {
      const result = await connection.submit(draft);
      await this.#receive(result.operation);
      this.#pending.delete(draft.operationId);
      if (
        this.#keeper.snapshot().projectRevision ===
          connection.latestProjectRevision()
      ) {
        this.#setStatus("CONFIRMED");
      }
      this.#lastError = undefined;
      this.#emit();
      return result;
    } catch (error) {
      this.#pending.delete(draft.operationId);
      this.#setError(
        error,
        isConflictCode(errorDetails(error).code) ? "CONFLICT" : "ERROR",
      );
      throw error;
    }
  }

  async publishPresence(selectionLabel: string): Promise<ProjectPresence> {
    const connection = this.#connection;
    if (connection === undefined) {
      this.#setStatus("OFFLINE");
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Project Session is offline.",
        "clientId",
      );
    }
    const input: ProjectPresenceInput = {
      actorId: this.#actorId,
      clientId: this.#clientId,
      displayName: this.#displayName,
      mode: this.#activeMode,
      selectionLabel,
    };
    const presence = await connection.publishPresence(input);
    this.#presence.set(presence.clientId, presence);
    this.#emit();
    return presence;
  }

  async createCheckpoint(
    input: ProjectSessionCheckpointInput,
  ): Promise<ProjectSessionCheckpoint> {
    const connection = this.#connection;
    if (connection === undefined) {
      this.#setStatus("OFFLINE");
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Project Session is offline.",
        "clientId",
      );
    }
    try {
      const checkpoint = await connection.createCheckpoint(input);
      validateCheckpoint(checkpoint);
      this.#checkpoints.set(checkpoint.checkpointId, checkpoint);
      this.#lastError = undefined;
      this.#emit();
      return checkpoint;
    } catch (error) {
      this.#setError(
        error,
        isConflictCode(errorDetails(error).code) ? "CONFLICT" : "ERROR",
      );
      throw error;
    }
  }

  async listCheckpoints(): Promise<readonly ProjectSessionCheckpoint[]> {
    const connection = this.#connection;
    if (connection === undefined) {
      this.#setStatus("OFFLINE");
      throw new PixyncError(
        "INVALID_ENVELOPE",
        "Project Session is offline.",
        "clientId",
      );
    }
    const checkpoints = await connection.listCheckpoints();
    for (const checkpoint of checkpoints) {
      validateCheckpoint(checkpoint);
      this.#checkpoints.set(checkpoint.checkpointId, checkpoint);
    }
    this.#emit();
    return sortCheckpoints(this.#checkpoints.values());
  }

  async disconnect(): Promise<void> {
    const connection = this.#connection;
    this.#connection = undefined;
    if (connection !== undefined) await connection.close("disconnect");
    this.#presence.delete(this.#clientId);
    this.#setStatus("OFFLINE");
  }

  async #receive(
    operation: PixyncCommittedOperation,
  ): Promise<PixyncReceiveOutcome> {
    try {
      await validateBoundedOperation(operation);
      const outcome = await this.#keeper.receive(operation);
      if (outcome === "gap-held") this.#setStatus("RECOVERING");
      else if (outcome === "applied" && this.#pending.size === 0) {
        this.#setStatus("CONFIRMED");
      }
      this.#emit();
      return outcome;
    } catch (error) {
      this.#setError(
        error,
        isConflictCode(errorDetails(error).code) ? "CONFLICT" : "ERROR",
      );
      throw error;
    }
  }

  #receivePresence(event: ProjectPresenceEvent): void {
    if (event.kind === "upsert") {
      validatePresence(event.presence);
      this.#presence.set(event.presence.clientId, event.presence);
    } else {
      assertSafeId(event.clientId, "presence.clientId");
      this.#presence.delete(event.clientId);
    }
    this.#emit();
  }

  #receiveCheckpoint(event: ProjectSessionCheckpointEvent): void {
    validateCheckpoint(event.checkpoint);
    if (event.checkpoint.projectId !== this.#projectId) {
      this.#setError(
        new PixyncError(
          "PROJECT_MISMATCH",
          "Checkpoint belongs to another project.",
          "checkpoint.projectId",
        ),
        "CONFLICT",
      );
      return;
    }
    this.#checkpoints.set(event.checkpoint.checkpointId, event.checkpoint);
    this.#emit();
  }

  #setStatus(status: ProjectSessionStatus): void {
    this.#status = status;
    this.#emit();
  }

  #setError(error: unknown, status: ProjectSessionStatus): void {
    this.#status = status;
    this.#lastError = errorDetails(error);
    this.#emit();
  }

  #emit(): void {
    const state = this.state();
    for (const listener of this.#listeners) listener(state);
  }
}
