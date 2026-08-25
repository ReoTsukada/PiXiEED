/** Lightweight cross-aggregate invalidation and demand-driven hydration. */
import type { PixyncAggregate } from "./contracts.ts";

const MAX_CHANGED_IDS = 64;

export interface PixyncAggregateInvalidation {
  readonly projectId: string;
  readonly sessionGeneration: number;
  readonly aggregate: PixyncAggregate;
  readonly operationId: string;
  readonly projectRevision: number;
  readonly aggregateRevision: number;
  /** Metadata only. Audio bytes, snapshots, and command payloads are forbidden. */
  readonly changedAssetIds: readonly string[];
  readonly fullRefresh?: boolean;
}

export interface PixyncAudioHydrationRequest {
  readonly projectId: string;
  readonly minimumAudioRevision: number;
  readonly changedAssetIds: readonly string[];
  readonly fullRefresh: boolean;
  readonly signal: AbortSignal;
  readonly level: PixyncAudioHydrationLevel;
}

export interface PixyncAudioHydrationResult {
  readonly projectId: string;
  readonly audioRevision: number;
  readonly level: PixyncAudioHydrationLevel;
}

export interface PixyncAudioHydrationPort {
  hydrateAudio(
    request: PixyncAudioHydrationRequest,
  ): Promise<PixyncAudioHydrationResult>;
}

export type PixyncGameDemand = "GAME_CATALOG" | "GAME_EDITOR" | "GAME_BUILD";
export type PixyncGameHydrationLevel = "CATALOG" | "EDITOR" | "BUILD";

export interface PixyncGameHydrationRequest {
  readonly projectId: string;
  readonly minimumGameRevision: number;
  readonly changedAssetIds: readonly string[];
  readonly fullRefresh: boolean;
  readonly signal: AbortSignal;
  readonly level: PixyncGameHydrationLevel;
}

export interface PixyncGameHydrationResult {
  readonly projectId: string;
  readonly gameRevision: number;
  readonly level: PixyncGameHydrationLevel;
}

export interface PixyncGameHydrationPort {
  hydrateGame(
    request: PixyncGameHydrationRequest,
  ): Promise<PixyncGameHydrationResult>;
}

export type PixyncAudioDemand =
  | "DRAW_AUDIO_LANE"
  | "DRAW_PLAYBACK"
  | "DRAW_EXPORT"
  | "AUDIO_WORKSPACE";

export type PixyncAudioHydrationLevel = "CATALOG" | "PLAYBACK" | "EXPORT";

const AUDIO_LEVEL_RANK: Readonly<Record<PixyncAudioHydrationLevel, number>> = {
  CATALOG: 0,
  PLAYBACK: 1,
  EXPORT: 2,
};
const GAME_LEVEL_RANK: Readonly<Record<PixyncGameHydrationLevel, number>> = {
  CATALOG: 0,
  EDITOR: 1,
  BUILD: 2,
};

function levelForDemand(demand: PixyncAudioDemand): PixyncAudioHydrationLevel {
  if (demand === "DRAW_EXPORT") return "EXPORT";
  if (demand === "DRAW_PLAYBACK") return "PLAYBACK";
  return "CATALOG";
}

function gameLevelForDemand(demand: PixyncGameDemand): PixyncGameHydrationLevel {
  if (demand === "GAME_BUILD") return "BUILD";
  if (demand === "GAME_EDITOR") return "EDITOR";
  return "CATALOG";
}

export class PixyncLazyAggregateSyncError extends Error {
  constructor(
    readonly code:
      | "INVALID_NOTICE"
      | "PROJECT_MISMATCH"
      | "SESSION_MISMATCH"
      | "HYDRATION_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "PixyncLazyAggregateSyncError";
  }
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizedIds(ids: readonly string[]): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of ids) {
    const id = value.trim();
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length === MAX_CHANGED_IDS) break;
  }
  return result;
}

