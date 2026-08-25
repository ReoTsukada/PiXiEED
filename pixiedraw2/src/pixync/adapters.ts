/** PIXYNC-DRAW2-110 canonical, transport-free domain adapters. */
import {
  type CanonicalOperation,
  type CommandResult,
  type ProjectState,
  sha256Hex,
} from "../draw2-core.ts";
import type {
  AudioCommand,
  AudioJournalEntry,
  AudioProject,
} from "../audio/audio-200/index.ts";
import type { GameProject, JournalCommand } from "../game/game-300/core.ts";
import { createPixyncDraft } from "./core.ts";
import type {
  PixyncAggregateAdapter,
  PixyncApplyContext,
  PixyncCommittedOperation,
  PixyncJsonObject,
  PixyncOperationDraft,
} from "./contracts.ts";

export type AdapterApplySource = "sequencer" | "remote";
export interface AdapterIdentity {
  readonly operationId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseProjectRevision: number;
  readonly aggregateRevision?: number;
}
export interface AdapterExpectedIdentity {
  readonly operationId: string;
  readonly projectId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
}
export type PixyncAdapterErrorCode =
  | "IDENTITY_MISMATCH"
  | "PROJECT_MISMATCH"
  | "ASSET_MISMATCH"
  | "OPERATION_ID_MISMATCH"
  | "STALE_BASE"
  | "STRUCTURE_EPOCH_MISMATCH"
  | "SNAPSHOT_OR_RAW_PAYLOAD"
  | "INVALID_COMMAND_PAYLOAD"
  | "RESOLVER_MISMATCH"
  | "STALE_PARENT"
  | "REVISION_MISMATCH"
  | "APPLY_FAILED"
  | "HISTORY_MUTATION_FORBIDDEN";
export class PixyncAdapterError extends Error {
  readonly code: PixyncAdapterErrorCode;
  readonly path: string | undefined;
  constructor(code: PixyncAdapterErrorCode, message: string, path?: string) {
    super(message);
    this.name = "PixyncAdapterError";
    this.code = code;
    this.path = path;
  }
}

type RecordValue = Record<string, unknown>;
function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fail(
  code: PixyncAdapterErrorCode,
  message: string,
  path?: string,
): never {
  throw new PixyncAdapterError(code, message, path);
}
function assertJson(value: unknown, path: string): void {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("INVALID_COMMAND_PAYLOAD", "JSON number is not finite.", path);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJson(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    fail(
      "SNAPSHOT_OR_RAW_PAYLOAD",
      "Only bounded JSON values may cross the adapter.",
      path,
    );
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll("_", "");
    if (
      normalized === "before" || normalized === "after" ||
      normalized === "beforestate" || normalized === "afterstate" ||
      normalized.includes("snapshot") || normalized.includes("pointer") ||
      normalized.includes("preview") || normalized.includes("rawbytes") ||
      normalized.includes("blob")
    ) {
      fail(
        "SNAPSHOT_OR_RAW_PAYLOAD",
        "Snapshots, previews, and raw bytes are not sync payloads.",
        `${path}.${key}`,
      );
    }
    assertJson(child, `${path}.${key}`);
  }
}
function jsonObject(value: unknown, path: string): PixyncJsonObject {
  if (!isRecord(value)) {
    fail("INVALID_COMMAND_PAYLOAD", "Object payload required.", path);
  }
  assertJson(value, path);
  return value as PixyncJsonObject;
}
function recordOf(value: unknown, path: string): RecordValue {
  if (!isRecord(value)) {
    fail("INVALID_COMMAND_PAYLOAD", "Object value required.", path);
  }
  return value;
}
function assertIdentity(
  actual: AdapterExpectedIdentity,
  expected: AdapterExpectedIdentity,
): void {
  for (
    const field of [
      "operationId",
      "projectId",
      "actorId",
      "clientId",
      "clientSequence",
    ] as const
  ) {
    if (actual[field] !== expected[field]) {
      fail(
        "IDENTITY_MISMATCH",
        `Identity field ${field} was substituted.`,
        field,
      );
    }
  }
}
function assertDraftIdentity(
  identity: AdapterIdentity,
  expected: AdapterExpectedIdentity,
): void {
  assertIdentity({
    operationId: identity.operationId,
    projectId: expected.projectId,
    actorId: identity.actorId,
    clientId: identity.clientId,
    clientSequence: identity.clientSequence,
  }, expected);
}
function identityPayload(
  identity: AdapterExpectedIdentity,
): PixyncJsonObject {
  return { ...identity };
}
function assertEnvelopeIdentity(
  operation: PixyncCommittedOperation,
  identity: AdapterExpectedIdentity,
): void {
  assertIdentity({
    operationId: operation.operationId,
    projectId: operation.projectId,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
  }, identity);
}
interface ReceiptIdentity {
  readonly operationId: string;
  readonly projectId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseProjectRevision: number;
}
function assertReceiptIdentity(
  receipt: ReceiptIdentity,
  operation: PixyncCommittedOperation,
): void {
  assertIdentity({
    operationId: receipt.operationId,
    projectId: receipt.projectId,
    actorId: receipt.actorId,
    clientId: receipt.clientId,
    clientSequence: receipt.clientSequence,
  }, {
    operationId: operation.operationId,
    projectId: operation.projectId,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
  });
  if (receipt.baseProjectRevision !== operation.baseProjectRevision) {
    fail(
      "STALE_BASE",
      "Apply receipt base revision differs.",
      "baseProjectRevision",
    );
  }
}
function requireHistorySafePort(
  port: { readonly preservesLocalHistory: true },
): void {
  if (port.preservesLocalHistory !== true) {
    fail(
      "HISTORY_MUTATION_FORBIDDEN",
      "Remote apply port must preserve local history.",
      "preservesLocalHistory",
    );
  }
}

