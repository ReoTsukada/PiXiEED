(function () {
  const script = document.currentScript;
  const doc = document;
  const body = doc.body;
  if (!script || !body) return;

  const pageUrl = new URL(window.location.href);
  const pageDirUrl = new URL('./', pageUrl);
  const rootUrl = new URL('../', script.src);
  const currentTab = resolveCurrentTab(pageUrl.pathname);

  injectStyles();
  replaceFooter();
  replaceBottomNav();

  function resolveCurrentTab(pathname) {
    const path = String(pathname || '').toLowerCase();
    if (path.includes('/contest/')) return 'contest';
    if (path.includes('/portfolio/')) return 'portfolio';
    if (path.includes('/talk/')) return 'talk';
    return 'home';
  }

  function relHref(targetPath) {
    const targetUrl = new URL(targetPath, rootUrl);
    return toRelativeHref(pageDirUrl, targetUrl);
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
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', '下部ナビ');

    getNavItems().forEach((entry) => {
      const item = doc.createElement(entry.disabled ? 'span' : 'a');
      item.className = `bottom-nav__item${entry.key === currentTab ? ' is-active' : ''}`;
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
      { label: '会話', disabled: true },
      { label: '企業', path: 'portfolio/index.html' },
      { label: '利用規約', path: 'terms/index.html' },
      { label: 'プライバシーポリシー', path: 'privacy/index.html' }
    ];
  }

  function getNavItems() {
    return [
      { key: 'home', label: 'ホーム', path: 'index.html', icon: 'FooterIcon1.png' },
      { key: 'contest', label: '広場', path: 'contest/', icon: 'FooterIcon2.png' },
      { key: 'talk', label: '会話', disabled: true, icon: 'pixiedraw/assets/icons/talk.png' },
      { key: 'portfolio', label: '企業', path: 'portfolio/index.html', icon: 'FooterIcon4.png' }
    ];
  }

  function injectStyles() {
    if (doc.getElementById('pixieed-shared-bottom-nav-style')) return;
    const style = doc.createElement('style');
    style.id = 'pixieed-shared-bottom-nav-style';
    style.textContent = `
      body{
        padding-bottom:max(132px, calc(132px + env(safe-area-inset-bottom, 0px))) !important;
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
        flex:1;
        text-align:center;
        color:#cbd5e1;
        text-decoration:none;
        font-weight:700;
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:4px;
        font-size:12px;
        padding:8px 0;
      }
      .bottom-nav__item .icon{
        width:22px;
        height:22px;
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
    `;
    doc.head.appendChild(style);
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
    return relative || './';
  }
})();
