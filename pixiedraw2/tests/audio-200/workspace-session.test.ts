import {
  asAudioNoteId,
  asAudioProjectId,
  type AudioWorkspaceNoteInput,
  checkpointWorkspaceAudio,
  createAudioWorkspaceSession,
  journalWorkspaceChipMachineSet,
  journalWorkspaceDrumKitSet,
  journalWorkspaceMarkerRemove,
  journalWorkspaceMarkerUpsert,
  journalWorkspaceMixerChannel,
  journalWorkspaceNoteRemove,
  journalWorkspaceNoteUpsert,
  journalWorkspaceSynthPresetRemove,
  journalWorkspaceSynthPresetReplace,
  journalWorkspaceTempo,
  journalWorkspaceTimelineBarClear,
  journalWorkspaceTrackRemove,
  redoWorkspaceAudio,
  undoWorkspaceAudio,
  validateAudioProject,
} from "../../src/audio/audio-200/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const note = (
  id: string,
  instrument: string,
  startFrame: number,
  durationFrames = 2,
): AudioWorkspaceNoteInput => ({
  id,
  instrument,
  pitchMidi: 60,
  startFrame,
  durationFrames,
  velocity: 0.8,
});

async function sessionFixture() {
  const result = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("audio-workspace-test"),
    name: "Workspace Journal Test",
    createdAt: "2026-08-17T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["PIANO", "GUITAR"],
    notes: [note("note:initial", "PIANO", 0)],
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
  return result.value;
}

Deno.test("AUDIO-200 workspace session projects frame notes into canonical state", async () => {
  const session = await sessionFixture();
  assert(
    session.journal.entries.length === 0,
    "Bootstrap state must not pollute the edit journal.",
  );
  assert(
    session.project.tracks.length === 2,
    "Instrument tracks were not created.",
  );
  assert(
    session.project.notes.length === 1,
    "Initial frame note was not projected.",
  );
  const initial = session.project.notes[0];
  assert(
    initial?.timeline.startTick === 0,
    "Frame zero did not map to tick zero.",
  );
  assert(
    initial?.timeline.durationTick === 80,
    "Two frames at 24 FPS/120 BPM should map to 80 ticks.",
  );
  const valid = await validateAudioProject(session.project);
  assert(valid.ok, JSON.stringify(valid.diagnostics));
});

Deno.test("AUDIO-200 workspace note edits are journaled and removable", async () => {
  const session = await sessionFixture();
  const added = await journalWorkspaceNoteUpsert(
    session,
    note("note:second", "GUITAR", 12, 3),
    { commandId: "workspace-note-add", issuedAt: "2026-08-17T00:01:00.000Z" },
  );
  assert(added.ok, JSON.stringify(added.diagnostics));
  assert(
    added.value.project.notes.length === 2,
    "Journaled note was not added.",
  );
  assert(
    added.value.project.notes.find((item) => item.noteId === "note:second")
      ?.timeline.startTick === 480,
    "Frame-to-tick conversion is incorrect.",
  );
  assert(
    added.value.journal.entries.length === 1,
    "Note add did not append one journal entry.",
  );

  const resized = await journalWorkspaceNoteUpsert(
    added.value,
    note("note:second", "GUITAR", 12, 6),
    {
      commandId: "workspace-note-resize",
      issuedAt: "2026-08-17T00:02:00.000Z",
    },
  );
  assert(resized.ok, JSON.stringify(resized.diagnostics));
  assert(
    resized.value.project.notes.find((item) => item.noteId === "note:second")
      ?.timeline.durationTick === 240,
    "Note resize did not update canonical duration.",
  );

  const removed = await journalWorkspaceNoteRemove(
    resized.value,
    "note:second",
    {
      commandId: "workspace-note-remove",
      issuedAt: "2026-08-17T00:03:00.000Z",
    },
  );
  assert(removed.ok, JSON.stringify(removed.diagnostics));
  assert(
    !removed.value.project.notes.some((item) => item.noteId === "note:second"),
    "Note remove left the canonical note behind.",
  );
  assert(
    removed.value.project.tracks.every((track) =>
      !track.noteIds.includes(asAudioNoteId("note:second"))
    ),
    "Note remove left a dangling Track reference.",
  );
});

