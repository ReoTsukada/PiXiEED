import {
  asAudioAssetId,
  asAudioRevisionId,
  asAudioTrackId,
  asSourceBlobId,
  audioOk,
  createAudioPersistenceRecord,
  createAudioWorkspaceSession,
  inspectSourceBlob,
  journalWorkspaceRecordingCommit,
  redoWorkspaceAudio,
  restoreAudioPersistenceRecord,
  undoWorkspaceAudio,
} from "../../src/audio/audio-200/index.ts";
import {
  type AudioRecordingIdentity,
  AudioRecordingSession,
  type AudioRecordingStorage,
  BrowserAudioRecordingRuntime,
  createMemoryAudioRecordingStorage,
} from "../../src/audio/audio-250/index.ts";
import { sha256Hex } from "../../src/wp160-contracts.ts";

function assert(
  condition: unknown,
  message = "Assertion failed.",
): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(prefix: string): AudioRecordingIdentity {
  return {
    assetId: asAudioAssetId(`asset:recording:${prefix}`),
    revisionId: asAudioRevisionId(`revision:recording:${prefix}`),
    blobId: asSourceBlobId(`blob:recording:${prefix}`),
    revisionNumber: 1,
    kind: "CLIP",
    tempPath: `recordings/.pending/${prefix}.pcm`,
    finalPath: `recordings/${prefix}/take.wav`,
  };
}

function inputChunk(
  audioTimeSeconds: number,
  sampleRateHz: number,
  frameCount: number,
  seed: number,
) {
  const samples = new Float32Array(frameCount);
  for (let index = 0; index < frameCount; index += 1) {
    samples[index] = Math.sin((index + seed) / 13) * 0.6;
  }
  return {
    audioTimeSeconds,
    sampleRateHz,
    channels: 1 as const,
    samples: [samples],
  };
}

