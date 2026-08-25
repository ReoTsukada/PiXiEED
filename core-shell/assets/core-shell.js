import {
  COMPONENT_STATES,
  CORE_SHELL_FLAGS,
  NAVIGATION_MAP,
  createCoreShellAccessContract,
  createShellStore,
  createUiTelemetryRecorder,
} from './core-shell-contracts.js';
import {
  chooseFocusRestoreTarget,
  createPointerOwnership,
  createRouteFocusDecision,
  createShortcutRegistry,
} from './core-shell-interaction-contracts.js';
import {
  ASYNC_STATES,
  createAsyncStateMachine,
  createLiveRegionDeduper,
  getAsyncStatePresentation,
} from './core-shell-async-contracts.js';

const root = document.getElementById('coreShellRoot');
const app = document.getElementById('coreShellApp');
const announcer = document.getElementById('coreShellAnnouncer');
// This switch is set only by an isolated browser test harness.  It is not an
// authority proof, not a production flag, and is ignored outside this
// noindex Core Shell entry.
const localSite400Test = Boolean(
  root?.dataset.shellState === 'isolated-preview'
  && (window.location.pathname.endsWith('/core-shell/') || window.location.pathname.endsWith('/core-shell/local-test.html'))
  && (window.__PIXIEED_CORE_SHELL_LOCAL_TEST__ === true || root?.dataset.site400LocalTest === 'true'),
);
const flagAdapter = window.PiXiEEDrawModules?.coreFeatureFlagRollbackUtils;
const flagRegistry = flagAdapter?.createCoreFeatureFlagRollback?.({
  flags: Object.values(CORE_SHELL_FLAGS).map((flagId) => ({
    flagId,
    domain: flagId.includes('market') ? 'market' : flagId.includes('draw') ? 'pxd' : 'core',
    currentPath: '/isolated-current-path',
    actions: flagId === CORE_SHELL_FLAGS.shellWrite ? ['write'] : ['read'],
  })),
}) || (localSite400Test ? {
  // The local browser fixture must remain deterministic even when the
  // production-side adapter is unavailable to an isolated browser session.
  // This fallback is fixture-only and is never reachable from the public Shell.
  setOverride() {},
  evaluate({ flagId }) {
    return flagId === CORE_SHELL_FLAGS.draw2
      ? { decision: 'enabled', ok: true, enabled: true, source: 'SITE400_LOCAL_FLAG_FIXTURE' }
      : { decision: 'fallback', ok: false, enabled: false, source: 'SITE400_LOCAL_FLAG_FIXTURE' };
  },
} : null);
const store = createShellStore();
const telemetry = createUiTelemetryRecorder({ maxEntries: 100 });
const routeChunks = Object.freeze({
  draw2: './routes/draw2-route.js',
  audio: './routes/audio-route.js',
  game: './routes/game-route.js',
  market: './routes/market-route.js',
});
const toolFlags = Object.freeze({
  draw2: CORE_SHELL_FLAGS.draw2,
  audio: CORE_SHELL_FLAGS.audio,
  game: CORE_SHELL_FLAGS.game,
  market: CORE_SHELL_FLAGS.market,
});
const serverRoute = window.__PIXIEED_CORE_SHELL_SERVER_ROUTE__ || {
  authorized: false,
  source: 'isolated-static-entry',
  reason: 'server route boundary is not attached in this preview',
};
const effectiveServerRoute = localSite400Test
  ? { authorized: true, ok: true, source: 'SITE400_LOCAL_SERVER_FIXTURE', noStore: true }
  : serverRoute;
const identity = localSite400Test
  ? { ok: true, accountStatus: 'active', source: 'SITE400_LOCAL_IDENTITY_FIXTURE' }
  : { ok: true, accountStatus: 'active', source: 'isolated-preview' };
const account = { status: 'active', source: localSite400Test ? 'SITE400_LOCAL_ACCOUNT_FIXTURE' : 'isolated-preview' };
const resourcePermission = localSite400Test
  ? { ok: true, source: 'SITE400_LOCAL_RESOURCE_FIXTURE' }
  : { ok: true, source: 'isolated-preview' };
