// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var SHA256 = /^[a-f0-9]{64}$/;
function asSha256(value, label = "Hash") {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}
var DEFAULT_WP160_FEATURE_FLAGS = Object.freeze({
  "game-core-read": false,
  "game-core-write": false,
  "runtime-preview": false,
  "runtime-execution": false,
  "game-build": false,
  "game-build-cache": false,
  "game-publish": false
});
function jsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not accept non-finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => jsonValue(item));
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== void 0) result[key] = jsonValue(item);
    }
    return result;
  }
  throw new Error("Canonical JSON accepts only JSON-compatible values.");
}
function canonicalJson(value) {
  return JSON.stringify(jsonValue(value));
}
async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hashCanonical(value) {
  return asSha256(await sha256Hex(canonicalJson(value)), "ContentHash");
}

// src/audio/audio-200/contracts.ts
var AUDIO200_METADATA_AUTHORITY = "AUDIO-200_CANONICAL_METADATA_V1";
var AUDIO200_SUPPORTED_CODECS = [
  "WAV_PCM",
  "WAV_IEEE_FLOAT"
];
function audioOk(value, diagnostics = []) {
  return {
    ok: true,
    value,
    diagnostics
  };
}
function audioFail(code, message, path, recoverable = false) {
  const diagnostic = {
    code,
    message,
    ...path === void 0 ? {} : {
      path
    },
    recoverable
  };
  return {
    ok: false,
    diagnostics: [
      diagnostic
    ]
  };
}
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var SHA2562 = /^[a-f0-9]{64}$/;
var RAW_AUDIO_KEYS = /* @__PURE__ */ new Set([
  "arrayBuffer",
  "base64",
  "blob",
  "bytes",
  "dataUrl",
  "pcm",
  "samples"
]);
function brandId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value.trim())) {
    throw new Error(`${label} must be a stable non-empty identifier.`);
  }
  return value;
}
function asAudioAssetId(value) {
  return brandId(value, "AudioAssetId");
}
function asAudioRevisionId(value) {
  return brandId(value, "AudioRevisionId");
}
function asAudioClipId(value) {
  return brandId(value, "AudioClipId");
}
function asSourceBlobId(value) {
  return brandId(value, "SourceBlobId");
}
function asAudioContentHash(value) {
  if (!SHA2562.test(value)) {
    throw new Error("AudioContentHash must be a lowercase SHA-256 hash.");
  }
  return value;
}
function asAudioTick(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 9e9) {
    throw new Error("AudioTick must be a bounded non-negative safe integer.");
  }
  return value;
}
function hasRawAudioPayload(value) {
  if (value === null || value === void 0) return false;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return true;
  if (Array.isArray(value)) {
    return value.some((item) => hasRawAudioPayload(item));
  }
  if (typeof value !== "object") return false;
  return Object.entries(value).some(([key, item]) => RAW_AUDIO_KEYS.has(key) || hasRawAudioPayload(item));
}
function sourcePathIsSafe(relativePath) {
  if (!relativePath || relativePath.length > 512 || relativePath.includes("\\") || relativePath.includes("\0")) return false;
  if (relativePath.startsWith("/") || relativePath.startsWith("~") || relativePath.includes("://")) return false;
  const segments = relativePath.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

// src/audio/audio-200/metadata-authority.ts
var AUDIO200_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
var SAFE_ID2 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
function text(bytes, offset, length) {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function u16(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return bytes[offset] | bytes[offset + 1] << 8;
}
function u32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
}
function parseWav(bytes) {
  if (bytes.byteLength < 12 || text(bytes, 0, 4) !== "RIFF" || text(bytes, 8, 4) !== "WAVE") {
    return audioFail("AUDIO_UNSUPPORTED_CODEC", "Only RIFF/WAVE PCM fixtures are supported by the AUDIO-200 authority.", "source.codec");
  }
  let offset = 12;
  let format = null;
  let dataBytes = 0;
  const dataChunks = [];
  while (offset + 8 <= bytes.byteLength) {
    const chunkSize = u32(bytes, offset + 4);
    if (chunkSize === null || chunkSize > bytes.byteLength) {
      return audioFail("AUDIO_INVALID_SOURCE", "WAV chunk size is invalid or overflows the source.", "source.chunks");
    }
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > bytes.byteLength) {
      return audioFail("AUDIO_INVALID_SOURCE", "WAV chunk extends beyond the source bytes.", "source.chunks");
    }
    const chunk = text(bytes, offset, 4);
    if (chunk === "fmt ") {
      if (chunkSize < 16) {
        return audioFail("AUDIO_INVALID_SOURCE", "WAV fmt chunk is shorter than the PCM contract.", "source.fmt");
      }
      const audioFormat = u16(bytes, payloadStart);
      const channels = u16(bytes, payloadStart + 2);
      const sampleRateHz = u32(bytes, payloadStart + 4);
      const byteRate = u32(bytes, payloadStart + 8);
      const blockAlign = u16(bytes, payloadStart + 12);
      const bitDepth = u16(bytes, payloadStart + 14);
      if (audioFormat !== 1 && audioFormat !== 3) {
        return audioFail("AUDIO_UNSUPPORTED_CODEC", "WAV codec is not PCM or IEEE float.", "source.codec");
      }
      if (channels !== 1 && channels !== 2) {
        return audioFail("AUDIO_INVALID_SOURCE", "Only mono and stereo WAV sources are supported.", "source.channels");
      }
      if (sampleRateHz === null || sampleRateHz < 8e3 || sampleRateHz > 384e3) {
        return audioFail("AUDIO_INVALID_SOURCE", "WAV sample rate is outside the safe range.", "source.sampleRateHz");
      }
      if (byteRate === null || blockAlign === null || bitDepth === null) {
        return audioFail("AUDIO_INVALID_SOURCE", "WAV fmt values are truncated.", "source.fmt");
      }
      if (audioFormat === 3 && bitDepth !== 32) {
        return audioFail("AUDIO_UNSUPPORTED_CODEC", "Only 32-bit IEEE float WAV is supported.", "source.codec");
      }
      if (audioFormat === 1 && bitDepth !== 8 && bitDepth !== 16 && bitDepth !== 24 && bitDepth !== 32) {
        return audioFail("AUDIO_UNSUPPORTED_CODEC", "WAV PCM bit depth is unsupported.", "source.codec");
      }
      const expectedBlockAlign = channels * (bitDepth / 8);
      if (!Number.isSafeInteger(expectedBlockAlign) || blockAlign !== expectedBlockAlign || byteRate !== sampleRateHz * blockAlign) {
        return audioFail("AUDIO_INVALID_SOURCE", "WAV block alignment or byte rate is inconsistent.", "source.fmt");
      }
      format = {
        codec: audioFormat === 1 ? "WAV_PCM" : "WAV_IEEE_FLOAT",
        sampleRateHz,
        channels,
        bitDepth,
        blockAlign
      };
    } else if (chunk === "data") {
      dataBytes += chunkSize;
      dataChunks.push({
        offset: payloadStart,
        length: chunkSize
      });
      if (!Number.isSafeInteger(dataBytes)) {
        return audioFail("AUDIO_OVERFLOW", "WAV data length overflows the safe integer range.", "source.byteLength");
      }
    }
    offset = payloadEnd + chunkSize % 2;
    if (offset < payloadEnd || offset > bytes.byteLength) {
      return audioFail("AUDIO_OVERFLOW", "WAV chunk offset overflowed or points beyond the source.", "source.chunks");
    }
  }
  if (format === null || dataBytes < 1) {
    return audioFail("AUDIO_INVALID_SOURCE", "WAV source requires fmt and non-empty data chunks.", "source");
  }
  if (dataBytes % format.blockAlign !== 0) {
    return audioFail("AUDIO_INVALID_SOURCE", "WAV data is not aligned to complete sample frames.", "source.data");
  }
  const sampleFrames = dataBytes / format.blockAlign;
  const durationUs = Math.floor(sampleFrames * 1e6 / format.sampleRateHz);
  if (!Number.isSafeInteger(sampleFrames) || !Number.isSafeInteger(durationUs) || durationUs < 1) {
    return audioFail("AUDIO_OVERFLOW", "WAV duration cannot be represented safely.", "source.durationUs");
  }
  return audioOk({
    ...format,
    sampleFrames,
    durationUs,
    dataChunks
  });
}
function locatorValid(locator) {
  if (locator === null || typeof locator !== "object" || Array.isArray(locator)) {
    return audioFail("AUDIO_INVALID_SOURCE", "Audio source locator must be an object.", "locator");
  }
  const candidate = locator;
  if (candidate.namespace !== "audio" || typeof candidate.relativePath !== "string" || !sourcePathIsSafe(candidate.relativePath)) {
    return audioFail("AUDIO_PATH_TRAVERSAL", "Audio source locator must be a bounded relative audio path.", "locator.relativePath");
  }
  if (![
    "MEMORY_PREVIEW",
    "OPFS",
    "OBJECT_STORAGE"
  ].includes(candidate.placement)) {
    return audioFail("AUDIO_INVALID_SOURCE", "Audio source placement is unsupported.", "locator.placement");
  }
  return audioOk(true);
}
function metadataClaimsMatch(actual, claims) {
  if (claims === void 0) return audioOk(true);
  const mismatches = [];
  const actualDurationMs = actual.durationUs / 1e3;
  if (claims.durationMs !== void 0 && (!Number.isFinite(claims.durationMs) || Math.round(claims.durationMs * 1e3) !== actual.durationUs)) mismatches.push("durationMs");
  if (claims.sampleRateHz !== void 0 && claims.sampleRateHz !== actual.sampleRateHz) mismatches.push("sampleRateHz");
  if (claims.channels !== void 0 && claims.channels !== actual.channels) {
    mismatches.push("channels");
  }
  if (claims.byteLength !== void 0 && claims.byteLength !== actual.byteLength) mismatches.push("byteLength");
  if (claims.contentHash !== void 0 && claims.contentHash !== actual.contentHash) mismatches.push("contentHash");
  if (claims.codec !== void 0 && claims.codec !== actual.codec) {
    mismatches.push("codec");
  }
  if (claims.durationMs !== void 0 && !Number.isFinite(actualDurationMs)) {
    mismatches.push("durationMs");
  }
  return mismatches.length === 0 ? audioOk(true) : audioFail("AUDIO_METADATA_MISMATCH", `Caller metadata disagrees with canonical source metadata: ${mismatches.join(", ")}.`, "declared");
}
async function inspectSourceBlob(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) {
    return audioFail("AUDIO_INVALID_SOURCE", "Source bytes must be a non-empty Uint8Array.", "bytes");
  }
  if (bytes.byteLength > AUDIO200_MAX_SOURCE_BYTES) {
    return audioFail("AUDIO_OVERFLOW", "Source bytes exceed the isolated AUDIO-200 safety limit.", "bytes.byteLength");
  }
  const parsed = parseWav(bytes);
  if (!parsed.ok) return parsed;
  if (!AUDIO200_SUPPORTED_CODECS.includes(parsed.value.codec)) {
    return audioFail("AUDIO_UNSUPPORTED_CODEC", "Source codec is not in the AUDIO-200 supported set.", "source.codec");
  }
  const contentHash = asAudioContentHash(await sha256Hex(new Uint8Array(bytes)));
  return audioOk({
    codec: parsed.value.codec,
    mimeType: "audio/wav",
    sampleRateHz: parsed.value.sampleRateHz,
    channels: parsed.value.channels,
    bitDepth: parsed.value.bitDepth,
    sampleFrames: parsed.value.sampleFrames,
    durationUs: parsed.value.durationUs,
    byteLength: bytes.byteLength,
    contentHash
  });
}
function canonicalLocator(input, contentHash, byteLength) {
  const valid = locatorValid(input);
  if (!valid.ok) return valid;
  try {
    asAudioContentHash(contentHash);
  } catch {
    return audioFail("AUDIO_INVALID_SOURCE", "Canonical locator requires a lowercase SHA-256 content hash.", "locator.contentHash");
  }
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > AUDIO200_MAX_SOURCE_BYTES) {
    return audioFail("AUDIO_INVALID_NUMBER", "Canonical locator byteLength must be a positive safe integer.", "locator.byteLength");
  }
  return audioOk({
    ...input,
    contentHash,
    byteLength
  });
}
async function canonicalizeSourceBlob(candidate) {
  if (candidate === null || typeof candidate !== "object") {
    return audioFail("AUDIO_INVALID_SOURCE", "Source candidate must be an object.", "candidate");
  }
  if (hasRawAudioPayload(candidate.declared)) {
    return audioFail("AUDIO_RAW_PAYLOAD_REJECTED", "Caller metadata cannot contain raw audio payload fields.", "declared");
  }
  const locator = locatorValid(candidate.locator);
  if (!locator.ok) return locator;
  if (!(candidate.bytes instanceof Uint8Array)) {
    return audioFail("AUDIO_INVALID_SOURCE", "Source bytes must be a Uint8Array at the verifier boundary.", "bytes");
  }
  if (typeof candidate.createdAt !== "string" || !Number.isFinite(Date.parse(candidate.createdAt))) {
    return audioFail("AUDIO_INVALID_REVISION", "Revision createdAt must be an ISO-compatible timestamp.", "createdAt");
  }
  if (![
    candidate.blobId,
    candidate.assetId,
    candidate.revisionId
  ].every((value) => typeof value === "string" && SAFE_ID2.test(value))) {
    return audioFail("AUDIO_INVALID_ID", "Source candidate identifiers must be bounded stable identifiers.", "candidate");
  }
  if (candidate.kind !== "CLIP" && candidate.kind !== "SONG") {
    return audioFail("AUDIO_INVALID_REVISION", "Revision kind is unsupported.", "kind");
  }
  if (candidate.referenceMode !== void 0 && ![
    "LIVE",
    "PINNED",
    "REVIEW",
    "FORKED"
  ].includes(candidate.referenceMode)) {
    return audioFail("AUDIO_INVALID_REVISION", "Revision reference mode is unsupported.", "referenceMode");
  }
  if (!Number.isSafeInteger(candidate.revisionNumber) || candidate.revisionNumber < 1) {
    return audioFail("AUDIO_INVALID_REVISION", "Revision number must be a positive safe integer.", "revisionNumber");
  }
  const metadata = await inspectSourceBlob(candidate.bytes);
  if (!metadata.ok) return metadata;
  const claims = metadataClaimsMatch(metadata.value, candidate.declared);
  if (!claims.ok) return claims;
  const contentHash = metadata.value.contentHash;
  const canonical = canonicalLocator(candidate.locator, contentHash, candidate.bytes.byteLength);
  if (!canonical.ok) return canonical;
  const source = {
    blobId: candidate.blobId,
    locator: canonical.value,
    metadata: metadata.value
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
    verified: true
  });
}

