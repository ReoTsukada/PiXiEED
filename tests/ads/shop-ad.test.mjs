import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SHOP_AD_MARKER, shopAdConfig } from '../../data/shop-ad-config.mjs';
import {
  isShopAdEligible, mountShopAd, resolveShopAdUnit,
  SHOP_AD_MIN_PRODUCTS, SHOP_AD_MIN_SAFE_WIDTH,
} from '../../js/ads/shop-ad.mjs';

const unit = shopAdConfig.unit;
const eligible = {
  config: shopAdConfig, origin: 'https://pixieed.jp', protocol: 'https:',
  pathname: '/books/', search: '', hash: '', topLevel: true,
  marker: SHOP_AD_MARKER, visibleProductCount: 9, publicContentLength: 600,
};

class FakeElement {
  constructor(tagName, doc, rect = {}) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = doc;
    this.dataset = {}; this.style = {}; this.children = []; this.attributes = {};
    this.isConnected = true; this.hidden = false; this.parentElement = null;
    this.textContent = ''; this.rect = { left: 14, top: 2000, right: 306, bottom: 2100, width: 292, height: 100, ...rect };
    this.className = '';
  }
  append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
  insertBefore(node, before) {
    if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
    node.parentElement = this; node.ownerDocument ||= this.ownerDocument; node.isConnected = this.isConnected;
    return node;
  }
  replaceChildren(...nodes) {
    for (const child of this.children) { child.parentElement = null; child.isConnected = false; }
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null; this.isConnected = false;
  }
  querySelector(selector) {
    if (selector === '[data-shop-ad-slot]') return this.children.find(child => child.dataset.shopAdSlot !== undefined) || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === '[data-product-id]') return this.children.filter(child => child.dataset.productId);
    return [];
  }
  contains(node) { return this === node || this.children.some(child => child.contains?.(node)); }
  getClientRects() { return this.isConnected && !this.hidden ? [{}] : []; }
  getBoundingClientRect() { return { ...this.rect }; }
}

