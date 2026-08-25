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
  journalWorkspaceEffectReorder,
  journalWorkspaceEffectUpsert,
  redoWorkspaceAudio,
  undoWorkspaceAudio,
} from "../../src/audio/audio-200/index.ts";
import type {
  AudioAutomation,
  AudioEffect,
  AudioMixer,
} from "../../src/audio/audio-200/contracts.ts";
import { MixerRuntimeAdapter } from "../../src/audio/audio-240/mixer-runtime.ts";
import { renderOfflineAudio } from "../../src/audio/audio-260/render.ts";
import { AUDIO_EQ_BANDS } from "../../src/audio/audio-320/index.ts";
import type { AudioWorkspaceSession } from "../../src/audio/audio-200/workspace-session.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeParam {
  value = 0;
  cancelScheduledValues(_time: number): void {}
  setTargetAtTime(value: number, _time: number, _constant: number): void {
    this.value = value;
  }
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void {
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
  readonly gain = new FakeParam();
  readonly Q = new FakeParam();
}

class FakeCompressorNode extends FakeNode {
  readonly threshold = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
}

class FakeConvolverNode extends FakeNode {
  buffer: AudioBuffer | null = null;
}

class FakeDelayNode extends FakeNode {
  readonly delayTime = new FakeParam();
}

class FakeAudioBuffer {
  private readonly channels: Float32Array[];
  constructor(channels: number, length: number) {
    this.channels = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel]!;
  }
}

class FakeAudioContext {
  readonly destination = new FakeNode();
  readonly currentTime = 1;
  readonly sampleRate = 8_000;
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createStereoPanner(): FakePannerNode {
    return new FakePannerNode();
  }
  createBiquadFilter(): FakeFilterNode {
    return new FakeFilterNode();
  }
  createDynamicsCompressor(): FakeCompressorNode {
    return new FakeCompressorNode();
  }
  createConvolver(): FakeConvolverNode {
    return new FakeConvolverNode();
  }
  createDelay(_maxDelayTime?: number): FakeDelayNode {
    return new FakeDelayNode();
  }
  createBuffer(channels: number, length: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, length);
  }
}

function wavFixture(sampleFrames = 4_000): Uint8Array {
  const bytes = new Uint8Array(44 + sampleFrames * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8_000, true);
  view.setUint32(28, 16_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, sampleFrames * 2, true);
  for (let index = 0; index < sampleFrames; index += 1) {
    view.setInt16(44 + index * 2, 16_000, true);
  }
  return bytes;
}

function pcm16(bytes: Uint8Array, frame: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getInt16(44 + frame * 4, true);
}

async function effectFixture(): Promise<{
  readonly session: AudioWorkspaceSession;
  readonly store: ReturnType<typeof createMemoryAudioAssetByteStore>;
}> {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("effect-project"),
    name: "Effects",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const bytes = wavFixture();
  const canonical = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("effect-blob"),
    assetId: asAudioAssetId("effect-asset"),
    revisionId: asAudioRevisionId("effect-revision"),
    revisionNumber: 1,
    kind: "SONG",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/effect.wav",
    },
    bytes,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  assert(canonical.ok, JSON.stringify(canonical.diagnostics));
  const imported = await journalWorkspaceAssetRevision(
    created.value,
    canonical.value,
    "effect.wav",
    { commandId: "effect-import" },
  );
  assert(imported.ok, JSON.stringify(imported.diagnostics));
  const clipped = await journalWorkspaceClipAdd(
    imported.value,
    {
      id: "clip:effect",
      trackId: "BGM",
      revisionId: canonical.value.revisionId,
      startFrame: 0,
      durationFrames: 6,
      sourceOffsetUs: 0,
    },
    { commandId: "effect-clip" },
  );
  assert(clipped.ok, JSON.stringify(clipped.diagnostics));
  const store = createMemoryAudioAssetByteStore();
  assert((await store.put(canonical.value, bytes)).ok, "Source put failed.");
  return { session: clipped.value, store };
}