// src/audio/audio-200/audio-asset-store.ts
var AUDIO200_MAX_RANGE_BYTES = 4 * 1024 * 1024;

// src/audio/audio-200/waveform.ts
var MAX_BUCKET_SIZE = 1 << 30;

// src/audio/audio-200/streaming.ts
var DEFAULT_SHORT_BYTES = 8 * 1024 * 1024;
var DEFAULT_SHORT_SECONDS = 30;
var DEFAULT_CHUNK_SECONDS = 2;
var DEFAULT_READ_AHEAD_CHUNKS = 2;
var DEFAULT_MAX_CACHED_CHUNKS = 4;
var HEADER_WINDOW_BYTES = 64 * 1024;
var MAX_HEADER_WINDOW_BYTES = 1024 * 1024;
function u162(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return bytes[offset] | bytes[offset + 1] << 8;
}
function u322(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
}
function text2(bytes, offset, length) {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    return "";
  }
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function boundedPositive(value, fallback) {
  return value !== void 0 && Number.isFinite(value) && value > 0 ? value : fallback;
}
function boundedInteger(value, fallback, minimum, maximum) {
  const candidate = value !== void 0 && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(maximum, Math.max(minimum, candidate));
}
function unavailable(message, path = "revision.source") {
  return audioFail("AUDIO_SOURCE_UNAVAILABLE", message, path, true);
}
async function scanWavHeader(store, revision, maxRangeBytes) {
  const sourceBytes = revision.source.metadata.byteLength;
  const read = async (offset2, length) => {
    if (length < 1 || length > maxRangeBytes || offset2 < 0 || !Number.isSafeInteger(offset2) || !Number.isSafeInteger(length) || offset2 + length > sourceBytes) {
      return audioFail("AUDIO_INVALID_NUMBER", "WAV header range is outside the immutable source.", "revision.source");
    }
    const result = await store.getRange(revision, offset2, length);
    if (!result.ok) return result;
    if (result.value === null) {
      return unavailable("Audio source is unavailable.");
    }
    if (result.value.byteLength !== length) {
      return audioFail("AUDIO_RAW_BLOB_MODIFIED", "Audio byte store returned a truncated range.", "revision.source");
    }
    return audioOk(result.value, result.diagnostics);
  };
  const firstLength = Math.min(sourceBytes, HEADER_WINDOW_BYTES, maxRangeBytes);
  const first = await read(0, firstLength);
  if (!first.ok) return first;
  if (text2(first.value, 0, 4) !== "RIFF" || text2(first.value, 8, 4) !== "WAVE") {
    return audioFail("AUDIO_UNSUPPORTED_CODEC", "Only RIFF/WAVE PCM fixtures are supported by the streaming reader.", "revision.source.metadata.codec");
  }
  let windowOffset = 0;
  let window = first.value;
  const ensure = async (offset2, length) => {
    if (offset2 >= windowOffset && offset2 + length <= windowOffset + window.length) {
      return audioOk(window.subarray(offset2 - windowOffset, offset2 - windowOffset + length));
    }
    const nextLength = Math.min(Math.max(length, HEADER_WINDOW_BYTES), sourceBytes - offset2, maxRangeBytes);
    const next = await read(offset2, nextLength);
    if (!next.ok) return next;
    windowOffset = offset2;
    window = next.value;
    if (length > window.length) {
      return audioFail("AUDIO_INVALID_SOURCE", "WAV header field is truncated.", "revision.source");
    }
    return audioOk(window.subarray(0, length), next.diagnostics);
  };
  let offset = 12;
  let format;
  const dataChunks = [];
  while (offset + 8 <= sourceBytes) {
    const header = await ensure(offset, 8);
    if (!header.ok) return header;
    const chunkSize = u322(header.value, 4);
    if (chunkSize === null) {
      return audioFail("AUDIO_INVALID_SOURCE", "WAV chunk header is truncated.", "revision.source.chunks");
    }
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > sourceBytes) {
      return audioFail("AUDIO_INVALID_SOURCE", "WAV chunk extends beyond the immutable source.", "revision.source.chunks");
    }
    const chunk = text2(header.value, 0, 4);
    if (chunk === "fmt ") {
      if (chunkSize < 16) {
        return audioFail("AUDIO_INVALID_SOURCE", "WAV fmt chunk is shorter than the PCM contract.", "revision.source.fmt");
      }
      const fmt = await ensure(payloadStart, 16);
      if (!fmt.ok) return fmt;
      const audioFormat = u162(fmt.value, 0);
      const channels = u162(fmt.value, 2);
      const sampleRateHz = u322(fmt.value, 4);
      const byteRate = u322(fmt.value, 8);
      const blockAlign = u162(fmt.value, 12);
      const bitDepth = u162(fmt.value, 14);
      if (audioFormat !== 1 && audioFormat !== 3 || channels !== 1 && channels !== 2 || sampleRateHz === null || sampleRateHz < 8e3 || sampleRateHz > 384e3 || byteRate === null || blockAlign === null || bitDepth === null) {
        return audioFail("AUDIO_INVALID_SOURCE", "WAV fmt values are outside the canonical Audio-200 range.", "revision.source.fmt");
      }
      if (audioFormat === 3 && bitDepth !== 32 || audioFormat === 1 && bitDepth !== 8 && bitDepth !== 16 && bitDepth !== 24 && bitDepth !== 32) {
        return audioFail("AUDIO_UNSUPPORTED_CODEC", "WAV bit depth is unsupported by the streaming decoder.", "revision.source.codec");
      }
      const expectedBlockAlign = channels * (bitDepth / 8);
      if (blockAlign !== expectedBlockAlign || byteRate !== sampleRateHz * blockAlign) {
        return audioFail("AUDIO_INVALID_SOURCE", "WAV block alignment or byte rate is inconsistent.", "revision.source.fmt");
      }
      format = {
        codec: audioFormat === 1 ? "WAV_PCM" : "WAV_IEEE_FLOAT",
        sampleRateHz,
        channels,
        bitDepth,
        blockAlign
      };
    } else if (chunk === "data") {
      dataChunks.push({
        offset: payloadStart,
        length: chunkSize
      });
    }
    const next = payloadEnd + chunkSize % 2;
    if (!Number.isSafeInteger(next) || next <= offset || next > sourceBytes + 1) {
      return audioFail("AUDIO_OVERFLOW", "WAV chunk offset overflowed the source boundary.", "revision.source.chunks");
    }
    offset = next;
    if (format !== void 0 && dataChunks.length > 0 && offset >= sourceBytes) {
      break;
    }
  }
  if (format === void 0 || dataChunks.length === 0) {
    return audioFail("AUDIO_INVALID_SOURCE", "WAV source requires fmt and data chunks.", "revision.source");
  }
  const dataBytes = dataChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const expectedDataBytes = revision.source.metadata.sampleFrames * format.blockAlign;
  if (!Number.isSafeInteger(dataBytes) || dataBytes !== expectedDataBytes || dataChunks.some((chunk) => chunk.length % format.blockAlign !== 0)) {
    return audioFail("AUDIO_METADATA_MISMATCH", "WAV data chunks do not match canonical sample-frame metadata.", "revision.source.metadata");
  }
  const metadata = revision.source.metadata;
  if (format.codec !== metadata.codec || format.sampleRateHz !== metadata.sampleRateHz || format.channels !== metadata.channels || format.bitDepth !== metadata.bitDepth) {
    return audioFail("AUDIO_METADATA_MISMATCH", "WAV header does not match the immutable Revision metadata.", "revision.source.metadata");
  }
  return audioOk({
    ...format,
    dataChunks
  });
}
function decodeSample(bytes, offset, codec, bitDepth) {
  if (codec === "WAV_IEEE_FLOAT") {
    const value2 = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(offset, true);
    return Number.isFinite(value2) ? Math.max(-1, Math.min(1, value2)) : 0;
  }
  if (bitDepth === 8) return (bytes[offset] - 128) / 128;
  if (bitDepth === 16) {
    const value2 = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt16(offset, true);
    return value2 / 32768;
  }
  if (bitDepth === 24) {
    const value2 = bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
    const signed = (value2 & 8388608) !== 0 ? value2 | 4278190080 : value2;
    return signed / 8388608;
  }
  const value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, true);
  return value / 2147483648;
}
function normalizeOptions(options) {
  const maxRangeBytes = boundedInteger(options.maxRangeBytes, AUDIO200_MAX_RANGE_BYTES, 1024, AUDIO200_MAX_RANGE_BYTES);
  return {
    shortAudioMaxBytes: boundedInteger(options.shortAudioMaxBytes, DEFAULT_SHORT_BYTES, 1, 64 * 1024 * 1024),
    shortAudioMaxSeconds: boundedPositive(options.shortAudioMaxSeconds, DEFAULT_SHORT_SECONDS),
    chunkSeconds: boundedPositive(options.chunkSeconds, DEFAULT_CHUNK_SECONDS),
    readAheadChunks: boundedInteger(options.readAheadChunks, DEFAULT_READ_AHEAD_CHUNKS, 0, 16),
    maxCachedChunks: boundedInteger(options.maxCachedChunks, DEFAULT_MAX_CACHED_CHUNKS, 1, 64),
    maxRangeBytes
  };
}
async function createAudioPcmChunkReader(store, revision, options = {}) {
  const normalized = normalizeOptions(options);
  const metadata = revision.source.metadata;
  if (metadata.codec !== "WAV_PCM" && metadata.codec !== "WAV_IEEE_FLOAT") {
    return audioFail("AUDIO_UNSUPPORTED_CODEC", "The bounded streaming reader currently supports canonical WAV PCM only.", "revision.source.metadata.codec");
  }
  const layout = await scanWavHeader(store, revision, normalized.maxRangeBytes);
  if (!layout.ok) return layout;
  const frameBytes = layout.value.blockAlign;
  const maxFramesPerRange = Math.max(1, Math.floor(normalized.maxRangeBytes / frameBytes));
  const canFullDecode = metadata.byteLength <= normalized.shortAudioMaxBytes && metadata.durationUs / 1e6 <= normalized.shortAudioMaxSeconds && metadata.sampleFrames <= maxFramesPerRange;
  const requestedChunkFrames = Math.max(1, Math.round(metadata.sampleRateHz * normalized.chunkSeconds));
  const chunkFrames = canFullDecode ? metadata.sampleFrames : Math.min(requestedChunkFrames, maxFramesPerRange);
  const durationSeconds = metadata.sampleFrames / metadata.sampleRateHz;
  const plan = {
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
    dataChunks: layout.value.dataChunks
  };
  const cache = /* @__PURE__ */ new Map();
  const inFlight = /* @__PURE__ */ new Map();
  let generation = 0;
  const readChunk = async (index) => {
    if (!Number.isSafeInteger(index) || index < 0) {
      return audioFail("AUDIO_INVALID_NUMBER", "Chunk index is invalid.", "index");
    }
    const startFrame = index * plan.chunkFrames;
    if (startFrame >= plan.sampleFrames) return audioOk(null);
    const cached = cache.get(index);
    if (cached !== void 0) {
      cache.delete(index);
      cache.set(index, cached);
      return audioOk(cached);
    }
    const pending = inFlight.get(index);
    if (pending !== void 0 && pending.generation === generation) {
      return pending.promise;
    }
    const requestGeneration = generation;
    const request = (async () => {
      const frameCount = Math.min(plan.chunkFrames, plan.sampleFrames - startFrame);
      const samples = Array.from({
        length: plan.channels
      }, () => new Float32Array(frameCount));
      let sourceFrameCursor = 0;
      let destinationFrameCursor = 0;
      for (const dataChunk of plan.dataChunks) {
        const dataChunkFrames = dataChunk.length / plan.frameBytes;
        const overlapStart = Math.max(startFrame, sourceFrameCursor);
        const overlapEnd = Math.min(startFrame + frameCount, sourceFrameCursor + dataChunkFrames);
        if (overlapEnd > overlapStart) {
          const frames = overlapEnd - overlapStart;
          const byteOffset = dataChunk.offset + (overlapStart - sourceFrameCursor) * plan.frameBytes;
          const byteLength = frames * plan.frameBytes;
          const bytes = await store.getRange(revision, byteOffset, byteLength);
          if (!bytes.ok) return bytes;
          if (bytes.value === null) {
            return unavailable("Audio source is unavailable.");
          }
          if (bytes.value.byteLength !== byteLength) {
            return audioFail("AUDIO_RAW_BLOB_MODIFIED", "Audio byte store returned a truncated PCM chunk.", "revision.source");
          }
          const destinationStart = overlapStart - startFrame;
          for (let frame = 0; frame < frames; frame += 1) {
            const frameByteOffset = frame * plan.frameBytes;
            for (let channel = 0; channel < plan.channels; channel += 1) {
              const sampleOffset = frameByteOffset + channel * (plan.bitDepth / 8);
              samples[channel][destinationStart + frame] = decodeSample(bytes.value, sampleOffset, plan.codec, plan.bitDepth);
            }
          }
          destinationFrameCursor += frames;
        }
        sourceFrameCursor += dataChunkFrames;
        if (sourceFrameCursor >= startFrame + frameCount) break;
      }
      if (destinationFrameCursor !== frameCount) {
        return audioFail("AUDIO_METADATA_MISMATCH", "PCM chunk did not cover the canonical sample-frame interval.", "revision.source.metadata.sampleFrames");
      }
      const chunk = {
        index,
        startFrame,
        frameCount,
        sampleRateHz: plan.sampleRateHz,
        channels: plan.channels,
        samples
      };
      if (requestGeneration === generation) {
        cache.set(index, chunk);
        while (cache.size > plan.maxCachedChunks) {
          const oldest = cache.keys().next().value;
          if (oldest === void 0) break;
          cache.delete(oldest);
        }
      }
      return audioOk(chunk);
    })();
    inFlight.set(index, {
      generation: requestGeneration,
      promise: request
    });
    try {
      return await request;
    } finally {
      const current = inFlight.get(index);
      if (current?.promise === request) inFlight.delete(index);
    }
  };
  const reader = {
    plan,
    readChunk,
    async prefetchAround(index) {
      if (!Number.isSafeInteger(index) || index < 0) return;
      const requests = [];
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
        cachedChunkIndices: [
          ...cache.keys()
        ],
        inFlightChunkIndices: [
          ...inFlight.keys()
        ],
        cachedChunkCount: cache.size,
        cachedSampleCount
      };
    }
  };
  return audioOk(reader);
}

