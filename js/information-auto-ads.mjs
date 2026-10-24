import { displayAdConfig } from '../data/site-config.js?rev=20261008-map-detail-1';
import { ordinaryAdConfig } from '../data/ordinary-ad-config.mjs?rev=20261024-ordinary-ad-config-1';
import { mountInformationGutter } from './ads/ordinary-ad-entry.mjs?rev=20261024-side-ad-layout-1';
import { ordinaryAdUnitIsConfigured } from './ads/ordinary-ad-placement.mjs?rev=20261024-ordinary-ad-1';

const STATIC_INFORMATION_PATHS = new Set([
  '/welcome/',
  '/about/',
  '/guide/',
  '/help/',
  '/glossary/',
  '/stores/',
  '/stores/ecowashcafe-nakanoshima.html',
  '/events/',
]);

function normalizePathname(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.includes('\\')) return '';
  const normalized = pathname.replace(/\/index\.html$/, '/');
  if (normalized === '/') return normalized;
  const trailingSlash = normalized.endsWith('/');
  if (!trailingSlash && !normalized.endsWith('.html')) return '';
  const parts = normalized.slice(1, trailingSlash ? -1 : undefined).split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return '';
  return normalized;
}

function allowedRuntimePath(pathname) {
  if (STATIC_INFORMATION_PATHS.has(pathname)) return true;
  return /^\/events\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(pathname);
}

/** True only for a built information route with a matching marker on production HTTPS. */
export function isEligibleInformationAutoAdsPage({
  pathname,
  marker,
  protocol,
  host,
  hostname,
  isTopLevel,
  bodyClasses = [],
  toolDirect = '',
  directLoading = false,
  workspaceOpen = false,
  embeddedExpanded = false,
} = {}) {
  const path = normalizePathname(pathname);
  if (!path || marker !== path || !allowedRuntimePath(path)) return false;
  if (protocol !== 'https:' || !['pixieed.jp', 'www.pixieed.jp'].includes(String(hostname || '').toLowerCase())) return false;
  if (!['pixieed.jp', 'www.pixieed.jp'].includes(String(host || '').toLowerCase()) || isTopLevel !== true) return false;
  const classes = new Set(bodyClasses);
  if (toolDirect === 'work' || directLoading || workspaceOpen || embeddedExpanded) return false;
  if (['creation-editor', 'tool-shell--workspace-open'].some(name => classes.has(name))) return false;
  return true;
}

/** Load the existing publisher SDK once on approved top-level production pages. */
export function mountInformationAutoAds({ doc = document, win = window, config = displayAdConfig, client, manualConfig = ordinaryAdConfig.informationGutter, mountGutter = mountInformationGutter } = {}) {
  let isTopLevel = false;
  try { isTopLevel = win.top === win.self; } catch { return { loaded: false, reason: 'not-top-level' }; }
  const body = doc.body;
  const html = doc.documentElement;
  const eligible = isEligibleInformationAutoAdsPage({
    pathname: win.location?.pathname,
    marker: body?.dataset?.informationAutoAds,
    protocol: win.location?.protocol,
    host: win.location?.host,
    hostname: win.location?.hostname,
    isTopLevel,
    bodyClasses: [...(body?.classList || [])],
    toolDirect: html?.dataset?.toolDirect || '',
    directLoading: html?.hasAttribute?.('data-direct-loading') || false,
    workspaceOpen: body?.classList?.contains('tool-shell--workspace-open') || false,
    embeddedExpanded: Boolean(doc.querySelector?.('.tool-embed--expanded')),
  });
  if (!eligible) return { loaded: false, reason: 'page-not-eligible' };

  // An explicitly operator-enabled manual gutter owns this information page;
  // do not also start Auto Ads and risk a second, uncontrolled placement.
  if (manualConfig?.enabled === true && manualConfig?.unit?.placement === 'gutter'
      && ordinaryAdUnitIsConfigured(manualConfig.unit)) {
    void Promise.resolve(mountGutter({ config: manualConfig, doc, win, isEligiblePage: eligible })).catch(() => {});
    return { loaded: false, reason: 'manual-gutter-selected' };
  }

  const publisher = client || config?.client;
  if (!/^ca-pub-\d{16}$/.test(publisher || '') || !doc.head?.append || !doc.createElement) {
    return { loaded: false, reason: 'configuration-unavailable' };
  }
  const selector = 'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]';
  const existing = doc.querySelector(selector);
  if (existing) return { loaded: true, appended: false, script: existing };

  const script = doc.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.dataset.informationAutoAdsLoader = 'true';
  script.addEventListener?.('error', () => { script.dataset.loadState = 'error'; }, { once: true });
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisher)}`;
  doc.head.append(script);
  return { loaded: true, appended: true, script };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') mountInformationAutoAds({ doc: document, win: window });

export { normalizePathname };
