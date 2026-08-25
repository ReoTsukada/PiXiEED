import {
  asAudioAssetId,
  asAudioProjectId,
  asAudioRevisionId,
  asSourceBlobId,
  canonicalizeSourceBlob,
  createAudioWorkspaceSession,
  createMemoryAudioAssetByteStore,
  journalWorkspaceAssetRevision,
  journalWorkspaceClipAdd,
  journalWorkspaceMixerChannel,
  journalWorkspaceRouting,
  journalWorkspaceTrackAdd,
  journalWorkspaceTrackRemove,
  redoWorkspaceAudio,
  undoWorkspaceAudio,
} from "../../src/audio/audio-200/index.ts";
import { buildProjectAudioRoutingGraph } from "../../src/audio/audio-310/index.ts";
import type { AudioMixer } from "../../src/audio/audio-200/contracts.ts";
import { MixerRuntimeAdapter } from "../../src/audio/audio-240/mixer-runtime.ts";
import { renderOfflineAudio } from "../../src/audio/audio-260/render.ts";
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

class FakeAudioContext {
  readonly destination = new FakeNode();
  readonly currentTime = 1;
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createStereoPanner(): FakePannerNode {
    return new FakePannerNode();
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

async function routedSession(): Promise<AudioWorkspaceSession> {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("routing-project"),
    name: "Routing",
    createdAt: "2026-08-18T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["BGM"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const bus = await journalWorkspaceTrackAdd(
    created.value,
    { id: "bus:music", kind: "BUS", name: "Music Bus" },
    { commandId: "routing-add-bus" },
  );
  assert(bus.ok, JSON.stringify(bus.diagnostics));
  const returned = await journalWorkspaceTrackAdd(
    bus.value,
    { id: "return:fx", kind: "RETURN", name: "FX Return" },
    { commandId: "routing-add-return" },
  );
  assert(returned.ok, JSON.stringify(returned.diagnostics));
  const routed = await journalWorkspaceRouting(
    returned.value,
    {
      trackId: "BGM",
      outputTrackId: "bus:music",
      sends: [{
        id: "send:bgm-fx",
        sourceTrackId: "BGM",
        destinationTrackId: "return:fx",
        amountDb: -6,
        preFader: true,
      }],
    },
    { commandId: "routing-set-bgm" },
  );
  assert(routed.ok, JSON.stringify(routed.diagnostics));
  return routed.value;
}

Deno.test("AUDIO-310 canonical Bus/Return/Send routing validates and cleans up", async () => {
  const session = await routedSession();
  const graph = buildProjectAudioRoutingGraph(session.project);
  assert(graph.ok, JSON.stringify(graph.diagnostics));
  assert(
    graph.value.order[0] === "instrument:bgm" &&
      graph.value.order.indexOf("bus:music" as never) > 0 &&
      graph.value.order.indexOf("return:fx" as never) > 0,
    "Routing order does not process sources before Bus/Return parents.",
  );
  assert(
    session.project.mixer.sends?.[0]?.preFader === true,
    "Canonical Send did not preserve the pre-fader flag.",
  );
  const cycle = await journalWorkspaceRouting(
    session,
    { trackId: "bus:music", outputTrackId: "return:fx" },
    { commandId: "routing-cycle-a" },
  );
  assert(cycle.ok, JSON.stringify(cycle.diagnostics));
  const rejected = await journalWorkspaceRouting(
    cycle.value,
    { trackId: "return:fx", outputTrackId: "bus:music" },
    { commandId: "routing-cycle-b" },
  );
  assert(!rejected.ok, "A Bus/Return cycle was accepted.");
  const undone = await undoWorkspaceAudio(cycle.value);
  assert(undone.ok, JSON.stringify(undone.diagnostics));
  const redone = await redoWorkspaceAudio(undone.value);
  assert(redone.ok, JSON.stringify(redone.diagnostics));
  const removed = await journalWorkspaceTrackRemove(
    redone.value,
    "return:fx",
    { commandId: "routing-remove-return" },
  );
  assert(removed.ok, JSON.stringify(removed.diagnostics));
  assert(
    removed.value.project.mixer.sends?.length === 0,
    "Removing a Return left an orphan Send.",
  );
});

Deno.test("AUDIO-310 Mixer Runtime projects routing and releases Send nodes", () => {
  const mixer: AudioMixer = {
    mixerId: "mixer:routing" as never,
    masterGainMilliDb: 0,
    channels: [
      {
        channelId: "channel:source" as never,
        trackId: "track:source" as never,
        gainMilliDb: 0,
        panMilli: 0,
        muted: false,
        solo: false,
        outputTrackId: "bus:main" as never,
      },
      {
        channelId: "channel:bus" as never,
        trackId: "bus:main" as never,
        gainMilliDb: 0,
        panMilli: 0,
        muted: false,
        solo: false,
      },
      {
        channelId: "channel:return" as never,
        trackId: "return:fx" as never,
        gainMilliDb: 0,
        panMilli: 0,
        muted: false,
        solo: false,
      },
    ],
    sends: [{
      sendId: "send:source-return" as never,
      sourceTrackId: "track:source" as never,
      destinationTrackId: "return:fx" as never,
      amountMilliDb: -6_000,
      preFader: true,
    }],
  };
  const runtime = new MixerRuntimeAdapter(
    new FakeAudioContext() as unknown as AudioContext,
  );
  runtime.applyMixer(mixer);
  assert(
    runtime.snapshot().trackNodeCount === 3,
    "Routing created an invalid Track node count.",
  );
  assert(
    runtime.snapshot().sendNodeCount === 1,
    "Send node was not projected.",
  );
  runtime.applyMixer({ ...mixer, sends: [] });
  assert(
    runtime.snapshot().sendNodeCount === 0,
    "Stale Send node was not released.",
  );
  runtime.dispose();
  assert(
    runtime.snapshot().trackNodeCount === 0,
    "Runtime Track nodes were not disposed.",
  );
});

async function renderFixture(): Promise<{
  readonly session: AudioWorkspaceSession;
  readonly store: ReturnType<typeof createMemoryAudioAssetByteStore>;
}> {
  const session = await routedSession();
  const bytes = wavFixture();
  const canonical = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("routing-blob"),
    assetId: asAudioAssetId("routing-asset"),
    revisionId: asAudioRevisionId("routing-revision"),
    revisionNumber: 1,
    kind: "SONG",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/routing.wav",
    },
    bytes,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  assert(canonical.ok, JSON.stringify(canonical.diagnostics));
  const imported = await journalWorkspaceAssetRevision(
    session,
    canonical.value,
    "routing.wav",
    { commandId: "routing-import" },
  );
  assert(imported.ok, JSON.stringify(imported.diagnostics));
  const clipped = await journalWorkspaceClipAdd(
    imported.value,
    {
      id: "clip:routing",
      trackId: "BGM",
      revisionId: canonical.value.revisionId,
      startFrame: 0,
      durationFrames: 6,
      sourceOffsetUs: 0,
    },
    { commandId: "routing-clip" },
  );
  assert(clipped.ok, JSON.stringify(clipped.diagnostics));
  const store = createMemoryAudioAssetByteStore();
  assert((await store.put(canonical.value, bytes)).ok, "Source put failed.");
  return { session: clipped.value, store };
}