export async function drawRasterHash(
  state: ProjectState,
  assetId: string,
): Promise<string> {
  const asset = state.assets[assetId];
  if (asset === undefined) {
    fail("ASSET_MISMATCH", "Draw asset is missing.", "assetId");
  }
  return sha256Hex({
    projectId: state.projectId,
    assetId,
    width: asset.width,
    height: asset.height,
    tileSize: asset.raster.tileSize,
    revision: asset.revision,
    pixels: Array.from(asset.raster.toUint8Array()),
  });
}
export interface DrawOperationDraftInput {
  readonly result: CommandResult;
  readonly state: ProjectState;
  readonly identity: AdapterIdentity;
  readonly expectedIdentity: AdapterExpectedIdentity;
  readonly baseStructureEpoch: number;
}
export interface DrawApplyInput {
  readonly operation: CanonicalOperation;
  readonly source: AdapterApplySource;
  readonly baseProjectRevision: number;
  readonly baseStructureEpoch: number;
  readonly expectedStructureEpoch: number;
  readonly expectedRasterHash: string;
  readonly aggregateRevision: number;
}
export interface DrawApplyReceipt extends ReceiptIdentity {
  readonly assetId: string;
  readonly baseStructureEpoch: number;
  readonly structureEpoch: number;
  readonly rasterHash: string;
  readonly localUndoDepth: number;
  readonly localRedoDepth: number;
}
export interface DrawCanonicalApplyPort {
  readonly preservesLocalHistory: true;
  apply(input: DrawApplyInput): Promise<DrawApplyReceipt>;
}

