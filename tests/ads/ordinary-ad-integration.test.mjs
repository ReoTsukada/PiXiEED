import test from 'node:test';
import assert from 'node:assert/strict';
import { ordinaryAdConfig } from '../../data/ordinary-ad-config.mjs';
import { connectOptionalFeedAds, createFeedAdRuntime, mountInformationGutter } from '../../js/ads/ordinary-ad-entry.mjs';
import { createAdSenseDisplayProvider } from '../../js/ads/ordinary-ad-provider.mjs';

const syntheticUnit = Object.freeze({
  client: 'ca-pub-1234567890123456', slot: '1234567890', format: 'display',
  placement: 'inline', size: 'responsive', verifiedActive: true,
});
const syntheticGutterUnit = Object.freeze({ ...syntheticUnit, placement: 'gutter', size: { width: 288, height: 600 } });
const feedEligibility = Object.freeze({
  productionOrigin: true, topLevel: true, publicFeed: true, trustedContentEligible: true,
  feedReady: true, partialWarning: false, loading: false, empty: false,
  privateView: false, composerOpen: false, detailOpen: false, eligiblePostCount: 24,
});

test('approved production Display inventory is distinct, while missing/disabled configuration stays inert', async () => {
  assert.equal(ordinaryAdConfig.feed.enabled, true);
  assert.equal(ordinaryAdConfig.feed.unit.client, 'ca-pub-9801602250480253');
  assert.equal(ordinaryAdConfig.feed.unit.slot, '4842737836');
  assert.equal(ordinaryAdConfig.feed.unit.format, 'display');
  assert.equal(ordinaryAdConfig.feed.unit.placement, 'inline');
  assert.equal(ordinaryAdConfig.feed.unit.size, 'responsive');
  assert.equal(ordinaryAdConfig.informationGutter.unit.slot, '8825932060');
  assert.deepEqual(ordinaryAdConfig.informationGutter.unit.size, { width: 300, height: 600 });
  assert.notEqual(ordinaryAdConfig.feed.unit.slot, ordinaryAdConfig.informationGutter.unit.slot);
  assert.deepEqual(await createFeedAdRuntime({ ...ordinaryAdConfig.feed, enabled: false }), {
    enabled: false, trustedContentEligible: false, unit: null, provider: undefined,
  });
  assert.deepEqual(await createFeedAdRuntime({ enabled: true, trustedContentEligible: true, unit: null }), {
    enabled: false, trustedContentEligible: false, unit: null, provider: undefined,
  });
});

test('feed runtime enables only an explicitly verified inline unit and constructs an inert provider', async () => {
  const rejected = await createFeedAdRuntime({ enabled: true, trustedContentEligible: true, unit: { ...syntheticUnit, verifiedActive: false } });
  assert.equal(rejected.enabled, false);
  const runtime = await createFeedAdRuntime({ enabled: true, trustedContentEligible: true, unit: syntheticUnit });
  assert.equal(runtime.enabled, true);
  assert.equal(runtime.unit, syntheticUnit);
  assert.equal(typeof runtime.provider, 'function');
  assert.equal(runtime.trustedContentEligible, true);
});

