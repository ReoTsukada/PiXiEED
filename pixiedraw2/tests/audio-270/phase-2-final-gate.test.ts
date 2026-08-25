import {
  asAudioAssetId,
  asAudioProjectId,
  asAudioRevisionId,
  asAudioTrackId,
  asSourceBlobId,
  createAudioPersistenceRecord,
  createAudioWorkspaceSession,
  createMemoryAudioAssetByteStore,
  journalWorkspaceAssetRevision,
  journalWorkspaceBounceInPlace,
  journalWorkspaceClipAdd,
  journalWorkspaceFreezeCommit,
  journalWorkspaceFreezeReactivate,
  journalWorkspaceMixerChannel,
  journalWorkspaceNoteUpsert,
  journalWorkspaceRecordingCommit,
  journalWorkspaceUnfreeze,
  redoWorkspaceAudio,
  restoreAudioPersistenceRecord,
  undoWorkspaceAudio,
} from "../../src/audio/audio-200/index.ts";
import {
  canonicalizeSourceBlob,
} from "../../src/audio/audio-200/metadata-authority.ts";
import {
  LongAudioClipRuntime,
} from "../../src/audio/audio-240/long-audio-runtime.ts";
import {
  MixerRuntimeAdapter,
} from "../../src/audio/audio-240/mixer-runtime.ts";
import {
  type AudioRecordingIdentity,
  AudioRecordingSession,
  createMemoryAudioRecordingStorage,
} from "../../src/audio/audio-250/index.ts";
import { renderOfflineAudio } from "../../src/audio/audio-260/index.ts";
import { bounceInPlace, freezeTrack } from "../../src/audio/audio-270/index.ts";
import type {
  AudioClip,
  AudioRevision,
} from "../../src/audio/audio-200/contracts.ts";

function assert(
  condition: unknown,
  message = "Assertion failed.",
): asserts condition {
  if (!condition) throw new Error(message);
}

function writeText(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

/** A deterministic RIFF/PCM file used as the Final Gate's real-file fixture. */
function wavFixture(sampleFrames = 16_000, sampleRateHz = 8_000): Uint8Array {
  const dataLength = sampleFrames * 2;
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
  // A constant level makes gain/pan/fade comparisons independent of phase.
  for (let index = 0; index < sampleFrames; index += 1) {
    view.setInt16(44 + index * 2, 12_000, true);
  }
  return bytes;
}

async function sourceFixture(): Promise<{
  readonly bytes: Uint8Array;
  readonly revision: AudioRevision;
}> {
  const bytes = wavFixture();
  const canonical = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("final-gate-source-blob"),
    assetId: asAudioAssetId("final-gate-source-asset"),
    revisionId: asAudioRevisionId("final-gate-source-revision"),
    revisionNumber: 1,
    kind: "SONG",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/final-gate/final-gate.wav",
    },
    bytes,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  assert(canonical.ok, JSON.stringify(canonical.diagnostics));
  return { bytes, revision: canonical.value };
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
  framesPerSecond: number,
  tempoBpm: number,
  ppq: number,
) {
  return {
    id: String(artifact.clip.clipId),
    trackId: String(artifact.clip.trackId),
    revisionId: String(artifact.clip.revisionId),
    startFrame: Math.round(
      artifact.clip.timeline.startTick * 60 * framesPerSecond /
        (tempoBpm * ppq),
    ),
    durationFrames: Math.max(
      1,
      Math.round(
        artifact.clip.timeline.durationTick * 60 * framesPerSecond /
          (tempoBpm * ppq),
      ),
    ),
    sourceOffsetUs: 0,
  };
}

function pcm16(bytes: Uint8Array, frame: number, channel: 0 | 1): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getInt16(44 + (frame * 2 + channel) * 2, true);
}

function maxPcmDifference(
  left: Uint8Array,
  right: Uint8Array,
  frameCount: number,
): number {
  let maximum = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (const channel of [0, 1] as const) {
      maximum = Math.max(
        maximum,
        Math.abs(pcm16(left, frame, channel) - pcm16(right, frame, channel)),
      );
    }
  }
  return maximum;
}