async function createRecording(prefix: string) {
  const storage = createMemoryAudioRecordingStorage();
  const created = AudioRecordingSession.create({
    storage,
    identity: identity(prefix),
    sourceName: `${prefix}.wav`,
    trackId: "instrument:bgm",
    sampleRateHz: 8_000,
    channels: 1,
    tempoBpm: 120,
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  assert(created.value.arm().ok, "Recorder could not be armed.");
  return { storage, recorder: created.value };
}

Deno.test("Phase 2-C records bounded PCM to a canonical WAV take", async () => {
  const { storage, recorder } = await createRecording("capture");
  const started = await recorder.start({
    audioTimeSeconds: 1,
    timelineStartSeconds: 4,
    countInBeats: 1,
    preRollSeconds: 0.2,
    inputLatencyUs: 20_000,
    recordingOffsetUs: 5_000,
  });
  assert(started.ok, JSON.stringify(started.diagnostics));
  assert(recorder.snapshot().state === "COUNT_IN", "Count-in did not arm.");

  // Target = 1s + (1 beat at 120 BPM) + 0.2s = 1.7s.  The first chunk ends
  // at the target and must not enter the take; the next two chunks contribute
  // 400 + 800 frames without any full-recording RAM assembly.
  assert(
    (await recorder.ingest(inputChunk(1.6, 8_000, 800, 1))).ok,
    "Pre-roll input was not accepted as a no-op.",
  );
  recorder.tick(1.7);
  assert(
    (await recorder.ingest(inputChunk(1.65, 8_000, 800, 2))).ok,
    "First post-target input failed.",
  );
  assert(
    (await recorder.ingest(inputChunk(1.75, 8_000, 800, 3))).ok,
    "Second post-target input failed.",
  );

  const stopped = await recorder.stop();
  assert(stopped.ok, JSON.stringify(stopped.diagnostics));
  assert(stopped.value.sampleFrames === 1_200, "Count-in trimming is wrong.");
  assert(
    stopped.value.timelineStartSeconds === 3.985,
    "Latency/offset correction was not applied to the Clip start.",
  );
  assert(recorder.state === "COMMITTED", "Recorder did not commit the take.");

  const bytes = storage.get(stopped.value.revision.source.locator.relativePath);
  assert(bytes !== undefined, "Final recording was not stored.");
  assert(
    bytes.byteLength === stopped.value.revision.source.metadata.byteLength,
    "Stored WAV length does not match canonical metadata.",
  );
  assert(
    stopped.value.revision.source.locator.contentHash ===
      await sha256Hex(bytes),
    "Incremental recording hash differs from the final WAV hash.",
  );
  const inspected = await inspectSourceBlob(bytes);
  assert(inspected.ok, JSON.stringify(inspected.diagnostics));
  assert(
    inspected.value.sampleFrames === 1_200 &&
      inspected.value.durationUs ===
        stopped.value.revision.source.metadata.durationUs,
    "Stored WAV metadata could not be re-inspected.",
  );
});

Deno.test("Phase 2-C cancel removes the pending take without a Project commit", async () => {
  const { storage, recorder } = await createRecording("cancel");
  assert(
    (await recorder.start({ audioTimeSeconds: 0, timelineStartSeconds: 0 })).ok,
    "Cancel fixture could not start.",
  );
  assert(
    (await recorder.ingest(inputChunk(0, 8_000, 512, 4))).ok,
    "Cancel fixture input failed.",
  );
  const cancelled = await recorder.cancel();
  assert(cancelled.ok, JSON.stringify(cancelled.diagnostics));
  assert(recorder.state === "CANCELLED", "Recorder did not enter CANCELLED.");
  assert(
    storage.get(identity("cancel").finalPath) === undefined,
    "Cancel left a final OPFS-equivalent recording behind.",
  );
  const stopped = await recorder.stop();
  assert(
    !stopped.ok && stopped.diagnostics[0]?.code === "AUDIO_EMPTY_RECORDING",
  );
});

Deno.test("Phase 2-C bounds the pending OPFS write queue", async () => {
  let releaseFirstWrite: () => void = () => undefined;
  const firstWrite = new Promise<void>((resolve) => {
    releaseFirstWrite = resolve;
  });
  let isFirstWrite = true;
  const slowStorage: AudioRecordingStorage = {
    async begin() {
      return audioOk({
        async writePcm16() {
          if (isFirstWrite) {
            isFirstWrite = false;
            await firstWrite;
          }
          return audioOk(true);
        },
        async finalize() {
          throw new Error("finalize is not expected in the backpressure test");
        },
        async cancel() {
          return audioOk(true);
        },
      });
    },
    async remove() {
      return audioOk(true);
    },
  };
  const created = AudioRecordingSession.create({
    storage: slowStorage,
    identity: identity("backpressure"),
    sourceName: "backpressure.wav",
    trackId: "instrument:bgm",
    sampleRateHz: 8_000,
    channels: 1,
    tempoBpm: 120,
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  assert(created.value.arm().ok);
  assert(
    (await created.value.start({
      audioTimeSeconds: 0,
      timelineStartSeconds: 0,
    })).ok,
  );
  const attempts = Array.from(
    { length: 40 },
    (_, index) => created.value.ingest(inputChunk(0, 8_000, 4_096, index)),
  );
  releaseFirstWrite();
  const outcomes = await Promise.all(attempts);
  assert(
    outcomes.some((outcome) =>
      !outcome.ok && outcome.diagnostics[0]?.path === "recording.backpressure"
    ),
    "Slow storage did not trip the bounded write queue.",
  );
  assert(created.value.state === "STOPPING");
  assert((await created.value.cancel()).ok);
});

Deno.test("Phase 2-C disposes microphone tracks and the monitoring graph", async () => {
  let trackStops = 0;
  let sourceDisconnects = 0;
  let processorDisconnects = 0;
  let monitorDisconnects = 0;
  let silentDisconnects = 0;
  const track = { stop: () => trackStops += 1 };
  const stream = {
    getTracks: () => [track],
  };
  const source = {
    connect: () => undefined,
    disconnect: () => sourceDisconnects += 1,
  };
  const processor = {
    onaudioprocess: null,
    connect: () => undefined,
    disconnect: () => processorDisconnects += 1,
  };
  const makeGain = (disconnect: () => void) => ({
    gain: {
      value: 0,
      cancelScheduledValues: () => undefined,
      setTargetAtTime: () => undefined,
    },
    connect: () => undefined,
    disconnect,
  });
  const monitor = makeGain(() => monitorDisconnects += 1);
  const silent = makeGain(() => silentDisconnects += 1);
  let gainIndex = 0;
  const context = {
    sampleRate: 8_000,
    currentTime: 0,
    baseLatency: 0.01,
    destination: {},
    createMediaStreamSource: () => source,
    createScriptProcessor: () => processor,
    createGain: () => gainIndex++ === 0 ? monitor : silent,
  };
  const created = await BrowserAudioRecordingRuntime.create({
    windowRef: {
      navigator: { mediaDevices: { getUserMedia: async () => stream } },
    } as unknown as Window,
    context: context as unknown as AudioContext,
    mixer: { getTrackInput: () => ({}) } as never,
    storage: createMemoryAudioRecordingStorage(),
    identity: identity("cleanup"),
    sourceName: "cleanup.wav",
    trackId: "instrument:bgm",
    tempoBpm: 120,
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  await created.value.dispose();
  assert(trackStops === 1, "MediaStream track was not stopped exactly once.");
  assert(sourceDisconnects === 1, "Input source was not disconnected.");
  assert(processorDisconnects === 1, "Capture processor was not disconnected.");
  assert(monitorDisconnects === 1, "Monitor node was not disconnected.");
  assert(
    silentDisconnects === 1,
    "Silent keep-alive node was not disconnected.",
  );
});

Deno.test("Phase 2-C commits one Journal entry and keeps Asset/Clip undoable", async () => {
  const { recorder } = await createRecording("journal");
  assert(
    (await recorder.start({ audioTimeSeconds: 0, timelineStartSeconds: 0 })).ok,
    "Journal fixture could not start.",
  );
  assert(
    (await recorder.ingest(inputChunk(0, 8_000, 800, 5))).ok,
    "Journal fixture input failed.",
  );
  const stopped = await recorder.stop();
  assert(stopped.ok, JSON.stringify(stopped.diagnostics));

  const created = await createAudioWorkspaceSession({
    projectId: "phase2c-project",
    name: "Phase 2-C Recording",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const committed = await journalWorkspaceRecordingCommit(
    created.value,
    stopped.value.revision,
    stopped.value.sourceName,
    {
      id: "clip:recording:journal",
      trackId: String(asAudioTrackId("instrument:bgm")),
      revisionId: String(stopped.value.revision.revisionId),
      startFrame: 0,
      durationFrames: 3,
      sourceOffsetUs: 0,
    },
    {
      commandId: "recording-commit-1",
      issuedAt: "2026-08-18T00:01:00.000Z",
    },
  );
  assert(committed.ok, JSON.stringify(committed.diagnostics));
  assert(committed.value.journal.entries.length === 1);
  assert(
    committed.value.journal.entries[0]?.command.type === "RECORDING_COMMIT",
  );
  assert(committed.value.project.revisions.length === 1);
  assert(committed.value.project.clips.length === 1);
  assert(committed.value.assetCatalog.assets.length === 1);
  assert(
    !JSON.stringify(committed.value.journal.entries[0]?.command).includes(
      '"bytes"',
    ),
    "Raw recording bytes crossed the canonical Journal boundary.",
  );

  const persisted = await createAudioPersistenceRecord(
    committed.value,
    "phase2c-checkpoint",
    "2026-08-18T00:02:00.000Z",
  );
  assert(persisted.ok, JSON.stringify(persisted.diagnostics));
  const restored = await restoreAudioPersistenceRecord(persisted.value);
  assert(restored.ok, JSON.stringify(restored.diagnostics));
  assert(restored.value.project.revisions.length === 1);
  assert(restored.value.project.clips.length === 1);
  assert(restored.value.assetCatalog.assets.length === 1);
  assert(
    restored.value.assetCatalog.assets[0]?.sourceName ===
      stopped.value.sourceName,
    "Reload did not preserve the recorded Asset source name.",
  );

  const undone = await undoWorkspaceAudio(committed.value);
  assert(undone.ok, JSON.stringify(undone.diagnostics));
  assert(undone.value.project.revisions.length === 0);
  assert(undone.value.project.clips.length === 0);
  assert(undone.value.assetCatalog.assets.length === 0);
  const redone = await redoWorkspaceAudio(undone.value);
  assert(redone.ok, JSON.stringify(redone.diagnostics));
  assert(redone.value.project.revisions.length === 1);
  assert(redone.value.project.clips.length === 1);
  assert(redone.value.assetCatalog.assets.length === 1);
  assert(
    redone.value.assetCatalog.assets[0]?.sourceName ===
      stopped.value.sourceName,
    "Redo did not preserve the recorded Asset source name.",
  );
});