export async function createDrawOperationDraft(
  input: DrawOperationDraftInput,
): Promise<PixyncOperationDraft> {
  const operation = input.result.operation;
  assertIdentity({
    operationId: operation.operationId,
    projectId: operation.projectId,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
  }, input.expectedIdentity);
  if (input.identity.operationId !== operation.operationId) {
    fail(
      "OPERATION_ID_MISMATCH",
      "Draw operation ID was substituted.",
      "operationId",
    );
  }
  assertDraftIdentity(input.identity, input.expectedIdentity);
  const payload = jsonObject({
    adapter: "draw110",
    identity: identityPayload(input.expectedIdentity),
    command: {
      commandId: operation.commandId,
      operationType: operation.operationType,
      assetId: operation.assetId,
      baseStructureEpoch: input.baseStructureEpoch,
      structureEpoch: operation.structureEpoch,
      payload: jsonObject(operation.payload, "operation.payload"),
    },
    rasterHash: await drawRasterHash(input.state, operation.assetId),
  }, "payload");
  return createPixyncDraft({
    operationId: operation.operationId,
    projectId: operation.projectId,
    aggregate: "draw",
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
    baseProjectRevision: input.identity.baseProjectRevision,
    aggregateRevision: input.identity.aggregateRevision ?? 0,
    payload,
  });
}
function decodeDraw(operation: PixyncCommittedOperation) {
  const payload = recordOf(operation.payload, "payload");
  if (payload.adapter !== "draw110" || typeof payload.rasterHash !== "string") {
    fail(
      "INVALID_COMMAND_PAYLOAD",
      "Draw adapter payload is invalid.",
      "payload",
    );
  }
  const identityValue = recordOf(payload.identity, "payload.identity");
  const command = recordOf(payload.command, "payload.command");
  const identity: AdapterExpectedIdentity = {
    operationId: String(identityValue.operationId),
    projectId: String(identityValue.projectId),
    actorId: String(identityValue.actorId),
    clientId: String(identityValue.clientId),
    clientSequence: Number(identityValue.clientSequence),
  };
  assertEnvelopeIdentity(operation, identity);
  if (
    typeof command.commandId !== "string" ||
    typeof command.operationType !== "string" ||
    typeof command.assetId !== "string" ||
    !Number.isSafeInteger(command.baseStructureEpoch) ||
    !Number.isSafeInteger(command.structureEpoch)
  ) {
    fail(
      "INVALID_COMMAND_PAYLOAD",
      "Draw command metadata is invalid.",
      "payload.command",
    );
  }
  return {
    identity,
    command: {
      commandId: command.commandId,
      operationType: command.operationType,
      assetId: command.assetId,
      baseStructureEpoch: Number(command.baseStructureEpoch),
      structureEpoch: Number(command.structureEpoch),
      payload: jsonObject(command.payload, "payload.command.payload"),
    },
    rasterHash: payload.rasterHash,
  };
}
export function createDrawPixyncAdapter(
  port: DrawCanonicalApplyPort,
): PixyncAggregateAdapter {
  requireHistorySafePort(port);
  return {
    aggregate: "draw",
    apply: async (operation, context) => {
      const decoded = decodeDraw(operation);
      const canonicalOperation: CanonicalOperation = {
        operationId: operation.operationId,
        operationType: decoded.command
          .operationType as CanonicalOperation["operationType"],
        schemaVersion: 1,
        commandId: decoded.command.commandId,
        projectId: operation.projectId,
        assetId: decoded.command.assetId,
        actorId: operation.actorId,
        clientId: operation.clientId,
        clientSequence: operation.clientSequence,
        structureEpoch: decoded.command.structureEpoch,
        payload: decoded.command.payload,
      };
      const receipt = await port.apply({
        operation: canonicalOperation,
        source: context.source,
        baseProjectRevision: operation.baseProjectRevision,
        baseStructureEpoch: decoded.command.baseStructureEpoch,
        expectedStructureEpoch: decoded.command.structureEpoch,
        expectedRasterHash: decoded.rasterHash,
        aggregateRevision: context.aggregateRevision,
      });
      assertReceiptIdentity(receipt, operation);
      if (receipt.assetId !== decoded.command.assetId) {
        fail(
          "ASSET_MISMATCH",
          "Draw receipt asset differs.",
          "assetId",
        );
      }
      if (
        receipt.baseStructureEpoch !== decoded.command.baseStructureEpoch ||
        receipt.structureEpoch !== decoded.command.structureEpoch
      ) {
        fail(
          "STRUCTURE_EPOCH_MISMATCH",
          "Draw structure epoch did not converge.",
          "structureEpoch",
        );
      }
      if (receipt.rasterHash !== decoded.rasterHash) {
        fail(
          "APPLY_FAILED",
          "Draw raster hash did not converge.",
          "rasterHash",
        );
      }
    },
  };
}

