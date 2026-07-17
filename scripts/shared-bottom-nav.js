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

  if (!currentPath.includes('/projects/') && /(?:^|\/)(?:pixiedraw|pixieedrawdev)(?:\/|\/index\.html)?$/.test(currentPath)) {
    body.dataset.pixieedPage = 'pixiedraw';
    doc.documentElement.dataset.pixieedPage = 'pixiedraw';
  } else if (!currentPath.includes('/projects/') && /(?:^|\/)pixiee-lens(?:\/|\/index\.html)?$/.test(currentPath)) {
    body.dataset.pixieedPage = 'pixiee-lens';
    doc.documentElement.dataset.pixieedPage = 'pixiee-lens';
  } else if (!currentPath.includes('/projects/') && /(?:^|\/)maoitu(?:\/|\/index\.html)?$/.test(currentPath)) {
    body.dataset.pixieedPage = 'maoitu';
    doc.documentElement.dataset.pixieedPage = 'maoitu';
  }
  if (!isStandaloneToolOrGamePage()) {
    body.classList.add('pixieed-seamless-page');
  }

  applyResponsivePageState();
  injectStyles();
  ensureCommonTabBarController();
  replaceFooter();
  replaceBottomNav();
  if (script.dataset.pixieedFooterAd !== 'false') {
    ensureFooterAdController();
  }

  function resolveCurrentTab(pathname) {
    const path = String(pathname || '').toLowerCase();
    if (path.includes('/pixiedraw/') || path.includes('/pixieedrawdev/')) return 'draw';
    if (path.includes('/market/')) return 'market';
    if (path.includes('/qr/') || path.includes('/qr-maker/')) return 'qr';
    if (path.includes('/pixiee-lens/')) return 'camera';
    if (/(?:^|\/)account(?:\/|\/index\.html)?$/.test(path)) return '';
    return 'home';
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
    controller.src = relHref('scripts/bottom-nav-footer-ad.js?v=2026.07.17-unified-chrome10');
    doc.body.appendChild(controller);
  }

  function ensureCommonTabBarController() {
    if (window.__PIXIEED_COMMON_TAB_BAR__ || doc.querySelector('script[data-pixieed-common-tab-bar="true"]')) {
      return;
    }
    const controller = doc.createElement('script');
    controller.defer = true;
    controller.dataset.pixieedCommonTabBar = 'true';
    controller.src = relHref('scripts/shared-tab-bar.js?v=2026.07.17-market-public32');
    doc.body.appendChild(controller);
  }

  function isPixiedrawPage() {
    return !currentPath.includes('/projects/') && /(?:^|\/)(?:pixiedraw|pixieedrawdev)(?:\/|\/index\.html)?$/.test(currentPath);
  }

  function isStandaloneToolOrGamePage() {
    if (currentPath.includes('/projects/')) {
      return false;
    }
    return /(?:^|\/)(?:pixiedraw|pixieedrawdev|pixiee-lens|qr|qr-maker|maoitu|contest)(?:\/|\/index\.html)?$/.test(currentPath);
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
        span.textContent = entry.label;
        links.appendChild(span);
        return;
      }
      const link = doc.createElement('a');
      link.className = 'pixieed-footer-link';
      link.href = relHref(entry.path);
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
    nav.setAttribute('aria-label', '下部ナビ');

    getNavItems().forEach((entry) => {
      const item = doc.createElement(entry.disabled ? 'span' : 'a');
      item.className = `bottom-nav__item${entry.primary ? ' bottom-nav__item--primary' : ''}${entry.key === currentTab ? ' is-active' : ''}`;
      item.dataset.tab = entry.key;
      if (entry.disabled) {
        item.setAttribute('aria-disabled', 'true');
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
      label.textContent = entry.label;

      item.append(icon, label);
      nav.appendChild(item);
    });

    body.appendChild(nav);
  }

  function getFooterLinks() {
    return [
      { label: 'PiXiEEDraw', path: 'pixiedraw/index.html' },
      { label: 'PiXiEELENS', path: 'pixiee-lens/index.html' },
      { label: 'マーケット', path: 'market/index.html' },
      { label: 'QR', path: 'qr/index.html' },
      { label: 'まおいつ', path: 'maoitu/index.html' },
      { label: '用語集', path: 'glossary/index.html' },
      { label: '企業', path: 'portfolio/index.html' },
      { label: '利用規約', path: 'terms/index.html' },
      { label: 'プライバシーポリシー', path: 'privacy/index.html' },
      { label: '特定商取引法に基づく表記', path: 'legal/index.html' }
    ];
  }

  function getNavItems() {
    return [
      { key: 'home', label: 'ホーム', path: 'index.html', icon: 'HOME.png?v=2026.07.17-icons2' },
      { key: 'market', label: 'マーケット', path: 'market/index.html', icon: 'Market.png' },
      { key: 'draw', label: 'PiXiEEDraw', path: 'pixiedraw/index.html', icon: 'icon/icon-192-4.png', primary: true },
      { key: 'camera', label: 'カメラ', path: 'pixiee-lens/index.html', icon: 'Camera.png' },
      { key: 'qr', label: 'QR', path: 'qr/index.html', icon: 'QR.png' }
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
      body[data-pixieed-page="pixiedraw"][data-pixieed-mobile-chrome="true"] .app{
        padding-bottom:max(84px, calc(var(--pixieed-shared-bottom-nav-height) + 16px + env(safe-area-inset-bottom, 0px))) !important;
      }
      @media (orientation: landscape){
        body:not([data-pixieed-page="pixiedraw"]):not([data-pixieed-page="pixiee-lens"]):not([data-pixieed-page="maoitu"]){
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
        body .bottom-nav{
          top:0 !important;
          right:0 !important;
          bottom:0 !important;
          left:auto !important;
          width:var(--pixieed-shared-side-nav-width) !important;
          height:var(--viewport-height, var(--app-height, 100dvh)) !important;
          min-height:var(--viewport-height, var(--app-height, 100dvh)) !important;
          max-height:var(--viewport-height, var(--app-height, 100dvh)) !important;
          flex-direction:column !important;
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
        gap:10px;
        width:100%;
        max-width:min(1200px, 100%);
        margin:0 auto 14px;
        padding:0 0 4px;
      }
      .pixieed-shared-footer__copy{
        margin:0;
      }
      .footer-links{
        display:flex;
        flex-wrap:wrap;
        justify-content:center;
        gap:12px;
        padding:0;
        margin:0;
        list-style:none;
      }
      .pixieed-footer-link,
      .footer-links a,
      .footer-links span{
        color:#cbd5e1;
        text-decoration:none;
        border:1px solid rgba(255,255,255,0.16);
        border-radius:10px;
        padding:6px 10px;
        background:rgba(255,255,255,0.04);
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
        background:rgba(255,255,255,0.08);
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
      }
    `;
    doc.head.appendChild(style);
  }

  window.addEventListener('resize', applyResponsivePageState, { passive: true });
  window.addEventListener('orientationchange', applyResponsivePageState, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', applyResponsivePageState, { passive: true });
  }

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
