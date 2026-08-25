/** Canonical source metadata authority for AUDIO-200. */

import {
  asAudioContentHash,
  AUDIO200_METADATA_AUTHORITY,
  AUDIO200_SUPPORTED_CODECS,
  type Audio200Result,
  type AudioAssetId,
  type AudioAssetKind,
  type AudioCodec,
  type AudioContentHash,
  audioDiagnostic,
  audioFail,
  audioOk,
  type AudioReferenceMode,
  type AudioRevision,
  type AudioRevisionId,
  type AudioSourceBlobLocator,
  type AudioSourceBlobLocatorInput,
  type AudioSourceBlobReference,
  type AudioSourceMetadata,
  type AudioSourcePlacement,
  hasRawAudioPayload,
  type SourceBlobId,
  sourcePathIsSafe,
} from "./contracts.ts";
import { sha256Hex } from "../../wp160-contracts.ts";

export const AUDIO200_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

export interface SourceBlobClaims {
  readonly durationMs?: number;
  readonly sampleRateHz?: number;
  readonly channels?: number;
  readonly byteLength?: number;
  readonly contentHash?: string;
  readonly codec?: AudioCodec;
}

export interface SourceBlobCandidate {
  readonly blobId: SourceBlobId;
  readonly assetId: AudioAssetId;
  readonly revisionId: AudioRevisionId;
  readonly revisionNumber: number;
  readonly kind: AudioAssetKind;
  readonly referenceMode?: AudioReferenceMode;
  readonly locator: AudioSourceBlobLocatorInput;
  /** Raw bytes exist only at this verifier boundary and are never returned. */
  readonly bytes: Uint8Array;
  /** Caller values are assertions only; authority recomputes every field. */
  readonly declared?: SourceBlobClaims;
  readonly createdAt: string;
}

interface ParsedWave {
  readonly codec: "WAV_PCM" | "WAV_IEEE_FLOAT";
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth: 8 | 16 | 24 | 32;
  readonly sampleFrames: number;
  readonly durationUs: number;
  readonly blockAlign: number;
  readonly dataChunks: readonly {
    readonly offset: number;
    readonly length: number;
  }[];
}

