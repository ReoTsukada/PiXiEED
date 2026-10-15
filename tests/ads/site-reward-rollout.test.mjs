import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { productionEnabled, REWARDED_AD_UNIT } from '../../js/ads/site-reward-config.mjs';
import { rewardedAdsEnabled, featureRestrictionsEnabled } from '../../js/ads/site-reward-rollout-v20261016.mjs';

test('ads-only rollout switches on optional delivery without enabling feature restrictions', async () => {
  assert.equal(rewardedAdsEnabled, true);
  assert.equal(featureRestrictionsEnabled, false);
  assert.equal(productionEnabled, false, 'legacy production config remains unchanged and disabled');
  assert.equal(REWARDED_AD_UNIT, '/23379831154/pixieed_rewarded');
  const runtime = await readFile(new URL('../../js/ads/site-reward-runtime-v20261016-ads-only.mjs', import.meta.url), 'utf8');
  assert.match(runtime, /enabled = rewardedAdsEnabled/);
  assert.match(runtime, /restrictionsEnabled = featureRestrictionsEnabled/);
  assert.match(runtime, /policyEnabled: Boolean\(enabled && restrictionsEnabled\)/);
  assert.match(runtime, /function hasReward\(\) \{ return !enabled \|\| snapshot\(\)\.active; \}/);
  assert.match(runtime, /function requireReward\(feature\) \{\s*if \(!enabled \|\| !restrictionsEnabled \|\| snapshot\(\)\.active\) return true;/);
  assert.match(runtime, /data-metrics/);
  assert.match(runtime, /広告が配信されない場合も、通常どおり利用できます。/);
  assert.doesNotMatch(runtime, /productionEnabled/);
});
