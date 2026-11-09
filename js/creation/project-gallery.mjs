import { bindContextAction } from '../site-interactions.mjs?rev=20261001-interactions-1';

export function galleryWindow({ count, width, viewportHeight, offset = 0, columns = 3, gap = 3, overscan = 2 }) {
  const size = Math.max(1, (width - gap * (columns - 1)) / columns);
  const stride = size + gap;
  const rows = Math.ceil(count / columns);
  const firstRow = Math.max(0, Math.min(rows, Math.floor(Math.max(0, offset) / stride) - overscan));
  const lastRow = Math.min(rows, Math.ceil((Math.max(0, offset) + viewportHeight) / stride) + overscan);
  return { size, stride, height: Math.max(0, rows * stride - gap), start: Math.min(count, firstRow * columns), end: Math.min(count, lastRow * columns) };
}

/** Shared square-card metrics for each uninterrupted segment of the gallery. */
export function gallerySegmentLayout({ count, width, columns = 3, gap = 3 }) {
  const size = Math.max(1, (width - gap * (columns - 1)) / columns);
  const stride = size + gap;
  const rows = Math.ceil(Math.max(0, count) / columns);
  return { size, stride, height: Math.max(0, rows * stride - gap), columns };
}

/** Build the static item ranges around configured, parent-owned flow breaks. */
export function galleryBreakRanges(count, breaks = []) {
  const total = Math.max(0, Math.trunc(Number(count) || 0));
  const points = [...breaks].map(entry => Math.max(1, Math.trunc(Number(entry?.after) || 0))).sort((a, b) => a - b);
  const ranges = [];
  let start = 0;
  for (const after of points) {
    const end = Math.max(start, Math.min(total, after));
    ranges.push({ start, end });
    start = end;
  }
  ranges.push({ start, end: total });
  return ranges;
}

