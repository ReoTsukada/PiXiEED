/** Lightweight approximate one-bit delta primitives; not an NES bitstream claim. */

export const DPCM_MAX_SAMPLE_FRAMES = 4_096;

const DPCM_DELTA_STEP = 0.08;
const DPCM_MIN_RATE_HZ = 4_000;
const DPCM_MAX_RATE_HZ = 33_000;
const DPCM_REFERENCE_KEYS = [
  "sampleId",
  "sourceRevisionId",
  "startFrame",
  "frameCount",
  "rateHz",
  "loop",
] as const;
const DPCM_RANGE_REQUIRED_KEYS = [
  "sampleId",
  "sourceRevisionId",
  "startFrame",
  "endFrame",
  "rateHz",
] as const;
const DPCM_QUANTIZED_KEYS = [
  "sampleId",
  "rateHz",
  "loop",
  "packedBits",
  "frameCount",
] as const;

export interface DpcmSampleReference {
  readonly sampleId: string;
  readonly sourceRevisionId: string;
  readonly startFrame: number;
  readonly frameCount: number;
  readonly rateHz: number;
  readonly loop: boolean;
}

export interface DpcmQuantizedSample {
  readonly sampleId: string;
  readonly rateHz: number;
  readonly loop: boolean;
  /** One-bit packed samples; the source PCM is intentionally not retained. */
  readonly packedBits: Uint8Array;
  readonly frameCount: number;
}

export interface DpcmSampleLibrary {
  readonly samples: readonly DpcmSampleReference[];
}

export interface DpcmSampleRangeInput {
  readonly sampleId: string;
  readonly sourceRevisionId: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly rateHz: number;
  readonly loop?: boolean;
}

