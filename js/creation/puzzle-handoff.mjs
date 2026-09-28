import { preparePuzzleUpload } from './puzzle-upload.mjs';

export const PUZZLE_HANDOFF_KEY = 'PiXiEED:puzzle-handoff:v1';
export const PUZZLE_HANDOFF_META_KEY = 'PiXiEED:puzzle-handoff-meta:v1';
export const PUZZLE_HANDOFF_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_SERIALIZED = 3 * 1024 * 1024;

export async function createPuzzleHandoff(options, now = Date.now()) {
  const payload = await preparePuzzleUpload(options);
  const mode = options.mode;
  return { version: 1, mode, createdAt: now, expiresAt: now + PUZZLE_HANDOFF_MAX_AGE_MS, payload };
}

export function encodePuzzleHandoff(handoff) {
  if (!handoff || handoff.version !== 1 || !['spot_difference', 'hidden_object'].includes(handoff.mode) || !Number.isSafeInteger(handoff.createdAt) || !Number.isSafeInteger(handoff.expiresAt) || handoff.expiresAt <= handoff.createdAt || !handoff.payload?.image?.base64 || !handoff.payload?.puzzle) throw new TypeError('パズル投稿データが不正です');
  const value = JSON.stringify(handoff);
  if (value.length > MAX_SERIALIZED) throw new RangeError('投稿データが大きすぎます。画像サイズを小さくしてください');
  return value;
}

export function decodePuzzleHandoff(serialized, now = Date.now()) {
  try {
    if (typeof serialized !== 'string' || serialized.length > MAX_SERIALIZED) return null;
    const value = JSON.parse(serialized);
    if (value?.version !== 1 || !['spot_difference', 'hidden_object'].includes(value.mode) || !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.expiresAt) || value.createdAt > now || value.expiresAt <= now || value.expiresAt - value.createdAt > PUZZLE_HANDOFF_MAX_AGE_MS || !value.payload?.image?.base64 || value.payload.puzzle?.mode !== value.mode) return null;
    return value;
  } catch { return null; }
}

export function openPuzzleHandoff({ mode, draftId, store, adapter, windowRef = globalThis.window, now = Date.now() }) {
  return createPuzzleHandoff({ mode, draftId, store, adapter }, now).then((handoff) => {
    const serialized = encodePuzzleHandoff(handoff);
    windowRef.sessionStorage.setItem(PUZZLE_HANDOFF_KEY, serialized);
    const page = windowRef.parent && windowRef.parent !== windowRef ? windowRef.parent : windowRef;
    const url = new URL(page.location.href);
    url.pathname = '/globe/';
    url.search = '';
    url.searchParams.set('from', mode === 'spot_difference' ? 'spot-difference' : 'hidden-object');
    page.location.assign(`${url.pathname}${url.search}${url.hash}`);
    return true;
  });
}
