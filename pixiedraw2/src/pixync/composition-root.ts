/// <reference lib="dom" />

/** Authenticated production composition root for Draw2 PiXYNC. */
import type { CommandResult, ProjectState } from "../draw2-core.ts";
import type { AudioJournalEntry } from "../audio/audio-200/contracts.ts";
import type {
  PixyncAggregateAdapter,
  PixyncOperationDraft,
} from "./contracts.ts";
import {
  PixyncDurableJournal,
  type PixyncSnapshotPersistencePort,
} from "./durability.ts";
import { PixyncDurableTransportCoordinator } from "./durable-transport.ts";
import { PixyncOrderKeeper } from "./in-memory.ts";
import {
  type PixyncAggregateInvalidation,
  type PixyncAudioHydrationPort,
  type PixyncGameHydrationPort,
  PixyncLazyAggregateSync,
} from "./lazy-aggregate-sync.ts";
import {
  createPixyncSupabaseSdkPort,
  type PixyncSupabaseSdkClient,
} from "./supabase-sdk-port.ts";
import { PixyncSupabaseProvider } from "./supabase-provider.ts";
import {
  type PixyncTransportAck,
  PixyncTransportAdapter,
  type PixyncTransportBinding,
  type PixyncTransportPresenceDraft,
  type PixyncTransportPresenceEvent,
  type PixyncTransportStatus,
} from "./transport.ts";

export const PIXYNC_DRAW2_PRODUCTION_COMPOSITION_ROOT_AVAILABLE = true;

export interface PixyncProductionTransportPort {
  readonly binding: PixyncTransportBinding | undefined;
  submit(draft: PixyncOperationDraft): Promise<PixyncTransportAck>;
  snapshot(): ReturnType<PixyncOrderKeeper["snapshot"]>;
}

export interface PixyncProductionProducts {
  readonly adapters: readonly PixyncAggregateAdapter[];
  submitDraw?(detail: {
    readonly result: CommandResult;
    readonly nextState: ProjectState;
    readonly baseStructureEpoch: number;
  }): Promise<unknown>;
  submitAudio?(entry: AudioJournalEntry): Promise<unknown>;
  submitGameEditor?(detail: unknown): Promise<unknown>;
}

export interface PixyncProductionCompositionOptions {
  readonly projectId: string;
  readonly clientId: string;
  readonly sessionGeneration: number;
  readonly workerId: string;
  readonly supabase: PixyncSupabaseSdkClient;
  readonly persistence: PixyncSnapshotPersistencePort;
  readonly audioHydration: PixyncAudioHydrationPort;
  readonly gameHydration: PixyncGameHydrationPort;
  readonly eventTarget?: EventTarget;
  readonly createProducts: (input: {
    readonly transport: PixyncProductionTransportPort;
    readonly onInvalidation: (notice: PixyncAggregateInvalidation) => void;
  }) => PixyncProductionProducts;
  readonly presence?: PixyncTransportPresenceDraft;
  readonly onPresence?: (
    event: PixyncTransportPresenceEvent,
  ) => void | Promise<void>;
  readonly onStatus?: (status: PixyncTransportStatus) => void;
  readonly onError?: (error: unknown) => void;
}

function customDetail<T>(event: Event): T | undefined {
  return (event as CustomEvent<T>).detail;
}

export class PixyncProductionCompositionRoot {
  readonly #options: PixyncProductionCompositionOptions;
  readonly #eventTarget: EventTarget;
  readonly #transport: PixyncTransportAdapter;
  readonly #coordinator: PixyncDurableTransportCoordinator;
  readonly #lazy: PixyncLazyAggregateSync;
  readonly #products: PixyncProductionProducts;
  #connected = false;

