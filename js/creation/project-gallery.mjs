import { bindContextAction } from '../site-interactions.mjs?rev=20261001-interactions-1';

export function galleryWindow({ count, width, viewportHeight, offset = 0, columns = 4, gap = 3, overscan = 2 }) {
  const size = Math.max(1, (width - gap * (columns - 1)) / columns);
  const stride = size + gap;
  const rows = Math.ceil(count / columns);
  const firstRow = Math.max(0, Math.min(rows, Math.floor(Math.max(0, offset) / stride) - overscan));
  const lastRow = Math.min(rows, Math.ceil((Math.max(0, offset) + viewportHeight) / stride) + overscan);
  return { size, stride, height: Math.max(0, rows * stride - gap), start: Math.min(count, firstRow * columns), end: Math.min(count, lastRow * columns) };
}

export function drawProjectThumbnail(canvas, sample) {
  canvas.width = sample?.width || 28; canvas.height = sample?.height || 28;
  if (!sample) return;
  const pixels = new Uint8ClampedArray(sample.width * sample.height * 4);
  for (let i = 0; i < sample.width * sample.height; i++) {
    pixels[i * 4] = sample.rgb[i * 3]; pixels[i * 4 + 1] = sample.rgb[i * 3 + 1]; pixels[i * 4 + 2] = sample.rgb[i * 3 + 2]; pixels[i * 4 + 3] = 255;
  }
  canvas.getContext('2d').putImageData(new ImageData(pixels, sample.width, sample.height), 0, 0);
}