class FakeParam {
  value = 0;
  setValueAtTime(value: number, _time: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number, _time: number): void {
    this.value = value;
  }
  cancelScheduledValues(_time: number): void {}
  setTargetAtTime(value: number, _time: number, _constant: number): void {
    this.value = value;
  }
}

class FakeNode {
  readonly connections: unknown[] = [];
  connect(target: unknown): void {
    this.connections.push(target);
  }
  disconnect(): void {
    this.connections.length = 0;
  }
}

class FakeGainNode extends FakeNode {
  readonly gain = new FakeParam();
}

class FakePannerNode extends FakeNode {
  readonly pan = new FakeParam();
}

class FakeBuffer {
  readonly channels: Float32Array[];
  constructor(channelCount: number, readonly length: number) {
    this.channels = Array.from(
      { length: channelCount },
      () => new Float32Array(length),
    );
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel]!;
  }
}

class FakeSource extends FakeNode {
  private ended: (() => void) | undefined;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    if (type === "ended") this.ended = listener as () => void;
  }
  start(_when: number, _offset?: number, _duration?: number): void {}
  stop(_when?: number): void {
    this.ended?.();
  }
}

class FakeAudioContext {
  readonly destination = new FakeNode();
  readonly sampleRate = 8_000;
  currentTime = 0;
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createStereoPanner(): FakePannerNode {
    return new FakePannerNode();
  }
  createBuffer(
    channels: number,
    length: number,
    _sampleRate: number,
  ): FakeBuffer {
    return new FakeBuffer(channels, length);
  }
  createBufferSource(): FakeSource {
    return new FakeSource();
  }
}

class FakeWindow {
  private nextHandle = 1;
  setInterval(_callback: () => void, _delay: number): number {
    return this.nextHandle++;
  }
  clearInterval(_handle: number): void {}
}

function recordingIdentity(): AudioRecordingIdentity {
  return {
    assetId: asAudioAssetId("asset:final-gate-recording"),
    revisionId: asAudioRevisionId("revision:final-gate-recording"),
    blobId: asSourceBlobId("blob:final-gate-recording"),
    revisionNumber: 1,
    kind: "CLIP",
    tempPath: "recordings/.pending/final-gate.pcm",
    finalPath: "recordings/final-gate/take.wav",
  };
}

