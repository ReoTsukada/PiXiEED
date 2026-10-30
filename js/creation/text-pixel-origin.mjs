import { inferIntegerPixelScale, resizeRgbaNearest } from './output-render.mjs?rev=20261009-output-origin-restore-3';

/** Collapse only exact RGBA blocks. The source frame and source file are never mutated.
 * This proves a reversible grid, not the artist's original working dimensions.
 */
export async function textPixelOrigin(frame, { signal = null, maxPixels = 8_000_000 } = {}) {
  const detection = await inferIntegerPixelScale([frame], { signal, maxPixels });
  if (signal?.aborted) throw new DOMException('中止', 'AbortError');
  if (detection.status !== 'detected' || detection.scale < 2) return { frame, detection };
  // A solid field or one-dimensional stripe is not enough evidence of authored pixel size.
  if (detection.width < 2 || detection.height < 2) return { frame, detection: { ...detection, status: 'candidate', reason: 'ambiguous-grid' } };
  const native = resizeRgbaNearest(frame, detection.width, detection.height);
  return { frame: { ...frame, ...native }, detection };
}
