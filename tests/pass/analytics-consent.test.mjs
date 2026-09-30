import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsConfig } from '../../data/site-config.js';

const storage = new Map();
const documentEvents = new Map();
const windowEvents = new Map();
const scripts = [];
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); }
};
globalThis.location = { hostname: 'pixieed.jp', protocol: 'https:', pathname: '/tools/', search: '' };
globalThis.window = {
  addEventListener(name, listener) { windowEvents.set(name, listener); },
  dataLayer: [],
};
window.top = window.self = window;
globalThis.document = {
  body: { dataset: { toolName: 'ツール' } },
  title: 'ツール｜PiXiEED',
  head: { append(script) { scripts.push(script); } },
  addEventListener(name, listener) { documentEvents.set(name, listener); },
  createElement() { return {}; }
};

await import('../../js/site-analytics.mjs?analytics-consent-test');
const disabled = `ga-disable-${analyticsConfig.measurementId}`;

test('the shared GA4 tag stops on an in-page opt-out and resumes on opt-in', () => {
  assert.equal(scripts.length, 1);
  assert.equal(window[disabled], false);
  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  documentEvents.get('pixieed:analytics-consent-change')();
  assert.equal(window[disabled], true);
  storage.set('PiXiEED:analytics-consent:v1', 'granted');
  documentEvents.get('pixieed:analytics-consent-change')();
  assert.equal(window[disabled], false);
  assert.equal(scripts.length, 1, 'resuming must not load the tag twice');
});

test('a consent change in another tab updates the active tag', () => {
  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  windowEvents.get('storage')({ key: 'PiXiEED:analytics-consent:v1' });
  assert.equal(window[disabled], true);
});
