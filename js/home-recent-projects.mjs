const DATABASE_NAME = 'pixieed-pxd-v1';
const DATABASE_VERSION = 3;
const CATALOG_STORE = 'project-catalog';
const GALLERY_OWNER_INDEX = 'gallery-owner';
const DRAW_OWNER = 'tool:draw';
const LAST_CREATION_KEY = 'pixieed:pxd:last:creation';
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const THUMBNAIL_EDGE_MAX = 28;
const THUMBNAIL_BYTES_MAX = THUMBNAIL_EDGE_MAX * THUMBNAIL_EDGE_MAX * 3;
const DESKTOP_LIMIT = 4;
const MOBILE_LIMIT = 2;
const MOBILE_BREAKPOINT = 760;

export const HOME_RECENT_PROJECTS_GALLERY_HREF = '/draw/?workspace=1';
export const HOME_RECENT_PROJECTS_MAX = DESKTOP_LIMIT;

export function isSafeHomeProjectId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export function sanitizeHomeProjectTitle(value) {
  if (typeof value !== 'string') return '作品';
  const cleaned = value.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const shortened = Array.from(cleaned).slice(0, 60).join('').trim();
  return shortened || '作品';
}

export function validateHomeProjectThumbnail(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { width, height, rgb } = value;
  if (!Number.isSafeInteger(width) || width < 1 || width > THUMBNAIL_EDGE_MAX
      || !Number.isSafeInteger(height) || height < 1 || height > THUMBNAIL_EDGE_MAX
      || !(rgb instanceof Uint8Array) || rgb.length !== width * height * 3
      || rgb.byteLength > THUMBNAIL_BYTES_MAX) return null;
  return { width, height, rgb };
}

export function homeRecentProjectHref(projectId, revisionId) {
  if (!isSafeHomeProjectId(projectId) || !isSafeHomeProjectId(revisionId)) return null;
  const query = new URLSearchParams({ workspace: '1', pxd: projectId, pxdRevision: revisionId });
  return `/draw/?${query.toString()}`;
}

/** Convert a catalog row into the only display data the home page needs. */
export function normalizeHomeRecentCatalogRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
      || !isSafeHomeProjectId(row.projectId) || !isSafeHomeProjectId(row.revisionId)
      || row.galleryOwner !== DRAW_OWNER
      || row.deletedAt !== undefined && row.deletedAt !== null
      || row.purgedAt !== undefined && row.purgedAt !== null) return null;
  const summary = row.summary;
  const stamp = summary?.toolProject;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)
      || stamp?.schemaVersion !== 1 || stamp?.tool !== 'draw') return null;
  return {
    projectId: row.projectId,
    revisionId: row.revisionId,
    name: sanitizeHomeProjectTitle(summary.name),
    thumbnail: validateHomeProjectThumbnail(summary.thumbnail)
  };
}

function normalizeDisplayProject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !isSafeHomeProjectId(value.projectId) || !isSafeHomeProjectId(value.revisionId)) return null;
  return {
    projectId: value.projectId,
    revisionId: value.revisionId,
    name: sanitizeHomeProjectTitle(value.name),
    thumbnail: validateHomeProjectThumbnail(value.thumbnail)
  };
}

function hasName(collection, name) {
  return Boolean(collection?.contains?.(name) || Array.isArray(collection) && collection.includes(name));
}

