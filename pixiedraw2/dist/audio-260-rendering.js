// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_WP160_FEATURE_FLAGS = Object.freeze({
  "game-core-read": false,
  "game-core-write": false,
  "runtime-preview": false,
  "runtime-execution": false,
  "game-build": false,
  "game-build-cache": false,
  "game-publish": false
});
async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/audio/audio-200/contracts.ts
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
var SHA256 = /^[a-f0-9]{64}$/;
function asAudioContentHash(value) {
  if (!SHA256.test(value)) {
    throw new Error("AudioContentHash must be a lowercase SHA-256 hash.");
  }
  return value;
}

// src/audio/audio-200/metadata-authority.ts
var AUDIO200_MAX_SOURCE_BYTES = 64 * 1024 * 1024;

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
function u16(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return bytes[offset] | bytes[offset + 1] << 8;
}
function u32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
}
function text(bytes, offset, length) {
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
  if (text(first.value, 0, 4) !== "RIFF" || text(first.value, 8, 4) !== "WAVE") {
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
    const chunkSize = u32(header.value, 4);
    if (chunkSize === null) {
      return audioFail("AUDIO_INVALID_SOURCE", "WAV chunk header is truncated.", "revision.source.chunks");
    }
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > sourceBytes) {
      return audioFail("AUDIO_INVALID_SOURCE", "WAV chunk extends beyond the immutable source.", "revision.source.chunks");
    }
    const chunk = text(header.value, 0, 4);
    if (chunk === "fmt ") {
      if (chunkSize < 16) {
        return audioFail("AUDIO_INVALID_SOURCE", "WAV fmt chunk is shorter than the PCM contract.", "revision.source.fmt");
      }
      const fmt = await ensure(payloadStart, 16);
      if (!fmt.ok) return fmt;
      const audioFormat = u16(fmt.value, 0);
      const channels = u16(fmt.value, 2);
      const sampleRateHz = u32(fmt.value, 4);
      const byteRate = u32(fmt.value, 8);
      const blockAlign = u16(fmt.value, 12);
      const bitDepth = u16(fmt.value, 14);
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
var AUDIO_EQ_BANDS = Object.freeze([
  {
    parameterName: "band60",
    frequencyHz: 60,
    label: "60"
  },
  {
    parameterName: "band120",
    frequencyHz: 120,
    label: "120"
  },
  {
    parameterName: "band250",
    frequencyHz: 250,
    label: "250"
  },
  {
    parameterName: "band500",
    frequencyHz: 500,
    label: "500"
  },
  {
    parameterName: "band1000",
    frequencyHz: 1e3,
    label: "1k"
  },
  {
    parameterName: "band2000",
    frequencyHz: 2e3,
    label: "2k"
  },
  {
    parameterName: "band4000",
    frequencyHz: 4e3,
    label: "4k"
  },
  {
    parameterName: "band8000",
    frequencyHz: 8e3,
    label: "8k"
  }
]);
function createOfflineEffectChainState() {
  return {
    eq: /* @__PURE__ */ new Map(),
    compressor: /* @__PURE__ */ new Map(),
    delay: /* @__PURE__ */ new Map(),
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
  const multiBand = AUDIO_EQ_BANDS.some((band) => effect.parameters.some((parameterValue) => parameterValue.name === band.parameterName));
  if (multiBand) {
    const bands = memory.bands?.length === AUDIO_EQ_BANDS.length ? memory.bands : AUDIO_EQ_BANDS.map(() => ({
      left: {
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0
      },
      right: {
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0
      }
    }));
    for (let index = 0; index < left.length; index += 1) {
      const time = options.blockStartSeconds + index / options.sampleRateHz;
      const mix = clamp2(automatedParameter(effect, [
        "mix"
      ], time, options, 1), 0, 1);
      const dryLeft = left[index];
      const dryRight = right[index];
      let processedLeft = dryLeft;
      let processedRight = dryRight;
      for (let bandIndex = 0; bandIndex < AUDIO_EQ_BANDS.length; bandIndex++) {
        const band = AUDIO_EQ_BANDS[bandIndex];
        const gain = clamp2(automatedParameter(effect, [
          band.parameterName
        ], time, options, 0), -18, 18);
        const q = clamp2(automatedParameter(effect, [
          "eqQ",
          "q"
        ], time, options, 1), 0.05, 30);
        const frequency = Math.min(Math.max(20, band.frequencyHz), Math.max(21, options.sampleRateHz / 2 - 1));
        const omega = 2 * Math.PI * frequency / options.sampleRateHz;
        const sine = Math.sin(omega);
        const cosine = Math.cos(omega);
        const amplitude = 10 ** (gain / 40);
        const alpha = sine / (2 * q);
        const a0 = 1 + alpha / amplitude;
        const coefficients = {
          b0: (1 + alpha * amplitude) / a0,
          b1: -2 * cosine / a0,
          b2: (1 - alpha * amplitude) / a0,
          a1: -2 * cosine / a0,
          a2: (1 - alpha / amplitude) / a0
        };
        const stateForBand = bands[bandIndex];
        const nextLeft = processBiquadSample(processedLeft, stateForBand.left, coefficients);
        const nextRight = processBiquadSample(processedRight, stateForBand.right, coefficients);
        processedLeft = nextLeft;
        processedRight = nextRight;
      }
      left[index] = dryLeft * (1 - mix) + processedLeft * mix;
      right[index] = dryRight * (1 - mix) + processedRight * mix;
    }
    state.eq.set(id, {
      ...memory,
      bands
    });
    return;
  }
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
function processBiquadSample(input, state, coefficients) {
  const output = coefficients.b0 * input + coefficients.b1 * state.x1 + coefficients.b2 * state.x2 - coefficients.a1 * state.y1 - coefficients.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = output;
  return output;
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
function applyDelay(left, right, effect, state, options) {
  const id = String(effect.effectId);
  const delayMs = clamp2(automatedParameter(effect, [
    "delayMs",
    "delay"
  ], options.blockStartSeconds, options, 250), 1, 2e3);
  const delayFrames = Math.max(1, Math.round(delayMs * options.sampleRateHz / 1e3));
  const previous = state.delay.get(id);
  const memory = previous !== void 0 && previous.sampleRateHz === options.sampleRateHz && previous.delayFrames === delayFrames ? previous : {
    sampleRateHz: options.sampleRateHz,
    delayFrames,
    index: 0,
    left: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2)),
    right: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2))
  };
  const feedback = clamp2(automatedParameter(effect, [
    "feedback",
    "decay"
  ], options.blockStartSeconds, options, 0.35), 0, 0.95);
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const mix = clamp2(automatedParameter(effect, [
      "mix",
      "wet"
    ], time, options, 0.35), 0, 1);
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
  state.delay.set(id, memory);
}
function applyOfflineEffectChain(left, right, options) {
  if (left.length === 0 || right.length === 0) return;
  for (const effect of options.effects) {
    if (!effect.enabled) continue;
    if (effect.kind === "EQ") {
      applyEq(left, right, effect, options.state, options);
    } else if (effect.kind === "COMPRESSOR") {
      applyCompressor(left, right, effect, options.state, options);
    } else if (effect.kind === "DELAY") {
      applyDelay(left, right, effect, options.state, options);
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

// src/audio/audio-240/chiptune.ts
var secondary = (waveform, ratio, gain, detuneCents = 0, dutyCycle = 0.5) => ({
  waveform,
  ratio,
  gain,
  detuneCents,
  dutyCycle
});
var filter = (type, frequencyHz, q = 0.7) => ({
  type,
  frequencyHz,
  q
});
var makeVoice = (id, patch) => Object.freeze({
  id,
  waveform: patch.waveform,
  dutyCycle: patch.dutyCycle ?? 0.5,
  attackMs: patch.attackMs ?? 4,
  decayMs: patch.decayMs ?? 180,
  sustain: patch.sustain ?? 0.35,
  releaseMs: patch.releaseMs ?? 140,
  filter: patch.filter === void 0 ? void 0 : Object.freeze({
    ...patch.filter
  }),
  secondary: Object.freeze([
    ...patch.secondary ?? []
  ]),
  noiseColor: patch.noiseColor ?? "white",
  noiseMode: patch.noiseMode ?? "random",
  transientLevel: patch.transientLevel ?? 0,
  transientMs: patch.transientMs ?? 18,
  pitchStartRatio: patch.pitchStartRatio ?? 1,
  pitchSweepMs: patch.pitchSweepMs ?? 0,
  vibratoDepthCents: patch.vibratoDepthCents ?? 0,
  vibratoRateHz: patch.vibratoRateHz ?? 5.2
});
var CHIP_SYNTH_PRESETS = Object.freeze([
  {
    id: "pulse-25",
    label: "Pulse 25%",
    waveform: "pulse",
    dutyCycle: 0.25,
    attackMs: 2,
    decayMs: 28,
    sustain: 0.62,
    releaseMs: 18
  },
  {
    id: "pulse-50",
    label: "Pulse 50%",
    waveform: "pulse",
    dutyCycle: 0.5,
    attackMs: 2,
    decayMs: 34,
    sustain: 0.68,
    releaseMs: 20
  },
  {
    id: "triangle",
    label: "Triangle",
    waveform: "triangle",
    dutyCycle: 0.5,
    attackMs: 4,
    decayMs: 42,
    sustain: 0.58,
    releaseMs: 26
  },
  {
    id: "sawtooth",
    label: "Saw",
    waveform: "sawtooth",
    dutyCycle: 0.5,
    attackMs: 2,
    decayMs: 24,
    sustain: 0.48,
    releaseMs: 18
  },
  {
    id: "noise",
    label: "Noise Drums",
    waveform: "noise",
    dutyCycle: 0.5,
    attackMs: 1,
    decayMs: 12,
    sustain: 0.32,
    releaseMs: 8
  }
]);
var CHIP_SYNTH_VOICE_PROFILES = Object.freeze({
  PIANO: makeVoice("PIANO", {
    waveform: "sine",
    attackMs: 4,
    decayMs: 760,
    sustain: 0.24,
    releaseMs: 420,
    filter: filter("lowpass", 5800, 0.65),
    secondary: [
      secondary("sine", 2, 0.2),
      secondary("triangle", 3, 0.08)
    ],
    transientLevel: 0.08,
    transientMs: 14
  }),
  PIANO_2: makeVoice("PIANO_2", {
    waveform: "sine",
    attackMs: 7,
    decayMs: 980,
    sustain: 0.3,
    releaseMs: 520,
    filter: filter("lowpass", 3900, 0.7),
    secondary: [
      secondary("sine", 2, 0.12),
      secondary("triangle", 4, 0.04)
    ],
    transientLevel: 0.04,
    transientMs: 18
  }),
  EPIANO: makeVoice("EPIANO", {
    waveform: "sine",
    attackMs: 6,
    decayMs: 520,
    sustain: 0.58,
    releaseMs: 240,
    filter: filter("lowpass", 3800, 0.8),
    secondary: [
      secondary("pulse", 2, 0.2, 4, 0.5)
    ],
    transientLevel: 0.035,
    transientMs: 20,
    vibratoDepthCents: 2.5,
    vibratoRateHz: 4.8
  }),
  ORGAN: makeVoice("ORGAN", {
    waveform: "pulse",
    dutyCycle: 0.5,
    attackMs: 14,
    decayMs: 90,
    sustain: 0.84,
    releaseMs: 180,
    filter: filter("lowpass", 5500, 0.55),
    secondary: [
      secondary("sine", 2, 0.36),
      secondary("sine", 3, 0.18)
    ]
  }),
  CLAVINET: makeVoice("CLAVINET", {
    waveform: "pulse",
    dutyCycle: 0.25,
    attackMs: 1,
    decayMs: 170,
    sustain: 0.16,
    releaseMs: 80,
    filter: filter("bandpass", 2200, 1.1),
    secondary: [
      secondary("sawtooth", 2, 0.12)
    ],
    transientLevel: 0.2,
    transientMs: 9
  }),
  GUITAR: makeVoice("GUITAR", {
    waveform: "triangle",
    attackMs: 2,
    decayMs: 420,
    sustain: 0.17,
    releaseMs: 180,
    filter: filter("lowpass", 3200, 0.75),
    secondary: [
      secondary("sine", 2, 0.12)
    ],
    transientLevel: 0.18,
    transientMs: 16
  }),
  ELECTRIC_GUITAR: makeVoice("ELECTRIC_GUITAR", {
    waveform: "sawtooth",
    attackMs: 2,
    decayMs: 560,
    sustain: 0.28,
    releaseMs: 220,
    filter: filter("lowpass", 4600, 0.95),
    secondary: [
      secondary("triangle", 2, 0.18, 3)
    ],
    transientLevel: 0.12,
    transientMs: 13
  }),
  BASS: makeVoice("BASS", {
    waveform: "triangle",
    attackMs: 4,
    decayMs: 280,
    sustain: 0.52,
    releaseMs: 180,
    filter: filter("lowpass", 1250, 0.75),
    secondary: [
      secondary("sawtooth", 1, 0.22, -7)
    ],
    transientLevel: 0.04,
    transientMs: 20
  }),
  STRINGS: makeVoice("STRINGS", {
    waveform: "sawtooth",
    attackMs: 75,
    decayMs: 260,
    sustain: 0.78,
    releaseMs: 520,
    filter: filter("lowpass", 3100, 0.65),
    secondary: [
      secondary("triangle", 1, 0.36, -6)
    ],
    vibratoDepthCents: 5,
    vibratoRateHz: 5.1
  }),
  VIOLIN: makeVoice("VIOLIN", {
    waveform: "sawtooth",
    attackMs: 48,
    decayMs: 180,
    sustain: 0.78,
    releaseMs: 360,
    filter: filter("lowpass", 4200, 0.75),
    secondary: [
      secondary("triangle", 2, 0.2, 5)
    ],
    transientLevel: 0.035,
    transientMs: 18,
    vibratoDepthCents: 7,
    vibratoRateHz: 5.5
  }),
  CELLO: makeVoice("CELLO", {
    waveform: "triangle",
    attackMs: 82,
    decayMs: 280,
    sustain: 0.76,
    releaseMs: 420,
    filter: filter("lowpass", 2200, 0.7),
    secondary: [
      secondary("sawtooth", 2, 0.16, -4)
    ],
    vibratoDepthCents: 4,
    vibratoRateHz: 4.6
  }),
  HARP: makeVoice("HARP", {
    waveform: "triangle",
    attackMs: 2,
    decayMs: 680,
    sustain: 0.1,
    releaseMs: 230,
    filter: filter("lowpass", 5200, 0.6),
    secondary: [
      secondary("sine", 2, 0.14)
    ],
    transientLevel: 0.16,
    transientMs: 12
  }),
  MARIMBA: makeVoice("MARIMBA", {
    waveform: "sine",
    attackMs: 2,
    decayMs: 360,
    sustain: 0.08,
    releaseMs: 160,
    filter: filter("lowpass", 3400, 0.65),
    secondary: [
      secondary("sine", 3.95, 0.24)
    ],
    transientLevel: 0.14,
    transientMs: 10
  }),
  KALIMBA: makeVoice("KALIMBA", {
    waveform: "pulse",
    dutyCycle: 0.25,
    attackMs: 1,
    decayMs: 410,
    sustain: 0.07,
    releaseMs: 170,
    filter: filter("bandpass", 3100, 1.15),
    secondary: [
      secondary("sine", 2.03, 0.22)
    ],
    transientLevel: 0.13,
    transientMs: 8
  }),
  VIBRAPHONE: makeVoice("VIBRAPHONE", {
    waveform: "sine",
    attackMs: 3,
    decayMs: 900,
    sustain: 0.2,
    releaseMs: 520,
    filter: filter("lowpass", 4800, 0.65),
    secondary: [
      secondary("sine", 3, 0.18),
      secondary("sine", 4.2, 0.08)
    ],
    transientLevel: 0.06,
    transientMs: 12,
    vibratoDepthCents: 7,
    vibratoRateHz: 5.8
  }),
  XYLOPHONE: makeVoice("XYLOPHONE", {
    waveform: "sine",
    attackMs: 1,
    decayMs: 210,
    sustain: 0.04,
    releaseMs: 100,
    filter: filter("lowpass", 5e3, 0.6),
    secondary: [
      secondary("sine", 3.8, 0.3)
    ],
    transientLevel: 0.17,
    transientMs: 8
  }),
  CELESTA: makeVoice("CELESTA", {
    waveform: "sine",
    attackMs: 3,
    decayMs: 720,
    sustain: 0.12,
    releaseMs: 380,
    filter: filter("highpass", 420, 0.55),
    secondary: [
      secondary("sine", 2, 0.24),
      secondary("sine", 4, 0.09)
    ],
    transientLevel: 0.05,
    transientMs: 10
  }),
  TUBULAR_BELLS: makeVoice("TUBULAR_BELLS", {
    waveform: "sine",
    attackMs: 2,
    decayMs: 1650,
    sustain: 0.16,
    releaseMs: 950,
    filter: filter("lowpass", 5800, 0.55),
    secondary: [
      secondary("sine", 2.01, 0.28),
      secondary("sine", 3.9, 0.1)
    ],
    transientLevel: 0.08,
    transientMs: 14
  }),
  STEEL_DRUM: makeVoice("STEEL_DRUM", {
    waveform: "sine",
    attackMs: 2,
    decayMs: 620,
    sustain: 0.1,
    releaseMs: 280,
    filter: filter("bandpass", 2900, 1.05),
    secondary: [
      secondary("sine", 2.7, 0.2),
      secondary("sine", 4.1, 0.08)
    ],
    transientLevel: 0.12,
    transientMs: 10
  }),
  FLUTE: makeVoice("FLUTE", {
    waveform: "sine",
    attackMs: 38,
    decayMs: 140,
    sustain: 0.76,
    releaseMs: 150,
    filter: filter("lowpass", 2700, 0.7),
    secondary: [
      secondary("triangle", 2, 0.08)
    ],
    transientLevel: 0.08,
    transientMs: 40,
    noiseColor: "pink",
    vibratoDepthCents: 2,
    vibratoRateHz: 5.2
  }),
  CLARINET: makeVoice("CLARINET", {
    waveform: "pulse",
    dutyCycle: 0.25,
    attackMs: 24,
    decayMs: 170,
    sustain: 0.7,
    releaseMs: 130,
    filter: filter("lowpass", 3400, 0.8),
    secondary: [
      secondary("sine", 3, 0.12)
    ],
    transientLevel: 0.035,
    transientMs: 22,
    vibratoDepthCents: 2.5,
    vibratoRateHz: 5.1
  }),
  SAXOPHONE: makeVoice("SAXOPHONE", {
    waveform: "sawtooth",
    attackMs: 24,
    decayMs: 180,
    sustain: 0.74,
    releaseMs: 170,
    filter: filter("bandpass", 1650, 0.75),
    secondary: [
      secondary("pulse", 2, 0.12, 4, 0.5)
    ],
    transientLevel: 0.08,
    transientMs: 28,
    vibratoDepthCents: 4,
    vibratoRateHz: 5.3
  }),
  TRUMPET: makeVoice("TRUMPET", {
    waveform: "sawtooth",
    attackMs: 18,
    decayMs: 150,
    sustain: 0.7,
    releaseMs: 120,
    filter: filter("lowpass", 4600, 0.8),
    secondary: [
      secondary("pulse", 2, 0.22, 3, 0.5)
    ],
    transientLevel: 0.08,
    transientMs: 18
  }),
  BRASS: makeVoice("BRASS", {
    waveform: "pulse",
    dutyCycle: 0.5,
    attackMs: 28,
    decayMs: 210,
    sustain: 0.76,
    releaseMs: 190,
    filter: filter("lowpass", 3900, 0.75),
    secondary: [
      secondary("sawtooth", 2, 0.2, -4)
    ],
    transientLevel: 0.06,
    transientMs: 26
  }),
  SYNTH_LEAD: makeVoice("SYNTH_LEAD", {
    waveform: "sawtooth",
    attackMs: 8,
    decayMs: 260,
    sustain: 0.62,
    releaseMs: 180,
    filter: filter("lowpass", 5200, 0.7),
    secondary: [
      secondary("pulse", 1, 0.2, 7, 0.5)
    ],
    vibratoDepthCents: 3,
    vibratoRateHz: 5.4
  }),
  SYNTH_PAD: makeVoice("SYNTH_PAD", {
    waveform: "triangle",
    attackMs: 120,
    decayMs: 520,
    sustain: 0.72,
    releaseMs: 680,
    filter: filter("lowpass", 2900, 0.6),
    secondary: [
      secondary("sawtooth", 1, 0.18, -9)
    ],
    vibratoDepthCents: 2,
    vibratoRateHz: 4.2
  }),
  TAMBOURINE: makeVoice("TAMBOURINE", {
    waveform: "noise",
    attackMs: 1,
    decayMs: 150,
    sustain: 0.035,
    releaseMs: 80,
    filter: filter("highpass", 5400, 0.8),
    transientLevel: 0.5,
    transientMs: 6
  }),
  SHAKER: makeVoice("SHAKER", {
    waveform: "noise",
    attackMs: 1,
    decayMs: 95,
    sustain: 0.025,
    releaseMs: 48,
    filter: filter("highpass", 3800, 0.65),
    noiseColor: "pink",
    transientLevel: 0.3,
    transientMs: 5
  }),
  GB_PULSE_1: makeVoice("GB_PULSE_1", {
    waveform: "pulse",
    dutyCycle: 0.25,
    attackMs: 1,
    decayMs: 120,
    sustain: 0.56,
    releaseMs: 24,
    filter: filter("lowpass", 8500, 0.7)
  }),
  GB_PULSE_2: makeVoice("GB_PULSE_2", {
    waveform: "pulse",
    dutyCycle: 0.5,
    attackMs: 1,
    decayMs: 150,
    sustain: 0.5,
    releaseMs: 28,
    filter: filter("lowpass", 7400, 0.72)
  }),
  GB_WAVE: makeVoice("GB_WAVE", {
    waveform: "triangle",
    attackMs: 1,
    decayMs: 220,
    sustain: 0.52,
    releaseMs: 42,
    filter: filter("lowpass", 6800, 0.8)
  }),
  GB_NOISE: makeVoice("GB_NOISE", {
    waveform: "noise",
    attackMs: 1,
    decayMs: 90,
    sustain: 0.18,
    releaseMs: 22,
    filter: filter("highpass", 3800, 0.7),
    noiseMode: "game-boy"
  }),
  NES_PULSE_1: makeVoice("NES_PULSE_1", {
    waveform: "pulse",
    dutyCycle: 0.125,
    attackMs: 1,
    decayMs: 135,
    sustain: 0.54,
    releaseMs: 25,
    filter: filter("lowpass", 8100, 0.72)
  }),
  NES_PULSE_2: makeVoice("NES_PULSE_2", {
    waveform: "pulse",
    dutyCycle: 0.25,
    attackMs: 1,
    decayMs: 155,
    sustain: 0.5,
    releaseMs: 28,
    filter: filter("lowpass", 7200, 0.72)
  }),
  NES_TRIANGLE: makeVoice("NES_TRIANGLE", {
    waveform: "triangle",
    attackMs: 1,
    decayMs: 260,
    sustain: 0.78,
    releaseMs: 32,
    filter: filter("lowpass", 5600, 0.75)
  }),
  NES_NOISE: makeVoice("NES_NOISE", {
    waveform: "noise",
    attackMs: 1,
    decayMs: 105,
    sustain: 0.2,
    releaseMs: 24,
    filter: filter("highpass", 2600, 0.65),
    noiseMode: "nes-long"
  })
});
var CHIP_SYNTH_MACHINE_PROFILES = Object.freeze([
  Object.freeze({
    id: "NONE",
    label: "Free CHIP",
    hint: "\u81EA\u7531\u306A\u30C1\u30C3\u30D7\u97F3\u6E90\u3002\u901A\u5E38\u306E\u30D7\u30EA\u30BB\u30C3\u30C8\u3092\u4F7F\u3044\u307E\u3059\u3002",
    channels: Object.freeze([])
  }),
  Object.freeze({
    id: "GAME_BOY",
    label: "Game Boy",
    hint: "2 pulse + 32-step wave\u98A8 + 7/15-bit noise",
    channels: Object.freeze([
      Object.freeze({
        id: "GB_PULSE_1",
        label: "GB Pulse 1",
        voiceId: "GB_PULSE_1",
        hint: "Square 1 \xB7 25% duty"
      }),
      Object.freeze({
        id: "GB_PULSE_2",
        label: "GB Pulse 2",
        voiceId: "GB_PULSE_2",
        hint: "Square 2 \xB7 50% duty"
      }),
      Object.freeze({
        id: "GB_WAVE",
        label: "GB Wave",
        voiceId: "GB_WAVE",
        hint: "32-step wave\u98A8 \xB7 triangle approximation"
      }),
      Object.freeze({
        id: "GB_NOISE",
        label: "GB Noise",
        voiceId: "GB_NOISE",
        hint: "Game Boy-style LFSR noise"
      })
    ])
  }),
  Object.freeze({
    id: "FAMICOM",
    label: "Famicom / NES",
    hint: "2 pulse + triangle + long LFSR noise\uFF08DPCM\u306F\u672A\u5BFE\u5FDC\uFF09",
    channels: Object.freeze([
      Object.freeze({
        id: "NES_PULSE_1",
        label: "NES Pulse 1",
        voiceId: "NES_PULSE_1",
        hint: "Square 1 \xB7 12.5% duty"
      }),
      Object.freeze({
        id: "NES_PULSE_2",
        label: "NES Pulse 2",
        voiceId: "NES_PULSE_2",
        hint: "Square 2 \xB7 25% duty"
      }),
      Object.freeze({
        id: "NES_TRIANGLE",
        label: "NES Triangle",
        voiceId: "NES_TRIANGLE",
        hint: "Triangle bass channel"
      }),
      Object.freeze({
        id: "NES_NOISE",
        label: "NES Noise",
        voiceId: "NES_NOISE",
        hint: "Famicom-style long LFSR noise"
      })
    ])
  })
]);
function getChipSynthMachineProfile(machineId) {
  return CHIP_SYNTH_MACHINE_PROFILES.find((profile) => profile.id === machineId) ?? CHIP_SYNTH_MACHINE_PROFILES[0];
}
function getChipSynthPreset(presetId) {
  return CHIP_SYNTH_PRESETS.find((preset) => preset.id === presetId) ?? CHIP_SYNTH_PRESETS[0];
}
var voiceFromPreset = (presetId) => {
  const preset = getChipSynthPreset(presetId);
  return makeVoice(`preset:${preset.id}`, {
    waveform: preset.waveform,
    dutyCycle: preset.dutyCycle,
    attackMs: preset.attackMs,
    decayMs: preset.decayMs,
    sustain: preset.sustain,
    releaseMs: preset.releaseMs
  });
};
var drumVoiceForPitch = (pitchMidi, presetId) => {
  const pitch = Math.trunc(pitchMidi);
  if (pitch === 36 || pitch === 35) {
    return makeVoice("DRUMS_KICK", {
      waveform: presetId === "pulse-25" ? "pulse" : "sine",
      attackMs: 1,
      decayMs: 210,
      sustain: 0.035,
      releaseMs: 75,
      filter: filter("lowpass", 1250, 0.7),
      pitchStartRatio: 6.5,
      pitchSweepMs: 34,
      transientLevel: 0.08,
      transientMs: 8
    });
  }
  if (pitch === 38 || pitch === 39 || pitch === 40) {
    return makeVoice("DRUMS_SNARE", {
      waveform: presetId === "sawtooth" ? "sawtooth" : "noise",
      attackMs: 1,
      decayMs: 145,
      sustain: 0.05,
      releaseMs: 65,
      filter: filter("bandpass", 1850, 0.8),
      transientLevel: 0.26,
      transientMs: 5
    });
  }
  if (pitch === 42 || pitch === 44 || pitch === 46) {
    const softHat = presetId === "triangle";
    return makeVoice(pitch === 46 ? "DRUMS_OPEN_HAT" : "DRUMS_HAT", {
      waveform: softHat ? "triangle" : "noise",
      attackMs: 1,
      decayMs: pitch === 46 ? 230 : 54,
      sustain: 0.018,
      releaseMs: pitch === 46 ? 125 : 32,
      filter: softHat ? filter("lowpass", 3600, 0.7) : filter("highpass", 5800, 0.75),
      transientLevel: 0.34,
      transientMs: 4
    });
  }
  return makeVoice("DRUMS_TOM", {
    waveform: presetId === "sawtooth" ? "sawtooth" : "sine",
    attackMs: 1,
    decayMs: 240,
    sustain: 0.06,
    releaseMs: 90,
    filter: filter("lowpass", 2100, 0.7),
    pitchStartRatio: 2.5,
    pitchSweepMs: 24,
    transientLevel: 0.08,
    transientMs: 7
  });
};
var sparseDrumVoiceOverride = (override) => {
  if (override === void 0) return void 0;
  const reference = drumVoiceForPitch(38, "noise");
  const sparse = {};
  if (override.waveform !== void 0 && override.waveform !== reference.waveform) {
    sparse.waveform = override.waveform;
  }
  if (override.dutyCycle !== void 0 && override.dutyCycle !== reference.dutyCycle) sparse.dutyCycle = override.dutyCycle;
  if (override.attackMs !== void 0 && override.attackMs !== reference.attackMs) {
    sparse.attackMs = override.attackMs;
  }
  if (override.decayMs !== void 0 && override.decayMs !== reference.decayMs) {
    sparse.decayMs = override.decayMs;
  }
  if (override.sustain !== void 0 && override.sustain !== reference.sustain) {
    sparse.sustain = override.sustain;
  }
  if (override.releaseMs !== void 0 && override.releaseMs !== reference.releaseMs) {
    sparse.releaseMs = override.releaseMs;
  }
  if (override.noiseColor !== void 0 && override.noiseColor !== reference.noiseColor) {
    sparse.noiseColor = override.noiseColor;
  }
  if (override.transientLevel !== void 0 && override.transientLevel !== reference.transientLevel) sparse.transientLevel = override.transientLevel;
  if (override.transientMs !== void 0 && override.transientMs !== reference.transientMs) {
    sparse.transientMs = override.transientMs;
  }
  if (override.pitchStartRatio !== void 0 && override.pitchStartRatio !== reference.pitchStartRatio) sparse.pitchStartRatio = override.pitchStartRatio;
  if (override.pitchSweepMs !== void 0 && override.pitchSweepMs !== reference.pitchSweepMs) sparse.pitchSweepMs = override.pitchSweepMs;
  if (override.vibratoDepthCents !== void 0 && override.vibratoDepthCents !== reference.vibratoDepthCents) sparse.vibratoDepthCents = override.vibratoDepthCents;
  if (override.vibratoRateHz !== void 0 && override.vibratoRateHz !== reference.vibratoRateHz) sparse.vibratoRateHz = override.vibratoRateHz;
  if (override.filter === null) {
    sparse.filter = null;
  } else if (override.filter !== void 0 && reference.filter !== void 0) {
    const filterPatch = {};
    if (override.filter.type !== void 0 && override.filter.type !== reference.filter.type) {
      filterPatch.type = override.filter.type;
    }
    if (override.filter.frequencyHz !== void 0 && override.filter.frequencyHz !== reference.filter.frequencyHz) filterPatch.frequencyHz = override.filter.frequencyHz;
    if (override.filter.q !== void 0 && override.filter.q !== reference.filter.q) {
      filterPatch.q = override.filter.q;
    }
    if (Object.keys(filterPatch).length > 0) sparse.filter = filterPatch;
  }
  return sparse;
};
function getChipSynthVoice(voiceId, pitchMidi, presetId = "pulse-25", overrides, machineId = "NONE") {
  const normalized = String(voiceId ?? "").trim().toUpperCase().replace(/^INSTRUMENT:/u, "");
  const machineVoiceId = normalized === "CHIP" || normalized.length === 0 ? getChipSynthMachineProfile(machineId).channels[0]?.voiceId : void 0;
  const resolvedVoiceId = machineVoiceId ?? normalized;
  const drumBase = normalized === "DRUMS" ? drumVoiceForPitch(pitchMidi ?? 38, presetId) : void 0;
  const base = drumBase !== void 0 ? drumBase : resolvedVoiceId === "CHIP" || resolvedVoiceId.length === 0 ? voiceFromPreset(presetId) : CHIP_SYNTH_VOICE_PROFILES[resolvedVoiceId] ?? voiceFromPreset(presetId);
  const override = normalized === "DRUMS" ? overrides?.get(drumBase?.id ?? "") ?? sparseDrumVoiceOverride(overrides?.get(normalized)) : machineVoiceId === void 0 ? overrides?.get(normalized) : overrides?.get(normalized) ?? overrides?.get(machineVoiceId);
  return override === void 0 ? base : applyChipSynthVoiceOverride(base, override);
}
function applyChipSynthVoiceOverride(base, override) {
  const nextFilter = override.filter === null ? void 0 : override.filter === void 0 ? base.filter : {
    type: override.filter.type ?? base.filter?.type ?? "lowpass",
    frequencyHz: override.filter.frequencyHz ?? base.filter?.frequencyHz ?? 6e3,
    q: override.filter.q ?? base.filter?.q ?? 0.7
  };
  const patch = {
    waveform: override.waveform ?? base.waveform,
    dutyCycle: override.dutyCycle ?? base.dutyCycle,
    attackMs: override.attackMs ?? base.attackMs,
    decayMs: override.decayMs ?? base.decayMs,
    sustain: override.sustain ?? base.sustain,
    releaseMs: override.releaseMs ?? base.releaseMs,
    noiseColor: override.noiseColor ?? base.noiseColor,
    noiseMode: base.noiseMode,
    transientLevel: override.transientLevel ?? base.transientLevel,
    transientMs: override.transientMs ?? base.transientMs,
    pitchStartRatio: override.pitchStartRatio ?? base.pitchStartRatio,
    pitchSweepMs: override.pitchSweepMs ?? base.pitchSweepMs,
    vibratoDepthCents: override.vibratoDepthCents ?? base.vibratoDepthCents,
    vibratoRateHz: override.vibratoRateHz ?? base.vibratoRateHz,
    secondary: base.secondary,
    ...nextFilter === void 0 ? {} : {
      filter: nextFilter
    }
  };
  return makeVoice(base.id, patch);
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
function renderVoiceIdForTrack(track) {
  const source = `${String(track.trackId)} ${track.name}`.toUpperCase().replace(/[^A-Z0-9]+/gu, "_");
  const aliases = [
    [
      "GB_PULSE_1",
      "GAME_BOY_PULSE_1"
    ],
    [
      "GB_PULSE_2",
      "GAME_BOY_PULSE_2"
    ],
    [
      "GB_WAVE",
      "GAME_BOY_WAVE"
    ],
    [
      "GB_NOISE",
      "GAME_BOY_NOISE"
    ],
    [
      "GB_PULSE_1",
      "GB_PULSE_1"
    ],
    [
      "GB_PULSE_2",
      "GB_PULSE_2"
    ],
    [
      "GB_WAVE",
      "GB_WAVE"
    ],
    [
      "GB_NOISE",
      "GB_NOISE"
    ],
    [
      "NES_PULSE_1",
      "FAMICOM_PULSE_1"
    ],
    [
      "NES_PULSE_2",
      "FAMICOM_PULSE_2"
    ],
    [
      "NES_TRIANGLE",
      "FAMICOM_TRIANGLE"
    ],
    [
      "NES_NOISE",
      "FAMICOM_NOISE"
    ],
    [
      "NES_PULSE_1",
      "NES_PULSE_1"
    ],
    [
      "NES_PULSE_2",
      "NES_PULSE_2"
    ],
    [
      "NES_TRIANGLE",
      "NES_TRIANGLE"
    ],
    [
      "NES_NOISE",
      "NES_NOISE"
    ],
    [
      "ELECTRIC_GUITAR",
      "ELECTRIC_GUITAR"
    ],
    [
      "PIANO_2",
      "PIANO_2"
    ],
    [
      "TUBULAR_BELLS",
      "TUBULAR_BELLS"
    ],
    [
      "SYNTH_LEAD",
      "SYNTH_LEAD"
    ],
    [
      "SYNTH_PAD",
      "SYNTH_PAD"
    ],
    [
      "TAMBOURINE",
      "TAMBOURINE"
    ],
    [
      "VIBRAPHONE",
      "VIBRAPHONE"
    ],
    [
      "XYLOPHONE",
      "XYLOPHONE"
    ],
    [
      "CLARINET",
      "CLARINET"
    ],
    [
      "SAXOPHONE",
      "SAXOPHONE"
    ],
    [
      "STEEL_DRUM",
      "STEEL_DRUM"
    ],
    [
      "MARIMBA",
      "MARIMBA"
    ],
    [
      "KALIMBA",
      "KALIMBA"
    ],
    [
      "CELESTA",
      "CELESTA"
    ],
    [
      "TRUMPET",
      "TRUMPET"
    ],
    [
      "BRASS",
      "BRASS"
    ],
    [
      "CLAVINET",
      "CLAVINET"
    ],
    [
      "ORGAN",
      "ORGAN"
    ],
    [
      "VIOLIN",
      "VIOLIN"
    ],
    [
      "CELLO",
      "CELLO"
    ],
    [
      "STRINGS",
      "STRINGS"
    ],
    [
      "GUITAR",
      "GUITAR"
    ],
    [
      "HARP",
      "HARP"
    ],
    [
      "BASS",
      "BASS"
    ],
    [
      "FLUTE",
      "FLUTE"
    ],
    [
      "SHAKER",
      "SHAKER"
    ],
    [
      "DRUMS",
      "DRUMS"
    ],
    [
      "PIANO",
      "PIANO"
    ],
    [
      "CHIP",
      "CHIP"
    ]
  ];
  return aliases.find(([, token]) => source.includes(token))?.[0];
}
function renderDrumPreset(track, pitchMidi, project) {
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
function synthPresetOverrides(presets) {
  return new Map((presets ?? []).map((preset) => [
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
        q: preset.filterQ
      },
      noiseColor: preset.noiseColor,
      transientLevel: preset.transientLevel,
      transientMs: preset.transientMs,
      pitchStartRatio: preset.pitchStartRatio,
      pitchSweepMs: preset.pitchSweepMs,
      vibratoDepthCents: preset.vibratoDepthCents,
      vibratoRateHz: preset.vibratoRateHz
    }
  ]));
}
function deterministicNoise(seed) {
  const value = Math.sin((seed + 1) * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}
function deterministicLfsrNoise(seed, noiseMode) {
  let lfsr = (Math.abs(Math.trunc(seed)) | 1) & 32767;
  const steps = 1 + Math.abs(Math.trunc(seed)) % 7;
  const tap = noiseMode === "game-boy" || noiseMode === "nes-long" ? 1 : 6;
  for (let step = 0; step < steps; step += 1) {
    const feedback = (lfsr & 1 ^ lfsr >> tap & 1) & 1;
    lfsr = lfsr >> 1 | feedback << 14;
    if (noiseMode === "game-boy") {
      lfsr = lfsr & ~(1 << 6) | feedback << 6;
    }
  }
  return (lfsr & 1) === 0 ? 1 : -1;
}
function voiceWaveSample(waveform, phase, seed, dutyCycle, noiseMode = "random") {
  if (waveform === "noise") {
    return noiseMode === "random" ? deterministicNoise(seed) : deterministicLfsrNoise(seed, noiseMode);
  }
  if (waveform === "pulse") {
    const cycle = (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI))) % 1;
    return cycle < dutyCycle ? 1 : -1;
  }
  if (waveform === "triangle") {
    return 1 - 4 * Math.abs(Math.round(phase / (2 * Math.PI)) - phase / (2 * Math.PI));
  }
  if (waveform === "sawtooth") {
    return 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
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
function noteWaveSample(note, track, project, timeSeconds, sampleIndex, voiceOverrides) {
  const range = noteSeconds(note, project);
  const local = timeSeconds - range.start;
  if (local < 0 || local >= range.duration) return 0;
  const voice = getChipSynthVoice(renderVoiceIdForTrack(track), note.pitchMidi, renderDrumPreset(track, note.pitchMidi, project), voiceOverrides, project.chipMachineId ?? "NONE");
  const attack = Math.min(range.duration * 0.2, voice.attackMs / 1e3);
  const release = Math.min(range.duration * 0.35, voice.releaseMs / 1e3);
  const decay = Math.min(range.duration * 0.45, voice.decayMs / 1e3);
  const decayEnd = Math.min(range.duration - release, attack + decay);
  const sustain = Math.max(0.02, Math.min(1, voice.sustain));
  const envelope = local < attack ? local / Math.max(1e-4, attack) : local < decayEnd ? 1 - (1 - sustain) * ((local - attack) / Math.max(1e-4, decayEnd - attack)) : local > range.duration - release ? sustain * ((range.duration - local) / Math.max(1e-4, release)) : sustain;
  const baseFrequency = 440 * 2 ** ((note.pitchMidi - 69) / 12);
  const sweepProgress = voice.pitchSweepMs > 0 ? Math.min(1, local / (voice.pitchSweepMs / 1e3)) : 1;
  const sweepRatio = voice.pitchStartRatio > 1 ? voice.pitchStartRatio ** (1 - sweepProgress) : 1;
  const vibrato = voice.vibratoDepthCents > 0 ? 2 ** (Math.sin(2 * Math.PI * voice.vibratoRateHz * local) * voice.vibratoDepthCents / 1200) : 1;
  const frequency = baseFrequency * sweepRatio * vibrato;
  const phase = 2 * Math.PI * frequency * local;
  let sample = voiceWaveSample(voice.waveform, phase, sampleIndex + note.pitchMidi, voice.dutyCycle, voice.noiseMode);
  for (const partial of voice.secondary) {
    const partialFrequency = frequency * partial.ratio * 2 ** (partial.detuneCents / 1200);
    sample += partial.gain * voiceWaveSample(partial.waveform, 2 * Math.PI * partialFrequency * local, sampleIndex + note.pitchMidi + Math.round(partial.ratio * 17), partial.dutyCycle);
  }
  const transientDuration = Math.min(range.duration, Math.max(4e-3, voice.transientMs / 1e3));
  if (voice.transientLevel > 0 && local < transientDuration) {
    const transientEnvelope = 1 - local / transientDuration;
    sample += deterministicNoise(sampleIndex + note.pitchMidi * 3) * voice.transientLevel * transientEnvelope;
  }
  if (voice.filter?.type === "bandpass" && voice.waveform === "noise") {
    sample = sample * 0.72 + Math.sin(phase) * 0.18;
  } else if (voice.filter?.type === "highpass" && voice.waveform === "noise") {
    sample *= 0.84;
  } else if (voice.filter?.type === "lowpass" && voice.waveform === "noise") {
    sample *= 0.68;
  }
  return Math.max(-1, Math.min(1, sample)) * envelope * (note.velocityMilli / 1e3) * 0.28;
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
  const sourceRate = accessor.reader.plan.sampleRateHz;
  const sourceFrames = accessor.revision.source.metadata.sampleFrames;
  const sourceOffsetFrame = Math.min(sourceFrames, Math.floor(clip.sourceOffsetUs * sourceRate / 1e6));
  const sourceAvailableFrames = Math.max(1, sourceFrames - sourceOffsetFrame);
  const sourceDurationSeconds = sourceAvailableFrames / sourceRate;
  const playbackRate = Math.min(4, Math.max(0.25, Number.isFinite(clip.playbackRate ?? 1) ? clip.playbackRate ?? 1 : 1));
  const clipDurationSeconds = clip.loop ? range.duration : Math.min(range.duration, sourceDurationSeconds / playbackRate);
  const clipEndSeconds = range.start + clipDurationSeconds;
  const first = Math.max(0, Math.floor((Math.max(blockStartSeconds, range.start) - blockStartSeconds) * outputRate));
  const last = Math.min(left.length, Math.ceil((Math.min(blockEndSeconds, clipEndSeconds) - blockStartSeconds) * outputRate));
  if (last <= first) return audioOk(true);
  const fadeInSeconds = ticksToSeconds(clip.fadeInTick, project);
  const fadeOutSeconds = ticksToSeconds(clip.fadeOutTick, project);
  const clipGain = dbToLinear2(clip.gainMilliDb);
  let cursor = first;
  while (cursor < last) {
    const sampleTime = blockStartSeconds + cursor / outputRate;
    const localTime = Math.max(0, sampleTime - range.start);
    const sourceLocal = clip.loop ? localTime * playbackRate % sourceDurationSeconds : localTime * playbackRate;
    const untilLoop = clip.loop ? Math.max(1 / outputRate, (sourceDurationSeconds - sourceLocal) / playbackRate) : (last - cursor) / outputRate;
    const segmentCount = Math.max(1, Math.min(last - cursor, Math.ceil(untilLoop * outputRate)));
    const sourceStartFloat = sourceOffsetFrame + sourceLocal * sourceRate;
    const sourceStartFrame = Math.floor(sourceStartFloat);
    const sourceRangeFrames = Math.max(2, Math.ceil(segmentCount * sourceRate * playbackRate / outputRate) + 2);
    const source = await accessor.readRange(sourceStartFrame, sourceRangeFrames);
    if (!source.ok) return source;
    const sourceSamples = source.value;
    for (let index = 0; index < segmentCount && cursor + index < last; index += 1) {
      const time = blockStartSeconds + (cursor + index) / outputRate;
      const local = Math.max(0, time - range.start);
      const localSource = clip.loop ? local * playbackRate % sourceDurationSeconds : local * playbackRate;
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
      const fade = fadeFactor(local, clipDurationSeconds, fadeInSeconds, fadeOutSeconds);
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
  const voiceOverrides = synthPresetOverrides(options.project.synthPresets);
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
            const value = noteWaveSample(note, track, options.project, time, completedFrames + index, voiceOverrides);
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
export {
  createMemoryAudioRenderSink,
  renderOfflineAudio
};
