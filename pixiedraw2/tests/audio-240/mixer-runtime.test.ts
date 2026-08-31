import {
  mixerGainToLinear,
  mixerPanToNormalized,
  MixerRuntimeAdapter,
} from "../../src/audio/audio-240/mixer-runtime.ts";
import type { AudioMixer } from "../../src/audio/audio-200/contracts.ts";

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
  readonly currentTime = 12;
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createStereoPanner(): FakePannerNode {
    return new FakePannerNode();
  }
}

function mixerFixture(): AudioMixer {
  return {
    mixerId: "mixer:runtime" as never,
    masterGainMilliDb: 0,
    channels: [
      {
        channelId: "channel:piano" as never,
        trackId: "instrument:piano" as never,
        gainMilliDb: -6_000,
        panMilli: -1_000,
        muted: false,
        solo: false,
      },
      {
        channelId: "channel:guitar" as never,
        trackId: "instrument:guitar" as never,
        gainMilliDb: 0,
        panMilli: 1_000,
        muted: false,
        solo: true,
      },
      {
        channelId: "channel:chip" as never,
        trackId: "instrument:chip" as never,
        gainMilliDb: 0,
        panMilli: 0,
        muted: true,
        solo: false,
      },
    ],
  };
}

Deno.test("AUDIO-240 Mixer Runtime applies gain, pan, mute, and solo", () => {
  assert(
    Math.abs(mixerGainToLinear(-6_000) - 0.501187) < 0.001,
    "-6 dB was not converted to a linear gain.",
  );
  assert(
    mixerPanToNormalized(-1_000) === -1 &&
      mixerPanToNormalized(0) === 0 &&
      mixerPanToNormalized(1_000) === 1,
    "Pan fixed-point values were not normalized.",
  );
  const runtime = new MixerRuntimeAdapter(
    new FakeAudioContext() as unknown as AudioContext,
  );
  runtime.applyMixer(mixerFixture());
  const snapshot = runtime.snapshot();
  assert(
    snapshot.trackNodeCount === 3,
    "Mixer created an unexpected node count.",
  );
  assert(
    Math.abs(snapshot.tracks["instrument:piano"]?.gain ?? 0) < 0.0001,
    "A non-solo Track was not silenced while Solo was active.",
  );
  assert(
    snapshot.tracks["instrument:guitar"]?.gain === 1 &&
      snapshot.tracks["instrument:guitar"]?.pan === 1 &&
      snapshot.tracks["instrument:guitar"]?.solo === true,
    "The Solo Track did not receive its canonical gain/pan.",
  );
  assert(
    snapshot.tracks["instrument:chip"]?.gain === 0 &&
      snapshot.tracks["instrument:chip"]?.muted === true,
    "Mute did not take precedence over runtime output.",
  );

  runtime.applyMixer({ ...mixerFixture(), masterGainMilliDb: -6_000 });
  assert(
    Math.abs(runtime.snapshot().masterGain - 0.501187) < 0.001,
    "Master gain was not projected to the runtime graph.",
  );
  runtime.applyMixer(mixerFixture());
  assert(
    runtime.snapshot().trackNodeCount === 3,
    "Reapplying Mixer state created duplicate Track nodes.",
  );
  runtime.applyMixer({
    ...mixerFixture(),
    channels: mixerFixture().channels.slice(0, 2),
  });
  assert(
    runtime.snapshot().trackNodeCount === 2,
    "Removed Mixer channels left orphan runtime nodes.",
  );
  runtime.applyMixer({
    ...mixerFixture(),
    channels: [{
      ...mixerFixture().channels[0]!,
      outputTrackId: "bus:missing" as never,
    }],
  });
  assert(
    runtime.snapshot().trackNodeCount === 2 &&
      runtime.snapshot().tracks["instrument:piano"]?.gain === 0,
    "Runtime accepted an output destination that was not in the canonical Mixer.",
  );
  runtime.dispose();
  assert(
    runtime.snapshot().trackNodeCount === 0,
    "Runtime nodes were not disposed.",
  );
});
