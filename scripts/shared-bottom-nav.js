(function () {
  const script = document.currentScript;
  const doc = document;
  const body = doc.body;
  if (!script || !body) return;

  const pageUrl = new URL(window.location.href);
  const pageDirUrl = new URL('./', pageUrl);
  const rootUrl = new URL('../', script.src);
  if (window.__PIXIEED_EMBED_MODE__) {
    return;
  }
  const currentPath = String(pageUrl.pathname || '').toLowerCase();
  const currentTab = resolveCurrentTab(currentPath);
  let lastPixiedrawMobileChromeActive = null;
  let toolsToggle = null;
  let toolsLayer = null;
  let toolsCloseButton = null;
  let toolsReturnFocus = null;

  const chromeMessages = Object.freeze({
    ja: Object.freeze({
      bottomNavAria: '下部ナビ',
      navHome: 'ホーム',
      navMarket: 'マーケット',
      navDraw: 'PiXiEEDstudio',
      navTools: 'ツール',
      navAccount: 'マイページ',
      toolsEyebrow: 'PIXIEED TOOLS',
      toolsTitle: 'ツール',
      toolsClose: 'ツールを閉じる',
      toolDrawDescription: '制作をはじめる',
      toolLensDescription: '写真をドット絵にする',
      toolQrDescription: 'QRコードを作る',
      toolPixfindDescription: '作る・遊ぶ',
      toolMaoituDescription: 'ドット絵ゲーム',
      footerDraw: 'PiXiEEDstudio',
      footerCommunity: 'コミュニティ',
      footerMarket: 'マーケット',
      footerAccount: 'マイページ',
      footerLens: 'PiXiEELENS',
      footerPixfind: 'PiXFiND',
      footerQr: 'QR',
      footerMaoitu: 'まおいつ',
      footerHelp: 'ヘルプ',
      footerContact: 'お問い合わせ',
      footerEvents: 'イベント',
      footerNotice: 'お知らせ',
      footerNotes: '開発ノート',
      footerPortfolio: '企業向け',
      footerProjects: 'プロジェクト一覧',
      footerGlossary: '用語集',
      footerTerms: '利用規約',
      footerPrivacy: 'プライバシーポリシー',
      footerLegal: '特定商取引法に基づく表記'
    }),
    en: Object.freeze({
      bottomNavAria: 'Bottom navigation',
      navHome: 'Home',
      navMarket: 'Market',
      navDraw: 'PiXiEEDstudio',
      navTools: 'Tools',
      navAccount: 'Profile',
      toolsEyebrow: 'PIXIEED TOOLS',
      toolsTitle: 'Tools',
      toolsClose: 'Close tools',
      toolDrawDescription: 'Start creating',
      toolLensDescription: 'Turn photos into pixel art',
      toolQrDescription: 'Create a QR code',
      toolPixfindDescription: 'Create and play',
      toolMaoituDescription: 'Pixel art game',
      footerDraw: 'PiXiEEDstudio',
      footerCommunity: 'Community',
      footerMarket: 'Market',
      footerAccount: 'Profile',
      footerLens: 'PiXiEELENS',
      footerPixfind: 'PiXFiND',
      footerQr: 'QR',
      footerMaoitu: 'Maoitu',
      footerHelp: 'Help',
      footerContact: 'Contact',
      footerEvents: 'Events',
      footerNotice: 'News',
      footerNotes: 'Development notes',
      footerPortfolio: 'For business',
      footerProjects: 'Projects',
      footerGlossary: 'Glossary',
      footerTerms: 'Terms of service',
      footerPrivacy: 'Privacy policy',
      footerLegal: 'Commercial transaction notice'
    })
  });

  function getChromeCopy() {
    const locale = document.documentElement.dataset.pixieedLocale === 'en' ? 'en' : 'ja';
    return chromeMessages[locale];
  }

  function refreshLocalizedChrome() {
    const copy = getChromeCopy();
    doc.querySelectorAll('[data-pixieed-chrome-key]').forEach((node) => {
      const key = node.dataset.pixieedChromeKey;
      if (copy[key] !== undefined) node.textContent = copy[key];
    });
    const nav = doc.querySelector('.bottom-nav');
    if (nav) nav.setAttribute('aria-label', copy.bottomNavAria);
    const closeButton = doc.querySelector('.pixieed-tools-panel__close');
    if (closeButton) closeButton.setAttribute('aria-label', copy.toolsClose);
  }

  if (!currentPath.includes('/projects/') && /(?:^|\/)(?:pixiedraw|pixiedraw2|pixieedrawdev)(?:\/|\/index\.html)?$/.test(currentPath)) {
    body.dataset.pixieedPage = 'pixiedraw';
    doc.documentElement.dataset.pixieedPage = 'pixiedraw';
  } else if (!currentPath.includes('/projects/') && /(?:^|\/)pixiee-lens(?:\/|\/index\.html)?$/.test(currentPath)) {
    body.dataset.pixieedPage = 'pixiee-lens';
    doc.documentElement.dataset.pixieedPage = 'pixiee-lens';
  } else if (!currentPath.includes('/projects/') && /(?:^|\/)maoitu(?:\/|\/index\.html)?$/.test(currentPath)) {
    body.dataset.pixieedPage = 'maoitu';
    doc.documentElement.dataset.pixieedPage = 'maoitu';
  } else if (!currentPath.includes('/projects/') && /(?:^|\/)pixfind(?:\/|\/index\.html)?$/.test(currentPath)) {
    body.dataset.pixieedPage = 'pixfind';
    doc.documentElement.dataset.pixieedPage = 'pixfind';
  }
  if (!isStandaloneToolOrGamePage()) {
    body.classList.add('pixieed-seamless-page');
  }

  applyResponsivePageState();
  injectStyles();
  replaceFooter();
  replaceBottomNav();
  refreshLocalizedChrome();
  window.addEventListener('pixieed:locale-changed', refreshLocalizedChrome);
  ensureAdAccountControl(() => {
    ensureCommonTabBarController();
    if (script.dataset.pixieedFooterAd !== 'false') ensureFooterAdController();
  });

  function resolveCurrentTab(pathname) {
    const path = String(pathname || '').toLowerCase();
    if (path.includes('/studio/')) return 'draw';
    if (path.includes('/pixiedraw/') || path.includes('/pixiedraw2/') || path.includes('/pixieedrawdev/')) return 'draw';
    if (path.includes('/market/')) return 'market';
    if (path.includes('/qr/') || path.includes('/qr-maker/')) return 'tools';
    if (path.includes('/pixiee-lens/') || path.includes('/pixfind/') || path.includes('/maoitu/')) return 'tools';
    if (/(?:^|\/)account(?:\/|\/index\.html)?$/.test(path)) return 'account';
    return 'home';
  }

  function isHomePage() {
    const path = String(currentPath || '').replace(/\/+$/, '') || '/';
    const rootPath = String(rootUrl.pathname || '/').replace(/\/+$/, '') || '/';
    return path === rootPath || path === `${rootPath === '/' ? '' : rootPath}/index.html`;
  }

  function relHref(targetPath) {
    const targetUrl = new URL(targetPath, rootUrl);
    return toRelativeHref(pageDirUrl, targetUrl);
  }

  function ensureFooterAdController() {
    if (window.__PIXIEED_FOOTER_AD_CONTROLLER__ || doc.querySelector('script[data-pixieed-footer-ad-controller="true"]')) {
      return;
    }
    const controller = doc.createElement('script');
    controller.defer = true;
    controller.dataset.pixieedFooterAdController = 'true';
    controller.src = relHref('scripts/bottom-nav-footer-ad.js?v=20260730-pixiedraw-local-preview1');
    doc.body.appendChild(controller);
  }

  function ensureAdAccountControl(ready) {
    if (window.PiXiEEDAdAccountControl) {
      window.PiXiEEDAdAccountControl.refresh();
      ready();
      return;
    }
    const existing = doc.querySelector('script[data-pixieed-ad-account-control="true"]');
    if (existing) {
      existing.addEventListener('load', ready, { once: true });
      return;
    }
    const controller = doc.createElement('script');
    controller.async = false;
    controller.dataset.pixieedAdAccountControl = 'true';
    controller.src = relHref('scripts/ad-account-control.js?v=20260721-token-expiry1');
    controller.addEventListener('load', ready, { once: true });
    controller.addEventListener('error', ready, { once: true });
    doc.head.appendChild(controller);
  }

  function ensureCommonTabBarController() {
    if (window.__PIXIEED_COMMON_TAB_BAR__) {
      ensureNotificationController();
      return;
    }
    if (doc.querySelector('script[data-pixieed-common-tab-bar="true"]')) {
      return;
    }
    const controller = doc.createElement('script');
    controller.async = false;
    controller.dataset.pixieedCommonTabBar = 'true';
    controller.src = relHref('scripts/shared-tab-bar.js?v=20260825-locale2');
    controller.addEventListener('load', ensureNotificationController, { once: true });
    doc.body.appendChild(controller);
  }

  function ensureNotificationController() {
    if (window.__PIXIEED_NOTIFICATION_CONTROLLER__ || doc.querySelector('script[data-pixieed-notification-controller="true"]')) return;
    const controller = doc.createElement('script');
    controller.async = false;
    controller.dataset.pixieedNotificationController = 'true';
    controller.src = relHref('scripts/shared-notifications.js?v=20260724-product-update-notice1');
    doc.body.appendChild(controller);
  }

  function isPixiedrawPage() {
    return !currentPath.includes('/projects/') && /(?:^|\/)(?:pixiedraw|pixiedraw2|pixieedrawdev)(?:\/|\/index\.html)?$/.test(currentPath);
  }

  function isStandaloneToolOrGamePage() {
    if (currentPath.includes('/projects/')) {
      return false;
    }
    return /(?:^|\/)(?:pixiedraw|pixiedraw2|pixieedrawdev|pixiee-lens|qr|qr-maker|maoitu|pixfind)(?:\/|\/index\.html)?$/.test(currentPath);
  }

  function applyResponsivePageState() {
    if (!isPixiedrawPage()) {
      return;
    }
    const mobileChromeActive = true;
    body.dataset.pixieedMobileChrome = mobileChromeActive ? 'true' : 'false';
    doc.documentElement.dataset.pixieedMobileChrome = mobileChromeActive ? 'true' : 'false';
    doc.documentElement.style.setProperty('--mobile-bottom-ad-height', mobileChromeActive ? '68px' : '0px');
    if (lastPixiedrawMobileChromeActive === mobileChromeActive) {
      return;
    }
    lastPixiedrawMobileChromeActive = mobileChromeActive;
    try {
      document.dispatchEvent(new CustomEvent('pixiedraw:mobile-chrome-change', {
        detail: { active: mobileChromeActive }
      }));
    } catch (_error) {
      // ignore
    }
  }

  function replaceFooter() {
    const shouldPreserveFooter = (node) => {
      if (!(node instanceof HTMLElement)) {
        return true;
      }
      return node.classList.contains('ad-footer')
        || node.classList.contains('modal__footer')
        || Boolean(node.closest('dialog'));
    };
    if (isPixiedrawPage() || (!currentPath.includes('/projects/') && /(?:^|\/)pixiee-lens(?:\/|\/index\.html)?$/.test(currentPath))) {
      doc.querySelectorAll('footer').forEach((node) => {
        if (shouldPreserveFooter(node)) {
          return;
        }
        node.remove();
      });
      return;
    }
    doc.querySelectorAll('footer').forEach((node) => {
      if (shouldPreserveFooter(node)) {
        return;
      }
      node.remove();
    });

    const footer = doc.createElement('footer');
    footer.className = 'pixieed-shared-footer';

    const copyright = doc.createElement('p');
    copyright.className = 'pixieed-shared-footer__copy';
    copyright.textContent = `© ${new Date().getFullYear()} PiXiEED. All rights reserved.`;

    const links = doc.createElement('div');
    links.className = 'footer-links';

    getFooterLinks().forEach((entry) => {
      if (entry.disabled) {
        const span = doc.createElement('span');
        span.className = 'pixieed-footer-link is-disabled';
        span.dataset.pixieedChromeKey = entry.labelKey || '';
        span.textContent = entry.label;
        links.appendChild(span);
        return;
      }
      const link = doc.createElement('a');
      link.className = 'pixieed-footer-link';
      link.href = relHref(entry.path);
      link.dataset.pixieedChromeKey = entry.labelKey || '';
      link.textContent = entry.label;
      links.appendChild(link);
    });

    footer.append(copyright, links);

    const anchor = doc.querySelector('.page') || doc.querySelector('main') || body.firstElementChild;
    if (anchor && anchor.parentNode) {
      anchor.insertAdjacentElement('afterend', footer);
    } else {
      body.appendChild(footer);
    }
  }

  function replaceBottomNav() {
    doc.querySelectorAll('.bottom-nav').forEach((node) => node.remove());

    const nav = doc.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', getChromeCopy().bottomNavAria);

    getNavItems().forEach((entry) => {
      const item = doc.createElement(entry.disabled ? 'span' : entry.action ? 'button' : 'a');
      item.className = `bottom-nav__item${entry.primary ? ' bottom-nav__item--primary' : ''}${entry.key === currentTab ? ' is-active' : ''}`;
      item.dataset.tab = entry.key;
      if (entry.disabled) {
        item.setAttribute('aria-disabled', 'true');
      } else if (entry.action === 'tools') {
        item.type = 'button';
        item.setAttribute('aria-haspopup', 'dialog');
        item.setAttribute('aria-expanded', 'false');
        item.setAttribute('aria-controls', 'pixieedToolsPanel');
        item.addEventListener('click', () => setToolsPanelOpen(toolsLayer?.hidden !== false));
        toolsToggle = item;
      } else {
        item.href = relHref(entry.path);
      }

      const icon = doc.createElement('span');
      icon.className = 'icon';
      const img = doc.createElement('img');
      img.alt = '';
      img.src = relHref(entry.icon);
      icon.appendChild(img);

      const label = doc.createElement('span');
      label.dataset.pixieedChromeKey = entry.labelKey || '';
      label.textContent = entry.label;

      item.append(icon, label);
      nav.appendChild(item);
    });

    body.appendChild(nav);
    ensureToolsPanel();
  }

  function ensureToolsPanel() {
    doc.querySelectorAll('.pixieed-tools-layer').forEach((node) => node.remove());

    const layer = doc.createElement('div');
    layer.className = 'pixieed-tools-layer';
    layer.hidden = true;

    const panel = doc.createElement('section');
    panel.className = 'pixieed-tools-panel';
    panel.id = 'pixieedToolsPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'pixieedToolsTitle');

    const header = doc.createElement('header');
    header.className = 'pixieed-tools-panel__header';
    const heading = doc.createElement('div');
    const eyebrow = doc.createElement('small');
    eyebrow.dataset.pixieedChromeKey = 'toolsEyebrow';
    eyebrow.textContent = 'PIXIEED TOOLS';
    const title = doc.createElement('h2');
    title.id = 'pixieedToolsTitle';
    title.dataset.pixieedChromeKey = 'toolsTitle';
    title.textContent = 'ツール';
    heading.append(eyebrow, title);

    const close = doc.createElement('button');
    close.className = 'pixieed-tools-panel__close';
    close.type = 'button';
    close.setAttribute('aria-label', getChromeCopy().toolsClose);
    close.textContent = '×';
    close.addEventListener('click', () => setToolsPanelOpen(false));
    toolsCloseButton = close;
    header.append(heading, close);

    const grid = doc.createElement('div');
    grid.className = 'pixieed-tools-grid';
    getToolItems().forEach((entry) => {
      const link = doc.createElement('a');
      link.className = 'pixieed-tools-card';
      link.href = relHref(entry.path);

      const icon = doc.createElement('span');
      icon.className = 'pixieed-tools-card__icon';
      const image = doc.createElement('img');
      image.src = relHref(entry.icon);
      image.alt = '';
      icon.appendChild(image);

      const copy = doc.createElement('span');
      copy.className = 'pixieed-tools-card__copy';
      const name = doc.createElement('strong');
      name.dataset.pixieedChromeKey = entry.labelKey || '';
      name.textContent = entry.label;
      const description = doc.createElement('small');
      description.dataset.pixieedChromeKey = entry.descriptionKey || '';
      description.textContent = entry.description;
      copy.append(name, description);

      link.append(icon, copy);
      grid.appendChild(link);
    });

    panel.append(header, grid);
    layer.appendChild(panel);
    layer.addEventListener('click', (event) => {
      if (event.target === layer) setToolsPanelOpen(false);
    });
    body.appendChild(layer);
    toolsLayer = layer;
  }

  function setToolsPanelOpen(open) {
    if (!toolsLayer || !toolsToggle) return;
    const shouldOpen = Boolean(open);
    if (shouldOpen) toolsReturnFocus = doc.activeElement;
    toolsLayer.hidden = !shouldOpen;
    toolsToggle.setAttribute('aria-expanded', String(shouldOpen));
    body.classList.toggle('is-pixieed-tools-open', shouldOpen);
    if (shouldOpen) {
      requestAnimationFrame(() => toolsCloseButton?.focus());
    } else if (toolsReturnFocus instanceof HTMLElement) {
      toolsReturnFocus.focus();
      toolsReturnFocus = null;
    }
  }

  function getToolItems() {
    return [
      { label: 'PiXiEEDstudio', labelKey: 'navDraw', description: '制作をはじめる', descriptionKey: 'toolDrawDescription', path: 'studio/index.html', icon: 'assets/icons/Draw.png?v=2026.07.19-ui-icons1' },
      { label: 'PiXiEELENS', labelKey: 'footerLens', description: '写真をドット絵にする', descriptionKey: 'toolLensDescription', path: 'pixiee-lens/index.html', icon: 'assets/icons/Camera.png' },
      { label: 'QR', labelKey: 'footerQr', description: 'QRコードを作る', descriptionKey: 'toolQrDescription', path: 'qr/index.html', icon: 'assets/icons/QR.png' },
      { label: 'PiXFiND', labelKey: 'footerPixfind', description: '作る・遊ぶ', descriptionKey: 'toolPixfindDescription', path: 'pixfind/index.html', icon: 'icon/icon-192-2.png' },
      { label: 'まおいつ', labelKey: 'footerMaoitu', description: 'ドット絵ゲーム', descriptionKey: 'toolMaoituDescription', path: 'maoitu/index.html', icon: 'icon/icon-192-3.png' }
    ];
  }

  function getFooterLinks() {
    return [
      { label: 'PiXiEEDstudio', labelKey: 'footerDraw', path: 'studio/index.html' },
      { label: 'コミュニティ', labelKey: 'footerCommunity', path: 'community/' },
      { label: 'マーケット', labelKey: 'footerMarket', path: 'market/' },
      { label: 'マイページ', labelKey: 'footerAccount', path: 'account/index.html' },
      { label: 'PiXiEELENS', labelKey: 'footerLens', path: 'pixiee-lens/index.html' },
      { label: 'PiXFiND', labelKey: 'footerPixfind', path: 'pixfind/index.html' },
      { label: 'QR', labelKey: 'footerQr', path: 'qr/index.html' },
      { label: 'まおいつ', labelKey: 'footerMaoitu', path: 'maoitu/index.html' },
      { label: 'ヘルプ', labelKey: 'footerHelp', path: 'help/index.html' },
      { label: 'お問い合わせ', labelKey: 'footerContact', path: 'contact/index.html' },
      { label: 'イベント', labelKey: 'footerEvents', path: 'events/index.html' },
      { label: 'お知らせ', labelKey: 'footerNotice', path: 'notice/index.html' },
      { label: '開発ノート', labelKey: 'footerNotes', path: 'notes/index.html' },
      { label: '企業向け', labelKey: 'footerPortfolio', path: 'portfolio/index.html' },
      { label: 'プロジェクト一覧', labelKey: 'footerProjects', path: 'projects/index.html' },
      { label: '用語集', labelKey: 'footerGlossary', path: 'glossary/index.html' },
      { label: '利用規約', labelKey: 'footerTerms', path: 'terms/index.html' },
      { label: 'プライバシーポリシー', labelKey: 'footerPrivacy', path: 'privacy/index.html' },
      { label: '特定商取引法に基づく表記', labelKey: 'footerLegal', path: 'legal/index.html' }
    ];
  }

  function getNavItems() {
    return [
      { key: 'home', label: 'ホーム', labelKey: 'navHome', path: 'index.html', icon: 'assets/icons/HOME.png?v=2026.07.19-ui-icons1' },
      { key: 'market', label: 'マーケット', labelKey: 'navMarket', path: 'market/', icon: 'assets/icons/Market.png' },
      { key: 'draw', label: 'PiXiEEDstudio', labelKey: 'navDraw', path: 'studio/index.html', icon: 'assets/icons/Draw.png?v=2026.07.19-ui-icons1', primary: true },
      { key: 'tools', label: 'ツール', labelKey: 'navTools', action: 'tools', icon: 'pixiedraw/assets/icons/menu-tools.png' },
      { key: 'account', label: 'マイページ', labelKey: 'navAccount', path: 'account/index.html', icon: 'pixiedraw/assets/icons/ecticon_frame_01.png' }
    ];
  }

  function injectStyles() {
    if (doc.getElementById('pixieed-shared-bottom-nav-style')) return;
    const style = doc.createElement('style');
    style.id = 'pixieed-shared-bottom-nav-style';
    style.textContent = `
      :root{
        --pixieed-shared-bottom-nav-height:68px;
        --pixieed-shared-side-nav-width:72px;
        --pixieed-shared-side-nav-gap:6px;
        --pixieed-shared-bottom-nav-offset:calc(var(--pixieed-shared-bottom-nav-height) + env(safe-area-inset-bottom, 0px));
      }
      html[data-pixieed-page="pixiedraw"]{
        --mobile-bottom-ad-height:68px;
      }
      body{
        padding-bottom:max(84px, calc(var(--pixieed-shared-bottom-nav-height) + 16px + env(safe-area-inset-bottom, 0px))) !important;
      }
      body.pixieed-seamless-page{
        padding-inline:0 !important;
      }
      body.pixieed-seamless-page > .page,
      body.pixieed-seamless-page > main,
      body.pixieed-seamless-page > .page-shell,
      body.pixieed-seamless-page > .page > main,
      body.pixieed-seamless-page > .page > .page-shell{
        gap:0 !important;
        width:100%;
        min-width:0;
        box-sizing:border-box;
        margin-left:auto !important;
        margin-right:auto !important;
      }
      body.pixieed-seamless-page > .page > main,
      body.pixieed-seamless-page > .page > .page-shell,
      body.pixieed-seamless-page > .page-shell{
        width:100%;
        min-width:0;
      }
      body.pixieed-seamless-page .header-inner,
      body.pixieed-seamless-page .section-inner,
      body.pixieed-seamless-page .footer-inner{
        margin-left:auto !important;
        margin-right:auto !important;
      }
      body.pixieed-seamless-page main > section,
      body.pixieed-seamless-page .page > section,
      body.pixieed-seamless-page .page-shell > section,
      body.pixieed-seamless-page .page > .card{
        margin-block:0 !important;
        border-radius:0 !important;
      }
      body.pixieed-seamless-page main > section + section,
      body.pixieed-seamless-page .page > section + section,
      body.pixieed-seamless-page .page-shell > section + section,
      body.pixieed-seamless-page .page > .card + .card{
        border-top-width:0 !important;
      }
      body.pixieed-seamless-page #devNotes{
        display:grid;
        gap:0 !important;
      }
      body.pixieed-seamless-page #devNotes > *{
        margin-block:0 !important;
        border-radius:0 !important;
      }
      body.pixieed-seamless-page{
        background:
          radial-gradient(48rem 30rem at -8% -12%, rgba(37,99,235,0.18), transparent 64%),
          radial-gradient(40rem 28rem at 108% 8%, rgba(124,58,237,0.16), transparent 60%),
          #070d1b !important;
      }
      body.pixieed-seamless-page > header,
      body.pixieed-seamless-page > .site-header{
        background:rgba(7,13,27,0.84) !important;
        border-color:rgba(148,163,184,0.18) !important;
        box-shadow:0 12px 30px rgba(2,6,23,0.2);
        backdrop-filter:blur(18px) saturate(1.3);
      }
      body.pixieed-seamless-page > main > section,
      body.pixieed-seamless-page > .page > section,
      body.pixieed-seamless-page > .page > .card,
      body.pixieed-seamless-page .page-shell > .section{
        background:rgba(12,22,43,0.84) !important;
        border-color:rgba(148,163,184,0.16) !important;
        box-shadow:none !important;
      }
      body.pixieed-seamless-page > main > section + section,
      body.pixieed-seamless-page > .page > section + section,
      body.pixieed-seamless-page > .page > .card + .card,
      body.pixieed-seamless-page .page-shell > .section + .section{
        border-top-color:rgba(148,163,184,0.14) !important;
      }
      body.pixieed-seamless-page .button,
      body.pixieed-seamless-page .button-secondary,
      body.pixieed-seamless-page .account-action{
        min-height:42px;
        border-radius:13px;
        font-weight:800;
      }
      body.pixieed-seamless-page .button{
        background:linear-gradient(135deg,#2563eb,#7c3aed);
        box-shadow:0 10px 22px rgba(37,99,235,0.24);
      }
      body.pixieed-seamless-page .button-secondary{
        background:rgba(15,23,42,0.72);
        border-color:rgba(148,163,184,0.24);
      }
      body.pixieed-seamless-page .card,
      body.pixieed-seamless-page .link-card,
      body.pixieed-seamless-page .info-card{
        border-color:rgba(148,163,184,0.16);
        background:rgba(15,23,42,0.58);
      }
      body[data-pixieed-page="pixiedraw"]{
        padding-bottom:0 !important;
      }
      body[data-pixieed-page="pixfind"]{
        padding:0 !important;
      }
      body[data-pixieed-page="pixiedraw"][data-pixieed-mobile-chrome="true"] .app{
        padding-bottom:max(84px, calc(var(--pixieed-shared-bottom-nav-height) + 16px + env(safe-area-inset-bottom, 0px))) !important;
      }
      @media (orientation: landscape){
        body:not([data-pixieed-page="pixiedraw"]):not([data-pixieed-page="pixiee-lens"]):not([data-pixieed-page="maoitu"]):not([data-pixieed-page="pixfind"]){
          padding-right:max(76px, calc(var(--pixieed-shared-side-nav-width) + var(--pixieed-shared-side-nav-gap) + env(safe-area-inset-right, 0px))) !important;
          padding-bottom:0 !important;
        }
        body[data-pixieed-page="pixiedraw"][data-pixieed-mobile-chrome="true"]{
          padding-bottom:0 !important;
        }
        body[data-pixieed-page="pixiedraw"][data-pixieed-mobile-chrome="true"] .app{
          padding-right:max(76px, calc(var(--pixieed-shared-side-nav-width) + var(--pixieed-shared-side-nav-gap) + env(safe-area-inset-right, 0px))) !important;
          padding-bottom:0 !important;
        }
        body[data-pixieed-page="pixfind"] .app{
          padding:0 !important;
        }
        body .bottom-nav{
          top:0 !important;
          right:0 !important;
          bottom:0 !important;
          left:auto !important;
          width:var(--pixieed-shared-side-nav-width) !important;
          height:var(--viewport-height, var(--app-height, 100dvh)) !important;
          min-height:var(--viewport-height, var(--app-height, 100dvh)) !important;
          max-height:var(--viewport-height, var(--app-height, 100dvh)) !important;
          /* Keep the primary destinations nearest the thumb in landscape:
             account at the top and home at the bottom. */
          flex-direction:column-reverse !important;
          justify-content:center !important;
          gap:2px;
          padding:calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 8px) 0 calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 8px) !important;
          border-top:0 !important;
          border-left:1px solid rgba(255,255,255,0.08);
          box-sizing:border-box;
        }
        .bottom-nav__item{
          width:100%;
          flex:1 1 0 !important;
          max-height:76px;
          padding:5px 2px !important;
        }
        .bottom-nav__item--primary{
          transform:none !important;
        }
      }
      @media (orientation: landscape) and (max-height:380px){
        body .bottom-nav{
          padding-top:calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 4px) !important;
          padding-bottom:calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 4px) !important;
        }
        .bottom-nav__item{
          gap:2px !important;
          padding:2px 1px !important;
          font-size:9px !important;
        }
        .bottom-nav__item .icon{
          width:21px !important;
          height:21px !important;
        }
        .bottom-nav__item--primary .icon{
          width:36px !important;
          height:36px !important;
          padding:6px !important;
          border-radius:13px !important;
        }
      }
      .pixieed-shared-footer{
        color:#cbd5e1;
        text-align:center;
        font-size:12px;
        display:grid;
        gap:8px;
        width:100%;
        max-width:min(1200px, 100%);
        margin:0 auto 10px;
        padding:0 0 2px;
      }
      .pixieed-shared-footer__copy{
        margin:0;
      }
      .footer-links{
        display:flex;
        flex-wrap:wrap;
        justify-content:center;
        gap:8px 10px;
        padding:0;
        margin:0;
        list-style:none;
      }
      .pixieed-footer-link,
      .footer-links a,
      .footer-links span{
        color:#cbd5e1;
        text-decoration:none;
        border:1px solid rgba(148,163,184,0.18);
        border-radius:8px;
        padding:4px 7px;
        background:transparent;
        font-weight:700;
        font-size:12px;
        transition:transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
      }
      .pixieed-footer-link.is-disabled,
      .footer-links span.is-disabled{
        opacity:0.78;
      }
      .pixieed-footer-link:hover,
      .pixieed-footer-link:focus-visible,
      .footer-links a:hover,
      .footer-links a:focus-visible{
        transform:translateY(-1px);
        border-color:rgba(255,255,255,0.26);
        background:rgba(114,230,213,0.08);
      }
      body .bottom-nav{
        position:fixed!important;
        top:auto!important;
        bottom:0!important;
        left:0!important;
        right:0!important;
        width:100%!important;
        height:var(--pixieed-shared-bottom-nav-height)!important;
        min-height:var(--pixieed-shared-bottom-nav-height)!important;
        max-height:var(--pixieed-shared-bottom-nav-height)!important;
        background:rgba(11,18,36,0.96);
        border-top:1px solid rgba(255,255,255,0.08);
        display:flex;
        justify-content:space-around;
        align-items:center;
        z-index:14060;
        backdrop-filter:blur(8px);
      }
      .bottom-nav__item{
        appearance:none;
        border:0;
        background:transparent;
        flex:1;
        min-width:0;
        text-align:center;
        color:#cbd5e1;
        text-decoration:none;
        font-weight:700;
        font-family:inherit;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:4px;
        font-size:11px;
        line-height:1.2;
        padding:7px 2px;
        cursor:pointer;
      }
      .bottom-nav__item .icon{
        width:24px;
        height:24px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
      }
      .bottom-nav__item .icon img{
        width:100%;
        height:100%;
        object-fit:contain;
        image-rendering:pixelated;
      }
      .bottom-nav__item.is-active{
        color:#f9fafb;
      }
      .bottom-nav__item--primary{
        color:#fff;
        transform:translateY(-8px);
      }
      .bottom-nav__item--primary .icon{
        width:46px;
        height:46px;
        border-radius:17px;
        padding:8px;
        background:linear-gradient(135deg,#2563eb,#7c3aed);
        border:1px solid rgba(255,255,255,0.24);
        box-shadow:0 10px 22px rgba(37,99,235,0.34), inset 0 1px 0 rgba(255,255,255,0.2);
      }
      .bottom-nav__item--primary .icon img{
        width:100%;
        height:100%;
        object-fit:contain;
      }
      .bottom-nav__item:focus-visible{
        outline:2px solid #79c0ff;
        outline-offset:-2px;
      }
      .pixieed-tools-layer[hidden]{
        display:none!important;
      }
      .pixieed-tools-layer{
        position:fixed;
        z-index:14050;
        inset:0 0 var(--pixieed-shared-bottom-nav-offset) 0;
        display:flex;
        box-sizing:border-box;
        align-items:flex-end;
        justify-content:center;
        padding:12px;
        background:rgba(2,6,23,.72);
        backdrop-filter:blur(4px);
      }
      .pixieed-tools-panel{
        width:min(560px, 100%);
        max-height:calc(100dvh - var(--pixieed-shared-bottom-nav-offset) - 24px);
        box-sizing:border-box;
        overflow:auto;
        padding:14px;
        border:1px solid rgba(121,192,255,.3);
        border-radius:14px;
        background:#10182c;
        box-shadow:0 24px 70px rgba(0,0,0,.58);
        color:#f8fafc;
      }
      .pixieed-tools-panel__header{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        margin-bottom:12px;
      }
      .pixieed-tools-panel__header small,
      .pixieed-tools-panel__header h2{
        margin:0;
      }
      .pixieed-tools-panel__header small{
        color:#7ef0c7;
        font-size:9px;
        font-weight:900;
        letter-spacing:.13em;
      }
      .pixieed-tools-panel__header h2{
        margin-top:2px;
        font-size:18px;
      }
      .pixieed-tools-panel__close{
        width:40px;
        height:40px;
        flex:0 0 auto;
        padding:0;
        border:1px solid rgba(255,255,255,.14);
        border-radius:8px;
        background:#1b2741;
        color:#f8fafc;
        font:inherit;
        font-size:22px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
      }
      .pixieed-tools-grid{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:8px;
      }
      .pixieed-tools-card{
        display:flex;
        min-width:0;
        min-height:72px;
        box-sizing:border-box;
        align-items:center;
        gap:10px;
        padding:10px;
        border:1px solid rgba(255,255,255,.11);
        border-radius:9px;
        background:#0b1224;
        color:#f8fafc;
        text-align:left;
        text-decoration:none;
      }
      .pixieed-tools-card:hover,
      .pixieed-tools-card:focus-visible{
        border-color:rgba(121,192,255,.52);
        outline:0;
        background:#14203a;
      }
      .pixieed-tools-card__icon{
        display:grid;
        width:38px;
        height:38px;
        flex:0 0 auto;
        place-items:center;
        border-radius:8px;
        background:rgba(121,192,255,.09);
      }
      .pixieed-tools-card__icon img{
        width:28px;
        height:28px;
        object-fit:contain;
        image-rendering:pixelated;
      }
      .pixieed-tools-card__copy{
        display:grid;
        min-width:0;
        gap:3px;
      }
      .pixieed-tools-card__copy strong{
        overflow:hidden;
        font-size:12px;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .pixieed-tools-card__copy small{
        color:#94a3b8;
        font-size:9px;
        line-height:1.35;
      }
      @media (min-width:700px) and (orientation:portrait){
        .pixieed-tools-grid{
          grid-template-columns:repeat(3, minmax(0, 1fr));
        }
      }
      @media (orientation:landscape){
        body .bottom-nav{
          top:0!important;
          right:0!important;
          bottom:0!important;
          left:auto!important;
          width:var(--pixieed-shared-side-nav-width)!important;
          height:var(--viewport-height, var(--app-height, 100dvh))!important;
          min-height:var(--viewport-height, var(--app-height, 100dvh))!important;
          max-height:var(--viewport-height, var(--app-height, 100dvh))!important;
        }
        .pixieed-tools-layer{
          right:var(--pixieed-shared-side-nav-width);
          bottom:0;
          align-items:center;
          justify-content:flex-end;
        }
        .pixieed-tools-panel{
          width:min(430px, calc(100vw - var(--pixieed-shared-side-nav-width) - 24px));
          max-height:calc(100dvh - 24px);
        }
      }
    `;
    doc.head.appendChild(style);
  }

  window.addEventListener('resize', applyResponsivePageState, { passive: true });
  window.addEventListener('orientationchange', applyResponsivePageState, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', applyResponsivePageState, { passive: true });
  }
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toolsLayer?.hidden === false) {
      event.preventDefault();
      setToolsPanelOpen(false);
    }
  });

  function toRelativeHref(fromDirUrl, targetUrl) {
    if (fromDirUrl.origin !== targetUrl.origin) return targetUrl.href;
    const fromParts = fromDirUrl.pathname.split('/').filter(Boolean);
    const targetParts = targetUrl.pathname.split('/').filter(Boolean);

    if (!fromDirUrl.pathname.endsWith('/')) {
      fromParts.pop();
    }

    while (fromParts.length && targetParts.length && fromParts[0] === targetParts[0]) {
      fromParts.shift();
      targetParts.shift();
    }

    const up = fromParts.map(() => '..');
    const down = targetParts;
    const relative = [...up, ...down].join('/');
    const path = relative || './';
    return `${path}${targetUrl.search}${targetUrl.hash}`;
  }
})();
