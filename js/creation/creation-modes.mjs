import { mountToolHeaderControls } from '../tool-header-controls.mjs?rev=20261006-header-controls-1&nav=20261016-tool-operations-1';
import { mountSharedProjectSettings } from './shared-project-settings.mjs?rev=20261017-editor-improvements-1';
import { createModeScope } from './mode-scope.mjs?rev=20261001-independent-editors-1';
import { mountDrawMusicModel } from './draw-music-model.mjs?rev=20261016-tool-shell-1';
import { mountCreationModeMotion } from './creation-mode-motion.mjs?rev=20261012-screen-blackout-1';
import { animationNeedsRgba, hasAnimationCelContent } from './animation-core.mjs?rev=20261016-color-capability-1';


/** One shell, project, palette and history. Mode changes never copy artwork. */
export function assertCreationModeCompatible(next, animation) {
  if (next !== 'audio' || !animationNeedsRgba(animation)) return true;
  const hasVisibleArt = animation.frames.some((frame) => animation.layers.some((layer) =>
    layer.role !== 'music' && layer.visible && layer.opacity !== 0 && hasAnimationCelContent(animation, frame.id, layer.id)));
  if (!hasVisibleArt) return true;
  const error = new TypeError('半透明色またはレイヤー不透明度を含む絵は、音楽への投影に対応していません。モードを切り替えず、絵・音楽・編集履歴は保持しました。');
  error.code = 'audio-animation-alpha-unsupported';
  throw error;
}

