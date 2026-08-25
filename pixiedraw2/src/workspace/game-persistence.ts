/// <reference lib="dom" />

/** Independent Game editor subdocument persistence for the local workspace. */

import { sha256Hex } from "../draw2-core.ts";
import { createGameProject, type GameProject } from "../game/game-300/core.ts";

export const GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION =
  "GAME_EDITOR_PERSISTENCE_V1" as const;
export const GAME_EDITOR_PERSISTENCE_DB_NAME =
  "pixiedraw2-game-subdocuments" as const;
export const GAME_EDITOR_PERSISTENCE_DB_VERSION = 1 as const;
export const GAME_EDITOR_PERSISTENCE_STORE_NAME = "projects" as const;

export interface GameEditorTrack {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly filled: readonly number[];
}

/** Metadata-only cross-mode reference; Draw/Audio bytes remain owned by their module. */
export interface GameEditorBinding {
  readonly trackId: string;
  readonly kind: "DRAW" | "AUDIO";
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly mode: "LIVE" | "PINNED";
  readonly label: string;
}

export interface GameEditorPersistenceRecord {
  readonly schemaVersion: typeof GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION;
  readonly projectId: string;
  readonly revision: number;
  readonly savedAt: string;
  readonly stateHash: string;
  readonly tracks: readonly GameEditorTrack[];
  readonly bindings?: readonly GameEditorBinding[];
  /** Exact PiXYNC canonical checkpoint; omitted by legacy/local-only records. */
  readonly canonicalProject?: GameProject;
  readonly appliedCommandIds?: readonly string[];
}

export interface GameEditorPersistenceSaveResult {
  readonly ok: boolean;
  readonly stale: boolean;
}

export interface GameEditorPersistenceStore {
  readonly available: boolean;
  load(projectId: string): Promise<GameEditorPersistenceRecord | null>;
  save(
    record: GameEditorPersistenceRecord,
  ): Promise<GameEditorPersistenceSaveResult>;
  clear(projectId: string): Promise<boolean>;
}

export async function createGameEditorPersistenceRecord(
  projectId: string,
  tracks: readonly GameEditorTrack[],
  revision: number,
  savedAt = new Date().toISOString(),
  canonical?: {
    readonly project: GameProject;
    readonly appliedCommandIds: readonly string[];
  },
  bindings: readonly GameEditorBinding[] = [],
): Promise<GameEditorPersistenceRecord> {
  const normalizedTracks = tracks.map((track) => ({
    id: track.id,
    label: track.label,
    kind: track.kind,
    filled: [...track.filled],
  }));
  const body = {
    schemaVersion: GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION,
    projectId,
    revision,
    savedAt,
    tracks: normalizedTracks,
    bindings: bindings.map((binding) => ({ ...binding })),
    ...(canonical === undefined ? {} : {
      canonicalProject: canonical.project,
      appliedCommandIds: [...canonical.appliedCommandIds],
    }),
  };
  return { ...body, stateHash: await sha256Hex(body) };
}

