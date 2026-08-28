import {
  asAudioProjectId,
  AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES,
  createAudioPersistenceRecord,
  createLatestWriteAudioPersistenceStore,
  createMemoryAudioPersistenceStore,
  restoreAudioPersistenceRecord,
  setWorkspaceFrameRate,
} from "../../src/audio/audio-200/index.ts";
import {
  type AudioWorkspaceNoteInput,
  createAudioWorkspaceSession,
  journalWorkspaceNoteUpsert,
  redoWorkspaceAudio,
  undoWorkspaceAudio,
} from "../../src/audio/audio-200/workspace-session.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const note = (
  id: string,
  startFrame: number,
): AudioWorkspaceNoteInput => ({
  id,
  instrument: "PIANO",
  pitchMidi: 60,
  startFrame,
  durationFrames: 2,
  velocity: 0.8,
});

async function fixture() {
  const result = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("audio-persistence-test"),
    name: "Persistence Test",
    createdAt: "2026-08-17T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["PIANO"],
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
  return result.value;
}

const timestamp = (second: number): string =>
  `2026-08-17T00:00:${String(second).padStart(2, "0")}.000Z`;

Deno.test("AUDIO-200 persistence saves and restores canonical Project state", async () => {
  let session = await fixture();
  const added = await journalWorkspaceNoteUpsert(
    session,
    note("note:persisted", 8),
    { commandId: "persistence-note-add", issuedAt: timestamp(1) },
  );
  assert(added.ok, JSON.stringify(added.diagnostics));
  session = added.value;
  const record = await createAudioPersistenceRecord(
    session,
    "audio-checkpoint:persisted",
    timestamp(2),
  );
  assert(record.ok, JSON.stringify(record.diagnostics));
  assert(
    !("project" in record.value.journal),
    "New persistence records should keep the current Project in the Checkpoint only.",
  );
  assert(
    record.value.journal.undoStack.every((entry) => typeof entry === "string"),
    "New persistence records should store Undo entries as IDs.",
  );

  const store = createMemoryAudioPersistenceStore();
  const saved = await store.save(record.value);
  assert(saved.ok, JSON.stringify(saved.diagnostics));
  const loaded = await store.load(session.project.projectId);
  assert(
    loaded.ok && loaded.value !== null,
    "Persistence record was not loaded.",
  );
  const restored = await restoreAudioPersistenceRecord(loaded.value);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(
    restored.value.project.stateHash === session.project.stateHash,
    "Reload did not restore the canonical Project hash.",
  );
  assert(
    restored.value.project.notes.some((item) =>
      item.noteId === "note:persisted"
    ),
    "Reload did not restore the persisted note.",
  );
  assert(
    restored.value.framesPerSecond === 24 && restored.value.ppq === 480,
    "Animation clock metadata was not restored.",
  );
});

Deno.test("AUDIO-200 persistence keeps musical editing preferences separate from transient UI", async () => {
  const session = await fixture();
  const record = await createAudioPersistenceRecord(
    session,
    "audio-checkpoint:preferences",
    timestamp(2),
    { meter: "6/8", quantize: "1/32", snap: "1/16" },
  );
  assert(record.ok, JSON.stringify(record.diagnostics));
  assert(
    record.value.settings?.meter === "6/8" &&
      record.value.settings.quantize === "1/32" &&
      record.value.settings.snap === "1/16",
    "Musical editing preferences were not written to the persistence envelope.",
  );
  const restored = await restoreAudioPersistenceRecord(record.value);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(
    restored.value.framesPerSecond === 24 && restored.value.ppq === 480,
    "Restoring preferences must not change the canonical Audio clock.",
  );
});

