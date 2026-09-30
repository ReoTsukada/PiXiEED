import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('rewarded ads come only from the AdSense Offerwall on /pass/, never from Ad Manager', async () => {
  const [pass, page, html, config] = await Promise.all([read('js/pixieed-pass.mjs'), read('js/pass-page.mjs'), read('pass/index.html'), read('data/site-config.js')]);
  for (const source of [pass, page, config]) {
    assert.doesNotMatch(source, /securepubads|googletag|gpt\.js|rewardedAdUnitPath|pixieed_rewarded/);
  }
  assert.match(page, /adsbygoogle\.js\?client=ca-pub-9801602250480253/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /\/js\/pass-page\.mjs/);
  const version = page.match(/pixieed-pass\.mjs\?v=([\w-]+)/)[1];
  const header = await read('js/site-header.mjs');
  assert.equal(header.match(/pixieed-pass\.mjs\?v=([\w-]+)/)[1], version, 'header and /pass/ share one pass module');
});
