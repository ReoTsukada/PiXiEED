import { sha256Hex } from "./canonical-json.js";
import type {
  CanonicalOperation,
  CommandEnvelope,
  CommandHandler,
  Diagnostic,
  ExecuteResult,
  MutationOutcome,
  ProjectState,
} from "./types.js";

function error(code: string, message: string, path?: string): Diagnostic {
  return path === undefined
    ? { code, severity: "error", message }
    : { code, severity: "error", message, path };
}

function validateEnvelope(
  state: Readonly<ProjectState>,
  command: CommandEnvelope
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (command.schemaVersion !== 1) {
    diagnostics.push(error(
      "COMMAND_SCHEMA_UNSUPPORTED",
      `Unsupported command schema version: ${String(command.schemaVersion)}.`,
      "schemaVersion"
    ));
  }

  if (command.projectId !== state.projectId) {
    diagnostics.push(error(
      "COMMAND_PROJECT_MISMATCH",
      "The command belongs to a different project.",
      "projectId"
    ));
  }

  if (command.baseStructureEpoch !== state.structureEpoch) {
    diagnostics.push(error(
      "COMMAND_STRUCTURE_EPOCH_MISMATCH",
      `Expected structure epoch ${state.structureEpoch}, received ${command.baseStructureEpoch}.`,
      "baseStructureEpoch"
    ));
  }

  if (state.appliedCommandIds.includes(command.commandId)) {
    diagnostics.push(error(
      "COMMAND_DUPLICATE",
      "The command has already been applied.",
      "commandId"
    ));
  }

  const previousSequence = state.lastClientSequenceByClient[command.clientId] ?? 0;
  const expectedSequence = previousSequence + 1;
  if (command.clientSequence !== expectedSequence) {
    diagnostics.push(error(
      "COMMAND_CLIENT_SEQUENCE_GAP",
      `Expected client sequence ${expectedSequence}, received ${command.clientSequence}.`,
      "clientSequence"
    ));
  }

  for (const [field, value] of Object.entries({
    commandId: command.commandId,
    commandType: command.commandType,
    actorId: command.actorId,
    clientId: command.clientId,
    assetId: command.assetId,
  })) {
    if (typeof value !== "string" || value.length === 0) {
      diagnostics.push(error(
        "COMMAND_REQUIRED_FIELD",
        `${field} must be a non-empty string.`,
        field
      ));
    }
  }

  if (!Number.isSafeInteger(command.clientSequence) || command.clientSequence < 1) {
    diagnostics.push(error(
      "COMMAND_CLIENT_SEQUENCE_INVALID",
      "clientSequence must be a positive safe integer.",
      "clientSequence"
    ));
  }

  if (
    !Number.isFinite(command.createdAtMonotonicMs) ||
    command.createdAtMonotonicMs < 0
  ) {
    diagnostics.push(error(
      "COMMAND_MONOTONIC_TIME_INVALID",
      "createdAtMonotonicMs must be a finite non-negative number.",
      "createdAtMonotonicMs"
    ));
  }

  return diagnostics;
}

function cloneState(state: Readonly<ProjectState>): ProjectState {
  return structuredClone(state) as ProjectState;
}

async function makeOperation(
  command: CommandEnvelope,
  structureEpoch: number,
  payload: unknown,
  inverseOf?: string
): Promise<CanonicalOperation> {
  const operationWithoutId = {
    operationType: command.commandType,
    schemaVersion: 1 as const,
    commandId: command.commandId,
    projectId: command.projectId,
    assetId: command.assetId,
    actorId: command.actorId,
    clientId: command.clientId,
    clientSequence: command.clientSequence,
    structureEpoch,
    payload,
    ...(inverseOf === undefined ? {} : { inverseOf }),
  };

  const digest = await sha256Hex(operationWithoutId);
  return {
    operationId: `op_${digest}`,
    ...operationWithoutId,
  };
}

export class CommandEngine {
  readonly #handlers = new Map<string, CommandHandler<unknown>>();

  register<TPayload>(handler: CommandHandler<TPayload>): void {
    if (this.#handlers.has(handler.commandType)) {
      throw new Error(`Command handler already registered: ${handler.commandType}`);
    }

    this.#handlers.set(
      handler.commandType,
      handler as CommandHandler<unknown>
    );
  }

  async execute<TPayload>(
    state: Readonly<ProjectState>,
    command: CommandEnvelope<TPayload>
  ): Promise<ExecuteResult> {
    const envelopeDiagnostics = validateEnvelope(
      state,
      command as CommandEnvelope
    );

    const handler = this.#handlers.get(command.commandType);
    if (handler === undefined) {
      envelopeDiagnostics.push(error(
        "COMMAND_HANDLER_NOT_FOUND",
        `No command handler is registered for ${command.commandType}.`,
        "commandType"
      ));
    }

    if (envelopeDiagnostics.some((item) => item.severity === "error")) {
      return {
        ok: false,
        state: state as ProjectState,
        diagnostics: envelopeDiagnostics,
      };
    }

    const typedHandler = handler as CommandHandler<TPayload>;
    const handlerDiagnostics = typedHandler.validate(state, command);
    if (handlerDiagnostics.some((item) => item.severity === "error")) {
      return {
        ok: false,
        state: state as ProjectState,
        diagnostics: handlerDiagnostics,
      };
    }

    const draft = cloneState(state);
    let outcome: MutationOutcome;

    try {
      outcome = typedHandler.apply(draft, command);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        state: state as ProjectState,
        diagnostics: [
          error(
            "COMMAND_APPLY_FAILED",
            `The command failed atomically: ${message}`
          ),
        ],
      };
    }

    draft.appliedCommandIds.push(command.commandId);
    draft.lastClientSequenceByClient[command.clientId] = command.clientSequence;

    const operation = await makeOperation(
      command,
      draft.structureEpoch,
      outcome.operationPayload
    );

    const inverse = outcome.inversePayload === undefined
      ? undefined
      : await makeOperation(
          command,
          draft.structureEpoch,
          outcome.inversePayload,
          operation.operationId
        );

    return {
      ok: true,
      state: draft,
      result: {
        operation,
        ...(inverse === undefined ? {} : { inverse }),
        dirtyAssets: [...(outcome.dirtyAssets ?? [])],
        dirtyRegions: [...(outcome.dirtyRegions ?? [])],
        buildInvalidations: [...(outcome.buildInvalidations ?? [])],
        memoryDeltaBytes: outcome.memoryDeltaBytes ?? 0,
        warnings: [
          ...handlerDiagnostics.filter((item) => item.severity !== "error"),
          ...(outcome.warnings ?? []),
        ],
      },
    };
  }
}