/** Create a bounded reference from an iAUDIO-selected range without copying PCM. */
export function dpcmSampleReferenceFromRange(input: DpcmSampleRangeInput): DpcmSampleReference | undefined {
  try {
    if (!isRecord(input) || !hasExactKeys(input, DPCM_RANGE_REQUIRED_KEYS, ["loop"])) return undefined;
    if ("loop" in input && typeof input.loop !== "boolean") return undefined;
    if (!Number.isSafeInteger(input.startFrame) || input.startFrame < 0) return undefined;
    if (!Number.isSafeInteger(input.endFrame) || input.endFrame <= input.startFrame) return undefined;
    const frameCount = input.endFrame - input.startFrame;
    if (frameCount > DPCM_MAX_SAMPLE_FRAMES) return undefined;
    const candidate = {
      sampleId: input.sampleId,
      sourceRevisionId: input.sourceRevisionId,
      startFrame: input.startFrame,
      frameCount,
      rateHz: input.rateHz,
      loop: input.loop === true,
    } satisfies DpcmSampleReference;
    return isDpcmSampleReference(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export function createDpcmSampleLibrary(samples: readonly DpcmSampleReference[] = []): DpcmSampleLibrary {
  return { samples: samples.filter(isDpcmSampleReference).map((sample) => ({ ...sample })) };
}

export function upsertDpcmSampleReference(
  library: DpcmSampleLibrary,
  sample: DpcmSampleReference,
): DpcmSampleLibrary {
  if (!isDpcmSampleReference(sample)) return library;
  const samples = library.samples.filter((candidate) => candidate.sampleId !== sample.sampleId);
  return { samples: [...samples, { ...sample }] };
}

export function removeDpcmSampleReference(library: DpcmSampleLibrary, sampleId: string): DpcmSampleLibrary {
  return { samples: library.samples.filter((sample) => sample.sampleId !== sampleId.trim()) };
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.trunc(Number.isFinite(value) ? value : minimum)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return keys.length >= requiredKeys.length &&
    keys.every((key) => requiredKeys.includes(key) || optionalKeys.includes(key)) &&
    requiredKeys.every((key) => keys.includes(key));
}

function isDpcmRate(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= DPCM_MIN_RATE_HZ && value <= DPCM_MAX_RATE_HZ;
}

function boundedPcmLength(pcm: ArrayLike<number>): number {
  let length: unknown;
  try {
    length = (pcm as { readonly length?: unknown }).length;
  } catch {
    return 0;
  }
  if (typeof length !== "number" || Number.isNaN(length) || length <= 0) return 0;
  if (length === Number.POSITIVE_INFINITY) return DPCM_MAX_SAMPLE_FRAMES;
  if (length === Number.NEGATIVE_INFINITY) return 0;
  return Math.min(DPCM_MAX_SAMPLE_FRAMES, Math.floor(length));
}

/** Quantize a short mono PCM slice to the approximate one-bit delta format. */
export function quantizeDpcmSample(
  sampleId: string,
  pcm: ArrayLike<number>,
  rateHz = 16_000,
  loop = false,
): DpcmQuantizedSample {
  const frameCount = boundedPcmLength(pcm);
  const packedBits = new Uint8Array(Math.ceil(frameCount / 8));
  let accumulator = 0;
  for (let index = 0; index < frameCount; index += 1) {
    let value = Number.NaN;
    try {
      value = Number(pcm[index]);
    } catch {
      // A hostile array-like getter is treated as an absent PCM frame.
    }
    const target = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : accumulator;
    if (target >= accumulator) {
      packedBits[index >> 3]! |= 1 << (index & 7);
      accumulator = Math.min(1, accumulator + DPCM_DELTA_STEP);
    } else {
      accumulator = Math.max(-1, accumulator - DPCM_DELTA_STEP);
    }
  }
  return { sampleId: sampleId.trim(), rateHz: boundedInteger(rateHz, 4_000, 33_000), loop, packedBits, frameCount };
}

/** Decode the approximate one-bit delta stream produced by quantizeDpcmSample. */
export function decodeDpcmSample(sample: unknown): Float32Array | undefined {
  if (!isDpcmQuantizedSample(sample)) return undefined;
  const decoded = new Float32Array(sample.frameCount);
  let accumulator = 0;
  for (let index = 0; index < decoded.length; index += 1) {
    const bit = (sample.packedBits[index >> 3]! & (1 << (index & 7))) !== 0;
    accumulator = Math.max(
      -1,
      Math.min(1, accumulator + (bit ? DPCM_DELTA_STEP : -DPCM_DELTA_STEP)),
    );
    decoded[index] = accumulator;
  }
  return decoded;
}

function isDpcmQuantizedSample(value: unknown): value is DpcmQuantizedSample {
  try {
    if (!isRecord(value) || !hasExactKeys(value, DPCM_QUANTIZED_KEYS)) return false;
    const sample = value as Partial<DpcmQuantizedSample>;
    if (typeof sample.sampleId !== "string" || sample.sampleId.trim().length === 0) return false;
    if (!isDpcmRate(sample.rateHz) || typeof sample.loop !== "boolean") return false;
    if (!(sample.packedBits instanceof Uint8Array)) return false;
    const frameCount = sample.frameCount;
    if (typeof frameCount !== "number" || !Number.isSafeInteger(frameCount) || frameCount <= 0 || frameCount > DPCM_MAX_SAMPLE_FRAMES) return false;
    return sample.packedBits.length === Math.ceil(frameCount / 8);
  } catch {
    return false;
  }
}

export function isDpcmSampleReference(value: unknown): value is DpcmSampleReference {
  try {
    if (!isRecord(value) || !hasExactKeys(value, DPCM_REFERENCE_KEYS)) return false;
    const candidate = value as Partial<DpcmSampleReference>;
    const startFrame = candidate.startFrame;
    const frameCount = candidate.frameCount;
    return typeof candidate.sampleId === "string" && candidate.sampleId.trim().length > 0 &&
      typeof candidate.sourceRevisionId === "string" && candidate.sourceRevisionId.trim().length > 0 &&
      typeof startFrame === "number" && Number.isSafeInteger(startFrame) && startFrame >= 0 &&
      typeof frameCount === "number" && Number.isSafeInteger(frameCount) && frameCount > 0 && frameCount <= DPCM_MAX_SAMPLE_FRAMES &&
      isDpcmRate(candidate.rateHz) &&
      typeof candidate.loop === "boolean";
  } catch {
    return false;
  }
}
