import './site-analytics.mjs?rev=20261017-analytics-integrity-1';
import { PAGE_DESTINATIONS, currentPageDestination, creationModeDestination } from './page-navigation.mjs?rev=20261024-common-tool-start-1';
import { installGlobeAnalyticsBridge } from './globe/analytics-bridge.mjs?rev=20261017-analytics-integrity-1';
import { installSiteInteractions } from './site-interactions.mjs?rev=20261001-interactions-1';
import { mountToolHeaderControls } from './tool-header-controls.mjs?rev=20261018-direct-runtime-1&nav=20261016-tool-operations-1';
import { mountPublicNavigation } from './public-navigation.mjs?rev=20261024-common-tool-start-1';
export { mountToolHeaderControls } from './tool-header-controls.mjs?rev=20261018-direct-runtime-1&nav=20261016-tool-operations-1';

const brandedLink = () => {
  const link = document.createElement('a');
  link.className = 'brand px-header-brand';
  link.href = '/';
  link.setAttribute('aria-label', 'PiXiEED ホーム');
  link.innerHTML = '<img src="/assets/brand/pixieed-logo-48.png" width="40" height="40" alt=""><span>PiXiEED</span>';
  return link;
};
const handledPanels = new WeakSet();
const panelTimers = new Map();
const panelPhases = new WeakMap();
const prefersReducedMotion = () => document.documentElement.dataset.pixieedMotion === 'reduced'
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

const MENU_MARKUP = `
  <div class="site-menu-backdrop" data-menu-backdrop hidden></div>
  <aside class="site-menu" id="site-menu" data-site-menu hidden role="dialog" aria-modal="true" aria-labelledby="site-menu-title" aria-describedby="site-menu-location">
    <div class="site-menu__head"><div><span class="eyebrow">PiXiEED</span><h2 id="site-menu-title">ページ移動</h2><p class="site-menu__description" id="site-menu-location">移動先を選んでください。</p></div><button class="site-menu__close" type="button" data-menu-close aria-label="メニューを閉じる">×</button></div>
    <div class="site-menu__body">
    <nav class="site-menu__nav" aria-label="ページ移動">
      ${PAGE_DESTINATIONS.map(group => `<div class="site-menu__group"><span class="site-menu__label">${group.label}</span>${group.links.map(([href, label, description, icon]) => `<a href="${href}" data-menu-link><img class="site-menu__icon" src="/assets/icons/pixieed/${icon}.svg" width="24" height="24" loading="lazy" decoding="async" alt="" aria-hidden="true"><span class="site-menu__link-copy"><span class="site-menu__link-title">${label}</span><span class="site-menu__link-description">${description}</span></span><span class="site-menu__current" hidden>✓ 現在のページ</span></a>`).join('')}</div>`).join('')}
    </nav>
    <div class="site-menu__utilities"><button type="button" data-menu-setting="all">設定を開く<span>表示・プライバシー</span></button></div>
    </div>
  </aside>
  <dialog class="site-settings" data-site-settings aria-labelledby="site-settings-title">
    <div class="site-settings__head"><div><span class="eyebrow">preferences</span><h2 id="site-settings-title">設定</h2></div><button class="site-settings__close" type="button" data-settings-close aria-label="設定を閉じる">×</button></div>
    <div class="site-settings__body">
    <section data-settings-panel="display"><h3>表示設定</h3><label class="site-settings__switch"><input type="checkbox" data-setting-motion><span><strong>動きを控えめにする</strong><small>地図の移動や画面切り替えを短くします。</small></span></label></section>
    <section data-settings-panel="privacy" hidden><h3>プライバシー設定</h3><p>PiXiEEDでは、個人を特定しない形で訪問・ページ閲覧・QR読み取り・いいねなどの集計を行い、作品や地図を改善します。</p><label class="site-settings__switch"><input type="checkbox" data-setting-analytics><span><strong>利用状況の集計を許可する</strong><small>オフにすると、この端末から新しい集計を送信しません。</small></span></label><button class="button button--quiet" type="button" data-settings-clear>この端末の解析記録を削除</button><p class="site-settings__status" data-settings-status role="status"></p></section>
    <div class="site-settings__actions"><button class="button button--primary" type="button" data-settings-close>閉じる</button></div>
    </div>
  </dialog>`;

const mountedMenus = new WeakSet();
const MOTION_PREFERENCE_KEY = 'PiXiEED:motion-preference:v1';
const ANALYTICS_CONSENT_KEY = 'PiXiEED:analytics-consent:v1';
function applyMotionPreference() {
  let reduced = false;
  try { reduced = localStorage.getItem(MOTION_PREFERENCE_KEY) === 'reduced'; } catch { /* storage may be blocked */ }
  document.documentElement.dataset.pixieedMotion = reduced ? 'reduced' : 'full';
  return reduced;
}
function analyticsAllowed() {
  try { return localStorage.getItem(ANALYTICS_CONSENT_KEY) !== 'denied'; } catch { return true; }
}
function menuToggleMarkup() {
  return '<button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="site-menu" aria-label="ページを開く"><span class="menu-toggle__lines" aria-hidden="true"><i></i><i></i><i></i></span><span class="menu-toggle__label">ページ</span></button>';
}

