import {
  interpolateBrushLine,
  normalizeBrushDescriptor,
  stampBrushPoints,
} from "./draw2-brush.ts";
import type {
  BrushAlgorithm,
  BrushPattern,
  BrushShape,
} from "./draw2-brush.ts";

export type ShapeTool =
  | "line"
  | "rect"
  | "rect-fill"
  | "ellipse"
  | "ellipse-fill"
  | "circle"
  | "circle-fill";

export type ShapeBrushShape = BrushShape;
export type ShapeBrushPattern = BrushPattern;

export interface ShapeToolOptions {
  readonly brushSize: number;
  readonly brushShape: ShapeBrushShape;
  readonly brushAngle: number;
  readonly brushAlgorithm: BrushAlgorithm;
  readonly pattern: ShapeBrushPattern;
}

export interface ShapePoint {
  readonly x: number;
  readonly y: number;
}

export interface ShapeBounds {
  readonly width: number;
  readonly height: number;
}

export interface ShapeWrite extends ShapePoint {
  readonly colorIndex: number;
}

/** Maximum number of expanded pixels produced by one bounded stroke. */
export const MAX_STAMPED_STROKE_PIXELS = 1_048_576;

interface DragRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function clampPoint(point: ShapePoint, bounds: ShapeBounds): ShapePoint {
  return {
    x: Math.max(0, Math.min(bounds.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(bounds.height - 1, Math.round(point.y))),
  };
}

function normalizeBounds(
  from: ShapePoint,
  to: ShapePoint,
  bounds: ShapeBounds,
): DragRect {
  const a = clampPoint(from, bounds);
  const b = clampPoint(to, bounds);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(1, Math.abs(a.x - b.x) + 1),
    height: Math.max(1, Math.abs(a.y - b.y) + 1),
  };
}

function pointKey(point: ShapePoint): string {
  return `${point.x}:${point.y}`;
}

function sortedUnique(
  points: readonly ShapePoint[],
  bounds: ShapeBounds,
): ShapePoint[] {
  const unique = new Map<string, ShapePoint>();
  for (const point of points) {
    const clamped = clampPoint(point, bounds);
    unique.set(pointKey(clamped), clamped);
  }
  return [...unique.values()].sort((left, right) =>
    left.y - right.y || left.x - right.x
  );
}

function patternVisible(
  x: number,
  y: number,
  pattern: ShapeBrushPattern,
): boolean {
  if (pattern === "checker") return (x + y) % 2 === 0;
  if (pattern === "dots") return x % 2 === 0 && y % 2 === 0;
  if (pattern === "bayer-2x2") return ((x & 1) + ((y & 1) * 2)) !== 3;
  return true;
}

function stampBrush(
  points: readonly ShapePoint[],
  options: ShapeToolOptions,
  bounds: ShapeBounds,
): ShapePoint[] {
  const stamped = stampBrushPoints(points, options, bounds);
  if (stamped.length > MAX_STAMPED_STROKE_PIXELS) {
    throw new Error("Expanded Stroke exceeds the bounded pixel budget.");
  }
  return [...stamped];
}

