(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createReloadSnapshotUtils({
    encodeTypedArray,
    decodeBase64,
    textCompression,
    RELOAD_SNAPSHOT_COMPRESS_THRESHOLD,
    decompressHistorySnapshot,
    normalizeProjectHistoryLimit,
    DEFAULT_HISTORY_LIMIT,
  } = {}) {
    function serializeReloadSnapshotValue(value) {
      if (value instanceof Int16Array) {
        return { __typedArray: 'Int16Array', data: encodeTypedArray(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
      }
      if (value instanceof Uint32Array) {
        return { __typedArray: 'Uint32Array', data: encodeTypedArray(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
      }
      if (value instanceof Uint8ClampedArray) {
        return { __typedArray: 'Uint8ClampedArray', data: encodeTypedArray(value) };
      }
      if (value instanceof Uint8Array) {
        return { __typedArray: 'Uint8Array', data: encodeTypedArray(value) };
      }
      if (Array.isArray(value)) {
        return value.map(item => serializeReloadSnapshotValue(item));
      }
      if (value && typeof value === 'object') {
        const serialized = {};
        Object.entries(value).forEach(([key, nestedValue]) => {
          serialized[key] = serializeReloadSnapshotValue(nestedValue);
        });
        return serialized;
      }
      return value;
    }

    function deserializeReloadSnapshotValue(value) {
      if (!value || typeof value !== 'object') {
        return value;
      }
      if (Array.isArray(value)) {
        return value.map(item => deserializeReloadSnapshotValue(item));
      }
      const typedArrayTag = typeof value.__typedArray === 'string' ? value.__typedArray : '';
      if (typedArrayTag) {
        const bytes = decodeBase64(typeof value.data === 'string' ? value.data : '');
        if (typedArrayTag === 'Int16Array') {
          return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        }
        if (typedArrayTag === 'Uint32Array') {
          return new Uint32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        }
        if (typedArrayTag === 'Uint8ClampedArray') {
          return new Uint8ClampedArray(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        }
        if (typedArrayTag === 'Uint8Array') {
          return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        }
      }
      const deserialized = {};
      Object.entries(value).forEach(([key, nestedValue]) => {
        deserialized[key] = deserializeReloadSnapshotValue(nestedValue);
      });
      return deserialized;
    }

    function encodeReloadSnapshotPayload(payload) {
      if (!payload || typeof payload !== 'object') {
        return '';
      }
      try {
        const json = JSON.stringify(serializeReloadSnapshotValue(payload));
        if (!json) {
          return '';
        }
        if (json.length < RELOAD_SNAPSHOT_COMPRESS_THRESHOLD) {
          return `j:${json}`;
        }
        try {
          const compressed = textCompression.compressToUTF16(json);
          if (typeof compressed === 'string' && compressed.length) {
            return `c:${compressed}`;
          }
        } catch (error) {
          // Fall through to plain JSON encoding.
        }
        return `j:${json}`;
      } catch (error) {
        return '';
      }
    }

    function decodeReloadSnapshotPayload(raw) {
      if (typeof raw !== 'string' || !raw.length) {
        return null;
      }
      let encoded = raw;
      let mode = 'json';
      if (encoded.startsWith('c:')) {
        mode = 'compressed';
        encoded = encoded.slice(2);
      } else if (encoded.startsWith('j:')) {
        mode = 'json';
        encoded = encoded.slice(2);
      }
      try {
        const decoded = mode === 'compressed'
          ? textCompression.decompressFromUTF16(encoded)
          : encoded;
        if (typeof decoded !== 'string' || !decoded.length) {
          return null;
        }
        const parsed = JSON.parse(decoded);
        return parsed && typeof parsed === 'object'
          ? deserializeReloadSnapshotValue(parsed)
          : null;
      } catch (error) {
        return null;
      }
    }

    function normalizeReloadHistoryList(list, historyLimit) {
      if (!Array.isArray(list) || !list.length) {
        return [];
      }
      const normalized = [];
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        if (!item || typeof item !== 'object') {
          continue;
        }
        try {
          const probe = decompressHistorySnapshot(item);
          if (!probe || !Array.isArray(probe.frames) || !probe.frames.length) {
            continue;
          }
        } catch (error) {
          continue;
        }
        normalized.push(item);
      }
      const safeLimit = normalizeProjectHistoryLimit(historyLimit, DEFAULT_HISTORY_LIMIT);
      if (normalized.length <= safeLimit) {
        return normalized;
      }
      return normalized.slice(normalized.length - safeLimit);
    }

    return {
      serializeReloadSnapshotValue,
      deserializeReloadSnapshotValue,
      encodeReloadSnapshotPayload,
      decodeReloadSnapshotPayload,
      normalizeReloadHistoryList,
    };
  }

  root.reloadSnapshotUtils = {
    createReloadSnapshotUtils,
  };
})();