Deno.test("AUDIO-200 persistence keeps Undo/Redo stacks across reload", async () => {
  let session = await fixture();
  const added = await journalWorkspaceNoteUpsert(
    session,
    note("note:undo-reload", 4),
    { commandId: "persistence-undo-add", issuedAt: timestamp(3) },
  );
  assert(added.ok, JSON.stringify(added.diagnostics));
  const undone = await undoWorkspaceAudio(added.value);
  assert(undone.ok, JSON.stringify(undone.diagnostics));
  session = undone.value;
  assert(
    session.journal.undoStack.length === 0,
    "Undo stack was not consumed.",
  );
  assert(session.journal.redoStack.length === 1, "Redo stack was not created.");
  const record = await createAudioPersistenceRecord(
    session,
    "audio-checkpoint:undo-reload",
    timestamp(4),
  );
  assert(record.ok, JSON.stringify(record.diagnostics));
  const restored = await restoreAudioPersistenceRecord(record.value);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(
    restored.value.journal.undoStack.length === 0,
    "Undo stack changed on reload.",
  );
  assert(
    restored.value.journal.redoStack.length === 1,
    "Redo stack was lost on reload.",
  );
  const redone = await redoWorkspaceAudio(restored.value);
  assert(redone.ok, JSON.stringify(redone.diagnostics));
  assert(
    redone.value.project.notes.some((item) =>
      item.noteId === "note:undo-reload"
    ),
    "Redo after reload did not restore the note.",
  );
});

Deno.test("AUDIO-200 persistence compacts old history into a Checkpoint tail", async () => {
  let session = await fixture();
  for (let index = 0; index < 40; index += 1) {
    const added = await journalWorkspaceNoteUpsert(
      session,
      note(`note:compact-${index}`, 20 + index * 2),
      {
        commandId: `persistence-compact-${index}`,
        issuedAt: timestamp(20 + index),
      },
    );
    assert(added.ok, JSON.stringify(added.diagnostics));
    session = added.value;
  }
  const record = await createAudioPersistenceRecord(
    session,
    "audio-checkpoint:compact",
    timestamp(59),
  );
  assert(record.ok, JSON.stringify(record.diagnostics));
  assert(
    "mode" in record.value.journal &&
      record.value.journal.mode === "COMPACT_TAIL",
    "Long history did not switch to compact persistence.",
  );
  assert(
    record.value.journal.entries.length ===
      AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES,
    "Compact persistence did not retain the configured recent history window.",
  );
  assert(
    record.value.checkpoint.journalSequence === 0 &&
      record.value.checkpoint.journalHeadHash === null,
    "Compact persistence did not create a fresh base Checkpoint.",
  );
  assert(
    record.value.projectRevision === session.project.projectRevision,
    "Compact persistence lost the current Project revision ordering key.",
  );
  assert(
    JSON.stringify(record.value).length <
      JSON.stringify(session.journal).length,
    "Compact persistence did not reduce the serialized history size.",
  );
  const restored = await restoreAudioPersistenceRecord(record.value);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(
    restored.value.project.stateHash === session.project.stateHash,
    "Compact history did not recover the current Project head.",
  );
  assert(
    restored.value.journal.entries.length ===
      AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES,
    "Compact history was not restored as a bounded tail.",
  );
  const undone = await undoWorkspaceAudio(restored.value);
  assert(undone.ok, JSON.stringify(undone.diagnostics));
  assert(
    !undone.value.project.notes.some((item) =>
      item.noteId === "note:compact-39"
    ),
    "The most recent retained Undo entry did not remain usable.",
  );
});

Deno.test("AUDIO-200 persistence restores the pre-compression stack shape", async () => {
  let session = await fixture();
  const added = await journalWorkspaceNoteUpsert(
    session,
    note("note:legacy-stack", 6),
    { commandId: "persistence-legacy-stack", issuedAt: timestamp(12) },
  );
  assert(added.ok, JSON.stringify(added.diagnostics));
  session = added.value;
  const compact = await createAudioPersistenceRecord(
    session,
    "audio-checkpoint:legacy-stack",
    timestamp(13),
  );
  assert(compact.ok, JSON.stringify(compact.diagnostics));
  const legacy = {
    ...compact.value,
    journal: session.journal,
  };
  const restored = await restoreAudioPersistenceRecord(legacy);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(
    restored.value.journal.undoStack.length === 1,
    "Legacy full-entry Undo stack was not restored.",
  );
  assert(
    restored.value.project.notes.some((item) =>
      item.noteId === "note:legacy-stack"
    ),
    "Legacy full-entry persistence did not restore the Project.",
  );
});

