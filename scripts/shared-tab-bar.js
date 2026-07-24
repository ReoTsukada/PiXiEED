(function () {
  'use strict';

  const script = document.currentScript;
  if (!script || !document.body || window.__PIXIEED_COMMON_TAB_BAR__) return;

  const rootUrl = new URL('../', script.src);
  const currentPath = String(window.location.pathname || '').toLowerCase();
  const rootPath = String(rootUrl.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  const body = document.body;
  const pageKind = resolvePageKind(currentPath, rootPath);
  const state = { actions: [], details: [], reloadAction: null };
  let ui = null;

  function href(path) {
    return new URL(path, rootUrl).href;
  }

  function resolvePageKind(path, basePath) {
    const normalizedPath = path.replace(/\/+$/, '') || '/';
    if (/(?:^|\/)projects\/pixiedraw(?:\/|\/index\.html)?$/.test(path)) return 'project-draw';
    if (/(?:^|\/)projects\/pixiee-lens(?:\/|\/index\.html)?$/.test(path)) return 'project-camera';
    if (/(?:^|\/)(?:pixiedraw|pixieedrawdev)(?:\/|\/index\.html)?$/.test(path)) return 'draw';
    if (/(?:^|\/)market(?:\/|\/index\.html)?$/.test(path)) return 'market';
    if (/(?:^|\/)account(?:\/|\/index\.html)?$/.test(path)) return 'account';
    if (/(?:^|\/)pixiee-lens(?:\/|\/index\.html)?$/.test(path)) return 'camera';
    if (/(?:^|\/)(?:qr|qr-maker)(?:\/|\/index\.html)?$/.test(path)) return 'qr';
    if (/(?:^|\/)pixfind(?:\/|\/index\.html)?$/.test(path)) return 'pixfind';
    if (/(?:^|\/)maoitu(?:\/|\/index\.html)?$/.test(path)) return 'maoitu';
    if (normalizedPath === basePath || path === `${basePath === '/' ? '' : basePath}/index.html`) return 'home';
    return 'default';
  }

  function buildSupportDetails(options = {}) {
    const {
      guideLabel = '',
      guidePath = '',
      guideIcon = 'assets/icons/help.png?v=2026.07.17-icons1',
      includeMarketHelp = false,
      includeUpdates = false,
    } = options;
    const items = [
      { label: 'QR', path: 'qr/index.html', icon: 'assets/icons/QR.png' },
    ];
    if (guideLabel && guidePath) {
      items.push({ label: guideLabel, path: guidePath, icon: guideIcon });
    }
    items.push({ label: 'ヘルプ', path: 'help/index.html', icon: 'assets/icons/help.png?v=2026.07.17-icons1' });
    if (includeMarketHelp) {
      items.push({ label: 'マーケットヘルプ', path: 'market/help.html', icon: 'assets/icons/help.png?v=2026.07.17-icons1' });
    }
    if (includeUpdates) {
      items.push({ label: '開発ノート', path: 'notes/index.html', icon: 'assets/icons/Development-Notes.png?v=2026.07.19-icons2' });
    }
    items.push(
      { label: '用語集', path: 'glossary/index.html', icon: 'assets/icons/Word.png?v=2026.07.19-icons2' },
      { label: 'お問い合わせ', path: 'contact/index.html', icon: 'pixiedraw/assets/icons/talk.png' },
      { label: '利用規約', path: 'terms/index.html', icon: 'assets/icons/Terms.png?v=2026.07.19-icons1' },
      { label: 'プライバシー', path: 'privacy/index.html', icon: 'assets/icons/Privacy-Policy.png?v=2026.07.19-icons2' },
    );
    return items;
  }

  function getReloadAction(kind) {
    const action = {
      id: 'reload',
      label: '再読み込み',
      icon: 'assets/icons/reload.png?v=2026.07.19-ui-icons1',
    };
    if (kind === 'draw') {
      return { ...action, selector: '#appReloadAction' };
    }
    return { ...action, mode: 'reload' };
  }

  function getDefaultConfig(kind) {
    if (kind === 'project-draw') {
      return {
        actions: [
          { id: 'open-draw', label: 'Drawを開く', path: 'pixiedraw/index.html', icon: 'assets/icons/Draw.png?v=2026.07.19-ui-icons1' },
        ],
        details: buildSupportDetails(),
      };
    }
    if (kind === 'project-camera') {
      return {
        actions: [
          { id: 'open-camera', label: 'カメラを開く', path: 'pixiee-lens/index.html', icon: 'assets/icons/Camera.png' },
        ],
        details: buildSupportDetails(),
      };
    }
    if (kind === 'draw') {
      return {
        actions: [
          { id: 'file', label: 'ファイル', selector: '[data-quick-right-tab="file"]', icon: 'assets/icons/File.png?v=2026.07.19-ui-icons1' },
          { id: 'settings', label: '設定', selector: '[data-quick-right-tab="settings"]', icon: 'assets/icons/Settings.png?v=2026.07.19-icons2' },
          { id: 'camera', label: 'カメラ', selector: '[data-ui-action="openLensCamera"]', icon: 'assets/icons/Camera.png', gapBefore: true },
          { id: 'qr', label: 'QR編集', selector: '[data-ui-action="openQrEditor"]', icon: 'assets/icons/QR.png' },
          { id: 'undo', label: '元に戻す', selector: '#undoAction', icon: 'assets/icons/Undo.png?v=2026.07.19-ui-icons1', mirrorDisabled: true, placement: 'trailing' },
          { id: 'redo', label: 'やり直す', selector: '#redoAction', icon: 'assets/icons/Redo.png?v=2026.07.19-ui-icons1', mirrorDisabled: true, placement: 'trailing' },
          { id: 'fullscreen', label: '拡大', selector: '#fullscreenButton', icon: 'pixiedraw/assets/icons/zoomup.svg', iconWhenPressed: 'pixiedraw/assets/icons/zoomdown.svg', mirrorState: true, mode: 'fullscreen', fullscreenController: 'tool', placement: 'leading' },
        ],
        details: [
          { label: 'ショートカット一覧', selector: '#openShortcutHelp', icon: 'pixiedraw/assets/icons/short_cut.png?v=20260721-icons1' },
          { label: '使い方ヘルプ', selector: '#openOperationHelpPanel', icon: 'assets/icons/help.png?v=2026.07.17-icons1' },
          { label: '更新情報', selector: '#openUpdateHistory', icon: 'pixiedraw/assets/icons/ecticon_frame_04.png' },
          { label: 'アプリとして使う', selector: '#pixieedPwaInstallButton', icon: 'assets/icons/Draw.png?v=2026.07.19-ui-icons1', mirrorDisabled: true },
          { label: '言語', selector: '#toggleLanguageMode', icon: 'pixiedraw/assets/icons/ecticon_frame_05.png', keepOpen: true },
          ...buildSupportDetails(),
        ],
      };
    }
    if (kind === 'market') {
      return {
        actions: [
          { id: 'search', label: '検索', selector: '#marketSearch', mode: 'focus', icon: 'assets/icons/Search.png?v=2026.07.17-icons1' },
          { id: 'purchases', label: '購入済み', path: 'account/index.html#marketPurchaseList', icon: 'assets/icons/bought.png?v=2026.07.17-icons1' },
        ],
        details: [
          { label: 'マーケットとは', path: 'market/about.html', icon: 'assets/icons/Market.png?v=2026.07.19-ui-icons1' },
          { label: 'ヘルプ', path: 'help/index.html', icon: 'assets/icons/help.png?v=2026.07.17-icons1' },
          { label: 'マーケットヘルプ', path: 'market/help.html', icon: 'assets/icons/help.png?v=2026.07.17-icons1' },
          { label: 'お問い合わせ', path: 'contact/index.html', icon: 'pixiedraw/assets/icons/talk.png' },
          { label: '利用規約', path: 'terms/index.html', icon: 'assets/icons/Terms.png?v=2026.07.19-icons1' },
          { label: 'プライバシーポリシー', path: 'privacy/index.html', icon: 'assets/icons/Privacy-Policy.png?v=2026.07.19-icons2' },
        ],
      };
    }
    if (kind === 'account') {
      return {
        actions: [
          { id: 'projects', label: '端末内', selector: '#localProjectList', mode: 'scroll', icon: 'assets/icons/File.png?v=2026.07.19-ui-icons1' },
        ],
        details: [
          { label: 'ヘルプ', path: 'help/index.html', icon: 'assets/icons/help.png?v=2026.07.17-icons1' },
          { label: 'アカウント削除', path: 'account-deletion/index.html', icon: 'assets/icons/delete.png?v=2026.07.19-ui-icons1' },
          { label: 'お問い合わせ', path: 'contact/index.html', icon: 'pixiedraw/assets/icons/talk.png' },
          { label: '利用規約', path: 'terms/index.html', icon: 'assets/icons/Terms.png?v=2026.07.19-icons1' },
          { label: 'プライバシー', path: 'privacy/index.html', icon: 'assets/icons/Privacy-Policy.png?v=2026.07.19-icons2' },
        ],
      };
    }
    if (kind === 'camera') {
      return {
        actions: [
          { id: 'fullscreen', label: '拡大', selector: '#fullscreenButton', icon: 'pixiedraw/assets/icons/zoomup.svg', iconWhenPressed: 'pixiedraw/assets/icons/zoomdown.svg', mirrorState: true, mode: 'fullscreen', fullscreenController: 'tool', placement: 'leading' },
          { id: 'file', label: '画像を読み込む', selector: '#pixelArtBtn', cloneIcon: true, mirrorState: true },
          { id: 'clear', label: '読み込みを取り消す', selector: '#clearPixelBtn', cloneIcon: true, mirrorState: true, mirrorVisibility: true },
          { id: 'camera-switch', label: 'カメラ切り替え', selector: '#cameraActionBtn', cloneIcon: true, mirrorState: true },
          { id: 'settings', label: 'カメラ設定', selector: '#cameraSettingsBtn', cloneIcon: true, mirrorState: true, placement: 'trailing' },
        ],
        details: buildSupportDetails({ guideLabel: 'PiXiEELENSの使い方', guidePath: 'projects/pixiee-lens/' }),
      };
    }
    if (kind === 'qr') {
      return {
        actions: [],
        details: buildSupportDetails({ guideLabel: 'QRの使い方', guidePath: 'projects/qr-maker/' }),
      };
    }
    if (kind === 'pixfind') {
      return {
        actions: [
          { id: 'play', label: '遊ぶ', selector: '#startButton', icon: 'icon/icon-192-2.png' },
          { id: 'create', label: '作る', selector: '#createButton', icon: 'assets/icons/File.png?v=2026.07.19-ui-icons1' },
          { id: 'fullscreen', label: '拡大', selector: '#fullscreenButton', icon: 'pixiedraw/assets/icons/zoomup.svg', iconWhenPressed: 'pixiedraw/assets/icons/zoomdown.svg', mirrorState: true, mode: 'fullscreen', fullscreenController: 'game', placement: 'leading' },
        ],
        details: buildSupportDetails({ includeUpdates: true }),
      };
    }
    if (kind === 'maoitu') {
      return {
        actions: [
          { id: 'play', label: '遊ぶ', selector: '#playBtn', cloneIcon: true },
          { id: 'fullscreen', label: '拡大', selector: '#fullscreenButton', icon: 'pixiedraw/assets/icons/zoomup.svg', iconWhenPressed: 'pixiedraw/assets/icons/zoomdown.svg', mirrorState: true, mode: 'fullscreen', fullscreenController: 'tool', placement: 'leading' },
        ],
        details: buildSupportDetails({ includeUpdates: true }),
      };
    }
    if (kind === 'home') {
      return {
        actions: [],
        details: buildSupportDetails({
          guideLabel: 'はじめての使い方',
          guidePath: 'projects/pixiedraw/',
          guideIcon: 'assets/icons/Beginner.png?v=2026.07.19-icons1',
          includeMarketHelp: false,
          includeUpdates: true,
        }),
      };
    }
    return {
      actions: [{ id: 'home', label: 'ホーム', path: 'index.html', icon: 'assets/icons/HOME.png?v=2026.07.19-ui-icons1' }],
      details: buildSupportDetails({ includeUpdates: true }),
    };
  }

  const configured = window.PiXiEEDCommonTabBarConfig || {};
  const defaults = getDefaultConfig(pageKind);
  state.reloadAction = getReloadAction(pageKind);
  state.actions = Array.isArray(configured.actions) ? configured.actions : defaults.actions;
  state.details = Array.isArray(configured.details) ? configured.details : defaults.details;

  injectStyles();
  ui = createUi();
  mountUi(ui);
  renderActions(ui);
  renderDetails(ui.links);
  bindDetailsPanel(ui);

  window.__PIXIEED_COMMON_TAB_BAR__ = true;
  window.PiXiEEDCommonTabBar = Object.freeze({
    setActions(actions) {
      state.actions = Array.isArray(actions) ? actions : [];
      renderActions(ui);
    },
    setDetails(items) {
      state.details = Array.isArray(items) ? items : [];
      renderDetails(ui.links);
    },
    openDetails() {
      setDetailsPanelOpen(ui, true);
    },
    closeDetails() {
      setDetailsPanelOpen(ui, false);
    },
  });

  function createUi() {
    const bar = document.createElement('div');
    bar.className = 'pixieed-common-tabbar';
    bar.dataset.pageKind = pageKind;
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'ページ操作');

    const leadingActions = document.createElement('div');
    leadingActions.className = 'pixieed-common-tabbar__leading-actions';

    const actions = document.createElement('div');
    actions.className = 'pixieed-common-tabbar__actions';

    const trailingActions = document.createElement('div');
    trailingActions.className = 'pixieed-common-tabbar__trailing-actions';

    const detailButton = document.createElement('button');
    detailButton.className = 'pixieed-common-tabbar__button pixieed-common-tabbar__button--icon pixieed-common-tabbar__details-button';
    detailButton.type = 'button';
    detailButton.title = '詳細';
    detailButton.setAttribute('aria-label', '詳細');
    detailButton.setAttribute('aria-expanded', 'false');
    detailButton.setAttribute('aria-controls', 'pixieedCommonDetailsPanel');
    detailButton.append(createIcon('pixiedraw/assets/icons/action-more-menu.svg'), createSrOnlyLabel('詳細'));

    const layer = document.createElement('div');
    layer.className = 'pixieed-common-details-layer';
    layer.hidden = true;

    const backdrop = document.createElement('button');
    backdrop.className = 'pixieed-common-details__backdrop';
    backdrop.type = 'button';
    backdrop.tabIndex = -1;
    backdrop.setAttribute('aria-label', '詳細を閉じる');

    const panel = document.createElement('aside');
    panel.className = 'pixieed-common-details';
    panel.id = 'pixieedCommonDetailsPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'pixieedCommonDetailsTitle');

    const header = document.createElement('header');
    header.className = 'pixieed-common-details__header';
    const title = document.createElement('h2');
    title.id = 'pixieedCommonDetailsTitle';
    title.textContent = '詳細';
    const closeButton = document.createElement('button');
    closeButton.className = 'pixieed-common-details__close';
    closeButton.type = 'button';
    closeButton.textContent = '閉じる';
    header.append(title, closeButton);

    const content = document.createElement('div');
    content.className = 'pixieed-common-details__content';
    const links = document.createElement('nav');
    links.className = 'pixieed-common-details__links';
    links.setAttribute('aria-label', '共通メニュー');
    const ad = document.createElement('div');
    ad.className = 'pixieed-common-details__ad';
    ad.setAttribute('aria-label', '広告');
    ad.innerHTML = `
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-9801602250480253"
           data-ad-slot="4859859838"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    `;
    content.append(links, ad);
    panel.append(header, content);
    layer.append(backdrop, panel);

    bar.append(leadingActions, actions, trailingActions, detailButton);
    return { bar, leadingActions, actions, trailingActions, detailButton, layer, backdrop, panel, closeButton, links, ad };
  }

  function mountUi(currentUi) {
    body.classList.add('has-pixieed-common-tabbar');
    body.appendChild(currentUi.layer);
    body.insertBefore(currentUi.bar, body.firstChild);
  }

  function createActionControl(item, className) {
    const isLink = typeof item.path === 'string' && item.path;
    const control = document.createElement(isLink ? 'a' : 'button');
    const label = String(item.label || '操作');
    const clonedIcon = item.cloneIcon ? cloneTargetIcon(item.selector) : null;
    const hasIcon = Boolean(item.icon || clonedIcon);
    const isDetailsItem = className.includes('pixieed-common-details__item');
    control.className = `${className}${hasIcon ? ' pixieed-common-tabbar__button--icon' : ''}`;
    control.title = label;
    control.setAttribute('aria-label', label);
    if (item.icon) {
      control.append(createIcon(item.icon), isDetailsItem ? createVisibleLabel(label) : createSrOnlyLabel(label));
    } else if (clonedIcon) {
      control.append(clonedIcon, isDetailsItem ? createVisibleLabel(label) : createSrOnlyLabel(label));
    } else {
      control.textContent = label;
    }
    if (item.id) control.dataset.commonAction = item.id;
    if (item.gapBefore) control.classList.add('pixieed-common-tabbar__button--gap-before');
    if (isLink) {
      control.href = href(item.path);
    } else {
      control.type = 'button';
      control.addEventListener('click', (event) => {
        event.stopPropagation();
        runTargetAction(item);
      });
      if (item.mirrorState || item.cloneIcon) {
        mirrorTargetState(control, item);
      } else if (item.mirrorDisabled) {
        mirrorDisabledState(control, item.selector);
      }
    }
    return control;
  }

  function cloneTargetIcon(selector) {
    const target = selector ? document.querySelector(selector) : null;
    const source = target?.querySelector('.control-icon, img, svg');
    if (!(source instanceof Element)) return null;
    const icon = source.cloneNode(true);
    icon.removeAttribute('id');
    icon.removeAttribute('width');
    icon.removeAttribute('height');
    icon.style.removeProperty('width');
    icon.style.removeProperty('height');
    icon.style.removeProperty('min-width');
    icon.style.removeProperty('min-height');
    icon.style.removeProperty('max-width');
    icon.style.removeProperty('max-height');
    icon.querySelectorAll?.('[id]').forEach((node) => node.removeAttribute('id'));
    icon.classList.remove('control-icon');
    icon.classList.add('pixieed-common-tabbar__icon');
    icon.setAttribute('aria-hidden', 'true');
    if (icon instanceof HTMLImageElement) icon.alt = '';
    optimizeIconRendering(icon);
    return icon;
  }

  function createIcon(path) {
    const icon = document.createElement('img');
    icon.className = 'pixieed-common-tabbar__icon';
    icon.src = href(path);
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.addEventListener('error', () => {
      icon.replaceWith(createInlineFallbackIcon(path));
    }, { once: true });
    optimizeIconRendering(icon, path);
    return icon;
  }

  function createInlineFallbackIcon(path) {
    const namespace = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(namespace, 'svg');
    const source = String(path || '').toLowerCase();
    icon.classList.add('pixieed-common-tabbar__icon', 'pixieed-common-tabbar__icon--smooth');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    const add = (tag, attributes) => {
      const node = document.createElementNS(namespace, tag);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      icon.append(node);
    };
    if (source.includes('bell')) {
      add('path', { d: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9' });
      add('path', { d: 'M10 22h4' });
    } else if (source.includes('zoomup')) {
      add('circle', { cx: '10.5', cy: '10.5', r: '6.5' });
      add('path', { d: 'M10.5 7v7M7 10.5h7M16 16l5 5' });
    } else if (source.includes('zoomdown')) {
      add('circle', { cx: '10.5', cy: '10.5', r: '6.5' });
      add('path', { d: 'M7 10.5h7M16 16l5 5' });
    } else {
      add('path', { d: 'M5 7h14M5 12h14M5 17h14' });
    }
    return icon;
  }

  function optimizeIconRendering(icon, sourcePath = '') {
    if (!(icon instanceof Element)) return;
    const source = String(sourcePath || icon.getAttribute('src') || '').toLowerCase();
    const markPixel = () => icon.classList.add('pixieed-common-tabbar__icon--pixel');
    const markSmooth = () => icon.classList.add('pixieed-common-tabbar__icon--smooth');
    const isPixelSource = /(?:ecticon_frame_|(?:^|\/)(?:market|qr|home|draw|help|word|bought|reload|undo|redo|file|setting|詳細)\.png|(?:action-(?:reload|undo|redo|more-menu)|menu-(?:file|settings))\.png)/i.test(source);

    if (icon instanceof SVGElement) {
      if (icon.getAttribute('shape-rendering') === 'crispEdges') markPixel();
      else markSmooth();
      return;
    }
    if (!(icon instanceof HTMLImageElement)) return;
    icon.decoding = 'async';
    if (/\.svg(?:[?#]|$)/i.test(source)) {
      markSmooth();
      return;
    }
    const classifyRaster = () => {
      if (isPixelSource || (icon.naturalWidth > 0 && icon.naturalHeight > 0
        && Math.max(icon.naturalWidth, icon.naturalHeight) <= 32)) {
        markPixel();
      } else {
        markSmooth();
      }
    };
    if (icon.complete) classifyRaster();
    else icon.addEventListener('load', classifyRaster, { once: true });
  }

  function createSrOnlyLabel(label) {
    const text = document.createElement('span');
    text.className = 'pixieed-common-tabbar__sr-only';
    text.textContent = label;
    return text;
  }

  function createVisibleLabel(label) {
    const text = document.createElement('span');
    text.className = 'pixieed-common-details__label';
    text.textContent = label;
    return text;
  }

  function renderActions(currentUi) {
    const isFullscreenAction = (item) => item?.id === 'fullscreen' || item?.mode === 'fullscreen';
    const fullscreenActions = state.actions.filter(isFullscreenAction);
    const leadingActions = state.actions.filter((item) => item?.placement === 'leading' && !isFullscreenAction(item));
    const contextualActions = state.actions.filter((item) => item?.id !== 'reload' && !isFullscreenAction(item) && item?.placement !== 'leading' && item?.placement !== 'trailing');
    const trailingActions = state.actions.filter((item) => !isFullscreenAction(item) && item?.placement === 'trailing');
    currentUi.leadingActions.replaceChildren(
      ...fullscreenActions.map((item) => createActionControl(item, 'pixieed-common-tabbar__button')),
      ...leadingActions.map((item) => createActionControl(item, 'pixieed-common-tabbar__button')),
    );
    currentUi.actions.replaceChildren(...contextualActions.map((item) => (
      createActionControl(item, 'pixieed-common-tabbar__button')
    )));
    currentUi.trailingActions.replaceChildren(...trailingActions.map((item) => (
      createActionControl(item, 'pixieed-common-tabbar__button')
    )));
  }

  function renderDetails(container) {
    const myPage = { label: 'マイページ', path: 'account/index.html', icon: 'pixiedraw/assets/icons/ecticon_frame_01.png' };
    const notifications = { id: 'notifications', label: '通知', mode: 'notifications', icon: 'bell.png?v=20260724-icon-paths1' };
    const fallbackIcon = 'pixiedraw/assets/icons/action-more-menu.svg';
    const currentPathname = new URL(window.location.href).pathname.replace(/\/+$/, '') || '/';
    const items = [myPage, notifications, state.reloadAction, ...state.details.filter((item) => {
      if (!item || item.path === 'account/index.html') return false;
      if (!item.path) return true;
      const itemPathname = new URL(href(item.path)).pathname.replace(/\/+$/, '') || '/';
      return itemPathname !== currentPathname;
    })]
      .map((item) => (item.icon || item.cloneIcon ? item : { ...item, icon: fallbackIcon }));
    container.replaceChildren(...items.map((item) => {
      const control = createActionControl(item, 'pixieed-common-details__item');
      if (!item.keepOpen) {
        control.addEventListener('click', () => setDetailsPanelOpen(ui, false));
      }
      return control;
    }));
  }

  function runTargetAction(item) {
    if (item.mode === 'notifications') {
      document.dispatchEvent(new CustomEvent('pixieed:open-notifications'));
      return;
    }
    if (item.mode === 'reload') {
      window.location.reload();
      return;
    }
    if (item.mode === 'fullscreen') {
      const controller = item.fullscreenController === 'game'
        ? window.PiXiEEDGameFullscreen
        : window.PiXiEEDToolFullscreen;
      if (typeof controller?.toggle === 'function') {
        controller.toggle();
        return;
      }
    }
    const target = item.selector ? document.querySelector(item.selector) : null;
    if (!(target instanceof HTMLElement)) return;
    if (item.mode === 'focus') {
      target.focus({ preventScroll: false });
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (item.mode === 'scroll') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    target.click();
  }

  function mirrorDisabledState(control, selector) {
    const sync = () => {
      const target = selector ? document.querySelector(selector) : null;
      control.disabled = target instanceof HTMLButtonElement ? target.disabled : true;
    };
    sync();
    const target = selector ? document.querySelector(selector) : null;
    if (target) {
      new MutationObserver(sync).observe(target, { attributes: true, attributeFilter: ['disabled'] });
    }
  }

  function mirrorTargetState(control, item) {
    const target = item.selector ? document.querySelector(item.selector) : null;
    if (!(target instanceof HTMLElement)) {
      control.disabled = true;
      return;
    }
    const sync = () => {
      if (target instanceof HTMLButtonElement) control.disabled = target.disabled;
      ['aria-pressed', 'aria-expanded'].forEach((attribute) => {
        const value = target.getAttribute(attribute);
        if (value == null) control.removeAttribute(attribute);
        else control.setAttribute(attribute, value);
      });
      const sourceLabel = target.getAttribute('aria-label') || target.getAttribute('title');
      if (sourceLabel) {
        control.setAttribute('aria-label', sourceLabel);
        control.title = sourceLabel;
        const srLabel = control.querySelector('.pixieed-common-tabbar__sr-only');
        if (srLabel) srLabel.textContent = sourceLabel;
      }
      if (item.cloneIcon) {
        const nextIcon = cloneTargetIcon(item.selector);
        const currentIcon = control.querySelector('.pixieed-common-tabbar__icon');
        if (nextIcon && currentIcon) currentIcon.replaceWith(nextIcon);
      }
      if (item.iconWhenPressed) {
        const icon = control.querySelector('img.pixieed-common-tabbar__icon');
        const pressed = target.getAttribute('aria-pressed') === 'true';
        if (icon) icon.src = href(pressed ? item.iconWhenPressed : item.icon);
      }
      if (item.mirrorVisibility) {
        control.hidden = target.hidden || target.getAttribute('aria-hidden') === 'true';
      }
    };
    sync();
    new MutationObserver(sync).observe(target, {
      attributes: true,
      attributeFilter: ['disabled', 'hidden', 'aria-hidden', 'aria-pressed', 'aria-expanded', 'aria-label', 'title'],
      childList: true,
      subtree: true,
    });
  }

  function bindDetailsPanel(currentUi) {
    currentUi.detailButton.addEventListener('click', () => {
      setDetailsPanelOpen(currentUi, currentUi.layer.hidden);
    });
    currentUi.closeButton.addEventListener('click', () => setDetailsPanelOpen(currentUi, false));
    currentUi.backdrop.addEventListener('click', () => setDetailsPanelOpen(currentUi, false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !currentUi.layer.hidden) {
        setDetailsPanelOpen(currentUi, false);
      }
    });
  }

  function setDetailsPanelOpen(currentUi, open) {
    currentUi.layer.hidden = !open;
    currentUi.detailButton.setAttribute('aria-expanded', String(open));
    body.classList.toggle('is-pixieed-common-details-open', open);
    if (open) {
      currentUi.closeButton.focus({ preventScroll: true });
      initializeDetailsAd(currentUi);
    } else if (document.activeElement && currentUi.layer.contains(document.activeElement)) {
      currentUi.detailButton.focus({ preventScroll: true });
    }
  }

  function initializeDetailsAd(currentUi) {
    const adContainer = currentUi?.ad;
    const ad = adContainer?.querySelector('ins.adsbygoogle');
    if (!(adContainer instanceof HTMLElement) || !(ad instanceof HTMLElement)) return;
    window.PiXiEEDAdAccountControl?.refresh?.();
    if (window.__PIXIEED_ADS_DISABLED__ || window.__PIXIEED_AD_FREE_ACCOUNT__) {
      adContainer.hidden = true;
      return;
    }
    adContainer.hidden = false;
    if (ad.dataset.pixieedDetailsAdRequested === 'pending'
      || ad.dataset.pixieedDetailsAdRequested === '1'
      || ad.getAttribute('data-adsbygoogle-status') === 'done') return;
    ad.dataset.pixieedDetailsAdRequested = 'pending';

    const render = () => {
      if (!currentUi.layer.isConnected || currentUi.layer.hidden) {
        delete ad.dataset.pixieedDetailsAdRequested;
        return;
      }
      if (typeof window.pixieedObserveAds === 'function') {
        ad.dataset.pixieedDetailsAdRequested = '1';
        window.pixieedObserveAds(adContainer);
        return;
      }
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
        ad.dataset.pixieedDetailsAdRequested = '1';
      } catch (_error) {
        delete ad.dataset.pixieedDetailsAdRequested;
      }
    };

    const scheduleRender = () => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(render));
    };
    if (typeof window.__PIXIEEDRAW_LOAD_ADS__ === 'function') {
      Promise.resolve(window.__PIXIEEDRAW_LOAD_ADS__()).then((loaded) => {
        if (loaded) scheduleRender();
        else {
          adContainer.hidden = true;
          delete ad.dataset.pixieedDetailsAdRequested;
        }
      });
      return;
    }
    if (window.PiXiEEDAdAccountControl) {
      window.PiXiEEDAdAccountControl.loadAdsense().then((loaded) => {
        if (loaded) scheduleRender();
        else {
          adContainer.hidden = true;
          delete ad.dataset.pixieedDetailsAdRequested;
        }
      });
      return;
    }
    const existing = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    if (existing) {
      if (window.adsbygoogle) scheduleRender();
      else existing.addEventListener('load', scheduleRender, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
    script.addEventListener('load', scheduleRender, { once: true });
    document.head.appendChild(script);
  }

  function injectStyles() {
    if (document.getElementById('pixieed-common-tabbar-style')) return;
    const style = document.createElement('style');
    style.id = 'pixieed-common-tabbar-style';
    style.textContent = `
      :root{
        --pixieed-common-tabbar-height:54px;
        --pixieed-common-content-top:calc(var(--pixieed-top-ad-offset, 0px) + var(--pixieed-common-tabbar-height));
      }
      html{
        scroll-padding-top:calc(var(--pixieed-common-content-top) + 8px);
        scroll-padding-bottom:calc(var(--pixieed-shared-bottom-nav-offset, 68px) + 8px);
      }
      .pixieed-common-tabbar{
        position:fixed;top:var(--pixieed-top-ad-offset, 0px);left:0;right:0;z-index:14050;
        flex:0 0 auto;width:auto;height:var(--pixieed-common-tabbar-height);min-height:var(--pixieed-common-tabbar-height);
        display:flex;align-items:center;gap:7px;
        padding:6px max(9px, env(safe-area-inset-right, 0px)) 6px max(9px, env(safe-area-inset-left, 0px));
        border-bottom:1px solid rgba(148,163,184,.2);background:rgba(7,13,27,.97);
        box-shadow:0 8px 22px rgba(2,6,23,.24);box-sizing:border-box;
        font-family:'Fredoka','DotGothic16',system-ui,sans-serif;
      }
      .pixieed-common-tabbar__leading-actions,.pixieed-common-tabbar__trailing-actions{
        flex:0 0 auto;display:flex;align-items:center;gap:6px;
      }
      .pixieed-common-tabbar__actions{min-width:0;flex:1 1 auto;display:flex;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none}
      .pixieed-common-tabbar__actions::-webkit-scrollbar{display:none}
      .pixieed-common-tabbar__button--gap-before{margin-left:42px}
      .pixieed-common-tabbar__trailing-actions:not(:empty){margin-left:42px}
      .pixieed-common-tabbar__button,.pixieed-common-details__item{
        appearance:none;min-height:40px;display:inline-flex;align-items:center;justify-content:center;
        padding:7px 12px;border:1px solid rgba(148,163,184,.22);border-radius:6px;
        background:#111b30;color:#e5edf8;font:inherit;font-size:12px;font-weight:800;line-height:1;
        text-decoration:none;white-space:nowrap;cursor:pointer;box-sizing:border-box;
      }
      .pixieed-common-tabbar__button:hover,.pixieed-common-tabbar__button:focus-visible,
      .pixieed-common-details__item:hover,.pixieed-common-details__item:focus-visible{
        border-color:rgba(121,192,255,.58);background:#172641;outline:none;
      }
      .pixieed-common-tabbar__button:disabled{opacity:.38;cursor:default}
      .pixieed-common-tabbar__button--icon{width:42px;min-width:42px;height:42px;padding:3px;border-radius:4px;overflow:hidden}
      .pixieed-common-tabbar__icon{
        display:block;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;
        max-width:100%!important;max-height:100%!important;box-sizing:border-box;flex:none!important;border-radius:0;object-fit:contain;image-rendering:auto;
      }
      .pixieed-common-tabbar__icon--pixel{image-rendering:pixelated}
      .pixieed-common-tabbar__icon--smooth{image-rendering:auto}
      .pixieed-common-tabbar__sr-only{
        position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
        clip:rect(0,0,0,0);white-space:nowrap;border:0;
      }
      .pixieed-common-tabbar__details-button{margin-left:auto;flex:0 0 auto}
      .pixieed-common-details-layer{
        position:fixed;inset:0;z-index:14080;overflow:hidden;
        font-family:'Fredoka','DotGothic16',system-ui,sans-serif;
      }
      .pixieed-common-details-layer[hidden]{display:none!important}
      .pixieed-common-details__backdrop{
        appearance:none;position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;
        background:rgba(2,6,18,.68);backdrop-filter:blur(3px);cursor:default;
      }
      .pixieed-common-details{
        position:absolute;
        top:calc(var(--pixieed-top-ad-offset, 0px) + var(--pixieed-common-tabbar-height, 48px));
        right:0;bottom:var(--pixieed-shared-bottom-nav-offset, 68px);
        width:min(440px, calc(100vw - 16px));display:flex;flex-direction:column;min-height:0;
        border:1px solid rgba(148,163,184,.28);border-right:0;border-radius:10px 0 0 10px;
        background:#080f20;color:#e5edf8;box-shadow:-18px 0 45px rgba(0,0,0,.48);box-sizing:border-box;
      }
      .pixieed-common-details__header{
        flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;
        min-height:50px;padding:8px 10px 8px 14px;border-bottom:1px solid rgba(148,163,184,.2);
        background:rgba(10,18,35,.98);box-sizing:border-box;
      }
      .pixieed-common-details__header h2{margin:0;font-size:15px;letter-spacing:.04em}
      .pixieed-common-details__close{
        appearance:none;min-height:34px;padding:6px 10px;border:1px solid rgba(148,163,184,.24);
        border-radius:6px;background:#111b30;color:#e5edf8;font:inherit;font-size:12px;font-weight:800;cursor:pointer;
      }
      .pixieed-common-details__close:hover,.pixieed-common-details__close:focus-visible{
        border-color:rgba(121,192,255,.58);background:#172641;outline:none;
      }
      .pixieed-common-details__content{flex:1 1 auto;min-height:0;padding:10px;overflow:auto;overscroll-behavior:contain}
      .pixieed-common-details__links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .pixieed-common-details__item{
        --pixieed-common-details-icon-size:clamp(28px, 8vw, 36px);
        width:100%;height:76px;min-height:76px;display:grid;grid-template-columns:var(--pixieed-common-details-icon-size) minmax(0,1fr);
        align-items:center;justify-items:start;gap:8px;padding:10px;
        border-color:rgba(148,163,184,.12);border-radius:0;background:#0e182b;text-align:left;line-height:1.35;overflow:hidden;
      }
      .pixieed-common-tabbar__button[hidden],.pixieed-common-details__item[hidden]{display:none!important}
      .pixieed-common-details__item .pixieed-common-tabbar__icon{
        width:var(--pixieed-common-details-icon-size)!important;height:var(--pixieed-common-details-icon-size)!important;
        min-width:0!important;max-width:100%!important;min-height:0!important;max-height:100%!important;
        justify-self:center;align-self:center;overflow:hidden;border-radius:0;object-fit:contain;object-position:center;image-rendering:auto;
      }
      .pixieed-common-details__item .pixieed-common-tabbar__icon--pixel{image-rendering:pixelated}
      .pixieed-common-details__label{
        display:-webkit-box;width:100%;min-width:0;max-width:100%;padding:0;font-size:12px;font-weight:800;line-height:1.35;
        white-space:normal;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;
      }
      [data-common-action="notifications"]{position:relative}
      .pixieed-notification-badge{display:none;position:absolute;top:9px;left:35px;width:9px;height:9px;border-radius:50%;background:#ff3b54;box-shadow:0 0 0 2px rgba(7,13,27,.96)}
      [data-common-action="notifications"][data-has-unread="true"] .pixieed-notification-badge{display:block}
      .pixieed-common-details__ad{
        width:calc(100% + 20px);min-height:100px;margin:12px -10px -10px;overflow:hidden;background:#050a14;
      }
      .pixieed-common-details__ad[hidden]{display:none!important}
      .pixieed-common-details__ad ins.adsbygoogle{
        display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;min-height:100px!important;
      }
      .pixieed-common-details__ad ins.adsbygoogle > div,
      .pixieed-common-details__ad ins.adsbygoogle iframe{
        display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;
      }
      body.is-pixieed-common-details-open{overflow:hidden!important}
      body.has-pixieed-common-tabbar > .site-header,
      body.has-pixieed-common-tabbar > header.site-header{
        top:calc(var(--pixieed-top-ad-offset, 0px) + var(--pixieed-common-tabbar-height))!important;
      }
      body.has-pixieed-common-tabbar:not([data-pixieed-page='pixiedraw']):not([data-pixieed-page='pixiee-lens']):not([data-pixieed-page='maoitu']):not([data-pixieed-page='pixfind']){
        padding-top:var(--pixieed-common-content-top)!important;
      }
      body[data-pixieed-page='pixiedraw'] .app,
      body[data-pixieed-page='maoitu'] .game-shell{
        padding-top:var(--pixieed-common-content-top)!important;
      }
      body[data-pixieed-page='pixfind'] .app{
        width:min(1220px, 100%)!important;
        height:calc(var(--app-height) - var(--pixieed-common-content-top) - var(--pixieed-shared-bottom-nav-offset, 68px))!important;
        min-height:0!important;
        max-height:none!important;
        margin-top:var(--pixieed-common-content-top)!important;
        margin-bottom:var(--pixieed-shared-bottom-nav-offset, 68px)!important;
        padding:0!important;
      }
      body[data-pixieed-page='pixfind'] .creator-overlay,
      body[data-pixieed-page='pixfind'] .completion-overlay{
        top:var(--pixieed-common-content-top)!important;
        bottom:var(--pixieed-shared-bottom-nav-offset, 68px)!important;
      }
      body[data-pixieed-page='pixiedraw'] #mobileTopBar{display:none!important}
      body[data-pixieed-page='pixiedraw'] .editor-command-lane{display:none!important}
      body[data-pixieed-page='pixiedraw'] .layout{--editor-command-lane-height:0px!important}
      /* The portrait drawer owns these actions; the common bar owns them in landscape/desktop. */
      body[data-pixieed-page='pixiedraw'].is-mobile-layout
        .pixieed-common-tabbar__button[data-common-action='settings'],
      body[data-pixieed-page='pixiedraw'].is-mobile-layout
        .pixieed-common-tabbar__button[data-common-action='file'],
      body[data-pixieed-page='pixiedraw'].is-mobile-layout
        .pixieed-common-tabbar__button[data-common-action='camera'],
      body[data-pixieed-page='pixiedraw'].is-mobile-layout
        .pixieed-common-tabbar__button[data-common-action='qr']{
        display:none!important;
      }
      body[data-pixieed-page='pixiee-lens'] .hud-top__bar,
      body[data-pixieed-page='pixiee-lens'] .hud-bottom__actions-group{
        display:none!important;
      }
      body[data-pixieed-page='pixiee-lens'] .hud-bottom__actions{
        justify-content:center!important;
      }
      @media (max-width:680px) and (orientation:portrait){
        .pixieed-common-details{
          top:auto;left:0;right:0;bottom:var(--pixieed-shared-bottom-nav-offset, 68px);
          width:100%;max-height:min(72dvh, 620px);border-right:0;border-left:0;border-bottom:0;
          border-radius:12px 12px 0 0;box-shadow:0 -18px 45px rgba(0,0,0,.48);
        }
      }
      @media (orientation:landscape){
        :root{
          --pixieed-top-ad-offset:0px;
          --pixieed-common-content-top:var(--pixieed-common-tabbar-height);
        }
        .pixieed-common-tabbar{
          top:0;
          right:calc(var(--pixieed-shared-side-nav-width, 72px) + var(--pixieed-shared-side-nav-gap, 6px));
          width:auto;
        }
        body.has-pixieed-common-tabbar:not([data-pixieed-page='pixiedraw']):not([data-pixieed-page='pixiee-lens']):not([data-pixieed-page='maoitu']):not([data-pixieed-page='pixfind']){
          padding-top:var(--pixieed-common-tabbar-height)!important;
        }
        body[data-pixieed-page='pixiedraw'] .app,
        body[data-pixieed-page='maoitu'] .game-shell{
          padding-top:var(--pixieed-common-tabbar-height)!important;
        }
        body[data-pixieed-page='pixfind'] .app{
          width:calc(100% - var(--pixieed-shared-side-nav-width, 72px) - var(--pixieed-shared-side-nav-gap, 6px))!important;
          height:calc(var(--app-height) - var(--pixieed-common-tabbar-height))!important;
          margin:var(--pixieed-common-tabbar-height) calc(var(--pixieed-shared-side-nav-width, 72px) + var(--pixieed-shared-side-nav-gap, 6px)) 0 0!important;
          padding:0!important;
        }
        body[data-pixieed-page='pixfind'] .creator-overlay,
        body[data-pixieed-page='pixfind'] .completion-overlay{
          top:var(--pixieed-common-tabbar-height)!important;
          right:calc(var(--pixieed-shared-side-nav-width, 72px) + var(--pixieed-shared-side-nav-gap, 6px))!important;
          bottom:0!important;
        }
        .pixieed-common-details{
          right:calc(var(--pixieed-shared-side-nav-width, 72px) + var(--pixieed-shared-side-nav-gap, 6px));
          bottom:0;border-bottom-left-radius:10px;
        }
      }
    `;
    document.head.appendChild(style);
  }
})();
