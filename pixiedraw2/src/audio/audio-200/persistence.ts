/**
 * AUDIO-200 Project State persistence.
 *
 * This module is host-neutral: it stores canonical Project metadata, the
 * journal/checkpoint, the animation clock, and explicitly-scoped musical
 * editing preferences. Raw audio bytes are deliberately rejected by the
 * canonical Project validator and belong to the later asset/OPFS phase.
 */

import {
  asAudioCheckpointId,
  asAudioProjectId,
  AUDIO200_UI_SCHEMA_VERSION,
  type Audio200Diagnostic,
  type Audio200Result,
  type AudioCheckpoint,
  audioDiagnostic,
  audioFail,
  type AudioJournalEntry,
  type AudioJournalEntryId,
  audioOk,
  type AudioProjectId,
  hasRawAudioPayload,
} from "./contracts.ts";
import {
  createAudioAssetCatalog,
  validateAudioAssetCatalog,
  validateAudioAssetCatalogAgainstProject,
} from "./assets.ts";
import type { AudioAssetCatalog } from "./contracts.ts";
import {
  type AudioJournalState,
  createAudioCheckpoint,
  rebaseAudioJournalEntries,
  recoverAudioProject,
  validateAudioJournalEntries,
  validateAudioJournalState,
} from "./journal.ts";
import { hashAudioProjectState, validateAudioProject } from "./state.ts";
import type { AudioWorkspaceSession } from "./workspace-session.ts";

export const AUDIO200_PERSISTENCE_SCHEMA_VERSION =
  "AUDIO-200_PERSISTENCE_V1" as const;
export const AUDIO200_PERSISTENCE_DB_NAME = "pixiedraw2-audio-200" as const;
export const AUDIO200_PERSISTENCE_DB_VERSION = 1 as const;
export const AUDIO200_PERSISTENCE_STORE_NAME = "projects" as const;
/** Number of recent edit transitions retained in a compact save. */
export const AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES = 32 as const;

/**
 * Compact on-disk form of the edit stacks.
 *
 * Journal entries remain the single source of entry payloads. Undo/Redo only
 * needs to identify entries, so persisting the complete entry object again
 * would double the largest part of an Audio project for no recovery benefit.
 */
export interface AudioWorkspacePersistedJournalState {
  readonly entries: readonly AudioJournalEntry[];
  readonly undoStack: readonly AudioJournalEntryId[];
  readonly redoStack: readonly AudioJournalEntryId[];
  /** Compact saves contain a rebased recent tail plus the Checkpoint base. */
  readonly mode?: "COMPACT_TAIL";
}

export type AudioWorkspacePersistenceJournal =
  | AudioJournalState
  | AudioWorkspacePersistedJournalState;

export type AudioPersistedMeter = "4/4" | "3/4" | "6/8" | "2/4";
export type AudioPersistedQuantize =
  | "off"
  | "1/4"
  | "1/8"
  | "1/16"
  | "1/32"
  | "1/64";
export type AudioPersistedSnap = "1/4" | "1/8" | "1/16";

/**
 * Settings that affect how a musician edits the Project. Transport position,
 * selected panels, current note selection, and zoom are intentionally not
 * persisted: they are transient UI state and must never alter the song.
 * Optional fields keep AUDIO-200 V1 records backward compatible.
 */
export interface AudioWorkspacePersistenceSettings {
  readonly meter?: AudioPersistedMeter;
  readonly quantize?: AudioPersistedQuantize;
  readonly snap?: AudioPersistedSnap;
}

export interface AudioWorkspacePersistenceRecord {
  readonly schemaVersion: typeof AUDIO200_PERSISTENCE_SCHEMA_VERSION;
  readonly projectId: AudioProjectId;
  readonly checkpoint: AudioCheckpoint;
  /** Metadata journal. Audio bytes are never embedded here. */
  readonly journal: AudioWorkspacePersistenceJournal;
  readonly framesPerSecond: number;
  readonly ppq: number;
  /** Musical editing preferences; absent on older AUDIO-200 records. */
  readonly settings?: AudioWorkspacePersistenceSettings;
  /** Current Project revision; needed when checkpoint is the compact tail base. */
  readonly projectRevision?: number;
  /** Optional for backward compatibility with Phase 1 records. */
  readonly assetCatalog?: AudioAssetCatalog;
  readonly savedAt: string;
}

