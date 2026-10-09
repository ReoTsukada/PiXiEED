/** Shared, consent-gated GA4 boundary for public PiXiEED pages. */
import { analyticsConfig } from '../data/site-config.js?rev=20261007-safe-analytics-1';

const CONSENT_KEY = 'PiXiEED:analytics-consent:v1';
const DEBUG_KEY = 'pixieed:ga-debug';
const ALLOWED_HOSTS = new Set(['pixieed.jp', 'www.pixieed.jp']);
const TOOLS = new Set([
  'home', 'about', 'guide', 'privacy', 'globe', 'shops', 'stores', 'works', 'collection',
  'profile', 'pass', 'tools', 'draw', 'animation', 'audio', 'game', 'jigsaw', 'hidden-object',
  'spot-difference', 'pixfind', 'pixel-camera', 'pixel-camera-studio', 'pixiee-lens', 'telescope',
  'training', 'play', 'play-spot-difference', 'play-hidden-object', 'creation-suite', 'store', 'event',
  'output', 'output-work',
  'hidden-object', 'spot-difference'
]);
const EVENTS = new Set([
  'page_view', 'work_open', 'store_open', 'map_open', 'file_export',
  'pass_sheet_open', 'pass_ad_open', 'pass_granted', 'pass_no_ad',
  'tool_start', 'camera_capture', 'level_start', 'level_end', 'select_content',
  'event_outbound', 'share', 'link_copy',
  'project_open', 'project_open_pixiee_lens'
]);
const GAME_TYPES = new Set(['spot_difference', 'hidden_object', 'jigsaw', 'walk']);
const COMPLETION_KINDS = new Set(['solved', 'candidates_reviewed', 'goal']);
const CONTENT_TYPES = new Set(['work', 'store', 'event', 'tool', 'game', 'project']);
const FILE_TYPES = new Set(['png', 'gif', 'jpg', 'jpeg', 'webp', 'svg', 'wav', 'mp3', 'mp4', 'webm', 'pxd', 'zip', 'other']);
const METHODS = new Set(['downloaded', 'shared', 'native', 'clipboard', 'ad', 'free']);
const LINK_KINDS = new Set(['official', 'ticket', 'related', 'social']);
const EXPORT_STATUSES = new Set(['download_started', 'share_handoff']);

const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';
function consentAllowed() {
  if (!inBrowser() || !analyticsConfig?.measurementId) return false;
  try {
    if (window.top !== window.self) return false;
    const loc = window.location || globalThis.location;
    if (loc?.protocol !== 'https:' || !ALLOWED_HOSTS.has(String(loc.hostname || '').toLowerCase())) return false;
    return localStorage.getItem(CONSENT_KEY) !== 'denied';
  } catch { return false; }
}

