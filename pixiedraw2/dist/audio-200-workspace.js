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
var AUDIO200_SCHEMA_VERSION = "AUDIO-200_V1";
var AUDIO200_JOURNAL_SCHEMA_VERSION = "AUDIO-200_JOURNAL_V1";
var AUDIO200_CHECKPOINT_SCHEMA_VERSION = "AUDIO-200_CHECKPOINT_V1";
var AUDIO200_METADATA_AUTHORITY = "AUDIO-200_CANONICAL_METADATA_V1";
var AUDIO200_UI_SCHEMA_VERSION = "AUDIO-200_UI_BOUNDARY_V1";
var AUDIO200_ASSET_SCHEMA_VERSION = "AUDIO-200_ASSET_V1";
var AUDIO200_WAVEFORM_SCHEMA_VERSION = "AUDIO-200_WAVEFORM_V1";
var AUDIO200_SUPPORTED_CODECS = [
  "WAV_PCM",
  "WAV_IEEE_FLOAT"
];
var AUDIO_DRUM_KIT_IDS = [
  "BASIC",
  "ARCADE",
  "SOFT"
];
function isAudioDrumKitId(value) {
  return typeof value === "string" && AUDIO_DRUM_KIT_IDS.includes(value);
}
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
function audioDiagnostic(code, message, path, recoverable = false) {
  return {
    code,
    message,
    ...path === void 0 ? {} : {
      path
    },
    recoverable
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
function asAudioProjectId(value) {
  return brandId(value, "AudioProjectId");
}
function asAudioAssetId(value) {
  return brandId(value, "AudioAssetId");
}
function asAudioRevisionId(value) {
  return brandId(value, "AudioRevisionId");
}
function asAudioTrackId(value) {
  return brandId(value, "AudioTrackId");
}
function asAudioClipId(value) {
  return brandId(value, "AudioClipId");
}
function asAudioNoteId(value) {
  return brandId(value, "AudioNoteId");
}
function asAudioAutomationId(value) {
  return brandId(value, "AudioAutomationId");
}
function asAudioMixerId(value) {
  return brandId(value, "AudioMixerId");
}
function asAudioMixerChannelId(value) {
  return brandId(value, "AudioMixerChannelId");
}
function asAudioMixerSendId(value) {
  return brandId(value, "AudioMixerSendId");
}
function asAudioEffectId(value) {
  return brandId(value, "AudioEffectId");
}
function asSourceBlobId(value) {
  return brandId(value, "SourceBlobId");
}
function asAudioCommandId(value) {
  return brandId(value, "AudioCommandId");
}
function asAudioJournalEntryId(value) {
  return brandId(value, "AudioJournalEntryId");
}
function asAudioCheckpointId(value) {
  return brandId(value, "AudioCheckpointId");
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
function isFiniteSafeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(value) === false;
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function canonicalAudioMaterial(value) {
  return canonicalJson(value);
}
function sourcePathIsSafe(relativePath) {
  if (!relativePath || relativePath.length > 512 || relativePath.includes("\\") || relativePath.includes("\0")) return false;
  if (relativePath.startsWith("/") || relativePath.startsWith("~") || relativePath.includes("://")) return false;
  const segments = relativePath.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function audioIdSet(values) {
  return new Set(values);
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
function inspectCanonicalWavLayout(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) {
    return audioFail("AUDIO_INVALID_SOURCE", "Source bytes must be a non-empty Uint8Array.", "bytes");
  }
  const parsed = parseWav(bytes);
  return parsed.ok ? audioOk(parsed.value) : parsed;
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
async function verifySourceBlobAgainstRevision(bytes, revision) {
  const actual = await inspectSourceBlob(bytes);
  if (!actual.ok) return actual;
  const expected = revision.source.metadata;
  const hashOrSizeChanged = actual.value.contentHash !== expected.contentHash || actual.value.byteLength !== expected.byteLength;
  const metadataChanged = actual.value.codec !== expected.codec || actual.value.sampleRateHz !== expected.sampleRateHz || actual.value.channels !== expected.channels || actual.value.bitDepth !== expected.bitDepth || actual.value.sampleFrames !== expected.sampleFrames || actual.value.durationUs !== expected.durationUs;
  if (hashOrSizeChanged) {
    return audioFail("AUDIO_RAW_BLOB_MODIFIED", "Raw source bytes do not match the immutable Revision hash or byte length.", "source");
  }
  if (metadataChanged) {
    return audioFail("AUDIO_METADATA_MISMATCH", "Raw source metadata does not match the immutable Revision metadata.", "source.metadata");
  }
  if (revision.source.locator.contentHash !== actual.value.contentHash || revision.source.locator.byteLength !== actual.value.byteLength) {
    return audioFail("AUDIO_RAW_BLOB_MODIFIED", "Revision locator is inconsistent with the verified source bytes.", "source.locator");
  }
  return audioOk(true);
}
function sourcePlacementIsLocal(placement) {
  return placement === "MEMORY_PREVIEW" || placement === "OPFS";
}

// src/audio/audio-200/timebase.ts
var MAX_TICK = 9e9;
var SAFE_INSTRUMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
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
function audioFramesPerSecond(clock) {
  return clock.framesPerSecond;
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
function audioFrameToSeconds(frame, clock) {
  const frames = Number.isFinite(frame) ? Math.max(0, frame) : 0;
  return frames / audioFramesPerSecond(clock);
}
function audioSecondsToFrame(seconds, clock) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return Math.max(0, Math.round(value * audioFramesPerSecond(clock)));
}
function audioFrameToTick(frame, clock) {
  return audioSecondsToTick(audioFrameToSeconds(frame, clock), clock);
}
function audioTickToFrame(tick, clock) {
  return audioSecondsToFrame(audioTickToSeconds(tick, clock), clock);
}
function audioInstrumentTrackId(value) {
  const trimmed = String(value).trim();
  const token = trimmed.replace(/^instrument:/iu, "").replace(/[^A-Za-z0-9._:-]/gu, "-").slice(0, 128).toLowerCase();
  if (!SAFE_INSTRUMENT.test(token)) {
    throw new Error("Instrument Track ID is invalid.");
  }
  return asAudioTrackId(`instrument:${token}`);
}

// src/audio/audio-200/assets.ts
var MAX_SOURCE_NAME = 256;
var SAFE_ID3 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
function fail(code, message, path, recoverable = false) {
  return audioFail(code, message, path, recoverable);
}
function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function validId(value) {
  return typeof value === "string" && SAFE_ID3.test(value);
}
function validSourceName(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_SOURCE_NAME;
}
function unique(values) {
  return new Set(values).size === values.length;
}
function createAudioAssetCatalog() {
  return {
    schemaVersion: AUDIO200_ASSET_SCHEMA_VERSION,
    assets: []
  };
}
function createAudioAssetRecord(revision, sourceName) {
  if (hasRawAudioPayload(revision)) {
    return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Asset metadata cannot contain raw audio payload fields.", "revision");
  }
  if (!validSourceName(sourceName)) {
    return fail("AUDIO_INVALID_ASSET", "Asset source name must be a bounded non-empty string.", "sourceName");
  }
  if (revision === null || typeof revision !== "object" || !validId(revision.assetId) || !validId(revision.revisionId) || !Number.isSafeInteger(revision.revisionNumber) || revision.revisionNumber < 1 || !validTimestamp(revision.createdAt)) {
    return fail("AUDIO_INVALID_REVISION", "Asset record requires a canonical verified revision.", "revision");
  }
  return audioOk({
    schemaVersion: AUDIO200_ASSET_SCHEMA_VERSION,
    assetId: revision.assetId,
    sourceName: sourceName.trim(),
    kind: revision.kind,
    revisionIds: [
      revision.revisionId
    ],
    latestRevisionId: revision.revisionId,
    createdAt: revision.createdAt
  });
}
function validateAudioAssetCatalog(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || hasRawAudioPayload(value)) {
    return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Asset catalog is metadata-only and must be an object.", "catalog");
  }
  const candidate = value;
  if (candidate.schemaVersion !== AUDIO200_ASSET_SCHEMA_VERSION) {
    return fail("AUDIO_UNSUPPORTED_SCHEMA", "Asset catalog schema is unsupported.", "catalog.schemaVersion");
  }
  if (!Array.isArray(candidate.assets)) {
    return fail("AUDIO_INVALID_ASSET", "Asset catalog assets must be an array.", "catalog.assets");
  }
  const assets = candidate.assets;
  const assetIds = assets.map((asset) => asset?.assetId);
  if (assetIds.some((id) => !validId(id)) || !unique(assetIds)) {
    return fail("AUDIO_DUPLICATE_ID", "Asset IDs must be stable and unique.", "catalog.assets");
  }
  for (const [index, asset] of assets.entries()) {
    if (asset === null || typeof asset !== "object") {
      return fail("AUDIO_INVALID_ASSET", "Asset record must be an object.", `catalog.assets[${index}]`);
    }
    const item = asset;
    const revisions = item.revisionIds;
    if (item.schemaVersion !== AUDIO200_ASSET_SCHEMA_VERSION || !validId(item.assetId) || !validSourceName(item.sourceName) || item.kind !== "CLIP" && item.kind !== "SONG" || !Array.isArray(revisions) || revisions.length === 0 || revisions.some((id) => !validId(id)) || !unique(revisions) || !validId(item.latestRevisionId) || !revisions.includes(item.latestRevisionId) || !validTimestamp(item.createdAt)) {
      return fail("AUDIO_INVALID_ASSET", "Asset record fields or revision references are invalid.", `catalog.assets[${index}]`);
    }
  }
  return audioOk(value);
}
function validateAudioAssetCatalogAgainstProject(catalog, project) {
  const valid = validateAudioAssetCatalog(catalog);
  if (!valid.ok) return valid;
  const revisions = new Map(project.revisions.map((revision) => [
    revision.revisionId,
    revision
  ]));
  for (const asset of catalog.assets) {
    for (const revisionId of asset.revisionIds) {
      const revision = revisions.get(revisionId);
      if (revision === void 0 || revision.assetId !== asset.assetId || revision.kind !== asset.kind) {
        return fail("AUDIO_METADATA_MISMATCH", "Asset catalog revision references do not bind to the canonical Project.", `catalog.assets.${asset.assetId}.revisionIds`);
      }
    }
  }
  return audioOk(true);
}
function appendAudioAssetRevision(catalog, revision, sourceName) {
  const valid = validateAudioAssetCatalog(catalog);
  if (!valid.ok) return valid;
  if (revision === null || typeof revision !== "object" || !validId(revision.assetId) || !validId(revision.revisionId) || !Number.isSafeInteger(revision.revisionNumber) || revision.revisionNumber < 1) {
    return fail("AUDIO_INVALID_REVISION", "Asset revision is not canonical.", "revision");
  }
  const existing = catalog.assets.find((asset) => asset.assetId === revision.assetId);
  if (existing === void 0) {
    if (sourceName === void 0) {
      return fail("AUDIO_INVALID_ASSET", "A new Asset requires its source name.", "sourceName");
    }
    const created = createAudioAssetRecord(revision, sourceName);
    if (!created.ok) return created;
    return audioOk({
      ...catalog,
      assets: [
        ...catalog.assets,
        created.value
      ]
    });
  }
  if (existing.kind !== revision.kind) {
    return fail("AUDIO_INVALID_ASSET", "An Asset cannot change its canonical kind.", "revision.kind");
  }
  if (existing.revisionIds.includes(revision.revisionId)) {
    return fail("AUDIO_DUPLICATE_ID", "Revision ID is already registered for this Asset.", "revision.revisionId");
  }
  const latestRevisionNumber = existing.revisionIds.length;
  if (revision.revisionNumber <= latestRevisionNumber) {
    return fail("AUDIO_INVALID_REVISION", "Revision numbers must increase monotonically within an Asset.", "revision.revisionNumber");
  }
  return audioOk({
    ...catalog,
    assets: catalog.assets.map((asset) => asset.assetId === revision.assetId ? {
      ...asset,
      revisionIds: [
        ...asset.revisionIds,
        revision.revisionId
      ],
      latestRevisionId: revision.revisionId
    } : asset)
  });
}
function assetReferenceCount(project, assetId) {
  const revisionIds = new Set(project.revisions.filter((revision) => revision.assetId === assetId).map((revision) => revision.revisionId));
  return project.clips.filter((clip) => revisionIds.has(clip.revisionId)).length;
}
function revisionReferenceCount(project, revisionId) {
  return project.clips.filter((clip) => clip.revisionId === revisionId).length;
}
function audioAssetRecordForId(catalog, assetId) {
  return catalog.assets.find((asset) => asset.assetId === assetId);
}
function audioAssetId(value) {
  return asAudioAssetId(value);
}
function audioRevisionId(value) {
  return asAudioRevisionId(value);
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

// src/audio/audio-200/state.ts
var AUDIO200_MAX_TICK = 9e9;
var AUDIO200_MAX_PROJECT_REVISION = 1e9;
var AUDIO200_DEFAULT_PPQ = 480;
var AUDIO200_DEFAULT_TEMPO_MILLIBPM = 12e4;
var SAFE_ID4 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var MAX_TEXT = 256;
var COMMAND_TYPES = [
  "TRACK_ADD",
  "TRACK_REMOVE",
  "REVISION_ATTACH",
  "CLIP_ADD",
  "CLIP_UPDATE",
  "CLIP_SPLIT",
  "CLIP_REMOVE",
  "NOTE_REMOVE",
  "NOTE_UPSERT",
  "AUTOMATION_UPSERT",
  "AUTOMATION_REMOVE",
  "MIXER_REPLACE",
  "EFFECT_UPSERT",
  "EFFECT_CHAIN_REPLACE",
  "MASTER_REPLACE",
  "DRUM_KIT_SET",
  "SYNTH_PRESET_REPLACE",
  "SYNTH_PRESET_REMOVE",
  "TEMPO_SET",
  "MARKER_UPSERT",
  "MARKER_REMOVE",
  "RECORDING_COMMIT",
  "BOUNCE_COMMIT",
  "FREEZE_COMMIT",
  "FREEZE_UNFREEZE",
  "FREEZE_REACTIVATE",
  "TIMELINE_BAR_CLEAR"
];
function fail2(code, message, path, recoverable = false) {
  return audioFail(code, message, path, recoverable);
}
function validId2(value) {
  return typeof value === "string" && SAFE_ID4.test(value);
}
function text2(value, max = MAX_TEXT) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function boundedInteger(value, min, max) {
  return isSafeInteger(value) && value >= min && value <= max;
}
function boundedNumber(value, min, max) {
  return finite(value) && value >= min && value <= max;
}
function unique2(values, path) {
  const seen = /* @__PURE__ */ new Set();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      return {
        code: "AUDIO_DUPLICATE_ID",
        message: "Duplicate canonical identifier is not allowed.",
        path: `${path}[${index}]`,
        recoverable: false
      };
    }
    seen.add(value);
  }
  return null;
}
function validTimeRange(range, path) {
  if (range === null || typeof range !== "object") {
    return {
      code: "AUDIO_INVALID_NUMBER",
      message: "Timeline range must be an object.",
      path,
      recoverable: false
    };
  }
  const candidate = range;
  if (!boundedInteger(candidate.startTick, 0, AUDIO200_MAX_TICK) || !boundedInteger(candidate.durationTick, 1, AUDIO200_MAX_TICK)) {
    return {
      code: "AUDIO_INVALID_NUMBER",
      message: "Timeline ticks must be bounded safe integers.",
      path,
      recoverable: false
    };
  }
  if (candidate.startTick + candidate.durationTick > AUDIO200_MAX_TICK) {
    return {
      code: "AUDIO_OVERFLOW",
      message: "Timeline end exceeds the safe AUDIO-200 tick range.",
      path,
      recoverable: false
    };
  }
  return null;
}
function validateRevision(revision, path) {
  if (revision === null || typeof revision !== "object") {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision must be an object.",
      path,
      recoverable: false
    };
  }
  const value = revision;
  const source = value.source;
  const locator = source?.locator;
  const metadata = source?.metadata;
  if (value.schemaVersion !== "AUDIO-200_V1" || value.metadataAuthority !== "AUDIO-200_CANONICAL_METADATA_V1" || value.verified !== true) {
    return {
      code: "AUDIO_UNSUPPORTED_SCHEMA",
      message: "Revision schema or metadata authority is not canonical.",
      path,
      recoverable: false
    };
  }
  if (![
    value.assetId,
    value.revisionId,
    source?.blobId
  ].every(validId2)) {
    return {
      code: "AUDIO_INVALID_ID",
      message: "Revision identifiers are invalid.",
      path,
      recoverable: false
    };
  }
  if (!boundedInteger(value.revisionNumber, 1, AUDIO200_MAX_PROJECT_REVISION)) {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision number is invalid.",
      path,
      recoverable: false
    };
  }
  if (value.kind !== "CLIP" && value.kind !== "SONG") {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision kind is invalid.",
      path,
      recoverable: false
    };
  }
  if (![
    "LIVE",
    "PINNED",
    "REVIEW",
    "FORKED"
  ].includes(value.referenceMode)) {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision reference mode is invalid.",
      path,
      recoverable: false
    };
  }
  if (locator === null || locator.namespace !== "audio" || typeof locator.relativePath !== "string" || locator.relativePath.includes("..") || locator.relativePath.startsWith("/") || locator.relativePath.includes("\\") || locator.relativePath.includes("://")) {
    return {
      code: "AUDIO_PATH_TRAVERSAL",
      message: "Revision source locator is not a safe relative audio path.",
      path: `${path}.source.locator.relativePath`,
      recoverable: false
    };
  }
  if (metadata === null || ![
    "WAV_PCM",
    "WAV_IEEE_FLOAT"
  ].includes(metadata.codec) || metadata.mimeType !== "audio/wav") {
    return {
      code: "AUDIO_UNSUPPORTED_CODEC",
      message: "Revision source codec is outside the AUDIO-200 reference set.",
      path: `${path}.source.metadata.codec`,
      recoverable: false
    };
  }
  if (!boundedInteger(metadata.sampleRateHz, 8e3, 384e3) || ![
    1,
    2
  ].includes(metadata.channels) || ![
    8,
    16,
    24,
    32
  ].includes(metadata.bitDepth) || !boundedInteger(metadata.sampleFrames, 1, Number.MAX_SAFE_INTEGER) || !boundedInteger(metadata.durationUs, 1, Number.MAX_SAFE_INTEGER) || !boundedInteger(metadata.byteLength, 1, 64 * 1024 * 1024) || typeof metadata.contentHash !== "string") {
    return {
      code: "AUDIO_INVALID_SOURCE",
      message: "Revision source metadata is invalid.",
      path: `${path}.source.metadata`,
      recoverable: false
    };
  }
  if (Math.floor(metadata.sampleFrames * 1e6 / metadata.sampleRateHz) !== metadata.durationUs) {
    return {
      code: "AUDIO_METADATA_MISMATCH",
      message: "Revision duration is not derived from sample frames and sample rate.",
      path: `${path}.source.metadata.durationUs`,
      recoverable: false
    };
  }
  try {
    asAudioContentHash(metadata.contentHash);
  } catch {
    return {
      code: "AUDIO_INVALID_SOURCE",
      message: "Revision source hash is not SHA-256.",
      path: `${path}.source.metadata.contentHash`,
      recoverable: false
    };
  }
  if (locator.contentHash !== metadata.contentHash || locator.byteLength !== metadata.byteLength) {
    return {
      code: "AUDIO_METADATA_MISMATCH",
      message: "Source locator and metadata hash/byte length disagree.",
      path: `${path}.source`,
      recoverable: false
    };
  }
  if (value.createdAt === void 0 || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision timestamp is invalid.",
      path: `${path}.createdAt`,
      recoverable: false
    };
  }
  return null;
}
function validateTrack(track, path) {
  if (track === null || typeof track !== "object") {
    return {
      code: "AUDIO_INVALID_TRACK",
      message: "Track must be an object.",
      path,
      recoverable: false
    };
  }
  const value = track;
  if (!validId2(value.trackId) || !text2(value.name) || !validId2(value.mixerChannelId)) {
    return {
      code: "AUDIO_INVALID_TRACK",
      message: "Track identity, name, or mixer channel is invalid.",
      path,
      recoverable: false
    };
  }
  if (![
    "AUDIO",
    "INSTRUMENT",
    "BUS",
    "RETURN"
  ].includes(value.kind) || typeof value.muted !== "boolean" || typeof value.solo !== "boolean") {
    return {
      code: "AUDIO_INVALID_TRACK",
      message: "Track kind or state is invalid.",
      path,
      recoverable: false
    };
  }
  for (const [key, item] of [
    [
      "clipIds",
      value.clipIds
    ],
    [
      "noteIds",
      value.noteIds
    ],
    [
      "automationIds",
      value.automationIds
    ],
    [
      "effectIds",
      value.effectIds
    ]
  ]) {
    if (!Array.isArray(item) || item.some((id) => !validId2(id)) || unique2(item, `${path}.${key}`) !== null) {
      return {
        code: "AUDIO_INVALID_TRACK",
        message: "Track child identifiers are invalid or duplicated.",
        path: `${path}.${key}`,
        recoverable: false
      };
    }
  }
  return null;
}
var AUDIO_SYNTH_WAVEFORMS = [
  "pulse",
  "triangle",
  "sawtooth",
  "sine",
  "noise"
];
var AUDIO_SYNTH_FILTER_TYPES = [
  "lowpass",
  "highpass",
  "bandpass"
];
var AUDIO_SYNTH_NOISE_COLORS = [
  "white",
  "pink"
];
function validateSynthPreset(preset, path) {
  if (preset === null || typeof preset !== "object") {
    return {
      code: "AUDIO_INVALID_PROJECT",
      message: "Synth preset must be an object.",
      path,
      recoverable: false
    };
  }
  const value = preset;
  if (!validId2(value.presetId) || !validId2(value.instrumentId) || !validId2(value.baseVoiceId) || !text2(value.name, 128) || !AUDIO_SYNTH_WAVEFORMS.includes(value.waveform) || !AUDIO_SYNTH_FILTER_TYPES.includes(value.filterType) || !AUDIO_SYNTH_NOISE_COLORS.includes(value.noiseColor)) {
    return {
      code: "AUDIO_INVALID_PROJECT",
      message: "Synth preset identity or enum fields are invalid.",
      path,
      recoverable: false
    };
  }
  const boundedFields = [
    [
      "dutyCycle",
      value.dutyCycle,
      0.01,
      0.99
    ],
    [
      "attackMs",
      value.attackMs,
      0,
      5e3
    ],
    [
      "decayMs",
      value.decayMs,
      1,
      1e4
    ],
    [
      "sustain",
      value.sustain,
      0,
      1
    ],
    [
      "releaseMs",
      value.releaseMs,
      1,
      1e4
    ],
    [
      "filterFrequencyHz",
      value.filterFrequencyHz,
      20,
      2e4
    ],
    [
      "filterQ",
      value.filterQ,
      0.1,
      18
    ],
    [
      "transientLevel",
      value.transientLevel,
      0,
      1
    ],
    [
      "transientMs",
      value.transientMs,
      0,
      1e3
    ],
    [
      "pitchStartRatio",
      value.pitchStartRatio,
      1,
      16
    ],
    [
      "pitchSweepMs",
      value.pitchSweepMs,
      0,
      1e3
    ],
    [
      "vibratoDepthCents",
      value.vibratoDepthCents,
      0,
      40
    ],
    [
      "vibratoRateHz",
      value.vibratoRateHz,
      0.5,
      16
    ]
  ];
  if (boundedFields.some(([, field, min, max]) => !boundedNumber(field, min, max))) {
    return {
      code: "AUDIO_INVALID_NUMBER",
      message: "Synth preset parameters are outside their safe ranges.",
      path,
      recoverable: false
    };
  }
  return null;
}
function validateProjectShape(project) {
  if (project === null || typeof project !== "object" || Array.isArray(project)) {
    return fail2("AUDIO_INVALID_PROJECT", "Project must be a canonical object.", "project");
  }
  if (hasRawAudioPayload(project)) {
    return fail2("AUDIO_RAW_PAYLOAD_REJECTED", "Canonical Project metadata cannot contain raw audio payload fields.", "project");
  }
  const value = project;
  if (value.schemaVersion !== "AUDIO-200_V1" || !validId2(value.projectId) || !text2(value.name) || value.projectRevision === void 0 || !boundedInteger(value.projectRevision, 0, AUDIO200_MAX_PROJECT_REVISION)) {
    return fail2("AUDIO_INVALID_PROJECT", "Project identity, schema, name, or revision is invalid.", "project");
  }
  if (value.createdAt === void 0 || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
    return fail2("AUDIO_INVALID_PROJECT", "Project timestamp is invalid.", "project.createdAt");
  }
  if (value.tempo === null || typeof value.tempo !== "object" || !boundedInteger(value.tempo.milliBpm, 2e4, 3e5)) {
    return fail2("AUDIO_INVALID_NUMBER", "Tempo must be a bounded fixed-point BPM value.", "project.tempo");
  }
  if (value.timebase === null || typeof value.timebase !== "object" || value.timebase.kind !== "PPQ" || !boundedInteger(value.timebase.ticksPerQuarter, 24, 3840)) {
    return fail2("AUDIO_INVALID_NUMBER", "Timebase must use a bounded PPQ value.", "project.timebase");
  }
  if (value.drumKitId !== void 0 && !isAudioDrumKitId(value.drumKitId)) {
    return fail2("AUDIO_INVALID_PROJECT", "Drum kit identifier is not supported.", "project.drumKitId");
  }
  if (value.synthPresets !== void 0 && !Array.isArray(value.synthPresets)) {
    return fail2("AUDIO_INVALID_PROJECT", "Project synthPresets must be an array when present.", "project.synthPresets");
  }
  const synthPresets = value.synthPresets ?? [];
  const synthPresetIds = synthPresets.map((item) => item?.presetId);
  if (synthPresetIds.some((id) => !validId2(id)) || unique2(synthPresetIds, "project.synthPresets") !== null) {
    return fail2("AUDIO_INVALID_PROJECT", "Synth preset identifiers are invalid or duplicated.", "project.synthPresets");
  }
  for (const [index, preset] of synthPresets.entries()) {
    const diagnostic = validateSynthPreset(preset, `project.synthPresets[${index}]`);
    if (diagnostic !== null) return {
      ok: false,
      diagnostics: [
        diagnostic
      ]
    };
  }
  if (typeof value.stateHash !== "string") {
    return fail2("AUDIO_INVALID_PROJECT", "Project state hash is required.", "project.stateHash");
  }
  try {
    asAudioContentHash(value.stateHash);
  } catch {
    return fail2("AUDIO_INVALID_PROJECT", "Project state hash must be SHA-256.", "project.stateHash");
  }
  for (const key of [
    "revisions",
    "tracks",
    "clips",
    "notes",
    "automations",
    "effects",
    "markers"
  ]) {
    if (!Array.isArray(value[key])) {
      return fail2("AUDIO_INVALID_PROJECT", `${key} must be an array.`, `project.${key}`);
    }
  }
  if (value.freezeStates !== void 0 && !Array.isArray(value.freezeStates)) {
    return fail2("AUDIO_FREEZE_INVALID", "Project freezeStates must be an array when present.", "project.freezeStates");
  }
  const freezeStates = value.freezeStates ?? [];
  const freezeIds = freezeStates.map((item) => {
    const freeze = item;
    return `${freeze?.trackId ?? ""}:${freeze?.frozenRevisionId ?? ""}:${freeze?.frozenClipId ?? ""}`;
  });
  if (freezeIds.some((id) => id.length <= 2) || unique2(freezeIds, "project.freezeStates") !== null) {
    return fail2("AUDIO_FREEZE_INVALID", "Freeze state identity is invalid or duplicated.", "project.freezeStates");
  }
  for (const [index, item] of freezeStates.entries()) {
    const freeze = item;
    let hashValid = false;
    if (typeof freeze?.sourceStateHash === "string") {
      try {
        asAudioContentHash(freeze.sourceStateHash);
        hashValid = true;
      } catch {
        hashValid = false;
      }
    }
    if (freeze === null || typeof freeze !== "object" || !validId2(freeze.trackId) || !validId2(freeze.frozenRevisionId) || !validId2(freeze.frozenClipId) || !hashValid || !boundedInteger(freeze.sourceProjectRevision, 0, AUDIO200_MAX_PROJECT_REVISION) || ![
      "ACTIVE",
      "INACTIVE",
      "STALE"
    ].includes(freeze.status) || typeof freeze.createdAt !== "string" || !Number.isFinite(Date.parse(freeze.createdAt))) {
      return fail2("AUDIO_FREEZE_INVALID", "Freeze state fields are invalid.", `project.freezeStates[${index}]`);
    }
  }
  const revisions = value.revisions;
  const tracks = value.tracks;
  const clips = value.clips;
  const notes = value.notes;
  const automations = value.automations;
  const effects = value.effects;
  const duplicateGroups = [
    [
      "revisionId",
      revisions.map((item) => item?.revisionId),
      "project.revisions"
    ],
    [
      "trackId",
      tracks.map((item) => item?.trackId),
      "project.tracks"
    ],
    [
      "clipId",
      clips.map((item) => item?.clipId),
      "project.clips"
    ],
    [
      "noteId",
      notes.map((item) => item?.noteId),
      "project.notes"
    ],
    [
      "automationId",
      automations.map((item) => item?.automationId),
      "project.automations"
    ],
    [
      "effectId",
      effects.map((item) => item?.effectId),
      "project.effects"
    ]
  ];
  for (const [key, group, path] of duplicateGroups) {
    if (group.some((item) => !validId2(item))) {
      return fail2("AUDIO_INVALID_ID", `${key} is invalid.`, path);
    }
    const duplicate = unique2(group, path);
    if (duplicate !== null) return {
      ok: false,
      diagnostics: [
        duplicate
      ]
    };
  }
  for (const [index, revision] of revisions.entries()) {
    const diagnostic = validateRevision(revision, `project.revisions[${index}]`);
    if (diagnostic !== null) return {
      ok: false,
      diagnostics: [
        diagnostic
      ]
    };
  }
  for (const [index, track] of tracks.entries()) {
    const diagnostic = validateTrack(track, `project.tracks[${index}]`);
    if (diagnostic !== null) return {
      ok: false,
      diagnostics: [
        diagnostic
      ]
    };
  }
  for (const [index, clip] of clips.entries()) {
    const valueClip = clip;
    const diagnostic = valueClip === null || typeof valueClip !== "object" || !validId2(valueClip.clipId) || !validId2(valueClip.trackId) || !validId2(valueClip.revisionId) || validTimeRange(valueClip.timeline, `project.clips[${index}].timeline`) !== null || !boundedInteger(valueClip.sourceOffsetUs, 0, Number.MAX_SAFE_INTEGER) || !boundedInteger(valueClip.gainMilliDb, -12e4, 24e3) || !boundedInteger(valueClip.fadeInTick, 0, AUDIO200_MAX_TICK) || !boundedInteger(valueClip.fadeOutTick, 0, AUDIO200_MAX_TICK) || typeof valueClip.loop !== "boolean" || valueClip.playbackRate !== void 0 && !boundedNumber(valueClip.playbackRate, 0.25, 4) ? {
      code: "AUDIO_INVALID_CLIP",
      message: "Clip fields or timeline are invalid.",
      path: `project.clips[${index}]`,
      recoverable: false
    } : null;
    if (diagnostic !== null) return {
      ok: false,
      diagnostics: [
        diagnostic
      ]
    };
  }
  for (const [index, note] of notes.entries()) {
    const valueNote = note;
    const diagnostic = valueNote === null || typeof valueNote !== "object" || !validId2(valueNote.noteId) || !validId2(valueNote.trackId) || !boundedInteger(valueNote.pitchMidi, 0, 127) || validTimeRange(valueNote.timeline, `project.notes[${index}].timeline`) !== null || !boundedInteger(valueNote.velocityMilli, 0, 1e3) ? {
      code: "AUDIO_INVALID_NOTE",
      message: "Note fields or timeline are invalid.",
      path: `project.notes[${index}]`,
      recoverable: false
    } : null;
    if (diagnostic !== null) return {
      ok: false,
      diagnostics: [
        diagnostic
      ]
    };
  }
  for (const [index, automation] of automations.entries()) {
    const valueAutomation = automation;
    const target = valueAutomation?.target;
    const points = valueAutomation?.points;
    const diagnostic = valueAutomation === null || typeof valueAutomation !== "object" || !validId2(valueAutomation.automationId) || target === null || ![
      "TRACK_GAIN",
      "TRACK_PAN",
      "MIXER_CHANNEL_GAIN",
      "MIXER_CHANNEL_PAN",
      "CLIP_GAIN",
      "FILTER_CUTOFF",
      "SYNTH_PARAMETER",
      "EFFECT_PARAMETER"
    ].includes(target.kind) || !validId2(target.targetId) || target.parameterName !== void 0 && !text2(target.parameterName, 128) || !Array.isArray(points) || points.length === 0 || points.some((point) => {
      const item = point;
      return item === null || typeof item !== "object" || !boundedInteger(item.tick, 0, AUDIO200_MAX_TICK) || !boundedNumber(item.value, -1e6, 1e6);
    }) ? {
      code: "AUDIO_INVALID_AUTOMATION",
      message: "Automation target or points are invalid.",
      path: `project.automations[${index}]`,
      recoverable: false
    } : null;
    if (diagnostic !== null) return {
      ok: false,
      diagnostics: [
        diagnostic
      ]
    };
  }
  const mixer = value.mixer;
  if (mixer === null || !validId2(mixer.mixerId) || !boundedInteger(mixer.masterGainMilliDb, -12e4, 24e3) || !Array.isArray(mixer.channels)) {
    return fail2("AUDIO_INVALID_MIXER", "Mixer fields are invalid.", "project.mixer");
  }
  const channels = mixer.channels;
  const channelIds = channels.map((channel) => channel?.channelId);
  const channelTrackIds = channels.map((channel) => channel?.trackId);
  if (channelIds.some((id) => !validId2(id)) || unique2(channelIds, "project.mixer.channels") !== null || unique2(channelTrackIds, "project.mixer.channels.trackId") !== null) {
    return fail2("AUDIO_INVALID_MIXER", "Mixer channel identifiers are invalid or duplicated.", "project.mixer.channels");
  }
  for (const [index, channel] of channels.entries()) {
    const item = channel;
    if (!validId2(item.trackId) || item.outputTrackId !== void 0 && !validId2(item.outputTrackId) || !boundedInteger(item.panMilli, -1e3, 1e3) || !boundedInteger(item.gainMilliDb, -12e4, 24e3) || typeof item.muted !== "boolean" || typeof item.solo !== "boolean") {
      return fail2("AUDIO_INVALID_MIXER", "Mixer channel fields are invalid.", `project.mixer.channels[${index}]`);
    }
  }
  if (mixer.sends !== void 0 && !Array.isArray(mixer.sends)) {
    return fail2("AUDIO_INVALID_MIXER", "Mixer sends must be an array when present.", "project.mixer.sends");
  }
  for (const [index, send] of (mixer.sends ?? []).entries()) {
    const item = send;
    if (item === null || typeof item !== "object" || !validId2(item.sendId) || !validId2(item.sourceTrackId) || !validId2(item.destinationTrackId) || !boundedInteger(item.amountMilliDb, -12e4, 24e3) || typeof item.preFader !== "boolean") {
      return fail2("AUDIO_INVALID_MIXER", "Mixer Send fields are invalid.", `project.mixer.sends[${index}]`);
    }
  }
  for (const [index, effect] of effects.entries()) {
    const item = effect;
    if (!validId2(item.effectId) || ![
      "GAIN",
      "EQ",
      "COMPRESSOR",
      "REVERB",
      "DELAY",
      "CUSTOM"
    ].includes(item.kind) || typeof item.enabled !== "boolean" || !Array.isArray(item.parameters) || item.parameters.some((parameter) => {
      const valueParameter = parameter;
      return !text2(valueParameter.name, 128) || !boundedNumber(valueParameter.value, -1e6, 1e6);
    })) {
      return fail2("AUDIO_INVALID_EFFECT", "Effect fields or parameters are invalid.", `project.effects[${index}]`);
    }
  }
  if (value.master !== void 0) {
    const master = value.master;
    const effectIds = master?.effectIds;
    if (master === null || typeof master !== "object" || !boundedInteger(master.gainMilliDb, -12e4, 24e3) || typeof master.limiterEnabled !== "boolean" || !boundedInteger(master.limiterCeilingMilliDb, -12e4, 0) || typeof master.bypass !== "boolean" || !Array.isArray(effectIds) || effectIds.some((effectId) => !validId2(effectId)) || unique2(effectIds, "project.master.effectIds") !== null) {
      return fail2("AUDIO_INVALID_PROJECT", "Master state or FX chain references are invalid.", "project.master");
    }
  }
  const markers = value.markers;
  const markerIds = markers.map((marker) => marker?.markerId);
  if (markerIds.some((id) => !validId2(id)) || unique2(markerIds, "project.markers") !== null) {
    return fail2("AUDIO_INVALID_PROJECT", "Marker identifiers are invalid or duplicated.", "project.markers");
  }
  for (const [index, marker] of markers.entries()) {
    const item = marker;
    if (!validId2(item.frameId) || validTimeRange({
      startTick: item.tick,
      durationTick: 1
    }, `project.markers[${index}].tick`) !== null || !text2(item.label, 256)) {
      return fail2("AUDIO_INVALID_PROJECT", "Marker fields are invalid.", `project.markers[${index}]`);
    }
  }
  return audioOk(true);
}
async function hashAudioProjectState(project) {
  const { stateHash: _stateHash, ...material } = project;
  return audioOk(asAudioContentHash(await hashCanonical(material)));
}
async function validateAudioProject(project, verifyHash = true) {
  const shape = validateProjectShape(project);
  if (!shape.ok) return shape;
  if (verifyHash) {
    const hash = await hashAudioProjectState(project);
    if (!hash.ok || hash.value !== project.stateHash) {
      return fail2("AUDIO_METADATA_MISMATCH", "Project state hash does not match canonical metadata.", "project.stateHash");
    }
  }
  const revisionsById = new Set(project.revisions.map((revision) => revision.revisionId));
  const tracksById = new Set(project.tracks.map((track) => track.trackId));
  const effectIds = new Set(project.effects.map((effect) => effect.effectId));
  const channelsById = new Set(project.mixer.channels.map((channel) => channel.channelId));
  const channelsByChannelId = new Map(project.mixer.channels.map((channel) => [
    channel.channelId,
    channel
  ]));
  const revisionsByRevision = new Map(project.revisions.map((revision) => [
    revision.revisionId,
    revision
  ]));
  const clipsById = new Map(project.clips.map((clip) => [
    clip.clipId,
    clip
  ]));
  const notesById = new Map(project.notes.map((note) => [
    note.noteId,
    note
  ]));
  const automationsById = new Map(project.automations.map((automation) => [
    automation.automationId,
    automation
  ]));
  const effectsById = new Map(project.effects.map((effect) => [
    effect.effectId,
    effect
  ]));
  if (project.master !== void 0) {
    for (const effectId of project.master.effectIds) {
      if (!effectsById.has(effectId)) {
        return fail2("AUDIO_INVALID_EFFECT", "Master references a missing canonical Effect.", `master.effectIds.${String(effectId)}`);
      }
    }
  }
  for (const [index, freeze] of (project.freezeStates ?? []).entries()) {
    const track = project.tracks.find((item) => item.trackId === freeze.trackId);
    const clip = project.clips.find((item) => item.clipId === freeze.frozenClipId);
    const revision = project.revisions.find((item) => item.revisionId === freeze.frozenRevisionId);
    if (track === void 0 || clip === void 0 || revision === void 0 || clip.trackId !== freeze.trackId || clip.revisionId !== freeze.frozenRevisionId || !track.clipIds.includes(freeze.frozenClipId)) {
      return fail2("AUDIO_FREEZE_INVALID", "Freeze state does not bind to a canonical Track, Clip, and Revision.", `freezeStates.${index}`);
    }
  }
  for (const clip of project.clips) {
    const revision = revisionsByRevision.get(clip.revisionId);
    if (!tracksById.has(clip.trackId) || revision === void 0) {
      return fail2("AUDIO_REVISION_NOT_FOUND", "Clip references a missing Track or Revision.", `clips.${clip.clipId}`);
    }
    if (clip.sourceOffsetUs >= revision.source.metadata.durationUs) {
      return fail2("AUDIO_INVALID_CLIP", "Clip source offset is outside the canonical source duration.", `clips.${clip.clipId}.sourceOffsetUs`);
    }
    if (clip.timeline.durationTick < clip.fadeInTick + clip.fadeOutTick) {
      return fail2("AUDIO_OVERFLOW", "Clip fade range exceeds the clip timeline.", `clips.${clip.clipId}`);
    }
  }
  for (const note of project.notes) {
    if (!tracksById.has(note.trackId)) {
      return fail2("AUDIO_INVALID_NOTE", "Note references a missing Track.", `notes.${note.noteId}`);
    }
  }
  for (const automation of project.automations) {
    const targetId = automation.target.targetId;
    const targetKind = automation.target.kind;
    const targetExists = targetKind === "TRACK_GAIN" || targetKind === "TRACK_PAN" || targetKind === "FILTER_CUTOFF" || targetKind === "SYNTH_PARAMETER" ? tracksById.has(targetId) : targetKind === "MIXER_CHANNEL_GAIN" || targetKind === "MIXER_CHANNEL_PAN" ? channelsById.has(targetId) : targetKind === "CLIP_GAIN" ? clipsById.has(targetId) : targetKind === "EFFECT_PARAMETER" ? effectIds.has(targetId) : false;
    const parameterNameValid = targetKind === "EFFECT_PARAMETER" || targetKind === "SYNTH_PARAMETER" ? typeof automation.target.parameterName === "string" && automation.target.parameterName.trim().length > 0 : true;
    if (!targetExists || !parameterNameValid) {
      return fail2("AUDIO_INVALID_AUTOMATION", "Automation references a missing target.", `automations.${automation.automationId}`);
    }
  }
  for (const channel of project.mixer.channels) {
    if (!tracksById.has(channel.trackId)) {
      return fail2("AUDIO_INVALID_MIXER", "Mixer channel references a missing Track.", `mixer.channels.${channel.channelId}`);
    }
  }
  for (const track of project.tracks) {
    if (!channelsById.has(track.mixerChannelId)) {
      return fail2("AUDIO_INVALID_TRACK", "Track references a missing Mixer channel.", `tracks.${track.trackId}`);
    }
    const channel = channelsByChannelId.get(track.mixerChannelId);
    if (channel?.trackId !== track.trackId) {
      return fail2("AUDIO_INVALID_TRACK", "Track and Mixer channel graph bindings are inconsistent.", `tracks.${track.trackId}.mixerChannelId`);
    }
    if (track.clipIds.some((id) => clipsById.get(id)?.trackId !== track.trackId) || track.noteIds.some((id) => notesById.get(id)?.trackId !== track.trackId) || track.automationIds.some((id) => automationsById.has(id) === false) || track.effectIds.some((id) => effectsById.has(id) === false)) {
      return fail2("AUDIO_INVALID_TRACK", "Track child references are not consistent with canonical entities.", `tracks.${track.trackId}`);
    }
  }
  const routing = buildAudioRoutingGraph(project.mixer, project.tracks);
  if (!routing.ok) return routing;
  return audioOk(true);
}
async function createAudioProject(input) {
  const draft = {
    schemaVersion: "AUDIO-200_V1",
    projectId: input.projectId,
    name: input.name,
    createdAt: input.createdAt,
    projectRevision: 0,
    stateHash: "0".repeat(64),
    tempo: input.tempo ?? {
      milliBpm: AUDIO200_DEFAULT_TEMPO_MILLIBPM
    },
    timebase: input.timebase ?? {
      kind: "PPQ",
      ticksPerQuarter: AUDIO200_DEFAULT_PPQ
    },
    drumKitId: "BASIC",
    synthPresets: [],
    revisions: [],
    tracks: [],
    clips: [],
    notes: [],
    automations: [],
    mixer: {
      mixerId: input.mixerId ?? `${input.projectId}:mixer`,
      channels: [],
      masterGainMilliDb: 0
    },
    effects: [],
    markers: [],
    master: {
      gainMilliDb: 0,
      limiterEnabled: false,
      limiterCeilingMilliDb: -1e3,
      bypass: false,
      effectIds: []
    }
  };
  const shape = await validateAudioProject(draft, false);
  if (!shape.ok) return shape;
  const hash = await hashAudioProjectState(draft);
  if (!hash.ok) return hash;
  return audioOk({
    ...draft,
    stateHash: hash.value
  });
}
function createAudioCommand(input) {
  if (!validId2(input.commandId) || !text2(input.idempotencyKey, 256) || !validId2(input.projectId) || !boundedInteger(input.baseProjectRevision, 0, AUDIO200_MAX_PROJECT_REVISION) || !COMMAND_TYPES.includes(input.type) || typeof input.payload !== "object" || hasRawAudioPayload(input.payload) || !text2(input.issuedAt, 64) || !Number.isFinite(Date.parse(input.issuedAt))) {
    return fail2("AUDIO_COMMAND_INVALID", "Command identity, revision, payload, or timestamp is invalid.", "command");
  }
  return audioOk({
    schemaVersion: "AUDIO-200_V1",
    ...input
  });
}
function entityFromPayload(payload, key) {
  const value = payload;
  return value[key] ?? null;
}
function replaceById(values, key, value) {
  const identifier = value[key];
  const index = values.findIndex((item) => item[key] === identifier);
  if (index < 0) return [
    ...values,
    value
  ];
  return values.map((item, itemIndex) => itemIndex === index ? value : item);
}
function markActiveFreezesStale(project) {
  if (project.freezeStates === void 0) return void 0;
  return project.freezeStates.map((freeze) => freeze.status === "ACTIVE" ? {
    ...freeze,
    status: "STALE"
  } : freeze);
}
async function applyAudioCommand(project, command) {
  const current = await validateAudioProject(project);
  if (!current.ok) return current;
  if (command.projectId !== project.projectId) {
    return fail2("AUDIO_COMMAND_INVALID", "Command Project ID does not match the current Project.", "command.projectId");
  }
  if (command.baseProjectRevision !== project.projectRevision) {
    return fail2("AUDIO_STALE_PROJECT_REVISION", "Command was based on a stale Project revision.", "command.baseProjectRevision");
  }
  const payload = command.payload;
  let next = {
    ...project,
    projectRevision: project.projectRevision + 1
  };
  switch (command.type) {
    case "TRACK_ADD": {
      const track = entityFromPayload(payload, "track");
      if (track === null || project.tracks.some((item) => item.trackId === track.trackId)) {
        return fail2("AUDIO_DUPLICATE_ID", "Track ID already exists or payload is invalid.", "command.payload.track");
      }
      next = {
        ...next,
        tracks: [
          ...project.tracks,
          track
        ],
        mixer: {
          ...project.mixer,
          channels: [
            ...project.mixer.channels,
            {
              channelId: track.mixerChannelId,
              trackId: track.trackId,
              panMilli: 0,
              gainMilliDb: 0,
              muted: false,
              solo: false
            }
          ]
        }
      };
      break;
    }
    case "TRACK_REMOVE": {
      const trackId = entityFromPayload(payload, "trackId");
      const removed = trackId === null ? void 0 : project.tracks.find((track) => track.trackId === trackId);
      if (removed === void 0) {
        return fail2("AUDIO_INVALID_TRACK", "Track removal requires an existing canonical Track.", "command.payload.trackId");
      }
      const removedClipIds = new Set(project.clips.filter((clip) => clip.trackId === trackId).map((clip) => String(clip.clipId)));
      const removedNoteIds = new Set(project.notes.filter((note) => note.trackId === trackId).map((note) => String(note.noteId)));
      const removedAutomationIds = new Set(removed.automationIds.map(String));
      const removedEffectIds = new Set(removed.effectIds.map(String));
      const removedChannelIds = /* @__PURE__ */ new Set([
        String(removed.mixerChannelId)
      ]);
      const channels = project.mixer.channels.filter((channel) => channel.trackId !== trackId).map((channel) => {
        if (String(channel.outputTrackId) !== String(trackId)) return channel;
        const { outputTrackId: _outputTrackId, ...withoutOutput } = channel;
        return withoutOutput;
      });
      const sends = (project.mixer.sends ?? []).filter((send) => send.sourceTrackId !== trackId && send.destinationTrackId !== trackId);
      next = {
        ...next,
        tracks: project.tracks.filter((track) => track.trackId !== trackId),
        clips: project.clips.filter((clip) => !removedClipIds.has(String(clip.clipId))),
        notes: project.notes.filter((note) => !removedNoteIds.has(String(note.noteId))),
        automations: project.automations.filter((automation) => !removedAutomationIds.has(String(automation.automationId)) && !removedClipIds.has(automation.target.targetId) && !removedChannelIds.has(automation.target.targetId) && !removedEffectIds.has(automation.target.targetId) && automation.target.targetId !== String(trackId)),
        effects: project.effects.filter((effect) => !removedEffectIds.has(String(effect.effectId))),
        mixer: {
          ...project.mixer,
          channels,
          ...sends.length > 0 || project.mixer.sends !== void 0 ? {
            sends
          } : {}
        },
        ...project.freezeStates === void 0 ? {} : {
          freezeStates: project.freezeStates.filter((freeze) => freeze.trackId !== trackId)
        }
      };
      break;
    }
    case "REVISION_ATTACH": {
      const revision = entityFromPayload(payload, "revision");
      if (revision === null || project.revisions.some((item) => item.revisionId === revision.revisionId)) {
        return fail2("AUDIO_DUPLICATE_ID", "Revision ID already exists or payload is invalid.", "command.payload.revision");
      }
      next = {
        ...next,
        revisions: [
          ...project.revisions,
          revision
        ]
      };
      break;
    }
    case "RECORDING_COMMIT": {
      const recording = entityFromPayload(payload, "recording");
      if (recording === null || project.revisions.some((item) => item.revisionId === recording.revision.revisionId) || project.clips.some((item) => item.clipId === recording.clip.clipId)) {
        return fail2("AUDIO_DUPLICATE_ID", "Recording commit revision or Clip ID already exists.", "command.payload.recording");
      }
      if (recording.clip.revisionId !== recording.revision.revisionId || !project.tracks.some((track) => track.trackId === recording.clip.trackId)) {
        return fail2("AUDIO_INVALID_CLIP", "Recording commit must bind the new Clip to its Revision and Track.", "command.payload.recording.clip");
      }
      next = {
        ...next,
        revisions: [
          ...project.revisions,
          recording.revision
        ],
        clips: [
          ...project.clips,
          recording.clip
        ],
        tracks: project.tracks.map((track) => track.trackId === recording.clip.trackId ? {
          ...track,
          clipIds: [
            ...track.clipIds,
            recording.clip.clipId
          ]
        } : track)
      };
      break;
    }
    case "BOUNCE_COMMIT": {
      const bounce = entityFromPayload(payload, "bounce");
      if (bounce === null || project.revisions.some((item) => item.revisionId === bounce.revision.revisionId) || project.clips.some((item) => item.clipId === bounce.clip.clipId) || bounce.clip.revisionId !== bounce.revision.revisionId || !project.tracks.some((track) => track.trackId === bounce.clip.trackId) || !text2(bounce.sourceName, 256)) {
        return fail2("AUDIO_BOUNCE_INVALID", "Bounce must bind a new Revision and Clip to an existing Track.", "command.payload.bounce");
      }
      next = {
        ...next,
        revisions: [
          ...project.revisions,
          bounce.revision
        ],
        clips: [
          ...project.clips,
          bounce.clip
        ],
        tracks: project.tracks.map((track) => track.trackId === bounce.clip.trackId ? {
          ...track,
          clipIds: [
            ...track.clipIds,
            bounce.clip.clipId
          ]
        } : track)
      };
      break;
    }
    case "FREEZE_COMMIT": {
      const commit = entityFromPayload(payload, "freeze");
      const freeze = commit?.freeze;
      if (commit === null || freeze === void 0 || project.revisions.some((item) => item.revisionId === commit.revision.revisionId) || project.clips.some((item) => item.clipId === commit.clip.clipId) || commit.clip.revisionId !== commit.revision.revisionId || commit.clip.trackId !== freeze.trackId || commit.clip.clipId !== freeze.frozenClipId || commit.revision.revisionId !== freeze.frozenRevisionId || freeze.sourceProjectRevision !== project.projectRevision || !project.tracks.some((track) => track.trackId === freeze.trackId) || !text2(commit.sourceName, 256)) {
        return fail2("AUDIO_FREEZE_INVALID", "Freeze must bind a new Revision and Clip to the source Track.", "command.payload.freeze");
      }
      const freezeStates = (project.freezeStates ?? []).map((item) => item.trackId === freeze.trackId && item.status === "ACTIVE" ? {
        ...item,
        status: "STALE"
      } : item);
      next = {
        ...next,
        revisions: [
          ...project.revisions,
          commit.revision
        ],
        clips: [
          ...project.clips,
          commit.clip
        ],
        tracks: project.tracks.map((track) => track.trackId === freeze.trackId ? {
          ...track,
          clipIds: [
            ...track.clipIds,
            commit.clip.clipId
          ]
        } : track),
        freezeStates: [
          ...freezeStates,
          freeze
        ]
      };
      break;
    }
    case "FREEZE_UNFREEZE": {
      const trackId = entityFromPayload(payload, "freezeTrackId");
      if (trackId === null || !validId2(trackId) || !project.tracks.some((track) => track.trackId === trackId) || !(project.freezeStates ?? []).some((item) => item.trackId === trackId && item.status === "ACTIVE")) {
        return fail2("AUDIO_FREEZE_INVALID", "Unfreeze requires an active Freeze on an existing Track.", "command.payload.freezeTrackId");
      }
      next = {
        ...next,
        freezeStates: (project.freezeStates ?? []).map((item) => item.trackId === trackId && item.status === "ACTIVE" ? {
          ...item,
          status: "INACTIVE"
        } : item)
      };
      break;
    }
    case "FREEZE_REACTIVATE": {
      const trackId = entityFromPayload(payload, "freezeTrackId");
      const sourceHash = entityFromPayload(payload, "freezeSourceStateHash");
      const matching = (project.freezeStates ?? []).find((freeze) => freeze.trackId === trackId && freeze.sourceStateHash === sourceHash && (freeze.status === "INACTIVE" || freeze.status === "STALE"));
      if (trackId === null || !validId2(trackId) || sourceHash === null || !validId2(sourceHash) || matching === void 0) {
        return fail2("AUDIO_FREEZE_STALE", "Freeze reactivation requires a matching inactive source fingerprint.", "command.payload.freezeSourceStateHash");
      }
      next = {
        ...next,
        freezeStates: (project.freezeStates ?? []).map((freeze) => freeze.trackId === trackId ? freeze === matching ? {
          ...freeze,
          status: "ACTIVE"
        } : freeze.status === "ACTIVE" ? {
          ...freeze,
          status: "STALE"
        } : freeze : freeze)
      };
      break;
    }
    case "CLIP_ADD": {
      const clip = entityFromPayload(payload, "clip");
      if (clip === null || project.clips.some((item) => item.clipId === clip.clipId)) {
        return fail2("AUDIO_DUPLICATE_ID", "Clip ID already exists or payload is invalid.", "command.payload.clip");
      }
      next = {
        ...next,
        clips: [
          ...project.clips,
          clip
        ],
        tracks: project.tracks.map((track) => track.trackId === clip.trackId ? {
          ...track,
          clipIds: [
            ...track.clipIds,
            clip.clipId
          ]
        } : track)
      };
      break;
    }
    case "CLIP_UPDATE": {
      const clip = entityFromPayload(payload, "clip");
      const previous = clip === null ? void 0 : project.clips.find((item) => item.clipId === clip.clipId);
      if (clip === null || previous === void 0) {
        return fail2("AUDIO_COMMAND_INVALID", "Clip update requires an existing Clip.", "command.payload.clip");
      }
      if (previous.trackId !== clip.trackId || previous.revisionId !== clip.revisionId) {
        return fail2("AUDIO_INVALID_CLIP", "Clip move/trim cannot rebind its Track or Asset Revision.", "command.payload.clip");
      }
      next = {
        ...next,
        clips: project.clips.map((item) => item.clipId === clip.clipId ? clip : item)
      };
      break;
    }
    case "CLIP_SPLIT": {
      const split = entityFromPayload(payload, "clipSplit");
      const source = split === null ? void 0 : project.clips.find((clip) => clip.clipId === split.sourceClipId);
      const left = split?.leftClip;
      const right = split?.rightClip;
      if (split === null || source === void 0 || left === void 0 || right === void 0) {
        return fail2("AUDIO_COMMAND_INVALID", "Clip split requires an existing source and two replacement Clips.", "command.payload.clipSplit");
      }
      if (left.clipId === right.clipId || left.clipId === source.clipId || right.clipId === source.clipId || project.clips.some((clip) => clip.clipId !== source.clipId && (clip.clipId === left.clipId || clip.clipId === right.clipId))) {
        return fail2("AUDIO_DUPLICATE_ID", "Clip split replacement IDs must be new and unique.", "command.payload.clipSplit");
      }
      const leftEnd = left.timeline.startTick + left.timeline.durationTick;
      const sourceEnd = source.timeline.startTick + source.timeline.durationTick;
      const rightEnd = right.timeline.startTick + right.timeline.durationTick;
      if (left.trackId !== source.trackId || right.trackId !== source.trackId || left.revisionId !== source.revisionId || right.revisionId !== source.revisionId || right.timeline.startTick !== leftEnd || left.timeline.startTick !== source.timeline.startTick || rightEnd !== sourceEnd || left.sourceOffsetUs !== source.sourceOffsetUs || right.timeline.durationTick < 1 || left.timeline.durationTick < 1 || right.sourceOffsetUs < left.sourceOffsetUs) {
        return fail2("AUDIO_INVALID_CLIP", "Clip split replacements must be contiguous and keep the Track/Revision binding.", "command.payload.clipSplit");
      }
      const replacement = project.clips.flatMap((clip) => clip.clipId === source.clipId ? [
        left,
        right
      ] : [
        clip
      ]);
      next = {
        ...next,
        clips: replacement,
        tracks: project.tracks.map((track) => track.trackId !== source.trackId ? track : {
          ...track,
          clipIds: track.clipIds.flatMap((id) => id === source.clipId ? [
            left.clipId,
            right.clipId
          ] : [
            id
          ])
        })
      };
      break;
    }
    case "CLIP_REMOVE": {
      const clipId = entityFromPayload(payload, "clipId");
      if (clipId === null || !validId2(clipId)) {
        return fail2("AUDIO_COMMAND_INVALID", "Clip ID payload is invalid.", "command.payload.clipId");
      }
      if (!project.clips.some((clip) => clip.clipId === clipId)) {
        return fail2("AUDIO_COMMAND_INVALID", "Clip ID does not exist in the current Project.", "command.payload.clipId");
      }
      next = {
        ...next,
        clips: project.clips.filter((clip) => clip.clipId !== clipId),
        tracks: project.tracks.map((track) => track.clipIds.includes(clipId) ? {
          ...track,
          clipIds: track.clipIds.filter((id) => id !== clipId)
        } : track)
      };
      break;
    }
    case "TIMELINE_BAR_CLEAR": {
      const range = entityFromPayload(payload, "timelineBar");
      const startTick = range?.startTick;
      const durationTick = range?.durationTick;
      const endTick = typeof startTick === "number" && typeof durationTick === "number" ? startTick + durationTick : NaN;
      if (!boundedInteger(startTick, 0, AUDIO200_MAX_TICK) || !boundedInteger(durationTick, 1, AUDIO200_MAX_TICK) || !Number.isSafeInteger(endTick) || endTick > AUDIO200_MAX_TICK) {
        return fail2("AUDIO_INVALID_NUMBER", "Timeline bar range must be bounded non-negative ticks.", "command.payload.timelineBar");
      }
      const noteEdits = project.notes.flatMap((note) => {
        const noteStart = note.timeline.startTick;
        const noteEnd = noteStart + note.timeline.durationTick;
        if (noteEnd <= startTick || noteStart >= endTick) return [
          note
        ];
        if (noteStart < startTick) {
          const leftDuration = startTick - noteStart;
          return leftDuration > 0 ? [
            {
              ...note,
              timeline: {
                startTick: noteStart,
                durationTick: leftDuration
              }
            }
          ] : [];
        }
        if (noteEnd > endTick) {
          return [
            {
              ...note,
              timeline: {
                startTick: endTick,
                durationTick: noteEnd - endTick
              }
            }
          ];
        }
        return [];
      });
      const removedNoteIds = new Set(project.notes.filter((note) => !noteEdits.some((item) => item.noteId === note.noteId)).map((note) => note.noteId));
      const clipEdits = project.clips.flatMap((clip) => {
        const clipStart = clip.timeline.startTick;
        const clipEnd = clipStart + clip.timeline.durationTick;
        if (clipEnd <= startTick || clipStart >= endTick) return [
          clip
        ];
        if (clipStart < startTick) {
          const leftDuration = startTick - clipStart;
          return leftDuration > 0 ? [
            {
              ...clip,
              timeline: {
                startTick: clipStart,
                durationTick: leftDuration
              },
              fadeOutTick: Math.min(clip.fadeOutTick, leftDuration)
            }
          ] : [];
        }
        if (clipEnd > endTick) {
          const rightDuration = clipEnd - endTick;
          const tickDelta = endTick - clipStart;
          const sourceOffsetDeltaUs = Math.round(6e10 * tickDelta / (Math.max(1, project.tempo.milliBpm) * Math.max(1, project.timebase.ticksPerQuarter)));
          return [
            {
              ...clip,
              timeline: {
                startTick: endTick,
                durationTick: rightDuration
              },
              sourceOffsetUs: clip.sourceOffsetUs + sourceOffsetDeltaUs,
              fadeInTick: 0,
              fadeOutTick: Math.min(clip.fadeOutTick, rightDuration)
            }
          ];
        }
        return [];
      });
      const removedClipIds = new Set(project.clips.filter((clip) => !clipEdits.some((item) => item.clipId === clip.clipId)).map((clip) => clip.clipId));
      const nextAutomations = project.automations.map((automation) => ({
        ...automation,
        points: automation.points.filter((point) => point.tick < startTick || point.tick >= endTick)
      })).filter((automation) => automation.points.length > 0);
      const removedAutomationIds = new Set(project.automations.filter((automation) => !nextAutomations.some((item) => item.automationId === automation.automationId)).map((automation) => automation.automationId));
      const nextMarkers = project.markers.filter((marker) => marker.tick < startTick || marker.tick >= endTick);
      const removedMarkerIds = new Set(project.markers.filter((marker) => !nextMarkers.some((item) => item.markerId === marker.markerId)).map((marker) => marker.markerId));
      const hasTrimmedNotes = project.notes.some((note) => {
        const nextNote = noteEdits.find((item) => item.noteId === note.noteId);
        return nextNote !== void 0 && (nextNote.timeline.startTick !== note.timeline.startTick || nextNote.timeline.durationTick !== note.timeline.durationTick);
      });
      const hasTrimmedClips = project.clips.some((clip) => {
        const nextClip = clipEdits.find((item) => item.clipId === clip.clipId);
        return nextClip !== void 0 && (nextClip.timeline.startTick !== clip.timeline.startTick || nextClip.timeline.durationTick !== clip.timeline.durationTick || nextClip.sourceOffsetUs !== clip.sourceOffsetUs);
      });
      if (removedNoteIds.size === 0 && removedClipIds.size === 0 && removedAutomationIds.size === 0 && removedMarkerIds.size === 0 && !hasTrimmedNotes && !hasTrimmedClips) {
        return fail2("AUDIO_COMMAND_INVALID", "Selected timeline bar has no removable content.", "command.payload.timelineBar", true);
      }
      next = {
        ...next,
        clips: clipEdits,
        notes: noteEdits,
        automations: nextAutomations,
        markers: nextMarkers,
        tracks: project.tracks.map((track) => ({
          ...track,
          clipIds: track.clipIds.filter((id) => !removedClipIds.has(id)),
          noteIds: track.noteIds.filter((id) => !removedNoteIds.has(id)),
          automationIds: track.automationIds.filter((id) => !removedAutomationIds.has(id))
        }))
      };
      if (project.freezeStates !== void 0) {
        next = {
          ...next,
          freezeStates: project.freezeStates.filter((freeze) => !removedClipIds.has(freeze.frozenClipId))
        };
      }
      break;
    }
    case "NOTE_UPSERT": {
      const note = entityFromPayload(payload, "note");
      if (note === null) {
        return fail2("AUDIO_COMMAND_INVALID", "Note payload is invalid.", "command.payload.note");
      }
      next = {
        ...next,
        notes: replaceById(project.notes, "noteId", note),
        tracks: project.tracks.map((track) => track.trackId === note.trackId && !track.noteIds.includes(note.noteId) ? {
          ...track,
          noteIds: [
            ...track.noteIds,
            note.noteId
          ]
        } : track)
      };
      break;
    }
    case "NOTE_REMOVE": {
      const noteId = entityFromPayload(payload, "noteId");
      if (noteId === null || !validId2(noteId)) {
        return fail2("AUDIO_COMMAND_INVALID", "Note ID payload is invalid.", "command.payload.noteId");
      }
      if (!project.notes.some((note) => note.noteId === noteId)) {
        return fail2("AUDIO_COMMAND_INVALID", "Note ID does not exist in the current Project.", "command.payload.noteId");
      }
      next = {
        ...next,
        notes: project.notes.filter((note) => note.noteId !== noteId),
        tracks: project.tracks.map((track) => track.noteIds.includes(noteId) ? {
          ...track,
          noteIds: track.noteIds.filter((id) => id !== noteId)
        } : track)
      };
      break;
    }
    case "AUTOMATION_UPSERT": {
      const automation = entityFromPayload(payload, "automation");
      if (automation === null) {
        return fail2("AUDIO_COMMAND_INVALID", "Automation payload is invalid.", "command.payload.automation");
      }
      const targetTrackId = automation.target.kind === "TRACK_GAIN" || automation.target.kind === "TRACK_PAN" || automation.target.kind === "FILTER_CUTOFF" || automation.target.kind === "SYNTH_PARAMETER" ? automation.target.targetId : automation.target.kind === "MIXER_CHANNEL_GAIN" || automation.target.kind === "MIXER_CHANNEL_PAN" ? project.mixer.channels.find((channel) => String(channel.channelId) === automation.target.targetId)?.trackId : automation.target.kind === "CLIP_GAIN" ? project.clips.find((clip) => String(clip.clipId) === automation.target.targetId)?.trackId : project.tracks.find((track) => track.effectIds.some((effectId) => String(effectId) === automation.target.targetId))?.trackId;
      next = {
        ...next,
        automations: replaceById(project.automations, "automationId", automation),
        tracks: project.tracks.map((track) => ({
          ...track,
          automationIds: track.automationIds.filter((id) => id !== automation.automationId).concat(targetTrackId !== void 0 && track.trackId === targetTrackId ? [
            automation.automationId
          ] : [])
        }))
      };
      break;
    }
    case "AUTOMATION_REMOVE": {
      const automationId = entityFromPayload(payload, "automationId");
      if (automationId === null || !project.automations.some((item) => item.automationId === automationId)) {
        return fail2("AUDIO_COMMAND_INVALID", "Automation ID does not exist in the current Project.", "command.payload.automationId");
      }
      next = {
        ...next,
        automations: project.automations.filter((item) => item.automationId !== automationId),
        tracks: project.tracks.map((track) => ({
          ...track,
          automationIds: track.automationIds.filter((id) => id !== automationId)
        }))
      };
      break;
    }
    case "MIXER_REPLACE": {
      const mixer = entityFromPayload(payload, "mixer");
      if (mixer === null) {
        return fail2("AUDIO_COMMAND_INVALID", "Mixer payload is invalid.", "command.payload.mixer");
      }
      next = {
        ...next,
        mixer
      };
      break;
    }
    case "EFFECT_UPSERT": {
      const effect = entityFromPayload(payload, "effect");
      if (effect === null) {
        return fail2("AUDIO_COMMAND_INVALID", "Effect payload is invalid.", "command.payload.effect");
      }
      next = {
        ...next,
        effects: replaceById(project.effects, "effectId", effect)
      };
      break;
    }
    case "EFFECT_CHAIN_REPLACE": {
      const chain = entityFromPayload(payload, "effectChain");
      const track = chain === null ? void 0 : project.tracks.find((item) => item.trackId === chain.trackId);
      const effectIds = chain?.effects.map((effect) => String(effect.effectId)) ?? [];
      if (chain === null || track === void 0 || !Array.isArray(chain.effects) || effectIds.some((id) => !validId2(id)) || new Set(effectIds).size !== effectIds.length) {
        return fail2("AUDIO_INVALID_EFFECT", "Effect chain must bind an existing Track and unique Effect records.", "command.payload.effectChain");
      }
      next = {
        ...next,
        effects: chain.effects.reduce((effects, effect) => replaceById(effects, "effectId", effect), project.effects),
        tracks: project.tracks.map((item) => item.trackId === track.trackId ? {
          ...item,
          effectIds: chain.effects.map((effect) => effect.effectId)
        } : item)
      };
      break;
    }
    case "MASTER_REPLACE": {
      const payloadMaster = entityFromPayload(payload, "master");
      if (payloadMaster === null || payloadMaster.master === void 0) {
        return fail2("AUDIO_INVALID_PROJECT", "Master payload is invalid.", "command.payload.master");
      }
      const effects = (payloadMaster.effects ?? []).reduce((items, effect) => replaceById(items, "effectId", effect), project.effects);
      next = {
        ...next,
        effects,
        master: payloadMaster.master
      };
      break;
    }
    case "DRUM_KIT_SET": {
      const drumKitId = entityFromPayload(payload, "drumKitId");
      if (drumKitId === null || !isAudioDrumKitId(drumKitId)) {
        return fail2("AUDIO_INVALID_PROJECT", "Drum kit identifier is not supported.", "command.payload.drumKitId");
      }
      next = {
        ...next,
        drumKitId
      };
      break;
    }
    case "SYNTH_PRESET_REPLACE": {
      const synthPreset = entityFromPayload(payload, "synthPreset");
      const diagnostic = synthPreset === null ? {
        code: "AUDIO_INVALID_PROJECT",
        message: "Synth preset payload is invalid.",
        path: "command.payload.synthPreset",
        recoverable: false
      } : validateSynthPreset(synthPreset, "command.payload.synthPreset");
      if (diagnostic !== null) return {
        ok: false,
        diagnostics: [
          diagnostic
        ]
      };
      next = {
        ...next,
        synthPresets: replaceById(project.synthPresets ?? [], "presetId", synthPreset)
      };
      break;
    }
    case "SYNTH_PRESET_REMOVE": {
      const synthPresetId = entityFromPayload(payload, "synthPresetId");
      if (synthPresetId === null || !validId2(synthPresetId) || !(project.synthPresets ?? []).some((preset) => preset.presetId === synthPresetId)) {
        return fail2("AUDIO_INVALID_PROJECT", "Synth preset ID is invalid or does not exist.", "command.payload.synthPresetId");
      }
      next = {
        ...next,
        synthPresets: (project.synthPresets ?? []).filter((preset) => preset.presetId !== synthPresetId)
      };
      break;
    }
    case "TEMPO_SET": {
      const tempo = entityFromPayload(payload, "tempo");
      if (tempo === null) {
        return fail2("AUDIO_COMMAND_INVALID", "Tempo payload is invalid.", "command.payload.tempo");
      }
      next = {
        ...next,
        tempo
      };
      break;
    }
    case "MARKER_UPSERT": {
      const marker = entityFromPayload(payload, "marker");
      if (marker === null) {
        return fail2("AUDIO_COMMAND_INVALID", "Marker payload is invalid.", "command.payload.marker");
      }
      next = {
        ...next,
        markers: replaceById(project.markers, "markerId", marker)
      };
      break;
    }
    case "MARKER_REMOVE": {
      const markerId = entityFromPayload(payload, "markerId");
      if (markerId === null || !validId2(markerId) || !project.markers.some((marker) => marker.markerId === markerId)) {
        return fail2("AUDIO_COMMAND_INVALID", "Marker ID is invalid or does not exist.", "command.payload.markerId");
      }
      next = {
        ...next,
        markers: project.markers.filter((marker) => marker.markerId !== markerId)
      };
      break;
    }
  }
  if (project.freezeStates !== void 0 && command.type !== "FREEZE_COMMIT" && command.type !== "FREEZE_UNFREEZE" && command.type !== "FREEZE_REACTIVATE") {
    const staleFreezeStates = markActiveFreezesStale(next);
    if (staleFreezeStates !== void 0) {
      next = {
        ...next,
        freezeStates: staleFreezeStates
      };
    }
  }
  const valid = await validateAudioProject(next, false);
  if (!valid.ok) return valid;
  const hash = await hashAudioProjectState(next);
  if (!hash.ok) return hash;
  return audioOk({
    ...next,
    stateHash: hash.value
  });
}

