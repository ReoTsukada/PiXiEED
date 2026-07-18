import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const marketHtml = read('market/index.html');
const itemHtml = read('market/item.html');
const marketJs = read('market/market.js');
const itemJs = read('market/item.js');
const adsJs = read('market/market-ads.js');
const css = read('market/market.css');

assert.match(marketHtml, /market-ads\.js/);
assert.match(itemHtml, /market-ads\.js/);
assert.match(itemHtml, /data-ad-slot="9279466474"/);
assert.match(itemHtml, /data-ad-client="ca-pub-9801602250480253"/);
assert.ok(itemHtml.indexOf('id="marketItemAd"') > itemHtml.indexOf('</article>'), '詳細広告は商品記事の後に配置する');
assert.match(marketJs, /children\.splice\(8, 0, listAd\)/);
assert.match(adsJs, /const LIST_SLOT = '5001430253'/);
assert.match(adsJs, /const DETAIL_SLOT = '9279466474'/);
assert.match(adsJs, /dataset\.fullWidthResponsive = 'true'/);
assert.match(adsJs, /IntersectionObserver/);
assert.match(adsJs, /getBoundingClientRect\(\)\.width < 1/);
assert.match(adsJs, /PiXiEEDAdAccountControl\.loadAdsense/);
assert.match(adsJs, /__PIXIEED_AD_FREE_ACCOUNT__/);
assert.match(itemJs, /PiXiEEDMarketAds\?\.showDetailAd/);
assert.match(css, /\.market-ad--list\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/);
assert.match(css, /html\[data-pixieed-ad-free-account="true"\]\s+\.market-ad/);
assert.equal((marketHtml.match(/pagead2\.googlesyndication\.com/g) || []).length, 0, '一覧HTMLでAdSense本体を重複読み込みしない');
assert.equal((itemHtml.match(/pagead2\.googlesyndication\.com/g) || []).length, 0, '詳細HTMLでAdSense本体を重複読み込みしない');

console.log('market ad slot checks passed');
