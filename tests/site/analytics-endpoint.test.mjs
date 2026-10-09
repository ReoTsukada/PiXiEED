import test from 'node:test';
import assert from 'node:assert/strict';

const sent = [];
const storage = new Map();
globalThis.localStorage = globalThis.sessionStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value)
};
globalThis.window = {
  location: { protocol: 'https:', hostname: 'pixieed.jp', pathname: '/works/' },
  dataLayer: [], innerWidth: 800, innerHeight: 600,
  matchMedia: () => ({ matches: false })
};
window.top = window.self = window;
globalThis.document = { body: { dataset: { page: 'works' } }, referrer: '' };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { language: 'ja', sendBeacon: (endpoint, blob) => { sent.push({ endpoint, blob }); return true; } }
});
const { trackEvent } = await import('../../js/analytics.js');

test('the separate endpoint rejects denied consent, frames and development origins', () => {
  for (const host of ['localhost', '127.0.0.1', 'preview.example', 'pixieed.jp.attacker.example']) {
    window.location.hostname = host;
    trackEvent('work_like');
  }
  window.location.hostname = 'pixieed.jp';
  window.location.protocol = 'http:';
  trackEvent('work_like');
  window.location.protocol = 'https:';
  window.top = {};
  trackEvent('work_like');
  window.top = window;
  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  trackEvent('work_like');
  assert.equal(sent.length, 0);
});

test('endpoint page/session records are not forwarded into the GA queue', async () => {
  storage.set('PiXiEED:analytics-consent:v1', 'granted');
  trackEvent('page_view');
  trackEvent('session_start');
  // The legacy endpoint is optional; when configured its records stay on that endpoint.
  for (const row of sent) {
    const payload = JSON.parse(await row.blob.text());
    assert.ok(['page_view', 'session_start'].includes(payload.event_name));
  }
  assert.deepEqual(window.dataLayer, []);
});