export interface AudioWavSampleLayout {
  readonly codec: "WAV_PCM" | "WAV_IEEE_FLOAT";
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth: 8 | 16 | 24 | 32;
  readonly sampleFrames: number;
  readonly durationUs: number;
  readonly blockAlign: number;
  readonly dataChunks: readonly {
    readonly offset: number;
    readonly length: number;
  }[];
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
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

function parseWav(bytes: Uint8Array): Audio200Result<ParsedWave> {
  if (
    bytes.byteLength < 12 || text(bytes, 0, 4) !== "RIFF" ||
    text(bytes, 8, 4) !== "WAVE"
  ) {
    return audioFail(
      "AUDIO_UNSUPPORTED_CODEC",
      "Only RIFF/WAVE PCM fixtures are supported by the AUDIO-200 authority.",
      "source.codec",
    );
  }
  let offset = 12;
  let format: {
    codec: ParsedWave["codec"];
    sampleRateHz: number;
    channels: 1 | 2;
    bitDepth: ParsedWave["bitDepth"];
    blockAlign: number;
  } | null = null;
  let dataBytes = 0;
  const dataChunks: { offset: number; length: number }[] = [];
  while (offset + 8 <= bytes.byteLength) {
    const chunkSize = u32(bytes, offset + 4);
    if (chunkSize === null || chunkSize > bytes.byteLength) {
      return audioFail(
        "AUDIO_INVALID_SOURCE",
        "WAV chunk size is invalid or overflows the source.",
        "source.chunks",
      );
    }
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > bytes.byteLength) {
      return audioFail(
        "AUDIO_INVALID_SOURCE",
        "WAV chunk extends beyond the source bytes.",
        "source.chunks",
      );
    }
    const chunk = text(bytes, offset, 4);
    if (chunk === "fmt ") {
      if (chunkSize < 16) {
        return audioFail(
          "AUDIO_INVALID_SOURCE",
          "WAV fmt chunk is shorter than the PCM contract.",
          "source.fmt",
        );
      }
      const audioFormat = u16(bytes, payloadStart);
      const channels = u16(bytes, payloadStart + 2);
      const sampleRateHz = u32(bytes, payloadStart + 4);
      const byteRate = u32(bytes, payloadStart + 8);
      const blockAlign = u16(bytes, payloadStart + 12);
      const bitDepth = u16(bytes, payloadStart + 14);
      if (audioFormat !== 1 && audioFormat !== 3) {
        return audioFail(
          "AUDIO_UNSUPPORTED_CODEC",
          "WAV codec is not PCM or IEEE float.",
          "source.codec",
        );
      }
      if (channels !== 1 && channels !== 2) {
        return audioFail(
          "AUDIO_INVALID_SOURCE",
          "Only mono and stereo WAV sources are supported.",
          "source.channels",
        );
      }
      if (
        sampleRateHz === null || sampleRateHz < 8_000 || sampleRateHz > 384_000
      ) {
        return audioFail(
          "AUDIO_INVALID_SOURCE",
          "WAV sample rate is outside the safe range.",
          "source.sampleRateHz",
        );
      }
      if (byteRate === null || blockAlign === null || bitDepth === null) {
        return audioFail(
          "AUDIO_INVALID_SOURCE",
          "WAV fmt values are truncated.",
          "source.fmt",
        );
      }
      if (audioFormat === 3 && bitDepth !== 32) {
        return audioFail(
          "AUDIO_UNSUPPORTED_CODEC",
          "Only 32-bit IEEE float WAV is supported.",
          "source.codec",
        );
      }
      if (
        audioFormat === 1 && bitDepth !== 8 && bitDepth !== 16 &&
        bitDepth !== 24 && bitDepth !== 32
      ) {
        return audioFail(
          "AUDIO_UNSUPPORTED_CODEC",
          "WAV PCM bit depth is unsupported.",
          "source.codec",
        );
      }
      const expectedBlockAlign = channels * (bitDepth / 8);
      if (
        !Number.isSafeInteger(expectedBlockAlign) ||
        blockAlign !== expectedBlockAlign ||
        byteRate !== sampleRateHz * blockAlign
      ) {
        return audioFail(
          "AUDIO_INVALID_SOURCE",
          "WAV block alignment or byte rate is inconsistent.",
          "source.fmt",
        );
      }
      format = {
        codec: audioFormat === 1 ? "WAV_PCM" : "WAV_IEEE_FLOAT",
        sampleRateHz,
        channels: channels as 1 | 2,
        bitDepth: bitDepth as ParsedWave["bitDepth"],
        blockAlign,
      };
    } else if (chunk === "data") {
      dataBytes += chunkSize;
      dataChunks.push({ offset: payloadStart, length: chunkSize });
      if (!Number.isSafeInteger(dataBytes)) {
        return audioFail(
          "AUDIO_OVERFLOW",
          "WAV data length overflows the safe integer range.",
          "source.byteLength",
        );
      }
    }
    offset = payloadEnd + (chunkSize % 2);
    if (offset < payloadEnd || offset > bytes.byteLength) {
      return audioFail(
        "AUDIO_OVERFLOW",
        "WAV chunk offset overflowed or points beyond the source.",
        "source.chunks",
      );
    }
  }
  if (format === null || dataBytes < 1) {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "WAV source requires fmt and non-empty data chunks.",
      "source",
    );
  }
  if (dataBytes % format.blockAlign !== 0) {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "WAV data is not aligned to complete sample frames.",
      "source.data",
    );
  }
  const sampleFrames = dataBytes / format.blockAlign;
  const durationUs = Math.floor(
    (sampleFrames * 1_000_000) / format.sampleRateHz,
  );
  if (
    !Number.isSafeInteger(sampleFrames) || !Number.isSafeInteger(durationUs) ||
    durationUs < 1
  ) {
    return audioFail(
      "AUDIO_OVERFLOW",
      "WAV duration cannot be represented safely.",
      "source.durationUs",
    );
  }
  return audioOk({ ...format, sampleFrames, durationUs, dataChunks });
}

export function inspectCanonicalWavLayout(
  bytes: Uint8Array,
): Audio200Result<AudioWavSampleLayout> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "Source bytes must be a non-empty Uint8Array.",
      "bytes",
    );
  }
  const parsed = parseWav(bytes);
  return parsed.ok ? audioOk(parsed.value) : parsed;
}

function locatorValid(locator: unknown): Audio200Result<true> {
  if (
    locator === null || typeof locator !== "object" || Array.isArray(locator)
  ) {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "Audio source locator must be an object.",
      "locator",
    );
  }
  const candidate = locator as Record<string, unknown>;
  if (
    candidate.namespace !== "audio" ||
    typeof candidate.relativePath !== "string" ||
    !sourcePathIsSafe(candidate.relativePath)
  ) {
    return audioFail(
      "AUDIO_PATH_TRAVERSAL",
      "Audio source locator must be a bounded relative audio path.",
      "locator.relativePath",
    );
  }
  if (
    !["MEMORY_PREVIEW", "OPFS", "OBJECT_STORAGE"].includes(
      candidate.placement as string,
    )
  ) {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "Audio source placement is unsupported.",
      "locator.placement",
    );
  }
  return audioOk(true);
}

