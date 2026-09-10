/** DOM-free conversion from rasterized text masks to indexed pixel writes. */

export interface TextMask {
  readonly width: number;
  readonly height: number;
  readonly alpha: Uint8ClampedArray;
}

export interface TextMaskWriteOptions {
  readonly fillColorIndex: number;
  readonly strokeColorIndex?: number;
  readonly threshold?: number;
}

export interface TextPixelWrite {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
}

function alphaAt(mask: TextMask, x: number, y: number): number {
  return mask.alpha[y * mask.width + x] ?? 0;
}

/**
 * Converts separate fill and stroke alpha masks into one deterministic write
 * set.  Fill wins over stroke at overlapping pixels.
 */
export function createTextMaskWriteSet(
  fillMask: TextMask,
  strokeMask: TextMask | undefined,
  options: TextMaskWriteOptions,
): readonly TextPixelWrite[] {
  if (fillMask.width < 1 || fillMask.height < 1) return [];
  const threshold = Math.max(1, Math.min(255, Math.round(options.threshold ?? 160)));
  if (!Number.isSafeInteger(options.fillColorIndex) || options.fillColorIndex <= 0) return [];
  const writes = new Map<string, TextPixelWrite>();
  if (strokeMask !== undefined && Number.isSafeInteger(options.strokeColorIndex) && options.strokeColorIndex! > 0) {
    for (let y = 0; y < strokeMask.height; y += 1) {
      for (let x = 0; x < strokeMask.width; x += 1) {
        if (alphaAt(strokeMask, x, y) < threshold) continue;
        writes.set(`${x}:${y}`, { x, y, colorIndex: options.strokeColorIndex! });
      }
    }
  }
  for (let y = 0; y < fillMask.height; y += 1) {
    for (let x = 0; x < fillMask.width; x += 1) {
      if (alphaAt(fillMask, x, y) < threshold) continue;
      writes.set(`${x}:${y}`, { x, y, colorIndex: options.fillColorIndex });
    }
  }
  return [...writes.values()].sort((left, right) => left.y - right.y || left.x - right.x);
}