test('deferred or rejected ad runtime never blocks core feed boot or its controls', async () => {
  const ordinaryAds = { enabled: false, provider: undefined, unit: null, trustedContentEligible: false };
  let listStarted = false, renderCalls = 0, release;
  const app = { render() { renderCalls++; } };
  const feedInit = () => { listStarted = true; return app; };
  const actualApp = feedInit();
  const pending = new Promise(resolve => { release = resolve; });
  const cancel = connectOptionalFeedAds(actualApp, ordinaryAds, () => pending);
  assert.equal(listStarted, true, 'feed initialization happens before optional ad resolution');
  assert.equal(ordinaryAds.enabled, false);
  assert.equal(renderCalls, 0);
  release({ enabled: true, unit: syntheticUnit, provider() {}, trustedContentEligible: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(ordinaryAds.enabled, true);
  assert.equal(renderCalls, 1, 'eligible feed can reconcile once the optional provider runtime is ready');
  cancel();

  const rejected = connectOptionalFeedAds(app, { enabled: false }, async () => { throw new Error('synthetic adapter load error'); });
  assert.equal(listStarted, true);
  assert.equal(renderCalls, 1, 'adapter failure does not roll back or interrupt the feed');
  rejected();
  await new Promise(resolve => setTimeout(resolve, 0));
});

class FakeElement {
  constructor(tag, ownerDocument = null) { this.tagName = tag; this.ownerDocument = ownerDocument; this.dataset = {}; this.style = {}; this.listeners = {}; this.children = []; this.isConnected = true; this.attributes = {}; this.className = ''; this.removeCount = 0; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...nodes) { this.children.push(...nodes); for (const node of nodes) { node.parentElement = this; node.ownerDocument ||= this.ownerDocument; node.isConnected = this.isConnected; } }
  replaceChildren(...nodes) { for (const child of this.children) child.isConnected = false; this.children = nodes; for (const n of nodes) { n.parentElement = this; n.ownerDocument ||= this.ownerDocument; n.isConnected = this.isConnected; } }
  querySelector(selector) { return selector === '.ordinary-ad__slot' ? this.children.find(x => x.className === 'ordinary-ad__slot') || null : null; }
  getClientRects() { return this.isConnected ? [{}] : []; }
  getBoundingClientRect() {
    if (this.rect) return this.rect;
    if (this.className === 'ordinary-ad-gutter-host') {
      const left = Number.parseFloat(this.style.left) || 0, top = Number.parseFloat(this.style.top) || 0, width = Number.parseFloat(this.style.width) || 0;
      return { left, top, right: left + width, bottom: top + 624, width, height: 624 };
    }
    return { left: 0, top: 0, right: 288, bottom: 624, width: 288, height: 624 };
  }
  remove() { this.removeCount++; this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); }
}

test('verified synthetic unit reaches real adapter through mock SDK only and reports filled/cleanup', async () => {
  const scripts = [];
  const doc = {
    head: { append(script) { scripts.push(script); } },
    querySelector: () => null,
    createElement: tag => new FakeElement(tag),
  };
  let observerCallback;
  class MockMutationObserver { constructor(cb) { observerCallback = cb; } observe() {} disconnect() {} }
  let pushes = 0;
  let intersectionCallback;
  class MockIntersectionObserver { constructor(cb) { intersectionCallback = cb; } observe() {} disconnect() {} }
  const win = { MutationObserver: MockMutationObserver, IntersectionObserver: MockIntersectionObserver, adsbygoogle: { push() { pushes++; } }, location: { origin: 'https://pixieed.jp' }, innerWidth: 390, innerHeight: 844 };
  win.top = win; win.self = win;
  const runtime = await createFeedAdRuntime({ enabled: true, trustedContentEligible: true, unit: syntheticUnit }, { doc, win });
  const slot = new FakeElement('div');
  slot.rect = { left: 10, top: 1800, right: 300, bottom: 1890, width: 290, height: 90 };
  const statuses = [];
  const cleanup = runtime.provider(slot, { unit: syntheticUnit, placement: 'inline', eligibility: feedEligibility, onStatus: status => statuses.push(status) });
  assert.equal(scripts.length, 0, 'off-screen inline slot does not load the SDK');
  slot.rect = { left: 10, top: 800, right: 300, bottom: 890, width: 290, height: 90 };
  intersectionCallback([{ target: slot, isIntersecting: true }]);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /^https:\/\/pagead2\.googlesyndication\.com\//);
  assert.equal(pushes, 0, 'the mocked SDK is not called before its load event');
  scripts[0].listeners.load();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(pushes, 1);
  const ins = slot.children[0];
  assert.equal(ins.className, 'adsbygoogle');
  assert.equal(ins.dataset.adClient, syntheticUnit.client);
  assert.equal(ins.dataset.adSlot, syntheticUnit.slot);
  ins.dataset.adStatus = 'filled'; observerCallback();
  assert.deepEqual(statuses, ['filled']);
  cleanup();
  assert.equal(ins.isConnected, false);
});

function providerFixture() {
  const scripts = [], docEvents = new Map(), observers = [];
  const doc = {
    visibilityState: 'visible', head: { append(script) { scripts.push(script); } },
    querySelector: () => null, createElement: tag => new FakeElement(tag),
    addEventListener(type, fn) { docEvents.set(type, fn); }, removeEventListener(type) { docEvents.delete(type); },
  };
  class MockMutationObserver { constructor(cb) { this.callback = cb; observers.push(this); } observe(target) { this.target = target; } disconnect() {} }
  let pushes = 0;
  const win = { MutationObserver: MockMutationObserver, location: { origin: 'https://pixieed.jp' }, innerWidth: 390, innerHeight: 844, adsbygoogle: { push() { pushes++; } } };
  win.top = win; win.self = win;
  const slot = new FakeElement('div');
  return {
    doc, win, slot, scripts, pushes: () => pushes,
    fireDocument: type => docEvents.get(type)?.(),
    setFilled() { const ins = slot.children[0]; ins.dataset.adStatus = 'filled'; observers.find(observer => observer.target === ins)?.callback(); return ins; },
  };
}

test('provider cleanup before deferred SDK load prevents late push and is idempotent', async () => {
  const { doc, win, slot, scripts, pushes } = providerFixture();
  const provider = createAdSenseDisplayProvider({ doc, win, timeoutMs: 5000 });
  const statuses = [];
  const cleanup = provider(slot, { unit: syntheticUnit, placement: 'inline', eligibility: feedEligibility, onStatus: s => statuses.push(s) });
  assert.equal(scripts.length, 1);
  const ins = slot.children[0];
  cleanup(); cleanup();
  assert.equal(ins.removeCount, 1);
  scripts[0].listeners.load();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(pushes(), 0);
  assert.deepEqual(statuses, []);
});

test('timeout before SDK load retires the slot and a late SDK load cannot request it', async () => {
  const { doc, win, slot, scripts, pushes } = providerFixture();
  const provider = createAdSenseDisplayProvider({ doc, win, timeoutMs: 1000 });
  const statuses = [];
  const cleanup = provider(slot, { unit: syntheticUnit, placement: 'inline', eligibility: feedEligibility, onStatus: s => statuses.push(s) });
  const ins = slot.children[0];
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.deepEqual(statuses, ['failed']);
  assert.equal(ins.removeCount, 1);
  scripts[0].listeners.load();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(pushes(), 0);
  assert.equal(ins.removeCount, 1);
  cleanup();
  assert.equal(ins.removeCount, 1);
});

test('SDK failure is cached for the page and does not automatically retry', async () => {
  const { doc, win, slot, scripts, pushes } = providerFixture();
  const provider = createAdSenseDisplayProvider({ doc, win, timeoutMs: 5000 });
  const statuses = [];
  const cleanup = provider(slot, { unit: syntheticUnit, placement: 'inline', eligibility: feedEligibility, onStatus: s => statuses.push(s) });
  scripts[0].listeners.error();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(statuses, ['failed']);
  cleanup();
  const secondCleanup = provider(slot, { unit: syntheticUnit, placement: 'inline', eligibility: feedEligibility, onStatus: s => statuses.push(s) });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(scripts.length, 1);
  assert.equal(pushes(), 0);
  assert.deepEqual(statuses, ['failed', 'failed']);
  secondCleanup();
});

test('filled inline placement is retired when fullscreen starts and cannot push again', async () => {
  const fixture = providerFixture();
  const provider = createAdSenseDisplayProvider({ doc: fixture.doc, win: fixture.win, timeoutMs: 5000 });
  const statuses = [];
  const cleanup = provider(fixture.slot, { unit: syntheticUnit, placement: 'inline', eligibility: feedEligibility, onStatus: status => statuses.push(status) });
  fixture.scripts[0].listeners.load();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fixture.pushes(), 1);
  const ins = fixture.setFilled();
  assert.deepEqual(statuses, ['filled']);
  fixture.doc.fullscreenElement = {};
  fixture.fireDocument('fullscreenchange');
  assert.deepEqual(statuses, ['filled', 'blocked']);
  assert.equal(ins.isConnected, false);
  assert.equal(fixture.pushes(), 1);
  cleanup();
  assert.equal(ins.removeCount, 1);
});

