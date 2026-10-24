/** Add one small, crawlable editor entrance to ordinary published pages. */

const LABELS = Object.freeze({
  event: 'イベントのひらめきを描く',
  creation: '自分のドット絵を描く',
  general: 'ドット絵を描いてみる'
});

/** Explicit route exclusions, with their page purpose kept reviewable. */
export const DRAW_CTA_EXCLUDED_ROUTES = Object.freeze({
  '/404.html': 'error page',
  '/admin/': 'administrative surface',
  '/admanager-rewarded-test/': 'ad implementation test',
  '/camera-media-test.html': 'media conversion test workspace',
  '/camera/': 'one-action camera introduction',
  '/collection/': 'personal collection',
  '/draw/': 'the destination editor',
  '/draw/about/': 'one-action editor introduction',
  '/audio/': 'audio editor',
  '/pixel-camera.html': 'camera editor entry',
  '/pixel-camera-studio.html': 'camera studio workspace',
  '/output/work/': 'output workspace',
  '/telescope/': 'interactive tool',
  '/game/': 'interactive game creator',
  '/jigsaw/': 'interactive puzzle tool',
  '/hidden-object/': 'interactive problem creator',
  '/spot-difference/': 'interactive problem creator',
  '/pixfind/': 'interactive game',
  '/play/hidden-object/': 'interactive game',
  '/play/spot-difference/': 'interactive game',
  '/profile/': 'personal account surface',
  '/privacy/': 'legal and privacy information',
  '/terms/': 'legal terms information',
  '/pass/': 'access and reward flow',
  '/shops/': 'retired route',
  '/globe-prototype.html': 'prototype',
  '/PiXiEEDraw/': 'legacy editor entry',
  '/pixiedraw/': 'legacy editor entry',
  '/pixiedraw2/': 'legacy editor entry',
  '/studio/': 'legacy editor entry',
  '/home/': 'legacy home redirect'
});

const EXCLUDED_PREFIXES = Object.freeze([
  ['/draw/', 'editor route'],
  ['/audio/', 'audio editor route'],
  ['/play/', 'interactive game route'],
  ['/output/work/', 'output workspace route']
]);

function routeForFile(file) {
  const normalized = String(file).replaceAll('\\', '/').replace(/^\/+/, '');
  if (normalized === 'index.html') return '/';
  if (normalized.endsWith('/index.html')) return `/${normalized.slice(0, -'index.html'.length)}`;
  return `/${normalized}`;
}

function contextForRoute(route) {
  if (route === '/books/') return null; // The catalog owns a dedicated first-view CTA.
  if (route.startsWith('/events/')) return 'event';
  if (/^\/(?:works|stores|globe)(?:\/|\.|$)/.test(route)) return 'creation';
  return 'general';
}