/** Avoid running a row-window calculation for distant segments. */
export function gallerySegmentNearViewport({ segmentTop, segmentBottom, viewportTop, viewportBottom, overscan = 0 } = {}) {
  return Number.isFinite(segmentTop) && Number.isFinite(segmentBottom)
    && Number.isFinite(viewportTop) && Number.isFinite(viewportBottom)
    && segmentBottom >= viewportTop - Math.max(0, overscan)
    && segmentTop <= viewportBottom + Math.max(0, overscan);
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
export function mountProjectGallery({ list, scroller, onOpen, onContext = () => {}, onSelection = () => {}, isLocked = () => false, currentId = () => null, readOnly = false, actionLabel = '続きを開く', getBadge = () => '' }) {
  const selected = new Set(); const cards = new Map();
  let items = [], filtered = [], indexes = new Map(), itemLocations = new Map(), query = '', selecting = false;
  let frame = 0, layout = null, pendingFocus = null, disposed = false, ignoreReleaseClick = false, scrollEpoch = 0, pressScrollEpoch = 0;
  let breakSpecs = [], segments = [], segmentLayouts = [];
  let lastWidth = 0, lastHeight = 0, lastBreakSizes = '';
  let observer;
  list.classList.add('project-gallery'); list.setAttribute('role', 'group');
  const notify = () => onSelection({ selecting, selected: selected.size, total: items.length, visible: filtered.length, all: filtered.length > 0 && filtered.every(item => selected.has(item.projectId)) });
  const findItem = event => { const card = event.target.closest?.('[data-project-id]'); return card && list.contains(card) ? filtered.find(item => item.projectId === card.dataset.projectId) : null; };
  const isSegmented = () => breakSpecs.length > 0 && segments.length > 0;

  function updateCard(card, item) {
    const chosen = selected.has(item.projectId);
    card.setAttribute('aria-pressed', String(chosen));
    card.setAttribute('aria-current', String(item.projectId === currentId()));
    card.dataset.selected = String(chosen);
    card.setAttribute('aria-label', `${item.summary.name || '無題の作品'}${item.summary.width ? `、${item.summary.width} × ${item.summary.height}px` : ''}${selecting ? chosen ? '、選択済み' : '、未選択' : `、${actionLabel}`}`);
    card.title = item.summary.name || '無題の作品'; card.disabled = isLocked();
  }
  function makeCard(item, parent) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'project-card project-gallery__tile'; card.dataset.projectId = item.projectId;
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); drawProjectThumbnail(canvas, item.summary.thumbnail);
    const check = document.createElement('span'); check.className = 'project-gallery__check'; check.setAttribute('aria-hidden', 'true'); check.textContent = '✓';
    canvas.hidden = !item.summary.thumbnail;
    const fallback = document.createElement('span'); fallback.className = 'project-gallery__fallback'; fallback.setAttribute('aria-hidden', 'true'); fallback.textContent = item.summary.hasAudio ? '♪' : '作品'; fallback.hidden = Boolean(item.summary.thumbnail);
    const badge = document.createElement('span'); badge.className = 'project-gallery__badge'; badge.textContent = getBadge(item); badge.hidden = !badge.textContent;
    card.append(canvas, fallback, badge, check); parent.append(card); cards.set(item.projectId, card);
    return card;
  }
  function removeCards() { for (const card of cards.values()) card.remove(); cards.clear(); }
  function buildIndexes() {
    indexes = new Map(filtered.map((item, index) => [item.projectId, index]));
    itemLocations = new Map();
    if (!isSegmented()) return;
    for (const [segmentIndex, range] of galleryBreakRanges(filtered.length, breakSpecs).entries()) {
      for (let index = range.start; index < range.end; index++) itemLocations.set(filtered[index].projectId, { segmentIndex, localIndex: index - range.start });
    }
  }
  function breakSizes() {
    return segments.map(segment => {
      const rect = segment.breakWrapper?.getBoundingClientRect?.();
      return `${rect?.width || 0}x${rect?.height || 0}`;
    }).join('|');
  }
  function addBreakObservations() {
    if (!observer) return;
    for (const segment of segments) if (segment.breakWrapper) observer.observe(segment.breakWrapper);
    lastBreakSizes = breakSizes();
  }
  function restoreBreakElement(record) {
    const { element, parent, nextSibling } = record;
    if (parent?.isConnected && typeof parent.insertBefore === 'function') {
      const before = nextSibling?.parentNode === parent ? nextSibling : null;
      parent.insertBefore(element, before);
    } else element.remove?.();
  }
  function teardownSegments(restoreElements = true) {
    removeCards();
    if (restoreElements) for (const record of segments.map(segment => segment.breakRecord).filter(Boolean)) restoreBreakElement(record);
    for (const segment of segments) { if (segment.breakWrapper) observer?.unobserve?.(segment.breakWrapper); segment.node.remove(); segment.breakWrapper?.remove(); }
    segments = []; segmentLayouts = []; breakSpecs = [];
    list.classList.remove('project-gallery--segmented'); delete list.dataset.segmented;
    list.style.height = '';
    buildIndexes();
  }
  function normalizedBreaks(values) {
    if (!Array.isArray(values)) return [];
    const uniqueElements = new Set(), afterSeen = new Set();
    return values.map(value => ({ after: Math.trunc(Number(value?.after)), element: value?.element }))
      .filter(value => Number.isSafeInteger(value.after) && value.after > 0 && value.element?.nodeType
        && typeof value.element.remove === 'function' && !uniqueElements.has(value.element) && !afterSeen.has(value.after)
        && (uniqueElements.add(value.element), afterSeen.add(value.after), true))
      .sort((a, b) => a.after - b.after);
  }
  function createSegment(after) {
    const node = document.createElement('div'); node.className = 'project-gallery__segment';
    const tiles = document.createElement('div'); tiles.className = 'project-gallery__tiles'; node.append(tiles);
    return { node, tiles, after, breakWrapper: null, breakRecord: null };
  }
  function setBreaks(values) {
    const next = normalizedBreaks(values);
    if (!next.length) { clearBreaks(); return; }
    if (next.length === breakSpecs.length && next.every((entry, index) => entry.after === breakSpecs[index].after && entry.element === breakSpecs[index].element)) return;
    if (isSegmented()) teardownSegments(true); else removeCards();
    const records = next.map(entry => ({ ...entry, parent: entry.element.parentNode, nextSibling: entry.element.nextSibling }));
    breakSpecs = next;
    list.classList.add('project-gallery--segmented'); list.dataset.segmented = 'true'; list.style.height = '';
    for (const record of records) {
      const segment = createSegment(record.after);
      list.append(segment.node);
      const breakWrapper = document.createElement('div'); breakWrapper.className = 'project-gallery__break';
      breakWrapper.dataset.galleryBreakAfter = String(record.after);
      if (record.element.dataset) record.element.dataset.adAfter = String(record.after);
      else record.element.setAttribute?.('data-ad-after', String(record.after));
      breakWrapper.append(record.element); list.append(breakWrapper);
      segment.breakWrapper = breakWrapper; segment.breakRecord = record;
      segments.push(segment);
    }
    segments.push(createSegment(null)); list.append(segments.at(-1).node);
    buildIndexes(); addBreakObservations(); schedule();
  }
  function clearBreaks() {
    if (isSegmented()) teardownSegments(true);
    else { breakSpecs = []; segments = []; segmentLayouts = []; list.classList.remove('project-gallery--segmented'); delete list.dataset.segmented; }
    if (!disposed) schedule();
  }
  function setSegmentRanges() {
    const ranges = galleryBreakRanges(filtered.length, breakSpecs);
    for (let i = 0; i < segments.length; i++) {
      segments[i].start = ranges[i].start; segments[i].end = ranges[i].end;
    }
    segmentLayouts = [];
    return ranges;
  }
  function renderFlat(width) {
    const columns = Number(getComputedStyle(list).getPropertyValue('--gallery-columns')) || 3;
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
      if (!card) card = makeCard(item, list);
      card.style.width = card.style.height = `${layout.size}px`;
      card.style.top = `${Math.floor(i / columns) * layout.stride}px`; card.style.left = `${i % columns * layout.stride}px`;
      updateCard(card, item);
    }
    [...cards.values()].sort((a, b) => indexes.get(a.dataset.projectId) - indexes.get(b.dataset.projectId)).forEach((card, i) => { if (list.children[i] !== card) list.insertBefore(card, list.children[i] || null); });
    if (focusedBeforeRender && list.contains(focusedBeforeRender) && document.activeElement !== focusedBeforeRender) focusedBeforeRender.focus({ preventScroll: true });
    if (pendingFocus) { cards.get(pendingFocus)?.focus({ preventScroll: true }); pendingFocus = null; }
  }
  function renderSegmented(width) {
    const columns = Number(getComputedStyle(list).getPropertyValue('--gallery-columns')) || 3;
    const gap = 3;
    const ranges = setSegmentRanges();
    const scrollerRect = scroller.getBoundingClientRect();
    const viewportHeight = scroller.clientHeight || scrollerRect.height || 0;
    const viewportTop = scrollerRect.top;
    const viewportBottom = viewportTop + viewportHeight;
    const keep = new Set();
    layout = { columns, width, size: gallerySegmentLayout({ count: 1, width, columns, gap }).size, segmented: true };

    // Write all flow heights before measuring any segment. This avoids a layout flush per group.
    const prepared = segments.map((segment, segmentIndex) => {
      const range = ranges[segmentIndex];
      const count = range.end - range.start;
      const dimensions = gallerySegmentLayout({ count, width, columns, gap });
      const galleryStart = String(range.start), galleryCount = String(count), height = `${dimensions.height}px`;
      if (segment.node.dataset.galleryStart !== galleryStart) segment.node.dataset.galleryStart = galleryStart;
      if (segment.node.dataset.galleryCount !== galleryCount) segment.node.dataset.galleryCount = galleryCount;
      if (segment.tiles.style.height !== height) segment.tiles.style.height = height;
      return { segment, segmentIndex, range, count, dimensions };
    });
    const measured = prepared.map(entry => ({ ...entry, tilesRect: entry.segment.tiles.getBoundingClientRect() }));
    for (const { segment, segmentIndex, range, count, dimensions, tilesRect } of measured) {
      const rowOverscan = Math.max(dimensions.size, dimensions.stride * 2);
      const near = count > 0 && gallerySegmentNearViewport({ segmentTop: tilesRect.top, segmentBottom: tilesRect.bottom,
        viewportTop, viewportBottom, overscan: rowOverscan });
      const top = tilesRect.top - scrollerRect.top + scroller.scrollTop;
      const localWindow = near ? galleryWindow({ count, width, viewportHeight, offset: viewportTop - tilesRect.top, columns, gap, overscan: 2 })
        : { start: 0, end: 0, size: dimensions.size, stride: dimensions.stride };
      segmentLayouts[segmentIndex] = { start: range.start, end: range.end, count, columns: dimensions.columns, size: dimensions.size,
        stride: dimensions.stride, top, tilesRect };
      for (let localIndex = localWindow.start; localIndex < localWindow.end; localIndex++) keep.add(filtered[range.start + localIndex].projectId);
    }
    const focusedBeforeRender = document.activeElement;
    const focused = document.activeElement?.closest?.('[data-project-id]');
    if (focused && list.contains(focused)) keep.add(focused.dataset.projectId);
    if (pendingFocus && indexes.has(pendingFocus)) keep.add(pendingFocus);
    for (const [id, card] of cards) if (!keep.has(id)) { card.remove(); cards.delete(id); }
    for (const id of keep) {
      const index = indexes.get(id), location = itemLocations.get(id);
      if (index === undefined || !location) continue;
      const item = filtered[index], segment = segments[location.segmentIndex], metrics = segmentLayouts[location.segmentIndex];
      let card = cards.get(id);
      if (!card) card = makeCard(item, segment.tiles);
      const row = Math.floor(location.localIndex / metrics.columns);
      const column = location.localIndex % metrics.columns;
      card.style.width = card.style.height = `${metrics.size}px`;
      card.style.top = `${row * metrics.stride}px`; card.style.left = `${column * metrics.stride}px`;
      updateCard(card, item);
    }
    const cardsBySegment = new Map();
    for (const card of cards.values()) {
      const segmentIndex = itemLocations.get(card.dataset.projectId)?.segmentIndex;
      if (segmentIndex === undefined) continue;
      if (!cardsBySegment.has(segmentIndex)) cardsBySegment.set(segmentIndex, []);
      cardsBySegment.get(segmentIndex).push(card);
    }
    for (const [segmentIndex, ordered] of cardsBySegment) {
      const tiles = segments[segmentIndex].tiles;
      ordered.sort((a, b) => indexes.get(a.dataset.projectId) - indexes.get(b.dataset.projectId));
      ordered.forEach((card, index) => { if (tiles.children[index] !== card) tiles.insertBefore(card, tiles.children[index] || null); });
    }
    if (focusedBeforeRender && list.contains(focusedBeforeRender) && document.activeElement !== focusedBeforeRender) focusedBeforeRender.focus({ preventScroll: true });
    if (pendingFocus) { cards.get(pendingFocus)?.focus({ preventScroll: true }); pendingFocus = null; }
  }
  function render() {
    frame = 0; if (disposed || !list.isConnected || !list.getClientRects().length) return;
    const width = list.clientWidth; if (!width) return;
    if (isSegmented()) renderSegmented(width); else renderFlat(width);
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
  function nextVerticalIndex(index, direction) {
    if (!isSegmented()) return Math.max(0, Math.min(filtered.length - 1, index + direction * (layout?.columns || 3)));
    const location = itemLocations.get(filtered[index]?.projectId);
    if (!location) return index;
    const current = segmentLayouts[location.segmentIndex] || { start: segments[location.segmentIndex]?.start || 0, end: segments[location.segmentIndex]?.end || 0, columns: 3 };
    const columns = current.columns || 3;
    const desired = location.localIndex + direction * columns;
    const currentCount = current.end - current.start;
    if (desired >= 0 && desired < currentCount) return current.start + desired;
    const step = direction > 0 ? 1 : -1;
    for (let segmentIndex = location.segmentIndex + step; segmentIndex >= 0 && segmentIndex < segments.length; segmentIndex += step) {
      const candidate = segmentLayouts[segmentIndex] || { start: segments[segmentIndex].start, end: segments[segmentIndex].end, columns };
      const count = candidate.end - candidate.start;
      if (!count) continue;
      if (direction > 0) return candidate.start + Math.min(location.localIndex % columns, count - 1);
      const rowStart = Math.floor((count - 1) / (candidate.columns || columns)) * (candidate.columns || columns);
      return candidate.start + Math.min(rowStart + (location.localIndex % columns), count - 1);
    }
    return index;
  }
  const onKey = event => {
    const item = findItem(event); if (!item || isLocked()) return;
    if (!readOnly && (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) { event.preventDefault(); onContext(item, cards.get(item.projectId)); return; }
    if (!readOnly && event.key === ' ' && !selecting) { event.preventDefault(); toggle(item); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = filtered.indexOf(item);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1
      : event.key === 'ArrowUp' ? nextVerticalIndex(index, -1) : event.key === 'ArrowDown' ? nextVerticalIndex(index, 1)
        : Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
    if (next === index || !filtered[next]) return;
    pendingFocus = filtered[next].projectId;
    let top, itemSize = layout?.size || 100;
    if (isSegmented()) {
      const location = itemLocations.get(pendingFocus), group = location && segmentLayouts[location.segmentIndex];
      if (group) { top = group.top + Math.floor(location.localIndex / group.columns) * group.stride; itemSize = group.size; }
    } else top = list.offsetTop + Math.floor(next / (layout?.columns || 3)) * (layout?.stride || 100);
    const header = scroller.querySelector('.project-sheet__header')?.offsetHeight || 0;
    if (Number.isFinite(top) && (top < scroller.scrollTop + header || top + itemSize > scroller.scrollTop + scroller.clientHeight)) scroller.scrollTop = Math.max(0, top - header - 12);
    schedule();
  };
  const freshPress = () => { ignoreReleaseClick = false; pressScrollEpoch = scrollEpoch; };
  const suppressRelease = event => { if (ignoreReleaseClick && event.detail !== 0) { ignoreReleaseClick = false; event.preventDefault(); event.stopImmediatePropagation(); } };
  if (!readOnly) { list.addEventListener('pointerdown', freshPress); list.addEventListener('click', suppressRelease, true); }
  list.addEventListener('click', onClick); list.addEventListener('keydown', onKey);
  const onScroll = () => { scrollEpoch++; schedule(); };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  observer = new ResizeObserver(() => {
    const nextBreakSizes = breakSizes();
    if (list.clientWidth !== lastWidth || scroller.clientHeight !== lastHeight || nextBreakSizes !== lastBreakSizes) {
      lastWidth = list.clientWidth; lastHeight = scroller.clientHeight; lastBreakSizes = nextBreakSizes; schedule();
    }
  });
  observer.observe(list); observer.observe(scroller);
  return {
    setItems(next) {
      if (list.contains(document.activeElement)) pendingFocus = document.activeElement.dataset.projectId;
      items = next; filtered = items.filter(item => !query || (item.summary.name || '').normalize('NFKC').toLocaleLowerCase('ja-JP').includes(query));
      buildIndexes();
      const ids = new Set(items.map(item => item.projectId)); for (const id of selected) if (!ids.has(id)) selected.delete(id);
      removeCards(); notify(); schedule();
    },
    filter(value) {
      query = value.trim().normalize('NFKC').toLocaleLowerCase('ja-JP');
      filtered = items.filter(item => !query || (item.summary.name || '').normalize('NFKC').toLocaleLowerCase('ja-JP').includes(query));
      buildIndexes(); if (pendingFocus && !indexes.has(pendingFocus)) pendingFocus = null;
      removeCards(); notify(); schedule();
    },
    selectAll() { if (isLocked()) return; selecting = true; const all = filtered.every(item => selected.has(item.projectId)); for (const item of filtered) all ? selected.delete(item.projectId) : selected.add(item.projectId); list.dataset.selecting = 'true'; notify(); schedule(); },
    setSelection, refresh: schedule, setBreaks, clearBreaks,
    get selection() { return items.filter(item => selected.has(item.projectId)); },
    get selecting() { return selecting; },
    dispose() { disposed = true; cancelAnimationFrame(frame); clearBreaks(); unbind(); observer.disconnect(); scroller.removeEventListener('scroll', onScroll); list.removeEventListener('click', onClick); if (!readOnly) { list.removeEventListener('pointerdown', freshPress); list.removeEventListener('click', suppressRelease, true); } list.removeEventListener('keydown', onKey); removeCards(); items = []; filtered = []; selected.clear(); }
  };
}
