import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [index, css, recentProjects, sharedTopAd, sharedTabBar] = await Promise.all([
  read('pixiedraw/index.html'),
  read('pixiedraw/assets/css/style.css'),
  read('pixiedraw/assets/js/modules/recent-project-workflow-utils.js'),
  read('scripts/bottom-nav-footer-ad.js'),
  read('scripts/shared-tab-bar.js'),
]);

assert.match(index, /__PIXIEEDRAW_MODAL_ADS_ENABLED__\s*=\s*true/);
assert.match(index, /dataset\.pixieedModalAds\s*=\s*'true'/);
assert.match(index, /normalizedPlacement === 'export-interstitial'/);
assert.match(index, /normalizedPlacement === 'export-interstitial-dialog'/);
assert.match(index, /normalizedPlacement === 'export-dialog'/);
assert.match(index, /normalizedPlacement === 'new-project-dialog'/);
assert.match(index, /visibilityObservers = new WeakMap\(\)/);
assert.match(index, /dataset\?\.pixieedReserveAdSpace === 'true'/);
assert.match(index, /is-ad-unfilled-reserved/);
assert.match(index, /reason: 'entered-viewport'/);
assert.doesNotMatch(index, /scheduleActiveModeReload|resetSlotContainer/);
assert.doesNotMatch(index, /mobileBottomAdSlot', slot: '6568310446'/);
assert.match(index, /rect\.right > 0[\s\S]*rect\.top < window\.innerHeight/);
assert.match(index, /file-panel-summary[\s\S]{0,600}data-panel-ad-mount="right"/);
assert.match(index, /settings-size-grid[\s\S]{0,2200}data-panel-ad-mount="right"/);
assert.match(index, /data-ad-slot="1180252398"/);
assert.match(index, /id="leftPanelAd"[^>]*data-pixieed-reserve-ad-space="true"|data-pixieed-reserve-ad-space="true"[^>]*id="leftPanelAd"/);
assert.match(index, /id="exportAdContainer"[^>]*data-pixieed-reserve-ad-space="true"|data-pixieed-reserve-ad-space="true"[^>]*id="exportAdContainer"/);
assert.match(css, /\.panel-ad-mount--context\s*\{\s*margin: 12px 0 4px;/);
assert.match(css, /\.panel-ad\.is-ad-unfilled-reserved ins[\s\S]{0,800}visibility: hidden !important;/);
assert.match(css, /html\[data-pixieed-ad-free-account='true'\] \.panel-ad-mount[\s\S]{0,800}display: none !important;/);
assert.match(css, /\.panel-ad\.is-ad-unfilled,[\s\S]{0,800}height: 0 !important;/);
assert.match(css, /#exportInterstitialDialog \.export-interstitial__slot-wrap/);
assert.match(css, /@media \(max-width: 899px\), \(max-height: 699px\)/);
assert.match(css, /@media \(max-height: 639px\)/);

assert.match(sharedTopAd, /arePixieedAdsDisabled\(\)[\s\S]*\|\| isLandscapeViewport\(\)/);
assert.doesNotMatch(sharedTopAd, /arePixieedAdsDisabled\(\)[\s\S]{0,80}\|\| isPixiedrawPage\(\)/);
assert.match(sharedTopAd, /data-ad-slot="2141591954"/);
assert.match(sharedTabBar, /pixieed-common-details__ad[\s\S]*data-ad-slot="4859859838"/);

assert.doesNotMatch(recentProjects, /PiXiEEDを支援|Supports PiXiEED/);
assert.match(recentProjects, /index === 3/);
assert.match(recentProjects, /startup-recent-ad/);
assert.match(recentProjects, /data-full-width-responsive', 'true'/);

console.log('PiXiEEDraw ad placement guards passed.');