function pcm16(bytes: Uint8Array, frame: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getInt16(44 + frame * 4, true);
}

Deno.test("AUDIO-310 Offline Render uses the same Bus/Return and pre-fader Send route", async () => {
  const fixture = await renderFixture();
  const rendered = await renderOfflineAudio({
    project: fixture.session.project,
    store: fixture.store,
    sampleRateHz: 8_000,
    blockFrames: 128,
  });
  assert(rendered.ok, JSON.stringify(rendered.diagnostics));
  const postFader = await journalWorkspaceMixerChannel(
    fixture.session,
    { trackId: "BGM", gainDb: -6, pan: 0, muted: false, solo: false },
    { commandId: "routing-post-fader" },
  );
  assert(postFader.ok, JSON.stringify(postFader.diagnostics));
  const postFixture = { ...fixture, session: postFader.value };
  const postRendered = await renderOfflineAudio({
    project: postFixture.session.project,
    store: postFixture.store,
    sampleRateHz: 8_000,
    blockFrames: 128,
  });
  assert(postRendered.ok, JSON.stringify(postRendered.diagnostics));
  assert(
    pcm16(rendered.value.bytes!, 100) > pcm16(postRendered.value.bytes!, 100),
    "Pre-fader Send did not remain louder than the post-fader route.",
  );
});
