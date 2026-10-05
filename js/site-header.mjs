import './site-analytics.mjs?rev=20261001-free-tools-1';
import { installSiteInteractions } from './site-interactions.mjs?rev=20261001-interactions-1';

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
  <aside class="site-menu" id="site-menu" data-site-menu hidden aria-labelledby="site-menu-title">
    <div class="site-menu__head"><div><span class="eyebrow">PiXiEED</span><h2 id="site-menu-title">メニュー</h2></div><button class="site-menu__close" type="button" data-menu-close aria-label="メニューを閉じる">×</button></div>
    <div class="site-menu__body">
    <a class="site-menu__profile" href="/profile/" data-menu-link><span class="site-menu__avatar" aria-hidden="true">P</span><span><strong>自分のページ</strong><small>投稿・いいね・記録</small></span><span aria-hidden="true">›</span></a>
    <nav class="site-menu__nav" aria-label="補助メニュー">
      <div class="site-menu__group"><span class="site-menu__label">自分の記録</span><a href="/profile/?view=posts" data-menu-link>投稿した絵</a><a href="/profile/?view=likes" data-menu-link>いいねした作品</a><a href="/profile/?view=history" data-menu-link>読み取ったQR</a></div>
      <div class="site-menu__group"><span class="site-menu__label">探す</span><a href="/globe/" data-menu-link>地図で作品を見る</a><a href="/stores/" data-menu-link>絵に会えるお店</a></div>
      <div class="site-menu__group"><span class="site-menu__label">参加する</span><a href="/globe/?post=1" data-menu-link>ドット絵を投稿する</a></div>
      <div class="site-menu__group"><span class="site-menu__label">案内</span><a href="/about/" data-menu-link>PiXiEEDについて</a><a href="/guide/" data-menu-link>利用ガイド</a><a href="/privacy/" data-menu-link>プライバシー</a></div>
      <div class="site-menu__group"><span class="site-menu__label">設定</span><button type="button" data-menu-setting="display">表示設定</button><button type="button" data-menu-setting="privacy">プライバシー設定</button></div>
    </nav>
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
  return '<button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="site-menu" aria-label="メニューを開く"><span class="menu-toggle__lines" aria-hidden="true"><i></i><i></i><i></i></span></button>';
}

function mountSiteMenu(header, inner) {
  if (mountedMenus.has(header)) return;
  let toggle = inner.querySelector('[data-menu-toggle]');
  if (!toggle) inner.append(toggle = document.createRange().createContextualFragment(menuToggleMarkup()).firstElementChild);
  toggle.classList.add('px-header-menu-toggle', 'px-header-utilities');
  toggle.setAttribute('aria-controls', 'site-menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'メニューを開く');
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
  const setOpen = (open, returnFocus = false) => {
    menu.hidden = !open;
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    document.body.classList.toggle('is-menu-open', open);
    if (open) window.requestAnimationFrame(() => close?.focus({ preventScroll: true }));
    else if (returnFocus) toggle.focus({ preventScroll: true });
  };
  const openSettings = (mode = 'display') => {
    if (!settings) return;
    setOpen(false);
    settings.querySelectorAll('[data-settings-panel]').forEach((panel) => { panel.hidden = panel.dataset.settingsPanel !== mode; });
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
  menu.querySelectorAll('[data-menu-link]').forEach((link) => link.addEventListener('click', () => setOpen(false)));
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
  applyMotionPreference();
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
  inner.querySelectorAll('[data-header-pass]').forEach((button) => button.remove());
  mountSiteMenu(header, inner);
  document.documentElement.classList.add('px-header-ready');
  bindPanelEffects();
  return header;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSiteHeader, { once: true });
  else mountSiteHeader();
}
