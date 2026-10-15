import { createDrawingToolIcon, DRAWING_TOOL_ICON_NAMES } from './drawing-tool-icons.mjs';
import { DRAW_SHORTCUT_COMMANDS } from './draw-shortcuts.mjs?rev=20261015-draw-desktop-1';
import {
  DRAW_DESKTOP_LAYOUT_DEFAULTS,
  normalizeDrawDesktopPreferences,
  readDrawDesktopPreferences,
  resolveDrawDesktopLayout,
  resizeDrawDesktopPreference,
  setDrawDesktopPreference,
  writeDrawDesktopPreferences
} from './draw-desktop-layout.mjs';

const TOOL_COMMANDS = {
  pen: 'tool.left.pen', eraser: 'tool.left.eraser', fill: 'tool.left.fill', picker: 'tool.left.picker', spray: 'tool.left.spray',
  line: 'tool.left.line', rectangle: 'tool.left.rectangle', 'rectangle-fill': 'tool.left.rectangleFill',
  ellipse: 'tool.left.ellipse', 'ellipse-fill': 'tool.left.ellipseFill', select: 'tool.left.select'
};
const TOOL_LABELS = {
  pen: 'ペン', eraser: '消しゴム', fill: '塗りつぶし', picker: 'スポイト', line: '直線',
  rectangle: '四角形', 'rectangle-fill': '塗り四角形', ellipse: '楕円', 'ellipse-fill': '塗り楕円',
  select: '範囲選択'
};

