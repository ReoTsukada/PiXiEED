/// <reference lib="dom" />

/** Independent Game editor subdocument persistence for the local workspace. */

import { sha256Hex } from "../draw2-core.ts";
import {
  type BehaviorIR,
  createGameProject,
  type GameComponentState,
  type GameObjectRole,
  type GameProject,
} from "../game/game-300/core.ts";

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
  /** Game-owned object role; Draw/Audio source metadata never enters here. */
  readonly role?: GameObjectRole;
  /** Component configuration owned by Game and projected into the canonical Scene. */
  readonly components?: readonly GameComponentState[];
}

/**
 * Metadata-only cross-mode reference. Game may change placement, attachment,
 * or LIVE/PINNED mode; Draw/Audio bytes and source metadata remain owned by
 * their module and are intentionally absent from this record.
 */
export interface GameEditorBinding {
  readonly trackId: string;
  readonly kind: "DRAW" | "AUDIO";
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly mode: "LIVE" | "PINNED";
  readonly label: string;
}

function referenceOnlyBinding(binding: GameEditorBinding): GameEditorBinding {
  return {
    trackId: binding.trackId,
    kind: binding.kind,
    assetId: binding.assetId,
    revisionId: binding.revisionId,
    contentHash: binding.contentHash,
    mode: binding.mode,
    label: binding.label,
  };
}

function cloneComponents(
  components: readonly GameComponentState[],
): GameComponentState[] {
  return components.map((
    component,
  ) => ({ ...component } as GameComponentState));
}

function validEditorComponent(
  component: unknown,
): component is GameComponentState {
  if (
    component === null || typeof component !== "object" ||
    Array.isArray(component)
  ) return false;
  const value = component as Record<string, unknown>;
  if (typeof value.componentId !== "string" || typeof value.type !== "string") {
    return false;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.componentId)) {
    return false;
  }
  switch (value.type) {
    case "TRANSFORM":
      return ["x", "y", "rotation", "scaleX", "scaleY"].every((key) =>
        typeof value[key] === "number" && Number.isFinite(value[key])
      );
    case "SPRITE":
      return typeof value.visible === "boolean";
    case "AUDIO_SOURCE":
      return typeof value.loop === "boolean" &&
        typeof value.volume === "number" && Number.isFinite(value.volume) &&
        value.volume >= 0 && value.volume <= 1;
    case "TILEMAP":
      return typeof value.mapId === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.mapId) &&
        Number.isSafeInteger(value.tileSize) && Number(value.tileSize) > 0 &&
        typeof value.collisionEnabled === "boolean";
    case "COLLIDER":
      return ["BOX", "CIRCLE", "CAPSULE"].includes(String(value.shape)) &&
        ["DEFAULT", "WORLD", "PLAYER", "NPC", "SENSOR", "PROJECTILE"].includes(
          String(value.layer),
        ) &&
        ["width", "height", "radius"].every((key) =>
          typeof value[key] === "number" && Number.isFinite(value[key]) &&
          Number(value[key]) > 0
        ) && typeof value.isTrigger === "boolean" &&
        typeof value.enabled === "boolean";
    case "RIGIDBODY":
      return ["STATIC", "DYNAMIC", "KINEMATIC"].includes(
        String(value.bodyType),
      ) && typeof value.mass === "number" && Number.isFinite(value.mass) &&
        value.mass > 0 && typeof value.gravityScale === "number" &&
        Number.isFinite(value.gravityScale) &&
        typeof value.fixedRotation === "boolean" &&
        typeof value.enabled === "boolean";
    case "CHARACTER_CONTROLLER":
      return typeof value.moveSpeed === "number" &&
        Number.isFinite(value.moveSpeed) && value.moveSpeed > 0 &&
        typeof value.stepHeight === "number" &&
        Number.isFinite(value.stepHeight) && value.stepHeight >= 0 &&
        Number.isSafeInteger(value.fixedStep) && Number(value.fixedStep) > 0 &&
        typeof value.enabled === "boolean";
    case "CAMERA":
      return typeof value.active === "boolean" &&
        typeof value.zoom === "number" && Number.isFinite(value.zoom) &&
        value.zoom > 0;
    case "BEHAVIOR":
      return typeof value.enabled === "boolean";
    default:
      return false;
  }
}

