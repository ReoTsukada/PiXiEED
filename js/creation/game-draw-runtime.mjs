import { createModeScope } from './mode-scope.mjs?rev=20261001-independent-editors-1';
import { documentRgba, validateDrawDocument } from './draw-core.mjs?rev=20261011-tool-size-1';

/** Run the regular PiXiEEDraw editor in a private, in-memory spot-edit session. */
export async function mountGameDrawRuntime({ mountDrawMode } = {}) {
  if (typeof mountDrawMode !== 'function') throw new TypeError('PiXiEEDrawの起動処理がありません。');
  // Keep the general Draw desktop shell from introducing frame/layer docks in this fixed-size editor.
  document.body.dataset.creationMode = 'spot-game-draw';
  const scope = createModeScope();
  let draw = null, original = null, originalOverlay = null, originalVisible = false, onChange = () => {}, onOriginalChange = () => {};
  const canvas = document.querySelector('#draw-canvas');
  const status = document.querySelector('#draw-status');
  const say = message => { if (status) status.textContent = message; };
  const workspace = {
    ready: Promise.resolve(), currentProject: null, heldProject: null, persisted: false,
    markDirty() {}, reset() {},
    async save() { return await workspace.saveDelegate?.(); },
    async assertCanSave() { await workspace.saveDelegate?.(); return true; },
    async beforeReplace() { throw new Error('この編集画面では別の作品を読み込めません。'); },
    async showProjects() { throw new Error('この編集画面では作品管理を開けません。'); },
    saveDelegate: null
  };
  try {
    draw = await mountDrawMode({ scope, musicLayer: false, isActive: () => true, mountWorkspace: () => workspace });
    if (scope.disposed) return;
    scope.add(draw.subscribe(() => publish()));
    draw.setCreationNavigation({
      settings: () => false, fileMenu: () => false, canvasSettings: () => false
    });
    scope.listen(window, 'pagehide', () => { try { delete window.__PIXIEED_GAME_DRAW__; } catch {} }, { once: true });
    const makeOverlay = documentData => {
      if (!canvas || !documentData) return;
      originalOverlay?.remove();
      const pixels = new Uint8ClampedArray(documentRgba(documentData));
      const source = document.createElement('canvas'); source.width = documentData.width; source.height = documentData.height;
      source.getContext('2d', { alpha: true }).putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
      const image = document.createElement('img'); image.className = 'game-draw-original';
      image.alt = '編集前の元画像'; image.draggable = false; image.hidden = !originalVisible;
      image.src = source.toDataURL('image/png');
      canvas.after(image); originalOverlay = image;
      const sync = () => {
        if (!image.isConnected) return;
        image.style.left = `${canvas.offsetLeft}px`; image.style.top = `${canvas.offsetTop}px`;
        image.style.width = `${canvas.offsetWidth}px`; image.style.height = `${canvas.offsetHeight}px`;
        image.style.transform = canvas.style.transform || '';
      };
      sync();
      const observer = new ResizeObserver(sync); observer.observe(canvas);
      const transformObserver = new MutationObserver(sync); transformObserver.observe(canvas, { attributes: true, attributeFilter: ['style'] });
      scope.add(() => { observer.disconnect(); transformObserver.disconnect(); });
    };
    const notifyOriginal = () => {
      originalOverlay && (originalOverlay.hidden = !originalVisible);
      try { onOriginalChange(originalVisible); } catch {}
      window.dispatchEvent(new CustomEvent('pixieed-game-draw-original', { detail: { visible: originalVisible } }));
    };
    const setOriginal = value => { originalVisible = Boolean(value); notifyOriginal(); return originalVisible; };
    const api = {
      ready: Promise.resolve(),
      initialize(originalDocument, workingDocument) {
        validateDrawDocument(originalDocument); validateDrawDocument(workingDocument);
        if (originalDocument.width !== workingDocument.width || originalDocument.height !== workingDocument.height) throw new RangeError('元画像と編集画像のサイズが一致しません。');
        original = structuredClone(originalDocument);
        draw.initializeDrawDocument(structuredClone(workingDocument));
        // The imported work is the starting point, not an undoable edit.
        draw.establishHistoryBaseline();
        makeOverlay(original); setOriginal(false); say('元の絵を保ったまま編集できます。');
        publish();
        return api.getDocument();
      },
      getDocument() { return draw?.getDocument?.() ?? null; },
      undo() { setOriginal(false); return draw?.undo?.() ?? false; },
      redo() { setOriginal(false); return draw?.redo?.() ?? false; },
      get canUndo() { return Boolean(draw?.canUndo); },
      get canRedo() { return Boolean(draw?.canRedo); },
      setTool(tool) { setOriginal(false); return draw.setDrawingTool(tool); },
      addColor(color) { setOriginal(false); return draw.addPaletteColor(color); },
      showOriginal(visible) { return setOriginal(visible); },
      toggleOriginal() { return setOriginal(!originalVisible); },
      set onChange(callback) { onChange = typeof callback === 'function' ? callback : () => {}; },
      set onOriginalChange(callback) { onOriginalChange = typeof callback === 'function' ? callback : () => {}; },
      set saveDelegate(callback) { workspace.saveDelegate = typeof callback === 'function' ? callback : null; },
      dispose() { scope.dispose(); try { delete window.__PIXIEED_GAME_DRAW__; } catch {} }
    };
    function publish() {
      if (!original || !draw) return;
      const documentData = draw.getDocument();
      try { onChange(structuredClone(documentData)); } catch {}
      window.dispatchEvent(new CustomEvent('pixieed-game-draw-change', { detail: { document: documentData, canUndo: draw.canUndo, canRedo: draw.canRedo } }));
    }
    api.ready = Promise.resolve();
    scope.listen(canvas, 'pointerdown', event => {
      if (!originalVisible) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, { capture: true });
    scope.listen(document, 'click', event => {
      if (originalVisible && event.target.closest?.('#draw-palette .draw-color[data-color-index]')) setOriginal(false);
    }, { capture: true });
    scope.listen(window, 'keydown', event => {
      const code = event.code;
      const primary = event.metaKey || event.ctrlKey;
      const toolKey = !primary && !event.altKey && ['KeyB','KeyP','KeyE','KeyG','KeyL','KeyR','KeyO','KeyA','KeyV','KeyI'].includes(code);
      const historyKey = primary && !event.altKey && (code === 'KeyZ' || code === 'KeyY');
      const navigationKey = ['Escape','Tab','Enter','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(code);
      if (toolKey && originalVisible) setOriginal(false);
      if (historyKey && originalVisible) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (code === 'Escape') {
        const hasOpenPanel = [...document.querySelectorAll('dialog[open], [role="dialog"], details[open]')].some(node => !node.hidden && node.getClientRects().length > 0);
        if (!hasOpenPanel) setTimeout(() => {
          if (![...document.querySelectorAll('dialog[open], [role="dialog"], details[open]')].some(node => !node.hidden && node.getClientRects().length > 0)) {
            window.parent?.postMessage({ type: 'pixieed-game-draw-escape' }, location.origin);
          }
        }, 0);
      }
      if (toolKey || historyKey || navigationKey) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, { capture: true });
    window.__PIXIEED_GAME_DRAW__ = api;
    document.documentElement.dataset.drawReady = 'true';
    delete document.documentElement.dataset.creationStartup;
    document.documentElement.dataset.creationModesReady = 'true';
    window.parent?.postMessage({ type: 'pixieed-game-draw-ready' }, location.origin);
  } catch (error) {
    scope.dispose(); throw error;
  }
}
