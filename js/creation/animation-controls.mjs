/** Compact, host-agnostic frame and layer controls shared by Draw and Audio modes. */
export function mountAnimationControls({ host, scope, getState, onAction, getFramePreview, getCelHasContent: getCelContent } = {}) {
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
  let draggedFrameId = null;
  let draggedLayerId = null;
  let pointerHold = null;
  let liftedHeader = null;
  let root; let frames; let frameMenu; let layers; let timing; let workspacePanel = null; let workspaceSelection = null; let celToolbar = null;
  let status; let frameToggle; let frameToggleBadge = null; let layerToggle; let timingToggle; let workspaceOpen = false;
  let playButton = null;
  const hasCelMatrix = typeof getCelContent === 'function';

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
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
    root = node('section', 'animation-controls'); root.setAttribute('aria-label', 'アニメーション操作');
    const toolbar = node('div', 'animation-controls__toolbar');
    frameToggle = button('レイヤーとフレームを開く', hasCelMatrix ? '' : '▤', 'toggle-frames', hasCelMatrix ? 'animation-controls__workspace-launcher' : 'animation-controls__frame-toggle');
    if (hasCelMatrix) {
      replaceButtonIcon(frameToggle, 'cel');
      frameToggleBadge = node('span', 'animation-controls__workspace-badge', 'L1/F1');
      frameToggle.append(frameToggleBadge);
    }
    toolbar.append(frameToggle);
    toolbar.append(button('前のコマ', '‹', 'previous-frame'));
    toolbar.append(button('次のコマ', '›', 'next-frame'));
    toolbar.append(button('コマを複製して追加', '+', 'add-frame'));
    const durationButton = button('表示時間', '◷', 'toggle-duration');
    timingToggle = durationButton; toolbar.append(durationButton);
    const layerButton = button('レイヤー', '▤', 'toggle-layers');
    layerToggle = layerButton; toolbar.append(layerButton);
    playButton = button('再生', '▶', 'play', 'animation-controls__play');
    toolbar.append(playButton);
    toolbar.append(button('オニオンスキン', '◉', 'onion'));
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

    timing = node('div', 'animation-controls__timing'); timing.hidden = true; timing.setAttribute('role', 'group'); timing.setAttribute('aria-label', 'コマの表示時間');
    const timingHeading = node('label', 'animation-controls__panel-heading', 'コマの表示時間');
    const timingClose = button('表示時間を閉じる', '×', 'close-duration');
    const durationInput = node('input', 'animation-controls__duration-input');
    durationInput.type = 'number'; durationInput.min = '20'; durationInput.max = '10000'; durationInput.step = '10';
    durationInput.setAttribute('aria-label', '選択中コマの表示時間（ミリ秒）'); durationInput.dataset.durationInput = 'true';
    timingHeading.append(timingClose); timing.append(timingHeading, durationInput, node('span', 'animation-controls__unit', 'ミリ秒'));

    status = node('span', 'animation-controls__status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    if (hasCelMatrix) {
      workspacePanel = node('section', 'animation-controls__workspace-panel');
      workspacePanel.id = `${host.id || 'animation-controls'}-panel`;
      workspacePanel.hidden = true; workspacePanel.setAttribute('role', 'dialog'); workspacePanel.setAttribute('aria-modal', 'false');
      workspacePanel.setAttribute('aria-label', 'レイヤー・フレーム');
      frameToggle.setAttribute('aria-controls', workspacePanel.id); frameToggle.setAttribute('aria-expanded', 'false');
      const heading = node('div', 'animation-controls__workspace-heading');
      heading.append(node('strong', '', 'レイヤー・フレーム'));
      workspaceSelection = node('span', 'animation-controls__workspace-selection');
      heading.append(playButton);
      const closeWorkspace = button('レイヤー・フレームを閉じる', '×', 'close-animation');
      heading.append(workspaceSelection, closeWorkspace);
      celToolbar = toolbar; celToolbar.hidden = true;
      root.append(frameToggle);
      workspacePanel.append(heading, toolbar, frames, status);
    } else root.append(toolbar, frames, status);
    host.replaceChildren(root);
    (document.body || host).append(...(workspacePanel ? [workspacePanel, frameMenu, layers, timing] : [frameMenu, layers, timing]));
  }

  function stateNow() {
    const state = getState();
    if (!state || !Array.isArray(state.frames) || !Array.isArray(state.layers)) throw new TypeError('Animation state needs frames and layers arrays');
    return state;
  }

  function actionElement(action) {
    return root.querySelector(`[data-action="${action}"]`) || workspacePanel?.querySelector(`[data-action="${action}"]`) || null;
  }

  function setPressed(action, pressed) {
    const target = actionElement(action);
    target?.setAttribute('aria-pressed', String(Boolean(pressed)));
  }

  function closePanels() { layers.hidden = true; timing.hidden = true; layerToggle.setAttribute('aria-expanded', 'false'); timingToggle.setAttribute('aria-expanded', 'false'); }

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
    if (workspaceOpen) positionWorkspacePanel();
    else {
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

  function addPreview(frame, selectedIndex, index) {
    if (typeof getFramePreview !== 'function' || Math.abs(index - selectedIndex) > 1) return;
    try {
      const preview = getFramePreview(frame.id);
      if (preview?.nodeType) {
        const clone = preview.cloneNode(true); clone.classList?.add('animation-controls__preview');
        clone.setAttribute?.('aria-hidden', 'true');
        const item = frameElement(frame.id);
        item?.prepend(clone);
      } else if (preview && preview.data && Number.isInteger(preview.width) && Number.isInteger(preview.height)) {
        const item = frameElement(frame.id);
        const canvas = node('canvas', 'animation-controls__preview'); canvas.width = preview.width; canvas.height = preview.height;
        canvas.setAttribute('aria-hidden', 'true'); canvas.getContext('2d')?.putImageData(preview, 0, 0); item?.prepend(canvas);
      }
    } catch { /* Preview is decorative; the frame controls remain usable if it cannot be drawn. */ }
  }

  function frameElement(frameId) { return [...frames.querySelectorAll('[data-action="select-frame"]')].find((item) => item.dataset.frameId === String(frameId)); }

  function renderFrameStrip(state) {
    const frameList = state.frames;
    frames.setAttribute('role', 'listbox'); frames.setAttribute('aria-label', 'コマ');
    if (collapsed === null) collapsed = frameList.length <= 1;
    if (frameList.length > 1 && collapsed === true && !frames.dataset.userCollapsed) collapsed = false;
    frames.hidden = Boolean(collapsed);
    frameToggle.setAttribute('aria-expanded', String(!frames.hidden));
    frameToggle.setAttribute('aria-label', `${frames.hidden ? 'コマ一覧を表示' : 'コマ一覧を閉じる'}（${frameList.length}コマ）`);
    frameToggle.title = `${frames.hidden ? 'コマ一覧を表示' : 'コマ一覧を閉じる'}（${frameList.length}コマ）`;
    frames.replaceChildren(); frameMenu.hidden = true; menuFrameId = null;
    const selectedIndex = frameList.findIndex((frame) => frame.id === state.frameId);
    frameList.forEach((frame, index) => {
      const item = button(`コマ ${index + 1} を選択`, String(index + 1), 'select-frame', 'animation-controls__frame');
      item.textContent = '';
      item.dataset.frameId = String(frame.id); item.dataset.index = String(index); item.draggable = !state.readOnly && pending === 0;
      item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(frame.id === state.frameId));
      item.classList.toggle('is-selected', frame.id === state.frameId);
      if (Number.isFinite(frame.durationMs)) item.title += ` · ${frame.durationMs}ms`;
      item.append(node('span', 'animation-controls__frame-number', String(index + 1)));
      frames.append(item);
      addPreview(frame, selectedIndex, index);
    });
  }

  function renderCelGrid(state) {
    const frameList = state.frames;
    const scrollLeft = frames.scrollLeft; const scrollTop = frames.scrollTop;
    frames.hidden = false;
    const frameIndex = Math.max(0, frameList.findIndex((frame) => frame.id === state.frameId));
    const layerIndex = Math.max(0, state.layers.findIndex((layer) => layer.id === state.layerId));
    const selectionLabel = `レイヤー ${layerIndex + 1}、コマ ${frameIndex + 1}`;
    frameToggle.setAttribute('aria-expanded', String(workspaceOpen));
    frameToggle.setAttribute('aria-label', `レイヤーとフレームを開く。${selectionLabel}`);
    frameToggle.title = selectionLabel;
    if (frameToggleBadge) frameToggleBadge.textContent = `L${layerIndex + 1}/F${frameIndex + 1}`;
    if (workspaceSelection) workspaceSelection.textContent = selectionLabel;
    frames.classList.add('is-cel-grid');
    frames.style.setProperty('--animation-frame-count', String(frameList.length + 1));
    frames.setAttribute('role', 'grid'); frames.setAttribute('aria-label', 'レイヤーとコマ');
    frames.replaceChildren(); frameMenu.hidden = true; menuFrameId = null;

    const orderedLayers = state.layers.map((layer, modelIndex) => ({ layer, modelIndex })).reverse();
    const corner = node('span', 'animation-controls__grid-corner'); corner.setAttribute('aria-hidden', 'true'); corner.style.gridRow = '1'; corner.style.gridColumn = '1';
    frames.append(corner);
    frameList.forEach((frame, index) => {
      const item = button(`コマ ${index + 1} を選択`, '', 'select-frame', 'animation-controls__frame');
      item.dataset.frameId = String(frame.id); item.dataset.index = String(index); item.draggable = false;
      item.setAttribute('role', 'columnheader'); item.setAttribute('aria-selected', String(frame.id === state.frameId));
      item.setAttribute('aria-rowindex', '1'); item.setAttribute('aria-colindex', String(index + 2));
      item.style.gridRow = '1'; item.style.gridColumn = String(index + 2);
      item.classList.toggle('is-selected', frame.id === state.frameId);
      if (Number.isFinite(frame.durationMs)) item.title += ` · ${frame.durationMs}ms`;
      item.append(node('span', 'animation-controls__frame-number', String(index + 1)));
      frames.append(item);
    });
    const addFrame = button('末尾にコマを複製して追加', '+', 'add-frame', 'animation-controls__grid-add animation-controls__frame-add');
    addFrame.setAttribute('role', 'columnheader'); addFrame.setAttribute('aria-label', 'コマを追加');
    addFrame.setAttribute('aria-rowindex', '1'); addFrame.setAttribute('aria-colindex', String(frameList.length + 2));
    addFrame.style.gridRow = '1'; addFrame.style.gridColumn = String(frameList.length + 2);
    frames.append(addFrame);
    const addLayer = button('レイヤーを追加', '+', 'add-layer', 'animation-controls__grid-add animation-controls__layer-add');
    addLayer.setAttribute('role', 'rowheader'); addLayer.setAttribute('aria-label', 'レイヤーを追加');
    addLayer.setAttribute('aria-rowindex', '2'); addLayer.setAttribute('aria-colindex', '1');
    addLayer.style.gridRow = '2'; addLayer.style.gridColumn = '1';
    frames.append(addLayer);
    orderedLayers.forEach(({ layer, modelIndex }, rowIndex) => {
      const layerNumber = button(`レイヤー ${modelIndex + 1} を選択`, String(modelIndex + 1), 'select-layer', 'animation-controls__layer-number');
      layerNumber.dataset.layerId = String(layer.id); layerNumber.setAttribute('role', 'rowheader');
      layerNumber.setAttribute('aria-rowindex', String(rowIndex + 3)); layerNumber.setAttribute('aria-colindex', '1');
      layerNumber.style.gridRow = String(rowIndex + 3); layerNumber.style.gridColumn = '1';
      layerNumber.setAttribute('aria-pressed', String(layer.id === state.layerId));
      layerNumber.classList.toggle('is-selected', layer.id === state.layerId);
      layerNumber.title = `${layer.name || `レイヤー ${modelIndex + 1}`}を選択`;
      layerNumber.draggable = false;
      frames.append(layerNumber);
      frameList.forEach((frame, columnIndex) => {
        const hasContent = Boolean(getCelHasContent(frame.id, layer.id));
        const isSelected = frame.id === state.frameId && layer.id === state.layerId;
        const label = `コマ ${columnIndex + 1}、レイヤー ${modelIndex + 1}${hasContent ? '（描画あり）' : '（空）'}`;
        const cell = button(label, '', 'select-cel', 'animation-controls__cel');
        cell.dataset.frameId = String(frame.id); cell.dataset.layerId = String(layer.id);
        cell.dataset.hasContent = String(hasContent); cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-rowindex', String(rowIndex + 3)); cell.setAttribute('aria-colindex', String(columnIndex + 2));
        cell.style.gridRow = String(rowIndex + 3); cell.style.gridColumn = String(columnIndex + 2);
        cell.setAttribute('aria-selected', String(isSelected));
        cell.classList.toggle('is-selected', isSelected);
        if (hasContent) cell.append(node('span', 'animation-controls__cel-mark', '●'));
        frames.append(cell);
      });
    });
    frames.scrollLeft = scrollLeft; frames.scrollTop = scrollTop;
  }

  function getCelHasContent(frameId, layerId) {
    return typeof getCelContent === 'function' ? getCelContent(frameId, layerId) : false;
  }

  function renderLayers(state) {
    const list = layers.querySelector('[data-layer-list]'); list.replaceChildren();
    const orderedLayers = state.layers.map((layer, modelIndex) => ({ layer, modelIndex })).reverse();
    for (const { layer, modelIndex } of orderedLayers) {
      const row = node('div', 'animation-controls__layer');
      row.classList.toggle('is-selected', layer.id === state.layerId);
      const select = button(layer.name || `レイヤー ${modelIndex + 1}`, layer.name || `レイヤー ${modelIndex + 1}`, 'select-layer', 'animation-controls__layer-name');
      select.dataset.layerId = String(layer.id); select.setAttribute('aria-pressed', String(layer.id === state.layerId));
      const rename = node('input', 'animation-controls__rename'); rename.type = 'text'; rename.value = String(layer.name || ''); rename.maxLength = 80;
      rename.setAttribute('aria-label', `${layer.name || `レイヤー ${modelIndex + 1}`}の名前`); rename.dataset.renameLayer = String(layer.id);
      const eye = button(layer.visible === false ? 'レイヤーを表示' : 'レイヤーを隠す', layer.visible === false ? '○' : '◉', 'visibility');
      eye.dataset.layerId = String(layer.id); eye.setAttribute('aria-pressed', String(layer.visible !== false));
      const lock = button(layer.locked ? 'レイヤーのロックを解除' : 'レイヤーをロック', '', 'lock');
      replaceButtonIcon(lock, layer.locked ? 'locked' : 'unlocked');
      lock.dataset.layerId = String(layer.id); lock.setAttribute('aria-pressed', String(Boolean(layer.locked)));
      const up = button('レイヤーを上へ', '↑', 'move-layer-up'); up.dataset.layerId = String(layer.id);
      const down = button('レイヤーを下へ', '↓', 'move-layer-down'); down.dataset.layerId = String(layer.id);
      const remove = button('レイヤーを削除', '×', 'delete-layer'); remove.dataset.layerId = String(layer.id);
      const disabled = Boolean(state.readOnly) || pending > 0;
      for (const control of [rename, eye, lock, up, down, remove]) control.disabled = disabled || Boolean(layer.locked && control !== lock && control !== eye);
      up.disabled ||= modelIndex === state.layers.length - 1; down.disabled ||= modelIndex === 0; remove.disabled ||= state.layers.length <= 1;
      row.append(select, rename, eye, lock, up, down, remove); list.append(row);
    }
    const add = layers.querySelector('[data-action="add-layer"]'); add.disabled = Boolean(state.readOnly) || pending > 0;
  }

  function refresh() {
    if (disposed || scope.disposed) return;
    const state = stateNow();
    root.classList.toggle('is-audio', Boolean(state.audioMode));
    for (const portal of [workspacePanel, frameMenu, layers, timing]) portal?.classList.toggle('is-audio', Boolean(state.audioMode));
    for (const action of ['play', 'onion', 'toggle-duration']) { const control = actionElement(action); if (control) control.hidden = Boolean(state.audioMode); }
    if (!state.audioMode && typeof getCelContent === 'function') renderCelGrid(state);
    else { frames.classList.toggle('is-cel-grid', false); renderFrameStrip(state); }
    renderLayers(state);
    const selected = state.frames.find((frame) => frame.id === state.frameId);
    const durationInput = timing.querySelector('[data-duration-input]');
    durationInput.value = String(Number.isFinite(selected?.durationMs) ? selected.durationMs : 100);
    durationInput.disabled = Boolean(state.readOnly) || pending > 0 || !selected;
    setPressed('play', state.playing); setPressed('onion', state.onion);
    const playButton = actionElement('play');
    replaceButtonIcon(playButton, state.playing ? 'pause' : 'play');
    playButton.title = state.playing ? '再生を止める' : '再生';
    playButton.setAttribute('aria-label', state.playing ? '再生を止める' : '再生');
    const controls = [...root.querySelectorAll('button'), ...(workspacePanel ? [...workspacePanel.querySelectorAll('button')] : [])];
    for (const control of controls) {
      if (control.dataset.action === 'play' || control.dataset.action === 'onion' || control.dataset.action === 'export-gif' || control.dataset.action === 'toggle-frames' || control.dataset.action === 'toggle-layers' || control.dataset.action === 'toggle-duration' || control.dataset.action === 'close-animation' || control.dataset.action === 'close-layers' || control.dataset.action === 'close-duration') continue;
      if (control.dataset.action === 'select-frame' || control.dataset.action === 'select-layer' || control.dataset.action === 'select-cel' || control.dataset.action === 'previous-frame' || control.dataset.action === 'next-frame') control.disabled = pending > 0;
      else control.disabled = Boolean(state.readOnly) || pending > 0;
    }
    const previous = actionElement('previous-frame'); if (previous) previous.disabled ||= pending > 0 || state.frames.findIndex((frame) => frame.id === state.frameId) <= 0;
    const next = actionElement('next-frame'); if (next) next.disabled ||= pending > 0 || state.frames.findIndex((frame) => frame.id === state.frameId) >= state.frames.length - 1;
    const addFrame = actionElement('add-frame'); if (addFrame) addFrame.disabled = Boolean(state.readOnly) || pending > 0;
    const exportGif = actionElement('export-gif'); if (exportGif) exportGif.hidden = Boolean(state.audioMode);
    const play = actionElement('play'); if (play) play.disabled = pending > 0;
    const onionButton = actionElement('onion'); if (onionButton) onionButton.disabled = pending > 0 || state.frames.length < 2;
    if (workspaceOpen) positionWorkspacePanel();
  }

  function request(action) { void dispatch(action); }
  function openCellMenu(kind, id, target) {
    if (!hasCelMatrix || !workspacePanel) return;
    const state = stateNow();
    menuFrameId = kind === 'frame' ? id : null; menuLayerId = kind === 'layer' ? id : null;
    frameMenu.replaceChildren();
    const add = (label, glyph, command, disabled = false) => {
      const control = button(label, glyph, 'frame-menu', 'animation-controls__context-action');
      control.dataset.frameMenuAction = command; control.disabled = disabled;
      control.append(node('span', 'animation-controls__context-label', label)); frameMenu.append(control); return control;
    };
    if (kind === 'frame') {
      const index = state.frames.findIndex((frame) => frame.id === id); if (index < 0) return;
      frameMenu.setAttribute('aria-label', `コマ ${index + 1} の操作`);
      add('複製して追加', '＋', 'duplicate', state.readOnly || pending > 0);
      add('空白コマを追加', '□', 'blank', state.readOnly || pending > 0);
      add('表示時間', '◷', 'duration', state.readOnly || pending > 0);
      add(state.onion ? 'オニオンスキンを解除' : 'オニオンスキン', '◉', 'onion', pending > 0 || state.frames.length < 2);
      add('削除', '×', 'delete', state.readOnly || pending > 0 || state.frames.length <= 1);
    } else {
      const layer = state.layers.find((item) => item.id === id); if (!layer) return;
      frameMenu.setAttribute('aria-label', `${layer.name || 'レイヤー'}の操作`);
      add(layer.visible === false ? '表示する' : '隠す', layer.visible === false ? '○' : '◉', 'visibility', state.readOnly || pending > 0);
      const lock = add(layer.locked ? 'ロック解除' : 'ロック', '', 'lock', state.readOnly || pending > 0);
      replaceButtonIcon(lock, layer.locked ? 'unlocked' : 'locked');
      lock.append(node('span', 'animation-controls__context-label', layer.locked ? 'ロック解除' : 'ロック'));
      const rename = node('input', 'animation-controls__context-rename'); rename.type = 'text'; rename.value = String(layer.name || ''); rename.maxLength = 80;
      rename.dataset.contextRename = String(layer.id); rename.setAttribute('aria-label', 'レイヤー名'); rename.disabled = state.readOnly || pending > 0 || Boolean(layer.locked); rename.placeholder = 'レイヤー名'; frameMenu.append(rename);
      add('名前を適用', '✓', 'rename', rename.disabled);
      add('削除', '×', 'delete-layer', state.readOnly || pending > 0 || state.layers.length <= 1 || Boolean(layer.locked));
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
    if (command === 'duplicate') request({ type: 'add-frame', frameId, copy: true });
    else if (command === 'blank') request({ type: 'add-frame', frameId, copy: false });
    else if (command === 'delete') request({ type: 'delete-frame', frameId });
    else if (command === 'duration') {
      request({ type: 'select-frame', frameId }); timing.hidden = false; timingToggle?.setAttribute('aria-expanded', 'true');
    } else if (command === 'onion') request({ type: 'onion', enabled: !state.onion });
    else if (command === 'left' && index > 0) request({ type: 'move-frame', frameId, index: index - 1 });
    else if (command === 'right' && index < state.frames.length - 1) request({ type: 'move-frame', frameId, index: index + 1 });
  }

  function onClick(event) {
    const target = event.target.closest?.('button, input');
    if (!target || ![root, workspacePanel, frameMenu, layers, timing].some((container) => container?.contains(target))) return;
    if (target.matches('input')) return;
    const state = stateNow(); const action = target.dataset.action;
    if (action === 'frame-menu') { menuAction(target.dataset.frameMenuAction, target); return; }
    if (action === 'toggle-frames') {
      if (workspacePanel) { setWorkspaceOpen(!workspaceOpen); return; }
      collapsed = !collapsed; frames.dataset.userCollapsed = 'true'; frames.hidden = collapsed; frameToggle.setAttribute('aria-expanded', String(!collapsed)); return;
    }
    if (action === 'close-animation') { setWorkspaceOpen(false, { returnFocus: true }); return; }
    if (action === 'toggle-layers') { timing.hidden = true; layers.hidden = !layers.hidden; layerToggle.setAttribute('aria-expanded', String(!layers.hidden)); timingToggle.setAttribute('aria-expanded', 'false'); return; }
    if (action === 'close-layers') { layers.hidden = true; layerToggle.setAttribute('aria-expanded', 'false'); return; }
    if (action === 'toggle-duration') { layers.hidden = true; timing.hidden = !timing.hidden; timingToggle.setAttribute('aria-expanded', String(!timing.hidden)); layerToggle.setAttribute('aria-expanded', 'false'); return; }
    if (action === 'close-duration') { timing.hidden = true; timingToggle.setAttribute('aria-expanded', 'false'); return; }
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

  function onChange(event) {
    const target = event.target;
    if (target.matches('[data-duration-input]')) {
      const state = stateNow(); const frame = state.frames.find((item) => item.id === state.frameId);
      const durationMs = Number(target.value);
      if (frame && Number.isInteger(durationMs) && durationMs >= 20 && durationMs <= 10000) request({ type: 'duration', frameId: frame.id, durationMs });
      else { status.textContent = '表示時間は20〜10000ミリ秒で指定してください'; refresh(); }
    }
  }

  function onBlur(event) {
    const target = event.target;
    if (!target.matches('[data-rename-layer]')) return;
    const layerId = target.dataset.renameLayer; const name = target.value.trim(); const layer = stateNow().layers.find((item) => item.id === layerId);
    if (layer && name && name !== layer.name) request({ type: 'rename-layer', layerId, name });
  }

  function onKeydown(event) {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (workspacePanel && workspaceOpen) { setWorkspaceOpen(false, { returnFocus: true }); return; }
      closePanels(); frameMenu.hidden = true; menuFrameId = null; return;
    }
    const target = event.target.closest?.('[data-action="select-frame"], [data-action="select-layer"]');
    if (hasCelMatrix && target && ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu')) {
      event.preventDefault(); openCellMenu(target.dataset.frameId ? 'frame' : 'layer', target.dataset.frameId || target.dataset.layerId, target); return;
    }
    const frameTarget = target?.matches?.('[data-action="select-frame"]') ? target : null;
    if (!frameTarget || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const state = stateNow(); const index = state.frames.findIndex((frame) => frame.id === frameTarget.dataset.frameId); const next = state.frames[index + (event.key === 'ArrowLeft' ? -1 : 1)];
    if (next) { request({ type: 'select-frame', frameId: next.id }); frameElement(next.id)?.focus(); }
  }
  function onContextMenu(event) {
    if (!hasCelMatrix) return;
    const target = event.target.closest?.('[data-action="select-frame"], [data-action="select-layer"]');
    if (!target) return;
    event.preventDefault(); openCellMenu(target.dataset.frameId ? 'frame' : 'layer', target.dataset.frameId || target.dataset.layerId, target);
  }
  function onDoubleClick(event) {
    if (!hasCelMatrix) return;
    const target = event.target.closest?.('[data-action="select-frame"], [data-action="select-layer"]');
    if (!target) return;
    event.preventDefault(); openCellMenu(target.dataset.frameId ? 'frame' : 'layer', target.dataset.frameId || target.dataset.layerId, target);
  }

  function onPointerDown(event) {
    const target = event.target.closest?.(hasCelMatrix ? '[data-action="select-frame"], [data-action="select-layer"]' : '[data-action="select-frame"]'); if (!target || stateNow().readOnly || pending > 0) return;
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
    longPressTimer = scope.timeout(() => {
      if (disposed || scope.disposed) return;
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
    for (const header of frames.querySelectorAll('[data-action="select-frame"], [data-action="select-layer"]')) header.classList.toggle('is-drop-target', false);
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
    for (const header of frames.querySelectorAll('[data-action="select-frame"], [data-action="select-layer"]')) header.classList.toggle('is-drop-target', false);
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
      const row = Number(target.getAttribute('aria-rowindex')) - 3;
      const index = state.layers.length - 1 - row;
      if (Number.isInteger(index) && index >= 0 && index < state.layers.length) request({ type: 'move-layer', layerId: hold.id, index });
    }
  }
  function onPointerCancel(event) {
    if (pointerHold && pointerHold.pointerId != null && event?.pointerId != null && pointerHold.pointerId !== event.pointerId) return;
    clearLongPress();
    pointerHold = null;
    if (liftedHeader) { liftedHeader.classList.toggle('is-lifted', false); liftedHeader = null; }
    for (const header of frames.querySelectorAll('[data-action="select-frame"], [data-action="select-layer"]')) header.classList.toggle('is-drop-target', false);
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
    close() {
      clearLongPress(); pointerHold = null; suppressClick = false;
      liftedHeader?.classList.toggle('is-lifted', false); liftedHeader = null;
      frameMenu.hidden = true; menuFrameId = null; menuLayerId = null;
      closePanels();
      if (workspacePanel) setWorkspaceOpen(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true; clearLongPress();
      pointerHold = null; liftedHeader?.classList.toggle('is-lifted', false); liftedHeader = null;
      for (const remove of removeListeners.splice(0)) remove();
      host.replaceChildren();
      for (const element of [workspacePanel, frameMenu, layers, timing]) element?.parentElement?.removeChild(element);
    }
  };
  scope.add(api.dispose);
  refresh();
  return api;
}
