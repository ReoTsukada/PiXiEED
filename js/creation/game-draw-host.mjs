import { mountSpotInlineDraw } from './spot-inline-draw.mjs?rev=20261004-drawing-tools-4';

/** Host the full PiXiEEDraw editor as one persistent same-origin iframe. */
export function mountGameDraw(options = {}) {
  const { canvas, paletteHost, penButton, eraserButton, undoButton, redoButton, originalButton,
    addColorInput, finishButton, status, onFinish = async () => {}, onChange = () => {}, onOriginalChange = () => {} } = options;
  if (!canvas?.parentElement) throw new TypeError('スポット編集の表示位置がありません。');
  // Legacy puzzle documents allow 512px; Draw's animation engine allows 256px.
  // Reuse the previous shared-core editor at the original dimensions for those works.
  if (options.working?.width > 256 || options.working?.height > 256) {
    canvas.dataset.gameDrawBackend = 'legacy-shared-core';
    const colorRow = paletteHost.parentElement;
    const tools = canvas.ownerDocument.createElement('div'); tools.className = 'game-draw-legacy-tools';
    const label = canvas.ownerDocument.createElement('span'); label.textContent = `大きい画像の編集 · ${options.working.width}×${options.working.height}px（原寸）`;
    const markers = [penButton, eraserButton].map(button => { const marker = canvas.ownerDocument.createComment('legacy-draw-tool'); button.before(marker); tools.append(button); return [marker, button]; });
    tools.append(label); colorRow.before(tools);
    const legacy = mountSpotInlineDraw(options);
    const ready = Promise.resolve();
    return { ...legacy, ready, backend: 'legacy-shared-core', dispose() {
      legacy.dispose(); delete canvas.dataset.gameDrawBackend;
      for (const [marker, button] of markers) marker.replaceWith(button);
      tools.remove();
    } };
  }

  let original = structuredClone(options.original);
  const working = structuredClone(options.working);
  const parent = canvas.parentElement, win = parent.ownerDocument.defaultView;
  const previous = {
    paletteHidden: paletteHost?.hidden,
    paletteVisibility: paletteHost?.style.visibility,
    addColorDisabled: addColorInput?.disabled
  };
  if (paletteHost) { paletteHost.hidden = true; paletteHost.style.visibility = 'hidden'; }
  const abort = new AbortController(), { signal } = abort;
  const frame = parent.ownerDocument.createElement('iframe');
  frame.id = canvas.id; frame.className = 'game-draw-host__frame'; frame.title = 'PiXiEEDraw スポット画像エディター'; frame.setAttribute('allow', '');
  frame.setAttribute('aria-label', canvas.getAttribute('aria-label') || 'PiXiEEDraw スポット画像エディター');
  frame.setAttribute('scrolling', 'no'); frame.referrerPolicy = 'same-origin';
  frame.style.cssText = `display:block;max-width:100%;height:auto;aspect-ratio:${working.width}/${working.height};--spot-inline-aspect:${working.width / working.height};border:0;background:#f4f2ec;touch-action:none`;
  let api = null, disposed = false, workingCache = structuredClone(working), readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const say = value => { if (status) status.textContent = value; };
  let bridgeReadyTimeout = 0;
  const bridgeReady = new Promise((resolve, reject) => {
    const settle = (callback, value) => {
      if (bridgeReadyTimeout) win.clearTimeout(bridgeReadyTimeout);
      bridgeReadyTimeout = 0; win.removeEventListener('message', receive); callback(value);
    };
    const receive = event => {
      if (event.source !== frame.contentWindow || event.origin !== win.location.origin) return;
      if (event.data?.type === 'pixieed-game-draw-ready') settle(resolve, true);
      else if (event.data?.type === 'pixieed-game-draw-error') settle(reject, new Error(event.data.message || 'PiXiEEDrawの準備に失敗しました。'));
    };
    win.addEventListener('message', receive);
    bridgeReadyTimeout = win.setTimeout(() => settle(reject, new Error('PiXiEEDrawの準備が時間内に完了しませんでした。')), 15000);
    signal.addEventListener('abort', () => settle(reject, new Error('PiXiEEDrawの起動を中断しました。')), { once: true });
  });
  const syncControls = () => {
    if (undoButton) undoButton.disabled = !api?.canUndo;
    if (redoButton) redoButton.disabled = !api?.canRedo;
    if (addColorInput) addColorInput.disabled = !workingCache?.palette || workingCache.palette.length >= 32;
  };
  const syncDocument = documentData => {
    if (documentData) workingCache = structuredClone(documentData);
    syncControls();
    try { onChange(structuredClone(workingCache)); } catch {}
  };
  const onFrameLoad = async () => {
    try {
      await bridgeReady;
      const child = frame.contentWindow;
      if (!child || child.location.origin !== win.location.origin) throw new Error('編集画面の接続先を確認できません。');
      api = child.__PIXIEED_GAME_DRAW__;
      if (!api) throw new Error('PiXiEEDrawの準備が完了しませんでした。');
      await api.ready;
      api.onChange = syncDocument;
      api.onOriginalChange = visible => {
        originalButton?.setAttribute('aria-pressed', String(visible));
        try { onOriginalChange(visible); } catch {}
      };
      api.initialize(original, workingCache);
      syncDocument(api.getDocument());
      say('PiXiEEDrawで編集できます。'); readyResolve(host);
    } catch (error) {
      say(`編集画面を準備できませんでした：${error?.message || '再読み込みしてください。'}`);
      readyReject(error);
    }
  };
  frame.addEventListener('load', onFrameLoad, { once: true, signal });
  frame.addEventListener('error', () => { const error = new Error('PiXiEEDrawを読み込めませんでした。'); say(error.message); readyReject(error); }, { once: true, signal });
  frame.src = '/draw/editor.html?gameEditor=spot'; canvas.replaceWith(frame);
  penButton?.addEventListener('click', () => { try { api?.setTool('pen'); } catch (error) { say(error.message); } }, { signal });
  eraserButton?.addEventListener('click', () => { try { api?.setTool('eraser'); } catch (error) { say(error.message); } }, { signal });
  undoButton?.addEventListener('click', () => { try { api?.undo(); syncDocument(api?.getDocument()); } catch (error) { say(error.message); } }, { signal });
  redoButton?.addEventListener('click', () => { try { api?.redo(); syncDocument(api?.getDocument()); } catch (error) { say(error.message); } }, { signal });
  originalButton?.addEventListener('click', () => { try { api?.toggleOriginal(); } catch (error) { say(error.message); } }, { signal });
  addColorInput?.addEventListener('change', () => {
    try { if (addColorInput.value) { api?.addColor(addColorInput.value); syncDocument(api?.getDocument()); } }
    catch (error) { say(error.message); }
  }, { signal });
  finishButton?.addEventListener('click', async () => {
    if (!api || finishButton.disabled) return;
    finishButton.disabled = true;
    try { await onFinish(structuredClone(workingCache)); }
    catch (error) { say(`候補を作れませんでした：${error?.message || 'もう一度お試しください。'}`); }
    finally { if (!disposed) finishButton.disabled = false; }
  }, { signal });
  const host = {
    frame, ready,
    getDocument: () => structuredClone(workingCache),
    undo() { if (!api) return false; const changed = api.undo(); syncDocument(api.getDocument()); return changed; },
    redo() { if (!api) return false; const changed = api.redo(); syncDocument(api.getDocument()); return changed; },
    get canUndo() { return Boolean(api?.canUndo); }, get canRedo() { return Boolean(api?.canRedo); },
    initialize(nextOriginal = original, nextWorking = workingCache) {
      if (!api) throw new Error('PiXiEEDrawの準備がまだできていません。');
      original = structuredClone(nextOriginal); workingCache = structuredClone(nextWorking);
      api.initialize(original, workingCache); syncDocument(api.getDocument());
    },
    showOriginal(value) { return api?.showOriginal(value) ?? false; },
    dispose() {
      if (disposed) return; disposed = true; abort.abort();
      if (bridgeReadyTimeout) win.clearTimeout(bridgeReadyTimeout);
      try { api?.dispose(); } catch {}
      frame.replaceWith(canvas);
      if (paletteHost) { paletteHost.hidden = previous.paletteHidden; paletteHost.style.visibility = previous.paletteVisibility; }
      if (addColorInput) addColorInput.disabled = previous.addColorDisabled;
    }
  };
  return host;
}
