/** Game-owned 2D tilemap authoring operations for the RPG vertical slice. */

import {
  GAME_TILEMAP_DOCUMENT_SCHEMA_VERSION,
  isValidGameTilemapDocument,
  type GameTilemapCell,
  type GameTilemapDocument,
} from "../game-300/core.ts";

// Dimensions are coordinate bounds, not allocated canvas size. The cell list
// remains sparse, so a huge world does not allocate a huge grid in memory.
export const GAME350_TILEMAP_MAX_WIDTH = Number.MAX_SAFE_INTEGER;
export const GAME350_TILEMAP_MAX_HEIGHT = Number.MAX_SAFE_INTEGER;
/** Compatibility export for callers that treated the sparse world as one bound. */
export const GAME350_TILEMAP_MAX_CELLS = Number.MAX_SAFE_INTEGER;

export type GameTilemapPaintMode = "SOLID" | "TRIGGER" | "ERASE";

export interface CreateGameTilemapDocumentOptions {
  readonly mapId: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize?: number;
  readonly cells?: readonly GameTilemapCell[];
}

export interface GameTilemapCellPatch {
  readonly collision?: GameTilemapCell["collision"];
  readonly triggerId?: string | null;
}

export interface GameTilemapValidation {
  readonly valid: boolean;
  readonly diagnostics: readonly string[];
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeDeep(child);
    }
  }
  return value;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function cellSort(left: GameTilemapCell, right: GameTilemapCell): number {
  return left.y - right.y || left.x - right.x;
}

function idIsValid(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function assertDimensions(
  mapId: string,
  width: number,
  height: number,
  tileSize: number,
): void {
  if (!idIsValid(mapId)) throw new Error("Tilemap mapId is invalid.");
  if (!Number.isSafeInteger(width) || width < 1 ||
    width > GAME350_TILEMAP_MAX_WIDTH) {
    throw new Error("Tilemap width must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(height) || height < 1 ||
    height > GAME350_TILEMAP_MAX_HEIGHT) {
    throw new Error("Tilemap height must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(tileSize) || tileSize < 1 || tileSize > 4096) {
    throw new Error("Tilemap tileSize must be an integer between 1 and 4096.");
  }
}

function normalizeCells(
  cells: readonly GameTilemapCell[] = [],
  width: number,
  height: number,
): GameTilemapCell[] {
  const byKey = new Map<string, GameTilemapCell>();
  for (const cell of cells) {
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) ||
      cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) {
      throw new Error("Tilemap cell must be inside the document bounds.");
    }
    if (cell.collision !== "NONE" && cell.collision !== "SOLID") {
      throw new Error("Tilemap cell collision must be NONE or SOLID.");
    }
    if (cell.triggerId !== undefined && !idIsValid(cell.triggerId)) {
      throw new Error("Tilemap triggerId is invalid.");
    }
    if (cell.blockTypeId !== undefined && !idIsValid(cell.blockTypeId)) {
      throw new Error("Tilemap blockTypeId is invalid.");
    }
    // Block Building (decision: 2D, existing tilemap): a cell with only a
    // blockTypeId (no collision, no trigger -- e.g. a walkable decorative
    // block) is meaningful and must be kept, same as a NONE cell that only
    // carries a triggerId.
    if (
      cell.collision === "NONE" && cell.triggerId === undefined &&
      cell.blockTypeId === undefined
    ) {
      throw new Error("An empty tilemap cell must not be persisted.");
    }
    const key = cellKey(cell.x, cell.y);
    if (byKey.has(key)) throw new Error(`Duplicate tilemap cell: ${key}`);
    byKey.set(key, {
      x: cell.x,
      y: cell.y,
      collision: cell.collision,
      ...(cell.triggerId === undefined ? {} : { triggerId: cell.triggerId }),
      ...(cell.blockTypeId === undefined ? {} : { blockTypeId: cell.blockTypeId }),
    });
  }
  return [...byKey.values()].sort(cellSort);
}

function documentFrom(
  options: CreateGameTilemapDocumentOptions,
): GameTilemapDocument {
  const tileSize = options.tileSize ?? 1;
  assertDimensions(options.mapId, options.width, options.height, tileSize);
  const cells = normalizeCells(options.cells, options.width, options.height);
  return freezeDeep({
    schemaVersion: GAME_TILEMAP_DOCUMENT_SCHEMA_VERSION,
    mapId: options.mapId,
    width: options.width,
    height: options.height,
    tileSize,
    cells,
  });
}

export function validateGameTilemapDocument(
  value: unknown,
): GameTilemapValidation {
  if (!isValidGameTilemapDocument(value)) {
    return {
      valid: false,
      diagnostics: ["document"],
    };
  }
  const sorted = [...value.cells].sort(cellSort);
  const canonical = JSON.stringify(sorted);
  if (canonical !== JSON.stringify(value.cells)) {
    return {
      valid: false,
      diagnostics: ["cells.order"],
    };
  }
  return { valid: true, diagnostics: [] };
}

export function createGameTilemapDocument(
  options: CreateGameTilemapDocumentOptions,
): GameTilemapDocument {
  return documentFrom(options);
}

/** Default RPG layout: boundary walls, one inner wall, and a sample trigger. */
export function createDefaultRpgTilemapDocument(
  mapId = "map:tilemap",
): GameTilemapDocument {
  const width = 12;
  const height = 8;
  const cells: GameTilemapCell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        cells.push({ x, y, collision: "SOLID" });
      }
    }
  }
  cells.push(
    { x: 3, y: 2, collision: "SOLID" },
    { x: 4, y: 2, collision: "SOLID" },
    { x: 2, y: 1, collision: "NONE", triggerId: "rpg.start" },
  );
  return createGameTilemapDocument({ mapId, width, height, cells });
}

