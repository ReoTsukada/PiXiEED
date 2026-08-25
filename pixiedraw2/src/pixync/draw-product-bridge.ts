/** Product-safe Draw boundary for PIXYNC-DRAW2-220. */
import type { CommandResult, ProjectState } from "../draw2-core.ts";
import {
  createDrawOperationDraft,
  createDrawPixyncAdapter,
  drawRasterHash,
  type DrawApplyInput,
  type DrawApplyReceipt,
} from "./adapters.ts";
import type {
  PixyncAggregateAdapter,
  PixyncOperationDraft,
} from "./contracts.ts";
import type {
  PixyncTransportAck,
  PixyncTransportBinding,
} from "./transport.ts";

const RASTER_OPERATIONS = new Set([
  "raster.setPixel",
  "raster.strokeCommit",
  "raster.writeSet",
  "raster.fill",
]);

export class PixyncDrawProductBridgeError extends Error {
  constructor(
    readonly code:
      | "SESSION_UNAVAILABLE"
      | "ROLE_FORBIDDEN"
      | "IDENTITY_MISMATCH"
      | "PROJECT_MISMATCH"
      | "OPERATION_UNSUPPORTED"
      | "HISTORY_MUTATION_FORBIDDEN"
      | "SELF_ECHO_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "PixyncDrawProductBridgeError";
  }
}

export interface PixyncDrawProductStateSnapshot {
  readonly state: ProjectState;
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export interface PixyncDrawProductStatePort {
  readonly preservesLocalHistory: true;
  current(): PixyncDrawProductStateSnapshot;
  applyRemote(input: DrawApplyInput): Promise<DrawApplyReceipt>;
}

export interface PixyncDrawProductTransportPort {
  readonly binding: PixyncTransportBinding | undefined;
  submit(draft: PixyncOperationDraft): Promise<PixyncTransportAck>;
  snapshot(): {
    readonly projectId: string;
    readonly projectRevision: number;
    readonly aggregateRevisions: Readonly<Record<"draw" | "audio" | "game", number>>;
  };
}

export interface PixyncDrawProductBridgeOptions {
  readonly transport: PixyncDrawProductTransportPort;
  readonly state: PixyncDrawProductStatePort;
}

export class PixyncDrawProductBridge {
  readonly adapter: PixyncAggregateAdapter;
  readonly #transport: PixyncDrawProductTransportPort;
  readonly #state: PixyncDrawProductStatePort;

  constructor(options: PixyncDrawProductBridgeOptions) {
    this.#transport = options.transport;
    this.#state = options.state;
    this.adapter = createDrawPixyncAdapter({
      preservesLocalHistory: true,
      apply: (input) => this.#applyRemote(input),
    });
  }

  async submitLocal(
    result: CommandResult,
    nextState: ProjectState,
    baseStructureEpoch: number,
  ): Promise<PixyncTransportAck> {
    const binding = this.#transport.binding;
    if (binding === undefined) {
      throw new PixyncDrawProductBridgeError(
        "SESSION_UNAVAILABLE",
        "An authenticated PiXYNC session is required.",
      );
    }
    if (binding.role === "viewer") {
      throw new PixyncDrawProductBridgeError(
        "ROLE_FORBIDDEN",
        "Viewer sessions cannot submit Draw operations.",
      );
    }
    const operation = result.operation;
    if (!RASTER_OPERATIONS.has(operation.operationType)) {
      throw new PixyncDrawProductBridgeError(
        "OPERATION_UNSUPPORTED",
        "Only ordinary raster commands enter the first Draw sync slice.",
      );
    }
    if (
      operation.projectId !== binding.projectId ||
      nextState.projectId !== binding.projectId
    ) {
      throw new PixyncDrawProductBridgeError(
        "PROJECT_MISMATCH",
        "Draw state does not belong to the authenticated PiXYNC project.",
      );
    }
    if (
      operation.actorId !== binding.actorId ||
      operation.clientId !== binding.clientId
    ) {
      throw new PixyncDrawProductBridgeError(
        "IDENTITY_MISMATCH",
        "Draw command identity is not the authenticated PiXYNC binding.",
      );
    }
    const revisions = this.#transport.snapshot();
    if (revisions.projectId !== binding.projectId) {
      throw new PixyncDrawProductBridgeError(
        "PROJECT_MISMATCH",
        "PiXYNC revision state belongs to another project.",
      );
    }
    const identity = {
      operationId: operation.operationId,
      projectId: operation.projectId,
      actorId: operation.actorId,
      clientId: operation.clientId,
      clientSequence: operation.clientSequence,
    };
    const draft = await createDrawOperationDraft({
      result,
      state: nextState,
      identity: {
        ...identity,
        baseProjectRevision: revisions.projectRevision,
      },
      expectedIdentity: identity,
      baseStructureEpoch,
    });
    return this.#transport.submit(draft);
  }

  async #applyRemote(input: DrawApplyInput): Promise<DrawApplyReceipt> {
    const before = this.#state.current();
    if (before.state.projectId !== input.operation.projectId) {
      throw new PixyncDrawProductBridgeError(
        "PROJECT_MISMATCH",
        "Remote Draw operation belongs to another active project.",
      );
    }
    if (before.state.appliedCommandIds.includes(input.operation.commandId)) {
      const rasterHash = await drawRasterHash(
        before.state,
        input.operation.assetId,
      );
      if (
        rasterHash !== input.expectedRasterHash ||
        before.state.structureEpoch !== input.expectedStructureEpoch
      ) {
        throw new PixyncDrawProductBridgeError(
          "SELF_ECHO_MISMATCH",
          "Self echo differs from the locally committed Draw state.",
        );
      }
      return {
        operationId: input.operation.operationId,
        projectId: input.operation.projectId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseProjectRevision: input.baseProjectRevision,
        assetId: input.operation.assetId,
        baseStructureEpoch: input.baseStructureEpoch,
        structureEpoch: before.state.structureEpoch,
        rasterHash,
        localUndoDepth: before.undoDepth,
        localRedoDepth: before.redoDepth,
      };
    }
    const receipt = await this.#state.applyRemote(input);
    const after = this.#state.current();
    if (
      after.undoDepth !== before.undoDepth ||
      after.redoDepth !== before.redoDepth
    ) {
      throw new PixyncDrawProductBridgeError(
        "HISTORY_MUTATION_FORBIDDEN",
        "Remote Draw apply changed local Undo/Redo history.",
      );
    }
    return receipt;
  }
}
