import {
  asAudioAssetId,
  asAudioClipId,
  asAudioRevisionId,
  asAudioTrackId,
  asSourceBlobId,
  canonicalizeSourceBlob,
  createMemoryAudioAssetByteStore,
} from "../../src/audio/audio-200/index.ts";
import type {
  AudioClip,
  AudioRevision,
} from "../../src/audio/audio-200/contracts.ts";
import { LongAudioClipRuntime } from "../../src/audio/audio-240/long-audio-runtime.ts";
import { MixerRuntimeAdapter } from "../../src/audio/audio-240/mixer-runtime.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeParam {
  value = 0;
  setValueAtTime(value: number, _time: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number, _time: number): void {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number, _time: number): void {
    this.value = value;
  }
  cancelScheduledValues(_time: number): void {}
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
  buffer: FakeBuffer | undefined;
  readonly playbackRate = new FakeParam();
  starts = 0;
  stops = 0;
  private ended: (() => void) | undefined;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    if (type === "ended") this.ended = listener as () => void;
  }
  start(_when: number, _offset?: number, _duration?: number): void {
    this.starts += 1;
  }
  stop(_when?: number): void {
    this.stops += 1;
    this.ended?.();
  }
}

class FakeAudioContext {
  readonly destination = new FakeNode();
  currentTime = 0;
  readonly sampleRate = 8_000;
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

function wavFixture(): Uint8Array {
  const sampleFrames = 800;
  const bytes = new Uint8Array(44 + sampleFrames * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8_000, true);
  view.setUint32(28, 16_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, sampleFrames * 2, true);
  for (let index = 0; index < sampleFrames; index += 1) {
    view.setInt16(44 + index * 2, 4_000, true);
  }
  return bytes;
}

async function revisionFixture(): Promise<
  { readonly bytes: Uint8Array; readonly revision: AudioRevision }
> {
  const bytes = wavFixture();
  const result = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("runtime-source"),
    assetId: asAudioAssetId("runtime-asset"),
    revisionId: asAudioRevisionId("runtime-revision"),
    revisionNumber: 1,
    kind: "SONG",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/runtime.wav",
    },
    bytes,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
  return { bytes, revision: result.value };
}

Deno.test("Phase 2-B2 runtime schedules one bounded chunk and releases it on restart/stop", async () => {
  const source = await revisionFixture();
  const store = createMemoryAudioAssetByteStore();
  assert(
    (await store.put(source.revision, source.bytes)).ok,
    "Source put failed.",
  );
  const context = new FakeAudioContext();
  const mixer = new MixerRuntimeAdapter(context as unknown as AudioContext);
  mixer.applyMixer({
    mixerId: "mixer:runtime" as never,
    masterGainMilliDb: 0,
    channels: [{
      channelId: "channel:runtime" as never,
      trackId: asAudioTrackId("track:runtime"),
      gainMilliDb: 0,
      panMilli: 0,
      muted: false,
      solo: false,
    }],
  });
  const clip: AudioClip = {
    clipId: asAudioClipId("clip:runtime"),
    trackId: asAudioTrackId("track:runtime"),
    revisionId: source.revision.revisionId,
    timeline: { startTick: 0 as never, durationTick: 48_000 as never },
    sourceOffsetUs: 0,
    gainMilliDb: -6_000,
    fadeInTick: 2_400 as never,
    fadeOutTick: 2_400 as never,
    loop: false,
    playbackRate: 0.5,
  };
  const created = await LongAudioClipRuntime.create({
    store,
    context: context as unknown as AudioContext,
    mixer,
    windowRef: new FakeWindow() as unknown as Window,
    clip,
    revision: source.revision,
    tempoMilliBpm: 120_000,
    ticksPerQuarter: 480,
    chunkSeconds: 0.05,
    readAheadChunks: 1,
    maxCachedChunks: 2,
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const runtime = created.value;
  assert(
    runtime.snapshot().playbackRate === 0.5,
    "Playback rate was not projected.",
  );
  assert(
    runtime.snapshot().durationSeconds > 0.1,
    "Slower Clip playback did not extend the output duration.",
  );
  assert((await runtime.play(0, false)).ok, "Runtime did not start.");
  await Promise.resolve();
  assert(
    runtime.snapshot().activeSourceCount <= 1,
    "Playback scheduled duplicate source nodes.",
  );
  const sought = await runtime.seek(0.05);
  assert(sought.ok, JSON.stringify(sought.diagnostics));
  assert(
    runtime.isPlaying,
    `Seek stopped an active Clip transport: ${JSON.stringify(sought)} · ${
      JSON.stringify(runtime.snapshot())
    }`,
  );
  assert(
    Math.abs(runtime.positionSeconds - 0.05) < 0.0001,
    "Seek did not re-anchor the Clip transport position.",
  );
  assert((await runtime.play(0, false)).ok, "Runtime could not restart.");
  runtime.stop();
  assert(
    runtime.snapshot().activeSourceCount === 0,
    "Stop left orphan source nodes.",
  );
  assert(
    runtime.snapshot().reader.cachedChunkCount === 0,
    "Stop did not clear read-ahead chunks.",
  );
  runtime.dispose();
  mixer.dispose();
});

Deno.test("Phase 2-B2 separates Clip source looping from transport looping", async () => {
  const source = await revisionFixture();
  const store = createMemoryAudioAssetByteStore();
  assert(
    (await store.put(source.revision, source.bytes)).ok,
    "Source put failed.",
  );
  const context = new FakeAudioContext();
  const mixer = new MixerRuntimeAdapter(context as unknown as AudioContext);
  mixer.applyMixer({
    mixerId: "mixer:loop" as never,
    masterGainMilliDb: 0,
    channels: [{
      channelId: "channel:loop" as never,
      trackId: asAudioTrackId("track:loop"),
      gainMilliDb: 0,
      panMilli: 0,
      muted: false,
      solo: false,
    }],
  });
  const clip: AudioClip = {
    clipId: asAudioClipId("clip:loop"),
    trackId: asAudioTrackId("track:loop"),
    revisionId: source.revision.revisionId,
    timeline: { startTick: 0 as never, durationTick: 960 as never },
    sourceOffsetUs: 0,
    gainMilliDb: 0,
    fadeInTick: 0 as never,
    fadeOutTick: 0 as never,
    loop: true,
  };
  const runtime = await LongAudioClipRuntime.create({
    store,
    context: context as unknown as AudioContext,
    mixer,
    windowRef: new FakeWindow() as unknown as Window,
    clip,
    revision: source.revision,
    tempoMilliBpm: 120_000,
    ticksPerQuarter: 480,
    chunkSeconds: 0.05,
    maxCachedChunks: 2,
  });
  assert(runtime.ok, JSON.stringify(runtime.diagnostics));
  runtime.value.setLoop(false);
  const started = await runtime.value.play(0, false);
  assert(started.ok, JSON.stringify(started.diagnostics));
  assert(runtime.value.loop === false, "Transport loop was not disabled.");
  runtime.value.stop();
  assert(
    runtime.value.snapshot().activeSourceCount === 0,
    "Stop left orphan source nodes.",
  );
  runtime.value.dispose();
  mixer.dispose();
});
