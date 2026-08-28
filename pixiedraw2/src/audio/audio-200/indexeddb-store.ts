/// <reference lib="dom" />

/** Browser-only IndexedDB boundary for AUDIO-200 metadata persistence. */

import {
  AUDIO200_PERSISTENCE_DB_NAME,
  AUDIO200_PERSISTENCE_DB_VERSION,
  AUDIO200_PERSISTENCE_STORE_NAME,
  type AudioPersistenceSaveOptions,
  type AudioPersistenceStore,
  type AudioWorkspacePersistenceRecord,
} from "./persistence.ts";
import {
  asAudioProjectId,
  type Audio200Result,
  audioDiagnostic,
  audioFail,
  audioOk,
  type AudioProjectId,
} from "./contracts.ts";

interface IndexedDbPersistenceOptions {
  readonly databaseName?: string;
}

function hostFailure<T>(message: string, path: string): Audio200Result<T> {
  return audioFail(
    "AUDIO_HOST_BOUNDARY_INVALID",
    message,
    path,
    true,
  );
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(name, AUDIO200_PERSISTENCE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (
        !database.objectStoreNames.contains(AUDIO200_PERSISTENCE_STORE_NAME)
      ) {
        database.createObjectStore(AUDIO200_PERSISTENCE_STORE_NAME, {
          keyPath: "projectId",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB open failed."));
    request.onblocked = () => reject(new Error("IndexedDB open was blocked."));
  });
}

function isNewer(
  incoming: AudioWorkspacePersistenceRecord,
  current: unknown,
): boolean {
  if (current === null || typeof current !== "object") return true;
  const candidate = current as Record<string, unknown>;
  const checkpoint = candidate.checkpoint;
  const currentRevision = checkpoint !== null && typeof checkpoint === "object"
    ? (checkpoint as Record<string, unknown>).projectRevision
    : undefined;
  if (typeof currentRevision !== "number") return true;
  if (incoming.checkpoint.projectRevision !== currentRevision) {
    return incoming.checkpoint.projectRevision > currentRevision;
  }
  const currentHash = currentStateHash(current);
  if (currentHash !== null &&
    incoming.checkpoint.stateHash !== currentHash) return false;
  const currentSavedAt = candidate.savedAt;
  return typeof currentSavedAt !== "string" ||
    incoming.savedAt >= currentSavedAt;
}

function currentProjectRevision(current: unknown): number | undefined {
  if (current === null || typeof current !== "object") return undefined;
  const candidate = current as Record<string, unknown>;
  const checkpoint = candidate.checkpoint;
  if (checkpoint === null || typeof checkpoint !== "object") {
    return undefined;
  }
  const revision = (checkpoint as Record<string, unknown>).projectRevision;
  return typeof revision === "number" ? revision : undefined;
}

function currentStateHash(current: unknown): string | null {
  if (current === null || typeof current !== "object") return null;
  const checkpoint = (current as Record<string, unknown>).checkpoint;
  if (checkpoint === null || typeof checkpoint !== "object") return null;
  const hash = (checkpoint as Record<string, unknown>).stateHash;
  return typeof hash === "string" ? hash : null;
}

function matchesExpected(
  current: unknown,
  options: AudioPersistenceSaveOptions | undefined,
): boolean {
  if (options?.expectedProjectRevision !== undefined &&
    (currentProjectRevision(current) ?? 0) !==
      options.expectedProjectRevision) return false;
  if (options?.expectedStateHash !== undefined &&
    currentStateHash(current) !== options.expectedStateHash) return false;
  return true;
}

export function createIndexedDbAudioPersistenceStore(
  options: IndexedDbPersistenceOptions = {},
): AudioPersistenceStore {
  const databaseName = options.databaseName ?? AUDIO200_PERSISTENCE_DB_NAME;
  return {
    async load(projectId: AudioProjectId) {
      try {
        asAudioProjectId(projectId);
        const database = await openDatabase(databaseName);
        return await new Promise(
          (
            resolve: (
              value: Audio200Result<AudioWorkspacePersistenceRecord | null>,
            ) => void,
          ) => {
            const transaction = database.transaction(
              AUDIO200_PERSISTENCE_STORE_NAME,
              "readonly",
            );
            const request = transaction.objectStore(
              AUDIO200_PERSISTENCE_STORE_NAME,
            ).get(projectId);
            request.onsuccess = () => {
              database.close();
              resolve(audioOk(
                (request.result as
                  | AudioWorkspacePersistenceRecord
                  | undefined) ??
                  null,
              ));
            };
            request.onerror = () => {
              database.close();
              resolve(hostFailure(
                "IndexedDB project load failed.",
                "indexedDB.load",
              ));
            };
          },
        );
      } catch {
        return hostFailure("IndexedDB is unavailable.", "indexedDB.load");
      }
    },
    async save(record, options) {
      try {
        const database = await openDatabase(databaseName);
        return await new Promise(
          (resolve: (value: Audio200Result<true>) => void) => {
            let stale = false;
            const transaction = database.transaction(
              AUDIO200_PERSISTENCE_STORE_NAME,
              "readwrite",
            );
            const store = transaction.objectStore(
              AUDIO200_PERSISTENCE_STORE_NAME,
            );
            const read = store.get(record.projectId);
            read.onsuccess = () => {
              if (!matchesExpected(read.result, options)) {
                stale = true;
              } else if (isNewer(record, read.result)) {
                store.put(record);
              } else {
                stale = true;
              }
            };
            read.onerror = () => transaction.abort();
            transaction.oncomplete = () => {
              database.close();
              resolve(
                stale
                  ? audioOk(true, [
                    audioDiagnostic(
                      "AUDIO_STALE_PROJECT_REVISION",
                      "An older persistence write was ignored.",
                      "record.checkpoint.projectRevision",
                      true,
                    ),
                  ])
                  : audioOk(true),
              );
            };
            transaction.onerror = () => {
              database.close();
              resolve(hostFailure(
                "IndexedDB project save failed.",
                "indexedDB.save",
              ));
            };
            transaction.onabort = () => {
              database.close();
              resolve(hostFailure(
                "IndexedDB project save was aborted.",
                "indexedDB.save",
              ));
            };
          },
        );
      } catch {
        return hostFailure("IndexedDB is unavailable.", "indexedDB.save");
      }
    },
    async clear(projectId) {
      try {
        const database = await openDatabase(databaseName);
        return await new Promise(
          (resolve: (value: Audio200Result<true>) => void) => {
            const transaction = database.transaction(
              AUDIO200_PERSISTENCE_STORE_NAME,
              "readwrite",
            );
            transaction.objectStore(AUDIO200_PERSISTENCE_STORE_NAME).delete(
              projectId,
            );
            transaction.oncomplete = () => {
              database.close();
              resolve(audioOk(true));
            };
            transaction.onerror = () => {
              database.close();
              resolve(hostFailure(
                "IndexedDB project clear failed.",
                "indexedDB.clear",
              ));
            };
            transaction.onabort = () => {
              database.close();
              resolve(hostFailure(
                "IndexedDB project clear was aborted.",
                "indexedDB.clear",
              ));
            };
          },
        );
      } catch {
        return hostFailure("IndexedDB is unavailable.", "indexedDB.clear");
      }
    },
  };
}