test('information-page dispatcher chooses manual gutter instead of Auto Ads only for explicit config', async () => {
  const source = await import('../../js/information-auto-ads.mjs');
  const scripts = [];
  const doc = {
    body: { dataset: { informationAutoAds: '/about/' }, classList: { contains: () => false, [Symbol.iterator]: function* () {} } },
    documentElement: { dataset: {}, hasAttribute: () => false },
    head: { append(script) { scripts.push(script); } },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, addEventListener() {} }),
  };
  const win = { location: { protocol: 'https:', host: 'pixieed.jp', hostname: 'pixieed.jp', pathname: '/about/' } };
  win.top = win; win.self = win;
  let selected = null;
  const manualConfig = { enabled: true, unit: syntheticGutterUnit };
  const result = source.mountInformationAutoAds({
    doc, win, manualConfig,
    mountGutter: options => { selected = options; return Promise.resolve({ mounted: false, reason: 'synthetic geometry' }); },
  });
  assert.deepEqual(result, { loaded: false, reason: 'manual-gutter-selected' });
  assert.equal(selected.config, manualConfig);
  assert.equal(selected.isEligiblePage, true);
  assert.equal(scripts.length, 0, 'manual mode does not start Auto Ads alongside the gutter');
});

test('information gutter stays inert with missing, disabled or ineligible configuration', async () => {
  assert.deepEqual(await mountInformationGutter({ config: { ...ordinaryAdConfig.informationGutter, enabled: false }, isEligiblePage: true }), {
    mounted: false, reason: 'disabled-or-ineligible',
  });
  assert.deepEqual(await mountInformationGutter({ config: { enabled: true, unit: syntheticGutterUnit }, isEligiblePage: false }), {
    mounted: false, reason: 'disabled-or-ineligible',
  });
});

