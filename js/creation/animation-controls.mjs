/** Compact, host-agnostic frame and layer controls shared by Draw and Audio modes. */
export function mountAnimationControls({ host, scope, getState, onAction, getFramePreview, getCelHasContent: getCelContent, onionControlExternal = false, frameOnly = false, dismissibleMenus = false } = {}) {
  if (!host?.ownerDocument || !scope || typeof getState !== 'function' || typeof onAction !== 'function') throw new TypeError('Animation controls require a host, lifecycle scope, state reader, and action handler');
  const document = host.ownerDocument;
  let disposed = false;
  let pending = 0;
  const removeListeners = [];
  let collapsed = null;
  let longPressTimer = 0;
  let suppressClick = false;
  let menuFrameId = null;
  let menuLayerId = null;
  let menuReturnFocus = null;
  let draggedFrameId = null;
  let draggedLayerId = null;
  let pointerHold = null;
  let liftedHeader = null;
  let root; let frames; let frameMenu; let layers; let timing; let workspacePanel = null; let workspaceSelection = null; let celToolbar = null;
  let status; let frameToggle; let frameToggleBadge = null; let layerToggle; let timingToggle; let workspaceOpen = false;
  let playButton = null;
  let lastCelFrames = null; let lastCelLayers = null; let celContentCache = new Map();
  let lastPreviewFrames = null; let lastPreviewSelection = undefined;
  let refreshQueued = false; let refreshFrame = 0; let requestedPlaybackFrameId = null; let appliedPlaybackFrameId = null; let playbackDirty = true; let workspaceDirty = true; let layerListDirty = true;
  let playbackColumnNodes = new Map();
  let celFrameHeaders = new Map(); let celLayerHeaders = new Map(); let celNodes = new Map();
  let lastGridSnapshot = null; let controlsDirty = true; let lastControlSignature = null; let lastControlFrames = null; let lastControlLayers = null;
  let desktopActive = false; let desktopLayerHost = null; let desktopFrameHost = null; let desktopLayersParent = null; let desktopLayersNextSibling = null;
  let desktopFramePane = null; let desktopFrames = null; let desktopFolded = false;
  let desktopFrameButtons = new Map();
  let desktopPlaybackNodes = new Map();
  const hasCelMatrix = !frameOnly && typeof getCelContent === 'function';
  const hasWorkspace = hasCelMatrix || frameOnly;

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const setAttr = (element, name, value) => { const text = String(value); if (element.getAttribute(name) !== text) element.setAttribute(name, text); };
  const setData = (element, name, value) => { const text = String(value); if (element.dataset[name] !== text) element.dataset[name] = text; };
  const setText = (element, value) => { const text = String(value); if (element.textContent !== text) element.textContent = text; };
  const setClass = (element, name, enabled) => { if (element.classList.contains(name) !== Boolean(enabled)) element.classList.toggle(name, Boolean(enabled)); };
  const setBoolean = (element, name, value) => { const next = Boolean(value); if (element[name] !== next) element[name] = next; };
  const findChildClass = (element, name) => Array.from(element.children).find(child => child.classList.contains(name)) || null;
  function placeChildren(parent, desired) {
    for (let index = 0; index < desired.length; index += 1) {
      if (parent.children[index] !== desired[index]) parent.insertBefore(desired[index], parent.children[index] || null);
    }
    while (parent.children.length > desired.length) parent.removeChild(parent.children[parent.children.length - 1]);
  }
  const button = (label, glyph, action, className = '') => {
    const element = node('button', `animation-controls__button ${className}`.trim(), glyph);
    element.type = 'button'; element.title = label; element.setAttribute('aria-label', label);
    if (action) element.dataset.action = action;
    return element;
  };
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const add = (tag, attrs) => {
      const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
      svg.append(shape);
    };
    const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (name === 'locked') {
      add('rect', { ...stroke, x: '5', y: '10', width: '14', height: '11', rx: '2' });
      add('path', { ...stroke, d: 'M8 10V7a4 4 0 0 1 8 0v3' });
    } else if (name === 'unlocked') {
      add('rect', { ...stroke, x: '5', y: '10', width: '14', height: '11', rx: '2' });
      add('path', { ...stroke, d: 'M8 10V7a4 4 0 0 1 7-2.6' });
    } else if (name === 'pause') {
      add('path', { ...stroke, d: 'M9 5v14M15 5v14' });
    } else if (name === 'play') {
      add('path', { ...stroke, d: 'm8 5 11 7-11 7z' });
    } else if (name === 'frames') {
      add('rect', { ...stroke, x: '7', y: '7', width: '13', height: '13', rx: '2' });
      add('path', { ...stroke, d: 'M16 4H6a2 2 0 0 0-2 2v10' });
    } else if (name === 'cel') {
      add('rect', { ...stroke, x: '4', y: '4', width: '7', height: '7', rx: '1' });
      add('rect', { ...stroke, x: '13', y: '4', width: '7', height: '7', rx: '1' });
      add('rect', { ...stroke, x: '4', y: '13', width: '7', height: '7', rx: '1' });
      add('rect', { ...stroke, x: '13', y: '13', width: '7', height: '7', rx: '1' });
    }
    return svg;
  };
  const replaceButtonIcon = (element, name) => { element.replaceChildren(icon(name)); };
  const listen = (...args) => { const remove = scope.listen(...args); if (typeof remove === 'function') removeListeners.push(remove); };
  function createDom() {
    root = node('section', 'animation-controls'); root.classList.toggle('is-frame-only', frameOnly); root.setAttribute('aria-label', frameOnly ? 'フレーム操作' : 'アニメーション操作');
    const toolbar = node('div', 'animation-controls__toolbar');
    frameToggle = button(frameOnly ? 'フレームを開く' : 'レイヤーとフレームを開く', hasWorkspace ? '' : '▤', 'toggle-frames', hasWorkspace ? 'animation-controls__workspace-launcher' : 'animation-controls__frame-toggle');
    if (hasWorkspace) {
      replaceButtonIcon(frameToggle, frameOnly ? 'frames' : 'cel');
      frameToggleBadge = node('span', 'animation-controls__workspace-badge', frameOnly ? 'F1' : 'L1/F1');
      frameToggle.append(frameToggleBadge);
    }
    toolbar.append(frameToggle);
    toolbar.append(button('前のコマ', '‹', 'previous-frame'));
    toolbar.append(button('次のコマ', '›', 'next-frame'));
    toolbar.append(button('コマを複製して追加', '+', 'add-frame'));
    const durationButton = button('選択コマのFPS', 'FPS', 'toggle-duration');
    timingToggle = durationButton; toolbar.append(durationButton);
    const layerButton = button('レイヤー', '▤', 'toggle-layers');
    layerToggle = layerButton; if (!frameOnly) toolbar.append(layerButton);
    playButton = button('再生', '▶', 'play', 'animation-controls__play');
    toolbar.append(playButton);
    if (!onionControlExternal) toolbar.append(button('オニオンスキン', '◉', 'onion'));
    toolbar.append(button('GIFを書き出す', 'GIF', 'export-gif', 'animation-controls__export'));

    frames = node('div', 'animation-controls__frames');
    frames.dataset.frameStrip = 'true'; frames.setAttribute('role', 'listbox'); frames.setAttribute('aria-label', 'コマ');
    frameMenu = node('div', 'animation-controls__frame-menu'); frameMenu.dataset.frameMenu = 'true'; frameMenu.hidden = true; frameMenu.setAttribute('role', 'group'); frameMenu.setAttribute('aria-label', 'コマの操作');
    frameMenu.setAttribute('role', 'group'); frameMenu.setAttribute('aria-label', '選択セルの操作');
    if (!hasCelMatrix) {
      for (const [label, glyph, command] of [['複製', '＋', 'duplicate'], ['空白', '□', 'blank'], ['左へ', '←', 'left'], ['右へ', '→', 'right'], ['削除', '×', 'delete']]) {
        const actionButton = button(label, glyph, 'frame-menu'); actionButton.dataset.frameMenuAction = command; frameMenu.append(actionButton);
      }
    }

    layers = node('div', 'animation-controls__layers'); layers.hidden = true; layers.setAttribute('role', 'group'); layers.setAttribute('aria-label', 'レイヤー操作');
    const layerHeading = node('div', 'animation-controls__panel-heading', 'レイヤー');
    layerHeading.append(button('レイヤーパネルを閉じる', '×', 'close-layers'));
    const layerList = node('div', 'animation-controls__layer-list'); layerList.dataset.layerList = 'true';
    const addLayer = button('レイヤーを追加', '+', 'add-layer', 'animation-controls__wide-button');
    layers.append(layerHeading, layerList, addLayer);

    timing = node('div', 'animation-controls__timing'); timing.hidden = true; timing.setAttribute('role', 'group'); timing.setAttribute('aria-label', 'コマのFPS');
    const timingHeading = node('div', 'animation-controls__panel-heading', '選択コマのFPS');
    const timingClose = button('FPS設定を閉じる', '×', 'close-duration');
    const fpsPreset = node('select', 'animation-controls__fps-preset');
    fpsPreset.dataset.fpsPreset = 'true'; fpsPreset.setAttribute('aria-label', '選択コマのFPSプリセット');
    for (const [label, value] of [['プリセット', ''], ['5 FPS', '5'], ['10 FPS', '10'], ['12.5 FPS', '12.5'], ['20 FPS', '20'], ['25 FPS', '25'], ['50 FPS', '50']]) {
      const option = node('option', '', label); option.value = value; fpsPreset.append(option);
    }
    const durationInput = node('input', 'animation-controls__duration-input');
    durationInput.type = 'number'; durationInput.min = String(1000 / 60000); durationInput.max = '50'; durationInput.step = 'any';
    durationInput.setAttribute('aria-label', '選択中コマのFPS'); durationInput.dataset.durationInput = 'true';
    const timingUnit = node('span', 'animation-controls__unit', 'FPS');
    timingHeading.append(timingClose); timing.append(timingHeading, fpsPreset, durationInput, timingUnit, node('p', 'animation-controls__timing-note', 'GIFは20ms以上・10ms単位で書き出します。'));

    status = node('span', 'animation-controls__status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    if (hasWorkspace) {
      workspacePanel = node('section', 'animation-controls__workspace-panel');
      workspacePanel.id = `${host.id || 'animation-controls'}-panel`;
      workspacePanel.hidden = true; workspacePanel.setAttribute('role', 'dialog'); workspacePanel.setAttribute('aria-modal', 'false');
      workspacePanel.classList.toggle('is-frame-only', frameOnly);
      workspacePanel.setAttribute('aria-label', frameOnly ? 'フレーム' : 'レイヤー・フレーム');
      frameToggle.setAttribute('aria-controls', workspacePanel.id); frameToggle.setAttribute('aria-expanded', 'false');
      const heading = node('div', 'animation-controls__workspace-heading');
      heading.append(node('strong', '', frameOnly ? 'フレーム' : 'レイヤー・フレーム'));
      workspaceSelection = node('span', 'animation-controls__workspace-selection');
      heading.append(playButton);
      const closeWorkspace = button(frameOnly ? 'フレームを閉じる' : 'レイヤー・フレームを閉じる', '×', 'close-animation');
      heading.append(workspaceSelection, closeWorkspace);
      celToolbar = toolbar; celToolbar.hidden = !frameOnly;
      root.append(frameToggle);
      workspacePanel.append(heading, toolbar, frames, status);
    } else root.append(toolbar, frames, status);
    host.replaceChildren(root);
    (document.body || host).append(...(workspacePanel ? [workspacePanel, frameMenu, ...(!frameOnly ? [layers, timing] : [])] : [frameMenu, layers, timing]));
  }

  function stateNow() {
    const state = getState();
    if (!state || !Array.isArray(state.frames) || !Array.isArray(state.layers)) throw new TypeError('Animation state needs frames and layers arrays');
    return state;
  }

  function actionElement(action) {
    return root.querySelector(`[data-action="${action}"]`) || workspacePanel?.querySelector(`[data-action="${action}"]`)
      || desktopFramePane?.querySelector(`[data-action="${action}"]`) || null;
  }

  function setPressed(action, pressed) {
    const target = actionElement(action);
    if (target) setAttr(target, 'aria-pressed', Boolean(pressed));
  }

  function closePanels() { layers.hidden = true; timing.hidden = true; layerListDirty = true; setAttr(layerToggle, 'aria-expanded', 'false'); setAttr(timingToggle, 'aria-expanded', 'false'); }

  function positionWorkspacePanel() {
    if (!workspacePanel || workspacePanel.hidden) return;
    const board = document.querySelector('.draw-board');
    const view = document.defaultView;
    const viewportWidth = view?.innerWidth || 320; const viewportHeight = view?.innerHeight || 568;
    const rect = board?.getBoundingClientRect?.() || { left: 8, right: viewportWidth - 8, top: 8, bottom: viewportHeight - 8, width: viewportWidth - 16, height: viewportHeight - 16 };
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect?.().bottom || 0;
    const width = Math.max(44, Math.min(560, rect.width - 16, viewportWidth - 16));
    const left = Math.max(8, Math.min(viewportWidth - width - 8, rect.right - width - 8));
    const bottom = Math.max(8, Math.min(viewportHeight - 8, viewportHeight - rect.bottom + 8));
    const topLimit = Math.max(8, headerBottom + 8);
    const available = Math.max(0, viewportHeight - bottom - topLimit);
    const contentHeight = 64 + (stateNow().layers.length + 2) * 44;
    const panelHeight = Math.min(360, available, contentHeight);
    workspacePanel.style.left = `${left}px`; workspacePanel.style.bottom = `${bottom}px`;
    workspacePanel.style.width = `${width}px`; workspacePanel.style.maxHeight = `${panelHeight}px`;
    workspacePanel.style.setProperty('--animation-workspace-grid-height', `${Math.max(88, panelHeight - 64)}px`);
  }

  function setWorkspaceOpen(open, { returnFocus = false } = {}) {
    if (!workspacePanel) return;
    workspaceOpen = Boolean(open);
    workspacePanel.hidden = !workspaceOpen;
    workspacePanel.classList.toggle('is-open', workspaceOpen);
    frameToggle.setAttribute('aria-expanded', String(workspaceOpen));
    if (workspaceOpen) {
      if (refreshFrame && document.defaultView?.cancelAnimationFrame) document.defaultView.cancelAnimationFrame(refreshFrame);
      refreshQueued = false; refreshFrame = 0;
      renderRefresh(stateNow()); positionWorkspacePanel();
    }
    else {
      workspaceDirty = true;
      closePanels(); frameMenu.hidden = true; menuFrameId = null;
      if (returnFocus) frameToggle.focus();
    }
  }

  function onOutsidePointerDown(event) {
    if (!workspaceOpen) return;
    const target = event.target;
    if ([root, workspacePanel, frameMenu, layers, timing].some((container) => container?.contains(target))) return;
    setWorkspaceOpen(false);
  }

  async function dispatch(action) {
    if (disposed || scope.disposed) return;
    pending += 1; refresh();
    try {
      const result = onAction(action);
      if (result && typeof result.then === 'function') await result;
      if (!disposed && !scope.disposed) { status.textContent = ''; refresh(); }
    } catch (error) {
      if (!disposed && !scope.disposed) { status.textContent = error?.message || '操作できませんでした'; refresh(); }
    } finally {
      pending = Math.max(0, pending - 1);
      if (!disposed && !scope.disposed) refresh();
    }
  }

  function addPreview(frame, selectedIndex, index, existingItem = null) {
    if (typeof getFramePreview !== 'function' || (!frameOnly && Math.abs(index - selectedIndex) > 1)) return;
    try {
      const preview = getFramePreview(frame.id);
      if (preview?.nodeType) {
        const clone = preview.cloneNode(true); clone.classList?.add('animation-controls__preview');
        clone.setAttribute?.('aria-hidden', 'true');
        const item = existingItem || frameElement(frame.id);
        item?.prepend(clone);
      } else if (preview && preview.data && Number.isInteger(preview.width) && Number.isInteger(preview.height)) {
        const item = existingItem || frameElement(frame.id);
        const canvas = node('canvas', 'animation-controls__preview'); canvas.width = preview.width; canvas.height = preview.height;
        canvas.setAttribute('aria-hidden', 'true'); canvas.getContext('2d')?.putImageData(preview, 0, 0); item?.prepend(canvas);
      }
    } catch { /* Preview is decorative; the frame controls remain usable if it cannot be drawn. */ }
  }

  function frameElement(frameId) {
    const id = String(frameId);
    if (desktopActive && !desktopFolded && desktopFrameButtons.has(id)) return desktopFrameButtons.get(id);
    return [...frames.querySelectorAll('[data-action="select-frame"]')].find((item) => item.dataset.frameId === id);
  }

  function renderFrameStrip(state, strip = frames, { desktop = false } = {}) {
    const frameList = state.frames;
    frameMenu.hidden = true; menuFrameId = null;
    const scrollLeft = frameOnly ? (Number.isFinite(strip.scrollLeft) ? strip.scrollLeft : 0) : null;
    setAttr(strip, 'role', 'listbox'); setAttr(strip, 'aria-label', 'コマ');
    if (collapsed === null) collapsed = frameList.length <= 1;
    if (frameList.length > 1 && collapsed === true && !frames.dataset.userCollapsed) collapsed = false;
    if (!desktop) setBoolean(strip, 'hidden', frameOnly ? false : collapsed);
    const stripLabel = `${strip.hidden ? 'コマ一覧を表示' : 'コマ一覧を閉じる'}（${frameList.length}コマ）`;
    if (!desktop) setAttr(frameToggle, 'aria-expanded', frameOnly ? workspaceOpen : !strip.hidden);
    if (!desktop && !frameOnly) { setAttr(frameToggle, 'aria-label', stripLabel); if (frameToggle.title !== stripLabel) frameToggle.title = stripLabel; }
    if (frameOnly) {
      const index = Math.max(0, frameList.findIndex(frame => frame.id === state.frameId));
      const label = `フレームを開く（${index + 1} / ${frameList.length}）`;
      setAttr(frameToggle, 'aria-label', label); if (frameToggle.title !== `フレーム ${index + 1} / ${frameList.length}`) frameToggle.title = `フレーム ${index + 1} / ${frameList.length}`;
      if (frameToggleBadge) setText(frameToggleBadge, `F${index + 1}`);
      if (workspaceSelection) setText(workspaceSelection, `${index + 1} / ${frameList.length}`);
    }
    const selectedIndex = frameList.findIndex((frame) => frame.id === state.frameId);
    const previewRevisionChanged = lastPreviewFrames !== frameList || lastPreviewSelection !== state.frameId || !Object.isFrozen(frameList);
    lastPreviewFrames = frameList; lastPreviewSelection = state.frameId;
    const nextPlaybackNodes = new Map();
    const existing = new Map([...strip.querySelectorAll('[data-action="select-frame"]')].map(item => [item.dataset.frameId, item]));
    const desired = [];
    frameList.forEach((frame, index) => {
      const id = String(frame.id);
      let item = existing.get(id);
      if (!item) { controlsDirty = true; item = button('', '', 'select-frame', 'animation-controls__frame'); item.append(node('span', 'animation-controls__frame-number')); }
      const number = findChildClass(item, 'animation-controls__frame-number');
      setAttr(item, 'aria-label', `コマ ${index + 1} を選択`); setAttr(item, 'aria-selected', frame.id === state.frameId);
      setData(item, 'frameId', id); setData(item, 'index', index); setBoolean(item, 'draggable', !state.readOnly && pending === 0);
      setAttr(item, 'role', 'option'); setClass(item, 'is-selected', frame.id === state.frameId);
      const title = `コマ ${index + 1} を選択${!state.audioMode && Number.isFinite(frame.durationMs) ? ` · ${frame.durationMs}ms` : ''}`;
      if (item.title !== title) item.title = title;
      setText(number, index + 1);
      setClass(item, 'is-playing', String(frame.id) === appliedPlaybackFrameId);
      let previewNode = findChildClass(item, 'animation-controls__preview');
      if (previewRevisionChanged && previewNode) { item.removeChild(previewNode); previewNode = null; }
      if (previewNode && !frameOnly && Math.abs(index - selectedIndex) > 1) item.removeChild(previewNode);
      if (!desktop && typeof getFramePreview === 'function' && !previewNode && (frameOnly || Math.abs(index - selectedIndex) <= 1)) addPreview(frame, selectedIndex, index, item);
      if (desktop) {
        const duration = findChildClass(item, 'animation-controls__frame-duration') || node('span', 'animation-controls__frame-duration');
        setText(duration, Number.isFinite(frame.durationMs) ? `${frame.durationMs}ms` : '');
        if (!duration.parentElement) item.append(duration);
        const indicator = findChildClass(item, 'animation-controls__frame-content');
        const contentKey = JSON.stringify([frame.id, state.layerId]);
        let hasContent = false;
        if (!state.audioMode && typeof getCelContent === 'function' && state.layerId != null) {
          hasContent = celContentCache.get(contentKey);
          if (hasContent === undefined) { hasContent = Boolean(getCelContent(frame.id, state.layerId)); celContentCache.set(contentKey, hasContent); }
        }
        if (hasContent && !indicator) item.append(node('span', 'animation-controls__frame-content', '●'));
        else if (!hasContent && indicator) item.removeChild(indicator);
      }
      nextPlaybackNodes.set(id, [item]);
      desired.push(item);
    });
    placeChildren(strip, desired);
    if (!desktop) playbackColumnNodes = nextPlaybackNodes;
    if (frameOnly) strip.scrollLeft = scrollLeft;
  }

  function renderDesktopFramePane(state) {
    if (!desktopActive || desktopFolded || !desktopFrames || !desktopFramePane) return;
    const immutableMetadata = Object.isFrozen(state.frames) && state.frames.every(Object.isFrozen) && Object.isFrozen(state.layers) && state.layers.every(Object.isFrozen);
    if (lastCelFrames !== state.frames || lastCelLayers !== state.layers || !immutableMetadata) {
      celContentCache = new Map(); lastCelFrames = state.frames; lastCelLayers = state.layers;
    }
    renderFrameStrip(state, desktopFrames, { desktop: true });
    desktopFrameButtons = new Map([...desktopFrames.querySelectorAll('[data-action="select-frame"]')].map(item => [String(item.dataset.frameId), item]));
    for (const item of desktopFrameButtons.values()) setBoolean(item, 'disabled', Boolean(state.readOnly) || pending > 0);
    const blank = desktopFramePane.querySelector('[data-action="desktop-blank-frame"]');
    const add = desktopFramePane.querySelector('[data-action="desktop-add-frame"]');
    const selectedIndex = state.frames.findIndex(frame => frame.id === state.frameId);
    if (blank) { setData(blank, 'frameId', state.frameId); setBoolean(blank, 'disabled', Boolean(state.readOnly) || pending > 0 || state.frames.length >= 128); }
    if (add) setBoolean(add, 'disabled', Boolean(state.readOnly) || pending > 0 || state.frames.length >= 128);
    setBoolean(desktopFramePane.querySelector('[data-action="desktop-delete-frame"]'), 'disabled', Boolean(state.readOnly) || pending > 0 || state.frames.length <= 1);
    setBoolean(desktopFramePane.querySelector('[data-action="desktop-move-frame-left"]'), 'disabled', Boolean(state.readOnly) || pending > 0 || selectedIndex <= 0);
    setBoolean(desktopFramePane.querySelector('[data-action="desktop-move-frame-right"]'), 'disabled', Boolean(state.readOnly) || pending > 0 || selectedIndex < 0 || selectedIndex >= state.frames.length - 1);
    desktopPlaybackNodes = new Map([...desktopFrameButtons].map(([id, item]) => [id, [item]]));
    for (const [id, item] of desktopFrameButtons) setClass(item, 'is-playing', Boolean(state.playing && state.playbackFrameId != null && id === String(state.playbackFrameId)));
  }

  function createDesktopFramePane() {
    desktopFramePane = node('section', 'animation-controls__desktop-frames');
    const actions = node('div', 'animation-controls__desktop-frame-actions');
    actions.append(button('空白フレームを追加', '空白', 'desktop-blank-frame'));
    actions.append(button('フレームを複製して追加', '+', 'desktop-add-frame'));
    actions.append(button('選択フレームを削除', '削除', 'desktop-delete-frame'));
    actions.append(button('選択フレームを左へ移動', '←', 'desktop-move-frame-left'));
    actions.append(button('選択フレームを右へ移動', '→', 'desktop-move-frame-right'));
    desktopFrames = node('div', 'animation-controls__desktop-frame-list');
    desktopFrames.dataset.desktopFrameStrip = 'true';
    desktopFramePane.append(actions, desktopFrames);
    foldDesktopPane(desktopFolded);
    for (const type of ['click', 'keydown', 'contextmenu', 'dblclick', 'pointerdown', 'dragstart', 'dragover', 'drop', 'dragend']) {
      const listener = type === 'click' ? onClick : type === 'keydown' ? onKeydown : type === 'contextmenu' ? onContextMenu : type === 'dblclick' ? onDoubleClick : type === 'pointerdown' ? onPointerDown : type === 'dragstart' ? onDragStart : type === 'dragover' ? onDragOver : type === 'drop' ? onDrop : () => { draggedFrameId = null; };
      listen(desktopFramePane, type, listener);
    }
  }

  function foldDesktopPane(folded) {
    desktopFolded = Boolean(folded);
    if (!desktopFramePane) return;
    desktopFramePane.classList.toggle('is-collapsed', desktopFolded);
    if (desktopFrameHost) setData(desktopFrameHost, 'desktopFolded', desktopFolded);
    if (desktopFrames) setBoolean(desktopFrames, 'hidden', desktopFolded);
    const actions = desktopFramePane.querySelector('.animation-controls__desktop-frame-actions');
    if (actions) setBoolean(actions, 'hidden', desktopFolded);
  }

  function setDesktopFramesFolded(folded) {
    if (!desktopActive) { desktopFolded = Boolean(folded); return; }
    foldDesktopPane(folded);
    if (desktopFolded) playbackDirty = true;
    else {
      const state = stateNow(); renderDesktopFramePane(state);
      showPlaybackFrame(state.playing ? state.playbackFrameId ?? null : null);
    }
  }

  function setDesktopLayout({ active = false, layerHost = null, frameHost = null } = {}) {
    const nextActive = Boolean(active && !frameOnly && hasCelMatrix && layerHost?.append && frameHost?.append);
    if (nextActive && desktopActive && desktopLayerHost === layerHost && desktopFrameHost === frameHost) return;
    if (desktopActive) {
      if (desktopFramePane?.parentElement === desktopFrameHost) desktopFrameHost.removeChild(desktopFramePane);
      if (layers.parentElement === desktopLayerHost) {
        if (desktopLayersNextSibling?.parentElement === desktopLayersParent) desktopLayersParent.insertBefore(layers, desktopLayersNextSibling);
        else (desktopLayersParent || document.body || host).append(layers);
      }
      layers.hidden = true;
      layers.classList.toggle('animation-controls__desktop-layers', false);
      if (layers.dataset.desktopLayout) delete layers.dataset.desktopLayout;
      desktopLayerHost?.removeAttribute?.('data-desktop-layout');
      desktopFrameHost?.removeAttribute?.('data-desktop-layout');
      if (desktopLayerHost?.dataset?.desktopLayout) delete desktopLayerHost.dataset.desktopLayout;
      if (desktopFrameHost?.dataset?.desktopLayout) delete desktopFrameHost.dataset.desktopLayout;
    }
    desktopActive = false; desktopLayerHost = null; desktopFrameHost = null;
    if (!nextActive) { layerListDirty = true; workspaceDirty = true; refresh(); return; }
    desktopLayerHost = layerHost; desktopFrameHost = frameHost; desktopActive = true;
    if (!desktopFramePane) createDesktopFramePane();
    if (layers.parentElement !== desktopLayerHost) {
      desktopLayersParent = layers.parentElement;
      desktopLayersNextSibling = layers.nextSibling || null;
      desktopLayerHost.append(layers);
    }
    layers.hidden = false;
    layers.classList.toggle('animation-controls__desktop-layers', true);
    setData(layers, 'desktopLayout', 'active');
    setData(desktopLayerHost, 'desktopLayout', 'active');
    setData(desktopFrameHost, 'desktopLayout', 'active');
    if (desktopFramePane.parentElement !== desktopFrameHost) desktopFrameHost.append(desktopFramePane);
    layerListDirty = true; workspaceDirty = true;
    const state = stateNow(); renderLayers(state); renderDesktopFramePane(state); showPlaybackFrame(state.playing ? state.playbackFrameId ?? null : null);
  }

  function renderCelGrid(state) {
    const frameList = state.frames;
    frameMenu.hidden = true; menuFrameId = null;
    const scrollLeft = frames.scrollLeft; const scrollTop = frames.scrollTop;
    setBoolean(frames, 'hidden', false);
    const frameIndex = Math.max(0, frameList.findIndex((frame) => frame.id === state.frameId));
    const layerIndex = Math.max(0, state.layers.findIndex((layer) => layer.id === state.layerId));
    const selectionLabel = `レイヤー ${layerIndex + 1}、コマ ${frameIndex + 1}`;
    setAttr(frameToggle, 'aria-expanded', workspaceOpen); setAttr(frameToggle, 'aria-label', `レイヤーとフレームを開く。${selectionLabel}`);
    if (frameToggle.title !== selectionLabel) frameToggle.title = selectionLabel;
    if (frameToggleBadge) setText(frameToggleBadge, `L${layerIndex + 1}/F${frameIndex + 1}`);
    if (workspaceSelection) setText(workspaceSelection, selectionLabel);
    setClass(frames, 'is-cel-grid', true);
    const frameCount = String(frameList.length + 1);
    const currentFrameCount = frames.style.getPropertyValue?.('--animation-frame-count') || frames.style['--animation-frame-count'] || '';
    if (currentFrameCount !== frameCount) frames.style.setProperty('--animation-frame-count', frameCount);
    setAttr(frames, 'role', 'grid'); setAttr(frames, 'aria-label', 'レイヤーとコマ');
    const immutableMetadata = Object.isFrozen(state.frames) && state.frames.every(Object.isFrozen) && Object.isFrozen(state.layers) && state.layers.every(Object.isFrozen);
    if (lastCelFrames !== state.frames || lastCelLayers !== state.layers || !immutableMetadata) { celContentCache = new Map(); lastCelFrames = state.frames; lastCelLayers = state.layers; }
    const old = [...frames.children];
    const keyed = new Map();
    for (const item of old) {
      const key = item.dataset.gridKey;
      if (key) keyed.set(key, item);
    }
    const take = (key, make) => { let item = keyed.get(key); if (item) keyed.delete(key); else { controlsDirty = true; item = make(); } setData(item, 'gridKey', key); return item; };
    const desired = [];
    const nextPlaybackNodes = new Map();
    const nextFrameHeaders = new Map(); const nextLayerHeaders = new Map(); const nextCelNodes = new Map();
    const corner = take('corner', () => node('span', 'animation-controls__grid-corner'));
    setAttr(corner, 'aria-hidden', 'true'); if (corner.style.gridRow !== '1') corner.style.gridRow = '1'; if (corner.style.gridColumn !== '1') corner.style.gridColumn = '1'; desired.push(corner);
    frameList.forEach((frame, index) => {
      const item = take(`frame:${frame.id}`, () => button('', '', 'select-frame', 'animation-controls__frame'));
      const label = `コマ ${index + 1} を選択`; setAttr(item, 'aria-label', label); setAttr(item, 'aria-selected', frame.id === state.frameId);
      setData(item, 'frameId', frame.id); setData(item, 'index', index); setBoolean(item, 'draggable', false);
      setAttr(item, 'role', 'columnheader'); setAttr(item, 'aria-rowindex', '1'); setAttr(item, 'aria-colindex', index + 2);
      if (item.style.gridRow !== '1') item.style.gridRow = '1'; if (item.style.gridColumn !== String(index + 2)) item.style.gridColumn = String(index + 2);
      setClass(item, 'is-selected', frame.id === state.frameId);
      setClass(item, 'is-playing', String(frame.id) === appliedPlaybackFrameId);
      const title = Number.isFinite(frame.durationMs) ? `${label} · ${frame.durationMs}ms` : label; if (item.title !== title) item.title = title;
      let number = findChildClass(item, 'animation-controls__frame-number'); if (!number) { number = node('span', 'animation-controls__frame-number'); item.append(number); } setText(number, index + 1);
      desired.push(item);
      nextPlaybackNodes.set(String(frame.id), [item]);
      nextFrameHeaders.set(String(frame.id), item);
    });
    const addFrame = take('add-frame', () => button('末尾にコマを複製して追加', '+', 'add-frame', 'animation-controls__grid-add animation-controls__frame-add'));
    setAttr(addFrame, 'role', 'columnheader'); setAttr(addFrame, 'aria-label', 'コマを追加'); setAttr(addFrame, 'aria-rowindex', '1'); setAttr(addFrame, 'aria-colindex', frameList.length + 2);
    if (addFrame.style.gridRow !== '1') addFrame.style.gridRow = '1'; if (addFrame.style.gridColumn !== String(frameList.length + 2)) addFrame.style.gridColumn = String(frameList.length + 2); desired.push(addFrame);
    const orderedLayers = state.layers.map((layer, modelIndex) => ({ layer, modelIndex })).reverse();
    orderedLayers.forEach(({ layer, modelIndex }, rowIndex) => {
      const musicLayer = layer.role === 'music'; const layerLabel = musicLayer ? '音楽（全コマ共通）' : `レイヤー ${modelIndex + 1}`; const row = rowIndex + 2;
      const header = take(`layer:${layer.id}`, () => button('', musicLayer ? '音楽' : '', 'select-layer', 'animation-controls__layer-number'));
      setAttr(header, 'aria-label', `${layerLabel}を選択`); setData(header, 'layerId', layer.id); setData(header, 'layerRole', musicLayer ? 'music' : '');
      setText(header, musicLayer ? '音楽' : modelIndex + 1);
      setAttr(header, 'role', 'rowheader'); setAttr(header, 'aria-rowindex', row); setAttr(header, 'aria-colindex', '1');
      if (header.style.gridRow !== String(row)) header.style.gridRow = String(row); if (header.style.gridColumn !== '1') header.style.gridColumn = '1';
      setAttr(header, 'aria-pressed', layer.id === state.layerId); setClass(header, 'is-selected', layer.id === state.layerId);
      const headerTitle = `${musicLayer ? layerLabel : layer.name || layerLabel}を選択`; if (header.title !== headerTitle) header.title = headerTitle;
      desired.push(header);
      nextLayerHeaders.set(String(layer.id), header);
      frameList.forEach((frame, columnIndex) => {
        const key = JSON.stringify([frame.id, layer.id]);
        const cell = take(`cell:${frame.id}:${layer.id}`, () => button('', '', 'select-cel', 'animation-controls__cel'));
        let hasContent = celContentCache.get(key);
        if (hasContent === undefined) { hasContent = Boolean(getCelHasContent(frame.id, layer.id)); celContentCache.set(key, hasContent); }
        const selected = frame.id === state.frameId && layer.id === state.layerId;
        const label = `コマ ${columnIndex + 1}、${layerLabel}${hasContent ? '（描画あり）' : '（空）'}`;
        setAttr(cell, 'aria-label', label); setData(cell, 'frameId', frame.id); setData(cell, 'layerId', layer.id); setData(cell, 'hasContent', hasContent);
        setAttr(cell, 'role', 'gridcell'); setAttr(cell, 'aria-rowindex', row); setAttr(cell, 'aria-colindex', columnIndex + 2);
        if (cell.style.gridRow !== String(row)) cell.style.gridRow = String(row); if (cell.style.gridColumn !== String(columnIndex + 2)) cell.style.gridColumn = String(columnIndex + 2);
        setAttr(cell, 'aria-selected', selected); setClass(cell, 'is-selected', selected);
        setClass(cell, 'is-playing', String(frame.id) === appliedPlaybackFrameId);
        let mark = findChildClass(cell, 'animation-controls__cel-mark');
        if (hasContent && !mark) { mark = node('span', 'animation-controls__cel-mark', '●'); cell.append(mark); }
        else if (!hasContent && mark) cell.removeChild(mark);
        desired.push(cell);
        nextPlaybackNodes.get(String(frame.id)).push(cell);
        nextCelNodes.set(JSON.stringify([frame.id, layer.id]), cell);
      });
    });
    const addLayer = take('add-layer', () => button('レイヤーを追加', '+', 'add-layer', 'animation-controls__grid-add animation-controls__layer-add'));
    setAttr(addLayer, 'role', 'rowheader'); setAttr(addLayer, 'aria-label', 'レイヤーを追加'); setAttr(addLayer, 'aria-rowindex', state.layers.length + 2); setAttr(addLayer, 'aria-colindex', '1');
    if (addLayer.style.gridRow !== String(state.layers.length + 2)) addLayer.style.gridRow = String(state.layers.length + 2); if (addLayer.style.gridColumn !== '1') addLayer.style.gridColumn = '1'; desired.push(addLayer);
    placeChildren(frames, desired);
    playbackColumnNodes = nextPlaybackNodes;
    celFrameHeaders = nextFrameHeaders; celLayerHeaders = nextLayerHeaders; celNodes = nextCelNodes;
    for (const stale of keyed.values()) if (stale.parentElement === frames) frames.removeChild(stale);
    if (frames.scrollLeft !== scrollLeft) frames.scrollLeft = scrollLeft; if (frames.scrollTop !== scrollTop) frames.scrollTop = scrollTop;
    lastGridSnapshot = { frames: state.frames, layers: state.layers, frameId: state.frameId, layerId: state.layerId,
      audioMode: Boolean(state.audioMode), readOnly: Boolean(state.readOnly), playing: Boolean(state.playing),
      playbackFrameId: state.playbackFrameId ?? null, onion: Boolean(state.onion) };
  }

  function getCelHasContent(frameId, layerId) {
    return typeof getCelContent === 'function' ? getCelContent(frameId, layerId) : false;
  }

  function renderLayers(state) {
    const list = layers.querySelector('[data-layer-list]');
    const orderedLayers = state.layers.map((layer, modelIndex) => ({ layer, modelIndex })).reverse();
    const hasMusicLayer = state.layers.some((layer) => layer.role === 'music');
    const normalLayerCount = state.layers.filter((layer) => layer.role !== 'music').length;
    const old = new Map([...list.children].map(row => [row.dataset.layerId, row]));
    const desired = [];
    for (const { layer, modelIndex } of orderedLayers) {
      const id = String(layer.id), musicLayer = layer.role === 'music';
      const layerLabel = musicLayer ? '音楽（全コマ共通）' : layer.name || `レイヤー ${modelIndex + 1}`;
      let row = old.get(id);
      if (!row) {
        controlsDirty = true;
        row = node('div', 'animation-controls__layer'); row.dataset.layerId = id;
        const select = button('', '', 'select-layer', 'animation-controls__layer-name');
        const rename = node('input', 'animation-controls__rename'); rename.type = 'text'; rename.maxLength = 80; rename.dataset.renameLayer = id;
        const eye = button('', '', 'visibility'); eye.dataset.layerId = id;
        const lock = button('', '', 'lock'); lock.dataset.layerId = id;
        const up = button('レイヤーを上へ', '↑', 'move-layer-up'); up.dataset.layerId = id;
        const down = button('レイヤーを下へ', '↓', 'move-layer-down'); down.dataset.layerId = id;
        const remove = button('レイヤーを削除', '×', 'delete-layer'); remove.dataset.layerId = id;
        row.append(select, rename, eye, lock, up, down, remove);
      } else old.delete(id);
      const [select, rename, eye, lock, up, down, remove] = row.children;
      setClass(row, 'is-selected', layer.id === state.layerId);
      setText(select, layerLabel); setAttr(select, 'aria-label', layerLabel); setAttr(select, 'aria-pressed', layer.id === state.layerId); setData(select, 'layerId', id);
      const name = String(layer.name || ''); if (rename.value !== name && document.activeElement !== rename) rename.value = name;
      setAttr(rename, 'aria-label', `${layerLabel}の名前`); setData(rename, 'renameLayer', id);
      const eyeLabel = layer.visible === false ? 'レイヤーを表示' : 'レイヤーを隠す'; setAttr(eye, 'aria-label', eyeLabel); setText(eye, layer.visible === false ? '○' : '◉'); setAttr(eye, 'aria-pressed', layer.visible !== false);
      const lockLabel = layer.locked ? 'レイヤーのロックを解除' : 'レイヤーをロック'; setAttr(lock, 'aria-label', lockLabel); const lockIcon = layer.locked ? 'locked' : 'unlocked'; if (lock.dataset.iconName !== lockIcon) { replaceButtonIcon(lock, lockIcon); lock.dataset.iconName = lockIcon; } setAttr(lock, 'aria-pressed', Boolean(layer.locked));
      const disabled = Boolean(state.readOnly) || pending > 0;
      setBoolean(rename, 'disabled', disabled || musicLayer || Boolean(layer.locked));
      setBoolean(eye, 'disabled', disabled); setBoolean(lock, 'disabled', disabled);
      setBoolean(up, 'disabled', disabled || Boolean(layer.locked) || modelIndex === state.layers.length - 1 || musicLayer);
      setBoolean(down, 'disabled', disabled || Boolean(layer.locked) || modelIndex === (hasMusicLayer ? 1 : 0) || musicLayer);
      setBoolean(remove, 'disabled', disabled || Boolean(layer.locked) || state.layers.length <= 1 || musicLayer);
      desired.push(row);
    }
    placeChildren(list, desired);
    for (const row of old.values()) if (row.parentElement === list) list.removeChild(row);
    const add = layers.querySelector('[data-action="add-layer"]'); setBoolean(add, 'disabled', Boolean(state.readOnly) || pending > 0 || normalLayerCount >= 8);
    layerListDirty = false;
  }

  function showPlaybackFrame(frameId) {
    if (disposed) return;
    const nextId = frameId === null || frameId === undefined ? null : String(frameId);
    if (nextId === requestedPlaybackFrameId && !playbackDirty) return;
    requestedPlaybackFrameId = nextId;
    const workspaceVisible = (!workspacePanel || !workspacePanel.hidden) && !frames.hidden;
    const desktopVisible = desktopActive && !desktopFolded;
    if (!workspaceVisible && !desktopVisible) { playbackDirty = true; return; }
    const previous = appliedPlaybackFrameId;
    if (workspaceVisible) {
      if (previous !== null && previous !== undefined) for (const item of playbackColumnNodes.get(previous) ?? []) setClass(item, 'is-playing', false);
      if (nextId !== null) for (const item of playbackColumnNodes.get(nextId) ?? []) setClass(item, 'is-playing', true);
    }
    if (desktopVisible) {
      if (previous !== null && previous !== undefined) for (const item of desktopPlaybackNodes.get(previous) ?? []) setClass(item, 'is-playing', false);
      if (nextId !== null) for (const item of desktopPlaybackNodes.get(nextId) ?? []) setClass(item, 'is-playing', true);
    }
    appliedPlaybackFrameId = nextId; playbackDirty = false;
    if (nextId !== null && workspaceVisible && workspaceSelection) {
      const state = stateNow(), index = state.frames.findIndex(frame => String(frame.id) === nextId);
      setText(workspaceSelection, `再生 ${index + 1} / ${state.frames.length}`);
    }
  }

  function updateCelSelectionOnly(state) {
    const previous = lastGridSnapshot;
    if (!previous || !workspaceOpen || state.audioMode || !Object.isFrozen(state.frames) || !state.frames.every(Object.isFrozen)
      || !Object.isFrozen(state.layers) || !state.layers.every(Object.isFrozen)
      || state.frames !== previous.frames || state.layers !== previous.layers
      || Boolean(state.audioMode) !== previous.audioMode || Boolean(state.readOnly) !== previous.readOnly
      || Boolean(state.playing) !== previous.playing || (state.playbackFrameId ?? null) !== previous.playbackFrameId
      || Boolean(state.onion) !== previous.onion) return false;
    if (state.frameId === previous.frameId && state.layerId === previous.layerId) return true;
    const frameIndex = state.frames.findIndex(frame => frame.id === state.frameId);
    const layerIndex = state.layers.findIndex(layer => layer.id === state.layerId);
    if (frameIndex < 0 || layerIndex < 0) return false;
    const selectionLabel = `レイヤー ${layerIndex + 1}、コマ ${frameIndex + 1}`;
    const frameToggleLabel = `レイヤーとフレームを開く。${selectionLabel}`;
    setAttr(frameToggle, 'aria-expanded', workspaceOpen); setAttr(frameToggle, 'aria-label', frameToggleLabel);
    if (frameToggle.title !== selectionLabel) frameToggle.title = selectionLabel;
    if (frameToggleBadge) setText(frameToggleBadge, `L${layerIndex + 1}/F${frameIndex + 1}`);
    if (workspaceSelection) {
      const playbackIndex = state.frames.findIndex(frame => frame.id === state.playbackFrameId);
      setText(workspaceSelection, state.playing && state.playbackFrameId != null
        ? `再生 ${playbackIndex + 1} / ${state.frames.length}` : selectionLabel);
    }
    if (previous.frameId !== state.frameId) {
      const oldFrame = celFrameHeaders.get(String(previous.frameId)); const newFrame = celFrameHeaders.get(String(state.frameId));
      if (oldFrame) { setAttr(oldFrame, 'aria-selected', false); setClass(oldFrame, 'is-selected', false); }
      if (newFrame) { setAttr(newFrame, 'aria-selected', true); setClass(newFrame, 'is-selected', true); }
    }
    if (previous.layerId !== state.layerId) {
      const oldLayer = celLayerHeaders.get(String(previous.layerId)); const newLayer = celLayerHeaders.get(String(state.layerId));
      if (oldLayer) { setAttr(oldLayer, 'aria-pressed', false); setClass(oldLayer, 'is-selected', false); }
      if (newLayer) { setAttr(newLayer, 'aria-pressed', true); setClass(newLayer, 'is-selected', true); }
    }
    if (previous.frameId !== state.frameId || previous.layerId !== state.layerId) {
      const oldCell = celNodes.get(JSON.stringify([previous.frameId, previous.layerId]));
      const newCell = celNodes.get(JSON.stringify([state.frameId, state.layerId]));
      if (oldCell) { setAttr(oldCell, 'aria-selected', false); setClass(oldCell, 'is-selected', false); }
      if (newCell) { setAttr(newCell, 'aria-selected', true); setClass(newCell, 'is-selected', true); }
    }
    lastGridSnapshot = { ...previous, frameId: state.frameId, layerId: state.layerId };
    return true;
  }

  function syncPromptControls(state) {
    const pendingDisabled = pending > 0;
    if (frameToggleBadge) {
      const frameIndex = Math.max(0, state.frames.findIndex(frame => frame.id === state.frameId));
      if (frameOnly || desktopActive) {
        setText(frameToggleBadge, `F${frameIndex + 1}`);
        setAttr(frameToggle, 'aria-label', `フレームを開く（${frameIndex + 1} / ${state.frames.length}）`);
        const title = `フレーム ${frameIndex + 1} / ${state.frames.length}`;
        if (frameToggle.title !== title) frameToggle.title = title;
      } else if (hasCelMatrix && !state.audioMode) {
        const layerIndex = Math.max(0, state.layers.findIndex(layer => layer.id === state.layerId));
        const selectionLabel = `レイヤー ${layerIndex + 1}、コマ ${frameIndex + 1}`;
        setText(frameToggleBadge, `L${layerIndex + 1}/F${frameIndex + 1}`);
        setAttr(frameToggle, 'aria-label', `レイヤーとフレームを開く。${selectionLabel}`);
        if (frameToggle.title !== selectionLabel) frameToggle.title = selectionLabel;
      } else {
        const stripLabel = `${frames.hidden ? 'コマ一覧を表示' : 'コマ一覧を閉じる'}（${state.frames.length}コマ）`;
        setAttr(frameToggle, 'aria-label', stripLabel);
        if (frameToggle.title !== stripLabel) frameToggle.title = stripLabel;
        if (frameToggleBadge) setText(frameToggleBadge, `L1/F${frameIndex + 1}`);
      }
    }
    const signature = [pendingDisabled, Boolean(state.readOnly), state.audioMode, state.frames.length,
      state.layers.filter(layer => layer.role !== 'music').length, workspaceOpen, !layers.hidden, frameOnly].join('|');
    const needsScan = controlsDirty || signature !== lastControlSignature || state.frames !== lastControlFrames || state.layers !== lastControlLayers;
    if (needsScan) {
      const visibleControls = [...root.querySelectorAll('button'), ...(workspacePanel && workspaceOpen ? [...workspacePanel.querySelectorAll('button')] : []), ...(!layers.hidden ? [...layers.querySelectorAll('button')] : []), ...(desktopActive && !desktopFolded ? [...desktopFramePane.querySelectorAll('button')] : [])];
      for (const control of visibleControls) {
      const action = control.dataset.action;
      if (action === 'play' || action === 'onion' || action === 'export-gif' || action === 'toggle-frames' || action === 'toggle-layers' || action === 'toggle-duration' || action === 'close-frame-menu' || action === 'close-animation' || action === 'close-layers' || action === 'close-duration' || action === 'desktop-fold-frames') continue;
      let disabled;
      if (layers.contains(control) && action !== 'add-layer') {
        const layerId = control.dataset.layerId || control.dataset.renameLayer;
        const index = state.layers.findIndex(layer => String(layer.id) === String(layerId));
        const layer = index >= 0 ? state.layers[index] : null;
        const musicLayer = layer?.role === 'music';
        const locked = Boolean(layer?.locked);
        if (!layer) disabled = true;
        else if (action === 'select-layer') disabled = pendingDisabled;
        else if (control.dataset.renameLayer) disabled = Boolean(state.readOnly) || pendingDisabled || locked || musicLayer;
        else if (action === 'visibility' || action === 'lock') disabled = Boolean(state.readOnly) || pendingDisabled;
        else if (action === 'move-layer-up') disabled = Boolean(state.readOnly) || pendingDisabled || locked || musicLayer || index === state.layers.length - 1;
        else if (action === 'move-layer-down') disabled = Boolean(state.readOnly) || pendingDisabled || locked || musicLayer || index === (state.layers.some(item => item.role === 'music') ? 1 : 0);
        else if (action === 'delete-layer') disabled = Boolean(state.readOnly) || pendingDisabled || locked || musicLayer || state.layers.length <= 1;
        else disabled = Boolean(state.readOnly) || pendingDisabled;
      } else if (action === 'add-layer') disabled = Boolean(state.readOnly) || pendingDisabled || state.layers.filter(layer => layer.role !== 'music').length >= 8;
      else disabled = ['select-frame', 'select-layer', 'select-cel', 'previous-frame', 'next-frame'].includes(action) ? pendingDisabled : Boolean(state.readOnly) || pendingDisabled;
      setBoolean(control, 'disabled', disabled);
      }
      controlsDirty = false; lastControlSignature = signature; lastControlFrames = state.frames; lastControlLayers = state.layers;
    }
    const selectedIndex = state.frames.findIndex(frame => frame.id === state.frameId);
    const previous = actionElement('previous-frame'); if (previous) setBoolean(previous, 'disabled', pendingDisabled || selectedIndex <= 0);
    const next = actionElement('next-frame'); if (next) setBoolean(next, 'disabled', pendingDisabled || selectedIndex < 0 || selectedIndex >= state.frames.length - 1);
    const addFrame = actionElement('add-frame'); if (addFrame) setBoolean(addFrame, 'disabled', Boolean(state.readOnly) || pendingDisabled || state.frames.length >= 128);
    const play = actionElement('play'); if (play) setBoolean(play, 'disabled', pendingDisabled || (!state.playing && (state.readOnly || (!state.audioMode && state.frames.length < 2))));
    const onion = actionElement('onion'); if (onion) setBoolean(onion, 'disabled', pendingDisabled || state.frames.length < 2);
    const fps = timing.querySelector('[data-duration-input]'); if (fps) setBoolean(fps, 'disabled', Boolean(state.readOnly) || pendingDisabled || selectedIndex < 0);
    const preset = timing.querySelector('[data-fps-preset]'); if (preset) setBoolean(preset, 'disabled', Boolean(state.readOnly) || pendingDisabled || selectedIndex < 0);
  }

  function renderRefresh(state) {
    if (disposed || scope.disposed) return;
    root.classList.toggle('is-audio', Boolean(state.audioMode));
    for (const portal of [workspacePanel, frameMenu, layers, timing]) portal?.classList.toggle('is-audio', Boolean(state.audioMode));
    for (const action of ['play', 'onion', 'toggle-duration']) { const control = actionElement(action); if (control) setBoolean(control, 'hidden', Boolean(state.audioMode)); }
    if (state.audioMode) { setBoolean(timing, 'hidden', true); setAttr(timingToggle, 'aria-expanded', 'false'); }
    if (workspacePanel && workspacePanel.hidden) workspaceDirty = true;
    else if (workspaceDirty) {
      if (!state.audioMode && typeof getCelContent === 'function') {
        if (!updateCelSelectionOnly(state)) renderCelGrid(state);
      }
      else { setClass(frames, 'is-cel-grid', false); renderFrameStrip(state); }
      workspaceDirty = false;
    }
    if (frameOnly) setBoolean(layerToggle, 'hidden', true);
    else if (desktopActive) {
      layers.hidden = false;
      if (layerListDirty) renderLayers(state);
    }
    else if (layers.hidden) layerListDirty = true;
    else if (layerListDirty) renderLayers(state);
    const selected = state.frames.find((frame) => frame.id === state.frameId);
    const durationInput = timing.querySelector('[data-duration-input]');
    const currentDurationMs = Number.isFinite(selected?.durationMs) ? selected.durationMs : 100;
    const currentFps = Number((1000 / currentDurationMs).toPrecision(12));
    if (durationInput.value !== String(currentFps)) durationInput.value = String(currentFps);
    if (durationInput.dataset.currentFps !== String(currentFps)) durationInput.dataset.currentFps = String(currentFps);
    setBoolean(timing.querySelector('[data-fps-preset]'), 'disabled', Boolean(state.readOnly) || pending > 0 || !selected);
    setPressed('play', state.playing); setPressed('onion', state.onion);
    const buttonEl = actionElement('play');
    if (buttonEl) {
      const iconName = state.playing ? 'pause' : 'play';
      if (buttonEl.dataset.iconName !== iconName) { replaceButtonIcon(buttonEl, iconName); buttonEl.dataset.iconName = iconName; }
      const label = state.playing ? '再生を止める' : '再生'; setAttr(buttonEl, 'aria-label', label); if (buttonEl.title !== label) buttonEl.title = label;
    }
    const exportGif = actionElement('export-gif'); if (exportGif) setBoolean(exportGif, 'hidden', Boolean(state.audioMode));
    showPlaybackFrame(state.playing ? state.playbackFrameId ?? null : null);
    syncPromptControls(state);
    if (workspaceOpen) positionWorkspacePanel();
    if (desktopActive) renderDesktopFramePane(state);
  }

  function refresh() {
    if (disposed || scope.disposed) return;
    workspaceDirty = true; layerListDirty = true;
    const state = stateNow(); syncPromptControls(state);
    const raf = document.defaultView?.requestAnimationFrame;
    if (typeof raf !== 'function') { renderRefresh(state); return; }
    if (refreshQueued) return;
    refreshQueued = true;
    refreshFrame = raf.call(document.defaultView, () => { refreshQueued = false; refreshFrame = 0; if (!disposed && !scope.disposed) renderRefresh(stateNow()); });
  }

  function request(action) { void dispatch(action); }
  function closeCellMenu({ returnFocus = false } = {}) {
    clearLongPress(); pointerHold = null; suppressClick = false;
    frameMenu.hidden = true; menuFrameId = null; menuLayerId = null;
    if (returnFocus && menuReturnFocus?.isConnected) menuReturnFocus.focus({ preventScroll: true });
    menuReturnFocus = null;
  }
  function openCellMenu(kind, id, target) {
    if (!hasWorkspace || !workspacePanel) return;
    const state = stateNow();
    menuFrameId = kind === 'frame' ? id : null; menuLayerId = kind === 'layer' ? id : null;
    frameMenu.replaceChildren(); menuReturnFocus = target;
    if (dismissibleMenus) {
      const heading = node('div', 'draw-panel-header'); heading.append(node('strong', '', kind === 'frame' ? 'コマの操作' : 'レイヤーの操作'));
      const close = button('操作メニューを閉じる', '×', 'close-frame-menu', 'draw-panel-close'); heading.append(close); frameMenu.append(heading);
    }
    const add = (label, glyph, command, disabled = false) => {
      const control = button(label, glyph, 'frame-menu', 'animation-controls__context-action');
      control.dataset.frameMenuAction = command; control.disabled = disabled;
      control.append(node('span', 'animation-controls__context-label', label)); frameMenu.append(control); return control;
    };
    if (kind === 'frame') {
      const index = state.frames.findIndex((frame) => frame.id === id); if (index < 0) return;
      frameMenu.setAttribute('aria-label', `コマ ${index + 1} の操作`);
      add('複製して追加', '＋', 'duplicate', state.readOnly || pending > 0 || state.frames.length >= 128);
      add('空白コマを追加', '□', 'blank', state.readOnly || pending > 0 || state.frames.length >= 128);
      if (!state.audioMode) add('表示時間', '◷', 'duration', state.readOnly || pending > 0);
      if (frameOnly || desktopActive) {
        add('左へ移動', '←', 'left', state.readOnly || pending > 0 || index <= 0);
        add('右へ移動', '→', 'right', state.readOnly || pending > 0 || index >= state.frames.length - 1);
      }
      if (!state.audioMode && !onionControlExternal) add(state.onion ? 'オニオンスキンを解除' : 'オニオンスキン', '◉', 'onion', pending > 0 || state.frames.length < 2);
      add('削除', '×', 'delete', state.readOnly || pending > 0 || state.frames.length <= 1);
    } else {
      const layer = state.layers.find((item) => item.id === id); if (!layer) return;
      frameMenu.setAttribute('aria-label', `${layer.name || 'レイヤー'}の操作`);
      const musicLayer = layer.role === 'music';
      add(layer.visible === false ? '表示する' : '隠す', layer.visible === false ? '○' : '◉', 'visibility', state.readOnly || pending > 0);
      const lock = add(layer.locked ? 'ロック解除' : 'ロック', '', 'lock', state.readOnly || pending > 0);
      replaceButtonIcon(lock, layer.locked ? 'unlocked' : 'locked');
      lock.append(node('span', 'animation-controls__context-label', layer.locked ? 'ロック解除' : 'ロック'));
      const rename = node('input', 'animation-controls__context-rename'); rename.type = 'text'; rename.value = String(layer.name || ''); rename.maxLength = 80;
      rename.dataset.contextRename = String(layer.id); rename.setAttribute('aria-label', 'レイヤー名'); rename.disabled = musicLayer || state.readOnly || pending > 0 || Boolean(layer.locked); rename.placeholder = 'レイヤー名'; frameMenu.append(rename);
      add('名前を適用', '✓', 'rename', rename.disabled);
      add('削除', '×', 'delete-layer', musicLayer || state.readOnly || pending > 0 || state.layers.length <= 1 || Boolean(layer.locked));
    }
    frameMenu.classList.toggle('is-cel-menu', true); frameMenu.classList.toggle('is-layer-menu', kind === 'layer');
    frameMenu.hidden = false;
    const rect = target.getBoundingClientRect(); const view = document.defaultView;
    const viewportWidth = view?.innerWidth || 320; const viewportHeight = view?.innerHeight || 568;
    const width = Math.min(kind === 'frame' ? 252 : 220, viewportWidth - 16);
    frameMenu.style.left = `${Math.max(8, Math.min(viewportWidth - width - 8, rect.left))}px`;
    frameMenu.style.width = `${width}px`;
    const menuHeight = Math.min(frameMenu.getBoundingClientRect().height || (kind === 'frame' ? 100 : 170), viewportHeight - 16);
    frameMenu.style.top = `${Math.max(8, Math.min(viewportHeight - menuHeight - 8, rect.bottom + 4))}px`;
    frameMenu.querySelector('button:not(:disabled)')?.focus();
  }

  function menuAction(command, target) {
    const state = stateNow();
    if (menuLayerId) {
      const layerId = menuLayerId; const layer = state.layers.find((item) => item.id === layerId);
      if (!layer) return;
      if (command === 'visibility') request({ type: 'visibility', layerId, visible: layer.visible === false });
      else if (command === 'lock') request({ type: 'lock', layerId, locked: !layer.locked });
      else if (command === 'delete-layer') request({ type: 'delete-layer', layerId });
      else if (command === 'rename') {
        const input = frameMenu.querySelector('[data-context-rename]'); const name = input?.value.trim();
        if (name && name !== layer.name) request({ type: 'rename-layer', layerId, name });
      }
      frameMenu.hidden = true; menuLayerId = null; return;
    }
    const index = state.frames.findIndex((frame) => frame.id === menuFrameId);
    suppressClick = false;
    if (index < 0) return;
    const frameId = menuFrameId; frameMenu.hidden = true; menuFrameId = null;
    if (command === 'duplicate' && state.frames.length < 128) request({ type: 'add-frame', frameId, copy: true });
    else if (command === 'blank' && state.frames.length < 128) request({ type: 'add-frame', frameId, copy: false });
    else if (command === 'delete') request({ type: 'delete-frame', frameId });
    else if (command === 'duration') {
      request({ type: 'select-frame', frameId }); timing.hidden = false; timingToggle?.setAttribute('aria-expanded', 'true');
    } else if (command === 'onion') request({ type: 'onion', enabled: !state.onion });
    else if (command === 'left' && index > 0) request({ type: 'move-frame', frameId, index: index - 1 });
    else if (command === 'right' && index < state.frames.length - 1) request({ type: 'move-frame', frameId, index: index + 1 });
  }

  function onClick(event) {
    const target = event.target.closest?.('button, input');
    if (!target || ![root, workspacePanel, frameMenu, layers, timing, desktopFramePane].some((container) => container?.contains(target))) return;
    if (target.matches('input')) return;
    const state = stateNow(); const action = target.dataset.action;
    if (action === 'close-frame-menu') { closeCellMenu({ returnFocus: true }); return; }
    if (action === 'frame-menu') { menuAction(target.dataset.frameMenuAction, target); return; }
    if (action === 'toggle-frames') {
      if (workspacePanel) { setWorkspaceOpen(!workspaceOpen); return; }
      collapsed = !collapsed; frames.dataset.userCollapsed = 'true'; frames.hidden = collapsed; frameToggle.setAttribute('aria-expanded', String(!collapsed)); return;
    }
    if (action === 'close-animation') { setWorkspaceOpen(false, { returnFocus: true }); return; }
    if (action === 'toggle-layers') { if (desktopActive) { layers.hidden = false; return; } timing.hidden = true; layers.hidden = !layers.hidden; layerToggle.setAttribute('aria-expanded', String(!layers.hidden)); timingToggle.setAttribute('aria-expanded', 'false'); if (!layers.hidden && layerListDirty) renderLayers(stateNow()); return; }
    if (action === 'close-layers') { layers.hidden = desktopActive ? false : true; layerToggle.setAttribute('aria-expanded', 'false'); if (dismissibleMenus) layerToggle.focus({ preventScroll: true }); return; }
    if (action === 'desktop-blank-frame') { request({ type: 'add-frame', frameId: target.dataset.frameId || state.frameId, copy: false }); return; }
    if (action === 'desktop-add-frame') { request({ type: 'add-frame', frameId: state.frameId, copy: true }); return; }
    if (action === 'desktop-delete-frame') { if (state.frames.length > 1) request({ type: 'delete-frame', frameId: state.frameId }); return; }
    if (action === 'desktop-move-frame-left' || action === 'desktop-move-frame-right') {
      const index = state.frames.findIndex(frame => frame.id === state.frameId);
      const next = index + (action === 'desktop-move-frame-left' ? -1 : 1);
      if (index >= 0 && state.frames[next]) request({ type: 'move-frame', frameId: state.frameId, index: next }); return;
    }
    if (action === 'toggle-duration') { layers.hidden = true; timing.hidden = !timing.hidden; timingToggle.setAttribute('aria-expanded', String(!timing.hidden)); layerToggle.setAttribute('aria-expanded', 'false'); return; }
    if (action === 'close-duration') { timing.hidden = true; timingToggle.setAttribute('aria-expanded', 'false'); if (dismissibleMenus) (menuReturnFocus?.isConnected ? menuReturnFocus : timingToggle).focus({ preventScroll: true }); return; }
    if (action === 'previous-frame' || action === 'next-frame') {
      const current = state.frames.findIndex((frame) => frame.id === state.frameId); const next = current + (action === 'previous-frame' ? -1 : 1);
      if (state.frames[next]) request({ type: 'select-frame', frameId: state.frames[next].id }); return;
    }
    if (action === 'select-frame') { if (suppressClick) { suppressClick = false; return; } request({ type: 'select-frame', frameId: target.dataset.frameId }); return; }
    if (action === 'select-cel') { request({ type: 'select-frame', frameId: target.dataset.frameId, layerId: target.dataset.layerId }); return; }
    if (action === 'add-frame') {
      const sourceFrameId = target.classList.contains('animation-controls__frame-add') ? state.frames.at(-1)?.id : undefined;
      request({ type: 'add-frame', ...(sourceFrameId ? { frameId: sourceFrameId } : {}), copy: true }); return;
    }
    if (action === 'select-layer') { if (suppressClick) { suppressClick = false; return; } request({ type: 'select-layer', layerId: target.dataset.layerId }); return; }
    if (action === 'visibility') {
      const layer = state.layers.find((item) => item.id === target.dataset.layerId); if (layer) request({ type: 'visibility', layerId: layer.id, visible: layer.visible === false }); return;
    }
    if (action === 'lock') {
      const layer = state.layers.find((item) => item.id === target.dataset.layerId); if (layer) request({ type: 'lock', layerId: layer.id, locked: !layer.locked }); return;
    }
    if (action === 'move-layer-up' || action === 'move-layer-down') {
      const index = state.layers.findIndex((item) => item.id === target.dataset.layerId); const to = index + (action === 'move-layer-up' ? 1 : -1);
      if (index >= 0) request({ type: 'move-layer', layerId: target.dataset.layerId, index: to }); return;
    }
    if (action === 'delete-layer') { request({ type: 'delete-layer', layerId: target.dataset.layerId }); return; }
    if (action === 'add-layer') { request({ type: 'add-layer' }); return; }
    if (action === 'play') { request({ type: 'play', playing: !state.playing }); return; }
    if (action === 'onion') { request({ type: 'onion', enabled: !state.onion }); return; }
    if (action === 'export-gif') { request({ type: 'export-gif' }); return; }
  }

  function applyFrameFps(target, fps) {
    const state = stateNow(); const frame = state.frames.find((item) => item.id === state.frameId);
    const minFps = 1000 / 60000;
    const durationMs = 1000 / fps;
    if (frame && fps === Number(target.dataset.currentFps)) return;
    if (frame && Number.isFinite(fps) && fps >= minFps && fps <= 50 && durationMs >= 20 && durationMs <= 60000) request({ type: 'duration', frameId: frame.id, durationMs });
    else { status.textContent = `GIF用FPSは${Number(minFps.toPrecision(6))}〜50の範囲で指定してください`; refresh(); }
  }

  function onChange(event) {
    const target = event.target;
    if (target.matches('[data-fps-preset]')) {
      const fps = Number(target.value);
      target.value = '';
      if (fps > 0) applyFrameFps(timing.querySelector('[data-duration-input]'), fps);
      return;
    }
    if (target.matches('[data-duration-input]')) applyFrameFps(target, Number(target.value));
  }

  function onBlur(event) {
    const target = event.target;
    if (!target.matches('[data-rename-layer]')) return;
    const layerId = target.dataset.renameLayer; const name = target.value.trim(); const layer = stateNow().layers.find((item) => item.id === layerId);
    if (layer && layer.role !== 'music' && name && name !== layer.name) request({ type: 'rename-layer', layerId, name });
  }

  function onKeydown(event) {
    // Native project/file dialogs own the keyboard while they are open.
    if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (dismissibleMenus && !frameMenu.hidden) { closeCellMenu({ returnFocus: true }); return; }
      if (dismissibleMenus && !timing.hidden) { timing.hidden = true; (menuReturnFocus?.isConnected ? menuReturnFocus : timingToggle).focus({ preventScroll: true }); return; }
      if (workspacePanel && workspaceOpen) { setWorkspaceOpen(false, { returnFocus: true }); return; }
      closePanels(); frameMenu.hidden = true; menuFrameId = null; return;
    }
    const target = event.target.closest?.('[data-action="select-frame"], [data-action="select-layer"]');
    if (hasWorkspace && target && ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu')) {
      event.preventDefault(); openCellMenu(target.dataset.frameId ? 'frame' : 'layer', target.dataset.frameId || target.dataset.layerId, target); return;
    }
    const frameTarget = target?.matches?.('[data-action="select-frame"]') ? target : null;
    if (!frameTarget || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const state = stateNow(); const index = state.frames.findIndex((frame) => frame.id === frameTarget.dataset.frameId); const next = state.frames[index + (event.key === 'ArrowLeft' ? -1 : 1)];
    if (next) { request({ type: 'select-frame', frameId: next.id }); frameElement(next.id)?.focus(); }
  }
  function onContextMenu(event) {
    if (!hasWorkspace) return;
    const target = event.target.closest?.('[data-action="select-frame"], [data-action="select-layer"]');
    if (!target || (!workspacePanel?.contains(target) && !desktopFramePane?.contains(target))) return;
    event.preventDefault(); openCellMenu(target.dataset.frameId ? 'frame' : 'layer', target.dataset.frameId || target.dataset.layerId, target);
  }
  function onDoubleClick(event) {
    if (!hasWorkspace) return;
    const target = event.target.closest?.('[data-action="select-frame"], [data-action="select-layer"]');
    if (!target || (!workspacePanel?.contains(target) && !desktopFramePane?.contains(target))) return;
    event.preventDefault(); openCellMenu(target.dataset.frameId ? 'frame' : 'layer', target.dataset.frameId || target.dataset.layerId, target);
  }

  function onPointerDown(event) {
    const target = event.target.closest?.(hasCelMatrix ? '[data-action="select-frame"], [data-action="select-layer"]' : '[data-action="select-frame"]'); if (!target || stateNow().readOnly || pending > 0) return;
    if (target.dataset.layerId && stateNow().layers.find((layer) => layer.id === target.dataset.layerId)?.role === 'music') return;
    if (pointerHold && pointerHold.pointerId !== event.pointerId) return;
    clearLongPress();
    if (hasCelMatrix) {
      pointerHold = { target, type: target.dataset.frameId ? 'frame' : 'layer', id: target.dataset.frameId || target.dataset.layerId, pointerId: event.pointerId, x: event.clientX || 0, y: event.clientY || 0, lifted: false };
      longPressTimer = scope.timeout(() => {
        if (disposed || scope.disposed || !pointerHold) return;
        pointerHold.lifted = true; liftedHeader = target; target.classList.add('is-lifted');
        target.setPointerCapture?.(event.pointerId);
      }, 350);
      return;
    }
    const frameId = target.dataset.frameId;
    if (frameOnly) pointerHold = { target, type: 'frame', id: frameId, pointerId: event.pointerId, x: event.clientX || 0, y: event.clientY || 0, lifted: false };
    longPressTimer = scope.timeout(() => {
      if (disposed || scope.disposed) return;
      if (frameOnly) { openCellMenu('frame', frameId, target); suppressClick = true; scope.timeout(() => { suppressClick = false; }, 500); return; }
      menuFrameId = frameId; frameMenu.hidden = false; suppressClick = true;
      const frameIndex = stateNow().frames.findIndex((frame) => frame.id === frameId);
      for (const control of frameMenu.querySelectorAll('button')) {
        control.dataset.frameId = frameId;
        control.disabled = (control.dataset.frameMenuAction === 'delete' && stateNow().frames.length <= 1)
          || (control.dataset.frameMenuAction === 'left' && frameIndex <= 0)
          || (control.dataset.frameMenuAction === 'right' && frameIndex >= stateNow().frames.length - 1);
      }
      const rect = target.getBoundingClientRect(); const viewportWidth = document.defaultView?.innerWidth || 320;
      frameMenu.style.left = `${Math.max(8, Math.min(viewportWidth - 252, rect.left))}px`;
      frameMenu.style.top = `${Math.max(8, rect.top - 48)}px`;
      scope.timeout(() => { suppressClick = false; }, 500);
    }, 520);
  }
  function clearLongPress() { if (longPressTimer) scope.clearTimeout(longPressTimer); longPressTimer = 0; }
  function onPointerMove(event) {
    if (!pointerHold || (pointerHold.pointerId != null && event.pointerId != null && pointerHold.pointerId !== event.pointerId)) return;
    if (!pointerHold.lifted) {
      if (Math.hypot((event.clientX || 0) - pointerHold.x, (event.clientY || 0) - pointerHold.y) > 8) { clearLongPress(); pointerHold = null; }
      return;
    }
    event.preventDefault?.();
    for (const strip of [frames, desktopFrames]) for (const header of strip?.querySelectorAll('[data-action="select-frame"], [data-action="select-layer"]') || []) header.classList.toggle('is-drop-target', false);
    const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('[data-action="select-frame"], [data-action="select-layer"]');
    if ((target && target.dataset.frameId && pointerHold.type === 'frame') || (target && target.dataset.layerId && pointerHold.type === 'layer')) target.classList.add('is-drop-target');
    pointerHold.over = target || null;
  }
  function onPointerEnd(event) {
    if (!pointerHold) return;
    if (pointerHold.pointerId != null && event?.pointerId != null && pointerHold.pointerId !== event.pointerId) return;
    clearLongPress();
    const hold = pointerHold; pointerHold = null;
    if (liftedHeader) { liftedHeader.classList.toggle('is-lifted', false); liftedHeader = null; }
    for (const strip of [frames, desktopFrames]) for (const header of strip?.querySelectorAll('[data-action="select-frame"], [data-action="select-layer"]') || []) header.classList.toggle('is-drop-target', false);
    if (!hold.lifted) return;
    suppressClick = true;
    const target = hold.over || document.elementFromPoint?.(event?.clientX, event?.clientY)?.closest?.('[data-action="select-frame"], [data-action="select-layer"]');
    scope.timeout(() => { suppressClick = false; }, 400);
    if (!target) return;
    if (target === hold.target) { openCellMenu(hold.type, hold.id, hold.target); return; }
    const state = stateNow();
    if (hold.type === 'frame' && target.dataset.frameId) {
      const index = Number(target.dataset.index);
      if (Number.isInteger(index)) request({ type: 'move-frame', frameId: hold.id, index });
    } else if (hold.type === 'layer' && target.dataset.layerId) {
      const row = Number(target.getAttribute('aria-rowindex')) - 2;
      const index = Math.max(state.layers.some((layer) => layer.role === 'music') ? 1 : 0, state.layers.length - 1 - row);
      if (Number.isInteger(index) && index >= 0 && index < state.layers.length) request({ type: 'move-layer', layerId: hold.id, index });
    }
  }
  function onPointerCancel(event) {
    if (pointerHold && pointerHold.pointerId != null && event?.pointerId != null && pointerHold.pointerId !== event.pointerId) return;
    clearLongPress();
    pointerHold = null;
    if (liftedHeader) { liftedHeader.classList.toggle('is-lifted', false); liftedHeader = null; }
    for (const strip of [frames, desktopFrames]) for (const header of strip?.querySelectorAll('[data-action="select-frame"], [data-action="select-layer"]') || []) header.classList.toggle('is-drop-target', false);
  }
  function onDragStart(event) {
    if (hasCelMatrix) { event.preventDefault(); return; }
    const target = event.target.closest?.('[data-action="select-frame"]'); if (!target) return;
    draggedFrameId = target.dataset.frameId; event.dataTransfer?.setData('text/plain', draggedFrameId);
    event.dataTransfer?.setDragImage?.(target, target.clientWidth / 2, target.clientHeight / 2);
  }
  function onDragOver(event) { if (event.target.closest?.('[data-action="select-frame"]')) event.preventDefault(); }
  function onDrop(event) {
    const target = event.target.closest?.('[data-action="select-frame"]'); if (!target || !draggedFrameId) return;
    event.preventDefault(); const index = Number(target.dataset.index); request({ type: 'move-frame', frameId: draggedFrameId, index }); draggedFrameId = null;
  }

  createDom();
  listen(root, 'click', onClick);
  listen(root, 'change', onChange);
  listen(root, 'focusout', onBlur);
  listen(root, 'keydown', onKeydown);
  if (workspacePanel) {
    listen(workspacePanel, 'click', onClick);
    listen(workspacePanel, 'change', onChange);
    listen(workspacePanel, 'focusout', onBlur);
    listen(workspacePanel, 'keydown', onKeydown);
    listen(workspacePanel, 'contextmenu', onContextMenu);
    listen(workspacePanel, 'dblclick', onDoubleClick);
    listen(document, 'pointerdown', onOutsidePointerDown);
    listen(document, 'keydown', onKeydown);
    listen(document, 'pointermove', onPointerMove);
    listen(document, 'pointerup', onPointerEnd);
    listen(document, 'pointercancel', onPointerCancel);
    if (document.defaultView?.addEventListener) listen(document.defaultView, 'resize', positionWorkspacePanel);
  }
  const interactionSurfaces = workspacePanel ? [workspacePanel] : [root];
  for (const surface of interactionSurfaces) {
    listen(surface, 'pointerdown', onPointerDown);
    if (!workspacePanel) {
      listen(surface, 'pointerup', onPointerEnd);
      listen(surface, 'pointercancel', onPointerEnd);
      listen(surface, 'pointerleave', onPointerEnd);
    }
    listen(surface, 'dragstart', onDragStart);
    listen(surface, 'dragover', onDragOver);
    listen(surface, 'drop', onDrop);
    listen(surface, 'dragend', () => { draggedFrameId = null; });
  }
  for (const portal of [frameMenu, layers, timing]) listen(portal, 'click', onClick);
  for (const portal of [frameMenu, layers, timing]) listen(portal, 'keydown', onKeydown);
  listen(layers, 'focusout', onBlur);
  listen(timing, 'change', onChange);
  const api = {
    refresh,
    showPlaybackFrame,
    setDesktopLayout,
    setDesktopFramesFolded,
    get hasOpenPanels() { return workspaceOpen || !frameMenu.hidden || !timing.hidden || (!desktopActive && !layers.hidden); },
    close() {
      clearLongPress(); pointerHold = null; suppressClick = false;
      liftedHeader?.classList.toggle('is-lifted', false); liftedHeader = null;
      frameMenu.hidden = true; menuFrameId = null; menuLayerId = null;
      closePanels();
      if (workspacePanel) setWorkspaceOpen(false);
    },
    dispose() {
      if (disposed) return;
      if (desktopActive) {
        if (desktopFramePane?.parentElement === desktopFrameHost) desktopFrameHost.removeChild(desktopFramePane);
        if (layers.parentElement === desktopLayerHost) {
          if (desktopLayersNextSibling?.parentElement === desktopLayersParent) desktopLayersParent.insertBefore(layers, desktopLayersNextSibling);
          else (desktopLayersParent || document.body || host).append(layers);
        }
        layers.classList.toggle('animation-controls__desktop-layers', false);
        desktopActive = false;
      }
      disposed = true; clearLongPress();
      if (refreshFrame && document.defaultView?.cancelAnimationFrame) document.defaultView.cancelAnimationFrame(refreshFrame);
      refreshQueued = false; refreshFrame = 0;
      pointerHold = null; liftedHeader?.classList.toggle('is-lifted', false); liftedHeader = null;
      for (const remove of removeListeners.splice(0)) remove();
      host.replaceChildren();
      for (const element of [workspacePanel, frameMenu, layers, timing, desktopFramePane]) element?.parentElement?.removeChild(element);
    }
  };
  scope.add(api.dispose);
  refresh();
  return api;
}
