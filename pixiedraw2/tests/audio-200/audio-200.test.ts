import {
  asAudioAssetId,
  asAudioAutomationId,
  asAudioCheckpointId,
  asAudioClipId,
  asAudioCommandId,
  asAudioEffectId,
  asAudioMixerChannelId,
  asAudioNoteId,
  asAudioProjectId,
  asAudioRevisionId,
  asAudioTrackId,
  asSourceBlobId,
  attachAudioRevision,
  type AudioProject,
  type AudioRevision,
  canonicalizeSourceBlob,
  createAudioCheckpoint,
  createAudioJournal,
  createAudioProject,
  dispatchAudioCommand,
  inspectSourceBlob,
  recoverAudioProject,
  redoAudio,
  undoAudio,
  validateAudioProject,
  verifySourceBlobAgainstRevision,
} from "../../src/audio/audio-200/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function wavFixture(sampleFrames = 8, sampleRateHz = 8_000): Uint8Array {
  const dataLength = sampleFrames * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataLength, true);
  for (let index = 44; index < bytes.length; index += 1) {
    bytes[index] = index % 13;
  }
  return bytes;
}

async function revisionFixture(): Promise<
  { readonly bytes: Uint8Array; readonly revision: AudioRevision }
> {
  const bytes = wavFixture();
  const inspected = await inspectSourceBlob(bytes);
  assert(inspected.ok, "WAV fixture was not inspected.");
  const result = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("source-1"),
    assetId: asAudioAssetId("asset-1"),
    revisionId: asAudioRevisionId("revision-1"),
    revisionNumber: 1,
    kind: "SONG",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/asset-1/revision-1.wav",
    },
    bytes,
    declared: {
      durationMs: inspected.value.durationUs / 1_000,
      sampleRateHz: 8_000,
      channels: 1,
      byteLength: bytes.byteLength,
      contentHash: inspected.value.contentHash,
      codec: "WAV_PCM",
    },
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
  return { bytes, revision: result.value };
}

async function projectFixture(): Promise<
  {
    readonly project: AudioProject;
    readonly revision: AudioRevision;
    readonly bytes: Uint8Array;
  }
> {
  const source = await revisionFixture();
  const created = await createAudioProject({
    projectId: asAudioProjectId("project-1"),
    name: "Deterministic Audio",
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const attached = await attachAudioRevision(created.value, source.revision);
  assert(attached.ok, JSON.stringify(attached.diagnostics));
  return {
    project: attached.value,
    revision: source.revision,
    bytes: source.bytes,
  };
}

function command(
  project: AudioProject,
  commandId: string,
  type: Parameters<typeof dispatchAudioCommand>[1]["type"],
  payload: Parameters<typeof dispatchAudioCommand>[1]["payload"],
  idempotencyKey = commandId,
): Parameters<typeof dispatchAudioCommand>[1] {
  return {
    commandId: asAudioCommandId(commandId),
    idempotencyKey,
    projectId: project.projectId,
    baseProjectRevision: project.projectRevision,
    type,
    payload,
    issuedAt: "2026-08-13T00:00:00.000Z",
  };
}

Deno.test("AUDIO-200 canonicalizes typed source metadata and fails closed on caller claims", async () => {
  const source = await revisionFixture();
  assert(
    source.revision.source.metadata.contentHash ===
      source.revision.source.locator.contentHash,
    "Source hash was not canonicalized.",
  );
  assert(
    !("bytes" in (source.revision as unknown as Record<string, unknown>)),
    "Raw bytes crossed the Revision boundary.",
  );
  const traversal = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("source-traversal"),
    assetId: asAudioAssetId("asset-1"),
    revisionId: asAudioRevisionId("revision-traversal"),
    revisionNumber: 1,
    kind: "CLIP",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/../private.wav",
    },
    bytes: source.bytes,
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  assert(
    !traversal.ok && traversal.diagnostics[0]?.code === "AUDIO_PATH_TRAVERSAL",
    "Path traversal was accepted.",
  );
  const mismatch = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("source-mismatch"),
    assetId: asAudioAssetId("asset-1"),
    revisionId: asAudioRevisionId("revision-mismatch"),
    revisionNumber: 1,
    kind: "CLIP",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/mismatch.wav",
    },
    bytes: source.bytes,
    declared: { sampleRateHz: Number.NaN },
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  assert(
    !mismatch.ok && mismatch.diagnostics[0]?.code === "AUDIO_METADATA_MISMATCH",
    "NaN/caller metadata was accepted.",
  );
  const rawClaims = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("source-raw-claims"),
    assetId: asAudioAssetId("asset-1"),
    revisionId: asAudioRevisionId("revision-raw-claims"),
    revisionNumber: 1,
    kind: "CLIP",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/raw-claims.wav",
    },
    bytes: source.bytes,
    declared: { samples: [1, 2, 3] } as never,
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  assert(
    !rawClaims.ok &&
      rawClaims.diagnostics[0]?.code === "AUDIO_RAW_PAYLOAD_REJECTED",
    "Raw caller claims were accepted.",
  );
  const modified = new Uint8Array(source.bytes);
  modified[modified.length - 1] = modified[modified.length - 1]! ^ 1;
  const changed = await verifySourceBlobAgainstRevision(
    modified,
    source.revision,
  );
  assert(
    !changed.ok && changed.diagnostics[0]?.code === "AUDIO_RAW_BLOB_MODIFIED",
    "Modified source bytes were accepted.",
  );
});

