import { decodePngHandoff, DRAW_HANDOFF_KEY } from '../creation/draw-handoff.mjs';
import { decodePuzzleHandoff, PUZZLE_HANDOFF_KEY, PUZZLE_HANDOFF_META_KEY } from '../creation/puzzle-handoff.mjs';

export const CAMERA_HANDOFF_KEY = 'PiXiEED:camera-handoff:v1';

export function handoffPage(windowRef = globalThis.window) {
  try {
    const page = windowRef.parent && windowRef.parent !== windowRef ? windowRef.parent : windowRef;
    if (page.location.origin !== windowRef.location.origin) return null;
    return { page, url: new URL(page.location.href) };
  } catch { return null; }
}

export function pendingHandoff(windowRef = globalThis.window) {
  const context = handoffPage(windowRef); if (!context) return null;
  const source = context.url.searchParams.get('from');
  if (source === 'spot-difference' || source === 'hidden-object') {
    try {
      const value = decodePuzzleHandoff(context.page.sessionStorage.getItem(PUZZLE_HANDOFF_KEY));
      if (!value || (source === 'spot-difference' ? value.mode !== 'spot_difference' : value.mode !== 'hidden_object')) return null;
      const binary = atob(value.payload.image.base64); const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      let metadata = null;
      try { const parsed = JSON.parse(context.page.sessionStorage.getItem(PUZZLE_HANDOFF_META_KEY) || 'null'); if (parsed && typeof parsed === 'object') metadata = parsed; } catch { /* optional retry state */ }
      return { source, key: PUZZLE_HANDOFF_KEY, metadataKey: PUZZLE_HANDOFF_META_KEY, storage: context.page.sessionStorage, page: context.page, payload: value.payload, mode: value.mode, metadata, file: new Blob([bytes], { type: 'image/png' }) };
    } catch { return null; }
  }
  if (source !== 'draw' && source !== 'pixel-camera') return null;
  const key = source === 'draw' ? DRAW_HANDOFF_KEY : CAMERA_HANDOFF_KEY;
  try {
    const storage = source === 'draw' ? context.page.sessionStorage : context.page.localStorage;
    const value = decodePngHandoff(storage.getItem(key), source);
    return value ? { ...value, source, key, storage, page: context.page } : null;
  } catch { return null; }
}

export function consumeHandoff(handoff) {
  if (!handoff) return false;
  try {
    handoff.storage.removeItem(handoff.key);
    if (handoff.metadataKey) handoff.storage.removeItem(handoff.metadataKey);
    const url = new URL(handoff.page.location.href); url.searchParams.delete('from');
    handoff.page.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    return true;
  } catch { return false; }
}

export function openHandoffComposer(handoff, postUi, FileImpl = globalThis.File) {
  if (!handoff || !postUi?.openComposer || typeof FileImpl !== 'function') return false;
  if (handoff.payload && postUi.openPuzzleComposer) {
    const file = new FileImpl([handoff.file], `${handoff.mode}.png`, { type: 'image/png' });
    Promise.resolve(postUi.openPuzzleComposer({ file, payload: handoff.payload, metadata: handoff.metadata, onSuccess: () => consumeHandoff(handoff), onDiscard: () => consumeHandoff(handoff) }))
      .catch((error) => console.warn('Puzzle handoff failed', error));
    return true;
  }
  const draw = handoff.source === 'draw';
  const file = new FileImpl([handoff.file], draw ? 'drawing.png' : 'pixel-camera.png', { type: 'image/png' });
  postUi.openComposer({ file, postKind: draw ? 'pixel_art' : 'pixel_camera' });
  return consumeHandoff(handoff);
}