// src/audio/audio-200/journal.ts
function fail3(code, message, path, recoverable = false) {
  return audioFail(code, message, path, recoverable);
}
async function entryHash(entry) {
  return asAudioContentHash(await hashCanonical(entry));
}
async function makeEntry(sequence, kind, command, beforeState, afterState, previousEntryHash) {
  const base = {
    schemaVersion: AUDIO200_JOURNAL_SCHEMA_VERSION,
    entryId: asAudioJournalEntryId(`audio-journal:${sequence}:${command.commandId}`),
    sequence,
    kind,
    commandId: command.commandId,
    command,
    beforeState,
    afterState,
    previousEntryHash
  };
  return {
    ...base,
    entryHash: await entryHash(base)
  };
}
function duplicateCommand(entries, command) {
  for (const entry of entries) {
    if (entry.command.commandId === command.commandId) {
      return {
        code: "AUDIO_DUPLICATE_COMMAND",
        message: "Command ID has already been journaled.",
        path: "command.commandId",
        recoverable: false
      };
    }
    if (entry.command.idempotencyKey === command.idempotencyKey) {
      return {
        code: "AUDIO_IDEMPOTENCY_CONFLICT",
        message: "Idempotency key has already been journaled.",
        path: "command.idempotencyKey",
        recoverable: false
      };
    }
  }
  return null;
}
async function createAudioJournal(project) {
  const valid = await validateAudioProject(project);
  if (!valid.ok) return valid;
  return audioOk({
    project,
    entries: [],
    undoStack: [],
    redoStack: []
  });
}
async function dispatchAudioCommand(journal, input) {
  const command = createAudioCommand(input);
  if (!command.ok) return command;
  const duplicate = duplicateCommand(journal.entries, command.value);
  if (duplicate !== null) return {
    ok: false,
    diagnostics: [
      duplicate
    ]
  };
  const applied = await applyAudioCommand(journal.project, command.value);
  if (!applied.ok) return applied;
  const previousEntryHash = journal.entries.at(-1)?.entryHash ?? null;
  const entry = await makeEntry(journal.entries.length + 1, "COMMAND", command.value, journal.project, applied.value, previousEntryHash);
  return audioOk({
    project: applied.value,
    entries: [
      ...journal.entries,
      entry
    ],
    undoStack: [
      ...journal.undoStack,
      entry
    ],
    redoStack: []
  });
}
async function appendStateTransition(journal, kind, sourceEntry, afterState) {
  const previousEntryHash = journal.entries.at(-1)?.entryHash ?? null;
  const entry = await makeEntry(journal.entries.length + 1, kind, sourceEntry.command, journal.project, afterState, previousEntryHash);
  return {
    project: afterState,
    entries: [
      ...journal.entries,
      entry
    ],
    undoStack: kind === "UNDO" ? journal.undoStack.slice(0, -1) : [
      ...journal.undoStack,
      sourceEntry
    ],
    redoStack: kind === "UNDO" ? [
      ...journal.redoStack,
      sourceEntry
    ] : journal.redoStack.slice(0, -1)
  };
}
async function transitionState(current, target) {
  const next = {
    ...target,
    projectRevision: current.projectRevision + 1
  };
  const shape = await validateAudioProject(next, false);
  if (!shape.ok) return shape;
  const hash = await hashAudioProjectState(next);
  if (!hash.ok) return hash;
  return audioOk({
    ...next,
    stateHash: hash.value
  });
}
async function undoAudio(journal) {
  const sourceEntry = journal.undoStack.at(-1);
  if (sourceEntry === void 0) {
    return fail3("AUDIO_NO_UNDO", "No command is available to undo.", "journal.undoStack", true);
  }
  const next = await transitionState(journal.project, sourceEntry.beforeState);
  if (!next.ok) return next;
  return audioOk(await appendStateTransition(journal, "UNDO", sourceEntry, next.value));
}
async function redoAudio(journal) {
  const sourceEntry = journal.redoStack.at(-1);
  if (sourceEntry === void 0) {
    return fail3("AUDIO_NO_REDO", "No command is available to redo.", "journal.redoStack", true);
  }
  const next = await transitionState(journal.project, sourceEntry.afterState);
  if (!next.ok) return next;
  return audioOk(await appendStateTransition(journal, "REDO", sourceEntry, next.value));
}
async function createAudioCheckpoint(journal, checkpointId, createdAt) {
  const valid = await validateAudioProject(journal.project);
  if (!valid.ok) return valid;
  if (!Number.isSafeInteger(journal.entries.length) || journal.entries.length > 1e6) {
    return fail3("AUDIO_OVERFLOW", "Journal sequence exceeds the safe checkpoint range.", "journal.entries", false);
  }
  try {
    asAudioCheckpointId(checkpointId);
  } catch {
    return fail3("AUDIO_CHECKPOINT_INVALID", "Checkpoint ID is invalid.", "checkpointId");
  }
  if (!Number.isFinite(Date.parse(createdAt))) {
    return fail3("AUDIO_CHECKPOINT_INVALID", "Checkpoint timestamp is invalid.", "createdAt");
  }
  return audioOk({
    schemaVersion: AUDIO200_CHECKPOINT_SCHEMA_VERSION,
    checkpointId,
    projectId: journal.project.projectId,
    projectRevision: journal.project.projectRevision,
    stateHash: journal.project.stateHash,
    journalHeadHash: journal.entries.at(-1)?.entryHash ?? null,
    journalSequence: journal.entries.length,
    state: journal.project,
    createdAt
  });
}
async function verifyEntry(entry, expectedSequence, previousHash) {
  if (entry.schemaVersion !== AUDIO200_JOURNAL_SCHEMA_VERSION || entry.sequence !== expectedSequence || entry.previousEntryHash !== previousHash) {
    return fail3("AUDIO_JOURNAL_INVALID", "Journal sequence or hash chain is invalid.", `entries[${expectedSequence - 1}]`);
  }
  const before = await validateAudioProject(entry.beforeState);
  if (!before.ok) return before;
  const after = await validateAudioProject(entry.afterState);
  if (!after.ok) return after;
  const { entryHash: _entryHash, ...material } = entry;
  const calculated = await entryHash(material);
  if (calculated !== entry.entryHash) {
    return fail3("AUDIO_JOURNAL_INVALID", "Journal entry hash does not match canonical metadata.", `entries[${expectedSequence - 1}].entryHash`);
  }
  return audioOk(true);
}
async function validateAudioJournalEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 1e6) {
    return fail3("AUDIO_JOURNAL_INVALID", "Journal entries are outside the supported range.", "entries");
  }
  let previousHash = null;
  for (const [index, entry] of entries.entries()) {
    const verified = await verifyEntry(entry, index + 1, previousHash);
    if (!verified.ok) return verified;
    previousHash = entry.entryHash;
  }
  return audioOk(true);
}
async function rebaseAudioJournalEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 1e6) {
    return fail3("AUDIO_JOURNAL_INVALID", "Journal tail is outside the supported range.", "entries");
  }
  const rebased = [];
  let previousHash = null;
  for (const [index, entry] of entries.entries()) {
    if (entry === null || typeof entry !== "object" || entry.schemaVersion !== AUDIO200_JOURNAL_SCHEMA_VERSION) {
      return fail3("AUDIO_JOURNAL_INVALID", "Journal tail contains an invalid entry.", `entries[${index}]`);
    }
    const before = await validateAudioProject(entry.beforeState);
    if (!before.ok) return before;
    const after = await validateAudioProject(entry.afterState);
    if (!after.ok) return after;
    const { entryHash: _oldHash, ...source } = entry;
    const base = {
      ...source,
      sequence: index + 1,
      previousEntryHash: previousHash
    };
    const rebasedEntry = {
      ...base,
      entryHash: await entryHash(base)
    };
    rebased.push(rebasedEntry);
    previousHash = rebasedEntry.entryHash;
  }
  return audioOk(rebased);
}
async function validateAudioJournalState(journal) {
  const project = await validateAudioProject(journal.project);
  if (!project.ok) return project;
  const entries = await validateAudioJournalEntries(journal.entries);
  if (!entries.ok) return entries;
  if (journal.entries.length > 0) {
    const head = journal.entries.at(-1);
    if (head === void 0 || head.afterState.stateHash !== journal.project.stateHash) {
      return fail3("AUDIO_JOURNAL_INVALID", "Journal head does not match the persisted Project state.", "journal.project.stateHash");
    }
  }
  const entryById = new Map(journal.entries.map((entry) => [
    entry.entryId,
    entry
  ]));
  for (const [stackName, stack] of [
    [
      "undoStack",
      journal.undoStack
    ],
    [
      "redoStack",
      journal.redoStack
    ]
  ]) {
    if (!Array.isArray(stack) || stack.length > journal.entries.length) {
      return fail3("AUDIO_JOURNAL_INVALID", "Undo/redo stack is outside the journal range.", `journal.${stackName}`);
    }
    for (const [index, item] of stack.entries()) {
      const canonical = entryById.get(item.entryId);
      if (canonical === void 0 || canonical.entryHash !== item.entryHash) {
        return fail3("AUDIO_JOURNAL_INVALID", "Undo/redo stack references an unknown journal entry.", `journal.${stackName}[${index}]`);
      }
    }
  }
  return audioOk(true);
}
async function recoverAudioProject(checkpoint, entries, options = {}) {
  if (checkpoint.schemaVersion !== AUDIO200_CHECKPOINT_SCHEMA_VERSION) {
    return fail3("AUDIO_UNSUPPORTED_SCHEMA", "Checkpoint schema is unsupported.", "checkpoint.schemaVersion");
  }
  const checkpointState = await validateAudioProject(checkpoint.state);
  if (!checkpointState.ok || checkpoint.state.stateHash !== checkpoint.stateHash || checkpoint.projectId !== checkpoint.state.projectId || checkpoint.projectRevision !== checkpoint.state.projectRevision) {
    return fail3("AUDIO_CHECKPOINT_INVALID", "Checkpoint state or hash is invalid.", "checkpoint");
  }
  let project = checkpoint.state;
  let previousHash = null;
  let replayedEntries = 0;
  for (const entry of entries) {
    if (entry.sequence <= checkpoint.journalSequence) {
      previousHash = entry.entryHash;
      continue;
    }
    const verified = await verifyEntry(entry, checkpoint.journalSequence + replayedEntries + 1, previousHash ?? checkpoint.journalHeadHash);
    if (!verified.ok) return verified;
    if (entry.beforeState.stateHash !== project.stateHash) {
      return fail3("AUDIO_JOURNAL_INVALID", "Journal replay does not start from the current recovered state.", `entries[${entry.sequence}].beforeState`);
    }
    project = entry.afterState;
    previousHash = entry.entryHash;
    replayedEntries += 1;
  }
  const sourceAvailability = {};
  const diagnostics = [];
  for (const revision of project.revisions) {
    const availability = options.sourceAvailability?.(revision.source.locator) ?? "NOT_CHECKED";
    sourceAvailability[revision.revisionId] = availability;
    if (availability === "UNAVAILABLE") {
      diagnostics.push({
        code: "AUDIO_SOURCE_UNAVAILABLE",
        message: "Canonical metadata recovered, but the source locator is unavailable.",
        path: `revisions.${revision.revisionId}.source.locator`,
        recoverable: true
      });
    }
  }
  return audioOk({
    project,
    sourceAvailability,
    diagnostics,
    replayedEntries
  }, diagnostics);
}