Deno.test("AUDIO-200 track removal cascades notes and mixer routing", async () => {
  const session = await sessionFixture();
  const added = await journalWorkspaceNoteUpsert(
    session,
    note("note:guitar-track", "GUITAR", 8),
    { commandId: "workspace-guitar-note" },
  );
  assert(added.ok, JSON.stringify(added.diagnostics));
  const guitar = added.value.project.tracks.find((track) =>
    track.name === "GUITAR"
  );
  assert(guitar !== undefined, "Guitar Track was not present before removal.");
  assert(
    added.value.project.notes.some((item) =>
      item.noteId === "note:guitar-track"
    ),
    "Guitar note was not present before removal.",
  );

  const removed = await journalWorkspaceTrackRemove(
    added.value,
    "instrument:guitar",
    { commandId: "workspace-guitar-track-remove" },
  );
  assert(removed.ok, JSON.stringify(removed.diagnostics));
  assert(
    !removed.value.project.tracks.some((track) => track.name === "GUITAR"),
    "Track removal left the canonical Guitar Track behind.",
  );
  assert(
    !removed.value.project.notes.some((item) =>
      item.noteId === "note:guitar-track"
    ),
    "Track removal left the Guitar note behind.",
  );
  assert(
    !removed.value.project.mixer.channels.some((channel) =>
      channel.trackId === guitar.trackId
    ),
    "Track removal left the Guitar Mixer channel behind.",
  );
  assert(
    removed.value.project.tracks.some((track) => track.name === "PIANO"),
    "Removing one Track unexpectedly removed the other Tracks.",
  );
});

Deno.test("AUDIO-200 accepts Tick-native note edits without frame rounding", async () => {
  const session = await sessionFixture();
  const edited = await journalWorkspaceNoteUpsert(
    session,
    {
      id: "note:tick-native",
      instrument: "PIANO",
      pitchMidi: 64,
      startTick: 137 as never,
      durationTick: 719 as never,
      // Deliberately conflicting compatibility projection. Tick is authoritative.
      startFrame: 0,
      durationFrames: 1,
      velocity: 0.75,
    },
    { commandId: "workspace-tick-native" },
  );
  assert(edited.ok, JSON.stringify(edited.diagnostics));
  const canonical = edited.value.project.notes.find((item) =>
    item.noteId === "note:tick-native"
  );
  assert(canonical !== undefined, "Tick-native note was not journaled");
  assert(
    canonical.timeline.startTick === 137 &&
      canonical.timeline.durationTick === 719,
    "Tick-native note was re-derived from the compatibility frame projection",
  );
});

Deno.test("AUDIO-200 workspace mixer journals gain, pan, mute, and solo", async () => {
  const session = await sessionFixture();
  const changed = await journalWorkspaceMixerChannel(
    session,
    {
      trackId: "PIANO",
      gainDb: -3.5,
      pan: 0.5,
      muted: true,
      solo: false,
    },
    {
      commandId: "workspace-mixer-piano",
      issuedAt: "2026-08-17T00:03:30.000Z",
    },
  );
  assert(changed.ok, JSON.stringify(changed.diagnostics));
  const piano = changed.value.project.tracks.find((track) =>
    track.name === "PIANO"
  );
  assert(piano !== undefined, "Canonical Piano Track was not created.");
  const channel = changed.value.project.mixer.channels.find((item) =>
    item.channelId === piano.mixerChannelId
  );
  assert(channel !== undefined, "Canonical Piano Mixer channel was not found.");
  assert(
    channel.gainMilliDb === -3_500,
    "Gain was not fixed-point normalized.",
  );
  assert(channel.panMilli === 500, "Pan was not fixed-point normalized.");
  assert(channel.muted && !channel.solo, "Mute/Solo state was not journaled.");
  assert(
    changed.value.journal.entries.length === 1,
    "Mixer edit did not append one journal entry.",
  );

  const invalidPan = await journalWorkspaceMixerChannel(
    changed.value,
    {
      trackId: "PIANO",
      gainDb: 0,
      pan: 1.1,
      muted: false,
      solo: true,
    },
    { commandId: "workspace-mixer-invalid-pan" },
  );
  assert(
    !invalidPan.ok && invalidPan.diagnostics[0]?.code === "AUDIO_INVALID_MIXER",
    "Out-of-range pan was accepted.",
  );
});

