/// <reference lib="dom" />

/**
 * Project-level identity and manifest boundary for the isolated Draw2
 * workspace. The manifest contains only module pointers and recovery status;
 * Draw, Audio, and Game canonical states remain separate subdocuments.
 * See docs/mode-authority-contract.md: cross-mode access is permanently
 * read-only and can never transfer write or history authority.
 */

export const WORKSPACE_MANIFEST_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_MANIFEST_DB_NAME =
  "pixiedraw2-workspace-manifest" as const;
export const WORKSPACE_MANIFEST_DB_VERSION = 1 as const;
export const WORKSPACE_MANIFEST_STORE_NAME = "manifests" as const;
export const WORKSPACE_ACTIVE_PROJECT_STORAGE_KEY =
  "pixiedraw2:active-project-id:v1" as const;
export const WORKSPACE_PROJECT_CHANGED_EVENT =
  "pixiedraw2:project-changed" as const;
export const WORKSPACE_MANIFEST_CHANGED_EVENT =
  "pixiedraw2:workspace-manifest-changed" as const;
export const DEFAULT_WORKSPACE_PROJECT_ID = "draw2-local-demo" as const;

export type WorkspaceProjectId = string & {
  readonly __workspaceProjectId: true;
};
export type WorkspaceSurface = "draw" | "audio" | "game";
export type WorkspaceModuleStatus =
  | "EMPTY"
  | "READY"
  | "RECOVERED"
  | "UNAVAILABLE"
  | "MISSING"
  | "RECOVERABLE"
  | "CORRUPT";

export interface WorkspaceModuleManifest {
  /** Module-owned persistence pointers; the manifest never embeds state. */
  readonly stateRef: string;
  readonly checkpointRef: string;
  readonly journalRef: string;
  readonly status: WorkspaceModuleStatus;
  readonly revision: number;
  readonly stateHash: string | null;
  readonly savedAt: string | null;
}

export type WorkspaceMigrationStatus = "LEGACY" | "MIGRATED" | "VERIFIED";

export interface WorkspaceAudioMigration {
  readonly status: WorkspaceMigrationStatus;
  readonly legacyProjectId: string;
  readonly migratedAt: string;
  readonly verifiedAt?: string;
}

export interface WorkspaceMigrationState {
  readonly audio?: WorkspaceAudioMigration;
}

export interface WorkspaceProjectManifest {
  readonly schemaVersion: typeof WORKSPACE_MANIFEST_SCHEMA_VERSION;
  readonly projectId: WorkspaceProjectId;
  readonly name: string;
  readonly activeMode: WorkspaceSurface;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
  readonly modules: Readonly<Record<WorkspaceSurface, WorkspaceModuleManifest>>;
  readonly assetCatalogRef?: string;
  readonly migration?: WorkspaceMigrationState;
}

export interface WorkspaceManifestStore {
  load(projectId: WorkspaceProjectId): Promise<WorkspaceProjectManifest | null>;
  save(manifest: WorkspaceProjectManifest): Promise<void>;
  /** Removes the manifest; the operation is idempotent for retryable cleanup. */
  clear(projectId: WorkspaceProjectId): Promise<boolean>;
  updateModule(
    projectId: WorkspaceProjectId,
    surface: WorkspaceSurface,
    patch: Partial<WorkspaceModuleManifest>,
    name?: string,
  ): Promise<WorkspaceProjectManifest>;
  updateAudioMigration(
    projectId: WorkspaceProjectId,
    migration: WorkspaceAudioMigration,
  ): Promise<WorkspaceProjectManifest>;
  setActiveMode(
    projectId: WorkspaceProjectId,
    activeMode: WorkspaceSurface,
  ): Promise<WorkspaceProjectManifest>;
}

export interface WorkspaceProjectChangedDetail {
  readonly projectId: WorkspaceProjectId;
  readonly name?: string;
  /** Distinguishes restoring an existing Project from creating a blank one. */
  readonly kind?: "OPEN" | "NEW";
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "projectId",
  "name",
  "activeMode",
  "createdAt",
  "updatedAt",
  "revision",
  "modules",
  "assetCatalogRef",
  "migration",
]);
const MODULE_KEYS = new Set([
  "stateRef",
  "checkpointRef",
  "journalRef",
  "status",
  "revision",
  "stateHash",
  "savedAt",
]);

export function asWorkspaceProjectId(value: string): WorkspaceProjectId {
  const normalized = value.trim();
  if (!SAFE_ID.test(normalized)) {
    throw new Error("Workspace Project ID must be a stable identifier.");
  }
  return normalized as WorkspaceProjectId;
}

export function normalizeWorkspaceProjectId(
  value: string | null | undefined,
  fallback: WorkspaceProjectId = asWorkspaceProjectId(
    DEFAULT_WORKSPACE_PROJECT_ID,
  ),
): WorkspaceProjectId {
  try {
    return asWorkspaceProjectId(value ?? "");
  } catch {
    return fallback;
  }
}