function mountSiteMenu(header, inner) {
  if (mountedMenus.has(header)) return;
  let toggle = inner.querySelector('[data-menu-toggle]');
  if (!toggle) inner.append(toggle = document.createRange().createContextualFragment(menuToggleMarkup()).firstElementChild);
  toggle.classList.add('px-header-menu-toggle', 'px-header-utilities');
  toggle.setAttribute('aria-controls', 'site-menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'ページを開く');
  toggle.innerHTML = menuToggleMarkup().match(/<button[^>]*>([\s\S]*)<\/button>/)[1];
  if (!document.querySelector('[data-site-menu]')) document.body.insertAdjacentHTML('beforeend', MENU_MARKUP);
  const menu = document.querySelector('[data-site-menu]');
  const backdrop = document.querySelector('[data-menu-backdrop]');
  const close = menu?.querySelector('[data-menu-close]');
  const settings = document.querySelector('[data-site-settings]');
  const motionSetting = settings?.querySelector('[data-setting-motion]');
  const analyticsSetting = settings?.querySelector('[data-setting-analytics]');
  const settingsStatus = settings?.querySelector('[data-settings-status]');
  if (!menu || !backdrop) return;
  let suppressClick = false;
  let start = null;
  let menuBackground = [];
  const setOpen = (open, returnFocus = false) => {
    if (open && menu.hidden) {
      menuBackground = [...document.body.children]
        .filter(node => ![menu, backdrop, settings].includes(node) && !node.matches('script,style,link'))
        .map(node => ({ node, inert: node.inert }));
      for (const { node } of menuBackground) node.inert = true;
    } else if (!open) {
      for (const { node, inert } of menuBackground) node.inert = inert;
      menuBackground = [];
    }
    menu.hidden = !open;
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'ページを閉じる' : 'ページを開く');
    document.body.classList.toggle('is-menu-open', open);
    if (open) {
      const current = currentPageDestination(window.location, document.body.dataset.creationMode);
      let currentLabel = '';
      for (const link of menu.querySelectorAll('[data-menu-link]')) {
        const selected = link.getAttribute('href') === current;
        if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        link.querySelector('.site-menu__current').hidden = !selected;
        if (selected) currentLabel = link.querySelector('.site-menu__link-title').textContent;
      }
      menu.querySelector('#site-menu-location').textContent = currentLabel ? `現在地：${currentLabel}` : '移動先を選んでください。';
      window.requestAnimationFrame(() => close?.focus({ preventScroll: true }));
    }
    else if (returnFocus) toggle.focus({ preventScroll: true });
  };
  const openSettings = (mode = 'display') => {
    if (!settings) return;
    setOpen(false);
    settings.querySelectorAll('[data-settings-panel]').forEach((panel) => { panel.hidden = mode !== 'all' && panel.dataset.settingsPanel !== mode; });
    if (motionSetting) motionSetting.checked = applyMotionPreference();
    if (analyticsSetting) analyticsSetting.checked = analyticsAllowed();
    if (settingsStatus) settingsStatus.textContent = '';
    if (!settings.open) settings.showModal();
  };
  settings?.querySelectorAll('[data-settings-close]').forEach((button) => button.addEventListener('click', () => settings.close()));
  settings?.addEventListener('close', () => toggle.focus({ preventScroll: true }));
  settings?.addEventListener('click', (event) => { if (event.target === settings) settings.close(); });
  motionSetting?.addEventListener('change', () => {
    try { localStorage.setItem(MOTION_PREFERENCE_KEY, motionSetting.checked ? 'reduced' : 'full'); } catch { /* storage may be blocked */ }
    applyMotionPreference();
  });
  const setAnalytics = (allowed, clear = false) => {
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, allowed ? 'granted' : 'denied'); } catch { /* storage may be blocked */ }
    document.dispatchEvent(new Event('pixieed:analytics-consent-change'));
    if (!allowed) void import('./analytics.js?rev=20261001-free-tools-1').then(({ clearAnalyticsData }) => clearAnalyticsData()).catch(() => {});
    if (settingsStatus) settingsStatus.textContent = clear
      ? 'この端末に保存していた解析用の識別子を削除しました。'
      : allowed ? '利用状況の集計を再び許可しました。' : 'この端末から新しい解析データを送らない設定にしました。';
  };
  analyticsSetting?.addEventListener('change', () => setAnalytics(analyticsSetting.checked));
  settings?.querySelector('[data-settings-clear]')?.addEventListener('click', () => {
    if (analyticsSetting) analyticsSetting.checked = false;
    setAnalytics(false, true);
  });
  toggle.addEventListener('click', () => setOpen(menu.hidden));
  close?.addEventListener('click', () => setOpen(false, true));
  backdrop.addEventListener('click', () => setOpen(false, true));
  menu.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY, swiping: false };
  });
  menu.addEventListener('pointermove', (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) start.swiping = true;
  });
  const endPointer = (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    const shouldClose = start.swiping && dx > 72 && Math.abs(dx) > Math.abs(dy) * 1.2;
    start = null;
    if (!shouldClose) return;
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 350);
    setOpen(false, true);
  };
  menu.addEventListener('pointerup', endPointer);
  menu.addEventListener('pointercancel', endPointer);
  menu.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault(); event.stopPropagation(); suppressClick = false;
  }, true);
  menu.querySelectorAll('[data-menu-link]').forEach((link) => link.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const mode = creationModeDestination(link.href, window.location);
    if (mode && document.body.classList.contains('creation-suite')) {
      // Restore the workspace's inert state before the controller snapshots it.
      setOpen(false, true);
      if (!document.dispatchEvent(new CustomEvent('pixieed:creation-mode-request', { cancelable: true, detail: { mode } }))) event.preventDefault();
    } else setOpen(false);
  }));
  menu.addEventListener('click', (event) => {
    const setting = event.target.closest('[data-menu-setting]');
    if (!setting) return;
    setOpen(false);
    openSettings(setting.dataset.menuSetting || 'display');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); setOpen(false, true); }
    if (event.key !== 'Tab' || menu.hidden) return;
    const focusable = [...menu.querySelectorAll('a[href],button:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter((el) => !el.hidden);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !menu.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !menu.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  mountedMenus.add(header);
}

/** Preserve each page's own controls and its central navigation action. */
export function mountSiteHeader() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  installSiteInteractions({ document, window });
  if (window.top !== window.self || document.body.hasAttribute('data-admin-page')) return null;
  if (/^\/globe\/(?:index\.html)?$/.test(window.location?.pathname || '')) installGlobeAnalyticsBridge();
  applyMotionPreference();
  let header = document.querySelector('.site-header, .audio-heading, .lc-top, .catalog-header, .output-header, .event-site-header, .hud-top__bar, .pc-header');
  if (!header) {
    header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = '<div class="header-inner"></div>';
    document.body.prepend(header);
    if (document.querySelector('.globe-prototype')) document.body.classList.add('px-standalone-globe');
  }
  header.classList.add('px-site-header');
  header.setAttribute('aria-label', 'PiXiEED 共通ヘッダー');
  const inner = header.querySelector('.header-inner, .catalog-header__inner') || header;
  inner.classList.add('px-header-inner');
  let brand = inner.querySelector('.brand, .catalog-brand, .output-brand, .pc-brand') || (header.matches('.event-site-header') ? inner.querySelector('a[href="/"]') : null);
  if (!brand && !header.matches('.hud-top__bar')) inner.prepend(brand = brandedLink());
  if (brand) {
    brand.classList.add('brand', 'px-header-brand');
    brand.href = '/';
    brand.setAttribute('aria-label', 'PiXiEED ホーム');
  }
  // Tool names remain in document titles and headings; editing chrome uses the space for controls.
  const toolName = document.body.dataset.toolName;
  if (toolName) {
    let label = brand.querySelector('span:not(.brand-mark)');
    if (!label) { label = document.createElement('span'); brand.append(label); }
    label.textContent = toolName; label.hidden = true;
    brand.classList.add('px-header-brand--tool');
    mountToolHeaderControls(document, { selectors: document.body.dataset.page === 'audio'
      ? ['#audio-output', '#audio-undo', '#audio-redo', '#audio-composition-settings', '#audio-animation-panel']
      : document.body.dataset.page === 'spot-difference' ? ['.spot-settings']
        : document.body.dataset.page === 'jigsaw' ? ['#jigsaw-preview-toggle', '#jigsaw-hint', '#jigsaw-rotate', '#jigsaw-return', '.jigsaw-more']
          : document.body.dataset.page === 'hidden-object' ? ['[data-hidden-mode="paint"]', '[data-hidden-mode="erase"]']
        : document.body.dataset.page === 'creation-game' ? ['#game-new']
          : document.body.dataset.toolShort === 'カメラ' ? ['#cameraChooseImage'] : [] });
  }
  inner.querySelectorAll('.menu-toggle, .audio-header-actions, .lc-top-left, .lc-top-right').forEach((el) => el.classList.add('px-header-utilities'));
  inner.querySelectorAll('[data-header-pass]').forEach((button) => button.remove());
  mountSiteMenu(header, inner);
  mountPublicNavigation({ document, window });
  document.documentElement.classList.add('px-header-ready');
  bindPanelEffects();
  return header;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSiteHeader, { once: true });
  else mountSiteHeader();
}