// src/audio/audio-200/workspace-session.ts
var MIN_FPS = 1;
var MAX_FPS = 240;
var MIN_BPM = 20;
var MAX_BPM = 300;
var MAX_INSTRUMENTS = 64;
var SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function fail4(code, message, path, recoverable = false) {
  return audioFail(code, message, path, recoverable);
}
function boundedRate(value, min, max) {
  if (!Number.isFinite(value)) return void 0;
  const result = Math.trunc(value);
  return result >= min && result <= max ? result : void 0;
}
function normalizeInstrument(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  if (!trimmed) return void 0;
  const token = trimmed.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 128);
  return SAFE_TOKEN.test(token) ? token : void 0;
}
function trackIdForInstrument(instrument) {
  return audioInstrumentTrackId(instrument);
}
function workspaceTrackForId(project, value) {
  if (typeof value !== "string" || value.trim().length === 0) return void 0;
  const exact = project.tracks.find((track) => track.trackId === value);
  if (exact !== void 0) return exact;
  const instrument = normalizeInstrument(value);
  if (instrument === void 0) return void 0;
  return project.tracks.find((track) => track.trackId === trackIdForInstrument(instrument));
}
function workspaceMixerValue(input) {
  if (!Number.isFinite(input.gainDb) || input.gainDb < -120 || input.gainDb > 24) {
    return fail4("AUDIO_INVALID_MIXER", "Workspace mixer gain must be between -120 and +24 dB.", "mixer.gainDb");
  }
  if (!Number.isFinite(input.pan) || input.pan < -1 || input.pan > 1) {
    return fail4("AUDIO_INVALID_MIXER", "Workspace mixer pan must be between -1 and +1.", "mixer.pan");
  }
  if (typeof input.muted !== "boolean" || typeof input.solo !== "boolean") {
    return fail4("AUDIO_INVALID_MIXER", "Workspace mixer mute/solo state must be boolean.", "mixer.state");
  }
  return audioOk({
    gainMilliDb: Math.round(input.gainDb * 1e3),
    panMilli: Math.round(input.pan * 1e3)
  });
}
function channelIdForInstrument(instrument) {
  return asAudioMixerChannelId(`channel:instrument:${instrument.toLowerCase()}`);
}
function workspaceNoteToCanonical(input, framesPerSecond, tempoBpm, ppq) {
  const instrument = normalizeInstrument(input.instrument);
  if (instrument === void 0) {
    return fail4("AUDIO_INVALID_NOTE", "Workspace note instrument is invalid.", "note.instrument");
  }
  if (typeof input.id !== "string" || !SAFE_TOKEN.test(input.id)) {
    return fail4("AUDIO_INVALID_NOTE", "Workspace note ID is invalid.", "note.id");
  }
  if (!Number.isSafeInteger(input.pitchMidi) || input.pitchMidi < 0 || input.pitchMidi > 127) {
    return fail4("AUDIO_INVALID_NOTE", "Workspace note pitch is outside MIDI range.", "note.pitchMidi");
  }
  if (!Number.isFinite(input.velocity) || input.velocity < 0 || input.velocity > 1) {
    return fail4("AUDIO_INVALID_NOTE", "Workspace note velocity is invalid.", "note.velocity");
  }
  const clock = {
    framesPerSecond,
    tempoMilliBpm: tempoBpm * 1e3,
    ticksPerQuarter: ppq
  };
  let startTick;
  let durationTick;
  try {
    const hasCanonicalTicks = Number.isSafeInteger(input.startTick) && Number.isSafeInteger(input.durationTick) && input.startTick !== void 0 && input.durationTick !== void 0 && input.startTick >= 0 && input.durationTick >= 1;
    if (hasCanonicalTicks) {
      startTick = input.startTick;
      durationTick = input.durationTick;
    } else {
      const startFrame = input.startFrame;
      const durationFrames = input.durationFrames;
      if (typeof startFrame !== "number" || !Number.isSafeInteger(startFrame) || startFrame < 0) {
        return fail4("AUDIO_INVALID_NOTE", "Workspace note needs canonical ticks or a valid start frame.", "note.startTick");
      }
      if (typeof durationFrames !== "number" || !Number.isSafeInteger(durationFrames) || durationFrames < 1) {
        return fail4("AUDIO_INVALID_NOTE", "Workspace note needs canonical ticks or a valid duration.", "note.durationTick");
      }
      const endTick = audioFrameToTick(startFrame + durationFrames, clock);
      startTick = audioFrameToTick(startFrame, clock);
      durationTick = Math.max(1, endTick - startTick);
    }
  } catch {
    return fail4("AUDIO_OVERFLOW", "Workspace note frame range exceeds the canonical Audio tick range.", "note.timeline");
  }
  return audioOk({
    noteId: asAudioNoteId(input.id),
    trackId: trackIdForInstrument(instrument),
    pitchMidi: input.pitchMidi,
    timeline: {
      startTick,
      durationTick
    },
    velocityMilli: Math.max(0, Math.min(1e3, Math.round(input.velocity * 1e3)))
  });
}
function workspaceClipToCanonical(input, session) {
  if (typeof input.id !== "string" || !SAFE_TOKEN.test(input.id)) {
    return fail4("AUDIO_INVALID_CLIP", "Workspace Clip ID is invalid.", "clip.id");
  }
  const track = workspaceTrackForId(session.project, input.trackId);
  if (track === void 0) {
    return fail4("AUDIO_INVALID_CLIP", "Workspace Clip Track does not resolve.", "clip.trackId");
  }
  let revisionId;
  try {
    revisionId = asAudioRevisionId(input.revisionId);
  } catch {
    return fail4("AUDIO_INVALID_REVISION", "Workspace Clip Revision ID is invalid.", "clip.revisionId");
  }
  const revision = session.project.revisions.find((item) => item.revisionId === revisionId);
  if (revision === void 0) {
    return fail4("AUDIO_REVISION_NOT_FOUND", "Workspace Clip Revision does not resolve.", "clip.revisionId");
  }
  if (!Number.isSafeInteger(input.sourceOffsetUs) || input.sourceOffsetUs < 0 || input.sourceOffsetUs >= revision.source.metadata.durationUs) {
    return fail4("AUDIO_INVALID_CLIP", "Workspace Clip timing or source offset is invalid.", "clip.timeline");
  }
  const gainDb = input.gainDb ?? 0;
  if (!Number.isFinite(gainDb) || gainDb < -120 || gainDb > 24) {
    return fail4("AUDIO_INVALID_CLIP", "Workspace Clip gain is outside -120..+24 dB.", "clip.gainDb");
  }
  const playbackRate = input.playbackRate ?? 1;
  if (!Number.isFinite(playbackRate) || playbackRate < 0.25 || playbackRate > 4) {
    return fail4("AUDIO_INVALID_CLIP", "Workspace Clip playback rate must be between 0.25 and 4.", "clip.playbackRate");
  }
  const clock = audioClockForProject(session.project, session.framesPerSecond);
  let startTick;
  let durationTick;
  let fadeInTick;
  let fadeOutTick;
  try {
    const hasCanonicalTimeline = Number.isSafeInteger(input.startTick) && Number.isSafeInteger(input.durationTick) && input.startTick !== void 0 && input.durationTick !== void 0 && input.startTick >= 0 && input.durationTick >= 1;
    if (hasCanonicalTimeline) {
      startTick = input.startTick;
      durationTick = input.durationTick;
    } else {
      if (!Number.isSafeInteger(input.startFrame) || input.startFrame === void 0 || input.startFrame < 0 || !Number.isSafeInteger(input.durationFrames) || input.durationFrames === void 0 || input.durationFrames < 1) {
        return fail4("AUDIO_INVALID_CLIP", "Workspace Clip needs canonical ticks or a valid frame projection.", "clip.timeline");
      }
      startTick = audioFrameToTick(input.startFrame, clock);
      const endTick = audioFrameToTick(input.startFrame + input.durationFrames, clock);
      durationTick = Math.max(1, endTick - startTick);
    }
    const hasCanonicalFades = Number.isSafeInteger(input.fadeInTick) && Number.isSafeInteger(input.fadeOutTick) && input.fadeInTick !== void 0 && input.fadeOutTick !== void 0 && input.fadeInTick >= 0 && input.fadeOutTick >= 0;
    if (hasCanonicalFades) {
      fadeInTick = input.fadeInTick;
      fadeOutTick = input.fadeOutTick;
    } else {
      const fadeInFrames = input.fadeInFrames ?? 0;
      const fadeOutFrames = input.fadeOutFrames ?? 0;
      if (!Number.isSafeInteger(fadeInFrames) || fadeInFrames < 0 || !Number.isSafeInteger(fadeOutFrames) || fadeOutFrames < 0) throw new RangeError("Invalid fade projection");
      fadeInTick = audioFrameToTick(fadeInFrames, clock);
      fadeOutTick = audioFrameToTick(fadeOutFrames, clock);
    }
    if (fadeInTick + fadeOutTick > durationTick) {
      return fail4("AUDIO_INVALID_CLIP", "Clip fade ranges exceed the Clip duration.", "clip.fade");
    }
  } catch {
    return fail4("AUDIO_OVERFLOW", "Workspace Clip timing exceeds the canonical tick range.", "clip.timeline");
  }
  return audioOk({
    clipId: asAudioClipId(input.id),
    trackId: track.trackId,
    revisionId,
    timeline: {
      startTick,
      durationTick
    },
    sourceOffsetUs: input.sourceOffsetUs,
    gainMilliDb: Math.round(gainDb * 1e3),
    fadeInTick,
    fadeOutTick,
    loop: input.loop ?? false,
    ...playbackRate === 1 ? {} : {
      playbackRate
    }
  });
}
function canonicalClipToWorkspaceInput(session, clip, startFrameOverride) {
  const clock = audioClockForProject(session.project, session.framesPerSecond);
  const startFrame = startFrameOverride ?? audioTickToFrame(clip.timeline.startTick, clock);
  const startTick = startFrameOverride === void 0 ? clip.timeline.startTick : audioFrameToTick(startFrame, clock);
  const durationFrames = Math.max(1, audioTickToFrame(clip.timeline.durationTick, clock));
  const fadeInFrames = Math.max(0, audioTickToFrame(clip.fadeInTick, clock));
  const fadeOutFrames = Math.max(0, audioTickToFrame(clip.fadeOutTick, clock));
  return audioOk({
    id: clip.clipId,
    trackId: clip.trackId,
    revisionId: clip.revisionId,
    startFrame,
    durationFrames,
    startTick,
    durationTick: clip.timeline.durationTick,
    sourceOffsetUs: clip.sourceOffsetUs,
    gainDb: clip.gainMilliDb / 1e3,
    fadeInFrames,
    fadeOutFrames,
    fadeInTick: clip.fadeInTick,
    fadeOutTick: clip.fadeOutTick,
    loop: clip.loop,
    playbackRate: clip.playbackRate ?? 1
  });
}
function commandMeta(session, mutation) {
  if (typeof mutation.commandId !== "string" || !SAFE_TOKEN.test(mutation.commandId)) {
    return fail4("AUDIO_COMMAND_INVALID", "Workspace mutation command ID is invalid.", "mutation.commandId");
  }
  const idempotencyKey = mutation.idempotencyKey ?? mutation.commandId;
  if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0 || idempotencyKey.length > 256) {
    return fail4("AUDIO_COMMAND_INVALID", "Workspace mutation idempotency key is invalid.", "mutation.idempotencyKey");
  }
  const issuedAt = mutation.issuedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  if (!Number.isFinite(Date.parse(issuedAt))) {
    return fail4("AUDIO_COMMAND_INVALID", "Workspace mutation timestamp is invalid.", "mutation.issuedAt");
  }
  try {
    return audioOk({
      commandId: asAudioCommandId(mutation.commandId),
      idempotencyKey,
      issuedAt
    });
  } catch {
    return fail4("AUDIO_COMMAND_INVALID", "Workspace mutation command ID is invalid.", "mutation.commandId");
  }
}
function withJournal(session, journal) {
  return {
    ...session,
    project: journal.project,
    journal
  };
}
function reconcileWorkspaceAssetCatalog(session) {
  let catalog = createAudioAssetCatalog();
  const sourceNames = new Map(session.assetCatalog.assets.map((asset) => [
    String(asset.assetId),
    asset.sourceName
  ]));
  for (const entry of session.journal.entries) {
    if (entry.command.type === "RECORDING_COMMIT" && "recording" in entry.command.payload) {
      const recording = entry.command.payload.recording;
      sourceNames.set(String(recording.revision.assetId), recording.sourceName);
    }
  }
  for (const revision of session.project.revisions) {
    const appended = appendAudioAssetRevision(catalog, revision, sourceNames.get(String(revision.assetId)) ?? String(revision.assetId));
    if (appended.ok) catalog = appended.value;
  }
  return {
    ...session,
    assetCatalog: catalog
  };
}
async function applyBootstrapCommand(project, type, payload, index) {
  const command = createAudioCommand({
    commandId: asAudioCommandId(`audio-workspace:bootstrap:${index}`),
    idempotencyKey: `audio-workspace:bootstrap:${index}`,
    projectId: project.projectId,
    baseProjectRevision: project.projectRevision,
    type,
    payload,
    issuedAt: "1970-01-01T00:00:00.000Z"
  });
  if (!command.ok) return command;
  return applyAudioCommand(project, command.value);
}
async function createAudioWorkspaceSession(options) {
  const fps = boundedRate(options.framesPerSecond, MIN_FPS, MAX_FPS);
  const bpm = boundedRate(options.tempoBpm, MIN_BPM, MAX_BPM);
  const ppq = boundedRate(options.ppq ?? AUDIO200_DEFAULT_PPQ, 24, 3840);
  if (fps === void 0) {
    return fail4("AUDIO_UI_INVALID", "Workspace frame rate is outside 1\u2013240 FPS.", "framesPerSecond");
  }
  if (bpm === void 0) {
    return fail4("AUDIO_INVALID_NUMBER", "Workspace tempo is outside 20\u2013300 BPM.", "tempoBpm");
  }
  if (ppq === void 0) {
    return fail4("AUDIO_INVALID_NUMBER", "Workspace PPQ is outside the supported range.", "ppq");
  }
  if (typeof options.name !== "string" || options.name.trim().length === 0) {
    return fail4("AUDIO_INVALID_PROJECT", "Workspace Project name is required.", "name");
  }
  if (!Number.isFinite(Date.parse(options.createdAt))) {
    return fail4("AUDIO_INVALID_PROJECT", "Workspace Project timestamp is invalid.", "createdAt");
  }
  let projectResult;
  try {
    projectResult = await createAudioProject({
      projectId: asAudioProjectId(options.projectId),
      name: options.name,
      createdAt: options.createdAt,
      tempo: {
        milliBpm: bpm * 1e3
      },
      timebase: {
        kind: "PPQ",
        ticksPerQuarter: ppq
      }
    });
  } catch {
    return fail4("AUDIO_INVALID_PROJECT", "Workspace Project ID is invalid.", "projectId");
  }
  if (!projectResult.ok) return projectResult;
  const notes = options.notes ?? [];
  const assetCatalog = options.assetCatalog ?? createAudioAssetCatalog();
  const validAssetCatalog = validateAudioAssetCatalog(assetCatalog);
  if (!validAssetCatalog.ok) return validAssetCatalog;
  const instruments = /* @__PURE__ */ new Set();
  for (const value of options.instrumentIds ?? []) {
    const instrument = normalizeInstrument(value);
    if (instrument !== void 0) instruments.add(instrument);
  }
  for (const note of notes) {
    const instrument = normalizeInstrument(note.instrument);
    if (instrument !== void 0) instruments.add(instrument);
  }
  if (instruments.size > MAX_INSTRUMENTS) {
    return fail4("AUDIO_OVERFLOW", "Workspace instrument count exceeds the safe limit.", "instrumentIds");
  }
  let sequence = 0;
  for (const instrument of instruments) {
    const track = {
      trackId: trackIdForInstrument(instrument),
      kind: "INSTRUMENT",
      name: instrument,
      clipIds: [],
      noteIds: [],
      automationIds: [],
      effectIds: [],
      mixerChannelId: channelIdForInstrument(instrument),
      muted: false,
      solo: false
    };
    projectResult = await applyBootstrapCommand(projectResult.value, "TRACK_ADD", {
      track
    }, sequence++);
    if (!projectResult.ok) return projectResult;
  }
  const noteIds = /* @__PURE__ */ new Set();
  for (const input of notes) {
    const note = workspaceNoteToCanonical(input, fps, bpm, ppq);
    if (!note.ok) return note;
    if (noteIds.has(note.value.noteId)) {
      return fail4("AUDIO_DUPLICATE_ID", "Workspace note IDs must be unique.", "notes");
    }
    noteIds.add(note.value.noteId);
    if (!instruments.has(normalizeInstrument(input.instrument) ?? "")) {
      return fail4("AUDIO_INVALID_NOTE", "Workspace note instrument has no canonical Track.", "note.instrument");
    }
    projectResult = await applyBootstrapCommand(projectResult.value, "NOTE_UPSERT", {
      note: note.value
    }, sequence++);
    if (!projectResult.ok) return projectResult;
  }
  const journal = await createAudioJournal(projectResult.value);
  if (!journal.ok) return journal;
  return audioOk({
    schemaVersion: AUDIO200_UI_SCHEMA_VERSION,
    project: projectResult.value,
    journal: journal.value,
    framesPerSecond: fps,
    ppq,
    assetCatalog: validAssetCatalog.value
  });
}
async function dispatchWorkspaceCommand(session, mutation, type, payload) {
  const meta = commandMeta(session, mutation);
  if (!meta.ok) return meta;
  const result = await dispatchAudioCommand(session.journal, {
    ...meta.value,
    projectId: session.project.projectId,
    baseProjectRevision: session.project.projectRevision,
    type,
    payload
  });
  return result.ok ? audioOk(withJournal(session, result.value), result.diagnostics) : result;
}
async function journalWorkspaceTrackAdd(session, input, mutation) {
  try {
    const trackId = asAudioTrackId(input.id);
    const mixerChannelId = asAudioMixerChannelId(String(trackId) + ":mixer");
    if (session.project.tracks.some((track2) => track2.trackId === trackId)) {
      return fail4("AUDIO_DUPLICATE_ID", "Workspace Track ID already exists.", "track.id");
    }
    const track = {
      trackId,
      kind: input.kind ?? "AUDIO",
      name: input.name?.trim() || String(trackId),
      clipIds: [],
      noteIds: [],
      automationIds: [],
      effectIds: [],
      mixerChannelId,
      muted: false,
      solo: false
    };
    return dispatchWorkspaceCommand(session, mutation, "TRACK_ADD", {
      track
    });
  } catch {
    return fail4("AUDIO_INVALID_ID", "Workspace Track ID is invalid.", "track.id");
  }
}
async function journalWorkspaceTrackRemove(session, trackId, mutation) {
  const track = workspaceTrackForId(session.project, trackId);
  if (track === void 0) {
    return fail4("AUDIO_INVALID_TRACK", "Workspace Track ID does not resolve to a canonical Track.", "trackId");
  }
  return dispatchWorkspaceCommand(session, mutation, "TRACK_REMOVE", {
    trackId: track.trackId
  });
}
async function journalWorkspaceEffectChain(session, input, mutation) {
  const track = workspaceTrackForId(session.project, input.trackId);
  if (track === void 0) {
    return fail4("AUDIO_INVALID_EFFECT", "Effect chain Track ID does not resolve to a canonical Track.", "effectChain.trackId");
  }
  return dispatchWorkspaceCommand(session, mutation, "EFFECT_CHAIN_REPLACE", {
    effectChain: {
      trackId: track.trackId,
      effects: input.effects
    }
  });
}
async function journalWorkspaceEffectUpsert(session, trackId, input, mutation) {
  const track = workspaceTrackForId(session.project, trackId);
  if (track === void 0) {
    return fail4("AUDIO_INVALID_EFFECT", "Effect Track ID does not resolve to a canonical Track.", "effect.trackId");
  }
  let effectId;
  try {
    effectId = asAudioEffectId(input.id);
  } catch {
    return fail4("AUDIO_INVALID_ID", "Effect ID is invalid.", "effect.id");
  }
  const parameters = Object.entries(input.parameters ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => ({
    name,
    value
  }));
  const effect = {
    effectId,
    kind: input.kind,
    enabled: input.enabled ?? true,
    parameters
  };
  const effects = track.effectIds.map((id) => session.project.effects.find((item) => item.effectId === id)).filter((item) => item !== void 0).filter((item) => item.effectId !== effectId);
  effects.push(effect);
  return journalWorkspaceEffectChain(session, {
    trackId: track.trackId,
    effects
  }, mutation);
}
async function journalWorkspaceEffectReorder(session, trackId, effectIds, mutation) {
  const track = workspaceTrackForId(session.project, trackId);
  if (track === void 0) {
    return fail4("AUDIO_INVALID_EFFECT", "Effect Track ID does not resolve.", "trackId");
  }
  const effects = [];
  for (const id of effectIds) {
    const effect = session.project.effects.find((item) => String(item.effectId) === id);
    if (effect === void 0 || !track.effectIds.includes(effect.effectId)) {
      return fail4("AUDIO_INVALID_EFFECT", "Effect reorder references a missing chain Effect.", "effectIds");
    }
    effects.push(effect);
  }
  if (new Set(effectIds).size !== effectIds.length || effects.length !== track.effectIds.length) {
    return fail4("AUDIO_INVALID_EFFECT", "Effect reorder must preserve the complete chain.", "effectIds");
  }
  return journalWorkspaceEffectChain(session, {
    trackId: track.trackId,
    effects
  }, mutation);
}
async function journalWorkspaceMasterReplace(session, input, mutation) {
  const current = session.project.master ?? {
    gainMilliDb: 0,
    limiterEnabled: false,
    limiterCeilingMilliDb: -1e3,
    bypass: false,
    effectIds: []
  };
  const gainDb = input.gainDb ?? current.gainMilliDb / 1e3;
  const ceilingDb = input.limiterCeilingDb ?? current.limiterCeilingMilliDb / 1e3;
  if (!Number.isFinite(gainDb) || gainDb < -120 || gainDb > 24 || !Number.isFinite(ceilingDb) || ceilingDb < -120 || ceilingDb > 0) {
    return fail4("AUDIO_INVALID_NUMBER", "Master gain and limiter ceiling must be bounded dB values.", "master");
  }
  const effectIds = input.effectIds ?? current.effectIds.map(String);
  const effects = input.effects ?? [];
  const canonicalEffects = [];
  for (const effect of effects) {
    try {
      canonicalEffects.push({
        ...effect,
        effectId: asAudioEffectId(String(effect.effectId)),
        parameters: [
          ...effect.parameters
        ].sort((left, right) => left.name.localeCompare(right.name))
      });
    } catch {
      return fail4("AUDIO_INVALID_ID", "Master Effect ID is invalid.", "master.effects");
    }
  }
  const knownIds = new Set(session.project.effects.map((effect) => String(effect.effectId)));
  for (const effect of canonicalEffects) knownIds.add(String(effect.effectId));
  if (new Set(effectIds).size !== effectIds.length || effectIds.some((effectId) => !knownIds.has(effectId))) {
    return fail4("AUDIO_INVALID_EFFECT", "Master FX chain must reference canonical Effect records.", "master.effectIds");
  }
  const master = {
    gainMilliDb: Math.round(gainDb * 1e3),
    limiterEnabled: input.limiterEnabled ?? current.limiterEnabled,
    limiterCeilingMilliDb: Math.round(ceilingDb * 1e3),
    bypass: input.bypass ?? current.bypass,
    effectIds: effectIds.map((effectId) => asAudioEffectId(effectId))
  };
  return dispatchWorkspaceCommand(session, mutation, "MASTER_REPLACE", {
    master: {
      master,
      effects: canonicalEffects
    }
  });
}
async function journalWorkspaceNoteUpsert(session, note, mutation) {
  const canonical = workspaceNoteToCanonical(note, session.framesPerSecond, session.project.tempo.milliBpm / 1e3, session.ppq);
  if (!canonical.ok) return canonical;
  const track = session.project.tracks.find((item) => item.trackId === canonical.value.trackId);
  if (track === void 0) {
    return fail4("AUDIO_INVALID_NOTE", "Workspace note instrument has no canonical Track.", "note.instrument");
  }
  return dispatchWorkspaceCommand(session, mutation, "NOTE_UPSERT", {
    note: canonical.value
  });
}
async function journalWorkspaceNoteRemove(session, noteId, mutation) {
  try {
    return dispatchWorkspaceCommand(session, mutation, "NOTE_REMOVE", {
      noteId: asAudioNoteId(noteId)
    });
  } catch {
    return fail4("AUDIO_COMMAND_INVALID", "Workspace note ID is invalid.", "noteId");
  }
}
async function journalWorkspaceAutomationUpsert(session, automation, mutation) {
  try {
    const canonical = {
      ...automation,
      automationId: asAudioAutomationId(String(automation.automationId)),
      target: {
        ...automation.target
      },
      points: automation.points.map((point) => ({
        ...point
      }))
    };
    return dispatchWorkspaceCommand(session, mutation, "AUTOMATION_UPSERT", {
      automation: canonical
    });
  } catch {
    return fail4("AUDIO_INVALID_AUTOMATION", "Workspace Automation ID or curve is invalid.", "automation");
  }
}
async function journalWorkspaceAutomationRemove(session, automationId, mutation) {
  try {
    return dispatchWorkspaceCommand(session, mutation, "AUTOMATION_REMOVE", {
      automationId: asAudioAutomationId(automationId)
    });
  } catch {
    return fail4("AUDIO_INVALID_AUTOMATION", "Workspace Automation ID is invalid.", "automationId");
  }
}
async function journalWorkspaceAssetRevision(session, revision, sourceName, mutation) {
  const catalog = appendAudioAssetRevision(session.assetCatalog, revision, sourceName);
  if (!catalog.ok) return catalog;
  const attached = await dispatchWorkspaceCommand(session, mutation, "REVISION_ATTACH", {
    revision
  });
  if (!attached.ok) return attached;
  return audioOk({
    ...attached.value,
    assetCatalog: catalog.value
  }, attached.diagnostics);
}
async function journalWorkspaceRecordingCommit(session, revision, sourceName, clip, mutation) {
  const catalog = appendAudioAssetRevision(session.assetCatalog, revision, sourceName);
  if (!catalog.ok) return catalog;
  const canonicalClip = workspaceClipToCanonical(clip, {
    ...session,
    project: {
      ...session.project,
      revisions: [
        ...session.project.revisions,
        revision
      ]
    }
  });
  if (!canonicalClip.ok) return canonicalClip;
  const recording = {
    revision,
    clip: canonicalClip.value,
    sourceName: sourceName.trim()
  };
  const committed = await dispatchWorkspaceCommand(session, mutation, "RECORDING_COMMIT", {
    recording
  });
  if (!committed.ok) return committed;
  return audioOk({
    ...committed.value,
    assetCatalog: catalog.value
  }, committed.diagnostics);
}
async function journalWorkspaceBounceInPlace(session, revision, sourceName, clip, mutation) {
  const catalog = appendAudioAssetRevision(session.assetCatalog, revision, sourceName);
  if (!catalog.ok) return catalog;
  const canonicalClip = workspaceClipToCanonical(clip, {
    ...session,
    project: {
      ...session.project,
      revisions: [
        ...session.project.revisions,
        revision
      ]
    }
  });
  if (!canonicalClip.ok) return canonicalClip;
  const bounce = {
    revision,
    clip: canonicalClip.value,
    sourceName: sourceName.trim()
  };
  const committed = await dispatchWorkspaceCommand(session, mutation, "BOUNCE_COMMIT", {
    bounce
  });
  if (!committed.ok) return committed;
  return audioOk({
    ...committed.value,
    assetCatalog: catalog.value
  }, committed.diagnostics);
}
async function journalWorkspaceFreezeCommit(session, revision, sourceName, clip, sourceStateHash, mutation) {
  let hash;
  try {
    hash = asAudioContentHash(sourceStateHash);
  } catch {
    return fail4("AUDIO_FREEZE_INVALID", "Freeze source fingerprint must be a SHA-256 hash.", "freeze.sourceStateHash");
  }
  const track = workspaceTrackForId(session.project, clip.trackId);
  if (track === void 0) {
    return fail4("AUDIO_FREEZE_INVALID", "Freeze Track does not resolve to a canonical Track.", "freeze.trackId");
  }
  const catalog = appendAudioAssetRevision(session.assetCatalog, revision, sourceName);
  if (!catalog.ok) return catalog;
  const canonicalClip = workspaceClipToCanonical(clip, {
    ...session,
    project: {
      ...session.project,
      revisions: [
        ...session.project.revisions,
        revision
      ]
    }
  });
  if (!canonicalClip.ok) return canonicalClip;
  const freeze = {
    trackId: track.trackId,
    frozenRevisionId: revision.revisionId,
    frozenClipId: canonicalClip.value.clipId,
    sourceStateHash: hash,
    sourceProjectRevision: session.project.projectRevision,
    status: "ACTIVE",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const payload = {
    freeze,
    revision,
    clip: canonicalClip.value,
    sourceName: sourceName.trim()
  };
  const committed = await dispatchWorkspaceCommand(session, mutation, "FREEZE_COMMIT", {
    freeze: payload
  });
  if (!committed.ok) return committed;
  return audioOk({
    ...committed.value,
    assetCatalog: catalog.value
  }, committed.diagnostics);
}
async function journalWorkspaceUnfreeze(session, trackId, mutation) {
  let canonicalTrackId;
  try {
    const track = workspaceTrackForId(session.project, trackId);
    if (track === void 0) throw new Error("Track not found");
    canonicalTrackId = track.trackId;
  } catch {
    return fail4("AUDIO_FREEZE_INVALID", "Unfreeze Track does not resolve to a canonical Track.", "freeze.trackId");
  }
  return dispatchWorkspaceCommand(session, mutation, "FREEZE_UNFREEZE", {
    freezeTrackId: canonicalTrackId
  });
}
async function journalWorkspaceFreezeReactivate(session, trackId, sourceStateHash, mutation) {
  let canonicalTrackId;
  let hash;
  try {
    const track = workspaceTrackForId(session.project, trackId);
    if (track === void 0) throw new Error("Track not found");
    canonicalTrackId = track.trackId;
    hash = asAudioContentHash(sourceStateHash);
  } catch {
    return fail4("AUDIO_FREEZE_STALE", "Freeze reactivation requires a canonical Track and source fingerprint.", "freeze.sourceStateHash");
  }
  return dispatchWorkspaceCommand(session, mutation, "FREEZE_REACTIVATE", {
    freezeTrackId: canonicalTrackId,
    freezeSourceStateHash: hash
  });
}
async function journalWorkspaceClipAdd(session, clip, mutation) {
  const canonical = workspaceClipToCanonical(clip, session);
  if (!canonical.ok) return canonical;
  return dispatchWorkspaceCommand(session, mutation, "CLIP_ADD", {
    clip: canonical.value
  });
}
async function journalWorkspaceClipUpdate(session, clip, mutation) {
  const canonical = workspaceClipToCanonical(clip, session);
  if (!canonical.ok) return canonical;
  return dispatchWorkspaceCommand(session, mutation, "CLIP_UPDATE", {
    clip: canonical.value
  });
}
async function journalWorkspaceClipSplitAtTick(session, clipId, splitTick, leftClipId, rightClipId, mutation) {
  let sourceId;
  try {
    sourceId = asAudioClipId(clipId);
  } catch {
    return fail4("AUDIO_COMMAND_INVALID", "Source Clip ID is invalid.", "clipId");
  }
  if (!Number.isSafeInteger(splitTick) || splitTick < 1 || typeof leftClipId !== "string" || !SAFE_TOKEN.test(leftClipId) || typeof rightClipId !== "string" || !SAFE_TOKEN.test(rightClipId) || leftClipId === rightClipId || leftClipId === clipId || rightClipId === clipId) {
    return fail4("AUDIO_INVALID_CLIP", "Tick split requires bounded position and distinct replacement IDs.", "splitTick");
  }
  const source = session.project.clips.find((clip) => clip.clipId === sourceId);
  if (source === void 0) {
    return fail4("AUDIO_INVALID_CLIP", "Source Clip does not exist.", "clipId");
  }
  const sourceStart = source.timeline.startTick;
  const sourceEnd = sourceStart + source.timeline.durationTick;
  if (splitTick <= sourceStart || splitTick >= sourceEnd) {
    return fail4("AUDIO_INVALID_CLIP", "Tick split must be strictly inside the Clip timeline.", "splitTick");
  }
  const leftDuration = splitTick - sourceStart;
  const rightDuration = sourceEnd - splitTick;
  const sourceOffsetDelta = Math.round(audioTickToSeconds(splitTick - sourceStart, audioClockForProject(session.project, session.framesPerSecond)) * 1e6);
  const rightSourceOffsetUs = source.sourceOffsetUs + sourceOffsetDelta;
  if (!Number.isSafeInteger(rightSourceOffsetUs)) {
    return fail4("AUDIO_OVERFLOW", "Split source offset exceeds the safe integer range.", "sourceOffsetUs");
  }
  const leftClip = {
    ...source,
    clipId: asAudioClipId(leftClipId),
    timeline: {
      startTick: sourceStart,
      durationTick: leftDuration
    },
    fadeInTick: Math.min(source.fadeInTick, leftDuration),
    fadeOutTick: 0
  };
  const rightClip = {
    ...source,
    clipId: asAudioClipId(rightClipId),
    timeline: {
      startTick: splitTick,
      durationTick: rightDuration
    },
    sourceOffsetUs: rightSourceOffsetUs,
    fadeInTick: 0,
    fadeOutTick: Math.min(source.fadeOutTick, rightDuration)
  };
  const payload = {
    sourceClipId: sourceId,
    leftClip,
    rightClip
  };
  return dispatchWorkspaceCommand(session, mutation, "CLIP_SPLIT", {
    clipSplit: payload
  });
}
async function journalWorkspaceClipSplit(session, clipId, splitFrame, leftClipId, rightClipId, mutation) {
  let sourceId;
  try {
    sourceId = asAudioClipId(clipId);
  } catch {
    return fail4("AUDIO_COMMAND_INVALID", "Source Clip ID is invalid.", "clipId");
  }
  if (typeof leftClipId !== "string" || !SAFE_TOKEN.test(leftClipId) || typeof rightClipId !== "string" || !SAFE_TOKEN.test(rightClipId) || leftClipId === rightClipId || leftClipId === clipId || rightClipId === clipId) {
    return fail4("AUDIO_INVALID_CLIP", "Split replacement Clip IDs must be distinct stable identifiers.", "clipIds");
  }
  if (!Number.isSafeInteger(splitFrame) || splitFrame < 1) {
    return fail4("AUDIO_INVALID_CLIP", "Split frame must be a positive integer inside the Clip.", "splitFrame");
  }
  const source = session.project.clips.find((clip) => clip.clipId === sourceId);
  if (source === void 0) {
    return fail4("AUDIO_INVALID_CLIP", "Source Clip does not exist.", "clipId");
  }
  const input = canonicalClipToWorkspaceInput(session, source);
  if (!input.ok) return input;
  if (splitFrame >= input.value.durationFrames) {
    return fail4("AUDIO_INVALID_CLIP", "Split frame must be before the Clip end.", "splitFrame");
  }
  const sourceOffsetDelta = Math.round(splitFrame * 1e6 / session.framesPerSecond);
  if (!Number.isSafeInteger(sourceOffsetDelta)) {
    return fail4("AUDIO_OVERFLOW", "Split source offset exceeds the safe integer range.", "sourceOffsetUs");
  }
  const rightSourceOffsetUs = input.value.sourceOffsetUs + sourceOffsetDelta;
  if (!Number.isSafeInteger(rightSourceOffsetUs)) {
    return fail4("AUDIO_OVERFLOW", "Split source offset exceeds the safe integer range.", "sourceOffsetUs");
  }
  const leftDuration = splitFrame;
  const rightDuration = input.value.durationFrames - splitFrame;
  const { startTick: _sourceStartTick, durationTick: _sourceDurationTick, fadeInTick: _sourceFadeInTick, fadeOutTick: _sourceFadeOutTick, ...frameInput } = input.value;
  void _sourceStartTick;
  void _sourceDurationTick;
  void _sourceFadeInTick;
  void _sourceFadeOutTick;
  const left = workspaceClipToCanonical({
    ...frameInput,
    id: leftClipId,
    durationFrames: leftDuration,
    fadeInFrames: Math.min(input.value.fadeInFrames ?? 0, leftDuration),
    fadeOutFrames: 0
  }, session);
  if (!left.ok) return left;
  const right = workspaceClipToCanonical({
    ...frameInput,
    id: rightClipId,
    startFrame: input.value.startFrame + splitFrame,
    durationFrames: rightDuration,
    sourceOffsetUs: rightSourceOffsetUs,
    fadeInFrames: 0,
    fadeOutFrames: Math.min(input.value.fadeOutFrames ?? 0, rightDuration)
  }, session);
  if (!right.ok) return right;
  return dispatchWorkspaceCommand(session, mutation, "CLIP_SPLIT", {
    clipSplit: {
      sourceClipId: sourceId,
      leftClip: left.value,
      rightClip: right.value
    }
  });
}
async function journalWorkspaceClipRemove(session, clipId, mutation) {
  try {
    return dispatchWorkspaceCommand(session, mutation, "CLIP_REMOVE", {
      clipId: asAudioClipId(clipId)
    });
  } catch {
    return fail4("AUDIO_COMMAND_INVALID", "Workspace Clip ID is invalid.", "clipId");
  }
}
async function journalWorkspaceTimelineBarClear(session, input, mutation) {
  const clock = audioClockForProject(session.project, session.framesPerSecond);
  let startTick;
  let durationTick;
  try {
    if (Number.isSafeInteger(input.startTick) && Number.isSafeInteger(input.durationTick) && input.startTick !== void 0 && input.durationTick !== void 0 && input.startTick >= 0 && input.durationTick >= 1) {
      startTick = input.startTick;
      durationTick = input.durationTick;
    } else if (Number.isSafeInteger(input.startFrame) && input.startFrame !== void 0 && input.startFrame >= 0 && Number.isSafeInteger(input.durationFrames) && input.durationFrames !== void 0 && input.durationFrames >= 1) {
      startTick = audioFrameToTick(input.startFrame, clock);
      const endTick = audioFrameToTick(input.startFrame + input.durationFrames, clock);
      durationTick = Math.max(1, endTick - startTick);
    } else {
      return fail4("AUDIO_INVALID_NUMBER", "Timeline bar range needs canonical ticks or a valid frame range.", "timelineBar");
    }
  } catch {
    return fail4("AUDIO_OVERFLOW", "Timeline bar frame range exceeds the canonical Audio tick range.", "timelineBar");
  }
  if (durationTick < 1) {
    return fail4("AUDIO_OVERFLOW", "Timeline bar frame range exceeds the canonical Audio tick range.", "timelineBar");
  }
  return dispatchWorkspaceCommand(session, mutation, "TIMELINE_BAR_CLEAR", {
    timelineBar: {
      startTick,
      durationTick
    }
  });
}
async function journalWorkspaceClipDuplicate(session, clipId, newClipId, startFrame, mutation) {
  let canonicalId;
  try {
    canonicalId = asAudioClipId(clipId);
  } catch {
    return fail4("AUDIO_COMMAND_INVALID", "Source Clip ID is invalid.", "clipId");
  }
  const source = session.project.clips.find((clip) => clip.clipId === canonicalId);
  if (source === void 0) {
    return fail4("AUDIO_INVALID_CLIP", "Source Clip does not exist.", "clipId");
  }
  const input = canonicalClipToWorkspaceInput(session, source, startFrame);
  if (!input.ok) return input;
  return journalWorkspaceClipAdd(session, {
    ...input.value,
    id: newClipId
  }, mutation);
}
async function journalWorkspaceTempo(session, tempoBpm, mutation) {
  const bpm = boundedRate(tempoBpm, MIN_BPM, MAX_BPM);
  if (bpm === void 0) {
    return fail4("AUDIO_INVALID_NUMBER", "Workspace tempo is outside 20\u2013300 BPM.", "tempoBpm");
  }
  const tempo = {
    milliBpm: bpm * 1e3
  };
  return dispatchWorkspaceCommand(session, mutation, "TEMPO_SET", {
    tempo
  });
}
async function journalWorkspaceDrumKitSet(session, drumKitId, mutation) {
  if (!isAudioDrumKitId(drumKitId)) {
    return fail4("AUDIO_INVALID_PROJECT", "Workspace drum kit is not supported.", "drumKitId");
  }
  return dispatchWorkspaceCommand(session, mutation, "DRUM_KIT_SET", {
    drumKitId
  });
}
async function journalWorkspaceSynthPresetReplace(session, synthPreset, mutation) {
  if (!SAFE_TOKEN.test(synthPreset.presetId) || !SAFE_TOKEN.test(synthPreset.instrumentId) || !SAFE_TOKEN.test(synthPreset.baseVoiceId) || synthPreset.name.trim().length === 0) {
    return fail4("AUDIO_INVALID_ID", "Workspace synth preset identity is invalid.", "synthPreset");
  }
  return dispatchWorkspaceCommand(session, mutation, "SYNTH_PRESET_REPLACE", {
    synthPreset
  });
}
async function journalWorkspaceSynthPresetRemove(session, synthPresetId, mutation) {
  if (!SAFE_TOKEN.test(synthPresetId)) {
    return fail4("AUDIO_INVALID_ID", "Workspace synth preset ID is invalid.", "synthPresetId");
  }
  return dispatchWorkspaceCommand(session, mutation, "SYNTH_PRESET_REMOVE", {
    synthPresetId
  });
}
async function journalWorkspaceMarkerUpsert(session, input, mutation) {
  const markerId = typeof input.id === "string" ? input.id.trim() : "";
  const frameId = typeof input.frameId === "string" ? input.frameId.trim() : `tick:${Math.max(0, Math.trunc(input.tick ?? input.frame ?? 0))}`;
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!SAFE_TOKEN.test(markerId)) {
    return fail4("AUDIO_INVALID_ID", "Workspace marker ID is invalid.", "marker.id");
  }
  if (!SAFE_TOKEN.test(frameId)) {
    return fail4("AUDIO_INVALID_ID", "Workspace marker frame ID is invalid.", "marker.frameId");
  }
  if (!label || label.length > 256) {
    return fail4("AUDIO_INVALID_PROJECT", "Workspace marker label is empty or too long.", "marker.label");
  }
  let tick;
  try {
    if (Number.isSafeInteger(input.tick) && input.tick !== void 0 && input.tick >= 0) {
      tick = input.tick;
    } else if (Number.isSafeInteger(input.frame) && input.frame !== void 0 && input.frame >= 0) {
      tick = audioFrameToTick(input.frame, audioClockForProject(session.project, session.framesPerSecond));
    } else {
      return fail4("AUDIO_INVALID_NUMBER", "Workspace marker needs a canonical tick or valid frame.", "marker.tick");
    }
  } catch {
    return fail4("AUDIO_OVERFLOW", "Workspace marker frame exceeds the canonical Audio tick range.", "marker.tick");
  }
  const marker = {
    markerId,
    frameId,
    tick,
    label
  };
  return dispatchWorkspaceCommand(session, mutation, "MARKER_UPSERT", {
    marker
  });
}
async function journalWorkspaceMarkerRemove(session, markerId, mutation) {
  const normalized = typeof markerId === "string" ? markerId.trim() : "";
  if (!SAFE_TOKEN.test(normalized)) {
    return fail4("AUDIO_INVALID_ID", "Workspace marker ID is invalid.", "markerId");
  }
  return dispatchWorkspaceCommand(session, mutation, "MARKER_REMOVE", {
    markerId: normalized
  });
}
async function journalWorkspaceMixerChannel(session, input, mutation) {
  const track = workspaceTrackForId(session.project, input.trackId);
  if (track === void 0) {
    return fail4("AUDIO_INVALID_MIXER", "Workspace mixer Track ID does not resolve to a canonical Track.", "mixer.trackId");
  }
  const values = workspaceMixerValue(input);
  if (!values.ok) return values;
  const channel = session.project.mixer.channels.find((item) => item.channelId === track.mixerChannelId || item.trackId === track.trackId);
  if (channel === void 0) {
    return fail4("AUDIO_INVALID_MIXER", "Workspace Track does not resolve to a canonical Mixer channel.", "mixer.channelId");
  }
  const mixer = {
    ...session.project.mixer,
    channels: session.project.mixer.channels.map((item) => item.channelId === channel.channelId ? {
      ...item,
      trackId: track.trackId,
      gainMilliDb: values.value.gainMilliDb,
      panMilli: values.value.panMilli,
      muted: input.muted,
      solo: input.solo
    } : item)
  };
  return dispatchWorkspaceCommand(session, mutation, "MIXER_REPLACE", {
    mixer
  });
}
async function journalWorkspaceRouting(session, input, mutation) {
  const sourceTrack = workspaceTrackForId(session.project, input.trackId);
  if (sourceTrack === void 0) {
    return fail4("AUDIO_INVALID_MIXER", "Workspace routing source Track ID does not resolve.", "routing.trackId");
  }
  const channel = session.project.mixer.channels.find((item) => item.trackId === sourceTrack.trackId);
  if (channel === void 0) {
    return fail4("AUDIO_INVALID_MIXER", "Workspace routing source has no canonical Mixer channel.", "routing.trackId");
  }
  let outputTrackId = channel.outputTrackId;
  if (input.outputTrackId !== void 0) {
    if (input.outputTrackId === null) {
      outputTrackId = void 0;
    } else {
      const destination = workspaceTrackForId(session.project, input.outputTrackId);
      if (destination === void 0 || ![
        "BUS",
        "RETURN"
      ].includes(destination.kind)) {
        return fail4("AUDIO_INVALID_MIXER", "Routing output must target an existing Bus or Return Track.", "routing.outputTrackId");
      }
      outputTrackId = destination.trackId;
    }
  }
  const updatedChannels = session.project.mixer.channels.map((item) => {
    if (item.channelId !== channel.channelId) return item;
    if (outputTrackId === void 0) {
      const { outputTrackId: _outputTrackId, ...withoutOutput } = item;
      return withoutOutput;
    }
    return {
      ...item,
      outputTrackId
    };
  });
  let sends = session.project.mixer.sends;
  if (input.sends !== void 0) {
    const canonical = [];
    for (const send of input.sends) {
      const sendSource = workspaceTrackForId(session.project, send.sourceTrackId);
      const destination = workspaceTrackForId(session.project, send.destinationTrackId);
      if (sendSource === void 0 || destination === void 0 || ![
        "BUS",
        "RETURN"
      ].includes(destination.kind) || !Number.isFinite(send.amountDb) || send.amountDb < -120 || send.amountDb > 24 || typeof send.preFader !== "boolean") {
        return fail4("AUDIO_INVALID_MIXER", "Workspace Send fields are invalid.", "routing.sends");
      }
      try {
        canonical.push({
          sendId: asAudioMixerSendId(send.id),
          sourceTrackId: sendSource.trackId,
          destinationTrackId: destination.trackId,
          amountMilliDb: Math.round(send.amountDb * 1e3),
          preFader: send.preFader
        });
      } catch {
        return fail4("AUDIO_INVALID_ID", "Workspace Send ID is invalid.", "routing.sends.id");
      }
    }
    sends = canonical;
  }
  const mixer = {
    ...session.project.mixer,
    channels: updatedChannels,
    ...sends === void 0 ? {} : {
      sends
    }
  };
  return dispatchWorkspaceCommand(session, mutation, "MIXER_REPLACE", {
    mixer
  });
}
var journalWorkspaceMixerRouting = journalWorkspaceRouting;
function setWorkspaceFrameRate(session, framesPerSecond) {
  const fps = boundedRate(framesPerSecond, MIN_FPS, MAX_FPS);
  if (fps === void 0) {
    return fail4("AUDIO_UI_INVALID", "Workspace frame rate is outside 1\u2013240 FPS.", "framesPerSecond");
  }
  return audioOk({
    ...session,
    framesPerSecond: fps
  });
}
async function undoWorkspaceAudio(session) {
  const result = await undoAudio(session.journal);
  return result.ok ? audioOk(reconcileWorkspaceAssetCatalog(withJournal(session, result.value)), result.diagnostics) : result;
}
async function redoWorkspaceAudio(session) {
  const result = await redoAudio(session.journal);
  return result.ok ? audioOk(reconcileWorkspaceAssetCatalog(withJournal(session, result.value)), result.diagnostics) : result;
}
async function checkpointWorkspaceAudio(session, checkpointId, createdAt) {
  try {
    return createAudioCheckpoint(session.journal, checkpointId, createdAt);
  } catch {
    return fail4("AUDIO_CHECKPOINT_INVALID", "Workspace checkpoint ID is invalid.", "checkpointId");
  }
}
function workspaceJournalEntries(session) {
  return session.journal.entries;
}

