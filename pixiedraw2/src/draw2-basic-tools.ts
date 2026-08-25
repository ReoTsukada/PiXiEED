import {
  interpolatePixelLine,
  interpolatePixelPath,
  type PixelPoint,
} from "./draw2-core.ts";

export type BasicTool =
  | "pen"
  | "pixel-pen"
  | "eraser"
  | "line"
  | "rect"
  | "rect-fill"
  | "ellipse"
  | "ellipse-fill"
  | "circle"
  | "circle-fill"
  | "fill"
  | "eyedropper"
  | "select-rect"
  | "select-ellipse"
  | "select-lasso"
  | "select-color"
  | "select-polygon"
  | "move"
  | "tile-stamp"
  | "pan";

/** Selection behavior exposed by the unified color-selection tool. */
export type ColorSelectionMode = "similar" | "exact" | "magic" | "opaque";

export type BrushPattern = "solid" | "checker" | "dots" | "bayer-2x2";
export type BrushShape = "square" | "circle";

export interface ToolOptions {
  readonly brushSize: number;
  readonly brushShape: BrushShape;
  readonly pattern: BrushPattern;
  readonly similarity: number;
  readonly selectionMode?: ColorSelectionMode;
}

export interface RasterBounds {
  readonly width: number;
  readonly height: number;
}

export interface PixelReader extends RasterBounds {
  getPixel(x: number, y: number): number;
}

export interface ColoredPixel extends PixelPoint {
  readonly colorIndex: number;
}

export interface SelectionPixels {
  readonly pixels: readonly PixelPoint[];
  readonly bounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  brushSize: 1,
  brushShape: "square",
  pattern: "solid",
  similarity: 0,
  selectionMode: "similar",
};

/** Maximum Euclidean distance between two RGB colors (0..255 per channel). */
export const RGB_COLOR_DISTANCE_MAX = Math.sqrt(3 * 255 * 255);

/** Converts the user-facing 0..100% tolerance to the internal RGB distance. */
export function colorTolerancePercentToDistance(percent: number): number {
  const safePercent = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, percent))
    : 0;
  return Math.round((safePercent / 100) * RGB_COLOR_DISTANCE_MAX);
}

/** Converts an internal RGB distance to a stable, user-facing percentage. */
export function colorToleranceDistanceToPercent(distance: number): number {
  const safeDistance = Number.isFinite(distance)
    ? Math.max(0, Math.min(RGB_COLOR_DISTANCE_MAX, distance))
    : 0;
  return Math.round((safeDistance / RGB_COLOR_DISTANCE_MAX) * 100);
}

export function normalizeToolOptions(
  options: Partial<ToolOptions> = {},
): ToolOptions {
  const requestedBrushSize = options.brushSize;
  const requestedSimilarity = options.similarity;
  const requestedSelectionMode = options.selectionMode;
  const brushSize = Number.isSafeInteger(requestedBrushSize)
    ? Math.max(1, Math.min(32, requestedBrushSize as number))
    : DEFAULT_TOOL_OPTIONS.brushSize;
  const similarity = Number.isFinite(requestedSimilarity)
    ? Math.max(0, Math.min(255, requestedSimilarity as number))
    : DEFAULT_TOOL_OPTIONS.similarity;
  const brushShape = options.brushShape === "circle" ? "circle" : "square";
  const pattern: BrushPattern =
    options.pattern === "checker" || options.pattern === "dots" ||
      options.pattern === "bayer-2x2"
      ? options.pattern
      : "solid";
  const selectionMode: ColorSelectionMode =
    requestedSelectionMode === "exact" ||
        requestedSelectionMode === "magic" ||
        requestedSelectionMode === "opaque"
      ? requestedSelectionMode
      : "similar";
  return { brushSize, brushShape, pattern, similarity, selectionMode };
}

function clampPoint(point: PixelPoint, bounds: RasterBounds): PixelPoint {
  return {
    x: Math.max(0, Math.min(bounds.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(bounds.height - 1, Math.round(point.y))),
  };
}

export function normalizeBounds(
  from: PixelPoint,
  to: PixelPoint,
  bounds: RasterBounds,
): { x: number; y: number; width: number; height: number } {
  const a = clampPoint(from, bounds);
  const b = clampPoint(to, bounds);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(1, Math.abs(a.x - b.x) + 1),
    height: Math.max(1, Math.abs(a.y - b.y) + 1),
  };
}

