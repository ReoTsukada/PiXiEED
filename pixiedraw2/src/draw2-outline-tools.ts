/** Pure outline planning for indexed pixel art. */

export type OutlinePlacement = "INSIDE" | "OUTSIDE";
export type OutlineConnectivity = 4 | 8;

export interface OutlinePixelReader {
  readonly width: number;
  readonly height: number;
  readonly palette: readonly number[];
  getPixel(x: number, y: number): number;
}

export interface OutlineOptions {
  readonly colorIndex: number;
  readonly placement: OutlinePlacement;
  readonly thickness: number;
  readonly connectivity: OutlineConnectivity;
  readonly allowedPixels?: ReadonlySet<string>;
}

export interface OutlineWrite {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
}

function isOpaque(color: number): boolean {
  return ((color >>> 24) & 0xff) > 0;
}

function pointKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function withinRadius(
  dx: number,
  dy: number,
  thickness: number,
  connectivity: OutlineConnectivity,
): boolean {
  return connectivity === 4
    ? Math.abs(dx) + Math.abs(dy) <= thickness
    : Math.max(Math.abs(dx), Math.abs(dy)) <= thickness;
}

/**
 * Plans an inside or outside outline without mutating the source raster.
 * Transparent index 0 is not assumed; alpha is read from the indexed palette.
 */
export function createOutlineWriteSet(
  reader: OutlinePixelReader,
  options: OutlineOptions,
): readonly OutlineWrite[] {
  const thickness = Math.max(1, Math.min(16, Math.round(options.thickness)));
  if (
    !Number.isSafeInteger(options.colorIndex) || options.colorIndex <= 0 ||
    options.colorIndex >= reader.palette.length ||
    reader.width < 1 || reader.height < 1
  ) return [];
  const writes: OutlineWrite[] = [];
  for (let y = 0; y < reader.height; y += 1) {
    for (let x = 0; x < reader.width; x += 1) {
      if (options.allowedPixels !== undefined && !options.allowedPixels.has(pointKey(x, y))) continue;
      const opaque = isOpaque(reader.palette[reader.getPixel(x, y)] ?? 0);
      const shouldWrite = options.placement === "OUTSIDE" ? !opaque : opaque;
      if (!shouldWrite) continue;
      let boundary = false;
      for (let dy = -thickness; dy <= thickness && !boundary; dy += 1) {
        for (let dx = -thickness; dx <= thickness; dx += 1) {
          if (dx === 0 && dy === 0 || !withinRadius(dx, dy, thickness, options.connectivity)) continue;
          const neighborX = x + dx;
          const neighborY = y + dy;
          const neighborOpaque = neighborX >= 0 && neighborY >= 0 &&
              neighborX < reader.width && neighborY < reader.height
            ? isOpaque(reader.palette[reader.getPixel(neighborX, neighborY)] ?? 0)
            : false;
          if (options.placement === "OUTSIDE" ? neighborOpaque : !neighborOpaque) {
            boundary = true;
            break;
          }
        }
      }
      if (boundary && reader.getPixel(x, y) !== options.colorIndex) {
        writes.push({ x, y, colorIndex: options.colorIndex });
      }
    }
  }
  return writes;
}
