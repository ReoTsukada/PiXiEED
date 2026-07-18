import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { detectFormat, collectFilesFromHandle, extractPixieeDrawPreviewPng } = require('../market/listing-package-utils.js');
const file = (name, bytes, type = '') => new File([Uint8Array.from(bytes)], name, { type });
const png = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82];

assert.equal(await detectFormat(file('image.png', png)), 'png');
assert.equal(await detectFormat(file('hero-sprite-sheet.png', png)), 'sprite-sheet-png');
assert.equal(await detectFormat(file('animation.png', [...png, 97, 99, 84, 76])), 'apng');
assert.equal(await detectFormat(file('animation.apng', png)), 'apng');
assert.equal(await detectFormat(file('animation.gif', [71, 73, 70, 56, 57, 97])), 'gif');
assert.equal(await detectFormat(file('image.webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])), 'webp');
assert.equal(await detectFormat(file('project.pixieedraw', [80, 75, 3, 4])), 'pixiedraw-project');
assert.equal(await detectFormat(file('fake.png', [1, 2, 3, 4])), null);
assert.equal(await detectFormat(file('unsupported.psd', [56, 66, 80, 83])), null);

const nestedFile = file('nested.txt', [1, 2, 3], 'text/plain');
const nestedHandle = { kind: 'file', name: nestedFile.name, getFile: async () => nestedFile };
const directoryHandle = {
  kind: 'directory',
  name: 'assets',
  async *values() { yield nestedHandle; }
};
const handledFiles = await collectFilesFromHandle(directoryHandle);
assert.equal(handledFiles.length, 1);
assert.equal(handledFiles[0].path, 'assets/nested.txt');
assert.equal(handledFiles[0].file, nestedFile);

const previewDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const legacyPreview = await extractPixieeDrawPreviewPng(new File([
  JSON.stringify({ previewThumbnail: previewDataUrl })
], 'legacy.pixieedraw'));
assert.equal(legacyPreview?.type, 'image/png');

const zipText = JSON.stringify({ format: 'pixieedraw', version: 2, previewThumbnail: previewDataUrl });
const zipName = new TextEncoder().encode('manifest.json');
const zipData = new TextEncoder().encode(zipText);
const zipHeader = new Uint8Array(30 + zipName.length);
const zipView = new DataView(zipHeader.buffer);
zipView.setUint32(0, 0x04034b50, true);
zipView.setUint16(8, 0, true);
zipView.setUint32(18, zipData.length, true);
zipView.setUint32(22, zipData.length, true);
zipView.setUint16(26, zipName.length, true);
zipHeader.set(zipName, 30);
const v2Preview = await extractPixieeDrawPreviewPng(new File([zipHeader, zipData], 'v2.pixieedraw'));
assert.equal(v2Preview?.type, 'image/png');

const sell = fs.readFileSync(new URL('../market/sell.js', import.meta.url), 'utf8');
const sellHtml = fs.readFileSync(new URL('../market/sell.html', import.meta.url), 'utf8');
const item = fs.readFileSync(new URL('../market/item.js', import.meta.url), 'utf8');
const listingMigration = fs.readFileSync(new URL('../supabase/migrations/20260717140000_market_auto_formats_and_license_options.sql', import.meta.url), 'utf8');
const sharedAd = fs.readFileSync(new URL('./bottom-nav-footer-ad.js', import.meta.url), 'utf8');
assert.match(sell, /bindLocalUi\(\);\s*initRemote\(\);/);
assert.match(sell, /PiXiEEDMarketDevAccess/);
assert.match(sell, /access\?\.allowed/);
assert.match(sell, /webkitGetAsEntry/);
assert.match(sell, /getAsFileSystemHandle/);
assert.match(sell, /extractPixieeDrawPreviewPng/);
assert.match(sell, /previewStorageFormat/);
assert.match(sell, /mimeType: 'image\/png'/);
assert.match(sell, /detectedEntries = detected;/);
assert.match(sell, /現在出品対象外/);
assert.match(sell, /PiXiEED SAMPLE/);
assert.match(sell, /MAX_SAMPLE_PREVIEWS = 6/);
assert.match(sellHtml, /id="listingDropZone"/);
assert.match(sellHtml, /id="listingPreviewGrid"/);
assert.match(sellHtml, /id="listingOptionDetails"/);
assert.match(sellHtml, /id="listingOptionPriceFields"/);
assert.match(sellHtml, /id="listingSourcePicker"/);
assert.match(sellHtml, /id="listingSourceDialog"/);
assert.match(sellHtml, /id="listingTotalPrice"/);
assert.doesNotMatch(sellHtml, /id="listingBasePrice"/);
assert.doesNotMatch(sellHtml, /id="listingMinimumPrice"/);
assert.doesNotMatch(sellHtml, /id="listingDerivativePrice"/);
const sellHtmlIds = new Set(Array.from(sellHtml.matchAll(/id="([^"]+)"/g), (match) => match[1]));
const sellElementRefs = Array.from(sell.matchAll(/\$\('([^']+)'\)/g), (match) => match[1]);
assert.deepEqual(Array.from(new Set(sellElementRefs.filter((id) => !sellHtmlIds.has(id)))), []);
assert.match(sell, /input_option_prices:/);
assert.match(sell, /input_sale_price_yen: salePrice/);
assert.doesNotMatch(sell, /input_base_use_price_yen/);
assert.doesNotMatch(sell, /input_derivative_license_price_yen/);
assert.match(item, /改変した素材を独立商品として再販売可能/);
assert.match(item, /系列ロイヤリティーあり/);
assert.match(listingMigration, /market_asset_series_no_derivative_license_fee/);
assert.match(listingMigration, /option price must be an integer between its minimum and 10000000 yen/);
assert.match(listingMigration, /input_option_prices jsonb/);
assert.doesNotMatch(listingMigration, /input_base_use_price_yen/);
assert.match(listingMigration, /input_sale_price_yen \+ v_required_option_price/);
assert.match(sharedAd, /window\.location\.protocol === 'file:'/);
assert.match(sharedAd, /slotRect\.width < 1 \|\| slotRect\.height < 1/);

console.log('market listing package detection: OK');
