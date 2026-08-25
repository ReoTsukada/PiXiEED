import {
  asAudioAssetId,
  asAudioAutomationId,
  asAudioProjectId,
  asAudioRevisionId,
  asAudioTick,
  asSourceBlobId,
  canonicalizeSourceBlob,
  createAudioWorkspaceSession,
  createMemoryAudioAssetByteStore,
  journalWorkspaceAssetRevision,
  journalWorkspaceAutomationUpsert,
  journalWorkspaceClipAdd,
  redoWorkspaceAudio,
  undoWorkspaceAudio,
} from "../../src/audio/audio-200/index.ts";
import { renderOfflineAudio } from "../../src/audio/audio-260/index.ts";
import { freezeTrack } from "../../src/audio/audio-270/index.ts";
import type {
  AudioAutomation,
  AudioMixer,
  AudioRevision,
} from "../../src/audio/audio-200/contracts.ts";
import type { AudioWorkspaceSession } from "../../src/audio/audio-200/workspace-session.ts";
import {
  automationValueAtTick,
  compileAudioAutomation,
  removeAudioAutomationPoint,
  scheduleAudioAutomation,
  upsertAudioAutomationPoint,
} from "../../src/audio/audio-300/index.ts";
import {
  MixerRuntimeAdapter,
} from "../../src/audio/audio-240/mixer-runtime.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeParam {
  value = 0;
  readonly calls: string[] = [];
  cancelScheduledValues(time: number): void {
    this.calls.push(`cancel:${time}`);
  }
  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push(`set:${value}:${time}`);
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push(`ramp:${value}:${time}`);
  }
  setTargetAtTime(value: number, _time: number, _constant: number): void {
    this.value = value;
  }
}