// src/audio/audio-310/routing.ts
var AUXILIARY_KINDS = /* @__PURE__ */ new Set([
  "BUS",
  "RETURN"
]);
function invalid(message, path) {
  return audioFail("AUDIO_INVALID_MIXER", message, path);
}
function trackKind(tracksById, trackId) {
  return tracksById.get(trackId)?.kind;
}
function addEdge(outgoing, incoming, source, destination) {
  (outgoing.get(source) ?? outgoing.set(source, /* @__PURE__ */ new Set()).get(source)).add(destination);
  (incoming.get(destination) ?? incoming.set(destination, /* @__PURE__ */ new Set()).get(destination)).add(source);
}
function buildAudioRoutingGraph(mixer, tracks) {
  const tracksById = new Map(tracks.map((track) => [
    String(track.trackId),
    track
  ]));
  const outgoing = /* @__PURE__ */ new Map();
  const incoming = /* @__PURE__ */ new Map();
  const outputBySource = /* @__PURE__ */ new Map();
  const sendsBySource = /* @__PURE__ */ new Map();
  for (const track of tracks) {
    outputBySource.set(String(track.trackId), void 0);
    outgoing.set(String(track.trackId), /* @__PURE__ */ new Set());
    incoming.set(String(track.trackId), /* @__PURE__ */ new Set());
  }
  for (const channel of mixer.channels) {
    const sourceId = String(channel.trackId);
    if (!tracksById.has(sourceId)) {
      return invalid("Mixer channel source Track does not exist.", `mixer.channels.${String(channel.channelId)}.trackId`);
    }
    if (channel.outputTrackId !== void 0) {
      const destinationId = String(channel.outputTrackId);
      if (!tracksById.has(destinationId)) {
        return invalid("Mixer output destination Track does not exist.", `mixer.channels.${String(channel.channelId)}.outputTrackId`);
      }
      if (!AUXILIARY_KINDS.has(trackKind(tracksById, destinationId) ?? "")) {
        return invalid("Track output may target only a Bus or Return Track.", `mixer.channels.${String(channel.channelId)}.outputTrackId`);
      }
      if (destinationId === sourceId) {
        return invalid("A Track cannot route its output to itself.", `mixer.channels.${String(channel.channelId)}.outputTrackId`);
      }
      outputBySource.set(sourceId, destinationId);
      addEdge(outgoing, incoming, sourceId, destinationId);
    }
  }
  const sends = mixer.sends ?? [];
  const sendIds = /* @__PURE__ */ new Set();
  for (const send of sends) {
    const sendId = String(send.sendId);
    if (sendIds.has(sendId)) {
      return invalid("Mixer Send identifiers must be unique.", `mixer.sends.${sendId}`);
    }
    sendIds.add(sendId);
    const sourceId = String(send.sourceTrackId);
    const destinationId = String(send.destinationTrackId);
    if (!tracksById.has(sourceId) || !tracksById.has(destinationId)) {
      return invalid("Send source and destination Tracks must exist.", `mixer.sends.${sendId}`);
    }
    if (!AUXILIARY_KINDS.has(trackKind(tracksById, destinationId) ?? "")) {
      return invalid("Send destination must be a Bus or Return Track.", `mixer.sends.${sendId}.destinationTrackId`);
    }
    if (sourceId === destinationId) {
      return invalid("A Track cannot Send to itself.", `mixer.sends.${sendId}`);
    }
    if (!Number.isSafeInteger(send.amountMilliDb) || send.amountMilliDb < -12e4 || send.amountMilliDb > 24e3) {
      return invalid("Send amount is outside the bounded dB range.", `mixer.sends.${sendId}.amountMilliDb`);
    }
    if (typeof send.preFader !== "boolean") {
      return invalid("Send pre/post-fader flag must be boolean.", `mixer.sends.${sendId}.preFader`);
    }
    const existing = sendsBySource.get(sourceId) ?? [];
    sendsBySource.set(sourceId, [
      ...existing,
      send
    ]);
    addEdge(outgoing, incoming, sourceId, destinationId);
  }
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const order = [];
  const visit = (trackId) => {
    if (visiting.has(trackId)) return false;
    if (visited.has(trackId)) return true;
    visiting.add(trackId);
    for (const destinationId of outgoing.get(trackId) ?? []) {
      if (!visit(destinationId)) return false;
    }
    visiting.delete(trackId);
    visited.add(trackId);
    order.push(trackId);
    return true;
  };
  for (const track of tracks) {
    if (!visit(String(track.trackId))) {
      return invalid("Mixer routing cycle detected; the graph was rejected fail-closed.", "mixer.routing");
    }
  }
  order.reverse();
  return audioOk({
    order,
    outputBySource,
    sendsBySource,
    incomingByTarget: new Map([
      ...incoming.entries()
    ].map(([key, value]) => [
      key,
      [
        ...value
      ]
    ])),
    outgoingBySource: new Map([
      ...outgoing.entries()
    ].map(([key, value]) => [
      key,
      [
        ...value
      ]
    ]))
  });
}
function buildProjectAudioRoutingGraph(project) {
  return buildAudioRoutingGraph(project.mixer, project.tracks);
}
function audioSendAmountToLinear(amountMilliDb) {
  const bounded = Math.min(24e3, Math.max(-12e4, amountMilliDb));
  return 10 ** (bounded / 2e4);
}
function effectiveAudioTrackAudibility(project, graph, respectMuteSolo = true) {
  const channels = new Map(project.mixer.channels.map((channel) => [
    String(channel.trackId),
    channel
  ]));
  const base = /* @__PURE__ */ new Map();
  const soloIds = /* @__PURE__ */ new Set();
  for (const track of project.tracks) {
    const channel = channels.get(String(track.trackId));
    const muted = track.muted || channel?.muted === true;
    base.set(String(track.trackId), !muted);
    if (track.solo || channel?.solo === true) {
      soloIds.add(String(track.trackId));
    }
  }
  if (!respectMuteSolo || soloIds.size === 0) return base;
  const connected = /* @__PURE__ */ new Map();
  for (const track of project.tracks) {
    connected.set(String(track.trackId), /* @__PURE__ */ new Set());
  }
  for (const [source, targets] of graph.outgoingBySource) {
    for (const target of targets) {
      connected.get(source)?.add(target);
      connected.get(target)?.add(source);
    }
  }
  const audibleBySolo = /* @__PURE__ */ new Set();
  const queue = [
    ...soloIds
  ];
  while (queue.length > 0) {
    const id = queue.shift();
    if (audibleBySolo.has(id)) continue;
    audibleBySolo.add(id);
    for (const neighbour of connected.get(id) ?? []) {
      if (!audibleBySolo.has(neighbour)) queue.push(neighbour);
    }
  }
  return new Map([
    ...base.entries()
  ].map(([id, audible]) => [
    id,
    audible && audibleBySolo.has(id)
  ]));
}

