import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
await import('../pixiedraw/assets/js/modules/color-codec-utils.js');
const { detectFormat, collectFilesFromHandle, extractPixieeDrawPreviewPng, optimizeGifIntegerScale, readRasterDimensions } = require('../market/listing-package-utils.js');
const file = (name, bytes, type = '') => new File([Uint8Array.from(bytes)], name, { type });
const png = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82];

assert.equal(await detectFormat(file('image.png', png)), 'png');
assert.equal(await detectFormat(file('hero-sprite-sheet.png', png)), 'sprite-sheet-png');
assert.equal(await detectFormat(file('animation.png', [...png, 97, 99, 84, 76])), 'apng');
assert.equal(await detectFormat(file('animation.apng', png)), 'apng');
assert.equal(await detectFormat(file('animation.gif', [71, 73, 70, 56, 57, 97])), 'gif');
assert.equal(await detectFormat(file('image.webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])), 'webp');
assert.equal(await detectFormat(file('project.pixieedraw', [80, 75, 3, 4])), 'pixiedraw-project');
assert.equal(await detectFormat(file('project.pxd', [80, 75, 3, 4])), 'pixiedraw-project');
assert.equal(await detectFormat(file('legacy.pxdraw', [80, 75, 3, 4])), 'pixiedraw-project');
assert.equal(await detectFormat(file('fake.png', [1, 2, 3, 4])), null);
assert.equal(await detectFormat(file('unsupported.psd', [56, 66, 80, 83])), null);
assert.deepEqual(await readRasterDimensions(file('small.png', [...png, 0, 0, 2, 0, 0, 0, 1, 0])), { width: 512, height: 256 });
assert.deepEqual(await readRasterDimensions(file('small.gif', [71, 73, 70, 56, 57, 97, 0, 2, 0, 1])), { width: 512, height: 256 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const gifCodec = window.PiXiEEDrawModules.colorCodecUtils.createColorCodecUtils({
  clamp,
  MAX_IMPORTED_PALETTE_COLORS: 256,
});
const rgbaFrame = (rows) => new Uint8ClampedArray(rows.flatMap((row) => row.flatMap((color) => color)));
const red = [255, 0, 0, 255];
const green = [0, 255, 0, 255];
const blue = [0, 0, 255, 255];
const yellow = [255, 255, 0, 255];
const upscaledFrames = [
  rgbaFrame([
    [red, red, blue, blue],
    [red, red, blue, blue],
  ]),
  rgbaFrame([
    [green, green, yellow, yellow],
    [green, green, yellow, yellow],
  ]),
];
const upscaledGif = new File([
  gifCodec.buildGifFromPixels(upscaledFrames, [80, 140], 4, 2, { loopCount: 3, preserveTiming: true })
], 'upscaled.gif', { type: 'image/gif' });
const optimizedGif = await optimizeGifIntegerScale(upscaledGif);
assert.equal(optimizedGif.optimized, true);
assert.equal(optimizedGif.integerScaleFactor, 2);
assert.equal(optimizedGif.sourceWidth, 4);
assert.equal(optimizedGif.sourceHeight, 2);
assert.equal(optimizedGif.width, 2);
assert.equal(optimizedGif.height, 1);
assert.equal(optimizedGif.frameCount, 2);
assert.equal(optimizedGif.loopCount, 3);
assert.equal(optimizedGif.durationMs, 220);
const optimizedReader = new gifCodec.GifReader(new Uint8Array(await optimizedGif.file.arrayBuffer()));
assert.equal(optimizedReader.width, 2);
assert.equal(optimizedReader.height, 1);
assert.equal(optimizedReader.numFrames(), 2);
assert.equal(optimizedReader.loopCount(), 3);

const scaleFourFrame = rgbaFrame(Array.from({ length: 4 }, () => [
  red, red, red, red, blue, blue, blue, blue,
]));
const scaleTwoFrame = rgbaFrame([
  [red, red, green, green, blue, blue, yellow, yellow],
  [red, red, green, green, blue, blue, yellow, yellow],
  [yellow, yellow, blue, blue, green, green, red, red],
  [yellow, yellow, blue, blue, green, green, red, red],
]);
const mixedScaleGif = new File([
  gifCodec.buildGifFromPixels([scaleFourFrame, scaleTwoFrame], [100, 100], 8, 4, { preserveTiming: true })
], 'mixed-scale.gif', { type: 'image/gif' });
const optimizedMixedScale = await optimizeGifIntegerScale(mixedScaleGif);
assert.equal(optimizedMixedScale.optimized, true);
assert.equal(optimizedMixedScale.integerScaleFactor, 2, 'all frames use their greatest common exact scale');
assert.equal(optimizedMixedScale.width, 4);
assert.equal(optimizedMixedScale.height, 2);

const nativeGif = new File([
  gifCodec.buildGifFromPixels([new Uint8ClampedArray([...red, ...blue])], [100], 2, 1, { preserveTiming: true })
], 'native.gif', { type: 'image/gif' });
const unchangedNativeGif = await optimizeGifIntegerScale(nativeGif);
assert.equal(unchangedNativeGif.optimized, false);
assert.equal(unchangedNativeGif.reason, 'native-scale');
assert.equal(unchangedNativeGif.file, nativeGif);

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

const zipText = JSON.stringify({ format: 'pxd', version: 2, previewThumbnail: previewDataUrl });
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
const v2Preview = await extractPixieeDrawPreviewPng(new File([zipHeader, zipData], 'v2.pxd'));
assert.equal(v2Preview?.type, 'image/png');
const legacyZipData = new TextEncoder().encode(JSON.stringify({ format: 'pixieedraw', version: 2, previewThumbnail: previewDataUrl }));
const legacyZipHeader = new Uint8Array(30 + zipName.length);
const legacyZipView = new DataView(legacyZipHeader.buffer);
legacyZipView.setUint32(0, 0x04034b50, true);
legacyZipView.setUint16(8, 0, true);
legacyZipView.setUint32(18, legacyZipData.length, true);
legacyZipView.setUint32(22, legacyZipData.length, true);
legacyZipView.setUint16(26, zipName.length, true);
legacyZipHeader.set(zipName, 30);
const legacyV2Preview = await extractPixieeDrawPreviewPng(new File([legacyZipHeader, legacyZipData], 'legacy-v2.pixieedraw'));
assert.equal(legacyV2Preview?.type, 'image/png');

const sell = fs.readFileSync(new URL('../market/sell.js', import.meta.url), 'utf8');
const sellHtml = fs.readFileSync(new URL('../market/sell.html', import.meta.url), 'utf8');
const item = fs.readFileSync(new URL('../market/item.js', import.meta.url), 'utf8');
const listingMigration = fs.readFileSync(new URL('../supabase/migrations/20260717140000_market_auto_formats_and_license_options.sql', import.meta.url), 'utf8');
const optionPricingMigration = fs.readFileSync(new URL('../supabase/migrations/20260719210000_market_option_pricing.sql', import.meta.url), 'utf8');
const sharedAd = fs.readFileSync(new URL('./bottom-nav-footer-ad.js', import.meta.url), 'utf8');
assert.match(sell, /bindLocalUi\(\);\s*initRemote\(\);/);
assert.match(sell, /PiXiEEDMarketPageAccess/);
assert.match(sell, /access\?\.allowed/);
assert.match(sell, /webkitGetAsEntry/);
assert.match(sell, /getAsFileSystemHandle/);
assert.match(sell, /extractPixieeDrawPreviewPng/);
assert.match(sell, /optimizeGifIntegerScale/);
assert.match(sell, /sourceOptimizations/);
assert.match(sell, /source_sha256: sourceSha256/);
assert.match(sell, /previewStorageFormat/);
assert.match(sell, /mimeType: 'image\/png'/);
assert.match(sell, /detectedEntries = detected;/);
assert.match(sell, /現在出品対象外/);
assert.match(sell, /PiXiEED SAMPLE/);
assert.match(sell, /MAX_SAMPLE_PREVIEWS = 6/);
assert.match(sell, /MAX_RASTER_DIMENSION = 512/);
assert.match(sell, /readRasterDimensions/);
assert.match(sell, /512×512pxを超える画像素材/);
assert.match(sellHtml, /id="listingDropZone"/);
assert.match(sellHtml, /id="listingPreviewGrid"/);
assert.match(sellHtml, /id="listingOptionDetails"/);
assert.match(sellHtml, /id="listingOptionPriceFields"/);
assert.match(sellHtml, /id="listingSourcePicker"/);
assert.match(sellHtml, /id="listingSourceDialog"/);
assert.match(sellHtml, /id="listingTotalPrice"/);
const colorCodecScriptIndex = sellHtml.indexOf('color-codec-utils.js');
const listingPackageScriptIndex = sellHtml.indexOf('listing-package-utils.js');
const sellScriptIndex = sellHtml.indexOf('sell.js');
assert.ok(colorCodecScriptIndex >= 0 && colorCodecScriptIndex < listingPackageScriptIndex && listingPackageScriptIndex < sellScriptIndex);
assert.doesNotMatch(sellHtml, /id="listingBasePrice"/);
assert.doesNotMatch(sellHtml, /id="listingMinimumPrice"/);
assert.doesNotMatch(sellHtml, /id="listingDerivativePrice"/);
const sellHtmlIds = new Set(Array.from(sellHtml.matchAll(/id="([^"]+)"/g), (match) => match[1]));
const sellElementRefs = Array.from(sell.matchAll(/\$\('([^']+)'\)/g), (match) => match[1]);
assert.deepEqual(Array.from(new Set(sellElementRefs.filter((id) => !sellHtmlIds.has(id)))), []);
assert.match(sell, /input_option_prices:/);
assert.match(sell, /input_sale_price_yen: sellerPriceForRpc/);
assert.match(sell, /market_create_root_asset_v7/);
assert.doesNotMatch(sell, /input_base_use_price_yen/);
assert.doesNotMatch(sell, /input_derivative_license_price_yen/);
assert.match(item, /改変した素材を独立商品として再販売可能/);
assert.match(item, /系列ロイヤリティーあり/);
assert.match(listingMigration, /market_asset_series_no_derivative_license_fee/);
assert.match(listingMigration, /option price must be an integer between its minimum and 10000000 yen/);
assert.match(listingMigration, /input_option_prices jsonb/);
assert.doesNotMatch(listingMigration, /input_base_use_price_yen/);
assert.match(listingMigration, /input_sale_price_yen \+ v_required_option_price/);
assert.match(optionPricingMigration, /market_create_root_asset_v7/);
assert.match(optionPricingMigration, /100 yen increments/i);
assert.match(sharedAd, /window\.location\.protocol === 'file:'/);
assert.match(sharedAd, /slotRect\.width < 1 \|\| slotRect\.height < 1/);

console.log('market listing package detection: OK');
