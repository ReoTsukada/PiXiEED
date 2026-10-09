import { trackSiteEvent } from '../site-analytics.mjs';
import { analyticsConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';

const MESSAGE_TYPE = 'pixieed:globe-analytics';
const MESSAGE_VERSION = 1;
const CONSENT_KEY = 'PiXiEED:analytics-consent:v1';
const ALLOWED_HOSTS = new Set(['pixieed.jp', 'www.pixieed.jp']);
const LINK_KINDS = new Set(['official', 'ticket', 'related', 'social']);
const EVENT_PARAMS = Object.freeze({
  select_content: Object.freeze({ key: 'content_type', values: new Set(['event']) }),
  event_outbound: Object.freeze({ key: 'link_kind', values: LINK_KINDS })
});

let childSequence = 0;
const installedBridges = new WeakMap();

function validEvent(name, params) {
  if (!Object.hasOwn(EVENT_PARAMS, name)) return false;
  const spec = EVENT_PARAMS[name];
  if (!spec || !params || typeof params !== 'object' || Array.isArray(params)) return false;
  const keys = Object.keys(params);
  return keys.length === 1 && keys[0] === spec.key && spec.values.has(params[spec.key]);
}

function childCanReport(windowRef) {
  try {
    const location = windowRef.location;
    return Boolean(
      analyticsConfig?.measurementId
      && location?.protocol === 'https:'
      && ALLOWED_HOSTS.has(String(location.hostname || '').toLowerCase())
      && windowRef.localStorage.getItem(CONSENT_KEY) !== 'denied'
    );
  } catch {
    return false;
  }
}

/** Send the two allowlisted globe events through the parent when embedded. */
export function trackGlobeEvent(name, params) {
  if (!validEvent(name, params)) return false;
  try {
    if (window.top === window.self) return trackSiteEvent(name, params);
    if (!childCanReport(window)) return false;
    const origin = window.location.origin;
    if (!origin || !window.parent || typeof window.parent.postMessage !== 'function') return false;
    const sequence = ++childSequence;
    window.parent.postMessage({
      type: MESSAGE_TYPE,
      version: MESSAGE_VERSION,
      sequence,
      name,
      params: { ...params }
    }, origin);
    return true;
  } catch {
    return false;
  }
}

function exactPrototypeFrame(frame, windowRef) {
  if (!frame || String(frame.tagName || '').toLowerCase() !== 'iframe' || !frame.contentWindow) return false;
  try {
    const origin = windowRef.location?.origin;
    const src = frame.getAttribute('src');
    if (!origin || typeof src !== 'string' || !src) return false;
    const url = new URL(src, windowRef.location.href);
    if (url.origin !== origin || url.pathname !== '/globe-prototype.html' || url.hash) return false;
    const allowedKeys = new Set(['embed', 'rev', 'layer']);
    if ([...url.searchParams.keys()].some(key => !allowedKeys.has(key))) return false;
    if (url.searchParams.getAll('embed').length !== 1 || url.searchParams.get('embed') !== '1') return false;
    if (url.searchParams.getAll('rev').length !== 1 || !/^202\d{5}-map-panel-close-[a-z0-9-]+$/.test(url.searchParams.get('rev') || '')) return false;
    const layers = url.searchParams.getAll('layer');
    if (layers.length > 1 || (layers.length && !['posts', 'events', 'stores'].includes(layers[0]))) return false;
    return true;
  } catch {
    return false;
  }
}

function exactPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const keys = Object.keys(data).sort();
  if (keys.join(',') !== 'name,params,sequence,type,version') return false;
  if (data.type !== MESSAGE_TYPE || data.version !== MESSAGE_VERSION) return false;
  if (!Number.isSafeInteger(data.sequence) || data.sequence < 1) return false;
  return validEvent(data.name, data.params);
}

/** Install the parent-side listener for the trusted globe prototype iframe only. */
export function installGlobeAnalyticsBridge({ windowRef = globalThis.window, documentRef = globalThis.document, send = trackSiteEvent } = {}) {
  if (!windowRef?.addEventListener || !documentRef?.querySelector || typeof send !== 'function') {
    return () => {};
  }
  const frame = documentRef.querySelector('.map-hero__globe-frame');
  if (!exactPrototypeFrame(frame, windowRef)) return () => {};
  const existing = installedBridges.get(windowRef);
  if (existing) return existing;

  let lastSequence = 0;
  const onLoad = () => { lastSequence = 0; };
  const onMessage = (event) => {
    if (event.origin !== windowRef.location?.origin) return;
    if (event.source !== frame.contentWindow) return;
    if (!exactPrototypeFrame(frame, windowRef) || !exactPayload(event.data)) return;
    if (event.data.sequence <= lastSequence) return;
    lastSequence = event.data.sequence;
    try { send(event.data.name, { ...event.data.params }); } catch { /* analytics failures must not affect the map */ }
  };
  frame.addEventListener('load', onLoad);
  windowRef.addEventListener('message', onMessage);
  const dispose = () => {
    frame.removeEventListener('load', onLoad);
    windowRef.removeEventListener('message', onMessage);
    installedBridges.delete(windowRef);
  };
  installedBridges.set(windowRef, dispose);
  return dispose;
}