export interface AudioOperationDraftInput {
  readonly entry: AudioJournalEntry;
  readonly identity: AdapterIdentity;
  readonly expectedIdentity: AdapterExpectedIdentity;
}
export interface AudioApplyInput {
  readonly command: AudioCommand;
  readonly entryId: string;
  readonly entryHash: string;
  readonly sequence: number;
  readonly kind: AudioJournalEntry["kind"];
  readonly operation: PixyncCommittedOperation;
  readonly source: AdapterApplySource;
  readonly aggregateRevision: number;
}
export interface AudioApplyReceipt extends ReceiptIdentity {
  readonly stateHash: string;
  readonly projectRevision: number;
}
export interface AudioCanonicalApplyPort {
  readonly preservesLocalHistory: true;
  apply(input: AudioApplyInput): Promise<AudioApplyReceipt>;
}
export async function createAudioOperationDraft(
  input: AudioOperationDraftInput,
): Promise<PixyncOperationDraft> {
  const entry = input.entry;
  if (String(entry.entryId) !== input.identity.operationId) {
    fail(
      "OPERATION_ID_MISMATCH",
      "Audio operation ID must bind to entryId.",
      "operationId",
    );
  }
  assertDraftIdentity(input.identity, input.expectedIdentity);
  const projectId = String(entry.command.projectId);
  assertIdentity({
    operationId: String(entry.entryId),
    projectId,
    actorId: input.identity.actorId,
    clientId: input.identity.clientId,
    clientSequence: input.identity.clientSequence,
  }, input.expectedIdentity);
  // Audio's command revision belongs to the Audio aggregate. The identity
  // base revision belongs to the cross-aggregate PiXYNC project sequence.
  // They intentionally diverge when Draw or Game commits between Audio edits.
  const payload = jsonObject({
    adapter: "audio110",
    identity: identityPayload(input.expectedIdentity),
    command: entry.command,
    journal: {
      entryId: String(entry.entryId),
      entryHash: String(entry.entryHash),
      sequence: entry.sequence,
      kind: entry.kind,
    },
  }, "payload");
  return createPixyncDraft({
    operationId: input.identity.operationId,
    projectId,
    aggregate: "audio",
    actorId: input.identity.actorId,
    clientId: input.identity.clientId,
    clientSequence: input.identity.clientSequence,
    baseProjectRevision: input.identity.baseProjectRevision,
    aggregateRevision: input.identity.aggregateRevision ?? 0,
    payload,
  });
}
function decodeAudio(operation: PixyncCommittedOperation) {
  const payload = recordOf(operation.payload, "payload");
  if (payload.adapter !== "audio110") {
    fail(
      "INVALID_COMMAND_PAYLOAD",
      "Audio adapter payload is invalid.",
      "payload",
    );
  }
  const identityValue = recordOf(payload.identity, "payload.identity");
  const journal = recordOf(payload.journal, "payload.journal");
  const identity: AdapterExpectedIdentity = {
    operationId: String(identityValue.operationId),
    projectId: String(identityValue.projectId),
    actorId: String(identityValue.actorId),
    clientId: String(identityValue.clientId),
    clientSequence: Number(identityValue.clientSequence),
  };
  assertEnvelopeIdentity(operation, identity);
  if (
    typeof journal.entryId !== "string" ||
    typeof journal.entryHash !== "string" ||
    !Number.isSafeInteger(journal.sequence) ||
    (journal.kind !== "COMMAND" && journal.kind !== "UNDO" &&
      journal.kind !== "REDO")
  ) {
    fail(
      "INVALID_COMMAND_PAYLOAD",
      "Audio journal metadata is invalid.",
      "payload.journal",
    );
  }
  return {
    identity,
    command: recordOf(
      payload.command,
      "payload.command",
    ) as unknown as AudioCommand,
    entryId: journal.entryId,
    entryHash: journal.entryHash,
    sequence: Number(journal.sequence),
    kind: journal.kind as AudioJournalEntry["kind"],
  };
}
export function createAudioPixyncAdapter(
  port: AudioCanonicalApplyPort,
): PixyncAggregateAdapter {
  requireHistorySafePort(port);
  return {
    aggregate: "audio",
    apply: async (operation, context) => {
      const decoded = decodeAudio(operation);
      if (String(decoded.command.projectId) !== operation.projectId) {
        fail("PROJECT_MISMATCH", "Audio project differs.", "command.projectId");
      }
      const receipt = await port.apply({
        ...decoded,
        operation,
        source: context.source,
        aggregateRevision: context.aggregateRevision,
      });
      assertReceiptIdentity(receipt, operation);
      if (!/^[a-f0-9]{64}$/.test(receipt.stateHash)) {
        fail("APPLY_FAILED", "Audio state hash is invalid.", "stateHash");
      }
    },
  };
}

