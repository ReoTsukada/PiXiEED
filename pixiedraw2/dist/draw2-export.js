// src/draw2-core.ts
var NullInstrumentation = class {
  record(_point) {
  }
};
var NOOP_INSTRUMENTATION = new NullInstrumentation();
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
function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function isFiniteInteger(value) {
  return Number.isSafeInteger(value);
}
function isValidLayerSelection(selection) {
  if (selection.kind === "CURRENT_LAYER") return selection.layerId.trim().length > 0;
  if (selection.kind === "LAYER_GROUP") return selection.groupId.trim().length > 0;
  if (selection.kind === "SELECTED_LAYERS") return normalizeReferences(selection.layerIds).length > 0;
  return selection.kind === "VISIBLE_LAYERS";
}
function isValidFrameSelection(selection) {
  if (selection.kind === "CURRENT_FRAME") return selection.frameId.trim().length > 0;
  if (selection.kind === "RANGE") return selection.startFrameId.trim().length > 0 && selection.endFrameId.trim().length > 0;
  if (selection.kind === "TAG") return selection.tagId.trim().length > 0;
  return selection.frameIds.length > 0 && normalizeReferences(selection.frameIds).length === selection.frameIds.length;
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
    if (clip.sourceFrames !== void 0 && (clip.sourceFrames.length !== clip.frameIds.length || clip.sourceFrames.some((frame) => frame.sourceFrameId.trim().length === 0 || normalizeReferences(frame.layerIds).length === 0 || !Number.isSafeInteger(frame.rect.x) || !Number.isSafeInteger(frame.rect.y) || frame.rect.x < 0 || frame.rect.y < 0 || !isPositiveInteger(frame.rect.width) || !isPositiveInteger(frame.rect.height) || frame.durationMs !== void 0 && (!Number.isFinite(frame.durationMs) || frame.durationMs <= 0) || frame.flipX !== void 0 && typeof frame.flipX !== "boolean" || frame.flipY !== void 0 && typeof frame.flipY !== "boolean"))) return false;
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
function packAtlas(sprites, options) {
  const maxWidth = boundedInteger(options.maxWidth, 1, 16384, 2048);
  const padding = boundedInteger(options.padding, 0, 256, 0);
  const extrude = boundedInteger(options.extrude, 0, 64, 0);
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let width = 1;
  const layouts = [];
  for (const sprite of [
    ...sprites
  ].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!Number.isSafeInteger(sprite.width) || !Number.isSafeInteger(sprite.height) || sprite.width < 1 || sprite.height < 1) throw new Error("Atlas sprite dimensions must be positive integers.");
    const packedWidth = sprite.width + extrude * 2;
    const packedHeight = sprite.height + extrude * 2;
    if (x > padding && x + packedWidth + padding > maxWidth) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    layouts.push({
      ...sprite,
      x: x + extrude,
      y: y + extrude,
      packedWidth,
      packedHeight
    });
    x += packedWidth + padding;
    rowHeight = Math.max(rowHeight, packedHeight);
    width = Math.max(width, x);
  }
  return {
    width: Math.min(maxWidth, width),
    height: Math.max(1, y + rowHeight + padding),
    sprites: layouts,
    schemaVersion: CREATOR_FEATURE_SCHEMA_VERSION
  };
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
function normalizeExportFormats(formats) {
  const selected = new Set(formats);
  return EXPORT_FORMATS.filter((definition) => definition.visible && definition.supported).filter((definition) => selected.has(definition.id)).map((definition) => definition.id);
}

// src/draw2-export.ts
var PXD_FORMAT = "pxd";
var PXD_SCHEMA_VERSION = 1;
var PXD_ARCHIVE_VERSION = 1;
var PXD_MIME_TYPE = "application/vnd.pixieed.pxd";
var PNG_MIME_TYPE = "image/png";
var PXD_MAGIC = new Uint8Array([
  80,
  88,
  68,
  0
]);
var PXD_HEADER_BYTES = 9;
var PXD_CREATED_BY = Object.freeze({
  application: "PiXiEED",
  version: "2.0.0-reference"
});
var PXD_PROJECT_SCHEMA_VERSION = 2;
var PXD_PROJECT_ARCHIVE_VERSION = 2;
function assert(condition, code, message) {
  if (!condition) throw Object.assign(new Error(message), {
    code
  });
}
function uint32(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0 && value <= 4294967295, "PXD_NUMBER_INVALID", `${label} must be a uint32.`);
  return value;
}
function readUint32(bytes, offset, label) {
  assert(offset >= 0 && offset + 4 <= bytes.length, "PXD_TRUNCATED", `${label} is truncated.`);
  return (bytes[offset] ?? 0) * 16777216 + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
}
function writeUint32(value) {
  const output = new Uint8Array(4);
  output[0] = value >>> 24 & 255;
  output[1] = value >>> 16 & 255;
  output[2] = value >>> 8 & 255;
  output[3] = value & 255;
  return output;
}
function writeUint16LittleEndian(value) {
  assert(Number.isSafeInteger(value) && value >= 0 && value <= 65535, "ZIP_NUMBER_INVALID", "ZIP uint16 value is invalid.");
  return new Uint8Array([
    value & 255,
    value >>> 8 & 255
  ]);
}
function writeUint32LittleEndian(value) {
  assert(Number.isSafeInteger(value) && value >= 0 && value <= 4294967295, "ZIP_NUMBER_INVALID", "ZIP uint32 value is invalid.");
  return new Uint8Array([
    value & 255,
    value >>> 8 & 255,
    value >>> 16 & 255,
    value >>> 24 & 255
  ]);
}
async function sha256BytesHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}
function colorToRgba(color, paletteIndex) {
  if (paletteIndex === 0) return [
    0,
    0,
    0,
    0
  ];
  return [
    color >>> 16 & 255,
    color >>> 8 & 255,
    color & 255,
    color >>> 24 & 255
  ];
}
function rasterToRgba(asset) {
  const indexed = asset.raster.toUint8Array();
  const rgba = new Uint8Array(indexed.length * 4);
  for (let index = 0; index < indexed.length; index += 1) {
    const paletteIndex = indexed[index] ?? 0;
    const color = colorToRgba(asset.palette[paletteIndex] ?? 0, paletteIndex);
    const target = index * 4;
    rgba[target] = color[0];
    rgba[target + 1] = color[1];
    rgba[target + 2] = color[2];
    rgba[target + 3] = color[3];
  }
  return rgba;
}
function crc32(bytes) {
  let crc = 4294967295;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ ((crc & 1) === 1 ? 3988292384 : 0);
  }
  return (crc ^ 4294967295) >>> 0;
}
function zipFilenameIsSafe(filename) {
  return filename.length > 0 && filename.length <= 255 && !filename.startsWith("/") && !filename.includes("\\") && !filename.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") && !/[\u0000-\u001f]/u.test(filename);
}
function encodeStoredZip(entries) {
  assert(entries.length > 0, "ZIP_ENTRIES_EMPTY", "ZIP requires at least one output.");
  assert(entries.length <= 65535, "ZIP_ENTRIES_TOO_MANY", "ZIP has too many entries.");
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const filenames = /* @__PURE__ */ new Set();
  let localOffset = 0;
  for (const entry of entries) {
    assert(zipFilenameIsSafe(entry.filename), "ZIP_FILENAME_INVALID", `ZIP filename ${entry.filename} is unsafe.`);
    assert(!filenames.has(entry.filename), "ZIP_FILENAME_DUPLICATE", `ZIP filename ${entry.filename} is duplicated.`);
    filenames.add(entry.filename);
    const nameBytes = encoder.encode(entry.filename);
    const bytes = new Uint8Array(entry.bytes);
    assert(nameBytes.byteLength <= 65535, "ZIP_FILENAME_TOO_LONG", "ZIP filename is too long.");
    assert(bytes.byteLength <= 4294967295, "ZIP_ENTRY_TOO_LARGE", `ZIP entry ${entry.filename} is too large.`);
    assert(localOffset <= 4294967295, "ZIP_OFFSET_INVALID", "ZIP local entry offset is too large.");
    const checksum = crc32(bytes);
    const localHeader = concatBytes(writeUint32LittleEndian(67324752), writeUint16LittleEndian(20), writeUint16LittleEndian(2048), writeUint16LittleEndian(0), writeUint16LittleEndian(0), writeUint16LittleEndian(0), writeUint32LittleEndian(checksum), writeUint32LittleEndian(bytes.byteLength), writeUint32LittleEndian(bytes.byteLength), writeUint16LittleEndian(nameBytes.byteLength), writeUint16LittleEndian(0));
    const localRecord = concatBytes(localHeader, nameBytes, bytes);
    localParts.push(localRecord);
    centralParts.push(concatBytes(writeUint32LittleEndian(33639248), writeUint16LittleEndian(20), writeUint16LittleEndian(20), writeUint16LittleEndian(2048), writeUint16LittleEndian(0), writeUint16LittleEndian(0), writeUint16LittleEndian(0), writeUint32LittleEndian(checksum), writeUint32LittleEndian(bytes.byteLength), writeUint32LittleEndian(bytes.byteLength), writeUint16LittleEndian(nameBytes.byteLength), writeUint16LittleEndian(0), writeUint16LittleEndian(0), writeUint16LittleEndian(0), writeUint16LittleEndian(0), writeUint32LittleEndian(0), writeUint32LittleEndian(localOffset), nameBytes));
    localOffset += localRecord.byteLength;
  }
  const centralDirectory = concatBytes(...centralParts);
  assert(localOffset <= 4294967295, "ZIP_OFFSET_INVALID", "ZIP local entries are too large.");
  assert(centralDirectory.byteLength <= 4294967295, "ZIP_DIRECTORY_TOO_LARGE", "ZIP central directory is too large.");
  const endOfCentralDirectory = concatBytes(writeUint32LittleEndian(101010256), writeUint16LittleEndian(0), writeUint16LittleEndian(0), writeUint16LittleEndian(entries.length), writeUint16LittleEndian(entries.length), writeUint32LittleEndian(centralDirectory.byteLength), writeUint32LittleEndian(localOffset), writeUint16LittleEndian(0));
  return concatBytes(...localParts, centralDirectory, endOfCentralDirectory);
}
function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16 | a) >>> 0;
}
function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  assert(typeBytes.byteLength === 4, "PNG_CHUNK_TYPE_INVALID", "PNG chunk type must be four bytes.");
  return concatBytes(writeUint32(data.byteLength), typeBytes, data, writeUint32(crc32(concatBytes(typeBytes, data))));
}
function zlibStore(bytes) {
  const blocks = [
    new Uint8Array([
      120,
      1
    ])
  ];
  if (bytes.length === 0) blocks.push(new Uint8Array([
    1,
    0,
    0,
    255,
    255
  ]));
  for (let offset = 0; offset < bytes.length; offset += 65535) {
    const end = Math.min(bytes.length, offset + 65535);
    const length = end - offset;
    const header = new Uint8Array(5);
    header[0] = end === bytes.length ? 1 : 0;
    header[1] = length & 255;
    header[2] = length >>> 8 & 255;
    header[3] = ~length & 255;
    header[4] = ~length >>> 8 & 255;
    blocks.push(header, bytes.slice(offset, end));
  }
  blocks.push(writeUint32(adler32(bytes)));
  return concatBytes(...blocks);
}
function encodePngFromScanlines(width, height, scanlines) {
  const ihdr = new Uint8Array(13);
  ihdr.set(writeUint32(width), 0);
  ihdr.set(writeUint32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10
  ]);
  return concatBytes(signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", zlibStore(scanlines)), pngChunk("IEND", new Uint8Array()));
}
function createPngScanlines(width, height, rgba) {
  const scanlines = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  return scanlines;
}
function encodePngRgba(width, height, rgba) {
  uint32(width, "width");
  uint32(height, "height");
  assert(width > 0 && height > 0, "PNG_DIMENSIONS_INVALID", "PNG dimensions must be positive.");
  assert(rgba.byteLength === width * height * 4, "PNG_PIXEL_LENGTH_INVALID", "RGBA byte length does not match dimensions.");
  return encodePngFromScanlines(width, height, createPngScanlines(width, height, rgba));
}
function normalizePngScale(value, width, height) {
  const candidate = Number.isFinite(value) ? Math.round(value) : 1;
  return Math.max(1, Math.min(maxPngExportScale(width, height), candidate));
}
function scaleRgba(rgba, width, height, scale) {
  if (scale === 1) return rgba;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  uint32(scaledWidth, "scaled width");
  uint32(scaledHeight, "scaled height");
  const output = new Uint8Array(scaledWidth * scaledHeight * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      for (let offsetY = 0; offsetY < scale; offsetY += 1) {
        for (let offsetX = 0; offsetX < scale; offsetX += 1) {
          const targetOffset = ((y * scale + offsetY) * scaledWidth + x * scale + offsetX) * 4;
          output.set(rgba.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        }
      }
    }
  }
  return output;
}
async function yieldToRenderer() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
async function scaleRgbaWithProgress(rgba, width, height, scale, onProgress) {
  if (scale === 1) {
    await onProgress(1);
    return rgba;
  }
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  uint32(scaledWidth, "scaled width");
  uint32(scaledHeight, "scaled height");
  const output = new Uint8Array(scaledWidth * scaledHeight * 4);
  const rowStep = Math.max(1, Math.ceil(height / 32));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      for (let offsetY = 0; offsetY < scale; offsetY += 1) {
        for (let offsetX = 0; offsetX < scale; offsetX += 1) {
          const targetOffset = ((y * scale + offsetY) * scaledWidth + x * scale + offsetX) * 4;
          output.set(rgba.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        }
      }
    }
    if (y === height - 1 || y % rowStep === 0) {
      await onProgress((y + 1) / height);
      await yieldToRenderer();
    }
  }
  return output;
}
async function createPngScanlinesWithProgress(width, height, rgba, onProgress) {
  const scanlines = new Uint8Array(height * (width * 4 + 1));
  const rowStep = Math.max(1, Math.ceil(height / 32));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
    if (y === height - 1 || y % rowStep === 0) {
      await onProgress((y + 1) / height);
      await yieldToRenderer();
    }
  }
  return scanlines;
}
async function encodePngRgbaWithProgress(width, height, rgba, onProgress) {
  uint32(width, "width");
  uint32(height, "height");
  assert(width > 0 && height > 0, "PNG_DIMENSIONS_INVALID", "PNG dimensions must be positive.");
  assert(rgba.byteLength === width * height * 4, "PNG_PIXEL_LENGTH_INVALID", "RGBA byte length does not match dimensions.");
  const scanlines = await createPngScanlinesWithProgress(width, height, rgba, onProgress);
  await onProgress(1);
  return encodePngFromScanlines(width, height, scanlines);
}
function resolveRasterRgba(state, assetId, composite = true) {
  const asset = state.assets[assetId];
  assert(asset !== void 0, "RASTER_ASSET_NOT_FOUND", "Raster export asset was not found.");
  if (composite && assetId === state.activeAssetId) {
    return compositeFrameRgba(state, state.activeFrameId);
  }
  return {
    width: asset.width,
    height: asset.height,
    rgba: rasterToRgba(asset)
  };
}
async function exportPng(state, assetId = state.activeAssetId, options = {}) {
  const asset = state.assets[assetId];
  assert(asset !== void 0, "PNG_ASSET_NOT_FOUND", "PNG export asset was not found.");
  const indexed = asset.raster.toUint8Array();
  const source = resolveRasterRgba(state, assetId, options.composite !== false);
  const scale = normalizePngScale(options.scale, source.width, source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const rgba = source.rgba;
  if (options.onProgress === void 0) {
    return {
      bytes: encodePngRgba(width, height, scaleRgba(rgba, source.width, source.height, scale)),
      filename: `${state.projectId}.png`,
      mimeType: PNG_MIME_TYPE,
      width,
      height,
      pixelHash: await sha256BytesHex(indexed)
    };
  }
  await options.onProgress(0.06);
  const scaled = await scaleRgbaWithProgress(rgba, source.width, source.height, scale, async (progress) => options.onProgress?.(0.08 + progress * 0.58));
  await options.onProgress(0.68);
  const bytes = await encodePngRgbaWithProgress(width, height, scaled, async (progress) => options.onProgress?.(0.69 + progress * 0.28));
  await options.onProgress(1);
  return {
    bytes,
    filename: `${state.projectId}.png`,
    mimeType: PNG_MIME_TYPE,
    width,
    height,
    pixelHash: await sha256BytesHex(indexed)
  };
}
function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
function normalizedBackgroundColor(value) {
  const color = Number.isSafeInteger(value) && value !== void 0 ? value >>> 0 : 4294967295;
  return [
    color >>> 24 & 255,
    color >>> 16 & 255,
    color >>> 8 & 255,
    color & 255
  ];
}
function exportRasterRgba(state, assetId = state.activeAssetId, options = {}) {
  const asset = state.assets[assetId];
  assert(asset !== void 0, "RASTER_ASSET_NOT_FOUND", "Raster export asset was not found.");
  const source = resolveRasterRgba(state, assetId, options.composite !== false);
  const scale = normalizePngScale(options.scale, source.width, source.height);
  return {
    rgba: scaleRgba(source.rgba, source.width, source.height, scale),
    width: source.width * scale,
    height: source.height * scale,
    scale
  };
}
function flattenRgba(rgba, backgroundColor = 4294967295) {
  assert(rgba.byteLength % 4 === 0, "RGBA_PIXEL_LENGTH_INVALID", "RGBA byte length must be divisible by four.");
  const [backgroundRed, backgroundGreen, backgroundBlue, backgroundAlpha] = normalizedBackgroundColor(backgroundColor);
  const backdropAlpha = backgroundAlpha / 255;
  const output = new Uint8Array(rgba.byteLength);
  for (let offset = 0; offset < rgba.byteLength; offset += 4) {
    const alpha = (rgba[offset + 3] ?? 0) / 255;
    const outputAlpha = alpha + backdropAlpha * (1 - alpha);
    if (outputAlpha <= 0) {
      output[offset] = backgroundRed;
      output[offset + 1] = backgroundGreen;
      output[offset + 2] = backgroundBlue;
      output[offset + 3] = 255;
      continue;
    }
    output[offset] = clampByte(((rgba[offset] ?? 0) * alpha + backgroundRed * backdropAlpha * (1 - alpha)) / outputAlpha);
    output[offset + 1] = clampByte(((rgba[offset + 1] ?? 0) * alpha + backgroundGreen * backdropAlpha * (1 - alpha)) / outputAlpha);
    output[offset + 2] = clampByte(((rgba[offset + 2] ?? 0) * alpha + backgroundBlue * backdropAlpha * (1 - alpha)) / outputAlpha);
    output[offset + 3] = 255;
  }
  return output;
}
function layerForCel(state, cel) {
  return state.layers.find((layer) => layer.layerTrackId === cel.layerTrackId || layer.id === cel.layerId);
}
function frameIdsForExport(state) {
  const knownFrameIds = new Set(state.frames.map((frame) => frame.frameId));
  const ordered = state.timeline.frameOrder.filter((frameId) => knownFrameIds.has(frameId));
  const trailing = state.frames.filter((frame) => !ordered.includes(frame.frameId)).sort((left, right) => left.index - right.index || left.frameId.localeCompare(right.frameId)).map((frame) => frame.frameId);
  const result = [
    ...ordered,
    ...trailing
  ];
  return result.length > 0 ? result : [
    state.activeFrameId
  ];
}
function compositeFrameRgba(state, frameId) {
  const fallback = state.assets[state.activeAssetId] ?? Object.values(state.assets)[0];
  assert(fallback !== void 0, "RASTER_ASSETS_EMPTY", "The project has no raster assets.");
  const cels = state.cels.filter((cel) => cel.frameId === frameId && cel.lifecycle === "ACTIVE" && cel.assetId !== void 0).map((cel) => ({
    cel,
    asset: cel.assetId === void 0 ? void 0 : state.assets[cel.assetId]
  })).filter((entry) => entry.asset !== void 0).filter((entry) => layerForCel(state, entry.cel)?.visible !== false).sort((left, right) => {
    const leftLayer = layerForCel(state, left.cel);
    const rightLayer = layerForCel(state, right.cel);
    return (leftLayer?.order ?? 0) - (rightLayer?.order ?? 0) || left.cel.layerTrackId.localeCompare(right.cel.layerTrackId);
  });
  if (cels.length === 0) {
    return {
      width: fallback.width,
      height: fallback.height,
      rgba: rasterToRgba(fallback)
    };
  }
  const base = cels[0]?.asset ?? fallback;
  const rgba = new Uint8Array(base.width * base.height * 4);
  for (const entry of cels) {
    const source = rasterToRgba(entry.asset);
    const layer = layerForCel(state, entry.cel);
    const opacity = Math.max(0, Math.min(1, layer?.opacity ?? 1));
    const width = Math.min(base.width, entry.asset.width);
    const height = Math.min(base.height, entry.asset.height);
    const multiply = layer?.blendMode === "MULTIPLY";
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceOffset = (y * entry.asset.width + x) * 4;
        const targetOffset = (y * base.width + x) * 4;
        const sourceAlpha = (source[sourceOffset + 3] ?? 0) / 255 * opacity;
        if (sourceAlpha <= 0) continue;
        const targetAlpha = (rgba[targetOffset + 3] ?? 0) / 255;
        const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
        const targetFactor = targetAlpha * (1 - sourceAlpha);
        const sourceRed = source[sourceOffset] ?? 0;
        const sourceGreen = source[sourceOffset + 1] ?? 0;
        const sourceBlue = source[sourceOffset + 2] ?? 0;
        const targetRed = rgba[targetOffset] ?? 0;
        const targetGreen = rgba[targetOffset + 1] ?? 0;
        const targetBlue = rgba[targetOffset + 2] ?? 0;
        const blendedRed = multiply && targetAlpha > 0 ? sourceRed * targetRed / 255 : sourceRed;
        const blendedGreen = multiply && targetAlpha > 0 ? sourceGreen * targetGreen / 255 : sourceGreen;
        const blendedBlue = multiply && targetAlpha > 0 ? sourceBlue * targetBlue / 255 : sourceBlue;
        rgba[targetOffset] = clampByte((blendedRed * sourceAlpha + targetRed * targetFactor) / outputAlpha);
        rgba[targetOffset + 1] = clampByte((blendedGreen * sourceAlpha + targetGreen * targetFactor) / outputAlpha);
        rgba[targetOffset + 2] = clampByte((blendedBlue * sourceAlpha + targetBlue * targetFactor) / outputAlpha);
        rgba[targetOffset + 3] = clampByte(outputAlpha * 255);
      }
    }
  }
  return {
    width: base.width,
    height: base.height,
    rgba
  };
}
function exportRasterAnimationFrames(state, options = {}) {
  const fallback = state.assets[state.activeAssetId] ?? Object.values(state.assets)[0];
  assert(fallback !== void 0, "RASTER_ASSETS_EMPTY", "The project has no raster assets.");
  const scale = normalizePngScale(options.scale, fallback.width, fallback.height);
  const frameById = new Map(state.frames.map((frame) => [
    frame.frameId,
    frame
  ]));
  return frameIdsForExport(state).map((frameId, index) => {
    const raw = compositeFrameRgba(state, frameId);
    const frame = frameById.get(frameId);
    return {
      id: frameId || `frame-${index}`,
      width: raw.width * scale,
      height: raw.height * scale,
      rgba: scaleRgba(raw.rgba, raw.width, raw.height, scale),
      durationMs: Math.max(1, Math.round(frame?.durationMs ?? 100))
    };
  });
}
function svgNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "");
}
function hexByte(value) {
  return clampByte(value).toString(16).padStart(2, "0");
}
function exportSvg(state, assetId = state.activeAssetId, options = {}) {
  const asset = state.assets[assetId];
  assert(asset !== void 0, "SVG_ASSET_NOT_FOUND", "SVG export asset was not found.");
  const raster = exportRasterRgba(state, assetId, options);
  const rgba = raster.rgba;
  const rectangles = [];
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const offset = (y * raster.width + x) * 4;
      const alpha = rgba[offset + 3] ?? 0;
      if (alpha === 0) continue;
      const opacity = alpha === 255 ? "" : ` fill-opacity="${svgNumber(alpha / 255)}"`;
      rectangles.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#${hexByte(rgba[offset] ?? 0)}${hexByte(rgba[offset + 1] ?? 0)}${hexByte(rgba[offset + 2] ?? 0)}"${opacity}/>`);
    }
  }
  const width = raster.width;
  const height = raster.height;
  const markup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rectangles.join("")}</svg>
