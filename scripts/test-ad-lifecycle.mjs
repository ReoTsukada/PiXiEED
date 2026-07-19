import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const lazy = read('scripts/ads-lazy.js');
const account = read('scripts/ad-account-control.js');
const sharedTopAd = read('scripts/bottom-nav-footer-ad.js');
const drawProject = read('projects/pixiedraw/index.html');
const lensProject = read('projects/pixiee-lens/index.html');
const maoituProject = read('projects/maoitu/index.html');
const qrProject = read('projects/qr-maker/index.html');
const lensTool = read('pixiee-lens/index.html');
const pixfind = read('pixfind/index.html');
const pixfindApp = read('pixfind/app.js');
const homeScript = read('scripts.js');
const sharedLazyPages = [
  'contact/index.html',
  'qr-maker/index.html',
  'maoitu/index.html',
  'maoitu/game.html',
  'pixiee-lens/index.html',
  'pixfind/index.html',
].map(read);

assert.doesNotMatch(lazy, /MAX_RETRIES|RETRY_DELAY_MS|queueRetry|adsAttemptCount|adsRetryQueued/);
assert.doesNotMatch(lazy, /removeAttribute\(['"]data-ad-status['"]\)/);
assert.match(lazy, /\['pending', '1'\]\.includes\(ins\.dataset\.adsLazyLoaded\)/);
assert.match(lazy, /const sizeObservers = new WeakMap\(\)/);
assert.match(lazy, /waitForRenderableSize\(ins\)/);
assert.match(lazy, /data-ads-script-blocked="1"/);
assert.match(lazy, /allowScriptRetry: true/);
assert.match(lazy, /syncAdFallback\?\.\(ins\)/);
assert.match(lazy, /status === 'unfilled'/);
assert.match(lazy, /status === 'unfill-optimized'/);

assert.match(account, /ADSENSE_LOAD_TIMEOUT_MS = 15000/);
assert.match(account, /adsensePromise = null/);
assert.match(account, /pixieed-ad-fallback__eyebrow/);
assert.match(account, /PiXiEED内のおすすめ/);
assert.match(account, /wasDisabled !== stateDisabled \|\| wasResolved !== stateResolved/);
assert.match(account, /status === 'unfilled'/);
assert.match(account, /status === 'unfill-optimized'/);
assert.match(account, /requestState === 'push-failed'/);
assert.match(account, /scriptBlocked/);
assert.match(account, /data-ads-script-blocked/);
assert.match(account, /host\.dataset\.pixieedReserveAdSpace = 'true'/);
assert.match(account, /html\[data-pixieed-ad-free-account='true'\] \.pixieed-ad-fallback/);
assert.doesNotMatch(account, /pixieedLoadFailed|dataset\.pixieedReady/,
  'AdSense script tags must not receive unsupported PiXiEED data attributes');
assert.match(account, /__PIXIEED_ADSENSE_SCRIPT_READY__/);
assert.match(account, /host\.classList\.remove\('is-ad-unfilled'\)/);

assert.match(sharedTopAd, /banner\.dataset\.pixieedReserveAdSpace = 'true'/);
assert.match(sharedTopAd, /if \(window\.pixieedObserveAds\) \{\s*window\.pixieedObserveAds\(banner\)/);
assert.match(sharedTopAd, /slot\.dataset\.pixieedPushQueued = '1';\s*try \{/,
  'the shared ad must only be marked queued immediately before the actual push');
assert.doesNotMatch(sharedTopAd, /dataset\.pixieedReady/);

assert.match(drawProject, /data-ad-slot="9073878884"/);
assert.match(lensProject, /data-ad-slot="2261515379"/);
assert.match(maoituProject, /data-ad-slot="9073878884"/);
for (const html of [drawProject, lensProject, maoituProject, qrProject]) {
  assert.doesNotMatch(html, /data-ad-slot="rotate"/);
  assert.match(html, /ads-lazy\.js\?v=20260719-shared-top-resume1/);
}

assert.doesNotMatch(lensTool, /class="ad-footer"|id="mobileBottomAd"/);
assert.doesNotMatch(lensTool, /rebuildLensBannerAd|rebuildCapturePreviewAd|adsbygoogle\s*=.*push/);
assert.match(pixfind, /scripts\/ads-lazy\.js\?v=20260719-shared-top-resume1/);
assert.match(pixfind, /scripts\/ad-account-control\.js\?v=20260719-adsense-script-state1/);
assert.doesNotMatch(pixfind, /SLOT_SEQUENCE|adsQueueEnqueued|pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
assert.match(pixfindApp, /data-ad-slot="2261515379"/);
assert.match(homeScript, /data-ad-slot="9073878884"/);

for (const html of sharedLazyPages) {
  assert.match(html, /scripts\/ads-lazy\.js\?v=20260719-shared-top-resume1/);
  assert.doesNotMatch(html, /<script id="ads-lazy"|SLOT_SEQUENCE|adsQueueEnqueued|data-ad-slot="rotate"/);
}

console.log('Ad lifecycle guards passed.');
