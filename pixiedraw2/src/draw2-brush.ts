/**
 * Shared deterministic brush geometry for Draw2.
 *
 * Preview, local write-set planning, shape tools, and canonical EditorCore
 * commands all use this module.  The descriptor is intentionally additive:
 * old commands that only contain brushSize/brushShape/pattern resolve to the
 * same regular, zero-degree brush they used before.
 */

export type BrushShape = "square" | "circle";
export type BrushPattern = "solid" | "checker" | "dots" | "bayer-2x2";
export type BrushAlgorithm = "regular" | "pixel-perfect";

export interface BrushPoint {
  readonly x: number;
  readonly y: number;
}

export interface BrushBounds {
  readonly width: number;
  readonly height: number;
}

export interface BrushDescriptor {
  readonly brushSize: number;
  readonly brushShape: BrushShape;
  readonly brushAngle: number;
  readonly brushAlgorithm: BrushAlgorithm;
  readonly pattern: BrushPattern;
}

export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 64;

export const DEFAULT_BRUSH_DESCRIPTOR: BrushDescriptor = {
  brushSize: 1,
  brushShape: "square",
  brushAngle: 0,
  brushAlgorithm: "regular",
  pattern: "solid",
};

export function normalizeBrushDescriptor(
  options: Partial<BrushDescriptor> = {},
): BrushDescriptor {
  const requestedSize = options.brushSize;
  const requestedAngle = options.brushAngle;
  return {
    brushSize: Number.isSafeInteger(requestedSize)
      ? Math.max(
        MIN_BRUSH_SIZE,
        Math.min(MAX_BRUSH_SIZE, requestedSize as number),
      )
      : DEFAULT_BRUSH_DESCRIPTOR.brushSize,
    brushShape: options.brushShape === "circle" ? "circle" : "square",
    brushAngle: Number.isFinite(requestedAngle)
      ? Math.max(-180, Math.min(180, Math.round(requestedAngle as number)))
      : DEFAULT_BRUSH_DESCRIPTOR.brushAngle,
    brushAlgorithm: options.brushAlgorithm === "pixel-perfect"
      ? "pixel-perfect"
      : DEFAULT_BRUSH_DESCRIPTOR.brushAlgorithm,
    pattern: options.pattern === "checker" || options.pattern === "dots" ||
        options.pattern === "bayer-2x2"
      ? options.pattern
      : DEFAULT_BRUSH_DESCRIPTOR.pattern,
  };
}