function metadataClaimsMatch(
  actual: AudioSourceMetadata,
  claims: SourceBlobClaims | undefined,
): Audio200Result<true> {
  if (claims === undefined) return audioOk(true);
  const mismatches: string[] = [];
  const actualDurationMs = actual.durationUs / 1_000;
  if (
    claims.durationMs !== undefined &&
    (!Number.isFinite(claims.durationMs) ||
      Math.round(claims.durationMs * 1_000) !== actual.durationUs)
  ) mismatches.push("durationMs");
  if (
    claims.sampleRateHz !== undefined &&
    claims.sampleRateHz !== actual.sampleRateHz
  ) mismatches.push("sampleRateHz");
  if (claims.channels !== undefined && claims.channels !== actual.channels) {
    mismatches.push("channels");
  }
  if (
    claims.byteLength !== undefined && claims.byteLength !== actual.byteLength
  ) mismatches.push("byteLength");
  if (
    claims.contentHash !== undefined &&
    claims.contentHash !== actual.contentHash
  ) mismatches.push("contentHash");
  if (claims.codec !== undefined && claims.codec !== actual.codec) {
    mismatches.push("codec");
  }
  if (claims.durationMs !== undefined && !Number.isFinite(actualDurationMs)) {
    mismatches.push("durationMs");
  }
  return mismatches.length === 0 ? audioOk(true) : audioFail(
    "AUDIO_METADATA_MISMATCH",
    `Caller metadata disagrees with canonical source metadata: ${
      mismatches.join(", ")
    }.`,
    "declared",
  );
}

export async function inspectSourceBlob(
  bytes: Uint8Array,
): Promise<Audio200Result<AudioSourceMetadata>> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "Source bytes must be a non-empty Uint8Array.",
      "bytes",
    );
  }
  if (bytes.byteLength > AUDIO200_MAX_SOURCE_BYTES) {
    return audioFail(
      "AUDIO_OVERFLOW",
      "Source bytes exceed the isolated AUDIO-200 safety limit.",
      "bytes.byteLength",
    );
  }
  const parsed = parseWav(bytes);
  if (!parsed.ok) return parsed;
  if (!AUDIO200_SUPPORTED_CODECS.includes(parsed.value.codec)) {
    return audioFail(
      "AUDIO_UNSUPPORTED_CODEC",
      "Source codec is not in the AUDIO-200 supported set.",
      "source.codec",
    );
  }
  const contentHash = asAudioContentHash(
    await sha256Hex(new Uint8Array(bytes)),
  );
  return audioOk({
    codec: parsed.value.codec,
    mimeType: "audio/wav",
    sampleRateHz: parsed.value.sampleRateHz,
    channels: parsed.value.channels,
    bitDepth: parsed.value.bitDepth,
    sampleFrames: parsed.value.sampleFrames,
    durationUs: parsed.value.durationUs,
    byteLength: bytes.byteLength,
    contentHash,
  });
}

export function canonicalLocator(
  input: AudioSourceBlobLocatorInput,
  contentHash: AudioContentHash,
  byteLength: number,
): Audio200Result<AudioSourceBlobLocator> {
  const valid = locatorValid(input);
  if (!valid.ok) return valid;
  try {
    asAudioContentHash(contentHash);
  } catch {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "Canonical locator requires a lowercase SHA-256 content hash.",
      "locator.contentHash",
    );
  }
  if (
    !Number.isSafeInteger(byteLength) || byteLength < 1 ||
    byteLength > AUDIO200_MAX_SOURCE_BYTES
  ) {
    return audioFail(
      "AUDIO_INVALID_NUMBER",
      "Canonical locator byteLength must be a positive safe integer.",
      "locator.byteLength",
    );
  }
  return audioOk({ ...input, contentHash, byteLength });
}

