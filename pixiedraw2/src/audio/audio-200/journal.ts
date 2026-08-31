/** Immutable journal, undo/redo, checkpoint, and offline recovery for AUDIO-200. */

import { hashCanonical } from "../../wp160-contracts.ts";
import {
  asAudioCheckpointId,
  asAudioContentHash,
  asAudioJournalEntryId,
  AUDIO200_CHECKPOINT_SCHEMA_VERSION,
  AUDIO200_JOURNAL_SCHEMA_VERSION,
  type Audio200Diagnostic,
  type Audio200Result,
  type AudioCheckpoint,
  type AudioCommand,
  audioFail,
  type AudioJournalEntry,
  audioOk,
  type AudioProject,
  type AudioSourceAvailability,
  type AudioSourceBlobLocator,
} from "./contracts.ts";
import {
  applyAudioCommand,
  type AudioCommandInput,
  createAudioCommand,
  hashAudioProjectState,
  validateAudioProject,
} from "./state.ts";

export interface AudioJournalState {
  readonly project: AudioProject;
  readonly entries: readonly AudioJournalEntry[];
  readonly undoStack: readonly AudioJournalEntry[];
  readonly redoStack: readonly AudioJournalEntry[];
}

export interface AudioRecoveryOptions {
  readonly sourceAvailability?: (
    locator: AudioSourceBlobLocator,
  ) => AudioSourceAvailability;
}

function fail<T>(
  code: Audio200Diagnostic["code"],
  message: string,
  path: string,
  recoverable = false,
): Audio200Result<T> {
  return audioFail(code, message, path, recoverable);
}

async function entryHash(
  entry: Omit<AudioJournalEntry, "entryHash">,
): Promise<AudioJournalEntry["entryHash"]> {
  return asAudioContentHash(await hashCanonical(entry));
}

async function makeEntry(
  sequence: number,
  kind: AudioJournalEntry["kind"],
  command: AudioCommand,
  beforeState: AudioProject,
  afterState: AudioProject,
  previousEntryHash: AudioJournalEntry["previousEntryHash"],
): Promise<AudioJournalEntry> {
  const base = {
    schemaVersion: AUDIO200_JOURNAL_SCHEMA_VERSION,
    entryId: asAudioJournalEntryId(
      `audio-journal:${sequence}:${command.commandId}`,
    ),
    sequence,
    kind,
    commandId: command.commandId,
    command,
    beforeState,
    afterState,
    previousEntryHash,
  } satisfies Omit<AudioJournalEntry, "entryHash">;
  return { ...base, entryHash: await entryHash(base) };
}

function duplicateCommand(
  entries: readonly AudioJournalEntry[],
  command: AudioCommand,
): Audio200Diagnostic | null {
  for (const entry of entries) {
    if (entry.command.commandId === command.commandId) {
      return {
        code: "AUDIO_DUPLICATE_COMMAND",
        message: "Command ID has already been journaled.",
        path: "command.commandId",
        recoverable: false,
      };
    }
    if (entry.command.idempotencyKey === command.idempotencyKey) {
      return {
        code: "AUDIO_IDEMPOTENCY_CONFLICT",
        message: "Idempotency key has already been journaled.",
        path: "command.idempotencyKey",
        recoverable: false,
      };
    }
  }
  return null;
}

export async function createAudioJournal(
  project: AudioProject,
): Promise<Audio200Result<AudioJournalState>> {
  const valid = await validateAudioProject(project);
  if (!valid.ok) return valid;
  return audioOk({ project, entries: [], undoStack: [], redoStack: [] });
}

export async function dispatchAudioCommand(
  journal: AudioJournalState,
  input: AudioCommandInput,
): Promise<Audio200Result<AudioJournalState>> {
  const command = createAudioCommand(input);
  if (!command.ok) return command;
  const duplicate = duplicateCommand(journal.entries, command.value);
  if (duplicate !== null) return { ok: false, diagnostics: [duplicate] };
  const applied = await applyAudioCommand(journal.project, command.value);
  if (!applied.ok) return applied;
  const previousEntryHash = journal.entries.at(-1)?.entryHash ?? null;
  const entry = await makeEntry(
    journal.entries.length + 1,
    "COMMAND",
    command.value,
    journal.project,
    applied.value,
    previousEntryHash,
  );
  return audioOk({
    project: applied.value,
    entries: [...journal.entries, entry],
    undoStack: [...journal.undoStack, entry],
    redoStack: [],
  });
}

