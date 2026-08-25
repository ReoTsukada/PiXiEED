// src/draw2-tilemap.ts
function cloneDraw2Tilemap(map) {
  const cells = {};
  for (const [key, cell] of Object.entries(map.cells)) cells[key] = {
    ...cell
  };
  return {
    ...map,
    cells
  };
}
function cloneDraw2Tilemaps(tilemaps) {
  const result = {};
  for (const [id, map] of Object.entries(tilemaps ?? {})) {
    result[id] = cloneDraw2Tilemap(map);
  }
  return result;
}

// src/draw2-core.ts
var MAX_INTERPOLATED_STROKE_PIXELS = 65536;
function interpolatePixelLine(from, to) {
  const points = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx - dy;
  while (true) {
    points.push({
      x,
      y
    });
    if (x === to.x && y === to.y) break;
    const twiceError = error * 2;
    if (twiceError > -dy) {
      error -= dy;
      x += stepX;
    }
    if (twiceError < dx) {
      error += dx;
      y += stepY;
    }
    if (points.length > MAX_INTERPOLATED_STROKE_PIXELS) {
      throw new Error("Interpolated Stroke exceeds the bounded pixel budget.");
    }
  }
  return points;
}
function interpolatePixelPath(points) {
  if (points.length === 0) return [];
  const interpolated = [
    {
      x: points[0]?.x ?? 0,
      y: points[0]?.y ?? 0
    }
  ];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === void 0 || to === void 0) continue;
    for (const point of interpolatePixelLine(from, to).slice(1)) {
      if (interpolated.length >= MAX_INTERPOLATED_STROKE_PIXELS) {
        throw new Error("Interpolated Stroke exceeds the bounded pixel budget.");
      }
      const previous = interpolated[interpolated.length - 1];
      if (previous?.x !== point.x || previous.y !== point.y) {
        interpolated.push(point);
      }
    }
  }
  return interpolated;
}
var SampledInstrumentation = class {
  #sampleRate;
  #points = [];
  #random;
  constructor(sampleRate = 1, random = Math.random) {
    if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
      throw new Error("Instrumentation sampleRate must be between 0 and 1.");
    }
    this.#sampleRate = sampleRate;
    this.#random = random;
  }
  record(point) {
    if (this.#random() <= this.#sampleRate) this.#points.push(point);
  }
  get points() {
    return this.#points;
  }
};
var NullInstrumentation = class {
  record(_point) {
  }
};
var NOOP_INSTRUMENTATION = new NullInstrumentation();
function diagnostic(code, message, path) {
  return path === void 0 ? {
    code,
    severity: "error",
    message
  } : {
    code,
    severity: "error",
    message,
    path
  };
}
function stableValue(value) {
  if (value instanceof Uint8Array) {
    return {
      __type: "Uint8Array",
      values: Array.from(value)
    };
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).sort(([left], [right]) => String(left).localeCompare(String(right))).map(([key, entry]) => [
      key,
      stableValue(entry)
    ]);
  }
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  if (value !== null && typeof value === "object") {
    const object = value;
    return Object.fromEntries(Object.keys(object).filter((key) => object[key] !== void 0).sort().map((key) => [
      key,
      stableValue(object[key])
    ]));
  }
  return value;
}
function canonicalJson(value) {
  return JSON.stringify(stableValue(value)) ?? "null";
}
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
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
function cloneProjectStateShared(state) {
  const assets = {};
  for (const [id, asset] of Object.entries(state.assets)) {
    assets[id] = {
      ...asset,
      raster: asset.raster.sharedClone()
    };
  }
  return {
    ...state,
    assets,
    tilemaps: cloneDraw2Tilemaps(state.tilemaps),
    layers: state.layers.map((layer) => ({
      ...layer
    })),
    frames: state.frames.map((frame) => ({
      ...frame
    })),
    cels: state.cels.map((cel) => ({
      ...cel
    })),
    timeline: {
      ...state.timeline,
      frameOrder: [
        ...state.timeline.frameOrder
      ],
      layerTrackOrder: [
        ...state.timeline.layerTrackOrder
      ]
    },
    appliedCommandIds: [
      ...state.appliedCommandIds
    ],
    lastClientSequenceByClient: {
      ...state.lastClientSequenceByClient
    }
  };
}
function cloneStateShared(state) {
  return cloneProjectStateShared(state);
}
function validateEnvelope(state, command) {
  const diagnostics = [];
  if (command.schemaVersion !== 1) {
    diagnostics.push(diagnostic("COMMAND_SCHEMA_UNSUPPORTED", "Unsupported command schema version.", "schemaVersion"));
  }
  if (command.projectId !== state.projectId) {
    diagnostics.push(diagnostic("COMMAND_PROJECT_MISMATCH", "Command project does not match state.", "projectId"));
  }
  if (command.baseStructureEpoch !== state.structureEpoch) {
    diagnostics.push(diagnostic("COMMAND_STRUCTURE_EPOCH_MISMATCH", "Command structure epoch is stale.", "baseStructureEpoch"));
  }
  if (state.appliedCommandIds.includes(command.commandId)) {
    diagnostics.push(diagnostic("COMMAND_DUPLICATE", "Command was already applied.", "commandId"));
  }
  const expectedSequence = (state.lastClientSequenceByClient[command.clientId] ?? 0) + 1;
  if (command.clientSequence !== expectedSequence) {
    diagnostics.push(diagnostic("COMMAND_CLIENT_SEQUENCE_GAP", `Expected client sequence ${expectedSequence}.`, "clientSequence"));
  }
  if (!command.commandId || !command.projectId || !command.assetId || !command.actorId || !command.clientId) {
    diagnostics.push(diagnostic("COMMAND_REQUIRED_FIELD", "Command identity fields are required."));
  }
  if (!Number.isSafeInteger(command.clientSequence) || command.clientSequence < 1) {
    diagnostics.push(diagnostic("COMMAND_CLIENT_SEQUENCE_INVALID", "clientSequence must be a positive safe integer.", "clientSequence"));
  }
  if (!Number.isFinite(command.createdAtMonotonicMs) || command.createdAtMonotonicMs < 0) {
    diagnostics.push(diagnostic("COMMAND_MONOTONIC_TIME_INVALID", "createdAtMonotonicMs must be finite and non-negative.", "createdAtMonotonicMs"));
  }
  return diagnostics;
}
function validatePayload(state, command) {
  const asset = state.assets[command.assetId];
  if (asset === void 0) {
    return [
      diagnostic("RASTER_ASSET_NOT_FOUND", "Raster asset was not found.", "assetId")
    ];
  }
  const diagnostics = [];
  if (command.commandType === "palette.appendColor") {
    if (asset.palette.length >= 256) {
      diagnostics.push(diagnostic("PALETTE_FULL", "Palette cannot contain more than 256 entries.", "payload.color"));
    }
    if (!Number.isSafeInteger(command.payload.color) || command.payload.color < 0 || command.payload.color > 4294967295) {
      diagnostics.push(diagnostic("PALETTE_COLOR_INVALID", "Palette color must be a uint32 value.", "payload.color"));
    }
    return diagnostics;
  }
  if (command.commandType === "palette.setColor") {
    if (!Number.isSafeInteger(command.payload.paletteIndex) || command.payload.paletteIndex < 1 || command.payload.paletteIndex >= asset.palette.length) {
      diagnostics.push(diagnostic("PALETTE_INDEX_INVALID", "paletteIndex must reference an existing non-transparent palette entry.", "payload.paletteIndex"));
    }
    if (!Number.isSafeInteger(command.payload.color) || command.payload.color < 0 || command.payload.color > 4294967295) {
      diagnostics.push(diagnostic("PALETTE_COLOR_INVALID", "Palette color must be a uint32 value.", "payload.color"));
    }
    return diagnostics;
  }
  if (command.commandType === "raster.fill") {
    const { seedX, seedY, colorIndex, maxPixels } = command.payload;
    if (!Number.isSafeInteger(seedX) || seedX < 0 || seedX >= asset.width) {
      diagnostics.push(diagnostic("FILL_SEED_X_OUT_OF_BOUNDS", "Fill seed x is outside the raster.", "payload.seedX"));
    }
    if (!Number.isSafeInteger(seedY) || seedY < 0 || seedY >= asset.height) {
      diagnostics.push(diagnostic("FILL_SEED_Y_OUT_OF_BOUNDS", "Fill seed y is outside the raster.", "payload.seedY"));
    }
    if (!Number.isSafeInteger(maxPixels) || maxPixels < 1 || maxPixels > 1048576) {
      diagnostics.push(diagnostic("FILL_PIXEL_LIMIT_INVALID", "maxPixels must be between 1 and 1048576.", "payload.maxPixels"));
    }
    if (!Number.isSafeInteger(colorIndex) || colorIndex < 0 || colorIndex > 255 || colorIndex >= asset.palette.length) {
      diagnostics.push(diagnostic("RASTER_COLOR_INDEX_INVALID", "colorIndex must reference palette index 0..255.", "payload.colorIndex"));
    }
    return diagnostics;
  }
  const points = command.commandType === "raster.setPixel" ? [
    command.payload
  ] : command.commandType === "raster.strokeCommit" ? command.payload.points : command.commandType === "raster.writeSet" ? command.payload.writes : [];
  if (command.commandType === "raster.strokeCommit" && (points.length < 1 || points.length > MAX_INTERPOLATED_STROKE_PIXELS)) {
    diagnostics.push(diagnostic("STROKE_POINT_COUNT_INVALID", `Stroke point count must be between 1 and ${MAX_INTERPOLATED_STROKE_PIXELS}.`, "payload.points"));
  }
  if (command.commandType === "raster.strokeCommit" && diagnostics.length === 0) {
    try {
      interpolatePixelPath(command.payload.points);
    } catch (cause) {
      diagnostics.push(diagnostic("STROKE_POINT_COUNT_INVALID", cause instanceof Error ? cause.message : "Stroke interpolation exceeded its bounded pixel budget.", "payload.points"));
    }
  }
  if (command.commandType === "raster.writeSet") {
    if (command.payload.writes.length < 1 || command.payload.writes.length > 1048576) {
      diagnostics.push(diagnostic("WRITE_SET_COUNT_INVALID", "Write set must contain between 1 and 1048576 writes.", "payload.writes"));
    }
    for (const write of command.payload.writes) {
      if (!Number.isSafeInteger(write.colorIndex) || write.colorIndex < 0 || write.colorIndex > 255 || write.colorIndex >= asset.palette.length) {
        diagnostics.push(diagnostic("RASTER_COLOR_INDEX_INVALID", "colorIndex must reference palette index 0..255.", "payload.writes.colorIndex"));
      }
    }
  } else {
    const colorIndex = command.payload.colorIndex;
    if (!Number.isSafeInteger(colorIndex) || colorIndex < 0 || colorIndex > 255 || colorIndex >= asset.palette.length) {
      diagnostics.push(diagnostic("RASTER_COLOR_INDEX_INVALID", "colorIndex must reference palette index 0..255.", "payload.colorIndex"));
    }
  }
  for (const point of points) {
    if (!Number.isSafeInteger(point.x) || point.x < 0 || point.x >= asset.width) {
      diagnostics.push(diagnostic("RASTER_X_OUT_OF_BOUNDS", "x is outside the raster.", "payload.x"));
    }
    if (!Number.isSafeInteger(point.y) || point.y < 0 || point.y >= asset.height) {
      diagnostics.push(diagnostic("RASTER_Y_OUT_OF_BOUNDS", "y is outside the raster.", "payload.y"));
    }
  }
  return diagnostics;
}
function regionFromPoints(assetId, points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    assetId,
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX + 1,
    height: Math.max(...ys) - minY + 1
  };
}
function fullRegion(asset) {
  return {
    assetId: asset.id,
    x: 0,
    y: 0,
    width: asset.width,
    height: asset.height
  };
}
function fillPlan(asset, payload, options) {
  const targetColor = asset.raster.getPixel(payload.seedX, payload.seedY);
  if (targetColor === payload.colorIndex) {
    return {
      points: [],
      visitedCount: 1
    };
  }
  const queue = [
    {
      x: payload.seedX,
      y: payload.seedY
    }
  ];
  const visited = /* @__PURE__ */ new Set();
  const points = [];
  let cursor = 0;
  while (cursor < queue.length) {
    if (options.cancelRequested?.() === true) {
      return [
        diagnostic("FILL_CANCELLED", "Fill was cancelled before canonical mutation.", "payload")
      ];
    }
    const point = queue[cursor];
    cursor += 1;
    if (point === void 0) continue;
    const key = point.y * asset.width + point.x;
    if (visited.has(key)) continue;
    visited.add(key);
    if (asset.raster.getPixel(point.x, point.y) !== targetColor) continue;
    if (points.length >= payload.maxPixels) {
      return [
        diagnostic("FILL_PIXEL_LIMIT_EXCEEDED", "Fill exceeded its bounded pixel budget.", "payload.maxPixels")
      ];
    }
    points.push(point);
    if (point.x > 0) queue.push({
      x: point.x - 1,
      y: point.y
    });
    if (point.x + 1 < asset.width) queue.push({
      x: point.x + 1,
      y: point.y
    });
    if (point.y > 0) queue.push({
      x: point.x,
      y: point.y - 1
    });
    if (point.y + 1 < asset.height) queue.push({
      x: point.x,
      y: point.y + 1
    });
  }
  return {
    points,
    visitedCount: visited.size
  };
}
var EditorCore = class {
  #state;
  #clock;
  #instrumentation;
  constructor(state, options = {}) {
    this.#state = state;
    this.#clock = options.clock ?? {
      now: () => performance.now()
    };
    this.#instrumentation = options.instrumentation ?? NOOP_INSTRUMENTATION;
  }
  get state() {
    return this.#state;
  }
  async execute(command, options = {}) {
    const validationStarted = this.#clock.now();
    const envelopeDiagnostics = validateEnvelope(this.#state, command);
    const payloadDiagnostics = envelopeDiagnostics.length === 0 ? validatePayload(this.#state, command) : [];
    this.#instrumentation.record({
      name: "command.validate",
      durationMs: this.#clock.now() - validationStarted
    });
    const diagnostics = [
      ...envelopeDiagnostics,
      ...payloadDiagnostics
    ];
    if (diagnostics.length > 0) {
      return {
        ok: false,
        state: this.#state,
        diagnostics
      };
    }
    const sourceAsset = this.#state.assets[command.assetId];
    if (sourceAsset === void 0) {
      return {
        ok: false,
        state: this.#state,
        diagnostics: [
          diagnostic("RASTER_ASSET_NOT_FOUND", "Raster asset was not found.")
        ]
      };
    }
    let points = [];
    let fillVisitedCount = 0;
    if (command.commandType === "raster.setPixel") points = [
      command.payload
    ];
    else if (command.commandType === "raster.strokeCommit") {
      points = interpolatePixelPath(command.payload.points);
    } else if (command.commandType === "raster.writeSet") {
      points = command.payload.writes;
    } else if (command.commandType === "raster.fill") {
      const fillStarted = this.#clock.now();
      const planned = fillPlan(sourceAsset, command.payload, options);
      this.#instrumentation.record({
        name: "fill.scan",
        durationMs: this.#clock.now() - fillStarted,
        detail: {
          visitedCount: Array.isArray(planned) ? 0 : planned.visitedCount
        }
      });
      if (Array.isArray(planned)) {
        return {
          ok: false,
          state: this.#state,
          diagnostics: planned
        };
      }
      points = planned.points;
      fillVisitedCount = planned.visitedCount;
    }
    const nextState = cloneStateShared(this.#state);
    const asset = nextState.assets[command.assetId];
    if (asset === void 0) {
      return {
        ok: false,
        state: this.#state,
        diagnostics: [
          diagnostic("RASTER_ASSET_NOT_FOUND", "Raster asset was not found.")
        ]
      };
    }
    const dirtyTiles = /* @__PURE__ */ new Map();
    const touchedTileKeys = /* @__PURE__ */ new Set();
    let copiedBytes = 0;
    let cowSplitCount = 0;
    const commitStarted = this.#clock.now();
    if (command.commandType !== "palette.setColor" && command.commandType !== "palette.appendColor") {
      const writeColors = command.commandType === "raster.writeSet" ? new Map(command.payload.writes.map((write) => [
        `${write.x}:${write.y}`,
        write.colorIndex
      ])) : void 0;
      for (const point of points) {
        const tileX = Math.floor(point.x / asset.raster.tileSize);
        const tileY = Math.floor(point.y / asset.raster.tileSize);
        touchedTileKeys.add(`${asset.id}:${tileX}:${tileY}`);
        const colorIndex = writeColors?.get(`${point.x}:${point.y}`) ?? (command.commandType === "raster.writeSet" ? 0 : command.payload.colorIndex);
        const mutation = asset.raster.setPixel(asset.id, point.x, point.y, colorIndex);
        if (mutation.changed) {
          dirtyTiles.set(mutation.tile.tileKey, mutation.tile);
          copiedBytes += mutation.copiedBytes;
          if (mutation.cowSplit) cowSplitCount += 1;
        }
      }
    }
    const nextAsset = command.commandType === "palette.setColor" ? {
      ...asset,
      palette: asset.palette.map((color, index) => index === command.payload.paletteIndex ? command.payload.color : color),
      revision: asset.revision + 1
    } : command.commandType === "palette.appendColor" ? {
      ...asset,
      palette: [
        ...asset.palette,
        command.payload.color
      ],
      revision: asset.revision + 1
    } : {
      ...asset,
      revision: asset.revision + (dirtyTiles.size > 0 ? 1 : 0)
    };
    nextState.assets = {
      ...nextState.assets,
      [asset.id]: nextAsset
    };
    nextState.appliedCommandIds = [
      ...nextState.appliedCommandIds,
      command.commandId
    ];
    nextState.lastClientSequenceByClient = {
      ...nextState.lastClientSequenceByClient,
      [command.clientId]: command.clientSequence
    };
    this.#instrumentation.record({
      name: "command.commit",
      durationMs: this.#clock.now() - commitStarted
    });
    if (cowSplitCount > 0) {
      this.#instrumentation.record({
        name: "raster.cowSplit",
        durationMs: 0,
        detail: {
          count: cowSplitCount,
          copiedBytes
        }
      });
    }
    this.#instrumentation.record({
      name: "dirty.tileCalculation",
      durationMs: 0,
      detail: {
        tileCount: dirtyTiles.size
      }
    });
    const payload = command.commandType === "raster.setPixel" ? {
      ...command.payload,
      previousColorIndex: this.#state.assets[asset.id]?.raster.getPixel(command.payload.x, command.payload.y) ?? 0
    } : command.commandType === "raster.fill" ? {
      ...command.payload,
      filledPixelCount: points.length,
      visitedCount: fillVisitedCount
    } : command.commandType === "palette.setColor" ? {
      ...command.payload,
      previousColor: this.#state.assets[asset.id]?.palette[command.payload.paletteIndex] ?? 0
    } : command.commandType === "palette.appendColor" ? {
      ...command.payload,
      paletteIndex: nextAsset.palette.length - 1
    } : {
      ...command.payload,
      dirtyTileCount: dirtyTiles.size
    };
    const operationBody = {
      operationType: command.commandType,
      schemaVersion: 1,
      commandId: command.commandId,
      projectId: command.projectId,
      assetId: command.assetId,
      actorId: command.actorId,
      clientId: command.clientId,
      clientSequence: command.clientSequence,
      structureEpoch: nextState.structureEpoch,
      payload
    };
    const operation = {
      operationId: `op_${await sha256Hex(operationBody)}`,
      ...operationBody
    };
    this.#state = nextState;
    const dirtyRegions = command.commandType === "palette.setColor" || command.commandType === "palette.appendColor" ? [
      fullRegion(asset)
    ] : dirtyTiles.size === 0 ? [] : [
      regionFromPoints(asset.id, points)
    ];
    const strokeMetrics = command.commandType === "raster.strokeCommit" ? {
      inputPointCount: command.payload.points.length,
      interpolatedPixelCount: points.length,
      touchedTileCount: touchedTileKeys.size,
      dirtyTileCount: dirtyTiles.size,
      dirtyRegionCount: dirtyRegions.length,
      unrelatedFrameCount: Math.max(0, this.#state.frames.length - 1),
      unrelatedLayerCount: Math.max(0, this.#state.layers.length - 1)
    } : void 0;
    return {
      ok: true,
      state: nextState,
      result: {
        operation,
        dirtyTiles: [
          ...dirtyTiles.values()
        ].sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
        dirtyRegions,
        memory: nextAsset.raster.memoryMetrics(),
        copiedBytes,
        cowSplitCount,
        ...strokeMetrics === void 0 ? {} : {
          strokeMetrics
        },
        trace: {
          commandValidationCount: 1,
          commandCommitCount: 1,
          affectedLayerCount: 1,
          affectedFrameCount: 1,
          fullRasterCloneCount: 0,
          fullTimelineRebuildCount: 0,
          wholeProjectSerializationCount: 0
        },
        instrumentation: this.#instrumentation instanceof SampledInstrumentation ? this.#instrumentation.points : []
      }
    };
  }
};
var ReferenceRenderer = class {
  backendId = "reference-indexed";
  async render(request) {
    const asset = request.state.assets[request.assetId];
    if (asset === void 0) throw new Error("Renderer asset was not found.");
    const dirtyRegions = request.dirtyRegions ?? [];
    if (request.mode === "DIRTY_REGIONS") {
      let preparationPixelCount = 0;
      let implicitTransparentPixelCount = 0;
      for (const region of dirtyRegions) {
        const snapshot = asset.raster.readRegion(region.x, region.y, region.width, region.height);
        preparationPixelCount += snapshot.pixels.length;
        implicitTransparentPixelCount += snapshot.implicitTransparentPixelCount;
      }
      return {
        backendId: this.backendId,
        hashScope: "NOT_COMPUTED",
        dirtyTileCount: request.dirtyTiles.length,
        preparationPixelCount,
        presentPixelCount: preparationPixelCount,
        implicitTransparentPixelCount,
        fullRefresh: false,
        fallbackUsed: false
      };
    }
    const pixels = asset.raster.toUint8Array();
    return {
      backendId: this.backendId,
      canonicalPixelHash: await sha256Hex(pixels),
      hashScope: "FULL_RASTER",
      dirtyTileCount: request.dirtyTiles.length,
      preparationPixelCount: pixels.length,
      presentPixelCount: pixels.length,
      implicitTransparentPixelCount: 0,
      fullRefresh: true,
      fallbackUsed: false
    };
  }
};

