/// <reference lib="dom" />

/**
 * Draw subdocument persistence for the isolated Draw2 workspace.
 *
 * The record is intentionally independent from the Workspace Manifest and
 * from Audio/Game records. The checkpoint contains the canonical Draw state;
 * the journal and history are retained beside it for local recovery/undo.
 */

import {
  IndexedTileRaster,
  sha256Hex,
  type CanonicalOperation,
  type ProjectState,
  type RasterAsset,
  type TileSnapshot,
} from "./draw2-core.ts";
import type {
  HistoryEntry,
  UndoRedoHistorySnapshot,
} from "./draw2-selection.ts";
import {
  validateAssetDefinitionDraft,
  type AssetDefinitionDraft,
} from "./draw2-creator-workspace.ts";
import {
  normalizeDraw2TimelineMetadata,
  type Draw2TimelineMetadata,
} from "./draw2-creator-features.ts";
import type { PxdAssetDefinitionEntry } from "./draw2-export.ts";
import { cloneDraw2Tilemaps } from "./draw2-tilemap.ts";
import {
  cloneAssetPackageManifest,
  verifyAssetPackageManifest,
  type AssetPackageManifest,
} from "./game/game-350/assetization.ts";

export const DRAW2_PERSISTENCE_SCHEMA_VERSION =
  "DRAW2_PERSISTENCE_V1" as const;
export const DRAW2_PERSISTENCE_DB_NAME = "pixiedraw2-draw-subdocuments" as const;
export const DRAW2_PERSISTENCE_DB_VERSION = 1 as const;
export const DRAW2_PERSISTENCE_STORE_NAME = "projects" as const;
/**
 * Durable undo is a recovery window, not an archive of the whole session.
 * Each entry owns before/after structural snapshots, so both a count and a
 * byte ceiling are required to keep broad-paint autosaves responsive.
 */
export const DRAW2_PERSISTED_HISTORY_LIMIT = 8 as const;
export const DRAW2_PERSISTED_HISTORY_MAX_BYTES = 786432 as const;

export interface SerializedDraw2Tile {
  readonly tileKey: string;
  readonly bytes: readonly number[];
}

export interface SerializedDraw2Raster {
  readonly width: number;
  readonly height: number;
  readonly tileSize: 32 | 64;
  readonly tiles: readonly SerializedDraw2Tile[];
}

export interface SerializedDraw2Asset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly palette: readonly number[];
  readonly raster: SerializedDraw2Raster;
  readonly revision: number;
}

export type SerializedDraw2ProjectState = Omit<ProjectState, "assets"> & {
  readonly assets: Readonly<Record<string, SerializedDraw2Asset>>;
};

export interface SerializedDraw2HistoryEntry {
  readonly actionId: string;
  readonly operationId: string;
  readonly operationType: string;
  readonly before: SerializedDraw2ProjectState;
  readonly after: SerializedDraw2ProjectState;
}

export interface SerializedDraw2HistorySnapshot {
  readonly undo: readonly SerializedDraw2HistoryEntry[];
  readonly redo: readonly SerializedDraw2HistoryEntry[];
}

export interface SerializeDraw2HistoryOptions {
  readonly maxEntries?: number;
  readonly maxBytes?: number;
}

export interface SerializedDraw2DirtyTileWrite {
  readonly assetId: string;
  readonly tiles: readonly SerializedDraw2Tile[];
}

export interface Draw2JournalSnapshot {
  readonly operations: readonly CanonicalOperation[];
  readonly dirtyTileWrites: readonly SerializedDraw2DirtyTileWrite[];
}

export interface Draw2PersistenceRecord {
  readonly schemaVersion: typeof DRAW2_PERSISTENCE_SCHEMA_VERSION;
  readonly projectId: string;
  readonly revision: number;
  readonly savedAt: string;
  readonly stateHash: string;
  readonly checkpoint: SerializedDraw2ProjectState;
  readonly journal: Draw2JournalSnapshot;
  readonly history: SerializedDraw2HistorySnapshot;
  /** PXD-owned reference definitions; old records may omit this field. */
  readonly assetDefinitions?: readonly PxdAssetDefinitionEntry[];
  /** Lightweight Draw timeline annotations; old records may omit this field. */
  readonly timelineMetadata?: Draw2TimelineMetadata;
  /** Strict, content-addressed Asset / Asset Pack manifests. */
  readonly assetPackages?: readonly AssetPackageManifest[];
}

export interface Draw2PersistenceSaveResult {
  readonly ok: boolean;
  readonly stale: boolean;
}

