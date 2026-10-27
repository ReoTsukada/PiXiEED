import test from 'node:test';
import assert from 'node:assert/strict';
import { outputGuideAdConfig } from '../../data/output-guide-ad-config.mjs';
import { ordinaryAdConfig } from '../../data/ordinary-ad-config.mjs?rev=20261024-ordinary-ad-config-1';
import { mountOutputGuideAd, resolveOutputGuideAd } from '../../js/ads/output-guide-ad.mjs';

// A local DOM fixture: no network, vendor code, impressions or clicks.
function fixture({ url = 'https://pixieed.jp/output/', top = 100, existingSdk = false,
  blocked = false, visibility = 'visible' } = {}) {
  const scripts = [], units = [];
  const rect = { top, bottom: top + 300, width: 300, height: 300 };
  const element = () => Object.assign(new EventTarget(), { style: {}, dataset: {} });
  if (existingSdk) scripts.push(Object.assign(element(), {
    src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${outputGuideAdConfig.unit.client}`,
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
    head: { append: script => scripts.push(script) },
  });
  let requests = 0;
  const win = Object.assign(new EventTarget(), {
    location: new URL(url), innerHeight: 800,
    getComputedStyle: () => ({ visibility: 'visible' }),
    adsbygoogle: { push() { requests++; if (blocked) throw new Error('Simulated blocked SDK'); } },
  });
  win.top = win.self = win;
  return { doc, win, host, rect, scripts, units, get requests() { return requests; } };
}
const mount = f => mountOutputGuideAd({ doc: f.doc, win: f.win, config: outputGuideAdConfig });

test('public guide enables the existing ordinary display unit', () => {
  assert.equal(outputGuideAdConfig.enabled, true);
  assert.equal(outputGuideAdConfig.unit, ordinaryAdConfig.feed.unit);
  assert.deepEqual(resolveOutputGuideAd(outputGuideAdConfig), {
    client: ordinaryAdConfig.feed.unit.client, slot: ordinaryAdConfig.feed.unit.slot,
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
