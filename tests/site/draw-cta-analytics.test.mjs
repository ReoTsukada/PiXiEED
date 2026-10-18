import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map([['PiXiEED:analytics-consent:v1', 'granted']]);
const documentEvents = new Map();
const windowEvents = new Map();
globalThis.localStorage = { getItem(key) { return storage.get(key) ?? null; } };
globalThis.sessionStorage = { getItem() { return null; } };
globalThis.location = { hostname: 'pixieed.jp', protocol: 'https:', origin: 'https://pixieed.jp', pathname: '/events/sample/', search: '' };
globalThis.history = {};
globalThis.window = {
  location: globalThis.location,
  addEventListener(name, listener) { windowEvents.set(name, listener); },
  dataLayer: []
};
window.top = window.self = window;
globalThis.document = {
  body: { dataset: {} },
  head: { append() {} },
  addEventListener(name, listener) { documentEvents.set(name, listener); },
  createElement() { return {}; }
};

const analytics = await import('../../js/site-analytics.mjs');
const eventRows = () => window.dataLayer.filter(entry => entry?.[0] === 'event');
function clickEvent({ trusted = true, prevented = false, button = 0, href = '/draw/', marked = true, markerOnAnchor = false } = {}) {
  const cta = { dataset: { drawContext: 'event' } };
  const anchor = {
    dataset: { drawContext: 'creation' },
    closest(selector) { return selector === '[data-draw-cta]' && marked ? (markerOnAnchor ? anchor : cta) : null; }
  };
  return {
    target: {
      closest(selector) {
        if (selector === 'a[href="/draw/"],a[href="/draw/?workspace=1"]') return ['/draw/', '/draw/?workspace=1'].includes(href) ? anchor : null;
        return null;
      }
    },
    isTrusted: trusted, defaultPrevented: prevented, button
  };
}

test('draw CTA source clicks use the existing consent-gated event with a fixed context enum', () => {
  const listener = documentEvents.get('click');
  const before = eventRows().length;
  listener(clickEvent());
  assert.deepEqual({ ...eventRows().at(-1)[2] }, {
    tool: 'event', content_type: 'tool', content_id: 'draw_cta_event'
  });
  assert.equal(eventRows().length, before + 1);

  listener(clickEvent({ markerOnAnchor: true }));
  assert.equal(eventRows().at(-1)[2].content_id, 'draw_cta_creation', 'an authored anchor can be its own CTA marker');
  listener(clickEvent({ href: '/draw/?workspace=1' }));
  assert.equal(eventRows().at(-1)[2].content_id, 'draw_cta_event', 'focused launch keeps the same source event');
  const afterValid = eventRows().length;

  listener(clickEvent({ trusted: false }));
  listener(clickEvent({ button: 1 }));
  listener(clickEvent({ prevented: true }));
  listener(clickEvent({ href: '/tools/' }));
  listener(clickEvent({ marked: false }));
  listener({ target: { closest(selector) { return selector === '[data-draw-cta]' ? { dataset: { drawContext: 'event' } } : null; } }, isTrusted: true, defaultPrevented: false, button: 0 });
  assert.equal(eventRows().length, afterValid, 'blank-container, wrong-link, untrusted, prevented, and non-primary clicks do not count');

  analytics.trackSiteEvent('select_content', {
    content_type: 'tool', content_id: 'private-title-or-url', title: 'secret'
  });
  assert.deepEqual({ ...eventRows().at(-1)[2] }, { tool: 'event', content_type: 'tool' });
});

test('denied consent prevents CTA click collection', () => {
  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  documentEvents.get('pixieed:analytics-consent-change')();
  const before = eventRows().length;
  documentEvents.get('click')(clickEvent());
  assert.equal(eventRows().length, before);
});
