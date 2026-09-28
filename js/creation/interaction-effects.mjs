const MAX_NOTES = 4;
const FALLBACK_MS = 260;
const VIEWPORT_MARGIN = 1;

function isElement(value) {
  return Boolean(value && typeof value.getBoundingClientRect === 'function' && value.nodeType === 1);
}

function rectOf(value) {
  try {
    const rect = isElement(value) ? (value.getClientRects().length ? value.getBoundingClientRect() : null) : value;
    if (!rect) return null;
    const left = Number(rect.left); const top = Number(rect.top);
    const width = Number(rect.width); const height = Number(rect.height);
    const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width;
    const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height;
    if (![left, top, width, height, right, bottom].every(Number.isFinite) || width <= 0 || height <= 0 || right <= left || bottom <= top) return null;
    return { left, top, right, bottom, width, height };
  } catch { return null; }
}

function centerOf(rect) { return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }
function containsPoint(rect, point) { return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom; }
function pointInViewport(point) {
  if (typeof window === 'undefined') return false;
  return point.x > VIEWPORT_MARGIN && point.y > VIEWPORT_MARGIN
    && point.x < Number(window.innerWidth) - VIEWPORT_MARGIN && point.y < Number(window.innerHeight) - VIEWPORT_MARGIN;
}
function intersectsViewport(rect) {
  if (typeof window === 'undefined') return false;
  const width = Number(window.innerWidth); const height = Number(window.innerHeight);
  return Number.isFinite(width) && Number.isFinite(height)
    && rect.right > VIEWPORT_MARGIN && rect.bottom > VIEWPORT_MARGIN
    && rect.left < width - VIEWPORT_MARGIN && rect.top < height - VIEWPORT_MARGIN;
}

function validColor(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80) return false;
  try { return Boolean(globalThis.CSS?.supports?.('color', value)); } catch { return false; }
}