/**
 * Optional compare-and-swap guard for a save produced from a previously
 * loaded Project snapshot. A missing record is represented by revision 0 and
 * a null state hash. When omitted, the store still applies its monotonic
 * revision guard for backwards-compatible callers.
 */
export interface Draw2PersistenceSaveOptions {
  readonly expectedRevision?: number;
  readonly expectedStateHash?: string | null;
}

export interface Draw2PersistenceStore {
  readonly available: boolean;
  load(projectId: string): Promise<Draw2PersistenceRecord | null>;
  save(
    record: Draw2PersistenceRecord,
    options?: Draw2PersistenceSaveOptions,
  ): Promise<Draw2PersistenceSaveResult>;
  clear(projectId: string): Promise<boolean>;
}

function normalizeAssetDefinitions(
  entries: readonly PxdAssetDefinitionEntry[] | undefined,
): PxdAssetDefinitionEntry[] {
  const normalized = [...(entries ?? [])].map((entry) => {
    if (
      entry === null || typeof entry !== "object" ||
      typeof entry.definitionId !== "string" ||
      entry.definitionId.trim().length === 0 ||
      entry.definition === null || typeof entry.definition !== "object"
    ) {
      throw new Error("Draw2 Asset Definition identity is invalid.");
    }
    const candidate = {
      ...entry.definition,
      persistence: "LOCAL_DRAFT",
    } as AssetDefinitionDraft;
    const validation = validateAssetDefinitionDraft(candidate);
    if (!validation.ok) {
      throw new Error(`Draw2 Asset Definition is invalid: ${validation.message}`);
    }
    const definition = entry.definition.persistence === "VALIDATED_DEFINITION"
      ? { ...validation.value, persistence: "VALIDATED_DEFINITION" as const }
      : { ...validation.value, persistence: "LOCAL_DRAFT" as const };
    return {
      definitionId: entry.definitionId.trim(),
      definition,
      ...(entry.registryIdentity === undefined
        ? {}
        : { registryIdentity: { ...entry.registryIdentity } }),
    } as PxdAssetDefinitionEntry;
  });
  const ids = new Set<string>();
  for (const entry of normalized) {
    if (ids.has(entry.definitionId)) {
      throw new Error("Draw2 Asset Definition identity is duplicated.");
    }
    ids.add(entry.definitionId);
  }
  return normalized.sort((left, right) =>
    left.definitionId.localeCompare(right.definitionId)
  );
}

function stateHashPayload(
  checkpoint: SerializedDraw2ProjectState,
  assetDefinitions: readonly PxdAssetDefinitionEntry[] | undefined,
  timelineMetadata: Draw2TimelineMetadata | undefined,
  assetPackages: readonly AssetPackageManifest[] | undefined,
): unknown {
  // Records created before Asset Definitions were introduced hash only the
  // checkpoint. Keep those records readable while making new metadata changes
  // part of the Draw subdocument integrity boundary.
  if (assetDefinitions === undefined && timelineMetadata === undefined && assetPackages === undefined) {
    return checkpoint;
  }
  return {
    checkpoint,
    ...(assetDefinitions === undefined ? {} : { assetDefinitions }),
    ...(timelineMetadata === undefined ? {} : { timelineMetadata }),
    ...(assetPackages === undefined ? {} : { assetPackages }),
  };
}

async function normalizeAssetPackages(
  entries: readonly AssetPackageManifest[] | undefined,
): Promise<AssetPackageManifest[] | undefined> {
  if (entries === undefined) return undefined;
  const normalized: AssetPackageManifest[] = [];
  const packageIds = new Set<string>();
  for (const entry of entries) {
    const verified = await verifyAssetPackageManifest(entry);
    if (!verified.ok) throw new Error(`Draw2 Asset Package is invalid: ${verified.reasons.join("; ")}`);
    if (packageIds.has(entry.packageId)) throw new Error("Draw2 Asset Package identity is duplicated.");
    packageIds.add(entry.packageId);
    normalized.push(cloneAssetPackageManifest(entry));
  }
  normalized.sort((left, right) => left.packageId.localeCompare(right.packageId));
  return normalized;
}

function cloneBytes(bytes: Uint8Array): SerializedDraw2Tile["bytes"] {
  return Array.from(bytes);
}

function serializeTile(tile: TileSnapshot): SerializedDraw2Tile {
  return { tileKey: tile.tileKey, bytes: cloneBytes(tile.bytes) };
}

function deserializeTile(tile: SerializedDraw2Tile): TileSnapshot {
  return { tileKey: tile.tileKey, bytes: Uint8Array.from(tile.bytes) };
}

