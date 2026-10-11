import { mountToolHeaderControls } from '../tool-header-controls.mjs';
import { mountSharedProjectSettings } from './shared-project-settings.mjs?rev=20261011-polish-1';
import { createModeScope } from './mode-scope.mjs?rev=20261001-independent-editors-1';
import { mountDrawMusicModel } from './draw-music-model.mjs?rev=20261011-shared-music-2';
import { mountCreationModeMotion } from './creation-mode-motion.mjs?rev=20261011-black-motion-2';


/** One shell, project, palette and history. Mode changes never copy artwork. */
export async function mountCreationModes({ draw, scope }) {
  const body = document.body, main = document.querySelector('#main'), board = main.querySelector('.draw-board'), dock = main.querySelector('.draw-control-dock'), nav = document.querySelector('.app-tabs');
  let mode = 'draw', requestedMode = 'draw', switching = false, audio = null, camera = null;
  let requestVersion = 0, running = null, initializingScope = null;
  let audioLoadAttempt = 0;
  body.classList.add('creation-suite'); body.dataset.creationMode = mode;
  for (const node of main.querySelectorAll('#draw-undo,#draw-redo,#draw-tool-summary')) node.classList.add('creation-control-button');
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/creation-modes.css?rev=20261011-tool-size-1';
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
  menu.innerHTML = `<summary aria-label="制作モードを切り替え" title="制作モード"><img src="/assets/icons/pixieed/shoot.svg" alt=""><span class="visually-hidden">制作モード</span></summary><div class="creation-mode-menu__panel" role="group" aria-label="制作モード"><button type="button" data-creation-mode="draw" aria-pressed="true">描画</button><button type="button" data-creation-mode="camera" aria-pressed="false">カメラ</button><button type="button" data-creation-mode="audio" aria-pressed="false">音楽</button><p>同じ作品・キャンバス・パレットを使います。音楽は全コマ共通の専用レイヤーで編集します。</p><p>以前の独立作品は「作品を管理 → 取り込む」で選べます。元の作品を残したコピーとして開きます。</p><p class="creation-mode-error" role="status" aria-live="polite"></p></div>`;
  launcher.replaceWith(menu);
  const errorNode = menu.querySelector('.creation-mode-error');
  const say = error => { errorNode.textContent = error?.message || String(error); menu.open = true; };
  const settings = mountSharedProjectSettings({ draw, scope });
  draw.setSharedSettingsDismissal(settings);
  for (const node of settings.nodes) { if (!node.isConnected) document.body.append(node); own(node, 'shared'); }
  draw.setProjectSettingsRequest(value => { settings.open(value); });
  const originalCanvasPicker = document.querySelector('.draw-import');
  scope.listen(originalCanvasPicker.querySelector('summary'), 'click', event => { event.preventDefault(); originalCanvasPicker.open = false; settings.open(); });
  const undo = document.createElement('button'), redo = document.createElement('button');
  undo.id = 'creation-project-undo'; redo.id = 'creation-project-redo'; undo.textContent = '戻す'; redo.textContent = 'やり直す'; undo.type = redo.type = 'button';
  settings.root.append(undo, redo); undo.className = redo.className = 'creation-control-button';
  scope.listen(undo, 'click', () => draw.undo()); scope.listen(redo, 'click', () => draw.redo());
  const beforeSharedHeader = new Set(document.querySelectorAll('.px-tool-header-slot'));
  mountToolHeaderControls(document, { selectors: ['#creation-project-settings-open', '#creation-project-undo', '#creation-project-redo'] });
  for (const node of document.querySelectorAll('.px-tool-header-slot')) if (!beforeSharedHeader.has(node)) own(node, 'shared');
  const originalSlot = originalCanvasPicker.closest('.px-tool-header-slot'); originalSlot.classList.add('creation-old-canvas-launcher');
  originalSlot.before(settings.launcher.closest('.px-tool-header-slot'));
  const syncHistory = () => { const timeline = draw.getTimeline(); settings.launcher.textContent = String(Math.max(timeline.width, timeline.height)); settings.launcher.setAttribute('aria-label', `キャンバス設定 ${timeline.width}×${timeline.height}px ${timeline.palette.length}色`); undo.disabled = !draw.canUndo; redo.disabled = !draw.canRedo; };
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
  // The mode menu stays usable so a rapid new request can replace an old one.
  const guardInput = event => {
    if (!switching || menu.contains(event.target)) return;
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
    for (const button of menu.querySelectorAll('[data-creation-mode]')) button.setAttribute('aria-pressed', String(button.dataset.creationMode === owner));
    menu.querySelector('summary').setAttribute('aria-label', `${{ draw: '描画', camera: 'カメラ', audio: '音楽' }[owner]}モード。制作モードを切り替え`);
    menu.querySelector('summary img').src = `/assets/icons/pixieed/${owner === 'audio' ? 'music' : 'shoot'}.svg`;
  }
  async function ensureAudio(version) {
    if (audio) return audio;
    const candidateScope = createModeScope(); initializingScope = candidateScope;
    let candidate;
    try {
      const { mountDrawMusic } = await import(`./draw-music.mjs?rev=20261011-polish-1&attempt=${audioLoadAttempt++}`);
      if (!currentRequest(version)) throw interrupted();
      candidate = await mountDrawMusic({ draw, musicModel, scope:candidateScope, nav, isActive: () => mode === 'audio' && !switching });
      candidateScope.add(() => { for (const node of candidate.nodes) node.remove(); });
      if (!currentRequest(version)) throw interrupted();
      audio = candidate; scope.add(() => candidateScope.dispose());
      for (const node of audio.nodes) own(node, 'audio');
      return audio;
    } catch (error) { candidateScope.dispose(); throw error; }
    finally { if (initializingScope === candidateScope) initializingScope = null; }
  }
  async function ensureCamera(version) {
    if (camera) return camera;
    const candidateScope = createModeScope(); initializingScope = candidateScope;
    let accepted = false;
    try {
    const { mountCreationCamera } = await import(`./creation-camera.mjs?rev=20261011-polish-1&attempt=${version}`);
    if (!currentRequest(version)) throw interrupted();
    const candidate = await mountCreationCamera({ scope:candidateScope, board, dock, nav, draw, onProjectSettings: () => settings.open(), isCurrent: () => !candidateScope.disposed && (accepted ? requestedMode === 'camera' : currentRequest(version)), getAudio: () => audio, onReturn: switchMode, onNavigate: navigate, isActive: () => mode === 'camera' });
    if (!currentRequest(version)) { candidateScope.dispose(); throw interrupted(); }
    accepted = true; camera = candidate; scope.add(() => candidateScope.dispose());
    for (const node of [camera.surface, camera.controls, camera.controlHost, camera.shutter, ...camera.headerControls]) { own(node, 'camera'); node.hidden = false; }
    for (const node of camera.extraNodes) own(node, 'camera');
    return camera;
    } catch (error) { candidateScope.dispose(); throw error; }
    finally { if (initializingScope === candidateScope) initializingScope = null; }
  }
  async function switchMode(next) {
    if (!['draw', 'camera', 'audio'].includes(next)) return;
    if (!running && next === mode) return;
    if (!running && (document.querySelector('dialog[open]') || (body.hasAttribute('data-tool-result-open') && mode !== 'camera'))) throw new Error('開いている画面を閉じてから切り替えてください。');
    requestedMode = next; requestVersion++;
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
        stopCurrent();
        switching = true; main.inert = true; body.dataset.creationTransition = 'true';
        menu.setAttribute('aria-busy', 'true'); errorNode.textContent = ''; settings.close();
        const leaving = motion.leave(previous);
        try {
          await draw.workspace.save();
          if (!currentRequest(version)) continue;
          if (next === 'audio') await ensureAudio(version);
          if (next === 'camera') { await ensureCamera(version); await camera.enter(previous === 'audio' ? 'audio' : 'draw'); }
          await leaving;
          if (!currentRequest(version)) continue;
          mode = next; show(mode); menu.open = false;
          const params = new URLSearchParams(location.search); if (mode === 'draw') params.delete('mode'); else params.set('mode', mode);
          history.replaceState(history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
          // Keep editors stopped until the reveal finishes; no media start is simulated.
          await motion.enter(mode);
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
    }
  }
  scope.listen(document, 'visibilitychange', () => { if (document.hidden) { motion.cancel(); if (switching) stopCurrent(); } else if (!switching) resumeCurrent(); });
  scope.add(() => { initializingScope?.dispose(); motion.cancel(); main.inert = false; delete body.dataset.creationTransition; });
  async function navigate({ tool, project, url }) {
    if (!['draw', 'audio', 'camera'].includes(tool)) { location.assign(url); return; }
    await switchMode(tool);
    if (project && project.projectId !== draw.workspace.currentProject?.projectId) await draw.workspace.importProject(project);
  }
  scope.listen(menu, 'click', event => {
    const button = event.target.closest('button[data-creation-mode]'); if (button) void switchMode(button.dataset.creationMode).catch(say);
  });
  scope.listen(document, 'pointerdown', event => { if (!menu.contains(event.target)) menu.open = false; });
  scope.listen(document, 'keydown', event => { if (event.key === 'Escape') menu.open = false; });
  const api = { get mode() { return mode; }, get switching() { return switching; }, switchMode: next => switchMode(next).catch(say), navigate };
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  document.documentElement.dataset.creationModesReady = 'true';
  const requested = new URLSearchParams(location.search).get('mode');
  if (requested === 'audio' || requested === 'camera') scope.timeout(() => void api.switchMode(requested), 0);
  return api;
}
