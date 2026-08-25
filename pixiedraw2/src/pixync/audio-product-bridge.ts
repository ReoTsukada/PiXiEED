/** Product-safe Audio boundary with metadata-only cross-mode invalidations. */
import type {
  AudioCommand,
  AudioJournalEntry,
  AudioProject,
} from "../audio/audio-200/contracts.ts";
import {
  type AudioApplyInput,
  type AudioApplyReceipt,
  createAudioOperationDraft,
  createAudioPixyncAdapter,
} from "./adapters.ts";
import type {
  PixyncAggregateAdapter,
  PixyncOperationDraft,
} from "./contracts.ts";
import type { PixyncAggregateInvalidation } from "./lazy-aggregate-sync.ts";
import type {
  PixyncTransportAck,
  PixyncTransportBinding,
} from "./transport.ts";

export class PixyncAudioProductBridgeError extends Error {
  constructor(
    readonly code:
      | "SESSION_UNAVAILABLE"
      | "ROLE_FORBIDDEN"
      | "PROJECT_MISMATCH"
      | "HISTORY_MUTATION_FORBIDDEN"
      | "SELF_ECHO_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "PixyncAudioProductBridgeError";
  }
}

export interface PixyncAudioProductStateSnapshot {
  readonly project: AudioProject;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly appliedEntryIds: readonly string[];
}

export interface PixyncAudioProductStatePort {
  readonly preservesLocalHistory: true;
  current(): PixyncAudioProductStateSnapshot;
  applyRemote(input: AudioApplyInput): Promise<AudioApplyReceipt>;
}

export interface PixyncAudioProductTransportPort {
  readonly binding: PixyncTransportBinding | undefined;
  submit(draft: PixyncOperationDraft): Promise<PixyncTransportAck>;
  snapshot(): {
    readonly projectId: string;
    readonly projectRevision: number;
    readonly aggregateRevisions: Readonly<
      Record<"draw" | "audio" | "game", number>
    >;
  };
}

