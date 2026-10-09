import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsConfig } from '../../data/site-config.js';

const storage = new Map([['PiXiEED:analytics-consent:v1', 'granted']]);
const documentEvents = new Map();
const windowEvents = new Map();
globalThis.localStorage = { getItem(key) { return storage.get(key) ?? null; } };
globalThis.sessionStorage = { getItem() { return null; } };
globalThis.location = { hostname: 'pixieed.jp', protocol: 'https:', origin: 'https://pixieed.jp', pathname: '/spot-difference/', search: '' };
globalThis.history = {};
globalThis.window = {
  location: globalThis.location,
  addEventListener(name, listener) { windowEvents.set(name, listener); },
  dataLayer: [],
};
window.top = window.self = window;
globalThis.document = {
  body: { dataset: {} },
  head: { append() {} },
  addEventListener(name, listener) { documentEvents.set(name, listener); },
  createElement() { return {}; },
};

const analytics = await import('../../js/site-analytics.mjs?usage-events-test');
const events = () => window.dataLayer.filter((entry) => entry?.[0] === 'event');

test('tool starts and completed game attempts emit once at their real boundaries', () => {
  const trackToolStart = analytics.createToolStartTracker('draw');
  assert.equal(trackToolStart(), true);
  assert.equal(trackToolStart(), false);

  const attempt = analytics.createLevelTracker('spot_difference');
  assert.equal(attempt.end({ success: true, completion_kind: 'solved' }), false, 'cannot end preparation');
  assert.equal(attempt.start(), true);
  assert.equal(attempt.start(), false, 'resume does not duplicate the start');
  assert.equal(attempt.end({ success: false, completion_kind: 'candidates_reviewed' }), true);
  assert.equal(attempt.end({ success: true, completion_kind: 'solved' }), false, 'one end per attempt');
  attempt.reset();
  assert.equal(attempt.start(), true, 'a fresh retry starts a new attempt');

  const payloads = events().filter((entry) => entry[1] !== 'page_view').map((entry) => [entry[1], { ...entry[2] }]);
  assert.deepEqual(payloads, [
    ['tool_start', { tool: 'draw' }],
    ['level_start', { tool: 'spot-difference', game_type: 'spot_difference' }],
    ['level_end', { tool: 'spot-difference', game_type: 'spot_difference', success: false, completion_kind: 'candidates_reviewed' }],
    ['level_start', { tool: 'spot-difference', game_type: 'spot_difference' }],
  ]);
});

test('share and copy events retain only allowlisted method values', () => {
  analytics.trackSiteEvent('share', { method: 'native', file_name: 'private.png', session_id: 'secret' });
  analytics.trackSiteEvent('link_copy', { method: 'clipboard', url: 'https://private.example/' });
  const recent = events().slice(-2).map((entry) => [entry[1], { ...entry[2] }]);
  assert.deepEqual(recent, [
    ['share', { tool: 'spot-difference', method: 'native' }],
    ['link_copy', { tool: 'spot-difference', method: 'clipboard' }],
  ]);
  assert.equal(analytics.trackSiteEvent('unapproved_event', { anything: 'private' }), false);
});

test('denied attempts stay silent through resume and completion; a new attempt can track after consent', () => {
  const before = events().length;
  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  documentEvents.get('pixieed:analytics-consent-change')();
  const attempt = analytics.createLevelTracker('walk');
  assert.equal(attempt.start(), false);
  assert.equal(attempt.start(), false, 'resume while consent is denied does not duplicate or queue a start');
  assert.equal(attempt.end({ success: true, completion_kind: 'goal' }), false);
  assert.equal(events().length, before);

  storage.set('PiXiEED:analytics-consent:v1', 'granted');
  documentEvents.get('pixieed:analytics-consent-change')();
  assert.equal(attempt.start(), false, 'a completed attempt is not replayed after consent changes');
  attempt.reset();
  assert.equal(attempt.start(), true, 'a new attempt can start after consent is granted');
  assert.deepEqual([...events()].slice(-1).map((entry) => [entry[1], { ...entry[2] }]), [
    ['level_start', { tool: 'spot-difference', game_type: 'walk' }],
  ]);
});
