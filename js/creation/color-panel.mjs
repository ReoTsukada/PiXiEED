import { hexToHsl, hslToHex } from './color-utils.mjs?rev=20261004-symmetry-color-panel-1';

const QUICK_COLORS = ['#17232d', '#ffffff', '#ff4d4d', '#ff9f1c', '#ffe14d', '#7ed957', '#2ec4b6', '#3a86ff', '#8338ec', '#ff6fb5', '#a0522d', '#ffd8b1'];
const COLOR_RGB = /^#[\da-f]{6}$/i;
const COLOR_RGBA = /^#[\da-f]{8}$/i;

function validColor(value, allowAlpha = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (COLOR_RGB.test(normalized)) return allowAlpha ? `${normalized}ff` : normalized;
  if (allowAlpha && COLOR_RGBA.test(normalized)) return normalized;
  return null;
}

const rgbOf = color => color.slice(0, 7);
const alphaOf = color => Number.parseInt(color.slice(7, 9), 16);
const withAlpha = (rgb, alpha, allowAlpha) => allowAlpha ? `${rgbOf(rgb)}${Math.max(0, Math.min(255, Math.round(alpha))).toString(16).padStart(2, '0')}` : rgbOf(rgb);

function asElement(anchor) {
  if (anchor instanceof Element) return anchor;
  return null;
}

function anchorRect(anchor) {
  if (anchor && typeof anchor.getBoundingClientRect === 'function') return anchor.getBoundingClientRect();
  if (anchor && Number.isFinite(anchor.left) && Number.isFinite(anchor.top)) return anchor;
  return null;
}

