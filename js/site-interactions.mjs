const installedDocuments = new WeakMap();
const editableSelector = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]';

function isEditable(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.(editableSelector));
}

function addStylesheet(doc) {
  if (doc.getElementById?.('px-site-interactions-css')) return null;
  const link = doc.createElement('link');
  link.id = 'px-site-interactions-css'; link.rel = 'stylesheet'; link.href = '/css/site-interactions.css?v=20261001-interactions-1';
  (doc.head || doc.documentElement || doc.body)?.append(link);
  return link;
}

/** Install site-wide browser gesture defaults once per document. Safe to call during SSR. */
export function installSiteInteractions({ document: doc = globalThis.document, window: win = globalThis.window } = {}) {
  if (!doc?.addEventListener || !win?.addEventListener) return () => {};
  const existing = installedDocuments.get(doc);
  if (existing) return existing;
  const link = addStylesheet(doc);
  const onContextMenu = (event) => {
    // Draw owns its two-button gestures locally; keep ordinary browser menus outside it.
    if (doc.body?.dataset?.page === 'draw' && !event.target?.closest?.('.draw-board, [data-virtual-left], [data-virtual-right]')) return;
    if (!isEditable(event.target)) event.preventDefault();
  };
  const onDragStart = (event) => {
    const image = event.target?.closest?.('img');
    if (image) event.preventDefault();
  };
  doc.addEventListener('contextmenu', onContextMenu);
  doc.addEventListener('dragstart', onDragStart);
  const teardown = () => {
    doc.removeEventListener('contextmenu', onContextMenu);
    doc.removeEventListener('dragstart', onDragStart);
    link?.remove?.(); installedDocuments.delete(doc);
  };
  installedDocuments.set(doc, teardown);
  return teardown;
}

/** Bind a desktop context action and a cancellable touch/pen long press to one element. */
export function bindContextAction(element, onContext, { holdMs = 500, movement = 10, window: win = globalThis.window } = {}) {
  if (!element?.addEventListener || typeof onContext !== 'function') throw new TypeError('長押しメニューの対象と処理を指定してください。');
  if (!win?.addEventListener) throw new TypeError('長押しメニューの入力環境を利用できません。');
  let active = null; let timer = 0; let clickTimer = 0; let suppressNextClick = false; let suppressNativeUntil = 0;
  const now = () => win.performance?.now?.() ?? Date.now();
  const clear = () => { if (timer) win.clearTimeout(timer); timer = 0; active = null; };
  const invoke = (event, source, x, y, pointerType = '') => {
    return onContext({ event, source, x, y, pointerType });
  };
  const onPointerDown = (event) => {
    if (active && event.pointerType !== 'mouse') { clear(); return; }
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (event.target !== element && !element.contains?.(event.target)) return;
    if (event.isPrimary === false || event.button > 0) { clear(); return; }
    clear();
    active = { id: event.pointerId, x: event.clientX, y: event.clientY, event, pointerType: event.pointerType };
    timer = win.setTimeout(() => {
      if (!active) return;
      const pressed = active; active = null; timer = 0;
      suppressNativeUntil = now() + 1000;
      const opened = invoke(pressed.event, 'hold', pressed.x, pressed.y, pressed.pointerType);
      if (opened === false) return;
      suppressNextClick = true;
      if (clickTimer) win.clearTimeout(clickTimer);
      clickTimer = win.setTimeout(() => { suppressNextClick = false; clickTimer = 0; }, 1000);
    }, Math.max(0, holdMs));
  };
  const onPointerMove = (event) => {
    if (!active) return;
    if (event.pointerId !== active.id) { if (event.pointerType !== 'mouse') clear(); return; }
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > movement) clear();
  };
  const onPointerEnd = (event) => {
    if (active && (event.pointerId === active.id || event.type === 'pointercancel')) clear();
  };
  const onContextMenu = (event) => {
    event.preventDefault();
    if (now() < suppressNativeUntil) return;
    let x = event.clientX || 0; let y = event.clientY || 0;
    if (x === 0 && y === 0) {
      const rect = element.getBoundingClientRect?.();
      if (rect) { x = rect.left + rect.width / 2; y = rect.top + rect.height / 2; }
    }
    invoke(event, event.button === 2 ? 'contextmenu' : 'keyboard', x, y, event.pointerType || '');
  };
  const onClick = (event) => {
    if (!suppressNextClick) return;
    suppressNextClick = false; win.clearTimeout(clickTimer); clickTimer = 0; event.preventDefault(); event.stopPropagation();
  };
  element.addEventListener('contextmenu', onContextMenu);
  element.addEventListener('click', onClick, true);
  win.addEventListener('pointermove', onPointerMove, true);
  win.addEventListener('pointerup', onPointerEnd, true);
  win.addEventListener('pointercancel', onPointerEnd, true);
  win.addEventListener('pointerdown', onPointerDown, true);
  return () => {
    clear();
    element.removeEventListener('contextmenu', onContextMenu);
    element.removeEventListener('click', onClick, true);
    win.clearTimeout(clickTimer);
    win.removeEventListener('pointermove', onPointerMove, true);
    win.removeEventListener('pointerup', onPointerEnd, true);
    win.removeEventListener('pointercancel', onPointerEnd, true);
    win.removeEventListener('pointerdown', onPointerDown, true);
  };
}