// src/audio/audio-200/persistence.ts
var AUDIO200_PERSISTENCE_SCHEMA_VERSION = "AUDIO-200_PERSISTENCE_V1";
var AUDIO200_PERSISTENCE_DB_NAME = "pixiedraw2-audio-200";
var AUDIO200_PERSISTENCE_DB_VERSION = 1;
var AUDIO200_PERSISTENCE_STORE_NAME = "projects";
var AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES = 32;
function fail5(code, message, path, recoverable = false) {
  return audioFail(code, message, path, recoverable);
}
function validClock(value, min, max) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function validTimestamp2(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function validPersistenceSettings(value) {
  if (value === void 0) return true;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const settings = value;
  return (settings.meter === void 0 || [
    "4/4",
    "3/4",
    "6/8",
    "2/4"
  ].includes(settings.meter)) && (settings.quantize === void 0 || [
    "off",
    "1/4",
    "1/8",
    "1/16",
    "1/32",
    "1/64"
  ].includes(settings.quantize)) && (settings.snap === void 0 || [
    "1/4",
    "1/8",
    "1/16"
  ].includes(settings.snap));
}
function isNewerPersistenceRecord(incoming, previous) {
  if (previous === void 0) return true;
  const incomingRevision = incoming.projectRevision ?? incoming.checkpoint.projectRevision;
  const previousRevision = previous.projectRevision ?? previous.checkpoint.projectRevision;
  if (incomingRevision !== previousRevision) {
    return incomingRevision > previousRevision;
  }
  return incoming.savedAt >= previous.savedAt;
}
function isCompactTailJournal(journal) {
  return journal.mode === "COMPACT_TAIL";
}
function resolvePersistedStack(value, entries, path) {
  if (!Array.isArray(value)) {
    return fail5("AUDIO_JOURNAL_INVALID", "Persisted undo/redo stack is not an array.", path);
  }
  if (value.length === 0) return audioOk([]);
  if (value.every((item) => typeof item === "string")) {
    const entryById = new Map(entries.map((entry) => [
      String(entry.entryId),
      entry
    ]));
    const resolved = [];
    for (const [index, item] of value.entries()) {
      const entry = entryById.get(item);
      if (entry === void 0) {
        return fail5("AUDIO_JOURNAL_INVALID", "Persisted undo/redo stack references an unknown journal entry.", `${path}[${index}]`);
      }
      resolved.push(entry);
    }
    return audioOk(resolved);
  }
  if (value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
    return audioOk(value);
  }
  return fail5("AUDIO_JOURNAL_INVALID", "Persisted undo/redo stack mixes entry objects and entry IDs.", path);
}
async function expandPersistenceJournal(record) {
  const candidate = record.journal;
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return fail5("AUDIO_JOURNAL_INVALID", "Persistence journal is not an object.", "record.journal");
  }
  if ("mode" in candidate && candidate.mode !== void 0 && candidate.mode !== "COMPACT_TAIL") {
    return fail5("AUDIO_JOURNAL_INVALID", "Persistence journal compression mode is unsupported.", "record.journal.mode");
  }
  const entries = candidate.entries;
  if (!Array.isArray(entries)) {
    return fail5("AUDIO_JOURNAL_INVALID", "Persistence journal entries are missing.", "record.journal.entries");
  }
  if (!entries.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry))) {
    return fail5("AUDIO_JOURNAL_INVALID", "Persistence journal entries contain a non-entry value.", "record.journal.entries");
  }
  const project = "project" in candidate && candidate.project !== void 0 ? candidate.project : entries.at(-1)?.afterState ?? record.checkpoint.state;
  const undoStack = await resolvePersistedStack(candidate.undoStack, entries, "record.journal.undoStack");
  if (!undoStack.ok) return undoStack;
  const redoStack = await resolvePersistedStack(candidate.redoStack, entries, "record.journal.redoStack");
  if (!redoStack.ok) return redoStack;
  return audioOk({
    project,
    entries,
    undoStack: undoStack.value,
    redoStack: redoStack.value
  });
}
function persistenceShape(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || hasRawAudioPayload(value)) {
    return fail5("AUDIO_RAW_PAYLOAD_REJECTED", "Persistence records contain metadata only; raw audio payloads are rejected.", "record");
  }
  const candidate = value;
  if (candidate.schemaVersion !== AUDIO200_PERSISTENCE_SCHEMA_VERSION) {
    return fail5("AUDIO_UNSUPPORTED_SCHEMA", "Persistence record schema is unsupported.", "record.schemaVersion");
  }
  if (typeof candidate.projectId !== "string") {
    return fail5("AUDIO_INVALID_ID", "Persistence Project ID is invalid.", "record.projectId");
  }
  try {
    asAudioProjectId(candidate.projectId);
  } catch {
    return fail5("AUDIO_INVALID_ID", "Persistence Project ID is invalid.", "record.projectId");
  }
  if (!validClock(candidate.framesPerSecond, 1, 240)) {
    return fail5("AUDIO_UI_INVALID", "Persisted animation FPS is outside 1\u2013240.", "record.framesPerSecond");
  }
  if (!validClock(candidate.ppq, 24, 3840)) {
    return fail5("AUDIO_INVALID_NUMBER", "Persisted PPQ is outside the supported range.", "record.ppq");
  }
  if (!validPersistenceSettings(candidate.settings)) {
    return fail5("AUDIO_UI_INVALID", "Persisted Audio editing settings are invalid.", "record.settings");
  }
  if (!validTimestamp2(candidate.savedAt)) {
    return fail5("AUDIO_CHECKPOINT_INVALID", "Persistence timestamp is invalid.", "record.savedAt");
  }
  if (candidate.checkpoint === null || typeof candidate.checkpoint !== "object") {
    return fail5("AUDIO_CHECKPOINT_INVALID", "Persistence checkpoint is missing.", "record.checkpoint");
  }
  if (candidate.journal === null || typeof candidate.journal !== "object" || Array.isArray(candidate.journal)) {
    return fail5("AUDIO_JOURNAL_INVALID", "Persistence journal is missing.", "record.journal");
  }
  return audioOk(candidate);
}
async function validateAudioPersistenceRecord(value) {
  const shape = persistenceShape(value);
  if (!shape.ok) return shape;
  const record = shape.value;
  const compactTail = isCompactTailJournal(record.journal);
  const expandedJournal = await expandPersistenceJournal(record);
  if (!expandedJournal.ok) return expandedJournal;
  const journalState = expandedJournal.value;
  if (record.assetCatalog !== void 0) {
    const catalog = validateAudioAssetCatalog(record.assetCatalog);
    if (!catalog.ok) return catalog;
  }
  const checkpoint = record.checkpoint;
  const checkpointProject = await validateAudioProject(checkpoint.state);
  if (!checkpointProject.ok) return checkpointProject;
  if (checkpoint.projectId !== record.projectId || checkpoint.state.projectId !== record.projectId || checkpoint.stateHash !== checkpoint.state.stateHash || checkpoint.projectRevision !== checkpoint.state.projectRevision) {
    return fail5("AUDIO_CHECKPOINT_INVALID", "Checkpoint identity or state hash does not match the persisted Project.", "record.checkpoint");
  }
  const journal = journalState;
  if (record.assetCatalog !== void 0) {
    const catalogBinding = validateAudioAssetCatalogAgainstProject(record.assetCatalog, journal.project);
    if (!catalogBinding.ok) return catalogBinding;
  }
  if (journal.project.projectId !== record.projectId) {
    return fail5("AUDIO_JOURNAL_INVALID", "Journal Project ID does not match the persistence key.", "record.journal.project.projectId");
  }
  const journalValid = await validateAudioJournalState(journal);
  if (!journalValid.ok) return journalValid;
  if (record.projectRevision !== void 0 && (!Number.isSafeInteger(record.projectRevision) || record.projectRevision !== journal.project.projectRevision)) {
    return fail5("AUDIO_CHECKPOINT_INVALID", "Persistence Project revision does not match the journal head.", "record.projectRevision");
  }
  if (compactTail) {
    if (checkpoint.journalSequence !== 0 || checkpoint.journalHeadHash !== null) {
      return fail5("AUDIO_CHECKPOINT_INVALID", "Compact journal Checkpoint must start at sequence zero.", "record.checkpoint.journalSequence");
    }
    const recovered = await recoverAudioProject(checkpoint, journal.entries);
    if (!recovered.ok) return recovered;
    if (recovered.value.project.stateHash !== journal.project.stateHash) {
      return fail5("AUDIO_JOURNAL_INVALID", "Compact journal tail does not recover the persisted Project head.", "record.journal.project.stateHash");
    }
  } else {
    if (journal.project.stateHash !== checkpoint.stateHash) {
      return fail5("AUDIO_JOURNAL_INVALID", "Persisted journal state does not match the checkpoint state.", "record.journal.project.stateHash");
    }
    if (journal.entries.length !== checkpoint.journalSequence || (journal.entries.at(-1)?.entryHash ?? null) !== checkpoint.journalHeadHash) {
      return fail5("AUDIO_CHECKPOINT_INVALID", "Checkpoint does not bind the persisted journal head.", "record.checkpoint.journalHeadHash");
    }
  }
  return audioOk(record);
}
async function createAudioPersistenceRecord(session, checkpointId, savedAt, settings) {
  if (!validTimestamp2(savedAt)) {
    return fail5("AUDIO_CHECKPOINT_INVALID", "Persistence timestamp is invalid.", "savedAt");
  }
  if (!validClock(session.framesPerSecond, 1, 240)) {
    return fail5("AUDIO_UI_INVALID", "Workspace animation FPS is invalid.", "session.framesPerSecond");
  }
  if (!validClock(session.ppq, 24, 3840)) {
    return fail5("AUDIO_INVALID_NUMBER", "Workspace PPQ is invalid.", "session.ppq");
  }
  if (!validPersistenceSettings(settings)) {
    return fail5("AUDIO_UI_INVALID", "Audio editing settings are invalid.", "settings");
  }
  const journal = await validateAudioJournalState(session.journal);
  if (!journal.ok) return journal;
  const catalogBinding = validateAudioAssetCatalogAgainstProject(session.assetCatalog, session.journal.project);
  if (!catalogBinding.ok) return catalogBinding;
  let canonicalCheckpointId;
  try {
    canonicalCheckpointId = asAudioCheckpointId(checkpointId);
  } catch {
    return fail5("AUDIO_CHECKPOINT_INVALID", "Checkpoint ID is invalid.", "checkpointId");
  }
  const shouldCompact = session.journal.entries.length > AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES;
  let checkpointJournal = session.journal;
  let persistedEntries = session.journal.entries;
  let persistedUndoStack = session.journal.undoStack.map((entry) => entry.entryId);
  let persistedRedoStack = session.journal.redoStack.map((entry) => entry.entryId);
  let compactTail = false;
  if (shouldCompact) {
    const tailStart = session.journal.entries.length - AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES;
    const tail = session.journal.entries.slice(tailStart);
    const rebased = await rebaseAudioJournalEntries(tail);
    if (!rebased.ok) return rebased;
    const baseProject = tail[0]?.beforeState ?? session.project;
    checkpointJournal = {
      project: baseProject,
      entries: [],
      undoStack: [],
      redoStack: []
    };
    persistedEntries = rebased.value;
    const rebasedById = new Map(rebased.value.map((entry) => [
      String(entry.entryId),
      entry
    ]));
    persistedUndoStack = session.journal.undoStack.map((entry) => rebasedById.get(String(entry.entryId))?.entryId).filter((entryId) => entryId !== void 0);
    persistedRedoStack = session.journal.redoStack.map((entry) => rebasedById.get(String(entry.entryId))?.entryId).filter((entryId) => entryId !== void 0);
    compactTail = true;
  }
  const checkpoint = await createAudioCheckpoint(checkpointJournal, canonicalCheckpointId, savedAt);
  if (!checkpoint.ok) return checkpoint;
  const record = {
    schemaVersion: AUDIO200_PERSISTENCE_SCHEMA_VERSION,
    projectId: session.project.projectId,
    checkpoint: checkpoint.value,
    journal: {
      entries: persistedEntries,
      undoStack: persistedUndoStack,
      redoStack: persistedRedoStack,
      ...compactTail ? {
        mode: "COMPACT_TAIL"
      } : {}
    },
    framesPerSecond: session.framesPerSecond,
    ppq: session.ppq,
    ...settings === void 0 ? {} : {
      settings
    },
    projectRevision: session.project.projectRevision,
    assetCatalog: session.assetCatalog,
    savedAt
  };
  return audioOk(record);
}
function sessionFromRecord(record, project, journal, diagnostics = []) {
  return audioOk({
    schemaVersion: AUDIO200_UI_SCHEMA_VERSION,
    project,
    journal: {
      ...journal,
      project
    },
    framesPerSecond: record.framesPerSecond,
    ppq: record.ppq,
    assetCatalog: record.assetCatalog ?? createAudioAssetCatalog()
  }, diagnostics);
}
async function rekeyAudioWorkspaceSessionProject(session, projectId) {
  let canonicalProjectId;
  try {
    canonicalProjectId = asAudioProjectId(projectId);
  } catch {
    return fail5("AUDIO_INVALID_ID", "Workspace Project ID cannot be used as an Audio Project ID.", "projectId");
  }
  const draft = {
    ...session.project,
    projectId: canonicalProjectId,
    stateHash: "0".repeat(64)
  };
  const valid = await validateAudioProject(draft, false);
  if (!valid.ok) return valid;
  const hash = await hashAudioProjectState(draft);
  if (!hash.ok) return hash;
  const project = {
    ...draft,
    stateHash: hash.value
  };
  const catalogBinding = validateAudioAssetCatalogAgainstProject(session.assetCatalog, project);
  if (!catalogBinding.ok) return catalogBinding;
  return audioOk({
    ...session,
    project,
    journal: {
      project,
      entries: [],
      undoStack: [],
      redoStack: []
    }
  });
}
async function restoreAudioPersistenceRecord(value) {
  const shape = persistenceShape(value);
  if (!shape.ok) return shape;
  const record = shape.value;
  const compactTail = isCompactTailJournal(record.journal);
  const expandedJournal = await expandPersistenceJournal(record);
  if (!expandedJournal.ok) return expandedJournal;
  const journal = expandedJournal.value;
  if (record.assetCatalog !== void 0) {
    const catalog = validateAudioAssetCatalog(record.assetCatalog);
    if (!catalog.ok) return catalog;
  }
  const checkpointProject = await validateAudioProject(record.checkpoint.state);
  if (!checkpointProject.ok) return checkpointProject;
  if (record.checkpoint.projectId !== record.projectId || record.checkpoint.state.projectId !== record.projectId || record.checkpoint.stateHash !== record.checkpoint.state.stateHash) {
    return fail5("AUDIO_CHECKPOINT_INVALID", "Checkpoint identity or hash is invalid.", "record.checkpoint");
  }
  if (record.assetCatalog !== void 0 && !compactTail) {
    const checkpointCatalogBinding = validateAudioAssetCatalogAgainstProject(record.assetCatalog, record.checkpoint.state);
    if (!checkpointCatalogBinding.ok) return checkpointCatalogBinding;
  }
  const journalValid = await validateAudioJournalState(journal);
  if (journalValid.ok) {
    if (record.projectRevision !== void 0 && (!Number.isSafeInteger(record.projectRevision) || record.projectRevision !== journal.project.projectRevision)) {
      return fail5("AUDIO_CHECKPOINT_INVALID", "Persistence Project revision does not match the journal head.", "record.projectRevision");
    }
    if (record.assetCatalog !== void 0) {
      const catalogBinding = validateAudioAssetCatalogAgainstProject(record.assetCatalog, journal.project);
      if (!catalogBinding.ok) return catalogBinding;
    }
    const recovered2 = await recoverAudioProject(record.checkpoint, journal.entries);
    if (!recovered2.ok) return recovered2;
    if (recovered2.value.project.projectId !== record.projectId || recovered2.value.project.stateHash !== journal.project.stateHash) {
      return fail5("AUDIO_JOURNAL_INVALID", "Recovered Project does not match the persisted journal head.", "record.journal.project");
    }
    return sessionFromRecord(record, recovered2.value.project, journal, recovered2.value.diagnostics);
  }
  const validPrefix = [];
  for (const entry of journal.entries) {
    const candidate = [
      ...validPrefix,
      entry
    ];
    const valid = await validateAudioJournalEntries(candidate);
    if (!valid.ok) break;
    validPrefix.push(entry);
  }
  const replayEntries = validPrefix.filter((entry) => entry.sequence > record.checkpoint.journalSequence);
  const recovered = await recoverAudioProject(record.checkpoint, replayEntries);
  const project = recovered.ok ? recovered.value.project : record.checkpoint.state;
  const diagnostic = audioDiagnostic("AUDIO_JOURNAL_INVALID", "Journal tail was damaged; recovered the last valid checkpoint and reset edit history.", "record.journal.entries", true);
  return sessionFromRecord(record, project, {
    project,
    entries: [],
    undoStack: [],
    redoStack: []
  }, [
    diagnostic,
    ...recovered.ok ? recovered.value.diagnostics : []
  ]);
}
function createMemoryAudioPersistenceStore() {
  const records = /* @__PURE__ */ new Map();
  return {
    async load(projectId) {
      return audioOk(records.get(projectId) ?? null);
    },
    async save(record) {
      const shape = persistenceShape(record);
      if (!shape.ok) return shape;
      const previous = records.get(record.projectId);
      if (!isNewerPersistenceRecord(record, previous)) {
        return audioOk(true, [
          audioDiagnostic("AUDIO_STALE_PROJECT_REVISION", "An older persistence write was ignored.", "record.checkpoint.projectRevision", true)
        ]);
      }
      records.set(record.projectId, record);
      return audioOk(true);
    },
    async clear(projectId) {
      records.delete(projectId);
      return audioOk(true);
    }
  };
}
function createLatestWriteAudioPersistenceStore(inner) {
  let latestTicket = 0;
  return {
    load: (projectId) => inner.load(projectId),
    clear: (projectId) => inner.clear(projectId),
    async save(record) {
      const ticket = ++latestTicket;
      const result = await inner.save(record);
      if (ticket !== latestTicket && result.ok) {
        return audioOk(true, [
          audioDiagnostic("AUDIO_STALE_PROJECT_REVISION", "A superseded persistence write completed without becoming current.", "record.checkpoint.projectRevision", true)
        ]);
      }
      return result;
    }
  };
}