Deno.test("AUDIO-200 persistence recovers a corrupted journal tail fail-closed", async () => {
  let session = await fixture();
  const added = await journalWorkspaceNoteUpsert(
    session,
    note("note:corrupt", 2),
    { commandId: "persistence-corrupt-add", issuedAt: timestamp(5) },
  );
  assert(added.ok, JSON.stringify(added.diagnostics));
  session = added.value;
  const record = await createAudioPersistenceRecord(
    session,
    "audio-checkpoint:corrupt",
    timestamp(6),
  );
  assert(record.ok, JSON.stringify(record.diagnostics));
  const corrupted = {
    ...record.value,
    journal: {
      ...record.value.journal,
      entries: record.value.journal.entries.map((entry, index) =>
        index === record.value.journal.entries.length - 1
          ? { ...entry, entryHash: "0".repeat(64) as typeof entry.entryHash }
          : entry
      ),
    },
  };
  const restored = await restoreAudioPersistenceRecord(corrupted);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(
    restored.diagnostics.some((item) =>
      item.code === "AUDIO_JOURNAL_INVALID" && item.recoverable
    ),
    "Corrupted tail did not produce a recoverable diagnostic.",
  );
  assert(
    restored.value.project.stateHash === record.value.checkpoint.stateHash,
    "Corrupted tail did not recover the checkpoint state.",
  );
  assert(
    restored.value.journal.entries.length === 0,
    "Broken history was not reset.",
  );
});

Deno.test("AUDIO-200 persistence ignores an older write after a newer revision", async () => {
  let initial = await fixture();
  const oldRecord = await createAudioPersistenceRecord(
    initial,
    "audio-checkpoint:old",
    timestamp(7),
  );
  assert(oldRecord.ok, JSON.stringify(oldRecord.diagnostics));
  const added = await journalWorkspaceNoteUpsert(
    initial,
    note("note:newer", 12),
    { commandId: "persistence-newer-add", issuedAt: timestamp(8) },
  );
  assert(added.ok, JSON.stringify(added.diagnostics));
  const newRecord = await createAudioPersistenceRecord(
    added.value,
    "audio-checkpoint:new",
    timestamp(9),
  );
  assert(newRecord.ok, JSON.stringify(newRecord.diagnostics));
  const store = createLatestWriteAudioPersistenceStore(
    createMemoryAudioPersistenceStore(),
  );
  assert((await store.save(newRecord.value)).ok, "Newer write failed.");
  const oldSave = await store.save(oldRecord.value);
  assert(oldSave.ok, "Older write should be safely ignored.");
  const loaded = await store.load(initial.project.projectId);
  assert(loaded.ok && loaded.value !== null, "Latest record disappeared.");
  assert(
    loaded.value.checkpoint.projectRevision ===
      newRecord.value.checkpoint.projectRevision,
    "Older asynchronous write rolled back the latest Project revision.",
  );
});

