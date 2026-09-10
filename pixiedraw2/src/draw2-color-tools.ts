/**
 * Deterministic indexed-colour helpers for iDRAW's palette and colour graph.
 *
 * This module intentionally has no DOM or Canvas dependency.  UI code can
 * preview a ramp freely and commit it through the normal palette command.
 */

export type ColorRampSpace = "RGB" | "HSV";
export type ColorRampHueMode = "SHORT" | "LONG";

export interface ArgbChannels {
  readonly alpha: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export function decodeArgbColor(value: number): ArgbChannels {
  const safe = Number.isSafeInteger(value) ? value >>> 0 : 0;
  return {
    alpha: (safe >>> 24) & 0xff,
    red: (safe >>> 16) & 0xff,
    green: (safe >>> 8) & 0xff,
    blue: safe & 0xff,
  };
}

export function encodeArgbColor(channels: ArgbChannels): number {
  const clamp = (value: number): number =>
    Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
  return ((clamp(channels.alpha) << 24) |
    (clamp(channels.red) << 16) |
    (clamp(channels.green) << 8) |
    clamp(channels.blue)) >>> 0;
}

interface HsvColor {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

function rgbToHsv(color: ArgbChannels): HsvColor {
  const red = color.red / 255;
  const green = color.green / 255;
  const blue = color.blue / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return {
    h: hue,
    s: maximum === 0 ? 0 : delta / maximum,
    v: maximum,
  };
}

function hsvToRgb(color: HsvColor): { red: number; green: number; blue: number } {
  const hue = ((color.h % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(1, color.s));
  const value = Math.max(0, Math.min(1, color.v));
  const chroma = value * saturation;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const match = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (sector < 1) [red, green, blue] = [chroma, second, 0];
  else if (sector < 2) [red, green, blue] = [second, chroma, 0];
  else if (sector < 3) [red, green, blue] = [0, chroma, second];
  else if (sector < 4) [red, green, blue] = [0, second, chroma];
  else if (sector < 5) [red, green, blue] = [second, 0, chroma];
  else [red, green, blue] = [chroma, 0, second];
  return {
    red: (red + match) * 255,
    green: (green + match) * 255,
    blue: (blue + match) * 255,
  };
}

function interpolateHue(start: number, end: number, progress: number, mode: ColorRampHueMode): number {
  let delta = ((end - start) % 360 + 360) % 360;
  if (mode === "SHORT" && delta > 180) delta -= 360;
  if (mode === "LONG" && delta < 180) delta -= 360;
  if (mode === "LONG" && Math.abs(delta) === 180) delta = 180;
  return start + delta * progress;
}

/**
 * Creates a palette ramp including both endpoints.  Existing endpoint colors
 * are harmless because the canonical palette append command deduplicates them.
 */
export function createArgbColorRamp(
  start: number,
  end: number,
  steps: number,
  space: ColorRampSpace = "HSV",
  hueMode: ColorRampHueMode = "SHORT",
): readonly number[] {
  const safeSteps = Math.max(2, Math.min(32, Math.round(Number.isFinite(steps) ? steps : 2)));
  const from = decodeArgbColor(start);
  const to = decodeArgbColor(end);
  const fromHsv = rgbToHsv(from);
  const toHsv = rgbToHsv(to);
  const ramp: number[] = [];
  for (let index = 0; index < safeSteps; index += 1) {
    const progress = index / (safeSteps - 1);
    if (space === "RGB") {
      ramp.push(encodeArgbColor({
        alpha: from.alpha + (to.alpha - from.alpha) * progress,
        red: from.red + (to.red - from.red) * progress,
        green: from.green + (to.green - from.green) * progress,
        blue: from.blue + (to.blue - from.blue) * progress,
      }));
      continue;
    }
    const rgb = hsvToRgb({
      h: interpolateHue(fromHsv.h, toHsv.h, progress, hueMode),
      s: fromHsv.s + (toHsv.s - fromHsv.s) * progress,
      v: fromHsv.v + (toHsv.v - fromHsv.v) * progress,
    });
    ramp.push(encodeArgbColor({
      alpha: from.alpha + (to.alpha - from.alpha) * progress,
      ...rgb,
    }));
  }
  return ramp;
}