export interface PixyncAudioSubmitResult {
  readonly ack: PixyncTransportAck;
  readonly invalidation: PixyncAggregateInvalidation;
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function entityId(
  payload: Readonly<Record<string, unknown>>,
  entityKey: string,
  idKey: string,
): string | undefined {
  const entity = record(payload[entityKey]);
  const value = entity?.[idKey];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function audioChangedAssetIds(command: AudioCommand): Readonly<{
  ids: readonly string[];
  fullRefresh: boolean;
}> {
  const payload = record(command.payload) ?? {};
  const ids = new Set<string>([`audio-project:${String(command.projectId)}`]);
  const trackId = typeof payload.trackId === "string"
    ? payload.trackId
    : entityId(payload, "track", "trackId") ??
      entityId(payload, "clip", "trackId") ??
      entityId(payload, "note", "trackId");
  if (trackId !== undefined) ids.add(`audio-track:${trackId}`);
  const assetId = entityId(payload, "revision", "assetId") ??
    entityId(record(payload.recording) ?? {}, "revision", "assetId") ??
    entityId(record(payload.bounce) ?? {}, "revision", "assetId") ??
    entityId(record(payload.freeze) ?? {}, "revision", "assetId");
  if (assetId !== undefined) ids.add(assetId);
  const precise = trackId !== undefined || assetId !== undefined ||
    command.type === "TEMPO_SET" || command.type === "MASTER_REPLACE" ||
    command.type === "DRUM_KIT_SET";
  return { ids: [...ids], fullRefresh: !precise };
}

function invalidation(
  operation: PixyncTransportAck["operation"],
  binding: PixyncTransportBinding,
  command: AudioCommand,
): PixyncAggregateInvalidation {
  const changed = audioChangedAssetIds(command);
  return {
    projectId: operation.projectId,
    sessionGeneration: binding.sessionGeneration,
    aggregate: "audio",
    operationId: operation.operationId,
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision,
    changedAssetIds: changed.ids,
    fullRefresh: changed.fullRefresh,
  };
}

export class PixyncAudioProductBridge {
  readonly adapter: PixyncAggregateAdapter;
  readonly #transport: PixyncAudioProductTransportPort;
  readonly #state: PixyncAudioProductStatePort;
  readonly #onInvalidation: (value: PixyncAggregateInvalidation) => void;

  constructor(options: {
    readonly transport: PixyncAudioProductTransportPort;
    readonly state: PixyncAudioProductStatePort;
    readonly onInvalidation: (value: PixyncAggregateInvalidation) => void;
  }) {
    this.#transport = options.transport;
    this.#state = options.state;
    this.#onInvalidation = options.onInvalidation;
    this.adapter = createAudioPixyncAdapter({
      preservesLocalHistory: true,
      apply: (input) => this.#applyRemote(input),
    });
  }

  async submitLocal(
    entry: AudioJournalEntry,
  ): Promise<PixyncAudioSubmitResult> {
    const binding = this.#transport.binding;
    if (binding === undefined) {
      throw new PixyncAudioProductBridgeError(
        "SESSION_UNAVAILABLE",
        "An authenticated PiXYNC session is required.",
      );
    }
    if (binding.role === "viewer") {
      throw new PixyncAudioProductBridgeError(
        "ROLE_FORBIDDEN",
        "Viewer sessions cannot submit Audio operations.",
      );
    }
    if (String(entry.command.projectId) !== binding.projectId) {
      throw new PixyncAudioProductBridgeError(
        "PROJECT_MISMATCH",
        "Audio state does not belong to the authenticated PiXYNC project.",
      );
    }
    const revisions = this.#transport.snapshot();
    if (revisions.projectId !== binding.projectId) {
      throw new PixyncAudioProductBridgeError(
        "PROJECT_MISMATCH",
        "PiXYNC revision state belongs to another project.",
      );
    }
    const expectedIdentity = {
      operationId: String(entry.entryId),
      projectId: binding.projectId,
      actorId: binding.actorId,
      clientId: binding.clientId,
      clientSequence: entry.sequence,
    };
    const draft = await createAudioOperationDraft({
      entry,
      identity: {
        ...expectedIdentity,
        baseProjectRevision: revisions.projectRevision,
        aggregateRevision: revisions.aggregateRevisions.audio,
      },
      expectedIdentity,
    });
    const ack = await this.#transport.submit(draft);
    const notice = invalidation(ack.operation, binding, entry.command);
    this.#onInvalidation(notice);
    return { ack, invalidation: notice };
  }

  async #applyRemote(input: AudioApplyInput): Promise<AudioApplyReceipt> {
    const binding = this.#transport.binding;
    if (binding === undefined) {
      throw new PixyncAudioProductBridgeError(
        "SESSION_UNAVAILABLE",
        "An authenticated PiXYNC session is required.",
      );
    }
    const before = this.#state.current();
    if (String(before.project.projectId) !== input.operation.projectId) {
      throw new PixyncAudioProductBridgeError(
        "PROJECT_MISMATCH",
        "Remote Audio operation belongs to another active project.",
      );
    }
    if (before.appliedEntryIds.includes(input.entryId)) {
      if (
        before.project.projectRevision < input.command.baseProjectRevision + 1
      ) {
        throw new PixyncAudioProductBridgeError(
          "SELF_ECHO_MISMATCH",
          "Self echo is newer than the local Audio state.",
        );
      }
      const receipt: AudioApplyReceipt = {
        operationId: input.operation.operationId,
        projectId: input.operation.projectId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseProjectRevision: input.operation.baseProjectRevision,
        stateHash: String(before.project.stateHash),
        projectRevision: before.project.projectRevision,
      };
      this.#onInvalidation(
        invalidation(input.operation, binding, input.command),
      );
      return receipt;
    }
    const receipt = await this.#state.applyRemote(input);
    const after = this.#state.current();
    if (
      after.undoDepth !== before.undoDepth ||
      after.redoDepth !== before.redoDepth
    ) {
      throw new PixyncAudioProductBridgeError(
        "HISTORY_MUTATION_FORBIDDEN",
        "Remote Audio apply changed local Undo/Redo history.",
      );
    }
    this.#onInvalidation(invalidation(input.operation, binding, input.command));
    return receipt;
  }
}