Deno.test("AUDIO-200 workspace undo/redo, tempo, and checkpoint preserve journal state", async () => {
  const session = await sessionFixture();
  const added = await journalWorkspaceNoteUpsert(
    session,
    note("note:undo", "PIANO", 8),
    { commandId: "workspace-undo-add", issuedAt: "2026-08-17T00:04:00.000Z" },
  );
  assert(added.ok, JSON.stringify(added.diagnostics));
  const undone = await undoWorkspaceAudio(added.value);
  assert(
    undone.ok && undone.value.project.notes.length === 1,
    "Workspace undo did not restore the baseline.",
  );
  const redone = await redoWorkspaceAudio(undone.value);
  assert(
    redone.ok && redone.value.project.notes.length === 2,
    "Workspace redo did not restore the note.",
  );
  const tempo = await journalWorkspaceTempo(
    redone.value,
    132,
    { commandId: "workspace-tempo", issuedAt: "2026-08-17T00:05:00.000Z" },
  );
  assert(
    tempo.ok && tempo.value.project.tempo.milliBpm === 132_000,
    "Tempo command was not projected.",
  );
  const checkpoint = await checkpointWorkspaceAudio(
    tempo.value,
    "workspace-checkpoint-1",
    "2026-08-17T00:06:00.000Z",
  );
  assert(checkpoint.ok, JSON.stringify(checkpoint.diagnostics));
  assert(
    checkpoint.value.stateHash === tempo.value.project.stateHash,
    "Checkpoint did not bind the canonical state hash.",
  );
  assert(
    checkpoint.value.journalSequence === tempo.value.journal.entries.length,
    "Checkpoint sequence did not match the Journal head.",
  );
});

Deno.test("AUDIO-200 timeline bar clear removes one bar atomically", async () => {
  const session = await sessionFixture();
  const inside = await journalWorkspaceNoteUpsert(
    session,
    note("note:bar-one", "GUITAR", 8),
    { commandId: "workspace-bar-one" },
  );
  assert(inside.ok, JSON.stringify(inside.diagnostics));
  const outside = await journalWorkspaceNoteUpsert(
    inside.value,
    note("note:bar-two", "GUITAR", 120),
    { commandId: "workspace-bar-two" },
  );
  assert(outside.ok, JSON.stringify(outside.diagnostics));
  const cleared = await journalWorkspaceTimelineBarClear(
    outside.value,
    { startFrame: 0, durationFrames: 96 },
    { commandId: "workspace-bar-clear" },
  );
  assert(cleared.ok, JSON.stringify(cleared.diagnostics));
  assert(
    cleared.value.project.notes.every((item) => item.noteId !== "note:bar-one"),
    "Selected bar note was not removed.",
  );
  assert(
    cleared.value.project.notes.some((item) => item.noteId === "note:bar-two"),
    "Content outside the selected bar was removed.",
  );
  assert(
    cleared.value.journal.entries.length === 3,
    "Bar clear must be one canonical Journal entry.",
  );
  const undone = await undoWorkspaceAudio(cleared.value);
  assert(
    undone.ok &&
      undone.value.project.notes.some((item) => item.noteId === "note:bar-one"),
    "Undo did not restore the cleared bar.",
  );
  const redone = await redoWorkspaceAudio(undone.value);
  assert(
    redone.ok &&
      !redone.value.project.notes.some((item) =>
        item.noteId === "note:bar-one"
      ),
    "Redo did not clear the selected bar again.",
  );
  const valid = await validateAudioProject(redone.value.project);
  assert(valid.ok, JSON.stringify(valid.diagnostics));
});

Deno.test("AUDIO-200 Drum Roll kit selection is canonical and undoable", async () => {
  const session = await sessionFixture();
  assert(
    session.project.drumKitId === "BASIC",
    "New Audio Projects must default to the Basic Drum Kit.",
  );
  const arcade = await journalWorkspaceDrumKitSet(
    session,
    "ARCADE",
    { commandId: "workspace-drum-kit-arcade" },
  );
  assert(arcade.ok, JSON.stringify(arcade.diagnostics));
  assert(
    arcade.value.project.drumKitId === "ARCADE" &&
      arcade.value.journal.entries.length === 1,
    "Drum Kit selection was not journaled canonically.",
  );
  const undone = await undoWorkspaceAudio(arcade.value);
  assert(
    undone.ok && (undone.value.project.drumKitId ?? "BASIC") === "BASIC",
    "Undo did not restore the previous Drum Kit.",
  );
  const redone = await redoWorkspaceAudio(undone.value);
  assert(
    redone.ok && redone.value.project.drumKitId === "ARCADE",
    "Redo did not restore the Drum Kit.",
  );
});

Deno.test("AUDIO-200 chip machine selection is canonical and undoable", async () => {
  const session = await sessionFixture();
  assert(
    session.project.chipMachineId === "NONE",
    "New Audio Projects must default to the free CHIP profile.",
  );
  const gameBoy = await journalWorkspaceChipMachineSet(
    session,
    "GAME_BOY",
    { commandId: "workspace-chip-machine-game-boy" },
  );
  assert(gameBoy.ok, JSON.stringify(gameBoy.diagnostics));
  assert(
    gameBoy.value.project.chipMachineId === "GAME_BOY" &&
      gameBoy.value.journal.entries.length === 1,
    "Chip machine selection was not journaled canonically.",
  );
  const undone = await undoWorkspaceAudio(gameBoy.value);
  assert(
    undone.ok && (undone.value.project.chipMachineId ?? "NONE") === "NONE",
    "Undo did not restore the free CHIP profile.",
  );
  const redone = await redoWorkspaceAudio(undone.value);
  assert(
    redone.ok && redone.value.project.chipMachineId === "GAME_BOY",
    "Redo did not restore the Game Boy profile.",
  );
});

