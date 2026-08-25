import {
  asAudioAssetId,
  asAudioProjectId,
  asAudioRevisionId,
  asSourceBlobId,
  createAudioWorkspaceSession,
  createMemoryAudioAssetByteStore,
  journalWorkspaceAssetRevision,
  journalWorkspaceClipAdd,
  journalWorkspaceMixerChannel,
} from "../../src/audio/audio-200/index.ts";
import { renderOfflineAudio } from "../../src/audio/audio-260/index.ts";
import { canonicalizeSourceBlob } from "../../src/audio/audio-200/metadata-authority.ts";
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
  { bytes: Uint8Array; revision: AudioRevision }
> {
  const bytes = wavFixture(
    Array.from({ length: 2_400 }, () => 16_000),
  );
  const canonical = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("render-source"),
    assetId: asAudioAssetId("render-asset"),
    revisionId: asAudioRevisionId("render-revision-1"),
    revisionNumber: 1,
    kind: "SONG",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/render-asset/render-revision-1.wav",
    },
    bytes,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  assert(canonical.ok, JSON.stringify(canonical.diagnostics));
  return { bytes, revision: canonical.value };
}

async function sessionFixture() {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("render-project"),
    name: "Offline Render",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM", "CHIP"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const source = await sourceFixture();
  const imported = await journalWorkspaceAssetRevision(
    created.value,
    source.revision,
    "render.wav",
    { commandId: "render-import" },
  );
  assert(imported.ok, JSON.stringify(imported.diagnostics));
  const firstClip = await journalWorkspaceClipAdd(imported.value, {
    id: "clip:bgm",
    trackId: "BGM",
    revisionId: source.revision.revisionId,
    startFrame: 0,
    durationFrames: 6,
    sourceOffsetUs: 0,
    fadeInFrames: 1,
    fadeOutFrames: 1,
    gainDb: -3,
  }, { commandId: "render-clip-bgm" });
  assert(firstClip.ok, JSON.stringify(firstClip.diagnostics));
  const secondClip = await journalWorkspaceClipAdd(firstClip.value, {
    id: "clip:chip",
    trackId: "CHIP",
    revisionId: source.revision.revisionId,
    startFrame: 0,
    durationFrames: 6,
    sourceOffsetUs: 0,
    loop: true,
  }, { commandId: "render-clip-chip" });
  assert(secondClip.ok, JSON.stringify(secondClip.diagnostics));
  return { session: secondClip.value, source };
}

function parseWav(bytes: Uint8Array): {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitDepth: number;
  readonly dataBytes: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    sampleRate: view.getUint32(24, true),
    channels: view.getUint16(22, true),
    bitDepth: view.getUint16(34, true),
    dataBytes: view.getUint32(40, true),
  };
}

function readPcm16(
  bytes: Uint8Array,
  frame: number,
  channel: number,
): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getInt16(44 + (frame * 2 + channel) * 2, true);
}

Deno.test("Phase 2-D master render mixes shared clips, notes, fades and mixer state without mutating Project", async () => {
  const { session, source } = await sessionFixture();
  const changedMixer = await journalWorkspaceMixerChannel(
    session,
    { trackId: "BGM", gainDb: -6, pan: -1, muted: false, solo: true },
    { commandId: "render-mixer-bgm" },
  );
  assert(changedMixer.ok, JSON.stringify(changedMixer.diagnostics));
  const before = changedMixer.value.project;
  const store = createMemoryAudioAssetByteStore();
  const stored = await store.put(source.revision, source.bytes);
  assert(stored.ok, JSON.stringify(stored.diagnostics));
  const rendered = await renderOfflineAudio({
    project: before,
    store,
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 256,
    onProgress: ({ ratio }) =>
      assert(ratio > 0 && ratio <= 1, "Invalid render progress."),
  });
  assert(rendered.ok, JSON.stringify(rendered.diagnostics));
  assert(rendered.value.bytes !== null, "Master render did not produce bytes.");
  const wav = parseWav(rendered.value.bytes);
  assert(
    wav.sampleRate === 8_000 && wav.channels === 2 && wav.bitDepth === 16,
    "WAV format was not preserved.",
  );
  assert(
    wav.dataBytes === rendered.value.frameCount * 4,
    "WAV data length is incorrect.",
  );
  assert(
    rendered.value.contentHash !== null,
    "Rendered content hash is missing.",
  );
  assert(
    rendered.value.projectRevision === before.projectRevision,
    "Render changed the Project revision.",
  );
  assert(
    rendered.value.projectStateHash === before.stateHash,
    "Render changed the Project state hash.",
  );
  assert(
    before.clips.length === 2 && before.revisions.length === 1,
    "Shared Asset/Clip state was changed by render.",
  );
  const leftSample = readPcm16(rendered.value.bytes, 1_000, 0);
  const rightSample = readPcm16(rendered.value.bytes, 1_000, 1);
  assert(
    leftSample > 2_000 && Math.abs(rightSample) < 100,
    "Gain/pan/solo were not reflected in rendered PCM.",
  );
  const muted = await journalWorkspaceMixerChannel(
    changedMixer.value,
    { trackId: "BGM", gainDb: -6, pan: -1, muted: true, solo: true },
    { commandId: "render-mixer-bgm-mute" },
  );
  assert(muted.ok, JSON.stringify(muted.diagnostics));
  const mutedRender = await renderOfflineAudio({
    project: muted.value.project,
    store,
    sampleRateHz: 8_000,
    bitDepth: 16,
  });
  assert(
    mutedRender.ok && mutedRender.value.bytes !== null,
    "Muted render failed.",
  );
  assert(
    Math.abs(readPcm16(mutedRender.value.bytes, 1_000, 0)) < 100 &&
      Math.abs(readPcm16(mutedRender.value.bytes, 1_000, 1)) < 100,
    "Mute was not reflected in rendered PCM.",
  );
});