function openExistingCatalog(indexedDB, signal) {
  if (!indexedDB?.open) return Promise.reject(new Error('IndexedDB is unavailable.'));
  if (signal?.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener?.('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(resolve, null);
    let request;
    try {
      // No version argument: opening an absent DB would request creation, so abort
      // immediately if IndexedDB reports an upgrade rather than creating it.
      request = indexedDB.open(DATABASE_NAME);
    } catch (error) {
      finish(reject, error);
      return;
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
    request.onupgradeneeded = () => {
      try { request.transaction?.abort(); } catch { /* The upgrade is intentionally refused. */ }
      finish(resolve, null);
    };
    request.onerror = () => {
      if (signal?.aborted || request.error?.name === 'AbortError') finish(resolve, null);
      else finish(reject, request.error || new Error('Could not open local works.'));
    };
    request.onblocked = () => finish(reject, new Error('Local works are busy in another tab.'));
    request.onsuccess = () => {
      const database = request.result;
      if (settled || signal?.aborted) {
        try { database.close(); } catch { /* A late open after cancellation is closed. */ }
        if (!settled) finish(resolve, null);
        return;
      }
      if (database.version !== DATABASE_VERSION || !hasName(database.objectStoreNames, CATALOG_STORE)) {
        try { database.close(); } catch { /* Unsupported local schemas remain untouched. */ }
        finish(resolve, null);
        return;
      }
      finish(resolve, database);
    };
  });
}

function readSelectedCatalogRows(database, { pointer, limit, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { resolve([]); return; }
    let transaction;
    try { transaction = database.transaction(CATALOG_STORE, 'readonly'); }
    catch (error) { reject(error); return; }
    const rows = [];
    let settled = false;
    let store;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener?.('abort', onAbort);
      callback(value);
    };
    const onAbort = () => {
      try { transaction.abort(); } catch { /* It may already be completing. */ }
    };
    transaction.oncomplete = () => finish(resolve, rows);
    transaction.onabort = () => {
      if (signal?.aborted) finish(resolve, []);
      else finish(reject, transaction.error || new Error('Local works could not be read.'));
    };
    transaction.onerror = () => { /* The abort event reports the final read failure. */ };
    signal?.addEventListener?.('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }

    try {
      store = transaction.objectStore(CATALOG_STORE);
      if (!hasName(store.indexNames, GALLERY_OWNER_INDEX)) return;
    } catch (error) {
      try { transaction.abort(); } catch { /* The transaction may already be closed. */ }
      finish(reject, error);
      return;
    }

    const pointerId = pointer?.projectId || null;
    const seenIds = new Set(pointerId ? [pointerId] : []);
    // A validly shaped pointer reserves one of the bounded reads even if it has
    // become stale. This keeps the number of metadata rows read <= the display cap.
    const cursorQuota = Math.max(0, limit - (pointerId ? 1 : 0));
    const maxCursorVisits = cursorQuota + (pointerId ? 1 : 0);

    function queueCatalogRead(projectId) {
      let read;
      try { read = store.get(projectId); }
      catch (error) {
        try { transaction.abort(); } catch { /* The transaction may already be closed. */ }
        finish(reject, error);
        return;
      }
      read.onsuccess = () => {
        const item = normalizeHomeRecentCatalogRow(read.result);
        if (item && item.projectId === projectId && rows.length < limit) rows.push(item);
      };
      read.onerror = () => {
        try { transaction.abort(); } catch { /* The transaction may already be closed. */ }
      };
    }

    function beginKeyCursor() {
      if (cursorQuota < 1 || signal?.aborted) return;
      let index;
      try { index = store.index(GALLERY_OWNER_INDEX); }
      catch (error) {
        try { transaction.abort(); } catch { /* The transaction may already be closed. */ }
        finish(reject, error);
        return;
      }
      let cursorRequest;
      try { cursorRequest = index.openKeyCursor(DRAW_OWNER); }
      catch (error) {
        try { transaction.abort(); } catch { /* The transaction may already be closed. */ }
        finish(reject, error);
        return;
      }
      let cursorVisits = 0;
      let selectedKeys = 0;
      cursorRequest.onsuccess = () => {
        if (signal?.aborted) return;
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursorVisits++;
        const projectId = cursor.primaryKey;
        if (isSafeHomeProjectId(projectId) && !seenIds.has(projectId) && selectedKeys < cursorQuota) {
          seenIds.add(projectId);
          selectedKeys++;
          queueCatalogRead(projectId);
        }
        if (selectedKeys < cursorQuota && cursorVisits < maxCursorVisits) cursor.continue();
      };
      cursorRequest.onerror = () => {
        try { transaction.abort(); } catch { /* The transaction may already be closed. */ }
      };
    }

    if (pointerId) {
      let preferredRead;
      try { preferredRead = store.get(pointerId); }
      catch (error) {
        try { transaction.abort(); } catch { /* The transaction may already be closed. */ }
        finish(reject, error);
        return;
      }
      preferredRead.onsuccess = () => {
        const item = normalizeHomeRecentCatalogRow(preferredRead.result);
        if (item && item.projectId === pointerId && item.revisionId === pointer.revisionId) rows.push(item);
        beginKeyCursor();
      };
      preferredRead.onerror = () => {
        try { transaction.abort(); } catch { /* The transaction may already be closed. */ }
      };
    } else beginKeyCursor();
  });
}

function readPreferredPointer(storage) {
  let value;
  try { value = storage?.getItem?.(LAST_CREATION_KEY); } catch { return null; }
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const pointer = JSON.parse(value);
    if (!isSafeHomeProjectId(pointer?.projectId) || !isSafeHomeProjectId(pointer?.revisionId)) return null;
    return { projectId: pointer.projectId, revisionId: pointer.revisionId };
  } catch { return null; }
}