Deno.test("AUDIO-200 custom voice presets are journaled and removable", async () => {
  const session = await sessionFixture();
  const saved = await journalWorkspaceSynthPresetReplace(
    session,
    {
      presetId: "voice:piano",
      instrumentId: "PIANO",
      name: "Glass Piano",
      baseVoiceId: "PIANO",
      waveform: "sine",
      dutyCycle: 0.5,
      attackMs: 12,
      decayMs: 680,
      sustain: 0.32,
      releaseMs: 460,
      filterType: "lowpass",
      filterFrequencyHz: 6_200,
      filterQ: 0.8,
      noiseColor: "white",
      transientLevel: 0.12,
      transientMs: 16,
      pitchStartRatio: 1,
      pitchSweepMs: 0,
      vibratoDepthCents: 3,
      vibratoRateHz: 5,
    },
    { commandId: "workspace-voice-piano-save" },
  );
  assert(saved.ok, JSON.stringify(saved.diagnostics));
  assert(
    saved.value.project.synthPresets?.[0]?.name === "Glass Piano" &&
      saved.value.journal.entries.length === 1,
    "Custom voice preset was not journaled canonically.",
  );
  const removed = await journalWorkspaceSynthPresetRemove(
    saved.value,
    "voice:piano",
    { commandId: "workspace-voice-piano-remove" },
  );
  assert(removed.ok, JSON.stringify(removed.diagnostics));
  assert(
    (removed.value.project.synthPresets ?? []).length === 0,
    "Custom voice preset was not removed.",
  );
  const valid = await validateAudioProject(removed.value.project);
  assert(valid.ok, JSON.stringify(valid.diagnostics));
});

Deno.test("AUDIO-200 workspace markers persist as canonical ticks and remove cleanly", async () => {
  const session = await sessionFixture();
  const added = await journalWorkspaceMarkerUpsert(
    session,
    { id: "marker:hit", frameId: "frame:4", frame: 4, label: "Hit" },
    {
      commandId: "workspace-marker-add",
      issuedAt: "2026-08-17T00:06:30.000Z",
    },
  );
  assert(added.ok, JSON.stringify(added.diagnostics));
  assert(added.value.project.markers.length === 1, "Marker was not added.");
  assert(
    added.value.project.markers[0]?.markerId === "marker:hit" &&
      added.value.project.markers[0]?.frameId === "frame:4",
    "Marker identity was not preserved.",
  );
  assert(
    added.value.project.markers[0]?.tick === 160,
    "Four frames at 24 FPS/120 BPM should map to 160 ticks.",
  );
  const removed = await journalWorkspaceMarkerRemove(
    added.value,
    "marker:hit",
    {
      commandId: "workspace-marker-remove",
      issuedAt: "2026-08-17T00:06:31.000Z",
    },
  );
  assert(removed.ok, JSON.stringify(removed.diagnostics));
  assert(
    removed.value.project.markers.length === 0,
    "Marker remove left the canonical marker behind.",
  );
  assert(
    removed.value.journal.entries.length === 2,
    "Marker add/remove should append two journal entries.",
  );
});

Deno.test("AUDIO-200 workspace session rejects invalid or duplicate frame notes", async () => {
  const duplicate = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("audio-workspace-duplicate"),
    name: "Duplicate",
    createdAt: "2026-08-17T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    notes: [note("same", "PIANO", 0), note("same", "PIANO", 4)],
  });
  assert(
    !duplicate.ok && duplicate.diagnostics[0]?.code === "AUDIO_DUPLICATE_ID",
    "Duplicate frame note IDs were accepted.",
  );
  const invalidRate = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("audio-workspace-invalid-rate"),
    name: "Invalid Rate",
    createdAt: "2026-08-17T00:00:00.000Z",
    framesPerSecond: 0,
    tempoBpm: 120,
  });
  assert(
    !invalidRate.ok && invalidRate.diagnostics[0]?.code === "AUDIO_UI_INVALID",
    "Invalid workspace FPS was accepted.",
  );
  const overflow = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("audio-workspace-overflow"),
    name: "Overflow",
    createdAt: "2026-08-17T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    notes: [note("too-long", "PIANO", 300_000_000, 1)],
  });
  assert(
    !overflow.ok && overflow.diagnostics[0]?.code === "AUDIO_OVERFLOW",
    "Frame-to-tick overflow was accepted.",
  );
});
