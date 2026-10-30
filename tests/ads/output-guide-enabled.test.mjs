import test from 'node:test';
import assert from 'node:assert/strict';
import { outputGuideAdConfig } from '../../data/output-guide-ad-config.mjs';
import { displayAdConfig } from '../../data/site-config.js?rev=20261008-map-detail-1';
import { getAdsenseLoader } from '../../js/display-ads.mjs?rev=20261030-event-inline-ads-1';
import { mountOutputGuideAd, resolveOutputGuideAd, getOutputGuideAdLayout } from '../../js/ads/output-guide-ad.mjs';

// A local DOM fixture: no network, vendor code, impressions or clicks.
function fixture({ url = 'https://pixieed.jp/output/', top = 100, existingSdk = false,
  sdkQuery = true, blocked = false, visibility = 'visible', width = 390 } = {}) {
  const scripts = [], units = [];
  const rect = { top, bottom: top + 300, width: 300, height: 300 };
  const element = () => Object.assign(new EventTarget(), { style: {}, dataset: {}, isConnected: false });
  if (existingSdk) scripts.push(Object.assign(element(), {
    src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
      + (sdkQuery ? `?client=${outputGuideAdConfig.unit.client}` : ''),
    isConnected: true,
  }));
  const slot = { append: unit => units.push(unit) };
  const host = { hidden: true, dataset: {}, isConnected: true,
    querySelector: selector => selector === '[data-output-guide-ad-slot]' ? slot : null,
    getBoundingClientRect: () => rect, getClientRects: () => [rect] };
  const main = { textContent: 'Public conversion format documentation. '.repeat(20),
    contains: node => node === host };
  const doc = Object.assign(new EventTarget(), {
    body: { dataset: { outputMonetization: 'guide-v1' }, classList: { contains: () => false } },
    documentElement: { dataset: {}, hasAttribute: () => false },
    visibilityState: visibility,
    querySelectorAll: selector => selector === '[data-output-guide-ad]' ? [host] : [],
    querySelector: selector => selector === 'main#main' ? main
      : selector.startsWith('script[') ? scripts[0] || null : null,
    createElement: element,
    head: { append: script => { script.isConnected = true; scripts.push(script); } },
  });
  let requests = 0;
  const win = Object.assign(new EventTarget(), {
    location: new URL(url), innerHeight: 800, innerWidth: width,
    getComputedStyle: () => ({ visibility: 'visible' }),
    adsbygoogle: { push() { requests++; if (blocked) throw new Error('Simulated blocked SDK'); } },
  });
  win.top = win.self = win;
  return { doc, win, host, rect, scripts, units, get requests() { return requests; } };
}
const mount = f => mountOutputGuideAd({ doc: f.doc, win: f.win, config: outputGuideAdConfig });

test('public guide uses the same publisher and ordinary unit as the tools page', () => {
  assert.equal(outputGuideAdConfig.enabled, true);
  assert.deepEqual(resolveOutputGuideAd(outputGuideAdConfig), {
    client: displayAdConfig.client, slot: displayAdConfig.slots.tools,
  });
});

test('enabled guide requests one unit once and reuses its mount', () => {
  const f = fixture();
  const result = mount(f);
  assert.equal(result.mounted, true);
  assert.equal(result.requested, true);
  assert.equal(f.host.hidden, false);
  assert.equal(f.units.length, 1);
  assert.equal(f.units[0].dataset.adClient, outputGuideAdConfig.unit.client);
  assert.equal(f.units[0].dataset.adSlot, outputGuideAdConfig.unit.slot);
  assert.equal(f.scripts.length, 1);
  assert.equal(mount(f), result);
  for (const name of ['scroll', 'resize', 'scroll']) f.win.dispatchEvent(new Event(name));
  assert.equal(f.requests, 1);
  result.cleanup();
});

test('offscreen unit waits until near the viewport without preloading the SDK', () => {
  const f = fixture({ top: 3000 });
  const result = mount(f);
  assert.equal(f.requests, 0);
  assert.equal(f.scripts.length, 0);
  f.rect.top = 700; f.rect.bottom = 1000;
  f.win.dispatchEvent(new Event('scroll'));
  assert.equal(f.requests, 1);
  assert.equal(f.scripts.length, 1);
  result.cleanup();
});

test('existing publisher SDK is reused instead of added twice', () => {
  const f = fixture({ existingSdk: true });
  const result = mount(f);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.requests, 1);
  result.cleanup();
});

test('blocked advertising does not throw or retry', () => {
  const f = fixture({ blocked: true });
  const result = mount(f);
  assert.equal(f.host.dataset.adState, 'unfilled');
  f.win.dispatchEvent(new Event('scroll'));
  f.win.dispatchEvent(new Event('resize'));
  assert.equal(f.requests, 1);
  result.cleanup();
});

for (const url of ['https://pixieed.jp/output/work/', 'https://pixieed.jp/output/?id=private',
  'https://preview.pixieed.jp/output/', 'http://localhost:4173/output/']) {
  test(`enabled configuration still excludes ${url}`, () => {
    const f = fixture({ url });
    assert.equal(mount(f).mounted, false);
    assert.equal(f.requests, 0);
    assert.equal(f.units.length, 0);
    assert.equal(f.scripts.length, 0);
  });
}

