import test from 'node:test';
import assert from 'node:assert/strict';
import { installGlobeAnalyticsBridge, trackGlobeEvent } from '../../js/globe/analytics-bridge.mjs';

class EventHub {
  listeners = new Map();
  addEventListener(name, handler) {
    const listeners = this.listeners.get(name) || new Set();
    listeners.add(handler);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  dispatch(name, event = {}) { for (const listener of this.listeners.get(name) || []) listener(event); }
}

function setup(send = () => {}) {
  const windowRef = new EventHub();
  windowRef.location = { origin: 'https://pixieed.jp', href: 'https://pixieed.jp/globe/' };
  const childWindow = {};
  const frame = new EventHub();
  frame.tagName = 'IFRAME';
  frame.contentWindow = childWindow;
  frame.getAttribute = name => name === 'src' ? '/globe-prototype.html?embed=1&rev=20261007-map-panel-close-1' : null;
  const documentRef = { querySelector: selector => selector === '.map-hero__globe-frame' ? frame : null };
  const dispose = installGlobeAnalyticsBridge({ windowRef, documentRef, send });
  const payload = (sequence, name = 'select_content', params = { content_type: 'event' }, extra = {}) => ({
    type: 'pixieed:globe-analytics', version: 1, sequence, name, params, ...extra
  });
  const message = (data, { origin = 'https://pixieed.jp', source = childWindow } = {}) => windowRef.dispatch('message', { data, origin, source });
  return { dispose, frame, message, payload, sent: [], windowRef };
}

test('one click sends one event, the next click sends once with a new sequence, and iframe load resets deduplication', () => {
  const sent = [];
  const state = setup((...args) => sent.push(args));
  const secondInstall = installGlobeAnalyticsBridge({
    windowRef: state.windowRef,
    documentRef: { querySelector: () => state.frame },
    send: (...args) => sent.push(args)
  });
  assert.equal(secondInstall, state.dispose);
  const first = state.payload(1);
  state.message(first);
  state.message(first);
  state.message(state.payload(2));
  assert.deepEqual(sent, [
    ['select_content', { content_type: 'event' }],
    ['select_content', { content_type: 'event' }]
  ]);

  state.frame.dispatch('load');
  state.message(first);
  assert.equal(sent.length, 3);
  state.dispose();
  state.message(state.payload(3));
  assert.equal(sent.length, 3);
});

test('rejects denied-origin messages, untrusted sources, and payloads outside the event schema', () => {
  const sent = [];
  const state = setup((name, params) => { sent.push([name, params]); });
  state.message(state.payload(1), { origin: 'https://attacker.example' });
  state.message(state.payload(1), { source: {} });
  state.message(state.payload(1, 'page_view', {}));
  state.message(state.payload(1, 'event_outbound', { link_kind: 'official', href: 'https://example.org' }));
  state.message(state.payload(1, 'event_outbound', { link_kind: 'affiliate' }));
  state.message(state.payload(1, 'select_content', { content_type: 'event' }, { extra: true }));
  state.message(state.payload(0));
  state.message(state.payload(1));
  state.message(state.payload(1));
  assert.deepEqual(sent, [['select_content', { content_type: 'event' }]]);
  state.dispose();
});

test('does not install for an advertising or unrelated iframe', () => {
  const sent = [];
  const state = setup((...args) => sent.push(args));
  state.frame.getAttribute = name => name === 'src' ? 'https://ads.example/ad.html' : null;
  const windowRef = new EventHub();
  windowRef.location = { origin: 'https://pixieed.jp', href: 'https://pixieed.jp/globe/' };
  const dispose = installGlobeAnalyticsBridge({
    windowRef,
    documentRef: { querySelector: () => state.frame },
    send: (...args) => sent.push(args)
  });
  windowRef.dispatch('message', { origin: 'https://pixieed.jp', source: state.frame.contentWindow, data: state.payload(1) });
  assert.deepEqual(sent, []);
  dispose();
  state.dispose();
});

test('rejects prototype iframe URLs with unknown query parameters or disallowed layer values', () => {
  const state = setup();
  const sent = [];
  for (const src of [
    '/globe-prototype.html?embed=1&rev=20261007-map-panel-close-1&tool=telescope',
    '/globe-prototype.html?embed=1&rev=20261007-map-panel-close-1&layer=ads'
  ]) {
    state.frame.getAttribute = name => name === 'src' ? src : null;
    const windowRef = new EventHub();
    windowRef.location = { origin: 'https://pixieed.jp', href: 'https://pixieed.jp/globe/' };
    installGlobeAnalyticsBridge({ windowRef, documentRef: { querySelector: () => state.frame }, send: (...args) => sent.push(args) });
    windowRef.dispatch('message', { origin: 'https://pixieed.jp', source: state.frame.contentWindow, data: state.payload(1) });
  }
  assert.deepEqual(sent, []);
  state.dispose();
});

test('child suppresses bridge messages when analytics consent is denied', () => {
  const originalWindow = globalThis.window;
  const posted = [];
  globalThis.window = {
    top: {}, self: {},
    location: { origin: 'https://pixieed.jp', protocol: 'https:', hostname: 'pixieed.jp' },
    localStorage: { getItem: () => 'denied' },
    parent: { postMessage: (...args) => posted.push(args) }
  };
  try {
    assert.equal(trackGlobeEvent('select_content', { content_type: 'event' }), false);
    assert.deepEqual(posted, []);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('delegates consent denial to the shared analytics sender', () => {
  let consentAllowed = false;
  const delivered = [];
  const state = setup((name, params) => {
    if (consentAllowed) delivered.push([name, params]);
    return consentAllowed;
  });
  state.message(state.payload(1));
  assert.deepEqual(delivered, []);
  consentAllowed = true;
  state.message(state.payload(2, 'event_outbound', { link_kind: 'ticket' }));
  assert.deepEqual(delivered, [['event_outbound', { link_kind: 'ticket' }]]);
  state.dispose();
});
