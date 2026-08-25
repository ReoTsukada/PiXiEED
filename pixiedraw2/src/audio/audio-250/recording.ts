/** Host-neutral Phase 2-C recording state machine. */

import {
  asAudioAssetId,
  asAudioRevisionId,
  asAudioTrackId,
  asSourceBlobId,
  AUDIO200_METADATA_AUTHORITY,
  AUDIO200_SCHEMA_VERSION,
  type Audio200Result,
  type AudioAssetKind,
  audioFail,
  audioOk,
  type AudioRevision,
} from "../audio-200/contracts.ts";
import {
  type AudioRecordingStorage,
  type AudioRecordingStorageBegin,
  type AudioRecordingWriteSession,
} from "./recording-storage.ts";

const MAX_RECORDING_BYTES = 64 * 1024 * 1024;
const MIN_SAMPLE_RATE = 8_000;
const MAX_SAMPLE_RATE = 192_000;
// A slow OPFS device must not turn the capture callback into an unbounded
// Promise/PCM queue.  At the default 4096-frame browser callback this is a
// small, finite read-ahead window; overflow stops capture cleanly.
const MAX_PENDING_WRITE_CHUNKS = 32;
const MAX_PENDING_WRITE_BYTES = 2 * 1024 * 1024;

export type AudioRecordingState =
  | "IDLE"
  | "ARMED"
  | "COUNT_IN"
  | "RECORDING"
  | "STOPPING"
  | "COMMITTED"
  | "CANCELLED";

export interface AudioRecordingInputChunk {
  readonly audioTimeSeconds: number;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly samples: readonly Float32Array[];
}

export interface AudioRecordingIdentity {
  readonly assetId: string;
  readonly revisionId: string;
  readonly blobId: string;
  readonly revisionNumber: number;
  readonly kind?: AudioAssetKind;
  readonly tempPath: string;
  readonly finalPath: string;
}

export interface AudioRecordingSessionOptions {
  readonly storage: AudioRecordingStorage;
  readonly identity: AudioRecordingIdentity;
  readonly sourceName: string;
  readonly trackId: string;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly tempoBpm: number;
  readonly maxDurationSeconds?: number;
}

export interface AudioRecordingStartInput {
  /** AudioContext currentTime at the user Start gesture. */
  readonly audioTimeSeconds: number;
  /** Requested project timeline location for the resulting Clip. */
  readonly timelineStartSeconds: number;
  readonly countInBeats?: number;
  readonly preRollSeconds?: number;
  /** Positive input latency is removed from the Clip start. */
  readonly inputLatencyUs?: number;
  /** Explicit user correction applied after latency compensation. */
  readonly recordingOffsetUs?: number;
}

export interface AudioRecordedTake {
  readonly revision: AudioRevision;
  readonly sourceName: string;
  readonly trackId: string;
  readonly timelineStartSeconds: number;
  readonly durationSeconds: number;
  readonly sampleFrames: number;
  readonly inputLatencyUs: number;
  readonly recordingOffsetUs: number;
}

export interface AudioRecordingSnapshot {
  readonly state: AudioRecordingState;
  readonly sampleFrames: number;
  readonly durationSeconds: number;
  readonly timelineStartSeconds: number | null;
  readonly targetAudioTimeSeconds: number | null;
  readonly inputLatencyUs: number;
  readonly recordingOffsetUs: number;
}

function fail<T>(
  code:
    | "AUDIO_INVALID_NUMBER"
    | "AUDIO_INVALID_SOURCE"
    | "AUDIO_EMPTY_RECORDING"
    | "AUDIO_SOURCE_UNAVAILABLE",
  message: string,
  path: string,
  recoverable = false,
): Audio200Result<T> {
  return audioFail(code, message, path, recoverable);
}

function finiteNonNegative(value: number | undefined, fallback = 0): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function boundedCountIn(value: number | undefined): number {
  return Math.min(16, finiteNonNegative(value, 0));
}

function boundedDuration(
  value: number | undefined,
  sampleRateHz: number,
  channels: 1 | 2,
): number {
  const sourceMax = (MAX_RECORDING_BYTES - 44) / (sampleRateHz * channels * 2);
  const requested = value === undefined
    ? sourceMax
    : finiteNonNegative(value, 0);
  return Math.min(sourceMax, Math.max(0.001, requested));
}

