/// <reference lib="dom" />

/** Browser MediaStream -> bounded Phase 2-C recorder adapter. */

import {
  type Audio200Result,
  audioFail,
  audioOk,
} from "../audio-200/contracts.ts";
import { MixerRuntimeAdapter } from "../audio-240/mixer-runtime.ts";
import {
  type AudioRecordedTake,
  type AudioRecordingIdentity,
  type AudioRecordingInputChunk,
  AudioRecordingSession,
  type AudioRecordingSessionOptions,
  type AudioRecordingSnapshot,
  type AudioRecordingStartInput,
} from "./recording.ts";
import type { AudioRecordingStorage } from "./recording-storage.ts";

const PROCESSOR_BUFFER_FRAMES = 4_096;

export interface BrowserAudioRecordingOptions {
  readonly windowRef: Window;
  readonly context: AudioContext;
  readonly mixer: MixerRuntimeAdapter;
  readonly storage: AudioRecordingStorage;
  readonly identity: AudioRecordingIdentity;
  readonly sourceName: string;
  readonly trackId: string;
  readonly tempoBpm: number;
  readonly channels?: 1 | 2;
  readonly sampleRateHz?: number;
  readonly maxDurationSeconds?: number;
  readonly inputConstraints?: MediaTrackConstraints;
}

function fail<T>(
  message: string,
  path: string,
  recoverable = false,
): Audio200Result<T> {
  return audioFail(
    recoverable ? "AUDIO_SOURCE_UNAVAILABLE" : "AUDIO_HOST_BOUNDARY_INVALID",
    message,
    path,
    recoverable,
  );
}

interface RecordingNodes {
  readonly stream: MediaStream;
  readonly source: MediaStreamAudioSourceNode;
  readonly processor: ScriptProcessorNode;
  readonly monitor: GainNode;
  readonly silent: GainNode;
}

/**
 * ScriptProcessorNode is used as a compatibility capture bridge only. It
 * copies each callback into the host-neutral recorder and immediately releases
 * the callback buffers; the actual recording bytes are written by the OPFS
 * sink, not accumulated here. A future AudioWorklet can replace this adapter
 * without changing Project/Journal contracts.
 */
export class BrowserAudioRecordingRuntime {
  private readonly session: AudioRecordingSession;
  private readonly nodes: RecordingNodes;
  private disposed = false;

  private constructor(
    private readonly options: BrowserAudioRecordingOptions,
    session: AudioRecordingSession,
    nodes: RecordingNodes,
  ) {
    this.session = session;
    this.nodes = nodes;
  }

