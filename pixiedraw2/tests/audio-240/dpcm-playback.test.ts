import { ChipTuneSynth } from "../../src/audio/audio-240/chiptune-synth.ts";
import { quantizeDpcmSample } from "../../src/audio/audio-240/dpcm.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeParam {
  value = 0;
  cancelScheduledValues(): void {}
  setTargetAtTime(value: number): void {
    this.value = value;
  }
}

class FakeNode {
  disconnectCalls = 0;
  connect(_target: FakeNode): void {}
  disconnect(): void {
    this.disconnectCalls += 1;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam();
}

class FakeBuffer {
  readonly data: Float32Array;
  constructor(length: number) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

type EndedListener = () => void;

class FakeBufferSource extends FakeNode {
  buffer: FakeBuffer | undefined;
  loop = false;
  startCalls = 0;
  stopCalls = 0;
  private endedListener: EndedListener | undefined;
  addEventListener(_type: string, listener: EndedListener): void {
    this.endedListener = listener;
  }
  start(): void {
    this.startCalls += 1;
  }
  stop(): void {
    this.stopCalls += 1;
  }
  emitEnded(): void {
    this.endedListener?.();
  }
}

class FakeContext {
  state: AudioContextState = "running";
  currentTime = 1;
  readonly destination = new FakeNode();
  createBufferCalls: number = 0;
  lastBuffer: FakeBuffer | undefined;
  lastSource: FakeBufferSource | undefined;

  addEventListener(): void {}
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
  createStereoPanner(): FakePanner {
    return new FakePanner();
  }
  createBuffer(_channels: number, length: number): FakeBuffer {
    this.createBufferCalls += 1;
    if (length <= 0) throw new Error("zero-length buffers are not allowed");
    this.lastBuffer = new FakeBuffer(length);
    return this.lastBuffer;
  }
  createBufferSource(): FakeBufferSource {
    this.lastSource = new FakeBufferSource();
    return this.lastSource;
  }
}

Deno.test("AUDIO-240 DPCM playback validates before buffer creation and disconnects on ended", () => {
  let constructorCalls = 0;
  const context = new FakeContext();
  const windowRef = {
    AudioContext: class {
      constructor() {
        constructorCalls += 1;
        return context;
      }
    },
  } as unknown as Window;
  const synth = new ChipTuneSynth(windowRef);
  const empty = quantizeDpcmSample("empty", new Float32Array(0), 16_000);

  assert(!synth.playDpcmSample(empty), "Zero-frame DPCM playback was accepted.");
  assert(constructorCalls === 0 && context.createBufferCalls === 0, "Invalid DPCM created an AudioContext or buffer.");

  const sample = quantizeDpcmSample("jump", new Float32Array([1, -1, -1]), 16_000);
  assert(synth.playDpcmSample(sample), "Valid DPCM playback was rejected.");
  assert(Number(context.createBufferCalls) === 1, "Valid DPCM did not create one buffer.");
  assert(context.lastBuffer?.data.length === 3, "DPCM playback buffer length was truncated incorrectly.");
  assert(synth.getPlaybackDiagnostics().activeSourceCount === 1, "DPCM source was not tracked.");

  const source = context.lastSource;
  assert(source !== undefined, "DPCM source was not created.");
  source.emitEnded();
  assert(source.disconnectCalls === 1, "Ended DPCM source was not disconnected.");
  assert(synth.getPlaybackDiagnostics().activeSourceCount === 0, "Ended DPCM source remained active.");
  synth.dispose();
});
