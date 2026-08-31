/**
 * Lightweight Draw2 Tilemap model.
 *
 * A Tilemap never owns a second copy of the pixels.  Each occupied map cell
 * points at a cell in an existing indexed RasterAsset, so a large empty map
 * remains small and edits to the source tileset are reflected immediately.
 */

export type Draw2LayerKind = "RASTER" | "TILEMAP";

export type Draw2TileTransform =
  | "NONE"
  | "FLIP_X"
  | "FLIP_Y"
  | "ROTATE_90";

export interface Draw2TilemapCell {
  readonly sourceAssetId: string;
  /** Source tile coordinates, not a copied bitmap. */
  readonly sourceX: number;
  readonly sourceY: number;
  readonly transform: Draw2TileTransform;
}

export interface Draw2Tilemap {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly layerTrackId: string;
  readonly frameId: string;
  readonly cellSize: 16 | 32;
  readonly columns: number;
  readonly rows: number;
  readonly cells: Readonly<Record<string, Draw2TilemapCell>>;
  readonly revision: number;
}

export interface CreateDraw2TilemapOptions {
  readonly id: string;
  readonly layerTrackId: string;
  readonly frameId: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly cellSize: 16 | 32;
}

export function tilemapIdFor(layerTrackId: string, frameId: string): string {
  return `${layerTrackId}::${frameId}`;
}

export function tilemapCellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

export function createDraw2Tilemap(
  options: CreateDraw2TilemapOptions,
): Draw2Tilemap {
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
    revision: 0,
  };
}

export function cloneDraw2Tilemap(map: Draw2Tilemap): Draw2Tilemap {
  const cells: Record<string, Draw2TilemapCell> = {};
  for (const [key, cell] of Object.entries(map.cells)) cells[key] = { ...cell };
  return { ...map, cells };
}

export function cloneDraw2Tilemaps(
  tilemaps: Readonly<Record<string, Draw2Tilemap>> | undefined,
): Record<string, Draw2Tilemap> {
  const result: Record<string, Draw2Tilemap> = {};
  for (const [id, map] of Object.entries(tilemaps ?? {})) {
    result[id] = cloneDraw2Tilemap(map);
  }
  return result;
}

export function tilemapCellAt(
  map: Draw2Tilemap | undefined,
  x: number,
  y: number,
): Draw2TilemapCell | undefined {
  if (map === undefined || x < 0 || y < 0 || x >= map.columns || y >= map.rows) {
    return undefined;
  }
  return map.cells[tilemapCellKey(x, y)];
}

export function setDraw2TilemapCell(
  map: Draw2Tilemap,
  x: number,
  y: number,
  cell: Draw2TilemapCell,
): Draw2Tilemap {
  if (
    !Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
    x < 0 || y < 0 || x >= map.columns || y >= map.rows ||
    !cell.sourceAssetId || !Number.isSafeInteger(cell.sourceX) ||
    !Number.isSafeInteger(cell.sourceY) || cell.sourceX < 0 || cell.sourceY < 0
  ) return map;
  const key = tilemapCellKey(x, y);
  const previous = map.cells[key];
  if (
    previous?.sourceAssetId === cell.sourceAssetId &&
    previous.sourceX === cell.sourceX && previous.sourceY === cell.sourceY &&
    previous.transform === cell.transform
  ) return map;
  return {
    ...map,
    cells: { ...map.cells, [key]: { ...cell } },
    revision: map.revision + 1,
  };
}

export function clearDraw2TilemapCell(
  map: Draw2Tilemap,
  x: number,
  y: number,
): Draw2Tilemap {
  const key = tilemapCellKey(x, y);
  if (map.cells[key] === undefined) return map;
  const cells = { ...map.cells };
  delete cells[key];
  return { ...map, cells, revision: map.revision + 1 };
}

export function draw2TilemapCellCount(map: Draw2Tilemap | undefined): number {
  return map === undefined ? 0 : Object.keys(map.cells).length;
}

/** Only tile boundaries are drawn; the pixel grid remains a separate overlay. */
export function buildTilemapGridSvgPath(
  width: number,
  height: number,
  layoutWidth: number,
  layoutHeight: number,
  cellSize: number,
  majorEvery = 8,
): { minor: string; major: string } {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const scaleX = Math.max(1, layoutWidth) / safeWidth;
  const scaleY = Math.max(1, layoutHeight) / safeHeight;
  const step = Math.max(1, Math.round(cellSize));
  const minorParts: string[] = [];
  const majorParts: string[] = [];
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
  return { minor: minorParts.join(" "), major: majorParts.join(" ") };
}

