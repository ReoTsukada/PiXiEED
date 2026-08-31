/**
 * Host-neutral long-audio reader.
 *
 * This module deliberately knows nothing about AudioContext, DOM, Waveform
 * UI, or Project persistence. It turns an immutable AUDIO-200 WAV revision
 * into bounded PCM chunks backed by the byte-store range boundary.
 */

import {
  AUDIO200_MAX_RANGE_BYTES,
  type AudioAssetByteStore,
} from "./audio-asset-store.ts";
import {
  AUDIO200_WAVEFORM_SCHEMA_VERSION,
  type Audio200Result,
  audioFail,
  audioOk,
  type AudioRevision,
  type AudioWaveformCache,
  type AudioWaveformPeak,
  type AudioWaveformPeakLevel,
} from "./contracts.ts";

const DEFAULT_SHORT_BYTES = 8 * 1024 * 1024;
const DEFAULT_SHORT_SECONDS = 30;
const DEFAULT_CHUNK_SECONDS = 2;
const DEFAULT_READ_AHEAD_CHUNKS = 2;
const DEFAULT_MAX_CACHED_CHUNKS = 4;
const HEADER_WINDOW_BYTES = 64 * 1024;
const MAX_HEADER_WINDOW_BYTES = 1024 * 1024;

export type AudioStreamingMode = "FULL_DECODE" | "CHUNKED";

export interface AudioStreamingPlan {
  readonly mode: AudioStreamingMode;
  readonly chunkFrames: number;
  readonly chunkDurationSeconds: number;
  readonly readAheadChunks: number;
  readonly maxCachedChunks: number;
  readonly maxRangeBytes: number;
  readonly codec: "WAV_PCM" | "WAV_IEEE_FLOAT";
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth: 8 | 16 | 24 | 32;
  readonly frameBytes: number;
  readonly sampleFrames: number;
  readonly durationSeconds: number;
  readonly dataChunks: readonly { offset: number; length: number }[];
}

export interface AudioPcmChunk {
  readonly index: number;
  readonly startFrame: number;
  readonly frameCount: number;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  /** De-interleaved, normalized PCM samples. */
  readonly samples: readonly Float32Array[];
}

export interface AudioStreamingOptions {
  readonly shortAudioMaxBytes?: number;
  readonly shortAudioMaxSeconds?: number;
  readonly chunkSeconds?: number;
  readonly readAheadChunks?: number;
  readonly maxCachedChunks?: number;
  readonly maxRangeBytes?: number;
}

export interface AudioPcmChunkReader {
  readonly plan: AudioStreamingPlan;
  readChunk(index: number): Promise<Audio200Result<AudioPcmChunk | null>>;
  prefetchAround(index: number): Promise<void>;
  clear(): void;
  snapshot(): {
    readonly mode: AudioStreamingMode;
    readonly cachedChunkIndices: readonly number[];
    readonly inFlightChunkIndices: readonly number[];
    readonly cachedChunkCount: number;
    readonly cachedSampleCount: number;
  };
}

export interface AudioStreamingWaveformOptions {
  readonly baseBucketSize?: number;
  readonly levels?: number;
}

interface WavHeaderInfo {
  readonly codec: "WAV_PCM" | "WAV_IEEE_FLOAT";
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth: 8 | 16 | 24 | 32;
  readonly blockAlign: number;
  readonly dataChunks: readonly { offset: number; length: number }[];
}

