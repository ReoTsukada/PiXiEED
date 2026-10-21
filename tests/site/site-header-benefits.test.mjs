import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addSiteHeaderBenefits } from '../../scripts/build-pages-site.mjs';

const headerPage = (extra = '') => `<!doctype html><html><head><link rel="stylesheet" href="/css/site-header.css?rev=old"><script type="module" src="/js/site-header.mjs"></script></head><body ${extra}><header class="site-header"></header><main></main></body></html>`;

test('header benefit build transform versions shared and embed CSS/modules and injects one dedicated bootstrap', () => {
  const page = headerPage().replace('</head>', '<link rel="stylesheet" href="/css/tool-embed.css?rev=old"><script type="module" src="/js/tool-embed.mjs?rev=old"></script></head>');
  const result = addSiteHeaderBenefits(page, 'draw/index.html');
  assert.equal(result.added, true);
  assert.match(result.html, /site-header\.css\?rev=20261021-header-layout-1/);
  assert.match(result.html, /src="\/js\/site-header\.mjs\?rev=20261021-header-layout-1"/);
  assert.match(result.html, /site-header-benefits\.mjs\?rev=20261016-header-benefits-2/);
  assert.match(result.html, /tool-embed\.css\?rev=20261017-workspace-entry-1/);
  assert.match(result.html, /tool-embed\.mjs\?rev=20261017-workspace-entry-1/);
  assert.equal((result.html.match(/site-header-benefits\.mjs/g) || []).length, 1);
  const repeated = addSiteHeaderBenefits(result.html, 'draw/index.html');
  assert.equal(repeated.added, false);
  assert.equal(repeated.html, result.html);
});

test('redirect-only and private routes do not receive a visible-entry bootstrap', () => {
  for (const route of ['home/index.html', 'works/index.html', 'telescope/index.html', 'globe-prototype.html', 'PiXiEEDraw/index.html']) {
    assert.equal(addSiteHeaderBenefits(headerPage(), route).added, false, route);
  }
  assert.equal(addSiteHeaderBenefits(headerPage('data-admin-page'), 'admin/index.html').added, false);
  assert.equal(addSiteHeaderBenefits('<html><body><main>standalone</main></body></html>', '404.html').added, false);
});

test('shared button reflects only actual ledger time and coordinates the existing reward panel', async () => {
  const module = await readFile(new URL('../../js/site-header-benefits.mjs', import.meta.url), 'utf8');
  const runtime = await readFile(new URL('../../js/ads/site-reward-runtime-v20261016-ads-only.mjs', import.meta.url), 'utf8');
  const embed = await readFile(new URL('../../js/tool-embed.mjs', import.meta.url), 'utf8');
  assert.match(module, /data-header-reward/);
  assert.match(module, /openPeriod \? '開放中' : state\.active \? `特典 \$\{formatRemaining\(state\.remainingMs\)\}` : '特典'/);
  assert.match(module, /期間限定・全機能開放中/);
  assert.match(module, /機能制限なし・広告視聴不要/);
  assert.match(module, /特典対象の機能を広告視聴なしで利用できます/);
  assert.match(module, /requestSiteReward\('site'\)/);
  assert.match(module, /presentationObserver\.observe\(dialog, \{ subtree: true/);
  assert.match(module, /event\.stopImmediatePropagation\(\)/, 'cached older runtime cannot start ads by a hidden accept click');
  assert.doesNotMatch(module, /getSiteRewardPresentation/, 'header remains compatible with a cached runtime missing new exports');
  assert.match(module, /pixieed:tool-embed-expanded/);
  assert.match(runtime, /id="site-reward-dialog"/);
  assert.match(runtime, /pixieed:site-reward-open/);
  assert.match(embed, /event\.defaultPrevented\) return/);
  assert.match(embed, /pixieed:tool-embed-reward-modal/);
});

test('open-period accessibility omits hidden retention copy and traps Tab on its sole action', async () => {
  const module = await readFile(new URL('../../js/site-header-benefits.mjs', import.meta.url), 'utf8');
  const runtime = await readFile(new URL('../../js/ads/site-reward-runtime-v20261016-ads-only.mjs', import.meta.url), 'utf8');
  assert.match(module, /const descriptionIds = 'site-reward-intro'/);
  assert.match(module, /querySelector\('\[data-card\], \.pixieed-site-reward-card'\)/, 'legacy cached card markup is found even without data-card');
  assert.match(module, /card\.setAttribute\('aria-describedby', descriptionIds\)/);
  assert.match(module, /event\.key !== 'Tab' \|\| getSiteRewardState\(\)\.policyEnabled/);
  assert.match(module, /event\.stopImmediatePropagation\(\);\s*cancel\.focus\(\)/);
  assert.match(runtime, /ui\.card\.setAttribute\('aria-describedby', descriptionIds\)/);
  assert.match(runtime, /node\.hidden \|\| node\.getAttribute\('aria-hidden'\) === 'true'/);
  assert.match(runtime, /element\.getClientRects\(\)\.length > 0/);
});