// src/audio/audio-200/indexeddb-store.ts
function hostFailure(message, path) {
  return audioFail("AUDIO_HOST_BOUNDARY_INVALID", message, path, true);
}
function openDatabase(name) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(name, AUDIO200_PERSISTENCE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(AUDIO200_PERSISTENCE_STORE_NAME)) {
        database.createObjectStore(AUDIO200_PERSISTENCE_STORE_NAME, {
          keyPath: "projectId"
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onblocked = () => reject(new Error("IndexedDB open was blocked."));
  });
}
function isNewer(incoming, current) {
  if (current === null || typeof current !== "object") return true;
  const candidate = current;
  const checkpoint = candidate.checkpoint;
  const currentRevision = checkpoint !== null && typeof checkpoint === "object" ? checkpoint.projectRevision : void 0;
  if (typeof currentRevision !== "number") return true;
  if (incoming.checkpoint.projectRevision !== currentRevision) {
    return incoming.checkpoint.projectRevision > currentRevision;
  }
  const currentSavedAt = candidate.savedAt;
  return typeof currentSavedAt !== "string" || incoming.savedAt >= currentSavedAt;
}
function createIndexedDbAudioPersistenceStore(options = {}) {
  const databaseName = options.databaseName ?? AUDIO200_PERSISTENCE_DB_NAME;
  return {
    async load(projectId) {
      try {
        asAudioProjectId(projectId);
        const database = await openDatabase(databaseName);
        return await new Promise((resolve) => {
          const transaction = database.transaction(AUDIO200_PERSISTENCE_STORE_NAME, "readonly");
          const request = transaction.objectStore(AUDIO200_PERSISTENCE_STORE_NAME).get(projectId);
          request.onsuccess = () => {
            database.close();
            resolve(audioOk(request.result ?? null));
          };
          request.onerror = () => {
            database.close();
            resolve(hostFailure("IndexedDB project load failed.", "indexedDB.load"));
          };
        });
      } catch {
        return hostFailure("IndexedDB is unavailable.", "indexedDB.load");
      }
    },
    async save(record) {
      try {
        const database = await openDatabase(databaseName);
        return await new Promise((resolve) => {
          let stale = false;
          const transaction = database.transaction(AUDIO200_PERSISTENCE_STORE_NAME, "readwrite");
          const store = transaction.objectStore(AUDIO200_PERSISTENCE_STORE_NAME);
          const read = store.get(record.projectId);
          read.onsuccess = () => {
            if (isNewer(record, read.result)) {
              store.put(record);
            } else {
              stale = true;
            }
          };
          read.onerror = () => transaction.abort();
          transaction.oncomplete = () => {
            database.close();
            resolve(stale ? audioOk(true, [
              audioDiagnostic("AUDIO_STALE_PROJECT_REVISION", "An older persistence write was ignored.", "record.checkpoint.projectRevision", true)
            ]) : audioOk(true));
          };
          transaction.onerror = () => {
            database.close();
            resolve(hostFailure("IndexedDB project save failed.", "indexedDB.save"));
          };
          transaction.onabort = () => {
            database.close();
            resolve(hostFailure("IndexedDB project save was aborted.", "indexedDB.save"));
          };
        });
      } catch {
        return hostFailure("IndexedDB is unavailable.", "indexedDB.save");
      }
    },
    async clear(projectId) {
      try {
        const database = await openDatabase(databaseName);
        return await new Promise((resolve) => {
          const transaction = database.transaction(AUDIO200_PERSISTENCE_STORE_NAME, "readwrite");
          transaction.objectStore(AUDIO200_PERSISTENCE_STORE_NAME).delete(projectId);
          transaction.oncomplete = () => {
            database.close();
            resolve(audioOk(true));
          };
          transaction.onerror = () => {
            database.close();
            resolve(hostFailure("IndexedDB project clear failed.", "indexedDB.clear"));
          };
          transaction.onabort = () => {
            database.close();
            resolve(hostFailure("IndexedDB project clear was aborted.", "indexedDB.clear"));
          };
        });
      } catch {
        return hostFailure("IndexedDB is unavailable.", "indexedDB.clear");
      }
    }
  };
}