if (localSite400Test && flagRegistry) {
  flagRegistry.setOverride({
    flagId: CORE_SHELL_FLAGS.draw2,
    action: 'read',
    scope: 'global',
    enabled: true,
    actor: { id: 'site400-local-server-fixture', source: 'server' },
    event: {
      eventId: 'site400-local-flag-on',
      correlationId: 'site400-local-correlation',
      at: new Date().toISOString(),
      reason: 'isolated SITE-400 browser qualification',
    },
  });
}
let toastTimer = null;
const overlayStack = [];
const pointerOwnership = createPointerOwnership();
const liveRegionDeduper = createLiveRegionDeduper();
const asyncState = createAsyncStateMachine();
const shortcutRegistry = createShortcutRegistry([
  { id: 'show-shortcuts', key: '?', action: 'show-shortcuts', description: 'Keyboard shortcutを表示' },
]);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function recordUi(event) {
  return telemetry.record({
    correlationId: 'core-shell-local-preview',
    viewportClass: window.matchMedia?.('(max-width: 719px)').matches ? 'phone' : 'large',
    ...event,
  });
}

function flagEvaluation({
  flagId,
  action = 'read',
  principalId = null,
  principalSource = 'server',
  identity: evaluationIdentity = identity,
  serverAuthorization = effectiveServerRoute,
  resourcePermission: evaluationPermission = resourcePermission,
  clientRequested = false,
} = {}) {
  if (!flagRegistry) return null;
  return flagRegistry.evaluate({
    flagId,
    action,
    principalId,
    principalSource,
    identity: evaluationIdentity,
    serverAuthorization,
    resourcePermission: evaluationPermission,
    clientRequested,
  });
}

function accessFor(flagId, action = 'read') {
  return createCoreShellAccessContract({
    flagId,
    action,
    flagEvaluator: flagEvaluation,
    serverRoute: effectiveServerRoute,
    identity,
    account,
    resourcePermission,
  });
}

