import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rewardedAdsEnabled, featureRestrictionsEnabled } from '../../js/ads/site-reward-rollout-v20261016.mjs';
import { isSiteRewardPolicyEnabled } from '../../js/ads/site-reward.mjs';

test('reward monetization and feature restrictions are permanently disabled', async () => {
  assert.equal(rewardedAdsEnabled, false);
  assert.equal(featureRestrictionsEnabled, false);
  assert.equal(isSiteRewardPolicyEnabled(), false);
  for (const file of [
    '../../js/ads/site-reward.mjs',
    '../../js/ads/site-reward-runtime-v20261016.mjs',
    '../../js/ads/site-reward-runtime-v20261016-ads-only.mjs'
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /gpt-rewarded-adapter|rewarded-controller/);
  }
});
