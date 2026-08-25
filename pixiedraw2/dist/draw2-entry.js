// src/draw2-tilemap.ts
function tilemapIdFor(layerTrackId, frameId) {
  return `${layerTrackId}::${frameId}`;
}
function tilemapCellKey(x, y) {
  return `${x}:${y}`;
}
function createDraw2Tilemap(options) {
  const width = Math.max(1, Math.round(options.canvasWidth));
  const height = Math.max(1, Math.round(options.canvasHeight));
  const cellSize = options.cellSize === 32 ? 32 : 16;
  return {
    schemaVersion: 1,
    id: options.id,
    layerTrackId: options.layerTrackId,
    frameId: options.frameId,
    cellSize,
    columns: Math.max(1, Math.ceil(width / cellSize)),
    rows: Math.max(1, Math.ceil(height / cellSize)),
    cells: {},
    revision: 0
  };
}
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
function tilemapCellAt(map, x, y) {
  if (map === void 0 || x < 0 || y < 0 || x >= map.columns || y >= map.rows) {
    return void 0;
  }
  return map.cells[tilemapCellKey(x, y)];
}
function setDraw2TilemapCell(map, x, y, cell) {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= map.columns || y >= map.rows || !cell.sourceAssetId || !Number.isSafeInteger(cell.sourceX) || !Number.isSafeInteger(cell.sourceY) || cell.sourceX < 0 || cell.sourceY < 0) return map;
  const key = tilemapCellKey(x, y);
  const previous = map.cells[key];
  if (previous?.sourceAssetId === cell.sourceAssetId && previous.sourceX === cell.sourceX && previous.sourceY === cell.sourceY && previous.transform === cell.transform) return map;
  return {
    ...map,
    cells: {
      ...map.cells,
      [key]: {
        ...cell
      }
    },
    revision: map.revision + 1
  };
}
function clearDraw2TilemapCell(map, x, y) {
  const key = tilemapCellKey(x, y);
  if (map.cells[key] === void 0) return map;
  const cells = {
    ...map.cells
  };
  delete cells[key];
  return {
    ...map,
    cells,
    revision: map.revision + 1
  };
}
function draw2TilemapCellCount(map) {
  return map === void 0 ? 0 : Object.keys(map.cells).length;
}
function buildTilemapGridSvgPath(width, height, layoutWidth, layoutHeight, cellSize, majorEvery = 8) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const scaleX = Math.max(1, layoutWidth) / safeWidth;
  const scaleY = Math.max(1, layoutHeight) / safeHeight;
  const step = Math.max(1, Math.round(cellSize));
  const minorParts = [];
  const majorParts = [];
  const maxX = Math.ceil(safeWidth / step) * step;
  const maxY = Math.ceil(safeHeight / step) * step;
  for (let x = 0; x <= maxX; x += step) {
    const target = x * scaleX;
    const parts = x % (step * majorEvery) === 0 ? majorParts : minorParts;
    parts.push(`M ${target} 0 V ${Math.min(layoutHeight, safeHeight * scaleY)}`);
  }
  for (let y = 0; y <= maxY; y += step) {
    const target = y * scaleY;
    const parts = y % (step * majorEvery) === 0 ? majorParts : minorParts;
    parts.push(`M 0 ${target} H ${Math.min(layoutWidth, safeWidth * scaleX)}`);
  }
  return {
    minor: minorParts.join(" "),
    major: majorParts.join(" ")
  };
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
  let error2 = dx - dy;
  while (true) {
    points.push({
      x,
      y
    });
    if (x === to.x && y === to.y) break;
    const twiceError = error2 * 2;
    if (twiceError > -dy) {
      error2 -= dy;
      x += stepX;
    }
    if (twiceError < dx) {
      error2 += dx;
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
var InMemoryProjectRepository = class {
  #projects = /* @__PURE__ */ new Map();
  open(projectId) {
    const state2 = this.#projects.get(projectId);
    if (state2 === void 0) return void 0;
    return cloneStateShared(state2);
  }
  create(options) {
    const state2 = createProject(options);
    this.#projects.set(state2.projectId, state2);
    return cloneStateShared(state2);
  }
  save(state2) {
    this.#projects.set(state2.projectId, cloneStateShared(state2));
  }
};
function cloneProjectStateShared(state2) {
  const assets = {};
  for (const [id, asset] of Object.entries(state2.assets)) {
    assets[id] = {
      ...asset,
      raster: asset.raster.sharedClone()
    };
  }
  return {
    ...state2,
    assets,
    tilemaps: cloneDraw2Tilemaps(state2.tilemaps),
    layers: state2.layers.map((layer2) => ({
      ...layer2
    })),
    frames: state2.frames.map((frame2) => ({
      ...frame2
    })),
    cels: state2.cels.map((cel2) => ({
      ...cel2
    })),
    timeline: {
      ...state2.timeline,
      frameOrder: [
        ...state2.timeline.frameOrder
      ],
      layerTrackOrder: [
        ...state2.timeline.layerTrackOrder
      ]
    },
    appliedCommandIds: [
      ...state2.appliedCommandIds
    ],
    lastClientSequenceByClient: {
      ...state2.lastClientSequenceByClient
    }
  };
}
function cloneStateShared(state2) {
  return cloneProjectStateShared(state2);
}
function validateEnvelope(state2, command) {
  const diagnostics = [];
  if (command.schemaVersion !== 1) {
    diagnostics.push(diagnostic("COMMAND_SCHEMA_UNSUPPORTED", "Unsupported command schema version.", "schemaVersion"));
  }
  if (command.projectId !== state2.projectId) {
    diagnostics.push(diagnostic("COMMAND_PROJECT_MISMATCH", "Command project does not match state.", "projectId"));
  }
  if (command.baseStructureEpoch !== state2.structureEpoch) {
    diagnostics.push(diagnostic("COMMAND_STRUCTURE_EPOCH_MISMATCH", "Command structure epoch is stale.", "baseStructureEpoch"));
  }
  if (state2.appliedCommandIds.includes(command.commandId)) {
    diagnostics.push(diagnostic("COMMAND_DUPLICATE", "Command was already applied.", "commandId"));
  }
  const expectedSequence = (state2.lastClientSequenceByClient[command.clientId] ?? 0) + 1;
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
function validatePayload(state2, command) {
  const asset = state2.assets[command.assetId];
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
  constructor(state2, options = {}) {
    this.#state = state2;
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
var InMemoryLocalJournal = class {
  operations = [];
  dirtyTileWrites = [];
  checkpoints = [];
  async append(operation) {
    this.operations.push(structuredClone(operation));
  }
  async writeDirtyTiles(assetId, tiles) {
    this.dirtyTileWrites.push({
      assetId,
      tiles: tiles.map((tile) => ({
        tileKey: tile.tileKey,
        bytes: new Uint8Array(tile.bytes)
      }))
    });
  }
  async writeCheckpoint(state2) {
    this.checkpoints.push(state2);
  }
};
var LocalAutosaveCoordinator = class {
  #journal;
  #checkpointEvery;
  #operationCount = 0;
  #instrumentation;
  constructor(journal2, checkpointEvery = 20, instrumentation2 = NOOP_INSTRUMENTATION) {
    if (!Number.isSafeInteger(checkpointEvery) || checkpointEvery < 1) {
      throw new Error("checkpointEvery must be positive.");
    }
    this.#journal = journal2;
    this.#checkpointEvery = checkpointEvery;
    this.#instrumentation = instrumentation2;
  }
  async record(state2, result) {
    const started = performance.now();
    await this.#journal.append(result.operation);
    const asset = state2.assets[result.operation.assetId];
    if (asset === void 0) throw new Error("Autosave asset was not found.");
    const dirtyKeys = new Set(result.dirtyTiles.map((tile) => tile.tileKey));
    await this.#journal.writeDirtyTiles(asset.id, asset.raster.snapshotTiles().filter((tile) => dirtyKeys.has(tile.tileKey)));
    this.#operationCount += 1;
    if (this.#operationCount % this.#checkpointEvery === 0) {
      await this.#journal.writeCheckpoint(state2);
    }
    this.#instrumentation.record({
      name: "autosave.schedule",
      durationMs: performance.now() - started,
      detail: {
        dirtyTileCount: result.dirtyTiles.length
      }
    });
  }
};

// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var SHA256 = /^[a-f0-9]{64}$/;
function brandedId(value, label) {
  if (!SAFE_ID.test(value)) throw new Error(`${label} must be a non-empty stable identifier.`);
  return value;
}
function asGameProjectId(value) {
  return brandedId(value, "GameProjectId");
}
function asGamePreviewId(value) {
  return brandedId(value, "GamePreviewId");
}
function asPackageId(value) {
  return brandedId(value, "PackageId");
}
function asAssetId(value) {
  return brandedId(value, "AssetId");
}
function asAssetRevisionId(value) {
  return brandedId(value, "AssetRevisionId");
}
function asSha256(value, label = "Hash") {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}
function asDependencySnapshotHash(value) {
  if (!SHA256.test(value)) throw new Error("DependencySnapshotHash must be a lowercase SHA-256 hash.");
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
function canonicalJson2(value) {
  return JSON.stringify(jsonValue(value));
}
async function sha256Hex2(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hashCanonical(value) {
  return asSha256(await sha256Hex2(canonicalJson2(value)), "ContentHash");
}
function sortDependencyEntries(entries) {
  return [
    ...entries
  ].sort((left, right) => left.assetId.localeCompare(right.assetId) || left.revisionId.localeCompare(right.revisionId));
}
async function calculateDependencySnapshotHash(packageId, packageVersion, entries) {
  const canonicalEntries = sortDependencyEntries(entries);
  return asDependencySnapshotHash(await sha256Hex2(canonicalJson2({
    packageId,
    packageVersion,
    entries: canonicalEntries
  })));
}

// src/pixync/contracts.ts
var PIXYNC_DRAW2_SCHEMA_VERSION = "PIXYNC_DRAW2_OPERATION_V1";
var PixyncError = class extends Error {
  code;
  path;
  constructor(code, message, path) {
    super(message);
    this.name = "PixyncError";
    this.code = code;
    this.path = path;
  }
};

// src/pixync/core.ts
var PIXYNC_DRAW2_MAX_PAYLOAD_BYTES = 16384;
var PIXYNC_DRAW2_MAX_PAYLOAD_DEPTH = 8;
var PIXYNC_DRAW2_MAX_PAYLOAD_KEYS = 96;
var SAFE_ID2 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
var SHA2562 = /^[a-f0-9]{64}$/u;
var FORBIDDEN_KEY_PARTS = [
  "pointer",
  "preview",
  "snapshot",
  "rawaudioblob",
  "audioblob",
  "blob",
  "dom"
];
var REVISION_REFERENCE_KEYS = /* @__PURE__ */ new Set([
  "operationId",
  "aggregate",
  "projectRevision",
  "aggregateRevision"
]);
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function reject(code, message, path) {
  throw new PixyncError(code, message, path);
}
function assertSafeId(value, path) {
  if (typeof value !== "string" || !SAFE_ID2.test(value)) {
    reject("INVALID_ENVELOPE", "A bounded stable identifier is required.", path);
  }
}
function assertAggregate(value, path) {
  if (value !== "draw" && value !== "audio" && value !== "game") {
    reject("INVALID_ENVELOPE", "Unknown aggregate.", path);
  }
}
function assertNonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    reject("INVALID_ENVELOPE", "A non-negative safe integer is required.", path);
  }
}
function assertJsonValue(value, depth, path) {
  if (depth > PIXYNC_DRAW2_MAX_PAYLOAD_DEPTH) {
    reject("PAYLOAD_TOO_LARGE", "Payload nesting exceeds the bounded command limit.", path);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      reject("INVALID_ENVELOPE", "Payload numbers must be finite.", path);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > PIXYNC_DRAW2_MAX_PAYLOAD_KEYS) {
      reject("PAYLOAD_TOO_LARGE", "Payload arrays exceed the bounded command limit.", path);
    }
    value.forEach((item, index) => assertJsonValue(item, depth + 1, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    reject("INVALID_ENVELOPE", "Payload must contain JSON values only.", path);
  }
  const keys = Object.keys(value);
  if (keys.length > PIXYNC_DRAW2_MAX_PAYLOAD_KEYS) {
    reject("PAYLOAD_TOO_LARGE", "Payload object has too many keys.", path);
  }
  for (const key of keys) {
    const normalized = key.toLowerCase().replaceAll("_", "");
    if (FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part))) {
      reject("PAYLOAD_FORBIDDEN", "UI previews, pointer samples, snapshots, and raw blobs are not sync payloads.", `${path}.${key}`);
    }
    assertJsonValue(value[key], depth + 1, `${path}.${key}`);
  }
}
function assertRevisionReference(value, path) {
  if (!isRecord(value) || Object.keys(value).some((key) => !REVISION_REFERENCE_KEYS.has(key))) {
    reject("PAYLOAD_FORBIDDEN", "Revision references must not carry snapshots.", path);
  }
  assertSafeId(value.operationId, `${path}.operationId`);
  assertAggregate(value.aggregate, `${path}.aggregate`);
  assertNonNegativeInteger(value.projectRevision, `${path}.projectRevision`);
  assertNonNegativeInteger(value.aggregateRevision, `${path}.aggregateRevision`);
  if (value.projectRevision === 0 || value.aggregateRevision === 0) {
    reject("INVALID_ENVELOPE", "A locked revision reference must point to a committed revision.", path);
  }
}
function assertNestedRevisionReferences(value, path) {
  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNestedRevisionReferences(item, `${path}[${index}]`));
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "revisionRef") assertRevisionReference(child, `${path}.${key}`);
    else assertNestedRevisionReferences(child, `${path}.${key}`);
  }
}
async function payloadHash(payload) {
  assertJsonValue(payload, 0, "payload");
  assertNestedRevisionReferences(payload, "payload");
  const serialized = canonicalJson2(payload);
  const bytes = new TextEncoder().encode(serialized);
  if (bytes.byteLength > PIXYNC_DRAW2_MAX_PAYLOAD_BYTES) {
    reject("PAYLOAD_TOO_LARGE", "Payload exceeds the bounded command limit.", "payload");
  }
  return sha256Hex2(serialized);
}
async function createPixyncDraft(input) {
  return {
    schemaVersion: PIXYNC_DRAW2_SCHEMA_VERSION,
    ...input,
    payloadHash: await payloadHash(input.payload)
  };
}
async function validatePixyncDraft(draft) {
  if (!isRecord(draft) || draft.schemaVersion !== PIXYNC_DRAW2_SCHEMA_VERSION) {
    reject("INVALID_ENVELOPE", "Unsupported PiXYNC Draw2 envelope schema.", "schemaVersion");
  }
  assertSafeId(draft.operationId, "operationId");
  assertSafeId(draft.projectId, "projectId");
  assertAggregate(draft.aggregate, "aggregate");
  assertSafeId(draft.actorId, "actorId");
  assertSafeId(draft.clientId, "clientId");
  if (!Number.isSafeInteger(draft.clientSequence) || draft.clientSequence <= 0) {
    reject("INVALID_ENVELOPE", "clientSequence must be a positive safe integer.", "clientSequence");
  }
  assertNonNegativeInteger(draft.baseProjectRevision, "baseProjectRevision");
  assertNonNegativeInteger(draft.aggregateRevision, "aggregateRevision");
  if (typeof draft.payloadHash !== "string" || !SHA2562.test(draft.payloadHash)) {
    reject("INVALID_ENVELOPE", "payloadHash must be a lowercase SHA-256 value.", "payloadHash");
  }
  if (!isRecord(draft.payload)) {
    reject("INVALID_ENVELOPE", "payload must be a JSON object.", "payload");
  }
  const expectedHash = await payloadHash(draft.payload);
  if (expectedHash !== draft.payloadHash) {
    reject("PAYLOAD_HASH_MISMATCH", "payloadHash does not match the canonical payload.", "payloadHash");
  }
  if (draft.compensation !== void 0) assertCompensation(draft.compensation);
}
function assertCompensation(value) {
  if (!isRecord(value)) {
    reject("INVALID_ENVELOPE", "Compensation guard must be an object.", "compensation");
  }
  assertSafeId(value.targetOperationId, "compensation.targetOperationId");
  const hasRevision = value.expectedAggregateRevision !== void 0;
  const hasWriter = value.writerGuard !== void 0;
  if (!hasRevision && !hasWriter) {
    reject("INVALID_ENVELOPE", "Compensation requires a revision or writer guard.", "compensation");
  }
  if (hasRevision) {
    assertNonNegativeInteger(value.expectedAggregateRevision, "compensation.expectedAggregateRevision");
  }
  if (hasWriter) assertSafeId(value.writerGuard, "compensation.writerGuard");
}
async function operationFingerprint(operation) {
  return sha256Hex2(canonicalJson2({
    schemaVersion: operation.schemaVersion,
    operationId: operation.operationId,
    projectId: operation.projectId,
    aggregate: operation.aggregate,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
    baseProjectRevision: operation.baseProjectRevision,
    payloadHash: operation.payloadHash,
    payload: operation.payload,
    compensation: operation.compensation
  }));
}
async function committedOperationFingerprint(operation) {
  return sha256Hex2(canonicalJson2({
    submissionFingerprint: await operationFingerprint(operation),
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision
  }));
}
async function validatePixyncCommitted(operation) {
  await validatePixyncDraft(operation);
  if (!Number.isSafeInteger(operation.projectRevision) || operation.projectRevision <= 0) {
    reject("INVALID_ENVELOPE", "Committed projectRevision must be positive.", "projectRevision");
  }
  if (typeof operation.committedAt !== "string" || !Number.isFinite(Date.parse(operation.committedAt))) {
    reject("INVALID_ENVELOPE", "Committed timestamp must be a valid ISO timestamp.", "committedAt");
  }
}

// src/pixync/adapters.ts
var PixyncAdapterError = class extends Error {
  code;
  path;
  constructor(code, message, path) {
    super(message);
    this.name = "PixyncAdapterError";
    this.code = code;
    this.path = path;
  }
};
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fail(code, message, path) {
  throw new PixyncAdapterError(code, message, path);
}
function assertJson(value, path) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("INVALID_COMMAND_PAYLOAD", "JSON number is not finite.", path);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJson(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord2(value)) {
    fail("SNAPSHOT_OR_RAW_PAYLOAD", "Only bounded JSON values may cross the adapter.", path);
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll("_", "");
    if (normalized === "before" || normalized === "after" || normalized === "beforestate" || normalized === "afterstate" || normalized.includes("snapshot") || normalized.includes("pointer") || normalized.includes("preview") || normalized.includes("rawbytes") || normalized.includes("blob")) {
      fail("SNAPSHOT_OR_RAW_PAYLOAD", "Snapshots, previews, and raw bytes are not sync payloads.", `${path}.${key}`);
    }
    assertJson(child, `${path}.${key}`);
  }
}
function jsonObject(value, path) {
  if (!isRecord2(value)) {
    fail("INVALID_COMMAND_PAYLOAD", "Object payload required.", path);
  }
  assertJson(value, path);
  return value;
}
function recordOf(value, path) {
  if (!isRecord2(value)) {
    fail("INVALID_COMMAND_PAYLOAD", "Object value required.", path);
  }
  return value;
}
function assertIdentity(actual, expected) {
  for (const field of [
    "operationId",
    "projectId",
    "actorId",
    "clientId",
    "clientSequence"
  ]) {
    if (actual[field] !== expected[field]) {
      fail("IDENTITY_MISMATCH", `Identity field ${field} was substituted.`, field);
    }
  }
}
function assertDraftIdentity(identity, expected) {
  assertIdentity({
    operationId: identity.operationId,
    projectId: expected.projectId,
    actorId: identity.actorId,
    clientId: identity.clientId,
    clientSequence: identity.clientSequence
  }, expected);
}
function identityPayload(identity) {
  return {
    ...identity
  };
}
function assertEnvelopeIdentity(operation, identity) {
  assertIdentity({
    operationId: operation.operationId,
    projectId: operation.projectId,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence
  }, identity);
}
function assertReceiptIdentity(receipt, operation) {
  assertIdentity({
    operationId: receipt.operationId,
    projectId: receipt.projectId,
    actorId: receipt.actorId,
    clientId: receipt.clientId,
    clientSequence: receipt.clientSequence
  }, {
    operationId: operation.operationId,
    projectId: operation.projectId,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence
  });
  if (receipt.baseProjectRevision !== operation.baseProjectRevision) {
    fail("STALE_BASE", "Apply receipt base revision differs.", "baseProjectRevision");
  }
}
function requireHistorySafePort(port) {
  if (port.preservesLocalHistory !== true) {
    fail("HISTORY_MUTATION_FORBIDDEN", "Remote apply port must preserve local history.", "preservesLocalHistory");
  }
}
async function drawRasterHash(state2, assetId) {
  const asset = state2.assets[assetId];
  if (asset === void 0) {
    fail("ASSET_MISMATCH", "Draw asset is missing.", "assetId");
  }
  return sha256Hex({
    projectId: state2.projectId,
    assetId,
    width: asset.width,
    height: asset.height,
    tileSize: asset.raster.tileSize,
    revision: asset.revision,
    pixels: Array.from(asset.raster.toUint8Array())
  });
}
async function createDrawOperationDraft(input) {
  const operation = input.result.operation;
  assertIdentity({
    operationId: operation.operationId,
    projectId: operation.projectId,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence
  }, input.expectedIdentity);
  if (input.identity.operationId !== operation.operationId) {
    fail("OPERATION_ID_MISMATCH", "Draw operation ID was substituted.", "operationId");
  }
  assertDraftIdentity(input.identity, input.expectedIdentity);
  const payload = jsonObject({
    adapter: "draw110",
    identity: identityPayload(input.expectedIdentity),
    command: {
      commandId: operation.commandId,
      operationType: operation.operationType,
      assetId: operation.assetId,
      baseStructureEpoch: input.baseStructureEpoch,
      structureEpoch: operation.structureEpoch,
      payload: jsonObject(operation.payload, "operation.payload")
    },
    rasterHash: await drawRasterHash(input.state, operation.assetId)
  }, "payload");
  return createPixyncDraft({
    operationId: operation.operationId,
    projectId: operation.projectId,
    aggregate: "draw",
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
    baseProjectRevision: input.identity.baseProjectRevision,
    aggregateRevision: input.identity.aggregateRevision ?? 0,
    payload
  });
}
function decodeDraw(operation) {
  const payload = recordOf(operation.payload, "payload");
  if (payload.adapter !== "draw110" || typeof payload.rasterHash !== "string") {
    fail("INVALID_COMMAND_PAYLOAD", "Draw adapter payload is invalid.", "payload");
  }
  const identityValue = recordOf(payload.identity, "payload.identity");
  const command = recordOf(payload.command, "payload.command");
  const identity = {
    operationId: String(identityValue.operationId),
    projectId: String(identityValue.projectId),
    actorId: String(identityValue.actorId),
    clientId: String(identityValue.clientId),
    clientSequence: Number(identityValue.clientSequence)
  };
  assertEnvelopeIdentity(operation, identity);
  if (typeof command.commandId !== "string" || typeof command.operationType !== "string" || typeof command.assetId !== "string" || !Number.isSafeInteger(command.baseStructureEpoch) || !Number.isSafeInteger(command.structureEpoch)) {
    fail("INVALID_COMMAND_PAYLOAD", "Draw command metadata is invalid.", "payload.command");
  }
  return {
    identity,
    command: {
      commandId: command.commandId,
      operationType: command.operationType,
      assetId: command.assetId,
      baseStructureEpoch: Number(command.baseStructureEpoch),
      structureEpoch: Number(command.structureEpoch),
      payload: jsonObject(command.payload, "payload.command.payload")
    },
    rasterHash: payload.rasterHash
  };
}
function createDrawPixyncAdapter(port) {
  requireHistorySafePort(port);
  return {
    aggregate: "draw",
    apply: async (operation, context) => {
      const decoded = decodeDraw(operation);
      const canonicalOperation = {
        operationId: operation.operationId,
        operationType: decoded.command.operationType,
        schemaVersion: 1,
        commandId: decoded.command.commandId,
        projectId: operation.projectId,
        assetId: decoded.command.assetId,
        actorId: operation.actorId,
        clientId: operation.clientId,
        clientSequence: operation.clientSequence,
        structureEpoch: decoded.command.structureEpoch,
        payload: decoded.command.payload
      };
      const receipt = await port.apply({
        operation: canonicalOperation,
        source: context.source,
        baseProjectRevision: operation.baseProjectRevision,
        baseStructureEpoch: decoded.command.baseStructureEpoch,
        expectedStructureEpoch: decoded.command.structureEpoch,
        expectedRasterHash: decoded.rasterHash,
        aggregateRevision: context.aggregateRevision
      });
      assertReceiptIdentity(receipt, operation);
      if (receipt.assetId !== decoded.command.assetId) {
        fail("ASSET_MISMATCH", "Draw receipt asset differs.", "assetId");
      }
      if (receipt.baseStructureEpoch !== decoded.command.baseStructureEpoch || receipt.structureEpoch !== decoded.command.structureEpoch) {
        fail("STRUCTURE_EPOCH_MISMATCH", "Draw structure epoch did not converge.", "structureEpoch");
      }
      if (receipt.rasterHash !== decoded.rasterHash) {
        fail("APPLY_FAILED", "Draw raster hash did not converge.", "rasterHash");
      }
    }
  };
}
async function createAudioOperationDraft(input) {
  const entry = input.entry;
  if (String(entry.entryId) !== input.identity.operationId) {
    fail("OPERATION_ID_MISMATCH", "Audio operation ID must bind to entryId.", "operationId");
  }
  assertDraftIdentity(input.identity, input.expectedIdentity);
  const projectId = String(entry.command.projectId);
  assertIdentity({
    operationId: String(entry.entryId),
    projectId,
    actorId: input.identity.actorId,
    clientId: input.identity.clientId,
    clientSequence: input.identity.clientSequence
  }, input.expectedIdentity);
  const payload = jsonObject({
    adapter: "audio110",
    identity: identityPayload(input.expectedIdentity),
    command: entry.command,
    journal: {
      entryId: String(entry.entryId),
      entryHash: String(entry.entryHash),
      sequence: entry.sequence,
      kind: entry.kind
    }
  }, "payload");
  return createPixyncDraft({
    operationId: input.identity.operationId,
    projectId,
    aggregate: "audio",
    actorId: input.identity.actorId,
    clientId: input.identity.clientId,
    clientSequence: input.identity.clientSequence,
    baseProjectRevision: input.identity.baseProjectRevision,
    aggregateRevision: input.identity.aggregateRevision ?? 0,
    payload
  });
}
function decodeAudio(operation) {
  const payload = recordOf(operation.payload, "payload");
  if (payload.adapter !== "audio110") {
    fail("INVALID_COMMAND_PAYLOAD", "Audio adapter payload is invalid.", "payload");
  }
  const identityValue = recordOf(payload.identity, "payload.identity");
  const journal2 = recordOf(payload.journal, "payload.journal");
  const identity = {
    operationId: String(identityValue.operationId),
    projectId: String(identityValue.projectId),
    actorId: String(identityValue.actorId),
    clientId: String(identityValue.clientId),
    clientSequence: Number(identityValue.clientSequence)
  };
  assertEnvelopeIdentity(operation, identity);
  if (typeof journal2.entryId !== "string" || typeof journal2.entryHash !== "string" || !Number.isSafeInteger(journal2.sequence) || journal2.kind !== "COMMAND" && journal2.kind !== "UNDO" && journal2.kind !== "REDO") {
    fail("INVALID_COMMAND_PAYLOAD", "Audio journal metadata is invalid.", "payload.journal");
  }
  return {
    identity,
    command: recordOf(payload.command, "payload.command"),
    entryId: journal2.entryId,
    entryHash: journal2.entryHash,
    sequence: Number(journal2.sequence),
    kind: journal2.kind
  };
}
function createAudioPixyncAdapter(port) {
  requireHistorySafePort(port);
  return {
    aggregate: "audio",
    apply: async (operation, context) => {
      const decoded = decodeAudio(operation);
      if (String(decoded.command.projectId) !== operation.projectId) {
        fail("PROJECT_MISMATCH", "Audio project differs.", "command.projectId");
      }
      const receipt = await port.apply({
        ...decoded,
        operation,
        source: context.source,
        aggregateRevision: context.aggregateRevision
      });
      assertReceiptIdentity(receipt, operation);
      if (!/^[a-f0-9]{64}$/.test(receipt.stateHash)) {
        fail("APPLY_FAILED", "Audio state hash is invalid.", "stateHash");
      }
    }
  };
}
async function createGameOperationDraft(input) {
  const command = input.command;
  if (command.before.revision.snapshotHash !== command.beforeHash || command.after.revision.snapshotHash !== command.afterHash) {
    fail("REVISION_MISMATCH", "Game journal hashes are not canonical.", "afterHash");
  }
  if (String(command.commandId) !== input.identity.operationId) {
    fail("OPERATION_ID_MISMATCH", "Game operation ID must bind to commandId.", "operationId");
  }
  assertDraftIdentity(input.identity, input.expectedIdentity);
  const projectId = String(command.after.projectId);
  assertIdentity({
    operationId: String(command.commandId),
    projectId,
    actorId: input.identity.actorId,
    clientId: input.identity.clientId,
    clientSequence: input.identity.clientSequence
  }, input.expectedIdentity);
  const revision = command.after.revision;
  const descriptor = {
    revisionId: String(revision.revisionId),
    ...revision.parentRevisionId === void 0 ? {} : {
      parentRevisionId: String(revision.parentRevisionId)
    },
    sequence: revision.sequence,
    revisionHash: String(revision.snapshotHash)
  };
  const payload = jsonObject({
    adapter: "game110",
    identity: identityPayload(input.expectedIdentity),
    commandId: String(command.commandId),
    beforeHash: String(command.beforeHash),
    afterHash: String(command.afterHash),
    sequence: command.sequence,
    revision: descriptor
  }, "payload");
  return createPixyncDraft({
    operationId: input.identity.operationId,
    projectId,
    aggregate: "game",
    actorId: input.identity.actorId,
    clientId: input.identity.clientId,
    clientSequence: input.identity.clientSequence,
    baseProjectRevision: input.identity.baseProjectRevision,
    aggregateRevision: input.identity.aggregateRevision ?? 0,
    payload
  });
}
function decodeGame(operation) {
  const payload = recordOf(operation.payload, "payload");
  if (payload.adapter !== "game110" || typeof payload.commandId !== "string" || typeof payload.beforeHash !== "string" || typeof payload.afterHash !== "string" || !Number.isSafeInteger(payload.sequence)) {
    fail("INVALID_COMMAND_PAYLOAD", "Game adapter payload is invalid.", "payload");
  }
  const identityValue = recordOf(payload.identity, "payload.identity");
  const revision = recordOf(payload.revision, "payload.revision");
  const identity = {
    operationId: String(identityValue.operationId),
    projectId: String(identityValue.projectId),
    actorId: String(identityValue.actorId),
    clientId: String(identityValue.clientId),
    clientSequence: Number(identityValue.clientSequence)
  };
  assertEnvelopeIdentity(operation, identity);
  if (typeof revision.revisionId !== "string" || typeof revision.revisionHash !== "string" || !Number.isSafeInteger(revision.sequence) || revision.parentRevisionId !== void 0 && typeof revision.parentRevisionId !== "string") {
    fail("INVALID_COMMAND_PAYLOAD", "Game revision descriptor is invalid.", "payload.revision");
  }
  return {
    identity,
    commandId: payload.commandId,
    beforeHash: payload.beforeHash,
    afterHash: payload.afterHash,
    sequence: payload.sequence,
    descriptor: {
      revisionId: revision.revisionId,
      ...revision.parentRevisionId === void 0 ? {} : {
        parentRevisionId: revision.parentRevisionId
      },
      sequence: revision.sequence,
      revisionHash: revision.revisionHash
    }
  };
}
function createGamePixyncAdapter(port) {
  requireHistorySafePort(port);
  return {
    aggregate: "game",
    apply: async (operation, context) => {
      const decoded = decodeGame(operation);
      const current = port.current();
      if (current.projectId !== operation.projectId) {
        fail("PROJECT_MISMATCH", "Game project differs.", "projectId");
      }
      if (current.stateHash !== decoded.beforeHash || decoded.descriptor.parentRevisionId !== current.revisionId || decoded.descriptor.sequence !== current.sequence + 1) fail("STALE_PARENT", "Game parent is stale.", "revision");
      const resolved = await port.resolveCanonicalRevision(decoded.afterHash, decoded.descriptor.revisionId);
      if (resolved === void 0 || String(resolved.projectId) !== operation.projectId || String(resolved.revision.revisionId) !== decoded.descriptor.revisionId || resolved.revision.sequence !== decoded.descriptor.sequence || String(resolved.revision.snapshotHash) !== decoded.afterHash || String(resolved.revision.snapshotHash) !== decoded.descriptor.revisionHash || String(resolved.revision.parentRevisionId) !== String(decoded.descriptor.parentRevisionId)) {
        fail("RESOLVER_MISMATCH", "Resolved Game revision was substituted.", "revision");
      }
      const receipt = await port.appendJournalCommand({
        next: resolved,
        commandId: decoded.commandId,
        operation
      });
      assertReceiptIdentity(receipt, operation);
      if (receipt.revisionId !== decoded.descriptor.revisionId || receipt.sequence !== decoded.descriptor.sequence || receipt.stateHash !== decoded.afterHash) fail("REVISION_MISMATCH", "Game append receipt differs.", "revision");
      void context;
    }
  };
}

// src/pixync/audio-product-bridge.ts
var PixyncAudioProductBridgeError = class extends Error {
  code;
  constructor(code, message) {
    super(message), this.code = code;
    this.name = "PixyncAudioProductBridgeError";
  }
};
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function entityId(payload, entityKey, idKey) {
  const entity2 = record(payload[entityKey]);
  const value = entity2?.[idKey];
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function audioChangedAssetIds(command) {
  const payload = record(command.payload) ?? {};
  const ids = /* @__PURE__ */ new Set([
    `audio-project:${String(command.projectId)}`
  ]);
  const trackId = typeof payload.trackId === "string" ? payload.trackId : entityId(payload, "track", "trackId") ?? entityId(payload, "clip", "trackId") ?? entityId(payload, "note", "trackId");
  if (trackId !== void 0) ids.add(`audio-track:${trackId}`);
  const assetId = entityId(payload, "revision", "assetId") ?? entityId(record(payload.recording) ?? {}, "revision", "assetId") ?? entityId(record(payload.bounce) ?? {}, "revision", "assetId") ?? entityId(record(payload.freeze) ?? {}, "revision", "assetId");
  if (assetId !== void 0) ids.add(assetId);
  const precise = trackId !== void 0 || assetId !== void 0 || command.type === "TEMPO_SET" || command.type === "MASTER_REPLACE" || command.type === "DRUM_KIT_SET";
  return {
    ids: [
      ...ids
    ],
    fullRefresh: !precise
  };
}
function invalidation(operation, binding, command) {
  const changed = audioChangedAssetIds(command);
  return {
    projectId: operation.projectId,
    sessionGeneration: binding.sessionGeneration,
    aggregate: "audio",
    operationId: operation.operationId,
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision,
    changedAssetIds: changed.ids,
    fullRefresh: changed.fullRefresh
  };
}
var PixyncAudioProductBridge = class {
  adapter;
  #transport;
  #state;
  #onInvalidation;
  constructor(options) {
    this.#transport = options.transport;
    this.#state = options.state;
    this.#onInvalidation = options.onInvalidation;
    this.adapter = createAudioPixyncAdapter({
      preservesLocalHistory: true,
      apply: (input) => this.#applyRemote(input)
    });
  }
  async submitLocal(entry) {
    const binding = this.#transport.binding;
    if (binding === void 0) {
      throw new PixyncAudioProductBridgeError("SESSION_UNAVAILABLE", "An authenticated PiXYNC session is required.");
    }
    if (binding.role === "viewer") {
      throw new PixyncAudioProductBridgeError("ROLE_FORBIDDEN", "Viewer sessions cannot submit Audio operations.");
    }
    if (String(entry.command.projectId) !== binding.projectId) {
      throw new PixyncAudioProductBridgeError("PROJECT_MISMATCH", "Audio state does not belong to the authenticated PiXYNC project.");
    }
    const revisions = this.#transport.snapshot();
    if (revisions.projectId !== binding.projectId) {
      throw new PixyncAudioProductBridgeError("PROJECT_MISMATCH", "PiXYNC revision state belongs to another project.");
    }
    const expectedIdentity = {
      operationId: String(entry.entryId),
      projectId: binding.projectId,
      actorId: binding.actorId,
      clientId: binding.clientId,
      clientSequence: entry.sequence
    };
    const draft = await createAudioOperationDraft({
      entry,
      identity: {
        ...expectedIdentity,
        baseProjectRevision: revisions.projectRevision,
        aggregateRevision: revisions.aggregateRevisions.audio
      },
      expectedIdentity
    });
    const ack = await this.#transport.submit(draft);
    const notice = invalidation(ack.operation, binding, entry.command);
    this.#onInvalidation(notice);
    return {
      ack,
      invalidation: notice
    };
  }
  async #applyRemote(input) {
    const binding = this.#transport.binding;
    if (binding === void 0) {
      throw new PixyncAudioProductBridgeError("SESSION_UNAVAILABLE", "An authenticated PiXYNC session is required.");
    }
    const before = this.#state.current();
    if (String(before.project.projectId) !== input.operation.projectId) {
      throw new PixyncAudioProductBridgeError("PROJECT_MISMATCH", "Remote Audio operation belongs to another active project.");
    }
    if (before.appliedEntryIds.includes(input.entryId)) {
      if (before.project.projectRevision < input.command.baseProjectRevision + 1) {
        throw new PixyncAudioProductBridgeError("SELF_ECHO_MISMATCH", "Self echo is newer than the local Audio state.");
      }
      const receipt2 = {
        operationId: input.operation.operationId,
        projectId: input.operation.projectId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseProjectRevision: input.operation.baseProjectRevision,
        stateHash: String(before.project.stateHash),
        projectRevision: before.project.projectRevision
      };
      this.#onInvalidation(invalidation(input.operation, binding, input.command));
      return receipt2;
    }
    const receipt = await this.#state.applyRemote(input);
    const after = this.#state.current();
    if (after.undoDepth !== before.undoDepth || after.redoDepth !== before.redoDepth) {
      throw new PixyncAudioProductBridgeError("HISTORY_MUTATION_FORBIDDEN", "Remote Audio apply changed local Undo/Redo history.");
    }
    this.#onInvalidation(invalidation(input.operation, binding, input.command));
    return receipt;
  }
};

// src/pixync/draw-product-bridge.ts
var RASTER_OPERATIONS = /* @__PURE__ */ new Set([
  "raster.setPixel",
  "raster.strokeCommit",
  "raster.writeSet",
  "raster.fill"
]);
var PixyncDrawProductBridgeError = class extends Error {
  code;
  constructor(code, message) {
    super(message), this.code = code;
    this.name = "PixyncDrawProductBridgeError";
  }
};
var PixyncDrawProductBridge = class {
  adapter;
  #transport;
  #state;
  constructor(options) {
    this.#transport = options.transport;
    this.#state = options.state;
    this.adapter = createDrawPixyncAdapter({
      preservesLocalHistory: true,
      apply: (input) => this.#applyRemote(input)
    });
  }
  async submitLocal(result, nextState, baseStructureEpoch) {
    const binding = this.#transport.binding;
    if (binding === void 0) {
      throw new PixyncDrawProductBridgeError("SESSION_UNAVAILABLE", "An authenticated PiXYNC session is required.");
    }
    if (binding.role === "viewer") {
      throw new PixyncDrawProductBridgeError("ROLE_FORBIDDEN", "Viewer sessions cannot submit Draw operations.");
    }
    const operation = result.operation;
    if (!RASTER_OPERATIONS.has(operation.operationType)) {
      throw new PixyncDrawProductBridgeError("OPERATION_UNSUPPORTED", "Only ordinary raster commands enter the first Draw sync slice.");
    }
    if (operation.projectId !== binding.projectId || nextState.projectId !== binding.projectId) {
      throw new PixyncDrawProductBridgeError("PROJECT_MISMATCH", "Draw state does not belong to the authenticated PiXYNC project.");
    }
    if (operation.actorId !== binding.actorId || operation.clientId !== binding.clientId) {
      throw new PixyncDrawProductBridgeError("IDENTITY_MISMATCH", "Draw command identity is not the authenticated PiXYNC binding.");
    }
    const revisions = this.#transport.snapshot();
    if (revisions.projectId !== binding.projectId) {
      throw new PixyncDrawProductBridgeError("PROJECT_MISMATCH", "PiXYNC revision state belongs to another project.");
    }
    const identity = {
      operationId: operation.operationId,
      projectId: operation.projectId,
      actorId: operation.actorId,
      clientId: operation.clientId,
      clientSequence: operation.clientSequence
    };
    const draft = await createDrawOperationDraft({
      result,
      state: nextState,
      identity: {
        ...identity,
        baseProjectRevision: revisions.projectRevision
      },
      expectedIdentity: identity,
      baseStructureEpoch
    });
    return this.#transport.submit(draft);
  }
  async #applyRemote(input) {
    const before = this.#state.current();
    if (before.state.projectId !== input.operation.projectId) {
      throw new PixyncDrawProductBridgeError("PROJECT_MISMATCH", "Remote Draw operation belongs to another active project.");
    }
    if (before.state.appliedCommandIds.includes(input.operation.commandId)) {
      const rasterHash = await drawRasterHash(before.state, input.operation.assetId);
      if (rasterHash !== input.expectedRasterHash || before.state.structureEpoch !== input.expectedStructureEpoch) {
        throw new PixyncDrawProductBridgeError("SELF_ECHO_MISMATCH", "Self echo differs from the locally committed Draw state.");
      }
      return {
        operationId: input.operation.operationId,
        projectId: input.operation.projectId,
        actorId: input.operation.actorId,
        clientId: input.operation.clientId,
        clientSequence: input.operation.clientSequence,
        baseProjectRevision: input.baseProjectRevision,
        assetId: input.operation.assetId,
        baseStructureEpoch: input.baseStructureEpoch,
        structureEpoch: before.state.structureEpoch,
        rasterHash,
        localUndoDepth: before.undoDepth,
        localRedoDepth: before.redoDepth
      };
    }
    const receipt = await this.#state.applyRemote(input);
    const after = this.#state.current();
    if (after.undoDepth !== before.undoDepth || after.redoDepth !== before.redoDepth) {
      throw new PixyncDrawProductBridgeError("HISTORY_MUTATION_FORBIDDEN", "Remote Draw apply changed local Undo/Redo history.");
    }
    return receipt;
  }
};

// src/pixync/game-product-bridge.ts
var PixyncGameProductBridgeError = class extends Error {
  code;
  constructor(code, message) {
    super(message), this.code = code;
    this.name = "PixyncGameProductBridgeError";
  }
};
function gameChangedAssetIds(project) {
  const ids = /* @__PURE__ */ new Set([
    `game-project:${String(project.projectId)}`
  ]);
  for (const scene of project.scenes) ids.add(`game-scene:${String(scene.sceneId)}`);
  for (const prefab of project.prefabs) ids.add(`game-prefab:${String(prefab.prefabId)}`);
  for (const dependency of project.dependencies) {
    ids.add(`game-dependency:${String(dependency.dependencyId)}`);
  }
  return [
    ...ids
  ].slice(0, 64);
}
function invalidation2(operation, binding, project) {
  const ids = gameChangedAssetIds(project);
  const expectedCount = 1 + project.scenes.length + project.prefabs.length + project.dependencies.length;
  return {
    projectId: operation.projectId,
    sessionGeneration: binding.sessionGeneration,
    aggregate: "game",
    operationId: operation.operationId,
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision,
    changedAssetIds: ids,
    fullRefresh: expectedCount > ids.length
  };
}
var PixyncGameProductBridge = class {
  adapter;
  #transport;
  #state;
  #onInvalidation;
  constructor(options) {
    this.#transport = options.transport;
    this.#state = options.state;
    this.#onInvalidation = options.onInvalidation;
    const canonicalPort = {
      preservesLocalHistory: true,
      current: () => this.#state.current(),
      resolveCanonicalRevision: (hash, revisionId) => this.#state.resolveCanonicalRevision(hash, revisionId),
      appendJournalCommand: async (input) => {
        const before = this.#state.current();
        const receipt = await this.#state.appendRemoteJournalCommand(input);
        const after = this.#state.current();
        if (before.undoDepth !== after.undoDepth || before.redoDepth !== after.redoDepth) {
          throw new PixyncGameProductBridgeError("HISTORY_MUTATION_FORBIDDEN", "Remote Game apply changed local Undo/Redo history.");
        }
        return receipt;
      }
    };
    const canonical = createGamePixyncAdapter(canonicalPort);
    this.adapter = {
      aggregate: "game",
      apply: async (operation, context) => {
        const binding = this.#requireBinding();
        if (this.#state.current().appliedCommandIds.includes(operation.operationId)) {
          this.#onInvalidation(invalidation2(operation, binding, await this.#resolveOperationProject(operation)));
          return;
        }
        await canonical.apply(operation, context);
        this.#onInvalidation(invalidation2(operation, binding, await this.#resolveOperationProject(operation)));
      }
    };
  }
  async submitLocal(command) {
    const binding = this.#requireBinding();
    if (binding.role === "viewer") {
      throw new PixyncGameProductBridgeError("ROLE_FORBIDDEN", "Viewer sessions cannot submit Game operations.");
    }
    if (String(command.after.projectId) !== binding.projectId) {
      throw new PixyncGameProductBridgeError("PROJECT_MISMATCH", "Game state does not belong to the authenticated PiXYNC project.");
    }
    const revisions = this.#transport.snapshot();
    if (revisions.projectId !== binding.projectId) {
      throw new PixyncGameProductBridgeError("PROJECT_MISMATCH", "PiXYNC revision state belongs to another project.");
    }
    const expectedIdentity = {
      operationId: String(command.commandId),
      projectId: binding.projectId,
      actorId: binding.actorId,
      clientId: binding.clientId,
      clientSequence: command.sequence
    };
    const draft = await createGameOperationDraft({
      command,
      identity: {
        ...expectedIdentity,
        baseProjectRevision: revisions.projectRevision,
        aggregateRevision: revisions.aggregateRevisions.game
      },
      expectedIdentity
    });
    const ack = await this.#transport.submit(draft);
    this.#onInvalidation(invalidation2(ack.operation, binding, command.after));
    return ack;
  }
  #requireBinding() {
    const binding = this.#transport.binding;
    if (binding === void 0) {
      throw new PixyncGameProductBridgeError("SESSION_UNAVAILABLE", "An authenticated PiXYNC session is required.");
    }
    return binding;
  }
  async #resolveOperationProject(operation) {
    const payload = operation.payload;
    const revision = payload.revision;
    const project = await this.#state.resolveCanonicalRevision(String(payload.afterHash), String(revision.revisionId));
    if (project === void 0) {
      throw new PixyncGameProductBridgeError("PROJECT_MISMATCH", "Canonical Game revision is unavailable after apply.");
    }
    return project;
  }
};

// src/pixync/durability.ts
var PIXYNC_DURABLE_SNAPSHOT_SCHEMA = "PIXYNC_DRAW2_DURABLE_SNAPSHOT_V1";
var PIXYNC_DURABILITY_CAPABILITY = Object.freeze({
  processDurable: false,
  productionReady: false,
  indexedDb: "UNTESTED",
  file: "UNTESTED"
});
var PixyncDurabilityError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "PixyncDurabilityError";
    this.code = code;
  }
};
function clone(value) {
  return structuredClone(value);
}
function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function validPositive(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function validNonNegative(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function nowIso(now) {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Invalid durability clock.");
  }
  return now.toISOString();
}
function leaseLive(lease, now) {
  return Date.parse(lease.expiresAt) > now.getTime();
}
function withoutLease(record2) {
  const { lease: _lease, ...rest } = record2;
  return rest;
}
function emptySnapshot(projectId) {
  return {
    schemaVersion: PIXYNC_DURABLE_SNAPSHOT_SCHEMA,
    projectId,
    revision: 0,
    confirmedProjectRevision: 0,
    snapshotHash: "",
    vault: {
      draft: [],
      committed: []
    },
    outbox: [],
    inbox: [],
    appliedOperationFingerprints: [],
    retrySchedule: []
  };
}
function snapshotBody(snapshot) {
  const { snapshotHash: _snapshotHash, ...body } = snapshot;
  return body;
}
async function sealSnapshot(snapshot) {
  const body = snapshotBody(snapshot);
  return {
    ...clone(body),
    snapshotHash: await sha256Hex2(canonicalJson2(body))
  };
}
function assertBoundedSnapshot(snapshot) {
  const serialized = JSON.stringify(snapshot);
  if (serialized.length > 512 * 1024) {
    throw new Error("PiXYNC durable snapshot exceeds its JSON bound.");
  }
  const visit = (value, depth) => {
    if (depth > 32) throw new Error("PiXYNC durable snapshot is too deep.");
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replaceAll("_", "");
      if (normalized.includes("rawbytes") || normalized.includes("blob") || normalized.includes("pointer") || normalized.includes("preview")) {
        throw new Error("PiXYNC durable snapshot contains a raw field.");
      }
      visit(child, depth + 1);
    }
  };
  visit(snapshot, 0);
}
function sameLease(left, token) {
  return left !== void 0 && left.token === token;
}
function findByOperationId(snapshot, operationId) {
  const draft = snapshot.vault.draft.find((item) => item.envelope.operationId === operationId);
  if (draft !== void 0) {
    return {
      fingerprint: draft.fingerprint,
      kind: "draft"
    };
  }
  const committed = snapshot.vault.committed.find((item) => item.envelope.operationId === operationId);
  if (committed !== void 0) {
    return {
      fingerprint: committed.fingerprint,
      kind: "committed"
    };
  }
  const outbox = snapshot.outbox.find((item) => item.operationId === operationId);
  if (outbox !== void 0) {
    return {
      fingerprint: outbox.fingerprint,
      kind: "outbox"
    };
  }
  const inbox = snapshot.inbox.find((item) => item.operationId === operationId);
  if (inbox !== void 0) {
    return {
      fingerprint: inbox.fingerprint,
      kind: "inbox"
    };
  }
  return void 0;
}
function validateLease(lease) {
  if (lease === void 0) return;
  if (typeof lease.owner !== "string" || lease.owner.length === 0 || typeof lease.token !== "string" || lease.token.length === 0 || !validDate(lease.acquiredAt) || !validDate(lease.expiresAt) || !validPositive(lease.attempt)) throw new Error("Invalid PiXYNC lease in restart snapshot.");
}
async function validatePixyncDurableSnapshot(snapshot, projectId) {
  if (snapshot === null || typeof snapshot !== "object" || snapshot.schemaVersion !== PIXYNC_DURABLE_SNAPSHOT_SCHEMA || typeof snapshot.projectId !== "string" || projectId !== void 0 && snapshot.projectId !== projectId || !validNonNegative(snapshot.revision) || !validNonNegative(snapshot.confirmedProjectRevision) || snapshot.confirmedProjectRevision !== snapshot.revision || typeof snapshot.snapshotHash !== "string" || !Array.isArray(snapshot.vault?.draft) || !Array.isArray(snapshot.vault?.committed) || !Array.isArray(snapshot.outbox) || !Array.isArray(snapshot.inbox) || !Array.isArray(snapshot.appliedOperationFingerprints) || !Array.isArray(snapshot.retrySchedule)) throw new Error("PiXYNC durable snapshot is malformed.");
  assertBoundedSnapshot(snapshot);
  const expectedSnapshotHash = await sha256Hex2(canonicalJson2(snapshotBody(snapshot)));
  if (snapshot.snapshotHash !== expectedSnapshotHash) {
    throw new Error("PiXYNC durable snapshot hash mismatch.");
  }
  const operationIds = /* @__PURE__ */ new Set();
  for (const item of snapshot.vault.draft) {
    await validatePixyncDraft(item.envelope);
    if (item.envelope.projectId !== snapshot.projectId) {
      throw new Error("PiXYNC draft project mismatch.");
    }
    if (await operationFingerprint(item.envelope) !== item.fingerprint) {
      throw new Error("PiXYNC draft fingerprint mismatch.");
    }
    operationIds.add(item.envelope.operationId);
  }
  for (const item of snapshot.vault.committed) {
    await validatePixyncCommitted(item.envelope);
    if (item.envelope.projectId !== snapshot.projectId) {
      throw new Error("PiXYNC committed project mismatch.");
    }
    if (await committedOperationFingerprint(item.envelope) !== item.fingerprint) {
      throw new Error("PiXYNC committed fingerprint mismatch.");
    }
    operationIds.add(item.envelope.operationId);
  }
  for (const item of snapshot.outbox) {
    await validatePixyncDraft(item.envelope);
    if (item.operationId !== item.envelope.operationId || item.projectId !== snapshot.projectId || await operationFingerprint(item.envelope) !== item.fingerprint || ![
      "PENDING",
      "LEASED",
      "DISPATCHED",
      "DLQ"
    ].includes(item.state) || !validNonNegative(item.attempt) || !validDate(item.nextAttemptAt)) throw new Error("PiXYNC Outbox restart record is malformed.");
    validateLease(item.lease);
    if (item.confirmedRevision !== void 0 && !validPositive(item.confirmedRevision)) {
      throw new Error("PiXYNC Outbox confirmed revision is malformed.");
    }
    operationIds.add(item.operationId);
  }
  const revisions = /* @__PURE__ */ new Map();
  for (const item of snapshot.inbox) {
    await validatePixyncCommitted(item.envelope);
    if (item.operationId !== item.envelope.operationId || item.projectId !== snapshot.projectId || await committedOperationFingerprint(item.envelope) !== item.fingerprint || ![
      "ACCEPTED",
      "LEASED",
      "COMPLETED",
      "RETRYABLE",
      "DLQ",
      "CONFLICT"
    ].includes(item.state) || !validNonNegative(item.attempt) || !validDate(item.nextAttemptAt)) throw new Error("PiXYNC Inbox restart record is malformed.");
    validateLease(item.lease);
    if (item.receipt !== void 0 && (item.receipt.operationId !== item.operationId || item.receipt.fingerprint !== item.fingerprint || item.receipt.projectRevision !== item.envelope.projectRevision)) throw new Error("PiXYNC Inbox apply receipt is malformed.");
    const prior = revisions.get(item.envelope.projectRevision);
    if (prior !== void 0 && prior !== item.operationId && item.state !== "CONFLICT") {
      throw new Error("PiXYNC snapshot has two identities at one revision.");
    }
    revisions.set(item.envelope.projectRevision, item.operationId);
    operationIds.add(item.operationId);
  }
  for (const item of snapshot.appliedOperationFingerprints) {
    if (typeof item.operationId !== "string" || typeof item.fingerprint !== "string" || !validPositive(item.projectRevision)) throw new Error("PiXYNC applied operation fingerprint is malformed.");
  }
  for (const item of snapshot.retrySchedule) {
    if (typeof item.recordId !== "string" || item.kind !== "outbox" && item.kind !== "inbox" || !validNonNegative(item.attempt) || !validDate(item.nextAttemptAt)) throw new Error("PiXYNC retry schedule is malformed.");
  }
  if (snapshot.revision < Math.max(0, ...snapshot.vault.committed.map((x) => x.envelope.projectRevision))) {
    throw new Error("PiXYNC snapshot revision regressed.");
  }
}
var PixyncDurableJournal = class _PixyncDurableJournal {
  capability = PIXYNC_DURABILITY_CAPABILITY;
  #projectId;
  #persistence;
  #leaseMs;
  #maxAttempts;
  #retryDelayMs;
  #now;
  #faultInjectors;
  #state;
  constructor(projectId, persistence, options, state2) {
    this.#projectId = projectId;
    this.#persistence = persistence;
    this.#leaseMs = options.leaseMs ?? 3e4;
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#retryDelayMs = options.retryDelayMs ?? 100;
    this.#now = options.now ?? (() => /* @__PURE__ */ new Date());
    this.#faultInjectors = [
      options.faultInjector,
      options.crashInjector
    ].filter((item) => item !== void 0);
    this.#state = clone(state2);
  }
  static async open(projectId, persistence, options = {}) {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("PiXYNC journal projectId is required.");
    }
    if (options.leaseMs !== void 0 && (!validPositive(options.leaseMs) || options.leaseMs < 1) || options.maxAttempts !== void 0 && !validPositive(options.maxAttempts) || options.retryDelayMs !== void 0 && !validNonNegative(options.retryDelayMs)) throw new Error("PiXYNC durability options are invalid.");
    const loaded = await persistence.load();
    let state2 = loaded === void 0 ? await sealSnapshot(emptySnapshot(projectId)) : clone(loaded);
    await validatePixyncDurableSnapshot(state2, projectId);
    if (loaded === void 0) {
      try {
        if (persistence.compareAndSwap !== void 0) {
          await persistence.compareAndSwap(clone(state2), null);
        } else {
          await persistence.atomicReplace(clone(state2));
        }
      } catch (error2) {
        if (persistence.compareAndSwap === void 0 || error2?.code !== "SNAPSHOT_CONFLICT") throw error2;
        const concurrent = await persistence.load();
        if (concurrent === void 0) throw error2;
        await validatePixyncDurableSnapshot(concurrent, projectId);
        state2 = clone(concurrent);
      }
    }
    const journal2 = new _PixyncDurableJournal(projectId, persistence, options, state2);
    return journal2;
  }
  snapshot() {
    return clone(this.#state);
  }
  async enqueue(draft) {
    await validatePixyncDraft(draft);
    if (draft.projectId !== this.#projectId) {
      throw new PixyncError("PROJECT_MISMATCH", "Draft belongs to another project.");
    }
    const fingerprint = await operationFingerprint(draft);
    const existing = findByOperationId(this.#state, draft.operationId);
    if (existing !== void 0) {
      if (existing.fingerprint !== fingerprint) {
        throw new PixyncDurabilityError("IDEMPOTENCY_CONFLICT", "Operation ID is bound to a different fingerprint.");
      }
      const record3 = this.#state.outbox.find((item) => item.operationId === draft.operationId);
      if (record3 !== void 0) {
        return {
          record: clone(record3),
          duplicate: true
        };
      }
      const committed = this.#state.vault.committed.find((item) => item.envelope.operationId === draft.operationId);
      if (committed !== void 0) {
        const dispatched = {
          operationId: draft.operationId,
          projectId: this.#projectId,
          envelope: clone(draft),
          fingerprint,
          state: "DISPATCHED",
          attempt: 0,
          nextAttemptAt: nowIso(this.#now()),
          confirmedRevision: committed.envelope.projectRevision
        };
        return {
          record: dispatched,
          duplicate: true
        };
      }
    }
    const now = nowIso(this.#now());
    const record2 = {
      operationId: draft.operationId,
      projectId: this.#projectId,
      envelope: clone(draft),
      fingerprint,
      state: "PENDING",
      attempt: 0,
      nextAttemptAt: now
    };
    const next = {
      ...this.#state,
      vault: {
        draft: [
          ...this.#state.vault.draft,
          {
            envelope: clone(draft),
            fingerprint
          }
        ],
        committed: [
          ...this.#state.vault.committed
        ]
      },
      outbox: [
        ...this.#state.outbox,
        record2
      ]
    };
    await this.#commit(next);
    return {
      record: clone(record2),
      duplicate: false
    };
  }
  async leaseOutbox(workerId, now = this.#now()) {
    if (workerId.length === 0 || !Number.isFinite(now.getTime())) {
      throw new Error("Invalid Outbox lease request.");
    }
    let next = clone(this.#state);
    let changed = false;
    const reclaimed = next.outbox.map((record2) => {
      if (record2.state === "LEASED" && record2.lease !== void 0 && !leaseLive(record2.lease, now)) {
        changed = true;
        if (record2.attempt >= this.#maxAttempts) {
          return {
            ...withoutLease(record2),
            state: "DLQ"
          };
        }
        return {
          ...withoutLease(record2),
          state: "PENDING",
          nextAttemptAt: nowIso(now)
        };
      }
      return record2;
    });
    next = {
      ...next,
      outbox: reclaimed
    };
    const candidate = [
      ...reclaimed
    ].filter((record2) => record2.state === "PENDING" && Date.parse(record2.nextAttemptAt) <= now.getTime()).sort((left, right) => left.nextAttemptAt.localeCompare(right.nextAttemptAt))[0];
    if (candidate === void 0) {
      if (changed) await this.#commit(next);
      return void 0;
    }
    if (candidate.attempt >= this.#maxAttempts) {
      const dlq = {
        ...withoutLease(candidate),
        state: "DLQ"
      };
      next = {
        ...next,
        outbox: next.outbox.map((item) => item.operationId === candidate.operationId ? dlq : item)
      };
      await this.#commit(next);
      return void 0;
    }
    const attempt = candidate.attempt + 1;
    const lease = {
      owner: workerId,
      token: `outbox:${candidate.operationId}:${attempt}`,
      acquiredAt: nowIso(now),
      expiresAt: new Date(now.getTime() + this.#leaseMs).toISOString(),
      attempt
    };
    const updated = {
      ...candidate,
      state: "LEASED",
      attempt,
      lease
    };
    next = {
      ...next,
      outbox: next.outbox.map((item) => item.operationId === candidate.operationId ? updated : item)
    };
    await this.#commit(next);
    return {
      ...clone(updated),
      record: clone(updated),
      lease: clone(lease)
    };
  }
  async acknowledgeOutbox(operationId, fencingToken, confirmedRevision) {
    if (!validPositive(confirmedRevision)) {
      throw new Error("Confirmed project revision must be positive.");
    }
    const record2 = this.#state.outbox.find((item) => item.operationId === operationId);
    if (record2 === void 0) throw new Error("Outbox record was not found.");
    if (record2.state === "DISPATCHED") {
      if (record2.lease?.token === fencingToken && record2.confirmedRevision === confirmedRevision) {
        return {
          record: clone(record2),
          duplicate: true
        };
      }
      throw new PixyncDurabilityError("LEASE_STALE", "ACK token is stale.");
    }
    if (record2.state !== "LEASED" || !sameLease(record2.lease, fencingToken) || !leaseLive(record2.lease, this.#now())) {
      throw new PixyncDurabilityError("LEASE_STALE", "Only the current live Outbox lease may acknowledge.");
    }
    const legacyAggregateRevision = record2.envelope.aggregateRevision || this.#state.vault.committed.filter((item) => item.envelope.aggregate === record2.envelope.aggregate).reduce((highest, item) => Math.max(highest, item.envelope.aggregateRevision), 0) + 1;
    const committed = {
      ...clone(record2.envelope),
      projectRevision: confirmedRevision,
      aggregateRevision: legacyAggregateRevision,
      committedAt: nowIso(this.#now())
    };
    return this.acknowledgeOutboxAuthoritative(operationId, fencingToken, {
      kind: "COMMITTED",
      operationId,
      projectId: committed.projectId,
      projectRevision: committed.projectRevision,
      aggregateRevision: committed.aggregateRevision,
      submissionFingerprint: await operationFingerprint(record2.envelope),
      committedFingerprint: await committedOperationFingerprint(committed),
      operation: committed
    });
  }
  /**
   * Persists the provider ACK's committed envelope verbatim after binding all
   * local draft and canonical identity fields. This is the 200 API; the
   * revision-only acknowledgeOutbox method above remains the 120 compatibility
   * path and deliberately constructs its legacy envelope before delegating.
   */
  async acknowledgeOutboxAuthoritative(operationId, fencingToken, ack) {
    const record2 = this.#state.outbox.find((item) => item.operationId === operationId);
    if (record2 === void 0) throw new Error("Outbox record was not found.");
    if (record2.state === "DISPATCHED") {
      const committed = this.#state.vault.committed.find((item) => item.envelope.operationId === operationId);
      if (record2.lease?.token === fencingToken && record2.confirmedRevision === ack.projectRevision && committed !== void 0 && committed.fingerprint === ack.committedFingerprint && JSON.stringify(committed.envelope) === JSON.stringify(ack.operation)) return {
        record: clone(record2),
        duplicate: true
      };
      throw new PixyncDurabilityError("LEASE_STALE", "ACK token is stale.");
    }
    if (record2.state !== "LEASED" || !sameLease(record2.lease, fencingToken) || !leaseLive(record2.lease, this.#now())) {
      throw new PixyncDurabilityError("LEASE_STALE", "Only the current live Outbox lease may acknowledge.");
    }
    if (ack.kind !== "COMMITTED" && ack.kind !== "DUPLICATE") {
      throw new PixyncDurabilityError("INBOX_CONFLICT", "Provider ACK kind is invalid.");
    }
    if (ack.operationId !== operationId || ack.projectId !== this.#projectId || ack.operation.operationId !== operationId || ack.operation.projectId !== this.#projectId || ack.projectRevision !== ack.operation.projectRevision || ack.aggregateRevision !== ack.operation.aggregateRevision || !validPositive(ack.projectRevision) || !validPositive(ack.aggregateRevision)) {
      throw new PixyncDurabilityError("INBOX_CONFLICT", "Provider ACK identity is not bound to its committed envelope.");
    }
    await validatePixyncCommitted(ack.operation);
    const expectedSubmissionFingerprint = record2.fingerprint;
    if (ack.submissionFingerprint !== expectedSubmissionFingerprint || await operationFingerprint(ack.operation) !== expectedSubmissionFingerprint || record2.envelope.aggregateRevision !== 0 && ack.operation.aggregateRevision !== record2.envelope.aggregateRevision) {
      throw new PixyncDurabilityError("INBOX_CONFLICT", "Provider ACK does not match the durable draft fingerprint or revision.");
    }
    const expectedCommittedFingerprint = await committedOperationFingerprint(ack.operation);
    if (ack.committedFingerprint !== expectedCommittedFingerprint) {
      throw new PixyncDurabilityError("INBOX_CONFLICT", "Provider ACK committed fingerprint is not canonical.");
    }
    const existingRevision = this.#state.vault.committed.find((item) => item.envelope.projectRevision === ack.operation.projectRevision);
    const existingInboxRevision = this.#state.inbox.find((item) => item.envelope.projectRevision === ack.operation.projectRevision && item.operationId !== operationId);
    if (existingRevision !== void 0 && existingRevision.envelope.operationId !== operationId || existingInboxRevision !== void 0) {
      throw new PixyncDurabilityError("REVISION_CONFLICT", "Confirmed revision is bound to another operation.");
    }
    const nextRecord = {
      ...record2,
      state: "DISPATCHED",
      confirmedRevision: ack.operation.projectRevision
    };
    const next = {
      ...this.#state,
      revision: Math.max(this.#state.revision, ack.operation.projectRevision),
      vault: {
        draft: this.#state.vault.draft.filter((item) => item.envelope.operationId !== operationId),
        committed: existingRevision === void 0 ? [
          ...this.#state.vault.committed,
          {
            // Preserve the provider envelope, including committedAt and all
            // canonical payload fields. No local draft reconstruction occurs.
            envelope: clone(ack.operation),
            fingerprint: ack.committedFingerprint
          }
        ] : [
          ...this.#state.vault.committed
        ]
      },
      outbox: this.#state.outbox.map((item) => item.operationId === operationId ? nextRecord : item)
    };
    await this.#commit(next);
    return {
      record: clone(nextRecord),
      duplicate: false
    };
  }
  async failOutbox(operationId, fencingToken, retryable) {
    const record2 = this.#state.outbox.find((item) => item.operationId === operationId);
    if (record2 === void 0) throw new Error("Outbox record was not found.");
    if (record2.state !== "LEASED" || !sameLease(record2.lease, fencingToken) || !leaseLive(record2.lease, this.#now())) {
      throw new PixyncDurabilityError("LEASE_STALE", "Stale Outbox lease cannot fail.");
    }
    const terminal = !retryable || record2.attempt >= this.#maxAttempts;
    const nextRecord = terminal ? {
      ...withoutLease(record2),
      state: "DLQ"
    } : {
      ...withoutLease(record2),
      state: "PENDING",
      nextAttemptAt: new Date(this.#now().getTime() + this.#retryDelayMs * 2 ** Math.min(record2.attempt, 8)).toISOString()
    };
    const next = {
      ...this.#state,
      outbox: this.#state.outbox.map((item) => item.operationId === operationId ? nextRecord : item)
    };
    await this.#commit(next);
    return {
      record: clone(nextRecord),
      duplicate: false
    };
  }
  async pruneConfirmed() {
    const removable = this.#state.outbox.filter((record2) => record2.state === "DISPATCHED" && record2.confirmedRevision !== void 0 && record2.confirmedRevision <= this.#state.confirmedProjectRevision);
    if (removable.length === 0) return 0;
    const operationIds = new Set(removable.map((record2) => record2.operationId));
    await this.#commit({
      ...this.#state,
      outbox: this.#state.outbox.filter((record2) => !operationIds.has(record2.operationId))
    });
    return removable.length;
  }
  async acceptIncoming(committed, identity) {
    await validatePixyncCommitted(committed);
    if (committed.projectId !== this.#projectId) {
      throw new PixyncError("PROJECT_MISMATCH", "Incoming operation belongs to another project.");
    }
    const fingerprint = await committedOperationFingerprint(committed);
    if (identity !== void 0 && (identity.operationId !== committed.operationId || identity.fingerprint !== fingerprint || identity.projectRevision !== committed.projectRevision)) {
      throw new PixyncDurabilityError("INBOX_CONFLICT", "Incoming provider identity is not bound to the committed operation.");
    }
    const existing = this.#state.inbox.find((item) => item.operationId === committed.operationId);
    if (existing !== void 0) {
      if (existing.fingerprint === fingerprint) {
        return {
          record: clone(existing),
          duplicate: true
        };
      }
      const conflict = {
        ...withoutLease(existing),
        state: "CONFLICT"
      };
      const next2 = {
        ...this.#state,
        inbox: this.#state.inbox.map((item) => item.operationId === committed.operationId ? conflict : item)
      };
      await this.#commit(next2);
      return {
        record: clone(conflict),
        conflict: true
      };
    }
    const sameRevision = this.#state.inbox.find((item) => item.envelope.projectRevision === committed.projectRevision && item.operationId !== committed.operationId) ?? this.#state.vault.committed.find((item) => item.envelope.projectRevision === committed.projectRevision && item.envelope.operationId !== committed.operationId);
    const record2 = {
      operationId: committed.operationId,
      projectId: this.#projectId,
      envelope: clone(committed),
      fingerprint,
      state: sameRevision === void 0 ? "ACCEPTED" : "CONFLICT",
      attempt: 0,
      nextAttemptAt: nowIso(this.#now())
    };
    const next = {
      ...this.#state,
      // Inbox acceptance is durable receipt of delivery, not canonical apply.
      revision: this.#state.revision,
      vault: {
        draft: [
          ...this.#state.vault.draft
        ],
        committed: [
          ...this.#state.vault.committed
        ]
      },
      inbox: [
        ...this.#state.inbox,
        record2
      ]
    };
    await this.#commit(next);
    return {
      record: clone(record2),
      conflict: sameRevision !== void 0,
      duplicate: false
    };
  }
  async leaseInbox(workerId, now = this.#now()) {
    if (workerId.length === 0 || !Number.isFinite(now.getTime())) {
      throw new Error("Invalid Inbox lease request.");
    }
    let next = clone(this.#state);
    let changed = false;
    const reclaimed = next.inbox.map((record2) => {
      if (record2.state === "LEASED" && record2.lease !== void 0 && !leaseLive(record2.lease, now)) {
        changed = true;
        if (record2.attempt >= this.#maxAttempts) {
          return {
            ...withoutLease(record2),
            state: "DLQ"
          };
        }
        return {
          ...withoutLease(record2),
          state: "RETRYABLE",
          nextAttemptAt: nowIso(now)
        };
      }
      return record2;
    });
    next = {
      ...next,
      inbox: reclaimed
    };
    const candidate = [
      ...reclaimed
    ].filter((record2) => (record2.state === "ACCEPTED" || record2.state === "RETRYABLE") && Date.parse(record2.nextAttemptAt) <= now.getTime()).sort((left, right) => left.envelope.projectRevision - right.envelope.projectRevision)[0];
    if (candidate === void 0) {
      if (changed) await this.#commit(next);
      return void 0;
    }
    if (candidate.attempt >= this.#maxAttempts) {
      const dlq = {
        ...withoutLease(candidate),
        state: "DLQ"
      };
      await this.#commit({
        ...next,
        inbox: next.inbox.map((item) => item.operationId === candidate.operationId ? dlq : item)
      });
      return void 0;
    }
    const attempt = candidate.attempt + 1;
    const lease = {
      owner: workerId,
      token: `inbox:${candidate.operationId}:${attempt}`,
      acquiredAt: nowIso(now),
      expiresAt: new Date(now.getTime() + this.#leaseMs).toISOString(),
      attempt
    };
    const updated = {
      ...candidate,
      state: "LEASED",
      attempt,
      lease
    };
    next = {
      ...next,
      inbox: next.inbox.map((item) => item.operationId === candidate.operationId ? updated : item)
    };
    await this.#commit(next);
    return {
      ...clone(updated),
      record: clone(updated),
      lease: clone(lease)
    };
  }
  async applyInbox(operationId, fencingToken, orderKeeper) {
    const record2 = this.#state.inbox.find((item) => item.operationId === operationId);
    if (record2 === void 0) throw new Error("Inbox record was not found.");
    if (record2.state !== "LEASED" || !sameLease(record2.lease, fencingToken) || !leaseLive(record2.lease, this.#now())) {
      throw new PixyncDurabilityError("LEASE_STALE", "Only the current live Inbox lease may apply.");
    }
    if (record2.receipt !== void 0) {
      const completed2 = {
        ...withoutLease(record2),
        state: "COMPLETED"
      };
      await this.#commit({
        ...this.#state,
        inbox: this.#state.inbox.map((item) => item.operationId === operationId ? completed2 : item)
      });
      return "recovered";
    }
    let outcome;
    try {
      outcome = await orderKeeper.receive(record2.envelope);
    } catch (error2) {
      const terminal = record2.attempt >= this.#maxAttempts;
      const failed = terminal ? {
        ...withoutLease(record2),
        state: "DLQ"
      } : {
        ...withoutLease(record2),
        state: "RETRYABLE",
        nextAttemptAt: new Date(this.#now().getTime() + this.#retryDelayMs * 2 ** Math.min(record2.attempt, 8)).toISOString()
      };
      await this.#commit({
        ...this.#state,
        inbox: this.#state.inbox.map((item) => item.operationId === operationId ? failed : item)
      });
      throw error2;
    }
    if (outcome === "gap-held") {
      const held = {
        ...withoutLease(record2),
        state: "RETRYABLE",
        nextAttemptAt: nowIso(this.#now())
      };
      await this.#commit({
        ...this.#state,
        inbox: this.#state.inbox.map((item) => item.operationId === operationId ? held : item)
      });
      return outcome;
    }
    const receipt = {
      operationId,
      fingerprint: record2.fingerprint,
      projectRevision: record2.envelope.projectRevision
    };
    const withReceipt = {
      ...record2,
      receipt
    };
    await this.#commit({
      ...withReceiptState(this.#state, withReceipt),
      revision: Math.max(this.#state.revision, record2.envelope.projectRevision)
    }, false);
    this.#inject("AFTER_APPLY_BEFORE_ACK");
    const completed = {
      ...withoutLease(withReceipt),
      state: "COMPLETED"
    };
    await this.#commit({
      ...this.#state,
      inbox: this.#state.inbox.map((item) => item.operationId === operationId ? completed : item)
    });
    return outcome;
  }
  /**
   * Builds the only safe OrderKeeper restore point: operations with a durable
   * apply receipt. A committed vault entry without a receipt is intentionally
   * excluded so an ACK persisted before local apply is still applied after a
   * restart.
   */
  orderKeeperInitialState() {
    const receipts = /* @__PURE__ */ new Map();
    for (const receipt of this.#state.appliedOperationFingerprints) {
      const inbox = this.#state.inbox.find((item2) => item2.operationId === receipt.operationId);
      if (inbox === void 0 || inbox.receipt === void 0 || inbox.receipt.fingerprint !== receipt.fingerprint || inbox.envelope.projectRevision !== receipt.projectRevision) {
        throw new PixyncDurabilityError("INVALID_STATE", "Applied receipt has no matching canonical Inbox envelope.");
      }
      const operation = inbox.envelope;
      const existing = receipts.get(operation.operationId);
      const item = {
        operationId: operation.operationId,
        fingerprint: receipt.fingerprint,
        projectRevision: operation.projectRevision,
        aggregate: operation.aggregate,
        aggregateRevision: operation.aggregateRevision
      };
      if (existing !== void 0 && JSON.stringify(existing) !== JSON.stringify(item)) {
        throw new PixyncDurabilityError("INBOX_CONFLICT", "Applied receipt identity is not deterministic.");
      }
      receipts.set(operation.operationId, item);
    }
    const appliedOperations = [
      ...receipts.values()
    ].sort((left, right) => left.projectRevision - right.projectRevision);
    const aggregateRevisions = {
      draw: 0,
      audio: 0,
      game: 0
    };
    let projectRevision = 0;
    for (const operation of appliedOperations) {
      if (operation.projectRevision !== projectRevision + 1) {
        throw new PixyncDurabilityError("REVISION_CONFLICT", "Applied receipts do not form a contiguous canonical prefix.");
      }
      if (operation.aggregateRevision !== aggregateRevisions[operation.aggregate] + 1) {
        throw new PixyncDurabilityError("REVISION_CONFLICT", "Applied aggregate receipts do not form a contiguous canonical prefix.");
      }
      aggregateRevisions[operation.aggregate] = operation.aggregateRevision;
      projectRevision = operation.projectRevision;
    }
    return {
      projectId: this.#projectId,
      projectRevision,
      aggregateRevisions,
      appliedOperations
    };
  }
  #inject(point) {
    for (const injector of this.#faultInjectors) injector(point);
  }
  async #commit(next, injectResponseCrash = true) {
    const staged = await sealSnapshot({
      ...clone(next),
      confirmedProjectRevision: next.revision,
      appliedOperationFingerprints: next.inbox.flatMap((record2) => record2.receipt === void 0 ? [] : [
        clone(record2.receipt)
      ]),
      retrySchedule: [
        ...next.outbox.filter((record2) => record2.state === "PENDING").map((record2) => ({
          recordId: record2.operationId,
          kind: "outbox",
          attempt: record2.attempt,
          nextAttemptAt: record2.nextAttemptAt
        })),
        ...next.inbox.filter((record2) => record2.state === "RETRYABLE").map((record2) => ({
          recordId: record2.operationId,
          kind: "inbox",
          attempt: record2.attempt,
          nextAttemptAt: record2.nextAttemptAt
        }))
      ]
    });
    await validatePixyncDurableSnapshot(staged, this.#projectId);
    this.#inject("BEFORE_COMMIT");
    this.#inject("AFTER_STAGE_BEFORE_PERSIST");
    if (this.#persistence.compareAndSwap !== void 0) {
      await this.#persistence.compareAndSwap(clone(staged), this.#state.snapshotHash);
    } else {
      await this.#persistence.atomicReplace(clone(staged));
    }
    if (injectResponseCrash) this.#inject("AFTER_PERSIST_BEFORE_RESPONSE");
    this.#state = clone(staged);
  }
};
function withReceiptState(snapshot, record2) {
  return {
    ...snapshot,
    inbox: snapshot.inbox.map((item) => item.operationId === record2.operationId ? record2 : item)
  };
}

// src/pixync/durable-transport.ts
var PixyncDurableTransportError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "PixyncDurableTransportError";
    this.code = code;
  }
};
var PixyncDurableTransportCoordinator = class {
  #journal;
  #transport;
  #orderKeeper;
  #workerId;
  #now;
  #tail = Promise.resolve();
  #hintCatchUp;
  #hintCatchUpPending = false;
  #onCatchUpError;
  constructor(options) {
    if (options.workerId.length === 0) {
      throw new PixyncDurableTransportError("INVALID_STATE", "A durable transport worker ID is required.");
    }
    if (options.orderKeeper.snapshot().projectId !== options.journal.snapshot().projectId) {
      throw new PixyncDurableTransportError("INVALID_STATE", "Journal and OrderKeeper must be bound to the same project.");
    }
    this.#journal = options.journal;
    this.#transport = options.transport;
    this.#orderKeeper = options.orderKeeper;
    this.#workerId = options.workerId;
    this.#now = options.now ?? (() => /* @__PURE__ */ new Date());
  }
  get journal() {
    return this.#journal;
  }
  get transport() {
    return this.#transport;
  }
  get orderKeeper() {
    return this.#orderKeeper;
  }
  async connect(input) {
    this.#onCatchUpError = input.onCatchUpError;
    const transportInput = {
      projectId: input.projectId,
      clientId: input.clientId,
      sessionGeneration: input.sessionGeneration,
      ...input.onStatus === void 0 ? {} : {
        onStatus: input.onStatus
      },
      onOperation: (event) => this.receiveRemote(event),
      onBroadcastHint: () => {
        input.onBroadcastHint?.();
        this.#requestHintCatchUp();
      }
    };
    await this.#transport.connect(transportInput);
  }
  async submit(draft) {
    return this.#serial(() => this.#submit(draft));
  }
  async receiveRemote(event) {
    return this.#serial(() => this.#receiveRemote(event));
  }
  async catchUp() {
    return this.#serial(async () => {
      const operations = await this.#transport.catchUp(this.#orderKeeper.snapshot().projectRevision);
      for (const operation of operations) {
        await this.#acceptAndDrain(operation);
      }
    });
  }
  async settleBroadcastHints() {
    await this.#hintCatchUp;
  }
  /** Reconciles ACKs and Inbox receipts left by a crashed coordinator. */
  async reconcile() {
    return this.#serial(() => this.#reconcile());
  }
  async close(reason = "closed") {
    this.#hintCatchUpPending = false;
    this.#onCatchUpError = void 0;
    return this.#serial(() => this.#transport.close(reason));
  }
  #requestHintCatchUp() {
    if (this.#hintCatchUp !== void 0) {
      this.#hintCatchUpPending = true;
      return;
    }
    const run = async () => {
      do {
        this.#hintCatchUpPending = false;
        await this.catchUp();
      } while (this.#hintCatchUpPending);
    };
    const pending = run().catch((error2) => this.#onCatchUpError?.(error2)).finally(() => {
      if (this.#hintCatchUp === pending) this.#hintCatchUp = void 0;
    });
    this.#hintCatchUp = pending;
  }
  async #submit(draft) {
    await validatePixyncDraft(draft);
    await this.#drainOutbox();
    const beforeEnqueue = this.#journal.snapshot();
    const dispatched = beforeEnqueue.outbox.find((item) => item.operationId === draft.operationId && item.state === "DISPATCHED");
    const alreadyCommitted = beforeEnqueue.vault.committed.find((item) => item.envelope.operationId === draft.operationId);
    if (dispatched !== void 0 && alreadyCommitted !== void 0) {
      if (await operationFingerprint(alreadyCommitted.envelope) !== await operationFingerprint(draft)) {
        throw new PixyncDurableTransportError("INVALID_STATE", "The committed operation ID is bound to another submission.");
      }
      await this.#acceptAndDrain(alreadyCommitted.envelope);
      return this.#duplicateAck(draft, alreadyCommitted.envelope, dispatched.fingerprint);
    }
    const queued = await this.#journal.enqueue(draft);
    const existing = this.#journal.snapshot().outbox.find((item) => item.operationId === draft.operationId);
    if (existing?.state === "DISPATCHED") {
      const committed = this.#journal.snapshot().vault.committed.find((item) => item.envelope.operationId === draft.operationId)?.envelope;
      if (committed !== void 0) {
        await this.#acceptAndDrain(committed);
        return this.#duplicateAck(draft, committed, existing.fingerprint);
      }
    }
    const lease = await this.#journal.leaseOutbox(this.#workerId, this.#now());
    if (lease === void 0 || lease.record.operationId !== draft.operationId) {
      if (queued.duplicate) {
        throw new PixyncDurableTransportError("NO_LEASE", "The durable draft is leased by another live worker.");
      }
      throw new PixyncDurableTransportError("NO_LEASE", "The durable draft could not be leased before submit.");
    }
    return this.#dispatchLease(lease);
  }
  async #dispatchLease(lease) {
    let ack;
    try {
      ack = await this.#transport.submit(lease.record.envelope);
    } catch (error2) {
      try {
        await this.#journal.failOutbox(lease.record.operationId, lease.lease.token, true);
      } catch {
      }
      throw error2;
    }
    await this.#journal.acknowledgeOutboxAuthoritative(lease.record.operationId, lease.lease.token, ack);
    await this.#acceptAndDrain(ack.operation);
    return ack;
  }
  async #receiveRemote(event) {
    if (event === null || typeof event !== "object" || event.origin !== "AUTHORITATIVE_TAIL" || event.operation === null || typeof event.operation !== "object") {
      throw new PixyncDurableTransportError("REMOTE_EVENT_INVALID", "Only an authoritative committed operation event may enter the Inbox.");
    }
    await validatePixyncCommitted(event.operation);
    await this.#acceptAndDrain(event.operation);
  }
  async #acceptAndDrain(operation) {
    await this.#journal.acceptIncoming(operation, {
      operationId: operation.operationId,
      fingerprint: await committedOperationFingerprint(operation),
      projectRevision: operation.projectRevision
    });
    await this.#drainInbox();
  }
  async #drainInbox() {
    while (true) {
      const lease = await this.#journal.leaseInbox(this.#workerId, this.#now());
      if (lease === void 0) return;
      const outcome = await this.#journal.applyInbox(lease.record.operationId, lease.lease.token, this.#orderKeeper);
      if (outcome === "gap-held") return;
    }
  }
  async #reconcile() {
    await this.#drainOutbox();
    const snapshot = this.#journal.snapshot();
    for (const committed of snapshot.vault.committed) {
      await this.#acceptAndDrain(committed.envelope);
    }
    await this.#drainInbox();
  }
  async #drainOutbox() {
    while (true) {
      const lease = await this.#journal.leaseOutbox(this.#workerId, this.#now());
      if (lease === void 0) return;
      await this.#dispatchLease(lease);
    }
  }
  async #serial(operation) {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(() => void 0, () => void 0);
    return result;
  }
  async #duplicateAck(draft, committed, submissionFingerprint) {
    return {
      kind: "DUPLICATE",
      operationId: draft.operationId,
      projectId: draft.projectId,
      projectRevision: committed.projectRevision,
      aggregateRevision: committed.aggregateRevision,
      submissionFingerprint,
      committedFingerprint: await committedOperationFingerprint(committed),
      operation: committed
    };
  }
};

// src/pixync/in-memory.ts
var AGGREGATES = [
  "draw",
  "audio",
  "game"
];
function emptyRevisions() {
  return {
    draw: 0,
    audio: 0,
    game: 0
  };
}
function adapterMap(adapters) {
  const result = /* @__PURE__ */ new Map();
  for (const adapter of adapters) {
    if (result.has(adapter.aggregate)) {
      throw new PixyncError("INVALID_ENVELOPE", "Each aggregate needs one adapter.", "adapter.aggregate");
    }
    result.set(adapter.aggregate, adapter);
  }
  for (const aggregate of AGGREGATES) {
    if (!result.has(aggregate)) {
      throw new PixyncError("INVALID_ENVELOPE", "Draw, Audio, and Game adapters are all required.", "adapters");
    }
  }
  return result;
}
var PixyncOrderKeeper = class {
  #projectId;
  #adapters;
  #pending = /* @__PURE__ */ new Map();
  #applied = /* @__PURE__ */ new Map();
  #projectRevision = 0;
  #aggregateRevisions = emptyRevisions();
  constructor(options) {
    this.#projectId = options.projectId;
    this.#adapters = adapterMap(options.adapters);
    const initialState = options.initialState;
    if (initialState !== void 0) {
      if (initialState.projectId !== options.projectId) {
        throw new PixyncError("PROJECT_MISMATCH", "OrderKeeper initial state belongs to another project.", "initialState.projectId");
      }
      if (!Number.isSafeInteger(initialState.projectRevision) || initialState.projectRevision < 0) {
        throw new PixyncError("INVALID_ENVELOPE", "OrderKeeper initial project revision is invalid.", "initialState.projectRevision");
      }
      this.#projectRevision = initialState.projectRevision;
      for (const aggregate of AGGREGATES) {
        const revision = initialState.aggregateRevisions[aggregate];
        if (!Number.isSafeInteger(revision) || revision < 0) {
          throw new PixyncError("INVALID_ENVELOPE", "OrderKeeper initial aggregate revision is invalid.", `initialState.aggregateRevisions.${aggregate}`);
        }
        this.#aggregateRevisions[aggregate] = revision;
      }
      const byRevision = /* @__PURE__ */ new Set();
      const byId = /* @__PURE__ */ new Set();
      for (const applied of initialState.appliedOperations) {
        if (byId.has(applied.operationId) || byRevision.has(applied.projectRevision) || typeof applied.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(applied.fingerprint) || !Number.isSafeInteger(applied.projectRevision) || applied.projectRevision <= 0 || applied.projectRevision > this.#projectRevision || !Number.isSafeInteger(applied.aggregateRevision) || applied.aggregateRevision <= 0) {
          throw new PixyncError("INVALID_ENVELOPE", "OrderKeeper initial operation receipt is invalid or duplicated.", "initialState.appliedOperations");
        }
        byId.add(applied.operationId);
        byRevision.add(applied.projectRevision);
        this.#applied.set(applied.operationId, applied.fingerprint);
      }
      if (byRevision.size !== this.#projectRevision) {
        throw new PixyncError("SEQUENCER_NOT_CONTIGUOUS", "OrderKeeper initial receipts do not form a complete revision prefix.", "initialState.appliedOperations");
      }
    }
  }
  snapshot() {
    return {
      projectId: this.#projectId,
      projectRevision: this.#projectRevision,
      aggregateRevisions: {
        ...this.#aggregateRevisions
      },
      operationIds: [
        ...this.#applied.keys()
      ]
    };
  }
  async receive(operation) {
    await validatePixyncCommitted(operation);
    if (operation.projectId !== this.#projectId) {
      throw new PixyncError("PROJECT_MISMATCH", "Operation belongs to another project.", "projectId");
    }
    const fingerprint = await committedOperationFingerprint(operation);
    const appliedFingerprint = this.#applied.get(operation.operationId);
    if (appliedFingerprint) {
      if (appliedFingerprint !== fingerprint) {
        throw new PixyncError("IDEMPOTENCY_CONFLICT", "Applied operation ID has a different payload.", "operationId");
      }
      return "duplicate";
    }
    const held = this.#pending.get(operation.projectRevision);
    if (held) {
      if (await committedOperationFingerprint(held) !== fingerprint) {
        throw new PixyncError("IDEMPOTENCY_CONFLICT", "Held operation revision has a different payload.", "projectRevision");
      }
      if (operation.projectRevision === this.#projectRevision + 1) {
        await this.#drain();
        return "applied";
      }
      return "duplicate";
    }
    if (operation.projectRevision <= this.#projectRevision) {
      throw new PixyncError("SEQUENCER_NOT_CONTIGUOUS", "Unknown old project revision cannot be applied.", "projectRevision");
    }
    this.#pending.set(operation.projectRevision, operation);
    if (operation.projectRevision > this.#projectRevision + 1) {
      return "gap-held";
    }
    await this.#drain();
    return "applied";
  }
  async catchUp(operations) {
    for (const operation of [
      ...operations
    ].sort((left, right) => left.projectRevision - right.projectRevision)) await this.receive(operation);
  }
  async #drain() {
    while (this.#pending.has(this.#projectRevision + 1)) {
      const operation = this.#pending.get(this.#projectRevision + 1);
      const expectedAggregateRevision = this.#aggregateRevisions[operation.aggregate] + 1;
      if (operation.aggregateRevision !== expectedAggregateRevision) {
        throw new PixyncError("AGGREGATE_REVISION_STALE", "Aggregate revision is not contiguous.", "aggregateRevision");
      }
      const adapter = this.#adapters.get(operation.aggregate);
      try {
        await adapter.apply(operation, {
          source: "remote",
          projectRevision: operation.projectRevision,
          aggregateRevision: operation.aggregateRevision
        });
      } catch {
        throw new PixyncError("AGGREGATE_APPLY_FAILED", "Remote aggregate apply failed; order keeper did not advance.", "aggregate");
      }
      this.#pending.delete(operation.projectRevision);
      this.#applied.set(operation.operationId, await committedOperationFingerprint(operation));
      this.#projectRevision = operation.projectRevision;
      this.#aggregateRevisions = {
        ...this.#aggregateRevisions,
        [operation.aggregate]: operation.aggregateRevision
      };
    }
  }
};

// src/pixync/lazy-aggregate-sync.ts
var MAX_CHANGED_IDS = 64;
var AUDIO_LEVEL_RANK = {
  CATALOG: 0,
  PLAYBACK: 1,
  EXPORT: 2
};
var GAME_LEVEL_RANK = {
  CATALOG: 0,
  EDITOR: 1,
  BUILD: 2
};
function levelForDemand(demand) {
  if (demand === "DRAW_EXPORT") return "EXPORT";
  if (demand === "DRAW_PLAYBACK") return "PLAYBACK";
  return "CATALOG";
}
function gameLevelForDemand(demand) {
  if (demand === "GAME_BUILD") return "BUILD";
  if (demand === "GAME_EDITOR") return "EDITOR";
  return "CATALOG";
}
var PixyncLazyAggregateSyncError = class extends Error {
  code;
  constructor(code, message) {
    super(message), this.code = code;
    this.name = "PixyncLazyAggregateSyncError";
  }
};
function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function normalizedIds(ids) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const value of ids) {
    const id = value.trim();
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length === MAX_CHANGED_IDS) break;
  }
  return result;
}
var PixyncLazyAggregateSync = class {
  #projectId;
  #sessionGeneration;
  #port;
  #gamePort;
  #audioDemand = /* @__PURE__ */ new Set();
  #knownAudioRevision = 0;
  #hydratedAudioRevision = 0;
  #hydratedAudioLevel;
  #pendingAudioAssetIds = /* @__PURE__ */ new Map();
  #fullAudioRefresh = false;
  #hydration;
  #hydrationAbort;
  #disposed = false;
  #gameDemand = /* @__PURE__ */ new Set();
  #knownGameRevision = 0;
  #hydratedGameRevision = 0;
  #hydratedGameLevel;
  #pendingGameAssetIds = /* @__PURE__ */ new Map();
  #fullGameRefresh = false;
  #gameHydration;
  #gameHydrationAbort;
  constructor(projectId, sessionGeneration, port, gamePort) {
    if (projectId.trim().length === 0) {
      throw new PixyncLazyAggregateSyncError("INVALID_NOTICE", "A project ID is required.");
    }
    if (!Number.isSafeInteger(sessionGeneration) || sessionGeneration < 0) {
      throw new PixyncLazyAggregateSyncError("INVALID_NOTICE", "A valid session generation is required.");
    }
    this.#projectId = projectId;
    this.#sessionGeneration = sessionGeneration;
    this.#port = port;
    this.#gamePort = gamePort;
  }
  get audioRevision() {
    return {
      known: this.#knownAudioRevision,
      hydrated: this.#hydratedAudioRevision,
      demanded: this.#audioDemand.size > 0,
      level: this.#hydratedAudioLevel
    };
  }
  get gameRevision() {
    return {
      known: this.#knownGameRevision,
      hydrated: this.#hydratedGameRevision,
      demanded: this.#gameDemand.size > 0,
      level: this.#hydratedGameLevel
    };
  }
  receive(invalidation3) {
    if (invalidation3.projectId !== this.#projectId) {
      throw new PixyncLazyAggregateSyncError("PROJECT_MISMATCH", "The invalidation belongs to another project.");
    }
    if (invalidation3.sessionGeneration !== this.#sessionGeneration) {
      throw new PixyncLazyAggregateSyncError("SESSION_MISMATCH", "The invalidation belongs to another session generation.");
    }
    if (invalidation3.operationId.trim().length === 0 || !validRevision(invalidation3.projectRevision) || !validRevision(invalidation3.aggregateRevision)) {
      throw new PixyncLazyAggregateSyncError("INVALID_NOTICE", "The invalidation metadata is invalid.");
    }
    if (invalidation3.aggregate === "game") {
      if (invalidation3.aggregateRevision <= this.#knownGameRevision) return;
      this.#knownGameRevision = invalidation3.aggregateRevision;
      const ids2 = normalizedIds(invalidation3.changedAssetIds);
      if (invalidation3.fullRefresh === true || invalidation3.changedAssetIds.length > MAX_CHANGED_IDS) {
        this.#fullGameRefresh = true;
        this.#pendingGameAssetIds.clear();
      } else if (!this.#fullGameRefresh) {
        for (const id of ids2) {
          this.#pendingGameAssetIds.set(id, invalidation3.aggregateRevision);
        }
      }
      if (this.#gameDemand.size > 0) void this.#scheduleGameHydration();
      return;
    }
    if (invalidation3.aggregate !== "audio") return;
    if (invalidation3.aggregateRevision <= this.#knownAudioRevision) return;
    this.#knownAudioRevision = invalidation3.aggregateRevision;
    const ids = normalizedIds(invalidation3.changedAssetIds);
    if (invalidation3.fullRefresh === true || invalidation3.changedAssetIds.length > MAX_CHANGED_IDS) {
      this.#fullAudioRefresh = true;
      this.#pendingAudioAssetIds.clear();
    } else if (!this.#fullAudioRefresh) {
      for (const id of ids) {
        this.#pendingAudioAssetIds.set(id, invalidation3.aggregateRevision);
      }
    }
    if (this.#audioDemand.size > 0) void this.#scheduleAudioHydration();
  }
  async demandAudio(reason) {
    this.#audioDemand.add(reason);
    await this.#scheduleAudioHydration();
  }
  releaseAudio(reason) {
    this.#audioDemand.delete(reason);
    if (this.#audioDemand.size === 0) this.#hydrationAbort?.abort();
  }
  async demandGame(reason) {
    if (this.#gamePort === void 0) return;
    this.#gameDemand.add(reason);
    await this.#scheduleGameHydration();
  }
  releaseGame(reason) {
    this.#gameDemand.delete(reason);
    if (this.#gameDemand.size === 0) this.#gameHydrationAbort?.abort();
  }
  dispose() {
    this.#disposed = true;
    this.#audioDemand.clear();
    this.#hydrationAbort?.abort();
    this.#gameHydrationAbort?.abort();
    this.#gameDemand.clear();
    this.#pendingAudioAssetIds.clear();
    this.#pendingGameAssetIds.clear();
  }
  async settled() {
    await this.#hydration;
    await this.#gameHydration;
  }
  #scheduleGameHydration() {
    if (!this.#needsGameHydration()) return Promise.resolve();
    if (this.#gameHydration !== void 0) return this.#gameHydration;
    const hydration = this.#hydrateLatestGame();
    this.#gameHydration = hydration;
    void hydration.then(() => {
      if (this.#gameHydration === hydration) this.#gameHydration = void 0;
      if (this.#needsGameHydration()) void this.#scheduleGameHydration();
    }, () => {
      if (this.#gameHydration === hydration) this.#gameHydration = void 0;
    });
    return hydration;
  }
  async #hydrateLatestGame() {
    while (this.#gameDemand.size > 0 && !this.#disposed) {
      const port = this.#gamePort;
      const level = this.#requiredGameLevel();
      if (port === void 0 || level === void 0) return;
      if (this.#hydratedGameRevision >= this.#knownGameRevision && this.#hydratedGameLevel !== void 0 && GAME_LEVEL_RANK[this.#hydratedGameLevel] >= GAME_LEVEL_RANK[level]) return;
      const requestedRevision = this.#knownGameRevision;
      const fullRefresh = this.#fullGameRefresh;
      const changedAssetIds = fullRefresh ? [] : [
        ...this.#pendingGameAssetIds.entries()
      ].filter(([, revision]) => revision <= requestedRevision).map(([id]) => id).slice(0, MAX_CHANGED_IDS);
      const abort = new AbortController();
      this.#gameHydrationAbort = abort;
      const result = await port.hydrateGame({
        projectId: this.#projectId,
        minimumGameRevision: requestedRevision,
        changedAssetIds,
        fullRefresh,
        signal: abort.signal,
        level
      });
      if (abort.signal.aborted || this.#disposed || this.#gameDemand.size === 0) return;
      if (result.projectId !== this.#projectId || result.gameRevision < requestedRevision || GAME_LEVEL_RANK[result.level] < GAME_LEVEL_RANK[level]) {
        throw new PixyncLazyAggregateSyncError("HYDRATION_MISMATCH", "Game hydration did not satisfy the authoritative revision and level.");
      }
      this.#hydratedGameRevision = result.gameRevision;
      this.#hydratedGameLevel = result.level;
      this.#fullGameRefresh = false;
      for (const [id, revision] of this.#pendingGameAssetIds) {
        if (revision <= result.gameRevision) this.#pendingGameAssetIds.delete(id);
      }
    }
  }
  #scheduleAudioHydration() {
    if (!this.#needsAudioHydration()) return Promise.resolve();
    if (this.#hydration !== void 0) return this.#hydration;
    const hydration = this.#hydrateLatest();
    this.#hydration = hydration;
    void hydration.then(() => {
      if (this.#hydration === hydration) this.#hydration = void 0;
      if (this.#needsAudioHydration()) void this.#scheduleAudioHydration();
    }, () => {
      if (this.#hydration === hydration) this.#hydration = void 0;
    });
    return hydration;
  }
  async #hydrateLatest() {
    while (this.#audioDemand.size > 0 && !this.#disposed) {
      const level = this.#requiredAudioLevel();
      if (level === void 0) return;
      if (this.#hydratedAudioRevision >= this.#knownAudioRevision && this.#hydratedAudioLevel !== void 0 && AUDIO_LEVEL_RANK[this.#hydratedAudioLevel] >= AUDIO_LEVEL_RANK[level]) return;
      const requestedRevision = this.#knownAudioRevision;
      const fullRefresh = this.#fullAudioRefresh;
      const changedAssetIds = fullRefresh ? [] : [
        ...this.#pendingAudioAssetIds.entries()
      ].filter(([, revision]) => revision <= requestedRevision).map(([id]) => id).slice(0, MAX_CHANGED_IDS);
      const abort = new AbortController();
      this.#hydrationAbort = abort;
      const result = await this.#port.hydrateAudio({
        projectId: this.#projectId,
        minimumAudioRevision: requestedRevision,
        changedAssetIds,
        fullRefresh,
        signal: abort.signal,
        level
      });
      if (abort.signal.aborted || this.#disposed || this.#audioDemand.size === 0) {
        return;
      }
      if (result.projectId !== this.#projectId || result.audioRevision < requestedRevision || AUDIO_LEVEL_RANK[result.level] < AUDIO_LEVEL_RANK[level]) {
        throw new PixyncLazyAggregateSyncError("HYDRATION_MISMATCH", "Audio hydration did not return the requested canonical revision.");
      }
      this.#hydratedAudioRevision = result.audioRevision;
      this.#hydratedAudioLevel = result.level;
      if (fullRefresh) {
        this.#fullAudioRefresh = false;
      } else {
        for (const id of changedAssetIds) {
          const revision = this.#pendingAudioAssetIds.get(id);
          if (revision !== void 0 && revision <= requestedRevision) {
            this.#pendingAudioAssetIds.delete(id);
          }
        }
      }
      if (this.#hydrationAbort === abort) this.#hydrationAbort = void 0;
    }
  }
  #requiredAudioLevel() {
    let selected;
    for (const demand of this.#audioDemand) {
      const candidate = levelForDemand(demand);
      if (selected === void 0 || AUDIO_LEVEL_RANK[candidate] > AUDIO_LEVEL_RANK[selected]) selected = candidate;
    }
    return selected;
  }
  #needsAudioHydration() {
    if (this.#disposed || this.#audioDemand.size === 0) return false;
    const required = this.#requiredAudioLevel();
    if (required === void 0) return false;
    return this.#hydratedAudioRevision < this.#knownAudioRevision || this.#hydratedAudioLevel === void 0 || AUDIO_LEVEL_RANK[this.#hydratedAudioLevel] < AUDIO_LEVEL_RANK[required];
  }
  #requiredGameLevel() {
    let selected;
    for (const demand of this.#gameDemand) {
      const candidate = gameLevelForDemand(demand);
      if (selected === void 0 || GAME_LEVEL_RANK[candidate] > GAME_LEVEL_RANK[selected]) selected = candidate;
    }
    return selected;
  }
  #needsGameHydration() {
    if (this.#disposed || this.#gamePort === void 0 || this.#gameDemand.size === 0) return false;
    const required = this.#requiredGameLevel();
    if (required === void 0) return false;
    return this.#hydratedGameRevision < this.#knownGameRevision || this.#hydratedGameLevel === void 0 || GAME_LEVEL_RANK[this.#hydratedGameLevel] < GAME_LEVEL_RANK[required];
  }
};

// src/pixync/supabase-sdk-port.ts
function channelPort(channel) {
  return {
    on(type, filter, callback) {
      channel.on(type, filter, callback);
      return this;
    },
    subscribe() {
      return new Promise((resolve) => {
        let settled = false;
        channel.subscribe((status2, error2) => {
          if (settled) return;
          if (status2 === "SUBSCRIBED") {
            settled = true;
            resolve({
              data: null,
              error: null
            });
          } else if (status2 === "CHANNEL_ERROR" || status2 === "TIMED_OUT" || status2 === "CLOSED") {
            settled = true;
            resolve({
              data: null,
              error: error2 ?? new Error(`Realtime ${status2}`)
            });
          }
        });
      });
    },
    async unsubscribe() {
      try {
        await channel.unsubscribe();
        return {
          data: null,
          error: null
        };
      } catch (error2) {
        return {
          data: null,
          error: error2
        };
      }
    }
  };
}
function createPixyncSupabaseSdkPort(client) {
  return {
    auth: client.auth,
    rpc: (functionName, args) => client.rpc(functionName, args),
    channel: (name) => channelPort(client.channel(name, {
      config: {
        private: true
      }
    }))
  };
}

// src/pixync/supabase-provider.ts
var OPEN_SESSION_RPC = "pixync_draw2_open_session_v1";
var COMMIT_RPC = "pixync_draw2_commit_operation_v1";
var FETCH_RPC = "pixync_draw2_get_operations_since_v1";
var REALTIME_EVENT = "pixync_hint";
var SAFE_ID3 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var SHA2563 = /^[a-f0-9]{64}$/u;
var REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
var PixyncSupabaseProviderError = class extends Error {
  code;
  path;
  constructor(code, message, path) {
    super(message);
    this.name = "PixyncSupabaseProviderError";
    this.code = code;
    this.path = path;
  }
};
function isRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fail2(code, message, path) {
  throw new PixyncSupabaseProviderError(code, message, path);
}
function assertSafeId2(value, path) {
  if (typeof value !== "string" || !SAFE_ID3.test(value)) {
    fail2("INVALID_INPUT", "A bounded stable identifier is required.", path);
  }
}
function assertUuid(value, path) {
  if (typeof value !== "string" || !UUID.test(value)) {
    fail2("ROW_INVALID", "A canonical UUID is required.", path);
  }
}
function assertRevision(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail2("ROW_INVALID", "A non-negative safe integer revision is required.", path);
  }
}
function assertPositiveRevision(value, path) {
  assertRevision(value, path);
  if (value === 0) {
    fail2("ROW_INVALID", "A committed revision must be positive.", path);
  }
}
function assertSha256(value, path) {
  if (typeof value !== "string" || !SHA2563.test(value)) {
    fail2("ROW_INVALID", "A lowercase SHA-256 fingerprint is required.", path);
  }
}
function assertRevisionToken(value, path) {
  if (typeof value !== "string" || !REVISION.test(value)) {
    fail2("ROW_INVALID", "A bounded membership revision is required.", path);
  }
}
function assertExactKeys(value, keys, path) {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== expected.size || actual.some((key) => !expected.has(key))) {
    fail2("ROW_INVALID", "RPC row contains an unexpected or missing field.", path);
  }
}
function resultError(error2) {
  if (error2 instanceof Error) return error2.message;
  if (typeof error2 === "string") return error2;
  return "The Supabase-like port returned an error.";
}
function assertPortResult(value, path) {
  if (!isRecord3(value) || !("data" in value) || !("error" in value)) {
    fail2("RPC_ERROR", "The port returned an invalid result envelope.", path);
  }
  if (value.error !== null && value.error !== void 0) {
    fail2("RPC_ERROR", resultError(value.error), `${path}.error`);
  }
}
function parseAuthUser(value) {
  if (!isRecord3(value)) {
    fail2("AUTH_ERROR", "Auth returned an invalid result.", "auth");
  }
  if (value.error !== null && value.error !== void 0) {
    fail2("AUTH_ERROR", resultError(value.error), "auth.error");
  }
  if (!isRecord3(value.data) || value.data.user === null) {
    fail2("AUTH_REQUIRED", "A server-validated authenticated user is required.", "auth.data.user");
  }
  if (!isRecord3(value.data.user)) {
    fail2("AUTH_ERROR", "Auth returned an invalid user row.", "auth.data.user");
  }
  assertUuid(value.data.user.id, "auth.data.user.id");
  return Object.freeze({
    userId: value.data.user.id
  });
}
function parseSessionRow(value, requested, user) {
  if (value === null) {
    fail2("MEMBERSHIP_FORBIDDEN", "No active canonical project membership is available.", "data");
  }
  if (!isRecord3(value)) {
    fail2("ROW_INVALID", "open_session must return one object row.", "data");
  }
  assertExactKeys(value, [
    "principal_id",
    "project_id",
    "room_id",
    "actor_id",
    "membership_id",
    "membership_revision",
    "client_id",
    "session_generation",
    "role"
  ], "data");
  assertUuid(value.principal_id, "data.principal_id");
  assertSafeId2(value.project_id, "data.project_id");
  assertUuid(value.room_id, "data.room_id");
  assertUuid(value.actor_id, "data.actor_id");
  assertUuid(value.membership_id, "data.membership_id");
  assertRevisionToken(value.membership_revision, "data.membership_revision");
  assertSafeId2(value.client_id, "data.client_id");
  assertRevision(value.session_generation, "data.session_generation");
  if (value.role !== "owner" && value.role !== "editor" && value.role !== "viewer") {
    fail2("ROW_INVALID", "open_session returned an invalid role.", "data.role");
  }
  if (value.principal_id !== user.userId) {
    fail2("MEMBERSHIP_FORBIDDEN", "Membership is not bound to the authenticated user.", "data.principal_id");
  }
  if (value.project_id !== requested.projectId) {
    fail2("MEMBERSHIP_FORBIDDEN", "Membership is not bound to the requested project.", "data.project_id");
  }
  if (value.client_id !== requested.clientId || value.session_generation !== requested.sessionGeneration) {
    fail2("SESSION_STALE", "The server session does not match the fixed local client generation.", "data.session_generation");
  }
  return {
    principalId: value.principal_id,
    projectId: value.project_id,
    roomId: value.room_id,
    actorId: value.actor_id,
    membershipId: value.membership_id,
    membershipRevision: value.membership_revision,
    clientId: value.client_id,
    sessionGeneration: value.session_generation,
    role: value.role
  };
}
async function parseCommittedOperation(value, path) {
  if (!isRecord3(value)) {
    fail2("ROW_INVALID", "RPC returned an invalid committed operation.", path);
  }
  try {
    await validatePixyncCommitted(value);
  } catch (error2) {
    fail2("ROW_INVALID", error2 instanceof Error ? error2.message : "Invalid committed operation.", path);
  }
  return value;
}
function bindingFromSession(row) {
  return Object.freeze({
    projectId: row.projectId,
    roomId: row.roomId,
    actorId: row.actorId,
    clientId: row.clientId,
    role: row.role,
    sessionGeneration: row.sessionGeneration
  });
}
function sameBinding(left, right) {
  return left.projectId === right.projectId && left.roomId === right.roomId && left.actorId === right.actorId && left.clientId === right.clientId && left.role === right.role && left.sessionGeneration === right.sessionGeneration;
}
function sameSession(left, right) {
  return left.principalId === right.principalId && left.projectId === right.projectId && left.roomId === right.roomId && left.actorId === right.actorId && left.membershipId === right.membershipId && left.membershipRevision === right.membershipRevision && left.clientId === right.clientId && left.sessionGeneration === right.sessionGeneration && left.role === right.role;
}
function assertCurrentOperationIdentity(operation, binding) {
  if (operation.projectId !== binding.projectId || operation.clientId !== binding.clientId || operation.actorId !== binding.actorId) {
    fail2("SESSION_STALE", "Operation identity does not match canonical membership.", "operation");
  }
}
async function parseAckRow(value, submitted) {
  if (!isRecord3(value)) {
    fail2("ROW_INVALID", "commit RPC must return one ACK row.", "data");
  }
  assertExactKeys(value, [
    "kind",
    "operation_id",
    "project_id",
    "project_revision",
    "aggregate_revision",
    "submission_fingerprint",
    "committed_fingerprint",
    "operation"
  ], "data");
  if (value.kind !== "COMMITTED" && value.kind !== "DUPLICATE") {
    fail2("ROW_INVALID", "commit RPC returned an invalid ACK kind.", "data.kind");
  }
  assertSafeId2(value.operation_id, "data.operation_id");
  assertSafeId2(value.project_id, "data.project_id");
  assertPositiveRevision(value.project_revision, "data.project_revision");
  assertPositiveRevision(value.aggregate_revision, "data.aggregate_revision");
  assertSha256(value.submission_fingerprint, "data.submission_fingerprint");
  assertSha256(value.committed_fingerprint, "data.committed_fingerprint");
  const operation = await parseCommittedOperation(value.operation, "data.operation");
  if (value.operation_id !== submitted.operationId || value.project_id !== submitted.projectId || operation.operationId !== submitted.operationId || operation.projectId !== submitted.projectId || operation.projectRevision !== value.project_revision || operation.aggregateRevision !== value.aggregate_revision) {
    fail2("ROW_INVALID", "ACK identity or revision does not match the submitted operation.", "data");
  }
  const submittedFingerprint = await operationFingerprint(submitted);
  if (value.submission_fingerprint !== submittedFingerprint) {
    fail2("ROW_INVALID", "ACK submission fingerprint is not canonical.", "data.submission_fingerprint");
  }
  if (await operationFingerprint(operation) !== submittedFingerprint) {
    fail2("ROW_INVALID", "ACK operation differs from the submitted operation.", "data.operation");
  }
  const committedFingerprint = await committedOperationFingerprint(operation);
  if (value.committed_fingerprint !== committedFingerprint) {
    fail2("ROW_INVALID", "ACK committed fingerprint is not canonical.", "data.committed_fingerprint");
  }
  return {
    kind: value.kind,
    operationId: value.operation_id,
    projectId: value.project_id,
    projectRevision: value.project_revision,
    aggregateRevision: value.aggregate_revision,
    submissionFingerprint: value.submission_fingerprint,
    committedFingerprint: value.committed_fingerprint,
    operation
  };
}
async function parseFetchRows(value, projectId, afterProjectRevision) {
  if (!Array.isArray(value)) {
    fail2("ROW_INVALID", "fetch RPC must return an array of rows.", "data");
  }
  const operations = [];
  let expectedRevision = afterProjectRevision + 1;
  for (const [index, row] of value.entries()) {
    const operation = await parseCommittedOperation(row, `data[${index}]`);
    if (operation.projectId !== projectId) {
      fail2("ROW_INVALID", "fetch RPC returned another project's operation.", `data[${index}].projectId`);
    }
    if (operation.projectRevision !== expectedRevision) {
      fail2("ROW_INVALID", "fetch RPC returned a non-contiguous revision.", `data[${index}].projectRevision`);
    }
    operations.push(operation);
    expectedRevision += 1;
  }
  return operations;
}
var PixyncSupabaseProvider = class {
  #port;
  constructor(options) {
    if (!isRecord3(options) || !isRecord3(options.port)) {
      fail2("INVALID_INPUT", "A Supabase-like port is required.", "port");
    }
    this.#port = options.port;
  }
  async open(input) {
    assertSafeId2(input.projectId, "projectId");
    assertSafeId2(input.clientId, "clientId");
    assertRevision(input.sessionGeneration, "sessionGeneration");
    if (typeof input.onAuthoritativeOperation !== "function") {
      fail2("INVALID_INPUT", "An authoritative operation callback is required.", "onAuthoritativeOperation");
    }
    if (typeof input.onBroadcastHint !== "function") {
      fail2("INVALID_INPUT", "A broadcast hint callback is required.", "onBroadcastHint");
    }
    if (typeof input.onStatus !== "function") {
      fail2("INVALID_INPUT", "A status callback is required.", "onStatus");
    }
    input.onStatus("CONNECTING");
    let session;
    try {
      session = await this.#resolveSession(input);
    } catch (error2) {
      input.onStatus("OFFLINE");
      throw error2;
    }
    const binding = bindingFromSession(session);
    let channel;
    try {
      channel = this.#port.channel(`pixync:room:${binding.roomId}`);
      if (!isRecord3(channel) || typeof channel.on !== "function" || typeof channel.subscribe !== "function" || typeof channel.unsubscribe !== "function") {
        fail2("REALTIME_ERROR", "The Realtime port is incomplete.", "channel");
      }
    } catch (error2) {
      input.onStatus("OFFLINE");
      if (error2 instanceof PixyncSupabaseProviderError) throw error2;
      fail2("REALTIME_ERROR", error2 instanceof Error ? error2.message : "Realtime channel creation failed.");
    }
    let active;
    try {
      active = {
        binding,
        session,
        input,
        channel: channel.on("broadcast", {
          event: REALTIME_EVENT
        }, () => {
          if (active.closed) return;
          input.onBroadcastHint();
        }),
        closed: false
      };
      const subscribed = await channel.subscribe();
      if (subscribed !== void 0) {
        assertPortResult(subscribed, "channel.subscribe");
      }
    } catch (error2) {
      await Promise.resolve(channel.unsubscribe());
      input.onStatus("OFFLINE");
      if (error2 instanceof PixyncSupabaseProviderError) {
        if (error2.code === "RPC_ERROR") {
          throw new PixyncSupabaseProviderError("REALTIME_ERROR", error2.message, error2.path);
        }
        throw error2;
      }
      fail2("REALTIME_ERROR", error2 instanceof Error ? error2.message : "Realtime subscription failed.");
    }
    const connection = this.#connection(active);
    input.onStatus("SUBSCRIBED");
    return {
      binding,
      connection
    };
  }
  async #resolveSession(input) {
    const authResult = await this.#port.auth.getUser();
    const user = parseAuthUser(authResult);
    let result;
    try {
      result = await this.#port.rpc(OPEN_SESSION_RPC, {
        p_project_id: input.projectId,
        p_client_id: input.clientId,
        p_session_generation: input.sessionGeneration
      });
    } catch (error2) {
      fail2("RPC_ERROR", error2 instanceof Error ? error2.message : "open_session RPC failed.");
    }
    assertPortResult(result, OPEN_SESSION_RPC);
    return parseSessionRow(result.data, input, user);
  }
  #connection(active) {
    const ensureOpen = () => {
      if (active.closed) {
        fail2("SESSION_CLOSED", "The provider connection is closed.");
      }
    };
    const recheck = async () => {
      ensureOpen();
      let row;
      try {
        row = await this.#resolveSession(active.input);
      } catch (error2) {
        await closeActive("authorization-rejected");
        if (error2 instanceof PixyncSupabaseProviderError) {
          if (error2.code === "AUTH_REQUIRED" || error2.code === "MEMBERSHIP_FORBIDDEN") {
            throw new PixyncSupabaseProviderError("SESSION_STALE", error2.message, error2.path);
          }
          throw error2;
        }
        throw error2;
      }
      const current = bindingFromSession(row);
      if (!sameBinding(current, active.binding) || !sameSession(row, active.session)) {
        await closeActive("stale-session");
        fail2("SESSION_STALE", "Authentication or canonical membership changed.", "session");
      }
    };
    const closeActive = async (reason) => {
      if (active.closed) return;
      active.closed = true;
      try {
        await Promise.resolve(active.channel.unsubscribe());
      } finally {
        active.input.onStatus("CLOSED");
      }
      void reason;
    };
    return {
      submit: async (operation) => {
        await recheck();
        ensureOpen();
        await validatePixyncDraft(operation);
        assertCurrentOperationIdentity(operation, active.binding);
        if (active.binding.role === "viewer") {
          fail2("ROLE_FORBIDDEN", "Viewer membership cannot submit operations.", "binding.role");
        }
        let result;
        try {
          result = await this.#port.rpc(COMMIT_RPC, {
            p_project_id: active.binding.projectId,
            p_client_id: active.binding.clientId,
            p_session_generation: active.binding.sessionGeneration,
            p_operation: operation
          });
        } catch (error2) {
          fail2("RPC_ERROR", error2 instanceof Error ? error2.message : "commit RPC failed.");
        }
        await recheck();
        assertPortResult(result, COMMIT_RPC);
        return parseAckRow(result.data, operation);
      },
      fetchSince: async (afterProjectRevision) => {
        ensureOpen();
        if (!Number.isSafeInteger(afterProjectRevision) || afterProjectRevision < 0) {
          fail2("INVALID_INPUT", "A non-negative safe revision is required.", "afterProjectRevision");
        }
        await recheck();
        let result;
        try {
          result = await this.#port.rpc(FETCH_RPC, {
            p_project_id: active.binding.projectId,
            p_after_project_revision: afterProjectRevision,
            p_client_id: active.binding.clientId,
            p_session_generation: active.binding.sessionGeneration
          });
        } catch (error2) {
          fail2("RPC_ERROR", error2 instanceof Error ? error2.message : "fetch RPC failed.");
        }
        await recheck();
        assertPortResult(result, FETCH_RPC);
        return parseFetchRows(result.data, active.binding.projectId, afterProjectRevision);
      },
      close: async (reason = "closed") => {
        void reason;
        await closeActive(reason);
      }
    };
  }
};
var PIXYNC_SUPABASE_RPC_NAMES = Object.freeze({
  openSession: OPEN_SESSION_RPC,
  commit: COMMIT_RPC,
  fetchSince: FETCH_RPC,
  realtimeEvent: REALTIME_EVENT
});

// src/pixync/transport.ts
var SAFE_ID4 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
var PixyncTransportError = class extends Error {
  code;
  path;
  constructor(code, message, path) {
    super(message);
    this.name = "PixyncTransportError";
    this.code = code;
    this.path = path;
  }
};
function isRecord4(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function invalid(message, path) {
  throw new PixyncTransportError("INVALID_INPUT", message, path);
}
function assertSafeId3(value, path) {
  if (typeof value !== "string" || !SAFE_ID4.test(value)) {
    invalid("A bounded stable identifier is required.", path);
  }
}
function assertRevision2(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    invalid("A non-negative safe integer is required.", path);
  }
}
function assertBindingId(value, path) {
  if (typeof value !== "string" || !SAFE_ID4.test(value)) {
    transportFailure("BINDING_INVALID", "Provider binding contains an invalid identifier.", path);
  }
}
function assertBindingGeneration(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    transportFailure("BINDING_INVALID", "Provider binding contains an invalid session generation.", path);
  }
}
function assertCallback(value, path) {
  if (typeof value !== "function") invalid("A callback is required.", path);
}
function transportFailure(code, message, path) {
  throw new PixyncTransportError(code, message, path);
}
function sameBinding2(left, right) {
  return left.projectId === right.projectId && left.roomId === right.roomId && left.actorId === right.actorId && left.clientId === right.clientId && left.role === right.role && left.sessionGeneration === right.sessionGeneration;
}
function authenticatedBinding(value, request) {
  if (!isRecord4(value)) {
    transportFailure("BINDING_INVALID", "Provider open must return an authenticated binding.", "binding");
  }
  assertBindingId(value.projectId, "binding.projectId");
  assertBindingId(value.roomId, "binding.roomId");
  assertBindingId(value.actorId, "binding.actorId");
  assertBindingId(value.clientId, "binding.clientId");
  assertBindingGeneration(value.sessionGeneration, "binding.sessionGeneration");
  if (value.role !== "owner" && value.role !== "editor" && value.role !== "viewer") {
    transportFailure("BINDING_INVALID", "Provider binding must contain an authenticated role.", "binding.role");
  }
  if (value.projectId !== request.projectId || value.clientId !== request.clientId || value.sessionGeneration !== request.sessionGeneration) {
    transportFailure("IDENTITY_MISMATCH", "Authenticated binding does not match the local connection request.", "binding");
  }
  return Object.freeze({
    projectId: value.projectId,
    roomId: value.roomId,
    actorId: value.actorId,
    clientId: value.clientId,
    role: value.role,
    sessionGeneration: value.sessionGeneration
  });
}
function providerConnection(value) {
  if (!isRecord4(value)) {
    transportFailure("BINDING_INVALID", "Provider open must return a connection.", "connection");
  }
  for (const method of [
    "submit",
    "fetchSince",
    "close"
  ]) {
    if (typeof value[method] !== "function") {
      transportFailure("BINDING_INVALID", "Provider connection is incomplete.", `connection.${method}`);
    }
  }
  return value;
}
var PixyncTransportAdapter = class {
  provider;
  #active;
  #attempt;
  #highestSessionGeneration;
  #status;
  #statusSink;
  constructor(provider) {
    this.provider = provider;
    this.#attempt = 0;
    this.#highestSessionGeneration = -1;
    this.#status = "CLOSED";
  }
  get status() {
    return this.#status;
  }
  get binding() {
    return this.#active?.binding;
  }
  get projectId() {
    return this.#active?.binding.projectId;
  }
  get clientId() {
    return this.#active?.binding.clientId;
  }
  get sessionGeneration() {
    return this.#active?.binding.sessionGeneration;
  }
  async connect(input) {
    assertSafeId3(input.projectId, "projectId");
    assertSafeId3(input.clientId, "clientId");
    assertRevision2(input.sessionGeneration, "sessionGeneration");
    assertCallback(input.onOperation, "onOperation");
    if (input.onBroadcastHint !== void 0) {
      assertCallback(input.onBroadcastHint, "onBroadcastHint");
    }
    if (input.onStatus !== void 0) {
      assertCallback(input.onStatus, "onStatus");
    }
    if (input.sessionGeneration <= this.#highestSessionGeneration) {
      transportFailure("STALE_SESSION", "A transport session generation must increase monotonically.", "sessionGeneration");
    }
    await this.close("replaced");
    const token = ++this.#attempt;
    this.#highestSessionGeneration = input.sessionGeneration;
    this.#statusSink = input.onStatus;
    this.#setStatus("CONNECTING");
    let authoritativeBinding;
    const providerInput = {
      projectId: input.projectId,
      clientId: input.clientId,
      sessionGeneration: input.sessionGeneration,
      onAuthoritativeOperation: async (event) => {
        if (token !== this.#attempt) return;
        if (!isRecord4(event) || event.origin !== "AUTHORITATIVE_TAIL" || !isRecord4(event.operation)) {
          transportFailure("AUTHORITATIVE_EVENT_INVALID", "Only AUTHORITATIVE_TAIL operation events are accepted.", "event.origin");
        }
        await validatePixyncCommitted(event.operation);
        const active = this.#active;
        if (token !== this.#attempt || active?.token !== token || this.#status !== "SUBSCRIBED" || authoritativeBinding === void 0 || !sameBinding2(active.binding, authoritativeBinding)) return;
        const operation = event.operation;
        if (operation.projectId !== active.binding.projectId) {
          transportFailure("IDENTITY_MISMATCH", "Authoritative tail delivered another project's operation.", "event.operation.projectId");
        }
        await input.onOperation({
          origin: "AUTHORITATIVE_TAIL",
          operation
        });
      },
      onBroadcastHint: () => {
        const active = this.#active;
        if (token !== this.#attempt || active?.token !== token || this.#status !== "SUBSCRIBED" || authoritativeBinding === void 0 || !sameBinding2(active.binding, authoritativeBinding)) return;
        input.onBroadcastHint?.();
      },
      onStatus: (status2) => {
        if (token !== this.#attempt) return;
        if (status2 === "SUBSCRIBED" && this.#active?.token !== token) return;
        this.#setStatus(status2);
      }
    };
    let result;
    try {
      result = await this.provider.open(providerInput);
    } catch (error2) {
      if (token === this.#attempt) this.#setStatus("OFFLINE");
      throw error2;
    }
    if (!isRecord4(result)) {
      transportFailure("BINDING_INVALID", "Provider open returned an invalid result.");
    }
    const connection = providerConnection(result.connection);
    let binding;
    try {
      binding = authenticatedBinding(result.binding, input);
    } catch (error2) {
      await connection.close("binding-rejected");
      if (token === this.#attempt) this.#setStatus("OFFLINE");
      throw error2;
    }
    if (token !== this.#attempt) {
      await connection.close("stale-open");
      transportFailure("STALE_SESSION", "The provider opened a connection after the session was replaced.");
    }
    authoritativeBinding = binding;
    this.#active = {
      token,
      binding,
      connection
    };
    if (this.#status === "CONNECTING") this.#setStatus("SUBSCRIBED");
  }
  async submit(operation) {
    const active = this.#requireActive();
    await validatePixyncDraft(operation);
    if (operation.projectId !== active.binding.projectId || operation.clientId !== active.binding.clientId || operation.actorId !== active.binding.actorId) {
      transportFailure("IDENTITY_MISMATCH", "Operation identity does not match the authenticated binding.", "operation");
    }
    if (active.binding.role === "viewer") {
      transportFailure("ROLE_FORBIDDEN", "Viewer bindings cannot submit operations.", "binding.role");
    }
    const ack = await active.connection.submit(operation);
    if (!this.#isCurrent(active)) {
      transportFailure("STALE_SESSION", "The authenticated session changed while the operation was submitted.");
    }
    return this.#validateAck(operation, ack);
  }
  async catchUp(afterProjectRevision) {
    const active = this.#requireActive();
    assertRevision2(afterProjectRevision, "afterProjectRevision");
    const operations = await active.connection.fetchSince(afterProjectRevision);
    if (!this.#isCurrent(active)) {
      transportFailure("STALE_SESSION", "The authenticated session changed while catch-up was requested.");
    }
    if (!Array.isArray(operations)) {
      transportFailure("CATCH_UP_INVALID", "Provider catch-up must return an array of committed operations.");
    }
    let expectedRevision = afterProjectRevision + 1;
    for (const operation of operations) {
      try {
        await validatePixyncCommitted(operation);
      } catch (error2) {
        transportFailure("CATCH_UP_INVALID", error2 instanceof Error ? error2.message : "Provider catch-up contained an invalid operation.", "operations");
      }
      if (operation.projectId !== active.binding.projectId) {
        transportFailure("IDENTITY_MISMATCH", "Provider catch-up contained another project's operation.", "operations.projectId");
      }
      if (operation.projectRevision !== expectedRevision) {
        transportFailure("CATCH_UP_INVALID", "Provider catch-up must be contiguous from afterProjectRevision + 1.", "operations.projectRevision");
      }
      expectedRevision += 1;
    }
    return operations;
  }
  async close(reason = "closed") {
    const active = this.#active;
    this.#active = void 0;
    ++this.#attempt;
    this.#setStatus("CLOSED");
    if (active === void 0) return;
    await active.connection.close(reason);
  }
  #requireActive() {
    if (this.#active === void 0 || this.#status !== "SUBSCRIBED") {
      transportFailure("SESSION_NOT_OPEN", "A subscribed authenticated transport session is required.");
    }
    return this.#active;
  }
  #isCurrent(active) {
    return active.token === this.#attempt && this.#active?.token === active.token && this.#status === "SUBSCRIBED" && sameBinding2(this.#active.binding, active.binding);
  }
  #setStatus(status2) {
    this.#status = status2;
    this.#statusSink?.(status2);
  }
  async #validateAck(submitted, ack) {
    if (ack === null || typeof ack !== "object" || ack.kind !== "COMMITTED" && ack.kind !== "DUPLICATE") {
      transportFailure("ACK_INVALID", "Provider returned an invalid ACK.");
    }
    if (ack.operationId !== submitted.operationId || ack.projectId !== submitted.projectId) {
      transportFailure("ACK_INVALID", "ACK identity does not match the submitted operation.", "ack.operationId");
    }
    try {
      await validatePixyncCommitted(ack.operation);
    } catch (error2) {
      transportFailure("ACK_INVALID", error2 instanceof Error ? error2.message : "ACK contains an invalid committed operation.", "ack.operation");
    }
    if (ack.operation.operationId !== submitted.operationId || ack.operation.projectId !== submitted.projectId || ack.operation.projectRevision !== ack.projectRevision || ack.operation.aggregateRevision !== ack.aggregateRevision || ack.operation.aggregateRevision <= 0 || submitted.aggregateRevision !== 0 && ack.operation.aggregateRevision !== submitted.aggregateRevision) {
      transportFailure("ACK_INVALID", "ACK committed operation does not match its envelope metadata.", "ack.operation");
    }
    const submittedFingerprint = await operationFingerprint(submitted);
    if (ack.submissionFingerprint !== submittedFingerprint) {
      transportFailure("ACK_INVALID", "ACK submission fingerprint does not match the submitted operation.", "ack.submissionFingerprint");
    }
    if (await operationFingerprint(ack.operation) !== submittedFingerprint) {
      transportFailure("ACK_INVALID", "ACK committed operation differs from the submitted operation.", "ack.operation");
    }
    const expectedCommittedFingerprint = await committedOperationFingerprint(ack.operation);
    if (ack.committedFingerprint !== expectedCommittedFingerprint) {
      transportFailure("ACK_INVALID", "ACK committed fingerprint is not canonical.", "ack.committedFingerprint");
    }
    return ack;
  }
};

// src/pixync/composition-root.ts
function customDetail(event) {
  return event.detail;
}
var PixyncProductionCompositionRoot = class _PixyncProductionCompositionRoot {
  #options;
  #eventTarget;
  #transport;
  #coordinator;
  #lazy;
  #products;
  #connected = false;
  #drawCommit = (event) => {
    const detail = customDetail(event);
    if (detail !== void 0 && this.#products.submitDraw !== void 0) {
      void this.#products.submitDraw(detail).catch((error2) => this.#report(error2));
    }
  };
  #audioCommit = (event) => {
    const entry = customDetail(event)?.entry;
    if (entry !== void 0 && this.#products.submitAudio !== void 0) {
      void this.#products.submitAudio(entry).catch((error2) => this.#report(error2));
    }
  };
  #gameCommit = (event) => {
    const detail = customDetail(event);
    if (detail !== void 0 && this.#products.submitGameEditor !== void 0) {
      void this.#products.submitGameEditor(detail).catch((error2) => this.#report(error2));
    }
  };
  #audioCatalog = () => {
    void this.#lazy.demandAudio("DRAW_AUDIO_LANE").catch((error2) => this.#report(error2));
  };
  #audioPlayback = (event) => {
    if (customDetail(event)?.playing === true) {
      void this.#lazy.demandAudio("DRAW_PLAYBACK").catch((error2) => this.#report(error2));
    } else this.#lazy.releaseAudio("DRAW_PLAYBACK");
  };
  #audioExport = (event) => {
    if (customDetail(event)?.active === true) {
      void this.#lazy.demandAudio("DRAW_EXPORT").catch((error2) => this.#report(error2));
    } else this.#lazy.releaseAudio("DRAW_EXPORT");
  };
  #gameCatalog = () => {
    void this.#lazy.demandGame("GAME_CATALOG").catch((error2) => this.#report(error2));
  };
  #gameEditor = (event) => {
    if (customDetail(event)?.active === true) {
      void this.#lazy.demandGame("GAME_EDITOR").catch((error2) => this.#report(error2));
    } else this.#lazy.releaseGame("GAME_EDITOR");
  };
  #gameBuild = (event) => {
    if (customDetail(event)?.active === true) {
      void this.#lazy.demandGame("GAME_BUILD").catch((error2) => this.#report(error2));
    } else this.#lazy.releaseGame("GAME_BUILD");
  };
  constructor(input) {
    this.#options = input.options;
    this.#eventTarget = input.options.eventTarget ?? globalThis;
    this.#transport = input.transport;
    this.#coordinator = input.coordinator;
    this.#lazy = input.lazy;
    this.#products = input.products;
  }
  static async create(options) {
    const transport = new PixyncTransportAdapter(new PixyncSupabaseProvider({
      port: createPixyncSupabaseSdkPort(options.supabase)
    }));
    const journal2 = await PixyncDurableJournal.open(options.projectId, options.persistence);
    let keeper;
    let coordinator;
    const lazy = new PixyncLazyAggregateSync(options.projectId, options.sessionGeneration, options.audioHydration, options.gameHydration);
    const productTransport = {
      get binding() {
        return transport.binding;
      },
      submit: (draft) => coordinator.submit(draft),
      snapshot: () => keeper.snapshot()
    };
    const products = options.createProducts({
      transport: productTransport,
      onInvalidation: (notice) => lazy.receive(notice)
    });
    const aggregates = new Set(products.adapters.map((adapter) => adapter.aggregate));
    if (products.adapters.length !== 3 || aggregates.size !== 3 || !aggregates.has("draw") || !aggregates.has("audio") || !aggregates.has("game")) {
      throw new Error("Production PiXYNC requires one Draw, Audio, and Game adapter.");
    }
    keeper = new PixyncOrderKeeper({
      projectId: options.projectId,
      adapters: products.adapters,
      initialState: journal2.orderKeeperInitialState()
    });
    coordinator = new PixyncDurableTransportCoordinator({
      journal: journal2,
      transport,
      orderKeeper: keeper,
      workerId: options.workerId
    });
    return new _PixyncProductionCompositionRoot({
      options,
      transport,
      coordinator,
      lazy,
      products
    });
  }
  get binding() {
    return this.#transport.binding;
  }
  async connect() {
    if (this.#connected) return;
    await this.#coordinator.connect({
      projectId: this.#options.projectId,
      clientId: this.#options.clientId,
      sessionGeneration: this.#options.sessionGeneration,
      ...this.#options.onStatus === void 0 ? {} : {
        onStatus: this.#options.onStatus
      },
      ...this.#options.onError === void 0 ? {} : {
        onCatchUpError: this.#options.onError
      }
    });
    await this.#coordinator.reconcile();
    await this.#coordinator.catchUp();
    const binding = this.#transport.binding;
    if (binding === void 0) throw new Error("Authenticated PiXYNC binding is unavailable.");
    this.#eventTarget.dispatchEvent(new CustomEvent("draw2:pixync-binding", {
      detail: {
        projectId: binding.projectId,
        actorId: binding.actorId,
        clientId: binding.clientId,
        role: binding.role
      }
    }));
    this.#installEvents();
    this.#connected = true;
  }
  async close(reason = "closed") {
    if (!this.#connected) return;
    this.#removeEvents();
    this.#lazy.dispose();
    this.#connected = false;
    await this.#coordinator.close(reason);
  }
  #report(error2) {
    this.#options.onError?.(error2);
  }
  #installEvents() {
    this.#eventTarget.addEventListener("draw2:raster-operation-committed", this.#drawCommit);
    this.#eventTarget.addEventListener("draw2:audio-journal-committed", this.#audioCommit);
    this.#eventTarget.addEventListener("draw2:game-editor-committed", this.#gameCommit);
    this.#eventTarget.addEventListener("draw2:audio-catalog-request", this.#audioCatalog);
    this.#eventTarget.addEventListener("draw2:audio-reference-playback", this.#audioPlayback);
    this.#eventTarget.addEventListener("draw2:audio-export-demand", this.#audioExport);
    this.#eventTarget.addEventListener("draw2:game-catalog-request", this.#gameCatalog);
    this.#eventTarget.addEventListener("draw2:game-editor-demand", this.#gameEditor);
    this.#eventTarget.addEventListener("draw2:game-build-demand", this.#gameBuild);
  }
  #removeEvents() {
    this.#eventTarget.removeEventListener("draw2:raster-operation-committed", this.#drawCommit);
    this.#eventTarget.removeEventListener("draw2:audio-journal-committed", this.#audioCommit);
    this.#eventTarget.removeEventListener("draw2:game-editor-committed", this.#gameCommit);
    this.#eventTarget.removeEventListener("draw2:audio-catalog-request", this.#audioCatalog);
    this.#eventTarget.removeEventListener("draw2:audio-reference-playback", this.#audioPlayback);
    this.#eventTarget.removeEventListener("draw2:audio-export-demand", this.#audioExport);
    this.#eventTarget.removeEventListener("draw2:game-catalog-request", this.#gameCatalog);
    this.#eventTarget.removeEventListener("draw2:game-editor-demand", this.#gameEditor);
    this.#eventTarget.removeEventListener("draw2:game-build-demand", this.#gameBuild);
  }
};

// src/game/game-300/core.ts
var GAME_PROJECT_SCHEMA_VERSION = 1;
var BEHAVIOR_IR_VERSION = 1;
var GAME_RUNTIME_PROFILE_SCHEMA_VERSION = 1;
function asId(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) {
    throw new Error(`${label} must be a stable identifier.`);
  }
  return value;
}
var asProjectId = (value) => asId(value, "ProjectId");
var asOwnerId = (value) => asId(value, "OwnerId");
var asSceneId = (value) => asId(value, "SceneId");
var asEntityId = (value) => asId(value, "EntityId");
var asComponentId = (value) => asId(value, "ComponentId");
var asRevisionId = (value) => asId(value, "RevisionId");
var asSha2562 = (value) => {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("Sha256 must be lowercase hexadecimal SHA-256.");
  }
  return value;
};
function isRecord5(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function diagnostic2(code, path, message) {
  return {
    code,
    path,
    message,
    recoverable: true
  };
}
function duplicateDiagnostics(values, path) {
  const seen = /* @__PURE__ */ new Set();
  const diagnostics = [];
  for (const value of values) {
    if (seen.has(value)) {
      diagnostics.push(diagnostic2("DUPLICATE_ID", path, `Duplicate id: ${value}`));
    }
    seen.add(value);
  }
  return diagnostics;
}
function validateCaller(project, caller) {
  const diagnostics = [];
  if (project.projectId !== caller.projectId || project.revision.projectId !== caller.projectId) {
    diagnostics.push(diagnostic2("PROJECT_ID_MISMATCH", "projectId", "Caller project identity does not match the project revision."));
  }
  if (project.ownerId !== caller.ownerId || project.revision.ownerId !== caller.ownerId) {
    diagnostics.push(diagnostic2("CALLER_OWNER_MISMATCH", "ownerId", "Caller owner is not the project/revision owner."));
  }
  if (project.revision.revisionId !== caller.revisionId) {
    diagnostics.push(diagnostic2("CALLER_REVISION_MISMATCH", "revision.revisionId", "Caller revision is not the current project revision."));
  }
  return diagnostics;
}
function validateAssetReference(reference, path, ownerId, diagnostics) {
  if (!isRecord5(reference) || ![
    "DRAW",
    "AUDIO"
  ].includes(String(reference.kind))) {
    diagnostics.push(diagnostic2("INVALID_REFERENCE", path, "Asset reference must declare DRAW or AUDIO."));
    return;
  }
  if (reference.ownerId !== ownerId) {
    diagnostics.push(diagnostic2("INVALID_REFERENCE", `${path}.ownerId`, "Asset owner must match the Game Project owner."));
  }
  for (const key of [
    "assetId",
    "revisionId",
    "ownerId",
    "contentHash",
    "mode"
  ]) {
    if (typeof reference[key] !== "string") {
      diagnostics.push(diagnostic2("INVALID_REFERENCE", `${path}.${key}`, "Asset revision reference field is invalid."));
    }
  }
  if (typeof reference.contentHash === "string" && !/^[a-f0-9]{64}$/u.test(reference.contentHash)) {
    diagnostics.push(diagnostic2("INVALID_REFERENCE", `${path}.contentHash`, "Asset content hash must be lowercase SHA-256."));
  }
}
function validateComponent(component, path, ownerId, knownBehaviorIds, diagnostics) {
  if (!isRecord5(component) || typeof component.type !== "string" || typeof component.componentId !== "string") {
    diagnostics.push(diagnostic2("INVALID_COMPONENT", path, "Component shape or type is unsupported."));
    return;
  }
  if (![
    "TRANSFORM",
    "SPRITE",
    "AUDIO_SOURCE",
    "BEHAVIOR",
    "CAMERA",
    "TILEMAP",
    "COLLIDER",
    "RIGIDBODY",
    "CHARACTER_CONTROLLER"
  ].includes(component.type)) {
    diagnostics.push(diagnostic2("INVALID_COMPONENT", path, `Unknown component type: ${component.type}`));
    return;
  }
  if (typeof component.componentId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.componentId)) {
    diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.componentId`, "Component id is invalid."));
  }
  if (component.type === "TRANSFORM" && ![
    "x",
    "y",
    "rotation",
    "scaleX",
    "scaleY"
  ].every((key) => typeof component[key] === "number" && Number.isFinite(component[key]))) {
    diagnostics.push(diagnostic2("INVALID_COMPONENT", path, "Transform component contains a non-finite value."));
  }
  if (component.type === "SPRITE") {
    validateAssetReference(component.asset, `${path}.asset`, ownerId, diagnostics);
  }
  if (component.type === "AUDIO_SOURCE") {
    validateAssetReference(component.asset, `${path}.asset`, ownerId, diagnostics);
    if (!isRecord5(component.asset) || component.asset.kind !== "AUDIO") {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.asset`, "Audio Source requires an AUDIO asset revision."));
    }
    if (typeof component.volume !== "number" || !Number.isFinite(component.volume) || component.volume < 0 || component.volume > 1) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.volume`, "Audio volume must be between 0 and 1."));
    }
  }
  if (component.type === "BEHAVIOR" && (typeof component.behaviorId !== "string" || !knownBehaviorIds.has(component.behaviorId))) {
    diagnostics.push(diagnostic2("MISSING_REFERENCE", `${path}.behaviorId`, "Behavior component references an unknown behavior."));
  }
  if (component.type === "CAMERA" && (typeof component.zoom !== "number" || !Number.isFinite(component.zoom) || component.zoom <= 0)) {
    diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.zoom`, "Camera zoom must be a positive finite number."));
  }
  if (component.type === "TILEMAP") {
    if (typeof component.mapId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.mapId)) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.mapId`, "Tilemap map id is invalid."));
    }
    if (typeof component.tileSize !== "number" || !Number.isSafeInteger(component.tileSize) || component.tileSize < 1) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.tileSize`, "Tilemap tile size must be a positive integer."));
    }
    if (typeof component.collisionEnabled !== "boolean") {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.collisionEnabled`, "Tilemap collisionEnabled must be boolean."));
    }
  }
  if (component.type === "COLLIDER") {
    if (![
      "BOX",
      "CIRCLE",
      "CAPSULE"
    ].includes(component.shape)) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.shape`, "Collider shape is unsupported."));
    }
    for (const key of [
      "width",
      "height",
      "radius"
    ]) {
      if (typeof component[key] !== "number" || !Number.isFinite(component[key]) || component[key] <= 0) {
        diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.${key}`, "Collider dimensions must be positive finite numbers."));
      }
    }
    if (typeof component.isTrigger !== "boolean") {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.isTrigger`, "Collider isTrigger must be boolean."));
    }
    if (![
      "DEFAULT",
      "WORLD",
      "PLAYER",
      "NPC",
      "SENSOR",
      "PROJECTILE"
    ].includes(component.layer)) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.layer`, "Collider layer is unsupported."));
    }
    if (typeof component.enabled !== "boolean") {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.enabled`, "Collider enabled must be boolean."));
    }
  }
  if (component.type === "RIGIDBODY") {
    if (![
      "STATIC",
      "DYNAMIC",
      "KINEMATIC"
    ].includes(component.bodyType)) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.bodyType`, "Rigidbody body type is unsupported."));
    }
    if (typeof component.mass !== "number" || !Number.isFinite(component.mass) || component.mass <= 0) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.mass`, "Rigidbody mass must be positive."));
    }
    if (typeof component.gravityScale !== "number" || !Number.isFinite(component.gravityScale)) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.gravityScale`, "Rigidbody gravity scale must be finite."));
    }
    if (typeof component.fixedRotation !== "boolean" || typeof component.enabled !== "boolean") {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", path, "Rigidbody flags are invalid."));
    }
  }
  if (component.type === "CHARACTER_CONTROLLER") {
    if (typeof component.moveSpeed !== "number" || !Number.isFinite(component.moveSpeed) || component.moveSpeed <= 0) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.moveSpeed`, "Character Controller move speed must be positive."));
    }
    if (typeof component.stepHeight !== "number" || !Number.isFinite(component.stepHeight) || component.stepHeight < 0) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.stepHeight`, "Character Controller step height must be non-negative."));
    }
    if (typeof component.fixedStep !== "number" || !Number.isSafeInteger(component.fixedStep) || component.fixedStep < 1) {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.fixedStep`, "Character Controller fixed step must be a positive integer."));
    }
    if (typeof component.enabled !== "boolean") {
      diagnostics.push(diagnostic2("INVALID_COMPONENT", `${path}.enabled`, "Character Controller enabled must be boolean."));
    }
  }
}
function validateGameComponentState(component, path, diagnostics) {
  if (!isRecord5(component) || typeof component.type !== "string" || typeof component.componentId !== "string") {
    diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor component state is invalid."));
    return;
  }
  if (![
    "TRANSFORM",
    "SPRITE",
    "AUDIO_SOURCE",
    "BEHAVIOR",
    "CAMERA",
    "TILEMAP",
    "COLLIDER",
    "RIGIDBODY",
    "CHARACTER_CONTROLLER"
  ].includes(component.type)) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", `${path}.type`, `Unknown Game editor component state: ${component.type}`));
    return;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.componentId)) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", `${path}.componentId`, "Game editor component id is invalid."));
  }
  if (component.type === "TRANSFORM" && ![
    "x",
    "y",
    "rotation",
    "scaleX",
    "scaleY"
  ].every((key) => typeof component[key] === "number" && Number.isFinite(component[key]))) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor Transform state contains a non-finite value."));
  }
  if (component.type === "SPRITE" && typeof component.visible !== "boolean") {
    diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor Sprite state requires visible."));
  }
  if (component.type === "BEHAVIOR" && typeof component.enabled !== "boolean") {
    diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor Behavior state requires enabled."));
  }
  if (component.type === "AUDIO_SOURCE" && (typeof component.loop !== "boolean" || typeof component.volume !== "number" || !Number.isFinite(component.volume) || component.volume < 0 || component.volume > 1)) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor Audio Source state is invalid."));
  }
  if (component.type === "CAMERA" && (typeof component.active !== "boolean" || typeof component.zoom !== "number" || !Number.isFinite(component.zoom) || component.zoom <= 0)) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor Camera state is invalid."));
  }
  if (component.type === "TILEMAP" && (typeof component.mapId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.mapId) || typeof component.tileSize !== "number" || !Number.isSafeInteger(component.tileSize) || component.tileSize < 1 || typeof component.collisionEnabled !== "boolean")) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor Tilemap state is invalid."));
  }
  if (component.type === "COLLIDER") {
    if (![
      "BOX",
      "CIRCLE",
      "CAPSULE"
    ].includes(component.shape) || [
      "width",
      "height",
      "radius"
    ].some((key) => typeof component[key] !== "number" || !Number.isFinite(component[key]) || component[key] <= 0) || typeof component.isTrigger !== "boolean" || ![
      "DEFAULT",
      "WORLD",
      "PLAYER",
      "NPC",
      "SENSOR",
      "PROJECTILE"
    ].includes(component.layer) || typeof component.enabled !== "boolean") {
      diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor Collider state is invalid."));
    }
  }
  if (component.type === "RIGIDBODY" && (![
    "STATIC",
    "DYNAMIC",
    "KINEMATIC"
  ].includes(component.bodyType) || typeof component.mass !== "number" || !Number.isFinite(component.mass) || component.mass <= 0 || typeof component.gravityScale !== "number" || !Number.isFinite(component.gravityScale) || typeof component.fixedRotation !== "boolean" || typeof component.enabled !== "boolean")) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor Rigidbody state is invalid."));
  }
  if (component.type === "CHARACTER_CONTROLLER" && (typeof component.moveSpeed !== "number" || !Number.isFinite(component.moveSpeed) || component.moveSpeed <= 0 || typeof component.stepHeight !== "number" || !Number.isFinite(component.stepHeight) || component.stepHeight < 0 || typeof component.fixedStep !== "number" || !Number.isSafeInteger(component.fixedStep) || component.fixedStep < 1 || typeof component.enabled !== "boolean")) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", path, "Game editor Character Controller state is invalid."));
  }
}
function validateDependencyCycles(dependencies, diagnostics) {
  const byId = new Map(dependencies.map((dependency) => [
    String(dependency.dependencyId),
    dependency
  ]));
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const visit = (id, path) => {
    if (visiting.has(id)) {
      diagnostics.push(diagnostic2("DEPENDENCY_CYCLE", path, `Dependency cycle includes ${id}.`));
      return;
    }
    if (visited.has(id)) return;
    const dependency = byId.get(id);
    if (!dependency) {
      diagnostics.push(diagnostic2("MISSING_REFERENCE", path, `Dependency ${id} is missing.`));
      return;
    }
    visiting.add(id);
    for (const target of dependency.dependsOn) {
      visit(target, `${path}.dependsOn`);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const dependency of dependencies) {
    visit(dependency.dependencyId, "dependencies");
  }
}
function validateGameProject(value, caller) {
  const diagnostics = [];
  if (!isRecord5(value)) {
    return {
      valid: false,
      diagnostics: [
        diagnostic2("INVALID_PROJECT", "project", "Game Project must be an object.")
      ]
    };
  }
  if (value.schemaVersion !== GAME_PROJECT_SCHEMA_VERSION) {
    diagnostics.push(diagnostic2("UNKNOWN_SCHEMA", "schemaVersion", "Unsupported Game Project schema version."));
  }
  if (typeof value.projectId !== "string" || typeof value.ownerId !== "string" || typeof value.name !== "string" || !isRecord5(value.revision)) {
    return {
      valid: false,
      diagnostics: [
        ...diagnostics,
        diagnostic2("INVALID_PROJECT", "project", "Required Game Project identity is missing.")
      ]
    };
  }
  const project = value;
  if (caller) diagnostics.push(...validateCaller(project, caller));
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.projectId) || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.ownerId)) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", "projectId/ownerId", "Project and owner ids must be stable identifiers."));
  }
  if (!project.name.trim()) {
    diagnostics.push(diagnostic2("INVALID_PROJECT", "name", "Project name is required."));
  }
  if (project.revision.projectId !== project.projectId || project.revision.ownerId !== project.ownerId || !Number.isSafeInteger(project.revision.sequence) || project.revision.sequence < 1) {
    diagnostics.push(diagnostic2("INVALID_REVISION", "revision", "Revision is not bound to the project owner or sequence."));
  }
  if (!Array.isArray(project.scenes) || !Array.isArray(project.prefabs) || !Array.isArray(project.dependencies) || !Array.isArray(project.behaviors)) {
    return {
      valid: false,
      diagnostics: [
        ...diagnostics,
        diagnostic2("INVALID_PROJECT", "project", "Project collections are invalid.")
      ]
    };
  }
  if (project.runtimeProfile !== void 0) {
    if (!isRecord5(project.runtimeProfile) || project.runtimeProfile.schemaVersion !== GAME_RUNTIME_PROFILE_SCHEMA_VERSION || typeof project.runtimeProfile.profileId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.runtimeProfile.profileId)) {
      diagnostics.push(diagnostic2("INVALID_RUNTIME_PROFILE", "runtimeProfile", "Runtime profile reference is invalid."));
    }
  }
  diagnostics.push(...duplicateDiagnostics(project.scenes.map((scene) => String(scene.sceneId)), "scenes.sceneId"));
  diagnostics.push(...duplicateDiagnostics(project.prefabs.map((prefab) => String(prefab.prefabId)), "prefabs.prefabId"));
  diagnostics.push(...duplicateDiagnostics(project.dependencies.map((dependency) => String(dependency.dependencyId)), "dependencies.dependencyId"));
  diagnostics.push(...duplicateDiagnostics(project.behaviors.map((behavior) => String(behavior.behaviorId)), "behaviors.behaviorId"));
  const behaviorIds = new Set(project.behaviors.map((behavior) => String(behavior.behaviorId)));
  const allEntityIds = [];
  const allComponentIds = [];
  for (const [sceneIndex, scene] of project.scenes.entries()) {
    if (!isRecord5(scene) || typeof scene.sceneId !== "string" || !Array.isArray(scene.entities) || !Array.isArray(scene.rootEntityIds)) {
      diagnostics.push(diagnostic2("INVALID_PROJECT", `scenes[${sceneIndex}]`, "Scene shape is invalid."));
      continue;
    }
    const sceneEntityIds = new Set(scene.entities.map((entity2) => String(entity2.entityId)));
    for (const rootId of scene.rootEntityIds) {
      if (!sceneEntityIds.has(String(rootId))) {
        diagnostics.push(diagnostic2("MISSING_REFERENCE", `scenes[${sceneIndex}].rootEntityIds`, `Root Entity ${String(rootId)} is missing.`));
      }
    }
    diagnostics.push(...duplicateDiagnostics(scene.entities.map((entity2) => String(entity2.entityId)), `scenes[${sceneIndex}].entities.entityId`));
    for (const [entityIndex, entity2] of scene.entities.entries()) {
      if (!isRecord5(entity2) || typeof entity2.entityId !== "string" || !Array.isArray(entity2.components)) {
        diagnostics.push(diagnostic2("INVALID_PROJECT", `scenes[${sceneIndex}].entities[${entityIndex}]`, "Entity shape is invalid."));
        continue;
      }
      allEntityIds.push(entity2.entityId);
      if (entity2.parentEntityId !== void 0 && !sceneEntityIds.has(String(entity2.parentEntityId))) {
        diagnostics.push(diagnostic2("MISSING_REFERENCE", `scenes[${sceneIndex}].entities[${entityIndex}].parentEntityId`, "Parent Entity is missing."));
      }
      diagnostics.push(...duplicateDiagnostics(entity2.components.map((component) => String(isRecord5(component) ? component.componentId : "<invalid>")), `scenes[${sceneIndex}].entities[${entityIndex}].components.componentId`));
      for (const [componentIndex, component] of entity2.components.entries()) {
        if (isRecord5(component) && typeof component.componentId === "string") {
          allComponentIds.push(component.componentId);
        }
        validateComponent(component, `scenes[${sceneIndex}].entities[${entityIndex}].components[${componentIndex}]`, project.ownerId, behaviorIds, diagnostics);
      }
    }
    for (const entity2 of scene.entities) {
      const seen = /* @__PURE__ */ new Set();
      let parentId = entity2.parentEntityId;
      while (parentId !== void 0) {
        if (seen.has(String(parentId)) || parentId === entity2.entityId) {
          diagnostics.push(diagnostic2("DEPENDENCY_CYCLE", `scenes[${sceneIndex}].entities`, `Entity parent cycle includes ${String(entity2.entityId)}.`));
          break;
        }
        seen.add(String(parentId));
        parentId = scene.entities.find((candidate) => candidate.entityId === parentId)?.parentEntityId;
      }
    }
  }
  diagnostics.push(...duplicateDiagnostics(allEntityIds, "project.entities.entityId"));
  diagnostics.push(...duplicateDiagnostics(allComponentIds, "project.components.componentId"));
  for (const dependency of project.dependencies) {
    if (!isRecord5(dependency) || typeof dependency.dependencyId !== "string" || !Array.isArray(dependency.dependsOn)) {
      diagnostics.push(diagnostic2("INVALID_PROJECT", "dependencies", "Dependency shape is invalid."));
    } else if (dependency.ownerId !== project.ownerId || dependency.ownerRevisionId !== project.revision.revisionId) {
      diagnostics.push(diagnostic2("INVALID_REFERENCE", `dependencies.${dependency.dependencyId}`, "Dependency owner/revision is not the current project revision."));
    }
  }
  validateDependencyCycles(project.dependencies, diagnostics);
  for (const behavior of project.behaviors) {
    if (behavior.version !== BEHAVIOR_IR_VERSION || behavior.ownership !== "CANONICAL_IR" || !Array.isArray(behavior.rules)) {
      diagnostics.push(diagnostic2("UNKNOWN_SCHEMA", `behaviors.${String(behavior.behaviorId)}`, "Behavior IR schema is unsupported."));
    }
  }
  if (project.editorTimeline !== void 0) {
    const timeline = project.editorTimeline;
    if (!Number.isSafeInteger(timeline.frameCount) || timeline.frameCount < 1) {
      diagnostics.push(diagnostic2("INVALID_PROJECT", "editorTimeline.frameCount", "Editor timeline frame count must be a positive integer."));
    }
    if (!Array.isArray(timeline.tracks)) {
      diagnostics.push(diagnostic2("INVALID_PROJECT", "editorTimeline.tracks", "Editor timeline tracks must be an array."));
    } else {
      diagnostics.push(...duplicateDiagnostics(timeline.tracks.map((track) => track.trackId), "editorTimeline.tracks.trackId"));
      for (const [index, track] of timeline.tracks.entries()) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(track.trackId) || track.label.trim().length === 0 || track.kind.trim().length === 0) {
          diagnostics.push(diagnostic2("INVALID_PROJECT", `editorTimeline.tracks[${index}]`, "Editor timeline track identity is invalid."));
        }
        if (!Array.isArray(track.activeFrames) || track.activeFrames.some((frame2) => !Number.isSafeInteger(frame2) || frame2 < 0 || frame2 >= timeline.frameCount)) {
          diagnostics.push(diagnostic2("INVALID_PROJECT", `editorTimeline.tracks[${index}].activeFrames`, "Editor timeline frames must be in range."));
        } else if (new Set(track.activeFrames).size !== track.activeFrames.length) {
          diagnostics.push(diagnostic2("DUPLICATE_ID", `editorTimeline.tracks[${index}].activeFrames`, "Editor timeline frames must be unique."));
        }
        if (track.role !== void 0 && ![
          "PLAYER",
          "NPC",
          "PROP",
          "TRIGGER",
          "TILEMAP",
          "CAMERA",
          "AUDIO",
          "CUSTOM"
        ].includes(track.role)) {
          diagnostics.push(diagnostic2("INVALID_PROJECT", `editorTimeline.tracks[${index}].role`, "Game object role is unsupported."));
        }
        if (track.components !== void 0) {
          if (!Array.isArray(track.components)) {
            diagnostics.push(diagnostic2("INVALID_PROJECT", `editorTimeline.tracks[${index}].components`, "Game editor components must be an array."));
          } else {
            diagnostics.push(...duplicateDiagnostics(track.components.map((component) => String(component.componentId)), `editorTimeline.tracks[${index}].components.componentId`));
            for (const [componentIndex, component] of track.components.entries()) {
              validateGameComponentState(component, `editorTimeline.tracks[${index}].components[${componentIndex}]`, diagnostics);
            }
          }
        }
      }
    }
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics
  };
}
function sortById(items, key) {
  return [
    ...items
  ].sort((left, right) => String(left[key]).localeCompare(String(right[key]), "en", {
    numeric: false
  }));
}
function canonicalProjectPayload(project) {
  const revision = {
    ...project.revision
  };
  delete revision.snapshotHash;
  return {
    schemaVersion: project.schemaVersion,
    projectId: project.projectId,
    ownerId: project.ownerId,
    name: project.name,
    revision,
    scenes: sortById(project.scenes, "sceneId").map((scene) => ({
      ...scene,
      entities: sortById(scene.entities, "entityId").map((entity2) => ({
        ...entity2,
        components: sortById(entity2.components, "componentId")
      }))
    })),
    prefabs: sortById(project.prefabs, "prefabId"),
    dependencies: sortById(project.dependencies, "dependencyId").map((dependency) => ({
      ...dependency,
      dependsOn: [
        ...dependency.dependsOn
      ].sort()
    })),
    behaviors: sortById(project.behaviors, "behaviorId").map((behavior) => ({
      ...behavior,
      rules: sortById(behavior.rules, "ruleId")
    })),
    ...project.runtimeProfile === void 0 ? {} : {
      runtimeProfile: project.runtimeProfile
    },
    ...project.editorTimeline === void 0 ? {} : {
      editorTimeline: {
        frameCount: project.editorTimeline.frameCount,
        tracks: sortById(project.editorTimeline.tracks, "trackId").map((track) => ({
          ...track,
          activeFrames: [
            ...track.activeFrames
          ].sort((left, right) => left - right)
        }))
      }
    }
  };
}
function canonicalJson3(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson3).join(",")}]`;
  if (isRecord5(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson3(value[key])}`).join(",")}}`;
  }
  throw new Error("Unsupported canonical value.");
}
async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson3(value)));
  return asSha2562([
    ...new Uint8Array(bytes)
  ].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
}
async function createGameProject(draft, caller) {
  const validation = validateGameProject(draft, caller);
  if (!validation.valid) {
    throw new Error(validation.diagnostics.map((item) => `${item.code}:${item.path}`).join("; "));
  }
  const snapshotHash = await sha256(canonicalProjectPayload(draft));
  return {
    ...draft,
    revision: {
      ...draft.revision,
      snapshotHash
    }
  };
}
function createJournal(initial, caller) {
  const validation = validateGameProject(initial, caller);
  if (!validation.valid) throw new Error("Cannot journal an invalid project.");
  return {
    current: initial,
    sequence: 0,
    past: [],
    future: [],
    checkpoints: []
  };
}

// src/pixync/game-revision-remote-store.ts
var PixyncGameRevisionRemoteStore = class {
  #client;
  #binding;
  constructor(client, binding) {
    this.#client = client;
    this.#binding = binding;
  }
  async put(project) {
    const binding = this.#requireBinding();
    if (String(project.projectId) !== binding.projectId) {
      throw new Error("Game revision belongs to another PiXYNC project.");
    }
    const result = await this.#client.rpc("pixync_draw2_put_game_revision_v1", {
      p_project_id: binding.projectId,
      p_client_id: binding.clientId,
      p_session_generation: binding.sessionGeneration,
      p_snapshot_hash: String(project.revision.snapshotHash),
      p_revision_id: String(project.revision.revisionId),
      p_sequence: project.revision.sequence,
      p_game_project: project
    });
    if (result.error !== null) throw result.error;
  }
  async get(snapshotHash, revisionId) {
    const binding = this.#requireBinding();
    const result = await this.#client.rpc("pixync_draw2_get_game_revision_v1", {
      p_project_id: binding.projectId,
      p_client_id: binding.clientId,
      p_session_generation: binding.sessionGeneration,
      p_snapshot_hash: snapshotHash,
      p_revision_id: revisionId
    });
    if (result.error !== null) throw result.error;
    if (result.data === null || typeof result.data !== "object") return void 0;
    const candidate = result.data;
    if (String(candidate.projectId) !== binding.projectId || String(candidate.revision.snapshotHash) !== snapshotHash || String(candidate.revision.revisionId) !== revisionId) throw new Error("Server returned a mismatched Game revision.");
    const { snapshotHash: _snapshotHash, ...revision } = candidate.revision;
    const caller = {
      projectId: candidate.projectId,
      ownerId: candidate.ownerId,
      revisionId: candidate.revision.revisionId
    };
    const verified = await createGameProject({
      ...candidate,
      revision
    }, caller);
    if (verified.revision.snapshotHash !== candidate.revision.snapshotHash) {
      throw new Error("Server Game revision failed canonical hash verification.");
    }
    return candidate;
  }
  #requireBinding() {
    const binding = this.#binding();
    if (binding === void 0) throw new Error("PiXYNC session is unavailable.");
    return binding;
  }
};

// src/draw2-selection.ts
var MAX_SELECTION_PIXELS = 1048576;
var MAX_CLIPBOARD_DIMENSION = 4096;
function error(code, message, path) {
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
function isInteger(value) {
  return Number.isSafeInteger(value);
}
function boundsFromRegions(regions) {
  if (regions.length === 0) throw new Error("Selection requires at least one region.");
  const minX = Math.min(...regions.map((region) => region.x));
  const minY = Math.min(...regions.map((region) => region.y));
  const maxX = Math.max(...regions.map((region) => region.x + region.width));
  const maxY = Math.max(...regions.map((region) => region.y + region.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
function regionContains(region, point) {
  return point.x >= region.x && point.y >= region.y && point.x < region.x + region.width && point.y < region.y + region.height;
}
function containsInMask(mask, point) {
  return mask.regions.some((region) => regionContains(region, point));
}
function regionForPoints(points) {
  if (points.length === 0) return void 0;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}
function validateRegion(asset, region, path) {
  if (!isInteger(region.x) || !isInteger(region.y) || !isInteger(region.width) || !isInteger(region.height)) return [
    error("SELECTION_REGION_INVALID", "Selection region values must be safe integers.", path)
  ];
  if (region.width < 1 || region.height < 1 || region.x < 0 || region.y < 0 || region.x + region.width > asset.width || region.y + region.height > asset.height) return [
    error("SELECTION_OUTSIDE_BOUNDS", "Selection region is outside the raster.", path)
  ];
  return [];
}
function validateStructureScope(state2, scope, assetId) {
  const diagnostics = [];
  if (scope.assetId !== assetId) diagnostics.push(error("SELECTION_ASSET_MISMATCH", "Selection asset does not match the command asset.", "scope.assetId"));
  if (!state2.layers.some((layer2) => layer2.id === scope.layerId)) diagnostics.push(error("SELECTION_LAYER_NOT_FOUND", "Selection layer is not in the Project structure.", "scope.layerId"));
  if (!state2.frames.some((frame2) => frame2.id === scope.frameId)) diagnostics.push(error("SELECTION_FRAME_NOT_FOUND", "Selection frame is not in the Project structure.", "scope.frameId"));
  const cel2 = state2.cels.find((candidate) => candidate.id === scope.celId);
  if (cel2 === void 0 || cel2.layerId !== scope.layerId || cel2.frameId !== scope.frameId || cel2.assetId !== assetId) diagnostics.push(error("SELECTION_CEL_SCOPE_INVALID", "Selection cel scope is not an active compatible layer/frame/cel reference.", "scope.celId"));
  return diagnostics;
}
function validateSnapshot(state2, asset, snapshot) {
  const diagnostics = validateStructureScope(state2, snapshot.scope, asset.id);
  if (!isInteger(snapshot.mask.selectionVersion) || snapshot.mask.selectionVersion < 1) diagnostics.push(error("SELECTION_VERSION_INVALID", "Selection version must be positive.", "mask.selectionVersion"));
  if (snapshot.sourceRasterRevision !== asset.revision) diagnostics.push(error("STALE_SELECTION_RASTER", "Selection source raster revision is stale.", "sourceRasterRevision"));
  if (snapshot.sourceStructureEpoch !== state2.structureEpoch) diagnostics.push(error("STALE_SELECTION_STRUCTURE", "Selection source structure epoch is stale.", "sourceStructureEpoch"));
  if (snapshot.pixels.length < 1 || snapshot.pixels.length > MAX_SELECTION_PIXELS) diagnostics.push(error("SELECTION_PIXEL_LIMIT_EXCEEDED", "Selection pixel snapshot is outside its bounded limit.", "pixels"));
  const seen = /* @__PURE__ */ new Set();
  snapshot.mask.regions.forEach((region, index) => diagnostics.push(...validateRegion(asset, region, `mask.regions[${index}]`)));
  for (const pixel of snapshot.pixels) {
    const key = `${pixel.x}:${pixel.y}`;
    if (seen.has(key)) diagnostics.push(error("SELECTION_PIXEL_DUPLICATE", "Selection snapshot contains a duplicate pixel.", "pixels"));
    seen.add(key);
    if (!isInteger(pixel.x) || !isInteger(pixel.y) || pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width || pixel.y >= asset.height) diagnostics.push(error("SELECTION_PIXEL_OUT_OF_BOUNDS", "Selection pixel is outside the raster.", "pixels"));
    if (!isInteger(pixel.colorIndex) || pixel.colorIndex < 0 || pixel.colorIndex >= asset.palette.length) diagnostics.push(error("SELECTION_PIXEL_COLOR_INVALID", "Selection pixel references an invalid palette index.", "pixels"));
    if (!containsInMask(snapshot.mask, pixel)) diagnostics.push(error("SELECTION_PIXEL_OUTSIDE_MASK", "Selection pixel is outside the selection mask regions.", "pixels"));
  }
  return diagnostics;
}
function validateTransform(transform2) {
  const diagnostics = [];
  if (!isInteger(transform2.dx) || !isInteger(transform2.dy)) diagnostics.push(error("TRANSFORM_TRANSLATION_INVALID", "Transform translation must use integer coordinates.", "transform"));
  if (transform2.interpolationPolicy !== "NEAREST_NEIGHBOR") diagnostics.push(error("TRANSFORM_INTERPOLATION_UNSUPPORTED", "Only deterministic nearest-neighbor transform is supported.", "transform.interpolationPolicy"));
  if (transform2.outOfBoundsPolicy === "EXPAND_CANVAS_CANDIDATE") diagnostics.push(error("TRANSFORM_CANVAS_EXPANSION_UNSUPPORTED", "Canvas expansion is a future candidate and cannot mutate this Project.", "transform.outOfBoundsPolicy"));
  if (transform2.operation === "SCALE_INTEGER" && (!isInteger(transform2.factor) || transform2.factor < 1 || transform2.factor > 8)) diagnostics.push(error("TRANSFORM_SCALE_INVALID", "Integer scale factor must be between 1 and 8.", "transform.factor"));
  if (transform2.operation === "SCALE_NEAREST" && (!Number.isFinite(transform2.factor) || transform2.factor < 0.125 || transform2.factor > 8)) diagnostics.push(error("TRANSFORM_SCALE_INVALID", "Nearest-neighbor scale factor must be between 0.125 and 8.", "transform.factor"));
  return diagnostics;
}
function validateClipboard(clipboard2, asset) {
  const diagnostics = [];
  if (clipboard2.format !== "PIXIEEDRAW2_CLIPBOARD" || clipboard2.version !== 1) diagnostics.push(error("CLIPBOARD_FORMAT_UNSUPPORTED", "Clipboard format/version is unsupported.", "clipboard"));
  if (!isInteger(clipboard2.width) || !isInteger(clipboard2.height) || clipboard2.width < 1 || clipboard2.height < 1 || clipboard2.width > MAX_CLIPBOARD_DIMENSION || clipboard2.height > MAX_CLIPBOARD_DIMENSION) diagnostics.push(error("CLIPBOARD_DIMENSIONS_INVALID", "Clipboard dimensions are outside the safe limit.", "clipboard"));
  if (!isInteger(clipboard2.origin.x) || !isInteger(clipboard2.origin.y)) diagnostics.push(error("CLIPBOARD_ORIGIN_INVALID", "Clipboard origin must use safe integer coordinates.", "clipboard.origin"));
  if (clipboard2.width * clipboard2.height > MAX_SELECTION_PIXELS || clipboard2.pixels.length < 1 || clipboard2.pixels.length > MAX_SELECTION_PIXELS) diagnostics.push(error("CLIPBOARD_PIXEL_LIMIT_EXCEEDED", "Clipboard payload exceeds the bounded pixel limit.", "clipboard.pixels"));
  if (clipboard2.palette.length < 1 || clipboard2.palette[0] !== 0) diagnostics.push(error("CLIPBOARD_TRANSPARENCY_INVALID", "Clipboard palette index 0 must be transparent.", "clipboard.palette"));
  if (clipboard2.provenance !== void 0 && (clipboard2.provenance.length > 256 || /(?:javascript:|data:|https?:|<script|\/\/)\s*/i.test(clipboard2.provenance))) diagnostics.push(error("CLIPBOARD_PROVENANCE_UNTRUSTED", "Clipboard provenance contains an unsafe or oversized value.", "clipboard.provenance"));
  const seen = /* @__PURE__ */ new Set();
  for (const pixel of clipboard2.pixels) {
    const pixelKey = `${pixel.x}:${pixel.y}`;
    if (seen.has(pixelKey)) diagnostics.push(error("CLIPBOARD_PIXEL_DUPLICATE", "Clipboard payload contains a duplicate pixel.", "clipboard.pixels"));
    seen.add(pixelKey);
    if (!isInteger(pixel.x) || !isInteger(pixel.y) || pixel.x < 0 || pixel.y < 0 || pixel.x >= clipboard2.width || pixel.y >= clipboard2.height) diagnostics.push(error("CLIPBOARD_PIXEL_OUT_OF_BOUNDS", "Clipboard pixel is outside its bounded dimensions.", "clipboard.pixels"));
    if (!isInteger(pixel.colorIndex) || pixel.colorIndex < 0 || pixel.colorIndex >= clipboard2.palette.length) diagnostics.push(error("CLIPBOARD_PIXEL_COLOR_INVALID", "Clipboard pixel references an invalid source palette index.", "clipboard.pixels"));
  }
  if (clipboard2.palette.some((color) => !isInteger(color) || color < 0 || color > 4294967295)) diagnostics.push(error("CLIPBOARD_PALETTE_INVALID", "Clipboard palette contains an invalid color.", "clipboard.palette"));
  if (asset.width < 1 || asset.height < 1) diagnostics.push(error("CLIPBOARD_TARGET_INVALID", "Clipboard target raster is invalid.", "assetId"));
  return diagnostics;
}
function createRectangleSelectionSnapshot(state2, bounds, selectionId = `selection-${state2.projectId}-${state2.structureEpoch}`, selectionVersion = 1) {
  const asset = state2.assets[state2.activeAssetId];
  if (asset === void 0) throw new Error("Active Draw2 asset is missing.");
  const regionErrors = validateRegion(asset, bounds, "bounds");
  if (regionErrors.length > 0) throw new Error(regionErrors[0]?.message ?? "Selection bounds are invalid.");
  if (bounds.width * bounds.height > MAX_SELECTION_PIXELS) throw new Error("Selection exceeds the bounded pixel limit.");
  const pixels = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) pixels.push({
      x,
      y,
      colorIndex: asset.raster.getPixel(x, y)
    });
  }
  return {
    selectionId,
    mask: {
      kind: "rectangle",
      regions: [
        bounds
      ],
      selectionVersion
    },
    scope: {
      assetId: asset.id,
      layerId: state2.activeLayerId,
      frameId: state2.activeFrameId,
      celId: state2.activeCelId
    },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state2.structureEpoch,
    pixels
  };
}
function transformedPixels(snapshot, transform2) {
  const bounds = boundsFromRegions(snapshot.mask.regions);
  const pixels = [];
  if (transform2.operation === "SCALE_INTEGER" || transform2.operation === "SCALE_NEAREST") {
    const factor = transform2.factor;
    const outputWidth = Math.max(1, Math.round(bounds.width * factor));
    const outputHeight = Math.max(1, Math.round(bounds.height * factor));
    const originX = Math.floor((bounds.width - outputWidth) / 2);
    const originY = Math.floor((bounds.height - outputHeight) / 2);
    const sourceByLocalPoint = /* @__PURE__ */ new Map();
    for (const pixel of snapshot.pixels) sourceByLocalPoint.set(`${pixel.x - bounds.x}:${pixel.y - bounds.y}`, pixel);
    for (let targetY = 0; targetY < outputHeight; targetY += 1) {
      for (let targetX = 0; targetX < outputWidth; targetX += 1) {
        const sourceX = Math.min(bounds.width - 1, Math.max(0, Math.floor((targetX + 0.5 - outputWidth / 2) / factor + bounds.width / 2)));
        const sourceY = Math.min(bounds.height - 1, Math.max(0, Math.floor((targetY + 0.5 - outputHeight / 2) / factor + bounds.height / 2)));
        const source = sourceByLocalPoint.get(`${sourceX}:${sourceY}`);
        if (source === void 0) continue;
        pixels.push({
          x: bounds.x + originX + targetX + transform2.dx,
          y: bounds.y + originY + targetY + transform2.dy,
          colorIndex: source.colorIndex
        });
      }
    }
    return pixels;
  }
  for (const pixel of snapshot.pixels) {
    const localX = pixel.x - bounds.x;
    const localY = pixel.y - bounds.y;
    if (transform2.operation === "MOVE") pixels.push({
      x: pixel.x + transform2.dx,
      y: pixel.y + transform2.dy,
      colorIndex: pixel.colorIndex
    });
    else if (transform2.operation === "FLIP_HORIZONTAL") pixels.push({
      x: bounds.x + bounds.width - 1 - localX + transform2.dx,
      y: pixel.y + transform2.dy,
      colorIndex: pixel.colorIndex
    });
    else if (transform2.operation === "FLIP_VERTICAL") pixels.push({
      x: pixel.x + transform2.dx,
      y: bounds.y + bounds.height - 1 - localY + transform2.dy,
      colorIndex: pixel.colorIndex
    });
    else if (transform2.operation === "ROTATE_90_CW") pixels.push({
      x: bounds.x + bounds.height - 1 - localY + transform2.dx,
      y: bounds.y + localX + transform2.dy,
      colorIndex: pixel.colorIndex
    });
    else if (transform2.operation === "ROTATE_90_CCW") pixels.push({
      x: bounds.x + localY + transform2.dx,
      y: bounds.y + bounds.width - 1 - localX + transform2.dy,
      colorIndex: pixel.colorIndex
    });
    else if (transform2.operation === "ROTATE_180") pixels.push({
      x: bounds.x + bounds.width - 1 - localX + transform2.dx,
      y: bounds.y + bounds.height - 1 - localY + transform2.dy,
      colorIndex: pixel.colorIndex
    });
  }
  return pixels;
}
function estimatedTransformBounds(snapshot, transform2) {
  const bounds = boundsFromRegions(snapshot.mask.regions);
  if (transform2.operation === "ROTATE_90_CW" || transform2.operation === "ROTATE_90_CCW") return {
    ...bounds,
    width: bounds.height,
    height: bounds.width
  };
  if (transform2.operation === "SCALE_INTEGER" || transform2.operation === "SCALE_NEAREST") {
    return {
      ...bounds,
      width: Math.max(1, Math.round(bounds.width * transform2.factor)),
      height: Math.max(1, Math.round(bounds.height * transform2.factor))
    };
  }
  return bounds;
}
function destinationBounds(snapshot, transform2) {
  const pixels = transformedPixels(snapshot, transform2);
  return regionForPoints(pixels) ?? boundsFromRegions(snapshot.mask.regions);
}
function createTransformSession(snapshot, transform2, sessionId = `transform-${snapshot.selectionId}-${snapshot.mask.selectionVersion}`) {
  const destination = destinationBounds(snapshot, transform2);
  return {
    sessionId,
    sourceSelectionVersion: snapshot.mask.selectionVersion,
    sourceRasterRevision: snapshot.sourceRasterRevision,
    sourceStructureEpoch: snapshot.sourceStructureEpoch,
    transform: transform2,
    previewBounds: boundsFromRegions(snapshot.mask.regions),
    destinationBounds: destination,
    status: "PREVIEW"
  };
}
function createClipboardSelectionSnapshot(state2, clipboard2) {
  const asset = state2.assets[state2.activeAssetId];
  if (asset === void 0) throw new Error("Paste target asset is missing.");
  const compatibility = assessClipboardPalette(clipboard2, asset.palette);
  return {
    selectionId: `clipboard-${clipboard2.sourceAssetId}-${clipboard2.sourceSelectionVersion}`,
    mask: {
      kind: "rectangle",
      regions: [
        {
          x: clipboard2.origin.x,
          y: clipboard2.origin.y,
          width: clipboard2.width,
          height: clipboard2.height
        }
      ],
      selectionVersion: clipboard2.sourceSelectionVersion
    },
    scope: {
      assetId: asset.id,
      layerId: state2.activeLayerId,
      frameId: state2.activeFrameId,
      celId: state2.activeCelId
    },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state2.structureEpoch,
    pixels: clipboard2.pixels.map((pixel) => ({
      x: pixel.x + clipboard2.origin.x,
      y: pixel.y + clipboard2.origin.y,
      colorIndex: compatibility.mapping[pixel.colorIndex] ?? pixel.colorIndex
    }))
  };
}
function createClipboardPasteSession(state2, clipboard2, transform2, sessionId = `paste-${state2.projectId}-${clipboard2.sourceSelectionVersion}`) {
  const snapshot = createClipboardSelectionSnapshot(state2, clipboard2);
  return createTransformSession(snapshot, transform2, sessionId);
}
function previewTransform(snapshot, session) {
  return {
    sessionId: session.sessionId,
    pixels: transformedPixels(snapshot, session.transform),
    overlayRegions: [
      session.previewBounds,
      session.destinationBounds
    ],
    canonicalDirtyTiles: [],
    canonicalDirtyRegions: [],
    metricScope: "PREVIEW_ONLY"
  };
}
function previewClipboardPaste(state2, clipboard2, session) {
  return previewTransform(createClipboardSelectionSnapshot(state2, clipboard2), session);
}
function createClipboardPayload(state2, snapshot, provenance) {
  const bounds = boundsFromRegions(snapshot.mask.regions);
  return {
    format: "PIXIEEDRAW2_CLIPBOARD",
    version: 1,
    width: bounds.width,
    height: bounds.height,
    origin: {
      x: bounds.x,
      y: bounds.y
    },
    pixels: snapshot.pixels.map((pixel) => ({
      x: pixel.x - bounds.x,
      y: pixel.y - bounds.y,
      colorIndex: pixel.colorIndex
    })),
    palette: [
      ...state2.assets[snapshot.scope.assetId]?.palette ?? [
        0
      ]
    ],
    sourceAssetId: snapshot.scope.assetId,
    sourceSelectionVersion: snapshot.mask.selectionVersion,
    ...provenance === void 0 ? {} : {
      provenance
    }
  };
}
function assessClipboardPalette(clipboard2, targetPalette) {
  const mapping = {
    0: 0
  };
  const missingColors = [];
  const usedColors = new Set(clipboard2.pixels.map((pixel) => pixel.colorIndex));
  for (const index of usedColors) {
    if (index === 0) continue;
    const color = clipboard2.palette[index];
    if (color === void 0) continue;
    const targetIndex = targetPalette.indexOf(color);
    if (targetIndex >= 0) mapping[index] = targetIndex;
    else missingColors.push(color);
  }
  if (missingColors.length === 0) return {
    result: "EXACT_PALETTE_MATCH",
    mapping,
    missingColors,
    message: "Exact indexed palette match."
  };
  if (missingColors.length + targetPalette.length <= 256) return {
    result: "PALETTE_EXTENSION_REQUIRED",
    mapping,
    missingColors,
    message: "Clipboard requires an explicit palette extension decision."
  };
  if (missingColors.length > 0) return {
    result: "PALETTE_OVERFLOW",
    mapping,
    missingColors,
    message: "Clipboard colors exceed the target palette capacity."
  };
  return {
    result: "INCOMPATIBLE",
    mapping,
    missingColors,
    message: "Clipboard palette is incompatible."
  };
}
function validateSession(snapshot, session) {
  const diagnostics = validateTransform(session.transform);
  if (session.status !== "PREVIEW") diagnostics.push(error("TRANSFORM_SESSION_NOT_PREVIEW", "Only an active Preview session can be committed.", "session.status"));
  if (session.sourceSelectionVersion !== snapshot.mask.selectionVersion) diagnostics.push(error("STALE_SELECTION_VERSION", "Transform session selection version is stale.", "session.sourceSelectionVersion"));
  if (session.sourceRasterRevision !== snapshot.sourceRasterRevision) diagnostics.push(error("STALE_TRANSFORM_RASTER", "Transform session raster version is stale.", "session.sourceRasterRevision"));
  if (session.sourceStructureEpoch !== snapshot.sourceStructureEpoch) diagnostics.push(error("STALE_TRANSFORM_STRUCTURE", "Transform session structure epoch is stale.", "session.sourceStructureEpoch"));
  const estimated = estimatedTransformBounds(snapshot, session.transform);
  if (estimated.width * estimated.height > MAX_SELECTION_PIXELS) diagnostics.push(error("TRANSFORM_PIXEL_LIMIT_EXCEEDED", "Transform output exceeds the bounded pixel limit.", "session.transform.factor"));
  return diagnostics;
}
function changedRegions(assetId, points) {
  const region = regionForPoints(points);
  return region === void 0 ? [] : [
    {
      assetId,
      ...region
    }
  ];
}
async function buildResult(state2, commandId, operationType, operationPayload2, asset, dirtyTiles, dirtyRegions, copiedBytes, cowSplitCount) {
  const operationBody = {
    operationType,
    schemaVersion: 1,
    commandId,
    projectId: state2.projectId,
    assetId: asset.id,
    actorId: "draw2-selection-local",
    clientId: "draw2-selection-local",
    clientSequence: state2.lastClientSequenceByClient["draw2-selection-local"] ?? 0,
    structureEpoch: state2.structureEpoch,
    payload: operationPayload2
  };
  const operation = {
    operationId: `op_${await canonicalOperationId(operationBody)}`,
    ...operationBody
  };
  const points = dirtyRegions.flatMap((region) => [
    {
      x: region.x,
      y: region.y
    },
    {
      x: region.x + region.width - 1,
      y: region.y + region.height - 1
    }
  ]);
  return {
    operation,
    metricScope: "COMMAND_TO_DIRTY",
    dirtyTiles: [
      ...dirtyTiles.values()
    ].sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
    dirtyRegions,
    memory: asset.raster.memoryMetrics(),
    copiedBytes,
    cowSplitCount,
    trace: {
      commandValidationCount: 1,
      commandCommitCount: 1,
      affectedLayerCount: 1,
      affectedFrameCount: 1,
      fullRasterCloneCount: 0,
      fullTimelineRebuildCount: 0,
      wholeProjectSerializationCount: 0
    },
    instrumentation: [
      {
        name: "dirty.tileCalculation",
        durationMs: 0,
        detail: {
          tileCount: dirtyTiles.size,
          metricScope: "COMMAND_TO_DIRTY"
        }
      },
      ...points.map(() => ({
        name: "renderer.prepare",
        durationMs: 0,
        detail: {
          metricScope: "DIRTY_TO_PRESENT"
        }
      }))
    ]
  };
}
async function canonicalOperationId(value) {
  return (await sha256Hex(value)).slice(0, 32);
}
function applyPixelMutations(state2, assetId, sourcePixels, destinationPixels, clearSource) {
  const nextState = cloneProjectStateShared(state2);
  const asset = nextState.assets[assetId];
  if (asset === void 0) throw new Error("Selection target asset is missing.");
  const dirtyTiles = /* @__PURE__ */ new Map();
  const dirtyPoints = [];
  let copiedBytes = 0;
  let cowSplitCount = 0;
  const mutate = (point, colorIndex) => {
    const mutation = asset.raster.setPixel(asset.id, point.x, point.y, colorIndex);
    if (!mutation.changed) return;
    dirtyTiles.set(mutation.tile.tileKey, mutation.tile);
    dirtyPoints.push(point);
    copiedBytes += mutation.copiedBytes;
    if (mutation.cowSplit) cowSplitCount += 1;
  };
  if (clearSource) for (const pixel of sourcePixels) mutate(pixel, 0);
  for (const pixel of destinationPixels) mutate(pixel, pixel.colorIndex);
  const nextAsset = {
    ...asset,
    revision: asset.revision + (dirtyTiles.size > 0 ? 1 : 0)
  };
  nextState.assets = {
    ...nextState.assets,
    [assetId]: nextAsset
  };
  return {
    state: nextState,
    asset: nextAsset,
    dirtyTiles,
    dirtyPoints,
    copiedBytes,
    cowSplitCount
  };
}
function commitState(state2, commandId) {
  const next = cloneProjectStateShared(state2);
  next.appliedCommandIds = [
    ...next.appliedCommandIds,
    commandId
  ];
  next.lastClientSequenceByClient = {
    ...next.lastClientSequenceByClient,
    ["draw2-selection-local"]: (next.lastClientSequenceByClient["draw2-selection-local"] ?? 0) + 1
  };
  return next;
}
async function commitTransform(state2, command) {
  const asset = state2.assets[command.assetId];
  if (asset === void 0) return {
    ok: false,
    state: state2,
    diagnostics: [
      error("TRANSFORM_ASSET_NOT_FOUND", "Transform asset was not found.")
    ]
  };
  const diagnostics = [
    ...validateSnapshot(state2, asset, command.payload.selection),
    ...validateSession(command.payload.selection, command.payload.session)
  ];
  if (command.projectId !== state2.projectId || command.assetId !== command.payload.selection.scope.assetId || command.baseStructureEpoch !== state2.structureEpoch) diagnostics.push(error("TRANSFORM_COMMAND_SCOPE_INVALID", "Transform command scope is stale or mismatched."));
  if (state2.appliedCommandIds.includes(command.commandId)) diagnostics.push(error("TRANSFORM_DUPLICATE_COMMAND", "Transform command was already applied.", "commandId"));
  if (diagnostics.length > 0) return {
    ok: false,
    state: state2,
    diagnostics
  };
  const transformed = transformedPixels(command.payload.selection, command.payload.session.transform);
  const outOfBounds = transformed.some((pixel) => pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width || pixel.y >= asset.height);
  if (outOfBounds && command.payload.session.transform.outOfBoundsPolicy === "CANCEL") return {
    ok: false,
    state: state2,
    diagnostics: [
      error("TRANSFORM_OUT_OF_BOUNDS", "Transform destination is outside the raster and policy is CANCEL.")
    ]
  };
  const clipped = transformed.filter((pixel) => pixel.x >= 0 && pixel.y >= 0 && pixel.x < asset.width && pixel.y < asset.height);
  const mutation = applyPixelMutations(state2, command.assetId, command.payload.selection.pixels, clipped, true);
  const sourcePoints = command.payload.selection.pixels;
  const destinationPoints = clipped;
  const dirtyRegions = [
    ...changedRegions(asset.id, sourcePoints),
    ...changedRegions(asset.id, destinationPoints)
  ];
  const operationPayload2 = {
    selectionId: command.payload.selection.selectionId,
    selectionVersion: command.payload.selection.mask.selectionVersion,
    transform: command.payload.session.transform,
    sourcePixelCount: sourcePoints.length,
    destinationPixelCount: destinationPoints.length,
    outOfBoundsClipped: outOfBounds && command.payload.session.transform.outOfBoundsPolicy === "CLIP"
  };
  const temporaryResult = await buildResult(mutation.state, command.commandId, "selection.transformCommit", operationPayload2, mutation.asset, mutation.dirtyTiles, dirtyRegions, mutation.copiedBytes, mutation.cowSplitCount);
  const nextState = commitState(mutation.state, command.commandId);
  return {
    ok: true,
    state: nextState,
    result: {
      ...temporaryResult,
      operation: {
        ...temporaryResult.operation,
        clientSequence: nextState.lastClientSequenceByClient["draw2-selection-local"] ?? 0
      }
    }
  };
}
async function cutClipboard(state2, command) {
  const asset = state2.assets[command.assetId];
  if (asset === void 0) return {
    ok: false,
    state: state2,
    diagnostics: [
      error("CLIPBOARD_ASSET_NOT_FOUND", "Clipboard source asset was not found.")
    ]
  };
  if (state2.appliedCommandIds.includes(command.commandId)) return {
    ok: false,
    state: state2,
    diagnostics: [
      error("CLIPBOARD_DUPLICATE_COMMAND", "Clipboard command was already applied.", "commandId")
    ]
  };
  if (command.projectId !== state2.projectId || command.baseStructureEpoch !== state2.structureEpoch) return {
    ok: false,
    state: state2,
    diagnostics: [
      error("CLIPBOARD_COMMAND_SCOPE_INVALID", "Clipboard command scope is stale or mismatched.")
    ]
  };
  const diagnostics = [
    ...validateClipboard(command.payload.clipboard, asset),
    ...validateSnapshot(state2, asset, command.payload.selection)
  ];
  if (diagnostics.length > 0) return {
    ok: false,
    state: state2,
    diagnostics
  };
  const mutation = applyPixelMutations(state2, command.assetId, command.payload.selection.pixels, [], true);
  const dirtyRegions = changedRegions(asset.id, command.payload.selection.pixels);
  const result = await buildResult(mutation.state, command.commandId, "clipboard.cut", {
    format: command.payload.clipboard.format,
    version: 1,
    pixelCount: command.payload.clipboard.pixels.length
  }, mutation.asset, mutation.dirtyTiles, dirtyRegions, mutation.copiedBytes, mutation.cowSplitCount);
  const nextState = commitState(mutation.state, command.commandId);
  return {
    ok: true,
    state: nextState,
    result: {
      ...result,
      operation: {
        ...result.operation,
        clientSequence: nextState.lastClientSequenceByClient["draw2-selection-local"] ?? 0
      }
    },
    clipboard: command.payload.clipboard
  };
}
async function pasteClipboard(state2, command) {
  const asset = state2.assets[command.assetId];
  if (asset === void 0) return {
    ok: false,
    state: state2,
    diagnostics: [
      error("CLIPBOARD_ASSET_NOT_FOUND", "Clipboard target asset was not found.")
    ]
  };
  if (state2.appliedCommandIds.includes(command.commandId)) return {
    ok: false,
    state: state2,
    diagnostics: [
      error("CLIPBOARD_DUPLICATE_COMMAND", "Clipboard command was already applied.", "commandId")
    ]
  };
  if (command.projectId !== state2.projectId || command.baseStructureEpoch !== state2.structureEpoch) return {
    ok: false,
    state: state2,
    diagnostics: [
      error("CLIPBOARD_COMMAND_SCOPE_INVALID", "Clipboard command scope is stale or mismatched.")
    ]
  };
  const compatibility = assessClipboardPalette(command.payload.clipboard, asset.palette);
  const diagnostics = [
    ...validateClipboard(command.payload.clipboard, asset),
    ...validateTransform(command.payload.session.transform)
  ];
  if (compatibility.result !== "EXACT_PALETTE_MATCH") diagnostics.push(error("CLIPBOARD_PALETTE_MISMATCH", compatibility.message, "clipboard.palette"));
  if (command.payload.session.status !== "PREVIEW") diagnostics.push(error("PASTE_SESSION_NOT_PREVIEW", "Paste must begin as a placement Preview."));
  if (command.payload.session.sourceRasterRevision !== asset.revision) diagnostics.push(error("STALE_PASTE_RASTER", "Paste placement session is stale for the target raster."));
  if (command.payload.session.sourceStructureEpoch !== state2.structureEpoch) diagnostics.push(error("STALE_PASTE_STRUCTURE", "Paste placement session is stale for the Project structure."));
  if (diagnostics.length > 0) return {
    ok: false,
    state: state2,
    diagnostics
  };
  const relativePixels = command.payload.clipboard.pixels;
  const destinationPixels = transformedPixels({
    selectionId: `paste-${command.commandId}`,
    mask: {
      kind: "rectangle",
      regions: [
        {
          x: command.payload.clipboard.origin.x,
          y: command.payload.clipboard.origin.y,
          width: command.payload.clipboard.width,
          height: command.payload.clipboard.height
        }
      ],
      selectionVersion: command.payload.clipboard.sourceSelectionVersion
    },
    scope: {
      assetId: command.assetId,
      layerId: state2.activeLayerId,
      frameId: state2.activeFrameId,
      celId: state2.activeCelId
    },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state2.structureEpoch,
    pixels: relativePixels.map((pixel) => ({
      x: pixel.x + command.payload.clipboard.origin.x,
      y: pixel.y + command.payload.clipboard.origin.y,
      colorIndex: compatibility.mapping[pixel.colorIndex] ?? pixel.colorIndex
    }))
  }, command.payload.session.transform);
  const outOfBounds = destinationPixels.some((pixel) => pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width || pixel.y >= asset.height);
  if (outOfBounds && command.payload.session.transform.outOfBoundsPolicy === "CANCEL") return {
    ok: false,
    state: state2,
    diagnostics: [
      error("PASTE_OUT_OF_BOUNDS", "Paste destination is outside the raster and policy is CANCEL.")
    ]
  };
  const clipped = destinationPixels.filter((pixel) => pixel.x >= 0 && pixel.y >= 0 && pixel.x < asset.width && pixel.y < asset.height);
  const mutation = applyPixelMutations(state2, command.assetId, [], clipped, false);
  const result = await buildResult(mutation.state, command.commandId, "clipboard.paste", {
    format: command.payload.clipboard.format,
    version: 1,
    pixelCount: clipped.length,
    paletteCompatibility: compatibility.result
  }, mutation.asset, mutation.dirtyTiles, changedRegions(asset.id, clipped), mutation.copiedBytes, mutation.cowSplitCount);
  const nextState = commitState(mutation.state, command.commandId);
  return {
    ok: true,
    state: nextState,
    result: {
      ...result,
      operation: {
        ...result.operation,
        clientSequence: nextState.lastClientSequenceByClient["draw2-selection-local"] ?? 0
      }
    },
    clipboard: command.payload.clipboard
  };
}
function selectionCommandId(operation, projectId, sequence) {
  return `draw2-${operation}-${projectId}-${sequence}`;
}
var LocalUndoRedoHistory = class {
  #state;
  #undo = [];
  #redo = [];
  constructor(state2) {
    this.#state = state2;
  }
  get state() {
    return this.#state;
  }
  get undoDepth() {
    return this.#undo.length;
  }
  get redoDepth() {
    return this.#redo.length;
  }
  snapshot(maxEntries = Number.MAX_SAFE_INTEGER) {
    const limit = Number.isSafeInteger(maxEntries) && maxEntries >= 0 ? maxEntries : Number.MAX_SAFE_INTEGER;
    const bounded = (entries) => {
      const start = Math.max(0, entries.length - limit);
      return entries.slice(start).map((entry) => ({
        ...entry,
        before: cloneProjectStateShared(entry.before),
        after: cloneProjectStateShared(entry.after)
      }));
    };
    return {
      undo: bounded(this.#undo),
      redo: bounded(this.#redo)
    };
  }
  restore(snapshot) {
    this.#undo.length = 0;
    this.#redo.length = 0;
    for (const entry of snapshot.undo) {
      this.#undo.push({
        ...entry,
        before: cloneProjectStateShared(entry.before),
        after: cloneProjectStateShared(entry.after)
      });
    }
    for (const entry of snapshot.redo) {
      this.#redo.push({
        ...entry,
        before: cloneProjectStateShared(entry.before),
        after: cloneProjectStateShared(entry.after)
      });
    }
    this.#state = cloneProjectStateShared(snapshot.undo.at(-1)?.after ?? snapshot.redo.at(-1)?.before ?? this.#state);
  }
  record(before, after, operationId, operationType, actionId = operationId) {
    this.#undo.push({
      actionId,
      operationId,
      operationType,
      before: cloneProjectStateShared(before),
      after: cloneProjectStateShared(after)
    });
    this.#redo.length = 0;
    this.#state = cloneProjectStateShared(after);
  }
  undo() {
    const entry = this.#undo.pop();
    if (entry === void 0) return void 0;
    this.#redo.push(entry);
    this.#state = cloneProjectStateShared(entry.before);
    return {
      state: this.#state,
      actionId: entry.actionId,
      operationId: entry.operationId,
      direction: "UNDO",
      transport: "LOCAL_ONLY"
    };
  }
  redo() {
    const entry = this.#redo.pop();
    if (entry === void 0) return void 0;
    this.#undo.push(entry);
    this.#state = cloneProjectStateShared(entry.after);
    return {
      state: this.#state,
      actionId: entry.actionId,
      operationId: entry.operationId,
      direction: "REDO",
      transport: "LOCAL_ONLY"
    };
  }
};

// src/draw2-timeline.ts
function typedTimelineId(value, kind) {
  if (!value || value.length > 256 || /^\d+$/.test(value) || !/^[A-Za-z0-9:_./-]+$/.test(value)) throw new Error(`${kind} ID must be a stable non-index identifier.`);
  return value;
}
function diagnostic3(code, message, path) {
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
function integer(value) {
  return Number.isSafeInteger(value);
}
function positiveDuration(value) {
  return integer(value) && value >= 1 && value <= 36e5;
}
function orderKey(index, id) {
  return `${index.toString().padStart(8, "0")}:${id}`;
}
function celWithBinding(celRecord, rasterAssetId, bindingMode, lifecycle) {
  const identity = {
    ...celRecord,
    bindingMode,
    lifecycle,
    recordVersion: celRecord.recordVersion + 1
  };
  if (rasterAssetId === void 0) {
    const { assetId: _assetId, ...withoutAsset } = identity;
    return withoutAsset;
  }
  return {
    ...identity,
    assetId: rasterAssetId
  };
}
function layer(state2, id) {
  return state2.layers.find((item) => item.layerTrackId === id || item.id === id);
}
function frame(state2, id) {
  return state2.frames.find((item) => item.frameId === id || item.id === id);
}
function cel(state2, id) {
  return state2.cels.find((item) => item.celId === id || item.id === id);
}
function validateEnvelope2(state2, command) {
  const diagnostics = [];
  if (command.schemaVersion !== 1) diagnostics.push(diagnostic3("STRUCTURE_SCHEMA_UNSUPPORTED", "Unsupported structural command schema.", "schemaVersion"));
  if (command.projectId !== state2.projectId) diagnostics.push(diagnostic3("STRUCTURE_PROJECT_MISMATCH", "Structural command project does not match state.", "projectId"));
  if (command.assetId !== state2.activeAssetId) diagnostics.push(diagnostic3("STRUCTURE_ASSET_SCOPE_INVALID", "Structural command must use the active Project asset scope.", "assetId"));
  if (command.baseStructureEpoch !== state2.structureEpoch) diagnostics.push(diagnostic3("STALE_STRUCTURE_COMMAND", "Structural command is based on a stale structure epoch.", "baseStructureEpoch"));
  if (state2.appliedCommandIds.includes(command.commandId)) diagnostics.push(diagnostic3("DUPLICATE_STRUCTURE_COMMAND", "Structural command was already applied.", "commandId"));
  const expectedSequence = (state2.lastClientSequenceByClient[command.clientId] ?? 0) + 1;
  if (command.clientSequence !== expectedSequence) diagnostics.push(diagnostic3("STRUCTURE_CLIENT_SEQUENCE_GAP", `Expected structural client sequence ${expectedSequence}.`, "clientSequence"));
  if (!command.commandId || !command.actorId || !command.clientId) diagnostics.push(diagnostic3("STRUCTURE_REQUIRED_FIELD", "Structural command identity fields are required."));
  if (!integer(command.clientSequence) || command.clientSequence < 1) diagnostics.push(diagnostic3("STRUCTURE_CLIENT_SEQUENCE_INVALID", "clientSequence must be a positive safe integer.", "clientSequence"));
  if (!Number.isFinite(command.createdAtMonotonicMs) || command.createdAtMonotonicMs < 0) diagnostics.push(diagnostic3("STRUCTURE_MONOTONIC_TIME_INVALID", "createdAtMonotonicMs must be finite and non-negative.", "createdAtMonotonicMs"));
  return diagnostics;
}
function validateStableField(value, kind, path) {
  try {
    typedTimelineId(value, kind);
    return [];
  } catch (cause) {
    return [
      diagnostic3("STABLE_ID_INVALID", cause instanceof Error ? cause.message : "Stable ID is invalid.", path)
    ];
  }
}
function validateIndex(value, length, path) {
  return integer(value) && value >= 0 && value < length ? [] : [
    diagnostic3("STRUCTURE_ORDER_INVALID", `Order index must be between 0 and ${Math.max(0, length - 1)}.`, path)
  ];
}
function validatePayload2(state2, command) {
  const payload = command.payload;
  const diagnostics = [];
  if (command.commandType === "timeline.addLayerTrack") {
    diagnostics.push(...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (layer(state2, payload.layerTrackId) !== void 0) diagnostics.push(diagnostic3("DUPLICATE_LAYER_TRACK_ID", "Layer Track ID already exists.", "payload.layerTrackId"));
    if (!payload.name.trim() || payload.name.length > 128) diagnostics.push(diagnostic3("LAYER_TRACK_NAME_INVALID", "Layer Track name must be 1..128 characters.", "payload.name"));
    if (payload.kind !== void 0 && payload.kind !== "RASTER" && payload.kind !== "TILEMAP") diagnostics.push(diagnostic3("LAYER_KIND_INVALID", "Layer Track kind is unsupported.", "payload.kind"));
    if (payload.targetIndex !== void 0) diagnostics.push(...validateIndex(payload.targetIndex, state2.layers.length + 1, "payload.targetIndex"));
  } else if (command.commandType === "timeline.removeLayerTrack" || command.commandType === "timeline.renameLayerTrack" || command.commandType === "timeline.setLayerVisibility" || command.commandType === "timeline.setLayerOpacity" || command.commandType === "timeline.setLayerBlendMode" || command.commandType === "timeline.setLayerLock") {
    diagnostics.push(...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (layer(state2, payload.layerTrackId) === void 0) diagnostics.push(diagnostic3("UNKNOWN_LAYER_TRACK", "Layer Track does not exist.", "payload.layerTrackId"));
    if (command.commandType === "timeline.removeLayerTrack" && state2.layers.length <= 1) diagnostics.push(diagnostic3("REMOVE_LAST_LAYER_FORBIDDEN", "The last required Layer Track cannot be removed.", "payload.layerTrackId"));
    if (command.commandType === "timeline.renameLayerTrack" && (!payload.name.trim() || payload.name.length > 128)) diagnostics.push(diagnostic3("LAYER_TRACK_NAME_INVALID", "Layer Track name must be 1..128 characters.", "payload.name"));
    if (command.commandType === "timeline.setLayerOpacity" && (!Number.isFinite(payload.opacity) || payload.opacity < 0 || payload.opacity > 1)) diagnostics.push(diagnostic3("LAYER_OPACITY_INVALID", "Layer opacity must be between 0 and 1.", "payload.opacity"));
    if (command.commandType === "timeline.setLayerBlendMode" && payload.blendMode !== "NORMAL" && payload.blendMode !== "MULTIPLY") diagnostics.push(diagnostic3("LAYER_BLEND_MODE_INVALID", "Layer blend mode is unsupported.", "payload.blendMode"));
  } else if (command.commandType === "timeline.duplicateLayerTrack") {
    diagnostics.push(...validateStableField(payload.sourceLayerTrackId, "LAYER_TRACK", "payload.sourceLayerTrackId"), ...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (layer(state2, payload.sourceLayerTrackId) === void 0) diagnostics.push(diagnostic3("UNKNOWN_LAYER_TRACK", "Source Layer Track does not exist.", "payload.sourceLayerTrackId"));
    if (layer(state2, payload.layerTrackId) !== void 0) diagnostics.push(diagnostic3("DUPLICATE_LAYER_TRACK_ID", "Layer Track ID already exists.", "payload.layerTrackId"));
    if (payload.kind !== void 0 && payload.kind !== "RASTER" && payload.kind !== "TILEMAP") diagnostics.push(diagnostic3("LAYER_KIND_INVALID", "Layer Track kind is unsupported.", "payload.kind"));
    if (payload.targetIndex !== void 0) diagnostics.push(...validateIndex(payload.targetIndex, state2.layers.length + 1, "payload.targetIndex"));
  } else if (command.commandType === "timeline.reorderLayerTrack") {
    diagnostics.push(...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (layer(state2, payload.layerTrackId) === void 0) diagnostics.push(diagnostic3("UNKNOWN_LAYER_TRACK", "Layer Track does not exist.", "payload.layerTrackId"));
    diagnostics.push(...validateIndex(payload.targetIndex, state2.layers.length, "payload.targetIndex"));
  } else if (command.commandType === "timeline.addFrame") {
    diagnostics.push(...validateStableField(payload.frameId, "FRAME", "payload.frameId"));
    if (frame(state2, payload.frameId) !== void 0) diagnostics.push(diagnostic3("DUPLICATE_FRAME_ID", "Frame ID already exists.", "payload.frameId"));
    if (payload.durationMs !== void 0 && !positiveDuration(payload.durationMs)) diagnostics.push(diagnostic3("FRAME_DURATION_INVALID", "Frame duration must be a positive integer in milliseconds.", "payload.durationMs"));
    if (payload.targetIndex !== void 0) diagnostics.push(...validateIndex(payload.targetIndex, state2.frames.length + 1, "payload.targetIndex"));
  } else if (command.commandType === "timeline.removeFrame" || command.commandType === "timeline.reorderFrame" || command.commandType === "timeline.changeFrameDuration") {
    diagnostics.push(...validateStableField(payload.frameId, "FRAME", "payload.frameId"));
    if (frame(state2, payload.frameId) === void 0) diagnostics.push(diagnostic3("UNKNOWN_FRAME", "Frame does not exist.", "payload.frameId"));
    if (command.commandType === "timeline.removeFrame" && state2.frames.length <= 1) diagnostics.push(diagnostic3("REMOVE_LAST_FRAME_FORBIDDEN", "The last required Frame cannot be removed.", "payload.frameId"));
    if (command.commandType === "timeline.reorderFrame") diagnostics.push(...validateIndex(payload.targetIndex, state2.frames.length, "payload.targetIndex"));
    if (command.commandType === "timeline.changeFrameDuration" && !positiveDuration(payload.durationMs)) diagnostics.push(diagnostic3("FRAME_DURATION_INVALID", "Frame duration must be a positive integer in milliseconds.", "payload.durationMs"));
  } else if (command.commandType === "timeline.duplicateFrame") {
    diagnostics.push(...validateStableField(payload.sourceFrameId, "FRAME", "payload.sourceFrameId"), ...validateStableField(payload.frameId, "FRAME", "payload.frameId"));
    if (frame(state2, payload.sourceFrameId) === void 0) diagnostics.push(diagnostic3("UNKNOWN_FRAME", "Source Frame does not exist.", "payload.sourceFrameId"));
    if (frame(state2, payload.frameId) !== void 0) diagnostics.push(diagnostic3("DUPLICATE_FRAME_ID", "Frame ID already exists.", "payload.frameId"));
    if (payload.targetIndex !== void 0) diagnostics.push(...validateIndex(payload.targetIndex, state2.frames.length + 1, "payload.targetIndex"));
  } else if (command.commandType === "timeline.createCel") {
    diagnostics.push(...validateStableField(payload.celId, "CEL", "payload.celId"), ...validateStableField(payload.frameId, "FRAME", "payload.frameId"), ...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (cel(state2, payload.celId) !== void 0) diagnostics.push(diagnostic3("DUPLICATE_CEL_ID", "Cel ID already exists.", "payload.celId"));
    if (frame(state2, payload.frameId) === void 0) diagnostics.push(diagnostic3("UNKNOWN_FRAME", "Cel Frame does not exist.", "payload.frameId"));
    if (layer(state2, payload.layerTrackId) === void 0) diagnostics.push(diagnostic3("UNKNOWN_LAYER_TRACK", "Cel Layer Track does not exist.", "payload.layerTrackId"));
    if (payload.rasterAssetId !== void 0 && state2.assets[payload.rasterAssetId] === void 0) diagnostics.push(diagnostic3("UNKNOWN_RASTER_ASSET", "Cel raster backing does not exist.", "payload.rasterAssetId"));
    if (payload.bindingMode === "EMPTY" && payload.rasterAssetId !== void 0) diagnostics.push(diagnostic3("EMPTY_CEL_HAS_RASTER", "Empty Cel must not materialize a Raster backing.", "payload.rasterAssetId"));
  } else if (command.commandType === "timeline.clearCel" || command.commandType === "timeline.replaceCelBinding") {
    diagnostics.push(...validateStableField(payload.celId, "CEL", "payload.celId"));
    const targetCel = cel(state2, payload.celId);
    if (targetCel === void 0) diagnostics.push(diagnostic3("UNKNOWN_CEL", "Cel does not exist.", "payload.celId"));
    if (command.commandType === "timeline.replaceCelBinding") {
      if (payload.rasterAssetId !== void 0 && state2.assets[payload.rasterAssetId] === void 0) diagnostics.push(diagnostic3("UNKNOWN_RASTER_ASSET", "Cel raster backing does not exist.", "payload.rasterAssetId"));
      if (payload.bindingMode === "EMPTY" && payload.rasterAssetId !== void 0) diagnostics.push(diagnostic3("EMPTY_CEL_HAS_RASTER", "Empty Cel must not materialize a Raster backing.", "payload.rasterAssetId"));
    }
  } else if (command.commandType === "timeline.activateCel") {
    diagnostics.push(...validateStableField(payload.celId, "CEL", "payload.celId"), ...validateStableField(payload.frameId, "FRAME", "payload.frameId"), ...validateStableField(payload.layerTrackId, "LAYER_TRACK", "payload.layerTrackId"));
    if (frame(state2, payload.frameId) === void 0) diagnostics.push(diagnostic3("UNKNOWN_FRAME", "Activation Frame does not exist.", "payload.frameId"));
    if (layer(state2, payload.layerTrackId) === void 0) diagnostics.push(diagnostic3("UNKNOWN_LAYER_TRACK", "Activation Layer Track does not exist.", "payload.layerTrackId"));
    const targetCel = cel(state2, payload.celId);
    if (targetCel !== void 0 && (targetCel.frameId !== payload.frameId || targetCel.layerTrackId !== payload.layerTrackId)) {
      diagnostics.push(diagnostic3("CEL_SCOPE_MISMATCH", "Activation Cel does not belong to the requested Frame and Layer Track.", "payload.celId"));
    }
    const occupiedCel = state2.cels.find((item) => item.lifecycle !== "ARCHIVED" && item.frameId === payload.frameId && item.layerTrackId === payload.layerTrackId && item.celId !== payload.celId);
    if (occupiedCel !== void 0) diagnostics.push(diagnostic3("TIMELINE_CELL_OCCUPIED", "The requested Frame and Layer Track already has another Cel identity.", "payload.celId"));
    if (targetCel?.assetId !== void 0 && state2.assets[targetCel.assetId] === void 0) diagnostics.push(diagnostic3("MISSING_CEL_RASTER", "Activation Cel references a missing Raster backing.", "payload.celId"));
  }
  return diagnostics;
}
function commitState2(state2, patch, command) {
  const shared = cloneProjectStateShared(state2);
  const patchAssets = patch.assets === void 0 ? shared.assets : {
    ...shared.assets,
    ...patch.assets
  };
  return {
    ...shared,
    ...patch,
    assets: patchAssets,
    structureEpoch: state2.structureEpoch + 1,
    appliedCommandIds: [
      ...state2.appliedCommandIds,
      command.commandId
    ],
    lastClientSequenceByClient: {
      ...state2.lastClientSequenceByClient,
      [command.clientId]: command.clientSequence
    }
  };
}
function updateFrameOrder(frames, order) {
  return order.map((id, index) => {
    const item = frames.find((frameItem) => frameItem.frameId === id);
    if (item === void 0) throw new Error("Frame order references an unknown Frame.");
    return {
      ...item,
      index,
      orderKey: orderKey(index, item.frameId),
      metadataVersion: item.metadataVersion + (item.index === index ? 0 : 1)
    };
  });
}
function updateLayerOrder(layers, order) {
  return order.map((id, index) => {
    const item = layers.find((layerItem) => layerItem.layerTrackId === id);
    if (item === void 0) throw new Error("Layer Track order references an unknown Layer Track.");
    return {
      ...item,
      order: index,
      orderingKey: orderKey(index, item.layerTrackId)
    };
  });
}
function insertAt(order, id, targetIndex) {
  const next = [
    ...order
  ];
  const index = targetIndex === void 0 ? next.length : Math.min(Math.max(targetIndex, 0), next.length);
  next.splice(index, 0, id);
  return next;
}
function moveTo(order, id, targetIndex) {
  const next = order.filter((item) => item !== id);
  next.splice(Math.min(Math.max(targetIndex, 0), next.length), 0, id);
  return next;
}
function operationPayload(command) {
  return command.payload;
}
async function resultFor(state2, command, operationType, domains) {
  const asset = state2.assets[state2.activeAssetId];
  if (asset === void 0) throw new Error("Structural result active asset is missing.");
  const operationBody = {
    operationType,
    schemaVersion: 1,
    commandId: command.commandId,
    projectId: state2.projectId,
    assetId: asset.id,
    actorId: command.actorId,
    clientId: command.clientId,
    clientSequence: command.clientSequence,
    structureEpoch: state2.structureEpoch,
    payload: operationPayload(command)
  };
  const operation = {
    operationId: `op_${await sha256Hex(operationBody)}`,
    ...operationBody
  };
  const metricScope = "COMMAND_TO_DIRTY";
  return {
    operation,
    metricScope,
    structuralDirtyDomains: domains,
    dirtyTiles: [],
    dirtyRegions: [],
    memory: asset.raster.memoryMetrics(),
    copiedBytes: 0,
    cowSplitCount: 0,
    trace: {
      commandValidationCount: 1,
      commandCommitCount: 1,
      affectedLayerCount: 1,
      affectedFrameCount: 1,
      fullRasterCloneCount: 0,
      fullTimelineRebuildCount: 0,
      wholeProjectSerializationCount: 0
    },
    instrumentation: [
      {
        name: "dirty.tileCalculation",
        durationMs: 0,
        detail: {
          domainCount: domains.length,
          metricScope
        }
      }
    ]
  };
}
async function executeTimelineCommand(state2, command) {
  const diagnostics = [
    ...validateEnvelope2(state2, command),
    ...validatePayload2(state2, command)
  ];
  if (diagnostics.length > 0) return {
    ok: false,
    state: state2,
    diagnostics
  };
  let patch = {};
  let domains = [
    "TIMELINE_STRUCTURE_DIRTY"
  ];
  if (command.commandType === "timeline.addLayerTrack") {
    const item = {
      id: command.payload.layerTrackId,
      layerTrackId: command.payload.layerTrackId,
      name: command.payload.name.trim(),
      order: 0,
      orderingKey: "",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      locked: false,
      lifecycle: "ACTIVE",
      kind: command.payload.kind ?? "RASTER"
    };
    const order = insertAt(state2.timeline.layerTrackOrder, item.layerTrackId, command.payload.targetIndex);
    patch = {
      layers: updateLayerOrder([
        ...state2.layers,
        item
      ], order),
      timeline: {
        ...state2.timeline,
        layerTrackOrder: order,
        metadataVersion: state2.timeline.metadataVersion + 1
      }
    };
  } else if (command.commandType === "timeline.removeLayerTrack") {
    const order = state2.timeline.layerTrackOrder.filter((id) => id !== command.payload.layerTrackId);
    const tilemaps = Object.fromEntries(Object.entries(state2.tilemaps ?? {}).filter(([, map]) => map.layerTrackId !== command.payload.layerTrackId));
    patch = {
      layers: updateLayerOrder(state2.layers.filter((item) => item.layerTrackId !== command.payload.layerTrackId), order),
      cels: state2.cels.filter((item) => item.layerTrackId !== command.payload.layerTrackId),
      tilemaps,
      timeline: {
        ...state2.timeline,
        layerTrackOrder: order,
        metadataVersion: state2.timeline.metadataVersion + 1
      }
    };
    domains = [
      "TIMELINE_STRUCTURE_DIRTY",
      "COMPOSITE_DIRTY",
      "TIMELINE_CELL_DIRTY"
    ];
  } else if (command.commandType === "timeline.duplicateLayerTrack") {
    const source = layer(state2, command.payload.sourceLayerTrackId);
    if (source === void 0) throw new Error("Validated source Layer Track disappeared.");
    const item = {
      ...source,
      id: command.payload.layerTrackId,
      layerTrackId: command.payload.layerTrackId,
      name: command.payload.name?.trim() || `${source.name} Copy`,
      order: 0,
      orderingKey: "",
      kind: command.payload.kind ?? source.kind ?? "RASTER"
    };
    const order = insertAt(state2.timeline.layerTrackOrder, item.layerTrackId, command.payload.targetIndex);
    patch = {
      layers: updateLayerOrder([
        ...state2.layers,
        item
      ], order),
      timeline: {
        ...state2.timeline,
        layerTrackOrder: order,
        metadataVersion: state2.timeline.metadataVersion + 1
      }
    };
  } else if (command.commandType === "timeline.reorderLayerTrack") {
    const order = moveTo(state2.timeline.layerTrackOrder, command.payload.layerTrackId, command.payload.targetIndex);
    patch = {
      layers: updateLayerOrder(state2.layers, order),
      timeline: {
        ...state2.timeline,
        layerTrackOrder: order,
        metadataVersion: state2.timeline.metadataVersion + 1
      }
    };
  } else if (command.commandType === "timeline.renameLayerTrack" || command.commandType === "timeline.setLayerVisibility" || command.commandType === "timeline.setLayerOpacity" || command.commandType === "timeline.setLayerBlendMode" || command.commandType === "timeline.setLayerLock") {
    const target = layer(state2, command.payload.layerTrackId);
    if (target === void 0) throw new Error("Validated Layer Track disappeared.");
    const updated = command.commandType === "timeline.renameLayerTrack" ? {
      ...target,
      name: command.payload.name.trim()
    } : command.commandType === "timeline.setLayerVisibility" ? {
      ...target,
      visible: command.payload.visible
    } : command.commandType === "timeline.setLayerOpacity" ? {
      ...target,
      opacity: command.payload.opacity
    } : command.commandType === "timeline.setLayerBlendMode" ? {
      ...target,
      blendMode: command.payload.blendMode
    } : {
      ...target,
      locked: command.payload.locked
    };
    patch = {
      layers: state2.layers.map((item) => item.layerTrackId === target.layerTrackId ? updated : item)
    };
    domains = command.commandType === "timeline.setLayerLock" ? [
      "LAYER_METADATA_DIRTY"
    ] : [
      "LAYER_METADATA_DIRTY",
      "COMPOSITE_DIRTY"
    ];
  } else if (command.commandType === "timeline.addFrame") {
    const item = {
      id: command.payload.frameId,
      frameId: command.payload.frameId,
      index: 0,
      orderKey: "",
      durationMs: command.payload.durationMs ?? 100,
      timingUnit: "MILLISECONDS",
      metadataVersion: 1
    };
    const order = insertAt(state2.timeline.frameOrder, item.frameId, command.payload.targetIndex);
    patch = {
      frames: updateFrameOrder([
        ...state2.frames,
        item
      ], order),
      timeline: {
        ...state2.timeline,
        frameOrder: order,
        metadataVersion: state2.timeline.metadataVersion + 1
      }
    };
  } else if (command.commandType === "timeline.removeFrame") {
    const order = state2.timeline.frameOrder.filter((id) => id !== command.payload.frameId);
    const tilemaps = Object.fromEntries(Object.entries(state2.tilemaps ?? {}).filter(([, map]) => map.frameId !== command.payload.frameId));
    patch = {
      frames: updateFrameOrder(state2.frames.filter((item) => item.frameId !== command.payload.frameId), order),
      cels: state2.cels.filter((item) => item.frameId !== command.payload.frameId),
      tilemaps,
      timeline: {
        ...state2.timeline,
        frameOrder: order,
        metadataVersion: state2.timeline.metadataVersion + 1
      }
    };
    domains = [
      "TIMELINE_STRUCTURE_DIRTY",
      "COMPOSITE_DIRTY",
      "TIMELINE_CELL_DIRTY"
    ];
  } else if (command.commandType === "timeline.duplicateFrame") {
    const source = frame(state2, command.payload.sourceFrameId);
    if (source === void 0) throw new Error("Validated source Frame disappeared.");
    const item = {
      ...source,
      id: command.payload.frameId,
      frameId: command.payload.frameId,
      index: 0,
      orderKey: "",
      metadataVersion: 1
    };
    const order = insertAt(state2.timeline.frameOrder, item.frameId, command.payload.targetIndex);
    const duplicatedCels = state2.cels.filter((itemCel) => itemCel.frameId === source.frameId).map((itemCel) => ({
      ...itemCel,
      id: `${itemCel.celId}:duplicate:${item.frameId}`,
      celId: `${itemCel.celId}:duplicate:${item.frameId}`,
      frameId: item.frameId,
      bindingMode: itemCel.bindingMode === "TILEMAP" ? "TILEMAP" : itemCel.assetId === void 0 ? "EMPTY" : "DUPLICATE_INDEPENDENT",
      recordVersion: 1
    }));
    patch = {
      frames: updateFrameOrder([
        ...state2.frames,
        item
      ], order),
      cels: [
        ...state2.cels,
        ...duplicatedCels
      ],
      timeline: {
        ...state2.timeline,
        frameOrder: order,
        metadataVersion: state2.timeline.metadataVersion + 1
      }
    };
  } else if (command.commandType === "timeline.reorderFrame") {
    const order = moveTo(state2.timeline.frameOrder, command.payload.frameId, command.payload.targetIndex);
    patch = {
      frames: updateFrameOrder(state2.frames, order),
      timeline: {
        ...state2.timeline,
        frameOrder: order,
        metadataVersion: state2.timeline.metadataVersion + 1
      }
    };
  } else if (command.commandType === "timeline.changeFrameDuration") {
    patch = {
      frames: state2.frames.map((item) => item.frameId === command.payload.frameId ? {
        ...item,
        durationMs: command.payload.durationMs,
        metadataVersion: item.metadataVersion + 1
      } : item)
    };
    domains = [
      "TIMELINE_STRUCTURE_DIRTY"
    ];
  } else if (command.commandType === "timeline.createCel") {
    const bindingMode = command.payload.bindingMode ?? (command.payload.rasterAssetId === void 0 ? "EMPTY" : "RASTER");
    const celIdentity = {
      id: command.payload.celId,
      celId: command.payload.celId,
      frameId: command.payload.frameId,
      layerId: command.payload.layerTrackId,
      layerTrackId: command.payload.layerTrackId,
      bindingMode,
      recordVersion: 1,
      lifecycle: bindingMode === "EMPTY" ? "CLEARED" : "ACTIVE"
    };
    const newCel = command.payload.rasterAssetId === void 0 ? celIdentity : {
      ...celIdentity,
      assetId: command.payload.rasterAssetId
    };
    patch = {
      cels: [
        ...state2.cels,
        newCel
      ]
    };
    domains = [
      "TIMELINE_CELL_DIRTY",
      "COMPOSITE_DIRTY"
    ];
  } else if (command.commandType === "timeline.clearCel") {
    patch = {
      cels: state2.cels.map((item) => item.celId === command.payload.celId ? celWithBinding(item, void 0, "EMPTY", "CLEARED") : item)
    };
    domains = [
      "TIMELINE_CELL_DIRTY",
      "COMPOSITE_DIRTY"
    ];
  } else if (command.commandType === "timeline.replaceCelBinding") {
    const target = cel(state2, command.payload.celId);
    if (target === void 0) throw new Error("Validated Cel disappeared.");
    const bindingMode = command.payload.bindingMode ?? (command.payload.rasterAssetId === void 0 ? "EMPTY" : "RASTER");
    patch = {
      cels: state2.cels.map((item) => item.celId === target.celId ? celWithBinding(item, command.payload.rasterAssetId, bindingMode, bindingMode === "EMPTY" ? "CLEARED" : "ACTIVE") : item)
    };
    domains = [
      "TIMELINE_CELL_DIRTY",
      "COMPOSITE_DIRTY"
    ];
  } else {
    const target = cel(state2, command.payload.celId);
    const targetLayer = layer(state2, command.payload.layerTrackId);
    const sourceAsset = state2.assets[state2.activeAssetId];
    if (sourceAsset === void 0) throw new Error("Activation source Raster backing is missing.");
    let activeAssetId = target?.assetId;
    const assetPatch = {};
    let activatedCel;
    if (targetLayer?.kind === "TILEMAP") {
      activeAssetId = state2.activeAssetId;
      activatedCel = target === void 0 ? {
        id: command.payload.celId,
        celId: command.payload.celId,
        layerId: command.payload.layerTrackId,
        layerTrackId: command.payload.layerTrackId,
        frameId: command.payload.frameId,
        bindingMode: "TILEMAP",
        recordVersion: 1,
        lifecycle: "ACTIVE"
      } : celWithBinding(target, void 0, "TILEMAP", "ACTIVE");
    } else if (target === void 0 || target.assetId === void 0) {
      activeAssetId = `${state2.projectId}:raster:cel:${command.payload.celId}`;
      assetPatch[activeAssetId] = {
        id: activeAssetId,
        width: sourceAsset.width,
        height: sourceAsset.height,
        palette: [
          ...sourceAsset.palette
        ],
        raster: IndexedTileRaster.empty(sourceAsset.width, sourceAsset.height, sourceAsset.raster.tileSize),
        revision: 0
      };
      activatedCel = target === void 0 ? {
        id: command.payload.celId,
        celId: command.payload.celId,
        layerId: command.payload.layerTrackId,
        layerTrackId: command.payload.layerTrackId,
        frameId: command.payload.frameId,
        assetId: activeAssetId,
        bindingMode: "RASTER",
        recordVersion: 1,
        lifecycle: "ACTIVE"
      } : celWithBinding(target, activeAssetId, "RASTER", "ACTIVE");
    } else if (target.bindingMode === "DUPLICATE_INDEPENDENT") {
      activeAssetId = `${state2.projectId}:raster:cel:${command.payload.celId}:independent`;
      const independentSource = state2.assets[target.assetId];
      if (independentSource === void 0) throw new Error("Duplicate Cel Raster backing is missing.");
      assetPatch[activeAssetId] = {
        ...independentSource,
        id: activeAssetId,
        palette: [
          ...independentSource.palette
        ],
        raster: independentSource.raster.sharedClone()
      };
      activatedCel = celWithBinding(target, activeAssetId, "RASTER", "ACTIVE");
    } else {
      activeAssetId = target.assetId;
      activatedCel = target;
    }
    const nextCels = target === void 0 ? [
      ...state2.cels,
      activatedCel
    ] : state2.cels.map((item) => item.celId === activatedCel.celId ? activatedCel : item);
    patch = {
      ...Object.keys(assetPatch).length === 0 ? {} : {
        assets: assetPatch
      },
      cels: nextCels,
      activeAssetId,
      activeLayerId: command.payload.layerTrackId,
      activeFrameId: command.payload.frameId,
      activeCelId: activatedCel.celId
    };
    domains = [
      "TIMELINE_CELL_DIRTY",
      "COMPOSITE_DIRTY"
    ];
  }
  const nextState = commitState2(state2, patch, command);
  return {
    ok: true,
    state: nextState,
    result: await resultFor(nextState, command, command.commandType, domains)
  };
}
function createTimelineSession(state2) {
  return {
    activeFrameId: state2.activeFrameId,
    activeLayerTrackId: state2.activeLayerId,
    activeCelId: state2.activeCelId,
    selectedFrameId: state2.activeFrameId,
    scrollTop: 0,
    scrollLeft: 0,
    zoom: 1
  };
}
function setTimelineSessionActiveFrame(state2, session, frameId) {
  if (frame(state2, frameId) === void 0) throw new Error("Session Frame does not exist.");
  return {
    ...session,
    activeFrameId: frameId,
    selectedFrameId: frameId
  };
}
function calculateTimelineWindow(state2, options) {
  const frameCellWidth = options.frameCellWidth ?? 48;
  const layerRowHeight = options.layerRowHeight ?? 38;
  const overscan = options.overscan ?? 2;
  if (![
    options.scrollTop,
    options.scrollLeft,
    options.viewportWidth,
    options.viewportHeight,
    frameCellWidth,
    layerRowHeight,
    overscan
  ].every(Number.isFinite) || options.viewportWidth < 1 || options.viewportHeight < 1 || frameCellWidth < 1 || layerRowHeight < 1 || overscan < 0) throw new Error("Timeline virtual window values are invalid.");
  const firstFrameIndex = Math.max(0, Math.floor(options.scrollLeft / frameCellWidth) - overscan);
  const lastFrameIndex = Math.min(state2.timeline.frameOrder.length - 1, Math.ceil((options.scrollLeft + options.viewportWidth) / frameCellWidth) + overscan);
  const firstLayerIndex = Math.max(0, Math.floor(options.scrollTop / layerRowHeight) - overscan);
  const lastLayerIndex = Math.min(state2.timeline.layerTrackOrder.length - 1, Math.ceil((options.scrollTop + options.viewportHeight) / layerRowHeight) + overscan);
  return {
    frameIds: firstFrameIndex > lastFrameIndex ? [] : state2.timeline.frameOrder.slice(firstFrameIndex, lastFrameIndex + 1),
    layerTrackIds: firstLayerIndex > lastLayerIndex ? [] : state2.timeline.layerTrackOrder.slice(firstLayerIndex, lastLayerIndex + 1),
    firstFrameIndex,
    lastFrameIndex,
    firstLayerIndex,
    lastLayerIndex,
    totalWidth: state2.timeline.frameOrder.length * frameCellWidth,
    totalHeight: state2.timeline.layerTrackOrder.length * layerRowHeight,
    overscan
  };
}
function resolveOnionSkinNeighborhood(state2, currentFrameId, settings) {
  if (frame(state2, currentFrameId) === void 0) throw new Error("Onion Skin current Frame does not exist.");
  if (!settings.enabled) return {
    currentFrameId,
    references: [],
    dirtyDomain: "ONION_SKIN_DIRTY",
    canonicalMutation: false
  };
  const currentIndex = state2.timeline.frameOrder.indexOf(currentFrameId);
  if (currentIndex < 0 || !integer(settings.previousFrameCount) || !integer(settings.nextFrameCount) || settings.previousFrameCount < 0 || settings.nextFrameCount < 0 || !Number.isFinite(settings.opacity) || settings.opacity < 0 || settings.opacity > 1) throw new Error("Onion Skin settings are invalid.");
  const references = [];
  for (let distance = 1; distance <= settings.previousFrameCount; distance += 1) {
    const id = state2.timeline.frameOrder[currentIndex - distance];
    if (id !== void 0) references.push({
      frameId: id,
      role: "PREVIOUS",
      distance,
      opacity: settings.opacity / distance,
      celIds: state2.cels.filter((item) => item.frameId === id && item.lifecycle === "ACTIVE").map((item) => item.celId)
    });
  }
  for (let distance = 1; distance <= settings.nextFrameCount; distance += 1) {
    const id = state2.timeline.frameOrder[currentIndex + distance];
    if (id !== void 0) references.push({
      frameId: id,
      role: "NEXT",
      distance,
      opacity: settings.opacity / distance,
      celIds: state2.cels.filter((item) => item.frameId === id && item.lifecycle === "ACTIVE").map((item) => item.celId)
    });
  }
  return {
    currentFrameId,
    references,
    dirtyDomain: "ONION_SKIN_DIRTY",
    canonicalMutation: false
  };
}
function resolvePlaybackProjection(state2, currentFrameId, elapsedMs) {
  if (frame(state2, currentFrameId) === void 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Playback request is invalid.");
  const totalDuration = state2.frames.reduce((total, item) => total + item.durationMs, 0);
  if (totalDuration < 1) throw new Error("Timeline has no playable duration.");
  const startIndex = state2.timeline.frameOrder.indexOf(currentFrameId);
  if (startIndex < 0) throw new Error("Playback current Frame is not in Timeline order.");
  let remaining = elapsedMs % totalDuration;
  for (let offset = 0; offset < state2.timeline.frameOrder.length; offset += 1) {
    const id = state2.timeline.frameOrder[(startIndex + offset) % state2.timeline.frameOrder.length];
    if (id === void 0) continue;
    const item = frame(state2, id);
    if (item === void 0) continue;
    if (remaining < item.durationMs) return {
      frameId: id,
      elapsedMs,
      requestFrameIds: [
        id
      ],
      canonicalMutation: false
    };
    remaining -= item.durationMs;
  }
  return {
    frameId: currentFrameId,
    elapsedMs,
    requestFrameIds: [
      currentFrameId
    ],
    canonicalMutation: false
  };
}

// src/draw2-basic-tools.ts
var DEFAULT_TOOL_OPTIONS = {
  brushSize: 1,
  brushShape: "square",
  pattern: "solid",
  similarity: 0,
  selectionMode: "similar"
};
var RGB_COLOR_DISTANCE_MAX = Math.sqrt(3 * 255 * 255);
function colorTolerancePercentToDistance(percent) {
  const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  return Math.round(safePercent / 100 * RGB_COLOR_DISTANCE_MAX);
}
function normalizeToolOptions(options = {}) {
  const requestedBrushSize = options.brushSize;
  const requestedSimilarity = options.similarity;
  const requestedSelectionMode = options.selectionMode;
  const brushSize2 = Number.isSafeInteger(requestedBrushSize) ? Math.max(1, Math.min(32, requestedBrushSize)) : DEFAULT_TOOL_OPTIONS.brushSize;
  const similarity2 = Number.isFinite(requestedSimilarity) ? Math.max(0, Math.min(255, requestedSimilarity)) : DEFAULT_TOOL_OPTIONS.similarity;
  const brushShape2 = options.brushShape === "circle" ? "circle" : "square";
  const pattern = options.pattern === "checker" || options.pattern === "dots" || options.pattern === "bayer-2x2" ? options.pattern : "solid";
  const selectionMode = requestedSelectionMode === "exact" || requestedSelectionMode === "magic" || requestedSelectionMode === "opaque" ? requestedSelectionMode : "similar";
  return {
    brushSize: brushSize2,
    brushShape: brushShape2,
    pattern,
    similarity: similarity2,
    selectionMode
  };
}
function clampPoint(point, bounds) {
  return {
    x: Math.max(0, Math.min(bounds.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(bounds.height - 1, Math.round(point.y)))
  };
}
function normalizeBounds(from, to, bounds) {
  const a = clampPoint(from, bounds);
  const b = clampPoint(to, bounds);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(1, Math.abs(a.x - b.x) + 1),
    height: Math.max(1, Math.abs(a.y - b.y) + 1)
  };
}
function snapSelectionBoundsToGrid(from, to, bounds, gridSize = 16) {
  const safeGridSize = Number.isSafeInteger(gridSize) ? Math.max(1, gridSize) : 16;
  const a = clampPoint(from, bounds);
  const b = clampPoint(to, bounds);
  const cellX = Math.min(Math.floor(a.x / safeGridSize), Math.floor(b.x / safeGridSize));
  const cellY = Math.min(Math.floor(a.y / safeGridSize), Math.floor(b.y / safeGridSize));
  const endCellX = Math.max(Math.floor(a.x / safeGridSize), Math.floor(b.x / safeGridSize));
  const endCellY = Math.max(Math.floor(a.y / safeGridSize), Math.floor(b.y / safeGridSize));
  const x = cellX * safeGridSize;
  const y = cellY * safeGridSize;
  const maxX = Math.min(bounds.width, (endCellX + 1) * safeGridSize);
  const maxY = Math.min(bounds.height, (endCellY + 1) * safeGridSize);
  return {
    x,
    y,
    width: Math.max(1, maxX - x),
    height: Math.max(1, maxY - y)
  };
}
function pointKey(point) {
  return `${point.x}:${point.y}`;
}
function sortedUnique(points, bounds) {
  const unique = /* @__PURE__ */ new Map();
  for (const point of points) {
    const clamped = clampPoint(point, bounds);
    unique.set(pointKey(clamped), clamped);
  }
  return [
    ...unique.values()
  ].sort((left, right) => left.y - right.y || left.x - right.x);
}
function patternVisible(x, y, pattern) {
  if (pattern === "checker") return (x + y) % 2 === 0;
  if (pattern === "dots") return x % 2 === 0 && y % 2 === 0;
  if (pattern === "bayer-2x2") return (x & 1) + (y & 1) * 2 !== 3;
  return true;
}
function stamp(center, options, bounds) {
  const size = options.brushSize;
  const start = -Math.floor((size - 1) / 2);
  const end = start + size - 1;
  const centerOffset = (size - 1) / 2;
  const radius = Math.max(0.5, size / 2);
  const points = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = start + column;
      const y = start + row;
      if (options.brushShape === "circle" && (column - centerOffset) ** 2 + (row - centerOffset) ** 2 > radius ** 2) continue;
      if (!patternVisible(center.x + x, center.y + y, options.pattern)) {
        continue;
      }
      points.push({
        x: center.x + x,
        y: center.y + y
      });
    }
  }
  return points.filter((point) => point.x >= 0 && point.y >= 0 && point.x < bounds.width && point.y < bounds.height);
}
function stampBrush(points, options, bounds) {
  const safe = normalizeToolOptions(options);
  const stamped = points.flatMap((point) => stamp(clampPoint(point, bounds), safe, bounds));
  return sortedUnique(stamped, bounds);
}
function rectanglePixels(rect, filled) {
  const points = [];
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (filled || x === rect.x || y === rect.y || x === rect.x + rect.width - 1 || y === rect.y + rect.height - 1) points.push({
        x,
        y
      });
    }
  }
  return points;
}
function ellipsePixels(rect, filled) {
  const points = [];
  const minX = rect.x;
  const maxX = rect.x + rect.width - 1;
  const minY = rect.y;
  const maxY = rect.y + rect.height - 1;
  if (maxX < minX || maxY < minY) return points;
  if (minX === maxX || minY === maxY) {
    if (filled) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          points.push({
            x,
            y
          });
        }
      }
    } else if (minX === maxX) {
      for (let y = minY; y <= maxY; y += 1) points.push({
        x: minX,
        y
      });
    } else {
      for (let x = minX; x <= maxX; x += 1) points.push({
        x,
        y: minY
      });
    }
    return points;
  }
  const fillRanges = filled ? /* @__PURE__ */ new Map() : void 0;
  const record2 = (x, y) => {
    if (x < minX || x > maxX || y < minY || y > maxY) return;
    if (fillRanges !== void 0) {
      const existing = fillRanges.get(y);
      if (existing === void 0) fillRanges.set(y, {
        min: x,
        max: x
      });
      else {
        existing.min = Math.min(existing.min, x);
        existing.max = Math.max(existing.max, x);
      }
      return;
    }
    points.push({
      x,
      y
    });
  };
  let x0 = minX;
  let x1 = maxX;
  let y0 = minY;
  let y1 = maxY;
  let a = Math.abs(x1 - x0);
  const b = Math.abs(y1 - y0);
  const b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  y0 += Math.floor((b + 1) / 2);
  y1 = y0 - b1;
  a *= 8 * a;
  const b8 = 8 * b * b;
  do {
    record2(x1, y0);
    record2(x0, y0);
    record2(x0, y1);
    record2(x1, y1);
    const e2 = 2 * err;
    if (e2 <= dy) {
      y0 += 1;
      y1 -= 1;
      dy += a;
      err += dy;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0 += 1;
      x1 -= 1;
      dx += b8;
      err += dx;
    }
  } while (x0 <= x1);
  while (y0 - y1 < b) {
    record2(x0 - 1, y0);
    record2(x1 + 1, y0);
    record2(x0 - 1, y1);
    record2(x1 + 1, y1);
    y0 += 1;
    y1 -= 1;
  }
  if (fillRanges !== void 0) {
    for (const [y, range] of fillRanges) {
      for (let x = range.min; x <= range.max; x += 1) points.push({
        x,
        y
      });
    }
  }
  return points;
}
function shapePixels(tool, from, to, bounds) {
  const rect = normalizeBounds(from, to, bounds);
  if (tool === "line") {
    return sortedUnique(interpolatePixelLine(clampPoint(from, bounds), clampPoint(to, bounds)), bounds);
  }
  if (tool === "rect") {
    return sortedUnique(rectanglePixels(rect, false), bounds);
  }
  if (tool === "rect-fill") {
    return sortedUnique(rectanglePixels(rect, true), bounds);
  }
  if (tool === "ellipse") {
    return sortedUnique(ellipsePixels(rect, false), bounds);
  }
  if (tool === "ellipse-fill") {
    return sortedUnique(ellipsePixels(rect, true), bounds);
  }
  if (tool === "circle" || tool === "circle-fill") {
    const side = Math.min(rect.width, rect.height);
    const circleRect = {
      x: rect.x + Math.floor((rect.width - side) / 2),
      y: rect.y + Math.floor((rect.height - side) / 2),
      width: side,
      height: side
    };
    return sortedUnique(ellipsePixels(circleRect, tool === "circle-fill"), bounds);
  }
  return [];
}
function createWriteSet(tool, from, to, colorIndex, options, bounds) {
  const safe = normalizeToolOptions(options);
  const base = tool === "pen" || tool === "eraser" ? interpolatePixelLine(clampPoint(from, bounds), clampPoint(to, bounds)) : shapePixels(tool, from, to, bounds);
  return stampBrush(base, safe, bounds).map((point) => ({
    ...point,
    colorIndex: tool === "eraser" ? 0 : colorIndex
  }));
}
function createToolPreviewWriteSet(tool, point, colorIndex, options, bounds) {
  if (tool === "pen" || tool === "eraser") {
    return createPathWriteSet(tool, [
      point
    ], colorIndex, options, bounds);
  }
  if (tool === "pixel-pen") {
    return createPathWriteSet("pen", [
      point
    ], colorIndex, {
      ...options,
      brushSize: 1,
      brushShape: "square",
      pattern: "solid"
    }, bounds);
  }
  if (tool === "fill" || tool === "eyedropper" || tool === "pan" || tool.startsWith("select-")) return [];
  return createWriteSet(tool, point, point, colorIndex, options, bounds);
}
function createPathWriteSet(tool, points, colorIndex, options, bounds) {
  if (points.length === 0) return [];
  const path = interpolatePixelPath(points.map((point) => clampPoint(point, bounds)));
  return stampBrush(path, normalizeToolOptions(options), bounds).map((point) => ({
    ...point,
    colorIndex: tool === "eraser" ? 0 : colorIndex
  }));
}
function createIndexedGradientWriteSet(reader, region, from, to, startColorIndex, endColorIndex, palette) {
  if (region.length === 0 || palette.length === 0) return [];
  const safeStartIndex = Math.max(0, Math.min(palette.length - 1, Math.round(startColorIndex)));
  const safeEndIndex = Math.max(0, Math.min(palette.length - 1, Math.round(endColorIndex)));
  const startColor = palette[safeStartIndex] ?? 0;
  const endColor = palette[safeEndIndex] ?? 0;
  const start = colorChannels(startColor);
  const end = colorChannels(endColor);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const writes = [];
  for (const point of region) {
    const progress = lengthSquared === 0 ? 1 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
    const targetIndex = progress <= 0 ? safeStartIndex : progress >= 1 ? safeEndIndex : nearestPaletteIndex(interpolateArgb(start, end, progress), palette);
    if (reader.getPixel(point.x, point.y) !== targetIndex) {
      writes.push({
        ...point,
        colorIndex: targetIndex
      });
    }
  }
  return writes;
}
function interpolateArgb(start, end, progress) {
  const alpha = Math.round((start[0] ?? 0) + ((end[0] ?? 0) - (start[0] ?? 0)) * progress);
  const red = Math.round((start[1] ?? 0) + ((end[1] ?? 0) - (start[1] ?? 0)) * progress);
  const green = Math.round((start[2] ?? 0) + ((end[2] ?? 0) - (start[2] ?? 0)) * progress);
  const blue = Math.round((start[3] ?? 0) + ((end[3] ?? 0) - (start[3] ?? 0)) * progress);
  return ((alpha & 255) << 24 | (red & 255) << 16 | (green & 255) << 8 | blue & 255) >>> 0;
}
function nearestPaletteIndex(color, palette) {
  const target = colorChannels(color);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = colorChannels(palette[index] ?? 0);
    const alphaDistance = (target[0] ?? 0) - (candidate[0] ?? 0);
    const redDistance = (target[1] ?? 0) - (candidate[1] ?? 0);
    const greenDistance = (target[2] ?? 0) - (candidate[2] ?? 0);
    const blueDistance = (target[3] ?? 0) - (candidate[3] ?? 0);
    const distance = alphaDistance * alphaDistance + redDistance * redDistance + greenDistance * greenDistance + blueDistance * blueDistance;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}
function decodeArgb(color) {
  return {
    alpha: color >>> 24 & 255,
    red: color >>> 16 & 255,
    green: color >>> 8 & 255,
    blue: color & 255
  };
}
function rgbDistance(a, b) {
  const ar = (a[1] ?? 0) - (b[1] ?? 0);
  const ag = (a[2] ?? 0) - (b[2] ?? 0);
  const ab = (a[3] ?? 0) - (b[3] ?? 0);
  return Math.sqrt(ar * ar + ag * ag + ab * ab);
}
function selectByPaletteColor(reader, targetColorIndex, mode, palette, threshold = 0) {
  const target = palette[targetColorIndex] ?? 0;
  const pixels = [];
  for (let y = 0; y < reader.height; y += 1) {
    for (let x = 0; x < reader.width; x += 1) {
      const currentIndex = reader.getPixel(x, y);
      if (mode === "exact" ? currentIndex === targetColorIndex : rgbDistance(colorChannels(palette[currentIndex] ?? 0), colorChannels(target)) <= threshold) pixels.push({
        x,
        y
      });
    }
  }
  const bounds = boundsForPixels(pixels);
  return bounds === void 0 ? {
    pixels
  } : {
    pixels,
    bounds
  };
}
function selectByOpaque(reader, palette) {
  const pixels = [];
  for (let y = 0; y < reader.height; y += 1) {
    for (let x = 0; x < reader.width; x += 1) {
      const color = palette[reader.getPixel(x, y)] ?? 0;
      if ((color >>> 24 & 255) > 0) pixels.push({
        x,
        y
      });
    }
  }
  const bounds = boundsForPixels(pixels);
  return bounds === void 0 ? {
    pixels
  } : {
    pixels,
    bounds
  };
}
function selectByContiguousColor(reader, seed, mode, palette, threshold = 0, maxPixels = Math.min(1048576, reader.width * reader.height)) {
  const start = clampPoint(seed, reader);
  const targetIndex = reader.getPixel(start.x, start.y);
  const target = palette[targetIndex] ?? 0;
  const queue = [
    start
  ];
  const visited = /* @__PURE__ */ new Set();
  const pixels = [];
  const matches = (point) => {
    const currentIndex = reader.getPixel(point.x, point.y);
    return mode === "exact" ? currentIndex === targetIndex : rgbDistance(colorChannels(palette[currentIndex] ?? 0), colorChannels(target)) <= threshold;
  };
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor];
    if (point === void 0) continue;
    const key = point.y * reader.width + point.x;
    if (visited.has(key)) continue;
    visited.add(key);
    if (!matches(point)) continue;
    if (pixels.length >= maxPixels) return {
      pixels: []
    };
    pixels.push(point);
    if (point.x > 0) queue.push({
      x: point.x - 1,
      y: point.y
    });
    if (point.x + 1 < reader.width) queue.push({
      x: point.x + 1,
      y: point.y
    });
    if (point.y > 0) queue.push({
      x: point.x,
      y: point.y - 1
    });
    if (point.y + 1 < reader.height) queue.push({
      x: point.x,
      y: point.y + 1
    });
  }
  const bounds = boundsForPixels(pixels);
  return bounds === void 0 ? {
    pixels
  } : {
    pixels,
    bounds
  };
}
function selectByEllipse(reader, from, to) {
  const bounds = normalizeBounds(from, to, reader);
  const centerX = bounds.x + (bounds.width - 1) / 2;
  const centerY = bounds.y + (bounds.height - 1) / 2;
  const radiusX = Math.max(0.5, bounds.width / 2);
  const radiusY = Math.max(0.5, bounds.height / 2);
  const pixels = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const normalizedX = (x - centerX) / radiusX;
      const normalizedY = (y - centerY) / radiusY;
      if (normalizedX * normalizedX + normalizedY * normalizedY <= 1.000001) {
        pixels.push({
          x,
          y
        });
      }
    }
  }
  const selectedBounds = boundsForPixels(pixels);
  return selectedBounds === void 0 ? {
    pixels
  } : {
    pixels,
    bounds: selectedBounds
  };
}
function colorChannels(color) {
  return [
    color >>> 24 & 255,
    color >>> 16 & 255,
    color >>> 8 & 255,
    color & 255
  ];
}
function selectByLasso(reader, vertices) {
  if (vertices.length < 3) return {
    pixels: []
  };
  const pixels = [];
  const minX = Math.max(0, Math.floor(Math.min(...vertices.map((point) => point.x))));
  const maxX = Math.min(reader.width - 1, Math.ceil(Math.max(...vertices.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...vertices.map((point) => point.y))));
  const maxY = Math.min(reader.height - 1, Math.ceil(Math.max(...vertices.map((point) => point.y))));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon({
        x,
        y
      }, vertices)) pixels.push({
        x,
        y
      });
    }
  }
  const bounds = boundsForPixels(pixels);
  return bounds === void 0 ? {
    pixels
  } : {
    pixels,
    bounds
  };
}
function pointInPolygon(point, vertices) {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
    const current = vertices[index];
    const prior = vertices[previous];
    if (current === void 0 || prior === void 0) continue;
    const intersects = current.y > point.y !== prior.y > point.y && point.x < (prior.x - current.x) * (point.y - current.y) / (prior.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
function boundsForPixels(pixels) {
  if (pixels.length === 0) return void 0;
  const minX = Math.min(...pixels.map((point) => point.x));
  const minY = Math.min(...pixels.map((point) => point.y));
  const maxX = Math.max(...pixels.map((point) => point.x));
  const maxY = Math.max(...pixels.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

// src/draw2-special-tools.ts
function uniquePoints(points) {
  const unique = /* @__PURE__ */ new Map();
  for (const point of points) unique.set(`${point.x}:${point.y}`, point);
  return [
    ...unique.values()
  ];
}
function pointInPolygon2(x, y, vertices) {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const current = vertices[index];
    const prior = vertices[previous];
    if (current === void 0 || prior === void 0) continue;
    const crosses = current.y > y !== prior.y > y && x < (prior.x - current.x) * (y - current.y) / (prior.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}
function polygonSelectionPoints(reader, vertices) {
  const normalized = uniquePoints(vertices);
  if (normalized.length < 3) return [];
  const minX = Math.max(0, Math.floor(Math.min(...normalized.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...normalized.map((point) => point.y))));
  const maxX = Math.min(reader.width - 1, Math.ceil(Math.max(...normalized.map((point) => point.x))));
  const maxY = Math.min(reader.height - 1, Math.ceil(Math.max(...normalized.map((point) => point.y))));
  const pixels = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon2(x + 0.5, y + 0.5, normalized)) pixels.push({
        x,
        y
      });
    }
  }
  return pixels;
}
function tileStampWrites(reader, source, origin, scale = 1) {
  const safeScale = Math.max(1, Math.min(16, Math.round(scale)));
  const writes = [];
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const colorIndex = source.pixels[sourceY * source.width + sourceX] ?? 0;
      if (colorIndex === 0) continue;
      for (let dy = 0; dy < safeScale; dy += 1) {
        for (let dx = 0; dx < safeScale; dx += 1) {
          const x = origin.x + sourceX * safeScale + dx;
          const y = origin.y + sourceY * safeScale + dy;
          if (x >= 0 && y >= 0 && x < reader.width && y < reader.height) {
            writes.push({
              x,
              y,
              colorIndex
            });
          }
        }
      }
    }
  }
  return writes;
}

// src/fp-006/contracts.ts
function editorInteractionStateFor(tool, owner) {
  if (owner === "panel_scroll") return "PANEL";
  if (owner === "timeline") return "TIMELINE";
  if (owner === "pinch") return "ZOOMING";
  if (owner === "pan") return "PANNING";
  if (owner === "idle") return "IDLE";
  if (tool === "pan") return "PANNING";
  if (tool === "eyedropper") return "PICKING";
  if (tool === "select-rect" || tool === "select-ellipse" || tool === "select-lasso" || tool === "select-color" || tool === "select-polygon" || tool === "move") return "SELECTING";
  if (tool === "line" || tool === "rect" || tool === "rect-fill" || tool === "ellipse" || tool === "ellipse-fill" || tool === "circle" || tool === "circle-fill") return "SHAPE_PREVIEW";
  return "DRAWING";
}

// src/fp-006/input-state.ts
function normalizedPressure(value) {
  return Number.isFinite(value) && value >= 0 ? Math.min(1, value) : 0.5;
}
function pointFrom(sample) {
  return {
    x: sample.x,
    y: sample.y,
    pressure: normalizedPressure(sample.pressure),
    timeMs: sample.timeMs
  };
}
var StrokeInputController = class {
  #tool;
  #nextStrokeId;
  #pointers = /* @__PURE__ */ new Map();
  #owner = "idle";
  #stroke;
  #committedStrokeCount = 0;
  #cancelledStrokeCount = 0;
  #captureReleaseCount = 0;
  constructor(options = {}) {
    this.#tool = options.tool ?? "pen";
    let sequence = 0;
    this.#nextStrokeId = options.nextStrokeId ?? (() => `fp006-stroke-${++sequence}`);
  }
  get owner() {
    return this.#owner;
  }
  get interactionState() {
    return editorInteractionStateFor(this.#tool, this.#owner);
  }
  /** Cancel the active transient input without creating a commit. */
  cancel(reason = "EXPLICIT_CANCEL") {
    const events = this.#stroke === void 0 ? [] : this.#cancelStroke(reason);
    this.#pointers.clear();
    this.#owner = "idle";
    return events;
  }
  handle(sample) {
    const events = [];
    if (!Number.isSafeInteger(sample.pointerId) || sample.pointerId < 0) {
      return [
        {
          kind: "pointer_ignored",
          owner: this.#owner,
          reason: "INVALID_POINTER_ID"
        }
      ];
    }
    if (sample.phase === "down") return this.#down(sample);
    if (sample.phase === "move") return this.#move(sample);
    if (sample.phase === "up") return this.#up(sample);
    if (sample.phase === "cancel" || sample.phase === "lost_capture" || sample.phase === "browser_interrupt") {
      if (this.#stroke?.pointerId === sample.pointerId) {
        const reason = sample.phase === "lost_capture" ? "LOST_POINTER_CAPTURE" : sample.phase === "browser_interrupt" ? "BROWSER_INTERRUPTION" : "POINTER_CANCELLED";
        events.push(...this.#cancelStroke(reason));
      } else if (this.#owner === "pinch" || this.#owner === "pan") {
        this.#pointers.delete(sample.pointerId);
        if (this.#pointers.size === 0) {
          this.#owner = "idle";
          events.push({
            kind: "gesture_ended",
            owner: "idle",
            pointerId: sample.pointerId
          });
        }
      }
      this.#pointers.delete(sample.pointerId);
      return events;
    }
    return events;
  }
  snapshot() {
    return {
      owner: this.#owner,
      interactionState: this.interactionState,
      activePointerIds: [
        ...this.#pointers.keys()
      ].sort((a, b) => a - b),
      ...this.#stroke === void 0 ? {} : {
        activeStrokeId: this.#stroke.id
      },
      activeStrokePointCount: this.#stroke?.points.length ?? 0,
      committedStrokeCount: this.#committedStrokeCount,
      cancelledStrokeCount: this.#cancelledStrokeCount,
      captureReleaseCount: this.#captureReleaseCount
    };
  }
  recover(checkpoint) {
    if (checkpoint.version !== 1 || checkpoint.state === "COMMITTED" || checkpoint.state === "CANCELLED") return "NOOP";
    return checkpoint.pointCount > 0 ? "DISCARD" : "NOOP";
  }
  #down(sample) {
    this.#pointers.set(sample.pointerId, sample);
    if (this.#owner === "draw" && this.#stroke !== void 0 && sample.pointerId !== this.#stroke.pointerId && sample.pointerType === "touch") {
      const cancelled = this.#cancelStroke("SECOND_POINTER_SWITCH_TO_PINCH");
      this.#owner = "pinch";
      return [
        ...cancelled,
        {
          kind: "gesture_started",
          owner: "pinch",
          pointerId: sample.pointerId
        }
      ];
    }
    if (sample.target === "panel") {
      this.#owner = "panel_scroll";
      return [
        {
          kind: "gesture_started",
          owner: "panel_scroll",
          pointerId: sample.pointerId
        }
      ];
    }
    if (sample.target === "timeline") {
      this.#owner = "timeline";
      return [
        {
          kind: "gesture_started",
          owner: "timeline",
          pointerId: sample.pointerId
        }
      ];
    }
    if (sample.target !== "canvas" && sample.target !== "viewport") {
      return [
        {
          kind: "pointer_ignored",
          owner: this.#owner,
          pointerId: sample.pointerId,
          reason: "TARGET_NOT_OWNED"
        }
      ];
    }
    if (sample.pointerType === "touch" && !sample.isPrimary) {
      this.#owner = "pinch";
      return [
        {
          kind: "gesture_started",
          owner: "pinch",
          pointerId: sample.pointerId
        }
      ];
    }
    if (this.#owner !== "idle") {
      return [
        {
          kind: "pointer_ignored",
          owner: this.#owner,
          pointerId: sample.pointerId,
          reason: "OWNER_ALREADY_ASSIGNED"
        }
      ];
    }
    if (sample.button !== 0 && sample.pointerType !== "touch") {
      return [
        {
          kind: "pointer_ignored",
          owner: "idle",
          pointerId: sample.pointerId,
          reason: "NON_PRIMARY_BUTTON"
        }
      ];
    }
    this.#owner = "draw";
    this.#stroke = {
      id: this.#nextStrokeId(),
      pointerId: sample.pointerId,
      points: [
        pointFrom(sample)
      ],
      startedAtMs: sample.timeMs
    };
    return [
      {
        kind: "stroke_started",
        owner: "draw",
        pointerId: sample.pointerId,
        reason: this.#tool
      }
    ];
  }
  #move(sample) {
    if (this.#owner === "draw" && this.#stroke?.pointerId === sample.pointerId) {
      if ((sample.buttons & 1) === 0) {
        return this.#cancelStroke("BUTTON_RELEASE_WITHOUT_POINTERUP");
      }
      const point = pointFrom(sample);
      const previous = this.#stroke.points[this.#stroke.points.length - 1];
      if (previous?.x === point.x && previous.y === point.y && previous.pressure === point.pressure) return [];
      this.#stroke.points.push(point);
      this.#pointers.set(sample.pointerId, sample);
      return [
        {
          kind: "stroke_sampled",
          owner: "draw",
          pointerId: sample.pointerId
        }
      ];
    }
    if (this.#owner === "pinch" || this.#owner === "pan" || this.#owner === "panel_scroll" || this.#owner === "timeline") {
      this.#pointers.set(sample.pointerId, sample);
      return [
        {
          kind: "gesture_changed",
          owner: this.#owner,
          pointerId: sample.pointerId
        }
      ];
    }
    return [];
  }
  #up(sample) {
    if (this.#owner === "draw" && this.#stroke?.pointerId === sample.pointerId) {
      const point = pointFrom(sample);
      const previous = this.#stroke.points[this.#stroke.points.length - 1];
      if (previous?.x !== point.x || previous.y !== point.y || previous.pressure !== point.pressure) this.#stroke.points.push(point);
      const stroke = {
        strokeId: this.#stroke.id,
        pointerId: sample.pointerId,
        tool: this.#tool,
        points: [
          ...this.#stroke.points
        ],
        startedAtMs: this.#stroke.startedAtMs,
        endedAtMs: sample.timeMs
      };
      this.#stroke = void 0;
      this.#pointers.delete(sample.pointerId);
      this.#owner = "idle";
      this.#committedStrokeCount += 1;
      this.#captureReleaseCount += 1;
      return [
        {
          kind: "stroke_committed",
          owner: "draw",
          pointerId: sample.pointerId,
          stroke
        }
      ];
    }
    this.#pointers.delete(sample.pointerId);
    if (this.#pointers.size === 0) {
      const owner = this.#owner;
      this.#owner = "idle";
      return owner === "idle" ? [] : [
        {
          kind: "gesture_ended",
          owner: "idle",
          pointerId: sample.pointerId
        }
      ];
    }
    if (this.#owner === "pinch") {
      this.#owner = "pan";
      return [
        {
          kind: "gesture_changed",
          owner: "pan",
          pointerId: sample.pointerId,
          reason: "PINCH_TO_PAN"
        }
      ];
    }
    return [];
  }
  #cancelStroke(reason) {
    const pointerId = this.#stroke?.pointerId;
    this.#stroke = void 0;
    this.#cancelledStrokeCount += 1;
    this.#owner = this.#pointers.size > 1 ? "pinch" : "idle";
    this.#captureReleaseCount += 1;
    return [
      {
        kind: "stroke_cancelled",
        owner: this.#owner,
        ...pointerId === void 0 ? {} : {
          pointerId
        },
        reason
      }
    ];
  }
};

// src/draw2-interaction.ts
var SHAPE_TOOLS = [
  "line",
  "rect",
  "rect-fill",
  "ellipse",
  "ellipse-fill",
  "circle",
  "circle-fill"
];
function tracePolicyForTool(tool) {
  if (tool === "pen" || tool === "eraser" || tool === "pixel-pen" || tool === "select-polygon") return "ACCUMULATE";
  if (SHAPE_TOOLS.includes(tool)) return "LAST";
  if (tool === "eyedropper" || tool === "fill" || tool === "pan" || tool === "tile-stamp") {
    return "IMMEDIATE";
  }
  return tool === "select-lasso" ? "ACCUMULATE" : "LAST";
}
var SerializedCommitIngress = class {
  #tail = Promise.resolve();
  enqueue(commit, task, onError) {
    const run = async () => {
      try {
        await task(commit);
      } catch (error2) {
        if (onError !== void 0) await onError(error2, commit);
      }
    };
    this.#tail = this.#tail.then(run, run);
  }
  flush() {
    return this.#tail;
  }
};
var ToolSessionLifecycleError = class extends Error {
  code = "TOOL_SESSION_LIFECYCLE_REJECTED";
  constructor(message) {
    super(message);
    this.name = "ToolSessionLifecycleError";
  }
};
function pointFromSample(sample) {
  return {
    x: sample.x,
    y: sample.y
  };
}
function samePoint(left, right) {
  return left?.x === right.x && left.y === right.y;
}
var ToolSession = class {
  #options;
  #tracePolicy;
  #points = [];
  #lifecycle = "NEW";
  constructor(options) {
    this.#options = {
      ...options,
      ...options.toolOptions === void 0 ? {} : {
        toolOptions: {
          ...options.toolOptions
        }
      }
    };
    this.#tracePolicy = tracePolicyForTool(options.tool);
  }
  get lifecycle() {
    return this.#lifecycle;
  }
  get sessionId() {
    return this.#options.sessionId;
  }
  get pointerId() {
    return this.#options.pointerId;
  }
  snapshot() {
    return {
      sessionId: this.#options.sessionId,
      tool: this.#options.tool,
      tracePolicy: this.#tracePolicy,
      lifecycle: this.#lifecycle,
      ...this.#options.pointerId === void 0 ? {} : {
        pointerId: this.#options.pointerId
      },
      points: [
        ...this.#points
      ],
      previewWrites: this.#previewWrites()
    };
  }
  begin(point) {
    this.#require("NEW", "begin");
    this.#points.push(point);
    this.#lifecycle = "ACTIVE";
    return this.snapshot();
  }
  update(point) {
    this.#require("ACTIVE", "update");
    if (!samePoint(this.#points[this.#points.length - 1], point)) {
      this.#points.push(point);
    }
    return this.snapshot();
  }
  commit() {
    this.#require("ACTIVE", "commit");
    const first = this.#points[0];
    if (first === void 0) {
      throw new ToolSessionLifecycleError("Cannot commit an empty ToolSession.");
    }
    const points = [
      ...this.#points
    ];
    this.#lifecycle = "COMMITTED";
    if (this.#tracePolicy === "IMMEDIATE") {
      return {
        kind: "immediate",
        sessionId: this.#options.sessionId,
        tool: this.#options.tool,
        tracePolicy: "IMMEDIATE",
        sourceOperationType: `tool.${this.#options.tool}`,
        colorIndex: this.#options.colorIndex,
        toolOptions: {
          ...this.#options.toolOptions ?? {}
        },
        point: points[points.length - 1] ?? first,
        points
      };
    }
    return {
      kind: "write-set",
      sessionId: this.#options.sessionId,
      tool: this.#options.tool,
      tracePolicy: this.#tracePolicy,
      sourceOperationType: `tool.${this.#options.tool}`,
      colorIndex: this.#options.colorIndex,
      toolOptions: {
        ...this.#options.toolOptions ?? {}
      },
      points,
      writes: this.#writeSet()
    };
  }
  cancel(reason) {
    this.#require("ACTIVE", "cancel");
    this.#points.length = 0;
    this.#lifecycle = "CANCELLED";
    return {
      sessionId: this.#options.sessionId,
      lifecycle: "CANCELLED",
      reason
    };
  }
  #require(expected, action) {
    if (this.#lifecycle !== expected) {
      throw new ToolSessionLifecycleError(`${action} rejected for ${this.#lifecycle} ToolSession; expected ${expected}.`);
    }
  }
  #previewWrites() {
    if (this.#lifecycle !== "ACTIVE" || this.#tracePolicy === "IMMEDIATE") {
      return [];
    }
    return this.#writeSet();
  }
  #writeSet() {
    const first = this.#points[0];
    const last = this.#points[this.#points.length - 1] ?? first;
    if (first === void 0 || last === void 0) return [];
    if (this.#tracePolicy === "ACCUMULATE") {
      if (this.#options.tool !== "pen" && this.#options.tool !== "eraser" && this.#options.tool !== "pixel-pen") {
        return [];
      }
      return createPathWriteSet(this.#options.tool === "pixel-pen" ? "pen" : this.#options.tool, this.#points, this.#options.colorIndex, this.#options.tool === "pixel-pen" ? {
        ...this.#options.toolOptions ?? {},
        brushSize: 1,
        brushShape: "square",
        pattern: "solid"
      } : this.#options.toolOptions ?? {}, this.#options.bounds);
    }
    return createWriteSet(this.#options.tool, first, last, this.#options.colorIndex, this.#options.toolOptions ?? {}, this.#options.bounds);
  }
};
var Draw2InteractionKernel = class {
  #options;
  #input;
  #commitIngress;
  #session;
  constructor(options) {
    this.#options = options;
    this.#commitIngress = options.commitIngress ?? new SerializedCommitIngress();
    let sequence = 0;
    this.#input = new StrokeInputController({
      tool: options.tool,
      nextStrokeId: options.nextSessionId ?? (() => `${options.tool}-session-${++sequence}`)
    });
  }
  get input() {
    return this.#input;
  }
  get activePointerId() {
    return this.#session?.pointerId;
  }
  get session() {
    return this.#session?.snapshot();
  }
  flushCommits() {
    return this.#commitIngress.flush();
  }
  snapshot() {
    const input = this.#input.snapshot();
    return {
      editorState: input.interactionState,
      input,
      ...this.#session === void 0 ? {} : {
        session: this.#session.snapshot()
      }
    };
  }
  handle(sample) {
    const events = this.#input.handle(sample);
    for (const event of events) {
      if (event.kind === "stroke_started") {
        this.#begin(sample);
      } else if (event.kind === "stroke_sampled") {
        this.#update(sample);
      } else if (event.kind === "stroke_committed") {
        this.#update(sample);
        this.#commit();
      } else if (event.kind === "stroke_cancelled") {
        this.#cancelSession(event.reason ?? "INPUT_CANCELLED");
      }
    }
    return events;
  }
  /** Esc/blur/visibilitychange adapter entry point. */
  cancel(reason = "EXPLICIT_CANCEL") {
    return this.#processInputEvents(this.#input.cancel(reason));
  }
  #processInputEvents(events) {
    for (const event of events) {
      if (event.kind === "stroke_cancelled") {
        this.#cancelSession(event.reason ?? "INPUT_CANCELLED");
      }
    }
    return events;
  }
  #begin(sample) {
    if (this.#session !== void 0) return;
    this.#session = new ToolSession({
      sessionId: sample.pointerId === void 0 ? `${this.#options.tool}-session` : this.#input.snapshot().activeStrokeId ?? `${this.#options.tool}-session`,
      tool: this.#options.tool,
      bounds: this.#options.bounds,
      colorIndex: this.#options.colorIndex,
      ...this.#options.toolOptions === void 0 ? {} : {
        toolOptions: this.#options.toolOptions
      },
      pointerId: sample.pointerId
    });
    this.#session.begin(pointFromSample(sample));
    this.#options.onPreview?.(this.#session.snapshot());
  }
  #update(sample) {
    if (this.#session?.lifecycle !== "ACTIVE") return;
    this.#session.update(pointFromSample(sample));
    this.#options.onPreview?.(this.#session.snapshot());
  }
  #commit() {
    const session = this.#session;
    if (session === void 0) return;
    const commit = session.commit();
    this.#session = void 0;
    this.#options.onPreview?.(void 0);
    this.#commitIngress.enqueue(commit, this.#options.onCommit, this.#options.onCommitError);
  }
  #cancelSession(reason) {
    const session = this.#session;
    if (session === void 0) return;
    session.cancel(reason);
    this.#session = void 0;
    this.#options.onPreview?.(void 0);
  }
};

// src/draw2-creator-workspace.ts
function isAssetSourceKind(value) {
  return [
    "LAYER_GROUP",
    "SELECTED_LAYERS",
    "VISIBLE_COMPOSITE",
    "ANIMATION_RANGE"
  ].includes(value);
}
function isCreatorAssetKind(value) {
  return [
    "CHARACTER",
    "OBJECT",
    "TILE",
    "BACKGROUND",
    "EFFECT"
  ].includes(value);
}
function isAssetAnimationName(value) {
  return value.trim().length > 0 && value.length <= 128;
}
function isAssetPivot(value) {
  return [
    "CENTER",
    "FEET",
    "CUSTOM"
  ].includes(value);
}
function normalizeReferences(values) {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))
  ].sort();
}
function normalizeOrderedReferences(values) {
  const seen = /* @__PURE__ */ new Set();
  const normalized = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
function normalizeAnimationFrameReferences(values) {
  if (values === void 0) return void 0;
  return values.map((frame2) => ({
    sourceFrameId: frame2.sourceFrameId.trim(),
    layerIds: normalizeReferences(frame2.layerIds),
    rect: {
      x: Math.round(frame2.rect.x),
      y: Math.round(frame2.rect.y),
      width: Math.round(frame2.rect.width),
      height: Math.round(frame2.rect.height)
    },
    ...frame2.durationMs === void 0 ? {} : {
      durationMs: Math.round(frame2.durationMs)
    },
    ...frame2.flipX === void 0 ? {} : {
      flipX: frame2.flipX
    },
    ...frame2.flipY === void 0 ? {} : {
      flipY: frame2.flipY
    }
  }));
}
function normalizeMetadata(metadata, assetKind) {
  return {
    name: (metadata?.name ?? `${assetKind.toLowerCase()}-draft`).trim(),
    description: (metadata?.description ?? "").trim(),
    tags: normalizeReferences(metadata?.tags)
  };
}
function normalizeLayerSelection(input, sourceLayerIds) {
  const selection2 = input.layerSelection;
  if (selection2?.kind === "CURRENT_LAYER") return {
    kind: "CURRENT_LAYER",
    layerId: selection2.layerId.trim()
  };
  if (selection2?.kind === "SELECTED_LAYERS") return {
    kind: "SELECTED_LAYERS",
    layerIds: normalizeReferences(selection2.layerIds)
  };
  if (selection2?.kind === "LAYER_GROUP") return {
    kind: "LAYER_GROUP",
    groupId: selection2.groupId.trim()
  };
  if (selection2?.kind === "VISIBLE_LAYERS") return {
    kind: "VISIBLE_LAYERS"
  };
  if (input.sourceKind === "LAYER_GROUP" && sourceLayerIds[0] !== void 0) {
    return {
      kind: "LAYER_GROUP",
      groupId: sourceLayerIds[0]
    };
  }
  if (input.sourceKind === "VISIBLE_COMPOSITE") return {
    kind: "VISIBLE_LAYERS"
  };
  return {
    kind: "SELECTED_LAYERS",
    layerIds: sourceLayerIds
  };
}
function normalizeFrameSelection(selection2) {
  if (selection2 === void 0) return void 0;
  if (selection2.kind === "CURRENT_FRAME") return {
    kind: "CURRENT_FRAME",
    frameId: selection2.frameId.trim()
  };
  if (selection2.kind === "RANGE") return {
    kind: "RANGE",
    startFrameId: selection2.startFrameId.trim(),
    endFrameId: selection2.endFrameId.trim()
  };
  if (selection2.kind === "TAG") return {
    kind: "TAG",
    tagId: selection2.tagId.trim()
  };
  return {
    kind: "EXPLICIT",
    frameIds: normalizeReferences(selection2.frameIds)
  };
}
function normalizeAnimationMapping(mapping) {
  return mapping.map((clip) => {
    const sourceFrames = normalizeAnimationFrameReferences(clip.sourceFrames);
    const frameIds = sourceFrames === void 0 ? normalizeOrderedReferences(clip.frameIds) : clip.frameIds.map((frameId) => frameId.trim()).filter((frameId) => frameId.length > 0);
    return {
      name: clip.name,
      ...clip.customName === void 0 ? {} : {
        customName: clip.customName.trim()
      },
      ...clip.motionName === void 0 ? {} : {
        motionName: clip.motionName.trim()
      },
      ...clip.direction === void 0 ? {} : {
        direction: clip.direction.trim()
      },
      frameIds,
      loopMode: clip.loopMode,
      ...clip.fps === void 0 ? {} : {
        fps: clip.fps
      },
      ...clip.sourceReference === void 0 ? {} : {
        sourceReference: clip.sourceReference.trim()
      },
      ...clip.flipX === void 0 ? {} : {
        flipX: clip.flipX
      },
      ...clip.flipY === void 0 ? {} : {
        flipY: clip.flipY
      },
      ...sourceFrames === void 0 ? {} : {
        sourceFrames
      },
      ...clip.frameDurationsMs === void 0 ? {} : {
        frameDurationsMs: clip.frameDurationsMs.map((duration) => Math.round(duration))
      }
    };
  });
}
var LEGACY_DIRECTION_SUFFIXES = [
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "UP_LEFT",
  "UP_RIGHT",
  "DOWN_LEFT",
  "DOWN_RIGHT"
];
function assetAnimationMotionName(clip) {
  const explicit = clip.motionName?.trim();
  if (explicit !== void 0 && explicit.length > 0) return explicit;
  const custom = clip.customName?.trim();
  if (clip.name === "CUSTOM" && custom !== void 0 && custom.length > 0) return custom;
  const separator = clip.name.lastIndexOf("_");
  const suffix = separator > 0 ? clip.name.slice(separator + 1) : "";
  return LEGACY_DIRECTION_SUFFIXES.includes(suffix) ? clip.name.slice(0, separator) : clip.name;
}
function assetAnimationDirectionName(clip) {
  const explicit = clip.direction?.trim();
  if (explicit !== void 0 && explicit.length > 0) return explicit;
  const separator = clip.name.lastIndexOf("_");
  const suffix = separator > 0 ? clip.name.slice(separator + 1) : "";
  return LEGACY_DIRECTION_SUFFIXES.includes(suffix) ? suffix : void 0;
}
function assetAnimationClipKey(clip) {
  return `${assetAnimationMotionName(clip)}::${assetAnimationDirectionName(clip) ?? "DEFAULT"}`;
}
function normalizePivotDefinition(input) {
  if (input.pivotDefinition !== void 0) return input.pivotDefinition;
  if (input.pivot === "CUSTOM") return {
    kind: "CUSTOM",
    x: 0,
    y: 0
  };
  return {
    kind: input.pivot
  };
}
function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function isFiniteInteger(value) {
  return Number.isSafeInteger(value);
}
function isValidLayerSelection(selection2) {
  if (selection2.kind === "CURRENT_LAYER") return selection2.layerId.trim().length > 0;
  if (selection2.kind === "LAYER_GROUP") return selection2.groupId.trim().length > 0;
  if (selection2.kind === "SELECTED_LAYERS") return normalizeReferences(selection2.layerIds).length > 0;
  return selection2.kind === "VISIBLE_LAYERS";
}
function isValidFrameSelection(selection2) {
  if (selection2.kind === "CURRENT_FRAME") return selection2.frameId.trim().length > 0;
  if (selection2.kind === "RANGE") return selection2.startFrameId.trim().length > 0 && selection2.endFrameId.trim().length > 0;
  if (selection2.kind === "TAG") return selection2.tagId.trim().length > 0;
  return selection2.frameIds.length > 0 && normalizeReferences(selection2.frameIds).length === selection2.frameIds.length;
}
function isValidRegionSelection(region) {
  if (region.kind === "FULL_CANVAS") return true;
  if (![
    region.x,
    region.y
  ].every(isFiniteInteger) || region.x < 0 || region.y < 0) return false;
  if (region.kind === "MANUAL") return isPositiveInteger(region.width) && isPositiveInteger(region.height);
  if (region.kind === "GRID") return (region.cellSize === 16 || region.cellSize === 32) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
  return isPositiveInteger(region.cellWidth) && isPositiveInteger(region.cellHeight) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
}
function isValidAnimationMapping(mapping) {
  const seenKeys = /* @__PURE__ */ new Set();
  return mapping.every((clip) => {
    const motionName = assetAnimationMotionName(clip).trim();
    const direction = assetAnimationDirectionName(clip);
    const key = assetAnimationClipKey(clip);
    const hasSourceFrames = clip.sourceFrames !== void 0;
    const normalizedFrameIds = clip.frameIds.map((frameId) => frameId.trim()).filter((frameId) => frameId.length > 0);
    if (!isAssetAnimationName(clip.name) || motionName.length === 0 || seenKeys.has(key) || clip.frameIds.length === 0 || normalizedFrameIds.length !== clip.frameIds.length || !hasSourceFrames && normalizeOrderedReferences(clip.frameIds).length !== clip.frameIds.length) return false;
    seenKeys.add(key);
    if (clip.name === "CUSTOM" && (clip.customName ?? "").trim().length === 0) return false;
    if (clip.motionName !== void 0 && clip.motionName.trim().length === 0) return false;
    if (direction !== void 0 && direction.trim().length === 0) return false;
    if (clip.sourceReference !== void 0 && clip.sourceReference.trim().length === 0) return false;
    if (clip.flipX !== void 0 && typeof clip.flipX !== "boolean") return false;
    if (clip.flipY !== void 0 && typeof clip.flipY !== "boolean") return false;
    if (clip.sourceFrames !== void 0 && (clip.sourceFrames.length !== clip.frameIds.length || clip.sourceFrames.some((frame2) => frame2.sourceFrameId.trim().length === 0 || normalizeReferences(frame2.layerIds).length === 0 || !Number.isSafeInteger(frame2.rect.x) || !Number.isSafeInteger(frame2.rect.y) || frame2.rect.x < 0 || frame2.rect.y < 0 || !isPositiveInteger(frame2.rect.width) || !isPositiveInteger(frame2.rect.height) || frame2.durationMs !== void 0 && (!Number.isFinite(frame2.durationMs) || frame2.durationMs <= 0) || frame2.flipX !== void 0 && typeof frame2.flipX !== "boolean" || frame2.flipY !== void 0 && typeof frame2.flipY !== "boolean"))) return false;
    if (clip.frameDurationsMs !== void 0 && (clip.frameDurationsMs.length !== clip.frameIds.length || clip.frameDurationsMs.some((duration) => !Number.isFinite(duration) || duration <= 0))) return false;
    return [
      "LOOP",
      "ONCE",
      "PING_PONG"
    ].includes(clip.loopMode) && (clip.fps === void 0 || Number.isFinite(clip.fps) && clip.fps > 0);
  });
}
function isValidPivotDefinition(pivot) {
  return pivot.kind !== "CUSTOM" || [
    pivot.x,
    pivot.y
  ].every(Number.isFinite);
}
function isValidProtection(protection) {
  return typeof protection.locked === "boolean" && protection.sourceReadOnly === true && [
    "LIVE",
    "PINNED",
    "REVIEW",
    "FORKED"
  ].includes(protection.referencePolicy);
}
function isValidDefinition(definition) {
  const validFrames = isPositiveInteger(definition.frameStart) && isPositiveInteger(definition.frameEnd) && definition.frameEnd >= definition.frameStart;
  return definition.sourceProjectId.length > 0 && definition.sourceProjectId === definition.sourceProjectId.trim() && definition.sourceCanvasId.length > 0 && definition.sourceCanvasId === definition.sourceCanvasId.trim() && validFrames && isAssetSourceKind(definition.sourceKind) && isCreatorAssetKind(definition.assetKind) && isAssetPivot(definition.pivot) && isValidLayerSelection(definition.layerSelection) && isValidFrameSelection(definition.frameSelection) && isValidRegionSelection(definition.region) && isValidAnimationMapping(definition.animationMapping) && isValidPivotDefinition(definition.pivotDefinition) && isValidProtection(definition.protection) && definition.metadata.name.length > 0;
}
function createAssetDefinitionDraft(input) {
  const sourceProjectId = input.sourceProjectId.trim();
  const sourceCanvasId = input.sourceCanvasId.trim();
  const sourceLayerIds = normalizeReferences(input.sourceLayerIds);
  const dependencyIds = normalizeReferences(input.dependencyIds);
  const layerSelection = normalizeLayerSelection(input, sourceLayerIds);
  const frameSelection = normalizeFrameSelection(input.frameSelection);
  const region = input.region ?? {
    kind: "FULL_CANVAS"
  };
  const animationMapping = normalizeAnimationMapping(input.animationMapping ?? []);
  const pivotDefinition = normalizePivotDefinition(input);
  const protection = input.protection ?? {
    locked: false,
    sourceReadOnly: true,
    referencePolicy: "LIVE"
  };
  const metadata = normalizeMetadata(input.metadata, input.assetKind);
  const validFrames = Number.isInteger(input.frameStart) && Number.isInteger(input.frameEnd) && input.frameStart > 0 && input.frameEnd >= input.frameStart;
  if (sourceProjectId.length === 0 || sourceCanvasId.length === 0 || !isAssetSourceKind(input.sourceKind) || !isCreatorAssetKind(input.assetKind) || !isAssetPivot(input.pivot) || !validFrames || frameSelection === void 0 || !isValidLayerSelection(layerSelection) || !isValidFrameSelection(frameSelection) || !isValidRegionSelection(region) || !isValidAnimationMapping(animationMapping) || !isValidPivotDefinition(pivotDefinition) || !isValidProtection(protection) || metadata.name.length === 0) {
    return {
      ok: false,
      code: "INVALID_ASSET_DRAFT",
      message: "Project\u3001Source\u3001Type\u3001Pivot\u3001Frame\u7BC4\u56F2\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      sourceProjectId,
      sourceCanvasId,
      sourceKind: input.sourceKind,
      sourceLayerIds,
      frameStart: input.frameStart,
      frameEnd: input.frameEnd,
      layerSelection,
      frameSelection,
      region,
      animationMapping,
      assetKind: input.assetKind,
      pivot: input.pivot,
      pivotDefinition,
      protection,
      metadata,
      dependencyIds,
      persistence: "LOCAL_DRAFT"
    }
  };
}
function validateAssetDefinitionDraft(draft) {
  if (draft.persistence !== "LOCAL_DRAFT" || !isValidDefinition(draft)) {
    return {
      ok: false,
      code: "INVALID_ASSET_DEFINITION",
      message: "Asset\u5B9A\u7FA9\u306E\u53C2\u7167\u3001\u7BC4\u56F2\u3001\u30E1\u30BF\u30C7\u30FC\u30BF\u3001\u4FDD\u8B77\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  return {
    ok: true,
    value: {
      ...draft,
      persistence: "VALIDATED_DEFINITION"
    }
  };
}

// src/draw2-creator-features.ts
var CREATOR_FEATURE_SCHEMA_VERSION = 1;
function boundedInteger(value, min, max, fallback) {
  return Number.isSafeInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function boundedNumber(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function stableId(value, kind) {
  if (!/^[A-Za-z0-9:_./-]{1,128}$/.test(value)) {
    throw new Error(`${kind} must be a bounded stable identifier.`);
  }
  return value;
}
function normalizeBrushPreset(input) {
  return {
    id: stableId(input.id, "Brush preset ID"),
    name: input.name.trim().slice(0, 64) || "Preset",
    brushSize: boundedInteger(input.brushSize, 1, 64, 1),
    brushShape: input.brushShape === "circle" ? "circle" : "square",
    pattern: input.pattern === "checker" || input.pattern === "dots" || input.pattern === "bayer-2x2" ? input.pattern : "solid",
    dither: input.dither === "BAYER_2X2" || input.dither === "BAYER_4X4" ? input.dither : "NONE",
    colorIndex: boundedInteger(input.colorIndex, 0, 255, 0),
    opacity: boundedNumber(input.opacity, 0, 1, 1),
    schemaVersion: CREATOR_FEATURE_SCHEMA_VERSION
  };
}
var BrushPresetStore = class {
  #presets = /* @__PURE__ */ new Map();
  constructor(initial = []) {
    for (const preset of initial) this.save(preset);
  }
  save(input) {
    const preset = normalizeBrushPreset(input);
    this.#presets.set(preset.id, preset);
    return preset;
  }
  load(id) {
    return this.#presets.get(id);
  }
  remove(id) {
    return this.#presets.delete(id);
  }
  list() {
    return [
      ...this.#presets.values()
    ].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
};
function createSelectionMask(width, height, points = []) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error("Selection mask dimensions must be positive integers.");
  const selected = new Uint8Array(width * height);
  for (const point of points) {
    if (point.x >= 0 && point.y >= 0 && point.x < width && point.y < height) {
      selected[point.y * width + point.x] = 1;
    }
  }
  return {
    width,
    height,
    selected
  };
}
function selectionAt(mask, x, y) {
  return x >= 0 && y >= 0 && x < mask.width && y < mask.height && mask.selected[y * mask.width + x] === 1;
}
function maskFromBytes(mask, bytes) {
  return {
    width: mask.width,
    height: mask.height,
    selected: bytes
  };
}
function selectionExpand(mask, radius = 1) {
  const distance = boundedInteger(radius, 1, Math.max(mask.width, mask.height), 1);
  const result = new Uint8Array(mask.selected);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (selectionAt(mask, x, y)) {
        continue;
      }
      let found = false;
      for (let offsetY = -distance; offsetY <= distance && !found; offsetY += 1) {
        for (let offsetX = -distance; offsetX <= distance; offsetX += 1) {
          if (Math.abs(offsetX) + Math.abs(offsetY) <= distance && selectionAt(mask, x + offsetX, y + offsetY)) {
            found = true;
            break;
          }
        }
      }
      if (found) result[y * mask.width + x] = 1;
    }
  }
  return maskFromBytes(mask, result);
}
function selectionShrink(mask, radius = 1) {
  const distance = boundedInteger(radius, 1, Math.max(mask.width, mask.height), 1);
  const result = new Uint8Array(mask.selected);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!selectionAt(mask, x, y)) {
        continue;
      }
      for (let offsetY = -distance; offsetY <= distance; offsetY += 1) {
        for (let offsetX = -distance; offsetX <= distance; offsetX += 1) {
          if (Math.abs(offsetX) + Math.abs(offsetY) <= distance && !selectionAt(mask, x + offsetX, y + offsetY)) {
            result[y * mask.width + x] = 0;
            offsetY = distance + 1;
            break;
          }
        }
      }
    }
  }
  return maskFromBytes(mask, result);
}
function selectionInvert(mask) {
  const result = new Uint8Array(mask.selected.length);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = mask.selected[index] === 1 ? 0 : 1;
  }
  return maskFromBytes(mask, result);
}
function selectionBorder(mask, radius = 1) {
  const expanded = selectionExpand(mask, radius);
  const inner = selectionShrink(mask, radius);
  const result = new Uint8Array(mask.selected.length);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = expanded.selected[index] === 1 && inner.selected[index] === 0 ? 1 : 0;
  }
  return maskFromBytes(mask, result);
}
var AnimationTagStore = class {
  #tags = /* @__PURE__ */ new Map();
  upsert(tag, frameCount) {
    const errors = validateAnimationTag(tag, frameCount);
    if (errors.length > 0) throw new Error(errors.join(","));
    const normalized = {
      ...tag,
      id: stableId(tag.id, "Animation tag ID"),
      name: tag.name.trim().slice(0, 64)
    };
    this.#tags.set(normalized.id, normalized);
    return normalized;
  }
  remove(id) {
    return this.#tags.delete(id);
  }
  get(id) {
    return this.#tags.get(id);
  }
  list() {
    return [
      ...this.#tags.values()
    ].sort((a, b) => a.fromFrameIndex - b.fromFrameIndex || a.id.localeCompare(b.id));
  }
};
function validateAnimationTag(tag, frameCount) {
  const errors = [];
  if (!tag.id.trim() || !tag.name.trim()) {
    errors.push("TAG_ID_OR_NAME_REQUIRED");
  }
  if (!Number.isSafeInteger(tag.fromFrameIndex) || !Number.isSafeInteger(tag.toFrameIndex) || tag.fromFrameIndex < 0 || tag.toFrameIndex < tag.fromFrameIndex || tag.toFrameIndex >= frameCount) errors.push("TAG_FRAME_RANGE_INVALID");
  if (tag.color !== void 0 && (!Number.isSafeInteger(tag.color) || tag.color < 0 || tag.color > 4294967295)) errors.push("TAG_COLOR_INVALID");
  return errors;
}
function createLinkedCelBinding(celId, sourceCelId, existing = []) {
  stableId(celId, "Linked Cel ID");
  stableId(sourceCelId, "Linked Cel source ID");
  if (celId === sourceCelId) throw new Error("A Cel cannot link to itself.");
  const binding = {
    celId,
    sourceCelId,
    mode: "LINKED"
  };
  resolveLinkedCel(sourceCelId, [
    ...existing,
    binding
  ]);
  return binding;
}
function resolveLinkedCel(celId, bindings) {
  const map = new Map(bindings.map((binding) => [
    binding.celId,
    binding.sourceCelId
  ]));
  const visited = /* @__PURE__ */ new Set();
  let current = celId;
  while (map.has(current)) {
    if (visited.has(current)) throw new Error("Linked Cel cycle detected.");
    visited.add(current);
    current = map.get(current);
  }
  return current;
}
var TimelineMarkerStore = class {
  #markers = /* @__PURE__ */ new Map();
  upsert(marker) {
    if (!marker.id.trim() || !marker.label.trim() || !Number.isSafeInteger(marker.frameIndex) || marker.frameIndex < 0 || ![
      "AUDIO",
      "GAME_EVENT",
      "NOTE"
    ].includes(marker.kind)) throw new Error("Timeline marker is invalid.");
    const normalized = {
      ...marker,
      id: stableId(marker.id, "Timeline marker ID"),
      label: marker.label.trim().slice(0, 128),
      payload: marker.payload === void 0 ? void 0 : {
        ...marker.payload
      }
    };
    this.#markers.set(normalized.id, normalized);
    return normalized;
  }
  remove(id) {
    return this.#markers.delete(id);
  }
  list(frameIndex) {
    return [
      ...this.#markers.values()
    ].filter((marker) => frameIndex === void 0 || marker.frameIndex === frameIndex).sort((a, b) => a.frameIndex - b.frameIndex || a.id.localeCompare(b.id));
  }
};
var DrawAudioReferenceStore = class {
  #references = /* @__PURE__ */ new Map();
  upsert(reference, frameCount) {
    if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
      throw new Error("Draw Audio reference requires a valid frame count.");
    }
    const normalized = {
      id: stableId(reference.id, "Draw Audio reference ID"),
      audioAssetId: stableId(reference.audioAssetId, "Audio Asset ID"),
      audioRevisionId: stableId(reference.audioRevisionId, "Audio Revision ID"),
      kind: reference.kind === "SE" ? "SE" : "BGM",
      label: reference.label.trim().slice(0, 128) || reference.kind,
      startFrame: boundedInteger(reference.startFrame, 0, frameCount - 1, 0),
      durationFrames: boundedInteger(reference.durationFrames, 1, frameCount, reference.kind === "SE" ? 1 : frameCount),
      loop: reference.kind === "BGM" && reference.loop === true,
      gain: boundedNumber(reference.gain, 0, 2, 1)
    };
    this.#references.set(normalized.id, normalized);
    return normalized;
  }
  remove(id) {
    return this.#references.delete(id);
  }
  list() {
    return [
      ...this.#references.values()
    ].sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  }
};
var DRAW2_TIMELINE_METADATA_SCHEMA_VERSION = 2;
function isMetadataRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function cloneTimelineMarker(marker) {
  return marker.payload === void 0 ? {
    ...marker
  } : {
    ...marker,
    payload: {
      ...marker.payload
    }
  };
}
function normalizeDraw2TimelineMetadata(value, frameCount) {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new Error("Draw2 timeline metadata requires a valid frame count.");
  }
  if (value === void 0) {
    return {
      schemaVersion: DRAW2_TIMELINE_METADATA_SCHEMA_VERSION,
      animationTags: [],
      markers: [],
      audioReferences: []
    };
  }
  if (!isMetadataRecord(value) || value.schemaVersion !== DRAW2_TIMELINE_METADATA_SCHEMA_VERSION) {
    throw new Error("Draw2 timeline metadata schema is unsupported.");
  }
  if (!Array.isArray(value.animationTags) || !Array.isArray(value.markers) || !Array.isArray(value.audioReferences)) {
    throw new Error("Draw2 timeline metadata collections are invalid.");
  }
  const tags = new AnimationTagStore();
  const tagIds = /* @__PURE__ */ new Set();
  for (const candidate of value.animationTags) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw2 animation tag is invalid.");
    }
    if (tagIds.has(candidate.id)) {
      throw new Error("Draw2 animation tag identity is duplicated.");
    }
    tagIds.add(candidate.id);
    tags.upsert(candidate, frameCount);
  }
  const markers = new TimelineMarkerStore();
  const markerIds = /* @__PURE__ */ new Set();
  for (const candidate of value.markers) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw2 timeline marker is invalid.");
    }
    if (!Number.isSafeInteger(candidate.frameIndex) || candidate.frameIndex < 0 || candidate.frameIndex >= frameCount) {
      throw new Error("Draw2 timeline marker frame is invalid.");
    }
    if (markerIds.has(candidate.id)) {
      throw new Error("Draw2 timeline marker identity is duplicated.");
    }
    markerIds.add(candidate.id);
    markers.upsert(candidate);
  }
  const audioReferences = new DrawAudioReferenceStore();
  const audioReferenceIds = /* @__PURE__ */ new Set();
  for (const candidate of value.audioReferences) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw Audio reference is invalid.");
    }
    if (audioReferenceIds.has(candidate.id)) {
      throw new Error("Draw Audio reference identity is duplicated.");
    }
    audioReferenceIds.add(candidate.id);
    audioReferences.upsert(candidate, frameCount);
  }
  return {
    schemaVersion: DRAW2_TIMELINE_METADATA_SCHEMA_VERSION,
    animationTags: tags.list().map((tag) => ({
      ...tag
    })),
    markers: markers.list().map(cloneTimelineMarker),
    audioReferences: audioReferences.list().map((reference) => ({
      ...reference
    }))
  };
}

// src/draw2-persistence.ts
var DRAW2_PERSISTENCE_SCHEMA_VERSION = "DRAW2_PERSISTENCE_V1";
var DRAW2_PERSISTENCE_DB_NAME = "pixiedraw2-draw-subdocuments";
var DRAW2_PERSISTENCE_DB_VERSION = 1;
var DRAW2_PERSISTENCE_STORE_NAME = "projects";
function normalizeAssetDefinitions(entries) {
  const normalized = [
    ...entries ?? []
  ].map((entry) => {
    if (entry === null || typeof entry !== "object" || typeof entry.definitionId !== "string" || entry.definitionId.trim().length === 0 || entry.definition === null || typeof entry.definition !== "object") {
      throw new Error("Draw2 Asset Definition identity is invalid.");
    }
    const candidate = {
      ...entry.definition,
      persistence: "LOCAL_DRAFT"
    };
    const validation = validateAssetDefinitionDraft(candidate);
    if (!validation.ok) {
      throw new Error(`Draw2 Asset Definition is invalid: ${validation.message}`);
    }
    const definition = entry.definition.persistence === "VALIDATED_DEFINITION" ? {
      ...validation.value,
      persistence: "VALIDATED_DEFINITION"
    } : {
      ...validation.value,
      persistence: "LOCAL_DRAFT"
    };
    return {
      definitionId: entry.definitionId.trim(),
      definition,
      ...entry.registryIdentity === void 0 ? {} : {
        registryIdentity: {
          ...entry.registryIdentity
        }
      }
    };
  });
  const ids = /* @__PURE__ */ new Set();
  for (const entry of normalized) {
    if (ids.has(entry.definitionId)) {
      throw new Error("Draw2 Asset Definition identity is duplicated.");
    }
    ids.add(entry.definitionId);
  }
  return normalized.sort((left, right) => left.definitionId.localeCompare(right.definitionId));
}
function stateHashPayload(checkpoint, assetDefinitions2, timelineMetadata) {
  if (assetDefinitions2 === void 0 && timelineMetadata === void 0) {
    return checkpoint;
  }
  return {
    checkpoint,
    ...assetDefinitions2 === void 0 ? {} : {
      assetDefinitions: assetDefinitions2
    },
    ...timelineMetadata === void 0 ? {} : {
      timelineMetadata
    }
  };
}
function cloneBytes(bytes) {
  return Array.from(bytes);
}
function serializeTile(tile) {
  return {
    tileKey: tile.tileKey,
    bytes: cloneBytes(tile.bytes)
  };
}
function deserializeTile(tile) {
  return {
    tileKey: tile.tileKey,
    bytes: Uint8Array.from(tile.bytes)
  };
}
function serializeDraw2ProjectState(state2) {
  const assets = {};
  for (const [id, asset] of Object.entries(state2.assets)) {
    assets[id] = {
      id: asset.id,
      width: asset.width,
      height: asset.height,
      palette: [
        ...asset.palette
      ],
      raster: {
        width: asset.raster.width,
        height: asset.raster.height,
        tileSize: asset.raster.tileSize,
        tiles: asset.raster.snapshotTiles().map(serializeTile)
      },
      revision: asset.revision
    };
  }
  return {
    ...state2,
    layers: state2.layers.map((layer2) => ({
      ...layer2
    })),
    frames: state2.frames.map((frame2) => ({
      ...frame2
    })),
    cels: state2.cels.map((cel2) => ({
      ...cel2
    })),
    timeline: {
      ...state2.timeline,
      frameOrder: [
        ...state2.timeline.frameOrder
      ],
      layerTrackOrder: [
        ...state2.timeline.layerTrackOrder
      ]
    },
    tilemaps: cloneDraw2Tilemaps(state2.tilemaps),
    assets,
    appliedCommandIds: [
      ...state2.appliedCommandIds
    ],
    lastClientSequenceByClient: {
      ...state2.lastClientSequenceByClient
    }
  };
}
function deserializeDraw2ProjectState(serialized) {
  if (serialized.schemaVersion !== 1 || typeof serialized.projectId !== "string") {
    throw new Error("Draw2 Project state schema is unsupported.");
  }
  const assets = {};
  for (const [id, serializedAsset] of Object.entries(serialized.assets)) {
    if (serializedAsset.id !== id) throw new Error("Draw2 asset identity is invalid.");
    const raster = serializedAsset.raster;
    if (raster.width !== serializedAsset.width || raster.height !== serializedAsset.height) {
      throw new Error("Draw2 raster dimensions do not match the asset.");
    }
    assets[id] = {
      id: serializedAsset.id,
      width: serializedAsset.width,
      height: serializedAsset.height,
      palette: [
        ...serializedAsset.palette
      ],
      raster: IndexedTileRaster.fromTileSnapshots(raster.width, raster.height, raster.tileSize, raster.tiles.map(deserializeTile)),
      revision: serializedAsset.revision
    };
  }
  return {
    ...serialized,
    layers: serialized.layers.map((layer2) => ({
      ...layer2
    })),
    frames: serialized.frames.map((frame2) => ({
      ...frame2
    })),
    cels: serialized.cels.map((cel2) => ({
      ...cel2
    })),
    timeline: {
      ...serialized.timeline,
      frameOrder: [
        ...serialized.timeline.frameOrder
      ],
      layerTrackOrder: [
        ...serialized.timeline.layerTrackOrder
      ]
    },
    tilemaps: cloneDraw2Tilemaps(serialized.tilemaps),
    assets,
    appliedCommandIds: [
      ...serialized.appliedCommandIds
    ],
    lastClientSequenceByClient: {
      ...serialized.lastClientSequenceByClient
    }
  };
}
function serializeHistoryEntry(entry) {
  return {
    actionId: entry.actionId,
    operationId: entry.operationId,
    operationType: entry.operationType,
    before: serializeDraw2ProjectState(entry.before),
    after: serializeDraw2ProjectState(entry.after)
  };
}
function deserializeHistoryEntry(entry) {
  return {
    actionId: entry.actionId,
    operationId: entry.operationId,
    operationType: entry.operationType,
    before: deserializeDraw2ProjectState(entry.before),
    after: deserializeDraw2ProjectState(entry.after)
  };
}
function serializeDraw2History(history2) {
  return {
    undo: history2.undo.map(serializeHistoryEntry),
    redo: history2.redo.map(serializeHistoryEntry)
  };
}
function deserializeDraw2History(history2) {
  return {
    undo: history2.undo.map(deserializeHistoryEntry),
    redo: history2.redo.map(deserializeHistoryEntry)
  };
}
function serializeDraw2Journal(journal2) {
  return {
    operations: journal2.operations.map((operation) => ({
      ...operation
    })),
    dirtyTileWrites: journal2.dirtyTileWrites.map((write) => ({
      assetId: write.assetId,
      tiles: write.tiles.map((tile) => ({
        tileKey: tile.tileKey,
        bytes: [
          ...tile.bytes
        ]
      }))
    }))
  };
}
async function createDraw2PersistenceRecord(state2, history2, journal2, revision, savedAt = (/* @__PURE__ */ new Date()).toISOString(), assetDefinitions2 = [], timelineMetadata) {
  const checkpoint = serializeDraw2ProjectState(state2);
  const normalizedAssetDefinitions = normalizeAssetDefinitions(assetDefinitions2);
  const normalizedTimelineMetadata = timelineMetadata === void 0 ? void 0 : normalizeDraw2TimelineMetadata(timelineMetadata, state2.frames.length);
  return {
    schemaVersion: DRAW2_PERSISTENCE_SCHEMA_VERSION,
    projectId: state2.projectId,
    revision,
    savedAt,
    stateHash: await sha256Hex(stateHashPayload(checkpoint, normalizedAssetDefinitions, normalizedTimelineMetadata)),
    checkpoint,
    journal: serializeDraw2Journal(journal2),
    history: serializeDraw2History(history2),
    assetDefinitions: normalizedAssetDefinitions,
    ...normalizedTimelineMetadata === void 0 ? {} : {
      timelineMetadata: normalizedTimelineMetadata
    }
  };
}
async function restoreDraw2PersistenceRecord(record2, expectedProjectId) {
  if (record2.schemaVersion !== DRAW2_PERSISTENCE_SCHEMA_VERSION || expectedProjectId !== void 0 && record2.projectId !== expectedProjectId) {
    throw new Error("Draw2 persistence record identity is invalid.");
  }
  const state2 = deserializeDraw2ProjectState(record2.checkpoint);
  if (state2.projectId !== record2.projectId) {
    throw new Error("Draw2 checkpoint Project ID does not match the record.");
  }
  const assetDefinitions2 = normalizeAssetDefinitions(record2.assetDefinitions);
  const timelineMetadata = record2.timelineMetadata === void 0 ? void 0 : normalizeDraw2TimelineMetadata(record2.timelineMetadata, state2.frames.length);
  const expectedHash = await sha256Hex(stateHashPayload(record2.checkpoint, record2.assetDefinitions === void 0 ? void 0 : assetDefinitions2, timelineMetadata));
  if (record2.stateHash !== expectedHash) {
    throw new Error("Draw2 checkpoint hash does not match the record.");
  }
  const history2 = deserializeDraw2History(record2.history);
  for (const entry of [
    ...history2.undo,
    ...history2.redo
  ]) {
    if (entry.before.projectId !== record2.projectId || entry.after.projectId !== record2.projectId) {
      throw new Error("Draw2 history Project ID does not match the record.");
    }
  }
  return {
    state: state2,
    history: history2,
    assetDefinitions: assetDefinitions2,
    timelineMetadata: timelineMetadata ?? normalizeDraw2TimelineMetadata(void 0, state2.frames.length)
  };
}
function isNewer(incoming, current) {
  if (current === void 0) return true;
  if (incoming.revision !== current.revision) {
    return incoming.revision > current.revision;
  }
  return incoming.savedAt >= current.savedAt;
}
function openDrawDatabase(name) {
  return new Promise((resolve, reject2) => {
    if (typeof indexedDB === "undefined") {
      reject2(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(name, DRAW2_PERSISTENCE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAW2_PERSISTENCE_STORE_NAME)) {
        request.result.createObjectStore(DRAW2_PERSISTENCE_STORE_NAME, {
          keyPath: "projectId"
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject2(request.error ?? new Error("Draw2 DB open failed."));
    request.onblocked = () => reject2(new Error("Draw2 DB open was blocked."));
  });
}
function createIndexedDbDraw2PersistenceStore(databaseName = DRAW2_PERSISTENCE_DB_NAME) {
  const available = typeof indexedDB !== "undefined";
  return {
    available,
    async load(projectId) {
      if (!available) return null;
      try {
        const database = await openDrawDatabase(databaseName);
        return await new Promise((resolve) => {
          const request = database.transaction(DRAW2_PERSISTENCE_STORE_NAME, "readonly").objectStore(DRAW2_PERSISTENCE_STORE_NAME).get(projectId);
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
    async save(record2) {
      if (!available) return {
        ok: false,
        stale: false
      };
      try {
        const database = await openDrawDatabase(databaseName);
        return await new Promise((resolve) => {
          let stale = false;
          const transaction = database.transaction(DRAW2_PERSISTENCE_STORE_NAME, "readwrite");
          const store = transaction.objectStore(DRAW2_PERSISTENCE_STORE_NAME);
          const read = store.get(record2.projectId);
          read.onsuccess = () => {
            const current = read.result;
            if (isNewer(record2, current)) store.put(record2);
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
        const database = await openDrawDatabase(databaseName);
        await new Promise((resolve, reject2) => {
          const transaction = database.transaction(DRAW2_PERSISTENCE_STORE_NAME, "readwrite");
          transaction.objectStore(DRAW2_PERSISTENCE_STORE_NAME).delete(projectId);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject2(transaction.error);
          transaction.onabort = () => reject2(transaction.error);
        });
        database.close();
        return true;
      } catch {
        return false;
      }
    }
  };
}

// src/draw2-selection-edit.ts
function selectionPointKey(point) {
  return `${point.x}:${point.y}`;
}
function pointInSelectionBounds(point, regions) {
  return regions.some((region) => point.x >= region.x && point.y >= region.y && point.x < region.x + region.width && point.y < region.y + region.height);
}
function uniquePoints2(points) {
  const unique = /* @__PURE__ */ new Map();
  for (const point of points) unique.set(selectionPointKey(point), {
    x: point.x,
    y: point.y
  });
  return [
    ...unique.values()
  ].sort((left, right) => left.y - right.y || left.x - right.x);
}
function combineSelectionPoints(current, incoming, mode) {
  const currentUnique = uniquePoints2(current);
  const incomingUnique = uniquePoints2(incoming);
  const currentKeys = new Set(currentUnique.map(selectionPointKey));
  const incomingKeys = new Set(incomingUnique.map(selectionPointKey));
  if (mode === "REPLACE") return incomingUnique;
  if (mode === "ADD") return uniquePoints2([
    ...currentUnique,
    ...incomingUnique
  ]);
  if (mode === "SUBTRACT") return currentUnique.filter((point) => !incomingKeys.has(selectionPointKey(point)));
  return currentUnique.filter((point) => incomingKeys.has(selectionPointKey(point)));
}
function selectionEditModeFromModifiers(shiftKey, altKey, fallback) {
  if (shiftKey && altKey) return "INTERSECT";
  if (shiftKey) return "ADD";
  if (altKey) return "SUBTRACT";
  return fallback;
}

// src/draw2-asset-bridge-contract.ts
var DRAW2_ASSET_STATE_CHANGED_EVENT = "draw2:asset-state-changed";

// src/draw2-shortcuts.ts
var DRAW2_SHORTCUTS = [
  {
    id: "undo",
    version: 1,
    category: "Edit",
    label: "Undo",
    keys: "Mod+Z",
    command: "undo"
  },
  {
    id: "redo",
    version: 1,
    category: "Edit",
    label: "Redo",
    keys: "Mod+Shift+Z",
    command: "redo"
  },
  {
    id: "copy",
    version: 1,
    category: "Edit",
    label: "Copy selection",
    keys: "Mod+C",
    command: "copy"
  },
  {
    id: "cut",
    version: 1,
    category: "Edit",
    label: "Cut selection",
    keys: "Mod+X",
    command: "cut"
  },
  {
    id: "paste",
    version: 1,
    category: "Edit",
    label: "Paste placement",
    keys: "Mod+V",
    command: "paste"
  },
  {
    id: "tool-pen",
    version: 1,
    category: "Tools",
    label: "Pen",
    keys: "P",
    command: "tool-pen"
  },
  {
    id: "tool-pixel-pen",
    version: 1,
    category: "Tools",
    label: "Pixel Perfect Pen",
    keys: "Y",
    command: "tool-pixel-pen"
  },
  {
    id: "tool-eraser",
    version: 1,
    category: "Tools",
    label: "Eraser",
    keys: "E",
    command: "tool-eraser"
  },
  {
    id: "tool-fill",
    version: 1,
    category: "Tools",
    label: "Fill",
    keys: "G",
    command: "tool-fill"
  },
  {
    id: "tool-eyedropper",
    version: 1,
    category: "Tools",
    label: "Eyedropper",
    keys: "I",
    command: "tool-eyedropper"
  },
  {
    id: "tool-line",
    version: 1,
    category: "Tools",
    label: "Line",
    keys: "L",
    command: "tool-line"
  },
  {
    id: "tool-rect",
    version: 1,
    category: "Tools",
    label: "Rectangle",
    keys: "R",
    command: "tool-rect"
  },
  {
    id: "tool-ellipse",
    version: 1,
    category: "Tools",
    label: "Ellipse",
    keys: "O",
    command: "tool-ellipse"
  },
  {
    id: "tool-circle",
    version: 1,
    category: "Tools",
    label: "Circle",
    keys: "Shift+O",
    command: "tool-circle"
  },
  {
    id: "tool-select",
    version: 1,
    category: "Tools",
    label: "Rectangle selection",
    keys: "M",
    command: "tool-select"
  },
  {
    id: "tool-select-lasso",
    version: 1,
    category: "Tools",
    label: "Freehand selection",
    keys: "Q",
    command: "tool-select-lasso"
  },
  {
    id: "tool-select-polygon",
    version: 1,
    category: "Tools",
    label: "Polygon selection",
    keys: "N",
    command: "tool-select-polygon"
  },
  {
    id: "tool-move",
    version: 1,
    category: "Tools",
    label: "Move active cel content / duplicate",
    keys: "V",
    command: "tool-move"
  },
  {
    id: "tool-tile-stamp",
    version: 1,
    category: "Tools",
    label: "Tile stamp",
    keys: "T",
    command: "tool-tile-stamp"
  },
  {
    id: "tool-pan",
    version: 1,
    category: "Tools",
    label: "Pan viewport",
    keys: "H",
    command: "tool-pan"
  },
  {
    id: "selection-confirm",
    version: 1,
    category: "Selection",
    label: "Confirm selection",
    keys: "Enter",
    command: "selection-confirm"
  },
  {
    id: "selection-cancel",
    version: 1,
    category: "Selection",
    label: "Cancel draft / preview",
    keys: "Esc",
    command: "selection-cancel"
  },
  {
    id: "selection-deselect",
    version: 1,
    category: "Selection",
    label: "Deselect",
    keys: "Mod+Shift+A",
    command: "selection-deselect"
  },
  {
    id: "selection-select-all",
    version: 1,
    category: "Selection",
    label: "Select all",
    keys: "Mod+A",
    command: "selection-select-all"
  },
  {
    id: "selection-add",
    version: 1,
    category: "Selection",
    label: "Temporarily add",
    keys: "Shift",
    command: "selection-add"
  },
  {
    id: "selection-subtract",
    version: 1,
    category: "Selection",
    label: "Temporarily subtract",
    keys: "Alt",
    command: "selection-subtract"
  },
  {
    id: "mirror-cycle",
    version: 1,
    category: "View",
    label: "Toggle mirror on/off",
    keys: "Shift+M",
    command: "mirror-cycle"
  },
  {
    id: "zoom-in",
    version: 1,
    category: "View",
    label: "Zoom in at pointer",
    keys: "+",
    command: "zoom-in"
  },
  {
    id: "zoom-out",
    version: 1,
    category: "View",
    label: "Zoom out",
    keys: "-",
    command: "zoom-out"
  },
  {
    id: "zoom-reset",
    version: 1,
    category: "View",
    label: "Zoom to 100%",
    keys: "0",
    command: "zoom-reset"
  },
  {
    id: "add-frame",
    version: 1,
    category: "Timeline",
    label: "Add frame",
    keys: ",",
    command: "add-frame"
  },
  {
    id: "duplicate-frame",
    version: 1,
    category: "Timeline",
    label: "Duplicate frame",
    keys: ".",
    command: "duplicate-frame"
  },
  {
    id: "toggle-playback",
    version: 1,
    category: "Timeline",
    label: "Play / stop timeline",
    keys: "Space",
    command: "toggle-playback"
  },
  {
    id: "previous-frame",
    version: 1,
    category: "Timeline",
    label: "Previous frame",
    keys: "[",
    command: "previous-frame"
  },
  {
    id: "next-frame",
    version: 1,
    category: "Timeline",
    label: "Next frame",
    keys: "]",
    command: "next-frame"
  },
  {
    id: "toggle-loop",
    version: 1,
    category: "Timeline",
    label: "Cycle playback mode",
    keys: "Shift+L",
    command: "toggle-loop"
  },
  {
    id: "toggle-onion",
    version: 1,
    category: "Timeline",
    label: "Toggle onion skin",
    keys: "Alt+O",
    command: "toggle-onion"
  },
  {
    id: "clear-cel",
    version: 1,
    category: "Timeline",
    label: "Clear active cel",
    keys: "Delete",
    command: "clear-cel"
  },
  {
    id: "delete-selection",
    version: 1,
    category: "Selection",
    label: "Delete selected pixels",
    keys: "Mod+Delete",
    command: "delete-selection"
  },
  {
    id: "command-palette",
    version: 1,
    category: "Workspace",
    label: "Command Palette",
    keys: "Mod+K",
    command: "command-palette"
  },
  {
    id: "shortcuts",
    version: 1,
    category: "Workspace",
    label: "Keyboard shortcuts",
    keys: "?",
    command: "shortcuts"
  }
];
function normalizeKey(key) {
  if (key === " ") return "space";
  if (key === "Escape") return "esc";
  return key.toLowerCase();
}
function normalizedEventKey(event) {
  const modifier = event.metaKey || event.ctrlKey ? "mod+" : "";
  const printableSymbol = event.key === "?" || event.key === "+" || event.key === "_";
  const shift = event.shiftKey && !printableSymbol ? "shift+" : "";
  const alt = event.altKey ? "alt+" : "";
  return `${modifier}${shift}${alt}${normalizeKey(event.key)}`;
}
function normalizedRegistryKey(keys) {
  return keys.toLowerCase().replace("escape", "esc").replace("space", "space");
}
function resolveDraw2Shortcut(event, context = {}) {
  if (context.modalOpen || context.sheetOpen || context.inputEditing || context.imeComposing) return void 0;
  const key = normalizedEventKey(event);
  return DRAW2_SHORTCUTS.find((shortcut) => normalizedRegistryKey(shortcut.keys) === key);
}

// src/draw2-viewport.ts
var MIN_VIEWPORT_ZOOM = 0.1;
var MIN_SNAPPED_VIEWPORT_ZOOM = 0.25;
var MAX_VIEWPORT_ZOOM = 32;
var VIEWPORT_ZOOM_EPSILON = 1e-4;
var PIXEL_PERFECT_ZOOM_LEVELS = [
  0.25,
  1 / 3,
  0.5,
  2 / 3,
  0.75,
  0.875,
  1,
  1.125,
  1.25,
  1.375,
  1.5,
  1.625,
  1.75,
  1.875,
  2,
  2.25,
  2.5,
  2.75,
  3,
  3.25,
  3.5,
  3.75,
  4,
  4.5,
  5,
  6,
  7,
  8,
  10,
  12,
  16,
  24,
  32
];
function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function snapPixelPerfectZoom(value) {
  const safeValue = Math.max(MIN_SNAPPED_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, finite(value, 1)));
  return PIXEL_PERFECT_ZOOM_LEVELS.reduce((closest, candidate) => Math.abs(candidate - safeValue) < Math.abs(closest - safeValue) ? candidate : closest, PIXEL_PERFECT_ZOOM_LEVELS[0]);
}
function stepPixelPerfectZoom(currentZoom, direction) {
  const safeCurrent = Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, finite(currentZoom, 1)));
  if (direction > 0) {
    return PIXEL_PERFECT_ZOOM_LEVELS.find((candidate) => candidate > safeCurrent + VIEWPORT_ZOOM_EPSILON) ?? PIXEL_PERFECT_ZOOM_LEVELS.at(-1) ?? safeCurrent;
  }
  for (let index = PIXEL_PERFECT_ZOOM_LEVELS.length - 1; index >= 0; index -= 1) {
    const candidate = PIXEL_PERFECT_ZOOM_LEVELS[index];
    if (candidate !== void 0 && candidate < safeCurrent - VIEWPORT_ZOOM_EPSILON) {
      return candidate;
    }
  }
  return PIXEL_PERFECT_ZOOM_LEVELS[0] ?? safeCurrent;
}
function pinchZoomFromDistance(startZoom, startDistance, currentDistance, sensitivity = 1, snap = true) {
  const safeStartZoom = Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, finite(startZoom, 1)));
  const safeStartDistance = Math.max(1, finite(startDistance, 1));
  const safeCurrentDistance = Math.max(1, finite(currentDistance, safeStartDistance));
  const safeSensitivity = Math.max(0.25, Math.min(2, finite(sensitivity, 1)));
  const ratio = safeCurrentDistance / safeStartDistance;
  const continuousZoom = Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, safeStartZoom * Math.pow(ratio, safeSensitivity)));
  return snap ? snapPixelPerfectZoom(continuousZoom) : continuousZoom;
}
function zoomAtSourcePoint(request) {
  const rawZoom = Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, finite(request.nextZoom, 1)));
  const zoom = request.snap === false ? rawZoom : snapPixelPerfectZoom(rawZoom);
  const width = Math.max(1, finite(request.rasterWidth, 1));
  const height = Math.max(1, finite(request.rasterHeight, 1));
  const sourceX = Math.max(0, Math.min(width, finite(request.sourceX, width / 2)));
  const sourceY = Math.max(0, Math.min(height, finite(request.sourceY, height / 2)));
  const presentationCenterX = finite(request.presentationCenterX, 0);
  const presentationCenterY = finite(request.presentationCenterY, 0);
  const displayScale = Math.max(0.01, finite(request.displayScale ?? zoom, zoom));
  return {
    zoom,
    offsetX: finite(request.anchorClientX, presentationCenterX) - presentationCenterX - (sourceX - width / 2) * displayScale,
    offsetY: finite(request.anchorClientY, presentationCenterY) - presentationCenterY - (sourceY - height / 2) * displayScale
  };
}

// src/draw2-mirror.ts
function safeRasterSize(size) {
  return Math.max(1, Math.round(Number.isFinite(size) ? size : 1));
}
function mirrorGuideCenter(size) {
  return (safeRasterSize(size) - 1) / 2;
}
function clampMirrorGuideCoordinate(value, size) {
  const safeSize = safeRasterSize(size);
  const fallback = mirrorGuideCenter(safeSize);
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.max(-0.5, Math.min(safeSize - 0.5, safeValue));
}
function snapMirrorGuideCoordinate(value, size) {
  const clamped = clampMirrorGuideCoordinate(value, size);
  return clampMirrorGuideCoordinate(Math.round(clamped * 2) / 2, size);
}
function mirrorGuideToCanvasCoordinate(value, size) {
  const safeSize = safeRasterSize(size);
  return Math.max(0, Math.min(safeSize, clampMirrorGuideCoordinate(value, safeSize) + 0.5));
}
function canvasCoordinateToMirrorGuide(value, size) {
  const safeSize = safeRasterSize(size);
  const safeValue = Number.isFinite(value) ? value : safeSize / 2;
  return clampMirrorGuideCoordinate(safeValue - 0.5, safeSize);
}

// src/draw2-settings.ts
var DRAW2_SETTINGS_STORAGE_KEY = "pixieedraw2:visual-settings:v1";
var DEFAULT_DRAW2_VISUAL_SETTINGS = {
  zoomSensitivity: 1,
  checkerA: "#D9DCE2",
  checkerB: "#B4BAC5",
  gridMinor: "#1B3147",
  gridMajor: "#0D7E93",
  themeAccent: "#8AE3D2"
};
function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function normalizeDraw2VisualSettings(value) {
  const source = value !== null && typeof value === "object" ? value : {};
  const sensitivity = Math.max(0.25, Math.min(2, finiteNumber(source.zoomSensitivity, DEFAULT_DRAW2_VISUAL_SETTINGS.zoomSensitivity)));
  return {
    zoomSensitivity: Math.round(sensitivity * 4) / 4,
    checkerA: isHexColor(source.checkerA) ? source.checkerA.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.checkerA,
    checkerB: isHexColor(source.checkerB) ? source.checkerB.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.checkerB,
    gridMinor: isHexColor(source.gridMinor) ? source.gridMinor.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.gridMinor,
    gridMajor: isHexColor(source.gridMajor) ? source.gridMajor.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.gridMajor,
    themeAccent: isHexColor(source.themeAccent) ? source.themeAccent.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.themeAccent
  };
}
function readDraw2VisualSettings(storage) {
  if (storage === void 0) return DEFAULT_DRAW2_VISUAL_SETTINGS;
  try {
    const raw = storage.getItem(DRAW2_SETTINGS_STORAGE_KEY);
    return raw === null ? DEFAULT_DRAW2_VISUAL_SETTINGS : normalizeDraw2VisualSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_DRAW2_VISUAL_SETTINGS;
  }
}
function writeDraw2VisualSettings(storage, settings) {
  if (storage === void 0) return;
  try {
    storage.setItem(DRAW2_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeDraw2VisualSettings(settings)));
  } catch {
  }
}

// src/draw2-editor-preferences.ts
var DRAW2_EDITOR_PREFERENCES_STORAGE_KEY = "pixieed:draw2:editor-preferences:v1";
var DEFAULT_PROJECT_PREFERENCES = {
  selectedColor: 1,
  mirrorMode: "NONE",
  mirrorAxes: {
    x: false,
    y: false,
    diagonalDown: false,
    diagonalUp: false
  },
  mirrorGuide: {
    x: 0,
    y: 0,
    diagonalDown: 0,
    diagonalUp: 0
  },
  viewport: {
    zoom: 1,
    fit: true,
    userSelected: false,
    panX: 0,
    panY: 0
  },
  onionSkin: {
    enabled: false,
    previousFrames: 1,
    nextFrames: 1,
    opacity: 0.5,
    colorMode: "TINTED"
  }
};
var DEFAULT_DRAW2_EDITOR_PREFERENCES = {
  tool: "pen",
  brushSize: 1,
  brushShape: "square",
  brushPattern: "solid",
  similarityPercent: 0,
  colorSelectionMode: "similar",
  playbackLoopMode: "loop",
  playbackFps: "24",
  playbackFpsCustom: 24,
  theme: "system",
  projects: {}
};
function finiteNumber2(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function boundedNumber2(value, minimum, maximum, fallback) {
  return Math.max(minimum, Math.min(maximum, finiteNumber2(value, fallback)));
}
function boundedInteger2(value, minimum, maximum, fallback) {
  return Math.round(boundedNumber2(value, minimum, maximum, fallback));
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizeMirrorAxes(value) {
  const source = asRecord(value);
  return {
    x: source.x === true,
    y: source.y === true,
    diagonalDown: source.diagonalDown === true,
    diagonalUp: source.diagonalUp === true
  };
}
function normalizeProjectPreferences(value) {
  const source = asRecord(value);
  const mirrorMode2 = source.mirrorMode === "ON" ? "ON" : "NONE";
  const mirrorGuide2 = asRecord(source.mirrorGuide);
  const viewport = asRecord(source.viewport);
  const onionSkin = asRecord(source.onionSkin);
  return {
    selectedColor: boundedInteger2(source.selectedColor, 0, 4096, 1),
    mirrorMode: mirrorMode2,
    mirrorAxes: normalizeMirrorAxes(source.mirrorAxes),
    mirrorGuide: {
      // X/Y are stored in raster-pixel space. Keep a generous bound here and
      // clamp to the active asset dimensions at the Draw2 boundary.
      x: boundedNumber2(mirrorGuide2.x, -1e5, 1e5, 0),
      y: boundedNumber2(mirrorGuide2.y, -1e5, 1e5, 0),
      diagonalDown: boundedNumber2(mirrorGuide2.diagonalDown, -1, 1, 0),
      diagonalUp: boundedNumber2(mirrorGuide2.diagonalUp, -1, 1, 0)
    },
    viewport: {
      zoom: boundedNumber2(viewport.zoom, 0.25, 8, 1),
      fit: viewport.fit !== false,
      userSelected: viewport.userSelected === true,
      panX: boundedNumber2(viewport.panX, -1e5, 1e5, 0),
      panY: boundedNumber2(viewport.panY, -1e5, 1e5, 0)
    },
    onionSkin: {
      enabled: onionSkin.enabled === true,
      previousFrames: boundedInteger2(onionSkin.previousFrames, 0, 4, 1),
      nextFrames: boundedInteger2(onionSkin.nextFrames, 0, 4, 1),
      opacity: boundedNumber2(onionSkin.opacity, 0, 1, 0.5),
      colorMode: onionSkin.colorMode === "ORIGINAL" ? "ORIGINAL" : "TINTED"
    }
  };
}
function normalizePreferences(value) {
  const source = asRecord(value);
  const projectsSource = asRecord(source.projects);
  const projects = {};
  for (const [projectId, project] of Object.entries(projectsSource)) {
    if (projectId.trim().length === 0) continue;
    projects[projectId] = normalizeProjectPreferences(project);
  }
  const theme = source.theme === "light" || source.theme === "dark" ? source.theme : "system";
  const playbackLoopMode2 = source.playbackLoopMode === "bounce" || source.playbackLoopMode === "off" ? source.playbackLoopMode : "loop";
  const playbackFps = typeof source.playbackFps === "string" && [
    "12",
    "24",
    "30",
    "60",
    "custom"
  ].includes(source.playbackFps) ? source.playbackFps : "24";
  return {
    tool: typeof source.tool === "string" ? source.tool : "pen",
    brushSize: boundedInteger2(source.brushSize, 1, 32, 1),
    brushShape: typeof source.brushShape === "string" ? source.brushShape : "square",
    brushPattern: typeof source.brushPattern === "string" ? source.brushPattern : "solid",
    similarityPercent: boundedInteger2(source.similarityPercent, 0, 100, 0),
    colorSelectionMode: typeof source.colorSelectionMode === "string" ? source.colorSelectionMode : "similar",
    playbackLoopMode: playbackLoopMode2,
    playbackFps,
    playbackFpsCustom: boundedInteger2(source.playbackFpsCustom, 1, 120, 24),
    theme,
    projects
  };
}
function readDraw2EditorPreferences(storage) {
  if (storage === void 0) return DEFAULT_DRAW2_EDITOR_PREFERENCES;
  try {
    const raw = storage.getItem(DRAW2_EDITOR_PREFERENCES_STORAGE_KEY);
    return raw === null ? DEFAULT_DRAW2_EDITOR_PREFERENCES : normalizePreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_DRAW2_EDITOR_PREFERENCES;
  }
}
function writeDraw2EditorPreferences(storage, preferences) {
  if (storage === void 0) return;
  try {
    storage.setItem(DRAW2_EDITOR_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizePreferences(preferences)));
  } catch {
  }
}
function draw2ProjectEditorPreferences(preferences, projectId) {
  return preferences.projects[projectId] ?? DEFAULT_PROJECT_PREFERENCES;
}
function withDraw2ProjectEditorPreferences(preferences, projectId, projectPreferences) {
  return {
    ...preferences,
    projects: {
      ...preferences.projects,
      [projectId]: normalizeProjectPreferences(projectPreferences)
    }
  };
}

// src/draw2-i18n.ts
var EN_TO_JA = {
  "PIXEL CREATION STUDIO": "\u30D4\u30AF\u30BB\u30EB\u5236\u4F5C\u30B9\u30BF\u30B8\u30AA",
  "Draw2 Workspace": "iDRAW \u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9",
  "PiXiEEDraw2 Workspace": "iDRAW \u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9",
  "Professional Workspace": "\u30D7\u30ED\u5411\u3051\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9",
  Entry: "\u30A8\u30F3\u30C8\u30EA\u30FC",
  "Isolated Entry \xB7 Feature Flag OFF": "\u9694\u96E2\u30A8\u30F3\u30C8\u30EA\u30FC \xB7 Feature Flag OFF",
  "ISOLATED / LOCAL ONLY": "\u9694\u96E2 / \u30ED\u30FC\u30AB\u30EB\u306E\u307F",
  "Feature Flag OFF": "\u6A5F\u80FD\u30D5\u30E9\u30B0 OFF",
  Language: "\u8A00\u8A9E",
  Size: "\u30B5\u30A4\u30BA",
  Shape: "\u5F62\u72B6",
  Pattern: "\u30D1\u30BF\u30FC\u30F3",
  "Brush options": "\u30D6\u30E9\u30B7\u8A2D\u5B9A",
  "Brush shape and pattern": "\u30D6\u30E9\u30B7\u5F62\u72B6\u3068\u30D1\u30BF\u30FC\u30F3",
  "Close brush options": "\u30D6\u30E9\u30B7\u8A2D\u5B9A\u3092\u9589\u3058\u308B",
  "Brush size in pixels": "\u30D6\u30E9\u30B7\u30B5\u30A4\u30BA\uFF08\u30D4\u30AF\u30BB\u30EB\uFF09",
  "Mirror mode": "\u30DF\u30E9\u30FC\u30E2\u30FC\u30C9",
  "Wheel up/down to change size": "\u30DB\u30A4\u30FC\u30EB\u4E0A\u4E0B\u3067\u30B5\u30A4\u30BA\u5909\u66F4",
  "Click outside or press Escape to close.": "\u5916\u5074\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u304BEsc\u3067\u9589\u3058\u307E\u3059\u3002",
  Mirror: "\u30DF\u30E9\u30FC",
  Solid: "\u5358\u8272",
  Check: "\u30C1\u30A7\u30C3\u30AF",
  Dots: "\u30C9\u30C3\u30C8",
  Bayer: "\u30D9\u30A4\u30E4\u30FC",
  Off: "\u30AA\u30D5",
  On: "\u30AA\u30F3",
  "Vertical line": "\u7E26\u7DDA",
  "Horizontal line": "\u6A2A\u7DDA",
  "Descending diagonal line": "\u53F3\u4E0B\u304C\u308A\u7DDA",
  "Ascending diagonal line": "\u53F3\u4E0A\u304C\u308A\u7DDA",
  "Multiple selections are saved in one ZIP.": "\u8907\u6570\u9078\u629E\u3057\u305F\u5F62\u5F0F\u306F1\u3064\u306EZIP\u306B\u307E\u3068\u3081\u3066\u4FDD\u5B58\u3057\u307E\u3059\u3002",
  "Workspace commands": "\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u64CD\u4F5C",
  "Workspace Commands": "\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u64CD\u4F5C",
  "Frequent brush controls": "\u3088\u304F\u4F7F\u3046\u30D6\u30E9\u30B7\u64CD\u4F5C",
  Theme: "\u30C6\u30FC\u30DE",
  System: "\u30B7\u30B9\u30C6\u30E0",
  Light: "\u30E9\u30A4\u30C8",
  Dark: "\u30C0\u30FC\u30AF",
  File: "\u30D5\u30A1\u30A4\u30EB",
  Edit: "\u7DE8\u96C6",
  Sprite: "\u30B9\u30D7\u30E9\u30A4\u30C8",
  View: "\u8868\u793A",
  Tools: "\u30C4\u30FC\u30EB",
  Timeline: "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3",
  "Timeline views": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u8868\u793A",
  "Timeline playback and display actions": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u518D\u751F\u3068\u8868\u793A\u64CD\u4F5C",
  "Onion skin color mode": "\u30AA\u30CB\u30AA\u30F3\u30B9\u30AD\u30F3\u8272\u30E2\u30FC\u30C9",
  "Tinted order": "\u524D\u5F8C\u3092\u8272\u5206\u3051",
  "Original colors": "\u5143\u306E\u8272",
  "Onion Skin color mode": "\u30AA\u30CB\u30AA\u30F3\u30B9\u30AD\u30F3\u8272\u30E2\u30FC\u30C9",
  "original colors": "\u5143\u306E\u8272",
  "tinted order": "\u524D\u5F8C\u3092\u8272\u5206\u3051",
  "Canonical Raster unchanged.": "\u5143\u753B\u50CF\u306F\u5909\u66F4\u3055\u308C\u307E\u305B\u3093\u3002",
  "Collapse timeline": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u3092\u6298\u308A\u305F\u305F\u3080",
  "Use compact timeline": "\u30B3\u30F3\u30D1\u30AF\u30C8\u8868\u793A\u306B\u3059\u308B",
  "Expand timeline": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u3092\u5C55\u958B\u3059\u308B",
  "More timeline actions": "\u305D\u306E\u4ED6\u306E\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u64CD\u4F5C",
  "More timeline controls": "\u305D\u306E\u4ED6\u306E\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u64CD\u4F5C",
  Window: "\u30A6\u30A3\u30F3\u30C9\u30A6",
  Help: "\u30D8\u30EB\u30D7",
  "Open / New Project": "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3092\u958B\u304F / \u65B0\u898F\u4F5C\u6210",
  "Import PXD": "PXD\u3092\u8AAD\u307F\u8FBC\u3080",
  "Export PNG": "PNG\u3092\u66F8\u304D\u51FA\u3059",
  "Export PXD": "PXD\u3092\u66F8\u304D\u51FA\u3059",
  "Export Panel": "\u66F8\u304D\u51FA\u3057\u30D1\u30CD\u30EB",
  Export: "\u66F8\u304D\u51FA\u3057",
  "File Name": "\u30D5\u30A1\u30A4\u30EB\u540D",
  Format: "\u5F62\u5F0F",
  "Format Options": "\u5F62\u5F0F\u306E\u8A2D\u5B9A",
  "Output Files": "\u51FA\u529B\u4E88\u5B9A\u30D5\u30A1\u30A4\u30EB",
  Package: "\u307E\u3068\u3081\u65B9",
  "Separate files": "\u500B\u5225\u30D5\u30A1\u30A4\u30EB",
  "ZIP package": "ZIP\u306B\u307E\u3068\u3081\u308B",
  "Export Selected": "\u9078\u629E\u3057\u305F\u5F62\u5F0F\u3092\u66F8\u304D\u51FA\u3059",
  "Export Media": "\u30E1\u30C7\u30A3\u30A2\u3092\u66F8\u304D\u51FA\u3057",
  "Open audio and Draw export": "Audio\u3068Draw\u306E\u66F8\u304D\u51FA\u3057\u3092\u958B\u304F",
  "Image": "\u753B\u50CF",
  "Animation": "\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3",
  "Tiles": "\u30BF\u30A4\u30EB",
  "Game integration": "\u30B2\u30FC\u30E0\u9023\u643A",
  "PXD Project": "PXD\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
  "Sprite Sheet": "\u30B9\u30D7\u30E9\u30A4\u30C8\u30B7\u30FC\u30C8",
  "Atlas metadata": "Atlas\u30E1\u30BF\u30C7\u30FC\u30BF",
  "Select at least one format.": "\u5F62\u5F0F\u30921\u3064\u4EE5\u4E0A\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "No output selected.": "\u51FA\u529B\u5F62\u5F0F\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
  Undo: "\u5143\u306B\u623B\u3059",
  Redo: "\u3084\u308A\u76F4\u3059",
  Copy: "\u30B3\u30D4\u30FC",
  Cut: "\u5207\u308A\u53D6\u308A",
  Paste: "\u8CBC\u308A\u4ED8\u3051",
  "Preview Transform": "\u5909\u5F62\u3092\u30D7\u30EC\u30D3\u30E5\u30FC",
  "Commit Transform": "\u5909\u5F62\u3092\u78BA\u5B9A",
  "Cancel Transform": "\u5909\u5F62\u3092\u30AD\u30E3\u30F3\u30BB\u30EB",
  "Canvas Settings\u2026": "\u30AD\u30E3\u30F3\u30D0\u30B9\u8A2D\u5B9A\u2026",
  "Canvas Settings": "\u30AD\u30E3\u30F3\u30D0\u30B9\u8A2D\u5B9A",
  "Color Panel": "\u30AB\u30E9\u30FC\u30D1\u30CD\u30EB",
  "Layers Panel": "\u30EC\u30A4\u30E4\u30FC\u30D1\u30CD\u30EB",
  "Inspector Panel": "\u30A4\u30F3\u30B9\u30DA\u30AF\u30BF\u30FC\u30D1\u30CD\u30EB",
  "Advanced Tools Panel": "\u9AD8\u5EA6\u306A\u30C4\u30FC\u30EB\u30D1\u30CD\u30EB",
  "Preview Panel": "\u30D7\u30EC\u30D3\u30E5\u30FC\u30D1\u30CD\u30EB",
  "Assets Panel": "\u30A2\u30BB\u30C3\u30C8\u30D1\u30CD\u30EB",
  "Virtual Cursor": "\u4EEE\u60F3\u30AB\u30FC\u30BD\u30EB",
  "Mini Preview": "\u5C0F\u7A93\u30D7\u30EC\u30D3\u30E5\u30FC",
  "Visual Settings": "\u8868\u793A\u8A2D\u5B9A",
  Pen: "\u30DA\u30F3",
  Eraser: "\u6D88\u3057\u30B4\u30E0",
  Fill: "\u5857\u308A\u3064\u3076\u3057",
  "Fill / Indexed Gradient": "\u5857\u308A\u3064\u3076\u3057 / \u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u578B\u30B0\u30E9\u30C7\u30FC\u30B7\u30E7\u30F3",
  "Fill by click; drag for indexed gradient": "\u30AF\u30EA\u30C3\u30AF\u3067\u5857\u308A\u3064\u3076\u3057\u3001\u30C9\u30E9\u30C3\u30B0\u3067\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u578B\u30B0\u30E9\u30C7\u30FC\u30B7\u30E7\u30F3",
  "Fill by click; drag for indexed gradient (G)": "\u30AF\u30EA\u30C3\u30AF\u3067\u5857\u308A\u3064\u3076\u3057\u3001\u30C9\u30E9\u30C3\u30B0\u3067\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u578B\u30B0\u30E9\u30C7\u30FC\u30B7\u30E7\u30F3 (G)",
  Eyedropper: "\u30B9\u30DD\u30A4\u30C8",
  Pick: "\u62BD\u51FA",
  Line: "\u76F4\u7DDA",
  Rectangle: "\u56DB\u89D2\u5F62",
  Rect: "\u56DB\u89D2\u5F62",
  "Filled Rectangle": "\u5857\u308A\u3064\u3076\u3057\u56DB\u89D2\u5F62",
  "Rect Fill": "\u56DB\u89D2\u5F62\u5857\u308A\u3064\u3076\u3057",
  Circle: "\u5186",
  "Filled Circle": "\u5857\u308A\u3064\u3076\u3057\u5186",
  "Circle Fill": "\u5186\u5857\u308A\u3064\u3076\u3057",
  Ellipse: "\u6955\u5186",
  "Filled ellipse": "\u5857\u308A\u3064\u3076\u3057\u6955\u5186",
  "Filled Ellipse": "\u5857\u308A\u3064\u3076\u3057\u6955\u5186",
  "Ellipse Fill": "\u6955\u5186\u5857\u308A\u3064\u3076\u3057",
  "Rectangle Fill": "\u56DB\u89D2\u5F62\u5857\u308A\u3064\u3076\u3057",
  "Rectangle Select": "\u77E9\u5F62\u9078\u629E",
  "Lasso Select": "\u81EA\u7531\u9078\u629E",
  "Same Color": "\u540C\u8272",
  "Similar Color": "\u8FD1\u4F3C\u8272",
  Pan: "\u30D1\u30F3",
  "Move Content": "\u63CF\u753B\u79FB\u52D5",
  "Move active cel content / Duplicate": "\u73FE\u5728\u30BB\u30EB\u306E\u63CF\u753B\u3092\u79FB\u52D5 / \u8907\u88FD",
  "Move selection or the active cel content; Alt-drag duplicates": "\u9078\u629E\u7BC4\u56F2\u307E\u305F\u306F\u73FE\u5728\u30BB\u30EB\u306E\u63CF\u753B\u3092\u79FB\u52D5\u3001Alt\u30C9\u30E9\u30C3\u30B0\u3067\u8907\u88FD",
  "Move selection or active cel content; Alt-drag duplicates (V)": "\u9078\u629E\u7BC4\u56F2\u307E\u305F\u306F\u73FE\u5728\u30BB\u30EB\u306E\u63CF\u753B\u3092\u79FB\u52D5\u3001Alt\u30C9\u30E9\u30C3\u30B0\u3067\u8907\u88FD (V)",
  "Move selection or active cel content (V)": "\u9078\u629E\u7BC4\u56F2\u307E\u305F\u306F\u73FE\u5728\u30BB\u30EB\u306E\u63CF\u753B\u3092\u79FB\u52D5 (V)",
  "Rectangle Selection": "\u77E9\u5F62\u9078\u629E",
  "Freehand Selection": "\u81EA\u7531\u9078\u629E",
  "Color Selection": "\u8272\u9078\u629E",
  "Similar color": "\u8FD1\u4F3C\u8272",
  "Same color": "\u540C\u8272",
  Magic: "Magic",
  Opaque: "Opaque",
  Tolerance: "\u8A31\u5BB9\u5024",
  "Color selection mode": "\u8272\u9078\u629E\u65B9\u5F0F",
  "Color tolerance": "\u8272\u306E\u8A31\u5BB9\u5024",
  "Same Color Selection": "\u540C\u8272\u9078\u629E",
  "Similar Color Selection": "\u8FD1\u4F3C\u8272\u9078\u629E",
  "Pan Viewport": "\u30D3\u30E5\u30FC\u30DD\u30FC\u30C8\u79FB\u52D5",
  "Add Frame": "\u30D5\u30EC\u30FC\u30E0\u3092\u8FFD\u52A0",
  "Duplicate Frame": "\u30D5\u30EC\u30FC\u30E0\u3092\u8907\u88FD",
  "Remove Frame": "\u30D5\u30EC\u30FC\u30E0\u3092\u524A\u9664",
  "Add Layer": "\u30EC\u30A4\u30E4\u30FC\u3092\u8FFD\u52A0",
  "Move Layer Up": "\u30EC\u30A4\u30E4\u30FC\u3092\u4E0A\u3078",
  "Toggle Layer": "\u30EC\u30A4\u30E4\u30FC\u8868\u793A\u5207\u66FF",
  "Onion Skin": "\u30AA\u30CB\u30AA\u30F3\u30B9\u30AD\u30F3",
  "Play / Stop": "\u518D\u751F / \u505C\u6B62",
  "Play / Stop Timeline": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u518D\u751F / \u505C\u6B62",
  "Play timeline": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u3092\u518D\u751F",
  "Pause timeline": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u3092\u4E00\u6642\u505C\u6B62",
  "Preview timeline": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u3092\u30D7\u30EC\u30D3\u30E5\u30FC",
  "Pause timeline playback": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u3092\u4E00\u6642\u505C\u6B62",
  "Loop Playback": "\u30EB\u30FC\u30D7\u518D\u751F",
  Color: "\u30AB\u30E9\u30FC",
  Layers: "\u30EC\u30A4\u30E4\u30FC",
  Inspector: "\u30A4\u30F3\u30B9\u30DA\u30AF\u30BF",
  "Advanced Tools": "\u9AD8\u5EA6\u306A\u30C4\u30FC\u30EB",
  Preview: "\u30D7\u30EC\u30D3\u30E5\u30FC",
  Assets: "\u30A2\u30BB\u30C3\u30C8",
  "Close Panel": "\u30D1\u30CD\u30EB\u3092\u9589\u3058\u308B",
  Panels: "\u30D1\u30CD\u30EB",
  Palette: "\u30D1\u30EC\u30C3\u30C8",
  Props: "\u30D7\u30ED\u30D1\u30C6\u30A3",
  Play: "\u518D\u751F",
  "Pixel Tools": "\u30D4\u30AF\u30BB\u30EB\u30C4\u30FC\u30EB",
  "Pixel drawing tools": "\u30D4\u30AF\u30BB\u30EB\u63CF\u753B\u30C4\u30FC\u30EB",
  "Quick pixel tools": "\u30AF\u30A4\u30C3\u30AF\u30D4\u30AF\u30BB\u30EB\u30C4\u30FC\u30EB",
  "Resize mobile panels": "\u30E2\u30D0\u30A4\u30EB\u30D1\u30CD\u30EB\u3092\u958B\u9589",
  "Filled rectangle": "\u5857\u308A\u3064\u3076\u3057\u56DB\u89D2\u5F62",
  "Palette color": "\u30D1\u30EC\u30C3\u30C8\u30AB\u30E9\u30FC",
  "Add color": "\u8272\u3092\u8FFD\u52A0",
  "Draw tools": "\u63CF\u753B\u30C4\u30FC\u30EB",
  "Shape tools": "\u56F3\u5F62\u30C4\u30FC\u30EB",
  "Fill and pick tools": "\u5857\u308A\u3064\u3076\u3057\uFF0F\u62BD\u51FA\u30C4\u30FC\u30EB",
  "Selection tools": "\u9078\u629E\u30C4\u30FC\u30EB",
  "Application menu": "\u30A2\u30D7\u30EA\u30B1\u30FC\u30B7\u30E7\u30F3\u30E1\u30CB\u30E5\u30FC",
  Details: "\u8A73\u7D30",
  Draw: "\u63CF\u753B",
  Shapes: "\u56F3\u5F62",
  Select: "\u9078\u629E",
  Lasso: "\u6295\u3052\u7E04",
  Same: "\u540C\u8272",
  Similar: "\u8FD1\u4F3C\u8272",
  "COLOR": "\u30AB\u30E9\u30FC",
  "HEX": "16\u9032\u6570",
  "PROJECT": "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
  "Index 1 \xB7 local edit": "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B91 \xB7 \u30ED\u30FC\u30AB\u30EB\u7DE8\u96C6",
  "Reference Tile": "\u53C2\u7167\u30BF\u30A4\u30EB",
  "pending benchmark": "\u30D9\u30F3\u30C1\u30DE\u30FC\u30AF\u5F85\u3061",
  "Bounded Fill": "\u7BC4\u56F2\u5857\u308A\u3064\u3076\u3057",
  "Vertical axis": "\u5782\u76F4\u8EF8",
  "Horizontal axis": "\u6C34\u5E73\u8EF8",
  "Both axes": "\u4E21\u8EF8",
  "Opacity Ink": "\u4E0D\u900F\u660E\u5EA6\u30A4\u30F3\u30AF",
  "LOCAL SELECTION / TRANSFORM": "\u30ED\u30FC\u30AB\u30EB\u9078\u629E / \u5909\u5F62",
  "Selection Preview Contract": "\u9078\u629E\u30D7\u30EC\u30D3\u30E5\u30FC\u5951\u7D04",
  "LAZY ADVANCED TOOLS / WP-170": "\u9045\u5EF6\u8AAD\u307F\u8FBC\u307F\u9AD8\u5EA6\u30C4\u30FC\u30EB / WP-170",
  "Professional Pixel Art Features": "\u30D7\u30ED\u5411\u3051\u30D4\u30AF\u30BB\u30EB\u30A2\u30FC\u30C8\u6A5F\u80FD",
  "Load Advanced Tools": "\u9AD8\u5EA6\u30C4\u30FC\u30EB\u3092\u8AAD\u307F\u8FBC\u3080",
  "Pattern Preview": "\u30D1\u30BF\u30FC\u30F3\u30D7\u30EC\u30D3\u30E5\u30FC",
  "Stamp Preview": "\u30B9\u30BF\u30F3\u30D7\u30D7\u30EC\u30D3\u30E5\u30FC",
  "Mirror Plan": "\u30DF\u30E9\u30FC\u30D7\u30E9\u30F3",
  "ISOLATED RUNTIME PREVIEW / WP-160": "\u9694\u96E2\u30E9\u30F3\u30BF\u30A4\u30E0\u30D7\u30EC\u30D3\u30E5\u30FC / WP-160",
  "Draw \u2192 Play foundation": "\u63CF\u753B \u2192 \u518D\u751F\u57FA\u76E4",
  "Runtime bundle is unloaded": "\u30E9\u30F3\u30BF\u30A4\u30E0\u30D0\u30F3\u30C9\u30EB\u306F\u672A\u8AAD\u307F\u8FBC\u307F",
  "Advanced chunk is unloaded \xB7 Feature Flag OFF": "\u9AD8\u5EA6\u30C4\u30FC\u30EB\u306F\u672A\u8AAD\u307F\u8FBC\u307F \xB7 \u6A5F\u80FD\u30D5\u30E9\u30B0 OFF",
  "Project": "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
  "is open in isolated local mode.": "\u3092\u9694\u96E2\u30ED\u30FC\u30AB\u30EB\u30E2\u30FC\u30C9\u3067\u958B\u3044\u3066\u3044\u307E\u3059\u3002",
  Index: "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9",
  added: "\u8FFD\u52A0\u6E08\u307F",
  undo: "\u53D6\u308A\u6D88\u3057",
  Checker: "\u30C1\u30A7\u30C3\u30AB\u30FC",
  Square: "\u6B63\u65B9\u5F62",
  Preset: "\u30D7\u30EA\u30BB\u30C3\u30C8",
  Default: "\u6A19\u6E96",
  Replace: "\u7F6E\u63DB",
  Add: "\u8FFD\u52A0",
  Subtract: "\u6E1B\u7B97",
  Intersect: "\u4EA4\u5DEE",
  Move: "\u79FB\u52D5",
  "Flip horizontal": "\u5DE6\u53F3\u53CD\u8EE2",
  "Flip vertical": "\u4E0A\u4E0B\u53CD\u8EE2",
  "Rotate 90\xB0 CW": "\u53F3\u307890\xB0\u56DE\u8EE2",
  "Rotate 90\xB0 CCW": "\u5DE6\u307890\xB0\u56DE\u8EE2",
  "Rotate 180\xB0": "180\xB0\u56DE\u8EE2",
  "Scale nearest": "\u6700\u8FD1\u508D\u62E1\u5927\u7E2E\u5C0F",
  "Toggle Grid": "\u30B0\u30EA\u30C3\u30C9\u5207\u66FF",
  "Add Local Guide": "\u30ED\u30FC\u30AB\u30EB\u30AC\u30A4\u30C9\u8FFD\u52A0",
  "Canonical raster": "\u6B63\u898F\u30E9\u30B9\u30BF",
  "Overlay": "\u30AA\u30FC\u30D0\u30FC\u30EC\u30A4",
  "Compatibility": "\u4E92\u63DB\u6027",
  "Load / Start Preview": "\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u8AAD\u307F\u8FBC\u307F / \u958B\u59CB",
  "Pin Revision": "\u30EA\u30D3\u30B8\u30E7\u30F3\u56FA\u5B9A",
  "Refresh LIVE": "LIVE\u3092\u66F4\u65B0",
  "Ready \xB7 local export only": "\u6E96\u5099\u5B8C\u4E86 \xB7 \u30ED\u30FC\u30AB\u30EB\u66F8\u304D\u51FA\u3057\u306E\u307F",
  "Loop playback": "\u30EB\u30FC\u30D7\u518D\u751F",
  Tags: "\u30BF\u30B0",
  Markers: "\u30DE\u30FC\u30AB\u30FC",
  Audio: "\u30AA\u30FC\u30C7\u30A3\u30AA",
  "AUDIO DOCK": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30C9\u30C3\u30AF",
  TRACKS: "\u30C8\u30E9\u30C3\u30AF\u30EC\u30FC\u30F3",
  "Audio Dock": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30C9\u30C3\u30AF",
  "Audio workspace dock": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u30C9\u30C3\u30AF",
  "Add Audio dock panel": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30C9\u30C3\u30AF\u30D1\u30CD\u30EB\u3092\u8FFD\u52A0",
  "Track Navigator": "\u30C8\u30E9\u30C3\u30AF\u30CA\u30D3\u30B2\u30FC\u30BF\u30FC",
  Tracks: "\u30C8\u30E9\u30C3\u30AF\u4E00\u89A7",
  Track: "\u30C8\u30E9\u30C3\u30AF",
  "Audio lanes": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30EC\u30FC\u30F3",
  MUSIC: "\u97F3\u697D",
  SFX: "SE",
  VOICE: "\u30DC\u30A4\u30B9",
  INSTRUMENT: "\u697D\u5668",
  AUDIO: "\u30AA\u30FC\u30C7\u30A3\u30AA",
  iAUDIO: "iAUDIO",
  MIDI: "MIDI",
  BGM: "BGM",
  Keys: "\u9375\u76E4",
  Strings: "\u5F26\u697D\u5668",
  Mallets: "\u30DE\u30EC\u30C3\u30C8\u697D\u5668",
  Winds: "\u7BA1\u697D\u5668",
  Synth: "\u30B7\u30F3\u30BB\u30B5\u30A4\u30B6\u30FC",
  Percussion: "\u6253\u697D\u5668",
  Drums: "\u30C9\u30E9\u30E0\u97F3\u6E90",
  "\uFF0B Add": "\uFF0B \u8FFD\u52A0",
  "BGM \xB7 waveform": "BGM \xB7 \u6CE2\u5F62",
  "SFX \xB7 waveform": "SE \xB7 \u6CE2\u5F62",
  "Voice \xB7 waveform": "\u30DC\u30A4\u30B9 \xB7 \u6CE2\u5F62",
  waveform: "\u6CE2\u5F62",
  "Audio Track": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30C8\u30E9\u30C3\u30AF",
  "Instrument Track": "\u697D\u5668\u30C8\u30E9\u30C3\u30AF",
  "Drum Track": "\u30C9\u30E9\u30E0\u30C8\u30E9\u30C3\u30AF",
  "Waveform / recorded or imported audio": "\u6CE2\u5F62 / \u9332\u97F3\u307E\u305F\u306F\u8AAD\u307F\u8FBC\u307F\u97F3\u58F0",
  "MIDI notes \u2192 lightweight Web Audio voice": "MIDI\u30CE\u30FC\u30C8 \u2192 \u8EFD\u91CFWeb Audio\u97F3\u6E90",
  "Step grid for rhythm programming": "\u30EA\u30BA\u30E0\u5165\u529B\u7528\u30B9\u30C6\u30C3\u30D7\u30B0\u30EA\u30C3\u30C9",
  "Music waveform lane": "\u97F3\u697D\u6CE2\u5F62\u30EC\u30FC\u30F3",
  "Sound-effect waveform lane": "\u52B9\u679C\u97F3\u6CE2\u5F62\u30EC\u30FC\u30F3",
  "Voice / narration waveform lane": "\u30DC\u30A4\u30B9 / \u30CA\u30EC\u30FC\u30B7\u30E7\u30F3\u6CE2\u5F62\u30EC\u30FC\u30F3",
  "Drum Step": "\u30C9\u30E9\u30E0\u30B9\u30C6\u30C3\u30D7",
  "Piano Roll": "\u30D4\u30A2\u30CE\u30ED\u30FC\u30EB",
  "lightweight voice": "\u8EFD\u91CF\u97F3\u6E90",
  "Acoustic piano \xB7 lightweight voice": "\u30A2\u30B3\u30FC\u30B9\u30C6\u30A3\u30C3\u30AF\u30D4\u30A2\u30CE \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Soft piano layer \xB7 lightweight voice": "\u67D4\u3089\u304B\u306A\u30D4\u30A2\u30CE\u30EC\u30A4\u30E4\u30FC \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Warm electric keys \xB7 lightweight voice": "\u6E29\u304B\u306A\u30A8\u30EC\u30D4 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Sustained organ tone \xB7 lightweight voice": "\u6301\u7D9A\u3059\u308B\u30AA\u30EB\u30AC\u30F3\u97F3 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Bright percussive keys \xB7 lightweight voice": "\u660E\u308B\u3044\u6253\u9375\u97F3 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Guitar-style pluck \xB7 lightweight voice": "\u30AE\u30BF\u30FC\u98A8\u30D7\u30E9\u30C3\u30AF \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Electric guitar-style lead \xB7 lightweight voice": "\u30A8\u30EC\u30AD\u30AE\u30BF\u30FC\u98A8\u30EA\u30FC\u30C9 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Low bass voice \xB7 lightweight voice": "\u4F4E\u97F3\u30D9\u30FC\u30B9 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Ensemble string pad \xB7 lightweight voice": "\u30B9\u30C8\u30EA\u30F3\u30B0\u30B9\u30A2\u30F3\u30B5\u30F3\u30D6\u30EB \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Violin-style bowed voice \xB7 lightweight voice": "\u30D0\u30A4\u30AA\u30EA\u30F3\u98A8\u30DC\u30A6\u30A4\u30F3\u30B0 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Cello-style low strings \xB7 lightweight voice": "\u30C1\u30A7\u30ED\u98A8\u4F4E\u5F26 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Harp-style pluck \xB7 lightweight voice": "\u30CF\u30FC\u30D7\u98A8\u30D7\u30E9\u30C3\u30AF \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Marimba-style mallet tone \xB7 lightweight voice": "\u30DE\u30EA\u30F3\u30D0\u98A8\u30DE\u30EC\u30C3\u30C8\u97F3 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Kalimba-style pluck \xB7 lightweight voice": "\u30AB\u30EA\u30F3\u30D0\u98A8\u30D7\u30E9\u30C3\u30AF \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Vibraphone-style bell tone \xB7 lightweight voice": "\u30D3\u30D6\u30E9\u30D5\u30A9\u30F3\u98A8\u30D9\u30EB\u97F3 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Xylophone-style mallet tone \xB7 lightweight voice": "\u6728\u7434\u98A8\u30DE\u30EC\u30C3\u30C8\u97F3 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Celesta-style bell tone \xB7 lightweight voice": "\u30C1\u30A7\u30EC\u30B9\u30BF\u98A8\u30D9\u30EB\u97F3 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Tubular bell-style tone \xB7 lightweight voice": "\u30C1\u30E5\u30FC\u30D6\u30E9\u30FC\u30D9\u30EB\u98A8\u97F3\u8272 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Steel drum-style tone \xB7 lightweight voice": "\u30B9\u30C1\u30FC\u30EB\u30C9\u30E9\u30E0\u98A8\u97F3\u8272 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Flute-style breathy voice \xB7 lightweight voice": "\u30D5\u30EB\u30FC\u30C8\u98A8\u30D6\u30EC\u30B9\u97F3 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Clarinet-style reed voice \xB7 lightweight voice": "\u30AF\u30E9\u30EA\u30CD\u30C3\u30C8\u98A8\u30EA\u30FC\u30C9\u97F3 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Saxophone-style lead voice \xB7 lightweight voice": "\u30B5\u30C3\u30AF\u30B9\u98A8\u30EA\u30FC\u30C9 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Trumpet-style brass voice \xB7 lightweight voice": "\u30C8\u30E9\u30F3\u30DA\u30C3\u30C8\u98A8\u30D6\u30E9\u30B9\u97F3 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Brass section-style voice \xB7 lightweight voice": "\u30D6\u30E9\u30B9\u30BB\u30AF\u30B7\u30E7\u30F3\u98A8\u97F3\u8272 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Focused synth lead \xB7 lightweight voice": "\u82AF\u306E\u3042\u308B\u30B7\u30F3\u30BB\u30EA\u30FC\u30C9 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Soft synth pad \xB7 lightweight voice": "\u67D4\u3089\u304B\u306A\u30B7\u30F3\u30BB\u30D1\u30C3\u30C9 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Chip-tune pulse voice \xB7 lightweight voice": "\u30C1\u30C3\u30D7\u30C1\u30E5\u30FC\u30F3\u30D1\u30EB\u30B9 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Kick, snare, hat and percussion step grid": "\u30AD\u30C3\u30AF\u3001\u30B9\u30CD\u30A2\u3001\u30CF\u30A4\u30CF\u30C3\u30C8\u3001\u30D1\u30FC\u30AB\u30C3\u30B7\u30E7\u30F3\u7528\u30B9\u30C6\u30C3\u30D7\u30B0\u30EA\u30C3\u30C9",
  "Tambourine-style noise hit \xB7 lightweight voice": "\u30BF\u30F3\u30D0\u30EA\u30F3\u98A8\u30CE\u30A4\u30BA\u30D2\u30C3\u30C8 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Shaker-style noise hit \xB7 lightweight voice": "\u30B7\u30A7\u30A4\u30AB\u30FC\u98A8\u30CE\u30A4\u30BA\u30D2\u30C3\u30C8 \xB7 \u8EFD\u91CF\u97F3\u6E90",
  "Audio Project": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
  "Audio Project is not ready": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u306E\u6E96\u5099\u304C\u3067\u304D\u3066\u3044\u307E\u305B\u3093",
  "Audio Project is not loaded.": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u304C\u8AAD\u307F\u8FBC\u307E\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
  "Audio Assets & Samples": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30A2\u30BB\u30C3\u30C8\u3068\u30B5\u30F3\u30D7\u30EB",
  "Search audio assets": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30A2\u30BB\u30C3\u30C8\u3092\u691C\u7D22",
  "No local assets yet.": "\u30ED\u30FC\u30AB\u30EB\u30A2\u30BB\u30C3\u30C8\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002",
  "No inserts": "\u30A4\u30F3\u30B5\u30FC\u30C8\u306F\u3042\u308A\u307E\u305B\u3093",
  "Select a note, clip or track.": "\u30CE\u30FC\u30C8\u3001\u30AF\u30EA\u30C3\u30D7\u3001\u307E\u305F\u306F\u30C8\u30E9\u30C3\u30AF\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "Select audio track": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30C8\u30E9\u30C3\u30AF\u3092\u9078\u629E",
  "note lane": "\u30CE\u30FC\u30C8\u30EC\u30FC\u30F3",
  "Track: Piano": "\u30C8\u30E9\u30C3\u30AF: \u30D4\u30A2\u30CE\u97F3\u6E90",
  "Track: Drums": "\u30C8\u30E9\u30C3\u30AF: \u30C9\u30E9\u30E0\u97F3\u6E90",
  "Track: Sampler": "\u30C8\u30E9\u30C3\u30AF: \u30B5\u30F3\u30D7\u30E9\u30FC\u97F3\u6E90",
  "Audio Clip: Waveform": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30AF\u30EA\u30C3\u30D7: \u6CE2\u5F62",
  "Non-destructive clip view": "\u975E\u7834\u58CA\u30AF\u30EA\u30C3\u30D7\u8868\u793A",
  "Open Browser": "\u30D6\u30E9\u30A6\u30B6\u30FC\u3092\u958B\u304F",
  "Open Audio Clip editing": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30AF\u30EA\u30C3\u30D7\u7DE8\u96C6\u3092\u958B\u304F",
  "Open Clips to edit this waveform": "\u30AF\u30EA\u30C3\u30D7\u3092\u958B\u3044\u3066\u3053\u306E\u6CE2\u5F62\u3092\u7DE8\u96C6",
  "Select an Audio Clip to edit its waveform, fades and gain.": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30AF\u30EA\u30C3\u30D7\u3092\u9078\u629E\u3057\u3066\u6CE2\u5F62\u3001\u30D5\u30A7\u30FC\u30C9\u3001\u30B2\u30A4\u30F3\u3092\u7DE8\u96C6\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "Draw Preview: Audio-linked": "Draw\u30D7\u30EC\u30D3\u30E5\u30FC: Audio\u9023\u643A",
  "Draw bridge": "Draw\u9023\u643A",
  "Draw sync ready": "Draw\u540C\u671F\u6E96\u5099\u5B8C\u4E86",
  "Draw preview follows the Audio playhead.": "Draw\u30D7\u30EC\u30D3\u30E5\u30FC\u306FAudio\u306E\u518D\u751F\u30D8\u30C3\u30C9\u306B\u8FFD\u5F93\u3057\u307E\u3059\u3002",
  "Press Monitor or select a Draw frame to follow the Audio playhead.": "Monitor\u3092\u62BC\u3059\u304BDraw\u30D5\u30EC\u30FC\u30E0\u3092\u9078\u629E\u3059\u308B\u3068\u3001Audio\u306E\u518D\u751F\u30D8\u30C3\u30C9\u306B\u8FFD\u5F93\u3057\u307E\u3059\u3002",
  "Select a Draw frame or press Monitor to start the linked preview.": "Draw\u30D5\u30EC\u30FC\u30E0\u3092\u9078\u629E\u3059\u308B\u304BMonitor\u3092\u62BC\u3059\u3068\u9023\u643A\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u958B\u59CB\u3057\u307E\u3059\u3002",
  "Bar 1 selected \xB7 Shift-click to select a range": "\u5C0F\u7BC01\u3092\u9078\u629E\u4E2D \xB7 Shift\u30AF\u30EA\u30C3\u30AF\u3067\u7BC4\u56F2\u9078\u629E",
  "Bar 1 \xB7 1.1.1 \xB7 Draw sync ready": "\u5C0F\u7BC01 \xB7 1.1.1 \xB7 Draw\u540C\u671F\u6E96\u5099\u5B8C\u4E86",
  "MUSIC GRID \xB7 SYNCED": "\u97F3\u697D\u30B0\u30EA\u30C3\u30C9 \xB7 \u540C\u671F\u6E08\u307F",
  "Import MIDI": "MIDI\u3092\u8AAD\u307F\u8FBC\u307F",
  "Export MIDI": "MIDI\u3092\u66F8\u304D\u51FA\u3057",
  "MIDI Keyboard": "MIDI\u30AD\u30FC\u30DC\u30FC\u30C9",
  "MIDI Connected": "MIDI\u63A5\u7D9A\u6E08\u307F",
  "Mod Wheel \xB7 CC1": "\u30E2\u30B8\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3\u30DB\u30A4\u30FC\u30EB \xB7 CC1",
  "Expression \xB7 CC11": "\u30A8\u30AF\u30B9\u30D7\u30EC\u30C3\u30B7\u30E7\u30F3 \xB7 CC11",
  "Sustain \xB7 CC64": "\u30B5\u30B9\u30C6\u30A4\u30F3 \xB7 CC64",
  "Filter \xB7 CC74": "\u30D5\u30A3\u30EB\u30BF\u30FC \xB7 CC74",
  "Pitch Bend": "\u30D4\u30C3\u30C1\u30D9\u30F3\u30C9",
  "Tick-native \xB7 MIDI CC / pitch bend": "Tick\u57FA\u6E96 \xB7 MIDI CC / \u30D4\u30C3\u30C1\u30D9\u30F3\u30C9",
  "\uFF0B Point": "\uFF0B \u30DD\u30A4\u30F3\u30C8",
  "Routing diagnostics": "\u30EB\u30FC\u30C6\u30A3\u30F3\u30B0\u8A3A\u65AD",
  "Playback / graph": "\u518D\u751F / \u30B0\u30E9\u30D5",
  "Track FX": "\u30C8\u30E9\u30C3\u30AFFX",
  "Open FX editor below": "\u4E0B\u90E8\u306EFX\u30A8\u30C7\u30A3\u30BF\u30FC\u3092\u958B\u304F",
  Output: "\u51FA\u529B",
  Peak: "\u30D4\u30FC\u30AF",
  Gain: "\u30B2\u30A4\u30F3",
  Mute: "\u30DF\u30E5\u30FC\u30C8",
  Solo: "\u30BD\u30ED",
  Expression: "\u30A8\u30AF\u30B9\u30D7\u30EC\u30C3\u30B7\u30E7\u30F3",
  "Note length": "\u30CE\u30FC\u30C8\u9577",
  "Apply Swing": "\u30B9\u30A6\u30A3\u30F3\u30B0\u3092\u9069\u7528",
  Humanize: "\u30D2\u30E5\u30FC\u30DE\u30CA\u30A4\u30BA",
  Straight: "\u30B9\u30C8\u30EC\u30FC\u30C8",
  "Light 33%": "\u5F31\u3081 33%",
  "Triplet 66%": "3\u9023 66%",
  "1 bar": "1\u5C0F\u7BC0",
  "2 bars": "2\u5C0F\u7BC0",
  "Clear Bar": "\u5C0F\u7BC0\u3092\u30AF\u30EA\u30A2",
  More: "\u305D\u306E\u4ED6",
  Instrument: "\u697D\u5668",
  Mixer: "\u30DF\u30AD\u30B5\u30FC",
  Automation: "\u30AA\u30FC\u30C8\u30E1\u30FC\u30B7\u30E7\u30F3",
  FX: "\u30A8\u30D5\u30A7\u30AF\u30C8",
  Bar: "\u5C0F\u7BC0",
  Test: "\u30C6\u30B9\u30C8",
  Swing: "\u30B9\u30A6\u30A3\u30F3\u30B0",
  "DROP AUDIO CLIP": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30AF\u30EA\u30C3\u30D7\u3092\u30C9\u30ED\u30C3\u30D7",
  "DRUM ROLL": "\u30C9\u30E9\u30E0\u30ED\u30FC\u30EB",
  Split: "\u5206\u5272",
  "Crossfade \u2192": "\u30AF\u30ED\u30B9\u30D5\u30A7\u30FC\u30C9 \u2192",
  "Clip library opened \xB7 choose a Clip to edit gain, fades and split.": "\u30AF\u30EA\u30C3\u30D7\u30E9\u30A4\u30D6\u30E9\u30EA\u3092\u958B\u304D\u307E\u3057\u305F \xB7 \u30AF\u30EA\u30C3\u30D7\u3092\u9078\u3093\u3067\u30B2\u30A4\u30F3\u3001\u30D5\u30A7\u30FC\u30C9\u3001\u5206\u5272\u3092\u7DE8\u96C6\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "No Audio Clip yet \xB7 Browser opened so you can import one.": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30AF\u30EA\u30C3\u30D7\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093 \xB7 \u30D6\u30E9\u30A6\u30B6\u30FC\u3092\u958B\u3044\u305F\u306E\u3067\u8AAD\u307F\u8FBC\u3093\u3067\u304F\u3060\u3055\u3044\u3002",
  "Import an Audio Clip before editing its waveform": "\u6CE2\u5F62\u3092\u7DE8\u96C6\u3059\u308B\u524D\u306B\u30AA\u30FC\u30C7\u30A3\u30AA\u30AF\u30EA\u30C3\u30D7\u3092\u8AAD\u307F\u8FBC\u3093\u3067\u304F\u3060\u3055\u3044",
  "Unsaved \xB7 sliders are live in Preview": "\u672A\u4FDD\u5B58 \xB7 \u30B9\u30E9\u30A4\u30C0\u30FC\u306F\u30D7\u30EC\u30D3\u30E5\u30FC\u306B\u53CD\u6620\u4E2D",
  "Saved \xB7 Timeline / Preview / WAV linked": "\u4FDD\u5B58\u6E08\u307F \xB7 \u30BF\u30A4\u30E0\u30E9\u30A4\u30F3 / \u30D7\u30EC\u30D3\u30E5\u30FC / WAV\u306B\u9023\u643A",
  "Modeled base voice \xB7 Save as a custom preset": "\u57FA\u672C\u97F3\u8272\u30E2\u30C7\u30EB \xB7 \u30AB\u30B9\u30BF\u30E0\u30D7\u30EA\u30BB\u30C3\u30C8\u3068\u3057\u3066\u4FDD\u5B58",
  "WAV export ready": "WAV\u66F8\u304D\u51FA\u3057\u6E96\u5099\u5B8C\u4E86",
  "Preparing WAV render\u2026": "WAV\u30EC\u30F3\u30C0\u30EA\u30F3\u30B0\u6E96\u5099\u4E2D\u2026",
  "Export source tracks": "\u51FA\u529B\u3059\u308B\u30C8\u30E9\u30C3\u30AF",
  "Choose which BGM, SE, voice, or instrument lanes are included.": "\u51FA\u529B\u306B\u542B\u3081\u308BBGM\u3001SE\u3001\u30DC\u30A4\u30B9\u3001\u697D\u5668\u30EC\u30FC\u30F3\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "Select all": "\u3059\u3079\u3066\u9078\u629E",
  Clear: "\u30AF\u30EA\u30A2",
  "No audio tracks yet.": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30C8\u30E9\u30C3\u30AF\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002",
  "Audio Asset": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30A2\u30BB\u30C3\u30C8",
  "Master \xB7 all tracks": "\u30DE\u30B9\u30BF\u30FC \xB7 \u5168\u30C8\u30E9\u30C3\u30AF",
  "Selected music / SE tracks": "\u9078\u629E\u3057\u305F\u97F3\u697D / SE\u30C8\u30E9\u30C3\u30AF",
  "Stem (first track)": "\u30B9\u30C6\u30E0\uFF08\u5148\u982D\u30C8\u30E9\u30C3\u30AF\uFF09",
  "WAV Mix": "WAV\u30DF\u30C3\u30AF\u30B9",
  "WebM Audio (Opus)": "WebM Audio\uFF08Opus\uFF09",
  "Ogg Audio (Opus)": "Ogg Audio\uFF08Opus\uFF09",
  "WebM Draw + Audio": "WebM Draw\uFF0BAudio",
  "Saving\u2026": "\u4FDD\u5B58\u4E2D\u2026",
  "Save error": "\u4FDD\u5B58\u30A8\u30E9\u30FC",
  "Local only": "\u30ED\u30FC\u30AB\u30EB\u306E\u307F",
  "Ready \xB7 Local": "\u6E96\u5099\u5B8C\u4E86 \xB7 \u30ED\u30FC\u30AB\u30EB",
  "Restored \xB7 Local": "\u5FA9\u5143\u6E08\u307F \xB7 \u30ED\u30FC\u30AB\u30EB",
  "Saved \xB7 Local": "\u4FDD\u5B58\u6E08\u307F \xB7 \u30ED\u30FC\u30AB\u30EB",
  "Audio Project could not be restored \xB7 no silent playback was started": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3092\u5FA9\u5143\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F \xB7 \u7121\u97F3\u518D\u751F\u306F\u958B\u59CB\u3057\u3066\u3044\u307E\u305B\u3093",
  "Audio Project is not ready \xB7 nothing to copy": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u306E\u6E96\u5099\u304C\u3067\u304D\u3066\u3044\u307E\u305B\u3093 \xB7 \u30B3\u30D4\u30FC\u3059\u308B\u3082\u306E\u306F\u3042\u308A\u307E\u305B\u3093",
  "No automation points \xB7 choose a Tick and add one": "\u30AA\u30FC\u30C8\u30E1\u30FC\u30B7\u30E7\u30F3\u30DD\u30A4\u30F3\u30C8\u304C\u3042\u308A\u307E\u305B\u3093 \xB7 Tick\u3092\u9078\u3093\u3067\u8FFD\u52A0\u3057\u3066\u304F\u3060\u3055\u3044",
  "Open full Browser": "\u30D5\u30EB\u30D6\u30E9\u30A6\u30B6\u30FC\u3092\u958B\u304F",
  Browser: "\u30D6\u30E9\u30A6\u30B6\u30FC",
  Samples: "\u30B5\u30F3\u30D7\u30EB",
  Instruments: "\u697D\u5668",
  Presets: "\u30D7\u30EA\u30BB\u30C3\u30C8",
  assets: "\u30A2\u30BB\u30C3\u30C8",
  Show: "\u8868\u793A",
  "Search audio\u2026": "\u30AA\u30FC\u30C7\u30A3\u30AA\u3092\u691C\u7D22\u2026",
  "Close panel": "\u30D1\u30CD\u30EB\u3092\u9589\u3058\u308B",
  "Open Mixer": "\u30DF\u30AD\u30B5\u30FC\u3092\u958B\u304F",
  "Open Automation": "\u30AA\u30FC\u30C8\u30E1\u30FC\u30B7\u30E7\u30F3\u3092\u958B\u304F",
  "Open FX Chain": "FX\u30C1\u30A7\u30FC\u30F3\u3092\u958B\u304F",
  "Add BGM, SFX, Voice or instrument lane": "BGM\u3001SFX\u3001\u30DC\u30A4\u30B9\u3001\u307E\u305F\u306F\u697D\u5668\u30EC\u30FC\u30F3\u3092\u8FFD\u52A0",
  "INSPECTOR": "\u30A4\u30F3\u30B9\u30DA\u30AF\u30BF\u30FC",
  "LIBRARY": "\u30E9\u30A4\u30D6\u30E9\u30EA",
  "MASTER": "\u30DE\u30B9\u30BF\u30FC",
  "Audio Assets": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30A2\u30BB\u30C3\u30C8",
  "Electric Guitar": "\u30A8\u30EC\u30AD\u30AE\u30BF\u30FC",
  Piano: "\u30D4\u30A2\u30CE\u97F3\u6E90",
  "Piano 2": "\u30D4\u30A2\u30CE\u97F3\u6E902",
  "Electric Piano": "\u30A8\u30EC\u30AF\u30C8\u30EA\u30C3\u30AF\u30D4\u30A2\u30CE",
  Organ: "\u30AA\u30EB\u30AC\u30F3",
  Clavinet: "\u30AF\u30E9\u30D3\u30CD\u30C3\u30C8",
  Guitar: "\u30AE\u30BF\u30FC",
  Bass: "\u30D9\u30FC\u30B9",
  Violin: "\u30D0\u30A4\u30AA\u30EA\u30F3",
  Cello: "\u30C1\u30A7\u30ED",
  Harp: "\u30CF\u30FC\u30D7",
  Marimba: "\u30DE\u30EA\u30F3\u30D0",
  Kalimba: "\u30AB\u30EA\u30F3\u30D0",
  Vibraphone: "\u30D3\u30D6\u30E9\u30D5\u30A9\u30F3",
  Xylophone: "\u6728\u7434",
  Celesta: "\u30C1\u30A7\u30EC\u30B9\u30BF",
  "Tubular Bells": "\u30C1\u30E5\u30FC\u30D6\u30E9\u30FC\u30D9\u30EB",
  "Steel Drum": "\u30B9\u30C1\u30FC\u30EB\u30C9\u30E9\u30E0",
  Flute: "\u30D5\u30EB\u30FC\u30C8",
  Clarinet: "\u30AF\u30E9\u30EA\u30CD\u30C3\u30C8",
  Saxophone: "\u30B5\u30C3\u30AF\u30B9",
  Trumpet: "\u30C8\u30E9\u30F3\u30DA\u30C3\u30C8",
  Brass: "\u30D6\u30E9\u30B9",
  "Synth Lead": "\u30B7\u30F3\u30BB\u30EA\u30FC\u30C9",
  "Synth Pad": "\u30B7\u30F3\u30BB\u30D1\u30C3\u30C9",
  Chip: "\u30C1\u30C3\u30D7\u30C1\u30E5\u30FC\u30F3",
  Tambourine: "\u30BF\u30F3\u30D0\u30EA\u30F3",
  Shaker: "\u30B7\u30A7\u30A4\u30AB\u30FC",
  "Audio Timeline": "\u30AA\u30FC\u30C7\u30A3\u30AA\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3",
  "Audio feature flag is OFF. Audio track, offset, volume and waveform editing will be added in a later package.": "\u30AA\u30FC\u30C7\u30A3\u30AA\u6A5F\u80FD\u30D5\u30E9\u30B0\u306FOFF\u3067\u3059\u3002\u30AA\u30FC\u30C7\u30A3\u30AA\u30C8\u30E9\u30C3\u30AF\u3001\u30AA\u30D5\u30BB\u30C3\u30C8\u3001\u97F3\u91CF\u3001\u6CE2\u5F62\u7DE8\u96C6\u306F\u5F8C\u7D9A\u30D1\u30C3\u30B1\u30FC\u30B8\u3067\u8FFD\u52A0\u3057\u307E\u3059\u3002",
  Game: "\u30B2\u30FC\u30E0",
  Hitbox: "\u5F53\u305F\u308A\u5224\u5B9A",
  Note: "\u30E1\u30E2",
  Cel: "\u30BB\u30EB",
  "COMMAND PALETTE": "\u30B3\u30DE\u30F3\u30C9\u30D1\u30EC\u30C3\u30C8",
  KEYBOARD: "\u30AD\u30FC\u30DC\u30FC\u30C9",
  "Open Layers Panel": "\u30EC\u30A4\u30E4\u30FC\u30D1\u30CD\u30EB\u3092\u958B\u304F",
  "Open Color Panel": "\u30AB\u30E9\u30FC\u30D1\u30CD\u30EB\u3092\u958B\u304F",
  "Open Inspector": "\u30A4\u30F3\u30B9\u30DA\u30AF\u30BF\u3092\u958B\u304F",
  "Open Advanced Tools": "\u9AD8\u5EA6\u30C4\u30FC\u30EB\u3092\u958B\u304F",
  "Open Preview": "\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u958B\u304F",
  "Open Assets": "\u30A2\u30BB\u30C3\u30C8\u3092\u958B\u304F",
  "Open Export": "\u66F8\u304D\u51FA\u3057\u3092\u958B\u304F",
  selection: "\u9078\u629E",
  Selection: "\u9078\u629E",
  redo: "\u3084\u308A\u76F4\u3057",
  none: "\u306A\u3057",
  frame: "\u30D5\u30EC\u30FC\u30E0",
  layer: "\u30EC\u30A4\u30E4\u30FC",
  frames: "\u30D5\u30EC\u30FC\u30E0\u6570",
  layers: "\u30EC\u30A4\u30E4\u30FC\u6570",
  visible: "\u8868\u793A\u4E2D",
  onion: "\u30AA\u30CB\u30AA\u30F3",
  off: "\u30AA\u30D5",
  "Coming Later": "\u4ECA\u5F8C\u5BFE\u5FDC",
  "ASSET BROWSER": "\u30A2\u30BB\u30C3\u30C8\u30D6\u30E9\u30A6\u30B6\u30FC",
  "Copy selection": "\u9078\u629E\u3092\u30B3\u30D4\u30FC",
  "Cut selection": "\u9078\u629E\u3092\u5207\u308A\u53D6\u308A",
  "Rectangle selection": "\u77E9\u5F62\u9078\u629E",
  "Freehand selection": "\u81EA\u7531\u9078\u629E",
  "Pan viewport": "\u30D3\u30E5\u30FC\u30DD\u30FC\u30C8\u79FB\u52D5",
  "Cancel draft / preview": "\u4E0B\u66F8\u304D / \u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u30AD\u30E3\u30F3\u30BB\u30EB",
  Deselect: "\u9078\u629E\u89E3\u9664",
  "Temporarily add": "\u4E00\u6642\u8FFD\u52A0",
  "Temporarily subtract": "\u4E00\u6642\u6E1B\u7B97",
  "Toggle mirror on/off": "\u30DF\u30E9\u30FC\u306E\u30AA\u30F3\uFF0F\u30AA\u30D5",
  "Zoom in at pointer": "\u30DD\u30A4\u30F3\u30BF\u30FC\u4F4D\u7F6E\u3092\u62E1\u5927",
  "Zoom out": "\u7E2E\u5C0F",
  "Reset viewport zoom": "\u30D3\u30E5\u30FC\u30DD\u30FC\u30C8\u500D\u7387\u3092\u30EA\u30BB\u30C3\u30C8",
  "Add frame": "\u30D5\u30EC\u30FC\u30E0\u3092\u8FFD\u52A0",
  "Duplicate frame": "\u30D5\u30EC\u30FC\u30E0\u3092\u8907\u88FD",
  Editor: "\u30A8\u30C7\u30A3\u30BF\u30FC",
  "Canonical Operation": "\u6B63\u898F\u64CD\u4F5C",
  Canonical: "\u6B63\u898F",
  Raster: "\u30E9\u30B9\u30BF",
  Journal: "\u64CD\u4F5C\u5C65\u6B74",
  indexed: "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u578B",
  sparse: "\u758E\u884C\u5217\u578B",
  "one committed tool operation": "1\u56DE\u306E\u78BA\u5B9A\u30C4\u30FC\u30EB\u64CD\u4F5C",
  Grid: "\u30B0\u30EA\u30C3\u30C9",
  Ruler: "\u30EB\u30FC\u30E9\u30FC",
  Guide: "\u30AC\u30A4\u30C9",
  Reference: "\u53C2\u7167\u753B\u50CF",
  Slice: "\u30B9\u30E9\u30A4\u30B9",
  Stamp: "\u30B9\u30BF\u30F3\u30D7",
  Dither: "\u30C7\u30A3\u30B6\u30FC",
  toggle: "\u5207\u66FF",
  "does not rewrite pixels": "\u30D4\u30AF\u30BB\u30EB\u3092\u66F8\u304D\u63DB\u3048\u307E\u305B\u3093",
  Legacy: "\u65E7\u7248",
  current: "\u73FE\u884C",
  "remain lazy and unchanged": "\u9045\u5EF6\u8AAD\u307F\u8FBC\u307F\u306E\u307E\u307E\u5909\u66F4\u3057\u307E\u305B\u3093",
  Storage: "\u30B9\u30C8\u30EC\u30FC\u30B8",
  Revision: "\u30EA\u30D3\u30B8\u30E7\u30F3",
  Build: "\u30D3\u30EB\u30C9",
  Publish: "\u516C\u958B",
  "Asset Graph": "\u30A2\u30BB\u30C3\u30C8\u30B0\u30E9\u30D5",
  "Work Package": "\u4F5C\u696D\u30D1\u30C3\u30B1\u30FC\u30B8",
  Market: "\u30DE\u30FC\u30B1\u30C3\u30C8",
  Adapter: "\u30A2\u30C0\u30D7\u30BF\u30FC",
  "Tool": "\u30C4\u30FC\u30EB",
  "Layer 1": "\u30EC\u30A4\u30E4\u30FC1",
  "Canvas Region": "\u30AD\u30E3\u30F3\u30D0\u30B9\u9818\u57DF",
  "Timeline Region": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u9818\u57DF",
  "Frame numbers": "\u30D5\u30EC\u30FC\u30E0\u756A\u53F7",
  "Timeline controls": "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u64CD\u4F5C",
  "Select a layer": "\u30EC\u30A4\u30E4\u30FC\u3092\u9078\u629E",
  Blend: "\u30D6\u30EC\u30F3\u30C9",
  Mode: "\u63CF\u753B\u30E2\u30FC\u30C9",
  "Layer name": "\u30EC\u30A4\u30E4\u30FC\u540D",
  "blend mode": "\u30D6\u30EC\u30F3\u30C9\u30E2\u30FC\u30C9",
  Normal: "\u901A\u5E38",
  Multiply: "\u4E57\u7B97",
  Opacity: "\u4E0D\u900F\u660E\u5EA6",
  Visible: "\u8868\u793A",
  Lock: "\u30ED\u30C3\u30AF",
  visibility: "\u8868\u793A",
  "Hide layer": "\u30EC\u30A4\u30E4\u30FC\u3092\u975E\u8868\u793A",
  "Show layer": "\u30EC\u30A4\u30E4\u30FC\u3092\u8868\u793A",
  "Empty Cel": "\u7A7A\u306E\u30BB\u30EB",
  "Raster Cel": "\u30E9\u30B9\u30BF\u30BB\u30EB",
  "Add layer": "\u30EC\u30A4\u30E4\u30FC\u3092\u8FFD\u52A0",
  "Layer Track": "\u30EC\u30A4\u30E4\u30FC\u30C8\u30E9\u30C3\u30AF",
  selected: "\u9078\u629E\u4E2D",
  Loop: "\u30EB\u30FC\u30D7",
  Once: "\u4E00\u5EA6\u3060\u3051",
  Bounce: "\u30D0\u30A6\u30F3\u30C9",
  "Play once": "\u4E00\u5EA6\u3060\u3051\u518D\u751F",
  "Bounce playback": "\u30D0\u30A6\u30F3\u30C9\u518D\u751F",
  Onion: "\u30AA\u30CB\u30AA\u30F3",
  "Enable onion skin": "\u30AA\u30CB\u30AA\u30F3\u30B9\u30AD\u30F3\u3092\u6709\u52B9\u5316",
  "Disable onion skin": "\u30AA\u30CB\u30AA\u30F3\u30B9\u30AD\u30F3\u3092\u7121\u52B9\u5316",
  "Remove animation tag": "\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u30BF\u30B0\u3092\u524A\u9664",
  "Remove marker": "\u30DE\u30FC\u30AB\u30FC\u3092\u524A\u9664",
  "Linked to": "\u30EA\u30F3\u30AF\u5148",
  Frame: "\u30D5\u30EC\u30FC\u30E0",
  Layer: "\u30EC\u30A4\u30E4\u30FC",
  hidden: "\u975E\u8868\u793A",
  lock: "\u30ED\u30C3\u30AF",
  opacity: "\u4E0D\u900F\u660E\u5EA6",
  "No tags": "\u30BF\u30B0\u306A\u3057",
  "No markers on active frame": "\u30A2\u30AF\u30C6\u30A3\u30D6\u30D5\u30EC\u30FC\u30E0\u306B\u30DE\u30FC\u30AB\u30FC\u306A\u3057",
  "No local link": "\u30ED\u30FC\u30AB\u30EB\u30EA\u30F3\u30AF\u306A\u3057",
  "Link Cel": "\u30BB\u30EB\u3092\u30EA\u30F3\u30AF",
  "Unlink Cel": "\u30BB\u30EB\u306E\u30EA\u30F3\u30AF\u89E3\u9664",
  "Resize color and panel dock": "\u30AB\u30E9\u30FC\uFF0F\u30D1\u30CD\u30EB\u9818\u57DF\u306E\u5E45\u3092\u5909\u66F4",
  "Close panel sheet": "\u30D1\u30CD\u30EB\u9818\u57DF\u3092\u9589\u3058\u308B",
  "Pan viewport (H)": "\u30D3\u30E5\u30FC\u30DD\u30FC\u30C8\u79FB\u52D5 (H)",
  "Pen (P)": "\u30DA\u30F3 (P)",
  "Eraser (E)": "\u6D88\u3057\u30B4\u30E0 (E)",
  "Line (L)": "\u76F4\u7DDA (L)",
  "Rectangle (R)": "\u56DB\u89D2\u5F62 (R)",
  "Filled rectangle (Shift+R)": "\u5857\u308A\u3064\u3076\u3057\u56DB\u89D2\u5F62 (Shift+R)",
  "Ellipse (O)": "\u6955\u5186 (O)",
  "Filled ellipse (Shift+O)": "\u5857\u308A\u3064\u3076\u3057\u6955\u5186 (Shift+O)",
  "Fill (G)": "\u5857\u308A\u3064\u3076\u3057 (G)",
  "Eyedropper (I)": "\u30B9\u30DD\u30A4\u30C8 (I)",
  "Rectangle selection (M)": "\u77E9\u5F62\u9078\u629E (M)",
  "Select same color": "\u540C\u8272\u3092\u9078\u629E",
  "Select similar color": "\u8FD1\u4F3C\u8272\u3092\u9078\u629E",
  "Quick palette": "\u30AF\u30A4\u30C3\u30AF\u30D1\u30EC\u30C3\u30C8",
  "Palette colors": "\u30D1\u30EC\u30C3\u30C8\u30AB\u30E9\u30FC",
  "Workspace panels": "\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u30D1\u30CD\u30EB",
  "Tool options": "\u30C4\u30FC\u30EB\u30AA\u30D7\u30B7\u30E7\u30F3",
  "Brush presets": "\u30D6\u30E9\u30B7\u30D7\u30EA\u30BB\u30C3\u30C8",
  "Search commands": "\u30B3\u30DE\u30F3\u30C9\u3092\u691C\u7D22",
  Filter: "\u7D5E\u308A\u8FBC\u307F",
  Shortcuts: "\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8",
  "Canvas display": "\u30AD\u30E3\u30F3\u30D0\u30B9\u8868\u793A",
  Reset: "\u30EA\u30BB\u30C3\u30C8",
  Done: "\u5B8C\u4E86",
  "Create Canvas": "\u30AD\u30E3\u30F3\u30D0\u30B9\u3092\u4F5C\u6210",
  "Type a command": "\u30B3\u30DE\u30F3\u30C9\u3092\u5165\u529B",
  "Search shortcut or command": "\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u307E\u305F\u306F\u30B3\u30DE\u30F3\u30C9\u3092\u691C\u7D22",
  "Available workspace commands": "\u5229\u7528\u53EF\u80FD\u306A\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u30B3\u30DE\u30F3\u30C9",
  "Draw2 keyboard shortcuts": "iDRAW\u30AD\u30FC\u30DC\u30FC\u30C9\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8",
  "Virtualized animation timeline": "\u4EEE\u60F3\u5316\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3",
  "Visible timeline cells": "\u8868\u793A\u4E2D\u306E\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u30BB\u30EB",
  "Keyboard Shortcuts": "\u30AD\u30FC\u30DC\u30FC\u30C9\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8",
  "Command Palette": "\u30B3\u30DE\u30F3\u30C9\u30D1\u30EC\u30C3\u30C8",
  "Workspace Status": "\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u72B6\u614B",
  "How to Use Draw2": "iDRAW\u306E\u4F7F\u3044\u65B9",
  Commands: "\u30B3\u30DE\u30F3\u30C9",
  Rollback: "\u30ED\u30FC\u30EB\u30D0\u30C3\u30AF",
  "Open / Create": "\u958B\u304F / \u4F5C\u6210",
  "Create / Open local Project": "\u30ED\u30FC\u30AB\u30EB\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3092\u4F5C\u6210 / \u958B\u304F",
  "Project ID": "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8ID",
  Draft: "\u4E0B\u66F8\u304D",
  "Confirm selection": "\u9078\u629E\u3092\u78BA\u5B9A",
  "Cancel selection": "\u9078\u629E\u3092\u30AD\u30E3\u30F3\u30BB\u30EB",
  Commit: "\u78BA\u5B9A",
  Cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
  "Paste placement": "\u8CBC\u308A\u4ED8\u3051\u914D\u7F6E",
  "No matching shortcut": "\u4E00\u81F4\u3059\u308B\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u306F\u3042\u308A\u307E\u305B\u3093",
  "Selection cleared by clicking outside.": "\u9078\u629E\u7BC4\u56F2\u5916\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u305F\u305F\u3081\u9078\u629E\u3092\u89E3\u9664\u3057\u307E\u3057\u305F\u3002",
  "Language changed.": "\u8A00\u8A9E\u3092\u5909\u66F4\u3057\u307E\u3057\u305F\u3002"
};
var JA_TO_EN = Object.fromEntries(Object.entries(EN_TO_JA).map(([english, japanese]) => [
  japanese,
  english
]));
var SORTED_EN_TO_JA = Object.entries(EN_TO_JA).sort(([left], [right]) => right.length - left.length);
var SORTED_JA_TO_EN = Object.entries(JA_TO_EN).sort(([left], [right]) => right.length - left.length);
var TRANSLATION_CACHE_LIMIT = 512;
var translationCache = /* @__PURE__ */ new Map();
function normalizeDraw2Locale(value) {
  return value === "ja" ? "ja" : "en";
}
function translateDraw2Text(text, locale) {
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  const core2 = text.slice(leading.length, text.length - trailing.length || void 0);
  if (core2.length === 0) return text;
  const cacheKey = `${locale}\0${core2}`;
  const cached = translationCache.get(cacheKey);
  if (cached !== void 0) return `${leading}${cached}${trailing}`;
  const table = locale === "ja" ? EN_TO_JA : JA_TO_EN;
  const sortedTable = locale === "ja" ? SORTED_EN_TO_JA : SORTED_JA_TO_EN;
  const exact = table[core2];
  const translated = exact ?? sortedTable.reduce((value, [source, target]) => value.split(source).join(target), core2);
  if (translationCache.size >= TRANSLATION_CACHE_LIMIT) {
    const firstKey = translationCache.keys().next().value;
    if (typeof firstKey === "string") translationCache.delete(firstKey);
  }
  translationCache.set(cacheKey, translated);
  return `${leading}${translated}${trailing}`;
}

// src/draw2-export-registry.ts
var PNG_EXPORT_MAX_PIXELS = 4096 * 4096;
var PNG_EXPORT_MAX_DIMENSION = 8192;
var PNG_EXPORT_MAX_SCALE = 256;
var PNG_EXPORT_SCALE_PRESETS = Object.freeze([
  1,
  2,
  3,
  4,
  6,
  8,
  12,
  16,
  24,
  32,
  48,
  64,
  96,
  128,
  192,
  256
]);
function maxPngExportScale(width, height) {
  const safeWidth = Math.max(1, Math.floor(Number.isFinite(width) ? width : 1));
  const safeHeight = Math.max(1, Math.floor(Number.isFinite(height) ? height : 1));
  const sourcePixels = safeWidth * safeHeight;
  const byPixels = Math.floor(Math.sqrt(PNG_EXPORT_MAX_PIXELS / sourcePixels));
  const byDimension = Math.floor(PNG_EXPORT_MAX_DIMENSION / Math.max(safeWidth, safeHeight));
  return Math.max(1, Math.min(PNG_EXPORT_MAX_SCALE, byPixels, byDimension));
}
function pngExportScaleOptions(width, height) {
  const maxScale = maxPngExportScale(width, height);
  return PNG_EXPORT_SCALE_PRESETS.filter((scale) => scale <= maxScale);
}
var EXPORT_FORMATS = Object.freeze([
  {
    id: "png",
    category: "image",
    label: "PNG",
    description: "\u900F\u904E\u3092\u4FDD\u3063\u305F\u753B\u50CF",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "jpeg",
    category: "image",
    label: "JPEG",
    description: "\u8EFD\u91CF\u306A\u753B\u50CF",
    extension: "jpg",
    mimeType: "image/jpeg",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "webp",
    category: "image",
    label: "WebP",
    description: "\u8EFD\u91CF\u30FB\u900F\u904E\u5BFE\u5FDC\u306E\u753B\u50CF",
    extension: "webp",
    mimeType: "image/webp",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "avif",
    category: "image",
    label: "AVIF",
    description: "\u30D6\u30E9\u30A6\u30B6\u5BFE\u5FDC\u6642\u306E\u9AD8\u5727\u7E2E\u753B\u50CF",
    extension: "avif",
    mimeType: "image/avif",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "bmp",
    category: "image",
    label: "BMP",
    description: "\u4E92\u63DB\u6027\u91CD\u8996\u306E\u30D3\u30C3\u30C8\u30DE\u30C3\u30D7",
    extension: "bmp",
    mimeType: "image/bmp",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "tiff",
    category: "image",
    label: "TIFF",
    description: "\u5370\u5237\u30FB\u4FDD\u5B58\u5411\u3051\u306E\u9AD8\u54C1\u8CEA\u753B\u50CF",
    extension: "tiff",
    mimeType: "image/tiff",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "gif",
    category: "animation",
    label: "GIF",
    description: "\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u753B\u50CF",
    extension: "gif",
    mimeType: "image/gif",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "apng",
    category: "animation",
    label: "APNG",
    description: "\u900F\u904E\u5BFE\u5FDC\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3",
    extension: "apng",
    mimeType: "image/apng",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "webm",
    category: "animation",
    label: "WebM Draw + Audio",
    description: "Draw\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u3068\u9078\u629E\u3057\u305FAudio\u3092\u4E00\u4F53\u5316\u3057\u305F\u52D5\u753B",
    extension: "webm",
    mimeType: "video/webm",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "wav",
    category: "audio",
    label: "WAV Mix",
    description: "\u9078\u629E\u3057\u305FBGM\u30FBSE\u30FB\u697D\u5668\u3092\u542B\u3080\u975E\u5727\u7E2E\u30DF\u30C3\u30AF\u30B9",
    extension: "wav",
    mimeType: "audio/wav",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "audio-webm",
    category: "audio",
    label: "WebM Audio (Opus)",
    description: "\u9078\u629E\u3057\u305FBGM\u30FBSE\u30FB\u697D\u5668\u3092\u8EFD\u91CF\u306AOpus\u97F3\u58F0\u3067\u4FDD\u5B58",
    extension: "webm",
    mimeType: "audio/webm",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "audio-ogg",
    category: "audio",
    label: "Ogg Audio (Opus)",
    description: "\u5BFE\u5FDC\u30D6\u30E9\u30A6\u30B6\u3067\u9078\u629E\u3057\u305FAudio\u3092Ogg/Opus\u3067\u4FDD\u5B58",
    extension: "ogg",
    mimeType: "audio/ogg",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "svg",
    category: "image",
    label: "SVG",
    description: "\u30D9\u30AF\u30BF\u30FC\u753B\u50CF",
    extension: "svg",
    mimeType: "image/svg+xml",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "sprite-sheet",
    category: "animation",
    label: "Sprite Sheet",
    description: "\u5168\u30D5\u30EC\u30FC\u30E0\u3092\u4E26\u3079\u305F\u753B\u50CF",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "atlas-json",
    category: "animation",
    label: "Atlas metadata",
    description: "Sprite Sheet\u306E\u5EA7\u6A19\u30E1\u30BF\u30C7\u30FC\u30BF",
    extension: "json",
    mimeType: "application/json",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "tileset",
    category: "tiles",
    label: "Tileset",
    description: "\u30BF\u30A4\u30EB\u7D20\u6750\u3068\u914D\u7F6E\u60C5\u5831",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "pxd",
    category: "project",
    label: "PXD Project",
    description: "Draw / Audio / Game\u3092\u542B\u3080\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
    extension: "pxd",
    mimeType: "application/vnd.pixieed.pxd",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "glb",
    category: "game",
    label: "GLB",
    description: "3D\u30B2\u30FC\u30E0\u7D20\u6750\uFF08\u5C06\u6765\u5BFE\u5FDC\uFF09",
    extension: "glb",
    mimeType: "model/gltf-binary",
    visible: false,
    supported: false,
    supportsScale: false
  }
]);
var EXPORT_FORMAT_BY_ID = new Map(EXPORT_FORMATS.map((definition) => [
  definition.id,
  definition
]));
function exportFormatDefinition(id) {
  const definition = EXPORT_FORMAT_BY_ID.get(id);
  if (definition === void 0) {
    throw new Error(`Unknown Draw2 export format: ${id}`);
  }
  return definition;
}
function visibleExportFormats() {
  return EXPORT_FORMATS.filter((definition) => definition.visible);
}

// src/draw2-pixel-grid.ts
var DRAW2_CHECKER_CELL_SIZE_PX = 16;
var DRAW2_GRID_CELL_SIZE_PX = 1;
var DRAW2_GRID_MAJOR_STEP_PX = 8;
function projectCheckerCellSize(cellSize, zoom) {
  const safeCellSize = Math.max(1, Number.isFinite(cellSize) ? cellSize : DRAW2_CHECKER_CELL_SIZE_PX);
  const safeZoom = Math.max(0.01, Number.isFinite(zoom) ? zoom : 1);
  return Math.max(0.25, safeCellSize * safeZoom);
}
function formatPixelGridSvgCoord(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return Number(numeric.toFixed(3)).toString();
}
function buildPixelGridSvgPath(width, height, displayWidth, displayHeight, step = 1) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const safeDisplayWidth = Math.max(1, Number(displayWidth) || safeWidth);
  const safeDisplayHeight = Math.max(1, Number(displayHeight) || safeHeight);
  const safeStep = Math.max(1, Math.round(Number(step) || 1));
  const cellWidth = safeDisplayWidth / safeWidth;
  const cellHeight = safeDisplayHeight / safeHeight;
  const lineOffset = 0.5;
  const commands = [];
  for (let x = 0; x <= safeWidth; x += safeStep) {
    const screenX = x * cellWidth + lineOffset;
    commands.push(`M${formatPixelGridSvgCoord(screenX)} 0`, `V${formatPixelGridSvgCoord(safeDisplayHeight)}`);
  }
  for (let y = 0; y <= safeHeight; y += safeStep) {
    const screenY = y * cellHeight + lineOffset;
    commands.push(`M0 ${formatPixelGridSvgCoord(screenY)}`, `H${formatPixelGridSvgCoord(safeDisplayWidth)}`);
  }
  return commands.join(" ");
}
function getPixelGridOpacityForScale(scale, options = {}) {
  const normalizedScale = Math.max(Number(scale) || 1, 1);
  if (options.major !== true && normalizedScale < 2) return 0;
  const threshold = options.major === true ? 1 : 2;
  const range = options.major === true ? 7 : 4;
  const progress = Math.min(1, Math.max(0, (normalizedScale - threshold) / range));
  const eased = progress * progress * (3 - 2 * progress);
  const minimum = options.major === true ? 0.56 : 0.26;
  const maximum = options.major === true ? 0.96 : 0.74;
  return minimum + (maximum - minimum) * eased;
}
function projectPixelGridMetrics(rasterWidth, layoutWidthCssPx, viewportZoom2) {
  const safeRasterWidth = Math.max(1, Number.isFinite(rasterWidth) ? rasterWidth : 1);
  const safeLayoutWidth = Math.max(1, Number.isFinite(layoutWidthCssPx) ? layoutWidthCssPx : safeRasterWidth);
  const safeZoom = Math.max(0.5, Number.isFinite(viewportZoom2) ? viewportZoom2 : 1);
  const pixelStepCssPx = Math.max(0.25, safeLayoutWidth / safeRasterWidth * safeZoom * DRAW2_GRID_CELL_SIZE_PX);
  return {
    pixelStepCssPx,
    majorStepCssPx: pixelStepCssPx * DRAW2_GRID_MAJOR_STEP_PX
  };
}

// src/draw2-canvas-resize.ts
var ANCHOR_FRACTIONS = {
  TOP_LEFT: [
    0,
    0
  ],
  TOP: [
    0.5,
    0
  ],
  TOP_RIGHT: [
    1,
    0
  ],
  LEFT: [
    0,
    0.5
  ],
  CENTER: [
    0.5,
    0.5
  ],
  RIGHT: [
    1,
    0.5
  ],
  BOTTOM_LEFT: [
    0,
    1
  ],
  BOTTOM: [
    0.5,
    1
  ],
  BOTTOM_RIGHT: [
    1,
    1
  ]
};
function positiveDimension(value, name) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 4096) {
    throw new Error(`${name} must be an integer from 1 through 4096.`);
  }
  return value;
}
function calculateCanvasResizePlan(input) {
  const oldWidth = positiveDimension(input.oldWidth, "oldWidth");
  const oldHeight = positiveDimension(input.oldHeight, "oldHeight");
  const newWidth = positiveDimension(input.newWidth, "newWidth");
  const newHeight = positiveDimension(input.newHeight, "newHeight");
  const fraction = ANCHOR_FRACTIONS[input.anchor];
  if (fraction === void 0) throw new Error("Canvas resize anchor is invalid.");
  const offsetX = Math.round((newWidth - oldWidth) * fraction[0]);
  const offsetY = Math.round((newHeight - oldHeight) * fraction[1]);
  const sourceX = Math.max(0, -offsetX);
  const sourceY = Math.max(0, -offsetY);
  const destinationX = Math.max(0, offsetX);
  const destinationY = Math.max(0, offsetY);
  const copyWidth = Math.max(0, Math.min(oldWidth - sourceX, newWidth - destinationX));
  const copyHeight = Math.max(0, Math.min(oldHeight - sourceY, newHeight - destinationY));
  return {
    oldWidth,
    oldHeight,
    newWidth,
    newHeight,
    anchor: input.anchor,
    offsetX,
    offsetY,
    sourceX,
    sourceY,
    destinationX,
    destinationY,
    copyWidth,
    copyHeight
  };
}
function describeCanvasResizePlan(plan) {
  const growLeft = Math.max(0, plan.offsetX);
  const growRight = Math.max(0, plan.newWidth - plan.oldWidth - plan.offsetX);
  const growTop = Math.max(0, plan.offsetY);
  const growBottom = Math.max(0, plan.newHeight - plan.oldHeight - plan.offsetY);
  const cropLeft = Math.max(0, -plan.offsetX);
  const cropRight = Math.max(0, plan.oldWidth - plan.newWidth + plan.offsetX);
  const cropTop = Math.max(0, -plan.offsetY);
  const cropBottom = Math.max(0, plan.oldHeight - plan.newHeight + plan.offsetY);
  const horizontal = plan.newWidth >= plan.oldWidth ? `left +${growLeft}px \xB7 right +${growRight}px` : `left -${cropLeft}px \xB7 right -${cropRight}px`;
  const vertical = plan.newHeight >= plan.oldHeight ? `top +${growTop}px \xB7 bottom +${growBottom}px` : `top -${cropTop}px \xB7 bottom -${cropBottom}px`;
  return `${plan.oldWidth}\xD7${plan.oldHeight} \u2192 ${plan.newWidth}\xD7${plan.newHeight} \xB7 ${horizontal} \xB7 ${vertical}`;
}

// src/wp160-game-runtime-core.ts
function diagnostic4(code, message, recoverable, severity = "ERROR") {
  return {
    code,
    severity,
    message,
    recoverable
  };
}
function assertPositiveBytes(entry) {
  if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) throw new Error("Dependency byteLength must be a non-negative safe integer.");
}
async function createDependencySnapshot(packageId, packageVersion, entries, locked) {
  if (!packageVersion) throw new Error("Invalid dependency snapshot.");
  for (const entry of entries) assertPositiveBytes(entry);
  const id = asPackageId(packageId);
  const snapshotHash = await calculateDependencySnapshotHash(id, packageVersion, entries);
  return {
    packageId: id,
    packageVersion,
    entries: [
      ...entries
    ].sort((a, b) => a.assetId.localeCompare(b.assetId) || a.revisionId.localeCompare(b.revisionId)),
    snapshotHash,
    locked
  };
}
function dependencyEntry(session, assetId) {
  return session.dependencies.entries.find((entry) => entry.assetId === assetId);
}
function actionNames(inputMap, events) {
  const names = /* @__PURE__ */ new Set();
  for (const event of events) {
    for (const binding of inputMap.bindings) if (binding.source === event.source && binding.code === event.code && event.phase === "DOWN") names.add(binding.action);
  }
  return [
    ...names
  ].sort();
}
function nextActionStates(previous, actions) {
  const next = {
    ...previous
  };
  for (const action of actions) next[action] = true;
  for (const action of Object.keys(next)) if (!actions.includes(action)) next[action] = false;
  return next;
}
function sampleAnimation(clip, elapsedMs) {
  if (clip.frames.length === 0) return void 0;
  for (const frame2 of clip.frames) if (!Number.isFinite(frame2.durationMs) || frame2.durationMs <= 0) throw new Error("Animation frame durations must be positive.");
  const duration = clip.frames.reduce((sum, frame2) => sum + frame2.durationMs, 0);
  const position2 = clip.loop ? (Math.max(0, elapsedMs) % duration + duration) % duration : Math.min(Math.max(0, elapsedMs), duration - Number.EPSILON);
  let cursor = 0;
  for (const frame2 of clip.frames) {
    cursor += frame2.durationMs;
    if (position2 < cursor) return frame2.frameId;
  }
  return clip.frames[clip.frames.length - 1]?.frameId;
}
async function createRuntimePreview(options) {
  const runtime = options.runtime;
  const diagnostics = [];
  if (runtime.runtimeVersion !== options.supportedRuntimeVersion) diagnostics.push(diagnostic4("UNSUPPORTED_RUNTIME_VERSION", `Runtime ${runtime.runtimeVersion} is not supported by this preview.`, false));
  if (runtime.runtimeId.length === 0 || options.dependencies.entries.length === 0) diagnostics.push(diagnostic4("PACKAGE_INVALID", "Package manifest or dependency lock is invalid.", false));
  const calculatedHash = await calculateDependencySnapshotHash(options.dependencies.packageId, options.dependencies.packageVersion, options.dependencies.entries);
  if (calculatedHash !== options.dependencies.snapshotHash) diagnostics.push(diagnostic4("DEPENDENCY_LOCK_MISMATCH", "Dependency Snapshot hash does not match its canonical entries.", false));
  if (options.capabilities.graphics === "NONE") diagnostics.push(diagnostic4("RENDERER_UNAVAILABLE", "No supported renderer capability is available.", true, "WARNING"));
  if (!options.capabilities.audio) diagnostics.push(diagnostic4("AUDIO_UNAVAILABLE", "Audio capability is unavailable; audio presentation is disabled.", true, "WARNING"));
  const requestedRenderer = options.renderer ?? options.capabilities.graphics;
  const renderer2 = requestedRenderer === "WEBGPU" && (options.capabilities.graphics !== "WEBGPU" || !options.capabilities.webGpuBenefitMeasured) ? options.capabilities.graphics === "CANVAS2D" ? "CANVAS2D" : "NONE" : requestedRenderer === "CANVAS2D" && options.capabilities.graphics === "NONE" ? "NONE" : requestedRenderer;
  if (requestedRenderer === "WEBGPU" && renderer2 !== "WEBGPU") diagnostics.push(diagnostic4("RENDERER_UNAVAILABLE", "WebGPU was not selected without capability detection and measured benefit; fallback renderer retained.", true, "WARNING"));
  return {
    previewId: asGamePreviewId(options.previewId),
    projectId: asGameProjectId(options.projectId),
    projectRevisionId: options.projectRevisionId,
    packageId: asPackageId(options.packageId),
    packageVersion: options.packageVersion,
    runtime,
    dependencies: options.dependencies,
    capabilities: options.capabilities,
    inputMap: options.inputMap ?? {
      bindings: []
    },
    world: {
      schemaVersion: 1,
      tick: 0,
      elapsedMs: 0,
      actionStates: {},
      values: {}
    },
    presentation: {
      renderer: renderer2,
      audio: options.capabilities.audio ? "AVAILABLE" : "UNAVAILABLE"
    },
    loadedAssets: {},
    diagnostics,
    running: diagnostics.some((item) => !item.recoverable) === false
  };
}
async function loadRuntimeAssets(session, requests, resolver) {
  const loaded = {
    ...session.loadedAssets
  };
  const diagnostics = [
    ...session.diagnostics
  ];
  for (const request of requests) {
    const entry = dependencyEntry(session, request.assetId);
    if (entry === void 0) {
      diagnostics.push(diagnostic4(request.required ? "MISSING_REQUIRED_ASSET" : "OPTIONAL_ASSET_MISSING", `Asset ${request.assetId} is not declared by the locked dependency snapshot.`, !request.required));
      continue;
    }
    const payload = await resolver.resolve(request);
    if (payload === void 0) {
      diagnostics.push(diagnostic4(request.required ? "MISSING_REQUIRED_ASSET" : "OPTIONAL_ASSET_MISSING", `Asset ${request.assetId} could not be resolved.`, !request.required));
      continue;
    }
    if (payload.quarantined === true) {
      diagnostics.push(diagnostic4("ASSET_QUARANTINED", `Asset ${request.assetId} is quarantined and cannot be loaded.`, false));
      continue;
    }
    if (payload.revisionId !== entry.revisionId || payload.contentHash !== entry.contentHash) {
      diagnostics.push(diagnostic4("HASH_MISMATCH", `Asset ${request.assetId} does not match the locked Revision or Hash.`, false));
      continue;
    }
    loaded[request.assetId] = payload;
  }
  const failedRequired = diagnostics.some((item) => item.code === "MISSING_REQUIRED_ASSET" || item.code === "HASH_MISMATCH" || item.code === "ASSET_QUARANTINED");
  return {
    ...session,
    loadedAssets: loaded,
    diagnostics,
    running: session.running && !failedRequired
  };
}
function stepRuntime(session, deltaMs, input, animation) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error("Runtime delta must be a non-negative finite number.");
  if (!session.running) return {
    session,
    actions: [],
    presentationChanged: false
  };
  const actions = actionNames(session.inputMap, input);
  const world = {
    schemaVersion: 1,
    tick: session.world.tick + 1,
    elapsedMs: session.world.elapsedMs + deltaMs,
    actionStates: nextActionStates(session.world.actionStates, actions),
    values: session.world.values
  };
  const frameId = animation === void 0 ? session.presentation.frameId : sampleAnimation(animation, world.elapsedMs);
  const presentationChanged = frameId !== session.presentation.frameId;
  const presentation = frameId === void 0 ? {
    ...session.presentation
  } : {
    ...session.presentation,
    frameId
  };
  return {
    session: {
      ...session,
      world,
      presentation
    },
    actions,
    presentationChanged
  };
}

// src/wp200-game-runtime-core.ts
function diagnostic5(code, message, recoverable, severity = "ERROR") {
  return {
    code,
    severity,
    message,
    recoverable
  };
}
function safeText(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) throw new Error(`${label} must be a stable identifier.`);
}
function referenceKey(reference) {
  return `${reference.kind}:${reference.assetId}:${reference.revisionId}:${reference.contentHash}`;
}
function collectReferences(project) {
  const references = [];
  for (const scene of project.scenes) {
    for (const entity2 of scene.entities) {
      for (const component of entity2.components) {
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") references.push(component.asset);
      }
    }
  }
  return references.sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
}
function dependencyMatchesReference(reference, dependencies) {
  return dependencies.entries.some((entry) => entry.assetId === reference.assetId && entry.revisionId === reference.revisionId && entry.contentHash === reference.contentHash && entry.byteLength === reference.byteLength && entry.mimeType === reference.mimeType && entry.mode === reference.mode);
}
function validateReference(reference, diagnostics) {
  if (![
    "DRAW",
    "AUDIO"
  ].includes(reference.kind)) diagnostics.push(diagnostic5("PACKAGE_INVALID", "Game Asset reference kind is unsupported.", false));
  if (reference.provenance !== (reference.kind === "DRAW" ? "DRAW2" : "PIXIAUDIO")) diagnostics.push(diagnostic5("PACKAGE_INVALID", "Game Asset reference provenance does not match its kind.", false));
  if (!Number.isSafeInteger(reference.byteLength) || reference.byteLength < 0) diagnostics.push(diagnostic5("PACKAGE_INVALID", "Game Asset reference byteLength is invalid.", false));
  if (!reference.mimeType || reference.mimeType.includes("/") === false) diagnostics.push(diagnostic5("PACKAGE_INVALID", "Game Asset reference MIME type is invalid.", false));
  if (reference.mode === "LIVE" && reference.kind === "AUDIO") diagnostics.push(diagnostic5("PACKAGE_INVALID", "Audio LIVE references are preview-only and must not enter a locked Build.", true, "WARNING"));
}
function validateGameProject2(project) {
  const diagnostics = [];
  if (project.schemaVersion !== 1) diagnostics.push(diagnostic5("PACKAGE_INVALID", "Unknown Game Project schema version.", false));
  try {
    asGameProjectId(project.projectId);
    safeText(project.revisionId, "GameProjectRevisionId");
    safeText(project.packageVersion, "PackageVersion");
  } catch (error2) {
    diagnostics.push(diagnostic5("BUILD_INVALID_REQUEST", error2 instanceof Error ? error2.message : "Game Project identity is invalid.", false));
  }
  if (!project.name.trim()) diagnostics.push(diagnostic5("BUILD_INVALID_REQUEST", "Game Project name is required.", false));
  if (project.scenes.length === 0) diagnostics.push(diagnostic5("PACKAGE_INVALID", "Game Project requires at least one Scene.", false));
  if (!project.dependencies.locked) diagnostics.push(diagnostic5("DEPENDENCY_LOCK_MISMATCH", "Game Project requires a locked Dependency Snapshot for Runtime/Build use.", false));
  const sceneIds = /* @__PURE__ */ new Set();
  const entityIds = /* @__PURE__ */ new Set();
  const componentIds = /* @__PURE__ */ new Set();
  const actionIds = /* @__PURE__ */ new Set();
  for (const action of project.inputMap.actions) {
    try {
      safeText(action.actionId, "GameActionId");
    } catch (error2) {
      diagnostics.push(diagnostic5("BUILD_INVALID_REQUEST", error2 instanceof Error ? error2.message : "Action ID is invalid.", false));
    }
    if (actionIds.has(action.actionId)) diagnostics.push(diagnostic5("PACKAGE_INVALID", `Duplicate Game Action ${action.actionId}.`, false));
    actionIds.add(action.actionId);
    if (!action.bindings.length) diagnostics.push(diagnostic5("BUILD_INVALID_REQUEST", `Game Action ${action.actionId} has no binding.`, true, "WARNING"));
  }
  for (const scene of project.scenes) {
    try {
      safeText(scene.sceneId, "GameSceneId");
    } catch (error2) {
      diagnostics.push(diagnostic5("PACKAGE_INVALID", error2 instanceof Error ? error2.message : "Scene ID is invalid.", false));
    }
    if (sceneIds.has(scene.sceneId)) diagnostics.push(diagnostic5("PACKAGE_INVALID", `Duplicate Game Scene ${scene.sceneId}.`, false));
    sceneIds.add(scene.sceneId);
    const sceneEntityIds = new Set(scene.entities.map((entity2) => entity2.entityId));
    for (const rootId of scene.rootEntityIds) if (!sceneEntityIds.has(rootId)) diagnostics.push(diagnostic5("MISSING_REQUIRED_ASSET", `Scene root Entity ${rootId} is missing.`, false));
    for (const entity2 of scene.entities) {
      try {
        safeText(entity2.entityId, "GameEntityId");
      } catch (error2) {
        diagnostics.push(diagnostic5("PACKAGE_INVALID", error2 instanceof Error ? error2.message : "Entity ID is invalid.", false));
      }
      if (entityIds.has(entity2.entityId)) diagnostics.push(diagnostic5("PACKAGE_INVALID", `Duplicate Game Entity ${entity2.entityId}.`, false));
      entityIds.add(entity2.entityId);
      if (entity2.parentEntityId !== void 0 && !sceneEntityIds.has(entity2.parentEntityId)) diagnostics.push(diagnostic5("PACKAGE_INVALID", `Entity parent ${entity2.parentEntityId} is missing.`, false));
      for (const component of entity2.components) {
        try {
          safeText(component.componentId, "GameComponentId");
        } catch (error2) {
          diagnostics.push(diagnostic5("PACKAGE_INVALID", error2 instanceof Error ? error2.message : "Component ID is invalid.", false));
        }
        if (componentIds.has(component.componentId)) diagnostics.push(diagnostic5("PACKAGE_INVALID", `Duplicate Game Component ${component.componentId}.`, false));
        componentIds.add(component.componentId);
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") {
          validateReference(component.asset, diagnostics);
          if (!dependencyMatchesReference(component.asset, project.dependencies)) diagnostics.push(diagnostic5("DEPENDENCY_LOCK_MISMATCH", `Game Asset ${component.asset.assetId} is not present in the locked Dependency Snapshot.`, false));
        }
        if (component.type === "CONTROL" && !actionIds.has(component.actionId)) diagnostics.push(diagnostic5("BUILD_INVALID_REQUEST", `Control references unknown Action ${component.actionId}.`, false));
        if (component.type === "AUDIO_SOURCE" && (component.volume < 0 || component.volume > 1)) diagnostics.push(diagnostic5("BUILD_INVALID_REQUEST", `Audio volume for ${component.componentId} must be between 0 and 1.`, false));
      }
    }
    for (const entity2 of scene.entities) {
      const seenParents = /* @__PURE__ */ new Set();
      let parentId = entity2.parentEntityId;
      while (parentId !== void 0) {
        if (seenParents.has(parentId) || parentId === entity2.entityId) {
          diagnostics.push(diagnostic5("PACKAGE_INVALID", `Entity parent cycle includes ${entity2.entityId}.`, false));
          break;
        }
        seenParents.add(parentId);
        parentId = scene.entities.find((candidate) => candidate.entityId === parentId)?.parentEntityId;
      }
    }
  }
  for (const behavior of project.behaviors) {
    try {
      safeText(behavior.behaviorId, "GameBehaviorId");
    } catch (error2) {
      diagnostics.push(diagnostic5("PACKAGE_INVALID", error2 instanceof Error ? error2.message : "Behavior ID is invalid.", false));
    }
    for (const rule of behavior.rules) {
      if (!actionIds.has(rule.actionId)) diagnostics.push(diagnostic5("BUILD_INVALID_REQUEST", `Behavior references unknown Action ${rule.actionId}.`, false));
      for (const operation of rule.operations) if (!operation.key.trim()) diagnostics.push(diagnostic5("BUILD_INVALID_REQUEST", "Behavior operation key is required.", false));
    }
  }
  for (const reference of collectReferences(project)) {
    if (reference.mode === "PINNED" && !dependencyMatchesReference(reference, project.dependencies)) diagnostics.push(diagnostic5("DEPENDENCY_LOCK_MISMATCH", `Pinned Asset ${reference.assetId} is not locked.`, false));
  }
  return {
    valid: diagnostics.every((item) => item.severity !== "ERROR"),
    diagnostics
  };
}
async function createGameProjectRevision(input) {
  const validation = validateGameProject2(input);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => item.message).join(" "));
  const canonical = {
    ...input,
    snapshotHash: void 0
  };
  const snapshotHash = await hashCanonical(canonical);
  return {
    ...input,
    snapshotHash
  };
}
function gameInputActionMapToRuntime(inputMap) {
  return {
    bindings: inputMap.actions.flatMap((action) => action.bindings).sort((left, right) => `${left.action}:${left.source}:${left.code}`.localeCompare(`${right.action}:${right.source}:${right.code}`))
  };
}
function gameAssetRequests(project) {
  const unique = /* @__PURE__ */ new Map();
  for (const reference of collectReferences(project)) unique.set(String(reference.assetId), {
    assetId: reference.assetId,
    required: true,
    mode: reference.mode
  });
  return [
    ...unique.values()
  ].sort((left, right) => left.assetId.localeCompare(right.assetId));
}
function featureEnabled(flags, feature, killSwitch) {
  return killSwitch !== true && flags[feature] === true;
}
function appendFlagDiagnostic(diagnostics, feature) {
  diagnostics.push(diagnostic5("UNSUPPORTED_CAPABILITY", `Feature flag ${feature} is OFF; isolated Game/Runtime operation is unavailable.`, true, "WARNING"));
}
async function createGameRuntimePreview(options) {
  const validation = validateGameProject2(options.project);
  const diagnostics = [
    ...validation.diagnostics
  ];
  if (!featureEnabled(options.flags, "game-core-read", options.killSwitch)) appendFlagDiagnostic(diagnostics, "game-core-read");
  if (!featureEnabled(options.flags, "runtime-preview", options.killSwitch)) appendFlagDiagnostic(diagnostics, "runtime-preview");
  const runtimeBase = {
    previewId: options.previewId,
    projectId: options.project.projectId,
    projectRevisionId: options.project.revisionId,
    packageId: options.project.packageId,
    packageVersion: options.project.packageVersion,
    runtime: options.runtime,
    supportedRuntimeVersion: options.supportedRuntimeVersion,
    dependencies: options.project.dependencies,
    capabilities: options.capabilities,
    inputMap: options.inputMap ?? gameInputActionMapToRuntime(options.project.inputMap)
  };
  const runtime = options.renderer === void 0 ? await createRuntimePreview(runtimeBase) : await createRuntimePreview({
    ...runtimeBase,
    renderer: options.renderer
  });
  const allDiagnostics = [
    ...diagnostics,
    ...runtime.diagnostics
  ];
  const running = runtime.running && validation.valid && featureEnabled(options.flags, "game-core-read", options.killSwitch) && featureEnabled(options.flags, "runtime-preview", options.killSwitch);
  return {
    project: options.project,
    runtime: {
      ...runtime,
      running,
      diagnostics: allDiagnostics
    },
    sceneId: options.project.scenes[0]?.sceneId ?? "",
    runtimeValues: {},
    recovery: validation.valid && running ? "VALID" : "BLOCKED",
    diagnostics: allDiagnostics
  };
}
function applyBehaviorValues(project, previous, actions) {
  const next = {
    ...previous
  };
  const active = new Set(actions);
  const activeActionIds = new Set(project.inputMap.actions.filter((action) => action.bindings.some((binding) => active.has(binding.action))).map((action) => action.actionId));
  for (const behavior of project.behaviors) {
    for (const rule of behavior.rules) {
      if (!activeActionIds.has(rule.actionId)) continue;
      for (const operation of rule.operations) {
        if (operation.operation === "SET_VALUE") next[operation.key] = operation.value;
        const currentValue = next[operation.key];
        if (operation.operation === "ADD_VALUE" && typeof operation.value === "number" && typeof currentValue === "number") next[operation.key] = currentValue + operation.value;
        if (operation.operation === "ADD_VALUE" && typeof operation.value === "number" && next[operation.key] === void 0) next[operation.key] = operation.value;
      }
    }
  }
  return next;
}
function stepGameRuntime(session, deltaMs, input) {
  const stepped = stepRuntime(session.runtime, deltaMs, input);
  const runtimeValues = applyBehaviorValues(session.project, session.runtimeValues, stepped.actions);
  const nextRuntime = {
    ...stepped.session,
    world: {
      ...stepped.session.world,
      values: runtimeValues
    }
  };
  return {
    session: {
      ...session,
      runtime: nextRuntime,
      runtimeValues,
      diagnostics: nextRuntime.diagnostics
    },
    actions: stepped.actions,
    presentationChanged: stepped.presentationChanged
  };
}
async function loadGameRuntimeAssets(session, resolver) {
  const runtime = await loadRuntimeAssets(session.runtime, gameAssetRequests(session.project), resolver);
  const blocked = runtime.diagnostics.some((item) => !item.recoverable && [
    "MISSING_REQUIRED_ASSET",
    "HASH_MISMATCH",
    "ASSET_QUARANTINED"
  ].includes(item.code));
  return {
    ...session,
    runtime: {
      ...runtime,
      running: runtime.running && !blocked
    },
    recovery: blocked ? "BLOCKED" : session.recovery,
    diagnostics: runtime.diagnostics
  };
}
function stopGameRuntime(session) {
  return {
    ...session,
    runtime: {
      ...session.runtime,
      running: false
    }
  };
}
async function createGameDependencySnapshot(packageId, packageVersion, entries) {
  return createDependencySnapshot(packageId, packageVersion, entries, true);
}

// src/game/game-340/core.ts
function diagnostic6(code, path, message, recoverable = true) {
  return {
    code,
    path,
    message,
    recoverable
  };
}
function success(value) {
  return {
    ok: true,
    value,
    diagnostics: []
  };
}
function failure(...diagnostics) {
  return {
    ok: false,
    diagnostics
  };
}
function stable(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}
function resolveAssetBinding(binding, authority, caller) {
  const claim = [
    binding.projectId === String(caller.projectId) ? void 0 : diagnostic6("WRONG_PROJECT", "binding.projectId", "Asset binding belongs to another project."),
    binding.ownerId === String(caller.ownerId) ? void 0 : diagnostic6("WRONG_OWNER", "binding.ownerId", "Asset binding belongs to another owner."),
    binding.permission === "PREVIEW" || binding.permission === "READ" ? void 0 : diagnostic6("PERMISSION_DENIED", "binding.permission", "Preview permission is required.")
  ].filter((item) => item !== void 0);
  if (claim.length) return failure(...claim);
  if (!stable(binding.assetId) || !stable(binding.licenseId)) return failure(diagnostic6("INVALID_CLAIM", "binding", "Binding identifiers are invalid."));
  const matches = authority.filter((item) => item.projectId === binding.projectId && item.ownerId === binding.ownerId && item.kind === binding.kind && item.assetId === binding.assetId);
  if (matches.length === 0) return failure(diagnostic6("MISSING_ASSET", "binding.assetId", "Canonical asset revision is missing."));
  const current = matches.slice().sort((a, b) => a.revisionId.localeCompare(b.revisionId)).at(-1);
  const selected = binding.mode === "LIVE" ? current : matches.find((item) => item.revisionId === binding.revisionId);
  if (!selected) return failure(diagnostic6("STALE_REVISION", "binding.revisionId", "Requested asset revision is not canonical."));
  if (binding.mode === "LIVE" && (binding.revisionId !== void 0 || binding.contentHash !== void 0)) return failure(diagnostic6("INVALID_CLAIM", "binding", "LIVE cannot carry a caller revision or hash override."));
  if (binding.mode !== "LIVE" && binding.revisionId !== selected.revisionId) return failure(diagnostic6("REVISION_MISMATCH", "binding.revisionId", "Revision claim does not match canonical authority."));
  if (binding.contentHash !== void 0 && binding.contentHash !== selected.contentHash) return failure(diagnostic6("HASH_MISMATCH", "binding.contentHash", "Caller hash is not authoritative."));
  if (binding.licenseId !== selected.licenseId) return failure(diagnostic6("LICENSE_MISSING", "binding.licenseId", "License claim does not match canonical authority."));
  if (binding.mode === "REVIEW" && selected.reviewStatus !== "APPROVED") return failure(diagnostic6("REVIEW_REQUIRED", "binding.mode", "Review mode requires APPROVED authority."));
  if (binding.mode === "FORKED" && selected.forkId !== binding.forkId) return failure(diagnostic6("FORK_MISMATCH", "binding.forkId", "Fork binding does not match canonical authority."));
  return success({
    ...binding,
    revisionId: selected.revisionId,
    contentHash: selected.contentHash,
    licenseId: selected.licenseId
  });
}

// src/game/game-350/runtime-qualification.ts
function success2(value) {
  return {
    ok: true,
    value,
    diagnostics: []
  };
}
function failure2(...diagnostics) {
  return {
    ok: false,
    diagnostics
  };
}
function diagnostic7(code, path, message) {
  return {
    code,
    path,
    message
  };
}
function integrationDiagnosticCode(code) {
  if (code === "HASH_MISMATCH") return "HASH_MISMATCH";
  if (code === "REVISION_MISMATCH" || code === "STALE_REVISION") return "REVISION_MISMATCH";
  if (code === "WRONG_PROJECT" || code === "WRONG_OWNER") return "PROJECT_ASSET_MISMATCH";
  if (code === "MISSING_ASSET") return "MISSING_ASSET";
  if (code === "MODE_MISMATCH") return "MODE_MISMATCH";
  return "INVALID_MANIFEST";
}
function resultFromIntegration(result) {
  return result.ok && result.value !== void 0 ? success2(result.value) : failure2(...result.diagnostics.map((item) => diagnostic7(integrationDiagnosticCode(item.code), item.path, item.message)));
}
function runtimeValidationCode(item) {
  if (item.code === "HASH_MISMATCH") return "HASH_MISMATCH";
  if (item.code === "DEPENDENCY_LOCK_MISMATCH") return item.message.includes("requires a locked Dependency Snapshot") ? "INVALID_MANIFEST" : "HASH_MISMATCH";
  if (item.code === "BUILD_INVALID_REQUEST" && item.message.includes("Behavior references unknown Action")) return "UNSUPPORTED_BEHAVIOR";
  if (item.code === "BUILD_INVALID_REQUEST" && item.message.includes("Control references unknown Action")) return "UNKNOWN_INPUT_MAPPING";
  return "INVALID_MANIFEST";
}
function validateRuntimeManifest(project) {
  try {
    const validation = validateGameProject2(project);
    if (validation.valid) return success2(project);
    const first = validation.diagnostics.find((item) => item.severity === "ERROR") ?? validation.diagnostics[0];
    if (first === void 0) return failure2(diagnostic7("INVALID_MANIFEST", "project", "Runtime Project manifest is invalid."));
    return failure2(diagnostic7(runtimeValidationCode(first), "project", validation.diagnostics.map((item) => item.message).join(" ")));
  } catch (error2) {
    return failure2(diagnostic7("INVALID_MANIFEST", "project", error2 instanceof Error ? error2.message : "Runtime Project manifest is malformed."));
  }
}
function resolveRuntimeIdentity(request) {
  if (request.project === void 0 || request.project === null) return failure2(diagnostic7("MISSING_PROJECT", "project", "Runtime Project is required."));
  if (typeof request.project !== "object" || Array.isArray(request.project)) return failure2(diagnostic7("INVALID_MANIFEST", "project", "Runtime Project manifest must be an object."));
  const project = request.project;
  if (project.projectId !== request.projectId) return failure2(diagnostic7("WRONG_PROJECT", "projectId", "Runtime Project identity does not match the requested Project."));
  const manifest = validateRuntimeManifest(project);
  if (!manifest.ok || manifest.value === void 0) return failure2(...manifest.diagnostics);
  const scene = project.scenes.find((candidate) => candidate.sceneId === request.sceneId);
  if (!scene) return failure2(diagnostic7("MISSING_SCENE", "sceneId", "Requested Scene is not part of the canonical Project."));
  if (request.entityId !== void 0 && !scene.entities.some((entity2) => entity2.entityId === request.entityId)) {
    return failure2(diagnostic7("WRONG_ENTITY", "entityId", "Requested Entity is not a member of the requested canonical Scene."));
  }
  return success2({
    project,
    sceneId: scene.sceneId,
    ...request.entityId === void 0 ? {} : {
      entityId: request.entityId
    }
  });
}
function runtimeAssetCacheKey(reference, identity = {
  projectId: "UNBOUND",
  ownerId: "UNBOUND"
}) {
  if (reference.mode === "LIVE") return [
    identity.projectId,
    identity.ownerId,
    reference.kind,
    String(reference.assetId),
    "LIVE"
  ].join(":");
  return [
    identity.projectId,
    identity.ownerId,
    reference.kind,
    String(reference.assetId),
    "PINNED",
    String(identity.revisionId ?? reference.revisionId),
    String(identity.contentHash ?? reference.contentHash)
  ].join(":");
}
function createGame350AssetRegistryAdapter(authority, options = {}) {
  const maxEntries = Math.max(1, Math.floor(options.maxCacheEntries ?? 64));
  const byAsset = /* @__PURE__ */ new Map();
  const byAssetAnyOwner = /* @__PURE__ */ new Map();
  const cache = /* @__PURE__ */ new Map();
  const liveRevisionByIdentity = /* @__PURE__ */ new Map();
  const assetKey = (kind, assetId) => `${kind}:${assetId}`;
  const indexAuthority = (items) => {
    byAsset.clear();
    byAssetAnyOwner.clear();
    for (const item of items) {
      const key = `${item.projectId}:${item.ownerId}:${assetKey(item.kind, item.assetId)}`;
      const existing = byAsset.get(key) ?? [];
      existing.push(item);
      byAsset.set(key, existing);
      const anyOwner = byAssetAnyOwner.get(assetKey(item.kind, item.assetId)) ?? [];
      anyOwner.push(item);
      byAssetAnyOwner.set(assetKey(item.kind, item.assetId), anyOwner);
    }
  };
  indexAuthority(authority);
  const cacheGet = (key) => {
    const value = cache.get(key);
    if (value !== void 0) {
      cache.delete(key);
      cache.set(key, value);
    }
    return value;
  };
  const cacheSet = (key, value) => {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  };
  return {
    resolve(reference, context) {
      if (reference.mode !== "LIVE" && reference.mode !== "PINNED") return failure2(diagnostic7("MODE_MISMATCH", "reference.mode", "Runtime accepts only LIVE or PINNED asset references."));
      const sameAsset = byAssetAnyOwner.get(assetKey(reference.kind, String(reference.assetId))) ?? [];
      if (sameAsset.length > 0 && !sameAsset.some((item) => item.projectId === context.projectId && item.ownerId === context.ownerId)) {
        return failure2(diagnostic7("PROJECT_ASSET_MISMATCH", "context.projectId", "Runtime Asset authority belongs to another Project or owner."));
      }
      const candidates = byAsset.get(`${context.projectId}:${context.ownerId}:${assetKey(reference.kind, String(reference.assetId))}`) ?? [];
      if (candidates.length === 0) return failure2(diagnostic7("MISSING_ASSET", "reference.assetId", "Canonical asset revision is missing."));
      const caller = {
        projectId: asProjectId(context.projectId),
        ownerId: asOwnerId(context.ownerId),
        revisionId: asRevisionId(context.revisionId)
      };
      let pinnedContentHash;
      if (reference.mode === "PINNED") {
        try {
          pinnedContentHash = asSha2562(String(reference.contentHash));
        } catch {
          return failure2(diagnostic7("HASH_MISMATCH", "reference.contentHash", "Pinned Runtime Asset hash is not a valid SHA-256 value."));
        }
      }
      const binding = {
        componentId: `runtime:${reference.kind}:${String(reference.assetId)}`,
        projectId: context.projectId,
        ownerId: context.ownerId,
        kind: reference.kind,
        assetId: String(reference.assetId),
        mode: reference.mode,
        ...reference.mode === "PINNED" ? {
          revisionId: String(reference.revisionId),
          contentHash: pinnedContentHash
        } : {},
        licenseId: context.licenseByAsset[String(reference.assetId)] ?? "",
        permission: "READ"
      };
      const current = candidates.slice().sort((a, b) => a.revisionId.localeCompare(b.revisionId)).at(-1);
      if (context.licenseByAsset[String(reference.assetId)] !== current.licenseId) {
        return failure2(diagnostic7("INVALID_MANIFEST", "context.licenseByAsset", "Runtime Asset license claim does not match canonical authority."));
      }
      const cacheIdentity = {
        projectId: context.projectId,
        ownerId: context.ownerId,
        revisionId: reference.revisionId,
        contentHash: String(reference.contentHash)
      };
      const liveKey = runtimeAssetCacheKey(reference, cacheIdentity);
      if (reference.mode === "LIVE") {
        const previousRevision = liveRevisionByIdentity.get(liveKey);
        if (previousRevision !== void 0 && previousRevision !== current.revisionId) cache.delete(liveKey);
        liveRevisionByIdentity.set(liveKey, current.revisionId);
      }
      const cacheKey = liveKey;
      const cached = cacheGet(cacheKey);
      if (cached !== void 0) return success2(cached);
      const resolved = resultFromIntegration(resolveAssetBinding(binding, candidates, caller));
      if (!resolved.ok || resolved.value === void 0) return resolved;
      const value = {
        kind: resolved.value.kind,
        assetId: resolved.value.assetId,
        revisionId: resolved.value.revisionId,
        contentHash: resolved.value.contentHash,
        licenseId: resolved.value.licenseId,
        mode: reference.mode
      };
      cacheSet(cacheKey, value);
      return success2(value);
    },
    replaceAuthority: (nextAuthority) => {
      indexAuthority(nextAuthority);
    },
    cacheSnapshot: () => ({
      size: cache.size,
      maxEntries
    }),
    clear: () => {
      cache.clear();
      liveRevisionByIdentity.clear();
    },
    clearProject: (projectId, ownerId) => {
      let removed = 0;
      for (const key of [
        ...cache.keys()
      ]) {
        const parts = key.split(":");
        if (parts[0] === projectId && (ownerId === void 0 || parts[1] === ownerId)) {
          cache.delete(key);
          removed += 1;
        }
      }
      for (const key of [
        ...liveRevisionByIdentity.keys()
      ]) {
        const parts = key.split(":");
        if (parts[0] === projectId && (ownerId === void 0 || parts[1] === ownerId)) liveRevisionByIdentity.delete(key);
      }
      return removed;
    }
  };
}
function prepareGame350Composition(request) {
  const identity = resolveRuntimeIdentity({
    project: request.project,
    projectId: String(request.project.projectId),
    sceneId: request.sceneId,
    ...request.entityId === void 0 ? {} : {
      entityId: request.entityId
    }
  });
  if (!identity.ok || identity.value === void 0) return failure2(...identity.diagnostics);
  const project = identity.value.project;
  const scene = project.scenes.find((item) => item.sceneId === identity.value.sceneId);
  const entity2 = identity.value.entityId === void 0 ? void 0 : scene.entities.find((item) => item.entityId === identity.value.entityId);
  const references = (entity2 ? [
    entity2
  ] : scene.entities).flatMap((item) => item.components.flatMap((component) => {
    if (component.type !== "SPRITE" && component.type !== "ANIMATION" && component.type !== "AUDIO_SOURCE") return [];
    return [
      {
        componentId: String(component.componentId),
        reference: component.asset
      }
    ];
  }));
  const assets = [];
  const context = {
    projectId: String(project.projectId),
    ownerId: request.ownerId,
    revisionId: String(project.revisionId),
    licenseByAsset: request.licenseByAsset
  };
  for (const item of references) {
    const resolved = request.adapter.resolve(item.reference, context);
    if (!resolved.ok || resolved.value === void 0) return failure2(...resolved.diagnostics);
    assets.push({
      componentId: item.componentId,
      reference: item.reference,
      resolved: resolved.value
    });
  }
  return success2({
    identity: {
      projectId: String(project.projectId),
      ownerId: request.ownerId,
      revisionId: String(project.revisionId),
      projectHash: asSha2562(String(project.snapshotHash))
    },
    sceneId: String(identity.value.sceneId),
    ...identity.value.entityId === void 0 ? {} : {
      entityId: String(identity.value.entityId)
    },
    assets
  });
}
function createGame350RuntimeSnapshot(composition, tick = 0) {
  return {
    tick,
    sceneId: composition.sceneId,
    resolvedAssetCount: composition.assets.length,
    assetIds: composition.assets.map((item) => item.resolved.assetId)
  };
}
function createRuntimeLifecycleController() {
  let activeSession;
  let instanceCount = 0;
  let active = false;
  const snapshot = () => ({
    active,
    instanceCount,
    listenerCount: active ? 1 : 0,
    timerCount: active ? 1 : 0,
    animationLoopCount: active ? 1 : 0,
    ...activeSession === void 0 ? {} : {
      session: activeSession
    }
  });
  return {
    start(session) {
      if (active) return failure2(diagnostic7("RUNTIME_ALREADY_RUNNING", "runtime", "Runtime start is idempotent and refuses a duplicate active instance."));
      activeSession = session;
      active = true;
      instanceCount += 1;
      return success2(snapshot());
    },
    stop() {
      if (activeSession !== void 0) activeSession = {
        ...stopGameRuntime(activeSession),
        recovery: "RECOVERED"
      };
      active = false;
      return snapshot();
    },
    reload(session) {
      activeSession = session;
      active = true;
      instanceCount += 1;
      return snapshot();
    },
    snapshot
  };
}

// src/game/game-350/product-path.ts
function failure3(...diagnostics) {
  return {
    ok: false,
    diagnostics
  };
}
function errorDiagnostic(message, path = "runtime") {
  return {
    code: "INVALID_MANIFEST",
    path,
    message
  };
}
async function startGame350ProductPreview(options) {
  let resolveCount = 0;
  const adapterBase = createGame350AssetRegistryAdapter(options.authority);
  const adapter = {
    ...adapterBase,
    resolve(reference, context) {
      resolveCount += 1;
      return adapterBase.resolve(reference, context);
    }
  };
  const beforeStart = resolveCount;
  const prepared = prepareGame350Composition({
    project: options.project,
    ownerId: options.ownerId,
    sceneId: options.sceneId,
    ...options.entityId === void 0 ? {} : {
      entityId: options.entityId
    },
    adapter,
    licenseByAsset: options.licenseByAsset
  });
  if (!prepared.ok || prepared.value === void 0) return failure3(...prepared.diagnostics);
  try {
    let session = await createGameRuntimePreview({
      project: options.project,
      previewId: options.previewId,
      runtime: options.runtime,
      supportedRuntimeVersion: options.supportedRuntimeVersion,
      capabilities: options.capabilities,
      flags: {
        "game-core-read": true,
        "runtime-preview": true,
        "runtime-execution": true
      },
      killSwitch: false,
      ...options.renderer === void 0 ? {} : {
        renderer: options.renderer
      }
    });
    const preparedByAsset = new Map(prepared.value.assets.map((item) => [
      item.resolved.assetId,
      item
    ]));
    const resolver = {
      resolve: async (request) => {
        const preparedAsset = preparedByAsset.get(String(request.assetId));
        if (preparedAsset === void 0) return void 0;
        return options.payloadResolver.resolve(request);
      }
    };
    session = await loadGameRuntimeAssets(session, resolver);
    const lifecycle = createRuntimeLifecycleController();
    const started = lifecycle.start(session);
    if (!started.ok || started.value === void 0) return failure3(...started.diagnostics);
    const loadedSession = session;
    let current = session;
    let steps = 0;
    const product = {
      get session() {
        return current;
      },
      composition: prepared.value,
      get snapshot() {
        return createGame350RuntimeSnapshot(prepared.value, current.runtime.world.tick);
      },
      lifecycle,
      get lifecycleSnapshot() {
        return lifecycle.snapshot();
      },
      get resolution() {
        return {
          resolveCountBeforeStart: beforeStart,
          resolveCountAfterStart: resolveCount,
          resolveCountAfterSteps: resolveCount,
          steps
        };
      },
      step(deltaMs, input = []) {
        const result = stepGameRuntime(current, deltaMs, input);
        current = result.session;
        steps += 1;
        return current;
      },
      stop() {
        current = stopGameRuntime(current);
        return lifecycle.stop();
      },
      reload() {
        current = loadedSession;
        const result = lifecycle.reload(current);
        return result;
      }
    };
    return {
      ok: true,
      value: product,
      diagnostics: []
    };
  } catch (error2) {
    return failure3(errorDiagnostic(error2 instanceof Error ? error2.message : "GAME-350 Runtime preview could not start."));
  }
}

// src/game/game-310/core.ts
var asActionId = (value) => asIdentifier(value, "actionId");
function asIdentifier(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) throw new Error(`${label} must be a stable identifier.`);
  return value;
}

// src/game/game-350/runtime-core.ts
var GAME_RUNTIME_CORE_SCHEMA_VERSION = 1;
var GAME_RUNTIME_PROFILE_SCHEMA_VERSION2 = 1;
var GAME_RUNTIME_PROFILE_IDS = Object.freeze({
  TOP_DOWN_RPG: "top-down-rpg",
  ACTION_2D: "action-2d",
  SHOOTER_2D: "shooter-2d",
  RACING_2D: "racing-2d",
  RHYTHM: "rhythm",
  ACTION_3D: "action-3d",
  OPEN_WORLD_3D: "open-world-3d",
  INTERACTIVE_3D: "interactive-3d"
});
var BUILT_IN_PROFILES = Object.freeze([
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG,
    genre: "TOP_DOWN_RPG",
    label: "Top-down RPG",
    dimension: "2D",
    executionModel: "FIXED_STEP",
    status: "AVAILABLE",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "COLLISION_2D",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.ACTION_2D,
    genre: "ACTION_2D",
    label: "2D Action",
    dimension: "2D",
    executionModel: "FIXED_STEP",
    status: "FOUNDATION",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_2D",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.SHOOTER_2D,
    genre: "SHOOTER_2D",
    label: "2D Shooter",
    dimension: "2D",
    executionModel: "FIXED_STEP",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_2D",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.RACING_2D,
    genre: "RACING_2D",
    label: "2D Racing",
    dimension: "2D",
    executionModel: "CONTINUOUS_PHYSICS",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_2D",
      "VEHICLE_PHYSICS",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.RHYTHM,
    genre: "RHYTHM",
    label: "Rhythm",
    dimension: "2D",
    executionModel: "AUDIO_CLOCK",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "AUDIO_TIMELINE",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.ACTION_3D,
    genre: "ACTION_3D",
    label: "3D Action",
    dimension: "3D",
    executionModel: "CONTINUOUS_PHYSICS",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_3D",
      "SAVE_STATE",
      "SCRIPT_EXTENSION",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.OPEN_WORLD_3D,
    genre: "OPEN_WORLD_3D",
    label: "Open World 3D",
    dimension: "3D",
    executionModel: "NETWORK_AUTHORITATIVE",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_3D",
      "WORLD_STREAMING",
      "NETWORK_REPLICATION",
      "SAVE_STATE",
      "SCRIPT_EXTENSION",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.INTERACTIVE_3D,
    genre: "INTERACTIVE_3D",
    label: "Interactive 3D",
    dimension: "3D",
    executionModel: "CUSTOM",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "AUDIO_TIMELINE",
      "UI_OVERLAY",
      "SCRIPT_EXTENSION"
    ]
  }
]);
function stable2(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}
function diagnostic8(code, path, message) {
  return {
    code,
    path,
    message
  };
}
function validateGameRuntimeProfile(profile) {
  const diagnostics = [];
  if (profile.schemaVersion !== GAME_RUNTIME_PROFILE_SCHEMA_VERSION2) {
    diagnostics.push(diagnostic8("INVALID_PROFILE", "schemaVersion", "Runtime profile schema is unsupported."));
  }
  if (!stable2(profile.profileId)) {
    diagnostics.push(diagnostic8("INVALID_PROFILE", "profileId", "Runtime profile id is not stable."));
  }
  if (!profile.label.trim()) {
    diagnostics.push(diagnostic8("INVALID_PROFILE", "label", "Runtime profile label is required."));
  }
  if (profile.genre === "CUSTOM" && profile.profileId.length === 0) {
    diagnostics.push(diagnostic8("INVALID_PROFILE", "profileId", "Custom runtime profile id is required."));
  }
  if (profile.dimension !== "2D" && profile.dimension !== "3D") {
    diagnostics.push(diagnostic8("INVALID_PROFILE", "dimension", "Runtime profile dimension is unsupported."));
  }
  if (!Array.isArray(profile.capabilities) || profile.capabilities.length === 0) {
    diagnostics.push(diagnostic8("INVALID_PROFILE", "capabilities", "Runtime profile must declare capabilities."));
  } else if (new Set(profile.capabilities).size !== profile.capabilities.length) {
    diagnostics.push(diagnostic8("INVALID_PROFILE", "capabilities", "Runtime profile capabilities must be unique."));
  }
  if (profile.status !== "AVAILABLE" && profile.status !== "FOUNDATION" && profile.status !== "PLANNED") {
    diagnostics.push(diagnostic8("INVALID_PROFILE", "status", "Runtime profile status is unsupported."));
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics
  };
}
function assertProfile(profile) {
  const validation = validateGameRuntimeProfile(profile);
  if (!validation.valid) {
    throw new Error(validation.diagnostics.map((item) => `${item.code}:${item.path}`).join(", "));
  }
}
function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    capabilities: Object.freeze([
      ...profile.capabilities
    ])
  });
}
function createRegistry(profiles) {
  const byId = /* @__PURE__ */ new Map();
  for (const profile of profiles) {
    assertProfile(profile);
    if (byId.has(profile.profileId)) {
      throw new Error(`DUPLICATE_PROFILE:${profile.profileId}`);
    }
    byId.set(profile.profileId, freezeProfile(profile));
  }
  const ordered = Object.freeze([
    ...byId.values()
  ]);
  return {
    profiles: ordered,
    resolve(profileId) {
      return byId.get(profileId);
    },
    register(profile) {
      return createRegistry([
        ...ordered,
        profile
      ]);
    }
  };
}
var GAME_RUNTIME_PROFILES = createRegistry(BUILT_IN_PROFILES);
var DEFAULT_GAME_RUNTIME_PROFILE_ID = GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG;
function assertModule(module) {
  assertProfile(module.profile);
  if (!Number.isSafeInteger(module.fixedStepTicks) || module.fixedStepTicks < 1) {
    throw new Error("Runtime fixed step must be a positive safe integer.");
  }
  if (module.profile.status === "PLANNED") {
    throw new Error(`Runtime profile is not available: ${module.profile.profileId}`);
  }
}
function createGameRuntimeState(input) {
  assertModule(input.module);
  return {
    schemaVersion: GAME_RUNTIME_CORE_SCHEMA_VERSION,
    profileId: input.module.profile.profileId,
    journal: input.journal,
    snapshot: input.snapshot,
    input: {
      lastSequence: 0,
      lastAction: null
    },
    runtime: input.module.createInitialRuntime(input.snapshot)
  };
}
function cloneGameRuntimeState(state2, module) {
  return {
    ...state2,
    input: {
      ...state2.input
    },
    runtime: module.cloneRuntime(state2.runtime)
  };
}
function playGameRuntimeState(state2) {
  return {
    ...state2,
    runtime: {
      ...state2.runtime,
      mode: "PLAYING"
    }
  };
}
function stopGameRuntimeState(state2, module) {
  const stopped = module.stopRuntime === void 0 ? state2.runtime : module.stopRuntime(state2.runtime);
  return {
    ...state2,
    input: {
      lastSequence: 0,
      lastAction: null
    },
    runtime: {
      ...stopped,
      mode: "STOPPED"
    }
  };
}
function restartGameRuntimeState(state2, module) {
  const mode = state2.runtime.mode;
  const initial = module.createInitialRuntime(state2.snapshot);
  return {
    ...state2,
    input: {
      lastSequence: 0,
      lastAction: null
    },
    runtime: {
      ...initial,
      mode
    }
  };
}
function stepGameRuntimeState(state2, input, module) {
  if (state2.runtime.mode !== "PLAYING" || !Number.isSafeInteger(input.sequence) || input.sequence <= state2.input.lastSequence || !module.isValidAction(input.action)) return cloneGameRuntimeState(state2, module);
  const stepped = module.step(state2.snapshot, state2.runtime, input.action);
  return {
    ...state2,
    input: {
      lastSequence: input.sequence,
      lastAction: input.action
    },
    runtime: {
      ...stepped,
      mode: "PLAYING",
      tick: state2.runtime.tick + module.fixedStepTicks
    }
  };
}

// src/game/game-350/playable-slice.ts
var GAME351_PLAYABLE_SCHEMA_VERSION = 1;
var GAME351_FIXED_STEP_TICKS = 1;
var GAME351_INPUT_ACTIONS = Object.freeze({
  MOVE_UP: asActionId("rpg.move.up"),
  MOVE_DOWN: asActionId("rpg.move.down"),
  MOVE_LEFT: asActionId("rpg.move.left"),
  MOVE_RIGHT: asActionId("rpg.move.right")
});
var GAME351_INTERACT_ACTION = asActionId("rpg.interact");
var GAME351_TAP_ACTION = asActionId("rpg.tap");
function freezeDeep(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
  }
  return value;
}
function position(x, y) {
  return {
    x,
    y
  };
}
function clonePosition(value) {
  return position(value.x, value.y);
}
function cellKey(value) {
  return `${value.x},${value.y}`;
}
function defaultMap() {
  const bounds = {
    minX: 0,
    minY: 0,
    maxX: 7,
    maxY: 5
  };
  const solidCells = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (x === bounds.minX || x === bounds.maxX || y === bounds.minY || y === bounds.maxY || x === 3 && y === 2 || x === 4 && y === 2) {
        solidCells.push(position(x, y));
      }
    }
  }
  return freezeDeep({
    width: bounds.maxX - bounds.minX + 1,
    height: bounds.maxY - bounds.minY + 1,
    bounds,
    solidCells
  });
}
function transform(componentId, x, y) {
  return {
    type: "TRANSFORM",
    componentId: asComponentId(componentId),
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1
  };
}
function camera(componentId) {
  return {
    type: "CAMERA",
    componentId: asComponentId(componentId),
    active: true,
    zoom: 1
  };
}
function collider(componentId, layer2) {
  return {
    type: "COLLIDER",
    componentId: asComponentId(componentId),
    shape: "BOX",
    width: 0.8,
    height: 0.8,
    radius: 0.4,
    isTrigger: false,
    layer: layer2,
    enabled: true
  };
}
function rigidbody(componentId, bodyType) {
  return {
    type: "RIGIDBODY",
    componentId: asComponentId(componentId),
    bodyType,
    mass: 1,
    gravityScale: 0,
    fixedRotation: true,
    enabled: true
  };
}
function characterController(componentId) {
  return {
    type: "CHARACTER_CONTROLLER",
    componentId: asComponentId(componentId),
    moveSpeed: 4,
    stepHeight: 0.25,
    fixedStep: GAME351_FIXED_STEP_TICKS,
    enabled: true
  };
}
function tilemap(componentId) {
  return {
    type: "TILEMAP",
    componentId: asComponentId(componentId),
    mapId: "game351-rpg-map",
    tileSize: 1,
    collisionEnabled: true
  };
}
function entity(entityId2, name, components) {
  return {
    entityId: asEntityId(entityId2),
    name,
    components
  };
}
async function createGame351RpgTemplate(options = {}) {
  const projectId = asProjectId(options.projectId ?? "game351-rpg-template");
  const ownerId = asOwnerId(options.ownerId ?? "game351-template-owner");
  const revisionId = asRevisionId(options.revisionId ?? "game351-rpg-revision-1");
  const sceneId = asSceneId("game351-rpg-scene");
  const playerEntityId = asEntityId("game351-rpg-player");
  const npcEntityId = asEntityId("game351-rpg-npc");
  const mapEntityId = asEntityId("game351-rpg-map");
  const cameraEntityId = asEntityId("game351-rpg-camera");
  const caller = {
    projectId,
    ownerId,
    revisionId
  };
  const scene = {
    sceneId,
    name: "RPG Main Scene",
    rootEntityIds: [
      mapEntityId,
      playerEntityId,
      npcEntityId,
      cameraEntityId
    ],
    entities: [
      entity(String(mapEntityId), "Map", [
        transform("game351-rpg-map-transform", 0, 0),
        tilemap("game351-rpg-map-tilemap"),
        collider("game351-rpg-map-collider", "WORLD")
      ]),
      entity(String(playerEntityId), "Player", [
        transform("game351-rpg-player-transform", 1, 1),
        collider("game351-rpg-player-collider", "PLAYER"),
        rigidbody("game351-rpg-player-rigidbody", "DYNAMIC"),
        characterController("game351-rpg-player-controller")
      ]),
      entity(String(npcEntityId), "Guide NPC", [
        transform("game351-rpg-npc-transform", 5, 3),
        collider("game351-rpg-npc-collider", "NPC"),
        rigidbody("game351-rpg-npc-rigidbody", "KINEMATIC")
      ]),
      entity(String(cameraEntityId), "Camera", [
        camera("game351-rpg-camera-component")
      ])
    ]
  };
  const draft = {
    schemaVersion: 1,
    projectId,
    ownerId,
    name: options.name ?? "iGAME RPG Playable Slice",
    revision: {
      revisionId,
      projectId,
      ownerId,
      sequence: 1
    },
    scenes: [
      scene
    ],
    prefabs: [],
    dependencies: [],
    behaviors: [],
    runtimeProfile: {
      schemaVersion: 1,
      profileId: DEFAULT_GAME_RUNTIME_PROFILE_ID
    }
  };
  const project = await createGameProject(draft, caller);
  return {
    project,
    caller,
    sceneId,
    playerEntityId,
    npcEntityId,
    map: defaultMap()
  };
}
function createGame351RpgTemplateFromProject(project) {
  const profileId = project.runtimeProfile?.profileId ?? DEFAULT_GAME_RUNTIME_PROFILE_ID;
  if (profileId !== GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG) {
    throw new Error(`GAME-351 RPG preview does not support runtime profile: ${profileId}`);
  }
  const scene = project.scenes.find((candidate) => String(candidate.sceneId).startsWith("scene:pixiedraw-game:")) ?? project.scenes[0];
  const playerEntityId = asEntityId(`entity:pixieed-game:hero`);
  const npcEntityId = asEntityId(`entity:pixieed-game:enemy`);
  if (scene === void 0 || !scene.entities.some((entity2) => entity2.entityId === playerEntityId) || !scene.entities.some((entity2) => entity2.entityId === npcEntityId)) {
    throw new Error("Studio Game Project does not contain the RPG Player/NPC pair.");
  }
  return {
    project,
    caller: {
      projectId: project.projectId,
      ownerId: project.ownerId,
      revisionId: project.revision.revisionId
    },
    sceneId: scene.sceneId,
    playerEntityId,
    npcEntityId,
    map: defaultMap()
  };
}
function entityTransform(project, sceneId, entityId2) {
  const scene = project.scenes.find((item) => item.sceneId === sceneId);
  const target = scene?.entities.find((item) => item.entityId === entityId2);
  const component = target?.components.find((item) => item.type === "TRANSFORM");
  if (component === void 0 || !Number.isSafeInteger(component.x) || !Number.isSafeInteger(component.y)) {
    throw new Error(`Entity ${String(entityId2)} must have an integer Transform.`);
  }
  return position(component.x, component.y);
}
function inBounds(bounds, value) {
  return value.x >= bounds.minX && value.x <= bounds.maxX && value.y >= bounds.minY && value.y <= bounds.maxY;
}
function validateMap(map) {
  if (!Number.isSafeInteger(map.width) || !Number.isSafeInteger(map.height) || map.width < 1 || map.height < 1) throw new Error("RPG map dimensions must be positive integers.");
  if (map.bounds.minX > map.bounds.maxX || map.bounds.minY > map.bounds.maxY) {
    throw new Error("RPG collision bounds are invalid.");
  }
  const seen = /* @__PURE__ */ new Set();
  for (const cell of map.solidCells) {
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) || !inBounds(map.bounds, cell)) {
      throw new Error("RPG solid cells must be integer cells inside collision bounds.");
    }
    if (seen.has(cellKey(cell))) {
      throw new Error(`RPG solid cell is duplicated: ${cellKey(cell)}`);
    }
    seen.add(cellKey(cell));
  }
}
function createGame351PlayableSnapshot(template) {
  const validation = validateGameProject(template.project, template.caller);
  if (!validation.valid) {
    throw new Error(`Cannot compile invalid RPG Project: ${validation.diagnostics.map((item) => item.code).join(",")}`);
  }
  validateMap(template.map);
  const scene = template.project.scenes.find((item) => item.sceneId === template.sceneId);
  if (scene === void 0) {
    throw new Error(`Scene ${String(template.sceneId)} is not part of the Project.`);
  }
  const player = scene.entities.find((item) => item.entityId === template.playerEntityId);
  const npc = scene.entities.find((item) => item.entityId === template.npcEntityId);
  if (player === void 0 || npc === void 0) {
    throw new Error("RPG template must contain Player and NPC entities in its Scene.");
  }
  const playerPosition = entityTransform(template.project, template.sceneId, template.playerEntityId);
  const npcPosition = entityTransform(template.project, template.sceneId, template.npcEntityId);
  if (!inBounds(template.map.bounds, playerPosition) || !inBounds(template.map.bounds, npcPosition)) throw new Error("RPG actors must start inside collision bounds.");
  const solid = new Set(template.map.solidCells.map(cellKey));
  if (solid.has(cellKey(playerPosition)) || solid.has(cellKey(npcPosition))) {
    throw new Error("RPG actors may not start on solid cells.");
  }
  return freezeDeep({
    schemaVersion: GAME351_PLAYABLE_SCHEMA_VERSION,
    projectId: template.project.projectId,
    ownerId: template.project.ownerId,
    projectRevisionId: template.project.revision.revisionId,
    projectHash: template.project.revision.snapshotHash,
    sceneId: template.sceneId,
    playerEntityId: template.playerEntityId,
    playerPosition: clonePosition(playerPosition),
    npcEntityId: template.npcEntityId,
    npcPosition: clonePosition(npcPosition),
    collisionBounds: {
      ...template.map.bounds
    },
    solidCells: template.map.solidCells.map((cell) => clonePosition(cell))
  });
}
function createGame351PlayableState(template) {
  const snapshot = createGame351PlayableSnapshot(template);
  return createGameRuntimeState({
    journal: createJournal(template.project, template.caller),
    snapshot,
    module: GAME351_RPG_RUNTIME_MODULE
  });
}
function playGame351(state2) {
  return playGameRuntimeState(state2);
}
function stopGame351(state2) {
  return stopGameRuntimeState(state2, GAME351_RPG_RUNTIME_MODULE);
}
function clearGame351Dialogue(state2) {
  return {
    ...cloneUnchangedState(state2),
    runtime: {
      ...state2.runtime,
      dialogue: null
    }
  };
}
function restartGame351(state2) {
  return restartGameRuntimeState(state2, GAME351_RPG_RUNTIME_MODULE);
}
function validAction(value) {
  return value === null || Object.values(GAME351_INPUT_ACTIONS).includes(value);
}
function movement(action) {
  if (action === GAME351_INPUT_ACTIONS.MOVE_UP) return position(0, -1);
  if (action === GAME351_INPUT_ACTIONS.MOVE_DOWN) return position(0, 1);
  if (action === GAME351_INPUT_ACTIONS.MOVE_LEFT) return position(-1, 0);
  if (action === GAME351_INPUT_ACTIONS.MOVE_RIGHT) return position(1, 0);
  return position(0, 0);
}
var GAME351_RPG_RUNTIME_MODULE = {
  profile: GAME_RUNTIME_PROFILES.resolve(GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG),
  fixedStepTicks: GAME351_FIXED_STEP_TICKS,
  createInitialRuntime(snapshot) {
    return {
      mode: "STOPPED",
      tick: 0,
      sceneId: snapshot.sceneId,
      playerPosition: clonePosition(snapshot.playerPosition),
      npcPosition: clonePosition(snapshot.npcPosition),
      dialogue: null
    };
  },
  isValidAction(action) {
    return validAction(action);
  },
  step(snapshot, runtime, action) {
    const delta = movement(action);
    const candidate = position(runtime.playerPosition.x + delta.x, runtime.playerPosition.y + delta.y);
    const nextPlayerPosition = canEnterGame351Cell(snapshot, candidate) ? candidate : clonePosition(runtime.playerPosition);
    return {
      ...runtime,
      playerPosition: nextPlayerPosition,
      npcPosition: clonePosition(runtime.npcPosition)
    };
  },
  cloneRuntime(runtime) {
    return {
      ...runtime,
      playerPosition: clonePosition(runtime.playerPosition),
      npcPosition: clonePosition(runtime.npcPosition)
    };
  },
  stopRuntime(runtime) {
    return {
      ...runtime,
      dialogue: null
    };
  }
};
function cloneUnchangedState(state2) {
  return cloneGameRuntimeState(state2, GAME351_RPG_RUNTIME_MODULE);
}
function isAdjacent(left, right) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
}
function triggerGame351Action(state2, actionId, behaviors) {
  if (state2.runtime.mode !== "PLAYING" || actionId !== String(GAME351_INTERACT_ACTION) && actionId !== String(GAME351_TAP_ACTION) || !isAdjacent(state2.runtime.playerPosition, state2.runtime.npcPosition)) return cloneUnchangedState(state2);
  for (const behavior of behaviors) {
    for (const rule of behavior.rules) {
      if (!rule.enabled || rule.trigger.type !== "ACTION" || rule.trigger.actionId !== actionId) continue;
      for (const action of rule.actions) {
        if (action.kind === "SET_VARIABLE" && action.property === "dialogue" && typeof action.value === "string" && action.value.trim().length > 0) {
          return {
            ...cloneUnchangedState(state2),
            runtime: {
              ...state2.runtime,
              dialogue: action.value.trim()
            }
          };
        }
      }
    }
  }
  return cloneUnchangedState(state2);
}
function canEnterGame351Cell(snapshot, value) {
  return inBounds(snapshot.collisionBounds, value) && !new Set(snapshot.solidCells.map(cellKey)).has(cellKey(value)) && cellKey(value) !== cellKey(snapshot.npcPosition);
}
function stepGame351(state2, input) {
  return stepGameRuntimeState(state2, input, GAME351_RPG_RUNTIME_MODULE);
}

// src/workspace/project-manifest.ts
var WORKSPACE_MANIFEST_SCHEMA_VERSION = 1;
var WORKSPACE_MANIFEST_DB_NAME = "pixiedraw2-workspace-manifest";
var WORKSPACE_MANIFEST_DB_VERSION = 1;
var WORKSPACE_MANIFEST_STORE_NAME = "manifests";
var WORKSPACE_ACTIVE_PROJECT_STORAGE_KEY = "pixiedraw2:active-project-id:v1";
var WORKSPACE_PROJECT_CHANGED_EVENT = "pixiedraw2:project-changed";
var DEFAULT_WORKSPACE_PROJECT_ID = "draw2-local-demo";
var SAFE_ID5 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
var MANIFEST_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "projectId",
  "name",
  "activeMode",
  "createdAt",
  "updatedAt",
  "revision",
  "modules",
  "assetCatalogRef",
  "migration"
]);
var MODULE_KEYS = /* @__PURE__ */ new Set([
  "stateRef",
  "checkpointRef",
  "journalRef",
  "status",
  "revision",
  "stateHash",
  "savedAt"
]);
function asWorkspaceProjectId(value) {
  const normalized = value.trim();
  if (!SAFE_ID5.test(normalized)) {
    throw new Error("Workspace Project ID must be a stable identifier.");
  }
  return normalized;
}
function normalizeWorkspaceProjectId(value, fallback = asWorkspaceProjectId(DEFAULT_WORKSPACE_PROJECT_ID)) {
  try {
    return asWorkspaceProjectId(value ?? "");
  } catch {
    return fallback;
  }
}
function moduleManifest(surface, projectId, status2 = "EMPTY") {
  return {
    stateRef: `${surface}:${projectId}:state`,
    checkpointRef: `${surface}:${projectId}:checkpoint`,
    journalRef: `${surface}:${projectId}:journal`,
    status: status2,
    revision: 0,
    stateHash: null,
    savedAt: null
  };
}
function createWorkspaceProjectManifest(projectId, name = `iDRAW ${projectId}`, now = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    schemaVersion: WORKSPACE_MANIFEST_SCHEMA_VERSION,
    projectId,
    name,
    activeMode: "draw",
    createdAt: now,
    updatedAt: now,
    revision: 0,
    modules: {
      draw: moduleManifest("draw", projectId),
      audio: moduleManifest("audio", projectId),
      game: moduleManifest("game", projectId)
    }
  };
}
function isSurface(value) {
  return value === "draw" || value === "audio" || value === "game";
}
function isModuleStatus(value) {
  return value === "EMPTY" || value === "READY" || value === "RECOVERED" || value === "UNAVAILABLE" || value === "MISSING" || value === "RECOVERABLE" || value === "CORRUPT";
}
function safeReference(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000\u0009\u000a\u000d]/u.test(value);
}
function isWorkspaceMigrationStatus(value) {
  return value === "LEGACY" || value === "MIGRATED" || value === "VERIFIED";
}
function hasRawWorkspacePayload(value) {
  if (Array.isArray(value)) return value.some(hasRawWorkspacePayload);
  if (value === null || typeof value !== "object") return false;
  const forbidden = /^(?:bytes|rawAudio|rawRaster|pixelData|pcm|audioBuffer|blob)$/iu;
  return Object.entries(value).some(([key, entry]) => forbidden.test(key) || hasRawWorkspacePayload(entry));
}
function normalizedModuleManifest(surface, projectId, value) {
  if (value === null || typeof value !== "object") return null;
  const candidate = value;
  if (Object.keys(candidate).some((key) => !MODULE_KEYS.has(key))) return null;
  if (!isModuleStatus(candidate.status) || typeof candidate.revision !== "number" || !Number.isSafeInteger(candidate.revision) || candidate.revision < 0 || typeof candidate.stateHash !== "string" && candidate.stateHash !== null || typeof candidate.savedAt !== "string" && candidate.savedAt !== null || hasRawWorkspacePayload(value)) return null;
  return {
    stateRef: safeReference(candidate.stateRef) ? candidate.stateRef : `${surface}:${projectId}:state`,
    checkpointRef: safeReference(candidate.checkpointRef) ? candidate.checkpointRef : `${surface}:${projectId}:checkpoint`,
    journalRef: safeReference(candidate.journalRef) ? candidate.journalRef : `${surface}:${projectId}:journal`,
    status: candidate.status,
    revision: candidate.revision,
    stateHash: candidate.stateHash,
    savedAt: candidate.savedAt
  };
}
function normalizedManifest(value) {
  if (value === null || typeof value !== "object") return null;
  const candidate = value;
  const modules = candidate.modules;
  if (modules === null || typeof modules !== "object" || Array.isArray(modules)) return null;
  const moduleRecord = modules;
  if (hasRawWorkspacePayload(value) || Object.keys(candidate).some((key) => !MANIFEST_KEYS.has(key)) || candidate.schemaVersion !== WORKSPACE_MANIFEST_SCHEMA_VERSION || typeof candidate.projectId !== "string" || !SAFE_ID5.test(candidate.projectId) || typeof candidate.name !== "string" || !candidate.name.trim() || !isSurface(candidate.activeMode) || typeof candidate.createdAt !== "string" || typeof candidate.updatedAt !== "string" || typeof candidate.revision !== "number" || !Number.isSafeInteger(candidate.revision) || candidate.revision < 0) return null;
  const projectId = candidate.projectId;
  if (Object.keys(moduleRecord).some((key) => !isSurface(key))) return null;
  const draw = normalizedModuleManifest("draw", projectId, moduleRecord.draw);
  const audio = normalizedModuleManifest("audio", projectId, moduleRecord.audio);
  const game = normalizedModuleManifest("game", projectId, moduleRecord.game);
  if (draw === null || audio === null || game === null) return null;
  if (candidate.assetCatalogRef !== void 0 && !safeReference(candidate.assetCatalogRef)) return null;
  let migration;
  if (candidate.migration !== void 0) {
    if (candidate.migration === null || typeof candidate.migration !== "object") return null;
    if (Object.keys(candidate.migration).some((key) => key !== "audio")) return null;
    const audioMigration = candidate.migration.audio;
    if (audioMigration !== void 0) {
      if (audioMigration === null || typeof audioMigration !== "object") {
        return null;
      }
      const record2 = audioMigration;
      if (Object.keys(record2).some((key) => ![
        "status",
        "legacyProjectId",
        "migratedAt",
        "verifiedAt"
      ].includes(key))) return null;
      if (!isWorkspaceMigrationStatus(record2.status) || !safeReference(record2.legacyProjectId) || typeof record2.migratedAt !== "string" || record2.verifiedAt !== void 0 && typeof record2.verifiedAt !== "string") return null;
      migration = {
        audio: {
          status: record2.status,
          legacyProjectId: record2.legacyProjectId,
          migratedAt: record2.migratedAt,
          ...record2.verifiedAt === void 0 ? {} : {
            verifiedAt: record2.verifiedAt
          }
        }
      };
    }
  }
  return {
    schemaVersion: WORKSPACE_MANIFEST_SCHEMA_VERSION,
    projectId,
    name: candidate.name,
    activeMode: candidate.activeMode,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    revision: candidate.revision,
    modules: {
      draw,
      audio,
      game
    },
    ...candidate.assetCatalogRef === void 0 ? {} : {
      assetCatalogRef: candidate.assetCatalogRef
    },
    ...migration === void 0 ? {} : {
      migration
    }
  };
}
function isManifest(value) {
  return normalizedManifest(value) !== null;
}
function cloneManifest(manifest) {
  const normalized = normalizedManifest(manifest);
  if (normalized === null) throw new Error("Invalid Workspace Manifest.");
  return {
    ...normalized,
    modules: {
      draw: {
        ...normalized.modules.draw
      },
      audio: {
        ...normalized.modules.audio
      },
      game: {
        ...normalized.modules.game
      }
    }
  };
}
function openManifestDatabase(name) {
  return new Promise((resolve, reject2) => {
    if (typeof indexedDB === "undefined") {
      reject2(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(name, WORKSPACE_MANIFEST_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WORKSPACE_MANIFEST_STORE_NAME)) {
        request.result.createObjectStore(WORKSPACE_MANIFEST_STORE_NAME, {
          keyPath: "projectId"
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject2(request.error ?? new Error("Manifest DB open failed."));
    request.onblocked = () => reject2(new Error("Manifest DB open was blocked."));
  });
}
function createIndexedDbWorkspaceManifestStore(databaseName = WORKSPACE_MANIFEST_DB_NAME) {
  return {
    async load(projectId) {
      try {
        const database = await openManifestDatabase(databaseName);
        return await new Promise((resolve) => {
          const request = database.transaction(WORKSPACE_MANIFEST_STORE_NAME, "readonly").objectStore(WORKSPACE_MANIFEST_STORE_NAME).get(projectId);
          request.onsuccess = () => {
            database.close();
            resolve(isManifest(request.result) ? cloneManifest(request.result) : null);
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
    async save(manifest) {
      const canonical = normalizedManifest(manifest);
      if (canonical === null) return;
      try {
        const database = await openManifestDatabase(databaseName);
        await new Promise((resolve, reject2) => {
          const transaction = database.transaction(WORKSPACE_MANIFEST_STORE_NAME, "readwrite");
          const store = transaction.objectStore(WORKSPACE_MANIFEST_STORE_NAME);
          const read = store.get(canonical.projectId);
          read.onsuccess = () => {
            const current = isManifest(read.result) ? read.result : void 0;
            if (current === void 0 || canonical.revision >= current.revision) {
              store.put(canonical);
            }
          };
          read.onerror = () => transaction.abort();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject2(transaction.error ?? new Error("Manifest save failed."));
          transaction.onabort = () => reject2(transaction.error ?? new Error("Manifest save aborted."));
        });
        database.close();
      } catch {
      }
    },
    async updateModule(projectId, surface, patch, name) {
      const current = await this.load(projectId) ?? createWorkspaceProjectManifest(projectId, name);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const next = {
        ...current,
        name: name ?? current.name,
        updatedAt: now,
        revision: current.revision + 1,
        modules: {
          ...current.modules,
          [surface]: {
            ...current.modules[surface],
            ...patch
          }
        }
      };
      await this.save(next);
      return next;
    },
    async setActiveMode(projectId, activeMode) {
      const current = await this.load(projectId) ?? createWorkspaceProjectManifest(projectId);
      const next = {
        ...current,
        activeMode,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        revision: current.revision + 1
      };
      await this.save(next);
      return next;
    },
    async updateAudioMigration(projectId, migration) {
      const current = await this.load(projectId) ?? createWorkspaceProjectManifest(projectId);
      const next = {
        ...current,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        revision: current.revision + 1,
        migration: {
          audio: migration
        }
      };
      await this.save(next);
      return next;
    }
  };
}
function readActiveWorkspaceProjectId(storage = typeof window === "undefined" ? void 0 : window.localStorage) {
  try {
    return normalizeWorkspaceProjectId(storage?.getItem(WORKSPACE_ACTIVE_PROJECT_STORAGE_KEY));
  } catch {
    return asWorkspaceProjectId(DEFAULT_WORKSPACE_PROJECT_ID);
  }
}
function writeActiveWorkspaceProjectId(projectId, storage = typeof window === "undefined" ? void 0 : window.localStorage) {
  try {
    storage?.setItem(WORKSPACE_ACTIVE_PROJECT_STORAGE_KEY, projectId);
  } catch {
  }
}
function announceWorkspaceProjectChanged(windowRef, detail) {
  windowRef.dispatchEvent(new CustomEvent(WORKSPACE_PROJECT_CHANGED_EVENT, {
    detail
  }));
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
function clone2(value) {
  if (typeof structuredClone !== "function") {
    throw new PixyncIndexedDbPersistenceError("INDEXEDDB_UNAVAILABLE", "structuredClone is required by the IndexedDB persistence boundary.");
  }
  return structuredClone(value);
}
function errorMessage(error2, fallback) {
  return error2 instanceof Error && error2.message.length > 0 ? error2.message : fallback;
}
function asError(error2, code, fallback) {
  if (error2 instanceof PixyncIndexedDbPersistenceError) return error2;
  return new PixyncIndexedDbPersistenceError(code, errorMessage(error2, fallback), {
    cause: error2
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
function openDatabase(factory, dbName) {
  return new Promise((resolve, reject2) => {
    let request;
    let settled = false;
    const rejectOnce = (error2) => {
      if (settled) return;
      settled = true;
      reject2(asError(error2, "OPEN_FAILED", "IndexedDB open failed."));
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
        } catch (error2) {
          try {
            request.transaction?.abort();
          } catch {
          }
          rejectOnce(asError(error2, "UPGRADE_FAILED", "IndexedDB schema upgrade failed."));
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
    } catch (error2) {
      rejectOnce(asError(error2, "OPEN_FAILED", "IndexedDB open failed."));
    }
  });
}
function withDatabase(factory, dbName, operation) {
  return openDatabase(factory, dbName).then(async (db) => {
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
  return new Promise((resolve, reject2) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(projectId);
      let record2;
      let requestFinished = false;
      let settled = false;
      const rejectOnce = (error2) => {
        if (settled) return;
        settled = true;
        reject2(asError(error2, "TRANSACTION_FAILED", "IndexedDB read failed."));
      };
      request.onerror = () => rejectOnce(request.error);
      request.onsuccess = () => {
        requestFinished = true;
        record2 = request.result;
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
        resolve(record2);
      };
    } catch (error2) {
      reject2(asError(error2, "TRANSACTION_FAILED", "IndexedDB read failed."));
    }
  });
}
function writeRecord(db, record2) {
  return new Promise((resolve, reject2) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).put(clone2(record2));
      let settled = false;
      const rejectOnce = (error2) => {
        if (settled) return;
        settled = true;
        reject2(asError(error2, "TRANSACTION_FAILED", "IndexedDB write failed."));
      };
      request.onerror = () => rejectOnce(request.error);
      transaction.onerror = () => rejectOnce(transactionError(transaction, false));
      transaction.onabort = () => rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error2) {
      reject2(asError(error2, "TRANSACTION_FAILED", "IndexedDB write failed."));
    }
  });
}
function compareAndSwapRecord(db, projectId, snapshot, expectedSnapshotHash) {
  return new Promise((resolve, reject2) => {
    let transaction;
    let conflict;
    let settled = false;
    const rejectOnce = (error2) => {
      if (settled) return;
      settled = true;
      reject2(asError(error2, "TRANSACTION_FAILED", "IndexedDB CAS failed."));
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
            snapshot: clone2(snapshot)
          });
          write.onerror = () => rejectOnce(write.error);
        } catch (error2) {
          if (error2 instanceof PixyncIndexedDbPersistenceError && error2.code === "SNAPSHOT_CONFLICT") conflict = error2;
          try {
            transaction.abort();
          } catch {
            rejectOnce(error2);
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
    } catch (error2) {
      rejectOnce(error2);
    }
  });
}
function normalizeRecord(record2, projectId) {
  if (record2 === void 0) return void 0;
  if (record2 === null || typeof record2 !== "object" || record2.projectId !== projectId || !("snapshot" in record2)) {
    throw new PixyncIndexedDbPersistenceError("RECORD_MALFORMED", "IndexedDB snapshot record is malformed or belongs to another project.");
  }
  return clone2(record2.snapshot);
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
      const record2 = await withDatabase(this.#factory, this.dbName, (db) => readRecord(db, this.projectId));
      return normalizeRecord(record2, this.projectId);
    });
  }
  atomicReplace(snapshot) {
    return this.#enqueue(async () => {
      if (snapshot.projectId !== this.projectId) {
        throw new PixyncIndexedDbPersistenceError("PROJECT_MISMATCH", "IndexedDB snapshot belongs to another project.");
      }
      const record2 = {
        projectId: this.projectId,
        snapshot: clone2(snapshot)
      };
      await withDatabase(this.#factory, this.dbName, (db) => writeRecord(db, record2));
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
      await withDatabase(this.#factory, this.dbName, (db) => compareAndSwapRecord(db, this.projectId, clone2(snapshot), expectedSnapshotHash));
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

// src/pixync/project-lifecycle.ts
function validProjectId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value);
}
var PixyncProjectLifecycleCoordinator = class {
  #options;
  #state = {
    phase: "IDLE",
    projectId: null,
    generation: 0
  };
  #journal;
  #queue = Promise.resolve();
  #generation = 0;
  #started = false;
  #disposed = false;
  #handleProjectChanged = (event) => {
    if (this.#disposed) return;
    const detail = event.detail;
    if (!validProjectId(detail?.projectId)) return;
    const kind = detail?.kind === "NEW" ? "NEW" : "OPEN";
    const generation = ++this.#generation;
    this.#enqueue({
      projectId: detail.projectId,
      kind,
      generation
    });
  };
  constructor(options) {
    if (!validProjectId(options.initialProjectId) || options.eventName.length === 0) {
      throw new Error("PiXYNC project lifecycle options are invalid.");
    }
    this.#options = options;
  }
  state() {
    return {
      ...this.#state
    };
  }
  activeJournal() {
    return this.#journal;
  }
  async start() {
    if (this.#disposed) {
      throw new Error("PiXYNC project lifecycle is disposed.");
    }
    if (this.#started) return this.#queue;
    this.#started = true;
    this.#options.eventTarget.addEventListener(this.#options.eventName, this.#handleProjectChanged);
    const generation = ++this.#generation;
    this.#enqueue({
      projectId: this.#options.initialProjectId,
      kind: "OPEN",
      generation
    }, "INITIAL");
    return this.#queue;
  }
  async settled() {
    await this.#queue;
  }
  async dispose() {
    if (this.#disposed) return this.#queue;
    this.#disposed = true;
    ++this.#generation;
    this.#options.eventTarget.removeEventListener(this.#options.eventName, this.#handleProjectChanged);
    this.#queue = this.#queue.then(async () => {
      const current = this.#journal;
      this.#journal = void 0;
      if (current !== void 0) {
        try {
          await this.#options.flushProject?.(current.projectId, current);
        } finally {
          await this.#options.stopProject?.(current.projectId, current);
        }
      }
      this.#publish({
        phase: "DISPOSED",
        projectId: null,
        generation: this.#generation,
        reason: "DISPOSE"
      });
    });
    return this.#queue;
  }
  #enqueue(request, reason = request.kind) {
    this.#queue = this.#queue.then(() => this.#switch(request, reason));
  }
  async #switch(request, reason) {
    if (this.#disposed || request.generation !== this.#generation) return;
    if (request.kind === "OPEN" && this.#journal?.projectId === request.projectId) return;
    const previous = this.#journal;
    this.#journal = void 0;
    this.#publish({
      phase: previous === void 0 ? "OPENING" : "SWITCHING",
      projectId: request.projectId,
      generation: request.generation,
      reason
    });
    if (previous !== void 0) {
      let teardownFailed = false;
      try {
        await this.#options.flushProject?.(previous.projectId, previous);
      } catch {
        teardownFailed = true;
      }
      try {
        await this.#options.stopProject?.(previous.projectId, previous);
      } catch {
        teardownFailed = true;
      }
      if (teardownFailed) {
        if (!this.#disposed && request.generation === this.#generation) {
          this.#publish({
            phase: "UNAVAILABLE",
            projectId: request.projectId,
            generation: request.generation,
            reason: "OPEN_FAILED"
          });
        }
        return;
      }
    }
    if (this.#disposed || request.generation !== this.#generation) return;
    let opened;
    try {
      const persistence = this.#options.createPersistence(request.projectId);
      opened = await this.#options.openJournal(request.projectId, persistence);
      if (opened.projectId !== request.projectId) {
        throw new Error("PiXYNC journal project identity mismatch.");
      }
    } catch {
      if (!this.#disposed && request.generation === this.#generation) {
        this.#publish({
          phase: "UNAVAILABLE",
          projectId: request.projectId,
          generation: request.generation,
          reason: "OPEN_FAILED"
        });
      }
      return;
    }
    if (this.#disposed || request.generation !== this.#generation) {
      await this.#options.stopProject?.(opened.projectId, opened);
      return;
    }
    this.#journal = opened;
    this.#publish({
      phase: "ACTIVE",
      projectId: request.projectId,
      generation: request.generation,
      reason
    });
  }
  #publish(state2) {
    this.#state = {
      ...state2
    };
    this.#options.onState?.({
      ...state2
    });
  }
};

// src/draw2-entry.ts
var DRAW2_ICON_SPRITE = "./assets/icons/draw2-icons.svg#";
function createDraw2Icon(iconId, className = "draw2-ui-icon") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `${DRAW2_ICON_SPRITE}${iconId}`);
  svg.append(use);
  return svg;
}
function setDraw2Icon(target, iconId) {
  target.querySelector("use")?.setAttribute("href", `${DRAW2_ICON_SPRITE}${iconId}`);
}
var legacyCompatModulePromise;
var advancedModulePromise;
var workspaceModulePromise;
var exportModulePromise;
function loadLegacyCompatModule() {
  const legacyChunkUrl = new URL("draw2-legacy-compat.js", import.meta.url).href;
  legacyCompatModulePromise ??= import(legacyChunkUrl);
  return legacyCompatModulePromise;
}
function loadAdvancedModule() {
  const advancedChunkUrl = new URL("wp170-advanced-tools.js", import.meta.url).href;
  advancedModulePromise ??= import(advancedChunkUrl);
  return advancedModulePromise;
}
function loadWorkspaceModule() {
  const workspaceMobileProjectionMarker = "20260819-compare-final-1";
  const workspaceChunkUrl = new URL("wp180-workspace.js?v=20260825-game-studio-systems-v82", import.meta.url);
  workspaceChunkUrl.searchParams.set("v", "20260825-game-studio-systems-v82");
  workspaceChunkUrl.searchParams.set("mobile", workspaceMobileProjectionMarker);
  workspaceModulePromise ??= import(workspaceChunkUrl.href);
  return workspaceModulePromise;
}
function getWorkspacePxdBridge() {
  const candidate = window.__pixiedraw2WorkspaceDebug;
  if (typeof candidate?.exportProjectPxdSnapshot !== "function" || typeof candidate.restoreProjectPxdSnapshot !== "function") {
    throw new Error("PXD workspace bridge is not ready.");
  }
  return candidate;
}
function loadExportModule() {
  const exportChunkUrl = new URL("draw2-export.js?v=20260825-studio-brand-03", import.meta.url).href;
  exportModulePromise ??= import(exportChunkUrl);
  return exportModulePromise;
}
var canvasElement = document.querySelector("#draw2Canvas");
var tilesetSourceCanvasElement = document.querySelector("#draw2TilesetSourceCanvas");
var overlayElement = document.querySelector("#draw2Overlay");
var erasePreviewElement = document.querySelector("#draw2ErasePreview");
var tilemapGridElement = document.querySelector("#draw2TilemapGrid");
var tilemapGridMinorPathElement = document.querySelector("#draw2TilemapGridMinor");
var tilemapGridMajorPathElement = document.querySelector("#draw2TilemapGridMajor");
var pixelGridElement = document.querySelector("#draw2PixelGrid");
var pixelGridMinorPathElement = document.querySelector("#draw2PixelGridMinor");
var pixelGridMajorPathElement = document.querySelector("#draw2PixelGridMajor");
var selectionOverlayElement = document.querySelector("#draw2SelectionOverlay");
var mirrorGuideOverlayElement = document.querySelector("#draw2MirrorGuideOverlay");
var mirrorGuideVerticalElement = document.querySelector("#draw2MirrorGuideVertical");
var mirrorGuideHorizontalElement = document.querySelector("#draw2MirrorGuideHorizontal");
var mirrorGuideDiagonalDownElement = document.querySelector("#draw2MirrorGuideDiagonalDown");
var mirrorGuideDiagonalUpElement = document.querySelector("#draw2MirrorGuideDiagonalUp");
var mirrorToggleXElement = document.querySelector("#draw2MirrorToggleX");
var mirrorToggleYElement = document.querySelector("#draw2MirrorToggleY");
var mirrorToggleDiagonalDownElement = document.querySelector("#draw2MirrorToggleDiagonalDown");
var mirrorToggleDiagonalUpElement = document.querySelector("#draw2MirrorToggleDiagonalUp");
var selectionOverlayRegionsElement = document.querySelector("#draw2SelectionOverlayRegions");
var statusElement = document.querySelector("#draw2Status");
var metricsElement = document.querySelector("#draw2Metrics");
var selectionStatusElement = document.querySelector("#draw2SelectionStatus");
var projectIdInputElement = document.querySelector("#draw2ProjectId");
var tileSizeSelectElement = document.querySelector("#draw2TileSize");
var toolSelectElement = document.querySelector("#draw2Tool");
var brushSizeElement = document.querySelector("#draw2BrushSize");
var brushPatternElement = document.querySelector("#draw2BrushPattern");
var brushShapeElement = document.querySelector("#draw2BrushShape");
var brushSizeControlElement = document.querySelector("#draw2QuickBrushSizeControl");
var quickControlsElement = document.querySelector("#draw2WorkspaceQuickControls");
var brushOptionsButtonElement = document.querySelector("#draw2BrushOptionsButton");
var brushOptionsSummaryElement = document.querySelector("#draw2BrushOptionsSummary");
var brushOptionsFlyoutElement = document.querySelector("#draw2BrushOptionsFlyout");
var brushOptionsCloseButtonElement = document.querySelector("#draw2BrushOptionsClose");
var brushPresetElement = document.querySelector("#draw2BrushPreset");
var brushPresetNameElement = document.querySelector("#draw2BrushPresetName");
var brushPresetSaveButton = document.querySelector("#draw2BrushPresetSave");
var brushPresetDeleteButton = document.querySelector("#draw2BrushPresetDelete");
var mirrorModeToggleElement = document.querySelector("#draw2MirrorModeToggle");
var viewportContextRailElement = document.querySelector("#draw2ViewportContextRail");
var similarityControlElement = document.querySelector("#draw2SimilarityControl");
var similarityElement = document.querySelector("#draw2Similarity");
var similarityValueElement = document.querySelector("#draw2SimilarityValue");
var colorSelectionModeElement = document.querySelector("#draw2ColorSelectionMode");
var miniPreviewCanvasElement = document.querySelector("#draw2MiniPreviewCanvas");
var audioDrawPreviewCanvasElement = document.querySelector("#draw2AudioDrawPreviewCanvas");
var miniPreviewContainerElement = document.querySelector(".draw2-mini-preview");
var miniPreviewPlayButtonElement = document.querySelector("#draw2MiniPreviewPlay");
var miniPreviewReferenceButtonElement = document.querySelector("#draw2MiniPreviewReference");
var miniPreviewReferenceClearButtonElement = document.querySelector("#draw2MiniPreviewReferenceClear");
var miniPreviewReferenceInputElement = document.querySelector("#draw2MiniPreviewReferenceInput");
var miniPreviewReferenceStatusElement = document.querySelector("#draw2MiniPreviewReferenceStatus");
var miniPreviewCollapseButtonElement = document.querySelector("#draw2MiniPreviewCollapse");
var miniPreviewRestoreButtonElement = document.querySelector("#draw2MiniPreviewRestore");
var miniPreviewResizeLeftElement = document.querySelector("#draw2MiniPreviewResizeLeft");
var miniPreviewResizeBottomElement = document.querySelector("#draw2MiniPreviewResizeBottom");
var miniPreviewResizeCornerElement = document.querySelector("#draw2MiniPreviewResizeCorner");
var displayToggleButtons = Array.from(document.querySelectorAll("[data-draw2-display-toggle]"));
var viewportWrapElement = document.querySelector(".draw2-viewport-wrap");
var viewportCenterButtonElement = document.querySelector("#draw2ViewportCenter");
var canvasStackElement = document.querySelector(".draw2-canvas-stack");
var workspaceFrameElement = document.querySelector("#draw2WorkspaceFrame");
var projectStartElement = document.querySelector("#draw2ProjectStart");
var projectStartNewButton = document.querySelector("#draw2ProjectStartNew");
var projectStartOpenButton = document.querySelector("#draw2ProjectStartOpen");
var projectStartIdElement = document.querySelector("#draw2ProjectStartId");
var projectStartRecentListElement = document.querySelector("#draw2ProjectRecentList");
var projectStartRecentCountElement = document.querySelector("#draw2ProjectRecentCount");
var projectStartStatusElement = document.querySelector("#draw2ProjectStartStatus");
function mountCommonDetailsMenu() {
  const menu = document.querySelector("#draw2CommonDetailsMenu");
  const brand = document.querySelector(".draw2-workspace-brand");
  if (menu === null || brand === null || menu.parentElement === brand) return;
  brand.append(menu);
}
mountCommonDetailsMenu();
var selectionXElement = document.querySelector("#draw2SelectionX");
var selectionYElement = document.querySelector("#draw2SelectionY");
var selectionWidthElement = document.querySelector("#draw2SelectionWidth");
var selectionHeightElement = document.querySelector("#draw2SelectionHeight");
var selectionModeElement = document.querySelector("#draw2SelectionMode");
var selectionExpandButton = document.querySelector("#draw2SelectionExpand");
var selectionShrinkButton = document.querySelector("#draw2SelectionShrink");
var selectionInvertButton = document.querySelector("#draw2SelectionInvert");
var selectionBorderButton = document.querySelector("#draw2SelectionBorder");
var transformOperationElement = document.querySelector("#draw2TransformOperation");
var transformDxElement = document.querySelector("#draw2TransformDx");
var transformDyElement = document.querySelector("#draw2TransformDy");
var transformFactorElement = document.querySelector("#draw2TransformFactor");
var selectButton = document.querySelector("#draw2Select");
var commitSelectionButton = document.querySelector("#draw2CommitSelection");
var cancelSelectionButton = document.querySelector("#draw2CancelSelection");
var previewButton = document.querySelector("#draw2PreviewTransform");
var commitButton = document.querySelector("#draw2CommitTransform");
var cancelButton = document.querySelector("#draw2CancelTransform");
var flipHorizontalButton = document.querySelector("#draw2FlipHorizontal");
var flipVerticalButton = document.querySelector("#draw2FlipVertical");
var rotateCCWButton = document.querySelector("#draw2RotateCCW");
var rotateCWButton = document.querySelector("#draw2RotateCW");
var rotate180Button = document.querySelector("#draw2Rotate180");
var copyButton = document.querySelector("#draw2Copy");
var cutButton = document.querySelector("#draw2Cut");
var pasteButton = document.querySelector("#draw2Paste");
var undoButton = document.querySelector("#draw2Undo");
var redoButton = document.querySelector("#draw2Redo");
var timelineTabs = Array.from(document.querySelectorAll("[data-draw2-timeline-tab]"));
var timelineTabPanels = Array.from(document.querySelectorAll("[data-draw2-timeline-tab-panel]"));
var timelineCardElement = document.querySelector("#draw2TimelineCard");
var timelineContextMenu = document.querySelector("#draw2TimelineContextMenu");
var timelineStatusElement = document.querySelector("#draw2TimelineStatus");
var timelinePositionElement = document.querySelector("#draw2TimelinePosition");
var timelineDurationElement = document.querySelector("#draw2TimelineDuration");
var timelineViewportElement = document.querySelector("#draw2TimelineViewport");
var timelineSpacerElement = document.querySelector("#draw2TimelineSpacer");
var timelineWindowElement = document.querySelector("#draw2TimelineWindow");
var timelineSecondaryControlsElement = document.querySelector("#draw2TimelineSecondaryControls");
var timelinePropertiesResizeElement = document.querySelector("#draw2TimelinePropertiesResize");
var timelinePropertiesElement = document.querySelector("#draw2TimelineLayerProperties");
var timelinePropertiesBodyElement = document.querySelector("#draw2TimelineLayerPropertiesBody");
var timelinePropertiesCollapseElement = document.querySelector("#draw2TimelinePropertiesCollapse");
var animationTagNameElement = document.querySelector("#draw2TagName");
var animationTagFromElement = document.querySelector("#draw2TagFrom");
var animationTagToElement = document.querySelector("#draw2TagTo");
var animationTagLoopElement = document.querySelector("#draw2TagLoop");
var animationTagAddElement = document.querySelector("#draw2TagAdd");
var animationTagListElement = document.querySelector("#draw2AnimationTagList");
var timelineMarkerKindElement = document.querySelector("#draw2MarkerKind");
var timelineMarkerLabelElement = document.querySelector("#draw2MarkerLabel");
var timelineMarkerAddElement = document.querySelector("#draw2MarkerAdd");
var timelineMarkerListElement = document.querySelector("#draw2TimelineMarkerList");
var drawAudioAssetPickerElement = document.querySelector("#draw2DrawAudioAssetPicker");
var drawAudioAddElement = document.querySelector("#draw2DrawAudioAdd");
var drawAudioLaneElement = document.querySelector("#draw2DrawAudioLane");
var drawAudioEmptyElement = document.querySelector("#draw2DrawAudioEmpty");
var drawAudioStatusElement = document.querySelector("#draw2DrawAudioStatus");
var linkedCelToggleElement = document.querySelector("#draw2LinkedCelToggle");
var linkedCelStatusElement = document.querySelector("#draw2LinkedCelStatus");
var layerListElement = document.querySelector("#draw2LayerList");
var layerPanelAddElement = document.querySelector("#draw2LayerPanelAdd");
var layerPanelDuplicateElement = document.querySelector("#draw2LayerPanelDuplicate");
var layerPanelRemoveElement = document.querySelector("#draw2LayerPanelRemove");
var layerPanelAddTilemapElement = document.querySelector("#draw2LayerPanelAddTilemap");
var addFrameButton = document.querySelector("#draw2AddFrame");
var duplicateFrameButton = document.querySelector("#draw2DuplicateFrame");
var removeFrameButton = document.querySelector("#draw2RemoveFrame");
var addLayerButton = document.querySelector("#draw2AddLayer");
var reorderLayerButton = document.querySelector("#draw2ReorderLayer");
var toggleLayerButton = document.querySelector("#draw2ToggleLayer");
var toggleOnionButton = document.querySelector("#draw2ToggleOnion");
var onionOptionsElement = document.querySelector(".draw2-timeline-onion-options");
var onionPreviousElement = document.querySelector("#draw2OnionPrevious");
var onionPreviousValueElement = document.querySelector("#draw2OnionPreviousValue");
var onionNextElement = document.querySelector("#draw2OnionNext");
var onionNextValueElement = document.querySelector("#draw2OnionNextValue");
var onionOpacityElement = document.querySelector("#draw2OnionOpacity");
var onionOpacityValueElement = document.querySelector("#draw2OnionOpacityValue");
var onionColorModeElement = document.querySelector("#draw2OnionColorMode");
var togglePlaybackButton = document.querySelector("#draw2TogglePlayback");
var playbackFpsElement = document.querySelector("#draw2PlaybackFps");
var playbackFpsCustomElement = document.querySelector("#draw2PlaybackFpsCustom");
var playbackLoopElement = document.querySelector("#draw2PlaybackLoop");
var colorButtons = Array.from(document.querySelectorAll("[data-color-index]"));
var colorButtonGroups = Array.from(document.querySelectorAll("[data-color-group]"));
var colorMapElement = document.querySelector("#draw2ColorMap");
var paletteWheelElement = document.querySelector("#draw2PaletteWheel");
var hueCursorElement = document.querySelector("#draw2HueCursor");
var svCursorElement = document.querySelector("#draw2SvCursor");
var colorRElement = document.querySelector("#draw2ColorR");
var colorGElement = document.querySelector("#draw2ColorG");
var colorBElement = document.querySelector("#draw2ColorB");
var colorAlphaElement = document.querySelector("#draw2ColorAlpha");
var colorRValueElement = document.querySelector("#draw2ColorRValue");
var colorGValueElement = document.querySelector("#draw2ColorGValue");
var colorBValueElement = document.querySelector("#draw2ColorBValue");
var colorAlphaValueElement = document.querySelector("#draw2ColorAlphaValue");
var colorHexElement = document.querySelector("#draw2ColorHex");
var colorHexOutputElement = document.querySelector("#draw2ColorHexOutput");
var mobileColorOutputElements = Array.from(document.querySelectorAll("[data-draw2-color-output]"));
var colorApplyButton = document.querySelector("#draw2ColorApply");
var colorEditorStatusElement = document.querySelector("#draw2ColorEditorStatus");
var exportPanelStatusElement = document.querySelector("#draw2ExportPanelStatus");
var exportNameElement = document.querySelector("#draw2ExportName");
var exportScaleElement = document.querySelector("#draw2ExportScale");
var exportFormatCardsElement = document.querySelector("#draw2ExportFormatCards");
var exportSelectionSummaryElement = document.querySelector("#draw2ExportSelectionSummary");
var exportFormatOptionsElement = document.querySelector("#draw2ExportFormatOptions");
var exportPackageSectionElement = document.querySelector("#draw2ExportPackageSection");
var exportPackageSingleElement = document.querySelector("#draw2ExportPackageSingle");
var exportPackageZipElement = document.querySelector("#draw2ExportPackageZip");
var exportPreviewCanvasElement = document.querySelector("#draw2ExportPreviewCanvas");
var exportPreviewSummaryElement = document.querySelector("#draw2ExportPreviewSummary");
var exportOutputFilesElement = document.querySelector("#draw2ExportOutputFiles");
var exportProgressElement = document.querySelector("#draw2ExportProgress");
var exportProgressBarElement = document.querySelector("#draw2ExportProgressBar");
var exportProgressPercentElement = document.querySelector("#draw2ExportProgressPercent");
var exportProgressTitleElement = document.querySelector("#draw2ExportProgressTitle");
var exportProgressDetailElement = document.querySelector("#draw2ExportProgressDetail");
var exportProgressCurrentElement = document.querySelector("#draw2ExportProgressCurrent");
var exportProgressCountElement = document.querySelector("#draw2ExportProgressCount");
var exportProgressTrackElement = document.querySelector("#draw2ExportProgressTrack");
var exportExecuteButton = document.querySelector("#draw2ExportExecute");
var exportToMarketButton = document.querySelector("#draw2ExportToMarket");
var createButton = document.querySelector("#draw2CreateProject");
var openProjectDialogButton = document.querySelector("#draw2OpenProjectDialog");
var projectDialogElement = document.querySelector("#draw2ProjectDialog");
var projectDialogIdElement = document.querySelector("#draw2ProjectDialogId");
var projectDialogOpenButton = document.querySelector("#draw2ProjectOpen");
var projectDialogNewButton = document.querySelector("#draw2ProjectNew");
var projectDialogStatusElement = document.querySelector("#draw2ProjectDialogStatus");
var importPxdInput = document.querySelector("#draw2ImportPxd");
var gamePreviewStartButton = document.querySelector("#draw2GamePreviewStart");
var gamePreviewStopButton = document.querySelector("#draw2GamePreviewStop");
var gamePreviewRestartButton = document.querySelector("#draw2GamePreviewRestart");
var gamePreviewPinButton = document.querySelector("#draw2GamePreviewPin");
var gamePreviewReloadButton = document.querySelector("#draw2GamePreviewReload");
var gamePreviewStatusElement = document.querySelector("#draw2GamePreviewStatus");
var gamePreviewCanvasElement = document.querySelector("#draw2GamePreviewCanvas");
var advancedLoadButton = document.querySelector("#draw2AdvancedLoad");
var advancedPatternButton = document.querySelector("#draw2AdvancedPattern");
var advancedStampButton = document.querySelector("#draw2AdvancedStamp");
var advancedMirrorButton = document.querySelector("#draw2AdvancedMirror");
var advancedGridButton = document.querySelector("#draw2AdvancedGrid");
var advancedGuideButton = document.querySelector("#draw2AdvancedGuide");
var advancedStatusElement = document.querySelector("#draw2AdvancedStatus");
var toolStudioElement = document.querySelector("#draw2ToolStudio");
var toolStudioSummaryElement = document.querySelector("#draw2ToolStudioSummary");
var toolStudioStatusElement = document.querySelector("#draw2ToolStudioStatus");
var specialTileScaleElement = document.querySelector("#draw2SpecialTileScale");
var specialDuplicateFrameElement = document.querySelector("#draw2SpecialDuplicateFrame");
var specialOpenInspectorElement = document.querySelector("#draw2SpecialOpenInspector");
var settingsDialogElement = document.querySelector("#draw2SettingsDialog");
var settingsZoomSensitivityElement = document.querySelector("#draw2ZoomSensitivity");
var settingsZoomSensitivityValueElement = document.querySelector("#draw2ZoomSensitivityValue");
var settingsCheckerAElement = document.querySelector("#draw2CheckerA");
var settingsCheckerBElement = document.querySelector("#draw2CheckerB");
var settingsGridMinorElement = document.querySelector("#draw2GridMinor");
var settingsGridMajorElement = document.querySelector("#draw2GridMajor");
var settingsThemeAccentElement = document.querySelector("#draw2ThemeAccent");
var settingsResetButton = document.querySelector("#draw2SettingsReset");
var canvasSettingsDialogElement = document.querySelector("#draw2CanvasSettingsDialog");
var canvasSettingsProjectIdElement = document.querySelector("#draw2CanvasProjectId");
var canvasSettingsWidthElement = document.querySelector("#draw2CanvasWidth");
var canvasSettingsHeightElement = document.querySelector("#draw2CanvasHeight");
var canvasSettingsTileSizeElement = document.querySelector("#draw2CanvasTileSize");
var canvasSettingsApplyButton = document.querySelector("#draw2CanvasSettingsApply");
var canvasResizeSummaryElement = document.querySelector("#draw2CanvasResizeSummary");
var canvasResizePreviewFrameElement = document.querySelector("#draw2CanvasResizePreviewFrame");
var canvasResizePreviewContentElement = document.querySelector("#draw2CanvasResizePreviewContent");
var canvasResizeAnchorElements = Array.from(document.querySelectorAll("[data-canvas-resize-anchor]"));
var openCanvasSettingsButton = document.querySelector("#draw2OpenCanvasSettings");
var zoomLevelElement = document.querySelector("#draw2ZoomLevel");
var languageElement = document.querySelector("#draw2Language");
var shortcutsDialogElement = document.querySelector("#draw2ShortcutsDialog");
var shortcutSearchElement = document.querySelector("#draw2ShortcutSearch");
var shortcutListElement = document.querySelector("#draw2ShortcutList");
if (canvasElement === null || overlayElement === null || erasePreviewElement === null || viewportCenterButtonElement === null || pixelGridElement === null || pixelGridMinorPathElement === null || pixelGridMajorPathElement === null || selectionOverlayElement === null || mirrorGuideOverlayElement === null || mirrorGuideVerticalElement === null || mirrorGuideHorizontalElement === null || mirrorGuideDiagonalDownElement === null || mirrorGuideDiagonalUpElement === null || mirrorToggleXElement === null || mirrorToggleYElement === null || mirrorToggleDiagonalDownElement === null || mirrorToggleDiagonalUpElement === null || selectionOverlayRegionsElement === null || statusElement === null || metricsElement === null || selectionStatusElement === null || projectIdInputElement === null || tileSizeSelectElement === null || toolSelectElement === null || brushSizeElement === null || brushPatternElement === null || brushShapeElement === null || brushSizeControlElement === null || quickControlsElement === null || brushOptionsButtonElement === null || brushOptionsSummaryElement === null || brushOptionsFlyoutElement === null || brushOptionsCloseButtonElement === null || brushPresetElement === null || brushPresetNameElement === null || brushPresetSaveButton === null || brushPresetDeleteButton === null || mirrorModeToggleElement === null || viewportContextRailElement === null || similarityControlElement === null || similarityElement === null || similarityValueElement === null || colorSelectionModeElement === null || miniPreviewCanvasElement === null || miniPreviewContainerElement === null || miniPreviewPlayButtonElement === null || miniPreviewReferenceButtonElement === null || miniPreviewReferenceClearButtonElement === null || miniPreviewReferenceInputElement === null || miniPreviewReferenceStatusElement === null || miniPreviewCollapseButtonElement === null || miniPreviewRestoreButtonElement === null || miniPreviewResizeLeftElement === null || miniPreviewResizeBottomElement === null || miniPreviewResizeCornerElement === null || selectionXElement === null || selectionYElement === null || selectionWidthElement === null || selectionHeightElement === null || selectionModeElement === null || selectionExpandButton === null || selectionShrinkButton === null || selectionInvertButton === null || selectionBorderButton === null || transformOperationElement === null || transformDxElement === null || transformDyElement === null || transformFactorElement === null || selectButton === null || commitSelectionButton === null || cancelSelectionButton === null || previewButton === null || commitButton === null || cancelButton === null || flipHorizontalButton === null || flipVerticalButton === null || rotateCCWButton === null || rotateCWButton === null || rotate180Button === null || copyButton === null || cutButton === null || pasteButton === null || undoButton === null || redoButton === null || timelineCardElement === null || timelineContextMenu === null || createButton === null || importPxdInput === null || timelineStatusElement === null || timelineViewportElement === null || timelineSpacerElement === null || timelineWindowElement === null || timelinePropertiesResizeElement === null || timelinePropertiesElement === null || timelinePropertiesBodyElement === null || timelinePropertiesCollapseElement === null || timelineSecondaryControlsElement === null || animationTagNameElement === null || animationTagFromElement === null || animationTagToElement === null || animationTagLoopElement === null || animationTagAddElement === null || animationTagListElement === null || timelineMarkerKindElement === null || timelineMarkerLabelElement === null || timelineMarkerAddElement === null || timelineMarkerListElement === null || linkedCelToggleElement === null || linkedCelStatusElement === null || addFrameButton === null || duplicateFrameButton === null || removeFrameButton === null || addLayerButton === null || reorderLayerButton === null || toggleLayerButton === null || toggleOnionButton === null || togglePlaybackButton === null || onionOptionsElement === null || onionPreviousElement === null || onionPreviousValueElement === null || onionNextElement === null || onionNextValueElement === null || onionOpacityElement === null || onionOpacityValueElement === null || onionColorModeElement === null || playbackFpsElement === null || playbackLoopElement === null || playbackFpsCustomElement === null || colorMapElement === null || paletteWheelElement === null || hueCursorElement === null || svCursorElement === null || colorRElement === null || colorGElement === null || colorBElement === null || colorAlphaElement === null || colorRValueElement === null || colorGValueElement === null || colorBValueElement === null || colorAlphaValueElement === null || colorHexElement === null || colorHexOutputElement === null || colorApplyButton === null || colorEditorStatusElement === null || gamePreviewStartButton === null || gamePreviewStopButton === null || gamePreviewRestartButton === null || gamePreviewPinButton === null || gamePreviewReloadButton === null || gamePreviewStatusElement === null || gamePreviewCanvasElement === null || advancedLoadButton === null || advancedPatternButton === null || advancedStampButton === null || advancedMirrorButton === null || advancedGridButton === null || advancedGuideButton === null || advancedStatusElement === null || languageElement === null || exportPanelStatusElement === null || exportNameElement === null || exportScaleElement === null || exportFormatCardsElement === null || exportSelectionSummaryElement === null || exportFormatOptionsElement === null || exportPackageSectionElement === null || exportPackageSingleElement === null || exportPackageZipElement === null || exportPreviewCanvasElement === null || exportPreviewSummaryElement === null || exportOutputFilesElement === null || exportProgressElement === null || exportProgressBarElement === null || exportProgressPercentElement === null || exportProgressTitleElement === null || exportProgressDetailElement === null || exportProgressCurrentElement === null || exportProgressCountElement === null || exportProgressTrackElement === null || exportExecuteButton === null || exportToMarketButton === null) {
  throw new Error("Draw2 isolated entry is missing a required element.");
}
if (canvasSettingsDialogElement === null || canvasSettingsProjectIdElement === null || canvasSettingsWidthElement === null || canvasSettingsHeightElement === null || canvasSettingsTileSizeElement === null || canvasSettingsApplyButton === null || openCanvasSettingsButton === null || openProjectDialogButton === null || projectDialogElement === null || projectDialogIdElement === null || projectDialogOpenButton === null || projectDialogNewButton === null || projectDialogStatusElement === null) {
  throw new Error("Draw2 isolated entry is missing Project or canvas settings controls.");
}
if (canvasResizeSummaryElement === null || canvasResizePreviewFrameElement === null || canvasResizePreviewContentElement === null || canvasResizeAnchorElements.length !== 9) {
  throw new Error("Draw2 isolated entry is missing canvas resize preview controls.");
}
var canvasSettingsDialog = canvasSettingsDialogElement;
var canvasSettingsProjectId = canvasSettingsProjectIdElement;
var canvasSettingsWidth = canvasSettingsWidthElement;
var canvasSettingsHeight = canvasSettingsHeightElement;
var canvasSettingsTileSize = canvasSettingsTileSizeElement;
var canvasSettingsApply = canvasSettingsApplyButton;
var openCanvasSettings = openCanvasSettingsButton;
var openProjectDialogTrigger = openProjectDialogButton;
var projectDialog = projectDialogElement;
var projectDialogId = projectDialogIdElement;
var projectDialogOpen = projectDialogOpenButton;
var projectDialogNew = projectDialogNewButton;
var projectDialogStatus = projectDialogStatusElement;
var languageControl = languageElement;
var mirrorToggleX = mirrorToggleXElement;
var mirrorToggleY = mirrorToggleYElement;
var mirrorToggleDiagonalDown = mirrorToggleDiagonalDownElement;
var mirrorToggleDiagonalUp = mirrorToggleDiagonalUpElement;
var onionPrevious = onionPreviousElement;
var onionPreviousValue = onionPreviousValueElement;
var onionNext = onionNextElement;
var onionNextValue = onionNextValueElement;
var onionOpacity = onionOpacityElement;
var onionOpacityValue = onionOpacityValueElement;
var onionColorMode = onionColorModeElement;
var canvasResizeSummary = canvasResizeSummaryElement;
var canvasResizePreviewFrame = canvasResizePreviewFrameElement;
var canvasResizePreviewContent = canvasResizePreviewContentElement;
var drawPersistenceStore = createIndexedDbDraw2PersistenceStore();
var workspaceManifestStore = createIndexedDbWorkspaceManifestStore();
var DRAW2_PERSISTED_HISTORY_LIMIT = 32;
var DRAW2_PERSISTED_JOURNAL_LIMIT = 32;
var DRAW2_PERSISTENCE_DEBOUNCE_MS = 250;
var drawPersistenceRevision = 0;
var drawPersistenceSaveQueue = Promise.resolve();
var drawPersistenceSaveTimer;
var drawPersistenceSavePending = false;
var drawPersistenceSaveReason = "edit";
function drawJournalSnapshot() {
  const operations = journal.operations.slice(-DRAW2_PERSISTED_JOURNAL_LIMIT);
  const dirtyTileWrites = journal.dirtyTileWrites.slice(-DRAW2_PERSISTED_JOURNAL_LIMIT);
  return {
    operations: operations.map((operation) => ({
      ...operation
    })),
    dirtyTileWrites: dirtyTileWrites.map((write) => ({
      assetId: write.assetId,
      tiles: write.tiles.map((tile) => ({
        tileKey: tile.tileKey,
        bytes: Array.from(tile.bytes)
      }))
    }))
  };
}
function queueDrawPersistenceSave(reason) {
  drawPersistenceSavePending = true;
  drawPersistenceSaveReason = reason;
  if (drawPersistenceSaveTimer !== void 0) return;
  drawPersistenceSaveTimer = window.setTimeout(() => {
    drawPersistenceSaveTimer = void 0;
    void drainDrawPersistenceSave();
  }, DRAW2_PERSISTENCE_DEBOUNCE_MS);
}
async function drainDrawPersistenceSave() {
  if (!drawPersistenceSavePending) return;
  const reason = drawPersistenceSaveReason;
  drawPersistenceSavePending = false;
  const snapshotState = state;
  const snapshotHistory = history.snapshot(DRAW2_PERSISTED_HISTORY_LIMIT);
  const snapshotJournal = drawJournalSnapshot();
  const projectId = snapshotState.projectId;
  const revision = drawPersistenceRevision + 1;
  drawPersistenceRevision = revision;
  drawPersistenceSaveQueue = drawPersistenceSaveQueue.then(async () => {
    const record2 = await createDraw2PersistenceRecord(snapshotState, snapshotHistory, snapshotJournal, revision, (/* @__PURE__ */ new Date()).toISOString(), assetDefinitions, draw2TimelineMetadataSnapshot());
    const saved = await drawPersistenceStore.save(record2);
    if (!saved.ok) {
      document.body.dataset.drawPersistenceState = "unavailable";
      return;
    }
    document.body.dataset.drawPersistenceState = saved.stale ? "stale-write-ignored" : reason === "recovery" ? "restored" : "saved";
    document.body.dataset.drawPersistenceRevision = String(revision);
    await workspaceManifestStore.updateModule(asWorkspaceProjectId(projectId), "draw", {
      status: "READY",
      revision,
      stateHash: record2.stateHash,
      savedAt: record2.savedAt
    }, snapshotState.name);
  }).catch(() => {
    document.body.dataset.drawPersistenceState = "error";
  });
  await drawPersistenceSaveQueue.catch(() => void 0);
  if (drawPersistenceSavePending) await drainDrawPersistenceSave();
}
async function flushDrawPersistence() {
  while (true) {
    if (drawPersistenceSaveTimer !== void 0) {
      window.clearTimeout(drawPersistenceSaveTimer);
      drawPersistenceSaveTimer = void 0;
    }
    if (drawPersistenceSavePending) await drainDrawPersistenceSave();
    const queue = drawPersistenceSaveQueue;
    await queue.catch(() => void 0);
    if (!drawPersistenceSavePending && drawPersistenceSaveTimer === void 0 && queue === drawPersistenceSaveQueue) return;
  }
}
var flushDrawPersistenceOnPageExit = () => {
  flushDraw2EditorPreferences();
  void flushDrawPersistence();
};
window.addEventListener("pagehide", flushDrawPersistenceOnPageExit);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushDrawPersistenceOnPageExit();
  }
});
function saveDrawProjectState(reason = "edit") {
  repository.save(state);
  queueDrawPersistenceSave(reason);
}
var canvas = canvasElement;
var overlay = overlayElement;
var erasePreview = erasePreviewElement;
var tilesetSourceCanvas = tilesetSourceCanvasElement;
var pixelGrid = pixelGridElement;
var pixelGridMinorPath = pixelGridMinorPathElement;
var pixelGridMajorPath = pixelGridMajorPathElement;
var tilemapGrid = tilemapGridElement;
var tilemapGridMinorPath = tilemapGridMinorPathElement;
var tilemapGridMajorPath = tilemapGridMajorPathElement;
var lastViewportDisplayWidth = -1;
var lastViewportDisplayHeight = -1;
var lastViewportRenderedScaleX = -1;
var lastViewportRenderedScaleY = -1;
var lastPixelGridLayoutKey = "";
document.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch" || event.button !== 0) return;
  const active = document.activeElement;
  const target = event.target instanceof Element ? event.target : null;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) || target === null || active === target || active.contains(target)) return;
  if (target.closest("input, textarea, select, [contenteditable=true]") !== null) {
    return;
  }
  const immediateAction = target.closest("button, a, canvas, [role=button], [role=tab], [role=menuitem], [data-workspace-tool]");
  if (immediateAction === null) return;
  if (event.cancelable) event.preventDefault();
  window.setTimeout(() => {
    if (document.activeElement === active) active.blur();
  }, 0);
}, {
  capture: true
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement) || field.type === "button" || field.type === "submit" || field.type === "reset" || field.type === "file" || field.type === "checkbox" || field.type === "radio") return;
  if (event.cancelable) event.preventDefault();
  field.blur();
}, {
  capture: true
});
var lastTilemapGridLayoutKey = "";
var selectionOverlay = selectionOverlayElement;
var selectionOverlayRegions = selectionOverlayRegionsElement;
var status = statusElement;
var metrics = metricsElement;
var selectionStatus = selectionStatusElement;
var projectIdInput = projectIdInputElement;
var activeProjectId = readActiveWorkspaceProjectId();
if (projectIdInput.value.trim() === DEFAULT_WORKSPACE_PROJECT_ID) {
  projectIdInput.value = activeProjectId;
}
var tileSizeSelect = tileSizeSelectElement;
var toolSelect = toolSelectElement;
var brushSize = brushSizeElement;
var brushPattern = brushPatternElement;
var brushShape = brushShapeElement;
var brushSizeControl = brushSizeControlElement;
var quickControls = quickControlsElement;
var brushOptionsButton = brushOptionsButtonElement;
var brushOptionsSummary = brushOptionsSummaryElement;
var brushOptionsFlyout = brushOptionsFlyoutElement;
var brushOptionsCloseButton = brushOptionsCloseButtonElement;
var brushPreset = brushPresetElement;
var brushPresetName = brushPresetNameElement;
var mirrorModeControl = mirrorModeToggleElement;
var viewportContextRail = viewportContextRailElement;
var similarityControl = similarityControlElement;
var similarity = similarityElement;
var similarityValue = similarityValueElement;
var colorSelectionModeControl = colorSelectionModeElement;
var miniPreviewCanvas = miniPreviewCanvasElement;
var miniPreviewPlayButton = miniPreviewPlayButtonElement;
var miniPreviewReferenceButton = miniPreviewReferenceButtonElement;
var miniPreviewReferenceClearButton = miniPreviewReferenceClearButtonElement;
var miniPreviewReferenceInput = miniPreviewReferenceInputElement;
var miniPreviewReferenceStatus = miniPreviewReferenceStatusElement;
var selectionX = selectionXElement;
var selectionY = selectionYElement;
var selectionWidth = selectionWidthElement;
var selectionHeight = selectionHeightElement;
var selectionModeControl = selectionModeElement;
var transformOperation = transformOperationElement;
var transformDx = transformDxElement;
var transformDy = transformDyElement;
var transformFactor = transformFactorElement;
var commitSelectionControl = commitSelectionButton;
var cancelSelectionControl = cancelSelectionButton;
var cancelTransformControl = cancelButton;
var copyControl = copyButton;
var cutControl = cutButton;
var pasteControl = pasteButton;
var gamePreviewStartControl = gamePreviewStartButton;
var gamePreviewStopControl = gamePreviewStopButton;
var gamePreviewRestartControl = gamePreviewRestartButton;
var gamePreviewPinControl = gamePreviewPinButton;
var gamePreviewReloadControl = gamePreviewReloadButton;
var gamePreviewStatus = gamePreviewStatusElement;
var gamePreviewCanvas = gamePreviewCanvasElement;
var gamePreviewContextCandidate = gamePreviewCanvas.getContext("2d");
if (gamePreviewContextCandidate === null) {
  throw new Error("Isolated Runtime preview could not acquire Canvas2D.");
}
var gamePreviewContext = gamePreviewContextCandidate;
var miniPreviewContextCandidate = miniPreviewCanvas.getContext("2d", {
  alpha: false
});
if (miniPreviewContextCandidate === null) {
  throw new Error("Draw2 mini preview could not acquire Canvas2D.");
}
var miniPreviewContext = miniPreviewContextCandidate;
var audioDrawPreviewContext = audioDrawPreviewCanvasElement?.getContext("2d", {
  alpha: false
}) ?? void 0;
var virtualCursorEnabled = true;
var draw2EditorPreferencesReady = false;
var miniPreviewEnabled = false;
var MINI_PREVIEW_LAYOUT_KEY = "pixieed:draw2:mini-preview-layout:v1";
var MINI_PREVIEW_MIN_SIZE = 112;
var MINI_PREVIEW_MAX_WIDTH = 360;
var MINI_PREVIEW_MAX_HEIGHT = 280;
function clampMiniPreview(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}
function readMiniPreviewLayout() {
  try {
    const raw = window.localStorage.getItem(MINI_PREVIEW_LAYOUT_KEY);
    if (raw === null) {
      return {
        width: 148,
        height: 148,
        collapsed: false
      };
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {
        width: 148,
        height: 148,
        collapsed: false
      };
    }
    const record2 = parsed;
    return {
      width: clampMiniPreview(typeof record2.width === "number" ? record2.width : 148, MINI_PREVIEW_MIN_SIZE, MINI_PREVIEW_MAX_WIDTH),
      height: clampMiniPreview(typeof record2.height === "number" ? record2.height : 148, MINI_PREVIEW_MIN_SIZE, MINI_PREVIEW_MAX_HEIGHT),
      collapsed: record2.collapsed === true
    };
  } catch {
    return {
      width: 148,
      height: 148,
      collapsed: false
    };
  }
}
var miniPreviewLayout = readMiniPreviewLayout();
var miniPreviewResizeSession;
function persistMiniPreviewLayout() {
  try {
    window.localStorage.setItem(MINI_PREVIEW_LAYOUT_KEY, JSON.stringify(miniPreviewLayout));
  } catch {
  }
}
function miniPreviewIsVisible() {
  return miniPreviewEnabled && !miniPreviewLayout.collapsed;
}
function syncMiniPreviewLayout() {
  const { width, height, collapsed } = miniPreviewLayout;
  miniPreviewContainerElement.style.setProperty("--draw2-mini-preview-width", `${width}px`);
  miniPreviewContainerElement.style.setProperty("--draw2-mini-preview-height", `${height}px`);
  miniPreviewContainerElement.hidden = !miniPreviewIsVisible();
  const previewVisible = miniPreviewEnabled && !collapsed;
  const compactPreviewHost = workspaceFrameElement?.dataset.workspaceProfile === "mobile" || workspaceFrameElement?.dataset.workspaceProfile === "tablet" && workspaceFrameElement.dataset.workspaceOrientation === "portrait";
  miniPreviewRestoreButtonElement.hidden = previewVisible && !compactPreviewHost;
  const previewToggleLabel = previewVisible ? "Hide mini preview" : "Open mini preview";
  miniPreviewRestoreButtonElement.setAttribute("aria-label", previewToggleLabel);
  miniPreviewRestoreButtonElement.title = previewToggleLabel;
  miniPreviewRestoreButtonElement.setAttribute("aria-pressed", String(miniPreviewEnabled && !collapsed));
  const previewToggleText = miniPreviewRestoreButtonElement.querySelector("span");
  if (previewToggleText !== null) {
    previewToggleText.textContent = previewVisible ? "Hide preview" : "Mini preview";
  }
}
function finishMiniPreviewResize(pointerId) {
  const session = miniPreviewResizeSession;
  if (session === void 0 || session.pointerId !== pointerId) return;
  miniPreviewResizeSession = void 0;
  persistMiniPreviewLayout();
  syncMiniPreviewLayout();
}
function updateMiniPreviewResize(event) {
  const session = miniPreviewResizeSession;
  if (session === void 0 || session.pointerId !== event.pointerId) return;
  const nextWidth = session.mode === "bottom" ? session.startWidth : clampMiniPreview(session.startRight - event.clientX, MINI_PREVIEW_MIN_SIZE, MINI_PREVIEW_MAX_WIDTH);
  const nextHeight = session.mode === "left" ? session.startHeight : clampMiniPreview(event.clientY - session.startTop, MINI_PREVIEW_MIN_SIZE, MINI_PREVIEW_MAX_HEIGHT);
  miniPreviewLayout = {
    ...miniPreviewLayout,
    width: nextWidth,
    height: nextHeight
  };
  syncMiniPreviewLayout();
  drawMiniPreviewProjection();
  if (event.cancelable) event.preventDefault();
}
function beginMiniPreviewResize(mode, event) {
  if (event.button !== 0 && event.pointerType === "mouse") return;
  const rect = miniPreviewContainerElement.getBoundingClientRect();
  miniPreviewResizeSession = {
    mode,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
    startRight: rect.right,
    startTop: rect.top
  };
  const handle = event.currentTarget;
  if (handle instanceof HTMLElement) handle.setPointerCapture(event.pointerId);
  if (event.cancelable) event.preventDefault();
}
function bindMiniPreviewResize(element, mode) {
  element.addEventListener("pointerdown", (event) => {
    beginMiniPreviewResize(mode, event);
  });
  element.addEventListener("pointercancel", (event) => {
    finishMiniPreviewResize(event.pointerId);
  });
  element.addEventListener("lostpointercapture", (event) => {
    finishMiniPreviewResize(event.pointerId);
  });
}
window.addEventListener("pointermove", updateMiniPreviewResize);
window.addEventListener("pointerup", (event) => {
  finishMiniPreviewResize(event.pointerId);
});
window.addEventListener("pointercancel", (event) => {
  finishMiniPreviewResize(event.pointerId);
});
syncMiniPreviewLayout();
var miniPreviewReferenceSource;
var miniPreviewReferenceObjectUrl;
var miniPreviewBackingWidth = miniPreviewCanvas.width;
var miniPreviewBackingHeight = miniPreviewCanvas.height;
function closeMiniPreviewReferenceSource() {
  const source = miniPreviewReferenceSource;
  if (source !== void 0 && "close" in source) {
    const close = source.close;
    close?.call(source);
  }
  miniPreviewReferenceSource = void 0;
  if (miniPreviewReferenceObjectUrl !== void 0) {
    URL.revokeObjectURL(miniPreviewReferenceObjectUrl);
    miniPreviewReferenceObjectUrl = void 0;
  }
}
function setMiniPreviewReferenceStatus(message) {
  miniPreviewReferenceStatus.textContent = localizeDraw2Text(message);
}
async function readMiniPreviewReference(file) {
  if (!file.type.startsWith("image/")) {
    setMiniPreviewReferenceStatus("Reference image is not supported.");
    return;
  }
  closeMiniPreviewReferenceSource();
  try {
    if (typeof createImageBitmap === "function") {
      miniPreviewReferenceSource = await createImageBitmap(file);
    } else {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await image.decode();
      miniPreviewReferenceObjectUrl = objectUrl;
      miniPreviewReferenceSource = image;
    }
    miniPreviewReferenceClearButton.disabled = false;
    miniPreviewReferenceButton.setAttribute("aria-pressed", "true");
    setMiniPreviewReferenceStatus(`Reference: ${file.name}`);
    drawMiniPreviewProjection();
  } catch (cause) {
    closeMiniPreviewReferenceSource();
    miniPreviewReferenceClearButton.disabled = true;
    miniPreviewReferenceButton.setAttribute("aria-pressed", "false");
    setMiniPreviewReferenceStatus(cause instanceof Error ? cause.message : "Reference image could not be read.");
  }
}
function miniPreviewSourceSize(source) {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth,
      height: source.naturalHeight
    };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return {
      width: source.width,
      height: source.height
    };
  }
  const canvasSource = source;
  return {
    width: canvasSource.width,
    height: canvasSource.height
  };
}
function syncMiniPreviewCanvasResolution() {
  if (!miniPreviewIsVisible()) return;
  const display = miniPreviewCanvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const maxBackingSide = 768;
  const displayWidth = Math.max(1, Math.round(display.width * dpr));
  const displayHeight = Math.max(1, Math.round(display.height * dpr));
  const sourceWidth = Math.max(1, Math.min(canvas.width, maxBackingSide));
  const sourceHeight = Math.max(1, Math.min(canvas.height, maxBackingSide));
  const width = Math.max(96, Math.min(maxBackingSide, Math.max(displayWidth, sourceWidth)));
  const height = Math.max(96, Math.min(maxBackingSide, Math.max(displayHeight, sourceHeight)));
  if (width === miniPreviewBackingWidth && height === miniPreviewBackingHeight) return;
  miniPreviewCanvas.width = width;
  miniPreviewCanvas.height = height;
  miniPreviewBackingWidth = width;
  miniPreviewBackingHeight = height;
  miniPreviewContext.imageSmoothingEnabled = false;
}
function drawMiniPreviewSource(source, alpha, smoothing) {
  drawCanvasPreviewSource(miniPreviewCanvas, miniPreviewContext, source, alpha, smoothing);
}
function drawCanvasPreviewSource(targetCanvas, targetContext, source, alpha, smoothing) {
  const sourceSize = miniPreviewSourceSize(source);
  if (sourceSize.width <= 0 || sourceSize.height <= 0) return;
  const scale = Math.min(targetCanvas.width / sourceSize.width, targetCanvas.height / sourceSize.height);
  const width = Math.max(1, Math.round(sourceSize.width * scale));
  const height = Math.max(1, Math.round(sourceSize.height * scale));
  const x = Math.floor((targetCanvas.width - width) / 2);
  const y = Math.floor((targetCanvas.height - height) / 2);
  targetContext.save();
  targetContext.globalAlpha = alpha;
  targetContext.imageSmoothingEnabled = smoothing;
  targetContext.drawImage(source, 0, 0, sourceSize.width, sourceSize.height, x, y, width, height);
  targetContext.restore();
}
function syncAudioDrawPreviewCanvasResolution() {
  if (audioDrawPreviewCanvasElement === null || audioDrawPreviewContext === void 0) return;
  const display = audioDrawPreviewCanvasElement.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const maxBackingSide = 768;
  const sourceWidth = Math.max(1, Math.min(canvas.width, maxBackingSide));
  const sourceHeight = Math.max(1, Math.min(canvas.height, maxBackingSide));
  const displayWidth = Math.max(1, Math.round((display.width || 256) * dpr));
  const displayHeight = Math.max(1, Math.round((display.height || 256) * dpr));
  const width = Math.max(96, Math.min(maxBackingSide, Math.max(displayWidth, sourceWidth)));
  const height = Math.max(96, Math.min(maxBackingSide, Math.max(displayHeight, sourceHeight)));
  if (audioDrawPreviewCanvasElement.width !== width || audioDrawPreviewCanvasElement.height !== height) {
    audioDrawPreviewCanvasElement.width = width;
    audioDrawPreviewCanvasElement.height = height;
  }
  audioDrawPreviewContext.imageSmoothingEnabled = false;
}
function drawAudioDrawPreviewProjection() {
  if (audioDrawPreviewCanvasElement === null || audioDrawPreviewContext === void 0) return;
  syncAudioDrawPreviewCanvasResolution();
  audioDrawPreviewContext.clearRect(0, 0, audioDrawPreviewCanvasElement.width, audioDrawPreviewCanvasElement.height);
  audioDrawPreviewContext.fillStyle = "#0b0e14";
  audioDrawPreviewContext.fillRect(0, 0, audioDrawPreviewCanvasElement.width, audioDrawPreviewCanvasElement.height);
  drawCanvasPreviewSource(audioDrawPreviewCanvasElement, audioDrawPreviewContext, canvas, 1, false);
}
function drawMiniPreviewProjection() {
  drawAudioDrawPreviewProjection();
  if (!miniPreviewIsVisible()) return;
  syncMiniPreviewCanvasResolution();
  miniPreviewContext.clearRect(0, 0, miniPreviewCanvas.width, miniPreviewCanvas.height);
  miniPreviewContext.fillStyle = "#0b0e14";
  miniPreviewContext.fillRect(0, 0, miniPreviewCanvas.width, miniPreviewCanvas.height);
  if (miniPreviewReferenceSource !== void 0) {
    drawMiniPreviewSource(miniPreviewReferenceSource, 0.48, true);
  }
  drawMiniPreviewSource(canvas, 1, false);
}
function syncMiniPreviewPlaybackControl() {
  const playing = playbackRunning || audioLinkedPreviewPlaying;
  const use = miniPreviewPlayButton.querySelector("use");
  use?.setAttribute("href", `./assets/icons/draw2-icons.svg#icon-${playing ? "pause" : "play"}`);
  miniPreviewPlayButton.setAttribute("aria-pressed", String(playing));
  miniPreviewPlayButton.setAttribute("aria-label", localizeDraw2Text(playing ? "Stop mini preview" : "Play mini preview"));
  miniPreviewPlayButton.title = localizeDraw2Text(playing ? "Stop mini preview" : "Play mini preview");
}
var viewportZoom = 1;
var viewportFitMode = true;
var viewportModeUserSelected = false;
var viewportPanX = 0;
var viewportPanY = 0;
var zoomWheelAccumulator = 0;
var lastViewportPointerClient;
var viewportCenterSourcePoint;
var viewportCenterReturnFrame;
var VIEWPORT_CENTER_RETURN_DURATION_MS = 180;
var visualSettings = readDraw2VisualSettings((() => {
  try {
    return window.localStorage;
  } catch {
    return void 0;
  }
})());
function readStoredDraw2Locale() {
  try {
    return normalizeDraw2Locale(window.localStorage.getItem("pixieed:draw2:locale:v1"));
  } catch {
    return "en";
  }
}
var draw2Locale = readStoredDraw2Locale();
var draw2TextTranslationSources = /* @__PURE__ */ new WeakMap();
var draw2AttributeTranslationSources = /* @__PURE__ */ new WeakMap();
function translateDraw2Subtree(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    const textNode = node;
    if (textNode.textContent !== null) {
      const current = textNode.textContent;
      const previous = draw2TextTranslationSources.get(textNode);
      const source = previous !== void 0 && (current === previous.source || current === previous.translated) ? previous.source : current;
      const translated = translateDraw2Text(source, draw2Locale);
      if (translated !== current) textNode.textContent = translated;
      draw2TextTranslationSources.set(textNode, {
        source,
        translated
      });
    }
    node = walker.nextNode();
  }
  const elements = root instanceof Element ? [
    root,
    ...root.querySelectorAll("[aria-label], [title], [placeholder]")
  ] : [
    ...root.querySelectorAll("[aria-label], [title], [placeholder]")
  ];
  for (const element of elements) {
    let sources = draw2AttributeTranslationSources.get(element);
    if (sources === void 0) {
      sources = /* @__PURE__ */ new Map();
      draw2AttributeTranslationSources.set(element, sources);
    }
    for (const attribute of [
      "aria-label",
      "title",
      "placeholder"
    ]) {
      const value = element.getAttribute(attribute);
      if (value !== null) {
        const previous = sources.get(attribute);
        const source = previous !== void 0 && (value === previous.source || value === previous.translated) ? previous.source : value;
        const translated = translateDraw2Text(source, draw2Locale);
        if (translated !== value) element.setAttribute(attribute, translated);
        sources.set(attribute, {
          source,
          translated
        });
      }
    }
  }
}
function localizeDraw2Text(value) {
  return translateDraw2Text(value, draw2Locale);
}
function applyDraw2Locale(nextLocale = draw2Locale, persist = true) {
  draw2Locale = normalizeDraw2Locale(nextLocale);
  document.documentElement.lang = draw2Locale;
  languageControl.value = draw2Locale;
  updatePlaybackLoopControl();
  translateDraw2Subtree(document.body);
  if (persist) {
    try {
      window.localStorage.setItem("pixieed:draw2:locale:v1", draw2Locale);
    } catch (cause) {
    }
  }
}
function applyVisualSettings(nextSettings = visualSettings, persist = true) {
  visualSettings = normalizeDraw2VisualSettings(nextSettings);
  const root = document.documentElement;
  root.style.setProperty("--draw2-canvas-checker-a", visualSettings.checkerA);
  root.style.setProperty("--draw2-canvas-checker-b", visualSettings.checkerB);
  root.style.setProperty("--draw2-grid-minor", visualSettings.gridMinor);
  root.style.setProperty("--draw2-grid-major", visualSettings.gridMajor);
  root.style.setProperty("--draw2-accent", visualSettings.themeAccent);
  root.style.setProperty("--draw2-accent-strong", visualSettings.themeAccent);
  if (persist) {
    try {
      writeDraw2VisualSettings(window.localStorage, visualSettings);
    } catch {
    }
  }
  if (settingsZoomSensitivityElement !== null) {
    settingsZoomSensitivityElement.value = String(visualSettings.zoomSensitivity);
  }
  if (settingsZoomSensitivityValueElement !== null) {
    settingsZoomSensitivityValueElement.value = `${Math.round(visualSettings.zoomSensitivity * 100)}%`;
  }
  if (settingsCheckerAElement !== null) {
    settingsCheckerAElement.value = visualSettings.checkerA;
  }
  if (settingsCheckerBElement !== null) {
    settingsCheckerBElement.value = visualSettings.checkerB;
  }
  if (settingsGridMinorElement !== null) {
    settingsGridMinorElement.value = visualSettings.gridMinor;
  }
  if (settingsGridMajorElement !== null) {
    settingsGridMajorElement.value = visualSettings.gridMajor;
  }
  if (settingsThemeAccentElement !== null) {
    settingsThemeAccentElement.value = visualSettings.themeAccent;
  }
  updatePixelGridOverlay();
}
function currentZoomPercent() {
  const percent = Math.round(currentViewportDisplayScale() * 100);
  return viewportFitMode ? `Fit \xB7 ${percent}%` : `${percent}%`;
}
function cancelViewportCenterReturn() {
  if (viewportCenterReturnFrame === void 0) return;
  cancelAnimationFrame(viewportCenterReturnFrame);
  viewportCenterReturnFrame = void 0;
}
function usesResponsiveViewportFit() {
  const profile = workspaceFrameElement?.dataset.workspaceProfile;
  const orientation = workspaceFrameElement?.dataset.workspaceOrientation;
  return profile === "mobile" || profile === "tablet" && orientation === "portrait";
}
function syncInitialViewportMode() {
  if (viewportModeUserSelected) return;
  const fitByDefault = shouldUseInitialViewportFit();
  if (viewportFitMode === fitByDefault) return;
  viewportFitMode = fitByDefault;
  viewportPanX = 0;
  viewportPanY = 0;
}
function viewportAvailableSize() {
  if (viewportWrapElement === null) return {
    width: 0,
    height: 0
  };
  const styles = getComputedStyle(viewportWrapElement);
  const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  return {
    width: Math.max(0, viewportWrapElement.clientWidth - horizontalPadding),
    height: Math.max(0, viewportWrapElement.clientHeight - verticalPadding)
  };
}
function shouldUseInitialViewportFit() {
  if (usesResponsiveViewportFit()) return true;
  const available = viewportAvailableSize();
  const availableWidth = available.width;
  const availableHeight = available.height;
  if (availableWidth <= 0 || availableHeight <= 0 || canvas.width <= 0 || canvas.height <= 0) return false;
  return canvas.width > availableWidth || canvas.height > availableHeight;
}
function viewportFitScale() {
  if (viewportWrapElement === null) return 1;
  const available = viewportAvailableSize();
  const availableWidth = available.width;
  const availableHeight = available.height;
  if (availableWidth <= 0 || availableHeight <= 0 || canvas.width <= 0 || canvas.height <= 0) return 1;
  return Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, availableWidth / canvas.width, availableHeight / canvas.height));
}
function currentViewportDisplayScale() {
  if (viewportFitMode) return viewportFitScale();
  const freeZoom = Number.isFinite(viewportZoom) ? Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, viewportZoom)) : 1;
  return Math.max(MIN_VIEWPORT_ZOOM, freeZoom);
}
function viewportPanLimits() {
  if (viewportWrapElement === null || canvasStackElement === null) {
    return void 0;
  }
  const viewportSize = viewportAvailableSize();
  const viewportWidth = viewportSize.width;
  const viewportHeight = viewportSize.height;
  if (viewportWidth <= 0 || viewportHeight <= 0) return void 0;
  const contentWidth = canvasStackElement.clientWidth || Math.max(1, Math.round(canvas.width * currentViewportDisplayScale()));
  const contentHeight = canvasStackElement.clientHeight || Math.max(1, Math.round(canvas.height * currentViewportDisplayScale()));
  return {
    x: Math.max(0, (contentWidth - viewportWidth) / 2),
    y: Math.max(0, (contentHeight - viewportHeight) / 2)
  };
}
function clampViewportPanValues(panX, panY) {
  const limits = viewportPanLimits();
  if (limits === void 0) {
    return {
      x: Number.isFinite(panX) ? panX : 0,
      y: Number.isFinite(panY) ? panY : 0
    };
  }
  return {
    x: Math.max(-limits.x, Math.min(limits.x, Number.isFinite(panX) ? panX : 0)),
    y: Math.max(-limits.y, Math.min(limits.y, Number.isFinite(panY) ? panY : 0))
  };
}
function animateViewportPanTo(fromX, fromY, toX, toY) {
  cancelViewportCenterReturn();
  const startX = Number.isFinite(fromX) ? fromX : 0;
  const startY = Number.isFinite(fromY) ? fromY : 0;
  const targetX = Number.isFinite(toX) ? toX : 0;
  const targetY = Number.isFinite(toY) ? toY : 0;
  if (Math.abs(startX - targetX) < 0.5 && Math.abs(startY - targetY) < 0.5) {
    viewportPanX = targetX;
    viewportPanY = targetY;
    applyViewportTransform({
      clampPan: false
    });
    return;
  }
  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, Math.max(0, (now - startedAt) / VIEWPORT_CENTER_RETURN_DURATION_MS));
    const eased = 1 - Math.pow(1 - progress, 3);
    viewportPanX = startX + (targetX - startX) * eased;
    viewportPanY = startY + (targetY - startY) * eased;
    applyViewportTransform({
      clampPan: false
    });
    if (progress < 1) {
      viewportCenterReturnFrame = requestAnimationFrame(tick);
      return;
    }
    viewportPanX = targetX;
    viewportPanY = targetY;
    viewportCenterReturnFrame = void 0;
    applyViewportTransform();
  };
  viewportCenterReturnFrame = requestAnimationFrame(tick);
}
function animateViewportCenterReturn(fromX, fromY) {
  animateViewportPanTo(fromX, fromY, 0, 0);
}
function applyViewportDisplaySize() {
  if (canvasStackElement === null) return;
  const displayScale = currentViewportDisplayScale();
  const displayWidth = Math.max(1, Math.round(canvas.width * displayScale));
  const displayHeight = Math.max(1, Math.round(canvas.height * displayScale));
  const renderedScaleX = displayWidth / Math.max(1, canvas.width);
  const renderedScaleY = displayHeight / Math.max(1, canvas.height);
  const displayGeometryUnchanged = lastViewportDisplayWidth === displayWidth && lastViewportDisplayHeight === displayHeight && lastViewportRenderedScaleX === renderedScaleX && lastViewportRenderedScaleY === renderedScaleY;
  if (displayGeometryUnchanged) return;
  lastViewportDisplayWidth = displayWidth;
  lastViewportDisplayHeight = displayHeight;
  lastViewportRenderedScaleX = renderedScaleX;
  lastViewportRenderedScaleY = renderedScaleY;
  canvasStackElement.style.width = `${displayWidth}px`;
  canvasStackElement.style.height = `${displayHeight}px`;
  canvasStackElement.style.maxWidth = "none";
  canvasStackElement.style.maxHeight = "none";
  canvasStackElement.style.setProperty("--draw2-canvas-display-width", `${displayWidth}px`);
  canvasStackElement.style.setProperty("--draw2-canvas-display-height", `${displayHeight}px`);
  canvasStackElement.style.setProperty("--draw2-checker-cell-size-display", `${projectCheckerCellSize(DRAW2_CHECKER_CELL_SIZE_PX, renderedScaleX)}px`);
  canvasStackElement.style.setProperty("--draw2-checker-cell-size-display-x", `${projectCheckerCellSize(DRAW2_CHECKER_CELL_SIZE_PX, renderedScaleX)}px`);
  canvasStackElement.style.setProperty("--draw2-checker-cell-size-display-y", `${projectCheckerCellSize(DRAW2_CHECKER_CELL_SIZE_PX, renderedScaleY)}px`);
}
function applyViewportTransform(options = {}) {
  if (canvasStackElement === null) return;
  syncInitialViewportMode();
  const displayScale = currentViewportDisplayScale();
  applyViewportDisplaySize();
  if (options.clampPan !== false) {
    const clamped = clampViewportPanValues(viewportPanX, viewportPanY);
    viewportPanX = clamped.x;
    viewportPanY = clamped.y;
  }
  canvasStackElement.style.transformOrigin = "center center";
  canvasStackElement.style.transform = `translate(${viewportPanX}px, ${viewportPanY}px)`;
  const layoutWidth = canvasStackElement.clientWidth || Math.max(1, Math.round(canvas.width * currentViewportDisplayScale()));
  const gridMetrics = projectPixelGridMetrics(canvas.width, layoutWidth, 1);
  canvasStackElement.style.setProperty("--draw2-grid-pixel-step", `${gridMetrics.pixelStepCssPx}px`);
  canvasStackElement.style.setProperty("--draw2-grid-major-step", `${gridMetrics.majorStepCssPx}px`);
  updatePixelGridOverlay();
  canvasStackElement.dataset.viewportZoom = displayScale.toFixed(3);
  canvasStackElement.dataset.viewportPercent = currentZoomPercent();
  canvasStackElement.dataset.viewportDisplayScale = displayScale.toFixed(3);
  canvasStackElement.dataset.viewportMode = viewportFitMode ? "fit" : "free";
  if (zoomLevelElement !== null) zoomLevelElement.value = currentZoomPercent();
  window.dispatchEvent(new CustomEvent("draw2:viewport-changed", {
    detail: {
      zoom: displayScale,
      zoomPercent: Math.round(displayScale * 100),
      panX: viewportPanX,
      panY: viewportPanY,
      width: canvas.width,
      height: canvas.height,
      displayScale,
      fit: viewportFitMode
    }
  }));
  scheduleDraw2EditorPreferencesSave();
  const activeAsset = state.assets[state.activeAssetId];
  if (activeAsset !== void 0) syncMirrorGuideOverlay(activeAsset);
  rememberViewportCenterSourcePoint();
}
function updatePixelGridOverlay() {
  if (canvasStackElement === null) return;
  const layoutWidth = Math.max(1, canvasStackElement.clientWidth || canvas.width);
  const layoutHeight = Math.max(1, canvasStackElement.clientHeight || canvas.height);
  const nextLayoutKey = `${canvas.width}:${canvas.height}:${layoutWidth}:${layoutHeight}`;
  const layoutChanged = lastPixelGridLayoutKey !== nextLayoutKey;
  lastPixelGridLayoutKey = nextLayoutKey;
  if (layoutChanged) {
    pixelGrid.setAttribute("viewBox", `0 0 ${layoutWidth.toFixed(3)} ${layoutHeight.toFixed(3)}`);
    pixelGrid.style.width = `${layoutWidth}px`;
    pixelGrid.style.height = `${layoutHeight}px`;
  }
  pixelGrid.style.setProperty("--draw2-grid-opacity", getPixelGridOpacityForScale(currentViewportDisplayScale()).toFixed(3));
  pixelGrid.style.setProperty("--draw2-grid-major-opacity", getPixelGridOpacityForScale(currentViewportDisplayScale(), {
    major: true
  }).toFixed(3));
  if (layoutChanged) {
    pixelGridMinorPath.setAttribute("d", buildPixelGridSvgPath(canvas.width, canvas.height, layoutWidth, layoutHeight, 1));
    pixelGridMajorPath.setAttribute("d", buildPixelGridSvgPath(canvas.width, canvas.height, layoutWidth, layoutHeight, 8));
  }
  updateTilemapGridOverlay(layoutWidth, layoutHeight);
}
function updateTilemapGridOverlay(layoutWidth, layoutHeight) {
  if (tilemapGrid === null || tilemapGridMinorPath === null || tilemapGridMajorPath === null) return;
  const map = activeTilemap();
  if (map === void 0) {
    tilemapGrid.setAttribute("hidden", "");
    lastTilemapGridLayoutKey = "";
    return;
  }
  const key = `${map.id}:${map.cellSize}:${canvas.width}:${canvas.height}:${layoutWidth}:${layoutHeight}`;
  tilemapGrid.removeAttribute("hidden");
  if (key === lastTilemapGridLayoutKey) return;
  lastTilemapGridLayoutKey = key;
  tilemapGrid.setAttribute("viewBox", `0 0 ${layoutWidth.toFixed(3)} ${layoutHeight.toFixed(3)}`);
  tilemapGrid.style.width = `${layoutWidth}px`;
  tilemapGrid.style.height = `${layoutHeight}px`;
  const paths = buildTilemapGridSvgPath(canvas.width, canvas.height, layoutWidth, layoutHeight, map.cellSize);
  tilemapGridMinorPath.setAttribute("d", paths.minor);
  tilemapGridMajorPath.setAttribute("d", paths.major);
}
var pixelGridResizeObserver = canvasStackElement === null ? void 0 : new ResizeObserver(() => updatePixelGridOverlay());
if (canvasStackElement !== null) {
  pixelGridResizeObserver?.observe(canvasStackElement);
}
var viewportResizeObserver = viewportWrapElement === null ? void 0 : new ResizeObserver(() => applyResponsiveViewportResize());
if (viewportWrapElement !== null) {
  viewportResizeObserver?.observe(viewportWrapElement);
}
window.visualViewport?.addEventListener("resize", () => applyResponsiveViewportResize(), {
  passive: true
});
window.visualViewport?.addEventListener("scroll", () => applyResponsiveViewportResize(), {
  passive: true
});
function viewportTransformOrigin() {
  const viewport = viewportWrapElement?.getBoundingClientRect();
  if (viewport === void 0) return void 0;
  return {
    x: viewport.left + viewport.width / 2,
    y: viewport.top + viewport.height / 2
  };
}
function viewportWheelAnchor(event) {
  const viewport = viewportWrapElement?.getBoundingClientRect();
  if (viewport === void 0) return void 0;
  const eventPoint = {
    x: event.clientX,
    y: event.clientY
  };
  const eventPointIsUsable = Number.isFinite(eventPoint.x) && Number.isFinite(eventPoint.y);
  const eventPointIsInsideViewport = eventPointIsUsable && eventPoint.x >= viewport.left && eventPoint.x <= viewport.right && eventPoint.y >= viewport.top && eventPoint.y <= viewport.bottom;
  const pointer = lastViewportPointerClient;
  const pointerIsInsideViewport = pointer !== void 0 && pointer.x >= viewport.left && pointer.x <= viewport.right && pointer.y >= viewport.top && pointer.y <= viewport.bottom;
  if (pointerIsInsideViewport) return pointer;
  if (eventPointIsInsideViewport) return eventPoint;
  return eventPointIsUsable ? eventPoint : pointer;
}
function sourcePointForViewportClient(clientX, clientY) {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return {
      x: canvas.width / 2,
      y: canvas.height / 2
    };
  }
  return {
    x: Math.max(0, Math.min(canvas.width, (clientX - bounds.left) / bounds.width * canvas.width)),
    y: Math.max(0, Math.min(canvas.height, (clientY - bounds.top) / bounds.height * canvas.height))
  };
}
function mirrorGuidePointForViewportClient(clientX, clientY, asset) {
  const source = sourcePointForViewportClient(clientX, clientY);
  return {
    x: canvasCoordinateToMirrorGuide(source.x, asset.width),
    y: canvasCoordinateToMirrorGuide(source.y, asset.height)
  };
}
function rememberViewportCenterSourcePoint() {
  const center = viewportTransformOrigin();
  if (center === void 0) return;
  viewportCenterSourcePoint = sourcePointForViewportClient(center.x, center.y);
}
function applyResponsiveViewportResize() {
  if (viewportFitMode) {
    viewportPanX = 0;
    viewportPanY = 0;
    applyViewportTransform({
      clampPan: false
    });
    return;
  }
  if (!usesResponsiveViewportFit() || viewportWrapElement === null || viewportCenterSourcePoint === void 0) {
    applyViewportTransform();
    return;
  }
  const viewport = viewportWrapElement.getBoundingClientRect();
  if (viewport.width <= 0 || viewport.height <= 0) {
    applyViewportTransform();
    return;
  }
  applyViewportDisplaySize();
  const presentationCenter = canvasPresentationCenter();
  const displayScale = currentViewportDisplayScale();
  const projection = zoomAtSourcePoint({
    nextZoom: displayScale,
    sourceX: viewportCenterSourcePoint.x,
    sourceY: viewportCenterSourcePoint.y,
    rasterWidth: canvas.width,
    rasterHeight: canvas.height,
    presentationCenterX: presentationCenter.x,
    presentationCenterY: presentationCenter.y,
    anchorClientX: viewport.left + viewport.width / 2,
    anchorClientY: viewport.top + viewport.height / 2,
    displayScale,
    snap: false
  });
  viewportPanX = projection.offsetX;
  viewportPanY = projection.offsetY;
  applyViewportTransform({
    clampPan: false
  });
}
function canvasPresentationCenter() {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2 - viewportPanX,
    y: bounds.top + bounds.height / 2 - viewportPanY
  };
}
function zoomViewportAtClient(clientX, clientY, nextZoom, options = {}) {
  const previousZoom = currentViewportDisplayScale();
  const sourcePoint = options.sourcePoint ?? sourcePointForViewportClient(clientX, clientY);
  cancelViewportCenterReturn();
  const requestedZoom = Number.isFinite(nextZoom) ? Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, nextZoom)) : previousZoom;
  viewportModeUserSelected = true;
  viewportFitMode = false;
  viewportZoom = options.snap === false ? requestedZoom : snapPixelPerfectZoom(requestedZoom);
  applyViewportDisplaySize();
  const presentationCenter = canvasPresentationCenter();
  const projection = zoomAtSourcePoint({
    nextZoom: viewportZoom,
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    rasterWidth: canvas.width,
    rasterHeight: canvas.height,
    presentationCenterX: presentationCenter.x,
    presentationCenterY: presentationCenter.y,
    anchorClientX: clientX,
    anchorClientY: clientY,
    displayScale: viewportZoom,
    snap: false
  });
  viewportZoom = projection.zoom;
  viewportPanX = projection.offsetX;
  viewportPanY = projection.offsetY;
  applyViewportTransform({
    clampPan: false
  });
}
function fitViewport() {
  cancelViewportCenterReturn();
  viewportModeUserSelected = true;
  viewportFitMode = true;
  viewportPanX = 0;
  viewportPanY = 0;
  applyViewportTransform({
    clampPan: false
  });
}
var draw2ViewportBridge = {
  snapshot: () => ({
    zoom: currentViewportDisplayScale(),
    zoomPercent: Math.round(currentViewportDisplayScale() * 100),
    panX: viewportPanX,
    panY: viewportPanY,
    width: canvas.width,
    height: canvas.height,
    fit: viewportFitMode
  }),
  setZoom: (nextZoom) => {
    const anchor = viewportTransformOrigin();
    if (anchor === void 0 || !Number.isFinite(nextZoom)) return;
    zoomViewportAtClient(anchor.x, anchor.y, nextZoom);
  },
  center: () => {
    animateViewportCenterReturn(viewportPanX, viewportPanY);
  },
  fit: fitViewport,
  pan: (dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    cancelViewportCenterReturn();
    viewportPanX += dx;
    viewportPanY += dy;
    applyViewportTransform();
  }
};
window.__pixiedraw2DrawViewport = draw2ViewportBridge;
viewportCenterButtonElement.addEventListener("click", () => {
  draw2ViewportBridge.center();
  setStatus("Canvas\u3092\u4E2D\u592E\u306B\u914D\u7F6E\u3057\u3066\u3044\u307E\u3059\u3002");
});
for (const button of document.querySelectorAll("[data-mobile-viewport-command]")) {
  button.addEventListener("click", () => {
    const command = button.dataset.mobileViewportCommand;
    if (command === "center") {
      draw2ViewportBridge.center();
      setStatus("Canvas\u3092\u4E2D\u592E\u306B\u914D\u7F6E\u3057\u3066\u3044\u307E\u3059\u3002");
      return;
    }
    if (command === "zoom-reset") {
      draw2ViewportBridge.setZoom(1);
      return;
    }
    const snapshot = draw2ViewportBridge.snapshot();
    if (command === "zoom-in") {
      draw2ViewportBridge.setZoom(Math.max(0.01, snapshot.zoom) * 1.25);
    } else if (command === "zoom-out") {
      draw2ViewportBridge.setZoom(Math.max(0.01, snapshot.zoom) * 0.8);
    }
  });
}
function syncDisplayToggles() {
  for (const button of displayToggleButtons) {
    const enabled = button.dataset.draw2DisplayToggle === "cursor" ? virtualCursorEnabled : miniPreviewEnabled;
    button.setAttribute("aria-checked", String(enabled));
    button.classList.toggle("is-active", enabled);
  }
  syncMiniPreviewLayout();
  drawOverlay();
}
var drawingContext = canvas.getContext("2d", {
  alpha: true
});
var overlayContext = overlay.getContext("2d");
var erasePreviewContext = erasePreview.getContext("2d");
if (drawingContext === null || overlayContext === null || erasePreviewContext === null) {
  throw new Error("Draw2 reference viewport could not acquire Canvas2D.");
}
var canonicalContext = drawingContext;
var selectionOverlayContext = overlayContext;
var eraseProjectionContext = erasePreviewContext;
var tilesetSourceContext = tilesetSourceCanvas?.getContext("2d") ?? null;
function configurePixelRenderingContexts() {
  canonicalContext.imageSmoothingEnabled = false;
  selectionOverlayContext.imageSmoothingEnabled = false;
  eraseProjectionContext.imageSmoothingEnabled = false;
  if (tilesetSourceContext !== null) {
    tilesetSourceContext.imageSmoothingEnabled = false;
  }
  miniPreviewContext.imageSmoothingEnabled = false;
  gamePreviewContext.imageSmoothingEnabled = false;
}
function syncRasterCanvasDimensions(width, height) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  if (canvas.width !== safeWidth) canvas.width = safeWidth;
  if (canvas.height !== safeHeight) canvas.height = safeHeight;
  if (overlay.width !== safeWidth) overlay.width = safeWidth;
  if (overlay.height !== safeHeight) overlay.height = safeHeight;
  if (erasePreview.width !== safeWidth) {
    erasePreview.width = safeWidth;
  }
  if (erasePreview.height !== safeHeight) {
    erasePreview.height = safeHeight;
  }
  if (tilesetSourceCanvas !== null) {
    if (tilesetSourceCanvas.width !== safeWidth) {
      tilesetSourceCanvas.width = safeWidth;
    }
    if (tilesetSourceCanvas.height !== safeHeight) {
      tilesetSourceCanvas.height = safeHeight;
    }
  }
  configurePixelRenderingContexts();
  mirrorGuide = normalizeMirrorGuide({
    width: safeWidth,
    height: safeHeight
  });
  applyViewportTransform();
}
configurePixelRenderingContexts();
var undoControl = undoButton;
var redoControl = redoButton;
var timelineStatus = timelineStatusElement;
var timelineViewport = timelineViewportElement;
var timelineSpacer = timelineSpacerElement;
var timelineWindow = timelineWindowElement;
var timelinePropertiesResize = timelinePropertiesResizeElement;
var timelineProperties = timelinePropertiesElement;
var timelinePropertiesBody = timelinePropertiesBodyElement;
var timelinePropertiesCollapse = timelinePropertiesCollapseElement;
var timelineSecondaryControls = timelineSecondaryControlsElement;
var timelineCard = timelineCardElement;
var timelineContext = timelineContextMenu;
var tagNameControl = animationTagNameElement;
var tagFromControl = animationTagFromElement;
var tagToControl = animationTagToElement;
var tagLoopControl = animationTagLoopElement;
var tagAddControl = animationTagAddElement;
var tagList = animationTagListElement;
var markerKindControl = timelineMarkerKindElement;
var markerLabelControl = timelineMarkerLabelElement;
var markerAddControl = timelineMarkerAddElement;
var markerList = timelineMarkerListElement;
var drawAudioAssetPicker = drawAudioAssetPickerElement;
var drawAudioAdd = drawAudioAddElement;
var drawAudioLane = drawAudioLaneElement;
var drawAudioEmpty = drawAudioEmptyElement;
var drawAudioStatus = drawAudioStatusElement;
var linkedCelToggleControl = linkedCelToggleElement;
var linkedCelStatus = linkedCelStatusElement;
var importPxdControl = importPxdInput;
var addFrameControl = addFrameButton;
var duplicateFrameControl = duplicateFrameButton;
var removeFrameControl = removeFrameButton;
var addLayerControl = addLayerButton;
var reorderLayerControl = reorderLayerButton;
var toggleLayerControl = toggleLayerButton;
var toggleOnionControl = toggleOnionButton;
var onionOptions = onionOptionsElement;
var onionOptionsPopover = onionOptions.querySelector(".draw2-timeline-onion-popover");
var togglePlaybackControl = togglePlaybackButton;
var playbackFpsControl = playbackFpsElement;
var playbackFpsCustomControl = playbackFpsCustomElement;
var playbackLoopControl = playbackLoopElement;
var playbackRateGroup = playbackFpsControl.closest(".draw2-timeline-rate");
var playbackLoopMode = "loop";
var advancedLoadControl = advancedLoadButton;
var advancedPatternControl = advancedPatternButton;
var advancedStampControl = advancedStampButton;
var advancedMirrorControl = advancedMirrorButton;
var advancedGridControl = advancedGridButton;
var advancedGuideControl = advancedGuideButton;
var advancedStatus = advancedStatusElement;
var colorMap = colorMapElement;
var paletteWheel = paletteWheelElement;
var hueCursor = hueCursorElement;
var svCursor = svCursorElement;
var colorR = colorRElement;
var colorG = colorGElement;
var colorB = colorBElement;
var colorAlpha = colorAlphaElement;
var colorRValue = colorRValueElement;
var colorGValue = colorGValueElement;
var colorBValue = colorBValueElement;
var colorAlphaValue = colorAlphaValueElement;
var colorHex = colorHexElement;
var colorHexOutput = colorHexOutputElement;
var colorApply = colorApplyButton;
var colorEditorStatus = colorEditorStatusElement;
var exportPanelStatus = exportPanelStatusElement;
var exportName = exportNameElement;
var exportScale = exportScaleElement;
var exportFormatCards = exportFormatCardsElement;
var exportSelectionSummary = exportSelectionSummaryElement;
var exportFormatOptions = exportFormatOptionsElement;
var exportPackageSection = exportPackageSectionElement;
var exportPackageSingle = exportPackageSingleElement;
var exportPackageZip = exportPackageZipElement;
var exportPreviewCanvas = exportPreviewCanvasElement;
var exportPreviewSummary = exportPreviewSummaryElement;
var exportOutputFiles = exportOutputFilesElement;
var exportProgress = exportProgressElement;
var exportProgressBar = exportProgressBarElement;
var exportProgressPercent = exportProgressPercentElement;
var exportProgressTitle = exportProgressTitleElement;
var exportProgressDetail = exportProgressDetailElement;
var exportProgressCurrent = exportProgressCurrentElement;
var exportProgressCount = exportProgressCountElement;
var exportProgressTrack = exportProgressTrackElement;
var exportExecute = exportExecuteButton;
var exportToMarket = exportToMarketButton;
var tilesetCellSizeControl = document.querySelector("#draw2TilesetCellSize");
var tilesetGridElement = document.querySelector("#draw2TilesetGrid");
var paletteWheelContextCandidate = paletteWheel.getContext("2d", {
  willReadFrequently: true
});
if (paletteWheelContextCandidate === null) {
  throw new Error("Draw2 palette wheel could not acquire Canvas2D.");
}
var paletteWheelContext = paletteWheelContextCandidate;
var paletteWheelRenderKey = "";
var instrumentation = new SampledInstrumentation(1, () => 0);
var journal = new InMemoryLocalJournal();
var repository = new InMemoryProjectRepository();
var renderer = new ReferenceRenderer();
var state = createProject({
  projectId: "draw2-local-demo",
  width: 256,
  height: 256,
  tileSize: 32
});
var selectedExportFormats = /* @__PURE__ */ new Set([
  "png"
]);
var exportPackageMode = "single";
var core = new EditorCore(state, {
  instrumentation
});
var history = new LocalUndoRedoHistory(state);
var pixyncDrawActorId;
var pixyncDrawClientId;
window.addEventListener("draw2:pixync-binding", (event) => {
  const detail = event.detail;
  if (typeof detail?.actorId !== "string" || typeof detail?.clientId !== "string" || detail.projectId !== state.projectId) return;
  pixyncDrawActorId = detail.actorId;
  pixyncDrawClientId = detail.clientId;
});
function activeDrawActorId() {
  return pixyncDrawActorId ?? "local-preview-user";
}
function activeDrawClientId() {
  return pixyncDrawClientId ?? DRAW_CLIENT_ID;
}
function publishDrawRasterCommit(result, nextState, baseStructureEpoch) {
  window.dispatchEvent(new CustomEvent("draw2:raster-operation-committed", {
    detail: {
      result,
      nextState,
      baseStructureEpoch
    }
  }));
}
var pixyncDrawStatePort = {
  preservesLocalHistory: true,
  current: () => ({
    state,
    undoDepth: history.undoDepth,
    redoDepth: history.redoDepth
  }),
  applyRemote: async (input) => {
    const operation = input.operation;
    const command = {
      commandId: operation.commandId,
      projectId: operation.projectId,
      assetId: operation.assetId,
      actorId: operation.actorId,
      clientId: operation.clientId,
      clientSequence: operation.clientSequence,
      structureEpoch: input.baseStructureEpoch,
      schemaVersion: 1,
      baseStructureEpoch: input.baseStructureEpoch,
      createdAtMonotonicMs: performance.now(),
      commandType: operation.operationType,
      payload: operation.payload
    };
    const remoteCore = new EditorCore(state, {
      instrumentation
    });
    const applied = await remoteCore.execute(command);
    if (!applied.ok) {
      throw new Error(applied.diagnostics[0]?.code ?? "PIXYNC_DRAW_REMOTE_APPLY_FAILED");
    }
    state = applied.state;
    core = new EditorCore(state, {
      instrumentation
    });
    saveDrawProjectState("pixync-remote");
    notifyAssetStateChanged();
    renderTimeline();
    await present();
    const rasterHash = await drawRasterHash(state, operation.assetId);
    return {
      operationId: operation.operationId,
      projectId: operation.projectId,
      actorId: operation.actorId,
      clientId: operation.clientId,
      clientSequence: operation.clientSequence,
      baseProjectRevision: input.baseProjectRevision,
      assetId: operation.assetId,
      baseStructureEpoch: input.baseStructureEpoch,
      structureEpoch: state.structureEpoch,
      rasterHash,
      localUndoDepth: history.undoDepth,
      localRedoDepth: history.redoDepth
    };
  }
};
var pixyncProjectLifecycle;
function projectPixyncState(phase, projectId, generation) {
  document.body.dataset.pixyncState = phase.toLowerCase();
  document.body.dataset.pixyncProjectId = projectId ?? "";
  document.body.dataset.pixyncGeneration = String(generation);
}
async function startPixyncProjectLifecycle() {
  if (pixyncProjectLifecycle !== void 0) return;
  const lifecycle = new PixyncProjectLifecycleCoordinator({
    eventTarget: window,
    eventName: WORKSPACE_PROJECT_CHANGED_EVENT,
    initialProjectId: state.projectId,
    createPersistence: (projectId) => createPixyncIndexedDbPersistence(projectId),
    openJournal: async (projectId, persistence) => ({
      projectId,
      journal: await PixyncDurableJournal.open(projectId, persistence)
    }),
    // Journal mutations await their own durable atomicReplace. No transport
    // worker exists yet, so there is no additional queue to flush or stop.
    flushProject: async () => void 0,
    stopProject: async () => void 0,
    onState: ({ phase, projectId, generation }) => projectPixyncState(phase, projectId, generation)
  });
  pixyncProjectLifecycle = lifecycle;
  try {
    await lifecycle.start();
  } catch {
    projectPixyncState("UNAVAILABLE", state.projectId, 0);
    pixyncProjectLifecycle = void 0;
    await lifecycle.dispose().catch(() => void 0);
  }
}
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  const lifecycle = pixyncProjectLifecycle;
  pixyncProjectLifecycle = void 0;
  void lifecycle?.dispose();
  void pixyncProductionRoot?.close("pagehide");
  pixyncProductionRoot = void 0;
});
var PIXYNC_ROOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var pixyncProductionRoot;
var pixyncProductionTransition = Promise.resolve();
function pixyncTabIdentity(key, prefix) {
  const existing = sessionStorage.getItem(key);
  if (existing !== null && existing.length > 0) return existing;
  const value = `${prefix}:${crypto.randomUUID()}`;
  sessionStorage.setItem(key, value);
  return value;
}
async function availablePixyncSupabaseClient(supplied) {
  if (supplied !== void 0) return supplied;
  const host = window;
  if (host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ !== void 0) {
    return host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
  }
  return host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__?.catch(() => void 0);
}
function requireWorkspacePixyncBridge() {
  const bridge = getWorkspacePxdBridge();
  for (const method of [
    "preparePixyncAudioState",
    "pixyncAudioCurrent",
    "applyPixyncAudioRemote",
    "preparePixyncGameState",
    "pixyncGameCurrent",
    "resolvePixyncGameRevision",
    "applyPixyncGameRemote"
  ]) {
    if (typeof bridge[method] !== "function") {
      throw new Error(`PiXYNC Workspace bridge is missing ${method}.`);
    }
  }
  return bridge;
}
async function startPixyncProductionRoot(suppliedClient) {
  if (!PIXYNC_ROOM_ID.test(state.projectId)) {
    await pixyncProductionRoot?.close("local-project");
    pixyncProductionRoot = void 0;
    document.body.dataset.pixyncComposition = "local";
    await startPixyncProjectLifecycle();
    return false;
  }
  const client = await availablePixyncSupabaseClient(suppliedClient);
  if (client === void 0) {
    await pixyncProductionRoot?.close("authentication-unavailable");
    pixyncProductionRoot = void 0;
    document.body.dataset.pixyncComposition = "awaiting-auth";
    return false;
  }
  const workspace = requireWorkspacePixyncBridge();
  await Promise.all([
    workspace.preparePixyncAudioState(),
    workspace.preparePixyncGameState()
  ]);
  await pixyncProductionRoot?.close("project-transition");
  pixyncProductionRoot = void 0;
  if (pixyncProjectLifecycle !== void 0) {
    const localLifecycle = pixyncProjectLifecycle;
    pixyncProjectLifecycle = void 0;
    await localLifecycle.dispose();
  }
  const projectId = state.projectId;
  const clientId = pixyncTabIdentity("pixiedraw2:pixync-client-id", "draw2-client");
  const sessionGeneration = Date.now();
  const workerId = pixyncTabIdentity("pixiedraw2:pixync-worker-id", "draw2-worker");
  let root;
  const gameRevisions = new PixyncGameRevisionRemoteStore(client, () => root?.binding);
  root = await PixyncProductionCompositionRoot.create({
    projectId,
    clientId,
    sessionGeneration,
    workerId,
    supabase: client,
    persistence: createPixyncIndexedDbPersistence(projectId),
    eventTarget: window,
    audioHydration: {
      hydrateAudio: async (request) => {
        await workspace.preparePixyncAudioState();
        return {
          projectId: request.projectId,
          audioRevision: request.minimumAudioRevision,
          level: request.level
        };
      }
    },
    gameHydration: {
      hydrateGame: async (request) => {
        await workspace.preparePixyncGameState();
        return {
          projectId: request.projectId,
          gameRevision: request.minimumGameRevision,
          level: request.level
        };
      }
    },
    createProducts: ({ transport, onInvalidation }) => {
      const draw = new PixyncDrawProductBridge({
        transport,
        state: pixyncDrawStatePort
      });
      const audio = new PixyncAudioProductBridge({
        transport,
        state: {
          preservesLocalHistory: true,
          current: workspace.pixyncAudioCurrent,
          applyRemote: workspace.applyPixyncAudioRemote
        },
        onInvalidation
      });
      const game = new PixyncGameProductBridge({
        transport,
        state: {
          preservesLocalHistory: true,
          current: workspace.pixyncGameCurrent,
          resolveCanonicalRevision: async (hash, revisionId) => await workspace.resolvePixyncGameRevision(hash, revisionId) ?? await gameRevisions.get(hash, revisionId),
          appendRemoteJournalCommand: workspace.applyPixyncGameRemote
        },
        onInvalidation
      });
      return {
        adapters: [
          draw.adapter,
          audio.adapter,
          game.adapter
        ],
        submitDraw: (detail) => draw.submitLocal(detail.result, detail.nextState, detail.baseStructureEpoch),
        submitAudio: (entry) => audio.submitLocal(entry),
        submitGameEditor: async (detail) => {
          const command = detail.command;
          if (command === void 0) return;
          await gameRevisions.put(command.after);
          await game.submitLocal(command);
        }
      };
    },
    onStatus: (status2) => {
      document.body.dataset.pixyncState = status2.toLowerCase();
    },
    onError: (error2) => {
      document.body.dataset.pixyncState = "error";
      document.body.dataset.pixyncError = error2 instanceof Error ? error2.message : "PIXYNC_RUNTIME_ERROR";
    }
  });
  await root.connect();
  pixyncProductionRoot = root;
  document.body.dataset.pixyncComposition = "production";
  return true;
}
function queuePixyncProductionStart(client) {
  let result = false;
  pixyncProductionTransition = pixyncProductionTransition.then(async () => {
    result = await startPixyncProductionRoot(client);
  }).catch((error2) => {
    document.body.dataset.pixyncState = "error";
    document.body.dataset.pixyncError = error2 instanceof Error ? error2.message : "PIXYNC_START_FAILED";
  });
  return pixyncProductionTransition.then(() => result);
}
window.__pixiedraw2StartPixyncProduction = queuePixyncProductionStart;
window.addEventListener(WORKSPACE_PROJECT_CHANGED_EVENT, () => {
  void queuePixyncProductionStart();
});
window.addEventListener("pixieed:supabase-client-ready", (event) => {
  const client = event.detail?.client;
  void queuePixyncProductionStart(client);
});
window.addEventListener("pixieed:account-auth-state", (event) => {
  const authenticated = event.detail?.authenticated;
  if (authenticated === true) void queuePixyncProductionStart();
  else if (authenticated === false) {
    void pixyncProductionRoot?.close("signed-out");
    pixyncProductionRoot = void 0;
    document.body.dataset.pixyncComposition = "awaiting-auth";
  }
});
function layerKind(layerTrackId) {
  return state.layers.find((layer2) => layer2.layerTrackId === layerTrackId)?.kind === "TILEMAP" ? "TILEMAP" : "RASTER";
}
function activeLayerIsTilemap() {
  return layerKind(state.activeLayerId) === "TILEMAP";
}
function activeTilemap() {
  return state.tilemaps?.[tilemapIdFor(state.activeLayerId, state.activeFrameId)];
}
function tilemapCellSizeFromControls() {
  return tilesetCellSizeControl?.value === "32" ? 32 : 16;
}
function ensureTilemapFor(layerTrackId, frameId, cellSize = tilemapCellSizeFromControls()) {
  if (layerKind(layerTrackId) !== "TILEMAP") return void 0;
  const id = tilemapIdFor(layerTrackId, frameId);
  const existing = state.tilemaps?.[id];
  if (existing !== void 0) return existing;
  const source = state.assets[state.activeAssetId];
  if (source === void 0) return void 0;
  const map = createDraw2Tilemap({
    id,
    layerTrackId,
    frameId,
    canvasWidth: source.width,
    canvasHeight: source.height,
    cellSize
  });
  state = {
    ...state,
    tilemaps: {
      ...state.tilemaps ?? {},
      [id]: map
    }
  };
  core = new EditorCore(state, {
    instrumentation
  });
  return map;
}
var selectedTileSource;
var tilemapOperationSequence = 0;
tilesetGridElement?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const cell = target.closest("[data-tileset-cell]");
  const value = cell?.dataset.tilesetCell;
  if (value === void 0) return;
  const [xValue, yValue, sizeValue] = value.split(":");
  const sourceX = Number(xValue);
  const sourceY = Number(yValue);
  const cellSize = Number(sizeValue);
  if (!Number.isSafeInteger(sourceX) || !Number.isSafeInteger(sourceY) || cellSize !== 16 && cellSize !== 32) return;
  selectedTileSource = {
    sourceAssetId: state.activeAssetId,
    sourceX,
    sourceY,
    cellSize
  };
  setStatus(activeLayerIsTilemap() ? `\u30BF\u30A4\u30EB ${sourceX + 1},${sourceY + 1} \u3092\u9078\u629E \xB7 Canvas\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u914D\u7F6E` : `\u30BF\u30A4\u30EB ${sourceX + 1},${sourceY + 1} \u3092\u9078\u629E \xB7 Tilemap\u30EC\u30A4\u30E4\u30FC\u3067\u914D\u7F6E\u3067\u304D\u307E\u3059`);
});
var autosave = new LocalAutosaveCoordinator(journal, 4, instrumentation);
var DRAW_CLIENT_ID = "draw2-local-client";
var SELECTION_CLIENT_ID = "draw2-selection-local";
var TIMELINE_CLIENT_ID = "draw2-timeline-local";
var clientSequence = 0;
var selectionClientSequence = 0;
var selectedColor = 1;
var draw2EditorPreferenceStorage = (() => {
  try {
    return window.localStorage;
  } catch {
    return void 0;
  }
})();
var draw2EditorPreferences = readDraw2EditorPreferences(draw2EditorPreferenceStorage);
var draw2EditorPreferenceSaveTimer;
var restoringDraw2EditorPreferences = false;
function currentDraw2ProjectEditorPreferences() {
  const stored = draw2ProjectEditorPreferences(draw2EditorPreferences, state.projectId);
  return {
    ...stored,
    selectedColor,
    mirrorMode,
    mirrorAxes: {
      ...mirrorAxes
    },
    mirrorGuide: {
      ...mirrorGuide
    },
    viewport: {
      zoom: viewportZoom,
      fit: viewportFitMode,
      userSelected: viewportModeUserSelected,
      panX: viewportPanX,
      panY: viewportPanY
    },
    onionSkin: {
      enabled: onionSkinEnabled,
      previousFrames: onionSkinPreviousFrames,
      nextFrames: onionSkinNextFrames,
      opacity: onionSkinOpacity,
      colorMode: onionSkinColorMode
    }
  };
}
function persistDraw2EditorPreferencesNow() {
  if (!draw2EditorPreferencesReady || restoringDraw2EditorPreferences) return;
  const brushSizeValue = Number(brushSize.value);
  const similarityValue2 = Number(similarity.value);
  draw2EditorPreferences = withDraw2ProjectEditorPreferences({
    ...draw2EditorPreferences,
    tool: toolSelect.value,
    brushSize: Number.isFinite(brushSizeValue) ? brushSizeValue : 1,
    brushShape: brushShape.value,
    brushPattern: brushPattern.value,
    similarityPercent: Number.isFinite(similarityValue2) ? similarityValue2 : 0,
    colorSelectionMode: colorSelectionModeControl.value,
    playbackLoopMode,
    playbackFps: playbackFpsControl.value,
    playbackFpsCustom: Number(playbackFpsCustomControl.value) || 24
  }, state.projectId, currentDraw2ProjectEditorPreferences());
  writeDraw2EditorPreferences(draw2EditorPreferenceStorage, draw2EditorPreferences);
}
function flushDraw2EditorPreferences() {
  if (draw2EditorPreferenceSaveTimer !== void 0) {
    window.clearTimeout(draw2EditorPreferenceSaveTimer);
    draw2EditorPreferenceSaveTimer = void 0;
  }
  persistDraw2EditorPreferencesNow();
}
function scheduleDraw2EditorPreferencesSave() {
  if (!draw2EditorPreferencesReady || restoringDraw2EditorPreferences) return;
  if (draw2EditorPreferenceSaveTimer !== void 0) return;
  draw2EditorPreferenceSaveTimer = window.setTimeout(() => {
    draw2EditorPreferenceSaveTimer = void 0;
    persistDraw2EditorPreferencesNow();
  }, 180);
}
function restoreDraw2EditorPreferencesForProject(projectId, asset) {
  restoringDraw2EditorPreferences = true;
  try {
    const stored = draw2EditorPreferences.projects[projectId];
    if (stored === void 0) {
      selectedColor = Math.max(0, Math.min(1, asset.palette.length - 1));
      mirrorMode = "NONE";
      mirrorEnabled = false;
      mirrorAxes = {
        x: false,
        y: false,
        diagonalDown: false,
        diagonalUp: false
      };
      mirrorGuide = normalizeMirrorGuide(asset);
      viewportZoom = 1;
      viewportFitMode = true;
      viewportModeUserSelected = false;
      viewportPanX = 0;
      viewportPanY = 0;
      onionSkinEnabled = false;
      onionSkinPreviousFrames = 1;
      onionSkinNextFrames = 1;
      onionSkinOpacity = 0.5;
      onionSkinColorMode = "TINTED";
    } else {
      selectedColor = Math.max(0, Math.min(stored.selectedColor, Math.max(0, asset.palette.length - 1)));
      mirrorMode = stored.mirrorMode;
      mirrorEnabled = stored.mirrorMode === "ON";
      mirrorAxes = {
        ...stored.mirrorAxes
      };
      mirrorGuide = normalizeMirrorGuide({
        ...asset,
        ...stored.mirrorGuide
      });
      viewportZoom = stored.viewport.zoom;
      viewportFitMode = stored.viewport.fit;
      viewportModeUserSelected = stored.viewport.userSelected;
      viewportPanX = stored.viewport.panX;
      viewportPanY = stored.viewport.panY;
      onionSkinEnabled = stored.onionSkin.enabled;
      onionSkinPreviousFrames = stored.onionSkin.previousFrames;
      onionSkinNextFrames = stored.onionSkin.nextFrames;
      onionSkinOpacity = stored.onionSkin.opacity;
      onionSkinColorMode = stored.onionSkin.colorMode;
    }
  } finally {
    restoringDraw2EditorPreferences = false;
  }
  draw2EditorPreferencesReady = true;
  syncMirrorModeToggle();
  syncMirrorLineToggle(mirrorToggleX, mirrorAxes.x, mirrorEnabled, "Vertical mirror");
  syncMirrorLineToggle(mirrorToggleY, mirrorAxes.y, mirrorEnabled, "Horizontal mirror");
  syncMirrorLineToggle(mirrorToggleDiagonalDown, mirrorAxes.diagonalDown, mirrorEnabled, "Descending diagonal mirror");
  syncMirrorLineToggle(mirrorToggleDiagonalUp, mirrorAxes.diagonalUp, mirrorEnabled, "Ascending diagonal mirror");
  applyViewportTransform({
    clampPan: false
  });
  renderTimeline();
}
function restoreDraw2GlobalEditorPreferences() {
  const preferences = draw2EditorPreferences;
  if (Array.from(toolSelect.options).some((option) => option.value === preferences.tool)) {
    toolSelect.value = preferences.tool;
  }
  if (Array.from(brushShape.options).some((option) => option.value === preferences.brushShape)) {
    brushShape.value = preferences.brushShape;
  }
  if (Array.from(brushPattern.options).some((option) => option.value === preferences.brushPattern)) {
    brushPattern.value = preferences.brushPattern;
  }
  if (Array.from(colorSelectionModeControl.options).some((option) => option.value === preferences.colorSelectionMode)) {
    colorSelectionModeControl.value = preferences.colorSelectionMode;
  }
  brushSize.value = String(preferences.brushSize);
  similarity.value = String(preferences.similarityPercent);
  if (Array.from(playbackFpsControl.options).some((option) => option.value === preferences.playbackFps)) playbackFpsControl.value = preferences.playbackFps;
  playbackFpsCustomControl.value = String(preferences.playbackFpsCustom);
  playbackFpsCustomControl.hidden = playbackFpsControl.value !== "custom";
  playbackLoopMode = preferences.playbackLoopMode === "bounce" || preferences.playbackLoopMode === "off" ? preferences.playbackLoopMode : "loop";
  updatePlaybackLoopControl();
}
var drawCommitIngress = new SerializedCommitIngress();
function draw2HistoryPanelSnapshot() {
  const snapshot = history.snapshot(64);
  const summarize = (entries, direction) => entries.slice().reverse().map((entry) => ({
    actionId: entry.actionId,
    operationId: entry.operationId,
    operationType: entry.operationType,
    direction,
    frameId: entry.after.activeFrameId,
    layerId: entry.after.activeLayerId
  }));
  return {
    undoDepth: history.undoDepth,
    redoDepth: history.redoDepth,
    undo: summarize(snapshot.undo, "UNDO"),
    redo: summarize(snapshot.redo, "REDO")
  };
}
var draw2HistoryBridge = {
  snapshot: draw2HistoryPanelSnapshot,
  undo: () => undoControl.click(),
  redo: () => redoControl.click()
};
window.__pixiedraw2DrawHistory = draw2HistoryBridge;
function readStoredBrushPresets() {
  const store = new BrushPresetStore();
  try {
    const raw = window.localStorage.getItem("pixieed:draw2:brush-presets:v1");
    const parsed = raw === null ? [] : JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const value of parsed) {
        try {
          store.save(value);
        } catch {
        }
      }
    }
  } catch {
  }
  if (store.list().length === 0) {
    store.save({
      id: "preset:default",
      name: "Default",
      brushSize: 1,
      brushShape: "square",
      pattern: "solid",
      dither: "NONE",
      colorIndex: 1,
      opacity: 1,
      schemaVersion: 1
    });
  }
  return store.list();
}
var brushPresets = new BrushPresetStore(readStoredBrushPresets());
var animationTags = new AnimationTagStore();
var timelineMarkers = new TimelineMarkerStore();
var drawAudioReferences = new DrawAudioReferenceStore();
var drawAudioCatalog = [];
function draw2TimelineMetadataSnapshot() {
  return normalizeDraw2TimelineMetadata({
    schemaVersion: 2,
    animationTags: animationTags.list(),
    markers: timelineMarkers.list(),
    audioReferences: drawAudioReferences.list()
  }, state.frames.length);
}
function restoreDraw2TimelineMetadata(value) {
  const metadata = normalizeDraw2TimelineMetadata(value, state.frames.length);
  for (const tag of animationTags.list()) animationTags.remove(tag.id);
  for (const marker of timelineMarkers.list()) {
    timelineMarkers.remove(marker.id);
  }
  for (const reference of drawAudioReferences.list()) {
    drawAudioReferences.remove(reference.id);
  }
  for (const tag of metadata.animationTags) {
    animationTags.upsert(tag, state.frames.length);
  }
  for (const marker of metadata.markers) timelineMarkers.upsert(marker);
  for (const reference of metadata.audioReferences) {
    drawAudioReferences.upsert(reference, state.frames.length);
  }
}
var linkedCelBindings = [];
var selection;
var selectionInteractionGeneration = 0;
var selectionEditMode = "REPLACE";
var selectionDraft;
var assetDefinitions = [];
var assetDefinitionSequence = 0;
function cloneAssetDefinitionEntry(entry) {
  return {
    definitionId: entry.definitionId,
    definition: {
      ...entry.definition,
      sourceLayerIds: [
        ...entry.definition.sourceLayerIds
      ],
      animationMapping: entry.definition.animationMapping.map((clip) => ({
        ...clip,
        frameIds: [
          ...clip.frameIds
        ],
        ...clip.sourceFrames === void 0 ? {} : {
          sourceFrames: clip.sourceFrames.map((frame2) => ({
            ...frame2,
            layerIds: [
              ...frame2.layerIds
            ],
            rect: {
              ...frame2.rect
            }
          }))
        },
        ...clip.frameDurationsMs === void 0 ? {} : {
          frameDurationsMs: [
            ...clip.frameDurationsMs
          ]
        }
      })),
      metadata: {
        ...entry.definition.metadata,
        tags: [
          ...entry.definition.metadata.tags
        ]
      },
      dependencyIds: [
        ...entry.definition.dependencyIds
      ]
    },
    ...entry.registryIdentity === void 0 ? {} : {
      registryIdentity: {
        ...entry.registryIdentity
      }
    }
  };
}
function currentAssetSelectionSnapshot() {
  const currentSelection = selection;
  if (currentSelection === void 0) {
    return {
      hasSelection: false,
      pixelCount: 0,
      kind: null,
      region: null,
      sourceCanvasId: null,
      layerId: null,
      frameId: null,
      frameNumber: null
    };
  }
  const region = currentSelection.mask.regions[0] ?? null;
  const frame2 = state.frames.find((item) => item.frameId === currentSelection.scope.frameId);
  return {
    hasSelection: region !== null,
    pixelCount: currentSelection.pixels.length,
    kind: currentSelection.mask.kind,
    region: region === null ? null : {
      ...region
    },
    sourceCanvasId: currentSelection.scope.assetId,
    layerId: currentSelection.scope.layerId,
    frameId: currentSelection.scope.frameId,
    frameNumber: frame2 === void 0 ? null : frame2.index + 1
  };
}
function notifyAssetStateChanged() {
  window.dispatchEvent(new Event(DRAW2_ASSET_STATE_CHANGED_EVENT));
}
function nextAssetDefinitionId() {
  const safeProjectId = state.projectId.replace(/[^A-Za-z0-9._-]+/gu, "-").slice(0, 72);
  let candidate = "";
  do {
    assetDefinitionSequence += 1;
    candidate = `asset-${safeProjectId || "project"}-${assetDefinitionSequence}`;
  } while (assetDefinitions.some((entry) => entry.definitionId === candidate));
  return candidate;
}
function assetDefinitionMutation(definitionId, candidate) {
  const current = assetDefinitions.find((entry) => entry.definitionId === definitionId);
  if (current === void 0) {
    return {
      ok: false,
      message: "\u5BFE\u8C61\u30A2\u30BB\u30C3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002"
    };
  }
  const validation = validateAssetDefinitionDraft({
    ...candidate,
    persistence: "LOCAL_DRAFT"
  });
  if (!validation.ok) return {
    ok: false,
    message: validation.message
  };
  const normalized = {
    ...validation.value,
    persistence: "LOCAL_DRAFT"
  };
  const nextEntry = {
    definitionId,
    definition: normalized,
    ...current.registryIdentity === void 0 ? {} : {
      registryIdentity: {
        ...current.registryIdentity
      }
    }
  };
  assetDefinitions = assetDefinitions.map((entry) => entry.definitionId === definitionId ? nextEntry : entry);
  queueDrawPersistenceSave("asset-definition");
  notifyAssetStateChanged();
  return {
    ok: true,
    entry: cloneAssetDefinitionEntry(nextEntry)
  };
}
function createEmptyAssetDefinition(input) {
  const activeFrame = state.frames.find((frame2) => frame2.frameId === state.activeFrameId);
  if (activeFrame === void 0 || state.activeLayerId.trim().length === 0) {
    return {
      ok: false,
      message: "\u73FE\u5728\u306EFrame\uFF0FLayer\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3002"
    };
  }
  const draft = createAssetDefinitionDraft({
    sourceProjectId: state.projectId,
    sourceCanvasId: state.activeAssetId,
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: [
      state.activeLayerId
    ],
    layerSelection: {
      kind: "CURRENT_LAYER",
      layerId: state.activeLayerId
    },
    frameStart: activeFrame.index + 1,
    frameEnd: activeFrame.index + 1,
    frameSelection: {
      kind: "CURRENT_FRAME",
      frameId: activeFrame.frameId
    },
    region: {
      kind: "FULL_CANVAS"
    },
    animationMapping: [],
    assetKind: input.assetKind,
    pivot: input.pivot,
    metadata: {
      name: input.name.trim() || `Asset ${assetDefinitions.length + 1}`
    }
  });
  if (!draft.ok) return {
    ok: false,
    message: draft.message
  };
  const entry = {
    definitionId: nextAssetDefinitionId(),
    definition: draft.value
  };
  assetDefinitions = [
    ...assetDefinitions,
    entry
  ];
  queueDrawPersistenceSave("asset-definition-create");
  notifyAssetStateChanged();
  return {
    ok: true,
    entry: cloneAssetDefinitionEntry(entry)
  };
}
function createAssetAnimationClipFromInput(input) {
  const name = input.animationName ?? "CUSTOM";
  const customName = input.customName?.trim() || (name === "CUSTOM" ? input.motionName?.trim() : void 0);
  return {
    name,
    ...customName === void 0 ? {} : {
      customName
    },
    ...input.motionName?.trim() === void 0 ? {} : {
      motionName: input.motionName.trim()
    },
    ...input.direction?.trim() === void 0 ? {} : {
      direction: input.direction.trim()
    },
    frameIds: [
      ...input.frameIds
    ],
    loopMode: input.loopMode,
    ...input.fps === void 0 ? {} : {
      fps: input.fps
    },
    ...input.sourceReference?.trim() === void 0 ? {} : {
      sourceReference: input.sourceReference.trim()
    },
    ...input.flipX === void 0 ? {} : {
      flipX: input.flipX
    },
    ...input.flipY === void 0 ? {} : {
      flipY: input.flipY
    },
    ...input.sourceFrames === void 0 ? {} : {
      sourceFrames: input.sourceFrames.map((frame2) => ({
        ...frame2,
        layerIds: [
          ...frame2.layerIds
        ],
        rect: {
          ...frame2.rect
        }
      }))
    },
    ...input.frameDurationsMs === void 0 ? {} : {
      frameDurationsMs: [
        ...input.frameDurationsMs
      ]
    }
  };
}
function addAssetDefinitionFromSelection(input) {
  const source = currentAssetSelectionSnapshot();
  if (!source.hasSelection || source.region === null || source.sourceCanvasId === null || source.layerId === null || source.frameId === null || source.frameNumber === null) {
    return {
      ok: false,
      message: "Draw\u30E2\u30FC\u30C9\u3067\u7BC4\u56F2\u3092\u9078\u629E\u3057\u3066\u304B\u3089\u8FFD\u52A0\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  const initialAnimationName = input.animationName ?? "IDLE";
  const draft = createAssetDefinitionDraft({
    sourceProjectId: state.projectId,
    sourceCanvasId: source.sourceCanvasId,
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: [
      source.layerId
    ],
    layerSelection: {
      kind: "CURRENT_LAYER",
      layerId: source.layerId
    },
    frameStart: source.frameNumber,
    frameEnd: source.frameNumber,
    frameSelection: {
      kind: "CURRENT_FRAME",
      frameId: source.frameId
    },
    region: {
      kind: "MANUAL",
      ...source.region
    },
    animationMapping: [
      createAssetAnimationClipFromInput({
        animationName: initialAnimationName,
        ...input.customName === void 0 ? {} : {
          customName: input.customName
        },
        ...input.motionName === void 0 ? {} : {
          motionName: input.motionName
        },
        ...input.direction === void 0 ? {} : {
          direction: input.direction
        },
        frameIds: [
          source.frameId
        ],
        loopMode: "LOOP",
        fps: 12,
        ...input.sourceReference === void 0 ? {} : {
          sourceReference: input.sourceReference
        },
        ...input.flipX === void 0 ? {} : {
          flipX: input.flipX
        },
        ...input.flipY === void 0 ? {} : {
          flipY: input.flipY
        },
        ...input.sourceFrames === void 0 ? {
          sourceFrames: [
            {
              sourceFrameId: source.frameId,
              layerIds: [
                source.layerId
              ],
              rect: {
                ...source.region
              }
            }
          ]
        } : {
          sourceFrames: input.sourceFrames
        },
        ...input.frameDurationsMs === void 0 ? {} : {
          frameDurationsMs: input.frameDurationsMs
        }
      })
    ],
    assetKind: input.assetKind,
    pivot: input.pivot,
    metadata: {
      name: input.name.trim() || `Asset ${assetDefinitions.length + 1}`
    }
  });
  if (!draft.ok) return {
    ok: false,
    message: draft.message
  };
  const entry = {
    definitionId: nextAssetDefinitionId(),
    definition: draft.value
  };
  assetDefinitions = [
    ...assetDefinitions,
    entry
  ];
  queueDrawPersistenceSave("asset-definition-add");
  notifyAssetStateChanged();
  return {
    ok: true,
    entry: cloneAssetDefinitionEntry(entry)
  };
}
function prepareAssetSelection() {
  clearCommittedSelection("Asset slot ready; select a new canvas region.");
  selectionEditMode = "REPLACE";
  selectionModeControl.value = "REPLACE";
  selectShortcutTool("select-rect");
  canvas.focus({
    preventScroll: true
  });
  setStatus("Asset slot ready \xB7 drag a rectangle on the canvas.");
}
function updateAssetDefinition(input) {
  const current = assetDefinitions.find((entry) => entry.definitionId === input.definitionId);
  if (current === void 0) {
    return {
      ok: false,
      message: "\u5BFE\u8C61\u30A2\u30BB\u30C3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002"
    };
  }
  const pivot = input.pivot ?? current.definition.pivot;
  const pivotDefinition = input.pivot === void 0 ? current.definition.pivotDefinition : pivot === "CUSTOM" ? {
    kind: "CUSTOM",
    x: 0,
    y: 0
  } : {
    kind: pivot
  };
  return assetDefinitionMutation(input.definitionId, {
    ...current.definition,
    assetKind: input.assetKind ?? current.definition.assetKind,
    pivot,
    pivotDefinition,
    metadata: input.name === void 0 ? current.definition.metadata : {
      ...current.definition.metadata,
      name: input.name.trim()
    }
  });
}
function frameIdsForRange(start, end) {
  return state.frames.filter((frame2) => frame2.index + 1 >= start && frame2.index + 1 <= end).sort((left, right) => left.index - right.index).map((frame2) => frame2.frameId);
}
function uniqueFrameIds(frameIds) {
  const allowed = new Set(state.frames.map((frame2) => frame2.frameId));
  const order = new Map(state.frames.map((frame2) => [
    frame2.frameId,
    frame2.index
  ]));
  return [
    ...new Set(frameIds.filter((frameId) => allowed.has(frameId)))
  ].sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
}
function assignAssetAnimation(input) {
  const current = assetDefinitions.find((entry) => entry.definitionId === input.definitionId);
  if (current === void 0) {
    return {
      ok: false,
      message: "\u5BFE\u8C61\u30A2\u30BB\u30C3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002"
    };
  }
  const sourceClip = input.sourceReference === void 0 ? void 0 : current.definition.animationMapping.find((item) => item.name === input.sourceReference || assetAnimationClipKey(item) === input.sourceReference);
  if (input.sourceReference !== void 0 && sourceClip === void 0) {
    return {
      ok: false,
      message: "\u53C2\u7167\u5143\u306EMotion\uFF0FDirection\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002"
    };
  }
  const start = Math.min(input.frameStart, input.frameEnd);
  const end = Math.max(input.frameStart, input.frameEnd);
  if (sourceClip === void 0 && (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end > state.frames.length)) {
    return {
      ok: false,
      message: "\u30D5\u30EC\u30FC\u30E0\u7BC4\u56F2\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  const requestedFrameIds = input.frameIds === void 0 ? sourceClip?.frameIds ?? frameIdsForRange(start, end) : [
    ...input.frameIds
  ];
  const allowedFrameIds = new Set(state.frames.map((frame2) => frame2.frameId));
  const sourceFrameReferences = input.sourceFrames ?? sourceClip?.sourceFrames;
  const frameIds = sourceFrameReferences === void 0 ? [
    ...new Set(requestedFrameIds)
  ] : [
    ...requestedFrameIds
  ];
  if (sourceFrameReferences === void 0 && frameIds.length !== requestedFrameIds.length || sourceFrameReferences !== void 0 && sourceFrameReferences.length !== frameIds.length || frameIds.some((frameId) => !allowedFrameIds.has(frameId))) {
    return {
      ok: false,
      message: "\u30D5\u30EC\u30FC\u30E0\u306E\u4E26\u3073\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  if (frameIds.length === 0 || !Number.isFinite(input.fps) || input.fps <= 0) {
    return {
      ok: false,
      message: "\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u7BC4\u56F2\u307E\u305F\u306FFPS\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  const clip = createAssetAnimationClipFromInput({
    animationName: input.animationName,
    ...input.customName === void 0 ? {} : {
      customName: input.customName
    },
    ...input.motionName === void 0 ? {} : {
      motionName: input.motionName
    },
    ...input.direction === void 0 ? {} : {
      direction: input.direction
    },
    frameIds,
    loopMode: input.loopMode,
    fps: input.fps,
    ...input.sourceReference === void 0 ? {} : {
      sourceReference: input.sourceReference
    },
    ...input.flipX === void 0 ? {} : {
      flipX: input.flipX
    },
    ...input.flipY === void 0 ? {} : {
      flipY: input.flipY
    },
    ...input.frameDurationsMs !== void 0 ? {
      frameDurationsMs: input.frameDurationsMs
    } : sourceClip?.frameDurationsMs === void 0 ? {} : {
      frameDurationsMs: sourceClip.frameDurationsMs
    },
    ...input.sourceFrames !== void 0 ? {
      sourceFrames: input.sourceFrames
    } : sourceClip?.sourceFrames === void 0 ? {} : {
      sourceFrames: sourceClip.sourceFrames
    }
  });
  const clipKey = assetAnimationClipKey(clip);
  const animationMapping = [
    ...current.definition.animationMapping.filter((item) => assetAnimationClipKey(item) !== clipKey),
    clip
  ];
  const sourceFrameIds = uniqueFrameIds(animationMapping.flatMap((item) => item.frameIds));
  const sourceFrames = state.frames.filter((frame2) => sourceFrameIds.includes(frame2.frameId));
  const sourceFrameStart = Math.min(...sourceFrames.map((frame2) => frame2.index + 1));
  const sourceFrameEnd = Math.max(...sourceFrames.map((frame2) => frame2.index + 1));
  return assetDefinitionMutation(input.definitionId, {
    ...current.definition,
    frameStart: sourceFrameStart,
    frameEnd: sourceFrameEnd,
    frameSelection: sourceFrameIds.length === 1 ? {
      kind: "CURRENT_FRAME",
      frameId: sourceFrameIds[0]
    } : {
      kind: "EXPLICIT",
      frameIds: sourceFrameIds
    },
    animationMapping
  });
}
function clearAssetAnimation(input) {
  const current = assetDefinitions.find((entry) => entry.definitionId === input.definitionId);
  if (current === void 0) {
    return {
      ok: false,
      message: "\u5BFE\u8C61\u30A2\u30BB\u30C3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002"
    };
  }
  const clipKey = assetAnimationClipKey({
    name: input.animationName,
    ...input.customName === void 0 ? {} : {
      customName: input.customName
    },
    ...input.motionName === void 0 ? {} : {
      motionName: input.motionName
    },
    ...input.direction === void 0 ? {} : {
      direction: input.direction
    }
  });
  return assetDefinitionMutation(input.definitionId, {
    ...current.definition,
    animationMapping: current.definition.animationMapping.filter((item) => assetAnimationClipKey(item) !== clipKey)
  });
}
function getAssetBridgeSnapshot() {
  return {
    projectId: state.projectId,
    selection: currentAssetSelectionSnapshot(),
    frameNumbers: Object.fromEntries(state.frames.map((frame2) => [
      frame2.frameId,
      frame2.index + 1
    ])),
    assetDefinitions: assetDefinitions.map(cloneAssetDefinitionEntry)
  };
}
function renderAssetReference(input) {
  if (!state.frames.some((frame2) => frame2.frameId === input.sourceFrameId)) {
    return void 0;
  }
  const image = compositeRegion(input.rect, input.sourceFrameId);
  return {
    width: image.width,
    height: image.height,
    data: image.data
  };
}
async function resolveCurrentDrawReference(input) {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return void 0;
  const revisionId = `draw-revision-${asset.revision}`;
  const contentHash = String(await hashCanonical({
    id: asset.id,
    width: asset.width,
    height: asset.height,
    palette: asset.palette,
    pixels: asset.raster.toUint8Array()
  }));
  return {
    kind: "DRAW",
    assetId: asset.id,
    revisionId,
    contentHash,
    mode: input.mode,
    label: asset.id
  };
}
var draw2AssetBridge = {
  snapshot: getAssetBridgeSnapshot,
  resolveCurrentReference: resolveCurrentDrawReference,
  renderReference: renderAssetReference,
  prepareSelection: prepareAssetSelection,
  createDefinition: createEmptyAssetDefinition,
  addFromSelection: addAssetDefinitionFromSelection,
  updateDefinition: updateAssetDefinition,
  assignAnimation: assignAssetAnimation,
  clearAnimation: clearAssetAnimation,
  removeDefinition: (definitionId) => {
    const exists = assetDefinitions.some((entry) => entry.definitionId === definitionId);
    if (!exists) return false;
    assetDefinitions = assetDefinitions.filter((entry) => entry.definitionId !== definitionId);
    queueDrawPersistenceSave("asset-definition-remove");
    notifyAssetStateChanged();
    return true;
  }
};
window.__pixiedraw2AssetBridge = draw2AssetBridge;
var pendingSelectionGesture;
var SELECTION_GRID_SIZE = 16;
var SELECTION_DOUBLE_CLICK_WINDOW_MS = 420;
var lastSelectionClick;
var transformSession;
var transformPreview;
var selectionDrag;
var pasteMode = false;
var clipboard;
var timelineSession = createTimelineSession(state);
var timelineActivationPending = false;
var timelineStateGeneration = 0;
var timelineViewportInitialized = false;
var activeTimelineTab = "timeline";
var timelineFrameElapsedById = /* @__PURE__ */ new Map();
var TIMELINE_PROPERTIES_STORAGE_KEY = "pixieed:draw2:timeline-properties:v1";
var isTimelineTab = (value) => value === "timeline" || value === "tags" || value === "markers" || value === "audio";
var readTimelinePropertiesPreference = () => {
  try {
    const raw = window.localStorage.getItem(TIMELINE_PROPERTIES_STORAGE_KEY);
    if (raw === null) {
      return {
        width: 240,
        collapsed: false,
        activeTab: "timeline"
      };
    }
    const parsed = JSON.parse(raw);
    return {
      width: typeof parsed.width === "number" && Number.isFinite(parsed.width) ? Math.max(200, Math.min(320, parsed.width)) : 240,
      collapsed: parsed.collapsed === true,
      activeTab: isTimelineTab(parsed.activeTab) ? parsed.activeTab : "timeline"
    };
  } catch {
    return {
      width: 240,
      collapsed: false,
      activeTab: "timeline"
    };
  }
};
var initialTimelinePropertiesPreference = readTimelinePropertiesPreference();
var timelinePropertiesWidth = initialTimelinePropertiesPreference.width;
var timelinePropertiesCollapsed = initialTimelinePropertiesPreference.collapsed;
activeTimelineTab = initialTimelinePropertiesPreference.activeTab;
var timelineSelectedCells = /* @__PURE__ */ new Set();
var timelineSelectionAnchor;
var timelineScrollRenderFrame;
var lastRenderedTimelineScrollTop = Number.NaN;
var lastRenderedTimelineScrollLeft = Number.NaN;
var timelineContextTarget;
var structureClientSequence = 0;
var onionSkinEnabled = false;
var onionSkinPreviousFrames = 1;
var onionSkinNextFrames = 1;
var onionSkinOpacity = 0.5;
var onionSkinColorMode = "TINTED";
var onionSkinCache;
var runtimePreviewSession;
var game350ProductSession;
var game351PlayableState;
var game351Behaviors = [];
var game351InputSequence = 0;
var game351PreviewMode = "LIVE";
var toolOptions = {
  brushSize: 1,
  brushShape: "square",
  pattern: "solid",
  similarity: 0,
  selectionMode: "similar"
};
var hoverPoint;
var playbackAnimationFrame;
var playbackGeneration = 0;
var playbackStartedAt = 0;
var playbackRunning = false;
var playbackRate = 1;
var playbackFrameId;
var playbackStartFrameId;
var playbackOriginSession;
var audioLinkedPreviewPlaying = false;
var colorDraft;
var colorDraftAlpha = 255;
var colorDraftDirty = false;
var colorCommitInFlight = false;
var colorPreviewFrame;
var mirrorMode = "NONE";
var mirrorEnabled = false;
var mirrorAxes = {
  x: false,
  y: false,
  diagonalDown: false,
  diagonalUp: false
};
var canvasResizeAnchor = "CENTER";
var mirrorGuide = {
  x: mirrorGuideCenter(canvas.width),
  y: mirrorGuideCenter(canvas.height),
  diagonalDown: 0,
  diagonalUp: 0
};
var mirrorGuideDrag;
var mirrorGuideClickSuppressed = false;
var MIRROR_GUIDE_DRAG_THRESHOLD_PX = 6;
function syncClientSequencesFromState() {
  clientSequence = state.lastClientSequenceByClient[DRAW_CLIENT_ID] ?? 0;
  selectionClientSequence = state.lastClientSequenceByClient[SELECTION_CLIENT_ID] ?? 0;
  structureClientSequence = state.lastClientSequenceByClient[TIMELINE_CLIENT_ID] ?? 0;
}
function nextClientSequence(clientId) {
  const next = (state.lastClientSequenceByClient[clientId] ?? 0) + 1;
  if (clientId === DRAW_CLIENT_ID) clientSequence = next;
  else if (clientId === SELECTION_CLIENT_ID) selectionClientSequence = next;
  else if (clientId === TIMELINE_CLIENT_ID) structureClientSequence = next;
  return next;
}
function setGamePreviewStatus(message, kind = "ready") {
  gamePreviewStatus.textContent = translateDraw2Text(message, draw2Locale);
  gamePreviewStatus.dataset.state = kind;
  const normalized = message.toLocaleUpperCase();
  document.documentElement.dataset.gamePreviewState = kind === "error" ? "error" : normalized.includes("READY") ? "ready" : normalized.includes("STOPPED") ? "stopped" : "idle";
  window.dispatchEvent(new CustomEvent("draw2:game-preview-state", {
    detail: {
      state: document.documentElement.dataset.gamePreviewState
    }
  }));
}
async function buildLocalDraw2GameProject(mode) {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) {
    throw new Error("Active Draw2 Asset is unavailable.");
  }
  const revision = `draw-revision-${asset.revision}`;
  const contentHash = asSha256(await hashCanonical({
    id: asset.id,
    width: asset.width,
    height: asset.height,
    palette: asset.palette,
    pixels: asset.raster.toUint8Array()
  }));
  const assetId = asAssetId(asset.id);
  const assetRevisionId = asAssetRevisionId(revision);
  const dependencies = await createGameDependencySnapshot("draw2-local-game-package", "0.1.0", [
    {
      assetId,
      revisionId: assetRevisionId,
      contentHash,
      byteLength: asset.width * asset.height,
      mimeType: "application/x-pixieed-indexed-raster",
      mode,
      required: true
    }
  ]);
  const ownerId = "draw2-local-owner";
  const project = await createGameProjectRevision({
    schemaVersion: 1,
    projectId: state.projectId,
    revisionId: `draw2-project-revision-${state.structureEpoch}`,
    packageId: "draw2-local-game-package",
    packageVersion: "0.1.0",
    name: "Draw2 Local Runtime Preview",
    scenes: [
      {
        sceneId: "draw2-local-scene",
        name: "Draw2 active asset",
        rootEntityIds: [
          "draw2-local-entity"
        ],
        entities: [
          {
            entityId: "draw2-local-entity",
            name: asset.id,
            components: [
              {
                type: "SPRITE",
                componentId: "draw2-local-sprite",
                asset: {
                  kind: "DRAW",
                  assetId,
                  revisionId: assetRevisionId,
                  contentHash,
                  byteLength: asset.width * asset.height,
                  mimeType: "application/x-pixieed-indexed-raster",
                  mode,
                  provenance: "DRAW2"
                },
                visible: true
              }
            ]
          }
        ]
      }
    ],
    inputMap: {
      actions: []
    },
    behaviors: [],
    dependencies,
    buildProfile: {
      target: "PIXIEED_NATIVE_WEB_RUNTIME",
      runtimeVersion: "0.1.0",
      capabilityProfile: "browser",
      optimization: "DEBUG"
    }
  });
  return {
    project,
    asset,
    authority: [
      {
        projectId: state.projectId,
        ownerId,
        kind: "DRAW",
        assetId: asset.id,
        revisionId: revision,
        contentHash: asSha2562(String(contentHash)),
        licenseId: "draw2-local-preview",
        permission: "READ",
        reviewStatus: "APPROVED"
      }
    ]
  };
}
function drawGamePreview(session, asset) {
  gamePreviewContext.clearRect(0, 0, gamePreviewCanvas.width, gamePreviewCanvas.height);
  gamePreviewContext.fillStyle = "#101b2d";
  gamePreviewContext.fillRect(0, 0, gamePreviewCanvas.width, gamePreviewCanvas.height);
  const image = gamePreviewContext.createImageData(asset.width, asset.height);
  const pixels = asset.raster.toUint8Array();
  for (let index = 0; index < pixels.length; index += 1) {
    const color = decodeArgb(asset.palette[pixels[index] ?? 0] ?? 0);
    image.data[index * 4] = color.red;
    image.data[index * 4 + 1] = color.green;
    image.data[index * 4 + 2] = color.blue;
    image.data[index * 4 + 3] = color.alpha;
  }
  gamePreviewContext.putImageData(image, 0, 0);
}
function drawGame351Preview(state2, mode) {
  const { snapshot, runtime } = state2;
  const cellWidth = gamePreviewCanvas.width / 8;
  const cellHeight = gamePreviewCanvas.height / 6;
  gamePreviewContext.clearRect(0, 0, gamePreviewCanvas.width, gamePreviewCanvas.height);
  gamePreviewContext.fillStyle = "#10233b";
  gamePreviewContext.fillRect(0, 0, gamePreviewCanvas.width, gamePreviewCanvas.height);
  gamePreviewContext.fillStyle = "#2d6b52";
  gamePreviewContext.fillRect(cellWidth, cellHeight, cellWidth * 6, cellHeight * 4);
  for (const solid of snapshot.solidCells) {
    gamePreviewContext.fillStyle = solid.x === 0 || solid.y === 0 || solid.x === 7 || solid.y === 5 ? "#25334a" : "#7f4a4a";
    gamePreviewContext.fillRect(solid.x * cellWidth, solid.y * cellHeight, cellWidth, cellHeight);
  }
  gamePreviewContext.strokeStyle = "rgba(220, 237, 255, 0.22)";
  gamePreviewContext.lineWidth = 1;
  for (let x = 0; x <= 8; x += 1) {
    gamePreviewContext.beginPath();
    gamePreviewContext.moveTo(x * cellWidth + 0.5, 0);
    gamePreviewContext.lineTo(x * cellWidth + 0.5, gamePreviewCanvas.height);
    gamePreviewContext.stroke();
  }
  for (let y = 0; y <= 6; y += 1) {
    gamePreviewContext.beginPath();
    gamePreviewContext.moveTo(0, y * cellHeight + 0.5);
    gamePreviewContext.lineTo(gamePreviewCanvas.width, y * cellHeight + 0.5);
    gamePreviewContext.stroke();
  }
  const cameraX = Math.max(0, Math.min(6, runtime.playerPosition.x - 3));
  const cameraY = Math.max(0, Math.min(4, runtime.playerPosition.y - 2));
  gamePreviewContext.strokeStyle = "#b8e5ff";
  gamePreviewContext.lineWidth = 1.5;
  gamePreviewContext.strokeRect(cameraX * cellWidth + 2, cameraY * cellHeight + 2, cellWidth * 6 - 4, cellHeight * 4 - 4);
  gamePreviewContext.fillStyle = "#f5a04f";
  gamePreviewContext.fillRect(runtime.npcPosition.x * cellWidth + 4, runtime.npcPosition.y * cellHeight + 3, cellWidth - 8, cellHeight - 6);
  gamePreviewContext.fillStyle = runtime.mode === "PLAYING" ? "#6bd4ff" : "#7b8fa5";
  gamePreviewContext.fillRect(runtime.playerPosition.x * cellWidth + 3, runtime.playerPosition.y * cellHeight + 2, cellWidth - 6, cellHeight - 4);
  if (runtime.dialogue !== null) {
    gamePreviewContext.fillStyle = "rgba(8, 14, 25, 0.92)";
    gamePreviewContext.fillRect(4, gamePreviewCanvas.height - 25, 152, 21);
    gamePreviewContext.strokeStyle = "#f5d18b";
    gamePreviewContext.strokeRect(4.5, gamePreviewCanvas.height - 24.5, 151, 20);
    gamePreviewContext.fillStyle = "#fff2cc";
    gamePreviewContext.font = "7px sans-serif";
    gamePreviewContext.fillText(runtime.dialogue.slice(0, 38), 8, gamePreviewCanvas.height - 11);
  }
  delete gamePreviewCanvas.dataset.game351Error;
  gamePreviewCanvas.dataset.game351Mode = runtime.mode;
  gamePreviewCanvas.dataset.game351Player = `${runtime.playerPosition.x},${runtime.playerPosition.y}`;
  gamePreviewCanvas.dataset.game351Tick = String(runtime.tick);
  gamePreviewCanvas.dataset.game351Dialogue = runtime.dialogue ?? "";
  setGamePreviewStatus(`Runtime ${runtime.mode === "PLAYING" ? "READY" : "STOPPED"} \xB7 GAME-351 RPG \xB7 ${mode} \xB7 tick=${runtime.tick} \xB7 Player ${runtime.playerPosition.x},${runtime.playerPosition.y} \xB7 Camera follow${runtime.dialogue === null ? "" : " \xB7 dialogue"}`);
}
async function startGame351Preview(mode) {
  game351PreviewMode = mode;
  const workspace = getWorkspacePxdBridge();
  await workspace.preparePixyncGameState?.();
  const project = workspace.gameCurrentProject?.();
  let template;
  let playable;
  try {
    template = project === void 0 ? await createGame351RpgTemplate({
      projectId: state.projectId,
      ownerId: "draw2-local-owner",
      revisionId: "game351-preview-revision"
    }) : createGame351RpgTemplateFromProject(project);
    playable = createGame351PlayableState(template);
  } catch {
    template = await createGame351RpgTemplate({
      projectId: project?.projectId ?? state.projectId,
      ownerId: project?.ownerId ?? "draw2-local-owner",
      revisionId: project?.revision.revisionId ?? "game351-preview-revision"
    });
    playable = createGame351PlayableState(template);
  }
  if (playable === void 0) {
    throw new Error("GAME-351 preview state could not be created.");
  }
  game351PlayableState = playGame351(playable);
  game351InputSequence = 0;
  game351Behaviors = project?.behaviors ?? [];
  drawGame351Preview(game351PlayableState, mode);
  if (typeof workspace.refreshSite400IGameRoute === "function") {
    await workspace.refreshSite400IGameRoute("open");
  }
}
function game351ActionForKey(key) {
  if (key === "ArrowUp" || key.toLowerCase() === "w") {
    return GAME351_INPUT_ACTIONS.MOVE_UP;
  }
  if (key === "ArrowDown" || key.toLowerCase() === "s") {
    return GAME351_INPUT_ACTIONS.MOVE_DOWN;
  }
  if (key === "ArrowLeft" || key.toLowerCase() === "a") {
    return GAME351_INPUT_ACTIONS.MOVE_LEFT;
  }
  if (key === "ArrowRight" || key.toLowerCase() === "d") {
    return GAME351_INPUT_ACTIONS.MOVE_RIGHT;
  }
  return void 0;
}
function handleGame351PreviewKey(event) {
  const current = game351PlayableState;
  if (current === void 0) return;
  if (event.key === "Escape") {
    event.preventDefault();
    game351PlayableState = clearGame351Dialogue(current);
    drawGame351Preview(game351PlayableState, game351PreviewMode);
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    game351PlayableState = triggerGame351Action(current, String(GAME351_INTERACT_ACTION), game351Behaviors);
    drawGame351Preview(game351PlayableState, game351PreviewMode);
    return;
  }
  const action = game351ActionForKey(event.key);
  if (action === void 0) return;
  event.preventDefault();
  game351InputSequence = Math.max(game351InputSequence + 1, current.input.lastSequence + 1);
  game351PlayableState = stepGame351(current, {
    sequence: game351InputSequence,
    action
  });
  drawGame351Preview(game351PlayableState, game351PreviewMode);
}
async function startGamePreview(mode = "LIVE") {
  try {
    const boundary = await buildLocalDraw2GameProject(mode);
    const ownerId = "draw2-local-owner";
    const product = await startGame350ProductPreview({
      project: boundary.project,
      authority: boundary.authority,
      ownerId,
      licenseByAsset: {
        [boundary.asset.id]: "draw2-local-preview"
      },
      sceneId: "draw2-local-scene",
      payloadResolver: {
        resolve: async (request) => ({
          assetId: request.assetId,
          revisionId: asAssetRevisionId(`draw-revision-${boundary.asset.revision}`),
          contentHash: boundary.project.dependencies.entries[0].contentHash,
          byteLength: boundary.asset.width * boundary.asset.height,
          mimeType: "application/x-pixieed-indexed-raster"
        })
      },
      previewId: "draw2-local-game-preview",
      runtime: {
        runtimeId: "pixie-runtime",
        runtimeVersion: "0.1.0",
        supportedManifestVersion: 1
      },
      supportedRuntimeVersion: "0.1.0",
      capabilities: {
        pointer: true,
        touch: true,
        keyboard: true,
        mouse: true,
        gamepad: false,
        screenWidth: 160,
        screenHeight: 96,
        devicePixelRatio: 1,
        audio: false,
        graphics: "CANVAS2D",
        webGpuBenefitMeasured: false,
        reducedMotion: false
      },
      renderer: "CANVAS2D"
    });
    if (!product.ok || product.value === void 0) {
      throw new Error(product.diagnostics.map((item) => item.message).join(" "));
    }
    game350ProductSession = product.value;
    runtimePreviewSession = game350ProductSession.step(100).runtime;
    drawGamePreview(runtimePreviewSession, boundary.asset);
    gamePreviewPinControl.disabled = false;
    gamePreviewReloadControl.disabled = false;
    setGamePreviewStatus(`Runtime READY \xB7 ${mode} \xB7 tick=${runtimePreviewSession.world.tick}`);
    try {
      await startGame351Preview(mode);
    } catch (cause) {
      game351PlayableState = void 0;
      game351Behaviors = [];
      gamePreviewCanvas.dataset.game351Error = cause instanceof Error ? cause.message : "preview-unavailable";
    }
  } catch (cause) {
    setGamePreviewStatus(cause instanceof Error ? cause.message : "Runtime preview failed.", "error");
  }
}
function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
function argbFromRgb(color, alpha = 255) {
  return (clampColorChannel(alpha) << 24 | clampColorChannel(color.r) << 16 | clampColorChannel(color.g) << 8 | clampColorChannel(color.b)) >>> 0;
}
function rgbToHex(color) {
  return `#${[
    color.r,
    color.g,
    color.b
  ].map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
function parseHexColor(value) {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return void 0;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}
function rgbToHsv(color) {
  const r = clampColorChannel(color.r) / 255;
  const g = clampColorChannel(color.g) / 255;
  const b = clampColorChannel(color.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * ((g - b) / delta % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
}
function hsvToRgb(color) {
  const h = (color.h % 360 + 360) % 360;
  const s = Math.max(0, Math.min(1, color.s));
  const v = Math.max(0, Math.min(1, color.v));
  const chroma = v * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs(section % 2 - 1));
  const match = v - chroma;
  const rgb = section < 1 ? [
    chroma,
    x,
    0
  ] : section < 2 ? [
    x,
    chroma,
    0
  ] : section < 3 ? [
    0,
    chroma,
    x
  ] : section < 4 ? [
    0,
    x,
    chroma
  ] : section < 5 ? [
    x,
    0,
    chroma
  ] : [
    chroma,
    0,
    x
  ];
  return {
    r: (rgb[0] + match) * 255,
    g: (rgb[1] + match) * 255,
    b: (rgb[2] + match) * 255
  };
}
function setColorEditorStatus(message, kind = "ready") {
  colorEditorStatus.textContent = translateDraw2Text(message, draw2Locale);
  colorEditorStatus.dataset.state = kind;
}
function getPaletteWheelDisplaySize() {
  const bounds = paletteWheel.getBoundingClientRect();
  return Math.max(0, Math.min(bounds.width, bounds.height));
}
function paletteWheelPointFromClient(clientX, clientY) {
  const wheelBounds = paletteWheel.getBoundingClientRect();
  const size = Math.max(0, Math.min(wheelBounds.width, wheelBounds.height));
  if (!size) return void 0;
  return {
    x: Math.max(0, Math.min(size, clientX - wheelBounds.left)),
    y: Math.max(0, Math.min(size, clientY - wheelBounds.top)),
    size
  };
}
function getPaletteWheelMetrics(size) {
  const center = size / 2;
  const outerRadius = Math.max(2, size / 2 - 0.5);
  const ringThickness = Math.max(14, Math.min(26, size * 0.14));
  const innerRadius = Math.max(8, outerRadius - ringThickness);
  const svHalf = Math.max(6, innerRadius / Math.SQRT2);
  const svLeft = center - svHalf;
  const svTop = center - svHalf;
  const svRight = center + svHalf;
  const svBottom = center + svHalf;
  return {
    center,
    outerRadius,
    innerRadius,
    hueCursorRadius: innerRadius + (outerRadius - innerRadius) * 0.5,
    svLeft,
    svTop,
    svRight,
    svBottom,
    svSpan: Math.max(1, svRight - svLeft)
  };
}
function isPointInsidePaletteSv(x, y, metrics2) {
  return x >= metrics2.svLeft && x <= metrics2.svRight && y >= metrics2.svTop && y <= metrics2.svBottom;
}
function drawPaletteWheel(hue) {
  const displaySize = getPaletteWheelDisplaySize();
  if (!displaySize) return;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.max(1, Math.round(displaySize * dpr));
  if (paletteWheel.width !== size || paletteWheel.height !== size) {
    paletteWheel.width = size;
    paletteWheel.height = size;
    paletteWheelRenderKey = "";
  }
  const renderKey = `${size}:${Math.round(hue * 100)}`;
  if (paletteWheelRenderKey === renderKey) return;
  const scale = size / displaySize;
  const displayMetrics = getPaletteWheelMetrics(displaySize);
  const metrics2 = {
    center: displayMetrics.center * scale,
    outerRadius: displayMetrics.outerRadius * scale,
    innerRadius: displayMetrics.innerRadius * scale,
    hueCursorRadius: displayMetrics.hueCursorRadius * scale,
    svLeft: displayMetrics.svLeft * scale,
    svTop: displayMetrics.svTop * scale,
    svRight: displayMetrics.svRight * scale,
    svBottom: displayMetrics.svBottom * scale,
    svSpan: displayMetrics.svSpan * scale
  };
  const image = paletteWheelContext.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - metrics2.center;
      const dy = y + 0.5 - metrics2.center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const index = (y * size + x) * 4;
      if (distance > metrics2.outerRadius) {
        image.data[index + 3] = 0;
        continue;
      }
      let rgb;
      if (distance >= metrics2.innerRadius) {
        const ringHue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        rgb = hsvToRgb({
          h: ringHue,
          s: 1,
          v: 1
        });
      } else if (isPointInsidePaletteSv(x + 0.5, y + 0.5, metrics2)) {
        const saturation = Math.max(0, Math.min(1, (x + 0.5 - metrics2.svLeft) / metrics2.svSpan));
        const value = 1 - Math.max(0, Math.min(1, (y + 0.5 - metrics2.svTop) / metrics2.svSpan));
        rgb = hsvToRgb({
          h: hue,
          s: saturation,
          v: value
        });
      } else {
        rgb = {
          r: 16,
          g: 24,
          b: 36
        };
      }
      image.data[index] = Math.round(rgb.r);
      image.data[index + 1] = Math.round(rgb.g);
      image.data[index + 2] = Math.round(rgb.b);
      image.data[index + 3] = 255;
    }
  }
  paletteWheelContext.putImageData(image, 0, 0);
  paletteWheelRenderKey = renderKey;
}
function updatePaletteWheelCursor(hsv) {
  const displaySize = getPaletteWheelDisplaySize();
  if (!displaySize) return;
  const metrics2 = getPaletteWheelMetrics(displaySize);
  const mapBounds = colorMap.getBoundingClientRect();
  const wheelBounds = paletteWheel.getBoundingClientRect();
  const offsetX = wheelBounds.left - mapBounds.left;
  const offsetY = wheelBounds.top - mapBounds.top;
  const hueAngle = hsv.h * Math.PI / 180;
  hueCursor.style.left = `${offsetX + metrics2.center + Math.cos(hueAngle) * metrics2.hueCursorRadius}px`;
  hueCursor.style.top = `${offsetY + metrics2.center + Math.sin(hueAngle) * metrics2.hueCursorRadius}px`;
  svCursor.style.left = `${offsetX + metrics2.svLeft + hsv.s * metrics2.svSpan}px`;
  svCursor.style.top = `${offsetY + metrics2.svTop + (1 - hsv.v) * metrics2.svSpan}px`;
}
function redrawPaletteWheelFromDraft() {
  const hsv = rgbToHsv({
    r: Number(colorR.value),
    g: Number(colorG.value),
    b: Number(colorB.value)
  });
  paletteWheelRenderKey = "";
  drawPaletteWheel(hsv.h);
  updatePaletteWheelCursor(hsv);
}
var paletteWheelResizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
  redrawPaletteWheelFromDraft();
}) : void 0;
paletteWheelResizeObserver?.observe(colorMap);
window.addEventListener("resize", redrawPaletteWheelFromDraft, {
  passive: true
});
function refreshPaletteButtonPreview() {
  const preview = selectedColor > 0 && colorDraftDirty && colorDraft !== void 0 ? argbFromRgb(colorDraft, colorDraftAlpha) : void 0;
  for (const button of colorButtons) {
    if (Number(button.dataset.colorIndex) !== selectedColor || preview === void 0) {
      button.removeAttribute("data-preview-color");
      continue;
    }
    const { red, green, blue } = decodeArgb(preview);
    button.style.backgroundColor = `rgb(${red} ${green} ${blue})`;
    button.dataset.previewColor = "true";
  }
}
function requestColorPreviewRender() {
  refreshPaletteButtonPreview();
  if (colorPreviewFrame !== void 0) return;
  colorPreviewFrame = window.requestAnimationFrame(() => {
    colorPreviewFrame = void 0;
    void present().catch(() => void 0);
  });
}
function setColorEditorRgb(color, writeHex = true, markDraft = true) {
  const rgb = {
    r: clampColorChannel(color.r),
    g: clampColorChannel(color.g),
    b: clampColorChannel(color.b)
  };
  if (markDraft) {
    colorDraft = rgb;
    colorDraftDirty = true;
  }
  colorR.value = String(rgb.r);
  colorG.value = String(rgb.g);
  colorB.value = String(rgb.b);
  colorAlpha.value = String(colorDraftAlpha);
  colorRValue.value = String(rgb.r);
  colorGValue.value = String(rgb.g);
  colorBValue.value = String(rgb.b);
  colorAlphaValue.value = String(Math.round(colorDraftAlpha / 255 * 100));
  const hex = rgbToHex(rgb);
  if (writeHex) colorHex.value = hex;
  colorHexOutput.value = hex;
  for (const output of mobileColorOutputElements) output.value = hex;
  const hsv = rgbToHsv(rgb);
  colorMap.setAttribute("aria-valuetext", `Hue ${Math.round(hsv.h)}, saturation ${Math.round(hsv.s * 100)}%, value ${Math.round(hsv.v * 100)}%`);
  drawPaletteWheel(hsv.h);
  updatePaletteWheelCursor(hsv);
  if (markDraft) requestColorPreviewRender();
}
function syncColorEditorFromSelection() {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return;
  const selected = asset.palette[selectedColor] ?? asset.palette[0] ?? 0;
  const { alpha, red, green, blue } = decodeArgb(selected);
  colorDraftAlpha = alpha;
  setColorEditorRgb({
    r: red,
    g: green,
    b: blue
  }, true, false);
  colorAlpha.value = String(alpha);
  colorAlphaValue.value = String(Math.round(alpha / 255 * 100));
  colorDraft = {
    r: red,
    g: green,
    b: blue
  };
  colorDraftDirty = false;
  colorApply.disabled = selectedColor === 0;
  setColorEditorStatus(selectedColor === 0 ? "Index 0 \xB7 transparent / eraser" : `Index ${selectedColor} \xB7 local edit`);
}
function renderPaletteButtons(palette) {
  for (const group of colorButtonGroups) {
    group.replaceChildren();
    palette.forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `draw2-color${index === 0 ? " is-transparent" : ""}`;
      button.dataset.colorIndex = String(index);
      button.setAttribute("aria-pressed", String(index === selectedColor));
      button.setAttribute("aria-label", localizeDraw2Text(`Palette color ${index}`));
      button.title = localizeDraw2Text(`Palette ${index}`);
      if (index > 0) {
        const { alpha, red, green, blue } = decodeArgb(color);
        button.style.backgroundColor = `rgb(${red} ${green} ${blue} / ${alpha / 255})`;
      }
      group.append(button);
    });
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "draw2-color-add";
    addButton.dataset.colorAdd = "true";
    addButton.setAttribute("aria-label", localizeDraw2Text("Add color"));
    addButton.title = localizeDraw2Text("Add color");
    addButton.classList.add("draw2-button-icon");
    addButton.append(createDraw2Icon("icon-add"));
    addButton.addEventListener("click", () => {
      void appendColorFromDraft();
    });
    group.append(addButton);
  }
  colorButtons = Array.from(document.querySelectorAll("[data-color-index]"));
  for (const button of colorButtons) {
    button.addEventListener("click", () => {
      selectedColor = Number(button.dataset.colorIndex ?? "1");
      for (const candidate of colorButtons) {
        candidate.setAttribute("aria-pressed", String(candidate.dataset.colorIndex === button.dataset.colorIndex));
      }
      syncColorEditorFromSelection();
      scheduleDraw2EditorPreferencesSave();
    });
  }
  refreshPaletteButtonPreview();
}
function setColorEditorFromWheel(clientX, clientY, mode) {
  const point = paletteWheelPointFromClient(clientX, clientY);
  if (point === void 0) return;
  const { x, y, size } = point;
  const metrics2 = getPaletteWheelMetrics(size);
  const current = rgbToHsv({
    r: Number(colorR.value),
    g: Number(colorG.value),
    b: Number(colorB.value)
  });
  if (mode === "hue") {
    const hue = (Math.atan2(y - metrics2.center, x - metrics2.center) * 180 / Math.PI + 360) % 360;
    setColorEditorRgb(hsvToRgb({
      h: hue,
      s: current.s,
      v: current.v
    }));
  } else {
    const saturation = Math.max(0, Math.min(1, (x - metrics2.svLeft) / metrics2.svSpan));
    const value = 1 - Math.max(0, Math.min(1, (y - metrics2.svTop) / metrics2.svSpan));
    setColorEditorRgb(hsvToRgb({
      h: current.h,
      s: saturation,
      v: value
    }));
  }
  colorApply.disabled = selectedColor === 0;
  setColorEditorStatus(selectedColor === 0 ? "Index 0\u306F\u900F\u660E\u8272\u3067\u3059" : "Color preview \xB7 release to commit");
}
async function commitColorEdit() {
  if (selectedColor === 0) {
    setColorEditorStatus("Index 0\u306F\u900F\u660E\u8272\u306E\u305F\u3081\u5909\u66F4\u3067\u304D\u307E\u305B\u3093", "error");
    return;
  }
  if (!colorDraftDirty || colorDraft === void 0 || colorCommitInFlight) {
    return;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) {
    setColorEditorStatus("HEX\u306F #RRGGBB \u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", "error");
    colorApply.disabled = true;
    return;
  }
  const color = colorDraft;
  colorCommitInFlight = true;
  colorApply.disabled = true;
  const commandSequence = nextClientSequence(DRAW_CLIENT_ID);
  const before = state;
  const command = {
    commandId: `draw2-local-palette-${commandSequence}`,
    commandType: "palette.setColor",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: "local-preview-user",
    clientId: DRAW_CLIENT_ID,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: {
      paletteIndex: selectedColor,
      color: argbFromRgb(color, colorDraftAlpha)
    }
  };
  const result = await core.execute(command);
  if (!result.ok) {
    syncClientSequencesFromState();
    colorCommitInFlight = false;
    colorApply.disabled = selectedColor === 0;
    setColorEditorStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
    return;
  }
  state = result.state;
  colorDraftDirty = false;
  colorCommitInFlight = false;
  history.record(before, state, result.result.operation.operationId, result.result.operation.operationType);
  saveDrawProjectState();
  await autosave.record(state, result.result);
  renderPaletteButtons(state.assets[state.activeAssetId]?.palette ?? []);
  syncColorEditorFromSelection();
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateHistoryButtons();
  setColorEditorStatus(`Index ${selectedColor} \xB7 committed on release \xB7 1 undo`);
  setStatus(`Palette index ${selectedColor} updated locally \xB7 canonical color changed.`);
}
async function appendColorFromDraft() {
  const asset = state.assets[state.activeAssetId];
  const color = parseHexColor(colorHex.value);
  if (asset === void 0 || color === void 0) {
    setColorEditorStatus("HEX\u306F #RRGGBB \u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", "error");
    return;
  }
  const commandSequence = nextClientSequence(DRAW_CLIENT_ID);
  const before = state;
  const command = {
    commandId: `draw2-local-palette-append-${commandSequence}`,
    commandType: "palette.appendColor",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: "local-preview-user",
    clientId: DRAW_CLIENT_ID,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: {
      color: argbFromRgb(color, colorDraftAlpha)
    }
  };
  const result = await core.execute(command);
  if (!result.ok) {
    syncClientSequencesFromState();
    setColorEditorStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
    return;
  }
  state = result.state;
  selectedColor = asset.palette.length;
  history.record(before, state, result.result.operation.operationId, result.result.operation.operationType);
  saveDrawProjectState();
  scheduleDraw2EditorPreferencesSave();
  await autosave.record(state, result.result);
  renderPaletteButtons(state.assets[state.activeAssetId]?.palette ?? []);
  syncColorEditorFromSelection();
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateHistoryButtons();
  setColorEditorStatus(`Index ${selectedColor} \xB7 added \xB7 1 undo`);
  setStatus(`Palette index ${selectedColor} added locally \xB7 canonical color changed.`);
}
function setStatus(message, kind = "ready") {
  status.textContent = translateDraw2Text(message, draw2Locale);
  status.dataset.state = kind;
}
function integerInput(element, fallback) {
  const value = Number(element.value);
  return Number.isSafeInteger(value) ? value : fallback;
}
function currentTransform() {
  const rawFactor = Number(transformFactor.value);
  const factor = Number.isFinite(rawFactor) ? Math.max(0.125, Math.min(8, Math.round(rawFactor * 1e3) / 1e3)) : 1;
  return {
    operation: transformOperation.value,
    dx: integerInput(transformDx, 0),
    dy: integerInput(transformDy, 0),
    factor,
    interpolationPolicy: "NEAREST_NEIGHBOR",
    outOfBoundsPolicy: "CLIP"
  };
}
function currentSelectionBounds() {
  return {
    x: integerInput(selectionX, 0),
    y: integerInput(selectionY, 0),
    width: integerInput(selectionWidth, 1),
    height: integerInput(selectionHeight, 1)
  };
}
function updateHistoryButtons() {
  undoControl.disabled = history.undoDepth === 0;
  redoControl.disabled = history.redoDepth === 0;
  window.dispatchEvent(new CustomEvent("draw2:history-changed", {
    detail: draw2HistoryPanelSnapshot()
  }));
}
function updateSelectionStatus(message) {
  selectionStatus.textContent = translateDraw2Text(message, draw2Locale);
}
function updateSelectionActionButtons() {
  commitSelectionControl.disabled = selectionDraft === void 0;
  cancelSelectionControl.disabled = selectionDraft === void 0 && pendingSelectionGesture === void 0;
  syncWorkspaceEditCommandState();
}
function syncWorkspaceEditCommandState() {
  const hasSelection = selection !== void 0 && selectionScopeMatchesActiveCel();
  const hasPreview = transformSession !== void 0 && transformPreview !== void 0;
  const commandAvailability = {
    copy: hasSelection,
    cut: hasSelection,
    paste: clipboard !== void 0,
    "preview-transform": hasSelection,
    "commit-transform": hasPreview,
    "cancel-transform": hasPreview
  };
  for (const button of document.querySelectorAll("[data-workspace-command]")) {
    const command = button.dataset.workspaceCommand;
    if (command === void 0 || !(command in commandAvailability)) continue;
    const enabled = commandAvailability[command] === true;
    button.disabled = !enabled;
    button.setAttribute("aria-disabled", String(!enabled));
  }
  if (workspaceFrameElement !== null) {
    workspaceFrameElement.dataset.draw2SelectionReady = String(hasSelection);
    workspaceFrameElement.dataset.draw2TransformPreview = String(hasPreview);
    workspaceFrameElement.dataset.draw2ClipboardReady = String(clipboard !== void 0);
  }
}
function selectionModeLabel(mode) {
  return mode.toLowerCase();
}
function selectionPointsFromSnapshot(snapshot) {
  return snapshot?.pixels.map(({ x, y }) => ({
    x,
    y
  })) ?? [];
}
function normalizeTimelineSession() {
  const fallbackFrameId = state.timeline.frameOrder[0] ?? state.activeFrameId;
  const fallbackLayerTrackId = state.timeline.layerTrackOrder[0] ?? state.activeLayerId;
  const frameId = state.timeline.frameOrder.includes(timelineSession.activeFrameId) ? timelineSession.activeFrameId : fallbackFrameId;
  const layerTrackId = state.timeline.layerTrackOrder.includes(timelineSession.activeLayerTrackId) ? timelineSession.activeLayerTrackId : fallbackLayerTrackId;
  timelineSession = {
    ...timelineSession,
    activeFrameId: frameId,
    selectedFrameId: frameId,
    activeLayerTrackId: layerTrackId
  };
}
function timelineCssPixelValue(property, fallback) {
  const value = Number.parseFloat(getComputedStyle(timelineViewport).getPropertyValue(property));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function formatTimelineClock(milliseconds) {
  const safeMilliseconds = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(safeMilliseconds / 6e4);
  const seconds = Math.floor(safeMilliseconds % 6e4 / 1e3);
  const tenths = Math.floor(safeMilliseconds % 1e3 / 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}
function playbackFpsValue() {
  const raw = playbackFpsControl.value === "custom" ? Number(playbackFpsCustomControl.value) : Number(playbackFpsControl.value);
  return Math.max(1, Math.min(240, Number.isFinite(raw) ? raw : 24));
}
function syncDrawTimelineToAudioWorkspace() {
  const bridge = window.__pixiedraw2WorkspaceDebug;
  if (typeof bridge?.setDrawTimelineFrames !== "function") return;
  const playbackFps = playbackFpsValue();
  const speedRatio = playbackFps / 24;
  const frames = state.timeline.frameOrder.map((frameId) => {
    const frame2 = state.frames.find((item) => item.frameId === frameId);
    return {
      frameId,
      // Draw playback scales the authored frame duration by playbackFps/24.
      // Audio receives the effective duration so a faster FPS visibly
      // produces the same chopped-up cells as the animation preview.
      durationMs: Math.max(1, (frame2?.durationMs ?? 1e3 / playbackFps) / speedRatio)
    };
  });
  bridge.setDrawTimelineFrames(frames, playbackFps);
}
function updatePlaybackLoopControl() {
  const labels = {
    off: "Play once",
    loop: "Loop playback",
    bounce: "Bounce playback"
  };
  const icons = {
    off: "icon-chevron-right",
    loop: "icon-loop",
    bounce: "icon-bounce"
  };
  playbackLoopControl.dataset.loopMode = playbackLoopMode;
  setDraw2Icon(playbackLoopControl, icons[playbackLoopMode]);
  playbackLoopControl.setAttribute("aria-label", localizeDraw2Text(labels[playbackLoopMode]));
  playbackLoopControl.title = localizeDraw2Text(labels[playbackLoopMode]);
  playbackLoopControl.setAttribute("aria-pressed", String(playbackLoopMode !== "off"));
}
function cyclePlaybackLoopMode() {
  const modes = [
    "off",
    "loop",
    "bounce"
  ];
  const currentIndex = modes.indexOf(playbackLoopMode);
  playbackLoopMode = modes[(currentIndex + 1) % modes.length] ?? "loop";
  updatePlaybackLoopControl();
  if (playbackRunning) {
    stopTimelinePlayback("Playback mode changed.");
    startTimelinePlayback();
  } else {
    renderTimeline();
  }
  scheduleDraw2EditorPreferencesSave();
}
function timelineCelId(frameId, layerTrackId) {
  return state.cels.find((item) => item.frameId === frameId && item.layerTrackId === layerTrackId)?.celId ?? `${state.projectId}:cel:${layerTrackId}:${frameId}`;
}
async function activateTimelineCell(frameId, layerTrackId) {
  const celId = timelineCelId(frameId, layerTrackId);
  const target = state.cels.find((item) => item.celId === celId);
  const tilemapLayer = layerKind(layerTrackId) === "TILEMAP";
  if (tilemapLayer) ensureTilemapFor(layerTrackId, frameId);
  if ((target?.assetId !== void 0 && target.bindingMode !== "DUPLICATE_INDEPENDENT" || tilemapLayer && target?.bindingMode === "TILEMAP") && state.activeFrameId === frameId && state.activeLayerId === layerTrackId && state.activeCelId === celId && (tilemapLayer || state.activeAssetId === target?.assetId)) {
    await present();
    return true;
  }
  if (selection !== void 0 || hasUncommittedSelectionWork()) {
    clearCommittedSelection("Selection and transform preview cleared because the timeline target changed.");
  }
  timelineActivationPending = true;
  try {
    return await runTimelineCommand("timeline.activateCel", {
      celId,
      frameId,
      layerTrackId
    }, {
      recordHistory: false,
      announce: false
    });
  } finally {
    timelineActivationPending = false;
  }
}
function syncTimelinePlaybackFrame(frameId) {
  const frameIndex = state.timeline.frameOrder.indexOf(frameId);
  if (frameIndex < 0) return;
  const frame2 = state.frames.find((item) => item.frameId === frameId);
  if (frame2 === void 0) return;
  const elapsed = timelineFrameElapsedById.get(frameId) ?? 0;
  const cells = timelineWindow.querySelectorAll(".draw2-timeline-cell");
  for (const cell of cells) {
    const isActiveFrame = cell.dataset.frameId === frameId;
    cell.dataset.activeFrame = String(isActiveFrame);
    cell.setAttribute("aria-selected", String(cell.dataset.selected === "true" || isActiveFrame && cell.dataset.layerTrackId === timelineSession.activeLayerTrackId));
  }
  const rulerCells = timelineWindow.querySelectorAll(".draw2-timeline-time-ruler-cell");
  for (const rulerCell of rulerCells) {
    rulerCell.dataset.active = String(rulerCell.dataset.frameId === frameId);
  }
  const frameCellWidth = timelineCssPixelValue("--draw2-timeline-cell-width", 30);
  const labelWidth = timelineCssPixelValue("--draw2-timeline-label-width", 180);
  const playhead = timelineWindow.querySelector(".draw2-timeline-playhead");
  if (playhead !== null) {
    playhead.style.left = `${labelWidth + Math.max(0, frameIndex) * frameCellWidth}px`;
    const playheadLabel = playhead.querySelector(".draw2-timeline-playhead-label");
    if (playheadLabel !== null) {
      playheadLabel.textContent = `F${frame2.index + 1} \xB7 ${formatTimelineClock(elapsed)}`;
    }
  }
  const timelinePositionText = `F${frame2.index + 1}/${state.frames.length} \xB7 ${formatTimelineClock(elapsed)}`;
  if (timelinePositionElement !== null) {
    timelinePositionElement.value = timelinePositionText;
    timelinePositionElement.textContent = timelinePositionText;
  }
}
function stopTimelinePlayback(message = "Timeline playback stopped.") {
  playbackGeneration += 1;
  if (playbackAnimationFrame !== void 0) {
    window.cancelAnimationFrame(playbackAnimationFrame);
  }
  playbackAnimationFrame = void 0;
  playbackRunning = false;
  if (workspaceFrameElement !== null) {
    workspaceFrameElement.dataset.draw2PlaybackRunning = "false";
  }
  window.dispatchEvent(new CustomEvent("draw2:playback-state", {
    detail: {
      playing: false
    }
  }));
  dispatchDrawAudioReferencePlayback(false);
  playbackFrameId = void 0;
  playbackStartFrameId = void 0;
  canvas.dataset.playbackFrameId = "";
  if (playbackOriginSession !== void 0) {
    timelineSession = playbackOriginSession;
    playbackOriginSession = void 0;
  }
  setDraw2Icon(togglePlaybackControl, "icon-play");
  togglePlaybackControl.title = localizeDraw2Text("Play timeline");
  togglePlaybackControl.setAttribute("aria-label", localizeDraw2Text("Play timeline"));
  togglePlaybackControl.setAttribute("aria-pressed", "false");
  syncMiniPreviewPlaybackControl();
  renderTimeline();
  void present();
  if (message) setStatus(message);
}
function scheduleTimelinePlayback(generation = playbackGeneration) {
  if (!playbackRunning || generation !== playbackGeneration || playbackAnimationFrame !== void 0) return;
  playbackAnimationFrame = window.requestAnimationFrame(() => {
    playbackAnimationFrame = void 0;
    if (!playbackRunning || generation !== playbackGeneration) return;
    tickTimelinePlayback(generation);
  });
}
function tickTimelinePlayback(generation = playbackGeneration) {
  if (!playbackRunning || generation !== playbackGeneration) return;
  const elapsedMs = (performance.now() - playbackStartedAt) * playbackRate;
  const totalDuration = state.frames.reduce((total, item) => total + item.durationMs, 0);
  if (playbackLoopMode === "off" && elapsedMs >= totalDuration) {
    const lastFrameId = state.timeline.frameOrder.at(-1);
    if (lastFrameId !== void 0) {
      timelineSession = setTimelineSessionActiveFrame(state, timelineSession, lastFrameId);
    }
    stopTimelinePlayback("Timeline playback reached the last frame.");
    return;
  }
  try {
    let projectionElapsed = elapsedMs;
    if (playbackLoopMode === "bounce" && totalDuration > 0) {
      const cycleDuration = totalDuration * 2;
      const phase = elapsedMs % cycleDuration;
      projectionElapsed = phase < totalDuration ? phase : Math.max(0, totalDuration - (phase - totalDuration) - 1e-3);
    }
    const projection = resolvePlaybackProjection(state, playbackStartFrameId ?? timelineSession.activeFrameId, projectionElapsed);
    if (playbackFrameId !== projection.frameId) {
      playbackFrameId = projection.frameId;
      canvas.dataset.playbackFrameId = projection.frameId;
      timelineSession = setTimelineSessionActiveFrame(state, timelineSession, projection.frameId);
      syncTimelinePlaybackFrame(projection.frameId);
      void presentPlaybackFrame(projection.frameId, generation);
    }
    scheduleTimelinePlayback(generation);
  } catch (cause) {
    stopTimelinePlayback(cause instanceof Error ? cause.message : "Timeline playback failed.");
  }
}
function startTimelinePlayback() {
  if (state.timeline.frameOrder.length === 0) {
    setStatus("Timeline has no frames.", "error");
    return;
  }
  if (playbackAnimationFrame !== void 0) {
    window.cancelAnimationFrame(playbackAnimationFrame);
  }
  playbackAnimationFrame = void 0;
  playbackGeneration += 1;
  const generation = playbackGeneration;
  const fps = playbackFpsValue();
  playbackOriginSession = {
    ...timelineSession
  };
  playbackStartedAt = performance.now();
  playbackRate = fps / 24;
  playbackRunning = true;
  if (workspaceFrameElement !== null) {
    workspaceFrameElement.dataset.draw2PlaybackRunning = "true";
  }
  window.dispatchEvent(new CustomEvent("draw2:playback-state", {
    detail: {
      playing: true
    }
  }));
  dispatchDrawAudioReferencePlayback(true);
  playbackFrameId = timelineSession.activeFrameId;
  playbackStartFrameId = timelineSession.activeFrameId;
  canvas.dataset.playbackFrameId = playbackFrameId;
  setDraw2Icon(togglePlaybackControl, "icon-pause");
  togglePlaybackControl.title = localizeDraw2Text("Pause timeline playback");
  togglePlaybackControl.setAttribute("aria-label", localizeDraw2Text("Pause timeline playback"));
  togglePlaybackControl.setAttribute("aria-pressed", "true");
  syncMiniPreviewPlaybackControl();
  renderTimeline();
  void presentPlaybackFrame(playbackFrameId, generation);
  scheduleTimelinePlayback(generation);
  setStatus(`Timeline playback ${fps} FPS; local preview only.`);
}
function dispatchDrawAudioReferencePlayback(playing) {
  const activeFrameIndex = state.frames.find((frame2) => frame2.frameId === timelineSession.activeFrameId)?.index ?? 0;
  const activeElapsedMs = state.timeline.frameOrder.slice(0, activeFrameIndex).reduce((elapsedMs, frameId) => {
    const frame2 = state.frames.find((item) => item.frameId === frameId);
    return elapsedMs + Math.max(1, frame2?.durationMs ?? 0);
  }, 0);
  window.dispatchEvent(new CustomEvent("draw2:audio-reference-playback", {
    detail: {
      playing,
      projectId: state.projectId,
      frameIndex: activeFrameIndex,
      elapsedMs: activeElapsedMs,
      references: drawAudioReferences.list().map((reference) => ({
        ...reference
      }))
    }
  }));
}
window.addEventListener("draw2:linked-preview-state", (event) => {
  const detail = event.detail;
  if (detail?.source !== "AUDIO") return;
  if (workspaceFrameElement?.dataset.creatorMode !== "AUDIO") return;
  const playing = detail.playing === true && detail.monitor !== false;
  audioLinkedPreviewPlaying = playing;
  if (playing) {
    if (playbackRunning) stopTimelinePlayback("Audio monitor follows Audio.");
    syncMiniPreviewPlaybackControl();
  } else {
    syncMiniPreviewPlaybackControl();
  }
});
window.addEventListener("draw2:audio-monitor-state", (event) => {
  const detail = event.detail;
  if (workspaceFrameElement?.dataset.creatorMode !== "AUDIO") return;
  const visible = detail?.visible === true;
  if (visible) {
    miniPreviewEnabled = false;
    miniPreviewLayout = {
      ...miniPreviewLayout,
      collapsed: true
    };
    syncMiniPreviewLayout();
    drawAudioDrawPreviewProjection();
  } else {
    audioLinkedPreviewPlaying = false;
    miniPreviewEnabled = false;
    syncMiniPreviewLayout();
    syncMiniPreviewPlaybackControl();
  }
});
window.addEventListener("draw2:audio-frame-sync", (event) => {
  const detail = event.detail;
  if (workspaceFrameElement?.dataset.creatorMode !== "AUDIO") return;
  if (audioDrawPreviewCanvasElement === null && !miniPreviewIsVisible()) return;
  const elapsedMs = Number(detail?.elapsedMs);
  const firstFrameId = state.timeline.frameOrder[0] ?? timelineSession.activeFrameId;
  if (!Number.isFinite(elapsedMs) || firstFrameId === void 0) return;
  const drawProjectionElapsedMs = Math.max(0, elapsedMs) * (playbackFpsValue() / 24);
  const projection = resolvePlaybackProjection(state, firstFrameId, drawProjectionElapsedMs);
  if (playbackFrameId === projection.frameId && detail?.playing !== true) {
    return;
  }
  playbackFrameId = projection.frameId;
  canvas.dataset.playbackFrameId = projection.frameId;
  timelineSession = setTimelineSessionActiveFrame(state, timelineSession, projection.frameId);
  syncTimelinePlaybackFrame(projection.frameId);
  void presentAudioLinkedPlaybackFrame(projection.frameId);
});
function renderLayerPanel() {
  if (layerListElement === null) return;
  layerListElement.replaceChildren();
  for (const layerTrackId of state.timeline.layerTrackOrder) {
    const layer2 = state.layers.find((candidate) => candidate.layerTrackId === layerTrackId);
    if (layer2 === void 0) continue;
    const row = document.createElement("div");
    row.className = `draw2-layer-row${timelineSession.activeLayerTrackId === layer2.layerTrackId ? " is-active" : ""}`;
    row.dataset.layerKind = layer2.kind === "TILEMAP" ? "tilemap" : "raster";
    row.setAttribute("role", "listitem");
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.className = "draw2-layer-visibility";
    visibility.append(createDraw2Icon(layer2.visible ? "icon-eye" : "icon-eye-off"));
    visibility.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("visibility")}`);
    visibility.setAttribute("aria-pressed", String(layer2.visible));
    visibility.addEventListener("click", () => {
      void runTimelineCommand("timeline.setLayerVisibility", {
        layerTrackId: layer2.layerTrackId,
        visible: !layer2.visible
      });
    });
    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = "draw2-layer-lock";
    lock.append(createDraw2Icon(layer2.locked ? "icon-lock" : "icon-unlock"));
    lock.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("lock")}`);
    lock.setAttribute("aria-pressed", String(layer2.locked));
    lock.addEventListener("click", () => {
      void runTimelineCommand("timeline.setLayerLock", {
        layerTrackId: layer2.layerTrackId,
        locked: !layer2.locked
      });
    });
    const select = document.createElement("button");
    select.type = "button";
    select.className = "draw2-layer-select";
    const themeLabel = document.createElement("span");
    themeLabel.className = "draw2-layer-theme-label";
    themeLabel.setAttribute("aria-hidden", "true");
    themeLabel.dataset.layerVisible = String(layer2.visible);
    const layerName = document.createElement("span");
    layerName.className = "draw2-layer-name";
    layerName.textContent = layer2.kind === "TILEMAP" ? `\u25A6 ${layer2.name}` : layer2.name;
    select.append(themeLabel, layerName);
    select.setAttribute("aria-label", `${layer2.name} layer${timelineSession.activeLayerTrackId === layer2.layerTrackId ? ", selected" : ""}`);
    select.addEventListener("click", () => {
      timelineSession = {
        ...timelineSession,
        activeLayerTrackId: layer2.layerTrackId
      };
      renderTimeline();
      void activateTimelineCell(timelineSession.activeFrameId, layer2.layerTrackId);
      setStatus(layer2.kind === "TILEMAP" ? `${layer2.name} selected \xB7 Tileset\u304B\u3089\u30BF\u30A4\u30EB\u3092\u9078\u3093\u3067Canvas\u3078\u914D\u7F6E\u3067\u304D\u307E\u3059\u3002` : `${layer2.name} selected.`);
    });
    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.className = "draw2-layer-opacity";
    opacity.min = "0";
    opacity.max = "1";
    opacity.step = "0.01";
    opacity.value = String(layer2.opacity);
    opacity.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("opacity")}`);
    opacity.addEventListener("change", () => {
      void runTimelineCommand("timeline.setLayerOpacity", {
        layerTrackId: layer2.layerTrackId,
        opacity: Number(opacity.value)
      });
    });
    const blend = document.createElement("select");
    blend.className = "draw2-layer-blend";
    blend.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("blend mode")}`);
    for (const mode of [
      "NORMAL",
      "MULTIPLY"
    ]) {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = mode === "NORMAL" ? "N" : "M";
      option.title = mode === "NORMAL" ? "Normal" : "Multiply";
      option.setAttribute("aria-label", mode === "NORMAL" ? "Normal" : "Multiply");
      option.selected = layer2.blendMode === mode;
      blend.append(option);
    }
    blend.addEventListener("change", () => {
      void runTimelineCommand("timeline.setLayerBlendMode", {
        layerTrackId: layer2.layerTrackId,
        blendMode: blend.value
      });
    });
    const nameGroup = document.createElement("div");
    nameGroup.className = "draw2-layer-name-group";
    nameGroup.append(visibility, select);
    row.append(nameGroup, lock, blend, opacity);
    layerListElement.append(row);
  }
}
function timelineCellKey(frameId, layerTrackId) {
  return `${frameId}::${layerTrackId}`;
}
function setTimelineTab(tab) {
  activeTimelineTab = tab;
  for (const button of timelineTabs) {
    const isActive = button.dataset.draw2TimelineTab === tab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of timelineTabPanels) {
    const isActive = panel.dataset.draw2TimelineTabPanel === tab;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  }
  timelineCard.dataset.activeTab = tab;
  timelineStatus.textContent = tab === "timeline" ? timelineStatus.textContent : `${tab[0]?.toUpperCase() ?? ""}${tab.slice(1)} view`;
  saveTimelinePropertiesPreference();
}
function positionOnionOptionsPopover() {
  if (!onionOptions.open || onionOptionsPopover === null) {
    onionOptionsPopover?.classList.remove("is-timeline-popover-positioned");
    onionOptionsPopover?.style.removeProperty("left");
    onionOptionsPopover?.style.removeProperty("top");
    return;
  }
  const gap = 6;
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  onionOptionsPopover.classList.add("is-timeline-popover-positioned");
  onionOptionsPopover.style.setProperty("left", "0px");
  onionOptionsPopover.style.setProperty("top", "0px");
  const anchor = toggleOnionControl.getBoundingClientRect();
  const popoverRect = onionOptionsPopover.getBoundingClientRect();
  const width = Math.min(popoverRect.width, viewportWidth - gap * 2);
  const height = Math.min(popoverRect.height, viewportHeight - gap * 2);
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  let left = anchor.left;
  let top = anchor.bottom + gap;
  if (left + width > viewportWidth - gap) left = anchor.right - width;
  if (top + height > viewportHeight - gap) top = anchor.top - height - gap;
  onionOptionsPopover.style.setProperty("left", `${Math.round(clamp(left, gap, viewportWidth - width - gap))}px`);
  onionOptionsPopover.style.setProperty("top", `${Math.round(clamp(top, gap, viewportHeight - height - gap))}px`);
}
function selectTimelineCell(frameId, layerTrackId, event) {
  const frameIndex = state.timeline.frameOrder.indexOf(frameId);
  const layerIndex = state.timeline.layerTrackOrder.indexOf(layerTrackId);
  if (frameIndex < 0 || layerIndex < 0) return;
  const key = timelineCellKey(frameId, layerTrackId);
  const toggle = event.metaKey || event.ctrlKey;
  if (event.shiftKey && timelineSelectionAnchor !== void 0) {
    const minFrame = Math.min(timelineSelectionAnchor.frameIndex, frameIndex);
    const maxFrame = Math.max(timelineSelectionAnchor.frameIndex, frameIndex);
    const minLayer = Math.min(timelineSelectionAnchor.layerIndex, layerIndex);
    const maxLayer = Math.max(timelineSelectionAnchor.layerIndex, layerIndex);
    if (!toggle) timelineSelectedCells.clear();
    for (let frame2 = minFrame; frame2 <= maxFrame; frame2 += 1) {
      for (let layer2 = minLayer; layer2 <= maxLayer; layer2 += 1) {
        const frameKey = state.timeline.frameOrder[frame2];
        const layerKey = state.timeline.layerTrackOrder[layer2];
        if (frameKey !== void 0 && layerKey !== void 0) {
          timelineSelectedCells.add(timelineCellKey(frameKey, layerKey));
        }
      }
    }
  } else if (toggle) {
    if (timelineSelectedCells.has(key)) timelineSelectedCells.delete(key);
    else timelineSelectedCells.add(key);
    timelineSelectionAnchor = {
      frameIndex,
      layerIndex
    };
  } else {
    timelineSelectedCells.clear();
    timelineSelectedCells.add(key);
    timelineSelectionAnchor = {
      frameIndex,
      layerIndex
    };
  }
  timelineSession = {
    ...setTimelineSessionActiveFrame(state, timelineSession, frameId),
    activeLayerTrackId: layerTrackId
  };
  renderTimeline();
  void activateTimelineCell(frameId, layerTrackId);
}
function selectTimelineFrame(frameId, event) {
  const frameIndex = state.timeline.frameOrder.indexOf(frameId);
  if (frameIndex < 0) return;
  const frameIds = event.shiftKey && timelineSelectionAnchor !== void 0 ? state.timeline.frameOrder.slice(Math.min(frameIndex, timelineSelectionAnchor.frameIndex), Math.max(frameIndex, timelineSelectionAnchor.frameIndex) + 1) : [
    frameId
  ];
  if (!(event.metaKey || event.ctrlKey)) timelineSelectedCells.clear();
  for (const selectedFrameId of frameIds) {
    for (const layerTrackId of state.timeline.layerTrackOrder) {
      timelineSelectedCells.add(timelineCellKey(selectedFrameId, layerTrackId));
    }
  }
  timelineSelectionAnchor = {
    frameIndex,
    layerIndex: Math.max(0, state.timeline.layerTrackOrder.indexOf(timelineSession.activeLayerTrackId))
  };
  const activeLayerTrackId = timelineSession.activeLayerTrackId || state.timeline.layerTrackOrder[0];
  if (activeLayerTrackId !== void 0) {
    timelineSession = {
      ...setTimelineSessionActiveFrame(state, timelineSession, frameId),
      activeLayerTrackId
    };
    renderTimeline();
    void activateTimelineCell(frameId, activeLayerTrackId);
  }
}
function selectTimelineLayer(layerTrackId, event) {
  const layerIndex = state.timeline.layerTrackOrder.indexOf(layerTrackId);
  if (layerIndex < 0) return;
  if (!(event.metaKey || event.ctrlKey)) timelineSelectedCells.clear();
  for (const frameId of state.timeline.frameOrder) {
    timelineSelectedCells.add(timelineCellKey(frameId, layerTrackId));
  }
  timelineSelectionAnchor = {
    frameIndex: Math.max(0, state.timeline.frameOrder.indexOf(timelineSession.activeFrameId)),
    layerIndex
  };
  timelineSession = {
    ...timelineSession,
    activeLayerTrackId: layerTrackId
  };
  renderTimeline();
  void activateTimelineCell(timelineSession.activeFrameId, layerTrackId);
}
function closeTimelineContextMenu() {
  timelineContext.hidden = true;
  timelineContextTarget = void 0;
}
function openTimelineContextMenu(event, frameId, layerTrackId) {
  event.preventDefault();
  const target = state.cels.find((cel2) => cel2.frameId === frameId && cel2.layerTrackId === layerTrackId);
  timelineContextTarget = {
    frameId,
    layerTrackId,
    celId: target?.celId ?? timelineCelId(frameId, layerTrackId)
  };
  timelineContext.hidden = false;
  const menuWidth = 172;
  const menuHeight = 178;
  timelineContext.style.left = `${Math.max(8, Math.min(window.innerWidth - menuWidth - 8, event.clientX))}px`;
  timelineContext.style.top = `${Math.max(8, Math.min(window.innerHeight - menuHeight - 8, event.clientY))}px`;
}
async function runTimelineContextAction(action) {
  const target = timelineContextTarget;
  closeTimelineContextMenu();
  if (target === void 0) return;
  if (action === "clear") {
    const cel2 = state.cels.find((item) => item.celId === target.celId);
    if (cel2?.assetId !== void 0) {
      await runTimelineCommand("timeline.clearCel", {
        celId: cel2.celId
      });
    } else {
      setStatus("Cel is already empty.");
    }
    return;
  }
  if (action === "duplicate-frame") {
    await runTimelineCommand("timeline.duplicateFrame", {
      sourceFrameId: target.frameId,
      frameId: `${state.projectId}:frame:context:${structureClientSequence + 1}`
    });
    return;
  }
  if (action === "link" || action === "unlink") {
    await activateTimelineCell(target.frameId, target.layerTrackId);
    if (action === "link") toggleActiveLinkedCel();
    else {
      linkedCelBindings = linkedCelBindings.filter((binding) => binding.celId !== state.activeCelId);
      renderCreatorTimelineMetadata();
      setStatus("Active Cel link removed from local metadata.");
    }
    return;
  }
  setStatus("Timeline properties are available from the Inspector.");
}
function saveTimelinePropertiesPreference() {
  try {
    window.localStorage.setItem(TIMELINE_PROPERTIES_STORAGE_KEY, JSON.stringify({
      width: timelinePropertiesWidth,
      collapsed: timelinePropertiesCollapsed,
      activeTab: activeTimelineTab
    }));
  } catch {
  }
}
function applyTimelinePropertiesLayout() {
  timelineCard.style.setProperty("--draw2-timeline-properties-width", `${Math.round(timelinePropertiesWidth)}px`);
  timelineCard.dataset.propertiesCollapsed = String(timelinePropertiesCollapsed);
  timelineProperties.classList.toggle("is-collapsed", timelinePropertiesCollapsed);
  timelinePropertiesCollapse.setAttribute("aria-expanded", String(!timelinePropertiesCollapsed));
  setDraw2Icon(timelinePropertiesCollapse, timelinePropertiesCollapsed ? "icon-chevron-right" : "icon-chevron-left");
  timelinePropertiesCollapse.title = timelinePropertiesCollapsed ? "Expand layer properties" : "Collapse layer properties";
  timelinePropertiesCollapse.setAttribute("aria-label", timelinePropertiesCollapsed ? "Expand layer properties" : "Collapse layer properties");
}
function renderTimelineLayerProperties() {
  timelinePropertiesBody.replaceChildren();
  applyTimelinePropertiesLayout();
  const layer2 = state.layers.find((item) => item.layerTrackId === timelineSession.activeLayerTrackId);
  if (layer2 === void 0) {
    const empty = document.createElement("span");
    empty.className = "draw2-timeline-properties-empty";
    empty.textContent = localizeDraw2Text("Select a layer");
    timelinePropertiesBody.append(empty);
    return;
  }
  const nameLabel = document.createElement("label");
  nameLabel.className = "draw2-timeline-property-field";
  const nameText = document.createElement("span");
  nameText.textContent = localizeDraw2Text("Layer name");
  const nameInput = document.createElement("input");
  nameInput.className = "draw2-timeline-property-input";
  nameInput.type = "text";
  nameInput.maxLength = 80;
  nameInput.value = layer2.name;
  nameInput.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("Layer name")}`);
  nameInput.addEventListener("change", () => {
    const nextName = nameInput.value.trim();
    if (nextName.length === 0 || nextName === layer2.name) {
      nameInput.value = layer2.name;
      return;
    }
    void runTimelineCommand("timeline.renameLayerTrack", {
      layerTrackId: layer2.layerTrackId,
      name: nextName
    });
  });
  nameLabel.append(nameText, nameInput);
  timelinePropertiesBody.append(nameLabel);
  const blendLabel = document.createElement("label");
  blendLabel.className = "draw2-timeline-property-field";
  const blendText = document.createElement("span");
  blendText.textContent = localizeDraw2Text("Mode");
  const blend = document.createElement("select");
  blend.className = "draw2-timeline-property-select";
  blend.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("blend mode")}`);
  for (const mode of [
    "NORMAL",
    "MULTIPLY"
  ]) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = localizeDraw2Text(mode === "NORMAL" ? "Normal" : "Multiply");
    option.selected = layer2.blendMode === mode;
    blend.append(option);
  }
  blend.addEventListener("change", () => {
    void runTimelineCommand("timeline.setLayerBlendMode", {
      layerTrackId: layer2.layerTrackId,
      blendMode: blend.value
    });
  });
  blendLabel.append(blendText, blend);
  timelinePropertiesBody.append(blendLabel);
  const opacityLabel = document.createElement("label");
  opacityLabel.className = "draw2-timeline-property-field draw2-timeline-property-opacity";
  const opacityHeader = document.createElement("span");
  opacityHeader.className = "draw2-timeline-property-field-heading";
  const opacityText = document.createElement("span");
  opacityText.textContent = localizeDraw2Text("Opacity");
  const opacityValue = document.createElement("output");
  opacityValue.textContent = `${Math.round(layer2.opacity * 100)}%`;
  opacityHeader.append(opacityText, opacityValue);
  const opacity = document.createElement("input");
  opacity.type = "range";
  opacity.min = "0";
  opacity.max = "1";
  opacity.step = "0.01";
  opacity.value = String(layer2.opacity);
  opacity.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("opacity")}`);
  opacity.addEventListener("input", () => {
    opacityValue.textContent = `${Math.round(Number(opacity.value) * 100)}%`;
  });
  opacity.addEventListener("change", () => {
    void runTimelineCommand("timeline.setLayerOpacity", {
      layerTrackId: layer2.layerTrackId,
      opacity: Number(opacity.value)
    });
  });
  opacityLabel.append(opacityHeader, opacity);
  timelinePropertiesBody.append(opacityLabel);
  const visibility = document.createElement("label");
  visibility.className = "draw2-timeline-property-toggle";
  const visibilityInput = document.createElement("input");
  visibilityInput.type = "checkbox";
  visibilityInput.checked = layer2.visible;
  visibilityInput.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("visibility")}`);
  visibilityInput.addEventListener("change", () => {
    void runTimelineCommand("timeline.setLayerVisibility", {
      layerTrackId: layer2.layerTrackId,
      visible: visibilityInput.checked
    });
  });
  const visibilityText = document.createElement("span");
  visibilityText.textContent = localizeDraw2Text("Visible");
  visibility.append(visibilityInput, visibilityText);
  timelinePropertiesBody.append(visibility);
  const lock = document.createElement("label");
  lock.className = "draw2-timeline-property-toggle";
  const lockInput = document.createElement("input");
  lockInput.type = "checkbox";
  lockInput.checked = layer2.locked;
  lockInput.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("lock")}`);
  lockInput.addEventListener("change", () => {
    void runTimelineCommand("timeline.setLayerLock", {
      layerTrackId: layer2.layerTrackId,
      locked: lockInput.checked
    });
  });
  const lockText = document.createElement("span");
  lockText.textContent = localizeDraw2Text("Lock");
  lock.append(lockInput, lockText);
  timelinePropertiesBody.append(lock);
}
function renderTimeline() {
  normalizeTimelineSession();
  syncDrawTimelineToAudioWorkspace();
  if (!timelineViewportInitialized) {
    timelineViewport.scrollLeft = 0;
    timelineViewport.scrollTop = 0;
    timelineSession = {
      ...timelineSession,
      scrollLeft: 0,
      scrollTop: 0
    };
    timelineViewportInitialized = true;
  }
  lastRenderedTimelineScrollTop = timelineViewport.scrollTop;
  lastRenderedTimelineScrollLeft = timelineViewport.scrollLeft;
  for (const key of [
    ...timelineSelectedCells
  ]) {
    const [frameId, layerTrackId] = key.split("::");
    if (!state.timeline.frameOrder.includes(frameId ?? "") || !state.timeline.layerTrackOrder.includes(layerTrackId ?? "")) {
      timelineSelectedCells.delete(key);
    }
  }
  const labelWidth = timelineCssPixelValue("--draw2-timeline-label-width", 180);
  const frameCellWidth = timelineCssPixelValue("--draw2-timeline-cell-width", 30);
  const layerRowHeight = timelineCssPixelValue("--draw2-timeline-row-height", 30);
  const frameElapsedById = /* @__PURE__ */ new Map();
  let totalDurationMs = 0;
  for (const frame2 of [
    ...state.frames
  ].sort((left, right) => left.index - right.index)) {
    frameElapsedById.set(frame2.frameId, totalDurationMs);
    totalDurationMs += frame2.durationMs;
  }
  timelineFrameElapsedById = frameElapsedById;
  const rulerHeight = 20;
  const headerHeight = layerRowHeight + rulerHeight;
  const virtualWindow = calculateTimelineWindow(state, {
    scrollTop: Math.max(0, timelineViewport.scrollTop - headerHeight),
    scrollLeft: Math.max(0, timelineViewport.scrollLeft - labelWidth),
    viewportWidth: Math.max(1, timelineViewport.clientWidth + labelWidth),
    viewportHeight: Math.max(1, timelineViewport.clientHeight + headerHeight),
    frameCellWidth,
    layerRowHeight,
    overscan: 2
  });
  const timelineContentWidth = Math.max(labelWidth + virtualWindow.totalWidth, timelineViewport.clientWidth);
  const timelineContentHeight = Math.max(76, headerHeight + virtualWindow.totalHeight + layerRowHeight * 2);
  timelineSpacer.style.width = `${timelineContentWidth}px`;
  timelineSpacer.style.height = `${timelineContentHeight}px`;
  timelineWindow.replaceChildren();
  timelineSecondaryControls.replaceChildren();
  const headerRow = document.createElement("div");
  headerRow.className = "draw2-timeline-header-row";
  headerRow.style.top = `${rulerHeight}px`;
  headerRow.style.height = `${layerRowHeight}px`;
  headerRow.setAttribute("role", "row");
  headerRow.setAttribute("aria-label", localizeDraw2Text("Frame numbers"));
  const corner = document.createElement("div");
  corner.className = "draw2-timeline-corner";
  corner.setAttribute("role", "columnheader");
  corner.setAttribute("aria-label", localizeDraw2Text("Timeline controls"));
  corner.dataset.intersectionAction = "timeline-controls";
  const cornerControls = document.createElement("div");
  cornerControls.className = "draw2-timeline-corner-controls";
  addLayerControl.hidden = true;
  const playbackControlLabel = playbackRunning ? "Pause timeline playback" : "Play timeline";
  const timelineCornerControls = [
    [
      togglePlaybackControl,
      playbackControlLabel,
      playbackControlLabel
    ],
    [
      duplicateFrameControl,
      "Duplicate frame",
      "Duplicate frame"
    ],
    [
      playbackLoopControl,
      "Loop playback",
      "Loop playback"
    ]
  ];
  for (const control of [
    addFrameControl,
    removeFrameControl,
    reorderLayerControl,
    toggleLayerControl,
    linkedCelToggleControl
  ]) {
    control.hidden = true;
  }
  for (const [control, label, title] of timelineCornerControls) {
    control.hidden = false;
    control.classList.add("draw2-timeline-corner-button");
    control.setAttribute("aria-label", localizeDraw2Text(label));
    control.title = localizeDraw2Text(title);
  }
  const moreControls = document.querySelector(".draw2-timeline-more-controls");
  if (moreControls !== null) moreControls.hidden = true;
  const moreActions = document.querySelector(".draw2-timeline-more-actions");
  if (moreActions !== null) moreActions.hidden = true;
  cornerControls.append(...timelineCornerControls.map(([control]) => control));
  corner.append(cornerControls);
  if (playbackRateGroup !== null) {
    timelineSecondaryControls.append(playbackRateGroup);
  }
  toggleOnionControl.hidden = false;
  onionOptions.hidden = false;
  timelineSecondaryControls.append(toggleOnionControl, onionOptions);
  headerRow.append(corner);
  virtualWindow.frameIds.forEach((frameId, frameOffset) => {
    const frame2 = state.frames.find((item) => item.frameId === frameId);
    if (frame2 === void 0) return;
    const frameNumber = frame2.index + 1;
    const headerCell = document.createElement("button");
    headerCell.type = "button";
    headerCell.className = "draw2-timeline-frame-header";
    headerCell.style.left = `${labelWidth + (virtualWindow.firstFrameIndex + frameOffset) * frameCellWidth}px`;
    headerCell.textContent = String(frameNumber);
    headerCell.setAttribute("role", "columnheader");
    headerCell.setAttribute("aria-label", `${localizeDraw2Text("Frame")} ${frameNumber}`);
    headerCell.setAttribute("aria-selected", String(timelineSession.activeFrameId === frameId));
    headerCell.dataset.selected = String(state.timeline.layerTrackOrder.every((layerTrackId) => timelineSelectedCells.has(timelineCellKey(frameId, layerTrackId))));
    const frameAnnotations = [];
    const frameTags = animationTags.list().filter((tag) => frame2.index >= tag.fromFrameIndex && frame2.index <= tag.toFrameIndex);
    if (frameTags.length > 0) {
      headerCell.dataset.tagCount = String(frameTags.length);
      frameAnnotations.push(...frameTags.map((tag) => tag.name));
    }
    const frameMarkers = timelineMarkers.list(frame2.index);
    if (frameMarkers.length > 0) {
      headerCell.dataset.markerKind = frameMarkers[0]?.kind ?? "NOTE";
      headerCell.dataset.markerCount = String(frameMarkers.length);
      frameAnnotations.push(...frameMarkers.map((marker) => `${marker.kind}: ${marker.label}`));
      headerCell.setAttribute("aria-label", `Frame ${frameNumber}, ${frameMarkers.length} marker${frameMarkers.length === 1 ? "" : "s"}`);
    }
    headerCell.dataset.frameId = frameId;
    headerCell.dataset.durationMs = String(frame2.durationMs);
    headerCell.dataset.timeStart = formatTimelineClock(frameElapsedById.get(frameId) ?? 0);
    headerCell.title = [
      `${localizeDraw2Text("Frame")} ${frameNumber}`,
      formatTimelineClock(frameElapsedById.get(frameId) ?? 0),
      `${frame2.durationMs} ms`,
      ...frameAnnotations
    ].join(" \xB7 ");
    headerCell.addEventListener("click", (event) => selectTimelineFrame(frameId, event));
    headerRow.append(headerCell);
  });
  if (virtualWindow.lastFrameIndex === state.timeline.frameOrder.length - 1) {
    const addFrameCell = document.createElement("button");
    addFrameCell.type = "button";
    addFrameCell.className = "draw2-timeline-frame-header draw2-timeline-command-cell";
    addFrameCell.style.left = `${labelWidth + state.timeline.frameOrder.length * frameCellWidth}px`;
    addFrameCell.classList.add("draw2-button-icon");
    addFrameCell.append(createDraw2Icon("icon-add"));
    addFrameCell.setAttribute("aria-label", localizeDraw2Text("Add frame"));
    addFrameCell.title = localizeDraw2Text("Add frame");
    addFrameCell.addEventListener("click", () => {
      void runTimelineCommand("timeline.addFrame", {
        frameId: `${state.projectId}:frame:ui:${structureClientSequence + 1}`,
        durationMs: 100
      });
    });
    headerRow.append(addFrameCell);
  }
  const activeFrameIndex = state.timeline.frameOrder.indexOf(timelineSession.activeFrameId);
  const activeFrameElapsed = frameElapsedById.get(timelineSession.activeFrameId) ?? 0;
  const timeRuler = document.createElement("div");
  timeRuler.className = "draw2-timeline-time-ruler";
  timeRuler.style.height = `${rulerHeight}px`;
  timeRuler.style.minWidth = `${timelineContentWidth}px`;
  timeRuler.setAttribute("role", "row");
  timeRuler.setAttribute("aria-label", "Timeline time ruler");
  const timeRulerCorner = document.createElement("div");
  timeRulerCorner.className = "draw2-timeline-time-ruler-corner";
  timeRulerCorner.textContent = "TIME";
  timeRulerCorner.setAttribute("aria-hidden", "true");
  timeRuler.append(timeRulerCorner);
  virtualWindow.frameIds.forEach((frameId, frameOffset) => {
    const frame2 = state.frames.find((item) => item.frameId === frameId);
    if (frame2 === void 0) return;
    const rulerCell = document.createElement("div");
    rulerCell.className = "draw2-timeline-time-ruler-cell";
    rulerCell.style.left = `${labelWidth + (virtualWindow.firstFrameIndex + frameOffset) * frameCellWidth}px`;
    rulerCell.style.width = `${frameCellWidth}px`;
    rulerCell.dataset.frameId = frameId;
    rulerCell.dataset.active = String(timelineSession.activeFrameId === frameId);
    if (frame2.index === 0 || frame2.index % 5 === 0) {
      const label = document.createElement("span");
      label.textContent = formatTimelineClock(frameElapsedById.get(frameId) ?? 0);
      rulerCell.append(label);
    }
    timeRuler.append(rulerCell);
  });
  const playhead = document.createElement("div");
  playhead.className = "draw2-timeline-playhead";
  playhead.style.left = `${labelWidth + Math.max(0, activeFrameIndex) * frameCellWidth}px`;
  playhead.style.height = `${headerHeight + virtualWindow.totalHeight + layerRowHeight}px`;
  playhead.setAttribute("aria-hidden", "true");
  const playheadLabel = document.createElement("span");
  playheadLabel.className = "draw2-timeline-playhead-label";
  playheadLabel.textContent = `F${Math.max(0, activeFrameIndex) + 1} \xB7 ${formatTimelineClock(activeFrameElapsed)}`;
  playhead.append(playheadLabel);
  timelineWindow.append(timeRuler, playhead);
  timelineWindow.append(headerRow);
  virtualWindow.layerTrackIds.forEach((layerTrackId, layerOffset) => {
    const layer2 = state.layers.find((item) => item.layerTrackId === layerTrackId);
    if (layer2 === void 0) return;
    const row = document.createElement("div");
    row.className = "draw2-timeline-row";
    row.style.top = `${headerHeight + (virtualWindow.firstLayerIndex + layerOffset) * layerRowHeight}px`;
    row.dataset.layerVisible = String(layer2.visible);
    row.setAttribute("role", "row");
    row.setAttribute("aria-label", layer2.name);
    const label = document.createElement("div");
    label.className = "draw2-timeline-row-label";
    label.tabIndex = 0;
    label.setAttribute("role", "rowheader");
    label.dataset.layerVisible = String(layer2.visible);
    label.dataset.selected = String(state.timeline.frameOrder.every((frameId) => timelineSelectedCells.has(timelineCellKey(frameId, layerTrackId))));
    label.dataset.locked = String(layer2.locked);
    label.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("Layer Track")}${timelineSession.activeLayerTrackId === layerTrackId ? `, ${localizeDraw2Text("selected")}` : ""}`);
    label.setAttribute("aria-pressed", String(timelineSession.activeLayerTrackId === layerTrackId));
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.className = "draw2-timeline-row-visibility";
    visibility.append(createDraw2Icon(layer2.visible ? "icon-eye" : "icon-eye-off"));
    visibility.setAttribute("aria-label", `${layer2.name} ${localizeDraw2Text("visibility")}`);
    visibility.setAttribute("aria-pressed", String(layer2.visible));
    visibility.title = localizeDraw2Text(layer2.visible ? "Hide layer" : "Show layer");
    visibility.addEventListener("click", (event) => {
      event.stopPropagation();
      void runTimelineCommand("timeline.setLayerVisibility", {
        layerTrackId: layer2.layerTrackId,
        visible: !layer2.visible
      });
    });
    const layerDot = document.createElement("span");
    layerDot.className = "draw2-timeline-row-layer-dot";
    layerDot.dataset.layerVisible = String(layer2.visible);
    layerDot.setAttribute("aria-hidden", "true");
    const layerName = document.createElement("span");
    layerName.className = "draw2-timeline-row-label-name";
    layerName.textContent = layer2.name;
    layerName.title = layer2.name;
    label.append(visibility, layerDot, layerName);
    label.addEventListener("click", (event) => selectTimelineLayer(layerTrackId, event));
    label.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      selectTimelineLayer(layerTrackId, new MouseEvent("click"));
    });
    row.append(label);
    virtualWindow.frameIds.forEach((frameId, frameOffset) => {
      const frame2 = state.frames.find((item) => item.frameId === frameId);
      if (frame2 === void 0) return;
      const cellBinding = state.cels.find((item) => item.frameId === frameId && item.layerTrackId === layerTrackId);
      const cellAsset = cellBinding?.assetId === void 0 ? void 0 : state.assets[cellBinding.assetId];
      const hasDrawing = cellAsset?.raster.hasNonTransparentPixel() ?? false;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "draw2-timeline-cell";
      cell.style.left = `${labelWidth + (virtualWindow.firstFrameIndex + frameOffset) * frameCellWidth}px`;
      cell.setAttribute("aria-label", `${layer2.name}, ${localizeDraw2Text("Frame")} ${frame2.index + 1}${cellBinding === void 0 || cellBinding.assetId === void 0 ? `, ${localizeDraw2Text("Empty Cel")}` : `, ${localizeDraw2Text("Raster Cel")}`}`);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-selected", String(timelineSelectedCells.has(timelineCellKey(frameId, layerTrackId)) || timelineSession.activeFrameId === frameId && timelineSession.activeLayerTrackId === layerTrackId));
      cell.dataset.selected = String(timelineSelectedCells.has(timelineCellKey(frameId, layerTrackId)));
      cell.dataset.activeFrame = String(timelineSession.activeFrameId === frameId);
      cell.dataset.locked = String(layer2.locked);
      cell.dataset.linked = String(cellBinding !== void 0 && linkedCelBindings.some((binding) => binding.celId === cellBinding.celId));
      cell.dataset.frameId = frameId;
      cell.dataset.durationMs = String(frame2.durationMs);
      cell.dataset.empty = String(cellBinding === void 0 || cellBinding.assetId === void 0);
      cell.dataset.hasDrawing = String(hasDrawing);
      cell.dataset.layerVisible = String(layer2.visible);
      cell.dataset.layerTrackId = layerTrackId;
      if (cell.dataset.linked === "true") {
        cell.append(createDraw2Icon("icon-link", "draw2-timeline-linked-icon"));
      }
      cell.addEventListener("click", (event) => selectTimelineCell(frameId, layerTrackId, event));
      cell.addEventListener("contextmenu", (event) => openTimelineContextMenu(event, frameId, layerTrackId));
      row.append(cell);
    });
    timelineWindow.append(row);
  });
  if (virtualWindow.lastLayerIndex === state.timeline.layerTrackOrder.length - 1) {
    const audioRow = document.createElement("div");
    audioRow.className = "draw2-timeline-row draw2-timeline-audio-row";
    audioRow.style.top = `${headerHeight + state.timeline.layerTrackOrder.length * layerRowHeight}px`;
    audioRow.setAttribute("role", "row");
    audioRow.setAttribute("aria-label", "Audio track");
    const audioLabel = document.createElement("div");
    audioLabel.className = "draw2-timeline-row-label draw2-timeline-audio-label";
    audioLabel.setAttribute("role", "rowheader");
    const audioTitle = document.createElement("span");
    audioTitle.className = "draw2-timeline-audio-title";
    audioTitle.append(createDraw2Icon("icon-note"), document.createTextNode("Audio"));
    audioLabel.append(audioTitle);
    if (drawAudioAssetPicker !== null && drawAudioAdd !== null) {
      drawAudioAssetPicker.classList.add("draw2-timeline-audio-picker");
      drawAudioAdd.classList.add("draw2-timeline-audio-add");
      drawAudioAdd.textContent = "+";
      drawAudioAdd.title = "\u9078\u629E\u4E2D\u306E\u30D5\u30EC\u30FC\u30E0\u304B\u3089Audio\u3092\u8FFD\u52A0";
      drawAudioAdd.setAttribute("aria-label", "\u9078\u629E\u4E2D\u306E\u30D5\u30EC\u30FC\u30E0\u304B\u3089Audio\u3092\u8FFD\u52A0");
      audioLabel.append(drawAudioAssetPicker, drawAudioAdd);
    }
    audioRow.append(audioLabel);
    const visibleFirstFrame = virtualWindow.firstFrameIndex;
    const visibleLastFrame = virtualWindow.lastFrameIndex;
    for (const reference of drawAudioReferences.list()) {
      const referenceEnd = reference.startFrame + reference.durationFrames - 1;
      if (referenceEnd < visibleFirstFrame || reference.startFrame > visibleLastFrame) continue;
      const visibleStart = Math.max(reference.startFrame, visibleFirstFrame);
      const visibleEnd = Math.min(referenceEnd, visibleLastFrame);
      const block = document.createElement("button");
      block.type = "button";
      block.className = "draw2-timeline-audio-clip";
      block.dataset.audioKind = reference.kind;
      block.style.left = `${labelWidth + visibleStart * frameCellWidth}px`;
      block.style.width = `${Math.max(frameCellWidth, (visibleEnd - visibleStart + 1) * frameCellWidth)}px`;
      block.textContent = `${reference.kind} \xB7 ${reference.label}`;
      block.title = `${reference.label} \xB7 F${reference.startFrame + 1}\u304B\u3089`;
      block.setAttribute("aria-label", `${reference.kind} ${reference.label}, frame ${reference.startFrame + 1}`);
      block.addEventListener("click", () => {
        const frame2 = state.frames.find((item) => item.index === reference.startFrame);
        if (frame2 !== void 0) {
          selectTimelineFrame(frame2.frameId, new MouseEvent("click"));
        }
      });
      block.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        drawAudioReferences.remove(reference.id);
        queueDrawPersistenceSave("draw-audio-reference-remove");
        renderTimeline();
        setStatus(`Audio\u53C2\u7167 ${reference.label} \u3092\u524A\u9664\u3057\u307E\u3057\u305F\u3002`);
      });
      audioRow.append(block);
    }
    timelineWindow.append(audioRow);
  }
  if (virtualWindow.lastLayerIndex === state.timeline.layerTrackOrder.length - 1) {
    const addLayerRow = document.createElement("div");
    addLayerRow.className = "draw2-timeline-row draw2-timeline-layer-add-row";
    addLayerRow.style.top = `${headerHeight + (state.timeline.layerTrackOrder.length + 1) * layerRowHeight}px`;
    addLayerRow.setAttribute("role", "row");
    addLayerRow.setAttribute("aria-label", localizeDraw2Text("Add layer"));
    const addLayerHeader = document.createElement("button");
    addLayerHeader.type = "button";
    addLayerHeader.className = "draw2-timeline-row-label draw2-timeline-layer-add-header draw2-timeline-command-cell";
    addLayerHeader.classList.add("draw2-button-icon");
    addLayerHeader.append(createDraw2Icon("icon-add"));
    addLayerHeader.setAttribute("aria-label", localizeDraw2Text("Add layer"));
    addLayerHeader.title = localizeDraw2Text("Add layer");
    addLayerHeader.addEventListener("click", () => addLayerControl.click());
    addLayerRow.append(addLayerHeader);
    timelineWindow.append(addLayerRow);
  }
  const onionCount = onionSkinEnabled ? resolveOnionSkinNeighborhood(state, timelineSession.activeFrameId, {
    enabled: true,
    previousFrameCount: onionSkinPreviousFrames,
    nextFrameCount: onionSkinNextFrames,
    opacity: onionSkinOpacity
  }).references.length : 0;
  const currentFrame = state.frames.find((frame2) => frame2.frameId === timelineSession.activeFrameId);
  const currentLayer = state.layers.find((layer2) => layer2.layerTrackId === timelineSession.activeLayerTrackId);
  timelineStatus.textContent = `F${(currentFrame?.index ?? 0) + 1}/${state.frames.length} \xB7 ${currentLayer?.name ?? localizeDraw2Text("Layer")} \xB7 ${playbackFpsValue()} FPS \xB7 ${localizeDraw2Text(playbackLoopMode === "loop" ? "Loop" : playbackLoopMode === "bounce" ? "Bounce" : "Once")}${onionSkinEnabled ? ` \xB7 ${localizeDraw2Text("Onion")} ${onionCount}` : ""}`;
  const timelinePositionText = `F${(currentFrame?.index ?? 0) + 1}/${state.frames.length} \xB7 ${formatTimelineClock(activeFrameElapsed)}`;
  const timelineDurationText = formatTimelineClock(totalDurationMs);
  if (timelinePositionElement !== null) {
    timelinePositionElement.value = timelinePositionText;
    timelinePositionElement.textContent = timelinePositionText;
  }
  if (timelineDurationElement !== null) {
    timelineDurationElement.value = timelineDurationText;
    timelineDurationElement.textContent = timelineDurationText;
  }
  timelineCard.dataset.activeTab = activeTimelineTab;
  togglePlaybackControl.setAttribute("aria-pressed", String(playbackRunning));
  setDraw2Icon(toggleOnionControl, onionSkinEnabled ? "icon-eye" : "icon-onion");
  toggleOnionControl.title = localizeDraw2Text(onionSkinEnabled ? "Disable onion skin" : "Enable onion skin");
  toggleOnionControl.setAttribute("aria-label", localizeDraw2Text(onionSkinEnabled ? "Disable onion skin" : "Enable onion skin"));
  toggleOnionControl.setAttribute("aria-pressed", String(onionSkinEnabled));
  onionOptions.open = onionSkinEnabled;
  positionOnionOptionsPopover();
  onionPrevious.value = String(onionSkinPreviousFrames);
  onionPreviousValue.value = String(onionSkinPreviousFrames);
  onionNext.value = String(onionSkinNextFrames);
  onionNextValue.value = String(onionSkinNextFrames);
  onionOpacity.value = String(onionSkinOpacity);
  onionOpacityValue.value = `${Math.round(onionSkinOpacity * 100)}%`;
  onionColorMode.value = onionSkinColorMode;
  renderCreatorTimelineMetadata();
  renderLayerPanel();
  renderTimelineLayerProperties();
}
function renderCreatorTimelineMetadata() {
  tagList.replaceChildren();
  for (const tag of animationTags.list()) {
    const row = document.createElement("div");
    row.className = "draw2-creator-meta-row";
    const text = document.createElement("span");
    text.append(document.createTextNode(`${tag.name} \xB7 ${tag.fromFrameIndex + 1}\u2013${tag.toFrameIndex + 1}`));
    if (tag.loop) text.append(createDraw2Icon("icon-loop"));
    text.title = `${tag.name}: frames ${tag.fromFrameIndex + 1}-${tag.toFrameIndex + 1}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "draw2-button draw2-button-secondary draw2-button-icon";
    remove.append(createDraw2Icon("icon-close"));
    remove.setAttribute("aria-label", `${localizeDraw2Text("Remove animation tag")} ${tag.name}`);
    remove.addEventListener("click", () => {
      animationTags.remove(tag.id);
      queueDrawPersistenceSave("timeline-tag-remove");
      renderCreatorTimelineMetadata();
      setStatus(`Animation tag ${tag.name} removed.`);
    });
    row.append(text, remove);
    tagList.append(row);
  }
  if (tagList.childElementCount === 0) {
    const empty = document.createElement("span");
    empty.className = "draw2-creator-meta-empty";
    empty.textContent = localizeDraw2Text("No tags");
    tagList.append(empty);
  }
  markerList.replaceChildren();
  const activeFrameIndex = state.frames.find((frame2) => frame2.frameId === timelineSession.activeFrameId)?.index ?? 0;
  const activeMarkers = timelineMarkers.list(activeFrameIndex);
  for (const marker of activeMarkers) {
    const row = document.createElement("div");
    row.className = "draw2-creator-meta-row";
    const text = document.createElement("span");
    text.textContent = `${marker.kind} \xB7 ${marker.label}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "draw2-button draw2-button-secondary draw2-button-icon";
    remove.append(createDraw2Icon("icon-close"));
    remove.setAttribute("aria-label", `${localizeDraw2Text("Remove marker")} ${marker.label}`);
    remove.addEventListener("click", () => {
      timelineMarkers.remove(marker.id);
      queueDrawPersistenceSave("timeline-marker-remove");
      renderCreatorTimelineMetadata();
      setStatus(`Timeline marker ${marker.label} removed.`);
    });
    row.append(text, remove);
    markerList.append(row);
  }
  if (markerList.childElementCount === 0) {
    const empty = document.createElement("span");
    empty.className = "draw2-creator-meta-empty";
    empty.textContent = localizeDraw2Text("No markers on active frame");
    markerList.append(empty);
  }
  const activeBinding = linkedCelBindings.find((binding) => binding.celId === state.activeCelId);
  setDraw2Icon(linkedCelToggleControl, "icon-link");
  linkedCelToggleControl.setAttribute("aria-pressed", String(activeBinding !== void 0));
  linkedCelToggleControl.setAttribute("aria-label", localizeDraw2Text(activeBinding === void 0 ? "Link Cel" : "Unlink Cel"));
  linkedCelToggleControl.title = activeBinding === void 0 ? localizeDraw2Text("Link Cel") : localizeDraw2Text("Unlink Cel");
  linkedCelStatus.textContent = activeBinding === void 0 ? localizeDraw2Text("No local link") : `${localizeDraw2Text("Linked to")} ${activeBinding.sourceCelId}`;
  renderDrawAudioReferences();
}
function renderDrawAudioReferences() {
  if (drawAudioAssetPicker === null || drawAudioLane === null || drawAudioEmpty === null || drawAudioStatus === null) return;
  const selectedValue = drawAudioAssetPicker.value;
  drawAudioAssetPicker.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = drawAudioCatalog.length === 0 ? "Audio\u7D20\u6750\u304C\u3042\u308A\u307E\u305B\u3093" : "BGM\uFF0FSE\u3092\u9078\u629E";
  drawAudioAssetPicker.append(placeholder);
  for (const item of drawAudioCatalog) {
    const option = document.createElement("option");
    option.value = `${item.audioAssetId}\0${item.audioRevisionId}`;
    option.textContent = `${item.kind} \xB7 ${item.label}`;
    drawAudioAssetPicker.append(option);
  }
  if ([
    ...drawAudioAssetPicker.options
  ].some((option) => option.value === selectedValue)) {
    drawAudioAssetPicker.value = selectedValue;
  }
  drawAudioLane.replaceChildren();
  const references = drawAudioReferences.list();
  for (const reference of references) {
    const row = document.createElement("div");
    row.className = "draw2-creator-meta-row";
    row.setAttribute("role", "listitem");
    const text = document.createElement("span");
    text.textContent = `${reference.kind} \xB7 ${reference.label} \xB7 F${reference.startFrame + 1}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "draw2-button draw2-button-secondary draw2-button-icon";
    remove.append(createDraw2Icon("icon-close"));
    remove.setAttribute("aria-label", `${reference.label} \u3092\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u304B\u3089\u524A\u9664`);
    remove.addEventListener("click", () => {
      drawAudioReferences.remove(reference.id);
      queueDrawPersistenceSave("draw-audio-reference-remove");
      renderDrawAudioReferences();
      renderTimeline();
      setStatus(`Audio\u53C2\u7167 ${reference.label} \u3092\u524A\u9664\u3057\u307E\u3057\u305F\u3002`);
    });
    row.append(text, remove);
    drawAudioLane.append(row);
  }
  drawAudioEmpty.hidden = references.length > 0;
  drawAudioStatus.value = drawAudioCatalog.length === 0 ? "Audio\u30E2\u30FC\u30C9\u3067BGM\u307E\u305F\u306FSE\u3092\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : `${references.length}\u4EF6\u306EAudio\u53C2\u7167`;
  drawAudioStatus.textContent = drawAudioStatus.value;
  if (drawAudioAdd !== null) {
    drawAudioAdd.disabled = drawAudioCatalog.length === 0;
  }
}
function addDrawAudioReferenceFromControls() {
  if (drawAudioAssetPicker === null || drawAudioAssetPicker.value === "") {
    return;
  }
  const [audioAssetId, audioRevisionId] = drawAudioAssetPicker.value.split("\0");
  const source = drawAudioCatalog.find((item) => item.audioAssetId === audioAssetId && item.audioRevisionId === audioRevisionId);
  const frame2 = state.frames.find((item) => item.frameId === timelineSession.activeFrameId);
  if (source === void 0 || frame2 === void 0) return;
  const reference = {
    id: `audio-ref:ui:${Date.now()}`,
    audioAssetId: source.audioAssetId,
    audioRevisionId: source.audioRevisionId,
    kind: source.kind,
    label: source.label,
    startFrame: frame2.index,
    durationFrames: source.kind === "BGM" ? Math.max(1, state.frames.length - frame2.index) : 1,
    loop: source.kind === "BGM",
    gain: 1
  };
  drawAudioReferences.upsert(reference, state.frames.length);
  drawAudioAssetPicker.value = "";
  queueDrawPersistenceSave("draw-audio-reference-add");
  renderDrawAudioReferences();
  renderTimeline();
  setStatus(`${source.kind} ${source.label} \u3092F${frame2.index + 1}\u3078\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002`);
}
function addAnimationTagFromControls() {
  try {
    const fromFrameIndex = Math.max(0, Math.round(Number(tagFromControl.value) || 1) - 1);
    const toFrameIndex = Math.max(fromFrameIndex, Math.round(Number(tagToControl.value) || fromFrameIndex + 1) - 1);
    const tag = animationTags.upsert({
      id: `tag:ui:${Date.now()}`,
      name: tagNameControl.value.trim() || `Tag ${animationTags.list().length + 1}`,
      fromFrameIndex,
      toFrameIndex,
      loop: tagLoopControl.checked
    }, state.frames.length);
    tagNameControl.value = "";
    queueDrawPersistenceSave("timeline-tag-add");
    renderCreatorTimelineMetadata();
    setStatus(`Animation tag ${tag.name} added.`);
  } catch (cause) {
    setStatus(cause instanceof Error ? cause.message : "Animation tag is invalid.", "error");
  }
}
function addTimelineMarkerFromControls() {
  try {
    const frame2 = state.frames.find((item) => item.frameId === timelineSession.activeFrameId);
    if (frame2 === void 0) throw new Error("Active frame is unavailable.");
    const markerKinds = [
      "AUDIO",
      "GAME_EVENT",
      "NOTE"
    ];
    const kind = markerKinds.find((candidate) => candidate === markerKindControl.value) ?? "NOTE";
    const marker = {
      id: `marker:ui:${Date.now()}`,
      frameIndex: frame2.index,
      kind,
      label: markerLabelControl.value.trim() || `${kind} ${frame2.index + 1}`
    };
    timelineMarkers.upsert(marker);
    markerLabelControl.value = "";
    queueDrawPersistenceSave("timeline-marker-add");
    renderCreatorTimelineMetadata();
    setStatus(`Timeline marker ${marker.label} added.`);
  } catch (cause) {
    setStatus(cause instanceof Error ? cause.message : "Timeline marker is invalid.", "error");
  }
}
function toggleActiveLinkedCel() {
  const existing = linkedCelBindings.find((binding) => binding.celId === state.activeCelId);
  if (existing !== void 0) {
    linkedCelBindings = linkedCelBindings.filter((binding) => binding.celId !== state.activeCelId);
    renderCreatorTimelineMetadata();
    setStatus("Active Cel link removed from local metadata.");
    return;
  }
  const activeCel = state.cels.find((cel2) => cel2.celId === state.activeCelId);
  const activeFrame = state.frames.find((frame2) => frame2.frameId === timelineSession.activeFrameId);
  if (activeCel === void 0 || activeFrame === void 0) {
    setStatus("Active Cel is unavailable.", "error");
    return;
  }
  const source = state.cels.map((cel2) => ({
    cel: cel2,
    frame: state.frames.find((frame2) => frame2.frameId === cel2.frameId)
  })).filter((entry) => entry.frame !== void 0 && entry.frame.index < activeFrame.index && entry.cel.layerTrackId === activeCel.layerTrackId && entry.cel.assetId !== void 0 && entry.cel.celId !== activeCel.celId).sort((a, b) => b.frame.index - a.frame.index)[0]?.cel;
  if (source === void 0) {
    setStatus("A previous raster Cel is required before linking.", "error");
    return;
  }
  try {
    const binding = createLinkedCelBinding(activeCel.celId, source.celId, linkedCelBindings);
    linkedCelBindings = [
      ...linkedCelBindings.filter((item) => item.celId !== activeCel.celId),
      binding
    ];
    renderCreatorTimelineMetadata();
    setStatus(`Active Cel linked to ${source.celId} in local metadata.`);
  } catch (cause) {
    setStatus(cause instanceof Error ? cause.message : "Linked Cel is invalid.", "error");
  }
}
async function runTimelineCommand(commandType, payload, options = {}) {
  timelineStateGeneration += 1;
  const commandSequence = nextClientSequence(TIMELINE_CLIENT_ID);
  const before = state;
  const command = {
    commandId: `draw2-timeline-${state.projectId}-${commandSequence}-${commandType}`,
    commandType,
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "draw2-timeline-local",
    clientId: TIMELINE_CLIENT_ID,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload
  };
  const result = await executeTimelineCommand(state, command);
  if (!result.ok) {
    syncClientSequencesFromState();
    setStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
    return false;
  }
  state = result.state;
  const timelineInvalidatesLocalSelection = timelineCommandInvalidatesSelection(before, state);
  if (timelineInvalidatesLocalSelection && (selection !== void 0 || hasUncommittedSelectionWork())) {
    clearCommittedSelection("Selection and transform preview cleared because the timeline target changed.");
  }
  core = new EditorCore(state, {
    instrumentation
  });
  switch (commandType) {
    case "timeline.addFrame":
    case "timeline.duplicateFrame":
    case "timeline.removeFrame":
    case "timeline.addLayerTrack":
    case "timeline.duplicateLayerTrack":
    case "timeline.removeLayerTrack":
      timelineSelectedCells.clear();
      timelineSelectionAnchor = void 0;
      break;
    default:
      break;
  }
  let autoActivate;
  if (commandType === "timeline.addLayerTrack" || commandType === "timeline.duplicateLayerTrack") {
    const nextLayerTrackId = payload.layerTrackId;
    if (nextLayerTrackId !== void 0) {
      timelineSession = {
        ...timelineSession,
        activeLayerTrackId: nextLayerTrackId
      };
      autoActivate = {
        frameId: timelineSession.activeFrameId,
        layerTrackId: nextLayerTrackId
      };
    }
  } else if (commandType === "timeline.addFrame" || commandType === "timeline.duplicateFrame") {
    const nextFrameId = payload.frameId;
    if (nextFrameId !== void 0) {
      timelineSession = setTimelineSessionActiveFrame(state, timelineSession, nextFrameId);
      autoActivate = {
        frameId: nextFrameId,
        layerTrackId: timelineSession.activeLayerTrackId
      };
    }
  }
  if (commandType === "timeline.activateCel") {
    const activation = payload;
    timelineSession = {
      ...setTimelineSessionActiveFrame(state, timelineSession, activation.frameId),
      activeLayerTrackId: activation.layerTrackId,
      activeCelId: state.activeCelId
    };
  }
  if (autoActivate !== void 0) {
    await activateTimelineCell(autoActivate.frameId, autoActivate.layerTrackId);
  }
  if (options.recordHistory !== false) {
    history.record(before, state, result.result.operation.operationId, result.result.operation.operationType);
  }
  saveDrawProjectState();
  await autosave.record(state, result.result);
  normalizeTimelineSession();
  renderTimeline();
  renderPaletteButtons(state.assets[state.activeAssetId]?.palette ?? []);
  syncColorEditorFromSelection();
  await present();
  if (timelineInvalidatesLocalSelection) {
    updateSelectionActionButtons();
    updateSelectionStatus(`scope=${state.activeCelId} \xB7 selection=none`);
    drawOverlay();
  }
  if (options.announce !== false) {
    setStatus(`${result.result.operation.operationType} committed locally \xB7 domains=${result.result.structuralDirtyDomains?.join("+") ?? "none"} \xB7 fullClone=${result.result.trace.fullRasterCloneCount}`);
  }
  updateHistoryButtons();
  return true;
}
function selectionRegionPath(region) {
  const right = region.x + region.width;
  const bottom = region.y + region.height;
  return `M ${region.x} ${region.y} H ${right} V ${bottom} H ${region.x} Z`;
}
function renderSelectionSvgOverlay(regions, previewRegions, draftRegions = [], pendingPoints = [], pendingEllipseRegion) {
  selectionOverlay.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
  while (selectionOverlayRegions.firstChild !== null) {
    selectionOverlayRegions.removeChild(selectionOverlayRegions.firstChild);
  }
  const appendRegion = (region, kind) => {
    if (region.width < 1 || region.height < 1) return;
    const path = selectionRegionPath(region);
    for (const stroke of [
      "dark",
      "light"
    ]) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
      element.setAttribute("d", path);
      element.setAttribute("class", `draw2-selection-path draw2-selection-path--${kind} draw2-selection-path--${stroke}`);
      element.setAttribute("vector-effect", "non-scaling-stroke");
      selectionOverlayRegions.appendChild(element);
    }
  };
  const appendPath = (points, kind) => {
    if (points.length < 2) return;
    const first = points[0];
    if (first === void 0) return;
    const closed = [
      ...points,
      first
    ];
    for (const stroke of [
      "dark",
      "light"
    ]) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
      element.setAttribute("d", closed.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x + 0.5} ${point.y + 0.5}`).join(" "));
      element.setAttribute("class", `draw2-selection-path draw2-selection-path--${kind} draw2-selection-path--${stroke}`);
      element.setAttribute("vector-effect", "non-scaling-stroke");
      selectionOverlayRegions.appendChild(element);
    }
  };
  const appendEllipse = (region) => {
    if (region.width < 1 || region.height < 1) return;
    for (const stroke of [
      "dark",
      "light"
    ]) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      element.setAttribute("cx", String(region.x + region.width / 2));
      element.setAttribute("cy", String(region.y + region.height / 2));
      element.setAttribute("rx", String(region.width / 2));
      element.setAttribute("ry", String(region.height / 2));
      element.setAttribute("class", `draw2-selection-path draw2-selection-path--pending draw2-selection-path--${stroke}`);
      element.setAttribute("vector-effect", "non-scaling-stroke");
      selectionOverlayRegions.appendChild(element);
    }
  };
  for (const region of regions) appendRegion(region, "selection");
  for (const region of previewRegions) appendRegion(region, "preview");
  for (const region of draftRegions) appendRegion(region, "draft");
  if (pendingEllipseRegion !== void 0) appendEllipse(pendingEllipseRegion);
  if (pendingPoints.length > 1) appendPath(pendingPoints, "pending");
  if (regions.length === 0 && previewRegions.length === 0 && draftRegions.length === 0 && pendingPoints.length < 2 && pendingEllipseRegion === void 0) selectionOverlay.setAttribute("hidden", "");
  else selectionOverlay.removeAttribute("hidden");
}
function normalizeMirrorGuide(asset) {
  const clampOffset = (value) => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
  return {
    x: clampMirrorGuideCoordinate(Number.isFinite(mirrorGuide.x) ? mirrorGuide.x : mirrorGuideCenter(asset.width), asset.width),
    y: clampMirrorGuideCoordinate(Number.isFinite(mirrorGuide.y) ? mirrorGuide.y : mirrorGuideCenter(asset.height), asset.height),
    diagonalDown: clampOffset(mirrorGuide.diagonalDown),
    diagonalUp: clampOffset(mirrorGuide.diagonalUp)
  };
}
function mirrorHasActiveAxis() {
  return mirrorAxes.x || mirrorAxes.y || mirrorAxes.diagonalDown || mirrorAxes.diagonalUp;
}
function mirrorAxisLabel(axis) {
  switch (axis) {
    case "x":
      return "Vertical line";
    case "y":
      return "Horizontal line";
    case "diagonal-down":
      return "Descending diagonal line";
    case "diagonal-up":
      return "Ascending diagonal line";
  }
}
function mirrorAxisEnabled(axis) {
  switch (axis) {
    case "x":
      return mirrorAxes.x;
    case "y":
      return mirrorAxes.y;
    case "diagonal-down":
      return mirrorAxes.diagonalDown;
    case "diagonal-up":
      return mirrorAxes.diagonalUp;
  }
}
function setMirrorAxisEnabled(axis, enabled) {
  mirrorAxes = axis === "x" ? {
    ...mirrorAxes,
    x: enabled
  } : axis === "y" ? {
    ...mirrorAxes,
    y: enabled
  } : axis === "diagonal-down" ? {
    ...mirrorAxes,
    diagonalDown: enabled
  } : {
    ...mirrorAxes,
    diagonalUp: enabled
  };
}
function mirrorAxisSummary() {
  const axes = [
    [
      "x",
      "vertical"
    ],
    [
      "y",
      "horizontal"
    ],
    [
      "diagonal-down",
      "diagonal \u2198"
    ],
    [
      "diagonal-up",
      "diagonal \u2197"
    ]
  ].filter(([axis]) => mirrorAxisEnabled(axis)).map(([, label]) => label);
  return axes.length > 0 ? axes.join("+") : "no line";
}
function syncMirrorModeToggle() {
  const enabled = mirrorMode === "ON";
  const stateLabel = localizeDraw2Text(enabled ? "On" : "Off");
  mirrorModeControl.setAttribute("aria-pressed", String(enabled));
  mirrorModeControl.dataset.mode = enabled ? "on" : "off";
  mirrorModeControl.setAttribute("aria-label", `${localizeDraw2Text("Mirror")}: ${stateLabel}`);
  mirrorModeControl.title = `${localizeDraw2Text("Mirror")}: ${stateLabel}`;
  const stateElement = mirrorModeControl.querySelector("[data-draw2-mirror-state]");
  if (stateElement !== null) {
    stateElement.textContent = stateLabel.toUpperCase();
  }
}
function setMirrorPreset(mode) {
  mirrorMode = mode;
  mirrorEnabled = mode === "ON";
  viewportWrapElement?.classList.toggle("is-mirror-enabled", mirrorEnabled);
  if (viewportWrapElement !== null) {
    if (mirrorEnabled) {
      viewportWrapElement.style.setProperty("padding", usesResponsiveViewportFit() ? "38px" : "42px", "important");
    } else {
      viewportWrapElement.style.removeProperty("padding");
    }
  }
  if (mirrorEnabled && !mirrorHasActiveAxis()) {
    mirrorAxes = {
      ...mirrorAxes,
      x: true
    };
  }
  syncMirrorModeToggle();
  applyViewportTransform();
}
function syncMirrorLineToggle(button, enabled, visible, label) {
  button.hidden = !visible;
  button.disabled = !visible;
  button.setAttribute("aria-pressed", String(enabled));
  button.dataset.enabled = String(enabled);
  const localizedLabel = localizeDraw2Text(label);
  const localizedState = localizeDraw2Text(enabled ? "On" : "Off");
  button.setAttribute("aria-label", `${localizedLabel}: ${localizedState}`);
  button.title = `${localizedLabel}: ${localizedState}`;
}
function diagonalLineEndpoints(axis, offset, asset) {
  const maxX = Math.max(1, asset.width - 1);
  const maxY = Math.max(1, asset.height - 1);
  const points = [];
  const appendPoint = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -1e-4 || x > asset.width + 1e-4 || y < -1e-4 || y > asset.height + 1e-4 || points.some((item) => Math.abs(item.x - x) < 1e-4 && Math.abs(item.y - y) < 1e-4)) return;
    points.push({
      x: Math.max(0, Math.min(asset.width, x)),
      y: Math.max(0, Math.min(asset.height, y))
    });
  };
  const guideYFromGuideX = (guideX) => axis === "diagonal-down" ? (guideX / maxX + offset) * maxY : (1 + offset - guideX / maxX) * maxY;
  const guideXFromGuideY = (guideY) => axis === "diagonal-down" ? (guideY / maxY - offset) * maxX : (1 + offset - guideY / maxY) * maxX;
  for (const canvasX of [
    0,
    asset.width
  ]) {
    appendPoint(canvasX, guideYFromGuideX(canvasX - 0.5) + 0.5);
  }
  for (const canvasY of [
    0,
    asset.height
  ]) {
    appendPoint(guideXFromGuideY(canvasY - 0.5) + 0.5, canvasY);
  }
  const first = points[0] ?? {
    x: 0,
    y: axis === "diagonal-down" ? 0 : asset.height
  };
  const second = points[1] ?? {
    x: asset.width,
    y: axis === "diagonal-down" ? asset.height : 0
  };
  return {
    x1: first.x,
    y1: first.y,
    x2: second.x,
    y2: second.y
  };
}
function positionMirrorLineToggles(asset) {
  const viewport = viewportWrapElement?.getBoundingClientRect();
  const canvasBounds = canvas.getBoundingClientRect();
  if (viewport === void 0 || canvasBounds.width <= 0 || canvasBounds.height <= 0) return;
  const canvasLeft = canvasBounds.left - viewport.left;
  const canvasTop = canvasBounds.top - viewport.top;
  const x = canvasLeft + mirrorGuideToCanvasCoordinate(mirrorGuide.x, asset.width) / Math.max(1, asset.width) * canvasBounds.width;
  const y = canvasTop + mirrorGuideToCanvasCoordinate(mirrorGuide.y, asset.height) / Math.max(1, asset.height) * canvasBounds.height;
  const inset = 6;
  const clampHandleCenter = (value, halfSize, viewportSize) => {
    const min = Math.min(halfSize + inset, Math.max(halfSize, viewportSize - halfSize));
    const max = Math.max(min, viewportSize - halfSize - inset);
    return Math.max(min, Math.min(max, value));
  };
  const handleXHalf = Math.max(1, mirrorToggleX.offsetWidth / 2);
  const handleYHalf = Math.max(1, mirrorToggleY.offsetHeight / 2);
  const xCenter = clampHandleCenter(x, handleXHalf, viewport.width);
  const yCenter = clampHandleCenter(y, handleYHalf, viewport.height);
  mirrorToggleX.style.left = `${xCenter - handleXHalf}px`;
  mirrorToggleX.style.top = `${inset}px`;
  mirrorToggleY.style.left = `${inset}px`;
  mirrorToggleY.style.top = `${yCenter - handleYHalf}px`;
  const placeOnViewportEdge = (button, edge) => {
    const halfWidth = Math.max(1, button.offsetWidth / 2);
    const halfHeight = Math.max(1, button.offsetHeight / 2);
    const centerX = clampHandleCenter(edge === "right" ? viewport.width - halfWidth - inset : viewport.width / 2, halfWidth, viewport.width);
    const centerY = clampHandleCenter(edge === "right" ? viewport.height / 2 : viewport.height - halfHeight - inset, halfHeight, viewport.height);
    button.style.left = `${centerX - halfWidth}px`;
    button.style.top = `${centerY - halfHeight}px`;
  };
  placeOnViewportEdge(mirrorToggleDiagonalDown, "right");
  placeOnViewportEdge(mirrorToggleDiagonalUp, "bottom");
}
function syncMirrorGuideOverlay(asset) {
  if (mirrorGuideOverlayElement === null || mirrorGuideVerticalElement === null || mirrorGuideHorizontalElement === null || mirrorGuideDiagonalDownElement === null || mirrorGuideDiagonalUpElement === null) return;
  mirrorGuide = normalizeMirrorGuide(asset);
  mirrorGuideOverlayElement.setAttribute("viewBox", `0 0 ${asset.width} ${asset.height}`);
  const verticalVisible = mirrorEnabled;
  const horizontalVisible = mirrorEnabled;
  const verticalPosition = mirrorGuideToCanvasCoordinate(mirrorGuide.x, asset.width);
  const horizontalPosition = mirrorGuideToCanvasCoordinate(mirrorGuide.y, asset.height);
  mirrorGuideVerticalElement.setAttribute("x1", String(verticalPosition));
  mirrorGuideVerticalElement.setAttribute("x2", String(verticalPosition));
  mirrorGuideVerticalElement.setAttribute("y1", "-32");
  mirrorGuideVerticalElement.setAttribute("y2", String(asset.height + 32));
  mirrorGuideHorizontalElement.setAttribute("y1", String(horizontalPosition));
  mirrorGuideHorizontalElement.setAttribute("y2", String(horizontalPosition));
  mirrorGuideHorizontalElement.setAttribute("x1", "-32");
  mirrorGuideHorizontalElement.setAttribute("x2", String(asset.width + 32));
  const diagonalDown = diagonalLineEndpoints("diagonal-down", mirrorGuide.diagonalDown, asset);
  const diagonalUp = diagonalLineEndpoints("diagonal-up", mirrorGuide.diagonalUp, asset);
  mirrorGuideDiagonalDownElement.setAttribute("x1", String(diagonalDown.x1));
  mirrorGuideDiagonalDownElement.setAttribute("y1", String(diagonalDown.y1));
  mirrorGuideDiagonalDownElement.setAttribute("x2", String(diagonalDown.x2));
  mirrorGuideDiagonalDownElement.setAttribute("y2", String(diagonalDown.y2));
  mirrorGuideDiagonalUpElement.setAttribute("x1", String(diagonalUp.x1));
  mirrorGuideDiagonalUpElement.setAttribute("y1", String(diagonalUp.y1));
  mirrorGuideDiagonalUpElement.setAttribute("x2", String(diagonalUp.x2));
  mirrorGuideDiagonalUpElement.setAttribute("y2", String(diagonalUp.y2));
  mirrorGuideVerticalElement.classList.toggle("is-disabled", !mirrorAxes.x);
  mirrorGuideHorizontalElement.classList.toggle("is-disabled", !mirrorAxes.y);
  mirrorGuideDiagonalDownElement.classList.toggle("is-disabled", !mirrorAxes.diagonalDown);
  mirrorGuideDiagonalUpElement.classList.toggle("is-disabled", !mirrorAxes.diagonalUp);
  mirrorGuideVerticalElement.dataset.enabled = String(mirrorAxes.x);
  mirrorGuideHorizontalElement.dataset.enabled = String(mirrorAxes.y);
  mirrorGuideDiagonalDownElement.dataset.enabled = String(mirrorAxes.diagonalDown);
  mirrorGuideDiagonalUpElement.dataset.enabled = String(mirrorAxes.diagonalUp);
  mirrorGuideVerticalElement.toggleAttribute("hidden", !verticalVisible);
  mirrorGuideHorizontalElement.toggleAttribute("hidden", !horizontalVisible);
  mirrorGuideDiagonalDownElement.toggleAttribute("hidden", !verticalVisible);
  mirrorGuideDiagonalUpElement.toggleAttribute("hidden", !horizontalVisible);
  mirrorGuideOverlayElement.toggleAttribute("hidden", !mirrorEnabled);
  syncMirrorLineToggle(mirrorToggleX, mirrorAxes.x, mirrorEnabled, "Vertical line");
  syncMirrorLineToggle(mirrorToggleY, mirrorAxes.y, mirrorEnabled, "Horizontal line");
  syncMirrorLineToggle(mirrorToggleDiagonalDown, mirrorAxes.diagonalDown, mirrorEnabled, "Descending diagonal line");
  syncMirrorLineToggle(mirrorToggleDiagonalUp, mirrorAxes.diagonalUp, mirrorEnabled, "Ascending diagonal line");
  positionMirrorLineToggles(asset);
}
function onionFrameImage(asset, frameId) {
  if (onionSkinCache?.state !== state) {
    onionSkinCache = {
      state,
      frames: /* @__PURE__ */ new Map()
    };
  }
  const cached = onionSkinCache.frames.get(frameId);
  if (cached !== void 0) return cached;
  const image = compositeRegion({
    x: 0,
    y: 0,
    width: asset.width,
    height: asset.height
  }, frameId);
  onionSkinCache.frames.set(frameId, image);
  return image;
}
function drawOnionSkinProjection(asset) {
  if (!onionSkinEnabled) return 0;
  const projection = resolveOnionSkinNeighborhood(state, timelineSession.activeFrameId, {
    enabled: true,
    previousFrameCount: onionSkinPreviousFrames,
    nextFrameCount: onionSkinNextFrames,
    opacity: onionSkinOpacity
  });
  if (projection.references.length === 0) return 0;
  const output = selectionOverlayContext.createImageData(asset.width, asset.height);
  for (const reference of projection.references) {
    const source = onionFrameImage(asset, reference.frameId);
    const tint = reference.role === "PREVIOUS" ? {
      red: 255,
      green: 90,
      blue: 116
    } : {
      red: 78,
      green: 178,
      blue: 255
    };
    for (let offset = 0; offset < source.data.length; offset += 4) {
      const sourceAlpha = (source.data[offset + 3] ?? 0) / 255;
      const alpha = sourceAlpha * reference.opacity;
      if (alpha <= 0) continue;
      const existingAlpha = (output.data[offset + 3] ?? 0) / 255;
      const resultAlpha = alpha + existingAlpha * (1 - alpha);
      if (resultAlpha <= 0) continue;
      const color = onionSkinColorMode === "ORIGINAL" ? {
        red: source.data[offset] ?? 0,
        green: source.data[offset + 1] ?? 0,
        blue: source.data[offset + 2] ?? 0
      } : tint;
      output.data[offset] = Math.round((color.red * alpha + (output.data[offset] ?? 0) * existingAlpha * (1 - alpha)) / resultAlpha);
      output.data[offset + 1] = Math.round((color.green * alpha + (output.data[offset + 1] ?? 0) * existingAlpha * (1 - alpha)) / resultAlpha);
      output.data[offset + 2] = Math.round((color.blue * alpha + (output.data[offset + 2] ?? 0) * existingAlpha * (1 - alpha)) / resultAlpha);
      output.data[offset + 3] = Math.round(resultAlpha * 255);
    }
  }
  selectionOverlayContext.putImageData(output, 0, 0);
  return projection.references.length;
}
function clearErasePreview() {
  eraseProjectionContext.clearRect(0, 0, erasePreview.width, erasePreview.height);
  erasePreview.hidden = true;
  erasePreview.style.removeProperty("clip-path");
}
function drawErasePreview(asset, points) {
  const writes = previewWriteSet(asset, "eraser", points);
  if (writes.length === 0) return;
  let minX = asset.width;
  let minY = asset.height;
  let maxX = -1;
  let maxY = -1;
  const transparentPixels = /* @__PURE__ */ new Set();
  for (const point of writes) {
    if (point.x < 0 || point.y < 0 || point.x >= asset.width || point.y >= asset.height) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    transparentPixels.add(selectionPointKey(point));
  }
  if (maxX < minX || maxY < minY) return;
  const region = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
  const image = compositeRegion(region, timelineSession.activeFrameId, {
    assetId: asset.id,
    transparentPixels
  });
  eraseProjectionContext.clearRect(0, 0, erasePreview.width, erasePreview.height);
  eraseProjectionContext.putImageData(image, region.x, region.y);
  const top = region.y / asset.height * 100;
  const right = (asset.width - region.x - region.width) / asset.width * 100;
  const bottom = (asset.height - region.y - region.height) / asset.height * 100;
  const left = region.x / asset.width * 100;
  erasePreview.style.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  erasePreview.hidden = false;
}
function drawOverlay() {
  selectionOverlayContext.clearRect(0, 0, overlay.width, overlay.height);
  clearErasePreview();
  if (playbackRunning) {
    selectionOverlay.setAttribute("hidden", "");
    return;
  }
  const asset = state.assets[state.activeAssetId];
  const tilemapMode = activeLayerIsTilemap();
  if (asset !== void 0 && !tilemapMode) drawOnionSkinProjection(asset);
  const tool = currentBasicTool();
  const interactionPoints = drawInteraction?.session?.points ?? [];
  const previewPoints = interactionPoints.length > 0 ? interactionPoints : virtualCursorEnabled && hoverPoint !== void 0 ? [
    hoverPoint
  ] : [];
  if (asset !== void 0 && !tilemapMode && previewPoints.length > 0) {
    try {
      if (tool === "eraser") drawErasePreview(asset, previewPoints);
      drawCurrentToolPreview(asset, tool, previewPoints);
    } catch {
    }
  }
  if (asset !== void 0 && !tilemapMode && transformPreview !== void 0) {
    drawTransformPreviewPixels(asset, transformPreview.pixels);
  }
  if (asset !== void 0 && !tilemapMode) syncMirrorGuideOverlay(asset);
  const draftRegions = selectionDraft?.snapshot?.mask.regions ?? [];
  const pendingPoints = pendingSelectionGesture?.tool === "select-lasso" || pendingSelectionGesture?.tool === "select-polygon" ? pendingSelectionGesture.points : [];
  const pendingRegions = pendingSelectionGesture?.tool === "select-rect" && pendingSelectionGesture.points.length > 0 ? [
    pendingSelectionGesture.grid !== void 0 ? snapSelectionBoundsToGrid(pendingSelectionGesture.grid.anchor, pendingSelectionGesture.points.at(-1) ?? pendingSelectionGesture.grid.anchor, asset ?? {
      width: canvas.width,
      height: canvas.height
    }, pendingSelectionGesture.grid.size) : normalizeToolBounds(pendingSelectionGesture.points[0], pendingSelectionGesture.points[pendingSelectionGesture.points.length - 1], asset ?? {
      width: canvas.width,
      height: canvas.height
    })
  ] : [];
  const pendingEllipseRegion = asset !== void 0 && pendingSelectionGesture?.tool === "select-ellipse" && pendingSelectionGesture.points.length > 0 ? normalizeToolBounds(pendingSelectionGesture.points[0], pendingSelectionGesture.points.at(-1) ?? pendingSelectionGesture.points[0], asset) : void 0;
  renderSelectionSvgOverlay(selection?.mask.regions ?? [], transformPreview?.overlayRegions ?? [], [
    ...draftRegions,
    ...pendingRegions
  ], pendingPoints, pendingEllipseRegion);
}
var MAX_TRANSFORM_PREVIEW_PIXELS = 32768;
function drawTransformPreviewPixels(asset, pixels) {
  if (pixels.length === 0 || pixels.length > MAX_TRANSFORM_PREVIEW_PIXELS) {
    return;
  }
  selectionOverlayContext.save();
  selectionOverlayContext.imageSmoothingEnabled = false;
  selectionOverlayContext.globalAlpha = 0.86;
  for (const pixel of pixels) {
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width || pixel.y >= asset.height) continue;
    const color = decodeArgb(paletteColorForRender(asset, pixel.colorIndex));
    if (color.alpha <= 0) continue;
    selectionOverlayContext.fillStyle = `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha / 255})`;
    selectionOverlayContext.fillRect(pixel.x, pixel.y, 1, 1);
  }
  selectionOverlayContext.restore();
}
function previewWriteSet(asset, tool, points) {
  if (selection !== void 0 && !selectionScopeMatchesActiveCel()) return [];
  const first = points[0];
  const last = points[points.length - 1] ?? first;
  if (first === void 0 || last === void 0) return [];
  const writes = tool === "pen" || tool === "eraser" ? mirrorWritesForTool(createPathWriteSet(tool, points, selectedColor, toolOptions, asset.raster), asset, tool) : points.length === 1 ? mirrorWritesForTool(createToolPreviewWriteSet(tool, first, selectedColor, toolOptions, asset.raster), asset, tool) : mirrorWritesForTool(createWriteSet(tool, first, last, selectedColor, toolOptions, asset.raster), asset, tool);
  const selectionKeys = selection === void 0 ? void 0 : new Set(selection.pixels.map(selectionPointKey));
  return (selectionKeys === void 0 ? writes : writes.filter((write) => selectionKeys.has(selectionPointKey(write)))).map(({ x, y }) => ({
    x,
    y
  }));
}
function guideColor(asset, tool) {
  return tool === "eraser" ? {
    alpha: 255,
    red: 255,
    green: 104,
    blue: 124
  } : decodeArgb(paletteColorForRender(asset, selectedColor));
}
function drawCurrentToolPreview(asset, tool, points) {
  const first = points[0];
  const last = points[points.length - 1] ?? first;
  if (first === void 0 || last === void 0 || tool === "pan") return;
  if (tool === "eraser") return;
  if (tool === "fill") {
    if (points.length > 1) {
      const writes = createFillGradientWriteSet(asset, first, last, selectedColor, 32768);
      if (writes.length > 0) drawTransformPreviewPixels(asset, writes);
    }
    if (selection === void 0 || pointIsSelectedPixel(selection, last)) {
      drawToolCursor(last, guideColor(asset, tool));
    }
    return;
  }
  if (tool === "eyedropper") {
    const sampled = decodeArgb(paletteColorForRender(asset, asset.raster.getPixel(last.x, last.y)));
    drawToolCursor(last, {
      alpha: 255,
      red: 255 - sampled.red,
      green: 255 - sampled.green,
      blue: 255 - sampled.blue
    });
    return;
  }
  if (tool === "select-rect" || tool === "select-ellipse" || tool === "select-lasso" || tool === "select-polygon") {
    return;
  }
  if (tool === "tile-stamp" || tool === "move") {
    drawToolCursor(last, guideColor(asset, tool));
    return;
  }
  if (tool === "select-color") {
    drawToolCursor(last, {
      alpha: 255,
      red: 248,
      green: 212,
      blue: 119
    });
    return;
  }
  drawToolPreviewGuide(previewWriteSet(asset, tool, points), guideColor(asset, tool));
}
function drawToolCursor(point, color) {
  const luminance = color.red * 0.299 + color.green * 0.587 + color.blue * 0.114;
  const contrast = luminance > 145 ? "rgba(12, 16, 24, 0.96)" : "rgba(255, 255, 255, 0.96)";
  selectionOverlayContext.save();
  selectionOverlayContext.imageSmoothingEnabled = false;
  selectionOverlayContext.fillStyle = contrast;
  selectionOverlayContext.fillRect(point.x - 1, point.y, 3, 1);
  selectionOverlayContext.fillRect(point.x, point.y - 1, 1, 3);
  selectionOverlayContext.fillStyle = `rgba(${color.red}, ${color.green}, ${color.blue}, ${Math.max(0.45, color.alpha / 255)})`;
  selectionOverlayContext.fillRect(point.x, point.y, 1, 1);
  selectionOverlayContext.restore();
}
function drawToolPreviewGuide(points, color) {
  if (points.length === 0) return;
  const alpha = Math.max(0, Math.min(1, color.alpha / 255));
  selectionOverlayContext.save();
  selectionOverlayContext.imageSmoothingEnabled = false;
  selectionOverlayContext.setLineDash([]);
  if (points.length > 4096) {
    const image = selectionOverlayContext.createImageData(overlay.width, overlay.height);
    const imageAlpha = Math.round(alpha * 255);
    for (const point of points) {
      if (point.x < 0 || point.y < 0 || point.x >= overlay.width || point.y >= overlay.height) continue;
      const offset = (point.y * overlay.width + point.x) * 4;
      image.data[offset] = color.red;
      image.data[offset + 1] = color.green;
      image.data[offset + 2] = color.blue;
      image.data[offset + 3] = imageAlpha;
    }
    selectionOverlayContext.putImageData(image, 0, 0);
    selectionOverlayContext.restore();
    return;
  }
  selectionOverlayContext.fillStyle = `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
  for (const point of points) {
    selectionOverlayContext.fillRect(point.x, point.y, 1, 1);
  }
  selectionOverlayContext.restore();
}
function markPreviewMetrics() {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return;
  metrics.textContent = `backend=reference-indexed \xB7 prep=0px \xB7 present=0px \xB7 journal=${journal.operations.length} \xB7 checkpoints=${journal.checkpoints.length} \xB7 allocatedTiles=${asset.raster.memoryMetrics().tileCount} \xB7 scope=PREVIEW_ONLY canonicalDirtyTiles=0`;
}
function markCanonicalMetrics() {
  if (!metrics.textContent.includes("scope=PREVIEW_ONLY")) return;
  metrics.textContent = metrics.textContent.replace("scope=PREVIEW_ONLY canonicalDirtyTiles=0", "scope=CANONICAL");
}
function hasLayerComposite() {
  return state.layers.length > 1 || state.layers.some((item) => item.kind === "TILEMAP") || state.cels.some((item) => item.assetId !== void 0 && item.assetId !== state.activeAssetId) || state.layers.some((item) => item.opacity !== 1 || item.blendMode !== "NORMAL" || !item.visible);
}
function tilemapSourcePixel(map, x, y) {
  if (x < 0 || y < 0 || x >= map.columns * map.cellSize || y >= map.rows * map.cellSize) return void 0;
  const cellX = Math.floor(x / map.cellSize);
  const cellY = Math.floor(y / map.cellSize);
  const cell = tilemapCellAt(map, cellX, cellY);
  if (cell === void 0) return void 0;
  const asset = state.assets[cell.sourceAssetId];
  if (asset === void 0) return void 0;
  let localX = x % map.cellSize;
  let localY = y % map.cellSize;
  if (cell.transform === "FLIP_X") localX = map.cellSize - 1 - localX;
  if (cell.transform === "FLIP_Y") localY = map.cellSize - 1 - localY;
  if (cell.transform === "ROTATE_90") {
    const rotatedX = map.cellSize - 1 - localY;
    localY = localX;
    localX = rotatedX;
  }
  const sourceX = cell.sourceX * map.cellSize + localX;
  const sourceY = cell.sourceY * map.cellSize + localY;
  if (sourceX < 0 || sourceY < 0 || sourceX >= asset.width || sourceY >= asset.height) {
    return void 0;
  }
  return {
    asset,
    colorIndex: asset.raster.getPixel(sourceX, sourceY)
  };
}
function paletteColorForRender(asset, paletteIndex) {
  if (asset.id === state.activeAssetId && paletteIndex === selectedColor && colorDraftDirty && colorDraft !== void 0) return argbFromRgb(colorDraft, colorDraftAlpha);
  return asset.palette[paletteIndex] ?? 0;
}
function compositeRegion(region, frameId = timelineSession.activeFrameId, previewOverrides) {
  const image = canonicalContext.createImageData(region.width, region.height);
  const orderedLayers = state.timeline.layerTrackOrder.map((layerTrackId) => state.layers.find((item) => item.layerTrackId === layerTrackId)).filter((item) => item !== void 0 && item.visible && item.opacity > 0);
  for (const layer2 of orderedLayers) {
    const tilemap2 = layer2.kind === "TILEMAP" ? state.tilemaps?.[tilemapIdFor(layer2.layerTrackId, frameId)] : void 0;
    const cel2 = state.cels.find((item) => item.layerTrackId === layer2.layerTrackId && item.frameId === frameId && item.lifecycle === "ACTIVE" && (item.assetId !== void 0 || tilemap2 !== void 0));
    const source = cel2?.assetId === void 0 ? void 0 : state.assets[cel2.assetId];
    if (source === void 0 && tilemap2 === void 0) continue;
    const pixels = source === void 0 ? void 0 : source.raster.readRegion(region.x, region.y, region.width, region.height).pixels;
    const pixelCount = region.width * region.height;
    for (let index = 0; index < pixelCount; index += 1) {
      const globalX = region.x + index % region.width;
      const globalY = region.y + Math.floor(index / region.width);
      const tilePixel = tilemap2 === void 0 ? void 0 : tilemapSourcePixel(tilemap2, globalX, globalY);
      const sourceAsset = tilePixel?.asset ?? source;
      const sourceColorIndex = tilePixel?.colorIndex ?? pixels?.[index];
      if (sourceAsset === void 0 || sourceColorIndex === void 0) continue;
      const previewColorIndex = previewOverrides !== void 0 && sourceAsset.id === previewOverrides.assetId && previewOverrides.transparentPixels.has(`${globalX},${globalY}`) ? 0 : sourceColorIndex;
      const sourceColor = decodeArgb(paletteColorForRender(sourceAsset, previewColorIndex));
      const sourceAlpha = sourceColor.alpha / 255 * layer2.opacity;
      if (sourceAlpha <= 0) continue;
      const target = index * 4;
      const destinationAlpha = (image.data[target + 3] ?? 0) / 255;
      const sourceRgb = [
        sourceColor.red / 255,
        sourceColor.green / 255,
        sourceColor.blue / 255
      ];
      const destinationRgb = [
        (image.data[target + 0] ?? 0) / 255,
        (image.data[target + 1] ?? 0) / 255,
        (image.data[target + 2] ?? 0) / 255
      ];
      const blendRgb = layer2.blendMode === "MULTIPLY" ? [
        sourceRgb[0] * destinationRgb[0],
        sourceRgb[1] * destinationRgb[1],
        sourceRgb[2] * destinationRgb[2]
      ] : sourceRgb;
      const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
      if (outputAlpha <= 0) continue;
      image.data[target] = Math.round((blendRgb[0] * sourceAlpha + destinationRgb[0] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha * 255);
      image.data[target + 1] = Math.round((blendRgb[1] * sourceAlpha + destinationRgb[1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha * 255);
      image.data[target + 2] = Math.round((blendRgb[2] * sourceAlpha + destinationRgb[2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha * 255);
      image.data[target + 3] = Math.round(outputAlpha * 255);
    }
  }
  return image;
}
var tilesetSourceRenderKey = "";
function renderTilesetSourceCanvas(asset) {
  if (tilesetSourceCanvas === null || tilesetSourceContext === null) return;
  const draftKey = colorDraftDirty && colorDraft !== void 0 ? `${colorDraft.r},${colorDraft.g},${colorDraft.b},${colorDraftAlpha}` : "none";
  const key = `${asset.id}:${asset.revision}:${selectedColor}:${draftKey}`;
  if (key === tilesetSourceRenderKey && tilesetSourceCanvas.width === asset.width && tilesetSourceCanvas.height === asset.height) return;
  if (tilesetSourceCanvas.width !== asset.width) {
    tilesetSourceCanvas.width = asset.width;
  }
  if (tilesetSourceCanvas.height !== asset.height) {
    tilesetSourceCanvas.height = asset.height;
  }
  const pixels = asset.raster.readRegion(0, 0, asset.width, asset.height).pixels;
  const image = tilesetSourceContext.createImageData(asset.width, asset.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const color = decodeArgb(paletteColorForRender(asset, pixels[index] ?? 0));
    image.data[index * 4] = color.red;
    image.data[index * 4 + 1] = color.green;
    image.data[index * 4 + 2] = color.blue;
    image.data[index * 4 + 3] = color.alpha;
  }
  tilesetSourceContext.putImageData(image, 0, 0);
  tilesetSourceCanvas.dataset.draw2SourceReady = "true";
  tilesetSourceRenderKey = key;
}
async function present(dirtyRegions = [], dirtyTiles = []) {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) throw new Error("Draw2 active asset is missing.");
  const regions = dirtyRegions.length > 0 ? dirtyRegions : [
    {
      assetId: asset.id,
      x: 0,
      y: 0,
      width: asset.width,
      height: asset.height
    }
  ];
  for (const region of regions) {
    const snapshot = asset.raster.readRegion(region.x, region.y, region.width, region.height);
    const image = hasLayerComposite() ? compositeRegion(region) : canonicalContext.createImageData(region.width, region.height);
    if (!hasLayerComposite()) {
      for (let index = 0; index < snapshot.pixels.length; index += 1) {
        const { alpha, red, green, blue } = decodeArgb(paletteColorForRender(asset, snapshot.pixels[index] ?? 0));
        const target = index * 4;
        image.data[target] = red;
        image.data[target + 1] = green;
        image.data[target + 2] = blue;
        image.data[target + 3] = alpha;
      }
    }
    canonicalContext.putImageData(image, region.x, region.y);
  }
  renderTilesetSourceCanvas(asset);
  const result = await renderer.render({
    state,
    assetId: asset.id,
    dirtyTiles,
    dirtyRegions,
    mode: dirtyRegions.length > 0 ? "DIRTY_REGIONS" : "FULL_REFRESH_GOLDEN"
  });
  const previewMetric = colorDraftDirty ? "scope=COLOR_PREVIEW canonicalDirtyTiles=0" : transformPreview === void 0 ? "scope=CANONICAL" : "scope=PREVIEW_ONLY canonicalDirtyTiles=0";
  metrics.textContent = `backend=${result.backendId} \xB7 prep=${result.preparationPixelCount}px \xB7 present=${result.presentPixelCount}px \xB7 journal=${journal.operations.length} \xB7 checkpoints=${journal.checkpoints.length} \xB7 allocatedTiles=${asset.raster.memoryMetrics().tileCount} \xB7 ${previewMetric}`;
  updatePixelGridOverlay();
  drawMiniPreviewProjection();
  drawOverlay();
}
async function presentPlaybackFrame(frameId, generation = playbackGeneration) {
  if (!playbackRunning || generation !== playbackGeneration) return;
  if (!state.timeline.frameOrder.includes(frameId)) return;
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return;
  const region = {
    x: 0,
    y: 0,
    width: asset.width,
    height: asset.height
  };
  canonicalContext.clearRect(0, 0, asset.width, asset.height);
  canonicalContext.putImageData(compositeRegion(region, frameId), 0, 0);
  canonicalContext.imageSmoothingEnabled = false;
  drawMiniPreviewProjection();
  drawOverlay();
}
async function presentAudioLinkedPlaybackFrame(frameId) {
  if (workspaceFrameElement?.dataset.creatorMode !== "AUDIO") return;
  if (!state.timeline.frameOrder.includes(frameId)) return;
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return;
  const region = {
    x: 0,
    y: 0,
    width: asset.width,
    height: asset.height
  };
  canonicalContext.clearRect(0, 0, asset.width, asset.height);
  canonicalContext.putImageData(compositeRegion(region, frameId), 0, 0);
  canonicalContext.imageSmoothingEnabled = false;
  drawMiniPreviewProjection();
  drawOverlay();
}
function currentBasicTool() {
  return toolSelect.value;
}
function mirrorAppliesToTool(tool) {
  return mirrorEnabled && mirrorHasActiveAxis() && [
    "pen",
    "pixel-pen",
    "eraser",
    "line",
    "rect",
    "rect-fill",
    "ellipse",
    "ellipse-fill",
    "circle",
    "circle-fill"
  ].includes(tool);
}
function mirrorWritesForTool(writes, asset, tool) {
  if (!mirrorAppliesToTool(tool)) return writes;
  mirrorGuide = normalizeMirrorGuide(asset);
  const reflectAxes = [
    ...mirrorAxes.x ? [
      "x"
    ] : [],
    ...mirrorAxes.y ? [
      "y"
    ] : [],
    ...mirrorAxes.diagonalDown ? [
      "diagonal-down"
    ] : [],
    ...mirrorAxes.diagonalUp ? [
      "diagonal-up"
    ] : []
  ];
  const reflectPoint = (point, axis) => {
    if (axis === "x") {
      return {
        x: mirrorGuide.x * 2 - point.x,
        y: point.y
      };
    }
    if (axis === "y") {
      return {
        x: point.x,
        y: mirrorGuide.y * 2 - point.y
      };
    }
    const maxX = Math.max(1, asset.width - 1);
    const maxY = Math.max(1, asset.height - 1);
    const normalizedX = point.x / maxX;
    const normalizedY = point.y / maxY;
    if (axis === "diagonal-down") {
      return {
        x: (normalizedY - mirrorGuide.diagonalDown) * maxX,
        y: (normalizedX + mirrorGuide.diagonalDown) * maxY
      };
    }
    return {
      x: (1 + mirrorGuide.diagonalUp - normalizedY) * maxX,
      y: (1 + mirrorGuide.diagonalUp - normalizedX) * maxY
    };
  };
  const unique = /* @__PURE__ */ new Map();
  for (const write of writes) {
    const points = [
      {
        x: write.x,
        y: write.y
      }
    ];
    for (const axis of reflectAxes) {
      const reflected = points.map((point) => reflectPoint(point, axis));
      points.push(...reflected);
    }
    for (const point of points) {
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (x < 0 || y < 0 || x >= asset.width || y >= asset.height) continue;
      unique.set(`${x}:${y}`, {
        x,
        y,
        colorIndex: write.colorIndex
      });
    }
  }
  return [
    ...unique.values()
  ].sort((left, right) => left.y - right.y || left.x - right.x);
}
function normalizeToolBounds(from, to, asset) {
  return normalizeBounds(from, to, asset);
}
function rectanglePointList(bounds) {
  const points = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      points.push({
        x,
        y
      });
    }
  }
  return points;
}
function selectionSnapshotFromPoints(points, kind) {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0 || points.length === 0) return void 0;
  const unique = new Map(points.map((point) => [
    `${point.x}:${point.y}`,
    point
  ]));
  const selected = [
    ...unique.values()
  ];
  if (selected.length === 0) return void 0;
  const minX = Math.min(...selected.map((point) => point.x));
  const minY = Math.min(...selected.map((point) => point.y));
  const maxX = Math.max(...selected.map((point) => point.x));
  const maxY = Math.max(...selected.map((point) => point.y));
  return {
    selectionId: `selection-${state.projectId}-${Date.now()}`,
    mask: {
      kind,
      regions: [
        {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1
        }
      ],
      selectionVersion: (selection?.mask.selectionVersion ?? 0) + 1
    },
    scope: {
      assetId: asset.id,
      layerId: state.activeLayerId,
      frameId: state.activeFrameId,
      celId: state.activeCelId
    },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state.structureEpoch,
    pixels: selected.map((point) => ({
      x: point.x,
      y: point.y,
      colorIndex: asset.raster.getPixel(point.x, point.y)
    }))
  };
}
function activeRasterRevision(snapshot) {
  return snapshot.assets[snapshot.activeAssetId]?.revision;
}
function selectionScopeMatchesActiveCel(snapshot = selection) {
  if (snapshot === void 0) return true;
  return snapshot.scope.assetId === state.activeAssetId && snapshot.scope.layerId === state.activeLayerId && snapshot.scope.frameId === state.activeFrameId && snapshot.scope.celId === state.activeCelId && snapshot.sourceStructureEpoch === state.structureEpoch;
}
function timelineCommandInvalidatesSelection(before, after) {
  return before.activeAssetId !== after.activeAssetId || before.activeLayerId !== after.activeLayerId || before.activeFrameId !== after.activeFrameId || before.activeCelId !== after.activeCelId || before.structureEpoch !== after.structureEpoch || activeRasterRevision(before) !== activeRasterRevision(after);
}
function hasUncommittedSelectionWork() {
  return selectionDrag !== void 0 || selectionDraft !== void 0 || pendingSelectionGesture !== void 0 || transformSession !== void 0 || transformPreview !== void 0 || pasteMode;
}
function cancelUncommittedSelectionWork(message) {
  if (!hasUncommittedSelectionWork()) return false;
  selectionInteractionGeneration += 1;
  if (selectionDrag !== void 0 && canvas.hasPointerCapture(selectionDrag.pointerId)) canvas.releasePointerCapture(selectionDrag.pointerId);
  if (pendingSelectionGesture !== void 0 && canvas.hasPointerCapture(pendingSelectionGesture.pointerId)) canvas.releasePointerCapture(pendingSelectionGesture.pointerId);
  selectionDrag = void 0;
  selectionDraft = void 0;
  pendingSelectionGesture = void 0;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  updateSelectionActionButtons();
  updateSelectionStatus(selection === void 0 ? `scope=${state.activeCelId} \xB7 selection=none` : `scope=${selection.scope.celId} \xB7 ${selection.pixels.length}px \xB7 ${selection.mask.kind} \xB7 preview=cancelled`);
  drawOverlay();
  markCanonicalMetrics();
  if (message !== void 0) setStatus(message);
  return true;
}
function selectActiveCelContentForMove() {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) {
    setStatus("Active raster is missing.", "error");
    return false;
  }
  const picked = selectByOpaque(asset.raster, asset.palette);
  const next = selectionSnapshotFromPoints(picked.pixels, "alpha");
  if (next === void 0) {
    setStatus("The active timeline cell has no visible pixels to move.", "error");
    return false;
  }
  selectionInteractionGeneration += 1;
  selection = next;
  selectionDraft = void 0;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  const region = next.mask.regions[0];
  if (region !== void 0) {
    selectionX.value = String(region.x);
    selectionY.value = String(region.y);
    selectionWidth.value = String(region.width);
    selectionHeight.value = String(region.height);
  }
  updateSelectionActionButtons();
  updateSelectionStatus(`scope=${next.scope.celId} \xB7 ${next.pixels.length}px \xB7 auto-selected active cel content`);
  notifyAssetStateChanged();
  drawOverlay();
  return true;
}
function beginSelectionDraft(next, mode, message) {
  selectionDraft = {
    snapshot: next,
    mode,
    message
  };
  const pixelCount = next?.pixels.length ?? 0;
  updateSelectionStatus(`draft=${selectionModeLabel(mode)} \xB7 ${pixelCount}px \xB7 confirm or Esc to cancel`);
  updateSelectionActionButtons();
  drawOverlay();
  setStatus(pixelCount === 0 ? "Selection draft is empty; confirm to clear the selection." : `${message} \xB7 draft only; confirm to apply.`);
}
function commitSelectionDraft() {
  if (selectionDraft === void 0) {
    setStatus("No selection draft to confirm.", "error");
    return;
  }
  const draft = selectionDraft;
  selectionInteractionGeneration += 1;
  selectionDraft = void 0;
  selection = draft.snapshot;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  const region = selection?.mask.regions[0];
  if (region !== void 0) {
    selectionX.value = String(region.x);
    selectionY.value = String(region.y);
    selectionWidth.value = String(region.width);
    selectionHeight.value = String(region.height);
  }
  if (selection === void 0) {
    updateSelectionStatus(`scope=${state.activeCelId} \xB7 selection=none \xB7 confirmed clear`);
    setStatus("Selection cleared; Canonical Raster unchanged.");
  } else {
    updateSelectionStatus(`scope=${selection.scope.celId} \xB7 ${selection.pixels.length}px \xB7 ${selection.mask.kind} \xB7 preview=none`);
    setStatus(`${draft.message} \xB7 selection confirmed.`);
  }
  updateSelectionActionButtons();
  drawOverlay();
  notifyAssetStateChanged();
}
function cancelSelectionDraft(message = "Selection draft cancelled; Canonical Raster unchanged.") {
  if (selectionDraft === void 0 && pendingSelectionGesture === void 0) {
    return;
  }
  selectionInteractionGeneration += 1;
  selectionDraft = void 0;
  pendingSelectionGesture = void 0;
  updateSelectionActionButtons();
  updateSelectionStatus(selection === void 0 ? `scope=${state.activeCelId} \xB7 selection=none` : `scope=${selection.scope.celId} \xB7 ${selection.pixels.length}px \xB7 preview=none`);
  drawOverlay();
  setStatus(message);
}
function selectionSnapshotForPoints(points, kind, mode) {
  const combined = combineSelectionPoints(selectionPointsFromSnapshot(selection), points, mode);
  return selectionSnapshotFromPoints(combined, kind);
}
function beginSelectionFromPoints(points, kind, mode, message) {
  beginSelectionDraft(selectionSnapshotForPoints(points, kind, mode), mode, message);
}
function applySelectionMorphology(operation) {
  if (selection === void 0) {
    setStatus("Create a selection before applying selection morphology.", "error");
    return;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) {
    setStatus("Active raster is missing.", "error");
    return;
  }
  const base = createSelectionMask(asset.width, asset.height, selection.pixels);
  const nextMask = operation === "EXPAND" ? selectionExpand(base) : operation === "SHRINK" ? selectionShrink(base) : operation === "INVERT" ? selectionInvert(base) : selectionBorder(base);
  const points = [];
  for (let y = 0; y < nextMask.height; y += 1) {
    for (let x = 0; x < nextMask.width; x += 1) {
      if (nextMask.selected[y * nextMask.width + x] === 1) {
        points.push({
          x,
          y
        });
      }
    }
  }
  const kind = selection.mask.kind;
  const next = selectionSnapshotFromPoints(points, kind);
  if (next === void 0) {
    selection = void 0;
    updateSelectionStatus(`scope=${state.activeCelId} \xB7 selection=none`);
  } else {
    selection = next;
    const region = next.mask.regions[0];
    if (region !== void 0) {
      selectionX.value = String(region.x);
      selectionY.value = String(region.y);
      selectionWidth.value = String(region.width);
      selectionHeight.value = String(region.height);
    }
    updateSelectionStatus(`scope=${next.scope.celId} \xB7 ${next.pixels.length}px \xB7 ${operation.toLowerCase()} \xB7 preview=none`);
  }
  selectionInteractionGeneration += 1;
  transformSession = void 0;
  transformPreview = void 0;
  drawOverlay();
  notifyAssetStateChanged();
  setStatus(`Selection ${operation.toLowerCase()} applied locally; confirm a Transform to mutate pixels.`);
}
async function commitWriteSet(writes, sourceOperationType, toolForMirroring = currentBasicTool()) {
  if (timelineActivationPending) {
    setStatus("Timeline cell is changing; drawing was not committed.", "error");
    return;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0 || writes.length === 0) return;
  if (selection !== void 0 && !selectionScopeMatchesActiveCel()) {
    clearCommittedSelection("Selection cleared because it belongs to another timeline cel.");
    return;
  }
  const mirroredWrites = mirrorWritesForTool(writes, asset, toolForMirroring);
  const selectionKeys = selection === void 0 ? void 0 : new Set(selection.pixels.map(selectionPointKey));
  const committedWrites = selectionKeys === void 0 ? mirroredWrites : mirroredWrites.filter((write) => selectionKeys.has(selectionPointKey(write)));
  if (committedWrites.length === 0) return;
  const drawClientId = activeDrawClientId();
  const commandSequence = nextClientSequence(drawClientId);
  const before = state;
  const command = {
    commandId: `draw2-local-write-set-${commandSequence}`,
    commandType: "raster.writeSet",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: activeDrawActorId(),
    clientId: drawClientId,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: {
      writes: committedWrites
    }
  };
  const writeTimelineGeneration = timelineStateGeneration;
  const result = await core.execute(command);
  if (writeTimelineGeneration !== timelineStateGeneration) {
    syncClientSequencesFromState();
    setStatus("Timeline cell changed while drawing; the old-cell write was discarded.", "error");
    return;
  }
  if (!result.ok) {
    syncClientSequencesFromState();
    setStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
    return;
  }
  state = result.state;
  history.record(before, state, result.result.operation.operationId, result.result.operation.operationType);
  renderTimeline();
  saveDrawProjectState();
  await autosave.record(state, result.result);
  publishDrawRasterCommit(result.result, state, before.structureEpoch);
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateHistoryButtons();
  setStatus(`${sourceOperationType} committed \xB7 ${committedWrites.length}px${mirrorEnabled && mirrorHasActiveAxis() ? ` \xB7 mirror=${mirrorAxisSummary()}` : ""} \xB7 one undo`);
}
function resizeRasterForCanvas(asset, plan) {
  const resized = IndexedTileRaster.empty(plan.newWidth, plan.newHeight, asset.raster.tileSize);
  if (plan.copyWidth < 1 || plan.copyHeight < 1) return resized;
  const source = asset.raster.readRegion(plan.sourceX, plan.sourceY, plan.copyWidth, plan.copyHeight).pixels;
  for (let y = 0; y < plan.copyHeight; y += 1) {
    for (let x = 0; x < plan.copyWidth; x += 1) {
      const colorIndex = source[y * plan.copyWidth + x] ?? 0;
      if (colorIndex === 0) continue;
      resized.setPixel(asset.id, plan.destinationX + x, plan.destinationY + y, colorIndex);
    }
  }
  return resized;
}
function resizeProjectState(previous, settings) {
  const assets = {};
  for (const [id, asset] of Object.entries(previous.assets)) {
    const plan = calculateCanvasResizePlan({
      oldWidth: asset.width,
      oldHeight: asset.height,
      newWidth: settings.width,
      newHeight: settings.height,
      anchor: settings.anchor
    });
    assets[id] = {
      ...asset,
      width: settings.width,
      height: settings.height,
      raster: resizeRasterForCanvas(asset, plan),
      revision: asset.revision + 1
    };
  }
  return {
    ...previous,
    name: `Draw2 ${previous.projectId}`,
    structureEpoch: previous.structureEpoch + 1,
    assets,
    appliedCommandIds: [],
    lastClientSequenceByClient: {}
  };
}
function currentCanvasResizePlan() {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return void 0;
  try {
    return calculateCanvasResizePlan({
      oldWidth: asset.width,
      oldHeight: asset.height,
      newWidth: Math.max(1, Math.min(4096, Math.round(Number(canvasSettingsWidth.value) || 1))),
      newHeight: Math.max(1, Math.min(4096, Math.round(Number(canvasSettingsHeight.value) || 1))),
      anchor: canvasResizeAnchor
    });
  } catch {
    return void 0;
  }
}
function syncCanvasResizePreview() {
  const plan = currentCanvasResizePlan();
  if (plan === void 0) return;
  canvasResizeSummary.value = describeCanvasResizePlan(plan);
  for (const button of canvasResizeAnchorElements) {
    const active = button.dataset.canvasResizeAnchor === canvasResizeAnchor;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  const scale = Math.min(220 / Math.max(1, plan.newWidth), 140 / Math.max(1, plan.newHeight));
  canvasResizePreviewFrame.style.width = `${Math.max(18, Math.round(plan.newWidth * scale))}px`;
  canvasResizePreviewFrame.style.height = `${Math.max(18, Math.round(plan.newHeight * scale))}px`;
  canvasResizePreviewContent.style.width = `${Math.max(1, Math.round(plan.oldWidth * scale))}px`;
  canvasResizePreviewContent.style.height = `${Math.max(1, Math.round(plan.oldHeight * scale))}px`;
  canvasResizePreviewContent.style.left = `${Math.round(plan.offsetX * scale)}px`;
  canvasResizePreviewContent.style.top = `${Math.round(plan.offsetY * scale)}px`;
}
async function resetProject(options = {}) {
  if (playbackRunning) stopTimelinePlayback("");
  flushDraw2EditorPreferences();
  const isNewProject = options.mode === "NEW";
  const forceCreate = options.forceCreate === true || isNewProject;
  const requestedProjectId = ((isNewProject ? options.projectIdOverride : options.forceCreate ? state.projectId : options.projectIdOverride ?? projectIdInput.value) ?? "").trim() || DEFAULT_WORKSPACE_PROJECT_ID;
  const projectId = normalizeWorkspaceProjectId(requestedProjectId);
  draw2EditorPreferencesReady = false;
  if (state.projectId !== projectId || forceCreate) {
    await flushDrawPersistence();
  }
  const persistedRecord = await drawPersistenceStore.load(projectId);
  let restored;
  if (persistedRecord !== null && !forceCreate) {
    try {
      restored = await restoreDraw2PersistenceRecord(persistedRecord, projectId);
      document.body.dataset.drawPersistenceState = "restored";
    } catch {
      document.body.dataset.drawPersistenceState = "recovery-fallback";
    }
  }
  drawPersistenceRevision = persistedRecord?.revision ?? 0;
  const parsedTileSize = Number(options.tileSize ?? tileSizeSelect.value);
  const tileSize = parsedTileSize === 64 ? 64 : 32;
  const createOptions = {
    projectId,
    name: `Draw2 ${projectId}`,
    width: options.width ?? 256,
    height: options.height ?? 256,
    tileSize
  };
  const anchor = options.anchor ?? canvasResizeAnchor;
  const preserveCurrentArt = options.forceCreate === true && !isNewProject && projectId === state.projectId && options.width !== void 0 && options.height !== void 0;
  state = preserveCurrentArt ? resizeProjectState(state, {
    width: createOptions.width,
    height: createOptions.height,
    tileSize,
    anchor
  }) : forceCreate ? repository.create(createOptions) : restored?.state ?? repository.open(projectId) ?? repository.create(createOptions);
  assetDefinitions = forceCreate ? [] : (restored?.assetDefinitions ?? []).map(cloneAssetDefinitionEntry);
  assetDefinitionSequence = 0;
  repository.save(state);
  projectIdInput.value = projectId;
  tileSizeSelect.value = String(tileSize);
  core = new EditorCore(state, {
    instrumentation
  });
  history = new LocalUndoRedoHistory(state);
  syncClientSequencesFromState();
  selectionInteractionGeneration += 1;
  selection = void 0;
  selectionDraft = void 0;
  pendingSelectionGesture = void 0;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  clipboard = void 0;
  selectedTileSource = void 0;
  tilesetSourceRenderKey = "";
  lastTilemapGridLayoutKey = "";
  timelineSession = createTimelineSession(state);
  timelineViewportInitialized = false;
  structureClientSequence = 0;
  onionSkinEnabled = false;
  onionSkinPreviousFrames = 1;
  onionSkinNextFrames = 1;
  onionSkinOpacity = 0.5;
  onionSkinColorMode = "TINTED";
  onionSkinCache = void 0;
  restoreDraw2TimelineMetadata(restored?.timelineMetadata);
  linkedCelBindings = [];
  journal.operations.length = 0;
  journal.dirtyTileWrites.length = 0;
  journal.checkpoints.length = 0;
  if (restored !== void 0) {
    history.restore(restored.history);
    journal.operations.push(...persistedRecord?.journal.operations ?? []);
    for (const write of persistedRecord?.journal.dirtyTileWrites ?? []) {
      journal.dirtyTileWrites.push({
        assetId: write.assetId,
        tiles: write.tiles.map((tile) => ({
          tileKey: tile.tileKey,
          bytes: Uint8Array.from(tile.bytes)
        }))
      });
    }
    journal.checkpoints.push(state);
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) throw new Error("Draw2 active asset is missing.");
  syncRasterCanvasDimensions(asset.width, asset.height);
  restoreDraw2EditorPreferencesForProject(projectId, asset);
  renderPaletteButtons(asset.palette);
  await present();
  syncExportPanel();
  syncColorEditorFromSelection();
  updatePlaybackLoopControl();
  renderTimeline();
  const restoredHistory = history.snapshot();
  updateSelectionStatus(`scope=${state.activeCelId} \xB7 selection=none \xB7 undo=${restoredHistory.undo.length} \xB7 redo=${restoredHistory.redo.length}`);
  notifyAssetStateChanged();
  updateHistoryButtons();
  writeActiveWorkspaceProjectId(projectId);
  await workspaceManifestStore.updateModule(projectId, "draw", restored !== void 0 && persistedRecord !== null ? {
    status: "READY",
    revision: persistedRecord.revision,
    stateHash: persistedRecord.stateHash,
    savedAt: persistedRecord.savedAt
  } : {
    status: "EMPTY",
    revision: 0,
    stateHash: null,
    savedAt: null
  }, state.name);
  announceWorkspaceProjectChanged(window, {
    projectId,
    name: state.name,
    kind: isNewProject ? "NEW" : "OPEN"
  });
  rememberRecentProject(asWorkspaceProjectId(projectId), state.name);
  if (restored === void 0 || forceCreate || persistedRecord === null) {
    queueDrawPersistenceSave(isNewProject || options.forceCreate === true ? "new-project" : "recovery");
  }
  setStatus(isNewProject ? `Project ${projectId} created \xB7 blank Draw/Audio/Game state is being prepared.` : restored !== void 0 ? `Project ${projectId} restored \xB7 Draw autosave ready.` : `Project ${projectId} is open \xB7 Draw autosave ready.`);
}
function openCanvasSettingsDialog() {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return;
  canvasResizeAnchor = "CENTER";
  canvasSettingsProjectId.value = state.projectId;
  canvasSettingsWidth.value = String(asset.width);
  canvasSettingsHeight.value = String(asset.height);
  canvasSettingsTileSize.value = String(asset.raster.tileSize);
  syncCanvasResizePreview();
  canvasSettingsDialog.showModal();
  canvasSettingsWidth.focus();
  canvasSettingsWidth.select();
}
function projectIdCandidate() {
  const randomPart = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return asWorkspaceProjectId(`draw2-project-${Date.now().toString(36)}-${randomPart}`);
}
async function createFreshWorkspaceProjectId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = projectIdCandidate();
    const [drawRecord, manifest] = await Promise.all([
      drawPersistenceStore.load(candidate),
      workspaceManifestStore.load(candidate)
    ]);
    if (drawRecord === null && manifest === null) return candidate;
  }
  throw new Error("A new Project ID could not be reserved. Please try again.");
}
function openProjectDialog() {
  if (projectDialog.open) return;
  projectDialogId.value = state.projectId;
  projectDialogStatus.textContent = "Open restores the selected Project. New creates a separate blank Project with a fresh ID.";
  projectDialog.showModal();
  projectDialogId.focus();
  projectDialogId.select();
}
function readProjectDialogProjectId() {
  const requested = projectDialogId.value.trim() || state.projectId;
  try {
    return asWorkspaceProjectId(requested);
  } catch {
    throw new Error("Project ID must start with a letter or number and use only stable identifier characters.");
  }
}
function readCanvasProjectSettings() {
  const clampDimension = (value) => Math.max(1, Math.min(4096, Math.round(Number(value) || 1)));
  const projectId = canvasSettingsProjectId.value.trim() || "draw2-local-demo";
  const tileSize = canvasSettingsTileSize.value === "64" ? 64 : 32;
  return {
    projectId,
    width: clampDimension(canvasSettingsWidth.value),
    height: clampDimension(canvasSettingsHeight.value),
    tileSize,
    anchor: canvasResizeAnchor
  };
}
function downloadBytes(bytes, filename, mimeType) {
  const blob = new Blob([
    bytes.slice().buffer
  ], {
    type: mimeType
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
var exportProgressHideTimer;
function yieldToExportRenderer() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
function setExportProgress(update) {
  const percent = Math.max(0, Math.min(100, Math.round(update.percent)));
  exportProgress.hidden = false;
  exportProgress.dataset.state = update.state ?? (percent >= 100 ? "complete" : "active");
  exportProgressPercent.textContent = `${percent}%`;
  exportProgressTitle.textContent = update.title;
  exportProgressDetail.textContent = update.detail;
  exportProgressCurrent.textContent = update.current;
  exportProgressCount.textContent = `${update.completed}/${update.total}`;
  exportProgressBar.style.width = `${percent}%`;
  exportProgressTrack.setAttribute("aria-valuenow", String(percent));
  exportExecute.setAttribute("aria-busy", "true");
}
function hideExportProgress() {
  exportProgress.hidden = true;
  exportProgress.dataset.state = "idle";
  exportProgressBar.style.width = "0%";
  exportProgressTrack.setAttribute("aria-valuenow", "0");
  exportExecute.removeAttribute("aria-busy");
}
async function reportExportProgress(update) {
  setExportProgress(update);
  await yieldToExportRenderer();
}
function exportCategoryLabel(category) {
  switch (category) {
    case "image":
      return "Image";
    case "animation":
      return "Animation";
    case "audio":
      return "Audio";
    case "tiles":
      return "Tiles";
    case "project":
      return "Project";
    case "game":
      return "Game integration";
    default:
      return category;
  }
}
function exportCategoryIcon(category) {
  switch (category) {
    case "image":
      return "icon-image";
    case "animation":
      return "icon-sequence";
    case "audio":
      return "icon-wave";
    case "tiles":
      return "icon-sheet";
    case "project":
      return "icon-file";
    case "game":
      return "icon-export";
    default:
      return "icon-export";
  }
}
function exportFormatIcon(format) {
  switch (format) {
    case "png":
    case "jpeg":
    case "webp":
    case "avif":
    case "bmp":
    case "tiff":
    case "svg":
      return "icon-image";
    case "pxd":
      return "icon-file";
    case "gif":
    case "apng":
    case "webm":
    case "wav":
    case "audio-webm":
    case "audio-ogg":
    case "sprite-sheet":
      return "icon-sequence";
    case "atlas-json":
    case "tileset":
      return "icon-sheet";
    case "glb":
      return "icon-export";
    default:
      return "icon-export";
  }
}
function createExportIcon(symbol, className = "draw2-ui-icon") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `./assets/icons/draw2-icons.svg#${symbol}`);
  svg.append(use);
  return svg;
}
function safeExportBaseName() {
  const fallback = state.name.trim() || state.projectId;
  return (exportName.value.trim() || fallback).replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "pixieed-project";
}
function exportArtifactFilename(baseName, format) {
  switch (format) {
    case "sprite-sheet":
      return `${baseName}-spritesheet.png`;
    case "atlas-json":
      return `${baseName}.atlas.json`;
    case "tileset":
      return `${baseName}-tileset.png`;
    case "audio-webm":
      return `${baseName}-audio.webm`;
    default:
      return `${baseName}.${exportFormatDefinition(format).extension}`;
  }
}
function syncExportScaleOptions() {
  const asset = state.assets[state.activeAssetId];
  const previous = Math.round(Number(exportScale.value));
  const options = asset === void 0 ? [
    1
  ] : pngExportScaleOptions(asset.width, asset.height);
  const selected = Number.isFinite(previous) && options.includes(previous) ? previous : options[options.length - 1] ?? 1;
  exportScale.replaceChildren();
  for (const scale of options) {
    const option = document.createElement("option");
    option.value = String(scale);
    option.textContent = `${scale}\xD7`;
    if (asset !== void 0) {
      option.title = `${asset.width * scale}\xD7${asset.height * scale}px`;
    }
    exportScale.append(option);
  }
  exportScale.value = String(selected);
  const maxScale = options[options.length - 1] ?? 1;
  exportScale.setAttribute("aria-label", `Scale \xB7 maximum ${maxScale}\xD7`);
  exportScale.title = asset === void 0 ? "Scale" : `Nearest-neighbour \xB7 maximum ${maxScale}\xD7 \xB7 ${asset.width * maxScale}\xD7${asset.height * maxScale}px`;
  const hint = exportScale.closest("label")?.querySelector("small");
  if (hint !== null && hint !== void 0) {
    hint.textContent = `\u6700\u5927 ${maxScale}\xD7`;
  }
}
function readExportScale() {
  const value = Math.round(Number(exportScale.value));
  const asset = state.assets[state.activeAssetId];
  const maxScale = asset === void 0 ? 1 : pngExportScaleOptions(asset.width, asset.height).at(-1) ?? 1;
  return Number.isFinite(value) ? Math.max(1, Math.min(maxScale, value)) : 1;
}
function selectedExportDefinitions() {
  return visibleExportFormats().filter((definition) => selectedExportFormats.has(definition.id));
}
function browserWebmMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") return void 0;
  if (typeof AudioContext === "undefined" || typeof AudioContext.prototype.createMediaStreamDestination !== "function") return void 0;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}
function browserAudioMimeType(format) {
  if (typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined" || typeof AudioContext.prototype.createMediaStreamDestination !== "function") return void 0;
  const candidates = format === "audio-webm" ? [
    "audio/webm;codecs=opus",
    "audio/webm"
  ] : [
    "audio/ogg;codecs=opus",
    "audio/ogg"
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}
function browserExportFormatSupported(format) {
  if (format === "webm") return browserWebmMimeType() !== void 0;
  if (format === "audio-webm" || format === "audio-ogg") {
    return browserAudioMimeType(format) !== void 0;
  }
  if (format !== "jpeg" && format !== "webp" && format !== "avif") return true;
  try {
    const dataUrl = exportPreviewCanvas.toDataURL(exportFormatDefinition(format).mimeType);
    return dataUrl.startsWith(`data:${exportFormatDefinition(format).mimeType}`);
  } catch {
    return false;
  }
}
function renderExportFormatCards() {
  exportFormatCards.replaceChildren();
  const categories = [
    "image",
    "animation",
    "audio",
    "tiles",
    "project",
    "game"
  ];
  for (const category of categories) {
    const definitions = visibleExportFormats().filter((definition) => definition.category === category);
    if (definitions.length === 0) continue;
    const categoryElement = document.createElement("details");
    categoryElement.className = "draw2-export-format-category";
    categoryElement.dataset.exportCategory = category;
    categoryElement.open = definitions.some((definition) => selectedExportFormats.has(definition.id));
    const categoryHeading = document.createElement("summary");
    categoryHeading.className = "draw2-export-category-heading";
    categoryHeading.append(createExportIcon(exportCategoryIcon(category), "draw2-ui-icon draw2-export-category-icon"));
    const categoryCopy = document.createElement("span");
    categoryCopy.className = "draw2-export-category-copy";
    const heading = document.createElement("h5");
    heading.textContent = exportCategoryLabel(category);
    const categoryHint = document.createElement("small");
    categoryHint.textContent = category === "image" ? "\u9759\u6B62\u753B\u3068\u3057\u3066\u4FDD\u5B58" : category === "project" ? "\u7DE8\u96C6\u53EF\u80FD\u306A\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8" : category === "animation" ? "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3\u304B\u3089\u753B\u50CF\u3092\u751F\u6210" : category === "tiles" ? "\u30BF\u30A4\u30EB\u7D20\u6750\u3068\u3057\u3066\u4FDD\u5B58" : category === "audio" ? "\u73FE\u5728\u306E\u30DF\u30C3\u30AF\u30B9\u72B6\u614B\u3092\u97F3\u6E90\u3068\u3057\u3066\u4FDD\u5B58" : "\u9023\u643A\u7528\u306E\u51FA\u529B\u5F62\u5F0F";
    categoryCopy.append(heading, categoryHint);
    categoryHeading.append(categoryCopy);
    const categoryCount = document.createElement("span");
    categoryCount.className = "draw2-export-category-count";
    categoryCount.textContent = `${definitions.length} format${definitions.length === 1 ? "" : "s"}`;
    categoryHeading.append(categoryCount);
    categoryElement.append(categoryHeading);
    const cards = document.createElement("div");
    cards.className = "draw2-export-format-grid";
    for (const definition of definitions) {
      const runtimeSupported = definition.supported && browserExportFormatSupported(definition.id);
      if (!runtimeSupported) selectedExportFormats.delete(definition.id);
      const card = document.createElement("div");
      card.className = "draw2-export-format-card";
      card.dataset.exportFormat = definition.id;
      card.setAttribute("role", "checkbox");
      card.tabIndex = 0;
      card.title = runtimeSupported ? definition.description : `${definition.description} \xB7 \u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3067\u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093`;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = definition.id;
      input.checked = selectedExportFormats.has(definition.id);
      input.disabled = !runtimeSupported;
      input.setAttribute("aria-label", `${definition.label}: ${definition.description}`);
      input.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      input.addEventListener("change", () => {
        if (input.checked) selectedExportFormats.add(definition.id);
        else selectedExportFormats.delete(definition.id);
        card.setAttribute("aria-checked", String(input.checked));
        window.setTimeout(() => syncExportPanel(), 0);
      });
      const icon = document.createElement("span");
      icon.className = "draw2-export-format-icon";
      icon.dataset.format = definition.id;
      icon.append(createExportIcon(exportFormatIcon(definition.id), "draw2-ui-icon draw2-export-format-icon__svg"));
      const copy = document.createElement("span");
      copy.className = "draw2-export-format-copy";
      const label = document.createElement("strong");
      label.textContent = definition.label;
      const description = document.createElement("small");
      description.textContent = definition.description;
      copy.append(label, description);
      const check = document.createElement("span");
      check.className = "draw2-export-format-check";
      check.append(createExportIcon("icon-check"));
      card.append(input, icon, copy, check);
      card.setAttribute("aria-checked", String(input.checked));
      const toggleCard = () => {
        input.checked = !input.checked;
        input.dispatchEvent(new Event("change", {
          bubbles: true
        }));
      };
      card.addEventListener("click", (event) => {
        if (event.target === input) return;
        toggleCard();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        toggleCard();
      });
      cards.append(card);
    }
    categoryElement.append(cards);
    exportFormatCards.append(categoryElement);
  }
}
function renderExportFormatOptions() {
  exportFormatOptions.replaceChildren();
  const definitions = selectedExportDefinitions();
  if (definitions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "draw2-export-empty";
    empty.textContent = "Select at least one format.";
    exportFormatOptions.append(empty);
    return;
  }
  for (const definition of definitions) {
    const option = document.createElement("div");
    option.className = "draw2-export-format-option";
    option.dataset.exportFormat = definition.id;
    const icon = document.createElement("span");
    icon.className = "draw2-export-option-icon";
    icon.append(createExportIcon(exportFormatIcon(definition.id), "draw2-ui-icon"));
    const copy = document.createElement("span");
    copy.className = "draw2-export-option-copy";
    const heading = document.createElement("strong");
    heading.textContent = definition.label;
    const detail = document.createElement("span");
    detail.textContent = definition.id === "png" ? "Pixel-perfect nearest-neighbour scale is applied." : definition.id === "jpeg" ? "Transparency is composited onto a white background." : definition.id === "webp" ? "Browser-native compression keeps the output lightweight." : definition.id === "avif" ? "Uses the browser's AVIF encoder when available." : definition.id === "gif" ? "Timeline frames become a looping indexed animation." : definition.id === "apng" ? "Timeline frames keep full RGBA transparency." : definition.id === "webm" ? "Visible Draw frames and the selected Audio tracks are recorded together as WebM." : definition.id === "wav" ? "Selected BGM, SE, instrument lanes, mixer, effects, and automation are rendered to PCM WAV." : definition.id === "audio-webm" ? "Selected BGM, SE, and instrument lanes are encoded as audio-only WebM/Opus." : definition.id === "audio-ogg" ? "Selected Audio tracks are encoded as audio-only Ogg/Opus when supported." : definition.id === "svg" ? "Pixel shapes are emitted as crisp vector rectangles." : definition.id === "sprite-sheet" ? "Timeline frames are packed into a PNG atlas." : definition.id === "atlas-json" ? "Exports coordinates and frame timing for the PNG atlas." : definition.id === "tileset" ? "Exports the active indexed raster as a reusable tile source." : definition.id === "bmp" ? "Exports a broad-compatibility 32-bit bitmap." : definition.id === "tiff" ? "Exports an uncompressed RGBA TIFF for preservation." : "Draw / Audio / Game project modules are included when available.";
    copy.append(heading, detail);
    const badge = document.createElement("span");
    badge.className = "draw2-export-option-badge";
    badge.textContent = definition.extension.toUpperCase();
    option.append(icon, copy, badge);
    exportFormatOptions.append(option);
  }
}
function renderExportOutputPlan() {
  exportOutputFiles.replaceChildren();
  const definitions = selectedExportDefinitions();
  const baseName = safeExportBaseName();
  if (definitions.length === 0) {
    const empty = document.createElement("li");
    empty.className = "draw2-export-empty";
    empty.textContent = "No output selected.";
    exportOutputFiles.append(empty);
    return;
  }
  if (exportPackageMode === "zip" && definitions.length > 1) {
    const item = document.createElement("li");
    item.dataset.package = "zip";
    const names = definitions.map((definition) => exportArtifactFilename(baseName, definition.id));
    const primary = document.createElement("div");
    primary.className = "draw2-export-output-primary";
    primary.append(createExportIcon("icon-folder"));
    const name = document.createElement("strong");
    name.textContent = `${baseName}.zip`;
    primary.append(name);
    const badge = document.createElement("span");
    badge.className = "draw2-export-output-badge";
    badge.textContent = "ZIP";
    primary.append(badge);
    const detail = document.createElement("small");
    detail.textContent = `${names.length} files \xB7 ${names.join(", ")}`;
    item.append(primary, detail);
    exportOutputFiles.append(item);
    return;
  }
  for (const definition of definitions) {
    const item = document.createElement("li");
    item.dataset.format = definition.id;
    const primary = document.createElement("div");
    primary.className = "draw2-export-output-primary";
    primary.append(createExportIcon(exportFormatIcon(definition.id)));
    const name = document.createElement("strong");
    name.textContent = exportArtifactFilename(baseName, definition.id);
    primary.append(name);
    const badge = document.createElement("span");
    badge.className = "draw2-export-output-badge";
    badge.textContent = definition.extension.toUpperCase();
    primary.append(badge);
    const detail = document.createElement("small");
    detail.textContent = definition.supportsScale ? `${definition.label} \xB7 ${readExportScale()}\xD7 local output` : `${definition.label} \xB7 local project package`;
    item.append(primary, detail);
    exportOutputFiles.append(item);
  }
}
function renderExportPreview() {
  const canvas2 = exportPreviewCanvas;
  const context = canvas2.getContext("2d");
  if (context === null) return;
  const previewSize = 160;
  canvas2.width = previewSize;
  canvas2.height = previewSize;
  context.clearRect(0, 0, previewSize, previewSize);
  const checkerSize = 10;
  for (let y = 0; y < previewSize; y += checkerSize) {
    for (let x = 0; x < previewSize; x += checkerSize) {
      context.fillStyle = (x / checkerSize + y / checkerSize) % 2 === 0 ? "#202a36" : "#2a3542";
      context.fillRect(x, y, checkerSize, checkerSize);
    }
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) {
    exportPreviewSummary.textContent = "No active asset";
    return;
  }
  const scale = Math.min(144 / Math.max(1, asset.width), 144 / Math.max(1, asset.height));
  const offsetX = (previewSize - asset.width * scale) / 2;
  const offsetY = (previewSize - asset.height * scale) / 2;
  const previewImage = hasLayerComposite() ? compositeRegion({
    x: 0,
    y: 0,
    width: asset.width,
    height: asset.height
  }) : (() => {
    const image = context.createImageData(asset.width, asset.height);
    const indexed = asset.raster.toUint8Array();
    for (let index = 0; index < indexed.length; index += 1) {
      const color = decodeArgb(paletteColorForRender(asset, indexed[index] ?? 0));
      image.data[index * 4] = color.red;
      image.data[index * 4 + 1] = color.green;
      image.data[index * 4 + 2] = color.blue;
      image.data[index * 4 + 3] = color.alpha;
    }
    return image;
  })();
  context.imageSmoothingEnabled = false;
  for (let y = 0; y < asset.height; y += 1) {
    for (let x = 0; x < asset.width; x += 1) {
      const offset = (y * asset.width + x) * 4;
      const red = previewImage.data[offset] ?? 0;
      const green = previewImage.data[offset + 1] ?? 0;
      const blue = previewImage.data[offset + 2] ?? 0;
      const alpha = previewImage.data[offset + 3] ?? 0;
      if (alpha === 0) continue;
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
      context.fillRect(Math.floor(offsetX + x * scale), Math.floor(offsetY + y * scale), Math.max(1, Math.ceil(scale)), Math.max(1, Math.ceil(scale)));
    }
  }
  const scaleApplies = selectedExportDefinitions().some((definition) => definition.supportsScale);
  const exportScaleValue = scaleApplies ? readExportScale() : 1;
  exportPreviewSummary.textContent = scaleApplies ? `${asset.width * exportScaleValue}\xD7${asset.height * exportScaleValue} \xB7 ${exportScaleValue}\xD7` : `${asset.width}\xD7${asset.height} \xB7 project data`;
}
function readExportState() {
  return {
    name: exportName.value.trim(),
    selectedFormats: selectedExportDefinitions().map((definition) => definition.id),
    scale: readExportScale(),
    packageMode: exportPackageMode,
    options: {}
  };
}
function syncExportPanel() {
  syncExportScaleOptions();
  const definitions = selectedExportDefinitions();
  exportScale.disabled = !definitions.some((definition) => definition.supportsScale);
  exportSelectionSummary.textContent = `${definitions.length} selected`;
  const multiple = definitions.length > 1;
  exportPackageSection.hidden = !multiple;
  if (!multiple) {
    exportPackageMode = "single";
    exportPackageSingle.checked = true;
    exportPackageZip.checked = false;
  } else {
    exportPackageMode = "zip";
    exportPackageSingle.checked = false;
    exportPackageZip.checked = true;
  }
  renderExportFormatOptions();
  renderExportOutputPlan();
  renderExportPreview();
}
function setExportPanelStatus(message, kind = "ready") {
  exportPanelStatus.textContent = translateDraw2Text(message, draw2Locale);
  exportPanelStatus.dataset.state = kind;
}
async function createBrowserRasterArtifact(exportModule, format, baseName, scale) {
  const definition = exportFormatDefinition(format);
  const raster = exportModule.exportRasterRgba(state, state.activeAssetId, {
    scale
  });
  const canvas2 = document.createElement("canvas");
  canvas2.width = raster.width;
  canvas2.height = raster.height;
  const context = canvas2.getContext("2d");
  if (context === null) {
    throw new Error(`${definition.label} encoder could not acquire Canvas2D.`);
  }
  const rgba = format === "jpeg" ? exportModule.flattenRgba(raster.rgba) : raster.rgba;
  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), raster.width, raster.height), 0, 0);
  const blob = await new Promise((resolve) => {
    canvas2.toBlob(resolve, definition.mimeType, format === "jpeg" ? 0.92 : 0.9);
  });
  if (blob === null || blob.type.toLowerCase() !== definition.mimeType) {
    throw new Error(`${definition.label} is not supported by this browser's image encoder. Try PNG or WebP.`);
  }
  return {
    format,
    filename: exportArtifactFilename(baseName, format),
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mimeType: definition.mimeType
  };
}
async function createPxdProjectArtifact(exportModule, baseName) {
  const workspace = getWorkspacePxdBridge();
  const snapshot = await workspace.exportProjectPxdSnapshot();
  const output = await exportModule.exportPxdProject(state, {
    assetDefinitions,
    drawTimelineMetadata: draw2TimelineMetadataSnapshot(),
    ...snapshot.audio === null ? {} : {
      audio: {
        schemaVersion: snapshot.audio.schemaVersion,
        record: snapshot.audio.record,
        assets: snapshot.audio.assets
      }
    },
    ...snapshot.game === null ? {} : {
      game: {
        schemaVersion: snapshot.game.schemaVersion,
        record: snapshot.game.record
      }
    }
  });
  return {
    format: "pxd",
    filename: `${baseName}.pxd`,
    bytes: output.bytes,
    mimeType: output.mimeType
  };
}
async function storePxdMarketTransfer(file) {
  if (!window.indexedDB || typeof File !== "function") {
    throw new Error("\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3067\u306FMarket\u3078\u306EPXD\u5F15\u304D\u7D99\u304E\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002PXD\u3092\u4FDD\u5B58\u3057\u3066\u304B\u3089Market\u3067\u8FFD\u52A0\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  }
  const transferId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await new Promise((resolve, reject2) => {
    const request = indexedDB.open("pixieed-market-project-transfers", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("transfers", {
        keyPath: "id"
      });
    };
    request.onerror = () => {
      reject2(request.error ?? new Error("Market transfer storage unavailable."));
    };
    request.onsuccess = () => {
      const database = request.result;
      let settled = false;
      const finish = (error2) => {
        if (settled) return;
        settled = true;
        database.close();
        if (error2 === void 0) resolve();
        else reject2(error2);
      };
      try {
        const transaction = database.transaction("transfers", "readwrite");
        transaction.objectStore("transfers").put({
          id: transferId,
          file,
          createdAt: Date.now(),
          expiresAt: Date.now() + 15 * 60 * 1e3
        });
        transaction.oncomplete = () => finish();
        transaction.onerror = () => finish(transaction.error ?? new Error("Market transfer storage write failed."));
        transaction.onabort = () => finish(transaction.error ?? new Error("Market transfer storage write aborted."));
      } catch (error2) {
        finish(error2);
      }
    };
  });
  return transferId;
}
async function handoffPxdProjectToMarket() {
  if (colorDraftDirty) {
    await commitColorEdit();
    if (colorDraftDirty) {
      setExportPanelStatus("\u8272\u306E\u5909\u66F4\u3092\u78BA\u5B9A\u3057\u3066\u304B\u3089Market\u3078\u6E21\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error");
      return;
    }
  }
  exportToMarket.disabled = true;
  setExportPanelStatus("Draw\u30FBAudio\u30FBGame\u3092\u542B\u3080PXD\u3092\u6E96\u5099\u3057\u3066\u3044\u307E\u3059\u2026");
  try {
    const exportModule = await loadExportModule();
    const artifact = await createPxdProjectArtifact(exportModule, safeExportBaseName());
    const file = new File([
      artifact.bytes.slice().buffer
    ], artifact.filename, {
      type: artifact.mimeType
    });
    const transferId = await storePxdMarketTransfer(file);
    const url = new URL("../market/sell.html", window.location.href);
    url.searchParams.set("project_transfer", transferId);
    window.location.assign(url.href);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Market\u3078\u306EPXD\u5F15\u304D\u7D99\u304E\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
    setExportPanelStatus(message, "error");
    setStatus(message, "error");
    exportToMarket.disabled = false;
  }
}
function waitForExportMilliseconds(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Math.round(milliseconds)));
  });
}
async function withDrawAudioExportDemand(operation) {
  window.dispatchEvent(new CustomEvent("draw2:audio-export-demand", {
    detail: {
      active: true,
      projectId: state.projectId
    }
  }));
  try {
    return await operation();
  } finally {
    window.dispatchEvent(new CustomEvent("draw2:audio-export-demand", {
      detail: {
        active: false,
        projectId: state.projectId
      }
    }));
  }
}
async function createAudioMediaArtifact(format, baseName, report, start, span, index, total) {
  const mimeType = browserAudioMimeType(format);
  if (mimeType === void 0) {
    throw new Error(format === "audio-ogg" ? "Ogg/Opus export is unavailable in this browser. Try WAV or WebM Audio." : "WebM Audio export is unavailable in this browser. Try WAV.");
  }
  const workspace = getWorkspacePxdBridge();
  if (typeof workspace.renderAudioWavForExport !== "function") {
    throw new Error("Audio render bridge is unavailable for audio export.");
  }
  const audioSnapshot = await withDrawAudioExportDemand(() => workspace.renderAudioWavForExport());
  if (audioSnapshot === null) {
    throw new Error("Audio Project has no audible content to export.");
  }
  const audioContext = new AudioContext();
  let source;
  let recorder;
  let sourceStarted = false;
  try {
    if (audioContext.state !== "running") await audioContext.resume();
    const audioBuffer = await audioContext.decodeAudioData(audioSnapshot.bytes.slice().buffer);
    const destination = audioContext.createMediaStreamDestination();
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(destination);
    const recorderInstance = new MediaRecorder(destination.stream, {
      mimeType
    });
    recorder = recorderInstance;
    const chunks = [];
    const encoded = new Promise((resolve, reject2) => {
      recorderInstance.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorderInstance.addEventListener("error", () => {
        reject2(new Error("MediaRecorder failed during audio export."));
      }, {
        once: true
      });
      recorderInstance.addEventListener("stop", () => {
        const blob2 = new Blob(chunks, {
          type: mimeType
        });
        if (blob2.size < 1) {
          reject2(new Error("MediaRecorder produced an empty audio file."));
        } else {
          resolve(blob2);
        }
      }, {
        once: true
      });
    });
    const sourceEnded = new Promise((resolve) => {
      source.addEventListener("ended", () => resolve(), {
        once: true
      });
    });
    recorderInstance.start(100);
    source.start();
    sourceStarted = true;
    await report({
      percent: start + span * 0.18,
      title: "\u97F3\u58F0\u3092\u66F8\u304D\u51FA\u3057\u4E2D",
      detail: "\u9078\u629E\u3057\u305FAudio\u30C8\u30E9\u30C3\u30AF\u3092\u30A8\u30F3\u30B3\u30FC\u30C9\u3057\u3066\u3044\u307E\u3059",
      current: format === "audio-ogg" ? "OGG / OPUS" : "WEBM / OPUS",
      completed: index,
      total
    });
    await Promise.race([
      sourceEnded,
      waitForExportMilliseconds(audioSnapshot.durationSeconds * 1e3 + 250)
    ]);
    await waitForExportMilliseconds(100);
    if (recorderInstance.state === "recording") recorderInstance.stop();
    const blob = await encoded;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const signature = format === "audio-webm" ? bytes.length >= 4 && bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163 : bytes.length >= 4 && bytes[0] === 79 && bytes[1] === 103 && bytes[2] === 103 && bytes[3] === 83;
    if (!signature) {
      throw new Error(format === "audio-webm" ? "MediaRecorder output is not a valid WebM audio container." : "MediaRecorder output is not a valid Ogg audio container.");
    }
    await report({
      percent: start + span * 0.96,
      title: "\u97F3\u58F0\u3092\u66F8\u304D\u51FA\u3057\u4E2D",
      detail: "\u97F3\u58F0\u30B3\u30F3\u30C6\u30CA\u3092\u691C\u8A3C\u3057\u3066\u3044\u307E\u3059",
      current: `${bytes.byteLength} bytes`,
      completed: index,
      total
    });
    return {
      format,
      filename: exportArtifactFilename(baseName, format),
      bytes,
      mimeType: blob.type || mimeType
    };
  } finally {
    if (recorder?.state === "recording") {
      try {
        recorder.stop();
      } catch {
      }
    }
    if (sourceStarted) {
      try {
        source?.stop();
      } catch {
      }
    }
    await audioContext.close().catch(() => void 0);
    await present().catch(() => void 0);
  }
}
async function createWebmVideoArtifact(baseName, report, start, span, index, total) {
  const mimeType = browserWebmMimeType();
  const asset = state.assets[state.activeAssetId];
  if (mimeType === void 0 || asset === void 0) {
    throw new Error("WebM export is unavailable in this browser. Use GIF or APNG instead.");
  }
  const frameIds = state.timeline.frameOrder.length > 0 ? [
    ...state.timeline.frameOrder
  ] : [
    state.activeFrameId
  ];
  const playbackFps = playbackFpsValue();
  const speedRatio = playbackFps / 24;
  const frameDurationsMs = frameIds.map((frameId) => {
    const frame2 = state.frames.find((item) => item.frameId === frameId);
    return Math.max(1, (frame2?.durationMs ?? 1e3 / playbackFps) / speedRatio);
  });
  const authoredDurationMs = frameDurationsMs.reduce((sum, duration) => sum + duration, 0);
  const durationSeconds = Math.max(0.1, authoredDurationMs / 1e3);
  const workspace = getWorkspacePxdBridge();
  if (typeof workspace.renderAudioWavForExport !== "function") {
    throw new Error("Audio render bridge is unavailable for WebM export.");
  }
  const audioSnapshot = await withDrawAudioExportDemand(() => workspace.renderAudioWavForExport(durationSeconds));
  const audioContext = new AudioContext();
  let source;
  let sourceStarted = false;
  let videoStream;
  let combinedStream;
  let recorder;
  try {
    if (audioContext.state !== "running") await audioContext.resume();
    let audioBuffer;
    if (audioSnapshot === null) {
      audioBuffer = audioContext.createBuffer(2, Math.max(1, Math.ceil(durationSeconds * audioContext.sampleRate)), audioContext.sampleRate);
    } else {
      audioBuffer = await audioContext.decodeAudioData(audioSnapshot.bytes.slice().buffer);
    }
    const audioDestination = audioContext.createMediaStreamDestination();
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioDestination);
    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = asset.width;
    videoCanvas.height = asset.height;
    const videoContext = videoCanvas.getContext("2d");
    if (videoContext === null) {
      throw new Error("WebM video canvas could not acquire Canvas2D.");
    }
    videoContext.imageSmoothingEnabled = false;
    const captureCanvas = videoCanvas;
    if (typeof captureCanvas.captureStream !== "function") {
      throw new Error("Canvas capture is unavailable for WebM export.");
    }
    videoStream = captureCanvas.captureStream(0);
    let videoTrack = videoStream.getVideoTracks()[0];
    let requestFrame = videoTrack?.requestFrame;
    if (typeof requestFrame !== "function") {
      videoStream.getTracks().forEach((track) => track.stop());
      videoStream = captureCanvas.captureStream(Math.max(1, Math.min(60, Math.round(playbackFps))));
      videoTrack = videoStream.getVideoTracks()[0];
      requestFrame = videoTrack?.requestFrame;
    }
    if (videoTrack === void 0) {
      throw new Error("WebM video track could not be created.");
    }
    combinedStream = new MediaStream();
    for (const track of videoStream.getVideoTracks()) {
      combinedStream.addTrack(track);
    }
    for (const track of audioDestination.stream.getAudioTracks()) {
      combinedStream.addTrack(track);
    }
    const recorderInstance = new MediaRecorder(combinedStream, {
      mimeType
    });
    recorder = recorderInstance;
    const chunks = [];
    const encoded = new Promise((resolve, reject2) => {
      recorderInstance.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorderInstance.addEventListener("error", () => {
        reject2(new Error("MediaRecorder failed during WebM export."));
      }, {
        once: true
      });
      recorderInstance.addEventListener("stop", () => {
        const blob2 = new Blob(chunks, {
          type: mimeType
        });
        if (blob2.size < 1) {
          reject2(new Error("MediaRecorder produced an empty WebM file."));
        } else {
          resolve(blob2);
        }
      }, {
        once: true
      });
    });
    recorderInstance.start(100);
    source.start();
    sourceStarted = true;
    for (let index2 = 0; index2 < frameIds.length; index2 += 1) {
      const frameId = frameIds[index2];
      const image = compositeRegion({
        x: 0,
        y: 0,
        width: asset.width,
        height: asset.height
      }, frameId);
      videoContext.putImageData(image, 0, 0);
      requestFrame?.call(videoTrack);
      if (index2 === 0 || index2 % 8 === 0 || index2 === frameIds.length - 1) {
        await report({
          percent: start + span * (0.08 + 0.82 * ((index2 + 1) / frameIds.length)),
          title: "\u52D5\u753B\uFF0B\u97F3\u58F0\u3092\u8A18\u9332\u4E2D",
          detail: "Draw\u30D5\u30EC\u30FC\u30E0\u3068Audio\u3092WebM\u3078\u540C\u671F\u3057\u3066\u3044\u307E\u3059",
          current: "F" + (index2 + 1) + "/" + frameIds.length,
          completed: index2,
          total
        });
      }
      await waitForExportMilliseconds(frameDurationsMs[index2] ?? 1);
    }
    const remainingTailMs = Math.max(0, durationSeconds * 1e3 - authoredDurationMs);
    if (remainingTailMs > 0) {
      requestFrame?.call(videoTrack);
      await waitForExportMilliseconds(remainingTailMs);
    }
    recorderInstance.stop();
    const blob = await encoded;
    if (sourceStarted) source.stop();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 26 || bytes[1] !== 69 || bytes[2] !== 223 || bytes[3] !== 163) {
      throw new Error("MediaRecorder output is not a valid WebM container.");
    }
    return {
      format: "webm",
      filename: exportArtifactFilename(baseName, "webm"),
      bytes,
      mimeType: blob.type || mimeType
    };
  } finally {
    if (recorder?.state === "recording") {
      try {
        recorder.stop();
      } catch {
      }
    }
    if (sourceStarted) {
      try {
        source?.stop();
      } catch {
      }
    }
    combinedStream?.getTracks().forEach((track) => track.stop());
    if (videoStream !== void 0 && videoStream !== combinedStream) {
      videoStream.getTracks().forEach((track) => track.stop());
    }
    await audioContext.close().catch(() => void 0);
    await present().catch(() => void 0);
  }
}
async function createExportArtifacts(exportModule, exportState, report) {
  const baseName = safeExportBaseName();
  const artifacts = [];
  const total = exportState.selectedFormats.length;
  for (const [index, format] of exportState.selectedFormats.entries()) {
    const definition = exportFormatDefinition(format);
    if (!definition.supported) {
      throw new Error(`${definition.label} is not available yet.`);
    }
    const start = 10 + index / total * 78;
    const span = 78 / total;
    await report({
      percent: start,
      title: "\u66F8\u304D\u51FA\u3057\u4E2D",
      detail: `${definition.label}\u3092\u6E96\u5099\u3057\u3066\u3044\u307E\u3059`,
      current: definition.extension.toUpperCase(),
      completed: index,
      total
    });
    if (format === "png") {
      const asset = state.assets[state.activeAssetId];
      const outputWidth = (asset?.width ?? 0) * exportState.scale;
      const outputHeight = (asset?.height ?? 0) * exportState.scale;
      const output = await exportModule.exportPng(state, state.activeAssetId, {
        scale: exportState.scale,
        onProgress: async (progress) => {
          await report({
            percent: start + progress * span * 0.92,
            title: "\u753B\u50CF\u3092\u751F\u6210\u4E2D",
            detail: progress < 0.68 ? `${exportState.scale}\xD7\u3078\u62E1\u5927\u3057\u3066\u3044\u307E\u3059` : `PNG\u30C7\u30FC\u30BF\u3092\u30A8\u30F3\u30B3\u30FC\u30C9\u3057\u3066\u3044\u307E\u3059 \xB7 ${outputWidth}\xD7${outputHeight}px`,
            current: `${definition.label} \xB7 ${outputWidth}\xD7${outputHeight}px`,
            completed: index,
            total
          });
        }
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType
      });
    } else if (format === "jpeg" || format === "webp" || format === "avif") {
      await report({
        percent: start + span * 0.35,
        title: "\u753B\u50CF\u3092\u751F\u6210\u4E2D",
        detail: `${definition.label}\u3092\u30D6\u30E9\u30A6\u30B6\u306E\u753B\u50CF\u30A8\u30F3\u30B3\u30FC\u30C0\u30FC\u3067\u5909\u63DB\u3057\u3066\u3044\u307E\u3059`,
        current: `${definition.label} \xB7 ${exportState.scale}\xD7`,
        completed: index,
        total
      });
      artifacts.push(await createBrowserRasterArtifact(exportModule, format, baseName, exportState.scale));
    } else if (format === "bmp") {
      const output = exportModule.exportBmp(state, state.activeAssetId, {
        scale: exportState.scale
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType
      });
    } else if (format === "tiff") {
      const output = exportModule.exportTiff(state, state.activeAssetId, {
        scale: exportState.scale
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType
      });
    } else if (format === "svg") {
      const output = exportModule.exportSvg(state, state.activeAssetId, {
        scale: exportState.scale
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType
      });
    } else if (format === "gif") {
      const output = exportModule.exportGif(state, {
        scale: exportState.scale
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType
      });
    } else if (format === "apng") {
      const output = exportModule.exportApng(state, {
        scale: exportState.scale
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType
      });
    } else if (format === "webm") {
      artifacts.push(await createWebmVideoArtifact(baseName, report, start, span, index, total));
    } else if (format === "audio-webm" || format === "audio-ogg") {
      artifacts.push(await createAudioMediaArtifact(format, baseName, report, start, span, index, total));
    } else if (format === "wav") {
      const workspace = getWorkspacePxdBridge();
      if (typeof workspace.renderAudioWavForExport !== "function") {
        throw new Error("Audio render bridge is unavailable for WAV export.");
      }
      const output = await withDrawAudioExportDemand(() => workspace.renderAudioWavForExport());
      if (output === null) {
        throw new Error("Audio Project has no audible content to export.");
      }
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: "audio/wav"
      });
    } else if (format === "sprite-sheet") {
      const output = exportModule.exportSpriteSheet(state, {
        scale: exportState.scale
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType
      });
    } else if (format === "atlas-json") {
      const output = exportModule.exportAtlasJson(state, {
        scale: exportState.scale,
        imageFilename: exportArtifactFilename(baseName, "sprite-sheet")
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType
      });
    } else if (format === "tileset") {
      const output = exportModule.exportTileset(state, state.activeAssetId, {
        scale: exportState.scale
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType
      });
    } else if (format === "pxd") {
      artifacts.push(await createPxdProjectArtifact(exportModule, baseName));
    } else {
      throw new Error(`${definition.label} is not available yet.`);
    }
    await report({
      percent: start + span,
      title: "\u66F8\u304D\u51FA\u3057\u4E2D",
      detail: `${definition.label}\u306E\u51FA\u529B\u3092\u6E96\u5099\u3057\u307E\u3057\u305F`,
      current: `${definition.extension.toUpperCase()} \u6E96\u5099\u5B8C\u4E86`,
      completed: index + 1,
      total
    });
  }
  return artifacts;
}
async function exportSelectedToFile() {
  const exportState = readExportState();
  if (exportState.selectedFormats.length === 0) {
    setExportPanelStatus("\u5F62\u5F0F\u30921\u3064\u4EE5\u4E0A\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error");
    return;
  }
  if (colorDraftDirty) {
    await commitColorEdit();
    if (colorDraftDirty) {
      setExportPanelStatus("\u8272\u306E\u5909\u66F4\u3092\u78BA\u5B9A\u3057\u3066\u304B\u3089\u66F8\u304D\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error");
      return;
    }
  }
  if (exportProgressHideTimer !== void 0) {
    window.clearTimeout(exportProgressHideTimer);
    exportProgressHideTimer = void 0;
  }
  exportExecute.disabled = true;
  setExportPanelStatus("\u66F8\u304D\u51FA\u3057\u3092\u6E96\u5099\u4E2D\u2026");
  const total = exportState.selectedFormats.length;
  try {
    await reportExportProgress({
      percent: 2,
      title: "\u66F8\u304D\u51FA\u3057\u3092\u6E96\u5099\u4E2D",
      detail: "Export State\u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059",
      current: `${exportState.scale}\xD7 local output`,
      completed: 0,
      total
    });
    const exportModule = await loadExportModule();
    await reportExportProgress({
      percent: 8,
      title: "\u66F8\u304D\u51FA\u3057\u3092\u6E96\u5099\u4E2D",
      detail: "\u51FA\u529B\u30A8\u30F3\u30B8\u30F3\u3092\u8AAD\u307F\u8FBC\u3093\u3067\u3044\u307E\u3059",
      current: "EXPORT ENGINE",
      completed: 0,
      total
    });
    const artifacts = await createExportArtifacts(exportModule, exportState, reportExportProgress);
    if (exportState.packageMode === "zip" && artifacts.length > 1) {
      await reportExportProgress({
        percent: 92,
        title: "\u30D1\u30C3\u30B1\u30FC\u30B8\u5316\u4E2D",
        detail: "\u9078\u629E\u3057\u305F\u30D5\u30A1\u30A4\u30EB\u3092ZIP\u3078\u307E\u3068\u3081\u3066\u3044\u307E\u3059",
        current: `${artifacts.length} files \xB7 ZIP`,
        completed: artifacts.length,
        total
      });
      const bytes = exportModule.encodeStoredZip(artifacts.map((artifact) => ({
        filename: artifact.filename,
        bytes: artifact.bytes
      })));
      const filename = `${safeExportBaseName()}.zip`;
      downloadBytes(bytes, filename, "application/zip");
      setExportPanelStatus(`\u66F8\u304D\u51FA\u3057\u5B8C\u4E86 \xB7 ZIP ${artifacts.length}\u30D5\u30A1\u30A4\u30EB \xB7 ${bytes.byteLength} bytes`);
      setStatus(`Exported ${filename} locally.`);
      await reportExportProgress({
        percent: 100,
        title: "\u66F8\u304D\u51FA\u3057\u5B8C\u4E86",
        detail: "ZIP\u30D1\u30C3\u30B1\u30FC\u30B8\u3092\u30ED\u30FC\u30AB\u30EB\u306B\u4FDD\u5B58\u3057\u307E\u3057\u305F",
        current: filename,
        completed: artifacts.length,
        total,
        state: "complete"
      });
    } else {
      await reportExportProgress({
        percent: 94,
        title: "\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\u4E2D",
        detail: "\u751F\u6210\u3057\u305F\u51FA\u529B\u3092\u30ED\u30FC\u30AB\u30EB\u306B\u4FDD\u5B58\u3057\u3066\u3044\u307E\u3059",
        current: `${artifacts.length} file(s)`,
        completed: artifacts.length,
        total
      });
      for (const artifact of artifacts) {
        downloadBytes(artifact.bytes, artifact.filename, artifact.mimeType);
      }
      setExportPanelStatus(`\u66F8\u304D\u51FA\u3057\u5B8C\u4E86 \xB7 ${artifacts.map((artifact) => `${artifact.filename} ${artifact.bytes.byteLength} bytes`).join(" / ")}`);
      setStatus(`Exported ${artifacts.map((artifact) => artifact.filename).join(", ")} locally.`);
      await reportExportProgress({
        percent: 100,
        title: "\u66F8\u304D\u51FA\u3057\u5B8C\u4E86",
        detail: "\u9078\u629E\u3057\u305F\u30D5\u30A1\u30A4\u30EB\u3092\u30ED\u30FC\u30AB\u30EB\u306B\u4FDD\u5B58\u3057\u307E\u3057\u305F",
        current: artifacts.length === 1 ? artifacts[0]?.filename ?? "COMPLETE" : `${artifacts.length} files \xB7 COMPLETE`,
        completed: artifacts.length,
        total,
        state: "complete"
      });
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Export failed.";
    setExportPanelStatus(message, "error");
    setStatus(message, "error");
    await reportExportProgress({
      percent: 100,
      title: "\u66F8\u304D\u51FA\u3057\u306B\u5931\u6557",
      detail: message,
      current: "ERROR",
      completed: 0,
      total,
      state: "error"
    });
  } finally {
    exportExecute.disabled = false;
    exportProgressHideTimer = window.setTimeout(() => {
      exportProgressHideTimer = void 0;
      hideExportProgress();
    }, 1400);
  }
}
async function importPxdFile(file) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const legacyCompat = await loadLegacyCompatModule();
    const inspection = await legacyCompat.inspectPxd(bytes);
    let importedState;
    let importedAssetDefinitions = [];
    let importedTimelineMetadata;
    let importedStatus = "schema=v1";
    let importedHash = "";
    let importedWorkspace;
    if (inspection.source.identity === "LEGACY_PXD_ARCHIVE_V2") {
      const decompressor = async (compressed) => {
        const stream = new Blob([
          compressed.slice().buffer
        ]).stream().pipeThrough(new DecompressionStream("deflate"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      };
      const imported = await legacyCompat.importLegacyPxd(bytes, {
        decompressDeflate: decompressor
      });
      importedState = imported.state;
      importedStatus = `legacy-copy compatibility=${imported.compatibility.status}`;
      importedHash = imported.source.sourceHash;
    } else if (inspection.source.identity === "NEW_DRAW2_PXD_V1") {
      const exportModule = await loadExportModule();
      const imported = await exportModule.importPxdPackage(bytes);
      importedState = imported.state;
      importedAssetDefinitions = imported.assetDefinitions;
      importedTimelineMetadata = imported.drawTimelineMetadata;
      importedHash = imported.packageHash;
    } else if (inspection.source.identity === "NEW_DRAW2_PXD_V2") {
      const exportModule = await loadExportModule();
      const imported = await exportModule.importPxdProject(bytes);
      importedState = imported.state;
      importedAssetDefinitions = imported.assetDefinitions;
      importedTimelineMetadata = imported.drawTimelineMetadata;
      importedHash = imported.packageHash;
      importedStatus = "schema=v2 \xB7 Draw/Audio/Game";
      importedWorkspace = {
        projectId: imported.state.projectId,
        audio: imported.audio,
        game: imported.game
      };
    } else {
      const diagnostic9 = inspection.diagnostics[0];
      throw new Error(diagnostic9?.message ?? "PXD format could not be identified.");
    }
    flushDrawPersistence();
    await flushDrawPersistence();
    draw2EditorPreferencesReady = false;
    state = importedState;
    assetDefinitions = importedAssetDefinitions.map(cloneAssetDefinitionEntry);
    assetDefinitionSequence = 0;
    repository.save(state);
    core = new EditorCore(state, {
      instrumentation
    });
    history = new LocalUndoRedoHistory(state);
    const importedRecord = await drawPersistenceStore.load(state.projectId);
    drawPersistenceRevision = importedRecord?.revision ?? 0;
    clientSequence = 0;
    selectionInteractionGeneration += 1;
    selection = void 0;
    selectionDraft = void 0;
    pendingSelectionGesture = void 0;
    transformSession = void 0;
    transformPreview = void 0;
    pasteMode = false;
    clipboard = void 0;
    selectedTileSource = void 0;
    tilesetSourceRenderKey = "";
    lastTilemapGridLayoutKey = "";
    timelineSession = createTimelineSession(state);
    restoreDraw2TimelineMetadata(importedTimelineMetadata);
    timelineViewportInitialized = false;
    structureClientSequence = 0;
    onionSkinEnabled = false;
    onionSkinPreviousFrames = 1;
    onionSkinNextFrames = 1;
    onionSkinOpacity = 0.5;
    onionSkinColorMode = "TINTED";
    onionSkinCache = void 0;
    journal.operations.length = 0;
    journal.dirtyTileWrites.length = 0;
    journal.checkpoints.length = 0;
    const asset = state.assets[state.activeAssetId];
    if (asset === void 0) {
      throw new Error("Imported PXD active asset is missing.");
    }
    projectIdInput.value = state.projectId;
    tileSizeSelect.value = String(asset.raster.tileSize);
    syncClientSequencesFromState();
    syncRasterCanvasDimensions(asset.width, asset.height);
    restoreDraw2EditorPreferencesForProject(state.projectId, asset);
    renderPaletteButtons(asset.palette);
    await present();
    syncExportPanel();
    syncColorEditorFromSelection();
    updatePlaybackLoopControl();
    renderTimeline();
    updateSelectionStatus(`scope=${state.activeCelId} \xB7 selection=none \xB7 undo=0 \xB7 redo=0`);
    notifyAssetStateChanged();
    updateHistoryButtons();
    saveDrawProjectState("import");
    writeActiveWorkspaceProjectId(asWorkspaceProjectId(state.projectId));
    if (importedWorkspace !== void 0) {
      await getWorkspacePxdBridge().restoreProjectPxdSnapshot(importedWorkspace);
    }
    announceWorkspaceProjectChanged(window, {
      projectId: asWorkspaceProjectId(state.projectId),
      name: state.name
    });
    setStatus(`PXD imported locally \xB7 ${importedStatus} \xB7 hash=${importedHash.slice(0, 12)}\u2026`);
  } catch (cause) {
    setStatus(cause instanceof Error ? `PXD import rejected: ${cause.message}` : "PXD import rejected.", "error");
  } finally {
    importPxdControl.value = "";
  }
}
function pointFromPointer(event) {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return void 0;
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / bounds.width * asset.width);
  const y = Math.floor((event.clientY - bounds.top) / bounds.height * asset.height);
  return {
    x: Math.max(0, Math.min(asset.width - 1, x)),
    y: Math.max(0, Math.min(asset.height - 1, y))
  };
}
function mirrorGuideAxisAtClient(clientX, clientY) {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0 || !mirrorEnabled) return void 0;
  const source = mirrorGuidePointForViewportClient(clientX, clientY, asset);
  const tolerance = Math.max(1.5, 6 / Math.max(MIN_VIEWPORT_ZOOM, currentViewportDisplayScale()));
  const maxX = Math.max(1, asset.width - 1);
  const maxY = Math.max(1, asset.height - 1);
  const normalizedX = source.x / maxX;
  const normalizedY = source.y / maxY;
  const candidates = [];
  candidates.push({
    axis: "x",
    distance: Math.abs(source.x - mirrorGuide.x)
  });
  candidates.push({
    axis: "y",
    distance: Math.abs(source.y - mirrorGuide.y)
  });
  candidates.push({
    axis: "diagonal-down",
    distance: Math.abs(normalizedY - normalizedX - mirrorGuide.diagonalDown) * Math.min(maxX, maxY)
  });
  candidates.push({
    axis: "diagonal-up",
    distance: Math.abs(normalizedX + normalizedY - 1 - mirrorGuide.diagonalUp) * Math.min(maxX, maxY)
  });
  return candidates.filter((candidate) => candidate.distance <= tolerance).sort((left, right) => left.distance - right.distance)[0]?.axis;
}
function isOutsideCanvasClient(clientX, clientY) {
  const bounds = canvas.getBoundingClientRect();
  return clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom;
}
function moveMirrorGuideFromClient(axis, clientX, clientY) {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return;
  const source = mirrorGuidePointForViewportClient(clientX, clientY, asset);
  mirrorGuide = normalizeMirrorGuide({
    width: asset.width,
    height: asset.height
  });
  if (axis === "x") {
    mirrorGuide.x = snapMirrorGuideCoordinate(source.x, asset.width);
  } else if (axis === "y") {
    mirrorGuide.y = snapMirrorGuideCoordinate(source.y, asset.height);
  } else {
    const maxX = Math.max(1, asset.width - 1);
    const maxY = Math.max(1, asset.height - 1);
    const snappedX = snapMirrorGuideCoordinate(source.x, asset.width);
    const snappedY = snapMirrorGuideCoordinate(source.y, asset.height);
    const normalizedX = snappedX / maxX;
    const normalizedY = snappedY / maxY;
    if (axis === "diagonal-down") {
      mirrorGuide.diagonalDown = normalizedY - normalizedX;
    } else {
      mirrorGuide.diagonalUp = normalizedX + normalizedY - 1;
    }
  }
  mirrorGuide = normalizeMirrorGuide({
    width: asset.width,
    height: asset.height
  });
  drawOverlay();
}
function createFillGradientWriteSet(asset, from, to, colorIndex = selectedColor, maxPixels) {
  const picked = selectByContiguousColor(asset.raster, from, "exact", asset.palette, 0, maxPixels === void 0 ? Math.min(1048577, asset.width * asset.height + 1) : maxPixels + 1);
  const allowed = selection === void 0 ? void 0 : new Set(selection.pixels.map(selectionPointKey));
  if (allowed !== void 0 && !allowed.has(selectionPointKey(from))) {
    return [];
  }
  const region = allowed === void 0 ? picked.pixels : picked.pixels.filter((point) => allowed.has(selectionPointKey(point)));
  if (region.length === 0 || maxPixels !== void 0 && region.length > maxPixels) return [];
  return createIndexedGradientWriteSet(asset.raster, region, from, to, asset.raster.getPixel(from.x, from.y), colorIndex, asset.palette);
}
function normalizeColorSelectionMode(mode) {
  return mode === "exact" || mode === "magic" || mode === "opaque" ? mode : "similar";
}
function colorSelectionModeLabel(mode) {
  switch (mode) {
    case "exact":
      return "Same";
    case "magic":
      return "Magic";
    case "opaque":
      return "Opaque";
    default:
      return "Similar";
  }
}
function selectConfiguredColor(asset, seed, options) {
  const mode = normalizeColorSelectionMode(options.selectionMode);
  const threshold = options.similarity ?? 0;
  if (mode === "opaque") return selectByOpaque(asset.raster, asset.palette);
  if (mode === "magic") {
    return selectByContiguousColor(asset.raster, seed, "similar", asset.palette, threshold);
  }
  return selectByPaletteColor(asset.raster, asset.raster.getPixel(seed.x, seed.y), mode === "exact" ? "exact" : "similar", asset.palette, threshold);
}
async function commitPointerPoints(points, fixedContext) {
  if (timelineActivationPending) {
    setStatus("Timeline cell is changing; drawing was not committed.", "error");
    return;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0 || points.length === 0) return;
  if (selection !== void 0 && !selectionScopeMatchesActiveCel()) {
    clearCommittedSelection("Selection cleared because it belongs to another timeline cel.");
    return;
  }
  const tool = fixedContext?.tool ?? currentBasicTool();
  const colorIndex = fixedContext?.colorIndex ?? selectedColor;
  const fixedToolOptions = fixedContext?.toolOptions ?? toolOptions;
  const first = points[0] ?? points[points.length - 1];
  const last = points[points.length - 1] ?? first;
  if (tool === "pan") return;
  if (tool === "eyedropper") {
    selectedColor = asset.raster.getPixel(first.x, first.y);
    renderPaletteButtons(asset.palette);
    syncColorEditorFromSelection();
    scheduleDraw2EditorPreferencesSave();
    setStatus(`Picked palette index ${selectedColor}.`);
    return;
  }
  if (tool === "tile-stamp") {
    const source = selectedTileSource === void 0 ? {
      width: 2,
      height: 2,
      pixels: [
        colorIndex,
        0,
        0,
        colorIndex
      ]
    } : (() => {
      const sourceAsset = state.assets[selectedTileSource.sourceAssetId];
      if (sourceAsset === void 0) return void 0;
      const pixels = [];
      for (let sourceY = 0; sourceY < selectedTileSource.cellSize; sourceY += 1) {
        for (let sourceX = 0; sourceX < selectedTileSource.cellSize; sourceX += 1) {
          const index = sourceAsset.raster.getPixel(selectedTileSource.sourceX + sourceX, selectedTileSource.sourceY + sourceY);
          pixels.push(index < asset.palette.length ? index : colorIndex);
        }
      }
      return {
        width: selectedTileSource.cellSize,
        height: selectedTileSource.cellSize,
        pixels
      };
    })();
    if (source === void 0) {
      setStatus("Tile source is unavailable; choose a Tileset cell first.", "error");
      return;
    }
    const writes2 = tileStampWrites(asset.raster, source, first, Number(specialTileScaleElement?.value ?? 1));
    await commitWriteSet(writes2, "tool.tile-stamp", tool);
    if (writes2.length > 0) {
      setStatus(`Tile Stamp committed \xB7 ${writes2.length}px \xB7 one undo`);
    }
    return;
  }
  if (tool === "select-color") {
    const mode = normalizeColorSelectionMode(fixedToolOptions.selectionMode);
    const picked = selectConfiguredColor(asset, first, fixedToolOptions);
    beginSelectionFromPoints(picked.pixels, mode === "opaque" ? "alpha" : "magic", selectionEditMode, `${colorSelectionModeLabel(mode)} color selection created.`);
    return;
  }
  if (tool === "select-lasso") {
    const picked = selectByLasso(asset.raster, points);
    beginSelectionFromPoints(picked.pixels, "freehand", selectionEditMode, "Lasso selection created.");
    return;
  }
  if (tool === "select-ellipse") {
    const bounds = normalizeToolBounds(first, last, asset);
    const picked = selectByEllipse(asset.raster, first, last);
    beginSelectionFromPoints(picked.pixels, "ellipse", selectionEditMode, `Ellipse selection created \xB7 ${bounds.width}\xD7${bounds.height}.`);
    return;
  }
  if (tool === "select-rect") {
    const bounds = normalizeToolBounds(first, last, asset);
    beginSelectionFromPoints(rectanglePointList(bounds), "rectangle", selectionEditMode, "Rectangle selection created.");
    return;
  }
  if (tool === "fill") {
    if (selection !== void 0 || points.length > 1) {
      const writes2 = createFillGradientWriteSet(asset, first, last, colorIndex);
      if (writes2.length === 0) {
        setStatus(selection === void 0 || selection.pixels.some((point) => point.x === first.x && point.y === first.y) ? "Fill has no pixels to change." : "Fill seed is outside the active selection.", "error");
        return;
      }
      await commitWriteSet(writes2, points.length > 1 ? "tool.fill.gradient" : "tool.fill.selection");
      return;
    }
    const drawClientId = activeDrawClientId();
    const commandSequence = nextClientSequence(drawClientId);
    const before = state;
    const command = {
      commandId: `draw2-local-fill-${commandSequence}`,
      commandType: "raster.fill",
      schemaVersion: 1,
      projectId: state.projectId,
      assetId: asset.id,
      actorId: activeDrawActorId(),
      clientId: drawClientId,
      clientSequence: commandSequence,
      baseStructureEpoch: state.structureEpoch,
      createdAtMonotonicMs: performance.now(),
      payload: {
        seedX: first.x,
        seedY: first.y,
        colorIndex,
        maxPixels: Math.min(1048576, asset.width * asset.height)
      }
    };
    const fillTimelineGeneration = timelineStateGeneration;
    const result = await core.execute(command);
    if (fillTimelineGeneration !== timelineStateGeneration) {
      syncClientSequencesFromState();
      setStatus("Timeline cell changed while filling; the old-cell write was discarded.", "error");
      return;
    }
    if (!result.ok) {
      syncClientSequencesFromState();
      setStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
      return;
    }
    state = result.state;
    history.record(before, state, result.result.operation.operationId, result.result.operation.operationType);
    renderTimeline();
    saveDrawProjectState();
    await autosave.record(state, result.result);
    publishDrawRasterCommit(result.result, state, before.structureEpoch);
    await present(result.result.dirtyRegions, result.result.dirtyTiles);
    updateHistoryButtons();
    setStatus(`fill committed \xB7 ${result.result.dirtyTiles.length} tiles \xB7 one undo`);
    return;
  }
  const useStrokeCommand = (tool === "pen" || tool === "eraser") && fixedToolOptions.brushSize === 1 && fixedToolOptions.pattern === "solid" && (!mirrorEnabled || !mirrorHasActiveAxis()) && selection === void 0;
  if (useStrokeCommand) {
    const drawClientId = activeDrawClientId();
    const commandSequence = nextClientSequence(drawClientId);
    const before = state;
    let canonicalStrokePoints;
    try {
      canonicalStrokePoints = interpolatePixelPath(points);
    } catch (cause) {
      syncClientSequencesFromState();
      setStatus(cause instanceof Error ? cause.message : "Stroke interpolation failed.", "error");
      return;
    }
    const command = {
      commandId: `draw2-local-stroke-${commandSequence}`,
      commandType: "raster.strokeCommit",
      schemaVersion: 1,
      projectId: state.projectId,
      assetId: asset.id,
      actorId: activeDrawActorId(),
      clientId: drawClientId,
      clientSequence: commandSequence,
      baseStructureEpoch: state.structureEpoch,
      createdAtMonotonicMs: performance.now(),
      payload: {
        points: canonicalStrokePoints,
        colorIndex: tool === "eraser" ? 0 : colorIndex
      }
    };
    const strokeTimelineGeneration = timelineStateGeneration;
    const result = await core.execute(command);
    if (strokeTimelineGeneration !== timelineStateGeneration) {
      syncClientSequencesFromState();
      setStatus("Timeline cell changed while drawing; the old-cell write was discarded.", "error");
      return;
    }
    if (!result.ok) {
      syncClientSequencesFromState();
      setStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
      return;
    }
    state = result.state;
    history.record(before, state, result.result.operation.operationId, result.result.operation.operationType);
    renderTimeline();
    saveDrawProjectState();
    await autosave.record(state, result.result);
    publishDrawRasterCommit(result.result, state, before.structureEpoch);
    await present(result.result.dirtyRegions, result.result.dirtyTiles);
    updateHistoryButtons();
    setStatus(`${tool} committed \xB7 one stroke / one undo`);
    return;
  }
  const writes = tool === "pen" || tool === "eraser" ? createPathWriteSet(tool, points, colorIndex, fixedToolOptions, asset.raster) : createWriteSet(tool, first, last, colorIndex, fixedToolOptions, asset.raster);
  await commitWriteSet(writes, `tool.${tool}`);
}
async function commitInteractionSession(commit) {
  const fixedContext = {
    tool: commit.tool,
    colorIndex: commit.colorIndex,
    toolOptions: commit.toolOptions
  };
  if (commit.kind === "immediate") {
    await commitPointerPoints(commit.tool === "fill" ? commit.points : [
      commit.point
    ], fixedContext);
    return;
  }
  const writeTools = [
    "pen",
    "pixel-pen",
    "eraser",
    "line",
    "rect",
    "rect-fill",
    "ellipse",
    "ellipse-fill",
    "circle",
    "circle-fill"
  ];
  if (writeTools.includes(commit.tool)) {
    await commitWriteSet(commit.writes, commit.sourceOperationType, commit.tool);
    return;
  }
  await commitPointerPoints(commit.points, fixedContext);
}
createButton.addEventListener("click", openProjectDialog);
openProjectDialogTrigger.addEventListener("click", openProjectDialog);
projectDialogOpen.addEventListener("click", () => {
  try {
    const projectId = readProjectDialogProjectId();
    projectDialogStatus.textContent = `Opening Project ${projectId}\u2026`;
    projectDialogOpen.disabled = true;
    projectDialogNew.disabled = true;
    void resetProject({
      projectIdOverride: projectId,
      mode: "OPEN"
    }).then(() => projectDialog.close()).catch((cause) => {
      projectDialogStatus.textContent = cause instanceof Error ? cause.message : "The Project could not be opened.";
    }).finally(() => {
      projectDialogOpen.disabled = false;
      projectDialogNew.disabled = false;
    });
  } catch (cause) {
    projectDialogStatus.textContent = cause instanceof Error ? cause.message : "The Project ID is invalid.";
  }
});
projectDialogNew.addEventListener("click", () => {
  projectDialogOpen.disabled = true;
  projectDialogNew.disabled = true;
  projectDialogStatus.textContent = "Reserving a fresh Project ID\u2026";
  void createFreshWorkspaceProjectId().then((projectId) => {
    projectDialogId.value = projectId;
    projectDialogStatus.textContent = `Creating blank Project ${projectId}\u2026`;
    return resetProject({
      projectIdOverride: projectId,
      mode: "NEW"
    });
  }).then(() => projectDialog.close()).catch((cause) => {
    projectDialogStatus.textContent = cause instanceof Error ? cause.message : "The blank Project could not be created.";
  }).finally(() => {
    projectDialogOpen.disabled = false;
    projectDialogNew.disabled = false;
  });
});
openCanvasSettings.addEventListener("click", openCanvasSettingsDialog);
canvasSettingsApply.addEventListener("click", () => {
  const settings = readCanvasProjectSettings();
  canvasSettingsProjectId.value = settings.projectId;
  void resetProject({
    forceCreate: true,
    width: settings.width,
    height: settings.height,
    tileSize: settings.tileSize,
    anchor: settings.anchor
  }).then(() => canvasSettingsDialog.close()).catch((cause) => setStatus(cause instanceof Error ? cause.message : "Canvas creation failed.", "error"));
});
for (const control of [
  canvasSettingsWidth,
  canvasSettingsHeight
]) {
  control.addEventListener("input", syncCanvasResizePreview);
}
for (const button of canvasResizeAnchorElements) {
  button.addEventListener("click", () => {
    const next = button.dataset.canvasResizeAnchor;
    if (next === void 0) return;
    canvasResizeAnchor = next;
    syncCanvasResizePreview();
  });
}
renderExportFormatCards();
syncExportPanel();
exportName.addEventListener("input", () => {
  renderExportOutputPlan();
});
exportScale.addEventListener("change", () => {
  renderExportOutputPlan();
  renderExportPreview();
});
exportPackageSingle.addEventListener("change", () => {
  if (exportPackageSingle.checked) {
    exportPackageMode = "single";
    syncExportPanel();
  }
});
exportPackageZip.addEventListener("change", () => {
  if (exportPackageZip.checked) {
    exportPackageMode = "zip";
    syncExportPanel();
  }
});
exportExecute.addEventListener("click", () => {
  void exportSelectedToFile();
});
exportToMarket.addEventListener("click", () => {
  void handoffPxdProjectToMarket();
});
document.querySelector("#draw2WorkspaceTabExport")?.addEventListener("click", () => syncExportPanel());
tagAddControl.addEventListener("click", addAnimationTagFromControls);
markerAddControl.addEventListener("click", addTimelineMarkerFromControls);
linkedCelToggleControl.addEventListener("click", toggleActiveLinkedCel);
drawAudioAdd?.addEventListener("click", addDrawAudioReferenceFromControls);
var drawAudioCatalogRequested = false;
var requestDrawAudioCatalog = () => {
  if (drawAudioCatalogRequested) return;
  drawAudioCatalogRequested = true;
  window.dispatchEvent(new CustomEvent("draw2:audio-catalog-request"));
};
drawAudioAssetPicker?.addEventListener("focus", requestDrawAudioCatalog);
drawAudioAssetPicker?.addEventListener("pointerdown", requestDrawAudioCatalog);
window.addEventListener("draw2:audio-catalog-provider-ready", () => {
  if (!drawAudioCatalogRequested) return;
  window.dispatchEvent(new CustomEvent("draw2:audio-catalog-request"));
});
window.addEventListener("draw2:audio-assets-changed", (event) => {
  const detail = event.detail;
  const assets = Array.isArray(detail?.assets) ? detail.assets : [];
  drawAudioCatalogRequested = false;
  drawAudioCatalog = assets.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const value = candidate;
    if (typeof value.audioAssetId !== "string" || typeof value.audioRevisionId !== "string" || value.kind !== "BGM" && value.kind !== "SE" || typeof value.label !== "string") return [];
    return [
      {
        audioAssetId: value.audioAssetId,
        audioRevisionId: value.audioRevisionId,
        kind: value.kind,
        label: value.label
      }
    ];
  });
  let referencesUpdated = false;
  for (const reference of drawAudioReferences.list()) {
    const latest = drawAudioCatalog.find((item) => item.audioAssetId === reference.audioAssetId);
    if (latest === void 0 || latest.audioRevisionId === reference.audioRevisionId && latest.label === reference.label) continue;
    drawAudioReferences.upsert({
      ...reference,
      audioRevisionId: latest.audioRevisionId,
      kind: latest.kind,
      label: latest.label
    }, state.frames.length);
    referencesUpdated = true;
  }
  if (referencesUpdated) {
    queueDrawPersistenceSave("draw-audio-reference-refresh");
    renderTimeline();
  }
  renderDrawAudioReferences();
});
importPxdControl.addEventListener("change", () => {
  const file = importPxdControl.files?.[0];
  if (file !== void 0) void importPxdFile(file);
});
layerPanelAddElement?.addEventListener("click", () => {
  void runTimelineCommand("timeline.addLayerTrack", {
    layerTrackId: `${state.projectId}:layer:panel:${structureClientSequence + 1}`,
    name: `Layer ${state.layers.length + 1}`
  });
});
layerPanelAddTilemapElement?.addEventListener("click", () => {
  void runTimelineCommand("timeline.addLayerTrack", {
    layerTrackId: `${state.projectId}:tilemap-layer:${structureClientSequence + 1}`,
    name: `Tilemap ${state.layers.filter((layer2) => layer2.kind === "TILEMAP").length + 1}`,
    kind: "TILEMAP"
  });
});
layerPanelDuplicateElement?.addEventListener("click", () => {
  void runTimelineCommand("timeline.duplicateLayerTrack", {
    sourceLayerTrackId: timelineSession.activeLayerTrackId,
    layerTrackId: `${state.projectId}:layer:duplicate:${structureClientSequence + 1}`,
    name: `${state.layers.find((layer2) => layer2.layerTrackId === timelineSession.activeLayerTrackId)?.name ?? "Layer"} Copy`
  });
});
layerPanelRemoveElement?.addEventListener("click", () => {
  void runTimelineCommand("timeline.removeLayerTrack", {
    layerTrackId: timelineSession.activeLayerTrackId
  });
});
addFrameControl.addEventListener("click", () => {
  void runTimelineCommand("timeline.addFrame", {
    frameId: `${state.projectId}:frame:ui:${structureClientSequence + 1}`,
    durationMs: 100
  });
});
duplicateFrameControl.addEventListener("click", () => {
  void runTimelineCommand("timeline.duplicateFrame", {
    sourceFrameId: timelineSession.activeFrameId,
    frameId: `${state.projectId}:frame:duplicate:ui:${structureClientSequence + 1}`
  });
});
removeFrameControl.addEventListener("click", () => {
  void runTimelineCommand("timeline.removeFrame", {
    frameId: timelineSession.activeFrameId
  });
});
addLayerControl.addEventListener("click", () => {
  void runTimelineCommand("timeline.addLayerTrack", {
    layerTrackId: `${state.projectId}:layer:ui:${structureClientSequence + 1}`,
    name: `Layer ${state.layers.length + 1}`
  });
});
reorderLayerControl.addEventListener("click", () => {
  const currentIndex = state.timeline.layerTrackOrder.indexOf(timelineSession.activeLayerTrackId);
  if (currentIndex <= 0) {
    setStatus("Layer Track is already at the top.", "error");
    return;
  }
  void runTimelineCommand("timeline.reorderLayerTrack", {
    layerTrackId: timelineSession.activeLayerTrackId,
    targetIndex: currentIndex - 1
  });
});
toggleLayerControl.addEventListener("click", () => {
  const current = state.layers.find((item) => item.layerTrackId === timelineSession.activeLayerTrackId);
  if (current === void 0) {
    setStatus("Active Layer Track is missing.", "error");
    return;
  }
  void runTimelineCommand("timeline.setLayerVisibility", {
    layerTrackId: current.layerTrackId,
    visible: !current.visible
  });
});
toggleOnionControl.addEventListener("click", () => {
  onionSkinEnabled = !onionSkinEnabled;
  onionOptions.open = onionSkinEnabled;
  positionOnionOptionsPopover();
  renderTimeline();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
  setStatus(`Onion Skin ${onionSkinEnabled ? "enabled" : "disabled"} as a Renderer Projection; previous=${onionSkinPreviousFrames} next=${onionSkinNextFrames}; Canonical Raster unchanged.`);
});
onionPrevious.addEventListener("input", () => {
  onionSkinPreviousFrames = Math.max(0, Math.min(4, Math.round(Number(onionPrevious.value) || 0)));
  onionPreviousValue.value = String(onionSkinPreviousFrames);
  onionSkinCache = void 0;
  renderTimeline();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
});
onionNext.addEventListener("input", () => {
  onionSkinNextFrames = Math.max(0, Math.min(4, Math.round(Number(onionNext.value) || 0)));
  onionNextValue.value = String(onionSkinNextFrames);
  onionSkinCache = void 0;
  renderTimeline();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
});
onionOpacity.addEventListener("input", () => {
  onionSkinOpacity = Math.max(0.1, Math.min(1, Number(onionOpacity.value) || 0.5));
  onionOpacityValue.value = `${Math.round(onionSkinOpacity * 100)}%`;
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
});
onionColorMode.addEventListener("change", () => {
  onionSkinColorMode = onionColorMode.value === "ORIGINAL" ? "ORIGINAL" : "TINTED";
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
  setStatus(`Onion Skin color mode: ${onionSkinColorMode === "ORIGINAL" ? "original colors" : "tinted order"}; Canonical Raster unchanged.`);
});
togglePlaybackControl.addEventListener("click", (event) => {
  event.preventDefault();
  if (playbackRunning) stopTimelinePlayback("Timeline playback paused.");
  else startTimelinePlayback();
});
window.addEventListener("draw2:draw-playback-request", (event) => {
  const detail = event.detail;
  const requested = typeof detail?.playing === "boolean" ? detail.playing : !playbackRunning;
  if (requested === playbackRunning) return;
  if (requested) startTimelinePlayback();
  else stopTimelinePlayback("Timeline playback paused.");
});
playbackLoopControl.addEventListener("click", cyclePlaybackLoopMode);
playbackFpsControl.addEventListener("change", () => {
  playbackFpsCustomControl.hidden = playbackFpsControl.value !== "custom";
  renderTimeline();
  if (playbackRunning) {
    stopTimelinePlayback("Playback rate changed.");
    startTimelinePlayback();
  }
  scheduleDraw2EditorPreferencesSave();
});
playbackFpsCustomControl.addEventListener("change", () => {
  playbackFpsCustomControl.value = String(Math.round(playbackFpsValue()));
  renderTimeline();
  if (playbackRunning) {
    stopTimelinePlayback("Playback rate changed.");
    startTimelinePlayback();
  }
  scheduleDraw2EditorPreferencesSave();
});
for (const tab of timelineTabs) {
  tab.addEventListener("click", () => {
    const next = tab.dataset.draw2TimelineTab;
    if (next === void 0) return;
    setTimelineTab(next);
    renderCreatorTimelineMetadata();
  });
  tab.addEventListener("keydown", (event) => {
    if (![
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End"
    ].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = timelineTabs.indexOf(tab);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? timelineTabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + timelineTabs.length) % timelineTabs.length;
    timelineTabs[nextIndex]?.focus();
    timelineTabs[nextIndex]?.click();
  });
}
timelinePropertiesCollapse.addEventListener("click", () => {
  timelinePropertiesCollapsed = !timelinePropertiesCollapsed;
  applyTimelinePropertiesLayout();
  saveTimelinePropertiesPreference();
});
{
  let pointerId;
  let startX = 0;
  let startWidth = timelinePropertiesWidth;
  const clampPropertiesWidth = (value) => Math.max(200, Math.min(320, value));
  timelinePropertiesResize.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 700px)").matches || timelinePropertiesCollapsed) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startWidth = timelinePropertiesWidth;
    timelinePropertiesResize.setPointerCapture(event.pointerId);
    timelinePropertiesResize.classList.add("is-resizing");
    event.preventDefault();
  });
  timelinePropertiesResize.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    timelinePropertiesWidth = clampPropertiesWidth(startWidth + startX - event.clientX);
    applyTimelinePropertiesLayout();
  });
  const finishPropertiesResize = (event) => {
    if (pointerId !== event.pointerId) return;
    pointerId = void 0;
    timelinePropertiesResize.classList.remove("is-resizing");
    if (timelinePropertiesResize.hasPointerCapture(event.pointerId)) {
      timelinePropertiesResize.releasePointerCapture(event.pointerId);
    }
    saveTimelinePropertiesPreference();
  };
  timelinePropertiesResize.addEventListener("pointerup", finishPropertiesResize);
  timelinePropertiesResize.addEventListener("pointercancel", finishPropertiesResize);
  timelinePropertiesResize.addEventListener("lostpointercapture", () => {
    pointerId = void 0;
    timelinePropertiesResize.classList.remove("is-resizing");
  });
  timelinePropertiesResize.addEventListener("dblclick", (event) => {
    event.preventDefault();
    timelinePropertiesWidth = 240;
    applyTimelinePropertiesLayout();
    saveTimelinePropertiesPreference();
  });
}
for (const actionButton of timelineContext.querySelectorAll("[data-timeline-context]")) {
  actionButton.addEventListener("click", () => {
    void runTimelineContextAction(actionButton.dataset.timelineContext ?? "properties");
  });
}
for (const actionButton of document.querySelectorAll("[data-timeline-more-action]")) {
  actionButton.addEventListener("click", () => {
    const action = actionButton.dataset.timelineMoreAction;
    if (action === "duplicate-frame") duplicateFrameControl.click();
    else if (action === "remove-frame") removeFrameControl.click();
    else if (action === "add-layer") addLayerControl.click();
    else if (action === "toggle-layer") toggleLayerControl.click();
  });
}
document.addEventListener("pointerdown", (event) => {
  if (!timelineContext.hidden && !timelineContext.contains(event.target)) closeTimelineContextMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTimelineContextMenu();
});
timelineViewport.addEventListener("scroll", () => {
  const scrollTop = timelineViewport.scrollTop;
  const scrollLeft = timelineViewport.scrollLeft;
  if (scrollTop === lastRenderedTimelineScrollTop && scrollLeft === lastRenderedTimelineScrollLeft) return;
  timelineSession = {
    ...timelineSession,
    scrollTop,
    scrollLeft
  };
  if (timelineScrollRenderFrame !== void 0) return;
  timelineScrollRenderFrame = window.requestAnimationFrame(() => {
    timelineScrollRenderFrame = void 0;
    if (timelineViewport.scrollTop === lastRenderedTimelineScrollTop && timelineViewport.scrollLeft === lastRenderedTimelineScrollLeft) return;
    renderTimeline();
  });
});
selectionModeControl.addEventListener("change", () => {
  selectionEditMode = selectionModeControl.value;
  setStatus(`Selection mode ${selectionModeLabel(selectionEditMode)} \xB7 Shift=add \xB7 Alt=subtract \xB7 Shift+Alt=intersect \xB7 Alt+drag=duplicate`);
});
commitSelectionControl.addEventListener("click", commitSelectionDraft);
cancelSelectionControl.addEventListener("click", () => cancelSelectionDraft());
selectButton.addEventListener("click", () => {
  try {
    const next = createRectangleSelectionSnapshot(state, currentSelectionBounds(), `selection-${state.projectId}-${Date.now()}`, (selection?.mask.selectionVersion ?? 0) + 1);
    beginSelectionFromPoints(next.pixels, "rectangle", selectionEditMode, "Rectangle selection created.");
  } catch (cause) {
    setStatus(cause instanceof Error ? cause.message : "Selection failed.", "error");
  }
});
previewButton.addEventListener("click", () => {
  if (selectionDraft !== void 0 || pendingSelectionGesture !== void 0) {
    setStatus("Confirm or cancel the selection draft before Transform Preview.", "error");
    return;
  }
  if (selection === void 0) {
    setStatus("Create a selection before Transform Preview.", "error");
    return;
  }
  try {
    selectionInteractionGeneration += 1;
    transformSession = createTransformSession(selection, currentTransform(), `transform-${state.projectId}-${selection.mask.selectionVersion}`);
    transformPreview = previewTransform(selection, transformSession);
    pasteMode = false;
    syncWorkspaceEditCommandState();
    updateSelectionStatus(`scope=${selection.scope.celId} \xB7 ${selection.pixels.length}px \xB7 preview=${transformSession.transform.operation} \xB7 canonicalDirtyTiles=0`);
    setStatus("Transform Preview only; Canonical Raster and Journal unchanged.");
    markPreviewMetrics();
    drawOverlay();
  } catch (cause) {
    setStatus(cause instanceof Error ? cause.message : "Transform Preview failed.", "error");
  }
});
function previewSelectionOperation(operation) {
  if (selection === void 0) {
    setStatus("Create a selection before Transform Preview.", "error");
    return;
  }
  transformOperation.value = operation;
  previewButton?.click();
}
flipHorizontalButton.addEventListener("click", () => previewSelectionOperation("FLIP_HORIZONTAL"));
flipVerticalButton.addEventListener("click", () => previewSelectionOperation("FLIP_VERTICAL"));
rotateCCWButton.addEventListener("click", () => previewSelectionOperation("ROTATE_90_CCW"));
rotateCWButton.addEventListener("click", () => previewSelectionOperation("ROTATE_90_CW"));
rotate180Button.addEventListener("click", () => previewSelectionOperation("ROTATE_180"));
async function commitActiveTransform() {
  if (transformSession === void 0) {
    setStatus("Start a Transform or Paste Preview before Commit.", "error");
    return false;
  }
  const sourceSelection = selection;
  const previewPixels = transformPreview?.pixels ?? [];
  const before = state;
  const commandSequence = nextClientSequence(SELECTION_CLIENT_ID);
  const commandId = selectionCommandId(pasteMode ? "paste" : "transform", state.projectId, commandSequence);
  const interactionGeneration = selectionInteractionGeneration;
  const result = pasteMode && clipboard !== void 0 ? await pasteClipboard(state, {
    commandType: "clipboard.paste",
    commandId,
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: SELECTION_CLIENT_ID,
    clientId: SELECTION_CLIENT_ID,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: {
      clipboard,
      session: transformSession
    }
  }) : selection === void 0 ? void 0 : await commitTransform(state, {
    commandType: "selection.transformCommit",
    commandId,
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: SELECTION_CLIENT_ID,
    clientId: SELECTION_CLIENT_ID,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: {
      selection,
      session: transformSession
    }
  });
  if (interactionGeneration !== selectionInteractionGeneration) {
    return false;
  }
  if (result === void 0 || !result.ok) {
    const diagnostics = result === void 0 ? [] : result.diagnostics;
    const staleSelection = diagnostics.some((item) => item.code.startsWith("STALE_SELECTION") || item.code === "TRANSFORM_COMMAND_SCOPE_INVALID" || item.code === "SELECTION_CEL_SCOPE_INVALID");
    if (result === void 0 || staleSelection) {
      clearCommittedSelection("Transform preview cleared because its selection is no longer current.");
    } else {
      cancelUncommittedSelectionWork();
    }
    syncClientSequencesFromState();
    setStatus(result === void 0 ? "Transform selection is missing." : result.diagnostics.map((item) => item.code).join(", "), "error");
    return false;
  }
  state = result.state;
  syncClientSequencesFromState();
  if (sourceSelection !== void 0 && previewPixels.length > 0) {
    const activeAsset = state.assets[state.activeAssetId];
    const destinationPoints = activeAsset === void 0 ? [] : previewPixels.filter((pixel) => pixel.x >= 0 && pixel.y >= 0 && pixel.x < activeAsset.width && pixel.y < activeAsset.height).map((pixel) => ({
      x: pixel.x,
      y: pixel.y
    }));
    selection = selectionSnapshotFromPoints(destinationPoints, sourceSelection.mask.kind);
    const region = selection?.mask.regions[0];
    if (region !== void 0) {
      selectionX.value = String(region.x);
      selectionY.value = String(region.y);
      selectionWidth.value = String(region.width);
      selectionHeight.value = String(region.height);
    }
  } else {
    selection = void 0;
  }
  history.record(before, state, result.result.operation.operationId, result.result.operation.operationType);
  renderTimeline();
  saveDrawProjectState();
  await autosave.record(state, result.result);
  selectionDraft = void 0;
  pendingSelectionGesture = void 0;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  syncWorkspaceEditCommandState();
  notifyAssetStateChanged();
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateSelectionStatus(selection === void 0 ? `scope=${state.activeCelId} \xB7 selection=none \xB7 undo=${history.undoDepth} \xB7 redo=${history.redoDepth}` : `scope=${selection.scope.celId} \xB7 ${selection.pixels.length}px \xB7 ${selection.mask.kind} \xB7 moved/ transformed \xB7 undo=${history.undoDepth} \xB7 redo=${history.redoDepth}`);
  updateHistoryButtons();
  setStatus(`${result.result.operation.operationType} committed as one local operation \xB7 ${selection === void 0 ? "selection cleared" : "selection kept active"} \xB7 dirtyTiles=${result.result.dirtyTiles.length} \xB7 COW=${result.result.cowSplitCount}`);
  return true;
}
commitButton.addEventListener("click", () => {
  void commitActiveTransform();
});
cancelButton.addEventListener("click", () => {
  if (cancelUncommittedSelectionWork("Transform Preview cancelled; Canonical Raster unchanged.")) return;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  syncWorkspaceEditCommandState();
  drawOverlay();
  updateSelectionStatus(selection === void 0 ? `scope=${state.activeCelId} \xB7 selection=none` : `scope=${selection.scope.celId} \xB7 ${selection.pixels.length}px \xB7 preview=cancelled`);
  setStatus("Transform Preview cancelled; Canonical Raster unchanged.");
});
copyButton.addEventListener("click", () => {
  cancelUncommittedSelectionWork();
  if (selection === void 0) {
    setStatus("Create a selection before Copy.", "error");
    return;
  }
  if (!selectionScopeMatchesActiveCel()) {
    clearCommittedSelection("Copy blocked because the selection belongs to another timeline cel.");
    return;
  }
  clipboard = createClipboardPayload(state, selection, "draw2-internal-selection");
  syncWorkspaceEditCommandState();
  updateSelectionStatus(`scope=${selection.scope.celId} \xB7 clipboard=${clipboard.pixels.length}px \xB7 palette=internal`);
  setStatus("Internal Clipboard copied locally; Canonical Raster unchanged.");
});
cutButton.addEventListener("click", () => {
  void (async () => {
    cancelUncommittedSelectionWork();
    if (selection === void 0) {
      setStatus("Create a selection before Cut.", "error");
      return;
    }
    if (!selectionScopeMatchesActiveCel()) {
      clearCommittedSelection("Cut blocked because the selection belongs to another timeline cel.");
      return;
    }
    clipboard = createClipboardPayload(state, selection, "draw2-internal-selection");
    const before = state;
    const commandSequence = nextClientSequence(SELECTION_CLIENT_ID);
    const commandId = selectionCommandId("cut", state.projectId, commandSequence);
    const interactionGeneration = selectionInteractionGeneration;
    const result = await cutClipboard(state, {
      commandType: "clipboard.cut",
      commandId,
      schemaVersion: 1,
      projectId: state.projectId,
      assetId: state.activeAssetId,
      actorId: SELECTION_CLIENT_ID,
      clientId: SELECTION_CLIENT_ID,
      clientSequence: commandSequence,
      baseStructureEpoch: state.structureEpoch,
      createdAtMonotonicMs: performance.now(),
      payload: {
        clipboard,
        selection
      }
    });
    if (interactionGeneration !== selectionInteractionGeneration) return;
    if (!result.ok) {
      syncClientSequencesFromState();
      setStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
      return;
    }
    syncClientSequencesFromState();
    state = result.state;
    history.record(before, state, result.result.operation.operationId, result.result.operation.operationType);
    renderTimeline();
    saveDrawProjectState();
    await autosave.record(state, result.result);
    selection = void 0;
    selectionDraft = void 0;
    pendingSelectionGesture = void 0;
    selectionDrag = void 0;
    transformSession = void 0;
    transformPreview = void 0;
    pasteMode = false;
    updateSelectionActionButtons();
    updateSelectionStatus(`scope=${state.activeCelId} \xB7 selection=none`);
    notifyAssetStateChanged();
    await present(result.result.dirtyRegions, result.result.dirtyTiles);
    drawOverlay();
    updateHistoryButtons();
    setStatus("clipboard.cut committed as one local operation.");
  })();
});
pasteButton.addEventListener("click", () => {
  cancelUncommittedSelectionWork();
  if (clipboard === void 0) {
    setStatus("Copy or Cut a selection before Paste.", "error");
    return;
  }
  const targetPalette = state.assets[state.activeAssetId]?.palette ?? [
    0
  ];
  const compatibility = assessClipboardPalette(clipboard, targetPalette);
  if (compatibility.result !== "EXACT_PALETTE_MATCH") {
    setStatus(`Paste blocked: ${compatibility.result}`, "error");
    return;
  }
  transformSession = createClipboardPasteSession(state, clipboard, currentTransform(), `paste-${state.projectId}-${selectionClientSequence + 1}`);
  transformPreview = {
    ...previewClipboardPaste(state, clipboard, transformSession),
    overlayRegions: [
      transformSession.destinationBounds
    ]
  };
  pasteMode = true;
  syncWorkspaceEditCommandState();
  updateSelectionStatus(`clipboard=${clipboard.pixels.length}px \xB7 palette=${compatibility.result} \xB7 placement preview \xB7 canonicalDirtyTiles=0`);
  setStatus("Paste placement Preview only; press Commit to apply one operation.");
  markPreviewMetrics();
  drawOverlay();
});
undoControl.addEventListener("click", async () => {
  if (cancelUncommittedSelectionWork("Active selection preview cancelled; press Undo again to undo history.")) return;
  const result = history.undo();
  if (result === void 0) {
    setStatus("Nothing to undo.", "error");
    return;
  }
  state = result.state;
  core = new EditorCore(state, {
    instrumentation
  });
  syncClientSequencesFromState();
  saveDrawProjectState();
  selection = void 0;
  selectionDraft = void 0;
  pendingSelectionGesture = void 0;
  selectionDrag = void 0;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  notifyAssetStateChanged();
  await present();
  normalizeTimelineSession();
  renderTimeline();
  updateSelectionActionButtons();
  updateSelectionStatus(`scope=${state.activeCelId} \xB7 selection=none`);
  drawOverlay();
  updateHistoryButtons();
  setStatus(`Undo restored ${result.operationId} locally; no Realtime operation sent.`);
});
redoControl.addEventListener("click", async () => {
  if (cancelUncommittedSelectionWork("Active selection preview cancelled; press Redo again to redo history.")) return;
  const result = history.redo();
  if (result === void 0) {
    setStatus("Nothing to redo.", "error");
    return;
  }
  state = result.state;
  core = new EditorCore(state, {
    instrumentation
  });
  syncClientSequencesFromState();
  saveDrawProjectState();
  selection = void 0;
  selectionDraft = void 0;
  pendingSelectionGesture = void 0;
  selectionDrag = void 0;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  notifyAssetStateChanged();
  await present();
  normalizeTimelineSession();
  renderTimeline();
  updateSelectionActionButtons();
  updateSelectionStatus(`scope=${state.activeCelId} \xB7 selection=none`);
  drawOverlay();
  updateHistoryButtons();
  setStatus(`Redo restored ${result.operationId} locally; no Realtime operation sent.`);
});
var drawInteraction;
var tilemapPointerGesture;
var tilemapPresentFrame;
var viewportPanPointerId;
var viewportPanStart = {
  x: 0,
  y: 0,
  panX: 0,
  panY: 0
};
var canvasPointers = /* @__PURE__ */ new Map();
var touchPanAfterPinch;
var pinchGesture;
function pointerDistance(left, right) {
  return Math.max(1, Math.hypot(left.x - right.x, left.y - right.y));
}
function pointerCenter(left, right) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2
  };
}
function captureViewportPointer(pointerId) {
  try {
    viewportWrapElement?.setPointerCapture(pointerId);
  } catch {
  }
}
function releaseViewportPointer(pointerId) {
  try {
    if (viewportWrapElement?.hasPointerCapture(pointerId)) {
      viewportWrapElement.releasePointerCapture(pointerId);
    }
  } catch {
  }
}
function cancelActiveStroke() {
  const pointerId = drawInteraction?.activePointerId;
  if (pointerId !== void 0 && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  drawInteraction?.cancel("EXPLICIT_CANCEL");
  drawInteraction = void 0;
  drawOverlay();
}
function selectionToolCanMove() {
  const tool = currentBasicTool();
  return tool === "select-rect" || tool === "select-ellipse" || tool === "select-lasso" || tool === "select-color" || tool === "select-polygon" || tool === "move";
}
function pointIsSelectedPixel(snapshot, point) {
  if (snapshot === void 0) return false;
  return snapshot.pixels.some((candidate) => candidate.x === point.x && candidate.y === point.y);
}
function pointIsInsideSelection(point) {
  if (selection === void 0) return false;
  return pointInSelectionBounds(point, selection.mask.regions);
}
function pointIsInsideSelectionDraft(point) {
  if (selectionDraft?.snapshot === void 0) return false;
  return pointInSelectionBounds(point, selectionDraft.snapshot.mask.regions);
}
function cancelSelectionDrag() {
  if (selectionDrag !== void 0 && canvas.hasPointerCapture(selectionDrag.pointerId)) canvas.releasePointerCapture(selectionDrag.pointerId);
  selectionDrag = void 0;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  updateSelectionActionButtons();
  updateSelectionStatus(selection === void 0 ? `scope=${state.activeCelId} \xB7 selection=none` : `scope=${selection.scope.celId} \xB7 ${selection.pixels.length}px \xB7 ${selection.mask.kind} \xB7 preview=cancelled`);
  drawOverlay();
  markCanonicalMetrics();
}
function beginSelectionDrag(event, point) {
  const currentSelection = selection;
  if (currentSelection === void 0) return false;
  if (event.cancelable) event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  const duplicate = event.altKey;
  selectionDrag = {
    pointerId: event.pointerId,
    start: point,
    lastDelta: {
      x: 0,
      y: 0
    },
    duplicate
  };
  selectionInteractionGeneration += 1;
  transformOperation.value = "MOVE";
  transformDx.value = "0";
  transformDy.value = "0";
  const transform2 = {
    ...currentTransform(),
    operation: "MOVE"
  };
  if (duplicate) {
    clipboard = createClipboardPayload(state, currentSelection, "draw2-selection-alt-drag");
    pasteMode = true;
    transformSession = createClipboardPasteSession(state, clipboard, transform2, `paste-drag-${state.projectId}-${currentSelection.mask.selectionVersion}-0-0`);
    transformPreview = previewClipboardPaste(state, clipboard, transformSession);
  } else {
    pasteMode = false;
    transformSession = createTransformSession(currentSelection, transform2, `transform-drag-${state.projectId}-${currentSelection.mask.selectionVersion}-0-0`);
    transformPreview = previewTransform(currentSelection, transformSession);
  }
  syncWorkspaceEditCommandState();
  updateSelectionStatus(`scope=${currentSelection.scope.celId} \xB7 ${currentSelection.pixels.length}px \xB7 ${duplicate ? "duplicate" : "move"}=0,0 \xB7 preview=only`);
  markPreviewMetrics();
  drawOverlay();
  return true;
}
function cancelTilemapPointerGestureForPinch() {
  const gesture = tilemapPointerGesture;
  if (gesture === void 0) return;
  state = gesture.before;
  core = new EditorCore(state, {
    instrumentation
  });
  tilemapPointerGesture = void 0;
  scheduleTilemapPresent();
}
function updateSelectionDragPreview(point) {
  if (selectionDrag === void 0 || selection === void 0) return;
  const dx = point.x - selectionDrag.start.x;
  const dy = point.y - selectionDrag.start.y;
  if (dx === selectionDrag.lastDelta.x && dy === selectionDrag.lastDelta.y) {
    return;
  }
  selectionDrag.lastDelta = {
    x: dx,
    y: dy
  };
  transformOperation.value = "MOVE";
  transformDx.value = String(dx);
  transformDy.value = String(dy);
  const transform2 = {
    ...currentTransform(),
    operation: "MOVE",
    dx,
    dy
  };
  if (selectionDrag.duplicate && clipboard !== void 0) {
    pasteMode = true;
    transformSession = createClipboardPasteSession(state, clipboard, transform2, `paste-drag-${state.projectId}-${selection.mask.selectionVersion}-${dx}-${dy}`);
    transformPreview = previewClipboardPaste(state, clipboard, transformSession);
  } else {
    pasteMode = false;
    transformSession = createTransformSession(selection, transform2, `transform-drag-${state.projectId}-${selection.mask.selectionVersion}-${dx}-${dy}`);
  }
  if (!selectionDrag.duplicate || clipboard === void 0) {
    transformPreview = previewTransform(selection, transformSession);
  }
  updateSelectionStatus(`scope=${selection.scope.celId} \xB7 ${selection.pixels.length}px \xB7 ${selectionDrag.duplicate ? "duplicate" : "move"}=${dx},${dy} \xB7 preview=only`);
  markPreviewMetrics();
  drawOverlay();
}
function beginPendingSelectionGesture(event, point) {
  const tool = currentBasicTool();
  if (!selectionToolCanMove()) return;
  const mode = selectionEditModeFromModifiers(event.shiftKey, event.altKey, selectionEditMode);
  pendingSelectionGesture = {
    pointerId: event.pointerId,
    tool,
    mode,
    ...tool === "select-color" ? {
      colorSelectionMode: normalizeColorSelectionMode(toolOptions.selectionMode)
    } : {},
    points: [
      point
    ]
  };
  canvas.setPointerCapture(event.pointerId);
  updateSelectionActionButtons();
  updateSelectionStatus(`draft=${selectionModeLabel(mode)} \xB7 drawing ${tool === "select-lasso" ? "lasso" : tool === "select-polygon" ? "polygon" : "selection"} \xB7 release to preview`);
  if (event.cancelable) event.preventDefault();
  drawOverlay();
}
function beginGridSelectionGesture(event, point) {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0 || currentBasicTool() !== "select-rect") return;
  const mode = selectionEditModeFromModifiers(event.shiftKey, event.altKey, selectionEditMode);
  const anchor = {
    x: Math.floor(point.x / SELECTION_GRID_SIZE) * SELECTION_GRID_SIZE,
    y: Math.floor(point.y / SELECTION_GRID_SIZE) * SELECTION_GRID_SIZE
  };
  pendingSelectionGesture = {
    pointerId: event.pointerId,
    tool: "select-rect",
    mode,
    points: [
      anchor
    ],
    grid: {
      size: SELECTION_GRID_SIZE,
      anchor
    }
  };
  canvas.setPointerCapture(event.pointerId);
  updateSelectionActionButtons();
  updateSelectionStatus(`draft=${selectionModeLabel(mode)} \xB7 16px grid \xB7 drag to extend \xB7 release to preview`);
  if (event.cancelable) event.preventDefault();
  drawOverlay();
}
function isSelectionGridDoubleClick(event, point) {
  const now = performance.now();
  const previous = lastSelectionClick;
  const nativeDoubleClick = event.detail >= 2;
  const customDoubleClick = previous !== void 0 && now - previous.timeMs <= SELECTION_DOUBLE_CLICK_WINDOW_MS && Math.abs(previous.point.x - point.x) <= 1 && Math.abs(previous.point.y - point.y) <= 1;
  lastSelectionClick = nativeDoubleClick || customDoubleClick ? void 0 : {
    timeMs: now,
    point: {
      ...point
    }
  };
  return nativeDoubleClick || customDoubleClick;
}
function updatePendingSelectionGesture(point) {
  if (pendingSelectionGesture === void 0) return;
  const nextPoint = pendingSelectionGesture.grid === void 0 ? point : {
    x: Math.floor(point.x / pendingSelectionGesture.grid.size) * pendingSelectionGesture.grid.size,
    y: Math.floor(point.y / pendingSelectionGesture.grid.size) * pendingSelectionGesture.grid.size
  };
  const last = pendingSelectionGesture.points[pendingSelectionGesture.points.length - 1];
  if (last?.x === nextPoint.x && last.y === nextPoint.y) return;
  if (pendingSelectionGesture.grid === void 0) {
    lastSelectionClick = void 0;
  }
  pendingSelectionGesture.points.push(nextPoint);
  drawOverlay();
}
async function dismissSelectionFromOutsideClick() {
  if (selectionDraft !== void 0) {
    selectionDraft = void 0;
    updateSelectionActionButtons();
  }
  if (transformSession !== void 0 && (transformPreview !== void 0 || pasteMode)) {
    const committed = await commitActiveTransform();
    if (!committed) return;
  }
  clearCommittedSelection("Selection cleared by clicking outside.");
}
function hasPendingSelectionInteraction() {
  return selection !== void 0 || selectionDraft !== void 0 || pendingSelectionGesture !== void 0 || transformSession !== void 0;
}
async function finishPendingSelectionGesture() {
  const gesture = pendingSelectionGesture;
  if (gesture === void 0) return;
  pendingSelectionGesture = void 0;
  const asset = state.assets[state.activeAssetId];
  const first = gesture.points[0];
  const last = gesture.points[gesture.points.length - 1] ?? first;
  if (asset === void 0 || first === void 0 || last === void 0) {
    updateSelectionActionButtons();
    drawOverlay();
    return;
  }
  const isClick = gesture.points.every((point) => point.x === first.x && point.y === first.y);
  const hasSelectionState = selection !== void 0 || selectionDraft !== void 0 || transformSession !== void 0;
  const clickInsideSelection = selection !== void 0 ? pointIsInsideSelection(first) : pointIsInsideSelectionDraft(first);
  const clickSelectionTool = gesture.tool === "select-color" || gesture.grid !== void 0;
  if (isClick && hasSelectionState && !clickInsideSelection && !clickSelectionTool) {
    updateSelectionActionButtons();
    drawOverlay();
    await dismissSelectionFromOutsideClick();
    return;
  }
  if (gesture.grid !== void 0) {
    const gridEnd = gesture.points.at(-1) ?? gesture.grid.anchor;
    const bounds = snapSelectionBoundsToGrid(gesture.grid.anchor, gridEnd, asset, gesture.grid.size);
    beginSelectionFromPoints(rectanglePointList(bounds), "rectangle", gesture.mode, "16px grid selection created.");
  } else if (gesture.tool === "select-color") {
    const mode = normalizeColorSelectionMode(gesture.colorSelectionMode);
    const picked = selectConfiguredColor(asset, first, {
      ...toolOptions,
      selectionMode: mode
    });
    beginSelectionFromPoints(picked.pixels, mode === "opaque" ? "alpha" : "magic", gesture.mode, `${colorSelectionModeLabel(mode)} color selection created.`);
  } else if (gesture.tool === "select-lasso") {
    const picked = selectByLasso(asset.raster, gesture.points);
    beginSelectionFromPoints(picked.pixels, "freehand", gesture.mode, "Lasso selection created.");
  } else if (gesture.tool === "select-polygon") {
    const picked = polygonSelectionPoints(asset.raster, gesture.points);
    beginSelectionFromPoints(picked, "freehand", gesture.mode, `Polygon selection created \xB7 ${gesture.points.length} vertices.`);
  } else if (gesture.tool === "select-ellipse") {
    const picked = selectByEllipse(asset.raster, first, last);
    beginSelectionFromPoints(picked.pixels, "ellipse", gesture.mode, "Ellipse selection created.");
  } else {
    const bounds = normalizeToolBounds(first, last, asset);
    beginSelectionFromPoints(rectanglePointList(bounds), "rectangle", gesture.mode, "Rectangle selection created.");
  }
  commitSelectionDraft();
  updateSelectionActionButtons();
  drawOverlay();
}
function beginViewportPan(event) {
  viewportPanPointerId = event.pointerId;
  viewportPanStart = {
    x: event.clientX,
    y: event.clientY,
    panX: viewportPanX,
    panY: viewportPanY
  };
  canvas.setPointerCapture(event.pointerId);
}
function cancelCanvasGestureForPinch() {
  cancelActiveStroke();
  cancelSelectionDrag();
  cancelTilemapPointerGestureForPinch();
  if (pendingSelectionGesture !== void 0) {
    if (canvas.hasPointerCapture(pendingSelectionGesture.pointerId)) {
      canvas.releasePointerCapture(pendingSelectionGesture.pointerId);
    }
    pendingSelectionGesture = void 0;
  }
  mirrorGuideDrag = void 0;
  updateSelectionActionButtons();
  drawOverlay();
}
function startPinchGesture() {
  if (pinchGesture !== void 0) return;
  const entries = [
    ...canvasPointers.entries()
  ].slice(0, 2);
  const first = entries[0];
  const second = entries[1];
  if (first === void 0 || second === void 0) return;
  cancelCanvasGestureForPinch();
  const center = pointerCenter(first[1], second[1]);
  const sourcePoint = sourcePointForViewportClient(center.x, center.y);
  pinchGesture = {
    pointerIds: [
      first[0],
      second[0]
    ],
    distance: pointerDistance(first[1], second[1]),
    zoom: currentViewportDisplayScale(),
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    lastCenterX: center.x,
    lastCenterY: center.y
  };
  touchPanAfterPinch = void 0;
  viewportPanPointerId = void 0;
  captureViewportPointer(first[0]);
  captureViewportPointer(second[0]);
}
function updatePinchGesture() {
  const gesture = pinchGesture;
  if (gesture === void 0) return;
  const left = canvasPointers.get(gesture.pointerIds[0]);
  const right = canvasPointers.get(gesture.pointerIds[1]);
  if (left === void 0 || right === void 0) return;
  const center = pointerCenter(left, right);
  gesture.lastCenterX = center.x;
  gesture.lastCenterY = center.y;
  const nextZoom = pinchZoomFromDistance(gesture.zoom, gesture.distance, pointerDistance(left, right), visualSettings.zoomSensitivity, false);
  zoomViewportAtClient(center.x, center.y, nextZoom, {
    sourcePoint: {
      x: gesture.sourceX,
      y: gesture.sourceY
    },
    snap: false
  });
}
function finishPinchGesture() {
  const gesture = pinchGesture;
  if (gesture === void 0) return;
  const snappedZoom = snapPixelPerfectZoom(currentViewportDisplayScale());
  zoomViewportAtClient(gesture.lastCenterX, gesture.lastCenterY, snappedZoom, {
    sourcePoint: {
      x: gesture.sourceX,
      y: gesture.sourceY
    },
    snap: true
  });
  pinchGesture = void 0;
}
function beginTouchPanAfterPinch() {
  const remaining = [
    ...canvasPointers.entries()
  ][0];
  if (remaining === void 0) return;
  touchPanAfterPinch = {
    pointerId: remaining[0],
    startX: remaining[1].x,
    startY: remaining[1].y,
    panX: viewportPanX,
    panY: viewportPanY
  };
  captureViewportPointer(remaining[0]);
}
function handleViewportTouchPointerEnd(event, cancelled) {
  if (event.pointerType !== "touch") return false;
  if (pinchGesture !== void 0) {
    const gesture = pinchGesture;
    if (!gesture.pointerIds.includes(event.pointerId)) return true;
    canvasPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
    if (!cancelled) updatePinchGesture();
    canvasPointers.delete(event.pointerId);
    const hasRemainingPointer = canvasPointers.size > 0;
    finishPinchGesture();
    releaseViewportPointer(event.pointerId);
    if (hasRemainingPointer) beginTouchPanAfterPinch();
    return true;
  }
  if (touchPanAfterPinch?.pointerId !== event.pointerId) return false;
  canvasPointers.delete(event.pointerId);
  touchPanAfterPinch = void 0;
  releaseViewportPointer(event.pointerId);
  applyViewportTransform();
  return true;
}
function pointerSampleFromEvent(event, phase) {
  const point = pointFromPointer(event);
  if (point === void 0) return void 0;
  const pointerType = event.pointerType === "mouse" || event.pointerType === "touch" || event.pointerType === "pen" ? event.pointerType : "unknown";
  return {
    pointerId: event.pointerId,
    phase,
    pointerType,
    target: "canvas",
    isPrimary: event.isPrimary,
    button: event.button,
    buttons: event.buttons,
    x: point.x,
    y: point.y,
    pressure: event.pressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    timeMs: Number.isFinite(event.timeStamp) ? Math.max(0, event.timeStamp) : 0
  };
}
function addPointerSamples(event) {
  if (drawInteraction === void 0) return;
  const coalesced = event.getCoalescedEvents?.() ?? [
    event
  ];
  for (const sample of coalesced) {
    const pointerSample = pointerSampleFromEvent(sample, "move");
    if (pointerSample !== void 0) drawInteraction.handle(pointerSample);
  }
}
function scheduleTilemapPresent() {
  if (tilemapPresentFrame !== void 0) return;
  tilemapPresentFrame = requestAnimationFrame(() => {
    tilemapPresentFrame = void 0;
    void present();
  });
}
function tilemapCellCoordinates(map, point) {
  const x = Math.floor(point.x / map.cellSize);
  const y = Math.floor(point.y / map.cellSize);
  if (x < 0 || y < 0 || x >= map.columns || y >= map.rows) return void 0;
  return {
    x,
    y
  };
}
function updateTilemapPointerGesture(point) {
  const gesture = tilemapPointerGesture;
  if (gesture === void 0) return;
  const map = state.tilemaps?.[gesture.mapId];
  if (map === void 0) return;
  const coordinates = tilemapCellCoordinates(map, point);
  if (coordinates === void 0) return;
  const key = `${coordinates.x}:${coordinates.y}`;
  if (key === gesture.lastCellKey) return;
  gesture.lastCellKey = key;
  const nextMap = gesture.erase ? clearDraw2TilemapCell(map, coordinates.x, coordinates.y) : selectedTileSource === void 0 ? map : setDraw2TilemapCell(map, coordinates.x, coordinates.y, {
    sourceAssetId: selectedTileSource.sourceAssetId,
    sourceX: selectedTileSource.sourceX,
    sourceY: selectedTileSource.sourceY,
    transform: "NONE"
  });
  if (nextMap === map) return;
  state = {
    ...state,
    tilemaps: {
      ...state.tilemaps ?? {},
      [map.id]: nextMap
    }
  };
  core = new EditorCore(state, {
    instrumentation
  });
  gesture.changed = true;
  scheduleTilemapPresent();
}
function beginTilemapPointerGesture(event, point) {
  if (!activeLayerIsTilemap()) return false;
  const layer2 = state.layers.find((item) => item.layerTrackId === state.activeLayerId);
  if (layer2?.locked === true) {
    setStatus("\u30BF\u30A4\u30EB\u30DE\u30C3\u30D7\u30EC\u30A4\u30E4\u30FC\u304C\u30ED\u30C3\u30AF\u3055\u308C\u3066\u3044\u307E\u3059\u3002", "error");
    return true;
  }
  const map = activeTilemap() ?? ensureTilemapFor(state.activeLayerId, state.activeFrameId);
  if (map === void 0) {
    setStatus("\u30BF\u30A4\u30EB\u30DE\u30C3\u30D7\u3092\u6E96\u5099\u3067\u304D\u307E\u305B\u3093\u3002", "error");
    return true;
  }
  const erase = event.button === 2 || currentBasicTool() === "eraser";
  if (!erase && selectedTileSource === void 0) {
    setStatus("\u5148\u306BTileset\u306E\u30BB\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error");
    return true;
  }
  if (!erase && selectedTileSource !== void 0 && selectedTileSource.cellSize !== map.cellSize) {
    setStatus(`Tileset\u306E${selectedTileSource.cellSize}px\u3068Tilemap\u306E${map.cellSize}px\u304C\u9055\u3044\u307E\u3059\u3002\u540C\u3058\u30BB\u30EB\u30B5\u30A4\u30BA\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002`, "error");
    return true;
  }
  tilemapPointerGesture = {
    pointerId: event.pointerId,
    mapId: map.id,
    before: state,
    erase,
    lastCellKey: "",
    changed: false
  };
  canvas.setPointerCapture(event.pointerId);
  updateTilemapPointerGesture(point);
  if (event.cancelable) event.preventDefault();
  return true;
}
async function finishTilemapPointerGesture(cancelled = false) {
  const gesture = tilemapPointerGesture;
  if (gesture === void 0) return;
  tilemapPointerGesture = void 0;
  if (cancelled) {
    state = gesture.before;
    core = new EditorCore(state, {
      instrumentation
    });
    await present();
    return;
  }
  if (!gesture.changed) return;
  tilemapOperationSequence += 1;
  const operationId = `draw2-tilemap-${state.projectId}-${tilemapOperationSequence}`;
  history.record(gesture.before, state, operationId, gesture.erase ? "tilemap.erase" : "tilemap.place");
  renderTimeline();
  saveDrawProjectState("tilemap-edit");
  notifyAssetStateChanged();
  await present();
  updateHistoryButtons();
  const map = activeTilemap();
  setStatus(`${gesture.erase ? "\u30BF\u30A4\u30EB\u3092\u6D88\u53BB" : "\u30BF\u30A4\u30EB\u3092\u914D\u7F6E"}\u3057\u307E\u3057\u305F \xB7 ${draw2TilemapCellCount(map)}\u30BB\u30EB \xB7 Undo\u5BFE\u5FDC`);
}
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  if (event.button === 2 && !activeLayerIsTilemap()) return;
  cancelViewportCenterReturn();
  if (event.pointerType === "touch") {
    canvasPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
  }
  if (pinchGesture !== void 0 && event.pointerType === "touch") {
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (event.pointerType === "touch" && canvasPointers.size >= 2) {
    zoomWheelAccumulator = 0;
    startPinchGesture();
    if (event.cancelable) event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button === 1 || currentBasicTool() === "pan" || event.altKey && !selectionToolCanMove()) {
    if (event.cancelable) event.preventDefault();
    beginViewportPan(event);
    return;
  }
  const point = pointFromPointer(event);
  if (point !== void 0 && (event.button === 0 || event.button === 2) && currentBasicTool() !== "pan" && !(event.altKey && !selectionToolCanMove()) && beginTilemapPointerGesture(event, point)) return;
  if (event.button === 0 && point !== void 0 && currentBasicTool() === "select-rect") {
    const plainSelectionClick = !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey;
    if (plainSelectionClick && isSelectionGridDoubleClick(event, point)) {
      beginGridSelectionGesture(event, point);
      return;
    }
    if (!plainSelectionClick) lastSelectionClick = void 0;
  }
  if (event.button === 0 && point !== void 0 && currentBasicTool() === "move" && selection === void 0) {
    if (!selectActiveCelContentForMove()) return;
    if (beginSelectionDrag(event, point)) return;
  }
  if (event.button === 0 && point !== void 0 && selection !== void 0 && selectionToolCanMove() && !event.shiftKey && pointIsInsideSelection(point)) {
    if (beginSelectionDrag(event, point)) return;
  }
  if (event.button === 0 && point !== void 0 && selectionToolCanMove()) {
    beginPendingSelectionGesture(event, point);
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return;
  drawInteraction = new Draw2InteractionKernel({
    tool: currentBasicTool(),
    bounds: {
      width: asset.width,
      height: asset.height
    },
    colorIndex: selectedColor,
    toolOptions: {
      ...toolOptions
    },
    commitIngress: drawCommitIngress,
    onCommit: (commit) => commitInteractionSession(commit),
    onCommitError: (error2) => {
      syncClientSequencesFromState();
      setStatus(error2 instanceof Error ? error2.message : "Drawing commit failed.", "error");
    }
  });
  const pointerSample = pointerSampleFromEvent(event, "down");
  if (pointerSample !== void 0) drawInteraction.handle(pointerSample);
  hoverPoint = drawInteraction.session?.points[0];
  drawOverlay();
});
canvas.addEventListener("pointermove", (event) => {
  if (canvasPointers.has(event.pointerId)) {
    canvasPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
  }
  if (pinchGesture !== void 0) {
    updatePinchGesture();
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (touchPanAfterPinch?.pointerId === event.pointerId) {
    const pan = touchPanAfterPinch;
    viewportPanX = pan.panX + event.clientX - pan.startX;
    viewportPanY = pan.panY + event.clientY - pan.startY;
    applyViewportTransform();
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (mirrorGuideDrag?.pointerId === event.pointerId) {
    moveMirrorGuideFromClient(mirrorGuideDrag.axis, event.clientX, event.clientY);
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (viewportPanPointerId === event.pointerId) {
    viewportPanX = viewportPanStart.panX + event.clientX - viewportPanStart.x;
    viewportPanY = viewportPanStart.panY + event.clientY - viewportPanStart.y;
    applyViewportTransform();
    if (event.cancelable) event.preventDefault();
    return;
  }
  const point = pointFromPointer(event);
  if (point !== void 0) hoverPoint = point;
  if (tilemapPointerGesture?.pointerId === event.pointerId) {
    if (point !== void 0) updateTilemapPointerGesture(point);
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (selectionDrag?.pointerId === event.pointerId) {
    lastSelectionClick = void 0;
    if (point !== void 0) updateSelectionDragPreview(point);
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (pendingSelectionGesture?.pointerId === event.pointerId) {
    if (point !== void 0 && pendingSelectionGesture.tool !== "select-color") updatePendingSelectionGesture(point);
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (drawInteraction?.activePointerId !== event.pointerId || (event.buttons & 1) === 0) {
    drawOverlay();
    return;
  }
  addPointerSamples(event);
  drawOverlay();
});
canvas.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") {
    if (handleViewportTouchPointerEnd(event, false)) {
      if (event.cancelable) event.preventDefault();
      return;
    }
    canvasPointers.delete(event.pointerId);
  }
  if (pinchGesture !== void 0) {
    return;
  }
  if (tilemapPointerGesture?.pointerId === event.pointerId) {
    const point = pointFromPointer(event);
    if (point !== void 0) updateTilemapPointerGesture(point);
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    void finishTilemapPointerGesture(false);
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (mirrorGuideDrag?.pointerId === event.pointerId) {
    mirrorGuideClickSuppressed = mirrorGuideDrag.moved;
    mirrorGuideDrag = void 0;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    drawOverlay();
    return;
  }
  if (viewportPanPointerId === event.pointerId) {
    viewportPanPointerId = void 0;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    return;
  }
  if (selectionDrag?.pointerId === event.pointerId) {
    const point = pointFromPointer(event);
    if (point !== void 0) updateSelectionDragPreview(point);
    selectionDrag = void 0;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (transformSession !== void 0 && (transformSession.transform.dx !== 0 || transformSession.transform.dy !== 0)) void commitActiveTransform();
    else {
      transformSession = void 0;
      transformPreview = void 0;
      updateSelectionStatus(selection === void 0 ? `scope=${state.activeCelId} \xB7 selection=none` : `scope=${selection.scope.celId} \xB7 ${selection.pixels.length}px \xB7 ${selection.mask.kind} \xB7 preview=none`);
      drawOverlay();
    }
    return;
  }
  if (pendingSelectionGesture?.pointerId === event.pointerId) {
    void finishPendingSelectionGesture();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    return;
  }
  if (drawInteraction?.activePointerId !== event.pointerId) return;
  const pointerSample = pointerSampleFromEvent(event, "up");
  if (pointerSample !== void 0) drawInteraction.handle(pointerSample);
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  drawInteraction = void 0;
  drawOverlay();
});
canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerType === "touch") {
    if (handleViewportTouchPointerEnd(event, true)) {
      if (event.cancelable) event.preventDefault();
      return;
    }
    canvasPointers.delete(event.pointerId);
  }
  if (viewportPanPointerId === event.pointerId) {
    viewportPanPointerId = void 0;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    cancelActiveStroke();
    return;
  }
  if (tilemapPointerGesture?.pointerId === event.pointerId) {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    void finishTilemapPointerGesture(true);
    return;
  }
  if (mirrorGuideDrag?.pointerId === event.pointerId) {
    mirrorGuideClickSuppressed = mirrorGuideDrag.moved;
    mirrorGuideDrag = void 0;
    drawOverlay();
    return;
  }
  if (selectionDrag?.pointerId === event.pointerId) {
    cancelSelectionDrag();
    setStatus("Selection move cancelled; Canonical Raster unchanged.", "error");
    return;
  }
  if (pendingSelectionGesture?.pointerId === event.pointerId) {
    lastSelectionClick = void 0;
    pendingSelectionGesture = void 0;
    updateSelectionActionButtons();
    drawOverlay();
    setStatus("Selection draft cancelled before confirmation.", "error");
    return;
  }
  if (drawInteraction?.activePointerId !== event.pointerId) return;
  const pointerSample = pointerSampleFromEvent(event, "cancel");
  if (pointerSample !== void 0) drawInteraction.handle(pointerSample);
  drawInteraction = void 0;
  drawOverlay();
  setStatus("Drawing cancelled before commit.", "error");
});
canvas.addEventListener("lostpointercapture", (event) => {
  if (event.pointerType === "touch" && (pinchGesture !== void 0 || touchPanAfterPinch !== void 0)) return;
  if (event.pointerType === "touch") canvasPointers.delete(event.pointerId);
  if (viewportPanPointerId === event.pointerId) {
    viewportPanPointerId = void 0;
    cancelActiveStroke();
    return;
  }
  if (tilemapPointerGesture?.pointerId === event.pointerId) {
    void finishTilemapPointerGesture(true);
    return;
  }
  if (mirrorGuideDrag?.pointerId === event.pointerId) {
    mirrorGuideClickSuppressed = mirrorGuideDrag.moved;
    mirrorGuideDrag = void 0;
    drawOverlay();
    return;
  }
  if (selectionDrag?.pointerId === event.pointerId) {
    cancelSelectionDrag();
    setStatus("Selection move cancelled after pointer capture was lost.", "error");
    return;
  }
  if (pendingSelectionGesture?.pointerId === event.pointerId) {
    lastSelectionClick = void 0;
    pendingSelectionGesture = void 0;
    updateSelectionActionButtons();
    drawOverlay();
    setStatus("Selection draft cancelled after pointer capture was lost.", "error");
    return;
  }
  if (drawInteraction?.activePointerId !== event.pointerId) return;
  const pointerSample = pointerSampleFromEvent(event, "lost_capture");
  if (pointerSample !== void 0) drawInteraction.handle(pointerSample);
  drawInteraction = void 0;
  drawOverlay();
  setStatus("Drawing cancelled after pointer capture was lost.", "error");
});
window.addEventListener("blur", () => {
  if (drawInteraction !== void 0) {
    cancelActiveStroke();
    setStatus("Drawing cancelled by browser interruption.", "error");
  }
  if (cancelUncommittedSelectionWork()) {
    setStatus("Selection/transform preview cancelled by browser interruption.", "error");
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && drawInteraction !== void 0) {
    cancelActiveStroke();
    setStatus("Drawing cancelled by browser interruption.", "error");
  }
  if (document.hidden && cancelUncommittedSelectionWork()) {
    setStatus("Selection/transform preview cancelled by browser interruption.", "error");
  }
});
canvas.addEventListener("pointerleave", () => {
  if (drawInteraction?.activePointerId === void 0 && selectionDrag === void 0 && pendingSelectionGesture === void 0 && mirrorGuideDrag === void 0) hoverPoint = void 0;
  drawOverlay();
});
canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  cancelUncommittedSelectionWork("Selection/transform cancelled by right-click; Canonical Raster unchanged.");
});
viewportWrapElement?.addEventListener("pointermove", (event) => {
  if ((event.pointerType === "mouse" || event.pointerType === "pen") && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    lastViewportPointerClient = {
      x: event.clientX,
      y: event.clientY
    };
  }
}, {
  passive: true
});
viewportWrapElement?.addEventListener("mousemove", (event) => {
  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    lastViewportPointerClient = {
      x: event.clientX,
      y: event.clientY
    };
  }
}, {
  passive: true
});
viewportWrapElement?.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch") return;
  if (pinchGesture !== void 0 || touchPanAfterPinch !== void 0) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (canvasPointers.size >= 2) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  canvasPointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });
  if (canvasPointers.size < 2) return;
  zoomWheelAccumulator = 0;
  startPinchGesture();
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
}, {
  capture: true
});
viewportWrapElement?.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "touch") return;
  if (pinchGesture !== void 0) {
    if (pinchGesture.pointerIds.includes(event.pointerId)) {
      canvasPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });
      updatePinchGesture();
    }
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (touchPanAfterPinch?.pointerId === event.pointerId) {
    const pan = touchPanAfterPinch;
    canvasPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
    viewportPanX = pan.panX + event.clientX - pan.startX;
    viewportPanY = pan.panY + event.clientY - pan.startY;
    applyViewportTransform();
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
}, {
  capture: true
});
var handleViewportTouchEndEvent = (event, cancelled) => {
  if (event.pointerType !== "touch") return;
  const handled = handleViewportTouchPointerEnd(event, cancelled);
  if (!handled) {
    canvasPointers.delete(event.pointerId);
    return;
  }
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
};
viewportWrapElement?.addEventListener("pointerup", (event) => handleViewportTouchEndEvent(event, false), {
  capture: true
});
viewportWrapElement?.addEventListener("pointercancel", (event) => handleViewportTouchEndEvent(event, true), {
  capture: true
});
viewportWrapElement?.addEventListener("lostpointercapture", (event) => handleViewportTouchEndEvent(event, true), {
  capture: true
});
viewportWrapElement?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const targetElement = event.target instanceof Element ? event.target : void 0;
  const mirrorHandle = targetElement?.closest(".draw2-mirror-line-toggle");
  const handleAxis = mirrorHandle === mirrorToggleX ? "x" : mirrorHandle === mirrorToggleY ? "y" : mirrorHandle === mirrorToggleDiagonalDown ? "diagonal-down" : mirrorHandle === mirrorToggleDiagonalUp ? "diagonal-up" : void 0;
  if (mirrorEnabled && handleAxis !== void 0) {
    mirrorGuideDrag = {
      pointerId: event.pointerId,
      axis: handleAxis,
      moved: false,
      start: {
        x: event.clientX,
        y: event.clientY
      }
    };
    viewportWrapElement.setPointerCapture(event.pointerId);
    return;
  }
  if (event.target === canvas || !isOutsideCanvasClient(event.clientX, event.clientY)) return;
  if (mirrorEnabled) {
    const axis = mirrorGuideAxisAtClient(event.clientX, event.clientY);
    if (axis !== void 0) {
      mirrorGuideDrag = {
        pointerId: event.pointerId,
        axis,
        moved: false,
        start: {
          x: event.clientX,
          y: event.clientY
        }
      };
      viewportWrapElement.setPointerCapture(event.pointerId);
      if (event.cancelable) event.preventDefault();
      return;
    }
  }
  if (event.pointerType === "touch") return;
  if (targetElement?.closest("button, a, input, select, textarea, [role=button]") !== null) return;
  if (!hasPendingSelectionInteraction()) return;
  if (event.cancelable) event.preventDefault();
  void dismissSelectionFromOutsideClick();
});
viewportWrapElement?.addEventListener("pointermove", (event) => {
  if (mirrorGuideDrag?.pointerId !== event.pointerId) return;
  if (!mirrorGuideDrag.moved) {
    const distance = Math.hypot(event.clientX - mirrorGuideDrag.start.x, event.clientY - mirrorGuideDrag.start.y);
    if (distance < MIRROR_GUIDE_DRAG_THRESHOLD_PX) return;
    mirrorGuideDrag.moved = true;
  }
  moveMirrorGuideFromClient(mirrorGuideDrag.axis, event.clientX, event.clientY);
  scheduleDraw2EditorPreferencesSave();
  if (event.cancelable) event.preventDefault();
});
var finishMirrorGuideDrag = (event) => {
  if (mirrorGuideDrag?.pointerId !== event.pointerId) return;
  const moved = mirrorGuideDrag.moved;
  mirrorGuideDrag = void 0;
  mirrorGuideClickSuppressed = moved;
  if (viewportWrapElement?.hasPointerCapture(event.pointerId)) {
    viewportWrapElement.releasePointerCapture(event.pointerId);
  }
  if (moved) scheduleDraw2EditorPreferencesSave();
  drawOverlay();
};
viewportWrapElement?.addEventListener("pointerup", finishMirrorGuideDrag);
viewportWrapElement?.addEventListener("pointercancel", finishMirrorGuideDrag);
viewportWrapElement?.addEventListener("lostpointercapture", (event) => {
  const pointerId = event.pointerId;
  if (mirrorGuideDrag?.pointerId === pointerId) {
    mirrorGuideClickSuppressed = mirrorGuideDrag.moved;
    mirrorGuideDrag = void 0;
    drawOverlay();
  }
});
function isStepControl(target) {
  return target instanceof HTMLSelectElement || target instanceof HTMLInputElement && target.type === "range";
}
function stepControlValue(control, direction) {
  if (control instanceof HTMLSelectElement) {
    const nextIndex = Math.max(0, Math.min(control.options.length - 1, control.selectedIndex + direction));
    if (nextIndex === control.selectedIndex) return;
    control.selectedIndex = nextIndex;
    control.dispatchEvent(new Event("change", {
      bubbles: true
    }));
    return;
  }
  const minimum = Number(control.min || 0);
  const maximum = Number(control.max || 100);
  const step = Number(control.step || 1);
  const current = Number(control.value);
  const next = Math.max(minimum, Math.min(maximum, current + step * direction));
  if (next === current) return;
  control.value = String(next);
  control.dispatchEvent(new Event("input", {
    bubbles: true
  }));
}
var stepSwipeControl;
var stepSwipeStartY = 0;
workspaceFrameElement?.addEventListener("wheel", (event) => {
  if (!isStepControl(event.target)) return;
  if (event.cancelable) event.preventDefault();
  stepControlValue(event.target, event.deltaY < 0 ? 1 : -1);
}, {
  passive: false
});
workspaceFrameElement?.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch" || !isStepControl(event.target)) return;
  stepSwipeControl = event.target;
  stepSwipeStartY = event.clientY;
});
workspaceFrameElement?.addEventListener("pointerup", (event) => {
  if (stepSwipeControl === void 0) return;
  const control = stepSwipeControl;
  stepSwipeControl = void 0;
  const distance = stepSwipeStartY - event.clientY;
  if (Math.abs(distance) < 14) return;
  stepControlValue(control, distance > 0 ? 1 : -1);
});
workspaceFrameElement?.addEventListener("pointercancel", () => {
  stepSwipeControl = void 0;
});
viewportWrapElement?.addEventListener("wheel", (event) => {
  if (event.cancelable) event.preventDefault();
  cancelViewportCenterReturn();
  if (event.shiftKey || event.altKey) {
    viewportPanX -= event.deltaX || event.deltaY;
    viewportPanY -= event.deltaY || event.deltaX;
    applyViewportTransform();
    return;
  }
  const deltaPixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * (viewportWrapElement?.clientHeight || 256) : event.deltaY;
  zoomWheelAccumulator += Math.max(-4, Math.min(4, -deltaPixels / 100 * visualSettings.zoomSensitivity));
  while (Math.abs(zoomWheelAccumulator) >= 1) {
    const zoomIn = zoomWheelAccumulator > 0;
    const currentZoom = currentViewportDisplayScale();
    const nextZoom = stepPixelPerfectZoom(currentZoom, zoomIn ? 1 : -1);
    if (Math.abs(nextZoom - currentZoom) < 1e-4) {
      zoomWheelAccumulator = 0;
      break;
    }
    const anchor = viewportWheelAnchor(event);
    if (anchor === void 0) break;
    zoomViewportAtClient(anchor.x, anchor.y, nextZoom);
    zoomWheelAccumulator -= zoomIn ? 1 : -1;
  }
}, {
  passive: false
});
workspaceFrameElement?.addEventListener("wheel", (event) => {
  if (event.ctrlKey && event.cancelable) event.preventDefault();
}, {
  passive: false
});
workspaceFrameElement?.addEventListener("gesturestart", (event) => {
  if (event.cancelable) event.preventDefault();
});
workspaceFrameElement?.addEventListener("gesturechange", (event) => {
  if (event.cancelable) event.preventDefault();
});
workspaceFrameElement?.addEventListener("gestureend", (event) => {
  if (event.cancelable) event.preventDefault();
});
window.addEventListener("resize", () => applyViewportTransform(), {
  passive: true
});
miniPreviewCollapseButtonElement.addEventListener("click", () => {
  miniPreviewLayout = {
    ...miniPreviewLayout,
    collapsed: true
  };
  persistMiniPreviewLayout();
  syncMiniPreviewLayout();
});
miniPreviewRestoreButtonElement.addEventListener("click", () => {
  if (!miniPreviewEnabled) miniPreviewEnabled = true;
  else {
    miniPreviewLayout = {
      ...miniPreviewLayout,
      collapsed: !miniPreviewLayout.collapsed
    };
  }
  persistMiniPreviewLayout();
  syncMiniPreviewLayout();
  if (!miniPreviewLayout.collapsed) drawMiniPreviewProjection();
});
miniPreviewPlayButton.addEventListener("click", () => {
  if (workspaceFrameElement?.dataset.creatorMode === "AUDIO") {
    window.dispatchEvent(new CustomEvent("draw2:mini-preview-playback-request", {
      detail: {
        source: "MINI_PREVIEW"
      }
    }));
    return;
  }
  if (playbackRunning) stopTimelinePlayback();
  else startTimelinePlayback();
});
miniPreviewReferenceButton.addEventListener("click", () => {
  miniPreviewReferenceInput.click();
});
miniPreviewReferenceInput.addEventListener("change", () => {
  const file = miniPreviewReferenceInput.files?.[0];
  if (file !== void 0) void readMiniPreviewReference(file);
  miniPreviewReferenceInput.value = "";
});
miniPreviewReferenceClearButton.addEventListener("click", () => {
  closeMiniPreviewReferenceSource();
  miniPreviewReferenceClearButton.disabled = true;
  miniPreviewReferenceButton.setAttribute("aria-pressed", "false");
  setMiniPreviewReferenceStatus("Reference image cleared.");
  drawMiniPreviewProjection();
});
bindMiniPreviewResize(miniPreviewResizeLeftElement, "left");
bindMiniPreviewResize(miniPreviewResizeBottomElement, "bottom");
bindMiniPreviewResize(miniPreviewResizeCornerElement, "corner");
for (const button of displayToggleButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.draw2DisplayToggle === "cursor") {
      virtualCursorEnabled = !virtualCursorEnabled;
    }
    if (button.dataset.draw2DisplayToggle === "mini-preview") {
      miniPreviewEnabled = !miniPreviewEnabled;
    }
    syncDisplayToggles();
    button.closest(".draw2-menu")?.removeAttribute("open");
  });
}
syncMiniPreviewPlaybackControl();
for (const button of document.querySelectorAll("[data-draw2-open-settings]")) {
  button.addEventListener("click", () => {
    applyVisualSettings(visualSettings, false);
    settingsDialogElement?.showModal();
    button.closest(".draw2-menu")?.removeAttribute("open");
  });
}
for (const input of [
  settingsZoomSensitivityElement,
  settingsCheckerAElement,
  settingsCheckerBElement,
  settingsGridMinorElement,
  settingsGridMajorElement,
  settingsThemeAccentElement
]) {
  input?.addEventListener("input", () => {
    applyVisualSettings({
      ...visualSettings,
      zoomSensitivity: Number(settingsZoomSensitivityElement?.value ?? visualSettings.zoomSensitivity),
      checkerA: settingsCheckerAElement?.value ?? visualSettings.checkerA,
      checkerB: settingsCheckerBElement?.value ?? visualSettings.checkerB,
      gridMinor: settingsGridMinorElement?.value ?? visualSettings.gridMinor,
      gridMajor: settingsGridMajorElement?.value ?? visualSettings.gridMajor,
      themeAccent: settingsThemeAccentElement?.value ?? visualSettings.themeAccent
    });
  });
}
settingsResetButton?.addEventListener("click", () => applyVisualSettings(DEFAULT_DRAW2_VISUAL_SETTINGS));
setTimelineTab(activeTimelineTab);
restoreDraw2GlobalEditorPreferences();
applyViewportTransform();
applyVisualSettings(visualSettings, false);
syncDisplayToggles();
renderPaletteButtons(state.assets[state.activeAssetId]?.palette ?? []);
function syncToolButtons() {
  const selectedTool = toolSelect.value === "select-rect" ? "select" : toolSelect.value;
  canvas.dataset.tool = selectedTool;
  for (const button of document.querySelectorAll("[data-workspace-tool]")) {
    const active = button.dataset.workspaceTool === selectedTool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}
var TOOL_STUDIO_LABELS = {
  pen: "Pen",
  "pixel-pen": "Pixel Perfect Pen",
  eraser: "Eraser",
  move: "Move / Duplicate",
  "select-color": "Color Selection",
  "select-polygon": "Polygon Select",
  "tile-stamp": "Tile Stamp"
};
function syncToolStudio() {
  const current = currentBasicTool();
  const label = TOOL_STUDIO_LABELS[current] ?? current;
  if (toolStudioSummaryElement !== null) {
    toolStudioSummaryElement.value = `${label} \xB7 ready`;
  }
  for (const card of document.querySelectorAll("[data-draw2-studio-tool]")) {
    const active = card.dataset.draw2StudioTool === current;
    card.classList.toggle("is-selected", active);
    card.setAttribute("aria-pressed", String(active));
  }
  if (toolStudioStatusElement !== null) {
    const message = current === "pixel-pen" ? "Pixel Perfect Pen\u306F1px\u306EBresenham\u7DDA\u3092\u4F5C\u308A\u307E\u3059\u3002" : current === "move" ? "\u9078\u629E\u7BC4\u56F2\u3092\u30C9\u30E9\u30C3\u30B0\u3002Alt\u3092\u62BC\u3059\u3068\u8907\u88FD\u3057\u3066\u79FB\u52D5\u3057\u307E\u3059\u3002" : current === "select-polygon" ? "\u9802\u70B9\u3092\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u591A\u89D2\u5F62\u3092\u63CF\u304D\u3001\u96E2\u3059\u3068\u9078\u629E\u7BC4\u56F2\u306B\u306A\u308A\u307E\u3059\u3002" : current === "select-color" ? `${colorSelectionModeLabel(normalizeColorSelectionMode(toolOptions.selectionMode))} color selection. Mode and tolerance are shown near the viewport.` : current === "fill" ? "\u30AF\u30EA\u30C3\u30AF\u5730\u70B9\u3068\u540C\u3058\u30D1\u30EC\u30C3\u30C8\u8272\u3067\u3064\u306A\u304C\u308B\u7BC4\u56F2\u3060\u3051\u3092\u5857\u308A\u3064\u3076\u3057\u307E\u3059\u3002" : current === "tile-stamp" ? "Tileset\u306E\u30BB\u30EB\u3092\u9078\u3073\u3001Canvas\u3078\u30B9\u30BF\u30F3\u30D7\u3057\u307E\u3059\u3002" : "\u30C4\u30FC\u30EB\u3092\u9078\u3076\u3068\u3001\u3053\u3053\u306B\u4F7F\u3044\u65B9\u3068\u8A2D\u5B9A\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002";
    toolStudioStatusElement.textContent = message;
  }
  if (toolStudioElement !== null) {
    toolStudioElement.dataset.activeTool = current;
  }
}
for (const card of document.querySelectorAll("[data-draw2-studio-tool]")) {
  card.addEventListener("click", () => {
    const tool = card.dataset.draw2StudioTool;
    if (tool === void 0) return;
    selectShortcutTool(tool);
    syncToolStudio();
  });
}
specialDuplicateFrameElement?.addEventListener("click", () => duplicateFrameControl.click());
specialOpenInspectorElement?.addEventListener("click", () => {
  document.querySelector("[data-workspace-panel='inspector']")?.click();
});
function renderShortcutList(filter = "") {
  if (shortcutListElement === null) return;
  const queryText = filter.trim().toLowerCase();
  shortcutListElement.replaceChildren();
  let category;
  for (const shortcut of DRAW2_SHORTCUTS) {
    const haystack = `${shortcut.category} ${shortcut.label} ${shortcut.keys}`.toLowerCase();
    if (queryText.length > 0 && !haystack.includes(queryText)) continue;
    if (category !== shortcut.category) {
      category = shortcut.category;
      const heading = document.createElement("div");
      heading.className = "draw2-shortcut-category";
      heading.textContent = shortcut.category;
      heading.setAttribute("role", "presentation");
      shortcutListElement.append(heading);
    }
    const row = document.createElement("div");
    row.className = "draw2-shortcut-row";
    row.setAttribute("role", "listitem");
    const label = document.createElement("span");
    label.className = "draw2-shortcut-label";
    label.textContent = shortcut.label;
    const keys = document.createElement("span");
    keys.className = "draw2-shortcut-keys";
    for (const key of shortcut.keys.split("+")) {
      const keycap = document.createElement("kbd");
      keycap.textContent = key;
      keys.append(keycap);
    }
    row.append(label, keys);
    shortcutListElement.append(row);
  }
  if (shortcutListElement.childElementCount === 0) {
    const empty = document.createElement("div");
    empty.className = "draw2-shortcut-row";
    empty.textContent = "No matching shortcut";
    shortcutListElement.append(empty);
  }
}
function showShortcutsDialog() {
  renderShortcutList(shortcutSearchElement?.value ?? "");
  if (shortcutListElement !== null) {
    translateDraw2Subtree(shortcutListElement);
  }
  if (shortcutsDialogElement?.open !== true) {
    shortcutsDialogElement?.showModal();
  }
  shortcutSearchElement?.focus();
}
function selectShortcutTool(tool) {
  toolSelect.value = tool;
  toolSelect.dispatchEvent(new Event("change", {
    bubbles: true
  }));
}
function clearCommittedSelection(message = "Selection cleared; Canonical Raster unchanged.") {
  selectionInteractionGeneration += 1;
  if (selectionDrag !== void 0 && canvas.hasPointerCapture(selectionDrag.pointerId)) canvas.releasePointerCapture(selectionDrag.pointerId);
  if (pendingSelectionGesture !== void 0 && canvas.hasPointerCapture(pendingSelectionGesture.pointerId)) canvas.releasePointerCapture(pendingSelectionGesture.pointerId);
  selection = void 0;
  selectionDraft = void 0;
  pendingSelectionGesture = void 0;
  selectionDrag = void 0;
  transformSession = void 0;
  transformPreview = void 0;
  pasteMode = false;
  updateSelectionActionButtons();
  updateSelectionStatus(`scope=${state.activeCelId} \xB7 selection=none`);
  drawOverlay();
  markCanonicalMetrics();
  notifyAssetStateChanged();
  setStatus(message);
}
function selectAllPixels() {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) return;
  beginSelectionFromPoints(rectanglePointList({
    x: 0,
    y: 0,
    width: asset.width,
    height: asset.height
  }), "rectangle", "REPLACE", "All pixels selected.");
  commitSelectionDraft();
}
function nudgeCommittedSelection(dx, dy) {
  if (selection === void 0 || transformSession !== void 0) return false;
  transformOperation.value = "MOVE";
  transformDx.value = String(dx);
  transformDy.value = String(dy);
  transformSession = createTransformSession(selection, {
    ...currentTransform(),
    operation: "MOVE",
    dx,
    dy
  }, `transform-nudge-${state.projectId}-${selection.mask.selectionVersion}-${dx}-${dy}-${Date.now()}`);
  transformPreview = previewTransform(selection, transformSession);
  markPreviewMetrics();
  void commitActiveTransform();
  return true;
}
function cycleMirrorMode() {
  const modes = [
    "NONE",
    "ON"
  ];
  const next = modes[(modes.indexOf(mirrorMode) + 1) % modes.length] ?? "NONE";
  setMirrorPreset(next);
  syncQuickToolControls();
  drawOverlay();
}
function selectRelativeTimelineFrame(delta) {
  const frameOrder = state.timeline.frameOrder;
  if (frameOrder.length === 0) return;
  const currentIndex = Math.max(0, frameOrder.indexOf(timelineSession.activeFrameId));
  const nextIndex = Math.max(0, Math.min(frameOrder.length - 1, currentIndex + delta));
  const frameId = frameOrder[nextIndex];
  if (frameId === void 0) return;
  timelineSession = setTimelineSessionActiveFrame(state, timelineSession, frameId);
  renderTimeline();
  void activateTimelineCell(frameId, timelineSession.activeLayerTrackId);
}
async function clearActiveTimelineCel() {
  const cel2 = state.cels.find((item) => item.frameId === timelineSession.activeFrameId && item.layerTrackId === timelineSession.activeLayerTrackId);
  if (cel2?.assetId === void 0) {
    setStatus("Active cel is already empty.");
    return;
  }
  await runTimelineCommand("timeline.clearCel", {
    celId: cel2.celId
  });
}
function runDraw2Shortcut(command, event) {
  const toolMap = {
    "tool-pen": "pen",
    "tool-pixel-pen": "pixel-pen",
    "tool-eraser": "eraser",
    "tool-fill": "fill",
    "tool-eyedropper": "eyedropper",
    "tool-line": "line",
    "tool-rect": "rect",
    "tool-ellipse": "ellipse",
    "tool-circle": "circle",
    "tool-select": "select-rect",
    "tool-select-color": "select-color",
    "tool-select-lasso": "select-lasso",
    "tool-select-polygon": "select-polygon",
    "tool-move": "move",
    "tool-tile-stamp": "tile-stamp",
    "tool-pan": "pan"
  };
  const mappedTool = toolMap[command];
  if (mappedTool !== void 0) {
    selectShortcutTool(mappedTool);
    return;
  }
  switch (command) {
    case "undo":
      undoControl.click();
      break;
    case "redo":
      redoControl.click();
      break;
    case "copy":
      copyControl.click();
      break;
    case "cut":
      cutControl.click();
      break;
    case "paste":
      pasteControl.click();
      break;
    case "selection-confirm":
      commitSelectionDraft();
      break;
    case "selection-cancel":
      if (selectionDraft !== void 0 || pendingSelectionGesture !== void 0) cancelSelectionDraft();
      else if (transformSession !== void 0) cancelTransformControl.click();
      else if (selectionDrag !== void 0) cancelSelectionDrag();
      break;
    case "selection-deselect":
      clearCommittedSelection();
      break;
    case "selection-select-all":
      selectAllPixels();
      break;
    case "delete-selection":
      if (selection !== void 0 || selectionDraft !== void 0) {
        cutControl.click();
      } else {
        void clearActiveTimelineCel();
      }
      break;
    case "mirror-cycle":
      cycleMirrorMode();
      break;
    case "zoom-in": {
      const anchor = viewportTransformOrigin();
      if (anchor !== void 0) {
        zoomViewportAtClient(anchor.x, anchor.y, stepPixelPerfectZoom(currentViewportDisplayScale(), 1));
      }
      break;
    }
    case "zoom-out": {
      const anchor = viewportTransformOrigin();
      if (anchor !== void 0) {
        zoomViewportAtClient(anchor.x, anchor.y, stepPixelPerfectZoom(currentViewportDisplayScale(), -1));
      }
      break;
    }
    case "zoom-reset": {
      const anchor = viewportTransformOrigin();
      if (anchor !== void 0) zoomViewportAtClient(anchor.x, anchor.y, 1);
      break;
    }
    case "add-frame":
      addFrameControl.click();
      break;
    case "duplicate-frame":
      duplicateFrameControl.click();
      break;
    case "previous-frame":
      selectRelativeTimelineFrame(-1);
      break;
    case "next-frame":
      selectRelativeTimelineFrame(1);
      break;
    case "toggle-loop":
      cyclePlaybackLoopMode();
      break;
    case "toggle-onion":
      toggleOnionControl.click();
      break;
    case "clear-cel":
      void clearActiveTimelineCel();
      break;
    case "toggle-playback":
      togglePlaybackControl.click();
      break;
    case "command-palette":
      document.querySelector("#draw2CommandPalette")?.showModal();
      break;
    case "shortcuts":
      showShortcutsDialog();
      break;
    default:
      if (event?.key === "Escape") cancelSelectionDraft();
      break;
  }
}
shortcutSearchElement?.addEventListener("input", () => renderShortcutList(shortcutSearchElement.value));
for (const button of document.querySelectorAll("[data-workspace-command='shortcuts']")) button.addEventListener("click", showShortcutsDialog);
renderShortcutList();
applyDraw2Locale(draw2Locale, false);
languageControl.addEventListener("change", () => {
  applyDraw2Locale(languageControl.value);
  renderShortcutList(shortcutSearchElement?.value ?? "");
  if (shortcutListElement !== null) {
    translateDraw2Subtree(shortcutListElement);
  }
  setStatus(draw2Locale === "ja" ? "\u8A00\u8A9E\u3092\u65E5\u672C\u8A9E\u306B\u5909\u66F4\u3057\u307E\u3057\u305F\u3002" : "Language changed.");
});
for (const button of document.querySelectorAll("[data-workspace-tool]")) {
  if (button.tagName === "SUMMARY") continue;
  button.addEventListener("click", () => {
    const nextTool = button.dataset.workspaceTool === "select" ? "select-rect" : button.dataset.workspaceTool;
    if (nextTool === void 0 || !Array.from(toolSelect.options).some((option) => option.value === nextTool)) return;
    toolSelect.value = nextTool;
    toolSelect.dispatchEvent(new Event("change", {
      bubbles: true
    }));
  });
}
var BRUSH_SIZE_MIN = 1;
var BRUSH_SIZE_MAX = 32;
function brushPatternLabel(pattern) {
  switch (pattern) {
    case "checker":
      return "Checker";
    case "dots":
      return "Dots";
    case "bayer-2x2":
      return "Bayer";
    default:
      return "Solid";
  }
}
function syncBrushOptionsButton() {
  const isCircle = brushShape.value === "circle";
  const shapeLabel = isCircle ? "Circle" : "Square";
  const patternLabel = brushPatternLabel(brushPattern.value);
  brushOptionsSummary.textContent = `${isCircle ? "\u25CB" : "\u25A1"} ${localizeDraw2Text(patternLabel)}`;
  const accessibleLabel = `${localizeDraw2Text("Shape")}: ${localizeDraw2Text(shapeLabel)} \xB7 ${localizeDraw2Text("Pattern")}: ${localizeDraw2Text(patternLabel)}`;
  brushOptionsButton.setAttribute("aria-label", accessibleLabel);
  brushOptionsButton.title = accessibleLabel;
}
function syncQuickToolControls() {
  syncBrushOptionsButton();
  syncMirrorModeToggle();
  const tool = currentBasicTool();
  const colorSelectionMode = normalizeColorSelectionMode(colorSelectionModeControl.value);
  const showColorSelectionMode = tool === "select-color";
  colorSelectionModeControl.closest(".draw2-viewport-context-control")?.toggleAttribute("hidden", !showColorSelectionMode);
  const usesColorTolerance = showColorSelectionMode && (colorSelectionMode === "similar" || colorSelectionMode === "magic");
  similarityControl.hidden = !usesColorTolerance;
  similarityControl.setAttribute("aria-hidden", String(!usesColorTolerance));
  if (usesColorTolerance) {
    const toleranceLabel = colorSelectionMode === "magic" ? "Magic color tolerance" : "Similar color tolerance";
    similarity.setAttribute("aria-label", toleranceLabel);
    similarity.title = `${toleranceLabel} \xB7 0% = same RGB, 100% = all RGB colors`;
  }
  const specialOptions = document.querySelectorAll("[data-draw2-special-option]");
  for (const option of specialOptions) {
    const kind = option.dataset.draw2SpecialOption;
    option.hidden = !(kind === "tile" && tool === "tile-stamp");
  }
  const showContextRail = showColorSelectionMode || tool === "tile-stamp";
  viewportContextRail.hidden = !showContextRail;
}
function normalizeBrushSizeInput() {
  const requested = Number(brushSize.value);
  const next = Number.isFinite(requested) ? Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, Math.round(requested))) : BRUSH_SIZE_MIN;
  brushSize.value = String(next);
}
function adjustBrushSizeFromWheel(deltaY) {
  if (deltaY === 0) return;
  const current = Number(brushSize.value);
  const safeCurrent = Number.isFinite(current) ? current : BRUSH_SIZE_MIN;
  const next = Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, safeCurrent + (deltaY < 0 ? 1 : -1)));
  if (next === safeCurrent) return;
  brushSize.value = String(next);
  brushSize.dispatchEvent(new Event("input", {
    bubbles: true
  }));
}
function positionBrushOptionsFlyout() {
  if (brushOptionsFlyout.hidden) return;
  const triggerRect = brushOptionsButton.getBoundingClientRect();
  const flyoutRect = brushOptionsFlyout.getBoundingClientRect();
  const edgePadding = 8;
  const belowTop = triggerRect.bottom + 6;
  const top = belowTop + flyoutRect.height <= window.innerHeight - edgePadding ? belowTop : Math.max(edgePadding, triggerRect.top - flyoutRect.height - 6);
  const left = Math.min(Math.max(edgePadding, triggerRect.left), Math.max(edgePadding, window.innerWidth - flyoutRect.width - edgePadding));
  brushOptionsFlyout.style.left = `${left}px`;
  brushOptionsFlyout.style.top = `${top}px`;
}
function setBrushOptionsFlyoutOpen(open, restoreFocus = false) {
  brushOptionsFlyout.hidden = !open;
  brushOptionsButton.setAttribute("aria-expanded", String(open));
  brushOptionsButton.classList.toggle("is-active", open);
  if (open) {
    positionBrushOptionsFlyout();
    requestAnimationFrame(positionBrushOptionsFlyout);
  } else {
    brushOptionsFlyout.style.removeProperty("left");
    brushOptionsFlyout.style.removeProperty("top");
    if (restoreFocus) brushOptionsButton.focus();
  }
}
function updateToolOptions() {
  const similarityPercent = Number(similarity.value);
  const selectionMode = normalizeColorSelectionMode(colorSelectionModeControl.value);
  toolOptions = {
    brushSize: Number(brushSize.value),
    brushShape: brushShape.value,
    pattern: brushPattern.value,
    similarity: colorTolerancePercentToDistance(similarityPercent),
    selectionMode
  };
  const safePercent = Number.isFinite(similarityPercent) ? Math.max(0, Math.min(100, Math.round(similarityPercent))) : 0;
  similarity.value = String(safePercent);
  similarityValue.value = `${safePercent}%`;
  syncQuickToolControls();
  if (currentBasicTool() === "select-color") syncToolStudio();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
}
function renderBrushPresetOptions() {
  const selectedId = brushPreset.value;
  brushPreset.replaceChildren(new Option("Preset", ""));
  for (const preset of brushPresets.list()) {
    brushPreset.append(new Option(preset.name, preset.id));
  }
  brushPreset.value = selectedId;
  translateDraw2Subtree(brushPreset);
}
function persistBrushPresets() {
  try {
    window.localStorage.setItem("pixieed:draw2:brush-presets:v1", JSON.stringify(brushPresets.list()));
  } catch {
  }
}
function applyBrushPreset(id) {
  if (!id) return;
  const preset = brushPresets.load(id);
  if (preset === void 0) return;
  brushSize.value = String(Math.min(32, preset.brushSize));
  brushShape.value = preset.brushShape;
  brushPattern.value = preset.pattern;
  const asset = state.assets[state.activeAssetId];
  if (asset !== void 0 && preset.colorIndex < asset.palette.length) {
    selectedColor = preset.colorIndex;
    renderPaletteButtons(asset.palette);
    syncColorEditorFromSelection();
  }
  brushPresetName.value = preset.name;
  updateToolOptions();
  scheduleDraw2EditorPreferencesSave();
  setStatus(`Brush preset ${preset.name} loaded \xB7 size=${preset.brushSize}`);
}
function saveBrushPreset() {
  const name = brushPresetName.value.trim() || `Preset ${brushPresets.list().length + 1}`;
  const id = brushPreset.value || `preset:ui:${Date.now()}`;
  const saved = brushPresets.save({
    id,
    name,
    brushSize: Number(brushSize.value),
    brushShape: brushShape.value,
    pattern: brushPattern.value,
    dither: "NONE",
    colorIndex: selectedColor,
    // Kept at the schema default for legacy preset compatibility. Brush
    // opacity was never part of the canonical stroke operation.
    opacity: 1,
    schemaVersion: 1
  });
  persistBrushPresets();
  renderBrushPresetOptions();
  brushPreset.value = saved.id;
  setStatus(`Brush preset ${saved.name} saved locally.`);
}
function deleteBrushPreset() {
  const id = brushPreset.value;
  if (!id || !brushPresets.remove(id)) {
    setStatus("Select a saved brush preset before deleting.", "error");
    return;
  }
  persistBrushPresets();
  brushPresetName.value = "Preset 1";
  renderBrushPresetOptions();
  setStatus("Brush preset deleted locally.");
}
toolSelect.addEventListener("change", () => {
  cancelUncommittedSelectionWork("Selection/transform preview cancelled because the tool changed.");
  syncToolButtons();
  syncToolStudio();
  syncQuickToolControls();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
});
mirrorModeControl.addEventListener("click", () => {
  setMirrorPreset(mirrorEnabled ? "NONE" : "ON");
  syncQuickToolControls();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
  setStatus(!mirrorEnabled ? "Mirror mode off." : `Mirror mode on \xB7 ${mirrorAxisSummary()} \xB7 one stroke / one undo`);
});
var toggleMirrorAxis = (axis) => {
  if (mirrorGuideClickSuppressed) {
    mirrorGuideClickSuppressed = false;
    return;
  }
  if (!mirrorEnabled) return;
  setMirrorAxisEnabled(axis, !mirrorAxisEnabled(axis));
  syncQuickToolControls();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
  setStatus(`Mirror ${mirrorAxisLabel(axis)} ${mirrorAxisEnabled(axis) ? "on" : "off"} \xB7 ${mirrorAxisSummary()}`);
};
mirrorToggleX.addEventListener("click", () => toggleMirrorAxis("x"));
mirrorToggleY.addEventListener("click", () => toggleMirrorAxis("y"));
mirrorToggleDiagonalDown.addEventListener("click", () => toggleMirrorAxis("diagonal-down"));
mirrorToggleDiagonalUp.addEventListener("click", () => toggleMirrorAxis("diagonal-up"));
for (const control of [
  brushPattern,
  brushShape,
  similarity
]) {
  control.addEventListener("input", updateToolOptions);
}
colorSelectionModeControl.addEventListener("change", updateToolOptions);
for (const control of [
  brushPattern,
  brushShape
]) {
  control.addEventListener("change", updateToolOptions);
}
brushSize.addEventListener("input", () => {
  normalizeBrushSizeInput();
  updateToolOptions();
});
brushSize.addEventListener("change", () => {
  normalizeBrushSizeInput();
  updateToolOptions();
});
brushSizeControl.addEventListener("wheel", (event) => {
  if (event.deltaY === 0) return;
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
  adjustBrushSizeFromWheel(event.deltaY);
}, {
  passive: false
});
brushOptionsButton.addEventListener("click", () => {
  setBrushOptionsFlyoutOpen(Boolean(brushOptionsFlyout.hidden));
});
brushOptionsCloseButton.addEventListener("click", () => setBrushOptionsFlyoutOpen(false, true));
document.addEventListener("pointerdown", (event) => {
  if (brushOptionsFlyout.hidden) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (!brushOptionsFlyout.contains(target) && !brushOptionsButton.contains(target)) {
    setBrushOptionsFlyoutOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || brushOptionsFlyout.hidden) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  setBrushOptionsFlyoutOpen(false, true);
});
quickControls.addEventListener("scroll", positionBrushOptionsFlyout, {
  passive: true
});
window.addEventListener("resize", positionBrushOptionsFlyout);
window.addEventListener("scroll", positionBrushOptionsFlyout, true);
brushPreset.addEventListener("change", () => applyBrushPreset(brushPreset.value));
brushPresetSaveButton.addEventListener("click", saveBrushPreset);
brushPresetDeleteButton.addEventListener("click", deleteBrushPreset);
selectionExpandButton.addEventListener("click", () => applySelectionMorphology("EXPAND"));
selectionShrinkButton.addEventListener("click", () => applySelectionMorphology("SHRINK"));
selectionInvertButton.addEventListener("click", () => applySelectionMorphology("INVERT"));
selectionBorderButton.addEventListener("click", () => applySelectionMorphology("BORDER"));
renderBrushPresetOptions();
updateToolOptions();
syncToolButtons();
syncToolStudio();
updateSelectionActionButtons();
document.addEventListener("keydown", (event) => {
  const dialogOpen = Array.from(document.querySelectorAll("dialog")).some((dialog) => dialog.open);
  if (dialogOpen && event.key === "Escape") {
    const openDialog = Array.from(document.querySelectorAll("dialog")).find((dialog) => dialog.open);
    if (openDialog !== void 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openDialog.close();
    }
    return;
  }
  if (event.key === "Escape" && drawInteraction !== void 0) {
    event.preventDefault();
    cancelActiveStroke();
    return;
  }
  const creatorMode = document.querySelector("#draw2WorkspaceFrame")?.dataset.creatorMode;
  const workspaceAudioOwnsHistory = creatorMode === "AUDIO" && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.altKey;
  if (workspaceAudioOwnsHistory) return;
  const inputEditing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLElement && event.target.isContentEditable;
  const workspaceMode = creatorMode === "DRAW" || creatorMode === "ANIMATE" || creatorMode === "GAME" || creatorMode === "AUDIO";
  const spaceKey = event.code === "Space" || event.key === " ";
  const workspacePlaybackSpace = spaceKey && !event.repeat && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && workspaceMode && !dialogOpen && !event.isComposing;
  if (workspacePlaybackSpace) return;
  const interactiveTarget = event.target instanceof HTMLElement && event.target.closest("button, a, summary, [role='button'], [role='tab'], [role='menuitem']") !== null;
  const selectionNudgeKeys = /* @__PURE__ */ new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown"
  ]);
  if (!inputEditing && selection !== void 0 && selectionToolCanMove() && drawInteraction === void 0 && selectionDraft === void 0 && pendingSelectionGesture === void 0 && selectionDrag === void 0 && transformSession === void 0 && selectionNudgeKeys.has(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const step = event.shiftKey ? 8 : 1;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    event.preventDefault();
    event.stopImmediatePropagation();
    nudgeCommittedSelection(dx, dy);
    return;
  }
  const shortcut = resolveDraw2Shortcut(event, {
    modalOpen: dialogOpen,
    sheetOpen: false,
    inputEditing: inputEditing || interactiveTarget,
    imeComposing: event.isComposing
  });
  if (shortcut === void 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  runDraw2Shortcut(shortcut.command, event);
});
function updateColorDraftFromSliders() {
  setColorEditorRgb({
    r: Number(colorR.value),
    g: Number(colorG.value),
    b: Number(colorB.value)
  });
  colorApply.disabled = selectedColor === 0;
  setColorEditorStatus(selectedColor === 0 ? "Index 0\u306F\u900F\u660E\u8272\u3067\u3059" : "Color preview \xB7 release to commit");
}
function updateColorDraftFromAlpha() {
  colorDraftAlpha = Math.max(0, Math.min(255, Math.round(Number(colorAlpha.value))));
  colorAlphaValue.value = String(Math.round(colorDraftAlpha / 255 * 100));
  colorDraftDirty = true;
  requestColorPreviewRender();
  colorApply.disabled = selectedColor === 0;
  setColorEditorStatus(selectedColor === 0 ? "Index 0\u306F\u900F\u660E\u8272\u3067\u3059" : "Color preview \xB7 release to commit");
}
colorR.addEventListener("input", updateColorDraftFromSliders);
colorG.addEventListener("input", updateColorDraftFromSliders);
colorB.addEventListener("input", updateColorDraftFromSliders);
colorAlpha.addEventListener("input", updateColorDraftFromAlpha);
for (const control of [
  colorR,
  colorG,
  colorB
]) {
  control.addEventListener("pointerup", () => {
    void commitColorEdit();
  });
  control.addEventListener("change", () => {
    void commitColorEdit();
  });
}
colorAlpha.addEventListener("pointerup", () => {
  void commitColorEdit();
});
colorAlpha.addEventListener("change", () => {
  void commitColorEdit();
});
colorHex.addEventListener("input", () => {
  const parsed = parseHexColor(colorHex.value);
  colorApply.disabled = parsed === void 0 || selectedColor === 0;
  if (parsed === void 0) {
    setColorEditorStatus("HEX\u306F #RRGGBB \u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", "error");
    return;
  }
  setColorEditorRgb(parsed);
  setColorEditorStatus(selectedColor === 0 ? "Index 0\u306F\u900F\u660E\u8272\u3067\u3059" : "Color preview \xB7 release to commit");
});
colorHex.addEventListener("change", () => {
  void commitColorEdit();
});
colorHex.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void commitColorEdit();
  }
});
colorApply.addEventListener("click", () => {
  void commitColorEdit();
});
var paletteWheelPointerId;
var paletteWheelPointerMode;
colorMap.addEventListener("pointerdown", (event) => {
  if (event.cancelable) event.preventDefault();
  const point = paletteWheelPointFromClient(event.clientX, event.clientY);
  if (point === void 0) return;
  const size = point.size;
  const metrics2 = getPaletteWheelMetrics(size);
  paletteWheelPointerMode = isPointInsidePaletteSv(point.x, point.y, metrics2) ? "sv" : "hue";
  paletteWheelPointerId = event.pointerId;
  colorMap.setPointerCapture(event.pointerId);
  setColorEditorFromWheel(event.clientX, event.clientY, paletteWheelPointerMode);
});
colorMap.addEventListener("pointermove", (event) => {
  if (paletteWheelPointerId !== event.pointerId || paletteWheelPointerMode === void 0) return;
  if (event.cancelable) event.preventDefault();
  setColorEditorFromWheel(event.clientX, event.clientY, paletteWheelPointerMode);
});
var finishPaletteWheelPointer = (event, commit) => {
  if (paletteWheelPointerId !== event.pointerId) return;
  paletteWheelPointerId = void 0;
  paletteWheelPointerMode = void 0;
  if (colorMap.hasPointerCapture(event.pointerId)) {
    colorMap.releasePointerCapture(event.pointerId);
  }
  if (commit) void commitColorEdit();
  else syncColorEditorFromSelection();
};
colorMap.addEventListener("pointerup", (event) => {
  finishPaletteWheelPointer(event, true);
});
colorMap.addEventListener("pointercancel", (event) => {
  finishPaletteWheelPointer(event, false);
});
colorMap.addEventListener("lostpointercapture", () => {
  paletteWheelPointerId = void 0;
  paletteWheelPointerMode = void 0;
});
colorMap.addEventListener("keydown", (event) => {
  if (!(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown")) return;
  event.preventDefault();
  const current = rgbToHsv({
    r: Number(colorR.value),
    g: Number(colorG.value),
    b: Number(colorB.value)
  });
  const hueDelta = event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0;
  const valueDelta = event.key === "ArrowUp" ? 0.05 : event.key === "ArrowDown" ? -0.05 : 0;
  setColorEditorRgb(hsvToRgb({
    h: current.h + hueDelta,
    s: current.s,
    v: Math.max(0, Math.min(1, current.v + valueDelta))
  }));
  colorApply.disabled = selectedColor === 0;
  setColorEditorStatus(selectedColor === 0 ? "Index 0\u306F\u900F\u660E\u8272\u3067\u3059" : "Color preview \xB7 release to commit");
});
colorMap.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") void commitColorEdit();
});
gamePreviewStartControl.addEventListener("click", () => {
  void startGamePreview("LIVE");
});
gamePreviewStopControl.addEventListener("click", () => {
  if (game351PlayableState === void 0) return;
  game351PlayableState = stopGame351(game351PlayableState);
  drawGame351Preview(game351PlayableState, game351PreviewMode);
});
gamePreviewRestartControl.addEventListener("click", () => {
  if (game351PlayableState === void 0) {
    void startGamePreview("LIVE");
    return;
  }
  game351PlayableState = restartGame351(game351PlayableState);
  drawGame351Preview(game351PlayableState, game351PreviewMode);
});
gamePreviewReloadControl.addEventListener("click", () => {
  void startGamePreview("LIVE");
});
gamePreviewPinControl.addEventListener("click", () => {
  void startGamePreview("PINNED");
});
gamePreviewCanvas.addEventListener("keydown", handleGame351PreviewKey);
gamePreviewCanvas.addEventListener("click", () => {
  gamePreviewCanvas.focus();
  if (game351PlayableState === void 0) return;
  game351PlayableState = triggerGame351Action(game351PlayableState, String(GAME351_TAP_ACTION), game351Behaviors);
  drawGame351Preview(game351PlayableState, game351PreviewMode);
});
var advancedModule;
var advancedOverlayState;
var advancedPreviewOperationId;
function advancedTarget() {
  const asset = state.assets[state.activeAssetId];
  if (asset === void 0) {
    throw new Error("Active Draw2 Asset is unavailable.");
  }
  return {
    assetId: asset.id,
    width: asset.width,
    height: asset.height,
    tileSize: asset.raster.tileSize,
    palette: asset.palette,
    readPixel: (x, y) => asset.raster.getPixel(x, y)
  };
}
function setAdvancedStatus(message, kind = "ready") {
  advancedStatus.textContent = translateDraw2Text(message, draw2Locale);
  advancedStatus.dataset.state = kind;
}
function advancedControlsEnabled(enabled) {
  for (const control of [
    advancedPatternControl,
    advancedStampControl,
    advancedMirrorControl,
    advancedGridControl,
    advancedGuideControl
  ]) control.disabled = !enabled;
}
async function ensureAdvancedModule() {
  if (advancedModule !== void 0) return advancedModule;
  advancedLoadControl.disabled = true;
  setAdvancedStatus("Loading isolated Advanced Tools chunk\u2026");
  try {
    advancedModule = await loadAdvancedModule();
    advancedOverlayState = advancedModule.defaultOverlayState();
    advancedControlsEnabled(true);
    advancedLoadControl.textContent = "Advanced Tools Loaded";
    setAdvancedStatus("Advanced Core ready \xB7 Preview is local-only; Commit uses the separate Editor Adapter.");
    return advancedModule;
  } catch (cause) {
    advancedLoadControl.disabled = false;
    setAdvancedStatus(cause instanceof Error ? cause.message : "Advanced Tools chunk unavailable.", "error");
    return void 0;
  }
}
advancedLoadControl.addEventListener("click", () => {
  void ensureAdvancedModule();
});
advancedPatternControl.addEventListener("click", () => {
  void (async () => {
    const module = await ensureAdvancedModule();
    if (module === void 0) return;
    const operation = module.planPatternBrushStroke(advancedTarget(), [
      {
        x: 16,
        y: 16
      },
      {
        x: 64,
        y: 64
      }
    ], {
      width: 2,
      height: 2,
      pixels: [
        1,
        0,
        0,
        1
      ],
      palette: [
        0,
        4294967295,
        4278190335
      ],
      transparentIndex: 0
    }, {
      anchorX: 0,
      anchorY: 0,
      repeat: "REPEAT_XY",
      transparent: "SKIP",
      clipping: "CLIP"
    });
    if (!operation.ok) {
      setAdvancedStatus(`Pattern preview blocked \xB7 ${operation.diagnostics[0]?.code ?? "UNKNOWN"}`, "error");
      return;
    }
    advancedPreviewOperationId = operation.value.operationId;
    setAdvancedStatus(`Pattern preview planned \xB7 writes=${operation.value.writes.length} \xB7 dirtyTiles=${operation.value.dirtyTiles.length} \xB7 undo=none`);
  })();
});
advancedStampControl.addEventListener("click", () => {
  void (async () => {
    const module = await ensureAdvancedModule();
    if (module === void 0) return;
    const stamp2 = module.planStamp(advancedTarget(), {
      width: 2,
      height: 2,
      pixels: [
        1,
        0,
        0,
        1
      ],
      palette: [
        0,
        4294967295,
        4278190335
      ],
      transparentIndex: 0
    }, {
      x: 24,
      y: 24,
      scale: 2,
      transparent: "SKIP",
      paletteCompatibility: "EXACT",
      clipping: "CLIP"
    });
    if (!stamp2.ok) {
      setAdvancedStatus(`Stamp preview blocked \xB7 ${stamp2.diagnostics[0]?.code ?? "UNKNOWN"}`, "error");
      return;
    }
    advancedPreviewOperationId = stamp2.value.session.sessionId;
    setAdvancedStatus(`Stamp preview ready \xB7 previewWrites=${stamp2.value.session.preview.writes.length} \xB7 commit=atomic \xB7 cancel=available`);
  })();
});
advancedMirrorControl.addEventListener("click", () => {
  void (async () => {
    const module = await ensureAdvancedModule();
    if (module === void 0) return;
    const mirror = module.planMirror(advancedTarget(), [
      {
        x: 24,
        y: 24,
        colorIndex: selectedColor
      }
    ], {
      horizontal: true,
      vertical: false,
      axisX2: 128,
      clipping: "CLIP"
    });
    if (!mirror.ok) {
      setAdvancedStatus(`Mirror preview blocked \xB7 ${mirror.diagnostics[0]?.code ?? "UNKNOWN"}`, "error");
      return;
    }
    advancedPreviewOperationId = mirror.value.operationId;
    setAdvancedStatus(`Mirror operation planned \xB7 writes=${mirror.value.writes.length} \xB7 axis=half-pixel-safe \xB7 undo=atomic`);
  })();
});
advancedGridControl.addEventListener("click", () => {
  void (async () => {
    const module = await ensureAdvancedModule();
    if (module === void 0 || advancedOverlayState === void 0) return;
    const next = module.toggleGrid(advancedOverlayState, !advancedOverlayState.grid.enabled);
    advancedOverlayState = next.state;
    setAdvancedStatus(`Grid ${next.state.grid.enabled ? "ON" : "OFF"} \xB7 invalidation=${next.invalidated.join(",")} \xB7 raster hash unchanged`);
  })();
});
advancedGuideControl.addEventListener("click", () => {
  void (async () => {
    const module = await ensureAdvancedModule();
    if (module === void 0 || advancedOverlayState === void 0) return;
    const guide = module.addGuide(advancedOverlayState, {
      guideId: `guide-local-${Date.now()}`,
      orientation: "HORIZONTAL",
      position: 32,
      visible: true,
      shared: false
    });
    if (!guide.ok) {
      setAdvancedStatus(`Guide blocked \xB7 ${guide.diagnostics[0]?.code ?? "UNKNOWN"}`, "error");
      return;
    }
    advancedOverlayState = guide.value;
    setAdvancedStatus(`Guide added as local overlay \xB7 count=${advancedOverlayState.guides.length} \xB7 not a PiXYNC operation`);
  })();
});
var DRAW2_RECENT_PROJECTS_STORAGE_KEY = "pixiedraw2:recent-projects:v1";
var DRAW2_RECENT_PROJECT_LIMIT = 8;
function readRecentProjects() {
  try {
    const raw = window.localStorage.getItem(DRAW2_RECENT_PROJECTS_STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const projects = [];
    for (const entry of parsed) {
      if (entry === null || typeof entry !== "object") continue;
      const candidate = entry;
      if (typeof candidate.projectId !== "string" || typeof candidate.name !== "string" || typeof candidate.updatedAt !== "string") continue;
      try {
        projects.push({
          projectId: asWorkspaceProjectId(candidate.projectId),
          name: candidate.name.trim() || `Draw2 ${candidate.projectId}`,
          updatedAt: candidate.updatedAt
        });
      } catch {
      }
    }
    return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, DRAW2_RECENT_PROJECT_LIMIT);
  } catch {
    return [];
  }
}
function writeRecentProjects(projects) {
  try {
    window.localStorage.setItem(DRAW2_RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(projects.slice(0, DRAW2_RECENT_PROJECT_LIMIT)));
  } catch {
  }
}
function rememberRecentProject(projectId, name) {
  const next = {
    projectId,
    name: name.trim() || `Draw2 ${projectId}`,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const projects = [
    next,
    ...readRecentProjects().filter((item) => item.projectId !== projectId)
  ];
  writeRecentProjects(projects);
}
function setProjectStartStatus(message, isError = false) {
  if (projectStartStatusElement === null) return;
  projectStartStatusElement.textContent = message;
  projectStartStatusElement.dataset.state = isError ? "error" : "ready";
}
function formatRecentProjectDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Local project";
  return new Intl.DateTimeFormat(void 0, {
    month: "short",
    day: "numeric"
  }).format(date);
}
function renderProjectStart() {
  if (projectStartRecentListElement === null) return;
  const activeProjectId2 = readActiveWorkspaceProjectId();
  const projects = readRecentProjects();
  if (projects.length === 0 && activeProjectId2 !== DEFAULT_WORKSPACE_PROJECT_ID) {
    projects.push({
      projectId: activeProjectId2,
      name: `Draw2 ${activeProjectId2}`,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  projectStartRecentListElement.replaceChildren();
  if (projectStartRecentCountElement !== null) {
    projectStartRecentCountElement.textContent = `${projects.length} project${projects.length === 1 ? "" : "s"}`;
  }
  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "draw2-project-start-status";
    empty.textContent = "No recent projects yet. Start a new project above.";
    projectStartRecentListElement.append(empty);
    return;
  }
  for (const project of projects) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "draw2-project-recent-item";
    button.dataset.projectId = project.projectId;
    button.setAttribute("role", "listitem");
    const name = document.createElement("strong");
    name.textContent = project.name;
    const meta = document.createElement("small");
    meta.textContent = `${project.projectId} \xB7 ${formatRecentProjectDate(project.updatedAt)}`;
    button.append(name, meta);
    button.addEventListener("click", () => {
      resolveProjectStart({
        projectIdOverride: project.projectId,
        mode: "OPEN"
      });
    });
    projectStartRecentListElement.append(button);
  }
}
var resolveProjectStartRequest;
function resolveProjectStart(settings) {
  if (resolveProjectStartRequest === void 0) return;
  const resolve = resolveProjectStartRequest;
  resolveProjectStartRequest = void 0;
  if (projectStartElement !== null) projectStartElement.hidden = true;
  if (workspaceFrameElement !== null) workspaceFrameElement.hidden = false;
  resolve(settings);
}
function waitForProjectStart() {
  if (projectStartElement === null || workspaceFrameElement === null) {
    return Promise.resolve({});
  }
  renderProjectStart();
  projectStartElement.hidden = false;
  workspaceFrameElement.hidden = true;
  setProjectStartStatus("");
  return new Promise((resolve) => {
    resolveProjectStartRequest = resolve;
  });
}
projectStartNewButton?.addEventListener("click", () => {
  setProjectStartStatus("Preparing a blank project\u2026");
  void createFreshWorkspaceProjectId().then((projectId) => {
    resolveProjectStart({
      projectIdOverride: projectId,
      mode: "NEW"
    });
  }).catch((cause) => {
    setProjectStartStatus(cause instanceof Error ? cause.message : "A new project could not be created.", true);
  });
});
function openProjectFromStart() {
  const raw = projectStartIdElement?.value.trim() ?? "";
  try {
    const projectId = asWorkspaceProjectId(raw || DEFAULT_WORKSPACE_PROJECT_ID);
    resolveProjectStart({
      projectIdOverride: projectId,
      mode: "OPEN"
    });
  } catch {
    setProjectStartStatus("Project ID must start with a letter or number and use stable identifier characters.", true);
  }
}
projectStartOpenButton?.addEventListener("click", openProjectFromStart);
projectStartIdElement?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    openProjectFromStart();
  }
});
async function resolveInitialProjectSettings() {
  try {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project")?.trim();
    if (projectId !== void 0 && projectId.length > 0) {
      return {
        projectIdOverride: projectId,
        mode: "OPEN"
      };
    }
    if (params.get("new_project") === "1") {
      const freshProjectId = await createFreshWorkspaceProjectId();
      return {
        projectIdOverride: freshProjectId,
        mode: "NEW"
      };
    }
  } catch {
  }
  return {};
}
void resolveInitialProjectSettings().then(async (settings) => {
  const hasDirectProjectTarget = settings.mode !== void 0 || settings.projectIdOverride !== void 0;
  if (hasDirectProjectTarget) {
    if (projectStartElement !== null) projectStartElement.hidden = true;
    if (workspaceFrameElement !== null) workspaceFrameElement.hidden = false;
    return settings;
  }
  return await waitForProjectStart();
}).then((settings) => resetProject(settings)).then(async () => {
  await startPixyncProjectLifecycle();
  return loadWorkspaceModule();
}).then((module) => {
  const result = module.bootstrapDraw2Workspace(document, {
    projectId: state.projectId
  });
  if (!result.ok) {
    setStatus(result.reason ?? "Workspace layer unavailable.", "error");
    return;
  }
  const workspaceFrame = document.querySelector("#draw2WorkspaceFrame");
  if (workspaceFrame !== null) translateDraw2Subtree(workspaceFrame);
  window.requestAnimationFrame(() => {
    renderTimeline();
    window.requestAnimationFrame(() => renderTimeline());
  });
  void queuePixyncProductionStart();
}).catch((cause) => {
  setStatus(cause instanceof Error ? cause.message : "Workspace layer unavailable.", "error");
});
