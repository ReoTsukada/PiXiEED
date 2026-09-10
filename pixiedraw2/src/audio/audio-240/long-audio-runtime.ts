/// <reference lib="dom" />

/**
 * Browser projection for AUDIO-200 long clips.
 *
 * The Project/Clip/Revision is immutable input. This adapter owns only
 * short-lived AudioBufferSourceNode/GainNode instances and the bounded
 * AUDIO-200 PCM chunk reader; it never writes decode details to Project state.
 */

import {
  type AudioAssetByteStore,
  type AudioPcmChunk,
  type AudioPcmChunkReader,
  createAudioPcmChunkReader,
} from "../audio-200/index.ts";
import {
  type Audio200Result,
  type AudioAutomation,
  type AudioClip,
  audioFail,
  audioOk,
  type AudioRevision,
} from "../audio-200/contracts.ts";
import {
  audioTicksPerSecond,
  audioTickToSeconds,
} from "../audio-200/timebase.ts";
import {
  compileAudioAutomation,
  scheduleAudioAutomation,
} from "../audio-300/index.ts";
import { mixerGainToLinear, MixerRuntimeAdapter } from "./mixer-runtime.ts";
import {
  type AudioScheduleEvent,
  type AudioScheduleEventSource,
  type AudioSchedulerTimer,
  SampleAccurateScheduler,
} from "./transport.ts";

interface LongAudioChunkEvent {
  readonly chunkIndex: number;
  readonly chunkOffsetFrames: number;
  readonly frameCount: number;
  readonly sourceStartFrame: number;
}

export interface LongAudioClipRuntimeOptions {
  readonly store: AudioAssetByteStore;
  readonly context: AudioContext;
  readonly mixer: MixerRuntimeAdapter;
  readonly windowRef: Window;
  readonly clip: AudioClip;
  readonly revision: AudioRevision;
  readonly tempoMilliBpm: number;
  readonly ticksPerQuarter: number;
  readonly chunkSeconds?: number;
  readonly readAheadChunks?: number;
  readonly maxCachedChunks?: number;
  readonly shortAudioMaxBytes?: number;
  readonly shortAudioMaxSeconds?: number;
  /** Optional shared timer hub so many Clips do not create one interval each. */
  readonly timer?: AudioSchedulerTimer;
  /** Optional canonical Clip Gain curve; runtime scheduling stays ephemeral. */
  readonly automations?: readonly AudioAutomation[];
}

export interface LongAudioClipRuntimeSnapshot {
  readonly isPlaying: boolean;
  readonly positionSeconds: number;
  readonly timelineStartSeconds: number;
  readonly durationSeconds: number;
  readonly playbackRate: number;
  readonly activeSourceCount: number;
  readonly scheduledSourceCount: number;
  readonly reader: ReturnType<AudioPcmChunkReader["snapshot"]>;
}

interface ActiveSource {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly automationGain?: GainNode;
  readonly key: string;
}

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ticksToSeconds(
  ticks: number,
  tempoMilliBpm: number,
  ticksPerQuarter: number,
): number {
  return audioTickToSeconds(ticks, {
    framesPerSecond: 1,
    tempoMilliBpm: Number.isFinite(tempoMilliBpm) && tempoMilliBpm > 0
      ? tempoMilliBpm
      : 120_000,
    ticksPerQuarter: Number.isFinite(ticksPerQuarter) && ticksPerQuarter > 0
      ? ticksPerQuarter
      : 480,
  });
}

function makeAudioBuffer(
  context: AudioContext,
  chunk: AudioPcmChunk,
): AudioBuffer {
  const buffer = context.createBuffer(
    chunk.channels,
    chunk.frameCount,
    chunk.sampleRateHz,
  );
  for (let channel = 0; channel < chunk.channels; channel += 1) {
    buffer.getChannelData(channel).set(chunk.samples[channel]!);
  }
  return buffer;
}

