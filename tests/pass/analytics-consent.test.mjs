import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsConfig } from '../../data/site-config.js';

const storage = new Map();
const documentEvents = new Map();
const windowEvents = new Map();
const scripts = [];
const pathname = { value: '/tools/' };
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); }
};
globalThis.location = { hostname: 'pixieed.jp', protocol: 'https:', origin: 'https://pixieed.jp', get pathname() { return pathname.value; }, search: '' };
globalThis.history = {
  pushState(_state, _title, path) { if (path) pathname.value = new URL(path, 'https://pixieed.jp').pathname; },
  replaceState(_state, _title, path) { if (path) pathname.value = new URL(path, 'https://pixieed.jp').pathname; }
};
globalThis.window = {
  location: globalThis.location,
  addEventListener(name, listener) { windowEvents.set(name, listener); },
  dataLayer: [],
};
window.top = window.self = window;
globalThis.document = {
  body: { dataset: { toolName: '秘密の自由入力' } },
  title: '秘密のページタイトル｜PiXiEED',
  referrer: 'https://pixieed.jp/?private=1',
  head: { append(script) { scripts.push(script); } },
  addEventListener(name, listener) { documentEvents.set(name, listener); },
  createElement() { return {}; }
};

const analytics = await import('../../js/site-analytics.mjs?analytics-consent-test');
const disabled = `ga-disable-${analyticsConfig.measurementId}`;
const eventRows = () => window.dataLayer.filter((entry) => entry?.[0] === 'event');

test('loads once on production and sends a stable, query-free page view', () => {
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${analyticsConfig.measurementId}`);
  assert.equal(window[disabled], false);
  const config = window.dataLayer.find((entry) => entry?.[0] === 'config');
  assert.equal(config[2].send_page_view, false);
  assert.equal(config[2].page_location, 'https://pixieed.jp/tools/');
  assert.equal(config[2].page_title, 'tools');
  assert.equal(config[2].page_referrer, 'https://pixieed.jp/');
  assert.equal(eventRows().filter((entry) => entry[1] === 'page_view').length, 1);
});

test('only allowlisted events and low-cardinality parameters pass through', () => {
  analytics.trackSiteEvent('tool_start', { tool: 'draw', image: 'private.png', prompt: 'private text', id: '123' });
  analytics.trackSiteEvent('unlisted_event', { value: 'secret' });
  window.gtag('event', 'file_export', { tool: 'attacker-route', file_type: 'secret-name', method: 'downloaded', filename: 'private.png' });
  const toolStart = eventRows().find((entry) => entry[1] === 'tool_start');
  assert.deepEqual({ ...toolStart[2] }, { tool: 'draw' });
  const fileExport = eventRows().find((entry) => entry[1] === 'file_export');
  assert.deepEqual({ ...fileExport[2] }, { tool: 'tools', file_type: 'other', method: 'downloaded' });
  assert.equal(eventRows().some((entry) => entry[1] === 'unlisted_event'), false);
});

test('the PiXiEELENS project event keeps its canonical display name', () => {
  analytics.trackSiteEvent('project_open', {
    project_slug: 'pixiee-lens', project_type: 'tool', project_name: 'PiXiEELENS'
  });
  const projectOpen = eventRows().find((entry) => entry[1] === 'project_open');
  assert.deepEqual({ ...projectOpen[2] }, {
    tool: 'tools', project_slug: 'pixiee-lens', project_type: 'tool', project_name: 'PiXiEELENS'
  });
});

test('consent changes stop and resume without duplicate tag loads', () => {
  const before = eventRows().length;
  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  documentEvents.get('pixieed:analytics-consent-change')();
  assert.equal(window[disabled], true);
  assert.equal(analytics.trackSiteEvent('tool_start', { tool: 'draw' }), false);
  assert.equal(eventRows().length, before);
  storage.set('PiXiEED:analytics-consent:v1', 'granted');
  documentEvents.get('pixieed:analytics-consent-change')();
  assert.equal(window[disabled], false);
  assert.equal(scripts.length, 1, 'resuming must not load the tag twice');
});

test('production origin and top-level context are required even with consent', () => {
  const originalHost = location.hostname;
  const originalProtocol = location.protocol;
  const originalTop = window.top;
  location.hostname = 'localhost';
  assert.equal(analytics.trackSiteEvent('tool_start', { tool: 'draw' }), false);
  location.hostname = originalHost;
  location.protocol = 'http:';
  assert.equal(analytics.trackSiteEvent('tool_start', { tool: 'draw' }), false);
  location.protocol = originalProtocol;
  window.top = {};
  assert.equal(analytics.trackSiteEvent('tool_start', { tool: 'draw' }), false);
  window.top = originalTop;
  assert.equal(analytics.trackSiteEvent('tool_start', { tool: 'draw' }), true);
});

test('storage changes in another tab update consent and pageviews ignore query-only changes', () => {
  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  windowEvents.get('storage')({ key: 'PiXiEED:analytics-consent:v1' });
  assert.equal(window[disabled], true);
  storage.set('PiXiEED:analytics-consent:v1', 'granted');
  windowEvents.get('storage')({ key: 'PiXiEED:analytics-consent:v1' });
  assert.equal(window[disabled], false);
  const before = eventRows().filter((entry) => entry[1] === 'page_view').length;
  history.replaceState({}, '', '/tools/?draft=private#canvas');
  assert.equal(eventRows().filter((entry) => entry[1] === 'page_view').length, before);
  history.pushState({}, '', '/draw/');
  assert.equal(eventRows().filter((entry) => entry[1] === 'page_view').length, before + 1);
  assert.equal(eventRows().at(-1)[2].page_location, 'https://pixieed.jp/draw/');
});

test('level tracking emits a single start and end per attempt', () => {
  const tracker = analytics.createLevelTracker('jigsaw');
  const before = eventRows().length;
  assert.equal(tracker.start(), true);
  assert.equal(tracker.start(), false);
  assert.equal(tracker.end({ success: true, completion_kind: 'solved' }), true);
  assert.equal(tracker.end({ success: true, completion_kind: 'solved' }), false);
  assert.equal(tracker.start(), false);
  tracker.reset();
  assert.equal(tracker.start(), true);
  assert.equal(tracker.end({ success: false, completion_kind: 'candidates_reviewed' }), true);
  assert.equal(eventRows().length, before + 4);
  const last = eventRows().at(-1);
  assert.deepEqual({ ...last[2] }, { tool: 'draw', game_type: 'jigsaw', success: false, completion_kind: 'candidates_reviewed' });
});

test('an attempt that starts while denied cannot emit an orphan completion after consent returns', () => {
  const tracker = analytics.createLevelTracker('walk');
  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  documentEvents.get('pixieed:analytics-consent-change')();
  const before = eventRows().length;
  assert.equal(tracker.start(), false);
  storage.set('PiXiEED:analytics-consent:v1', 'granted');
  documentEvents.get('pixieed:analytics-consent-change')();
  assert.equal(tracker.end({ success: true, completion_kind: 'goal' }), false);
  assert.equal(eventRows().length, before);
  tracker.reset();
  assert.equal(tracker.start(), true);
  assert.equal(tracker.end({ success: true, completion_kind: 'goal' }), true);
});