`;
  return {
    bytes: new TextEncoder().encode(markup),
    filename: `${state.projectId}.svg`,
    mimeType: "image/svg+xml",
    width,
    height
  };
}
function setUint16LittleEndian(output, offset, value) {
  output.set(writeUint16LittleEndian(value), offset);
}
function setUint32LittleEndian(output, offset, value) {
  output.set(writeUint32LittleEndian(value), offset);
}
function encodeBmpRgba(width, height, rgba) {
  assert(width > 0 && height > 0 && width <= 2147483647 && height <= 2147483647, "BMP_DIMENSIONS_INVALID", "BMP dimensions are invalid.");
  assert(rgba.byteLength === width * height * 4, "BMP_PIXEL_LENGTH_INVALID", "BMP RGBA byte length does not match dimensions.");
  const pixelBytes = rgba.byteLength;
  const pixelOffset = 14 + 40;
  const output = new Uint8Array(pixelOffset + pixelBytes);
  output[0] = 66;
  output[1] = 77;
  setUint32LittleEndian(output, 2, output.byteLength);
  setUint32LittleEndian(output, 10, pixelOffset);
  setUint32LittleEndian(output, 14, 40);
  setUint32LittleEndian(output, 18, width);
  setUint32LittleEndian(output, 22, height);
  setUint16LittleEndian(output, 26, 1);
  setUint16LittleEndian(output, 28, 32);
  setUint32LittleEndian(output, 30, 0);
  setUint32LittleEndian(output, 34, pixelBytes);
  setUint32LittleEndian(output, 38, 3780);
  setUint32LittleEndian(output, 42, 3780);
  setUint32LittleEndian(output, 46, 0);
  setUint32LittleEndian(output, 50, 0);
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4;
      const targetOffset = pixelOffset + (y * width + x) * 4;
      output[targetOffset] = rgba[sourceOffset + 2] ?? 0;
      output[targetOffset + 1] = rgba[sourceOffset + 1] ?? 0;
      output[targetOffset + 2] = rgba[sourceOffset] ?? 0;
      output[targetOffset + 3] = rgba[sourceOffset + 3] ?? 255;
    }
  }
  return output;
}
function exportBmp(state, assetId = state.activeAssetId, options = {}) {
  const raster = exportRasterRgba(state, assetId, options);
  return {
    bytes: encodeBmpRgba(raster.width, raster.height, raster.rgba),
    filename: `${state.projectId}.bmp`,
    mimeType: "image/bmp",
    width: raster.width,
    height: raster.height
  };
}
function encodeTiffRgba(width, height, rgba) {
  assert(width > 0 && height > 0, "TIFF_DIMENSIONS_INVALID", "TIFF dimensions are invalid.");
  assert(rgba.byteLength === width * height * 4, "TIFF_PIXEL_LENGTH_INVALID", "TIFF RGBA byte length does not match dimensions.");
  const entryCount = 14;
  const ifdOffset = 8;
  const ifdBytes = 2 + entryCount * 12 + 4;
  const bitsOffset = ifdOffset + ifdBytes;
  const xResolutionOffset = bitsOffset + 8;
  const yResolutionOffset = xResolutionOffset + 8;
  const pixelOffset = yResolutionOffset + 8;
  const output = new Uint8Array(pixelOffset + rgba.byteLength);
  output[0] = 73;
  output[1] = 73;
  setUint16LittleEndian(output, 2, 42);
  setUint32LittleEndian(output, 4, ifdOffset);
  setUint16LittleEndian(output, ifdOffset, entryCount);
  let entryOffset = ifdOffset + 2;
  const writeEntry = (tag, type, count, value) => {
    setUint16LittleEndian(output, entryOffset, tag);
    setUint16LittleEndian(output, entryOffset + 2, type);
    setUint32LittleEndian(output, entryOffset + 4, count);
    if (type === 3 && count === 1) {
      setUint16LittleEndian(output, entryOffset + 8, value);
      setUint16LittleEndian(output, entryOffset + 10, 0);
    } else {
      setUint32LittleEndian(output, entryOffset + 8, value);
    }
    entryOffset += 12;
  };
  writeEntry(256, 4, 1, width);
  writeEntry(257, 4, 1, height);
  writeEntry(258, 3, 4, bitsOffset);
  writeEntry(259, 3, 1, 1);
  writeEntry(262, 3, 1, 2);
  writeEntry(273, 4, 1, pixelOffset);
  writeEntry(277, 3, 1, 4);
  writeEntry(278, 4, 1, height);
  writeEntry(279, 4, 1, rgba.byteLength);
  writeEntry(282, 5, 1, xResolutionOffset);
  writeEntry(283, 5, 1, yResolutionOffset);
  writeEntry(284, 3, 1, 1);
  writeEntry(296, 3, 1, 2);
  writeEntry(338, 3, 1, 2);
  setUint32LittleEndian(output, entryOffset, 0);
  for (let index = 0; index < 4; index += 1) setUint16LittleEndian(output, bitsOffset + index * 2, 8);
  setUint32LittleEndian(output, xResolutionOffset, 300);
  setUint32LittleEndian(output, xResolutionOffset + 4, 1);
  setUint32LittleEndian(output, yResolutionOffset, 300);
  setUint32LittleEndian(output, yResolutionOffset + 4, 1);
  output.set(rgba, pixelOffset);
  return output;
}
function exportTiff(state, assetId = state.activeAssetId, options = {}) {
  const raster = exportRasterRgba(state, assetId, options);
  return {
    bytes: encodeTiffRgba(raster.width, raster.height, raster.rgba),
    filename: `${state.projectId}.tiff`,
    mimeType: "image/tiff",
    width: raster.width,
    height: raster.height
  };
}
function nearestGifColor(colors, rgb) {
  const red = rgb >>> 16 & 255;
  const green = rgb >>> 8 & 255;
  const blue = rgb & 255;
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < colors.length; index += 1) {
    const candidate = colors[index] ?? 0;
    const dr = red - (candidate >>> 16 & 255);
    const dg = green - (candidate >>> 8 & 255);
    const db = blue - (candidate & 255);
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}
function buildGifPalette(frames) {
  const colors = [
    0
  ];
  const colorMap = /* @__PURE__ */ new Map();
  for (const frame of frames) {
    for (let offset = 0; offset < frame.rgba.byteLength; offset += 4) {
      const alpha = frame.rgba[offset + 3] ?? 0;
      if (alpha < 128) continue;
      const rgb = (frame.rgba[offset] ?? 0) << 16 | (frame.rgba[offset + 1] ?? 0) << 8 | (frame.rgba[offset + 2] ?? 0);
      if (colorMap.has(rgb)) continue;
      if (colors.length < 256) {
        const index = colors.length;
        colors.push(rgb);
        colorMap.set(rgb, index);
      }
    }
  }
  const paletteSize = Math.max(2, Math.min(256, 2 ** Math.ceil(Math.log2(Math.max(2, colors.length)))));
  while (colors.length < paletteSize) colors.push(0);
  const indexedFrames = frames.map((frame) => {
    const indexed = new Uint8Array(frame.width * frame.height);
    for (let offset = 0; offset < frame.rgba.byteLength; offset += 4) {
      const alpha = frame.rgba[offset + 3] ?? 0;
      const pixelIndex = offset / 4;
      if (alpha < 128) {
        indexed[pixelIndex] = 0;
        continue;
      }
      const rgb = (frame.rgba[offset] ?? 0) << 16 | (frame.rgba[offset + 1] ?? 0) << 8 | (frame.rgba[offset + 2] ?? 0);
      const mapped = colorMap.get(rgb);
      indexed[pixelIndex] = mapped ?? nearestGifColor(colors, rgb);
    }
    return indexed;
  });
  return {
    colors,
    frames: indexedFrames
  };
}
function gifLzwSubBlocks(indexStream, minCodeSize) {
  const output = [
    minCodeSize,
    0
  ];
  let currentSubblock = 1;
  const clearCode = 1 << minCodeSize;
  const codeMask = clearCode - 1;
  const endCode = clearCode + 1;
  let nextCode = endCode + 1;
  let codeSize = minCodeSize + 1;
  let shift = 0;
  let bitBuffer = 0;
  const codeTable = /* @__PURE__ */ new Map();
  const pushDataByte = (value) => {
    output.push(value & 255);
    if (output.length === currentSubblock + 256) {
      output[currentSubblock] = 255;
      currentSubblock = output.length;
      output.push(0);
    }
  };
  const flushBytes = (forcePartial) => {
    while (shift >= 8) {
      pushDataByte(bitBuffer);
      bitBuffer >>>= 8;
      shift -= 8;
    }
    if (forcePartial && shift > 0) {
      pushDataByte(bitBuffer);
      bitBuffer = 0;
      shift = 0;
    }
  };
  const emitCode = (code) => {
    bitBuffer |= code << shift;
    shift += codeSize;
    flushBytes(false);
  };
  let previousCode = (indexStream[0] ?? 0) & codeMask;
  emitCode(clearCode);
  for (let index = 1; index < indexStream.length; index += 1) {
    const nextValue = (indexStream[index] ?? 0) & codeMask;
    const key = previousCode << 8 | nextValue;
    const existingCode = codeTable.get(key);
    if (existingCode === void 0) {
      emitCode(previousCode);
      if (nextCode === 4096) {
        emitCode(clearCode);
        codeTable.clear();
        nextCode = endCode + 1;
        codeSize = minCodeSize + 1;
      } else {
        if (nextCode >= 1 << codeSize) codeSize += 1;
        codeTable.set(key, nextCode);
        nextCode += 1;
      }
      previousCode = nextValue;
    } else {
      previousCode = existingCode;
    }
  }
  emitCode(previousCode);
  emitCode(endCode);
  flushBytes(true);
  if (currentSubblock + 1 === output.length) output[currentSubblock] = 0;
  else {
    output[currentSubblock] = output.length - currentSubblock - 1;
    output.push(0);
  }
  return Uint8Array.from(output);
}
function writeGifUint16(output, value) {
  output.push(value & 255, value >>> 8 & 255);
}
function encodeGifFrames(frames, loopCount = 0) {
  assert(frames.length > 0, "GIF_FRAMES_EMPTY", "GIF requires at least one frame.");
  const first = frames[0];
  assert(first !== void 0, "GIF_FRAMES_EMPTY", "GIF requires at least one frame.");
  assert(first.width <= 65535 && first.height <= 65535, "GIF_DIMENSIONS_INVALID", "GIF dimensions exceed the format limit.");
  for (const frame of frames) {
    assert(frame.width === first.width && frame.height === first.height, "GIF_FRAME_DIMENSIONS_INVALID", "GIF frames must share dimensions.");
    assert(frame.rgba.byteLength === frame.width * frame.height * 4, "GIF_PIXEL_LENGTH_INVALID", "GIF RGBA byte length does not match dimensions.");
  }
  const palette = buildGifPalette(frames);
  const bits = Math.max(1, Math.round(Math.log2(palette.colors.length)));
  const minCodeSize = Math.max(2, bits);
  const output = [
    71,
    73,
    70,
    56,
    57,
    97
  ];
  writeGifUint16(output, first.width);
  writeGifUint16(output, first.height);
  output.push(128 | bits - 1, 0, 0);
  for (const color of palette.colors) output.push(color >>> 16 & 255, color >>> 8 & 255, color & 255);
  assert(Number.isSafeInteger(loopCount) && loopCount >= 0 && loopCount <= 65535, "GIF_LOOP_INVALID", "GIF loop count is invalid.");
  output.push(33, 255, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1);
  writeGifUint16(output, loopCount);
  output.push(0);
  for (const [index, frame] of frames.entries()) {
    const delay = Math.max(1, Math.min(65535, Math.round(frame.durationMs / 10)));
    output.push(33, 249, 4, 1);
    writeGifUint16(output, delay);
    output.push(0, 0, 44);
    writeGifUint16(output, 0);
    writeGifUint16(output, 0);
    writeGifUint16(output, frame.width);
    writeGifUint16(output, frame.height);
    output.push(0);
    const indexed = palette.frames[index] ?? new Uint8Array(frame.width * frame.height);
    output.push(...gifLzwSubBlocks(indexed, minCodeSize));
  }
  output.push(59);
  return Uint8Array.from(output);
}
function exportGif(state, options = {}) {
  const frames = exportRasterAnimationFrames(state, options);
  const first = frames[0];
  assert(first !== void 0, "GIF_FRAMES_EMPTY", "GIF requires at least one frame.");
  return {
    bytes: encodeGifFrames(frames),
    filename: `${state.projectId}.gif`,
    mimeType: "image/gif",
    width: first.width,
    height: first.height,
    frameCount: frames.length
  };
}
function writeUint16BigEndian(output, offset, value) {
  output[offset] = value >>> 8 & 255;
  output[offset + 1] = value & 255;
}
function apngDelay(durationMs) {
  const milliseconds = Math.max(1, Math.round(durationMs));
  const denominator = 1e3;
  let numerator = Math.min(65535, milliseconds);
  let divisor = 1;
  for (let candidate = Math.min(numerator, denominator); candidate > 1; candidate -= 1) {
    if (numerator % candidate === 0 && denominator % candidate === 0) {
      divisor = candidate;
      break;
    }
  }
  return [
    Math.max(1, Math.round(numerator / divisor)),
    Math.max(1, Math.round(denominator / divisor))
  ];
}
function encodeApngFrames(frames) {
  assert(frames.length > 0, "APNG_FRAMES_EMPTY", "APNG requires at least one frame.");
  const first = frames[0];
  assert(first !== void 0, "APNG_FRAMES_EMPTY", "APNG requires at least one frame.");
  assert(first.width <= 4294967295 && first.height <= 4294967295, "APNG_DIMENSIONS_INVALID", "APNG dimensions are invalid.");
  for (const frame of frames) {
    assert(frame.width === first.width && frame.height === first.height, "APNG_FRAME_DIMENSIONS_INVALID", "APNG frames must share dimensions.");
    assert(frame.rgba.byteLength === frame.width * frame.height * 4, "APNG_PIXEL_LENGTH_INVALID", "APNG RGBA byte length does not match dimensions.");
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(writeUint32(first.width), 0);
  ihdr.set(writeUint32(first.height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    new Uint8Array([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10
    ]),
    pngChunk("IHDR", ihdr)
  ];
  const animationControl = new Uint8Array(8);
  animationControl.set(writeUint32(frames.length), 0);
  animationControl.set(writeUint32(0), 4);
  parts.push(pngChunk("acTL", animationControl));
  let sequence = 0;
  for (const [index, frame] of frames.entries()) {
    const frameControl = new Uint8Array(26);
    frameControl.set(writeUint32(sequence), 0);
    sequence += 1;
    frameControl.set(writeUint32(frame.width), 4);
    frameControl.set(writeUint32(frame.height), 8);
    frameControl.set(writeUint32(0), 12);
    frameControl.set(writeUint32(0), 16);
    const [delayNumerator, delayDenominator] = apngDelay(frame.durationMs);
    writeUint16BigEndian(frameControl, 20, delayNumerator);
    writeUint16BigEndian(frameControl, 22, delayDenominator);
    frameControl[24] = 0;
    frameControl[25] = 0;
    parts.push(pngChunk("fcTL", frameControl));
    const compressed = zlibStore(createPngScanlines(frame.width, frame.height, frame.rgba));
    if (index === 0) {
      parts.push(pngChunk("IDAT", compressed));
    } else {
      const frameData = new Uint8Array(4 + compressed.byteLength);
      frameData.set(writeUint32(sequence), 0);
      sequence += 1;
      frameData.set(compressed, 4);
      parts.push(pngChunk("fdAT", frameData));
    }
  }
  parts.push(pngChunk("IEND", new Uint8Array()));
  return concatBytes(...parts);
}
function exportApng(state, options = {}) {
  const frames = exportRasterAnimationFrames(state, options);
  const first = frames[0];
  assert(first !== void 0, "APNG_FRAMES_EMPTY", "APNG requires at least one frame.");
  return {
    bytes: encodeApngFrames(frames),
    filename: `${state.projectId}.apng`,
    mimeType: "image/apng",
    width: first.width,
    height: first.height,
    frameCount: frames.length
  };
}
function buildSpriteSheet(state, options = {}) {
  const frames = exportRasterAnimationFrames(state, options.scale === void 0 ? {} : {
    scale: options.scale
  });
  const layout = packAtlas(frames.map((frame) => ({
    id: frame.id,
    width: frame.width,
    height: frame.height
  })), {
    maxWidth: Math.max(1, Math.min(16384, Math.round(options.maxWidth ?? 4096))),
    padding: Math.max(0, Math.min(256, Math.round(options.padding ?? 0))),
    extrude: 0
  });
  const rgba = new Uint8Array(layout.width * layout.height * 4);
  const frameById = new Map(frames.map((frame) => [
    frame.id,
    frame
  ]));
  for (const sprite of layout.sprites) {
    const frame = frameById.get(sprite.id);
    if (frame === void 0) continue;
    for (let y = 0; y < frame.height; y += 1) {
      const sourceStart = y * frame.width * 4;
      const targetStart = ((sprite.y + y) * layout.width + sprite.x) * 4;
      rgba.set(frame.rgba.subarray(sourceStart, sourceStart + frame.width * 4), targetStart);
    }
  }
  return {
    frames,
    layout,
    rgba
  };
}
function exportSpriteSheet(state, options = {}) {
  const result = buildSpriteSheet(state, options);
  return {
    bytes: encodePngRgba(result.layout.width, result.layout.height, result.rgba),
    filename: `${state.projectId}-spritesheet.png`,
    mimeType: "image/png",
    width: result.layout.width,
    height: result.layout.height,
    frameCount: result.frames.length,
    layout: result.layout
  };
}
function exportTileset(state, assetId = state.activeAssetId, options = {}) {
  const raster = exportRasterRgba(state, assetId, {
    ...options,
    composite: false
  });
  return {
    bytes: encodePngRgba(raster.width, raster.height, raster.rgba),
    filename: `${state.projectId}-tileset.png`,
    mimeType: "image/png",
    width: raster.width,
    height: raster.height
  };
}
function exportAtlasJson(state, options = {}) {
  const result = buildSpriteSheet(state, options);
  const framesById = new Map(result.frames.map((frame) => [
    frame.id,
    frame
  ]));
  const payload = {
    schemaVersion: 1,
    image: options.imageFilename ?? `${state.projectId}-spritesheet.png`,
    size: {
      width: result.layout.width,
      height: result.layout.height
    },
    frames: Object.fromEntries(result.layout.sprites.map((sprite) => {
      const frame = framesById.get(sprite.id);
      return [
        sprite.id,
        {
          frame: {
            x: sprite.x,
            y: sprite.y,
            w: sprite.width,
            h: sprite.height
          },
          rotated: false,
          trimmed: false,
          spriteSourceSize: {
            x: 0,
            y: 0,
            w: sprite.width,
            h: sprite.height
          },
          sourceSize: {
            w: sprite.width,
            h: sprite.height
          },
          durationMs: frame?.durationMs ?? 100
        }
      ];
    })),
    meta: {
      app: "PiXiEEDstudio",
      version: "2.0.0",
      format: "RGBA8888",
      scale: options.scale ?? 1
    }
  };
  return {
    bytes: new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}
`),
    filename: `${state.projectId}.atlas.json`,
    mimeType: "application/json",
    width: result.layout.width,
    height: result.layout.height,
    frameCount: result.frames.length
  };
}
function projectMetadata(state) {
  return {
    name: state.name,
    structureEpoch: state.structureEpoch,
    activeAssetId: state.activeAssetId,
    activeLayerId: state.activeLayerId,
    activeFrameId: state.activeFrameId,
    activeCelId: state.activeCelId,
    layers: state.layers,
    frames: state.frames,
    cels: state.cels,
    timeline: state.timeline,
    tilemaps: state.tilemaps ?? {}
  };
}
function manifestWithoutHash(value) {
  return canonicalJson(value);
}
function packageFileName(projectId) {
  return `${projectId.replace(/[^A-Za-z0-9._-]+/gu, "-") || "pixieed-project"}.pxd`;
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function assertNoEmbeddedAssetPayload(value, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEmbeddedAssetPayload(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    assert(![
      "pixels",
      "pixelData",
      "raster",
      "blob",
      "dataUrl",
      "rgba",
      "indexedBytes",
      "payload"
    ].includes(key), "PXD_ASSET_DEFINITION_EMBEDDED_DATA", `${path}.${key} must not contain embedded asset data.`);
    assertNoEmbeddedAssetPayload(entry, `${path}.${key}`);
  }
}
function assertAssetDefinitionShape(value, path) {
  assert(isRecord(value), "PXD_ASSET_DEFINITION_INVALID", `${path} must be an object.`);
  const definition = value;
  assert(definition.schemaVersion === 1, "PXD_ASSET_DEFINITION_VERSION_UNSUPPORTED", `${path}.schemaVersion is unsupported.`);
  assert(definition.persistence === "LOCAL_DRAFT" || definition.persistence === "VALIDATED_DEFINITION", "PXD_ASSET_DEFINITION_PERSISTENCE_INVALID", `${path}.persistence must be LOCAL_DRAFT or VALIDATED_DEFINITION.`);
  const candidate = {
    ...definition,
    persistence: "LOCAL_DRAFT"
  };
  const validation = validateAssetDefinitionDraft(candidate);
  assert(validation.ok, "PXD_ASSET_DEFINITION_INVALID", `${path} failed Asset Definition validation.`);
  const normalized = {
    ...validation.value,
    persistence: definition.persistence
  };
  assert(canonicalJson(normalized) === canonicalJson(definition), "PXD_ASSET_DEFINITION_NOT_NORMALIZED", `${path} is not normalized.`);
}
function validateAssetDefinitionEntry(value, index) {
  const path = `assetDefinitions[${index}]`;
  assert(isRecord(value), "PXD_ASSET_DEFINITION_INVALID", `${path} must be an object.`);
  assertNoEmbeddedAssetPayload(value, path);
  assert(typeof value.definitionId === "string" && value.definitionId.trim() === value.definitionId && value.definitionId.length > 0, "PXD_ASSET_DEFINITION_ID_INVALID", `${path}.definitionId is invalid.`);
  assertAssetDefinitionShape(value.definition, `${path}.definition`);
  if (value.registryIdentity !== void 0) {
    assert(isRecord(value.registryIdentity), "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity is invalid.`);
    assert(typeof value.registryIdentity.assetId === "string" && value.registryIdentity.assetId.trim() === value.registryIdentity.assetId && value.registryIdentity.assetId.length > 0, "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity.assetId is invalid.`);
    assert(typeof value.registryIdentity.revisionId === "string" && value.registryIdentity.revisionId.trim() === value.registryIdentity.revisionId && value.registryIdentity.revisionId.length > 0, "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity.revisionId is invalid.`);
  }
  return value;
}
function normalizeAssetDefinitions(entries) {
  const normalized = [
    ...entries ?? []
  ].map((entry, index) => validateAssetDefinitionEntry(entry, index));
  normalized.sort((left, right) => left.definitionId < right.definitionId ? -1 : left.definitionId > right.definitionId ? 1 : 0);
  for (let index = 1; index < normalized.length; index += 1) {
    assert(normalized[index - 1]?.definitionId !== normalized[index]?.definitionId, "PXD_ASSET_DEFINITION_DUPLICATE", `Asset Definition ${normalized[index]?.definitionId ?? ""} is duplicated.`);
  }
  return normalized;
}
var PXD_PRODUCT_MODULES = [
  "DRAW",
  "AUDIO",
  "GAME"
];
var PXD_PRODUCT_KINDS = [
  "GAME_PROJECT",
  "DRAW_IMAGE",
  "DRAW_ANIMATION",
  "DRAW_CHARACTER_ANIMATION",
  "AUDIO_ASSET",
  "PROJECT"
];
var PXD_PRODUCT_RIGHTS = [
  "PERSONAL_USE",
  "COMMERCIAL_USE",
  "DERIVATIVE",
  "EMBEDDING",
  "RESALE"
];
function normalizePxdProductReferences(value, path) {
  assert(Array.isArray(value), "PXD_PRODUCT_REFERENCE_INVALID", `${path} must be an array.`);
  const normalized = value.map((entry, index) => {
    assert(typeof entry === "string" && entry.trim() === entry && entry.length > 0, "PXD_PRODUCT_REFERENCE_INVALID", `${path}[${index}] is invalid.`);
    return entry;
  });
  assert(new Set(normalized).size === normalized.length, "PXD_PRODUCT_REFERENCE_DUPLICATE", `${path} contains a duplicate reference.`);
  return normalized.sort(compareStrings);
}
function normalizePxdProductDefinition(value, index, assetDefinitionIds, audioRevisionIds, availableModules) {
  const path = `productDefinitions[${index}]`;
  assert(isRecord(value), "PXD_PRODUCT_DEFINITION_INVALID", `${path} must be an object.`);
  assertNoEmbeddedAssetPayload(value, path);
  const allowedKeys = /* @__PURE__ */ new Set([
    "schemaVersion",
    "persistence",
    "productId",
    "kind",
    "name",
    "description",
    "includedModules",
    "assetDefinitionIds",
    "audioRevisionIds",
    "rights",
    "edition"
  ]);
  assert(Object.keys(value).every((key) => allowedKeys.has(key)), "PXD_PRODUCT_DEFINITION_FIELD_INVALID", `${path} contains an unsupported field.`);
  assert(value.schemaVersion === 1, "PXD_PRODUCT_DEFINITION_VERSION_UNSUPPORTED", `${path}.schemaVersion is unsupported.`);
  assert(value.persistence === "LOCAL_DRAFT", "PXD_PRODUCT_DEFINITION_PERSISTENCE_INVALID", `${path}.persistence must be LOCAL_DRAFT.`);
  assert(typeof value.productId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.productId), "PXD_PRODUCT_ID_INVALID", `${path}.productId is invalid.`);
  assert(typeof value.kind === "string" && PXD_PRODUCT_KINDS.includes(value.kind), "PXD_PRODUCT_KIND_INVALID", `${path}.kind is invalid.`);
  assert(typeof value.name === "string" && value.name.trim() === value.name && value.name.length > 0 && value.name.length <= 128, "PXD_PRODUCT_NAME_INVALID", `${path}.name is invalid.`);
  assert(typeof value.description === "string" && value.description.trim() === value.description && value.description.length <= 4096, "PXD_PRODUCT_DESCRIPTION_INVALID", `${path}.description is invalid.`);
  const includedModules = normalizePxdProductReferences(value.includedModules, `${path}.includedModules`);
  assert(includedModules.every((module) => PXD_PRODUCT_MODULES.includes(module)), "PXD_PRODUCT_MODULE_INVALID", `${path}.includedModules contains an unsupported module.`);
  assert(includedModules.length > 0, "PXD_PRODUCT_MODULE_REQUIRED", `${path}.includedModules must not be empty.`);
  const assetIds = normalizePxdProductReferences(value.assetDefinitionIds, `${path}.assetDefinitionIds`);
  const audioIds = normalizePxdProductReferences(value.audioRevisionIds, `${path}.audioRevisionIds`);
  for (const assetId of assetIds) assert(assetDefinitionIds.has(assetId), "PXD_PRODUCT_ASSET_REFERENCE_MISSING", `${path} references missing Asset Definition ${assetId}.`);
  for (const audioId of audioIds) assert(audioRevisionIds.has(audioId), "PXD_PRODUCT_AUDIO_REFERENCE_MISSING", `${path} references missing Audio revision ${audioId}.`);
  assert(assetIds.length === 0 || includedModules.includes("DRAW"), "PXD_PRODUCT_DRAW_MODULE_REQUIRED", `${path} uses Draw Asset Definitions without including DRAW.`);
  assert(audioIds.length === 0 || includedModules.includes("AUDIO"), "PXD_PRODUCT_AUDIO_MODULE_REQUIRED", `${path} uses Audio revisions without including AUDIO.`);
  if (value.kind === "GAME_PROJECT") assert(includedModules.includes("GAME"), "PXD_PRODUCT_GAME_MODULE_REQUIRED", `${path} GAME_PROJECT must include GAME.`);
  if ([
    "DRAW_IMAGE",
    "DRAW_ANIMATION",
    "DRAW_CHARACTER_ANIMATION"
  ].includes(value.kind)) {
    assert(includedModules.includes("DRAW") && assetIds.length > 0, "PXD_PRODUCT_DRAW_SOURCE_REQUIRED", `${path} Draw products require DRAW and at least one Asset Definition.`);
  }
  if (value.kind === "AUDIO_ASSET") {
    assert(includedModules.includes("AUDIO") && audioIds.length > 0, "PXD_PRODUCT_AUDIO_SOURCE_REQUIRED", `${path} AUDIO_ASSET products require AUDIO and at least one Audio revision.`);
  }
  const rights = normalizePxdProductReferences(value.rights, `${path}.rights`);
  assert(rights.every((right) => PXD_PRODUCT_RIGHTS.includes(right)), "PXD_PRODUCT_RIGHT_INVALID", `${path}.rights contains an unsupported right.`);
  assert(rights.length > 0, "PXD_PRODUCT_RIGHT_REQUIRED", `${path}.rights must not be empty.`);
  assert(isRecord(value.edition), "PXD_PRODUCT_EDITION_INVALID", `${path}.edition is invalid.`);
  const editionValue = value.edition;
  let edition;
  if (editionValue.kind === "UNLIMITED") {
    assert(Object.keys(editionValue).length === 1, "PXD_PRODUCT_EDITION_INVALID", `${path}.edition contains an unsupported field.`);
    edition = {
      kind: "UNLIMITED"
    };
  } else {
    assert(editionValue.kind === "LIMITED" && Object.keys(editionValue).length === 2, "PXD_PRODUCT_EDITION_INVALID", `${path}.edition kind is invalid.`);
    const maxUnits = editionValue.maxUnits;
    assert(typeof maxUnits === "number" && Number.isSafeInteger(maxUnits) && maxUnits > 0, "PXD_PRODUCT_EDITION_LIMIT_INVALID", `${path}.edition.maxUnits must be a positive safe integer.`);
    edition = {
      kind: "LIMITED",
      maxUnits
    };
  }
  for (const module of includedModules) assert(availableModules.has(module), "PXD_PRODUCT_MODULE_MISSING", `${path} requires unavailable module ${module}.`);
  return {
    schemaVersion: 1,
    persistence: "LOCAL_DRAFT",
    productId: value.productId,
    kind: value.kind,
    name: value.name,
    description: value.description,
    includedModules,
    assetDefinitionIds: assetIds,
    audioRevisionIds: audioIds,
    rights,
    edition
  };
}
function normalizePxdProductDefinitions(entries, assetDefinitions, audioRevisionIds, availableModules) {
  const assetDefinitionIds = new Set(assetDefinitions.map((entry) => entry.definitionId));
  const audioIds = new Set(audioRevisionIds);
  const normalized = [
    ...entries ?? []
  ].map((entry, index) => normalizePxdProductDefinition(entry, index, assetDefinitionIds, audioIds, availableModules));
  normalized.sort((left, right) => compareStrings(left.productId, right.productId));
  for (let index = 1; index < normalized.length; index += 1) {
    assert(normalized[index - 1]?.productId !== normalized[index]?.productId, "PXD_PRODUCT_DEFINITION_DUPLICATE", `Product Definition ${normalized[index]?.productId ?? ""} is duplicated.`);
  }
  return normalized;
}
async function exportPxd(state, options = {}) {
  const assetEntries = [];
  const payloads = [];
  const assetDefinitions = normalizeAssetDefinitions(options.assetDefinitions);
  const drawTimelineMetadata = options.drawTimelineMetadata === void 0 ? void 0 : normalizeDraw2TimelineMetadata(options.drawTimelineMetadata, state.frames.length);
  let offset = 0;
  const assetIds = Object.keys(state.assets).sort();
  for (const [assetIndex, assetId] of assetIds.entries()) {
    const asset = state.assets[assetId];
    assert(asset !== void 0, "PXD_ASSET_NOT_FOUND", `PXD export asset ${assetId} was not found.`);
    const pixels = asset.raster.toUint8Array();
    const path = `objects/asset-${String(assetIndex).padStart(4, "0")}.raster`;
    assetEntries.push({
      assetId: asset.id,
      revisionId: `${asset.id}:revision:${asset.revision}`,
      mediaType: "application/vnd.pixieed.indexed-raster",
      path,
      sha256: await sha256BytesHex(pixels),
      bytes: pixels.byteLength,
      width: asset.width,
      height: asset.height,
      tileSize: asset.raster.tileSize,
      palette: [
        ...asset.palette
      ],
      revision: asset.revision,
      offset
    });
    payloads.push(pixels);
    offset += pixels.byteLength;
  }
  const content = {
    format: PXD_FORMAT,
    schemaVersion: PXD_SCHEMA_VERSION,
    archiveVersion: PXD_ARCHIVE_VERSION,
    packageKind: "PROJECT_PACKAGE",
    projectId: state.projectId,
    project: projectMetadata(state),
    assets: assetEntries,
    assetDefinitions,
    ...drawTimelineMetadata === void 0 ? {} : {
      drawTimelineMetadata
    },
    dependencies: []
  };
  const packageId = `pxd_${(await sha256BytesHex(new TextEncoder().encode(canonicalJson(content)))).slice(0, 32)}`;
  const manifestBase = {
    ...content,
    packageId,
    createdBy: PXD_CREATED_BY
  };
  const manifestHash = await sha256BytesHex(new TextEncoder().encode(manifestWithoutHash(manifestBase)));
  const manifest = {
    ...manifestBase,
    canonicalManifestHash: manifestHash
  };
  const manifestBytes = new TextEncoder().encode(canonicalJson(manifest));
  assert(manifestBytes.byteLength <= 4294967295, "PXD_MANIFEST_TOO_LARGE", "PXD manifest exceeds the container limit.");
  const bytes = concatBytes(PXD_MAGIC, new Uint8Array([
    PXD_ARCHIVE_VERSION
  ]), writeUint32(manifestBytes.byteLength), manifestBytes, ...payloads);
  return {
    bytes,
    filename: packageFileName(state.projectId),
    mimeType: PXD_MIME_TYPE,
    packageHash: await sha256BytesHex(bytes),
    manifestHash,
    manifest
  };
}
function validateProjectMetadata(value) {
  assert(value !== null && typeof value === "object", "PXD_PROJECT_INVALID", "PXD project metadata is invalid.");
  const project = value;
  assert(typeof project.name === "string", "PXD_PROJECT_INVALID", "PXD project name is invalid.");
  assert(Number.isSafeInteger(project.structureEpoch) && project.structureEpoch >= 1, "PXD_PROJECT_INVALID", "PXD structure epoch is invalid.");
  assert(Array.isArray(project.layers) && Array.isArray(project.frames) && Array.isArray(project.cels), "PXD_PROJECT_INVALID", "PXD timeline collections are invalid.");
  assert(project.timeline !== null && typeof project.timeline === "object", "PXD_PROJECT_INVALID", "PXD timeline metadata is invalid.");
  return project;
}
function validateManifest(value) {
  assert(value !== null && typeof value === "object", "PXD_MANIFEST_INVALID", "PXD manifest must be an object.");
  const manifest = value;
  assert(manifest.format === PXD_FORMAT, "PXD_FORMAT_UNSUPPORTED", "Unsupported PXD format.");
  assert(manifest.schemaVersion === PXD_SCHEMA_VERSION && manifest.archiveVersion === PXD_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD schema or archive version.");
  assert(manifest.packageKind === "PROJECT_PACKAGE", "PXD_PACKAGE_KIND_UNSUPPORTED", "Unsupported PXD package kind.");
  assert(typeof manifest.packageId === "string" && manifest.packageId.length > 0, "PXD_MANIFEST_INVALID", "PXD packageId is invalid.");
  assert(typeof manifest.projectId === "string" && manifest.projectId.length > 0, "PXD_MANIFEST_INVALID", "PXD projectId is invalid.");
  assert(Array.isArray(manifest.assets) && manifest.assets.length > 0, "PXD_ASSETS_EMPTY", "PXD must contain at least one raster asset.");
  validateProjectMetadata(manifest.project);
  if (manifest.assetDefinitions !== void 0) {
    assert(Array.isArray(manifest.assetDefinitions), "PXD_ASSET_DEFINITION_INVALID", "PXD assetDefinitions must be an array.");
    const entries = manifest.assetDefinitions.map((entry, index) => validateAssetDefinitionEntry(entry, index));
    for (let index = 1; index < entries.length; index += 1) {
      assert(entries[index - 1].definitionId < entries[index].definitionId, "PXD_ASSET_DEFINITION_ORDER_INVALID", "PXD assetDefinitions must be in canonical definitionId order.");
      assert(entries[index - 1]?.definitionId !== entries[index]?.definitionId, "PXD_ASSET_DEFINITION_DUPLICATE", `Asset Definition ${entries[index]?.definitionId ?? ""} is duplicated.`);
    }
  }
  if (manifest.drawTimelineMetadata !== void 0) {
    const normalized = normalizeDraw2TimelineMetadata(manifest.drawTimelineMetadata, manifest.project.frames.length);
    assert(canonicalJson(normalized) === canonicalJson(manifest.drawTimelineMetadata), "PXD_TIMELINE_METADATA_NOT_NORMALIZED", "PXD Draw timeline metadata must be canonically normalized.");
  }
  assert(Array.isArray(manifest.dependencies) && manifest.dependencies.length === 0, "PXD_DEPENDENCIES_UNSUPPORTED", "PXD dependencies must be empty in the isolated v1 exporter.");
  assert(typeof manifest.canonicalManifestHash === "string" && /^[a-f0-9]{64}$/u.test(manifest.canonicalManifestHash), "PXD_MANIFEST_HASH_INVALID", "PXD manifest hash is invalid.");
  for (const [index, asset] of manifest.assets.entries()) {
    assert(asset !== null && typeof asset === "object", "PXD_ASSET_INVALID", `PXD asset ${index} is invalid.`);
    assert(typeof asset.assetId === "string" && typeof asset.revisionId === "string", "PXD_ASSET_INVALID", `PXD asset ${index} identity is invalid.`);
    assert(asset.mediaType === "application/vnd.pixieed.indexed-raster", "PXD_ASSET_TYPE_UNSUPPORTED", `PXD asset ${index} media type is unsupported.`);
    assert(/^objects\/asset-\d{4}\.raster$/u.test(asset.path), "PXD_PATH_UNSAFE", `PXD asset ${index} path is invalid.`);
    assert(/^[a-f0-9]{64}$/u.test(asset.sha256), "PXD_ASSET_HASH_INVALID", `PXD asset ${index} hash is invalid.`);
    assert(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, "PXD_ASSET_SIZE_INVALID", `PXD asset ${index} size is invalid.`);
    assert(Number.isSafeInteger(asset.width) && asset.width > 0 && Number.isSafeInteger(asset.height) && asset.height > 0, "PXD_ASSET_DIMENSIONS_INVALID", `PXD asset ${index} dimensions are invalid.`);
    assert(asset.tileSize === 32 || asset.tileSize === 64, "PXD_TILE_SIZE_INVALID", `PXD asset ${index} tile size is invalid.`);
    assert(Array.isArray(asset.palette) && asset.palette.length >= 1 && asset.palette.length <= 256 && asset.palette[0] === 0, "PXD_PALETTE_INVALID", `PXD asset ${index} palette is invalid.`);
    assert(Number.isSafeInteger(asset.revision) && asset.revision >= 0, "PXD_REVISION_INVALID", `PXD asset ${index} revision is invalid.`);
    assert(Number.isSafeInteger(asset.offset) && asset.offset >= 0, "PXD_OFFSET_INVALID", `PXD asset ${index} offset is invalid.`);
  }
  return manifest;
}
function buildImportedAsset(entry, bytes) {
  assert(bytes.byteLength === entry.bytes && bytes.byteLength === entry.width * entry.height, "PXD_ASSET_SIZE_MISMATCH", `PXD asset ${entry.assetId} byte size does not match its dimensions.`);
  const raster = IndexedTileRaster.empty(entry.width, entry.height, entry.tileSize);
  for (let index = 0; index < bytes.length; index += 1) {
    const colorIndex = bytes[index] ?? 0;
    assert(colorIndex < entry.palette.length, "PXD_PIXEL_INDEX_INVALID", `PXD asset ${entry.assetId} contains an out-of-range palette index.`);
    if (colorIndex === 0) continue;
    const x = index % entry.width;
    const y = Math.floor(index / entry.width);
    raster.setPixel(entry.assetId, x, y, colorIndex);
  }
  return {
    id: entry.assetId,
    width: entry.width,
    height: entry.height,
    palette: [
      ...entry.palette
    ],
    raster,
    revision: entry.revision
  };
}
async function importPxdPackage(bytes, options = {}) {
  assert(bytes.byteLength >= PXD_HEADER_BYTES, "PXD_TRUNCATED", "PXD package header is truncated.");
  for (let index = 0; index < PXD_MAGIC.length; index += 1) assert(bytes[index] === PXD_MAGIC[index], "PXD_MAGIC_INVALID", "PXD magic header is invalid.");
  assert(bytes[4] === PXD_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD archive version.");
  const manifestLength = readUint32(bytes, 5, "PXD manifest");
  const manifestStart = PXD_HEADER_BYTES;
  const payloadStart = manifestStart + manifestLength;
  assert(payloadStart <= bytes.byteLength, "PXD_TRUNCATED", "PXD manifest is truncated.");
  let manifest;
  try {
    manifest = validateManifest(JSON.parse(new TextDecoder().decode(bytes.subarray(manifestStart, payloadStart))));
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error("PXD manifest JSON is invalid."), {
      code: "PXD_MANIFEST_JSON_INVALID"
    });
    throw cause;
  }
  const manifestBase = {
    ...manifest
  };
  delete manifestBase.canonicalManifestHash;
  const actualManifestHash = await sha256BytesHex(new TextEncoder().encode(manifestWithoutHash(manifestBase)));
  assert(actualManifestHash === manifest.canonicalManifestHash, "PXD_MANIFEST_HASH_MISMATCH", "PXD manifest hash does not match its contents.");
  const packageHash = await sha256BytesHex(bytes);
  if (options.expectedPackageHash !== void 0) assert(packageHash === options.expectedPackageHash, "PXD_PACKAGE_HASH_MISMATCH", "PXD package hash does not match the expected hash.");
  const assets = {};
  let expectedOffset = 0;
  for (const entry of manifest.assets) {
    assert(entry.offset === expectedOffset, "PXD_ASSET_OFFSET_INVALID", `PXD asset ${entry.assetId} is not in canonical payload order.`);
    const start = payloadStart + entry.offset;
    const end = start + entry.bytes;
    assert(end <= bytes.byteLength, "PXD_TRUNCATED", `PXD asset ${entry.assetId} is truncated.`);
    const rasterBytes = bytes.slice(start, end);
    assert(await sha256BytesHex(rasterBytes) === entry.sha256, "PXD_ASSET_HASH_MISMATCH", `PXD asset ${entry.assetId} hash does not match its contents.`);
    assert(assets[entry.assetId] === void 0, "PXD_ASSET_DUPLICATE", `PXD asset ${entry.assetId} is duplicated.`);
    assets[entry.assetId] = buildImportedAsset(entry, rasterBytes);
    expectedOffset += entry.bytes;
  }
  assert(payloadStart + expectedOffset === bytes.byteLength, "PXD_TRAILING_BYTES", "PXD contains unexpected trailing bytes.");
  const primary = manifest.assets[0];
  assert(primary !== void 0, "PXD_ASSETS_EMPTY", "PXD has no primary asset.");
  const project = manifest.project;
  const created = createProject({
    projectId: manifest.projectId,
    name: project.name,
    width: primary.width,
    height: primary.height,
    tileSize: primary.tileSize,
    palette: primary.palette
  });
  const state = {
    ...created,
    structureEpoch: project.structureEpoch,
    activeAssetId: project.activeAssetId,
    activeLayerId: project.activeLayerId,
    activeFrameId: project.activeFrameId,
    activeCelId: project.activeCelId,
    layers: project.layers.map((layer) => ({
      ...layer
    })),
    frames: project.frames.map((frame) => ({
      ...frame
    })),
    cels: project.cels.map((cel) => ({
      ...cel
    })),
    timeline: {
      ...project.timeline,
      frameOrder: [
        ...project.timeline.frameOrder
      ],
      layerTrackOrder: [
        ...project.timeline.layerTrackOrder
      ]
    },
    tilemaps: project.tilemaps ?? {},
    assets,
    appliedCommandIds: [],
    lastClientSequenceByClient: {}
  };
  assert(state.assets[state.activeAssetId] !== void 0, "PXD_ACTIVE_ASSET_MISSING", "PXD active asset is missing.");
  return {
    state,
    packageHash,
    manifestHash: manifest.canonicalManifestHash,
    assetDefinitions: manifest.assetDefinitions === void 0 ? [] : manifest.assetDefinitions.map((entry, index) => validateAssetDefinitionEntry(entry, index)),
    drawTimelineMetadata: manifest.drawTimelineMetadata === void 0 ? normalizeDraw2TimelineMetadata(void 0, state.frames.length) : normalizeDraw2TimelineMetadata(manifest.drawTimelineMetadata, state.frames.length)
  };
}
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function projectPayloadPathIsSafe(path) {
  return path.length > 0 && path.length <= 512 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") && !/[\u0000\u0009\u000a\u000d]/u.test(path);
}
function projectJsonPayload(value, path) {
  assert(value !== void 0, "PXD_MODULE_STATE_MISSING", `${path} is missing.`);
  const json = canonicalJson(value);
  assert(json.length > 0, "PXD_MODULE_STATE_EMPTY", `${path} is empty.`);
  return new TextEncoder().encode(json);
}
function projectMediaType(value, path) {
  assert(typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 128 && !/[\u0000-\u0020]/u.test(value), "PXD_MEDIA_TYPE_INVALID", `${path} media type is invalid.`);
  return value;
}
function projectPayloadEntry(spec, offset) {
  assert(projectPayloadPathIsSafe(spec.path), "PXD_PATH_UNSAFE", `PXD path ${spec.path} is unsafe.`);
  assert(Number.isSafeInteger(offset) && offset >= 0, "PXD_OFFSET_INVALID", `PXD offset for ${spec.path} is invalid.`);
  return {
    path: spec.path,
    mediaType: projectMediaType(spec.mediaType, spec.path),
    sha256: "",
    bytes: spec.bytes.byteLength,
    offset
  };
}
function projectModuleManifest(schemaVersion, state, assets = []) {
  return {
    schemaVersion,
    status: "EMBEDDED",
    state,
    assets
  };
}
function emptyProjectModule() {
  return {
    schemaVersion: null,
    status: "EMPTY",
    state: null,
    assets: []
  };
}
async function exportPxdProject(state, options = {}) {
  const assetDefinitions = normalizeAssetDefinitions(options.assetDefinitions);
  const drawTimelineMetadata = options.drawTimelineMetadata === void 0 ? void 0 : normalizeDraw2TimelineMetadata(options.drawTimelineMetadata, state.frames.length);
  const payloadSpecs = [];
  const drawAssetSpecs = [];
  const assetIds = Object.keys(state.assets).sort(compareStrings);
  for (const [assetIndex, assetId] of assetIds.entries()) {
    const asset = state.assets[assetId];
    assert(asset !== void 0, "PXD_ASSET_NOT_FOUND", `PXD export asset ${assetId} was not found.`);
    const pixels = asset.raster.toUint8Array();
    const path = `objects/asset-${String(assetIndex).padStart(4, "0")}.raster`;
    const sha256 = await sha256BytesHex(pixels);
    drawAssetSpecs.push({
      asset: {
        assetId: asset.id,
        revisionId: `${asset.id}:revision:${asset.revision}`,
        mediaType: "application/vnd.pixieed.indexed-raster",
        width: asset.width,
        height: asset.height,
        tileSize: asset.raster.tileSize,
        palette: [
          ...asset.palette
        ],
        revision: asset.revision
      },
      path,
      pixels,
      sha256
    });
    payloadSpecs.push({
      path,
      mediaType: "application/vnd.pixieed.indexed-raster",
      bytes: pixels
    });
  }
  let audioStateSpec;
  const audioAssetSpecs = [];
  if (options.audio !== void 0) {
    assert(options.audio.schemaVersion.trim().length > 0, "PXD_MODULE_SCHEMA_INVALID", "Audio schemaVersion is invalid.");
    audioStateSpec = {
      path: "modules/audio/state.json",
      mediaType: "application/json",
      bytes: projectJsonPayload(options.audio.record, "modules.audio.state")
    };
    payloadSpecs.push(audioStateSpec);
    const sourceAssets = [
      ...options.audio.assets ?? []
    ].sort((left, right) => compareStrings(left.revisionId, right.revisionId));
    const seenRevisionIds = /* @__PURE__ */ new Set();
    for (const [index, source] of sourceAssets.entries()) {
      assert(typeof source.revisionId === "string" && source.revisionId.trim() === source.revisionId && source.revisionId.length > 0, "PXD_AUDIO_REVISION_INVALID", `Audio asset ${index} revisionId is invalid.`);
      assert(!seenRevisionIds.has(source.revisionId), "PXD_AUDIO_REVISION_DUPLICATE", `Audio revision ${source.revisionId} is duplicated.`);
      seenRevisionIds.add(source.revisionId);
      assert(source.bytes.byteLength > 0, "PXD_AUDIO_ASSET_EMPTY", `Audio asset ${source.revisionId} is empty.`);
      const path = `objects/audio-${String(index).padStart(4, "0")}.bin`;
      const mediaType = projectMediaType(source.mediaType, `audio.assets.${source.revisionId}`);
      const sha256 = await sha256BytesHex(source.bytes);
      audioAssetSpecs.push({
        revisionId: source.revisionId,
        path,
        mediaType,
        bytes: source.bytes,
        sha256
      });
      payloadSpecs.push({
        path,
        mediaType,
        bytes: source.bytes
      });
    }
  }
  let gameStateSpec;
  if (options.game !== void 0) {
    assert(options.game.schemaVersion.trim().length > 0, "PXD_MODULE_SCHEMA_INVALID", "Game schemaVersion is invalid.");
    gameStateSpec = {
      path: "modules/game/state.json",
      mediaType: "application/json",
      bytes: projectJsonPayload(options.game.record, "modules.game.state")
    };
    payloadSpecs.push(gameStateSpec);
  }
  const availableModules = /* @__PURE__ */ new Set([
    "DRAW"
  ]);
  if (options.audio !== void 0) availableModules.add("AUDIO");
  if (options.game !== void 0) availableModules.add("GAME");
  const productDefinitions = normalizePxdProductDefinitions(options.productDefinitions, assetDefinitions, audioAssetSpecs.map((asset) => asset.revisionId), availableModules);
  payloadSpecs.sort((left, right) => compareStrings(left.path, right.path));
  const payloadEntries = /* @__PURE__ */ new Map();
  const payloadByPath = /* @__PURE__ */ new Map();
  let offset = 0;
  for (const spec of payloadSpecs) {
    assert(!payloadEntries.has(spec.path), "PXD_ENTRY_DUPLICATE", `PXD entry ${spec.path} is duplicated.`);
    const entry = projectPayloadEntry(spec, offset);
    payloadEntries.set(spec.path, {
      ...entry,
      sha256: await sha256BytesHex(spec.bytes)
    });
    payloadByPath.set(spec.path, spec.bytes);
    offset += spec.bytes.byteLength;
  }
  const drawAssets = drawAssetSpecs.map((spec) => {
    const entry = payloadEntries.get(spec.path);
    assert(entry !== void 0, "PXD_ENTRY_MISSING", `PXD Draw entry ${spec.path} is missing.`);
    return {
      ...spec.asset,
      path: spec.path,
      sha256: spec.sha256,
      bytes: spec.pixels.byteLength,
      offset: entry.offset
    };
  });
  const audioAssets = audioAssetSpecs.map((spec) => {
    const entry = payloadEntries.get(spec.path);
    assert(entry !== void 0, "PXD_ENTRY_MISSING", `PXD Audio entry ${spec.path} is missing.`);
    return {
      ...entry,
      revisionId: spec.revisionId
    };
  });
  const audioModule = options.audio === void 0 ? emptyProjectModule() : projectModuleManifest(options.audio.schemaVersion, payloadEntries.get(audioStateSpec.path), audioAssets);
  const gameModule = options.game === void 0 ? emptyProjectModule() : projectModuleManifest(options.game.schemaVersion, payloadEntries.get(gameStateSpec.path));
  const content = {
    format: PXD_FORMAT,
    schemaVersion: PXD_PROJECT_SCHEMA_VERSION,
    archiveVersion: PXD_PROJECT_ARCHIVE_VERSION,
    packageKind: "PROJECT_PACKAGE",
    projectId: state.projectId,
    project: projectMetadata(state),
    modules: {
      draw: {
        schemaVersion: "DRAW2_PROJECT_V1",
        status: "EMBEDDED",
        state: null,
        assets: drawAssets
      },
      audio: audioModule,
      game: gameModule
    },
    entries: [
      ...payloadEntries.values()
    ],
    assetDefinitions,
    ...drawTimelineMetadata === void 0 ? {} : {
      drawTimelineMetadata
    },
    productDefinitions,
    dependencies: []
  };
  const packageId = `pxd_${(await sha256BytesHex(new TextEncoder().encode(canonicalJson(content)))).slice(0, 32)}`;
  const manifestBase = {
    ...content,
    packageId,
    createdBy: PXD_CREATED_BY
  };
  const manifestHash = await sha256BytesHex(new TextEncoder().encode(canonicalJson(manifestBase)));
  const manifest = {
    ...manifestBase,
    canonicalManifestHash: manifestHash
  };
  const manifestBytes = new TextEncoder().encode(canonicalJson(manifest));
  assert(manifestBytes.byteLength <= 4294967295, "PXD_MANIFEST_TOO_LARGE", "PXD manifest exceeds the container limit.");
  const payloads = [
    ...payloadEntries.keys()
  ].map((path) => payloadByPath.get(path));
  const bytes = concatBytes(PXD_MAGIC, new Uint8Array([
    PXD_PROJECT_ARCHIVE_VERSION
  ]), writeUint32(manifestBytes.byteLength), manifestBytes, ...payloads);
  return {
    bytes,
    filename: packageFileName(state.projectId),
    mimeType: PXD_MIME_TYPE,
    packageHash: await sha256BytesHex(bytes),
    manifestHash,
    manifest
  };
}
function validateProjectPayloadEntry(value, path) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_ENTRY_INVALID", `${path} is invalid.`);
  const entry = value;
  assert(projectPayloadPathIsSafe(entry.path), "PXD_PATH_UNSAFE", `${path}.path is unsafe.`);
  assert(typeof entry.mediaType === "string" && entry.mediaType.length > 0, "PXD_MEDIA_TYPE_INVALID", `${path}.mediaType is invalid.`);
  assert(/^[a-f0-9]{64}$/u.test(entry.sha256), "PXD_ENTRY_HASH_INVALID", `${path}.sha256 is invalid.`);
  assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, "PXD_ENTRY_SIZE_INVALID", `${path}.bytes is invalid.`);
  assert(Number.isSafeInteger(entry.offset) && entry.offset >= 0, "PXD_OFFSET_INVALID", `${path}.offset is invalid.`);
  return entry;
}
function validateProjectModuleManifest(value, path) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_MODULE_INVALID", `${path} is invalid.`);
  const module = value;
  assert(module.schemaVersion === null || typeof module.schemaVersion === "string" && module.schemaVersion.length > 0, "PXD_MODULE_SCHEMA_INVALID", `${path}.schemaVersion is invalid.`);
  assert(module.status === "EMPTY" || module.status === "EMBEDDED", "PXD_MODULE_STATUS_INVALID", `${path}.status is invalid.`);
  assert(module.state === null || typeof module.state === "object", "PXD_MODULE_STATE_INVALID", `${path}.state is invalid.`);
  const state = module.state === null ? null : validateProjectPayloadEntry(module.state, `${path}.state`);
  assert(Array.isArray(module.assets), "PXD_MODULE_ASSETS_INVALID", `${path}.assets is invalid.`);
  const assets = module.assets.map((asset, index) => {
    const entry = validateProjectPayloadEntry(asset, `${path}.assets[${index}]`);
    const candidate = asset;
    assert(typeof candidate.revisionId === "string" && candidate.revisionId.length > 0, "PXD_AUDIO_REVISION_INVALID", `${path}.assets[${index}].revisionId is invalid.`);
    return {
      ...entry,
      revisionId: candidate.revisionId
    };
  });
  if (module.status === "EMPTY") {
    assert(module.schemaVersion === null && state === null && assets.length === 0, "PXD_MODULE_EMPTY_INVALID", `${path} empty module must not contain state or assets.`);
  } else {
    assert(module.schemaVersion !== null && state !== null, "PXD_MODULE_STATE_MISSING", `${path} embedded module state is missing.`);
  }
  return {
    schemaVersion: module.schemaVersion,
    status: module.status,
    state,
    assets
  };
}
function validateProjectManifestAsset(value, index) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_ASSET_INVALID", `modules.draw.assets[${index}] is invalid.`);
  const asset = value;
  assert(typeof asset.assetId === "string" && typeof asset.revisionId === "string", "PXD_ASSET_INVALID", `modules.draw.assets[${index}] identity is invalid.`);
  assert(asset.mediaType === "application/vnd.pixieed.indexed-raster", "PXD_ASSET_TYPE_UNSUPPORTED", `modules.draw.assets[${index}] media type is unsupported.`);
  assert(/^objects\/asset-\d{4}\.raster$/u.test(asset.path), "PXD_PATH_UNSAFE", `modules.draw.assets[${index}].path is invalid.`);
  assert(/^[a-f0-9]{64}$/u.test(asset.sha256), "PXD_ASSET_HASH_INVALID", `modules.draw.assets[${index}].sha256 is invalid.`);
  assert(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, "PXD_ASSET_SIZE_INVALID", `modules.draw.assets[${index}].bytes is invalid.`);
  assert(Number.isSafeInteger(asset.width) && asset.width > 0 && Number.isSafeInteger(asset.height) && asset.height > 0, "PXD_ASSET_DIMENSIONS_INVALID", `modules.draw.assets[${index}] dimensions are invalid.`);
  assert(asset.tileSize === 32 || asset.tileSize === 64, "PXD_TILE_SIZE_INVALID", `modules.draw.assets[${index}].tileSize is invalid.`);
  assert(Array.isArray(asset.palette) && asset.palette.length >= 1 && asset.palette.length <= 256 && asset.palette[0] === 0, "PXD_PALETTE_INVALID", `modules.draw.assets[${index}].palette is invalid.`);
  assert(Number.isSafeInteger(asset.revision) && asset.revision >= 0, "PXD_REVISION_INVALID", `modules.draw.assets[${index}].revision is invalid.`);
  assert(Number.isSafeInteger(asset.offset) && asset.offset >= 0, "PXD_OFFSET_INVALID", `modules.draw.assets[${index}].offset is invalid.`);
  return asset;
}
function validateProjectManifest(value) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_MANIFEST_INVALID", "PXD v2 manifest must be an object.");
  const manifest = value;
  assert(manifest.format === PXD_FORMAT, "PXD_FORMAT_UNSUPPORTED", "Unsupported PXD format.");
  assert(manifest.schemaVersion === PXD_PROJECT_SCHEMA_VERSION && manifest.archiveVersion === PXD_PROJECT_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD project schema or archive version.");
  assert(manifest.packageKind === "PROJECT_PACKAGE", "PXD_PACKAGE_KIND_UNSUPPORTED", "Unsupported PXD package kind.");
  assert(typeof manifest.packageId === "string" && manifest.packageId.length > 0 && typeof manifest.projectId === "string" && manifest.projectId.length > 0, "PXD_MANIFEST_INVALID", "PXD project identity is invalid.");
  assert(Array.isArray(manifest.entries), "PXD_ENTRIES_INVALID", "PXD entries are invalid.");
  const entries = manifest.entries.map((entry, index) => validateProjectPayloadEntry(entry, `entries[${index}]`));
  for (let index = 1; index < entries.length; index += 1) {
    assert(entries[index - 1].path < entries[index].path, "PXD_ENTRY_ORDER_INVALID", "PXD entries must be in canonical path order.");
  }
  assert(typeof manifest.canonicalManifestHash === "string" && /^[a-f0-9]{64}$/u.test(manifest.canonicalManifestHash), "PXD_MANIFEST_HASH_INVALID", "PXD manifest hash is invalid.");
  assert(Array.isArray(manifest.dependencies) && manifest.dependencies.length === 0, "PXD_DEPENDENCIES_UNSUPPORTED", "PXD project dependencies must be empty.");
  validateProjectMetadata(manifest.project);
  if (manifest.drawTimelineMetadata !== void 0) {
    const normalized = normalizeDraw2TimelineMetadata(manifest.drawTimelineMetadata, manifest.project.frames.length);
    assert(canonicalJson(normalized) === canonicalJson(manifest.drawTimelineMetadata), "PXD_TIMELINE_METADATA_NOT_NORMALIZED", "PXD Draw timeline metadata must be canonically normalized.");
  }
  assert(manifest.modules !== null && typeof manifest.modules === "object", "PXD_MODULES_INVALID", "PXD modules are missing.");
  const draw = manifest.modules.draw;
  assert(draw !== null && typeof draw === "object" && draw.schemaVersion === "DRAW2_PROJECT_V1" && draw.status === "EMBEDDED" && draw.state === null && Array.isArray(draw.assets) && draw.assets.length > 0, "PXD_DRAW_MODULE_INVALID", "PXD Draw module is invalid.");
  const drawAssets = draw.assets.map((asset, index) => validateProjectManifestAsset(asset, index));
  const audio = validateProjectModuleManifest(manifest.modules.audio, "modules.audio");
  const game = validateProjectModuleManifest(manifest.modules.game, "modules.game");
  if (manifest.assetDefinitions !== void 0) {
    assert(Array.isArray(manifest.assetDefinitions), "PXD_ASSET_DEFINITION_INVALID", "PXD assetDefinitions must be an array.");
  }
  const assetDefinitions = manifest.assetDefinitions === void 0 ? [] : manifest.assetDefinitions.map((entry, index) => validateAssetDefinitionEntry(entry, index));
  for (let index = 1; index < assetDefinitions.length; index += 1) {
    assert(assetDefinitions[index - 1].definitionId < assetDefinitions[index].definitionId, "PXD_ASSET_DEFINITION_ORDER_INVALID", "PXD assetDefinitions must be in canonical definitionId order.");
  }
  const availableModules = /* @__PURE__ */ new Set([
    "DRAW"
  ]);
  if (audio.status === "EMBEDDED") availableModules.add("AUDIO");
  if (game.status === "EMBEDDED") availableModules.add("GAME");
  if (manifest.productDefinitions !== void 0) {
    assert(Array.isArray(manifest.productDefinitions), "PXD_PRODUCT_DEFINITION_INVALID", "PXD productDefinitions must be an array.");
  }
  const productDefinitions = normalizePxdProductDefinitions(manifest.productDefinitions, assetDefinitions, audio.assets.map((asset) => asset.revisionId), availableModules);
  if (manifest.productDefinitions !== void 0) {
    assert(canonicalJson(productDefinitions) === canonicalJson(manifest.productDefinitions), "PXD_PRODUCT_DEFINITION_NOT_NORMALIZED", "PXD productDefinitions must be canonically normalized.");
  }
  const entryPaths = new Set(entries.map((entry) => entry.path));
  for (const asset of drawAssets) assert(entryPaths.has(asset.path), "PXD_ENTRY_MISSING", `PXD Draw entry ${asset.path} is missing.`);
  for (const module of [
    audio,
    game
  ]) {
    if (module.state !== null) assert(entryPaths.has(module.state.path), "PXD_ENTRY_MISSING", `PXD module entry ${module.state.path} is missing.`);
    for (const asset of module.assets) assert(entryPaths.has(asset.path), "PXD_ENTRY_MISSING", `PXD module entry ${asset.path} is missing.`);
  }
  return {
    ...manifest,
    modules: {
      draw: {
        ...draw,
        assets: drawAssets
      },
      audio,
      game
    },
    entries
  };
}
function parseProjectJsonPayload(entry, payloads) {
  const bytes = payloads.get(entry.path);
  assert(bytes !== void 0, "PXD_ENTRY_MISSING", `PXD entry ${entry.path} is missing.`);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error(`PXD module JSON ${entry.path} is invalid.`), {
      code: "PXD_MODULE_JSON_INVALID"
    });
    throw cause;
  }
}
async function importPxdProject(bytes, options = {}) {
  assert(bytes.byteLength >= PXD_HEADER_BYTES, "PXD_TRUNCATED", "PXD project header is truncated.");
  for (let index = 0; index < PXD_MAGIC.length; index += 1) assert(bytes[index] === PXD_MAGIC[index], "PXD_MAGIC_INVALID", "PXD magic header is invalid.");
  assert(bytes[4] === PXD_PROJECT_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD project archive version.");
  const manifestLength = readUint32(bytes, 5, "PXD project manifest");
  const manifestStart = PXD_HEADER_BYTES;
  const payloadStart = manifestStart + manifestLength;
  assert(payloadStart <= bytes.byteLength, "PXD_TRUNCATED", "PXD project manifest is truncated.");
  let manifest;
  try {
    manifest = validateProjectManifest(JSON.parse(new TextDecoder().decode(bytes.subarray(manifestStart, payloadStart))));
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error("PXD project manifest JSON is invalid."), {
      code: "PXD_MANIFEST_JSON_INVALID"
    });
    throw cause;
  }
  const manifestBase = {
    ...manifest
  };
  delete manifestBase.canonicalManifestHash;
  const actualManifestHash = await sha256BytesHex(new TextEncoder().encode(canonicalJson(manifestBase)));
  assert(actualManifestHash === manifest.canonicalManifestHash, "PXD_MANIFEST_HASH_MISMATCH", "PXD project manifest hash does not match its contents.");
  const packageHash = await sha256BytesHex(bytes);
  if (options.expectedPackageHash !== void 0) assert(packageHash === options.expectedPackageHash, "PXD_PACKAGE_HASH_MISMATCH", "PXD package hash does not match the expected hash.");
  const payloads = /* @__PURE__ */ new Map();
  let expectedOffset = 0;
  for (const entry of manifest.entries) {
    assert(entry.offset === expectedOffset, "PXD_ENTRY_OFFSET_INVALID", `PXD entry ${entry.path} is not in canonical payload order.`);
    const start = payloadStart + entry.offset;
    const end = start + entry.bytes;
    assert(end <= bytes.byteLength, "PXD_TRUNCATED", `PXD entry ${entry.path} is truncated.`);
    const entryBytes = bytes.slice(start, end);
    assert(await sha256BytesHex(entryBytes) === entry.sha256, "PXD_ENTRY_HASH_MISMATCH", `PXD entry ${entry.path} hash does not match its contents.`);
    payloads.set(entry.path, entryBytes);
    expectedOffset += entry.bytes;
  }
  assert(payloadStart + expectedOffset === bytes.byteLength, "PXD_TRAILING_BYTES", "PXD project contains unexpected trailing bytes.");
  const assets = {};
  for (const entry of manifest.modules.draw.assets) {
    const rasterBytes = payloads.get(entry.path);
    assert(rasterBytes !== void 0, "PXD_ENTRY_MISSING", `PXD Draw entry ${entry.path} is missing.`);
    assert(await sha256BytesHex(rasterBytes) === entry.sha256, "PXD_ASSET_HASH_MISMATCH", `PXD asset ${entry.assetId} hash does not match its contents.`);
    assert(assets[entry.assetId] === void 0, "PXD_ASSET_DUPLICATE", `PXD asset ${entry.assetId} is duplicated.`);
    assets[entry.assetId] = buildImportedAsset(entry, rasterBytes);
  }
  const primary = manifest.modules.draw.assets[0];
  assert(primary !== void 0, "PXD_ASSETS_EMPTY", "PXD project has no Draw asset.");
  const project = manifest.project;
  const created = createProject({
    projectId: manifest.projectId,
    name: project.name,
    width: primary.width,
    height: primary.height,
    tileSize: primary.tileSize,
    palette: primary.palette
  });
  const state = {
    ...created,
    structureEpoch: project.structureEpoch,
    activeAssetId: project.activeAssetId,
    activeLayerId: project.activeLayerId,
    activeFrameId: project.activeFrameId,
    activeCelId: project.activeCelId,
    layers: project.layers.map((layer) => ({
      ...layer
    })),
    frames: project.frames.map((frame) => ({
      ...frame
    })),
    cels: project.cels.map((cel) => ({
      ...cel
    })),
    timeline: {
      ...project.timeline,
      frameOrder: [
        ...project.timeline.frameOrder
      ],
      layerTrackOrder: [
        ...project.timeline.layerTrackOrder
      ]
    },
    tilemaps: project.tilemaps ?? {},
    assets,
    appliedCommandIds: [],
    lastClientSequenceByClient: {}
  };
  assert(state.assets[state.activeAssetId] !== void 0, "PXD_ACTIVE_ASSET_MISSING", "PXD active Draw asset is missing.");
  const audio = manifest.modules.audio.status === "EMPTY" || manifest.modules.audio.state === null ? null : {
    schemaVersion: manifest.modules.audio.schemaVersion,
    record: parseProjectJsonPayload(manifest.modules.audio.state, payloads),
    assets: manifest.modules.audio.assets.map((asset) => ({
      revisionId: asset.revisionId,
      mediaType: asset.mediaType,
      bytes: payloads.get(asset.path)
    }))
  };
  const game = manifest.modules.game.status === "EMPTY" || manifest.modules.game.state === null ? null : {
    schemaVersion: manifest.modules.game.schemaVersion,
    record: parseProjectJsonPayload(manifest.modules.game.state, payloads)
  };
  const assetDefinitions = manifest.assetDefinitions === void 0 ? [] : manifest.assetDefinitions;
  return {
    state,
    packageHash,
    manifestHash: manifest.canonicalManifestHash,
    manifest,
    assetDefinitions,
    drawTimelineMetadata: manifest.drawTimelineMetadata === void 0 ? normalizeDraw2TimelineMetadata(void 0, state.frames.length) : normalizeDraw2TimelineMetadata(manifest.drawTimelineMetadata, state.frames.length),
    productDefinitions: manifest.productDefinitions === void 0 ? [] : manifest.productDefinitions,
    audio,
    game
  };
}
export {
  EXPORT_FORMATS,
  PNG_MIME_TYPE,
  PXD_ARCHIVE_VERSION,
  PXD_FORMAT,
  PXD_MIME_TYPE,
  PXD_PROJECT_ARCHIVE_VERSION,
  PXD_PROJECT_SCHEMA_VERSION,
  PXD_SCHEMA_VERSION,
  encodeApngFrames,
  encodeGifFrames,
  encodePngRgba,
  encodeStoredZip,
  exportApng,
  exportAtlasJson,
  exportBmp,
  exportFormatDefinition,
  exportGif,
  exportPng,
  exportPxd,
  exportPxdProject,
  exportRasterAnimationFrames,
  exportRasterRgba,
  exportSpriteSheet,
  exportSvg,
  exportTiff,
  exportTileset,
  flattenRgba,
  importPxdPackage,
  importPxdProject,
  normalizeExportFormats,
  visibleExportFormats
};