function navGroups() {
  const groups = new Map();
  for (const item of NAVIGATION_MAP) {
    const group = item.category === 'project' || item.category === 'tool' ? '制作' : item.category === 'commerce' || item.category === 'community' ? '公開・販売' : 'その他';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  return [...groups.entries()].map(([label, items]) => `
    <span class="nav-section-label">${label}</span>
    <div class="nav-list">
      ${items.map((item) => `<button class="nav-item" type="button" data-route="${item.id}" aria-current="false">
        <span class="nav-item__icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>
      </button>`).join('')}
    </div>
  `).join('');
}

function shellHeader() {
  return `
    <header class="core-shell__header" data-component="header">
      <button class="icon-button" type="button" data-toggle-sidebar aria-label="サイドナビゲーションを開閉">☰</button>
      <div class="brand" aria-label="PiXiEEDstudio 隔離プレビュー">
        <span class="brand__mark" aria-hidden="true">P</span>
        <span class="brand__name">PiXiEEDstudio<span class="brand__sub">Isolated App Shell</span></span>
      </div>
      <div class="header-spacer"></div>
      <label class="field header-search">
        <span class="sr-only">Shell内を検索</span>
        <input class="input" type="search" placeholder="Shell内を検索（Preview）" data-shell-search aria-label="Shell内を検索">
      </label>
      <div class="header-actions">
        <button class="icon-button" type="button" data-open-sheet="notificationsSheet" aria-label="通知を開く">♢</button>
        <button class="icon-button" type="button" data-open-menu="accountMenu" aria-label="Accountメニューを開く">●</button>
        <button class="icon-button" type="button" data-open-menu="themeMenu" aria-label="Themeを変更">◐</button>
      </div>
      <div class="menu" id="accountMenu" role="menu" aria-label="Accountメニュー" hidden>
        <button class="menu-item" role="menuitem" type="button" data-route="account">Account入口（Preview）</button>
        <button class="menu-item" role="menuitem" type="button" data-toast="Accountは次のWork Packageで接続します。">Coming Laterを確認</button>
      </div>
      <div class="menu" id="themeMenu" role="menu" aria-label="Themeメニュー" hidden>
        <button class="menu-item" role="menuitem" type="button" data-theme="light">Light</button>
        <button class="menu-item" role="menuitem" type="button" data-theme="dark">Dark</button>
        <button class="menu-item" role="menuitem" type="button" data-theme="system">System</button>
      </div>
    </header>
  `;
}

function shellNavigation() {
  return `
    <aside class="core-shell__sidebar" id="coreShellSidebar" aria-label="Studioナビゲーション">${navGroups()}</aside>
    <nav class="core-shell__mobile-nav" aria-label="モバイルナビゲーション">
      <div class="core-shell__mobile-nav-list">
        ${['home', 'projects', 'tools', 'account'].map((id) => {
          const item = NAVIGATION_MAP.find((entry) => entry.id === id);
          return `<button class="bottom-nav-item" type="button" data-route="${id}" aria-current="false"><span aria-hidden="true">${item.icon}</span><span>${item.label}</span></button>`;
        }).join('')}
      </div>
    </nav>
  `;
}

function stateCard(state, title, description) {
  return `<section class="state state--${state}" data-state="${state}" role="status"><strong>${title}</strong><span>${description}</span></section>`;
}

function homeView() {
  const access = accessFor(CORE_SHELL_FLAGS.shellRead);
  return `
    <div class="hero" data-component="hero">
      <span class="hero__eyebrow">PiXiEEDstudio / WP-080</span>
      <h1 class="hero__title" id="route-home-heading" tabindex="-1">すべての制作ツールをつなぐ、新しいApp Shell</h1>
      <p class="muted">これは本番サイトへ接続しない隔離Entryです。現行Route・Draw・PXD・PiXiSYNC・Marketの表示やデータは変更しません。</p>
      <div class="hero__actions">
        <button class="button" type="button" data-open-dialog="shellInfoDialog">Shellの境界を見る</button>
        <button class="button button--secondary" type="button" data-layout="split">Split Viewを試す</button>
      </div>
      <div class="row" aria-label="Feature Flag状態">
        <span class="status status--warning"><span class="status__dot" aria-hidden="true"></span>初期OFF</span>
        <span class="status ${access.ok ? 'status--success' : 'status--info'}">${escapeHtml(access.code || 'SERVER_ROUTE_REQUIRED')}</span>
      </div>
    </div>
    <div class="tabs" role="tablist" aria-label="Studio概要タブ">
      <button class="tab" type="button" role="tab" aria-selected="true" aria-controls="overviewPanel" data-tab="overview">Overview</button>
      <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="statesPanel" data-tab="states">States</button>
      <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="contractsPanel" data-tab="contracts">Contracts</button>
    </div>
    <section id="overviewPanel" role="tabpanel" data-tab-panel="overview" class="core-shell__grid">
      <article class="card span-8" data-component="project-switcher">
        <div class="card__header"><div><h2 class="card__title">Active Studio</h2><p class="card__description">Project SwitcherとAsset Browserの接続slot</p></div><span class="status status--info">PINNED Preview</span></div>
        <div class="row space-between"><div class="stack"><strong>Demo Project</strong><span class="subtle code">project-id: isolated-preview</span></div><button class="button button--secondary" type="button" data-open-menu="projectMenu">Projectを切替</button></div>
        <div class="menu" id="projectMenu" role="menu" aria-label="Projectメニュー" hidden><button class="menu-item" role="menuitem" type="button" data-toast="Project RegistryはWP-091で接続します。">Project Registry（Coming Later）</button><button class="menu-item" role="menuitem" type="button" data-toast="Asset BrowserはWP-092で接続します。">Asset Browser（Coming Later）</button></div>
      </article>
      <article class="card" data-component="sync-status"><div class="card__header"><div><h2 class="card__title">Studio Status</h2><p class="card__description">Server/RLS boundaryを越えない診断</p></div><span class="status status--warning">Offline Preview</span></div><div class="stack"><span>Route boundary: <strong>Unavailable</strong></span><span>Telemetry: <strong>Sanitized</strong></span></div></article>
      <article class="card span-6" data-component="asset-browser-slot"><div class="card__header"><div><h2 class="card__title">Asset Browser</h2><p class="card__description">Asset Graphは次のRegistryで接続</p></div></div><div class="slot"><span class="slot__title">Empty slot</span><span class="slot__description">未接続のAssetは存在するように見せません。</span></div></article>
      <article class="card span-6" data-component="tool-bridge-slot"><div class="card__header"><div><h2 class="card__title">Tool Bridges</h2><p class="card__description">Editor CoreとShellは疎結合</p></div></div><div class="row"><span class="status">Draw</span><span class="status">Audio</span><span class="status">Game</span></div></article>
    </section>
    <section id="statesPanel" role="tabpanel" data-tab-panel="states" hidden class="core-shell__grid">
      <div class="span-6">${stateCard('loading', 'Loading', 'Registry接続を待機しています。')}</div>
      <div class="span-6">${stateCard('empty', 'Empty', 'まだProjectがありません。')}</div>
      <div class="span-6">${stateCard('permission-denied', 'Permission Denied', 'Server認可がないため、データは表示しません。')}</div>
      <div class="span-6">${stateCard('offline', 'Offline', 'Offline QueueはCore同期境界で扱います。')}</div>
      <div class="span-6">${stateCard('error', 'Error', '復旧可能なエラーです。現在のRouteへ戻せます。')}</div>
      <div class="span-6">${stateCard('unavailable', 'Coming Later', '未実装機能は操作可能に見せません。')}</div>
    </section>
    <section id="contractsPanel" role="tabpanel" data-tab-panel="contracts" hidden class="core-shell__grid">
      <article class="card span-8"><div class="card__header"><div><h2 class="card__title">入口Contract</h2><p class="card__description">Identity → Account → Server Route → Flag → Resource</p></div></div><div class="stack"><span>Account</span><span>Project / Asset</span><span>Tool / Search / Notification</span><span>Market / Community</span></div></article>
      <article class="card"><div class="card__header"><div><h2 class="card__title">Theme</h2><p class="card__description">Canonical pixel colorは変更しません。</p></div></div><div class="row"><span class="pixel-canonical-swatch" aria-label="Canonical pixel color"></span><span class="code">--color-pixel-canonical</span></div></article>
    </section>
    <section class="card" aria-labelledby="toolsTitle" data-component="tool-cards">
      <div class="card__header"><div><h2 class="card__title" id="toolsTitle">Tool入口</h2><p class="card__description">Lazy Route。初期Bundleには大型Editorを含めません。</p></div><span class="status status--warning">Flag OFF</span></div>
      <div class="core-shell__grid">
        ${[['draw2', 'iDRAW', 'PiXiEEDstudioのドット絵・アニメーション'], ['audio', 'iAUDIO', 'BGM・効果音のEditor'], ['game', 'iGAME', 'Scene・RuntimeのEditor'], ['market', 'Market', '商品・購入・権利の入口']].map(([id, label, description]) => {
          const toolAccess = accessFor(toolFlags[id], 'read');
          const enabled = toolAccess.decision === 'enabled';
          const reason = enabled
            ? 'SITE-400 local fixtureでのみ有効です。Production Providerではありません。'
            : 'Server RouteとFlagが未接続のためUnavailable';
          return `<article class="card" data-tool-card="${id}"><div class="stack"><div class="row space-between"><strong>${label}</strong><span class="status">${enabled ? 'Local Preview' : 'Coming Later'}</span></div><span class="muted">${description}</span><button class="button button--secondary" type="button" data-tool="${id}" aria-describedby="${id}UnavailableReason" ${enabled ? '' : 'disabled aria-disabled="true"'}>開く</button><span class="field__hint" id="${id}UnavailableReason">${reason}</span></div></article>`;
        }).join('')}
      </div>
    </section>
    <section class="core-shell__grid" aria-label="Component states">
      <article class="card span-6"><div class="card__header"><div><h2 class="card__title">Form Components</h2><p class="card__description">Input / Select / Toggle</p></div></div><div class="stack"><label class="field"><span class="field__label">Project name</span><input class="input" type="text" placeholder="Preview only" aria-describedby="inputHint"></label><span class="field__hint" id="inputHint">未保存。Project Registryには送信しません。</span><label class="field"><span class="field__label">View</span><select class="select" aria-label="Viewを選択"><option>Overview</option><option>States</option></select></label><button class="switch" type="button" role="switch" aria-checked="false" data-toggle="notificationToggle"><span class="switch__control" aria-hidden="true"></span><span>通知Preview</span></button><button class="button button--secondary" type="button" disabled aria-describedby="disabledButtonReason">Disabled action</button><span class="field__hint" id="disabledButtonReason">Server Route認可が完了するまで使用できません。</span></div></article>
      <article class="card span-6 private-surface" data-surface="private"><div class="card__header"><div><h2 class="card__title">Private surfaces</h2><p class="card__description">広告枠を作らない領域</p></div><span class="status status--success">No Ads</span></div><div class="stack"><span>Active Studio</span><span>Checkout</span><span>Entitlement</span><span>Commission</span></div></article>
    </section>
    <div class="dialog-backdrop" id="shellInfoDialog" hidden><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="shellInfoTitle" tabindex="-1"><div class="card__header"><div><h2 class="card__title" id="shellInfoTitle">隔離Shellの境界</h2><p class="card__description">現行サイトへ接続しない確認用Dialog</p></div><button class="icon-button" type="button" data-close="shellInfoDialog" aria-label="Dialogを閉じる">×</button></div><div class="stack"><p>このEntryは公開Navigation、既存URL、Supabase、Storage、Market、PiXiSYNC、PXDを読み書きしません。</p><p class="code">route: /core-shell/ · flag: default-off · server-route: required</p></div><div class="dialog__actions"><button class="button button--secondary" type="button" data-close="shellInfoDialog">閉じる</button></div></section></div>
    <div class="dialog-backdrop" id="notificationsSheet" hidden><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="notificationsTitle" tabindex="-1"><div class="card__header"><div><h2 class="card__title" id="notificationsTitle">通知</h2><p class="card__description">Notification Centerは未接続です。</p></div><button class="icon-button" type="button" data-close="notificationsSheet" aria-label="通知Sheetを閉じる">×</button></div>${stateCard('unavailable', 'Coming Later', '通知データはServer Contract接続後に表示します。')}<div class="dialog__actions"><button class="button button--secondary" type="button" data-close="notificationsSheet">閉じる</button></div></section></div>
    <div class="toast" id="coreToast" role="status" aria-live="polite" hidden></div>
  `;
}

function getRouteMarkup(routeId) {
  if (routeId === 'home') return homeView();
  const item = NAVIGATION_MAP.find((entry) => entry.id === routeId) || NAVIGATION_MAP[0];
  return `<section class="hero"><span class="hero__eyebrow">Core Route Preview</span><h1 class="hero__title" id="route-${escapeHtml(item.id)}-heading" tabindex="-1">${escapeHtml(item.label)}</h1><p class="muted">この入口はContractだけ定義済みです。接続前の機能を動作するように見せません。</p>${stateCard('unavailable', 'Coming Later', `${escapeHtml(item.label)}は対応Work Packageで接続します。`)}<div class="hero__actions"><button class="button button--secondary" type="button" data-route="home">Homeへ戻る</button></div></section>`;
}

function updateNavigation(activeRoute) {
  app.querySelectorAll('[data-route]').forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    const isCurrent = element.dataset.route === activeRoute;
    if (element.matches('.nav-item, .bottom-nav-item')) element.setAttribute('aria-current', isCurrent ? 'page' : 'false');
  });
}

