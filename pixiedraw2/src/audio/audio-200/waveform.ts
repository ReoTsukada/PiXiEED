/** Bounded, host-neutral waveform peak cache and viewport projection. */

import {
  asAudioContentHash,
  AUDIO200_WAVEFORM_SCHEMA_VERSION,
  type Audio200Diagnostic,
  type Audio200Result,
  audioFail,
  audioOk,
  type AudioRevision,
  type AudioWaveformCache,
  type AudioWaveformPeak,
  type AudioWaveformPeakLevel,
} from "./contracts.ts";
import {
  inspectCanonicalWavLayout,
  verifySourceBlobAgainstRevision,
} from "./metadata-authority.ts";
import type { AudioWavSampleLayout } from "./metadata-authority.ts";

const MAX_LEVELS = 10;
const MAX_PEAKS_PER_LEVEL = 131_072;
const MAX_BUCKET_SIZE = 1 << 30;

function fail<T>(
  code: Audio200Diagnostic["code"],
  message: string,
  path: string,
): Audio200Result<T> {
  return audioFail(code, message, path);
}

function finitePeak(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function sampleAt(
  bytes: Uint8Array,
  offset: number,
  codec: "WAV_PCM" | "WAV_IEEE_FLOAT",
  bitDepth: 8 | 16 | 24 | 32,
): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (codec === "WAV_IEEE_FLOAT") {
    return finitePeak(view.getFloat32(offset, true));
  }
  switch (bitDepth) {
    case 8:
      return (bytes[offset]! - 128) / 128;
    case 16:
      return view.getInt16(offset, true) / 32_768;
    case 24: {
      const raw = bytes[offset]! | (bytes[offset + 1]! << 8) |
        (bytes[offset + 2]! << 16);
      const signed = (raw & 0x80_0000) !== 0 ? raw | 0xff00_0000 : raw;
      return signed / 8_388_608;
    }
    case 32:
      return view.getInt32(offset, true) / 2_147_483_648;
  }
}

function normalizeBucketSize(
  sampleFrames: number,
  requested: number,
): number {
  const minimum = Math.max(1, Math.ceil(sampleFrames / MAX_PEAKS_PER_LEVEL));
  return Math.min(MAX_BUCKET_SIZE, Math.max(minimum, Math.trunc(requested)));
}

