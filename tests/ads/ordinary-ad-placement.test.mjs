import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ORDINARY_ADS_LIVE_ENABLED,
  activateOrdinaryDisplayAd,
  createOrdinaryDisplayAdCard,
  createOrdinaryAdPageGate,
  desktopGutterPlacement,
  mountOrdinaryDisplayAd,
  ordinaryAdEligibility,
  ordinaryAdUnitIsConfigured,
} from '../../js/ads/ordinary-ad-placement.mjs';
import { planFeedFlow } from '../../js/social/app.mjs';

const unit = Object.freeze({ client: 'ca-pub-1234567890123456', slot: '1234567890', format: 'display', placement: 'inline', size: 'responsive', verifiedActive: true });
const gutterUnit = Object.freeze({ ...unit, placement: 'gutter', size: { width: 288, height: 600 } });
const provider = () => {};

function eligible(overrides = {}) {
  return {
    enabled: true, provider, unit: overrides.unit || (overrides.placement === 'gutter' ? gutterUnit : unit), productionOrigin: true, topLevel: true,
    viewportWidth: 390, publicFeed: true, feedReady: true, partialWarning: false,
    loading: false, empty: false, privateView: false, composerOpen: false,
    detailOpen: false, trustedContentEligible: true, eligiblePostCount: 24,
    ...overrides,
  };
}

test('unit configuration requires explicit active ordinary-display verification and a real-shaped synthetic ID', () => {
  assert.equal(ordinaryAdUnitIsConfigured(unit), true);
  assert.equal(ordinaryAdUnitIsConfigured(gutterUnit), true);
  assert.equal(ordinaryAdUnitIsConfigured({ ...unit, size: 'unknown' }), false);
  assert.equal(ordinaryAdUnitIsConfigured({ ...unit, placement: 'gutter' }), false, 'gutter dimensions must be explicitly confirmed');
  assert.equal(ordinaryAdUnitIsConfigured({ ...gutterUnit, size: { width: 301, height: 600 } }), false);
  assert.equal(ordinaryAdUnitIsConfigured({ ...gutterUnit, size: { width: 288, height: 599 } }), false);
  assert.equal(ordinaryAdUnitIsConfigured({ ...unit, verifiedActive: false }), false);
  assert.equal(ordinaryAdUnitIsConfigured({ ...unit, format: 'native' }), false);
  assert.equal(ordinaryAdUnitIsConfigured({ ...unit, slot: '' }), false);
  assert.equal(ORDINARY_ADS_LIVE_ENABLED, false, 'source default never makes an ad request');
});

test('inline eligibility is fail-closed for absent inventory, non-public views, and incomplete content', () => {
  assert.equal(ordinaryAdEligibility(eligible()), true);
  assert.equal(ordinaryAdEligibility(eligible({ placement: 'gutter', desktop: true, viewportWidth: 1920, viewportHeight: 900, gutterFits: true, publicFeed: false, contentReady: true, eligiblePostCount: 0 })), true);
  assert.equal(ordinaryAdEligibility(eligible({ placement: 'gutter', desktop: false, contentReady: true })), false);
  for (const blocked of [
    { enabled: false }, { provider: null }, { unit: undefined }, { productionOrigin: false },
    { topLevel: false }, { publicFeed: false }, { feedReady: false }, { partialWarning: true },
    { loading: true }, { empty: true }, { privateView: true }, { composerOpen: true },
    { detailOpen: true }, { trustedContentEligible: false }, { eligiblePostCount: 23 },
    { fullscreen: true }, { editor: true },
  ]) assert.equal(ordinaryAdEligibility(eligible(blocked)), false, JSON.stringify(blocked));
  assert.equal(ordinaryAdEligibility({ ...eligible(), enabled: ORDINARY_ADS_LIVE_ENABLED }), false);
});