class FakeNode {
  readonly connections: FakeNode[] = [];
  connect(target: FakeNode): void {
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

class FakeFilterNode extends FakeNode {
  type = "lowpass";
  readonly frequency = new FakeParam();
}

class FakeAudioContext {
  readonly destination = new FakeNode();
  readonly currentTime = 10;
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createStereoPanner(): FakePannerNode {
    return new FakePannerNode();
  }
  createBiquadFilter(): FakeFilterNode {
    return new FakeFilterNode();
  }
}

function automationFixture(
  trackId = "track:automation",
): AudioAutomation {
  return {
    automationId: asAudioAutomationId("automation:gain"),
    target: { kind: "TRACK_GAIN", targetId: trackId },
    points: [
      { tick: asAudioTick(480), value: -3 },
      { tick: asAudioTick(0), value: 0 },
      { tick: asAudioTick(480), value: -6 },
    ],
  };
}

function writeText(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function wavFixture(sampleFrames = 2_400): Uint8Array {
  const bytes = new Uint8Array(44 + sampleFrames * 2);
  const view = new DataView(bytes.buffer);
  writeText(bytes, 0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  writeText(bytes, 8, "WAVE");
  writeText(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8_000, true);
  view.setUint32(28, 16_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(bytes, 36, "data");
  view.setUint32(40, sampleFrames * 2, true);
  for (let index = 0; index < sampleFrames; index += 1) {
    view.setInt16(44 + index * 2, 16_000, true);
  }
  return bytes;
}

async function renderFixture(): Promise<{
  readonly session: AudioWorkspaceSession;
  readonly revision: AudioRevision;
  readonly store: ReturnType<typeof createMemoryAudioAssetByteStore>;
}> {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("automation-render-project"),
    name: "Automation Render",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const bytes = wavFixture();
  const canonical = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("automation-render-blob"),
    assetId: asAudioAssetId("automation-render-asset"),
    revisionId: asAudioRevisionId("automation-render-revision"),
    revisionNumber: 1,
    kind: "SONG",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/automation-render.wav",
    },
    bytes,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  assert(canonical.ok, JSON.stringify(canonical.diagnostics));
  const imported = await journalWorkspaceAssetRevision(
    created.value,
    canonical.value,
    "automation-render.wav",
    { commandId: "automation-render-import" },
  );
  assert(imported.ok, JSON.stringify(imported.diagnostics));
  const clipped = await journalWorkspaceClipAdd(imported.value, {
    id: "clip:automation-render",
    trackId: "BGM",
    revisionId: canonical.value.revisionId,
    startFrame: 0,
    durationFrames: 6,
    sourceOffsetUs: 0,
  }, { commandId: "automation-render-clip" });
  assert(clipped.ok, JSON.stringify(clipped.diagnostics));
  const store = createMemoryAudioAssetByteStore();
  assert((await store.put(canonical.value, bytes)).ok, "Source put failed.");
  return { session: clipped.value, revision: canonical.value, store };
}

function readPcm16(bytes: Uint8Array, frame: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getInt16(44 + frame * 4, true);
}

Deno.test("AUDIO-300 compiles bounded curves and schedules AudioParam ramps", () => {
  const compiled = compileAudioAutomation(automationFixture());
  assert(compiled.ok, JSON.stringify(compiled.diagnostics));
  assert(
    compiled.value.points.length === 2 &&
      compiled.value.points[1]?.value === -6,
    "Duplicate ticks were not deterministically deduplicated.",
  );
  assert(
    automationValueAtTick(compiled.value, 240) === -3,
    "Automation interpolation did not use the canonical tick domain.",
  );
  const param = new FakeParam();
  const scheduled = scheduleAudioAutomation(param, compiled.value, {
    nowSeconds: 10,
    tempoMilliBpm: 120_000,
    ticksPerQuarter: 480,
  });
  assert(scheduled.scheduledPoints === 1, "Unexpected ramp count.");
  assert(
    param.calls.length === 3 && param.calls[0] === "cancel:10",
    "Automation scheduling did not cancel and seed the AudioParam once.",
  );
  assert(
    Math.abs(param.value - 10 ** (-6 / 20)) < 0.0001,
    "Gain dB automation was not converted to linear AudioParam units.",
  );
});

Deno.test("AUDIO-300 edits automation points by exact Tick", () => {
  const automation: AudioAutomation = {
    automationId: asAudioAutomationId("automation:edit"),
    target: { kind: "TRACK_GAIN", targetId: "track:audio" },
    points: [{ tick: asAudioTick(0), value: -12 }],
  };
  const updated = upsertAudioAutomationPoint(automation, 960, -3);
  if (updated.points.length !== 2 || updated.points[1]?.tick !== 960) {
    throw new Error("Automation point was not inserted at its Tick");
  }
  const replaced = upsertAudioAutomationPoint(updated, 960, -1);
  if (replaced.points.length !== 2 || replaced.points[1]?.value !== -1) {
    throw new Error("Automation point replacement was not deterministic");
  }
  const removed = removeAudioAutomationPoint(replaced, 960);
  if (removed.points.length !== 1 || removed.points[0]?.tick !== 0) {
    throw new Error("Automation point was not removed by Tick");
  }
});

Deno.test("AUDIO-300 journals automation and preserves Undo/Redo ownership", async () => {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("automation-journal-project"),
    name: "Automation Journal",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const trackId = String(created.value.project.tracks[0]!.trackId);
  const automation = automationFixture(trackId);
  const committed = await journalWorkspaceAutomationUpsert(
    created.value,
    automation,
    { commandId: "automation-journal-upsert" },
  );
  assert(committed.ok, JSON.stringify(committed.diagnostics));
  assert(
    committed.value.project.automations.length === 1 &&
      committed.value.project.tracks[0]!.automationIds.length === 1,
    "Automation was not attached to the canonical Track.",
  );
  const undone = await undoWorkspaceAudio(committed.value);
  assert(undone.ok, JSON.stringify(undone.diagnostics));
  assert(
    undone.value.project.automations.length === 0,
    "Undo did not remove Automation.",
  );
  const redone = await redoWorkspaceAudio(undone.value);
  assert(redone.ok, JSON.stringify(redone.diagnostics));
  assert(
    redone.value.project.automations.length === 1,
    "Redo did not restore Automation.",
  );
});

Deno.test("AUDIO-300 projects canonical Mixer Automation onto gain/pan/filter AudioParams", () => {
  const trackId = "track:automation";
  const mixer: AudioMixer = {
    mixerId: "mixer:automation" as never,
    masterGainMilliDb: 0,
    channels: [{
      channelId: "channel:automation" as never,
      trackId: trackId as never,
      gainMilliDb: 0,
      panMilli: 0,
      muted: false,
      solo: false,
    }],
  };
  const context = new FakeAudioContext();
  const runtime = new MixerRuntimeAdapter(
    context as unknown as AudioContext,
  );
  runtime.applyMixer(mixer);
  const gain = compileAudioAutomation(automationFixture(trackId));
  assert(gain.ok, JSON.stringify(gain.diagnostics));
  scheduleAudioAutomation(runtime.getTrackGainParam(trackId), gain.value, {
    nowSeconds: context.currentTime,
    tempoMilliBpm: 120_000,
    ticksPerQuarter: 480,
  });
  const pan = compileAudioAutomation({
    automationId: asAudioAutomationId("automation:pan"),
    target: { kind: "TRACK_PAN", targetId: trackId },
    points: [{ tick: asAudioTick(0), value: -1 }, {
      tick: asAudioTick(480),
      value: 1,
    }],
  });
  assert(pan.ok, JSON.stringify(pan.diagnostics));
  scheduleAudioAutomation(runtime.getTrackPanParam(trackId), pan.value, {
    nowSeconds: context.currentTime,
    tempoMilliBpm: 120_000,
    ticksPerQuarter: 480,
  });
  const filter = compileAudioAutomation({
    automationId: asAudioAutomationId("automation:filter"),
    target: { kind: "FILTER_CUTOFF", targetId: trackId },
    points: [{ tick: asAudioTick(0), value: 400 }, {
      tick: asAudioTick(480),
      value: 4_000,
    }],
  });
  assert(filter.ok, JSON.stringify(filter.diagnostics));
  scheduleAudioAutomation(
    runtime.getTrackFilterCutoffParam(trackId)!,
    filter.value,
    {
      nowSeconds: context.currentTime,
      tempoMilliBpm: 120_000,
      ticksPerQuarter: 480,
    },
  );
  assert(
    (runtime.getTrackGainParam(trackId) as unknown as FakeParam).calls.length >
        0 &&
      (runtime.getTrackPanParam(trackId) as unknown as FakeParam).calls.length >
        0 &&
      (runtime.getTrackFilterCutoffParam(trackId) as unknown as FakeParam).calls
          .length > 0,
    "Mixer runtime did not expose all Automation AudioParams.",
  );
  runtime.dispose();
});

Deno.test("AUDIO-300 Offline Render applies Track Gain Automation without mutating Project", async () => {
  const { session, store } = await renderFixture();
  const trackId = String(session.project.tracks[0]!.trackId);
  const committed = await journalWorkspaceAutomationUpsert(
    session,
    {
      automationId: asAudioAutomationId("automation:render-gain"),
      target: { kind: "TRACK_GAIN", targetId: trackId },
      points: [
        { tick: asAudioTick(0), value: -12 },
        { tick: asAudioTick(120), value: 0 },
      ],
    },
    { commandId: "automation-render-upsert" },
  );
  assert(committed.ok, JSON.stringify(committed.diagnostics));
  const beforeHash = committed.value.project.stateHash;
  const rendered = await renderOfflineAudio({
    project: committed.value.project,
    store,
    sampleRateHz: 8_000,
    bitDepth: 16,
    blockFrames: 128,
  });
  assert(
    rendered.ok && rendered.value.bytes !== null,
    "Automated render failed.",
  );
  assert(
    rendered.value.projectStateHash === beforeHash,
    "Offline Automation render mutated canonical Project state.",
  );
  const early = Math.abs(readPcm16(rendered.value.bytes, 8));
  const late = Math.abs(readPcm16(rendered.value.bytes, 1_800));
  assert(
    late > early * 1.8,
    `Track Gain Automation was not reflected in PCM (${early} -> ${late}).`,
  );
});

Deno.test("AUDIO-300 Freeze reuses the same Clip Automation render path", async () => {
  const { session, store } = await renderFixture();
  const trackId = String(session.project.tracks[0]!.trackId);
  const clipId = String(session.project.clips[0]!.clipId);
  const committed = await journalWorkspaceAutomationUpsert(
    session,
    {
      automationId: asAudioAutomationId("automation:freeze-clip-gain"),
      target: { kind: "CLIP_GAIN", targetId: clipId },
      points: [{ tick: asAudioTick(0), value: -12 }],
    },
    { commandId: "automation-freeze-upsert" },
  );
  assert(committed.ok, JSON.stringify(committed.diagnostics));
  const realtime = await renderOfflineAudio({
    project: committed.value.project,
    store,
    sampleRateHz: 8_000,
    bitDepth: 16,
    includeTrackMixer: false,
    includeMasterMixer: false,
    respectMuteSolo: false,
  });
  assert(
    realtime.ok && realtime.value.bytes !== null,
    "Realtime render failed.",
  );
  const frozen = await freezeTrack({
    project: committed.value.project,
    store,
    trackId,
    framesPerSecond: 24,
    sampleRateHz: 8_000,
    bitDepth: 16,
  });
  assert(frozen.ok && frozen.value.bytes !== null, "Freeze render failed.");
  const realtimeSample = readPcm16(realtime.value.bytes, 1_000);
  const frozenSample = readPcm16(frozen.value.bytes, 1_000);
  assert(
    Math.abs(realtimeSample - frozenSample) < 8,
    `Freeze did not use the same Clip Automation output as Offline Render (${realtimeSample} vs ${frozenSample}).`,
  );
});
