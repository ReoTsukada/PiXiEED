/** Product-safe Game boundary with metadata-only cross-mode invalidations. */
import type { GameProject, JournalCommand } from "../game/game-300/core.ts";
import {
  createGameOperationDraft,
  createGamePixyncAdapter,
  type GameApplyReceipt,
  type GameCanonicalApplyPort,
  type GameCurrentRevision,
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

export class PixyncGameProductBridgeError extends Error {
  constructor(
    readonly code:
      | "SESSION_UNAVAILABLE"
      | "ROLE_FORBIDDEN"
      | "PROJECT_MISMATCH"
      | "HISTORY_MUTATION_FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "PixyncGameProductBridgeError";
  }
}

export interface PixyncGameProductSnapshot extends GameCurrentRevision {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly appliedCommandIds: readonly string[];
}

export interface PixyncGameProductStatePort {
  readonly preservesLocalHistory: true;
  current(): PixyncGameProductSnapshot;
  resolveCanonicalRevision(
    afterHash: string,
    revisionId: string,
  ): Promise<GameProject | undefined>;
  appendRemoteJournalCommand(
    input: {
      readonly next: GameProject;
      readonly commandId: string;
      readonly operation: Parameters<GameCanonicalApplyPort["appendJournalCommand"]>[0]["operation"];
    },
  ): Promise<GameApplyReceipt>;
}

export interface PixyncGameProductTransportPort {
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

function gameChangedAssetIds(project: GameProject): readonly string[] {
  const ids = new Set<string>([`game-project:${String(project.projectId)}`]);
  for (const scene of project.scenes) ids.add(`game-scene:${String(scene.sceneId)}`);
  for (const prefab of project.prefabs) ids.add(`game-prefab:${String(prefab.prefabId)}`);
  for (const dependency of project.dependencies) {
    ids.add(`game-dependency:${String(dependency.dependencyId)}`);
  }
  return [...ids].slice(0, 64);
}

function invalidation(
  operation: PixyncTransportAck["operation"],
  binding: PixyncTransportBinding,
  project: GameProject,
): PixyncAggregateInvalidation {
  const ids = gameChangedAssetIds(project);
  const expectedCount = 1 + project.scenes.length + project.prefabs.length +
    project.dependencies.length;
  return {
    projectId: operation.projectId,
    sessionGeneration: binding.sessionGeneration,
    aggregate: "game",
    operationId: operation.operationId,
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision,
    changedAssetIds: ids,
    fullRefresh: expectedCount > ids.length,
  };
}

export class PixyncGameProductBridge {
  readonly adapter: PixyncAggregateAdapter;
  readonly #transport: PixyncGameProductTransportPort;
  readonly #state: PixyncGameProductStatePort;
  readonly #onInvalidation: (value: PixyncAggregateInvalidation) => void;

  constructor(options: {
    readonly transport: PixyncGameProductTransportPort;
    readonly state: PixyncGameProductStatePort;
    readonly onInvalidation: (value: PixyncAggregateInvalidation) => void;
  }) {
    this.#transport = options.transport;
    this.#state = options.state;
    this.#onInvalidation = options.onInvalidation;
    const canonicalPort: GameCanonicalApplyPort = {
      preservesLocalHistory: true,
      current: () => this.#state.current(),
      resolveCanonicalRevision: (hash, revisionId) =>
        this.#state.resolveCanonicalRevision(hash, revisionId),
      appendJournalCommand: async (input) => {
        const before = this.#state.current();
        const receipt = await this.#state.appendRemoteJournalCommand(input);
        const after = this.#state.current();
        if (
          before.undoDepth !== after.undoDepth ||
          before.redoDepth !== after.redoDepth
        ) {
          throw new PixyncGameProductBridgeError(
            "HISTORY_MUTATION_FORBIDDEN",
            "Remote Game apply changed local Undo/Redo history.",
          );
        }
        return receipt;
      },
    };
    const canonical = createGamePixyncAdapter(canonicalPort);
    this.adapter = {
      aggregate: "game",
      apply: async (operation, context) => {
        const binding = this.#requireBinding();
        if (this.#state.current().appliedCommandIds.includes(operation.operationId)) {
          this.#onInvalidation(invalidation(operation, binding, await this.#resolveOperationProject(operation)));
          return;
        }
        await canonical.apply(operation, context);
        this.#onInvalidation(invalidation(operation, binding, await this.#resolveOperationProject(operation)));
      },
    };
  }

  async submitLocal(command: JournalCommand): Promise<PixyncTransportAck> {
    const binding = this.#requireBinding();
    if (binding.role === "viewer") {
      throw new PixyncGameProductBridgeError(
        "ROLE_FORBIDDEN",
        "Viewer sessions cannot submit Game operations.",
      );
    }
    if (String(command.after.projectId) !== binding.projectId) {
      throw new PixyncGameProductBridgeError(
        "PROJECT_MISMATCH",
        "Game state does not belong to the authenticated PiXYNC project.",
      );
    }
    const revisions = this.#transport.snapshot();
    if (revisions.projectId !== binding.projectId) {
      throw new PixyncGameProductBridgeError(
        "PROJECT_MISMATCH",
        "PiXYNC revision state belongs to another project.",
      );
    }
    const expectedIdentity = {
      operationId: String(command.commandId),
      projectId: binding.projectId,
      actorId: binding.actorId,
      clientId: binding.clientId,
      clientSequence: command.sequence,
    };
    const draft = await createGameOperationDraft({
      command,
      identity: {
        ...expectedIdentity,
        baseProjectRevision: revisions.projectRevision,
        aggregateRevision: revisions.aggregateRevisions.game,
      },
      expectedIdentity,
    });
    const ack = await this.#transport.submit(draft);
    this.#onInvalidation(invalidation(ack.operation, binding, command.after));
    return ack;
  }

  #requireBinding(): PixyncTransportBinding {
    const binding = this.#transport.binding;
    if (binding === undefined) {
      throw new PixyncGameProductBridgeError(
        "SESSION_UNAVAILABLE",
        "An authenticated PiXYNC session is required.",
      );
    }
    return binding;
  }

  async #resolveOperationProject(
    operation: PixyncTransportAck["operation"],
  ): Promise<GameProject> {
    const payload = operation.payload as Readonly<Record<string, unknown>>;
    const revision = payload.revision as Readonly<Record<string, unknown>>;
    const project = await this.#state.resolveCanonicalRevision(
      String(payload.afterHash),
      String(revision.revisionId),
    );
    if (project === undefined) {
      throw new PixyncGameProductBridgeError(
        "PROJECT_MISMATCH",
        "Canonical Game revision is unavailable after apply.",
      );
    }
    return project;
  }
}
