/** Display-only geometry. Never edits, truncates or re-encodes the saved text. */
export function textArtScale(mode, contentWidth, contentHeight, viewWidth, viewHeight, manual = 1) {
  if (![contentWidth, contentHeight, viewWidth, viewHeight].every(n => Number.isFinite(n) && n > 0)) return 1;
  if (mode === 'fit') return Math.min(1, viewWidth / contentWidth, viewHeight / contentHeight);
  if (mode === 'width') return Math.min(1, viewWidth / contentWidth);
  return Number.isFinite(manual) ? Math.min(8, Math.max(Number.EPSILON, manual)) : 1;
}

export function createTextArtViewer(root, { document: doc = document, window: win = window } = {}) {
  const result = root.querySelector('[data-tx-result]');
  if (!result) throw new Error('文字アートの表示先がありません。');
  const host = doc.createElement('section'); host.className = 'tx-art-viewer'; host.hidden = true;
  host.dataset.txArtViewer = '';
  // Outside data-tx-result: old-result save guards must not disable display-only controls.
  host.innerHTML = `<div class="tx-art-toolbar" role="group" aria-label="文字アートの表示倍率">
    <button type="button" data-tx-view="fit" aria-pressed="true">全体表示</button>
    <button type="button" data-tx-view="width" aria-pressed="false">幅に合わせる</button>
    <button type="button" data-tx-view="out" aria-label="文字アートを縮小">−</button>
    <button type="button" data-tx-view="in" aria-label="文字アートを拡大">＋</button>
    <button type="button" data-tx-view="actual" aria-pressed="false">100%</button>
  </div><p class="tx-art-meta"><output data-tx-art-zoom aria-live="polite">全体表示</output><span>表示倍率のみ・保存内容は変わりません</span></p>
  <div class="tx-art-viewport" data-tx-art-viewport tabindex="0" role="region" aria-label="文字アート。拡大時は枠内を上下左右にスクロールできます。">
    <div class="tx-art-surface"><pre data-tx-art-content></pre></div>
  </div>`;
  result.before(host);
  const viewport = host.querySelector('[data-tx-art-viewport]'), surface = host.querySelector('.tx-art-surface');
  const pre = host.querySelector('pre'), label = host.querySelector('output');
  const raw = doc.createElement('details'); raw.className = 'tx-art-raw'; raw.dataset.txRawText = ''; raw.hidden = true;
  const summary = doc.createElement('summary'); summary.textContent = '文字列・復元コードを見る（コピー・保存は全文）'; raw.append(summary);
  const textarea = result.querySelector('[data-tx-text-result]');
  textarea.before(raw);
  const textLabel = result.querySelector('label[for="tx-result"]');
  if (textLabel) raw.append(textLabel);
  raw.append(textarea, result.querySelector('[data-tx-preview-note]'));
  let mode = 'fit', scale = 1, manual = 1, source = null, frame = 0, disposed = false, resetScroll = true;
  const sheet = doc.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/css/text-art-viewer.css?rev=20261030-text-fit-2';
  sheet.addEventListener('load', schedule); doc.head.append(sheet);
  function draw() {
    frame = 0;
    if (disposed || host.hidden || !viewport.clientWidth || !viewport.clientHeight) return;
    // Set overflow policy before measuring: native scrollbars change the usable width.
    host.dataset.viewMode = mode;
    viewport.style.overflowX = mode === 'manual' ? 'auto' : 'hidden';
    viewport.style.overflowY = mode === 'fit' ? 'hidden' : 'auto';
    const width = pre.offsetWidth, height = pre.offsetHeight;
    if (!width || !height) return;
    const old = scale;
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2 - 12) / old;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2 - 12) / old;
    scale = textArtScale(mode, width, height, viewport.clientWidth - 24, viewport.clientHeight - 24, manual);
    const sw = Math.max(viewport.clientWidth, Math.ceil(width * scale) + 24);
    const sh = Math.max(viewport.clientHeight, Math.ceil(height * scale) + 24);
    surface.style.width = `${sw}px`; surface.style.height = `${sh}px`;
    pre.style.left = `${Math.max(12, (sw - width * scale) / 2)}px`;
    pre.style.top = `${Math.max(12, (sh - height * scale) / 2)}px`;
    pre.style.transform = `scale(${scale})`;
    host.dataset.viewMode = mode; host.dataset.viewScale = String(scale);
    const percent = scale < .01 ? (scale * 100).toFixed(2) : (scale * 100).toFixed(1).replace(/\.0$/, '');
    label.textContent = `${mode === 'fit' ? '全体表示' : mode === 'width' ? '幅合わせ' : '拡大率'} ${percent}%`;
    for (const b of host.querySelectorAll('[aria-pressed]')) b.setAttribute('aria-pressed', String(b.dataset.txView === mode || (b.dataset.txView === 'actual' && mode === 'manual' && scale === 1)));
    if (resetScroll || mode === 'fit') { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
    else if (old !== scale) {
      viewport.scrollLeft = centerX * scale + 12 - viewport.clientWidth / 2;
      viewport.scrollTop = centerY * scale + 12 - viewport.clientHeight / 2;
    }
    if (mode === 'width') viewport.scrollLeft = 0;
    resetScroll = false;
  }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(draw); }
  host.addEventListener('click', event => {
    const action = event.target.closest('[data-tx-view]')?.dataset.txView;
    if (!action) return;
    if (action === 'fit' || action === 'width') { mode = action; resetScroll = true; }
    else { mode = 'manual'; manual = action === 'actual' ? 1 : Math.min(8, Math.max(Number.EPSILON, scale * (action === 'in' ? 1.25 : .8))); }
    schedule();
  });
  const observer = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  observer?.observe(viewport); observer?.observe(pre);
  win.addEventListener('resize', schedule);
  doc.fonts?.ready.then(schedule);
  doc.fonts?.addEventListener('loadingdone', schedule);
  const onShow = () => schedule();
  const onHide = event => { if (!event.persisted) api.destroy(); };
  win.addEventListener('pageshow', onShow); win.addEventListener('pagehide', onHide);
  const api = {
    show(art, { source: nextSource = null } = {}) {
      const changedSource = source !== nextSource;
      if (changedSource) { source = nextSource; mode = 'fit'; manual = 1; resetScroll = true; raw.open = false; }
      const wasHidden = host.hidden;
      host.hidden = !art;
      pre.textContent = art; // Safe plain text, including spaces, newlines and emoji.
      raw.hidden = false;
      if (!art) raw.open = true;
      else if (wasHidden && changedSource) raw.open = false;
      draw();
      schedule();
    },
    clear() { host.hidden = true; raw.hidden = true; pre.textContent = ''; },
    openRaw() { raw.hidden = false; raw.open = true; },
    resetView() { source = null; mode = 'fit'; manual = 1; resetScroll = true; },
    destroy() {
      disposed = true; win.cancelAnimationFrame(frame); observer?.disconnect();
      win.removeEventListener('resize', schedule); win.removeEventListener('pageshow', onShow); win.removeEventListener('pagehide', onHide);
      doc.fonts?.removeEventListener('loadingdone', schedule);
    }
  };
  return api;
}
