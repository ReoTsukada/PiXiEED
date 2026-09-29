import { freeWithoutAdWaitMs, hasPro, onPassChange, passRemainingMs, requestPass } from './pixieed-pass.mjs?v=20260929-daily-free-1';
import { derivePassGauge, renderPassGauge } from './pass-gauge.mjs?rev=20260929-tool-ui-1';

const brandedLink = () => {
  const link = document.createElement('a');
  link.className = 'brand px-header-brand';
  link.href = '/';
  link.setAttribute('aria-label', 'PiXiEED ホーム');
  link.innerHTML = '<img src="/assets/brand/pixieed-logo-48.png" width="40" height="40" alt=""><span>PiXiEED</span>';
  return link;
};
const headerPassRow = (hours) => `<span class="px-pass-gauge-row" data-hours="${hours}" data-filled="false">${'<span class="px-pass-cell" data-filled="false"></span>'.repeat(12)}</span>`;
const headerPassMarkup = '<span class="px-pass-top"><svg class="px-pass-pixel-star" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M4 0h2v2h2v2h2v2H8v2H6v2H4V8H2V6H0V4h2V2h2z"/></svg><span data-header-pass-label>+1時間</span></span><span class="px-pass-gauge" aria-hidden="true">' + [3, 2, 1].map(headerPassRow).join('') + '</span><span class="px-pass-add" aria-hidden="true">+</span>';
const rechargeExpiries = new WeakMap(); const rechargeTimers = new WeakMap(); const activeRechargeButtons = new Set(); const handledButtons = new WeakSet();
const gaugeRows = new WeakMap();
const freeReadyState = new WeakMap();
const freeReadyTimers = new WeakMap();
const activeFreeReadyButtons = new Set();
const handledPanels = new WeakSet();
const panelTimers = new Map();
const panelPhases = new WeakMap();
const prefersReducedMotion = () => document.documentElement.dataset.pixieedMotion === 'reduced'
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function clearRecharge(button) {
  window.clearTimeout(rechargeTimers.get(button));
  delete button.dataset.recharged;
  for (const row of button.querySelectorAll('.px-pass-gauge-row')) delete row.dataset.charged;
  rechargeTimers.delete(button);
  activeRechargeButtons.delete(button);
}

function clearFreeReadyEffect(button) {
  window.clearTimeout(freeReadyTimers.get(button));
  delete button.dataset.freeArrive;
  freeReadyTimers.delete(button);
  activeFreeReadyButtons.delete(button);
}

