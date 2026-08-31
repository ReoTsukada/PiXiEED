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
var AUDIO200_SCHEMA_VERSION = "AUDIO-200_V1";
var AUDIO200_METADATA_AUTHORITY = "AUDIO-200_CANONICAL_METADATA_V1";
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
var SHA256 = /^[a-f0-9]{64}$/;
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
function asAudioTrackId(value) {
  return brandId(value, "AudioTrackId");
}
function asSourceBlobId(value) {
  return brandId(value, "SourceBlobId");
}
function asAudioContentHash(value) {
  if (!SHA256.test(value)) {
    throw new Error("AudioContentHash must be a lowercase SHA-256 hash.");
  }
  return value;
}
function sourcePathIsSafe(relativePath) {
  if (!relativePath || relativePath.length > 512 || relativePath.includes("\\") || relativePath.includes("\0")) return false;
  if (relativePath.startsWith("/") || relativePath.startsWith("~") || relativePath.includes("://")) return false;
  const segments = relativePath.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

// src/audio/audio-250/recording-storage.ts
var MAX_WRITE_BYTES = 4 * 1024 * 1024;
var COPY_CHUNK_BYTES = 1024 * 1024;
var WAV_HEADER_BYTES = 44;
function fail(message, path, recoverable = false) {
  return audioFail(recoverable ? "AUDIO_SOURCE_UNAVAILABLE" : "AUDIO_INVALID_SOURCE", message, path, recoverable);
}
function validPath(path) {
  return sourcePathIsSafe(path) && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function validBegin(input) {
  return validPath(input.tempPath) && validPath(input.finalPath) && input.tempPath !== input.finalPath && Number.isSafeInteger(input.sampleRateHz) && input.sampleRateHz >= 8e3 && input.sampleRateHz <= 192e3 && (input.channels === 1 || input.channels === 2) && input.bitDepth === 16;
}
function wavHeader(sampleRateHz, channels, sampleFrames) {
  const dataBytes = sampleFrames * channels * 2;
  const bytes = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(bytes.buffer);
  const write = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}
var Sha256Accumulator = class _Sha256Accumulator {
  static K = new Uint32Array([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  state = new Uint32Array([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  buffer = new Uint8Array(64);
  bufferLength = 0;
  totalBytes = 0;
  finalized = false;
  update(input) {
    if (this.finalized) throw new Error("SHA-256 accumulator is finalized.");
    this.totalBytes += input.byteLength;
    let offset = 0;
    if (this.bufferLength > 0) {
      const copied = Math.min(64 - this.bufferLength, input.byteLength);
      this.buffer.set(input.subarray(0, copied), this.bufferLength);
      this.bufferLength += copied;
      offset += copied;
      if (this.bufferLength === 64) {
        this.process(this.buffer);
        this.bufferLength = 0;
      }
    }
    while (offset + 64 <= input.byteLength) {
      this.process(input.subarray(offset, offset + 64));
      offset += 64;
    }
    if (offset < input.byteLength) {
      this.buffer.set(input.subarray(offset), 0);
      this.bufferLength = input.byteLength - offset;
    }
  }
  digestHex() {
    if (this.finalized) throw new Error("SHA-256 accumulator is finalized.");
    const bitLength = this.totalBytes * 8;
    const paddingLength = this.bufferLength < 56 ? 56 - this.bufferLength : 120 - this.bufferLength;
    const padding = new Uint8Array(paddingLength + 8);
    padding[0] = 128;
    const lengthView = new DataView(padding.buffer);
    lengthView.setUint32(padding.length - 4, bitLength >>> 0, false);
    lengthView.setUint32(padding.length - 8, Math.floor(bitLength / 4294967296), false);
    this.update(padding);
    this.finalized = true;
    return Array.from(this.state).map((value) => value.toString(16).padStart(8, "0")).join("");
  }
  process(block) {
    const words = new Uint32Array(64);
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const value = words[index - 15];
      const s0 = (value >>> 7 | value << 25) ^ (value >>> 18 | value << 14) ^ value >>> 3;
      const previous = words[index - 2];
      const s1 = (previous >>> 17 | previous << 15) ^ (previous >>> 19 | previous << 13) ^ previous >>> 10;
      words[index] = words[index - 16] + s0 + words[index - 7] + s1 >>> 0;
    }
    let a = this.state[0];
    let b = this.state[1];
    let c = this.state[2];
    let d = this.state[3];
    let e = this.state[4];
    let f = this.state[5];
    let g = this.state[6];
    let h = this.state[7];
    for (let index = 0; index < 64; index += 1) {
      const s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const choose = e & f ^ ~e & g;
      const temp1 = h + s1 + choose + _Sha256Accumulator.K[index] + words[index] >>> 0;
      const s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const majority = a & b ^ a & c ^ b & c;
      const temp2 = s0 + majority >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + temp1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2 >>> 0;
    }
    this.state[0] = this.state[0] + a >>> 0;
    this.state[1] = this.state[1] + b >>> 0;
    this.state[2] = this.state[2] + c >>> 0;
    this.state[3] = this.state[3] + d >>> 0;
    this.state[4] = this.state[4] + e >>> 0;
    this.state[5] = this.state[5] + f >>> 0;
    this.state[6] = this.state[6] + g >>> 0;
    this.state[7] = this.state[7] + h >>> 0;
  }
};
function navigatorStorage() {
  return globalThis.navigator?.storage;
}
async function openOpfsFile(path, create) {
  if (!validPath(path)) throw new Error("Recording OPFS path is invalid.");
  const storage = navigatorStorage();
  if (storage === void 0) throw new Error("OPFS is unavailable.");
  let directory = await storage.getDirectory();
  const segments = path.split("/");
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, {
      create
    });
  }
  return directory.getFileHandle(segments[segments.length - 1], {
    create
  });
}
async function removeOpfsFile(path) {
  if (!validPath(path)) return;
  const storage = navigatorStorage();
  if (storage === void 0) return;
  let directory = await storage.getDirectory();
  const segments = path.split("/");
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, {
      create: false
    });
  }
  await directory.removeEntry(segments[segments.length - 1]);
}
function createOpfsSinkSession(input, tempWriter) {
  const frameBytes = input.channels * 2;
  let dataBytes = 0;
  let closed = false;
  const closeTemp = async () => {
    if (closed) return;
    closed = true;
    await tempWriter.close();
  };
  return {
    async writePcm16(bytes) {
      if (closed) return fail("Recording sink is already closed.", "recording");
      if (bytes.byteLength < 1 || bytes.byteLength > MAX_WRITE_BYTES || bytes.byteLength % frameBytes !== 0) {
        return fail("PCM chunk is outside the bounded frame boundary.", "recording.chunk");
      }
      try {
        await tempWriter.write(bytes);
        dataBytes += bytes.byteLength;
        return audioOk(true);
      } catch {
        return fail("OPFS recording write failed.", "storage.opfs", true);
      }
    },
    async finalize(sampleFrames) {
      if (!Number.isSafeInteger(sampleFrames) || sampleFrames < 1) {
        return fail("Recording contains no complete PCM frames.", "recording.sampleFrames");
      }
      if (dataBytes !== sampleFrames * frameBytes) {
        return fail("Recorded PCM frame count does not match the byte sink.", "recording.sampleFrames");
      }
      try {
        await closeTemp();
        const temp = await openOpfsFile(input.tempPath, false);
        const file = await temp.getFile();
        if (file.size !== dataBytes) {
          throw new Error("OPFS temp byte count changed during finalization.");
        }
        const finalHandle = await openOpfsFile(input.finalPath, true);
        const finalWriter = await finalHandle.createWritable();
        const header = wavHeader(input.sampleRateHz, input.channels, sampleFrames);
        const hash = new Sha256Accumulator();
        hash.update(header);
        await finalWriter.write(header);
        for (let offset = 0; offset < file.size; offset += COPY_CHUNK_BYTES) {
          const length = Math.min(COPY_CHUNK_BYTES, file.size - offset);
          const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
          if (bytes.byteLength !== length) {
            throw new Error("OPFS temp read was truncated.");
          }
          hash.update(bytes);
          await finalWriter.write(bytes);
        }
        await finalWriter.close();
        await removeOpfsFile(input.tempPath);
        const contentHash = asAudioContentHash(hash.digestHex());
        return audioOk({
          relativePath: input.finalPath,
          codec: "WAV_PCM",
          mimeType: "audio/wav",
          sampleRateHz: input.sampleRateHz,
          channels: input.channels,
          bitDepth: input.bitDepth,
          sampleFrames,
          durationUs: Math.round(sampleFrames * 1e6 / input.sampleRateHz),
          byteLength: WAV_HEADER_BYTES + dataBytes,
          contentHash
        });
      } catch {
        await removeOpfsFile(input.tempPath).catch(() => void 0);
        await removeOpfsFile(input.finalPath).catch(() => void 0);
        return fail("OPFS recording finalization failed.", "storage.opfs", true);
      }
    },
    async cancel() {
      try {
        await closeTemp();
        await removeOpfsFile(input.tempPath).catch(() => void 0);
        await removeOpfsFile(input.finalPath).catch(() => void 0);
        return audioOk(true);
      } catch {
        return fail("OPFS recording cancellation failed.", "storage.opfs", true);
      }
    }
  };
}
function createOpfsAudioRecordingStorage() {
  return {
    async begin(input) {
      if (!validBegin(input)) {
        return fail("Recording storage parameters are invalid.", "recording.storage");
      }
      try {
        const temp = await openOpfsFile(input.tempPath, true);
        const writer = await temp.createWritable();
        return audioOk(createOpfsSinkSession(input, writer));
      } catch {
        return fail("OPFS recording could not be opened.", "storage.opfs", true);
      }
    },
    async remove(relativePath) {
      try {
        await removeOpfsFile(relativePath);
        return audioOk(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return audioOk(true);
        }
        return fail("OPFS recording cleanup failed.", "storage.opfs", true);
      }
    }
  };
}
function createMemoryAudioRecordingStorage() {
  const files = /* @__PURE__ */ new Map();
  return {
    get(relativePath) {
      const bytes = files.get(relativePath);
      return bytes === void 0 ? void 0 : new Uint8Array(bytes);
    },
    async begin(input) {
      if (!validBegin(input)) {
        return fail("Recording storage path is invalid.", "recording.storage");
      }
      const chunks = [];
      let dataBytes = 0;
      let cancelled = false;
      return audioOk({
        async writePcm16(bytes) {
          const frameBytes = input.channels * 2;
          if (cancelled || bytes.byteLength < 1 || bytes.byteLength > MAX_WRITE_BYTES || bytes.byteLength % frameBytes !== 0) {
            return fail("PCM chunk is outside the bounded frame boundary.", "recording.chunk");
          }
          chunks.push(new Uint8Array(bytes));
          dataBytes += bytes.byteLength;
          return audioOk(true);
        },
        async finalize(sampleFrames) {
          const frameBytes = input.channels * 2;
          if (cancelled || dataBytes !== sampleFrames * frameBytes || sampleFrames < 1) {
            return fail("Recorded PCM frame count is invalid.", "recording.sampleFrames");
          }
          const header = wavHeader(input.sampleRateHz, input.channels, sampleFrames);
          const all = new Uint8Array(header.byteLength + dataBytes);
          all.set(header, 0);
          let offset = header.byteLength;
          const hash = new Sha256Accumulator();
          hash.update(header);
          for (const chunk of chunks) {
            all.set(chunk, offset);
            hash.update(chunk);
            offset += chunk.byteLength;
          }
          files.set(input.finalPath, all);
          chunks.length = 0;
          return audioOk({
            relativePath: input.finalPath,
            codec: "WAV_PCM",
            mimeType: "audio/wav",
            sampleRateHz: input.sampleRateHz,
            channels: input.channels,
            bitDepth: input.bitDepth,
            sampleFrames,
            durationUs: Math.round(sampleFrames * 1e6 / input.sampleRateHz),
            byteLength: all.byteLength,
            contentHash: asAudioContentHash(hash.digestHex())
          });
        },
        async cancel() {
          cancelled = true;
          chunks.length = 0;
          files.delete(input.finalPath);
          return audioOk(true);
        }
      });
    },
    async remove(relativePath) {
      files.delete(relativePath);
      return audioOk(true);
    }
  };
}

// src/audio/audio-250/recording.ts
var MAX_RECORDING_BYTES = 64 * 1024 * 1024;
var MIN_SAMPLE_RATE = 8e3;
var MAX_SAMPLE_RATE = 192e3;
var MAX_PENDING_WRITE_CHUNKS = 32;
var MAX_PENDING_WRITE_BYTES = 2 * 1024 * 1024;
function fail2(code, message, path, recoverable = false) {
  return audioFail(code, message, path, recoverable);
}
function finiteNonNegative(value, fallback = 0) {
  return value !== void 0 && Number.isFinite(value) && value >= 0 ? value : fallback;
}
function boundedCountIn(value) {
  return Math.min(16, finiteNonNegative(value, 0));
}
function boundedDuration(value, sampleRateHz, channels) {
  const sourceMax = (MAX_RECORDING_BYTES - 44) / (sampleRateHz * channels * 2);
  const requested = value === void 0 ? sourceMax : finiteNonNegative(value, 0);
  return Math.min(sourceMax, Math.max(1e-3, requested));
}
function encodePcm16(samples, startFrame, frameCount, channels) {
  const bytes = new Uint8Array(frameCount * channels * 2);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(-1, Math.min(1, samples[channel][startFrame + frame] ?? 0));
      const integer = value <= -1 ? -32768 : Math.round(value * 32767);
      view.setInt16(offset, integer, true);
      offset += 2;
    }
  }
  return bytes;
}
var AudioRecordingSession = class _AudioRecordingSession {
  options;
  stateValue;
  writer;
  writeQueue;
  pendingWriteChunks;
  pendingWriteBytes;
  sampleFramesValue;
  targetAudioTime;
  timelineStart;
  inputLatencyValue;
  recordingOffsetValue;
  startAudioTime;
  stoppedTake;
  constructor(options) {
    this.options = options;
    this.stateValue = "IDLE";
    this.writeQueue = Promise.resolve(audioOk(true));
    this.pendingWriteChunks = 0;
    this.pendingWriteBytes = 0;
    this.sampleFramesValue = 0;
    this.targetAudioTime = null;
    this.timelineStart = null;
    this.inputLatencyValue = 0;
    this.recordingOffsetValue = 0;
    this.startAudioTime = 0;
  }
  static create(options) {
    if (!Number.isSafeInteger(options.sampleRateHz) || options.sampleRateHz < MIN_SAMPLE_RATE || options.sampleRateHz > MAX_SAMPLE_RATE || ![
      1,
      2
    ].includes(options.channels) || !Number.isFinite(options.tempoBpm) || options.tempoBpm < 20 || options.tempoBpm > 300 || typeof options.sourceName !== "string" || options.sourceName.trim().length === 0 || !Number.isSafeInteger(options.identity.revisionNumber) || options.identity.revisionNumber < 1) {
      return fail2("AUDIO_INVALID_NUMBER", "Recording sample rate, channel count, tempo, or source name is invalid.", "recording.options");
    }
    try {
      asAudioAssetId(options.identity.assetId);
      asAudioRevisionId(options.identity.revisionId);
      asSourceBlobId(options.identity.blobId);
      asAudioTrackId(options.trackId);
    } catch {
      return fail2("AUDIO_INVALID_SOURCE", "Recording Asset, Revision, Blob, or Track identity is invalid.", "recording.identity");
    }
    return audioOk(new _AudioRecordingSession(options));
  }
  get state() {
    return this.stateValue;
  }
  get isActive() {
    return this.stateValue === "COUNT_IN" || this.stateValue === "RECORDING" || this.stateValue === "STOPPING";
  }
  arm() {
    if (this.stateValue !== "IDLE" && this.stateValue !== "CANCELLED") {
      return fail2("AUDIO_INVALID_SOURCE", "Recording session is already armed or committed.", "recording.state");
    }
    this.stateValue = "ARMED";
    return audioOk(true);
  }
  async start(input) {
    if (this.stateValue !== "ARMED") {
      return fail2("AUDIO_INVALID_SOURCE", "Recording must be armed before Start.", "recording.state");
    }
    if (!Number.isFinite(input.audioTimeSeconds) || !Number.isFinite(input.timelineStartSeconds)) {
      return fail2("AUDIO_INVALID_NUMBER", "Recording clock values are invalid.", "recording.start");
    }
    const countInBeats = boundedCountIn(input.countInBeats);
    const preRollSeconds = finiteNonNegative(input.preRollSeconds, 0);
    const countInSeconds = countInBeats * 60 / this.options.tempoBpm;
    this.startAudioTime = input.audioTimeSeconds;
    this.targetAudioTime = input.audioTimeSeconds + countInSeconds + preRollSeconds;
    this.inputLatencyValue = finiteNonNegative(input.inputLatencyUs, 0);
    this.recordingOffsetValue = Number.isFinite(input.recordingOffsetUs) ? input.recordingOffsetUs : 0;
    this.timelineStart = input.timelineStartSeconds - this.inputLatencyValue / 1e6 + this.recordingOffsetValue / 1e6;
    const begin = {
      tempPath: this.options.identity.tempPath,
      finalPath: this.options.identity.finalPath,
      sampleRateHz: this.options.sampleRateHz,
      channels: this.options.channels,
      bitDepth: 16
    };
    const opened = await this.options.storage.begin(begin);
    if (!opened.ok) {
      this.stateValue = "CANCELLED";
      return opened;
    }
    this.writer = opened.value;
    this.sampleFramesValue = 0;
    this.pendingWriteChunks = 0;
    this.pendingWriteBytes = 0;
    this.writeQueue = Promise.resolve(audioOk(true));
    this.stateValue = this.targetAudioTime > input.audioTimeSeconds ? "COUNT_IN" : "RECORDING";
    return audioOk(true);
  }
  tick(audioTimeSeconds) {
    if (this.stateValue === "COUNT_IN" && this.targetAudioTime !== null && audioTimeSeconds >= this.targetAudioTime) {
      this.stateValue = "RECORDING";
    }
  }
  async ingest(input) {
    if (this.stateValue !== "COUNT_IN" && this.stateValue !== "RECORDING") {
      return audioOk(true);
    }
    if (input.sampleRateHz !== this.options.sampleRateHz || input.channels !== this.options.channels || input.samples.length !== input.channels || input.samples.some((channel) => channel.length === 0) || !Number.isFinite(input.audioTimeSeconds)) {
      return fail2("AUDIO_INVALID_NUMBER", "Input PCM chunk does not match the armed recorder.", "recording.input");
    }
    const frameCount = input.samples[0].length;
    if (input.samples.some((channel) => channel.length !== frameCount)) {
      return fail2("AUDIO_INVALID_NUMBER", "Input PCM channels have different frame counts.", "recording.input.samples");
    }
    const chunkStart = input.audioTimeSeconds;
    const chunkEnd = chunkStart + frameCount / input.sampleRateHz;
    const target = this.targetAudioTime ?? chunkStart;
    if (chunkEnd <= target) return audioOk(true);
    const firstFrame = Math.max(0, Math.ceil((target - chunkStart) * input.sampleRateHz - 1e-7));
    const maxFrames = Math.max(1, Math.floor(boundedDuration(this.options.maxDurationSeconds, this.options.sampleRateHz, this.options.channels) * this.options.sampleRateHz));
    const remaining = maxFrames - this.sampleFramesValue;
    if (remaining <= 0) {
      this.stateValue = "STOPPING";
      return fail2("AUDIO_INVALID_NUMBER", "Recording duration limit was reached.", "recording.duration", true);
    }
    const count = Math.min(frameCount - firstFrame, remaining);
    if (count <= 0) return audioOk(true);
    const bytes = encodePcm16(input.samples, firstFrame, count, this.options.channels);
    if (this.pendingWriteChunks >= MAX_PENDING_WRITE_CHUNKS || this.pendingWriteBytes + bytes.byteLength > MAX_PENDING_WRITE_BYTES) {
      this.stateValue = "STOPPING";
      return fail2("AUDIO_SOURCE_UNAVAILABLE", "Recording storage could not keep up with the input stream.", "recording.backpressure", true);
    }
    const writer = this.writer;
    if (writer === void 0) {
      this.stateValue = "STOPPING";
      return fail2("AUDIO_SOURCE_UNAVAILABLE", "Recording storage writer is unavailable.", "recording.writer", true);
    }
    this.pendingWriteChunks += 1;
    this.pendingWriteBytes += bytes.byteLength;
    this.writeQueue = this.writeQueue.then(async (previous) => {
      try {
        if (!previous.ok) return previous;
        return await writer.writePcm16(bytes);
      } catch {
        return fail2("AUDIO_SOURCE_UNAVAILABLE", "Recording storage write failed.", "recording.writer", true);
      } finally {
        this.pendingWriteChunks -= 1;
        this.pendingWriteBytes -= bytes.byteLength;
      }
    });
    this.sampleFramesValue += count;
    if (this.sampleFramesValue >= maxFrames) this.stateValue = "STOPPING";
    return this.writeQueue;
  }
  async stop() {
    if (this.stateValue !== "COUNT_IN" && this.stateValue !== "RECORDING" && this.stateValue !== "STOPPING") {
      return fail2("AUDIO_EMPTY_RECORDING", "There is no active recording to stop.", "recording.state", true);
    }
    this.stateValue = "STOPPING";
    const writes = await this.writeQueue;
    const writer = this.writer;
    if (writer === void 0) {
      this.stateValue = "CANCELLED";
      return fail2("AUDIO_SOURCE_UNAVAILABLE", "Recording storage writer is unavailable.", "recording.writer", true);
    }
    if (!writes.ok) {
      await writer.cancel();
      this.stateValue = "CANCELLED";
      return writes;
    }
    if (this.sampleFramesValue < 1 || this.timelineStart === null) {
      await writer.cancel();
      this.stateValue = "CANCELLED";
      return fail2("AUDIO_EMPTY_RECORDING", "Recording did not contain any input frames.", "recording.sampleFrames", true);
    }
    const stored = await writer.finalize(this.sampleFramesValue);
    if (!stored.ok) {
      this.stateValue = "CANCELLED";
      return stored;
    }
    const revision = {
      schemaVersion: AUDIO200_SCHEMA_VERSION,
      assetId: asAudioAssetId(this.options.identity.assetId),
      revisionId: asAudioRevisionId(this.options.identity.revisionId),
      revisionNumber: this.options.identity.revisionNumber,
      kind: this.options.identity.kind ?? "CLIP",
      referenceMode: "LIVE",
      source: {
        blobId: asSourceBlobId(this.options.identity.blobId),
        locator: {
          placement: "OPFS",
          namespace: "audio",
          relativePath: stored.value.relativePath,
          contentHash: stored.value.contentHash,
          byteLength: stored.value.byteLength
        },
        metadata: {
          codec: stored.value.codec,
          mimeType: stored.value.mimeType,
          sampleRateHz: stored.value.sampleRateHz,
          channels: stored.value.channels,
          bitDepth: stored.value.bitDepth,
          sampleFrames: stored.value.sampleFrames,
          durationUs: stored.value.durationUs,
          byteLength: stored.value.byteLength,
          contentHash: stored.value.contentHash
        }
      },
      metadataAuthority: AUDIO200_METADATA_AUTHORITY,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      verified: true
    };
    const take = {
      revision,
      sourceName: this.options.sourceName.trim(),
      trackId: this.options.trackId,
      timelineStartSeconds: this.timelineStart,
      durationSeconds: this.sampleFramesValue / this.options.sampleRateHz,
      sampleFrames: this.sampleFramesValue,
      inputLatencyUs: this.inputLatencyValue,
      recordingOffsetUs: this.recordingOffsetValue
    };
    this.stoppedTake = take;
    this.stateValue = "COMMITTED";
    return audioOk(take);
  }
  async cancel() {
    if (this.stateValue === "CANCELLED" || this.stateValue === "IDLE") {
      return audioOk(true);
    }
    if (this.stateValue === "COMMITTED") {
      return fail2("AUDIO_INVALID_SOURCE", "A committed recording cannot be cancelled.", "recording.state");
    }
    await this.writeQueue;
    const cancelled = await this.writer?.cancel();
    this.stateValue = "CANCELLED";
    return cancelled ?? audioOk(true);
  }
  snapshot() {
    return {
      state: this.stateValue,
      sampleFrames: this.sampleFramesValue,
      durationSeconds: this.sampleFramesValue / this.options.sampleRateHz,
      timelineStartSeconds: this.timelineStart,
      targetAudioTimeSeconds: this.targetAudioTime,
      inputLatencyUs: this.inputLatencyValue,
      recordingOffsetUs: this.recordingOffsetValue
    };
  }
};

