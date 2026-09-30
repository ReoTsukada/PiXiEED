import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the in-page pass flow lazy-loads Ad Manager and grants only on rewardedSlotGranted', async () => {
  const [pass, config] = await Promise.all([read('js/pixieed-pass.mjs'), read('data/site-config.js')]);
  assert.match(config, /rewardedAdUnitPath:\s*'\/23379831154\/pixieed_rewarded'/);
  assert.match(pass, /https:\/\/securepubads\.g\.doubleclick\.net\/tag\/js\/gpt\.js/);
  assert.match(pass, /rewardedSlotReady/);
  assert.match(pass, /rewardedSlotGranted/);
  assert.match(pass, /if \(result === 'granted'\)[\s\S]*?grantFromAd\(\)/);
  assert.doesNotMatch(pass, /PASS_PAGE|passPageUrl|location\.href\s*=|window\.open\(/);
});
