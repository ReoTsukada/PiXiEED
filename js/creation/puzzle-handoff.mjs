import { preparePuzzleUpload } from './puzzle-upload.mjs?rev=20261021-jigsaw-public-1';

export const PUZZLE_HANDOFF_KEY = 'PiXiEED:puzzle-handoff:v1';
export const PUZZLE_HANDOFF_META_KEY = 'PiXiEED:puzzle-handoff-meta:v1';
export const PUZZLE_HANDOFF_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_SERIALIZED = 3 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createPuzzleHandoff(options, now = Date.now()) {
  const payload = await preparePuzzleUpload(options);
  const mode = options.mode;
  const destination = options.destination ?? 'globe';
  if ((!['globe', 'feed'].includes(destination) || mode === 'jigsaw' && destination !== 'feed')) throw new TypeError('投稿先が不正です');
  const localDraftId = options.localDraftId;
  if (localDraftId !== undefined && (!UUID.test(String(localDraftId)) || localDraftId !== options.draftId)) throw new TypeError('ローカル下書きIDが不正です');
  return {
    version: 1, mode, destination, createdAt: now, expiresAt: now + PUZZLE_HANDOFF_MAX_AGE_MS, payload,
    ...(localDraftId ? { localDraftId } : {}),
    ...(destination === 'feed' ? { publicationIntent: 'public' } : {})
  };
}

export function encodePuzzleHandoff(handoff) {
  const destination = handoff?.destination ?? 'globe';
  if (!handoff || handoff.version !== 1 || !['spot_difference', 'hidden_object', 'jigsaw'].includes(handoff.mode) || !['globe', 'feed'].includes(destination)
      || handoff.mode === 'jigsaw' && destination !== 'feed'
      || handoff.localDraftId !== undefined && !UUID.test(String(handoff.localDraftId))
      || handoff.publicationIntent !== undefined && handoff.publicationIntent !== 'public'
      || handoff.publicationIntent === 'public' && destination !== 'feed'
      || !Number.isSafeInteger(handoff.createdAt) || !Number.isSafeInteger(handoff.expiresAt) || handoff.expiresAt <= handoff.createdAt || !handoff.payload?.image?.base64 || !handoff.payload?.puzzle) throw new TypeError('パズル投稿データが不正です');
  const value = JSON.stringify(handoff);
  if (value.length > MAX_SERIALIZED) throw new RangeError('投稿データが大きすぎます。画像サイズを小さくしてください');
  return value;
}

export function decodePuzzleHandoff(serialized, now = Date.now()) {
  try {
    if (typeof serialized !== 'string' || serialized.length > MAX_SERIALIZED) return null;
    const value = JSON.parse(serialized);
    const destination = value?.destination ?? 'globe';
    if (value?.version !== 1 || !['spot_difference', 'hidden_object', 'jigsaw'].includes(value.mode) || !['globe', 'feed'].includes(destination)
        || value.mode === 'jigsaw' && destination !== 'feed'
        || value.localDraftId !== undefined && !UUID.test(String(value.localDraftId))
        || value.publicationIntent !== undefined && value.publicationIntent !== 'public'
        || value.publicationIntent === 'public' && destination !== 'feed'
        || !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.expiresAt) || value.createdAt > now || value.expiresAt <= now || value.expiresAt - value.createdAt > PUZZLE_HANDOFF_MAX_AGE_MS || !value.payload?.image?.base64 || value.payload.puzzle?.mode !== value.mode) return null;
    return { ...value, destination };
  } catch { return null; }
}

export function openPuzzleHandoff({ mode, draftId, store, adapter, destination = 'globe', localDraftId, isCurrent = () => true, encodeImage, inspectImage, windowRef = globalThis.window, now = Date.now() }) {
  if (typeof isCurrent !== 'function') throw new TypeError('編集中データの確認が必要です');
  return createPuzzleHandoff({ mode, draftId, store, adapter, destination, localDraftId, encodeImage, inspectImage }, now).then((handoff) => {
    if (!isCurrent()) throw new Error('編集中の内容が変わったため、投稿先を開きませんでした。保存した下書きはそのままです。');
    const serialized = encodePuzzleHandoff(handoff);
    windowRef.sessionStorage.setItem(PUZZLE_HANDOFF_KEY, serialized);
    if (!isCurrent()) {
      try { if (windowRef.sessionStorage.getItem(PUZZLE_HANDOFF_KEY) === serialized) windowRef.sessionStorage.removeItem(PUZZLE_HANDOFF_KEY); } catch { /* Do not navigate with stale content. */ }
      throw new Error('編集中の内容が変わったため、投稿先を開きませんでした。保存した下書きはそのままです。');
    }
    const page = windowRef.parent && windowRef.parent !== windowRef ? windowRef.parent : windowRef;
    const url = new URL(page.location.href);
    if (destination === 'feed') {
      url.pathname = '/feed/';
      url.search = '';
      url.searchParams.set('compose', mode === 'jigsaw' ? 'jigsaw' : mode === 'spot_difference' ? 'spot-difference' : 'hidden-object');
    } else {
      url.pathname = '/globe/';
      url.search = '';
      url.searchParams.set('from', mode === 'jigsaw' ? 'jigsaw' : mode === 'spot_difference' ? 'spot-difference' : 'hidden-object');
    }
    page.location.assign(`${url.pathname}${url.search}${url.hash}`);
    return true;
  });
}