function moveOverlaysToAppRoot() {
  app.querySelectorAll('.dialog-backdrop').forEach((overlay) => app.appendChild(overlay));
}

function renderRoute(activeRoute, { focus = false } = {}) {
  const routeElement = app.querySelector('[data-route-view]');
  if (!routeElement) return;
  routeElement.innerHTML = getRouteMarkup(activeRoute);
  moveOverlaysToAppRoot();
  updateNavigation(activeRoute);
  if (focus) focusRoute(activeRoute);
}

function renderAsyncStatePreview(state) {
  const routeElement = app.querySelector('[data-route-view]');
  if (!routeElement || !ASYNC_STATES.includes(state)) return false;
  const presentation = getAsyncStatePresentation(state);
  routeElement.innerHTML = `<section class="hero" data-async-state-preview="${escapeHtml(state)}"><span class="hero__eyebrow">WP-090 Async State Fixture</span><h1 class="hero__title" id="route-async-state-heading" tabindex="-1">${escapeHtml(presentation.label)}</h1><p class="muted">このFixtureは保存済み入力と未送信操作を破棄しない共通状態契約を確認します。</p>${stateCard(state, presentation.label, state === 'offline' ? 'OfflineはSavedと表示しません。' : '復旧導線を保持します。')}<div class="hero__actions"><button class="button button--secondary" type="button" data-route="home">Homeへ戻る</button></div></section>`;
  moveOverlaysToAppRoot();
  document.getElementById('route-async-state-heading')?.focus({ preventScroll: true });
  announce(`${presentation.label}状態を表示しました。`, state);
  return true;
}