function formatFreeWait(waitMs) {
  const minutes = Math.ceil(Math.max(0, waitMs) / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours ? `${hours}時間${remainingMinutes ? `${remainingMinutes}分` : ''}` : `${Math.max(1, remainingMinutes)}分`;
}

export function deriveHeaderPassState({ remainingMs, pro = false, freeWaitMs = 0 }) {
  const gauge = derivePassGauge(pro ? Infinity : remainingMs);
  const freeReady = !pro && freeWaitMs <= 0;
  const freeDescription = pro ? '' : freeReady ? '今日の無料1時間を受け取れます' : `明日、無料1時間を受け取れます（あと${formatFreeWait(freeWaitMs)}）`;
  const displayLabel = freeReady && !gauge.active ? '無料1時間' : gauge.label;
  return { gauge, freeReady, freeDescription, displayLabel };
}

function clearPanelEffects() {
  for (const [node, timer] of panelTimers) {
    window.clearTimeout(timer);
    delete node.dataset.pxPanelMotion;
  }
  panelTimers.clear();
}

function showPanelEffect(node, kind) {
  if (!node || document.visibilityState === 'hidden' || prefersReducedMotion()) return;
  window.clearTimeout(panelTimers.get(node));
  const phase = panelPhases.get(node) === 'a' ? 'b' : 'a';
  panelPhases.set(node, phase);
  node.dataset.pxPanelMotion = `${kind}-${phase}`;
  panelTimers.set(node, window.setTimeout(() => {
    delete node.dataset.pxPanelMotion;
    panelTimers.delete(node);
  }, 220));
}

function bindPanelEffects() {
  for (const panel of document.querySelectorAll('details.audio-popover, details.draw-import')) {
    if (handledPanels.has(panel)) continue;
    handledPanels.add(panel);
    panel.addEventListener('toggle', () => {
      if (document.visibilityState === 'hidden' || prefersReducedMotion()) return;
      const summary = panel.querySelector('summary');
      const content = panel.querySelector('.audio-popover-body, .draw-import__options');
      if (!panel.open) { showPanelEffect(summary, 'return'); return; }
      if (!content || !summary) return;
      const anchor = summary.getBoundingClientRect();
      const rect = content.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      content.style.setProperty('--px-panel-origin-x', `${Math.max(0, Math.min(rect.width, anchor.left + anchor.width / 2 - rect.left))}px`);
      content.style.setProperty('--px-panel-origin-y', `${Math.max(0, Math.min(rect.height, anchor.top + anchor.height / 2 - rect.top))}px`);
      showPanelEffect(content, 'reveal');
    });
  }
}

function updateButton(button) {
  const now = Date.now();
  const left = passRemainingMs(now);
  const pro = hasPro();
  const { gauge: state, freeReady, freeDescription, displayLabel } = deriveHeaderPassState({ remainingMs: left, pro, freeWaitMs: pro ? Infinity : freeWithoutAdWaitMs(now) });
  const previousRows = gaugeRows.get(button);
  renderPassGauge(button, { ...state, displayLabel });
  gaugeRows.set(button, state.rows);
  if (button.disabled !== state.pro) button.disabled = state.pro;
  const aria = state.pro ? 'Pro：すべての拡張が使えます' : freeReady && !state.active
    ? freeDescription
    : freeReady ? `${freeDescription}。拡張はあと${state.clock}。広告で1時間追加できます`
      : state.active ? `拡張はあと${state.clock}。広告で1時間追加できます。${freeDescription}`
        : `広告で1時間追加できます。${freeDescription}`;
  const fullDescription = aria;
  if (button.getAttribute('aria-label') !== fullDescription) button.setAttribute('aria-label', fullDescription);
  if (button.title !== fullDescription) button.title = fullDescription;
  if (button.dataset.freeReady !== String(freeReady)) button.dataset.freeReady = String(freeReady);
  const previousFreeReady = freeReadyState.get(button);
  freeReadyState.set(button, freeReady);
  if (freeReady && previousFreeReady !== true && document.visibilityState !== 'hidden' && !prefersReducedMotion()) {
    clearFreeReadyEffect(button);
    button.dataset.freeArrive = 'true';
    activeFreeReadyButtons.add(button);
    freeReadyTimers.set(button, window.setTimeout(() => clearFreeReadyEffect(button), 420));
  }
  const expiry = state.pro ? Infinity : state.active ? now + left : 0;
  const previous = rechargeExpiries.get(button);
  if (previous === undefined) rechargeExpiries.set(button, expiry);
  else {
    if (!state.pro && expiry > previous + 1000) {
      clearRecharge(button);
      button.dataset.recharged = 'true';
      button.querySelectorAll('.px-pass-gauge-row').forEach((row, index) => {
        if (!state.rows[index].cells.some((filled, cell) => filled && !previousRows?.[index]?.cells[cell])) return;
        row.style.setProperty('--px-charged-width', `${state.rows[index].cells.filter(Boolean).length / 12 * 100}%`);
        row.style.setProperty('--px-charged-delay', `${(2 - index) * 40}ms`);
        row.dataset.charged = 'true';
      });
      activeRechargeButtons.add(button);
      const timer = window.setTimeout(() => clearRecharge(button), 450);
      rechargeTimers.set(button, timer);
    }
    rechargeExpiries.set(button, expiry);
  }
}

let refreshTimer = 0;
function refresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = 0;
  if (document.visibilityState === 'hidden') {
    clearPanelEffects();
    for (const button of activeRechargeButtons) clearRecharge(button);
    for (const button of activeFreeReadyButtons) clearFreeReadyEffect(button);
    return;
  }
  const buttons = document.querySelectorAll('[data-header-pass]');
  if (!buttons.length) return;
  buttons.forEach(updateButton);
  const remaining = passRemainingMs();
  const freeWait = hasPro() ? Infinity : freeWithoutAdWaitMs();
  const nextChange = remaining > 0 && remaining !== Infinity
    ? Math.min(30000, remaining, freeWait > 0 ? freeWait : Infinity)
    : freeWait;
  if (Number.isFinite(nextChange) && nextChange > 0) refreshTimer = window.setTimeout(refresh, nextChange);
}