  static async create(
    options: BrowserAudioRecordingOptions,
  ): Promise<Audio200Result<BrowserAudioRecordingRuntime>> {
    const mediaDevices = options.windowRef.navigator?.mediaDevices;
    if (mediaDevices?.getUserMedia === undefined) {
      return fail(
        "This browser does not expose microphone input.",
        "navigator.mediaDevices",
        true,
      );
    }
    const sampleRateHz = options.sampleRateHz ?? options.context.sampleRate;
    const channels = options.channels ?? 1;
    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({
        audio: options.inputConstraints ?? {
          channelCount: channels,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } catch {
      return fail(
        "Microphone permission or input acquisition failed.",
        "navigator.mediaDevices.getUserMedia",
        true,
      );
    }
    const sourceName = options.sourceName.trim();
    const sessionOptions: AudioRecordingSessionOptions = {
      storage: options.storage,
      identity: options.identity,
      sourceName,
      trackId: options.trackId,
      sampleRateHz,
      channels,
      tempoBpm: options.tempoBpm,
      ...(options.maxDurationSeconds === undefined
        ? {}
        : { maxDurationSeconds: options.maxDurationSeconds }),
    };
    const created = AudioRecordingSession.create(sessionOptions);
    if (!created.ok) {
      for (const track of stream.getTracks()) track.stop();
      return created;
    }
    const armed = created.value.arm();
    if (!armed.ok) {
      for (const track of stream.getTracks()) track.stop();
      return armed;
    }
    let sourceNode: MediaStreamAudioSourceNode | undefined;
    let processorNode: ScriptProcessorNode | undefined;
    let monitorNode: GainNode | undefined;
    let silentNode: GainNode | undefined;
    try {
      sourceNode = options.context.createMediaStreamSource(stream);
      processorNode = options.context.createScriptProcessor(
        PROCESSOR_BUFFER_FRAMES,
        channels,
        channels,
      );
      monitorNode = options.context.createGain();
      silentNode = options.context.createGain();
      monitorNode.gain.value = 0;
      silentNode.gain.value = 0;
      sourceNode.connect(processorNode);
      sourceNode.connect(monitorNode);
      monitorNode.connect(options.mixer.getTrackInput(options.trackId));
      processorNode.connect(silentNode);
      silentNode.connect(options.context.destination);
      const nodes: RecordingNodes = {
        stream,
        source: sourceNode,
        processor: processorNode,
        monitor: monitorNode,
        silent: silentNode,
      };
      const runtime = new BrowserAudioRecordingRuntime(
        options,
        created.value,
        nodes,
      );
      processorNode.onaudioprocess = (event) => {
        if (runtime.disposed) return;
        const input = event.inputBuffer;
        const frameCount = input.length;
        const copied = Array.from(
          { length: channels },
          (_, channel) =>
            new Float32Array(
              input.getChannelData(
                Math.min(channel, input.numberOfChannels - 1),
              ),
            ),
        );
        const chunk: AudioRecordingInputChunk = {
          audioTimeSeconds: Math.max(
            0,
            options.context.currentTime - input.duration,
          ),
          sampleRateHz,
          channels,
          samples: copied,
        };
        runtime.session.tick(options.context.currentTime);
        void runtime.session.ingest(chunk);
        void frameCount;
      };
      return audioOk(runtime);
    } catch {
      try {
        if (processorNode !== undefined) processorNode.onaudioprocess = null;
        sourceNode?.disconnect();
        processorNode?.disconnect();
        monitorNode?.disconnect();
        silentNode?.disconnect();
      } catch {
        // Best-effort teardown for partially-created browser graphs.
      }
      for (const track of stream.getTracks()) track.stop();
      return fail(
        "Audio input graph could not be created.",
        "audioContext.recordingGraph",
        true,
      );
    }
  }

  get state(): ReturnType<AudioRecordingSession["snapshot"]>["state"] {
    return this.session.snapshot().state;
  }

  get isActive(): boolean {
    return this.session.isActive;
  }

  get estimatedInputLatencyUs(): number {
    return Math.round((this.options.context.baseLatency ?? 0) * 1_000_000);
  }

  setMonitoring(enabled: boolean): void {
    const now = this.options.context.currentTime;
    try {
      this.nodes.monitor.gain.cancelScheduledValues(now);
      this.nodes.monitor.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.01);
    } catch {
      this.nodes.monitor.gain.value = enabled ? 1 : 0;
    }
  }

  async start(input: AudioRecordingStartInput): Promise<Audio200Result<true>> {
    if (this.disposed) {
      return fail("Recording runtime is disposed.", "recording.runtime");
    }
    const result = await this.session.start(input);
    this.session.tick(this.options.context.currentTime);
    return result;
  }

  async stop(): Promise<Audio200Result<AudioRecordedTake>> {
    if (this.disposed) {
      return fail("Recording runtime is disposed.", "recording.runtime");
    }
    const result = await this.session.stop();
    this.disconnectGraph();
    return result;
  }

  async cancel(): Promise<Audio200Result<true>> {
    if (this.disposed) return audioOk(true);
    const result = await this.session.cancel();
    this.disconnectGraph();
    return result;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.session.isActive || this.session.state === "ARMED") {
      await this.session.cancel();
    }
    this.disconnectGraph();
  }

  snapshot(): AudioRecordingSnapshot {
    return this.session.snapshot();
  }

  private disconnectGraph(): void {
    try {
      this.nodes.processor.onaudioprocess = null;
      this.nodes.source.disconnect();
      this.nodes.processor.disconnect();
      this.nodes.monitor.disconnect();
      this.nodes.silent.disconnect();
    } catch {
      // Audio graph teardown is idempotent across browser implementations.
    }
    for (const track of this.nodes.stream.getTracks()) track.stop();
  }
}