/** Small, decorative effects for existing Draw and Jigsaw controls. It never changes source pixels or game state. */
export function createInteractionEffects() {
  let host = null; const layers = new WeakMap(); let notePool = null; let colorNode = null; let exportNode = null; let settleNode = null;
  let exportCanvas = null; let exportContext = null; let noteCursor = 0; let listenersReady = false;
  const timers = new Map();

  function reducedMotion() {
    try {
      return document.documentElement.dataset.pixieedMotion === 'reduced'
        || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    } catch { return true; }
  }

  function visibleHost(candidate) {
    try {
      if (!isElement(candidate) || !candidate.isConnected || candidate.hidden || candidate.closest('[hidden]')) return false;
      const rect = rectOf(candidate);
      if (!rect || !intersectsViewport(rect)) return false;
      const style = globalThis.getComputedStyle?.(candidate);
      return style?.display !== 'none' && style?.visibility !== 'hidden' && style?.contentVisibility !== 'hidden';
    } catch { return false; }
  }

  function finish(node) {
    const timer = timers.get(node);
    if (timer) globalThis.clearTimeout(timer);
    timers.delete(node);
    node.dataset.active = 'false';
    node.hidden = true;
  }

  function clear() {
    for (const node of timers.keys()) finish(node);
    if (exportContext && exportCanvas) {
      try { exportContext.clearRect(0, 0, exportCanvas.width, exportCanvas.height); } catch { /* Cosmetic cleanup only. */ }
    }
    return true;
  }

  function ensureListeners() {
    if (listenersReady || typeof document === 'undefined' || typeof window === 'undefined') return;
    listenersReady = true;
    const stop = () => clear();
    window.addEventListener('resize', stop, { passive: true });
    window.addEventListener('scroll', stop, { passive: true });
    document.addEventListener('scroll', stop, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    window.addEventListener('pagehide', stop, { once: true });
    const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (motion?.addEventListener) motion.addEventListener('change', (event) => { if (event.matches) stop(); });
    else motion?.addListener?.((event) => { if (event.matches) stop(); });
    if (typeof MutationObserver === 'function' && document.documentElement) {
      const observer = new MutationObserver(() => { if (reducedMotion()) stop(); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-pixieed-motion'] });
    }
  }

  function ensureLayer(candidate) {
    try {
      if (!visibleHost(candidate) || reducedMotion()) return null;
      ensureListeners();
      host = candidate; host.classList.add('px-fx-host');
      if (globalThis.getComputedStyle?.(host)?.position === 'static') host.dataset.pxFxContainingBlock = 'true';
      let layer = layers.get(host);
      if (!layer) {
        layer = document.createElement('div'); layer.className = 'px-fx-layer'; layer.setAttribute('aria-hidden', 'true');
        layers.set(host, layer);
      }
      // Renderers such as Jigsaw replace board children after each accepted
      // placement. Reattach the cached layer so later effects remain visible.
      if (layer.parentNode !== host) host.append(layer);
      return layer;
    } catch { return null; }
  }

  function addNode(className, targetLayer) {
    try {
      const node = document.createElement(className === 'px-fx-export' ? 'canvas' : 'span');
      node.className = className; node.hidden = true; node.dataset.active = 'false';
      node.setAttribute('aria-hidden', 'true');
      node.addEventListener('animationend', (event) => {
        if (event.target === node && event.animationName === node.dataset.animation) finish(node);
      });
      targetLayer.append(node);
      return node;
    } catch { return null; }
  }

  function attachNode(node, targetLayer) {
    if (!node || !targetLayer) return false;
    if (node.parentNode !== targetLayer) {
      if (timers.has(node)) finish(node);
      targetLayer.append(node);
    }
    return true;
  }

  function play(node, family, duration, targetLayer) {
    if (!node) return false;
    try {
      if (!attachNode(node, targetLayer)) return false;
      const oldTimer = timers.get(node);
      if (oldTimer) globalThis.clearTimeout(oldTimer);
      const phase = node.dataset.phase === 'a' ? 'b' : 'a';
      node.dataset.phase = phase;
      node.dataset.animation = `px-fx-${family}-${phase}`;
      node.hidden = false;
      node.dataset.active = 'true';
      timers.set(node, globalThis.setTimeout(() => finish(node), Math.min(FALLBACK_MS, duration + 40)));
      return true;
    } catch { finish(node); return false; }
  }

  function pool(targetLayer) {
    if (notePool) return notePool;
    notePool = Array.from({ length: MAX_NOTES }, () => {
      const node = addNode('px-fx-note', targetLayer);
      if (node) node.dataset.corner = '';
      return node;
    });
    return notePool;
  }

  function hostFor(...targets) {
    for (const target of targets) {
      if (!isElement(target)) continue;
      // Flights cross from the canvas to page controls. A canvas-only layer
      // cannot contain their destination; note/settle choose that local host.
      const found = target.closest('.draw-page, .jigsaw-page, .audio-page');
      if (found) return found;
    }
    return document.querySelector('.draw-page, .jigsaw-page, .audio-page') || host;
  }

  function endpoint(target, hostRect) {
    const rect = rectOf(target);
    if (!rect || !intersectsViewport(rect)) return null;
    const point = centerOf(rect);
    if (!containsPoint(hostRect, point) || !pointInViewport(point)) return null;
    return point;
  }

  function note({ canvas, host: requestedHost, x, y, columns, rows, color, canvasRect, hostRect } = {}) {
    try {
      const targetHost = requestedHost;
      const targetLayer = ensureLayer(targetHost);
      if (!targetLayer || !isElement(canvas) || !validColor(color)) return false;
      if (!Number.isInteger(columns) || columns < 1 || columns > 128 || !Number.isInteger(rows) || rows < 1 || rows > 128
        || !Number.isInteger(x) || x < 0 || x >= columns || !Number.isInteger(y) || y < 0 || y >= rows) return false;
      const drawRect = rectOf(canvasRect || canvas); const containerRect = rectOf(hostRect || targetHost);
      if (!drawRect || !containerRect) return false;
      const center = { x: drawRect.left + (x + .5) * drawRect.width / columns, y: drawRect.top + (y + .5) * drawRect.height / rows };
      if (!intersectsViewport(drawRect) || !containsPoint(containerRect, center) || !pointInViewport(center)) return false;
      const slotNodes = pool(targetLayer); if (slotNodes.some((node) => !node)) return false;
      const cellWidth = drawRect.width / columns; const cellHeight = drawRect.height / rows;
      const layerRect = containerRect;
      const node = slotNodes[noteCursor++ % MAX_NOTES];
      const cornerSize = Math.max(2, Math.min(9, cellWidth * .45, cellHeight * .45));
      node.style.left = `${drawRect.left + x * cellWidth - layerRect.left - targetHost.clientLeft}px`;
      node.style.top = `${drawRect.top + y * cellHeight - layerRect.top - targetHost.clientTop}px`;
      node.style.width = `${cellWidth}px`; node.style.height = `${cellHeight}px`;
      node.style.setProperty('--px-fx-corner-size', `${cornerSize}px`); node.style.setProperty('--px-fx-color', color);
      return play(node, 'note', 220, targetLayer);
    } catch { return false; }
  }

  function color({ from, to, color: value } = {}) {
    try {
      const targetHost = hostFor(from, to); const targetLayer = ensureLayer(targetHost);
      if (!targetLayer || !validColor(value)) return false;
      const containerRect = rectOf(targetHost); const start = endpoint(from, containerRect); const end = endpoint(to, containerRect);
      if (!start || !end) return false;
      if (!colorNode) colorNode = addNode('px-fx-color', targetLayer);
      if (!colorNode) return false;
      const layerRect = rectOf(targetHost);
      colorNode.style.left = `${start.x - layerRect.left - targetHost.clientLeft}px`; colorNode.style.top = `${start.y - layerRect.top - targetHost.clientTop}px`;
      colorNode.style.setProperty('--px-fx-dx', `${end.x - start.x}px`); colorNode.style.setProperty('--px-fx-dy', `${end.y - start.y}px`);
      colorNode.style.setProperty('--px-fx-color', value);
      return play(colorNode, 'color', 220, targetLayer);
    } catch { return false; }
  }

  function exportImage({ from, to, image } = {}) {
    try {
      const targetHost = hostFor(from, to); const targetLayer = ensureLayer(targetHost);
      if (!targetLayer) return false;
      const containerRect = rectOf(targetHost); const start = endpoint(from, containerRect); const end = endpoint(to, containerRect);
      if (!start || !end || !image || !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width < 1 || image.height < 1) return false;
      if (!exportNode) {
        exportNode = addNode('px-fx-export', targetLayer); exportCanvas = exportNode;
        exportCanvas.width = 64; exportCanvas.height = 64;
        exportContext = exportCanvas.getContext('2d', { alpha: true });
      }
      if (!exportCanvas || !exportContext) return false;
      const scale = Math.min(64 / image.width, 64 / image.height);
      const width = Math.max(1, Math.round(image.width * scale)); const height = Math.max(1, Math.round(image.height * scale));
      exportContext.clearRect(0, 0, 64, 64); exportContext.imageSmoothingEnabled = false;
      exportContext.drawImage(image, 0, 0, image.width, image.height, Math.floor((64 - width) / 2), Math.floor((64 - height) / 2), width, height);
      const layerRect = rectOf(targetHost);
      exportCanvas.style.left = `${start.x - layerRect.left - targetHost.clientLeft}px`; exportCanvas.style.top = `${start.y - layerRect.top - targetHost.clientTop}px`;
      exportCanvas.style.setProperty('--px-fx-dx', `${end.x - start.x}px`); exportCanvas.style.setProperty('--px-fx-dy', `${end.y - start.y}px`);
      return play(exportCanvas, 'export', 240, targetLayer);
    } catch { return false; }
  }

  function settle(element, { color: value = '#79a965' } = {}) {
    try {
      const targetHost = isElement(element) ? (element.closest('.jigsaw-board, .jigsaw-page') || hostFor(element)) : hostFor(element);
      const targetLayer = ensureLayer(targetHost);
      if (!targetLayer || !validColor(value)) return false;
      const targetRect = rectOf(element); const layerRect = rectOf(targetHost);
      if (!targetRect || !layerRect || targetRect.width > 512 || targetRect.height > 512) return false;
      const center = centerOf(targetRect);
      if (!intersectsViewport(targetRect) || !containsPoint(layerRect, center) || !pointInViewport(center)) return false;
      if (!settleNode) settleNode = addNode('px-fx-settle', targetLayer);
      if (!settleNode) return false;
      settleNode.style.left = `${targetRect.left - layerRect.left - targetHost.clientLeft}px`; settleNode.style.top = `${targetRect.top - layerRect.top - targetHost.clientTop}px`;
      settleNode.style.width = `${targetRect.width}px`; settleNode.style.height = `${targetRect.height}px`;
      settleNode.style.setProperty('--px-fx-color', value);
      return play(settleNode, 'settle', 220, targetLayer);
    } catch { return false; }
  }

  return { note, color, exportImage, settle, clear };
}