/**
 * Expands a drag between two pixels to complete, clamped tile-sized cells.
 * This keeps grid selection deterministic for sprite-sheet workflows while
 * still allowing the last cell to be smaller at a raster edge.
 */
export function snapSelectionBoundsToGrid(
  from: PixelPoint,
  to: PixelPoint,
  bounds: RasterBounds,
  gridSize = 16,
): { x: number; y: number; width: number; height: number } {
  const safeGridSize = Number.isSafeInteger(gridSize)
    ? Math.max(1, gridSize)
    : 16;
  const a = clampPoint(from, bounds);
  const b = clampPoint(to, bounds);
  const cellX = Math.min(
    Math.floor(a.x / safeGridSize),
    Math.floor(b.x / safeGridSize),
  );
  const cellY = Math.min(
    Math.floor(a.y / safeGridSize),
    Math.floor(b.y / safeGridSize),
  );
  const endCellX = Math.max(
    Math.floor(a.x / safeGridSize),
    Math.floor(b.x / safeGridSize),
  );
  const endCellY = Math.max(
    Math.floor(a.y / safeGridSize),
    Math.floor(b.y / safeGridSize),
  );
  const x = cellX * safeGridSize;
  const y = cellY * safeGridSize;
  const maxX = Math.min(bounds.width, (endCellX + 1) * safeGridSize);
  const maxY = Math.min(bounds.height, (endCellY + 1) * safeGridSize);
  return {
    x,
    y,
    width: Math.max(1, maxX - x),
    height: Math.max(1, maxY - y),
  };
}

function pointKey(point: PixelPoint): string {
  return `${point.x}:${point.y}`;
}

function sortedUnique(
  points: readonly PixelPoint[],
  bounds: RasterBounds,
): readonly PixelPoint[] {
  const unique = new Map<string, PixelPoint>();
  for (const point of points) {
    const clamped = clampPoint(point, bounds);
    unique.set(pointKey(clamped), clamped);
  }
  return [...unique.values()].sort((left, right) =>
    left.y - right.y || left.x - right.x
  );
}

function patternVisible(x: number, y: number, pattern: BrushPattern): boolean {
  if (pattern === "checker") return (x + y) % 2 === 0;
  if (pattern === "dots") return x % 2 === 0 && y % 2 === 0;
  if (pattern === "bayer-2x2") return ((x & 1) + ((y & 1) * 2)) !== 3;
  return true;
}

function stamp(
  center: PixelPoint,
  options: ToolOptions,
  bounds: RasterBounds,
): readonly PixelPoint[] {
  const size = options.brushSize;
  const start = -Math.floor((size - 1) / 2);
  const end = start + size - 1;
  const centerOffset = (size - 1) / 2;
  const radius = Math.max(0.5, size / 2);
  const points: PixelPoint[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = start + column;
      const y = start + row;
      if (
        options.brushShape === "circle" &&
        ((column - centerOffset) ** 2) + ((row - centerOffset) ** 2) >
          radius ** 2
      ) continue;
      if (!patternVisible(center.x + x, center.y + y, options.pattern)) {
        continue;
      }
      points.push({ x: center.x + x, y: center.y + y });
    }
  }
  return points.filter((point) =>
    point.x >= 0 && point.y >= 0 && point.x < bounds.width &&
    point.y < bounds.height
  );
}

export function stampBrush(
  points: readonly PixelPoint[],
  options: Partial<ToolOptions>,
  bounds: RasterBounds,
): readonly PixelPoint[] {
  const safe = normalizeToolOptions(options);
  const stamped = points.flatMap((point) =>
    stamp(clampPoint(point, bounds), safe, bounds)
  );
  return sortedUnique(stamped, bounds);
}

function rectanglePixels(
  rect: { x: number; y: number; width: number; height: number },
  filled: boolean,
): readonly PixelPoint[] {
  const points: PixelPoint[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (
        filled || x === rect.x || y === rect.y ||
        x === rect.x + rect.width - 1 || y === rect.y + rect.height - 1
      ) points.push({ x, y });
    }
  }
  return points;
}

