import { PUBLIC_NAV_ITEMS, currentPublicNavKey } from './page-navigation.mjs?rev=20261024-common-tool-start-1';

const isToolPage = (body) => {
  if (!body) return false;
  if (body.hasAttribute('data-tool-short') || body.hasAttribute('data-tool-shell')
      || body.classList.contains('tool-shell') || body.classList.contains('creation-editor')
      || body.classList.contains('creation-suite') || body.querySelector('.pc-header, .lc-top, .hud-top__bar')) return true;
  return [...body.classList].some((name) => name.startsWith('app-page--tool-') && name !== 'app-page--tool-globe');
};

/** Mount the five ordinary public destinations once, outside editor operation bars and embedded frames. */
export function mountPublicNavigation({ document: doc = globalThis.document, window: win = globalThis.window } = {}) {
  if (!doc?.body || !win || win.top !== win.self || doc.body.hasAttribute('data-admin-page') || isToolPage(doc.body)) return null;

  let nav = doc.querySelector('.public-destination-nav');
  if (!nav) {
    nav = doc.querySelector('.mobile-nav') || doc.querySelector('nav.app-tabs');
    if (!nav) {
      nav = doc.createElement('nav');
      const header = doc.querySelector('.site-header, .event-site-header');
      const main = doc.querySelector('main');
      if (header) header.insertAdjacentElement('afterend', nav);
      else if (main) main.before(nav);
      else doc.body.prepend(nav);
    }
  }

  nav.className = 'mobile-nav public-destination-nav';
  doc.body.classList.add('has-public-destination-nav');
  nav.setAttribute('aria-label', 'メインナビゲーション');
  nav.innerHTML = PUBLIC_NAV_ITEMS.map(({ key, label, href, icon }) =>
    `<a data-public-nav="${key}" href="${href}" aria-label="${label}"><img src="/assets/icons/pixieed/${icon}.svg" alt=""><span class="app-tab-label">${label}</span></a>`
  ).join('');
  const current = currentPublicNavKey(win.location);
  nav.querySelectorAll('[data-public-nav]').forEach((link) => {
    if (link.dataset.publicNav === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  return nav;
}
