import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const editionSource = read('PiXiEEDrawDEV/assets/js/modules/edition-capabilities-utils.js');

function resolveEdition(edition, { embed = false, protocol = 'https:' } = {}) {
  const window = {
    __PIXIEEDRAW_BUILD_EDITION__: edition,
    __PIXIEED_EMBED_MODE__: embed,
    location: { protocol },
  };
  vm.runInNewContext(editionSource, { window, Object, Set, String });
  return {
    edition: window.PIXIEEDRAW_EDITION,
    ads: window.PIXIEEDRAW_EDITION_CAPABILITIES.ads,
    shouldShowAds: window.__PIXIEEDRAW_SHOULD_SHOW_ADS__(),
  };
}

assert.deepEqual(resolveEdition('dev'), { edition: 'dev', ads: true, shouldShowAds: true });
assert.deepEqual(resolveEdition('web-free'), { edition: 'web-free', ads: true, shouldShowAds: true });
assert.deepEqual(resolveEdition('product'), { edition: 'product', ads: false, shouldShowAds: false });
assert.equal(resolveEdition('dev', { embed: true }).shouldShowAds, false, 'embed is a display context, not an entitlement');
assert.equal(resolveEdition('dev', { protocol: 'file:' }).shouldShowAds, false,
  'direct file opens must not load AdSense or an internal fallback ad');
assert.deepEqual(resolveEdition('unexpected'), { edition: 'dev', ads: true, shouldShowAds: true });
assert.match(editionSource, /classList\.remove\('pixieed-adfree'\)/);

const exportDialogSource = read('PiXiEEDrawDEV/assets/js/modules/export-dialog-workflow-utils.js');
assert.match(exportDialogSource, /__PIXIEEDRAW_SHOULD_SHOW_MODAL_ADS__/);
assert.doesNotMatch(exportDialogSource, /pixieedAdFree\?\.state\?\.isActive/);

for (const relativePath of [
  'PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js',
  'PiXiEEDrawDEV/assets/js/modules/recent-project-workflow-utils.js',
]) {
  const source = read(relativePath);
  assert.match(source, /__PIXIEEDRAW_SHOULD_SHOW_ADS__/);
  assert.doesNotMatch(source, /pixieedAdFree\?\.state\?\.isActive/);
}

const index = read('PiXiEEDrawDEV/index.html');
assert.match(index, /edition-capabilities-utils\.js\?v=20260719-file-no-ads1/);
assert.match(index, /__PIXIEEDRAW_SHOULD_SHOW_ADS__/);
assert.match(index, /data-adsbygoogle-status/);
assert.match(index, /dataset\.pixiedRetryLoop/);

console.log('PiXiEEDraw DEV Phase G3-A ads edition checks passed');