test('desktop gutter uses actual surplus width and refuses narrow, short, fullscreen, zoomed, and obstructed layouts', () => {
  const base = {
    viewportWidth: 1920, viewportHeight: 900,
    main: { left: 360, top: 60, right: 1560, bottom: 850 }, anchorTop: 108,
  };
  const placement = desktopGutterPlacement(base);
  assert.deepEqual(placement, { left: 1608, top: 108, right: 1896, bottom: 732, width: 288, height: 624 });
  assert.equal(placement.left - base.main.right, 48);
  assert.equal(base.viewportWidth - placement.right, 24);
  assert.equal(desktopGutterPlacement({ ...base, fixedWidth: 288 })?.width, 288);
  assert.equal(desktopGutterPlacement({ ...base, fixedWidth: 300 }), null, 'a fixed configured unit must fit at its actual width');
  assert.equal(desktopGutterPlacement({ ...base, viewportWidth: 1280 }), null);
  assert.equal(desktopGutterPlacement({ ...base, viewportWidth: 320, mobileOrTablet: true }), null);
  assert.equal(desktopGutterPlacement({ ...base, viewportWidth: 390, mobileOrTablet: true }), null);
  assert.equal(desktopGutterPlacement({ ...base, viewportHeight: 680 }), null);
  assert.equal(desktopGutterPlacement({ ...base, fullscreen: true }), null);
  assert.equal(desktopGutterPlacement({ ...base, editor: true }), null);
  assert.equal(desktopGutterPlacement({ ...base, visualViewport: { width: 1200, height: 900, scale: 1.2, offsetLeft: 0, offsetTop: 0 } }), null);
  assert.equal(desktopGutterPlacement({ ...base, obstacles: [{ left: 1700, top: 300, right: 1800, bottom: 400 }] }), null);
  assert.equal(desktopGutterPlacement({ ...base, obstacles: [{ left: 1500, top: 300, right: 1570, bottom: 400 }] }), null, '48px safety clearance applies even without overlap');
  assert.equal(desktopGutterPlacement({ ...base, visualViewport: { width: 1920, height: 650, scale: 1, offsetLeft: 0, offsetTop: 0 } }), null, 'short keyboard/visual viewport is excluded');
});