export interface AudioPersistenceStore {
  load(
    projectId: AudioProjectId,
  ): Promise<Audio200Result<AudioWorkspacePersistenceRecord | null>>;
  save(
    record: AudioWorkspacePersistenceRecord,
  ): Promise<Audio200Result<true>>;
  clear(projectId: AudioProjectId): Promise<Audio200Result<true>>;
}

function fail<T>(
  code: Audio200Diagnostic["code"],
  message: string,
  path: string,
  recoverable = false,
): Audio200Result<T> {
  return audioFail(code, message, path, recoverable);
}

function validClock(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= min && value <= max;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validPersistenceSettings(
  value: unknown,
): value is AudioWorkspacePersistenceSettings {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const settings = value as Record<string, unknown>;
  return (settings.meter === undefined ||
    ["4/4", "3/4", "6/8", "2/4"].includes(settings.meter as string)) &&
    (settings.quantize === undefined ||
      ["off", "1/4", "1/8", "1/16", "1/32", "1/64"].includes(
        settings.quantize as string,
      )) &&
    (settings.snap === undefined ||
      ["1/4", "1/8", "1/16"].includes(settings.snap as string));
}

function isNewerPersistenceRecord(
  incoming: AudioWorkspacePersistenceRecord,
  previous: AudioWorkspacePersistenceRecord | undefined,
): boolean {
  if (previous === undefined) return true;
  const incomingRevision = incoming.projectRevision ??
    incoming.checkpoint.projectRevision;
  const previousRevision = previous.projectRevision ??
    previous.checkpoint.projectRevision;
  if (
    incomingRevision !== previousRevision
  ) {
    return incomingRevision > previousRevision;
  }
  // FPS/PPQ changes are session metadata and may keep the same Project
  // revision. savedAt prevents an older same-revision write from rolling them
  // back when two autosaves complete out of order.
  return incoming.savedAt >= previous.savedAt;
}

function isCompactTailJournal(
  journal: AudioWorkspacePersistenceJournal,
): journal is AudioWorkspacePersistedJournalState & {
  readonly mode: "COMPACT_TAIL";
} {
  return (journal as AudioWorkspacePersistedJournalState).mode ===
    "COMPACT_TAIL";
}

function resolvePersistedStack(
  value: unknown,
  entries: readonly AudioJournalEntry[],
  path: string,
): Audio200Result<readonly AudioJournalEntry[]> {
  if (!Array.isArray(value)) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Persisted undo/redo stack is not an array.",
      path,
    );
  }
  if (value.length === 0) return audioOk([]);
  if (value.every((item) => typeof item === "string")) {
    const entryById = new Map(
      entries.map((entry) => [String(entry.entryId), entry]),
    );
    const resolved: AudioJournalEntry[] = [];
    for (const [index, item] of value.entries()) {
      const entry = entryById.get(item);
      if (entry === undefined) {
        return fail(
          "AUDIO_JOURNAL_INVALID",
          "Persisted undo/redo stack references an unknown journal entry.",
          `${path}[${index}]`,
        );
      }
      resolved.push(entry);
    }
    return audioOk(resolved);
  }
  if (
    value.every((item) =>
      item !== null && typeof item === "object" && !Array.isArray(item)
    )
  ) {
    return audioOk(value as AudioJournalEntry[]);
  }
  return fail(
    "AUDIO_JOURNAL_INVALID",
    "Persisted undo/redo stack mixes entry objects and entry IDs.",
    path,
  );
}

/** Expand both current compact records and the pre-compression record shape. */
async function expandPersistenceJournal(
  record: AudioWorkspacePersistenceRecord,
): Promise<Audio200Result<AudioJournalState>> {
  const candidate = record.journal as unknown as Record<string, unknown>;
  if (
    candidate === null || typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Persistence journal is not an object.",
      "record.journal",
    );
  }
  if (
    "mode" in candidate && candidate.mode !== undefined &&
    candidate.mode !== "COMPACT_TAIL"
  ) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Persistence journal compression mode is unsupported.",
      "record.journal.mode",
    );
  }
  const entries = candidate.entries;
  if (!Array.isArray(entries)) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Persistence journal entries are missing.",
      "record.journal.entries",
    );
  }
  if (
    !entries.every((entry) =>
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
    )
  ) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Persistence journal entries contain a non-entry value.",
      "record.journal.entries",
    );
  }
  const project = "project" in candidate && candidate.project !== undefined
    ? candidate.project as AudioJournalState["project"]
    : entries.at(-1)?.afterState ?? record.checkpoint.state;
  const undoStack = await resolvePersistedStack(
    candidate.undoStack,
    entries as AudioJournalEntry[],
    "record.journal.undoStack",
  );
  if (!undoStack.ok) return undoStack;
  const redoStack = await resolvePersistedStack(
    candidate.redoStack,
    entries as AudioJournalEntry[],
    "record.journal.redoStack",
  );
  if (!redoStack.ok) return redoStack;
  return audioOk({
    project,
    entries: entries as AudioJournalEntry[],
    undoStack: undoStack.value,
    redoStack: redoStack.value,
  });
}

