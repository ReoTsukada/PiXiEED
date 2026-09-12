/** Pure, indexed-pixel helpers used by iDRAW's non-destructive tool systems. */

import {
  createStrokeAutoOutlineWriteSet,
  type OutlineConnectivity,
  type OutlinePlacement,
  type OutlinePixelReader,
  type OutlineWrite,
  type StrokeAutoOutlineOptions,
} from "./draw2-outline-tools.ts";

export type PixelEffectWrite = OutlineWrite;

export interface PixelEffectReader extends OutlinePixelReader {}

export type ShadingLightDirection =
  | "TOP_LEFT"
  | "TOP_RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM_RIGHT";

export interface AutomaticShadingOptions {
  readonly highlightColorIndex: number;
  readonly shadowColorIndex: number;
  readonly lightDirection: ShadingLightDirection;
  readonly thickness?: number;
  readonly allowedPixels?: ReadonlySet<string>;
}

export interface ColorReplaceOptions {
  readonly fromColorIndex: number;
  readonly toColorIndex: number;
  readonly includeTransparent?: boolean;
  readonly allowedPixels?: ReadonlySet<string>;
}

export interface PixelPreview {
  readonly width: number;
  readonly height: number;
  readonly palette: readonly number[];
  readonly writes: readonly PixelEffectWrite[];
  getPixel(x: number, y: number): number;
}

export interface SeamlessPreviewOptions {
  readonly horizontalRepeats?: number;
  readonly verticalRepeats?: number;
}

export interface FrameEffectTarget {
  readonly frameId: string;
  readonly reader: PixelEffectReader;
}

export interface FrameEffectPlan {
  readonly frameId: string;
  readonly writes: readonly PixelEffectWrite[];
}

function pointKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function isOpaque(color: number): boolean {
  return ((color >>> 24) & 0xff) > 0;
}

function isValidColorIndex(reader: PixelEffectReader, value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value < reader.palette.length;
}

function directionVector(direction: ShadingLightDirection): {
  readonly x: number;
  readonly y: number;
} {
  switch (direction) {
    case "TOP_RIGHT":
      return { x: 1, y: -1 };
    case "BOTTOM_LEFT":
      return { x: -1, y: 1 };
    case "BOTTOM_RIGHT":
      return { x: 1, y: 1 };
    case "TOP_LEFT":
    default:
      return { x: -1, y: -1 };
  }
}

function transparentAt(
  reader: PixelEffectReader,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= reader.width || y >= reader.height) return true;
  return !isOpaque(reader.palette[reader.getPixel(x, y)] ?? 0);
}

/** Returns only writes that land on already visible pixels. */
export function createAlphaLockedWriteSet(
  reader: PixelEffectReader,
  writes: readonly PixelEffectWrite[],
): readonly PixelEffectWrite[] {
  return writes.filter((write) => {
    if (
      write.x < 0 || write.y < 0 || write.x >= reader.width ||
      write.y >= reader.height
    ) return false;
    return isOpaque(reader.palette[reader.getPixel(write.x, write.y)] ?? 0);
  });
}

/** Creates an exact indexed-color replacement without touching transparency. */
export function createColorReplaceWriteSet(
  reader: PixelEffectReader,
  options: ColorReplaceOptions,
): readonly PixelEffectWrite[] {
  if (
    !Number.isSafeInteger(options.fromColorIndex) ||
    options.fromColorIndex < 0 || options.fromColorIndex >= reader.palette.length ||
    !isValidColorIndex(reader, options.toColorIndex) ||
    options.fromColorIndex === options.toColorIndex
  ) return [];
  const writes: PixelEffectWrite[] = [];
  for (let y = 0; y < reader.height; y += 1) {
    for (let x = 0; x < reader.width; x += 1) {
      if (
        options.allowedPixels !== undefined &&
        !options.allowedPixels.has(pointKey(x, y))
      ) continue;
      if (reader.getPixel(x, y) !== options.fromColorIndex) continue;
      if (
        options.includeTransparent !== true &&
        !isOpaque(reader.palette[options.fromColorIndex] ?? 0)
      ) continue;
      writes.push({ x, y, colorIndex: options.toColorIndex });
    }
  }
  return writes;
}

/**
 * Plans a compact two-tone shade pass.  Pixels next to transparency on the
 * light-facing side receive the highlight; pixels on the opposite side
 * receive the shadow.  It only changes existing opaque pixels.
 */