function buildLevel(
  bytes: Uint8Array,
  layout: AudioWavSampleLayout,
  bucketSize: number,
  level: number,
): AudioWaveformPeakLevel {
  const peaks: AudioWaveformPeak[] = [];
  let min = 1;
  let max = -1;
  let framesInBucket = 0;
  const bytesPerSample = layout.bitDepth / 8;
  const frameBytes = layout.blockAlign;
  const flush = (): void => {
    if (framesInBucket === 0) return;
    peaks.push({ min: finitePeak(min), max: finitePeak(max) });
    min = 1;
    max = -1;
    framesInBucket = 0;
  };
  for (const chunk of layout.dataChunks) {
    const chunkFrames = Math.floor(chunk.length / frameBytes);
    for (let localFrame = 0; localFrame < chunkFrames; localFrame += 1) {
      const frameOffset = chunk.offset + localFrame * frameBytes;
      for (let channel = 0; channel < layout.channels; channel += 1) {
        const value = sampleAt(
          bytes,
          frameOffset + channel * bytesPerSample,
          layout.codec,
          layout.bitDepth,
        );
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      framesInBucket += 1;
      if (framesInBucket >= bucketSize) flush();
    }
  }
  flush();
  return {
    level,
    bucketSize,
    peaks,
  };
}

export interface AudioWaveformBuildOptions {
  readonly baseBucketSize?: number;
  readonly levels?: number;
}

export async function buildAudioWaveformPeakCache(
  bytes: Uint8Array,
  revision: AudioRevision,
  options: AudioWaveformBuildOptions = {},
): Promise<Audio200Result<AudioWaveformCache>> {
  const verified = await verifySourceBlobAgainstRevision(bytes, revision);
  if (!verified.ok) return verified;
  const layout = inspectCanonicalWavLayout(bytes);
  if (!layout.ok) return layout;
  const base = options.baseBucketSize ?? 256;
  const levelCount = options.levels ?? 8;
  if (
    !Number.isSafeInteger(base) || base < 1 || base > MAX_BUCKET_SIZE ||
    !Number.isSafeInteger(levelCount) || levelCount < 1 ||
    levelCount > MAX_LEVELS
  ) {
    return fail(
      "AUDIO_INVALID_WAVEFORM",
      "Waveform bucket size or level count is outside the safe range.",
      "options",
    );
  }
  const levels: AudioWaveformPeakLevel[] = [];
  for (let index = 0; index < levelCount; index += 1) {
    const requested = base * (2 ** index);
    const bucketSize = normalizeBucketSize(
      layout.value.sampleFrames,
      requested,
    );
    levels.push(buildLevel(bytes, layout.value, bucketSize, index));
  }
  return audioOk({
    schemaVersion: AUDIO200_WAVEFORM_SCHEMA_VERSION,
    assetId: revision.assetId,
    revisionId: revision.revisionId,
    sourceHash: revision.source.metadata.contentHash,
    sampleRateHz: layout.value.sampleRateHz,
    channels: layout.value.channels,
    sampleFrames: layout.value.sampleFrames,
    levels,
  });
}

export function validateAudioWaveformCache(
  value: unknown,
): Audio200Result<AudioWaveformCache> {
  if (
    value === null || typeof value !== "object" || Array.isArray(value)
  ) {
    return fail(
      "AUDIO_INVALID_WAVEFORM",
      "Waveform cache must be an object.",
      "cache",
    );
  }
  const item = value as Record<string, unknown>;
  if (
    item.schemaVersion !== AUDIO200_WAVEFORM_SCHEMA_VERSION ||
    typeof item.assetId !== "string" || typeof item.revisionId !== "string" ||
    typeof item.sourceHash !== "string" ||
    typeof item.sampleRateHz !== "number" ||
    ![1, 2].includes(item.channels as number) ||
    !Number.isSafeInteger(item.sampleFrames) ||
    typeof item.sampleFrames !== "number" || item.sampleFrames < 1 ||
    !Array.isArray(item.levels)
  ) {
    return fail(
      "AUDIO_INVALID_WAVEFORM",
      "Waveform cache metadata is invalid.",
      "cache",
    );
  }
  try {
    asAudioContentHash(item.sourceHash);
  } catch {
    return fail(
      "AUDIO_INVALID_WAVEFORM",
      "Waveform source hash is invalid.",
      "cache.sourceHash",
    );
  }
  let previousBucket = 0;
  for (const [index, level] of (item.levels as readonly unknown[]).entries()) {
    const candidate = level as Record<string, unknown> | null;
    if (
      candidate === null || typeof candidate !== "object" ||
      !Number.isSafeInteger(candidate.level) ||
      typeof candidate.level !== "number" ||
      candidate.level < 0 ||
      !Number.isSafeInteger(candidate.bucketSize) ||
      typeof candidate.bucketSize !== "number" ||
      candidate.bucketSize < 1 || candidate.bucketSize < previousBucket ||
      !Array.isArray(candidate.peaks) ||
      (candidate.peaks as readonly unknown[]).some((peak) => {
        const itemPeak = peak as Record<string, unknown> | null;
        return itemPeak === null || typeof itemPeak !== "object" ||
          typeof itemPeak.min !== "number" ||
          typeof itemPeak.max !== "number" ||
          !Number.isFinite(itemPeak.min) || !Number.isFinite(itemPeak.max) ||
          itemPeak.min < -1 || itemPeak.min > 1 || itemPeak.max < -1 ||
          itemPeak.max > 1 ||
          itemPeak.min > itemPeak.max;
      })
    ) {
      return fail(
        "AUDIO_INVALID_WAVEFORM",
        "Waveform peak level is invalid.",
        `cache.levels[${index}]`,
      );
    }
    previousBucket = candidate.bucketSize;
  }
  return audioOk(value as AudioWaveformCache);
}

export function selectAudioWaveformLevel(
  cache: AudioWaveformCache,
  samplesPerPixel: number,
): Audio200Result<AudioWaveformPeakLevel> {
  const valid = validateAudioWaveformCache(cache);
  if (!valid.ok) return valid;
  if (!Number.isFinite(samplesPerPixel) || samplesPerPixel <= 0) {
    return fail(
      "AUDIO_INVALID_WAVEFORM",
      "samplesPerPixel must be positive.",
      "samplesPerPixel",
    );
  }
  const selected =
    cache.levels.find((level) => level.bucketSize >= samplesPerPixel) ??
      cache.levels[cache.levels.length - 1];
  return selected === undefined
    ? fail(
      "AUDIO_INVALID_WAVEFORM",
      "Waveform cache has no levels.",
      "cache.levels",
    )
    : audioOk(selected);
}

export function projectAudioWaveformViewport(
  cache: AudioWaveformCache,
  startFrame: number,
  endFrame: number,
  pixelWidth: number,
): Audio200Result<readonly AudioWaveformPeak[]> {
  const valid = validateAudioWaveformCache(cache);
  if (!valid.ok) return valid;
  if (
    !Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrame) ||
    startFrame < 0 || endFrame <= startFrame || endFrame > cache.sampleFrames ||
    !Number.isSafeInteger(pixelWidth) || pixelWidth < 1 || pixelWidth > 16_384
  ) {
    return fail(
      "AUDIO_INVALID_WAVEFORM",
      "Waveform viewport bounds are invalid.",
      "viewport",
    );
  }
  const samplesPerPixel = (endFrame - startFrame) / pixelWidth;
  const level = selectAudioWaveformLevel(cache, samplesPerPixel);
  if (!level.ok) return level;
  const result: AudioWaveformPeak[] = [];
  for (let pixel = 0; pixel < pixelWidth; pixel += 1) {
    const from = startFrame + (pixel * (endFrame - startFrame)) / pixelWidth;
    const to = startFrame +
      ((pixel + 1) * (endFrame - startFrame)) / pixelWidth;
    const firstBucket = Math.floor(from / level.value.bucketSize);
    const lastBucket = Math.max(
      firstBucket,
      Math.ceil(to / level.value.bucketSize) - 1,
    );
    let min = 1;
    let max = -1;
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      const peak = level.value.peaks[bucket];
      if (peak === undefined) continue;
      min = Math.min(min, peak.min);
      max = Math.max(max, peak.max);
    }
    result.push({ min: finitePeak(min), max: finitePeak(max) });
  }
  return audioOk(result);
}