/** Validate the record envelope without requiring the journal hash chain. */
function persistenceShape(
  value: unknown,
): Audio200Result<AudioWorkspacePersistenceRecord> {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    hasRawAudioPayload(value)
  ) {
    return fail(
      "AUDIO_RAW_PAYLOAD_REJECTED",
      "Persistence records contain metadata only; raw audio payloads are rejected.",
      "record",
    );
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== AUDIO200_PERSISTENCE_SCHEMA_VERSION) {
    return fail(
      "AUDIO_UNSUPPORTED_SCHEMA",
      "Persistence record schema is unsupported.",
      "record.schemaVersion",
    );
  }
  if (typeof candidate.projectId !== "string") {
    return fail(
      "AUDIO_INVALID_ID",
      "Persistence Project ID is invalid.",
      "record.projectId",
    );
  }
  try {
    asAudioProjectId(candidate.projectId);
  } catch {
    return fail(
      "AUDIO_INVALID_ID",
      "Persistence Project ID is invalid.",
      "record.projectId",
    );
  }
  if (!validClock(candidate.framesPerSecond, 1, 240)) {
    return fail(
      "AUDIO_UI_INVALID",
      "Persisted animation FPS is outside 1–240.",
      "record.framesPerSecond",
    );
  }
  if (!validClock(candidate.ppq, 24, 3_840)) {
    return fail(
      "AUDIO_INVALID_NUMBER",
      "Persisted PPQ is outside the supported range.",
      "record.ppq",
    );
  }
  if (!validPersistenceSettings(candidate.settings)) {
    return fail(
      "AUDIO_UI_INVALID",
      "Persisted Audio editing settings are invalid.",
      "record.settings",
    );
  }
  if (!validTimestamp(candidate.savedAt)) {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Persistence timestamp is invalid.",
      "record.savedAt",
    );
  }
  if (
    candidate.checkpoint === null || typeof candidate.checkpoint !== "object"
  ) {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Persistence checkpoint is missing.",
      "record.checkpoint",
    );
  }
  if (
    candidate.journal === null || typeof candidate.journal !== "object" ||
    Array.isArray(candidate.journal)
  ) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Persistence journal is missing.",
      "record.journal",
    );
  }
  return audioOk(candidate as unknown as AudioWorkspacePersistenceRecord);
}

