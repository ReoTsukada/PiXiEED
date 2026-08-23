import {
  createPixisyncDraft,
  type PixisyncOperationDraft,
} from "../../src/pixisync/index.ts";
import {
  PixisyncDurableJournal,
  type PixisyncDurableSnapshot,
} from "../../src/pixisync/durability.ts";
import {
  createPixisyncIndexedDbPersistence,
} from "../../src/pixisync/indexeddb-persistence.ts";

const PIXISYNC_DRAW2_180_DB_PREFIX =
  "pixisync-draw2-180-qualification-" as const;
const PIXISYNC_DRAW2_180_DB_NAME = `${PIXISYNC_DRAW2_180_DB_PREFIX}v1` as const;
const PIXISYNC_DRAW2_180_PROJECT_PREFIX = "pixisync-draw2-180-" as const;
const PIXISYNC_DRAW2_180_API_KEY = "__pixisyncDraw2CrossTabCas" as const;

type PixisyncDraw2CrossTabCasOpenResult = {
  readonly journalId: string;
  readonly projectId: string;
  readonly snapshot: PixisyncDurableSnapshot;
};

type PixisyncDraw2CrossTabCasEnqueueInput = {
  readonly journalId: string;
  readonly baseSnapshotHash: string;
  readonly operationId?: string;
};

type PixisyncDraw2CrossTabCasEnqueueResult =
  | {
    readonly ok: true;
    readonly code: "ENQUEUED";
    readonly journalId: string;
    readonly operationId: string;
    readonly journalSnapshot: PixisyncDurableSnapshot;
  }
  | {
    readonly ok: false;
    readonly code: string;
    readonly journalId: string;
    readonly operationId: string;
    readonly journalSnapshot: PixisyncDurableSnapshot;
    readonly persistentSnapshot: PixisyncDurableSnapshot | null;
    readonly errorMessage: string;
  };

type PixisyncDraw2CrossTabCasBrowserApi = Readonly<{
  resetTestDb(): Promise<{ readonly dbName: string; readonly deleted: true }>;
  openJournal(projectId: string): Promise<PixisyncDraw2CrossTabCasOpenResult>;
  getCurrentSnapshot(journalId: string): Promise<PixisyncDurableSnapshot>;
  enqueueFromBase(
    input: PixisyncDraw2CrossTabCasEnqueueInput,
  ): Promise<PixisyncDraw2CrossTabCasEnqueueResult>;
  readPersistentSnapshot(
    projectId: string,
  ): Promise<PixisyncDurableSnapshot | null>;
}>;

type JournalHandle = {
  readonly projectId: string;
  readonly journal: PixisyncDurableJournal;
};

const journals = new Map<string, JournalHandle>();
let nextJournalId = 0;
let nextOperationId = 0;

function requireProjectId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !new RegExp(
      `^${PIXISYNC_DRAW2_180_PROJECT_PREFIX}[A-Za-z0-9._:/-]{1,96}$`,
      "u",
    ).test(value)
  ) {
    throw new TypeError(
      `PiXYNC Draw2 180 qualification projectId must use ${PIXISYNC_DRAW2_180_PROJECT_PREFIX}.`,
    );
  }
}

function requireJournalId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !journals.has(value)) {
    throw new Error("PiXYNC Draw2 180 qualification journalId is unknown.");
  }
}

function requireOperationId(value: unknown): string {
  if (value === undefined) {
    nextOperationId += 1;
    return `pixisync-draw2-180-op-${nextOperationId}`;
  }
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)
  ) {
    throw new TypeError(
      "PiXYNC Draw2 180 qualification operationId is invalid.",
    );
  }
  return value;
}

function snapshotErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "PiXYNC Draw2 180 qualification operation failed.";
}

function snapshotErrorCode(error: unknown): string {
  const candidate = error as { readonly code?: unknown } | null;
  return typeof candidate?.code === "string"
    ? candidate.code
    : "ENQUEUE_FAILED";
}

interface QualificationIndexedDbFactory {
  deleteDatabase(name: string): {
    readonly error: unknown;
    onerror: (() => void) | null;
    onblocked: (() => void) | null;
    onsuccess: (() => void) | null;
  };
}

function requireIndexedDb(): QualificationIndexedDbFactory {
  const candidate = (globalThis as typeof globalThis & {
    indexedDB?: QualificationIndexedDbFactory;
  }).indexedDB;
  if (candidate === undefined) {
    throw new Error("PiXYNC Draw2 180 qualification requires IndexedDB.");
  }
  return candidate;
}

function deleteDedicatedTestDatabase(): Promise<void> {
  const factory = requireIndexedDb();
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(PIXISYNC_DRAW2_180_DB_NAME);
    request.onerror = () =>
      reject(
        request.error ?? new Error("Qualification database deletion failed."),
      );
    request.onblocked = () =>
      reject(new Error("Qualification database deletion was blocked."));
    request.onsuccess = () => resolve();
  });
}

function persistentSnapshot(
  projectId: string,
): Promise<PixisyncDurableSnapshot | undefined> {
  return createPixisyncIndexedDbPersistence(projectId, {
    dbName: PIXISYNC_DRAW2_180_DB_NAME,
  }).load();
}

async function resetTestDb(): Promise<{
  readonly dbName: string;
  readonly deleted: true;
}> {
  journals.clear();
  await deleteDedicatedTestDatabase();
  return { dbName: PIXISYNC_DRAW2_180_DB_NAME, deleted: true };
}

