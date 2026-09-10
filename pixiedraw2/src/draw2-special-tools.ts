/**
 * Small, DOM-free plans for the Draw2 authoring tools that are useful during
 * everyday pixel work.  The entry adapter turns these plans into the normal
 * `raster.writeSet` command, so every action remains one bounded Undo entry.
 */

import { interpolatePixelLine } from "./draw2-core.ts";

export interface SpecialPixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface SpecialPixelWrite extends SpecialPixelPoint {
  readonly colorIndex: number;
}

export interface SpecialPixelReader {
  readonly width: number;
  readonly height: number;
  getPixel(x: number, y: number): number;
}

function uniquePoints(
  points: readonly SpecialPixelPoint[],
): readonly SpecialPixelPoint[] {
  const unique = new Map<string, SpecialPixelPoint>();
  for (const point of points) unique.set(`${point.x}:${point.y}`, point);
  return [...unique.values()];
}

/** Bresenham path with a stable one-pixel footprint for pixel-art strokes. */
export function pixelPerfectPath(
  points: readonly SpecialPixelPoint[],
): readonly SpecialPixelPoint[] {
  if (points.length < 2) return points.length === 0 ? [] : [{ ...points[0]! }];
  const path: SpecialPixelPoint[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    path.push(...interpolatePixelLine(from, to, "pixel-perfect"));
  }
  return uniquePoints(path);
}

function pointInPolygon(
  x: number,
  y: number,
  vertices: readonly SpecialPixelPoint[],
): boolean {
  let inside = false;
  for (
    let index = 0, previous = vertices.length - 1;
    index < vertices.length;
    previous = index++
  ) {
    const current = vertices[index];
    const prior = vertices[previous];
    if (current === undefined || prior === undefined) continue;
    const crosses = (current.y > y) !== (prior.y > y) &&
      x <
        ((prior.x - current.x) * (y - current.y)) / (prior.y - current.y) +
          current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Scanline polygon fill used only for a local selection draft. */
export function polygonSelectionPoints(
  reader: Pick<SpecialPixelReader, "width" | "height">,
  vertices: readonly SpecialPixelPoint[],
): readonly SpecialPixelPoint[] {
  const normalized = uniquePoints(vertices);
  if (normalized.length < 3) return [];
  const minX = Math.max(
    0,
    Math.floor(Math.min(...normalized.map((point) => point.x))),
  );
  const minY = Math.max(
    0,
    Math.floor(Math.min(...normalized.map((point) => point.y))),
  );
  const maxX = Math.min(
    reader.width - 1,
    Math.ceil(Math.max(...normalized.map((point) => point.x))),
  );
  const maxY = Math.min(
    reader.height - 1,
    Math.ceil(Math.max(...normalized.map((point) => point.y))),
  );
  const pixels: SpecialPixelPoint[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, normalized)) pixels.push({ x, y });
    }
  }
  return pixels;
}

export function tileStampWrites(
  reader: Pick<SpecialPixelReader, "width" | "height">,
  source: {
    readonly width: number;
    readonly height: number;
    readonly pixels: readonly number[];
  },
  origin: SpecialPixelPoint,
  scale = 1,
): readonly SpecialPixelWrite[] {
  const safeScale = Math.max(1, Math.min(16, Math.round(scale)));
  const writes: SpecialPixelWrite[] = [];
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const colorIndex = source.pixels[sourceY * source.width + sourceX] ?? 0;
      if (colorIndex === 0) continue;
      for (let dy = 0; dy < safeScale; dy += 1) {
        for (let dx = 0; dx < safeScale; dx += 1) {
          const x = origin.x + sourceX * safeScale + dx;
          const y = origin.y + sourceY * safeScale + dy;
          if (x >= 0 && y >= 0 && x < reader.width && y < reader.height) {
            writes.push({ x, y, colorIndex });
          }
        }
      }
    }
  }
  return writes;
}