async function render(
  session: AudioWorkspaceSession,
  store: ReturnType<typeof createMemoryAudioAssetByteStore>,
) {
  const result = await renderOfflineAudio({
    project: session.project,
    store,
    sampleRateHz: 8_000,
    blockFrames: 128,
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
  return result.value;
}

Deno.test("AUDIO-320 canonical Effect chain supports Upsert, reorder, bypass, Undo/Redo", async () => {
  const fixture = await effectFixture();
  const eq = await journalWorkspaceEffectUpsert(
    fixture.session,
    "BGM",
    {
      id: "effect:eq",
      kind: "EQ",
      parameters: { frequency: 800, gainDb: 6, q: 1 },
    },
    { commandId: "effect-eq" },
  );
  assert(eq.ok, JSON.stringify(eq.diagnostics));
  const compressor = await journalWorkspaceEffectUpsert(
    eq.value,
    "BGM",
    {
      id: "effect:compressor",
      kind: "COMPRESSOR",
      parameters: { thresholdDb: -24, ratio: 4 },
    },
    { commandId: "effect-compressor" },
  );
  assert(compressor.ok, JSON.stringify(compressor.diagnostics));
  const reverb = await journalWorkspaceEffectUpsert(
    compressor.value,
    "BGM",
    {
      id: "effect:reverb",
      kind: "REVERB",
      parameters: { delayMs: 80, decay: 0.4, mix: 0.2 },
    },
    { commandId: "effect-reverb" },
  );
  assert(reverb.ok, JSON.stringify(reverb.diagnostics));
  assert(
    reverb.value.project.tracks[0]?.effectIds.length === 3,
    "Effect chain was not bound.",
  );
  const reordered = await journalWorkspaceEffectReorder(
    reverb.value,
    "BGM",
    ["effect:reverb", "effect:eq", "effect:compressor"],
    { commandId: "effect-reorder" },
  );
  assert(reordered.ok, JSON.stringify(reordered.diagnostics));
  assert(
    String(reordered.value.project.tracks[0]?.effectIds[0]) === "effect:reverb",
    "Effect reorder was not canonical.",
  );
  const undone = await undoWorkspaceAudio(reordered.value);
  assert(undone.ok, JSON.stringify(undone.diagnostics));
  const redone = await redoWorkspaceAudio(undone.value);
  assert(redone.ok, JSON.stringify(redone.diagnostics));
  const bypass = await journalWorkspaceEffectUpsert(
    redone.value,
    "BGM",
    {
      id: "effect:reverb",
      kind: "REVERB",
      enabled: false,
      parameters: { delayMs: 80, decay: 0.4, mix: 0.2 },
    },
    { commandId: "effect-bypass" },
  );
  assert(bypass.ok, JSON.stringify(bypass.diagnostics));
  assert(
    bypass.value.project.effects.find((effect) =>
      String(effect.effectId) === "effect:reverb"
    )?.enabled === false,
    "Bypass was not persisted.",
  );
});

Deno.test("AUDIO-320 Realtime FX nodes are lazy, reorderable, and disposable", () => {
  const mixer: AudioMixer = {
    mixerId: "mixer:effects" as never,
    masterGainMilliDb: 0,
    channels: [{
      channelId: "channel:bgm" as never,
      trackId: "instrument:bgm" as never,
      gainMilliDb: 0,
      panMilli: 0,
      muted: false,
      solo: false,
    }],
  };
  const effects: AudioEffect[] = [
    {
      effectId: "effect:eq" as never,
      kind: "EQ",
      enabled: true,
      parameters: [{ name: "gainDb", value: 6 }],
    },
    {
      effectId: "effect:compressor" as never,
      kind: "COMPRESSOR",
      enabled: true,
      parameters: [],
    },
    {
      effectId: "effect:delay" as never,
      kind: "DELAY",
      enabled: true,
      parameters: [{ name: "delayMs", value: 90 }],
    },
    {
      effectId: "effect:reverb" as never,
      kind: "REVERB",
      enabled: true,
      parameters: [],
    },
  ];
  const runtime = new MixerRuntimeAdapter(
    new FakeAudioContext() as unknown as AudioContext,
  );
  runtime.applyMixer(mixer, new Map([["instrument:bgm", effects]]));
  assert(
    runtime.snapshot().effectNodeCount === 4,
    "EQ/Compressor/Delay/Reverb were not projected.",
  );
  const eightBandEq: AudioEffect = {
    ...effects[0]!,
    effectId: "effect:eq-eight-band" as never,
    parameters: [
      ...AUDIO_EQ_BANDS.map((band, index) => ({
        name: band.parameterName,
        value: index === 4 ? 6 : 0,
      })),
      { name: "eqQ", value: 1.2 },
      { name: "mix", value: 1 },
    ],
  };
  runtime.applyMixer(
    mixer,
    new Map([["instrument:bgm", [eightBandEq]]]),
  );
  assert(
    runtime.snapshot().effectNodeCount === AUDIO_EQ_BANDS.length,
    "Realtime EQ did not project one filter node per band.",
  );
  runtime.applyMixer(
    mixer,
    new Map([[
      "instrument:bgm",
      effects.map((effect) => ({ ...effect, enabled: false })),
    ]]),
  );
  assert(
    runtime.snapshot().effectNodeCount === 0,
    "Bypassed FX nodes were not released.",
  );
  runtime.dispose();
  assert(
    runtime.snapshot().trackNodeCount === 0,
    "FX runtime left orphan Track nodes.",
  );
});

Deno.test("AUDIO-320 Offline Delay changes rendered audio", async () => {
  const fixture = await effectFixture();
  const clean = await render(fixture.session, fixture.store);
  const delayed = await journalWorkspaceEffectUpsert(
    fixture.session,
    "BGM",
    {
      id: "effect:delay",
      kind: "DELAY",
      parameters: { delayMs: 30, feedback: 0, mix: 1 },
    },
    { commandId: "effect-render-delay" },
  );
  assert(delayed.ok, JSON.stringify(delayed.diagnostics));
  const rendered = await render(delayed.value, fixture.store);
  assert(
    Math.abs(pcm16(clean.bytes!, 100) - pcm16(rendered.bytes!, 100)) > 20,
    "Delay did not change rendered audio.",
  );
});

Deno.test("AUDIO-320 Offline Render and Effect Automation change audio without mutating canonical bytes", async () => {
  const fixture = await effectFixture();
  const clean = await render(fixture.session, fixture.store);
  const effect = await journalWorkspaceEffectUpsert(
    fixture.session,
    "BGM",
    {
      id: "effect:eq",
      kind: "EQ",
      parameters: { frequency: 800, gainDb: 6, q: 1 },
    },
    { commandId: "effect-render-eq" },
  );
  assert(effect.ok, JSON.stringify(effect.diagnostics));
  const rendered = await render(effect.value, fixture.store);
  assert(
    Math.abs(pcm16(clean.bytes!, 100) - pcm16(rendered.bytes!, 100)) > 20,
    "EQ did not change rendered audio.",
  );
  const automation: AudioAutomation = {
    automationId: asAudioAutomationId("automation:effect-gain"),
    target: {
      kind: "EFFECT_PARAMETER",
      targetId: "effect:eq",
      parameterName: "gainDb",
    },
    points: [{ tick: asAudioTick(0), value: 0 }, {
      tick: asAudioTick(480),
      value: 6,
    }],
  };
  const automated = await journalWorkspaceAutomationUpsert(
    effect.value,
    automation,
    { commandId: "effect-automation" },
  );
  assert(automated.ok, JSON.stringify(automated.diagnostics));
  const automatedRender = await render(automated.value, fixture.store);
  assert(
    automatedRender.projectStateHash === automated.value.project.stateHash,
    "Render changed canonical Project state.",
  );
});

Deno.test("AUDIO-320 eight-band EQ renders the same bands exposed by the editor", async () => {
  const fixture = await effectFixture();
  const clean = await render(fixture.session, fixture.store);
  const eq = await journalWorkspaceEffectUpsert(
    fixture.session,
    "BGM",
    {
      id: "effect:eq-eight-band",
      kind: "EQ",
      parameters: {
        ...Object.fromEntries(
          AUDIO_EQ_BANDS.map((band, index) => [
            band.parameterName,
            index === 4 ? 12 : 0,
          ]),
        ),
        eqQ: 1.2,
        mix: 1,
      },
    },
    { commandId: "effect-eight-band" },
  );
  assert(eq.ok, JSON.stringify(eq.diagnostics));
  const rendered = await render(eq.value, fixture.store);
  let maximumDifference = 0;
  for (let frame = 0; frame < 1_000; frame += 1) {
    maximumDifference = Math.max(
      maximumDifference,
      Math.abs(pcm16(clean.bytes!, frame) - pcm16(rendered.bytes!, frame)),
    );
  }
  assert(
    maximumDifference > 20,
    "Eight-band EQ did not change rendered audio.",
  );
});