Deno.test("Phase 2-D stem render applies canonical mute/solo and supports alternate PCM formats", async () => {
  const { session, source } = await sessionFixture();
  const solo = await journalWorkspaceMixerChannel(
    session,
    { trackId: "CHIP", gainDb: 0, pan: 0, muted: false, solo: true },
    { commandId: "render-mixer-chip-solo" },
  );
  assert(solo.ok, JSON.stringify(solo.diagnostics));
  const store = createMemoryAudioAssetByteStore();
  assert(
    (await store.put(source.revision, source.bytes)).ok,
    "Could not seed source store.",
  );
  const trackId = String(
    solo.value.project.tracks.find((track) => track.name === "CHIP")?.trackId,
  );
  const rendered = await renderOfflineAudio({
    project: solo.value.project,
    store,
    target: { kind: "STEM", trackId },
    sampleRateHz: 8_000,
    bitDepth: 24,
  });
  assert(rendered.ok, JSON.stringify(rendered.diagnostics));
  assert(rendered.value.bytes !== null, "Stem render did not produce bytes.");
  const wav = parseWav(rendered.value.bytes);
  assert(
    wav.bitDepth === 24 && wav.dataBytes === rendered.value.frameCount * 6,
    "24-bit stem format is invalid.",
  );
  assert(
    rendered.value.target !== "MASTER" &&
      rendered.value.target.trackId === trackId,
    "Stem target was not canonicalized.",
  );
});

Deno.test("Phase 2-D offline render honors Clip playback rate", async () => {
  const { session, source } = await sessionFixture();
  const bgmTrackId = String(
    session.project.tracks.find((track) => track.name === "BGM")?.trackId,
  );
  const stretched = await journalWorkspaceClipAdd(
    session,
    {
      id: "clip:stretched",
      trackId: "BGM",
      revisionId: source.revision.revisionId,
      startFrame: 0,
      durationFrames: 24,
      sourceOffsetUs: 0,
      playbackRate: 0.5,
    },
    { commandId: "render-clip-stretch" },
  );
  assert(stretched.ok, JSON.stringify(stretched.diagnostics));
  const store = createMemoryAudioAssetByteStore();
  assert(
    (await store.put(source.revision, source.bytes)).ok,
    "Could not seed source store.",
  );
  const normal = await renderOfflineAudio({
    project: session.project,
    store,
    target: { kind: "STEM", trackId: bgmTrackId },
    sampleRateHz: 8_000,
    bitDepth: 16,
    durationSeconds: 1,
  });
  const slow = await renderOfflineAudio({
    project: stretched.value.project,
    store,
    target: { kind: "STEM", trackId: bgmTrackId },
    sampleRateHz: 8_000,
    bitDepth: 16,
    durationSeconds: 1,
  });
  assert(
    normal.ok && normal.value.bytes !== null,
    "Normal stem render failed.",
  );
  assert(slow.ok && slow.value.bytes !== null, "Stretched stem render failed.");
  const frameAfterNormalClip = 3_000;
  assert(
    Math.abs(readPcm16(normal.value.bytes, frameAfterNormalClip, 0)) < 100 &&
      Math.abs(readPcm16(slow.value.bytes, frameAfterNormalClip, 0)) > 500,
    "Offline playback rate was not reflected after the original source duration.",
  );
});

Deno.test("Phase 2-D cancellation stops bounded output and does not leave a partial artifact", async () => {
  const { session, source } = await sessionFixture();
  const store = createMemoryAudioAssetByteStore();
  assert(
    (await store.put(source.revision, source.bytes)).ok,
    "Could not seed source store.",
  );
  const cancellation = { aborted: false };
  const rendered = await renderOfflineAudio({
    project: session.project,
    store,
    sampleRateHz: 8_000,
    blockFrames: 128,
    cancellation,
    onProgress: () => {
      cancellation.aborted = true;
    },
  });
  assert(!rendered.ok, "Cancelled render unexpectedly succeeded.");
  assert(
    rendered.diagnostics.some((diagnostic) =>
      diagnostic.code === "AUDIO_RENDER_CANCELLED"
    ),
    "Cancellation reason was not stable.",
  );
});

Deno.test("Phase 2-D rejects invalid stems and empty render ranges fail closed", async () => {
  const { session, source } = await sessionFixture();
  const store = createMemoryAudioAssetByteStore();
  assert(
    (await store.put(source.revision, source.bytes)).ok,
    "Could not seed source store.",
  );
  const invalidStem = await renderOfflineAudio({
    project: session.project,
    store,
    target: { kind: "STEM", trackId: "missing-track" },
  });
  assert(
    !invalidStem.ok &&
      invalidStem.diagnostics[0]?.code === "AUDIO_RENDER_INVALID",
    "Invalid stem was accepted.",
  );
  const invalidRange = await renderOfflineAudio({
    project: session.project,
    store,
    startSeconds: 10,
  });
  assert(
    !invalidRange.ok &&
      invalidRange.diagnostics[0]?.code === "AUDIO_RENDER_INVALID",
    "Empty render range was accepted.",
  );
});
