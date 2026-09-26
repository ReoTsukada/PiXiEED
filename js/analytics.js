import { mapConfig } from '../data/site-config.js';

const VISITOR_KEY = 'PiXiEED:anonymous-visitor:v1';
const SESSION_KEY = 'PiXiEED:analytics-session:v1';
const QR_SESSION_PREFIX = 'PiXiEED:qr-session:v1:';
const CONSENT_KEY = 'PiXiEED:analytics-consent:v1';
const ENDPOINT = String(mapConfig.analyticsEndpoint || '').trim();
let analyticsBound = false;

function isAllowed() {
  try { return localStorage.getItem(CONSENT_KEY) !== 'denied'; } catch { return true; }
}

function createId(prefix) {
  if (crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function readOrCreate(storage, key, prefix) {
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const next = createId(prefix);
    storage.setItem(key, next);
    return next;
  } catch {
    return createId(prefix);
  }
}

function getContext() {
  const body = document.body;
  const referrer = document.referrer;
  let referrerHost = '';
  try { referrerHost = referrer ? new URL(referrer).host : ''; } catch { /* malformed referrer */ }
  return {
    visitor_id: readOrCreate(localStorage, VISITOR_KEY, 'visitor'),
    session_id: readOrCreate(sessionStorage, SESSION_KEY, 'session'),
    path: window.location.pathname,
    page: body.dataset.page || '',
    work_id: body.dataset.workId || '',
    store_id: body.dataset.storeId || '',
    referrer_host: referrerHost,
    language: navigator.language || '',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    device: window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'pointer'
  };
}

function post(payload) {
  if (!ENDPOINT) return;
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
      return;
    }
    void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, mode: 'no-cors' });
  } catch { /* analytics must never interrupt the public site */ }
}

export function trackEvent(eventName, properties = {}) {
  if (!eventName || !isAllowed()) return;
  post({
    event_id: createId('event'),
    occurred_at: new Date().toISOString(),
    event_name: eventName,
    ...getContext(),
    ...properties
  });
}

function trackQrArrival() {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('source') || params.get('utm_source');
  const qrId = params.get('qr') || params.get('qr_id');
  if (source !== 'qr' && !qrId) return;
  const properties = {
    qr_id: qrId || 'unspecified',
    work_id: params.get('work') || document.body.dataset.workId || '',
    store_id: params.get('store') || document.body.dataset.storeId || ''
  };
  trackEvent('qr_scan', properties);
  try {
    const key = `${QR_SESSION_PREFIX}${properties.qr_id}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      trackEvent('qr_unique_session', properties);
    }
  } catch { /* storage may be blocked */ }
}

export function bindAnalytics() {
  if (!isAllowed() || analyticsBound) return;
  analyticsBound = true;
  let isNewSession = false;
  try { isNewSession = !sessionStorage.getItem('PiXiEED:session-started:v1'); } catch { isNewSession = true; }
  readOrCreate(sessionStorage, 'PiXiEED:session-started:v1', 'started');
  if (isNewSession) trackEvent('session_start');
  trackEvent('page_view');
  trackQrArrival();

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-analytics-event]');
    if (!target) return;
    const properties = {};
    ['workId', 'storeId', 'qrId', 'source', 'target'].forEach((key) => {
      const value = target.dataset[key];
      if (value) properties[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
    });
    trackEvent(target.dataset.analyticsEvent, properties);
  });

  let engaged = false;
  let depth50 = false;
  let depth90 = false;
  const markEngaged = () => {
    if (!engaged) {
      engaged = true;
      trackEvent('engaged_view', { duration_ms: 10000 });
    }
  };
  window.setTimeout(markEngaged, 10000);
  window.addEventListener('scroll', () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const ratio = window.scrollY / scrollable;
    if (ratio >= .5 && !depth50) { depth50 = true; trackEvent('scroll_depth', { depth: 50 }); }
    if (ratio >= .9 && !depth90) { depth90 = true; trackEvent('scroll_depth', { depth: 90 }); }
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') trackEvent('page_leave');
  });
}

export function clearAnalyticsData() {
  try {
    localStorage.removeItem(VISITOR_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('PiXiEED:session-started:v1');
    Object.keys(sessionStorage).filter((key) => key.startsWith(QR_SESSION_PREFIX)).forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // 利用者の設定変更を妨げない。
  }
}