async function appendStateTransition(
  journal: AudioJournalState,
  kind: "UNDO" | "REDO",
  sourceEntry: AudioJournalEntry,
  afterState: AudioProject,
): Promise<AudioJournalState> {
  const previousEntryHash = journal.entries.at(-1)?.entryHash ?? null;
  const entry = await makeEntry(
    journal.entries.length + 1,
    kind,
    sourceEntry.command,
    journal.project,
    afterState,
    previousEntryHash,
  );
  return {
    project: afterState,
    entries: [...journal.entries, entry],
    undoStack: kind === "UNDO"
      ? journal.undoStack.slice(0, -1)
      : [...journal.undoStack, sourceEntry],
    redoStack: kind === "UNDO"
      ? [...journal.redoStack, sourceEntry]
      : journal.redoStack.slice(0, -1),
  };
}

async function transitionState(
  current: AudioProject,
  target: AudioProject,
): Promise<Audio200Result<AudioProject>> {
  const next = { ...target, projectRevision: current.projectRevision + 1 };
  const shape = await validateAudioProject(next, false);
  if (!shape.ok) return shape;
  const hash = await hashAudioProjectState(next);
  if (!hash.ok) return hash;
  return audioOk({ ...next, stateHash: hash.value });
}

export async function undoAudio(
  journal: AudioJournalState,
): Promise<Audio200Result<AudioJournalState>> {
  const sourceEntry = journal.undoStack.at(-1);
  if (sourceEntry === undefined) {
    return fail(
      "AUDIO_NO_UNDO",
      "No command is available to undo.",
      "journal.undoStack",
      true,
    );
  }
  const next = await transitionState(journal.project, sourceEntry.beforeState);
  if (!next.ok) return next;
  return audioOk(
    await appendStateTransition(journal, "UNDO", sourceEntry, next.value),
  );
}

export async function redoAudio(
  journal: AudioJournalState,
): Promise<Audio200Result<AudioJournalState>> {
  const sourceEntry = journal.redoStack.at(-1);
  if (sourceEntry === undefined) {
    return fail(
      "AUDIO_NO_REDO",
      "No command is available to redo.",
      "journal.redoStack",
      true,
    );
  }
  const next = await transitionState(journal.project, sourceEntry.afterState);
  if (!next.ok) return next;
  return audioOk(
    await appendStateTransition(journal, "REDO", sourceEntry, next.value),
  );
}

export async function createAudioCheckpoint(
  journal: AudioJournalState,
  checkpointId: AudioCheckpoint["checkpointId"],
  createdAt: string,
): Promise<Audio200Result<AudioCheckpoint>> {
  const valid = await validateAudioProject(journal.project);
  if (!valid.ok) return valid;
  if (
    !Number.isSafeInteger(journal.entries.length) ||
    journal.entries.length > 1_000_000
  ) {
    return fail(
      "AUDIO_OVERFLOW",
      "Journal sequence exceeds the safe checkpoint range.",
      "journal.entries",
      false,
    );
  }
  try {
    asAudioCheckpointId(checkpointId);
  } catch {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Checkpoint ID is invalid.",
      "checkpointId",
    );
  }
  if (!Number.isFinite(Date.parse(createdAt))) {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Checkpoint timestamp is invalid.",
      "createdAt",
    );
  }
  return audioOk({
    schemaVersion: AUDIO200_CHECKPOINT_SCHEMA_VERSION,
    checkpointId,
    projectId: journal.project.projectId,
    projectRevision: journal.project.projectRevision,
    stateHash: journal.project.stateHash,
    journalHeadHash: journal.entries.at(-1)?.entryHash ?? null,
    journalSequence: journal.entries.length,
    state: journal.project,
    createdAt,
  });
}