function focusRoute(activeRoute) {
  const decision = createRouteFocusDecision({ routeId: activeRoute, headingId: `route-${activeRoute}-heading` });
  const target = document.getElementById(decision.targetId) || document.getElementById(decision.fallbackId);
  target?.focus?.({ preventScroll: true });
  announce(decision.announcement, activeRoute);
}

function setTheme(theme) {
  if (!['light', 'dark', 'system'].includes(theme)) return;
  document.documentElement.dataset.theme = theme;
  store.set({ theme });
  recordUi({ eventName: 'theme_changed', component: 'theme-menu', state: theme, theme });
  announce(`${theme} themeに変更しました。Canonical pixel colorは変更しません。`);
  closeMenus();
}

function setLayout(layout) {
  const next = layout === 'split' ? 'split' : 'auto';
  root.dataset.layout = next;
  store.set({ layout: next });
  recordUi({ eventName: 'layout_changed', component: 'shell-layout', state: next });
  announce(next === 'split' ? 'Split Viewを表示しました。' : '標準レイアウトに戻しました。');
}

function announce(message, state = 'info') {
  const next = liveRegionDeduper.announce({ state, message });
  if (announcer && next) announcer.textContent = next.message;
}

function showToast(message) {
  const toast = app.querySelector('#coreToast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  announce(message);
}

function closeMenus() {
  app.querySelectorAll('.menu, .popover').forEach((menu) => { menu.hidden = true; });
  app.querySelectorAll('[data-open-menu]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
}

function setSidebarOpen(open) {
  root.dataset.sidebarOpen = open ? 'true' : 'false';
  const button = app.querySelector('[data-toggle-sidebar]');
  button?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) announce('Sidebarを開きました。');
}

function getFocusable(scope) {
  return [...scope.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.disabled && !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function setModalBackgroundIsolation(open) {
  const background = app.querySelector('.core-shell');
  if (!background) return;
  background.inert = open;
  if (open) background.setAttribute('aria-hidden', 'true');
  else background.removeAttribute('aria-hidden');
}

function descriptorFor(element) {
  if (!(element instanceof HTMLElement)) return null;
  if (!element.id) element.id = `focus-origin-${overlayStack.length + 1}`;
  return { id: element.id, connected: element.isConnected, disabled: element.disabled, hidden: element.hidden };
}

function findFocusTarget(descriptor) {
  if (!descriptor?.id) return null;
  return document.getElementById(descriptor.id);
}

function restoreFocus(descriptor, fallback = 'coreShellMain') {
  const origin = findFocusTarget(descriptor);
  const restoreId = chooseFocusRestoreTarget({
    origin: origin ? { id: origin.id, connected: origin.isConnected, disabled: origin.disabled, hidden: origin.hidden } : null,
    fallback,
  });
  const target = document.getElementById(restoreId) || document.getElementById(fallback);
  target?.focus?.({ preventScroll: true });
}

function openOverlay(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlayStack.push({ id, origin: descriptorFor(document.activeElement) });
  overlay.hidden = false;
  setModalBackgroundIsolation(true);
  const dialog = overlay.querySelector('[role="dialog"]');
  const focusTarget = getFocusable(dialog || overlay)[0] || dialog;
  focusTarget?.focus();
  recordUi({ eventName: 'overlay_opened', component: id, state: 'default' });
}

function closeOverlay(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.hidden = true;
  const stackIndex = overlayStack.findIndex((entry) => entry.id === id);
  const entry = stackIndex >= 0 ? overlayStack.splice(stackIndex, 1)[0] : null;
  const nextOverlay = overlayStack.at(-1);
  if (nextOverlay) {
    const next = document.getElementById(nextOverlay.id);
    getFocusable(next?.querySelector('[role="dialog"]') || next || overlay)[0]?.focus();
  } else {
    setModalBackgroundIsolation(false);
    restoreFocus(entry?.origin);
  }
  recordUi({ eventName: 'overlay_closed', component: id, state: 'default' });
}

function trapFocus(event) {
  const overlay = document.getElementById(overlayStack.at(-1)?.id) || event.target.closest('.dialog-backdrop:not([hidden])');
  if (!overlay || event.key !== 'Tab') return;
  const focusable = getFocusable(overlay);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function selectTab(tabId) {
  app.querySelectorAll('[data-tab]').forEach((tab) => {
    const selected = tab.dataset.tab === tabId;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
  app.querySelectorAll('[data-tab-panel]').forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== tabId; });
  recordUi({ eventName: 'tab_changed', component: 'tabs', state: tabId });
}

function moveRovingFocus(event) {
  const current = event.target.closest('[role="tab"], [role="menuitem"]');
  if (!current || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return false;
  const scope = current.closest('[role="tablist"], [role="menu"]');
  if (!scope) return false;
  const selector = current.getAttribute('role') === 'tab' ? '[role="tab"]' : '[role="menuitem"]';
  const items = [...scope.querySelectorAll(selector)].filter((item) => !item.disabled && !item.hidden);
  const index = items.indexOf(current);
  if (index < 0) return false;
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? items.length - 1
      : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  event.preventDefault();
  const next = items[nextIndex];
  next.focus();
  if (current.getAttribute('role') === 'tab') selectTab(next.dataset.tab);
  return true;
}

async function openTool(toolId) {
  const flagId = toolFlags[toolId];
  const access = accessFor(flagId, 'read');
  if (access.decision !== 'enabled') {
    const reason = access.code === 'CORE_SHELL_SERVER_ROUTE_UNAVAILABLE'
      ? 'Server Route認可が未接続のためUnavailableです。Client操作で有効化はできません。'
      : 'Feature FlagがOFFまたは未接続のためComing Laterです。';
    showToast(reason);
    recordUi({ eventName: 'lazy_route_blocked', routeId: toolId, component: 'tool-card', state: access.decision });
    return { access, loaded: false };
  }
  const chunk = routeChunks[toolId];
  if (!chunk) return { access, loaded: false };
  const route = await import(chunk);
  if (typeof route.mount === 'function') {
    const routeView = app.querySelector('[data-route-view]');
    const result = await route.mount({ host: routeView });
    store.set({ activeRoute: toolId });
    updateNavigation(toolId);
    focusRoute(toolId);
    closeMenus();
    setSidebarOpen(false);
    recordUi({ eventName: 'site400_local_route_mounted', routeId: toolId, component: 'tool-card', state: result?.status || 'mounted' });
    return { access, loaded: true, result };
  }
  recordUi({ eventName: 'lazy_route_loaded', routeId: toolId, component: 'tool-card', state: 'enabled' });
  showToast(route.title || `${toolId} routeを読み込みました。`);
  return { access, loaded: true };
}

function handleClick(event) {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!target) return;
  const { route, theme, layout, openMenu, openDialog, openSheet, close, tab, toggle, toast, tool, toggleSidebar } = target.dataset;
  if (toggleSidebar !== undefined) { setSidebarOpen(root.dataset.sidebarOpen !== 'true'); return; }
  if (route) { store.set({ activeRoute: route }); renderRoute(route, { focus: true }); closeMenus(); setSidebarOpen(false); return; }
  if (theme) { setTheme(theme); return; }
  if (layout) { setLayout(layout); return; }
  if (openMenu) {
    closeMenus();
    const menu = document.getElementById(openMenu);
    if (menu) {
      menu.hidden = false;
      target.setAttribute('aria-expanded', 'true');
      menu.querySelector('[role="menuitem"]')?.focus();
    }
    return;
  }
  if (openDialog || openSheet) { openOverlay(openDialog || openSheet); return; }
  if (close) { closeOverlay(close); return; }
  if (tab) { selectTab(tab); return; }
  if (toggle) { target.setAttribute('aria-checked', target.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); return; }
  if (toast) { showToast(toast); return; }
  if (tool) { openTool(tool); }
}

function handleKeydown(event) {
  if (moveRovingFocus(event)) return;
  if (event.key === 'Escape') {
    const openOverlayElement = document.getElementById(overlayStack.at(-1)?.id) || app.querySelector('.dialog-backdrop:not([hidden])');
    if (openOverlayElement) { closeOverlay(openOverlayElement.id); return; }
    closeMenus();
  }
  const shortcut = shortcutRegistry.resolve(event);
  if (shortcut?.action === 'show-shortcuts') {
    event.preventDefault();
    showToast('? : Keyboard shortcut一覧（Remap可能な契約）');
  }
  trapFocus(event);
}

function handlePointerDown(event) {
  pointerOwnership.begin({ pointerId: event.pointerId, pointerType: event.pointerType, owner: 'shell' });
}

function releasePointer(event) {
  pointerOwnership.release(event.pointerId, event.type);
}

function mount() {
  if (!root || !app) return;
  app.innerHTML = `<a class="skip-link" href="#coreShellMain">メインコンテンツへ移動</a><div class="core-shell"><div class="core-shell__content">${shellHeader()}<div class="core-shell__body">${shellNavigation()}<main class="core-shell__main" id="coreShellMain" aria-label="メインコンテンツ" tabindex="-1"><div class="core-shell__route-view" data-route-view></div></main><aside class="core-shell__inspector" aria-label="Split View Inspector"><div class="stack"><span class="status status--info">Split View</span><h2>Inspector</h2><p class="muted">Editor固有Stateはここへ持ち込みません。</p>${stateCard('unavailable', 'Coming Later', 'Inspector Bridgeは未接続です。')}</div></aside></div></div></div>`;
  setSidebarOpen(false);
  renderRoute(store.getState().activeRoute);
  app.addEventListener('click', handleClick);
  app.addEventListener('keydown', handleKeydown);
  app.addEventListener('pointerdown', handlePointerDown, { passive: true });
  app.addEventListener('pointerup', releasePointer, { passive: true });
  app.addEventListener('pointercancel', releasePointer, { passive: true });
  app.addEventListener('lostpointercapture', releasePointer, { passive: true });
  window.__PIXIEED_CORE_SHELL__ = Object.freeze({
    components: COMPONENT_STATES,
    navigation: NAVIGATION_MAP,
    getState: () => store.getState(),
    getFlagState: () => flagRegistry?.inspect?.() || null,
    getAccess: (flagId = CORE_SHELL_FLAGS.shellRead, action = 'read') => accessFor(flagId, action),
    getTelemetry: () => telemetry.snapshot(),
    setTheme,
    setLayout,
    openTool,
    setAsyncState: (next, metadata) => asyncState.transition(next, metadata),
    getAsyncState: () => asyncState.getState(),
    setPreviewState: renderAsyncStatePreview,
    getPointerOwnership: () => pointerOwnership.snapshot(),
    getShortcuts: () => shortcutRegistry.list(),
    isIsolatedEntry: () => window.location.pathname.endsWith('/core-shell/') || window.location.pathname.endsWith('/core-shell/index.html'),
  });
}

mount();