/** Strict validation used before a record is written or trusted. */
export async function validateAudioPersistenceRecord(
  value: unknown,
): Promise<Audio200Result<AudioWorkspacePersistenceRecord>> {
  const shape = persistenceShape(value);
  if (!shape.ok) return shape;
  const record = shape.value;
  const compactTail = isCompactTailJournal(record.journal);
  const expandedJournal = await expandPersistenceJournal(record);
  if (!expandedJournal.ok) return expandedJournal;
  const journalState = expandedJournal.value;
  if (record.assetCatalog !== undefined) {
    const catalog = validateAudioAssetCatalog(record.assetCatalog);
    if (!catalog.ok) return catalog;
  }
  const checkpoint = record.checkpoint;
  const checkpointProject = await validateAudioProject(checkpoint.state);
  if (!checkpointProject.ok) return checkpointProject;
  if (
    checkpoint.projectId !== record.projectId ||
    checkpoint.state.projectId !== record.projectId ||
    checkpoint.stateHash !== checkpoint.state.stateHash ||
    checkpoint.projectRevision !== checkpoint.state.projectRevision
  ) {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Checkpoint identity or state hash does not match the persisted Project.",
      "record.checkpoint",
    );
  }
  const journal = journalState;
  if (record.assetCatalog !== undefined) {
    const catalogBinding = validateAudioAssetCatalogAgainstProject(
      record.assetCatalog,
      journal.project,
    );
    if (!catalogBinding.ok) return catalogBinding;
  }
  if (journal.project.projectId !== record.projectId) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Journal Project ID does not match the persistence key.",
      "record.journal.project.projectId",
    );
  }
  const journalValid = await validateAudioJournalState(journal);
  if (!journalValid.ok) return journalValid;
  if (
    record.projectRevision !== undefined &&
    (!Number.isSafeInteger(record.projectRevision) ||
      record.projectRevision !== journal.project.projectRevision)
  ) {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Persistence Project revision does not match the journal head.",
      "record.projectRevision",
    );
  }
  if (compactTail) {
    if (
      checkpoint.journalSequence !== 0 || checkpoint.journalHeadHash !== null
    ) {
      return fail(
        "AUDIO_CHECKPOINT_INVALID",
        "Compact journal Checkpoint must start at sequence zero.",
        "record.checkpoint.journalSequence",
      );
    }
    const recovered = await recoverAudioProject(checkpoint, journal.entries);
    if (!recovered.ok) return recovered;
    if (recovered.value.project.stateHash !== journal.project.stateHash) {
      return fail(
        "AUDIO_JOURNAL_INVALID",
        "Compact journal tail does not recover the persisted Project head.",
        "record.journal.project.stateHash",
      );
    }
  } else {
    if (journal.project.stateHash !== checkpoint.stateHash) {
      return fail(
        "AUDIO_JOURNAL_INVALID",
        "Persisted journal state does not match the checkpoint state.",
        "record.journal.project.stateHash",
      );
    }
    if (
      journal.entries.length !== checkpoint.journalSequence ||
      (journal.entries.at(-1)?.entryHash ?? null) !== checkpoint.journalHeadHash
    ) {
      return fail(
        "AUDIO_CHECKPOINT_INVALID",
        "Checkpoint does not bind the persisted journal head.",
        "record.checkpoint.journalHeadHash",
      );
    }
  }
  return audioOk(record);
}

export async function createAudioPersistenceRecord(
  session: AudioWorkspaceSession,
  checkpointId: string,
  savedAt: string,
  settings?: AudioWorkspacePersistenceSettings,
): Promise<Audio200Result<AudioWorkspacePersistenceRecord>> {
  if (!validTimestamp(savedAt)) {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Persistence timestamp is invalid.",
      "savedAt",
    );
  }
  if (!validClock(session.framesPerSecond, 1, 240)) {
    return fail(
      "AUDIO_UI_INVALID",
      "Workspace animation FPS is invalid.",
      "session.framesPerSecond",
    );
  }
  if (!validClock(session.ppq, 24, 3_840)) {
    return fail(
      "AUDIO_INVALID_NUMBER",
      "Workspace PPQ is invalid.",
      "session.ppq",
    );
  }
  if (!validPersistenceSettings(settings)) {
    return fail(
      "AUDIO_UI_INVALID",
      "Audio editing settings are invalid.",
      "settings",
    );
  }
  const journal = await validateAudioJournalState(session.journal);
  if (!journal.ok) return journal;
  const catalogBinding = validateAudioAssetCatalogAgainstProject(
    session.assetCatalog,
    session.journal.project,
  );
  if (!catalogBinding.ok) return catalogBinding;
  let canonicalCheckpointId: AudioCheckpoint["checkpointId"];
  try {
    canonicalCheckpointId = asAudioCheckpointId(checkpointId);
  } catch {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Checkpoint ID is invalid.",
      "checkpointId",
    );
  }
  const shouldCompact = session.journal.entries.length >
    AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES;
  let checkpointJournal = session.journal;
  let persistedEntries = session.journal.entries;
  let persistedUndoStack = session.journal.undoStack.map((entry) =>
    entry.entryId
  );
  let persistedRedoStack = session.journal.redoStack.map((entry) =>
    entry.entryId
  );
  let compactTail = false;
  if (shouldCompact) {
    const tailStart = session.journal.entries.length -
      AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES;
    const tail = session.journal.entries.slice(tailStart);
    const rebased = await rebaseAudioJournalEntries(tail);
    if (!rebased.ok) return rebased;
    const baseProject = tail[0]?.beforeState ?? session.project;
    checkpointJournal = {
      project: baseProject,
      entries: [],
      undoStack: [],
      redoStack: [],
    };
    persistedEntries = rebased.value;
    const rebasedById = new Map(
      rebased.value.map((entry) => [String(entry.entryId), entry]),
    );
    persistedUndoStack = session.journal.undoStack
      .map((entry) => rebasedById.get(String(entry.entryId))?.entryId)
      .filter((entryId): entryId is AudioJournalEntryId =>
        entryId !== undefined
      );
    persistedRedoStack = session.journal.redoStack
      .map((entry) => rebasedById.get(String(entry.entryId))?.entryId)
      .filter((entryId): entryId is AudioJournalEntryId =>
        entryId !== undefined
      );
    compactTail = true;
  }
  const checkpoint = await createAudioCheckpoint(
    checkpointJournal,
    canonicalCheckpointId,
    savedAt,
  );
  if (!checkpoint.ok) return checkpoint;
  const record: AudioWorkspacePersistenceRecord = {
    schemaVersion: AUDIO200_PERSISTENCE_SCHEMA_VERSION,
    projectId: session.project.projectId,
    checkpoint: checkpoint.value,
    journal: {
      entries: persistedEntries,
      undoStack: persistedUndoStack,
      redoStack: persistedRedoStack,
      ...(compactTail ? { mode: "COMPACT_TAIL" as const } : {}),
    },
    framesPerSecond: session.framesPerSecond,
    ppq: session.ppq,
    ...(settings === undefined ? {} : { settings }),
    projectRevision: session.project.projectRevision,
    assetCatalog: session.assetCatalog,
    savedAt,
  };
  return audioOk(record);
}