/**
 * Integer ellipse rasterization shared by preview and commit.
 *
 * This is the inclusive-bounds midpoint algorithm used by the legacy
 * PiXiEEDraw path (the same family as Aseprite's pixel ellipse routine). It
 * deliberately records scanline extrema for filled ellipses so fill and
 * outline use exactly the same boundary. Floating point sampling caused
 * asymmetric caps and a visible mismatch between preview and the committed
 * raster at odd/even dimensions.
 */
function ellipsePixels(
  rect: { x: number; y: number; width: number; height: number },
  filled: boolean,
): readonly PixelPoint[] {
  const points: PixelPoint[] = [];
  const minX = rect.x;
  const maxX = rect.x + rect.width - 1;
  const minY = rect.y;
  const maxY = rect.y + rect.height - 1;
  if (maxX < minX || maxY < minY) return points;
  if (minX === maxX || minY === maxY) {
    if (filled) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          points.push({ x, y });
        }
      }
    } else if (minX === maxX) {
      for (let y = minY; y <= maxY; y += 1) points.push({ x: minX, y });
    } else {
      for (let x = minX; x <= maxX; x += 1) points.push({ x, y: minY });
    }
    return points;
  }

  const fillRanges = filled
    ? new Map<number, { min: number; max: number }>()
    : undefined;
  const record = (x: number, y: number): void => {
    if (x < minX || x > maxX || y < minY || y > maxY) return;
    if (fillRanges !== undefined) {
      const existing = fillRanges.get(y);
      if (existing === undefined) fillRanges.set(y, { min: x, max: x });
      else {
        existing.min = Math.min(existing.min, x);
        existing.max = Math.max(existing.max, x);
      }
      return;
    }
    points.push({ x, y });
  };
  // Coordinates are expressed from the inclusive bounding-box corners. The
  // doubled error terms keep the decision deterministic for half-pixel
  // centers, avoiding the old sqrt/ceil asymmetry.
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
    record(x1, y0);
    record(x0, y0);
    record(x0, y1);
    record(x1, y1);
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
    record(x0 - 1, y0);
    record(x1 + 1, y0);
    record(x0 - 1, y1);
    record(x1 + 1, y1);
    y0 += 1;
    y1 -= 1;
  }

  if (fillRanges !== undefined) {
    for (const [y, range] of fillRanges) {
      for (let x = range.min; x <= range.max; x += 1) points.push({ x, y });
    }
  }
  return points;
}

export function shapePixels(
  tool: BasicTool,
  from: PixelPoint,
  to: PixelPoint,
  bounds: RasterBounds,
): readonly PixelPoint[] {
  const rect = normalizeBounds(from, to, bounds);
  if (tool === "line") {
    return sortedUnique(
      interpolatePixelLine(clampPoint(from, bounds), clampPoint(to, bounds)),
      bounds,
    );
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
    // A circle is fitted inside the drag rectangle. Enlarging to the longest
    // axis clips the opposite axis at the raster edge; fitting to the short
    // axis keeps every generated pixel inside the user's intended bounds.
    const side = Math.min(rect.width, rect.height);
    const circleRect = {
      x: rect.x + Math.floor((rect.width - side) / 2),
      y: rect.y + Math.floor((rect.height - side) / 2),
      width: side,
      height: side,
    };
    return sortedUnique(
      ellipsePixels(circleRect, tool === "circle-fill"),
      bounds,
    );
  }
  return [];
}

export function createWriteSet(
  tool: BasicTool,
  from: PixelPoint,
  to: PixelPoint,
  colorIndex: number,
  options: Partial<ToolOptions>,
  bounds: RasterBounds,
): readonly ColoredPixel[] {
  const safe = normalizeToolOptions(options);
  const base = tool === "pen" || tool === "eraser"
    ? interpolatePixelLine(clampPoint(from, bounds), clampPoint(to, bounds))
    : shapePixels(tool, from, to, bounds);
  return stampBrush(base, safe, bounds).map((point) => ({
    ...point,
    colorIndex: tool === "eraser" ? 0 : colorIndex,
  }));
}

/**
 * Returns the exact write set produced by a single pointer position for
 * preview purposes. Keeping this beside createWriteSet prevents the cursor
 * guide from inventing a second geometry model.
 */