function clampPoint(point: BrushPoint, bounds: BrushBounds): BrushPoint {
  return {
    x: Math.max(0, Math.min(bounds.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(bounds.height - 1, Math.round(point.y))),
  };
}

function pointKey(point: BrushPoint): string {
  return `${point.x}:${point.y}`;
}

function sortedUnique(
  points: readonly BrushPoint[],
  bounds: BrushBounds,
): readonly BrushPoint[] {
  const unique = new Map<string, BrushPoint>();
  for (const point of points) {
    if (
      point.x < 0 || point.y < 0 || point.x >= bounds.width ||
      point.y >= bounds.height
    ) continue;
    unique.set(pointKey(point), point);
  }
  return [...unique.values()].sort((left, right) =>
    left.y - right.y || left.x - right.x
  );
}

export function patternVisible(
  x: number,
  y: number,
  pattern: BrushPattern,
): boolean {
  if (pattern === "checker") return (x + y) % 2 === 0;
  if (pattern === "dots") return x % 2 === 0 && y % 2 === 0;
  if (pattern === "bayer-2x2") return ((x & 1) + ((y & 1) * 2)) !== 3;
  return true;
}

/**
 * The regular mode preserves Draw2's existing continuous Bresenham tie rule.
 * Pixel-perfect uses a major-axis accumulator matching Aseprite's predictable
 * perfect-line family, while remaining deterministic for all directions.
 */
export function interpolateBrushLine(
  from: BrushPoint,
  to: BrushPoint,
  algorithm: BrushAlgorithm = "regular",
): readonly BrushPoint[] {
  if (algorithm === "pixel-perfect") {
    return interpolatePixelPerfectLine(from, to);
  }
  const points: BrushPoint[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx - dy;
  while (true) {
    points.push({ x, y });
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
  }
  return points;
}

function interpolatePixelPerfectLine(
  from: BrushPoint,
  to: BrushPoint,
): readonly BrushPoint[] {
  if (from.x === to.x && from.y === to.y) return [{ ...from }];
  let x1 = from.x;
  let y1 = from.y;
  let x2 = to.x;
  let y2 = to.y;
  let yAxis = false;
  if (Math.abs(y2 - y1) > Math.abs(x2 - x1)) {
    [x1, y1] = [y1, x1];
    [x2, y2] = [y2, x2];
    yAxis = true;
  }
  const width = Math.abs(x2 - x1) + 1;
  const height = Math.abs(y2 - y1) + 1;
  const stepX = x1 < x2 ? 1 : -1;
  const stepY = y1 < y2 ? 1 : y1 > y2 ? -1 : 0;
  const endX = x2 + stepX;
  const points: BrushPoint[] = [];
  let error = 0;
  let y = y1;
  for (let x = x1; x !== endX; x += stepX) {
    points.push(yAxis ? { x: y, y: x } : { x, y });
    error += height;
    if (error >= width) {
      y += stepY;
      error -= width;
    }
  }
  return points;
}

function pushIfVisible(
  output: BrushPoint[],
  x: number,
  y: number,
  descriptor: BrushDescriptor,
): void {
  const point = { x, y };
  if (patternVisible(x, y, descriptor.pattern)) output.push(point);
}

function stampAxisAligned(
  center: BrushPoint,
  descriptor: BrushDescriptor,
  bounds: BrushBounds,
): readonly BrushPoint[] {
  const size = descriptor.brushSize;
  const start = -Math.floor(size / 2);
  const centerOffset = (size - 1) / 2;
  const radius = Math.max(0.5, size / 2);
  const points: BrushPoint[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = center.x + start + column;
      const y = center.y + start + row;
      if (
        descriptor.brushShape === "circle" &&
        ((column - centerOffset) ** 2) + ((row - centerOffset) ** 2) >
          radius ** 2
      ) continue;
      pushIfVisible(points, x, y, descriptor);
    }
  }
  return sortedUnique(points, bounds);
}

function stampRotatedSquare(
  center: BrushPoint,
  descriptor: BrushDescriptor,
  bounds: BrushBounds,
): readonly BrushPoint[] {
  if (descriptor.brushShape !== "square" || descriptor.brushAngle === 0) {
    return stampAxisAligned(center, descriptor, bounds);
  }
  const size = descriptor.brushSize;
  const half = size / 2;
  const radians = (descriptor.brushAngle * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const extent = Math.ceil(half * (Math.abs(cosine) + Math.abs(sine))) + 1;
  const parityOffset = size % 2 === 0 ? 0.5 : 0;
  const points: BrushPoint[] = [];
  for (let offsetY = -extent; offsetY <= extent; offsetY += 1) {
    for (let offsetX = -extent; offsetX <= extent; offsetX += 1) {
      const relativeX = offsetX + parityOffset;
      const relativeY = offsetY + parityOffset;
      const localX = relativeX * cosine + relativeY * sine;
      const localY = -relativeX * sine + relativeY * cosine;
      if (Math.abs(localX) > half || Math.abs(localY) > half) continue;
      const x = center.x + offsetX;
      const y = center.y + offsetY;
      pushIfVisible(points, x, y, descriptor);
    }
  }
  return sortedUnique(points, bounds);
}

export function stampBrushPoints(
  points: readonly BrushPoint[],
  options: Partial<BrushDescriptor>,
  bounds: BrushBounds,
): readonly BrushPoint[] {
  const descriptor = normalizeBrushDescriptor(options);
  const stamped = points.flatMap((point) =>
    stampRotatedSquare(clampPoint(point, bounds), descriptor, bounds)
  );
  return sortedUnique(stamped, bounds);
}
