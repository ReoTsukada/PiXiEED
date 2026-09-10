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
var AUDIO200_MAX_TICK = Number.MAX_SAFE_INTEGER;

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

// src/audio/audio-200/timebase.ts
var MAX_TICK = Math.min(AUDIO200_MAX_TICK, 9e9);
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
function ticksToAutomationSeconds(tick, tempoMilliBpm, ticksPerQuarter) {
  return audioTickToSeconds(tick, automationClock(tempoMilliBpm, ticksPerQuarter));
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
function automationValueToParam(value, kind) {
  if (kind === "GAIN_DB") return 10 ** (clamp(value, -120, 24) / 20);
  if (kind === "FILTER_CUTOFF_HZ") {
    return clamp(value, MIN_CUTOFF_HZ, MAX_CUTOFF_HZ);
  }
  return kind === "PAN" ? clamp(value, -1, 1) : value;
}
function scheduleAudioAutomation(param, curve, options, generation = 0) {
  const fromTick = Math.max(0, options.fromTick ?? 0);
  const untilTick = options.untilTick ?? Number.MAX_SAFE_INTEGER;
  const startAt = Math.max(finite(options.nowSeconds, 0), finite(options.startAtSeconds ?? options.nowSeconds, options.nowSeconds));
  const transform = options.valueTransform ?? ((value) => automationValueToParam(value, curve.valueKind));
  const firstValue = transform(automationValueAtTick(curve, fromTick));
  param.cancelScheduledValues(startAt);
  param.setValueAtTime(firstValue, startAt);
  let scheduledPoints = 0;
  let lastValue = firstValue;
  for (const point of curve.points) {
    if (point.tick <= fromTick || point.tick > untilTick) continue;
    const pointTime = Math.max(startAt, startAt + ticksToAutomationSeconds(point.tick - fromTick, options.tempoMilliBpm, options.ticksPerQuarter));
    lastValue = transform(point.value);
    param.linearRampToValueAtTime(lastValue, pointTime);
    scheduledPoints += 1;
  }
  return {
    generation,
    scheduledPoints,
    firstValue,
    lastValue
  };
}

// src/audio/audio-320/effects.ts
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

// src/audio/audio-330/mastering.ts
var MAX_INTEGRATED_FRAMES = 48e3 * 300;

// src/audio/audio-240/mixer-runtime.ts
var MIN_LINEAR_GAIN = 1e-4;
var MAX_LINEAR_GAIN = 16;
function dbToLinear(milliDb) {
  const db = Number.isFinite(milliDb) ? milliDb / 1e3 : 0;
  return Math.min(MAX_LINEAR_GAIN, Math.max(MIN_LINEAR_GAIN, 10 ** (db / 20)));
}
function mixerGainToLinear(milliDb) {
  return dbToLinear(milliDb);
}

// src/audio/audio-240/transport.ts
var EPSILON_SECONDS = 1e-7;
function finiteNonNegative(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
function normalizeEvents(events) {
  return events.filter((event) => {
    return event.id.length > 0 && Number.isFinite(event.startSeconds) && event.startSeconds >= 0 && Number.isFinite(event.durationSeconds) && event.durationSeconds > 0;
  }).map((event) => ({
    ...event,
    startSeconds: Math.max(0, event.startSeconds),
    durationSeconds: Math.max(EPSILON_SECONDS, event.durationSeconds)
  })).sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));
}
function sourceFromArray(events) {
  return {
    length: events.length,
    at: (index) => events[index],
    findFirstIndex: (startSeconds) => events.findIndex((event) => event.startSeconds >= startSeconds)
  };
}
var SampleAccurateScheduler = class {
  options;
  events;
  durationSeconds;
  stateValue;
  loopValue;
  positionSeconds;
  anchorTimeSeconds;
  nextEventIndex;
  nextEventCycle;
  timerHandle;
  lookaheadSeconds;
  intervalMs;
  constructor(options) {
    this.options = options;
    this.events = sourceFromArray([]);
    this.durationSeconds = 0;
    this.stateValue = "STOPPED";
    this.loopValue = false;
    this.positionSeconds = 0;
    this.anchorTimeSeconds = 0;
    this.nextEventIndex = 0;
    this.nextEventCycle = 0;
    this.lookaheadSeconds = finiteNonNegative(options.lookaheadSeconds ?? 0.1, 0.1);
    this.intervalMs = Math.max(8, Math.trunc(finiteNonNegative(options.intervalMs ?? 25, 25)));
  }
  get state() {
    return this.stateValue;
  }
  get loop() {
    return this.loopValue;
  }
  get duration() {
    return this.durationSeconds;
  }
  get position() {
    if (this.stateValue !== "PLAYING") return this.positionSeconds;
    const elapsed = Math.max(0, this.options.clock.now() - this.anchorTimeSeconds);
    if (this.durationSeconds <= 0) return 0;
    return this.loopValue ? elapsed % this.durationSeconds : Math.min(this.durationSeconds, elapsed);
  }
  get isPlaying() {
    return this.stateValue === "PLAYING";
  }
  load(events, durationSeconds) {
    this.stop();
    const normalizedEvents = Array.isArray(events) ? normalizeEvents(events) : void 0;
    this.events = normalizedEvents === void 0 ? events : sourceFromArray(normalizedEvents);
    const eventEnd = normalizedEvents?.reduce((latest, event) => Math.max(latest, event.startSeconds + event.durationSeconds), 0) ?? 0;
    this.durationSeconds = Math.max(EPSILON_SECONDS, finiteNonNegative(durationSeconds, 0), eventEnd);
    this.positionSeconds = 0;
    this.resetCursor(0);
  }
  setLoop(enabled) {
    this.loopValue = enabled;
    if (this.stateValue === "PLAYING") this.pump();
  }
  start(positionSeconds, loop = this.loopValue) {
    if (this.durationSeconds <= 0) return false;
    this.stopTimer();
    this.loopValue = loop;
    const requested = positionSeconds === void 0 ? this.positionSeconds : positionSeconds;
    this.positionSeconds = Math.min(this.durationSeconds, Math.max(0, finiteNonNegative(requested, 0)));
    this.anchorTimeSeconds = this.options.clock.now() - this.positionSeconds;
    this.resetCursor(this.positionSeconds);
    this.stateValue = "PLAYING";
    this.pump();
    this.timerHandle = this.options.timer.setInterval(() => this.pump(), this.intervalMs);
    return true;
  }
  pause() {
    if (this.stateValue === "PLAYING") {
      this.positionSeconds = this.position;
      this.stateValue = "PAUSED";
      this.stopTimer();
    }
    return this.positionSeconds;
  }
  stop() {
    this.stopTimer();
    this.stateValue = "STOPPED";
    this.positionSeconds = 0;
    this.resetCursor(0);
  }
  seek(positionSeconds) {
    this.positionSeconds = Math.min(this.durationSeconds, Math.max(0, finiteNonNegative(positionSeconds, 0)));
    this.resetCursor(this.positionSeconds);
    if (this.stateValue === "PLAYING") {
      this.anchorTimeSeconds = this.options.clock.now() - this.positionSeconds;
      this.pump();
    }
    return this.positionSeconds;
  }
  /** Pump immediately; useful for tests and for a transport resume. */
  pump(nowSeconds = this.options.clock.now()) {
    if (this.stateValue !== "PLAYING") return;
    const elapsed = Math.max(0, nowSeconds - this.anchorTimeSeconds);
    if (!this.loopValue && elapsed >= this.durationSeconds) {
      this.positionSeconds = this.durationSeconds;
      this.stateValue = "STOPPED";
      this.stopTimer();
      this.options.onEnded?.();
      return;
    }
    const targetElapsed = elapsed + this.lookaheadSeconds;
    while (this.events.length > 0) {
      const event = this.events.at(this.nextEventIndex);
      if (event === void 0) break;
      const occurrenceElapsed = this.nextEventCycle * this.durationSeconds + event.startSeconds;
      if (occurrenceElapsed >= targetElapsed - EPSILON_SECONDS) break;
      this.options.onSchedule(event, this.anchorTimeSeconds + occurrenceElapsed);
      this.advanceCursor();
    }
    this.positionSeconds = this.loopValue ? elapsed % this.durationSeconds : Math.min(this.durationSeconds, elapsed);
  }
  resetCursor(positionSeconds) {
    if (this.events.length === 0 || this.durationSeconds <= 0) {
      this.nextEventIndex = 0;
      this.nextEventCycle = 0;
      return;
    }
    const cycle = this.loopValue ? Math.floor(positionSeconds / this.durationSeconds) : 0;
    const withinCycle = this.loopValue ? positionSeconds - cycle * this.durationSeconds : positionSeconds;
    const first = this.events.findFirstIndex(withinCycle - EPSILON_SECONDS);
    if (first >= 0) {
      this.nextEventIndex = first;
      this.nextEventCycle = cycle;
    } else {
      this.nextEventIndex = 0;
      this.nextEventCycle = cycle + 1;
    }
  }
  advanceCursor() {
    this.nextEventIndex += 1;
    if (this.nextEventIndex >= this.events.length) {
      this.nextEventIndex = 0;
      this.nextEventCycle += 1;
    }
    if (!this.loopValue && this.nextEventCycle > 0) {
      this.nextEventIndex = this.events.length;
    }
  }
  stopTimer() {
    if (this.timerHandle === void 0) return;
    this.options.timer.clearInterval(this.timerHandle);
    this.timerHandle = void 0;
  }
};