function encodePcm16(
  samples: readonly Float32Array[],
  startFrame: number,
  frameCount: number,
  channels: 1 | 2,
): Uint8Array {
  const bytes = new Uint8Array(frameCount * channels * 2);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(
        -1,
        Math.min(1, samples[channel]![startFrame + frame] ?? 0),
      );
      const integer = value <= -1 ? -32_768 : Math.round(value * 32_767);
      view.setInt16(offset, integer, true);
      offset += 2;
    }
  }
  return bytes;
}

/**
 * Recording is a host-neutral producer. Browser input adapters only provide
 * timestamped Float32 chunks; this class owns count-in, latency correction,
 * bounded PCM encoding, and the one-shot stopped take.
 */
export class AudioRecordingSession {
  private stateValue: AudioRecordingState = "IDLE";
  private writer: AudioRecordingWriteSession | undefined;
  private writeQueue: Promise<Audio200Result<true>> = Promise.resolve(
    audioOk(true),
  );
  private pendingWriteChunks = 0;
  private pendingWriteBytes = 0;
  private sampleFramesValue = 0;
  private targetAudioTime: number | null = null;
  private timelineStart: number | null = null;
  private inputLatencyValue = 0;
  private recordingOffsetValue = 0;
  private startAudioTime = 0;
  private stoppedTake: AudioRecordedTake | undefined;

  private constructor(private readonly options: AudioRecordingSessionOptions) {
  }

  static create(
    options: AudioRecordingSessionOptions,
  ): Audio200Result<AudioRecordingSession> {
    if (
      !Number.isSafeInteger(options.sampleRateHz) ||
      options.sampleRateHz < MIN_SAMPLE_RATE ||
      options.sampleRateHz > MAX_SAMPLE_RATE ||
      ![1, 2].includes(options.channels) ||
      !Number.isFinite(options.tempoBpm) || options.tempoBpm < 20 ||
      options.tempoBpm > 300 || typeof options.sourceName !== "string" ||
      options.sourceName.trim().length === 0 ||
      !Number.isSafeInteger(options.identity.revisionNumber) ||
      options.identity.revisionNumber < 1
    ) {
      return fail(
        "AUDIO_INVALID_NUMBER",
        "Recording sample rate, channel count, tempo, or source name is invalid.",
        "recording.options",
      );
    }
    try {
      asAudioAssetId(options.identity.assetId);
      asAudioRevisionId(options.identity.revisionId);
      asSourceBlobId(options.identity.blobId);
      asAudioTrackId(options.trackId);
    } catch {
      return fail(
        "AUDIO_INVALID_SOURCE",
        "Recording Asset, Revision, Blob, or Track identity is invalid.",
        "recording.identity",
      );
    }
    return audioOk(new AudioRecordingSession(options));
  }

  get state(): AudioRecordingState {
    return this.stateValue;
  }

  get isActive(): boolean {
    return this.stateValue === "COUNT_IN" || this.stateValue === "RECORDING" ||
      this.stateValue === "STOPPING";
  }

  arm(): Audio200Result<true> {
    if (this.stateValue !== "IDLE" && this.stateValue !== "CANCELLED") {
      return fail(
        "AUDIO_INVALID_SOURCE",
        "Recording session is already armed or committed.",
        "recording.state",
      );
    }
    this.stateValue = "ARMED";
    return audioOk(true);
  }

  async start(input: AudioRecordingStartInput): Promise<Audio200Result<true>> {
    if (this.stateValue !== "ARMED") {
      return fail(
        "AUDIO_INVALID_SOURCE",
        "Recording must be armed before Start.",
        "recording.state",
      );
    }
    if (
      !Number.isFinite(input.audioTimeSeconds) ||
      !Number.isFinite(input.timelineStartSeconds)
    ) {
      return fail(
        "AUDIO_INVALID_NUMBER",
        "Recording clock values are invalid.",
        "recording.start",
      );
    }
    const countInBeats = boundedCountIn(input.countInBeats);
    const preRollSeconds = finiteNonNegative(input.preRollSeconds, 0);
    const countInSeconds = countInBeats * 60 / this.options.tempoBpm;
    this.startAudioTime = input.audioTimeSeconds;
    this.targetAudioTime = input.audioTimeSeconds + countInSeconds +
      preRollSeconds;
    this.inputLatencyValue = finiteNonNegative(input.inputLatencyUs, 0);
    this.recordingOffsetValue = Number.isFinite(input.recordingOffsetUs)
      ? input.recordingOffsetUs!
      : 0;
    this.timelineStart = input.timelineStartSeconds -
      this.inputLatencyValue / 1_000_000 +
      this.recordingOffsetValue / 1_000_000;
    const begin: AudioRecordingStorageBegin = {
      tempPath: this.options.identity.tempPath,
      finalPath: this.options.identity.finalPath,
      sampleRateHz: this.options.sampleRateHz,
      channels: this.options.channels,
      bitDepth: 16,
    };
    const opened = await this.options.storage.begin(begin);
    if (!opened.ok) {
      this.stateValue = "CANCELLED";
      return opened;
    }
    this.writer = opened.value;
    this.sampleFramesValue = 0;
    this.pendingWriteChunks = 0;
    this.pendingWriteBytes = 0;
    this.writeQueue = Promise.resolve(audioOk(true));
    this.stateValue = this.targetAudioTime > input.audioTimeSeconds
      ? "COUNT_IN"
      : "RECORDING";
    return audioOk(true);
  }