export async function canonicalizeSourceBlob(
  candidate: SourceBlobCandidate,
): Promise<Audio200Result<AudioRevision>> {
  if (candidate === null || typeof candidate !== "object") {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "Source candidate must be an object.",
      "candidate",
    );
  }
  if (hasRawAudioPayload(candidate.declared)) {
    return audioFail(
      "AUDIO_RAW_PAYLOAD_REJECTED",
      "Caller metadata cannot contain raw audio payload fields.",
      "declared",
    );
  }
  const locator = locatorValid(candidate.locator);
  if (!locator.ok) return locator;
  if (!(candidate.bytes instanceof Uint8Array)) {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "Source bytes must be a Uint8Array at the verifier boundary.",
      "bytes",
    );
  }
  if (
    typeof candidate.createdAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.createdAt))
  ) {
    return audioFail(
      "AUDIO_INVALID_REVISION",
      "Revision createdAt must be an ISO-compatible timestamp.",
      "createdAt",
    );
  }
  if (
    ![candidate.blobId, candidate.assetId, candidate.revisionId].every((
      value,
    ) => typeof value === "string" && SAFE_ID.test(value))
  ) {
    return audioFail(
      "AUDIO_INVALID_ID",
      "Source candidate identifiers must be bounded stable identifiers.",
      "candidate",
    );
  }
  if (candidate.kind !== "CLIP" && candidate.kind !== "SONG") {
    return audioFail(
      "AUDIO_INVALID_REVISION",
      "Revision kind is unsupported.",
      "kind",
    );
  }
  if (
    candidate.referenceMode !== undefined &&
    !["LIVE", "PINNED", "REVIEW", "FORKED"].includes(candidate.referenceMode)
  ) {
    return audioFail(
      "AUDIO_INVALID_REVISION",
      "Revision reference mode is unsupported.",
      "referenceMode",
    );
  }
  if (
    !Number.isSafeInteger(candidate.revisionNumber) ||
    candidate.revisionNumber < 1
  ) {
    return audioFail(
      "AUDIO_INVALID_REVISION",
      "Revision number must be a positive safe integer.",
      "revisionNumber",
    );
  }
  const metadata = await inspectSourceBlob(candidate.bytes);
  if (!metadata.ok) return metadata;
  const claims = metadataClaimsMatch(metadata.value, candidate.declared);
  if (!claims.ok) return claims;
  const contentHash = metadata.value.contentHash;
  const canonical = canonicalLocator(
    candidate.locator,
    contentHash,
    candidate.bytes.byteLength,
  );
  if (!canonical.ok) return canonical;
  const source: AudioSourceBlobReference = {
    blobId: candidate.blobId,
    locator: canonical.value,
    metadata: metadata.value,
  };
  return audioOk({
    schemaVersion: "AUDIO-200_V1",
    assetId: candidate.assetId,
    revisionId: candidate.revisionId,
    revisionNumber: candidate.revisionNumber,
    kind: candidate.kind,
    referenceMode: candidate.referenceMode ?? "LIVE",
    source,
    metadataAuthority: AUDIO200_METADATA_AUTHORITY,
    createdAt: candidate.createdAt,
    verified: true,
  });
}

export async function verifySourceBlobAgainstRevision(
  bytes: Uint8Array,
  revision: AudioRevision,
): Promise<Audio200Result<true>> {
  const actual = await inspectSourceBlob(bytes);
  if (!actual.ok) return actual;
  const expected = revision.source.metadata;
  const hashOrSizeChanged = actual.value.contentHash !== expected.contentHash ||
    actual.value.byteLength !== expected.byteLength;
  const metadataChanged = actual.value.codec !== expected.codec ||
    actual.value.sampleRateHz !== expected.sampleRateHz ||
    actual.value.channels !== expected.channels ||
    actual.value.bitDepth !== expected.bitDepth ||
    actual.value.sampleFrames !== expected.sampleFrames ||
    actual.value.durationUs !== expected.durationUs;
  if (hashOrSizeChanged) {
    return audioFail(
      "AUDIO_RAW_BLOB_MODIFIED",
      "Raw source bytes do not match the immutable Revision hash or byte length.",
      "source",
    );
  }
  if (metadataChanged) {
    return audioFail(
      "AUDIO_METADATA_MISMATCH",
      "Raw source metadata does not match the immutable Revision metadata.",
      "source.metadata",
    );
  }
  if (
    revision.source.locator.contentHash !== actual.value.contentHash ||
    revision.source.locator.byteLength !== actual.value.byteLength
  ) {
    return audioFail(
      "AUDIO_RAW_BLOB_MODIFIED",
      "Revision locator is inconsistent with the verified source bytes.",
      "source.locator",
    );
  }
  return audioOk(true);
}

export function sourcePlacementIsLocal(
  placement: AudioSourcePlacement,
): boolean {
  return placement === "MEMORY_PREVIEW" || placement === "OPFS";
}
