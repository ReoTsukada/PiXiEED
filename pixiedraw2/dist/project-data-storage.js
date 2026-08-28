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
var SHA256 = /^[a-f0-9]{64}$/;
function brandId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value.trim())) {
    throw new Error(`${label} must be a stable non-empty identifier.`);
  }
  return value;
}
function asAudioProjectId(value) {
  return brandId(value, "AudioProjectId");
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

// src/audio/audio-200/persistence.ts
var AUDIO200_PERSISTENCE_DB_NAME = "pixiedraw2-audio-200";
var AUDIO200_PERSISTENCE_DB_VERSION = 1;
var AUDIO200_PERSISTENCE_STORE_NAME = "projects";

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
  const currentHash = currentStateHash(current);
  if (currentHash !== null && incoming.checkpoint.stateHash !== currentHash) return false;
  const currentSavedAt = candidate.savedAt;
  return typeof currentSavedAt !== "string" || incoming.savedAt >= currentSavedAt;
}
function currentProjectRevision(current) {
  if (current === null || typeof current !== "object") return void 0;
  const candidate = current;
  const checkpoint = candidate.checkpoint;
  if (checkpoint === null || typeof checkpoint !== "object") {
    return void 0;
  }
  const revision = checkpoint.projectRevision;
  return typeof revision === "number" ? revision : void 0;
}
function currentStateHash(current) {
  if (current === null || typeof current !== "object") return null;
  const checkpoint = current.checkpoint;
  if (checkpoint === null || typeof checkpoint !== "object") return null;
  const hash = checkpoint.stateHash;
  return typeof hash === "string" ? hash : null;
}
function matchesExpected(current, options) {
  if (options?.expectedProjectRevision !== void 0 && (currentProjectRevision(current) ?? 0) !== options.expectedProjectRevision) return false;
  if (options?.expectedStateHash !== void 0 && currentStateHash(current) !== options.expectedStateHash) return false;
  return true;
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
    async save(record, options2) {
      try {
        const database = await openDatabase(databaseName);
        return await new Promise((resolve) => {
          let stale = false;
          const transaction = database.transaction(AUDIO200_PERSISTENCE_STORE_NAME, "readwrite");
          const store = transaction.objectStore(AUDIO200_PERSISTENCE_STORE_NAME);
          const read = store.get(record.projectId);
          read.onsuccess = () => {
            if (!matchesExpected(read.result, options2)) {
              stale = true;
            } else if (isNewer(record, read.result)) {
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

// src/audio/audio-200/metadata-authority.ts
var AUDIO200_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
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

// src/audio/audio-200/audio-asset-store.ts
var AUDIO200_MAX_RANGE_BYTES = 4 * 1024 * 1024;

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

// src/draw2-core.ts
var NullInstrumentation = class {
  record(_point) {
  }
};
var NOOP_INSTRUMENTATION = new NullInstrumentation();

// src/game/game-350/visual-logic.ts
var GAME350_VISUAL_LOGIC_LIMITS = Object.freeze({
  maxNodes: 128,
  maxEdges: 256,
  maxScriptBytes: 32 * 1024,
  maxScriptLines: 256
});

// src/game/game-350/physics-2d.ts
var GAME350_PHYSICS_LAYER_BITS = Object.freeze({
  DEFAULT: 1 << 0,
  WORLD: 1 << 1,
  PLAYER: 1 << 2,
  NPC: 1 << 3,
  SENSOR: 1 << 4,
  PROJECTILE: 1 << 5
});
var DEFAULT_PHYSICS_2D_SETTINGS = Object.freeze({
  gravity: Object.freeze({
    x: 0,
    y: 9.8
  }),
  fixedDeltaTime: 1 / 60,
  maxSubSteps: 4,
  defaultMaterial: Object.freeze({
    friction: 0.4,
    bounciness: 0
  })
});

// src/workspace/game-persistence.ts
var GAME_EDITOR_PERSISTENCE_DB_NAME = "pixiedraw2-game-subdocuments";
var GAME_EDITOR_PERSISTENCE_DB_VERSION = 1;
var GAME_EDITOR_PERSISTENCE_STORE_NAME = "projects";
function isNewer2(incoming, current) {
  if (current === void 0) return true;
  if (incoming.revision !== current.revision) {
    return incoming.revision > current.revision;
  }
  return incoming.savedAt >= current.savedAt;
}
function matchesExpected2(current, options) {
  if (options?.expectedRevision !== void 0 && (current?.revision ?? 0) !== options.expectedRevision) return false;
  if (options?.expectedStateHash !== void 0 && (current?.stateHash ?? null) !== options.expectedStateHash) return false;
  return true;
}
function openGameDatabase(name) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(name, GAME_EDITOR_PERSISTENCE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GAME_EDITOR_PERSISTENCE_STORE_NAME)) {
        request.result.createObjectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME, {
          keyPath: "projectId"
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Game DB open failed."));
    request.onblocked = () => reject(new Error("Game DB open was blocked."));
  });
}
function createIndexedDbGameEditorPersistenceStore(databaseName = GAME_EDITOR_PERSISTENCE_DB_NAME) {
  const available = typeof indexedDB !== "undefined";
  return {
    available,
    async load(projectId) {
      if (!available) return null;
      try {
        const database = await openGameDatabase(databaseName);
        return await new Promise((resolve) => {
          const request = database.transaction(GAME_EDITOR_PERSISTENCE_STORE_NAME, "readonly").objectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME).get(projectId);
          request.onsuccess = () => {
            database.close();
            resolve(request.result ?? null);
          };
          request.onerror = () => {
            database.close();
            resolve(null);
          };
        });
      } catch {
        return null;
      }
    },
    async save(record, options) {
      if (!available) return {
        ok: false,
        stale: false
      };
      try {
        const database = await openGameDatabase(databaseName);
        return await new Promise((resolve) => {
          let stale = false;
          const transaction = database.transaction(GAME_EDITOR_PERSISTENCE_STORE_NAME, "readwrite");
          const store = transaction.objectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME);
          const read = store.get(record.projectId);
          read.onsuccess = () => {
            const current = read.result;
            if (!matchesExpected2(current, options)) stale = true;
            else if (isNewer2(record, current)) store.put(record);
            else stale = true;
          };
          read.onerror = () => transaction.abort();
          transaction.oncomplete = () => {
            database.close();
            resolve({
              ok: true,
              stale
            });
          };
          transaction.onerror = () => {
            database.close();
            resolve({
              ok: false,
              stale: false
            });
          };
          transaction.onabort = () => {
            database.close();
            resolve({
              ok: false,
              stale: false
            });
          };
        });
      } catch {
        return {
          ok: false,
          stale: false
        };
      }
    },
    async clear(projectId) {
      if (!available) return false;
      try {
        const database = await openGameDatabase(databaseName);
        return await new Promise((resolve) => {
          const transaction = database.transaction(GAME_EDITOR_PERSISTENCE_STORE_NAME, "readwrite");
          transaction.objectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME).delete(projectId);
          transaction.oncomplete = () => {
            database.close();
            resolve(true);
          };
          transaction.onerror = () => {
            database.close();
            resolve(false);
          };
          transaction.onabort = () => {
            database.close();
            resolve(false);
          };
        });
      } catch {
        return false;
      }
    }
  };
}

// src/pixync/indexeddb-persistence.ts
var PIXYNC_INDEXEDDB_PERSISTENCE_SCHEMA = "PIXYNC_DRAW2_INDEXEDDB_SNAPSHOT_V1";
var PIXYNC_INDEXEDDB_PERSISTENCE_STATUS = Object.freeze({
  schema: PIXYNC_INDEXEDDB_PERSISTENCE_SCHEMA,
  productionReady: false,
  crossTabConcurrency: "TRANSACTION_CAS",
  crossProcessConcurrency: "UNTESTED",
  atomicReplaceScope: "SINGLE_ADAPTER_INSTANCE_QUEUE",
  compareAndSwapScope: "INDEXEDDB_READWRITE_TRANSACTION"
});
var PixyncIndexedDbPersistenceError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "PixyncIndexedDbPersistenceError";
    this.code = code;
  }
};
var DB_VERSION = 1;
var STORE_NAME = "snapshots";
function clone(value) {
  if (typeof structuredClone !== "function") {
    throw new PixyncIndexedDbPersistenceError("INDEXEDDB_UNAVAILABLE", "structuredClone is required by the IndexedDB persistence boundary.");
  }
  return structuredClone(value);
}
function errorMessage(error, fallback) {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}
function asError(error, code, fallback) {
  if (error instanceof PixyncIndexedDbPersistenceError) return error;
  return new PixyncIndexedDbPersistenceError(code, errorMessage(error, fallback), {
    cause: error
  });
}
function resolveFactory(injected) {
  if (injected !== void 0) return injected;
  const candidate = globalThis.indexedDB;
  if (candidate === void 0) {
    throw new PixyncIndexedDbPersistenceError("INDEXEDDB_UNAVAILABLE", "IndexedDB is unavailable; inject an IDBFactory in this host.");
  }
  return candidate;
}
function openDatabase2(factory, dbName) {
  return new Promise((resolve, reject) => {
    let request;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(asError(error, "OPEN_FAILED", "IndexedDB open failed."));
    };
    try {
      request = factory.open(dbName, DB_VERSION);
      request.onerror = () => rejectOnce(request.error);
      request.onblocked = () => rejectOnce(new PixyncIndexedDbPersistenceError("OPEN_FAILED", "IndexedDB open was blocked by another connection."));
      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          const upgrade = request.transaction;
          if (upgrade !== null) {
            upgrade.onabort = () => rejectOnce(new PixyncIndexedDbPersistenceError("UPGRADE_FAILED", "IndexedDB schema upgrade was aborted."));
            upgrade.onerror = () => rejectOnce(asError(upgrade.error, "UPGRADE_FAILED", "IndexedDB schema upgrade failed."));
          }
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, {
              keyPath: "projectId"
            });
          }
        } catch (error) {
          try {
            request.transaction?.abort();
          } catch {
          }
          rejectOnce(asError(error, "UPGRADE_FAILED", "IndexedDB schema upgrade failed."));
        }
      };
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.close();
          rejectOnce(new PixyncIndexedDbPersistenceError("STORE_MISSING", "IndexedDB snapshot object store is missing."));
          return;
        }
        request.result.onversionchange = () => request.result.close();
        settled = true;
        resolve(request.result);
      };
    } catch (error) {
      rejectOnce(asError(error, "OPEN_FAILED", "IndexedDB open failed."));
    }
  });
}
function withDatabase(factory, dbName, operation) {
  return openDatabase2(factory, dbName).then(async (db) => {
    try {
      return await operation(db);
    } finally {
      db.close();
    }
  });
}
function transactionError(transaction, aborted) {
  return asError(transaction.error, aborted ? "TRANSACTION_ABORTED" : "TRANSACTION_FAILED", aborted ? "IndexedDB transaction was aborted." : "IndexedDB transaction failed.");
}
function readRecord(db, projectId) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(projectId);
      let record;
      let requestFinished = false;
      let settled = false;
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        reject(asError(error, "TRANSACTION_FAILED", "IndexedDB read failed."));
      };
      request.onerror = () => rejectOnce(request.error);
      request.onsuccess = () => {
        requestFinished = true;
        record = request.result;
      };
      transaction.onerror = () => rejectOnce(transactionError(transaction, false));
      transaction.onabort = () => rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        if (!requestFinished) {
          rejectOnce(new Error("IndexedDB read completed without a request result."));
          return;
        }
        settled = true;
        resolve(record);
      };
    } catch (error) {
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB read failed."));
    }
  });
}
function writeRecord(db, record) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).put(clone(record));
      let settled = false;
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        reject(asError(error, "TRANSACTION_FAILED", "IndexedDB write failed."));
      };
      request.onerror = () => rejectOnce(request.error);
      transaction.onerror = () => rejectOnce(transactionError(transaction, false));
      transaction.onabort = () => rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB write failed."));
    }
  });
}
function deleteRecord(db, projectId) {
  return new Promise((resolve, reject) => {
    let transaction;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB delete failed."));
    };
    try {
      transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).delete(projectId);
      request.onerror = () => rejectOnce(request.error);
      transaction.onerror = () => rejectOnce(transactionError(transaction, false));
      transaction.onabort = () => rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      rejectOnce(error);
    }
  });
}
function compareAndSwapRecord(db, projectId, snapshot, expectedSnapshotHash) {
  return new Promise((resolve, reject) => {
    let transaction;
    let conflict;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB CAS failed."));
    };
    try {
      transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const read = store.get(projectId);
      read.onerror = () => rejectOnce(read.error);
      read.onsuccess = () => {
        try {
          const current = normalizeRecord(read.result, projectId);
          if ((current?.snapshotHash ?? null) !== expectedSnapshotHash) {
            conflict = new PixyncIndexedDbPersistenceError("SNAPSHOT_CONFLICT", "PiXYNC IndexedDB snapshot changed in another writer.");
            transaction.abort();
            return;
          }
          const write = store.put({
            projectId,
            snapshot: clone(snapshot)
          });
          write.onerror = () => rejectOnce(write.error);
        } catch (error) {
          if (error instanceof PixyncIndexedDbPersistenceError && error.code === "SNAPSHOT_CONFLICT") conflict = error;
          try {
            transaction.abort();
          } catch {
            rejectOnce(error);
          }
        }
      };
      transaction.onerror = () => {
        if (conflict === void 0) {
          rejectOnce(transactionError(transaction, false));
        }
      };
      transaction.onabort = () => rejectOnce(conflict ?? transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      rejectOnce(error);
    }
  });
}
function normalizeRecord(record, projectId) {
  if (record === void 0) return void 0;
  if (record === null || typeof record !== "object" || record.projectId !== projectId || !("snapshot" in record)) {
    throw new PixyncIndexedDbPersistenceError("RECORD_MALFORMED", "IndexedDB snapshot record is malformed or belongs to another project.");
  }
  return clone(record.snapshot);
}
var PixyncIndexedDbSnapshotPersistence = class {
  projectId;
  dbName;
  #factory;
  #operationTail = Promise.resolve();
  constructor(projectId, options = {}) {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new PixyncIndexedDbPersistenceError("PROJECT_MISMATCH", "IndexedDB persistence projectId is required.");
    }
    this.projectId = projectId;
    this.dbName = options.dbName ?? "pixync-draw2";
    if (this.dbName.length === 0) {
      throw new PixyncIndexedDbPersistenceError("OPEN_FAILED", "IndexedDB database name is required.");
    }
    this.#factory = resolveFactory(options.indexedDB);
  }
  load() {
    return this.#enqueue(async () => {
      const record = await withDatabase(this.#factory, this.dbName, (db) => readRecord(db, this.projectId));
      return normalizeRecord(record, this.projectId);
    });
  }
  atomicReplace(snapshot) {
    return this.#enqueue(async () => {
      if (snapshot.projectId !== this.projectId) {
        throw new PixyncIndexedDbPersistenceError("PROJECT_MISMATCH", "IndexedDB snapshot belongs to another project.");
      }
      const record = {
        projectId: this.projectId,
        snapshot: clone(snapshot)
      };
      await withDatabase(this.#factory, this.dbName, (db) => writeRecord(db, record));
    });
  }
  compareAndSwap(snapshot, expectedSnapshotHash) {
    return this.#enqueue(async () => {
      if (snapshot.projectId !== this.projectId) {
        throw new PixyncIndexedDbPersistenceError("PROJECT_MISMATCH", "IndexedDB snapshot belongs to another project.");
      }
      if (expectedSnapshotHash !== null && (typeof expectedSnapshotHash !== "string" || expectedSnapshotHash.length === 0)) {
        throw new PixyncIndexedDbPersistenceError("RECORD_MALFORMED", "IndexedDB expected snapshot hash is invalid.");
      }
      await withDatabase(this.#factory, this.dbName, (db) => compareAndSwapRecord(db, this.projectId, clone(snapshot), expectedSnapshotHash));
    });
  }
  /** Removes this project's local snapshot; safe to call again during retry. */
  clear() {
    return this.#enqueue(async () => {
      await withDatabase(this.#factory, this.dbName, (db) => deleteRecord(db, this.projectId));
    });
  }
  #enqueue(operation) {
    const result = this.#operationTail.then(operation, operation);
    this.#operationTail = result.then(() => void 0, () => void 0);
    return result;
  }
};
function createPixyncIndexedDbPersistence(projectId, options = {}) {
  return new PixyncIndexedDbSnapshotPersistence(projectId, options);
}

// src/workspace/project-data-storage-entry.ts
async function deleteIndexedDbAudioProjectData(projectId) {
  const audioProjectId = asAudioProjectId(projectId);
  const store = createIndexedDbAudioPersistenceStore();
  const loaded = await store.load(audioProjectId);
  if (!loaded.ok) return false;
  if (loaded.value !== null) {
    const opfs = createOpfsAudioAssetByteStore();
    const revisions = loaded.value.checkpoint.state.revisions;
    for (const revision of revisions) {
      if (revision.source.locator.placement !== "OPFS") continue;
      const removed = await opfs.remove(revision);
      if (!removed.ok) return false;
    }
  }
  return (await store.clear(audioProjectId)).ok;
}
export {
  asAudioProjectId,
  createIndexedDbAudioPersistenceStore,
  createIndexedDbGameEditorPersistenceStore,
  createPixyncIndexedDbPersistence,
  deleteIndexedDbAudioProjectData
};