/** Read only a bounded set of current, confirmed drawing rows from the v3 catalog. */
export async function readHomeRecentProjects({
  indexedDB,
  storage,
  limit = DESKTOP_LIMIT,
  signal
} = {}) {
  const boundedLimit = Math.min(DESKTOP_LIMIT, Math.max(0, Math.trunc(Number(limit) || 0)));
  if (!boundedLimit || signal?.aborted) return [];
  const database = await openExistingCatalog(
    indexedDB ?? safeWindowProperty(globalThis, 'indexedDB'),
    signal
  );
  if (!database) return [];
  try {
    if (signal?.aborted) return [];
    const rows = await readSelectedCatalogRows(database, {
      pointer: readPreferredPointer(storage ?? safeWindowProperty(globalThis, 'localStorage')),
      limit: boundedLimit,
      signal
    });
    return rows.slice(0, boundedLimit);
  } finally {
    try { database.close(); } catch { /* Read completion does not depend on close support. */ }
  }
}

function safeWindowProperty(win, key) {
  try { return win?.[key]; } catch { return undefined; }
}

function effectiveLimit(max, win) {
  const requested = Number.isFinite(Number(max)) ? Math.trunc(Number(max)) : DESKTOP_LIMIT;
  const upperBound = Math.max(0, Math.min(DESKTOP_LIMIT, requested));
  const width = Number(safeWindowProperty(win, 'innerWidth'));
  return width > 0 && width <= MOBILE_BREAKPOINT ? Math.min(upperBound, MOBILE_LIMIT) : upperBound;
}

function isVisible(element, win) {
  try {
    const rect = element.getBoundingClientRect?.();
    const width = Number(safeWindowProperty(win, 'innerWidth'));
    const height = Number(safeWindowProperty(win, 'innerHeight'));
    return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < height
      && rect.right > 0 && rect.left < width);
  } catch { return false; }
}

function paintThumbnail(document, thumbnail) {
  const valid = validateHomeProjectThumbnail(thumbnail);
  if (!valid) return null;
  let canvas;
  let context;
  try {
    canvas = document.createElement('canvas');
    canvas.width = valid.width;
    canvas.height = valid.height;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'portal-recent-canvas';
    context = canvas.getContext?.('2d', { alpha: false });
    if (!context?.createImageData || !context?.putImageData) return null;
    const pixels = context.createImageData(valid.width, valid.height);
    const rgb = valid.rgb;
    for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) {
      pixels.data[target] = rgb[source];
      pixels.data[target + 1] = rgb[source + 1];
      pixels.data[target + 2] = rgb[source + 2];
      pixels.data[target + 3] = 255;
    }
    context.imageSmoothingEnabled = false;
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch { return null; }
}

/**
 * Mount a small local-only continuation rail. No database work happens until
 * this function is called; callers can defer it until the section approaches view.
 */
