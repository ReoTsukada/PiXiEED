/** Pure outline planning for indexed pixel art. */

export type OutlinePlacement = "INSIDE" | "OUTSIDE";
export type OutlineConnectivity = 4 | 8;

export interface OutlinePoint {
  readonly x: number;
  readonly y: number;
}

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

/**
 * The bounded descriptor carried by a canonical stroke command.  Keeping this
 * as metadata instead of expanding the outline into a write-set preserves the
 * one-stroke/one-undo contract and keeps PiXYNC payloads small.
 */
export interface StrokeAutoOutlineOptions {
  readonly colorIndex: number;
  readonly placement: OutlinePlacement;
  readonly thickness: number;
  readonly connectivity: OutlineConnectivity;
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

/**
 * Plans an outline around only the pixels produced by one stroke.  Unlike
 * createOutlineWriteSet(), this never scans the whole canvas and never treats
 * unrelated artwork as part of the outline source.  Existing opaque pixels
 * are preserved for OUTSIDE outlines so a new stroke cannot erase artwork
 * underneath it.
 */
export function createStrokeAutoOutlineWriteSet(
  reader: OutlinePixelReader,
  strokePoints: readonly OutlinePoint[],
  options: StrokeAutoOutlineOptions & {
    readonly allowedPixels?: ReadonlySet<string>;
  },
): readonly OutlineWrite[] {
  const thickness = Math.max(1, Math.min(16, Math.round(options.thickness)));
  if (
    !Number.isSafeInteger(options.colorIndex) || options.colorIndex <= 0 ||
    options.colorIndex >= reader.palette.length || reader.width < 1 ||
    reader.height < 1
  ) return [];
  const source = new Set<string>();
  for (const point of strokePoints) {
    if (
      point.x >= 0 && point.y >= 0 && point.x < reader.width &&
      point.y < reader.height
    ) source.add(pointKey(point.x, point.y));
  }
  if (source.size === 0) return [];
  const writes = new Map<string, OutlineWrite>();
  const add = (x: number, y: number): void => {
    const key = pointKey(x, y);
    if (
      options.allowedPixels !== undefined &&
      !options.allowedPixels.has(key)
    ) return;
    if (source.has(key)) return;
    if (options.placement === "OUTSIDE") {
      const original = reader.palette[reader.getPixel(x, y)] ?? 0;
      if (isOpaque(original)) return;
    }
    if (reader.getPixel(x, y) === options.colorIndex) return;
    writes.set(key, { x, y, colorIndex: options.colorIndex });
  };
  for (const sourceKey of source) {
    const [sourceXText, sourceYText] = sourceKey.split(":");
    const sourceX = Number(sourceXText);
    const sourceY = Number(sourceYText);
    if (options.placement === "INSIDE") {
      let hasTransparentNeighbor = false;
      for (let neighborY = -thickness; neighborY <= thickness; neighborY += 1) {
        for (let neighborX = -thickness; neighborX <= thickness; neighborX += 1) {
          if (
            (neighborX === 0 && neighborY === 0) ||
            !withinRadius(neighborX, neighborY, thickness, options.connectivity)
          ) continue;
          const candidateX = sourceX + neighborX;
          const candidateY = sourceY + neighborY;
          if (
            candidateX < 0 || candidateY < 0 ||
            candidateX >= reader.width || candidateY >= reader.height ||
            !source.has(pointKey(candidateX, candidateY))
          ) {
            hasTransparentNeighbor = true;
            break;
          }
        }
        if (hasTransparentNeighbor) break;
      }
      if (
        hasTransparentNeighbor &&
        options.allowedPixels?.has(sourceKey) !== false &&
        reader.getPixel(sourceX, sourceY) !== options.colorIndex
      ) {
        writes.set(sourceKey, {
          x: sourceX,
          y: sourceY,
          colorIndex: options.colorIndex,
        });
      }
      continue;
    }
    for (let dy = -thickness; dy <= thickness; dy += 1) {
      for (let dx = -thickness; dx <= thickness; dx += 1) {
        if (
          (dx === 0 && dy === 0) ||
          !withinRadius(dx, dy, thickness, options.connectivity)
        ) continue;
        const x = sourceX + dx;
        const y = sourceY + dy;
        if (
          x < 0 || y < 0 || x >= reader.width || y >= reader.height
        ) continue;
        add(x, y);
      }
    }
  }
  return [...writes.values()];
}