test('hidden tab waits for visibility before requesting', () => {
  const f = fixture({ visibility: 'hidden' });
  const result = mount(f);
  assert.equal(f.requests, 0);
  f.doc.visibilityState = 'visible';
  f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.requests, 1);
  result.cleanup();
});

test('placement kill switch prevents the unit and SDK from mounting', () => {
  const f = fixture();
  const result = mountOutputGuideAd({ doc: f.doc, win: f.win,
    config: { ...outputGuideAdConfig, enabled: false } });
  assert.equal(result.mounted, false);
  assert.equal(f.requests, 0);
  assert.equal(f.units.length, 0);
  assert.equal(f.scripts.length, 0);
});

test('existing SDK without a client query is reused, as on the tools page', () => {
  const f = fixture({ existingSdk: true, sdkQuery: false });
  const result = mount(f);
  assert.equal(f.requests, 1);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.host.dataset.adState, 'requested');
  result.cleanup();
});

test('guide and tools loader share one SDK instance and failure state', () => {
  const f = fixture();
  const shared = getAdsenseLoader(f.doc, f.win, displayAdConfig.client);
  const result = mount(f);
  assert.equal(getAdsenseLoader(f.doc, f.win, displayAdConfig.client), shared);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.requests, 1);
  f.scripts[0].dispatchEvent(new Event('error'));
  assert.equal(shared.failed, true);
  assert.equal(f.host.dataset.adState, 'unfilled');
  f.win.dispatchEvent(new Event('scroll'));
  assert.equal(f.requests, 1);
  result.cleanup();
});

test('an already failed shared loader does not issue a new request', () => {
  const f = fixture();
  getAdsenseLoader(f.doc, f.win, displayAdConfig.client).script.dispatchEvent(new Event('error'));
  const result = mount(f);
  assert.equal(f.requests, 0);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.host.dataset.adState, 'unfilled');
  result.cleanup();
});

test('cleanup removes guide callbacks from the shared loader', () => {
  const f = fixture();
  const result = mount(f);
  const shared = getAdsenseLoader(f.doc, f.win, displayAdConfig.client);
  assert.equal(shared.errors.size, 1);
  result.cleanup();
  assert.equal(shared.errors.size, 0);
});

test('wide screens request a vertical 600px unit', () => {
  const f = fixture({ width: 1440 });
  const result = mount(f);
  assert.equal(f.host.dataset.adLayout, 'vertical');
  assert.equal(f.units[0].dataset.adFormat, 'vertical');
  assert.equal(f.units[0].style.height, '600px');
  assert.equal(f.units[0].dataset.fullWidthResponsive, 'false');
  assert.equal(f.requests, 1);
  result.cleanup();
});

test('mobile screens request a rectangle without a desktop-height blank space', () => {
  const f = fixture({ width: 390 });
  const result = mount(f);
  assert.equal(f.host.dataset.adLayout, 'rectangle');
  assert.equal(f.units[0].dataset.adFormat, 'rectangle');
  assert.equal(f.units[0].style.height, '250px');
  result.cleanup();
});

test('layout breakpoint matches CSS and media queries take precedence', () => {
  assert.equal(getOutputGuideAdLayout({ innerWidth: 1119 }), 'rectangle');
  assert.equal(getOutputGuideAdLayout({ innerWidth: 1120 }), 'vertical');
  assert.equal(getOutputGuideAdLayout({ innerWidth: 1500, matchMedia: query => {
    assert.equal(query, '(min-width:1120px)'); return { matches: false };
  } }), 'rectangle');
});

test('resize before first request selects the current layout', () => {
  const f = fixture({ width: 1440, top: 3000 });
  const result = mount(f);
  assert.equal(f.requests, 0);
  f.win.innerWidth = 390;
  f.rect.top = 100; f.rect.bottom = 400;
  f.win.dispatchEvent(new Event('resize'));
  assert.equal(f.requests, 1);
  assert.equal(f.units[0].dataset.adFormat, 'rectangle');
  assert.equal(f.units[0].style.height, '250px');
  result.cleanup();
});

test('resize after requesting never replaces or refreshes the creative', () => {
  const f = fixture({ width: 1440 });
  const result = mount(f);
  f.win.innerWidth = 390;
  for (const name of ['resize', 'scroll', 'resize']) f.win.dispatchEvent(new Event(name));
  assert.equal(f.requests, 1);
  assert.equal(f.units.length, 1);
  assert.equal(f.units[0].dataset.adFormat, 'vertical');
  assert.equal(f.units[0].style.height, '600px');
  result.cleanup();
});

test('too-narrow space never requests an ad until a safe width is available', () => {
  const f = fixture();
  f.rect.width = 200;
  const result = mount(f);
  assert.equal(f.requests, 0);
  f.rect.width = 300;
  f.win.dispatchEvent(new Event('resize'));
  assert.equal(f.requests, 1);
  result.cleanup();
});
