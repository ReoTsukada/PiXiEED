/**
 * Phase 2-D host-neutral Offline Render.
 *
 * The renderer reads the canonical AUDIO-200 Project and immutable Asset
 * byte-store only.  It never dispatches a command, changes the Project, or
 * creates Web Audio nodes.  Source PCM is obtained through the bounded
 * AUDIO-200 chunk reader and output is emitted block-by-block to a sink.
 */

import {
  type AudioAssetByteStore,
  type AudioPcmChunkReader,
  createAudioPcmChunkReader,
} from "../audio-200/index.ts";
import {
  asAudioContentHash,
  type Audio200Result,
  type AudioClip,
  type AudioContentHash,
  audioFail,
  type AudioNote,
  audioOk,
  type AudioProject,
  type AudioRevision,
  type AudioSynthPreset,
  type AudioTrack,
} from "../audio-200/contracts.ts";
import {
  audioClockForProject,
  audioTickToSeconds,
} from "../audio-200/timebase.ts";
import {
  type AudioAutomationCurve,
  automationCurveForTarget,
  automationValueAtSeconds,
  compileProjectAutomations,
} from "../audio-300/index.ts";
import {
  type AudioRoutingGraph,
  audioSendAmountToLinear,
  buildProjectAudioRoutingGraph,
  effectiveAudioTrackAudibility,
} from "../audio-310/index.ts";
import {
  applyOfflineEffectChain,
  createOfflineEffectChainState,
} from "../audio-320/index.ts";
import { applyOfflineMasterProcessing } from "../audio-330/index.ts";
import { sha256Hex } from "../../wp160-contracts.ts";
import {
  type ChipSynthPresetId,
  type ChipSynthVoiceOverride,
  type ChipSynthVoiceProfile,
  getChipSynthVoice,
} from "../audio-240/chiptune.ts";

export type AudioRenderBitDepth = 8 | 16 | 24 | 32;
export type AudioRenderChannels = 1 | 2;
export type AudioRenderTarget =
  | "MASTER"
  | { readonly kind: "STEM"; readonly trackId: string };

export interface AudioRenderProgress {
  readonly completedFrames: number;
  readonly totalFrames: number;
  readonly ratio: number;
  readonly target: AudioRenderTarget;
}

/** A small host-neutral cancellation boundary; no DOM AbortSignal is needed. */
export interface AudioRenderCancellation {
  readonly aborted: boolean;
}

export interface AudioRenderWavInfo {
  readonly sampleRateHz: number;
  readonly channels: AudioRenderChannels;
  readonly bitDepth: AudioRenderBitDepth;
  readonly frameCount: number;
  readonly target: AudioRenderTarget;
}

/**
 * Render sinks receive the WAV header and PCM blocks separately.  A browser
 * can replace the memory sink with an OPFS/download sink without touching the
 * canonical renderer or Project state.
 */
export interface AudioRenderSink {
  begin(info: AudioRenderWavInfo): Promise<Audio200Result<true>>;
  writePcm(bytes: Uint8Array): Promise<Audio200Result<true>>;
  finalize(): Promise<Audio200Result<Uint8Array | null>>;
  cancel(): Promise<Audio200Result<true>>;
}

export interface AudioOfflineRenderOptions {
  readonly project: AudioProject;
  readonly store: AudioAssetByteStore;
  readonly target?: AudioRenderTarget;
  readonly sampleRateHz?: number;
  readonly channels?: AudioRenderChannels;
  readonly bitDepth?: AudioRenderBitDepth;
  readonly blockFrames?: number;
  readonly startSeconds?: number;
  readonly durationSeconds?: number;
  readonly maxOutputBytes?: number;
  /** Normal exports include Mixer; Freeze renders pre-mixer Track PCM. */
  readonly includeTrackMixer?: boolean;
  readonly includeMasterMixer?: boolean;
  readonly respectMuteSolo?: boolean;
  readonly cancellation?: AudioRenderCancellation;
  readonly onProgress?: (progress: AudioRenderProgress) => void | Promise<void>;
  readonly sink?: AudioRenderSink;
}

export interface AudioOfflineRenderArtifact {
  readonly bytes: Uint8Array | null;
  readonly contentHash: AudioContentHash | null;
  readonly sampleRateHz: number;
  readonly channels: AudioRenderChannels;
  readonly bitDepth: AudioRenderBitDepth;
  readonly frameCount: number;
  readonly durationSeconds: number;
  readonly startSeconds: number;
  readonly target: AudioRenderTarget;
  readonly projectRevision: number;
  readonly projectStateHash: AudioContentHash;
}

const WAV_HEADER_BYTES = 44;
const DEFAULT_SAMPLE_RATE_HZ = 48_000;
const DEFAULT_BLOCK_FRAMES = 2_048;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const MIN_SAMPLE_RATE_HZ = 8_000;
const MAX_SAMPLE_RATE_HZ = 192_000;
const MIN_BLOCK_FRAMES = 128;
const MAX_BLOCK_FRAMES = 16_384;
const MAX_WAV_BYTES = 0xffff_ffff + 8;

function fail<T>(
  code:
    | "AUDIO_RENDER_INVALID"
    | "AUDIO_RENDER_CANCELLED"
    | "AUDIO_RENDER_OUTPUT_LIMIT"
    | "AUDIO_SOURCE_UNAVAILABLE"
    | "AUDIO_INVALID_SOURCE",
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

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const candidate = value !== undefined && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
  return Math.min(maximum, Math.max(minimum, candidate));
}

function ticksToSeconds(
  ticks: number,
  project: AudioProject,
): number {
  return audioTickToSeconds(ticks, audioClockForProject(project, 1));
}

function dbToLinear(milliDb: number): number {
  const bounded = Math.min(24_000, Math.max(-120_000, milliDb));
  return 10 ** (bounded / 20_000);
}

function dbValueToLinear(decibels: number): number {
  return 10 ** (Math.min(24, Math.max(-120, decibels)) / 20);
}

