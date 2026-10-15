import test from 'node:test';
import assert from 'node:assert/strict';
import * as bare from '../../js/ads/site-reward.mjs';
import * as versioned from '../../js/ads/site-reward.mjs?rev=20261016-color-capability-1';
test('bare and revisioned reward modules share one service and receipt state', () => {
  for (const key of ['requestSiteReward','getSiteRewardState','subscribeSiteReward','hasSiteReward','mountSiteRewardUI']) assert.equal(bare[key], versioned[key]);
  assert.deepEqual(bare.getSiteRewardState(), versioned.getSiteRewardState());
});