export function serializeDraw2ProjectState(
  state: ProjectState,
): SerializedDraw2ProjectState {
  const assets: Record<string, SerializedDraw2Asset> = {};
  for (const [id, asset] of Object.entries(state.assets)) {
    assets[id] = {
      id: asset.id,
      width: asset.width,
      height: asset.height,
      palette: [...asset.palette],
      raster: {
        width: asset.raster.width,
        height: asset.raster.height,
        tileSize: asset.raster.tileSize,
        tiles: asset.raster.snapshotTiles().map(serializeTile),
      },
      revision: asset.revision,
    };
  }
  return {
    ...state,
    layers: state.layers.map((layer) => ({ ...layer })),
    frames: state.frames.map((frame) => ({ ...frame })),
    cels: state.cels.map((cel) => ({ ...cel })),
    timeline: {
      ...state.timeline,
      frameOrder: [...state.timeline.frameOrder],
      layerTrackOrder: [...state.timeline.layerTrackOrder],
    },
    tilemaps: cloneDraw2Tilemaps(state.tilemaps),
    assets,
    appliedCommandIds: [...state.appliedCommandIds],
    lastClientSequenceByClient: { ...state.lastClientSequenceByClient },
  };
}

export function deserializeDraw2ProjectState(
  serialized: SerializedDraw2ProjectState,
): ProjectState {
  if (serialized.schemaVersion !== 1 || typeof serialized.projectId !== "string") {
    throw new Error("Draw2 Project state schema is unsupported.");
  }
  const assets: Record<string, RasterAsset> = {};
  for (const [id, serializedAsset] of Object.entries(serialized.assets)) {
    if (serializedAsset.id !== id) throw new Error("Draw2 asset identity is invalid.");
    const raster = serializedAsset.raster;
    if (
      raster.width !== serializedAsset.width ||
      raster.height !== serializedAsset.height
    ) {
      throw new Error("Draw2 raster dimensions do not match the asset.");
    }
    assets[id] = {
      id: serializedAsset.id,
      width: serializedAsset.width,
      height: serializedAsset.height,
      palette: [...serializedAsset.palette],
      raster: IndexedTileRaster.fromTileSnapshots(
        raster.width,
        raster.height,
        raster.tileSize,
        raster.tiles.map(deserializeTile),
      ),
      revision: serializedAsset.revision,
    };
  }
  return {
    ...serialized,
    layers: serialized.layers.map((layer) => ({ ...layer })),
    frames: serialized.frames.map((frame) => ({ ...frame })),
    cels: serialized.cels.map((cel) => ({ ...cel })),
    timeline: {
      ...serialized.timeline,
      frameOrder: [...serialized.timeline.frameOrder],
      layerTrackOrder: [...serialized.timeline.layerTrackOrder],
    },
    tilemaps: cloneDraw2Tilemaps(serialized.tilemaps),
    assets,
    appliedCommandIds: [...serialized.appliedCommandIds],
    lastClientSequenceByClient: { ...serialized.lastClientSequenceByClient },
  };
}

function serializeHistoryEntry(entry: HistoryEntry): SerializedDraw2HistoryEntry {
  return {
    actionId: entry.actionId,
    operationId: entry.operationId,
    operationType: entry.operationType,
    before: serializeDraw2ProjectState(entry.before),
    after: serializeDraw2ProjectState(entry.after),
  };
}

function deserializeHistoryEntry(
  entry: SerializedDraw2HistoryEntry,
): HistoryEntry {
  return {
    actionId: entry.actionId,
    operationId: entry.operationId,
    operationType: entry.operationType,
    before: deserializeDraw2ProjectState(entry.before),
    after: deserializeDraw2ProjectState(entry.after),
  };
}

export function serializeDraw2History(
  history: UndoRedoHistorySnapshot,
  options: SerializeDraw2HistoryOptions = {},
): SerializedDraw2HistorySnapshot {
  const maxEntries = typeof options.maxEntries === "number" &&
      Number.isSafeInteger(options.maxEntries) && options.maxEntries >= 0
    ? options.maxEntries
    : DRAW2_PERSISTED_HISTORY_LIMIT;
  const maxBytes = typeof options.maxBytes === "number" &&
      Number.isSafeInteger(options.maxBytes) && options.maxBytes >= 0
    ? options.maxBytes
    : DRAW2_PERSISTED_HISTORY_MAX_BYTES;
  const serialized: {
    undo: SerializedDraw2HistoryEntry[];
    redo: SerializedDraw2HistoryEntry[];
  } = {
    undo: (maxEntries === 0 ? [] : history.undo.slice(-maxEntries)).map(
      serializeHistoryEntry,
    ),
    redo: (maxEntries === 0 ? [] : history.redo.slice(-maxEntries)).map(
      serializeHistoryEntry,
    ),
  };
  const encodedBytes = (): number =>
    new TextEncoder().encode(JSON.stringify(serialized)).byteLength;
  while (
    (serialized.undo.length > 0 || serialized.redo.length > 0) &&
    encodedBytes() > maxBytes
  ) {
    if (serialized.undo.length >= serialized.redo.length && serialized.undo.length > 0) {
      serialized.undo.shift();
    } else if (serialized.redo.length > 0) {
      serialized.redo.shift();
    } else {
      break;
    }
  }
  return serialized;
}