export function mountColorPanel({ scope, getAnchor, onChange, onClose, id = 'draw-color-editor', inputIds = { h: 'dce-h', s: 'dce-s', l: 'dce-l' }, viewTabs = null, allowAlpha = false } = {}) {
  if (!scope?.listen || !scope?.add || typeof scope.disposed !== 'boolean') throw new TypeError('Color panel requires a lifecycle scope');
  if (typeof getAnchor !== 'function' || typeof onChange !== 'function') throw new TypeError('Color panel requires getAnchor and onChange callbacks');
  const controller = new AbortController();
  const listen = (target, type, callback, options = {}) => {
    if (!target || disposed) return;
    target.addEventListener(type, callback, { ...options, signal: controller.signal });
  };
  let open = false; let disposed = false; let color = allowAlpha ? '#ffffffff' : '#ffffff'; let resetColor = null; let hsl = { h: 0, s: 0, l: 100 };
  const element = document.createElement('section');
  element.id = id; element.className = 'draw-color-editor creation-color-panel';
  element.setAttribute('role', 'dialog'); element.setAttribute('aria-modal', 'false'); element.setAttribute('aria-label', '色を調整');
  element.hidden = true; element.tabIndex = -1;
  element.innerHTML = `
    <header class="dce-header"><h2>色を調整</h2></header>
    <div class="dce-preview" aria-label="色の変化">
      <div class="dce-preview-swatch"><span class="dce-before" role="img" aria-label="変更前の色"></span><span class="dce-after" role="img" aria-label="変更後の色"></span></div>
      <span class="dce-preview-label">変更前 <span aria-hidden="true">→</span> 変更後</span>
    </div>
    <div class="dce-quick" role="group" aria-label="すぐ使える色"></div>
    <div class="dce-sliders">
      <label class="dce-slider dce-hue" for="${inputIds.h}"><span class="dce-slider-label">色み <output data-dce-value="h">0°</output></span><input id="${inputIds.h}" data-dce-axis="h" type="range" min="0" max="359" step="1" value="0"></label>
      <label class="dce-slider dce-sat" for="${inputIds.s}"><span class="dce-slider-label">あざやか <output data-dce-value="s">0%</output></span><input id="${inputIds.s}" data-dce-axis="s" type="range" min="0" max="100" step="1" value="0"></label>
      <label class="dce-slider dce-light" for="${inputIds.l}"><span class="dce-slider-label">明るさ <output data-dce-value="l">100%</output></span><input id="${inputIds.l}" data-dce-axis="l" type="range" min="0" max="100" step="1" value="100"></label>
      ${allowAlpha ? '<label class="dce-slider dce-alpha" for="dce-a"><span class="dce-slider-label">不透明度 <output data-dce-value="a">255</output></span><input id="dce-a" data-dce-axis="a" type="range" min="0" max="255" step="1" value="255"></label>' : ''}
    </div>
    <footer class="dce-actions"><button id="dce-reset" class="dce-reset" type="button">元に戻す</button><button id="dce-done" class="dce-done" type="button">完了</button></footer>`;
  let activeView = typeof viewTabs?.active === 'string' ? viewTabs.active : viewTabs?.items?.[0]?.id;
  const viewTabsHost = viewTabs?.items?.length ? document.createElement('div') : null;
  if (viewTabsHost) {
    viewTabsHost.className = 'dce-view-tabs';
    viewTabsHost.setAttribute('role', viewTabs.compactHeader ? 'tablist' : 'group');
    viewTabsHost.setAttribute('aria-label', viewTabs.label || '色と音色の切り替え');
    for (const item of viewTabs.items) {
      if (!item || typeof item.id !== 'string' || typeof item.label !== 'string') continue;
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.dceView = item.id; button.textContent = item.label;
      if (viewTabs.compactHeader) button.setAttribute('role', 'tab');
      button.setAttribute('aria-pressed', String(item.id === activeView));
      if (viewTabs.compactHeader) button.setAttribute('aria-selected', String(item.id === activeView));
      button.setAttribute('aria-label', `${item.label}を表示`);
      viewTabsHost.append(button);
    }
    if (viewTabs.compactHeader) {
      const header = element.querySelector('.dce-header');
      header?.classList.add('dce-header--views');
      header?.append(viewTabsHost);
      const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.id = 'dce-close';
      closeButton.className = 'dce-close'; closeButton.setAttribute('aria-label', '色と音色のパネルを閉じる'); closeButton.textContent = '×';
      header?.append(closeButton);
      listen(closeButton, 'click', closeAndNotify);
    } else element.querySelector('.dce-header')?.after(viewTabsHost);
  }
  const contentHost = document.createElement('div'); contentHost.className = 'dce-content';
  for (const selector of ['.dce-preview', '.dce-quick', '.dce-sliders']) {
    const content = element.querySelector(selector); if (content) contentHost.append(content);
  }
  (viewTabsHost || element.querySelector('.dce-header'))?.after(contentHost);
  const before = element.querySelector('.dce-before'); const after = element.querySelector('.dce-after');
  const resetButton = element.querySelector('#dce-reset'); const doneButton = element.querySelector('#dce-done');
  const input = (axis) => element.querySelector(`[data-dce-axis="${axis}"]`);
  const valueOutput = (axis) => element.querySelector(`[data-dce-value="${axis}"]`);
  const quickHost = element.querySelector('.dce-quick');
  for (const quickColor of QUICK_COLORS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'dce-quick-color';
    button.dataset.color = quickColor; button.style.setProperty('--c', quickColor); button.setAttribute('aria-label', quickColor); button.title = quickColor;
    quickHost.append(button);
  }
  document.body.append(element);

  function sync() {
    input('h').value = String(hsl.h); input('s').value = String(hsl.s); input('l').value = String(hsl.l);
    valueOutput('h').value = valueOutput('h').textContent = `${hsl.h}°`;
    valueOutput('s').value = valueOutput('s').textContent = `${hsl.s}%`;
    valueOutput('l').value = valueOutput('l').textContent = `${hsl.l}%`;
    if (allowAlpha) {
      input('a').value = String(alphaOf(color));
      valueOutput('a').value = valueOutput('a').textContent = String(alphaOf(color));
    }
    element.style.setProperty('--h', String(hsl.h)); element.style.setProperty('--s', `${hsl.s}%`); element.style.setProperty('--l', `${hsl.l}%`);
    if (allowAlpha) element.style.setProperty('--alpha-preview', rgbOf(color));
    before.style.backgroundColor = element.dataset.beforeColor || color;
    after.style.backgroundColor = color;
    after.setAttribute('aria-label', `変更後の色 ${color}`);
    for (const button of quickHost.children) button.setAttribute('aria-pressed', String(button.dataset.color === rgbOf(color)));
  }

  function position() {
    if (!open || disposed) return;
    const anchor = getAnchor(); const anchorNode = asElement(anchor); const rect = anchorRect(anchor);
    const header = document.querySelector('.px-site-header, .site-header, header')?.getBoundingClientRect();
    const nav = document.querySelector('.app-tabs, .site-bottom-nav, nav[aria-label="アプリナビゲーション"]')?.getBoundingClientRect();
    const topLimit = Math.max(8, Math.ceil(header?.bottom ?? 0) + 8);
    const bottomLimit = Math.max(topLimit + 44, Math.min(innerHeight, nav?.top ?? innerHeight) - 8);
    const available = Math.max(44, bottomLimit - topLimit);
    // Re-measure natural height after resizing or changing the selected color.
    element.style.height = '';
    element.style.maxHeight = `${available}px`;
    element.style.width = `min(380px, calc(100vw - 16px))`;
    const width = Math.min(380, innerWidth - 16);
    let left = rect ? rect.right - width : (innerWidth - width) / 2;
    left = Math.max(8, Math.min(left, innerWidth - width - 8));
    element.style.left = `${Math.round(left)}px`;
    const height = Math.min(element.scrollHeight, available);
    element.style.height = `${height}px`;
    const above = (rect?.top ?? bottomLimit) - height - 8;
    const below = (rect?.bottom ?? topLimit) + 8;
    let top;
    if (above >= topLimit) top = above;
    else if (below + height <= bottomLimit) top = below;
    else if (rect && rect.top - topLimit > bottomLimit - rect.bottom) top = topLimit;
    else top = Math.max(topLimit, bottomLimit - height);
    element.style.top = `${Math.round(Math.max(topLimit, Math.min(top, bottomLimit - height)))}px`;
    element.style.bottom = 'auto';
    if (anchorNode) element.dataset.anchorId = anchorNode.id || '';
  }

  function applyColor(nextColor, fallbackHue = hsl.h, requestedHsl = null) {
    if (allowAlpha && COLOR_RGB.test(String(nextColor ?? '').trim())) nextColor = `${String(nextColor).trim().toLowerCase()}${alphaOf(color).toString(16).padStart(2, '0')}`;
    const requested = validColor(nextColor, allowAlpha); if (!requested) return false;
    let accepted;
    try { accepted = onChange(requested); } catch { accepted = false; }
    if (accepted === false) { sync(); return false; }
    const resolved = validColor(typeof accepted === 'string' ? accepted : requested, allowAlpha);
    if (!resolved) { sync(); return false; }
    color = resolved;
    hsl = requestedHsl && resolved === requested
      ? { h: ((requestedHsl.h % 360) + 360) % 360, s: Math.max(0, Math.min(100, requestedHsl.s)), l: Math.max(0, Math.min(100, requestedHsl.l)) }
      : hexToHsl(color, fallbackHue);
    sync(); position();
    return color;
  }

  function closeAndNotify() {
    if (!open) return;
    close();
    try { onClose?.(); } catch { /* Keep close state even when the owner callback fails. */ }
  }

  function setView(nextView, { notify = true } = {}) {
    if (!viewTabsHost || !viewTabs.items?.some(item => item.id === nextView) || nextView === activeView) return false;
    activeView = nextView;
    for (const tab of viewTabsHost.querySelectorAll('button[data-dce-view]')) {
      const selected = String(tab.dataset.dceView === activeView);
      tab.setAttribute('aria-pressed', selected);
      if (viewTabs.compactHeader) tab.setAttribute('aria-selected', selected);
    }
    if (notify) try { viewTabs.onSelect?.(nextView); } catch { /* Keep tab state even when its owner callback fails. */ }
    return true;
  }

  function openPanel({ color: initialColor, resetColor: initialResetColor = null } = {}) {
    if (disposed) return;
    const normalized = validColor(initialColor, allowAlpha); if (!normalized) throw new TypeError(`Color panel needs a ${allowAlpha ? '#RRGGBB or #RRGGBBAA' : '#RRGGBB'} color`);
    color = normalized; resetColor = validColor(initialResetColor, allowAlpha);
    hsl = hexToHsl(rgbOf(color), hsl.h); element.dataset.beforeColor = color;
    if (viewTabsHost) {
      activeView = typeof viewTabs?.active === 'string' ? viewTabs.active : viewTabs?.items?.[0]?.id;
      for (const tab of viewTabsHost.querySelectorAll('button[data-dce-view]')) tab.setAttribute('aria-pressed', String(tab.dataset.dceView === activeView));
    }
    resetButton.hidden = !resetColor; sync();
    open = true; element.hidden = false; element.classList.add('is-open');
    position(); requestAnimationFrame(position);
    try { viewTabs?.onShow?.(activeView); } catch { /* Opening remains successful if an external view hook fails. */ }
  }

  function setColor(hex, options = {}) {
    if (allowAlpha && COLOR_RGB.test(String(hex ?? '').trim())) hex = `${String(hex).trim().toLowerCase()}${alphaOf(color).toString(16).padStart(2, '0')}`;
    const normalized = validColor(hex, allowAlpha); if (!normalized) return false;
    color = normalized;
    if (Object.hasOwn(options, 'resetColor')) resetColor = validColor(options.resetColor, allowAlpha);
    if (Object.hasOwn(options, 'beforeColor')) element.dataset.beforeColor = validColor(options.beforeColor, allowAlpha) || color;
    resetButton.hidden = !resetColor; hsl = hexToHsl(rgbOf(color), hsl.h); sync(); position();
    return color;
  }

  function close() {
    if (!open) return;
    open = false;
    try { viewTabs?.onHide?.(); } catch { /* Keep close state even when a view owner fails. */ }
    element.classList.remove('is-open'); element.hidden = true; delete element.dataset.anchorId;
  }

  for (const axis of ['h', 's', 'l']) {
    listen(input(axis), 'input', () => {
      const requestedH = Number(input('h').value); const requestedS = Number(input('s').value); const requestedL = Number(input('l').value);
      const next = withAlpha(hslToHex(requestedH, requestedS, requestedL), allowAlpha ? alphaOf(color) : 255, allowAlpha);
      applyColor(next, requestedH, { h: requestedH, s: requestedS, l: requestedL });
    });
  }
  if (allowAlpha) listen(input('a'), 'input', () => applyColor(withAlpha(color, Number(input('a').value), true)));
  listen(quickHost, 'click', (event) => {
    const button = event.target.closest('button[data-color]'); if (button) applyColor(button.dataset.color);
  });
  listen(resetButton, 'click', () => { if (resetColor) applyColor(resetColor, hexToHsl(resetColor, hsl.h).h); });
  listen(doneButton, 'click', closeAndNotify);
  listen(viewTabsHost, 'click', (event) => {
    const button = event.target.closest('button[data-dce-view]');
    if (button && viewTabsHost.contains(button)) setView(button.dataset.dceView);
  });
  listen(document, 'pointerdown', (event) => {
    if (!open || element.contains(event.target)) return;
    const anchor = getAnchor(); const anchorNode = asElement(anchor);
    if (anchorNode && (event.target === anchorNode || anchorNode.contains(event.target))) return;
    closeAndNotify();
  }, { capture: true });
  listen(document, 'keydown', (event) => {
    if (open && event.key === 'Escape') {
      try { if (viewTabs?.onEscape?.(event) === true) { event.preventDefault(); event.stopImmediatePropagation(); return; } } catch { /* Fall through to the panel close. */ }
      event.preventDefault(); closeAndNotify();
    }
  }, { capture: true });
  listen(window, 'resize', position, { passive: true });
  listen(window, 'scroll', position, { passive: true });

  function dispose() {
    if (disposed) return;
    close(); disposed = true; controller.abort(); element.remove();
  }
  scope.add(dispose);
  return { open: openPanel, setColor, setView, dismiss: closeAndNotify, close, element, get isOpen() { return open; }, get activeView() { return activeView; }, dispose };
}
