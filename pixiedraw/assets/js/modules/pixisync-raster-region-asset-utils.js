(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const MAGIC = [0x50, 0x58, 0x52, 0x41]; // PXRA
  const VERSION = 1;
  const HEADER_BYTES = 18;
  const MAX_DIMENSION = 16384;
  const MAX_CELLS = 268435456;
  const MAX_BYTES = 52428800;

  function fail(reason) { throw new Error(`PiXiSYNC raster region asset: ${reason}`); }
  function uint32(view, offset, value) { view.setUint32(offset, value, true); }

  function encode({ width, height, changes } = {}) {
    const safeWidth = Number(width);
    const safeHeight = Number(height);
    if (!Number.isInteger(safeWidth) || !Number.isInteger(safeHeight)
      || safeWidth < 1 || safeHeight < 1
      || safeWidth > MAX_DIMENSION || safeHeight > MAX_DIMENSION
      || safeWidth * safeHeight > MAX_CELLS) fail('invalid-dimensions');
    if (!Array.isArray(changes) || !changes.length) fail('invalid-changes');
    const ordered = changes.map(change => ({
      index: Number(change?.index),
      paletteValue: Number(change?.paletteValue),
    })).sort((left, right) => left.index - right.index);
    let minX = safeWidth; let minY = safeHeight; let maxX = -1; let maxY = -1;
    let previous = -1;
    ordered.forEach(change => {
      if (!Number.isInteger(change.index) || change.index < 0 || change.index >= safeWidth * safeHeight
        || change.index <= previous || !Number.isInteger(change.paletteValue)
        || change.paletteValue < 0 || change.paletteValue > 254) fail('invalid-change');
      previous = change.index;
      const x = change.index % safeWidth; const y = Math.floor(change.index / safeWidth);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    });
    const regionWidth = maxX - minX + 1; const regionHeight = maxY - minY + 1;
    const regionCells = regionWidth * regionHeight;
    const maskBytes = Math.ceil(regionCells / 8);
    const byteLength = HEADER_BYTES + maskBytes + ordered.length;
    if (byteLength > MAX_BYTES) fail('asset-size-out-of-range');
    const bytes = new Uint8Array(byteLength);
    bytes.set(MAGIC, 0); bytes[4] = VERSION; bytes[5] = 0;
    const view = new DataView(bytes.buffer);
    view.setUint16(6, minX, true); view.setUint16(8, minY, true);
    view.setUint16(10, regionWidth, true); view.setUint16(12, regionHeight, true);
    uint32(view, 14, ordered.length);
    let valueOffset = HEADER_BYTES + maskBytes;
    ordered.forEach(change => {
      const x = change.index % safeWidth; const y = Math.floor(change.index / safeWidth);
      const local = ((y - minY) * regionWidth) + (x - minX);
      bytes[HEADER_BYTES + (local >> 3)] |= 1 << (local & 7);
      bytes[valueOffset++] = change.paletteValue;
    });
    return {
      bytes,
      rect: Object.freeze({ x: minX, y: minY, width: regionWidth, height: regionHeight }),
      changedCount: ordered.length,
      pixelFormat: 'indexed-mask-v1',
    };
  }

  function decode(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < HEADER_BYTES + 2 || bytes.length > MAX_BYTES) fail('asset-size-out-of-range');
    if (MAGIC.some((value, index) => bytes[index] !== value) || bytes[4] !== VERSION || bytes[5] !== 0) fail('invalid-header');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const x = view.getUint16(6, true); const y = view.getUint16(8, true);
    const width = view.getUint16(10, true); const height = view.getUint16(12, true);
    const changedCount = view.getUint32(14, true);
    if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_CELLS
      || changedCount < 1 || changedCount > width * height) fail('invalid-shape');
    const regionCells = width * height; const maskBytes = Math.ceil(regionCells / 8);
    if (bytes.length !== HEADER_BYTES + maskBytes + changedCount) fail('invalid-length');
    const paddingBits = (maskBytes * 8) - regionCells;
    if (paddingBits && (bytes[HEADER_BYTES + maskBytes - 1] >> (8 - paddingBits)) !== 0) fail('noncanonical-mask-padding');
    const changes = [];
    let valueOffset = HEADER_BYTES + maskBytes;
    for (let local = 0; local < regionCells; local += 1) {
      if ((bytes[HEADER_BYTES + (local >> 3)] & (1 << (local & 7))) === 0) continue;
      if (valueOffset >= bytes.length) fail('mask-count-mismatch');
      const paletteValue = bytes[valueOffset++];
      if (paletteValue > 254) fail('invalid-palette-value');
      changes.push({ x: x + (local % width), y: y + Math.floor(local / width), paletteValue });
    }
    if (changes.length !== changedCount || valueOffset !== bytes.length) fail('mask-count-mismatch');
    return Object.freeze({ rect: Object.freeze({ x, y, width, height }), changes, changedCount, pixelFormat: 'indexed-mask-v1' });
  }

  root.pixisyncRasterRegionAssetUtils = Object.freeze({
    VERSION, MAX_BYTES, encode, decode,
  });
})();