function u16(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return (bytes[offset]! | (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    return "";
  }
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function boundedPositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
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

function unavailable(
  message: string,
  path = "revision.source",
): Audio200Result<never> {
  return audioFail("AUDIO_SOURCE_UNAVAILABLE", message, path, true);
}

async function scanWavHeader(
  store: AudioAssetByteStore,
  revision: AudioRevision,
  maxRangeBytes: number,
): Promise<Audio200Result<WavHeaderInfo>> {
  const sourceBytes = revision.source.metadata.byteLength;
  const read = async (
    offset: number,
    length: number,
  ): Promise<Audio200Result<Uint8Array>> => {
    if (
      length < 1 || length > maxRangeBytes || offset < 0 ||
      !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      offset + length > sourceBytes
    ) {
      return audioFail(
        "AUDIO_INVALID_NUMBER",
        "WAV header range is outside the immutable source.",
        "revision.source",
      );
    }
    const result = await store.getRange(revision, offset, length);
    if (!result.ok) return result;
    if (result.value === null) {
      return unavailable("Audio source is unavailable.");
    }
    if (result.value.byteLength !== length) {
      return audioFail(
        "AUDIO_RAW_BLOB_MODIFIED",
        "Audio byte store returned a truncated range.",
        "revision.source",
      );
    }
    return audioOk(result.value, result.diagnostics);
  };

  const firstLength = Math.min(
    sourceBytes,
    HEADER_WINDOW_BYTES,
    maxRangeBytes,
  );
  const first = await read(0, firstLength);
  if (!first.ok) return first;
  if (
    text(first.value, 0, 4) !== "RIFF" || text(first.value, 8, 4) !== "WAVE"
  ) {
    return audioFail(
      "AUDIO_UNSUPPORTED_CODEC",
      "Only RIFF/WAVE PCM fixtures are supported by the streaming reader.",
      "revision.source.metadata.codec",
    );
  }

  let windowOffset = 0;
  let window = first.value;
  const ensure = async (
    offset: number,
    length: number,
  ): Promise<Audio200Result<Uint8Array>> => {
    if (
      offset >= windowOffset && offset + length <= windowOffset + window.length
    ) {
      return audioOk(
        window.subarray(offset - windowOffset, offset - windowOffset + length),
      );
    }
    const nextLength = Math.min(
      Math.max(length, HEADER_WINDOW_BYTES),
      sourceBytes - offset,
      maxRangeBytes,
    );
    const next = await read(offset, nextLength);
    if (!next.ok) return next;
    windowOffset = offset;
    window = next.value;
    if (length > window.length) {
      return audioFail(
        "AUDIO_INVALID_SOURCE",
        "WAV header field is truncated.",
        "revision.source",
      );
    }
    return audioOk(window.subarray(0, length), next.diagnostics);
  };

  let offset = 12;
  let format: Omit<WavHeaderInfo, "dataChunks"> | undefined;
  const dataChunks: { offset: number; length: number }[] = [];
  while (offset + 8 <= sourceBytes) {
    const header = await ensure(offset, 8);
    if (!header.ok) return header;
    const chunkSize = u32(header.value, 4);
    if (chunkSize === null) {
      return audioFail(
        "AUDIO_INVALID_SOURCE",
        "WAV chunk header is truncated.",
        "revision.source.chunks",
      );
    }
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > sourceBytes) {
      return audioFail(
        "AUDIO_INVALID_SOURCE",
        "WAV chunk extends beyond the immutable source.",
        "revision.source.chunks",
      );
    }
    const chunk = text(header.value, 0, 4);
    if (chunk === "fmt ") {
      if (chunkSize < 16) {
        return audioFail(
          "AUDIO_INVALID_SOURCE",
          "WAV fmt chunk is shorter than the PCM contract.",
          "revision.source.fmt",
        );
      }
      const fmt = await ensure(payloadStart, 16);
      if (!fmt.ok) return fmt;
      const audioFormat = u16(fmt.value, 0);
      const channels = u16(fmt.value, 2);
      const sampleRateHz = u32(fmt.value, 4);
      const byteRate = u32(fmt.value, 8);
      const blockAlign = u16(fmt.value, 12);
      const bitDepth = u16(fmt.value, 14);
      if (
        audioFormat !== 1 && audioFormat !== 3 ||
        channels !== 1 && channels !== 2 ||
        sampleRateHz === null || sampleRateHz < 8_000 ||
        sampleRateHz > 384_000 ||
        byteRate === null || blockAlign === null || bitDepth === null
      ) {
        return audioFail(
          "AUDIO_INVALID_SOURCE",
          "WAV fmt values are outside the canonical Audio-200 range.",
          "revision.source.fmt",
        );
      }
      if (
        (audioFormat === 3 && bitDepth !== 32) ||
        (audioFormat === 1 && bitDepth !== 8 && bitDepth !== 16 &&
          bitDepth !== 24 && bitDepth !== 32)
      ) {
        return audioFail(
          "AUDIO_UNSUPPORTED_CODEC",
          "WAV bit depth is unsupported by the streaming decoder.",
          "revision.source.codec",
        );
      }
      const expectedBlockAlign = channels * (bitDepth / 8);
      if (
        blockAlign !== expectedBlockAlign ||
        byteRate !== sampleRateHz * blockAlign
      ) {
        return audioFail(
          "AUDIO_INVALID_SOURCE",
          "WAV block alignment or byte rate is inconsistent.",
          "revision.source.fmt",
        );
      }
      format = {
        codec: audioFormat === 1 ? "WAV_PCM" : "WAV_IEEE_FLOAT",
        sampleRateHz,
        channels: channels as 1 | 2,
        bitDepth: bitDepth as 8 | 16 | 24 | 32,
        blockAlign,
      };
    } else if (chunk === "data") {
      dataChunks.push({ offset: payloadStart, length: chunkSize });
    }
    const next = payloadEnd + (chunkSize % 2);
    if (
      !Number.isSafeInteger(next) || next <= offset || next > sourceBytes + 1
    ) {
      return audioFail(
        "AUDIO_OVERFLOW",
        "WAV chunk offset overflowed the source boundary.",
        "revision.source.chunks",
      );
    }
    offset = next;
    if (
      format !== undefined && dataChunks.length > 0 && offset >= sourceBytes
    ) {
      break;
    }
  }
  if (format === undefined || dataChunks.length === 0) {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "WAV source requires fmt and data chunks.",
      "revision.source",
    );
  }
  const dataBytes = dataChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const expectedDataBytes = revision.source.metadata.sampleFrames *
    format.blockAlign;
  if (
    !Number.isSafeInteger(dataBytes) || dataBytes !== expectedDataBytes ||
    dataChunks.some((chunk) => chunk.length % format!.blockAlign !== 0)
  ) {
    return audioFail(
      "AUDIO_METADATA_MISMATCH",
      "WAV data chunks do not match canonical sample-frame metadata.",
      "revision.source.metadata",
    );
  }
  const metadata = revision.source.metadata;
  if (
    format.codec !== metadata.codec ||
    format.sampleRateHz !== metadata.sampleRateHz ||
    format.channels !== metadata.channels ||
    format.bitDepth !== metadata.bitDepth
  ) {
    return audioFail(
      "AUDIO_METADATA_MISMATCH",
      "WAV header does not match the immutable Revision metadata.",
      "revision.source.metadata",
    );
  }
  return audioOk({ ...format, dataChunks });
}

