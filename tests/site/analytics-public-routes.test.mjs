import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map([['PiXiEED:analytics-consent:v1', 'granted']]);
const documentEvents = new Map();
globalThis.localStorage = { getItem(key) { return storage.get(key) ?? null; } };
globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.location = {
  hostname: 'pixieed.jp', protocol: 'https:', origin: 'https://pixieed.jp', pathname: '/', search: '', hash: ''
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

const analytics = await import('../../js/site-analytics.mjs?public-routes-test');
const eventRows = () => window.dataLayer.filter(entry => entry?.[0] === 'event');
function pageView(pathname, search = '', hash = '') {
  Object.assign(location, { pathname, search, hash });
  assert.equal(analytics.trackSiteEvent('page_view', {}), true);
  return { ...eventRows().at(-1)[2] };
}

const routes = [
  ['/feed/', 'feed'],
  ['/explore/', 'explore'],
  ['/learn/', 'learn'],
  ['/learn/pixel-circle/', 'learn-pixel-circle'],
  ['/learn/pixel-art-blurry/', 'learn-pixel-art-blurry'],
  ['/tools/start/draw/', 'tools-start-draw'],
  ['/tools/start/convert/', 'tools-start-convert'],
  ['/output/work/', 'output-work']
];

test('fixed public routes retain a stable page slug and path', () => {
  for (const [path, slug] of routes) {
    const event = pageView(path);
    assert.equal(event.tool, slug, path);
    assert.equal(event.page_title, slug, path);
    assert.equal(event.page_path, path, path);
    assert.equal(event.page_location, `https://pixieed.jp${path}`, path);
  }
});

test('index.html aliases classify exactly like their public route', () => {
  for (const [path, slug] of routes) {
    const event = pageView(`${path}index.html`);
    assert.equal(event.tool, slug, path);
    assert.equal(event.page_path, path, path);
    assert.equal(event.page_location, `https://pixieed.jp${path}`, path);
  }
});

test('query strings and fragments are excluded from the reported page location', () => {
  const event = pageView('/feed/', '?email=person@example.com&token=private', '#private-fragment');
  assert.equal(event.page_location, 'https://pixieed.jp/feed/');
  assert.equal(event.page_path, '/feed/');
  assert.equal(event.tool, 'feed');
});

test('unknown and personal-data paths stay collapsed to other', () => {
  for (const path of ['/unlisted/section/', '/people/person@example.com/private-id/']) {
    const event = pageView(path);
    assert.equal(event.tool, 'other');
    assert.equal(event.page_title, 'other');
    assert.equal(event.page_path, '/other/');
    assert.equal(event.page_location, 'https://pixieed.jp/other/');
  }
});

test('existing detail routes keep their identifier mask', () => {
  for (const [path, slug, safePath] of [
    ['/stores/cafe-hoshi/', 'store', '/stores/:id/'],
    ['/works/sea-cat/', 'works', '/works/:id/'],
    ['/shops/example-shop/', 'shops', '/shops/:id/'],
    ['/events/pixelween-2026/', 'event', '/events/:id/']
  ]) {
    const event = pageView(path);
    assert.equal(event.tool, slug, path);
    assert.equal(event.page_path, safePath, path);
    assert.equal(event.page_location, `https://pixieed.jp${safePath}`, path);
  }
});
