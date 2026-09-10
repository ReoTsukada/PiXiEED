/**
 * Sparse world data for the beginner iGAME Playground.
 *
 * A world is addressed in continuous world coordinates, while authored tile
 * data is stored in sparse chunk-local cells.  The two concerns are kept
 * separate on purpose: sprites and objects never snap to this grid, and an
 * empty or off-screen chunk is never materialized just because the world is
 * large.
 */

export const GAME_PLAYGROUND_WORLD_SCHEMA_VERSION = 1 as const;
export const GAME_PLAYGROUND_DEFAULT_CHUNK_SIZE = 32 as const;
export const GAME_PLAYGROUND_MAX_CHUNK_SIZE = 256 as const;
// World coordinates are metadata only.  The sparse chunk index and viewport
// projection bound actual memory, so the editor must not impose an artificial
// map-size ceiling.  Safe integers keep persistence and chunk keys stable.
export const GAME_PLAYGROUND_MAX_WORLD_DIMENSION = Number.MAX_SAFE_INTEGER;
export const GAME_PLAYGROUND_MAX_CHUNKS = 100_000 as const;

export type GamePlaygroundWorldBounds = "FINITE" | "INFINITE";

/** One authored tile in chunk-local integer coordinates. */
export interface GamePlaygroundWorldCell {
  readonly x: number;
  readonly y: number;
  /** iDRAW region / tile definition identity; pixel data stays in iDRAW. */
  readonly tileId?: string;
  /** Collision is optional so decorative and passable tiles remain compact. */
  readonly solid?: boolean;
  /** Optional surface cue resolved by the iAUDIO runtime adapter. */
  readonly surfaceId?: string;
}

/** A sparse chunk. Its x/y coordinates are chunk coordinates, not pixels. */
export interface GamePlaygroundWorldChunk {
  readonly x: number;
  readonly y: number;
  readonly cells: readonly GamePlaygroundWorldCell[];
}

export interface GamePlaygroundWorldMap {
  readonly schemaVersion: typeof GAME_PLAYGROUND_WORLD_SCHEMA_VERSION;
  /** INFINITE removes world-edge clamping; width/height remain the editor extent. */
  readonly bounds: GamePlaygroundWorldBounds;
  readonly width: number;
  readonly height: number;
  readonly chunkSize: number;
  /** Only non-empty chunks are persisted. */
  readonly chunks: readonly GamePlaygroundWorldChunk[];
}