function moduleManifest(
  surface: WorkspaceSurface,
  projectId: WorkspaceProjectId,
  status: WorkspaceModuleStatus = "EMPTY",
): WorkspaceModuleManifest {
  return {
    stateRef: `${surface}:${projectId}:state`,
    checkpointRef: `${surface}:${projectId}:checkpoint`,
    journalRef: `${surface}:${projectId}:journal`,
    status,
    revision: 0,
    stateHash: null,
    savedAt: null,
  };
}

export function createWorkspaceProjectManifest(
  projectId: WorkspaceProjectId,
  name = `iDRAW ${projectId}`,
  now = new Date().toISOString(),
): WorkspaceProjectManifest {
  return {
    schemaVersion: WORKSPACE_MANIFEST_SCHEMA_VERSION,
    projectId,
    name,
    activeMode: "draw",
    createdAt: now,
    updatedAt: now,
    revision: 0,
    modules: {
      draw: moduleManifest("draw", projectId),
      audio: moduleManifest("audio", projectId),
      game: moduleManifest("game", projectId),
    },
  };
}

function isSurface(value: unknown): value is WorkspaceSurface {
  return value === "draw" || value === "audio" || value === "game";
}

function isModuleStatus(value: unknown): value is WorkspaceModuleStatus {
  return value === "EMPTY" || value === "READY" || value === "RECOVERED" ||
    value === "UNAVAILABLE" || value === "MISSING" ||
    value === "RECOVERABLE" || value === "CORRUPT";
}

function safeReference(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    !/[\u0000\u0009\u000a\u000d]/u.test(value);
}

function isWorkspaceMigrationStatus(
  value: unknown,
): value is WorkspaceMigrationStatus {
  return value === "LEGACY" || value === "MIGRATED" || value === "VERIFIED";
}

function hasRawWorkspacePayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasRawWorkspacePayload);
  if (value === null || typeof value !== "object") return false;
  const forbidden =
    /^(?:bytes|rawAudio|rawRaster|pixelData|pcm|audioBuffer|blob)$/iu;
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    forbidden.test(key) || hasRawWorkspacePayload(entry)
  );
}

function normalizedModuleManifest(
  surface: WorkspaceSurface,
  projectId: WorkspaceProjectId,
  value: unknown,
): WorkspaceModuleManifest | null {
  if (value === null || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !MODULE_KEYS.has(key))) return null;
  if (
    !isModuleStatus(candidate.status) ||
    typeof candidate.revision !== "number" ||
    !Number.isSafeInteger(candidate.revision) || candidate.revision < 0 ||
    (typeof candidate.stateHash !== "string" && candidate.stateHash !== null) ||
    (typeof candidate.savedAt !== "string" && candidate.savedAt !== null) ||
    hasRawWorkspacePayload(value)
  ) return null;
  return {
    stateRef: safeReference(candidate.stateRef)
      ? candidate.stateRef
      : `${surface}:${projectId}:state`,
    checkpointRef: safeReference(candidate.checkpointRef)
      ? candidate.checkpointRef
      : `${surface}:${projectId}:checkpoint`,
    journalRef: safeReference(candidate.journalRef)
      ? candidate.journalRef
      : `${surface}:${projectId}:journal`,
    status: candidate.status,
    revision: candidate.revision,
    stateHash: candidate.stateHash,
    savedAt: candidate.savedAt,
  };
}