export function createToolPreviewWriteSet(
  tool: BasicTool,
  point: PixelPoint,
  colorIndex: number,
  options: Partial<ToolOptions>,
  bounds: RasterBounds,
): readonly ColoredPixel[] {
  if (tool === "pen" || tool === "eraser") {
    return createPathWriteSet(tool, [point], colorIndex, options, bounds);
  }
  if (tool === "pixel-pen") {
    return createPathWriteSet("pen", [point], colorIndex, {
      ...options,
      brushSize: 1,
      brushShape: "square",
      pattern: "solid",
    }, bounds);
  }
  if (
    tool === "fill" || tool === "eyedropper" || tool === "pan" ||
    tool.startsWith("select-")
  ) return [];
  return createWriteSet(tool, point, point, colorIndex, options, bounds);
}

export function createPathWriteSet(
  tool: "pen" | "eraser",
  points: readonly PixelPoint[],
  colorIndex: number,
  options: Partial<ToolOptions>,
  bounds: RasterBounds,
): readonly ColoredPixel[] {
  if (points.length === 0) return [];
  const path = interpolatePixelPath(
    points.map((point) => clampPoint(point, bounds)),
  );
  return stampBrush(path, normalizeToolOptions(options), bounds)
    .map((point) => ({
      ...point,
      colorIndex: tool === "eraser" ? 0 : colorIndex,
    }));
}

/** Read-only flood-fill planning for the hover guide. */
export function createFillPreviewWriteSet(
  reader: PixelReader,
  seed: PixelPoint,
  colorIndex: number,
  maxPixels = Math.min(1_048_576, reader.width * reader.height),
): readonly ColoredPixel[] {
  const start = clampPoint(seed, reader);
  const targetColor = reader.getPixel(start.x, start.y);
  if (targetColor === colorIndex) return [];
  const queue: PixelPoint[] = [start];
  const visited = new Set<number>();
  const writes: ColoredPixel[] = [];
  let cursor = 0;
  while (cursor < queue.length) {
    const point = queue[cursor];
    cursor += 1;
    if (point === undefined) continue;
    const key = point.y * reader.width + point.x;
    if (visited.has(key)) continue;
    visited.add(key);
    if (reader.getPixel(point.x, point.y) !== targetColor) continue;
    if (writes.length >= maxPixels) return [];
    writes.push({ x: point.x, y: point.y, colorIndex });
    if (point.x > 0) queue.push({ x: point.x - 1, y: point.y });
    if (point.x + 1 < reader.width) queue.push({ x: point.x + 1, y: point.y });
    if (point.y > 0) queue.push({ x: point.x, y: point.y - 1 });
    if (point.y + 1 < reader.height) queue.push({ x: point.x, y: point.y + 1 });
  }
  return writes;
}

/**
 * Projects a flood-filled region onto a drag vector and quantises the
 * interpolated ARGB colours back to the existing indexed palette.
 *
 * A zero-length drag deliberately becomes a solid fill with the end colour;
 * callers can therefore use the same function for click and drag commits.
 */
export function createIndexedGradientWriteSet(
  reader: PixelReader,
  region: readonly PixelPoint[],
  from: PixelPoint,
  to: PixelPoint,
  startColorIndex: number,
  endColorIndex: number,
  palette: readonly number[],
): readonly ColoredPixel[] {
  if (region.length === 0 || palette.length === 0) return [];
  const safeStartIndex = Math.max(
    0,
    Math.min(palette.length - 1, Math.round(startColorIndex)),
  );
  const safeEndIndex = Math.max(
    0,
    Math.min(palette.length - 1, Math.round(endColorIndex)),
  );
  const startColor = palette[safeStartIndex] ?? 0;
  const endColor = palette[safeEndIndex] ?? 0;
  const start = colorChannels(startColor);
  const end = colorChannels(endColor);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const writes: ColoredPixel[] = [];
  for (const point of region) {
    const progress = lengthSquared === 0
      ? 1
      : Math.max(
        0,
        Math.min(
          1,
          ((point.x - from.x) * dx + (point.y - from.y) * dy) /
            lengthSquared,
        ),
      );
    const targetIndex = progress <= 0
      ? safeStartIndex
      : progress >= 1
      ? safeEndIndex
      : nearestPaletteIndex(
        interpolateArgb(start, end, progress),
        palette,
      );
    if (reader.getPixel(point.x, point.y) !== targetIndex) {
      writes.push({ ...point, colorIndex: targetIndex });
    }
  }
  return writes;
}