// src/draw2-reference-benchmark.ts
var REFERENCE_SAMPLE_COUNT = 40;
function distribution(values) {
  if (values.length < 1) throw new Error("A benchmark distribution requires one sample.");
  const sorted = [
    ...values
  ].sort((left, right) => left - right);
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return {
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted[sorted.length - 1] ?? 0,
    sampleCount: values.length
  };
}
function memorySnapshot(metrics) {
  return {
    ...metrics
  };
}
function setPixelCommand(state, sequence, x, y, colorIndex = 1) {
  return {
    commandId: `wp110-command-${state.projectId}-${sequence}`,
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "wp110-benchmark-actor",
    clientId: "wp110-benchmark-client",
    clientSequence: sequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: sequence,
    payload: {
      x,
      y,
      colorIndex
    }
  };
}
function strokeCommand(state, sequence, points) {
  return {
    commandId: `wp110-stroke-${state.projectId}-${sequence}`,
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "wp110-benchmark-actor",
    clientId: "wp110-benchmark-client",
    clientSequence: sequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: sequence,
    payload: {
      points,
      colorIndex: 1
    }
  };
}
function ensureSuccess(result) {
  if (!result.ok) throw new Error(result.diagnostics.map((item) => item.code).join(","));
  return result;
}
async function measureSinglePixel(options, width, height, fixture) {
  const iterations = options.iterations ?? REFERENCE_SAMPLE_COUNT;
  const inputToVisible = [];
  const validation = [];
  const commit = [];
  let representative;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const state = createProject({
      projectId: `wp110-${fixture}-${iteration}`,
      width,
      height,
      tileSize: 32
    });
    const before2 = memorySnapshot(state.assets[state.activeAssetId]?.raster.memoryMetrics() ?? {
      logicalRasterBytes: width * height,
      allocatedTileBytes: 0,
      sharedTileBytes: 0,
      tileCount: 0,
      implicitTransparentTileCount: 0,
      cowSplitCount: 0,
      copiedBytes: 0
    });
    const instrumentation = new class {
      points = [];
      record(point) {
        this.points.push(point);
      }
    }();
    const core = new EditorCore(state, {
      instrumentation
    });
    const x = iteration % Math.max(1, Math.min(width, 32));
    const y = Math.floor(iteration / Math.max(1, Math.min(width, 32))) % Math.max(1, Math.min(height, 32));
    const command = setPixelCommand(state, 1, x, y);
    const started = performance.now();
    const executed = ensureSuccess(await core.execute(command));
    const rendered = await new ReferenceRenderer().render({
      state: executed.state,
      assetId: state.activeAssetId,
      dirtyTiles: executed.result.dirtyTiles,
      dirtyRegions: executed.result.dirtyRegions,
      mode: "DIRTY_REGIONS"
    });
    if (options.present !== void 0) await options.present(executed.state, state.activeAssetId, executed.result.dirtyRegions);
    inputToVisible.push(performance.now() - started);
    validation.push(instrumentation.points.find((point) => point.name === "command.validate")?.durationMs ?? 0);
    commit.push(instrumentation.points.find((point) => point.name === "command.commit")?.durationMs ?? 0);
    const after2 = memorySnapshot(executed.result.memory);
    representative ??= {
      result: executed.result,
      renderer: rendered,
      before: before2,
      after: after2
    };
  }
  if (representative === void 0) throw new Error("Single pixel benchmark did not produce a sample.");
  const { result, renderer, before, after } = representative;
  const recordEnvironment = height === 256 ? {
    ...options.environment,
    deviceClass: "desktop-simulated-mobile-fixture",
    surface: "DESKTOP_SIMULATED_MOBILE_FIXTURE"
  } : options.environment;
  const dirtyRegionArea = result.dirtyRegions.reduce((total, region) => total + region.width * region.height, 0);
  return {
    benchmarkId: `WP110_REFERENCE_SINGLE_PIXEL_${width}X${height}`,
    projectFixture: fixture,
    environment: recordEnvironment,
    iterations,
    inputToVisibleMs: distribution(inputToVisible),
    commandValidationMs: distribution(validation),
    commandCommitMs: distribution(commit),
    trace: {
      commandValidationCount: result.trace.commandValidationCount,
      commandCommitCount: result.trace.commandCommitCount,
      touchedTileCount: result.dirtyTiles.length,
      cowSplitCount: result.cowSplitCount,
      copiedBytes: result.copiedBytes,
      dirtyTileCount: result.dirtyTiles.length,
      dirtyRegionArea,
      affectedLayerCount: result.trace.affectedLayerCount,
      affectedFrameCount: result.trace.affectedFrameCount,
      rendererPreparationArea: renderer.preparationPixelCount,
      presentArea: renderer.presentPixelCount,
      canonicalRasterAllocationDelta: after.allocatedTileBytes - before.allocatedTileBytes,
      fullRasterCloneCount: result.trace.fullRasterCloneCount,
      fullTimelineRebuildCount: result.trace.fullTimelineRebuildCount,
      wholeProjectSerializationCount: result.trace.wholeProjectSerializationCount
    },
    memory: {
      before,
      after,
      deltaAllocatedTileBytes: after.allocatedTileBytes - before.allocatedTileBytes,
      componentCategories: {
        logicalRasterBytes: after.logicalRasterBytes,
        canonicalRasterBytes: after.allocatedTileBytes,
        tileMetadataBytes: null,
        sharedCOWBytes: after.sharedTileBytes,
        cowSplitBytes: result.copiedBytes,
        rendererCacheBytes: 0,
        journalBytes: 0,
        workerTransferBytes: 0,
        temporaryOperationBytes: new TextEncoder().encode(canonicalJson(result.operation)).byteLength,
        opfsCacheBytes: 0
      }
    },
    longTasks: options.longTasks ?? {
      available: false,
      count: 0,
      totalMs: 0,
      maxMs: 0,
      note: "Long Task observer not supplied."
    },
    status: "UNTESTED",
    statusReason: "Reference measurements are recorded, but formal p95/device gates are not evaluated by this checkpoint."
  };
}
async function measureDeterminism() {
  const stateA = createProject({
    projectId: "wp110-determinism",
    width: 128,
    height: 128,
    tileSize: 32
  });
  const stateB = createProject({
    projectId: "wp110-determinism",
    width: 128,
    height: 128,
    tileSize: 32
  });
  const coreA = new EditorCore(stateA);
  const coreB = new EditorCore(stateB);
  const commands = [
    setPixelCommand(stateA, 1, 1, 1, 1),
    setPixelCommand(stateA, 2, 2, 1, 2),
    strokeCommand(stateA, 3, [
      {
        x: 3,
        y: 3
      },
      {
        x: 4,
        y: 3
      },
      {
        x: 5,
        y: 3
      }
    ])
  ];
  const resultsA = [];
  const resultsB = [];
  for (const command of commands) {
    let commandB;
    if (command.commandType === "raster.setPixel") commandB = {
      ...command,
      payload: {
        ...command.payload
      }
    };
    else if (command.commandType === "raster.strokeCommit") commandB = {
      ...command,
      payload: {
        ...command.payload,
        points: [
          ...command.payload.points
        ]
      }
    };
    else throw new Error("Determinism fixture contains an unsupported command.");
    const resultA = ensureSuccess(await coreA.execute(command));
    const resultB = ensureSuccess(await coreB.execute(commandB));
    resultsA.push({
      operation: resultA.result.operation,
      memory: resultA.result.memory,
      trace: resultA.result.trace
    });
    resultsB.push({
      operation: resultB.result.operation,
      memory: resultB.result.memory,
      trace: resultB.result.trace
    });
  }
  const assetA = coreA.state.assets[coreA.state.activeAssetId];
  const assetB = coreB.state.assets[coreB.state.activeAssetId];
  if (assetA === void 0 || assetB === void 0) throw new Error("Determinism asset missing.");
  const canonicalPixelHashA = await sha256Hex(assetA.raster.toUint8Array());
  const canonicalPixelHashB = await sha256Hex(assetB.raster.toUint8Array());
  const structureA = {
    schemaVersion: coreA.state.schemaVersion,
    structureEpoch: coreA.state.structureEpoch,
    assetId: assetA.id,
    revision: assetA.revision,
    palette: assetA.palette
  };
  const structureB = {
    schemaVersion: coreB.state.schemaVersion,
    structureEpoch: coreB.state.structureEpoch,
    assetId: assetB.id,
    revision: assetB.revision,
    palette: assetB.palette
  };
  const commandResultHashA = await sha256Hex(resultsA);
  const commandResultHashB = await sha256Hex(resultsB);
  const dirtyResultHashA = await sha256Hex(resultsA.map((entry) => entry.trace));
  const dirtyResultHashB = await sha256Hex(resultsB.map((entry) => entry.trace));
  const structureHashA = await sha256Hex(structureA);
  const structureHashB = await sha256Hex(structureB);
  return {
    benchmarkId: "WP110_REFERENCE_DETERMINISM",
    commandCount: commands.length,
    canonicalPixelHashA,
    canonicalPixelHashB,
    structureHashA,
    structureHashB,
    commandResultHashA,
    commandResultHashB,
    dirtyResultHashA,
    dirtyResultHashB,
    matched: canonicalPixelHashA === canonicalPixelHashB && structureHashA === structureHashB && commandResultHashA === commandResultHashB && dirtyResultHashA === dirtyResultHashB,
    status: "MEASURED_REFERENCE"
  };
}
async function measureCow(tileSize) {
  const initial = createProject({
    projectId: `wp110-cow-${tileSize}`,
    width: 128,
    height: 128,
    tileSize
  });
  const first = ensureSuccess(await new EditorCore(initial).execute(setPixelCommand(initial, 1, 4, 4, 1)));
  const frameA = first.state;
  const sourceAsset = frameA.assets[frameA.activeAssetId];
  if (sourceAsset === void 0) throw new Error("COW source asset missing.");
  const sourceGoldenHash = await sha256Hex(sourceAsset.raster.toUint8Array());
  const sharedRaster = sourceAsset.raster.sharedClone();
  const sharedState = {
    ...frameA,
    assets: {
      ...frameA.assets,
      [frameA.activeAssetId]: {
        ...sourceAsset,
        raster: sharedRaster
      }
    }
  };
  const sharedBytesBeforeEdit = sharedRaster.memoryMetrics().sharedTileBytes;
  const second = ensureSuccess(await new EditorCore(sharedState).execute(setPixelCommand(sharedState, 2, 5, 4, 2)));
  const duplicateAsset = second.state.assets[second.state.activeAssetId];
  if (duplicateAsset === void 0) throw new Error("COW duplicate asset missing.");
  const duplicateGoldenHash = await sha256Hex(duplicateAsset.raster.toUint8Array());
  const sourceUnchanged = await sha256Hex(sourceAsset.raster.toUint8Array()) === sourceGoldenHash && sourceAsset.raster.getPixel(5, 4) === 0;
  return {
    benchmarkId: `WP110_REFERENCE_COW_${tileSize}`,
    projectFixture: "FRAME_DUPLICATE_SYNTHETIC",
    tileSize,
    sourceGoldenHash,
    duplicateGoldenHash,
    sourceUnchanged,
    duplicateChanged: duplicateGoldenHash !== sourceGoldenHash && duplicateAsset.raster.getPixel(5, 4) === 2,
    sharedBytesBeforeEdit,
    sharedBytesAfterEdit: second.result.memory.sharedTileBytes,
    cowSplitCount: second.result.cowSplitCount,
    copiedBytes: second.result.copiedBytes,
    expectedCopiedBytes: tileSize * tileSize,
    status: "UNTESTED",
    statusReason: "COW correctness is measured; formal duplicate latency gate is not evaluated here."
  };
}
async function measureSparse(tileSize) {
  const width = 1024;
  const height = 1024;
  const sparse = createProject({
    projectId: `wp110-sparse-${tileSize}`,
    width,
    height,
    tileSize
  });
  const sparseResult = ensureSuccess(await new EditorCore(sparse).execute(setPixelCommand(sparse, 1, 1, 1)));
  const tileDense = createProject({
    projectId: `wp110-dense-${tileSize}`,
    width,
    height,
    tileSize
  });
  const tileColumns = Math.ceil(width / tileSize);
  const tileRows = Math.ceil(height / tileSize);
  const denseCore = new EditorCore(tileDense);
  for (let tileY = 0; tileY < tileRows; tileY += 1) {
    for (let tileX = 0; tileX < tileColumns; tileX += 1) {
      const sequence = tileY * tileColumns + tileX + 1;
      ensureSuccess(await denseCore.execute(setPixelCommand(tileDense, sequence, tileX * tileSize, tileY * tileSize)));
    }
  }
  const sparseAsset = sparseResult.state.assets[sparseResult.state.activeAssetId];
  const denseAsset = denseCore.state.assets[denseCore.state.activeAssetId];
  if (sparseAsset === void 0 || denseAsset === void 0) throw new Error("Sparse fixture asset missing.");
  return {
    benchmarkId: `WP110_REFERENCE_SPARSE_${tileSize}`,
    canvas: "1024x1024",
    tileSize,
    sparse: memorySnapshot(sparseAsset.raster.memoryMetrics()),
    tileDense: memorySnapshot(denseAsset.raster.memoryMetrics()),
    logicalCanvasBytes: width * height,
    status: "UNTESTED",
    statusReason: "Sparse allocation is measured; dense fixture is tile-dense (one pixel per tile), not a full pixel fill."
  };
}
async function measureTileWorkload(workload, tileSize, iterations) {
  if (workload === "fill" || workload === "composite") return {
    workload,
    tileSize,
    status: "UNTESTED",
    reason: "WP-110 feature is not implemented; fixture is reserved without a fabricated measurement.",
    iterations
  };
  const latency = [];
  const touchedTiles = [];
  const copiedBytes = [];
  const allocatedTileBytes = [];
  const allocationCount = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const state = createProject({
      projectId: `wp110-tile-${workload}-${tileSize}-${iteration}`,
      width: 512,
      height: 512,
      tileSize
    });
    const core = new EditorCore(state);
    const started = performance.now();
    let executed;
    if (workload === "single-pixel") {
      executed = ensureSuccess(await core.execute(setPixelCommand(state, 1, 1, 1)));
    } else if (workload === "short-stroke") {
      executed = ensureSuccess(await core.execute(strokeCommand(state, 1, [
        {
          x: 1,
          y: 1
        },
        {
          x: 2,
          y: 1
        },
        {
          x: 3,
          y: 1
        },
        {
          x: 4,
          y: 1
        },
        {
          x: 5,
          y: 1
        }
      ])));
    } else if (workload === "long-stroke") {
      executed = ensureSuccess(await core.execute(strokeCommand(state, 1, Array.from({
        length: 256
      }, (_, index) => ({
        x: index,
        y: 10
      })))));
    } else {
      const first = ensureSuccess(await core.execute(setPixelCommand(state, 1, 1, 1)));
      const duplicateCore = new EditorCore(first.state);
      executed = ensureSuccess(await duplicateCore.execute(setPixelCommand(first.state, 2, 2, 1, 2)));
    }
    const rendered = await new ReferenceRenderer().render({
      state: executed.state,
      assetId: state.activeAssetId,
      dirtyTiles: executed.result.dirtyTiles,
      dirtyRegions: executed.result.dirtyRegions,
      mode: "DIRTY_REGIONS"
    });
    latency.push(performance.now() - started);
    touchedTiles.push(executed.result.dirtyTiles.length);
    copiedBytes.push(executed.result.copiedBytes);
    allocatedTileBytes.push(executed.result.memory.allocatedTileBytes + rendered.preparationPixelCount * 0);
    allocationCount.push(executed.result.memory.tileCount);
  }
  return {
    workload,
    tileSize,
    status: "MEASURED_REFERENCE",
    iterations,
    latencyMs: distribution(latency),
    touchedTileCount: distribution(touchedTiles),
    copiedBytes: distribution(copiedBytes),
    allocatedTileBytes: distribution(allocatedTileBytes),
    allocationCount: distribution(allocationCount),
    metadataOverheadBytes: null
  };
}
async function runReferenceBenchmark(options) {
  const iterations = options.iterations ?? REFERENCE_SAMPLE_COUNT;
  const singlePixel = [
    await measureSinglePixel(options, 512, 512, "PROJECT_B_DESKTOP_REFERENCE_CORE_SLICE"),
    await measureSinglePixel(options, 256, 256, "PROJECT_A_MOBILE_REFERENCE_CORE_SLICE")
  ];
  const cow = [
    await measureCow(32),
    await measureCow(64)
  ];
  const sparse = [
    await measureSparse(32),
    await measureSparse(64)
  ];
  const determinism = await measureDeterminism();
  const tileComparison = [];
  for (const tileSize of [
    32,
    64
  ]) {
    for (const workload of [
      "single-pixel",
      "short-stroke",
      "long-stroke",
      "duplicate-cow",
      "fill",
      "composite"
    ]) {
      tileComparison.push(await measureTileWorkload(workload, tileSize, Math.min(iterations, REFERENCE_SAMPLE_COUNT)));
    }
  }
  return {
    schemaVersion: 1,
    benchmarkId: "WP110_REFERENCE_PERFORMANCE_CHECKPOINT",
    measuredAt: (/* @__PURE__ */ new Date()).toISOString(),
    environment: options.environment,
    samplePolicy: {
      minimumFormalP95Samples: 30,
      usedSamples: iterations,
      p95GateEvaluated: false
    },
    scope: {
      canonicalCore: "pixiedraw2/src/draw2-core.ts",
      activeEditingPath: "command \u2192 dirty Tile/Region \u2192 Reference dirty-region preparation \u2192 optional Canvas present",
      heavyTasks: "SEPARATE_BUDGET",
      layerFrameCoverage: "CORE_SLICE_ONLY"
    },
    singlePixel,
    cow,
    sparse,
    determinism,
    tileComparison,
    technology: {
      tileSize: "DECISION_PENDING",
      renderer: "DECISION_PENDING",
      workerTopology: "DECISION_PENDING",
      offscreenCanvas: "UNTESTED_CANDIDATE",
      webgpu: "UNTESTED_OPTIONAL_CANDIDATE",
      wasm: "UNTESTED_CANDIDATE",
      sharedArrayBuffer: "UNTESTED_OPTIONAL_CANDIDATE"
    },
    notes: [
      "Measurements are evidence for the isolated Reference Path, not a production performance PASS.",
      "The current Core slice has one raster asset and no 20-layer/120-frame compositor; layer/frame counts are reported as affected Core slice counts, not full-project coverage.",
      "Desktop-sized and mobile-sized browser fixtures must remain separate from actual device evidence.",
      "Full raster reads and Golden hashes are explicit verification paths; active dirty rendering uses readRegion only.",
      "No current Route, PiXiEEDraw, PXD, PiXYNC, Market, Project, Asset, Package, database, Storage, or production path is loaded."
    ]
  };
}