export function deserializeDraw2History(
  history: SerializedDraw2HistorySnapshot,
): UndoRedoHistorySnapshot {
  return {
    undo: history.undo.map(deserializeHistoryEntry),
    redo: history.redo.map(deserializeHistoryEntry),
  };
}

export function serializeDraw2Journal(
  journal: Draw2JournalSnapshot,
): Draw2JournalSnapshot {
  return {
    operations: journal.operations.map((operation) => ({ ...operation })),
    dirtyTileWrites: journal.dirtyTileWrites.map((write) => ({
      assetId: write.assetId,
      tiles: write.tiles.map((tile) => ({
        tileKey: tile.tileKey,
        bytes: [...tile.bytes],
      })),
    })),
  };
}

export async function createDraw2PersistenceRecord(
  state: ProjectState,
  history: UndoRedoHistorySnapshot,
  journal: Draw2JournalSnapshot,
  revision: number,
  savedAt = new Date().toISOString(),
  assetDefinitions: readonly PxdAssetDefinitionEntry[] = [],
  timelineMetadata?: Draw2TimelineMetadata,
  assetPackages?: readonly AssetPackageManifest[],
): Promise<Draw2PersistenceRecord> {
  const checkpoint = serializeDraw2ProjectState(state);
  const normalizedAssetDefinitions = normalizeAssetDefinitions(assetDefinitions);
  const normalizedTimelineMetadata = timelineMetadata === undefined
    ? undefined
    : normalizeDraw2TimelineMetadata(timelineMetadata, state.frames.length);
  const normalizedAssetPackages = await normalizeAssetPackages(assetPackages);
  return {
    schemaVersion: DRAW2_PERSISTENCE_SCHEMA_VERSION,
    projectId: state.projectId,
    revision,
    savedAt,
    stateHash: await sha256Hex(
      stateHashPayload(
        checkpoint,
        normalizedAssetDefinitions,
        normalizedTimelineMetadata,
        normalizedAssetPackages,
      ),
    ),
    checkpoint,
    journal: serializeDraw2Journal(journal),
    history: serializeDraw2History(history),
    assetDefinitions: normalizedAssetDefinitions,
    ...(normalizedTimelineMetadata === undefined
      ? {}
      : { timelineMetadata: normalizedTimelineMetadata }),
    ...(normalizedAssetPackages === undefined ? {} : { assetPackages: normalizedAssetPackages }),
  };
}

export async function restoreDraw2PersistenceRecord(
  record: Draw2PersistenceRecord,
  expectedProjectId?: string,
): Promise<{
  readonly state: ProjectState;
  readonly history: UndoRedoHistorySnapshot;
  readonly assetDefinitions: readonly PxdAssetDefinitionEntry[];
  readonly timelineMetadata: Draw2TimelineMetadata;
  readonly assetPackages: readonly AssetPackageManifest[];
}> {
  if (
    record.schemaVersion !== DRAW2_PERSISTENCE_SCHEMA_VERSION ||
    (expectedProjectId !== undefined && record.projectId !== expectedProjectId)
  ) {
    throw new Error("Draw2 persistence record identity is invalid.");
  }
  const state = deserializeDraw2ProjectState(record.checkpoint);
  if (state.projectId !== record.projectId) {
    throw new Error("Draw2 checkpoint Project ID does not match the record.");
  }
  const assetDefinitions = normalizeAssetDefinitions(record.assetDefinitions);
  const timelineMetadata = record.timelineMetadata === undefined
    ? undefined
    : normalizeDraw2TimelineMetadata(
      record.timelineMetadata,
      state.frames.length,
    );
  const assetPackages = await normalizeAssetPackages(record.assetPackages);
  const expectedHash = await sha256Hex(
    stateHashPayload(
      record.checkpoint,
      record.assetDefinitions === undefined ? undefined : assetDefinitions,
      timelineMetadata,
      assetPackages,
    ),
  );
  if (record.stateHash !== expectedHash) {
    throw new Error("Draw2 checkpoint hash does not match the record.");
  }
  const history = deserializeDraw2History(record.history);
  for (const entry of [...history.undo, ...history.redo]) {
    if (entry.before.projectId !== record.projectId || entry.after.projectId !== record.projectId) {
      throw new Error("Draw2 history Project ID does not match the record.");
    }
  }
  return {
    state,
    history,
    assetDefinitions,
    timelineMetadata: timelineMetadata ?? normalizeDraw2TimelineMetadata(
      undefined,
      state.frames.length,
    ),
    assetPackages: assetPackages ?? [],
  };
}

