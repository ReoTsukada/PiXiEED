/**
 * Google Analytics 4 for every public page (loaded by site-header.mjs).
 *
 * What shows up in GA4:
 *  - page_view with content_group = the page's name (ツール名 / ホーム / 地球儀 …) and `tool` = its path slug.
 *  - pass_sheet_open / pass_ad_open / pass_granted {method: ad|free} / pass_no_ad (js/pixieed-pass.mjs, js/pass-page.mjs)
 *  - file_export {tool, file_type, method} (js/pixel-export.mjs)
 *  - any element with data-analytics-event="…" sends that event on click.
 * Other modules send events with `globalThis.gtag?.('event', name, params)`, so nothing breaks when this is off.
 *
 * Off on localhost and inside frames, and when 利用状況の集計 is turned off in settings.
 * `?ga_debug=1` marks this tab's hits as debug_mode → GA4 管理 → DebugView shows them live.
 */
import { analyticsConfig } from '../data/site-config.js?rev=20261001-free-tools-1';

const CONSENT_KEY = 'PiXiEED:analytics-consent:v1';
const DEBUG_KEY = 'pixieed:ga-debug';

export function pageSlug(pathname = '/') {
  const clean = String(pathname).replace(/index\.html$/, '').replace(/\.html$/, '/');
  const parts = clean.split('/').filter(Boolean);
  return parts.length ? parts.join('-') : 'home';
}
export function pageGroup(doc = document) {
  const name = doc.body?.dataset?.toolName || String(doc.title || '').split(/[｜|]/)[0].trim();
  return name || pageSlug(doc.location?.pathname);
}

function allowed() {
  const id = analyticsConfig?.measurementId;
  if (!id || typeof window === 'undefined' || window.top !== window.self) return false;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:') return false;
  try { if (localStorage.getItem(CONSENT_KEY) === 'denied') return false; } catch {}
  return true;
}
function syncAnalyticsPreference() {
  const id = analyticsConfig?.measurementId;
  if (!id || typeof window === 'undefined') return;
  // gtag.js checks this property before sending data or writing cookies.
  window[`ga-disable-${id}`] = !allowed();
  if (allowed()) startAnalytics();
}
function debugMode() {
  try {
    const q = new URLSearchParams(location.search).get('ga_debug');
    if (q === '1') sessionStorage.setItem(DEBUG_KEY, '1');
    if (q === '0') sessionStorage.removeItem(DEBUG_KEY);
    return sessionStorage.getItem(DEBUG_KEY) === '1';
  } catch { return false; }
}

let started = false;
export function startAnalytics() {
  if (started || !allowed()) return false;
  started = true;
  const id = analyticsConfig.measurementId;
  window[`ga-disable-${id}`] = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  const tool = pageSlug(location.pathname);
  window.gtag('js', new Date());
  window.gtag('set', { tool });
  window.gtag('config', id, {
    content_group: pageGroup(document),
    tool,
    ...(debugMode() ? { debug_mode: true } : {})
  });
  const script = document.createElement('script');
  script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-analytics-event]');
    if (!target) return;
    const params = {};
    for (const key of ['workId', 'storeId', 'qrId', 'source', 'target']) if (target.dataset[key]) params[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = target.dataset[key];
    window.gtag('event', target.dataset.analyticsEvent, params);
  }, true);
  return true;
}
if (typeof document !== 'undefined') {
  syncAnalyticsPreference();
  document.addEventListener('pixieed:analytics-consent-change', syncAnalyticsPreference);
  window.addEventListener('storage', (event) => {
    if (event.key === CONSENT_KEY || event.key === null) syncAnalyticsPreference();
  });
}
