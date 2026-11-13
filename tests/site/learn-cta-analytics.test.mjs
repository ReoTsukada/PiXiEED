import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map([['PiXiEED:analytics-consent:v1', 'granted']]);
const documentEvents = new Map();
globalThis.localStorage = { getItem(key) { return storage.get(key) ?? null; } };
globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.location = {
  hostname: 'pixieed.jp', protocol: 'https:', origin: 'https://pixieed.jp', pathname: '/learn/', search: '', hash: ''
};
globalThis.history = {};
globalThis.window = {
  location: globalThis.location,
  addEventListener() {},
  dataLayer: []
};
window.top = window.self = window;
globalThis.document = {
  body: { dataset: {} },
  head: { append() {} },
  addEventListener(name, listener) { documentEvents.set(name, listener); },
  createElement() { return {}; }
};

const analytics = await import('../../js/site-analytics.mjs?learn-cta-test');
const clickListener = documentEvents.get('click');
const eventRows = () => window.dataLayer.filter(entry => entry?.[0] === 'event');
const selectContentRows = () => eventRows().filter(entry => entry[1] === 'select_content');

function click({ marker = 'draw', href = '/tools/start/draw/', trusted = true, button = 0, prevented = false } = {}) {
  const anchor = {
    dataset: { learnCta: marker },
    getAttribute(name) { return name === 'href' ? href : null; }
  };
  return {
    target: {
      closest(selector) {
        if (selector === 'a[href="/draw/"],a[href="/draw/?workspace=1"]') return null;
        if (selector === '[data-commerce-link], [data-yahoo-commerce-link]') return null;
        return selector === 'a[data-learn-cta]' && marker !== null ? anchor : null;
      }
    },
    isTrusted: trusted, button, defaultPrevented: prevented
  };
}
function dispatch(options) {
  const event = click(options);
  clickListener(event);
  return event;
}
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

test('learn draw, convert, and books links emit fixed select_content enums', async () => {
  const cases = [
    ['/learn/', 'draw', '/tools/start/draw/', 'learn_cta_draw', 'learn'],
    ['/learn/pixel-circle/', 'convert', '/tools/start/convert/', 'learn_cta_convert', 'learn-pixel-circle'],
    ['/learn/pixel-art-blurry/', 'books', '/books/', 'learn_cta_books', 'learn-pixel-art-blurry']
  ];
  const before = selectContentRows().length;
  for (const [path, marker, href, contentId, pageTool] of cases) {
    location.pathname = path;
    const event = dispatch({ marker, href });
    assert.equal(event.defaultPrevented, false, 'measurement does not cancel navigation');
    location.pathname = '/about/';
    await nextTask();
    assert.deepEqual({ ...selectContentRows().at(-1)[2] }, {
      tool: pageTool, content_type: 'tool', content_id: contentId
    });
  }
  assert.equal(selectContentRows().length, before + cases.length);
});

test('only exact CTA kind, destination, learn page, and real primary click are counted', async () => {
  const before = selectContentRows().length;
  location.pathname = '/learn/';
  dispatch({ marker: 'draw', href: '/tools/start/convert/' });
  dispatch({ marker: 'unknown', href: '/tools/start/draw/' });
  dispatch({ marker: 'draw', href: '/tools/start/draw/?email=person@example.com' });
  dispatch({ marker: 'draw', href: '/tools/start/draw/', trusted: false });
  dispatch({ marker: 'draw', href: '/tools/start/draw/', button: 1 });
  dispatch({ marker: 'draw', href: '/tools/start/draw/', prevented: true });
  location.pathname = '/about/';
  dispatch({ marker: 'draw', href: '/tools/start/draw/' });
  await nextTask();
  assert.equal(selectContentRows().length, before);

  location.pathname = '/learn/';
  const cancelled = dispatch({ marker: 'draw', href: '/tools/start/draw/' });
  await Promise.resolve();
  assert.equal(selectContentRows().length, before, 'the event waits until the current dispatch finishes');
  cancelled.defaultPrevented = true;
  await nextTask();
  assert.equal(selectContentRows().length, before, 'later target or bubble cancellation suppresses collection');
});

test('existing consent and iframe boundaries suppress learn CTA collection', async () => {
  const before = selectContentRows().length;
  location.pathname = '/learn/';
  window.self = {};
  dispatch({ marker: 'draw', href: '/tools/start/draw/' });
  await nextTask();
  assert.equal(selectContentRows().length, before, 'iframe boundary independently blocks collection');
  window.self = window.top;

  storage.set('PiXiEED:analytics-consent:v1', 'denied');
  documentEvents.get('pixieed:analytics-consent-change')();
  dispatch({ marker: 'draw', href: '/tools/start/draw/' });
  await nextTask();
  assert.equal(selectContentRows().length, before, 'denied consent independently blocks collection');
});
