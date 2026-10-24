const PAGE_GUTTER_ROUTES = new Map([
  ['index.html', 'home'],
  ['welcome/index.html', 'home'],
  ['globe/index.html', 'content'],
  ['profile/index.html', 'content'],
  ['feed/index.html', 'home'],
  ['explore/index.html', 'home'],
  ['tools/index.html', 'listing'],
  ['about/index.html', 'content'],
  ['guide/index.html', 'content'],
  ['privacy/index.html', 'content'],
  ['help/index.html', 'legacy'],
  ['glossary/index.html', 'glossary'],
  ['stores/index.html', 'content'],
  ['stores/ecowashcafe-nakanoshima.html', 'content'],
  ['books/index.html', 'catalog'],
  ['pass/index.html', 'content'],
  ['events/index.html', 'events'],
  ['draw/index.html', 'tool-landing'],
  ['camera/index.html', 'tool-landing'],
  ['audio/index.html', 'tool-landing'],
  ['output/index.html', 'tool-landing'],
]);

const PAGE_GUTTERS_STYLESHEET = '<link rel="stylesheet" href="/css/page-gutters.css?rev=20261020-page-gutters-1" data-page-gutters-style>';

function routeKind(path, generatedEventRoutes = new Set()) {
  const normalized = String(path || '').replaceAll('\\', '/').replace(/^\.\//, '');
  const exact = PAGE_GUTTER_ROUTES.get(normalized);
  if (exact) return exact;
  if (generatedEventRoutes.has(normalized) && /^events\/[a-z0-9][a-z0-9-]*\/index\.html$/.test(normalized)) return 'events';
  return '';
}

/** Add the explicit static page-gutter opt-in and stylesheet to approved routes only. */
export function addPageGutters(html, path = '', { generatedEventRoutes = new Set() } = {}) {
  if (typeof html !== 'string') throw new TypeError('Page HTML must be a string');
  const kind = routeKind(path, generatedEventRoutes);
  if (!kind || !/<head\b[^>]*>[\s\S]*?<\/head\s*>/i.test(html) || !/<body\b[^>]*>/i.test(html)) {
    return { html, added: false, skipped: true };
  }

  let output = html.replace(/<body\b([^>]*)>/i, (whole, attributes) => {
    if (/\sdata-page-gutters(?:\s*=|\s|$)/i.test(attributes)) {
      return `<body${attributes.replace(/\sdata-page-gutters(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/i, ` data-page-gutters="${kind}"`)}>`;
    }
    return `<body${attributes} data-page-gutters="${kind}">`;
  });

  if (!/data-page-gutters-style/i.test(output)) {
    output = output.replace(/<\/head\s*>/i, `${PAGE_GUTTERS_STYLESHEET}\n</head>`);
  }
  return { html: output, added: output !== html, skipped: false };
}

export { PAGE_GUTTERS_STYLESHEET };