function panGains(panMilli: number): readonly [number, number] {
  const pan = Math.min(1, Math.max(-1, panMilli / 1_000));
  const angle = (pan + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function panValueGains(pan: number): readonly [number, number] {
  const bounded = Math.min(1, Math.max(-1, pan));
  const angle = (bounded + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function clipSeconds(
  clip: AudioClip,
  project: AudioProject,
): { readonly start: number; readonly duration: number } {
  return {
    start: ticksToSeconds(clip.timeline.startTick, project),
    duration: ticksToSeconds(clip.timeline.durationTick, project),
  };
}

function noteSeconds(
  note: AudioNote,
  project: AudioProject,
): { readonly start: number; readonly duration: number } {
  return {
    start: ticksToSeconds(note.timeline.startTick, project),
    duration: ticksToSeconds(note.timeline.durationTick, project),
  };
}

function projectDurationSeconds(project: AudioProject): number {
  let duration = 0;
  for (const clip of project.clips) {
    const range = clipSeconds(clip, project);
    duration = Math.max(duration, range.start + range.duration);
  }
  for (const note of project.notes) {
    const range = noteSeconds(note, project);
    duration = Math.max(duration, range.start + range.duration);
  }
  return duration;
}

function writeText(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function bytesPerSample(bitDepth: AudioRenderBitDepth): number {
  return bitDepth / 8;
}

function wavHeader(info: AudioRenderWavInfo): Uint8Array {
  const dataBytes = info.frameCount * info.channels *
    bytesPerSample(info.bitDepth);
  const bytes = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(bytes.buffer);
  writeText(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(bytes, 8, "WAVE");
  writeText(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, info.channels, true);
  view.setUint32(24, info.sampleRateHz, true);
  view.setUint32(
    28,
    info.sampleRateHz * info.channels * bytesPerSample(info.bitDepth),
    true,
  );
  view.setUint16(32, info.channels * bytesPerSample(info.bitDepth), true);
  view.setUint16(34, info.bitDepth, true);
  writeText(bytes, 36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

function encodePcmBlock(
  left: Float32Array,
  right: Float32Array,
  channels: AudioRenderChannels,
  bitDepth: AudioRenderBitDepth,
): Uint8Array {
  const frameCount = left.length;
  const frameBytes = channels * bytesPerSample(bitDepth);
  const bytes = new Uint8Array(frameCount * frameBytes);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const writeSample = (value: number): void => {
    const bounded = Number.isFinite(value)
      ? Math.max(-1, Math.min(1, value))
      : 0;
    if (bitDepth === 8) {
      view.setUint8(
        offset,
        Math.max(0, Math.min(255, Math.round(bounded * 127.5 + 128))),
      );
      offset += 1;
      return;
    }
    if (bitDepth === 16) {
      view.setInt16(
        offset,
        bounded <= -1 ? -32_768 : Math.round(bounded * 32_767),
        true,
      );
      offset += 2;
      return;
    }
    if (bitDepth === 24) {
      let integer = bounded <= -1
        ? -8_388_608
        : Math.round(bounded * 8_388_607);
      if (integer < 0) integer += 0x1_000_000;
      view.setUint8(offset, integer & 0xff);
      view.setUint8(offset + 1, (integer >>> 8) & 0xff);
      view.setUint8(offset + 2, (integer >>> 16) & 0xff);
      offset += 3;
      return;
    }
    view.setInt32(
      offset,
      bounded <= -1 ? -2_147_483_648 : Math.round(bounded * 2_147_483_647),
      true,
    );
    offset += 4;
  };
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (channels === 1) {
      writeSample((left[frame]! + right[frame]!) * 0.5);
    } else {
      writeSample(left[frame]!);
      writeSample(right[frame]!);
    }
  }
  return bytes;
}

function normalizeTarget(
  project: AudioProject,
  target: AudioRenderTarget | undefined,
): Audio200Result<AudioRenderTarget> {
  if (target === undefined || target === "MASTER") return audioOk("MASTER");
  if (
    target.kind !== "STEM" || typeof target.trackId !== "string" ||
    target.trackId.trim().length === 0 ||
    !project.tracks.some((track) => String(track.trackId) === target.trackId)
  ) {
    return fail(
      "AUDIO_RENDER_INVALID",
      "Stem target must resolve to a canonical Project Track.",
      "target.trackId",
    );
  }
  return audioOk({ kind: "STEM", trackId: target.trackId });
}

function normalizedRange(
  project: AudioProject,
  options: AudioOfflineRenderOptions,
): Audio200Result<
  { readonly startSeconds: number; readonly durationSeconds: number }
> {
  const startSeconds = finiteNonNegative(options.startSeconds, 0);
  const projectDuration = projectDurationSeconds(project);
  const durationSeconds = options.durationSeconds === undefined
    ? Math.max(0, projectDuration - startSeconds)
    : options.durationSeconds;
  if (
    !Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
    !Number.isFinite(startSeconds) || startSeconds < 0
  ) {
    return fail(
      "AUDIO_RENDER_INVALID",
      "Render range must contain a positive duration and non-negative start.",
      "range",
    );
  }
  return audioOk({ startSeconds, durationSeconds });
}

function effectiveTrackState(
  project: AudioProject,
  respectMuteSolo = true,
): ReadonlyMap<
  string,
  {
    readonly track: AudioTrack;
    readonly gain: number;
    readonly pan: readonly [number, number];
    readonly audible: boolean;
  }
> {
  const channels = new Map(
    project.mixer.channels.map((channel) => [String(channel.trackId), channel]),
  );
  const anySolo = project.tracks.some((track) => track.solo) ||
    project.mixer.channels.some((channel) => channel.solo);
  return new Map(project.tracks.map((track) => {
    const channel = channels.get(String(track.trackId));
    const trackSolo = track.solo || channel?.solo === true;
    return [String(track.trackId), {
      track,
      gain: dbToLinear(channel?.gainMilliDb ?? 0),
      pan: panGains(channel?.panMilli ?? 0),
      audible: !respectMuteSolo ||
        (!track.muted && channel?.muted !== true &&
          (!anySolo || trackSolo)),
    }];
  }));
}

class RevisionChunkAccessor {
  private constructor(
    readonly revision: AudioRevision,
    readonly reader: AudioPcmChunkReader,
  ) {}

  static async create(
    store: AudioAssetByteStore,
    revision: AudioRevision,
  ): Promise<Audio200Result<RevisionChunkAccessor>> {
    const created = await createAudioPcmChunkReader(store, revision, {
      chunkSeconds: 1,
      readAheadChunks: 0,
      maxCachedChunks: 4,
    });
    if (!created.ok) return created as Audio200Result<RevisionChunkAccessor>;
    return audioOk(new RevisionChunkAccessor(revision, created.value));
  }

  async readRange(
    startFrame: number,
    frameCount: number,
  ): Promise<Audio200Result<readonly Float32Array[]>> {
    const boundedStart = Math.max(
      0,
      Math.min(
        this.revision.source.metadata.sampleFrames,
        Math.floor(startFrame),
      ),
    );
    const boundedCount = Math.max(
      0,
      Math.min(
        frameCount,
        this.revision.source.metadata.sampleFrames - boundedStart,
      ),
    );
    const samples = Array.from(
      { length: this.reader.plan.channels },
      () => new Float32Array(boundedCount),
    );
    let cursor = 0;
    while (cursor < boundedCount) {
      const chunkIndex = Math.floor(
        (boundedStart + cursor) / this.reader.plan.chunkFrames,
      );
      const chunkResult = await this.reader.readChunk(chunkIndex);
      if (!chunkResult.ok) {
        return chunkResult as Audio200Result<readonly Float32Array[]>;
      }
      const chunk = chunkResult.value;
      if (chunk === null) {
        return fail(
          "AUDIO_SOURCE_UNAVAILABLE",
          "A source chunk was unavailable during Offline Render.",
          "revision.source",
          true,
        );
      }
      const sourceStart = Math.max(
        boundedStart + cursor,
        chunk.startFrame,
      );
      const sourceEnd = Math.min(
        boundedStart + boundedCount,
        chunk.startFrame + chunk.frameCount,
      );
      if (sourceEnd <= sourceStart) {
        cursor += Math.max(1, chunk.frameCount);
        continue;
      }
      const copyCount = sourceEnd - sourceStart;
      const destination = sourceStart - boundedStart;
      for (let channel = 0; channel < samples.length; channel += 1) {
        samples[channel]!.set(
          chunk.samples[channel]!.subarray(
            sourceStart - chunk.startFrame,
            sourceStart - chunk.startFrame + copyCount,
          ),
          destination,
        );
      }
      cursor = sourceEnd - boundedStart;
    }
    return audioOk(samples);
  }
}

function fadeFactor(
  localSeconds: number,
  clipDurationSeconds: number,
  fadeInSeconds: number,
  fadeOutSeconds: number,
): number {
  const fadeIn = fadeInSeconds > 0
    ? Math.min(1, Math.max(0, localSeconds / fadeInSeconds))
    : 1;
  const fadeOutStart = Math.max(0, clipDurationSeconds - fadeOutSeconds);
  const fadeOut = fadeOutSeconds > 0 && localSeconds > fadeOutStart
    ? Math.min(
      1,
      Math.max(0, (clipDurationSeconds - localSeconds) / fadeOutSeconds),
    )
    : 1;
  return Math.min(fadeIn, fadeOut);
}

function renderVoiceIdForTrack(track: AudioTrack): string | undefined {
  const source = `${String(track.trackId)} ${track.name}`.toUpperCase().replace(
    /[^A-Z0-9]+/gu,
    "_",
  );
  const aliases: readonly [string, string][] = [
    ["ELECTRIC_GUITAR", "ELECTRIC_GUITAR"],
    ["PIANO_2", "PIANO_2"],
    ["TUBULAR_BELLS", "TUBULAR_BELLS"],
    ["SYNTH_LEAD", "SYNTH_LEAD"],
    ["SYNTH_PAD", "SYNTH_PAD"],
    ["TAMBOURINE", "TAMBOURINE"],
    ["VIBRAPHONE", "VIBRAPHONE"],
    ["XYLOPHONE", "XYLOPHONE"],
    ["CLARINET", "CLARINET"],
    ["SAXOPHONE", "SAXOPHONE"],
    ["STEEL_DRUM", "STEEL_DRUM"],
    ["MARIMBA", "MARIMBA"],
    ["KALIMBA", "KALIMBA"],
    ["CELESTA", "CELESTA"],
    ["TRUMPET", "TRUMPET"],
    ["BRASS", "BRASS"],
    ["CLAVINET", "CLAVINET"],
    ["ORGAN", "ORGAN"],
    ["VIOLIN", "VIOLIN"],
    ["CELLO", "CELLO"],
    ["STRINGS", "STRINGS"],
    ["GUITAR", "GUITAR"],
    ["HARP", "HARP"],
    ["BASS", "BASS"],
    ["FLUTE", "FLUTE"],
    ["SHAKER", "SHAKER"],
    ["DRUMS", "DRUMS"],
    ["PIANO", "PIANO"],
    ["CHIP", "CHIP"],
  ];
  return aliases.find(([, token]) => source.includes(token))?.[0];
}

function renderDrumPreset(
  track: AudioTrack,
  pitchMidi: number,
  project: AudioProject,
): ChipSynthPresetId {
  if (renderVoiceIdForTrack(track) !== "DRUMS") return "pulse-25";
  const pitch = Math.trunc(pitchMidi);
  if (project.drumKitId === "ARCADE") {
    if (pitch === 38) return "noise";
    if (pitch === 45) return "sawtooth";
    return "pulse-25";
  }
  if (project.drumKitId === "SOFT") {
    if (pitch === 38) return "sawtooth";
    return "triangle";
  }
  if (pitch === 36) return "triangle";
  if (pitch === 38) return "noise";
  if (pitch === 45) return "sawtooth";
  return "pulse-25";
}

function synthPresetOverrides(
  presets: readonly AudioSynthPreset[] | undefined,
): ReadonlyMap<string, ChipSynthVoiceOverride> {
  return new Map(
    (presets ?? []).map((preset) =>
      [
        preset.instrumentId.trim().toUpperCase().replace(/^INSTRUMENT:/u, ""),
        {
          waveform: preset.waveform,
          dutyCycle: preset.dutyCycle,
          attackMs: preset.attackMs,
          decayMs: preset.decayMs,
          sustain: preset.sustain,
          releaseMs: preset.releaseMs,
          filter: {
            type: preset.filterType,
            frequencyHz: preset.filterFrequencyHz,
            q: preset.filterQ,
          },
          noiseColor: preset.noiseColor,
          transientLevel: preset.transientLevel,
          transientMs: preset.transientMs,
          pitchStartRatio: preset.pitchStartRatio,
          pitchSweepMs: preset.pitchSweepMs,
          vibratoDepthCents: preset.vibratoDepthCents,
          vibratoRateHz: preset.vibratoRateHz,
        } satisfies ChipSynthVoiceOverride,
      ] as const
    ),
  );
}

function deterministicNoise(seed: number): number {
  const value = Math.sin((seed + 1) * 12.9898) * 43_758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function voiceWaveSample(
  waveform: ChipSynthVoiceProfile["waveform"],
  phase: number,
  seed: number,
  dutyCycle: number,
): number {
  if (waveform === "noise") return deterministicNoise(seed);
  if (waveform === "pulse") {
    const cycle = (phase / (2 * Math.PI) -
      Math.floor(phase / (2 * Math.PI))) % 1;
    return cycle < dutyCycle ? 1 : -1;
  }
  if (waveform === "triangle") {
    return 1 -
      4 * Math.abs(Math.round(phase / (2 * Math.PI)) - phase / (2 * Math.PI));
  }
  if (waveform === "sawtooth") {
    return 2 *
      (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
  }
  return Math.sin(phase);
}

/** Test-friendly deterministic memory sink; production may provide an OPFS sink. */
export function createMemoryAudioRenderSink(
  maxBytes = DEFAULT_MAX_OUTPUT_BYTES,
): AudioRenderSink {
  let chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let started = false;
  let closed = false;
  return {
    async begin(info) {
      const total = WAV_HEADER_BYTES + info.frameCount * info.channels *
          bytesPerSample(info.bitDepth);
      if (
        !Number.isSafeInteger(total) || total > maxBytes ||
        total > MAX_WAV_BYTES
      ) {
        return fail(
          "AUDIO_RENDER_OUTPUT_LIMIT",
          "Offline Render output exceeds the bounded WAV output limit.",
          "render.outputBytes",
        );
      }
      chunks = [wavHeader(info)];
      totalBytes = WAV_HEADER_BYTES;
      started = true;
      closed = false;
      return audioOk(true);
    },
    async writePcm(bytes) {
      if (!started || closed || bytes.byteLength < 1) {
        return fail(
          "AUDIO_RENDER_INVALID",
          "Render sink is not accepting PCM blocks.",
          "render.sink",
        );
      }
      if (totalBytes + bytes.byteLength > maxBytes) {
        return fail(
          "AUDIO_RENDER_OUTPUT_LIMIT",
          "Offline Render output exceeds the bounded sink limit.",
          "render.outputBytes",
        );
      }
      chunks.push(new Uint8Array(bytes));
      totalBytes += bytes.byteLength;
      return audioOk(true);
    },
    async finalize() {
      if (!started || closed) {
        return fail(
          "AUDIO_RENDER_INVALID",
          "Render sink cannot be finalized twice.",
          "render.sink",
        );
      }
      closed = true;
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      chunks = [];
      return audioOk(bytes);
    },
    async cancel() {
      chunks = [];
      totalBytes = 0;
      started = false;
      closed = true;
      return audioOk(true);
    },
  };
}

function noteWaveSample(
  note: AudioNote,
  track: AudioTrack,
  project: AudioProject,
  timeSeconds: number,
  sampleIndex: number,
  voiceOverrides: ReadonlyMap<string, ChipSynthVoiceOverride>,
): number {
  const range = noteSeconds(note, project);
  const local = timeSeconds - range.start;
  if (local < 0 || local >= range.duration) return 0;
  const voice = getChipSynthVoice(
    renderVoiceIdForTrack(track),
    note.pitchMidi,
    renderDrumPreset(track, note.pitchMidi, project),
    voiceOverrides,
  );
  const attack = Math.min(
    range.duration * 0.2,
    voice.attackMs / 1_000,
  );
  const release = Math.min(
    range.duration * 0.35,
    voice.releaseMs / 1_000,
  );
  const decay = Math.min(
    range.duration * 0.45,
    voice.decayMs / 1_000,
  );
  const decayEnd = Math.min(
    range.duration - release,
    attack + decay,
  );
  const sustain = Math.max(0.02, Math.min(1, voice.sustain));
  const envelope = local < attack
    ? local / Math.max(0.0001, attack)
    : local < decayEnd
    ? 1 - (1 - sustain) *
        ((local - attack) / Math.max(0.0001, decayEnd - attack))
    : local > range.duration - release
    ? sustain *
      ((range.duration - local) / Math.max(0.0001, release))
    : sustain;
  const baseFrequency = 440 * 2 ** ((note.pitchMidi - 69) / 12);
  const sweepProgress = voice.pitchSweepMs > 0
    ? Math.min(1, local / (voice.pitchSweepMs / 1_000))
    : 1;
  const sweepRatio = voice.pitchStartRatio > 1
    ? voice.pitchStartRatio ** (1 - sweepProgress)
    : 1;
  const vibrato = voice.vibratoDepthCents > 0
    ? 2 ** (
      Math.sin(2 * Math.PI * voice.vibratoRateHz * local) *
      voice.vibratoDepthCents / 1_200
    )
    : 1;
  const frequency = baseFrequency * sweepRatio * vibrato;
  const phase = 2 * Math.PI * frequency * local;
  let sample = voiceWaveSample(
    voice.waveform,
    phase,
    sampleIndex + note.pitchMidi,
    voice.dutyCycle,
  );
  for (const partial of voice.secondary) {
    const partialFrequency = frequency * partial.ratio *
      2 ** (partial.detuneCents / 1_200);
    sample += partial.gain * voiceWaveSample(
      partial.waveform,
      2 * Math.PI * partialFrequency * local,
      sampleIndex + note.pitchMidi + Math.round(partial.ratio * 17),
      partial.dutyCycle,
    );
  }
  const transientDuration = Math.min(
    range.duration,
    Math.max(0.004, voice.transientMs / 1_000),
  );
  if (voice.transientLevel > 0 && local < transientDuration) {
    const transientEnvelope = 1 - local / transientDuration;
    sample += deterministicNoise(sampleIndex + note.pitchMidi * 3) *
      voice.transientLevel * transientEnvelope;
  }
  if (voice.filter?.type === "bandpass" && voice.waveform === "noise") {
    sample = sample * 0.72 + Math.sin(phase) * 0.18;
  } else if (voice.filter?.type === "highpass" && voice.waveform === "noise") {
    sample *= 0.84;
  } else if (voice.filter?.type === "lowpass" && voice.waveform === "noise") {
    sample *= 0.68;
  }
  return Math.max(-1, Math.min(1, sample)) * envelope *
    (note.velocityMilli / 1_000) * 0.28;
}

interface OfflineFilterState {
  left: number;
  right: number;
}

/** Deterministic one-pole low-pass used when FILTER_CUTOFF is automated. */
function applyAutomatedLowPass(
  left: Float32Array,
  right: Float32Array,
  blockStartSeconds: number,
  sampleRateHz: number,
  project: AudioProject,
  curve: AudioAutomationCurve,
  state: OfflineFilterState,
): void {
  for (let index = 0; index < left.length; index += 1) {
    const cutoff = Math.min(
      20_000,
      Math.max(
        20,
        automationValueAtSeconds(
          curve,
          blockStartSeconds + index / sampleRateHz,
          project.tempo.milliBpm,
          project.timebase.ticksPerQuarter,
        ),
      ),
    );
    const alpha = Math.exp(-2 * Math.PI * cutoff / sampleRateHz);
    state.left = (1 - alpha) * left[index]! + alpha * state.left;
    state.right = (1 - alpha) * right[index]! + alpha * state.right;
    left[index] = state.left;
    right[index] = state.right;
  }
}

async function mixClipBlock(
  left: Float32Array,
  right: Float32Array,
  blockStartSeconds: number,
  outputRate: number,
  clip: AudioClip,
  project: AudioProject,
  accessor: RevisionChunkAccessor,
  clipGainAutomation?: AudioAutomationCurve,
): Promise<Audio200Result<true>> {
  const range = clipSeconds(clip, project);
  const blockEndSeconds = blockStartSeconds + left.length / outputRate;
  const sourceRate = accessor.reader.plan.sampleRateHz;
  const sourceFrames = accessor.revision.source.metadata.sampleFrames;
  const sourceOffsetFrame = Math.min(
    sourceFrames,
    Math.floor(clip.sourceOffsetUs * sourceRate / 1_000_000),
  );
  const sourceAvailableFrames = Math.max(1, sourceFrames - sourceOffsetFrame);
  const sourceDurationSeconds = sourceAvailableFrames / sourceRate;
  const playbackRate = Math.min(
    4,
    Math.max(
      0.25,
      Number.isFinite(clip.playbackRate ?? 1) ? clip.playbackRate ?? 1 : 1,
    ),
  );
  const clipDurationSeconds = clip.loop
    ? range.duration
    : Math.min(range.duration, sourceDurationSeconds / playbackRate);
  const clipEndSeconds = range.start + clipDurationSeconds;
  const first = Math.max(
    0,
    Math.floor(
      (Math.max(blockStartSeconds, range.start) - blockStartSeconds) *
        outputRate,
    ),
  );
  const last = Math.min(
    left.length,
    Math.ceil(
      (Math.min(blockEndSeconds, clipEndSeconds) - blockStartSeconds) *
        outputRate,
    ),
  );
  if (last <= first) return audioOk(true);

  const fadeInSeconds = ticksToSeconds(clip.fadeInTick, project);
  const fadeOutSeconds = ticksToSeconds(clip.fadeOutTick, project);
  const clipGain = dbToLinear(clip.gainMilliDb);
  let cursor = first;
  while (cursor < last) {
    const sampleTime = blockStartSeconds + cursor / outputRate;
    const localTime = Math.max(0, sampleTime - range.start);
    const sourceLocal = clip.loop
      ? (localTime * playbackRate) % sourceDurationSeconds
      : localTime * playbackRate;
    const untilLoop = clip.loop
      ? Math.max(
        1 / outputRate,
        (sourceDurationSeconds - sourceLocal) / playbackRate,
      )
      : (last - cursor) / outputRate;
    const segmentCount = Math.max(
      1,
      Math.min(last - cursor, Math.ceil(untilLoop * outputRate)),
    );
    const sourceStartFloat = sourceOffsetFrame + sourceLocal * sourceRate;
    const sourceStartFrame = Math.floor(sourceStartFloat);
    const sourceRangeFrames = Math.max(
      2,
      Math.ceil(segmentCount * sourceRate * playbackRate / outputRate) + 2,
    );
    const source = await accessor.readRange(
      sourceStartFrame,
      sourceRangeFrames,
    );
    if (!source.ok) return source as Audio200Result<true>;
    const sourceSamples = source.value;
    for (
      let index = 0;
      index < segmentCount && cursor + index < last;
      index += 1
    ) {
      const time = blockStartSeconds + (cursor + index) / outputRate;
      const local = Math.max(0, time - range.start);
      const localSource = clip.loop
        ? (local * playbackRate) % sourceDurationSeconds
        : local * playbackRate;
      const sourcePosition = sourceOffsetFrame + localSource * sourceRate -
        sourceStartFrame;
      const lower = Math.max(0, Math.floor(sourcePosition));
      const upper = Math.min(sourceSamples[0]!.length - 1, lower + 1);
      const fraction = Math.max(0, Math.min(1, sourcePosition - lower));
      const read = (channel: number): number => {
        const values = sourceSamples[channel] ?? sourceSamples[0]!;
        const firstValue = values[lower] ?? 0;
        const secondValue = values[upper] ?? firstValue;
        return firstValue + (secondValue - firstValue) * fraction;
      };
      const fade = fadeFactor(
        local,
        clipDurationSeconds,
        fadeInSeconds,
        fadeOutSeconds,
      );
      const automatedGain = clipGainAutomation === undefined
        ? clipGain
        : dbValueToLinear(
          automationValueAtSeconds(
            clipGainAutomation,
            time,
            project.tempo.milliBpm,
            project.timebase.ticksPerQuarter,
          ),
        );
      const gain = automatedGain * fade;
      const sourceLeft = read(0) * gain;
      const sourceRight = (sourceSamples.length > 1 ? read(1) : sourceLeft) *
        gain;
      left[cursor + index] = left[cursor + index]! + sourceLeft;
      right[cursor + index] = right[cursor + index]! + sourceRight;
    }
    cursor += segmentCount;
  }
  return audioOk(true);
}

/** Render the canonical Project to a deterministic PCM WAV artifact. */
export async function renderOfflineAudio(
  options: AudioOfflineRenderOptions,
): Promise<Audio200Result<AudioOfflineRenderArtifact>> {
  const target = normalizeTarget(options.project, options.target);
  if (!target.ok) return target as Audio200Result<AudioOfflineRenderArtifact>;
  const range = normalizedRange(options.project, options);
  if (!range.ok) return range as Audio200Result<AudioOfflineRenderArtifact>;
  const sampleRateHz = boundedInteger(
    options.sampleRateHz,
    DEFAULT_SAMPLE_RATE_HZ,
    MIN_SAMPLE_RATE_HZ,
    MAX_SAMPLE_RATE_HZ,
  );
  const channels = options.channels ?? 2;
  const bitDepth = options.bitDepth ?? 16;
  const blockFrames = boundedInteger(
    options.blockFrames,
    DEFAULT_BLOCK_FRAMES,
    MIN_BLOCK_FRAMES,
    MAX_BLOCK_FRAMES,
  );
  if (channels !== 1 && channels !== 2 || ![8, 16, 24, 32].includes(bitDepth)) {
    return fail(
      "AUDIO_RENDER_INVALID",
      "Render channels or bit depth is unsupported.",
      "render.format",
    );
  }
  const frameCount = Math.ceil(range.value.durationSeconds * sampleRateHz);
  if (
    !Number.isSafeInteger(frameCount) || frameCount < 1 ||
    WAV_HEADER_BYTES + frameCount * channels * bytesPerSample(bitDepth) >
      (options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES)
  ) {
    return fail(
      "AUDIO_RENDER_OUTPUT_LIMIT",
      "Render duration or format exceeds the bounded output limit.",
      "render.outputBytes",
    );
  }
  const info: AudioRenderWavInfo = {
    sampleRateHz,
    channels,
    bitDepth,
    frameCount,
    target: target.value,
  };
  // Read the mutable cancellation flag through a function so a caller may
  // abort while an async sink write or progress callback is in flight.
  const isCancelled = (): boolean => options.cancellation?.aborted === true;
  const sink = options.sink ?? createMemoryAudioRenderSink(
    options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
  );
  if (isCancelled()) {
    return fail(
      "AUDIO_RENDER_CANCELLED",
      "Offline Render was cancelled before the sink opened.",
      "render.cancellation",
      true,
    );
  }
  const begun = await sink.begin(info);
  if (!begun.ok) return begun as Audio200Result<AudioOfflineRenderArtifact>;

  const trackState = effectiveTrackState(
    options.project,
    options.respectMuteSolo !== false,
  );
  const automationCurves = compileProjectAutomations(options.project);
  const activeFreezeClipByTrack = new Map(
    (options.project.freezeStates ?? [])
      .filter((freeze) => freeze.status === "ACTIVE")
      .map((freeze) => [String(freeze.trackId), String(freeze.frozenClipId)]),
  );
  const freezeClipIdsByTrack = new Map<string, Set<string>>();
  for (const freeze of options.project.freezeStates ?? []) {
    const clipIds = freezeClipIdsByTrack.get(String(freeze.trackId)) ??
      new Set<string>();
    clipIds.add(String(freeze.frozenClipId));
    freezeClipIdsByTrack.set(String(freeze.trackId), clipIds);
  }
  const includeTrackMixer = options.includeTrackMixer !== false;
  const includeMasterMixer = options.includeMasterMixer !== false;
  const resolvedTarget = target.value;
  const useRouting = includeTrackMixer && resolvedTarget === "MASTER";
  let routingGraph: AudioRoutingGraph | undefined;
  let routingAudibility: ReadonlyMap<string, boolean> | undefined;
  if (useRouting) {
    const built = buildProjectAudioRoutingGraph(options.project);
    if (!built.ok) {
      await sink.cancel();
      return audioFail(
        "AUDIO_RENDER_INVALID",
        built.diagnostics[0]?.message ?? "Canonical mixer routing is invalid.",
        built.diagnostics[0]?.path ?? "project.mixer.routing",
      );
    }
    routingGraph = built.value;
    routingAudibility = effectiveAudioTrackAudibility(
      options.project,
      built.value,
      options.respectMuteSolo !== false,
    );
  }
  const tracks = resolvedTarget === "MASTER"
    ? useRouting
      ? routingGraph!.order.map((trackId) =>
        options.project.tracks.find((track) => track.trackId === trackId)!
      )
      : options.project.tracks
    : options.project.tracks.filter((track) =>
      String(track.trackId) === resolvedTarget.trackId
    );
  const revisions = new Map(
    options.project.revisions.map((
      revision,
    ) => [String(revision.revisionId), revision]),
  );
  const accessors = new Map<
    string,
    Promise<RevisionChunkAccessor | undefined>
  >();
  const getAccessor = (
    revision: AudioRevision,
  ): Promise<RevisionChunkAccessor | undefined> => {
    const key = String(revision.revisionId);
    const existing = accessors.get(key);
    if (existing !== undefined) return existing;
    const created = RevisionChunkAccessor.create(options.store, revision).then(
      (result) => {
        if (!result.ok) return undefined;
        return result.value;
      },
    );
    accessors.set(key, created);
    return created;
  };
  const notesByTrack = new Map<string, readonly AudioNote[]>();
  const notesById = new Map(
    options.project.notes.map((note) => [String(note.noteId), note]),
  );
  for (const track of tracks) {
    notesByTrack.set(
      String(track.trackId),
      track.noteIds.map((id) => notesById.get(String(id))).filter((
        note,
      ): note is AudioNote => note !== undefined),
    );
  }
  const voiceOverrides = synthPresetOverrides(options.project.synthPresets);
  const filterStates = new Map<string, OfflineFilterState>();
  const effectStates = new Map<
    string,
    ReturnType<typeof createOfflineEffectChainState>
  >();
  const effectsById = new Map(
    options.project.effects.map((effect) => [String(effect.effectId), effect]),
  );
  const masterState = options.project.master;
  const masterEffects = (masterState?.effectIds ?? []).map((effectId) =>
    effectsById.get(String(effectId))
  ).filter((effect): effect is NonNullable<typeof effect> =>
    effect !== undefined
  );
  const masterEffectState = createOfflineEffectChainState();
  const masterGain = dbToLinear(options.project.mixer.masterGainMilliDb);
  let completedFrames = 0;
  try {
    while (completedFrames < frameCount) {
      if (isCancelled()) {
        await sink.cancel();
        return fail(
          "AUDIO_RENDER_CANCELLED",
          "Offline Render was cancelled before completion.",
          "render.cancellation",
          true,
        );
      }
      const count = Math.min(blockFrames, frameCount - completedFrames);
      const left = new Float32Array(count);
      const right = new Float32Array(count);
      const routedInputs = new Map<
        string,
        { left: Float32Array; right: Float32Array }
      >();
      const blockStartSeconds = range.value.startSeconds +
        completedFrames / sampleRateHz;
      for (const track of tracks) {
        const state = trackState.get(String(track.trackId));
        const audible = useRouting
          ? routingAudibility?.get(String(track.trackId)) === true
          : state?.audible === true;
        if (state === undefined || !audible) continue;
        const trackLeft = new Float32Array(count);
        const trackRight = new Float32Array(count);
        const inbound = routedInputs.get(String(track.trackId));
        if (inbound !== undefined) {
          trackLeft.set(inbound.left);
          trackRight.set(inbound.right);
        }
        const activeFreezeClipId = activeFreezeClipByTrack.get(
          String(track.trackId),
        );
        const channel = options.project.mixer.channels.find((item) =>
          item.trackId === track.trackId
        );
        const trackGainAutomation = automationCurveForTarget(
          automationCurves,
          "TRACK_GAIN",
          String(track.trackId),
        ) ?? (channel === undefined ? undefined : automationCurveForTarget(
          automationCurves,
          "MIXER_CHANNEL_GAIN",
          String(channel.channelId),
        ));
        const synthGainAutomation = automationCurveForTarget(
          automationCurves,
          "SYNTH_PARAMETER",
          String(track.trackId),
          "gain",
        ) ?? automationCurveForTarget(
          automationCurves,
          "SYNTH_PARAMETER",
          String(track.trackId),
          "volume",
        );
        const trackPanAutomation = automationCurveForTarget(
          automationCurves,
          "TRACK_PAN",
          String(track.trackId),
        ) ?? (channel === undefined ? undefined : automationCurveForTarget(
          automationCurves,
          "MIXER_CHANNEL_PAN",
          String(channel.channelId),
        ));
        const synthPanAutomation = automationCurveForTarget(
          automationCurves,
          "SYNTH_PARAMETER",
          String(track.trackId),
          "pan",
        );
        const filterAutomation = activeFreezeClipId === undefined
          ? automationCurveForTarget(
            automationCurves,
            "FILTER_CUTOFF",
            String(track.trackId),
          )
          : undefined;
        const synthFilterAutomation = activeFreezeClipId === undefined
          ? automationCurveForTarget(
            automationCurves,
            "SYNTH_PARAMETER",
            String(track.trackId),
            "filterCutoff",
          )
          : undefined;
        const resolvedFilterAutomation = filterAutomation ??
          synthFilterAutomation;
        const filterState = resolvedFilterAutomation === undefined
          ? undefined
          : filterStates.get(String(track.trackId)) ?? { left: 0, right: 0 };
        for (const clipId of track.clipIds) {
          if (
            activeFreezeClipId !== undefined &&
            String(clipId) !== activeFreezeClipId
          ) continue;
          if (
            activeFreezeClipId === undefined &&
            freezeClipIdsByTrack.get(String(track.trackId))?.has(String(clipId))
          ) continue;
          const clip = options.project.clips.find((item) =>
            item.clipId === clipId
          );
          if (clip === undefined) continue;
          const revision = revisions.get(String(clip.revisionId));
          if (revision === undefined) {
            await sink.cancel();
            return fail(
              "AUDIO_SOURCE_UNAVAILABLE",
              "Clip Revision is missing during Offline Render.",
              `clips.${String(clip.clipId)}.revisionId`,
            );
          }
          const accessor = await getAccessor(revision);
          if (accessor === undefined) {
            await sink.cancel();
            return fail(
              "AUDIO_SOURCE_UNAVAILABLE",
              "Clip source could not be opened during Offline Render.",
              `clips.${String(clip.clipId)}.source`,
              true,
            );
          }
          const mixed = await mixClipBlock(
            trackLeft,
            trackRight,
            blockStartSeconds,
            sampleRateHz,
            clip,
            options.project,
            accessor,
            automationCurveForTarget(
              automationCurves,
              "CLIP_GAIN",
              String(clip.clipId),
            ),
          );
          if (!mixed.ok) {
            await sink.cancel();
            return mixed as Audio200Result<AudioOfflineRenderArtifact>;
          }
        }
        const notes = activeFreezeClipId === undefined
          ? notesByTrack.get(String(track.trackId)) ?? []
          : [];
        const preLeft = new Float32Array(count);
        const preRight = new Float32Array(count);
        const postLeft = new Float32Array(count);
        const postRight = new Float32Array(count);
        for (let index = 0; index < count; index += 1) {
          const time = blockStartSeconds + index / sampleRateHz;
          for (const note of notes) {
            const value = noteWaveSample(
              note,
              track,
              options.project,
              time,
              completedFrames + index,
              voiceOverrides,
            );
            trackLeft[index] = trackLeft[index]! + value;
            trackRight[index] = trackRight[index]! + value;
          }
        }
        if (
          resolvedFilterAutomation !== undefined && filterState !== undefined
        ) {
          applyAutomatedLowPass(
            trackLeft,
            trackRight,
            blockStartSeconds,
            sampleRateHz,
            options.project,
            resolvedFilterAutomation,
            filterState,
          );
          filterStates.set(String(track.trackId), filterState);
        }
        const effects = track.effectIds.map((effectId) =>
          effectsById.get(String(effectId))
        ).filter((effect): effect is NonNullable<typeof effect> =>
          effect !== undefined
        );
        if (effects.length > 0) {
          const effectState = effectStates.get(String(track.trackId)) ??
            createOfflineEffectChainState();
          applyOfflineEffectChain(trackLeft, trackRight, {
            effects,
            state: effectState,
            sampleRateHz,
            blockStartSeconds,
            tempoMilliBpm: options.project.tempo.milliBpm,
            ticksPerQuarter: options.project.timebase.ticksPerQuarter,
            curveFor: (effectId, parameterName) =>
              automationCurveForTarget(
                automationCurves,
                "EFFECT_PARAMETER",
                effectId,
                parameterName,
              ),
          });
          effectStates.set(String(track.trackId), effectState);
        }
        for (let index = 0; index < count; index += 1) {
          const time = blockStartSeconds + index / sampleRateHz;
          const gainAutomation = trackGainAutomation ?? synthGainAutomation;
          const mixerGain = includeTrackMixer
            ? gainAutomation === undefined ? state.gain : dbValueToLinear(
              automationValueAtSeconds(
                gainAutomation,
                time,
                options.project.tempo.milliBpm,
                options.project.timebase.ticksPerQuarter,
              ),
            )
            : 1;
          const synthGain = synthGainAutomation === undefined
            ? 1
            : dbValueToLinear(
              automationValueAtSeconds(
                synthGainAutomation,
                time,
                options.project.tempo.milliBpm,
                options.project.timebase.ticksPerQuarter,
              ),
            );
          const automatedGain = mixerGain * synthGain;
          const panAutomation = trackPanAutomation ?? synthPanAutomation;
          const mixerPan = includeTrackMixer
            ? panAutomation === undefined ? state.pan : panValueGains(
              automationValueAtSeconds(
                panAutomation,
                time,
                options.project.tempo.milliBpm,
                options.project.timebase.ticksPerQuarter,
              ),
            )
            : [1, 1] as const;
          const synthPan = synthPanAutomation === undefined
            ? [1, 1] as const
            : panValueGains(
              automationValueAtSeconds(
                synthPanAutomation,
                time,
                options.project.tempo.milliBpm,
                options.project.timebase.ticksPerQuarter,
              ),
            );
          const preGainLeft = synthGain * synthPan[0]!;
          const preGainRight = synthGain * synthPan[1]!;
          const postGainLeft = includeTrackMixer
            ? mixerGain * mixerPan[0]! * preGainLeft
            : preGainLeft;
          const postGainRight = includeTrackMixer
            ? mixerGain * mixerPan[1]! * preGainRight
            : preGainRight;
          preLeft[index] = trackLeft[index]! * preGainLeft;
          preRight[index] = trackRight[index]! * preGainRight;
          postLeft[index] = trackLeft[index]! * postGainLeft;
          postRight[index] = trackRight[index]! * postGainRight;
          if (!useRouting) {
            left[index] = left[index]! + postLeft[index]!;
            right[index] = right[index]! + postRight[index]!;
          }
        }
        if (useRouting && routingGraph !== undefined) {
          const outputTrackId = routingGraph.outputBySource.get(
            String(track.trackId),
          );
          const output = outputTrackId === undefined
            ? undefined
            : routedInputs.get(outputTrackId) ?? {
              left: new Float32Array(count),
              right: new Float32Array(count),
            };
          if (outputTrackId !== undefined && output !== undefined) {
            routedInputs.set(outputTrackId, output);
          }
          for (let index = 0; index < count; index += 1) {
            if (output === undefined) {
              left[index] = left[index]! + postLeft[index]!;
              right[index] = right[index]! + postRight[index]!;
            } else {
              output.left[index] = output.left[index]! + postLeft[index]!;
              output.right[index] = output.right[index]! + postRight[index]!;
            }
          }
          for (
            const send
              of routingGraph.sendsBySource.get(String(track.trackId)) ?? []
          ) {
            const destination =
              routedInputs.get(String(send.destinationTrackId)) ?? {
                left: new Float32Array(count),
                right: new Float32Array(count),
              };
            routedInputs.set(String(send.destinationTrackId), destination);
            const sendGain = audioSendAmountToLinear(send.amountMilliDb);
            const sourceLeft = send.preFader ? preLeft : postLeft;
            const sourceRight = send.preFader ? preRight : postRight;
            for (let index = 0; index < count; index += 1) {
              destination.left[index] = destination.left[index]! +
                sourceLeft[index]! * sendGain;
              destination.right[index] = destination.right[index]! +
                sourceRight[index]! * sendGain;
            }
          }
        }
      }
      for (let index = 0; index < count; index += 1) {
        if (includeMasterMixer) {
          left[index] = left[index]! * masterGain;
          right[index] = right[index]! * masterGain;
        }
      }
      if (includeMasterMixer && masterState !== undefined) {
        applyOfflineMasterProcessing(left, right, {
          master: masterState,
          effects: masterEffects,
          effectState: masterEffectState,
          sampleRateHz,
          blockStartSeconds,
          tempoMilliBpm: options.project.tempo.milliBpm,
          ticksPerQuarter: options.project.timebase.ticksPerQuarter,
          curveFor: (effectId, parameterName) =>
            automationCurveForTarget(
              automationCurves,
              "EFFECT_PARAMETER",
              effectId,
              parameterName,
            ),
        });
      }
      const encoded = encodePcmBlock(left, right, channels, bitDepth);
      const written = await sink.writePcm(encoded);
      if (!written.ok) {
        await sink.cancel();
        return written as Audio200Result<AudioOfflineRenderArtifact>;
      }
      completedFrames += count;
      if (isCancelled()) {
        await sink.cancel();
        return fail(
          "AUDIO_RENDER_CANCELLED",
          "Offline Render was cancelled after a bounded PCM write.",
          "render.cancellation",
          true,
        );
      }
      await options.onProgress?.({
        completedFrames,
        totalFrames: frameCount,
        ratio: completedFrames / frameCount,
        target: target.value,
      });
    }
    if (isCancelled()) {
      await sink.cancel();
      return fail(
        "AUDIO_RENDER_CANCELLED",
        "Offline Render was cancelled before finalization.",
        "render.cancellation",
        true,
      );
    }
    const finalized = await sink.finalize();
    if (!finalized.ok) {
      return finalized as Audio200Result<AudioOfflineRenderArtifact>;
    }
    const bytes = finalized.value;
    const contentHash = bytes === null
      ? null
      : asAudioContentHash(await sha256Hex(bytes));
    return audioOk({
      bytes,
      contentHash,
      sampleRateHz,
      channels,
      bitDepth,
      frameCount,
      durationSeconds: frameCount / sampleRateHz,
      startSeconds: range.value.startSeconds,
      target: target.value,
      projectRevision: options.project.projectRevision,
      projectStateHash: options.project.stateHash,
    });
  } catch (error) {
    await sink.cancel().catch(() => undefined);
    return fail(
      "AUDIO_RENDER_INVALID",
      error instanceof Error ? error.message : "Offline Render failed.",
      "render",
      true,
    );
  }
}