Deno.test("AUDIO-200 persistence protects same-revision clock metadata", async () => {
  const session = await fixture();
  const oldRecord = await createAudioPersistenceRecord(
    session,
    "audio-checkpoint:clock-old",
    timestamp(10),
  );
  assert(oldRecord.ok, JSON.stringify(oldRecord.diagnostics));
  const clockChanged = setWorkspaceFrameRate(session, 30);
  assert(clockChanged.ok, JSON.stringify(clockChanged.diagnostics));
  const newRecord = await createAudioPersistenceRecord(
    clockChanged.value,
    "audio-checkpoint:clock-new",
    timestamp(11),
  );
  assert(newRecord.ok, JSON.stringify(newRecord.diagnostics));
  assert(
    oldRecord.value.checkpoint.projectRevision ===
      newRecord.value.checkpoint.projectRevision,
    "Clock-only edits should keep the Project revision stable.",
  );
  const store = createMemoryAudioPersistenceStore();
  assert((await store.save(newRecord.value)).ok, "Newer clock write failed.");
  assert(
    (await store.save(oldRecord.value)).ok,
    "Older clock write was unsafe.",
  );
  const loaded = await store.load(session.project.projectId);
  assert(loaded.ok && loaded.value !== null, "Clock record disappeared.");
  assert(
    loaded.value.framesPerSecond === 30,
    "An older same-revision write rolled back the animation clock.",
  );
});

Deno.test("AUDIO-200 persistence rejects competing snapshots from one CAS base", async () => {
  const base = await fixture();
  const baseRecord = await createAudioPersistenceRecord(
    base,
    "audio-checkpoint:cas-base",
    timestamp(12),
  );
  assert(baseRecord.ok, JSON.stringify(baseRecord.diagnostics));
  const store = createMemoryAudioPersistenceStore();
  const baseSaved = await store.save(baseRecord.value);
  assert(baseSaved.ok, JSON.stringify(baseSaved.diagnostics));

  const firstEdit = await journalWorkspaceNoteUpsert(
    base,
    note("note:cas-first", 4),
    { commandId: "persistence-cas-first", issuedAt: timestamp(13) },
  );
  const secondEdit = await journalWorkspaceNoteUpsert(
    base,
    note("note:cas-second", 16),
    { commandId: "persistence-cas-second", issuedAt: timestamp(14) },
  );
  assert(firstEdit.ok, JSON.stringify(firstEdit.diagnostics));
  assert(secondEdit.ok, JSON.stringify(secondEdit.diagnostics));
  const [firstRecord, secondRecord] = await Promise.all([
    createAudioPersistenceRecord(
      firstEdit.value,
      "audio-checkpoint:cas-first",
      timestamp(15),
    ),
    createAudioPersistenceRecord(
      secondEdit.value,
      "audio-checkpoint:cas-second",
      timestamp(16),
    ),
  ]);
  assert(firstRecord.ok, JSON.stringify(firstRecord.diagnostics));
  assert(secondRecord.ok, JSON.stringify(secondRecord.diagnostics));
  assert(
    firstRecord.value.checkpoint.projectRevision ===
        secondRecord.value.checkpoint.projectRevision &&
      firstRecord.value.checkpoint.stateHash !==
        secondRecord.value.checkpoint.stateHash,
    "Competing Audio edits must share a revision but carry different state hashes.",
  );

  const options = {
    expectedProjectRevision: baseRecord.value.checkpoint.projectRevision,
    expectedStateHash: baseRecord.value.checkpoint.stateHash,
  };
  const results = await Promise.all([
    store.save(firstRecord.value, options),
    store.save(secondRecord.value, options),
  ]);
  const staleCount = results.filter((result) =>
    result.ok && result.diagnostics.some((item) =>
      item.code === "AUDIO_STALE_PROJECT_REVISION"
    )
  ).length;
  assert(staleCount === 1, "Two Audio tabs must not both persist competing edits.");
  assert(
    results.filter((result) => result.ok && result.diagnostics.length === 0)
      .length === 1,
    "Exactly one Audio CAS write should become the persisted snapshot.",
  );
  const loaded = await store.load(base.project.projectId);
  assert(loaded.ok && loaded.value !== null, "Audio CAS record disappeared.");
  assert(
    loaded.value.checkpoint.stateHash === firstRecord.value.checkpoint.stateHash ||
      loaded.value.checkpoint.stateHash === secondRecord.value.checkpoint.stateHash,
    "Persisted Audio state is not one of the accepted competing edits.",
  );
});
