import {
  appendAudioAssetRevision,
  asAudioAssetId,
  asAudioProjectId,
  asAudioRevisionId,
  asSourceBlobId,
  buildAudioWaveformPeakCache,
  createAudioAssetCatalog,
  createAudioPersistenceRecord,
  createAudioWorkspaceSession,
  createMemoryAudioAssetByteStore,
  inspectSourceBlob,
  journalWorkspaceAssetRevision,
  journalWorkspaceClipAdd,
  journalWorkspaceClipDuplicate,
  journalWorkspaceClipRemove,
  journalWorkspaceClipSplit,
  journalWorkspaceClipSplitAtTick,
  journalWorkspaceClipUpdate,
  projectAudioWaveformViewport,
  restoreAudioPersistenceRecord,
  selectAudioWaveformLevel,
  validateAudioAssetCatalog,
  validateAudioWaveformCache,
} from "../../src/audio/audio-200/index.ts";
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

async function revisionFixture(): Promise<
  { bytes: Uint8Array; revision: AudioRevision }
> {
  const bytes = wavFixture([
    -32_768,
    0,
    32_767,
    16_384,
    -16_384,
    0,
    8_000,
    -8_000,
  ]);
  const inspected = await inspectSourceBlob(bytes);
  assert(inspected.ok, JSON.stringify(inspected.diagnostics));
  const revision =
    await (await import("../../src/audio/audio-200/metadata-authority.ts"))
      .canonicalizeSourceBlob({
        blobId: asSourceBlobId("phase2-source"),
        assetId: asAudioAssetId("phase2-asset"),
        revisionId: asAudioRevisionId("phase2-revision-1"),
        revisionNumber: 1,
        kind: "SONG",
        locator: {
          placement: "OPFS",
          namespace: "audio",
          relativePath: "sources/phase2-asset/phase2-revision-1.wav",
        },
        bytes,
        createdAt: "2026-08-18T00:00:00.000Z",
      });
  assert(revision.ok, JSON.stringify(revision.diagnostics));
  return { bytes, revision: revision.value };
}

