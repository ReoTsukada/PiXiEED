import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addSiteHeaderBenefits } from '../../scripts/build-pages-site.mjs';
import { mountSiteHeaderBenefits } from '../../js/site-header-benefits.mjs';

const legacy = '<script type="module" src="/js/site-header-benefits.mjs?rev=20261016-header-benefits-2"></script>';
const page = extra => `<html><head><link rel="stylesheet" href="/css/site-header.css?rev=old"></head><body ${extra || ''}><main>制作を続ける</main><script type="module" src="/js/site-header.mjs?rev=old"></script>${legacy}</body></html>`;

test('normal builds retire the unlock entry without removing shared navigation or Offerwall suppression', () => {
  const input = page().replace('</head>', '<script src="/js/adsense-offerwall-policy.js"></script></head>');
  const result = addSiteHeaderBenefits(input, 'draw/index.html');
  assert.equal(result.added, false);
  assert.equal(result.removed, true);
  assert.doesNotMatch(result.html, /site-header-benefits/);
  assert.match(result.html, /site-header\.mjs\?rev=20261024-common-tool-start-1/);
  assert.match(result.html, /site-header\.css\?rev=20261024-free-tools-1/);
  assert.match(result.html, /adsense-offerwall-policy\.js/);
  assert.match(result.html, /制作を続ける/);
  assert.equal(addSiteHeaderBenefits(result.html, 'draw/index.html').html, result.html);
});

test('legacy routes and admin pages cannot reintroduce an unlock entry', () => {
  for (const name of ['home/index.html', 'works/index.html', 'telescope/index.html', 'globe-prototype.html', 'PiXiEEDraw/index.html', 'admin/index.html']) {
    const result = addSiteHeaderBenefits(page(name === 'admin/index.html' ? 'data-admin-page' : ''), name);
    assert.equal(result.added, false);
    assert.equal(result.skipped, true);
    assert.doesNotMatch(result.html, /site-header-benefits/);
  }
});

test('cached compatibility module only removes retired controls and has no reward/runtime effects', async () => {
  const removed = [], attributes = [];
  const documentRef = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-header-reward], .pixieed-site-reward');
      return [{ remove() { removed.push('button'); } }, { remove() { removed.push('panel'); } }];
    },
    body: { removeAttribute(name) { attributes.push(name); } },
  };
  assert.equal(mountSiteHeaderBenefits({ documentRef }), null);
  assert.deepEqual(removed, ['button', 'panel']);
  assert.deepEqual(attributes, ['data-header-reward-embedded']);
  const module = await readFile(new URL('../../js/site-header-benefits.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(module, /import\s|setInterval|setTimeout|localStorage|MutationObserver|addEventListener|createElement|requestSiteReward/);
  assert.equal(mountSiteHeaderBenefits({ documentRef: null }), null);
});