async function openJournal(
  projectId: string,
): Promise<PixisyncDraw2CrossTabCasOpenResult> {
  requireProjectId(projectId);
  const persistence = createPixisyncIndexedDbPersistence(projectId, {
    dbName: PIXISYNC_DRAW2_180_DB_NAME,
  });
  const journal = await PixisyncDurableJournal.open(projectId, persistence);
  nextJournalId += 1;
  const journalId = `pixisync-draw2-180-journal-${nextJournalId}`;
  journals.set(journalId, { projectId, journal });
  return { journalId, projectId, snapshot: journal.snapshot() };
}

async function getCurrentSnapshot(
  journalId: string,
): Promise<PixisyncDurableSnapshot> {
  requireJournalId(journalId);
  return journals.get(journalId)!.journal.snapshot();
}

async function enqueueFromBase(
  input: PixisyncDraw2CrossTabCasEnqueueInput,
): Promise<PixisyncDraw2CrossTabCasEnqueueResult> {
  requireJournalId(input?.journalId);
  const handle = journals.get(input.journalId)!;
  const operationId = requireOperationId(input.operationId);
  const current = handle.journal.snapshot();
  if (current.snapshotHash !== input.baseSnapshotHash) {
    const persisted = await persistentSnapshot(handle.projectId);
    return {
      ok: false,
      code: "SNAPSHOT_CONFLICT",
      journalId: input.journalId,
      operationId,
      journalSnapshot: current,
      persistentSnapshot: persisted ?? null,
      errorMessage: "The journal is no longer at the requested base snapshot.",
    };
  }

  const payload = {
    command: "pixisync-draw2-180-qualification-enqueue",
    operationId,
  } as const;
  const draft: PixisyncOperationDraft = await createPixisyncDraft({
    operationId,
    projectId: handle.projectId,
    aggregate: "draw",
    actorId: "pixisync-draw2-180-qualification",
    clientId: `pixisync-draw2-180-client-${input.journalId}`,
    clientSequence: 1,
    baseProjectRevision: current.revision,
    aggregateRevision: 0,
    payload,
  });

  try {
    await handle.journal.enqueue(draft);
    return {
      ok: true,
      code: "ENQUEUED",
      journalId: input.journalId,
      operationId,
      journalSnapshot: handle.journal.snapshot(),
    };
  } catch (error) {
    const persisted = await persistentSnapshot(handle.projectId);
    return {
      ok: false,
      code: snapshotErrorCode(error),
      journalId: input.journalId,
      operationId,
      journalSnapshot: handle.journal.snapshot(),
      persistentSnapshot: persisted ?? null,
      errorMessage: snapshotErrorMessage(error),
    };
  }
}

async function readPersistentSnapshot(
  projectId: string,
): Promise<PixisyncDurableSnapshot | null> {
  requireProjectId(projectId);
  return (await persistentSnapshot(projectId)) ?? null;
}

const api: PixisyncDraw2CrossTabCasBrowserApi = Object.freeze({
  resetTestDb,
  openJournal,
  getCurrentSnapshot,
  enqueueFromBase,
  readPersistentSnapshot,
});

type QualificationBridge = {
  addEventListener(type: "click", listener: () => void): void;
};

type QualificationTextControl = {
  value: string;
  textContent: string | null;
};

type QualificationDocument = {
  getElementById(
    id: string,
  ): QualificationBridge | QualificationTextControl | null;
};

const qualificationDocument = (globalThis as typeof globalThis & {
  document?: QualificationDocument;
}).document;
const qualificationBridge = qualificationDocument?.getElementById(
  "bridge",
) as QualificationBridge | null | undefined;
const qualificationCommand = qualificationDocument?.getElementById(
  "command",
) as QualificationTextControl | null | undefined;
const qualificationResult = qualificationDocument?.getElementById(
  "result",
) as QualificationTextControl | null | undefined;
qualificationBridge?.addEventListener("click", () => {
  if (qualificationCommand === undefined || qualificationCommand === null) {
    return;
  }
  if (qualificationResult === undefined || qualificationResult === null) {
    return;
  }
  qualificationResult.textContent = "";
  void (async () => {
    try {
      const command = JSON.parse(qualificationCommand.value || "{}") as {
        readonly method?: unknown;
        readonly args?: unknown;
      };
      let value: unknown;
      switch (command.method) {
        case "resetTestDb":
          value = await api.resetTestDb();
          break;
        case "openJournal":
          value = await api.openJournal(command.args as string);
          break;
        case "getCurrentSnapshot":
          value = await api.getCurrentSnapshot(command.args as string);
          break;
        case "enqueueFromBase":
          value = await api.enqueueFromBase(
            command.args as PixisyncDraw2CrossTabCasEnqueueInput,
          );
          break;
        case "readPersistentSnapshot":
          value = await api.readPersistentSnapshot(command.args as string);
          break;
        default:
          throw new Error("Unknown qualification bridge method.");
      }
      qualificationResult.textContent = JSON.stringify({ ok: true, value });
    } catch (error) {
      qualificationResult.textContent = JSON.stringify({
        ok: false,
        code: snapshotErrorCode(error),
        error: snapshotErrorMessage(error),
      });
    }
  })();
});

Object.defineProperty(globalThis, PIXISYNC_DRAW2_180_API_KEY, {
  configurable: false,
  enumerable: false,
  value: api,
  writable: false,
});

const loadState = (globalThis as typeof globalThis & {
  __pixisyncDraw2CrossTabCasLoad?: { state: string; error: string | null };
}).__pixisyncDraw2CrossTabCasLoad;
if (loadState !== undefined) {
  loadState.state = "READY";
  loadState.error = null;
}

declare global {
  interface Window {
    readonly __pixisyncDraw2CrossTabCas: PixisyncDraw2CrossTabCasBrowserApi;
  }
}
