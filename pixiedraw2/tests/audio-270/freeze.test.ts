import {
  asAudioAssetId,
  asAudioProjectId,
  asAudioRevisionId,
  asSourceBlobId,
  createAudioPersistenceRecord,
  createAudioWorkspaceSession,
  createMemoryAudioAssetByteStore,
  journalWorkspaceAssetRevision,
  journalWorkspaceBounceInPlace,
  journalWorkspaceClipAdd,
  journalWorkspaceFreezeCommit,
  journalWorkspaceFreezeReactivate,
  journalWorkspaceNoteUpsert,
  journalWorkspaceUnfreeze,
  redoWorkspaceAudio,
  restoreAudioPersistenceRecord,
  undoWorkspaceAudio,
} from "../../src/audio/audio-200/index.ts";
import { canonicalizeSourceBlob } from "../../src/audio/audio-200/metadata-authority.ts";
import { renderOfflineAudio } from "../../src/audio/audio-260/index.ts";
import { bounceInPlace, freezeTrack } from "../../src/audio/audio-270/index.ts";
import type { AudioRevision } from "../../src/audio/audio-200/contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function writeText(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function wavFixture(
  samples: readonly number[],
  sampleRateHz = 8_000,
): Uint8Array {
  const dataLength = samples.length * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  writeText(bytes, 0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  writeText(bytes, 8, "WAVE");
  writeText(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(bytes, 36, "data");
  view.setUint32(40, dataLength, true);
  samples.forEach((sample, index) =>
    view.setInt16(44 + index * 2, sample, true)
  );
  return bytes;
}

async function sourceFixture(): Promise<
  { readonly bytes: Uint8Array; readonly revision: AudioRevision }
> {
  const bytes = wavFixture(Array.from({ length: 4_800 }, () => 12_000));
  const canonical = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("freeze-source-blob"),
    assetId: asAudioAssetId("freeze-source-asset"),
    revisionId: asAudioRevisionId("freeze-source-revision-1"),
    revisionNumber: 1,
    kind: "SONG",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/freeze-source/freeze-source.wav",
    },
    bytes,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  assert(canonical.ok, JSON.stringify(canonical.diagnostics));
  return { bytes, revision: canonical.value };
}

async function fixture() {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("freeze-project"),
    name: "Freeze Test",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const source = await sourceFixture();
  const imported = await journalWorkspaceAssetRevision(
    created.value,
    source.revision,
    "source.wav",
    { commandId: "freeze-import" },
  );
  assert(imported.ok, JSON.stringify(imported.diagnostics));
  const clip = await journalWorkspaceClipAdd(imported.value, {
    id: "clip:source",
    trackId: "BGM",
    revisionId: source.revision.revisionId,
    startFrame: 0,
    durationFrames: 12,
    sourceOffsetUs: 0,
    gainDb: -3,
    fadeInFrames: 1,
    fadeOutFrames: 1,
  }, { commandId: "freeze-clip" });
  assert(clip.ok, JSON.stringify(clip.diagnostics));
  const store = createMemoryAudioAssetByteStore();
  const stored = await store.put(source.revision, source.bytes);
  assert(stored.ok, JSON.stringify(stored.diagnostics));
  return { session: clip.value, source, store };
}

function workspaceClipInput(
  artifact: {
    readonly clip: {
      readonly timeline: {
        readonly startTick: number;
        readonly durationTick: number;
      };
      readonly clipId: string;
      readonly trackId: string;
      readonly revisionId: string;
    };
  },
  fps: number,
  bpm: number,
  ppq: number,
) {
  return {
    id: String(artifact.clip.clipId),
    trackId: String(artifact.clip.trackId),
    revisionId: String(artifact.clip.revisionId),
    startFrame: Math.round(
      artifact.clip.timeline.startTick * 60 * fps / (bpm * ppq),
    ),
    durationFrames: Math.max(
      1,
      Math.round(artifact.clip.timeline.durationTick * 60 * fps / (bpm * ppq)),
    ),
    sourceOffsetUs: 0,
  };
}

function pcm16(bytes: Uint8Array, frame: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getInt16(44 + frame * 2, true);
}

Deno.test("Phase 2-E Freeze reuses immutable audio, routes through Mixer, and unfreezes cleanly", async () => {
  const { session, store } = await fixture();
  const trackId = String(session.project.tracks[0]!.trackId);
  const sourceRender = await renderOfflineAudio({
    project: session.project,
    store,
    target: { kind: "STEM", trackId },
    sampleRateHz: 8_000,
    bitDepth: 16,
  });
  assert(
    sourceRender.ok && sourceRender.value.bytes !== null,
    "Source render failed.",
  );
  const artifact = await freezeTrack({
    project: session.project,
    store,
    trackId,
    framesPerSecond: 24,
    sampleRateHz: 8_000,
    bitDepth: 16,
  });
  assert(artifact.ok, JSON.stringify(artifact.diagnostics));
  assert(
    !artifact.value.reused && artifact.value.bytes !== null,
    "First Freeze was not rendered.",
  );
  const committed = await journalWorkspaceFreezeCommit(
    session,
    artifact.value.revision,
    "freeze.wav",
    workspaceClipInput(artifact.value, 24, 120, 480),
    artifact.value.sourceStateHash,
    { commandId: "freeze-commit" },
  );
  assert(committed.ok, JSON.stringify(committed.diagnostics));
  assert(
    committed.value.project.freezeStates?.[0]?.status === "ACTIVE",
    "Freeze was not activated.",
  );
  assert(
    committed.value.project.clips.length === session.project.clips.length + 1,
    "Original Clip was not retained.",
  );
  const frozenRender = await renderOfflineAudio({
    project: committed.value.project,
    store,
    target: { kind: "STEM", trackId },
    sampleRateHz: 8_000,
    bitDepth: 16,
  });
  assert(
    frozenRender.ok && frozenRender.value.bytes !== null,
    "Frozen render failed.",
  );
  assert(
    Math.abs(
      pcm16(sourceRender.value.bytes, 1_000) -
        pcm16(frozenRender.value.bytes, 1_000),
    ) < 8,
    "Frozen output did not preserve the pre-freeze Track result through Mixer.",
  );
  const unfreezed = await journalWorkspaceUnfreeze(
    committed.value,
    trackId,
    { commandId: "freeze-unfreeze" },
  );
  assert(unfreezed.ok, JSON.stringify(unfreezed.diagnostics));
  const unfrozenRender = await renderOfflineAudio({
    project: unfreezed.value.project,
    store,
    target: { kind: "STEM", trackId },
    sampleRateHz: 8_000,
    bitDepth: 16,
  });
  assert(
    unfrozenRender.ok && unfrozenRender.value.bytes !== null,
    "Unfrozen render failed.",
  );
  assert(
    pcm16(unfrozenRender.value.bytes, 1_000) ===
      pcm16(sourceRender.value.bytes, 1_000),
    "Unfreeze did not restore the original realtime source.",
  );
  const reused = await freezeTrack({
    project: unfreezed.value.project,
    store,
    trackId,
    framesPerSecond: 24,
    sampleRateHz: 8_000,
  });
  assert(
    reused.ok && reused.value.reused && reused.value.bytes === null,
    "Freeze did not reuse its existing OPFS artifact.",
  );
  const reactivated = await journalWorkspaceFreezeReactivate(
    unfreezed.value,
    trackId,
    reused.value.sourceStateHash,
    { commandId: "freeze-reactivate" },
  );
  assert(reactivated.ok, JSON.stringify(reactivated.diagnostics));
  assert(
    reactivated.value.project.freezeStates?.[0]?.status === "ACTIVE",
    "Existing Freeze did not reactivate.",
  );
  const persisted = await createAudioPersistenceRecord(
    reactivated.value,
    "freeze-checkpoint",
    "2026-08-18T00:01:00.000Z",
  );
  assert(persisted.ok, JSON.stringify(persisted.diagnostics));
  const restored = await restoreAudioPersistenceRecord(persisted.value);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(
    restored.value.project.freezeStates?.[0]?.status === "ACTIVE",
    "Reload did not preserve Freeze state.",
  );
});

Deno.test("Phase 2-E source changes stale a Freeze and Bounce remains Journal/Undo/Redo scoped", async () => {
  const { session, store } = await fixture();
  const trackId = String(session.project.tracks[0]!.trackId);
  const artifact = await freezeTrack({
    project: session.project,
    store,
    trackId,
    framesPerSecond: 24,
    sampleRateHz: 8_000,
  });
  assert(
    artifact.ok && artifact.value.bytes !== null,
    JSON.stringify(artifact.diagnostics),
  );
  const committed = await journalWorkspaceFreezeCommit(
    session,
    artifact.value.revision,
    "freeze.wav",
    workspaceClipInput(artifact.value, 24, 120, 480),
    artifact.value.sourceStateHash,
    { commandId: "freeze-commit-stale" },
  );
  assert(committed.ok, JSON.stringify(committed.diagnostics));
  const changed = await journalWorkspaceNoteUpsert(committed.value, {
    id: "note:source-change",
    pitchMidi: 72,
    startFrame: 0,
    durationFrames: 4,
    velocity: 0.8,
    instrument: "BGM",
  }, { commandId: "freeze-source-change" });
  assert(changed.ok, JSON.stringify(changed.diagnostics));
  assert(
    changed.value.project.freezeStates?.[0]?.status === "STALE",
    "Source change did not stale the Freeze.",
  );
  const bounced = await bounceInPlace({
    project: changed.value.project,
    store,
    trackId,
    framesPerSecond: 24,
    sampleRateHz: 8_000,
    bitDepth: 16,
  });
  assert(
    bounced.ok && bounced.value.bytes.byteLength > 44,
    JSON.stringify(bounced.diagnostics),
  );
  const bounceCommitted = await journalWorkspaceBounceInPlace(
    changed.value,
    bounced.value.revision,
    "bounce.wav",
    workspaceClipInput(bounced.value, 24, 120, 480),
    { commandId: "bounce-commit" },
  );
  assert(bounceCommitted.ok, JSON.stringify(bounceCommitted.diagnostics));
  const beforeUndo = bounceCommitted.value.project.clips.length;
  const undone = await undoWorkspaceAudio(bounceCommitted.value);
  assert(
    undone.ok && undone.value.project.clips.length === beforeUndo - 1,
    "Bounce Undo did not remove only the new Clip.",
  );
  const redone = await redoWorkspaceAudio(undone.value);
  assert(
    redone.ok && redone.value.project.clips.length === beforeUndo,
    "Bounce Redo did not restore the new Clip.",
  );
});
