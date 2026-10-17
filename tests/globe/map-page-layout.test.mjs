import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeMapPageLayout } from '../../js/globe/map-page-layout.mjs';

function fixture({ withCta = true } = {}) {
  const sizes = { header: 72, cta: withCta ? 76.1875 : 0, directory: 44 };
  const elements = {
    '.site-header': { key: 'header', getBoundingClientRect: () => ({ height: sizes.header, top: 0 }) },
    '.site-draw-cta': withCta ? { key: 'cta', getBoundingClientRect: () => ({ height: sizes.cta, top: 72 }) } : null,
    '.map-page-directory-link': { key: 'directory', getBoundingClientRect: () => ({ height: sizes.directory, top: 72 + sizes.cta }) }
  };
  const writes = [], observed = [], listeners = new Map();
  const body = {
    classList: { contains: value => value === 'app-page--tool-globe' },
    style: { setProperty(name, value) { writes.push([name, value]); } }
  };
  const fontsListeners = new Map();
  const documentObject = {
    body,
    fonts: {
      ready: Promise.resolve(),
      addEventListener(name, listener) { fontsListeners.set(name, listener); },
      removeEventListener(name) { fontsListeners.delete(name); }
    },
    querySelector(selector) { return elements[selector] || null; }
  };
  const windowObject = {
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); }
  };
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; }
    observe(target) { observed.push(target.key); }
    disconnect() { this.disconnected = true; }
  }
  return { sizes, elements, writes, observed, listeners, fontsListeners, documentObject, windowObject, FakeResizeObserver };
}

test('map viewport chrome height includes the built CTA and tracks resize/font geometry only', async () => {
  const f = fixture();
  const dispose = initializeMapPageLayout({ documentObject: f.documentObject, windowObject: f.windowObject, ResizeObserverImpl: f.FakeResizeObserver });
  assert.deepEqual(f.writes.at(-1), ['--map-page-chrome-height', '192.1875px']);
  assert.deepEqual(f.observed, ['header', 'cta', 'directory']);

  // A scroll-only change to top coordinates must not alter the reserved height.
  f.elements['.site-header'].getBoundingClientRect = () => ({ height: 72, top: -300 });
  f.listeners.get('resize')();
  assert.equal(f.writes.length, 1);

  f.sizes.cta = 114;
  f.elements['.site-draw-cta'].getBoundingClientRect = () => ({ height: f.sizes.cta, top: -228 });
  f.fontsListeners.get('loadingdone')();
  assert.deepEqual(f.writes.at(-1), ['--map-page-chrome-height', '230px']);
  await Promise.resolve();
  dispose();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.fontsListeners.size, 0);
});

test('source markup without the injected CTA still measures header and directory link', () => {
  const f = fixture({ withCta: false });
  initializeMapPageLayout({ documentObject: f.documentObject, windowObject: f.windowObject, ResizeObserverImpl: f.FakeResizeObserver });
  assert.deepEqual(f.writes.at(-1), ['--map-page-chrome-height', '116px']);
  assert.deepEqual(f.observed, ['header', 'directory']);
});

test('Pages build explicitly includes the new globe layout module', async () => {
  const build = await readFile(new URL('../../scripts/build-pages-site.mjs', import.meta.url), 'utf8');
  assert.match(build, /'js\/globe\/map-page-layout\.mjs'/);
});
