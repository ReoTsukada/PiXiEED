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
    if (path === '/' || path.endsWith('/index.html')) return 'home';
    return '';
  }

  function ensureSharedSiteStyles() {
    if (document.querySelector('link[data-pixieed-shared-site-shell="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.pixieedSharedSiteShell = 'true';
    link.href = rootAsset('site/shared-app-shell.css?v=20260824-shared-app-shell1');
    document.head.appendChild(link);
  }

  function ensureSharedSiteHeader() {
    if (isStandalonePage() || document.querySelector('.draw2-home-header, .pixieed-site-header')) return;
    ensureSharedSiteStyles();

    const current = currentSection();
    const header = document.createElement('header');
    header.className = 'pixieed-site-header';
    header.setAttribute('aria-label', 'PiXiEED共通ナビゲーション');
    header.innerHTML = `
      <div class="pixieed-site-header__inner">
        <a class="pixieed-site-header__brand" href="${rootAsset('index.html')}" aria-label="PiXiEED ホーム">
          <span class="pixieed-site-header__brand-mark"><img src="${rootAsset('pixiedraw2/assets/brand/pixieed-logo-48.png')}" alt="PiXiEED"></span>
          <span class="pixieed-site-header__brand-copy"><strong>PiXiEED</strong><small>CREATIVE WORKSPACE</small></span>
        </a>
        <nav class="pixieed-site-header__nav" aria-label="主要ページ">
          <a href="${rootAsset('pixiedraw2/index.html')}" data-section="studio">制作</a>
          <a href="${rootAsset('community/')}" data-section="community">コミュニティ</a>
          <a href="${rootAsset('market/')}" data-section="market">マーケット</a>
          <a href="${rootAsset('account/index.html')}" data-section="account">マイページ</a>
        </nav>
        <div class="pixieed-site-header__actions">
          <a href="${rootAsset('account/index.html')}" data-auth-entry>ログイン</a>
          <a class="pixieed-site-header__primary" href="${rootAsset('pixiedraw2/index.html')}">今すぐ作る</a>
        </div>
      </div>`;

    const activeKey = current === 'home' ? '' : current;
    header.querySelectorAll('[data-section]').forEach((link) => {
      if (link.dataset.section === activeKey) link.setAttribute('aria-current', 'page');
    });
    document.body.prepend(header);
  }

  function removeSharedHeader() {
    document.querySelectorAll('.site-header, header[aria-label="top-nav"]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.classList.contains('draw2-home-header')) return;
      node.remove();
    });
  }

  function ensureSharedAuthPanelScript() {
    if (window.pixieedSharedAuthPanel || document.querySelector('script[data-pixieed-shared-auth="true"]')) {
      return;
    }
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.pixieedSharedAuth = 'true';
    script.src = asset('./shared-auth-panel.js?v=20260722-auth-form1');
    document.head.appendChild(script);
  }

  function init() {
    removeSharedHeader();
    ensureSharedSiteHeader();
    ensureSharedAuthPanelScript();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