Deno.test("Phase 2 Final Gate: WAV → streaming → freeze/bounce → recording/reload", async () => {
  const source = await sourceFixture();
  const store = createMemoryAudioAssetByteStore();
  const sourceStored = await store.put(source.revision, source.bytes);
  assert(sourceStored.ok && sourceStored.value, "Source WAV was not stored.");

  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("phase-2-final-gate"),
    name: "Phase 2 Final Gate",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const attached = await journalWorkspaceAssetRevision(
    created.value,
    source.revision,
    "final-gate.wav",
    { commandId: "final-gate-import", issuedAt: "2026-08-18T00:00:01.000Z" },
  );
  assert(attached.ok, JSON.stringify(attached.diagnostics));
  const clipAdded = await journalWorkspaceClipAdd(
    attached.value,
    {
      id: "clip:final-gate-source",
      trackId: "BGM",
      revisionId: source.revision.revisionId,
      startFrame: 0,
      durationFrames: 24,
      sourceOffsetUs: 0,
      gainDb: -3,
      fadeInFrames: 2,
      fadeOutFrames: 2,
    },
    { commandId: "final-gate-clip", issuedAt: "2026-08-18T00:00:02.000Z" },
  );
  assert(clipAdded.ok, JSON.stringify(clipAdded.diagnostics));
  const mixedSession = await journalWorkspaceMixerChannel(
    clipAdded.value,
    {
      trackId: "BGM",
      gainDb: -6,
      pan: -0.5,
      muted: false,
      solo: false,
    },
    { commandId: "final-gate-mixer", issuedAt: "2026-08-18T00:00:03.000Z" },
  );
  assert(mixedSession.ok, JSON.stringify(mixedSession.diagnostics));
  const trackId = String(mixedSession.value.project.tracks[0]!.trackId);

  const dry = await renderOfflineAudio({
    project: mixedSession.value.project,
    store,
    target: { kind: "STEM", trackId },
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 256,
    includeTrackMixer: false,
    includeMasterMixer: false,
    respectMuteSolo: false,
  });
  const mixed = await renderOfflineAudio({
    project: mixedSession.value.project,
    store,
    target: { kind: "STEM", trackId },
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 256,
  });
  assert(dry.ok && dry.value.bytes !== null, "Dry render failed.");
  assert(mixed.ok && mixed.value.bytes !== null, "Mixer render failed.");
  const dryMid = pcm16(dry.value.bytes, 4_000, 0);
  const mixedLeft = pcm16(mixed.value.bytes, 4_000, 0);
  const mixedRight = pcm16(mixed.value.bytes, 4_000, 1);
  assert(
    dryMid > mixedLeft && mixedLeft > mixedRight,
    "Gain/Pan was not reflected in Offline Render.",
  );

  const context = new FakeAudioContext();
  const mixer = new MixerRuntimeAdapter(context as unknown as AudioContext);
  mixer.applyMixer(mixedSession.value.project.mixer);
  const runtimeClip = mixedSession.value.project.clips[0]!;
  const runtime = await LongAudioClipRuntime.create({
    store,
    context: context as unknown as AudioContext,
    mixer,
    windowRef: new FakeWindow() as unknown as Window,
    clip: runtimeClip,
    revision: source.revision,
    tempoMilliBpm: mixedSession.value.project.tempo.milliBpm,
    ticksPerQuarter: mixedSession.value.project.timebase.ticksPerQuarter,
    shortAudioMaxBytes: 1_024,
    shortAudioMaxSeconds: 0.1,
    chunkSeconds: 0.05,
    readAheadChunks: 1,
    maxCachedChunks: 2,
  });
  assert(runtime.ok, JSON.stringify(runtime.diagnostics));
  assert(
    runtime.value.reader.plan.mode === "CHUNKED",
    "Long WAV did not use chunked playback.",
  );
  assert(
    (await runtime.value.play(0, true)).ok,
    "Realtime playback did not start.",
  );
  await Promise.resolve();
  const runtimeMixer = mixer.snapshot().tracks[trackId];
  assert(
    runtimeMixer?.pan === -0.5 && runtimeMixer.gain > 0 &&
      runtimeMixer.gain < 1,
    "Realtime Mixer projection differs from canonical state.",
  );
  assert(
    runtime.value.snapshot().activeSourceCount <= 1,
    "Streaming scheduled duplicate sources.",
  );
  assert((await runtime.value.seek(0.25)).ok, "Streaming seek failed.");
  runtime.value.stop();
  assert(
    runtime.value.snapshot().activeSourceCount === 0,
    "Stop left AudioBufferSource nodes.",
  );
  assert(
    runtime.value.snapshot().reader.cachedChunkCount === 0,
    "Stop left read-ahead chunks.",
  );
  runtime.value.dispose();
  mixer.dispose();

  const frozen = await freezeTrack({
    project: mixedSession.value.project,
    store,
    trackId,
    framesPerSecond: 24,
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 256,
  });
  assert(
    frozen.ok && frozen.value.bytes !== null,
    JSON.stringify(frozen.diagnostics),
  );
  const freezeCommitted = await journalWorkspaceFreezeCommit(
    mixedSession.value,
    frozen.value.revision,
    "final-gate-freeze.wav",
    workspaceClipInput(frozen.value, 24, 120, 480),
    frozen.value.sourceStateHash,
    { commandId: "final-gate-freeze", issuedAt: "2026-08-18T00:00:04.000Z" },
  );
  assert(freezeCommitted.ok, JSON.stringify(freezeCommitted.diagnostics));
  const frozenRender = await renderOfflineAudio({
    project: freezeCommitted.value.project,
    store,
    target: { kind: "STEM", trackId },
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 256,
  });
  assert(
    frozenRender.ok && frozenRender.value.bytes !== null,
    "Frozen render failed.",
  );
  assert(
    maxPcmDifference(
      mixed.value.bytes,
      frozenRender.value.bytes,
      mixed.value.frameCount,
    ) <= 8,
    "Freeze output diverged from Realtime/Offline source output.",
  );
  const unfrozen = await journalWorkspaceUnfreeze(
    freezeCommitted.value,
    trackId,
    { commandId: "final-gate-unfreeze", issuedAt: "2026-08-18T00:00:05.000Z" },
  );
  assert(unfrozen.ok, JSON.stringify(unfrozen.diagnostics));
  const unfrozenRender = await renderOfflineAudio({
    project: unfrozen.value.project,
    store,
    target: { kind: "STEM", trackId },
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 256,
  });
  assert(
    unfrozenRender.ok && unfrozenRender.value.bytes !== null,
    "Unfreeze render failed.",
  );
  assert(
    maxPcmDifference(
      mixed.value.bytes,
      unfrozenRender.value.bytes,
      mixed.value.frameCount,
    ) <= 8,
    "Unfreeze did not restore the source output.",
  );

  const reusableFreeze = await freezeTrack({
    project: unfrozen.value.project,
    store,
    trackId,
    framesPerSecond: 24,
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 256,
  });
  assert(
    reusableFreeze.ok && reusableFreeze.value.reused,
    "Unfreeze did not retain a reusable Freeze artifact.",
  );
  const reactivated = await journalWorkspaceFreezeReactivate(
    unfrozen.value,
    trackId,
    reusableFreeze.value.sourceStateHash,
    {
      commandId: "final-gate-reactivate",
      issuedAt: "2026-08-18T00:00:05.500Z",
    },
  );
  assert(reactivated.ok, JSON.stringify(reactivated.diagnostics));

  const changed = await journalWorkspaceNoteUpsert(
    reactivated.value,
    {
      id: "note:final-gate-change",
      pitchMidi: 72,
      startFrame: 0,
      durationFrames: 4,
      velocity: 0.5,
      instrument: "BGM",
    },
    {
      commandId: "final-gate-source-change",
      issuedAt: "2026-08-18T00:00:06.000Z",
    },
  );
  assert(changed.ok, JSON.stringify(changed.diagnostics));
  assert(
    changed.value.project.freezeStates?.[0]?.status === "STALE",
    "Source change did not stale the Freeze.",
  );

  let cancelled = false;
  const cancellation = {
    get aborted(): boolean {
      return cancelled;
    },
  };
  const cancelledFreeze = await freezeTrack({
    project: changed.value.project,
    store,
    trackId,
    framesPerSecond: 24,
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 256,
    cancellation,
    onProgress: () => {
      cancelled = true;
    },
  });
  assert(
    !cancelledFreeze.ok &&
      cancelledFreeze.diagnostics.some((item) =>
        item.code === "AUDIO_FREEZE_CANCELLED"
      ),
    "Freeze cancellation was not fail-closed.",
  );

  const bounced = await bounceInPlace({
    project: changed.value.project,
    store,
    trackId,
    framesPerSecond: 24,
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 256,
  });
  assert(
    bounced.ok && bounced.value.bytes.byteLength > 44,
    JSON.stringify(bounced.diagnostics),
  );
  const bounceCommitted = await journalWorkspaceBounceInPlace(
    changed.value,
    bounced.value.revision,
    "final-gate-bounce.wav",
    workspaceClipInput(bounced.value, 24, 120, 480),
    { commandId: "final-gate-bounce", issuedAt: "2026-08-18T00:00:07.000Z" },
  );
  assert(bounceCommitted.ok, JSON.stringify(bounceCommitted.diagnostics));
  assert(
    bounceCommitted.value.project.clips.length ===
      changed.value.project.clips.length + 1,
    "Bounce did not add one non-destructive Clip.",
  );
  const bounceStored = await store.has(bounced.value.revision);
  assert(
    bounceStored.ok && bounceStored.value,
    "Bounce Asset was not stored.",
  );
  const bouncedBeforeUndo = bounceCommitted.value.project.clips.length;
  const bounceUndone = await undoWorkspaceAudio(bounceCommitted.value);
  assert(
    bounceUndone.ok &&
      bounceUndone.value.project.clips.length === bouncedBeforeUndo - 1,
    "Bounce Undo failed.",
  );
  const bounceRedone = await redoWorkspaceAudio(bounceUndone.value);
  assert(
    bounceRedone.ok &&
      bounceRedone.value.project.clips.length === bouncedBeforeUndo,
    "Bounce Redo failed.",
  );

  const recordingStorage = createMemoryAudioRecordingStorage();
  const recorderCreated = AudioRecordingSession.create({
    storage: recordingStorage,
    identity: recordingIdentity(),
    sourceName: "final-gate-recording.wav",
    trackId: trackId,
    sampleRateHz: 8_000,
    channels: 1,
    tempoBpm: 120,
  });
  assert(recorderCreated.ok, JSON.stringify(recorderCreated.diagnostics));
  assert(recorderCreated.value.arm().ok);
  assert(
    (await recorderCreated.value.start({
      audioTimeSeconds: 0,
      timelineStartSeconds: 0,
    })).ok,
  );
  const recordingSamples = new Float32Array(800).fill(0.25);
  assert(
    (await recorderCreated.value.ingest({
      audioTimeSeconds: 0,
      sampleRateHz: 8_000,
      channels: 1,
      samples: [recordingSamples],
    })).ok,
  );
  const stopped = await recorderCreated.value.stop();
  assert(stopped.ok, JSON.stringify(stopped.diagnostics));
  const recordingBytes = recordingStorage.get(
    stopped.value.revision.source.locator.relativePath,
  );
  assert(
    recordingBytes !== undefined,
    "Recording did not produce a final WAV.",
  );
  const recordingStored = await store.put(
    stopped.value.revision,
    recordingBytes,
  );
  assert(
    recordingStored.ok && recordingStored.value,
    "Recording Asset was not stored.",
  );
  const recordingCommitted = await journalWorkspaceRecordingCommit(
    bounceRedone.value,
    stopped.value.revision,
    stopped.value.sourceName,
    {
      id: "clip:final-gate-recording",
      trackId,
      revisionId: String(stopped.value.revision.revisionId),
      startFrame: 24,
      durationFrames: 2,
      sourceOffsetUs: 0,
    },
    {
      commandId: "final-gate-recording-commit",
      issuedAt: "2026-08-18T00:00:08.000Z",
    },
  );
  assert(recordingCommitted.ok, JSON.stringify(recordingCommitted.diagnostics));
  assert(
    recordingCommitted.value.journal.entries.at(-1)?.command.type ===
      "RECORDING_COMMIT",
    "Recording did not create one commit Journal entry.",
  );
  const persisted = await createAudioPersistenceRecord(
    recordingCommitted.value,
    "phase-2-final-gate-checkpoint",
    "2026-08-18T00:00:09.000Z",
  );
  assert(persisted.ok, JSON.stringify(persisted.diagnostics));
  const restored = await restoreAudioPersistenceRecord(persisted.value);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(
    restored.value.project.clips.some((item) =>
      String(item.clipId) === "clip:final-gate-recording"
    ),
    "Reload did not restore the recorded Clip.",
  );
  const recordingUndone = await undoWorkspaceAudio(recordingCommitted.value);
  assert(
    recordingUndone.ok &&
      !recordingUndone.value.project.clips.some((item) =>
        String(item.clipId) === "clip:final-gate-recording"
      ),
    "Recording Undo failed.",
  );
  const recordingRedone = await redoWorkspaceAudio(recordingUndone.value);
  assert(
    recordingRedone.ok &&
      recordingRedone.value.project.clips.some((item) =>
        String(item.clipId) === "clip:final-gate-recording"
      ),
    "Recording Redo failed.",
  );
});
