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
  const currentTab = resolveCurrentTab(pageUrl.pathname);
  const navMode = script.dataset.pixieedNavMode || script.dataset.navMode || 'default';
  const isToolNav = navMode === 'tool';

  injectStyles();
  if (isToolNav) {
    body.dataset.pixieedSharedNavMode = 'tool';
  } else {
    replaceFooter();
  }
  replaceBottomNav();
  if (!isToolNav) {
    ensureFooterAdController();
  }

  function resolveCurrentTab(pathname) {
    const path = String(pathname || '').toLowerCase();
    if (path.includes('/pixiedraw/')) return 'draw';
    if (path.includes('/qr/')) return 'qr';
    if (path.includes('/pixiee-lens/')) return 'camera';
    if (/(?:^|\/)account(?:\/|\/index\.html)?$/.test(path)) return 'profile';
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
    controller.src = relHref('scripts/bottom-nav-footer-ad.js');
    doc.body.appendChild(controller);
  }

  function replaceFooter() {
    doc.querySelectorAll('footer').forEach((node) => {
      if (node.classList.contains('ad-footer')) {
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
    nav.className = `bottom-nav${isToolNav ? ' bottom-nav--tool' : ''}`;
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
      if (entry.useAvatar) {
        const img = doc.createElement('img');
        img.alt = '';
        img.src = getProfileNavAvatarSrc();
        img.dataset.profileNavAvatar = 'true';
        icon.appendChild(img);
      } else {
        const img = doc.createElement('img');
        img.alt = '';
        img.src = relHref(entry.icon);
        icon.appendChild(img);
      }

      const label = doc.createElement('span');
      label.className = 'bottom-nav__label';
      label.textContent = entry.label;

      item.append(icon, label);
      nav.appendChild(item);
    });

    body.appendChild(nav);
    syncProfileNavAvatar();
  }

  function getFooterLinks() {
    return [
      { label: '会話', disabled: true },
      { label: '企業', path: 'portfolio/index.html' },
      { label: '利用規約', path: 'terms/index.html' },
      { label: 'プライバシーポリシー', path: 'privacy/index.html' },
      { label: '特定商取引法に基づく表記', path: 'legal/index.html' }
    ];
  }

  function getNavItems() {
    return [
      { key: 'home', label: 'ホーム', path: 'index.html', icon: 'FooterIcon1.png' },
      { key: 'qr', label: 'QR', path: 'qr/index.html', icon: 'pixiedraw/assets/icons/tool-qr-edit.svg' },
      { key: 'draw', label: '描く', path: 'pixiedraw/index.html', icon: 'icon/icon-192-4.png', primary: true },
      { key: 'camera', label: 'カメラ', path: 'pixiee-lens/index.html', icon: 'pixiedraw/assets/icons/pixieelensicon_frame_01.png' },
      { key: 'profile', label: 'マイページ', path: 'account/index.html', icon: 'character-dots/maousama.png', useAvatar: true }
    ];
  }

  function getProfileNavAvatarSrc() {
    const brandAvatar = doc.querySelector('#brandAvatar img');
    if (brandAvatar?.getAttribute('src')) {
      return brandAvatar.getAttribute('src');
    }
    return relHref('character-dots/maousama.png');
  }

  function syncProfileNavAvatar() {
    const src = getProfileNavAvatarSrc();
    doc.querySelectorAll('[data-profile-nav-avatar="true"]').forEach((img) => {
      img.setAttribute('src', src);
    });
  }

  function injectStyles() {
    if (doc.getElementById('pixieed-shared-bottom-nav-style')) return;
    const style = doc.createElement('style');
    style.id = 'pixieed-shared-bottom-nav-style';
    style.textContent = `
      body{
        padding-bottom:${isToolNav ? '0' : 'max(132px, calc(132px + env(safe-area-inset-bottom, 0px)))'} !important;
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
      .bottom-nav{
        position:fixed;
        bottom:0;
        left:0;
        right:0;
        height:68px;
        background:rgba(11,18,36,0.96);
        border-top:1px solid rgba(255,255,255,0.08);
        display:flex;
        justify-content:space-around;
        align-items:center;
        z-index:80;
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
      .bottom-nav__item[data-tab="profile"] .icon{
        border-radius:999px;
        overflow:hidden;
        background:rgba(255,255,255,0.08);
        border:1px solid rgba(255,255,255,0.16);
        padding:2px;
      }
      .bottom-nav--tool{
        left:calc(env(safe-area-inset-left, 0px) + 8px);
        right:calc(env(safe-area-inset-right, 0px) + 8px);
        bottom:calc(env(safe-area-inset-bottom, 0px) + 8px);
        height:56px;
        max-width:440px;
        margin:0 auto;
        border:1px solid rgba(255,255,255,0.12);
        border-radius:18px;
        background:rgba(7,12,24,0.88);
        box-shadow:0 14px 32px rgba(0,0,0,0.34);
        z-index:70;
      }
      .bottom-nav--tool .bottom-nav__item{
        font-size:10px;
        gap:2px;
        padding:6px 1px;
      }
      .bottom-nav--tool .bottom-nav__item .icon{
        width:21px;
        height:21px;
      }
      .bottom-nav--tool .bottom-nav__item--primary{
        transform:none;
      }
      .bottom-nav--tool .bottom-nav__item--primary .icon{
        width:28px;
        height:28px;
        border-radius:11px;
        padding:5px;
        box-shadow:0 7px 16px rgba(37,99,235,0.26), inset 0 1px 0 rgba(255,255,255,0.2);
      }
      body[data-pixieed-shared-nav-mode="tool"] .hud-bottom{
        bottom:calc(var(--hud-padding, 18px) + var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 66px);
      }
      body[data-pixieed-shared-nav-mode="tool"] .qr-readout{
        bottom:calc(var(--hud-padding, 18px) + var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + var(--vv-offset-bottom, 0px) + 72px);
      }
      body[data-pixieed-shared-nav-mode="tool"] .camera-permission__panel{
        margin-bottom:66px;
      }
      @media (orientation: landscape){
        .bottom-nav--tool{
          right:auto;
          left:calc(env(safe-area-inset-left, 0px) + 10px);
          bottom:calc(env(safe-area-inset-bottom, 0px) + 10px);
          width:min(150px, calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 20px));
          max-width:150px;
          height:50px;
        }
        .bottom-nav--tool .bottom-nav__label{
          position:absolute;
          width:1px;
          height:1px;
          padding:0;
          margin:-1px;
          overflow:hidden;
          clip:rect(0, 0, 0, 0);
          white-space:nowrap;
          border:0;
        }
        body[data-pixieed-shared-nav-mode="tool"] .hud-bottom,
        body[data-pixieed-shared-nav-mode="tool"] .qr-readout{
          bottom:calc(var(--hud-padding, 18px) + var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + var(--vv-offset-bottom, 0px));
        }
      }
    `;
    doc.head.appendChild(style);
  }

  window.addEventListener('storage', (event) => {
    if (!event.key || !event.key.startsWith('pixieed_')) return;
    syncProfileNavAvatar();
  });
  window.addEventListener('pixieed:profile-updated', syncProfileNavAvatar);

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