test('gutter eligibility matches visible CSS viewport breakpoints and requires measured fit', async () => {
  const gutter = eligible({ placement: 'gutter', publicFeed: false, desktop: true, contentReady: true, gutterFits: true, viewportWidth: 1920, viewportHeight: 900, eligiblePostCount: 0 });
  assert.equal(ordinaryAdEligibility(gutter), true);
  assert.equal(ordinaryAdEligibility({ ...gutter, viewportWidth: 1190 }), false);
  assert.equal(ordinaryAdEligibility({ ...gutter, viewportHeight: 671 }), false);
  assert.equal(ordinaryAdEligibility({ ...gutter, gutterFits: false }), false);
  const css = await readFile(new URL('../../css/ordinary-ad-placement.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 1190px\), \(max-height: 671px\)/);
  assert.doesNotMatch(css, /prefers-reduced-motion/);
  assert.match(css, /\.ordinary-ad--gutter\s*\{[^}]*position:\s*static/s, 'gutter does not use automatic sticky tracking');
});

test('page gate permits only one provider attempt, even after its anchor is retired', () => {
  const gate = createOrdinaryAdPageGate();
  assert.equal(gate.canAttempt('post-a'), true);
  assert.equal(gate.markAttempt('post-a'), true);
  assert.equal(gate.attempted, true);
  assert.equal(gate.attemptedAnchorId, 'post-a');
  assert.equal(gate.canAttempt('post-a'), true, 'existing placement may remain anchored');
  assert.equal(gate.canAttempt('post-b'), false, 'a replacement anchor cannot trigger another request');
  assert.equal(gate.markAttempt('post-b'), false);
});

test('feed planner inserts at most one sparse ordinary display card and keeps its post anchor on refresh', () => {
  const posts = Array.from({ length: 30 }, (_, index) => ({ id: `post-${index}`, visibility: 'public' }));
  const first = planFeedFlow(posts, { ordinaryAdEnabled: true });
  const ads = first.filter((entry) => entry.kind === 'ordinary-ad');
  assert.equal(ads.length, 1);
  assert.equal(ads[0].anchorId, 'post-23');
  assert.equal(first.filter((entry) => entry.kind === 'ad-preview').length, 0);
  assert.equal(planFeedFlow(posts, { ordinaryAdEnabled: false }).some((entry) => entry.kind === 'ordinary-ad'), false);
  assert.equal(planFeedFlow(posts.slice(0, 23), { ordinaryAdEnabled: true }).some((entry) => entry.kind === 'ordinary-ad'), false);
  const refreshed = planFeedFlow([{ id: 'new-post' }, ...posts], { ordinaryAdEnabled: true, previousPlan: first });
  assert.equal(refreshed.find((entry) => entry.kind === 'ordinary-ad')?.anchorId, 'post-23');
  const lostAnchor = [...posts.filter((post) => post.id !== 'post-23'), { id: 'replacement-post' }];
  assert.equal(planFeedFlow(lostAnchor, { ordinaryAdEnabled: true, ordinaryAdAnchorId: 'post-23' }).some((entry) => entry.kind === 'ordinary-ad'), false, 'a page-lifetime attempt never transfers to a new anchor');
  assert.equal(planFeedFlow(posts, { enabled: false, ordinaryAdEnabled: true }).some((entry) => entry.kind === 'ordinary-ad'), false);
});

class FakeElement {
  constructor(tag, ownerDocument) { this.tagName = tag; this.ownerDocument = ownerDocument; this.dataset = {}; this.children = []; this.attributes = {}; this.className = ''; this.textContent = ''; this.parentElement = null; this.isConnected = false; this.visibility = 'visible'; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...nodes) { for (const child of nodes) { child.parentElement = this; child.isConnected = this.isConnected; this.children.push(child); } }
  remove() { if (!this.parentElement) return; this.parentElement.children = this.parentElement.children.filter((child) => child !== this); this.parentElement = null; this.isConnected = false; }
  querySelector(selector) { return selector === '.ordinary-ad__slot' ? this.children.find((child) => child.className === 'ordinary-ad__slot') || null : null; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  getBoundingClientRect() { return { width: this.hidden ? 0 : 400, height: this.hidden ? 0 : 150 }; }
}

const fakeDoc = { createElement: (tag) => new FakeElement(tag, fakeDoc), defaultView: { getComputedStyle: (element) => ({ display: element.hidden ? 'none' : 'block', visibility: element.visibility }) } };

test('injected provider is mock-only, called once on connected card, and unfilled status removes all ad space', () => {
  const host = new FakeElement('div'); host.isConnected = true;
  let calls = 0;
  const result = mountOrdinaryDisplayAd({
    container: host, doc: fakeDoc, unit, enabled: true, provider: (_slot, { onStatus }) => { calls += 1; onStatus('filled'); },
    eligibility: eligible(),
  });
  assert.equal(result.mounted, true);
  assert.equal(calls, 1);
  assert.equal(result.card.dataset.adState, 'filled');
  assert.equal(result.card.attributes['aria-label'], '広告');
  const duplicate = activateOrdinaryDisplayAd({
    card: result.card, slot: result.slot, unit, enabled: true, provider: () => { calls += 1; },
    eligibility: eligible(),
  });
  assert.equal(duplicate.mounted, false, 'a connected card is activated once; rerenders cannot reload it');
  assert.equal(calls, 1);

  const emptyHost = new FakeElement('div'); emptyHost.isConnected = true;
  const empty = mountOrdinaryDisplayAd({
    container: emptyHost, doc: fakeDoc, unit, enabled: true,
    provider: (_slot, { onStatus }) => onStatus('unfilled'), eligibility: eligible(),
  });
  assert.equal(empty.mounted, false);
  assert.equal(emptyHost.children.length, 0);
});

test('provider cleanup returned after synchronous or asynchronous failure is still called exactly once', async () => {
  const host = new FakeElement('div', fakeDoc); host.isConnected = true;
  let syncCleanup = 0;
  const sync = mountOrdinaryDisplayAd({
    container: host, doc: fakeDoc, unit, enabled: true, eligibility: eligible(),
    provider: (_slot, { onStatus }) => { onStatus('unfilled'); return () => { syncCleanup += 1; }; },
  });
  assert.equal(sync.mounted, false);
  assert.equal(syncCleanup, 1);
  sync.cleanup();
  assert.equal(syncCleanup, 1);

  let asyncCleanup = 0;
  const async = mountOrdinaryDisplayAd({
    container: host, doc: fakeDoc, unit, enabled: true, eligibility: eligible(),
    provider: (_slot, { onStatus }) => { onStatus('blocked'); return Promise.resolve(() => { asyncCleanup += 1; }); },
  });
  assert.equal(async.mounted, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(asyncCleanup, 1);
});

test('default-disabled renderer never calls an injected provider or creates a shell', () => {
  const host = new FakeElement('div'); host.isConnected = true;
  let calls = 0;
  const result = mountOrdinaryDisplayAd({
    container: host, doc: fakeDoc, unit, provider: () => { calls += 1; }, eligibility: eligible(),
  });
  assert.equal(result.mounted, false);
  assert.equal(calls, 0);
  assert.equal(host.children.length, 0);
  assert.equal(createOrdinaryDisplayAdCard(fakeDoc, { ...unit, verifiedActive: false }), null);
});

test('CSS-hidden or zero-geometry placements never reach the injected provider', () => {
  const shell = createOrdinaryDisplayAdCard(fakeDoc, unit);
  const host = new FakeElement('div', fakeDoc); host.isConnected = true;
  shell.card.hidden = true;
  host.append(shell.card);
  let calls = 0;
  const mounted = activateOrdinaryDisplayAd({
    ...shell, unit, enabled: true, provider: () => { calls += 1; }, eligibility: eligible(),
  });
  assert.equal(mounted.mounted, false);
  assert.equal(calls, 0);
});
