const STATIC_INFORMATION_ROUTES = new Map([
  ['index.html', '/'],
  ['tools/index.html', '/tools/'],
  ['about/index.html', '/about/'],
  ['guide/index.html', '/guide/'],
  ['help/index.html', '/help/'],
  ['glossary/index.html', '/glossary/'],
  ['stores/index.html', '/stores/'],
  ['stores/ecowashcafe-nakanoshima.html', '/stores/ecowashcafe-nakanoshima.html'],
  ['events/index.html', '/events/'],
]);

export const INFORMATION_AUTO_ADS_POLICY_SCRIPT = '<script src="/js/adsense-offerwall-policy.js?rev=20261016-no-offerwall-1"></script>';
export const INFORMATION_AUTO_ADS_MODULE = '<script type="module" src="/js/information-auto-ads.mjs?rev=20261020-info-side-1"></script>';

function normalizeSourceRoute(path) {
  const value = String(path || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!value || value.split('/').some(part => part === '..' || part === '')) return '';
  return STATIC_INFORMATION_ROUTES.get(value)
    || (/^events\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(value) ? `/${value.replace(/\/index\.html$/, '/')}` : '');
}

function rewriteBodyMarker(html, route) {
  return html.replace(/<body\b([^>]*)>/i, (whole, attributes) => {
    const markerPattern = /\sdata-information-auto-ads(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/i;
    if (markerPattern.test(attributes)) {
      return `<body${attributes.replace(markerPattern, ` data-information-auto-ads="${route}"`)}>`;
    }
    return `<body${attributes} data-information-auto-ads="${route}">`;
  });
}

function withOnePolicyScript(html) {
  let found = false;
  return html.replace(/<script\b(?=[^>]*\bsrc\s*=\s*(["'])\/js\/adsense-offerwall-policy\.js(?:\?[^"']*)?\1)[^>]*>\s*<\/script>/gi, () => {
    if (found) return '';
    found = true;
    return INFORMATION_AUTO_ADS_POLICY_SCRIPT;
  });
}

/** Opt approved source pages into the side-ad loader at build time only. */
export function addInformationAutoAds(html, sourcePath = '', { generatedEventRoutes = new Set() } = {}) {
  if (typeof html !== 'string') throw new TypeError('Page HTML must be a string');
  const route = normalizeSourceRoute(sourcePath);
  if (!route || (/^\/events\/[a-z0-9]/.test(route) && route !== '/events/' && !generatedEventRoutes.has(sourcePath))) {
    return { html, added: false, skipped: true };
  }
  if (!/<head\b[^>]*>[\s\S]*?<\/head\s*>/i.test(html) || !/<body\b[^>]*>[\s\S]*?<\/body\s*>/i.test(html)) {
    return { html, added: false, skipped: true };
  }

  let output = rewriteBodyMarker(html, route);
  output = withOnePolicyScript(output);
  if (!/\bsrc\s*=\s*["']\/js\/adsense-offerwall-policy\.js(?:\?[^"']*)?["']/i.test(output)) {
    output = output.replace(/<\/body\s*>/i, `${INFORMATION_AUTO_ADS_POLICY_SCRIPT}\n</body>`);
  }
  if (!/\bsrc\s*=\s*["']\/js\/information-auto-ads\.mjs(?:\?[^"']*)?["']/i.test(output)) {
    output = output.replace(/<\/body\s*>/i, `${INFORMATION_AUTO_ADS_MODULE}\n</body>`);
  }
  return { html: output, added: output !== html, skipped: false };
}