function scheduleGainEnvelope(
  gain: GainNode,
  startTime: number,
  durationSeconds: number,
  localStartSeconds: number,
  localEndSeconds: number,
  clipDurationSeconds: number,
  clipGain: number,
  fadeInSeconds: number,
  fadeOutSeconds: number,
): void {
  const endTime = startTime + durationSeconds;
  const factorAt = (localSeconds: number): number => {
    const fadeIn = fadeInSeconds > 0
      ? clamp(localSeconds / fadeInSeconds, 0, 1)
      : 1;
    const fadeOutStart = Math.max(0, clipDurationSeconds - fadeOutSeconds);
    const fadeOut = fadeOutSeconds > 0 && localSeconds > fadeOutStart
      ? clamp((clipDurationSeconds - localSeconds) / fadeOutSeconds, 0, 1)
      : 1;
    return Math.min(fadeIn, fadeOut);
  };
  const startFactor = factorAt(localStartSeconds);
  const endFactor = factorAt(localEndSeconds);
  const safeStart = Math.max(0.0001, clipGain * startFactor);
  const safeEnd = Math.max(0.0001, clipGain * endFactor);
  const param = gain.gain;
  param.setValueAtTime(safeStart, startTime);
  if (fadeInSeconds > 0 && localStartSeconds < fadeInSeconds) {
    param.linearRampToValueAtTime(
      clipGain,
      startTime + Math.min(durationSeconds, fadeInSeconds - localStartSeconds),
    );
  }
  const fadeOutStart = Math.max(0, clipDurationSeconds - fadeOutSeconds);
  if (fadeOutSeconds > 0 && localEndSeconds > fadeOutStart) {
    if (localStartSeconds < fadeOutStart) {
      param.setValueAtTime(
        clipGain,
        startTime + Math.max(0, fadeOutStart - localStartSeconds),
      );
    }
    param.linearRampToValueAtTime(safeEnd, endTime);
  }
}

/** Long/short WAV clip playback through the canonical Mixer graph. */
export class LongAudioClipRuntime {
  private readonly readerValue: AudioPcmChunkReader;
  private readonly scheduler: SampleAccurateScheduler<LongAudioChunkEvent>;
  private readonly activeSources = new Set<ActiveSource>();
  private readonly scheduledKeys = new Set<string>();
  private readonly timelineStartSeconds: number;
  private readonly clipDurationSeconds: number;
  private readonly sourceOffsetFrame: number;
  private readonly sourceAvailableFrames: number;
  private readonly fadeInSeconds: number;
  private readonly fadeOutSeconds: number;
  private readonly clipGain: number;
  private readonly playbackRate: number;
  private generation = 0;
  private scheduleDelaySeconds = 0;
  private loopValue: boolean;
  private rangeStopTimer: number | undefined;
  private disposed = false;