// src/audio/audio-200/timebase.ts
var MAX_TICK = 9e9;
function positiveFinite(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function audioClockForProject(project, framesPerSecond) {
  return {
    framesPerSecond: positiveFinite(framesPerSecond, 24),
    tempoMilliBpm: positiveFinite(project.tempo.milliBpm, 12e4),
    ticksPerQuarter: positiveFinite(project.timebase.ticksPerQuarter, 480)
  };
}
function audioTicksPerSecond(clock) {
  return clock.tempoMilliBpm * clock.ticksPerQuarter / 6e4;
}
function audioTickToSeconds(tick, clock) {
  const ticks = Number.isFinite(tick) ? Math.max(0, tick) : 0;
  return ticks / audioTicksPerSecond(clock);
}
function audioSecondsToTick(seconds, clock) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const tick = Math.round(value * audioTicksPerSecond(clock));
  if (tick > MAX_TICK) {
    throw new RangeError("Audio tick exceeds the canonical range.");
  }
  return asAudioTick(tick);
}

// src/audio/audio-300/automation.ts
var MAX_AUTOMATION_POINTS = 65536;
var MIN_CUTOFF_HZ = 20;
var MAX_CUTOFF_HZ = 2e4;
function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function automationClock(tempoMilliBpm, ticksPerQuarter) {
  return {
    framesPerSecond: 1,
    tempoMilliBpm: Math.max(2e4, finite(tempoMilliBpm, 12e4)),
    ticksPerQuarter: Math.max(24, finite(ticksPerQuarter, 480))
  };
}
function valueKindForTarget(kind) {
  if (kind === "TRACK_GAIN" || kind === "MIXER_CHANNEL_GAIN" || kind === "CLIP_GAIN") return "GAIN_DB";
  if (kind === "TRACK_PAN" || kind === "MIXER_CHANNEL_PAN") return "PAN";
  if (kind === "FILTER_CUTOFF") return "FILTER_CUTOFF_HZ";
  return "NORMALIZED";
}
function normalizeValue(value, kind) {
  if (kind === "GAIN_DB") return clamp(finite(value, 0), -120, 24);
  if (kind === "PAN") return clamp(finite(value, 0), -1, 1);
  if (kind === "FILTER_CUTOFF_HZ") {
    return clamp(finite(value, 1e3), MIN_CUTOFF_HZ, MAX_CUTOFF_HZ);
  }
  return clamp(finite(value, 0), -1e6, 1e6);
}
function comparePoints(left, right) {
  return left.tick - right.tick;
}
function compileAudioAutomation(automation) {
  if (typeof automation.automationId !== "string" || automation.automationId.trim().length === 0 || automation.points.length === 0 || automation.points.length > MAX_AUTOMATION_POINTS) {
    return audioFail("AUDIO_INVALID_AUTOMATION", "Automation must contain a bounded non-empty point list.", "automation.points");
  }
  const valueKind = valueKindForTarget(automation.target.kind);
  const points = automation.points.filter((point) => Number.isSafeInteger(point.tick) && point.tick >= 0).map((point) => ({
    ...point,
    value: normalizeValue(point.value, valueKind)
  })).sort(comparePoints);
  if (points.length === 0) {
    return audioFail("AUDIO_INVALID_AUTOMATION", "Automation point ticks are invalid.", "automation.points");
  }
  const deduped = [];
  for (const point of points) {
    const previous = deduped.at(-1);
    if (previous?.tick === point.tick) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return audioOk({
    automationId: String(automation.automationId),
    target: automation.target,
    valueKind,
    points: deduped
  });
}
function automationValueAtTick(curve, tick) {
  const points = curve.points;
  if (points.length === 1 || tick <= points[0].tick) {
    return points[0].value;
  }
  const last = points[points.length - 1];
  if (tick >= last.tick) return last.value;
  let low = 0;
  let high = points.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].tick <= tick) low = middle;
    else high = middle;
  }
  const left = points[low];
  const right = points[high];
  const span = Math.max(1, right.tick - left.tick);
  const ratio = clamp((tick - left.tick) / span, 0, 1);
  return left.value + (right.value - left.value) * ratio;
}
function automationValueAtSeconds(curve, seconds, tempoMilliBpm, ticksPerQuarter) {
  return automationValueAtTick(curve, Math.max(0, seconds) * audioTicksPerSecond(automationClock(tempoMilliBpm, ticksPerQuarter)));
}
function compileProjectAutomations(project) {
  const curves = /* @__PURE__ */ new Map();
  for (const automation of project.automations) {
    const compiled = compileAudioAutomation(automation);
    if (!compiled.ok) continue;
    curves.set(automationKey(automation.target.kind, automation.target.targetId, automation.target.parameterName), compiled.value);
  }
  return curves;
}
function automationKey(kind, targetId, parameterName) {
  return `${kind}:${targetId}:$${parameterName ?? ""}`;
}
function automationCurveForTarget(curves, kind, targetId, parameterName) {
  return curves.get(automationKey(kind, targetId, parameterName));
}

// src/audio/audio-320/effects.ts
var MIN_DB = -120;
var MAX_DB = 24;
function createOfflineEffectChainState() {
  return {
    eq: /* @__PURE__ */ new Map(),
    compressor: /* @__PURE__ */ new Map(),
    reverb: /* @__PURE__ */ new Map()
  };
}
function finite2(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function clamp2(value, min, max) {
  return Math.min(max, Math.max(min, finite2(value, min)));
}
function dbToLinear(db) {
  return 10 ** (clamp2(db, MIN_DB, MAX_DB) / 20);
}
function parameter(effect, names, fallback) {
  for (const name of names) {
    const item = effect.parameters.find((candidate) => candidate.name === name);
    if (item !== void 0 && Number.isFinite(item.value)) return item.value;
  }
  return fallback;
}
function automatedParameter(effect, names, timeSeconds, options, fallback) {
  for (const name of names) {
    const curve = options.curveFor?.(String(effect.effectId), name);
    if (curve !== void 0) {
      return automationValueAtSeconds(curve, timeSeconds, options.tempoMilliBpm, options.ticksPerQuarter);
    }
  }
  return parameter(effect, names, fallback);
}
function applyEq(left, right, effect, state, options) {
  const id = String(effect.effectId);
  const memory = state.eq.get(id) ?? {
    lowLeft: 0,
    lowRight: 0
  };
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const frequency = clamp2(automatedParameter(effect, [
      "frequency",
      "freq"
    ], time, options, 1e3), 20, 2e4);
    const gain = clamp2(automatedParameter(effect, [
      "gainDb",
      "gain"
    ], time, options, 0), MIN_DB, MAX_DB);
    const mix = clamp2(automatedParameter(effect, [
      "mix"
    ], time, options, 1), 0, 1);
    const alpha = Math.exp(-2 * Math.PI * frequency / options.sampleRateHz);
    memory.lowLeft = (1 - alpha) * left[index] + alpha * memory.lowLeft;
    memory.lowRight = (1 - alpha) * right[index] + alpha * memory.lowRight;
    const linear = dbToLinear(gain);
    left[index] = left[index] + memory.lowLeft * (linear - 1) * mix;
    right[index] = right[index] + memory.lowRight * (linear - 1) * mix;
  }
  state.eq.set(id, memory);
}
function applyCompressor(left, right, effect, state, options) {
  const id = String(effect.effectId);
  const memory = state.compressor.get(id) ?? {
    envelope: 0
  };
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const threshold = clamp2(automatedParameter(effect, [
      "thresholdDb",
      "threshold"
    ], time, options, -18), -100, 0);
    const ratio = clamp2(automatedParameter(effect, [
      "ratio"
    ], time, options, 4), 1, 20);
    const attack = clamp2(automatedParameter(effect, [
      "attackMs",
      "attack"
    ], time, options, 10), 0.1, 1e3) / 1e3;
    const release = clamp2(automatedParameter(effect, [
      "releaseMs",
      "release"
    ], time, options, 100), 1, 2e3) / 1e3;
    const makeup = clamp2(automatedParameter(effect, [
      "makeupDb",
      "makeup"
    ], time, options, 0), MIN_DB, MAX_DB);
    const level = Math.max(Math.abs(left[index]), Math.abs(right[index]));
    const coefficient = level > memory.envelope ? Math.exp(-1 / Math.max(1, attack * options.sampleRateHz)) : Math.exp(-1 / Math.max(1, release * options.sampleRateHz));
    memory.envelope = coefficient * memory.envelope + (1 - coefficient) * level;
    const levelDb = 20 * Math.log10(Math.max(1e-7, memory.envelope));
    const over = Math.max(0, levelDb - threshold);
    const reductionDb = over - over / ratio;
    const gain = dbToLinear(makeup - reductionDb);
    left[index] = left[index] * gain;
    right[index] = right[index] * gain;
  }
  state.compressor.set(id, memory);
}
function applyReverb(left, right, effect, state, options) {
  const id = String(effect.effectId);
  const delayMs = clamp2(parameter(effect, [
    "delayMs",
    "delay"
  ], 120), 1, 2e3);
  const delayFrames = Math.max(1, Math.round(delayMs * options.sampleRateHz / 1e3));
  const previous = state.reverb.get(id);
  const memory = previous !== void 0 && previous.sampleRateHz === options.sampleRateHz && previous.delayFrames === delayFrames ? previous : {
    sampleRateHz: options.sampleRateHz,
    delayFrames,
    index: 0,
    left: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2)),
    right: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2))
  };
  const feedback = clamp2(parameter(effect, [
    "decay",
    "feedback"
  ], 0.35), 0, 0.95);
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const mix = clamp2(automatedParameter(effect, [
      "mix",
      "wet"
    ], time, options, 0.25), 0, 1);
    const slot = memory.index % memory.left.length;
    const delayedLeft = memory.left[slot];
    const delayedRight = memory.right[slot];
    const inputLeft = left[index];
    const inputRight = right[index];
    memory.left[slot] = inputLeft + delayedLeft * feedback;
    memory.right[slot] = inputRight + delayedRight * feedback;
    left[index] = inputLeft * (1 - mix) + delayedLeft * mix;
    right[index] = inputRight * (1 - mix) + delayedRight * mix;
    memory.index = (memory.index + 1) % memory.left.length;
  }
  state.reverb.set(id, memory);
}
function applyOfflineEffectChain(left, right, options) {
  if (left.length === 0 || right.length === 0) return;
  for (const effect of options.effects) {
    if (!effect.enabled) continue;
    if (effect.kind === "EQ") {
      applyEq(left, right, effect, options.state, options);
    } else if (effect.kind === "COMPRESSOR") {
      applyCompressor(left, right, effect, options.state, options);
    } else if (effect.kind === "REVERB") {
      applyReverb(left, right, effect, options.state, options);
    }
  }
}

