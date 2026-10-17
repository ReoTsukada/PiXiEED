import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installGlobeAnalyticsBridge, trackGlobeEvent } from '../../js/globe/analytics-bridge.mjs';

const globeHtml = readFileSync(new URL('../../globe/index.html', import.meta.url), 'utf8');
const iframeTag = globeHtml.match(/<iframe\b(?=[^>]*class="[^"]*map-hero__globe-frame[^"]*")[^>]*>/)?.[0];
const canonicalFrameSrc = iframeTag?.match(/\bsrc="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
assert.ok(canonicalFrameSrc, 'globe/index.html must contain the canonical map iframe URL');
const canonicalFrameUrl = new URL(canonicalFrameSrc, 'https://pixieed.jp/globe/');

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
  frame.getAttribute = name => name === 'src' ? canonicalFrameSrc : null;
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

test('accepts the canonical iframe URL from globe/index.html and rejects malformed or unrecognized URLs', () => {
  const canonicalSent = [];
  const state = setup((...args) => canonicalSent.push(args));
  state.message(state.payload(1));
  assert.deepEqual(canonicalSent, [['select_content', { content_type: 'event' }]]);

  const canonical = new URL(canonicalFrameUrl);
  const invalidUrls = [
    'http://[invalid',
    'https://attacker.example/globe-prototype.html?embed=1&rev=20261017-map-navigation-1',
    '/other.html?embed=1&rev=20261017-map-navigation-1',
    `${canonical.pathname}${canonical.search}#unexpected`,
    `${canonical.pathname}?embed=1&rev=20261017-unknown-1`,
    `${canonical.pathname}?embed=1&embed=1&rev=${canonical.searchParams.get('rev')}`,
    `${canonical.pathname}?embed=1&rev=${canonical.searchParams.get('rev')}&rev=${canonical.searchParams.get('rev')}`,
    `${canonical.pathname}?embed=1&rev=${canonical.searchParams.get('rev')}&layer=events&layer=stores`,
    `${canonical.pathname}?embed=1&rev=${canonical.searchParams.get('rev')}&layer=ads`,
    `${canonical.pathname}?embed=1&rev=${canonical.searchParams.get('rev')}&tool=telescope`
  ];
  const windowRef = new EventHub();
  windowRef.location = { origin: 'https://pixieed.jp', href: 'https://pixieed.jp/globe/' };
  const invalidSent = [];
  for (const src of invalidUrls) {
    const frame = new EventHub();
    frame.tagName = 'IFRAME';
    frame.contentWindow = {};
    frame.getAttribute = name => name === 'src' ? src : null;
    installGlobeAnalyticsBridge({ windowRef, documentRef: { querySelector: () => frame }, send: (...args) => invalidSent.push(args) });
    windowRef.dispatch('message', { origin: 'https://pixieed.jp', source: frame.contentWindow, data: state.payload(1) });
  }
  assert.deepEqual(invalidSent, []);

  for (const layer of ['posts', 'events', 'stores']) {
    const url = new URL(canonical);
    url.searchParams.set('layer', layer);
    const layeredWindow = new EventHub();
    layeredWindow.location = { origin: 'https://pixieed.jp', href: 'https://pixieed.jp/globe/' };
    const layeredFrame = new EventHub();
    layeredFrame.tagName = 'IFRAME';
    layeredFrame.contentWindow = {};
    layeredFrame.getAttribute = name => name === 'src' ? `${url.pathname}${url.search}` : null;
    const layeredSent = [];
    const dispose = installGlobeAnalyticsBridge({ windowRef: layeredWindow, documentRef: { querySelector: () => layeredFrame }, send: (...args) => layeredSent.push(args) });
    layeredWindow.dispatch('message', { origin: 'https://pixieed.jp', source: layeredFrame.contentWindow, data: state.payload(1) });
    assert.deepEqual(layeredSent, [['select_content', { content_type: 'event' }]]);
    dispose();
  }
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

test('child storage exceptions deny reporting and repeated genuine actions get fresh sequences', () => {
  const originalWindow = globalThis.window;
  const posted = [];
  globalThis.window = {
    top: {}, self: {},
    location: { origin: 'https://pixieed.jp', protocol: 'https:', hostname: 'pixieed.jp' },
    localStorage: { getItem() { throw new Error('storage unavailable'); } },
    parent: { postMessage: (...args) => posted.push(args) }
  };
  try {
    assert.equal(trackGlobeEvent('select_content', { content_type: 'event' }), false);
    assert.deepEqual(posted, []);
    globalThis.window.localStorage.getItem = () => null;
    assert.equal(trackGlobeEvent('select_content', { content_type: 'event' }), true);
    assert.equal(trackGlobeEvent('select_content', { content_type: 'event' }), true);
    assert.equal(posted.length, 2);
    assert.ok(posted[1][0].sequence > posted[0][0].sequence);
    assert.deepEqual(posted.map((entry) => entry[1]), ['https://pixieed.jp', 'https://pixieed.jp']);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('parent listener consumes a sequence even when the analytics sender throws', () => {
  const sent = [];
  let attempts = 0;
  const state = setup((name, params) => {
    if (attempts++ === 0) throw new Error('analytics unavailable');
    sent.push([name, params]);
  });
  assert.doesNotThrow(() => state.message(state.payload(1)));
  state.message(state.payload(1));
  state.message(state.payload(2, 'event_outbound', { link_kind: 'ticket' }));
  assert.deepEqual(sent, [['event_outbound', { link_kind: 'ticket' }]]);
  state.dispose();
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
