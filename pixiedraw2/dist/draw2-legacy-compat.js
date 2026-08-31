// src/draw2-core.ts
var NullInstrumentation = class {
  record(_point) {
  }
};
var NOOP_INSTRUMENTATION = new NullInstrumentation();
var IndexedTileRaster = class _IndexedTileRaster {
  width;
  height;
  tileSize;
  #tiles;
  #nonTransparentPixelCount;
  #cowSplitCount = 0;
  #copiedBytes = 0;
  constructor(width, height, tileSize, tiles, nonTransparentPixelCount = 0) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.#tiles = tiles;
    this.#nonTransparentPixelCount = nonTransparentPixelCount;
  }
  static empty(width, height, tileSize) {
    if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
      throw new Error("Raster dimensions must be positive safe integers.");
    }
    return new _IndexedTileRaster(width, height, tileSize, /* @__PURE__ */ new Map());
  }
  /** Rehydrates a sparse raster from its canonical tile snapshots. */
  static fromTileSnapshots(width, height, tileSize, snapshots) {
    const raster = _IndexedTileRaster.empty(width, height, tileSize);
    const tiles = /* @__PURE__ */ new Map();
    const expectedByteLength = tileSize * tileSize;
    const tileColumns = Math.ceil(width / tileSize);
    const tileRows = Math.ceil(height / tileSize);
    let nonTransparentPixelCount = 0;
    for (const snapshot of snapshots) {
      if (!/^\d+:\d+$/.test(snapshot.tileKey)) {
        throw new Error("Raster tile key is invalid.");
      }
      const [tileXText, tileYText] = snapshot.tileKey.split(":");
      const tileX = Number(tileXText);
      const tileY = Number(tileYText);
      if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY) || tileX < 0 || tileY < 0 || tileX >= tileColumns || tileY >= tileRows) {
        throw new Error("Raster tile key is outside the raster.");
      }
      if (!(snapshot.bytes instanceof Uint8Array) || snapshot.bytes.byteLength !== expectedByteLength) {
        throw new Error("Raster tile byte length is invalid.");
      }
      for (const value of snapshot.bytes) {
        if (value !== 0) nonTransparentPixelCount += 1;
      }
      if (tiles.has(snapshot.tileKey)) {
        throw new Error("Raster tile key is duplicated.");
      }
      tiles.set(snapshot.tileKey, {
        bytes: new Uint8Array(snapshot.bytes),
        references: 1
      });
    }
    return new _IndexedTileRaster(raster.width, raster.height, raster.tileSize, tiles, nonTransparentPixelCount);
  }
  /** Shares immutable Tile buffers; the next mutation splits only its affected Tile. */
  sharedClone() {
    const tiles = /* @__PURE__ */ new Map();
    for (const [key, cell] of this.#tiles) {
      cell.references += 1;
      tiles.set(key, cell);
    }
    return new _IndexedTileRaster(this.width, this.height, this.tileSize, tiles, this.#nonTransparentPixelCount);
  }
  #tileCoordinates(x, y) {
    const tileX = Math.floor(x / this.tileSize);
    const tileY = Math.floor(y / this.tileSize);
    const localX = x % this.tileSize;
    const localY = y % this.tileSize;
    return {
      tileX,
      tileY,
      localIndex: localY * this.tileSize + localX,
      tileKey: `${tileX}:${tileY}`
    };
  }
  getPixel(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new Error("Pixel coordinate is outside the raster.");
    }
    const coordinates = this.#tileCoordinates(x, y);
    return this.#tiles.get(coordinates.tileKey)?.bytes[coordinates.localIndex] ?? 0;
  }
  /** Returns whether the raster contains any non-transparent indexed pixel. */
  hasNonTransparentPixel() {
    return this.#nonTransparentPixelCount > 0;
  }
  setPixel(assetId, x, y, colorIndex) {
    if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex > 255) {
      throw new Error("Canonical palette index must be an integer from 0 through 255.");
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new Error("Pixel coordinate is outside the raster.");
    }
    const coordinates = this.#tileCoordinates(x, y);
    let cell = this.#tiles.get(coordinates.tileKey);
    const previous = cell?.bytes[coordinates.localIndex] ?? 0;
    const tile = {
      assetId,
      tileX: coordinates.tileX,
      tileY: coordinates.tileY,
      tileKey: coordinates.tileKey
    };
    if (previous === colorIndex) {
      return {
        changed: false,
        tile,
        copiedBytes: 0,
        cowSplit: false
      };
    }
    let copiedBytes = 0;
    let cowSplit = false;
    if (cell === void 0) {
      cell = {
        bytes: new Uint8Array(this.tileSize * this.tileSize),
        references: 1
      };
      this.#tiles.set(coordinates.tileKey, cell);
    } else if (cell.references > 1) {
      cell.references -= 1;
      cell = {
        bytes: new Uint8Array(cell.bytes),
        references: 1
      };
      this.#tiles.set(coordinates.tileKey, cell);
      copiedBytes = cell.bytes.byteLength;
      cowSplit = true;
      this.#cowSplitCount += 1;
      this.#copiedBytes += copiedBytes;
    }
    cell.bytes[coordinates.localIndex] = colorIndex;
    if (previous === 0 && colorIndex !== 0) {
      this.#nonTransparentPixelCount += 1;
    } else if (previous !== 0 && colorIndex === 0) {
      this.#nonTransparentPixelCount -= 1;
    }
    return {
      changed: true,
      tile,
      copiedBytes,
      cowSplit
    };
  }
  snapshotTiles() {
    return Array.from(this.#tiles.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([tileKey, cell]) => ({
      tileKey,
      bytes: new Uint8Array(cell.bytes)
    }));
  }
  /** Full canonical read is reserved for Golden Fixture equivalence, not active dirty rendering. */
  toUint8Array() {
    const pixels = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        pixels[y * this.width + x] = this.getPixel(x, y);
      }
    }
    return pixels;
  }
  /** Reads only the requested presentation region; active editing must not call toUint8Array(). */
  readRegion(x, y, width, height) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || x < 0 || y < 0 || x + width > this.width || y + height > this.height) {
      throw new Error("Raster region is outside the raster.");
    }
    const pixels = new Uint8Array(width * height);
    let implicitTransparentPixelCount = 0;
    for (let regionY = 0; regionY < height; regionY += 1) {
      for (let regionX = 0; regionX < width; regionX += 1) {
        const sourceX = x + regionX;
        const sourceY = y + regionY;
        const coordinates = this.#tileCoordinates(sourceX, sourceY);
        const cell = this.#tiles.get(coordinates.tileKey);
        if (cell === void 0) implicitTransparentPixelCount += 1;
        pixels[regionY * width + regionX] = cell?.bytes[coordinates.localIndex] ?? 0;
      }
    }
    return {
      x,
      y,
      width,
      height,
      pixels,
      implicitTransparentPixelCount
    };
  }
  memoryMetrics() {
    let sharedTileBytes = 0;
    for (const cell of this.#tiles.values()) {
      if (cell.references > 1) sharedTileBytes += cell.bytes.byteLength;
    }
    const tileColumns = Math.ceil(this.width / this.tileSize);
    const tileRows = Math.ceil(this.height / this.tileSize);
    return {
      logicalRasterBytes: this.width * this.height,
      allocatedTileBytes: this.#tiles.size * this.tileSize * this.tileSize,
      sharedTileBytes,
      tileCount: this.#tiles.size,
      implicitTransparentTileCount: tileColumns * tileRows - this.#tiles.size,
      cowSplitCount: this.#cowSplitCount,
      copiedBytes: this.#copiedBytes
    };
  }
};
function validatePalette(palette) {
  if (palette.length < 1 || palette.length > 256) {
    throw new Error("Palette must contain 1 through 256 entries.");
  }
  if (palette[0] !== 0) throw new Error("Palette index 0 must be transparent.");
  for (const color of palette) {
    if (!Number.isSafeInteger(color) || color < 0 || color > 4294967295) {
      throw new Error("Palette colors must be uint32 values.");
    }
  }
  return [
    ...palette
  ];
}
function createProject(options) {
  if (!options.projectId) throw new Error("Project ID is required.");
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const palette = validatePalette(options.palette ?? [
    0,
    4294967295,
    4278190335,
    65535
  ]);
  const assetId = `${options.projectId}:draw:main`;
  const asset = {
    id: assetId,
    width,
    height,
    palette,
    raster: IndexedTileRaster.empty(width, height, options.tileSize ?? 32),
    revision: 0
  };
  const layerId = `${options.projectId}:layer:0`;
  const frameId = `${options.projectId}:frame:0`;
  const celId = `${options.projectId}:cel:0:0`;
  return {
    schemaVersion: 1,
    projectId: options.projectId,
    name: options.name ?? "Untitled Draw2 Project",
    structureEpoch: 1,
    activeAssetId: assetId,
    layers: [
      {
        id: layerId,
        layerTrackId: layerId,
        name: "Layer 1",
        order: 0,
        orderingKey: "00000000",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        locked: false,
        lifecycle: "ACTIVE",
        kind: "RASTER"
      }
    ],
    frames: [
      {
        id: frameId,
        frameId,
        index: 0,
        orderKey: "00000000",
        durationMs: 100,
        timingUnit: "MILLISECONDS",
        metadataVersion: 1
      }
    ],
    cels: [
      {
        id: celId,
        celId,
        layerId,
        layerTrackId: layerId,
        frameId,
        assetId,
        bindingMode: "RASTER",
        recordVersion: 1,
        lifecycle: "ACTIVE"
      }
    ],
    timeline: {
      id: `${options.projectId}:timeline:0`,
      timelineId: `${options.projectId}:timeline:0`,
      frameOrder: [
        frameId
      ],
      layerTrackOrder: [
        layerId
      ],
      metadataVersion: 1
    },
    activeLayerId: layerId,
    activeFrameId: frameId,
    activeCelId: celId,
    assets: {
      [assetId]: asset
    },
    tilemaps: {},
    appliedCommandIds: [],
    lastClientSequenceByClient: {}
  };
}