  tick(audioTimeSeconds: number): void {
    if (
      this.stateValue === "COUNT_IN" && this.targetAudioTime !== null &&
      audioTimeSeconds >= this.targetAudioTime
    ) {
      this.stateValue = "RECORDING";
    }
  }

  async ingest(input: AudioRecordingInputChunk): Promise<Audio200Result<true>> {
    if (this.stateValue !== "COUNT_IN" && this.stateValue !== "RECORDING") {
      return audioOk(true);
    }
    if (
      input.sampleRateHz !== this.options.sampleRateHz ||
      input.channels !== this.options.channels ||
      input.samples.length !== input.channels ||
      input.samples.some((channel) => channel.length === 0) ||
      !Number.isFinite(input.audioTimeSeconds)
    ) {
      return fail(
        "AUDIO_INVALID_NUMBER",
        "Input PCM chunk does not match the armed recorder.",
        "recording.input",
      );
    }
    const frameCount = input.samples[0]!.length;
    if (input.samples.some((channel) => channel.length !== frameCount)) {
      return fail(
        "AUDIO_INVALID_NUMBER",
        "Input PCM channels have different frame counts.",
        "recording.input.samples",
      );
    }
    const chunkStart = input.audioTimeSeconds;
    const chunkEnd = chunkStart + frameCount / input.sampleRateHz;
    const target = this.targetAudioTime ?? chunkStart;
    if (chunkEnd <= target) return audioOk(true);
    const firstFrame = Math.max(
      0,
      Math.ceil((target - chunkStart) * input.sampleRateHz - 1e-7),
    );
    const maxFrames = Math.max(
      1,
      Math.floor(
        boundedDuration(
          this.options.maxDurationSeconds,
          this.options.sampleRateHz,
          this.options.channels,
        ) * this.options.sampleRateHz,
      ),
    );
    const remaining = maxFrames - this.sampleFramesValue;
    if (remaining <= 0) {
      this.stateValue = "STOPPING";
      return fail(
        "AUDIO_INVALID_NUMBER",
        "Recording duration limit was reached.",
        "recording.duration",
        true,
      );
    }
    const count = Math.min(frameCount - firstFrame, remaining);
    if (count <= 0) return audioOk(true);
    const bytes = encodePcm16(
      input.samples,
      firstFrame,
      count,
      this.options.channels,
    );
    if (
      this.pendingWriteChunks >= MAX_PENDING_WRITE_CHUNKS ||
      this.pendingWriteBytes + bytes.byteLength > MAX_PENDING_WRITE_BYTES
    ) {
      this.stateValue = "STOPPING";
      return fail(
        "AUDIO_SOURCE_UNAVAILABLE",
        "Recording storage could not keep up with the input stream.",
        "recording.backpressure",
        true,
      );
    }
    const writer = this.writer;
    if (writer === undefined) {
      this.stateValue = "STOPPING";
      return fail(
        "AUDIO_SOURCE_UNAVAILABLE",
        "Recording storage writer is unavailable.",
        "recording.writer",
        true,
      );
    }
    this.pendingWriteChunks += 1;
    this.pendingWriteBytes += bytes.byteLength;
    this.writeQueue = this.writeQueue.then(async (previous) => {
      try {
        if (!previous.ok) return previous;
        return await writer.writePcm16(bytes);
      } catch {
        return fail(
          "AUDIO_SOURCE_UNAVAILABLE",
          "Recording storage write failed.",
          "recording.writer",
          true,
        );
      } finally {
        this.pendingWriteChunks -= 1;
        this.pendingWriteBytes -= bytes.byteLength;
      }
    });
    this.sampleFramesValue += count;
    if (this.sampleFramesValue >= maxFrames) this.stateValue = "STOPPING";
    return this.writeQueue;
  }