function decodeSample(
  bytes: Uint8Array,
  offset: number,
  codec: WavHeaderInfo["codec"],
  bitDepth: WavHeaderInfo["bitDepth"],
): number {
  if (codec === "WAV_IEEE_FLOAT") {
    const value = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getFloat32(offset, true);
    return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  }
  if (bitDepth === 8) return (bytes[offset]! - 128) / 128;
  if (bitDepth === 16) {
    const value = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getInt16(offset, true);
    return value / 32768;
  }
  if (bitDepth === 24) {
    const value = bytes[offset]! | (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16);
    const signed = (value & 0x800000) !== 0 ? value | 0xff000000 : value;
    return signed / 8388608;
  }
  const value = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getInt32(offset, true);
  return value / 2147483648;
}

function normalizeOptions(
  options: AudioStreamingOptions,
): Required<AudioStreamingOptions> {
  const maxRangeBytes = boundedInteger(
    options.maxRangeBytes,
    AUDIO200_MAX_RANGE_BYTES,
    1024,
    AUDIO200_MAX_RANGE_BYTES,
  );
  return {
    shortAudioMaxBytes: boundedInteger(
      options.shortAudioMaxBytes,
      DEFAULT_SHORT_BYTES,
      1,
      64 * 1024 * 1024,
    ),
    shortAudioMaxSeconds: boundedPositive(
      options.shortAudioMaxSeconds,
      DEFAULT_SHORT_SECONDS,
    ),
    chunkSeconds: boundedPositive(options.chunkSeconds, DEFAULT_CHUNK_SECONDS),
    readAheadChunks: boundedInteger(
      options.readAheadChunks,
      DEFAULT_READ_AHEAD_CHUNKS,
      0,
      16,
    ),
    maxCachedChunks: boundedInteger(
      options.maxCachedChunks,
      DEFAULT_MAX_CACHED_CHUNKS,
      1,
      64,
    ),
    maxRangeBytes,
  };
}

