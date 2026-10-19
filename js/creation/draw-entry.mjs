import { mountDrawMode } from './draw-page.mjs?rev=20261018-direct-runtime-2';

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
const startupMain = document.querySelector('#main');
if (startupMain) startupMain.inert = true;
try {
  const { mountCreationRuntime } = await import('./creation-runtime.mjs?rev=20261019-camera-original-color-1');
  const params = new URLSearchParams(location.search);
  const requestedMode = params.get('mode');
  const runtime = await mountCreationRuntime({ requestedMode, search: location.search, role: requestedMode || 'draw' });
  document.documentElement.dataset.drawReady = 'true';
  const boot = window.__PIXIEED_TOOL_EMBED__;
  if (boot && typeof boot.channel === 'string' && boot.channel.length > 0
      && ['draw', 'camera', 'audio'].includes(boot.role)) {
    const { installToolEmbedBridge } = await import('./tool-embed-bridge.mjs?rev=20261017-analytics-integrity-1');
    installToolEmbedBridge({ draw: runtime.draw, modes: runtime.modes });
  }
} catch (error) {
  delete document.documentElement.dataset.creationStartup;
  document.documentElement.dataset.creationModesReady = 'true';
  const status = document.querySelector('#draw-status');
  if (status) {
    status.textContent = `編集画面を開けませんでした：${error?.message || 'もう一度お試しください。'}`;
    status.classList.add('is-visible');
  }
}

finally { if (startupMain) startupMain.inert = false; }
}