export function initHomeRecentProjects({
  doc = globalThis.document,
  win = globalThis.window,
  max = DESKTOP_LIMIT,
  readProjects = readHomeRecentProjects
} = {}) {
  const list = doc?.getElementById?.('portal-recent-list');
  const status = doc?.getElementById?.('portal-recent-status');
  let disposed = false;
  let paused = false;
  let generation = 0;
  let currentLimit = null;
  let abortController = null;
  let intersectionObserver = null;
  let pendingCanvases = new Map();
  let fallbackScrollListening = false;

  if (!list || !status || typeof readProjects !== 'function') {
    return { refresh: async () => [], dispose() {} };
  }

  function removeFallbackScrollListener() {
    if (!fallbackScrollListening) return;
    fallbackScrollListening = false;
    win?.removeEventListener?.('scroll', checkFallbackVisibility);
  }

  function disconnectCanvases() {
    intersectionObserver?.disconnect?.();
    intersectionObserver = null;
    pendingCanvases = new Map();
    removeFallbackScrollListener();
  }

  function setStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function renderOneCanvas(anchor, wrapper, fallback, project, run) {
    if (disposed || paused || run !== generation || !project.thumbnail) return false;
    if (wrapper?.querySelector?.('canvas')) return true;
    const canvas = paintThumbnail(doc, project.thumbnail);
    if (!canvas) return false;
    wrapper.replaceChildren(canvas);
    fallback.hidden = true;
    pendingCanvases.delete(anchor);
    if (pendingCanvases.size === 0) removeFallbackScrollListener();
    return true;
  }

  function checkFallbackVisibility() {
    if (disposed || paused || intersectionObserver) return;
    for (const [anchor, details] of pendingCanvases) {
      if (isVisible(anchor, win)) renderOneCanvas(anchor, details.wrapper, details.fallback, details.project, details.run);
    }
  }

  function watchCanvas(anchor, wrapper, fallback, project, run) {
    if (!project.thumbnail) return;
    if (typeof win?.IntersectionObserver === 'function') {
      if (!intersectionObserver) {
        try {
          intersectionObserver = new win.IntersectionObserver(entries => {
            for (const entry of entries) {
              if (!entry.isIntersecting && !(entry.intersectionRatio > 0)) continue;
              const details = pendingCanvases.get(entry.target);
              if (details) renderOneCanvas(entry.target, details.wrapper, details.fallback, details.project, details.run);
              intersectionObserver?.unobserve?.(entry.target);
            }
          }, { rootMargin: '0px' });
        } catch { intersectionObserver = null; }
      }
      if (intersectionObserver) {
        pendingCanvases.set(anchor, { wrapper, fallback, project, run });
        intersectionObserver.observe(anchor);
        return;
      }
    }
    pendingCanvases.set(anchor, { wrapper, fallback, project, run });
    if (!fallbackScrollListening) {
      fallbackScrollListening = true;
      win?.addEventListener?.('scroll', checkFallbackVisibility, { passive: true });
    }
    checkFallbackVisibility();
  }

  function renderProjects(values, limit, run) {
    disconnectCanvases();
    const projects = [];
    if (Array.isArray(values)) {
      for (const value of values) {
        const project = normalizeDisplayProject(value);
        if (project) projects.push(project);
        if (projects.length >= limit) break;
      }
    }
    if (!projects.length) {
      list.replaceChildren();
      list.hidden = true;
      setStatus('続きから表示できる絵はありません。＋で新しくつくるか、作品一覧で確認できます。');
      return projects;
    }

    list.replaceChildren();
    list.hidden = false;
    setStatus('');
    for (const project of projects) {
      const href = homeRecentProjectHref(project.projectId, project.revisionId);
      if (!href) continue;
      const anchor = doc.createElement('a');
      anchor.className = 'portal-recent-card';
      anchor.href = href;
      anchor.setAttribute('aria-label', `${project.name} の続きを開く`);

      const preview = doc.createElement('span');
      preview.className = 'portal-recent-preview';
      preview.setAttribute('aria-hidden', 'true');
      const fallback = doc.createElement('span');
      fallback.className = 'portal-recent-fallback';
      fallback.textContent = project.thumbnail ? '絵' : 'プレビューなし';
      preview.append(fallback);

      const title = doc.createElement('span');
      title.className = 'portal-recent-title';
      title.textContent = project.name;
      const meta = doc.createElement('small');
      meta.className = 'portal-recent-meta';
      meta.textContent = '続きを開く';
      anchor.append(preview, title, meta);
      list.append(anchor);
      watchCanvas(anchor, preview, fallback, project, run);
    }
    if (!list.childNodes?.length && !list.children?.length) {
      list.hidden = true;
      setStatus('保存した作品を表示できません。作品一覧から開いてください。');
    }
    return projects;
  }

  async function refresh() {
    if (disposed || paused) return [];
    const run = ++generation;
    abortController?.abort?.();
    disconnectCanvases();
    const AbortControllerImpl = safeWindowProperty(win, 'AbortController') || globalThis.AbortController;
    abortController = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null;
    const limit = effectiveLimit(max, win);
    currentLimit = limit;
    if (!limit) {
      list.replaceChildren();
      list.hidden = true;
      setStatus('続きから表示できる絵はありません。＋で新しくつくるか、作品一覧で確認できます。');
      return [];
    }
    setStatus('保存した作品を確認しています…');
    try {
      const projects = await readProjects({
        indexedDB: safeWindowProperty(win, 'indexedDB'),
        storage: safeWindowProperty(win, 'localStorage'),
        limit,
        signal: abortController?.signal
      });
      if (disposed || paused || run !== generation) return [];
      return renderProjects(projects, limit, run);
    } catch (error) {
      if (disposed || paused || run !== generation || error?.name === 'AbortError') return [];
      list.replaceChildren();
      list.hidden = true;
      setStatus('保存した作品を表示できません。作品一覧から開いてください。');
      return [];
    }
  }

  function handleResize() {
    if (disposed || paused) return;
    const nextLimit = effectiveLimit(max, win);
    if (currentLimit !== nextLimit) void refresh();
    else checkFallbackVisibility();
  }

  function handlePageHide() {
    paused = true;
    generation++;
    abortController?.abort?.();
    abortController = null;
    disconnectCanvases();
  }

  function handlePageShow() {
    if (disposed) return;
    paused = false;
    void refresh();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    generation++;
    abortController?.abort?.();
    abortController = null;
    disconnectCanvases();
    win?.removeEventListener?.('resize', handleResize);
    win?.removeEventListener?.('pagehide', handlePageHide);
    win?.removeEventListener?.('pageshow', handlePageShow);
  }

  win?.addEventListener?.('resize', handleResize, { passive: true });
  win?.addEventListener?.('pagehide', handlePageHide);
  win?.addEventListener?.('pageshow', handlePageShow);
  void refresh();
  return { refresh, dispose };
}
