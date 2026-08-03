import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [index, css, recentProjects, startupWorkflow, sharedTopAd, sharedTabBar, controlsMirror, railToolUi] = await Promise.all([
  read('pixiedraw/index.html'),
  read('pixiedraw/assets/css/style.css'),
  read('pixiedraw/assets/js/modules/recent-project-workflow-utils.js'),
  read('pixiedraw/assets/js/modules/startup-workflow-utils.js'),
  read('scripts/bottom-nav-footer-ad.js'),
  read('scripts/shared-tab-bar.js'),
  read('pixiedraw/assets/js/modules/controls-mirror.js'),
  read('pixiedraw/assets/js/modules/rail-tool-ui-utils.js'),
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
assert.match(index, /status === 'unfilled' \|\| status === 'unfill-optimized'/);
assert.match(index, /reason: 'entered-viewport'/);
assert.doesNotMatch(index, /scheduleActiveModeReload|resetSlotContainer/);
assert.doesNotMatch(index, /mobileBottomAdSlot', slot: '6568310446'/);
assert.match(index, /rect\.right > 0[\s\S]*rect\.top < window\.innerHeight/);
assert.match(index, /field-group field-group--file-actions[\s\S]{0,1200}data-pixieed-owned-panel-ad="file"[\s\S]{0,600}file-panel-summary/);
assert.match(index, /settings-size-grid[\s\S]{0,2200}data-panel-ad-mount="right"/);
assert.match(index, /data-pixieed-owned-panel-ad="settings"/);
assert.match(index, /sideSections\s*=\s*\{[\s\S]*right:\s*\[\]/);
assert.match(index, /document\.querySelectorAll\('\[data-pixieed-owned-panel-ad\]'\)/);
assert.match(index, /contextAdLoadPromise = Promise\.resolve\(window\.__PIXIEEDRAW_LOAD_ADS__\(\)\)/);
assert.match(index, /isPanelContextAd[\s\S]{0,600}data-full-width-responsive', 'true'/);
assert.match(index, /id="operationHelpAdContainer"[\s\S]{0,600}id="helpArticleList"/);
assert.doesNotMatch(index, /data-ad-slot="1180252398"/);
assert.match(index, /data-pixieed-owned-panel-ad="file"[\s\S]{0,360}data-ad-slot="2141591954"/);
assert.match(index, /data-pixieed-owned-panel-ad="settings"[\s\S]{0,360}data-ad-slot="2141591954"/);
assert.doesNotMatch(index, /data-pixieed-owned-panel-ad="(?:file|settings)"[^>]*data-pixieed-reserve-ad-space/);
assert.match(index, /id="leftPanelAd"[^>]*data-pixieed-reserve-ad-space="true"|data-pixieed-reserve-ad-space="true"[^>]*id="leftPanelAd"/);
assert.match(index, /id="exportAdContainer"[^>]*data-pixieed-reserve-ad-space="true"|data-pixieed-reserve-ad-space="true"[^>]*id="exportAdContainer"/);
assert.match(css, /\.panel-ad-mount--context\s*\{\s*margin: 14px 0 4px;/);
assert.match(css, /\.startup-workspace__ad--leading\s*\{[\s\S]{0,240}grid-column:\s*auto/);
assert.match(css, /\.startup-workspace__ad--leading \.startup-recent-ad__slot\s*\{[\s\S]{0,240}min-height:\s*120px/);
assert.match(css, /\.panel-ad\.is-ad-unfilled-reserved ins[\s\S]{0,800}visibility: hidden !important;/);
assert.match(css, /html\[data-pixieed-ad-free-account='true'\] \.panel-ad-mount[\s\S]{0,800}display: none !important;/);
assert.match(css, /\.panel-ad\.is-ad-unfilled,[\s\S]{0,800}height: 0 !important;/);
assert.match(css, /\.pixieed-common-details__ad\.is-ad-unfilled/);
assert.match(css, /mobile-drawer\[data-mode='full'\][^\{]*\.panel-ad-mount--owned\.is-ad-unfilled,[\s\S]{0,1000}display:\s*none !important;[\s\S]{0,1000}height:\s*0 !important;/);
assert.match(css, /#exportInterstitialDialog \.export-interstitial__slot-wrap/);
assert.match(css, /@media \(max-width: 899px\), \(max-height: 699px\)/);
assert.match(css, /@media \(max-height: 639px\)/);

assert.match(sharedTopAd, /arePixieedAdsDisabled\(\)[\s\S]*\|\| isLandscapeViewport\(\)/);
assert.doesNotMatch(sharedTopAd, /arePixieedAdsDisabled\(\)[\s\S]{0,80}\|\| isPixiedrawPage\(\)/);
assert.match(sharedTopAd, /data-ad-slot="2141591954"/);
assert.match(sharedTabBar, /pixieed-common-details__ad[\s\S]*class="ad-seed"[\s\S]*data-ad-slot="2141591954"/);
assert.match(sharedTabBar, /const insertAt = Math\.min\(4, controls\.length\)/);
assert.match(sharedTabBar, /is-inline-after-primary-actions/);
assert.match(sharedTabBar, /__PIXIEEDRAW_RENDER_AD_SLOT__\(ad,[\s\S]{0,180}owner: 'common-details'/);
assert.match(sharedTabBar, /\.pixieed-common-details__ad\{[\s\S]{0,360}--pixieed-common-details-ad-height:clamp\(88px,14vh,100px\)/);
assert.match(sharedTabBar, /\.pixieed-common-details__ad ins\.ad-seed,[\s\S]{0,320}height:100%!important;max-height:100%!important/);
assert.doesNotMatch(sharedTabBar, /\.pixieed-common-details__ad\{[^}]*aspect-ratio/);
assert.match(sharedTabBar, /\.pixieed-common-details__ad ins\.adsbygoogle iframe\{[\s\S]{0,280}height:100%!important/);

assert.match(controlsMirror, /delete section\.dataset\.landscapeWindowOffsetX/);
assert.match(controlsMirror, /section\.style\.removeProperty\('transform'\)/);
assert.match(railToolUi, /const remainsFloatingWindow = windowElement\.id === 'timelapseDialog'/);
assert.match(railToolUi, /if \(!remainsFloatingWindow\)[\s\S]{0,240}style\.removeProperty\('transform'\)/);

assert.doesNotMatch(recentProjects, /PiXiEEDを支援|Supports PiXiEED/);
assert.doesNotMatch(recentProjects, /\(index \+ 1\) % 8 === 0/);
assert.match(startupWorkflow, /startup-recent-ad/);
assert.match(startupWorkflow, /leadingAdAfterCards:\s*1/);
assert.match(startupWorkflow, /startup-workspace__ad--leading/);
assert.match(startupWorkflow, /data-full-width-responsive', 'true'/);

console.log('PiXiEEDraw ad placement guards passed.');
