import { outputDimensionGuidance } from './output-dimension-guidance.mjs?rev=20261104-output-controller-1';

/** Validate requested output geometry before any encoder or raster allocation. */
export function validateOutputDimensions({
  width,
  height,
  format,
  frameCount = 1,
  requiresIntegerEnlargement = false,
  originalSize = null,
  isIntegerEnlargement = null,
  maxEdge = 4096,
  maxPixels = 16 * 1024 * 1024,
}) {
  const outputWidth = Number(width), outputHeight = Number(height);
  if (!Number.isSafeInteger(outputWidth) || !Number.isSafeInteger(outputHeight)
      || outputWidth < 1 || outputHeight < 1
      || outputWidth > maxEdge || outputHeight > maxEdge
      || outputWidth * outputHeight > maxPixels) {
    throw new RangeError('出力サイズが上限を超えています。幅と高さを小さくしてください。');
  }
  const issue = outputDimensionGuidance({ format, width: outputWidth, height: outputHeight, frameCount });
  if (issue) throw new RangeError(issue.message);
  if (requiresIntegerEnlargement && (typeof isIntegerEnlargement !== 'function' || !isIntegerEnlargement(
    outputWidth, outputHeight, originalSize?.width, originalSize?.height,
  ))) {
    throw new RangeError('ドット絵の拡大は、縦横とも同じ整数倍にしてください。');
  }
  return { width: outputWidth, height: outputHeight };
}