export interface GamePlaygroundWorldViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function validInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function validPositiveInteger(value: unknown, maximum: number): value is number {
  return validInteger(value) && value > 0 && value <= maximum;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function gamePlaygroundWorldChunkKey(x: number, y: number): string {
  return `${x},${y}`;
}

function validCell(
  value: unknown,
  chunkSize: number,
): value is GamePlaygroundWorldCell {
  if (!isRecord(value)) return false;
  if (
    !validInteger(value.x) || value.x < 0 || value.x >= chunkSize ||
    !validInteger(value.y) || value.y < 0 || value.y >= chunkSize ||
    (value.tileId !== undefined && !validIdentifier(value.tileId)) ||
    (value.solid !== undefined && typeof value.solid !== "boolean") ||
    (value.surfaceId !== undefined && !validIdentifier(value.surfaceId))
  ) return false;
  // An empty cell is indistinguishable from air and would only waste space.
  return value.tileId !== undefined || value.solid !== undefined ||
    value.surfaceId !== undefined;
}

function validChunk(
  value: unknown,
  chunkSize: number,
): value is GamePlaygroundWorldChunk {
  if (!isRecord(value)) return false;
  if (
    !validInteger(value.x) || !validInteger(value.y) ||
    !Array.isArray(value.cells) || value.cells.length === 0 ||
    value.cells.length > chunkSize * chunkSize
  ) return false;
  const seen = new Set<string>();
  for (const rawCell of value.cells) {
    if (!validCell(rawCell, chunkSize)) return false;
    const key = cellKey(rawCell.x, rawCell.y);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/** Validate sparse world data before it enters a Project or persisted record. */
export function isValidGamePlaygroundWorldMap(
  value: unknown,
): value is GamePlaygroundWorldMap {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== GAME_PLAYGROUND_WORLD_SCHEMA_VERSION ||
    (value.bounds !== "FINITE" && value.bounds !== "INFINITE") ||
    !validPositiveInteger(value.width, GAME_PLAYGROUND_MAX_WORLD_DIMENSION) ||
    !validPositiveInteger(value.height, GAME_PLAYGROUND_MAX_WORLD_DIMENSION) ||
    !validPositiveInteger(value.chunkSize, GAME_PLAYGROUND_MAX_CHUNK_SIZE) ||
    !Array.isArray(value.chunks) || value.chunks.length > GAME_PLAYGROUND_MAX_CHUNKS
  ) return false;
  if (value.width % value.chunkSize !== 0 || value.height % value.chunkSize !== 0) {
    return false;
  }
  const seen = new Set<string>();
  for (const rawChunk of value.chunks) {
    if (!validChunk(rawChunk, value.chunkSize)) return false;
    if (
      value.bounds === "FINITE" &&
      (rawChunk.x < 0 || rawChunk.y < 0 ||
        rawChunk.x >= value.width / value.chunkSize ||
        rawChunk.y >= value.height / value.chunkSize)
    ) return false;
    const key = gamePlaygroundWorldChunkKey(rawChunk.x, rawChunk.y);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function cloneGamePlaygroundWorldMap(
  map: GamePlaygroundWorldMap,
): GamePlaygroundWorldMap {
  return {
    schemaVersion: GAME_PLAYGROUND_WORLD_SCHEMA_VERSION,
    bounds: map.bounds,
    width: map.width,
    height: map.height,
    chunkSize: map.chunkSize,
    chunks: map.chunks.map((chunk) => ({
      x: chunk.x,
      y: chunk.y,
      cells: chunk.cells.map((cell) => ({ ...cell })),
    })),
  };
}

export function createDefaultGamePlaygroundWorldMap(): GamePlaygroundWorldMap {
  return {
    schemaVersion: GAME_PLAYGROUND_WORLD_SCHEMA_VERSION,
    bounds: "INFINITE",
    // Keep a useful 256×256 preview extent, but do not impose an edge on the
    // default world. Only authored chunks consume storage; the extent can be
    // expanded or switched to finite bounds when a project needs that rule.
    width: 256,
    height: 256,
    chunkSize: GAME_PLAYGROUND_DEFAULT_CHUNK_SIZE,
    chunks: [],
  };
}

export function worldChunkCoordinate(value: number, chunkSize: number): number {
  return Math.floor(value / chunkSize);
}

export function worldCellCoordinateInChunk(
  value: number,
  chunkSize: number,
): number {
  const chunk = worldChunkCoordinate(value, chunkSize);
  return value - chunk * chunkSize;
}

export function gamePlaygroundWorldChunkAt(
  map: GamePlaygroundWorldMap,
  chunkX: number,
  chunkY: number,
): GamePlaygroundWorldChunk | undefined {
  return map.chunks.find((chunk) => chunk.x === chunkX && chunk.y === chunkY);
}

/** Resolve an integer world cell without scanning every chunk. */
export function gamePlaygroundWorldCellAt(
  map: GamePlaygroundWorldMap,
  worldX: number,
  worldY: number,
): GamePlaygroundWorldCell | undefined {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return undefined;
  const x = Math.floor(worldX);
  const y = Math.floor(worldY);
  const chunkX = worldChunkCoordinate(x, map.chunkSize);
  const chunkY = worldChunkCoordinate(y, map.chunkSize);
  const chunk = gamePlaygroundWorldChunkAt(map, chunkX, chunkY);
  if (chunk === undefined) return undefined;
  const localX = worldCellCoordinateInChunk(x, map.chunkSize);
  const localY = worldCellCoordinateInChunk(y, map.chunkSize);
  return chunk.cells.find((cell) => cell.x === localX && cell.y === localY);
}

/** Paint one sparse world cell without materializing surrounding air. */
export function paintGamePlaygroundWorldCell(
  map: GamePlaygroundWorldMap,
  worldX: number,
  worldY: number,
  nextCell?: Omit<GamePlaygroundWorldCell, "x" | "y">,
): GamePlaygroundWorldMap {
  if (!Number.isSafeInteger(worldX) || !Number.isSafeInteger(worldY)) {
    throw new RangeError("World cell coordinates must be safe integers.");
  }
  const chunkX = worldChunkCoordinate(worldX, map.chunkSize);
  const chunkY = worldChunkCoordinate(worldY, map.chunkSize);
  const localX = worldCellCoordinateInChunk(worldX, map.chunkSize);
  const localY = worldCellCoordinateInChunk(worldY, map.chunkSize);
  const chunks = map.chunks.map((chunk) => ({ ...chunk, cells: [...chunk.cells] }));
  const index = chunks.findIndex((chunk) => chunk.x === chunkX && chunk.y === chunkY);
  const chunk = index < 0
    ? { x: chunkX, y: chunkY, cells: [] as GamePlaygroundWorldCell[] }
    : chunks[index]!;
  const cellIndex = chunk.cells.findIndex((cell) => cell.x === localX && cell.y === localY);
  if (nextCell === undefined) {
    if (cellIndex >= 0) chunk.cells.splice(cellIndex, 1);
  } else {
    const cell = { x: localX, y: localY, ...nextCell };
    if (cellIndex >= 0) chunk.cells[cellIndex] = cell;
    else chunk.cells.push(cell);
  }
  const nextChunks = chunks.filter((candidate) => candidate.cells.length > 0);
  if (index < 0 && chunk.cells.length > 0) nextChunks.push(chunk);
  return { ...map, chunks: nextChunks };
}

export function gamePlaygroundWorldSolidAt(
  map: GamePlaygroundWorldMap,
  worldX: number,
  worldY: number,
): boolean {
  return gamePlaygroundWorldCellAt(map, worldX, worldY)?.solid === true;
}

/**
 * Non-persisted lookup index for a runtime or renderer. The canonical map
 * remains plain JSON; this index is disposable and can be rebuilt when a
 * chunk edit changes the map revision.
 */
export interface GamePlaygroundWorldIndex {
  readonly map: GamePlaygroundWorldMap;
  readonly cellAt: (worldX: number, worldY: number) => GamePlaygroundWorldCell | undefined;
  readonly solidAt: (worldX: number, worldY: number) => boolean;
  readonly cellsInViewport: (
    viewport: GamePlaygroundWorldViewport,
  ) => readonly GamePlaygroundWorldCellWithPosition[];
}

export function createGamePlaygroundWorldIndex(
  map: GamePlaygroundWorldMap,
): GamePlaygroundWorldIndex {
  const chunks = new Map<string, GamePlaygroundWorldChunk>();
  const cells = new Map<string, ReadonlyMap<string, GamePlaygroundWorldCell>>();
  for (const chunk of map.chunks) {
    const chunkKey = gamePlaygroundWorldChunkKey(chunk.x, chunk.y);
    chunks.set(chunkKey, chunk);
    const cellIndex = new Map<string, GamePlaygroundWorldCell>();
    for (const cell of chunk.cells) cellIndex.set(cellKey(cell.x, cell.y), cell);
    cells.set(chunkKey, cellIndex);
  }
  const cellAt = (worldX: number, worldY: number): GamePlaygroundWorldCell | undefined => {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return undefined;
    const x = Math.floor(worldX);
    const y = Math.floor(worldY);
    const chunkX = worldChunkCoordinate(x, map.chunkSize);
    const chunkY = worldChunkCoordinate(y, map.chunkSize);
    const chunkKey = gamePlaygroundWorldChunkKey(chunkX, chunkY);
    if (!chunks.has(chunkKey)) return undefined;
    const localX = worldCellCoordinateInChunk(x, map.chunkSize);
    const localY = worldCellCoordinateInChunk(y, map.chunkSize);
    return cells.get(chunkKey)?.get(cellKey(localX, localY));
  };
  const cellsInViewport = (
    viewport: GamePlaygroundWorldViewport,
  ): readonly GamePlaygroundWorldCellWithPosition[] => {
    const visible: GamePlaygroundWorldCellWithPosition[] = [];
    for (const chunkKey of gamePlaygroundWorldResidentChunkKeys(map, viewport, 0)) {
      const chunk = chunks.get(chunkKey);
      if (chunk === undefined) continue;
      for (const cell of chunk.cells) {
        const worldX = chunk.x * map.chunkSize + cell.x;
        const worldY = chunk.y * map.chunkSize + cell.y;
        if (
          worldX < viewport.x || worldY < viewport.y ||
          worldX >= viewport.x + viewport.width ||
          worldY >= viewport.y + viewport.height
        ) continue;
        visible.push({ ...cell, worldX, worldY });
      }
    }
    return visible;
  };
  return {
    map,
    cellAt,
    solidAt: (worldX, worldY) => cellAt(worldX, worldY)?.solid === true,
    cellsInViewport,
  };
}

/**
 * Return resident chunk keys for a camera viewport and its adjacent ring.
 * This is intentionally a pure planning helper: the browser renderer can use
 * the result to release chunks as the camera moves without retaining the map's
 * empty space.
 */
export function gamePlaygroundWorldResidentChunkKeys(
  map: GamePlaygroundWorldMap,
  viewport: GamePlaygroundWorldViewport,
  ring = 1,
): readonly string[] {
  const safeRing = Math.max(0, Math.floor(ring));
  const minChunkX = worldChunkCoordinate(viewport.x, map.chunkSize) - safeRing;
  const minChunkY = worldChunkCoordinate(viewport.y, map.chunkSize) - safeRing;
  const maxChunkX = worldChunkCoordinate(
    viewport.x + Math.max(0, viewport.width - 0.000001),
    map.chunkSize,
  ) + safeRing;
  const maxChunkY = worldChunkCoordinate(
    viewport.y + Math.max(0, viewport.height - 0.000001),
    map.chunkSize,
  ) + safeRing;
  const firstX = map.bounds === "FINITE"
    ? Math.max(0, minChunkX)
    : minChunkX;
  const firstY = map.bounds === "FINITE"
    ? Math.max(0, minChunkY)
    : minChunkY;
  const lastX = map.bounds === "FINITE"
    ? Math.min(Math.ceil(map.width / map.chunkSize) - 1, maxChunkX)
    : maxChunkX;
  const lastY = map.bounds === "FINITE"
    ? Math.min(Math.ceil(map.height / map.chunkSize) - 1, maxChunkY)
    : maxChunkY;
  const keys: string[] = [];
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      keys.push(gamePlaygroundWorldChunkKey(x, y));
    }
  }
  return keys;
}

export interface GamePlaygroundWorldCellWithPosition
  extends GamePlaygroundWorldCell {
  readonly worldX: number;
  readonly worldY: number;
}

/** Project only authored cells that intersect the viewport. */
export function gamePlaygroundWorldCellsInViewport(
  map: GamePlaygroundWorldMap,
  viewport: GamePlaygroundWorldViewport,
): readonly GamePlaygroundWorldCellWithPosition[] {
  const keys = new Set(gamePlaygroundWorldResidentChunkKeys(map, viewport, 0));
  const cells: GamePlaygroundWorldCellWithPosition[] = [];
  for (const chunk of map.chunks) {
    if (!keys.has(gamePlaygroundWorldChunkKey(chunk.x, chunk.y))) continue;
    for (const cell of chunk.cells) {
      const worldX = chunk.x * map.chunkSize + cell.x;
      const worldY = chunk.y * map.chunkSize + cell.y;
      if (
        worldX < viewport.x || worldY < viewport.y ||
        worldX >= viewport.x + viewport.width ||
        worldY >= viewport.y + viewport.height
      ) continue;
      cells.push({ ...cell, worldX, worldY });
    }
  }
  return cells;
}