function interpolateArgb(
  start: readonly number[],
  end: readonly number[],
  progress: number,
): number {
  const alpha = Math.round((start[0] ?? 0) + ((end[0] ?? 0) - (start[0] ?? 0)) * progress);
  const red = Math.round((start[1] ?? 0) + ((end[1] ?? 0) - (start[1] ?? 0)) * progress);
  const green = Math.round((start[2] ?? 0) + ((end[2] ?? 0) - (start[2] ?? 0)) * progress);
  const blue = Math.round((start[3] ?? 0) + ((end[3] ?? 0) - (start[3] ?? 0)) * progress);
  return (((alpha & 0xff) << 24) | ((red & 0xff) << 16) |
    ((green & 0xff) << 8) | (blue & 0xff)) >>> 0;
}

function nearestPaletteIndex(
  color: number,
  palette: readonly number[],
): number {
  const target = colorChannels(color);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = colorChannels(palette[index] ?? 0);
    const alphaDistance = (target[0] ?? 0) - (candidate[0] ?? 0);
    const redDistance = (target[1] ?? 0) - (candidate[1] ?? 0);
    const greenDistance = (target[2] ?? 0) - (candidate[2] ?? 0);
    const blueDistance = (target[3] ?? 0) - (candidate[3] ?? 0);
    const distance = alphaDistance * alphaDistance +
      redDistance * redDistance + greenDistance * greenDistance +
      blueDistance * blueDistance;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function decodeArgb(
  color: number,
): { alpha: number; red: number; green: number; blue: number } {
  return {
    alpha: (color >>> 24) & 0xff,
    red: (color >>> 16) & 0xff,
    green: (color >>> 8) & 0xff,
    blue: color & 0xff,
  };
}

function rgbDistance(a: readonly number[], b: readonly number[]): number {
  const ar = (a[1] ?? 0) - (b[1] ?? 0);
  const ag = (a[2] ?? 0) - (b[2] ?? 0);
  const ab = (a[3] ?? 0) - (b[3] ?? 0);
  return Math.sqrt(ar * ar + ag * ag + ab * ab);
}

export function selectByPaletteColor(
  reader: PixelReader,
  targetColorIndex: number,
  mode: "exact" | "similar",
  palette: readonly number[],
  threshold = 0,
): SelectionPixels {
  const target = palette[targetColorIndex] ?? 0;
  const pixels: PixelPoint[] = [];
  for (let y = 0; y < reader.height; y += 1) {
    for (let x = 0; x < reader.width; x += 1) {
      const currentIndex = reader.getPixel(x, y);
      if (
        mode === "exact" ? currentIndex === targetColorIndex : rgbDistance(
          colorChannels(palette[currentIndex] ?? 0),
          colorChannels(target),
        ) <= threshold
      ) pixels.push({ x, y });
    }
  }
  const bounds = boundsForPixels(pixels);
  return bounds === undefined ? { pixels } : { pixels, bounds };
}

/** Selects the visible (non-zero alpha) pixels across the whole raster. */
export function selectByOpaque(
  reader: PixelReader,
  palette: readonly number[],
): SelectionPixels {
  const pixels: PixelPoint[] = [];
  for (let y = 0; y < reader.height; y += 1) {
    for (let x = 0; x < reader.width; x += 1) {
      const color = palette[reader.getPixel(x, y)] ?? 0;
      if (((color >>> 24) & 0xff) > 0) pixels.push({ x, y });
    }
  }
  const bounds = boundsForPixels(pixels);
  return bounds === undefined ? { pixels } : { pixels, bounds };
}

/** Selects one contiguous exact/similar-color region from a seed pixel. */
export function selectByContiguousColor(
  reader: PixelReader,
  seed: PixelPoint,
  mode: "exact" | "similar",
  palette: readonly number[],
  threshold = 0,
  maxPixels = Math.min(1_048_576, reader.width * reader.height),
): SelectionPixels {
  const start = clampPoint(seed, reader);
  const targetIndex = reader.getPixel(start.x, start.y);
  const target = palette[targetIndex] ?? 0;
  const queue: PixelPoint[] = [start];
  const visited = new Set<number>();
  const pixels: PixelPoint[] = [];
  const matches = (point: PixelPoint): boolean => {
    const currentIndex = reader.getPixel(point.x, point.y);
    return mode === "exact" ? currentIndex === targetIndex : rgbDistance(
      colorChannels(palette[currentIndex] ?? 0),
      colorChannels(target),
    ) <= threshold;
  };
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor];
    if (point === undefined) continue;
    const key = point.y * reader.width + point.x;
    if (visited.has(key)) continue;
    visited.add(key);
    if (!matches(point)) continue;
    if (pixels.length >= maxPixels) return { pixels: [] };
    pixels.push(point);
    if (point.x > 0) queue.push({ x: point.x - 1, y: point.y });
    if (point.x + 1 < reader.width) queue.push({ x: point.x + 1, y: point.y });
    if (point.y > 0) queue.push({ x: point.x, y: point.y - 1 });
    if (point.y + 1 < reader.height) queue.push({ x: point.x, y: point.y + 1 });
  }
  const bounds = boundsForPixels(pixels);
  return bounds === undefined ? { pixels } : { pixels, bounds };
}