function sessionFromRecord(
  record: AudioWorkspacePersistenceRecord,
  project: AudioWorkspaceSession["project"],
  journal: AudioJournalState,
  diagnostics: readonly Audio200Diagnostic[] = [],
): Audio200Result<AudioWorkspaceSession> {
  return audioOk({
    schemaVersion: AUDIO200_UI_SCHEMA_VERSION,
    project,
    journal: { ...journal, project },
    framesPerSecond: record.framesPerSecond,
    ppq: record.ppq,
    assetCatalog: record.assetCatalog ?? createAudioAssetCatalog(),
  }, diagnostics);
}

/**
 * Rebind a legacy Audio subdocument to the Workspace Project ID.
 *
 * The old fixed-key record is intentionally left untouched. Migration keeps
 * its current canonical metadata and resets only the journal references so a
 * new hash chain can start under the new parent Project identity.
 */
export async function rekeyAudioWorkspaceSessionProject(
  session: AudioWorkspaceSession,
  projectId: string,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  let canonicalProjectId: AudioProjectId;
  try {
    canonicalProjectId = asAudioProjectId(projectId);
  } catch {
    return fail(
      "AUDIO_INVALID_ID",
      "Workspace Project ID cannot be used as an Audio Project ID.",
      "projectId",
    );
  }
  const draft = {
    ...session.project,
    projectId: canonicalProjectId,
    stateHash: "0".repeat(64) as AudioWorkspaceSession["project"]["stateHash"],
  };
  const valid = await validateAudioProject(draft, false);
  if (!valid.ok) return valid;
  const hash = await hashAudioProjectState(draft);
  if (!hash.ok) return hash;
  const project = { ...draft, stateHash: hash.value };
  const catalogBinding = validateAudioAssetCatalogAgainstProject(
    session.assetCatalog,
    project,
  );
  if (!catalogBinding.ok) return catalogBinding;
  return audioOk({
    ...session,
    project,
    journal: {
      project,
      entries: [],
      undoStack: [],
      redoStack: [],
    },
  });
}

/**
 * Restore a record. If the journal tail is damaged, the last valid checkpoint
 * is returned with a recoverable diagnostic and a fresh empty edit history.
 * Clearing the damaged history is intentional: it prevents a later command
 * from extending a broken hash chain.
 */
