import test from 'node:test';
import assert from 'node:assert/strict';
import * as bare from '../../js/ads/site-reward.mjs';
import * as versioned from '../../js/ads/site-reward.mjs?rev=20261016-color-capability-1';
import { rewardedAdsEnabled, featureRestrictionsEnabled } from '../../js/ads/site-reward-rollout-v20261016.mjs';
test('bare and revisioned reward modules share one service and receipt state', () => {
  for (const key of ['requestSiteReward','getSiteRewardState','subscribeSiteReward','hasSiteReward','requireSiteReward','isSiteRewardPolicyEnabled','mountSiteRewardUI']) assert.equal(bare[key], versioned[key]);
  assert.deepEqual(bare.getSiteRewardState(), versioned.getSiteRewardState());
});
test('the retired rewarded rollout disables delivery and feature restrictions', () => {
  assert.equal(rewardedAdsEnabled, false);
  assert.equal(featureRestrictionsEnabled, false);
});