function normalizedManifest(value: unknown): WorkspaceProjectManifest | null {
  if (value === null || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const modules = candidate.modules;
  if (
    modules === null || typeof modules !== "object" || Array.isArray(modules)
  ) return null;
  const moduleRecord = modules as Record<string, unknown>;
  if (
    hasRawWorkspacePayload(value) ||
    Object.keys(candidate).some((key) => !MANIFEST_KEYS.has(key)) ||
    candidate.schemaVersion !== WORKSPACE_MANIFEST_SCHEMA_VERSION ||
    typeof candidate.projectId !== "string" ||
    !SAFE_ID.test(candidate.projectId) ||
    typeof candidate.name !== "string" || !candidate.name.trim() ||
    !isSurface(candidate.activeMode) ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.revision !== "number" ||
    !Number.isSafeInteger(candidate.revision) || candidate.revision < 0
  ) return null;
  const projectId = candidate.projectId as WorkspaceProjectId;
  if (Object.keys(moduleRecord).some((key) => !isSurface(key))) return null;
  const draw = normalizedModuleManifest("draw", projectId, moduleRecord.draw);
  const audio = normalizedModuleManifest(
    "audio",
    projectId,
    moduleRecord.audio,
  );
  const game = normalizedModuleManifest("game", projectId, moduleRecord.game);
  if (draw === null || audio === null || game === null) return null;
  if (
    candidate.assetCatalogRef !== undefined &&
    !safeReference(candidate.assetCatalogRef)
  ) return null;
  let migration: WorkspaceMigrationState | undefined;
  if (candidate.migration !== undefined) {
    if (
      candidate.migration === null || typeof candidate.migration !== "object"
    ) return null;
    if (
      Object.keys(candidate.migration as Record<string, unknown>).some((key) =>
        key !== "audio"
      )
    ) return null;
    const audioMigration =
      (candidate.migration as Record<string, unknown>).audio;
    if (audioMigration !== undefined) {
      if (audioMigration === null || typeof audioMigration !== "object") {
        return null;
      }
      const record = audioMigration as Record<string, unknown>;
      if (
        Object.keys(record).some((key) =>
          !["status", "legacyProjectId", "migratedAt", "verifiedAt"].includes(
            key,
          )
        )
      ) return null;
      if (
        !isWorkspaceMigrationStatus(record.status) ||
        !safeReference(record.legacyProjectId) ||
        typeof record.migratedAt !== "string" ||
        (record.verifiedAt !== undefined &&
          typeof record.verifiedAt !== "string")
      ) return null;
      migration = {
        audio: {
          status: record.status,
          legacyProjectId: record.legacyProjectId,
          migratedAt: record.migratedAt,
          ...(record.verifiedAt === undefined
            ? {}
            : { verifiedAt: record.verifiedAt }),
        },
      };
    }
  }
  return {
    schemaVersion: WORKSPACE_MANIFEST_SCHEMA_VERSION,
    projectId,
    name: candidate.name,
    activeMode: candidate.activeMode,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    revision: candidate.revision,
    modules: { draw, audio, game },
    ...(candidate.assetCatalogRef === undefined
      ? {}
      : { assetCatalogRef: candidate.assetCatalogRef }),
    ...(migration === undefined ? {} : { migration }),
  };
}

function isManifest(value: unknown): value is WorkspaceProjectManifest {
  return normalizedManifest(value) !== null;
}

function cloneManifest(
  manifest: WorkspaceProjectManifest,
): WorkspaceProjectManifest {
  const normalized = normalizedManifest(manifest);
  if (normalized === null) throw new Error("Invalid Workspace Manifest.");
  return {
    ...normalized,
    modules: {
      draw: { ...normalized.modules.draw },
      audio: { ...normalized.modules.audio },
      game: { ...normalized.modules.game },
    },
  };
}

function openManifestDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(name, WORKSPACE_MANIFEST_DB_VERSION);
    request.onupgradeneeded = () => {
      if (
        !request.result.objectStoreNames.contains(WORKSPACE_MANIFEST_STORE_NAME)
      ) {
        request.result.createObjectStore(WORKSPACE_MANIFEST_STORE_NAME, {
          keyPath: "projectId",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Manifest DB open failed."));
    request.onblocked = () =>
      reject(new Error("Manifest DB open was blocked."));
  });
}

export function createIndexedDbWorkspaceManifestStore(
  databaseName = WORKSPACE_MANIFEST_DB_NAME,
): WorkspaceManifestStore {
  return {
    async load(projectId) {
      try {
        const database = await openManifestDatabase(databaseName);
        return await new Promise<WorkspaceProjectManifest | null>((resolve) => {
          const request = database.transaction(
            WORKSPACE_MANIFEST_STORE_NAME,
            "readonly",
          ).objectStore(WORKSPACE_MANIFEST_STORE_NAME).get(projectId);
          request.onsuccess = () => {
            database.close();
            resolve(
              isManifest(request.result) ? cloneManifest(request.result) : null,
            );
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
    async save(manifest) {
      const canonical = normalizedManifest(manifest);
      if (canonical === null) return;
      try {
        const database = await openManifestDatabase(databaseName);
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(
            WORKSPACE_MANIFEST_STORE_NAME,
            "readwrite",
          );
          const store = transaction.objectStore(WORKSPACE_MANIFEST_STORE_NAME);
          const read = store.get(canonical.projectId);
          read.onsuccess = () => {
            const current = isManifest(read.result) ? read.result : undefined;
            if (
              current === undefined || canonical.revision >= current.revision
            ) {
              store.put(canonical);
            }
          };
          read.onerror = () => transaction.abort();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("Manifest save failed."));
          transaction.onabort = () =>
            reject(transaction.error ?? new Error("Manifest save aborted."));
        });
        database.close();
      } catch {
        // The module stores remain usable when the optional manifest host is unavailable.
      }
    },
    async clear(projectId) {
      try {
        const database = await openManifestDatabase(databaseName);
        return await new Promise<boolean>((resolve) => {
          const transaction = database.transaction(
            WORKSPACE_MANIFEST_STORE_NAME,
            "readwrite",
          );
          transaction.objectStore(WORKSPACE_MANIFEST_STORE_NAME).delete(
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
    async updateModule(projectId, surface, patch, name) {
      const current = await this.load(projectId) ??
        createWorkspaceProjectManifest(
          projectId,
          name,
        );
      const now = new Date().toISOString();
      const next: WorkspaceProjectManifest = {
        ...current,
        name: name ?? current.name,
        updatedAt: now,
        revision: current.revision + 1,
        modules: {
          ...current.modules,
          [surface]: { ...current.modules[surface], ...patch },
        },
      };
      await this.save(next);
      announceWorkspaceManifestChanged(next);
      return next;
    },
    async setActiveMode(projectId, activeMode) {
      const current = await this.load(projectId) ??
        createWorkspaceProjectManifest(projectId);
      const next: WorkspaceProjectManifest = {
        ...current,
        activeMode,
        updatedAt: new Date().toISOString(),
        revision: current.revision + 1,
      };
      await this.save(next);
      return next;
    },
    async updateAudioMigration(projectId, migration) {
      const current = await this.load(projectId) ??
        createWorkspaceProjectManifest(projectId);
      const next: WorkspaceProjectManifest = {
        ...current,
        updatedAt: new Date().toISOString(),
        revision: current.revision + 1,
        migration: { audio: migration },
      };
      await this.save(next);
      announceWorkspaceManifestChanged(next);
      return next;
    },
  };
}

export function createMemoryWorkspaceManifestStore(): WorkspaceManifestStore {
  const records = new Map<string, WorkspaceProjectManifest>();
  return {
    async load(projectId) {
      const record = records.get(projectId);
      return record === undefined ? null : cloneManifest(record);
    },
    async save(manifest) {
      const canonical = normalizedManifest(manifest);
      if (canonical === null) return;
      const current = records.get(canonical.projectId);
      if (current === undefined || canonical.revision >= current.revision) {
        records.set(canonical.projectId, cloneManifest(canonical));
      }
    },
    async clear(projectId) {
      records.delete(projectId);
      return true;
    },
    async updateModule(projectId, surface, patch, name) {
      const current = await this.load(projectId) ??
        createWorkspaceProjectManifest(
          projectId,
          name,
        );
      const next: WorkspaceProjectManifest = {
        ...current,
        name: name ?? current.name,
        updatedAt: new Date().toISOString(),
        revision: current.revision + 1,
        modules: {
          ...current.modules,
          [surface]: { ...current.modules[surface], ...patch },
        },
      };
      await this.save(next);
      announceWorkspaceManifestChanged(next);
      return next;
    },
    async setActiveMode(projectId, activeMode) {
      const current = await this.load(projectId) ??
        createWorkspaceProjectManifest(projectId);
      const next: WorkspaceProjectManifest = {
        ...current,
        activeMode,
        updatedAt: new Date().toISOString(),
        revision: current.revision + 1,
      };
      await this.save(next);
      return next;
    },
    async updateAudioMigration(projectId, migration) {
      const current = await this.load(projectId) ??
        createWorkspaceProjectManifest(projectId);
      const next: WorkspaceProjectManifest = {
        ...current,
        updatedAt: new Date().toISOString(),
        revision: current.revision + 1,
        migration: { audio: migration },
      };
      await this.save(next);
      announceWorkspaceManifestChanged(next);
      return next;
    },
  };
}

export function readActiveWorkspaceProjectId(
  storage: Storage | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage,
): WorkspaceProjectId {
  try {
    return normalizeWorkspaceProjectId(
      storage?.getItem(
        WORKSPACE_ACTIVE_PROJECT_STORAGE_KEY,
      ),
    );
  } catch {
    return asWorkspaceProjectId(DEFAULT_WORKSPACE_PROJECT_ID);
  }
}

export function writeActiveWorkspaceProjectId(
  projectId: WorkspaceProjectId,
  storage: Storage | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage,
): void {
  try {
    storage?.setItem(WORKSPACE_ACTIVE_PROJECT_STORAGE_KEY, projectId);
  } catch {
    // Active project recovery is best effort when browser storage is blocked.
  }
}

export function announceWorkspaceProjectChanged(
  windowRef: Window,
  detail: WorkspaceProjectChangedDetail,
): void {
  windowRef.dispatchEvent(
    new CustomEvent<WorkspaceProjectChangedDetail>(
      WORKSPACE_PROJECT_CHANGED_EVENT,
      { detail },
    ),
  );
}

function announceWorkspaceManifestChanged(
  manifest: WorkspaceProjectManifest,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceProjectManifest>(
      WORKSPACE_MANIFEST_CHANGED_EVENT,
      { detail: cloneManifest(manifest) },
    ),
  );
}