export async function validateGameEditorPersistenceRecord(
  record: GameEditorPersistenceRecord,
): Promise<boolean> {
  if (
    record.schemaVersion !== GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION ||
    typeof record.projectId !== "string" ||
    !Number.isSafeInteger(record.revision) || record.revision < 0 ||
    typeof record.savedAt !== "string" || !Array.isArray(record.tracks)
  ) return false;
  const expected = await sha256Hex({
    schemaVersion: record.schemaVersion,
    projectId: record.projectId,
    revision: record.revision,
    savedAt: record.savedAt,
    tracks: record.tracks,
    ...(record.bindings === undefined ? {} : { bindings: record.bindings }),
    ...(record.canonicalProject === undefined
      ? {}
      : { canonicalProject: record.canonicalProject }),
    ...(record.appliedCommandIds === undefined
      ? {}
      : { appliedCommandIds: record.appliedCommandIds }),
  });
  if (record.stateHash !== expected) return false;
  if (record.canonicalProject !== undefined) {
    try {
      const candidate = record.canonicalProject;
      if (String(candidate.projectId) !== record.projectId) return false;
      const { snapshotHash, ...revision } = candidate.revision;
      const verified = await createGameProject(
        { ...candidate, revision },
        {
          projectId: candidate.projectId,
          ownerId: candidate.ownerId,
          revisionId: candidate.revision.revisionId,
        },
      );
      if (verified.revision.snapshotHash !== snapshotHash) return false;
      const canonicalTracks = candidate.editorTimeline?.tracks.map((track) => ({
        id: track.trackId,
        label: track.label,
        kind: track.kind,
        filled: [...track.activeFrames],
      })) ?? [];
      if (await sha256Hex(canonicalTracks) !== await sha256Hex(record.tracks)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  if (
    record.bindings !== undefined &&
    (!Array.isArray(record.bindings) || record.bindings.some((binding) =>
      binding === null || typeof binding !== "object" ||
      typeof binding.trackId !== "string" ||
      (binding.kind !== "DRAW" && binding.kind !== "AUDIO") ||
      typeof binding.assetId !== "string" ||
      typeof binding.revisionId !== "string" ||
      !/^[a-f0-9]{64}$/u.test(binding.contentHash) ||
      (binding.mode !== "LIVE" && binding.mode !== "PINNED") ||
      typeof binding.label !== "string"
    ))
  ) return false;
  return (
    (record.appliedCommandIds === undefined ||
      (Array.isArray(record.appliedCommandIds) &&
        record.appliedCommandIds.every((id) => typeof id === "string"))) &&
    record.tracks.every((track) =>
      track !== null && typeof track === "object" &&
      typeof track.id === "string" && typeof track.label === "string" &&
      typeof track.kind === "string" && Array.isArray(track.filled) &&
      track.filled.every((frame: number) =>
        Number.isSafeInteger(frame) && frame >= 0
      )
    )
  );
}

function isNewer(
  incoming: GameEditorPersistenceRecord,
  current: GameEditorPersistenceRecord | undefined,
): boolean {
  if (current === undefined) return true;
  if (incoming.revision !== current.revision) {
    return incoming.revision > current.revision;
  }
  return incoming.savedAt >= current.savedAt;
}

function openGameDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(name, GAME_EDITOR_PERSISTENCE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (
        !request.result.objectStoreNames.contains(
          GAME_EDITOR_PERSISTENCE_STORE_NAME,
        )
      ) {
        request.result.createObjectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME, {
          keyPath: "projectId",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Game DB open failed."));
    request.onblocked = () => reject(new Error("Game DB open was blocked."));
  });
}

export function createIndexedDbGameEditorPersistenceStore(
  databaseName = GAME_EDITOR_PERSISTENCE_DB_NAME,
): GameEditorPersistenceStore {
  const available = typeof indexedDB !== "undefined";
  return {
    available,
    async load(projectId) {
      if (!available) return null;
      try {
        const database = await openGameDatabase(databaseName);
        return await new Promise<GameEditorPersistenceRecord | null>(
          (resolve) => {
            const request = database.transaction(
              GAME_EDITOR_PERSISTENCE_STORE_NAME,
              "readonly",
            ).objectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME).get(projectId);
            request.onsuccess = () => {
              database.close();
              resolve(
                (request.result as GameEditorPersistenceRecord | undefined) ??
                  null,
              );
            };
            request.onerror = () => {
              database.close();
              resolve(null);
            };
          },
        );
      } catch {
        return null;
      }
    },
    async save(record) {
      if (!available) return { ok: false, stale: false };
      try {
        const database = await openGameDatabase(databaseName);
        return await new Promise<GameEditorPersistenceSaveResult>((resolve) => {
          let stale = false;
          const transaction = database.transaction(
            GAME_EDITOR_PERSISTENCE_STORE_NAME,
            "readwrite",
          );
          const store = transaction.objectStore(
            GAME_EDITOR_PERSISTENCE_STORE_NAME,
          );
          const read = store.get(record.projectId);
          read.onsuccess = () => {
            const current = read.result as
              | GameEditorPersistenceRecord
              | undefined;
            if (isNewer(record, current)) store.put(record);
            else stale = true;
          };
          read.onerror = () => transaction.abort();
          transaction.oncomplete = () => {
            database.close();
            resolve({ ok: true, stale });
          };
          transaction.onerror = () => {
            database.close();
            resolve({ ok: false, stale: false });
          };
          transaction.onabort = () => {
            database.close();
            resolve({ ok: false, stale: false });
          };
        });
      } catch {
        return { ok: false, stale: false };
      }
    },
    async clear(projectId) {
      if (!available) return false;
      try {
        const database = await openGameDatabase(databaseName);
        return await new Promise<boolean>((resolve) => {
          const transaction = database.transaction(
            GAME_EDITOR_PERSISTENCE_STORE_NAME,
            "readwrite",
          );
          transaction.objectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME).delete(
            projectId,
          );
          transaction.oncomplete = () => {
            database.close();
            resolve(true);
          };
          transaction.onerror = () => {
            database.close();
            resolve(false);
          };
          transaction.onabort = () => {
            database.close();
            resolve(false);
          };
        });
      } catch {
        return false;
      }
    },
  };
}

export function createMemoryGameEditorPersistenceStore(): GameEditorPersistenceStore {
  const records = new Map<string, GameEditorPersistenceRecord>();
  return {
    available: true,
    async load(projectId) {
      return records.get(projectId) ?? null;
    },
    async save(record) {
      const current = records.get(record.projectId);
      if (!isNewer(record, current)) return { ok: true, stale: true };
      records.set(record.projectId, record);
      return { ok: true, stale: false };
    },
    async clear(projectId) {
      records.delete(projectId);
      return true;
    },
  };
}