const GAME_EDITOR_BINDING_KEYS = new Set([
  "trackId",
  "kind",
  "assetId",
  "revisionId",
  "contentHash",
  "mode",
  "label",
]);

export interface GameEditorPersistenceRecord {
  readonly schemaVersion: typeof GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION;
  readonly projectId: string;
  readonly revision: number;
  readonly savedAt: string;
  readonly stateHash: string;
  readonly tracks: readonly GameEditorTrack[];
  readonly bindings?: readonly GameEditorBinding[];
  /** Canonical no-code Behavior IR; source bytes are never persisted here. */
  readonly behaviors?: readonly BehaviorIR[];
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
  behaviors: readonly BehaviorIR[] = [],
): Promise<GameEditorPersistenceRecord> {
  const normalizedTracks = tracks.map((track) => ({
    id: track.id,
    label: track.label,
    kind: track.kind,
    filled: [...track.filled],
    ...(track.role === undefined ? {} : { role: track.role }),
    ...(track.components === undefined
      ? {}
      : { components: cloneComponents(track.components) }),
  }));
  const body = {
    schemaVersion: GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION,
    projectId,
    revision,
    savedAt,
    tracks: normalizedTracks,
    bindings: bindings.map(referenceOnlyBinding),
    behaviors: behaviors.map((behavior) => ({
      ...behavior,
      rules: behavior.rules.map((rule) => ({
        ...rule,
        trigger: { ...rule.trigger },
        conditions: rule.conditions.map((condition) => ({ ...condition })),
        actions: rule.actions.map((action) => ({ ...action })),
      })),
    })),
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
    ...(record.behaviors === undefined ? {} : { behaviors: record.behaviors }),
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
        ...(track.role === undefined ? {} : { role: track.role }),
        ...(track.components === undefined
          ? {}
          : { components: cloneComponents(track.components) }),
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
    (!Array.isArray(record.bindings) ||
      record.bindings.some((binding) =>
        binding === null || typeof binding !== "object" ||
        typeof binding.trackId !== "string" ||
        (binding.kind !== "DRAW" && binding.kind !== "AUDIO") ||
        typeof binding.assetId !== "string" ||
        typeof binding.revisionId !== "string" ||
        !/^[a-f0-9]{64}$/u.test(binding.contentHash) ||
        (binding.mode !== "LIVE" && binding.mode !== "PINNED") ||
        typeof binding.label !== "string" ||
        Object.keys(binding).some((key) => !GAME_EDITOR_BINDING_KEYS.has(key))
      ))
  ) return false;
  if (
    record.behaviors !== undefined &&
    (!Array.isArray(record.behaviors) ||
      record.behaviors.some((behavior) =>
        behavior === null || typeof behavior !== "object" ||
        typeof behavior.behaviorId !== "string" || behavior.version !== 1 ||
        behavior.ownership !== "CANONICAL_IR" ||
        !Array.isArray(behavior.rules) ||
        behavior.rules.some((rule: unknown) => {
          if (rule === null || typeof rule !== "object") return true;
          const candidate = rule as Record<string, unknown>;
          return typeof candidate.ruleId !== "string" ||
            typeof candidate.enabled !== "boolean" ||
            candidate.trigger === null ||
            typeof candidate.trigger !== "object" ||
            !Array.isArray(candidate.conditions) ||
            !Array.isArray(candidate.actions);
        })
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
      ) &&
      (track.role === undefined ||
        [
          "PLAYER",
          "NPC",
          "PROP",
          "TRIGGER",
          "TILEMAP",
          "CAMERA",
          "AUDIO",
          "CUSTOM",
        ].includes(track.role)) &&
      (track.components === undefined ||
        (Array.isArray(track.components) &&
          new Set(
              track.components.map((component: GameComponentState) =>
                String(component.componentId)
              ),
            ).size === track.components.length &&
          track.components.every(validEditorComponent)))
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