export function mountDrawDesktopUi({ scope, root, drawShortcuts, animationControls, assignDrawInput, cancelInput = () => {}, onLayout = () => {} } = {}) {
  if (!scope || !root || !drawShortcuts || typeof assignDrawInput !== 'function') throw new TypeError('Desktop draw UI requires a scope, root, shortcuts, and input assignment callback');
  const doc = root.ownerDocument, win = doc.defaultView;
  const style = doc.createElement('link');
  style.rel = 'stylesheet'; style.href = '/css/draw-desktop-ui.css?rev=20261016-selection-rail-1'; style.dataset.drawDesktopUi = 'true';
  doc.head.append(style);

  const viewport = root.querySelector('.draw-viewport');
  const paletteRow = root.querySelector('#draw-palette')?.parentElement;
  const featureActions = root.querySelector('.draw-feature-actions');
  const featureGroup = featureActions;
  const undo = root.querySelector('#draw-undo'), redo = root.querySelector('#draw-redo');
  const selection = root.querySelector('#draw-selection-controls');
  const animationHost = root.querySelector('#draw-animation-controls');
  const originalLauncher = animationHost?.querySelector('[data-action="toggle-frames"]');
  const restore = [];
  const remember = node => {
    if (!node?.parentNode) return;
    const marker = doc.createComment(`draw-desktop:${node.id || node.className || node.tagName}`);
    node.before(marker); restore.push(() => { if (marker.isConnected) marker.replaceWith(node); });
    return marker;
  };
  const move = (node, host) => { if (node && host && node.parentNode !== host) { remember(node); host.append(node); } };
  const button = (label, key, command, { icon = '', pressed, className = '' } = {}) => {
    const node = doc.createElement('button'); node.type = 'button';
    node.className = `draw-desktop-button ${className}`.trim(); node.dataset.desktopCommand = command || '';
    node.setAttribute('aria-label', label); if (typeof pressed === 'boolean') node.setAttribute('aria-pressed', String(pressed));
    const iconWrap = doc.createElement('span'); iconWrap.className = 'draw-desktop-button__icon'; iconWrap.setAttribute('aria-hidden', 'true');
    if (icon && DRAWING_TOOL_ICON_NAMES.includes(icon)) iconWrap.append(createDrawingToolIcon(icon, doc));
    else if (icon) iconWrap.textContent = ({ 'zoom-in': '+', 'zoom-out': '−', 'zoom-reset': '1:1' })[icon] || icon;
    const text = doc.createElement('span'); text.className = 'draw-desktop-button__label'; text.textContent = label;
    const keyNode = doc.createElement('kbd'); keyNode.className = 'draw-desktop-button__key'; keyNode.textContent = key || '';
    node.append(iconWrap, text, keyNode); return node;
  };
  const shell = doc.createElement('section'); shell.className = 'draw-desktop-shell'; shell.setAttribute('aria-label', '描画ワークスペース');
  shell.innerHTML = `<div class="draw-desktop-tools" id="draw-desktop-tools" data-desktop-lane="tools">
    <div class="draw-desktop-tool-scroll" data-desktop-tool-scroll><section class="draw-desktop-group" data-desktop-group="drawing" aria-label="描く"><h2>描く</h2><div class="draw-desktop-group__buttons" data-desktop-drawing></div><div class="draw-desktop-secondary" data-desktop-paint-secondary></div></section>
    <section class="draw-desktop-group" data-desktop-group="shapes" aria-label="図形"><h2>図形</h2><div class="draw-desktop-group__buttons" data-desktop-shapes></div><div class="draw-desktop-secondary" data-desktop-shape-secondary></div></section></div>
    <section class="draw-desktop-group" data-desktop-group="selection" aria-label="選択と変形"><h2>選択と変形</h2><div class="draw-desktop-group__buttons" data-desktop-selection></div><div class="draw-desktop-context" data-desktop-selection-context></div><div class="draw-desktop-features" data-desktop-features></div></section>
    <section class="draw-desktop-group" data-desktop-group="view" aria-label="表示と補助"><h2>表示・補助</h2><div class="draw-desktop-group__buttons" data-desktop-view></div><div class="draw-desktop-history" data-desktop-history></div><button type="button" class="draw-desktop-button draw-desktop-cell-launcher" data-desktop-cell-launcher aria-label="セル表を開く">▦ <span>セル表</span></button></section>
  </div>
  <div class="draw-desktop-resizer" data-layout-separator="leftWidth" role="separator" tabindex="0" aria-label="ツール欄の幅を変更" aria-orientation="vertical" aria-controls="draw-desktop-tools"></div>
  <div class="draw-desktop-stage" data-desktop-lane="stage"><div class="draw-desktop-canvas-meta"></div><div class="draw-desktop-canvas-host"></div><div class="draw-desktop-toolbar-context" data-desktop-toolbar-context></div></div>
  <div class="draw-desktop-resizer" data-layout-separator="rightWidth" role="separator" tabindex="0" aria-label="色・レイヤー欄の幅を変更" aria-orientation="vertical" aria-controls="draw-desktop-dock"></div>
  <aside class="draw-desktop-dock" id="draw-desktop-dock" data-desktop-lane="dock"><section class="draw-desktop-palette-panel" id="draw-desktop-palette"><h2>色</h2><div class="draw-desktop-palette-host"></div></section><div class="draw-desktop-resizer draw-desktop-resizer--inside" data-layout-separator="paletteHeight" role="separator" tabindex="0" aria-label="パレットとレイヤーの高さを変更" aria-orientation="horizontal" aria-controls="draw-desktop-palette"></div><section class="draw-desktop-layers-panel"><h2>レイヤー</h2><div class="draw-desktop-layer-host"></div></section></aside>
  <div class="draw-desktop-resizer draw-desktop-resizer--frame" data-layout-separator="frameHeight" role="separator" tabindex="0" aria-label="コマ欄の高さを変更" aria-orientation="horizontal" aria-controls="draw-desktop-frames"></div>
  <section class="draw-desktop-frame-panel" data-desktop-lane="frames"><div class="draw-desktop-frame-heading"><h2>コマ</h2><button type="button" data-layout-reset aria-label="PCレイアウトを初期値に戻す">初期レイアウト</button></div><div class="draw-desktop-frame-host" id="draw-desktop-frames"></div></section>`;
  root.append(shell);
  const $ = selector => shell.querySelector(selector);
  const modeNodes = new Map();
  const actualButtons = new Map([...root.querySelectorAll('.draw-tool-menu [data-draw-tool]')].map(node => {
    const mode = node.dataset.selectionMode || '';
    const key = `${node.dataset.drawTool}:${mode}`;
    if (!modeNodes.has(node.dataset.drawTool)) modeNodes.set(node.dataset.drawTool, []);
    modeNodes.get(node.dataset.drawTool).push(node);
    return [key, node];
  }));
  const bindingKey = commandId => {
    const bindings = drawShortcuts.settings?.bindings?.[drawShortcuts.platform];
    const catalog = DRAW_SHORTCUT_COMMANDS.find(item => item.id === commandId);
    const value = bindings && Object.hasOwn(bindings, commandId) ? bindings[commandId] : catalog?.shortcut;
    return formatShortcut(value, drawShortcuts.platform);
  };
  const addTool = (host, tool, mode = '', label = TOOL_LABELS[tool], commandId = TOOL_COMMANDS[tool]) => {
    const key = `${tool}:${mode}`;
    const actual = actualButtons.get(key) || actualButtons.get(`${tool}:`);
    if (!actual) return null;
    const node = button(label, bindingKey(commandId), commandId, { icon: actual.dataset.drawingIcon || tool, pressed: actual.getAttribute('aria-pressed') === 'true' });
    node.dataset.desktopTool = tool; if (mode) node.dataset.desktopSelectionMode = mode;
    node.title = keyTip(label, bindingKey(commandId)); host.append(node); return node;
  };
  const drawingTools = $('[data-desktop-drawing]');
  addTool(drawingTools, 'pen'); addTool(drawingTools, 'eraser'); addTool(drawingTools, 'fill'); addTool(drawingTools, 'picker');
  addTool($('[data-desktop-paint-secondary]'), 'spray', '', 'スプレー');
  const shapeTools = $('[data-desktop-shapes]');
  addTool(shapeTools, 'line'); addTool(shapeTools, 'rectangle'); addTool(shapeTools, 'ellipse');
  addTool($('[data-desktop-shape-secondary]'), 'rectangle-fill', '', '塗り四角形', 'tool.left.rectangleFill');
  addTool($('[data-desktop-shape-secondary]'), 'ellipse-fill', '', '塗り楕円', 'tool.left.ellipseFill');
  const selectHost = $('[data-desktop-selection]');
  addTool(selectHost, 'select', 'rectangle', '四角形選択');
  addTool(selectHost, 'select', 'lasso', '投げ縄');
  addTool(selectHost, 'select', 'color', '同じ色');
  const viewHost = $('[data-desktop-view]');
  for (const [label, command, icon] of [['拡大', 'view.zoomIn', 'zoom-in'], ['縮小', 'view.zoomOut', 'zoom-out'], ['全体表示', 'view.reset', 'zoom-reset'], ['マス目', 'toggle.grid', 'grid'], ['オニオン', 'toggle.onion', 'onion']]) {
    const toggle = command === 'toggle.grid' || command === 'toggle.onion';
    const node = button(label, bindingKey(command), command, { icon, ...(toggle ? { pressed: false } : {}) }); node.title = keyTip(label, bindingKey(command)); viewHost.append(node);
  }

  const meta = root.querySelector('.draw-meta');
  const sizeLabel = root.querySelector('label.draw-size');
  const clearButton = root.querySelector('#draw-clear'), virtualControls = root.querySelector('#draw-virtual-controls');
  let layoutApplied = false;
  function applyMoves() {
    if (layoutApplied) return;
    move(viewport, $('.draw-desktop-canvas-host'));
    move(paletteRow, $('.draw-desktop-palette-host'));
    move(featureGroup, $('[data-desktop-features]'));
    move(selection, $('[data-desktop-selection-context]'));
    move(undo, $('[data-desktop-history]')); move(redo, $('[data-desktop-history]'));
    move(meta, $('.draw-desktop-canvas-meta'));
    move(sizeLabel, $('.draw-desktop-toolbar-context')); move(clearButton, $('.draw-desktop-toolbar-context'));
    move(virtualControls, $('.draw-desktop-toolbar-context'));
    layoutApplied = true;
  }
  function restoreMoves() {
    if (!layoutApplied) return;
    for (const undoMove of restore.reverse()) undoMove();
    restore.length = 0; layoutApplied = false;
  }
  const layerHost = $('.draw-desktop-layer-host'), frameHost = $('.draw-desktop-frame-host');
  const setAnimationLayout = active => animationControls?.setDesktopLayout?.({ active, layerHost, frameHost });
  const savedLayout = readDrawDesktopPreferences();
  let preferences = savedLayout.preferences;
  let resolvedLayout = resolveDrawDesktopLayout(preferences, { width: 0, height: 0 });

  function applyLayout(nextPreferences = preferences, notify = true) {
    preferences = normalizeDrawDesktopPreferences(nextPreferences);
    const rect = root.getBoundingClientRect();
    resolvedLayout = resolveDrawDesktopLayout(preferences, { width: rect.width, height: rect.height });
    shell.style.setProperty('--draw-desktop-left', `${resolvedLayout.leftWidth}px`);
    shell.style.setProperty('--draw-desktop-right', `${resolvedLayout.rightWidth}px`);
    shell.style.setProperty('--draw-desktop-palette', `${resolvedLayout.paletteHeight}px`);
    shell.style.setProperty('--draw-desktop-frame', `${resolvedLayout.frameHeight}px`);
    for (const separator of shell.querySelectorAll('[data-layout-separator]')) {
      const key = separator.dataset.layoutSeparator;
      const bounds = resolvedLayout.limits[key];
      separator.setAttribute('aria-valuemin', String(bounds.min));
      separator.setAttribute('aria-valuemax', String(bounds.max));
      separator.setAttribute('aria-valuenow', String(resolvedLayout[key]));
      separator.setAttribute('aria-valuetext', `${resolvedLayout[key]}px`);
    }
    if (notify) scheduleLayout();
  }

  let resizeFrame = 0, pendingLayoutFrame = 0, lastSize = '', active = false;
  let drag = null, dragRemovers = [];
  const separatorKeys = ['leftWidth', 'rightWidth', 'paletteHeight', 'frameHeight'];
  const currentValue = (key, layout = resolvedLayout) => layout[key];
  function stopEvent(event) {
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
  }
  function cleanDragListeners() {
    for (const remove of dragRemovers.splice(0)) remove();
  }
  function finishResize({ commit = false } = {}) {
    if (!drag) return;
    const finished = drag; drag = null;
    cleanDragListeners();
    shell.classList.remove('is-resizing'); doc.body.classList.remove('draw-desktop-resizing');
    if (pendingLayoutFrame) { win.cancelAnimationFrame(pendingLayoutFrame); pendingLayoutFrame = 0; }
    if (commit) {
      preferences = finished.pending;
      applyLayout(preferences, false);
      writeDrawDesktopPreferences(preferences);
      scheduleLayout();
    } else applyLayout(finished.before);
    try { if (finished.separator.hasPointerCapture?.(finished.pointerId)) finished.separator.releasePointerCapture(finished.pointerId); } catch { /* Pointer may already have been released. */ }
  }
  function dragEvent(target, type, handler) {
    target.addEventListener(type, handler, true);
    dragRemovers.push(() => target.removeEventListener(type, handler, true));
  }
  function beginResize(event) {
    const separator = event.target.closest?.('[data-layout-separator]');
    if (!separator || event.button !== 0 || event.isPrimary === false || drag) return;
    const key = separator.dataset.layoutSeparator;
    if (!separatorKeys.includes(key)) return;
    stopEvent(event);
    try { cancelInput(); } catch { /* Keep resizing available if a tool has no active input. */ }
    separator.focus({ preventScroll: true });
    const base = { ...preferences, [key]: currentValue(key) };
    drag = {
      separator, pointerId: event.pointerId, key, startX: event.clientX, startY: event.clientY,
      before: preferences, base, pending: base
    };
    shell.classList.add('is-resizing'); doc.body.classList.add('draw-desktop-resizing');
    try { separator.setPointerCapture(event.pointerId); } catch { /* Document capture handles browsers without pointer capture. */ }
    const onMove = moveEvent => {
      if (!drag) return;
      stopEvent(moveEvent);
      if (moveEvent.pointerId !== drag.pointerId) return;
      const dx = moveEvent.clientX - drag.startX, dy = moveEvent.clientY - drag.startY;
      const delta = key === 'leftWidth' ? dx : key === 'rightWidth' ? -dx : key === 'paletteHeight' ? dy : -dy;
      drag.pending = resizeDrawDesktopPreference(drag.base, key, delta);
      if (!pendingLayoutFrame) pendingLayoutFrame = win.requestAnimationFrame(() => {
        pendingLayoutFrame = 0;
        if (drag) applyLayout(drag.pending);
      });
    };
    const onUp = upEvent => { if (drag) stopEvent(upEvent); if (drag?.pointerId === upEvent.pointerId) finishResize({ commit: true }); };
    const onCancel = cancelEvent => { if (drag) stopEvent(cancelEvent); if (drag?.pointerId === cancelEvent.pointerId) finishResize(); };
    const onLostCapture = lostEvent => { if (drag?.pointerId === lostEvent.pointerId) finishResize(); };
    const onAdditionalPointerDown = downEvent => { if (drag) stopEvent(downEvent); };
    for (const [type, handler] of [
      ['pointerdown', onAdditionalPointerDown], ['pointermove', onMove], ['pointerup', onUp],
      ['pointercancel', onCancel], ['lostpointercapture', onLostCapture]
    ]) dragEvent(doc, type, handler);
  }
  scope.listen(shell, 'pointerdown', beginResize, { capture: true });
  scope.listen(win, 'blur', () => finishResize());
  scope.listen(shell, 'lostpointercapture', event => { if (drag?.pointerId === event.pointerId) finishResize(); });
  scope.listen(shell, 'keydown', event => {
    const separator = event.target.closest?.('[data-layout-separator]');
    if (!separator) return;
    const key = separator.dataset.layoutSeparator, bounds = resolvedLayout.limits[key];
    let value = currentValue(key), step = event.shiftKey ? 32 : 8;
    if (event.key === 'Home') value = bounds.min;
    else if (event.key === 'End') value = bounds.max;
    else if (key === 'leftWidth' && event.key === 'ArrowRight' || key === 'rightWidth' && event.key === 'ArrowLeft' || key === 'paletteHeight' && event.key === 'ArrowDown' || key === 'frameHeight' && event.key === 'ArrowUp') value += step;
    else if (key === 'leftWidth' && event.key === 'ArrowLeft' || key === 'rightWidth' && event.key === 'ArrowRight' || key === 'paletteHeight' && event.key === 'ArrowUp' || key === 'frameHeight' && event.key === 'ArrowDown') value -= step;
    else return;
    stopEvent(event);
    try { cancelInput(); } catch { /* Continue with keyboard resizing. */ }
    preferences = setDrawDesktopPreference(preferences, key, value);
    applyLayout(preferences, false); writeDrawDesktopPreferences(preferences); scheduleLayout();
  });
  scope.listen(doc, 'keydown', event => {
    if (!drag || event.key !== 'Escape') return;
    stopEvent(event);
    finishResize();
  }, { capture: true });
  scope.listen($('[data-layout-reset]'), 'click', () => {
    try { cancelInput(); } catch { /* Reset remains available. */ }
    preferences = { ...DRAW_DESKTOP_LAYOUT_DEFAULTS };
    applyLayout(preferences, false); writeDrawDesktopPreferences(preferences); scheduleLayout();
  });

  function updatePressed() {
    for (const node of shell.querySelectorAll('[data-desktop-tool]')) {
      const tool = node.dataset.desktopTool;
      let mode = node.dataset.desktopSelectionMode || '';
      const actual = actualButtons.get(`${tool}:${mode}`) || actualButtons.get(`${tool}:`);
      node.setAttribute('aria-pressed', String(actual?.getAttribute('aria-pressed') === 'true'));
      const commandId = node.dataset.desktopCommand;
      const key = bindingKey(commandId);
      const kbd = node.querySelector('kbd'); if (kbd && kbd.textContent !== key) kbd.textContent = key;
      const text = node.querySelector('.draw-desktop-button__label');
      if (text && node.dataset.desktopTool === 'select' && actual) {
        const label = actual.querySelector('[data-tool-label]')?.textContent || actual.getAttribute('aria-label');
        if (text.textContent !== label) text.textContent = label;
      }
      node.title = keyTip(node.getAttribute('aria-label'), key);
    }
    for (const [command, selector] of [['toggle.grid', '#draw-grid-toggle'], ['toggle.onion', '#draw-onion-toggle']]) {
      const target = shell.querySelector(`[data-desktop-command="${command}"]`), source = root.querySelector(selector);
      if (target && source) target.setAttribute('aria-pressed', source.getAttribute('aria-pressed') === 'true' ? 'true' : 'false');
    }
  }
  const onRootClick = event => {
    const control = event.target.closest?.('[data-desktop-tool], [data-desktop-command]');
    if (!control || control.disabled) return;
    if (control.dataset.desktopTool) {
      const tool = control.dataset.desktopTool;
      const mode = control.dataset.desktopSelectionMode || '';
      const actual = actualButtons.get(`${tool}:${mode}`) || actualButtons.get(`${tool}:`);
      if (actual) assignDrawInput({ side: 'left', kind: 'tool', value: actual.dataset.drawTool, target: actual, event });
    } else if (control.dataset.desktopCommand) {
      const id = control.dataset.desktopCommand;
      if (id === 'toggle.grid') root.querySelector('#draw-grid-toggle')?.click();
      else if (id === 'toggle.onion') root.querySelector('#draw-onion-toggle')?.click();
      else drawShortcuts.run(id);
    }
    win.requestAnimationFrame(updatePressed);
  };
  scope.listen(shell, 'click', onRootClick);
  scope.listen(root, 'click', event => { if (event.target.closest?.('.draw-tool-menu [data-draw-tool]')) win.requestAnimationFrame(updatePressed); });
  scope.listen(win, 'keyup', updatePressed);
  scope.listen(shell, 'pointerover', updatePressed);
  scope.listen(shell, 'focusin', updatePressed);
  scope.listen(doc, 'close', updatePressed, { capture: true });
  scope.listen($('[data-desktop-cell-launcher]'), 'click', () => originalLauncher?.click());
  const isEmbedded = () => { try { return win.self !== win.top; } catch { return true; } };
  function updateActive() {
    const embedded = isEmbedded();
    const allowed = win.innerWidth >= 1100 && win.innerHeight >= 620 && (root.dataset.creationMode || doc.body.dataset.creationMode || 'draw') === 'draw'
      && !doc.body.hasAttribute('data-tool-result-open');
    const wasActive = active, nextActive = Boolean(allowed);
    if (wasActive && !nextActive) finishResize();
    active = nextActive;
    doc.body.classList.toggle('draw-desktop-active', active);
    doc.body.classList.toggle('draw-desktop-embedded', active && embedded);
    if (active) doc.body.dataset.drawLayout = embedded ? 'embedded' : 'desktop'; else delete doc.body.dataset.drawLayout;
    if (active && !wasActive) applyMoves();
    shell.hidden = !active;
    setAnimationLayout(active);
    if (!active && wasActive) {
      restoreMoves();
      win.dispatchEvent(new win.Event('draw-desktop-layout-restored'));
    }
    if (active) { applyLayout(preferences, false); updatePressed(); scheduleLayout(); }
  }
  function scheduleLayout() {
    if (resizeFrame || !active) return;
    resizeFrame = win.requestAnimationFrame(() => { resizeFrame = 0; onLayout(); });
  }
  const ro = new win.ResizeObserver(entries => {
    const entry = entries.find(item => item.target === root);
    if (!entry) return;
    const { width, height } = entry.contentRect; const size = `${Math.round(width)}x${Math.round(height)}`;
    if (size !== lastSize) { lastSize = size; if (active) applyLayout(preferences); }
  });
  ro.observe(root); scope.add(() => ro.disconnect());
  const bodyObserver = new win.MutationObserver(updateActive);
  bodyObserver.observe(doc.body, { attributes: true, attributeFilter: ['data-creation-mode', 'data-tool-result-open'] });
  scope.add(() => bodyObserver.disconnect());
  scope.listen(win, 'resize', updateActive, { passive: true });
  scope.listen(win, 'orientationchange', updateActive, { passive: true });

  scope.add(() => {
    finishResize();
    setAnimationLayout(false);
    doc.body.classList.remove('draw-desktop-active', 'draw-desktop-embedded'); delete doc.body.dataset.drawLayout;
    restoreMoves(); shell.remove();
    style.remove();
    if (resizeFrame) win.cancelAnimationFrame(resizeFrame);
    if (pendingLayoutFrame) win.cancelAnimationFrame(pendingLayoutFrame);
  });
  updateActive();
  return { refresh: updatePressed, layout: updateActive, dispose: () => scope.dispose() };
}

function formatShortcut(binding, platform) {
  if (!binding) return '';
  return binding.split('+').map(part => {
    if (part === 'primary') return platform === 'mac' ? '⌘' : 'Ctrl';
    if (part === 'ctrl') return 'Ctrl'; if (part === 'meta') return '⌘'; if (part === 'alt') return platform === 'mac' ? '⌥' : 'Alt';
    if (part === 'shift') return platform === 'mac' ? '⇧' : 'Shift';
    if (part.startsWith('Key')) return part.slice(3);
    if (part === 'Equal') return '='; if (part === 'Minus') return '−'; if (part === 'Space') return 'Space';
    if (part === 'BracketLeft') return '['; if (part === 'BracketRight') return ']';
    if (part.startsWith('Digit')) return part.slice(5);
    return part;
  }).join(platform === 'mac' ? '' : '+');
}
function keyTip(label, key) { return key ? `${label} · ${key}` : label; }