function isNewer(
  incoming: Draw2PersistenceRecord,
  current: Draw2PersistenceRecord | undefined,
): boolean {
  if (current === undefined) return true;
  if (incoming.revision !== current.revision) {
    return incoming.revision > current.revision;
  }
  // savedAt is diagnostic metadata, not an ordering authority. Two tabs can
  // produce the same local revision with different snapshots; accepting the
  // later timestamp would silently discard the other tab's work.
  return incoming.stateHash === current.stateHash;
}

function matchesExpected(
  current: Draw2PersistenceRecord | undefined,
  options: Draw2PersistenceSaveOptions | undefined,
): boolean {
  if (options?.expectedRevision !== undefined) {
    const currentRevision = current?.revision ?? 0;
    if (currentRevision !== options.expectedRevision) return false;
  }
  if (options?.expectedStateHash !== undefined) {
    const currentStateHash = current?.stateHash ?? null;
    if (currentStateHash !== options.expectedStateHash) return false;
  }
  return true;
}

function openDrawDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(name, DRAW2_PERSISTENCE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAW2_PERSISTENCE_STORE_NAME)) {
        request.result.createObjectStore(DRAW2_PERSISTENCE_STORE_NAME, {
          keyPath: "projectId",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Draw2 DB open failed."));
    request.onblocked = () => reject(new Error("Draw2 DB open was blocked."));
  });
}

export function createIndexedDbDraw2PersistenceStore(
  databaseName = DRAW2_PERSISTENCE_DB_NAME,
): Draw2PersistenceStore {
  const available = typeof indexedDB !== "undefined";
  return {
    available,
    async load(projectId) {
      if (!available) return null;
      try {
        const database = await openDrawDatabase(databaseName);
        return await new Promise<Draw2PersistenceRecord | null>((resolve) => {
          const request = database.transaction(
            DRAW2_PERSISTENCE_STORE_NAME,
            "readonly",
          ).objectStore(DRAW2_PERSISTENCE_STORE_NAME).get(projectId);
          request.onsuccess = () => {
            database.close();
            resolve((request.result as Draw2PersistenceRecord | undefined) ?? null);
          };
          request.onerror = () => {
            database.close();
            resolve(null);
          };
        });
      } catch {
        return null;
      }
    },
    async save(record, options) {
      if (!available) return { ok: false, stale: false };
      try {
        const database = await openDrawDatabase(databaseName);
        return await new Promise<Draw2PersistenceSaveResult>((resolve) => {
          let stale = false;
          const transaction = database.transaction(
            DRAW2_PERSISTENCE_STORE_NAME,
            "readwrite",
          );
          const store = transaction.objectStore(DRAW2_PERSISTENCE_STORE_NAME);
          const read = store.get(record.projectId);
          read.onsuccess = () => {
            const current = read.result as Draw2PersistenceRecord | undefined;
            if (!matchesExpected(current, options)) stale = true;
            else if (isNewer(record, current)) store.put(record);
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
        const database = await openDrawDatabase(databaseName);
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(
            DRAW2_PERSISTENCE_STORE_NAME,
            "readwrite",
          );
          transaction.objectStore(DRAW2_PERSISTENCE_STORE_NAME).delete(projectId);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        database.close();
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function createMemoryDraw2PersistenceStore(): Draw2PersistenceStore {
  const records = new Map<string, Draw2PersistenceRecord>();
  return {
    available: true,
    async load(projectId) {
      return records.get(projectId) ?? null;
    },
    async save(record, options) {
      const current = records.get(record.projectId);
      if (!matchesExpected(current, options) || !isNewer(record, current)) {
        return { ok: true, stale: true };
      }
      records.set(record.projectId, record);
      return { ok: true, stale: false };
    },
    async clear(projectId) {
      records.delete(projectId);
      return true;
    },
  };
}
