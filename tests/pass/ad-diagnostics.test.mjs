import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the pass compatibility module never loads or observes advertising UI', async () => {
  const pass = await read('js/pixieed-pass.mjs');
  assert.doesNotMatch(pass, /googletag|securepubads|googlefc|adsbygoogle|MutationObserver|setInterval|setTimeout|addEventListener|querySelector/);
  assert.match(pass, /export async function grantFromAd\(\) \{ return false; \}/);
  assert.match(pass, /export async function showOfferwall\(_options = \{\}\) \{ return 'none'; \}/);
  assert.match(pass, /export function requestPass\(_options = \{\}\) \{ return Promise\.resolve\(true\); \}/);
});

test('legacy pass duration remains configured without a rewarded-ad unit', async () => {
  const config = await read('data/site-config.js');
  assert.match(config, /export const passConfig = \{\s*passHours: 1\s*\};/);
  assert.doesNotMatch(config, /rewardedAdUnitPath|pixieed_rewarded/);
});
