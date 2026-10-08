import { encodeGif, GIF_LONG_EDGE } from './pixel-lens/gif.mjs?v=20261008-output-progress-1';

export const ANIMATED_MAX_INPUT_PIXELS = 8e6;
export const ANIMATED_MAX_FALLBACK_OUTPUT_PIXELS = 8e6;

// Bound retained RGBA frames separately from the scaled GIF work. Enlargement is still integer-only.
export function animatedGeometry(width, height, count, {
  longEdge = GIF_LONG_EDGE,
  maxPixels = 80e6,
  maxInputPixels = ANIMATED_MAX_INPUT_PIXELS
} = {}) {
  for (const n of [width, height, count]) if (!Number.isSafeInteger(n) || n < 1) throw new RangeError('invalid GIF dimensions');
  if (width > 4096 || height > 4096 || count > 600 || !Number.isFinite(longEdge) || longEdge < 1
      || !Number.isFinite(maxPixels) || maxPixels < 1 || !Number.isFinite(maxInputPixels) || maxInputPixels < 1) throw new RangeError('GIF limit exceeded');
  const pixels = width * height * count;
  if (pixels > maxInputPixels) throw new RangeError('GIFの撮影データが大きすぎます。短く撮るか、画面サイズを下げてください。');
  const scale = Math.max(1, Math.min(Math.floor(longEdge / Math.max(width, height)), Math.floor(Math.sqrt(maxPixels / pixels)), Math.floor(65535 / Math.max(width, height))));
  return { width: width * scale, height: height * scale, scale };
}

/** Keep the requested frame cadence and reduce only the GIF copy by an integer sampling step. */
export function animatedCapturePlan(width, height, { maxMs, fps, maxPixels = ANIMATED_MAX_INPUT_PIXELS } = {}) {
  for (const n of [width, height, maxMs, fps, maxPixels]) if (!Number.isSafeInteger(n) || n < 1) throw new RangeError('invalid GIF capture plan');
  if (width > 4096 || height > 4096 || !Number.isSafeInteger(maxMs * fps)) throw new RangeError('GIF capture plan exceeds its limit');
  const maxFrames = Math.ceil(maxMs * fps / 1000) + 1;
  if (maxFrames > 600) throw new RangeError('GIF capture plan exceeds its frame limit');
  let divisor = 1;
  let frameWidth = width;
  let frameHeight = height;
  while (frameWidth * frameHeight * maxFrames > maxPixels) {
    divisor += 1;
    frameWidth = Math.ceil(width / divisor);
    frameHeight = Math.ceil(height / divisor);
    if (divisor > Math.max(width, height)) throw new RangeError('GIFの撮影データが大きすぎます。');
  }
  return Object.freeze({ width: frameWidth, height: frameHeight, divisor, maxFrames, maxPixels: frameWidth * frameHeight * maxFrames });
}

/** Return a new, GIF-only frame when reducing; the camera's source buffer is never changed. */
export function downsampleAnimatedFrame(frame, plan) {
  if (!frame || !plan || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)
      || frame.width < 1 || frame.height < 1 || !ArrayBuffer.isView(frame.data)
      || frame.data.BYTES_PER_ELEMENT !== 1 || frame.data.length !== frame.width * frame.height * 4
      || !Number.isSafeInteger(plan.divisor) || plan.divisor < 1
      || plan.width !== Math.ceil(frame.width / plan.divisor) || plan.height !== Math.ceil(frame.height / plan.divisor)) throw new RangeError('invalid GIF frame');
  if (plan.divisor === 1) return { width: frame.width, height: frame.height, data: frame.data };
  const data = new Uint8ClampedArray(plan.width * plan.height * 4);
  for (let y = 0; y < plan.height; y += 1) for (let x = 0; x < plan.width; x += 1) {
    const sourceX = Math.min(frame.width - 1, x * plan.divisor + Math.floor(plan.divisor / 2));
    const sourceY = Math.min(frame.height - 1, y * plan.divisor + Math.floor(plan.divisor / 2));
    const from = (sourceY * frame.width + sourceX) * 4;
    data.set(frame.data.subarray(from, from + 4), (y * plan.width + x) * 4);
  }
  return { width: plan.width, height: plan.height, data };
}

const abortError = () => new DOMException('保存を中止しました。', 'AbortError');

/** Frames are borrowed, never detached. A worker keeps GIF compression away from touch/preview rendering. */
export async function encodeAnimatedGif(frames, {
  signal,
  delayMs = 100,
  longEdge = GIF_LONG_EDGE,
  maxPixels = 80e6,
  maxInputPixels = ANIMATED_MAX_INPUT_PIXELS,
  workerFactory,
  onProgress = () => {}
} = {}) {
  if (signal?.aborted) throw abortError();
  if (!Array.isArray(frames) || !frames.length) throw new RangeError('no frames');
  const { width, height } = frames[0];
  const geometry = animatedGeometry(width, height, frames.length, { longEdge, maxPixels, maxInputPixels });
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height || !ArrayBuffer.isView(frame.data) || frame.data.BYTES_PER_ELEMENT !== 1 || frame.data.length !== width * height * 4) throw new RangeError('invalid GIF frame');
  }
  if (!Number.isFinite(delayMs) || delayMs < 20 || delayMs > 655350) throw new RangeError('invalid GIF delay');
  for (const frame of frames) {
    const frameDelay = frame.delayMs === undefined ? delayMs : frame.delayMs;
    if (!Number.isFinite(frameDelay) || frameDelay < 20 || frameDelay > 655350) throw new RangeError('invalid GIF frame delay');
  }
  let worker;
  try {
    worker = workerFactory ? workerFactory() : typeof Worker === 'function' ? new Worker(new URL('./gif-export-worker.mjs?v=20261008-output-progress-1', import.meta.url), { type: 'module' }) : null;
  } catch { /* A small bounded export is still available when workers are blocked. */ }
  if (!worker) {
    const small = animatedGeometry(width, height, frames.length, {
      longEdge,
      maxPixels: Math.min(maxPixels, ANIMATED_MAX_FALLBACK_OUTPUT_PIXELS),
      maxInputPixels
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) throw abortError();
    return { ...small, bytes: encodeGif(frames, { delayMs, scale: small.scale, onProgress }) };
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, bytes) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error); else resolve({ ...geometry, bytes });
    };
    const abort = () => finish(abortError());
    const timer = setTimeout(() => finish(new Error('GIFの保存に時間がかかりすぎました。')), 120000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data?.error) finish(new Error(data.error));
      else if (Number.isFinite(data?.progress)) { try { onProgress(Math.max(0, Math.min(1, data.progress))); } catch { /* progress cannot affect GIF output */ } }
      else if (data?.bytes instanceof Uint8Array && data.bytes.length) finish(null, data.bytes);
      else finish(new Error('GIFの保存結果を読み込めませんでした。'));
    };
    worker.onerror = () => finish(new Error('GIFを作成できませんでした。'));
    if (signal?.aborted) { abort(); return; }
    try { worker.postMessage({ frames, delayMs, scale: geometry.scale }); }
    catch (error) { finish(error); }
  });
}