// src/audio/audio-240/long-audio-runtime.ts
function finiteNonNegative2(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
function clamp2(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function ticksToSeconds(ticks, tempoMilliBpm, ticksPerQuarter) {
  return audioTickToSeconds(ticks, {
    framesPerSecond: 1,
    tempoMilliBpm: Number.isFinite(tempoMilliBpm) && tempoMilliBpm > 0 ? tempoMilliBpm : 12e4,
    ticksPerQuarter: Number.isFinite(ticksPerQuarter) && ticksPerQuarter > 0 ? ticksPerQuarter : 480
  });
}
function makeAudioBuffer(context, chunk) {
  const buffer = context.createBuffer(chunk.channels, chunk.frameCount, chunk.sampleRateHz);
  for (let channel = 0; channel < chunk.channels; channel += 1) {
    buffer.getChannelData(channel).set(chunk.samples[channel]);
  }
  return buffer;
}
function scheduleGainEnvelope(gain, startTime, durationSeconds, localStartSeconds, localEndSeconds, clipDurationSeconds, clipGain, fadeInSeconds, fadeOutSeconds) {
  const endTime = startTime + durationSeconds;
  const factorAt = (localSeconds) => {
    const fadeIn = fadeInSeconds > 0 ? clamp2(localSeconds / fadeInSeconds, 0, 1) : 1;
    const fadeOutStart2 = Math.max(0, clipDurationSeconds - fadeOutSeconds);
    const fadeOut = fadeOutSeconds > 0 && localSeconds > fadeOutStart2 ? clamp2((clipDurationSeconds - localSeconds) / fadeOutSeconds, 0, 1) : 1;
    return Math.min(fadeIn, fadeOut);
  };
  const startFactor = factorAt(localStartSeconds);
  const endFactor = factorAt(localEndSeconds);
  const safeStart = Math.max(1e-4, clipGain * startFactor);
  const safeEnd = Math.max(1e-4, clipGain * endFactor);
  const param = gain.gain;
  param.setValueAtTime(safeStart, startTime);
  if (fadeInSeconds > 0 && localStartSeconds < fadeInSeconds) {
    param.linearRampToValueAtTime(clipGain, startTime + Math.min(durationSeconds, fadeInSeconds - localStartSeconds));
  }
  const fadeOutStart = Math.max(0, clipDurationSeconds - fadeOutSeconds);
  if (fadeOutSeconds > 0 && localEndSeconds > fadeOutStart) {
    if (localStartSeconds < fadeOutStart) {
      param.setValueAtTime(clipGain, startTime + Math.max(0, fadeOutStart - localStartSeconds));
    }
    param.linearRampToValueAtTime(safeEnd, endTime);
  }
}
var LongAudioClipRuntime = class _LongAudioClipRuntime {
  options;
  readerValue;
  scheduler;
  activeSources;
  scheduledKeys;
  timelineStartSeconds;
  clipDurationSeconds;
  sourceOffsetFrame;
  sourceAvailableFrames;
  fadeInSeconds;
  fadeOutSeconds;
  clipGain;
  playbackRate;
  generation;
  scheduleDelaySeconds;
  loopValue;
  rangeStopTimer;
  disposed;
  constructor(options, reader) {
    this.options = options;
    this.activeSources = /* @__PURE__ */ new Set();
    this.scheduledKeys = /* @__PURE__ */ new Set();
    this.generation = 0;
    this.scheduleDelaySeconds = 0;
    this.disposed = false;
    this.readerValue = reader;
    const { clip, revision } = options;
    this.timelineStartSeconds = ticksToSeconds(clip.timeline.startTick, options.tempoMilliBpm, options.ticksPerQuarter);
    const requestedDuration = ticksToSeconds(clip.timeline.durationTick, options.tempoMilliBpm, options.ticksPerQuarter);
    this.sourceOffsetFrame = clamp2(Math.floor(finiteNonNegative2(clip.sourceOffsetUs) * revision.source.metadata.sampleRateHz / 1e6), 0, Math.max(0, revision.source.metadata.sampleFrames - 1));
    this.sourceAvailableFrames = Math.max(1, revision.source.metadata.sampleFrames - this.sourceOffsetFrame);
    const sourceDuration = this.sourceAvailableFrames / revision.source.metadata.sampleRateHz;
    this.playbackRate = clamp2(Number.isFinite(clip.playbackRate ?? 1) ? clip.playbackRate ?? 1 : 1, 0.25, 4);
    this.clipDurationSeconds = clip.loop ? requestedDuration : Math.min(requestedDuration, sourceDuration / this.playbackRate);
    this.fadeInSeconds = Math.min(this.clipDurationSeconds, ticksToSeconds(clip.fadeInTick, options.tempoMilliBpm, options.ticksPerQuarter));
    this.fadeOutSeconds = Math.min(this.clipDurationSeconds, ticksToSeconds(clip.fadeOutTick, options.tempoMilliBpm, options.ticksPerQuarter));
    this.clipGain = mixerGainToLinear(clip.gainMilliDb);
    this.loopValue = clip.loop;
    const events = this.buildEvents();
    this.scheduler = new SampleAccurateScheduler({
      clock: {
        now: () => options.context.currentTime
      },
      timer: options.timer ?? {
        setInterval: (callback, delayMs) => options.windowRef.setInterval(callback, delayMs),
        clearInterval: (handle) => options.windowRef.clearInterval(handle)
      },
      lookaheadSeconds: 0.12,
      intervalMs: 25,
      onSchedule: (event, audioTimeSeconds) => {
        void this.scheduleChunk(event, audioTimeSeconds);
      }
    });
    this.scheduler.load(events, this.clipDurationSeconds);
  }
  static async create(options) {
    if (options.clip.revisionId !== options.revision.revisionId) {
      return audioFail("AUDIO_REVISION_NOT_FOUND", "Clip and Audio Revision bindings do not match.", "clip.revisionId");
    }
    if (options.clip.trackId.trim().length === 0) {
      return audioFail("AUDIO_INVALID_CLIP", "Clip Track binding is empty.", "clip.trackId");
    }
    const reader = await createAudioPcmChunkReader(options.store, options.revision, {
      ...options.chunkSeconds === void 0 ? {} : {
        chunkSeconds: options.chunkSeconds
      },
      ...options.readAheadChunks === void 0 ? {} : {
        readAheadChunks: options.readAheadChunks
      },
      ...options.maxCachedChunks === void 0 ? {} : {
        maxCachedChunks: options.maxCachedChunks
      },
      ...options.shortAudioMaxBytes === void 0 ? {} : {
        shortAudioMaxBytes: options.shortAudioMaxBytes
      },
      ...options.shortAudioMaxSeconds === void 0 ? {} : {
        shortAudioMaxSeconds: options.shortAudioMaxSeconds
      }
    });
    if (!reader.ok) return reader;
    const runtime = new _LongAudioClipRuntime(options, reader.value);
    if (runtime.clipDurationSeconds <= 0) {
      runtime.dispose();
      return audioFail("AUDIO_INVALID_CLIP", "Clip timeline duration is empty or outside the source range.", "clip.timeline.durationTick");
    }
    return audioOk(runtime);
  }
  get reader() {
    return this.readerValue;
  }
  get isPlaying() {
    return this.scheduler.isPlaying;
  }
  get loop() {
    return this.loopValue;
  }
  get positionSeconds() {
    return this.timelineStartSeconds + this.scheduler.position;
  }
  get durationSeconds() {
    return this.clipDurationSeconds;
  }
  setLoop(enabled) {
    this.loopValue = enabled;
    this.scheduler.setLoop(enabled);
  }
  async prepare(globalPositionSeconds = this.timelineStartSeconds) {
    if (this.disposed) {
      return audioFail("AUDIO_HOST_BOUNDARY_INVALID", "Audio runtime is disposed.", "runtime");
    }
    const local = this.localPosition(globalPositionSeconds);
    if (local === null) return audioOk(true);
    const frame = this.sourceFrameForLocal(local);
    await this.readerValue.prefetchAround(Math.floor(frame / this.readerValue.plan.chunkFrames));
    return audioOk(true);
  }
  async play(globalPositionSeconds = this.timelineStartSeconds, loop = this.loopValue) {
    if (this.disposed) {
      return audioFail("AUDIO_HOST_BOUNDARY_INVALID", "Audio runtime is disposed.", "runtime");
    }
    const contextState = this.options.context.state;
    if (contextState !== void 0 && String(contextState) !== "running") {
      return audioFail("AUDIO_HOST_BOUNDARY_INVALID", "AudioContext is not running; no silent Clip scheduler was started.", "context.state", true);
    }
    const local = this.localPosition(globalPositionSeconds);
    if (local === null) {
      return audioFail("AUDIO_INVALID_NUMBER", "Playback position is outside the Clip timeline.", "positionSeconds");
    }
    this.stopRuntimeResources(false);
    this.loopValue = loop;
    this.scheduler.setLoop(loop);
    this.generation += 1;
    const playGeneration = this.generation;
    const frame = this.sourceFrameForLocal(local);
    await this.readerValue.prefetchAround(Math.floor(frame / this.readerValue.plan.chunkFrames));
    if (playGeneration !== this.generation || this.disposed) {
      return audioFail("AUDIO_HOST_BOUNDARY_INVALID", "Playback request was superseded before its read-ahead completed.", "runtime", true);
    }
    this.scheduleDelaySeconds = Math.max(0, this.timelineStartSeconds - finiteNonNegative2(globalPositionSeconds));
    if (!this.scheduler.start(local, loop)) {
      return audioFail("AUDIO_INVALID_CLIP", "Clip has no schedulable timeline events.", "clip.timeline");
    }
    return audioOk(true);
  }
  /** Play only a bounded range without changing the canonical Clip state. */
  async playForDuration(globalPositionSeconds, durationSeconds, loop = false) {
    const result = await this.play(globalPositionSeconds, loop);
    if (!result.ok) return result;
    const duration = finiteNonNegative2(durationSeconds);
    if (duration === 0) {
      this.stop();
      return result;
    }
    this.rangeStopTimer = this.options.windowRef.setTimeout(() => {
      this.rangeStopTimer = void 0;
      this.stop();
    }, duration * 1e3);
    return result;
  }
  pause() {
    const position = this.scheduler.pause();
    this.generation += 1;
    this.stopActiveSources();
    this.scheduledKeys.clear();
    return this.timelineStartSeconds + position;
  }
  async seek(globalPositionSeconds) {
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
      if (!started.ok) return started;
    }
    return audioOk(this.timelineStartSeconds + local);
  }
  stop() {
    this.stopRuntimeResources(true);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopRuntimeResources(true);
  }
  snapshot() {
    return {
      isPlaying: this.scheduler.isPlaying,
      positionSeconds: this.positionSeconds,
      timelineStartSeconds: this.timelineStartSeconds,
      durationSeconds: this.clipDurationSeconds,
      playbackRate: this.playbackRate,
      activeSourceCount: this.activeSources.size,
      scheduledSourceCount: this.scheduledKeys.size,
      reader: this.readerValue.snapshot()
    };
  }
  buildEvents() {
    const sampleRate = this.readerValue.plan.sampleRateHz;
    const chunkFrames = this.readerValue.plan.chunkFrames;
    const totalOutputFrames = Math.max(1, Math.ceil(this.clipDurationSeconds * sampleRate));
    const firstChunkOffset = this.sourceOffsetFrame % chunkFrames;
    const firstSegmentFrames = Math.min(chunkFrames - firstChunkOffset, this.sourceAvailableFrames);
    const segmentCount = firstSegmentFrames >= this.sourceAvailableFrames ? 1 : 1 + Math.ceil((this.sourceAvailableFrames - firstSegmentFrames) / chunkFrames);
    const sourceRelativeAt = (segment) => segment === 0 ? 0 : firstSegmentFrames + (segment - 1) * chunkFrames;
    const segmentFramesAt = (segment) => Math.min(segment === 0 ? firstSegmentFrames : chunkFrames, this.sourceAvailableFrames - sourceRelativeAt(segment));
    const outputFramesFor = (sourceFrames) => Math.max(1, Math.ceil(sourceFrames / this.playbackRate));
    const firstOutputFrames = outputFramesFor(firstSegmentFrames);
    const fullOutputFrames = outputFramesFor(chunkFrames);
    const lastOutputFrames = outputFramesFor(segmentFramesAt(segmentCount - 1));
    const cycleOutputFrames = segmentCount === 1 ? firstOutputFrames : firstOutputFrames + Math.max(0, segmentCount - 2) * fullOutputFrames + lastOutputFrames;
    const segmentsForOutputFrames = (outputFrames) => {
      if (outputFrames <= firstOutputFrames) return 1;
      return Math.min(segmentCount, 1 + Math.ceil((outputFrames - firstOutputFrames) / fullOutputFrames));
    };
    const eventCount = this.loopValue ? Math.floor(totalOutputFrames / cycleOutputFrames) * segmentCount + (totalOutputFrames % cycleOutputFrames === 0 ? 0 : segmentsForOutputFrames(totalOutputFrames % cycleOutputFrames)) : segmentsForOutputFrames(totalOutputFrames);
    if (!Number.isSafeInteger(eventCount) || eventCount < 1) {
      throw new RangeError("Long audio event sequence exceeds the safe timeline range.");
    }
    const outputFrameAt = (segment) => segment === 0 ? 0 : firstOutputFrames + (segment - 1) * fullOutputFrames;
    const eventAt = (index) => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= eventCount) {
        return void 0;
      }
      const cycle = this.loopValue ? Math.floor(index / segmentCount) : 0;
      const segment = this.loopValue ? index % segmentCount : index;
      const outputFrame = (this.loopValue ? cycle * cycleOutputFrames : 0) + outputFrameAt(segment);
      const sourceRelative = sourceRelativeAt(segment);
      const sourceFrame = this.sourceOffsetFrame + sourceRelative;
      const frameCount = Math.max(1, Math.min(segmentFramesAt(segment), Math.ceil((totalOutputFrames - outputFrame) * this.playbackRate), this.sourceAvailableFrames - sourceRelative));
      return {
        id: `clip:${String(this.options.clip.clipId)}:${index}`,
        startSeconds: outputFrame / sampleRate,
        durationSeconds: frameCount / sampleRate / this.playbackRate,
        payload: {
          chunkIndex: Math.floor(sourceFrame / chunkFrames),
          chunkOffsetFrames: sourceFrame % chunkFrames,
          frameCount,
          sourceStartFrame: sourceFrame
        }
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
          if (event === void 0 || event.startSeconds >= startSeconds) {
            high = middle;
          } else {
            low = middle + 1;
          }
        }
        return low < eventCount ? low : -1;
      }
    };
  }
  localPosition(globalPositionSeconds) {
    const global = finiteNonNegative2(globalPositionSeconds);
    if (global < this.timelineStartSeconds) return 0;
    const local = global - this.timelineStartSeconds;
    if (local > this.clipDurationSeconds + 1e-7) return null;
    return clamp2(local, 0, this.clipDurationSeconds);
  }
  sourceFrameForLocal(localSeconds) {
    const frame = Math.floor(localSeconds * this.readerValue.plan.sampleRateHz * this.playbackRate);
    const relative = this.options.clip.loop ? frame % this.sourceAvailableFrames : frame;
    return this.sourceOffsetFrame + relative;
  }
  async scheduleChunk(event, audioTimeSeconds) {
    const key = `${this.generation}:${event.id}:${audioTimeSeconds.toFixed(6)}`;
    const contextState = this.options.context.state;
    if (this.scheduledKeys.has(key) || this.disposed || contextState !== void 0 && String(contextState) !== "running") return;
    this.scheduledKeys.add(key);
    const generation = this.generation;
    const chunkResult = await this.readerValue.readChunk(event.payload.chunkIndex);
    if (!chunkResult.ok || chunkResult.value === null || generation !== this.generation || this.disposed) {
      this.scheduledKeys.delete(key);
      return;
    }
    const chunk = chunkResult.value;
    void this.readerValue.prefetchAround(event.payload.chunkIndex + 1);
    const context = this.options.context;
    const offsetFrames = clamp2(event.payload.chunkOffsetFrames, 0, Math.max(0, chunk.frameCount - 1));
    const actualFrames = Math.min(event.payload.frameCount, Math.max(1, chunk.frameCount - offsetFrames));
    const sourceDurationSeconds = actualFrames / chunk.sampleRateHz;
    const durationSeconds = sourceDurationSeconds / this.playbackRate;
    const start = Math.max(context.currentTime + 5e-3, audioTimeSeconds + this.scheduleDelaySeconds);
    const gain = context.createGain();
    const clipAutomation = (this.options.automations ?? []).find((automation) => automation.target.kind === "CLIP_GAIN" && automation.target.targetId === String(this.options.clip.clipId));
    const compiledAutomation = clipAutomation === void 0 ? void 0 : compileAudioAutomation(clipAutomation);
    const automationGain = compiledAutomation?.ok === true ? context.createGain() : void 0;
    if (automationGain !== void 0) automationGain.gain.value = 1;
    const buffer = makeAudioBuffer(context, chunk);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;
    const localStart = event.startSeconds;
    const localEnd = Math.min(this.clipDurationSeconds, localStart + durationSeconds);
    scheduleGainEnvelope(gain, start, durationSeconds, localStart, localEnd, this.clipDurationSeconds, this.clipGain, this.fadeInSeconds, this.fadeOutSeconds);
    if (automationGain !== void 0 && compiledAutomation?.ok === true) {
      const ticksPerSecond = audioTicksPerSecond({
        framesPerSecond: 1,
        tempoMilliBpm: this.options.tempoMilliBpm,
        ticksPerQuarter: this.options.ticksPerQuarter
      });
      const fromTick = this.options.clip.timeline.startTick + Math.round(localStart * ticksPerSecond);
      const untilTick = this.options.clip.timeline.startTick + Math.round(localEnd * ticksPerSecond);
      scheduleAudioAutomation(automationGain.gain, compiledAutomation.value, {
        nowSeconds: context.currentTime,
        startAtSeconds: start,
        tempoMilliBpm: this.options.tempoMilliBpm,
        ticksPerQuarter: this.options.ticksPerQuarter,
        fromTick,
        untilTick
      }, generation);
    }
    source.connect(gain);
    const trackInput = this.options.mixer.getTrackInput(String(this.options.clip.trackId));
    if (automationGain !== void 0) {
      gain.connect(automationGain);
      automationGain.connect(trackInput);
    } else {
      gain.connect(trackInput);
    }
    const active = automationGain === void 0 ? {
      source,
      gain,
      key
    } : {
      source,
      gain,
      automationGain,
      key
    };
    this.activeSources.add(active);
    source.addEventListener("ended", () => {
      this.activeSources.delete(active);
      this.scheduledKeys.delete(key);
      try {
        source.disconnect();
        gain.disconnect();
        automationGain?.disconnect();
      } catch {
      }
    }, {
      once: true
    });
    try {
      source.start(start, offsetFrames / chunk.sampleRateHz, sourceDurationSeconds);
      source.stop(start + durationSeconds + 0.01);
    } catch {
      this.activeSources.delete(active);
      this.scheduledKeys.delete(key);
      try {
        source.disconnect();
        gain.disconnect();
        automationGain?.disconnect();
      } catch {
      }
    }
  }
  stopRuntimeResources(clearReader) {
    if (this.rangeStopTimer !== void 0) {
      this.options.windowRef.clearTimeout(this.rangeStopTimer);
      this.rangeStopTimer = void 0;
    }
    this.scheduler.stop();
    this.generation += 1;
    this.scheduledKeys.clear();
    this.stopActiveSources();
    if (clearReader) this.readerValue.clear();
    this.scheduleDelaySeconds = 0;
  }
  stopActiveSources() {
    for (const active of this.activeSources) {
      try {
        active.source.stop();
      } catch {
      }
      try {
        active.source.disconnect();
        active.gain.disconnect();
        active.automationGain?.disconnect();
      } catch {
      }
    }
    this.activeSources.clear();
  }
};
export {
  LongAudioClipRuntime
};