/** Keep decoded thumbnails, DOM and gesture listeners bounded by the viewport. */
export function mountProjectGallery({ list, scroller, onOpen, onContext = () => {}, onSelection = () => {}, isLocked = () => false, currentId = () => null, readOnly = false }) {
  const selected = new Set(); const cards = new Map();
  let items = [], filtered = [], indexes = new Map(), query = '', selecting = false, frame = 0, layout = null, pendingFocus = null, disposed = false, ignoreReleaseClick = false, scrollEpoch = 0, pressScrollEpoch = 0;
  list.classList.add('project-gallery'); list.setAttribute('role', 'group');
  const notify = () => onSelection({ selecting, selected: selected.size, total: items.length, visible: filtered.length, all: filtered.length > 0 && filtered.every(item => selected.has(item.projectId)) });
  const findItem = event => { const card = event.target.closest?.('[data-project-id]'); return card && list.contains(card) ? filtered.find(item => item.projectId === card.dataset.projectId) : null; };
  function updateCard(card, item) {
    const chosen = selected.has(item.projectId);
    card.setAttribute('aria-pressed', String(chosen));
    card.setAttribute('aria-current', String(item.projectId === currentId()));
    card.dataset.selected = String(chosen);
    card.setAttribute('aria-label', `${item.summary.name || '無題の作品'}${item.summary.width ? `、${item.summary.width} × ${item.summary.height}px` : ''}${selecting ? chosen ? '、選択済み' : '、未選択' : '、続きを開く'}`);
    card.title = item.summary.name || '無題の作品'; card.disabled = isLocked();
  }
  function render() {
    frame = 0; if (disposed || !list.isConnected || !list.getClientRects().length) return;
    const width = list.clientWidth; if (!width) return;
    const columns = Number(getComputedStyle(list).getPropertyValue('--gallery-columns')) || 4;
    const offset = scroller.getBoundingClientRect().top - list.getBoundingClientRect().top;
    layout = { ...galleryWindow({ count: filtered.length, width, viewportHeight: scroller.clientHeight, offset, columns }), columns };
    list.style.height = `${layout.height}px`;
    const keep = new Set();
    const focusedBeforeRender = document.activeElement;
    for (let i = layout.start; i < layout.end; i++) keep.add(filtered[i].projectId);
    const focused = document.activeElement?.closest?.('[data-project-id]');
    if (focused && list.contains(focused)) keep.add(focused.dataset.projectId);
    if (pendingFocus && filtered.some(item => item.projectId === pendingFocus)) keep.add(pendingFocus);
    for (const [id, card] of cards) if (!keep.has(id)) { card.remove(); cards.delete(id); }
    for (const id of keep) {
      const i = indexes.get(id); if (i === undefined) continue; const item = filtered[i];
      let card = cards.get(item.projectId);
      if (!card) {
        card = document.createElement('button'); card.type = 'button'; card.className = 'project-card project-gallery__tile'; card.dataset.projectId = item.projectId;
        const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); drawProjectThumbnail(canvas, item.summary.thumbnail);
        const check = document.createElement('span'); check.className = 'project-gallery__check'; check.setAttribute('aria-hidden', 'true'); check.textContent = '✓';
        card.append(canvas, check); cards.set(item.projectId, card); list.append(card);
      }
      card.style.width = card.style.height = `${layout.size}px`;
      card.style.top = `${Math.floor(i / columns) * layout.stride}px`; card.style.left = `${i % columns * layout.stride}px`;
      updateCard(card, item);
    }
    // Keep DOM order in the same reading/Tab order as the visual grid after scrolling.
    [...cards.values()].sort((a, b) => indexes.get(a.dataset.projectId) - indexes.get(b.dataset.projectId)).forEach((card, i) => { if (list.children[i] !== card) list.insertBefore(card, list.children[i] || null); });
    if (focusedBeforeRender && list.contains(focusedBeforeRender) && document.activeElement !== focusedBeforeRender) focusedBeforeRender.focus({ preventScroll: true });
    if (pendingFocus) { cards.get(pendingFocus)?.focus({ preventScroll: true }); pendingFocus = null; }
  }
  function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(render); }
  function setSelection(value) { selecting = value; if (!value) selected.clear(); list.dataset.selecting = String(value); notify(); schedule(); }
  function toggle(item) { if (isLocked()) return; selecting = true; selected.has(item.projectId) ? selected.delete(item.projectId) : selected.add(item.projectId); list.dataset.selecting = 'true'; notify(); schedule(); }
  const onClick = event => {
    const item = findItem(event); if (!item || isLocked()) return;
    if (!readOnly && (selecting || event.ctrlKey || event.metaKey || event.shiftKey)) toggle(item); else onOpen(item);
  };
  const unbind = readOnly ? () => {} : bindContextAction(list, ({ event, source }) => {
    const item = findItem(event); if (!item || isLocked() || !scroller.open || !list.getClientRects().length || source === 'hold' && pressScrollEpoch !== scrollEpoch) return false;
    if (source === 'hold') { ignoreReleaseClick = true; if (!selected.has(item.projectId)) toggle(item); else setSelection(true); }
    else onContext(item, cards.get(item.projectId));
    return true;
  });
  const onKey = event => {
    const item = findItem(event); if (!item || isLocked()) return;
    if (!readOnly && (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) { event.preventDefault(); onContext(item, cards.get(item.projectId)); return; }
    if (!readOnly && event.key === ' ' && !selecting) { event.preventDefault(); toggle(item); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = filtered.indexOf(item), cols = layout?.columns || 4;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 : Math.max(0, Math.min(filtered.length - 1, index + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[event.key])));
    pendingFocus = filtered[next].projectId;
    const top = list.offsetTop + Math.floor(next / cols) * (layout?.stride || 100);
    const header = scroller.querySelector('.project-sheet__header')?.offsetHeight || 0;
    if (top < scroller.scrollTop + header || top + (layout?.size || 100) > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = Math.max(0, top - header - 12);
    schedule();
  };
  const freshPress = () => { ignoreReleaseClick = false; pressScrollEpoch = scrollEpoch; };
  const suppressRelease = event => { if (ignoreReleaseClick && event.detail !== 0) { ignoreReleaseClick = false; event.preventDefault(); event.stopImmediatePropagation(); } };
  if (!readOnly) { list.addEventListener('pointerdown', freshPress); list.addEventListener('click', suppressRelease, true); }
  list.addEventListener('click', onClick); list.addEventListener('keydown', onKey);
  const onScroll = () => { scrollEpoch++; schedule(); };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  let lastWidth = 0, lastHeight = 0;
  const observer = new ResizeObserver(() => {
    if (list.clientWidth !== lastWidth || scroller.clientHeight !== lastHeight) {
      lastWidth = list.clientWidth; lastHeight = scroller.clientHeight; schedule();
    }
  }); observer.observe(list); observer.observe(scroller);
  return {
    setItems(next) {
      if (list.contains(document.activeElement)) pendingFocus = document.activeElement.dataset.projectId;
      items = next; filtered = items.filter(item => !query || (item.summary.name || '').normalize('NFKC').toLocaleLowerCase('ja-JP').includes(query));
      indexes = new Map(filtered.map((item, index) => [item.projectId, index]));
      const ids = new Set(items.map(item => item.projectId)); for (const id of selected) if (!ids.has(id)) selected.delete(id);
      for (const card of cards.values()) card.remove(); cards.clear();
      notify(); schedule();
    },
    filter(value) { query = value.trim().normalize('NFKC').toLocaleLowerCase('ja-JP'); filtered = items.filter(item => !query || (item.summary.name || '').normalize('NFKC').toLocaleLowerCase('ja-JP').includes(query)); indexes = new Map(filtered.map((item, index) => [item.projectId, index])); for (const card of cards.values()) card.remove(); cards.clear(); notify(); schedule(); },
    selectAll() { if (isLocked()) return; selecting = true; const all = filtered.every(item => selected.has(item.projectId)); for (const item of filtered) all ? selected.delete(item.projectId) : selected.add(item.projectId); list.dataset.selecting = 'true'; notify(); schedule(); },
    setSelection, refresh: schedule,
    get selection() { return items.filter(item => selected.has(item.projectId)); },
    get selecting() { return selecting; },
    dispose() { disposed = true; cancelAnimationFrame(frame); unbind(); observer.disconnect(); scroller.removeEventListener('scroll', onScroll); list.removeEventListener('click', onClick); if (!readOnly) { list.removeEventListener('pointerdown', freshPress); list.removeEventListener('click', suppressRelease, true); } list.removeEventListener('keydown', onKey); cards.clear(); items = []; filtered = []; selected.clear(); }
  };
}