export function pageSlug(pathname = '/') {
  const clean = String(pathname).split(/[?#]/, 1)[0].replace(/index\.html$/, '').replace(/\.html$/, '/');
  const parts = clean.split('/').filter(Boolean);
  const slug = parts.length ? parts.join('-') : 'home';
  if (TOOLS.has(slug)) return slug;
  if (parts.length === 2) {
    const detailGroup = { stores: 'store', works: 'works', shops: 'shops', events: 'event' }[parts[0]];
    if (detailGroup) return detailGroup;
  }
  return 'other';
}

function safePagePath(pathname = '/') {
  let clean = String(pathname).split(/[?#]/, 1)[0];
  clean = clean.replace(/index\.html$/, '').replace(/\.html$/, '/');
  if (clean === '') clean = '/';
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 2 && ['stores', 'works', 'shops', 'events'].includes(parts[0])) {
    return `/${parts[0]}/:id/`;
  }
  const slug = parts.length ? parts.join('-') : 'home';
  return TOOLS.has(slug) ? `/${parts.join('/')}${parts.length ? '/' : ''}` : '/other/';
}

function safeTool(value) { return typeof value === 'string' && TOOLS.has(value) ? value : null; }
function enumValue(value, set) { return typeof value === 'string' && set.has(value) ? value : null; }
function parametersFor(name, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = { tool: safeTool(input.tool) || pageSlug((window.location || globalThis.location)?.pathname || '/') };
  const put = (key, value) => { if (value !== null && value !== undefined) out[key] = value; };
  switch (name) {
    case 'page_view': {
      const loc = window.location || globalThis.location;
      const path = pageSlug(loc?.pathname || '/');
      const stablePath = safePagePath(loc?.pathname || '/');
      put('page_path', stablePath);
      put('page_location', `${loc?.origin || 'https://pixieed.jp'}${stablePath}`);
      put('page_title', path);
      put('content_group', path);
      put('tool', safeTool(input.tool) || path);
      break;
    }
    case 'work_open': case 'store_open': case 'map_open':
      // Preserve the event signal while intentionally dropping row IDs and labels.
      break;
    case 'file_export': {
      put('tool', safeTool(input.tool));
      put('file_type', enumValue(String(input.file_type || '').toLowerCase(), FILE_TYPES) || 'other');
      put('method', enumValue(input.method, METHODS));
      put('export_status', enumValue(input.export_status, EXPORT_STATUSES));
      break;
    }
    case 'pass_granted': put('method', enumValue(input.method, new Set(['ad', 'free']))); break;
    case 'pass_sheet_open': case 'pass_ad_open': case 'pass_no_ad': case 'project_open_pixiee_lens': break;
    case 'project_open':
      put('project_slug', enumValue(input.project_slug, new Set(['pixiee-lens'])));
      put('project_type', enumValue(input.project_type, new Set(['tool'])));
      put('project_name', enumValue(input.project_name, new Set(['PiXiEELENS'])));
      break;
    case 'tool_start': put('tool', safeTool(input.tool)); break;
    case 'camera_capture': put('tool', safeTool(input.tool)); break;
    case 'level_start': case 'level_end': {
      put('game_type', enumValue(input.game_type, GAME_TYPES));
      if (name === 'level_end') {
        if (typeof input.success === 'boolean') out.success = input.success;
        put('completion_kind', enumValue(input.completion_kind, COMPLETION_KINDS));
      }
      break;
    }
    case 'select_content': put('content_type', enumValue(input.content_type, CONTENT_TYPES)); break;
    case 'event_outbound': put('link_kind', enumValue(input.link_kind, LINK_KINDS)); break;
    case 'share': put('method', enumValue(input.method, new Set(['native']))); break;
    case 'link_copy': put('method', enumValue(input.method, new Set(['clipboard']))); break;
  }
  return out;
}

let started = false;
let debug = false;
function emit(name, params = {}) {
  try {
    if (!consentAllowed() || !EVENTS.has(name)) return false;
    const safe = parametersFor(name, params);
    if (debug) safe.debug_mode = true;
    pushCommand('event', name, safe);
    return true;
  } catch {
    return false;
  }
}

/** Send one allowlisted event. Unsafe names and parameters are discarded. */
export function trackSiteEvent(name, params = {}) { return emit(name, params); }

function pushCommand(command, ...args) {
  window.dataLayer = window.dataLayer || [];
  function queue() { window.dataLayer.push(arguments); }
  queue(command, ...args);
}

function safeGtag(command, ...args) {
  if (command === 'event') return emit(args[0], args[1]);
  if (command === 'js' && args[0] instanceof Date) {
    pushCommand('js', args[0]);
    return;
  }
  if (command === 'config' && args[0] === analyticsConfig.measurementId) {
    pushCommand('config', args[0], { ...pageDefaults(), ...(debug ? { debug_mode: true } : {}) });
    return;
  }
  if (command === 'set') return;
  // Ignore all other gtag commands so callers cannot bypass the event allowlist.
}

function pageView() { emit('page_view', { tool: pageSlug((window.location || globalThis.location)?.pathname || '/') }); }
function pageDefaults() {
  const loc = window.location || globalThis.location;
  const path = pageSlug(loc?.pathname || '/');
  const stablePath = safePagePath(loc?.pathname || '/');
  let referrer = '';
  try {
    const source = new URL(document.referrer);
    if (ALLOWED_HOSTS.has(source.hostname.toLowerCase())) {
      referrer = `${source.origin}${safePagePath(source.pathname)}`;
    }
  } catch { /* no safe internal referrer */ }
  return {
    send_page_view: false,
    page_location: `${loc?.origin || 'https://pixieed.jp'}${stablePath}`,
    page_referrer: referrer,
    page_title: path,
    content_group: path,
    tool: path
  };
}
function watchPathChanges() {
  let previous = (window.location || globalThis.location)?.pathname || '/';
  const changed = () => {
    const next = (window.location || globalThis.location)?.pathname || '/';
    if (next === previous) return;
    previous = next;
    pageView();
  };
  for (const method of ['pushState', 'replaceState']) {
    const original = globalThis.history?.[method];
    if (typeof original !== 'function') continue;
    globalThis.history[method] = function (...args) { const result = original.apply(this, args); changed(); return result; };
  }
  window.addEventListener('popstate', changed);
}

export function startAnalytics() {
  if (started || !consentAllowed()) return false;
  started = true;
  debug = (() => {
    try {
      const query = new URLSearchParams((window.location || globalThis.location).search).get('ga_debug');
      if (query === '1') sessionStorage.setItem(DEBUG_KEY, '1');
      if (query === '0') sessionStorage.removeItem(DEBUG_KEY);
      return sessionStorage.getItem(DEBUG_KEY) === '1';
    } catch { return false; }
  })();
  const id = analyticsConfig.measurementId;
  window[`ga-disable-${id}`] = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = safeGtag;
  window.gtag('js', new Date());
  window.gtag('config', id, { ...pageDefaults(), ...(debug ? { debug_mode: true } : {}) });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
  pageView();
  watchPathChanges();
  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-analytics-event]');
    const name = target?.dataset?.analyticsEvent;
    if (['work_open', 'store_open', 'map_open'].includes(name)) emit(name, {});
  }, true);
  return true;
}

function syncConsent() {
  if (!analyticsConfig?.measurementId || !inBrowser()) return;
  window[`ga-disable-${analyticsConfig.measurementId}`] = !consentAllowed();
  if (consentAllowed()) startAnalytics();
}

/** Returns a per-page callback for the first real mutation or preview. */
export function createToolStartTracker(tool) {
  let sent = false;
  return () => {
    if (sent) return false;
    sent = true;
    return emit('tool_start', { tool });
  };
}

/** Tracks one attempt at a time; reset discards an abandoned attempt without sending. */
export function createLevelTracker(game_type) {
  let active = false;
  let ended = false;
  let startSent = false;
  return {
    start() {
      if (active || ended) return false;
      active = true;
      startSent = emit('level_start', { game_type });
      return startSent;
    },
    end({ success, completion_kind } = {}) {
      if (!active) return false;
      active = false;
      ended = true;
      if (!startSent) return false;
      return emit('level_end', { game_type, success, completion_kind });
    },
    reset() { active = false; ended = false; startSent = false; }
  };
}

if (inBrowser()) {
  syncConsent();
  document.addEventListener('pixieed:analytics-consent-change', syncConsent);
  window.addEventListener('storage', (event) => { if (event.key === CONSENT_KEY || event.key === null) syncConsent(); });
}