export async function createAudioPcmChunkReader(
  store: AudioAssetByteStore,
  revision: AudioRevision,
  options: AudioStreamingOptions = {},
): Promise<Audio200Result<AudioPcmChunkReader>> {
  const normalized = normalizeOptions(options);
  const metadata = revision.source.metadata;
  if (metadata.codec !== "WAV_PCM" && metadata.codec !== "WAV_IEEE_FLOAT") {
    return audioFail(
      "AUDIO_UNSUPPORTED_CODEC",
      "The bounded streaming reader currently supports canonical WAV PCM only.",
      "revision.source.metadata.codec",
    );
  }
  const layout = await scanWavHeader(store, revision, normalized.maxRangeBytes);
  if (!layout.ok) return layout;
  const frameBytes = layout.value.blockAlign;
  const maxFramesPerRange = Math.max(
    1,
    Math.floor(normalized.maxRangeBytes / frameBytes),
  );
  const canFullDecode = metadata.byteLength <= normalized.shortAudioMaxBytes &&
    metadata.durationUs / 1_000_000 <= normalized.shortAudioMaxSeconds &&
    metadata.sampleFrames <= maxFramesPerRange;
  const requestedChunkFrames = Math.max(
    1,
    Math.round(metadata.sampleRateHz * normalized.chunkSeconds),
  );
  const chunkFrames = canFullDecode
    ? metadata.sampleFrames
    : Math.min(requestedChunkFrames, maxFramesPerRange);
  const durationSeconds = metadata.sampleFrames / metadata.sampleRateHz;
  const plan: AudioStreamingPlan = {
    mode: canFullDecode ? "FULL_DECODE" : "CHUNKED",
    chunkFrames,
    chunkDurationSeconds: chunkFrames / metadata.sampleRateHz,
    readAheadChunks: normalized.readAheadChunks,
    maxCachedChunks: normalized.maxCachedChunks,
    maxRangeBytes: normalized.maxRangeBytes,
    codec: layout.value.codec,
    sampleRateHz: layout.value.sampleRateHz,
    channels: layout.value.channels,
    bitDepth: layout.value.bitDepth,
    frameBytes,
    sampleFrames: metadata.sampleFrames,
    durationSeconds,
    dataChunks: layout.value.dataChunks,
  };

  const cache = new Map<number, AudioPcmChunk>();
  const inFlight = new Map<
    number,
    {
      readonly generation: number;
      readonly promise: Promise<Audio200Result<AudioPcmChunk | null>>;
    }
  >();
  let generation = 0;

  const readChunk = async (
    index: number,
  ): Promise<Audio200Result<AudioPcmChunk | null>> => {
    if (!Number.isSafeInteger(index) || index < 0) {
      return audioFail(
        "AUDIO_INVALID_NUMBER",
        "Chunk index is invalid.",
        "index",
      );
    }
    const startFrame = index * plan.chunkFrames;
    if (startFrame >= plan.sampleFrames) return audioOk(null);
    const cached = cache.get(index);
    if (cached !== undefined) {
      cache.delete(index);
      cache.set(index, cached);
      return audioOk(cached);
    }
    const pending = inFlight.get(index);
    if (pending !== undefined && pending.generation === generation) {
      return pending.promise;
    }
    const requestGeneration = generation;
    const request =
      (async (): Promise<Audio200Result<AudioPcmChunk | null>> => {
        const frameCount = Math.min(
          plan.chunkFrames,
          plan.sampleFrames - startFrame,
        );
        const samples = Array.from(
          { length: plan.channels },
          () => new Float32Array(frameCount),
        );
        let sourceFrameCursor = 0;
        let destinationFrameCursor = 0;
        for (const dataChunk of plan.dataChunks) {
          const dataChunkFrames = dataChunk.length / plan.frameBytes;
          const overlapStart = Math.max(startFrame, sourceFrameCursor);
          const overlapEnd = Math.min(
            startFrame + frameCount,
            sourceFrameCursor + dataChunkFrames,
          );
          if (overlapEnd > overlapStart) {
            const frames = overlapEnd - overlapStart;
            const byteOffset = dataChunk.offset +
              (overlapStart - sourceFrameCursor) * plan.frameBytes;
            const byteLength = frames * plan.frameBytes;
            const bytes = await store.getRange(
              revision,
              byteOffset,
              byteLength,
            );
            if (!bytes.ok) return bytes as Audio200Result<AudioPcmChunk | null>;
            if (bytes.value === null) {
              return unavailable("Audio source is unavailable.");
            }
            if (bytes.value.byteLength !== byteLength) {
              return audioFail(
                "AUDIO_RAW_BLOB_MODIFIED",
                "Audio byte store returned a truncated PCM chunk.",
                "revision.source",
              );
            }
            const destinationStart = overlapStart - startFrame;
            for (let frame = 0; frame < frames; frame += 1) {
              const frameByteOffset = frame * plan.frameBytes;
              for (let channel = 0; channel < plan.channels; channel += 1) {
                const sampleOffset = frameByteOffset +
                  channel * (plan.bitDepth / 8);
                samples[channel]![destinationStart + frame] = decodeSample(
                  bytes.value,
                  sampleOffset,
                  plan.codec,
                  plan.bitDepth,
                );
              }
            }
            destinationFrameCursor += frames;
          }
          sourceFrameCursor += dataChunkFrames;
          if (sourceFrameCursor >= startFrame + frameCount) break;
        }
        if (destinationFrameCursor !== frameCount) {
          return audioFail(
            "AUDIO_METADATA_MISMATCH",
            "PCM chunk did not cover the canonical sample-frame interval.",
            "revision.source.metadata.sampleFrames",
          );
        }
        const chunk: AudioPcmChunk = {
          index,
          startFrame,
          frameCount,
          sampleRateHz: plan.sampleRateHz,
          channels: plan.channels,
          samples,
        };
        if (requestGeneration === generation) {
          cache.set(index, chunk);
          while (cache.size > plan.maxCachedChunks) {
            const oldest = cache.keys().next().value;
            if (oldest === undefined) break;
            cache.delete(oldest);
          }
        }
        return audioOk(chunk);
      })();
    inFlight.set(index, { generation: requestGeneration, promise: request });
    try {
      return await request;
    } finally {
      const current = inFlight.get(index);
      if (current?.promise === request) inFlight.delete(index);
    }
  };

  const reader: AudioPcmChunkReader = {
    plan,
    readChunk,
    async prefetchAround(index) {
      if (!Number.isSafeInteger(index) || index < 0) return;
      const requests: Promise<Audio200Result<AudioPcmChunk | null>>[] = [];
      for (let offset = 0; offset <= plan.readAheadChunks; offset += 1) {
        requests.push(readChunk(index + offset));
      }
      await Promise.all(requests);
    },
    clear() {
      generation += 1;
      cache.clear();
      inFlight.clear();
    },
    snapshot() {
      let cachedSampleCount = 0;
      for (const chunk of cache.values()) cachedSampleCount += chunk.frameCount;
      return {
        mode: plan.mode,
        cachedChunkIndices: [...cache.keys()],
        inFlightChunkIndices: [...inFlight.keys()],
        cachedChunkCount: cache.size,
        cachedSampleCount,
      };
    },
  };
  return audioOk(reader);
}

