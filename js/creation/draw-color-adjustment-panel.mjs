import { adjustDrawColorAnimation, adjustDrawColorDocument, getAdjustedAnimationCel, DRAW_COLOR_DEFAULTS, normalizeDrawColorSettings } from './draw-color-adjustments.mjs';

const NS = 'http://www.w3.org/2000/svg';
const sliderSpec = [
  ['brightness', '明るさ', -100, 100, 1, 0],
  ['contrast', 'コントラスト', -100, 100, 1, 0],
  ['saturation', '彩度', 0, 200, 1, 100],
];

/** Programmatic toolbar opener and detached live-preview panel for one current cel. */
export function mountDrawColorAdjustmentPanel({ scope, host, getState, onBegin, onPreview, onApply, onCancel, onLayout } = {}) {
  if (!scope?.listen || !scope?.add || typeof scope.disposed !== 'boolean') throw new TypeError('Color adjustment panel requires a lifecycle scope');
  if (!host || typeof getState !== 'function' || typeof onApply !== 'function') throw new TypeError('Color adjustment panel requires host, state, and apply handlers');
  const doc = host.ownerDocument || document;
  const opener = doc.createElement('button'); opener.type = 'button'; opener.className = 'draw-color-adjustment-open';
  opener.textContent = '色調'; opener.setAttribute('aria-label', '色調を調整'); opener.setAttribute('aria-expanded', 'false');
  const toolbar = host.querySelector?.('.draw-fixed-left, .draw-fixed-toolbar') || host;
  toolbar.append(opener);

  const panel = doc.createElement('section'); panel.className = 'draw-color-adjustment'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', '色調調整');
  panel.innerHTML = '<header><h2>色調調整</h2><button type="button" data-close aria-label="色調調整を閉じる">×</button></header><fieldset class="draw-color-adjustment__scope"><legend>適用範囲</legend><label><input type="radio" name="draw-color-scope" value="current" checked> 現在のコマ・レイヤー<span data-selection></span></label><label><input type="radio" name="draw-color-scope" value="whole"> 全コマ・全レイヤー</label></fieldset><figure class="draw-color-adjustment__preview"><figcaption>現在コマのレイヤープレビュー</figcaption><canvas data-color-preview aria-label="色調プレビュー"></canvas></figure><div data-controls></div><fieldset class="draw-color-adjustment__palette"><legend>パレットの扱い</legend><label><input type="radio" name="draw-color-palette-mode" value="exact" checked> 調整色を追加</label><label><input type="radio" name="draw-color-palette-mode" value="nearest"> 既存色に近似</label></fieldset><div class="draw-color-adjustment__curve"><label>RGBトーンカーブ</label><svg viewBox="0 0 255 255" role="group" aria-label="RGBトーンカーブ"><path class="grid" d="M0 0V255H255M0 191H255M0 127H255M0 63H255M63 0V255M127 0V255M191 0V255"/><path data-line d=""/><g data-points></g></svg><small>点を上下に動かして明るさを調整</small></div><p class="draw-color-adjustment__status" aria-live="polite"></p><footer><button type="button" data-cancel>キャンセル</button><button type="button" data-apply disabled>適用</button></footer>';
  const controls = panel.querySelector('[data-controls]');
  for (const [key, label, min, max, step, value] of sliderSpec) {
    const row = doc.createElement('label'); row.className = 'draw-color-adjustment__slider'; row.append(doc.createTextNode(label));
    const input = doc.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value; input.dataset.setting = key;
    const output = doc.createElement('output'); output.value = String(value); output.textContent = String(value);
    row.append(input, output); controls.append(row);
  }
  const points = panel.querySelector('[data-points]'); const line = panel.querySelector('[data-line]');
  const circleNodes = [];
  for (let index = 0; index < 5; index += 1) {
    const circle = doc.createElementNS(NS, 'circle'); circle.setAttribute('r', '7'); circle.setAttribute('role', 'slider');
    circle.setAttribute('aria-label', `トーンカーブ ${index + 1} 点`); circle.setAttribute('aria-valuemin', '0'); circle.setAttribute('aria-valuemax', '255');
    circle.setAttribute('tabindex', '0'); circle.dataset.curveIndex = String(index); points.append(circle); circleNodes.push(circle);
  }
  host.append(panel);
  const status = panel.querySelector('.draw-color-adjustment__status'); const apply = panel.querySelector('[data-apply]');
  const paletteFieldset = panel.querySelector('.draw-color-adjustment__palette');
  const previewCanvas = panel.querySelector('[data-color-preview]');
  let state = null; let sourceDocument = null; let sourceAnimation = null; let previewDocument = null; let previewAnimation = null; let settings = normalizeDrawColorSettings();
  let previewToken = 0; let active = false; let dragging = null;
  const setStatus = text => { status.textContent = text; };
  const renderPreview = documentData => {
    if (!documentData || !previewCanvas) return;
    previewCanvas.width = documentData.width; previewCanvas.height = documentData.height;
    const context = previewCanvas.getContext?.('2d'); if (!context) return;
    context.imageSmoothingEnabled = false;
    const image = context.createImageData(documentData.width, documentData.height);
    const bytes = image.data;
    for (let index = 0; index < documentData.pixels.length; index += 1) {
      const colorIndex = documentData.pixels[index]; if (colorIndex < 0) continue;
      const hex = documentData.palette[colorIndex]; if (typeof hex !== 'string' || !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(hex)) continue;
      const offset = index * 4;
      bytes[offset] = Number.parseInt(hex.slice(1, 3), 16);
      bytes[offset + 1] = Number.parseInt(hex.slice(3, 5), 16);
      bytes[offset + 2] = Number.parseInt(hex.slice(5, 7), 16);
      bytes[offset + 3] = hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) : 255;
    }
    context.putImageData(image, 0, 0);
  };
  const updateGraph = () => {
    const values = settings.curve;
    const coords = values.map((y, i) => `${[0, 64, 128, 192, 255][i]},${255 - y}`);
    line.setAttribute('d', `M${coords.join(' L')}`);
    circleNodes.forEach((circle, index) => {
      circle.setAttribute('cx', String([0, 64, 128, 192, 255][index])); circle.setAttribute('cy', String(255 - values[index]));
      circle.setAttribute('aria-valuenow', String(values[index]));
    });
  };
  const readSettings = () => {
    const values = Object.fromEntries([...panel.querySelectorAll('[data-setting]')].map(input => [input.dataset.setting, Number(input.value)]));
    values.paletteMode = panel.querySelector('input[name="draw-color-palette-mode"]:checked')?.value || 'exact';
    values.curve = settings.curve; return normalizeDrawColorSettings(values);
  };
  const syncScopeControls = () => {
    const wholeArtwork = panel.querySelector('input[name="draw-color-scope"]:checked')?.value === 'whole';
    paletteFieldset.disabled = wholeArtwork;
  };
  function close({ restore = true } = {}) {
    if (!active && panel.hidden) return;
    const wasActive = active;
    active = false; previewToken += 1;
    if (restore && wasActive) {
      renderPreview(sourceDocument);
      onCancel?.({ animation: sourceAnimation, document: sourceDocument, frameId: state?.frameId, layerId: state?.layerId });
    }
    panel.hidden = true; opener.setAttribute('aria-expanded', 'false'); opener.focus?.({ preventScroll: true }); apply.disabled = true;
    sourceDocument = null; sourceAnimation = null; previewDocument = null; previewAnimation = null; state = null;
  }
  async function refresh() {
    if (!active || !sourceDocument) return;
    settings = readSettings(); updateGraph();
    for (const input of panel.querySelectorAll('[data-setting]')) input.nextElementSibling.textContent = input.value;
    const token = ++previewToken; apply.disabled = true; setStatus('プレビューを計算中…');
    try {
      const wholeArtwork = panel.querySelector('input[name="draw-color-scope"]:checked')?.value === 'whole';
      syncScopeControls();
      let adjusted; let animation = null;
      if (wholeArtwork) {
        animation = adjustDrawColorAnimation(sourceAnimation, settings);
        adjusted = getAdjustedAnimationCel(animation, state.frameId, state.layerId);
      } else {
        adjusted = await adjustDrawColorDocument(sourceDocument, settings, {
          selectionMask: state.selectionMask || null, isCancelled: () => token !== previewToken || !active,
          maxPalette: state.maxPalette ?? (sourceAnimation ? 32 : 128),
          onProgress: (done, total) => { if (token === previewToken && done < total) setStatus(`プレビューを計算中… ${Math.round(done / total * 100)}%`); },
        });
      }
      if (token !== previewToken || !active) return;
      previewDocument = adjusted; previewAnimation = animation;
      renderPreview(adjusted);
      await onPreview?.({ ...(wholeArtwork ? { animation } : {}), document: adjusted, frameId: state.frameId, layerId: state.layerId });
      if (token !== previewToken || !active) return;
      const changed = wholeArtwork ? animation !== sourceAnimation : adjusted !== sourceDocument;
      setStatus(changed ? `${wholeArtwork ? '全コマ・全レイヤー' : '現在のコマ・レイヤー'}をプレビュー中 · パレット ${adjusted.palette.length} 色` : '変更はありません');
      apply.disabled = !changed || Boolean(state.blockedReason);
    } catch (error) {
      if (token !== previewToken || !active || error?.name === 'AbortError') return;
      previewDocument = null; previewAnimation = null;
      renderPreview(sourceDocument);
      try { await onPreview?.({ ...(sourceAnimation ? { animation: sourceAnimation } : {}), document: sourceDocument, frameId: state.frameId, layerId: state.layerId }); } catch { /* Keep the source snapshot authoritative after a failed preview. */ }
      setStatus(error?.message || '色調を計算できませんでした。'); apply.disabled = true;
    }
  }
  async function open() {
    if (!panel.hidden) { close(); return; }
    state = getState() || {};
    sourceAnimation = state.animation || null;
    sourceDocument = state.document || state.doc || (sourceAnimation ? getAdjustedAnimationCel(sourceAnimation, state.frameId, state.layerId) : null);
    if (!sourceDocument) { setStatus(state.blockedReason || 'スプライトを読み込んでください。'); panel.hidden = false; opener.setAttribute('aria-expanded', 'true'); return; }
    if (state.blockedReason) { setStatus(state.blockedReason); panel.hidden = false; opener.setAttribute('aria-expanded', 'true'); return; }
    if (onBegin && onBegin('color') === false) { setStatus('別の編集操作を終了してから開いてください。'); panel.hidden = false; opener.setAttribute('aria-expanded', 'true'); return; }
    active = true; settings = normalizeDrawColorSettings();
    for (const input of panel.querySelectorAll('[data-setting]')) input.value = String(DRAW_COLOR_DEFAULTS[input.dataset.setting]);
    panel.querySelector('input[value="exact"]').checked = true;
    panel.querySelector('input[name="draw-color-scope"][value="current"]').checked = true;
    panel.querySelector('input[name="draw-color-scope"][value="whole"]').disabled = !sourceAnimation;
    panel.querySelector('[data-selection]').textContent = state.selectionMask ? ' · 選択範囲' : '';
    renderPreview(sourceDocument);
    panel.hidden = false; opener.setAttribute('aria-expanded', 'true'); syncScopeControls(); updateGraph(); onLayout?.();
    panel.querySelector('[data-setting="brightness"]').focus({ preventScroll: true });
    await refresh();
  }
  scope.listen(opener, 'click', open);
  scope.listen(panel.querySelector('[data-close]'), 'click', () => close());
  scope.listen(panel.querySelector('[data-cancel]'), 'click', () => close());
  for (const input of panel.querySelectorAll('[data-setting], input[name="draw-color-palette-mode"], input[name="draw-color-scope"]')) scope.listen(input, 'input', refresh);
  for (const input of panel.querySelectorAll('input[name="draw-color-palette-mode"], input[name="draw-color-scope"]')) scope.listen(input, 'change', refresh);
  scope.listen(apply, 'click', async () => {
    if (!active || !previewDocument || apply.disabled) return;
    try {
      const result = await onApply({ ...(previewAnimation ? { animation: previewAnimation } : {}), document: previewDocument, sourceAnimation, sourceDocument, frameId: state.frameId, layerId: state.layerId, settings });
      if (result === false) { setStatus('適用できませんでした。内容を確認してください。'); return; }
      close({ restore: false });
    } catch (error) { setStatus(error?.message || '適用できませんでした。'); }
  });
  const curvePoint = event => {
    const rect = panel.querySelector('svg').getBoundingClientRect();
    return clamp(Math.round(255 - ((event.clientY - rect.top) / rect.height * 255)), 0, 255);
  };
  scope.listen(points, 'pointerdown', event => {
    const index = Number(event.target?.dataset?.curveIndex); if (!Number.isInteger(index)) return;
    dragging = index; points.setPointerCapture?.(event.pointerId); event.preventDefault();
  });
  scope.listen(points, 'pointermove', event => { if (dragging == null) return; settings.curve[dragging] = curvePoint(event); refresh(); });
  scope.listen(points, 'pointerup', () => { dragging = null; });
  scope.listen(points, 'pointercancel', () => { dragging = null; });
  scope.listen(points, 'keydown', event => {
    const index = Number(event.target?.dataset?.curveIndex); if (!Number.isInteger(index) || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); settings.curve[index] = clamp(settings.curve[index] + (event.key === 'ArrowUp' ? 4 : -4), 0, 255); refresh();
  });
  scope.listen(panel, 'keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(node => !node.hidden);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  scope.listen(doc, 'keydown', event => { if (!panel.hidden && event.key === 'Escape') { event.preventDefault(); close(); } });
  scope.add(() => { close(); opener.remove(); panel.remove(); });
  updateGraph();
  return { open, close, refresh, opener, panel };
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
