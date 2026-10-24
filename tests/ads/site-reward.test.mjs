import test from 'node:test';
import assert from 'node:assert/strict';
import * as facade from '../../js/ads/site-reward.mjs';
import * as runtime from '../../js/ads/site-reward-runtime-v20261016.mjs';
import * as adsOnlyRuntime from '../../js/ads/site-reward-runtime-v20261016-ads-only.mjs';
import { createSiteRewardService as createCoreService } from '../../js/ads/site-feature-access-v20261024.mjs';

const noTouch = () => { throw new Error('legacy reward side effect attempted'); };
const poison = new Proxy({}, { get: noTouch, set: noTouch, has: noTouch });

for (const [name, api] of Object.entries({ facade, runtime, adsOnlyRuntime })) {
  test(`${name} compatibility URL routes to permanent free access`, () => {
    assert.equal(api.isSiteRewardPolicyEnabled(), false);
    assert.equal(api.hasSiteReward(), false, 'free access must not fabricate an ad receipt');
    assert.equal(api.requireSiteReward('output.batch'), true);
    assert.equal(api.requestSiteReward('site'), true);
    assert.equal(api.mountSiteRewardUI(), null);
    assert.deepEqual(api.getSiteRewardState(), {
      policyEnabled: false, active: false, expiresAt: null,
      remainingMs: 0, grantedAt: null, receiptCount: 0
    });
    const presentation = api.getSiteRewardPresentation({ policyEnabled: true });
    assert.match(presentation.title, /無料/);
    assert.match(presentation.message, /制作機能の個別解放や期限付き特典はありません/);
    assert.doesNotMatch(JSON.stringify(presentation), /期間限定|60分|広告を見て|アップグレード/);
  });
}

test('legacy forced activation and injected browser dependencies are inert', () => {
  const service = createCoreService({
    enabled: true, restrictionsEnabled: true, createAdapter: noTouch,
    storage: poison, eventTarget: poison, locks: poison,
    documentRef: poison, windowRef: poison,
    now: noTouch, schedule: noTouch, cancelSchedule: noTouch,
    timeoutSchedule: noTouch, cancelTimeoutSchedule: noTouch
  });
  assert.equal(service.isSiteRewardPolicyEnabled(), false);
  assert.equal(service.hasSiteReward(), false);
  assert.equal(service.requireSiteReward('camera.colors64'), true);
  assert.equal(service.requestSiteReward('camera.diorama'), true);
  assert.equal(service.mountSiteRewardUI(), null);
  assert.equal(service.getSiteRewardState().active, false);
  service.dispose();
  service.dispose();
  assert.equal(service.getSiteRewardState().receiptCount, 0);
});

test('subscriptions receive one immutable free state and return a safe unsubscribe', () => {
  const service = createCoreService();
  const states = [];
  const unsubscribe = service.subscribeSiteReward(state => states.push(state));
  assert.equal(states.length, 1);
  assert.equal(Object.isFrozen(states[0]), true);
  assert.throws(() => { states[0].active = true; }, TypeError);
  assert.doesNotThrow(() => unsubscribe());
  assert.doesNotThrow(() => unsubscribe());
  assert.equal(states.length, 1);
  service.dispose();
});
