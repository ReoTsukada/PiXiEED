import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const market = read('market/market.js');
const pixfind = read('pixfind/app.js');
const drawRecent = read('pixiedraw/assets/js/modules/recent-project-workflow-utils.js');
const drawStartup = read('pixiedraw/assets/js/modules/startup-workflow-utils.js');
const helper = read('scripts/card-feed-ads.js');

assert.match(helper, /const ROWS_PER_AD = 3/);
assert.match(helper, /const COMMON_SLOT = '2141591954'/);
assert.match(helper, /function shouldInsertAfterRows/);
assert.match(helper, /count % \(gridColumnCount\(grid\) \* rowCount\) === 0/);
assert.match(helper, /function renderProgressively/);
assert.match(helper, /leadingAdAfterCards = 0/);
assert.match(helper, /createLeadingAd = null/);
assert.match(helper, /waitForSharedAdPriority/);
assert.match(market, /PiXiEEDCardFeedAds\?\.renderProgressively/);
assert.doesNotMatch(market, /children\.splice\(8/);
assert.match(pixfind, /PiXiEEDCardFeedAds\?\.renderProgressively/);
assert.doesNotMatch(pixfind, /idx === 7/);
// PiXiEEDraw now renders project cards only in the startup workspace. The
// retired duplicate recent-project renderer intentionally has no ad cadence.
assert.doesNotMatch(drawRecent, /\(index \+ 1\) % 8 === 0/);
assert.doesNotMatch(drawRecent, /index === 3/);
assert.match(drawStartup, /PiXiEEDCardFeedAds\?\.renderProgressively/);
assert.match(drawStartup, /data-ad-slot', window\.PiXiEEDCardFeedAds\?\.COMMON_SLOT \|\| '2141591954'/);
assert.match(drawStartup, /leadingAdAfterCards:\s*1/);
assert.match(drawStartup, /createLeadingAd:\s*createWorkspaceAd/);
assert.doesNotMatch(drawStartup, /visibleIndex === 3/);
assert.doesNotMatch(drawStartup, /!startupWorkspaceSearchQuery && \(visibleIndex \+ 1\) % 8/);

console.log('Card feed ad interval guards passed.');