// src/audio/audio-330/mastering.ts
var MAX_INTEGRATED_FRAMES = 48e3 * 300;
var DEFAULT_AUDIO_MASTER_STATE = {
  gainMilliDb: 0,
  limiterEnabled: false,
  limiterCeilingMilliDb: -1e3,
  bypass: false,
  effectIds: []
};
function finite3(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function clamp3(value, min, max) {
  return Math.min(max, Math.max(min, finite3(value, min)));
}
function masterGainToLinear(gainMilliDb) {
  return 10 ** (clamp3(gainMilliDb, -12e4, 24e3) / 2e4);
}
function masterCeilingToLinear(ceilingMilliDb) {
  return 10 ** (clamp3(ceilingMilliDb, -12e4, 0) / 2e4);
}
function applyOfflineMasterProcessing(left, right, options) {
  if (left.length === 0 || right.length === 0) return;
  const master = options.master ?? DEFAULT_AUDIO_MASTER_STATE;
  if (master.bypass) return;
  const effects = options.effects ?? [];
  if (effects.length > 0) {
    const effectOptions = {
      effects,
      state: options.effectState ?? createOfflineEffectChainState(),
      sampleRateHz: options.sampleRateHz,
      blockStartSeconds: options.blockStartSeconds,
      tempoMilliBpm: options.tempoMilliBpm,
      ticksPerQuarter: options.ticksPerQuarter,
      ...options.curveFor === void 0 ? {} : {
        curveFor: options.curveFor
      }
    };
    applyOfflineEffectChain(left, right, effectOptions);
  }
  const gain = masterGainToLinear(master.gainMilliDb);
  const ceiling = masterCeilingToLinear(master.limiterCeilingMilliDb);
  for (let index = 0; index < left.length; index += 1) {
    let nextLeft = finite3(left[index], 0) * gain;
    let nextRight = finite3(right[index], 0) * gain;
    if (master.limiterEnabled) {
      const peak = Math.max(Math.abs(nextLeft), Math.abs(nextRight));
      if (peak > ceiling && peak > 0) {
        const scale = ceiling / peak;
        nextLeft *= scale;
        nextRight *= scale;
      }
    }
    left[index] = clamp3(nextLeft, -1, 1);
    right[index] = clamp3(nextRight, -1, 1);
  }
}

// src/audio/audio-260/render.ts
var WAV_HEADER_BYTES = 44;
var DEFAULT_SAMPLE_RATE_HZ = 48e3;
var DEFAULT_BLOCK_FRAMES = 2048;
var DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
var MIN_SAMPLE_RATE_HZ = 8e3;
var MAX_SAMPLE_RATE_HZ = 192e3;
var MIN_BLOCK_FRAMES = 128;
var MAX_BLOCK_FRAMES = 16384;
var MAX_WAV_BYTES = 4294967295 + 8;
function fail(code, message, path, recoverable = false) {
  return audioFail(code, message, path, recoverable);
}
function finiteNonNegative(value, fallback = 0) {
  return value !== void 0 && Number.isFinite(value) && value >= 0 ? value : fallback;
}
function boundedInteger2(value, fallback, minimum, maximum) {
  const candidate = value !== void 0 && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(maximum, Math.max(minimum, candidate));
}
function ticksToSeconds(ticks, project) {
  return audioTickToSeconds(ticks, audioClockForProject(project, 1));
}
function dbToLinear2(milliDb) {
  const bounded = Math.min(24e3, Math.max(-12e4, milliDb));
  return 10 ** (bounded / 2e4);
}
function dbValueToLinear(decibels) {
  return 10 ** (Math.min(24, Math.max(-120, decibels)) / 20);
}
function panGains(panMilli) {
  const pan = Math.min(1, Math.max(-1, panMilli / 1e3));
  const angle = (pan + 1) * Math.PI / 4;
  return [
    Math.cos(angle),
    Math.sin(angle)
  ];
}
function panValueGains(pan) {
  const bounded = Math.min(1, Math.max(-1, pan));
  const angle = (bounded + 1) * Math.PI / 4;
  return [
    Math.cos(angle),
    Math.sin(angle)
  ];
}
function clipSeconds(clip, project) {
  return {
    start: ticksToSeconds(clip.timeline.startTick, project),
    duration: ticksToSeconds(clip.timeline.durationTick, project)
  };
}
function noteSeconds(note, project) {
  return {
    start: ticksToSeconds(note.timeline.startTick, project),
    duration: ticksToSeconds(note.timeline.durationTick, project)
  };
}
function projectDurationSeconds(project) {
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
function writeText(bytes, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}
function bytesPerSample(bitDepth) {
  return bitDepth / 8;
}
function wavHeader(info) {
  const dataBytes = info.frameCount * info.channels * bytesPerSample(info.bitDepth);
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
  view.setUint32(28, info.sampleRateHz * info.channels * bytesPerSample(info.bitDepth), true);
  view.setUint16(32, info.channels * bytesPerSample(info.bitDepth), true);
  view.setUint16(34, info.bitDepth, true);
  writeText(bytes, 36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}
function encodePcmBlock(left, right, channels, bitDepth) {
  const frameCount = left.length;
  const frameBytes = channels * bytesPerSample(bitDepth);
  const bytes = new Uint8Array(frameCount * frameBytes);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const writeSample = (value) => {
    const bounded = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    if (bitDepth === 8) {
      view.setUint8(offset, Math.max(0, Math.min(255, Math.round(bounded * 127.5 + 128))));
      offset += 1;
      return;
    }
    if (bitDepth === 16) {
      view.setInt16(offset, bounded <= -1 ? -32768 : Math.round(bounded * 32767), true);
      offset += 2;
      return;
    }
    if (bitDepth === 24) {
      let integer = bounded <= -1 ? -8388608 : Math.round(bounded * 8388607);
      if (integer < 0) integer += 16777216;
      view.setUint8(offset, integer & 255);
      view.setUint8(offset + 1, integer >>> 8 & 255);
      view.setUint8(offset + 2, integer >>> 16 & 255);
      offset += 3;
      return;
    }
    view.setInt32(offset, bounded <= -1 ? -2147483648 : Math.round(bounded * 2147483647), true);
    offset += 4;
  };
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (channels === 1) {
      writeSample((left[frame] + right[frame]) * 0.5);
    } else {
      writeSample(left[frame]);
      writeSample(right[frame]);
    }
  }
  return bytes;
}
function normalizeTarget(project, target) {
  if (target === void 0 || target === "MASTER") return audioOk("MASTER");
  if (target.kind !== "STEM" || typeof target.trackId !== "string" || target.trackId.trim().length === 0 || !project.tracks.some((track) => String(track.trackId) === target.trackId)) {
    return fail("AUDIO_RENDER_INVALID", "Stem target must resolve to a canonical Project Track.", "target.trackId");
  }
  return audioOk({
    kind: "STEM",
    trackId: target.trackId
  });
}
function normalizedRange(project, options) {
  const startSeconds = finiteNonNegative(options.startSeconds, 0);
  const projectDuration = projectDurationSeconds(project);
  const durationSeconds = options.durationSeconds === void 0 ? Math.max(0, projectDuration - startSeconds) : options.durationSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(startSeconds) || startSeconds < 0) {
    return fail("AUDIO_RENDER_INVALID", "Render range must contain a positive duration and non-negative start.", "range");
  }
  return audioOk({
    startSeconds,
    durationSeconds
  });
}
function effectiveTrackState(project, respectMuteSolo = true) {
  const channels = new Map(project.mixer.channels.map((channel) => [
    String(channel.trackId),
    channel
  ]));
  const anySolo = project.tracks.some((track) => track.solo) || project.mixer.channels.some((channel) => channel.solo);
  return new Map(project.tracks.map((track) => {
    const channel = channels.get(String(track.trackId));
    const trackSolo = track.solo || channel?.solo === true;
    return [
      String(track.trackId),
      {
        track,
        gain: dbToLinear2(channel?.gainMilliDb ?? 0),
        pan: panGains(channel?.panMilli ?? 0),
        audible: !respectMuteSolo || !track.muted && channel?.muted !== true && (!anySolo || trackSolo)
      }
    ];
  }));
}
var RevisionChunkAccessor = class _RevisionChunkAccessor {
  revision;
  reader;
  constructor(revision, reader) {
    this.revision = revision;
    this.reader = reader;
  }
  static async create(store, revision) {
    const created = await createAudioPcmChunkReader(store, revision, {
      chunkSeconds: 1,
      readAheadChunks: 0,
      maxCachedChunks: 4
    });
    if (!created.ok) return created;
    return audioOk(new _RevisionChunkAccessor(revision, created.value));
  }
  async readRange(startFrame, frameCount) {
    const boundedStart = Math.max(0, Math.min(this.revision.source.metadata.sampleFrames, Math.floor(startFrame)));
    const boundedCount = Math.max(0, Math.min(frameCount, this.revision.source.metadata.sampleFrames - boundedStart));
    const samples = Array.from({
      length: this.reader.plan.channels
    }, () => new Float32Array(boundedCount));
    let cursor = 0;
    while (cursor < boundedCount) {
      const chunkIndex = Math.floor((boundedStart + cursor) / this.reader.plan.chunkFrames);
      const chunkResult = await this.reader.readChunk(chunkIndex);
      if (!chunkResult.ok) {
        return chunkResult;
      }
      const chunk = chunkResult.value;
      if (chunk === null) {
        return fail("AUDIO_SOURCE_UNAVAILABLE", "A source chunk was unavailable during Offline Render.", "revision.source", true);
      }
      const sourceStart = Math.max(boundedStart + cursor, chunk.startFrame);
      const sourceEnd = Math.min(boundedStart + boundedCount, chunk.startFrame + chunk.frameCount);
      if (sourceEnd <= sourceStart) {
        cursor += Math.max(1, chunk.frameCount);
        continue;
      }
      const copyCount = sourceEnd - sourceStart;
      const destination = sourceStart - boundedStart;
      for (let channel = 0; channel < samples.length; channel += 1) {
        samples[channel].set(chunk.samples[channel].subarray(sourceStart - chunk.startFrame, sourceStart - chunk.startFrame + copyCount), destination);
      }
      cursor = sourceEnd - boundedStart;
    }
    return audioOk(samples);
  }
};
function fadeFactor(localSeconds, clipDurationSeconds, fadeInSeconds, fadeOutSeconds) {
  const fadeIn = fadeInSeconds > 0 ? Math.min(1, Math.max(0, localSeconds / fadeInSeconds)) : 1;
  const fadeOutStart = Math.max(0, clipDurationSeconds - fadeOutSeconds);
  const fadeOut = fadeOutSeconds > 0 && localSeconds > fadeOutStart ? Math.min(1, Math.max(0, (clipDurationSeconds - localSeconds) / fadeOutSeconds)) : 1;
  return Math.min(fadeIn, fadeOut);
}
function oscillatorForTrack(track, pitchMidi, drumKitId = "BASIC") {
  const label = track.name.toLowerCase();
  if (label.includes("drum")) {
    const pitch = Math.trunc(pitchMidi ?? 38);
    if (pitch === 36) return drumKitId === "ARCADE" ? "square" : "triangle";
    if (pitch === 38) return drumKitId === "SOFT" ? "saw" : "noise";
    if (pitch === 42 || pitch === 46) {
      return drumKitId === "SOFT" ? "triangle" : "square";
    }
    return drumKitId === "SOFT" ? "triangle" : "saw";
  }
  if (label.includes("noise")) return "noise";
  if (label.includes("chip") || label.includes("pulse")) return "square";
  if (label.includes("saw")) return "saw";
  if (label.includes("guitar") || label.includes("bass")) return "triangle";
  return "sine";
}
function oscillatorSample(kind, phase, seed) {
  if (kind === "triangle") {
    return 1 - 4 * Math.abs(Math.round(phase / (2 * Math.PI)) - phase / (2 * Math.PI));
  }
  if (kind === "saw") {
    return 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
  }
  if (kind === "square") return Math.sin(phase) >= 0 ? 1 : -1;
  if (kind === "noise") {
    const value = Math.sin((seed + 1) * 12.9898) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  }
  return Math.sin(phase);
}
function createMemoryAudioRenderSink(maxBytes = DEFAULT_MAX_OUTPUT_BYTES) {
  let chunks = [];
  let totalBytes = 0;
  let started = false;
  let closed = false;
  return {
    async begin(info) {
      const total = WAV_HEADER_BYTES + info.frameCount * info.channels * bytesPerSample(info.bitDepth);
      if (!Number.isSafeInteger(total) || total > maxBytes || total > MAX_WAV_BYTES) {
        return fail("AUDIO_RENDER_OUTPUT_LIMIT", "Offline Render output exceeds the bounded WAV output limit.", "render.outputBytes");
      }
      chunks = [
        wavHeader(info)
      ];
      totalBytes = WAV_HEADER_BYTES;
      started = true;
      closed = false;
      return audioOk(true);
    },
    async writePcm(bytes) {
      if (!started || closed || bytes.byteLength < 1) {
        return fail("AUDIO_RENDER_INVALID", "Render sink is not accepting PCM blocks.", "render.sink");
      }
      if (totalBytes + bytes.byteLength > maxBytes) {
        return fail("AUDIO_RENDER_OUTPUT_LIMIT", "Offline Render output exceeds the bounded sink limit.", "render.outputBytes");
      }
      chunks.push(new Uint8Array(bytes));
      totalBytes += bytes.byteLength;
      return audioOk(true);
    },
    async finalize() {
      if (!started || closed) {
        return fail("AUDIO_RENDER_INVALID", "Render sink cannot be finalized twice.", "render.sink");
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
    }
  };
}
function noteWaveSample(note, track, project, timeSeconds, sampleIndex) {
  const range = noteSeconds(note, project);
  const local = timeSeconds - range.start;
  if (local < 0 || local >= range.duration) return 0;
  const attack = Math.min(0.01, range.duration * 0.2);
  const release = Math.min(0.03, range.duration * 0.25);
  const envelope = Math.min(attack > 0 ? local / attack : 1, release > 0 ? (range.duration - local) / release : 1, 1);
  const frequency = 440 * 2 ** ((note.pitchMidi - 69) / 12);
  const phase = 2 * Math.PI * frequency * local;
  const waveform = oscillatorForTrack(track, note.pitchMidi, project.drumKitId);
  return oscillatorSample(waveform, phase, sampleIndex + note.pitchMidi) * envelope * (note.velocityMilli / 1e3) * 0.35;
}
function applyAutomatedLowPass(left, right, blockStartSeconds, sampleRateHz, project, curve, state) {
  for (let index = 0; index < left.length; index += 1) {
    const cutoff = Math.min(2e4, Math.max(20, automationValueAtSeconds(curve, blockStartSeconds + index / sampleRateHz, project.tempo.milliBpm, project.timebase.ticksPerQuarter)));
    const alpha = Math.exp(-2 * Math.PI * cutoff / sampleRateHz);
    state.left = (1 - alpha) * left[index] + alpha * state.left;
    state.right = (1 - alpha) * right[index] + alpha * state.right;
    left[index] = state.left;
    right[index] = state.right;
  }
}
async function mixClipBlock(left, right, blockStartSeconds, outputRate, clip, project, accessor, clipGainAutomation) {
  const range = clipSeconds(clip, project);
  const blockEndSeconds = blockStartSeconds + left.length / outputRate;
  const clipEndSeconds = range.start + range.duration;
  const first = Math.max(0, Math.floor((Math.max(blockStartSeconds, range.start) - blockStartSeconds) * outputRate));
  const last = Math.min(left.length, Math.ceil((Math.min(blockEndSeconds, clipEndSeconds) - blockStartSeconds) * outputRate));
  if (last <= first) return audioOk(true);
  const sourceRate = accessor.reader.plan.sampleRateHz;
  const sourceFrames = accessor.revision.source.metadata.sampleFrames;
  const sourceOffsetFrame = Math.min(sourceFrames, Math.floor(clip.sourceOffsetUs * sourceRate / 1e6));
  const sourceAvailableFrames = Math.max(1, sourceFrames - sourceOffsetFrame);
  const sourceDurationSeconds = sourceAvailableFrames / sourceRate;
  const fadeInSeconds = ticksToSeconds(clip.fadeInTick, project);
  const fadeOutSeconds = ticksToSeconds(clip.fadeOutTick, project);
  const clipGain = dbToLinear2(clip.gainMilliDb);
  let cursor = first;
  while (cursor < last) {
    const sampleTime = blockStartSeconds + cursor / outputRate;
    const localTime = Math.max(0, sampleTime - range.start);
    const sourceLocal = clip.loop ? localTime % sourceDurationSeconds : localTime;
    const untilLoop = clip.loop ? Math.max(1 / outputRate, sourceDurationSeconds - sourceLocal) : (last - cursor) / outputRate;
    const segmentCount = Math.max(1, Math.min(last - cursor, Math.ceil(untilLoop * outputRate)));
    const sourceStartFloat = sourceOffsetFrame + sourceLocal * sourceRate;
    const sourceStartFrame = Math.floor(sourceStartFloat);
    const sourceRangeFrames = Math.max(2, Math.ceil(segmentCount * sourceRate / outputRate) + 2);
    const source = await accessor.readRange(sourceStartFrame, sourceRangeFrames);
    if (!source.ok) return source;
    const sourceSamples = source.value;
    for (let index = 0; index < segmentCount && cursor + index < last; index += 1) {
      const time = blockStartSeconds + (cursor + index) / outputRate;
      const local = Math.max(0, time - range.start);
      const localSource = clip.loop ? local % sourceDurationSeconds : local;
      const sourcePosition = sourceOffsetFrame + localSource * sourceRate - sourceStartFrame;
      const lower = Math.max(0, Math.floor(sourcePosition));
      const upper = Math.min(sourceSamples[0].length - 1, lower + 1);
      const fraction = Math.max(0, Math.min(1, sourcePosition - lower));
      const read = (channel) => {
        const values = sourceSamples[channel] ?? sourceSamples[0];
        const firstValue = values[lower] ?? 0;
        const secondValue = values[upper] ?? firstValue;
        return firstValue + (secondValue - firstValue) * fraction;
      };
      const fade = fadeFactor(local, range.duration, fadeInSeconds, fadeOutSeconds);
      const automatedGain = clipGainAutomation === void 0 ? clipGain : dbValueToLinear(automationValueAtSeconds(clipGainAutomation, time, project.tempo.milliBpm, project.timebase.ticksPerQuarter));
      const gain = automatedGain * fade;
      const sourceLeft = read(0) * gain;
      const sourceRight = (sourceSamples.length > 1 ? read(1) : sourceLeft) * gain;
      left[cursor + index] = left[cursor + index] + sourceLeft;
      right[cursor + index] = right[cursor + index] + sourceRight;
    }
    cursor += segmentCount;
  }
  return audioOk(true);
}
async function renderOfflineAudio(options) {
  const target = normalizeTarget(options.project, options.target);
  if (!target.ok) return target;
  const range = normalizedRange(options.project, options);
  if (!range.ok) return range;
  const sampleRateHz = boundedInteger2(options.sampleRateHz, DEFAULT_SAMPLE_RATE_HZ, MIN_SAMPLE_RATE_HZ, MAX_SAMPLE_RATE_HZ);
  const channels = options.channels ?? 2;
  const bitDepth = options.bitDepth ?? 16;
  const blockFrames = boundedInteger2(options.blockFrames, DEFAULT_BLOCK_FRAMES, MIN_BLOCK_FRAMES, MAX_BLOCK_FRAMES);
  if (channels !== 1 && channels !== 2 || ![
    8,
    16,
    24,
    32
  ].includes(bitDepth)) {
    return fail("AUDIO_RENDER_INVALID", "Render channels or bit depth is unsupported.", "render.format");
  }
  const frameCount = Math.ceil(range.value.durationSeconds * sampleRateHz);
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || WAV_HEADER_BYTES + frameCount * channels * bytesPerSample(bitDepth) > (options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES)) {
    return fail("AUDIO_RENDER_OUTPUT_LIMIT", "Render duration or format exceeds the bounded output limit.", "render.outputBytes");
  }
  const info = {
    sampleRateHz,
    channels,
    bitDepth,
    frameCount,
    target: target.value
  };
  const isCancelled = () => options.cancellation?.aborted === true;
  const sink = options.sink ?? createMemoryAudioRenderSink(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES);
  if (isCancelled()) {
    return fail("AUDIO_RENDER_CANCELLED", "Offline Render was cancelled before the sink opened.", "render.cancellation", true);
  }
  const begun = await sink.begin(info);
  if (!begun.ok) return begun;
  const trackState = effectiveTrackState(options.project, options.respectMuteSolo !== false);
  const automationCurves = compileProjectAutomations(options.project);
  const activeFreezeClipByTrack = new Map((options.project.freezeStates ?? []).filter((freeze) => freeze.status === "ACTIVE").map((freeze) => [
    String(freeze.trackId),
    String(freeze.frozenClipId)
  ]));
  const freezeClipIdsByTrack = /* @__PURE__ */ new Map();
  for (const freeze of options.project.freezeStates ?? []) {
    const clipIds = freezeClipIdsByTrack.get(String(freeze.trackId)) ?? /* @__PURE__ */ new Set();
    clipIds.add(String(freeze.frozenClipId));
    freezeClipIdsByTrack.set(String(freeze.trackId), clipIds);
  }
  const includeTrackMixer = options.includeTrackMixer !== false;
  const includeMasterMixer = options.includeMasterMixer !== false;
  const resolvedTarget = target.value;
  const useRouting = includeTrackMixer && resolvedTarget === "MASTER";
  let routingGraph;
  let routingAudibility;
  if (useRouting) {
    const built = buildProjectAudioRoutingGraph(options.project);
    if (!built.ok) {
      await sink.cancel();
      return audioFail("AUDIO_RENDER_INVALID", built.diagnostics[0]?.message ?? "Canonical mixer routing is invalid.", built.diagnostics[0]?.path ?? "project.mixer.routing");
    }
    routingGraph = built.value;
    routingAudibility = effectiveAudioTrackAudibility(options.project, built.value, options.respectMuteSolo !== false);
  }
  const tracks = resolvedTarget === "MASTER" ? useRouting ? routingGraph.order.map((trackId) => options.project.tracks.find((track) => track.trackId === trackId)) : options.project.tracks : options.project.tracks.filter((track) => String(track.trackId) === resolvedTarget.trackId);
  const revisions = new Map(options.project.revisions.map((revision) => [
    String(revision.revisionId),
    revision
  ]));
  const accessors = /* @__PURE__ */ new Map();
  const getAccessor = (revision) => {
    const key = String(revision.revisionId);
    const existing = accessors.get(key);
    if (existing !== void 0) return existing;
    const created = RevisionChunkAccessor.create(options.store, revision).then((result) => {
      if (!result.ok) return void 0;
      return result.value;
    });
    accessors.set(key, created);
    return created;
  };
  const notesByTrack = /* @__PURE__ */ new Map();
  const notesById = new Map(options.project.notes.map((note) => [
    String(note.noteId),
    note
  ]));
  for (const track of tracks) {
    notesByTrack.set(String(track.trackId), track.noteIds.map((id) => notesById.get(String(id))).filter((note) => note !== void 0));
  }
  const filterStates = /* @__PURE__ */ new Map();
  const effectStates = /* @__PURE__ */ new Map();
  const effectsById = new Map(options.project.effects.map((effect) => [
    String(effect.effectId),
    effect
  ]));
  const masterState = options.project.master;
  const masterEffects = (masterState?.effectIds ?? []).map((effectId) => effectsById.get(String(effectId))).filter((effect) => effect !== void 0);
  const masterEffectState = createOfflineEffectChainState();
  const masterGain = dbToLinear2(options.project.mixer.masterGainMilliDb);
  let completedFrames = 0;
  try {
    while (completedFrames < frameCount) {
      if (isCancelled()) {
        await sink.cancel();
        return fail("AUDIO_RENDER_CANCELLED", "Offline Render was cancelled before completion.", "render.cancellation", true);
      }
      const count = Math.min(blockFrames, frameCount - completedFrames);
      const left = new Float32Array(count);
      const right = new Float32Array(count);
      const routedInputs = /* @__PURE__ */ new Map();
      const blockStartSeconds = range.value.startSeconds + completedFrames / sampleRateHz;
      for (const track of tracks) {
        const state = trackState.get(String(track.trackId));
        const audible = useRouting ? routingAudibility?.get(String(track.trackId)) === true : state?.audible === true;
        if (state === void 0 || !audible) continue;
        const trackLeft = new Float32Array(count);
        const trackRight = new Float32Array(count);
        const inbound = routedInputs.get(String(track.trackId));
        if (inbound !== void 0) {
          trackLeft.set(inbound.left);
          trackRight.set(inbound.right);
        }
        const activeFreezeClipId = activeFreezeClipByTrack.get(String(track.trackId));
        const channel = options.project.mixer.channels.find((item) => item.trackId === track.trackId);
        const trackGainAutomation = automationCurveForTarget(automationCurves, "TRACK_GAIN", String(track.trackId)) ?? (channel === void 0 ? void 0 : automationCurveForTarget(automationCurves, "MIXER_CHANNEL_GAIN", String(channel.channelId)));
        const synthGainAutomation = automationCurveForTarget(automationCurves, "SYNTH_PARAMETER", String(track.trackId), "gain") ?? automationCurveForTarget(automationCurves, "SYNTH_PARAMETER", String(track.trackId), "volume");
        const trackPanAutomation = automationCurveForTarget(automationCurves, "TRACK_PAN", String(track.trackId)) ?? (channel === void 0 ? void 0 : automationCurveForTarget(automationCurves, "MIXER_CHANNEL_PAN", String(channel.channelId)));
        const synthPanAutomation = automationCurveForTarget(automationCurves, "SYNTH_PARAMETER", String(track.trackId), "pan");
        const filterAutomation = activeFreezeClipId === void 0 ? automationCurveForTarget(automationCurves, "FILTER_CUTOFF", String(track.trackId)) : void 0;
        const synthFilterAutomation = activeFreezeClipId === void 0 ? automationCurveForTarget(automationCurves, "SYNTH_PARAMETER", String(track.trackId), "filterCutoff") : void 0;
        const resolvedFilterAutomation = filterAutomation ?? synthFilterAutomation;
        const filterState = resolvedFilterAutomation === void 0 ? void 0 : filterStates.get(String(track.trackId)) ?? {
          left: 0,
          right: 0
        };
        for (const clipId of track.clipIds) {
          if (activeFreezeClipId !== void 0 && String(clipId) !== activeFreezeClipId) continue;
          if (activeFreezeClipId === void 0 && freezeClipIdsByTrack.get(String(track.trackId))?.has(String(clipId))) continue;
          const clip = options.project.clips.find((item) => item.clipId === clipId);
          if (clip === void 0) continue;
          const revision = revisions.get(String(clip.revisionId));
          if (revision === void 0) {
            await sink.cancel();
            return fail("AUDIO_SOURCE_UNAVAILABLE", "Clip Revision is missing during Offline Render.", `clips.${String(clip.clipId)}.revisionId`);
          }
          const accessor = await getAccessor(revision);
          if (accessor === void 0) {
            await sink.cancel();
            return fail("AUDIO_SOURCE_UNAVAILABLE", "Clip source could not be opened during Offline Render.", `clips.${String(clip.clipId)}.source`, true);
          }
          const mixed = await mixClipBlock(trackLeft, trackRight, blockStartSeconds, sampleRateHz, clip, options.project, accessor, automationCurveForTarget(automationCurves, "CLIP_GAIN", String(clip.clipId)));
          if (!mixed.ok) {
            await sink.cancel();
            return mixed;
          }
        }
        const notes = activeFreezeClipId === void 0 ? notesByTrack.get(String(track.trackId)) ?? [] : [];
        const preLeft = new Float32Array(count);
        const preRight = new Float32Array(count);
        const postLeft = new Float32Array(count);
        const postRight = new Float32Array(count);
        for (let index = 0; index < count; index += 1) {
          const time = blockStartSeconds + index / sampleRateHz;
          for (const note of notes) {
            const value = noteWaveSample(note, track, options.project, time, completedFrames + index);
            trackLeft[index] = trackLeft[index] + value;
            trackRight[index] = trackRight[index] + value;
          }
        }
        if (resolvedFilterAutomation !== void 0 && filterState !== void 0) {
          applyAutomatedLowPass(trackLeft, trackRight, blockStartSeconds, sampleRateHz, options.project, resolvedFilterAutomation, filterState);
          filterStates.set(String(track.trackId), filterState);
        }
        const effects = track.effectIds.map((effectId) => effectsById.get(String(effectId))).filter((effect) => effect !== void 0);
        if (effects.length > 0) {
          const effectState = effectStates.get(String(track.trackId)) ?? createOfflineEffectChainState();
          applyOfflineEffectChain(trackLeft, trackRight, {
            effects,
            state: effectState,
            sampleRateHz,
            blockStartSeconds,
            tempoMilliBpm: options.project.tempo.milliBpm,
            ticksPerQuarter: options.project.timebase.ticksPerQuarter,
            curveFor: (effectId, parameterName) => automationCurveForTarget(automationCurves, "EFFECT_PARAMETER", effectId, parameterName)
          });
          effectStates.set(String(track.trackId), effectState);
        }
        for (let index = 0; index < count; index += 1) {
          const time = blockStartSeconds + index / sampleRateHz;
          const gainAutomation = trackGainAutomation ?? synthGainAutomation;
          const mixerGain = includeTrackMixer ? gainAutomation === void 0 ? state.gain : dbValueToLinear(automationValueAtSeconds(gainAutomation, time, options.project.tempo.milliBpm, options.project.timebase.ticksPerQuarter)) : 1;
          const synthGain = synthGainAutomation === void 0 ? 1 : dbValueToLinear(automationValueAtSeconds(synthGainAutomation, time, options.project.tempo.milliBpm, options.project.timebase.ticksPerQuarter));
          const automatedGain = mixerGain * synthGain;
          const panAutomation = trackPanAutomation ?? synthPanAutomation;
          const mixerPan = includeTrackMixer ? panAutomation === void 0 ? state.pan : panValueGains(automationValueAtSeconds(panAutomation, time, options.project.tempo.milliBpm, options.project.timebase.ticksPerQuarter)) : [
            1,
            1
          ];
          const synthPan = synthPanAutomation === void 0 ? [
            1,
            1
          ] : panValueGains(automationValueAtSeconds(synthPanAutomation, time, options.project.tempo.milliBpm, options.project.timebase.ticksPerQuarter));
          const preGainLeft = synthGain * synthPan[0];
          const preGainRight = synthGain * synthPan[1];
          const postGainLeft = includeTrackMixer ? mixerGain * mixerPan[0] * preGainLeft : preGainLeft;
          const postGainRight = includeTrackMixer ? mixerGain * mixerPan[1] * preGainRight : preGainRight;
          preLeft[index] = trackLeft[index] * preGainLeft;
          preRight[index] = trackRight[index] * preGainRight;
          postLeft[index] = trackLeft[index] * postGainLeft;
          postRight[index] = trackRight[index] * postGainRight;
          if (!useRouting) {
            left[index] = left[index] + postLeft[index];
            right[index] = right[index] + postRight[index];
          }
        }
        if (useRouting && routingGraph !== void 0) {
          const outputTrackId = routingGraph.outputBySource.get(String(track.trackId));
          const output = outputTrackId === void 0 ? void 0 : routedInputs.get(outputTrackId) ?? {
            left: new Float32Array(count),
            right: new Float32Array(count)
          };
          if (outputTrackId !== void 0 && output !== void 0) {
            routedInputs.set(outputTrackId, output);
          }
          for (let index = 0; index < count; index += 1) {
            if (output === void 0) {
              left[index] = left[index] + postLeft[index];
              right[index] = right[index] + postRight[index];
            } else {
              output.left[index] = output.left[index] + postLeft[index];
              output.right[index] = output.right[index] + postRight[index];
            }
          }
          for (const send of routingGraph.sendsBySource.get(String(track.trackId)) ?? []) {
            const destination = routedInputs.get(String(send.destinationTrackId)) ?? {
              left: new Float32Array(count),
              right: new Float32Array(count)
            };
            routedInputs.set(String(send.destinationTrackId), destination);
            const sendGain = audioSendAmountToLinear(send.amountMilliDb);
            const sourceLeft = send.preFader ? preLeft : postLeft;
            const sourceRight = send.preFader ? preRight : postRight;
            for (let index = 0; index < count; index += 1) {
              destination.left[index] = destination.left[index] + sourceLeft[index] * sendGain;
              destination.right[index] = destination.right[index] + sourceRight[index] * sendGain;
            }
          }
        }
      }
      for (let index = 0; index < count; index += 1) {
        if (includeMasterMixer) {
          left[index] = left[index] * masterGain;
          right[index] = right[index] * masterGain;
        }
      }
      if (includeMasterMixer && masterState !== void 0) {
        applyOfflineMasterProcessing(left, right, {
          master: masterState,
          effects: masterEffects,
          effectState: masterEffectState,
          sampleRateHz,
          blockStartSeconds,
          tempoMilliBpm: options.project.tempo.milliBpm,
          ticksPerQuarter: options.project.timebase.ticksPerQuarter,
          curveFor: (effectId, parameterName) => automationCurveForTarget(automationCurves, "EFFECT_PARAMETER", effectId, parameterName)
        });
      }
      const encoded = encodePcmBlock(left, right, channels, bitDepth);
      const written = await sink.writePcm(encoded);
      if (!written.ok) {
        await sink.cancel();
        return written;
      }
      completedFrames += count;
      if (isCancelled()) {
        await sink.cancel();
        return fail("AUDIO_RENDER_CANCELLED", "Offline Render was cancelled after a bounded PCM write.", "render.cancellation", true);
      }
      await options.onProgress?.({
        completedFrames,
        totalFrames: frameCount,
        ratio: completedFrames / frameCount,
        target: target.value
      });
    }
    if (isCancelled()) {
      await sink.cancel();
      return fail("AUDIO_RENDER_CANCELLED", "Offline Render was cancelled before finalization.", "render.cancellation", true);
    }
    const finalized = await sink.finalize();
    if (!finalized.ok) {
      return finalized;
    }
    const bytes = finalized.value;
    const contentHash = bytes === null ? null : asAudioContentHash(await sha256Hex(bytes));
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
      projectStateHash: options.project.stateHash
    });
  } catch (error) {
    await sink.cancel().catch(() => void 0);
    return fail("AUDIO_RENDER_INVALID", error instanceof Error ? error.message : "Offline Render failed.", "render", true);
  }
}