// src/audio/audio-200/audio-asset-store.ts
var AUDIO200_MAX_RANGE_BYTES = 4 * 1024 * 1024;
function validateRange(revision, offset, length) {
  const byteLength = revision.source.metadata.byteLength;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 || length > AUDIO200_MAX_RANGE_BYTES || !Number.isSafeInteger(offset + length) || offset + length > byteLength) {
    return audioFail("AUDIO_INVALID_NUMBER", "Audio range must be a bounded interval inside the immutable source.", "range");
  }
  return audioOk(true);
}
function keyFor(revision) {
  return `${revision.assetId}/${revision.revisionId}`;
}
function createMemoryAudioAssetByteStore() {
  const bytesByRevision = /* @__PURE__ */ new Map();
  return {
    async put(revision, bytes) {
      const verified = await verifySourceBlobAgainstRevision(bytes, revision);
      if (!verified.ok) return verified;
      bytesByRevision.set(keyFor(revision), new Uint8Array(bytes));
      return audioOk(true);
    },
    async get(revision) {
      const value = bytesByRevision.get(keyFor(revision));
      if (value === void 0) {
        return audioOk(null, [
          audioDiagnostic("AUDIO_SOURCE_UNAVAILABLE", "Audio Asset bytes are not present in the byte store.", "revision.source", true)
        ]);
      }
      const verified = await verifySourceBlobAgainstRevision(value, revision);
      if (!verified.ok) return verified;
      return audioOk(new Uint8Array(value));
    },
    async getRange(revision, offset, length) {
      const valid = validateRange(revision, offset, length);
      if (!valid.ok) return valid;
      const value = bytesByRevision.get(keyFor(revision));
      if (value === void 0) {
        return audioOk(null, [
          audioDiagnostic("AUDIO_SOURCE_UNAVAILABLE", "Audio Asset bytes are not present in the byte store.", "revision.source", true)
        ]);
      }
      if (value.byteLength !== revision.source.metadata.byteLength) {
        return audioFail("AUDIO_RAW_BLOB_MODIFIED", "Stored source byte length does not match the immutable Revision.", "revision.source.metadata.byteLength");
      }
      return audioOk(new Uint8Array(value.slice(offset, offset + length)));
    },
    async has(revision) {
      return audioOk(bytesByRevision.has(keyFor(revision)));
    },
    async remove(revision) {
      bytesByRevision.delete(keyFor(revision));
      return audioOk(true);
    }
  };
}
function unavailableAudioAssetStore(message = "This host does not provide a local Audio Asset byte store.") {
  return {
    async put() {
      return audioFail("AUDIO_HOST_BOUNDARY_INVALID", message, "storage", true);
    },
    async get() {
      return audioOk(null, [
        audioDiagnostic("AUDIO_SOURCE_UNAVAILABLE", message, "storage", true)
      ]);
    },
    async getRange() {
      return audioOk(null, [
        audioDiagnostic("AUDIO_SOURCE_UNAVAILABLE", message, "storage", true)
      ]);
    },
    async has() {
      return audioOk(false, [
        audioDiagnostic("AUDIO_SOURCE_UNAVAILABLE", message, "storage", true)
      ]);
    },
    async remove() {
      return audioOk(true);
    }
  };
}