function rectanglePixels(rect: DragRect, filled: boolean): ShapePoint[] {
  const points: ShapePoint[] = [];
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

function insetBounds(rect: DragRect, inset: number): DragRect | undefined {
  const width = rect.width - inset * 2;
  const height = rect.height - inset * 2;
  if (width < 1 || height < 1) return undefined;
  return { x: rect.x + inset, y: rect.y + inset, width, height };
}

function circleRectForBounds(rect: DragRect): DragRect {
  const side = Math.min(rect.width, rect.height);
  return {
    x: rect.x + Math.floor((rect.width - side) / 2),
    y: rect.y + Math.floor((rect.height - side) / 2),
    width: side,
    height: side,
  };
}

function shapeGeometryBounds(tool: ShapeTool, rect: DragRect): DragRect {
  return tool === "circle" || tool === "circle-fill"
    ? circleRectForBounds(rect)
    : rect;
}

function subtractPixels(
  outer: readonly ShapePoint[],
  inner: readonly ShapePoint[],
  bounds: ShapeBounds,
): ShapePoint[] {
  const innerKeys = new Set(inner.map(pointKey));
  return sortedUnique(
    outer.filter((point) => !innerKeys.has(pointKey(point))),
    bounds,
  );
}

function ellipsePixels(rect: DragRect, filled: boolean): ShapePoint[] {
  const points: ShapePoint[] = [];
  const minX = rect.x;
  const maxX = rect.x + rect.width - 1;
  const minY = rect.y;
  const maxY = rect.y + rect.height - 1;
  if (maxX < minX || maxY < minY) return points;
  if (minX === maxX || minY === maxY) {
    if (filled) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) points.push({ x, y });
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

function shapePixels(
  tool: ShapeTool,
  from: ShapePoint,
  to: ShapePoint,
  bounds: ShapeBounds,
  algorithm: BrushAlgorithm = "regular",
): ShapePoint[] {
  const rect = normalizeBounds(from, to, bounds);
  if (tool === "line") {
    return sortedUnique(
      interpolateBrushLine(
        clampPoint(from, bounds),
        clampPoint(to, bounds),
        algorithm,
      ),
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
  const circleRect = circleRectForBounds(rect);
  return sortedUnique(
    ellipsePixels(circleRect, tool === "circle-fill"),
    bounds,
  );
}

function shapeStrokePixels(
  tool: "rect" | "ellipse" | "circle",
  from: ShapePoint,
  to: ShapePoint,
  brushSize: number,
  bounds: ShapeBounds,
): ShapePoint[] {
  const dragRect = normalizeBounds(from, to, bounds);
  const geometryRect = shapeGeometryBounds(tool, dragRect);
  if (brushSize <= 1) return shapePixels(tool, from, to, bounds);

  const outer = tool === "rect"
    ? rectanglePixels(geometryRect, true)
    : ellipsePixels(geometryRect, true);
  const innerRect = insetBounds(geometryRect, brushSize);
  if (innerRect === undefined) return sortedUnique(outer, bounds);
  const inner = tool === "rect"
    ? rectanglePixels(innerRect, true)
    : ellipsePixels(innerRect, true);
  return subtractPixels(outer, inner, bounds);
}

function isFilledShape(tool: ShapeTool): boolean {
  return tool === "rect-fill" || tool === "ellipse-fill" ||
    tool === "circle-fill";
}

function isOutlineShape(
  tool: ShapeTool,
): tool is "rect" | "ellipse" | "circle" {
  return tool === "rect" || tool === "ellipse" || tool === "circle";
}

function normalizeOptions(options: ShapeToolOptions): ShapeToolOptions {
  const brush = normalizeBrushDescriptor(options);
  return {
    brushSize: brush.brushSize,
    brushShape: brush.brushShape,
    brushAngle: brush.brushAngle,
    brushAlgorithm: brush.brushAlgorithm,
    pattern: brush.pattern,
  };
}

export function shapePixelsInBounds(
  tool: ShapeTool,
  from: ShapePoint,
  to: ShapePoint,
  bounds: ShapeBounds,
): ShapePoint[] {
  return shapePixels(tool, from, to, {
    width: Math.max(1, Math.floor(bounds.width)),
    height: Math.max(1, Math.floor(bounds.height)),
  });
}

export function stampShapeBrushInBounds(
  points: readonly ShapePoint[],
  options: ShapeToolOptions,
  bounds: ShapeBounds,
): ShapePoint[] {
  const safeBounds = {
    width: Math.max(1, Math.floor(bounds.width)),
    height: Math.max(1, Math.floor(bounds.height)),
  };
  return stampBrush(points, normalizeOptions(options), safeBounds);
}

export function createShapeWriteSet(
  tool: ShapeTool,
  from: ShapePoint,
  to: ShapePoint,
  colorIndex: number,
  options: ShapeToolOptions,
  bounds: ShapeBounds,
): ShapeWrite[] {
  const safeBounds = {
    width: Math.max(1, Math.floor(bounds.width)),
    height: Math.max(1, Math.floor(bounds.height)),
  };
  const safeOptions = normalizeOptions(options);
  const rect = normalizeBounds(from, to, safeBounds);
  let points: ShapePoint[];
  if (tool === "line") {
    points = stampBrush(
      shapePixels(tool, from, to, safeBounds, safeOptions.brushAlgorithm),
      safeOptions,
      safeBounds,
    );
  } else if (rect.width === 1 && rect.height === 1) {
    points = stampBrush(
      [clampPoint(from, safeBounds)],
      safeOptions,
      safeBounds,
    );
  } else if (isFilledShape(tool)) {
    points = shapePixels(tool, from, to, safeBounds).filter((point) =>
      patternVisible(point.x, point.y, safeOptions.pattern)
    );
  } else if (isOutlineShape(tool)) {
    points = shapeStrokePixels(
      tool,
      from,
      to,
      safeOptions.brushSize,
      safeBounds,
    ).filter((point) => patternVisible(point.x, point.y, safeOptions.pattern));
  } else {
    points = [];
  }

  return sortedUnique(points, safeBounds).map((point) => ({
    ...point,
    colorIndex: Math.max(0, Math.floor(colorIndex)),
  }));
}