export function createAutomaticShadingWriteSet(
  reader: PixelEffectReader,
  options: AutomaticShadingOptions,
): readonly PixelEffectWrite[] {
  if (
    !isValidColorIndex(reader, options.highlightColorIndex) ||
    !isValidColorIndex(reader, options.shadowColorIndex) ||
    options.highlightColorIndex === options.shadowColorIndex
  ) return [];
  const thickness = Math.max(1, Math.min(16, Math.round(options.thickness ?? 1)));
  const light = directionVector(options.lightDirection);
  const writes: PixelEffectWrite[] = [];
  for (let y = 0; y < reader.height; y += 1) {
    for (let x = 0; x < reader.width; x += 1) {
      if (
        options.allowedPixels !== undefined &&
        !options.allowedPixels.has(pointKey(x, y))
      ) continue;
      const current = reader.getPixel(x, y);
      if (!isOpaque(reader.palette[current] ?? 0)) continue;
      let highlight = false;
      let shadow = false;
      for (let distance = 1; distance <= thickness; distance += 1) {
        if (transparentAt(reader, x + light.x * distance, y + light.y * distance)) {
          highlight = true;
        }
        if (transparentAt(reader, x - light.x * distance, y - light.y * distance)) {
          shadow = true;
        }
      }
      const next = highlight
        ? options.highlightColorIndex
        : shadow
        ? options.shadowColorIndex
        : current;
      if (next !== current) writes.push({ x, y, colorIndex: next });
    }
  }
  return writes;
}

/** Creates a projection reader without mutating the canonical reader. */
export function createPixelPreview(
  reader: PixelEffectReader,
  writes: readonly PixelEffectWrite[],
): PixelPreview {
  const map = new Map<string, number>();
  for (const write of writes) {
    if (
      write.x >= 0 && write.y >= 0 && write.x < reader.width &&
      write.y < reader.height
    ) map.set(pointKey(write.x, write.y), write.colorIndex);
  }
  const normalized = [...map.entries()].map(([key, colorIndex]) => {
    const [xText, yText] = key.split(":");
    return { x: Number(xText), y: Number(yText), colorIndex };
  });
  return {
    width: reader.width,
    height: reader.height,
    palette: reader.palette,
    writes: normalized,
    getPixel(x, y) {
      return map.get(pointKey(x, y)) ?? reader.getPixel(x, y);
    },
  };
}

/** Repeats a transient projection around the source canvas for tile preview. */
export function createSeamlessPreviewWrites(
  reader: Pick<PixelEffectReader, "width" | "height">,
  writes: readonly PixelEffectWrite[],
  options: SeamlessPreviewOptions = {},
): readonly PixelEffectWrite[] {
  const horizontalRepeats = Math.max(
    0,
    Math.min(4, Math.round(options.horizontalRepeats ?? 1)),
  );
  const verticalRepeats = Math.max(
    0,
    Math.min(4, Math.round(options.verticalRepeats ?? 1)),
  );
  const output: PixelEffectWrite[] = [];
  for (const write of writes) {
    if (
      write.x < 0 || write.y < 0 || write.x >= reader.width ||
      write.y >= reader.height
    ) continue;
    for (let repeatY = -verticalRepeats; repeatY <= verticalRepeats; repeatY += 1) {
      for (let repeatX = -horizontalRepeats; repeatX <= horizontalRepeats; repeatX += 1) {
        output.push({
          x: write.x + repeatX * reader.width,
          y: write.y + repeatY * reader.height,
          colorIndex: write.colorIndex,
        });
      }
    }
  }
  return output;
}

/** Wraps edge writes to the opposite edge for an actual seamless commit. */
export function createSeamlessWrapWriteSet(
  reader: Pick<PixelEffectReader, "width" | "height">,
  writes: readonly PixelEffectWrite[],
): readonly PixelEffectWrite[] {
  const output = new Map<string, PixelEffectWrite>();
  for (const write of writes) {
    if (
      write.x < 0 || write.y < 0 || write.x >= reader.width ||
      write.y >= reader.height
    ) continue;
    const xValues = write.x === 0 && reader.width > 1
      ? [0, reader.width - 1]
      : write.x === reader.width - 1 && reader.width > 1
      ? [reader.width - 1, 0]
      : [write.x];
    const yValues = write.y === 0 && reader.height > 1
      ? [0, reader.height - 1]
      : write.y === reader.height - 1 && reader.height > 1
      ? [reader.height - 1, 0]
      : [write.y];
    for (const y of yValues) {
      for (const x of xValues) {
        output.set(pointKey(x, y), { x, y, colorIndex: write.colorIndex });
      }
    }
  }
  return [...output.values()];
}

/**
 * Runs one deterministic effect planner for each frame without mutating any
 * reader.  The UI can later turn this plan into one queued batch operation.
 */
export function createFrameEffectPlan(
  targets: readonly FrameEffectTarget[],
  planner: (
    reader: PixelEffectReader,
    frameId: string,
  ) => readonly PixelEffectWrite[],
): readonly FrameEffectPlan[] {
  return targets.map((target) => ({
    frameId: target.frameId,
    writes: planner(target.reader, target.frameId),
  }));
}

export type {
  OutlineConnectivity,
  OutlinePlacement,
  OutlinePixelReader,
  OutlineWrite,
  StrokeAutoOutlineOptions,
};
export { createStrokeAutoOutlineWriteSet };