// src/audio/audio-200/opfs-store.ts
function opfsStorage() {
  const candidate = globalThis.navigator;
  return candidate?.storage;
}
function unavailable(message) {
  return audioFail("AUDIO_HOST_BOUNDARY_INVALID", message, "storage.opfs", true);
}
function validRange(revision, offset, length) {
  const byteLength = revision.source.metadata.byteLength;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 || length > AUDIO200_MAX_RANGE_BYTES || !Number.isSafeInteger(offset + length) || offset + length > byteLength) {
    return audioFail("AUDIO_INVALID_NUMBER", "Audio range must be a bounded interval inside the immutable source.", "range");
  }
  return audioOk(true);
}
function pathSegments(revision) {
  const locator = revision.source.locator;
  if (locator.placement !== "OPFS" || locator.namespace !== "audio") {
    return audioFail("AUDIO_INVALID_SOURCE", "OPFS storage requires a canonical OPFS audio locator.", "revision.source.locator");
  }
  if (!sourcePathIsSafe(locator.relativePath)) {
    return audioFail("AUDIO_PATH_TRAVERSAL", "OPFS path is not a bounded relative path.", "revision.source.locator.relativePath");
  }
  return audioOk(locator.relativePath.split("/"));
}
async function openFile(revision, create) {
  const storage = opfsStorage();
  if (storage === void 0) {
    return unavailable("This browser does not expose Origin Private File System.");
  }
  const segments = pathSegments(revision);
  if (!segments.ok) return segments;
  if (segments.value.length === 0) {
    return audioFail("AUDIO_INVALID_SOURCE", "OPFS path is empty.", "storage.opfs");
  }
  try {
    let directory = await storage.getDirectory();
    for (const segment of segments.value.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(segment, {
        create
      });
    }
    return audioOk(await directory.getFileHandle(segments.value[segments.value.length - 1], {
      create
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "OPFS access failed.";
    return audioFail("AUDIO_SOURCE_UNAVAILABLE", message, "storage.opfs", true);
  }
}
function createOpfsAudioAssetByteStore() {
  return {
    async put(revision, bytes) {
      const verified = await verifySourceBlobAgainstRevision(bytes, revision);
      if (!verified.ok) return verified;
      const handle = await openFile(revision, true);
      if (!handle.ok) return handle;
      try {
        const writable = await handle.value.createWritable();
        await writable.write(new Uint8Array(bytes));
        await writable.close();
        return audioOk(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "OPFS write failed.";
        return audioFail("AUDIO_SOURCE_UNAVAILABLE", message, "storage.opfs", true);
      }
    },
    async get(revision) {
      const handle = await openFile(revision, false);
      if (!handle.ok) {
        if (handle.diagnostics[0]?.code === "AUDIO_SOURCE_UNAVAILABLE") {
          return audioOk(null, handle.diagnostics);
        }
        return handle;
      }
      try {
        const file = await handle.value.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const verified = await verifySourceBlobAgainstRevision(bytes, revision);
        if (!verified.ok) return verified;
        return audioOk(bytes);
      } catch (error) {
        const message = error instanceof Error ? error.message : "OPFS read failed.";
        return audioFail("AUDIO_SOURCE_UNAVAILABLE", message, "storage.opfs", true);
      }
    },
    async getRange(revision, offset, length) {
      const valid = validRange(revision, offset, length);
      if (!valid.ok) return valid;
      const handle = await openFile(revision, false);
      if (!handle.ok) {
        if (handle.diagnostics[0]?.code === "AUDIO_SOURCE_UNAVAILABLE") {
          return audioOk(null, handle.diagnostics);
        }
        return handle;
      }
      try {
        const file = await handle.value.getFile();
        const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
        if (bytes.byteLength !== length) {
          return audioFail("AUDIO_RAW_BLOB_MODIFIED", "OPFS returned fewer bytes than the immutable range requested.", "range");
        }
        return audioOk(bytes);
      } catch (error) {
        const message = error instanceof Error ? error.message : "OPFS range read failed.";
        return audioFail("AUDIO_SOURCE_UNAVAILABLE", message, "storage.opfs", true);
      }
    },
    async has(revision) {
      const handle = await openFile(revision, false);
      if (!handle.ok) {
        if (handle.diagnostics[0]?.code === "AUDIO_SOURCE_UNAVAILABLE") {
          return audioOk(false, handle.diagnostics);
        }
        return handle;
      }
      return audioOk(true);
    },
    async remove(revision) {
      const segments = pathSegments(revision);
      if (!segments.ok) return segments;
      const storage = opfsStorage();
      if (storage === void 0) {
        return unavailable("This browser does not expose Origin Private File System.");
      }
      try {
        let directory = await storage.getDirectory();
        for (const segment of segments.value.slice(0, -1)) {
          directory = await directory.getDirectoryHandle(segment, {
            create: false
          });
        }
        await directory.removeEntry(segments.value[segments.value.length - 1]);
        return audioOk(true);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotFoundError") return audioOk(true);
        const message = error instanceof Error ? error.message : "OPFS remove failed.";
        return audioFail("AUDIO_SOURCE_UNAVAILABLE", message, "storage.opfs", true);
      }
    }
  };
}

// src/audio/audio-200/waveform.ts
var MAX_LEVELS = 10;
var MAX_PEAKS_PER_LEVEL = 131072;
var MAX_BUCKET_SIZE = 1 << 30;
function fail6(code, message, path) {
  return audioFail(code, message, path);
}
function finitePeak(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}
function sampleAt(bytes, offset, codec, bitDepth) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (codec === "WAV_IEEE_FLOAT") {
    return finitePeak(view.getFloat32(offset, true));
  }
  switch (bitDepth) {
    case 8:
      return (bytes[offset] - 128) / 128;
    case 16:
      return view.getInt16(offset, true) / 32768;
    case 24: {
      const raw = bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
      const signed = (raw & 8388608) !== 0 ? raw | 4278190080 : raw;
      return signed / 8388608;
    }
    case 32:
      return view.getInt32(offset, true) / 2147483648;
  }
}
function normalizeBucketSize(sampleFrames, requested) {
  const minimum = Math.max(1, Math.ceil(sampleFrames / MAX_PEAKS_PER_LEVEL));
  return Math.min(MAX_BUCKET_SIZE, Math.max(minimum, Math.trunc(requested)));
}
function buildLevel(bytes, layout, bucketSize, level) {
  const peaks = [];
  let min = 1;
  let max = -1;
  let framesInBucket = 0;
  const bytesPerSample = layout.bitDepth / 8;
  const frameBytes = layout.blockAlign;
  const flush = () => {
    if (framesInBucket === 0) return;
    peaks.push({
      min: finitePeak(min),
      max: finitePeak(max)
    });
    min = 1;
    max = -1;
    framesInBucket = 0;
  };
  for (const chunk of layout.dataChunks) {
    const chunkFrames = Math.floor(chunk.length / frameBytes);
    for (let localFrame = 0; localFrame < chunkFrames; localFrame += 1) {
      const frameOffset = chunk.offset + localFrame * frameBytes;
      for (let channel = 0; channel < layout.channels; channel += 1) {
        const value = sampleAt(bytes, frameOffset + channel * bytesPerSample, layout.codec, layout.bitDepth);
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
    peaks
  };
}
async function buildAudioWaveformPeakCache(bytes, revision, options = {}) {
  const verified = await verifySourceBlobAgainstRevision(bytes, revision);
  if (!verified.ok) return verified;
  const layout = inspectCanonicalWavLayout(bytes);
  if (!layout.ok) return layout;
  const base = options.baseBucketSize ?? 256;
  const levelCount = options.levels ?? 8;
  if (!Number.isSafeInteger(base) || base < 1 || base > MAX_BUCKET_SIZE || !Number.isSafeInteger(levelCount) || levelCount < 1 || levelCount > MAX_LEVELS) {
    return fail6("AUDIO_INVALID_WAVEFORM", "Waveform bucket size or level count is outside the safe range.", "options");
  }
  const levels = [];
  for (let index = 0; index < levelCount; index += 1) {
    const requested = base * 2 ** index;
    const bucketSize = normalizeBucketSize(layout.value.sampleFrames, requested);
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
    levels
  });
}
function validateAudioWaveformCache(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail6("AUDIO_INVALID_WAVEFORM", "Waveform cache must be an object.", "cache");
  }
  const item = value;
  if (item.schemaVersion !== AUDIO200_WAVEFORM_SCHEMA_VERSION || typeof item.assetId !== "string" || typeof item.revisionId !== "string" || typeof item.sourceHash !== "string" || typeof item.sampleRateHz !== "number" || ![
    1,
    2
  ].includes(item.channels) || !Number.isSafeInteger(item.sampleFrames) || typeof item.sampleFrames !== "number" || item.sampleFrames < 1 || !Array.isArray(item.levels)) {
    return fail6("AUDIO_INVALID_WAVEFORM", "Waveform cache metadata is invalid.", "cache");
  }
  try {
    asAudioContentHash(item.sourceHash);
  } catch {
    return fail6("AUDIO_INVALID_WAVEFORM", "Waveform source hash is invalid.", "cache.sourceHash");
  }
  let previousBucket = 0;
  for (const [index, level] of item.levels.entries()) {
    const candidate = level;
    if (candidate === null || typeof candidate !== "object" || !Number.isSafeInteger(candidate.level) || typeof candidate.level !== "number" || candidate.level < 0 || !Number.isSafeInteger(candidate.bucketSize) || typeof candidate.bucketSize !== "number" || candidate.bucketSize < 1 || candidate.bucketSize < previousBucket || !Array.isArray(candidate.peaks) || candidate.peaks.some((peak) => {
      const itemPeak = peak;
      return itemPeak === null || typeof itemPeak !== "object" || typeof itemPeak.min !== "number" || typeof itemPeak.max !== "number" || !Number.isFinite(itemPeak.min) || !Number.isFinite(itemPeak.max) || itemPeak.min < -1 || itemPeak.min > 1 || itemPeak.max < -1 || itemPeak.max > 1 || itemPeak.min > itemPeak.max;
    })) {
      return fail6("AUDIO_INVALID_WAVEFORM", "Waveform peak level is invalid.", `cache.levels[${index}]`);
    }
    previousBucket = candidate.bucketSize;
  }
  return audioOk(value);
}
function selectAudioWaveformLevel(cache, samplesPerPixel) {
  const valid = validateAudioWaveformCache(cache);
  if (!valid.ok) return valid;
  if (!Number.isFinite(samplesPerPixel) || samplesPerPixel <= 0) {
    return fail6("AUDIO_INVALID_WAVEFORM", "samplesPerPixel must be positive.", "samplesPerPixel");
  }
  const selected = cache.levels.find((level) => level.bucketSize >= samplesPerPixel) ?? cache.levels[cache.levels.length - 1];
  return selected === void 0 ? fail6("AUDIO_INVALID_WAVEFORM", "Waveform cache has no levels.", "cache.levels") : audioOk(selected);
}
function projectAudioWaveformViewport(cache, startFrame, endFrame, pixelWidth) {
  const valid = validateAudioWaveformCache(cache);
  if (!valid.ok) return valid;
  if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrame) || startFrame < 0 || endFrame <= startFrame || endFrame > cache.sampleFrames || !Number.isSafeInteger(pixelWidth) || pixelWidth < 1 || pixelWidth > 16384) {
    return fail6("AUDIO_INVALID_WAVEFORM", "Waveform viewport bounds are invalid.", "viewport");
  }
  const samplesPerPixel = (endFrame - startFrame) / pixelWidth;
  const level = selectAudioWaveformLevel(cache, samplesPerPixel);
  if (!level.ok) return level;
  const result = [];
  for (let pixel = 0; pixel < pixelWidth; pixel += 1) {
    const from = startFrame + pixel * (endFrame - startFrame) / pixelWidth;
    const to = startFrame + (pixel + 1) * (endFrame - startFrame) / pixelWidth;
    const firstBucket = Math.floor(from / level.value.bucketSize);
    const lastBucket = Math.max(firstBucket, Math.ceil(to / level.value.bucketSize) - 1);
    let min = 1;
    let max = -1;
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      const peak = level.value.peaks[bucket];
      if (peak === void 0) continue;
      min = Math.min(min, peak.min);
      max = Math.max(max, peak.max);
    }
    result.push({
      min: finitePeak(min),
      max: finitePeak(max)
    });
  }
  return audioOk(result);
}

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
function text3(bytes, offset, length) {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    return "";
  }
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function boundedPositive(value, fallback) {
  return value !== void 0 && Number.isFinite(value) && value > 0 ? value : fallback;
}
function boundedInteger2(value, fallback, minimum, maximum) {
  const candidate = value !== void 0 && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(maximum, Math.max(minimum, candidate));
}
function unavailable2(message, path = "revision.source") {
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
      return unavailable2("Audio source is unavailable.");
    }
    if (result.value.byteLength !== length) {
      return audioFail("AUDIO_RAW_BLOB_MODIFIED", "Audio byte store returned a truncated range.", "revision.source");
    }
    return audioOk(result.value, result.diagnostics);
  };
  const firstLength = Math.min(sourceBytes, HEADER_WINDOW_BYTES, maxRangeBytes);
  const first = await read(0, firstLength);
  if (!first.ok) return first;
  if (text3(first.value, 0, 4) !== "RIFF" || text3(first.value, 8, 4) !== "WAVE") {
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
    const chunk = text3(header.value, 0, 4);
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
  const maxRangeBytes = boundedInteger2(options.maxRangeBytes, AUDIO200_MAX_RANGE_BYTES, 1024, AUDIO200_MAX_RANGE_BYTES);
  return {
    shortAudioMaxBytes: boundedInteger2(options.shortAudioMaxBytes, DEFAULT_SHORT_BYTES, 1, 64 * 1024 * 1024),
    shortAudioMaxSeconds: boundedPositive(options.shortAudioMaxSeconds, DEFAULT_SHORT_SECONDS),
    chunkSeconds: boundedPositive(options.chunkSeconds, DEFAULT_CHUNK_SECONDS),
    readAheadChunks: boundedInteger2(options.readAheadChunks, DEFAULT_READ_AHEAD_CHUNKS, 0, 16),
    maxCachedChunks: boundedInteger2(options.maxCachedChunks, DEFAULT_MAX_CACHED_CHUNKS, 1, 64),
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
            return unavailable2("Audio source is unavailable.");
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
async function buildAudioWaveformPeakCacheFromChunkReader(reader, revision, options = {}) {
  const base = options.baseBucketSize ?? 256;
  const levelCount = options.levels ?? 8;
  if (!Number.isSafeInteger(base) || base < 1 || base > 1 << 30 || !Number.isSafeInteger(levelCount) || levelCount < 1 || levelCount > 10) {
    return audioFail("AUDIO_INVALID_WAVEFORM", "Waveform bucket size or level count is outside the safe range.", "options");
  }
  const normalizeBucket = (requested) => Math.min(1 << 30, Math.max(Math.max(1, Math.ceil(reader.plan.sampleFrames / 131072)), Math.trunc(requested)));
  const bucketSizes = Array.from({
    length: levelCount
  }, (_, index) => normalizeBucket(base * 2 ** index));
  const peaks = Array.from({
    length: levelCount
  }, () => []);
  const minima = bucketSizes.map(() => 1);
  const maxima = bucketSizes.map(() => -1);
  const frameCounts = bucketSizes.map(() => 0);
  const flush = (level) => {
    if (frameCounts[level] === 0) return;
    peaks[level].push({
      min: Math.max(-1, Math.min(1, minima[level])),
      max: Math.max(-1, Math.min(1, maxima[level]))
    });
    minima[level] = 1;
    maxima[level] = -1;
    frameCounts[level] = 0;
  };
  const chunkCount = Math.ceil(reader.plan.sampleFrames / reader.plan.chunkFrames);
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = await reader.readChunk(index);
    if (!chunk.ok) return chunk;
    if (chunk.value === null) {
      return audioFail("AUDIO_SOURCE_UNAVAILABLE", "A PCM chunk disappeared while building the waveform cache.", "revision.source", true);
    }
    for (let frame = 0; frame < chunk.value.frameCount; frame += 1) {
      for (let level = 0; level < bucketSizes.length; level += 1) {
        for (let channel = 0; channel < chunk.value.channels; channel += 1) {
          const value = chunk.value.samples[channel][frame];
          minima[level] = Math.min(minima[level], value);
          maxima[level] = Math.max(maxima[level], value);
        }
        frameCounts[level] = frameCounts[level] + 1;
        if (frameCounts[level] >= bucketSizes[level]) flush(level);
      }
    }
  }
  for (let level = 0; level < levelCount; level += 1) flush(level);
  const levels = bucketSizes.map((bucketSize, level) => ({
    level,
    bucketSize,
    peaks: peaks[level]
  }));
  return audioOk({
    schemaVersion: AUDIO200_WAVEFORM_SCHEMA_VERSION,
    assetId: revision.assetId,
    revisionId: revision.revisionId,
    sourceHash: revision.source.metadata.contentHash,
    sampleRateHz: reader.plan.sampleRateHz,
    channels: reader.plan.channels,
    sampleFrames: reader.plan.sampleFrames,
    levels
  });
}
export {
  AUDIO200_ASSET_SCHEMA_VERSION,
  AUDIO200_CHECKPOINT_SCHEMA_VERSION,
  AUDIO200_JOURNAL_SCHEMA_VERSION,
  AUDIO200_MAX_RANGE_BYTES,
  AUDIO200_MAX_SOURCE_BYTES,
  AUDIO200_METADATA_AUTHORITY,
  AUDIO200_PERSISTENCE_DB_NAME,
  AUDIO200_PERSISTENCE_DB_VERSION,
  AUDIO200_PERSISTENCE_RECENT_HISTORY_ENTRIES,
  AUDIO200_PERSISTENCE_SCHEMA_VERSION,
  AUDIO200_PERSISTENCE_STORE_NAME,
  AUDIO200_SCHEMA_VERSION,
  AUDIO200_SUPPORTED_CODECS,
  AUDIO200_UI_SCHEMA_VERSION,
  AUDIO200_WAVEFORM_SCHEMA_VERSION,
  AUDIO_DRUM_KIT_IDS,
  appendAudioAssetRevision,
  asAudioAssetId,
  asAudioAutomationId,
  asAudioCheckpointId,
  asAudioClipId,
  asAudioCommandId,
  asAudioContentHash,
  asAudioEffectId,
  asAudioJournalEntryId,
  asAudioMixerChannelId,
  asAudioMixerId,
  asAudioMixerSendId,
  asAudioNoteId,
  asAudioProjectId,
  asAudioRevisionId,
  asAudioTick,
  asAudioTrackId,
  asSourceBlobId,
  assetReferenceCount,
  audioAssetId,
  audioAssetRecordForId,
  audioDiagnostic,
  audioFail,
  audioIdSet,
  audioOk,
  audioRevisionId,
  buildAudioWaveformPeakCache,
  buildAudioWaveformPeakCacheFromChunkReader,
  canonicalAudioMaterial,
  canonicalLocator,
  canonicalizeSourceBlob,
  checkpointWorkspaceAudio,
  createAudioAssetCatalog,
  createAudioAssetRecord,
  createAudioPcmChunkReader,
  createAudioPersistenceRecord,
  createAudioWorkspaceSession,
  createIndexedDbAudioPersistenceStore,
  createLatestWriteAudioPersistenceStore,
  createMemoryAudioAssetByteStore,
  createMemoryAudioPersistenceStore,
  createOpfsAudioAssetByteStore,
  hasRawAudioPayload,
  inspectCanonicalWavLayout,
  inspectSourceBlob,
  isAudioDrumKitId,
  isFiniteNumber,
  isFiniteSafeNumber,
  isSafeInteger,
  journalWorkspaceAssetRevision,
  journalWorkspaceAutomationRemove,
  journalWorkspaceAutomationUpsert,
  journalWorkspaceBounceInPlace,
  journalWorkspaceClipAdd,
  journalWorkspaceClipDuplicate,
  journalWorkspaceClipRemove,
  journalWorkspaceClipSplit,
  journalWorkspaceClipSplitAtTick,
  journalWorkspaceClipUpdate,
  journalWorkspaceDrumKitSet,
  journalWorkspaceEffectChain,
  journalWorkspaceEffectReorder,
  journalWorkspaceEffectUpsert,
  journalWorkspaceFreezeCommit,
  journalWorkspaceFreezeReactivate,
  journalWorkspaceMarkerRemove,
  journalWorkspaceMarkerUpsert,
  journalWorkspaceMasterReplace,
  journalWorkspaceMixerChannel,
  journalWorkspaceMixerRouting,
  journalWorkspaceNoteRemove,
  journalWorkspaceNoteUpsert,
  journalWorkspaceRecordingCommit,
  journalWorkspaceRouting,
  journalWorkspaceSynthPresetRemove,
  journalWorkspaceSynthPresetReplace,
  journalWorkspaceTempo,
  journalWorkspaceTimelineBarClear,
  journalWorkspaceTrackAdd,
  journalWorkspaceTrackRemove,
  journalWorkspaceUnfreeze,
  projectAudioWaveformViewport,
  redoWorkspaceAudio,
  rekeyAudioWorkspaceSessionProject,
  restoreAudioPersistenceRecord,
  revisionReferenceCount,
  selectAudioWaveformLevel,
  setWorkspaceFrameRate,
  sourcePathIsSafe,
  sourcePlacementIsLocal,
  unavailableAudioAssetStore,
  undoWorkspaceAudio,
  validateAudioAssetCatalog,
  validateAudioAssetCatalogAgainstProject,
  validateAudioPersistenceRecord,
  validateAudioWaveformCache,
  verifySourceBlobAgainstRevision,
  workspaceJournalEntries
};
