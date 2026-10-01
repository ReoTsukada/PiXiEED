import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('legacy reward compatibility exports cannot load, monitor, or infer ads', async () => {
  const [pass, config] = await Promise.all([read('js/pixieed-pass.mjs'), read('data/site-config.js')]);
  assert.doesNotMatch(pass, /googletag|securepubads|rewardedSlot(?:Ready|Granted|Closed)|ad-manager/i);
  assert.doesNotMatch(pass, /MutationObserver|setInterval|addEventListener|\.appendChild\(|querySelector/);
  assert.match(pass, /export async function grantFromAd\(\) \{ return false; \}/);
  assert.match(pass, /export async function showRewardedAd\(_options = \{\}\) \{ return 'none'; \}/);
  assert.match(pass, /export async function showOfferwall\(_options = \{\}\) \{ return 'none'; \}/);
  assert.match(pass, /export function requestPass\(_options = \{\}\) \{ return Promise\.resolve\(true\); \}/);
  assert.doesNotMatch(config, /rewardedAdUnitPath|pixieed_rewarded/);
});

test('pass configuration keeps its legacy duration value without ad-unit configuration', async () => {
  const config = await read('data/site-config.js');
  assert.match(config, /export const passConfig = \{\s*passHours: 1\s*\};/);
  assert.doesNotMatch(config, /rewardedAdUnitPath|pixieed_rewarded/);
});
