(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const STORAGE_KEY_ENABLED = 'pixieedraw:local-extension:enabled';
  const STORAGE_KEY_CODE = 'pixieedraw:local-extension:code';
  const STORAGE_KEY_OPEN = 'pixieedraw:local-extension:open';
  const LOCAL_TOOL_MAX_COUNT = 24;
  const LOCAL_PAINT_BATCH_MAX = 32768;

  const TEMPLATE_CODE = [
    "api.on('init', (ctx) => {",
    "  api.toast('ローカル拡張を起動しました', 'success');",
    "  api.badge('Local Ext ON');",
    "  api.panel('ローカル拡張', 'この表示はあなたの端末だけです。');",
    "  api.registerTool({ id: 'stamp8', label: '8x8 Stamp', hint: 'ローカル描画だけ実行' });",
    "  api.activateTool('stamp8');",
    "  api.capturePointer(true);",
    '});',
    '',
    "api.on('tool:pointerdown', (event) => {",
    "  if (event.toolId !== 'stamp8' || !event.cell || !event.cell.inside) return;",
    "  const { x, y } = event.cell;",
    "  const pixels = [];",
    "  for (let py = 0; py < 8; py += 1) {",
    "    for (let px = 0; px < 8; px += 1) {",
    "      pixels.push({ x: x + px, y: y + py });",
    '    }',
    '  }',
    "  api.drawPixels(pixels, { r: 88, g: 196, b: 255, a: 180 });",
    "  api.toast('8x8 ローカル描画', 'info');",
    '});',
    '',
    "api.on('keydown', (event) => {",
    "  if (event.key === 'F8') {",
    "    api.toast('F8 が押されました', 'info');",
    "    api.clearPixels();",
    '  }',
    '});',
  ].join('\n');

  const runtimeState = {
    enabled: false,
    code: '',
    frame: null,
    frameReady: false,
    messageQueue: [],
    intervalTimer: null,
    ui: null,
    localTools: new Map(),
    localToolOrder: [],
    activeLocalToolId: '',
    captureCanvasPointer: false,
    trackedPointerId: null,
    localOverlayCanvas: null,
    localOverlayCtx: null,
    localInputLayer: null,
    localOverlayObserver: null,
    localPaintMap: new Map(),
  };

  const SANDBOX_SRC = String.raw`<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script>
(() => {
  const HOST_MARK = '__pixieLocalHost';
  const EXT_MARK = '__pixieLocalExt';
  const handlers = new Map();
  let latestContext = Object.freeze({});

  function post(type, payload) {
    parent.postMessage({ [EXT_MARK]: 1, type, payload }, '*');
  }

  function on(eventName, handler) {
    if (typeof eventName !== 'string' || typeof handler !== 'function') {
      return;
    }
    const list = handlers.get(eventName) || [];
    list.push(handler);
    handlers.set(eventName, list);
  }

  function emit(eventName, payload) {
    const list = handlers.get(eventName) || [];
    for (const handler of list) {
      try {
        handler(payload);
      } catch (error) {
        post('status', {
          ok: false,
          message: '[handler:' + eventName + '] ' + (error && error.message ? error.message : String(error)),
        });
      }
    }
  }

  function clearHandlers() {
    handlers.clear();
  }

  const api = Object.freeze({
    on,
    toast(message, level = 'info') {
      post('toast', { message: String(message || ''), level: String(level || 'info') });
    },
    badge(text = '') {
      post('badge', { text: String(text || '') });
    },
    panel(title = '', body = '') {
      post('panel', { title: String(title || ''), body: String(body || '') });
    },
    registerTool(tool) {
      post('tool-register', { tool });
    },
    unregisterTool(id) {
      post('tool-unregister', { id: String(id || '') });
    },
    clearTools() {
      post('tools-clear', {});
    },
    activateTool(id) {
      post('tool-activate', { id: String(id || '') });
    },
    capturePointer(enabled = true) {
      post('pointer-capture', { enabled: Boolean(enabled) });
    },
    drawPixels(pixels, color) {
      post('local-paint', { pixels, color });
    },
    clearPixels() {
      post('local-paint-clear', {});
    },
    getContext() {
      return latestContext;
    },
    log(...values) {
      post('log', { values: values.map(value => {
        try {
          if (typeof value === 'string') return value;
          return JSON.stringify(value);
        } catch (_) {
          return String(value);
        }
      }) });
    },
  });

  window.addEventListener('message', (event) => {
    const data = event && event.data;
    if (!data || data[HOST_MARK] !== 1) {
      return;
    }
    if (data.type === 'load') {
      clearHandlers();
      latestContext = Object.freeze(data.context && typeof data.context === 'object' ? data.context : {});
      try {
        const fn = new Function('api', '"use strict";\n' + String(data.code || '') + '\n//# sourceURL=pixieed-local-extension.js');
        fn(api);
        emit('init', latestContext);
        post('status', { ok: true, message: 'Local extension loaded' });
      } catch (error) {
        post('status', {
          ok: false,
          message: error && error.message ? error.message : String(error),
        });
      }
      return;
    }
    if (data.type === 'unload') {
      clearHandlers();
      post('status', { ok: true, message: 'Local extension stopped' });
      return;
    }
    if (data.type === 'event') {
      if (data.name === 'context') {
        latestContext = Object.freeze(data.payload && typeof data.payload === 'object' ? data.payload : {});
      }
      emit(String(data.name || 'event'), data.payload);
    }
  });

  post('ready', {});
})();
</script>
</body></html>`;

  function readStorage(key, fallback = '') {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // ignore
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // ignore
    }
  }

  function sanitizeText(value, limit = 1200) {
    return String(value || '').replace(/\s+$/g, '').slice(0, limit);
  }

  function normalizeToolId(value) {
    const base = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 32);
    return base || '';
  }

  function normalizeToolDefinition(tool) {
    if (!tool || typeof tool !== 'object') {
      return null;
    }
    const id = normalizeToolId(tool.id);
    if (!id) {
      return null;
    }
    const label = sanitizeText(tool.label || id, 36) || id;
    const hint = sanitizeText(tool.hint || '', 120);
    return { id, label, hint };
  }

  function clampNumber(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return min;
    }
    return Math.min(max, Math.max(min, num));
  }

  function normalizePaintColor(color) {
    const source = color && typeof color === 'object' ? color : {};
    const r = Math.round(clampNumber(source.r, 0, 255));
    const g = Math.round(clampNumber(source.g, 0, 255));
    const b = Math.round(clampNumber(source.b, 0, 255));
    let alpha = Number(source.a);
    if (!Number.isFinite(alpha)) {
      alpha = 255;
    }
    if (alpha >= 0 && alpha <= 1) {
      alpha *= 255;
    }
    const a = Math.round(clampNumber(alpha, 0, 255));
    return {
      key: `${r},${g},${b},${a}`,
      css: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
      a,
    };
  }

  function parsePixelCoordinate(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return null;
    }
    return Math.trunc(num);
  }

  function getCanvasDomRefs() {
    const viewport = document.getElementById('canvasViewport');
    const stack = document.getElementById('canvasStack');
    const drawing = document.getElementById('drawingCanvas');
    const selection = document.getElementById('selectionCanvas');
    if (!(viewport instanceof HTMLElement) || !(stack instanceof HTMLElement) || !(drawing instanceof HTMLCanvasElement)) {
      return null;
    }
    return {
      viewport,
      stack,
      drawing,
      selection: selection instanceof HTMLCanvasElement ? selection : null,
    };
  }

  function clearLocalPaintOverlaySurface() {
    const canvas = runtimeState.localOverlayCanvas;
    const ctx = runtimeState.localOverlayCtx;
    if (!(canvas instanceof HTMLCanvasElement) || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function repaintLocalPaintOverlay() {
    const canvas = runtimeState.localOverlayCanvas;
    const ctx = runtimeState.localOverlayCtx;
    if (!(canvas instanceof HTMLCanvasElement) || !ctx) {
      return;
    }
    clearLocalPaintOverlaySurface();
    if (!runtimeState.localPaintMap.size) {
      return;
    }
    let lastColor = '';
    for (const [key, paint] of runtimeState.localPaintMap.entries()) {
      if (!paint || typeof paint.css !== 'string') {
        continue;
      }
      const comma = key.indexOf(',');
      if (comma <= 0) {
        continue;
      }
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        continue;
      }
      if (paint.css !== lastColor) {
        ctx.fillStyle = paint.css;
        lastColor = paint.css;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function pruneLocalPaintOutsideBounds(width, height) {
    if (!runtimeState.localPaintMap.size) {
      return false;
    }
    let changed = false;
    const maxX = Math.max(0, Number(width) - 1);
    const maxY = Math.max(0, Number(height) - 1);
    for (const key of Array.from(runtimeState.localPaintMap.keys())) {
      const comma = key.indexOf(',');
      if (comma <= 0) {
        runtimeState.localPaintMap.delete(key);
        changed = true;
        continue;
      }
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > maxX || y > maxY) {
        runtimeState.localPaintMap.delete(key);
        changed = true;
      }
    }
    return changed;
  }

  function syncLocalCanvasGeometry({ forceRepaint = false } = {}) {
    const refs = getCanvasDomRefs();
    const overlay = runtimeState.localOverlayCanvas;
    if (!refs || !(overlay instanceof HTMLCanvasElement)) {
      return;
    }
    const width = Math.max(1, Math.trunc(Number(refs.drawing.width) || 1));
    const height = Math.max(1, Math.trunc(Number(refs.drawing.height) || 1));
    const sizeChanged = overlay.width !== width || overlay.height !== height;
    if (sizeChanged) {
      overlay.width = width;
      overlay.height = height;
    }
    const styleWidth = refs.drawing.style.width || `${Math.max(1, refs.drawing.clientWidth || width)}px`;
    const styleHeight = refs.drawing.style.height || `${Math.max(1, refs.drawing.clientHeight || height)}px`;
    overlay.style.width = styleWidth;
    overlay.style.height = styleHeight;
    const inputLayer = runtimeState.localInputLayer;
    if (inputLayer instanceof HTMLElement) {
      inputLayer.style.width = styleWidth;
      inputLayer.style.height = styleHeight;
    }
    const pruned = pruneLocalPaintOutsideBounds(width, height);
    if (sizeChanged || pruned || forceRepaint) {
      repaintLocalPaintOverlay();
    }
  }

  function ensureLocalOverlayCanvas() {
    const refs = getCanvasDomRefs();
    if (!refs) {
      return null;
    }
    let canvas = runtimeState.localOverlayCanvas;
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) {
      canvas = document.createElement('canvas');
      canvas.id = 'localExtensionOverlayCanvas';
      canvas.className = 'local-ext-overlay-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      const insertionPoint = refs.selection && refs.selection.parentElement === refs.stack ? refs.selection : null;
      refs.stack.insertBefore(canvas, insertionPoint);
      runtimeState.localOverlayCanvas = canvas;
      runtimeState.localOverlayCtx = canvas.getContext('2d');
    } else if (canvas.parentElement !== refs.stack) {
      const insertionPoint = refs.selection && refs.selection.parentElement === refs.stack ? refs.selection : null;
      refs.stack.insertBefore(canvas, insertionPoint);
    }
    syncLocalCanvasGeometry({ forceRepaint: true });
    return canvas;
  }

  function ensureLocalInputLayer() {
    const refs = getCanvasDomRefs();
    if (!refs) {
      return null;
    }
    let layer = runtimeState.localInputLayer;
    if (!(layer instanceof HTMLDivElement) || !layer.isConnected) {
      layer = document.createElement('div');
      layer.id = 'localExtensionInputLayer';
      layer.className = 'local-ext-input-layer';
      layer.setAttribute('aria-hidden', 'true');
      refs.stack.appendChild(layer);
      runtimeState.localInputLayer = layer;
    } else if (layer.parentElement !== refs.stack) {
      refs.stack.appendChild(layer);
    }
    syncLocalCanvasGeometry();
    return layer;
  }

  function shouldCaptureCanvasPointer() {
    return runtimeState.enabled && runtimeState.captureCanvasPointer && Boolean(runtimeState.activeLocalToolId);
  }

  function updateLocalInputLayerState() {
    const layer = ensureLocalInputLayer();
    if (!(layer instanceof HTMLDivElement)) {
      return;
    }
    const active = shouldCaptureCanvasPointer();
    layer.classList.toggle('is-active', active);
    layer.hidden = !active;
    layer.style.pointerEvents = active ? 'auto' : 'none';
  }

  function clearLocalPaintPixels() {
    runtimeState.localPaintMap.clear();
    clearLocalPaintOverlaySurface();
  }

  function paintLocalPixels(pixels, color) {
    ensureLocalOverlayCanvas();
    syncLocalCanvasGeometry();
    const canvas = runtimeState.localOverlayCanvas;
    const ctx = runtimeState.localOverlayCtx;
    if (!(canvas instanceof HTMLCanvasElement) || !ctx) {
      return 0;
    }
    if (!Array.isArray(pixels) || !pixels.length) {
      return 0;
    }
    const normalizedColor = normalizePaintColor(color);
    let painted = 0;
    const limit = Math.min(LOCAL_PAINT_BATCH_MAX, pixels.length);
    for (let i = 0; i < limit; i += 1) {
      const pixel = pixels[i];
      if (!pixel || typeof pixel !== 'object') {
        continue;
      }
      const x = parsePixelCoordinate(pixel.x);
      const y = parsePixelCoordinate(pixel.y);
      if (x === null || y === null) {
        continue;
      }
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        continue;
      }
      const key = `${x},${y}`;
      if (normalizedColor.a <= 0) {
        if (runtimeState.localPaintMap.delete(key)) {
          ctx.clearRect(x, y, 1, 1);
          painted += 1;
        }
        continue;
      }
      runtimeState.localPaintMap.set(key, {
        key: normalizedColor.key,
        css: normalizedColor.css,
      });
      ctx.fillStyle = normalizedColor.css;
      ctx.fillRect(x, y, 1, 1);
      painted += 1;
    }
    return painted;
  }

  function getToolPointerPayload(event, refs, trackedByPointer) {
    if (!refs) {
      return null;
    }
    const rect = refs.drawing.getBoundingClientRect();
    const width = Math.max(1, Math.trunc(Number(refs.drawing.width) || 1));
    const height = Math.max(1, Math.trunc(Number(refs.drawing.height) || 1));
    const safeRectWidth = rect.width > 0 ? rect.width : width;
    const safeRectHeight = rect.height > 0 ? rect.height : height;
    const rawX = ((event.clientX - rect.left) / safeRectWidth) * width;
    const rawY = ((event.clientY - rect.top) / safeRectHeight) * height;
    const x = Math.floor(rawX);
    const y = Math.floor(rawY);
    const clampedX = Math.min(width - 1, Math.max(0, x));
    const clampedY = Math.min(height - 1, Math.max(0, y));
    const inside = rawX >= 0 && rawY >= 0 && rawX < width && rawY < height;
    const target = event.target instanceof HTMLElement ? event.target : null;
    return {
      toolId: runtimeState.activeLocalToolId,
      pointerId: event.pointerId,
      pointerType: String(event.pointerType || ''),
      button: event.button,
      buttons: event.buttons,
      pressure: Number.isFinite(event.pressure) ? event.pressure : 0,
      isPrimary: Boolean(event.isPrimary),
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      trackedByPointer: Boolean(trackedByPointer),
      now: Date.now(),
      targetId: target ? target.id || '' : '',
      targetClass: target ? sanitizeText(target.className || '', 160) : '',
      client: { x: Math.round(event.clientX), y: Math.round(event.clientY) },
      cell: {
        x,
        y,
        clampedX,
        clampedY,
        inside,
        width,
        height,
      },
    };
  }

  function buildLocalToolSummary() {
    return runtimeState.localToolOrder
      .map(id => runtimeState.localTools.get(id))
      .filter(Boolean)
      .map(tool => ({ id: tool.id, label: tool.label, hint: tool.hint }));
  }

  function dispatchLocalToolChangeEvent() {
    dispatchEventToRuntime('toolchange', {
      activeToolId: runtimeState.activeLocalToolId || '',
      capturePointer: Boolean(runtimeState.captureCanvasPointer),
      tools: buildLocalToolSummary(),
    });
  }

  function renderLocalToolButtons() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.toolList instanceof HTMLElement)) {
      return;
    }
    ui.toolList.innerHTML = '';
    const tools = runtimeState.localToolOrder
      .map(id => runtimeState.localTools.get(id))
      .filter(Boolean);
    if (!tools.length) {
      const empty = document.createElement('p');
      empty.className = 'help-text local-ext-panel__tool-empty';
      empty.textContent = '拡張コードから api.registerTool(...) で追加できます。';
      ui.toolList.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    tools.forEach(tool => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip local-ext-tool-button';
      button.dataset.toolId = tool.id;
      button.textContent = tool.label;
      if (tool.hint) {
        button.title = tool.hint;
      }
      const isActive = runtimeState.activeLocalToolId === tool.id;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.addEventListener('click', () => {
        setActiveLocalToolId(tool.id, { notifyRuntime: true });
      });
      fragment.appendChild(button);
    });
    ui.toolList.appendChild(fragment);
  }

  function renderLocalToolMeta() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.toolMeta instanceof HTMLElement)) {
      return;
    }
    const active = runtimeState.activeLocalToolId
      ? runtimeState.localTools.get(runtimeState.activeLocalToolId)
      : null;
    const activeLabel = active ? active.label : 'なし';
    const captureLabel = runtimeState.captureCanvasPointer ? 'ON' : 'OFF';
    ui.toolMeta.textContent = `選択中: ${activeLabel} / キャンバス入力取得: ${captureLabel}`;
  }

  function setActiveLocalToolId(toolId, { notifyRuntime = false } = {}) {
    const next = normalizeToolId(toolId);
    const hasNext = next && runtimeState.localTools.has(next);
    const resolved = hasNext ? next : '';
    if (runtimeState.activeLocalToolId === resolved) {
      renderLocalToolButtons();
      renderLocalToolMeta();
      updateLocalInputLayerState();
      return;
    }
    runtimeState.activeLocalToolId = resolved;
    runtimeState.trackedPointerId = null;
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    if (notifyRuntime) {
      dispatchEventToRuntime('tool:activate', {
        id: runtimeState.activeLocalToolId || '',
      });
      dispatchLocalToolChangeEvent();
    }
  }

  function clearLocalTools({ notifyRuntime = true } = {}) {
    runtimeState.localTools.clear();
    runtimeState.localToolOrder = [];
    runtimeState.activeLocalToolId = '';
    runtimeState.captureCanvasPointer = false;
    runtimeState.trackedPointerId = null;
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    if (notifyRuntime) {
      dispatchLocalToolChangeEvent();
    }
  }

  function registerLocalTool(tool, { notifyRuntime = true } = {}) {
    const normalized = normalizeToolDefinition(tool);
    if (!normalized) {
      return false;
    }
    if (!runtimeState.localTools.has(normalized.id)) {
      if (runtimeState.localToolOrder.length >= LOCAL_TOOL_MAX_COUNT) {
        setStatus(`ローカルツールは最大 ${LOCAL_TOOL_MAX_COUNT} 件までです`, 'warn');
        return false;
      }
      runtimeState.localToolOrder.push(normalized.id);
    }
    runtimeState.localTools.set(normalized.id, normalized);
    if (!runtimeState.activeLocalToolId) {
      runtimeState.activeLocalToolId = normalized.id;
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    if (notifyRuntime) {
      dispatchLocalToolChangeEvent();
    }
    return true;
  }

  function unregisterLocalTool(toolId, { notifyRuntime = true } = {}) {
    const normalizedId = normalizeToolId(toolId);
    if (!normalizedId || !runtimeState.localTools.has(normalizedId)) {
      return false;
    }
    runtimeState.localTools.delete(normalizedId);
    runtimeState.localToolOrder = runtimeState.localToolOrder.filter(id => id !== normalizedId);
    if (runtimeState.activeLocalToolId === normalizedId) {
      runtimeState.activeLocalToolId = runtimeState.localToolOrder[0] || '';
      runtimeState.trackedPointerId = null;
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    if (notifyRuntime) {
      dispatchLocalToolChangeEvent();
    }
    return true;
  }

  function makeContextSnapshot() {
    const activeTool = document.querySelector('.tool-button.is-active')?.getAttribute('data-tool') || '';
    const activeLeft = document.querySelector('.rail-tab[data-left-tab][aria-selected="true"]')?.getAttribute('data-left-tab') || '';
    const activeRight = document.querySelector('.rail-tab[data-right-tab][aria-selected="true"]')?.getAttribute('data-right-tab') || '';
    const multiStatusText = (document.getElementById('multiStatus')?.textContent || '').trim();
    return {
      href: window.location.href,
      language: (document.documentElement.lang || 'ja').toLowerCase(),
      now: Date.now(),
      isMobileLayout: document.body.classList.contains('is-mobile-layout'),
      activeTool,
      activeLeftTab: activeLeft,
      activeRightTab: activeRight,
      multiStatus: multiStatusText,
      isMultiActive: !/off|OFF|オフ/.test(multiStatusText),
      localToolCount: runtimeState.localToolOrder.length,
      activeLocalToolId: runtimeState.activeLocalToolId || '',
      localToolCapture: Boolean(runtimeState.captureCanvasPointer),
      localPaintPixelCount: runtimeState.localPaintMap.size,
    };
  }

  function setStatus(message, kind = 'info') {
    const ui = runtimeState.ui;
    if (!ui || !(ui.status instanceof HTMLElement)) {
      return;
    }
    ui.status.textContent = sanitizeText(message, 300);
    ui.status.dataset.kind = kind;
  }

  function setOutput(title = '', body = '') {
    const ui = runtimeState.ui;
    if (!ui || !(ui.outputTitle instanceof HTMLElement) || !(ui.outputBody instanceof HTMLElement)) {
      return;
    }
    ui.outputTitle.textContent = sanitizeText(title, 80);
    ui.outputBody.textContent = sanitizeText(body, 1800);
  }

  function setBadge(text) {
    const ui = runtimeState.ui;
    if (!ui || !(ui.badge instanceof HTMLElement)) {
      return;
    }
    const label = sanitizeText(text, 160);
    ui.badge.textContent = label;
    ui.badge.classList.toggle('is-visible', Boolean(label));
  }

  function destroySandboxFrame() {
    if (runtimeState.frame instanceof HTMLIFrameElement) {
      runtimeState.frame.remove();
    }
    runtimeState.frame = null;
    runtimeState.frameReady = false;
    runtimeState.messageQueue = [];
  }

  function ensureSandboxFrame() {
    if (runtimeState.frame instanceof HTMLIFrameElement) {
      return runtimeState.frame;
    }
    const iframe = document.createElement('iframe');
    iframe.className = 'local-ext-runtime-frame';
    iframe.setAttribute('title', 'Local extension sandbox');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.srcdoc = SANDBOX_SRC;
    iframe.hidden = true;
    iframe.addEventListener('load', () => {
      runtimeState.frameReady = true;
      flushQueuedMessages();
    });
    document.body.appendChild(iframe);
    runtimeState.frame = iframe;
    runtimeState.frameReady = false;
    runtimeState.messageQueue = [];
    return iframe;
  }

  function postToSandbox(type, payload = {}) {
    const frame = ensureSandboxFrame();
    const packet = {
      __pixieLocalHost: 1,
      type,
      ...payload,
    };
    if (!runtimeState.frameReady || !(frame.contentWindow instanceof Window)) {
      runtimeState.messageQueue.push(packet);
      return;
    }
    frame.contentWindow.postMessage(packet, '*');
  }

  function flushQueuedMessages() {
    const frame = runtimeState.frame;
    if (!(frame instanceof HTMLIFrameElement) || !(frame.contentWindow instanceof Window) || !runtimeState.frameReady) {
      return;
    }
    const queued = runtimeState.messageQueue.slice();
    runtimeState.messageQueue = [];
    queued.forEach(packet => {
      frame.contentWindow.postMessage(packet, '*');
    });
  }

  function unloadRuntime() {
    if (runtimeState.frame instanceof HTMLIFrameElement && runtimeState.frameReady) {
      postToSandbox('unload');
    }
    destroySandboxFrame();
    if (runtimeState.intervalTimer !== null) {
      window.clearInterval(runtimeState.intervalTimer);
      runtimeState.intervalTimer = null;
    }
    clearLocalTools({ notifyRuntime: false });
    clearLocalPaintPixels();
    updateLocalInputLayerState();
    setBadge('');
  }

  function dispatchEventToRuntime(name, payload) {
    if (!runtimeState.enabled) {
      return;
    }
    postToSandbox('event', {
      name,
      payload,
    });
  }

  function startRuntime() {
    if (!runtimeState.enabled) {
      return;
    }
    const code = String(runtimeState.code || '').trim();
    if (!code) {
      setStatus('拡張コードが空です', 'warn');
      setBadge('');
      return;
    }
    unloadRuntime();
    syncLocalCanvasGeometry();
    ensureSandboxFrame();
    postToSandbox('load', {
      code,
      context: makeContextSnapshot(),
    });
    dispatchEventToRuntime('context', makeContextSnapshot());
    if (runtimeState.intervalTimer !== null) {
      window.clearInterval(runtimeState.intervalTimer);
    }
    runtimeState.intervalTimer = window.setInterval(() => {
      syncLocalCanvasGeometry();
      const snapshot = makeContextSnapshot();
      dispatchEventToRuntime('context', snapshot);
      dispatchEventToRuntime('interval', {
        now: Date.now(),
        context: snapshot,
      });
    }, 1500);
  }

  function reloadRuntime() {
    if (!runtimeState.enabled) {
      unloadRuntime();
      setStatus('ローカル拡張はOFFです', 'info');
      return;
    }
    startRuntime();
  }

  function setEnabled(enabled, { persist = true, restart = true } = {}) {
    runtimeState.enabled = Boolean(enabled);
    if (runtimeState.ui?.enabled instanceof HTMLInputElement) {
      runtimeState.ui.enabled.checked = runtimeState.enabled;
    }
    if (persist) {
      writeStorage(STORAGE_KEY_ENABLED, runtimeState.enabled ? '1' : '0');
    }
    if (restart) {
      reloadRuntime();
    } else {
      updateLocalInputLayerState();
    }
  }

  function maybeDispatchToolPointerEvent(event, phase) {
    if (!runtimeState.enabled || !runtimeState.activeLocalToolId) {
      return false;
    }
    const refs = getCanvasDomRefs();
    if (!refs) {
      return false;
    }
    const targetNode = event.target instanceof Node ? event.target : null;
    const isInViewport = targetNode ? refs.viewport.contains(targetNode) : false;
    const isTracked = runtimeState.trackedPointerId !== null && event.pointerId === runtimeState.trackedPointerId;
    if (phase === 'pointerdown' && !isInViewport) {
      return false;
    }
    if (phase !== 'pointerdown' && !isInViewport && !isTracked) {
      return false;
    }
    ensureLocalOverlayCanvas();
    syncLocalCanvasGeometry();
    const payload = getToolPointerPayload(event, refs, isTracked);
    if (!payload) {
      return false;
    }
    dispatchEventToRuntime(`tool:${phase}`, payload);
    if (phase === 'pointerdown' && (isInViewport || payload.cell.inside)) {
      runtimeState.trackedPointerId = event.pointerId;
      const layer = runtimeState.localInputLayer;
      if (shouldCaptureCanvasPointer() && layer instanceof HTMLDivElement && event.target === layer && typeof layer.setPointerCapture === 'function') {
        try {
          layer.setPointerCapture(event.pointerId);
        } catch (error) {
          // ignore
        }
      }
    }
    if (phase === 'pointerup' || phase === 'pointercancel') {
      const layer = runtimeState.localInputLayer;
      if (isTracked && layer instanceof HTMLDivElement && typeof layer.releasePointerCapture === 'function') {
        try {
          if (typeof layer.hasPointerCapture === 'function' && layer.hasPointerCapture(event.pointerId)) {
            layer.releasePointerCapture(event.pointerId);
          }
        } catch (error) {
          // ignore
        }
      }
      if (runtimeState.trackedPointerId === event.pointerId) {
        runtimeState.trackedPointerId = null;
      }
    }
    const captured = shouldCaptureCanvasPointer() && (isInViewport || isTracked);
    if (captured) {
      event.preventDefault();
      event.stopPropagation();
    }
    return captured;
  }

  function bindGlobalEvents() {
    window.addEventListener('message', event => {
      const frame = runtimeState.frame;
      if (!(frame instanceof HTMLIFrameElement) || event.source !== frame.contentWindow) {
        return;
      }
      const data = event.data;
      if (!data || data.__pixieLocalExt !== 1) {
        return;
      }
      if (data.type === 'ready') {
        flushQueuedMessages();
        return;
      }
      if (data.type === 'tool-register') {
        const registered = registerLocalTool(data.payload && data.payload.tool, { notifyRuntime: false });
        if (!registered) {
          setStatus('ローカルツール登録に失敗しました', 'warn');
        }
        return;
      }
      if (data.type === 'tool-unregister') {
        unregisterLocalTool(data.payload && data.payload.id, { notifyRuntime: false });
        return;
      }
      if (data.type === 'tools-clear') {
        clearLocalTools({ notifyRuntime: false });
        return;
      }
      if (data.type === 'tool-activate') {
        setActiveLocalToolId(data.payload && data.payload.id, { notifyRuntime: false });
        return;
      }
      if (data.type === 'pointer-capture') {
        runtimeState.captureCanvasPointer = Boolean(data.payload && data.payload.enabled);
        runtimeState.trackedPointerId = null;
        renderLocalToolMeta();
        updateLocalInputLayerState();
        return;
      }
      if (data.type === 'local-paint') {
        paintLocalPixels(data.payload && data.payload.pixels, data.payload && data.payload.color);
        return;
      }
      if (data.type === 'local-paint-clear') {
        clearLocalPaintPixels();
        return;
      }
      if (data.type === 'status') {
        const ok = Boolean(data.payload && data.payload.ok);
        const message = sanitizeText(data.payload && data.payload.message ? data.payload.message : '', 320);
        setStatus(message || (ok ? '読み込み完了' : 'エラー'), ok ? 'success' : 'error');
        return;
      }
      if (data.type === 'toast') {
        const message = sanitizeText(data.payload && data.payload.message ? data.payload.message : '', 300);
        const level = sanitizeText(data.payload && data.payload.level ? data.payload.level : 'info', 16);
        setStatus(message, level === 'success' ? 'success' : (level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'info')));
        return;
      }
      if (data.type === 'badge') {
        setBadge(data.payload && data.payload.text ? data.payload.text : '');
        return;
      }
      if (data.type === 'panel') {
        const title = data.payload && data.payload.title ? data.payload.title : '';
        const body = data.payload && data.payload.body ? data.payload.body : '';
        setOutput(title, body);
        return;
      }
      if (data.type === 'log') {
        const values = Array.isArray(data.payload && data.payload.values) ? data.payload.values : [];
        if (values.length) {
          setStatus(values.join(' | '), 'info');
        }
      }
    });

    document.addEventListener('keydown', event => {
      if (!runtimeState.enabled) {
        return;
      }
      dispatchEventToRuntime('keydown', {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        repeat: event.repeat,
        now: Date.now(),
      });
    }, true);

    document.addEventListener('pointerdown', event => {
      if (!runtimeState.enabled) {
        return;
      }
      syncLocalCanvasGeometry();
      const target = event.target instanceof HTMLElement ? event.target : null;
      dispatchEventToRuntime('pointerdown', {
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        targetId: target ? target.id || '' : '',
        targetClass: target ? sanitizeText(target.className || '', 80) : '',
        button: event.button,
        now: Date.now(),
      });
      maybeDispatchToolPointerEvent(event, 'pointerdown');
    }, { passive: false, capture: true });

    document.addEventListener('pointermove', event => {
      if (!runtimeState.enabled) {
        return;
      }
      maybeDispatchToolPointerEvent(event, 'pointermove');
    }, { passive: false, capture: true });

    document.addEventListener('pointerup', event => {
      if (!runtimeState.enabled) {
        return;
      }
      maybeDispatchToolPointerEvent(event, 'pointerup');
    }, { passive: false, capture: true });

    document.addEventListener('pointercancel', event => {
      if (!runtimeState.enabled) {
        return;
      }
      maybeDispatchToolPointerEvent(event, 'pointercancel');
    }, { passive: false, capture: true });

    window.addEventListener('resize', () => {
      syncLocalCanvasGeometry();
    }, { passive: true });
  }

  function buildUi() {
    const settingsBody = document.querySelector('#panelSettings .panel-section__body');
    if (!(settingsBody instanceof HTMLElement)) {
      return null;
    }

    const panel = document.createElement('details');
    panel.className = 'field field--list local-ext-panel';
    panel.id = 'localExtensionPanel';

    const summary = document.createElement('summary');
    summary.textContent = 'ローカル拡張（外付け）';
    panel.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'local-ext-panel__body';

    const description = document.createElement('p');
    description.className = 'help-text ui-guide-text';
    description.textContent = 'この端末だけで動作します。共有状態へ書き込むAPIは公開しません。';
    body.appendChild(description);

    const row = document.createElement('div');
    row.className = 'local-ext-panel__row';
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle-option';
    toggleLabel.setAttribute('for', 'localExtensionEnabled');
    const enabled = document.createElement('input');
    enabled.id = 'localExtensionEnabled';
    enabled.type = 'checkbox';
    const toggleText = document.createElement('span');
    toggleText.textContent = '有効化';
    toggleLabel.append(enabled, toggleText);
    row.appendChild(toggleLabel);
    body.appendChild(row);

    const code = document.createElement('textarea');
    code.id = 'localExtensionCode';
    code.className = 'local-ext-panel__code';
    code.spellcheck = false;
    code.placeholder = 'ここにローカル拡張コードを入力';
    body.appendChild(code);

    const actions = document.createElement('div');
    actions.className = 'local-ext-panel__actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'chip';
    saveButton.textContent = '保存';

    const reloadButton = document.createElement('button');
    reloadButton.type = 'button';
    reloadButton.className = 'chip';
    reloadButton.textContent = '反映';

    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'chip';
    stopButton.textContent = '停止';

    const templateButton = document.createElement('button');
    templateButton.type = 'button';
    templateButton.className = 'chip';
    templateButton.textContent = 'テンプレ';

    actions.append(saveButton, reloadButton, stopButton, templateButton);
    body.appendChild(actions);

    const toolBox = document.createElement('div');
    toolBox.className = 'local-ext-panel__tools';

    const toolHeading = document.createElement('div');
    toolHeading.className = 'local-ext-panel__tools-heading';
    toolHeading.textContent = 'ローカルツール';

    const clearToolButton = document.createElement('button');
    clearToolButton.type = 'button';
    clearToolButton.className = 'chip';
    clearToolButton.textContent = '選択解除';

    const toolHeadingActions = document.createElement('div');
    toolHeadingActions.className = 'local-ext-panel__tools-actions';
    toolHeadingActions.appendChild(clearToolButton);

    const toolHeadingRow = document.createElement('div');
    toolHeadingRow.className = 'local-ext-panel__tools-row';
    toolHeadingRow.append(toolHeading, toolHeadingActions);

    const toolList = document.createElement('div');
    toolList.className = 'local-ext-panel__tool-list';

    const toolMeta = document.createElement('p');
    toolMeta.className = 'help-text local-ext-panel__tool-meta';

    toolBox.append(toolHeadingRow, toolList, toolMeta);
    body.appendChild(toolBox);

    const status = document.createElement('p');
    status.className = 'help-text local-ext-panel__status';
    status.id = 'localExtensionStatus';
    status.setAttribute('aria-live', 'polite');
    body.appendChild(status);

    const output = document.createElement('div');
    output.className = 'local-ext-panel__output';
    const outputTitle = document.createElement('div');
    outputTitle.className = 'local-ext-panel__output-title';
    outputTitle.textContent = 'ローカル出力';
    const outputBody = document.createElement('div');
    outputBody.className = 'local-ext-panel__output-body';
    outputBody.textContent = '拡張コードから api.panel(title, body) で表示できます。';
    output.append(outputTitle, outputBody);
    body.appendChild(output);

    panel.appendChild(body);
    settingsBody.appendChild(panel);

    const badge = document.createElement('div');
    badge.className = 'local-ext-badge';
    badge.id = 'localExtensionBadge';
    document.body.appendChild(badge);

    return {
      panel,
      enabled,
      code,
      saveButton,
      reloadButton,
      stopButton,
      templateButton,
      clearToolButton,
      toolList,
      toolMeta,
      status,
      outputTitle,
      outputBody,
      badge,
    };
  }

  function hydrateUi() {
    const ui = runtimeState.ui;
    if (!ui) {
      return;
    }
    runtimeState.code = readStorage(STORAGE_KEY_CODE, '');
    runtimeState.enabled = readStorage(STORAGE_KEY_ENABLED, '0') === '1';
    const isOpen = readStorage(STORAGE_KEY_OPEN, '0') === '1';
    ui.panel.open = isOpen;
    ui.enabled.checked = runtimeState.enabled;
    ui.code.value = runtimeState.code;

    ui.panel.addEventListener('toggle', () => {
      writeStorage(STORAGE_KEY_OPEN, ui.panel.open ? '1' : '0');
    });

    ui.enabled.addEventListener('change', () => {
      setEnabled(ui.enabled.checked, { persist: true, restart: true });
    });

    ui.saveButton.addEventListener('click', () => {
      runtimeState.code = ui.code.value || '';
      writeStorage(STORAGE_KEY_CODE, runtimeState.code);
      setStatus('ローカル拡張コードを保存しました', 'success');
    });

    ui.reloadButton.addEventListener('click', () => {
      runtimeState.code = ui.code.value || '';
      writeStorage(STORAGE_KEY_CODE, runtimeState.code);
      if (!runtimeState.enabled) {
        setEnabled(true, { persist: true, restart: true });
      } else {
        reloadRuntime();
      }
      setStatus('ローカル拡張を反映しました', 'success');
    });

    ui.stopButton.addEventListener('click', () => {
      setEnabled(false, { persist: true, restart: true });
      setStatus('ローカル拡張を停止しました', 'info');
    });

    ui.templateButton.addEventListener('click', () => {
      if ((ui.code.value || '').trim()) {
        const accepted = window.confirm('現在のコードをテンプレートで上書きしますか？');
        if (!accepted) {
          return;
        }
      }
      ui.code.value = TEMPLATE_CODE;
      runtimeState.code = ui.code.value;
      writeStorage(STORAGE_KEY_CODE, runtimeState.code);
      setStatus('テンプレートを入力しました', 'info');
    });

    ui.clearToolButton.addEventListener('click', () => {
      setActiveLocalToolId('', { notifyRuntime: true });
      setStatus('ローカルツールの選択を解除しました', 'info');
    });

    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
  }

  function init() {
    const ui = buildUi();
    if (!ui) {
      return;
    }
    runtimeState.ui = ui;
    hydrateUi();
    bindGlobalEvents();
    if (runtimeState.enabled) {
      startRuntime();
    } else {
      setStatus('ローカル拡張はOFFです', 'info');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
