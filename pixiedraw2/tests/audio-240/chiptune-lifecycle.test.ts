import { ChipTuneSynth } from "../../src/audio/audio-240/chiptune-synth.ts";
import type { AudioMixer } from "../../src/audio/audio-200/contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeParam {
  value = 0;
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }
  cancelScheduledValues(): void {}
  setTargetAtTime(value: number): void {
    this.value = value;
  }
}

class FakeNode {
  connect(_target: FakeNode): void {}
  disconnect(): void {}
}

class FakeBuffer {
  private readonly data = new Float32Array(16);
  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam();
}

class FakeOscillator extends FakeNode {
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
  type = "sine";
  setPeriodicWave(): void {}
  addEventListener(): void {}
  start(): void {}
  stop(): void {}
}

class FakeBiquad extends FakeNode {
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  type = "lowpass";
}

class FakeBufferSource extends FakeNode {
  buffer: FakeBuffer | undefined;
  addEventListener(): void {}
  start(): void {}
  stop(): void {}
}

class FakeContext {
  state: AudioContextState = "suspended";
  currentTime = 0;
  readonly destination = new FakeNode();
  resumeCalls = 0;
  private readonly stateListeners = new Set<() => void>();
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
    for (const listener of this.stateListeners) listener();
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = "suspended";
    for (const listener of this.stateListeners) listener();
    return Promise.resolve();
  }
  addEventListener(
    _type: string,
    listener: () => void,
  ): void {
    this.stateListeners.add(listener);
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
  createStereoPanner(): FakePanner {
    return new FakePanner();
  }
  createOscillator(): FakeOscillator {
    return new FakeOscillator();
  }
  createBiquadFilter(): FakeBiquad {
    return new FakeBiquad();
  }
  createBuffer(): FakeBuffer {
    return new FakeBuffer();
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource();
  }
  createPeriodicWave(): object {
    return {};
  }
}

function mixerFixture(): AudioMixer {
  return {
    mixerId: "mixer:lifecycle" as never,
    masterGainMilliDb: 0,
    channels: [{
      channelId: "channel:piano" as never,
      trackId: "instrument:piano" as never,
      gainMilliDb: 0,
      panMilli: 0,
      muted: false,
      solo: false,
    }],
  };
}

Deno.test("AUDIO-240 blocks suspended scheduling and exposes recovery state", async () => {
  let context: FakeContext | undefined;
  const windowRef = {
    AudioContext: class {
      constructor() {
        context = new FakeContext();
        return context;
      }
    },
  } as unknown as Window;
  const synth = new ChipTuneSynth(windowRef);
  assert(synth.prepare(), "AudioContext was not created.");
  assert(
    synth.scheduleNoteAt(60, 100, "triangle", 0.8, 0, "instrument:piano") ===
      false,
    "A suspended Context accepted a silent note schedule.",
  );
  synth.setMixer(mixerFixture());
  assert((await synth.resume()) === true, "Context did not resume.");
  const diagnostics = synth.getPlaybackDiagnostics(["instrument:piano"]);
  assert(
    diagnostics.contextState === "running",
    "Running state was not reported.",
  );
  assert(diagnostics.missingTrackIds.length === 0, "Track binding was lost.");
  assert(
    diagnostics.silentTrackIds.length === 0,
    "Audible Track was reported silent.",
  );
  assert(
    synth.scheduleNoteAt(60, 100, "triangle", 0.8, 0, "instrument:piano"),
    "A running Context rejected a valid note schedule.",
  );
  assert(
    synth.playPreviewNote(64, 100, "triangle", 0.8),
    "Preview bus rejected a valid note.",
  );
  assert((context?.resumeCalls ?? 0) >= 1, "Resume was not attempted.");
  synth.dispose();
});

Deno.test("AUDIO-240 preview bus does not require a canonical Track", async () => {
  let context: FakeContext | undefined;
  const windowRef = {
    AudioContext: class {
      constructor() {
        context = new FakeContext();
        return context;
      }
    },
  } as unknown as Window;
  const synth = new ChipTuneSynth(windowRef);
  synth.setMixer({ ...mixerFixture(), channels: [] });
  assert(synth.prepare(), "AudioContext was not created.");
  assert(await synth.resume(), "Preview Context did not resume.");
  assert(
    synth.playPreviewNote(60, 80, "triangle"),
    "An unbound note could not use the transient preview bus.",
  );
  assert(
    synth.getPlaybackDiagnostics().missingTrackIds.length === 0,
    "Preview bus incorrectly reported a missing Track.",
  );
  synth.dispose();
});

Deno.test("AUDIO-240 suspends and resumes after a Safari-like lifecycle change", async () => {
  let context: FakeContext | undefined;
  const windowRef = {
    AudioContext: class {
      constructor() {
        context = new FakeContext();
        if (context !== undefined) context.state = "running";
        return context;
      }
    },
  } as unknown as Window;
  const synth = new ChipTuneSynth(windowRef);
  const observed: string[] = [];
  synth.onContextStateChange((state) => observed.push(state));
  assert(synth.prepare(), "Lifecycle Context was not created.");
  synth.suspend();
  await Promise.resolve();
  assert(context?.state === "suspended", "Context did not suspend.");
  assert(await synth.resume(), "Context did not recover after suspension.");
  assert(observed.includes("suspended"), "Suspension was not observable.");
  assert(observed.includes("running"), "Recovery was not observable.");
  synth.dispose();
});

Deno.test("AUDIO-240 rebuilds a closed Context from canonical Mixer state", () => {
  let contexts = 0;
  let latest: FakeContext | undefined;
  const windowRef = {
    AudioContext: class {
      constructor() {
        contexts += 1;
        latest = new FakeContext();
        latest.state = "running";
        return latest;
      }
    },
  } as unknown as Window;
  const synth = new ChipTuneSynth(windowRef);
  synth.setMixer(mixerFixture());
  assert(synth.prepare(), "Initial Context was not created.");
  synth.dispose();
  assert(synth.prepare(), "Closed Context was not rebuilt.");
  const diagnostics = synth.getPlaybackDiagnostics(["instrument:piano"]);
  assert(contexts === 2, "The closed Context was reused instead of rebuilt.");
  assert(
    diagnostics.contextState === "running",
    "Rebuilt Context is not running.",
  );
  assert(
    diagnostics.missingTrackIds.length === 0,
    "Canonical Mixer was not re-projected.",
  );
  assert(latest !== undefined, "Rebuilt Context was not retained.");
  synth.dispose();
});