Deno.test("AUDIO-200 creates Project/Track/Clip/Note/Automation/Mixer/Effect state deterministically", async () => {
  const fixture = await projectFixture();
  const first = await createAudioProject({
    projectId: asAudioProjectId("same-project"),
    name: "Same",
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  const second = await createAudioProject({
    projectId: asAudioProjectId("same-project"),
    name: "Same",
    createdAt: "2026-08-13T00:00:00.000Z",
  });
  assert(
    first.ok && second.ok && first.value.stateHash === second.value.stateHash,
    "Project state hash is not deterministic.",
  );
  const journal = await createAudioJournal(fixture.project);
  assert(journal.ok, JSON.stringify(journal.diagnostics));
  const trackId = asAudioTrackId("track-1");
  const channelId = asAudioMixerChannelId("channel-1");
  let current = journal.value;
  const track = {
    trackId,
    kind: "AUDIO" as const,
    name: "Main",
    clipIds: [],
    noteIds: [],
    automationIds: [],
    effectIds: [],
    mixerChannelId: channelId,
    muted: false,
    solo: false,
  };
  let result = await dispatchAudioCommand(
    current,
    command(current.project, "cmd-track", "TRACK_ADD", { track }),
  );
  assert(result.ok, JSON.stringify(result.diagnostics));
  current = result.value;
  const clip = {
    clipId: asAudioClipId("clip-1"),
    trackId,
    revisionId: fixture.revision.revisionId,
    timeline: { startTick: 0 as never, durationTick: 240 as never },
    sourceOffsetUs: 0,
    gainMilliDb: 0,
    fadeInTick: 0 as never,
    fadeOutTick: 0 as never,
    loop: false,
  };
  result = await dispatchAudioCommand(
    current,
    command(current.project, "cmd-clip", "CLIP_ADD", { clip }),
  );
  assert(result.ok, JSON.stringify(result.diagnostics));
  current = result.value;
  const note = {
    noteId: asAudioNoteId("note-1"),
    trackId,
    pitchMidi: 60,
    timeline: { startTick: 0 as never, durationTick: 120 as never },
    velocityMilli: 900,
  };
  result = await dispatchAudioCommand(
    current,
    command(current.project, "cmd-note", "NOTE_UPSERT", { note }),
  );
  assert(result.ok, JSON.stringify(result.diagnostics));
  current = result.value;
  const automation = {
    automationId: asAudioAutomationId("automation-1"),
    target: { kind: "TRACK_GAIN" as const, targetId: trackId },
    points: [{ tick: 0 as never, value: 0 }, { tick: 120 as never, value: -3 }],
  };
  result = await dispatchAudioCommand(
    current,
    command(current.project, "cmd-automation", "AUTOMATION_UPSERT", {
      automation,
    }),
  );
  assert(result.ok, JSON.stringify(result.diagnostics));
  current = result.value;
  result = await dispatchAudioCommand(
    current,
    command(current.project, "cmd-effect", "EFFECT_UPSERT", {
      effect: {
        effectId: asAudioEffectId("effect-1"),
        kind: "GAIN",
        enabled: true,
        parameters: [{ name: "amount", value: -3 }],
      },
    }),
  );
  assert(result.ok, JSON.stringify(result.diagnostics));
  current = result.value;
  const valid = await validateAudioProject(current.project);
  assert(
    valid.ok && current.project.tracks[0]?.clipIds.length === 1 &&
      current.project.notes.length === 1 &&
      current.project.automations.length === 1 &&
      current.project.effects.length === 1,
    "Typed Audio state was not projected canonically.",
  );
  assert(
    current.project.mixer.channels[0]?.panMilli === 0,
    "New Track mixer channels must start centered.",
  );
  const invalidNumber = await validateAudioProject({
    ...current.project,
    tempo: { milliBpm: Number.NaN },
  });
  assert(
    !invalidNumber.ok &&
      invalidNumber.diagnostics[0]?.code === "AUDIO_INVALID_NUMBER",
    "NaN tempo was accepted.",
  );
  const overflow = await validateAudioProject({
    ...current.project,
    notes: [{
      ...note,
      timeline: { startTick: 9_000_000_000 as never, durationTick: 2 as never },
    }],
  });
  assert(
    !overflow.ok && overflow.diagnostics[0]?.code === "AUDIO_INVALID_NOTE",
    "Overflow timeline was accepted.",
  );
  const stale = await dispatchAudioCommand(
    current,
    command(
      {
        ...current.project,
        projectRevision: current.project.projectRevision - 1,
      },
      "cmd-stale",
      "TEMPO_SET",
      { tempo: { milliBpm: 121_000 } },
    ),
  );
  assert(
    !stale.ok && stale.diagnostics[0]?.code === "AUDIO_STALE_PROJECT_REVISION",
    "Stale command was accepted.",
  );
  const duplicate = await dispatchAudioCommand(
    current,
    command(current.project, "cmd-effect", "TEMPO_SET", {
      tempo: { milliBpm: 121_000 },
    }),
  );
  assert(
    !duplicate.ok &&
      duplicate.diagnostics[0]?.code === "AUDIO_DUPLICATE_COMMAND",
    "Duplicate command was accepted.",
  );
});

Deno.test("AUDIO-200 journal checkpoint, undo/redo, and recovery preserve canonical state", async () => {
  const fixture = await projectFixture();
  const created = await createAudioJournal(fixture.project);
  assert(created.ok, JSON.stringify(created.diagnostics));
  const track = {
    trackId: asAudioTrackId("track-recovery"),
    kind: "AUDIO" as const,
    name: "Recovery",
    clipIds: [],
    noteIds: [],
    automationIds: [],
    effectIds: [],
    mixerChannelId: asAudioMixerChannelId("channel-recovery"),
    muted: false,
    solo: false,
  };
  const first = await dispatchAudioCommand(
    created.value,
    command(created.value.project, "cmd-recovery-track", "TRACK_ADD", {
      track,
    }),
  );
  assert(first.ok, JSON.stringify(first.diagnostics));
  const checkpoint = await createAudioCheckpoint(
    first.value,
    asAudioCheckpointId("checkpoint-1"),
    "2026-08-13T00:01:00.000Z",
  );
  assert(checkpoint.ok, JSON.stringify(checkpoint.diagnostics));
  const note = {
    noteId: asAudioNoteId("note-recovery"),
    trackId: track.trackId,
    pitchMidi: 64,
    timeline: { startTick: 0 as never, durationTick: 100 as never },
    velocityMilli: 800,
  };
  const second = await dispatchAudioCommand(
    first.value,
    command(first.value.project, "cmd-recovery-note", "NOTE_UPSERT", { note }),
  );
  assert(second.ok, JSON.stringify(second.diagnostics));
  const undone = await undoAudio(second.value);
  assert(
    undone.ok && undone.value.project.notes.length === 0,
    "Undo did not restore the previous canonical state.",
  );
  const redone = await redoAudio(undone.value);
  assert(
    redone.ok && redone.value.project.notes.length === 1,
    "Redo did not restore the command state.",
  );
  const recovered = await recoverAudioProject(checkpoint.value, [
    ...second.value.entries,
  ], { sourceAvailability: () => "UNAVAILABLE" });
  assert(
    recovered.ok && recovered.value.replayedEntries === 1 &&
      recovered.value.project.notes.length === 1 &&
      recovered.value.diagnostics.some((item) =>
        item.code === "AUDIO_SOURCE_UNAVAILABLE"
      ),
    "Recovery did not replay and diagnose missing source metadata.",
  );
  const tampered = {
    ...checkpoint.value,
    stateHash: "f".repeat(64) as typeof checkpoint.value.stateHash,
  };
  const rejected = await recoverAudioProject(tampered, []);
  assert(
    !rejected.ok &&
      rejected.diagnostics[0]?.code === "AUDIO_CHECKPOINT_INVALID",
    "Tampered checkpoint was accepted.",
  );
});