function insertLensToolbarCta(html) {
  const actions = /(<(?:div|nav)\b[^>]*class\s*=\s*["'][^"']*\bhud-top__actions\b[^"']*["'][^>]*>)/i.exec(html);
  if (!actions) return html;
  const index = actions.index + actions[0].length;
  const link = '<a class="site-draw-cta__link site-draw-cta--lens" aria-label="ブラウザで使えるドット絵エディターを開く" data-draw-cta data-draw-context="creation" href="/draw/?workspace=1">ドット絵エディターで描く</a>\n';
  return `${html.slice(0, index)}\n${link}${html.slice(index)}`;
}

function skipReason(route, html) {
  if (DRAW_CTA_EXCLUDED_ROUTES[route]) return DRAW_CTA_EXCLUDED_ROUTES[route];
  if (/<script\b[^>]*src=["']\/js\/site-header\.mjs(?:\?[^"']*)?["']/i.test(html)) return 'shared navigation already provides the Create destination';
  for (const [prefix, reason] of EXCLUDED_PREFIXES) if (route.startsWith(prefix)) return reason;
  if (route === '/' || route === '/tools/') return 'existing primary Draw action is authored in the page';
  if (route === '/output/' && /<a\b[^>]*href\s*=\s*["']\/draw\/(?:\?workspace=1)?["']/i.test(html)) return 'existing conversion guide link';
  if (route === '/books/') return 'catalog CTA is authored by the books generator';
  if (/<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*\bnoindex\b/i.test(html)
    || /<meta\b[^>]*content\s*=\s*["'][^"']*\bnoindex\b[^"']*["'][^>]*name\s*=\s*["']robots["']/i.test(html)) return 'noindex utility page';
  if (/\bdata-admin-page\b/i.test(html)) return 'administrative surface';
  // These are normal browsing routes whose maps happen to be iframes. The
  // standalone prototype/embed document is excluded explicitly above.
  if (!['/globe/', '/stores/'].includes(route) && /<iframe\b|<object\b|<embed\b/i.test(html)) return 'embedded content page';
  if (/\bdata-draw-cta\b/i.test(html)) return 'page already has an authored CTA';
  return '';
}

function markup(context) {
  const label = LABELS[context] || LABELS.general;
  return `\n<nav class="site-draw-cta" data-draw-cta data-draw-context="${context}" aria-label="ドット絵をつくる"><span class="site-draw-cta__description">ブラウザで使えるドット絵エディター</span><a class="site-draw-cta__link" href="/draw/?workspace=1"><span>${label}</span><small class="site-draw-cta__brand">PiXiEEDraw</small><span aria-hidden="true">→</span></a></nav>\n`;
}

function insertAfterHeader(html, block) {
  const headerClose = /<\/header\s*>/i.exec(html);
  if (headerClose) {
    const index = headerClose.index + headerClose[0].length;
    return `${html.slice(0, index)}${block}${html.slice(index)}`;
  }
  const mainOpen = /<main\b/i.exec(html);
  if (mainOpen) return `${html.slice(0, mainOpen.index)}${block}${html.slice(mainOpen.index)}`;
  const bodyOpen = /<body\b[^>]*>/i.exec(html);
  if (bodyOpen) {
    const index = bodyOpen.index + bodyOpen[0].length;
    return `${html.slice(0, index)}${block}${html.slice(index)}`;
  }
  return html;
}

function ensureStylesheet(html) {
  if (/href\s*=\s*["']\/css\/site-draw-cta\.css(?:\?[^"']*)?["']/i.test(html)) return html;
  const stylesheet = '<link rel="stylesheet" href="/css/site-draw-cta.css?rev=20261014-route-cta-1">\n';
  if (/<\/head\s*>/i.test(html)) return html.replace(/<\/head\s*>/i, `${stylesheet}</head>`);
  return html.replace(/<head\b[^>]*>/i, match => `${match}\n${stylesheet}`);
}

/**
 * Return a static HTML link for eligible public routes. Reapplying the
 * transformation is safe, and the original source remains untouched.
 */
export function addSiteDrawCta(html, file) {
  if (typeof html !== 'string' || !/\.html?$/i.test(String(file))) return { html, added: false, reason: 'not an HTML page' };
  const route = routeForFile(file);
  if (route === '/pixiee-lens/') {
    const reason = skipReason(route, html);
    if (reason) return { html, added: false, reason, route };
    const withCta = insertLensToolbarCta(html);
    if (withCta === html) return { html, added: false, reason: 'lens toolbar not found', route };
    return { html: ensureStylesheet(withCta), added: true, route, context: 'creation', placement: 'toolbar' };
  }
  const reason = skipReason(route, html);
  if (reason) return { html, added: false, reason, route };
  const context = contextForRoute(route);
  if (!context) return { html, added: false, reason: 'route-specific CTA is owned elsewhere', route };
  const withCta = insertAfterHeader(html, markup(context));
  if (withCta === html) return { html, added: false, reason: 'no insertion point', route };
  return { html: ensureStylesheet(withCta), added: true, route, context };
}