function gutterFixture() {
  const scripts = [], winEvents = new Map(), docEvents = new Map(), observers = [];
  let editor = false, pushCalls = 0;
  class MockMutationObserver { constructor(cb) { this.callback = cb; this.disconnected = false; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } }
  const body = Object.assign(new FakeElement('body'), { classList: { contains: name => editor && name === 'creation-editor' } });
  const doc = {
    head: { append(script) { scripts.push(script); } }, body, fullscreenElement: null,
    defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    querySelector: selector => selector === 'main#main, main[role="main"], main' ? main : null,
    querySelectorAll: () => [], createElement(tag) { return new FakeElement(tag, doc); },
    addEventListener(type, fn) { docEvents.set(type, fn); }, removeEventListener(type) { docEvents.delete(type); },
  };
  body.ownerDocument = doc;
  const main = new FakeElement('main', doc); main.textContent = 'PiXiEEDの案内本文。'.repeat(20);
  main.rect = { left: 360, top: 60, right: 1560, bottom: 850, width: 1200, height: 790 };
  const win = {
    location: { origin: 'https://pixieed.jp' }, top: null, self: null,
    innerWidth: 1920, innerHeight: 900, scrollX: 0, scrollY: 0,
    visualViewport: { width: 1920, height: 900, scale: 1, offsetLeft: 0, offsetTop: 0 },
    MutationObserver: MockMutationObserver,
    adsbygoogle: { push() { pushCalls++; } },
    addEventListener(type, fn) { winEvents.set(type, fn); }, removeEventListener(type) { winEvents.delete(type); },
  };
  win.top = win; win.self = win;
  return { doc, win, main, scripts, observers, pushCalls: () => pushCalls, setEditor: value => { editor = value; }, fireWindow: type => winEvents.get(type)?.(), fireDocument: type => docEvents.get(type)?.() };
}

test('explicit synthetic gutter config runs measured placement through the mocked provider path', async () => {
  const { doc, win, main, scripts, pushCalls, fireWindow } = gutterFixture();
  const result = await mountInformationGutter({
    config: { enabled: true, unit: syntheticGutterUnit },
    doc, win, isEligiblePage: true,
  });
  assert.equal(result.mounted, true);
  assert.equal(result.placement.width, 288);
  assert.equal(result.placement.left - main.rect.right, 48);
  assert.equal(doc.body.children.length, 1);
  assert.equal(doc.body.children[0].children[0].getAttribute?.('aria-label') || doc.body.children[0].children[0].attributes['aria-label'], '広告');
  assert.equal(scripts.length, 1);
  scripts[0].listeners.load();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(pushCalls(), 1);
  win.innerWidth = 1200;
  fireWindow('resize');
  assert.equal(result.retired, true, 'a resize that removes surplus space retires the existing placement');
  assert.equal(doc.body.children.length, 0);
  result.cleanup();
  assert.equal(doc.body.children.length, 0);
  assert.equal((await mountInformationGutter({ config: { enabled: true, unit: syntheticGutterUnit }, doc, win, isEligiblePage: true })).reason, 'already-attempted');
});

test('gutter retires on fullscreen and editor transitions without remounting', async () => {
  for (const transition of ['fullscreen', 'editor']) {
    const fixture = gutterFixture();
    const result = await mountInformationGutter({ config: { enabled: true, unit: syntheticGutterUnit }, doc: fixture.doc, win: fixture.win, isEligiblePage: true });
    assert.equal(result.mounted, true, transition);
    if (transition === 'fullscreen') {
      fixture.doc.fullscreenElement = {};
      fixture.fireDocument('fullscreenchange');
    } else {
      fixture.setEditor(true);
      const bodyObserver = fixture.observers.find(observer => observer.target === fixture.doc.body && !observer.disconnected);
      bodyObserver.callback();
    }
    assert.equal(result.retired, true, transition);
    assert.equal(fixture.doc.body.children.length, 0, transition);
    assert.equal((await mountInformationGutter({ config: { enabled: true, unit: syntheticGutterUnit }, doc: fixture.doc, win: fixture.win, isEligiblePage: true })).reason, 'already-attempted');
  }
});