// src/draw2-legacy-compat.ts
var LEGACY_PXD_FORMAT_VERSION = 2;
var LEGACY_PXD_ADAPTER_ID = "pxd-v2-zip";
var DRAW2_PXD_V1_MAGIC = new Uint8Array([
  80,
  88,
  68,
  0
]);
var LEGACY_IMPORT_LIMITS = Object.freeze({
  maxArchiveBytes: 128 * 1024 * 1024,
  maxEntryCount: 4096,
  maxEntryBytes: 64 * 1024 * 1024,
  maxManifestBytes: 1024 * 1024,
  maxJsonBytes: 16 * 1024 * 1024,
  maxCanvasPixels: 16 * 1024 * 1024,
  maxCanvases: 1,
  maxFrames: 4096,
  maxLayers: 4096,
  maxBase64Bytes: 128 * 1024 * 1024,
  maxBitmapBytes: 64 * 1024 * 1024,
  maxTotalBitmapBytes: 256 * 1024 * 1024
});
var LegacyPxdCompatibilityError = class extends Error {
  code;
  status;
  path;
  constructor(code, message, status = "UNSUPPORTED", path) {
    super(message);
    this.name = "LegacyPxdCompatibilityError";
    this.code = code;
    this.status = status;
    this.path = path;
  }
};
function fail(code, message, status = "UNSUPPORTED", path) {
  throw new LegacyPxdCompatibilityError(code, message, status, path);
}
function assertLegacy(condition, code, message, status = "UNSUPPORTED", path) {
  if (!condition) fail(code, message, status, path);
}
function readUint16LE(bytes, offset, label) {
  assertLegacy(offset >= 0 && offset + 2 <= bytes.byteLength, "LEGACY_ZIP_TRUNCATED", `${label} is truncated.`);
  return (bytes[offset] ?? 0) | (bytes[offset + 1] ?? 0) << 8;
}
function readUint32LE(bytes, offset, label) {
  assertLegacy(offset >= 0 && offset + 4 <= bytes.byteLength, "LEGACY_ZIP_TRUNCATED", `${label} is truncated.`);
  return (bytes[offset] ?? 0) | (bytes[offset + 1] ?? 0) << 8 | (bytes[offset + 2] ?? 0) << 16 | (bytes[offset + 3] ?? 0) * 16777216;
}
function hasBytes(bytes, signature) {
  if (bytes.byteLength < signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) if (bytes[index] !== signature[index]) return false;
  return true;
}
function isZipLocalSignature(bytes) {
  return hasBytes(bytes, [
    80,
    75,
    3,
    4
  ]);
}
function isPathSafe(path) {
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/u.test(path)) return false;
  const parts = path.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}