async function longRevisionFixture(): Promise<AudioRevision> {
  const bytes = wavFixture(
    Array.from(
      { length: 8_000 },
      (_, index) => Math.round(Math.sin(index / 20) * 24_000),
    ),
  );
  const canonical = await (await import(
    "../../src/audio/audio-200/metadata-authority.ts"
  )).canonicalizeSourceBlob({
    blobId: asSourceBlobId("phase2-long-source"),
    assetId: asAudioAssetId("phase2-long-asset"),
    revisionId: asAudioRevisionId("phase2-long-revision-1"),
    revisionNumber: 1,
    kind: "SONG",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/phase2-long-asset/phase2-long-revision-1.wav",
    },
    bytes,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  assert(canonical.ok, JSON.stringify(canonical.diagnostics));
  return canonical.value;
}

Deno.test("Phase 2-A1 catalog and byte store keep Asset metadata separate from bytes", async () => {
  const source = await revisionFixture();
  const catalog = appendAudioAssetRevision(
    createAudioAssetCatalog(),
    source.revision,
    "phase2.wav",
  );
  assert(catalog.ok, JSON.stringify(catalog.diagnostics));
  assert(
    catalog.value.assets[0]?.revisionIds.length === 1,
    "Asset revision was not registered.",
  );
  assert(
    !("bytes" in (catalog.value as unknown as Record<string, unknown>)),
    "Raw bytes crossed the catalog boundary.",
  );
  assert(
    validateAudioAssetCatalog(catalog.value).ok,
    "Asset catalog did not validate.",
  );

  const store = createMemoryAudioAssetByteStore();
  const stored = await store.put(source.revision, source.bytes);
  assert(stored.ok, JSON.stringify(stored.diagnostics));
  const loaded = await store.get(source.revision);
  assert(
    loaded.ok && loaded.value !== null,
    "Stored Audio bytes were not loaded.",
  );
  loaded.value[0] = loaded.value[0]! ^ 1;
  const loadedAgain = await store.get(source.revision);
  assert(
    loadedAgain.ok && loadedAgain.value !== null &&
      loadedAgain.value[0] === source.bytes[0],
    "Byte store leaked a mutable internal buffer.",
  );
  assert(
    (await store.remove(source.revision)).ok,
    "Audio Asset remove failed.",
  );
  const missing = await store.get(source.revision);
  assert(
    missing.ok && missing.value === null && missing.diagnostics[0]?.recoverable,
    "Missing source did not fail recoverably.",
  );
});

Deno.test("Phase 2-A3 workspace Clip move/trim/duplicate/remove is non-destructive and journaled", async () => {
  const source = await revisionFixture();
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("phase2-workspace"),
    name: "Phase 2 Workspace",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const imported = await journalWorkspaceAssetRevision(
    created.value,
    source.revision,
    "phase2.wav",
    { commandId: "phase2-import" },
  );
  assert(imported.ok, JSON.stringify(imported.diagnostics));
  assert(
    imported.value.project.revisions.length === 1 &&
      imported.value.assetCatalog.assets.length === 1,
    "Asset import did not update Project and catalog.",
  );
  const added = await journalWorkspaceClipAdd(imported.value, {
    id: "clip:one",
    trackId: "BGM",
    revisionId: source.revision.revisionId,
    startFrame: 0,
    durationFrames: 4,
    sourceOffsetUs: 0,
    fadeInFrames: 1,
    fadeOutFrames: 1,
  }, { commandId: "phase2-clip-add" });
  assert(added.ok, JSON.stringify(added.diagnostics));
  const updated = await journalWorkspaceClipUpdate(added.value, {
    id: "clip:one",
    trackId: "BGM",
    revisionId: source.revision.revisionId,
    startFrame: 8,
    durationFrames: 6,
    startTick: 337 as never,
    durationTick: 719 as never,
    sourceOffsetUs: 0,
    gainDb: -3,
  }, { commandId: "phase2-clip-update" });
  assert(updated.ok, JSON.stringify(updated.diagnostics));
  assert(
    updated.value.project.clips[0]?.timeline.startTick === 337 &&
      updated.value.project.clips[0]?.timeline.durationTick === 719,
    "Clip move re-derived canonical timing from the compatibility frames.",
  );
  const duplicated = await journalWorkspaceClipDuplicate(
    updated.value,
    "clip:one",
    "clip:two",
    20,
    { commandId: "phase2-clip-duplicate" },
  );
  assert(duplicated.ok, JSON.stringify(duplicated.diagnostics));
  assert(
    duplicated.value.project.clips.length === 2,
    "Clip duplicate was not added.",
  );
  const removed = await journalWorkspaceClipRemove(
    duplicated.value,
    "clip:one",
    { commandId: "phase2-clip-remove" },
  );
  assert(removed.ok, JSON.stringify(removed.diagnostics));
  assert(
    removed.value.project.clips.length === 1 &&
      removed.value.project.revisions.length === 1,
    "Clip removal deleted or damaged the shared Asset Revision.",
  );
  assert(
    removed.value.journal.entries.length === 5,
    "Clip operations did not produce one journal entry each.",
  );
  const record = await createAudioPersistenceRecord(
    removed.value,
    "phase2-checkpoint",
    "2026-08-18T00:01:00.000Z",
  );
  assert(record.ok, JSON.stringify(record.diagnostics));
  const restored = await restoreAudioPersistenceRecord(record.value);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(
    restored.value.assetCatalog.assets[0]?.sourceName === "phase2.wav",
    "Asset catalog was not persisted with the Project.",
  );
});

Deno.test("Phase 2-A4 waveform cache is hash-bound and viewport-projectable", async () => {
  const source = await revisionFixture();
  const cache = await buildAudioWaveformPeakCache(
    source.bytes,
    source.revision,
    { baseBucketSize: 2, levels: 3 },
  );
  assert(cache.ok, JSON.stringify(cache.diagnostics));
  assert(
    validateAudioWaveformCache(cache.value).ok,
    "Waveform cache did not validate.",
  );
  assert(
    cache.value.levels[0]?.peaks.length === 4,
    "Waveform level did not bucket source frames.",
  );
  assert(
    cache.value.levels[0]?.peaks[0]?.min === -1 &&
      cache.value.levels[0]?.peaks[0]?.max === 0,
    "Waveform min/max projection is incorrect.",
  );
  const selected = selectAudioWaveformLevel(cache.value, 2);
  assert(
    selected.ok && selected.value.bucketSize === 2,
    "Waveform level selection is incorrect.",
  );
  const viewport = projectAudioWaveformViewport(cache.value, 0, 8, 4);
  assert(
    viewport.ok && viewport.value.length === 4,
    "Waveform viewport projection failed.",
  );
  const modified = new Uint8Array(source.bytes);
  modified[44] = modified[44]! ^ 1;
  const rejected = await buildAudioWaveformPeakCache(modified, source.revision);
  assert(
    !rejected.ok && rejected.diagnostics[0]?.code === "AUDIO_RAW_BLOB_MODIFIED",
    "Waveform cache accepted modified source bytes.",
  );
});

Deno.test("Phase 2-B1 Clip split is one journaled non-destructive transaction", async () => {
  const revision = await longRevisionFixture();
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("phase2-b1-workspace"),
    name: "Phase 2-B1 Workspace",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const attached = await journalWorkspaceAssetRevision(
    created.value,
    revision,
    "phase2-b1.wav",
    { commandId: "phase2-b1-attach" },
  );
  assert(attached.ok, JSON.stringify(attached.diagnostics));
  const added = await journalWorkspaceClipAdd(attached.value, {
    id: "clip:b1-source",
    trackId: "BGM",
    revisionId: revision.revisionId,
    startFrame: 0,
    durationFrames: 24,
    sourceOffsetUs: 0,
    gainDb: -3,
    fadeInFrames: 4,
    fadeOutFrames: 4,
  }, { commandId: "phase2-b1-add" });
  assert(added.ok, JSON.stringify(added.diagnostics));
  const split = await journalWorkspaceClipSplit(
    added.value,
    "clip:b1-source",
    10,
    "clip:b1-left",
    "clip:b1-right",
    { commandId: "phase2-b1-split" },
  );
  assert(split.ok, JSON.stringify(split.diagnostics));
  assert(
    split.value.project.clips.length === 2 &&
      split.value.journal.entries.length === 3,
    "Split must replace one Clip with two Clips in one Journal entry.",
  );
  const left = split.value.project.clips.find((clip) =>
    clip.clipId === "clip:b1-left"
  );
  const right = split.value.project.clips.find((clip) =>
    clip.clipId === "clip:b1-right"
  );
  assert(left !== undefined && right !== undefined, "Split Clips are missing.");
  assert(
    left.revisionId === revision.revisionId &&
      right.revisionId === revision.revisionId &&
      left.timeline.startTick === 0 &&
      left.timeline.durationTick === 400 &&
      right.timeline.startTick === 400 &&
      right.timeline.durationTick === 560,
    "Split timeline ranges are not contiguous.",
  );
  assert(
    left.sourceOffsetUs === 0 && right.sourceOffsetUs === 416_667 &&
      left.gainMilliDb === -3_000 && right.gainMilliDb === -3_000 &&
      left.fadeInTick === 160 && left.fadeOutTick === 0 &&
      right.fadeInTick === 0 && right.fadeOutTick === 160,
    "Split did not preserve source binding, gain, and outer fade envelopes.",
  );
  assert(
    !JSON.stringify(split.value.project).includes("bytes") &&
      split.value.project.revisions.length === 1,
    "Split duplicated source bytes or revisions.",
  );
  const tickAdded = await journalWorkspaceClipAdd(split.value, {
    id: "clip:b1-tick-source",
    trackId: "BGM",
    revisionId: revision.revisionId,
    startFrame: 0,
    durationFrames: 12,
    startTick: 137 as never,
    durationTick: 719 as never,
    sourceOffsetUs: 0,
  }, { commandId: "phase2-b1-tick-add" });
  assert(tickAdded.ok, JSON.stringify(tickAdded.diagnostics));
  const tickSplit = await journalWorkspaceClipSplitAtTick(
    tickAdded.value,
    "clip:b1-tick-source",
    337 as never,
    "clip:b1-tick-left",
    "clip:b1-tick-right",
    { commandId: "phase2-b1-tick-split" },
  );
  assert(tickSplit.ok, JSON.stringify(tickSplit.diagnostics));
  const tickLeft = tickSplit.value.project.clips.find((clip) =>
    clip.clipId === "clip:b1-tick-left"
  );
  const tickRight = tickSplit.value.project.clips.find((clip) =>
    clip.clipId === "clip:b1-tick-right"
  );
  assert(
    tickLeft?.timeline.startTick === 137 &&
      tickLeft.timeline.durationTick === 200 &&
      tickRight?.timeline.startTick === 337 &&
      tickRight.timeline.durationTick === 519,
    "Tick split did not preserve the exact canonical ranges.",
  );
});
