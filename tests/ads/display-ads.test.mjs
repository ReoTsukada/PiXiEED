import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { displayAdConfig } from '../../data/site-config.js';
import { mountDisplayAds, resolveDisplayAd } from '../../js/display-ads.mjs';

const pages = [
  ['index.html', 'home', '/'], ['tools/index.html', 'tools', '/tools/'],
  ['about/index.html', 'info', '/about/'], ['guide/index.html', 'info', '/guide/'],
  ['stores/index.html', 'stores', '/stores/'],
  ['stores/ecowashcafe-nakanoshima.html', 'store-detail', '/stores/ecowashcafe-nakanoshima.html']
];
const config = { client: 'ca-pub-9801602250480253', slots: Object.fromEntries(pages.map(([, key]) => [key, '1234567890'])) };
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public placements use the owner-provided pages unit; blank configuration remains inactive', () => {
  const blank = { ...displayAdConfig, slots: {} };
  for (const [, key, path] of pages) {
    assert.deepEqual(resolveDisplayAd(displayAdConfig, key, path), { client: 'ca-pub-9801602250480253', slot: '8825932060' });
    assert.equal(resolveDisplayAd(blank, key, path), null);
  }
});
test('each configured placement belongs only to its explicit public page', () => {
  for (const [, key, path] of pages) {
    assert.deepEqual(resolveDisplayAd(config, key, path), { client: config.client, slot: '1234567890' });
    if (path.endsWith('/')) assert.ok(resolveDisplayAd(config, key, path + 'index.html'));
  }
});
test('blank, malformed and mistyped unit IDs never request advertising', () => {
  for (const slot of ['', ' ', '12345', 'abc', 'ca-pub-9801602250480253', '/23379831154/pixieed_rewarded', 1234567890, null]) {
    assert.equal(resolveDisplayAd({ ...config, slots: { home: slot } }, 'home', '/'), null);
  }
  assert.deepEqual(resolveDisplayAd({ ...config, slots: { home: ' 1234567890 ' } }, 'home', '/'), { client: config.client, slot: '1234567890' });
});
test('private and working screens stay excluded even with a valid unit ID', () => {
  for (const path of ['/privacy/', '/profile/', '/collection/', '/admin/', '/draw/', '/audio/', '/jigsaw/', '/globe/', '/pixel-camera.html', '/play/spot-difference/']) {
    for (const key of Object.keys(config.slots)) assert.equal(resolveDisplayAd(config, key, path), null);
  }
  assert.equal(resolveDisplayAd(config, 'info', '/stores/cafe-hoshi.html'), null);
});
test('map detail has one explicit top-level public route owner and cannot run on embedded or private pages', () => {
  const mapConfig = { ...config, slots: { 'map-detail': '1234567890' } };
  assert.deepEqual(resolveDisplayAd(displayAdConfig, 'map-detail', '/globe/'), { client: displayAdConfig.client, slot: '8825932060' });
  assert.ok(resolveDisplayAd(mapConfig, 'map-detail', '/globe/index.html'));
  for (const path of ['/globe-prototype.html', '/profile/', '/privacy/', '/stores/']) {
    assert.equal(resolveDisplayAd(mapConfig, 'map-detail', path), null);
  }
});
test('incorrect publisher and unknown placement are rejected', () => {
  assert.equal(resolveDisplayAd({ ...config, client: '/23379831154/' }, 'home', '/'), null);
  assert.equal(resolveDisplayAd(config, 'draw', '/draw/'), null);
});
test('a result that lacks safe space is skipped before creating or requesting an ad', () => {
  const inner = {};
  const node = { dataset: { displayAd: 'draw-result' }, hidden: true, querySelector: () => inner };
  const root = {
    querySelectorAll: () => [node],
    createElement() { assert.fail('no ad unit may be created'); }
  };
  const win = { location: { protocol: 'http:', pathname: '/draw/' } };
  win.top = win.self = win;
  let checked = 0;
  const cleanup = mountDisplayAds({ root, win, config: { client: config.client, slots: { 'draw-result': '1234567890' } },
    canMount(candidate) { assert.equal(candidate, node); checked++; return false; } });
  assert.equal(checked, 1);
  assert.equal(node.hidden, true);
  assert.equal(node.dataset.adState, undefined);
  assert.equal(win.adsbygoogle, undefined);
  assert.equal(typeof cleanup, 'function');
});
for (const [path, key] of pages) test(`${path}: configured hidden flow-layout ads stay outside interactive content`, async () => {
  const source = await read(path);
  const expectedCount = ['home', 'tools'].includes(key) ? 2 : 1;
  const ads = [...source.matchAll(/<aside\b[^>]*data-display-ad="[^"]+"[^>]*>/g)];
  assert.equal(ads.length, expectedCount);
  const mainStart = source.indexOf('<main');
  const mainEnd = source.indexOf('</main>');
  for (const ad of ads) {
    assert.ok(ad[0].includes(`data-display-ad="${key}"`) && ad[0].includes('data-ad-reserve'));
    assert.ok(ad.index > mainStart && ad.index < mainEnd);
  }
  assert.ok(!source.includes('<ins'), 'AdSense units are created only after a valid ID is configured');
  assert.equal((source.match(/src="\/js\/display-ads\.mjs/g) || []).length, 1);
  assert.equal((source.match(/href="\/css\/display-ads\.css/g) || []).length, 1);
  if (key === 'home') {
    const galleryEnd = source.indexOf('</section>', source.indexOf('data-home-feed'));
    const storesStart = source.indexOf('<section class="section section--paper-deep">');
    assert.ok(ads[0].index > galleryEnd && ads[0].index < storesStart, 'first home slot follows the gallery and precedes stores');
    assert.ok(!ads[0][0].includes('px-display-ad--interactive-clearance'), 'the gallery supplies the buffer from interactive toys');
    assert.ok(ads[1].index > source.indexOf('data-home-stores') && ads[1].index < source.indexOf('</main>'));
  }
  if (key === 'tools') {
    assert.ok(ads[0].index > source.indexOf('data-tool-preview="game"') && ads[0].index < source.indexOf('tool-shell__head--games'));
    assert.ok(ads[1].index > source.indexOf('href="/play/hidden-object/"') && ads[1].index < source.indexOf('class="tool-note"'));
  }
});
test('working and private HTML has no manual slot or renderer', async () => {
  for (const path of ['pixel-camera.html', 'globe-prototype.html', 'draw/index.html', 'audio/index.html', 'jigsaw/index.html', 'spot-difference/index.html', 'hidden-object/index.html', 'play/spot-difference/index.html', 'play/hidden-object/index.html', 'profile/index.html', 'privacy/index.html']) {
    assert.doesNotMatch(await read(path), /data-display-ad=|src="\/js\/display-ads\.mjs/);
  }
});
test('unit CSS reserves size without cropping, floating or animating a creative', async () => {
  const css = await read('css/display-ads.css');
  assert.match(css, /\.px-display-ad\[hidden\]\s*\{\s*display: none !important/);
  assert.match(css, /\.px-display-ad\[data-ad-reserve\][\s\S]*?min-height: var\(--px-display-ad-reserved-height\)/);
  assert.match(css, /px-display-ad--interactive-clearance[\s\S]*?margin-block-start: 150px/);
  assert.match(css, /height: 100px/);
  assert.match(css, /height: 90px/);
  assert.doesNotMatch(css, /overflow\s*:\s*hidden|position\s*:\s*(fixed|absolute)|transform\s*:|animation\s*:/);
  const source = await read('js/display-ads.mjs');
  assert.match(source, /getAdsenseLoader\(doc, win, resolved\.client\)/);
  assert.match(source, /node\.hasAttribute\('data-ad-reserve'\)/);
});
test('multiple placements mount once each and later calls still mount a newly eligible unit', () => {
  const units = []; let disconnected = 0;
  const nodes = [0, 1, 2].map(() => ({
    dataset: { displayAd: 'home' }, hidden: true,
    querySelector() { return { append(unit) { units.push(unit); } }; }
  }));
  const scripts = [];
  const doc = { visibilityState: 'visible', querySelector: () => null,
    head: { append(script) { script.isConnected = true; scripts.push(script); } },
    createElement(tag) { return tag === 'script'
      ? { addEventListener() {}, isConnected: false }
      : { dataset: {}, style: {}, getBoundingClientRect: () => ({ width: 320 }) }; },
    addEventListener() {}, removeEventListener() {} };
  const root = { ownerDocument: doc, querySelectorAll: () => nodes };
  const win = { location: { protocol: 'https:', pathname: '/' },
    MutationObserver: class { observe() {} disconnect() { disconnected++; } } };
  win.top = win.self = win;
  const cleanup = mountDisplayAds({ root, win, config, canMount: (node) => node !== nodes[2] });
  assert.equal(units.length, 2); assert.equal(win.adsbygoogle.length, 2); assert.equal(scripts.length, 1);
  const laterCleanup = mountDisplayAds({ root, win, config });
  assert.equal(units.length, 3); assert.equal(win.adsbygoogle.length, 3);
  mountDisplayAds({ root, win, config });
  assert.equal(units.length, 3); assert.equal(win.adsbygoogle.length, 3);
  cleanup(); laterCleanup(); assert.equal(disconnected, 3);
});
