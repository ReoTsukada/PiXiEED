/** Relative viewport input and independent mouse-button fingers; never moves the OS cursor. */
export function mountDrawVirtualCursor({ scope, board, canvas, toggle, controls, onDown, onMove, onRelease, onHover, getStep,
  onViewportGestureStart, onViewportGestureMove, onViewportGestureEnd, allowViewportCursor }) {
  const marker = document.createElement('div'); marker.className = 'draw-virtual-marker'; marker.hidden = true;
  marker.setAttribute('aria-hidden', 'true');
  board.append(marker); scope.add(() => marker.remove());
  const left = controls.querySelector('[data-virtual-left]'), right = controls.querySelector('[data-virtual-right]');
  const pads = new Map(), buttons = new Map();
  // Once a gesture is cancelled, keep its native pointer ids inert until their
  // matching up/cancel arrives (or a genuinely new down reuses the id).
  const quarantinedPointers = new Set();
  let enabled = false, activeSide = '', position = null, padOwner = null, hover = null, gestureOwner = null;
  let viewportGestureActive = false, gestureSuspended = false;
  let cancelling = false, deferGestureUpdate = false;
  const pointerId = -7106;
  let modifiers = { shiftKey: false, altKey: false };
  const rememberModifiers = e => { modifiers = { shiftKey: e.shiftKey, altKey: e.altKey }; };
  scope.listen(window, 'keydown', rememberModifiers, { capture: true });
  scope.listen(window, 'keyup', rememberModifiers, { capture: true });
  scope.listen(window, 'blur', () => { modifiers = { shiftKey: false, altKey: false }; });

  function event(type, side = activeSide) {
    const button = side === 'right' ? 2 : 0;
    return { type, pointerId, pointerType: 'mouse', virtual: true, button, ...modifiers,
      buttons: side ? (side === 'right' ? 2 : 1) : 0,
      clientX: position?.x ?? 0, clientY: position?.y ?? 0, preventDefault() {} };
  }
  function sync() {
    left.disabled = right.disabled = !enabled;
    left.setAttribute('aria-pressed', String(activeSide === 'left'));
    right.setAttribute('aria-pressed', String(activeSide === 'right'));
    controls.setAttribute('aria-disabled', String(!enabled)); controls.classList.toggle('is-disabled', !enabled);
    canvas.dataset.virtualPressed = String(Boolean(activeSide));
    canvas.dataset.virtualButton = activeSide;
    marker.classList.toggle('is-pressed', Boolean(activeSide));
  }
  function bounds() {
    const b = board.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    const outsideCanvas = allowViewportCursor?.();
    return { board: b, minX: Math.max(b.left + board.clientLeft, outsideCanvas ? -Infinity : c.left), minY: Math.max(b.top + board.clientTop, outsideCanvas ? -Infinity : c.top),
      maxX: Math.min(b.left + board.clientLeft + board.clientWidth, outsideCanvas ? Infinity : c.right), maxY: Math.min(b.top + board.clientTop + board.clientHeight, outsideCanvas ? Infinity : c.bottom) };
  }
  function inside(x, y, b = bounds()) { return x >= b.board.left && x < b.board.right && y >= b.board.top && y < b.board.bottom; }
  function place() {
    if (!enabled) return;
    const b = bounds();
    if (b.maxX <= b.minX || b.maxY <= b.minY) { finishGesture(true, false); marker.hidden = true; return; }
    position ||= { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    position.x = Math.max(b.minX + .01, Math.min(b.maxX - .01, position.x));
    position.y = Math.max(b.minY + .01, Math.min(b.maxY - .01, position.y));
    marker.style.left = `${position.x - b.board.left - board.clientLeft}px`;
    marker.style.top = `${position.y - b.board.top - board.clientTop}px`;
    marker.hidden = false; onHover?.(event('pointermove'));
  }
  function move(dx, dy) {
    if (!enabled) return;
    place(); if (marker.hidden) return;
    const b = bounds();
    position.x = Math.max(b.minX + .01, Math.min(b.maxX - .01, position.x + dx));
    position.y = Math.max(b.minY + .01, Math.min(b.maxY - .01, position.y + dy));
    place(); onMove(event('pointermove'));
  }
  function capture(target, id) { try { target.setPointerCapture(id); } catch { /* Keyboard and emulated events have no native pointer to capture. */ } }
  function detach(id, record) {
    buttons.delete(id); pads.delete(id);
    try { if (record?.target.hasPointerCapture(id)) record.target.releasePointerCapture(id); } catch { /* The browser may already have released capture. */ }
  }
  function viewportPoints() {
    return [...pads.entries()].filter(([, record]) => record.kind === 'pad').map(([pointerId, record]) => ({ pointerId, x: record.x, y: record.y }));
  }
  function viewportMetrics(points) {
    const first = points[0], second = points[1];
    return { points, centerX: (first.x + second.x) / 2, centerY: (first.y + second.y) / 2,
      distance: Math.hypot(first.x - second.x, first.y - second.y) };
  }
  function endViewportGesture(cancelled = false) {
    if (!viewportGestureActive) return;
    viewportGestureActive = false;
    const remainingPoints = viewportPoints();
    onViewportGestureEnd?.({ remainingPoints, cancelled });
  }
  function updateViewportGesture(cancelled = false) {
    if (cancelling || deferGestureUpdate) return;
    const records = [...pads.entries()].filter(([, record]) => record.kind === 'pad');
    if (activeSide) {
      endViewportGesture(true); gestureSuspended = false;
      padOwner = records.find(([, record]) => record.inside)?.[0] ?? records[0]?.[0] ?? null;
      return;
    }
    if (records.length >= 2) {
      const insideAll = records.every(([, record]) => record.inside);
      if (!insideAll) {
        endViewportGesture(cancelled);
        gestureSuspended = true; padOwner = null;
        return;
      }
      gestureSuspended = false; padOwner = null; hover = null;
      const metrics = viewportMetrics(records.slice(0, 2).map(([pointerId, record]) => ({ pointerId, x: record.x, y: record.y })));
      if (!viewportGestureActive) { viewportGestureActive = true; onViewportGestureStart?.(metrics); }
      else onViewportGestureMove?.(metrics);
      return;
    }
    if (viewportGestureActive) endViewportGesture(cancelled);
    gestureSuspended = false;
    padOwner = records[0]?.[0] ?? null;
  }
  function clearGesture() {
    activeSide = ''; gestureOwner = null; sync();
  }
  function resetPress() {
    const current = activeSide;
    clearGesture();
    updateViewportGesture();
    if (!current) return;
    // The drawing page calls resetPress after ending the synthetic pointer gesture.
  }
  function release(cancel = false, resumeViewport = true) {
    if (!activeSide) { resetPress(); return; }
    const e = event(cancel ? 'pointercancel' : 'pointerup'); e.buttons = 0;
    clearGesture();
    const previousDefer = deferGestureUpdate; deferGestureUpdate = true;
    try { onRelease(e); } finally { deferGestureUpdate = previousDefer; }
    if (resumeViewport) updateViewportGesture();
  }
  function finishGesture(cancel = false, resumeViewport = true) {
    if (activeSide) {
      const previousDefer = deferGestureUpdate; deferGestureUpdate = true;
      try { release(cancel, false); } finally { deferGestureUpdate = previousDefer; }
    }
    if (!resumeViewport) endViewportGesture(true);
    gestureSuspended = false;
    for (const [id, record] of [...buttons]) detach(id, record);
    if (resumeViewport) updateViewportGesture();
  }
  function cancelInputs(cancel = true, endedPointerId = null) {
    if (cancelling) return;
    for (const id of new Set([...pads.keys(), ...buttons.keys()])) quarantinedPointers.add(id);
    cancelling = true;
    try {
      finishGesture(cancel, false); endViewportGesture(true); gestureSuspended = false; padOwner = null; hover = null;
      for (const [id, record] of [...pads]) detach(id, record);
      board.classList.remove('is-cursor-moving');
    } finally {
      cancelling = false;
    }
    // The contact that emitted pointercancel is already gone. Lost capture and
    // blur are different: the physical contact can still emit stale moves.
    if (endedPointerId !== null) quarantinedPointers.delete(endedPointerId);
  }
  function press(side, owner) {
    if (!enabled || activeSide) return false;
    endViewportGesture(true); gestureSuspended = false;
    place(); if (marker.hidden) return false;
    activeSide = side; gestureOwner = owner; sync(); updateViewportGesture(); onDown(event('pointerdown', side)); return true;
  }
  function setEnabled(value) {
    cancelInputs(false); enabled = value;
    board.classList.toggle('has-virtual-cursor', enabled);
    board.setAttribute('aria-label', enabled ? '仮想カーソルの移動パッド。なぞって相対移動。左右クリックを別の指で押しながら動かすと描画します。' : '描画エリア。2本指で拡大・移動できます。');
    toggle.setAttribute('aria-pressed', String(enabled)); toggle.title = enabled ? '仮想カーソルを解除' : '仮想カーソル';
    marker.hidden = !enabled; sync(); if (enabled) place();
  }
  function stop(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  function beginButton(e, node, side) {
    if (!enabled || buttons.has(e.pointerId) || (e.button !== undefined && e.button !== 0)) return;
    quarantinedPointers.delete(e.pointerId);
    // A second side cannot take over an in-flight gesture.
    stop(e); node.focus({ preventScroll: true });
    const record = { target: node, side, kind: 'button' };
    buttons.set(e.pointerId, record);
    press(side, record); capture(node, e.pointerId); sync();
  }
  scope.listen(toggle, 'click', () => setEnabled(!enabled));
  for (const [node, side] of [[left, 'left'], [right, 'right']]) {
    scope.listen(node, 'pointerdown', e => beginButton(e, node, side));
    // Keyboard/assistive activation has detail=0. Pointer clicks have already been handled.
    scope.listen(node, 'click', e => {
      if (!enabled || e.detail !== 0) return;
      if (press(side, { kind: 'keyboard', side })) release();
    });
  }
  scope.listen(board, 'pointerdown', e => {
    if (!enabled || e.virtual) return;
    quarantinedPointers.delete(e.pointerId);
    const b = bounds();
    if (e.pointerType === 'mouse') {
      stop(e);
      if (!inside(e.clientX, e.clientY, b)) return;
      board.focus({ preventScroll: true });
      const side = e.button === 2 ? 'right' : e.button === 0 ? 'left' : '';
      const record = { x: e.clientX, y: e.clientY, inside: true, target: board, kind: 'mouse', side };
      pads.set(e.pointerId, record); capture(board, e.pointerId); hover = { x: e.clientX, y: e.clientY };
      if (side) { buttons.set(e.pointerId, record); press(side, record); }
      return;
    }
    stop(e);
    pads.set(e.pointerId, { x: e.clientX, y: e.clientY, inside: inside(e.clientX, e.clientY, b), target: board, kind: 'pad' });
    padOwner ??= e.pointerId; hover = null; capture(board, e.pointerId); board.classList.add('is-cursor-moving');
    updateViewportGesture();
    // Touching establishes an anchor; it never jumps the cursor to the finger.
  }, { capture: true });
  scope.listen(board, 'pointermove', e => {
    if (!enabled || e.virtual) return;
    stop(e);
    if (quarantinedPointers.has(e.pointerId)) return;
    const record = pads.get(e.pointerId), b = bounds();
    if (record) {
      const inViewport = inside(e.clientX, e.clientY, b);
      if (record.kind === 'mouse') {
        if (inViewport && record.inside) move(e.clientX - record.x, e.clientY - record.y);
        record.x = e.clientX; record.y = e.clientY; record.inside = inViewport;
        const held = e.buttons || 0;
        if (activeSide && gestureOwner === record && !(held & (activeSide === 'right' ? 2 : 1))) finishGesture(false);
      } else {
        const wasInside = record.inside, dx = e.clientX - record.x, dy = e.clientY - record.y;
        record.x = e.clientX; record.y = e.clientY; record.inside = inViewport;
        const padCount = [...pads.values()].filter(item => item.kind === 'pad').length;
        if (activeSide) {
          updateViewportGesture();
          if (inViewport && wasInside && padOwner === e.pointerId) move(dx, dy);
        } else if (padCount >= 2 || viewportGestureActive || gestureSuspended) updateViewportGesture();
        else if (inViewport && wasInside && padOwner === e.pointerId) move(dx, dy);
      }
    } else if (e.pointerType === 'mouse') {
      if (!inside(e.clientX, e.clientY, b)) { hover = null; return; }
      if (hover) move(e.clientX - hover.x, e.clientY - hover.y);
      hover = { x: e.clientX, y: e.clientY };
    }
  }, { capture: true });
  function finishPointer(e) {
    if (cancelling) return;
    if (quarantinedPointers.has(e.pointerId)) {
      if (e.type !== 'lostpointercapture') quarantinedPointers.delete(e.pointerId);
      stop(e);
      return;
    }
    if (!enabled) return;
    if (e.type !== 'pointerup') {
      if (!pads.has(e.pointerId) && !buttons.has(e.pointerId)) return;
      cancelInputs(true, e.type === 'pointercancel' ? e.pointerId : null);
      return;
    }
    const record = buttons.get(e.pointerId), pad = pads.get(e.pointerId);
    if (record) {
      const ownsGesture = gestureOwner === record;
      detach(e.pointerId, record);
      if (ownsGesture) finishGesture(false);
    }
    if (pad) {
      const wasOwner = padOwner === e.pointerId; detach(e.pointerId, pad);
      if (wasOwner) { finishGesture(false); padOwner = pads.keys().next().value ?? null; }
      if (pad.kind === 'pad') updateViewportGesture(false);
      if (![...pads.values()].some(item => item.kind === 'pad')) board.classList.remove('is-cursor-moving');
      if (pad.kind === 'mouse') hover = null;
    }
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) scope.listen(document, type, finishPointer, { capture: true });
  scope.listen(board, 'pointerenter', () => { hover = null; });
  scope.listen(board, 'pointerleave', e => {
    hover = null;
    const record = pads.get(e.pointerId); if (record) { record.inside = false; if (record.kind === 'pad') updateViewportGesture(); }
  });
  scope.listen(board, 'contextmenu', e => { if (enabled) stop(e); }, { capture: true });
  for (const node of [left, right]) scope.listen(node, 'contextmenu', e => { if (enabled) stop(e); }, { capture: true });
  scope.listen(window, 'blur', () => cancelInputs(true)); scope.listen(window, 'pagehide', () => cancelInputs(true));
  scope.listen(document, 'visibilitychange', () => { if (document.hidden) cancelInputs(true); });
  scope.add(() => { cancelInputs(true); enabled = false; sync(); board.classList.remove('has-virtual-cursor'); });
  board.tabIndex = 0; sync();
  const intercepted = e => enabled && !e.virtual;
  return { realDown: intercepted, realMove: intercepted, realRelease: intercepted, release, resetPress, place,
    cancelInputs,
    canvasPosition: () => { if (!position) return null; const r = canvas.getBoundingClientRect(); return { x: (position.x - r.left) / r.width * canvas.width, y: (position.y - r.top) / r.height * canvas.height }; },
    setCanvasPosition: point => { cancelInputs(true); const r = canvas.getBoundingClientRect(); position = point ? { x: r.left + point.x / canvas.width * r.width, y: r.top + point.y / canvas.height * r.height } : null; place(); },
    pressKeyboard: side => press(side, { kind: 'keyboard', side }),
    releaseKeyboard: (side, cancel = false) => { if (gestureOwner?.kind === 'keyboard' && gestureOwner.side === side) finishGesture(cancel); },
    nudge: (dx, dy, scale = 1) => { if (!enabled) return false; const step = getStep(); move(dx * step.x * scale, dy * step.y * scale); return true; },
    get enabled() { return enabled; } };
}