export async function restoreAudioPersistenceRecord(
  value: unknown,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const shape = persistenceShape(value);
  if (!shape.ok) return shape;
  const record = shape.value;
  const compactTail = isCompactTailJournal(record.journal);
  const expandedJournal = await expandPersistenceJournal(record);
  if (!expandedJournal.ok) return expandedJournal;
  const journal = expandedJournal.value;
  if (record.assetCatalog !== undefined) {
    const catalog = validateAudioAssetCatalog(record.assetCatalog);
    if (!catalog.ok) return catalog;
  }
  const checkpointProject = await validateAudioProject(record.checkpoint.state);
  if (!checkpointProject.ok) return checkpointProject;
  if (
    record.checkpoint.projectId !== record.projectId ||
    record.checkpoint.state.projectId !== record.projectId ||
    record.checkpoint.stateHash !== record.checkpoint.state.stateHash
  ) {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Checkpoint identity or hash is invalid.",
      "record.checkpoint",
    );
  }
  if (record.assetCatalog !== undefined && !compactTail) {
    const checkpointCatalogBinding = validateAudioAssetCatalogAgainstProject(
      record.assetCatalog,
      record.checkpoint.state,
    );
    if (!checkpointCatalogBinding.ok) return checkpointCatalogBinding;
  }
  const journalValid = await validateAudioJournalState(journal);
  if (journalValid.ok) {
    if (
      record.projectRevision !== undefined &&
      (!Number.isSafeInteger(record.projectRevision) ||
        record.projectRevision !== journal.project.projectRevision)
    ) {
      return fail(
        "AUDIO_CHECKPOINT_INVALID",
        "Persistence Project revision does not match the journal head.",
        "record.projectRevision",
      );
    }
    if (record.assetCatalog !== undefined) {
      const catalogBinding = validateAudioAssetCatalogAgainstProject(
        record.assetCatalog,
        journal.project,
      );
      if (!catalogBinding.ok) return catalogBinding;
    }
    const recovered = await recoverAudioProject(
      record.checkpoint,
      journal.entries,
    );
    if (!recovered.ok) return recovered;
    if (
      recovered.value.project.projectId !== record.projectId ||
      recovered.value.project.stateHash !== journal.project.stateHash
    ) {
      return fail(
        "AUDIO_JOURNAL_INVALID",
        "Recovered Project does not match the persisted journal head.",
        "record.journal.project",
      );
    }
    return sessionFromRecord(
      record,
      recovered.value.project,
      journal,
      recovered.value.diagnostics,
    );
  }

  // Find a valid prefix without trusting any corrupted entry. This is bounded
  // by the journal's 1,000,000-entry guard; normal Audio-200 journals are much
  // smaller and this path runs only during recovery.
  const validPrefix: AudioJournalEntry[] = [];
  for (const entry of journal.entries) {
    const candidate = [...validPrefix, entry];
    const valid = await validateAudioJournalEntries(candidate);
    if (!valid.ok) break;
    validPrefix.push(entry);
  }
  const replayEntries = validPrefix.filter((entry) =>
    entry.sequence > record.checkpoint.journalSequence
  );
  const recovered = await recoverAudioProject(
    record.checkpoint,
    replayEntries,
  );
  const project = recovered.ok
    ? recovered.value.project
    : record.checkpoint.state;
  const diagnostic = audioDiagnostic(
    "AUDIO_JOURNAL_INVALID",
    "Journal tail was damaged; recovered the last valid checkpoint and reset edit history.",
    "record.journal.entries",
    true,
  );
  return sessionFromRecord(
    record,
    project,
    { project, entries: [], undoStack: [], redoStack: [] },
    [diagnostic, ...(recovered.ok ? recovered.value.diagnostics : [])],
  );
}

/** In-memory store used by unit tests and non-browser hosts. */
export function createMemoryAudioPersistenceStore(): AudioPersistenceStore {
  const records = new Map<string, AudioWorkspacePersistenceRecord>();
  return {
    async load(projectId) {
      return audioOk(records.get(projectId) ?? null);
    },
    async save(record) {
      const shape = persistenceShape(record);
      if (!shape.ok) return shape as Audio200Result<true>;
      const previous = records.get(record.projectId);
      if (!isNewerPersistenceRecord(record, previous)) {
        return audioOk(true, [
          audioDiagnostic(
            "AUDIO_STALE_PROJECT_REVISION",
            "An older persistence write was ignored.",
            "record.checkpoint.projectRevision",
            true,
          ),
        ]);
      }
      records.set(record.projectId, record);
      return audioOk(true);
    },
    async clear(projectId) {
      records.delete(projectId);
      return audioOk(true);
    },
  };
}

/**
 * Guard completion order as well as the store's revision comparison. This
 * prevents an older asynchronous save from being reported as the latest one.
 */
export function createLatestWriteAudioPersistenceStore(
  inner: AudioPersistenceStore,
): AudioPersistenceStore {
  let latestTicket = 0;
  return {
    load: (projectId) => inner.load(projectId),
    clear: (projectId) => inner.clear(projectId),
    async save(record) {
      const ticket = ++latestTicket;
      const result = await inner.save(record);
      if (ticket !== latestTicket && result.ok) {
        return audioOk(true, [
          audioDiagnostic(
            "AUDIO_STALE_PROJECT_REVISION",
            "A superseded persistence write completed without becoming current.",
            "record.checkpoint.projectRevision",
            true,
          ),
        ]);
      }
      return result;
    },
  };
}