// src/draw2-reference-benchmark-entry.ts
var runButton = document.querySelector("#runReferenceCheckpoint");
var statusElement = document.querySelector("#referenceStatus");
var outputElement = document.querySelector("#referenceOutput");
var canvas512 = document.querySelector("#referenceCanvas512");
var canvas256 = document.querySelector("#referenceCanvas256");
if (runButton === null || statusElement === null || outputElement === null || canvas512 === null || canvas256 === null) {
  throw new Error("Reference benchmark entry is missing a required element.");
}
var runControl = runButton;
var status = statusElement;
var output = outputElement;
var benchmarkCanvas512 = canvas512;
var benchmarkCanvas256 = canvas256;
var canvases = /* @__PURE__ */ new Map([
  [
    512,
    benchmarkCanvas512
  ],
  [
    256,
    benchmarkCanvas256
  ]
]);
var contexts = /* @__PURE__ */ new Map();
for (const [size, canvas] of canvases) {
  const context = canvas.getContext("2d", {
    alpha: false
  });
  if (context === null) throw new Error(`Reference benchmark could not acquire Canvas2D ${size}.`);
  contexts.set(size, context);
}
function environment() {
  const userAgent = navigator.userAgent;
  const browser = /Firefox\//.test(userAgent) ? "FIREFOX" : /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent) ? "SAFARI" : /Chrome\//.test(userAgent) ? "CHROMIUM" : "OTHER";
  const versionMatch = userAgent.match(/(?:Chrome|Firefox|Version)\/([\d.]+)/);
  return {
    deviceClass: "browser-host-unknown",
    actualDevice: "Codex In-app Browser host; device model unavailable",
    browser,
    browserVersion: versionMatch?.[1] ?? "unknown",
    os: navigator.platform || "unknown",
    buildVersion: "pixiedraw2-reference-checkpoint-local",
    condition: "WARM",
    surface: "ACTUAL_BROWSER"
  };
}
function collectLongTasks() {
  const entries = [];
  if (!("PerformanceObserver" in window)) {
    return {
      snapshot: {
        available: false,
        count: 0,
        totalMs: 0,
        maxMs: 0,
        note: "PerformanceObserver unavailable."
      },
      disconnect: () => {
      }
    };
  }
  const observer = new PerformanceObserver((list) => entries.push(...list.getEntries()));
  try {
    observer.observe({
      type: "longtask",
      buffered: true
    });
  } catch {
    return {
      snapshot: {
        available: false,
        count: 0,
        totalMs: 0,
        maxMs: 0,
        note: "Long Task entry type unavailable."
      },
      disconnect: () => observer.disconnect()
    };
  }
  return {
    snapshot: {
      available: true,
      count: 0,
      totalMs: 0,
      maxMs: 0
    },
    disconnect: () => observer.disconnect()
  };
}
function longTaskSnapshot(entriesBefore, available) {
  const entries = entriesBefore.filter((entry) => entry.entryType === "longtask");
  const totalMs = entries.reduce((total, entry) => total + entry.duration, 0);
  return {
    available,
    count: entries.length,
    totalMs,
    maxMs: Math.max(0, ...entries.map((entry) => entry.duration))
  };
}
async function present(state, assetId, regions) {
  const asset = state.assets[assetId];
  if (asset === void 0) throw new Error("Reference benchmark asset is missing.");
  const canvas = canvases.get(asset.width);
  const context = contexts.get(asset.width);
  if (canvas === void 0 || context === void 0) throw new Error(`Reference benchmark canvas ${asset.width} is missing.`);
  for (const region of regions) {
    const snapshot = asset.raster.readRegion(region.x, region.y, region.width, region.height);
    const image = context.createImageData(region.width, region.height);
    for (let index = 0; index < snapshot.pixels.length; index += 1) {
      const color = asset.palette[snapshot.pixels[index] ?? 0] ?? 0;
      const target = index * 4;
      image.data[target] = color >>> 24 & 255;
      image.data[target + 1] = color >>> 16 & 255;
      image.data[target + 2] = color >>> 8 & 255;
      image.data[target + 3] = color & 255;
    }
    context.putImageData(image, region.x, region.y);
  }
}
async function run() {
  runControl.disabled = true;
  status.textContent = "Measuring isolated Reference Path\u2026";
  output.textContent = "";
  const longTaskState = collectLongTasks();
  const beforeEntries = performance.getEntriesByType("longtask");
  try {
    const result = await runReferenceBenchmark({
      environment: environment(),
      iterations: 40,
      present,
      longTasks: longTaskState.snapshot
    });
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      duration: entry.duration,
      transferSize: entry.transferSize
    }));
    const resultPayload = {
      ...result,
      browserEvidence: {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        },
        userAgent: navigator.userAgent,
        resourceRequests: resources,
        longTasks: longTaskSnapshot([
          ...beforeEntries,
          ...performance.getEntriesByType("longtask")
        ], true)
      }
    };
    window.__pixieedDraw2ReferenceCheckpoint = resultPayload;
    output.textContent = JSON.stringify(resultPayload, null, 2);
    status.textContent = "Measured. Formal p95/device gates remain UNTESTED.";
  } finally {
    longTaskState.disconnect();
    runControl.disabled = false;
  }
}
runControl.addEventListener("click", () => {
  void run();
});