async function verifyEntry(
  entry: AudioJournalEntry,
  expectedSequence: number,
  previousHash: AudioJournalEntry["entryHash"] | null,
): Promise<Audio200Result<true>> {
  if (
    entry.schemaVersion !== AUDIO200_JOURNAL_SCHEMA_VERSION ||
    entry.sequence !== expectedSequence ||
    entry.previousEntryHash !== previousHash
  ) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Journal sequence or hash chain is invalid.",
      `entries[${expectedSequence - 1}]`,
    );
  }
  const before = await validateAudioProject(entry.beforeState);
  if (!before.ok) return before;
  const after = await validateAudioProject(entry.afterState);
  if (!after.ok) return after;
  const { entryHash: _entryHash, ...material } = entry;
  const calculated = await entryHash(material);
  if (calculated !== entry.entryHash) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Journal entry hash does not match canonical metadata.",
      `entries[${expectedSequence - 1}].entryHash`,
    );
  }
  return audioOk(true);
}

/**
 * Verify a complete journal independently from a checkpoint.
 *
 * `recoverAudioProject` intentionally skips entries that are already covered
 * by a checkpoint. Persistence must still verify those entries before it
 * trusts a restored undo/redo history, so this small host-neutral validator is
 * kept beside the journal hash-chain implementation.
 */
export async function validateAudioJournalEntries(
  entries: readonly AudioJournalEntry[],
): Promise<Audio200Result<true>> {
  if (!Array.isArray(entries) || entries.length > 1_000_000) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Journal entries are outside the supported range.",
      "entries",
    );
  }
  let previousHash: AudioJournalEntry["entryHash"] | null = null;
  for (const [index, entry] of entries.entries()) {
    const verified = await verifyEntry(entry, index + 1, previousHash);
    if (!verified.ok) return verified;
    previousHash = entry.entryHash;
  }
  return audioOk(true);
}

/**
 * Rebase a retained journal tail onto a fresh checkpoint.
 *
 * The edit payloads (including entry IDs and before/after Project snapshots)
 * stay intact, while sequence numbers and the hash chain are recalculated from
 * one. This lets persistence keep only a recent Undo window without creating a
 * second command format or changing canonical Project state.
 */
export async function rebaseAudioJournalEntries(
  entries: readonly AudioJournalEntry[],
): Promise<Audio200Result<readonly AudioJournalEntry[]>> {
  if (!Array.isArray(entries) || entries.length > 1_000_000) {
    return fail(
      "AUDIO_JOURNAL_INVALID",
      "Journal tail is outside the supported range.",
      "entries",
    );
  }
  const rebased: AudioJournalEntry[] = [];
  let previousHash: AudioJournalEntry["entryHash"] | null = null;
  for (const [index, entry] of entries.entries()) {
    if (
      entry === null || typeof entry !== "object" ||
      entry.schemaVersion !== AUDIO200_JOURNAL_SCHEMA_VERSION
    ) {
      return fail(
        "AUDIO_JOURNAL_INVALID",
        "Journal tail contains an invalid entry.",
        `entries[${index}]`,
      );
    }
    const before = await validateAudioProject(entry.beforeState);
    if (!before.ok) return before;
    const after = await validateAudioProject(entry.afterState);
    if (!after.ok) return after;
    const { entryHash: _oldHash, ...source } = entry;
    const base: Omit<AudioJournalEntry, "entryHash"> = {
      ...source,
      sequence: index + 1,
      previousEntryHash: previousHash,
    };
    const rebasedEntry: AudioJournalEntry = {
      ...base,
      entryHash: await entryHash(base),
    };
    rebased.push(rebasedEntry);
    previousHash = rebasedEntry.entryHash;
  }
  return audioOk(rebased);
}