function fixture({ url = 'https://pixieed.jp/books/', marker = SHOP_AD_MARKER,
  productCount = 12, width = 320, top = 2000, height = 844, hostWidth = width - 28,
  framed = false, privateContext = false, detailOpen = false, fullscreen = false,
  publicContentLength = 800 } = {}) {
  const intersectionObservers = [], mutationObservers = [], scripts = [];
  let pushes = 0, loaderCalls = 0;
  const doc = new EventTarget();
  const body = { dataset: { shopAd: marker }, classList: { contains: () => false } };
  const documentElement = { dataset: {}, hasAttribute: () => false };
  const grid = new FakeElement('div', doc, { left: 14, top: 0, right: width - 14, bottom: 1500, width: hostWidth, height: 1500 });
  const cards = Array.from({ length: productCount }, (_, index) => {
    const card = new FakeElement('article', doc); card.dataset.productId = `product-${index + 1}`; card.textContent = `Product ${index + 1}`; return card;
  });
  const host = new FakeElement('aside', doc, { left: 14, top, right: 14 + hostWidth, bottom: top + 140, width: hostWidth, height: 140 });
  host.dataset.shopDisplayAd = '';
  host.hidden = true;
  const slot = new FakeElement('div', doc, { left: 14, top: top + 28, right: 14 + hostWidth, bottom: top + 140, width: hostWidth, height: 112 });
  slot.dataset.shopAdSlot = '';
  host.append(slot);
  cards.forEach((card, index) => {
    if (index === 8) grid.append(host);
    grid.append(card);
  });
  if (productCount < 9) grid.append(host);
  const main = { textContent: '公共の商品カタログです。'.repeat(Math.ceil(publicContentLength / 13)) };
  Object.assign(doc, {
    body, documentElement, visibilityState: 'visible', fullscreenElement: fullscreen ? {} : null,
    querySelector(selector) {
      if (selector === '[data-product-grid]') return grid;
      if (selector === 'main#catalog, main' || selector === 'main') return main;
      if (selector.includes('#product-detail[open]') && detailOpen) return {};
      if (privateContext && selector.includes('[data-private-view]')) return {};
      return null;
    },
    querySelectorAll(selector) { return selector === '[data-shop-display-ad]' ? [host] : []; },
    createElement(tag) { const node = new FakeElement(tag, doc); scripts.push(node); return node; },
  });
  class MockIntersectionObserver {
    constructor(callback) { this.callback = callback; intersectionObservers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  }
  class MockMutationObserver {
    constructor(callback) { this.callback = callback; mutationObservers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  }
  const win = Object.assign(new EventTarget(), {
    location: new URL(url), history: { state: null }, innerWidth: width, innerHeight: height,
    IntersectionObserver: MockIntersectionObserver, MutationObserver: MockMutationObserver,
    getComputedStyle: () => ({ visibility: 'visible' }),
    adsbygoogle: { push() { pushes++; } },
  });
  win.top = framed ? {} : win; win.self = win;
  const loader = { failed: false, errors: new Set(), script: { addEventListener() {} } };
  const loadAdsense = () => { loaderCalls++; return loader; };
  return {
    doc, win, grid, host, slot, cards, scripts, loader,
    get pushes() { return pushes; }, get loaderCalls() { return loaderCalls; },
    get mutationObservers() { return mutationObservers; }, get intersectionObservers() { return intersectionObservers; },
    mount(config = shopAdConfig, timeoutMs = 15000) { return mountShopAd({ doc, win, config, loadAdsense, timeoutMs }); },
    enterNearView(nextTop = 700) {
      host.rect = { ...host.rect, top: nextTop, bottom: nextTop + 140 };
      slot.rect = { ...slot.rect, top: nextTop + 28, bottom: nextTop + 140 };
      for (const observer of intersectionObservers) observer.callback([{ target: host, isIntersecting: true }]);
    },
    setStatus(status) {
      const ins = slot.children[0];
      assert.ok(ins, 'the mocked creative was mounted before a status change');
      ins.dataset.adStatus = status;
      for (const observer of mutationObservers) if (observer.target === ins && !observer.disconnected) observer.callback();
      return ins;
    },
  };
}

test('shop config reuses the existing verified responsive Display unit without changing global inventory', () => {
  assert.equal(shopAdConfig.enabled, true);
  assert.equal(shopAdConfig.marker, 'catalog-v1');
  assert.equal(shopAdConfig.unit.client, 'ca-pub-9801602250480253');
  assert.equal(shopAdConfig.unit.slot, '4842737836');
  assert.deepEqual(resolveShopAdUnit(shopAdConfig), {
    client: unit.client, slot: unit.slot, format: 'display', placement: 'inline', size: 'responsive',
  });
});

test('only the explicit production shop route and public content pass eligibility', () => {
  assert.equal(isShopAdEligible(eligible), true);
  assert.equal(isShopAdEligible({ ...eligible, origin: 'https://www.pixieed.jp' }), true);
  for (const patch of [
    { origin: 'http://pixieed.jp' }, { origin: 'http://localhost:4173' },
    { origin: 'https://preview.pixieed.jp' }, { origin: 'https://pixieed.jp.evil.test' },
    { origin: 'https://pixieed.jp:444' }, { pathname: '/books' },
    { pathname: '/books/room-preview.html' }, { pathname: '/books/../books/' },
    { search: '?q=secret' }, { search: '?workspace=1' }, { hash: '#product=product-1' },
    { topLevel: false }, { marker: '' }, { fullscreen: true }, { editor: true },
    { privateContext: true }, { detailOpen: true }, { visibleProductCount: SHOP_AD_MIN_PRODUCTS - 1 },
    { publicContentLength: 199 },
  ]) assert.equal(isShopAdEligible({ ...eligible, ...patch }), false, JSON.stringify(patch));
  assert.equal(isShopAdEligible(), false);
});

test('malformed or disabled local configuration fails closed', () => {
  for (const patch of [{ enabled: false }, { marker: 'other' },
    { unit: { ...unit, verifiedActive: false } }, { unit: { ...unit, format: 'rewarded' } },
    { unit: { ...unit, placement: 'gutter' } }, { unit: { ...unit, size: 'auto' } },
    { unit: { ...unit, client: '' } }, { unit: { ...unit, client: 'ca-pub-123' } },
    { unit: { ...unit, slot: '' } }, { unit: { ...unit, slot: ' 4842737836 ' } },
    { unit: { ...unit, slot: 4842737836 } }]) {
    const badConfig = { ...shopAdConfig, ...patch };
    assert.equal(resolveShopAdUnit(badConfig), null);
    assert.equal(isShopAdEligible({ ...eligible, config: badConfig }), false);
  }
});

for (const url of [
  'http://pixieed.jp/books/', 'http://localhost:4173/books/',
  'https://preview.pixieed.jp/books/', 'https://pixieed.jp/books/room-preview.html',
  'https://pixieed.jp/books/?q=private-text', 'https://pixieed.jp/books/#product=product-1',
]) {
  test(`excluded context never creates a loader or request: ${url}`, () => {
    const f = fixture({ url });
    const result = f.mount();
    assert.equal(result.mounted, false);
    assert.equal(f.pushes, 0);
    assert.equal(f.loaderCalls, 0);
    assert.equal(f.scripts.length, 0);
    assert.equal(f.host.hidden, true);
  });
}

test('a frame, editor, fullscreen, private view, detail, or too-few-results context never mounts', () => {
  for (const options of [
    { framed: true }, { privateContext: true }, { detailOpen: true }, { fullscreen: true },
    { productCount: 8 }, { publicContentLength: 100 },
  ]) {
    const f = fixture(options);
    assert.equal(f.mount().mounted, false, JSON.stringify(options));
    assert.equal(f.loaderCalls, 0);
    assert.equal(f.pushes, 0);
  }
});

test('one responsive in-flow request waits until near the viewport and never refreshes', () => {
  const f = fixture({ top: 1400 });
  const result = f.mount();
  assert.equal(result.mounted, true);
  assert.equal(f.host.hidden, false);
  assert.equal(f.grid.children.indexOf(f.host), 8, 'placement starts after eight visible cards');
  assert.equal(result.requested, false);
  assert.equal(f.loaderCalls, 0);
  assert.equal(f.pushes, 0);
  assert.equal(f.mount(), result, 'duplicate mount returns the same document-owned instance');
  f.enterNearView(700);
  assert.equal(result.requested, true);
  assert.equal(f.loaderCalls, 1);
  assert.equal(f.pushes, 1);
  assert.equal(f.scripts.length, 1);
  const ins = f.slot.children[0];
  assert.equal(ins.dataset.adClient, unit.client);
  assert.equal(ins.dataset.adSlot, unit.slot);
  assert.equal(ins.dataset.adFormat, 'auto');
  assert.equal(ins.dataset.fullWidthResponsive, 'false');
  assert.equal(Object.hasOwn(ins.style, 'height'), false, 'natural responsive height is not clipped');
  for (const event of ['scroll', 'resize', 'scroll', 'visibilitychange']) f.win.dispatchEvent(new Event(event));
  assert.equal(f.pushes, 1);
  result.cleanup();
});

test('320px mobile geometry fits without horizontal overflow; narrower slots fail closed', () => {
  const mobile = fixture({ width: 320, hostWidth: 292, top: 700 });
  const result = mobile.mount();
  assert.equal(SHOP_AD_MIN_SAFE_WIDTH, 280);
  assert.equal(mobile.host.rect.width, 292);
  assert.equal(result.requested, true);
  assert.equal(mobile.pushes, 1);
  assert.equal(mobile.scripts[0].style.width, '100%');
  assert.equal(mobile.scripts[0].style.height, undefined);
  result.cleanup();

  const narrow = fixture({ width: 320, hostWidth: 260, top: 700 });
  const narrowResult = narrow.mount();
  assert.equal(narrowResult.mounted, true);
  assert.equal(narrow.host.hidden, true);
  assert.equal(narrow.pushes, 0);
  narrow.win.innerWidth = 375;
  narrow.host.rect = { ...narrow.host.rect, right: 347, width: 333 };
  narrow.slot.rect = { ...narrow.slot.rect, right: 347, width: 333 };
  narrow.win.dispatchEvent(new Event('resize'));
  assert.equal(narrow.pushes, 1, 'a later safe width may make the single pending attempt');
  narrowResult.cleanup();
});

test('pre-request filtering hides small/search results, then can restore the original placement', () => {
  const f = fixture({ top: 1400 });
  const result = f.mount();
  f.cards.slice(7).forEach(card => { card.hidden = true; });
  f.win.location = new URL('https://pixieed.jp/books/?q=private-text');
  f.win.dispatchEvent(new Event('books:catalog-will-change'));
  f.win.dispatchEvent(new Event('books:catalog-updated'));
  assert.equal(f.host.hidden, true);
  assert.equal(result.requested, false);
  assert.equal(f.pushes, 0);

  f.cards.forEach(card => { card.hidden = false; });
  f.win.location = new URL('https://pixieed.jp/books/');
  f.win.dispatchEvent(new Event('books:catalog-updated'));
  assert.equal(f.host.hidden, false);
  assert.equal(f.grid.children.indexOf(f.host), 8);
  assert.equal(result.requested, false);
});

test('filter, sort, and explicit detail-open changes retire a requested creative without remounting', () => {
  const f = fixture({ top: 700 });
  const result = f.mount();
  assert.equal(f.pushes, 1);
  const ins = f.slot.children[0];
  f.win.dispatchEvent(new Event('books:catalog-will-change'));
  assert.equal(result.retired, true);
  assert.equal(ins.isConnected, false, 'the provider creative is retired before product reordering');
  assert.equal(f.host.dataset.adState, 'retired');
  assert.equal(f.host.hidden, false, 'onscreen reservation remains stable during the interaction');
  f.win.dispatchEvent(new Event('books:catalog-updated'));
  f.win.dispatchEvent(new Event('books:catalog-detail-open'));
  f.win.location.hash = '#product=product-1';
  f.win.dispatchEvent(new Event('hashchange'));
  assert.equal(f.mount(), result);
  assert.equal(f.pushes, 1);
  result.cleanup();
});

test('request-time context is rechecked before the SDK call', () => {
  const f = fixture({ top: 1400 });
  const result = f.mount();
  f.win.location = new URL('https://pixieed.jp/books/?workspace=1');
  f.enterNearView(700);
  f.win.dispatchEvent(new Event('scroll'));
  assert.equal(result.requested, false);
  assert.equal(f.pushes, 0);
  assert.equal(f.loaderCalls, 0);
  assert.equal(f.host.hidden, true);
});

test('unfilled and SDK-error results keep modest space onscreen and collapse only offscreen', () => {
  const unfilled = fixture({ top: 700 });
  const result = unfilled.mount();
  const ins = unfilled.setStatus('unfilled');
  assert.equal(unfilled.host.hidden, false);
  assert.equal(unfilled.host.dataset.adState, 'unfilled');
  assert.equal(ins.isConnected, true);
  unfilled.host.rect = { ...unfilled.host.rect, top: 900, bottom: 1040 };
  unfilled.win.dispatchEvent(new Event('scroll'));
  assert.equal(unfilled.host.hidden, true);
  unfilled.setStatus('unfill-optimized');
  assert.equal(unfilled.host.hidden, false, 'optimized provider creative is never hidden as an empty unit');
  assert.equal(unfilled.host.dataset.adState, 'filled');
  result.cleanup();

  const failed = fixture({ top: 700 });
  const failedResult = failed.mount();
  for (const handler of [...failed.loader.errors]) handler();
  assert.equal(failed.host.dataset.adState, 'error');
  assert.equal(failed.host.hidden, false);
  failed.host.rect = { ...failed.host.rect, top: 900, bottom: 1040 };
  failed.win.dispatchEvent(new Event('scroll'));
  assert.equal(failed.host.hidden, true);
  failedResult.cleanup();
});

test('bounded no-response timeout collapses offscreen but preserves a late filled creative', async () => {
  const f = fixture({ top: 700 });
  const result = f.mount(shopAdConfig, 15);
  const ins = f.slot.children[0];
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(f.host.dataset.adState, 'error');
  assert.equal(f.host.hidden, false);
  f.host.rect = { ...f.host.rect, top: 900, bottom: 1040 };
  f.win.dispatchEvent(new Event('scroll'));
  assert.equal(f.host.hidden, true);
  ins.dataset.adStatus = 'filled';
  for (const observer of f.mutationObservers) if (observer.target === ins && !observer.disconnected) observer.callback();
  assert.equal(f.host.hidden, false);
  assert.equal(f.host.dataset.adState, 'filled');
  assert.equal(f.pushes, 1);
  result.cleanup();
});

test('generated production catalog has one labelled ad and preview has none', async () => {
  const catalog = await readFile(new URL('../../books/index.html', import.meta.url), 'utf8');
  const preview = await readFile(new URL('../../books/room-preview.html', import.meta.url), 'utf8');
  assert.match(catalog, /<body class="books-page" data-shop-ad="catalog-v1">/);
  assert.equal((catalog.match(/data-shop-display-ad/g) || []).length, 1);
  assert.match(catalog, /<aside class="shop-ad" data-shop-display-ad aria-label="広告" hidden>/);
  assert.ok(catalog.indexOf('data-shop-display-ad') > catalog.indexOf('data-product-id="product-famicom"'));
  assert.match(catalog, /adsense-offerwall-policy\.js\?rev=20261024-common-tool-start-1/);
  assert.match(catalog, /js\/ads\/shop-ad\.mjs\?rev=20261108-shop-display-ad-1/);
  assert.doesNotMatch(catalog, /<script[^>]*src="https:\/\/pagead2/);
  assert.doesNotMatch(preview, /data-shop-display-ad|data-shop-ad="catalog-v1"|js\/ads\/shop-ad\.mjs/);
  const css = await readFile(new URL('../../css/books.css', import.meta.url), 'utf8');
  assert.match(css, /\.shop-ad__slot\s*\{[^}]*min-height:\s*90px/);
  assert.match(css, /@media\s*\(max-width:\s*759px\)\s*\{\s*\.shop-ad__slot\s*\{\s*min-height:\s*280px/);
  assert.doesNotMatch(css, /\.shop-ad[^{}]*overflow:\s*hidden/);
  assert.match(catalog, /canonical" href="https:\/\/pixieed\.jp\/books\//);
  assert.match(catalog, /Amazonで価格を確認/);
  assert.match(catalog, /data-yahoo-commerce-link/);
});