export function gameTilemapCellAt(
  document: GameTilemapDocument,
  x: number,
  y: number,
): GameTilemapCell | undefined {
  // Cells are canonicalized by (y, x), so lookup stays logarithmic even when
  // a large world contains many authored cells.
  let low = 0;
  let high = document.cells.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cell = document.cells[middle];
    if (cell === undefined) return undefined;
    const comparison = cell.y - y || cell.x - x;
    if (comparison === 0) return cell;
    if (comparison < 0) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}

function assertCellCoordinate(
  document: GameTilemapDocument,
  x: number,
  y: number,
): void {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 ||
    x >= document.width || y < 0 || y >= document.height) {
    throw new Error("Tilemap cell is outside the document bounds.");
  }
}

function withCell(
  document: GameTilemapDocument,
  x: number,
  y: number,
  patch: GameTilemapCellPatch | null,
): GameTilemapDocument {
  assertCellCoordinate(document, x, y);
  const existing = gameTilemapCellAt(document, x, y);
  const nextCell = patch === null
    ? undefined
    : {
      x,
      y,
      collision: patch.collision ?? existing?.collision ?? "NONE",
      ...(patch.triggerId === null
        ? {}
        : patch.triggerId !== undefined
        ? { triggerId: patch.triggerId }
        : existing?.triggerId === undefined
        ? {}
        : { triggerId: existing.triggerId }),
    } satisfies GameTilemapCell;
  if (existing !== undefined && nextCell !== undefined &&
    JSON.stringify(existing) === JSON.stringify(nextCell)) return document;
  if (existing === undefined && nextCell === undefined) return document;
  const cells = document.cells.filter((cell) => !(cell.x === x && cell.y === y));
  if (nextCell !== undefined &&
    !(nextCell.collision === "NONE" && nextCell.triggerId === undefined)) {
    cells.push(nextCell);
  }
  return documentFrom({
    mapId: document.mapId,
    width: document.width,
    height: document.height,
    tileSize: document.tileSize,
    cells,
  });
}

export function setGameTilemapCell(
  document: GameTilemapDocument,
  x: number,
  y: number,
  patch: GameTilemapCellPatch,
): GameTilemapDocument {
  return withCell(document, x, y, patch);
}

export function clearGameTilemapCell(
  document: GameTilemapDocument,
  x: number,
  y: number,
): GameTilemapDocument {
  return withCell(document, x, y, null);
}

export function paintGameTilemapCell(
  document: GameTilemapDocument,
  x: number,
  y: number,
  mode: GameTilemapPaintMode,
  triggerId = "rpg.cell-trigger",
): GameTilemapDocument {
  switch (mode) {
    case "SOLID":
      return setGameTilemapCell(document, x, y, {
        collision: "SOLID",
        triggerId: null,
      });
    case "TRIGGER":
      return setGameTilemapCell(document, x, y, {
        collision: "NONE",
        triggerId,
      });
    case "ERASE":
      return clearGameTilemapCell(document, x, y);
  }
}

export function solidGameTilemapCells(
  document: GameTilemapDocument,
): readonly GameTilemapCell[] {
  return document.cells.filter((cell) => cell.collision === "SOLID");
}

export function triggerGameTilemapCells(
  document: GameTilemapDocument,
): readonly GameTilemapCell[] {
  return document.cells.filter((cell) => cell.triggerId !== undefined);
}
