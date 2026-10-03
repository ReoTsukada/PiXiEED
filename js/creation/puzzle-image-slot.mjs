import { MAX_PIXEL_FILE_BYTES, MAX_PIXEL_IMAGE_EDGE, MAX_PIXEL_IMAGE_PIXELS, readPixelImageDimensions } from '../pixel-scale.mjs';

/** Local, staged image selection. Loading a preview never writes a project or starts editing. */
export function mountPuzzleImageSlot({ host, input, onFile, onError } = {}) {
  const preview = host.querySelector('[data-slot-preview]');
  const empty = host.querySelector('[data-slot-empty]');
  const name = host.querySelector('[data-slot-name]');
  const remove = host.querySelector('[data-slot-clear]');
  let file = null; let url = null; let epoch = 0; let busy = false; let loading = false; let disposed = false; let dragDepth = 0;
  const resetDrag = () => { dragDepth = 0; delete host.dataset.dragging; };
  function notify(value) { onFile?.(value); }
  function clear() {
    epoch += 1; file = null; loading = false;
    preview.removeAttribute('src'); preview.hidden = true; empty.hidden = false;
    name.textContent = ''; if (remove) remove.hidden = true;
    delete host.dataset.filled; host.removeAttribute('aria-busy'); input.value = ''; resetDrag();
    if (url) URL.revokeObjectURL(url); url = null;
    if (!disposed) notify(null);
  }
  async function setFile(next) {
    if (busy || disposed || !next) return false;
    const request = ++epoch; let nextUrl = null;
    loading = true; host.setAttribute('aria-busy', 'true'); notify(null);
    try {
      if (!(next instanceof Blob) || !['image/png', 'image/webp'].includes(next.type)) throw new TypeError('PNGまたはWebP画像を選んでください。');
      if (next.size > MAX_PIXEL_FILE_BYTES) throw new RangeError('画像は10MB以内にしてください。');
      const header = new Uint8Array(await next.slice(0, 256 * 1024).arrayBuffer());
      if (request !== epoch || disposed) return false;
      const size = readPixelImageDimensions(header, next.type);
      if (!size || size.width < 1 || size.height < 1 || size.width > MAX_PIXEL_IMAGE_EDGE || size.height > MAX_PIXEL_IMAGE_EDGE || size.width * size.height > MAX_PIXEL_IMAGE_PIXELS) throw new RangeError('画像の形式やサイズを確認してください（最大4096px）。');
      nextUrl = URL.createObjectURL(next);
      const image = new Image(); image.src = nextUrl; await image.decode();
      if (request !== epoch || disposed) return false;
      if (image.naturalWidth !== size.width || image.naturalHeight !== size.height) throw new TypeError('画像のサイズを確認できませんでした。');
      const previousUrl = url; url = nextUrl; nextUrl = null; file = next;
      preview.src = url; preview.hidden = false; empty.hidden = true;
      name.textContent = `${next.name || '画像'} · ${size.width}×${size.height}px`;
      host.dataset.filled = 'true'; if (remove) remove.hidden = false;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return true;
    } catch (error) {
      if (request === epoch && !disposed) onError?.(error);
      return false;
    } finally {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      if (request === epoch) { loading = false; host.removeAttribute('aria-busy'); input.value = ''; resetDrag(); if (!disposed) notify(file); }
    }
  }
  const open = event => {
    if (busy || disposed || event.target === input || event.target.closest('[data-slot-clear]')) return;
    input.click();
  };
  const key = event => { if (event.target === host && ['Enter', ' '].includes(event.key)) { event.preventDefault(); open(event); } };
  const change = () => { void setFile(input.files?.[0]); };
  const enter = event => { if (!event.dataTransfer?.types?.includes('Files')) return; event.preventDefault(); if (!busy) { dragDepth += 1; host.dataset.dragging = 'true'; } };
  const over = event => { if (!event.dataTransfer?.types?.includes('Files')) return; event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; };
  const leave = () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) resetDrag(); };
  const drop = event => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault(); event.stopPropagation(); resetDrag();
    if (busy) return;
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) { onError?.(new TypeError('この枠には画像を1枚入れてください。')); return; }
    void setFile(files[0]);
  };
  const clearClick = event => { event.preventDefault(); event.stopPropagation(); if (!busy) clear(); };
  host.addEventListener('click', open); host.addEventListener('keydown', key); input.addEventListener('change', change);
  host.addEventListener('dragenter', enter); host.addEventListener('dragover', over); host.addEventListener('dragleave', leave); host.addEventListener('drop', drop); remove?.addEventListener('click', clearClick);
  // A dropped file outside a slot should not navigate away and lose the maker.
  const preventNavigation = event => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault(); };
  document.addEventListener('dragover', preventNavigation); document.addEventListener('drop', preventNavigation);
  function setBusy(value) {
    busy = Boolean(value); input.disabled = busy; host.setAttribute('aria-disabled', String(busy));
    if (busy && loading) { epoch += 1; loading = false; host.removeAttribute('aria-busy'); }
    if (remove) remove.disabled = busy;
  }
  function dispose() {
    if (disposed) return; disposed = true; clear();
    host.removeEventListener('click', open); host.removeEventListener('keydown', key); input.removeEventListener('change', change);
    host.removeEventListener('dragenter', enter); host.removeEventListener('dragover', over); host.removeEventListener('dragleave', leave); host.removeEventListener('drop', drop); remove?.removeEventListener('click', clearClick);
    document.removeEventListener('dragover', preventNavigation); document.removeEventListener('drop', preventNavigation); window.removeEventListener('pagehide', pagehide);
  }
  const pagehide = event => { if (!event.persisted) dispose(); };
  window.addEventListener('pagehide', pagehide);
  return { getFile: () => loading ? null : file, isLoading: () => loading, setFile, clear, setBusy, dispose };
}
