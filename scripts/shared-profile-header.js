(function () {
  const currentScript = document.currentScript;

  function asset(relativePath) {
    try {
      return new URL(relativePath, currentScript?.src || window.location.href).href;
    } catch (_error) {
      return relativePath;
    }
  }

  function rootAsset(relativePath) {
    return asset(`../${relativePath}`);
  }

  function navIcon(symbolId) {
    const sprite = rootAsset('pixiedraw2/assets/icons/draw2-icons.svg');
    return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="${sprite}#icon-${symbolId}"></use></svg>`;
  }

  function isStandalonePage() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.includes('/projects/')) return false;
    return /(?:^|\/)(?:pixiedraw|pixiedraw2|pixiee-lens|pixfind|qr|qr-maker|maoitu)(?:\/|\/index\.html)?$/.test(path);
  }

  function currentSection() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.includes('/community/') || path.includes('/post/')) return 'community';
    if (path.includes('/market/')) return 'market';
    if (path.includes('/account/')) return 'account';
    if (path.includes('/studio/')) return 'studio';
    if (path.includes('/qr/') || path.includes('/qr-maker/')) return 'qr';
    if (path.includes('/pixiee-lens/')) return 'lens';
    if (path.includes('/pixfind/')) return 'pixfind';
    if (path.includes('/maoitu/')) return 'maoitu';
    if (path === '/' || path.endsWith('/index.html')) return 'home';
    return '';
  }

  function ensureSharedSiteStyles() {
    if (!document.querySelector('link[data-pixieed-shared-site-shell="true"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.dataset.pixieedSharedSiteShell = 'true';
      link.href = rootAsset('site/shared-app-shell.css?v=20260825-shared-app-shell8');
      document.head.appendChild(link);
    }

    if (!document.querySelector('link[data-pixieed-public-design-system="true"]')) {
      const designLink = document.createElement('link');
      designLink.rel = 'stylesheet';
      designLink.dataset.pixieedPublicDesignSystem = 'true';
      designLink.href = rootAsset('site/public-design-system.css?v=20260825-public-shell15');
      document.head.appendChild(designLink);
    }
  }

  function ensureSharedSiteHeader() {
    if (isStandalonePage() || document.querySelector('.draw2-home-header, .pixieed-site-header')) return;
    ensureSharedSiteStyles();

    const current = currentSection();
    document.body.classList.add('pixieed-public-shell');
    document.body.dataset.pixieedPublicSection = current || 'info';
    const header = document.createElement('header');
    header.className = 'pixieed-site-header';
    header.setAttribute('aria-label', 'PiXiEED共通ナビゲーション');
    header.innerHTML = `
      <div class="pixieed-site-header__inner">
        <div class="pixieed-site-header__brand-row">
          <a class="pixieed-site-header__brand" href="${rootAsset('index.html')}" aria-label="PiXiEEDstudio ホーム">
            <span class="pixieed-site-header__brand-mark"><img src="${rootAsset('pixiedraw2/assets/brand/pixieed-logo-48.png')}" alt="PiXiEEDstudio"></span>
            <span class="pixieed-site-header__brand-copy"><strong>PiXiEEDstudio</strong><small>CREATIVE WORKSPACE</small></span>
          </a>
          <button class="pixieed-site-header__collapse" type="button" data-pixieed-shell-toggle aria-label="メニューを折りたたむ" aria-expanded="true">‹</button>
        </div>
        <nav class="pixieed-site-header__nav" aria-label="主要ページ">
          <a href="${rootAsset('index.html')}" data-section="home"><span class="pixieed-site-header__nav-icon">${navIcon('view')}</span><span data-i18n-key="home">ホーム</span></a>
          <a href="${rootAsset('studio/')}" data-section="studio"><span class="pixieed-site-header__nav-icon">${navIcon('pen')}</span><span>PiXiEEDstudio</span></a>
          <a href="${rootAsset('community/')}" data-section="community"><span class="pixieed-site-header__nav-icon">${navIcon('star')}</span><span data-i18n-key="community">コミュニティ</span></a>
          <a href="${rootAsset('market/')}" data-section="market"><span class="pixieed-site-header__nav-icon">${navIcon('folder')}</span><span data-i18n-key="market">マーケット</span></a>
          <a href="${rootAsset('account/index.html')}" data-section="account"><span class="pixieed-site-header__nav-icon">${navIcon('inspector')}</span><span data-i18n-key="account">マイページ</span></a>
          <details class="pixieed-site-header__tool-group">
            <summary><span class="pixieed-site-header__nav-icon">${navIcon('tools')}</span><span data-i18n-key="tools">ツール</span></summary>
            <div class="pixieed-site-header__tool-links">
              <a href="${rootAsset('qr/')}" data-tool-section="qr"><span data-i18n-key="toolQrNav">QR</span></a>
              <a href="${rootAsset('pixiee-lens/')}" data-tool-section="lens"><span data-i18n-key="toolLensNav">PiXiEELENS</span></a>
              <a href="${rootAsset('pixfind/')}" data-tool-section="pixfind"><span data-i18n-key="toolPixfindNav">PiXFiND</span></a>
              <a href="${rootAsset('maoitu/')}" data-tool-section="maoitu"><span data-i18n-key="toolMaoituNav">まおいつ</span></a>
            </div>
          </details>
        </nav>
        <div class="pixieed-site-header__actions">
          <button class="pixieed-site-header__language" type="button" data-pixieed-locale-toggle aria-label="表示言語: 日本語">English</button>
          <a href="${rootAsset('account/index.html')}" data-auth-entry data-i18n-key="login">ログイン</a>
          <a class="pixieed-site-header__primary" href="${rootAsset('studio/')}" data-i18n-key="create">今すぐ作る</a>
        </div>
      </div>`;

    const activeKey = current;
    header.querySelectorAll('[data-section]').forEach((link) => {
      if (link.dataset.section === activeKey) link.setAttribute('aria-current', 'page');
    });
    header.querySelectorAll('[data-tool-section]').forEach((link) => {
      if (link.dataset.toolSection === activeKey) link.setAttribute('aria-current', 'page');
    });
    if (header.querySelector('[data-tool-section][aria-current="page"]')) {
      const group = header.querySelector('.pixieed-site-header__tool-group');
      if (group) group.open = true;
    }
    document.body.prepend(header);
  }

  function removeSharedHeader() {
    document.querySelectorAll('.site-header, header[aria-label="top-nav"]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.classList.contains('draw2-home-header')) return;
      node.remove();
    });
    // Some information pages used a bare top-level header without the legacy
    // class or aria label. Remove only that shell-level header; nested content
    // headers remain part of the page's document structure.
    document.querySelectorAll('body > header:not(.pixieed-site-header)').forEach((node) => {
      if (!(node instanceof HTMLElement) || node.classList.contains('draw2-home-header')) return;
      node.remove();
    });
  }

  function ensureSharedAuthPanelScript() {
    if (window.pixieedSharedAuthPanel || document.querySelector('script[data-pixieed-shared-auth="true"]')) {
      return;
    }
    const script = document.createElement('script');
    script.async = false;
    script.dataset.pixieedSharedAuth = 'true';
    script.src = asset('./shared-auth-panel.js?v=20260722-auth-form1');
    document.head.appendChild(script);
  }

  function ensureSharedLocaleScript() {
    if (window.PiXiEEDLocale) return Promise.resolve(window.PiXiEEDLocale);
    const existing = document.querySelector('script[data-pixieed-shared-locale="true"]');
    if (existing) {
      return new Promise((resolve) => {
        if (window.PiXiEEDLocale) {
          resolve(window.PiXiEEDLocale);
          return;
        }
        existing.addEventListener('load', () => resolve(window.PiXiEEDLocale), { once: true });
        existing.addEventListener('error', () => resolve(undefined), { once: true });
      });
    }
    const script = document.createElement('script');
    script.async = false;
    script.dataset.pixieedSharedLocale = 'true';
    script.src = asset('./shared-locale.js?v=20260825-locale21');
    return new Promise((resolve) => {
      script.addEventListener('load', () => resolve(window.PiXiEEDLocale), { once: true });
      script.addEventListener('error', () => resolve(undefined), { once: true });
      document.head.appendChild(script);
    });
  }

  function setupPublicShellToggle() {
    const button = document.querySelector('[data-pixieed-shell-toggle]');
    if (!(button instanceof HTMLButtonElement) || button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    const storageKey = 'pixieed:public-nav-collapsed:v1';
    const setCollapsed = (collapsed) => {
      document.body.classList.toggle('is-public-nav-collapsed', collapsed);
      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute('aria-label', collapsed ? 'メニューを展開する' : 'メニューを折りたたむ');
      button.textContent = collapsed ? '›' : '‹';
    };
    let initial = false;
    try {
      initial = window.localStorage.getItem(storageKey) === 'true';
    } catch (_error) {
      initial = false;
    }
    setCollapsed(initial);
    button.addEventListener('click', () => {
      const next = !document.body.classList.contains('is-public-nav-collapsed');
      setCollapsed(next);
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch (_error) {
        // A restricted storage context should not block the navigation.
      }
    });
  }

  function setupLocaleToggle(localeApi) {
    const button = document.querySelector('[data-pixieed-locale-toggle]');
    if (!(button instanceof HTMLButtonElement) || !localeApi || button.dataset.localeBound === 'true') return;
    button.dataset.localeBound = 'true';
    button.addEventListener('click', () => localeApi.toggle());
  }

  async function init() {
    removeSharedHeader();
    ensureSharedAuthPanelScript();
    const localeApi = await ensureSharedLocaleScript();
    ensureSharedSiteHeader();
    setupPublicShellToggle();
    // The shared header is created after the locale script resolves. Apply once
    // more so its freshly-created labels use the persisted language as well.
    localeApi?.apply(localeApi.get(), false);
    setupLocaleToggle(localeApi);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