/** Selects pixels inside an inclusive ellipse fitted to the drag rectangle. */
export function selectByEllipse(
  reader: RasterBounds,
  from: PixelPoint,
  to: PixelPoint,
): SelectionPixels {
  const bounds = normalizeBounds(from, to, reader);
  const centerX = bounds.x + (bounds.width - 1) / 2;
  const centerY = bounds.y + (bounds.height - 1) / 2;
  const radiusX = Math.max(0.5, bounds.width / 2);
  const radiusY = Math.max(0.5, bounds.height / 2);
  const pixels: PixelPoint[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const normalizedX = (x - centerX) / radiusX;
      const normalizedY = (y - centerY) / radiusY;
      if (normalizedX * normalizedX + normalizedY * normalizedY <= 1.000001) {
        pixels.push({ x, y });
      }
    }
  }
  const selectedBounds = boundsForPixels(pixels);
  return selectedBounds === undefined
    ? { pixels }
    : { pixels, bounds: selectedBounds };
}

function colorChannels(color: number): readonly number[] {
  return [
    (color >>> 24) & 0xff,
    (color >>> 16) & 0xff,
    (color >>> 8) & 0xff,
    color & 0xff,
  ];
}

export function selectByLasso(
  reader: RasterBounds,
  vertices: readonly PixelPoint[],
): SelectionPixels {
  if (vertices.length < 3) return { pixels: [] };
  const pixels: PixelPoint[] = [];
  const minX = Math.max(
    0,
    Math.floor(Math.min(...vertices.map((point) => point.x))),
  );
  const maxX = Math.min(
    reader.width - 1,
    Math.ceil(Math.max(...vertices.map((point) => point.x))),
  );
  const minY = Math.max(
    0,
    Math.floor(Math.min(...vertices.map((point) => point.y))),
  );
  const maxY = Math.min(
    reader.height - 1,
    Math.ceil(Math.max(...vertices.map((point) => point.y))),
  );
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon({ x, y }, vertices)) pixels.push({ x, y });
    }
  }
  const bounds = boundsForPixels(pixels);
  return bounds === undefined ? { pixels } : { pixels, bounds };
}

function pointInPolygon(
  point: PixelPoint,
  vertices: readonly PixelPoint[],
): boolean {
  let inside = false;
  for (
    let index = 0, previous = vertices.length - 1;
    index < vertices.length;
    previous = index, index += 1
  ) {
    const current = vertices[index];
    const prior = vertices[previous];
    if (current === undefined || prior === undefined) continue;
    const intersects = ((current.y > point.y) !== (prior.y > point.y)) &&
      point.x <
        ((prior.x - current.x) * (point.y - current.y)) /
              (prior.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function boundsForPixels(
  pixels: readonly PixelPoint[],
): SelectionPixels["bounds"] {
  if (pixels.length === 0) return undefined;
  const minX = Math.min(...pixels.map((point) => point.x));
  const minY = Math.min(...pixels.map((point) => point.y));
  const maxX = Math.max(...pixels.map((point) => point.x));
  const maxY = Math.max(...pixels.map((point) => point.y));
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function nearestBrushCursor(
  point: PixelPoint,
  options: Partial<ToolOptions>,
  bounds: RasterBounds,
): readonly PixelPoint[] {
  return stampBrush([point], { ...options, pattern: "solid" }, bounds);
}
