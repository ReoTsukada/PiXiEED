/** Resize one RGBA raster with nearest-neighbor sampling, leaving the source untouched. */
export function resizeRgbaNearest(frame, width, height, { maxPixels = 16_777_216, maxEdge = 8192 } = {}) {
  if (!frame || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)
      || frame.width < 1 || frame.height < 1 || !ArrayBuffer.isView(frame.data)
      || frame.data.BYTES_PER_ELEMENT !== 1 || frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError('画像データを確認できません。');
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
      || width > maxEdge || height > maxEdge || width * height > maxPixels) {
    throw new RangeError('出力サイズが上限を超えています。幅と高さを小さくしてください。');
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(frame.height - 1, Math.floor((y + 0.5) * frame.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(frame.width - 1, Math.floor((x + 0.5) * frame.width / width));
      const sourceOffset = (sourceY * frame.width + sourceX) * 4;
      data.set(frame.data.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

const MAX_INFERENCE_FRAMES = 600;
const DEFAULT_INFERENCE_PIXELS = 4_000_000;

/** Respect an explicit output-size choice made by the user over automatic pixel-origin selection. */
export function shouldAutoSelectPixelOrigin({ selection, needsAutoResize }) {
  return Boolean(needsAutoResize) && selection !== 'original';
}

function validFrame(frame) {
  return frame && Number.isSafeInteger(frame.width) && Number.isSafeInteger(frame.height)
    && frame.width > 0 && frame.height > 0 && frame.width <= 8192 && frame.height <= 8192
    && frame.width * frame.height <= 16_777_216 && ArrayBuffer.isView(frame.data)
    && frame.data.BYTES_PER_ELEMENT === 1 && frame.data.length === frame.width * frame.height * 4;
}

function checkSignal(signal) {
  if (signal?.aborted) throw new DOMException('画像サイズの確認を中止しました。', 'AbortError');
}

function yieldTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function gcd(left, right) {
  let a = left; let b = right;
  while (b) { const next = a % b; a = b; b = next; }
  return a;
}

async function largestExactGridScale(frame, signal, onProgress = () => {}, frameIndex = 0, frameCount = 1) {
  let scale = gcd(frame.width, frame.height);
  let rowsSinceYield = 0;
  for (let y = 0; y < frame.height; y += 1) {
    checkSignal(signal);
    const row = y * frame.width * 4;
    for (let x = 1; x < frame.width; x += 1) {
      const left = row + (x - 1) * 4; const right = row + x * 4;
      if (frame.data[left] !== frame.data[right] || frame.data[left + 1] !== frame.data[right + 1]
          || frame.data[left + 2] !== frame.data[right + 2] || frame.data[left + 3] !== frame.data[right + 3]) {
        scale = gcd(scale, x);
      }
      if (scale === 1) return 1;
    }
    if (y > 0) {
      const above = row - frame.width * 4;
      for (let x = 0; x < frame.width; x += 1) {
        const offset = row + x * 4; const previous = above + x * 4;
        if (frame.data[previous] !== frame.data[offset] || frame.data[previous + 1] !== frame.data[offset + 1]
            || frame.data[previous + 2] !== frame.data[offset + 2] || frame.data[previous + 3] !== frame.data[offset + 3]) {
          scale = gcd(scale, y);
        }
        if (scale === 1) return 1;
      }
    }
    rowsSinceYield += 1;
    if (rowsSinceYield >= 32 || y === frame.height - 1) {
      onProgress({ frameIndex, frameCount, rowsDone: y + 1, rowsTotal: frame.height });
      rowsSinceYield = 0;
      await yieldTask(); checkSignal(signal);
    }
  }
  return scale;
}

async function hasExactBlocks(frame, scale, signal) {
  let rowsSinceYield = 0;
  for (let y = 0; y < frame.height; y += scale) {
    checkSignal(signal);
    for (let x = 0; x < frame.width; x += scale) {
      const anchor = (y * frame.width + x) * 4;
      for (let dy = 0; dy < scale; dy += 1) {
        const row = ((y + dy) * frame.width + x) * 4;
        for (let dx = 0; dx < scale; dx += 1) {
          const offset = row + dx * 4;
          if (frame.data[offset] !== frame.data[anchor] || frame.data[offset + 1] !== frame.data[anchor + 1]
              || frame.data[offset + 2] !== frame.data[anchor + 2] || frame.data[offset + 3] !== frame.data[anchor + 3]) return false;
        }
      }
    }
    rowsSinceYield += scale;
    if (rowsSinceYield >= 64) { rowsSinceYield = 0; await yieldTask(); checkSignal(signal); }
  }
  return true;
}

/**
 * Conservatively detect a lossless integer enlargement in exact RGBA frames.
 * A pixel match is only mathematical evidence; it cannot establish authored intent.
 */
export async function inferIntegerPixelScale(frames, {
  maxPixels = DEFAULT_INFERENCE_PIXELS,
  signal = null,
  onProgress = () => {}
} = {}) {
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > MAX_INFERENCE_FRAMES
      || !Number.isSafeInteger(maxPixels) || maxPixels < 1 || typeof onProgress !== 'function') {
    return { status: 'skip', reason: 'invalid-input' };
  }
  const first = frames[0];
  if (!validFrame(first) || frames.some((frame) => !validFrame(frame)
      || frame.width !== first.width || frame.height !== first.height)) {
    return { status: 'skip', reason: 'invalid-frames' };
  }
  const sourcePixels = first.width * first.height * frames.length;
  if (sourcePixels > maxPixels) return { status: 'skip', reason: 'pixel-limit' };
  checkSignal(signal);
  let scale = gcd(first.width, first.height);
  for (let index = 0; index < frames.length; index += 1) {
    scale = gcd(scale, await largestExactGridScale(frames[index], signal, onProgress, index, frames.length));
    if (scale === 1) return { status: 'skip', reason: 'no-exact-scale' };
  }
  const result = { scale, width: first.width / scale, height: first.height / scale };
  return { status: 'detected', ...result, confidence: 'pixel-evidence' };
}

/** Verify a dimensions-and-scale claim against exact frame pixels. */
export async function verifyPixelScaleClaim(frames, claim, { maxPixels = DEFAULT_INFERENCE_PIXELS, signal = null } = {}) {
  const { width, height, scale } = claim || {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !Number.isSafeInteger(scale)
      || width < 1 || height < 1 || scale < 1 || scale > 8192) return { status: 'skip', reason: 'invalid-metadata' };
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > MAX_INFERENCE_FRAMES) return { status: 'skip', reason: 'invalid-frames' };
  const first = frames[0];
  if (!validFrame(first) || frames.some((frame) => !validFrame(frame)
      || frame.width !== first.width || frame.height !== first.height)) return { status: 'skip', reason: 'invalid-frames' };
  if (first.width !== width * scale || first.height !== height * scale) return { status: 'skip', reason: 'metadata-dimensions-mismatch' };
  if (first.width * first.height * frames.length > maxPixels) return { status: 'skip', reason: 'pixel-limit' };
  checkSignal(signal);
  for (const frame of frames) {
    if (!await hasExactBlocks(frame, scale, signal)) return { status: 'skip', reason: 'metadata-pixels-mismatch' };
  }
  return { status: 'verified', width, height, scale, source: 'metadata' };
}
