import { readCreationModePointer } from './mode-entry.mjs?rev=20261016-tool-shell-1';
import { createModeScope } from './mode-scope.mjs?rev=20261001-independent-editors-1';
import { mountDrawMode } from './draw-page.mjs?rev=20261017-draw-rails-1';
import { mountProjectWorkspace } from './project-workspace.mjs?rev=20261016-tool-shell-1';

if (new URLSearchParams(location.search).get('gameEditor') === 'spot') {
  document.documentElement.dataset.gameDrawRuntime = 'true';
  const runtimeStyle = document.createElement('link');
  runtimeStyle.rel = 'stylesheet'; runtimeStyle.href = '/css/game-draw-runtime.css?rev=20261017-game-editor-1';
  document.head.append(runtimeStyle);
  try {
    const { mountGameDrawRuntime } = await import('./game-draw-runtime.mjs?rev=20261017-game-editor-1');
    await mountGameDrawRuntime({ mountDrawMode });
  } catch (error) {
    document.documentElement.dataset.drawReady = 'true';
    delete document.documentElement.dataset.creationStartup;
    document.documentElement.dataset.creationModesReady = 'true';
    const status = document.querySelector('#draw-status');
    if (status) { status.textContent = `編集画面を開けませんでした：${error?.message || 'もう一度お試しください。'}`; status.classList.add('is-visible'); }
    window.parent?.postMessage({ type: 'pixieed-game-draw-error', message: error?.message || 'PiXiEEDrawの準備に失敗しました。' }, location.origin);
  }
} else {
const scope = createModeScope();
let modes = null, starting = true, drawForEmbed = null;
const startupMain = document.querySelector('#main');
if (startupMain) startupMain.inert = true;
// Retained modes gate global drawing shortcuts while keeping Draw's undo timeline alive.
const drawScope = Object.create(scope);
drawScope.listen = (target, type, callback, options) => scope.listen(target, type, event => {
  if ((starting || modes?.mode === 'camera' || document.body.hasAttribute('data-creation-transition')) && /^(key|pointer|wheel)/.test(type)) return;
  callback(event);
}, options);
for (const type of ['pointerdown','click','keydown']) scope.listen(document,type,event=> {
  if (!starting || event.target.closest?.('dialog,[role="dialog"]')) return;
  if (event.target.closest?.('#main,.px-tool-header-slot') || type==='keydown') {event.preventDefault();event.stopImmediatePropagation();}
},{capture:true});
scope.listen(window, 'pagehide', (event) => { if (!event.persisted) scope.dispose(); });
try {
  let retainedDrawPointer = null;
  const params = new URLSearchParams(location.search), requestedMode = params.get('mode');
  if (['audio', 'camera'].includes(requestedMode) && params.has('modePxd')) retainedDrawPointer = readCreationModePointer(requestedMode, params);
  else if (!params.has('pxd')) {
    try { const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || localStorage.getItem('pixieed:pxd:last:draw') || 'null');
      if (pointer?.projectId && pointer?.revisionId) retainedDrawPointer = pointer;
    } catch { /* Existing standalone works remain available through explicit imports. */ }
  }
  const draw = drawForEmbed = await mountDrawMode({ scope: drawScope, musicLayer: true, isActive: () => !modes || modes.mode !== 'camera',
    mountWorkspace: options => mountProjectWorkspace({ ...options, initialPointer: retainedDrawPointer, isActive: () => true,
      onNavigate: request => modes ? modes.navigate(request) : location.assign(request.url) }) });
  if (!scope.disposed) document.documentElement.dataset.drawReady = 'true';
  try {
    const { mountCreationModes } = await import('./creation-modes.mjs?rev=20261016-tool-operations-1');
    if (!scope.disposed) modes = await mountCreationModes({ draw, scope });
    if (!scope.disposed && window.__PIXIEED_TOOL_EMBED__ && drawForEmbed && modes) {
      const { installToolEmbedBridge } = await import('./tool-embed-bridge.mjs?rev=20261016-tool-shell-1');
      installToolEmbedBridge({ draw: drawForEmbed, modes });
    }
  } catch (error) {
    delete document.documentElement.dataset.creationStartup;
    document.documentElement.dataset.creationModesReady = 'true';
    const status = document.querySelector('#draw-status');
    if (status) status.textContent = `モード切替を準備できませんでした。描画は続けられます：${error?.message || ''}`;
  }
} catch (error) {
  delete document.documentElement.dataset.creationStartup;
  document.documentElement.dataset.creationModesReady = 'true';
  scope.dispose();
  const status = document.querySelector('#draw-status');
  if (status) {
    status.textContent = `編集画面を開けませんでした：${error?.message || 'もう一度お試しください。'}`;
    status.classList.add('is-visible');
  }
}

finally { starting = false; if (startupMain) startupMain.inert = false; }
}
