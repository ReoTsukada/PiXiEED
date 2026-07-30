(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncOperationCodecUtils() {
    const MAGIC = [0x50, 0x69, 0x58, 0x53]; // PiXS
    const VERSION = 1;
    const FLAGS = Object.freeze({ NONE: 0, WRITER_GUARD: 1 });
    const MAX_CELLS = 8192;
    const MAX_RAW_BYTES = 48 * 1024;

    function fail(code) {
      throw new Error(`PiXiSYNC codec: ${code}`);
    }

    function normalizeCellCount(value) {
      const count = Math.trunc(Number(value));
      if (!Number.isSafeInteger(count) || count < 1) fail('invalid-cell-count');
      return count;
    }

    function normalizeChange(change, cellCount, { guarded = false } = {}) {
      const index = Math.trunc(Number(change?.index));
      const paletteValue = Math.trunc(Number(change?.paletteValue));
      if (!Number.isSafeInteger(index) || index < 0 || index >= cellCount) fail('index-out-of-range');
      // PiXiEEDraw's raster contract reserves 0 for transparency. Colors are
      // palette values 1..254; this matches the tiled runtime setter exactly.
      if (!Number.isSafeInteger(paletteValue) || paletteValue < 0 || paletteValue > 254) fail('palette-value-out-of-range');
      if (!guarded) return { index, paletteValue };
      let expectedWriterRevision;
      try { expectedWriterRevision = BigInt(change?.expectedWriterRevision); } catch (_) { fail('invalid-expected-writer-revision'); }
      if (expectedWriterRevision < 1n || expectedWriterRevision > 9223372036854775807n) fail('invalid-expected-writer-revision');
      return { index, paletteValue, expectedWriterRevision };
    }

    function normalizeChanges(changes, cellCount, { guarded = false, allowEmpty = false } = {}) {
      if (!Array.isArray(changes) && !(changes instanceof Map)) fail('changes-must-be-array-or-map');
      const finalByIndex = new Map();
      if (changes instanceof Map) {
        changes.forEach((paletteValue, index) => finalByIndex.set(index, paletteValue));
      } else {
        changes.forEach(change => finalByIndex.set(change?.index, change));
      }
      if ((!allowEmpty && !finalByIndex.size) || finalByIndex.size > MAX_CELLS) fail('invalid-change-count');
      return [...finalByIndex.entries()]
        .map(([index, value]) => normalizeChange(changes instanceof Map ? { index, paletteValue: value } : { ...value, index }, cellCount, { guarded }))
        .sort((a, b) => a.index - b.index);
    }

    function writeVarUint(output, value) {
      let current = value;
      do {
        const part = current % 128;
        current = Math.floor(current / 128);
        output.push(part | (current ? 0x80 : 0));
      } while (current);
    }

    function readVarUint(bytes, cursor) {
      let value = 0;
      let multiplier = 1;
      let length = 0;
      while (true) {
        if (cursor.offset >= bytes.length || length >= 5) fail('invalid-varuint');
        const byte = bytes[cursor.offset++];
        value += (byte & 0x7f) * multiplier;
        length += 1;
        if (!(byte & 0x80)) break;
        multiplier *= 128;
      }
      if (!Number.isSafeInteger(value) || value > 0xffffffff) fail('varuint-overflow');
      const canonical = [];
      writeVarUint(canonical, value);
      if (canonical.length !== length) fail('noncanonical-varuint');
      return value;
    }

    function writeVarUint64(output, value) {
      let current = BigInt(value);
      do { const part = Number(current & 127n); current >>= 7n; output.push(part | (current ? 0x80 : 0)); } while (current);
    }

    function readVarUint64(bytes, cursor) {
      let value = 0n; let shift = 0n; let length = 0;
      while (true) {
        if (cursor.offset >= bytes.length || length >= 10) fail('invalid-varuint64');
        const byte = bytes[cursor.offset++]; value |= BigInt(byte & 0x7f) << shift; shift += 7n; length += 1;
        if (!(byte & 0x80)) break;
      }
      if (value > 9223372036854775807n) fail('varuint64-overflow');
      const canonical = []; writeVarUint64(canonical, value);
      if (canonical.length !== length) fail('noncanonical-varuint64');
      return value;
    }

    function encodePixelPatch(changes, { cellCount, guarded = false, allowEmpty = false } = {}) {
      const safeCellCount = normalizeCellCount(cellCount);
      const normalized = normalizeChanges(changes, safeCellCount, { guarded, allowEmpty });
      const output = [...MAGIC, VERSION, guarded ? FLAGS.WRITER_GUARD : FLAGS.NONE];
      writeVarUint(output, normalized.length);
      let previousIndex = -1;
      normalized.forEach((change, position) => {
        const delta = position === 0 ? change.index : change.index - previousIndex;
        if (delta < 0 || (position > 0 && delta === 0)) fail('nonascending-index');
        writeVarUint(output, delta);
        output.push(change.paletteValue);
        if (guarded) writeVarUint64(output, change.expectedWriterRevision);
        previousIndex = change.index;
      });
      if (output.length > MAX_RAW_BYTES) fail('payload-too-large');
      return new Uint8Array(output);
    }

    function decodePixelPatch(rawBytes, { cellCount, allowEmpty = false } = {}) {
      const safeCellCount = normalizeCellCount(cellCount);
      const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes || []);
      if (bytes.length < 7 || bytes.length > MAX_RAW_BYTES) fail('invalid-payload-length');
      MAGIC.forEach((byte, index) => { if (bytes[index] !== byte) fail('invalid-magic'); });
      if (bytes[4] !== VERSION || (bytes[5] !== FLAGS.NONE && bytes[5] !== FLAGS.WRITER_GUARD)) fail('unsupported-version-or-flags');
      const guarded = bytes[5] === FLAGS.WRITER_GUARD;
      const cursor = { offset: 6 };
      const count = readVarUint(bytes, cursor);
      if ((!allowEmpty && !count) || count > MAX_CELLS) fail('invalid-change-count');
      const changes = [];
      let previousIndex = -1;
      for (let position = 0; position < count; position += 1) {
        const delta = readVarUint(bytes, cursor);
        if (position > 0 && delta === 0) fail('nonascending-index');
        const index = position === 0 ? delta : previousIndex + delta;
        if (!Number.isSafeInteger(index) || index < 0 || index >= safeCellCount) fail('index-out-of-range');
        if (cursor.offset >= bytes.length) fail('truncated-palette-value');
        const paletteValue = bytes[cursor.offset++];
        if (paletteValue > 254) fail('palette-value-out-of-range');
        const expectedWriterRevision = guarded ? readVarUint64(bytes, cursor) : null;
        changes.push(guarded ? { index, paletteValue, expectedWriterRevision } : { index, paletteValue });
        previousIndex = index;
      }
      if (cursor.offset !== bytes.length) fail('trailing-bytes');
      return changes;
    }

    function bytesToBase64(bytes) {
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return window.btoa(binary);
    }

    function base64ToBytes(value) {
      if (typeof value !== 'string' || !value.length || value.length > 64 * 1024) fail('invalid-base64');
      let binary;
      try { binary = window.atob(value); } catch (_) { fail('invalid-base64'); }
      return Uint8Array.from(binary, char => char.charCodeAt(0));
    }

    async function sha256Hex(bytes) {
      const cryptoApi = window.crypto;
      if (!cryptoApi?.subtle?.digest) fail('sha256-unavailable');
      const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    return {
      VERSION,
      MAX_CELLS,
      MAX_RAW_BYTES,
      FLAGS,
      encodePixelPatch,
      decodePixelPatch,
      bytesToBase64,
      base64ToBytes,
      sha256Hex,
    };
  }

  root.pixisyncOperationCodecUtils = { createPiXiSyncOperationCodecUtils };
})();