  private constructor(
    private readonly options: LongAudioClipRuntimeOptions,
    reader: AudioPcmChunkReader,
  ) {
    this.readerValue = reader;
    const { clip, revision } = options;
    this.timelineStartSeconds = ticksToSeconds(
      clip.timeline.startTick,
      options.tempoMilliBpm,
      options.ticksPerQuarter,
    );
    const requestedDuration = ticksToSeconds(
      clip.timeline.durationTick,
      options.tempoMilliBpm,
      options.ticksPerQuarter,
    );
    this.sourceOffsetFrame = clamp(
      Math.floor(
        finiteNonNegative(clip.sourceOffsetUs) *
          revision.source.metadata.sampleRateHz /
          1_000_000,
      ),
      0,
      Math.max(0, revision.source.metadata.sampleFrames - 1),
    );
    this.sourceAvailableFrames = Math.max(
      1,
      revision.source.metadata.sampleFrames - this.sourceOffsetFrame,
    );
    const sourceDuration = this.sourceAvailableFrames /
      revision.source.metadata.sampleRateHz;
    this.playbackRate = clamp(
      Number.isFinite(clip.playbackRate ?? 1) ? clip.playbackRate ?? 1 : 1,
      0.25,
      4,
    );
    this.clipDurationSeconds = clip.loop
      ? requestedDuration
      : Math.min(requestedDuration, sourceDuration / this.playbackRate);
    this.fadeInSeconds = Math.min(
      this.clipDurationSeconds,
      ticksToSeconds(
        clip.fadeInTick,
        options.tempoMilliBpm,
        options.ticksPerQuarter,
      ),
    );
    this.fadeOutSeconds = Math.min(
      this.clipDurationSeconds,
      ticksToSeconds(
        clip.fadeOutTick,
        options.tempoMilliBpm,
        options.ticksPerQuarter,
      ),
    );
    this.clipGain = mixerGainToLinear(clip.gainMilliDb);
    this.loopValue = clip.loop;
    const events = this.buildEvents();
    this.scheduler = new SampleAccurateScheduler<LongAudioChunkEvent>({
      clock: { now: () => options.context.currentTime },
      timer: options.timer ?? {
        setInterval: (callback, delayMs) =>
          options.windowRef.setInterval(callback, delayMs),
        clearInterval: (handle) => options.windowRef.clearInterval(handle),
      },
      lookaheadSeconds: 0.12,
      intervalMs: 25,
      onSchedule: (event, audioTimeSeconds) => {
        void this.scheduleChunk(event, audioTimeSeconds);
      },
    });
    this.scheduler.load(events, this.clipDurationSeconds);
  }

  static async create(
    options: LongAudioClipRuntimeOptions,
  ): Promise<Audio200Result<LongAudioClipRuntime>> {
    if (options.clip.revisionId !== options.revision.revisionId) {
      return audioFail(
        "AUDIO_REVISION_NOT_FOUND",
        "Clip and Audio Revision bindings do not match.",
        "clip.revisionId",
      );
    }
    if (options.clip.trackId.trim().length === 0) {
      return audioFail(
        "AUDIO_INVALID_CLIP",
        "Clip Track binding is empty.",
        "clip.trackId",
      );
    }
    const reader = await createAudioPcmChunkReader(
      options.store,
      options.revision,
      {
        ...(options.chunkSeconds === undefined
          ? {}
          : { chunkSeconds: options.chunkSeconds }),
        ...(options.readAheadChunks === undefined
          ? {}
          : { readAheadChunks: options.readAheadChunks }),
        ...(options.maxCachedChunks === undefined
          ? {}
          : { maxCachedChunks: options.maxCachedChunks }),
        ...(options.shortAudioMaxBytes === undefined
          ? {}
          : { shortAudioMaxBytes: options.shortAudioMaxBytes }),
        ...(options.shortAudioMaxSeconds === undefined
          ? {}
          : { shortAudioMaxSeconds: options.shortAudioMaxSeconds }),
      },
    );
    if (!reader.ok) return reader as Audio200Result<LongAudioClipRuntime>;
    const runtime = new LongAudioClipRuntime(options, reader.value);
    if (runtime.clipDurationSeconds <= 0) {
      runtime.dispose();
      return audioFail(
        "AUDIO_INVALID_CLIP",
        "Clip timeline duration is empty or outside the source range.",
        "clip.timeline.durationTick",
      );
    }
    return audioOk(runtime);
  }

  get reader(): AudioPcmChunkReader {
    return this.readerValue;
  }

  get isPlaying(): boolean {
    return this.scheduler.isPlaying;
  }

  get loop(): boolean {
    return this.loopValue;
  }

  get positionSeconds(): number {
    return this.timelineStartSeconds + this.scheduler.position;
  }

  get durationSeconds(): number {
    return this.clipDurationSeconds;
  }

  setLoop(enabled: boolean): void {
    this.loopValue = enabled;
    this.scheduler.setLoop(enabled);
  }