  readonly #drawCommit = (event: Event): void => {
    const detail = customDetail<
      {
        result: CommandResult;
        nextState: ProjectState;
        baseStructureEpoch: number;
      }
    >(event);
    if (detail !== undefined && this.#products.submitDraw !== undefined) {
      void this.#products.submitDraw(detail).catch((error) =>
        this.#report(error)
      );
    }
  };
  readonly #audioCommit = (event: Event): void => {
    const entry = customDetail<{ readonly entry?: AudioJournalEntry }>(event)
      ?.entry;
    if (entry !== undefined && this.#products.submitAudio !== undefined) {
      void this.#products.submitAudio(entry).catch((error) =>
        this.#report(error)
      );
    }
  };
  readonly #gameCommit = (event: Event): void => {
    const detail = customDetail<unknown>(event);
    if (detail !== undefined && this.#products.submitGameEditor !== undefined) {
      void this.#products.submitGameEditor(detail).catch((error) =>
        this.#report(error)
      );
    }
  };
  readonly #audioCatalog = (): void => {
    void this.#lazy.demandAudio("DRAW_AUDIO_LANE").catch((error) =>
      this.#report(error)
    );
  };
  readonly #audioPlayback = (event: Event): void => {
    if (customDetail<{ readonly playing?: boolean }>(event)?.playing === true) {
      void this.#lazy.demandAudio("DRAW_PLAYBACK").catch((error) =>
        this.#report(error)
      );
    } else this.#lazy.releaseAudio("DRAW_PLAYBACK");
  };
  readonly #audioExport = (event: Event): void => {
    if (customDetail<{ readonly active?: boolean }>(event)?.active === true) {
      void this.#lazy.demandAudio("DRAW_EXPORT").catch((error) =>
        this.#report(error)
      );
    } else this.#lazy.releaseAudio("DRAW_EXPORT");
  };
  readonly #gameCatalog = (): void => {
    void this.#lazy.demandGame("GAME_CATALOG").catch((error) =>
      this.#report(error)
    );
  };
  readonly #gameEditor = (event: Event): void => {
    if (customDetail<{ readonly active?: boolean }>(event)?.active === true) {
      void this.#lazy.demandGame("GAME_EDITOR").catch((error) =>
        this.#report(error)
      );
    } else this.#lazy.releaseGame("GAME_EDITOR");
  };
  readonly #gameBuild = (event: Event): void => {
    if (customDetail<{ readonly active?: boolean }>(event)?.active === true) {
      void this.#lazy.demandGame("GAME_BUILD").catch((error) =>
        this.#report(error)
      );
    } else this.#lazy.releaseGame("GAME_BUILD");
  };

  private constructor(input: {
    options: PixyncProductionCompositionOptions;
    transport: PixyncTransportAdapter;
    coordinator: PixyncDurableTransportCoordinator;
    lazy: PixyncLazyAggregateSync;
    products: PixyncProductionProducts;
  }) {
    this.#options = input.options;
    this.#eventTarget = input.options.eventTarget ?? globalThis;
    this.#transport = input.transport;
    this.#coordinator = input.coordinator;
    this.#lazy = input.lazy;
    this.#products = input.products;
  }

  static async create(
    options: PixyncProductionCompositionOptions,
  ): Promise<PixyncProductionCompositionRoot> {
    const transport = new PixyncTransportAdapter(
      new PixyncSupabaseProvider({
        port: createPixyncSupabaseSdkPort(options.supabase),
      }),
    );
    const journal = await PixyncDurableJournal.open(
      options.projectId,
      options.persistence,
    );
    let keeper!: PixyncOrderKeeper;
    let coordinator!: PixyncDurableTransportCoordinator;
    const lazy = new PixyncLazyAggregateSync(
      options.projectId,
      options.sessionGeneration,
      options.audioHydration,
      options.gameHydration,
    );
    const productTransport: PixyncProductionTransportPort = {
      get binding() {
        return transport.binding;
      },
      submit: (draft) => coordinator.submit(draft),
      snapshot: () => keeper.snapshot(),
    };
    const products = options.createProducts({
      transport: productTransport,
      onInvalidation: (notice) => lazy.receive(notice),
    });
    const aggregates = new Set(
      products.adapters.map((adapter) => adapter.aggregate),
    );
    if (
      products.adapters.length !== 3 || aggregates.size !== 3 ||
      !aggregates.has("draw") || !aggregates.has("audio") ||
      !aggregates.has("game")
    ) {
      throw new Error(
        "Production PiXYNC requires one Draw, Audio, and Game adapter.",
      );
    }
    keeper = new PixyncOrderKeeper({
      projectId: options.projectId,
      adapters: products.adapters,
      initialState: journal.orderKeeperInitialState(),
    });
    coordinator = new PixyncDurableTransportCoordinator({
      journal,
      transport,
      orderKeeper: keeper,
      workerId: options.workerId,
    });
    return new PixyncProductionCompositionRoot({
      options,
      transport,
      coordinator,
      lazy,
      products,
    });
  }

  get binding(): PixyncTransportBinding | undefined {
    return this.#transport.binding;
  }

  async publishPresence(
    presence: PixyncTransportPresenceDraft,
  ): Promise<void> {
    if (!this.#connected) {
      throw new Error("Production PiXYNC is not connected.");
    }
    await this.#coordinator.publishPresence(presence);
  }

  async connect(): Promise<void> {
    if (this.#connected) return;
    try {
      await this.#coordinator.connect({
        projectId: this.#options.projectId,
        clientId: this.#options.clientId,
        sessionGeneration: this.#options.sessionGeneration,
        ...(this.#options.onStatus === undefined
          ? {}
          : { onStatus: this.#options.onStatus }),
        ...(this.#options.presence === undefined
          ? {}
          : { presence: this.#options.presence }),
        ...(this.#options.onPresence === undefined
          ? {}
          : { onPresence: this.#options.onPresence }),
        ...(this.#options.onError === undefined
          ? {}
          : { onCatchUpError: this.#options.onError }),
      });
      await this.#coordinator.reconcile();
      await this.#coordinator.catchUp();
      const binding = this.#transport.binding;
      if (binding === undefined) {
        throw new Error("Authenticated PiXYNC binding is unavailable.");
      }
      this.#eventTarget.dispatchEvent(
        new CustomEvent("draw2:pixync-binding", {
          detail: {
            projectId: binding.projectId,
            actorId: binding.actorId,
            clientId: binding.clientId,
            role: binding.role,
          },
        }),
      );
      this.#installEvents();
      this.#connected = true;
    } catch (error) {
      this.#removeEvents();
      this.#lazy.dispose();
      this.#connected = false;
      await this.#coordinator.close("connect-failed").catch(() => undefined);
      throw error;
    }
  }

  async close(reason = "closed"): Promise<void> {
    this.#removeEvents();
    this.#lazy.dispose();
    this.#connected = false;
    await this.#coordinator.close(reason);
  }

  #report(error: unknown): void {
    this.#options.onError?.(error);
  }

  #installEvents(): void {
    this.#eventTarget.addEventListener(
      "draw2:raster-operation-committed",
      this.#drawCommit,
    );
    this.#eventTarget.addEventListener(
      "draw2:audio-journal-committed",
      this.#audioCommit,
    );
    this.#eventTarget.addEventListener(
      "draw2:game-editor-committed",
      this.#gameCommit,
    );
    this.#eventTarget.addEventListener(
      "draw2:audio-catalog-request",
      this.#audioCatalog,
    );
    this.#eventTarget.addEventListener(
      "draw2:audio-reference-playback",
      this.#audioPlayback,
    );
    this.#eventTarget.addEventListener(
      "draw2:audio-export-demand",
      this.#audioExport,
    );
    this.#eventTarget.addEventListener(
      "draw2:game-catalog-request",
      this.#gameCatalog,
    );
    this.#eventTarget.addEventListener(
      "draw2:game-editor-demand",
      this.#gameEditor,
    );
    this.#eventTarget.addEventListener(
      "draw2:game-build-demand",
      this.#gameBuild,
    );
  }

  #removeEvents(): void {
    this.#eventTarget.removeEventListener(
      "draw2:raster-operation-committed",
      this.#drawCommit,
    );
    this.#eventTarget.removeEventListener(
      "draw2:audio-journal-committed",
      this.#audioCommit,
    );
    this.#eventTarget.removeEventListener(
      "draw2:game-editor-committed",
      this.#gameCommit,
    );
    this.#eventTarget.removeEventListener(
      "draw2:audio-catalog-request",
      this.#audioCatalog,
    );
    this.#eventTarget.removeEventListener(
      "draw2:audio-reference-playback",
      this.#audioPlayback,
    );
    this.#eventTarget.removeEventListener(
      "draw2:audio-export-demand",
      this.#audioExport,
    );
    this.#eventTarget.removeEventListener(
      "draw2:game-catalog-request",
      this.#gameCatalog,
    );
    this.#eventTarget.removeEventListener(
      "draw2:game-editor-demand",
      this.#gameEditor,
    );
    this.#eventTarget.removeEventListener(
      "draw2:game-build-demand",
      this.#gameBuild,
    );
  }
}