export class PixyncLazyAggregateSync {
  readonly #projectId: string;
  readonly #sessionGeneration: number;
  readonly #port: PixyncAudioHydrationPort;
  readonly #gamePort: PixyncGameHydrationPort | undefined;
  readonly #audioDemand = new Set<PixyncAudioDemand>();
  #knownAudioRevision = 0;
  #hydratedAudioRevision = 0;
  #hydratedAudioLevel: PixyncAudioHydrationLevel | undefined;
  #pendingAudioAssetIds = new Map<string, number>();
  #fullAudioRefresh = false;
  #hydration: Promise<void> | undefined;
  #hydrationAbort: AbortController | undefined;
  #disposed = false;
  readonly #gameDemand = new Set<PixyncGameDemand>();
  #knownGameRevision = 0;
  #hydratedGameRevision = 0;
  #hydratedGameLevel: PixyncGameHydrationLevel | undefined;
  #pendingGameAssetIds = new Map<string, number>();
  #fullGameRefresh = false;
  #gameHydration: Promise<void> | undefined;
  #gameHydrationAbort: AbortController | undefined;

  constructor(
    projectId: string,
    sessionGeneration: number,
    port: PixyncAudioHydrationPort,
    gamePort?: PixyncGameHydrationPort,
  ) {
    if (projectId.trim().length === 0) {
      throw new PixyncLazyAggregateSyncError(
        "INVALID_NOTICE",
        "A project ID is required.",
      );
    }
    if (!Number.isSafeInteger(sessionGeneration) || sessionGeneration < 0) {
      throw new PixyncLazyAggregateSyncError(
        "INVALID_NOTICE",
        "A valid session generation is required.",
      );
    }
    this.#projectId = projectId;
    this.#sessionGeneration = sessionGeneration;
    this.#port = port;
    this.#gamePort = gamePort;
  }

  get audioRevision(): Readonly<{
    known: number;
    hydrated: number;
    demanded: boolean;
    level: PixyncAudioHydrationLevel | undefined;
  }> {
    return {
      known: this.#knownAudioRevision,
      hydrated: this.#hydratedAudioRevision,
      demanded: this.#audioDemand.size > 0,
      level: this.#hydratedAudioLevel,
    };
  }

  get gameRevision(): Readonly<{
    known: number;
    hydrated: number;
    demanded: boolean;
    level: PixyncGameHydrationLevel | undefined;
  }> {
    return {
      known: this.#knownGameRevision,
      hydrated: this.#hydratedGameRevision,
      demanded: this.#gameDemand.size > 0,
      level: this.#hydratedGameLevel,
    };
  }