  async prepare(
    globalPositionSeconds = this.timelineStartSeconds,
  ): Promise<Audio200Result<true>> {
    if (this.disposed) {
      return audioFail(
        "AUDIO_HOST_BOUNDARY_INVALID",
        "Audio runtime is disposed.",
        "runtime",
      );
    }
    const local = this.localPosition(globalPositionSeconds);
    if (local === null) return audioOk(true);
    const frame = this.sourceFrameForLocal(local);
    await this.readerValue.prefetchAround(
      Math.floor(frame / this.readerValue.plan.chunkFrames),
    );
    return audioOk(true);
  }

  async play(
    globalPositionSeconds = this.timelineStartSeconds,
    loop = this.loopValue,
  ): Promise<Audio200Result<true>> {
    if (this.disposed) {
      return audioFail(
        "AUDIO_HOST_BOUNDARY_INVALID",
        "Audio runtime is disposed.",
        "runtime",
      );
    }
    const contextState = (this.options.context as AudioContext & {
      state?: unknown;
    }).state;
    if (contextState !== undefined && String(contextState) !== "running") {
      return audioFail(
        "AUDIO_HOST_BOUNDARY_INVALID",
        "AudioContext is not running; no silent Clip scheduler was started.",
        "context.state",
        true,
      );
    }
    const local = this.localPosition(globalPositionSeconds);
    if (local === null) {
      return audioFail(
        "AUDIO_INVALID_NUMBER",
        "Playback position is outside the Clip timeline.",
        "positionSeconds",
      );
    }
    this.stopRuntimeResources(false);
    this.loopValue = loop;
    this.scheduler.setLoop(loop);
    this.generation += 1;
    const playGeneration = this.generation;
    const frame = this.sourceFrameForLocal(local);
    await this.readerValue.prefetchAround(
      Math.floor(frame / this.readerValue.plan.chunkFrames),
    );
    if (playGeneration !== this.generation || this.disposed) {
      return audioFail(
        "AUDIO_HOST_BOUNDARY_INVALID",
        "Playback request was superseded before its read-ahead completed.",
        "runtime",
        true,
      );
    }
    this.scheduleDelaySeconds = Math.max(
      0,
      this.timelineStartSeconds - finiteNonNegative(globalPositionSeconds),
    );
    if (!this.scheduler.start(local, loop)) {
      return audioFail(
        "AUDIO_INVALID_CLIP",
        "Clip has no schedulable timeline events.",
        "clip.timeline",
      );
    }
    return audioOk(true);
  }

  /** Play only a bounded range without changing the canonical Clip state. */
  async playForDuration(
    globalPositionSeconds: number,
    durationSeconds: number,
    loop = false,
  ): Promise<Audio200Result<true>> {
    const result = await this.play(globalPositionSeconds, loop);
    if (!result.ok) return result;
    const duration = finiteNonNegative(durationSeconds);
    if (duration === 0) {
      this.stop();
      return result;
    }
    this.rangeStopTimer = this.options.windowRef.setTimeout(() => {
      this.rangeStopTimer = undefined;
      this.stop();
    }, duration * 1000);
    return result;
  }

  pause(): number {
    const position = this.scheduler.pause();
    this.generation += 1;
    this.stopActiveSources();
    this.scheduledKeys.clear();
    return this.timelineStartSeconds + position;
  }

  async seek(globalPositionSeconds: number): Promise<Audio200Result<number>> {
    const wasPlaying = this.scheduler.isPlaying;
    const loop = this.loopValue;
    this.stopRuntimeResources(true);
    const local = this.localPosition(globalPositionSeconds);
    if (local === null) {
      return audioOk(this.timelineStartSeconds + this.clipDurationSeconds);
    }
    this.scheduler.seek(local);
    if (wasPlaying) {
      const started = await this.play(globalPositionSeconds, loop);
      if (!started.ok) return started as Audio200Result<number>;
    }
    return audioOk(this.timelineStartSeconds + local);
  }