  async stop(): Promise<Audio200Result<AudioRecordedTake>> {
    if (
      this.stateValue !== "COUNT_IN" && this.stateValue !== "RECORDING" &&
      this.stateValue !== "STOPPING"
    ) {
      return fail(
        "AUDIO_EMPTY_RECORDING",
        "There is no active recording to stop.",
        "recording.state",
        true,
      );
    }
    this.stateValue = "STOPPING";
    const writes = await this.writeQueue;
    const writer = this.writer;
    if (writer === undefined) {
      this.stateValue = "CANCELLED";
      return fail(
        "AUDIO_SOURCE_UNAVAILABLE",
        "Recording storage writer is unavailable.",
        "recording.writer",
        true,
      );
    }
    if (!writes.ok) {
      await writer.cancel();
      this.stateValue = "CANCELLED";
      return writes as Audio200Result<AudioRecordedTake>;
    }
    if (this.sampleFramesValue < 1 || this.timelineStart === null) {
      await writer.cancel();
      this.stateValue = "CANCELLED";
      return fail(
        "AUDIO_EMPTY_RECORDING",
        "Recording did not contain any input frames.",
        "recording.sampleFrames",
        true,
      );
    }
    const stored = await writer.finalize(this.sampleFramesValue);
    if (!stored.ok) {
      this.stateValue = "CANCELLED";
      return stored as Audio200Result<AudioRecordedTake>;
    }
    const revision: AudioRevision = {
      schemaVersion: AUDIO200_SCHEMA_VERSION,
      assetId: asAudioAssetId(this.options.identity.assetId),
      revisionId: asAudioRevisionId(this.options.identity.revisionId),
      revisionNumber: this.options.identity.revisionNumber,
      kind: this.options.identity.kind ?? "CLIP",
      referenceMode: "LIVE",
      source: {
        blobId: asSourceBlobId(this.options.identity.blobId),
        locator: {
          placement: "OPFS",
          namespace: "audio",
          relativePath: stored.value.relativePath,
          contentHash: stored.value.contentHash,
          byteLength: stored.value.byteLength,
        },
        metadata: {
          codec: stored.value.codec,
          mimeType: stored.value.mimeType,
          sampleRateHz: stored.value.sampleRateHz,
          channels: stored.value.channels,
          bitDepth: stored.value.bitDepth,
          sampleFrames: stored.value.sampleFrames,
          durationUs: stored.value.durationUs,
          byteLength: stored.value.byteLength,
          contentHash: stored.value.contentHash,
        },
      },
      metadataAuthority: AUDIO200_METADATA_AUTHORITY,
      createdAt: new Date().toISOString(),
      verified: true,
    };
    const take: AudioRecordedTake = {
      revision,
      sourceName: this.options.sourceName.trim(),
      trackId: this.options.trackId,
      timelineStartSeconds: this.timelineStart,
      durationSeconds: this.sampleFramesValue / this.options.sampleRateHz,
      sampleFrames: this.sampleFramesValue,
      inputLatencyUs: this.inputLatencyValue,
      recordingOffsetUs: this.recordingOffsetValue,
    };
    this.stoppedTake = take;
    this.stateValue = "COMMITTED";
    return audioOk(take);
  }

  async cancel(): Promise<Audio200Result<true>> {
    if (this.stateValue === "CANCELLED" || this.stateValue === "IDLE") {
      return audioOk(true);
    }
    if (this.stateValue === "COMMITTED") {
      return fail(
        "AUDIO_INVALID_SOURCE",
        "A committed recording cannot be cancelled.",
        "recording.state",
      );
    }
    await this.writeQueue;
    const cancelled = await this.writer?.cancel();
    this.stateValue = "CANCELLED";
    return cancelled ?? audioOk(true);
  }

  snapshot(): AudioRecordingSnapshot {
    return {
      state: this.stateValue,
      sampleFrames: this.sampleFramesValue,
      durationSeconds: this.sampleFramesValue / this.options.sampleRateHz,
      timelineStartSeconds: this.timelineStart,
      targetAudioTimeSeconds: this.targetAudioTime,
      inputLatencyUs: this.inputLatencyValue,
      recordingOffsetUs: this.recordingOffsetValue,
    };
  }
}

export { MAX_RECORDING_BYTES };