  receive(invalidation: PixyncAggregateInvalidation): void {
    if (invalidation.projectId !== this.#projectId) {
      throw new PixyncLazyAggregateSyncError(
        "PROJECT_MISMATCH",
        "The invalidation belongs to another project.",
      );
    }
    if (invalidation.sessionGeneration !== this.#sessionGeneration) {
      throw new PixyncLazyAggregateSyncError(
        "SESSION_MISMATCH",
        "The invalidation belongs to another session generation.",
      );
    }
    if (
      invalidation.operationId.trim().length === 0 ||
      !validRevision(invalidation.projectRevision) ||
      !validRevision(invalidation.aggregateRevision)
    ) {
      throw new PixyncLazyAggregateSyncError(
        "INVALID_NOTICE",
        "The invalidation metadata is invalid.",
      );
    }
    if (invalidation.aggregate === "game") {
      if (invalidation.aggregateRevision <= this.#knownGameRevision) return;
      this.#knownGameRevision = invalidation.aggregateRevision;
      const ids = normalizedIds(invalidation.changedAssetIds);
      if (
        invalidation.fullRefresh === true ||
        invalidation.changedAssetIds.length > MAX_CHANGED_IDS
      ) {
        this.#fullGameRefresh = true;
        this.#pendingGameAssetIds.clear();
      } else if (!this.#fullGameRefresh) {
        for (const id of ids) {
          this.#pendingGameAssetIds.set(id, invalidation.aggregateRevision);
        }
      }
      if (this.#gameDemand.size > 0) void this.#scheduleGameHydration();
      return;
    }
    if (invalidation.aggregate !== "audio") return;
    if (invalidation.aggregateRevision <= this.#knownAudioRevision) return;
    this.#knownAudioRevision = invalidation.aggregateRevision;
    const ids = normalizedIds(invalidation.changedAssetIds);
    if (
      invalidation.fullRefresh === true ||
      invalidation.changedAssetIds.length > MAX_CHANGED_IDS
    ) {
      this.#fullAudioRefresh = true;
      this.#pendingAudioAssetIds.clear();
    } else if (!this.#fullAudioRefresh) {
      for (const id of ids) {
        this.#pendingAudioAssetIds.set(id, invalidation.aggregateRevision);
      }
    }
    if (this.#audioDemand.size > 0) void this.#scheduleAudioHydration();
  }

  async demandAudio(reason: PixyncAudioDemand): Promise<void> {
    this.#audioDemand.add(reason);
    await this.#scheduleAudioHydration();
  }

  releaseAudio(reason: PixyncAudioDemand): void {
    this.#audioDemand.delete(reason);
    if (this.#audioDemand.size === 0) this.#hydrationAbort?.abort();
  }

  async demandGame(reason: PixyncGameDemand): Promise<void> {
    if (this.#gamePort === undefined) return;
    this.#gameDemand.add(reason);
    await this.#scheduleGameHydration();
  }

  releaseGame(reason: PixyncGameDemand): void {
    this.#gameDemand.delete(reason);
    if (this.#gameDemand.size === 0) this.#gameHydrationAbort?.abort();
  }

  dispose(): void {
    this.#disposed = true;
    this.#audioDemand.clear();
    this.#hydrationAbort?.abort();
    this.#gameHydrationAbort?.abort();
    this.#gameDemand.clear();
    this.#pendingAudioAssetIds.clear();
    this.#pendingGameAssetIds.clear();
  }

  async settled(): Promise<void> {
    await this.#hydration;
    await this.#gameHydration;
  }

  #scheduleGameHydration(): Promise<void> {
    if (!this.#needsGameHydration()) return Promise.resolve();
    if (this.#gameHydration !== undefined) return this.#gameHydration;
    const hydration = this.#hydrateLatestGame();
    this.#gameHydration = hydration;
    void hydration.then(
      () => {
        if (this.#gameHydration === hydration) this.#gameHydration = undefined;
        if (this.#needsGameHydration()) void this.#scheduleGameHydration();
      },
      () => {
        if (this.#gameHydration === hydration) this.#gameHydration = undefined;
      },
    );
    return hydration;
  }

  async #hydrateLatestGame(): Promise<void> {
    while (this.#gameDemand.size > 0 && !this.#disposed) {
      const port = this.#gamePort;
      const level = this.#requiredGameLevel();
      if (port === undefined || level === undefined) return;
      if (
        this.#hydratedGameRevision >= this.#knownGameRevision &&
        this.#hydratedGameLevel !== undefined &&
        GAME_LEVEL_RANK[this.#hydratedGameLevel] >= GAME_LEVEL_RANK[level]
      ) return;
      const requestedRevision = this.#knownGameRevision;
      const fullRefresh = this.#fullGameRefresh;
      const changedAssetIds = fullRefresh ? [] : [
        ...this.#pendingGameAssetIds.entries(),
      ].filter(([, revision]) => revision <= requestedRevision)
        .map(([id]) => id).slice(0, MAX_CHANGED_IDS);
      const abort = new AbortController();
      this.#gameHydrationAbort = abort;
      const result = await port.hydrateGame({
        projectId: this.#projectId,
        minimumGameRevision: requestedRevision,
        changedAssetIds,
        fullRefresh,
        signal: abort.signal,
        level,
      });
      if (abort.signal.aborted || this.#disposed || this.#gameDemand.size === 0) return;
      if (
        result.projectId !== this.#projectId ||
        result.gameRevision < requestedRevision ||
        GAME_LEVEL_RANK[result.level] < GAME_LEVEL_RANK[level]
      ) {
        throw new PixyncLazyAggregateSyncError(
          "HYDRATION_MISMATCH",
          "Game hydration did not satisfy the authoritative revision and level.",
        );
      }
      this.#hydratedGameRevision = result.gameRevision;
      this.#hydratedGameLevel = result.level;
      this.#fullGameRefresh = false;
      for (const [id, revision] of this.#pendingGameAssetIds) {
        if (revision <= result.gameRevision) this.#pendingGameAssetIds.delete(id);
      }
    }
  }

  #scheduleAudioHydration(): Promise<void> {
    if (!this.#needsAudioHydration()) return Promise.resolve();
    if (this.#hydration !== undefined) return this.#hydration;
    const hydration = this.#hydrateLatest();
    this.#hydration = hydration;
    void hydration.then(
      () => {
        if (this.#hydration === hydration) this.#hydration = undefined;
        if (this.#needsAudioHydration()) void this.#scheduleAudioHydration();
      },
      () => {
        if (this.#hydration === hydration) this.#hydration = undefined;
      },
    );
    return hydration;
  }

  async #hydrateLatest(): Promise<void> {
    while (
      this.#audioDemand.size > 0 &&
      !this.#disposed
    ) {
      const level = this.#requiredAudioLevel();
      if (level === undefined) return;
      if (
        this.#hydratedAudioRevision >= this.#knownAudioRevision &&
        this.#hydratedAudioLevel !== undefined &&
        AUDIO_LEVEL_RANK[this.#hydratedAudioLevel] >= AUDIO_LEVEL_RANK[level]
      ) return;
      const requestedRevision = this.#knownAudioRevision;
      const fullRefresh = this.#fullAudioRefresh;
      const changedAssetIds = fullRefresh
        ? []
        : [...this.#pendingAudioAssetIds.entries()]
          .filter(([, revision]) => revision <= requestedRevision)
          .map(([id]) => id)
          .slice(0, MAX_CHANGED_IDS);
      const abort = new AbortController();
      this.#hydrationAbort = abort;
      const result = await this.#port.hydrateAudio({
        projectId: this.#projectId,
        minimumAudioRevision: requestedRevision,
        changedAssetIds,
        fullRefresh,
        signal: abort.signal,
        level,
      });
      if (
        abort.signal.aborted || this.#disposed || this.#audioDemand.size === 0
      ) {
        return;
      }
      if (
        result.projectId !== this.#projectId ||
        result.audioRevision < requestedRevision ||
        AUDIO_LEVEL_RANK[result.level] < AUDIO_LEVEL_RANK[level]
      ) {
        throw new PixyncLazyAggregateSyncError(
          "HYDRATION_MISMATCH",
          "Audio hydration did not return the requested canonical revision.",
        );
      }
      this.#hydratedAudioRevision = result.audioRevision;
      this.#hydratedAudioLevel = result.level;
      if (fullRefresh) {
        this.#fullAudioRefresh = false;
      } else {
        for (const id of changedAssetIds) {
          const revision = this.#pendingAudioAssetIds.get(id);
          if (revision !== undefined && revision <= requestedRevision) {
            this.#pendingAudioAssetIds.delete(id);
          }
        }
      }
      if (this.#hydrationAbort === abort) this.#hydrationAbort = undefined;
    }
  }

  #requiredAudioLevel(): PixyncAudioHydrationLevel | undefined {
    let selected: PixyncAudioHydrationLevel | undefined;
    for (const demand of this.#audioDemand) {
      const candidate = levelForDemand(demand);
      if (
        selected === undefined ||
        AUDIO_LEVEL_RANK[candidate] > AUDIO_LEVEL_RANK[selected]
      ) selected = candidate;
    }
    return selected;
  }

  #needsAudioHydration(): boolean {
    if (this.#disposed || this.#audioDemand.size === 0) return false;
    const required = this.#requiredAudioLevel();
    if (required === undefined) return false;
    return this.#hydratedAudioRevision < this.#knownAudioRevision ||
      this.#hydratedAudioLevel === undefined ||
      AUDIO_LEVEL_RANK[this.#hydratedAudioLevel] < AUDIO_LEVEL_RANK[required];
  }

  #requiredGameLevel(): PixyncGameHydrationLevel | undefined {
    let selected: PixyncGameHydrationLevel | undefined;
    for (const demand of this.#gameDemand) {
      const candidate = gameLevelForDemand(demand);
      if (
        selected === undefined ||
        GAME_LEVEL_RANK[candidate] > GAME_LEVEL_RANK[selected]
      ) selected = candidate;
    }
    return selected;
  }

  #needsGameHydration(): boolean {
    if (
      this.#disposed || this.#gamePort === undefined ||
      this.#gameDemand.size === 0
    ) return false;
    const required = this.#requiredGameLevel();
    if (required === undefined) return false;
    return this.#hydratedGameRevision < this.#knownGameRevision ||
      this.#hydratedGameLevel === undefined ||
      GAME_LEVEL_RANK[this.#hydratedGameLevel] < GAME_LEVEL_RANK[required];
  }
}