/** Build a peak cache one bounded PCM chunk at a time after a reload. */
export async function buildAudioWaveformPeakCacheFromChunkReader(
  reader: AudioPcmChunkReader,
  revision: AudioRevision,
  options: AudioStreamingWaveformOptions = {},
): Promise<Audio200Result<AudioWaveformCache>> {
  const base = options.baseBucketSize ?? 256;
  const levelCount = options.levels ?? 8;
  if (
    !Number.isSafeInteger(base) || base < 1 || base > (1 << 30) ||
    !Number.isSafeInteger(levelCount) || levelCount < 1 || levelCount > 10
  ) {
    return audioFail(
      "AUDIO_INVALID_WAVEFORM",
      "Waveform bucket size or level count is outside the safe range.",
      "options",
    );
  }
  const normalizeBucket = (requested: number): number =>
    Math.min(
      1 << 30,
      Math.max(
        Math.max(1, Math.ceil(reader.plan.sampleFrames / 131_072)),
        Math.trunc(requested),
      ),
    );
  const bucketSizes = Array.from(
    { length: levelCount },
    (_, index) => normalizeBucket(base * (2 ** index)),
  );
  const peaks = Array.from(
    { length: levelCount },
    () => [] as AudioWaveformPeak[],
  );
  const minima = bucketSizes.map(() => 1);
  const maxima = bucketSizes.map(() => -1);
  const frameCounts = bucketSizes.map(() => 0);
  const flush = (level: number): void => {
    if (frameCounts[level] === 0) return;
    peaks[level]!.push({
      min: Math.max(-1, Math.min(1, minima[level]!)),
      max: Math.max(-1, Math.min(1, maxima[level]!)),
    });
    minima[level] = 1;
    maxima[level] = -1;
    frameCounts[level] = 0;
  };
  const chunkCount = Math.ceil(
    reader.plan.sampleFrames / reader.plan.chunkFrames,
  );
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = await reader.readChunk(index);
    if (!chunk.ok) return chunk as Audio200Result<AudioWaveformCache>;
    if (chunk.value === null) {
      return audioFail(
        "AUDIO_SOURCE_UNAVAILABLE",
        "A PCM chunk disappeared while building the waveform cache.",
        "revision.source",
        true,
      );
    }
    for (let frame = 0; frame < chunk.value.frameCount; frame += 1) {
      for (let level = 0; level < bucketSizes.length; level += 1) {
        for (let channel = 0; channel < chunk.value.channels; channel += 1) {
          const value = chunk.value.samples[channel]![frame]!;
          minima[level] = Math.min(minima[level]!, value);
          maxima[level] = Math.max(maxima[level]!, value);
        }
        frameCounts[level] = frameCounts[level]! + 1;
        if (frameCounts[level]! >= bucketSizes[level]!) flush(level);
      }
    }
  }
  for (let level = 0; level < levelCount; level += 1) flush(level);
  const levels: AudioWaveformPeakLevel[] = bucketSizes.map((
    bucketSize,
    level,
  ) => ({
    level,
    bucketSize,
    peaks: peaks[level]!,
  }));
  return audioOk({
    schemaVersion: AUDIO200_WAVEFORM_SCHEMA_VERSION,
    assetId: revision.assetId,
    revisionId: revision.revisionId,
    sourceHash: revision.source.metadata.contentHash,
    sampleRateHz: reader.plan.sampleRateHz,
    channels: reader.plan.channels,
    sampleFrames: reader.plan.sampleFrames,
    levels,
  });
}