export interface GameRevisionDescriptor {
  readonly revisionId: string;
  readonly parentRevisionId?: string;
  readonly sequence: number;
  readonly revisionHash: string;
}
export interface GameOperationDraftInput {
  readonly command: JournalCommand;
  readonly identity: AdapterIdentity;
  readonly expectedIdentity: AdapterExpectedIdentity;
}
export interface GameApplyInput {
  readonly operation: PixyncCommittedOperation;
  readonly source: AdapterApplySource;
  readonly commandId: string;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly sequence: number;
  readonly descriptor: GameRevisionDescriptor;
  readonly aggregateRevision: number;
}
export interface GameCurrentRevision {
  readonly projectId: string;
  readonly revisionId: string;
  readonly sequence: number;
  readonly stateHash: string;
}
export interface GameApplyReceipt extends ReceiptIdentity {
  readonly revisionId: string;
  readonly sequence: number;
  readonly stateHash: string;
}
export interface GameCanonicalApplyPort {
  readonly preservesLocalHistory: true;
  current(): GameCurrentRevision;
  resolveCanonicalRevision(
    afterHash: string,
    revisionId: string,
  ): Promise<GameProject | undefined>;
  appendJournalCommand(
    input: {
      readonly next: GameProject;
      readonly commandId: string;
      readonly operation: PixyncCommittedOperation;
    },
  ): Promise<GameApplyReceipt>;
}
export async function createGameOperationDraft(
  input: GameOperationDraftInput,
): Promise<PixyncOperationDraft> {
  const command = input.command;
  if (
    command.before.revision.snapshotHash !== command.beforeHash ||
    command.after.revision.snapshotHash !== command.afterHash
  ) {
    fail(
      "REVISION_MISMATCH",
      "Game journal hashes are not canonical.",
      "afterHash",
    );
  }
  if (String(command.commandId) !== input.identity.operationId) {
    fail(
      "OPERATION_ID_MISMATCH",
      "Game operation ID must bind to commandId.",
      "operationId",
    );
  }
  assertDraftIdentity(input.identity, input.expectedIdentity);
  const projectId = String(command.after.projectId);
  assertIdentity({
    operationId: String(command.commandId),
    projectId,
    actorId: input.identity.actorId,
    clientId: input.identity.clientId,
    clientSequence: input.identity.clientSequence,
  }, input.expectedIdentity);
  const revision = command.after.revision;
  const descriptor: GameRevisionDescriptor = {
    revisionId: String(revision.revisionId),
    ...(revision.parentRevisionId === undefined
      ? {}
      : { parentRevisionId: String(revision.parentRevisionId) }),
    sequence: revision.sequence,
    revisionHash: String(revision.snapshotHash),
  };
  const payload = jsonObject({
    adapter: "game110",
    identity: identityPayload(input.expectedIdentity),
    commandId: String(command.commandId),
    beforeHash: String(command.beforeHash),
    afterHash: String(command.afterHash),
    sequence: command.sequence,
    revision: descriptor,
  }, "payload");
  return createPixyncDraft({
    operationId: input.identity.operationId,
    projectId,
    aggregate: "game",
    actorId: input.identity.actorId,
    clientId: input.identity.clientId,
    clientSequence: input.identity.clientSequence,
    baseProjectRevision: input.identity.baseProjectRevision,
    aggregateRevision: input.identity.aggregateRevision ?? 0,
    payload,
  });
}
function decodeGame(operation: PixyncCommittedOperation) {
  const payload = recordOf(operation.payload, "payload");
  if (
    payload.adapter !== "game110" || typeof payload.commandId !== "string" ||
    typeof payload.beforeHash !== "string" ||
    typeof payload.afterHash !== "string" ||
    !Number.isSafeInteger(payload.sequence)
  ) {
    fail(
      "INVALID_COMMAND_PAYLOAD",
      "Game adapter payload is invalid.",
      "payload",
    );
  }
  const identityValue = recordOf(payload.identity, "payload.identity");
  const revision = recordOf(payload.revision, "payload.revision");
  const identity: AdapterExpectedIdentity = {
    operationId: String(identityValue.operationId),
    projectId: String(identityValue.projectId),
    actorId: String(identityValue.actorId),
    clientId: String(identityValue.clientId),
    clientSequence: Number(identityValue.clientSequence),
  };
  assertEnvelopeIdentity(operation, identity);
  if (
    typeof revision.revisionId !== "string" ||
    typeof revision.revisionHash !== "string" ||
    !Number.isSafeInteger(revision.sequence) ||
    (revision.parentRevisionId !== undefined &&
      typeof revision.parentRevisionId !== "string")
  ) {
    fail(
      "INVALID_COMMAND_PAYLOAD",
      "Game revision descriptor is invalid.",
      "payload.revision",
    );
  }
  return {
    identity,
    commandId: payload.commandId,
    beforeHash: payload.beforeHash,
    afterHash: payload.afterHash,
    sequence: payload.sequence,
    descriptor: {
      revisionId: revision.revisionId,
      ...(revision.parentRevisionId === undefined
        ? {}
        : { parentRevisionId: revision.parentRevisionId }),
      sequence: revision.sequence,
      revisionHash: revision.revisionHash,
    } as GameRevisionDescriptor,
  };
}
export function createGamePixyncAdapter(
  port: GameCanonicalApplyPort,
): PixyncAggregateAdapter {
  requireHistorySafePort(port);
  return {
    aggregate: "game",
    apply: async (operation, context) => {
      const decoded = decodeGame(operation);
      const current = port.current();
      if (current.projectId !== operation.projectId) {
        fail("PROJECT_MISMATCH", "Game project differs.", "projectId");
      }
      if (
        current.stateHash !== decoded.beforeHash ||
        decoded.descriptor.parentRevisionId !== current.revisionId ||
        decoded.descriptor.sequence !== current.sequence + 1
      ) fail("STALE_PARENT", "Game parent is stale.", "revision");
      const resolved = await port.resolveCanonicalRevision(
        decoded.afterHash,
        decoded.descriptor.revisionId,
      );
      if (
        resolved === undefined ||
        String(resolved.projectId) !== operation.projectId ||
        String(resolved.revision.revisionId) !==
          decoded.descriptor.revisionId ||
        resolved.revision.sequence !== decoded.descriptor.sequence ||
        String(resolved.revision.snapshotHash) !== decoded.afterHash ||
        String(resolved.revision.snapshotHash) !==
          decoded.descriptor.revisionHash ||
        String(resolved.revision.parentRevisionId) !==
          String(decoded.descriptor.parentRevisionId)
      ) {
        fail(
          "RESOLVER_MISMATCH",
          "Resolved Game revision was substituted.",
          "revision",
        );
      }
      const receipt = await port.appendJournalCommand({
        next: resolved,
        commandId: decoded.commandId,
        operation,
      });
      assertReceiptIdentity(receipt, operation);
      if (
        receipt.revisionId !== decoded.descriptor.revisionId ||
        receipt.sequence !== decoded.descriptor.sequence ||
        receipt.stateHash !== decoded.afterHash
      ) fail("REVISION_MISMATCH", "Game append receipt differs.", "revision");
      void context;
    },
  };
}

export type Draw110AdapterDraft = PixyncOperationDraft;
export type Audio110AdapterDraft = PixyncOperationDraft;
export type Game110AdapterDraft = PixyncOperationDraft;