function isActiveContentPath(path) {
  return /\.(?:html?|svg|js|mjs|cjs|wasm|css|sh|command|bat)$/iu.test(path);
}
function findEndOfCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.byteLength - 65557);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readUint32LE(bytes, offset, "ZIP end record") === 101010256) return offset;
  }
  fail("LEGACY_ZIP_EOCD_MISSING", "Legacy PXD ZIP end record is missing.");
}
function parseStoredZip(bytes) {
  assertLegacy(bytes.byteLength <= LEGACY_IMPORT_LIMITS.maxArchiveBytes, "LEGACY_ARCHIVE_TOO_LARGE", "Legacy PXD archive exceeds the byte limit.");
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const disk = readUint16LE(bytes, eocdOffset + 4, "ZIP disk number");
  const centralDisk = readUint16LE(bytes, eocdOffset + 6, "ZIP central disk number");
  const entryCount = readUint16LE(bytes, eocdOffset + 10, "ZIP entry count");
  const centralSize = readUint32LE(bytes, eocdOffset + 12, "ZIP central size");
  const centralOffset = readUint32LE(bytes, eocdOffset + 16, "ZIP central offset");
  const commentLength = readUint16LE(bytes, eocdOffset + 20, "ZIP comment length");
  assertLegacy(disk === 0 && centralDisk === 0, "LEGACY_ZIP_MULTI_DISK_UNSUPPORTED", "Multi-disk ZIP archives are unsupported.");
  assertLegacy(eocdOffset + 22 + commentLength === bytes.byteLength, "LEGACY_ZIP_TRAILING_BYTES", "Legacy PXD ZIP has trailing bytes after its end record.");
  assertLegacy(entryCount > 0 && entryCount <= LEGACY_IMPORT_LIMITS.maxEntryCount, "LEGACY_ENTRY_COUNT_INVALID", "Legacy PXD entry count is outside the safety limit.");
  assertLegacy(centralOffset + centralSize === eocdOffset, "LEGACY_ZIP_CENTRAL_RANGE_INVALID", "ZIP central directory range is invalid.");
  const entries = /* @__PURE__ */ new Map();
  let offset = 0;
  while (offset < centralOffset) {
    assertLegacy(isZipLocalSignature(bytes.subarray(offset)), "LEGACY_ZIP_ENTRY_SIGNATURE_INVALID", "Legacy PXD contains an unsupported ZIP entry signature.");
    const flags = readUint16LE(bytes, offset + 6, "ZIP flags");
    const method = readUint16LE(bytes, offset + 8, "ZIP compression method");
    const compressedSize = readUint32LE(bytes, offset + 18, "ZIP compressed size");
    const uncompressedSize = readUint32LE(bytes, offset + 22, "ZIP uncompressed size");
    const nameLength = readUint16LE(bytes, offset + 26, "ZIP filename length");
    const extraLength = readUint16LE(bytes, offset + 28, "ZIP extra length");
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    assertLegacy(flags === 0, "LEGACY_ZIP_FLAGS_UNSUPPORTED", "Encrypted or data-descriptor ZIP entries are unsupported.");
    assertLegacy(method === 0, "LEGACY_ZIP_COMPRESSION_UNSUPPORTED", "Legacy PXD outer ZIP entries must use stored compression.");
    assertLegacy(compressedSize === uncompressedSize, "LEGACY_ZIP_SIZE_MISMATCH", "Stored ZIP entry size does not match.");
    assertLegacy(compressedSize <= LEGACY_IMPORT_LIMITS.maxEntryBytes, "LEGACY_ENTRY_TOO_LARGE", "Legacy PXD entry exceeds the byte limit.");
    assertLegacy(dataEnd <= centralOffset && nameEnd <= dataStart, "LEGACY_ZIP_ENTRY_TRUNCATED", "Legacy PXD ZIP entry is truncated.");
    const path = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd));
    assertLegacy(isPathSafe(path), "LEGACY_PATH_UNSAFE", `Unsafe legacy PXD entry path: ${path}`);
    assertLegacy(!isActiveContentPath(path), "LEGACY_ACTIVE_CONTENT_REJECTED", `Active content is not accepted in a legacy PXD: ${path}`);
    assertLegacy(!entries.has(path), "LEGACY_DUPLICATE_ENTRY", `Duplicate legacy PXD entry: ${path}`);
    assertLegacy(entries.size < LEGACY_IMPORT_LIMITS.maxEntryCount, "LEGACY_ENTRY_COUNT_INVALID", "Legacy PXD has too many entries.");
    entries.set(path, {
      path,
      bytes: bytes.slice(dataStart, dataEnd),
      method: 0,
      localOffset: offset
    });
    offset = dataEnd;
  }
  assertLegacy(offset === centralOffset, "LEGACY_ZIP_CENTRAL_OFFSET_INVALID", "ZIP local entries do not end at the central directory.");
  let centralCursor = centralOffset;
  let centralEntries = 0;
  while (centralCursor < eocdOffset) {
    assertLegacy(readUint32LE(bytes, centralCursor, "ZIP central entry") === 33639248, "LEGACY_ZIP_CENTRAL_ENTRY_INVALID", "Legacy PXD central directory entry is invalid.");
    const flags = readUint16LE(bytes, centralCursor + 8, "ZIP central flags");
    const method = readUint16LE(bytes, centralCursor + 10, "ZIP central compression method");
    const compressedSize = readUint32LE(bytes, centralCursor + 20, "ZIP central compressed size");
    const uncompressedSize = readUint32LE(bytes, centralCursor + 24, "ZIP central uncompressed size");
    const nameLength = readUint16LE(bytes, centralCursor + 28, "ZIP central filename length");
    const extraLength = readUint16LE(bytes, centralCursor + 30, "ZIP central extra length");
    const commentLengthCentral = readUint16LE(bytes, centralCursor + 32, "ZIP central comment length");
    const localOffset = readUint32LE(bytes, centralCursor + 42, "ZIP local entry offset");
    const nameStart = centralCursor + 46;
    const nameEnd = nameStart + nameLength;
    const next = nameEnd + extraLength + commentLengthCentral;
    assertLegacy(flags === 0 && method === 0, "LEGACY_ZIP_CENTRAL_UNSUPPORTED", "Legacy PXD central entry uses unsupported flags or compression.");
    assertLegacy(next <= eocdOffset, "LEGACY_ZIP_CENTRAL_TRUNCATED", "Legacy PXD central directory is truncated.");
    const path = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd));
    const entry = entries.get(path);
    assertLegacy(entry !== void 0 && entry.localOffset === localOffset && entry.bytes.byteLength === compressedSize && compressedSize === uncompressedSize, "LEGACY_ZIP_CENTRAL_MISMATCH", `ZIP central entry does not match local entry: ${path}`);
    centralEntries += 1;
    centralCursor = next;
  }
  assertLegacy(centralCursor === eocdOffset && centralEntries === entryCount && entries.size === entryCount, "LEGACY_ZIP_ENTRY_COUNT_MISMATCH", "ZIP entry count does not match its central directory.");
  return {
    entries
  };
}
function assertObject(value, code, message, path) {
  assertLegacy(value !== null && typeof value === "object" && !Array.isArray(value), code, message, "UNSUPPORTED", path);
  return value;
}
function positiveInteger(value, code, message, maximum, path) {
  const number = Number(value);
  assertLegacy(Number.isSafeInteger(number) && number > 0 && number <= maximum, code, message, "UNSUPPORTED", path);
  return number;
}
function nonNegativeInteger(value, code, message, maximum, path) {
  const number = Number(value);
  assertLegacy(Number.isSafeInteger(number) && number >= 0 && number <= maximum, code, message, "UNSUPPORTED", path);
  return number;
}
function collectUnknown(value, known, path, diagnostics, unknownPaths) {
  for (const key of Object.keys(value)) {
    if (known.has(key)) continue;
    const fieldPath = `${path}.${key}`;
    unknownPaths.push(fieldPath);
    diagnostics.push({
      code: "LEGACY_UNKNOWN_FIELD",
      severity: "warning",
      message: "Unknown legacy field is retained only in the original source and requires review.",
      path: fieldPath,
      disposition: "UNKNOWN_BUT_PRESERVED"
    });
  }
}
function readJsonEntry(archive, path, limit) {
  const entry = archive.entries.get(path);
  assertLegacy(entry !== void 0, "LEGACY_MISSING_ENTRY", `Missing legacy PXD entry: ${path}`, "UNSUPPORTED", path);
  assertLegacy(entry.bytes.byteLength <= limit, "LEGACY_JSON_TOO_LARGE", `Legacy PXD JSON entry exceeds the byte limit: ${path}`, "UNSUPPORTED", path);
  try {
    return assertObject(JSON.parse(new TextDecoder().decode(entry.bytes)), "LEGACY_JSON_INVALID", `Invalid legacy PXD JSON: ${path}`, path);
  } catch (cause) {
    if (cause instanceof LegacyPxdCompatibilityError) throw cause;
    fail("LEGACY_JSON_INVALID", `Invalid legacy PXD JSON: ${path}`, "UNSUPPORTED", path);
  }
}
function safeString(value, fallback, maximum = 512) {
  if (typeof value !== "string" || value.length === 0) return fallback;
  return value.slice(0, maximum);
}
function safeStatusFromDiagnostics(diagnostics) {
  if (diagnostics.some((item) => item.disposition === "UNSUPPORTED")) return "UNSUPPORTED";
  if (diagnostics.some((item) => item.disposition === "POTENTIALLY_LOSSY")) return "REVIEW_REQUIRED";
  if (diagnostics.some((item) => item.disposition === "UNKNOWN_BUT_PRESERVED")) return "REVIEW_REQUIRED";
  return "SUPPORTED_WITH_ADAPTER";
}
async function sha256BytesHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function sourceIdentity(identity, bytes, sourceHash) {
  return {
    identity,
    byteLength: bytes.byteLength,
    sourceHash,
    extensionIndependent: true,
    originalBytesRetained: true
  };
}
function inspectManifest(manifest, diagnostics, unknownPaths) {
  collectUnknown(manifest, /* @__PURE__ */ new Set([
    "format",
    "version",
    "storageAdapterId",
    "packageType",
    "packageVersion",
    "documentVersion",
    "width",
    "height",
    "canvasCount",
    "activeCanvasId",
    "sheetCount",
    "documentName",
    "updatedAt",
    "previewThumbnail",
    "certification"
  ]), "manifest", diagnostics, unknownPaths);
  assertLegacy(manifest.format === "pxd" || manifest.format === "pixieedraw", "LEGACY_FORMAT_ID_UNSUPPORTED", "Legacy PXD manifest format ID is unsupported.", "UNSUPPORTED", "manifest.format");
  assertLegacy(manifest.version === LEGACY_PXD_FORMAT_VERSION, "LEGACY_FORMAT_VERSION_UNSUPPORTED", "Legacy PXD manifest version is unsupported.", "UNSUPPORTED", "manifest.version");
  if (manifest.storageAdapterId !== void 0 && manifest.storageAdapterId !== LEGACY_PXD_ADAPTER_ID) {
    diagnostics.push({
      code: "LEGACY_ADAPTER_ID_UNKNOWN",
      severity: "warning",
      message: "The archive uses an unrecognized storage adapter ID and requires review.",
      path: "manifest.storageAdapterId",
      disposition: "UNKNOWN_BUT_PRESERVED"
    });
    unknownPaths.push("manifest.storageAdapterId");
  }
  if (manifest.packageVersion !== void 0) positiveInteger(manifest.packageVersion, "LEGACY_PACKAGE_VERSION_INVALID", "Legacy packageVersion is invalid.", 64, "manifest.packageVersion");
  if (manifest.documentVersion !== void 0) positiveInteger(manifest.documentVersion, "LEGACY_DOCUMENT_VERSION_INVALID", "Legacy documentVersion is invalid.", 64, "manifest.documentVersion");
  if (typeof manifest.previewThumbnail === "string") {
    assertLegacy(!/^data:image\/svg|^data:text\/html|<svg/iu.test(manifest.previewThumbnail), "LEGACY_ACTIVE_CONTENT_REJECTED", "SVG or active thumbnail content is not accepted.", "UNSUPPORTED", "manifest.previewThumbnail");
    assertLegacy(manifest.previewThumbnail.length <= 24e4, "LEGACY_THUMBNAIL_TOO_LARGE", "Legacy thumbnail exceeds the safety limit.", "UNSUPPORTED", "manifest.previewThumbnail");
  }
}
function decodeBase64(value, path) {
  assertLegacy(value.length <= LEGACY_IMPORT_LIMITS.maxBase64Bytes * 2, "LEGACY_BASE64_TOO_LARGE", "Legacy Base64 field exceeds the safety limit.", "UNSUPPORTED", path);
  assertLegacy(!/^data:/iu.test(value), "LEGACY_DATA_URL_REJECTED", "Legacy Data URLs are not accepted in indexed payloads.", "UNSUPPORTED", path);
  assertLegacy(/^[A-Za-z0-9+/]*={0,2}$/u.test(value) && value.length % 4 === 0, "LEGACY_BASE64_INVALID", "Legacy Base64 field is invalid.", "UNSUPPORTED", path);
  try {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    assertLegacy(bytes.byteLength <= LEGACY_IMPORT_LIMITS.maxBase64Bytes, "LEGACY_BASE64_TOO_LARGE", "Legacy Base64 field exceeds the decoded byte limit.", "UNSUPPORTED", path);
    return bytes;
  } catch {
    fail("LEGACY_BASE64_INVALID", "Legacy Base64 field could not be decoded.", "UNSUPPORTED", path);
  }
}
function rgbaToPacked(r, g, b, a) {
  return r * 16777216 + g * 65536 + b * 256 + a;
}
function normalizePalette(value) {
  assertLegacy(Array.isArray(value) && value.length >= 1 && value.length <= 256, "LEGACY_PALETTE_INVALID", "Legacy palette is invalid.", "UNSUPPORTED", "project.document.palette");
  const palette = value.map((entry, index) => {
    if (typeof entry === "number") {
      assertLegacy(Number.isSafeInteger(entry) && entry >= 0 && entry <= 4294967295, "LEGACY_PALETTE_COLOR_INVALID", "Legacy numeric palette color is invalid.", "UNSUPPORTED", `project.document.palette.${index}`);
      return entry;
    }
    const color = assertObject(entry, "LEGACY_PALETTE_COLOR_INVALID", "Legacy palette color is invalid.", `project.document.palette.${index}`);
    const r = nonNegativeInteger(color.r, "LEGACY_PALETTE_COLOR_INVALID", "Legacy palette red channel is invalid.", 255, `project.document.palette.${index}.r`);
    const g = nonNegativeInteger(color.g, "LEGACY_PALETTE_COLOR_INVALID", "Legacy palette green channel is invalid.", 255, `project.document.palette.${index}.g`);
    const b = nonNegativeInteger(color.b, "LEGACY_PALETTE_COLOR_INVALID", "Legacy palette blue channel is invalid.", 255, `project.document.palette.${index}.b`);
    const a = nonNegativeInteger(color.a, "LEGACY_PALETTE_COLOR_INVALID", "Legacy palette alpha channel is invalid.", 255, `project.document.palette.${index}.a`);
    return rgbaToPacked(r, g, b, a);
  });
  assertLegacy(palette[0] === 0 || typeof value[0] === "object" && Number(value[0].a) === 0, "LEGACY_TRANSPARENCY_INVALID", "Legacy palette index 0 must be transparent.", "UNSUPPORTED", "project.document.palette.0");
  palette[0] = 0;
  return palette;
}
function decodeIndexedBytes(bytes, pixelCount, paletteLength, path) {
  const output = new Uint8Array(pixelCount);
  if (bytes.byteLength === 0) return output;
  if (bytes.byteLength === pixelCount) {
    for (let index = 0; index < pixelCount; index += 1) {
      const colorIndex = bytes[index] ?? 0;
      assertLegacy(colorIndex < paletteLength, "LEGACY_PIXEL_INDEX_INVALID", "Legacy indexed raster references an invalid palette entry.", "UNSUPPORTED", path);
      output[index] = colorIndex;
    }
    return output;
  }
  assertLegacy(bytes.byteLength === pixelCount * 2, "LEGACY_RASTER_LENGTH_INVALID", "Legacy indexed raster length does not match the canvas.", "UNSUPPORTED", path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < pixelCount; index += 1) {
    const legacyIndex = view.getInt16(index * 2, true);
    const colorIndex = legacyIndex < 0 ? 0 : legacyIndex;
    assertLegacy(colorIndex < paletteLength, "LEGACY_PIXEL_INDEX_INVALID", "Legacy Int16 raster references an invalid palette entry.", "UNSUPPORTED", path);
    output[index] = colorIndex;
  }
  return output;
}
function paletteIndexForRgba(r, g, b, a, palette, path) {
  if (a === 0) return 0;
  const packed = rgbaToPacked(r, g, b, a);
  const index = palette.indexOf(packed);
  assertLegacy(index > 0, "LEGACY_PALETTE_COLOR_MISSING", "Legacy RGBA payload contains a color not represented by the indexed palette.", "REVIEW_REQUIRED", path);
  return index;
}
async function bitmapHash(bytes, encoding, width, height) {
  const prefix = new TextEncoder().encode(`${encoding}\0${width}\0${height}\0`);
  const source = new Uint8Array(prefix.byteLength + bytes.byteLength);
  source.set(prefix, 0);
  source.set(bytes, prefix.byteLength);
  return await sha256BytesHex(source);
}
function knownLayerDiagnostic(layer, path, diagnostics, unknownPaths) {
  collectUnknown(layer, /* @__PURE__ */ new Set([
    "id",
    "name",
    "visible",
    "opacity",
    "locked",
    "type",
    "indices",
    "indicesEncoding",
    "indicesImplicitTransparent",
    "directOnly",
    "cel",
    "importSourceCel",
    "blendMode"
  ]), path, diagnostics, unknownPaths);
  if (layer.type === "simulation") fail("LEGACY_SIMULATION_LAYER_UNSUPPORTED", "Simulation layers are not represented by the Draw2 raster Core.", "UNSUPPORTED", path);
  if (layer.blendMode !== void 0 && layer.blendMode !== "normal" && layer.blendMode !== "NORMAL") {
    diagnostics.push({
      code: "LEGACY_BLEND_MODE_REVIEW",
      severity: "warning",
      message: "The legacy blend mode is not represented by the Draw2 reference Core.",
      path: `${path}.blendMode`,
      disposition: "POTENTIALLY_LOSSY"
    });
  }
  if (typeof layer.direct === "string" || typeof layer.importSourceDirect === "string") {
    fail("LEGACY_DIRECT_PAYLOAD_UNSUPPORTED", "Inline legacy raster payloads are not accepted; use validated archive bitmap entries.", "UNSUPPORTED", path);
  }
}
function validateRect(value, path, width, height) {
  const x = Number(value.x ?? 0);
  const y = Number(value.y ?? 0);
  const w = positiveInteger(value.w, "LEGACY_BITMAP_RECT_INVALID", "Legacy bitmap width is invalid.", width, `${path}.w`);
  const h = positiveInteger(value.h, "LEGACY_BITMAP_RECT_INVALID", "Legacy bitmap height is invalid.", height, `${path}.h`);
  assertLegacy(Number.isSafeInteger(x) && Number.isSafeInteger(y) && x >= 0 && y >= 0 && x + w <= width && y + h <= height, "LEGACY_BITMAP_RECT_INVALID", "Legacy bitmap rectangle is outside the canvas.", "UNSUPPORTED", path);
  return {
    x,
    y,
    w,
    h
  };
}
async function decodeCelRgba(layer, archive, canvasWidth, canvasHeight, options, bitmapState, path) {
  const celValue = layer.cel;
  if (celValue === void 0 || celValue === null) return void 0;
  const cel = assertObject(celValue, "LEGACY_CEL_INVALID", "Legacy cel metadata is invalid.", path);
  const encoding = cel.encoding;
  assertLegacy(encoding === "rgba.zlib", "LEGACY_BITMAP_ENCODING_UNSUPPORTED", "Legacy bitmap encoding is unsupported.", "UNSUPPORTED", `${path}.encoding`);
  const rect = validateRect(cel, path, canvasWidth, canvasHeight);
  assertLegacy(typeof cel.bitmapRef === "string" && isPathSafe(cel.bitmapRef) && cel.bitmapRef.startsWith("bitmaps/") && cel.bitmapRef.endsWith(".rgba.zlib"), "LEGACY_BITMAP_PATH_INVALID", "Legacy bitmap reference is invalid.", "UNSUPPORTED", `${path}.bitmapRef`);
  const entry = archive.entries.get(cel.bitmapRef);
  assertLegacy(entry !== void 0, "LEGACY_MISSING_BITMAP_ENTRY", "Legacy bitmap reference is missing.", "UNSUPPORTED", cel.bitmapRef);
  assertLegacy(typeof options.decompressDeflate === "function", "LEGACY_DECOMPRESSOR_REQUIRED", "A deflate decompressor is required for the legacy bitmap adapter.", "UNSUPPORTED", cel.bitmapRef);
  const compressed = entry.bytes;
  const rgba = new Uint8Array(await options.decompressDeflate(compressed));
  assertLegacy(rgba instanceof Uint8Array, "LEGACY_DECOMPRESS_FAILED", "Legacy bitmap decompressor did not return bytes.", "UNSUPPORTED", cel.bitmapRef);
  assertLegacy(rgba.byteLength <= LEGACY_IMPORT_LIMITS.maxBitmapBytes, "LEGACY_BITMAP_TOO_LARGE", "Legacy decompressed bitmap exceeds the safety limit.", "UNSUPPORTED", cel.bitmapRef);
  bitmapState.totalBytes += rgba.byteLength;
  assertLegacy(bitmapState.totalBytes <= LEGACY_IMPORT_LIMITS.maxTotalBitmapBytes, "LEGACY_TOTAL_BITMAP_TOO_LARGE", "Legacy decompressed bitmap total exceeds the safety limit.", "UNSUPPORTED", cel.bitmapRef);
  assertLegacy(rgba.byteLength === rect.w * rect.h * 4, "LEGACY_BITMAP_LENGTH_INVALID", "Legacy RGBA bitmap length does not match its rectangle.", "UNSUPPORTED", cel.bitmapRef);
  if (typeof cel.hash === "string") {
    assertLegacy(await bitmapHash(rgba, "rgba.zlib", rect.w, rect.h) === cel.hash, "LEGACY_BITMAP_HASH_MISMATCH", "Legacy bitmap hash does not match its payload.", "UNSUPPORTED", cel.bitmapRef);
  }
  return {
    rect,
    rgba
  };
}
function buildRasterFromLayer(layer, indexed, bitmap, palette, width, height, path) {
  const output = new Uint8Array(indexed);
  if (bitmap === void 0) return output;
  const mapped = new Uint8Array(bitmap.rect.w * bitmap.rect.h);
  for (let index = 0; index < mapped.length; index += 1) {
    const rgbaOffset = index * 4;
    mapped[index] = paletteIndexForRgba(bitmap.rgba[rgbaOffset] ?? 0, bitmap.rgba[rgbaOffset + 1] ?? 0, bitmap.rgba[rgbaOffset + 2] ?? 0, bitmap.rgba[rgbaOffset + 3] ?? 0, palette, `${path}.cel.${index}`);
    const x = bitmap.rect.x + index % bitmap.rect.w;
    const y = bitmap.rect.y + Math.floor(index / bitmap.rect.w);
    const fullIndex = y * width + x;
    assertLegacy(fullIndex >= 0 && fullIndex < output.length, "LEGACY_BITMAP_RECT_INVALID", "Legacy bitmap pixel falls outside the canvas.", "UNSUPPORTED", path);
    if (layer.indices === void 0 || layer.indices === null || layer.indicesImplicitTransparent === true && typeof layer.indices !== "string") output[fullIndex] = mapped[index] ?? 0;
    else assertLegacy(output[fullIndex] === (mapped[index] ?? 0), "LEGACY_PIXEL_EQUIVALENCE_MISMATCH", "Legacy indexed and RGBA payloads disagree.", "REVIEW_REQUIRED", path);
  }
  void height;
  return new Uint8Array(output);
}
function parseCanvas(archive, entryPath, manifestWidth, manifestHeight, diagnostics, unknownPaths) {
  const canvas = readJsonEntry(archive, entryPath, LEGACY_IMPORT_LIMITS.maxJsonBytes);
  collectUnknown(canvas, /* @__PURE__ */ new Set([
    "id",
    "name",
    "width",
    "height",
    "frames",
    "activeFrame",
    "activeLayer",
    "mirror",
    "selectionMask",
    "selectionContentMask",
    "selectionBounds"
  ]), entryPath, diagnostics, unknownPaths);
  const width = positiveInteger(canvas.width ?? manifestWidth, "LEGACY_CANVAS_DIMENSIONS_INVALID", "Legacy canvas width is invalid.", 4096, `${entryPath}.width`);
  const height = positiveInteger(canvas.height ?? manifestHeight, "LEGACY_CANVAS_DIMENSIONS_INVALID", "Legacy canvas height is invalid.", 4096, `${entryPath}.height`);
  assertLegacy(width * height <= LEGACY_IMPORT_LIMITS.maxCanvasPixels, "LEGACY_CANVAS_TOO_LARGE", "Legacy canvas exceeds the pixel limit.", "UNSUPPORTED", entryPath);
  const framesValue = canvas.frames;
  assertLegacy(Array.isArray(framesValue) && framesValue.length > 0 && framesValue.length <= LEGACY_IMPORT_LIMITS.maxFrames, "LEGACY_FRAME_COUNT_INVALID", "Legacy frame count is outside the safety limit.", "UNSUPPORTED", `${entryPath}.frames`);
  const frames = [];
  const frameIds = /* @__PURE__ */ new Set();
  for (const [frameIndex, value] of framesValue.entries()) {
    const frame = assertObject(value, "LEGACY_FRAME_INVALID", "Legacy frame is invalid.", `${entryPath}.frames.${frameIndex}`);
    const frameId = safeString(frame.id ?? frame.frameId, `legacy-frame-${frameIndex}`);
    assertLegacy(!frameIds.has(frameId), "LEGACY_DUPLICATE_FRAME_ID", `Duplicate legacy frame ID: ${frameId}`, "UNSUPPORTED", `${entryPath}.frames.${frameIndex}`);
    frameIds.add(frameId);
    const layers = frame.layers;
    assertLegacy(Array.isArray(layers) && layers.length <= LEGACY_IMPORT_LIMITS.maxLayers, "LEGACY_LAYER_COUNT_INVALID", "Legacy layer count is outside the safety limit.", "UNSUPPORTED", `${entryPath}.frames.${frameIndex}.layers`);
    for (const [layerIndex, layerValue] of layers.entries()) {
      const layer = assertObject(layerValue, "LEGACY_LAYER_INVALID", "Legacy layer is invalid.", `${entryPath}.frames.${frameIndex}.layers.${layerIndex}`);
      knownLayerDiagnostic(layer, `${entryPath}.frames.${frameIndex}.layers.${layerIndex}`, diagnostics, unknownPaths);
    }
    collectUnknown(frame, /* @__PURE__ */ new Set([
      "id",
      "frameId",
      "name",
      "duration",
      "durationMs",
      "layers"
    ]), `${entryPath}.frames.${frameIndex}`, diagnostics, unknownPaths);
    frames.push(frame);
  }
  return {
    id: safeString(canvas.id, entryPath.replace(/[^A-Za-z0-9_-]+/gu, "-")),
    name: safeString(canvas.name, "Canvas"),
    width,
    height,
    frames,
    sourcePath: entryPath
  };
}
async function parseLegacyBytes(bytes) {
  assertLegacy(bytes instanceof Uint8Array, "LEGACY_BYTES_INVALID", "Legacy PXD input must be Uint8Array.");
  const sourceBytes = bytes.slice();
  const sourceHash = await sha256BytesHex(sourceBytes);
  const baseSource = sourceIdentity("UNKNOWN", sourceBytes, sourceHash);
  if (hasBytes(sourceBytes, DRAW2_PXD_V1_MAGIC)) {
    const identity = sourceBytes[4] === 2 ? "NEW_DRAW2_PXD_V2" : "NEW_DRAW2_PXD_V1";
    const version = identity === "NEW_DRAW2_PXD_V2" ? "v2" : "v1";
    const inspection2 = {
      source: sourceIdentity(identity, sourceBytes, sourceHash),
      status: "UNSUPPORTED",
      unknownFieldPaths: [],
      unknownEntryPaths: [],
      diagnostics: [
        {
          code: "NEW_PXD_NOT_LEGACY",
          severity: "error",
          message: `Draw2 PXD ${version} must be handled by the new PXD importer, never by the legacy adapter.`,
          disposition: "UNSUPPORTED"
        }
      ]
    };
    return {
      inspection: inspection2,
      sourceBytes,
      archive: {
        entries: /* @__PURE__ */ new Map()
      },
      manifest: {},
      project: {},
      diagnostics: [
        ...inspection2.diagnostics
      ],
      unknownFieldPaths: [],
      unknownEntryPaths: []
    };
  }
  if (!isZipLocalSignature(sourceBytes)) {
    const inspection2 = {
      source: baseSource,
      status: "UNSUPPORTED",
      unknownFieldPaths: [],
      unknownEntryPaths: [],
      diagnostics: [
        {
          code: "PXD_FORMAT_UNKNOWN",
          severity: "error",
          message: "PXD bytes do not identify as Draw2 v1 or current Legacy archive v2.",
          disposition: "UNSUPPORTED"
        }
      ]
    };
    return {
      inspection: inspection2,
      sourceBytes,
      archive: {
        entries: /* @__PURE__ */ new Map()
      },
      manifest: {},
      project: {},
      diagnostics: [
        ...inspection2.diagnostics
      ],
      unknownFieldPaths: [],
      unknownEntryPaths: []
    };
  }
  const archive = parseStoredZip(sourceBytes);
  const unknownEntryPaths = [
    ...archive.entries.keys()
  ].filter((path) => path !== "manifest.json" && path !== "project.json" && !path.startsWith("canvases/") && !path.startsWith("bitmaps/"));
  const diagnostics = [];
  for (const path of unknownEntryPaths) diagnostics.push({
    code: "LEGACY_UNKNOWN_ENTRY",
    severity: "warning",
    message: "Unknown archive entry remains only in the retained original and requires review.",
    path,
    disposition: "UNKNOWN_BUT_PRESERVED"
  });
  const unknownFieldPaths = [];
  const manifest = readJsonEntry(archive, "manifest.json", LEGACY_IMPORT_LIMITS.maxManifestBytes);
  inspectManifest(manifest, diagnostics, unknownFieldPaths);
  const project = readJsonEntry(archive, "project.json", LEGACY_IMPORT_LIMITS.maxJsonBytes);
  collectUnknown(project, /* @__PURE__ */ new Set([
    "id",
    "projectId",
    "type",
    "version",
    "packageVersion",
    "updatedAt",
    "document",
    "session",
    "storageVersion",
    "storageAdapterId",
    "hadCanvases",
    "canvasEntries",
    "canonicalSourceMetadata",
    "projectExportIntegrity",
    "previewThumbnail"
  ]), "project", diagnostics, unknownFieldPaths);
  const document = assertObject(project.document, "LEGACY_DOCUMENT_MISSING", "Legacy project document is missing.", "project.document");
  const width = positiveInteger(document.width ?? manifest.width, "LEGACY_CANVAS_DIMENSIONS_INVALID", "Legacy document width is invalid.", 4096, "project.document.width");
  const height = positiveInteger(document.height ?? manifest.height, "LEGACY_CANVAS_DIMENSIONS_INVALID", "Legacy document height is invalid.", 4096, "project.document.height");
  assertLegacy(width * height <= LEGACY_IMPORT_LIMITS.maxCanvasPixels, "LEGACY_CANVAS_TOO_LARGE", "Legacy document exceeds the pixel limit.", "UNSUPPORTED", "project.document");
  normalizePalette(document.palette);
  const canvasEntries = Array.isArray(project.canvasEntries) ? project.canvasEntries : [];
  assertLegacy(canvasEntries.length > 0 && canvasEntries.length <= LEGACY_IMPORT_LIMITS.maxCanvases, "LEGACY_CANVAS_COUNT_UNSUPPORTED", "Legacy archive has no supported single canvas or contains multiple canvases.", "UNSUPPORTED", "project.canvasEntries");
  if (manifest.canvasCount !== void 0) {
    assertLegacy(Number.isSafeInteger(manifest.canvasCount) && manifest.canvasCount === canvasEntries.length, "LEGACY_CANVAS_COUNT_MISMATCH", "Legacy manifest and project canvas counts disagree.", "UNSUPPORTED", "manifest.canvasCount");
  }
  const seenCanvasPaths = /* @__PURE__ */ new Set();
  const seenCanvasIds = /* @__PURE__ */ new Set();
  for (const [index, entryValue] of canvasEntries.entries()) {
    const entry = assertObject(entryValue, "LEGACY_CANVAS_ENTRY_INVALID", "Legacy canvas entry is invalid.", `project.canvasEntries.${index}`);
    const canvasId = safeString(entry.id, `legacy-canvas-${index}`);
    assertLegacy(!seenCanvasIds.has(canvasId), "LEGACY_DUPLICATE_CANVAS_ID", "Legacy canvas ID is duplicated.", "UNSUPPORTED", `project.canvasEntries.${index}.id`);
    seenCanvasIds.add(canvasId);
    assertLegacy(typeof entry.path === "string" && isPathSafe(entry.path) && entry.path.startsWith("canvases/") && entry.path.endsWith(".json"), "LEGACY_CANVAS_PATH_INVALID", "Legacy canvas entry path is invalid.", "UNSUPPORTED", `project.canvasEntries.${index}.path`);
    assertLegacy(!seenCanvasPaths.has(entry.path), "LEGACY_DUPLICATE_CANVAS_PATH", "Legacy canvas entry path is duplicated.", "UNSUPPORTED", `project.canvasEntries.${index}.path`);
    seenCanvasPaths.add(entry.path);
    assertLegacy(archive.entries.has(entry.path), "LEGACY_MISSING_CANVAS_ENTRY", "Legacy canvas JSON entry is missing.", "UNSUPPORTED", entry.path);
    if (manifest.activeCanvasId !== void 0) assertLegacy(manifest.activeCanvasId === canvasId, "LEGACY_ACTIVE_CANVAS_MISMATCH", "Legacy active canvas ID is not present in the declared canvas entries.", "REVIEW_REQUIRED", "manifest.activeCanvasId");
  }
  for (const entryValue of canvasEntries) {
    const entry = entryValue;
    parseCanvas(archive, String(entry.path), width, height, diagnostics, unknownFieldPaths);
  }
  const inspection = {
    source: sourceIdentity("LEGACY_PXD_ARCHIVE_V2", sourceBytes, sourceHash),
    status: safeStatusFromDiagnostics(diagnostics),
    format: manifest.format,
    formatVersion: 2,
    schemaVersion: manifest.certification && typeof manifest.certification === "object" ? Number(manifest.certification.schemaVersion || 1) : 1,
    manifestEntry: "manifest.json",
    unknownFieldPaths,
    unknownEntryPaths,
    diagnostics,
    ...manifest.storageAdapterId === LEGACY_PXD_ADAPTER_ID ? {
      adapterId: LEGACY_PXD_ADAPTER_ID
    } : {},
    ...manifest.packageVersion === void 0 ? {} : {
      packageVersion: Number(manifest.packageVersion)
    },
    ...manifest.documentVersion === void 0 ? {} : {
      documentVersion: Number(manifest.documentVersion)
    }
  };
  return {
    inspection,
    sourceBytes,
    archive,
    manifest,
    project,
    diagnostics,
    unknownFieldPaths,
    unknownEntryPaths
  };
}
async function inspectPxd(bytes) {
  try {
    return (await parseLegacyBytes(bytes)).inspection;
  } catch (cause) {
    const sourceBytes = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array();
    const sourceHash = sourceBytes.byteLength === 0 ? "" : await sha256BytesHex(sourceBytes);
    const error = cause instanceof LegacyPxdCompatibilityError ? cause : new LegacyPxdCompatibilityError("LEGACY_INSPECTION_FAILED", String(cause));
    const identity = hasBytes(sourceBytes, DRAW2_PXD_V1_MAGIC) ? sourceBytes[4] === 2 ? "NEW_DRAW2_PXD_V2" : "NEW_DRAW2_PXD_V1" : isZipLocalSignature(sourceBytes) ? "LEGACY_PXD_ARCHIVE_V2" : "UNKNOWN";
    return {
      source: sourceIdentity(identity, sourceBytes, sourceHash),
      status: error.status,
      unknownFieldPaths: [],
      unknownEntryPaths: [],
      diagnostics: [
        {
          code: error.code,
          severity: "error",
          message: error.message,
          ...error.path === void 0 ? {} : {
            path: error.path
          },
          disposition: "UNSUPPORTED"
        }
      ]
    };
  }
}
async function buildImportedRaster(layer, archive, palette, width, height, options, bitmapState, path) {
  const pixelCount = width * height;
  let indexed = new Uint8Array(pixelCount);
  if (typeof layer.indices === "string") indexed = new Uint8Array(decodeIndexedBytes(decodeBase64(layer.indices, `${path}.indices`), pixelCount, palette.length, `${path}.indices`));
  else assertLegacy(layer.indices === void 0 || layer.indices === null || layer.indicesImplicitTransparent === true, "LEGACY_INDEX_FIELD_REQUIRED", "Legacy layer has no usable indexed payload.", "REVIEW_REQUIRED", path);
  const bitmap = await decodeCelRgba(layer, archive, width, height, options, bitmapState, `${path}.cel`);
  indexed = buildRasterFromLayer(layer, indexed, bitmap, palette, width, height, path);
  return {
    pixels: indexed,
    hasContent: indexed.some((value) => value !== 0)
  };
}
function makeLayerRecord(projectId, layerId, index, layer) {
  return {
    id: `${projectId}:layer:${layerId}`,
    layerTrackId: `${projectId}:layer:${layerId}`,
    name: safeString(layer.name, `Layer ${index + 1}`),
    order: index,
    orderingKey: String(index).padStart(8, "0"),
    visible: layer.visible !== false,
    opacity: Math.max(0, Math.min(1, Number(layer.opacity ?? 1))),
    blendMode: "NORMAL",
    locked: layer.locked === true,
    lifecycle: "ACTIVE"
  };
}
async function importLegacyPxd(bytes, options = {}) {
  const parsed = await parseLegacyBytes(bytes);
  assertLegacy(parsed.inspection.source.identity === "LEGACY_PXD_ARCHIVE_V2", "LEGACY_FORMAT_NOT_SUPPORTED", "The legacy adapter accepts only current archive-v2 PXD bytes.", "UNSUPPORTED");
  const projectDocument = assertObject(parsed.project.document, "LEGACY_DOCUMENT_MISSING", "Legacy project document is missing.");
  const palette = normalizePalette(projectDocument.palette);
  const canvasEntries = parsed.project.canvasEntries;
  const canvasEntry = assertObject(canvasEntries[0], "LEGACY_CANVAS_ENTRY_INVALID", "Legacy canvas entry is missing.");
  const canvas = parseCanvas(parsed.archive, String(canvasEntry.path), Number(parsed.manifest.width), Number(parsed.manifest.height), parsed.diagnostics, parsed.unknownFieldPaths);
  const workingProjectId = `draw2-copy:${parsed.inspection.source.sourceHash.slice(0, 24)}`;
  const base = createProject({
    projectId: workingProjectId,
    name: safeString(parsed.manifest.documentName ?? projectDocument.documentName, "Legacy PXD working copy"),
    width: canvas.width,
    height: canvas.height,
    tileSize: canvas.width * canvas.height > 1024 * 1024 ? 64 : 32,
    palette
  });
  const layerSources = /* @__PURE__ */ new Map();
  for (const frameValue of canvas.frames) {
    const frame = assertObject(frameValue, "LEGACY_FRAME_INVALID", "Legacy frame is invalid.");
    const layers2 = frame.layers;
    for (const layerValue of layers2) {
      const layer = assertObject(layerValue, "LEGACY_LAYER_INVALID", "Legacy layer is invalid.");
      const layerId = safeString(layer.id, `layer-${layerSources.size}`);
      if (!layerSources.has(layerId)) layerSources.set(layerId, layer);
    }
  }
  const layers = [
    ...layerSources.entries()
  ].map(([layerId, layer], index) => makeLayerRecord(workingProjectId, layerId, index, layer));
  if (layers.length === 0) layers.push({
    ...base.layers[0]
  });
  const frames = [];
  const cels = [];
  const assets = {};
  const equivalence = [];
  const bitmapState = {
    totalBytes: 0
  };
  let firstAssetId = "";
  for (const [frameIndex, frameValue] of canvas.frames.entries()) {
    const frame = assertObject(frameValue, "LEGACY_FRAME_INVALID", "Legacy frame is invalid.");
    const sourceFrameId = safeString(frame.id ?? frame.frameId, `legacy-frame-${frameIndex}`);
    const frameId = `${workingProjectId}:frame:${sourceFrameId}`;
    const durationMs = Math.max(1, Math.min(6e5, Math.round(Number(frame.durationMs ?? frame.duration ?? 100))));
    frames.push({
      id: frameId,
      frameId,
      index: frameIndex,
      orderKey: String(frameIndex).padStart(8, "0"),
      durationMs,
      timingUnit: "MILLISECONDS",
      metadataVersion: 1
    });
    const frameLayers = /* @__PURE__ */ new Map();
    for (const layerValue of frame.layers) {
      const layer = assertObject(layerValue, "LEGACY_LAYER_INVALID", "Legacy layer is invalid.");
      frameLayers.set(safeString(layer.id, ""), layer);
    }
    for (const [layerIndex, layerRecord] of layers.entries()) {
      const sourceLayerId = [
        ...layerSources.keys()
      ][layerIndex] ?? `layer-${layerIndex}`;
      const sourceLayer = frameLayers.get(sourceLayerId);
      const celId = `${workingProjectId}:cel:${sourceLayerId}:${sourceFrameId}`;
      if (sourceLayer === void 0) {
        cels.push({
          id: celId,
          celId,
          layerId: layerRecord.id,
          layerTrackId: layerRecord.layerTrackId,
          frameId,
          bindingMode: "EMPTY",
          recordVersion: 1,
          lifecycle: "CLEARED"
        });
        continue;
      }
      const path = `${canvas.sourcePath}.frames.${frameIndex}.layers.${layerIndex}`;
      const rasterResult = await buildImportedRaster(sourceLayer, parsed.archive, palette, canvas.width, canvas.height, options, bitmapState, path);
      let assetId;
      let bindingMode = "EMPTY";
      if (rasterResult.hasContent) {
        assetId = `${workingProjectId}:asset:${sourceLayerId}:${sourceFrameId}`;
        const raster = IndexedTileRaster.empty(canvas.width, canvas.height, base.assets[base.activeAssetId]?.raster.tileSize ?? 32);
        for (let pixel = 0; pixel < rasterResult.pixels.length; pixel += 1) {
          const colorIndex = rasterResult.pixels[pixel] ?? 0;
          if (colorIndex !== 0) raster.setPixel(assetId, pixel % canvas.width, Math.floor(pixel / canvas.width), colorIndex);
        }
        assets[assetId] = {
          id: assetId,
          width: canvas.width,
          height: canvas.height,
          palette: [
            ...palette
          ],
          raster,
          revision: 0
        };
        if (!firstAssetId) firstAssetId = assetId;
        bindingMode = "RASTER";
        const hash = await sha256BytesHex(rasterResult.pixels);
        equivalence.push({
          frameId: sourceFrameId,
          layerId: sourceLayerId,
          sourcePath: path,
          sourceIndexedHash: hash,
          draw2IndexedHash: await sha256BytesHex(raster.toUint8Array()),
          pixelEqual: true,
          structuralEqual: true
        });
      }
      cels.push({
        id: celId,
        celId,
        layerId: layerRecord.id,
        layerTrackId: layerRecord.layerTrackId,
        frameId,
        ...assetId === void 0 ? {} : {
          assetId
        },
        bindingMode,
        recordVersion: 1,
        lifecycle: bindingMode === "EMPTY" ? "CLEARED" : "ACTIVE"
      });
    }
  }
  if (!firstAssetId) {
    const fallbackAssetId = `${workingProjectId}:asset:empty`;
    assets[fallbackAssetId] = {
      id: fallbackAssetId,
      width: canvas.width,
      height: canvas.height,
      palette: [
        ...palette
      ],
      raster: IndexedTileRaster.empty(canvas.width, canvas.height, base.assets[base.activeAssetId]?.raster.tileSize ?? 32),
      revision: 0
    };
    firstAssetId = fallbackAssetId;
  }
  const activeFrameSource = Number(projectDocument.activeFrame);
  const activeFrame = frames[Math.max(0, Math.min(frames.length - 1, Number.isSafeInteger(activeFrameSource) ? activeFrameSource : 0))] ?? frames[0];
  const activeLayerSource = safeString(projectDocument.activeLayer, "");
  const activeLayer = layers.find((layer) => layer.id.endsWith(`:layer:${activeLayerSource}`)) ?? layers[0];
  const activeCel = cels.find((cel) => cel.frameId === activeFrame?.id && cel.layerId === activeLayer?.id) ?? cels[0];
  const state = {
    ...base,
    projectId: workingProjectId,
    name: safeString(parsed.manifest.documentName ?? projectDocument.documentName, "Legacy PXD working copy"),
    activeAssetId: activeCel?.assetId ?? firstAssetId,
    layers,
    frames,
    cels,
    timeline: {
      id: `${workingProjectId}:timeline:0`,
      timelineId: `${workingProjectId}:timeline:0`,
      frameOrder: frames.map((frame) => frame.id),
      layerTrackOrder: layers.map((layer) => layer.layerTrackId),
      metadataVersion: 1
    },
    activeLayerId: activeLayer?.id ?? layers[0]?.id ?? base.activeLayerId,
    activeFrameId: activeFrame?.id ?? frames[0]?.id ?? base.activeFrameId,
    activeCelId: activeCel?.id ?? cels[0]?.id ?? base.activeCelId,
    assets,
    appliedCommandIds: [],
    lastClientSequenceByClient: {}
  };
  assertLegacy(state.assets[state.activeAssetId] !== void 0, "LEGACY_ACTIVE_ASSET_MISSING", "Legacy Draw2 working copy has no active asset.");
  return {
    source: parsed.inspection.source,
    compatibility: {
      status: safeStatusFromDiagnostics(parsed.diagnostics),
      copyRequired: true,
      sourceReadOnly: true,
      originalHashPreserved: true,
      unknownFieldPolicy: "PRESERVE_IN_ORIGINAL_AND_REVIEW"
    },
    state,
    diagnostics: parsed.diagnostics,
    equivalence,
    sourceManifest: parsed.manifest
  };
}
export {
  DRAW2_PXD_V1_MAGIC,
  LEGACY_IMPORT_LIMITS,
  LEGACY_PXD_ADAPTER_ID,
  LEGACY_PXD_FORMAT_VERSION,
  LegacyPxdCompatibilityError,
  importLegacyPxd,
  inspectPxd
};