export async function mountCreationModes({ draw, scope }) {
  const body = document.body, main = document.querySelector('#main'), board = main.querySelector('.draw-board'), dock = main.querySelector('.draw-control-dock'), nav = document.querySelector('.app-tabs');
  const startupMode = document.documentElement.dataset.creationStartup === 'camera' ? 'camera' : null;
  let mode = 'draw', requestedMode = 'draw', switching = false, audio = null, camera = null;
  let cameraProjectState = 'none', appliedCameraTimeline = null;
  let requestVersion = 0, running = null, initializingScope = null, startupSwitchPending = Boolean(startupMode), focusModeAfterSwitch = null;
  let audioLoadAttempt = 0;
  body.classList.add('creation-suite'); body.dataset.creationMode = mode;
  for (const node of main.querySelectorAll('#draw-undo,#draw-redo,#draw-tool-summary')) node.classList.add('creation-control-button');
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/creation-modes.css?rev=20261017-editor-improvements-1';
  const styled = new Promise((resolve, reject) => { css.addEventListener('load', resolve, { once:true }); css.addEventListener('error', () => reject(new Error('共通の制作画面の表示を読み込めません。')), { once:true }); });
  document.head.append(css); await styled;
  const owned = new Map([['shared', new Set()], ['editor', new Set()], ['draw', new Set()], ['audio', new Set()], ['camera', new Set()]]);
  function own(node, owner) { if (!node) return; node.dataset.modeOwner = owner; owned.get(owner).add(node); }
  for (const node of board.children) own(node, 'editor');
  for (const node of dock.children) { own(node, 'editor'); node.dataset.creationLayout = 'retained'; }
  for (const node of main.children) if (!node.matches('.draw-viewport,.draw-control-dock')) own(node, 'editor');
  own(document.querySelector('#draw-mirror-rail'), 'editor');
  document.querySelector('#draw-mirror-rail').dataset.creationLayout = 'retained';
  for (const node of document.querySelectorAll('.px-tool-header-slot')) own(node, 'editor');
  for (const node of document.querySelectorAll('.project-bar')) own(node, 'shared');
  own(document.querySelector('#draw-animation-play'), 'draw');
  const launcher = nav.querySelector('[data-nav="camera"]');
  const menu = document.createElement('details'); menu.id = 'creation-mode-menu';
  menu.innerHTML = `<summary aria-label="制作モードを切り替え" title="制作モード"><img src="/assets/icons/pixieed/shoot.svg" alt=""><span class="app-tab-label">モード</span><span class="visually-hidden">制作モード</span></summary><div class="creation-mode-menu__panel" role="group" aria-label="制作モード"><button type="button" data-creation-mode="draw" aria-pressed="true">描画</button><button type="button" data-creation-mode="camera" aria-pressed="false">カメラ</button><button type="button" data-creation-mode="audio" aria-pressed="false">音楽</button><p>同じ作品・キャンバス・パレットを使います。音楽は全コマ共通の専用レイヤーで編集します。</p><p>以前の独立作品は「作品を管理 → 取り込む」で選べます。元の作品を残したコピーとして開きます。</p><p class="creation-mode-error" role="status" aria-live="polite"></p></div>`;
  launcher.replaceWith(menu);
  const modeButtons = [...menu.querySelectorAll('[data-creation-mode]')];
  const errorNode = menu.querySelector('.creation-mode-error');
  // The header scrolls horizontally; keep its popup in the viewport layer.
  const modePanel = menu.querySelector('.creation-mode-menu__panel');
  modePanel.id = 'creation-mode-panel'; modePanel.hidden = true;
  menu.querySelector('summary').setAttribute('aria-controls', modePanel.id);
  document.body.append(modePanel); own(modePanel, 'shared');
  function setModeMenu(open) {
    if (menu.open !== open) menu.open = open;
    modePanel.hidden = !open;
    menu.querySelector('summary').setAttribute('aria-expanded', String(open));
  }
  setModeMenu(false);
  scope.listen(menu, 'toggle', () => setModeMenu(menu.open));
  const modeMenuObserver = new MutationObserver(() => setModeMenu(menu.open));
  modeMenuObserver.observe(menu, { attributes:true, attributeFilter:['open'] });
  scope.add(() => modeMenuObserver.disconnect());
  scope.add(() => modePanel.remove());
  nav.classList.add('px-five-nav', 'app-tabs--tool-operations'); nav.classList.remove('app-tabs--labeled'); nav.setAttribute('aria-label', '制作の操作');
  const makeActionButton = ({ id, slot, label, icon, ariaLabel }) => {
    const button = document.createElement('button'); button.type = 'button'; button.id = id;
    button.className = 'creation-nav-action'; button.dataset.navSlot = slot;
    button.setAttribute('aria-label', ariaLabel);
    const iconWrap = document.createElement('span'); iconWrap.className = 'px-nav-icon';
    const image = icon ? document.createElement('img') : null;
    if (image) { image.src = icon; image.alt = ''; image.setAttribute('aria-hidden', 'true'); image.draggable = false; }
    const text = document.createElement('span'); text.className = 'app-tab-label'; text.textContent = label;
    if (image) iconWrap.append(image); button.append(iconWrap, text); return button;
  };
  const fileButton = makeActionButton({ id:'creation-file-open', slot:'1', label:'ファイル', icon:'/assets/icons/pixieed/artwork.svg', ariaLabel:'ファイルと作品一覧を開く' });
  const settingsButton = makeActionButton({ id:'creation-settings-open', slot:'4', label:'設定', icon:'/assets/icons/pixieed/tools.svg', ariaLabel:'このモードの設定を開く' });
  const outputButton = makeActionButton({ id:'creation-output-open', slot:'5', label:'出力', icon:'', ariaLabel:'出力を開く' });
  const outputIcon = document.querySelector('#draw-output > summary svg')?.cloneNode(true);
  if (outputIcon) { outputIcon.setAttribute('aria-hidden', 'true'); outputButton.querySelector('.px-nav-icon').append(outputIcon); }
  const outputStatus = document.createElement('span'); outputStatus.id = 'creation-output-status';
  outputStatus.className = 'visually-hidden'; outputStatus.setAttribute('role', 'status'); outputStatus.setAttribute('aria-live', 'polite');
  outputButton.setAttribute('aria-describedby', outputStatus.id);
  nav.querySelector('[data-nav="map"]')?.replaceWith(fileButton);
  nav.querySelector('[data-nav="tools"]')?.remove(); nav.querySelector('[data-nav="profile"]')?.remove();
  const settingsStatus = document.createElement('span'); settingsStatus.id = 'creation-settings-status';
  settingsStatus.className = 'visually-hidden'; settingsStatus.setAttribute('role', 'status'); settingsStatus.setAttribute('aria-live', 'polite');
  settingsButton.setAttribute('aria-describedby', settingsStatus.id);
  settingsButton.setAttribute('aria-haspopup', 'dialog'); settingsButton.setAttribute('aria-expanded', 'false');
  settingsButton.setAttribute('aria-controls', 'creation-settings-panel');
  const settingsPanel = document.createElement('div'); settingsPanel.id = 'creation-settings-panel';
  settingsPanel.className = 'creation-settings-panel'; settingsPanel.hidden = true;
  settingsPanel.setAttribute('role', 'dialog'); settingsPanel.setAttribute('aria-labelledby', 'creation-settings-heading');
  const settingsHeading = document.createElement('h2'); settingsHeading.id = 'creation-settings-heading'; settingsHeading.className = 'visually-hidden'; settingsHeading.textContent = '設定を選ぶ';
  const canvasSettingsChoice = document.createElement('button'); canvasSettingsChoice.type = 'button';
  canvasSettingsChoice.id = 'creation-canvas-settings-open'; canvasSettingsChoice.textContent = 'キャンバス・パレット';
  const modeSettingsChoice = document.createElement('button'); modeSettingsChoice.type = 'button';
  modeSettingsChoice.id = 'creation-mode-settings-open'; modeSettingsChoice.textContent = '描画の設定';
  settingsPanel.append(settingsHeading, canvasSettingsChoice, modeSettingsChoice); document.body.append(settingsPanel);
  scope.add(() => settingsPanel.remove());
  const portalHeaderControl = (node, owner, portalScope = scope) => {
    const slot = node?.closest('.px-tool-header-slot'); if (!slot) return;
    own(node, owner);
    const marker = document.createComment('creation-operation-portal'); node.before(marker);
    const summary = node.matches('details') ? node.querySelector(':scope > summary') : null;
    const previous = summary ? { hidden:summary.hidden, tabIndex:summary.getAttribute('tabindex'), ariaHidden:summary.getAttribute('aria-hidden') } : null;
    if (summary) { summary.hidden = true; summary.tabIndex = -1; summary.setAttribute('aria-hidden', 'true'); }
    document.body.append(node);
    portalScope.add(() => {
      if (marker.isConnected) marker.replaceWith(node); else slot.append(node);
      if (summary && previous) {
        summary.hidden = previous.hidden;
        if (previous.tabIndex == null) summary.removeAttribute('tabindex'); else summary.setAttribute('tabindex', previous.tabIndex);
        if (previous.ariaHidden == null) summary.removeAttribute('aria-hidden'); else summary.setAttribute('aria-hidden', previous.ariaHidden);
      }
      owned.get(owner)?.delete(node);
    });
  };
  const drawAction = nav.querySelector('#draw-animation-play');
  drawAction.dataset.navSlot = '3'; drawAction.dataset.navPrimary = '';
  let historyPlaced = false;
  const markPrimaryActions = () => {
    // The retained desktop layout restores its original controls on mode and
    // viewport changes. The operation bar owns history after initial placement.
    if (historyPlaced && !scope.disposed) for (const button of historyActions) if (button.parentElement !== nav) nav.append(button);
    for (const action of nav.querySelectorAll('#draw-animation-play,#capture,#draw-music-play')) {
      action.dataset.navSlot = '3'; action.dataset.navPrimary = '';
    }
    // Match keyboard order to the five visual slots, including lazy modes.
    const ordered = [...nav.children].sort((a, b) => Number(a.dataset.navSlot || 99) - Number(b.dataset.navSlot || 99));
    ordered.forEach((node, index) => { if (nav.children[index] !== node) nav.insertBefore(node, nav.children[index] || null); });
  };
  markPrimaryActions();
  const primaryActionObserver = new MutationObserver(markPrimaryActions);
  primaryActionObserver.observe(nav, { childList:true, subtree:true });
  scope.add(() => primaryActionObserver.disconnect());
  drawAction.after(settingsButton, settingsStatus, outputButton, outputStatus);
  // Move the actual history controls, keeping their existing handlers and state.
  const historyActions = [document.querySelector('#draw-undo'), document.querySelector('#draw-redo')];
  for (const [index, button] of historyActions.entries()) {
    const marker = document.createComment('creation-history-position'); button.before(marker);
    const label = document.createElement('span'); label.className = 'app-tab-label'; label.textContent = index ? 'やり直す' : '戻す';
    button.append(label); button.dataset.navSlot = index ? '4' : '2'; button.dataset.toolOperation = '';
    button.classList.add('creation-nav-action'); own(button, 'editor'); nav.append(button);
    scope.add(() => { label.remove(); marker.replaceWith(button); delete button.dataset.navSlot; delete button.dataset.toolOperation; });
  }
  historyPlaced = true;
  const headerSettingsSlot = document.createElement('div'); headerSettingsSlot.className = 'px-tool-header-slot creation-navigation-settings';
  const productionHeader = mountToolHeaderControls(document, { selectors:[menu] });
  productionHeader.append(headerSettingsSlot); headerSettingsSlot.append(settingsButton); own(headerSettingsSlot, 'shared');
  for (const slot of productionHeader.querySelectorAll('.px-tool-header-slot:has(#creation-mode-menu)')) own(slot, 'shared');
  const placeSettings = owner => {
    if (owner === 'camera') nav.append(settingsButton);
    else headerSettingsSlot.append(settingsButton);
  };
  const projectDialog = document.querySelector('#pxd-panel');
  let restoreFileFocus = false;
  const currentProjectPane = projectDialog?.querySelector('#project-current-pane');
  const imageImportActions = document.createElement('div'); imageImportActions.className = 'project-sheet__actions creation-file-image-actions';
  const imageImportButton = document.createElement('button'); imageImportButton.type = 'button'; imageImportButton.id = 'creation-file-image-open'; imageImportButton.textContent = '画像を読み込む';
  imageImportButton.setAttribute('aria-label', '画像ファイルを読み込む'); imageImportActions.append(imageImportButton);
  currentProjectPane?.before(imageImportActions);
  scope.add(() => imageImportActions.remove());
  const projectNotes = document.createElement('div'); projectNotes.id = 'creation-project-save-scope'; projectNotes.className = 'creation-project-notes';
  const saveScopeNote = document.createElement('p'); saveScopeNote.className = 'creation-project-save-note';
  saveScopeNote.textContent = '作品保存は現在の絵・音楽・共通設定を保存します。カメラ出力は撮影画像だけを書き出します。';
  const cameraProjectNote = document.createElement('p'); cameraProjectNote.id = 'creation-project-camera-note'; cameraProjectNote.className = 'creation-project-camera-note'; cameraProjectNote.setAttribute('role', 'status'); cameraProjectNote.setAttribute('aria-live', 'polite');
  const historyNote = document.createElement('p'); historyNote.className = 'creation-project-history-note';
  historyNote.textContent = '編集履歴で戻る対象：描画・音楽・適用した撮影画像・共通設定です。カメラの色味・ズームは対象外です。';
  projectNotes.append(saveScopeNote, cameraProjectNote, historyNote); currentProjectPane?.before(projectNotes);
  scope.add(() => projectNotes.remove());
  scope.listen(fileButton, 'click', () => {
    restoreFileFocus = true;
    void draw.workspace.showProjects();
  });
  if (projectDialog) scope.listen(projectDialog, 'close', () => {
    if (!restoreFileFocus) return;
    restoreFileFocus = false;
    if (fileButton.isConnected && !fileButton.disabled) fileButton.focus({ preventScroll:true });
  });
  scope.listen(imageImportButton, 'click', () => {
    restoreFileFocus = false;
    projectDialog?.close();
    if (mode === 'camera') document.querySelector('#cameraChooseImage')?.click();
    else document.querySelector('#draw-import-local')?.click();
  });
  const say = error => { errorNode.textContent = error?.message || String(error); setModeMenu(true); };
  const settings = mountSharedProjectSettings({ draw, scope });
  draw.setSharedSettingsDismissal(settings);
  for (const node of settings.nodes) { if (!node.isConnected) document.body.append(node); own(node, 'shared'); }
  const closeSharedSettings = settings.close.bind(settings);
  settings.close = options => closeSharedSettings({ ...options, restoreFocus:false });
  const sharedSettingsFocusObserver = new MutationObserver(() => {
    if (!settings.panel.hidden || scope.disposed || switching) return;
    const trigger = focusReturnTarget?.panel === settings.panel ? focusReturnTarget.trigger
      : settings.launcher?.getClientRects().length ? settings.launcher : settingsButton;
    focusReturnTarget = null;
    if (trigger?.isConnected && !trigger.disabled) trigger.focus({ preventScroll:true });
  });
  sharedSettingsFocusObserver.observe(settings.panel, { attributes:true, attributeFilter:['hidden'] });
  scope.add(() => sharedSettingsFocusObserver.disconnect());
  draw.setProjectSettingsRequest(value => { settings.open(value); });
  const originalCanvasPicker = document.querySelector('.draw-import');
  const originalSlot = originalCanvasPicker.closest('.px-tool-header-slot');
  if (originalSlot && !originalSlot.classList.contains('creation-old-canvas-launcher')) {
    originalSlot.classList.add('creation-old-canvas-launcher');
    scope.add(() => originalSlot.classList.remove('creation-old-canvas-launcher'));
  }
  portalHeaderControl(originalCanvasPicker, 'editor');
  portalHeaderControl(document.querySelector('#draw-settings-picker'), 'editor');
  portalHeaderControl(document.querySelector('#draw-output'), 'editor');
  scope.listen(originalCanvasPicker.querySelector('summary'), 'click', event => { event.preventDefault(); originalCanvasPicker.open = false; settings.open(); });
  const historyDescription = document.createElement('span'); historyDescription.id = 'creation-history-description'; historyDescription.className = 'visually-hidden';
  historyDescription.textContent = '作品の編集履歴を戻す・やり直す操作です。描画、音楽、適用した撮影画像、共通設定が対象です。カメラの色味・ズームは対象外です。';
  document.body.append(historyDescription); scope.add(() => historyDescription.remove());
  const undo = document.createElement('button'), redo = document.createElement('button');
  undo.id = 'creation-project-undo'; redo.id = 'creation-project-redo'; undo.textContent = '戻す'; redo.textContent = 'やり直す'; undo.type = redo.type = 'button';
  const labelHistoryControls = () => {
    for (const button of document.querySelectorAll('#draw-undo,#draw-redo,#creation-project-undo,#creation-project-redo')) {
      const undoing = button.id.endsWith('undo');
      button.setAttribute('aria-label', undoing ? '作品の編集履歴を戻す' : '作品の編集履歴をやり直す');
      button.title = undoing ? '作品の編集履歴を戻す' : '作品の編集履歴をやり直す';
      const describedBy = new Set((button.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      describedBy.add(historyDescription.id); button.setAttribute('aria-describedby', [...describedBy].join(' '));
    }
  };
  labelHistoryControls();
  settings.root.append(undo, redo); undo.className = redo.className = 'creation-control-button';
  scope.listen(undo, 'click', () => draw.undo()); scope.listen(redo, 'click', () => draw.redo());
  const beforeSharedHeader = new Set(document.querySelectorAll('.px-tool-header-slot'));
  mountToolHeaderControls(document, { selectors: ['#creation-project-settings-open', '#creation-project-undo', '#creation-project-redo'] });
  const previousSettingsLauncher = { hidden:settings.launcher.hidden, tabIndex:settings.launcher.getAttribute('tabindex'), ariaHidden:settings.launcher.getAttribute('aria-hidden') };
  settings.launcher.hidden = true; settings.launcher.tabIndex = -1; settings.launcher.setAttribute('aria-hidden', 'true');
  scope.add(() => {
    settings.launcher.hidden = previousSettingsLauncher.hidden;
    if (previousSettingsLauncher.tabIndex == null) settings.launcher.removeAttribute('tabindex'); else settings.launcher.setAttribute('tabindex', previousSettingsLauncher.tabIndex);
    if (previousSettingsLauncher.ariaHidden == null) settings.launcher.removeAttribute('aria-hidden'); else settings.launcher.setAttribute('aria-hidden', previousSettingsLauncher.ariaHidden);
  });
  for (const node of document.querySelectorAll('.px-tool-header-slot')) if (!beforeSharedHeader.has(node)) own(node, 'shared');
  const sharedSettingsSlot = settings.launcher.closest('.px-tool-header-slot');
  if (originalSlot && sharedSettingsSlot) originalSlot.before(sharedSettingsSlot);
  const cameraProjectCopy = {
    none: '',
    pending: '作品の保存対象は現在の絵・音楽・設定です。未反映の撮影画像は含まれません。カメラ出力は撮影画像単体です。',
    applied: '撮影画像を作品へ反映済みです。保存対象は現在の作品（絵・音楽・設定）です。カメラ出力は撮影画像単体です。',
    undone: '撮影画像の反映は作品のUndoで取り消されています。保存対象は現在の絵・音楽・設定で、カメラ出力は撮影画像単体です。',
    unknown: '現在の作品では撮影画像の反映状態が変わっています。保存対象は現在の作品（絵・音楽・設定）です。カメラ出力は撮影画像単体です。'
  };
  function updateProjectCameraStatus() {
    if (appliedCameraTimeline) {
      let position = 'missing';
      try { position = draw.getTimelineHistoryPosition?.(appliedCameraTimeline) || 'missing'; } catch {}
      cameraProjectState = position === 'current' || position === 'past' ? 'applied' : position === 'future' ? 'undone' : 'unknown';
    }
    const message = (cameraProjectCopy[cameraProjectState] || cameraProjectCopy.unknown)
      .replace('撮影画像を作品へ反映済みです。', document.querySelector('#pixelStudio')?.dataset.mode === 'captured' ? '撮影画像を作品へ反映済みです。' : '前の撮影画像は作品へ反映済みです。');
    if (cameraProjectNote.textContent !== message) cameraProjectNote.textContent = message;
    cameraProjectNote.hidden = cameraProjectState === 'none';
  }
  function receiveCameraProjectStatus(event) {
    if (event?.type === 'captured') { cameraProjectState = 'pending'; appliedCameraTimeline = null; }
    else if (event?.type === 'idle' && !appliedCameraTimeline) cameraProjectState = 'none';
    else if (event?.type === 'unknown' && !event.timeline) { cameraProjectState = 'unknown'; appliedCameraTimeline = null; }
    else if (event?.type === 'apply-failed') {
      if (cameraProjectState !== 'applied' && cameraProjectState !== 'undone' && cameraProjectState !== 'unknown') cameraProjectState = 'pending';
    } else if (event?.type === 'applied' && event.timeline) {
      appliedCameraTimeline = event.timeline; cameraProjectState = 'applied';
    }
    updateProjectCameraStatus();
  }
  updateProjectCameraStatus();
  const syncHistory = () => { const timeline = draw.getTimeline(); settings.launcher.textContent = String(Math.max(timeline.width, timeline.height)); settings.launcher.setAttribute('aria-label', `キャンバス設定 ${timeline.width}×${timeline.height}px ${timeline.palette.length}色`); undo.disabled = !draw.canUndo; redo.disabled = !draw.canRedo; labelHistoryControls(); updateProjectCameraStatus(); };
  scope.add(draw.subscribe(syncHistory)); syncHistory();
  const startupInert = main.inert; main.inert = true;
  let musicModel;
  try { musicModel = await mountDrawMusicModel({draw,scope}); }
  finally { main.inert = startupInert; }
  const motion = mountCreationModeMotion({ board, main, scope });
  const interrupted = () => new DOMException('制作モードの切替が更新されました。', 'AbortError');
  const currentRequest = version => !scope.disposed && requestVersion === version;
  const stopCurrent = () => {
    if (mode !== 'camera') draw.suspend();
    if (mode === 'audio') audio?.suspend();
    if (mode === 'camera') camera?.suspend();
  };
  const resumeCurrent = () => {
    if (scope.disposed || document.hidden) return;
    if (mode !== 'camera') draw.resume();
    if (mode === 'audio') audio?.resume();
    if (mode === 'camera') camera?.resume();
    if (mode !== 'camera') document.querySelector('#draw-canvas').focus({ preventScroll:true });
  };
  // Mode buttons stay usable so a rapid new request can replace an old one.
  const guardInput = event => {
    if (!switching || menu.contains(event.target) || modePanel.contains(event.target)) return;
    if (event.target.closest?.('#main,.px-tool-header-slot,.app-tabs button') || event.type === 'keydown') {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  for (const type of ['pointerdown','click','keydown']) scope.listen(document, type, guardInput, { capture:true });
  function show(owner) {
    if (owner === 'draw') draw.selectArtLayer?.();
    body.dataset.creationMode = owner; body.dataset.page = 'draw';
    body.classList.remove('audio-tool-body');
    for (const [name, nodes] of owned) for (const node of nodes) node.inert = name === 'shared' ? false : name === 'editor' ? owner === 'camera' : name !== owner;
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.creationMode === owner));
    const label = { draw:'描画', camera:'カメラ', audio:'音楽' }[owner];
    modeSettingsChoice.textContent = `${label}の設定`;
    menu.querySelector('summary').setAttribute('aria-label', `${label}モード。制作モードを切り替え`);
    menu.querySelector('summary img').src = `/assets/icons/pixieed/${owner === 'audio' ? 'music' : 'shoot'}.svg`;
    placeSettings(owner);
    updateCameraActionState();
  }
  async function ensureAudio(version) {
    if (audio) return audio;
    const candidateScope = createModeScope(); initializingScope = candidateScope;
    let candidate;
    try {
      const { mountDrawMusic } = await import(`./draw-music.mjs?attempt=${audioLoadAttempt++}&rev=20261017-editor-improvements-1`);
      if (!currentRequest(version)) throw interrupted();
      candidate = await mountDrawMusic({ draw, musicModel, scope:candidateScope, nav, isActive: () => mode === 'audio' && !switching });
      const settingsNode = document.querySelector('#draw-music-settings');
      const musicPanel = settingsNode?.querySelector('.draw-music-panel');
      if (musicPanel) musicPanel.dataset.creationAudioView = 'settings';
      const firstOutputControl = settingsNode?.querySelector('#draw-music-loops');
      const firstOutputNode = firstOutputControl?.closest('label');
      const lastOutputNode = settingsNode?.querySelector('#draw-music-status');
      if (settingsNode && firstOutputNode && lastOutputNode && firstOutputNode.parentElement === lastOutputNode.parentElement && !settingsNode.querySelector('#creation-music-output-section')) {
        const stopAfterLoop = settingsNode.querySelector('#draw-music-stop-loop');
        if (stopAfterLoop?.parentElement === firstOutputNode.parentElement) firstOutputNode.before(stopAfterLoop);
        const outputSection = document.createElement('section'); outputSection.id = 'creation-music-output-section';
        outputSection.setAttribute('aria-labelledby', 'creation-music-output-heading');
        const heading = document.createElement('h3'); heading.id = 'creation-music-output-heading'; heading.textContent = '音楽の出力';
        outputSection.append(heading); firstOutputNode.before(outputSection);
        candidateScope.add(() => outputSection.remove());
        let outputNode = firstOutputNode;
        while (outputNode) {
          const next = outputNode.nextSibling; outputSection.append(outputNode);
          if (outputNode === lastOutputNode) break;
          outputNode = next;
        }
      }
      candidateScope.add(() => { for (const node of candidate.nodes) node.remove(); });
      if (!currentRequest(version)) throw interrupted();
      audio = candidate; scope.add(() => candidateScope.dispose());
      for (const node of audio.nodes) own(node, 'audio');
      portalHeaderControl(settingsNode, 'audio', candidateScope);
      return audio;
    } catch (error) { candidateScope.dispose(); throw error; }
    finally { if (initializingScope === candidateScope) initializingScope = null; }
  }
  async function ensureCamera(version) {
    if (camera) return camera;
    const candidateScope = createModeScope(); initializingScope = candidateScope;
    let accepted = false;
    try {
    const { mountCreationCamera } = await import(`./creation-camera.mjs?attempt=${version}&rev=20261017-editor-improvements-1`);
    if (!currentRequest(version)) throw interrupted();
    const candidate = await mountCreationCamera({ scope:candidateScope, board, dock, nav, draw, onProjectSettings: () => settings.open(), onProjectStatus: receiveCameraProjectStatus, isCurrent: () => !candidateScope.disposed && (accepted ? requestedMode === 'camera' : currentRequest(version)), getAudio: () => audio, onReturn: switchMode, onNavigate: navigate, isActive: () => mode === 'camera' });
    if (!currentRequest(version)) { candidateScope.dispose(); throw interrupted(); }
    accepted = true; camera = candidate; scope.add(() => candidateScope.dispose());
    for (const node of [camera.surface, camera.controls, camera.controlHost, camera.shutter, ...camera.headerControls]) { own(node, 'camera'); node.hidden = false; }
    const flip = document.querySelector('#flipCamera');
    if (flip) {
      flip.dataset.navSlot = '2'; flip.dataset.toolOperation = ''; flip.classList.add('creation-nav-action');
      const label = document.createElement('span'); label.className = 'app-tab-label'; flip.append(label);
      const syncLabel = () => { label.textContent = flip.getAttribute('aria-label') === 'カメラを開く' ? 'カメラ' : '切替'; };
      syncLabel();
      const observer = new MutationObserver(syncLabel); observer.observe(flip, { attributes:true, attributeFilter:['aria-label'] });
      candidateScope.add(() => observer.disconnect());
      nav.append(flip); own(flip, 'camera');
    }
    for (const node of camera.extraNodes) own(node, 'camera');
    observeCameraActionNodes();
    return camera;
    } catch (error) { candidateScope.dispose(); throw error; }
    finally { if (initializingScope === candidateScope) initializingScope = null; }
  }
  async function switchMode(next) {
    if (!['draw', 'camera', 'audio'].includes(next)) return;
    if (!running && next === mode) return;
    if (!running && (document.querySelector('dialog[open]') || (body.hasAttribute('data-tool-result-open') && mode !== 'camera'))) throw new Error('開いている画面を閉じてから切り替えてください。');
    requestedMode = next; requestVersion++;
    settingsPanel.hidden = true; settingsButton.setAttribute('aria-expanded', 'false');
    focusReturnTarget = null;
    motion.cancel(); initializingScope?.dispose();
    // Stop even when an earlier request is still waiting for a loader or animation.
    if (running) { stopCurrent(); return running; }
    running = runTransitions().finally(() => { running = null; });
    return running;
  }
  async function runTransitions() {
    const wasInert = main.inert;
    try {
      while (!scope.disposed && requestedMode !== mode) {
        const version = requestVersion, next = requestedMode, previous = mode;
        // Check the receiver before suspending a capture session or saving a
        // project, so an unsupported projection leaves the current mode intact.
        assertCreationModeCompatible(next, draw.getTimeline());
        stopCurrent();
        switching = true; main.inert = true; body.dataset.creationTransition = 'true';
        menu.setAttribute('aria-busy', 'true'); errorNode.textContent = ''; settings.close();
        const skipStartupTransition = startupSwitchPending && previous === 'draw' && next === 'camera';
        const leaving = skipStartupTransition ? Promise.resolve() : motion.leave(previous);
        try {
          // The retained project was already restored by Draw startup. It has
          // no user edits to save before the first camera mode is shown.
          if (!skipStartupTransition) await draw.workspace.save();
          if (!currentRequest(version)) continue;
          if (next === 'audio') await ensureAudio(version);
          if (next === 'camera') { await ensureCamera(version); await camera.enter(previous === 'audio' ? 'audio' : 'draw'); }
          await leaving;
          if (!currentRequest(version)) continue;
          mode = next; show(mode); setModeMenu(false);
          const params = new URLSearchParams(location.search); if (mode === 'draw') params.delete('mode'); else params.set('mode', mode);
          history.replaceState(history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
          // Keep editors stopped until the reveal finishes; no media start is simulated.
          if (!skipStartupTransition) await motion.enter(mode);
          if (!currentRequest(version)) continue;
        } catch (error) {
          if (!currentRequest(version)) continue;
          requestedMode = mode; show(mode); throw error;
        }
      }
    } catch (error) { requestedMode = mode; throw error; }
    finally {
      motion.cancel(); main.inert = wasInert; delete body.dataset.creationTransition;
      switching = false; menu.removeAttribute('aria-busy');
      resumeCurrent(); if (!scope.disposed) draw.workspace.activate();
      if (focusModeAfterSwitch?.isConnected) focusModeAfterSwitch.focus({ preventScroll:true });
      focusModeAfterSwitch = null;
    }
  }
  scope.listen(document, 'visibilitychange', () => { if (document.hidden) { motion.cancel(); if (switching) stopCurrent(); } else if (!switching) resumeCurrent(); });
  scope.add(() => { initializingScope?.dispose(); motion.cancel(); main.inert = false; delete body.dataset.creationTransition; });
  async function navigate({ tool, project, url }) {
    if (!['draw', 'audio', 'camera'].includes(tool)) { location.assign(url); return; }
    await switchMode(tool);
    if (project && project.projectId !== draw.workspace.currentProject?.projectId) await draw.workspace.importProject(project);
  }
  scope.listen(modePanel, 'click', event => {
    const button = event.target.closest('button[data-creation-mode]');
    if (!button) return;
    focusModeAfterSwitch = menu.querySelector('summary');
    void switchMode(button.dataset.creationMode).catch(say);
  });
  scope.listen(document, 'pointerdown', event => { if (!menu.contains(event.target) && !modePanel.contains(event.target)) setModeMenu(false); });
  scope.listen(document, 'keydown', event => {
    if (event.key === 'Escape' && menu.open) { setModeMenu(false); menu.querySelector('summary').focus({ preventScroll:true }); event.preventDefault(); }
  });
  const api = { get mode() { return mode; }, get switching() { return switching; }, switchMode: next => switchMode(next).catch(say), navigate,
    suspendForEmbed() { stopCurrent(); },
    resumeForEmbed() { resumeCurrent(); }
  };
  let focusReturnTarget = null;
  function focusFirst(container, fallback) {
    const selector = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';
    const target = (container?.matches?.(selector) ? container : container?.querySelector(selector)) || fallback;
    target?.focus?.({ preventScroll:true });
    target?.scrollIntoView?.({ block:'nearest', inline:'nearest' });
  }
  function updateCameraActionState() {
    const saveLink = document.querySelector('#savePng');
    const surface = document.querySelector('#pixelStudio');
    const inCamera = mode === 'camera' || requestedMode === 'camera';
    const captured = surface?.dataset.mode === 'captured';
    const canSave = captured && saveLink?.getAttribute('aria-disabled') === 'false' && !saveLink.disabled;
    const settingsUnavailable = inCamera && captured;
    const settingsTitle = settingsUnavailable
      ? '撮影結果を閉じて、中央の撮り直しボタンでライブ画面に戻ると設定できます。'
      : `${mode === 'camera' ? 'カメラ' : mode === 'audio' ? '音楽' : '描画'}の設定を開く`;
    const settingsMessage = settingsUnavailable
      ? '撮影結果を表示中はカメラ設定を開けません。中央の撮り直しボタンでライブ画面に戻してください。'
      : '';
    const outputUnavailable = inCamera && !canSave;
    const outputTitle = outputUnavailable
      ? (captured ? '保存できる画像がありません。撮り直してください。' : '撮影後に画像を保存できます。中央の撮影ボタンを押してください。')
      : `${mode === 'camera' ? '撮影画像' : mode === 'audio' ? '音楽' : '作品'}の出力を開く`;
    const outputMessage = outputUnavailable ? outputTitle : '';
    if (settingsButton.disabled !== settingsUnavailable) settingsButton.disabled = settingsUnavailable;
    if (settingsButton.title !== settingsTitle) settingsButton.title = settingsTitle;
    if (settingsStatus.textContent !== settingsMessage) settingsStatus.textContent = settingsMessage;
    if (outputButton.disabled !== outputUnavailable) outputButton.disabled = outputUnavailable;
    if (outputButton.title !== outputTitle) outputButton.title = outputTitle;
    if (outputStatus.textContent !== outputMessage) outputStatus.textContent = outputMessage;
  }
  function setSettingsMenu(open, { restoreFocus = false } = {}) {
    settingsPanel.hidden = !open; settingsButton.setAttribute('aria-expanded', String(open));
    if (open) focusFirst(settingsPanel, modeSettingsChoice);
    else if (restoreFocus && settingsButton.isConnected) settingsButton.focus({ preventScroll:true });
  }
  scope.listen(settingsButton, 'click', () => setSettingsMenu(settingsPanel.hidden));
  scope.listen(document, 'pointerdown', event => {
    if (!settingsPanel.hidden && !settingsPanel.contains(event.target) && !settingsButton.contains(event.target)) setSettingsMenu(false);
  });
  scope.listen(canvasSettingsChoice, 'click', () => {
    setSettingsMenu(false);
    focusReturnTarget = { panel:settings.panel, trigger:settingsButton };
    settings.open();
    focusFirst(document.querySelector('#creation-project-width'), settingsButton);
  });
  scope.listen(modeSettingsChoice, 'click', () => {
    setSettingsMenu(false);
    if (mode === 'camera') {
      if (document.querySelector('#pixelStudio')?.dataset.mode === 'captured') return;
      const tone = camera?.controls.querySelector('[data-tool="tone"]');
      if (!tone) { settingsStatus.textContent = 'カメラ設定を読み込んでいます。少し待ってからもう一度お試しください。'; return; }
      focusReturnTarget = { panel:tone, trigger:settingsButton };
      tone.click(); focusFirst(camera.controls.querySelector('#toneChips'), settingsButton);
      return;
    }
    const settingsNode = mode === 'audio' ? document.querySelector('#draw-music-settings') : document.querySelector('#draw-settings-picker');
    if (!settingsNode) return;
    if (mode === 'audio') settingsNode.querySelector('.draw-music-panel')?.setAttribute('data-creation-audio-view', 'settings');
    focusReturnTarget = { panel:settingsNode, trigger:settingsButton };
    settingsNode.open = true;
    focusFirst(settingsNode, settingsButton);
  });
  scope.add(draw.setCreationNavigation({
    fileMenu: () => { fileButton.click(); return true; },
    settings: () => { modeSettingsChoice.click(); return true; },
    canvasSettings: () => { canvasSettingsChoice.click(); return true; }
  }));
  scope.listen(outputButton, 'click', () => {
    if (mode === 'camera') {
      const save = document.querySelector('#savePng');
      if (save?.getAttribute('aria-disabled') === 'false' && !save.disabled) save.click();
      return;
    }
    if (mode === 'audio') {
      const settingsNode = document.querySelector('#draw-music-settings');
      const outputSection = document.querySelector('#creation-music-output-section');
      if (!settingsNode || !outputSection) { outputStatus.textContent = '音楽の出力設定を読み込んでいます。少し待ってからもう一度お試しください。'; return; }
      settingsNode.querySelector('.draw-music-panel')?.setAttribute('data-creation-audio-view', 'output');
      focusReturnTarget = { panel:settingsNode, trigger:outputButton };
      settingsNode.open = true;
      outputSection.scrollIntoView({ block:'nearest' });
      focusFirst(outputSection.querySelector('#draw-music-wav'), outputButton);
      return;
    }
    const exportAction = document.querySelector('#draw-export');
    if (exportAction) exportAction.click();
  });
  const syncCameraActions = () => {
    updateCameraActionState();
    const tone = camera?.controls.querySelector('[data-tool="tone"]');
    if (mode === 'camera' && focusReturnTarget?.panel === tone && focusReturnTarget.trigger === settingsButton && tone?.getAttribute('aria-expanded') === 'false') {
      focusReturnTarget = null;
      settingsButton.focus({ preventScroll:true });
    }
  };
  const cameraActionObserver = new MutationObserver(syncCameraActions);
  function observeCameraActionNodes() {
    cameraActionObserver.disconnect();
    const surface = document.querySelector('#pixelStudio'), saveLink = document.querySelector('#savePng');
    if (surface) cameraActionObserver.observe(surface, { attributes:true, attributeFilter:['data-mode'] });
    if (saveLink) cameraActionObserver.observe(saveLink, { attributes:true, attributeFilter:['aria-disabled','href','disabled'] });
    const tone = camera?.controls.querySelector('[data-tool="tone"]');
    if (tone) cameraActionObserver.observe(tone, { attributes:true, attributeFilter:['aria-expanded'] });
    syncCameraActions();
  }
  scope.add(() => cameraActionObserver.disconnect());
  syncCameraActions();
  scope.listen(document, 'keydown', event => {
    if (event.key !== 'Escape') return;
    if (!settingsPanel.hidden) { setSettingsMenu(false, { restoreFocus:true }); event.preventDefault(); return; }
    const openOutput = document.querySelector('#draw-output[open]');
    if (openOutput) { openOutput.open = false; outputButton.focus({ preventScroll:true }); event.preventDefault(); return; }
    const musicSettings = document.querySelector('#draw-music-settings[open]');
    if (musicSettings) { musicSettings.open = false; (event.target?.closest?.('#creation-music-output-section') ? outputButton : settingsButton).focus({ preventScroll:true }); event.preventDefault(); return; }
    const drawSettings = document.querySelector('#draw-settings-picker[open]');
    if (drawSettings) { drawSettings.open = false; settingsButton.focus({ preventScroll:true }); event.preventDefault(); return; }
    const tone = camera?.controls.querySelector('[data-tool="tone"][aria-expanded="true"]');
    if (mode === 'camera' && tone) { tone.click(); settingsButton.focus({ preventScroll:true }); focusReturnTarget = null; event.preventDefault(); }
  });
  scope.listen(document, 'toggle', event => {
    if (event.target?.open) return;
    if (switching) return;
    const panel = event.target;
    const panelSelector = panel?.matches?.('#draw-settings-picker,#draw-music-settings,#draw-output');
    const focusTarget = !panelSelector ? null : focusReturnTarget?.panel === panel
      ? focusReturnTarget.trigger
      : panel.id === 'draw-output' || panel.querySelector?.('.draw-music-panel')?.dataset.creationAudioView === 'output'
        ? outputButton : settingsButton;
    if (!focusTarget) return;
    focusReturnTarget = null;
    if (focusTarget.isConnected && !focusTarget.disabled) focusTarget.focus({ preventScroll:true });
  }, { capture:true });
  scope.listen(document, 'pixieed:creation-mode-request', event => {
    const requested = event.detail?.mode;
    if (!['draw', 'camera', 'audio'].includes(requested)) return;
    event.preventDefault();
    const target = modeButtons.find(button => button.dataset.creationMode === requested);
    if (target && requested === mode && !running) {
      setModeMenu(true); target.focus({ preventScroll:true }); return;
    }
    focusModeAfterSwitch = menu.querySelector('summary');
    void api.switchMode(requested);
  });
  if (startupMode) {
    try { await switchMode(startupMode); }
    catch (error) { say(error); }
    finally {
      startupSwitchPending = false;
      delete document.documentElement.dataset.creationStartup;
    }
  } else {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const requested = new URLSearchParams(location.search).get('mode');
    if (requested === 'audio' || requested === 'camera') scope.timeout(() => void api.switchMode(requested), 0);
  }
  document.documentElement.dataset.creationModesReady = 'true';
  return api;
}