/** Preserve each page's own controls and its central navigation action. */
export function mountSiteHeader() {
  if (window.top !== window.self || document.body.hasAttribute('data-admin-page')) return null;
  let header = document.querySelector('.site-header, .audio-heading, .lc-top');
  if (!header) {
    header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = '<div class="header-inner"></div>';
    document.body.prepend(header);
    if (document.querySelector('.globe-prototype')) document.body.classList.add('px-standalone-globe');
  }
  header.classList.add('px-site-header');
  header.setAttribute('aria-label', 'PiXiEED 共通ヘッダー');
  const inner = header.querySelector('.header-inner') || header;
  inner.classList.add('px-header-inner');
  let brand = inner.querySelector('.brand');
  if (!brand) inner.prepend(brand = brandedLink());
  brand.classList.add('px-header-brand');
  brand.href = '/';
  brand.setAttribute('aria-label', 'PiXiEED ホーム');
  // tool pages name themselves beside the logo (<body data-tool-name="かんたんドット">); home says PiXiEED
  const toolName = document.body.dataset.toolName;
  if (toolName) {
    let label = brand.querySelector('span:not(.brand-mark)');
    if (!label) { label = document.createElement('span'); brand.append(label); }
    label.textContent = toolName; brand.classList.add('px-header-brand--tool');
    if (document.body.dataset.toolShort) label.dataset.short = document.body.dataset.toolShort; // shown instead when the header is tight
  }
  inner.querySelectorAll('.menu-toggle, .audio-header-actions, .lc-top-left, .lc-top-right').forEach((el) => el.classList.add('px-header-utilities'));
  let button = inner.querySelector('[data-header-pass]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'px-header-pass';
    button.setAttribute('data-header-pass', '');
    button.innerHTML = headerPassMarkup;
    const utilities = inner.querySelector('.menu-toggle, .audio-header-actions, .lc-top-right');
    inner.insertBefore(button, utilities);
  }
  if (!button.querySelector('.px-pass-gauge-row[data-hours="1"]') || button.querySelectorAll('.px-pass-gauge-row').length !== 3
      || [...button.querySelectorAll('.px-pass-gauge-row')].some((row) => row.querySelectorAll('.px-pass-cell').length !== 12)) button.innerHTML = headerPassMarkup;
  if (!button.querySelector('.px-pass-hint')) {
    const hint = document.createElement('span'); hint.className = 'px-pass-hint'; hint.setAttribute('aria-hidden', 'true');
    button.append(hint);
  }
  if (!handledButtons.has(button)) {
    handledButtons.add(button);
    button.addEventListener('click', async () => {
      if (button.disabled || button.dataset.pending === 'true') return;
      button.dataset.pending = 'true';
      try { await requestPass({ extend: true }); }
      finally { delete button.dataset.pending; refresh(); }
    });
  }
  document.documentElement.classList.add('px-header-ready');
  bindPanelEffects();
  refresh();
  return header;
}

if (typeof document !== 'undefined') {
  onPassChange(refresh);
  window.addEventListener('storage', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', refresh);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSiteHeader, { once: true });
  else mountSiteHeader();
}