// src/audio/audio-270/freeze.ts
var DEFAULT_SAMPLE_RATE_HZ2 = 48e3;
var DEFAULT_FRAME_RATE = 60;
var DEFAULT_MAX_OUTPUT_BYTES2 = 64 * 1024 * 1024;
var SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function fail2(code, message, path, recoverable = false) {
  return audioFail(code, message, path, recoverable);
}
function trackForId(project, value) {
  return project.tracks.find((track) => String(track.trackId) === value);
}
function ticksToSeconds2(ticks, project) {
  return audioTickToSeconds(ticks, audioClockForProject(project, 1));
}
function secondsToTicks(seconds, project) {
  return Math.max(1, Number(audioSecondsToTick(seconds, audioClockForProject(project, 1))));
}
function clipRange(clip, project) {
  return {
    start: ticksToSeconds2(clip.timeline.startTick, project),
    duration: ticksToSeconds2(clip.timeline.durationTick, project)
  };
}
function trackDurationSeconds(track, project) {
  const clipById = new Map(project.clips.map((clip) => [
    String(clip.clipId),
    clip
  ]));
  const noteById = new Map(project.notes.map((note) => [
    String(note.noteId),
    note
  ]));
  let duration = 0;
  for (const id of track.clipIds) {
    const clip = clipById.get(String(id));
    if (clip === void 0) continue;
    const range = clipRange(clip, project);
    duration = Math.max(duration, range.start + range.duration);
  }
  for (const id of track.noteIds) {
    const note = noteById.get(String(id));
    if (note === void 0) continue;
    const range = clipRange({
      clipId: "note-range",
      trackId: track.trackId,
      revisionId: "note-range",
      timeline: note.timeline,
      sourceOffsetUs: 0,
      gainMilliDb: 0,
      fadeInTick: 0,
      fadeOutTick: 0,
      loop: false
    }, project);
    duration = Math.max(duration, range.start + range.duration);
  }
  return duration;
}
function fingerprintMaterial(project, track) {
  const frozenClipIds = new Set((project.freezeStates ?? []).filter((freeze) => freeze.trackId === track.trackId).map((freeze) => String(freeze.frozenClipId)));
  const clips = project.clips.filter((clip) => clip.trackId === track.trackId && !frozenClipIds.has(String(clip.clipId)));
  const notes = project.notes.filter((note) => note.trackId === track.trackId);
  const automations = project.automations.filter((automation) => track.automationIds.includes(automation.automationId) || automation.target.targetId === String(track.trackId));
  const effects = project.effects.filter((effect) => track.effectIds.includes(effect.effectId));
  const channel = project.mixer.channels.find((item) => item.trackId === track.trackId);
  return {
    projectId: project.projectId,
    tempo: project.tempo,
    timebase: project.timebase,
    track: {
      ...track,
      clipIds: clips.map((clip) => clip.clipId)
    },
    clips,
    notes,
    automations,
    effects,
    channel,
    routing: project.mixer,
    masterGainMilliDb: project.mixer.masterGainMilliDb
  };
}
async function sourceStateHash(project, track) {
  return asAudioContentHash(await hashCanonical(fingerprintMaterial(project, track)));
}
function token(value) {
  const normalized = value.replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  return (SAFE_TOKEN.test(normalized) ? normalized : "audio").slice(0, 96);
}
function canonicalClip(project, track, clipId, startSeconds, durationSeconds, framesPerSecond) {
  const startTick = secondsToTicks(startSeconds, project);
  const durationTick = secondsToTicks(durationSeconds, project);
  const _ = framesPerSecond;
  return {
    clipId: asAudioClipId(clipId),
    trackId: track.trackId,
    revisionId: asAudioRevisionId("pending-revision"),
    timeline: {
      startTick,
      durationTick
    },
    sourceOffsetUs: 0,
    gainMilliDb: 0,
    fadeInTick: 0,
    fadeOutTick: 0,
    loop: false
  };
}
function durationForBounce(options, track, project) {
  const clip = options.clipId === void 0 ? void 0 : project.clips.find((item) => String(item.clipId) === options.clipId && item.trackId === track.trackId);
  if (options.clipId !== void 0 && clip === void 0) {
    throw new Error("Bounce Clip does not resolve to the selected Track.");
  }
  if (clip !== void 0) {
    const range = clipRange(clip, project);
    return {
      startSeconds: range.start,
      durationSeconds: range.duration
    };
  }
  const startSeconds = Math.max(0, options.startSeconds ?? 0);
  const total = options.durationSeconds ?? trackDurationSeconds(track, project);
  return {
    startSeconds,
    durationSeconds: Math.max(0, total - startSeconds)
  };
}
async function renderArtifact(options, track, sourceHash, startSeconds, durationSeconds, clipIdPrefix) {
  if (durationSeconds <= 0) {
    return fail2("AUDIO_FREEZE_INVALID", "Freeze/Bounce requires a Track with a positive render duration.", "track.duration");
  }
  const freezeStates = (options.project.freezeStates ?? []).map((freeze) => freeze.status === "ACTIVE" && freeze.trackId === track.trackId && freeze.sourceStateHash !== sourceHash ? {
    ...freeze,
    status: "STALE"
  } : freeze);
  const renderProject = freezeStates.length === 0 && options.project.freezeStates === void 0 ? options.project : {
    ...options.project,
    freezeStates
  };
  const renderOptions = {
    project: renderProject,
    store: options.store,
    target: {
      kind: "STEM",
      trackId: String(track.trackId)
    },
    sampleRateHz: options.sampleRateHz ?? DEFAULT_SAMPLE_RATE_HZ2,
    bitDepth: options.bitDepth ?? 16,
    startSeconds,
    durationSeconds,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES2,
    includeTrackMixer: false,
    includeMasterMixer: false,
    respectMuteSolo: false,
    ...options.blockFrames === void 0 ? {} : {
      blockFrames: options.blockFrames
    },
    ...options.cancellation === void 0 ? {} : {
      cancellation: options.cancellation
    },
    ...options.onProgress === void 0 ? {} : {
      onProgress: options.onProgress
    }
  };
  const rendered = await renderOfflineAudio(renderOptions);
  if (!rendered.ok) {
    if (rendered.diagnostics.some((item) => item.code === "AUDIO_RENDER_CANCELLED")) {
      return fail2("AUDIO_FREEZE_CANCELLED", "Freeze/Bounce render was cancelled.", "render.cancellation", true);
    }
    return rendered;
  }
  if (rendered.value.bytes === null) {
    return fail2("AUDIO_SOURCE_UNAVAILABLE", "Freeze/Bounce render did not produce an in-memory WAV artifact.", "render.bytes", true);
  }
  const projectToken = token(String(options.project.projectId));
  const trackToken = token(String(track.trackId));
  const hashToken = String(sourceHash).slice(0, 32);
  const artifactToken = token(`${projectToken}-${trackToken}-${hashToken}`);
  const artifactKind = clipIdPrefix.startsWith("clip:bounce") ? "bounce" : "freeze";
  const assetId = asAudioAssetId(`asset:${artifactKind}:${artifactToken}`);
  const revisionId = asAudioRevisionId(`revision:${artifactKind}:${artifactToken}`);
  const blobId = asSourceBlobId(`blob:${artifactKind}:${artifactToken}`);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const candidate = {
    blobId,
    assetId,
    revisionId,
    revisionNumber: 1,
    kind: "CLIP",
    referenceMode: "PINNED",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: `${artifactKind}s/${projectToken}/${trackToken}/${revisionId}.wav`
    },
    bytes: rendered.value.bytes,
    createdAt: now
  };
  const canonical = await canonicalizeSourceBlob(candidate);
  if (!canonical.ok) return canonical;
  const clip = canonicalClip(options.project, track, `${clipIdPrefix}:${artifactToken}`, startSeconds, rendered.value.durationSeconds, options.framesPerSecond ?? DEFAULT_FRAME_RATE);
  const boundClip = {
    ...clip,
    revisionId: canonical.value.revisionId
  };
  const stored = await options.store.put(canonical.value, rendered.value.bytes);
  if (!stored.ok) return stored;
  return audioOk({
    revision: canonical.value,
    clip: boundClip,
    bytes: rendered.value.bytes,
    durationSeconds: rendered.value.durationSeconds
  });
}
async function freezeTrack(options) {
  const track = trackForId(options.project, options.trackId);
  if (track === void 0) {
    return fail2("AUDIO_FREEZE_INVALID", "Freeze Track does not resolve to a canonical Project Track.", "trackId");
  }
  const hash = await sourceStateHash(options.project, track);
  const existing = (options.project.freezeStates ?? []).find((freeze) => freeze.trackId === track.trackId && freeze.sourceStateHash === hash && (freeze.status === "ACTIVE" || freeze.status === "INACTIVE" || freeze.status === "STALE"));
  if (existing !== void 0) {
    const revision = options.project.revisions.find((item) => item.revisionId === existing.frozenRevisionId);
    const clip = options.project.clips.find((item) => item.clipId === existing.frozenClipId);
    if (revision !== void 0 && clip !== void 0) {
      const present = await options.store.has(revision);
      if (present.ok && present.value) {
        return audioOk({
          trackId: String(track.trackId),
          sourceStateHash: hash,
          revision,
          clip,
          durationSeconds: ticksToSeconds2(clip.timeline.durationTick, options.project),
          bytes: null,
          reused: true,
          existingStatus: existing.status
        });
      }
    }
  }
  const duration = trackDurationSeconds(track, options.project);
  const rendered = await renderArtifact(options, track, hash, 0, duration, "clip:freeze");
  if (!rendered.ok) return rendered;
  return audioOk({
    trackId: String(track.trackId),
    sourceStateHash: hash,
    revision: rendered.value.revision,
    clip: rendered.value.clip,
    durationSeconds: rendered.value.durationSeconds,
    bytes: rendered.value.bytes,
    reused: false,
    existingStatus: null
  });
}
async function bounceInPlace(options) {
  const track = trackForId(options.project, options.trackId);
  if (track === void 0) {
    return fail2("AUDIO_BOUNCE_INVALID", "Bounce Track does not resolve to a canonical Project Track.", "trackId");
  }
  let range;
  try {
    range = durationForBounce(options, track, options.project);
  } catch (error) {
    return fail2("AUDIO_BOUNCE_INVALID", error instanceof Error ? error.message : "Bounce range is invalid.", "range");
  }
  if (range.durationSeconds <= 0) {
    return fail2("AUDIO_BOUNCE_INVALID", "Bounce requires a positive Track range.", "range.durationSeconds");
  }
  const hash = await sourceStateHash(options.project, track);
  const rendered = await renderArtifact(options, track, hash, range.startSeconds, range.durationSeconds, `clip:bounce:${options.project.projectRevision}:${Math.round(range.startSeconds * 1e3)}:${Math.round(range.durationSeconds * 1e3)}`);
  if (!rendered.ok) return rendered;
  return audioOk({
    trackId: String(track.trackId),
    sourceStateHash: hash,
    revision: rendered.value.revision,
    clip: rendered.value.clip,
    durationSeconds: rendered.value.durationSeconds,
    bytes: rendered.value.bytes
  });
}
export {
  bounceInPlace,
  freezeTrack
};