// src/audio/audio-250/browser-recording.ts
var PROCESSOR_BUFFER_FRAMES = 4096;
function fail3(message, path, recoverable = false) {
  return audioFail(recoverable ? "AUDIO_SOURCE_UNAVAILABLE" : "AUDIO_HOST_BOUNDARY_INVALID", message, path, recoverable);
}
var BrowserAudioRecordingRuntime = class _BrowserAudioRecordingRuntime {
  options;
  session;
  nodes;
  disposed;
  constructor(options, session, nodes) {
    this.options = options;
    this.disposed = false;
    this.session = session;
    this.nodes = nodes;
  }
  static async create(options) {
    const mediaDevices = options.windowRef.navigator?.mediaDevices;
    if (mediaDevices?.getUserMedia === void 0) {
      return fail3("This browser does not expose microphone input.", "navigator.mediaDevices", true);
    }
    const sampleRateHz = options.sampleRateHz ?? options.context.sampleRate;
    const channels = options.channels ?? 1;
    let stream;
    try {
      stream = await mediaDevices.getUserMedia({
        audio: options.inputConstraints ?? {
          channelCount: channels,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });
    } catch {
      return fail3("Microphone permission or input acquisition failed.", "navigator.mediaDevices.getUserMedia", true);
    }
    const sourceName = options.sourceName.trim();
    const sessionOptions = {
      storage: options.storage,
      identity: options.identity,
      sourceName,
      trackId: options.trackId,
      sampleRateHz,
      channels,
      tempoBpm: options.tempoBpm,
      ...options.maxDurationSeconds === void 0 ? {} : {
        maxDurationSeconds: options.maxDurationSeconds
      }
    };
    const created = AudioRecordingSession.create(sessionOptions);
    if (!created.ok) {
      for (const track of stream.getTracks()) track.stop();
      return created;
    }
    const armed = created.value.arm();
    if (!armed.ok) {
      for (const track of stream.getTracks()) track.stop();
      return armed;
    }
    let sourceNode;
    let processorNode;
    let monitorNode;
    let silentNode;
    try {
      sourceNode = options.context.createMediaStreamSource(stream);
      processorNode = options.context.createScriptProcessor(PROCESSOR_BUFFER_FRAMES, channels, channels);
      monitorNode = options.context.createGain();
      silentNode = options.context.createGain();
      monitorNode.gain.value = 0;
      silentNode.gain.value = 0;
      sourceNode.connect(processorNode);
      sourceNode.connect(monitorNode);
      monitorNode.connect(options.mixer.getTrackInput(options.trackId));
      processorNode.connect(silentNode);
      silentNode.connect(options.context.destination);
      const nodes = {
        stream,
        source: sourceNode,
        processor: processorNode,
        monitor: monitorNode,
        silent: silentNode
      };
      const runtime = new _BrowserAudioRecordingRuntime(options, created.value, nodes);
      processorNode.onaudioprocess = (event) => {
        if (runtime.disposed) return;
        const input = event.inputBuffer;
        const frameCount = input.length;
        const copied = Array.from({
          length: channels
        }, (_, channel) => new Float32Array(input.getChannelData(Math.min(channel, input.numberOfChannels - 1))));
        const chunk = {
          audioTimeSeconds: Math.max(0, options.context.currentTime - input.duration),
          sampleRateHz,
          channels,
          samples: copied
        };
        runtime.session.tick(options.context.currentTime);
        void runtime.session.ingest(chunk);
        void frameCount;
      };
      return audioOk(runtime);
    } catch {
      try {
        if (processorNode !== void 0) processorNode.onaudioprocess = null;
        sourceNode?.disconnect();
        processorNode?.disconnect();
        monitorNode?.disconnect();
        silentNode?.disconnect();
      } catch {
      }
      for (const track of stream.getTracks()) track.stop();
      return fail3("Audio input graph could not be created.", "audioContext.recordingGraph", true);
    }
  }
  get state() {
    return this.session.snapshot().state;
  }
  get isActive() {
    return this.session.isActive;
  }
  get estimatedInputLatencyUs() {
    return Math.round((this.options.context.baseLatency ?? 0) * 1e6);
  }
  setMonitoring(enabled) {
    const now = this.options.context.currentTime;
    try {
      this.nodes.monitor.gain.cancelScheduledValues(now);
      this.nodes.monitor.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.01);
    } catch {
      this.nodes.monitor.gain.value = enabled ? 1 : 0;
    }
  }
  async start(input) {
    if (this.disposed) {
      return fail3("Recording runtime is disposed.", "recording.runtime");
    }
    const result = await this.session.start(input);
    this.session.tick(this.options.context.currentTime);
    return result;
  }
  async stop() {
    if (this.disposed) {
      return fail3("Recording runtime is disposed.", "recording.runtime");
    }
    const result = await this.session.stop();
    this.disconnectGraph();
    return result;
  }
  async cancel() {
    if (this.disposed) return audioOk(true);
    const result = await this.session.cancel();
    this.disconnectGraph();
    return result;
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.session.isActive || this.session.state === "ARMED") {
      await this.session.cancel();
    }
    this.disconnectGraph();
  }
  snapshot() {
    return this.session.snapshot();
  }
  disconnectGraph() {
    try {
      this.nodes.processor.onaudioprocess = null;
      this.nodes.source.disconnect();
      this.nodes.processor.disconnect();
      this.nodes.monitor.disconnect();
      this.nodes.silent.disconnect();
    } catch {
    }
    for (const track of this.nodes.stream.getTracks()) track.stop();
  }
};
export {
  AUDIO200_SCHEMA_VERSION,
  AudioRecordingSession,
  BrowserAudioRecordingRuntime,
  MAX_RECORDING_BYTES,
  createMemoryAudioRecordingStorage,
  createOpfsAudioRecordingStorage
};