  stop(): void {
    this.stopRuntimeResources(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopRuntimeResources(true);
  }

  snapshot(): LongAudioClipRuntimeSnapshot {
    return {
      isPlaying: this.scheduler.isPlaying,
      positionSeconds: this.positionSeconds,
      timelineStartSeconds: this.timelineStartSeconds,
      durationSeconds: this.clipDurationSeconds,
      playbackRate: this.playbackRate,
      activeSourceCount: this.activeSources.size,
      scheduledSourceCount: this.scheduledKeys.size,
      reader: this.readerValue.snapshot(),
    };
  }

  private buildEvents(): AudioScheduleEventSource<LongAudioChunkEvent> {
    const sampleRate = this.readerValue.plan.sampleRateHz;
    const chunkFrames = this.readerValue.plan.chunkFrames;
    const totalOutputFrames = Math.max(
      1,
      Math.ceil(this.clipDurationSeconds * sampleRate),
    );
    // One source segment is one reader chunk (the first segment can begin in
    // the middle of a chunk). Keep only the arithmetic needed to address a
    // segment; never allocate one event object per chunk of a long clip.
    const firstChunkOffset = this.sourceOffsetFrame % chunkFrames;
    const firstSegmentFrames = Math.min(
      chunkFrames - firstChunkOffset,
      this.sourceAvailableFrames,
    );
    const segmentCount = firstSegmentFrames >= this.sourceAvailableFrames
      ? 1
      : 1 + Math.ceil(
        (this.sourceAvailableFrames - firstSegmentFrames) / chunkFrames,
      );
    const sourceRelativeAt = (segment: number): number => segment === 0
      ? 0
      : firstSegmentFrames + (segment - 1) * chunkFrames;
    const segmentFramesAt = (segment: number): number => Math.min(
      segment === 0 ? firstSegmentFrames : chunkFrames,
      this.sourceAvailableFrames - sourceRelativeAt(segment),
    );
    const outputFramesFor = (sourceFrames: number): number => Math.max(
      1,
      Math.ceil(sourceFrames / this.playbackRate),
    );
    const firstOutputFrames = outputFramesFor(firstSegmentFrames);
    const fullOutputFrames = outputFramesFor(chunkFrames);
    const lastOutputFrames = outputFramesFor(segmentFramesAt(segmentCount - 1));
    const cycleOutputFrames = segmentCount === 1
      ? firstOutputFrames
      : firstOutputFrames +
        Math.max(0, segmentCount - 2) * fullOutputFrames +
        lastOutputFrames;
    const segmentsForOutputFrames = (outputFrames: number): number => {
      if (outputFrames <= firstOutputFrames) return 1;
      return Math.min(
        segmentCount,
        1 + Math.ceil((outputFrames - firstOutputFrames) / fullOutputFrames),
      );
    };
    const eventCount = this.loopValue
      ? Math.floor(totalOutputFrames / cycleOutputFrames) * segmentCount +
        (totalOutputFrames % cycleOutputFrames === 0
          ? 0
          : segmentsForOutputFrames(totalOutputFrames % cycleOutputFrames))
      : segmentsForOutputFrames(totalOutputFrames);
    if (!Number.isSafeInteger(eventCount) || eventCount < 1) {
      throw new RangeError("Long audio event sequence exceeds the safe timeline range.");
    }
    const outputFrameAt = (segment: number): number => segment === 0
      ? 0
      : firstOutputFrames + (segment - 1) * fullOutputFrames;
    const eventAt = (
      index: number,
    ): AudioScheduleEvent<LongAudioChunkEvent> | undefined => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= eventCount) {
        return undefined;
      }
      const cycle = this.loopValue ? Math.floor(index / segmentCount) : 0;
      const segment = this.loopValue ? index % segmentCount : index;
      const outputFrame = (this.loopValue ? cycle * cycleOutputFrames : 0) +
        outputFrameAt(segment);
      const sourceRelative = sourceRelativeAt(segment);
      const sourceFrame = this.sourceOffsetFrame + sourceRelative;
      const frameCount = Math.max(
        1,
        Math.min(
          segmentFramesAt(segment),
          Math.ceil((totalOutputFrames - outputFrame) * this.playbackRate),
          this.sourceAvailableFrames - sourceRelative,
        ),
      );
      return {
        id: `clip:${String(this.options.clip.clipId)}:${index}`,
        startSeconds: outputFrame / sampleRate,
        durationSeconds: frameCount / sampleRate / this.playbackRate,
        payload: {
          chunkIndex: Math.floor(sourceFrame / chunkFrames),
          chunkOffsetFrames: sourceFrame % chunkFrames,
          frameCount,
          sourceStartFrame: sourceFrame,
        },
      };
    };
    return {
      length: eventCount,
      at: eventAt,
      findFirstIndex: (startSeconds) => {
        let low = 0;
        let high = eventCount;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          const event = eventAt(middle);
          if (event === undefined || event.startSeconds >= startSeconds) {
            high = middle;
          } else {
            low = middle + 1;
          }
        }
        return low < eventCount ? low : -1;
      },
    };
  }

  private localPosition(globalPositionSeconds: number): number | null {
    const global = finiteNonNegative(globalPositionSeconds);
    if (global < this.timelineStartSeconds) return 0;
    const local = global - this.timelineStartSeconds;
    if (local > this.clipDurationSeconds + 1e-7) return null;
    return clamp(local, 0, this.clipDurationSeconds);
  }

  private sourceFrameForLocal(localSeconds: number): number {
    const frame = Math.floor(
      localSeconds * this.readerValue.plan.sampleRateHz * this.playbackRate,
    );
    const relative = this.options.clip.loop
      ? frame % this.sourceAvailableFrames
      : frame;
    return this.sourceOffsetFrame + relative;
  }

  private async scheduleChunk(
    event: AudioScheduleEvent<LongAudioChunkEvent>,
    audioTimeSeconds: number,
  ): Promise<void> {
    const key = `${this.generation}:${event.id}:${audioTimeSeconds.toFixed(6)}`;
    const contextState = (this.options.context as AudioContext & {
      state?: unknown;
    }).state;
    if (
      this.scheduledKeys.has(key) || this.disposed ||
      (contextState !== undefined && String(contextState) !== "running")
    ) return;
    this.scheduledKeys.add(key);
    const generation = this.generation;
    const chunkResult = await this.readerValue.readChunk(
      event.payload.chunkIndex,
    );
    if (
      !chunkResult.ok || chunkResult.value === null ||
      generation !== this.generation || this.disposed
    ) {
      this.scheduledKeys.delete(key);
      return;
    }
    const chunk = chunkResult.value;
    // Keep the next bounded window warm while the current chunk is being
    // projected. `readChunk`/inFlight deduplication prevents duplicate reads;
    // `clear()` on seek/stop invalidates any stale read-ahead result.
    void this.readerValue.prefetchAround(event.payload.chunkIndex + 1);
    const context = this.options.context;
    const offsetFrames = clamp(
      event.payload.chunkOffsetFrames,
      0,
      Math.max(0, chunk.frameCount - 1),
    );
    const actualFrames = Math.min(
      event.payload.frameCount,
      Math.max(1, chunk.frameCount - offsetFrames),
    );
    const sourceDurationSeconds = actualFrames / chunk.sampleRateHz;
    const durationSeconds = sourceDurationSeconds / this.playbackRate;
    const start = Math.max(
      context.currentTime + 0.005,
      audioTimeSeconds + this.scheduleDelaySeconds,
    );
    const gain = context.createGain();
    const clipAutomation = (this.options.automations ?? [])
      .find((automation) =>
        automation.target.kind === "CLIP_GAIN" &&
        automation.target.targetId === String(this.options.clip.clipId)
      );
    const compiledAutomation = clipAutomation === undefined
      ? undefined
      : compileAudioAutomation(clipAutomation);
    const automationGain = compiledAutomation?.ok === true
      ? context.createGain()
      : undefined;
    if (automationGain !== undefined) automationGain.gain.value = 1;
    const buffer = makeAudioBuffer(context, chunk);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;
    const localStart = event.startSeconds;
    const localEnd = Math.min(
      this.clipDurationSeconds,
      localStart + durationSeconds,
    );
    scheduleGainEnvelope(
      gain,
      start,
      durationSeconds,
      localStart,
      localEnd,
      this.clipDurationSeconds,
      this.clipGain,
      this.fadeInSeconds,
      this.fadeOutSeconds,
    );
    if (automationGain !== undefined && compiledAutomation?.ok === true) {
      const ticksPerSecond = audioTicksPerSecond({
        framesPerSecond: 1,
        tempoMilliBpm: this.options.tempoMilliBpm,
        ticksPerQuarter: this.options.ticksPerQuarter,
      });
      const fromTick = this.options.clip.timeline.startTick +
        Math.round(localStart * ticksPerSecond);
      const untilTick = this.options.clip.timeline.startTick +
        Math.round(localEnd * ticksPerSecond);
      scheduleAudioAutomation(
        automationGain.gain,
        compiledAutomation.value,
        {
          nowSeconds: context.currentTime,
          startAtSeconds: start,
          tempoMilliBpm: this.options.tempoMilliBpm,
          ticksPerQuarter: this.options.ticksPerQuarter,
          fromTick,
          untilTick,
        },
        generation,
      );
    }
    source.connect(gain);
    const trackInput = this.options.mixer.getTrackInput(
      String(this.options.clip.trackId),
    );
    if (automationGain !== undefined) {
      gain.connect(automationGain);
      automationGain.connect(trackInput);
    } else {
      gain.connect(trackInput);
    }
    const active: ActiveSource = automationGain === undefined
      ? { source, gain, key }
      : { source, gain, automationGain, key };
    this.activeSources.add(active);
    source.addEventListener("ended", () => {
      this.activeSources.delete(active);
      this.scheduledKeys.delete(key);
      try {
        source.disconnect();
        gain.disconnect();
        automationGain?.disconnect();
      } catch {
        // Browser teardown is idempotent.
      }
    }, { once: true });
    try {
      source.start(
        start,
        offsetFrames / chunk.sampleRateHz,
        sourceDurationSeconds,
      );
      source.stop(start + durationSeconds + 0.01);
    } catch {
      this.activeSources.delete(active);
      this.scheduledKeys.delete(key);
      try {
        source.disconnect();
        gain.disconnect();
        automationGain?.disconnect();
      } catch {
        // Ignore a closed context.
      }
    }
  }

  private stopRuntimeResources(clearReader: boolean): void {
    if (this.rangeStopTimer !== undefined) {
      this.options.windowRef.clearTimeout(this.rangeStopTimer);
      this.rangeStopTimer = undefined;
    }
    this.scheduler.stop();
    this.generation += 1;
    this.scheduledKeys.clear();
    this.stopActiveSources();
    if (clearReader) this.readerValue.clear();
    this.scheduleDelaySeconds = 0;
  }

  private stopActiveSources(): void {
    for (const active of this.activeSources) {
      try {
        active.source.stop();
      } catch {
        // It may have ended between scheduling and teardown.
      }
      try {
        active.source.disconnect();
        active.gain.disconnect();
        active.automationGain?.disconnect();
      } catch {
        // Browser teardown is idempotent.
      }
    }
    this.activeSources.clear();
  }
}
