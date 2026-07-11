import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const index = read('PiXiEEDrawDEV/index.html');
const startup = read('PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js');
const dialogs = read('PiXiEEDrawDEV/assets/js/modules/export-dialog-workflow-utils.js');
const css = read('PiXiEEDrawDEV/assets/css/style.css');
const sharedTopAd = read('scripts/bottom-nav-footer-ad.js');

assert.match(index, /const initializedSlots = new WeakSet\(\);/);
assert.match(index, /const inFlightSlots = new WeakSet\(\);/);
assert.match(index, /const slotOwners = new WeakMap\(\);/);
assert.match(index, /slot\.dataset\.loaded === '1'/);
assert.match(index, /slot\.getAttribute\('data-adsbygoogle-status'\)/);
assert.match(index, /slot\.dataset\.pixiedAdInFlight === '1'/);
assert.match(index, /slot\.isConnected/);
assert.match(index, /slot\.closest\('#panelAdPreloadHost'\)/,
  'the shared slot gate rejects hidden panel preload slots');
assert.match(index, /rect\.width > 0 && rect\.height > 0/);
assert.match(index, /function applyResponsiveAdShape\(slot\)/);
assert.match(index, /const isMobileContext = Boolean\(document\.body\?\.classList\.contains\('is-mobile-layout'\)\)/);
assert.match(index, /\? 'auto'/);
assert.match(index, /\? 'horizontal'/);
assert.match(index, /\? 'vertical' : 'rectangle'/);
assert.match(index, /slot\.setAttribute\('data-ad-format', format\)/);
assert.match(index, /window\.__PIXIEEDRAW_RENDER_AD_SLOT__ = renderAdSlot/);
assert.match(index, /window\.pixieedObserveAds = root =>/);
assert.equal((index.match(/\(window\.adsbygoogle = window\.adsbygoogle \|\| \[\]\)\.push\(\{\}\);/g) || []).length, 1,
  'DEV has one physical adsbygoogle push gate');
assert.match(index, /owner: `editor-static:\$\{container\.id\}`/);
assert.match(index, /container\.closest\('#panelAdPreloadHost'\) \|\| container\.closest\('\[hidden\]'\)/,
  'panel ads wait until they leave the preload host and become visible');
assert.match(index, /wrapperClass:/);
assert.match(index, /wrapperWidth:/);
assert.match(index, /wrapperHeight:/);

for (const [source, owner] of [
  [startup, 'new-project-dialog'],
  [startup, 'startup-recent'],
  [dialogs, 'export-dialog'],
  [dialogs, 'shortcut-help-dialog'],
  [dialogs, 'update-history-dialog'],
  [dialogs, 'export-interstitial-dialog'],
]) {
  assert.match(source, new RegExp(`owner: '${owner}'`));
  assert.match(source, /__PIXIEEDRAW_RENDER_AD_SLOT__/);
  assert.doesNotMatch(source, /adsbygoogle = window\.adsbygoogle/,
    `${owner} delegates instead of pushing directly`);
}

assert.match(sharedTopAd, /window\.pixieedObserveAds\(banner\)/,
  'the shared mobile banner delegates to the DEV slot gate when present');
assert.match(sharedTopAd, /\.ad-block\{[\s\S]*?transform:translate\(-50%, -50%\) rotate\(90deg\);/,
  'the current landscape rotation remains on the outer ad-block wrapper');
assert.doesNotMatch(sharedTopAd, /ins\.adsbygoogle[^\{]*\{[^}]*transform:\s*rotate/i,
  'the shared stylesheet does not directly rotate ins elements');
assert.doesNotMatch(sharedTopAd, /iframe[^\{]*\{[^}]*transform:\s*rotate/i,
  'the shared stylesheet does not directly rotate generated iframes');
const exportSideAd = css.slice(
  css.indexOf('@media (min-width: 900px) and (orientation: landscape) {', css.indexOf('.export-dialog-body')),
  css.indexOf('.mobile-topbar')
);
assert.match(exportSideAd, /\.export-dialog-body__ad \.export-ad__slot \.(?:adsbygoogle|export-ad__slot)/);
assert.match(exportSideAd, /transform: none !important;/);
assert.doesNotMatch(exportSideAd, /rotate\(90deg\)/,
  'the export preview side slot is an unrotated vertical container');

console.log('PiXiEEDraw DEV G3-C ad slot gate checks passed');
