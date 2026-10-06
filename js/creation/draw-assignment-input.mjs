/** Draw-only gestures for assigning one shared color/tool to the left or right button. */
export function mountDrawAssignmentInput({ root, onAssign }) {
  if (!root || typeof onAssign !== 'function') throw new TypeError('Draw assignment input requires a root and onAssign callback');
  const doc = root.ownerDocument, win = doc.defaultView;
  const active = new Map();
  const clickSuppressions = new WeakMap(), contextSuppressions = new WeakMap();
  const suppressedPointers = new Map();
  const timers = new Set();
  let disposed = false;

  function assignedTarget(target) {
    const node = target?.closest?.('[data-draw-tool], .draw-color[data-color-index]');
    return node && root.contains(node) ? node : null;
  }
  function describe(node) {
    const repeat = node.matches('.draw-color[data-color-index]') && Number(node.dataset.colorIndex) >= 0 ? '選択中の色をもう一度押すと編集できます。' : '';
    node.setAttribute('aria-description', `左クリックで左ボタンに割り当てます。${repeat}Shift+Enter、Shift+Space、長押し、右クリックで右ボタンに割り当てます。`);
    node.setAttribute('aria-keyshortcuts', 'Shift+Enter Shift+Space');
  }
  function clearTimer(record) {
    if (!record?.timer) return;
    win.clearTimeout(record.timer); timers.delete(record.timer); record.timer = 0;
  }
  function suppressClick(pointerId, target) {
    if (target) expireWeak(clickSuppressions, target);
    const previous = suppressedPointers.get(pointerId);
    if (previous) { win.clearTimeout(previous.timer); timers.delete(previous.timer); }
    const record = { target, timer: 0 };
    record.timer = win.setTimeout(() => { suppressedPointers.delete(pointerId); timers.delete(record.timer); }, 1200);
    timers.add(record.timer); suppressedPointers.set(pointerId, record);
  }
  function clearPending() {
    for (const [pointerId, record] of active) {
      clearTimer(record); record.cancelled = true;
      suppressClick(pointerId, record.target);
    }
    active.clear();
  }
  function expireWeak(weakMap, node) {
    const previous = weakMap.get(node);
    if (previous) { win.clearTimeout(previous); timers.delete(previous); }
    const timer = win.setTimeout(() => { weakMap.delete(node); timers.delete(timer); }, 1200);
    timers.add(timer); weakMap.set(node, timer);
  }
  function consumeWeak(weakMap, node) {
    const timer = weakMap.get(node);
    if (!timer) return false;
    win.clearTimeout(timer); timers.delete(timer); weakMap.delete(node); return true;
  }
  function closeToolMenu(target) {
    const menu = target.closest?.('.draw-tool-menu');
    const details = menu?.closest('details');
    if (!details?.open) return;
    details.open = false;
    details.querySelector('summary')?.focus({ preventScroll: true });
  }
  function assign(side, target, event) {
    describe(target);
    const kind = target.hasAttribute('data-draw-tool') ? 'tool' : 'color';
    const value = kind === 'tool' ? target.dataset.drawTool : Number(target.dataset.colorIndex);
    onAssign({ side, kind, value, target, event });
    if (kind === 'tool') closeToolMenu(target);
  }
  function onPointerDown(event) {
    const target = assignedTarget(event.target);
    if (active.size && !active.has(event.pointerId)) {
      clearPending();
      suppressClick(event.pointerId, target);
      return;
    }
    const staleSuppression = suppressedPointers.get(event.pointerId);
    if (staleSuppression) {
      win.clearTimeout(staleSuppression.timer); timers.delete(staleSuppression.timer); suppressedPointers.delete(event.pointerId);
      if (staleSuppression.target) consumeWeak(clickSuppressions, staleSuppression.target);
    }
    if (!target || (event.button !== undefined && event.button !== 0)) return;
    // A fresh gesture supersedes only this control's old synthesized-event token.
    consumeWeak(clickSuppressions, target); consumeWeak(contextSuppressions, target);
    describe(target);
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    const record = { target, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, held: false, cancelled: false, timer: 0 };
    active.set(event.pointerId, record);
    record.timer = win.setTimeout(() => {
      timers.delete(record.timer); record.timer = 0;
      if (disposed || active.get(event.pointerId) !== record) return;
      const hit = doc.elementFromPoint(record.x, record.y), rect = target.getBoundingClientRect();
      const menu = target.closest('.draw-tool-menu')?.closest('details');
      const visible = target.isConnected && root.contains(target) && target.getClientRects().length > 0
        && rect.width > 0 && rect.height > 0 && record.x >= rect.left && record.x < rect.right && record.y >= rect.top && record.y < rect.bottom
        && Boolean(hit && target.contains(hit)) && (!menu || menu.open);
      if (!visible || record.cancelled) { record.cancelled = true; return; }
      record.held = true;
      expireWeak(contextSuppressions, target);
      assign('right', target, event);
    }, 500);
    timers.add(record.timer);
  }
  function onPointerMove(event) {
    const record = active.get(event.pointerId);
    if (!record) return;
    if (Math.hypot(event.clientX - record.startX, event.clientY - record.startY) > 8) {
      clearTimer(record); record.cancelled = true;
    }
    record.x = event.clientX; record.y = event.clientY;
  }
  function onPointerFinish(event) {
    const record = active.get(event.pointerId);
    if (!record) return;
    clearTimer(record);
    if (event.type !== 'pointerup') record.cancelled = true;
    active.delete(event.pointerId);
    if (record.held || record.cancelled) suppressClick(event.pointerId, record.target);
  }
  function onClick(event) {
    const pointerSuppression = suppressedPointers.get(event.pointerId);
    if (pointerSuppression) {
      win.clearTimeout(pointerSuppression.timer); timers.delete(pointerSuppression.timer); suppressedPointers.delete(event.pointerId);
      if (pointerSuppression.target) consumeWeak(clickSuppressions, pointerSuppression.target);
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const target = assignedTarget(event.target);
    if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (consumeWeak(clickSuppressions, target)) return;
    assign('left', target, event);
  }
  function onContextMenu(event) {
    const target = assignedTarget(event.target);
    if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (consumeWeak(contextSuppressions, target)) return;
    const record = active.get(event.pointerId) || [...active.values()].find(item => item.target === target);
    if (record?.target === target) { clearTimer(record); record.held = true; }
    suppressClick(event.pointerId, target);
    assign('right', target, event);
  }
  function onKeyDown(event) {
    if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey
        || event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    const target = assignedTarget(event.target);
    if (!target) return;
    consumeWeak(clickSuppressions, target); consumeWeak(contextSuppressions, target);
    if (!event.shiftKey) return;
    event.preventDefault(); event.stopImmediatePropagation();
    assign('right', target, event);
  }
  function onToggle(event) {
    if (event.target?.matches?.('#draw-tool-picker') && !event.target.open) clearPending();
  }
  function onScroll() { clearPending(); }
  function onEscape(event) { if (event.key === 'Escape') clearPending(); }
  function onHidden() { if (doc.hidden) clearPending(); }
  function onPointerLeave(event) {
    const record = active.get(event.pointerId);
    if (!record || record.target.contains(event.relatedTarget)) return;
    clearTimer(record); record.cancelled = true;
  }
  function onFocusIn(event) { const target = assignedTarget(event.target); if (target) describe(target); }
  const observer = new win.MutationObserver(() => {
    for (const node of root.querySelectorAll('[data-draw-tool], .draw-color[data-color-index]')) describe(node);
  });
  observer.observe(root, { childList: true, subtree: true });
  for (const node of root.querySelectorAll('[data-draw-tool], .draw-color[data-color-index]')) describe(node);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointermove', onPointerMove, true);
  doc.addEventListener('pointerup', onPointerFinish, true);
  doc.addEventListener('pointercancel', onPointerFinish, true);
  doc.addEventListener('lostpointercapture', onPointerFinish, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('contextmenu', onContextMenu, true);
  root.addEventListener('keydown', onKeyDown, true);
  root.addEventListener('focusin', onFocusIn, true);
  root.addEventListener('toggle', onToggle, true);
  win.addEventListener('scroll', onScroll, true);
  doc.addEventListener('scroll', onScroll, true);
  doc.addEventListener('pointerleave', onPointerLeave, true);
  win.addEventListener('keydown', onEscape, true);
  win.addEventListener('blur', onScroll);
  win.addEventListener('pagehide', onScroll);
  doc.addEventListener('visibilitychange', onHidden);

  return { dispose() {
    disposed = true; clearPending(); active.clear();
    for (const timer of timers) win.clearTimeout(timer);
    timers.clear();
    observer.disconnect();
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', onPointerFinish, true);
    doc.removeEventListener('pointercancel', onPointerFinish, true);
    doc.removeEventListener('lostpointercapture', onPointerFinish, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('contextmenu', onContextMenu, true);
    root.removeEventListener('keydown', onKeyDown, true);
    root.removeEventListener('focusin', onFocusIn, true);
    root.removeEventListener('toggle', onToggle, true);
    win.removeEventListener('scroll', onScroll, true);
    doc.removeEventListener('scroll', onScroll, true);
    doc.removeEventListener('pointerleave', onPointerLeave, true);
    win.removeEventListener('keydown', onEscape, true);
    win.removeEventListener('blur', onScroll);
    win.removeEventListener('pagehide', onScroll);
    doc.removeEventListener('visibilitychange', onHidden);
  } };
}
