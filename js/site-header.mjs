import { freeWithoutAdWaitMs, hasPro, onPassChange, passRemainingMs, requestPass } from './pixieed-pass.mjs?v=20260930-rewarded-gpt-1';
import { derivePassGauge } from './pass-gauge.mjs?rev=20260929-tool-ui-1';
import './site-analytics.mjs?rev=20260930-analytics-review-1';
import { hasPassButtonMarkup, passButtonMarkup, renderPassButton } from './pass-button.mjs?rev=20260930-pass-button-1';

const brandedLink = () => {
  const link = document.createElement('a');
  link.className = 'brand px-header-brand';
  link.href = '/';
  link.setAttribute('aria-label', 'PiXiEED ホーム');
  link.innerHTML = '<img src="/assets/brand/pixieed-logo-48.png" width="40" height="40" alt=""><span>PiXiEED</span>';
  return link;
};
const handledButtons = new WeakSet();
const handledPanels = new WeakSet();
const panelTimers = new Map();
const panelPhases = new WeakMap();
const prefersReducedMotion = () => document.documentElement.dataset.pixieedMotion === 'reduced'
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const freeWait = pro ? Infinity : freeWithoutAdWaitMs(now);
  const { gauge, freeReady, freeDescription } = deriveHeaderPassState({ remainingMs: left, pro, freeWaitMs: freeWait });
  renderPassButton(button, { remainingMs: left, pro, freeReady });
  if (button.disabled !== gauge.pro) button.disabled = gauge.pro;
  const description = gauge.pro ? 'Pro：すべての特典が使えます'
    : gauge.active ? `特典はあと${gauge.clock}。終わるとまた広告1本で1時間使えます`
      : freeReady ? freeDescription : `広告1本で1時間、すべての特典が使えます。${freeDescription}`;
  if (button.getAttribute('aria-label') !== description) button.setAttribute('aria-label', description);
  if (button.title !== description) button.title = description;
}

let refreshTimer = 0;
function refresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = 0;
  if (document.visibilityState === 'hidden') {
    clearPanelEffects();
    return;
  }
  const buttons = document.querySelectorAll('[data-header-pass]');
  if (!buttons.length) return;
  buttons.forEach(updateButton);
  const remaining = passRemainingMs();
  const freeWait = hasPro() ? Infinity : freeWithoutAdWaitMs();
  const nextChange = remaining > 0 && remaining !== Infinity
    ? Math.min(remaining <= 5 * 60 * 1000 ? 10000 : 30000, remaining, freeWait > 0 ? freeWait : Infinity)
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
    button.innerHTML = passButtonMarkup;
    const utilities = inner.querySelector('.menu-toggle, .audio-header-actions, .lc-top-right');
    inner.insertBefore(button, utilities);
  }
  if (!hasPassButtonMarkup(button)) button.innerHTML = passButtonMarkup;
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
