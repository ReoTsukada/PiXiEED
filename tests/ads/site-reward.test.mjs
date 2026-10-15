import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteRewardService } from '../../js/ads/site-reward.mjs';
import { productionEnabled, REWARD_DURATION_MS, SITE_REWARD_STORAGE_KEY } from '../../js/ads/site-reward-config.mjs';
import { rewardedAdsEnabled, featureRestrictionsEnabled } from '../../js/ads/site-reward-rollout-v20261016.mjs';
import { requireSharedCanvasAccess } from '../../js/creation/shared-canvas-access.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { putPxdSharedImage } from '../../js/creation/pxd-project.mjs';

function harness({ enabled = true, restrictionsEnabled = true, nowValue = 1_000_000, storage = memoryStorage(), locks = { request: async (_name, _options, callback) => callback() }, scenario = 'ready', showAccepted = true } = {}) {
  let now = nowValue;
  const adapters = [];
  const eventTarget = new EventTarget();
  const documentRef = mockDocument();
  const service = createSiteRewardService({
    storage, eventTarget, documentRef, now: () => now, enabled, restrictionsEnabled, locks, schedule: () => 1, cancelSchedule() {},
    timeoutSchedule: () => 1, cancelTimeoutSchedule() {},
    createAdapter: ({ emit }) => {
      const adapter = {
        destroyed: false,
        async prepare() { emit({ type: scenario === 'no-fill' ? 'noFill' : scenario === 'unsupported' ? 'unsupported' : 'ready' }); },
        show() { return showAccepted; }, close() {}, destroy() { this.destroyed = true; },
        emit
      };
      adapters.push(adapter); return adapter;
    }
  });
  return { service, adapters, eventTarget, documentRef, storage, setNow(value) { now = value; }, get now() { return now; } };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function mockDocument() {
  class Element extends EventTarget {
    constructor() { super(); this.children = new Map(); this.hidden = false; this.attributes = {}; }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector(selector) {
      if (!this.children.has(selector)) this.children.set(selector, new Element());
      return this.children.get(selector);
    }
    append(element) { this.children.set('root', element); }
    remove() { this.removed = true; }
    click() { this.dispatchEvent(new Event('click')); }
  }
  return { body: new Element(), createElement: () => new Element() };
}

function rgbaImage(colorCount) {
  const rgba = new Uint8Array(colorCount * 4);
  for (let index = 0; index < colorCount; index += 1) rgba.set([index, (index * 3) & 255, (index * 7) & 255, 255], index * 4);
  return { width: colorCount, height: 1, rgba };
}

async function optIn(h, feature = 'draw') {
  assert.equal(h.service.requestSiteReward(feature), true);
  const root = h.documentRef.body.children.get('root');
  root.querySelector('[data-accept]').click();
  await Promise.resolve(); await Promise.resolve();
  return h.adapters.at(-1);
}

test('disabled production policy bypasses locks and starts without storage grants', () => {
  const h = harness({ enabled: false });
  assert.equal(h.service.isSiteRewardPolicyEnabled(), false);
  assert.equal(h.service.hasSiteReward(), true);
  assert.equal(h.service.requireSiteReward('output'), true);
  assert.equal(h.service.getSiteRewardState().active, false);
  h.service.dispose();
});

test('ads-only rollout keeps restrictions off while retaining voluntary no-fill and unsupported states', async () => {
  assert.equal(rewardedAdsEnabled, true);
  assert.equal(featureRestrictionsEnabled, false);
  assert.equal(productionEnabled, false, 'legacy production config stays off for cached runtime safety');

  for (const scenario of ['no-fill', 'unsupported']) {
    const h = harness({ restrictionsEnabled: false, scenario });
    assert.equal(h.service.isSiteRewardPolicyEnabled(), false);
    assert.equal(h.service.getSiteRewardState().policyEnabled, false);
    assert.equal(h.service.hasSiteReward(), false, 'access permission is not a granted receipt');
    assert.equal(h.service.requireSiteReward('draw'), true, 'canvas access bypasses policy while restrictions are off');
    const adapter = await optIn(h);
    assert.ok(adapter, 'voluntary ad attempt can start');
    await Promise.resolve();
    assert.equal(h.service.getSiteRewardState().active, false);
    assert.equal(h.service.getSiteRewardState().expiresAt, null);
    assert.equal(h.service.getSiteRewardState().receiptCount, 0);
    assert.equal(h.service.hasSiteReward(), false, 'ad failure never manufactures a reward receipt');
    assert.equal(h.service.requireSiteReward('save'), true, 'ad failure never blocks saving');
    h.service.dispose();
  }
});

test('ads-only launcher stays visible without starting an ad and hides restriction benefit claims', () => {
  const h = harness({ restrictionsEnabled: false });
  const root = h.service.mountSiteRewardUI();
  assert.ok(root);
  assert.equal(root.children.get('[data-renew]').hidden, false, 'voluntary launcher remains visible');
  assert.equal(root.children.get('[data-metrics]').hidden, true);
  assert.equal(root.children.get('[data-details]').hidden, true);
  assert.equal(root.children.get('[data-retention]').hidden, true);
  assert.equal(h.adapters.length, 0, 'mounting the UI does not request an ad');
  h.service.dispose();
});

test('video completion and close alone never grant an ads-only reward', async () => {
  const h = harness({ restrictionsEnabled: false });
  const adapter = await optIn(h);
  adapter.emit({ type: 'videoCompleted' });
  adapter.emit({ type: 'closed' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.service.getSiteRewardState().expiresAt, null);
  assert.equal(h.service.getSiteRewardState().active, false);
  assert.equal(h.service.getSiteRewardState().receiptCount, 0);
  assert.equal(h.service.hasSiteReward(), false);
  assert.equal(h.service.requireSiteReward('output'), true, 'saving and output stay available after an ungranted ad');
  const sharedCanvas = await putPxdSharedImage(createPxdProject(), rgbaImage(40));
  assert.equal(requireSharedCanvasAccess(sharedCanvas, () => assert.fail('ads-only access must not prompt'), '', {
    operation: 'color-edit', requestReward: h.service.requireSiteReward
  }), true, 'direct shared-canvas access gate bypasses restrictions while the ledger stays empty');
  assert.equal(h.service.getSiteRewardState().receiptCount, 0);
  h.service.dispose();
});

test('accepted show plus granted receipt stays truthful while ads-only tools remain unlocked', async () => {
  const h = harness({ restrictionsEnabled: false });
  const adapter = await optIn(h);
  adapter.emit({ type: 'videoCompleted' });
  assert.equal(h.service.getSiteRewardState().expiresAt, null, 'video completion is not a receipt');
  adapter.emit({ type: 'granted' });
  adapter.emit({ type: 'closed' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.service.getSiteRewardState().expiresAt, h.now + REWARD_DURATION_MS);
  assert.equal(h.service.getSiteRewardState().receiptCount, 1);
  assert.equal(h.service.hasSiteReward(), true, 'accepted show and granted receipt update actual entitlement');
  assert.equal(h.service.requireSiteReward('share'), true, 'sharing stays available independent of the receipt');
  h.service.dispose();
});

test('a single accepted show plus granted event creates one site-wide hour; other events never grant', async () => {
  const h = harness();
  const adapter = await optIn(h);
  assert.ok(adapter);
  const root = h.documentRef.body.children.get('root');
  assert.equal(root.querySelector('[data-mobile-status]').textContent, '特典');
  assert.match(root.querySelector('[data-renew]').attributes['aria-label'], /リワードなし/);
  adapter.emit({ type: 'videoCompleted' });
  adapter.emit({ type: 'closed' });
  assert.equal(h.service.getSiteRewardState().active, false, 'completion and close alone do not grant');
  adapter.emit({ type: 'granted' });
  adapter.emit({ type: 'granted' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.service.getSiteRewardState().expiresAt, h.now + REWARD_DURATION_MS);
  assert.equal(h.service.getSiteRewardState().receiptCount, 1);
  assert.equal(h.service.hasSiteReward(), true);
  assert.equal(root.querySelector('[data-mobile-status]').textContent, '60:00');
  assert.match(root.querySelector('[data-renew]').attributes['aria-label'], /リワード有効、残り約60分/);
  h.service.dispose();
});

test('pre-show no-fill and rejected show do not persist a reward', async () => {
  const noFill = harness({ scenario: 'no-fill' });
  const noFillAdapter = await optIn(noFill);
  assert.equal(noFillAdapter.destroyed, true);
  assert.equal(noFill.service.getSiteRewardState().expiresAt, null);
  assert.equal(noFill.service.getSiteRewardState().receiptCount, 0);
  noFill.service.dispose();

  const rejected = harness({ showAccepted: false });
  const rejectedAdapter = await optIn(rejected);
  assert.equal(rejectedAdapter.destroyed, true);
  assert.equal(rejected.service.getSiteRewardState().expiresAt, null);
  assert.equal(rejected.service.getSiteRewardState().receiptCount, 0);
  rejected.service.dispose();
});

test('reward expires by clock and a new receipt renews from the later of now or old expiry', async () => {
  const h = harness();
  const first = await optIn(h);
  first.emit({ type: 'granted' });
  first.emit({ type: 'closed' });
  await Promise.resolve(); await Promise.resolve();
  const firstExpiry = h.service.getSiteRewardState().expiresAt;
  h.setNow(firstExpiry + 10);
  assert.equal(h.service.hasSiteReward(), false, 'expired privilege is locked');

  const second = await optIn(h);
  second.emit({ type: 'granted' });
  second.emit({ type: 'closed' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.service.getSiteRewardState().expiresAt, firstExpiry + 10 + REWARD_DURATION_MS);
  assert.equal(h.service.getSiteRewardState().receiptCount, 2);
  h.service.dispose();
});

test('a grant after an unexpired reward extends from expiry and storage events update sibling tabs', async () => {
  const storage = memoryStorage();
  const locks = { request: async (_name, _options, callback) => callback() };
  const a = harness({ storage, locks });
  const b = harness({ storage, locks });
  const first = await optIn(a);
  first.emit({ type: 'granted' });
  first.emit({ type: 'closed' });
  await Promise.resolve(); await Promise.resolve();
  const expiry = a.service.getSiteRewardState().expiresAt;

  const second = await optIn(b);
  second.emit({ type: 'granted' });
  second.emit({ type: 'closed' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(b.service.getSiteRewardState().expiresAt, expiry + REWARD_DURATION_MS);
  const storageEvent = new Event('storage');
  Object.defineProperty(storageEvent, 'key', { value: SITE_REWARD_STORAGE_KEY });
  a.eventTarget.dispatchEvent(storageEvent);
  assert.equal(a.service.getSiteRewardState().expiresAt, expiry + REWARD_DURATION_MS);
  a.service.dispose(); b.service.dispose();
});

test('consent can be canceled without starting an adapter', () => {
  const h = harness();
  assert.equal(h.service.requireSiteReward('draw'), false, 'locked feature remains blocked until reward is granted');
  const root = h.documentRef.body.children.get('root');
  root.querySelector('[data-cancel]').click();
  assert.equal(h.adapters.length, 0);
  assert.equal(h.service.getSiteRewardState().receiptCount, 0);
  h.service.dispose();
});

test('without Web Locks, the opt-in dialog reports unsupported and does not start an ad', async () => {
  const h = harness({ locks: null });
  assert.equal(h.service.requestSiteReward('draw'), true);
  const root = h.documentRef.body.children.get('root');
  root.querySelector('[data-accept]').click();
  await Promise.resolve();
  assert.equal(h.adapters.length, 0);
  assert.match(root.querySelector('[data-feedback]').textContent, /安全に同期できない/);
  assert.equal(h.service.getSiteRewardState().receiptCount, 0);
  h.service.dispose();
});

test('concurrent same-realm grants serialize correctly with Web Locks', async () => {
  const storage = memoryStorage();
  const a = harness({ storage });
  const b = harness({ storage });
  const first = await optIn(a);
  const second = await optIn(b);
  first.emit({ type: 'granted' }); first.emit({ type: 'closed' });
  second.emit({ type: 'granted' }); second.emit({ type: 'closed' });
  await new Promise(resolve => setImmediate(resolve));
  const storageEvent = new Event('storage');
  Object.defineProperty(storageEvent, 'key', { value: SITE_REWARD_STORAGE_KEY });
  a.eventTarget.dispatchEvent(storageEvent);
  assert.equal(a.service.getSiteRewardState().expiresAt, a.now + (2 * REWARD_DURATION_MS));
  assert.equal(b.service.getSiteRewardState().expiresAt, a.now + (2 * REWARD_DURATION_MS));
  a.service.dispose(); b.service.dispose();
});