/** Verify entries plus the persisted project/undo/redo references. */
export async function validateAudioJournalState(
  journal: AudioJournalState,
): Promise<Audio200Result<true>> {
  const project = await validateAudioProject(journal.project);
  if (!project.ok) return project;
  const entries = await validateAudioJournalEntries(journal.entries);
  if (!entries.ok) return entries;
  if (journal.entries.length > 0) {
    const head = journal.entries.at(-1);
    if (
      head === undefined ||
      head.afterState.stateHash !== journal.project.stateHash
    ) {
      return fail(
        "AUDIO_JOURNAL_INVALID",
        "Journal head does not match the persisted Project state.",
        "journal.project.stateHash",
      );
    }
  }
  const entryById = new Map(
    journal.entries.map((entry) => [entry.entryId, entry]),
  );
  for (
    const [stackName, stack] of [
      ["undoStack", journal.undoStack],
      ["redoStack", journal.redoStack],
    ] as const
  ) {
    if (!Array.isArray(stack) || stack.length > journal.entries.length) {
      return fail(
        "AUDIO_JOURNAL_INVALID",
        "Undo/redo stack is outside the journal range.",
        `journal.${stackName}`,
      );
    }
    for (const [index, item] of stack.entries()) {
      const canonical = entryById.get(item.entryId);
      if (
        canonical === undefined || canonical.entryHash !== item.entryHash
      ) {
        return fail(
          "AUDIO_JOURNAL_INVALID",
          "Undo/redo stack references an unknown journal entry.",
          `journal.${stackName}[${index}]`,
        );
      }
    }
  }
  return audioOk(true);
}

export async function recoverAudioProject(
  checkpoint: AudioCheckpoint,
  entries: readonly AudioJournalEntry[],
  options: AudioRecoveryOptions = {},
): Promise<Audio200Result<import("./contracts.ts").AudioRecoveryResult>> {
  if (checkpoint.schemaVersion !== AUDIO200_CHECKPOINT_SCHEMA_VERSION) {
    return fail(
      "AUDIO_UNSUPPORTED_SCHEMA",
      "Checkpoint schema is unsupported.",
      "checkpoint.schemaVersion",
    );
  }
  const checkpointState = await validateAudioProject(checkpoint.state);
  if (
    !checkpointState.ok ||
    checkpoint.state.stateHash !== checkpoint.stateHash ||
    checkpoint.projectId !== checkpoint.state.projectId ||
    checkpoint.projectRevision !== checkpoint.state.projectRevision
  ) {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Checkpoint state or hash is invalid.",
      "checkpoint",
    );
  }
  let project = checkpoint.state;
  let previousHash: AudioJournalEntry["entryHash"] | null = null;
  let replayedEntries = 0;
  for (const entry of entries) {
    if (entry.sequence <= checkpoint.journalSequence) {
      previousHash = entry.entryHash;
      continue;
    }
    const verified = await verifyEntry(
      entry,
      checkpoint.journalSequence + replayedEntries + 1,
      previousHash ?? checkpoint.journalHeadHash,
    );
    if (!verified.ok) return verified;
    if (entry.beforeState.stateHash !== project.stateHash) {
      return fail(
        "AUDIO_JOURNAL_INVALID",
        "Journal replay does not start from the current recovered state.",
        `entries[${entry.sequence}].beforeState`,
      );
    }
    project = entry.afterState;
    previousHash = entry.entryHash;
    replayedEntries += 1;
  }
  const sourceAvailability: Record<string, AudioSourceAvailability> = {};
  const diagnostics: Audio200Diagnostic[] = [];
  for (const revision of project.revisions) {
    const availability =
      options.sourceAvailability?.(revision.source.locator) ?? "NOT_CHECKED";
    sourceAvailability[revision.revisionId] = availability;
    if (availability === "UNAVAILABLE") {
      diagnostics.push({
        code: "AUDIO_SOURCE_UNAVAILABLE",
        message:
          "Canonical metadata recovered, but the source locator is unavailable.",
        path: `revisions.${revision.revisionId}.source.locator`,
        recoverable: true,
      });
    }
  }
  return audioOk(
    { project, sourceAvailability, diagnostics, replayedEntries },
    diagnostics,
  );
}

export function journalMaterial(journal: AudioJournalState): string {
  return JSON.stringify({ project: journal.project, entries: journal.entries });
}
